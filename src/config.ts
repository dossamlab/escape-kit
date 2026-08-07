/**
 * 게임 정체성 — **새 교과로 갈아탈 때 가장 먼저 고치는 파일.**
 * 세계관 문자열이 엔진과 main에 흩어져 있으면 교사가 engine/을 열어야 한다.
 * 여기 없는 것은 `index.html`의 <title>·og 메타뿐이다 (빌드 전 정적 HTML이라 못 닿는다).
 */

/** 타이틀 화면 — 작은 시리즈명 + 큰 한글 부제 */
export const TITLE_SUB = "Quantum Escape II";
export const TITLE_MAIN = "두 번째 궤도";

/** 시작 버튼 (저장된 진행이 있으면 '처음부터'가 대신 나온다) */
export const START_LABEL = "관측 시작";

/** 캐릭터 선택 화면 안내문 */
export const CHAR_SELECT_LABEL = "관측 대상을 선택하라";

/** 타이틀 하단 제작자 표기 */
export const CREDIT = "made by 청학고 도쌤";

/** 문의하기 — 메일 폴백 주소와 분류. 두 번째 항목이 교과 질문 자리다. */
export const CONTACT_EMAIL = "dossamlab@gmail.com";
export const CONTACT_CATEGORIES = [
  "새로운 방 아이디어 제안",
  "버그 제보",
  "물리 개념 질문",
  "기타 의견",
] as const;

/** 엔딩 화면 */
export const ENDING_SUB = TITLE_SUB;
export const ENDING_MAIN = "구역 개방 — 탈출";
export const ENDING_NOTES_COMPLETE = "모든 연구노트를 읽었다. 이 연구소에 남은 비밀은 없다.";
export const ENDING_NOTES_INCOMPLETE = "…연구소 어딘가, 아직 읽지 않은 노트들이 남아 있다.";

/**
 * localStorage 저장 키. **다른 게임과 반드시 다르게 둘 것** —
 * 같은 키를 쓰면 브라우저에 남은 남의 진행 상황을 읽어 이상하게 재개된다.
 */
export const SAVE_KEY = "quantum-escape:act2:progress:v1";
