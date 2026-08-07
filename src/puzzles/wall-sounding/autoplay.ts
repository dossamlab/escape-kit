/**
 * wall-sounding 정답 상수 — e2e spec은 여기서만 답을 가져온다 (spec에 답 재기입 금지).
 *
 * 물리 (탄성파의 반사 — [12역학03-02]):
 *   노크가 만든 탄성파는 매질이 달라지는 경계에서 반사·투과로 갈라진다.
 *   꽉 찬 벽은 두드림 자체의 펄스 한 번뿐이지만, 속이 빈 패널은 빈 공간의
 *   경계에서 파가 되돌아와 **울림이 둘**이 된다(첫 봉우리 = 가진 펄스,
 *   둘째 봉우리 = 반사 에코). 초음파 탐상·지진 탐사가 같은 원리다
 *   (성취기준의 '활용 예' 직결).
 *
 *   실제 벽의 에코 지연은 왕복 시간 Δt = 2d/v — 패널 뒤 공동 깊이 d ≈ 0.1 m,
 *   목재의 결 직각 방향(두께 방향) 탄성파 속력 v ≈ 1400 m/s이면 Δt ≈ 0.14 ms로
 *   귀에는 한 소리로
 *   뭉개진다. 게임에서는 판별이 목적이므로 시간축을 늘려(ECHO_DELAY_S = 0.12 s)
 *   '통—통' 두 번으로 들리게 하는 **연출 스케일**을 쓴다. 판별 구조
 *   (반사 피크 1개 vs 2개)는 실제 탐상과 동일하다.
 *
 * 수렴 설계 (개념 없이도 풀리는가):
 *   - 패널 24장을 전부 두드리는 전수 노크만으로 반드시 풀린다 — 탭마다 스코프에
 *     파형이 그려지고(무음 환경 시각 백업), 봉우리가 둘인 패널은 정확히 한 장이다.
 *   - 봉우리 수는 포락선이 PEAK_THRESH를 넘는 구간 수로 결정적이며,
 *     spec의 순수 함수 검산(countEchoHumps)이 전수 전략의 수렴을 보증한다.
 *   - 정답 좌표는 아래 고정 상수 — 런타임 Math.random 금지(방 검증 규약).
 */

/** 패널 그리드 크기 */
export const ROWS = 4;
export const COLS = 6;
/** 속이 빈 패널 (0-based) — 3행째·5열째. 비대칭 고정 위치, 딱 1장 */
export const HOLLOW_ROW = 2;
export const HOLLOW_COL = 4;

/** 빈 벽 에코 지연 (s) — 연출 스케일 (실제 2d/v ≈ 0.14 ms, 상단 주석) */
export const ECHO_DELAY_S = 0.12;
/** 에코 상대 진폭 — 반사에서는 일부 에너지만 되돌아온다 (< 1) */
export const ECHO_LEVEL = 0.6;
/** 파형 표시용 진동수 (Hz) — 스코프 시간창 안에 감쇠 진동이 보이는 스케일 */
export const PULSE_FREQ_HZ = 25;
/** 감쇠 시정수 τ (s) — exp(−t/τ). 0.12 s 지연이면 두 봉우리가 완전히 분리된다:
 *  첫 펄스의 포락선은 t = τ·ln(1/PEAK_THRESH) ≈ 0.069 s에 문턱 아래로 내려간다 */
export const PULSE_TAU_S = 0.03;
/** 스코프 시간창 (s) */
export const SCOPE_WINDOW_S = 0.4;
/** 봉우리 판정 문턱 — 포락선이 이 값을 넘는 구간 수 = 봉우리 수 */
export const PEAK_THRESH = 0.1;

/** 이 퍼즐이 내주는 멜로디 음 (4음 중 둘째) */
export const MELODY_NOTE = "미";
export const MELODY_KEY = "3";
export const MELODY_POSITION = 2;

/** 속이 빈 패널인가 — 이 부울 한 장이 퍼즐의 정답 전부다 */
export function isHollow(row: number, col: number): boolean {
  return row === HOLLOW_ROW && col === HOLLOW_COL;
}

/** 스코프 봉우리 수: 꽉 찬 벽 1(두드림 자체), 빈 벽 2(두드림 + 공동 경계 에코) */
export function echoPeakCount(row: number, col: number): number {
  return isHollow(row, col) ? 2 : 1;
}

/** 단일 노크 펄스의 포락선: exp(−t/τ) (t < 0이면 0) */
function pulseEnv(t: number): number {
  return t < 0 ? 0 : Math.exp(-t / PULSE_TAU_S);
}

/** 스코프 파형의 포락선 — 빈 벽이면 지연된 반사 펄스가 하나 더 얹힌다 */
export function envelope(t: number, hollow: boolean): number {
  return pulseEnv(t) + (hollow ? ECHO_LEVEL * pulseEnv(t - ECHO_DELAY_S) : 0);
}

/** 스코프에 그리는 파형: 포락선 × 감쇠 진동. sin(2πf·t)의 위상은 각 펄스 기준 */
export function knockWave(t: number, hollow: boolean): number {
  const w = pulseEnv(t) * Math.sin(2 * Math.PI * PULSE_FREQ_HZ * t);
  const echo = hollow
    ? ECHO_LEVEL * pulseEnv(t - ECHO_DELAY_S) * Math.sin(2 * Math.PI * PULSE_FREQ_HZ * (t - ECHO_DELAY_S))
    : 0;
  return w + echo;
}

/**
 * 파형 봉우리 수 — 포락선이 PEAK_THRESH를 넘는 연속 구간의 개수.
 * 스코프 표시(peaks 배지)와 spec 검산이 공유하는 판별 함수: 꽉 참 1, 빔 2.
 */
export function countEchoHumps(hollow: boolean): number {
  const dt = 0.001;
  let humps = 0;
  let above = false;
  for (let t = 0; t <= SCOPE_WINDOW_S; t += dt) {
    const on = envelope(t, hollow) > PEAK_THRESH;
    if (on && !above) humps += 1;
    above = on;
  }
  return humps;
}

// ── 렌더 기하 (스코프 viewBox 좌표계, px) ────────────────────
export const SCOPE_W = 300;
export const SCOPE_H = 150;
