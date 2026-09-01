/**
 * 연구노트 열람 오버레이 — 물리 해설 + 박사의 낙서(서사).
 * 텍스트는 story.md 파생 데이터(storyData)만 사용, 하드코딩 금지.
 */
import { storyData } from "../../data/story-data";
import { Sfx } from "../audio/sfx";
import { bindOverlayClose, makeCloseHint } from "./overlay";
import { setInline } from "./markup";

/** 표 구분선 행(|---|---|)인가 */
const isRule = (cells: string[]): boolean => cells.every((c) => /^:?-+:?$/.test(c));

/**
 * 노트 본문 렌더 — story-data의 줄 구조를 블록으로 세운다.
 * `|` 줄 연속 → <table>, `- ` 줄 연속 → <ul>, 나머지 한 줄 = 문단 <p>.
 * (build-story가 표·목록 줄을 제 줄로 보존한다 — 마크다운 파서를 들이지 않는 이유)
 */
function renderNoteBody(text: string): HTMLElement {
  const body = document.createElement("div");
  body.className = "note-body";
  const lines = text.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("|")) {
      const table = document.createElement("table");
      table.className = "note-table";
      let row = 0;
      while (i < lines.length && lines[i].startsWith("|")) {
        const cells = lines[i]
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((c) => c.trim());
        i += 1;
        if (isRule(cells)) continue;
        const tr = document.createElement("tr");
        for (const c of cells) {
          const cell = document.createElement(row === 0 ? "th" : "td");
          setInline(cell, c);
          tr.appendChild(cell);
        }
        table.appendChild(tr);
        row += 1;
      }
      body.appendChild(table);
    } else if (line.startsWith("- ")) {
      const ul = document.createElement("ul");
      ul.className = "note-list";
      while (i < lines.length && lines[i].startsWith("- ")) {
        const li = document.createElement("li");
        setInline(li, lines[i].slice(2));
        ul.appendChild(li);
        i += 1;
      }
      body.appendChild(ul);
    } else {
      const p = document.createElement("p");
      setInline(p, line);
      body.appendChild(p);
      i += 1;
    }
  }
  return body;
}

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

    const body = renderNoteBody(entry.text);

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
