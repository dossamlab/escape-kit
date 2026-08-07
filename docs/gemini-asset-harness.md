# 나노 바나나 2(Gemini 3 Pro Image) 에셋 요청 하네스

> Gemini의 이미지 생성(나노 바나나 2)으로 이 게임 에셋을 만들 때 **그대로 복사해 붙여넣는**
> 요청 템플릿. Pollinations보다 강력한 3가지를 적극 활용한다:
> ① **레퍼런스 이미지 첨부**(기존 에셋을 같이 올려 화풍·색 통일) ② **정확한 hex 색 지정**
> ③ **투명 배경 PNG 직접 출력**(마젠타 키잉 불필요) + 칠판 수식 같은 텍스트 렌더.
>
> ⚠ 아래 예시(방 목록·단서 숫자·아이템)는 **원본 물리 게임에서 가져온 것**이고,
> 일부는 이 저장소에 없는 방·문서를 가리킨다. 요청문의 **구조와 문체**를 참고하고
> 소재는 네 교과로 갈아끼울 것. 실제 절차는 `.claude/skills/gen-image-asset/`.

---

## 0. 요청 3단 구조 (항상 이 순서)

```
[A. 공통 스타일 블록]  ← 매번 그대로 붙임 (아래 §1)
[B. 이 에셋의 사양]    ← 유형별 템플릿 (§2~§5)에서 하나 골라 채움
[C. 출력 규격]         ← §6 그대로 붙임
```

그리고 **가능하면 레퍼런스 이미지를 첨부**한다:
- 방/오브젝트: `docs/reference/concept.png` 또는 원하는 밀도의 참고 방 이미지
- 캐릭터: 기존 `assets-src/char_asset/character_sprite.png`(같은 인물 유지 시)

---

## 0.5. 제작 철학 — 왜 이 구조가 최고 퀄리티인가 ★

**프리렌더 배경 + 상호작용 오버레이 + 워크박스** — 고전 어드벤처 게임의 정석.

| 레이어 | 무엇 | 왜 이렇게 | 어떻게 |
|---|---|---|---|
| **① 방 배경** | 방 전체를 통째로 1장 (벽·가구·조명·그림자·케이블) | 낱개 스프라이트 합성으로는 못 내는 **조명·그림자·구도의 통일**이 공짜로 따라옴 | Gemini가 1장 생성 → `assets-src/rooms/room-*.png` → 엔진 `background` 필드 |
| **② 상호작용 오버레이** | 퍼즐 장치·문·연구노트·캐릭터만 | 배경에 그려버리면 **발광·상태 변화·클릭이 불가능**. 분리해야 "만질 수 있는 것" 신호(시안 발광)와 애니메이션이 산다 | 개별 투명 스프라이트로 배경 위에 얹음 (이미 구현됨) |
| **③ 워크박스(충돌)** | 걸을 수 있는 칸 / 막힌 칸 | 배경의 벽쪽 가구를 **뚫고 지나가지 않도록**. 사용자가 말한 "통과 불가 속성" | 맵에 walkable 그리드 (⚠ 아직 미구현 — 배경 도입과 함께 추가 예정) |

핵심 원칙 3가지 (Gemini 요청에 그대로 반영됨):
1. **배경엔 사람·상호작용 물체를 그리지 않는다** — 캐릭터·퍼즐 장치는 게임이 얹는다.
2. **중앙 바닥은 비운다** — 플레이어 동선 + 퍼즐 장치 자리. 가구는 벽을 따라만.
3. **퍼즐 장치는 배경이 아니라 별도 스프라이트** — 발광/상태를 코드로 제어(통과/점등 등).

> 정리하면 사용자가 말한 그 방식이 맞다: **방은 한 장으로 찍고, 조작할 것만 따로 만들어
> 속성(통과 불가·발광·상태)을 코드로 붙인다.** 배경은 "무대", 오버레이는 "배우".

---

## 1. 공통 스타일 블록 (A — 매번 붙임)

