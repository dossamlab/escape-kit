# 「이름 없는 방」 에셋 요청서 (예제) — 나노바나나 2 (Gemini 3 Pro Image) 복붙용

> 사용법: `docs/gemini-asset-harness.md`의 3단 구조([A 공통 스타일] → [B 사양] → [C 출력]).
> §0의 A 블록을 매번 맨 앞에 붙이고 필요한 항목의 B·C를 이어 붙인다.
> **한 대화(세션)에서 연속 생성**해야 조명·톤이 일관된다.
>
> **받은 파일은 전부 `assets-src/gen-src/`에 넣는다** — 장치는
> `<이름>.src.png`, 방 배경은 `room-sonic.src.png`.
> 넣고 알려 주시면 후처리(prep-gen)·캘리브레이션·검증까지 제가 진행합니다.
>
> ⚠ **원본과 결과를 같은 경로로 두지 마라** (2번 방 1차 납품 사고 — 원본 6개 소실).
> 항상 `prep-gen assets-src/gen-src/<이름>.src.png assets-src/gen/<이름>.png …`.

## 이 방의 특이사항 — 먼저 읽을 것

1. **방 크기 목표 24×24** (사용자 지정 — 방을 걸어다니는 퍼즐이 있어 넓을수록 좋다).
   단 요청서에는 크기·타일 수를 쓰지 않는다(1번 방 교훈: 정량은 후처리, 정성은 생성기).
   프롬프트에서는 "spacious/large hall" 같은 정성 표현만 쓰고, 실제 N은
   `measure-room`·`room-scale`로 역산한다. 1번 방이 24 요청 → 20 착지였다.
2. **바닥 중앙이 매우 중요하다.** P3(무음 지점)는 플레이어가 바닥을 걸어다니며 소리가
   죽는 타일을 찾는 퍼즐이다 — 중앙 바닥은 반드시 넓고 비어 있어야 한다.
3. **봉인 구역(녹음 부스)**: 방 남쪽 구석의 녹음 부스는 봉인됐다가 열린다. 2번 방과
   같은 규약 — **방 전체를 정상(열린) 상태로** 그려 받고, 가리는 것은 엔진이 한다.
4. **암전은 엔진이 한다.** 입장 시 어두운 연출은 엔진 dark 모드가 담당하므로
   그림은 **조명 켜진 정상 상태**로 받는다.
5. **개발은 임시 스프라이트로 선행한다.** Gemini 납품 전까지 Pollinations
   (`scripts/gen-asset.mjs`) 임시 스프라이트 + 배경 없는 렌더(잠정 좌표)로 개발하고,
   납품 후 relayout-room으로 재배치한다 (thermal-room 개발과 동일한 순서).

## 0. 공통 스타일 블록 [A] — 매번 맨 앞에 붙임

3번 방은 관측동 최심부의 **청음실(acoustic listening room)** 이다. 1번 방(관측 격납고)·
2번 방(열역학 시험동)과 같은 시설·같은 팔레트, 다른 기능 — 방음 쐐기와 음향 장비가
지배하는, 소리를 재던 공간. 문패가 비어 있는 "이름 없는 방".

```
You are a pixel-art asset artist for a 2.5D isometric physics escape-room game.
Art direction (follow strictly):
- Style: clean 16-bit pixel art, isometric 2:1 projection (every floor tile is a
  2:1 diamond — twice as wide as it is tall).
- Mood: a sealed ACOUSTIC LISTENING ROOM deep inside an abandoned mechanics
  research facility — anechoic foam wedges on the walls, geophone racks,
  loudspeakers, a monochord instrument, a reel-to-reel tape console.
  Quiet, padded, slightly eerie. The hall has been shut down; nothing is running.
- Cool palette ONLY (use these hex): base #212531, floor tiles #343b4a / #2d3341,
  walls #414b5e / #38414f, structure lines #3d5a80, dark outline #17171a,
  bright screen/glass #e1e9f6, machine body grey #42454d, acoustic foam #3a4152.
  Accent glow (interactive machines only): cyan #4da8ff. Warning red #e63946.
- NO warm colors on furniture/environment. Warm tones are reserved for the human
  character only. (Exception: a few dull amber pilot lights are fine.)
- Crisp pixels, hard dark outline, flat shading with soft light — no photographic blur,
  no anti-aliased fuzz, no gradients-as-texture.
```

## 1. 방 배경 — `room-sonic.png`

[B 사양]

```
A single isometric room interior, viewed from a fixed 2:1 isometric angle,
drawn as one complete illustration (no UI, no characters, no text labels).

The room is a SPACIOUS rectangular acoustic listening hall — noticeably larger
and emptier than a normal lab room. Show the WHOLE room: the floor plane and
the two back walls (north-west and north-east), nothing else.

Along the walls, place equipment that reads as acoustics research:
- walls covered in dark anechoic foam wedge panels (sound-absorbing spikes)
- a rack of geophones (ground-listening sensors) with a stack of chart paper
- TWO identical large loudspeaker cabinets, mounted at two separate points
  high on the walls, angled down toward the open floor
- a small blank nameplate beside the entrance, conspicuously empty
- a corner RECORDING BOOTH in the far south area: a small glass-walled cubicle
  containing a desk, drawn open and visible (not covered)
- one section of wall with slightly mismatched panel seams (subtle, not obvious)

The centre of the floor is CRITICAL: leave a LARGE OPEN EMPTY floor area —
the player walks around the middle of this room as part of a puzzle, and the
machines the player uses will be composited on top later.

Lighting: cold overhead strip lights, long soft shadows on the floor.
The room is powered down — screens dark, no glowing readouts.
```

