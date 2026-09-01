/**
 * 프리렌더 방 배경의 바닥 다이아몬드를 측정해 GameMap.background 값을 계산한다.
 *
 * 원리: 방 밖은 배경 보이드(거의 검정)이므로 비-보이드 실루엣의
 *   - 최좌/최우 x = 바닥 서/동 꼭짓점 x (벽이 그 변 바로 위에 서 있다)
 *   - 최하 y = 바닥 남 꼭짓점
 *   - 최좌 열의 최하 y = 서 꼭짓점 y → 대칭이므로 북 꼭짓점 y = 2*서y − 남y
 * 이 네 점을 월드 바닥 다이아몬드(-0.5,-0.5)~(N-0.5,N-0.5)에 맞춘다.
 * 배경 그림이 대칭 마름모라 방은 정사각(cols=rows=N)이어야 한다.
 *
 * 사용: node scripts/measure-room.mjs <room.png> <N타일> [--floor westX,eastX,topY,southY]
 *
 * ⚠ 실루엣 추정(INSET 보정)은 **같은 생성기·같은 프레이밍**에서만 맞는다. 벽 높이나 앞
 *   테두리 두께가 다른 그림에서는 마름모를 실제 바닥보다 크게/작게 잡는다(3회차 실측:
 *   난간 안쪽이 진짜 바닥인데 바깥 턱까지 셌다). 그럴 때 `--floor`로 네 꼭짓점을 직접
 *   준다 — `?grid` 격자 스크린샷을 보며 두어 번 조이면 맞는다.
 */
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const [, , inPath, nArg, ...rest] = process.argv;
const N = Number(nArg);
const floorIdx = rest.indexOf("--floor");
const FLOOR = floorIdx >= 0 ? rest[floorIdx + 1].split(",").map(Number) : null;
const raw = readFileSync(inPath);

const browser = await chromium.launch();
const page = await browser.newPage();
const m = await page.evaluate(
  async ({ src }) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const W = c.width, H = c.height;
    // 보이드 색 = 네 모서리 평균, 거리 40 이상이면 방 실루엣
    const cs = [0, (W - 1) * 4, (H - 1) * W * 4, ((H - 1) * W + W - 1) * 4];
    let vr = 0, vg = 0, vb = 0;
    for (const o of cs) { vr += d[o]; vg += d[o + 1]; vb += d[o + 2]; }
    vr /= 4; vg /= 4; vb /= 4;
    const solid = (x, y) => {
      const i = (y * W + x) * 4;
      return Math.hypot(d[i] - vr, d[i + 1] - vg, d[i + 2] - vb) > 40;
    };
    let minX = W, maxX = 0, maxY = 0;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        if (solid(x, y)) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
    // 서/동 꼭짓점 y: 좌·우 극단에서 몇 px 안쪽 열의 최하단
    const colBottom = (x) => { for (let y = H - 1; y >= 0; y--) if (solid(x, y)) return y; return 0; };
    const westY = colBottom(minX + 3);
    const eastY = colBottom(maxX - 3);
    return { W, H, minX, maxX, maxY, westY, eastY };
  },
  { src: `data:image/${inPath.endsWith(".jpg") ? "jpeg" : "png"};base64,${raw.toString("base64")}` }
);
await browser.close();

// 실루엣은 바닥이 아니라 방 껍데기(벽 두께·바닥 테두리 그림자)라 안쪽으로 보정한다.
// 보정값은 1막 room-lab.png의 손 캘리브레이션 결과와 맞춘 값 (같은 생성기·같은 프레이밍).
const INSET = { left: 10, right: -17, bottom: -6, mid: -14.5 };
const westX = FLOOR ? FLOOR[0] : m.minX + INSET.left;
const eastX = FLOOR ? FLOOR[1] : m.maxX + INSET.right;
const topY = FLOOR ? FLOOR[2] : 2 * ((m.westY + m.eastY) / 2 + INSET.mid) - (m.maxY + INSET.bottom);
const southY = FLOOR ? FLOOR[3] : m.maxY + INSET.bottom;
const midY = (topY + southY) / 2;
const scale = (2 * N * 64) / (eastX - westX);
const scaleY = (2 * N * 32) / (southY - topY);
const offsetX = -N * 64 - westX * scale;
const offsetY = -32 - topY * scaleY;
const r = (v) => Math.round(v * 1000) / 1000;
console.log(`${inPath}  ${m.W}×${m.H}`);
console.log(`  바닥 꼭짓점(px): 뒤(${r((westX + eastX) / 2)},${r(topY)}) 동(${eastX},${r(midY)}) 남(${r((westX + eastX) / 2)},${southY}) 서(${westX},${r(midY)})`);
console.log(`  background: { sprite: "…", scale: ${r(scale)}, scaleY: ${r(scaleY)}, offsetX: ${Math.round(offsetX)}, offsetY: ${Math.round(offsetY)} },`);
