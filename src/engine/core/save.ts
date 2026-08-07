/**
 * 진행 상황 저장 — 해금된 진행 이벤트 + 수집한 연구노트를 localStorage에 보존.
 * 퍼즐 해결(reward)과 노트 열람은 되돌릴 수 없는 진척이므로 자동 저장한다.
 * 저장 실패(프라이빗 모드 등)는 조용히 무시 — 게임은 인메모리로 계속 동작.
 */
import { SAVE_KEY as KEY } from "../../config";

export interface SaveData {
  events: string[];
  notes: string[];
  /** 수색으로 획득한 단서 아이템 id */
  items?: string[];
  /** 이미 수색한 지점 id (스파클 마커·재수색 안내 판정) */
  searched?: string[];
  /** 마지막으로 있던 방 (이어하기 시작 지점) */
  lastMap?: string;
  /** 선택한 캐릭터 (남/여) */
  character?: "m" | "f";
}

export function loadProgress(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { events: [], notes: [] };
    const data = JSON.parse(raw) as Partial<SaveData>;
    return {
      events: Array.isArray(data.events) ? data.events : [],
      notes: Array.isArray(data.notes) ? data.notes : [],
      items: Array.isArray(data.items) ? data.items : [],
      searched: Array.isArray(data.searched) ? data.searched : [],
      lastMap: typeof data.lastMap === "string" ? data.lastMap : undefined,
      character: data.character === "f" ? "f" : data.character === "m" ? "m" : undefined,
    };
  } catch {
    return { events: [], notes: [] };
  }
}

/** 저장된 진행이 있는가 (이어하기 노출 판정) */
export function hasProgress(): boolean {
  const p = loadProgress();
  return p.events.length > 0 || p.notes.length > 0;
}

export function saveProgress(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* 저장 불가 환경 — 무시 */
  }
}

export function clearProgress(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* 무시 */
  }
}
