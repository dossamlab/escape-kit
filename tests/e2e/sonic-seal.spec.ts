import { test, expect, type Page } from "@playwright/test";
import { enterSonicRoom, solvePendulum, solveKnock, solveNode, moveTo, dismissDialogues } from "./helpers";

/**
 * 이 방의 구조 자체를 검증한다 — 본실 P2(벽 노크)와 P3(무음 지점)를 **둘 다** 풀어야
 * 남동쪽 녹음 부스 봉인이 열린다(opensWhen의 AND 조건). P1(전원)은 봉인 조건이
 * 아니지만 P3의 전제(경보 활성)라 실질 선행 조건이다.
 */

const seals = (page: Page) =>
  page.evaluate(() => (window as never as { __qe: { seals: Record<string, number> } }).__qe.seals);

test("본실 둘(노크·무음점)을 전부 풀어야 녹음 부스가 열린다", async ({ page }) => {
  test.setTimeout(300_000);
  const isMobile = test.info().project.name === "mobile";
  await enterSonicRoom(page);

  // 진입 시 부스·앞마당 둘 다 닫혀 있고, 봉인 안 장치(모노코드)는 라벨조차 안 뜬다
  expect((await seals(page))["booth"]).toBe(1);
  expect((await seals(page))["booth-annex"]).toBe(1);
  await moveTo(page, isMobile, 13, 2.5, 0.7);
  await expect(page.getByTestId("interact-label")).toBeHidden();
  // 모노코드는 앞마당(booth-annex) 봉인 안 — 개방 전엔 접근해도 라벨이 없다
  await moveTo(page, isMobile, 13, 7.6, 0.7);
  await expect(page.getByTestId("interact-label")).toBeHidden();

  await solvePendulum(page, isMobile);
  await dismissDialogues(page); // #sn-alarm-start
  expect((await seals(page))["booth"], "전원 복구만으로는 닫혀 있어야 한다").toBe(1);

  await solveKnock(page, isMobile);
  expect((await seals(page))["booth"], "하나만 풀면 아직 닫혀 있어야 한다").toBe(1);

  await solveNode(page, isMobile);
  await dismissDialogues(page); // #sn-seal-open
  // 둘째를 푼 직후엔 페이드 중(0 < α < 1)이고, 곧 0이 된다
  await expect.poll(async () => (await seals(page))["booth"], { timeout: 10_000 }).toBe(0);

  await expect.poll(async () => (await seals(page))["booth-annex"], { timeout: 10_000 }).toBe(0);

  // 이제 부스 앞마당의 모노코드에 닿는다
  await moveTo(page, isMobile, 14.9, 9.0, 0.5);
  await expect(page.getByTestId("interact-label")).toContainText("모노코드");
});
