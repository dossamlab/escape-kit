/** 아이소메트릭 좌표 변환 (2:1 타일). 월드 단위 = 타일 1칸. */
import tokens from "../../../design-tokens.json";

export const TILE_W = tokens.tile.w;
export const TILE_H = tokens.tile.h;

/** 월드 (x,y) → 화면 픽셀 (타일 마름모의 중심점) */
export function worldToScreen(x: number, y: number): [number, number] {
  return [((x - y) * TILE_W) / 2, ((x + y) * TILE_H) / 2];
}

/**
 * 화면 방향 입력(조이스틱·방향키의 dx,dy) → 월드 방향.
 * "오른쪽 입력 = 화면에서 오른쪽으로 이동"이 되도록 역변환한다.
 */
export function screenDirToWorld(dx: number, dy: number): [number, number] {
  const wx = dx / (TILE_W / 2) + dy / (TILE_H / 2);
  const wy = -dx / (TILE_W / 2) + dy / (TILE_H / 2);
  const len = Math.hypot(wx, wy);
  return len > 0 ? [wx / len, wy / len] : [0, 0];
}
