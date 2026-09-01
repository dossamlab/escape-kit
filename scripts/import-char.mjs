/**
 * 캐릭터 시트 → ext-char 48프레임 가공. **8방향 체계.**
 *
 * 입력: assets-src/gen-src/char-asset-8dir.png — 자홍 배경, 2행 × 5열
 *   행: 위 = 남(m), 아래 = 여(f)
 *   열: 정면 · ¾정면 · 측면 · ¾후면 · 후면 (0°·45°·90°·135°·180°, 전부 오른쪽을 봄)
 *
 * ── 다섯 뷰로 여덟 방향을 만드는 법 ─────────────────────────────
 * 엔진의 방향 이름은 **월드가 아니라 화면 방향**이다(Game.ts가 화면 델타 sx·sy로 고른다).
 * 사선·측면 뷰가 전부 오른쪽을 보므로, 왼쪽 넷은 좌우 미러 한 번으로 얻는다:
 *
 *   s  ← 정면        se ← ¾정면      e ← 측면        ne ← ¾후면
 *   n  ← 후면        sw ← ¾정면 미러  w ← 측면 미러   nw ← ¾후면 미러
 *
 * 왼쪽을 보는 뷰를 시트에 섞으면 방향마다 코트 여밈·가르마가 뒤집혀 보인다 —
 * 그래서 요청문이 "views 2,3,4 must ALL face RIGHT"를 못 박는다(docs/char-asset-spec.md).
 *
 * 이력: ¾ 3뷰(방향이 화면축과 어긋남) → 직교 3뷰 4방향 → 5뷰 8방향.
 *
 * 출력: assets-src/ext-char/char-{m,f}-{s,se,e,ne,n,nw,w,sw}-{idle,a,b}.png (48장)
 * 규격: 높이 250px(발이 최하단 행) = 월드 높이 그대로, meta.json scale 1 → 화면 높이 125px.
 * 옛 규격은 50px × scale 5였는데, nearest 확대라 캐릭터만 도트로 보였다.
 *
 * 사용: node scripts/import-char.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SHEET = join(root, "assets-src", "gen-src", "char-asset-8dir.png");
const OUT = join(root, "assets-src", "ext-char");
mkdirSync(OUT, { recursive: true });

const FRAME_H = 250; // 월드 높이 그대로 (meta.scale 1) — 축소해 그리므로 계단이 안 진다
const LEG_BAND = 0.22; // 아래 22% 행을 다리로 간주 (3등신 기준)
const LIFT = 10; // 걷기 프레임에서 다리를 들어 올리는 px (FRAME_H 비례)

const browser = await chromium.launch();
const page = await browser.newPage();

/** 시트 → { m: {front, back, side}, f: {...} } (각 뷰는 FRAME_H 높이 RGBA) */
const cells = await page.evaluate(async (src) => {
  const img = new Image();
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = rej;
    img.src = src;
  });
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const id = ctx.getImageData(0, 0, c.width, c.height);
  const d = id.data;
  const W = c.width;
  const H = c.height;
  const idx = (x, y) => (y * W + x) * 4;

  // 1) 자홍 키잉 — JPEG/PNG 전이 픽셀까지 잡도록 색상 조건을 넓게.
  //    자홍은 r·b가 높고 g가 현저히 낮다. 베이지 코트는 g가 높아 걸리지 않는다.
  const isBg = (i) => {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const m = Math.max(r, b);
    return m > 90 && g < 0.62 * m && Math.min(r, b) > 0.35 * m;
  };
  for (let i = 0; i < d.length; i += 4) if (isBg(i)) d[i + 3] = 0;

  // 2) 디프린지 — 투명과 맞닿은 자홍기 도는 픽셀을 이웃 불투명 색 평균으로
  const fringe = [];
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const i = idx(x, y);
      if (d[i + 3] === 0) continue;
      const nearClear =
        d[idx(x - 1, y) + 3] === 0 || d[idx(x + 1, y) + 3] === 0 ||
        d[idx(x, y - 1) + 3] === 0 || d[idx(x, y + 1) + 3] === 0;
      if (!nearClear) continue;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      if (Math.max(r, b) > 70 && g < 0.75 * Math.max(r, b)) fringe.push([x, y]);
    }
  for (const [x, y] of fringe) {
    let sr = 0, sg = 0, sb = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const j = idx(x + dx, y + dy);
        if (d[j + 3] === 0) continue;
        const r = d[j], g = d[j + 1], b = d[j + 2];
        if (Math.max(r, b) > 70 && g < 0.75 * Math.max(r, b)) continue;
        sr += r; sg += g; sb += b; n++;
      }
    const i = idx(x, y);
    if (n > 0) { d[i] = sr / n; d[i + 1] = sg / n; d[i + 2] = sb / n; }
    else d[i + 3] = 0;
  }

  /** 점유 구간 찾기 — 빈 줄이 gap 이상 이어지면 경계 */
  const segments = (has, gap, minLen) => {
    const out = [];
    let start = -1, run = 0;
    for (let i = 0; i <= has.length; i++) {
      if (i < has.length && has[i]) { if (start < 0) start = i; run = 0; }
      else if (start >= 0) {
        run++;
        if (run >= gap || i === has.length) { out.push([start, i - run]); start = -1; run = 0; }
      }
    }
    return out.filter(([a, b]) => b - a >= minLen);
  };

  // 3) 행 분리 (남/여) → 각 행에서 열 분리 (정면·후면·측면)
  const rowHas = new Array(H).fill(false);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) if (d[idx(x, y) + 3] > 0) { rowHas[y] = true; break; }
  const rows = segments(rowHas, 12, 40);
  if (rows.length !== 2) throw new Error(`행 분리 실패: ${rows.length}개 (기대 2 — 남/여)`);

  const out = {};
  const genders = ["m", "f"];
  const views = ["front", "qfront", "side", "qback", "back"];

  rows.forEach(([y0, y1], ri) => {
    const colHas = new Array(W).fill(false);
    for (let x = 0; x < W; x++)
      for (let y = y0; y <= y1; y++) if (d[idx(x, y) + 3] > 0) { colHas[x] = true; break; }
    const cols = segments(colHas, 10, 30);
    if (cols.length !== 5) throw new Error(`${genders[ri]} 열 분리 실패: ${cols.length}개 (기대 5)`);

    const g = {};
    cols.forEach(([x0, x1], ci) => {
      // bbox 크롭
      let minX = W, maxX = 0, minY = H, maxY = 0;
      for (let x = x0; x <= x1; x++)
        for (let y = y0; y <= y1; y++)
          if (d[idx(x, y) + 3] > 0) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
      const vw = maxX - minX + 1, vh = maxY - minY + 1;
      const vc = document.createElement("canvas");
      vc.width = vw; vc.height = vh;
      vc.getContext("2d").putImageData(id, -minX, -minY, minX, minY, vw, vh);

      // 다운스케일 + 알파 이진화 (외곽 정리)
      const th = 250; // FRAME_H
      const tw = Math.max(8, Math.round((vw / vh) * th));
      const sc = document.createElement("canvas");
      sc.width = tw; sc.height = th;
      const sctx = sc.getContext("2d", { willReadFrequently: true });
      sctx.imageSmoothingEnabled = true;
      sctx.imageSmoothingQuality = "high";
      sctx.drawImage(vc, 0, 0, tw, th);
      const sid = sctx.getImageData(0, 0, tw, th);
      // 알파는 **이진화하지 않는다** — 부드러운 외곽(안티에일리어스)을 살려야
      //    매끈한 배경 위에서 캐릭터만 도트로 튀지 않는다. 옅은 잔재만 걷어낸다.
      for (let i = 0; i < sid.data.length; i += 4) if (sid.data[i + 3] < 24) sid.data[i + 3] = 0;
      g[views[ci]] = { w: tw, h: th, data: Array.from(sid.data) };
    });
    out[genders[ri]] = g;
  });
  return out;
}, `data:image/png;base64,${readFileSync(SHEET).toString("base64")}`);

