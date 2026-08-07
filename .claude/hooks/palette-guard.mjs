#!/usr/bin/env node
// PreToolUse 훅: assets-src/ 아래 SVG에 design-tokens.json 외의 hex 색상이
// 들어가는 것을 결정적으로 차단한다 (exit 2 = 차단, stderr가 사유).
// 대상 외 파일은 항상 exit 0으로 통과.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

let input = "";
try {
  input = readFileSync(0, "utf8");
} catch {
  process.exit(0);
}

let payload;
try {
  payload = JSON.parse(input);
} catch {
  process.exit(0);
}

const toolInput = payload.tool_input ?? {};
const filePath = String(toolInput.file_path ?? "").replace(/\\/g, "/");

// assets-src/ 아래 .svg와 .pix를 검사 (_lib 포함 — 부품도 토큰만 써야 한다)
const isSvg = /(^|\/)assets-src\/.*\.svg$/i.test(filePath);
const isPix = /(^|\/)assets-src\/.*\.pix$/i.test(filePath);
if (!isSvg && !isPix) process.exit(0);

// Write는 content, Edit은 new_string이 새로 들어가는 내용
const content = String(toolInput.content ?? toolInput.new_string ?? "");
if (!content) process.exit(0);

// .pix: legend는 color.토큰명만 — hex가 한 글자라도 있으면 차단
if (isPix) {
  if (/#[0-9a-fA-F]{3,8}\b/.test(content)) {
    console.error(`[palette-guard] ${filePath}: .pix에는 hex를 쓸 수 없습니다 — legend에 color.<토큰명>만 사용하세요.`);
    process.exit(2);
  }
  process.exit(0);
}

// design-tokens.json의 모든 hex 값을 허용 목록으로 수집
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
let allowed = new Set();
try {
  const tokens = JSON.parse(readFileSync(resolve(root, "design-tokens.json"), "utf8"));
  const walk = (v) => {
    if (typeof v === "string" && /^#[0-9a-fA-F]{3,8}$/.test(v)) allowed.add(v.toLowerCase());
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(tokens);
} catch (e) {
  console.error(`palette-guard: design-tokens.json을 읽을 수 없습니다 (${e.message})`);
  process.exit(2);
}

const hexes = content.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
const violations = [...new Set(hexes.map((h) => h.toLowerCase()))].filter(
  (h) => !allowed.has(h)
);

if (violations.length > 0) {
  console.error(
    `palette-guard 차단: design-tokens.json에 없는 hex 색상 사용 — ${violations.join(", ")}\n` +
      `SVG에는 hex 대신 {{color.이름}} 플레이스홀더를 쓰세요. ` +
      `새 색이 꼭 필요하면 사용자 승인 후 design-tokens.json에 먼저 등록하세요.`
  );
  process.exit(2);
}

// 토큰과 우연히 같은 hex라도 하드코딩보다 플레이스홀더를 권장 (경고만, 차단 안 함)
process.exit(0);
