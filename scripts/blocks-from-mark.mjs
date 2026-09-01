// ASCII 막힘 지도 -> 최소 개수의 blocks 사각형. 행=y, 열=x, '#'=막힘.
// 타일 t는 연속좌표 [t-0.5, t+0.5]를 덮는다 (isBlocked는 경계 포함).
import { readFileSync } from "node:fs";
const lines = readFileSync(process.argv[2], "utf8").split(/\r?\n/).filter((l) => /^[.#]+$/.test(l));
const N = lines.length;
const g = Array.from({ length: N }, (_, x) => Array.from({ length: N }, (_, y) => lines[y][x] === "#"));
const used = Array.from({ length: N }, () => new Array(N).fill(false));
const rects = [];
for (let y = 0; y < N; y++)
  for (let x = 0; x < N; x++) {
    if (!g[x][y] || used[x][y]) continue;
    let w = 0;
    while (x + w < N && g[x + w][y] && !used[x + w][y]) w++;
    let h = 1;
    outer: while (y + h < N) {
      for (let k = 0; k < w; k++) if (!g[x + k][y + h] || used[x + k][y + h]) break outer;
      h++;
    }
    for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) used[x + i][y + j] = true;
    rects.push({ x0: x - 0.5, y0: y - 0.5, x1: x + w - 0.5, y1: y + h - 0.5 });
  }
// 격자 밖도 확실히 막는다 — 가장자리 사각형을 바깥으로 늘린다
for (const r of rects) {
  if (r.x0 <= -0.5) r.x0 = -2;
  if (r.y0 <= -0.5) r.y0 = -2;
  if (r.x1 >= N - 0.5) r.x1 = N + 1;
  if (r.y1 >= N - 0.5) r.y1 = N + 1;
}
console.log(`  blocks: [ // 사용자 실측 마킹 (tiles.html), ${rects.length}개`);
for (const r of rects) console.log(`    { x0: ${r.x0}, y0: ${r.y0}, x1: ${r.x1}, y1: ${r.y1} },`);
console.log("  ],");
console.error(`tiles blocked: ${g.flat().filter(Boolean).length} -> rects ${rects.length}`);
