# 세션 브리핑

> SessionStart 훅이 매 세션 시작·재개·clear·compact 직후 이 파일 + 현재 git 상태를 주입한다.
> **작업 방향이 바뀌면 여기를 갱신할 것.** 상세 이력은 `docs/dev-history.md`,
> 규약은 `CLAUDE.md`가 담당한다. 여기에는 "지금 어디까지 했고 다음이 뭔지"만 적는다.

## 지금 상태

교과 방탈출 저작 키트. 예제로 방 하나(sonic-room 「이름 없는 방」 — 탄성파와 소리)가
들어 있고, 퍼즐 5개·연구노트 6개·수색 5곳·완주 e2e가 완성돼 있다.

포트: 개발 5373 / e2e 5399 (`reuseExistingServer: false` — 남의 서버를 물지 않는다).

## 다음 할 일

**아직 `/new-subject`를 실행하지 않았다면** 그것이 첫 단계다 —
교과·성취기준·모티브 위인을 정해 검수 에이전트와 매핑표·스토리 뼈대를 만든다.

이미 자기 교과로 갈아탔다면 이 절을 지우고 진행 상황을 적을 것.

## 건드리기 전에 알아야 할 것

- **정답·상수는 `autoplay.ts`에만.** spec에 답을 다시 적지 않는다.
- **런타임 `Math.random()` 금지** — 연출은 시드 고정 해시로.
- **좌표를 만졌으면** `node scripts/check-layout.mjs 0.4`
  (이 값은 `tests/e2e/helpers.ts`의 `APPROACH_THRESHOLD`와 반드시 같아야 한다).
- **앵커를 만졌으면** `node scripts/check-anchors.mjs` — verify에 이미 물려 있다.
- **e2e 도중 `npm run story` 금지** — HMR 풀 리로드로 진행 중 테스트가 통째로 죽는다.
- **e2e 통과 ≠ 화면 정상.** 시각 요소를 만졌으면 임시 캡처 spec으로 스크린샷을 떠서 볼 것.
- 나머지 함정은 `CLAUDE.md`의 "자주 걸리는 함정" 절.