```
You are a pixel-art asset artist for a 2.5D isometric physics escape-room game.
Art direction (follow strictly):
- Style: clean 16-bit pixel art, isometric 2:1 projection (tiles are 128x64, a 2:1 diamond).
- Mood: an abandoned COLD underground physics laboratory. Clinical, moody, a little lonely.
- Cool palette ONLY (use these hex): base #212531, floor tiles #343b4a / #2d3341,
  walls #414b5e / #38414f, structure lines #3d5a80, dark outline #17171a,
  bright screen/glass #e1e9f6, machine body grey #42454d.
  Accent glow (interactive machines only): cyan #4da8ff. Warning red #e63946.
- NO warm colors on furniture/environment (no beige/orange rooms). Warm tones are
  reserved for the human character only.
- Crisp pixels, hard dark outline, flat shading with soft light — no photographic blur,
  no anti-aliased fuzz, no gradients-as-texture.
```

---

## 2. 유형 ①: 방 배경 전체 (가장 추천 — 레퍼런스 수준)

> 방을 통째로 1장 생성. 게임 엔진이 이 그림을 깔고 그 위에 퍼즐 장치·문·노트·캐릭터를 얹는다.
> `assets-src/rooms/room-<이름>.png`로 저장.

```
[B] Draw a FULL ROOM interior as one illustration:
- A diamond-shaped isometric room with TWO back walls meeting at the TOP corner
  (같은 구도: 첨부 레퍼런스 참고).
- Steel blue-grey tiled floor. A LARGE EMPTY OPEN floor area in the CENTER
  (플레이어가 걷고 장치가 놓일 공간 — 반드시 비울 것).
- All furniture and equipment placed DENSELY along the walls only, not in the center.
- Along the walls, show at least 6 SEARCHABLE furniture pieces with clear readable
  silhouettes (cabinets, lockers, drawers, desks, shelves) — 게임이 이 위에 "수색
  핫스팟"을 얹으므로 뒤질 만한 가구가 또렷이 보여야 함.
- Tangled black cables on the floor near the walls. Cold pale fluorescent light pools.
- <이 방의 테마 문구 — 아래 표에서 골라 붙임>
- No people, no characters. No UI. Black (#101318) outside the room edges.

[C 출력] transparent or solid black background outside the room, 1280x1024 pixels,
pixel-art (not smooth), no watermark, no text overlay.
```

### 2-B. 참고 이미지로 "이 밀도·구도"를 재현할 때 ★ (권장)

원하는 느낌의 방 이미지(예: 꽉 찬 실험실 스크린샷)를 **첨부**하고 이 오버라이드를 붙인다.
텍스트로 밀도를 설명하는 것보다 이미지 1장이 훨씬 강력하다 — 단, 그 이미지가
게임과 충돌하는 3요소(따뜻한 색·사람·찬 중앙)는 반드시 오버라이드로 뒤집는다.

```
Use the attached image as a STYLE and COMPOSITION reference: match its pixel-art style,
its dense isometric room with two back walls meeting at the top corner, the amount of
equipment packed along the walls, the chalkboard and window on the back walls.

BUT change these three things:
1) COLD palette instead of warm. Steel blue-grey floor tiles (#343b4a / #2d3341),
   cool grey concrete walls (#414b5e / #38414f), pale fluorescent lighting.
   Remove ALL warm / beige / orange tones from the environment.
2) NO people, NO characters in the room. Empty room only.
3) Keep the CENTER floor area EMPTY and open — move ALL furniture and machines to the
   walls. The center must be clear walkable floor.

No UI, no text overlay, black (#101318) outside the room edges.
Output pixel-art, 1280x1024.
```

| 첨부 이미지의 특성 | 게임 요구 | 오버라이드 이유 |
|---|---|---|
| 따뜻한 베이지 톤 | 차가운 톤 | 원하는 방향 + 캐릭터(따뜻한 코트)가 대비로 살아남 |
| 사람이 방 안에 있음 | 사람 없음 | 게임이 자기 플레이어를 그 위에 얹음 (①=무대, ②=배우) |
| 중앙에 장치·책상이 참 | 중앙 바닥 비움 | 플레이어 동선 + 퍼즐 장치 오버레이 자리 |

