# 방 배경 — 제작 하네스

> **이 문서 하나로 방 배경을 끝까지 만든다.** 요청문 → 생성 → 다양성 검수 →
> 캘리브레이션 → 배선 → 합격 판정까지가 한 줄로 이어져 있다.
>
> 선행 문서(이 문서보다 우선):
> - 화풍·팔레트·투영각 규약 → `docs/art-style.md`
> - 생성기 요청 3단 구조와 공통 스타일 블록 → `docs/gemini-asset-harness.md`
> - 실제 실행 절차(스킬) → `.claude/skills/gen-image-asset/`
>
> **읽는 법 — 이것은 실제 사례다.** 아래 수치·방 이름·회차 기록은 이 킷으로 만든
> 게임 *Science Legacy*(3방)의 것을 그대로 남겼다. 뭉뚱그린 지침보다 **실패까지 적힌**
> 사례가 따라 하기 쉽기 때문이다. 절차는 그대로 쓰고, 방 개수·이름·격자만 네 게임 것으로
> 바꾸면 된다. `room1-diversity` 같은 id가 나오면 네 방 id로 읽어라.

## 0. 지금 상태 (2026-08-14 — 3회차 배경 채택·배선·재배치 완료)

| 방 | 맵 파일 | 격자 | 배경 | 봉인 | 상태 |
|---|---|---|---|---|---|
| 방1 변화와 다양성 | `src/maps/room1-diversity.ts` | 13×13 | ✅ 온실 회랑 | **4단** (사분면형) | 오브젝트·blocks 실측 재배치 완료 (20ebe98) |
| 방2 환경과 에너지 | `src/maps/room2-energy.ts` | 13×13 | ✅ 수로 홀 | 없음 | 〃 (수로 6블록+돌다리) |
| 방3 과학과 미래 사회 | `src/maps/room3-future.ts` | 11×11 | ✅ 두 시대 | 없음 | 〃 (가구 5블록) |

다음 공정은 장치 스프라이트 — `docs/device-sprite-harness.md`.

**게임은 배경 없이도 완주된다**(주파 spec 3개가 그것을 지킨다). 배경은 얹는 것이지
전제가 아니다 — 그래서 실패한 생성물을 억지로 쓰지 않아도 된다.

**봉인은 방1에만 둔다**(2026-08-13 사용자 확정). 첫 방은 학습 순서를 몸에 익히는
자리라 구역을 차례로 열고, 방2·방3은 들어서면 구역이 한눈에 보인다 — 순서는 각 퍼즐의
게이트(교사 공개 코드 · 개념 답 · 유산 아이템)가 잡는다. 방마다 드나드는 맛이 달라지고,
그림도 방2·3은 칸막이 없는 넓은 방을 그릴 수 있다.

---

## 1. 불변 — 캘리브레이션 계약

**세 방이 공유하는 것은 이 여섯 줄뿐이다.** 나머지를 같게 만들면 같은 방이 된다.

1. 정사각 이미지, 방이 프레임 중앙, 바깥은 거의 검은 보이드.
2. 바닥은 **하나의 완전한 마름모**. 앞쪽 두 변에 벽이 없어 마름모 윤곽이 다 보인다.
3. 보이는 벽은 **정확히 둘** — 뒤-왼쪽과 뒤-오른쪽, 위 꼭짓점에서 만난다.
4. 맵은 정사각(`cols === rows`). `measure-room.mjs`가 대칭 마름모를 전제한다.
5. 사람·상호작용 장치(퍼즐 기계·문짝의 조작부)는 **그리지 않는다** — 게임이 얹는다.
6. 방을 내부 벽으로 쪼개지 않는다. 봉인 연출이 타일 사각형을 **덮는** 방식이라
   그림이 방을 쪼개면 봉인과 어긋난다.

