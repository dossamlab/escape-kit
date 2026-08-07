import { test, expect } from "@playwright/test";
import { enterRoom, interact, moveTo } from "./helpers";

/**
 * 수색 지점 — 배경 그림의 벽면 가구 위에 얹은 핫스팟.
 * 스프라이트가 없는 투명 오브젝트이고 격자 바깥(벽 쪽)에 있어 사거리로만 닿는다.
 * **걸을 수 있는 지점에서 실제로 닿는지**가 이 spec의 핵심이다.
 *
 * 수색은 방탈출 밀도(질감·넛지)만 담당한다 — 이 방의 잠금은 퍼즐이 내주는 네 음뿐이라,
 * 수색이 아이템을 주지 않는다는 것도 함께 검증한다.
 *
 * ⚠ 회귀 검사: 발견 오버레이를 닫은 뒤 이동·상호작용이 다시 되어야 한다.
 * 오버레이가 openBoxes 카운터를 되돌리지 못하면 게임이 영구히 잠긴다.
 */

/** 걸어가서 조사하고, 발견 텍스트를 확인한 뒤 닫는다 */
async function search(
  page: import("@playwright/test").Page,
  isMobile: boolean,
  tx: number,
  ty: number,
  expectText: string
): Promise<void> {
  await moveTo(page, isMobile, tx, ty, 0.4);
  const discovery = page.getByTestId("discovery-overlay");
  // 부하가 걸리면 첫 입력이 삼켜질 수 있다 (openStation과 같은 이유)
  for (let i = 0; i < 4; i++) {
    await interact(page, isMobile);
    const shown = await discovery
      .waitFor({ state: "visible", timeout: 3000 })
      .then(() => true)
      .catch(() => false);
    if (shown) break;
  }
  await expect(discovery).toBeVisible();
  await expect(discovery).toContainText(expectText);
  await page.getByTestId("discovery-close").click();
  await expect(discovery).toBeHidden();
}

test("벽면 가구 세 곳을 조사하면 각각 다른 발견 텍스트가 나온다", async ({ page }) => {
  test.setTimeout(150_000);
  const isMobile = test.info().project.name === "mobile";
  await enterRoom(page);

  // 스피커 배선함 (3.2,0.4) — 두 스피커가 한 발진기에서 갈라진다. P3 무음 지점의 넛지
  await search(page, isMobile, 3.2, 2.2, "하나의 발진기");
  // 방음 쐐기 벽 (0.4,6) — 세계관·질감
  await search(page, isMobile, 1.9, 6, "메아리 없는 방");
  // 지오폰 랙 (0.8,10.2) — "빈 곳은 두 번 운다". P2 벽면 탐상의 넛지
  await search(page, isMobile, 2.6, 10.2, "빈 곳은 두 번 운다");

  // 이 방의 수색은 아이템을 주지 않는다 (릴 테이프는 퍼즐 보상이다)
  await expect(page.getByTestId("discovery-item")).toHaveCount(0);
  const items = await page.evaluate(
    () => (window as never as { __qe: { items: string[] } }).__qe.items
  );
  expect(items).toEqual([]);
});

test("같은 곳을 다시 조사하면 원문은 그대로, '새로울 건 없다' 안내가 덧붙는다", async ({ page }) => {
  test.setTimeout(120_000);
  const isMobile = test.info().project.name === "mobile";
  await enterRoom(page);

  await search(page, isMobile, 1.9, 6, "메아리 없는 방");

  // 재수색 — 단서 원문을 다시 볼 수 있어야 한다(단서를 손으로 받아적게 하지 않는다)
  await interact(page, isMobile);
  const discovery = page.getByTestId("discovery-overlay");
  await expect(discovery).toBeVisible();
  await expect(discovery).toContainText("메아리 없는 방");
  await expect(page.getByTestId("discovery-footer")).toContainText("새로울 건 없다");
  await page.getByTestId("discovery-close").click();
});