5개 방은 **같은 대화(세션)에서 연속** 생성 — 첫 방 뒤에
`keep the exact same style, cold palette and lighting, now draw the next room: <테마>`로
이어가면 조명·톤이 일관된다.

방별 테마 문구 (B의 `<...>` 자리):

| 파일명 | 방 | 붙일 문구 |
|---|---|---|
| room-lab | 1막 로비 | a large dark-green chalkboard covered with hydrogen spectrum / Bohr model formulas on one wall; science posters and a dark night window on the other wall; lab workbenches, tall shelves of glass bottles, lockers |
| room-optics | 2막 광학실 | optical benches with lenses and small red laser devices; precision instrument racks; glass cabinets; a chalkboard with optics ray diagrams |
| room-mech | 3막 역학홀 | warehouse feel: wooden crates and metal drums stacked along walls; a step ladder; rails and pulleys on the walls; yellow caution signs |
| room-power | 4막 배전실 | electrical switchboards and breaker panels; dense server racks; thick cable bundles everywhere; warning signs; darker than other rooms |
| room-balance | 5막 균형의방 | classroom feel: a big blackboard with lever / torque diagrams; stacked chairs and desks; a dusty bookshelf |

> **팁**: 5개 방을 **한 대화(세션)에서 연속으로** 요청하면 조명·톤이 일관되게 나온다.
> 첫 방을 만든 뒤 "keep the exact same style, palette and lighting, now draw the next room:"로 이어가기.

### 2-C. 수색 단서를 배경에 심기 ★ (방탈출 핵심 — 게임 실제 단서 기준)

수색 시스템에서 **일부 단서는 배경 그림 안에 "읽을 수 있게" 그려져야** 한다
(칠판 수식 등). 게임이 그 위치에 핫스팟을 얹으면 플레이어가 조사 시 클로즈업 텍스트를
보지만, 배경에도 힌트가 보여야 "저길 조사해야겠다"가 성립한다. 방 배경 요청에 아래
**단서 요구**를 반드시 추가한다. (텍스트 원본은 `docs/story.md`의 `#search-*` 앵커 소유)

**1막 room-lab (현재 구현된 단서 체인 — 콘솔 코드 6563 = Hα 656.3nm):**
```
Add these SPECIFIC readable details to the room (they are in-game clues):
- On the chalkboard, legibly write the Balmer formula and the value:
  "n=3 → n=2   λ = 656.3 nm" (this exact number is the puzzle code — must be readable).
- Show a closed metal CABINET with drawers and a tall LOCKER along the walls,
  clearly "searchable" (openable drawers / slightly ajar door).
- A desk, a reagent shelf, a dead potted plant, a computer desk — ordinary props
  the player can rummage (some are red herrings).
```

**2~5막**: 단서 체인 구현 완료(방마다 수색 6곳 + 코드형/아이템형 게이트) — 배경에 그려
넣어야 할 가구 목록과 **읽혀야 하는 단서 숫자**는 `docs/act2-5-asset-spec.md` §3에 방별로
정리돼 있다. 이 절 대신 그 문서를 쓸 것.

> 규칙: 칠판·포스터에 **숫자·수식이 단서면 반드시 또렷하게** (Gemini는 텍스트 렌더가
> 강하니 "legibly, readable" 명시). 단, 배경의 다른 글자는 뭉개져도 무방.

---

## 3. 유형 ②: 개별 오브젝트 스프라이트 (가구·소품·장치)

> 방 배경을 안 쓰고 낱개로 배치할 때. `assets-src/gen/<이름>.png`.

```
[B] Draw ONE single isolated object: <오브젝트 설명, 예: a white lab workbench with a
microscope and glass flasks on top>.
- Isometric 2:1 view, standing directly on the ground.
- 데코 가구면: realistic cold laboratory look, cool grey/steel/white, NO glow.
- 퍼즐 장치면: dark metal body with a subtle CYAN #4da8ff glow (신호: 만질 수 있는 것).
- NO base, NO platform, NO pedestal, NO floor tile, NO room, NO shadow under it.

[C 출력] TRANSPARENT background PNG, just the object centered, pixel-art, no text.
```

