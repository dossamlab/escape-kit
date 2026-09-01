/**
 * 4자리 키패드 오버레이 — 코드형 게이트(퍼즐 보안 잠금) 입력 UI.
 * 정답이면 true, 닫기면 false로 resolve. 오답은 표시만 하고 계속 입력 가능.
 * 안내문·오답 반응 텍스트는 story.md 앵커에서 온다 (하드코딩 금지).
 */
import { getEntry, showDialogue, isDialogueBusy } from "../narrative/dialogue";
import { Sfx, audioCtx, isMuted } from "../audio/sfx";
import { setInline } from "../narrative/markup";

export interface KeypadKey {
  /** code의 한 글자에 대응하는 값 */
  value: string;
  /** 키에 표시되는 이름 — 음이름·자모·한자·기호·연도 등 무엇이든 */
  label: string;
  /** 누를 때 재생할 음(Hz). **선택 사항** — 없으면 일반 클릭음이 나고 높이 막대도 안 그린다.
   *  소리로 답을 기억시키는 퍼즐에서만 쓴다 */
  freq?: number;
}

export interface KeypadOptions {
  /** 정답 코드 (예: "6563") */
  code: string;
  /** 키패드 상단 안내문 앵커 (#gate-*-prompt) */
  promptAnchor?: string;
  /** 첫 오답 시 라플라스 반응 앵커 (#gate-*-wrong) — 한 번만 대사, 이후엔 표시만 */
  wrongAnchor?: string;
  /** 키 스킨 — 지정 시 숫자 그리드 대신 이 키들을 한 줄로 그린다.
   *  코드의 도메인을 숫자 밖으로 여는 장치다(음이름·자모·한자·기호…).
   *  freq가 있으면 누를 때 그 음이 울리고 높이 막대가 음높이를 시각으로도 보여 준다(무음 백업) */
  keys?: KeypadKey[];
}

