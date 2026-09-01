/**
 * 도달 가능성 검산 — 스폰에서 걸어서 **모든 오브젝트에 닿을 수 있는가**.
 *
 * `blocks`(가구·난간)를 늘리다 보면 어느 순간 구역 하나가 통째로 막힌다. 그런데 그건
 * 타입 검사에도, e2e에도 안 잡힌다(그 구역을 걷는 spec이 없으면). 실제로 방을 못 깨는
 * 빌드가 조용히 나갈 수 있다 — 이 스크립트가 그 자리를 막는다.
 *
 * 원리: 엔진의 이동 규칙을 그대로 흉내 낸 격자 BFS.
 *   - `Game.isBlocked(x,y)`와 같은 판정(blocks 사각형 포함 여부)
 *   - `margin = 0.4`로 방 가장자리를 잘라내는 것도 동일
 *   - **봉인(sealed)은 무시한다** — 봉인은 진행에 따라 열리므로, 최종 상태 기준으로 본다
 *   - 이동은 축 분리(x·y 따로) — 엔진과 같다. 그래서 오목한 포켓도 같이 재현된다
 *
 * 오브젝트 도달 판정: `tile`에서 `range` 안에 **걸어갈 수 있는 칸이 하나라도** 있으면 OK.
 * (그 칸에 서면 상호작용 라벨이 뜬다)
 *
 * 사용: node scripts/check-reach.mjs [격자해상도=0.2]
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const STEP = Number(process.argv[2] ?? 0.2);
const MARGIN = 0.4; // Game.ts의 margin과 같아야 한다

/** 방 파일에서 맵 데이터를 뽑는다 (tsc 없이 — 정규식으로 리터럴만 읽는다) */
function loadMap(file) {
  const src = readFileSync(file, "utf8");
  const num = (k) => {
    const m = new RegExp(`\\b${k}:\\s*(-?[\\d.]+)`).exec(src);
    if (!m) throw new Error(`${k}를 찾지 못했다: ${file}`);
    return Number(m[1]);
  };
  const spawnM = /spawn:\s*\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]/.exec(src);
  if (!spawnM) throw new Error("spawn을 찾지 못했다");

  // blocks: [ { x0: .., y0: .., x1: .., y1: .. }, ... ]  — objects 앞에 오는 배열만
  const blocksSrc = /blocks:\s*\[([\s\S]*?)\n\s{2}\]/.exec(src)?.[1] ?? "";
  const blocks = [...blocksSrc.matchAll(
    /x0:\s*(-?[\d.]+),\s*y0:\s*(-?[\d.]+),\s*x1:\s*(-?[\d.]+),\s*y1:\s*(-?[\d.]+)/g
  )].map((m) => ({ x0: +m[1], y0: +m[2], x1: +m[3], y1: +m[4] }));

  // objects: id·tile·range + **핵심 경로인가**(퍼즐 장치·문). 뒤에서 검산 강도가 갈린다.
  const objects = [...src.matchAll(
    // 끝맺음에 **배열 닫힘(`\n  ]`)도 넣는다** — 안 넣으면 마지막 오브젝트가 조용히 빠진다
    /id:\s*"([^"]+)"([\s\S]{0,320}?)tile:\s*\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]([\s\S]{0,240}?)range:\s*([\d.]+)([\s\S]{0,240}?)(?:\n\s{4}[{}]|\n\s{2}\])/g
  )].map((m) => {
    const body = `${m[2]}${m[5]}${m[7]}`;
    return {
      id: m[1],
      tile: [+m[3], +m[4]],
      range: +m[6],
      critical: /\bpuzzleId:|\bdoor:/.test(body),
    };
  });

  return {
    cols: num("cols"),
    rows: num("rows"),
    spawn: [Number(spawnM[1]), Number(spawnM[2])],
    blocks,
    objects,
  };
}

