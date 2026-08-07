import { test, expect, type Page } from "@playwright/test";
import { enterSonicRoom, openBoothZone, moveTo, interact, dismissDialogues, APPROACH_THRESHOLD } from "./helpers";
import knockManifest from "../../src/puzzles/wall-sounding/manifest.json" with { type: "json" };
import {
  KEYS,
  MELODY,
  GATE_CODE,
  MELODY_FREQS,
  DOPPLER_ANSWER,
  RECEDE_PITCH_START,
  RECEDE_PITCH_END,
  pitchAt,
  isCorrect,
} from "../../src/puzzles/sonic-console/autoplay";

/**
 * 예제 방 최종 콘솔 — 3중 게이트(테이프→멜로디 건반→도플러 판독).
 * 정답·상수는 autoplay.ts에서만 가져온다 (spec에 답 재기입 금지).
 */

test("멜로디 게이트와 도플러 판독의 상수가 정합한다 — 상수 검산", () => {
  // 코드는 멜로디의 직렬화이고, 멜로디의 각 음은 8건반에 존재한다
  expect(GATE_CODE).toBe(MELODY.join(""));
  expect(MELODY).toHaveLength(4);
  for (const v of MELODY) {
    expect(KEYS.some((k) => k.value === v)).toBe(true);
  }
  // 판독 정답은 '멀어지며 빨라짐'. 근거는 배율 두 가지 성질이고, 넷 중 하나만 만족한다:
  //   내내 1보다 작다      → 원음보다 낮다        → 멀어지는 중
  //   내내 감소한다        → 차이가 벌어진다      → 멀어지는 속도가 커지는 중
  expect(isCorrect(DOPPLER_ANSWER)).toBe(true);
  for (const wrong of ["approach-faster", "approach-slower", "away-slower"] as const) {
    expect(isCorrect(wrong)).toBe(false);
  }
  expect(RECEDE_PITCH_END).toBeLessThan(RECEDE_PITCH_START);
  const total = 3;
  let prev = Infinity;
  for (let t = 0; t <= total; t += 0.25) {
    const p = pitchAt(t, total);
    expect(p).toBeLessThan(prev); // 등속이었다면 여기서 같아야 한다 — 가속의 증거
    expect(p).toBeLessThan(1); // 항상 원음보다 낮다 — 처음부터 멀어지고 있었다는 뜻
    prev = p;
  }
  expect(DOPPLER_ANSWER).toBe("away-faster");
  expect(MELODY_FREQS).toHaveLength(4);
});

/** 콘솔 앞까지 가서 상호작용 — 입력 삼킴 대비 재시도 (unlockEntropyConsole 규약) */
async function approachSonicConsole(page: Page, isMobile: boolean): Promise<void> {
  await moveTo(page, isMobile, 15.0, 1.0, APPROACH_THRESHOLD);
  const dialogue = page.getByTestId("dialogue-box");
  const keypad = page.getByTestId("keypad");
  for (let attempt = 0; attempt < 4; attempt++) {
    await interact(page, isMobile);
    const reacted = await Promise.race([
      dialogue.waitFor({ state: "visible", timeout: 3000 }).then(() => true),
      keypad.waitFor({ state: "visible", timeout: 3000 }).then(() => true),
    ]).catch(() => false);
    if (reacted) break;
  }
}

test("정상 플레이에서 테이프 없이 콘솔 앞에 설 수 없다 — 게이트 순서 검산", async () => {
  // 인벤토리 제거 훅이 없어 '테이프 미소지 + 부스 개방' 상태는 만들 수 없다.
  // 대신 구조로 보증한다: 부스 봉인을 여는 조건에 P2(code:knock-solved)가 포함돼
  // 있고, P2의 보상이 곧 릴 테이프라 — 콘솔에 도달한 시점엔 반드시 테이프가 있다.
  // (puzzle.ts는 CSS를 import해 Node에서 못 읽는다 — 데이터 파일만 정적 import)
  const { sonicRoom } = await import("../../src/maps/sonic-room");
  expect(sonicRoom.sealed![0].opensWhen).toContain(knockManifest.reward.event);
  expect(knockManifest.reward.itemId).toBe("reel-tape");
});

