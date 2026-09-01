/**
 * 맵 데이터 타입 정의. 방 파일과 **분리해 둔다** — 타입이 특정 방 파일 안에 살면
 * 그 방을 지우는 순간 엔진이 컴파일되지 않는다(실제로 그랬다).
 */

export interface MapObject {
  id: string;
  /** 상호작용 라벨에 표시되는 이름 */
  name: string;
  /** 월드 스프라이트 — 없으면 보이지 않는 핫스팟(수색 지점·배경 모드용, 마커만 표시) */
  sprite?: string;
  tile: [number, number];
  /** 상호작용 가능 거리 (타일 단위) */
  range: number;
  /** 상호작용 시 여는 퍼즐 (registry 등록 id). 없거나 미등록이면 interactAnchor 표시 */
  puzzleId?: string;
  /** 문: 상호작용 시 다른 방으로 이동(또는 ending=true면 엔딩 시퀀스).
   *  requiresEvent가 있으면 그 이벤트 발화 전엔 잠김.
   *  배열이면 **전부** 발화해야 열린다 — 봉인 없는 방에서 구역 건너뛰기를 막는 장치다
   *  (방2는 봉인이 없어 문이 마지막 퍼즐 하나만 요구하면 나머지 셋을 지나칠 수 있다). */
  door?: {
    toMap?: string;
    spawn?: [number, number];
    requiresEvent?: string | string[];
    ending?: boolean;
  };
  /** 연구노트: 상호작용 시 노트 열람 + 수집 (story.md의 note-XX) */
  noteId?: string;
  /** 수색 지점: 조사 시 발견 오버레이 표시 (+아이템 획득). 방탈출 단서 체인의 재료 */
  search?: {
    /** 발견 텍스트 (story.md #search-* 앵커) */
    anchor: string;
    /** 획득 아이템 id (src/data/items.ts ITEMS) — 없으면 꽝/읽을거리 */
    itemId?: string;
  };
  /** 바닥에 서 있는 입체 장치 — 밑변에 접지 그림자를 깔아 공중에 뜬 것처럼 보이지 않게 한다.
   *  (문·연구노트처럼 벽에 붙거나 떠 있는 아이콘성 스프라이트에는 쓰지 않는다) */
  grounded?: boolean;
  /** 접지 보정(월드 px) — 밑면이 여러 타일에 걸친 큰 스프라이트를 그만큼 더 내려 앉힌다.
   *  기본 앵커는 타일 중심에서 TILE_H/4 아래이고, 타일 앞 꼭짓점은 TILE_H/2 아래다. */
  sink?: number;
  /** 설치 패드 — 장치 밑에 까는 아이소 받침대의 폭(스프라이트 폭 대비 배율).
   *  스프라이트 그림에 다리·받침이 없으면 그림자만으로는 접지가 안 읽힌다.
   *  타일 격자와 같은 기울기의 바닥 평면 도형을 깔아야 "바닥에 놓인 것"으로 보인다. */
  pad?: number;
  /** 교육과정 밖 심화 노트 배지 (※ 심화) */
  advanced?: boolean;
  /** 폴백/잠김 시 표시할 스토리 앵커 */
  interactAnchor?: string;
}

/** 장식 오브젝트 — 상호작용 없음, 분위기 연출용 (가구·파편·얼룩 등) */
export interface DecorItem {
  sprite: string;
  tile: [number, number];
  /** 바닥에 붙는 평면 데코 (얼룩·파편·서류) — 타일 직후, 입체물 아래에 그림 */
  flat?: boolean;
  /** 좌우 반전 (같은 스프라이트 재사용 시 변화) */
  flip?: boolean;
  /** 천장 조명: 벽 위쪽에 떠서 그려지고, 바닥에 한랭 광 풀을 드리운다 */
  light?: boolean;
}

/** 뒷벽에 부착되는 벽걸이 (칠판·포스터·창문) — 벽 기울기에 맞춰 셰어 렌더 */
export interface WallDecorItem {
  sprite: string;
  /** 부착 벽면: nw = 좌상단 벽(x=0 열), ne = 우상단 벽(y=0 행) */
  side: "nw" | "ne";
  /** 벽면을 따라간 위치 (타일 단위, 0 = 모서리 쪽) */
  at: number;
}

