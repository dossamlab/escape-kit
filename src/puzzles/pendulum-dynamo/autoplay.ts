/**
 * pendulum-dynamo 정답 상수 — e2e spec은 여기서만 답을 가져온다 (spec에 답 재기입 금지).
 *
 * 물리 (단진동의 등시성 — [12역학03-01]):
 *   진자의 주기는 진폭과 무관하게 일정하다(등시성). 그래서 "언제 밀 것인가"가
 *   전부다 — 박자에 맞춘 밀기는 진폭을 키우고(Δ진폭 ∝ cos φ, φ는 최적 순간과의
 *   위상차), 어긋난 밀기는 오히려 깎는다. 그네 밀기의 물리이고, 공명의 첫걸음이다.
 *
 *   명시적 단순화: 실 진자의 등시성은 **소각 근사**에서 참이다(T ≈ T₀(1+θ₀²/16)).
 *   렌더 최대각 THETA_MAX 0.62 rad ≈ 35°는 시인성을 위한 과장 — 실제라면 주기가
 *   약 2.4% 길어지지만 게임 주기는 고정한다(교과 수준 서술과 일치).
 *   성취기준의 예시 기구(용수철 진자) 대신 실 진자를 쓴 것은 curriculum-map 예외 표.
 *
 * 수렴 설계 (개념 없이도 풀리는가):
 *   - 마구 눌러도 게이지가 오르내리는 것이 즉시 보인다 → "맞을 때만 커진다" 발견.
 *   - 최적 순간마다 '똑' 소리 + 버튼 발광(시각 백업) — 리듬게임 문법.
 *   - 발광 창(cos φ ≥ GLOW_COS) 안에서만 눌러도 순이득이 감쇠를 이긴다:
 *     최소 이득 PUSH_GAIN×GLOW_COS = 0.154 > 감쇠 DECAY_PER_S×PERIOD_S = 0.072.
 *     주기당 한 번씩 발광에 맞추면 (0.85−0.18)/0.082 ≈ 9주기 안에 시동이 걸린다.
 *   - 무작위 탭의 기대 이득은 E[cos φ] = 0 — 감쇠가 이겨 진폭이 바닥에 머문다.
 *     (spec의 순수 함수 검산이 두 전략 모두 보증한다)
 */

/** 진자 주기 (s) — 등시성: 진폭과 무관하게 고정 */
export const PERIOD_S = 2.4;
/** 정확히 맞춘 탭 1회의 진폭 이득 */
export const PUSH_GAIN = 0.22;
/** 초당 자연 감쇠 */
export const DECAY_PER_S = 0.03;
/** 시작 진폭 (0~1 정규화) */
export const AMP_INITIAL = 0.18;
/** 진폭 바닥 — 감쇠로도 이 밑으로는 안 내려간다 (완전 정지하면 박자를 못 잡는다) */
export const AMP_FLOOR = 0.12;
export const AMP_MAX = 1.0;
/** 시동 임계 — 이 진폭에 닿으면 발전기가 걸린다 */
export const SOLVE_AMP = 0.85;
/** 탭 최소 간격 (s) — 연타 방지 */
export const TAP_COOLDOWN_S = 0.25;
/** 버튼 발광 창: cos φ ≥ 이 값 (위상 ±46°) */
export const GLOW_COS = 0.7;
/** 연속 역박자 탭 수 — 이만큼 쌓이면 오답 처리(#sn-pend-miss) */
export const MISS_STREAK = 4;

/** 이 퍼즐이 내주는 멜로디 음 (4음 중 첫째) */
export const MELODY_NOTE = "도";
export const MELODY_KEY = "1";
export const MELODY_POSITION = 1;

/** 최대 흔들림 각 (rad) — 렌더 전용 */
export const THETA_MAX = 0.62;

/** 위상 φ(t) = 2πt/T (mod 2π). 최적 밀기 순간은 φ = 0 — '똑' 소리·발광과 동기 */
export function phaseAt(tSec: number): number {
  const tau = Math.PI * 2;
  return ((tSec % PERIOD_S) / PERIOD_S) * tau;
}

/** 탭 1회의 진폭 변화 — 위상차의 코사인. 이 한 줄이 퍼즐의 물리 전부다 */
export function ampDelta(phase: number): number {
  return PUSH_GAIN * Math.cos(phase);
}

/** 발광 창 안인가 (시각 백업 — 소리 없이도 박자를 안다) */
export function inGlowWindow(phase: number): boolean {
  return Math.cos(phase) >= GLOW_COS;
}

/** 진폭 적분 한 스텝 — dt 동안 감쇠만 적용 (탭은 ampDelta로 별도 가산) */
export function stepAmp(amp: number, dtSec: number): number {
  return Math.max(AMP_FLOOR, amp - DECAY_PER_S * dtSec);
}

/** 시동 판정 */
export function isSolved(amp: number): boolean {
  return amp >= SOLVE_AMP;
}

// ── 렌더 기하 (뷰박스 좌표계, px) ────────────────────────────
export const VIEW_W = 300;
export const VIEW_H = 260;
export const PIVOT_X = 150;
export const PIVOT_Y = 46;
export const ROD_LEN = 150;
