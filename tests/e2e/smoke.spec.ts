import { test, expect } from "@playwright/test";
import { enterRoom, interact, moveTo } from "./helpers";

/**
 * smoke: 타이틀 → 프롤로그 → 첫 방 진입 → 이동 → 잠긴 출구 문.
 * desktop-chrome / mobile 두 프로젝트에서 모두 돈다 (playwright.config.ts).
 *
 * 방을 갈아끼우면 여기 좌표와 라벨 문구를 가장 먼저 고치게 된다 —
 * 이 spec은 "엔진이 살아 있는가"를 보는 최소 검사다.
 */

test("방 진입 후 잠긴 출구 문은 잠김 대사만 띄우고 방을 바꾸지 않는다", async ({ page }) => {
  const isMobile = test.info().project.name === "mobile";
  await enterRoom(page);

  if (isMobile) {
    await expect(page.getByTestId("joystick-layer")).toBeVisible();
  }

  // 출구 문(0.8,15)은 서쪽 벽 안쪽이라 사거리(1.6)로 닿는다 — 벽 띠 밖 (1.9,15)에 선다
  await moveTo(page, isMobile, 1.9, 15, 0.4);
  const label = page.getByTestId("interact-label");
  await expect(label).toBeVisible();
  await expect(label).toContainText("출구");

  await interact(page, isMobile);
  const dialogue = page.getByTestId("dialogue-box");
  await expect(dialogue).toBeVisible(); // #sys-door-locked
  await dialogue.click();
  await expect(dialogue).toBeHidden();

  // 잠김 상태에서는 방이 바뀌지 않고 엔딩도 열리지 않는다
  await expect
    .poll(() => page.evaluate(() => (window as never as { __qe: { map: string } }).__qe.map))
    .toBe("sonic-room");
  await expect(page.getByTestId("ending-screen")).toBeHidden();
});

test("데스크톱: 방향키로 플레이어가 이동한다", async ({ page }) => {
  test.skip(test.info().project.name === "mobile", "키보드 이동은 데스크톱 전용");
  await enterRoom(page);

  const x0 = await page.evaluate(() => (window as never as { __qe: { player: { x: number } } }).__qe.player.x);
  await page.keyboard.down("ArrowLeft");
  await expect
    .poll(() => page.evaluate(() => (window as never as { __qe: { player: { x: number } } }).__qe.player.x))
    .toBeLessThan(x0 - 0.2);
  await page.keyboard.up("ArrowLeft");
});

test("데스크톱: 대사가 떠 있는 동안 E는 대사만 넘기고 상호작용을 열지 않는다", async ({ page }) => {
  test.skip(test.info().project.name === "mobile", "E 키 진행은 데스크톱 전용");
  await page.goto("/");
  await page.getByTestId("start-button").click();
  await page.getByTestId("char-select").waitFor();
  await page.getByTestId("char-m").click();

  const dialogue = page.getByTestId("dialogue-box");
  await expect(dialogue).toBeVisible(); // 프롤로그 wake
  await dialogue.click();
  await expect(page.getByTestId("game-canvas")).toBeVisible();

  // 튜토리얼·규칙·방 인트로 대사를 E로 넘긴다 — 같은 키 입력이 상호작용을 열면 안 됨.
  await expect(dialogue).toBeVisible();
  let guard = 0;
  while (await dialogue.isVisible()) {
    await page.keyboard.press("KeyE");
    await expect(page.getByTestId("keypad")).toBeHidden();
    // 어떤 순간에도 대사 박스는 최대 1개 (마지막 줄을 닫은 직후엔 0개일 수 있다)
    expect(await page.getByTestId("dialogue-box").count()).toBeLessThanOrEqual(1);
    await page.waitForTimeout(150);
    if (++guard > 15) throw new Error("대사가 15회 입력 후에도 닫히지 않는다");
  }
  await expect(dialogue).toBeHidden();

  // 대사가 모두 닫힌 뒤의 E는 정상적으로 상호작용을 연다 — 수색 지점의 발견 오버레이.
  // 직렬 부하에서는 직전 대사의 정리가 한 프레임 늦어 첫 입력이 삼켜질 수 있으므로
  // 반응이 없으면 다시 누른다 (검증 대상은 "E가 상호작용을 연다"이지 1회 입력이 아니다).
  await moveTo(page, false, 1.9, 6, 0.4); // 방음 쐐기 벽(0.4,6) — 사거리 2.6
  const discovery = page.getByTestId("discovery-overlay");
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("KeyE");
    const shown = await discovery
      .waitFor({ state: "visible", timeout: 3000 })
      .then(() => true)
      .catch(() => false);
    if (shown) break;
  }
  await expect(discovery).toBeVisible();
  await page.getByTestId("discovery-close").click();
});