// 방 목록은 src/maps/ 에서 읽는다 — check-layout.mjs와 같은 규칙이다.
// 코드에 박아 두면 킷을 받아 방을 새로 만든 사람에게서 검산이 조용히 빠진다.
const ROOMS = readdirSync(join(root, "src", "maps"))
  .filter((f) => f.endsWith(".ts") && f !== "types.ts" && f !== "index.ts")
  .map((f) => f.replace(/\.ts$/, ""))
  .sort();
const argRoom = process.argv[2];
const targets = argRoom ? [argRoom.replace(/\.ts$/, "")] : ROOMS;
let failed = 0;
for (const roomId of targets) checkRoom(roomId);
process.exit(failed ? 1 : 0);

function checkRoom(roomId) {
const mapFile = join(root, "src", "maps", `${roomId}.ts`);
const map = loadMap(mapFile);

const isBlocked = (x, y) => map.blocks.some((b) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1);

const lo = MARGIN;
const hiX = map.cols - 1 - MARGIN;
const hiY = map.rows - 1 - MARGIN;
const nx = Math.round((hiX - lo) / STEP) + 1;
const ny = Math.round((hiY - lo) / STEP) + 1;
const gx = (i) => lo + i * STEP;
const gy = (j) => lo + j * STEP;
const key = (i, j) => j * nx + i;

// 스폰에서 가장 가까운 걸을 수 있는 칸에서 시작
let start = null;
let best = Infinity;
for (let j = 0; j < ny; j++)
  for (let i = 0; i < nx; i++) {
    if (isBlocked(gx(i), gy(j))) continue;
    const d = Math.hypot(gx(i) - map.spawn[0], gy(j) - map.spawn[1]);
    if (d < best) { best = d; start = [i, j]; }
  }
if (!start) {
  console.error(`✗ ${roomId}: 스폰 주변에 걸을 수 있는 칸이 없다`);
  failed = 1;
  return;
}
if (best > 1) {
  console.error(`✗ ${roomId}: 스폰 [${map.spawn}]이 blocks 안에 있다 (가장 가까운 빈 칸까지 ${best.toFixed(2)})`);
  failed = 1;
  return;
}

// 축 분리 BFS — 엔진과 같은 이동 규칙
const seen = new Uint8Array(nx * ny);
const queue = [start];
seen[key(...start)] = 1;
for (let head = 0; head < queue.length; head++) {
  const [i, j] = queue[head];
  for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const ni = i + di;
    const nj = j + dj;
    if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) continue;
    if (seen[key(ni, nj)]) continue;
    if (isBlocked(gx(ni), gy(nj))) continue;
    seen[key(ni, nj)] = 1;
    queue.push([ni, nj]);
  }
}

const walkable = queue.length;
const unreachable = [];
for (const o of map.objects) {
  let ok = false;
  for (let j = 0; j < ny && !ok; j++)
    for (let i = 0; i < nx && !ok; i++) {
      if (!seen[key(i, j)]) continue;
      if (Math.hypot(gx(i) - o.tile[0], gy(j) - o.tile[1]) <= o.range) ok = true;
    }
  if (!ok) unreachable.push(o);
}

console.log(
  `src/maps/${roomId}.ts — 방 ${map.cols}×${map.rows}, 차단 ${map.blocks.length}개, ` +
    `오브젝트 ${map.objects.length}개 (격자 ${STEP})`
);
console.log(`  [도달] 스폰에서 걸을 수 있는 칸 ${walkable} / ${nx * ny}`);

