import { test, expect } from "@playwright/test";
import { enterSonicRoom, openStation, dismissDialogues } from "./helpers";
import {
  PERIOD_S,
  PUSH_GAIN,
  DECAY_PER_S,
  AMP_INITIAL,
  AMP_FLOOR,
  SOLVE_AMP,
  GLOW_COS,
  MELODY_NOTE,
  ampDelta,
  inGlowWindow,
  phaseAt,
  stepAmp,
  isSolved,
} from "../../src/puzzles/pendulum-dynamo/autoplay";

/**
 * 예제 방 P1 진자 발전기 — 리듬 탭(등시성).
 * 정답·상수는 autoplay.ts에서만 가져온다 (spec에 답 재기입 금지).
 */

test("박자에 맞춘 탭은 진폭을 키우고, 어긋난 탭은 깎는다 — 상수 검산", () => {
  expect(ampDelta(0)).toBeCloseTo(PUSH_GAIN);
  expect(ampDelta(Math.PI)).toBeCloseTo(-PUSH_GAIN);
  expect(ampDelta(Math.PI / 2)).toBeCloseTo(0, 5);
  // 발광 창 안의 최소 이득이 한 주기의 감쇠보다 크다 — 창만 따라가도 수렴한다는 근거
  expect(PUSH_GAIN * GLOW_COS).toBeGreaterThan(DECAY_PER_S * PERIOD_S);
  // 위상은 주기적이고 최적 순간은 φ=0
  expect(phaseAt(0)).toBeCloseTo(0);
  expect(phaseAt(PERIOD_S)).toBeCloseTo(0, 5);
  expect(inGlowWindow(0)).toBe(true);
  expect(inGlowWindow(Math.PI)).toBe(false);
});

test("개념 없이도 '발광에 맞춰 탭'만으로 수렴한다 — 순수 함수 시뮬레이션", () => {
  // 전략: 한 주기에 한 번, 발광 창의 **가장 나쁜 끝**(cos φ = GLOW_COS)에서 탭.
  // 최악 전략조차 수렴해야 "빛나는 순간에 눌러라"가 게이트 없는 안내가 된다.
  const worstPhase = Math.acos(GLOW_COS);
  let amp = AMP_INITIAL;
  let periods = 0;
  while (!isSolved(amp) && periods < 60) {
    amp = stepAmp(amp, PERIOD_S);
    amp = Math.min(1, amp + ampDelta(worstPhase));
    periods += 1;
  }
  expect(isSolved(amp)).toBe(true);
  expect(periods).toBeLessThanOrEqual(20); // 한 주기 2.4s × 20 = 48s 상한

  // 반례: 위상을 무시한 균일 간격 탭(주기와 어긋난 1.0s 간격)은 바닥에 머문다
  let blind = AMP_INITIAL;
  for (let t = 0; t < 60; t += 1.0) {
    blind = stepAmp(blind, 1.0);
    blind = Math.min(1, Math.max(0, blind + ampDelta(phaseAt(t))));
  }
  expect(isSolved(blind)).toBe(false);
  // 역박자 탭은 감쇠 바닥(AMP_FLOOR) 밑까지도 깎는다 — 벌점이 눈에 보이는 것이 의도
  expect(blind).toBeLessThan(AMP_FLOOR + 0.1);
  expect(blind).toBeGreaterThanOrEqual(0);
});

test("암전 방에서 P1을 풀면 시동·점등되고 코드 이벤트가 발화한다", async ({ page }) => {
  test.setTimeout(150_000);
  const isMobile = test.info().project.name === "mobile";
  await enterSonicRoom(page);

  // 진입 시 방은 어둡다 (P1의 보상 이벤트가 점등 신호)
  expect(
    await page.evaluate(() => (window as never as { __qe: { lit: boolean } }).__qe.lit)
  ).toBe(false);

  await openStation(page, isMobile, 6, 4.5, "puzzle-pendulum");
  await expect(page.getByTestId("dynamo-started")).toBeHidden();

  // e2e 훅으로 진폭 도달 (리듬 입력은 CI에서 플레이키 — 수렴은 위 순수 검산이 보증)
  await page.evaluate((v) => {
    (window as never as { __qePendSet: (n: number) => void }).__qePendSet(v);
  }, SOLVE_AMP);

  const done = page.getByTestId("dynamo-started");
  await expect(done).toBeVisible({ timeout: 8000 });
  await expect(done).toContainText(`[${MELODY_NOTE}]`);
  await dismissDialogues(page); // #sn-pend-clear
  await expect(page.getByTestId("puzzle-pendulum")).toBeHidden();

  // 보상 이벤트 + 점등
  await expect
    .poll(() => page.evaluate(() => (window as never as { __qe: { events: string[] } }).__qe.events))
    .toContain("code:pend-solved");
  await expect
    .poll(() => page.evaluate(() => (window as never as { __qe: { lit: boolean } }).__qe.lit))
    .toBe(true);
});

test("해결 후 저널의 원리 카드에서 멜로디 음과 성취기준을 다시 볼 수 있다", async ({ page }) => {
  test.setTimeout(150_000);
  const isMobile = test.info().project.name === "mobile";
  await enterSonicRoom(page);
  await openStation(page, isMobile, 6, 4.5, "puzzle-pendulum");
  await page.evaluate((v) => {
    (window as never as { __qePendSet: (n: number) => void }).__qePendSet(v);
  }, SOLVE_AMP);
  await expect(page.getByTestId("dynamo-started")).toBeVisible({ timeout: 8000 });
  await dismissDialogues(page);
  await expect(page.getByTestId("puzzle-pendulum")).toBeHidden();

  await page.getByTestId("note-counter").click();
  await page.getByTestId("journal-tab-principles").click();
  await page.getByTestId("journal-item-principle-pendulum-dynamo").click();
  const card = page.getByTestId("principle-overlay");
  await expect(card).toBeVisible();
  await expect(card).toContainText(`[${MELODY_NOTE}]`);
  await expect(card).toContainText("[12역학03-01]");
});
