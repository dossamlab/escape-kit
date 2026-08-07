/**
 * 인벤토리 아이템 정의 — 수색이나 퍼즐 보상으로 얻는 단서.
 * 콘텐츠이므로 engine/ 밖에 산다 (엔진은 이 목록을 모른다).
 *
 * 지급 경로 둘: 맵의 `search: { itemId }` 또는 퍼즐 manifest의 `reward.itemId`.
 * 소비 경로 하나: 퍼즐 manifest의 `gate.items`.
 * 아이콘은 이모지 플레이스홀더 — atlas에 `item-<id>` 스프라이트가 있으면 HUD가 그것을 우선 쓴다.
 */

export interface ItemDef {
  id: string;
  name: string;
  /** 이모지 플레이스홀더 (전용 아이콘 에셋 없을 때) */
  emoji: string;
  /** 재열람 시 보여줄 발견 앵커 (수색 앵커와 동일) */
  anchor: string;
}

export const ITEMS: Record<string, ItemDef> = {
  // P2(벽 노크)가 벽감에서 내주는 릴 테이프 — 최종 콘솔의 아이템 게이트 열쇠
  "reel-tape": {
    id: "reel-tape",
    name: "릴 테이프",
    emoji: "📼",
    anchor: "#item-reel-tape",
  },
};
