/**
 * 여러 방이 한 장에 담겨 나온 생성물에서 **방 하나만 떼어내** 기존 프레이밍으로 정규화한다.
 *
 * 왜 필요한가: 생성기가 세 방을 한 시트에 뽑아 주면, 잘라 낸 조각에도 이웃 방 귀퉁이가
 * 남는다. `measure-room.mjs`는 **비-보이드 실루엣의 최좌·최우·최하**로 바닥 마름모
 * 꼭짓점을 잡으므로 그 귀퉁이가 섞이면 캘리브레이션이 통째로 틀어진다(실측: scaleY 48.9).
 *
 * 하는 일 두 가지:
 *   ① **가장 큰 덩어리 하나**만 남기고 나머지를 보이드로 칠한다.
 *      (방 껍데기가 가장 크고, 이웃 조각은 보이드로 끊겨 있다)
 *   ② 남은 실루엣을 1024² 캔버스에 **기존 배경과 같은 자리·같은 크기**로 얹는다.
 *      `measure-room`의 INSET 보정이 픽셀 절대값이라, 프레이밍이 다르면 그 보정이
 *      어긋난다. 기준 프레이밍에 맞춰 두면 기존 방과 같은 조건이 된다.
 *
 * ⚠ 보이드 색은 네 모서리의 **평균이 아니라 가장 어두운 것**으로 잡는다. 조각이 모서리에
 *   걸치면 평균이 오염돼 판정이 통째로 망가진다(실측: 방1 좌하 모서리가 이웃 방의 초록).
 * ⚠ 덩어리는 "보이드가 아닌 픽셀"이 아니라 **"바깥 보이드에 닿지 않는 픽셀"**로 잡는다.
 *   방 안에도 보이드만큼 어두운 그림자가 있어서, 색만으로 가르면 방이 조각조각 난다.
 *
 * 사용:
 *   node scripts/isolate-room.mjs <in> --bbox            덩어리 목록만 출력(어느 방이 몇 번인지 확인)
 *   node scripts/isolate-room.mjs <in> <out.png>         가장 큰 덩어리를 분리 + 정규화 저장
 *   node scripts/isolate-room.mjs <in> <out.png> --rank 2  크기 2번째 덩어리 (시트에서 둘째 방)
 *   … --tol 25   보이드 판정을 조인다 (방이 두 덩어리로 갈릴 때)
 *
 * 시트 한 장에 방이 셋이면 `--bbox`로 덩어리 위치를 먼저 보고, rank를 골라 세 번 돌린다.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

/**
 * 기준 프레이밍 — `assets-src/gen-src/room-legacy.v2.src.jpg`(1024²)에서 잰 실루엣 상자.
 * `node scripts/isolate-room.mjs assets-src/gen-src/room-legacy.v2.src.jpg --bbox`로 다시 잴 수 있다.
 */
const REF = { canvas: 1024, x0: 42, y0: 59, x1: 981, y1: 937 };

const [, , inPath, outArg, ...rest] = process.argv;
if (!inPath || !outArg) {
  console.error("사용: node scripts/isolate-room.mjs <in> <out.png|--bbox> [--rank N]");
  process.exit(1);
}
const probeOnly = outArg === "--bbox";
const rankIdx = rest.indexOf("--rank");
const RANK = rankIdx >= 0 ? Number(rest[rankIdx + 1]) : 1;
// 보이드 판정 반경. 방 안에 보이드만큼 어두운 면이 넓으면(방3 나무 바닥) 바깥 보이드가
// 방 안으로 새어 들어가 방이 두 덩어리로 갈린다 — 그때 이 값을 줄인다.
const tolIdx = rest.indexOf("--tol");
const TOL = tolIdx >= 0 ? Number(rest[tolIdx + 1]) : 40;
const raw = readFileSync(inPath);