권장 크기(세로 px, 게임 타일=128×64 기준): 소품 60~90 / 책상·선반 100~140 / 큰 장치 110.
정확히 안 맞아도 됨 — 통합 시 배율로 맞춤.

---

## 4. 유형 ③: 벽걸이 (칠판·포스터·창문·조명)

> 벽에 붙는 평면 아트. 엔진이 벽 기울기(±½)로 눕혀 붙이므로 **원근 없이 정면 평면**으로.

```
[B] Draw <칠판/포스터/창문 등>, FLAT FRONT view, NO perspective, as if seen straight on.
- Cold lab style, cool grey/steel frame.
- 칠판이면: dark green board with white chalk physics formulas (수식 예: E=-13.6/n^2,
  Balmer series lines). 글자는 또렷하게.

[C 출력] TRANSPARENT background PNG, flat front-facing, pixel-art, no extra scene.
```

---

## 5. 유형 ④: 캐릭터 (레퍼런스 인물 유지 → 3-view 세트 생성)

> `import-char.mjs`가 소비하는 입력은 인물당 **3뷰가 가로로 나란한 시트 1장**.
> 이걸 넣으면 6방향(se/sw/ne/nw/e/w) × 걷기 프레임으로 자동 가공된다.
> `assets-src/char_asset/`에 `character_sprite.png`(남), `female_character_sprite.png`(여)로 저장.
> 스크립트가 배경(흰색·체커보드) 제거 → 열 점유로 3뷰 자동 분할 → 다운스케일까지 처리하므로
> **직접 자를 필요 없다.** 확장자만 .png인 JPEG도 그대로 받는다.

### 파이프라인이 원하는 3-view의 정의 (Gemini에게 꼭 알려줄 것)

| 시트 내 순서 | view | 캐릭터가 바라보는 방향 | 게임에서 쓰이는 곳 |
|---|---|---|---|
| 왼쪽 | **FRONT** | 카메라 쪽(정면, 약간 아래) — 얼굴이 보임 | se(+sw 미러) 대각 정면 |
| 가운데 | **SIDE** | **오른쪽 옆모습(프로필)** | e(+w 미러) 좌우 측면 |
| 오른쪽 | **BACK** | 카메라 반대(뒷모습) — 뒤통수·등 | ne(+nw 미러) 대각 후면 |

> 순서(front→side→back, 왼→오)와 **세 뷰 사이 여백**이 중요하다. 뷰가 서로 닿으면 분할이
> 실패한다 (스크립트가 "3뷰 검출 실패"로 중단하니 조용히 깨지진 않는다).

> 핵심: **레퍼런스가 어느 각도든(SW·3/4 등) 상관없다.** 레퍼런스는 "누구인가(인물·옷·머리색)"만
> 고정하고, 위 3-view는 우리가 지정하는 각도로 새로 그리게 하는 것이 요령이다.

### 5-A. SW(또는 임의 3/4) 게임 스프라이트를 레퍼런스로 붙일 때 ★

지금 게임 속 캐릭터(SW = 정면-좌하를 바라보는 3/4 뷰)를 캡처해 첨부하고 아래를 붙인다.
**세 view를 한 번에** 요청해 인물 일관성을 최대화한다 (한 응답에 3장).

```
[레퍼런스 첨부: 현재 SW 방향 캐릭터 스프라이트]

The attached image shows my game character in a 3/4 isometric view facing toward the
lower-left (SW). Use it ONLY to lock the character's identity — the SAME person, same
outfit, same messy red hair, same beige trench coat, same chibi proportions
(big head ~1/3 of height), same thick dark outline and flat pixel-art shading.

Redraw this EXACT same character in THREE separate clean full-body views for a sprite set:
1) FRONT  — standing, facing the camera (facing down toward the viewer). Face visible.
2) SIDE   — standing, strict right-facing profile (facing to the right).
3) BACK   — standing, facing away from the camera (facing up). Back of head and coat.

All three: identical character size, identical foot position, standing straight, arms
relaxed at the sides. Keep them consistent as if the same figure just rotated.

[C 출력] TRANSPARENT (or pure white) background, ONE character centered per view,
1024x1024 each, pixel-art (not smooth), no shadow, no text, no ground.
```

