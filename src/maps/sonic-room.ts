/**
 * 예제 방: 탄성파와 소리 — 「이름 없는 방」(청음실).
 *
 * 방 하나가 쓸 수 있는 기법이 전부 들어 있는 표본이다 —
 * dark(암전) · sealed(봉인 구역) · reward.itemId(아이템 보상) · gate.items+code(이중 잠금) ·
 * gate.keys(숫자 아닌 코드) · 스프라이트 없는 오브젝트(배경 그림이 곧 가구) · 모달 없는 퍼즐.
 *
 * 구조: 3단 연출.
 *   ① 입장 시 **암전**(dark) — P1 진자 발전기를 풀어야 조명이 들어온다.
 *   ② 본실 — P2 벽 노크(릴 테이프 아이템)·P3 무음 지점(모달 없음, 방 전체 퍼즐).
 *      둘을 풀면 동쪽 코너 녹음 부스 봉인이 열린다.
 *   ③ 부스 안 — P4 모노코드 + 최종 콘솔(테이프 장착→4음 멜로디→도플러 판독).
 *      출구(지상 계단 문)는 서쪽 벽 — 콘솔이 door:sonic-open을 발화해야 열린다.
 *   코드는 숫자가 아니라 4음 멜로디(도·미·라·솔) — 퍼즐 4개가 음 하나씩 낸다.
 *
 * 왜 N=20인가 (2026-08-03 실측): 배경 아트 1024², 바닥 마름모 폭 992px.
 *   기준 가구 = 서쪽 벽의 문(아트 세로 ≈150px). 문 화면 높이 = 150×scaleY×0.5이고
 *   캐릭터는 125px 고정 — N=20에서 문/캐릭터 ≈ 1.19배(실제 문 2.1m/사람 1.7m 감).
 *   N=24면 문이 1.5배로 거인 문짝, N=16이면 문이 캐릭터보다 작아진다.
 *   24 요청 → 20 착지는 1번 방과 동일한 패턴(생성기는 가구를 크게 그린다).
 *
 * 아트 기하 매핑 (배경 그림이 좌표를 정한다):
 *   부스(유리 녹음 부스) = **동쪽 코너** x∈[13.5,20], y∈[0,6] → sealed가 덮는다.
 *   문(출구·지상 계단) = 서쪽 벽 y≈15. 지오폰 랙 = 서쪽 벽 y≈9~11.5(blocks).
 *   경보 스피커 2대 = 북동 벽 상단 부착 (바닥 투영 ≈ (0.7,0.5)·(16.6,0.5) —
 *   silent-node/autoplay.ts의 SPEAKER_A/B와 반드시 동기).
 *
 * ⚠ 봉인을 여는 이벤트(P2·P3)는 반드시 **봉인 밖** 퍼즐이다 (thermal-room 교훈).
 */
import type { GameMap } from "./types";