/**
 * 2차 검산 — **직진 접근**. BFS는 "돌아가면 닿는다"만 말한다. 그런데 e2e의 `moveTo`는
 * 목표를 향해 곧장 밀고 가는 그리디 이동이라, 난간 틈이 접근선에서 어긋나 있으면
 * 벽에 붙어 멈춘다(패러데이 구역이 실제로 그렇게 막혔다 — 2026-08-11).
 *
 * ⚠ **핵심 경로(퍼즐 장치·문)에만 건다.** 전 오브젝트에 걸었더니 구역 안쪽 노트까지
 *   직선으로 닿아야 해서 난간 틈이 4칸으로 벌어졌고, 결국 난간이 난간 구실을 못 했다.
 *   사람은 막히면 돌아간다 — 노트·수색은 BFS 도달성이면 충분하다.
 *
 * 출발점은 스폰 **또는 이미 직진으로 닿은 다른 오브젝트 앞**이다(사슬 확장).
 * 주파 spec은 오브젝트를 차례로 순회하므로 다음 다리(leg)의 출발점은 항상 직전
 * 오브젝트 앞이다 — 수로가 구역을 가르는 방(방2)은 스폰 직선으로는 원리상 못 닿고,
 * 그걸 실패로 치면 수로를 걷어내는 수밖에 없다(2026-08-13 3방 개편 때 일반화).
 * 단 사슬로도 못 닿으면 여전히 실패다 — spec이 어떤 순서로도 걸을 수 없다는 뜻이다.
 *
 * moveTo와 같은 규칙으로 흉내 낸다: 매 스텝 목표 방향으로 재조준, 축 분리 이동.
 */
function greedyReaches(target, range, from) {
  let [px, py] = from;
  const stepLen = STEP;
  for (let n = 0; n < 4000; n++) {
    const d = Math.hypot(px - target[0], py - target[1]);
    if (d <= range) return true;
    const ux = (target[0] - px) / d;
    const uy = (target[1] - py) / d;
    const nx2 = px + ux * stepLen;
    const ny2 = py + uy * stepLen;
    let moved = false;
    // 엔진과 같이 축을 따로 판정한다
    if (!isBlocked(nx2, py) && nx2 > lo && nx2 < hiX) { px = nx2; moved = true; }
    if (!isBlocked(px, ny2) && ny2 > lo && ny2 < hiY) { py = ny2; moved = true; }
    if (!moved) return false;
  }
  return false;
}

// 오브젝트 앞(= 타일에 가장 가까운 걷기 칸)을 사슬의 출발점으로 쓴다.
function approachPoint(o) {
  let best = null, bestD = Infinity;
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      if (!seen[key(i, j)]) continue;
      const d = Math.hypot(gx(i) - o.tile[0], gy(j) - o.tile[1]);
      if (d < bestD) { bestD = d; best = [gx(i), gy(j)]; }
    }
  return best;
}

const sources = [map.spawn];
const pending = new Set(map.objects);
let grew = true;
while (grew) {
  grew = false;
  for (const o of [...pending]) {
    if (sources.some((s) => greedyReaches(o.tile, o.range, s))) {
      pending.delete(o);
      const p = approachPoint(o);
      if (p) sources.push(p);
      grew = true;
    }
  }
}
const critical = map.objects.filter((o) => o.critical);
const noStraightPath = critical.filter((o) => pending.has(o));

if (unreachable.length) {
  console.error(`  [도달] ✗ 걸어서 닿을 수 없는 오브젝트 ${unreachable.length}개:`);
  for (const o of unreachable) console.error(`     ${o.id} (tile ${o.tile}, range ${o.range})`);
  console.error("  난간·가구 blocks에 드나들 틈을 내라 — 지금은 방을 깰 수 없다.");
  failed = 1;
  return;
}
console.log(`  [도달] 모든 오브젝트에 걸어서 닿는다 OK`);

if (noStraightPath.length) {
  console.error(`  [직진] ✗ 목표를 향해 곧장 걸으면 막히는 오브젝트 ${noStraightPath.length}개:`);
  for (const o of noStraightPath) console.error(`     ${o.id} (tile ${o.tile})`);
  console.error("  난간 틈을 **스폰→장치 직선이 지나는 자리**로 옮겨라 — 지금은 벽을 타고 돌아야 한다.");
  failed = 1;
  return;
}
console.log(`  [직진] 핵심 경로 ${critical.length}개(퍼즐 장치·문)에 곧장 걸어서 닿는다 OK`);
}