- 남·여 모두 side=**오른쪽** 바라봄 (import-char의 `sideFaces: "e"`와 일치).
  다른 방향으로 받았다면 INPUTS의 sideFaces를 바꾸면 된다.
- **한 장에 세 뷰가 나란한 형태가 정상 입력**이다 (따로 받을 필요 없음).
  `[C 출력]`에 `three views side by side in one 1024x1024 image, evenly spaced, not touching` 추가.
- **검수**: 세 view의 키·발 위치·옷 디테일이 같은 인물로 일관적인가 (다르면
  "keep the exact same character, only rotate the view"로 재요청).

### 5-B. 완전히 새 캐릭터를 만들 때

레퍼런스 없이도 위 3-view 구조는 동일. §1 공통 블록 + "a high-school student, messy
dark-red hair, beige trench coat, chibi proportions" 같은 인물 묘사를 넣고 front/side/back
3장을 요청한다.

---

## 5.5. 유형 ⑤: 아이템 아이콘 (방탈출 수색 단서) ★ 신규

> 방을 뒤져 찾는 단서(퓨즈·메모·사진 조각·열쇠 등). 인벤토리 HUD·발견 팝업에 표시.
> 도착 전에는 코드가 이모지 플레이스홀더로 동작하므로 언제든 교체 가능.
> `assets-src/gen/item-<id>.png` (예: item-photo-fragment, item-doctor-memo).

```
[B] Draw ONE small game inventory item icon: <설명, 예: an old glass photographic plate
showing a hydrogen emission spectrum with bright colored lines / a crumpled handwritten
note / a spare ceramic fuse>.
- Simple, bold, readable at small size. Slight top-down 3/4 tilt (아이소 아님, 아이콘).
- Cold lab palette, thin dark outline. NO background scene, NO hand holding it.

[C 출력] TRANSPARENT background PNG, single item centered, ~64x64 pixels, pixel-art, no text.
```

- 수색 텍스트·단서 내용은 코드가 아니라 `docs/story.md`의 `#search-*` 앵커가 소유
  (아이콘은 시각 표현만). 새 단서 추가는 story.md 앵커 + inventory.ts ITEMS 등록.

### 지금 게임에 필요한 아이템 아이콘 (1막분)

`src/engine/core/inventory.ts`의 ITEMS와 1:1. 파일명·설명을 이대로 요청하면 바로 교체된다:

| 파일명 | 아이템 | 이모지(현재 플레이스홀더) | Gemini 요청 설명 (B칸) |
|---|---|---|---|
| `item-photo-fragment.png` | 분광 사진 조각 | 📷 | an old glass photographic plate showing a hydrogen emission spectrum: a black strip with a few bright vertical lines, one RED line clearly brightest, edges cracked |
| `item-doctor-memo.png` | 박사의 메모 | 📝 | a small crumpled handwritten paper note, slightly yellowed, folded creases |

> 아이콘이 없으면 게임은 이모지로 정상 동작하므로 **급하지 않다.** 방 배경(유형①)을
> 먼저 만들고, 아이템 아이콘은 나중에 일괄로 뽑아도 된다.
> 3막·5막 아이템 4종(`launch-crank`·`steel-ball`·`weight-brass`·`weight-iron`)은
> `docs/act2-5-asset-spec.md` §5에 같은 형식으로 정리돼 있다.

## 5.6. 수색 핫스팟 워크플로 (방 배경과 만나는 지점)

- **프리렌더 배경 모드**: 배경 속 가구는 그림의 일부 → 별도 에셋 불필요. 게임은 가구
  위치에 **보이지 않는 핫스팟(좌표+반경)**을 얹고 반짝임 마커 + 근접 라벨로 시그널.
  배경 이미지가 오면 Claude가 이미지를 보고 가구를 타일 좌표로 매핑(캘리브레이션과 동시).
