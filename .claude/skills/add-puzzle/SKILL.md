---
name: add-puzzle
description: 새 퍼즐 추가 표준 절차. 설계→승인→에셋→구현→교과 검수→
  실플레이(PC+모바일) 검증→수정 루프.
---
1. **설계**: puzzle-designer에 위임해 설계서 작성 → 사용자에게 보여주고 승인.
   기존 구상 평가 요청이면 대안 포함 리포트 후 사용자가 선택.
2. **에셋**: 설계서의 필요 에셋 목록을 asset-artist에 위임 (스타일 가이드 준수 확인 포함).
3. **구현**: puzzle-builder에 위임 (manifest/puzzle/spec/autoplay 4파일 세트,
   manifest에 curriculum·narrative 필드 필수).
4. **교과 검수**: `<교과>-reviewer` 에이전트에 위임 (`/new-subject`가 만들어 둔 것.
   없으면 동봉 예제의 physics-reviewer가 형식 본보기다). 수정필요 시 3으로.
5. **실플레이**: `bash scripts/verify.sh full` (desktop+mobile 프로젝트) 후 playtester.
6. **수정 루프**: BLOCKER/BUG 0건까지 3~5 반복. POLISH는 사용자에게 목록 보고.
7. **스토리 반영**: docs/story.md에 대사·연구노트 앵커 추가 → `npm run story`.
   앵커 오타는 `scripts/check-anchors.mjs`(verify에 편입됨)가 잡는다.
8. **마무리**: git 커밋, `npm run dev` 주소 안내 + PC/폰 양쪽 직접 확인 요청.
