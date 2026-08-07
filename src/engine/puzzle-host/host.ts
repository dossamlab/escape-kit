/**
 * 퍼즐 호스트 — 퍼즐 모듈을 홀로그램 오버레이에 마운트하고 PuzzleApi를 제공한다.
 * 해결 시 manifest.reward.event를 EventBus로 발화한다.
 */
import tokens from "../../../design-tokens.json";
import type { PuzzleModule } from "./types";
import { onDrag } from "../input/pointer";
import { showDialogue } from "../narrative/dialogue";
import { bus } from "../events/EventBus";
import { Sfx } from "../audio/sfx";
import { sessionStats } from "../core/stats";

/** 힌트 단계 i(0-based)가 시간만으로 풀리는 경과(ms) — 실패가 쌓이면 더 일찍 열린다 */
const HINT_UNLOCK_MS = 45_000;

/** 퍼즐을 열고, 닫힐 때 (해결 여부와 함께) resolve */
export function openPuzzle(module: PuzzleModule, host: HTMLElement): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "puzzle-overlay";
    overlay.dataset.testid = module.manifest.testIds["root"] ?? `puzzle-${module.manifest.id}`;

    const frame = document.createElement("div");
    frame.className = "puzzle-frame";

    const title = document.createElement("div");
    title.className = "puzzle-title";
    title.textContent = module.manifest.title;

    const close = document.createElement("button");
    close.className = "puzzle-close";
    close.dataset.testid = "puzzle-close";
    close.textContent = "✕";

    const body = document.createElement("div");
    body.className = "puzzle-body";

    // 스크롤은 이 래퍼만 한다 — 프레임이 직접 스크롤하던 시절엔 absolute인 닫기(✕)와
    // 제목이 콘텐츠에 딸려 위로 사라졌다(모바일에서 나가는 길이 없어졌다).
    const scroll = document.createElement("div");
    scroll.className = "puzzle-scroll";

    // "아래 더 있음" 페이드 — 장식이라 aria-hidden. 높이는 margin-top으로 상쇄해
    // 이 요소 자체가 스크롤을 만들지 않는다(style.css 참조).
    const scrollMore = document.createElement("div");
    scrollMore.className = "puzzle-scroll-more";
    scrollMore.dataset.testid = "scroll-more";
    scrollMore.setAttribute("aria-hidden", "true");

    scroll.append(body, scrollMore);
    frame.append(title, close, scroll);

    // 점진 공개 힌트 (설계서 3단계) — 있는 퍼즐만.
    // 단계 i(0-based)는 실패 i회 또는 경과 45s×i에 해금 (1단계는 무료) — 스스로 시도할 시간을 준다.
    // 하단 바 — 힌트 버튼과 퍼즐 고유 주 버튼(api.actions)이 한 줄에 선다.
    // 스크롤 밖 고정 영역이라, 여기 둔 버튼은 본문 길이와 무관하게 항상 보인다.
    // 버튼이 하나도 없으면 CSS(:has)가 통째로 감춘다 — 빈 구분선이 남지 않게.
    const hintBar = document.createElement("div");
    hintBar.className = "puzzle-hint-bar";
    const barRow = document.createElement("div");
    barRow.className = "puzzle-bar-row";
    const actions = document.createElement("div");
    actions.className = "puzzle-actions";
    barRow.appendChild(actions);
    hintBar.appendChild(barRow);
    frame.appendChild(hintBar);

    const hints = module.manifest.hints ?? [];
    let failCount = 0;
    let syncHintLock: () => void = () => {};
    let hintTimer: ReturnType<typeof setInterval> | null = null;
    const openedAt = Date.now();
    if (hints.length > 0) {
      const hintList = document.createElement("div");
      hintList.className = "puzzle-hint-list";
      hintList.dataset.testid = "hint-list";

      const hintBtn = document.createElement("button");
      hintBtn.className = "puzzle-hint-button";
      hintBtn.dataset.testid = "hint-button";
      let shown = 0;
      const unlocked = (stage: number) =>
        failCount >= stage || Date.now() - openedAt >= HINT_UNLOCK_MS * stage;
      const syncBtn = () => {
        if (shown >= hints.length) {
          hintBtn.textContent = "힌트 모두 봄";
          hintBtn.disabled = true;
          delete hintBtn.dataset.locked;
          return;
        }
        const label = shown === 0 ? "힌트" : `힌트 ${shown + 1}/${hints.length}`;
        if (unlocked(shown)) {
          hintBtn.textContent = label;
          hintBtn.disabled = false;
          delete hintBtn.dataset.locked;
        } else {
          hintBtn.textContent = `${label} — 잠김`;
          hintBtn.disabled = true;
          hintBtn.dataset.locked = "1";
        }
      };
      syncHintLock = syncBtn;
      hintBtn.addEventListener("click", () => {
        if (shown >= hints.length || !unlocked(shown)) return;
        const p = document.createElement("p");
        p.className = "puzzle-hint-item";
        p.dataset.testid = `hint-${shown + 1}`;
        p.textContent = `${shown + 1}. ${hints[shown]}`;
        hintList.appendChild(p);
        shown += 1;
        sessionStats.addHint();
        syncBtn();
        Sfx.select();
      });
      syncBtn();
      // 시간 경과 해금 재평가 — finish() 양 경로에서 반드시 clearInterval
      hintTimer = setInterval(syncBtn, 1000);

      barRow.insertBefore(hintBtn, actions);
      hintBar.appendChild(hintList);
    }

    overlay.appendChild(frame);
    host.appendChild(overlay);

    // 스크롤 안내 토글. 스크롤 이벤트만 듣는 구현은 **높이가 나중에 자라는 경우를 놓친다** —
    // 힌트 펼침(위 hintList), 경보 로그(gas-state·cylinder-work), 해설 공개(entropy-console
    // +100px), 완료 배지가 전부 마운트 후에 붙는다. 그래서 ResizeObserver가 같이 필요하다.
    const SCROLL_EPS = 4;
    const syncScrollMore = () => {
      const room = scroll.scrollHeight - scroll.clientHeight;
      const more = room > SCROLL_EPS && scroll.scrollTop < room - SCROLL_EPS;
      scrollMore.classList.toggle("on", more);
    };
    scroll.addEventListener("scroll", syncScrollMore, { passive: true });
    const scrollRo = new ResizeObserver(syncScrollMore);
    scrollRo.observe(body);
    scrollRo.observe(scroll);

    let cleanup: (() => void) | null = null;
    let done = false;

    const finish = (solved: boolean) => {
      if (done) return;
      done = true;
      if (hintTimer !== null) clearInterval(hintTimer);
      scrollRo.disconnect(); // 호스트가 거는 첫 옵저버 — 양 경로에서 반드시 해제

      if (!solved) {
        cleanup?.();
        overlay.remove();
        resolve(false);
        return;
      }

      // 해결: 결과 상태(점등/수평 등)를 잠깐 보여준 뒤 자동으로 닫는다.
      // 클리어 대사는 오버레이가 아니라 방(host)에서 재생 — "끝났다"가 명확해진다.
      Sfx.success();
      overlay.classList.add("solved");
      setTimeout(() => {
        cleanup?.();
        overlay.remove();
        bus.emit(module.manifest.reward.event, { puzzleId: module.manifest.id });
        void showDialogue(module.manifest.narrative.clear, host).then(() => resolve(true));
      }, 1100);
    };

    close.addEventListener("click", () => finish(false));

    cleanup = module.mount({
      root: body,
      actions,
      onDrag,
      say: (anchor) => showDialogue(anchor, overlay),
      solve: () => finish(true),
      exit: () => finish(false),
      fail: () => {
        failCount += 1;
        sessionStats.addFail();
        syncHintLock();
      },
      tokens: tokens as Record<string, unknown>,
    });
  });
}
