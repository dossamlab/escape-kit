/**
 * prep-gen의 키잉이 왜 안 먹는지 진단한다 — 팔레트, 모서리 픽셀의 배경 판정,
 * 허용오차별로 지워지는 픽셀 비율을 출력한다.
 * 사용: node scripts/diag-key.mjs <in.jpg>
 */
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const raw = readFileSync(process.argv[2]);
const browser = await chromium.launch();
const page = await browser.newPage();
const r = await page.evaluate(
  async ({ src }) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const { data: d, width: W, height: H } = ctx.getImageData(0, 0, c.width, c.height);

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
    const all = [...bins.values()].sort((a, b) => b.n - a.n);
    const palette = all
      .filter((b) => b.n / ringN >= 0.05)
      .slice(0, 4)
      .map((b) => [b.r / b.n, b.g / b.n, b.b / b.n]);

    const dist = (i, p) => Math.hypot(d[i] - p[0], d[i + 1] - p[1], d[i + 2] - p[2]);
    const corners = [0, (W - 1) * 4, (H - 1) * W * 4, ((H - 1) * W + W - 1) * 4];
    const cornerInfo = corners.map((o) => ({
      rgb: [d[o], d[o + 1], d[o + 2]],
      min: palette.length ? Math.round(Math.min(...palette.map((p) => dist(o, p)))) : -1,
    }));

    const ratios = {};
    for (const tol of [16, 24, 32, 48, 64]) {
      let n = 0;
      for (let i = 0; i < d.length; i += 4)
        if (palette.some((p) => dist(i, p) < tol)) n++;
      ratios[tol] = Math.round((100 * n) / (W * H));
    }
    return {
      size: [W, H],
      ringTop: all.slice(0, 6).map((b) => ({
        pct: Math.round((100 * b.n) / ringN),
        rgb: [b.r, b.g, b.b].map((v) => Math.round(v / b.n)),
      })),
      paletteSize: palette.length,
      cornerInfo,
      ratios,
    };
  },
  { src: `data:image/jpeg;base64,${raw.toString("base64")}` }
);
await browser.close();
console.log(JSON.stringify(r, null, 1));
