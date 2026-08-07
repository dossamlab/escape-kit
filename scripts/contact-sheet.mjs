/**
 * 후처리한 스프라이트들을 게임 배경색 위에 나란히 합성해 한 장으로 만든다.
 * 배경 키잉이 제대로 됐는지(체커보드 잔재·본체 구멍·헤일로) 눈으로 확인하는 용도.
 * 시안 격자 위에도 한 번 더 깔아 반투명 잔재를 드러낸다.
 *
 * 사용: node scripts/contact-sheet.mjs <out.png> <sprite.png…>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const [, , outPath, ...files] = process.argv;
const imgs = files.map((f) => ({
  name: f.split(/[\\/]/).pop(),
  data: readFileSync(f).toString("base64"),
}));

const browser = await chromium.launch();
const page = await browser.newPage();
const png = await page.evaluate(async ({ imgs }) => {
  const ZOOM = 3;
  const PAD = 16;
  const loaded = [];
  for (const it of imgs) {
    const img = new Image();
    img.src = `data:image/png;base64,${it.data}`;
    await img.decode();
    loaded.push({ ...it, img });
  }
  const cellW = Math.max(...loaded.map((l) => l.img.width)) * ZOOM + PAD * 2;
  const cellH = Math.max(...loaded.map((l) => l.img.height)) * ZOOM + PAD * 2 + 22;
  const c = document.createElement("canvas");
  c.width = cellW * loaded.length;
  c.height = cellH * 2; // 위: 어두운 방 배경 / 아래: 자홍 격자(잔재 검출)
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  loaded.forEach((l, i) => {
    const x = i * cellW;
    // 위 칸 — 게임 바닥색
    ctx.fillStyle = "#2d3341";
    ctx.fillRect(x, 0, cellW, cellH);
    // 아래 칸 — 자홍 체커 (남은 불투명 배경이 즉시 보인다)
    for (let gy = 0; gy < cellH; gy += 8)
      for (let gx = 0; gx < cellW; gx += 8) {
        ctx.fillStyle = ((gx / 8 + gy / 8) | 0) % 2 ? "#ff00ff" : "#8800aa";
        ctx.fillRect(x + gx, cellH + gy, 8, 8);
      }
    for (const row of [0, 1]) {
      const w = l.img.width * ZOOM;
      const h = l.img.height * ZOOM;
      ctx.drawImage(l.img, x + (cellW - w) / 2, row * cellH + PAD + (cellH - 22 - PAD * 2 - h) / 2, w, h);
    }
    ctx.fillStyle = "#dce7f5";
    ctx.font = "13px monospace";
    ctx.fillText(`${l.name} ${l.img.width}x${l.img.height}`, x + 8, cellH - 6);
  });
  return c.toDataURL("image/png").split(",")[1];
}, { imgs });

await browser.close();
writeFileSync(outPath, Buffer.from(png, "base64"));
console.log(outPath);
