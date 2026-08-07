import { test, expect } from "@playwright/test";
import { enterRoom, continueGame, interact, moveTo } from "./helpers";
import { SAVE_KEY } from "../../src/config";

/**
 * 진행 저장: 노트를 읽고 새로고침 → '이어하기'로 재개해도 수집 상태가 유지되는지.
 * 저장 키는 src/config.ts의 SAVE_KEY 하나뿐이다 — spec도 거기서 가져와 쓴다
 * (키를 바꿨는데 테스트만 옛 키를 보고 있으면 "저장된다"는 거짓 통과가 난다).
 * (Playwright 컨텍스트는 reload 간 localStorage를 보존한다)
 */

/** 첫 방의 연구노트 하나 앞 — note-41 (8,6), 사거리 1.2 */
const NOTE_SPOT = { x: 8, y: 6.6, id: "note-41" } as const;

test("연구노트 수집이 새로고침·이어하기 후에도 유지된다", async ({ page }) => {
  const isMobile = test.info().project.name === "mobile";
  await enterRoom(page);

  await moveTo(page, isMobile, NOTE_SPOT.x, NOTE_SPOT.y, 0.4);
  await interact(page, isMobile);
  await expect(page.getByTestId("note-overlay")).toBeVisible();
  await page.getByTestId("note-close").click();
  await expect(page.getByTestId("note-counter")).toContainText("연구노트 1 /");

  // 새로고침 → 타이틀에 '이어하기'가 뜨고, 재개 시 수집 유지
  await page.reload();
  await expect(page.getByTestId("continue-button")).toBeVisible();
  await continueGame(page);
  await expect(page.getByTestId("note-counter")).toContainText("연구노트 1 /");
});

test("진행은 SAVE_KEY 한 곳에만 저장된다", async ({ page }) => {
  const isMobile = test.info().project.name === "mobile";
  await enterRoom(page);
  await moveTo(page, isMobile, NOTE_SPOT.x, NOTE_SPOT.y, 0.4);
  await interact(page, isMobile);
  await page.getByTestId("note-close").click();

  const store = await page.evaluate(() =>
    Object.fromEntries(
      Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)] as const)
    )
  );
  expect(Object.keys(store)).toEqual([SAVE_KEY]);
  expect(JSON.parse(store[SAVE_KEY]!).notes).toContain(NOTE_SPOT.id);
});

test("처음부터 시작하면 진행이 초기화된다", async ({ page }) => {
  const isMobile = test.info().project.name === "mobile";
  await enterRoom(page);
  await moveTo(page, isMobile, NOTE_SPOT.x, NOTE_SPOT.y, 0.4);
  await interact(page, isMobile);
  await page.getByTestId("note-close").click();
  await expect(page.getByTestId("note-counter")).toContainText("연구노트 1 /");

  // 새로고침 후 '처음부터' → 카운터 0으로 리셋
  await page.reload();
  await enterRoom(page); // start-button = '처음부터'
  await expect(page.getByTestId("note-counter")).toContainText("연구노트 0 /");
});

test("선택한 캐릭터(여)가 이어하기 후에도 유지된다", async ({ page }) => {
  const isMobile = test.info().project.name === "mobile";
  await enterRoom(page, "f");

  // 진행을 하나 만들어 저장 발생 (노트 수집)
  await moveTo(page, isMobile, NOTE_SPOT.x, NOTE_SPOT.y, 0.4);
  await interact(page, isMobile);
  await page.getByTestId("note-close").click();

  await page.reload();
  await continueGame(page);
  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? "{}"),
    SAVE_KEY
  );
  expect(saved.character).toBe("f");
});
