/**
 * 2막 방 스크린샷 — vite 개발 서버를 내장 기동(단명)하고 방에 진입해 찍는다.
 * 사용: node scripts/shot-room.mjs <outDir> [--grid]
 *   --grid: ?grid 디버그 오버레이를 켠 채 촬영 (배경 캘리브레이션 확인용, M3)
 * 산출: <outDir>/title.png, <outDir>/spacetime-room.png, <outDir>/spacetime-room-mobile.png
 */
import { createServer } from "vite";
import { chromium } from "@playwright/test";

const outDir = process.argv[2] ?? "shots";
const grid = process.argv.includes("--grid");
const PORT = 5277; // 촬영 전용 포트 — dev(5273)·e2e(5299)와 분리

const server = await createServer({ server: { port: PORT, strictPort: true } });
await server.listen();

const browser = await chromium.launch();

async function enterRoom(page, query) {
  await page.goto(`http://localhost:${PORT}/${query}`);
  await page.getByTestId("start-button").click();
  await page.getByTestId("char-m").click();
  for (let i = 0; i < 20; i++) {
    const box = page.getByTestId("dialogue-box");
    if (!(await box.isVisible().catch(() => false))) break;
    await box.click();
    await page.waitForTimeout(250);
  }
  await page.waitForFunction(() => !!window.__qe);
  await page.waitForTimeout(500);
}

// 데스크톱
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(`http://localhost:${PORT}/`);
await page.getByTestId("title-screen").waitFor();
await page.screenshot({ path: `${outDir}/title.png` });
await enterRoom(page, grid ? "?grid" : "");
await page.screenshot({ path: `${outDir}/spacetime-room.png` });
console.log(`${outDir}/title.png, ${outDir}/spacetime-room.png`);

// 모바일 (Pixel 7 근사 뷰포트 + 터치)
const mobile = await browser.newPage({
  viewport: { width: 412, height: 915 },
  hasTouch: true,
  isMobile: true,
});
await enterRoom(mobile, grid ? "?grid" : "");
await mobile.screenshot({ path: `${outDir}/spacetime-room-mobile.png` });
console.log(`${outDir}/spacetime-room-mobile.png`);

await browser.close();
await server.close();
