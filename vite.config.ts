import { defineConfig } from "vite";

// base: "./" — 상대 경로 빌드로 어떤 정적 호스팅 서브경로에도 배포 가능.
// 개발 5373 / 테스트 5399(playwright.config.ts) — 둘을 분리해 두면 개발 서버를 켜 둔 채
// 스위트를 돌려도 서로를 물지 않는다.
export default defineConfig({
  base: "./",
  server: { port: Number(process.env.PORT) || 5373 },
  build: { target: "es2022" },
});
