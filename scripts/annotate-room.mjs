/**
 * 배경 그림 위에 격자·blocks·핫스팟을 얹어 PNG로 뽑는다 — **좌표 재배치의 눈**이다.
 *
 * 왜 필요한가: 화면에서 픽셀을 눈대중으로 읽으면 틀린다(실측 ~45px ≈ 0.85타일 어긋났다).
 * 믿을 수 있는 것은 **같은 그림 위에 찍은 점끼리의 상대 비교**뿐이다.
 *
 * 사용:
 *   node scripts/annotate-room.mjs <roomId> <out.png> [grid|hot|guide|pts] [pts인자]
 *     grid  — 타일마다 좌표 라벨 (그림의 사물이 몇 번 타일인지 읽는 용도)
 *     hot   — grid + blocks(빨강) + 현재 핫스팟(노랑=장치·문, 파랑=노트)
 *     guide — 벽면 사물용 세로 가이드. ⚠ **격자 위 사물에만 맞는다** — 벽에 그려진
 *             것은 바닥 평면 밖이라 이 가이드로 x를 읽으면 틀린다(2026-08-19 실측).
 *     pts   — 후보점 비교. 5번째 인자 "라벨,x,y;라벨,x,y;…"
 *
 * 캘리브레이션을 바꿔 보려면 환경변수로 덮어쓴다 (맵 파일은 안 건드린다):
 *   OVER_N=15 OVER_OX=-1269 OVER_OY=-538 node scripts/annotate-room.mjs <roomId> out.png grid
 */
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// 저장소 뿌리는 스크립트 위치에서 구한다 — 절대경로를 박으면 남의 기계에서 죽고,
// fileURLToPath가 공백 든 경로(percent-encoding)까지 제대로 푼다.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const roomId = process.argv[2];
const OUT = process.argv[3];
const MODE = process.argv[4] ?? "grid"; // grid | hot | pts
const PTS = (process.argv[5] ?? "").split(";").filter(Boolean).map((s) => {
  const [lab, x, y] = s.split(",");
  return { id: lab, x: +x, y: +y };
});

// 방 id → 파일 경로. src/maps/ 를 훑어 만든다 — 방을 새로 만들어도 표를 고칠 일이 없다.
const MAPS = Object.fromEntries(
  readdirSync(join(ROOT, "src", "maps"))
    .filter((f) => f.endsWith(".ts") && f !== "types.ts" && f !== "index.ts")
    .map((f) => [f.replace(/\.ts$/, ""), join("src", "maps", f)]),
);
const src = readFileSync(`${ROOT}/${MAPS[roomId]}`, "utf8");
const bg = {
  scale: +/scale: ([\d.]+)/.exec(src)[1],
  scaleY: +/scaleY: ([\d.]+)/.exec(src)[1],
  offsetX: +/offsetX: (-?[\d.]+)/.exec(src)[1],
  offsetY: +/offsetY: (-?[\d.]+)/.exec(src)[1],
};
let cols = +/cols: (\d+)/.exec(src)[1];
let rows = +/rows: (\d+)/.exec(src)[1];
if (process.env.OVER_N) { cols = rows = +process.env.OVER_N; }
if (process.env.OVER_OY) { bg.offsetY = +process.env.OVER_OY; }
if (process.env.OVER_OX) { bg.offsetX = +process.env.OVER_OX; }
// ⚠ **blocks 절만** 읽는다. 파일 전체에서 사각형을 긁으면 `sealed.area`까지 섞여
//    방 절반이 빨갛게 칠해진다 — 실제로 그걸 blocks로 오독한 적이 있다(2026-08-19).
const bi = src.indexOf("  blocks: [");
const be = src.indexOf("  ],", bi);
const blocksSrc = bi < 0 ? "" : src.slice(bi, be);
const blocks = [...blocksSrc.matchAll(/\{ x0: (-?[\d.]+), y0: (-?[\d.]+), x1: (-?[\d.]+), y1: (-?[\d.]+) \}/g)]
  .map((m) => ({ x0: +m[1], y0: +m[2], x1: +m[3], y1: +m[4] }));
const seen = new Set();
const all = [...src.matchAll(/id: "([\w-]+)",[\s\S]{0,220}?tile: \[([-\d.]+), ([-\d.]+)\]/g)]
  .map((m) => ({ id: m[1], x: +m[2], y: +m[3] }))
  .filter((o) => o.id !== roomId && !seen.has(o.id) && seen.add(o.id));

