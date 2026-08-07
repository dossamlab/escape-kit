import { test, expect } from "@playwright/test";
import { enterSonicRoom, solvePendulum, solveNode, moveTo, dismissDialogues } from "./helpers";
import {
  SPEAKER_A,
  SPEAKER_B,
  LAMBDA_TILES,
  HATCH,
  LOUD_SPOT,
  SILENT_THRESHOLD,
  MELODY_NOTE,
  PHASE_SUM_TOLERANCE,
  pathDiff,
  loudnessAt,
  isSilentAt,
  sumAmplitudeAt,
} from "../../src/puzzles/silent-node/autoplay";

/**
 * 예제 방 P3 무음 지점 — 모달 없는 방 전체 퍼즐(상쇄 간섭).
 * 정답·기하는 autoplay.ts에서만 가져온다 (spec에 답 재기입 금지).
 */

test("해치는 상쇄 간섭 마디 위에 있다 — 기하 검산", () => {
  // 해치 지점의 경로차는 반파장(λ/2) — 상쇄 조건
  expect(Math.abs(Math.abs(pathDiff(HATCH[0], HATCH[1])) - LAMBDA_TILES / 2)).toBeLessThan(0.1);
  expect(loudnessAt(HATCH[0], HATCH[1])).toBeLessThan(0.05);
  expect(isSilentAt(HATCH[0], HATCH[1])).toBe(true);
  // 두 스피커의 한가운데는 보강 간섭 — 오히려 가장 시끄럽다 (힌트 ③의 근거)
  const mid: [number, number] = [(SPEAKER_A[0] + SPEAKER_B[0]) / 2, SPEAKER_A[1]];
  expect(loudnessAt(mid[0], mid[1])).toBeGreaterThan(0.95);
  // 3λ/2 마디는 존재하지 않는다 — 경로차 최댓값이 스피커 간격이라 λ/2 마디선뿐
  const span = Math.hypot(SPEAKER_B[0] - SPEAKER_A[0], SPEAKER_B[1] - SPEAKER_A[1]);
  expect((3 * LAMBDA_TILES) / 2).toBeGreaterThan(span);
});

test("모달 위상 정렬 — 동위상은 시끄럽고 반대 위상만 임계 아래다", () => {
  // 시작 상태(Δφ=0)는 보강 — 스위치가 잠겨 있어야 하는 근거
  expect(sumAmplitudeAt(0)).toBeGreaterThan(0.99);
  // 반대 위상(Δφ=π)은 완전 상쇄 — 허용창 안
  expect(sumAmplitudeAt(Math.PI)).toBeLessThan(PHASE_SUM_TOLERANCE);
  // 허용창이 사분파장(Δφ=π/2)까지 열릴 만큼 느슨하진 않다 — 치즈 방지
  expect(sumAmplitudeAt(Math.PI / 2)).toBeGreaterThan(PHASE_SUM_TOLERANCE);
});

test("개념 없이도 미터를 따라 걸으면 수렴한다 — 단조 감소 검산", () => {
  // 중앙축(시끄러움)에서 해치까지 직선으로 걸을 때 음량이 단조 감소 —
  // "줄어드는 쪽으로 걸어라"(뜨겁다/차갑다)가 게이트 없는 안내가 된다는 근거
  const from: [number, number] = [(SPEAKER_A[0] + SPEAKER_B[0]) / 2, HATCH[1]];
  const steps = 12;
  let prev = Infinity;
  for (let i = 0; i <= steps; i++) {
    const x = from[0] + ((HATCH[0] - from[0]) * i) / steps;
    const y = from[1] + ((HATCH[1] - from[1]) * i) / steps;
    const loud = loudnessAt(x, y);
    expect(loud).toBeLessThanOrEqual(prev + 1e-9);
    prev = loud;
  }
  expect(prev).toBeLessThan(SILENT_THRESHOLD);
});

test("P1 해결로 경보가 시작되고, 무음 해치에서 차단하면 경보가 멎는다", async ({ page }) => {
  test.setTimeout(180_000);
  const isMobile = test.info().project.name === "mobile";
  await enterSonicRoom(page);

  // 전원 복구 전 — 미터 없음, 해치는 반응하되 열 이유가 없다
  await expect(page.getByTestId("noise-meter")).toBeHidden();

  await solvePendulum(page, isMobile);
  // 경보 개시 — 대사(#sn-alarm-start) + 미터 표시
  await dismissDialogues(page);
  const meter = page.getByTestId("noise-meter");
  await expect(meter).toBeVisible();

  // 걷는 위치에 따라 미터가 변한다 — 시끄러운 등거리 축(LOUD_SPOT)에서 확인
  await moveTo(page, isMobile, LOUD_SPOT[0], LOUD_SPOT[1], 0.6);
  await expect
    .poll(async () => Number(await meter.getAttribute("data-loudness")))
    .toBeGreaterThan(0.5);

  // 해치로 이동 — 무음 지점: 미터가 임계 아래로
  await moveTo(page, isMobile, HATCH[0], HATCH[1], 0.4);
  await expect
    .poll(async () => Number(await meter.getAttribute("data-loudness")))
    .toBeLessThan(SILENT_THRESHOLD + 0.1);

  await solveNode(page, isMobile);
  await expect
    .poll(() => page.evaluate(() => (window as never as { __qe: { events: string[] } }).__qe.events))
    .toContain("code:node-solved");
  // 경보 정지 — 미터가 사라진다
  await expect(meter).toBeHidden();
});

test("해결 후 저널의 원리 카드에서 멜로디 음과 성취기준을 다시 볼 수 있다", async ({ page }) => {
  test.setTimeout(180_000);
  const isMobile = test.info().project.name === "mobile";
  await enterSonicRoom(page);
  await solvePendulum(page, isMobile);
  await dismissDialogues(page);
  await solveNode(page, isMobile);

  await page.getByTestId("note-counter").click();
  await page.getByTestId("journal-tab-principles").click();
  await page.getByTestId("journal-item-principle-silent-node").click();
  const card = page.getByTestId("principle-overlay");
  await expect(card).toBeVisible();
  await expect(card).toContainText(`[${MELODY_NOTE}]`);
  await expect(card).toContainText("[12역학03-04]");
});
