#!/usr/bin/env node
/**
 * assets-src/**.svg → public/assets/**.png
 * - {{color.이름}} / {{tile.w}} 등 design-tokens.json 플레이스홀더 치환
 * - assets-src/_lib/*.svg 의 <defs> 내용을 각 SVG에 주입 (프리미티브 재사용)
 * - 치환되지 않은 {{ }} 가 남으면 빌드 실패 (미등록 토큰 조기 발견)
 * - assets-src/gen/*.png (AI 생성·후처리 완료본, scripts/gen-asset.mjs)은 그대로 패스스루
 *   (gen-src/는 원본 보관용 — 배포 산출물 아님)
 * - public/assets/atlas.json 에 산출물 목록(크기 포함) 기록
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(root, "assets-src");
const OUT = join(root, "public", "assets");

const tokens = JSON.parse(readFileSync(join(root, "design-tokens.json"), "utf8"));

function lookup(path) {
  return path.split(".").reduce((v, k) => (v == null ? v : v[k]), tokens);
}

function substitute(svg, file) {
  const out = svg.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, path) => {
    const v = lookup(path);
    if (v == null) throw new Error(`${file}: 미등록 토큰 {{${path}}} — design-tokens.json에 없음`);
    return String(v);
  });
  const leftover = out.match(/\{\{[^}]*\}\}/);
  if (leftover) throw new Error(`${file}: 치환 실패 플레이스홀더 ${leftover[0]}`);
  return out;
}

function* walk(dir, ext = ".svg") {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p, ext);
    else if (name.endsWith(ext)) yield p;
  }
}

/** PNG IHDR에서 크기 읽기 (시그니처 8B + 청크길이4 + "IHDR"4 → width/height 각 4B BE) */
function pngSize(buf) {
  if (buf.length < 24 || buf.readUInt32BE(12) !== 0x49484452) {
    throw new Error("유효한 PNG가 아님");
  }
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

async function main() {
  let files = [];
  try {
    files = [...walk(SRC)];
  } catch {
    console.log("assets-src/ 없음 — 빌드할 에셋이 아직 없습니다 (1단계에서 생성 예정)");
    return;
  }

  // _lib 부품을 id → 요소 문자열 맵으로 수집 (에셋이 실제 참조하는 부품만 주입)
  const libParts = new Map();
  // 여는 태그 안([^>]*)에서 셀프클로징 여부를 판정 — 자식의 "/>"에 조기 매칭되지 않도록.
  // 제약: _lib 부품 안에 같은 태그명을 중첩하지 말 것 (예: g 안의 g).
  const PART_RE = /<(path|rect|circle|ellipse|filter|g|linearGradient|radialGradient)\b[^>]*\bid="([^"]+)"[^>]*(?:\/>|>[\s\S]*?<\/\1>)/g;
  for (const f of files.filter((f) => relative(SRC, f).replace(/\\/g, "/").startsWith("_lib/"))) {
    const body = substitute(readFileSync(f, "utf8"), f);
    for (const m of body.matchAll(PART_RE)) libParts.set(m[2], m[0]);
  }

  const assets = files.filter((f) => !relative(SRC, f).replace(/\\/g, "/").startsWith("_lib/"));
  if (assets.length === 0) {
    console.log("에셋 SVG 0건 (assets-src/_lib 부품만 존재) — 산출물 없음");
    return;
  }

  const { Resvg } = await import("@resvg/resvg-js");
  mkdirSync(OUT, { recursive: true });
  const atlas = {};

  // 표시 배율 표 (assets-src/asset-scale.json: {이름: 배율}) — SVG·gen·pix 공통.
  // 캐릭터(ext-char)는 meta.json으로 따로 관리한다. 기준표는 docs/art-style.md.
  let displayScale = {};
  try {
    displayScale = JSON.parse(readFileSync(join(SRC, "asset-scale.json"), "utf8"));
  } catch {
    /* 없으면 전부 배율 1 */
  }
  const scaleOf = (name) => {
    const s = displayScale[name] ?? 1;
    return s !== 1 ? { scale: s } : {};
  };

  for (const file of assets) {
    let svg = substitute(readFileSync(file, "utf8"), file);
    // url(#id) / href="#id" 로 참조된 _lib 부품만 <defs>로 주입
    const refs = new Set(
      [...svg.matchAll(/url\(#([\w-]+)\)|href="#([\w-]+)"/g)].map((m) => m[1] ?? m[2])
    );
    const needed = [...refs].filter((id) => libParts.has(id));
    if (needed.length > 0) {
      const defs = needed.map((id) => libParts.get(id)).join("\n");
      svg = svg.replace(/(<svg[^>]*>)/, `$1\n<defs>${defs}</defs>`);
    }
    const png = new Resvg(svg).render();
    const name = basename(file, ".svg");
    const outPath = join(OUT, `${name}.png`);
    writeFileSync(outPath, png.asPng());
    atlas[name] = { file: `assets/${name}.png`, w: png.width, h: png.height, ...scaleOf(name) };
    console.log(`  ${relative(root, file)} → ${relative(root, outPath)} (${png.width}×${png.height})`);
  }

  // 외부 제작 캐릭터 (assets-src/ext-char/*.png + meta.json) — .pix 캐릭터보다 우선
  const EXT = join(SRC, "ext-char");
  let extCount = 0;
  if (statSync(EXT, { throwIfNoEntry: false })?.isDirectory()) {
    let extScale = 1;
    try {
      extScale = JSON.parse(readFileSync(join(EXT, "meta.json"), "utf8")).scale ?? 1;
    } catch {
      /* meta 없으면 scale 1 */
    }
    for (const file of walk(EXT, ".png")) {
      const buf = readFileSync(file);
      const { w, h } = pngSize(buf);
      const name = basename(file, ".png");
      writeFileSync(join(OUT, `${name}.png`), buf);
      atlas[name] = { file: `assets/${name}.png`, w, h, ...(extScale !== 1 && { scale: extScale }) };
      extCount++;
    }
    if (extCount) console.log(`  ext-char: ${extCount}개 (scale ×${extScale})`);
  }

  // .pix 텍스트 그리드 픽셀아트 (assets-src/**/*.pix)
  // 형식: "= size W H" / "= scale N" / "= legend"(문자 color.토큰 [알파]) / "= grid"
  //       또는 "= mirror <원본이름>" (좌우 반전 파생 프레임)
  const pixFiles = [...walk(SRC, ".pix")];
  const pixParsed = new Map(); // name → {size, scale, legend, rows} | {mirror}
  for (const file of pixFiles) {
    const name = basename(file, ".pix");
    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    const p = { size: null, scale: 1, legend: new Map(), rows: [], mirror: null, file };
    let mode = "";
    for (const line of lines) {
      const t = line.replace(/\s+$/, "");
      if (t.startsWith("= ")) {
        const [, kw, ...rest] = t.split(/\s+/);
        if (kw === "size") p.size = [Number(rest[0]), Number(rest[1])];
        else if (kw === "scale") p.scale = Number(rest[0]);
        else if (kw === "mirror") p.mirror = rest[0];
        else mode = kw; // legend | grid
        continue;
      }
      if (t === "" || t.startsWith("#")) continue;
      if (mode === "legend") {
        const [ch, token, alpha] = t.split(/\s+/);
        if (token === "transparent") p.legend.set(ch, null);
        else {
          const v = lookup(token);
          if (v == null) throw new Error(`${file}: 미등록 토큰 ${token}`);
          p.legend.set(ch, { color: v, alpha: alpha ? Number(alpha) : 1 });
        }
      } else if (mode === "grid") {
        p.rows.push(line.replace(/\r$/, ""));
      }
    }
    pixParsed.set(name, p);
  }

  let pixCount = 0;
  if (pixParsed.size > 0) {
    const { Resvg } = await import("@resvg/resvg-js");
    for (const [name, p0] of pixParsed) {
      let p = p0;
      let flip = false;
      if (p.mirror) {
        const src = pixParsed.get(p.mirror);
        if (!src || src.mirror) throw new Error(`${p.file}: mirror 원본 없음/중첩: ${p.mirror}`);
        p = { ...src, scale: p0.scale !== 1 ? p0.scale : src.scale };
        flip = true;
      }
      if (!p.size) throw new Error(`${name}.pix: "= size W H" 누락`);
      const [gw, gh] = p.size;
      const rects = [];
      for (let y = 0; y < Math.min(gh, p.rows.length); y++) {
        const row = p.rows[y];
        for (let x = 0; x < gw; ) {
          const ch = row[x] ?? ".";
          const cell = p.legend.get(ch);
          if (cell === undefined && ch !== ".") throw new Error(`${name}.pix ${y}행: legend에 없는 문자 '${ch}'`);
          if (!cell) {
            x++;
            continue;
          }
          let x2 = x + 1;
          while (x2 < gw && (row[x2] ?? ".") === ch) x2++;
          const rx = flip ? gw - x2 : x;
          rects.push(
            `<rect x="${rx}" y="${y}" width="${x2 - x}" height="1" fill="${cell.color}"${cell.alpha < 1 ? ` opacity="${cell.alpha}"` : ""}/>`
          );
          x = x2;
        }
      }
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${gw}" height="${gh}" shape-rendering="crispEdges">${rects.join("")}</svg>`;
      const png = new Resvg(svg).render();
      if (atlas[name]) {
        console.log(`  (${name}.pix 스킵 — ext-char가 대체)`);
        continue;
      }
      writeFileSync(join(OUT, `${name}.png`), png.asPng());
      atlas[name] = { file: `assets/${name}.png`, w: gw, h: gh, ...(p.scale !== 1 && { scale: p.scale }) };
      pixCount++;
    }
    console.log(`  pix 그리드: ${pixCount}개`);
  }

  // 프리렌더 방 배경 패스스루 (assets-src/rooms/*.png — 무가공)
  const ROOMS = join(SRC, "rooms");
  if (statSync(ROOMS, { throwIfNoEntry: false })?.isDirectory()) {
    let n = 0;
    for (const file of walk(ROOMS, ".png")) {
      const buf = readFileSync(file);
      const { w, h } = pngSize(buf);
      const name = basename(file, ".png");
      if (atlas[name]) throw new Error(`에셋 이름 충돌: ${name}`);
      writeFileSync(join(OUT, `${name}.png`), buf);
      atlas[name] = { file: `assets/${name}.png`, w, h };
      n++;
    }
    if (n) console.log(`  rooms 배경: ${n}개`);
  }

  // AI 생성 에셋 패스스루 (assets-src/gen/*.png) — 표시 배율은 asset-scale.json
  const GEN = join(SRC, "gen");
  let genCount = 0;
  if (statSync(GEN, { throwIfNoEntry: false })?.isDirectory()) {
    for (const file of walk(GEN, ".png")) {
      const buf = readFileSync(file);
      const { w, h } = pngSize(buf);
      const name = basename(file, ".png");
      if (atlas[name]) throw new Error(`에셋 이름 충돌: ${name} (SVG와 gen PNG 양쪽에 존재)`);
      writeFileSync(join(OUT, `${name}.png`), buf);
      atlas[name] = { file: `assets/${name}.png`, w, h, ...scaleOf(name) };
      genCount++;
    }
    const scaled = Object.keys(displayScale).length;
    if (genCount) console.log(`  gen/ 패스스루: ${genCount}개 (배율 지정 ${scaled}개)`);
  }

  writeFileSync(join(OUT, "atlas.json"), JSON.stringify(atlas, null, 2));
  console.log(`완료: SVG ${assets.length} + gen ${genCount}개 에셋, atlas.json 갱신`);
}

main().catch((e) => {
  console.error(`에셋 빌드 실패: ${e.message}`);
  process.exit(1);
});
