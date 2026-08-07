/**
 * 퍼즐 계약 — 모든 퍼즐(src/puzzles/<id>/)은 이 인터페이스를 구현한다.
 * 퍼즐은 엔진 내부를 모르고, 엔진은 퍼즐 내부를 모른다.
 */
import type { DragCallbacks } from "../input/pointer";

export interface CurriculumInfo {
  과목: string;
  단원: string;
  성취기준: string;
}

export interface NarrativeRefs {
  /** docs/story.md 앵커 참조 — 예: `story.md#sn-room-intro` */
  intro: string;
  clear: string;
  /** 오답 반응 등 추가 앵커 */
  extra?: Record<string, string>;
  /** 이 방에 배치되는 연구노트 id 목록 */
  notes: string[];
}

export interface PuzzleManifest {
  id: string;
  title: string;
  /** 방 번호 — 저널의 원리 카드 목록에 "N번 방 — 개념"으로 표시된다 ('막'이 아니다) */
  act: number;
  concept: string;
  curriculum: CurriculumInfo;
  narrative: NarrativeRefs;
  trigger: { map: string; objectId: string };
  /** 해결 보상 — event는 EventBus로 발화, itemId가 있으면 인벤토리에도 지급
   *  (3번 방 P2 릴 테이프 — 퍼즐이 아이템을 주는 첫 사례) */
  reward: { event: string; itemId?: string };
  testIds: Record<string, string>;
  /** 점진 공개 힌트 (설계서 3단계). 마지막 단계는 사실상 정답에 근접 */
  hints?: string[];
  /** 해결 후 저널에서 복습하는 원리 카드 — 한 줄 = 수식 또는 개념 문장 */
  principle?: string[];
  /** 방탈출 게이트 — 충족 전에는 퍼즐이 잠겨 있다 (수색 단서로 여는 잠금).
   *  code와 items를 **같이** 걸 수 있다 — 아이템 검사가 먼저, 그다음 키패드
   *  (예제 콘솔: 릴 테이프 장착 → 4음 멜로디). */
  gate?: {
    /** 코드형: 키패드 정답. 자릿수는 이 문자열 길이가 결정한다 (예: "6563", "495") */
    code?: string;
    /** 코드형 스킨: 지정 시 숫자 키패드 대신 이 키들을 그린다.
     *  **답을 숫자 밖으로 여는 장치다** — value는 code의 한 글자(내부 표현),
     *  label이 화면에 보이는 것(음이름·자모·한자·화학기호·연도·사건명 무엇이든).
     *  freq는 선택 — 주면 누를 때 그 음이 울린다(소리로 답을 기억시키는 퍼즐용). */
    keys?: { value: string; label: string; freq?: number }[];
    /** 아이템형: 필요한 인벤토리 아이템 id 목록 */
    items?: string[];
    /** 아이템 미소지 시 대사 앵커 — code와 items를 같이 걸 때 lockedAnchor(코드 도입)와
     *  구별한다. 없으면 lockedAnchor를 쓴다 */
    itemsMissingAnchor?: string;
    /** 잠김 상태 상호작용 시 대사 앵커 */
    lockedAnchor: string;
    /** 키패드 상단 안내문 앵커 (코드형) */
    promptAnchor?: string;
    /** 오답 반응 앵커 (코드형, 첫 회 대사) */
    wrongAnchor?: string;
    /** 해금 성공 시 대사 앵커 */
    openAnchor?: string;
  };
}

/** 엔진이 mount 시 퍼즐에 제공하는 API — 퍼즐이 바깥세상과 접촉하는 유일한 통로 */
export interface PuzzleApi {
  /** 퍼즐 UI를 그릴 컨테이너 (엔진이 오버레이로 관리) */
  root: HTMLElement;
  /**
   * 하단 힌트 바의 버튼 자리 — 스크롤 밖이라 본문이 길어도 항상 보인다.
   * 판정·실행 같은 주 버튼 하나만 넣을 것 (힌트 버튼 오른쪽에 붙는다).
   */
  actions: HTMLElement;
  /** Pointer Events 통일 드래그 헬퍼 — 마우스/터치 공용 */
  onDrag(target: HTMLElement | SVGElement, cb: DragCallbacks): () => void;
  /** 스토리 앵커의 대사를 내러티브 오버레이로 표시 */
  say(anchor: string): Promise<void>;
  /** 퍼즐 해결 선언 — manifest.reward.event가 발화되고 오버레이가 닫힌다 */
  solve(): void;
  /** 퍼즐 중도 이탈 (해결 없이 닫기) */
  exit(): void;
  /** 오답·실패 신호 — 힌트 단계 해금과 세션 통계에 쓰인다 */
  fail(): void;
  /** design-tokens.json 값 (색·치수) */
  tokens: Record<string, unknown>;
}

export interface PuzzleModule {
  manifest: PuzzleManifest;
  /** 반환값은 정리(cleanup) 함수 */
  mount(api: PuzzleApi): () => void;
}
