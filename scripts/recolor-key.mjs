/**
 * 스프라이트에 **물체의 일부로 그려진** 키 컬러(자홍 등)를 다른 색으로 바꾼다.
 *
 * 왜 필요한가: 배경을 자홍(#FF00FF)으로 요청하면 생성기가 종종 물체를 **자홍 받침대
 * 위에 올려** 그린다. 그건 배경이 아니라 물체의 일부라서 prep-gen의 키잉으로는
 * 지워지지 않는다(허용오차 100에서도 그대로 남는다 — gas-rig 실측). 지우면 받침이
 * 사라져 물체가 뜨므로, 지우는 대신 팔레트 색으로 **칠한다.**
 *
 * 색조(hue)로 고른다 — 명도는 그대로 두고 색만 갈아끼워 음영을 보존한다.
 *
 * 사용: node scripts/recolor-key.mjs <in.png> <out.png> <대상hue> <hue허용> <새색#rrggbb>
 *   예) node scripts/recolor-key.mjs a.png b.png 300 40 "#3d4a5c"
 *       (자홍 계열 hue 300±40을 청회색으로)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const [, , inPath, outPath, hueArg, spanArg, hexArg] = process.argv;
if (!inPath || !outPath || !hexArg) {
  console.error(
    '사용: node scripts/recolor-key.mjs <in.png> <out.png> <대상hue> <hue허용> <새색#rrggbb>'
  );
  process.exit(1);
}
const targetHue = Number(hueArg ?? 300);
const span = Number(spanArg ?? 40);

const browser = await chromium.launch();
const page = await browser.newPage();
const raw = readFileSync(inPath);

const dataUrl = await page.evaluate(
  async ({ src, targetHue, span, hex }) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const im = ctx.getImageData(0, 0, c.width, c.height);
    const d = im.data;

    const to = {
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16),
    };
    const toLum = (0.299 * to.r + 0.587 * to.g + 0.114 * to.b) / 255;

    let hit = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const chroma = mx - mn;
      if (chroma < 0.18) continue; // 무채색은 건드리지 않는다
      let h;
      if (mx === r) h = 60 * (((g - b) / chroma) % 6);
      else if (mx === g) h = 60 * ((b - r) / chroma + 2);
      else h = 60 * ((r - g) / chroma + 4);
      if (h < 0) h += 360;
      let dh = Math.abs(h - targetHue);
      if (dh > 180) dh = 360 - dh;
      if (dh > span) continue;
      // 원 픽셀의 밝기를 유지한 채 색만 교체 (음영 보존)
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const k = toLum > 0 ? lum / toLum : 1;
      d[i] = Math.min(255, Math.round(to.r * k));
      d[i + 1] = Math.min(255, Math.round(to.g * k));
      d[i + 2] = Math.min(255, Math.round(to.b * k));
      hit++;
    }
    ctx.putImageData(im, 0, 0);
    return { url: c.toDataURL("image/png"), hit, total: (d.length / 4) | 0 };
  },
  { src: `data:image/png;base64,${raw.toString("base64")}`, targetHue, span, hex: hexArg }
);

writeFileSync(outPath, Buffer.from(dataUrl.url.split(",")[1], "base64"));
await browser.close();
console.log(`${outPath}: ${dataUrl.hit}px 재채색 (hue ${targetHue}±${span} → ${hexArg})`);
