/**
 * 방 배치 검산 — 맵의 오브젝트를 읽어 두 가지를 확인한다.
 *
 *  1) 상호작용 대상끼리 1.5타일 이상 떨어져 있는가
 *  2) 각 대상의 **접근 지점**에서 근접 판정(범위 안 최근접 하나)이 그 대상을 고르는가
 *
 * (2)가 이 스크립트의 존재 이유다. 사거리를 넓힌 수색 핫스팟이나 가까이 붙은
 * 문·콘솔은 "범위엔 들지만 다른 게 더 가까워" 엉뚱한 라벨이 뜬다. 실제로
 * 문 앞에서 콘솔 라벨이 떠 e2e가 깨진 적이 있다. 좌표를 바꿀 때마다 돌린다.
 *
 * 접근 지점은 목표 타일에서 걷기 가능 영역으로 끌어당긴 점이며,
 * moveTo의 정지 오차(threshold)만큼 사방으로 흔들어 최악을 본다.
 *
 * 방이 여러 개면 **전부** 검산한다 — 하나만 보면 새 방의 좌표 실수가 그대로 나간다
 * (2번 방을 추가했을 때 실제로 1번 방만 보고 있었다).
 *
 * 사용: node scripts/check-layout.mjs [threshold=0.4]
 */
import { readFileSync, readdirSync } from "node:fs";

// 기본값은 tests/e2e/helpers.ts 의 APPROACH_THRESHOLD 와 같아야 한다.
// 둘이 어긋나면 검산은 통과하는데 실제 e2e에서 옆 오브젝트가 잡힌다.
const threshold = Number(process.argv[2] ?? 0.4);

// src/maps/ 의 방 파일 전부 (types·index 제외)
const roomFiles = readdirSync("src/maps")
  .filter((f) => f.endsWith(".ts") && f !== "types.ts" && f !== "index.ts")
  .sort();

let failed = 0;
for (const file of roomFiles) failed += checkRoom(`src/maps/${file}`) ? 0 : 1;
process.exit(failed ? 1 : 0);

/** 방 하나를 검산한다. 통과면 true. */
function checkRoom(path) {
const src = readFileSync(path, "utf8");

const cols = Number(/cols:\s*(\d+)/.exec(src)[1]);
const rows = Number(/rows:\s*(\d+)/.exec(src)[1]);
// ⚠ blocks 배열 **안**의 사각형만 긁는다. 파일 전체를 훑으면 sealed의 구역
// 사각형까지 통행 불가로 잡혀 봉인 안 오브젝트가 전부 "도달 불가"로 나온다.
// 이 검산은 **봉인이 열린 뒤** 기준이어야 한다 — 결국 다 들어갈 수 있어야 하므로.
const blocksSrc = /blocks:\s*\[([\s\S]*?)\]/.exec(src)?.[1] ?? "";
const blocks = [...blocksSrc.matchAll(/\{\s*x0:\s*(-?[\d.]+),\s*y0:\s*(-?[\d.]+),\s*x1:\s*(-?[\d.]+),\s*y1:\s*(-?[\d.]+)\s*\}/g)]
  .map((m) => ({ x0: +m[1], y0: +m[2], x1: +m[3], y1: +m[4] }));

// id / tile / range 를 오브젝트 리터럴에서 긁는다 (한 객체 안에 셋 다 있다).
// ⚠ objects 배열 **안**만 본다. 파일 전체를 훑으면 sealed의 `id: "core"`가 걸리고,
//   뒤따르는 오브젝트의 tile·range를 제 것처럼 물어 와 유령 오브젝트가 생긴다
//   (2번 방에서 실제로 그랬다 — 접근점에서 "core"가 선택된다는 엉뚱한 실패).
const objsSrc = src.slice(src.indexOf("objects:"));
const objs = [];
for (const m of objsSrc.matchAll(/id:\s*"([^"]+)"[\s\S]{0,400}?tile:\s*\[([-\d.]+),\s*([-\d.]+)\][\s\S]{0,200}?range:\s*([\d.]+)/g)) {
  objs.push({ id: m[1], x: +m[2], y: +m[3], range: +m[4] });
}

const blocked = (x, y) => blocks.some((b) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

console.log(`${path} — 방 ${cols}×${rows}, 오브젝트 ${objs.length}개, threshold ${threshold}`);

// 1) 간격
const tooClose = [];
for (let i = 0; i < objs.length; i++)
  for (let j = i + 1; j < objs.length; j++) {
    const d = dist(objs[i], objs[j]);
    if (d < 1.5) tooClose.push(`${objs[i].id}–${objs[j].id} ${d.toFixed(2)}`);
  }
console.log(tooClose.length ? `  [간격] 1.5 미만: ${tooClose.join(", ")}` : "  [간격] 모두 1.5 이상 OK");

// 2) 접근 지점에서 근접 판정이 의도한 대상을 고르는가
//    걷기 가능 격자를 0.1 간격으로 훑어 목표에 가장 가까운 지점을 접근 지점으로 삼는다.
const walkable = [];
for (let x = 0; x <= cols - 1; x += 0.1)
  for (let y = 0; y <= rows - 1; y += 0.1)
    if (!blocked(x, y)) walkable.push({ x: +x.toFixed(1), y: +y.toFixed(1) });

const fails = [];
for (const o of objs) {
  let best = null, bestD = Infinity;
  for (const w of walkable) {
    const d = dist(o, w);
    if (d < bestD) { bestD = d; best = w; }
  }
  if (bestD > o.range) {
    fails.push(`${o.id}: 도달 불가 (최근접 ${bestD.toFixed(2)} > range ${o.range})`);
    continue;
  }
  // 정지 오차만큼 흔들어 최악 확인
  let worst = null;
  for (const dx of [-threshold, 0, threshold])
    for (const dy of [-threshold, 0, threshold]) {
      const p = { x: best.x + dx, y: best.y + dy };
      if (blocked(p.x, p.y)) continue;
      let win = null, winD = Infinity;
      for (const c of objs) {
        const d = dist(c, p);
        if (d <= c.range && d < winD) { winD = d; win = c; }
      }
      if (!win || win.id !== o.id) worst = { p, got: win?.id ?? "(범위 안 없음)" };
    }
  if (worst) {
    fails.push(
      `${o.id}: 접근점 (${worst.p.x.toFixed(1)},${worst.p.y.toFixed(1)})에서 "${worst.got}"가 선택됨`
    );
  }
}
console.log(fails.length ? "  [근접 판정] 문제:\n    " + fails.join("\n    ") : "  [근접 판정] 모든 대상이 자기 접근점에서 선택됨 OK");
return !(tooClose.length || fails.length);
}