test("멜로디 건반 → 육성 테이프 → 도플러 판독(오답→비교→정답) → 문 개방", async ({ page }) => {
  test.setTimeout(300_000);
  const isMobile = test.info().project.name === "mobile";
  await enterSonicRoom(page);
  await openBoothZone(page, isMobile);

  await approachSonicConsole(page, isMobile);
  const dialogue = page.getByTestId("dialogue-box");
  // #gate-sonic-locked (세션 첫 회) → 건반 키패드
  if (await dialogue.isVisible().catch(() => false)) await dialogue.click();
  const keypad = page.getByTestId("keypad");
  await expect(keypad).toBeVisible();
  // 건반 스킨 — 8건반과 음이름 라벨이 떠 있다
  await expect(keypad.locator(".keypad-note")).toHaveCount(KEYS.length);

  // 멜로디 입력 (자리값은 autoplay의 MELODY에서만)
  for (const v of MELODY) {
    await page.getByTestId(`key-${v}`).click();
  }
  await page.getByTestId("keypad-enter").click();

  // 해금 대사: #sn-tape-voice(한이준 육성) → 인트로: #sn-console-intro → 모달
  await dismissDialogues(page);
  const puzzle = page.getByTestId("puzzle-doppler");
  await expect(puzzle).toBeVisible();

  // 기록 재생 — 스펙트로그램 트레이스(시각 백업)
  await page.getByTestId("dop-play").click();

  // 오답: 방향은 맞고 속도 변화만 틀린 선택지 → 반응 대사 + 비교 재생 해금
  const wrongPick = DOPPLER_ANSWER === "away-faster" ? "dop-away-slower" : "dop-away-faster";
  await page.getByTestId(wrongPick).click();
  await expect(dialogue).toBeVisible(); // #sn-console-wrong
  await dialogue.click();
  await expect(page.getByTestId("dop-compare")).toBeVisible();
  await expect(page.getByTestId("doppler-read")).toBeHidden();

  // 정답: 멀어짐 → 판독 확정 → door:sonic-open
  await page.getByTestId(`dop-${DOPPLER_ANSWER}`).click();
  await expect(page.getByTestId("doppler-read")).toBeVisible();
  await dismissDialogues(page); // #sn-console-clear
  await expect(puzzle).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => (window as never as { __qe: { events: string[] } }).__qe.events))
    .toContain("door:sonic-open");
});

test("해결 후 저널의 원리 카드에서 도플러 성취기준을 다시 볼 수 있다", async ({ page }) => {
  test.setTimeout(300_000);
  const isMobile = test.info().project.name === "mobile";
  await enterSonicRoom(page);
  await openBoothZone(page, isMobile);
  await approachSonicConsole(page, isMobile);
  const dialogue = page.getByTestId("dialogue-box");
  if (await dialogue.isVisible().catch(() => false)) await dialogue.click();
  for (const v of MELODY) await page.getByTestId(`key-${v}`).click();
  await page.getByTestId("keypad-enter").click();
  await dismissDialogues(page);
  await page.getByTestId(`dop-${DOPPLER_ANSWER}`).click();
  await expect(page.getByTestId("doppler-read")).toBeVisible();
  await dismissDialogues(page);

  await page.getByTestId("note-counter").click();
  await page.getByTestId("journal-tab-principles").click();
  await page.getByTestId("journal-item-principle-sonic-console").click();
  const card = page.getByTestId("principle-overlay");
  await expect(card).toBeVisible();
  await expect(card).toContainText("[12역학03-03]");
  await expect(card).toContainText("스피드건");
});
