/**
 * 방 크기(N타일)를 정하면, 배경 그림에서 소품이 몇 픽셀이어야 하는지 역산한다.
 *
 * 왜 필요한가: 소품 크기를 감으로 지시하면 인물:가구 비율이 깨진다. 실제로
 * "락커는 바닥 폭의 1/11" 같은 값을 손으로 계산해 넣었다가 방 크기를 바꿀 때마다
 * 다시 틀렸다. 방 크기 → 소품 비율은 순수 산수이므로 여기서 뽑아 쓴다.
 *
 * 기준(엔진·아트 규약):
 *   타일 128×64 월드 px / 사람 키 240 월드 px (docs/art-style.md)
 *   방 N타일이면 바닥 다이아몬드의 월드 폭 = N × 128
 *   그림 속 길이 → 월드 길이 = 그림px × (N×128 ÷ 그림의 바닥 폭)
 *
 * 사용: node scripts/room-scale.mjs <N> [그림의_바닥_폭px=1000]
 */
const N = Number(process.argv[2]);
const floorImgPx = Number(process.argv[3] ?? 1000); // 1024² 그림에서 바닥이 차지하는 폭
if (!Number.isFinite(N) || N <= 0) {
  console.error("사용: node scripts/room-scale.mjs <N타일> [바닥폭px]");
  process.exit(1);
}

const TILE_W = 128;
const PERSON_WORLD = 240;
const floorWorld = N * TILE_W;
/** 월드 px → 그림 px */
const toImg = (world) => (world * floorImgPx) / floorWorld;
/** 그림 px → 바닥 폭의 몇 분의 1 */
const frac = (img) => `1/${(floorImgPx / img).toFixed(1)}`;

// 실물 비율 (사람 키 1.7 m 기준) — 소품이 사람의 몇 배인가
const PROPS = [
  ["사람 (그리지는 않음)", 1.0],
  ["키 큰 락커", 1.15],
  ["부품 선반", 1.1],
  ["공구 캐비닛", 0.65],
  ["작업대·제도대", 0.5],
  ["쿨런트 드럼", 0.55],
  ["화물 상자", 0.35],
];

console.log(`방 ${N}×${N}타일  (바닥 월드 폭 ${floorWorld}px, 그림 속 바닥 폭 ${floorImgPx}px)`);
console.log(`배경 배율: 1024² 원본 → scale ${(floorWorld / floorImgPx).toFixed(3)}` +
  `  /  2배 업스케일(2048²) → scale ${(floorWorld / (floorImgPx * 2)).toFixed(3)}` +
  `  (화면 = scale × 0.5)`);
console.log("");
console.log("그림(1024²)에서 그려야 할 크기:");
for (const [name, k] of PROPS) {
  const img = toImg(PERSON_WORLD * k);
  console.log(`  ${name.padEnd(22)} ${Math.round(img).toString().padStart(4)} px   (바닥 폭의 ${frac(img)})`);
}
console.log("");
console.log("※ 생성기는 소품을 20~30% 크게 그리는 경향이 있다 — 요청서에는 위 값에서");
console.log("   한 단계 작은 값(약 0.75배)을 적어 여유를 둘 것.");