export interface GameMap {
  id: string;
  cols: number;
  rows: number;
  spawn: [number, number];
  objects: MapObject[];
  /** 장식 배치 (상호작용 대상 아님) */
  decor?: DecorItem[];
  /** 뒷벽 표시 여부 (기본 true — 명시적으로 끌 때만 false) */
  walls?: boolean;
  /** 뒷벽 벽걸이 목록 */
  wallDecor?: WallDecorItem[];
  /** 프리렌더 방 배경 (레퍼런스 수준 일러스트) — 지정 시 타일·벽·데코 렌더를 대체.
   *  offsetX/Y: 월드 원점(타일 0,0 중심) 기준 이미지 좌상단의 화면 오프셋(px), scale: 배율.
   *  scaleY: 이미지 투영 경사가 2:1이 아닐 때 세로만 보정 (기본 = scale) */
  background?: {
    sprite: string;
    scale?: number;
    scaleY?: number;
    offsetX: number;
    offsetY: number;
    /**
     * 앞가림 구조물 — 그림 속 기둥·나무처럼 **캐릭터가 뒤로 지나가면 가려야 하는** 것.
     * 배경은 통짜 한 장이라 캐릭터 아래에만 깔리므로, 여기 적은 조각만 다시 위에 덮는다.
     *
     * `shapes`는 **원본 이미지 픽셀 좌표**의 타원·사각형이고(여럿이면 합집합),
     * `base`는 그 구조물의 **가장 앞(남쪽) 월드 좌표**다 — 깊이 정렬에 이 값으로 끼어들어
     * 앞에 선 캐릭터는 안 가리고 뒤에 선 캐릭터만 가린다. 실루엣이 헐거우면 잎 틈으로
     * 보여야 할 캐릭터까지 가리므로 구조물에 바싹 맞춘다.
     */
    occluders?: {
      shapes: ({ ellipse: [number, number, number, number] } | { rect: [number, number, number, number] })[];
      base: [number, number];
    }[];
  };
  /** 통행 불가 영역 (타일 좌표 사각형) — 배경에 그려진 가구를 뚫고 가지 못하게 */
  blocks?: { x0: number; y0: number; x1: number; y1: number }[];
  /** 어두운 방 연출 — 해제 이벤트가 오면 밝아진다 */
  dark?: { litByEvent: string };
  /**
   * 이 방을 끝낼 때 재생할 에필로그 앵커.
   * ⚠ 안 주면 **엔진 기본값 `#epilogue-open` / `-notes-complete` / `-notes-incomplete`**가
   *   재생된다 — 방을 추가하면서 잊으면 새 방이 남의 마무리 대사로 끝난다.
   */
  epilogue?: { open: string; notesComplete: string; notesIncomplete: string };
  /** 봉인 구역 — 방탈출의 "풀다 보면 숨은 방이 나온다".
   *  이벤트 발화 전까지 칠흑으로 덮이고 통행·상호작용·수색 마커가 전부 막힌다.
   *  배경은 통짜 그림 한 장이므로 구역을 **덮어서** 가린다(그림을 자르지 않는다). */
  sealed?: SealedArea[];
}

export interface SealedArea {
  id: string;
  /** 덮을 타일 사각형 — 여러 개를 조합해 L자 등 비사각 구역도 만든다 */
  area: { x0: number; y0: number; x1: number; y1: number }[];
  /**
   * 여기 적힌 이벤트가 **전부** 발화해야 열린다 (앞 구역 퍼즐 3대 → 격벽 개방).
   * ⚠ 반드시 봉인 **밖** 퍼즐의 이벤트여야 한다 — 안쪽 퍼즐을 걸면 영영 못 연다.
   */
  opensWhen: string[];
  /** 어둠이 위로 사라지는 높이(월드 px, 기본 SEAL_LIFT=160).
   *  배경에 그려진 키 큰 구조물(유리 부스 등)이 덮개 위로 솟아 보이면 그 높이만큼 올린다 */
  lift?: number;
}