const browser = await chromium.launch();
const page = await browser.newPage();
const out = await page.evaluate(
  async ({ src, ref, probeOnly, rank, tol }) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const W = img.width;
    const H = img.height;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const im = ctx.getImageData(0, 0, W, H);
    const d = im.data;

    // 보이드 색 = 네 모서리 중 **가장 어두운** 것
    const cs = [0, (W - 1) * 4, (H - 1) * W * 4, ((H - 1) * W + W - 1) * 4];
    let vr = 255, vg = 255, vb = 255, best = Infinity;
    for (const o of cs) {
      const lum = d[o] + d[o + 1] + d[o + 2];
      if (lum < best) { best = lum; vr = d[o]; vg = d[o + 1]; vb = d[o + 2]; }
    }
    const voidish = (i) => Math.hypot(d[i] - vr, d[i + 1] - vg, d[i + 2] - vb) <= tol;

    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const queue = new Int32Array(W * H);

    // ① 프레임 가장자리에서 시작해 **바깥 보이드**를 채운다
    const outside = new Uint8Array(W * H);
    let head = 0, tail = 0;
    const seed = (x, y) => {
      const p = y * W + x;
      if (outside[p] || !voidish(p * 4)) return;
      outside[p] = 1;
      queue[tail++] = p;
    };
    for (let x = 0; x < W; x++) { seed(x, 0); seed(x, H - 1); }
    for (let y = 0; y < H; y++) { seed(0, y); seed(W - 1, y); }
    while (head < tail) {
      const p = queue[head++];
      const x = p % W, y = (p / W) | 0;
      for (const [dx, dy] of nb) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const q = ny * W + nx;
        if (outside[q] || !voidish(q * 4)) continue;
        outside[q] = 1;
        queue[tail++] = q;
      }
    }

    // ② 바깥 보이드가 아닌 픽셀을 덩어리로 묶고 **가장 큰 것**을 고른다
    const label = new Int32Array(W * H).fill(-1);
    const blobs = [];
    let id = 0;
    for (let p0 = 0; p0 < W * H; p0++) {
      if (outside[p0] || label[p0] >= 0) continue;
      head = 0; tail = 0;
      queue[tail++] = p0;
      label[p0] = id;
      let size = 0, x0 = W, y0 = H, x1 = 0, y1 = 0;
      while (head < tail) {
        const p = queue[head++];
        const x = p % W, y = (p / W) | 0;
        size++;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
        for (const [dx, dy] of nb) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const q = ny * W + nx;
          if (outside[q] || label[q] >= 0) continue;
          label[q] = id;
          queue[tail++] = q;
        }
      }
      blobs.push({ id, size, x0, y0, x1, y1 });
      id++;
    }
    blobs.sort((a, b) => b.size - a.size);
    if (blobs.length === 0) throw new Error("방 실루엣을 못 찾았다 — 전부 보이드다");
    if (probeOnly) return { W, H, blobs: blobs.slice(0, 8) };
    const pick = blobs[rank - 1];
    if (!pick) throw new Error(`덩어리가 ${blobs.length}개뿐인데 rank ${rank}을 달라고 했다`);
    const { x0, y0, x1, y1 } = pick;
    const keep = new Uint8Array(W * H);
    for (let p = 0; p < W * H; p++) if (label[p] === pick.id) keep[p] = 1;

    // 성분 밖은 전부 보이드로 — 이웃 방 귀퉁이가 여기서 사라진다
    for (let p = 0; p < W * H; p++) {
      if (keep[p]) continue;
      const i = p * 4;
      d[i] = vr; d[i + 1] = vg; d[i + 2] = vb; d[i + 3] = 255;
    }
    ctx.putImageData(im, 0, 0);

    // 기준 프레이밍에 맞춰 1024² 캔버스에 얹는다
    const sx = (ref.x1 - ref.x0) / (x1 - x0);
    const sy = (ref.y1 - ref.y0) / (y1 - y0);
    const s = Math.min(sx, sy); // 종횡비를 지킨다 — 한 축만 늘리면 투영각이 틀어진다
    const dw = (x1 - x0 + 1) * s;
    const dh = (y1 - y0 + 1) * s;
    const o = document.createElement("canvas");
    o.width = ref.canvas;
    o.height = ref.canvas;
    const octx = o.getContext("2d");
    octx.fillStyle = `rgb(${Math.round(vr)},${Math.round(vg)},${Math.round(vb)})`;
    octx.fillRect(0, 0, ref.canvas, ref.canvas);
    octx.imageSmoothingQuality = "high";
    octx.drawImage(
      c,
      x0, y0, x1 - x0 + 1, y1 - y0 + 1,
      // 기준 상자의 중심에 맞춘다
      (ref.x0 + ref.x1) / 2 - dw / 2,
      (ref.y0 + ref.y1) / 2 - dh / 2,
      dw, dh
    );
    return { png: o.toDataURL("image/png"), bbox: { W, H, x0, y0, x1, y1 }, scale: s };
  },
  {
    src: `data:image/${inPath.endsWith(".jpg") ? "jpeg" : "png"};base64,${raw.toString("base64")}`,
    ref: REF,
    probeOnly,
    rank: RANK,
    tol: TOL,
  }
);
await browser.close();

if (probeOnly) {
  console.log(`${inPath}  ${out.W}×${out.H} — 덩어리 ${out.blobs.length}개 (큰 것부터)`);
  out.blobs.forEach((b, i) => {
    console.log(
      `  rank ${i + 1}: ${b.size}px  상자 x ${b.x0}~${b.x1} · y ${b.y0}~${b.y1}` +
        `  중심 (${Math.round((b.x0 + b.x1) / 2)}, ${Math.round((b.y0 + b.y1) / 2)})`
    );
  });
  process.exit(0);
}
const b = out.bbox;
console.log(`${inPath} — rank ${RANK} 상자 x ${b.x0}~${b.x1} · y ${b.y0}~${b.y1}`);

writeFileSync(outArg, Buffer.from(out.png.split(",")[1], "base64"));
console.log(`  → ${outArg} (${REF.canvas}², 배율 ${out.scale.toFixed(3)})`);
