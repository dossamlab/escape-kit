/**
 * monochord 정답 상수 — e2e spec은 여기서만 답을 가져온다 (spec에 답 재기입 금지).
 *
 * 물리 (현의 정상파와 배음렬 — [12역학03-05]):
 *   양 끝이 고정된 길이 L의 현은 양 끝을 마디로 갖는 정상파만 허락한다:
 *   L = n·(λₙ/2). 현 위 파의 속력 v는 일정하므로 진동수는
 *     fₙ = v/λₙ = n·(v/2L) = n·f₀  (n = 1, 2, 3, …)
 *   — 개방현 f₀의 정수배(배음렬)뿐이다.
 *
 *   한 점을 **가볍게 짚으면** 그 점이 강제 마디가 되어, 그 점을 마디로 갖는
 *   배음만 살아남는다(하모닉스 주법). n배음의 마디는 x = (k/n)·L (k = 0…n)이므로,
 *   짚은 위치가 기약분수 k/n이면 n배음이 울린다 — L/2 = 2배음(옥타브 '도′'),
 *   L/3·2L/3 = 3배음('솔'), L/4·3L/4 = 4배음('도″').
 *   ⚠ 꽉 눌러 줄 길이를 줄이는 프렛과 다르다: 하모닉스는 L이 그대로다.
 *
 *   개방현 f₀ = 130.81 Hz(C3, '도'). 자물쇠(콘솔 넷째 음)가 원하는 '솔'은
 *   3배음 3×130.81 = 392.43 Hz — 콘솔 건반 '솔'(392 Hz, G4)과 일치한다.
 *
 * 수렴 설계 (개념 없이도 풀리는가):
 *   - 아무 데나 짚으면 '툭' 죽은 소리 + 무음 표시 → 여기저기 짚다 보면
 *     "울리는 자리는 몇 곳뿐"임을 몸으로 발견한다(마디 후보는 5곳: 1/2 ·
 *     1/3 · 2/3 · 1/4 · 3/4, 허용 오차 ±POS_TOL).
 *   - 울릴 때마다 음이름이 점등되고 [목표 음 듣기]가 목표 '솔'을 들려주므로
 *     대조하며 수렴한다. 2%(1/50) 간격 전수 탐색만으로 반드시 특정된다 —
 *     spec의 순수 함수 검산이 보증한다.
 *   - 정답은 아래 고정 상수 — 런타임 Math.random 금지(방 검증 규약).
 */

/** 개방현 기본 진동수 (Hz) — C3 '도' */
export const F0 = 130.81;
/** 목표 배음 차수 — 3배음 '솔' */
export const TARGET_HARMONIC = 3;
/** 목표 진동수 (Hz) — f = n·f₀ = 3×130.81 = 392.43 ≈ 콘솔 건반 '솔' 392 Hz(G4) */
export const TARGET_FREQ = F0 * TARGET_HARMONIC;
/** 짚기 위치 허용 오차 (현 길이 비율) */
export const POS_TOL = 0.025;
/** 이 퍼즐이 울림으로 인정하는 배음 차수 (5배음 이상은 하모닉스가 흐려 생략).
 *  명시적 단순화: L/2를 짚으면 실제로는 짝수 배음 전부(2·4·6…)가 살아남고 지각
 *  음고가 2배음일 뿐이다 — 게임은 지각과 일치하는 최저 생존 배음 단음만 낸다. */
export const ALLOWED_HARMONICS: readonly number[] = [2, 3, 4];
/** 정답 짚기 위치 — 3배음의 내부 마디 L/3, 2L/3 (복수 정답 모두 인정) */
export const SOLUTION_FRACS = [1 / 3, 2 / 3] as const;

/** 이 퍼즐이 내주는 멜로디 음 (4음 중 넷째) */
export const MELODY_NOTE = "솔";
export const MELODY_KEY = "5";
export const MELODY_POSITION = 4;

/** 배음 차수 → 음이름 (f₀ = '도' 기준: 2f₀ = 옥타브 위 도, 3f₀ = 그 위의 솔, 4f₀ = 두 옥타브 위 도) */
export type NoteName = "도′" | "솔" | "도″";
const NOTE_NAMES: Record<number, NoteName> = { 2: "도′", 3: "솔", 4: "도″" };

export function noteNameOf(n: number): NoteName {
  const name = NOTE_NAMES[n];
  if (!name) throw new Error(`허용 배음이 아니다: ${n}`);
  return name;
}

/** n배음의 진동수 (Hz) — f = n·f₀. 이 한 줄이 퍼즐의 물리 전부다 */
export function harmonicFreq(n: number): number {
  return n * F0;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** 마디 자리 하나 — n배음의 k번째 내부 마디 (frac = k/n, 기약분수) */
export interface NodeSpot {
  n: number;
  k: number;
  frac: number;
}

/**
 * 울림을 허락하는 마디 자리 목록 (n 오름차순 — 1/2, 1/3, 2/3, 1/4, 3/4).
 * k/n이 기약이 아니면(예: 2/4 = 1/2) 더 낮은 배음의 마디로 이미 등재돼 있다.
 * 판정(nodeSpotAt)과 렌더(마디 점 표시)가 이 목록 하나를 공유한다.
 */
export const NODE_SPOTS: readonly NodeSpot[] = ALLOWED_HARMONICS.flatMap((n) => {
  const spots: NodeSpot[] = [];
  for (let k = 1; k < n; k++) {
    if (gcd(k, n) === 1) spots.push({ n, k, frac: k / n });
  }
  return spots;
});

/** 짚은 자리가 어느 마디인가 — |pos − k/n| ≤ POS_TOL이면 그 자리(가장 낮은 n), 아니면 null */
export function nodeSpotAt(posFrac: number): NodeSpot | null {
  return NODE_SPOTS.find((s) => Math.abs(posFrac - s.frac) <= POS_TOL) ?? null;
}

/** 짚은 자리에서 살아남는 배음 차수 — 마디가 아니면 null(죽은 소리) */
export function harmonicAt(posFrac: number): number | null {
  return nodeSpotAt(posFrac)?.n ?? null;
}

// ── 렌더 기하 (뷰박스 좌표계, px) ────────────────────────────
export const VIEW_W = 640;
export const VIEW_H = 170;
/** 현 양 끝(브리지) x — 이 사이가 길이 L */
export const STR_X0 = 30;
export const STR_X1 = 610;
/** 현의 y (정지선) */
export const STR_Y = 96;
/** 정상파 배(antinode) 표시 진폭 (px) */
export const WAVE_AMP = 44;

/** 현 위 위치 비율 → 뷰박스 x */
export function fracToX(frac: number): number {
  return STR_X0 + frac * (STR_X1 - STR_X0);
}

/** 뷰박스 x → 현 위 위치 비율 (0~1로 클램프) */
export function xToFrac(x: number): number {
  return Math.min(1, Math.max(0, (x - STR_X0) / (STR_X1 - STR_X0)));
}
