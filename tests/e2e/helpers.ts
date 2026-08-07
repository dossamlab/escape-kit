import { expect, type Page } from "@playwright/test";

/**
 * 상호작용 대상 앞에 설 때의 정지 오차(타일).
 * **scripts/check-layout.mjs 에 넘기는 값과 반드시 같아야 한다** — 그 스크립트가
 * "이 오차 안에서 흔들려도 의도한 대상이 선택되는가"를 검산한다. 여기만 느슨하게 두면
 * 검산은 통과했는데 실제로는 옆 오브젝트가 잡힌다(전체 주파가 그렇게 깨진 적 있다).
 */
export const APPROACH_THRESHOLD = 0.4;

/** 대사 박스가 사라질 때까지 클릭으로 넘긴다.
 * 클릭 횟수를 못 박지 않는다 — 부하가 걸리면 한 번의 입력이 두 줄을 넘겨버려
 * 고정 횟수 루프가 "박스 없음"으로 터진다(도입부 공통 단계라 전 스위트가 흔들린다).
 * 다만 기다림은 넉넉히 준다: 짧게 끊고 나가면 대사가 남아 이동이 영구 잠긴 채로
 * 이후 단계가 전부 실패한다. */
export async function dismissDialogues(page: Page): Promise<void> {
  const dialogue = page.getByTestId("dialogue-box");
  for (let i = 0; i < 10; i++) {
    const shown = await dialogue
      .waitFor({ state: "visible", timeout: 2500 })
      .then(() => true)
      .catch(() => false);
    if (!shown) break;
    await dialogue.click();
  }
  await expect(dialogue).toBeHidden();
}

/** 타이틀 → 캐릭터 선택 → 프롤로그 대사들을 넘겨 첫 방에 진입 (항상 새 시작) */
export async function enterRoom(page: Page, character: "m" | "f" = "m", path = "/"): Promise<void> {
  await page.goto(path);
  await expect(page.getByTestId("title-screen")).toBeVisible();
  // 새 시작 버튼: 진행이 없으면 '관측 시작', 있으면 '처음부터' — 둘 다 start-button
  await page.getByTestId("start-button").click();

  // 캐릭터 선택 (새 시작 전용 단계)
  await expect(page.getByTestId("char-select")).toBeVisible();
  await page.getByTestId(`char-${character}`).click();

  // 프롤로그 대사 1 (라플라스 — 관측동 도착)
  const dialogue = page.getByTestId("dialogue-box");
  await expect(dialogue).toBeVisible();
  await expect(dialogue).toContainText("라플라스");
  await dialogue.click();

  await expect(page.getByTestId("game-canvas")).toBeVisible();

  // 튜토리얼 + 규칙 + 첫 방 인트로 대사 순차 진행.
  await dismissDialogues(page);
}

/**
 * 청음실(sonic-room)로 진입. 지금은 첫 방이므로 enterRoom이 곧 이 방이다.
 * `?grid`로 여는 이유는 __qe 디버그 훅(seals·searched·warp)을 spec에서 쓰기 때문이다.
 * 방은 암전 상태로 시작한다(dark) — P1을 풀어야 점등.
 *
 * 방을 앞에 더 붙이면 여기서 `goDoor`로 걸어 들어오거나 `__qe.warp("sonic-room")`을 쓴다.
 */
export async function enterSonicRoom(page: Page, character: "m" | "f" = "m"): Promise<void> {
  await enterRoom(page, character, "/?grid");
  await expect
    .poll(() => page.evaluate(() => (window as never as { __qe: { map: string } }).__qe.map))
    .toBe("sonic-room");
}

/** P1 진자 발전기를 해결한다 — 리듬 입력은 CI에서 플레이키하므로 e2e 훅으로 진폭을 채운다.
 * (박자 수렴 자체는 spec의 순수 함수 검산이 보증한다) */
