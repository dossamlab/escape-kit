/**
 * 나노바나나 산출물의 '투명' 체커보드 배경색을 실측한다.
 * prep-gen.mjs의 keyTolerance를 감으로 잡으면 배경이 안 지워지거나(크롭=원본 크기)
 * 본체를 파먹는다. 테두리 링의 색 분포와 본체 최근접 거리를 보고 값을 고른다.
 *
 * 사용: node scripts/probe-bg.mjs <파일…>
 */
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const page = await browser.newPage();

for (const p of process.argv.slice(2)) {
  const raw = readFileSync(p);
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

      // 테두리 8px 링의 색을 16단계로 양자화해 빈도 집계 → 체커보드 두 색을 찾는다
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
      const top = [...bins.values()]
        .sort((a, b) => b.n - a.n)
        .slice(0, 3)
        .map((b) => ({ n: b.n, c: [Math.round(b.r / b.n), Math.round(b.g / b.n), Math.round(b.b / b.n)] }));

      // 네 모서리 평균 = prep-gen이 기준으로 삼는 색
      const corners = [0, (W - 1) * 4, (H - 1) * W * 4, ((H - 1) * W + W - 1) * 4];
      const base = [0, 1, 2].map((k) => Math.round(corners.reduce((s, o) => s + d[o + k], 0) / 4));
      const dist = (a, b) => Math.round(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));

      // 중앙 세로선에서 배경과 가장 비슷한 '본체' 픽셀까지의 거리 (허용오차 상한 근거)
      let nearestBody = 999;
      for (let y = (H * 0.25) | 0; y < H * 0.75; y++) {
        const i = (y * W + ((W / 2) | 0)) * 4;
        const dd = dist([d[i], d[i + 1], d[i + 2]], base);
        if (dd > 12 && dd < nearestBody) nearestBody = dd;
      }
      return {
        base,
        shades: top.map((t) => ({ c: t.c, d: dist(t.c, base) })),
        nearestBody,
      };
    },
    { src: `data:image/jpeg;base64,${raw.toString("base64")}` }
  );
  const name = p.split(/[\\/]/).pop();
  const shades = r.shades.map((s) => `rgb(${s.c})Δ${s.d}`).join("  ");
  console.log(`${name.padEnd(28)} 기준 rgb(${r.base})  배경색: ${shades}  본체최근접Δ${r.nearestBody}`);
}

await browser.close();