export const sonicRoom: GameMap = {
  id: "sonic-room",
  cols: 20,
  rows: 20,
  spawn: [3, 3], // 위층에서 내려오는 해치 — 북서 구석
  // node scripts/measure-room.mjs assets-src/gen-src/room-sonic.src.png 20
  // ⚠ 캘리브레이션은 **void-fill 전 원본(.src)** 으로 잰 값이다.
  background: {
    sprite: "room-sonic",
    scale: 2.581,
    scaleY: 1.984,
    offsetX: -1311,
    offsetY: -594,
  },
  // 입장 시 칠흑 — P1(진자 발전기) 해결 이벤트가 점등 신호다
  dark: { litByEvent: "code:pend-solved" },
  // 이 방 전용 에필로그 — 안 주면 엔진 기본값(#epilogue-*)이 재생된다
  epilogue: {
    open: "#epilogue3-open",
    notesComplete: "#epilogue3-notes-complete",
    notesIncomplete: "#epilogue3-notes-incomplete",
  },
  blocks: [
    { x0: -1, y0: -1, x1: 0.9, y1: 21 }, // 서쪽 벽 띠 (문·문패·랙·쐐기는 사거리로 닿는다)
    { x0: -1, y0: -1, x1: 21, y1: 0.9 }, // 북쪽 벽 띠
    { x0: -1, y0: 8.8, x1: 2.3, y1: 11.6 }, // 지오폰 랙 (서벽 앞으로 튀어나온 가구)
    // 부스 유리벽은 의도적으로 막지 않는다 — 개방 전 차단은 sealed가 담당하고,
    // 벽 blocks를 두면 오목 포켓이 생겨 축 분리 이동(플레이어·e2e 공통)이 갇힌다.
    // 유리는 투명 아트라 통과가 크게 어색하지 않다 (thermal-room과 같은 규약).
  ],
  // 동쪽 코너 녹음 부스 — 본실 퍼즐 2개(벽 노크·무음 지점)를 풀어야 열린다
  sealed: [
    {
      id: "booth",
      // 벽 띠까지 덮는다 (thermal-room에서 걷기 구간만 덮었다가 스파클이 샜다)
      area: [{ x0: 13.5, y0: -0.5, x1: 20.5, y1: 6.0 }],
      opensWhen: ["code:knock-solved", "code:node-solved"],
      // 유리 부스가 배경 아트에서 기본 덮개(160)보다 높이 솟아 위가 뚫려 보였다
      lift: 1200,
    },
    {
      // 부스 앞마당 — 모노코드가 부스 안에 있으면 스프라이트가 유리벽을 관통해
      // 보여서(실플레이 제보) 부스 앞 개방 바닥으로 뺐다. 같은 조건으로 함께 열린다.
      // 서쪽 경계는 x=13.5 유지 — 벽면 탐상 카트(9,1.7)·무음 해치(14.2,12)는
      // 봉인 밖이어야 한다(개방 조건 퍼즐). 높이는 기본 덮개(160)면 충분.
      id: "booth-annex",
      area: [{ x0: 13.5, y0: 6.0, x1: 19.0, y1: 9.2 }],
      opensWhen: ["code:knock-solved", "code:node-solved"],
    },
  ],
  objects: [
    // ── 진입부: 암전 속 P1 (스폰 근처 — 어둠 속 시야 반경 안에서 닿는다) ──
    {
      id: "pendulum-dynamo",
      name: "진자 발전기",
      sprite: "pendulum-dynamo",
      tile: [6, 4.5],
      range: 1.6,
      grounded: true,
      pad: 1.3,
      puzzleId: "pendulum-dynamo",
      interactAnchor: "#sys-console-locked",
    },
    // ── 본실 (봉인 밖) ────────────────────────────────
    {
      id: "knock-scope",
      name: "벽면 탐상 카트",
      sprite: "knock-scope",
      tile: [9, 1.7],
      range: 1.6,
      grounded: true,
      pad: 1.3,
      puzzleId: "wall-sounding",
      interactAnchor: "#sys-console-locked",
    },
    // P3 무음 지점의 바닥 해치 — 모달 없는 방 전체 퍼즐의 종착점.
    // 좌표는 silent-node/autoplay.ts의 HATCH가 단일 소스 (동쪽 마디선 Δ=λ/2 위,
    // spec이 무음 지점 검산). 여기 값은 그 미러다.
    {
      id: "silent-hatch",
      name: "바닥 해치",
      sprite: "floor-hatch",
      tile: [14.2, 12],
      range: 1.0,
      puzzleId: "silent-node",
      interactAnchor: "#sys-console-locked",
    },
    // ── 녹음 부스 (봉인 안, 동쪽 코너) ──────────────────
    {
      // 가로로 긴 스프라이트(258×200)라 밑면이 여러 타일에 걸친다 — dock-rail과 같은
      // 처리. 다리가 얇아 접지가 안 읽히므로(실제 제보: "위에 떠 있는 것처럼 보인다")
      // 패드를 스프라이트보다 확실히 넓게 준다.
      // 부스 안([16.3,4.3])에 두면 스프라이트가 유리벽을 관통해 보였다(실플레이 제보)
      // — 부스 앞 개방 바닥(booth-annex 봉인)으로 이전. [16,7.6]은 열린 유리문 아트와
      // 겹쳐 어색해서(2차 제보) 문에서 남서쪽으로 더 뗀다. 패드도 일반 바닥 규격으로.
      id: "monochord",
      name: "모노코드",
      sprite: "monochord",
      tile: [14.9, 9.0],
      range: 1.6,
      grounded: true,
      sink: 12,
      pad: 1.4,
      puzzleId: "monochord",
      interactAnchor: "#sys-console-locked",
    },
    {
      // 스프라이트 없음 — **배경 그림의 부스 안 책상·모니터가 곧 이 콘솔이다**
      // (서쪽 출구 문과 같은 처리). 아트에 이미 작업대가 그려져 있어 sonic-console
      // 스프라이트를 얹으면 가구가 두 벌이 되고, 어디 놔도 유리 앞에 떠 보였다.
      // 옛 좌표 [17.8,2.4]는 하필 그림 속 **의자** 자리였다.
      // 타일은 아트 격자 실측값: 부스 바닥 x∈[13.6,18.6]·y∈[-1.4,3.55], 책상 앞 모서리 ≈(15,1).
      id: "sonic-console",
      name: "녹음 콘솔",
      tile: [15.0, 1.0],
      range: 1.8,
      puzzleId: "sonic-console",
      interactAnchor: "#sys-console-locked",
    },
    // 출구 — 배경 그림의 서쪽 벽 문(지상 계단). 스프라이트 없음(그림에 있다).
    {
      id: "exit-door",
      name: "지상 계단 — 출구",
      tile: [0.8, 15],
      range: 1.6,
      interactAnchor: "#sys-door-locked",
      door: { requiresEvent: "door:sonic-open", ending: true },
    },
    // ── 연구노트 6 (퍼즐 개념 4 + 스토리 축 2) ──
    // 4개는 봉인 밖, 2개(44·46)는 부스 안 — 완주하려면 부스를 열어야 한다
    { id: "note-41", name: "연구노트", sprite: "note", tile: [8, 6], range: 1.2, noteId: "note-41" },
    { id: "note-42", name: "연구노트", sprite: "note", tile: [11.5, 4], range: 1.2, noteId: "note-42" },
    { id: "note-43", name: "연구노트", sprite: "note", tile: [7, 10], range: 1.2, noteId: "note-43" },
    { id: "note-45", name: "연구노트", sprite: "note", tile: [4, 12.5], range: 1.2, noteId: "note-45" },
    // note-44는 부스 안 — 옛 [18.9,1.1]은 실측상 부스 동쪽 유리 **바깥** 바닥이었다
    { id: "note-44", name: "연구노트", sprite: "note", tile: [17.2, 2.6], range: 1.2, noteId: "note-44" },
    { id: "note-46", name: "연구노트", sprite: "note", tile: [13.9, 5.3], range: 1.2, noteId: "note-46" },
    // ── 수색 지점 5 (벽면 가구 위, 스프라이트 없음) ──
    // 서랍(커피 캔)은 봉인 안 — 부스를 열어야 앞서 깔아 둔 약속을 회수한다.
    // 배선함은 반드시 봉인 **밖**(P3 넛지가 P3 해결 전에 읽혀야 한다).
    { id: "s3-wiring", name: "스피커 배선함", tile: [3.2, 0.4], range: 2.6, search: { anchor: "#search-room3-wiring" } },
    { id: "s3-wedge", name: "방음 쐐기 벽", tile: [0.4, 6], range: 2.6, search: { anchor: "#search-room3-wedge" } },
    { id: "s3-georack", name: "지오폰 랙", tile: [0.8, 10.2], range: 2.8, search: { anchor: "#search-room3-georack" } },
    { id: "s3-plate", name: "빈 문패", tile: [0.4, 13], range: 2.2, search: { anchor: "#search-room3-plate" } },
    { id: "s3-drawer", name: "콘솔 아래 서랍", tile: [13.9, 2.2], range: 2.2, search: { anchor: "#search-room3-drawer" } },
  ],
};
