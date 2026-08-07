/**
 * 원리 카드 열람 오버레이 — 해결한 퍼즐의 물리 원리를 저널에서 복습한다.
 * 텍스트는 퍼즐 manifest의 principle 배열 (퍼즐 소속 교육 텍스트 — hints와 같은 위치 규약).
 */
import type { PuzzleManifest } from "../puzzle-host/types";
import { Sfx } from "../audio/sfx";
import { bindOverlayClose, makeCloseHint } from "./overlay";

export function showPrincipleCard(manifest: PuzzleManifest, host: HTMLElement): Promise<void> {
  const lines = manifest.principle;
  if (!lines || lines.length === 0) {
    console.warn(`[narrative] 원리 카드 없음: ${manifest.id}`);
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "note-overlay";
    overlay.dataset.testid = "principle-overlay";

    const panel = document.createElement("div");
    panel.className = "note-panel";

    const header = document.createElement("div");
    header.className = "note-header";
    const title = document.createElement("span");
    title.className = "note-title";
    title.dataset.testid = "principle-title";
    title.textContent = `원리 카드 — ${manifest.concept}`;
    header.appendChild(title);
    // 성취기준 코드가 있을 때만 배지 표시 — 교육과정 예외 퍼즐(prism-lock)은 빈 문자열
    if (manifest.curriculum.성취기준) {
      const badge = document.createElement("span");
      badge.className = "note-badge";
      badge.textContent = manifest.curriculum.성취기준;
      header.appendChild(badge);
    }

    const body = document.createElement("ul");
    body.className = "principle-list";
    for (const line of lines) {
      const li = document.createElement("li");
      li.textContent = line;
      body.appendChild(li);
    }

    const close = document.createElement("button");
    close.className = "note-close";
    close.dataset.testid = "principle-close";
    close.textContent = "덮는다";

    const actions = document.createElement("div");
    actions.className = "overlay-actions";
    actions.append(makeCloseHint(), close);

    panel.append(header, body, actions);
    overlay.appendChild(panel);
    host.appendChild(overlay);
    Sfx.note();

    bindOverlayClose(overlay, close, resolve);
  });
}
