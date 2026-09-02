#!/usr/bin/env node
/**
 * 그리드 창(tools/tiles.html) 안내 — 주소를 찍고, 열기 전에 걸리는 두 조건을 미리 본다.
 *
 * 이 창은 **배경 PNG 위에** 칠하는 도구다. `npm run assets`를 안 돌렸거나 개발 서버가
 * 꺼져 있으면 빈 판만 뜨는데, 그걸 "도구가 고장났다"로 읽고 좌표를 눈대중으로 돌아가는 것이
 * 이 킷에서 가장 비싼 실수다 — 실측으로 45px(≈0.85타일)씩 어긋났다.
 *
 *   npm run tiles
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT) || 5373;
const URL = `http://localhost:${PORT}/tools/tiles.html`;

// 터미널이 아니면 escape 코드를 빼둔다 — 로그로 리다이렉트했을 때 읽을 수 있어야 한다.
const c = (code) => (s) => (process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s);
const B = c(1), DIM = c(2), OK = c(32), NO = c(33);

// 방 목록은 src/maps/에서 읽는다 — check-reach·check-layout과 같은 규칙이다.
const rooms = readdirSync(join(ROOT, "src", "maps"))
  .filter((f) => f.endsWith(".ts") && f !== "types.ts" && f !== "index.ts")
  .map((f) => f.replace(/\.ts$/, ""))
  .sort();

// 배경 파일 이름은 방 id가 아니라 background.sprite다. 둘이 같은 방도 있어 눈에 안 띈다.
const spriteOf = (room) =>
  readFileSync(join(ROOT, "src", "maps", `${room}.ts`), "utf8").match(
    /background:\s*\{[^}]*?sprite:\s*"([^"]+)"/s,
  )?.[1] ?? room;

console.log(`\n${B("그리드 창")} — 걷기 금지 칸과 핫스팟을 배경 그림 위에서 직접 찍는다\n`);
console.log(`  ${B(URL)}\n`);

const missing = [];
for (const room of rooms) {
  const sprite = spriteOf(room);
  const has = existsSync(join(ROOT, "public", "assets", `${sprite}.png`));
  console.log(`  ${has ? OK("✓") : NO("✗")} ${room.padEnd(20)} ${DIM(`public/assets/${sprite}.png`)}`);
  if (!has) missing.push(room);
}

const alive = await fetch(URL, { signal: AbortSignal.timeout(1500) })
  .then((r) => r.ok)
  .catch(() => false);

console.log("");
if (missing.length)
  console.log(`  ${NO("!")} 배경 PNG가 없는 방이 있다 — 먼저 ${B("npm run assets")}. 없으면 빈 판만 뜬다.`);
if (!alive)
  console.log(`  ${NO("!")} ${PORT}번 개발 서버가 꺼져 있다 — 다른 터미널에서 ${B("npm run dev")}.`);
if (!missing.length && alive) console.log(`  ${OK("준비됐다.")} 위 주소를 브라우저에서 열면 된다.`);

console.log(`
  ${DIM("칠한 뒤:")}
    1. 「결과 복사」 → mark.txt 로 저장
    2. node scripts/blocks-from-mark.mjs mark.txt   ${DIM("→ 최소 개수의 blocks 사각형")}
    3. 그 결과를 src/maps/<방>.ts 의 blocks 에 붙인다
    4. npm run reach                                ${DIM("→ 구역이 통째로 막히지 않았는지 검산")}
`);
