# CLAUDE.md

교육용 방탈출 저작 키트. Vite + TypeScript, 프레임워크 없음, Canvas 2D 아이소메트릭.
런타임 의존성 0개.

**동봉된 예제는 물리(탄성파와 소리) 방 하나다.** 다른 교과로 갈아탈 때는
`/new-subject` 스킬을 한 번 실행한다. 그 뒤 퍼즐 추가는 `/add-puzzle`.

## 명령어

| 명령 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 (5373) — 직접 띄우지 말고 Browser 도구의 preview_start 사용 |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | 프로덕션 빌드 (`dist/`, base `./`) |
| `npm run story` | docs/story.md → src/data/story-data.ts 재생성 |
| `npm run assets` | assets-src/ SVG → public/assets/ PNG (토큰 치환 포함) |
| `npm run test:e2e` | Playwright 전체 (desktop-chrome + mobile) |
| `bash scripts/verify.sh quick` | story + anchors + layout + typecheck + build (매 작업 후) |
| `bash scripts/verify.sh full` | quick + assets + e2e 2종 (퍼즐 완성 시) |

e2e 부분 실행 — 전체 스위트는 수 분이 걸리므로 평소엔 관련 spec 하나만 돌린다:

```bash
npx playwright test tests/e2e/search.spec.ts --project=desktop-chrome --retries=0
```

- 테스트 하나만: `-g "테스트 이름 일부"`
- 모바일: `--project=mobile` (Pixel 7 — 조이스틱·탭 경로가 데스크톱과 다르므로 입력·UI를
  건드렸으면 두 프로젝트 모두 확인)
- webServer는 5399(`dev:test`)에 `reuseExistingServer: false`. **개발 서버(5373)를 켜 둔 채
  전체 스위트를 돌리면 CPU 경합으로 가짜 flake가 난다** — 전체 검증 전엔 preview_stop.

## 필수 규칙

- **에셋 작업 전** docs/art-style.md를, **퍼즐 기획 전** docs/story.md와
  docs/curriculum-map.md를 반드시 먼저 읽을 것.
- 대사·연구노트 텍스트는 코드에 하드코딩하지 말고 docs/story.md 기반 데이터로 관리.
- 세계관 문자열(타이틀·저장키·엔딩 문구)은 `src/config.ts`에만. 엔진에 다시 흩뿌리지 말 것.
- 모든 에셋은 assets-src/_lib 부품 조합 + design-tokens.json 토큰만 사용.
  신규 부품이나 신규 색이 필요하면 먼저 사용자 승인을 받아 토큰/라이브러리에 등록한 뒤 사용할 것.
  (SVG 내 hex 하드코딩은 PreToolUse 훅이 차단함 — `{{color.이름}}` 플레이스홀더 사용)
- 데코·소품 에셋은 이미지 생성 파이프라인 사용 — 후처리가 팔레트 스냅으로 토큰 색을 강제한다.
  생성물은 반드시 Read로 보고 통과분만 커밋. 규칙은 docs/art-style.md의 "AI 생성 에셋" 절.
- **퍼즐의 교과 범위는 docs/curriculum-map.md가 정한다.** 코드나 프롬프트가 아니다.
  범위 밖 개념은 그 문서의 `exceptions` 표에 사용자 승인과 함께 등재된 것만 허용.
- 성취기준 코드는 **웹으로 확인한 뒤에만** 적는다. 추측 기입 금지.
- 입력은 Pointer Events로 통일 (src/engine/input/) — 퍼즐 코드는 마우스/터치를 구분하지 않는다.
- 퍼즐 추가는 add-puzzle 스킬 절차를 따른다: 설계(puzzle-designer) → 승인 → 에셋(asset-artist)
  → 구현(puzzle-builder) → 교과 검수(`<교과>-reviewer`) → 실플레이(playtester) → 수정 루프.
- DoD: 데스크톱·모바일 두 Playwright 프로젝트에서 e2e 통과.

## 아키텍처 — 여러 파일을 읽어야 보이는 것

### 단일 소스와 파생물

| 단일 소스 | 파생물 (직접 수정 금지) | 재생성 |
|---|---|---|
| `docs/story.md` | `src/data/story-data.ts` | `npm run story` |
| `design-tokens.json` | SVG의 `{{color.*}}`, `:root` CSS 변수 | `npm run assets` / main.ts `applyTokens()` |
| `assets-src/*.svg` | `public/assets/*.png` (커밋 제외) | `npm run assets` |

