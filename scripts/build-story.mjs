#!/usr/bin/env node
/**
 * docs/story.md → src/data/story-data.ts 자동 생성.
 * story.md가 대사·연구노트의 단일 소스 — 이 스크립트가 코드 하드코딩을 대체한다.
 *
 * 인식하는 형식:
 *   ### #anchor-id          → 대사 엔트리 (이후 "> " 인용 줄들)
 *   #### note-XX — 제목      → 연구노트 엔트리 (「」는 벗겨냄)
 *   인용 줄 안의 **이름**:    → 화자
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(root, "docs", "story.md"), "utf8");

const entries = {};
let cur = null;

function flush() {
  if (!cur || cur.quotes.length === 0) {
    cur = null;
    return;
  }
  let speaker;
  const paras = [[]];
  for (const q of cur.quotes) {
    if (q.trim() === "") {
      if (paras[paras.length - 1].length > 0) paras.push([]);
      continue;
    }
    const sm = /^\*\*(.+?)\*\*: ?(.*)$/.exec(q);
    if (sm) {
      if (!speaker) speaker = sm[1];
      if (paras[paras.length - 1].length > 0) paras.push([]);
      paras[paras.length - 1].push(sm[2]);
    } else {
      paras[paras.length - 1].push(q);
    }
  }
  // 문단 안에서 표 행(|)과 목록 항목(- )은 제 줄을 지킨다 — 노트 오버레이가
  // 이 줄 구조로 <table>/<ul>을 세운다. 목록 항목의 이어지는 줄은 항목에 붙인다.
  const joinPara = (lines) => {
    const out = [];
    for (const raw of lines) {
      const t = raw.trim();
      const prev = out[out.length - 1];
      if (out.length === 0 || t.startsWith("|") || t.startsWith("- ") || prev.startsWith("|")) {
        out.push(t);
      } else {
        out[out.length - 1] = `${prev} ${t}`;
      }
    }
    return out.join("\n").trim();
  };
  let text = paras
    .filter((p) => p.length > 0)
    .map((p) => joinPara(p))
    // *(...)* 단독 문단은 연출 지시(프로덕션 노트) — 게임 텍스트에서 제외
    .filter((p) => !/^\*\(.+\)\*$/.test(p))
    // 문단 전체가 따옴표로 감싸인 대사만 벗긴다. 앞뒤를 각각 벗기면
    // 본문 중간에 인용이 있고 문단이 인용으로 끝나는 경우(예: … 한 줄 더. "귀환한
    // 사람은 없다.")에 닫는 따옴표만 사라져 짝이 안 맞는 문장이 게임에 나간다.
    .map((p) => (p.length > 1 && p.startsWith('"') && p.endsWith('"') ? p.slice(1, -1) : p))
    .join("\n");
  // 강조 마크업 제거 (게임 내 표시는 플레인 텍스트)
  text = text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1").trim();
  entries[cur.id] = { ...(speaker && { speaker }), ...(cur.title && { title: cur.title }), text };
  cur = null;
}

for (const line of src.split(/\r?\n/)) {
  let m;
  if ((m = /^### #([\w-]+)/.exec(line))) {
    flush();
    cur = { id: m[1], quotes: [] };
  } else if ((m = /^#### (note-\d+) — (.+)$/.exec(line))) {
    flush();
    const title = m[2].replace(/[「」]/g, "").replace(/\s*※.*$/, "").trim();
    cur = { id: m[1], title, quotes: [] };
  } else if (/^(#{1,6} |---)/.test(line)) {
    flush();
  } else if (cur && /^>/.test(line)) {
    cur.quotes.push(line.replace(/^> ?/, ""));
  }
}
flush();

const body = Object.entries(entries)
  .map(([id, e]) => `  ${JSON.stringify(id)}: ${JSON.stringify(e)},`)
  .join("\n");

const out = `/**
 * ⚠ 자동 생성 파일 — 직접 수정 금지.
 * 원본: docs/story.md  /  생성: npm run story (scripts/build-story.mjs)
 */

export interface StoryEntry {
  speaker?: string;
  title?: string;
  text: string;
}

export const storyData: Record<string, StoryEntry> = {
${body}
};
`;

writeFileSync(join(root, "src", "data", "story-data.ts"), out);
console.log(`story-data.ts 생성: ${Object.keys(entries).length}개 엔트리 (${Object.keys(entries).join(", ")})`);
