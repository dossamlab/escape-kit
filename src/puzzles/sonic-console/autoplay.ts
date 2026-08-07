/**
 * sonic-console 정답 상수 — e2e spec은 여기서만 답을 가져온다 (spec에 답 재기입 금지).
 *
 * 최종 콘솔의 3중 게이트:
 *   ① 아이템 게이트 — 릴 테이프(P2 보상)를 걸어야 콘솔이 돈다.
 *   ② 멜로디 게이트 — 8건반에 4음(도·미·라·솔)을 순서대로. 퍼즐 4개가 음 하나씩
 *      내줬고(원리 카드에 병기), 내부적으로는 키패드 코드 "1365"의 건반 스킨이다.
 *   ③ 도플러 판독(본 퍼즐) — 지오폰 최종 기록: 휘파람 4음이 **낮아지며** 잦아든다.
 *      파원이 멀어지면 파장이 늘어나 진동수가 낮아진다 ([12역학03-03]).
 *      정답 '멀어짐' = "그는 살아서 걸어 나갔다" — 서사의 답과 물리의 답이 같다.
 *
 * 수렴 설계: 이지선다 + 오답 시 비교 재생(다가오는 사이렌 ↗ / 멀어지는 사이렌 ↘)을
 *   들려준다. 스펙트로그램 피치 트레이스(내려가는 선)가 무음 환경 시각 백업.
 */

/** 8건반 — value(코드 문자)·label(음이름)·freq(Hz, C4 기준 장음계) */
export const KEYS: { value: string; label: string; freq: number }[] = [
  { value: "1", label: "도", freq: 261.63 },
  { value: "2", label: "레", freq: 293.66 },
  { value: "3", label: "미", freq: 329.63 },
  { value: "4", label: "파", freq: 349.23 },
  { value: "5", label: "솔", freq: 392.0 },
  { value: "6", label: "라", freq: 440.0 },
  { value: "7", label: "시", freq: 493.88 },
  { value: "8", label: "도′", freq: 523.25 },
];

/** 멜로디 — 한이준의 휘파람 4음. 퍼즐 P1~P4가 순서대로 낸 음이다 */
export const MELODY: readonly string[] = ["1", "3", "6", "5"]; // 도·미·라·솔
export const GATE_CODE = MELODY.join("");

/** 멜로디 음의 주파수 (건반 정의에서 유도) */
export const MELODY_FREQS = MELODY.map((v) => KEYS.find((k) => k.value === v)!.freq);

/**
 * 도플러 판독 — 방향과 속도 변화를 **함께** 읽는 4지선다.
 *
 *   f′ = f·v/(v ∓ v_s)  (윗부호 = 다가옴, 아랫부호 = 멀어짐)
 *
 *   방향은 **원음과의 위아래**가 정한다 — 원음보다 높으면 다가옴, 낮으면 멀어짐.
 *   속도 변화는 **그 차이가 벌어지는가**가 정한다 — 등속이면 차이가 일정(수평선)하고,
 *   빨라지면 차이가 벌어지고, 느려지면 원음 쪽으로 되돌아온다.
 *
 *   이 기록은 원음 아래에서 **계속 더 내려간다** → 멀어지며 빨라짐(달려서 멀어졌다).
 *   ⚠ "다가오면 점점 높아진다"는 오개념은 여기서 갈린다 — 등속으로 다가오는 파원은
 *     다가오는 내내 **높은 채로 일정**이고, 높아지는 것은 가속하는 파원뿐이다.
 */
export type DopplerAnswer = "approach-faster" | "approach-slower" | "away-faster" | "away-slower";
export const DOPPLER_ANSWER: DopplerAnswer = "away-faster";
/** 기록 재생의 피치 배율 — 시작(살짝 낮음)에서 끝(더 낮음)으로 미끄러진다.
 *  둘 다 1보다 작으니 내내 멀어지는 중이고, 계속 작아지니 v_s가 커지는 중이다.
 *  연출값이며 부호와 단조성이 곧 정답의 근거다. */
export const RECEDE_PITCH_START = 0.96;
export const RECEDE_PITCH_END = 0.82;
/** 음 하나의 길이(s)와 간격(s) — 기록 재생·스펙트로그램이 공유 */
export const NOTE_DUR_S = 0.55;
export const NOTE_GAP_S = 0.18;

/** 재생 t초 시점의 피치 배율 (선형 활강) — 스펙트로그램 트레이스와 오디오가 공유 */
export function pitchAt(t: number, total: number): number {
  const u = Math.min(1, Math.max(0, t / total));
  return RECEDE_PITCH_START + (RECEDE_PITCH_END - RECEDE_PITCH_START) * u;
}

/** 판독이 맞는가 */
export function isCorrect(answer: DopplerAnswer): boolean {
  return answer === DOPPLER_ANSWER;
}