export async function solvePendulum(page: Page, isMobile: boolean): Promise<void> {
  const { SOLVE_AMP } = await import("../../src/puzzles/pendulum-dynamo/autoplay");
  await openStation(page, isMobile, 6, 4.5, "puzzle-pendulum");
  await page.evaluate((v) => {
    (window as never as { __qePendSet: (n: number) => void }).__qePendSet(v);
  }, SOLVE_AMP);
  await expect(page.getByTestId("dynamo-started")).toBeVisible({ timeout: 8000 });
  await dismissDialogues(page); // #sn-pend-clear (+ 조명 복구 연출)
  await expect(page.getByTestId("puzzle-pendulum")).toBeHidden();
}

/** P2 벽 노크를 해결한다 — 빈 패널을 두드려 벽감을 열고 릴 테이프를 얻는다.
 * (조명은 무관하지만 관례상 solvePendulum 이후 호출) */
export async function solveKnock(page: Page, isMobile: boolean): Promise<void> {
  const { HOLLOW_ROW, HOLLOW_COL } = await import("../../src/puzzles/wall-sounding/autoplay");
  await openStation(page, isMobile, 9, 1.7, "puzzle-knock");
  await page.getByTestId(`knock-panel-${HOLLOW_ROW}-${HOLLOW_COL}`).click();
  await page.getByTestId("knock-open").click();
  await expect(page.getByTestId("knock-found")).toBeVisible();
  await dismissDialogues(page); // #sn-knock-clear
  await expect(page.getByTestId("puzzle-knock")).toBeHidden();
  await expect(page.getByTestId("item-reel-tape")).toBeVisible();
}

/**
 * 3번 방 녹음 부스(booth) 봉인을 연다 — 본실 퍼즐 P1(전원)·P2(노크)·P3(무음점)를
 * 실제로 풀어 opensWhen(P2 AND P3) 조건을 채운다. 우회 훅 없음(openCoreZone 규약).
 */
export async function openBoothZone(page: Page, isMobile: boolean): Promise<void> {
  await solvePendulum(page, isMobile);
  await dismissDialogues(page); // #sn-alarm-start
  await solveKnock(page, isMobile);
  await solveNode(page, isMobile);
  await dismissDialogues(page); // #sn-seal-open
  // 페이드가 끝나야 통행·상호작용이 열린다
  await expect
    .poll(
      () =>
        page.evaluate(
          () => (window as never as { __qe: { seals: Record<string, number> } }).__qe.seals["booth"]
        ),
      { timeout: 12_000 }
    )
    .toBe(0);
}

/** P3 무음 지점을 해결한다 — 해치까지 걸어가 반위상 주입 패널에서 주입 신호를
 * 반파장(Δφ=π)만큼 끌어 정렬한 뒤 차단 스위치를 내린다.
 * (P1 해결로 경보가 활성인 상태를 가정 — solvePendulum 이후 호출) */
export async function solveNode(page: Page, isMobile: boolean): Promise<void> {
  const { HATCH, WAVE_CYCLES } = await import("../../src/puzzles/silent-node/autoplay");
  await openStation(page, isMobile, HATCH[0], HATCH[1], "puzzle-silent");

  // 정렬 전엔 스위치가 잠겨 있다 — 원버튼 회귀 방지 단언
  const switchBtn = page.getByTestId("node-switch");
  await expect(switchBtn).toBeDisabled();

  // 주입 신호를 반파장만큼 가로 드래그 — 렌더 폭 기준으로 환산 (CSS 폭 ≠ 논리 폭)
  const canvas = page.getByTestId("node-canvas");
  const box = (await canvas.boundingBox())!;
  const dragPx = box.width / WAVE_CYCLES / 2;
  const cy = box.y + box.height / 2;
  // 왼쪽 절반에서 시작해 드래그가 캔버스 밖으로 나가도 pointer capture로 이어진다
  const sx = box.x + box.width * 0.3;
  await page.mouse.move(sx, cy);
  await page.mouse.down();
  await page.mouse.move(sx + dragPx, cy, { steps: 8 });
  await page.mouse.up();

  await expect(switchBtn).toBeEnabled();
  await switchBtn.click();
  await expect(page.getByTestId("node-cut")).toBeVisible();
  await dismissDialogues(page); // #sn-node-clear
  await expect(page.getByTestId("puzzle-silent")).toBeHidden();
}

