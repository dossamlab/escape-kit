# 생성 에셋 출처

이 폴더(`assets-src/gen/`)와 `assets-src/gen-src/`, `assets-src/rooms/`의 이미지는
**이미지 생성 모델로 만든 결과물**이다. 저작권 귀속이 정리되지 않았으므로
콘텐츠 라이선스를 비영리(CC BY-NC-SA 4.0)로 둔다 — `LICENSE-CONTENT` 참조.

**문제가 생기면 이 파일이 곧 삭제 목록이다.**

## 목록

| 파일 | 쓰임 | 생성 | 날짜 |
|---|---|---|---|
| `rooms/room-sonic.png` | 청음실 배경 (프리렌더 방 한 장) | 나노바나나 2 (Gemini 3 Pro Image) | 2026-08-03 |
| `gen/pendulum-dynamo.png` | P1 진자 발전기 | 〃 | 2026-08-03 |
| `gen/knock-scope.png` | P2 벽면 탐상 카트 | 〃 | 2026-08-03 |
| `gen/floor-hatch.png` | P3 바닥 해치 | 〃 | 2026-08-03 |
| `gen/monochord.png` | P4 모노코드 | 〃 | 2026-08-03 |
| `gen/sonic-console.png` | 녹음 콘솔 | 〃 | 2026-08-03 |
| `gen/speaker-cab.png` | 경보 스피커 | 〃 | 2026-08-03 |
| `gen/reel-tape.png` | 릴 테이프 아이템 | 〃 | 2026-08-03 |

`gen-src/*.src.png` = 생성기가 내준 **원본**(후처리 전).
`gen-src/*.png` = 개발 중 임시로 쓴 Pollinations 생성물(무료 API).
`gen/*.png` = 배경 제거·크롭·팔레트 스냅까지 끝난 게임용 산출물.

## 후처리

원본은 그대로 두고 `scripts/prep-gen.mjs`가 별도 경로로 내보낸다
(같은 경로로 덮어써서 원본을 잃은 적이 있다 — `docs/room3-asset-spec.md` 참조).
색은 `design-tokens.json` 팔레트로 스냅해 통일감을 강제한다.

## 요청문

각 이미지를 받을 때 쓴 프롬프트 전문과 회차별 실패 경위는
`docs/room3-asset-spec.md`에 남아 있다. 절차는 `.claude/skills/gen-image-asset/`.

## 직접 만든 에셋

`assets-src/`의 SVG(`tile-*.svg`, `wall-*.svg`, `note.svg`, `_lib/primitives.svg`)와
`char/*.pix`는 손으로 만든 것이고, 위 사정과 무관하다.
