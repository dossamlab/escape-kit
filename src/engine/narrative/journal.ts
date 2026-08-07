/**
 * 저널 — 수집한 연구노트와 해결한 퍼즐의 원리 카드를 다시 읽는 갤러리.
 * 방으로 되돌아가지 않고 개념을 복습할 수 있게 한다 (교육용).
 */
import { storyData } from "../../data/story-data";
import type { PuzzleModule } from "../puzzle-host/types";
import { showNote } from "./note";
import { showPrincipleCard } from "./principle-card";
import { Sfx } from "../audio/sfx";

export interface NoteMeta {
  id: string;
  advanced: boolean;
}

/** 저널 오버레이를 연다. 탭 1 = 수집한 연구노트, 탭 2 = 해결한 퍼즐의 원리 카드. */
export function showJournal(
  allNotes: NoteMeta[],
  collected: Set<string>,
  host: HTMLElement,
  puzzles: PuzzleModule[],
  solvedEvents: Set<string>
): void {
  const overlay = document.createElement("div");
  overlay.className = "journal-overlay";
  overlay.dataset.testid = "journal-overlay";

  const panel = document.createElement("div");
  panel.className = "journal-panel";

  const header = document.createElement("div");
  header.className = "journal-header";
  const h = document.createElement("span");
  h.className = "journal-title";
  h.textContent = "탐사 저널";
  const close = document.createElement("button");
  close.className = "journal-close";
  close.dataset.testid = "journal-close";
  close.textContent = "✕";
  close.addEventListener("click", () => overlay.remove());
  header.append(h, close);

  // 노트 목록 (기본 탭)
  const noteList = document.createElement("div");
  noteList.className = "journal-list";
  noteList.dataset.testid = "journal-list";
  // 정렬: id 순 (note-01 … note-13)
  for (const meta of [...allNotes].sort((a, b) => a.id.localeCompare(b.id))) {
    const got = collected.has(meta.id);
    const item = document.createElement("button");
    item.className = "journal-item";
    item.disabled = !got;
    if (got) item.dataset.testid = `journal-item-${meta.id}`;
    const title = storyData[meta.id]?.title ?? meta.id;
    item.textContent = got ? `${title}${meta.advanced ? " ※심화" : ""}` : "??? (미수집)";
    if (got) {
      item.addEventListener("click", () => {
        Sfx.select();
        void showNote(meta.id, meta.advanced, host);
      });
    }
    noteList.appendChild(item);
  }

  // 원리 카드 목록 — 해결(보상 이벤트 발화)한 퍼즐만 열람 가능
  const principleList = document.createElement("div");
  principleList.className = "journal-list";
  principleList.dataset.testid = "journal-principle-list";
  principleList.hidden = true;
  for (const mod of puzzles) {
    const m = mod.manifest;
    const solved = solvedEvents.has(m.reward.event);
    const item = document.createElement("button");
    item.className = "journal-item";
    item.disabled = !solved;
    if (solved) item.dataset.testid = `journal-item-principle-${m.id}`;
    // 방 하나에 퍼즐 여러 개 — `manifest.act`는 '막'이 아니라 **방 번호**로 쓴다
    item.textContent = solved ? `${m.act}번 방 — ${m.concept}` : "??? (미해결)";
    if (solved) {
      item.addEventListener("click", () => {
        Sfx.select();
        void showPrincipleCard(m, host);
      });
    }
    principleList.appendChild(item);
  }

  // 탭바 — "연구노트"가 기본 활성. 개수를 탭에 표기해 두 번째 수집 축(원리 카드)의
  // 존재가 저널을 열자마자 보이게 한다.
  const solvedCount = puzzles.filter((p) => solvedEvents.has(p.manifest.reward.event)).length;
  const tabs = document.createElement("div");
  tabs.className = "journal-tabs";
  const tabNotes = document.createElement("button");
  tabNotes.className = "journal-tab active";
  tabNotes.dataset.testid = "journal-tab-notes";
  tabNotes.textContent = `연구노트 ${collected.size}/${allNotes.length}`;
  const tabPrinciples = document.createElement("button");
  tabPrinciples.className = "journal-tab";
  tabPrinciples.dataset.testid = "journal-tab-principles";
  tabPrinciples.textContent = `원리 카드 ${solvedCount}/${puzzles.length}`;
  const select = (which: "notes" | "principles") => {
    const onNotes = which === "notes";
    tabNotes.classList.toggle("active", onNotes);
    tabPrinciples.classList.toggle("active", !onNotes);
    noteList.hidden = !onNotes;
    principleList.hidden = onNotes;
  };
  tabNotes.addEventListener("click", () => {
    Sfx.select();
    select("notes");
  });
  tabPrinciples.addEventListener("click", () => {
    Sfx.select();
    select("principles");
  });
  tabs.append(tabNotes, tabPrinciples);

  panel.append(header, tabs, noteList, principleList);
  overlay.appendChild(panel);
  host.appendChild(overlay);
  Sfx.select();
}