> 앞쪽 두 변에 낮은 테두리 턱이 있는 것은 기하 레퍼런스(`assets-src/reference/room-geometry.png`)에
> 원래 있는 것이고, 기존 방과 실루엣이 같아 캘리브레이션이 그대로 맞는다. 없애려 하지 말 것.

---

## 2. 가변 — 다양성 축

**세 방은 최소 네 축에서 서로 달라야 한다.** 아래가 확정 배정이다.

| 축 | 방1 변화와 다양성 | 방2 환경과 에너지 | 방3 과학과 미래 사회 |
|---|---|---|---|
| **레이아웃** | 회랑형 — 가장자리를 한 바퀴 돈다 | 개방 홀 — 네 구역이 한눈에 | 두 시대 대비 — 바닥이 대각선으로 갈린다 |
| **중앙** | 큰 표본 나무(화분) — 가운데를 막아 회랑을 강제한다 | 비운다 | 비운다 |
| **바닥** | 흙·자갈 + 나무 발판 | 돌바닥에 **낮은 수로**가 흘러 구역을 가른다 | 한쪽 나무 마루 / 다른 쪽 강철 격자 |
| **천장·개방면** | 유리 지붕으로 들어오는 낮빛 | 한 면이 통째로 야외(논·하늘)로 트임, 천장에 배관·케이블 | 낮은 천장, 가스등 ↔ 모니터 빛 |
| **지배색** | 초록 + 호박 | 청록 + 구리 | 앰버 ↔ 청백 (반반) |
| **높이차** | 없음(평지) | 수로를 건너는 낮은 다리 | 두 구역 사이 한 단 |
| **문 위치** | 뒤-오른쪽 벽 | 뒤-왼쪽 벽 | 앞쪽 남 꼭짓점 |
| **봉인** | 4단 | 없음 | 없음 |

### 소품 독점 — 반복을 막는 장치

| 소품 | 쓸 수 있는 방 |
|---|---|
| 난간·화분·유리 표본병 | **방1만** |
| 지구본·계기판·황동 파이프 | **방2만** |
| 촛대·서류 더미·벽시계 | **방3만** |

한 소품이 두 방에 나오면 그 방이 서로 닮아 보인다. 실측으로 확인한 실패다.

---

## 3. 금지 목록 (2회차 실패에서 나온 것)

- **중앙 원형 러그 금지** — 세 장 모두에 흰 타원이 깔렸다. 어느 방에도 두지 않는다.
- **방을 가로지르는 난간은 방1만.** 방2·3에 난간을 두면 셋이 같은 리듬이 된다.
- **소품 독점표를 어기지 않는다.**
- **세 요청문의 문형을 같게 쓰지 않는다.** "위 절반 / 아래 절반" 같은 틀을 세 번 반복하면
  생성기가 같은 구도를 세 번 그린다. 방마다 서술 순서·문장 리듬을 바꾼다.
- **예시 나열형 지시 금지.** `zone borders may only be floor material changes, rugs, or
  low railings`라고 썼더니 생성기가 **러그와 난간을 그대로 그렸다.** 원하는 것을 직접
  쓰고, 원하지 않는 것은 NEGATIVE 블록에 따로 적는다.

---

## 4. 축 언어 — 위치는 **타일 축**으로 쓴다

2회차에서 그림과 맵이 어긋난 원인이 이것이다. 요청문을 "화면 위 절반 / 아래 절반"으로
썼는데, 맵의 띠는 타일 y축이고 **아이소메트릭에서 화면 아래쪽은 y가 아니라 x+y**다.

```
            타일 (0,0)  ← 북 = 화면 맨 위 꼭짓점
              /     \
   x 증가 →  /       \  ← y 증가
    (N,0)  /           \  (0,N)
   동=화면 오른쪽      서=화면 왼쪽
              \       /
               \     /
             타일 (N,N) ← 남 = 화면 맨 아래 꼭짓점
```

