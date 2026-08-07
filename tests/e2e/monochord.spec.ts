import { test, expect, type Page } from "@playwright/test";
import { enterSonicRoom, openBoothZone, openStation, dismissDialogues } from "./helpers";
import {
  F0,
  TARGET_HARMONIC,
  TARGET_FREQ,
  SOLUTION_FRACS,
  MELODY_NOTE,
  harmonicAt,
  nodeSpotAt,
  noteNameOf,
} from "../../src/puzzles/monochord/autoplay";

/**
 * 예제 방 P4 모노코드 — 현 위 지점 탭(정상파와 배음, 하모닉스).
 * 정답 위치·진동수는 autoplay.ts에서만 가져온다 (spec에 답 재기입 금지).
 */

/** 지정 위치를 짚고 튕긴다 — 화면 탭과 동일 동작의 e2e 훅 */
function tapAt(page: Page, posFrac: number): Promise<void> {
  return page.evaluate((v) => {
    (window as never as { __qeMonoTap: (n: number) => void }).__qeMonoTap(v);
  }, posFrac);
}

test("마디 판정과 목표 진동수 — 상수 검산", () => {
  // 3배음의 두 내부 마디(L/3, 2L/3) — 복수 정답 모두 3배음으로 판정
  expect(harmonicAt(1 / 3)).toBe(3);
  expect(harmonicAt(2 / 3)).toBe(3);
  for (const f of SOLUTION_FRACS) expect(harmonicAt(f)).toBe(TARGET_HARMONIC);
  // 다른 마디: L/2 = 2배음(옥타브), L/4 = 4배음
  expect(harmonicAt(1 / 2)).toBe(2);
  expect(harmonicAt(1 / 4)).toBe(4);
  // 마디가 아닌 자리는 죽은 소리 (0.41은 어느 k/n에서도 POS_TOL 밖)
  expect(harmonicAt(0.41)).toBeNull();
  // 목표 음: f = n·f₀ = 3×130.81 = 392.43 Hz — 콘솔 '솔' 건반 392 Hz(G4)와 정합
  expect(TARGET_FREQ).toBeCloseTo(F0 * TARGET_HARMONIC, 6);
  expect(Math.abs(TARGET_FREQ - 392.43)).toBeLessThan(0.1);
  expect(Math.round(TARGET_FREQ)).toBe(392);
  // 목표 배음의 음이름이 멜로디 넷째 음과 일치
  expect(noteNameOf(TARGET_HARMONIC)).toBe(MELODY_NOTE);
});

test("개념 없이도 2% 간격 전수 탐색으로 특정된다 — 순수 함수 검산", () => {
  // 전략: 개념 없이 현을 2%(1/50) 간격으로 전부 짚어 보고, 울린 '자리'(마디
  // 분수 k/n)와 그때 점등된 음이름만 기록한다 — 화면이 보여주는 것 그대로.
  const rungSpots = new Map<number, string>(); // frac → 음이름
  for (let i = 0; i <= 50; i++) {
    const spot = nodeSpotAt(i / 50);
    if (spot) rungSpots.set(spot.frac, noteNameOf(spot.n));
  }
  // 울리는 자리는 소수(≤10)뿐 — "여기저기 짚으면 몇 곳만 울린다"의 근거
  expect(rungSpots.size).toBeGreaterThan(0);
  expect(rungSpots.size).toBeLessThanOrEqual(10);
  // 그중 3배음 자리(정답 둘 다)가 반드시 포함된다 — 전수 시행으로 특정 가능 보증
  for (const f of SOLUTION_FRACS) {
    expect(rungSpots.has(f)).toBe(true);
    expect(rungSpots.get(f)).toBe(MELODY_NOTE);
  }
  // 울린 자리마다 음이름이 떠서 [목표 음 듣기]의 '솔'과 대조하며 수렴한다
  expect([...rungSpots.values()]).toContain(MELODY_NOTE);
});

test("마디가 아니면 죽고, 마디면 울린다 — 3배음 '솔'로 자물쇠가 열린다", async ({ page }) => {
  test.setTimeout(240_000); // openBoothZone이 P1·P2·P3를 실제로 푼다
  const isMobile = test.info().project.name === "mobile";
  await enterSonicRoom(page);
  await openBoothZone(page, isMobile);
  await openStation(page, isMobile, 14.9, 9.0, "puzzle-mono");
  await expect(page.getByTestId("mono-rung")).toBeHidden();

  // 죽은 자리: '툭' + 무음 표시 + 첫 회에만 대사(#sn-mono-dead)
  await tapAt(page, 0.41);
  await expect(page.getByTestId("mono-mute")).toBeVisible();
  await expect(page.getByTestId("mono-state")).toContainText("죽은 소리");
  const dialogue = page.getByTestId("dialogue-box");
  await expect(dialogue).toBeVisible(); // #sn-mono-dead
  await dialogue.click();
  await expect(dialogue).toBeHidden();

  // 2배음(L/2): 맑게 울리고 음이름 '도′' 점등 — 그러나 자물쇠의 음이 아니다
  await tapAt(page, 1 / 2);
  await expect(page.getByTestId("mono-view")).toHaveAttribute("data-harmonic", "2");
  await expect(page.getByTestId("mono-note-2")).toHaveClass(/lit/);
  await expect(page.getByTestId("mono-state")).toContainText(noteNameOf(2));
  await expect(page.getByTestId("mono-state")).toContainText("원하는 음이 아니다");
  await expect(page.getByTestId("mono-rung")).toBeHidden();

  // 3배음(L/3): 정답 — 정상파 형상 + '솔' 점등 + 해결
  await tapAt(page, SOLUTION_FRACS[0]);
  await expect(page.getByTestId("mono-view")).toHaveAttribute(
    "data-harmonic",
    String(TARGET_HARMONIC)
  );
  const done = page.getByTestId("mono-rung");
  await expect(done).toBeVisible();
  await expect(done).toContainText(`[${MELODY_NOTE}]`);
  await dismissDialogues(page); // #sn-mono-clear
  await expect(page.getByTestId("puzzle-mono")).toBeHidden();

  await expect
    .poll(() => page.evaluate(() => (window as never as { __qe: { events: string[] } }).__qe.events))
    .toContain("code:mono-solved");
});

test("해결 후 저널의 원리 카드에서 멜로디 음과 성취기준을 다시 볼 수 있다", async ({ page }) => {
  test.setTimeout(240_000); // openBoothZone이 P1·P2·P3를 실제로 푼다
  const isMobile = test.info().project.name === "mobile";
  await enterSonicRoom(page);
  await openBoothZone(page, isMobile);
  await openStation(page, isMobile, 14.9, 9.0, "puzzle-mono");
  await tapAt(page, SOLUTION_FRACS[0]);
  await expect(page.getByTestId("mono-rung")).toBeVisible();
  await dismissDialogues(page); // #sn-mono-clear
  await expect(page.getByTestId("puzzle-mono")).toBeHidden();

  await page.getByTestId("note-counter").click();
  await page.getByTestId("journal-tab-principles").click();
  await page.getByTestId("journal-item-principle-monochord").click();
  const card = page.getByTestId("principle-overlay");
  await expect(card).toBeVisible();
  await expect(card).toContainText(`[${MELODY_NOTE}]`);
  await expect(card).toContainText("[12역학03-05]");
});
