#!/usr/bin/env node
/**
 * 무료 AI 이미지 생성(Pollinations — 키·비용 없음)으로 게임 에셋을 뽑는 파이프라인.
 * (무료 이미지 생성 MCP들이 감싸는 것과 동일한 백엔드를 직접 호출)
 *
 * 절차: 프롬프트 생성 → 원본 저장(assets-src/gen-src/) → 후처리 → assets-src/gen/<name>.png
 * 후처리(Playwright Chromium 캔버스):
 *   1) 모서리 색 기준 크로마키로 배경 제거 (프롬프트가 마젠타 단색 배경을 강제)
 *   2) 내용물 바운딩 박스로 크롭
 *   3) 목표 크기로 스무딩 없이 다운스케일 → 8비트 픽셀 모자이크화
 *   4) design-tokens.json 팔레트로 색 스냅 → 전 에셋 통일감 강제 (팔레트 가드의 생성판)
 *
 * 사용:
 *   node scripts/gen-asset.mjs <name> "<설명(영어)>" [--w 96] [--h 96] [--seed 7] [--no-snap] [--flat]
 *   node scripts/gen-asset.mjs --batch scripts/asset-batch.json
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const RAW_DIR = join(root, "assets-src", "gen-src");
const OUT_DIR = join(root, "assets-src", "gen");

const tokens = JSON.parse(readFileSync(join(root, "design-tokens.json"), "utf8"));
const PALETTE = Object.values(tokens.color);

// 공통 금지 문구 — 오브젝트가 자기 받침대/바닥을 달고 나오면 게임에서 공중 디오라마처럼 보인다
const ISOLATION =
  "ONE single isolated object only, standing directly, no base, no platform, no pedestal, " +
  "no floor tile, no room, no walls, no ground, no scene, no shadow, no text, " +
  "centered composition, flat solid magenta background #FF00FF";

const STYLES = {
  // 데코 가구·소품: 현실적이되 차가운 실험실 풍 — 스틸·화이트·쿨그레이, 형광등 조명감
  decor:
    "isometric pixel art game sprite of DESC, clean 16-bit pixel art, realistic " +
    "laboratory furniture, cold clinical color palette (white, cool grey, steel, " +
    "gunmetal, pale blue tint), fluorescent lighting feel, simple readable silhouette, " +
    "2:1 isometric perspective, " +
    ISOLATION,
  // 벽걸이: 정면 평면 아트 — 엔진이 벽 기울기로 셰어 부착하므로 원근 없이 평평하게
  wall:
    "pixel art of DESC, clean 16-bit pixel art, flat front view, no perspective, " +
    "cold laboratory style, cool grey and steel tones, simple readable shapes, " +
    "ONE single isolated object only, no wall, no room, no scene, no shadow, " +
    "centered, flat solid magenta background #FF00FF",
  // 퍼즐 장치: 은은한 발광 유지 — '상호작용 가능'의 시각 신호
  device:
    "isometric pixel art game sprite of DESC, retro 16-bit style, physics laboratory " +
    "device, dark metal body with subtle cyan glow accents, simple readable silhouette, " +
    "2:1 isometric perspective, " +
    ISOLATION,
};

function buildUrl(desc, seed, style) {
  const prompt = (STYLES[style] ?? STYLES.decor).replace("DESC", desc);
  const params = new URLSearchParams({
    width: "512",
    height: "512",
    seed: String(seed),
    nologo: "true",
    model: "flux",
  });
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${params}`;
}

async function fetchImage(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(90_000) });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 1000) return buf;
      }
      console.warn(`  재시도 ${i + 1}/${tries} (HTTP ${res.status})`);
    } catch (e) {
      console.warn(`  재시도 ${i + 1}/${tries} (${e.message})`);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error("이미지 생성 실패 — 네트워크/서비스 상태 확인");
}

/** Playwright Chromium 캔버스로 후처리 (신규 의존성 없이 픽셀 조작) */
async function postProcess(rawPng, { w, h, snap, flat }) {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const dataUrl = `data:image/png;base64,${rawPng.toString("base64")}`;

  const outB64 = await page.evaluate(
    async ({ src, targetW, targetH, palette, snap, flat }) => {
      const img = new Image();
      img.src = src;
      await img.decode();

      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const im = ctx.getImageData(0, 0, c.width, c.height);
      const d = im.data;
      const W = c.width;
      const H = c.height;

      // ── 1) 배경 제거: 가장자리 연결 플러드필 (모서리 색 기준) ──
      // 전역 색거리 키잉은 배경과 색이 비슷한 "스프라이트 내부" 픽셀까지 뚫어
      // 벌레먹은 구멍을 만든다 — 가장자리에서 이어진 배경만 지운다.
      const corners = [0, (W - 1) * 4, (H - 1) * W * 4, ((H - 1) * W + W - 1) * 4];
      let br = 0, bg = 0, bb = 0;
      for (const o of corners) {
        br += d[o];
        bg += d[o + 1];
        bb += d[o + 2];
      }
      br /= 4; bg /= 4; bb /= 4;
      const KEY_T = 70; // 배경 색거리 문턱
      const isBgColor = (i) => {
        const dist = Math.hypot(d[i] - br, d[i + 1] - bg, d[i + 2] - bb);
        const magenta = Math.hypot(d[i] - 255, d[i + 1] - 0, d[i + 2] - 255);
        return dist < KEY_T || magenta < 120;
      };
      // 마젠타는 프롬프트가 강제한 배경색 — 스프라이트에 정당하게 존재할 수 없으므로
      // 밀폐 포켓 포함 전역 제거
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] > 0 && Math.hypot(d[i] - 255, d[i + 1] - 0, d[i + 2] - 255) < 120) d[i + 3] = 0;
      }
      {
        const visited = new Uint8Array(W * H);
        const stack = [];
        for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x);
        for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1);
        while (stack.length) {
          const p = stack.pop();
          if (visited[p]) continue;
          visited[p] = 1;
          const i = p * 4;
          if (d[i + 3] === 0 || !isBgColor(i)) continue;
          d[i + 3] = 0;
          const x = p % W;
          const y = (p / W) | 0;
          if (x > 0) stack.push(p - 1);
          if (x < W - 1) stack.push(p + 1);
          if (y > 0) stack.push(p - W);
          if (y < H - 1) stack.push(p + W);
        }
        // 디프린지: 투명과 맞닿은 배경 유사색 헤일로 2회 침식
        for (let pass = 0; pass < 2; pass++) {
          const clear = [];
          for (let y = 0; y < H; y++)
            for (let x = 0; x < W; x++) {
              const i = (y * W + x) * 4;
              if (d[i + 3] === 0 || !isBgColor(i)) continue;
              if (
                (x > 0 && d[i - 4 + 3] === 0) ||
                (x < W - 1 && d[i + 4 + 3] === 0) ||
                (y > 0 && d[i - W * 4 + 3] === 0) ||
                (y < H - 1 && d[i + W * 4 + 3] === 0)
              )
                clear.push(i);
            }
          for (const i of clear) d[i + 3] = 0;
          if (clear.length === 0) break;
        }
      }

      // ── 2) 내용 바운딩 박스 크롭 ──
      let minX = W, minY = H, maxX = 0, maxY = 0;
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++)
          if (d[(y * W + x) * 4 + 3] > 40) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
      if (maxX <= minX || maxY <= minY) return null; // 전부 지워짐 = 생성 실패
      ctx.putImageData(im, 0, 0);
      const cw = maxX - minX + 1;
      const ch = maxY - minY + 1;

      // ── 3) 픽셀화 다운스케일 (비율 유지, 스무딩 없이) ──
      const scale = Math.min(targetW / cw, targetH / ch);
      const ow = Math.max(1, Math.round(cw * scale));
      const oh = Math.max(1, Math.round(ch * scale));
      const out = document.createElement("canvas");
      out.width = ow;
      out.height = oh;
      const octx = out.getContext("2d", { willReadFrequently: true });
      octx.imageSmoothingEnabled = false;
      octx.drawImage(c, minX, minY, cw, ch, 0, 0, ow, oh);

      // ── 4) 팔레트 스냅 (+ 알파 이진화) ──
      const oim = octx.getImageData(0, 0, ow, oh);
      const od = oim.data;
      const pal = palette.map((hex) => [
        parseInt(hex.slice(1, 3), 16),
        parseInt(hex.slice(3, 5), 16),
        parseInt(hex.slice(5, 7), 16),
      ]);
      for (let i = 0; i < od.length; i += 4) {
        if (od[i + 3] < 110) {
          od[i + 3] = 0;
          continue;
        }
        od[i + 3] = flat ? 210 : 255; // flat(얼룩류)은 반투명으로 바닥에 스며들게
        if (!snap) continue;
        let best = 0;
        let bestD = Infinity;
        for (let p = 0; p < pal.length; p++) {
          const dr = od[i] - pal[p][0];
          const dg = od[i + 1] - pal[p][1];
          const db = od[i + 2] - pal[p][2];
          const dist = dr * dr + dg * dg + db * db;
          if (dist < bestD) {
            bestD = dist;
            best = p;
          }
        }
        od[i] = pal[best][0];
        od[i + 1] = pal[best][1];
        od[i + 2] = pal[best][2];
      }
      octx.putImageData(oim, 0, 0);
      return out.toDataURL("image/png").split(",")[1];
    },
    { src: dataUrl, targetW: w, targetH: h, palette: PALETTE, snap, flat }
  );

  await browser.close();
  if (!outB64) throw new Error("후처리 실패 — 배경 키잉 후 내용이 남지 않음 (다른 seed로 재시도)");
  return Buffer.from(outB64, "base64");
}

