/**
 * 퍼즐 모달 레이아웃 회귀 — 이 저장소의 첫 CSS 단언.
 *
 * 방까지 걸어가지 않고 **진짜 호스트를 직접 마운트**해서 잰다. 봉인이 있는 퍼즐은
 * 앞 퍼즐을 다 풀어야 닿아서(openBoothZone) spec 하나가 300초가 된다.
 * openPuzzle을 그대로 쓰므로 셸 구조가 바뀌어도 이 harness가 어긋나지 않는다.
 *
 * 세로 높이는 **단언하지 않고 기록만** 한다 — 콘텐츠가 한 줄만 늘어도 깨지는
 * 취약한 단언이 되기 때문이다. 대신 가로 넘침 0과 안내 동작을 단언한다.
 */
import { test, expect } from "@playwright/test";

type Measured = { id: string; title: string; sw: number; cw: number; sh: number; ch: number };

/** 브라우저에서만 해석되는 경로 — 문자열로 넘겨 tsc의 정적 모듈 해석을 피한다. */
const SRC = { registry: "/src/registry.ts", host: "/src/engine/puzzle-host/host.ts" };

/** 오프스크린 컨테이너에 전 퍼즐을 차례로 마운트해 스크롤러 치수를 잰다. */
async function measureAll(page: import("@playwright/test").Page): Promise<Measured[]> {
  await page.goto("/");
  return page.evaluate(async (src) => {
    const { puzzles } = await import(src.registry);
    const { openPuzzle } = await import(src.host);

    // 게임 UI와 같은 상자를 흉내 낸다 — 오버레이는 뷰포트가 아니라 .game-ui(inset:0) 기준이다.
    const stage = document.createElement("div");
    stage.style.cssText = "position:fixed;inset:0;";
    document.body.appendChild(stage);

    const out: Measured[] = [];
    for (const mod of puzzles) {
      void openPuzzle(mod, stage); // 닫지 않으면 resolve되지 않는다 — 아래에서 직접 제거
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const scroll = stage.querySelector<HTMLElement>(".puzzle-scroll");
      if (scroll) {
        out.push({
          id: mod.manifest.id,
          title: mod.manifest.title,
          sw: scroll.scrollWidth,
          cw: scroll.clientWidth,
          sh: scroll.scrollHeight,
          ch: scroll.clientHeight,
        });
      }
      stage.querySelector(".puzzle-close")?.dispatchEvent(new MouseEvent("click"));
      await new Promise((r) => setTimeout(r, 20));
      stage.innerHTML = "";
    }
    stage.remove();
    return out;
  }, SRC);
}

test("퍼즐 모달이 가로로 넘치지 않는다 — 전 퍼즐", async ({ page }) => {
  test.setTimeout(120_000);
  const rows = await measureAll(page);

  expect(rows.length, "등록된 퍼즐이 하나도 안 측정됐다").toBeGreaterThan(0);

  const label = test.info().project.name;
  for (const r of rows) {
    const over = r.sh - r.ch;
    console.log(
      `[${label}] ${r.id.padEnd(18)} 세로 ${String(r.sh).padStart(4)}/${r.ch} ` +
        (over > 0 ? `— 스크롤 ${over}px` : "— 스크롤 없음")
    );
  }

  // 가로 넘침은 하드 단언 — P5가 실제로 겪었던 버그다(1fr = minmax(auto,1fr) 함정,
  // entropy-console/puzzle.css의 ⚠ 주석). 스크롤러는 overflow-y만 줘도 overflow-x가
  // auto로 계산되므로 가로로 새면 곧바로 가로 스크롤바가 생긴다.
  const wide = rows.filter((r) => r.sw > r.cw + 1);
  expect(wide.map((r) => `${r.id}: ${r.sw} > ${r.cw}`), "가로로 넘치는 퍼즐").toEqual([]);
});

