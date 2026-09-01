/**
 * 내러티브 표시 시스템 — 라플라스 대사·연구노트 오버레이.
 * 텍스트 원문은 docs/story.md가 단일 소스이며, 빌드된 데이터(src/data/story-data.ts)를
 * 소비한다. 이 모듈에 대사를 하드코딩하지 않는다.
 */
import { storyData, type StoryEntry } from "../../data/story-data";
import { Sfx } from "../audio/sfx";
import { setInline } from "./markup";

/** story.md 앵커로 엔트리 조회. `story.md#foo` · `#foo` · `foo` 셋 다 같은 키로 본다 */
export function getEntry(anchor: string): StoryEntry | undefined {
  const key = anchor.replace(/^story\.md/, "").replace(/^#/, "");
  return storyData[key];
}

// ── 대사 직렬화 큐 ────────────────────────────
// 스토리 진행(main)·상호작용(Game)·퍼즐(say)이 각자 대사를 띄우면 박스가 겹친다.
// 모든 대사를 하나의 큐로 직렬화해 "화면에는 항상 한 박스만" 보장한다.
let queueTail: Promise<void> = Promise.resolve();
let openBoxes = 0;

/** 대사 박스가 떠 있는가 — 이동·상호작용 잠금 판정용 */
export function isDialogueBusy(): boolean {
  return openBoxes > 0;
}

/** 홀로그램 스타일 대사 박스를 표시하고, 사용자가 넘길 때 resolve (전역 큐로 직렬화) */
export function showDialogue(anchor: string, host: HTMLElement): Promise<void> {
  const run = queueTail.then(() => showDialogueNow(anchor, host));
  queueTail = run.catch(() => {});
  return run;
}

function showDialogueNow(anchor: string, host: HTMLElement): Promise<void> {
  const entry = getEntry(anchor);
  if (!entry) {
    console.warn(`[narrative] 스토리 앵커 없음: ${anchor}`);
    return Promise.resolve();
  }
  // 호스트가 이미 화면에서 제거됐으면(닫힌 퍼즐 오버레이 등) 표시 생략
  if (!host.isConnected) return Promise.resolve();

  openBoxes++;
  return new Promise((resolve) => {
    let settled = false;
    const box = document.createElement("div");
    box.className = "dialogue-box";
    box.dataset.testid = "dialogue-box";

    const speaker = document.createElement("div");
    speaker.className = "dialogue-speaker";
    speaker.textContent = entry.speaker ?? "";

    const text = document.createElement("p");
    text.className = "dialogue-text";
    setInline(text, entry.text);

    const hint = document.createElement("div");
    hint.className = "dialogue-hint";
    hint.textContent = "▼ 계속";

    box.append(speaker, text, hint);
    host.appendChild(box);

    // 정리는 단 한 번 — 사용자가 넘겼든, 호스트 오버레이가 통째로 사라졌든.
    // (키패드를 ✕로 닫으면 그 안의 대사 박스도 함께 제거되는데, 그때 정리를
    //  놓치면 openBoxes가 영영 0으로 안 돌아와 이동·상호작용이 잠긴다)
    const settle = () => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      window.removeEventListener("keydown", onKey);
      box.remove();
      openBoxes--;
      resolve();
    };
    const advance = () => {
      if (settled) return;
      Sfx.select();
      settle();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "Enter" || e.code === "KeyE") {
        // preventDefault 없으면 브라우저 기본 동작이 포커스된 버튼(마지막으로 클릭한
        // 퍼즐 버튼 등)을 다시 눌러, 대사를 넘길 때마다 유령 클릭이 난다
        e.preventDefault();
        advance();
      }
    };
    const observer = new MutationObserver(() => {
      if (!box.isConnected) settle();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    box.addEventListener("pointerup", advance);
    window.addEventListener("keydown", onKey);
  });
}
