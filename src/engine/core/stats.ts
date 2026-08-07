/**
 * 세션 통계 — 이번 플레이의 오답·힌트·시간을 센다.
 * save.ts는 "되돌릴 수 없는 진척만" 계약이므로 저장하지 않는다 (엔딩에 "이번 플레이"로 표기).
 */
export const sessionStats = {
  startedAt: Date.now(),
  fails: 0,
  hintsUsed: 0,
  addFail(): void {
    this.fails += 1;
  },
  addHint(): void {
    this.hintsUsed += 1;
  },
  playMs(): number {
    return Date.now() - this.startedAt;
  },
};
