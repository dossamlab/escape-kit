/**
 * 배경 아트 픽셀 좌표 → 타일 좌표 (measure-room의 역변환).
 * 배경 그림 위의 가구가 몇 번 타일인지 알아내 오브젝트·봉인 사각형을 배치할 때 쓴다.
 *
 * 원리: measure-room이 찍어 준 바닥 마름모 꼭짓점이 곧 타일 (0,0)·(N,0)·(0,N)·(N,N)이다.
 *   art_dx = (x−y)·ux,  art_dy = (x+y)·uy  (ux·uy = 타일 한 칸의 아트 픽셀 폭·높이 절반)
 *
 * 사용: node scripts/art-to-tile.mjs <png> <N> <px,py> [<px,py> …]
 */
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const [, , file, nStr, ...points] = process.argv;
const N = Number(nStr);

const out = execFileSync("node", [join(root, "scripts", "measure-room.mjs"), file, String(N)], {
  encoding: "utf8",
});
const m = /뒤\((\d+),(\d+)\).*?동\((\d+),(\d+)\).*?남\((\d+),(\d+)\).*?서\((\d+),(\d+)\)/.exec(out);
if (!m) {
  console.error(out);
  throw new Error("measure-room 출력에서 꼭짓점을 못 읽었다");
}
const [bx, by, ex, ey] = [+m[1], +m[2], +m[3], +m[4]];
const ux = (ex - bx) / N; // 타일 1칸의 아트 x 성분
const uy = (ey - by) / N; // 타일 1칸의 아트 y 성분

console.log(`${file} N=${N} — 타일 1칸 = 아트 (${ux.toFixed(2)}, ${uy.toFixed(2)})px`);
for (const p of points) {
  const [px, py] = p.split(",").map(Number);
  const dx = (px - bx) / ux;
  const dy = (py - by) / uy;
  const x = (dx + dy) / 2;
  const y = (dy - dx) / 2;
  console.log(`  아트(${px},${py}) → 타일 [${x.toFixed(2)}, ${y.toFixed(2)}]`);
}