test("넘치는 퍼즐에는 아래 더 있음 안내가 뜨고, 바닥에 닿으면 사라진다", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");

  const result = await page.evaluate(async (src) => {
    const { puzzles } = await import(src.registry);
    const { openPuzzle } = await import(src.host);

    const stage = document.createElement("div");
    stage.style.cssText = "position:fixed;inset:0;";
    document.body.appendChild(stage);

    const settle = () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    let checkedId: string | null = null;
    let onWhenScrollable = false;
    let offAtBottom = false;
    let diag = "";

    for (const mod of puzzles) {
      void openPuzzle(mod, stage);
      await settle();
      const scroll = stage.querySelector<HTMLElement>(".puzzle-scroll");
      const more = stage.querySelector<HTMLElement>('[data-testid="scroll-more"]');
      if (scroll && more && scroll.scrollHeight - scroll.clientHeight > 8) {
        checkedId = mod.manifest.id;
        onWhenScrollable = more.classList.contains("on");
        // 토글 핸들러는 동기다 — 여기서 rAF를 기다리면 퍼즐의 재렌더가 scrollTop을
        // 되돌려 놓아 무엇을 재는지 알 수 없게 된다. 설정→발화→판독을 한 틱에 끝낸다.
        scroll.scrollTop = scroll.scrollHeight; // 바닥까지 (브라우저가 최대값으로 클램프)
        scroll.dispatchEvent(new Event("scroll"));
        offAtBottom = !more.classList.contains("on");
        diag = `room=${scroll.scrollHeight - scroll.clientHeight} top=${scroll.scrollTop} cls=${more.className}`;
        stage.querySelector(".puzzle-close")?.dispatchEvent(new MouseEvent("click"));
        await new Promise((r) => setTimeout(r, 20));
        stage.innerHTML = "";
        break;
      }
      stage.querySelector(".puzzle-close")?.dispatchEvent(new MouseEvent("click"));
      await new Promise((r) => setTimeout(r, 20));
      stage.innerHTML = "";
    }
    stage.remove();
    return { checkedId, onWhenScrollable, offAtBottom, diag };
  }, SRC);

  test.skip(result.checkedId === null, "이 뷰포트에서는 넘치는 퍼즐이 없다");
  expect(result.onWhenScrollable, `${result.checkedId}: 넘치는데 안내가 안 떴다`).toBe(true);
  expect(result.offAtBottom, `${result.checkedId}: 바닥인데 안내가 남았다 — ${result.diag}`).toBe(true);
});

test("퍼즐 제목이 두 줄로 접히지 않는다 — 좁은 화면 전수", async ({ page }) => {
  test.setTimeout(180_000);
  // 가장 긴 제목이 21자다. 홀로그램 자간(0.35em)이 넓어 좁은 폭에서 쉽게 접힌다 —
  // 접히면 제목이 44px 예산을 넘겨 본문을 밀어낸다. 폭이 가장 빡빡한 375px까지 본다.
  for (const w of [375, 400, 412]) {
    await page.setViewportSize({ width: w, height: 700 });
    await page.goto("/");
    const bad = await page.evaluate(async (src) => {
      const { puzzles } = await import(src.registry);
      const { openPuzzle } = await import(src.host);
      const stage = document.createElement("div");
      stage.style.cssText = "position:fixed;inset:0;z-index:9999;";
      document.body.appendChild(stage);
      const out: string[] = [];
      for (const mod of puzzles) {
        stage.innerHTML = "";
        void openPuzzle(mod, stage);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const t = stage.querySelector<HTMLElement>(".puzzle-title")!;
        const lh = parseFloat(getComputedStyle(t).lineHeight);
        if (t.scrollHeight > (isNaN(lh) ? t.clientHeight : lh) + 2) out.push(`${mod.manifest.id}: 접힘`);
        if (t.scrollWidth > t.clientWidth + 1) out.push(`${mod.manifest.id}: 잘림`);
        stage.querySelector(".puzzle-close")?.dispatchEvent(new MouseEvent("click"));
        await new Promise((r) => setTimeout(r, 15));
      }
      stage.remove();
      return out;
    }, SRC);
    expect(bad, `${w}px에서 제목이 한 줄에 안 들어간다`).toEqual([]);
  }
});