/** 타이틀 → '이어하기'로 마지막 방에 재개 (프롤로그 생략) */
export async function continueGame(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByTestId("title-screen")).toBeVisible();
  await page.getByTestId("continue-button").click();
  await expect(page.getByTestId("game-canvas")).toBeVisible();
}

/** 근처 오브젝트와 상호작용 (데스크톱: E 키 / 모바일: ACT 버튼).
 * 상호작용 라벨(근접 판정 완료)이 뜬 뒤 입력해 한 프레임 레이스를 피한다. */
export async function interact(page: Page, isMobile: boolean): Promise<void> {
  // ⚠ 이 대기가 던지면 **호출부의 재시도 루프 밖으로 예외가 샌다** — openStation·searchAt·
  //   collectNoteAt이 전부 `for (…) { await interact(…); …반응 확인… }` 꼴이라, 라벨이
  //   제때 안 뜨면 재시도를 한 번도 못 하고 그대로 죽는다. 그래서 5초는 전체 스위트를
  //   직렬로 돌릴 때(CPU 경합) 반복적으로 모자랐다 — 2026-08-04 thermal-search,
  //   2026-08-05 wall-sounding·thermal-playthrough×2·thermal-search. 셋 다 단독 실행은 통과.
  //   근접 판정 자체가 틀리면 moveTo가 먼저 실패하므로, 여기서 넉넉히 기다려도 진짜 버그를
  //   가리지 않는다.
  await expect(page.getByTestId("interact-label")).toBeVisible({ timeout: 15_000 });
  if (isMobile) {
    await page.getByTestId("act-button").click();
  } else {
    await page.keyboard.press("KeyE");
  }
}

/** 특정 월드 좌표까지의 거리 */
export function distTo(page: Page, tx: number, ty: number): () => Promise<number> {
  return () =>
    page.evaluate(
      ([x, y]) => {
        const p = (window as never as { __qe: { player: { x: number; y: number } } }).__qe.player;
        return Math.hypot(p.x - x, p.y - y);
      },
      [tx, ty]
    );
}

/**
 * 목표 타일(tx,ty)까지 이동 — 매 버스트마다 목표 방향으로 다시 조준한다.
 * 고정 방향 홀드는 시작 위치에 따라 대각 월드 경로가 목표를 스쳐 지나
 * 반대 코너로 오버슈트할 수 있다. moveTo는 재조준하므로 위치와 무관하게 도달한다.
 */