- 타일 **x가 커지면** 화면에서 **오른쪽 아래**로 간다.
- 타일 **y가 커지면** 화면에서 **왼쪽 아래**로 간다.
- 맵의 가로 띠(y 고정, x 3→9)는 화면에서 **왼쪽 위 → 오른쪽 아래 대각선**이다.

그러니 요청문에는 "위/아래" 대신 이렇게 쓴다:

> from the top corner toward the left corner / along the rear-right wall /
> near the bottom corner / in the right half of the diamond

`art-to-tile`로 확인하는 습관을 들인다:

```bash
node scripts/art-to-tile.mjs assets-src/gen-src/<파일>.src.jpg 13 330,740 508,560
```

---

## 5. 요청문

첨부는 **역할별로 2장**이다. 한 장만 붙이면 생성기가 기하까지 제멋대로 정한다(실증).

| 첨부 | 파일 | 역할 |
|---|---|---|
| A | `assets-src/reference/room-geometry.png` | **기하 전용** |
| B | `assets-src/reference/reference.jpeg` | **화풍 전용** |

### 5.0 공통 머리말 (세 방 동일 — 여기까지만 같다)

```
Two reference images are attached.
Image A defines the GEOMETRY: copy its room construction exactly — a single
square room in true 2:1 isometric projection; the floor is one perfect
diamond (rhombus) whose four corners point up, right, down and left; exactly
two walls are visible, the rear-left wall and the rear-right wall, meeting at
the top corner; the two front edges of the floor are fully open with no
walls, so the whole diamond outline of the floor is visible; the room floats
as a diorama on a plain very dark, almost black background; square framing
with the room centered. Ignore everything drawn inside image A — only its
camera, projection and framing matter.
Image B defines the STYLE: bold dark outlines, saturated flat colors, soft
simple shading, warm readable cartoon lighting. Ignore the content of
image B entirely.

Draw no people. Draw no machines or consoles that a player would operate —
those are added later as separate sprites. Do not divide the room with
interior walls.
```

### 5.1 방1 — 온실 회랑

```
ROOM: a botanical archive glasshouse, warm and overgrown.

The middle of the diamond floor is taken by one large potted specimen tree
whose canopy reaches the glass roof, so people walk around it rather than
across it. A raised wooden walkway rings the tree, following all four edges
of the floor, and the four stretches of that ring are four different corners
of the archive: rock strata and fossil slabs near the top corner; glass
breeding tanks and birch bark panels down the left side; a smelting bench
with a glowing crucible and leaf-filled flasks along the bottom; and pale
water basins with pipes and valves up the right side.

Ground is packed earth and gravel between the wooden boards. Daylight falls
through a glass roof, green and amber, with hanging ferns and vines catching
it. One tall closed door stands in the middle of the rear-right wall.

NEGATIVE for this room: no round rug on the floor, no globe, no candles,
no wall clock, no stacks of paper.
```

### 5.2 방2 — 트인 공학 홀

```
ROOM: an open engineering hall that looks out over rice paddies.

There is no partition anywhere; standing at the entrance you can see the
whole floor at once. A shallow stone water channel runs across the diamond
from the left corner to the right corner, crossed by two low plank bridges,
and it is this water — not any wall — that tells the halves apart. Copper
pipes and cable trays run overhead across the ceiling.

The rear-right wall is not a wall at all but one huge opening onto the
paddies and the sky beyond, so daylight floods in from that side and the
floor near it is bright. The rear-left wall carries brass gauges, dials and
a bank of switchgear, dim and teal in the shadow. Coils of copper wire and
ceramic insulators are stacked low along the bottom edge of the floor. One
closed door sits in the middle of the rear-left wall.

NEGATIVE for this room: no wooden railings, no potted plants, no candles,
no round rug, no bookshelves.
```

### 5.3 방3 — 두 시대가 맞닿은 방

