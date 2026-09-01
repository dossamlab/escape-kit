#!/usr/bin/env bash
# 검증 스크립트
#   quick: typecheck + build          (매 작업 후)
#   full : quick + assets + e2e 2종   (퍼즐 완성 시 — desktop-chrome + mobile)
set -euo pipefail
cd "$(dirname "$0")/.."

MODE="${1:-quick}"

echo "── story (story.md → data) ────────"
npm run --silent story

echo "── anchors (대사 앵커 참조) ────────"
node scripts/check-anchors.mjs

echo "── layout (간격·근접 판정) ─────────"
node scripts/check-layout.mjs 0.4

echo "── reach (걸어서 닿는가) ───────────"
node scripts/check-reach.mjs

echo "── typecheck ──────────────────────"
npm run --silent typecheck

echo "── build ──────────────────────────"
npm run --silent build

if [ "$MODE" = "full" ]; then
  echo "── assets ─────────────────────────"
  npm run --silent assets

  echo "── e2e (desktop + mobile) ─────────"
  npx playwright test
fi

echo ""
echo "✔ verify ${MODE} 통과"