story.md의 문법이 곧 앵커 계약이다: `### #anchor-id` 다음의 `> ` 인용 줄이 대사 한 건,
`#### note-XX — 제목`(EM DASH 필수)이 연구노트 한 건. 코드·manifest는 이 앵커 문자열로만
텍스트를 참조한다. 새 대사가 필요하면 story.md에 앵커를 추가하고 `npm run story` —
코드에 문자열을 넣지 않는다. 문법 전체는 docs/story.md 상단의 표에 있다.
**앵커 오타는 런타임에 무음이므로** `scripts/check-anchors.mjs`가 verify에서 잡는다.

### 게임 루프와 방 정의

`main.ts`(타이틀·저장 분기) → `Game`(src/engine/core/Game.ts). Game은 캔버스 렌더, 이동,
근접 판정, 오버레이 오케스트레이션을 모두 담당하는 유일한 큰 파일이다.

- 방은 데이터다: `src/maps/<room>.ts`가 `GameMap`을 내보내고 `src/maps/index.ts`가 id로 묶는다.
  `MapObject`의 필드 조합이 상호작용 종류를 결정한다 — `puzzleId`(퍼즐) / `door`(방 이동·엔딩) /
  `noteId`(연구노트) / `search`(수색 지점) / `interactAnchor`(대사). 타입 주석은 maps/types.ts.
- 근접 판정은 `Math.hypot(player − tile) <= range`, 가장 가까운 하나가 `nearObject`.
  `tryInteract()`는 `dialogueOpen || isDialogueBusy() || !nearObject`면 무시한다.
- 방탈출 게이트는 퍼즐 manifest의 `gate` 필드: `code`(키패드) · `keys`(키패드 스킨) ·
  `items`(인벤토리), 그리고 잠김/프롬프트/오답/해금 대사 앵커까지 manifest가 들고
  `Game.tryUnlockGate()`가 처리한다.
- 진행 저장은 `src/engine/core/save.ts` (키는 `src/config.ts`의 `SAVE_KEY`):
  events·notes·items·searched·lastMap·character. 되돌릴 수 없는 진척만 자동 저장.

### 퍼즐 계약

`src/engine/puzzle-host/types.ts`가 전부다. 퍼즐은 엔진 내부를, 엔진은 퍼즐 내부를 모른다 —
`PuzzleModule { manifest, mount(api) → cleanup }`이고 `PuzzleApi`는 `root`·`actions`·`onDrag`·
`say(anchor)`·`solve()`·`fail()`·`exit()`·`tokens`만 노출한다. 해결하면 `manifest.reward.event`가
EventBus로 나가고 Game이 그 이벤트로 문 잠금을 푼다(`reward.itemId`가 있으면 아이템도 지급).
퍼즐 폴더는 `manifest.json + puzzle.ts + puzzle.css + autoplay.ts` 세트이며
`src/registry.ts`에 등록해야 로드된다. e2e는 `autoplay.ts`의 해답 상수를 import해서 푼다 —
**정답을 spec에 다시 적지 않는다.**

### 답이 꼭 숫자일 필요는 없다

`gate.code`는 내부 표현일 뿐이고, 화면에 보이는 것은 `gate.keys[].label`이다.
동봉 예제가 그 실증이다 — `code: "1365"`인데 학생은 건반의 **도·미·라·솔**을 연주한다.
자모·한자·연도·화학기호·사건 이름 전부 같은 자리에 들어간다. `freq`는 선택이다.

### 오버레이·대사 잠금 (깨뜨리면 게임이 멈춘다)

대사·발견·노트·키패드·퍼즐이 모두 DOM 오버레이로 쌓인다. `dialogue.ts`는 "대사 박스가 DOM에서
사라지면 사용자가 넘긴 것과 동일하게 정리"를 MutationObserver로 보장한다. 이 전제가 깨지면
`openBoxes` 카운터가 안 내려가 **이동·상호작용이 영구 잠긴다** (회귀 테스트가 search.spec.ts에 있다).

읽고 닫는 패널(발견·연구노트)은 `src/engine/narrative/overlay.ts`의
`bindOverlayClose(overlay, button, done)`를 쓴다: settle-정확히-한-번 + 스택 최상단만 키 처리 +
`e.repeat` 무시(Space/Enter/E/Esc). 새 오버레이에 자체 닫기 로직을 짜지 말고 이걸 재사용할 것.