/** 건반 톤 재생 — 짧은 사인 톤 (ZzFX 프리셋과 달리 정확한 음높이가 필요하다) */
function playTone(freq: number): void {
  if (isMuted()) return;
  const ac = audioCtx();
  if (!ac) return;
  if (ac.state === "suspended") void ac.resume();
  const osc = ac.createOscillator();
  osc.type = "sine";
  osc.frequency.value = freq;
  const gain = ac.createGain();
  const t = ac.currentTime;
  gain.gain.setValueAtTime(0.001, t);
  gain.gain.exponentialRampToValueAtTime(0.28, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(t);
  osc.stop(t + 0.6);
}

export function openKeypad(opts: KeypadOptions, host: HTMLElement): Promise<boolean> {
  return new Promise((resolve) => {
    let input = "";
    let saidWrong = false;

    const overlay = document.createElement("div");
    overlay.className = "keypad-overlay";
    overlay.dataset.testid = "keypad";

    const panel = document.createElement("div");
    panel.className = "keypad-panel";

    const prompt = document.createElement("div");
    prompt.className = "keypad-prompt";
    setInline(prompt, opts.promptAnchor ? (getEntry(opts.promptAnchor)?.text ?? "") : "");

    const display = document.createElement("div");
    display.className = "keypad-display";
    display.dataset.testid = "keypad-display";

    // 건반 스킨: 입력값을 숫자 대신 음이름 라벨로 표시
    const labelOf = (v: string) => opts.keys?.find((k) => k.value === v)?.label ?? v;
    const sync = () => {
      display.textContent = input
        .padEnd(opts.code.length, "·")
        .split("")
        .map((c) => (c === "·" ? "·" : labelOf(c)))
        .join(" ");
    };
    sync();

    const pressDigit = (d: string): void => {
      if (input.length >= opts.code.length) return;
      const key = opts.keys?.find((k) => k.value === d);
      if (key?.freq !== undefined) playTone(key.freq);
      else Sfx.select();
      input += d;
      sync();
    };
    const clearAll = (): void => {
      input = "";
      display.classList.remove("wrong");
      sync();
    };
    const backspace = (): void => {
      input = input.slice(0, -1);
      display.classList.remove("wrong");
      sync();
    };

    /** 키 스킨에서만 쓰는 확인·지우기 행 (숫자 그리드는 격자 안에 들어 있다) */
    let extraRow: HTMLElement | undefined;

    const grid = document.createElement("div");
    if (opts.keys) {
      // 키 스킨 — 한 줄 배치. freq를 준 키들만 음높이 비례 막대를 얹는다(무음 환경 백업).
      grid.className = "keypad-grid keypad-keyboard";
      const freqs = opts.keys.map((k) => k.freq).filter((f): f is number => f !== undefined);
      const minF = Math.min(...freqs);
      const maxF = Math.max(...freqs);
      for (const key of opts.keys) {
        const btn = document.createElement("button");
        btn.className = "keypad-key keypad-note";
        btn.dataset.testid = `key-${key.value}`;
        if (key.freq !== undefined) {
          const bar = document.createElement("span");
          bar.className = "keypad-note-bar";
          const t = maxF > minF ? (key.freq - minF) / (maxF - minF) : 0;
          bar.style.height = `${Math.round(18 + t * 26)}px`;
          btn.appendChild(bar);
        }
        const name = document.createElement("span");
        name.className = "keypad-note-name";
        name.textContent = key.label;
        btn.appendChild(name);
        btn.addEventListener("click", () => pressDigit(key.value));
        grid.appendChild(btn);
      }
      // 확인·지우기 — 키 줄과 섞이지 않게 제 줄에 둔다
      const actions = document.createElement("div");
      actions.className = "keypad-actions";
      for (const [label, testid, fn] of [
        ["지우기", "keypad-clear", clearAll],
        ["확인", "keypad-enter", () => void submit()],
      ] as const) {
        const btn = document.createElement("button");
        btn.className = "keypad-key keypad-action";
        btn.dataset.testid = testid;
        btn.textContent = label;
        btn.addEventListener("click", fn);
        actions.appendChild(btn);
      }
      extraRow = actions;
    } else {
      grid.className = "keypad-grid";
      for (const key of ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⏎"]) {
        const btn = document.createElement("button");
        btn.className = "keypad-key";
        btn.textContent = key;
        btn.dataset.testid = key === "C" ? "keypad-clear" : key === "⏎" ? "keypad-enter" : `key-${key}`;
        btn.addEventListener("click", () => {
          if (key === "C") clearAll();
          else if (key === "⏎") void submit();
          else pressDigit(key);
        });
        grid.appendChild(btn);
      }
    }

    const close = document.createElement("button");
    close.className = "puzzle-close";
    close.dataset.testid = "keypad-close";
    close.textContent = "✕";

    panel.append(prompt, display, grid, close);
    if (extraRow) grid.after(extraRow);
    overlay.appendChild(panel);
    host.appendChild(overlay);

    // 물리 키보드 (PC): 숫자 = 입력, Backspace = 한 자리 삭제, Enter = 확인, Esc = 닫기.
    // 오답 대사 박스가 떠 있는 동안은 대사 넘기기(Enter/Space)가 우선 — 여기서는 무시.
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.repeat || isDialogueBusy()) return;
      if (e.key >= "0" && e.key <= "9" && e.key.length === 1) pressDigit(e.key);
      else if (e.key === "Backspace") backspace();
      else if (e.key === "Enter") void submit();
      else if (e.key === "Escape") finish(false);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);

    const finish = (ok: boolean) => {
      window.removeEventListener("keydown", onKeyDown);
      overlay.remove();
      resolve(ok);
    };

    async function submit(): Promise<void> {
      if (input.length < opts.code.length) return;
      if (input === opts.code) {
        Sfx.success();
        finish(true);
        return;
      }
      Sfx.error();
      display.classList.add("wrong");
      input = "";
      setTimeout(sync, 450);
      if (!saidWrong && opts.wrongAnchor) {
        saidWrong = true;
        await showDialogue(opts.wrongAnchor, overlay);
      }
    }

    close.addEventListener("click", () => finish(false));
  });
}
