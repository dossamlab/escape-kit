/**
 * 발견 오버레이 — 수색 결과(단서 발견/꽝)를 보여준다.
 * 텍스트는 story.md 파생 데이터만 사용 (하드코딩 금지 유지).
 * 노트 오버레이(note.ts)와 같은 패밀리의 시각 언어 — 단서는 홀로그램 블루 톤.
 */
import { getEntry } from "./dialogue";
import { ITEMS } from "../../data/items";
import { Sfx } from "../audio/sfx";
import { bindOverlayClose, makeCloseHint } from "./overlay";

/**
 * 수색 결과 표시. itemId가 있으면 "획득" 배지를 함께 보여준다.
 * footerAnchor는 재수색일 때 본문 아래에 덧붙는 안내(이미 살펴본 곳)다.
 * 닫을 때 resolve.
 */
export function showDiscovery(
  anchor: string,
  itemId: string | undefined,
  host: HTMLElement,
  footerAnchor?: string
): Promise<void> {
  const entry = getEntry(anchor);
  if (!entry) {
    console.warn(`[narrative] 수색 앵커 없음: ${anchor}`);
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "discovery-overlay";
    overlay.dataset.testid = "discovery-overlay";

    const panel = document.createElement("div");
    panel.className = "discovery-panel";

    if (itemId && ITEMS[itemId]) {
      const badge = document.createElement("div");
      badge.className = "discovery-badge";
      badge.dataset.testid = "discovery-item";
      badge.textContent = `${ITEMS[itemId].emoji} 획득 — ${ITEMS[itemId].name}`;
      panel.appendChild(badge);
    }

    const body = document.createElement("p");
    body.className = "discovery-body";
    body.textContent = entry.text;

    const close = document.createElement("button");
    close.className = "note-close";
    close.dataset.testid = "discovery-close";
    close.textContent = "닫는다";

    panel.append(body);

    // 재수색: 같은 단서를 다시 읽되, 새로울 게 없다는 안내를 아래에 덧붙인다
    if (footerAnchor) {
      const footer = getEntry(footerAnchor);
      if (footer) {
        const note = document.createElement("p");
        note.className = "discovery-footer";
        note.dataset.testid = "discovery-footer";
        note.textContent = footer.text;
        panel.appendChild(note);
      }
    }

    const actions = document.createElement("div");
    actions.className = "overlay-actions";
    actions.append(makeCloseHint(), close);
    panel.appendChild(actions);

    overlay.appendChild(panel);
    host.appendChild(overlay);
    Sfx.note();

    bindOverlayClose(overlay, close, resolve);
  });
}