- **현행 스프라이트 모드**: 데코 가구(cabinet·locker 등) 좌표에 `search` 속성을 직접 부착
  (배경 전환과 독립적으로 이미 동작 중 — 1막 로비 7곳 적용).
- 규칙: 상호작용 대상(수색 지점·문·노트·장치)은 서로 **1.5타일 이상 떨어뜨림**
  (근접 판정이 "가장 가까운 것"을 고르므로 인접하면 오조작).

---

## 6. 출력 규격 (C — 공통 체크)

Gemini에 매번 명시:
- **배경**: 오브젝트·벽걸이·캐릭터 → **투명 PNG**. 방 배경 → 방 밖은 검정(#101318).
- **픽셀 아트**로 (사진체·부드러운 렌더 금지), 워터마크·서명·화면 밖 텍스트 없음.
- 한 번에 **오브젝트 1개만** (여러 개 나열 금지 — 방 배경 제외).

---

## 7. 받은 뒤 검수 체크리스트 (넘기기 전에)

- [ ] 배경이 진짜 투명한가 (오브젝트) / 방 밖이 검정인가 (방 배경)
- [ ] 따뜻한 색이 환경에 섞이지 않았나 (베이지·주황 벽/바닥 ✕)
- [ ] 받침대·바닥 조각을 달고 나오지 않았나 (오브젝트)
- [ ] 방 배경이면 중앙 바닥이 비어 있나 (캐릭터·장치 놓을 자리)
- [ ] 방 배경이면 수색 가능 가구 6곳 이상 + **단서(칠판 656.3nm 등)가 읽히나** (§2-C)
- [ ] 아이소메트릭 각도(2:1)가 다른 에셋과 맞나

**재요청 문구 예시** (안 맞을 때):
- "make the background fully transparent, remove the platform it stands on"
- "colder palette, remove all warm/beige tones, match cyan-grey lab mood"
- "keep the center floor empty, move all furniture to the walls"
- "make the chalkboard text legible: write exactly 'n=3→2  λ = 656.3 nm'"

---

## 8. 게임에 넣기 (내가 처리)

파일을 아래 위치에 넣고 알려주시면 통합·좌표 캘리브레이션·검증까지 진행합니다:
- 방 배경 → `assets-src/rooms/room-<이름>.png`
- 개별 오브젝트/벽걸이 → `assets-src/gen/<이름>.png` (기존 이름 덮으면 교체)
- 아이템 아이콘 → `assets-src/gen/item-<id>.png` (§5.5 표의 파일명 그대로)
- 캐릭터 3뷰 시트 → `assets-src/char_asset/character_sprite.png`(남)·
  `female_character_sprite.png`(여) (그 뒤 `node scripts/import-char.mjs`)

→ `npm run assets`로 자동 반영, e2e·인게임 스크린샷으로 검증. 방 배경이 오면
**수색 핫스팟 좌표 재배치 + 워크박스(충돌)** 도 함께 구현합니다 (§0.5 ③).

단, **오브젝트 스프라이트는 받은 파일을 그대로 넣을 수 없습니다.** 실측 결과 확장자만
`.png`인 JPEG로 오고, 투명 배경을 요청해도 불투명 배경(또는 체커보드가 픽셀로 눌린 상태)에
1024×1024로 옵니다. 배경 제거·크롭·축소는 `node scripts/prep-gen.mjs <받은파일> <목적지>
<목표세로> <허용오차>` — 자세한 사용법과 허용오차 잡는 법은
`docs/console-door-asset-spec.md` §6. (방 배경은 알파가 필요 없어 재인코딩만 하면 됩니다.)
관련 상세 규격: `docs/room-asset-spec.md`(방), `docs/console-door-asset-spec.md`(1막 콘솔·층
이동 문 — 구 파이프라인 산출물 교체용 복붙 요청문), `docs/art-style.md`(전체 규칙),
수색 시스템은 `src/engine/core/inventory.ts` · `docs/story.md #search-*`.
