/** 빌드된 에셋(public/assets/) 로더 — atlas.json 기반 */

export interface AtlasEntry {
  file: string;
  w: number;
  h: number;
  /** 표시 배율 (픽셀아트 — 정수 스케일, 기본 1) */
  scale?: number;
}

/** 로드된 스프라이트 — gameScale은 atlas의 표시 배율 */
export interface GameSprite extends HTMLImageElement {
  gameScale?: number;
}

export type Sprites = Record<string, GameSprite>;

// base(배포 경로)에 맞춘 상대 URL — vite.config base:"./" 및 서브경로 배포 대응
const BASE = import.meta.env.BASE_URL;
const asset = (p: string) => `${BASE}${p.replace(/^\//, "")}`;

export async function loadSprites(): Promise<Sprites> {
  const atlas: Record<string, AtlasEntry> = await fetch(asset("assets/atlas.json")).then((r) => {
    if (!r.ok) throw new Error("atlas.json 로드 실패 — `npm run assets` 먼저 실행하세요");
    return r.json();
  });

  const sprites: Sprites = {};
  await Promise.all(
    Object.entries(atlas).map(async ([name, entry]) => {
      const img: GameSprite = new Image();
      img.src = asset(entry.file);
      await img.decode();
      if (entry.scale && entry.scale !== 1) img.gameScale = entry.scale;
      sprites[name] = img;
    })
  );
  return sprites;
}