```
ROOM: one room where two eras meet along a diagonal seam.

Split the diamond floor along the line from the top corner to the bottom
corner. The left half is 1854: worn wooden floorboards, a hand-inked city map
covering the rear-left wall with black tally marks house by house, gas lamps,
heavy dark desks with open ledgers. The right half is now: steel grating
floor one shallow step higher, pale panel walls, cool monitor glow, light
chairs. The seam itself is a single low step with a metal edge.

The two halves must read as different centuries in light alone — amber and
smoky on the left, blue-white and clean on the right — while keeping the same
outlines and shading. One tall closed door stands at the bottom corner of the
diamond, facing the viewer.

NEGATIVE for this room: no railings, no plants, no globe, no water,
no round rug, no glass roof.
```

### 5.4 꼬리말 (세 방 동일)

```
Output: one square image, plain very dark background outside the room,
no text, no watermark, no UI.
```

---

## 6. 생성 뒤 절차 — 이 순서를 벗어나지 말 것

### 6.0 한 장에 방이 여럿이면 — 손으로 자르지 말 것

생성기가 세 방을 한 시트에 뽑아 주는 일이 있다. 그때 **눈대중으로 잘라 넘기지 않는다.**
잘라 낸 조각에 이웃 방 귀퉁이가 남으면 `measure-room`이 그것을 실루엣으로 세어
캘리브레이션이 통째로 틀어지고(실측 `scaleY 48.9`), 반대로 넉넉히 자르려다 방의 한 변을
잘라 먹으면 바닥 마름모가 성립하지 않는다(3회차에 둘 다 났다).

**원본 시트를 그대로 넘기고** 이 스크립트로 떼어낸다. 바깥 보이드를 채운 뒤 남는 덩어리를
크기 순으로 세므로, 사람이 자르는 것보다 정확하다.

```bash
node scripts/isolate-room.mjs assets-src/gen-src/<시트>.png --bbox
```

덩어리 목록에서 방 셋의 rank를 확인한 뒤 세 번 돌린다.

```bash
node scripts/isolate-room.mjs assets-src/gen-src/<시트>.png assets-src/gen-src/room1-diversity.src.png --rank 1
```

결과는 1024² 캔버스에 **기존 배경과 같은 자리·같은 크기**로 얹힌다 —
`measure-room`의 INSET 보정이 픽셀 절대값이라 프레이밍이 다르면 그 보정이 어긋난다.

### 6.1 캘리브레이션

```bash
node scripts/measure-room.mjs assets-src/gen-src/<파일>.src.png 13
```

⚠ **캘리브레이션은 void-fill 전 원본(`.src`)으로 잰다.** 보이드를 메운 뒤에 재면
실루엣 경계가 달라져 값이 어긋난다(실측).

1. `measure-room.mjs`가 찍어 준 `scale`·`scaleY`·`offsetX`·`offsetY`를 맵의
   `background`에 그대로 넣는다.
2. 그림 위 가구가 몇 번 타일인지는 `art-to-tile.mjs`로 잰다(§4).
3. 그 좌표에 맞춰 **오브젝트를 옮기고** `blocks`를 적는다.
   **그림에 실제로 그려진 것만 막는다** — 빈 바닥을 막으면 "보이지 않는 벽"이 되어
   그림보다 나쁘다(실측 교훈).
4. 좌표를 만졌으면 반드시:
   ```bash
   node scripts/check-layout.mjs 0.4 && node scripts/check-reach.mjs
   ```
   `0.4`는 `tests/e2e/helpers.ts`의 `APPROACH_THRESHOLD`와 **반드시 같아야 한다.**
5. 눈으로 본다. `?grid`로 격자를 켜고 `__qe.goto`로 캐릭터를 세우면 카메라가 그를 화면
   중앙에 두므로 **화면 중앙이 곧 그 타일**이다. 아트 픽셀 눈대중은 두 번 틀렸다.
6. 마지막으로 주파 spec:
   ```bash
   npx playwright test tests/e2e/room1-playthrough.spec.ts --project=desktop-chrome --retries=0
   ```

