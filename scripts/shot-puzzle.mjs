/**
 * 퍼즐 화면 스크린샷 — 시각 품질 게이트용. vite 개발 서버를 내장 기동한다.
 * 사용: node scripts/shot-puzzle.mjs <outDir> [퍼즐키…]
 *   퍼즐키 생략 시 등록된 시나리오 전부.
 * 산출: <outDir>/<key>.png, <key>-mobile.png (+ 상태별 변형)
 */
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { omegaToDeg } from "../src/puzzles/centrifuge-dial/autoplay.ts";

const outDir = process.argv[2] ?? "shots";
const only = process.argv.slice(3);
const PORT = 5278;

const server = await createServer({ server: { port: PORT, strictPort: true } });
await server.listen();
const browser = await chromium.launch();

async function enter(page) {
  await page.goto(`http://localhost:${PORT}/?grid=0`);
  await page.getByTestId("start-button").click();
  await page.getByTestId("char-m").click();
  for (let i = 0; i < 20; i++) {
    const box = page.getByTestId("dialogue-box");
    if (!(await box.isVisible().catch(() => false))) break;
    await box.click();
    await page.waitForTimeout(220);
  }
  await page.waitForFunction(() => !!window.__qe);
}

/** 방 안 좌표로 순간 이동 (촬영 전용 — ?grid 디버그 훅) */
async function warpTo(page, x, y) {
  await page.evaluate(
    ({ x, y }) => {
      window.__qe.player.x = x;
      window.__qe.player.y = y;
    },
    { x, y }
  );
  await page.waitForTimeout(350);
}

async function openPuzzle(page, x, y) {
  await warpTo(page, x, y);
  await page.keyboard.press("KeyE");
  const box = page.getByTestId("dialogue-box");
  if (await box.isVisible().catch(() => false)) await box.click();
  await page.waitForTimeout(400);
}

/** 다이얼을 특정 ω로 (setDialOmega와 같은 기하) */
async function setOmega(page, omega) {
  const dial = page.getByTestId("omega-dial");
  const b = await dial.boundingBox();
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  const r = (66 / 190) * b.width;
  const rad = (omegaToDeg(omega) * Math.PI) / 180;
  const tx = cx + r * Math.sin(rad);
  const ty = cy - r * Math.cos(rad);
  await page.mouse.move(tx, ty);
  await page.mouse.down();
  await page.mouse.move(tx, ty, { steps: 2 });
  await page.mouse.up();
  await page.waitForTimeout(500);
}

const scenarios = {
  thruster: async (page, tag) => {
    const { SOLUTION_A_KN, SOLUTION_B_KN, VIEW, kNToPoint } = await import(
      "../src/puzzles/thruster-vectors/autoplay.ts"
    );
    await openPuzzle(page, 14, 8);
    await page.screenshot({ path: `${outDir}/thruster-idle${tag}.png` });
    const view = page.getByTestId("thruster-view");
    const setVec = async (which, v) => {
      const b = await view.boundingBox();
      const hb = await page.getByTestId(`thr-handle-${which}`).boundingBox();
      const s = b.width / VIEW;
      const p = kNToPoint(v);
      await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
      await page.mouse.down();
      await page.mouse.move(b.x + p.x * s, b.y + p.y * s, { steps: 6 });
      await page.mouse.up();
      await page.waitForTimeout(250);
    };
    await setVec("a", SOLUTION_A_KN);
    await setVec("b", SOLUTION_B_KN);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${outDir}/thruster-solved${tag}.png` });
  },
  orbit: async (page, tag) => {
    const { SOLUTION_R_A, VIEW_W, PLANET_Y, apoapsisScreenX } = await import(
      "../src/puzzles/kepler-orbit/autoplay.ts"
    );
    await openPuzzle(page, 4, 10);
    await page.screenshot({ path: `${outDir}/orbit-idle${tag}.png` });
    const view = page.getByTestId("orbit-view");
    const b = await view.boundingBox();
    const s = b.width / VIEW_W;
    const tx = b.x + apoapsisScreenX(SOLUTION_R_A) * s;
    const ty = b.y + PLANET_Y * s;
    await page.mouse.move(tx, ty);
    await page.mouse.down();
    await page.mouse.move(tx, ty, { steps: 3 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${outDir}/orbit-set${tag}.png` });
    await page.getByTestId("confirm-orbit").click();
    await page.getByTestId("comm-linked").waitFor({ timeout: 25000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${outDir}/orbit-solved${tag}.png` });
  },
  dock: async (page, tag) => {
    await openPuzzle(page, 8, 16);
    await page.screenshot({ path: `${outDir}/dock-idle${tag}.png` });
    await page.getByTestId("tank-1").click();
    await page.getByTestId("tank-4").click();
    await page.getByTestId("launch-button").click();
    await page.getByTestId("clamp-locked").waitFor({ timeout: 25000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${outDir}/dock-solved${tag}.png` });
  },
  chronal: async (page, tag) => {
    const { GATE_CODE, SOLUTION_SWAPS } = await import(
      "../src/puzzles/chronal-console/autoplay.ts"
    );
    await warpTo(page, 13, 14);
    await page.keyboard.press("KeyE");
    const box = page.getByTestId("dialogue-box");
    if (await box.isVisible().catch(() => false)) await box.click();
    await page.getByTestId("keypad").waitFor();
    await page.screenshot({ path: `${outDir}/chronal-keypad${tag}.png` });
    for (const d of GATE_CODE) await page.getByTestId(`key-${d}`).click();
    await page.getByTestId("keypad-enter").click();
    for (let i = 0; i < 3; i++) {
      if (!(await box.isVisible().catch(() => false))) break;
      await box.click();
      await page.waitForTimeout(250);
    }
    await page.getByTestId("puzzle-chronal").waitFor();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${outDir}/chronal-cards${tag}.png` });
    for (const [a, b] of SOLUTION_SWAPS) {
      const from = page.getByTestId(`slot-${a}`).locator(".chr-card");
      const tb = await page.getByTestId(`slot-${b}`).boundingBox();
      const fb = await from.boundingBox();
      await page.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2);
      await page.mouse.down();
      await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2, { steps: 8 });
      await page.mouse.up();
    }
    await page.getByTestId("judge-button").click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${outDir}/chronal-solved${tag}.png` });
  },
  centrifuge: async (page, tag) => {
    await openPuzzle(page, 10, 4);
    await page.screenshot({ path: `${outDir}/centrifuge-idle${tag}.png` });
    await setOmega(page, 3.5);
    await page.screenshot({ path: `${outDir}/centrifuge-overspeed${tag}.png` });
    const box = page.getByTestId("dialogue-box");
    if (await box.isVisible().catch(() => false)) await box.click();
    await page.waitForTimeout(1400);
    await setOmega(page, 2.0);
    await page.screenshot({ path: `${outDir}/centrifuge-solved${tag}.png` });
  },
};

const keys = only.length > 0 ? only : Object.keys(scenarios);
for (const [label, opts] of [
  ["", { viewport: { width: 1280, height: 800 } }],
  ["-mobile", { viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true }],
]) {
  for (const key of keys) {
    const page = await browser.newPage(opts);
    await enter(page);
    await scenarios[key](page, label);
    await page.close();
    console.log(`${outDir}/${key}-*${label}.png`);
  }
}

await browser.close();
await server.close();
