import { test, expect, type Page } from "@playwright/test";
import { enterSonicRoom, solvePendulum, openStation, dismissDialogues } from "./helpers";
import {
  ROWS,
  COLS,
  HOLLOW_ROW,
  HOLLOW_COL,
  PEAK_THRESH,
  ECHO_DELAY_S,
  SCOPE_WINDOW_S,
  MELODY_NOTE,
  isHollow,
  echoPeakCount,
  envelope,
  countEchoHumps,
} from "../../src/puzzles/wall-sounding/autoplay";

/**
 * 예제 방 P2 벽면 탐상 — 그리드 청진 탭(탄성파의 반사).
 * 정답 좌표·파형 상수는 autoplay.ts에서만 가져온다 (spec에 답 재기입 금지).
 */

/** 빈 패널 옆의 꽉 찬 패널 — 좌표는 상수에서 유도(재기입 아님) */
const SOLID_ROW = HOLLOW_ROW;
const SOLID_COL = (HOLLOW_COL + 1) % COLS;

/** P2를 정답으로 해결한다 (스테이션이 열려 있는 상태에서 호출) */
async function solveKnock(page: Page): Promise<void> {
  await page.getByTestId(`knock-panel-${HOLLOW_ROW}-${HOLLOW_COL}`).click();
  await page.getByTestId("knock-open").click();
  await expect(page.getByTestId("knock-found")).toBeVisible();
}

test("빈 패널은 정확히 1장이고 파형 봉우리로 판별된다 — 상수 검산", () => {
  // HOLLOW 좌표가 그리드 범위 안
  expect(HOLLOW_ROW).toBeGreaterThanOrEqual(0);
  expect(HOLLOW_ROW).toBeLessThan(ROWS);
  expect(HOLLOW_COL).toBeGreaterThanOrEqual(0);
  expect(HOLLOW_COL).toBeLessThan(COLS);
  // 빈 패널은 전 그리드에서 딱 1장
  let hollowCount = 0;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (isHollow(r, c)) hollowCount++;
  expect(hollowCount).toBe(1);
  // 반사 피크 수: 꽉 찬 벽 1(표면), 빈 벽 2(표면 + 공동 경계)
  expect(echoPeakCount(SOLID_ROW, SOLID_COL)).toBe(1);
  expect(echoPeakCount(HOLLOW_ROW, HOLLOW_COL)).toBe(2);
  // 스코프가 실제로 그리는 포락선도 같은 판별을 준다 (시각 백업의 근거)
  expect(countEchoHumps(false)).toBe(1);
  expect(countEchoHumps(true)).toBe(2);
  // 두 봉우리는 분리돼 있다: 에코 직전 시점의 첫 펄스 잔향이 문턱 아래
  expect(envelope(ECHO_DELAY_S - 0.001, false)).toBeLessThan(PEAK_THRESH);
  // 에코 봉우리는 문턱 위로 확실히 솟는다
  expect(envelope(ECHO_DELAY_S, true)).toBeGreaterThan(PEAK_THRESH);
  // 에코가 스코프 시간창 안에 들어온다
  expect(ECHO_DELAY_S).toBeLessThan(SCOPE_WINDOW_S);
});

test("개념 없이도 전수 노크 24회로 반드시 특정된다 — 순수 함수 검산", () => {
  // 전략: 개념 없이 24장을 전부 두드리고, 스코프 봉우리 수만 관찰해 기록한다.
  const doubleRing: Array<[number, number]> = [];
  let knocks = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      knocks += 1;
      const observedHumps = countEchoHumps(isHollow(r, c)); // 스코프가 보여주는 것
      if (observedHumps === 2) doubleRing.push([r, c]);
    }
  }
  // 24회 관찰만으로 이중 에코 패널이 유일하게 특정된다 — 게이트 없는 수렴 보장
  expect(knocks).toBe(ROWS * COLS);
  expect(doubleRing).toEqual([[HOLLOW_ROW, HOLLOW_COL]]);
});

test("꽉 찬 벽은 한 번, 빈 벽은 두 번 운다 — 벽감을 열면 릴 테이프", async ({ page }) => {
  test.setTimeout(150_000);
  const isMobile = test.info().project.name === "mobile";
  await enterSonicRoom(page);
  await solvePendulum(page, isMobile); // P1 — 조명 복구 후 본실로
  await openStation(page, isMobile, 9, 1.7, "puzzle-knock");
  await expect(page.getByTestId("knock-found")).toBeHidden();
  await expect(page.getByTestId("knock-open")).toBeDisabled();

  // 오답 경로: 꽉 찬 패널 — 봉우리 하나 + 첫 회에만 대사(#sn-knock-full)
  await page.getByTestId(`knock-panel-${SOLID_ROW}-${SOLID_COL}`).click();
  await expect(page.getByTestId("knock-scope-view")).toHaveAttribute("data-peaks", "1");
  const dialogue = page.getByTestId("dialogue-box");
  await expect(dialogue).toBeVisible(); // #sn-knock-full
  await dialogue.click();
  await expect(dialogue).toBeHidden();
  await expect(page.getByTestId("knock-open")).toBeDisabled();

  // 정답 경로: 빈 패널 — 봉우리 둘 + 벽감 열기 활성화
  await page.getByTestId(`knock-panel-${HOLLOW_ROW}-${HOLLOW_COL}`).click();
  await expect(page.getByTestId("knock-scope-view")).toHaveAttribute("data-peaks", "2");
  const open = page.getByTestId("knock-open");
  await expect(open).toBeEnabled();
  await open.click();

  const done = page.getByTestId("knock-found");
  await expect(done).toBeVisible();
  await expect(done).toContainText(`[${MELODY_NOTE}]`);
  await dismissDialogues(page); // #sn-knock-clear
  await expect(page.getByTestId("puzzle-knock")).toBeHidden();

  // 보상: 코드 이벤트 + 릴 테이프 아이템 지급 (엔진 reward.itemId 첫 활용)
  await expect
    .poll(() => page.evaluate(() => (window as never as { __qe: { events: string[] } }).__qe.events))
    .toContain("code:knock-solved");
  await expect(page.getByTestId("item-reel-tape")).toBeVisible();
});

test("해결 후 저널의 원리 카드에서 멜로디 음과 성취기준을 다시 볼 수 있다", async ({ page }) => {
  test.setTimeout(150_000);
  const isMobile = test.info().project.name === "mobile";
  await enterSonicRoom(page);
  await solvePendulum(page, isMobile);
  await openStation(page, isMobile, 9, 1.7, "puzzle-knock");
  await solveKnock(page);
  await dismissDialogues(page);
  await expect(page.getByTestId("puzzle-knock")).toBeHidden();

  await page.getByTestId("note-counter").click();
  await page.getByTestId("journal-tab-principles").click();
  await page.getByTestId("journal-item-principle-wall-sounding").click();
  const card = page.getByTestId("principle-overlay");
  await expect(card).toBeVisible();
  await expect(card).toContainText(`[${MELODY_NOTE}]`);
  await expect(card).toContainText("[12역학03-02]");
});