---

## 7. 다양성 검수 — 세 장을 나란히 놓고 센다

```bash
node scripts/contact-sheet.mjs test-results/rooms.png assets-src/gen-src/room1-diversity.src.jpg assets-src/gen-src/room2-energy.src.jpg assets-src/gen-src/room3-future.src.jpg
```

한 장으로 붙여 놓고 아래를 센다. **셋 중 둘 이상에서 겹치면 그 방을 다시 뽑는다.**

| 세는 것 | 겹치면 안 되는 이유 |
|---|---|
| 중앙 랜드마크 | 첫눈에 들어오는 것이 같으면 같은 방으로 기억된다 |
| 바닥 재질 | 걸어 다니는 내내 보이는 면이다 |
| 지배색 | 대단원이 바뀐 느낌이 안 난다 |
| 소품 (난간·지구본·촛대·화분) | §2 독점표 위반 |
| 광원 방향과 색 | 조명이 같으면 화풍이 아니라 방이 같아 보인다 |

---

## 8. 합격 기준 — 하나라도 아니오면 다시 뽑는다

**기하 (§1 계약)**

1. 바닥이 하나의 완전한 마름모인가. 앞쪽 두 변에 벽이 없는가.
2. 보이는 벽이 정확히 둘인가.
3. 방이 정사각 프레임 중앙에 있고 바깥이 거의 검은 보이드인가.
4. 사람·조작 장치가 그려져 있지 않은가.
5. 내부 벽으로 방이 쪼개져 있지 않은가.

**배치**

6. 오브젝트가 놓일 자리(퍼즐 장치·노트·문)가 **빈 바닥**인가.
7. 문이 §2 배정표의 자리에 있는가.
8. 팔레트가 `design-tokens.json`에서 크게 벗어나지 않는가 — 후처리 팔레트 스냅이
   억지로 당기면 색이 뭉갠다.

**다양성 (§7)**

9. 중앙 랜드마크가 다른 방과 다른가.
10. 바닥 재질과 지배색이 다른 방과 다른가.
11. 소품 독점표를 지켰는가.

---

## 9. 배경 말고 더 필요한 에셋

배경이 붙은 뒤에 판단한다. 지금 맵은 스프라이트 없는 핫스팟으로 돌아가고 있고,
그 상태로도 플레이가 된다.

| 후보 | 개수 | 판단 시점 |
|---|---|---|
| 퍼즐 장치 스프라이트 | 10 | 배경 후 — 배경에 장치 자리가 어떻게 비었는지 보고 크기를 정한다 |
| 연구노트 아이콘 | 1 (공용) | 배경 후 |
| 문 스프라이트 | 2 (통로문·엔딩문) | 배경 후 |
| 유산 아이템 아이콘 | 3 | 지금은 이모지 플레이스홀더로 충분 |

장치 스프라이트는 `grounded`·`pad`·`sink` 필드로 접지를 잡는다 — 밑변이 여러 타일에
걸치면 `sink`를 키우고, 다리·받침이 없는 그림이면 `pad`로 받침대를 깐다.

---

## 10. 회차 기록

**실패도 적는다** — 같은 실패를 두 번 하지 않기 위해서다.

| 날짜 | 방 | 회차 | 결과 | 메모 |
|---|---|---|---|---|
| 2026-08-13 | 3방 | 1 | 재생성 | 구역이 그림에선 사분면, 맵에선 가로 띠 — **축 착오**. 요청문이 "화면 상하"로 서술했는데 맵 띠는 타일 y축(§4) |
| 2026-08-13 | 3방 | 2 | 재생성 | 기하·화풍은 합격인데 **세 장이 같은 방처럼 보였다.** 중앙 흰 타원 러그·가로 난간·지구본·촛대가 셋 다 반복. 원인은 요청문의 예시 나열형 지시(§3)와 같은 문형 3연속 |
