/** 아이소메트릭 좌표 변환 (2:1 타일). 월드 단위 = 타일 1칸. */
import tokens from "../../../design-tokens.json";

export const TILE_W = tokens.tile.w;
export const TILE_H = tokens.tile.h;

/** 월드 (x,y) → 화면 픽셀 (타일 마름모의 중심점) */
export function worldToScreen(x: number, y: number): [number, number] {
  return [((x - y) * TILE_W) / 2, ((x + y) * TILE_H) / 2];
}

/**
 * 화면 방향 입력(조이스틱의 연속 dx,dy) → 월드 방향.
 * "오른쪽 입력 = 화면에서 오른쪽으로 이동"이 되도록 역변환한다.
 */
export function screenDirToWorld(dx: number, dy: number): [number, number] {
  const wx = dx / (TILE_W / 2) + dy / (TILE_H / 2);
  const wy = -dx / (TILE_W / 2) + dy / (TILE_H / 2);
  const len = Math.hypot(wx, wy);
  return len > 0 ? [wx / len, wy / len] : [0, 0];
}

const H = Math.SQRT1_2;
/**
 * 방향키 8칸 → 월드 방향. 인덱스는 Game.OCTANTS와 같다 (0=e, 시계 방향).
 *
 * **상하좌우는 화면 상하좌우, 대각은 방의 축**(벽·타일 모서리)이다.
 * 2:1 타일이라 방의 축은 화면에서 26.57°인데 화면 45° 대각은 그 어느 축과도
 * 나란하지 않다 — 역변환을 그대로 쓰면 ↑→를 눌러도 벽을 따라 못 걷고
 * 18.4°씩 어긋난다(제보 2026-08-27). 그래서 대각만 축으로 스냅한다.
 */
const KEY_OCTANT_WORLD: readonly (readonly [number, number])[] = [
  [H, -H], // e  → 화면 오른쪽
  [1, 0], //  se → 방의 SE 축
  [H, H], //  s  → 화면 아래
  [0, 1], //  sw → 방의 SW 축
  [-H, H], // w  → 화면 왼쪽
  [-1, 0], // nw → 방의 NW 축
  [-H, -H], // n → 화면 위
  [0, -1], // ne → 방의 NE 축
];

/** 방향키(8칸) 입력 → 월드 방향. 화면 각도를 45°씩 8칸으로 스냅한다. */
export function keyDirToWorld(dx: number, dy: number): [number, number] {
  if (dx === 0 && dy === 0) return [0, 0];
  const oct = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) & 7;
  const [wx, wy] = KEY_OCTANT_WORLD[oct];
  return [wx, wy];
}