export async function moveTo(
  page: Page,
  isMobile: boolean,
  tx: number,
  ty: number,
  threshold = 1.1
): Promise<void> {
  const TILE_W = 128;
  const TILE_H = 64;
  const dist = () =>
    page.evaluate(
      ([a, b]) => {
        const q = (window as never as { __qe: { player: { x: number; y: number } } }).__qe.player;
        return Math.hypot(q.x - a, q.y - b);
      },
      [tx, ty]
    );

  const release = async () => {
    if (!isMobile) {
      for (const k of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]) await page.keyboard.up(k);
    } else {
      await page.mouse.up();
    }
  };

  // 방은 20×20이라 대각 끝에서 끝이면 한 번에 28타일 이상 걷는다. 먼 구간은 길게 눌러
  // 왕복 횟수를 줄이고, 목표 근처(3타일 이내)에서만 짧게 눌러 정밀도를 지킨다.
  for (let i = 0; i < 120; i++) {
    const remain = await dist();
    if (remain < threshold) return;
    const hold = remain > 3 ? 260 : 100;
    const p = await page.evaluate(
      () => (window as never as { __qe: { player: { x: number; y: number } } }).__qe.player
    );
    // 월드 델타 → 화면 델타 (worldToScreen 기울기): dsx=(dx-dy)·W/2, dsy=(dx+dy)·H/2
    const dx = tx - p.x;
    const dy = ty - p.y;
    const dsx = (dx - dy) * (TILE_W / 2);
    const dsy = (dx + dy) * (TILE_H / 2);
    if (!isMobile) {
      const keys: string[] = [];
      if (dsx > TILE_W * 0.1) keys.push("ArrowRight");
      else if (dsx < -TILE_W * 0.1) keys.push("ArrowLeft");
      if (dsy > TILE_H * 0.1) keys.push("ArrowDown");
      else if (dsy < -TILE_H * 0.1) keys.push("ArrowUp");
      for (const k of keys) await page.keyboard.down(k);
      await page.waitForTimeout(hold);
      for (const k of keys) await page.keyboard.up(k);
    } else {
      const vp = page.viewportSize()!;
      const cx = 24 + 54;
      const cy = vp.height - 28 - 54;
      const len = Math.hypot(dsx, dsy) || 1;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx + (40 * dsx) / len, cy + (40 * dsy) / len, { steps: 3 });
      await page.waitForTimeout(hold);
      await page.mouse.up();
    }
  }
  await release();
  expect(await dist(), `moveTo(${tx},${ty})가 120버스트 안에 도달 실패`).toBeLessThan(threshold);
}

/**
 * 연구노트를 줍는다 — 노트는 `note-overlay`, 수색 지점은 `discovery-overlay`로
 * **오버레이가 다르다**(searchAt으로 노트를 집으려다 두 번 헛짚었다).
 * E는 닫기 키이기도 하므로 라벨을 기다렸다 **한 번만** 누른다.
 */
export async function collectNoteAt(
  page: Page,
  isMobile: boolean,
  tx: number,
  ty: number,
  threshold = 0.8
): Promise<void> {
  await moveTo(page, isMobile, tx, ty, threshold);
  const overlay = page.getByTestId("note-overlay");
  // (라벨 대기는 interact()가 한다 — 여기 8초짜리를 따로 두면 그게 먼저 던져 아래
  //  재시도 루프가 무의미해진다.)
  // 입력 삼킴 대비 재시도 (unlockEntropyConsole 규약) — 오버레이가 뜨면 즉시 빠져나가므로
  // E가 닫기 키인 점은 문제되지 않는다.
  for (let attempt = 0; attempt < 4; attempt++) {
    await interact(page, isMobile);
    const reacted = await overlay
      .waitFor({ state: "visible", timeout: 3000 })
      .then(() => true)
      .catch(() => false);
    if (reacted) break;
  }
  await expect(overlay).toBeVisible();
  await page.getByTestId("note-close").click();
  await expect(overlay).toBeHidden();
}

/** 수색 지점을 조사한다 — 타일까지 걸어가 상호작용하고 발견 오버레이를 닫는다.
 * 아이템 수색이면 HUD에 등록될 때까지 확인한다. */
export async function searchAt(
  page: Page,
  isMobile: boolean,
  tx: number,
  ty: number,
  itemId?: string,
  threshold = 1.3
): Promise<void> {
  await moveTo(page, isMobile, tx, ty, threshold);
  const discovery = page.getByTestId("discovery-overlay");
  // 입력 삼킴 대비 재시도 (unlockEntropyConsole 규약) — 한 번만 누르면 이전 대사 정리가
  // 한 프레임 늦어졌을 때 그대로 타임아웃한다 (2026-08-04 thermal-search flaky).
  for (let attempt = 0; attempt < 4; attempt++) {
    await interact(page, isMobile);
    const reacted = await discovery
      .waitFor({ state: "visible", timeout: 3000 })
      .then(() => true)
      .catch(() => false);
    if (reacted) break;
  }
  await expect(discovery).toBeVisible();
  await page.getByTestId("discovery-close").click();
  await expect(discovery).toBeHidden();
  if (itemId) await expect(page.getByTestId(`item-${itemId}`)).toBeVisible();
}

