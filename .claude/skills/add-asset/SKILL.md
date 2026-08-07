---
name: add-asset
description: 새 게임 에셋(SVG) 추가 표준 절차. 스타일 가이드 확인→부품 조합 제작→
  빌드→나란히 비교 검증 루프.
---
1. **사전 확인**: docs/art-style.md와 design-tokens.json을 읽는다.
   docs/reference/concept.png가 있으면 직접 본다. 필요한 색이 토큰에 없으면
   **작업 중단** → 사용자 승인 후 design-tokens.json에 등록하고 재개.
2. **제작**: asset-artist에 위임. assets-src/_lib/ 부품 조합 + `{{color.이름}}`
   플레이스홀더만 사용 (hex 하드코딩은 훅이 차단).
3. **빌드**: `npm run assets` — 치환 실패(미등록 토큰)가 있으면 빌드가 실패한다.
4. **검증**: tools/asset-viewer.html 스크린샷을 asset-artist가 직접 보고
   3분할 비교(컨셉/신규/기존 승인 에셋). 이질감 있으면 수정 후 재캡처 반복.
5. **골든 세트 누적**: 통과본 스크린샷을 docs/reference/golden/에 저장.
6. **마무리**: 게임 화면에서 실제 사용 위치에 렌더된 모습 확인 후 커밋.
