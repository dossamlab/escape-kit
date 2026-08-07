/**
 * silent-node 정답 상수 — e2e spec은 여기서만 답을 가져온다 (spec에 답 재기입 금지).
 *
 * 물리 (음파의 간섭·소음 제어 — [12역학03-04]):
 *   같은 진동수의 두 스피커가 만드는 음장에서, 한 지점의 진폭은 두 경로차 Δ에 따라
 *   중첩으로 정해진다:  진폭 ∝ |cos(π·Δ/λ)|.
 *   Δ가 반파장의 홀수배인 곳은 상쇄 간섭으로 **조용하다** — 노이즈 캔슬링의 원리.
 *
 * 기하 설계 (배경 아트 반영, 2026-08-03 relayout):
 *   경보 스피커 2대는 배경 그림의 **북동 벽 상단**에 부착돼 있다 — 바닥 투영
 *   A(0.7,0.5)·B(16.6,0.5), λ = 12타일 → 마디 조건 Δ = ±6 (Δ의 최댓값은 스피커
 *   간격 15.9라 3λ/2 = 18은 존재하지 않는다). 마디선은 중앙축 좌우의 쌍곡선
 *   두 가닥 — 물리적으로 정직하게 **양쪽 다 조용하다**. 해치는 동쪽 가닥 위
 *   (14.2, 12)에 있다 (검산: Δ = 17.74 − 11.75 = 5.99 → |cos(89.9°)| ≈ 0.003).
 *   서쪽 가닥에는 아무것도 없다 — 조용함을 발견하고 그 줄을 따라 뒤지는 것까지가
 *   수색이다. 해치 스프라이트·상호작용 라벨이 최종 확정 신호.
 *
 * 수렴 설계 (개념 없이도 풀리는가):
 *   방을 걷기만 해도 음량(HUD 미터)이 연속적으로 변한다 — 뜨겁다/차갑다 수렴.
 *   spec이 "중앙축에서 해치 방향으로 걸을수록 미터가 단조 감소"를 순수 함수로 보증.
 *
 * 명시적 단순화 2건 (physics-reviewer 2026-08-03):
 *   ① **등진폭 근사** — 진폭 ∝ |cos(πΔ/λ)|는 두 파의 진폭이 같을 때만 완전 상쇄를
 *      준다(1/r 감쇠 무시). 서사적 근거: 경보 2계통은 "같은 발진기·같은 진동수·
 *      같은 출력"(수색 s3-wiring). 근사가 가장 심한 스피커 근방은 맵 blocks로
 *      통행을 막았다(스피커 캐비닛 자체가 장애물이기도 하다).
 *   ② **청감/기하 스케일 분리** — 재생음 348 Hz의 실제 파장은 약 1 m(≈1타일)지만
 *      간섭 무늬는 λ = 6타일로 그린다. 재생음은 청감용(거슬리는 경보), 무늬는
 *      게임 스케일 — P2의 에코 지연 연출 스케일과 같은 규약.
 *
 * ⚠ 스피커 좌표는 maps/sonic-room.ts의 decor와, 해치 좌표는 silent-hatch 오브젝트와
 *   반드시 동기 유지 (여기가 단일 소스).
 */

export const SPEAKER_A: readonly [number, number] = [0.7, 0.5];
export const SPEAKER_B: readonly [number, number] = [16.6, 0.5];
/** 파장 (타일 단위) — 마디 조건 Δ = λ/2 = 6타일 */
export const LAMBDA_TILES = 12;
/** 무음 해치 위치 — 동쪽 마디선 위 (maps/sonic-room.ts silent-hatch와 동기) */
export const HATCH: readonly [number, number] = [14.2, 12];
/** 시끄러운 기준 지점 — 두 스피커 등거리 축 위, 해치와 같은 행 (spec·안내용) */
export const LOUD_SPOT: readonly [number, number] = [8.65, 12];
/** 이 진폭 이하면 '조용한 지점' */
export const SILENT_THRESHOLD = 0.12;

/** 경보음 주파수 (Hz) — 귀에 거슬리는 중음역 정현음 */
export const ALARM_FREQ = 348;
/** 경보음 기준 게인 (loudness 1일 때) */
export const ALARM_GAIN = 0.055;

/* ── 모달 위상 정렬 미니 과제 (반위상 주입 — 노이즈 캔슬링) ──
 * 해치 패널에서 주입 신호(B)를 가로 드래그해 경보 신호(A)와 반대 위상(Δφ=π)으로
 * 맞춰야 차단 스위치가 활성화된다. 합성 진폭 ∝ |cos(Δφ/2)| — 방 기하의
 * loudnessAt과 같은 꼴이라 "경로차→위상차→상쇄"가 손끝에서 재현된다. */

/** 캔버스에 그릴 파형 주기 수 — 캔버스폭/WAVE_CYCLES = 1λ의 픽셀 폭 */
export const WAVE_CYCLES = 2;
/** 모달 캔버스 폭 (px) — puzzle.ts의 canvas.width와 동기 */
export const WAVE_CANVAS_W = 560;
/** 합성 진폭 |cos(Δφ/2)|이 이 이하면 정렬 성공 — **유일한 밸런스 노브**
 *  (e2e 드래그량은 렌더 폭/WAVE_CYCLES/2로 환산 — CSS 폭이 논리 폭과 다를 수 있다) */
export const PHASE_SUM_TOLERANCE = 0.15;

/** 위상차 φ(rad)에서의 합성파 상대 진폭 (0~1) — 같은 진폭 두 파의 합 */
export function sumAmplitudeAt(phase: number): number {
  return Math.abs(Math.cos(phase / 2));
}

/** 이 퍼즐이 내주는 멜로디 음 (4음 중 셋째) */
export const MELODY_NOTE = "라";
export const MELODY_KEY = "6";
export const MELODY_POSITION = 3;

/** 두 스피커까지의 경로차 Δ = d_A − d_B (타일) */
export function pathDiff(x: number, y: number): number {
  const dA = Math.hypot(x - SPEAKER_A[0], y - SPEAKER_A[1]);
  const dB = Math.hypot(x - SPEAKER_B[0], y - SPEAKER_B[1]);
  return dA - dB;
}

/** 위치별 상대 음량 (0~1) — 이 한 줄이 퍼즐의 물리 전부다 */
export function loudnessAt(x: number, y: number): number {
  return Math.abs(Math.cos((Math.PI * pathDiff(x, y)) / LAMBDA_TILES));
}

/** 조용한 지점인가 */
export function isSilentAt(x: number, y: number): boolean {
  return loudnessAt(x, y) <= SILENT_THRESHOLD;
}