/** RGBA → PNG 저장 */
async function savePng(path, w, h, data) {
  const url = await page.evaluate(
    ({ w, h, data }) => {
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const ctx = c.getContext("2d");
      const id = ctx.createImageData(w, h);
      id.data.set(data);
      ctx.putImageData(id, 0, 0);
      return c.toDataURL("image/png");
    },
    { w, h, data },
  );
  writeFileSync(path, Buffer.from(url.split(",")[1], "base64"));
}

const flip = ({ w, h, data }) => {
  const out = new Array(data.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      for (let k = 0; k < 4; k++) out[(y * w + x) * 4 + k] = data[(y * w + (w - 1 - x)) * 4 + k];
  return { w, h, data: out };
};

/** 걷기 프레임 — 다리 절반(side: -1 왼쪽 / +1 오른쪽)을 LIFT px 들어 올린다 */
const step = ({ w, h, data }, side) => {
  const out = data.slice();
  const legTop = Math.floor(h * (1 - LEG_BAND));
  const xFrom = side < 0 ? 0 : Math.floor(w / 2);
  const xTo = side < 0 ? Math.floor(w / 2) : w;
  for (let x = xFrom; x < xTo; x++)
    for (let y = legTop; y < h; y++) {
      const s = y + LIFT < h ? data.slice(((y + LIFT) * w + x) * 4, ((y + LIFT) * w + x) * 4 + 4) : [0, 0, 0, 0];
      const di = (y * w + x) * 4;
      out[di] = s[0]; out[di + 1] = s[1]; out[di + 2] = s[2]; out[di + 3] = s[3];
    }
  return { w, h, data: out };
};

for (const g of ["m", "f"]) {
  const { front, qfront, side, qback, back } = cells[g];
  // 엔진의 화면 방향 여덟 칸 ← 다섯 뷰 + 미러 셋.
  // 시트의 사선·측면은 모두 **오른쪽**을 보므로, 왼쪽 넷은 미러로 만든다.
  const byFacing = {
    s: front,          // 화면 아래 = 카메라 쪽으로 걸어온다
    se: qfront,        // 아래-오른쪽
    e: side,           // 오른쪽
    ne: qback,         // 위-오른쪽
    n: back,           // 화면 위 = 카메라에서 멀어진다
    nw: flip(qback),   // 위-왼쪽
    w: flip(side),     // 왼쪽
    sw: flip(qfront),  // 아래-왼쪽
  };
  for (const [facing, img] of Object.entries(byFacing)) {
    await savePng(join(OUT, `char-${g}-${facing}-idle.png`), img.w, img.h, img.data);
    const a = step(img, -1);
    const b = step(img, +1);
    await savePng(join(OUT, `char-${g}-${facing}-a.png`), a.w, a.h, a.data);
    await savePng(join(OUT, `char-${g}-${facing}-b.png`), b.w, b.h, b.data);
  }
  console.log(
    `char-${g}: 정면 ${front.w} · ¾정면 ${qfront.w} · 측면 ${side.w} · ¾후면 ${qback.w} · 후면 ${back.w}` +
      ` (높이 ${front.h}) → 8방향 × 3프레임`
  );
}

await browser.close();
console.log(`완료 → ${OUT} (8방향 체계, FRAME_H ${FRAME_H})`);
