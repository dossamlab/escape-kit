/**
 * 연구노트 열람 오버레이 — 물리 해설 + 박사의 낙서(서사).
 * 텍스트는 story.md 파생 데이터(storyData)만 사용, 하드코딩 금지.
 */
import { storyData } from "../../data/story-data";
import { Sfx } from "../audio/sfx";
import { bindOverlayClose, makeCloseHint } from "./overlay";

export function showNote(noteId: string, advanced: boolean, host: HTMLElement): Promise<void> {
  const entry = storyData[noteId];
  if (!entry) {
    console.warn(`[narrative] 연구노트 없음: ${noteId}`);
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "note-overlay";
    overlay.dataset.testid = "note-overlay";

    const panel = document.createElement("div");
    panel.className = "note-panel";

    const header = document.createElement("div");
    header.className = "note-header";
    const title = document.createElement("span");
    title.className = "note-title";
    title.dataset.testid = "note-title";
    title.textContent = `연구노트 — ${entry.title ?? noteId}`;
    header.appendChild(title);
    if (advanced) {
      const badge = document.createElement("span");
      badge.className = "note-badge";
      badge.dataset.testid = "note-badge";
      badge.textContent = "※ 심화 — 교육과정 밖";
      header.appendChild(badge);
    }

    const body = document.createElement("p");
    body.className = "note-body";
    body.textContent = entry.text;

    const close = document.createElement("button");
    close.className = "note-close";
    close.dataset.testid = "note-close";
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
