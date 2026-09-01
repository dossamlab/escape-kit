# 캐릭터 스프라이트 — 생성 요청서와 가공 규약

> 현재 체계: **8방향**. 시트는 `assets-src/gen-src/char-asset-8dir.png`
> (자홍 배경, 2행 × 5열 — 위 남/아래 여, 정면·¾정면·측면·¾후면·후면).
> 가공은 `node scripts/import-char.mjs` 한 방이면 끝난다.

## 왜 5뷰로 8방향이 되는가 (설계 근거)

엔진의 방향 이름은 **월드가 아니라 화면 방향**이다 — `Game.ts`가 화면 이동 델타(sx, sy)를
45°씩 여덟 칸으로 나눈다:

```ts
private static readonly OCTANTS = ["e","se","s","sw","w","nw","n","ne"] as const;
this.facing = Game.OCTANTS[Math.round(Math.atan2(sy, sx) / (Math.PI / 4)) & 7];
```

시트의 사선·측면 뷰가 전부 **오른쪽**을 보므로, 왼쪽 넷은 좌우 미러 한 번으로 얻는다.
그래서 다섯 장이면 여덟 칸이 채워진다:

| 화면 방향 | 쓰는 그림 | 엔진 방향 이름 | 플레이어가 느끼는 것 |
|---|---|---|---|
| 아래 | 정면 | `s` | 화면 아래로 걸으면 얼굴이 보인다 |
| 아래-오른쪽 | ¾ 정면 | `se` | |
| 오른쪽 | 측면 | `e` | |
| 위-오른쪽 | ¾ 후면 | `ne` | |
| 위 | 후면 | `n` | 화면 위로 걸으면 등이 보인다 |
| 위-왼쪽 | ¾ 후면 **미러** | `nw` | |
| 왼쪽 | 측면 **미러** | `w` | |
| 아래-왼쪽 | ¾ 정면 **미러** | `sw` | |

**왼쪽을 보는 뷰를 시트에 섞지 말 것** — 방향마다 코트 여밈·가르마가 뒤집혀 보인다.
그래서 요청문이 "views 2, 3 and 4 must ALL face RIGHT"를 못 박는다.

대각 4방향뿐인 `.pix` 폴백 세트를 위해 엔진에 8→4 근사 표를 함께 둔다(키트 템플릿 호환).

### 여기까지 온 경위

1. **¾ 3뷰** — 그 각도가 화면축 어디에도 맞지 않아 어느 방향으로 걸어도 비스듬했다.
2. **직교 3뷰(4방향)** — 화면축과 1:1로 맞아 어긋남은 사라졌지만, 위·아래로 걸을 때
   정면/후면만 나오고 대각 이동이 뭉뚱그려졌다.
3. **5뷰(8방향)** — 현재. 대각까지 각자의 그림을 갖는다.

## 시트 요청문 (재생성이 필요할 때)

첨부 1장: 직전 시트(정체성·비율·화풍의 기준). 처음 만들 때는
`assets-src/reference/reference.jpeg`(화풍)를 함께 붙인다.

```
The attached image is an existing character sheet for a game. Keep the SAME two
characters, the SAME art style (bold dark outlines, saturated flat colors, soft
simple shading), the SAME proportions (about 3 heads tall, big round head, short
simple body and legs) and the SAME outfits. Do not redesign them.

Produce ONE new image on a plain solid magenta (#FF00FF) background containing
TWO ROWS, five drawings per row, all at the SAME scale with the feet resting on
one shared invisible baseline:

TOP ROW — the boy with short dark red-brown hair, beige knee-length coat over a
dark shirt, dark trousers, dark shoes.
BOTTOM ROW — the girl with long straight black hair, dark knee-length coat
dress, dark tights, dark shoes.

In BOTH rows the five drawings are a turnaround, left to right, rotating the
character step by step to the LEFT so that we see, in order:

  1. FRONT — facing the viewer straight on, both shoulders square.
  2. THREE-QUARTER FRONT — rotated exactly 45 degrees, so the character faces
     halfway between the viewer and the character's own right. Both eyes still
     visible, the far shoulder slightly hidden.
  3. SIDE — a clean right-facing profile, exactly 90 degrees. One eye visible.
  4. THREE-QUARTER BACK — rotated exactly 135 degrees. We mostly see the back,
     with a sliver of the cheek and one shoulder toward the right.
  5. BACK — facing directly away, both shoulders square, no face visible.

Critical: views 2, 3 and 4 must ALL face toward the RIGHT side of the image.
Never mirror one of them to the left. Views 1 and 5 must be perfectly straight,
not slightly turned. The rotation must be even: 0, 45, 90, 135, 180 degrees.

Keep the shapes big and simple — this sprite will be shrunk very small, so no
thin details, no patterns, no fabric texture, no small props.

Absolutely no shadow of any kind under or behind the characters — no ground
ellipse, no floor, no plinth, no glow. Nothing touches the magenta background
except the characters' own outlines. No text, no labels, no frame, no grid.
```