const browser = await chromium.launch();
const page = await browser.newPage();
const png = readFileSync(`${ROOT}/public/assets/${roomId}.png`).toString("base64");
const dataUrl = await page.evaluate(
  async ({ png, bg, cols, rows, all, blocks, MODE }) => {
    const img = new Image();
    img.src = "data:image/png;base64," + png;
    await img.decode();
    const Z = 2;
    const c = document.createElement("canvas");
    c.width = img.width * Z;
    c.height = img.height * Z;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const AX = (x, y) => ((((x - y) * 128) / 2 - bg.offsetX) / bg.scale) * Z;
    const AY = (x, y) => ((((x + y) * 64) / 2 - bg.offsetY) / bg.scaleY) * Z;
    if (MODE === "hot") {
      ctx.fillStyle = "rgba(255,40,40,0.30)";
      for (const b of blocks) {
        ctx.beginPath();
        ctx.moveTo(AX(b.x0, b.y0), AY(b.x0, b.y0));
        ctx.lineTo(AX(b.x1, b.y0), AY(b.x1, b.y0));
        ctx.lineTo(AX(b.x1, b.y1), AY(b.x1, b.y1));
        ctx.lineTo(AX(b.x0, b.y1), AY(b.x0, b.y1));
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.strokeStyle = "rgba(0,255,255,0.55)";
    ctx.lineWidth = 2;
    for (let i = 0; i <= cols; i++) {
      ctx.beginPath();
      ctx.moveTo(AX(i - 0.5, -0.5), AY(i - 0.5, -0.5));
      ctx.lineTo(AX(i - 0.5, rows - 0.5), AY(i - 0.5, rows - 0.5));
      ctx.stroke();
    }
    for (let j = 0; j <= rows; j++) {
      ctx.beginPath();
      ctx.moveTo(AX(-0.5, j - 0.5), AY(-0.5, j - 0.5));
      ctx.lineTo(AX(cols - 0.5, j - 0.5), AY(cols - 0.5, j - 0.5));
      ctx.stroke();
    }
    ctx.font = "bold 20px sans-serif";
    ctx.textAlign = "center";
    for (let i = 0; i < cols; i++)
      for (let j = 0; j < rows; j++) {
        ctx.lineWidth = 4;
        ctx.strokeStyle = "rgba(0,0,0,0.85)";
        ctx.strokeText(`${i},${j}`, AX(i, j), AY(i, j) + 6);
        ctx.fillStyle = "#fff";
        ctx.fillText(`${i},${j}`, AX(i, j), AY(i, j) + 6);
      }
    if (MODE === "guide") {
      // NE 벽(y=0.95 행)에서 위로 뻗는 세로 가이드 — 벽에 그려진 사물의 x를 읽는다
      for (let i = 0; i < cols; i++) {
        const px = AX(i, 0.95);
        const py = AY(i, 0.95);
        ctx.strokeStyle = "rgba(255,220,60,0.9)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px, py - 620);
        ctx.stroke();
        ctx.font = "bold 34px sans-serif";
        ctx.lineWidth = 7;
        ctx.strokeStyle = "rgba(0,0,0,0.9)";
        ctx.strokeText(`x${i}`, px, py - 630);
        ctx.fillStyle = "#ffdc3c";
        ctx.fillText(`x${i}`, px, py - 630);
      }
      // NW 벽(x=0.95 열)에서 위로 뻗는 가이드 — y를 읽는다
      for (let j = 0; j < rows; j++) {
        const px = AX(0.95, j);
        const py = AY(0.95, j);
        ctx.strokeStyle = "rgba(80,255,120,0.9)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px, py - 620);
        ctx.stroke();
        ctx.font = "bold 34px sans-serif";
        ctx.lineWidth = 7;
        ctx.strokeStyle = "rgba(0,0,0,0.9)";
        ctx.strokeText(`y${j}`, px, py - 630);
        ctx.fillStyle = "#50ff78";
        ctx.fillText(`y${j}`, px, py - 630);
      }
    }
    if (MODE === "hot")
      for (const o of all) {
        const px = AX(o.x, o.y);
        const py = AY(o.x, o.y);
        ctx.beginPath();
        ctx.arc(px, py, 14, 0, Math.PI * 2);
        ctx.fillStyle = o.id.startsWith("note") ? "#4da8ff" : "#ffd166";
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#000";
        ctx.stroke();
      }
    return c.toDataURL("image/png");
  },
  { png, bg, cols, rows, all: MODE === "pts" ? PTS : all, blocks, MODE: MODE === "pts" ? "hot" : MODE },
);
writeFileSync(OUT, Buffer.from(dataUrl.split(",")[1], "base64"));
await browser.close();
console.log(roomId, MODE, "->", OUT);