/** 코드형 게이트 해제 → 퍼즐 오픈까지 (장치 상호작용 범위 안이라고 가정) */
export async function unlockCodeGate(
  page: Page,
  isMobile: boolean,
  code: string,
  puzzleTestId: string
): Promise<void> {
  await interact(page, isMobile);
  const dialogue = page.getByTestId("dialogue-box");
  await expect(dialogue).toBeVisible(); // #gate-*-locked
  await dialogue.click();
  await expect(page.getByTestId("keypad")).toBeVisible();
  for (const d of code) {
    await page.getByTestId(`key-${d}`).click();
  }
  await page.getByTestId("keypad-enter").click();
  await expect(dialogue).toBeVisible(); // #gate-*-open
  await dialogue.click();
  await expect(page.getByTestId(puzzleTestId)).toBeVisible();
}

/** 아이템형 게이트 해제 → 퍼즐 오픈까지 (필요 아이템 소지 + 장치 범위 안 가정) */
export async function unlockItemGate(
  page: Page,
  isMobile: boolean,
  puzzleTestId: string
): Promise<void> {
  await interact(page, isMobile);
  const dialogue = page.getByTestId("dialogue-box");
  await expect(dialogue).toBeVisible(); // #gate-*-open
  await dialogue.click();
  await expect(page.getByTestId(puzzleTestId)).toBeVisible();
}

/**
 * 퍼즐 스테이션 앞까지 걸어가 상호작용 → 장치 도입 대사를 넘기고 퍼즐을 연다.
 * 2막은 퍼즐을 처음 열 때 manifest.narrative.intro가 먼저 재생된다 (Game.tryInteract).
 */
export async function openStation(
  page: Page,
  isMobile: boolean,
  tx: number,
  ty: number,
  puzzleTestId: string
): Promise<void> {
  // ⚠ 정지 오차는 scripts/check-layout.mjs 로 검산한 값과 **같아야 한다**(현재 0.4).
  //   느슨하게 두면 스테이션 앞에 서려다 옆 연구노트가 더 가까워져 그쪽이 선택된다
  //   (근접 판정은 범위 안 최근접 하나만 고른다). 실제로 전체 주파가 그렇게 깨졌다.
  await moveTo(page, isMobile, tx, ty, APPROACH_THRESHOLD);
  const dialogue = page.getByTestId("dialogue-box");
  const puzzle = page.getByTestId(puzzleTestId);

  // 직렬 부하가 걸리면 이전 대사의 정리가 한 프레임 늦어져 상호작용 입력이 삼켜진다
  // (라벨은 이미 보이는데 tryInteract가 isDialogueBusy로 막히는 구간). 반응이 없으면 다시 누른다.
  for (let attempt = 0; attempt < 4; attempt++) {
    await interact(page, isMobile);
    const reacted = await Promise.race([
      dialogue.waitFor({ state: "visible", timeout: 3000 }).then(() => true),
      puzzle.waitFor({ state: "visible", timeout: 3000 }).then(() => true),
    ]).catch(() => false);
    if (reacted) break;
  }

  // 장치 도입 대사(세션 첫 진입에만 재생) — 있으면 넘긴다
  if (await dialogue.isVisible().catch(() => false)) await dialogue.click();
  await expect(puzzle).toBeVisible();
}

/** 문 앞까지 걸어가 통과하고, 도착한 방 id를 확인한다 */
export async function goDoor(
  page: Page,
  isMobile: boolean,
  tx: number,
  ty: number,
  expectMap: string
): Promise<void> {
  await moveTo(page, isMobile, tx, ty, 1.2);
  await interact(page, isMobile);
  await expect
    .poll(() => page.evaluate(() => (window as never as { __qe: { map: string } }).__qe.map))
    .toBe(expectMap);
}
