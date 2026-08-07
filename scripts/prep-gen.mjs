/**
 * 나노바나나 2 산출물(JPEG, 불투명 배경) → 게임용 투명 PNG.
 * gen-asset.mjs의 후처리(가장자리 플러드필 → 크롭 → 다운스케일)를 재사용하되
 * 팔레트 스냅·모자이크는 하지 않는다 (그게 화풍을 뭉개던 원인).
 *
 * 사용: node scripts/prep-gen.mjs <in> <out.png> <targetH> <keyTolerance> [edge|global] [중성색채도] [얇은구멍복원px]
 *   edge(기본) — 가장자리에서 이어진 배경만 제거. 배경색과 본체색이 가까울 때 안전.
 *   global     — 색이 맞으면 위치와 무관하게 제거. 링 안쪽·격자 사이처럼 **바깥과
 *                끊긴 배경 웅덩이**가 있을 때 필요하다(edge 모드는 거길 못 지운다).
 *                본체가 배경색과 확실히 멀 때만 쓸 것 — 아니면 본체에 구멍이 난다.
 * 허용오차는 node scripts/probe-bg.mjs 로 실측해서 고른다
 * (체커보드는 두 색이므로 둘 다 덮는 값이어야 하고, 본체 최근접 거리보다는 작아야 한다).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const [, , inPath, outPath, targetHArg, tolArg, modeArg, neutralArg, fillHolesArg] = process.argv;
const targetH = Number(targetHArg);
const tol = Number(tolArg ?? 30);
const global = modeArg === "global";
/** 추가 중성색 키잉의 채도 임계 (0=사용 안 함). 발광이 배경에 번진 얼룩 제거용. */
const neutral = Number(neutralArg ?? 0);
/** 얇은 구멍 복원 임계(px, 0=사용 안 함). 유리 상판의 흰 눈금선처럼 배경색과
 *  같아 함께 지워진 물체 내부 디테일을 되살린다. */
const fillHoles = Number(fillHolesArg ?? 0);

const raw = readFileSync(inPath);
const browser = await chromium.launch();
const page = await browser.newPage();

