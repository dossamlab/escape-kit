/**
 * 게임 본체: 아이소메트릭 맵 렌더링 + 플레이어 이동 + 오브젝트 상호작용.
 * 퍼즐 내용은 모른다 — 상호작용 시 스토리 앵커 표시/이벤트 발화까지만 책임.
 */
import tokens from "../../../design-tokens.json";
import { TILE_W, TILE_H, worldToScreen, screenDirToWorld, keyDirToWorld } from "./iso";
import { loadSprites, type Sprites } from "./assets";
import { KeyboardInput } from "../input/keyboard";
import { VirtualJoystick, isTouchDevice } from "../input/joystick";
import { showDialogue, isDialogueBusy } from "../narrative/dialogue";
import { showNote } from "../narrative/note";
import { showDiscovery } from "../narrative/discovery";
import { openKeypad } from "../ui/keypad";
import { ITEMS } from "../../data/items";
import {
  ENDING_SUB,
  ENDING_MAIN,
  ENDING_NOTES_COMPLETE,
  ENDING_NOTES_INCOMPLETE,
} from "../../config";
import { showJournal, type NoteMeta } from "../narrative/journal";
import { bus } from "../events/EventBus";
import { openPuzzle } from "../puzzle-host/host";
import { findPuzzle, puzzles } from "../../registry";
import { maps, ROOM_CHAIN } from "../../maps";
import { loadProgress, saveProgress } from "./save";
import { sessionStats } from "./stats";
import { Sfx, isMuted, toggleMuted } from "../audio/sfx";
import type {
  GameMap,
  MapObject,
  DecorItem,
  WallDecorItem,
  SealedArea,
} from "../../maps/types";

// 뒷벽(스프라이트 방) — 가구·캐릭터 배율에 맞춰 세로로만 늘린다.
// 배경 없는 레거시 방 전용이며, 프리렌더 배경 방에서는 쓰이지 않는다.
const WALL_STRETCH = 2;
const WALL_H = 96 * WALL_STRETCH; // 뒷벽 세그먼트의 수직 높이(px) — assets-src/wall-*.svg와 동기

// 봉인 구역 연출 상수.
// SEAL_LIFT: 어둠이 위로 사라지기까지의 높이(월드 px) — 딱딱한 윗변을 만들지 않도록
//   그라데이션으로만 쓴다. 예전엔 이 높이의 기둥 윗면을 마름모로 그렸는데
//   "공중에 뜬 검은 상자"로 읽혔다(실제 제보).
// 300으로 뒀더니 장막이 방 절반 높이라 경계 북쪽 1~2타일의 **열린 구역** 노트·장치까지
// 가려 "봉인 안"처럼 읽혔다(모바일 실측). 차단 신호는 경계 등불선이 담당하므로
// 어둠은 그 뒤 분위기만 — 낮게 깐다.
const SEAL_LIFT = 160;

// 앞가림 구조물(background.occluders)을 덮는 진하기. 1이면 뒤에 선 캐릭터가 완전히 사라져
// "내 캐릭터가 어디 갔지"가 된다 — 잎 사이로 비치는 정도로 남긴다.
const OCCLUDER_ALPHA = 0.68;

// 카메라 줌 — 월드 전체(배경·타일·벽·캐릭터·사물)에 균일 적용해 시야를 넓힌다.
// 에셋 배율을 개별로 줄이면 서로의 비율이 깨지므로, 렌더 좌표계에서 한 번에 축소한다.
// UI(HUD·대사)는 DOM이라 영향 없고, 스파클·암막 반경은 화면 기준을 유지한다.
const CAMERA_ZOOM = 0.5;

const PLAYER_SPEED = 3.2; // 타일/초