// 팔레트 스냅은 기본 해제 — 게임 팔레트가 암색 위주라 하드 스냅 시 중간톤이 탁해지고
// 인접 픽셀이 먼 토큰으로 튀며 노이즈가 생긴다. 톤 통일은 프롬프트(다크블루 랩 테마)가 담당.
async function generateOne({ name, desc, w = 96, h = 96, seed = 1, snap = false, flat = false, style = "decor" }) {
  console.log(`▶ ${name}: "${desc}" (${w}×${h}, seed=${seed}, ${style})`);
  mkdirSync(RAW_DIR, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const rawPath = join(RAW_DIR, `${name}.png`);
  let raw;
  if (existsSync(rawPath) && process.env.REGEN !== "1") {
    raw = readFileSync(rawPath); // 원본 캐시 재사용 (REGEN=1로 강제 재생성)
    console.log("  원본 캐시 사용");
  } else {
    raw = await fetchImage(buildUrl(desc, seed, style));
    writeFileSync(rawPath, raw);
    console.log(`  원본 저장 (${(raw.length / 1024).toFixed(0)}KB)`);
  }

  const processed = await postProcess(raw, { w, h, snap, flat });
  writeFileSync(join(OUT_DIR, `${name}.png`), processed);
  console.log(`  ✔ assets-src/gen/${name}.png`);
}

// ── CLI ──────────────────────────────────────
const args = process.argv.slice(2);
if (args[0] === "--batch") {
  const list = JSON.parse(readFileSync(args[1], "utf8"));
  for (const item of list) {
    try {
      await generateOne(item);
    } catch (e) {
      console.error(`  ✘ ${item.name}: ${e.message}`);
    }
  }
} else {
  const [name, desc] = args;
  if (!name || !desc) {
    console.log('사용: node scripts/gen-asset.mjs <name> "<desc>" [--w N] [--h N] [--seed N] [--no-snap] [--flat]');
    process.exit(1);
  }
  const opt = (flag, dflt) => {
    const i = args.indexOf(flag);
    return i >= 0 ? Number(args[i + 1]) : dflt;
  };
  await generateOne({
    name,
    desc,
    w: opt("--w", 96),
    h: opt("--h", 96),
    seed: opt("--seed", 1),
    snap: args.includes("--snap"),
    flat: args.includes("--flat"),
  });
}