const result = await page.evaluate(
  async ({ src, targetH, tol, global, neutral, fillHoles }) => {
    const img = new Image();
    img.src = src;
    await img.decode();

    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const im = ctx.getImageData(0, 0, c.width, c.height);
    const d = im.data;
    const W = c.width;
    const H = c.height;

    // 배경 팔레트 — 나노바나나의 '투명' 표시는 **두 색 체커보드**라 평균 한 색으로는
    // 한쪽 칸만 지워진다. 테두리 8px 링에서 빈도 상위 색들을 뽑아 전부 배경으로 본다.
    const bins = new Map();
    const push = (x, y) => {
      const i = (y * W + x) * 4;
      const k = `${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4}`;
      const b = bins.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
      b.n++; b.r += d[i]; b.g += d[i + 1]; b.b += d[i + 2];
      bins.set(k, b);
    };
    for (let x = 0; x < W; x++) for (let y = 0; y < 8; y++) { push(x, y); push(x, H - 1 - y); }
    for (let y = 0; y < H; y++) for (let x = 0; x < 8; x++) { push(x, y); push(W - 1 - x, y); }
    const ringN = [...bins.values()].reduce((s, b) => s + b.n, 0);
    const palette = [...bins.values()]
      .sort((a, b) => b.n - a.n)
      .filter((b) => b.n / ringN >= 0.05) // 링의 5% 이상을 차지하는 색만 (노이즈 제외)
      .slice(0, 4)
      .map((b) => [b.r / b.n, b.g / b.n, b.b / b.n]);
    const isBg = (i) =>
      palette.some((p) => Math.hypot(d[i] - p[0], d[i + 1] - p[1], d[i + 2] - p[2]) < tol);
    const bgDist = (i) =>
      Math.min(...palette.map((p) => Math.hypot(d[i] - p[0], d[i + 1] - p[1], d[i + 2] - p[2])));

    if (global) {
      // 전역 키잉 — 갇힌 배경 웅덩이(링 안쪽 등)까지 지운다
      for (let i = 0; i < d.length; i += 4) if (isBg(i)) d[i + 3] = 0;
    }
    if (neutral > 0) {
      // 중성색 키잉 — 발광 효과가 체커보드에 섞이면 어느 배경색과도 안 맞아 얼룩으로 남는다.
      // 배경은 무채색(R≈G≈B)이고 장치의 강조색(시안·적색)과 강판(푸른 기 도는 회색)은
      // 채도가 있으므로, **채도가 낮고 밝기가 체커보드 범위인** 픽셀을 추가로 지운다.
      const lums = palette.map((p) => (p[0] + p[1] + p[2]) / 3);
      const lo = Math.min(...lums) - 18;
      const hi = Math.max(...lums) + 18;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] === 0) continue;
        const mx = Math.max(d[i], d[i + 1], d[i + 2]);
        const mn = Math.min(d[i], d[i + 1], d[i + 2]);
        const lum = (d[i] + d[i + 1] + d[i + 2]) / 3;
        if (mx - mn <= neutral && lum >= lo && lum <= hi) d[i + 3] = 0;
      }
    }
    // 가장자리에서 이어진 배경 제거 (전역 모드에서도 남은 경계 픽셀을 훑는다)
    const visited = new Uint8Array(W * H);
    const stack = [];
    for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x);
    for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1);
    while (stack.length) {
      const p = stack.pop();
      if (visited[p]) continue;
      visited[p] = 1;
      const i = p * 4;
      if (d[i + 3] === 0 || !isBg(i)) continue;
      d[i + 3] = 0;
      const x = p % W, y = (p / W) | 0;
      if (x > 0) stack.push(p - 1);
      if (x < W - 1) stack.push(p + 1);
      if (y > 0) stack.push(p - W);
      if (y < H - 1) stack.push(p + W);
    }
    // 디프린지: 투명과 맞닿은 배경 유사색 헤일로 침식 (JPEG 링잉 대비 조금 넉넉히)
    for (let pass = 0; pass < 3; pass++) {
      const clear = [];
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4;
          if (d[i + 3] === 0) continue;
          if (bgDist(i) >= tol * 1.6) continue;
          if (
            (x > 0 && d[i - 4 + 3] === 0) ||
            (x < W - 1 && d[i + 4 + 3] === 0) ||
            (y > 0 && d[i - W * 4 + 3] === 0) ||
            (y < H - 1 && d[i + W * 4 + 3] === 0)
          ) clear.push(i);
        }
      for (const i of clear) d[i + 3] = 0;
      if (!clear.length) break;
    }

    if (fillHoles > 0) {
      // 얇은 구멍 되살리기 — 물체 안의 밝은 디테일(유리 상판의 흰 눈금선, 화면 글자)이
      // 배경색과 같으면 함께 지워져 구멍이 뚫린다. 바깥과 이어지지 않은 투명 덩어리 중
      // **가늘고 긴 것**만 되돌린다. 다리 사이 빈 공간처럼 큼직한 구멍은 그대로 둔다
      // (그건 진짜로 배경이 비쳐야 하는 곳이다).
      const lab = new Int32Array(W * H).fill(-1);
      const comps = [];
      for (let p = 0; p < W * H; p++) {
        if (lab[p] >= 0 || d[p * 4 + 3] > 40) continue;
        const id = comps.length;
        const c = { minX: W, minY: H, maxX: 0, maxY: 0, border: false, px: [] };
        const st = [p];
        lab[p] = id;
        while (st.length) {
          const q = st.pop();
          const x = q % W, y = (q / W) | 0;
          if (x === 0 || y === 0 || x === W - 1 || y === H - 1) c.border = true;
          if (x < c.minX) c.minX = x;
          if (x > c.maxX) c.maxX = x;
          if (y < c.minY) c.minY = y;
          if (y > c.maxY) c.maxY = y;
          c.px.push(q);
          const nb = [];
          if (x > 0) nb.push(q - 1);
          if (x < W - 1) nb.push(q + 1);
          if (y > 0) nb.push(q - W);
          if (y < H - 1) nb.push(q + W);
          for (const r of nb) if (lab[r] < 0 && d[r * 4 + 3] <= 40) { lab[r] = id; st.push(r); }
        }
        comps.push(c);
      }
      let restored = 0;
      for (const c of comps) {
        if (c.border) continue; // 바깥과 이어진 배경 — 그대로 둔다
        // 두께 = 면적 ÷ 긴 변. 바운딩 박스의 짧은 변으로 재면 십자·방사형 눈금처럼
        // 가늘지만 넓게 퍼진 모양이 "두껍다"로 잘못 판정된다(박스가 크므로).
        const span = Math.max(c.maxX - c.minX + 1, c.maxY - c.minY + 1);
        const thickness = c.px.length / span;
        if (thickness >= fillHoles) continue; // 큼직한 구멍(다리 사이 등)은 유지
        for (const q of c.px) d[q * 4 + 3] = 255;
        restored++;
      }
      if (restored) console.log(`  얇은 구멍 ${restored}곳 복원 (두께 < ${fillHoles}px)`);
    }

    // 잔점 제거 — 키잉 후 남은 티끌(JPEG 노이즈·체커보드 조각)이 화면 구석에 하나라도
    // 남으면 아래 바운딩 박스가 통째로 부풀어, 크롭이 원본 크기 그대로가 되고
    // 본체는 프레임 안에서 쪼그라든다. 가장 큰 덩어리의 0.5% 미만인 섬은 지운다.
    {
      const label = new Int32Array(W * H).fill(-1);
      const sizes = [];
      for (let p = 0; p < W * H; p++) {
        if (label[p] >= 0 || d[p * 4 + 3] <= 40) continue;
        const id = sizes.length;
        let n = 0;
        const st = [p];
        label[p] = id;
        while (st.length) {
          const q = st.pop();
          n++;
          const x = q % W, y = (q / W) | 0;
          const nb = [];
          if (x > 0) nb.push(q - 1);
          if (x < W - 1) nb.push(q + 1);
          if (y > 0) nb.push(q - W);
          if (y < H - 1) nb.push(q + W);
          for (const r of nb) if (label[r] < 0 && d[r * 4 + 3] > 40) { label[r] = id; st.push(r); }
        }
        sizes.push(n);
      }
      // 2% 미만은 버린다 — 0.5%로는 체커보드 조각 하나가 살아남아 박스를 부풀렸다.
      // 안테나·표시등처럼 진짜 작은 부품도 보통 본체의 2%는 넘는다.
      const biggest = Math.max(0, ...sizes);
      const minKeep = biggest * 0.02;
      for (let p = 0; p < W * H; p++) {
        const id = label[p];
        if (id >= 0 && sizes[id] < minKeep) d[p * 4 + 3] = 0;
      }
    }

    // 내용 바운딩 박스
    let minX = W, minY = H, maxX = 0, maxY = 0;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        if (d[(y * W + x) * 4 + 3] > 40) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
    if (maxX <= minX || maxY <= minY) return null;
    ctx.putImageData(im, 0, 0);
    const cw = maxX - minX + 1, ch = maxY - minY + 1;

    // 다운스케일: 1024 → 100여 px는 축소율이 커서 면적평균(스무딩)이 최선.
    // 2단계로 나눠 줄여야 캔버스 리샘플러가 디테일을 덜 잃는다.
    const ow = Math.max(1, Math.round((cw * targetH) / ch));
    const mid = document.createElement("canvas");
    mid.width = Math.max(ow, Math.round(cw / 2));
    mid.height = Math.max(targetH, Math.round(ch / 2));
    const mctx = mid.getContext("2d", { willReadFrequently: true });
    mctx.imageSmoothingQuality = "high";
    mctx.drawImage(c, minX, minY, cw, ch, 0, 0, mid.width, mid.height);

    const out = document.createElement("canvas");
    out.width = ow;
    out.height = targetH;
    const octx = out.getContext("2d", { willReadFrequently: true });
    octx.imageSmoothingQuality = "high";
    octx.drawImage(mid, 0, 0, mid.width, mid.height, 0, 0, ow, targetH);

    // 알파 정리: 반투명 찌꺼기 제거 + 거의 불투명은 완전 불투명으로
    const oim = octx.getImageData(0, 0, ow, targetH);
    const od = oim.data;
    for (let i = 0; i < od.length; i += 4) {
      if (od[i + 3] < 60) od[i + 3] = 0;
      else if (od[i + 3] > 205) od[i + 3] = 255;
    }
    octx.putImageData(oim, 0, 0);

    return { png: out.toDataURL("image/png").split(",")[1], w: ow, h: targetH, cw, ch };
  },
  { src: `data:image/jpeg;base64,${raw.toString("base64")}`, targetH, tol, global, neutral, fillHoles }
);

await browser.close();
if (!result) throw new Error("배경 키잉 후 내용이 남지 않음 — 허용오차를 낮출 것");
writeFileSync(outPath, Buffer.from(result.png, "base64"));
console.log(`${outPath}: 원본 크롭 ${result.cw}×${result.ch} → ${result.w}×${result.h}`);
