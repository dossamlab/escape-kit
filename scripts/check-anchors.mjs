#!/usr/bin/env node
/**
 * 앵커 참조 검산 — 코드·manifest가 부르는 스토리 앵커가 docs/story.md에 실제로 있는가.
 *
 * 앵커 오타는 런타임에 console.warn 한 줄을 남기고 **무음으로 지나간다**. 대사가 안 나오는데
 * 이유를 알 수 없는 상태가 되므로, 여기서 빌드를 세운다. (`scripts/check-layout.mjs`와 같은 자리)
 *
 * 같은 패스에서 `note-NN` 중복도 잡는다 — 노트 번호는 평평한 이름공간이고,
 * 중복되면 build-story가 **나중 것으로 조용히 덮어쓴다**.
 *
 * 사용: node scripts/check-anchors.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** "story.md#foo" · "#foo" · "foo" → "foo" */
const norm = (a) => a.replace(/^story\.md/, "").replace(/^#/, "");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

// ── 1. 정의된 앵커: 생성물이 아니라 원본에서 읽는다 ──────────────────
const story = readFileSync(join(ROOT, "docs/story.md"), "utf8");
const defined = new Set();
const noteSeen = new Map();
for (const line of story.split(/\r?\n/)) {
  const dlg = /^### #([\w-]+)/.exec(line);
  if (dlg) defined.add(dlg[1]);
  const note = /^#### (note-\d+) — /.exec(line);
  if (note) {
    defined.add(note[1]);
    noteSeen.set(note[1], (noteSeen.get(note[1]) ?? 0) + 1);
  }
}

/**
 * 주석을 지운다 — **주석 속 예시 앵커까지 잡으면 거짓 실패가 난다.**
 * (`// 예: "#item-…"` 한 줄을 적었다가 빌드가 죽는 일이 실제로 있었다.)
 * 과하게 지워서 진짜 참조를 놓칠 위험보다, 거짓 실패로 사람을 헤매게 하는 쪽이 나쁘다.
 */
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

// ── 2. 참조된 앵커: src/ 전체의 "#앵커" 꼴 문자열 리터럴 ──────────────
const files = walk(join(ROOT, "src")).filter(
  (f) => /\.(ts|json)$/.test(f) && !f.endsWith("story-data.ts")
);
const refs = new Map(); // 앵커 → [파일…]
for (const f of files) {
  const src = stripComments(readFileSync(f, "utf8"));
  for (const m of src.matchAll(/"((?:story\.md)?#[\w-]+)"/g)) {
    // CSS 색 리터럴("#fff", "#1a2b3c")은 앵커가 아니다
    if (/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(m[1])) continue;
    const key = norm(m[1]);
    if (!refs.has(key)) refs.set(key, []);
    refs.get(key).push(f.slice(ROOT.length).replace(/\\/g, "/"));
  }
}

// ── 3. 판정 ────────────────────────────────────────────────────
const missing = [...refs].filter(([key]) => !defined.has(key));
const dupes = [...noteSeen].filter(([, n]) => n > 1);

for (const [key, where] of missing) {
  console.error(`  ✗ #${key} — story.md에 없음  (${[...new Set(where)].join(", ")})`);
}
for (const [id, n] of dupes) {
  console.error(`  ✗ ${id} — story.md에 ${n}번 정의됨 (나중 것이 앞엣것을 덮는다)`);
}

if (missing.length || dupes.length) {
  console.error(`\n앵커 검산 실패: 없는 참조 ${missing.length}건, 중복 노트 ${dupes.length}건`);
  process.exit(1);
}
console.log(`  [앵커] 정의 ${defined.size}개 · 참조 ${refs.size}개 — 모두 연결됨 OK`);
