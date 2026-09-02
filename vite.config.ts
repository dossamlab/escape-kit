import { defineConfig, type Plugin } from "vite";

// base: "./" — 상대 경로 빌드로 어떤 정적 호스팅 서브경로에도 배포 가능.
// 개발 5373 / 테스트 5399(playwright.config.ts) — 둘을 분리해 두면 개발 서버를 켜 둔 채
// 스위트를 돌려도 서로를 물지 않는다.

/**
 * 개발 서버 주소 밑에 **그리드 창** 주소를 함께 찍는다.
 *
 * 좌표를 손으로 맞추다 지친 뒤에야 이 도구를 찾는 사람이 많다 — README 표 한 줄로는
 * 못 보고 지나간다. 화면에서 픽셀을 눈대중으로 읽으면 실측 45px(≈0.85타일)씩 어긋나므로,
 * 방을 만드는 사람이 **반드시 지나가는 자리**인 여기서 한 번 알려 준다.
 */
function announceGridTool(): Plugin {
  return {
    name: "escape-kit:announce-grid-tool",
    apply: "serve",
    configureServer(server) {
      const printUrls = server.printUrls.bind(server);
      // 색 판정은 vite가 쓰는 picocolors와 **같은 규칙**이어야 한다. isTTY만 보면
      // CI(비-TTY지만 picocolors는 색을 켠다)와 NO_COLOR(TTY지만 끈다)에서 vite 줄과
      // 이 줄의 색이 엇갈린다. picocolors를 직접 import하지는 않는다 — vite의 전이
      // 의존성이라 호이스팅에 기대게 되고, 못 찾으면 개발 서버가 아예 안 뜬다.
      const env = process.env;
      const color =
        !env.NO_COLOR &&
        Boolean(
          env.FORCE_COLOR ||
            process.platform === "win32" ||
            (process.stdout.isTTY && env.TERM !== "dumb") ||
            env.CI,
        );
      const c = (code: string, s: string) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
      server.printUrls = () => {
        printUrls();
        const base = server.resolvedUrls?.local?.[0]?.replace(/\/$/, "");
        if (!base) return; // --host 없이 소켓으로만 뜬 경우 등 — 조용히 넘어간다
        server.config.logger.info(
          `  ${c("32", "➜")}  ${c("1", "그리드 창")}:  ${base}/tools/tiles.html` +
            `  ${c("2", "걷기 금지 칸·핫스팟을 그림 위에서 찍는다")}`,
        );
      };
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [announceGridTool()],
  server: { port: Number(process.env.PORT) || 5373 },
  build: { target: "es2022" },
});
