/**
 * 방 배경 그림의 **방 바깥 여백**을 게임의 배경색(design-tokens `bg-void`)으로 맞춘다.
 *
 * 왜 필요한가: 생성기는 방 밖을 순수 검정(#000000)으로 칠해 보내는데, 엔진은 캔버스를
 * `bg-void`(#101318)로 먼저 칠한 뒤 그 위에 배경 이미지를 얹는다. 두 색이 다르면
 * 이미지의 사각형 경계가 화면에 그대로 드러난다(방이 화면보다 작은 12~16칸에서 특히).
 *
 * 가장자리에서 이어진 어두운 픽셀만 칠한다 — 방 안의 검은 외곽선·창밖 우주는 건드리지 않는다.
 *
 * 사용: node scripts/void-fill.mjs <in.png> <out.png> [허용오차=24]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import tokens from "../design-tokens.json" with { type: "json" };

const [, , inPath, outPath, tolArg] = process.argv;
const tol = Number(tolArg ?? 24);
const voidHex = tokens.color["bg-void"];

const raw = readFileSync(inPath);
const browser = await chromium.launch();
const page = await browser.newPage();
const result = await page.evaluate(
  async ({ src, tol, voidHex }) => {
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
    const W = c.width, H = c.height;

    const vr = parseInt(voidHex.slice(1, 3), 16);
    const vg = parseInt(voidHex.slice(3, 5), 16);
    const vb = parseInt(voidHex.slice(5, 7), 16);

    // 모서리 색을 여백 기준으로 삼는다 (보통 순수 검정)
    const br = d[0], bg = d[1], bb = d[2];
    const isVoid = (i) => Math.hypot(d[i] - br, d[i + 1] - bg, d[i + 2] - bb) < tol;

    // 가장자리에서 이어진 부분만 (방 안의 검은 선·창밖 우주는 보호)
    const visited = new Uint8Array(W * H);
    const stack = [];
    for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x);
    for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1);
    let filled = 0;
    while (stack.length) {
      const p = stack.pop();
      if (visited[p]) continue;
      visited[p] = 1;
      const i = p * 4;
      if (!isVoid(i)) continue;
      d[i] = vr; d[i + 1] = vg; d[i + 2] = vb; d[i + 3] = 255;
      filled++;
      const x = p % W, y = (p / W) | 0;
      if (x > 0) stack.push(p - 1);
      if (x < W - 1) stack.push(p + 1);
      if (y > 0) stack.push(p - W);
      if (y < H - 1) stack.push(p + W);
    }
    ctx.putImageData(im, 0, 0);
    return { png: c.toDataURL("image/png").split(",")[1], filled, total: W * H };
  },
  { src: `data:image/png;base64,${raw.toString("base64")}`, tol, voidHex }
);

await browser.close();
writeFileSync(outPath, Buffer.from(result.png, "base64"));
console.log(
  `${outPath}: 여백 ${Math.round((100 * result.filled) / result.total)}%를 ${voidHex}로 치환`
);