export class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private ui: HTMLElement;
  private label: HTMLElement;
  private sprites: Sprites = {};
  private keyboard = new KeyboardInput();
  private joystick: VirtualJoystick | null = null;
  private player: { x: number; y: number };
  private nearObject: MapObject | null = null;
  private dialogueOpen = false;
  private raf = 0;
  private lastT = 0;
  /** 어둠 알파: 1=칠흑, 0=점등. dark 맵에서 시작 시 1, 해제 이벤트 후 서서히 0 */
  private darkness = 0;
  private lit = false;
  /** 봉인 구역 알파: 1=칠흑(닫힘), 0=완전 개방. 해제 이벤트 후 1.5초에 걸쳐 0으로.
   *  0보다 크면 '닫힘'으로 보고 통행·상호작용을 막는다 — 페이드 도중 들어가지 못하게. */
  private sealAlpha = new Map<string, number>();
  /** 발화된 진행 이벤트 (문 해금·점등 조건 판정) */
  private firedEvents = new Set<string>();
  /** 걷기 애니메이션 위상 (이동 중일 때만 증가) — 정수부 짝/홀로 a/b 프레임 교대 */
  private walkPhase = 0;
  private moving = false;
  /**
   * 바라보는 방향 — 정지 시 마지막 방향 유지.
   * 이름은 월드가 아니라 **화면** 기준이다(아이소메트릭이라 둘이 다르다):
   * `s`=화면 아래(카메라 쪽), `n`=화면 위, `e`=오른쪽 … 스프라이트 파일명이 이 이름을 쓴다.
   */
  private facing: (typeof Game.OCTANTS)[number] = "s";
  /** atan2 각도 → 8방향. 인덱스 0이 오른쪽(e), 시계 방향(화면 y는 아래가 +) */
  private static readonly OCTANTS = [
    "e", "se", "s", "sw", "w", "nw", "n", "ne",
  ] as const;
  /** 선택한 캐릭터 (남/여) — 저장에서 복원 */
  private gender: "m" | "f" = loadProgress().character ?? "m";
  /** 전정 감각 배려: 모션 최소화 선호 시 보빙·기울임 생략 */
  private reduceMotion =
    typeof matchMedia !== "undefined" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;
  /** 수집한 연구노트 id */
  private collectedNotes = new Set<string>();
  /** 수색으로 획득한 단서 아이템 id */
  private items = new Set<string>();
  /** 이미 수색한 지점 id (스파클 마커 표시·재수색 안내 판정) */
  private searched = new Set<string>();
  private itemHud!: HTMLElement;
  private totalNotes = 0;
  private allNotes: NoteMeta[] = [];
  private noteCounter!: HTMLElement;

  constructor(
    private host: HTMLElement,
    private map: GameMap,
  ) {
    this.player = { x: map.spawn[0], y: map.spawn[1] };

    this.canvas = document.createElement("canvas");
    this.canvas.dataset.testid = "game-canvas";
    this.canvas.className = "game-canvas";
    host.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d")!;

    // 라벨·조이스틱·대사 오버레이 레이어
    this.ui = document.createElement("div");
    this.ui.className = "game-ui";
    host.appendChild(this.ui);

    this.label = document.createElement("div");
    this.label.className = "interact-label";
    this.label.dataset.testid = "interact-label";
    this.label.hidden = true;
    this.ui.appendChild(this.label);

    this.keyboard.onInteract = () => this.tryInteract();
    // 입력은 스프라이트 로드를 기다리지 않고 즉시 활성화 (로드 중 눌린 키 유실 방지)
    this.detachers.push(this.keyboard.attach());
    if (isTouchDevice()) {
      this.joystick = new VirtualJoystick(this.ui, () => this.tryInteract());
    }

    // 연구노트 메타(id·심화 여부) 전체 목록 — 저널·카운터 공용
    this.allNotes = Object.values(maps).flatMap((m) =>
      m.objects
        .filter((o) => o.noteId)
        .map((o) => ({ id: o.noteId!, advanced: !!o.advanced })),
    );
    this.totalNotes = this.allNotes.length;

    // 연구노트 수집 카운터 HUD (클릭 시 저널 열기)
    this.noteCounter = document.createElement("button");
    this.noteCounter.className = "note-counter";
    this.noteCounter.dataset.testid = "note-counter";
    this.noteCounter.addEventListener("click", () =>
      showJournal(
        this.allNotes,
        this.collectedNotes,
        this.ui,
        puzzles,
        this.firedEvents,
      ),
    );
    this.ui.appendChild(this.noteCounter);

    // 음소거 토글 버튼
    const muteBtn = document.createElement("button");
    muteBtn.className = "mute-button";
    muteBtn.dataset.testid = "mute-button";
    const syncMute = () => (muteBtn.textContent = isMuted() ? "🔇" : "🔊");
    syncMute();
    muteBtn.addEventListener("click", () => {
      toggleMuted();
      syncMute();
      Sfx.select();
    });
    this.ui.appendChild(muteBtn);

    // 저장된 진행 복원 (해금 이벤트·수집 노트·단서 아이템·수색 기록)
    const saved = loadProgress();
    saved.events.forEach((e) => this.firedEvents.add(e));
    saved.notes.forEach((n) => this.collectedNotes.add(n));
    (saved.items ?? []).forEach((i) => this.items.add(i));
    (saved.searched ?? []).forEach((s) => this.searched.add(s));
    this.syncNoteCounter();

    // 인벤토리 HUD — 획득한 단서 아이콘 스트립 (클릭 시 발견 텍스트 재열람)
    this.itemHud = document.createElement("div");
    this.itemHud.className = "item-hud";
    this.itemHud.dataset.testid = "item-hud";
    this.ui.appendChild(this.itemHud);
    this.syncItemHud();

    // 시작 방이 어둠이고 아직 점등 이벤트가 없으면 어둡게
    if (map.dark && !this.firedEvents.has(map.dark.litByEvent)) {
      this.darkness = 1;
    } else {
      this.lit = true;
    }
    this.syncSeals(map);

    // 모든 진행 이벤트(퍼즐 보상·게이트 해금·점등·문 해금)를 한 번에 구독 — 발화 시 저장
    const watch = new Set<string>();
    for (const p of puzzles) {
      watch.add(p.manifest.reward.event);
      if (p.manifest.gate) watch.add(`gate:${p.manifest.id}`);
    }
    for (const m of Object.values(maps)) {
      if (m.dark) watch.add(m.dark.litByEvent);
      for (const s of m.sealed ?? []) s.opensWhen.forEach((e) => watch.add(e));
      for (const o of m.objects)
        if (o.door?.requiresEvent)
          for (const ev of [o.door.requiresEvent].flat()) watch.add(ev);
    }
    watch.forEach((ev) =>
      bus.on(ev, () => {
        this.firedEvents.add(ev);
        // 퍼즐 보상 아이템 — reward.itemId가 있으면 인벤토리에 지급 (3번 방 릴 테이프)
        const rewarded = puzzles.find((p) => p.manifest.reward.event === ev);
        if (
          rewarded?.manifest.reward.itemId &&
          !this.items.has(rewarded.manifest.reward.itemId)
        ) {
          this.items.add(rewarded.manifest.reward.itemId);
          this.syncItemHud();
        }
        if (this.map.dark?.litByEvent === ev) {
          this.lit = true;
          Sfx.lightsOn();
        }
        // 봉인 해제 — 알파는 update()가 깎는다(여기서 0으로 두면 격벽이 툭 사라진다)
        if (
          this.map.sealed?.some(
            (s) => s.opensWhen.includes(ev) && this.sealOpen(s),
          )
        )
          Sfx.lightsOn();
        this.persist();
      }),
    );

    // e2e·디버깅용 상태 노출
    const self = this;
    (window as unknown as Record<string, unknown>).__qe = {
      player: this.player,
      get map() {
        return self.map.id;
      },
      get lit() {
        return self.lit;
      },
      get events() {
        return [...self.firedEvents];
      },
      get notes() {
        return [...self.collectedNotes];
      },
      /** 조사한 수색 지점 id — e2e가 "실제로 조사됐는지"를 텍스트 대신 상태로 본다 */
      get searched() {
        return [...self.searched];
      },
      /** 봉인 구역 알파 (1=칠흑, 0=완전 개방) — e2e가 페이드 진행을 관측한다 */
      get seals(): Record<string, number> {
        return Object.fromEntries(self.sealAlpha);
      },
      get items() {
        return [...self.items];
      },
      /** 디버그·캘리브레이션 전용 방 이동 (?grid 모드에서만) */
      goto(mapId: string, x = 6, y = 5) {
        if (!self.debugGrid) return "?grid 모드에서만 사용 가능";
        self.switchMap(mapId, [x, y]);
        return mapId;
      },
      /** e2e·디버그 전용 워프 — 대상 방 '이전'의 층 사슬 이벤트를 전부 발화시키고 이동.
       *  사슬은 maps/index.ts의 ROOM_CHAIN 데이터에서 온다 (방 추가 시 여기 수정 불필요).
       *  (?grid 모드에서만. 대상 방 자신의 보상 이벤트는 발화하지 않는다) */
      warp(mapId: string) {
        if (!self.debugGrid) return "?grid 모드에서만 사용 가능";
        const idx = ROOM_CHAIN.findIndex((r) => r.id === mapId);
        if (idx < 0) return `알 수 없는 맵: ${mapId}`;
        for (let i = 0; i < idx; i++) bus.emit(ROOM_CHAIN[i].unlockEvent);
        self.switchMap(mapId, maps[mapId].spawn);
        return mapId;
      },
    };
  }

  private syncItemHud(): void {
    this.itemHud.replaceChildren(
      ...[...this.items].map((id) => {
        const def = ITEMS[id];
        const chip = document.createElement("button");
        chip.className = "item-chip";
        chip.dataset.testid = `item-${id}`;
        chip.title = def?.name ?? id;
        chip.textContent = def?.emoji ?? "?";
        chip.addEventListener("click", () => {
          if (this.dialogueOpen || isDialogueBusy() || !def) return;
          this.dialogueOpen = true;
          void showDiscovery(def.anchor, undefined, this.ui).then(() => {
            this.dialogueOpen = false;
          });
        });
        return chip;
      }),
    );
  }

  private syncNoteCounter(): void {
    this.noteCounter.textContent = `연구노트 ${this.collectedNotes.size} / ${this.totalNotes}`;
  }

  private persist(): void {
    saveProgress({
      events: [...this.firedEvents],
      notes: [...this.collectedNotes],
      items: [...this.items],
      searched: [...this.searched],
      lastMap: this.map.id,
      character: this.gender,
    });
  }

  private switchMap(toMap: string, spawn: [number, number]): void {
    const next = maps[toMap];
    if (!next) {
      console.warn(`[game] 알 수 없는 맵: ${toMap}`);
      return;
    }
    this.map = next;
    this.player.x = spawn[0];
    this.player.y = spawn[1];
    this.nearObject = null;
    if (next.dark && !this.firedEvents.has(next.dark.litByEvent)) {
      this.darkness = 1;
      this.lit = false;
    } else {
      this.darkness = 0;
      this.lit = true;
    }
    this.syncSeals(next);
    this.persist();
    bus.emit(`map:enter:${next.id}`);
  }

  /** 봉인 해제 조건 충족 여부 — opensWhen의 이벤트가 **전부** 발화했는가 */
  private sealOpen(s: SealedArea): boolean {
    return s.opensWhen.every((e) => this.firedEvents.has(e));
  }

  /** 방 진입 시 봉인 알파 초기화 — 이미 열린 구역은 0, 아직이면 1(칠흑) */
  private syncSeals(map: GameMap): void {
    this.sealAlpha.clear();
    for (const s of map.sealed ?? []) {
      this.sealAlpha.set(s.id, this.sealOpen(s) ? 0 : 1);
    }
  }

  /**
   * 봉인 구역 안인가. `minAlpha`보다 진한 덮개가 덮고 있을 때만 true.
   * - 통행·상호작용은 기본값(0) — 페이드가 끝나기 전엔 못 들어간다.
   * - 렌더는 0.999 — **완전히 닫혔을 때만** 그리기를 건너뛴다. 페이드 중에는 그려 두고
   *   덮개가 얇아지면서 함께 드러나게 한다(α=0에서 툭 나타나던 것을 고쳤다).
   */
  private isSealed(x: number, y: number, minAlpha = 0): boolean {
    for (const s of this.map.sealed ?? []) {
      if ((this.sealAlpha.get(s.id) ?? 0) <= minAlpha) continue;
      for (const a of s.area) {
        if (x >= a.x0 && x <= a.x1 && y >= a.y0 && y <= a.y1) return true;
      }
    }
    return false;
  }

  /** 통행 불가 판정 — 맵의 blocks 사각형(타일 좌표) 안이거나 봉인 구역 안이면 true */
  private isBlocked(x: number, y: number): boolean {
    for (const b of this.map.blocks ?? []) {
      if (x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1) return true;
    }
    return this.isSealed(x, y);
  }

  private isDoorLocked(obj: MapObject): boolean {
    const need = obj.door?.requiresEvent;
    if (!need) return false;
    return ![need].flat().every((ev) => this.firedEvents.has(ev));
  }

  /** 에필로그: 최종 문 개방 — 연구노트 완주 여부로 분기.
   *  앵커는 **방마다 다르다**(GameMap.epilogue). 없으면 아래 기본 앵커. */
  private async playEnding(): Promise<void> {
    const ep = this.map.epilogue ?? {
      open: "#epilogue-open",
      notesComplete: "#epilogue-notes-complete",
      notesIncomplete: "#epilogue-notes-incomplete",
    };
    await showDialogue(ep.open, this.ui);
    // 완주 판정은 **이 방의 노트**로 한다 — 전체 노트로 재면 뒤 방에서 영영 완주가 안 된다
    const roomNotes = this.map.objects
      .filter((o) => o.noteId)
      .map((o) => o.noteId!);
    const complete =
      roomNotes.length > 0 &&
      roomNotes.every((n) => this.collectedNotes.has(n));
    await showDialogue(
      complete ? ep.notesComplete : ep.notesIncomplete,
      this.ui,
    );
    const screen = document.createElement("div");
    screen.className = "ending-screen";
    screen.dataset.testid = "ending-screen";
    const sub = document.createElement("div");
    sub.className = "title-sub";
    sub.textContent = ENDING_SUB;
    const main = document.createElement("h1");
    main.className = "title-main";
    main.textContent = ENDING_MAIN;
    const hint = document.createElement("p");
    hint.className = "ending-hint";
    hint.textContent = complete ? ENDING_NOTES_COMPLETE : ENDING_NOTES_INCOMPLETE;

    // 이번 플레이 통계 (세션 한정 — 이어하기 시간은 포함되지 않는다)
    const stats = document.createElement("div");
    stats.className = "ending-stats";
    stats.dataset.testid = "ending-stats";
    const ms = sessionStats.playMs();
    const mm = Math.floor(ms / 60000);
    const ss = String(Math.floor((ms % 60000) / 1000)).padStart(2, "0");
    const statNotes = document.createElement("p");
    statNotes.textContent = `연구노트 ${this.collectedNotes.size} / ${this.totalNotes}`;
    const statPlay = document.createElement("p");
    statPlay.textContent = `힌트 ${sessionStats.hintsUsed}회 · 오답 ${sessionStats.fails}회 · 이번 플레이 ${mm}:${ss}`;
    stats.append(statNotes, statPlay);

    const actions = document.createElement("div");
    actions.className = "ending-actions";
    if (!complete) {
      const cont = document.createElement("button");
      cont.className = "ending-button";
      cont.dataset.testid = "ending-continue-button";
      cont.textContent = "돌아가서 노트 찾기";
      cont.addEventListener("click", () => {
        screen.remove();
        this.dialogueOpen = false; // 엔딩 화면이 걸어둔 잠금 해제 — 균형의 방에서 재개
      });
      actions.appendChild(cont);
    }
    const toTitle = document.createElement("button");
    toTitle.className = "ending-button";
    toTitle.dataset.testid = "ending-title-button";
    toTitle.textContent = "타이틀로";
    toTitle.addEventListener("click", () => location.reload());
    actions.appendChild(toTitle);

    screen.append(sub, main, hint, stats, actions);
    this.ui.appendChild(screen);
    bus.emit("game:ending");
    // dialogueOpen을 유지해 조작 잠금 (엔딩 화면) — '돌아가서'는 화면 제거와 함께 해제
  }

  async start(): Promise<void> {
    this.sprites = await loadSprites();
    const onResize = () => this.resize();
    window.addEventListener("resize", onResize);
    this.detachers.push(() => window.removeEventListener("resize", onResize));
    this.resize();
    this.lastT = performance.now();
    const loop = (t: number) => {
      const dt = Math.min((t - this.lastT) / 1000, 0.05);
      this.lastT = t;
      this.update(dt);
      this.render();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    // 첫 방도 '방에 들어선' 것이다 — switchMap과 같은 신호를 쏜다.
    // 이게 없으면 방 수준 연출(룸 오디오·HUD·인트로)이 **첫 방에서만** 죽는다.
    // 구독자는 `new Game(...)` 전에 등록해야 이 발화를 받는다 (main.ts 참조).
    bus.emit(`map:enter:${this.map.id}`);
  }

  private detachers: (() => void)[] = [];

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.detachers.forEach((d) => d());
    this.joystick?.destroy();
    this.canvas.remove();
    this.ui.remove();
  }

  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = this.host.clientWidth * dpr;
    this.canvas.height = this.host.clientHeight * dpr;
    // 줌을 좌표계에 녹여 넣는다 — 이후 렌더 코드는 "줌 좌표"(뷰포트 = clientW/ZOOM)로 그린다
    this.ctx.setTransform(dpr * CAMERA_ZOOM, 0, 0, dpr * CAMERA_ZOOM, 0, 0);
    // 픽셀아트 크리스프 렌더 — 캔버스 리사이즈마다 리셋되므로 매번 재설정
    this.ctx.imageSmoothingEnabled = false;
  }

  private update(dt: number): void {
    // 점등 연출: 어둠이 1.8초에 걸쳐 걷힌다
    if (this.lit && this.darkness > 0) {
      this.darkness = Math.max(0, this.darkness - dt / 1.8);
    }
    // 봉인 해제 연출: 격벽이 1.5초에 걸쳐 걷힌다. 0이 되기 전에는 여전히 '닫힘'이라
    // 페이드 도중 걸어 들어가지 못한다 (isSealed가 알파 > 0을 닫힘으로 본다).
    for (const s of this.map.sealed ?? []) {
      const a = this.sealAlpha.get(s.id) ?? 0;
      if (a > 0 && this.sealOpen(s)) {
        this.sealAlpha.set(s.id, Math.max(0, a - dt / 1.5));
      }
    }
    // 근접 오브젝트 판정 — 범위 안에서 "가장 가까운" 것 선택 (수색 지점이 촘촘해
    // 여러 개가 동시에 범위에 들 수 있음). 대사 중에도 항상 갱신.
    let best: MapObject | null = null;
    let bestD = Infinity;
    for (const o of this.map.objects) {
      if (this.isSealed(o.tile[0], o.tile[1])) continue; // 봉인 안 장치는 라벨도 안 뜬다
      const d = Math.hypot(
        this.player.x - o.tile[0],
        this.player.y - o.tile[1],
      );
      if (d <= o.range && d < bestD) {
        bestD = d;
        best = o;
      }
    }
    this.nearObject = best;

    // 대사·퍼즐·저널 중엔 이동 정지 (스토리 진행 대사 포함 — isDialogueBusy)
    if (this.dialogueOpen || isDialogueBusy() || this.isJournalOpen()) {
      this.moving = false;
      this.walkPhase = 0;
      return;
    }

    // 키보드·조이스틱 화면 방향 → 월드 방향
    const [kx, ky] = this.keyboard.direction();
    const [jx, jy] = this.joystick?.direction() ?? [0, 0];
    const sx = kx + jx;
    const sy = ky + jy;
    this.moving = sx !== 0 || sy !== 0;
    if (this.moving) {
      // 방향키는 8칸으로 스냅해 **대각이 방의 축을 따르게** 하고(iso.ts 주석),
      // 조이스틱은 연속 방향 그대로 — 스틱은 26.57°든 뭐든 겨눈 대로 간다.
      const [wx, wy] =
        kx !== 0 || ky !== 0 ? keyDirToWorld(kx, ky) : screenDirToWorld(jx, jy);
      const margin = 0.4;
      // 축 분리 이동 + 통행 불가(blocks) 판정 — 막힌 축만 취소해 벽면을 따라 미끄러진다
      const nx = Math.min(
        this.map.cols - 1 - margin,
        Math.max(margin, this.player.x + wx * PLAYER_SPEED * dt),
      );
      const ny = Math.min(
        this.map.rows - 1 - margin,
        Math.max(margin, this.player.y + wy * PLAYER_SPEED * dt),
      );
      if (!this.isBlocked(nx, this.player.y)) this.player.x = nx;
      if (!this.isBlocked(this.player.x, ny)) this.player.y = ny;
      this.walkPhase += dt * 7; // 걷기 프레임 속도 (초당 약 3.5회 교대)
      // 화면 이동 방향을 45°씩 8칸으로 나눈다 (화면 y는 아래가 +).
      // 위·아래 키가 정면/후면(n·s)을, 대각이 ¾ 뷰(ne·nw·se·sw)를 고른다.
      this.facing = Game.OCTANTS[
        Math.round(Math.atan2(sy, sx) / (Math.PI / 4)) & 7
      ];
    } else {
      this.walkPhase = 0;
    }
  }

  /**
   * 저널이 떠 있는가 — 저널은 HUD 클릭으로 열려 dialogueOpen 잠금 밖이므로 DOM으로 판정.
   * 저널 안에서 연 노트·원리 카드를 E/Space로 닫는 키가 메인 화면 상호작용으로
   * 새어 들어가는 것을 막는다. (오버레이가 어떤 경로로 사라져도 잠금이 남지 않는다)
   */
  private isJournalOpen(): boolean {
    return this.ui.querySelector(".journal-overlay") !== null;
  }

  private tryInteract(): void {
    // 대사가 떠 있는 동안 상호작용 금지 — E/Space로 대사를 넘기는 키 입력이
    // 같은 프레임에 퍼즐을 열어 대사 박스가 겹치는 문제 방지
    if (
      this.dialogueOpen ||
      isDialogueBusy() ||
      this.isJournalOpen() ||
      !this.nearObject
    )
      return;
    const obj = this.nearObject;
    bus.emit(`interact:${obj.id}`, obj);
    this.dialogueOpen = true;

    // 수색 지점: 발견 오버레이 (+아이템 획득).
    // 재수색도 단서 원문을 그대로 다시 보여준다 — 메모를 다시 못 읽으면 코드를
    // 손으로 받아적어야 하므로. 대신 아이템은 한 번만 주고 "새로울 건 없다" 안내를 덧붙인다.
    if (obj.search) {
      const search = obj.search;
      const already = this.searched.has(obj.id);
      const gotItem = already ? undefined : search.itemId;
      const footer = already ? "#search-already" : undefined;
      void showDiscovery(search.anchor, gotItem, this.ui, footer).then(() => {
        if (!already) {
          this.searched.add(obj.id);
          if (search.itemId) {
            this.items.add(search.itemId);
            this.syncItemHud();
          }
          this.persist();
        }
        this.dialogueOpen = false;
      });
      return;
    }

    // 연구노트: 열람 + 수집
    if (obj.noteId) {
      const noteId = obj.noteId;
      void showNote(noteId, !!obj.advanced, this.ui).then(() => {
        this.collectedNotes.add(noteId);
        this.syncNoteCounter();
        this.persist();
        this.dialogueOpen = false;
      });
      return;
    }

    // 문: 잠김이면 안내 대사, 엔딩 문이면 에필로그, 아니면 방 이동
    if (obj.door) {
      if (this.isDoorLocked(obj)) {
        Sfx.error();
        void showDialogue(
          obj.interactAnchor ?? "#sys-door-locked",
          this.ui,
        ).then(() => {
          this.dialogueOpen = false;
        });
      } else if (obj.door.ending) {
        Sfx.door();
        void this.playEnding();
      } else if (obj.door.toMap && obj.door.spawn) {
        Sfx.door();
        this.switchMap(obj.door.toMap, obj.door.spawn);
        this.dialogueOpen = false;
      }
      return;
    }

    const puzzle = obj.puzzleId ? findPuzzle(obj.puzzleId) : undefined;

    // 방탈출 게이트: 해금 전에는 키패드(코드형) 또는 잠김 대사(아이템형 미충족)
    const gate = puzzle?.manifest.gate;
    if (puzzle && gate && !this.firedEvents.has(`gate:${puzzle.manifest.id}`)) {
      void this.tryUnlockGate(puzzle.manifest.id, gate).then((unlocked) => {
        this.dialogueOpen = false;
        if (unlocked) this.tryInteract(); // 해금 직후 바로 퍼즐 진입
      });
      return;
    }

    // 2막: 방 하나에 스테이션이 여러 개라 '막 인트로' 대신 **장치별 도입 대사**를 쓴다.
    // 처음 여는 장치에서 한 번만 (세션 한정 — 이어하기 시 다시 들으면 오히려 친절하다).
    if (puzzle && !this.puzzleIntroShown.has(puzzle.manifest.id)) {
      this.puzzleIntroShown.add(puzzle.manifest.id);
      const intro = puzzle.manifest.narrative.intro;
      void showDialogue(intro, this.ui)
        .then(() => openPuzzle(puzzle, this.ui))
        .then(() => {
          this.dialogueOpen = false;
        });
      return;
    }

    const done = puzzle
      ? openPuzzle(puzzle, this.ui)
      : showDialogue(obj.interactAnchor ?? "#sys-console-locked", this.ui);
    void Promise.resolve(done).then(() => {
      this.dialogueOpen = false;
    });
  }

  /** 장치 도입 대사를 이미 본 퍼즐 (세션 한정) */
  private puzzleIntroShown = new Set<string>();

  /** ?grid — 캘리브레이션용 디버그 모드 (__qe.goto 등이 열린다) */
  private debugGrid =
    typeof location !== "undefined" &&
    new URLSearchParams(location.search).has("grid");
  /** 격자 오버레이 표시 — ?grid=0 이면 디버그 기능만 켜고 선은 그리지 않는다
   *  (접지·크기 확인처럼 화면을 있는 그대로 봐야 하는 스크린샷용) */
  private showGrid =
    this.debugGrid &&
    !["0", "off", "false"].includes(
      new URLSearchParams(location.search).get("grid") ?? "",
    );

  /** 설치 패드 — 장치 밑에 까는 아이소 받침대(콘크리트 기초판).
   *  AI 생성 스프라이트에는 다리·받침이 없어서 그림자만으로는 접지가 읽히지 않는다.
   *  타일과 같은 2:1 기울기의 바닥 평면 도형을 깔아야 "바닥에 설치된 것"으로 보인다.
   *  (cx, cy) = 타일 중심. padW = 패드 폭(월드 px) — 폭 w인 마름모의 세로 지름은 w/2다.
   *  **스프라이트보다 확실히 넓어야 한다** — 폭이 같으면 그 마름모가 곧 스프라이트 자신의
   *  발자국이라 통째로 뒤에 가려 아무것도 보이지 않는다. */
  private drawGroundPad(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    padW: number,
  ): void {
    const hw = padW / 2; // 동/서 꼭짓점까지
    const hh = padW / 4; // 남/북 꼭짓점까지 (2:1 투영)
    const t = Math.max(4, padW * 0.028); // 기초판 두께

    const face = (dy: number) => {
      ctx.beginPath();
      ctx.moveTo(cx, cy - hh + dy);
      ctx.lineTo(cx + hw, cy + dy);
      ctx.lineTo(cx, cy + hh + dy);
      ctx.lineTo(cx - hw, cy + dy);
      ctx.closePath();
    };

    ctx.save();
    // 바닥에 번지는 그늘 — 패드 자체의 그림자
    face(t * 1.6);
    ctx.fillStyle = "rgba(0,0,0,0.34)";
    ctx.fill();
    // 측면(두께) — 서→남→동 앞쪽 두 변만 보인다
    ctx.beginPath();
    ctx.moveTo(cx - hw, cy);
    ctx.lineTo(cx, cy + hh);
    ctx.lineTo(cx + hw, cy);
    ctx.lineTo(cx + hw, cy + t);
    ctx.lineTo(cx, cy + hh + t);
    ctx.lineTo(cx - hw, cy + t);
    ctx.closePath();
    ctx.fillStyle = "rgba(14,20,28,0.88)";
    ctx.fill();
    // 윗면 — 뒤가 밝고 앞이 어두운 금속/콘크리트 면
    face(0);
    const g = ctx.createLinearGradient(cx, cy - hh, cx, cy + hh);
    g.addColorStop(0, "rgba(158,176,196,0.42)");
    g.addColorStop(1, "rgba(92,108,126,0.30)");
    ctx.fillStyle = g;
    ctx.fill();
    // 뒤쪽 두 변에 림 하이라이트 — 평면이 바닥에서 살짝 솟았음을 드러낸다
    ctx.beginPath();
    ctx.moveTo(cx - hw, cy);
    ctx.lineTo(cx, cy - hh);
    ctx.lineTo(cx + hw, cy);
    ctx.strokeStyle = "rgba(206,222,240,0.42)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  /** 접지 그림자 — 바닥에 서 있는 장치의 밑변에 깔리는 납작한 타원.
   *  배경 그림의 가구에는 그림자가 그려져 있는데 스프라이트 장치에는 없어서
   *  혼자 공중에 뜬 것처럼 보였다. (cx, footY) = 스프라이트 밑변 중앙.
   *  k = 진하기 — 설치 패드 위에 겹칠 때는 약하게 줘야 얼룩처럼 보이지 않는다. */
  private drawContactShadow(
    ctx: CanvasRenderingContext2D,
    cx: number,
    footY: number,
    spriteW: number,
    k = 1,
  ): void {
    // 배경 바닥이 어두워서 넓고 옅은 그림자는 보이지 않는다 — 밑변에 바짝 붙는
    // 좁고 진한 코어 + 짧은 감쇠로 접지선을 만든다.
    const r = spriteW * 0.36 * (0.6 + 0.4 * k);
    ctx.save();
    ctx.translate(cx, footY - TILE_H / 8);
    ctx.scale(1, 0.5); // 아이소 2:1 — 원을 눌러 타원으로
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, `rgba(0,0,0,${0.62 * k})`);
    g.addColorStop(0.5, `rgba(0,0,0,${0.46 * k})`);
    g.addColorStop(0.8, `rgba(0,0,0,${0.16 * k})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawDebugGrid(
    ctx: CanvasRenderingContext2D,
    ox: number,
    oy: number,
  ): void {
    ctx.save();
    ctx.strokeStyle = "rgba(255,80,80,0.55)";
    ctx.lineWidth = 1;
    for (let y = 0; y < this.map.rows; y++) {
      for (let x = 0; x < this.map.cols; x++) {
        const [sx, sy] = worldToScreen(x, y);
        ctx.beginPath();
        ctx.moveTo(ox + sx, oy + sy - TILE_H / 2);
        ctx.lineTo(ox + sx + TILE_W / 2, oy + sy);
        ctx.lineTo(ox + sx, oy + sy + TILE_H / 2);
        ctx.lineTo(ox + sx - TILE_W / 2, oy + sy);
        ctx.closePath();
        ctx.stroke();
        if (x % 2 === 0 && y % 2 === 0) {
          ctx.fillStyle = "rgba(255,220,120,0.9)";
          ctx.font = "10px monospace";
          ctx.fillText(`${x},${y}`, ox + sx - 8, oy + sy + 3);
        }
      }
    }
    // 배경 이미지 외곽·중심 표시 (캘리브레이션 기준)
    const bg = this.map.background;
    const bgImg = bg ? this.sprites[bg.sprite] : undefined;
    if (bg && bgImg) {
      const s = bg.scale ?? 1;
      const sy = bg.scaleY ?? s;
      ctx.strokeStyle = "rgba(80,255,120,0.9)";
      ctx.lineWidth = 2;
      ctx.strokeRect(
        ox + bg.offsetX,
        oy + bg.offsetY,
        bgImg.width * s,
        bgImg.height * sy,
      );
      const cx = ox + bg.offsetX + (bgImg.width * s) / 2;
      const cy = oy + bg.offsetY + (bgImg.height * sy) / 2;
      ctx.beginPath();
      ctx.moveTo(cx - 12, cy);
      ctx.lineTo(cx + 12, cy);
      ctx.moveTo(cx, cy - 12);
      ctx.lineTo(cx, cy + 12);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(255,80,80,0.10)";
    for (const b of this.map.blocks ?? []) {
      // 블록 사각형을 아이소 평행사변형으로 근사 표시 (모서리 4점)
      const c = [
        worldToScreen(b.x0, b.y0),
        worldToScreen(b.x1, b.y0),
        worldToScreen(b.x1, b.y1),
        worldToScreen(b.x0, b.y1),
      ];
      ctx.beginPath();
      ctx.moveTo(ox + c[0][0], oy + c[0][1]);
      for (let i = 1; i < 4; i++) ctx.lineTo(ox + c[i][0], oy + c[i][1]);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  /** 게이트 해금 시도 — 코드형: 키패드, 아이템형: 소지 검사. 성공 시 이벤트 발화(저장됨) */
  private async tryUnlockGate(
    puzzleId: string,
    gate: NonNullable<import("../puzzle-host/types").PuzzleManifest["gate"]>,
  ): Promise<boolean> {
    // 아이템 검사가 먼저 — code와 items를 같이 건 게이트(3번 방 콘솔: 테이프→멜로디)는
    // 물건 없이 키패드부터 보여 주면 안 된다.
    if (gate.items) {
      const missing = gate.items.filter((id) => !this.items.has(id));
      if (missing.length > 0) {
        Sfx.error();
        await showDialogue(
          gate.itemsMissingAnchor ?? gate.lockedAnchor,
          this.ui,
        );
        return false;
      }
    }
    if (gate.code) {
      // 잠금 상황 설명 — **매번 다시 들려준다.** 코드형 게이트의 단서(어느 기록을 펴야
      // 하는지)가 이 대사에 있어서, 세션당 한 번만 띄우면 처음에 무심코 넘긴 학생은
      // 두 번 다시 볼 수 없었다(제보 2026-08-20). 게이트가 열리면 더는 부르지 않으므로
      // 반복되는 것은 아직 못 푼 동안뿐이다.
      // (아이템형 전용 lockedAnchor와 겹치지 않게, promptAnchor가 아닌 lockedAnchor를
      //  코드형 도입 대사로 쓴다)
      await showDialogue(gate.lockedAnchor, this.ui);
      const ok = await openKeypad(
        {
          code: gate.code,
          promptAnchor: gate.promptAnchor,
          wrongAnchor: gate.wrongAnchor,
          keys: gate.keys,
        },
        this.ui,
      );
      if (!ok) return false;
    }
    bus.emit(`gate:${puzzleId}`);
    if (gate.openAnchor) await showDialogue(gate.openAnchor, this.ui);
    return true;
  }

  /** 벽걸이 드로우 — 평면 아트를 벽 기울기(±1/2)에 맞춰 셰어 변환으로 부착 */
  private drawWallDecor(
    ctx: CanvasRenderingContext2D,
    wd: WallDecorItem,
    ox: number,
    oy: number,
  ): void {
    const img = this.sprites[wd.sprite];
    if (!img) return;
    const s = img.gameScale ?? 1;
    const w = img.width * s;
    const h = img.height * s;
    // 모서리(타일 0,0의 N 꼭짓점) 기준 벽면 좌표 → 화면 좌표
    const dirX = wd.side === "ne" ? 1 : -1;
    const cx = ox + dirX * wd.at * (TILE_W / 2);
    const cy = oy - TILE_H / 2 + wd.at * (TILE_H / 2);
    ctx.save();
    ctx.transform(1, dirX * 0.5, 0, 1, cx, cy);
    // 아트 하단을 걸레받이 위(베이스에서 24px 위)에 정렬
    ctx.drawImage(img, -w / 2, -24 - h, w, h);
    ctx.restore();
  }

  /** 데코 드로우 — flat은 타일 중심에 깔고, 입체물은 바닥선에 세운다 */
  private drawDecor(
    ctx: CanvasRenderingContext2D,
    deco: DecorItem,
    ox: number,
    oy: number,
    flat: boolean,
  ): void {
    const img = this.sprites[deco.sprite];
    if (!img) return;
    const s = img.gameScale ?? 1;
    const w = img.width * s;
    const h = img.height * s;
    const [sx, sy] = worldToScreen(deco.tile[0], deco.tile[1]);
    const x = Math.round(ox + sx);
    const y = Math.round(flat ? oy + sy - h / 2 : oy + sy - h + TILE_H / 4);
    ctx.save();
    if (deco.flip) {
      ctx.translate(x, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, Math.round(-w / 2), y, w, h);
    } else {
      ctx.drawImage(img, Math.round(x - w / 2), y, w, h);
    }
    ctx.restore();
  }

  /** 줌 좌표계에서의 뷰포트 크기 (실제 화면 px ÷ 줌) */
  private viewSize(): [number, number] {
    return [
      this.host.clientWidth / CAMERA_ZOOM,
      this.host.clientHeight / CAMERA_ZOOM,
    ];
  }

  /** 카메라: 플레이어를 화면 중앙에 */
  private cameraOffset(): [number, number] {
    const [px, py] = worldToScreen(this.player.x, this.player.y);
    const [w, h] = this.viewSize();
    return [w / 2 - px, h / 2 - py];
  }

  private render(): void {
    const ctx = this.ctx;
    const [w, h] = this.viewSize();
    ctx.fillStyle = tokens.color["bg-void"];
    ctx.fillRect(0, 0, w, h);

    const [ox, oy] = this.cameraOffset();

    // 프리렌더 방 배경이 있으면 타일·벽·데코 렌더를 통째로 대체 (레퍼런스 수준 일러스트)
    const bg = this.map.background;
    if (bg && this.sprites[bg.sprite]) {
      const bgImg = this.sprites[bg.sprite];
      const bs = bg.scale ?? 1;
      const bsy = bg.scaleY ?? bs; // 이미지 투영이 정확한 2:1이 아닐 때 세로만 보정
      ctx.drawImage(
        bgImg,
        Math.round(ox + bg.offsetX),
        Math.round(oy + bg.offsetY),
        bgImg.width * bs,
        bgImg.height * bsy,
      );
    } else {
      // 뒷벽 2면 (기본 표시) — NE: y=0 행의 바깥 변, NW: x=0 열의 바깥 변
      if (this.map.walls !== false) {
        const wallNe = this.sprites["wall-ne"];
        const wallNw = this.sprites["wall-nw"];
        if (wallNe && wallNw) {
          // 가로 폭은 타일 간격에 물려 있어 그대로, 높이만 WALL_STRETCH배로 늘린다
          const wallH = 128 * WALL_STRETCH;
          for (let y = this.map.rows - 1; y >= 0; y--) {
            const [sx, sy] = worldToScreen(0, y);
            ctx.drawImage(
              wallNw,
              Math.round(ox + sx - TILE_W / 2),
              Math.round(oy + sy - wallH),
              wallNw.width,
              wallH,
            );
          }
          for (let x = 0; x < this.map.cols; x++) {
            const [sx, sy] = worldToScreen(x, 0);
            ctx.drawImage(
              wallNe,
              Math.round(ox + sx),
              Math.round(oy + sy - TILE_H / 2 - WALL_H),
              wallNe.width,
              wallH,
            );
          }
        }
        for (const wd of this.map.wallDecor ?? []) {
          this.drawWallDecor(ctx, wd, ox, oy);
        }
      }

      // 바닥: 두 톤 타일 (그라우트 라인 포함)
      for (let y = 0; y < this.map.rows; y++) {
        for (let x = 0; x < this.map.cols; x++) {
          const img = this.sprites[(x + y) % 2 === 0 ? "tile-a" : "tile-b"];
          const [sx, sy] = worldToScreen(x, y);
          ctx.drawImage(img, ox + sx - TILE_W / 2, oy + sy - TILE_H / 2);
        }
      }

      // 천장 조명 + 한랭 광 풀 (형광등 — 엔티티 아래 레이어)
      for (const deco of this.map.decor ?? []) {
        if (!deco.light) continue;
        const [sx, sy] = worldToScreen(deco.tile[0], deco.tile[1]);
        const g = ctx.createRadialGradient(
          ox + sx,
          oy + sy,
          10,
          ox + sx,
          oy + sy,
          150,
        );
        g.addColorStop(0, "rgba(185, 212, 255, 0.11)");
        g.addColorStop(1, "rgba(185, 212, 255, 0)");
        ctx.save();
        ctx.translate(ox + sx, oy + sy);
        ctx.scale(1, 0.5);
        ctx.translate(-(ox + sx), -(oy + sy));
        ctx.fillStyle = g;
        ctx.fillRect(ox + sx - 160, oy + sy - 160, 320, 320);
        ctx.restore();
        const img = this.sprites[deco.sprite];
        if (img) {
          const s = img.gameScale ?? 1;
          ctx.drawImage(
            img,
            Math.round(ox + sx - (img.width * s) / 2),
            Math.round(oy + sy - 150),
            img.width * s,
            img.height * s,
          );
        }
      }

      // 평면 데코 (얼룩·파편·서류): 타일 직후, 입체물 아래에 깔린다
      for (const deco of this.map.decor ?? []) {
        if (!deco.flat) continue;
        this.drawDecor(ctx, deco, ox, oy, true);
      }
    } // end: 프리렌더 배경 분기

    // 봉인 구역 — 배경 그림 위를 타일 사각형 모양(아이소 평행사변형)으로 덮는다.
    // 어둠 오버레이보다 **먼저** 그려 암실+봉인이 겹쳐도 색이 튀지 않게 한다.
    // 캘리브레이션 모드(?grid)에선 배치를 봐야 하므로 끔.
    // 어둠 전체 → 경계선 전체 **2패스**. 한 패스로 구역을 하나씩 끝내면 뒤 구역의 어둠이
    // 앞 구역 경계선 위를 덮어 이음매에 톤 차이가 생긴다(청음실 부스+앞마당 실측).
    //
    // ⚠ **반투명 장막을 쓰지 않는다** — 그림이 비쳐 보이면 "덜 그려진 방"으로 읽힌다
    //   (2026-08-14 제보). 바닥은 완전히 덮고, 위쪽 lift 구간에서만 짧게 페이드해
    //   딱딱한 윗변을 없앤다. 차단 신호도 회색 격벽+빨강 줄무늬(SF 화풍이라 그림과 따로 놀았다)
    //   대신 **경계에 놓인 호박색 등불선** 하나로 줄였다.
    if (!this.debugGrid) {
      for (const pass of ["dark", "edge"] as const)
        for (const s of this.map.sealed ?? []) {
          const a = this.sealAlpha.get(s.id) ?? 0;
          if (a <= 0) continue;
          // 덮개 높이 — 배경에 그려진 키 큰 구조물(유리 부스)이 솟아 보이면 방별로 올린다
          const lift = s.lift ?? SEAL_LIFT;
          for (const r of s.area) {
            // ① 방 실루엣으로 클리핑 — 예전엔 클립이 없어 덮개가 방 바닥 밖 허공까지
            //    삐져나갔다(실제 제보: "방 밖에 검은 상자가 걸쳐 있다").
            const cols = this.map.cols;
            const rows = this.map.rows;
            const roomN = worldToScreen(-0.5, -0.5);
            const roomE = worldToScreen(cols - 0.5, -0.5);
            const roomS = worldToScreen(cols - 0.5, rows - 0.5);
            const roomW = worldToScreen(-0.5, rows - 0.5);
            ctx.save();
            ctx.beginPath();
            // 바닥 마름모 + 벽 높이(lift)만큼 위로 늘린 육각형
            ctx.moveTo(ox + roomW[0], oy + roomW[1]);
            ctx.lineTo(ox + roomW[0], oy + roomW[1] - lift);
            ctx.lineTo(ox + roomN[0], oy + roomN[1] - lift);
            ctx.lineTo(ox + roomE[0], oy + roomE[1] - lift);
            ctx.lineTo(ox + roomE[0], oy + roomE[1]);
            ctx.lineTo(ox + roomS[0], oy + roomS[1]);
            ctx.closePath();
            ctx.clip();

            // 구역 꼭짓점 (화면상 북·동·남·서)
            const [n, e, sth, w] = [
              worldToScreen(r.x0, r.y0),
              worldToScreen(r.x1, r.y0),
              worldToScreen(r.x1, r.y1),
              worldToScreen(r.x0, r.y1),
            ];

            if (pass === "dark") {
              // ② 어둠 — 바닥부터 위로 **불투명**하게 채우고, 맨 위 lift 구간만 페이드.
              //    균일 검정 + 딱딱한 윗변이 "상자"로 읽히던 원인이라 윗변을 없앤다.
              const top = Math.min(n[1], e[1], w[1]) - lift;
              const bottom = sth[1];
              const span = Math.max(1, bottom - top);
              // 페이드가 끝나는 지점 = lift 띠의 아래쪽. 바닥 쪽은 전부 불투명이다.
              const fade = Math.min(0.6, (lift / span) * 0.95);
              const g = ctx.createLinearGradient(0, oy + top, 0, oy + bottom);
              g.addColorStop(0, "rgba(6, 9, 15, 0)");
              g.addColorStop(fade, `rgba(6, 9, 15, ${a})`);
              g.addColorStop(1, `rgba(6, 9, 15, ${a})`);
              ctx.fillStyle = g;
              // 다각형은 아이소 기둥 **실루엣(6점)** — 화면 꼭대기까지 수직 기둥으로 채우면
              // 좌우에 긴 수직 절단선이 생겨 열린 구역 장치를 자른다(모바일 실측).
              // lift 오버라이드 시 서쪽(왼쪽) 변은 기본 높이를 유지한다 — 왼쪽 세로 절단선이
              // lift만큼 길어져 열린 구역의 벽·장치를 가로지르던 것을 막고(청음실 실측),
              // 윗변이 왼쪽 아래→오른쪽 위로 비스듬히 올라가며 키 큰 구조물만 덮는다.
              const liftW = Math.min(lift, SEAL_LIFT);
              ctx.beginPath();
              ctx.moveTo(ox + n[0], oy + n[1] - lift);
              ctx.lineTo(ox + e[0], oy + e[1] - lift);
              ctx.lineTo(ox + e[0], oy + e[1]);
              ctx.lineTo(ox + sth[0], oy + sth[1]);
              ctx.lineTo(ox + w[0], oy + w[1]);
              ctx.lineTo(ox + w[0], oy + w[1] - liftW);
              ctx.closePath();
              ctx.fill();
              ctx.restore();
              continue;
            }

            // ③ 경계 등불선 — 봉인 구역이 **열린 바닥과 맞닿는 변**에만 놓이는 호박색 선.
            //    "여기서 막혔다"를 말하되 그림의 등불·놋쇠 톤과 같은 계열로 둔다.
            //    네 변 전부 후보다 — 학생이 남쪽에서 걸어와 막히는 변(남·동)에 선이 없으면
            //    덮개 아랫변이 그냥 잘린 슬래브로 보인다(2026-08-14 제보 "공중에 떠 있다").
            //    단 ① 변 바깥이 **방 밖**(뒷벽·격자 밖)이면 긋지 않는다 — 벽 위 선은 무의미.
            //    ② 바깥이 **다른 봉인 구역**이어도 긋지 않는다 — 두 구역이 가운데 선으로
            //    갈려 하나의 막힌 구역으로 안 읽혔다(청음실 실측).
            const EDGE_PROBE = 0.15;
            const inRoom = (px: number, py: number) =>
              px >= -0.5 && px <= cols - 0.5 && py >= -0.5 && py <= rows - 0.5;
            const edges: {
              p0: [number, number];
              p1: [number, number];
              outside: [number, number];
            }[] = [
              { p0: w, p1: n, outside: [r.x0 - EDGE_PROBE, (r.y0 + r.y1) / 2] }, // 서
              { p0: n, p1: e, outside: [(r.x0 + r.x1) / 2, r.y0 - EDGE_PROBE] }, // 북
              { p0: e, p1: sth, outside: [r.x1 + EDGE_PROBE, (r.y0 + r.y1) / 2] }, // 동
              { p0: sth, p1: w, outside: [(r.x0 + r.x1) / 2, r.y1 + EDGE_PROBE] }, // 남
            ];
            for (const { p0, p1, outside } of edges) {
              if (!inRoom(outside[0], outside[1])) continue;
              if (this.isSealed(outside[0], outside[1])) continue;
              ctx.beginPath();
              ctx.moveTo(ox + p0[0], oy + p0[1]);
              ctx.lineTo(ox + p1[0], oy + p1[1]);
              ctx.strokeStyle = `rgba(255, 209, 102, ${0.85 * a})`; // success — 등불 호박색
              ctx.lineWidth = 4;
              ctx.shadowColor = `rgba(255, 209, 102, ${0.7 * a})`;
              ctx.shadowBlur = 18;
              ctx.stroke();
              ctx.shadowBlur = 0;
            }
            ctx.restore();
          }
        }
    }


    // 오브젝트·플레이어를 화면 y 기준 정렬 후 드로우
    const drawables: { sy: number; draw: () => void }[] = [];

    // 앞가림 구조물 — 배경 그림에서 그 조각만 오려 **깊이 정렬에 참여**시킨다.
    // 통짜 배경은 항상 캐릭터 밑에 깔리므로, 나무 뒤로 걸어가도 캐릭터가 나무 위에 떴다.
    // 정렬 키는 구조물의 앞(남쪽) 끝이라 앞에 선 캐릭터는 그대로 보인다.
    if (bg && this.sprites[bg.sprite]) {
      const bgImg = this.sprites[bg.sprite];
      const bs = bg.scale ?? 1;
      const bsy = bg.scaleY ?? bs;
      const artX = (ax: number) => ox + bg.offsetX + ax * bs;
      const artY = (ay: number) => oy + bg.offsetY + ay * bsy;
      for (const oc of bg.occluders ?? []) {
        const [, sy] = worldToScreen(oc.base[0], oc.base[1]);
        drawables.push({
          sy,
          draw: () => {
            ctx.save();
            ctx.beginPath();
            for (const shape of oc.shapes) {
              if ("ellipse" in shape) {
                const [cx, cy, rx, ry] = shape.ellipse;
                // ⚠ ellipse()는 현재 점에서 선을 잇는다 — moveTo로 서브패스를 끊어야 합집합이 된다
                ctx.moveTo(artX(cx + rx), artY(cy));
                ctx.ellipse(artX(cx), artY(cy), rx * bs, ry * bsy, 0, 0, Math.PI * 2);
              } else {
                const [rx0, ry0, rw, rh] = shape.rect;
                ctx.rect(artX(rx0), artY(ry0), rw * bs, rh * bsy);
              }
            }
            ctx.clip();
            // 완전 불투명하게 덮으면 나무 뒤에 선 캐릭터가 통째로 사라진다(스폰 지점에서 실측).
            // 같은 그림을 같은 자리에 겹치는 것이라 **배경 픽셀은 알파와 무관하게 그대로**이고,
            // 밑에 깔린 캐릭터만 잎 사이로 비친 것처럼 남는다.
            // 매 프레임 도는 코드라 전체 그림이 아니라 **실루엣 bbox 원본 사각형만** 다시 그린다.
            let [bx0, by0, bx1, by1] = [Infinity, Infinity, -Infinity, -Infinity];
            for (const shape of oc.shapes) {
              const [sx0, sy0, sx1, sy1] =
                "ellipse" in shape
                  ? [
                      shape.ellipse[0] - shape.ellipse[2],
                      shape.ellipse[1] - shape.ellipse[3],
                      shape.ellipse[0] + shape.ellipse[2],
                      shape.ellipse[1] + shape.ellipse[3],
                    ]
                  : [
                      shape.rect[0],
                      shape.rect[1],
                      shape.rect[0] + shape.rect[2],
                      shape.rect[1] + shape.rect[3],
                    ];
              bx0 = Math.min(bx0, sx0);
              by0 = Math.min(by0, sy0);
              bx1 = Math.max(bx1, sx1);
              by1 = Math.max(by1, sy1);
            }
            ctx.globalAlpha = OCCLUDER_ALPHA;
            ctx.drawImage(
              bgImg,
              bx0,
              by0,
              bx1 - bx0,
              by1 - by0,
              artX(bx0),
              artY(by0),
              (bx1 - bx0) * bs,
              (by1 - by0) * bsy,
            );
            ctx.globalAlpha = 1;
            ctx.restore();
          },
        });
      }
    }

    // 입체 데코 (가구 등): 깊이 정렬에 참여 (배경 모드에서는 그림에 포함되므로 생략)
    for (const deco of bg ? [] : (this.map.decor ?? [])) {
      if (deco.flat || deco.light) continue;
      const [, sy] = worldToScreen(deco.tile[0], deco.tile[1]);
      drawables.push({
        sy,
        draw: () => this.drawDecor(ctx, deco, ox, oy, false),
      });
    }

    for (const obj of this.map.objects) {
      // 완전 봉인 중에만 건너뛴다 — 키 큰 스프라이트가 덮개 위로 삐져나오는 걸 막는다.
      // ?grid(캘리브레이션)에서는 덮개를 안 그리므로 오브젝트도 숨기면 안 된다 —
      // 배치를 보려고 켠 모드에서 봉인 안 장치가 통째로 사라졌다.
      if (!this.debugGrid && this.isSealed(obj.tile[0], obj.tile[1], 0.999))
        continue;
      const [sx, sy] = worldToScreen(obj.tile[0], obj.tile[1]);
      const img = obj.sprite ? this.sprites[obj.sprite] : undefined;
      if (!img) continue; // 스프라이트 없는 핫스팟(수색 지점) — 스파클 마커가 대신 표시
      // 잠긴 문·이미 읽은 노트는 흐릿하게
      const alpha =
        this.isDoorLocked(obj) ||
        (obj.noteId && this.collectedNotes.has(obj.noteId))
          ? 0.4
          : 1;
      const os = img.gameScale ?? 1;
      drawables.push({
        // 정렬 키는 타일 중심이 아니라 **스프라이트가 바닥에 닿는 줄**이다(그리는 자리와 같은 값).
        // 중심으로 정렬하면 장치 타일에 그대로 올라선 캐릭터가 장치 앞으로 나와,
        // 다리는 장치를 뚫고 발이 장치 아래로 삐져나온다 — 장치가 공중에 뜬 것처럼 보인다.
        sy: sy + TILE_H / 4 + (obj.sink ?? 0),
        draw: () => {
          const w = img.width * os;
          const h = img.height * os;
          // 밑변 y. 기본 앵커는 타일 중심 + TILE_H/4 이고, sink로 더 내려 앉힌다
          // (밑면이 여러 타일에 걸친 장치는 타일 앞 꼭짓점까지 내려와야 바닥에 닿아 보인다).
          const footY = oy + sy + TILE_H / 4 + (obj.sink ?? 0);
          if (obj.grounded) {
            if (obj.pad) this.drawGroundPad(ctx, ox + sx, oy + sy, w * obj.pad);
            this.drawContactShadow(ctx, ox + sx, footY, w, obj.pad ? 0.45 : 1);
          }
          ctx.globalAlpha = alpha;
          ctx.drawImage(
            img,
            Math.round(ox + sx - w / 2),
            Math.round(footY - h),
            w,
            h,
          );
          ctx.globalAlpha = 1;
        },
      });
    }

    {
      const [sx, sy] = worldToScreen(this.player.x, this.player.y);
      // 방향 × (대기/걷기 순환) 프레임. 모션 최소화 선호 시 대기 프레임 고정.
      // 8방향이 다 없는 스프라이트 세트(대각 4방향뿐인 .pix 폴백)는 가까운 대각으로 대체한다.
      let facing: string = this.facing;
      if (!this.sprites[`char-${this.gender}-${facing}-idle`]) {
        const near: Record<string, string> = {
          n: "ne", s: "se", e: "se", w: "sw",
          ne: "ne", nw: "nw", se: "se", sw: "sw",
        };
        facing = near[facing] ?? "se";
      }
      const animate = this.moving && !this.reduceMotion;
      const cycle = ["a", "b", "c", "d"].filter(
        (f) => this.sprites[`char-${this.gender}-${facing}-${f}`],
      );
      const frame =
        animate && cycle.length > 0
          ? cycle[Math.floor(this.walkPhase) % cycle.length]
          : "idle";
      const img = this.sprites[`char-${this.gender}-${facing}-${frame}`];
      const s = img?.gameScale ?? 1;
      drawables.push({
        sy: sy + 0.1, // 동률일 때 플레이어를 앞에
        draw: () => {
          if (!img) return;
          const w = img.width * s;
          const h = img.height * s;
          // 캐릭터만 보간을 켠다. 전역은 nearest(픽셀아트 타일·.pix 캐릭터용)인데,
          // 고해상도 일러스트 캐릭터를 그 상태로 축소하면 가장자리가 계단처럼 부서진다.
          // (배경이 매끈한 카툰 아트일 때 캐릭터만 도트로 튀는 문제 — 2026-08-11)
          ctx.imageSmoothingEnabled = true;
          ctx.drawImage(
            img,
            Math.round(ox + sx - w / 2),
            Math.round(oy + sy + 8 - h),
            w,
            h,
          );
          ctx.imageSmoothingEnabled = false;
        },
      });
    }

    drawables.sort((a, b) => a.sy - b.sy).forEach((d) => d.draw());

    // (유리벽 재드로우 판 background.overpaint는 삭제했다 — 그림 안 구조물 뒤에
    //  스프라이트를 두려면 판을 세우는 대신 **그림 자체를 상호작용 지점으로** 쓴다.
    //  청음실 녹음 콘솔이 그 사례: sprite 없이 tile만 두고 아트의 책상을 가리킨다.)

    // 어둠 오버레이 (1막: 플레이어 주변만 희미하게 보임) — 캘리브레이션 모드(?grid)에선 끔
    if (this.darkness > 0 && !this.debugGrid) {
      const [px, py] = worldToScreen(this.player.x, this.player.y);
      // 광원 반경은 화면 기준 유지 (줌 아웃해도 같은 넓이가 보이도록 /ZOOM)
      const r0 = 60 / CAMERA_ZOOM;
      const r1 = 300 / CAMERA_ZOOM;
      const g = ctx.createRadialGradient(
        ox + px,
        oy + py - 40,
        r0,
        ox + px,
        oy + py - 40,
        r1,
      );
      const a = 0.94 * this.darkness;
      g.addColorStop(0, `rgba(6, 9, 15, ${a * 0.35})`);
      g.addColorStop(0.55, `rgba(6, 9, 15, ${a * 0.8})`);
      g.addColorStop(1, `rgba(6, 9, 15, ${a})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    if (this.showGrid) this.drawDebugGrid(ctx, ox, oy);

    // 근접 상호작용 링 — 지금 상호작용 대상이 된 오브젝트의 발밑에 깔리는 아이소 고리.
    // 2막 레이저 벤치처럼 배경 그림에 그려져 스프라이트가 없는 장치는 라벨 말고는
    // "여기가 그 장치다"라는 신호가 전혀 없었다. 어둠 오버레이 위에 그려 암실에서도 보인다.
    if (this.nearObject && !this.dialogueOpen) {
      const obj = this.nearObject;
      const [sx, sy] = worldToScreen(obj.tile[0], obj.tile[1]);
      const img = obj.sprite ? this.sprites[obj.sprite] : undefined;
      // 스프라이트가 있으면 그 폭에 맞추고, 없으면 한 타일 남짓
      const base = img
        ? Math.max(56, img.width * (img.gameScale ?? 1) * 0.42)
        : 100;
      const t = performance.now() / 1000;
      const pulse = 0.5 + 0.5 * Math.sin(t * 3.4);
      const rx = base * (1 + 0.05 * pulse);
      ctx.save();
      ctx.translate(ox + sx, oy + sy);
      ctx.scale(1, 0.5); // 아이소 2:1 — 원을 눌러 바닥에 누운 고리로
      ctx.strokeStyle = tokens.color["hologram"];
      ctx.lineWidth = 3 / CAMERA_ZOOM;
      ctx.globalAlpha = 0.35 + 0.35 * pulse;
      ctx.beginPath();
      ctx.arc(0, 0, rx, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.1 + 0.08 * pulse;
      ctx.fillStyle = tokens.color["hologram"];
      ctx.fill();
      ctx.restore();
    }

    // 발견 스파클 마커 — 아직 안 집은 수색 지점·연구노트에 반짝임 (어둠 위에 그려
    // 암실에서도 "저기 뭔가 있다"가 보이는 방탈출 연출)
    // ⚠ **노트도 여기 걸린다.** 노트 핫스팟은 스프라이트가 없어(배경 그림의 가구를
    // 가리키는 설계) 마커까지 없으면 화면에 아무 표시도 남지 않는다 — 빈 바닥에 놓인
    // 노트는 붙어서 라벨이 뜨기 전까지 보이지 않았다(제보 2026-08-18).
    {
      const t = performance.now() / 1000;
      for (const obj of this.map.objects) {
        const pending = obj.search
          ? !this.searched.has(obj.id)
          : !!obj.noteId && !this.collectedNotes.has(obj.noteId);
        if (!pending) continue;
        // 스파클은 어둠 오버레이 위에 그려지므로 덮개로 가려지지 않는다 — 알파와 무관하게
        // 페이드가 끝날 때까지 숨긴다(봉인 뒤에서 반짝임이 새어 나오던 문제).
        if (!this.debugGrid && this.isSealed(obj.tile[0], obj.tile[1]))
          continue;
        const [sx, sy] = worldToScreen(obj.tile[0], obj.tile[1]);
        const objImg = obj.sprite ? this.sprites[obj.sprite] : undefined;
        const cy =
          oy +
          sy -
          (objImg ? objImg.height * (objImg.gameScale ?? 1) * 0.7 : 40);
        const cx = ox + sx + 18;
        const pulse = 0.45 + 0.55 * Math.abs(Math.sin(t * 2.2 + sx * 0.01));
        ctx.save();
        ctx.globalAlpha = pulse;
        ctx.strokeStyle = tokens.color["success"];
        // 마커 자체는 화면 기준 크기 유지 — 줌 아웃해도 눈에 띄어야 한다
        ctx.lineWidth = 2 / CAMERA_ZOOM;
        const r = (5 + 2 * pulse) / CAMERA_ZOOM;
        ctx.beginPath();
        ctx.moveTo(cx - r, cy);
        ctx.lineTo(cx + r, cy);
        ctx.moveTo(cx, cy - r);
        ctx.lineTo(cx, cy + r);
        ctx.stroke();
        ctx.globalAlpha = pulse * 0.6;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.45, 0, Math.PI * 2);
        ctx.fillStyle = tokens.color["success"];
        ctx.fill();
        ctx.restore();
      }
    }

    // 상호작용 라벨 (DOM — 캔버스 위 오버레이)
    if (this.nearObject && !this.dialogueOpen) {
      const obj = this.nearObject;
      const img = obj.sprite ? this.sprites[obj.sprite] : undefined;
      const [sx, sy] = worldToScreen(obj.tile[0], obj.tile[1]);
      const hint = this.joystick ? "ACT" : "Space/E";
      this.label.textContent = `${obj.name} (${hint} 상호작용)`;
      // 라벨은 DOM(실제 화면 px) — 줌 좌표를 화면 좌표로 되돌린다
      const ly = oy + sy - (img ? img.height * (img.gameScale ?? 1) : 72);
      this.label.style.left = `${(ox + sx) * CAMERA_ZOOM}px`;
      this.label.style.top = `${ly * CAMERA_ZOOM}px`;
      this.label.hidden = false;
    } else {
      this.label.hidden = true;
    }
  }
}
