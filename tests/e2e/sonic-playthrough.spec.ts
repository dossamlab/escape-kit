import { test, expect, type Page } from "@playwright/test";
import {
  enterSonicRoom,
  openBoothZone,
  openStation,
  collectNoteAt,
  moveTo,
  interact,
  dismissDialogues,
  APPROACH_THRESHOLD,
} from "./helpers";
import { SOLUTION_FRACS } from "../../src/puzzles/monochord/autoplay";
import { MELODY, DOPPLER_ANSWER } from "../../src/puzzles/sonic-console/autoplay";

/**
 * 예제 방 전체 주파 — 이 방의 **구조**가 성립하는지가 초점이다:
 *   암전 → P1(점등·경보 개시) → 본실 2(노크·무음점) → 부스 개방 → P4 모노코드 →
 *   콘솔 3중 게이트(테이프·멜로디·도플러) → 출구 엔딩(방 전용 에필로그).
 * 개별 판정은 각 퍼즐 spec이 덮으므로 여기서는 사슬과 엔딩 분기만 본다.
 */

test("이 방의 에필로그는 이 방 전용 앵커다 — 데이터 검산", async () => {
  // 에필로그 미지정 시 엔진 기본 앵커가 재생되는 사고(thermal 전례)의 회귀 방지
  const { sonicRoom } = await import("../../src/maps/sonic-room");
  expect(sonicRoom.epilogue).toEqual({
    open: "#epilogue3-open",
    notesComplete: "#epilogue3-notes-complete",
    notesIncomplete: "#epilogue3-notes-incomplete",
  });
  // 멜로디 4음 = 방의 퍼즐 4개가 하나씩 낸 음 (원리 카드 병기 순서)
  const { MELODY_KEY: k1, MELODY_POSITION: p1 } = await import(
    "../../src/puzzles/pendulum-dynamo/autoplay"
  );
  const { MELODY_KEY: k2, MELODY_POSITION: p2 } = await import(
    "../../src/puzzles/wall-sounding/autoplay"
  );
  const { MELODY_KEY: k3, MELODY_POSITION: p3 } = await import(
    "../../src/puzzles/silent-node/autoplay"
  );
  const { MELODY_KEY: k4, MELODY_POSITION: p4 } = await import(
    "../../src/puzzles/monochord/autoplay"
  );
  const byPos: string[] = [];
  for (const [k, p] of [
    [k1, p1],
    [k2, p2],
    [k3, p3],
    [k4, p4],
  ] as [string, number][]) {
    byPos[p - 1] = k;
  }
  expect(byPos.join("")).toBe(MELODY.join(""));
});

/** 콘솔 앞 상호작용 → (첫 회 잠금 대사) → 멜로디 입력 → 도플러 모달까지 */
async function unlockSonicConsole(page: Page, isMobile: boolean): Promise<void> {
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
  if (await dialogue.isVisible().catch(() => false)) await dialogue.click(); // #gate-sonic-locked
  await expect(keypad).toBeVisible();
  for (const v of MELODY) await page.getByTestId(`key-${v}`).click();
  await page.getByTestId("keypad-enter").click();
  await dismissDialogues(page); // #sn-tape-voice → #sn-console-intro
  await expect(page.getByTestId("puzzle-doppler")).toBeVisible();
}

test("암전→P1→본실2→부스→모노코드→콘솔→출구 엔딩(노트 완주 분기)까지 주파한다", async ({
  page,
}) => {
  test.setTimeout(480_000);
  const isMobile = test.info().project.name === "mobile";
  await enterSonicRoom(page);

  // 본실 노트 4 (봉인 밖) — 완주 분기를 위해 전부 줍는다
  await collectNoteAt(page, isMobile, 8, 6);
  await collectNoteAt(page, isMobile, 11.5, 4);
  await collectNoteAt(page, isMobile, 7, 10);
  await collectNoteAt(page, isMobile, 4, 12.5);

  // P1(점등) → P2(테이프) → P3(무음점) → 부스 개방
  await openBoothZone(page, isMobile);

  // 부스 안 노트 2
  await collectNoteAt(page, isMobile, 17.2, 2.6);
  await collectNoteAt(page, isMobile, 13.9, 5.3);

  // P4 모노코드 — 3배음 '솔'
  await openStation(page, isMobile, 14.9, 9.0, "puzzle-mono");
  await page.evaluate((f) => {
    (window as never as { __qeMonoTap: (n: number) => void }).__qeMonoTap(f);
  }, SOLUTION_FRACS[0]);
  await expect(page.getByTestId("mono-rung")).toBeVisible();
  await dismissDialogues(page); // #sn-mono-clear
  await expect(page.getByTestId("puzzle-mono")).toBeHidden();

  // 콘솔 — 멜로디 → 도플러 판독
  await unlockSonicConsole(page, isMobile);
  await page.getByTestId(`dop-${DOPPLER_ANSWER}`).click();
  await expect(page.getByTestId("doppler-read")).toBeVisible();
  await dismissDialogues(page); // #sn-console-clear

  const events = await page.evaluate(
    () => (window as never as { __qe: { events: string[] } }).__qe.events
  );
  expect(events).toEqual(
    expect.arrayContaining([
      "code:pend-solved",
      "code:knock-solved",
      "code:node-solved",
      "code:mono-solved",
      "door:sonic-open",
    ])
  );

  // 출구 — 방 전용 에필로그(#epilogue3-*) → 노트 완주 분기 엔딩 화면
  await moveTo(page, isMobile, 0.8, 15, 1.4);
  await interact(page, isMobile);
  await dismissDialogues(page);
  const ending = page.getByTestId("ending-screen");
  await expect(ending).toBeVisible({ timeout: 20_000 });
  // 이 방 노트 6개를 전부 읽었으므로 완주 분기 — '돌아가서 노트 찾기' 버튼이 없다
  await expect(page.getByTestId("ending-continue-button")).toBeHidden();
  await expect(page.getByTestId("ending-stats")).toBeVisible();
});
