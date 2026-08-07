/**
 * 나노바나나 2가 준 "확장자만 .png인 JPEG"를 진짜 PNG로 다시 인코딩한다.
 * 프리렌더 방 배경(assets-src/rooms/*.png)은 후처리 없이 패스스루되지만
 * build-assets.mjs가 PNG 헤더를 읽으므로 JPEG 바이트면 "유효한 PNG가 아님"으로 멈춘다.
 *
 * 사용: node scripts/reencode-png.mjs <in.jpg> <out.png> [배율]
 *   배율을 주면 그 비율로 확대해서 저장한다 (1024² 산출물을 큰 방에 쓸 때).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const [, , inPath, outPath, scaleArg] = process.argv;
const scale = Number(scaleArg ?? 1);

const raw = readFileSync(inPath);
const browser = await chromium.launch();
const page = await browser.newPage();

const result = await page.evaluate(
  async ({ src, scale }) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    const ctx = c.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return { png: c.toDataURL("image/png").split(",")[1], w: c.width, h: c.height };
  },
  { src: `data:image/jpeg;base64,${raw.toString("base64")}`, scale }
);

await browser.close();
writeFileSync(outPath, Buffer.from(result.png, "base64"));
console.log(`${outPath}: ${result.w}×${result.h}`);