### 디버그·테스트 훅

`window.__qe = { player(라이브 참조), map(getter — **맵 id 문자열**), lit, events, notes, items,
searched, seals, goto, warp }` (goto·warp·seals는 `?grid` 전용).
e2e 헬퍼(`tests/e2e/helpers.ts`)의 `enterRoom`·`interact(page, isMobile)`·`moveTo`가 이 훅으로
좌표를 확인하며 이동한다. `__qe.map`이 맵 객체가 아니라는 점에 주의.

## 컨텍스트 절약

- **큰 파일을 통으로 읽지 말 것**: `src/style.css`, `src/engine/core/Game.ts`(~1300줄),
  `docs/story.md`. Grep으로 심볼·클래스명을 찾아 그 구간만 `offset`/`limit`로 읽는다.
- **생성물은 읽지 않는다**: `src/data/story-data.ts`, `public/assets/`, `dist/`, `test-results/`.
  원본(docs/story.md, assets-src/)만 본다.
- 스토리 텍스트는 story.md 전체 대신 앵커로 grep (`### #search-`).
- 넓은 탐색(여러 방·퍼즐 훑기, 실플레이 검증)은 서브에이전트에 위임해 본문 컨텍스트를 아낀다 —
  `playtester`(verify full + 실플레이 리포트), `<교과>-reviewer`(읽기 전용 검수),
  `asset-artist`(에셋 제작·스크린샷 확인).
- 검증은 좁은 것부터: `npm run typecheck` → 관련 spec 1개 → 필요할 때만 `verify.sh full`.

## 자주 걸리는 함정

- **e2e 통과 ≠ 화면 정상.** 실측 사례 셋: SVG 표현 속성 opacity는 CSS에 진다,
  `display:block`은 hidden 속성을 덮는다, Playwright `toContainText`는 hidden 스팬의
  textContent도 매치한다(가시성 주장은 `toBeHidden`으로). 시각 요소를 만졌으면
  임시 캡처 spec으로 스크린샷을 떠서 눈으로 볼 것.
- **e2e 도중 `npm run story` 등 생성 스크립트 금지** — story-data.ts가 바뀌면 dev 서버가
  풀 리로드해 진행 중 테스트가 통째로 죽는다.
- **e2e 판정은 시간 의존 금지** — 홀드·dt 적분은 훅으로 우회. 대사 넘기기는 횟수 고정 루프
  금지, `dismissDialogues` 사용.
- **런타임 `Math.random()` 금지** — 입자·연출은 시드 고정 해시로. 재현되지 않으면 e2e가 흔들린다.
- **좌표를 만졌으면** `node scripts/check-layout.mjs 0.4`. 이 값은 `helpers.ts`의
  `APPROACH_THRESHOLD`와 **반드시 동일**해야 한다.
- **`map:enter:<방 id>` 구독은 `new Game(...)` 전에.** 첫 방에서도 발화하지만
  (`start()` 끝) 그 뒤에 구독하면 첫 방 발화를 놓친다 — 방 수준 연출이 첫 방에서만 죽는다.
- **`GameMap.epilogue`를 안 주면** 엔진 기본 앵커(`#epilogue-open` 등)가 재생된다.
- **`sealed.opensWhen`에 봉인 안쪽 퍼즐을 걸면 영영 못 연다** — 런타임 검사가 없다.
  `sealed.area`는 벽 띠까지 덮어야 스파클이 새지 않는다.
- **퍼즐 모달 높이 예산**: 스크롤러는 `.puzzle-frame`(`width min(760px,100%−24px)`,
  `max-height calc(100%−24px)`). 크롬이 고정으로 먹는 몫 — 제목 44 + 힌트 바 74 +
  프레임 패딩·테두리 34. 남는 `.puzzle-body`는 1280×720에서 534px, Pixel 7에서 653px뿐이다.
- **그리드 트랙엔 `minmax(0,1fr)`** — 맨 `1fr`은 `minmax(auto,1fr)`이라 자식의
  intrinsic width가 트랙 최소값이 된다. 캔버스는 그 값이 `width` 속성(=CW×dpr)이라
  카드가 트랙을 넘고 프레임에 가로 스크롤이 생긴다.
- **레이아웃 실측은 퍼즐 모듈 단독 마운트로** — 방까지 걸어가지 않는다.
  `tests/e2e/puzzle-layout.spec.ts`가 그 harness다.