⚠ 금지: 픽셀 치수·프레임 수 요청(걷기 프레임은 가공이 만든다), 그림자·받침, 글자,
흰 배경(베이지 코트 키잉 위험 — 자홍 고정), **왼쪽을 보는 사선 뷰**.

⚠ 흔한 실패: ¾ 뷰가 45°가 아니라 거의 정면이거나 거의 측면으로 나온다. 받으면
**세 사선 뷰가 왼쪽을 보고 있지 않은지**, **1·5번이 정확히 정면·후면인지** 먼저 확인하고,
어긋나면 그 항목만 짚어 재요청한다.

## 가공 파이프라인 (`scripts/import-char.mjs`)

자홍 키잉 → 디프린지 → 행 분리(남/여) → 열 분리(5뷰) → bbox 크롭 → 250px 다운스케일 →
걷기 프레임 a/b(다리 절반 10px 리프트) → 사선·측면 미러 → `assets-src/ext-char/` 48장 교체.

행·열 분리는 **점유 구간 자동 탐지**라 여백이 달라져도 따라간다. 분리에 실패하면
`행 분리 실패: N개` / `열 분리 실패: N개`로 즉시 죽으므로 조용히 잘못 나오는 일은 없다.

### 규격 — 도트가 되지 않게

높이 **250px**(발이 최하단 행) = 월드 높이 그대로, `ext-char/meta.json`의 `scale: 1` →
화면 높이 125px(배경 방 크기 N과 무관).

옛 규격은 50px × `scale: 5`였는데, 그 확대가 nearest라 **캐릭터만 도트로 튀었다**.
배경이 매끈한 카툰 아트일 때 특히 눈에 띈다. 그래서 세 가지를 함께 바꿨다:

- 파이프라인이 월드 높이 그대로 뽑는다(확대 없음)
- 알파를 이진화하지 않는다 — 안티에일리어스 외곽을 살린다(옅은 잔재만 제거)
- `Game.ts`가 **캐릭터를 그릴 때만** `imageSmoothing`을 켠다
  (전역은 픽셀아트 타일용 nearest라, 고해상도 그림을 그대로 축소하면 가장자리가 부서진다)
- `style.css`의 캐릭터 선택 화면도 `image-rendering: auto`

`.pix` 픽셀아트로 돌아가면 위 넷을 되돌릴 것.

## 수령 후 체크리스트

1. 원본을 `assets-src/gen-src/char-asset-8dir.png`로 저장(이전 시트는 덮어쓰지 않는다)
2. `node scripts/import-char.mjs`
3. `node scripts/contact-sheet.mjs <out> assets-src/ext-char/char-m-s-idle.png …`로 눈 검수
4. `npm run assets` → 게임에서 **여덟 방향으로 걸어 보고** 정면·후면·측면·¾가 맞는지 확인
   (아래=얼굴, 위=등, 좌우=옆모습, 대각=¾. 방향키 두 개를 함께 눌러 대각을 낸다)
5. 캐릭터 선택 화면도 확인(대표 프레임이 거기 노출된다)
6. `bash scripts/verify.sh quick`

## 회차 기록

| 회차 | 날짜 | 대상 | 결과 | 경위 |
|---|---|---|---|---|
| 1 | 2026-08-11 | 남/여 ¾ 3뷰 | ✗ 시점·비율·그림자 | 발밑 그림자, 정면/후면이 직교라 ¾가 아님, 6등신 |
| 2 | 2026-08-11 | 남/여 ¾ 3뷰 | △ 채택했다가 교체 | 3등신·¾ 사선·무그림자 충족. 다만 **¾ 각도가 화면축과 어긋나 방향이 어색**했다 |
| 3 | 2026-08-11 | 남/여 직교 3뷰 (2행×3열) | △ 교체됨 | 4방향 체계로 화면축과 1:1 대응은 됐으나 대각 이동이 뭉뚱그려졌다 |
| 4 | 2026-08-11 | 남/여 5뷰 (2행×5열) | ✓ 채택 | 0·45·90·135·180° 턴어라운드. 사선 3뷰가 전부 오른쪽을 봐 미러로 왼쪽 넷을 얻었다. 엔진 facing을 8칸으로 확장. 인게임 8방향 전수 확인 |
