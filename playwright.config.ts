import { defineConfig, devices } from "@playwright/test";

/**
 * DoD: 모든 walkthrough는 desktop-chrome과 mobile 두 프로젝트에서 통과해야 한다.
 *
 * ⚠ 테스트 포트(5399)는 개발 서버(5373)와 분리한다. 그리고 `reuseExistingServer: false` —
 * true로 두면 **같은 포트에 떠 있던 남의 서버에 그대로 붙어 엉뚱한 앱을 테스트한다**
 * (실제로 그랬다: 다른 저장소의 5299 서버를 물고 32개가 "실패"했다).
 * 포트가 이미 쓰이면 strictPort가 즉시 죽는 게 옳다 — 조용히 틀린 앱을 재는 것보다 낫다.
 *
 * 다른 무거운 작업(개발 서버 포함)을 켜 둔 채 전체 스위트를 돌리지 말 것 — CPU 경합으로
 * 가짜 실패가 난다.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 90_000,
  retries: 1,
  // 이 개발 PC에선 병렬 워커의 CPU 경합으로 walkthrough가 대량 가짜 실패한다 — 항상 직렬 실행.
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5399",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop-chrome",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: {
    command: "npm run dev:test",
    url: "http://localhost:5399",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
