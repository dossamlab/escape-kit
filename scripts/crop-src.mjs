/**
 * 나노바나나 원본에서 가장자리 일부를 잘라 낸다 (prep-gen 전 단계).
 * 쓰는 경우: 발광 효과가 '투명' 체커보드 위로 번져 어느 배경색과도 안 맞는 얼룩이
 * 한쪽에 몰려 있을 때. 색으로는 분리가 안 되므로 그 영역을 통째로 제외한다.
 *
 * 사용: node scripts/crop-src.mjs <in> <out.png> <top%> [right%] [bottom%] [left%]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const [, , inPath, outPath, ...pcts] = process.argv;
const [top = 0, right = 0, bottom = 0, left = 0] = pcts.map(Number);

const raw = readFileSync(inPath);
const isPng = raw.readUInt32BE(0) === 0x89504e47;
const browser = await chromium.launch();
const page = await browser.newPage();
const png = await page.evaluate(
  async ({ src, top, right, bottom, left }) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const t = Math.round((img.height * top) / 100);
    const b = Math.round((img.height * bottom) / 100);
    const l = Math.round((img.width * left) / 100);
    const r = Math.round((img.width * right) / 100);
    const c = document.createElement("canvas");
    c.width = img.width - l - r;
    c.height = img.height - t - b;
    c.getContext("2d").drawImage(img, l, t, c.width, c.height, 0, 0, c.width, c.height);
    return c.toDataURL("image/png").split(",")[1];
  },
  {
    src: `data:image/${isPng ? "png" : "jpeg"};base64,${raw.toString("base64")}`,
    top, right, bottom, left,
  }
);
await browser.close();
writeFileSync(outPath, Buffer.from(png, "base64"));
console.log(`${outPath} (상 ${top}% 우 ${right}% 하 ${bottom}% 좌 ${left}% 제거)`);