[C 출력]

```
Output: one PNG image. Fill the frame with the room; put the background outside
the room in pure black (#000000). No border, no caption, no watermark.
```

> 받은 뒤: `node scripts/measure-room.mjs assets-src/gen-src/room-sonic.src.png <N>`
> (⚠ void-fill 전 원본으로) → 락커급 기준 가구로 캐릭터 비율 1.05~1.15 역산 →
> `void-fill.mjs` → relayout-room. 24 근처에서 시작하되 실측이 정한다.

## 2. 퍼즐 장치 4종 + 부속 2종

각 항목은 [A] + 아래 [B] + 공통 [C]로 요청한다. **크기는 쓰지 않는다** —
`prep-gen <targetH>`가 후처리에서 강제한다.

공통 [C 출력]:

```
Output: one PNG image of the single object only, centred, seen from the same 2:1
isometric angle. Background must be FLAT MAGENTA #FF00FF with no checkerboard,
no gradient, no shadow on the background. No text, no caption, no watermark.
Do NOT place the object on a coloured plinth, pad or platform — the object must
stand directly on the magenta background.
```

| 파일 | [B 사양] 요지 |
|---|---|
| `pendulum-dynamo.png` | An emergency generator rig: a tall steel A-frame with a LARGE swinging pendulum bob hanging inside it, connected by a crank to a dynamo with a small dim indicator lamp. Powered down, the pendulum mid-swing. |
| `knock-scope.png` | A vintage portable oscilloscope on a wheeled cart, with a round dark CRT screen, a hand mallet resting on a hook, and a coiled probe cable. Powered down. |
| `monochord.png` | A monochord instrument: a long wooden-and-steel resonance box on legs, with ONE single taut string over a graduated ruler edge, two fixed bridges at the ends. Museum-piece feel, well kept. |
| `sonic-console.png` | A heavy audio master console: a reel-to-reel tape deck on top (empty reels), a row of EIGHT small piano-like keys along the front edge, and a wide dark spectrogram screen. Authoritative, final-station feel. Powered down. |
| `speaker-cab.png` | A single large industrial loudspeaker cabinet on a steel stand, angled slightly downward, with a wire-mesh grille. (배경에 이미 그려져 있어도 별도 스프라이트로 한 장 — 봉인/연출용 재배치에 쓴다.) |
| `floor-hatch.png` | A small square floor access hatch, flush with the ground, with a recessed handle and a thin seam. Almost flat. |

## 3. 아이템 아이콘 — `reel-tape.png`

```
A single reel-to-reel audio tape: one metal reel wound with dark brown magnetic
tape, a short tail of tape hanging loose, a small handwritten label on the hub.
Flat front view, no perspective. ONE single isolated object only, centered,
flat solid magenta background #FF00FF.
```

## 4. 받은 뒤 (내가 진행)

2번 방 §4와 동일 절차: probe-bg → prep-gen(global 48~64부터) → contact-sheet →
방 배경은 measure-room → N 역산 → void-fill → relayout-room → check-layout 0.4.
회차별 경위는 이 문서 §5에 남긴다.

## 5. 납품 경위 (회차별 기록)

- **1차 납품 (2026-08-03)**: 배경 + 장치 6 + 아이템 1, 8종 전부 수령. 품질 우수 —
  재제작 요청은 speaker-cab 1건뿐(그릴이 초고밀도 디더링 메쉬라 96px 축소 시 노이즈
  위험 → "굵은 슬랫 몇 개 + 큰 단색 면, no fine mesh/no dithering"로 재요청, 즉시
  양호본 수령). 교훈: **스피커류 그릴·철망은 요청문에 "coarse/bold, no fine mesh"를
  처음부터 명시할 것.**
- 키잉: 7종 전부 `prep-gen global 48` 한 번에 통과(잔재·구멍 없음). 자홍 받침 없음 —
  §2의 "Do NOT place on plinth" 문구가 일한 것으로 보인다.
- 배경 캘리브레이션: 1024², 바닥 마름모 폭 992px. **N=20 확정** — 기준 가구는 서쪽 벽
  문(아트 ≈150px): N=20에서 문/캐릭터 ≈ 1.19배. 24 요청 → 20 착지(1번 방과 동일 패턴).
- relayout: 아트가 좌표를 정했다 — 부스=동쪽 코너(sealed 이동), 출구 문=서쪽 벽(그림
  속 문 재사용, 스프라이트 없는 door 오브젝트), 지오폰 랙=서벽(blocks), 스피커 2대=
  북동 벽 부착(P3 파원 좌표 (0.7,0.5)·(16.6,0.5), λ=12, 해치 (14.2,12)로 재계산).
  Pollinations 임시 speaker-cab decor는 배경에 그려져 있어 제거.
- **사고 1건**: 납품 파일을 넣으며 2번 방 원본(JPEG, .png 확장자)이 `gen/`의 정상
  산출물 6개를 덮었다(탐색기 복사가 mtime을 보존해 늦게 발견). git checkout으로 복원.
  ⚠ 납품 파일은 **gen-src/에만** 넣을 것 — gen/은 빌드 산출물이다.
- 부스 유리벽 blocks는 시도 후 철회 — 오목 포켓에 축 분리 이동이 갇힌다(플레이어·e2e
  공통). 개방 전 차단은 sealed가 담당, 유리는 통과 허용(thermal 규약).
