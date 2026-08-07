/**
 * 2막 3번 방 퍼즐 P2: 벽면 탐상 — 두 번 우는 벽.
 *
 * 물리: 탄성파는 매질 경계에서 반사된다. 속이 빈 패널은 빈 공간의 경계에서
 *   파가 한 번 더 되돌아와 에코가 둘 — 파형·상수의 근거는 autoplay.ts 상단 주석.
 *
 * 조작: **그리드 청진 탭**. 패널 4×6을 두드리면 '노크' 소리 + 옆의 낡은
 *   오실로스코프에 에코 파형이 그려진다. 꽉 찬 벽은 봉우리 하나('턱'),
 *   빈 벽은 봉우리 둘('통—통'). 소리 없이 파형만으로 완전 판별 가능(무음 백업).
 *   빈 패널을 찾아 [벽감 열기] → 릴 테이프 회수 + solve.
 */
import "./puzzle.css";
import type { PuzzleApi, PuzzleModule, PuzzleManifest } from "../../engine/puzzle-host/types";
import manifestJson from "./manifest.json";
import { audioCtx, isMuted } from "../../engine/audio/sfx";
import {
  ROWS,
  COLS,
  ECHO_DELAY_S,
  ECHO_LEVEL,
  SCOPE_WINDOW_S,
  MELODY_NOTE,
  SCOPE_W,
  SCOPE_H,
  isHollow,
  knockWave,
  countEchoHumps,
} from "./autoplay";

const manifest = manifestJson as PuzzleManifest;
const SVG_NS = "http://www.w3.org/2000/svg";

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tag);
}

/** 노크 기본음 (Hz) — 낮은 '턱'. 살짝 떨어지는 피치로 두드린 질감을 낸다 */
const KNOCK_FREQ_HZ = 95;
/** 노크 감쇠 시간 (s) — 가청용. 스코프의 PULSE_TAU_S와 별개인 소리 연출 값 */
const KNOCK_DECAY_S = 0.14;

/** 노크 소리 — 꽉 찬 벽 1회, 빈 벽은 같은 톤이 ECHO_DELAY_S 뒤에 한 번 더(약하게) */
function playKnock(hollow: boolean): void {
  if (isMuted()) return;
  const ac = audioCtx();
  if (!ac) return;
  if (ac.state === "suspended") void ac.resume();
  const t0 = ac.currentTime;
  const hit = (t: number, vol: number): void => {
    const osc = ac.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(KNOCK_FREQ_HZ, t);
    osc.frequency.exponentialRampToValueAtTime(KNOCK_FREQ_HZ * 0.7, t + KNOCK_DECAY_S);
    const gain = ac.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + KNOCK_DECAY_S);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(t);
    osc.stop(t + KNOCK_DECAY_S + 0.01);
  };
  hit(t0, 0.5);
  if (hollow) hit(t0 + ECHO_DELAY_S, 0.5 * ECHO_LEVEL);
}

/** 파형 폴리라인 좌표 — knockWave(autoplay)를 스코프 viewBox로 샘플링 */
function wavePoints(hollow: boolean): string {
  const N = 240;
  const pts: string[] = [];
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * SCOPE_WINDOW_S;
    const x = (i / N) * SCOPE_W;
    const y = SCOPE_H / 2 - knockWave(t, hollow) * (SCOPE_H * 0.36);
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return pts.join(" ");
}

export const wallSounding: PuzzleModule = {
  manifest,
  mount(api: PuzzleApi): () => void {
    let saidFull = false;
    let foundHollow = false;
    let solved = false;

    api.root.classList.add("knock-root");

    // ── 벽면 패널 그리드 4×6 ─────────────────────────────
    const grid = document.createElement("div");
    grid.className = "knock-grid";
    grid.dataset.testid = "knock-grid";
    grid.style.gridTemplateColumns = `repeat(${COLS}, minmax(0, 1fr))`;
    grid.style.gridTemplateRows = `repeat(${ROWS}, minmax(0, 1fr))`;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const panel = document.createElement("button");
        panel.className = "knock-panel";
        panel.dataset.testid = `knock-panel-${r}-${c}`;
        panel.dataset.row = String(r);
        panel.dataset.col = String(c);
        panel.setAttribute("aria-label", `벽 패널 ${r + 1}행 ${c + 1}열`);
        grid.appendChild(panel);
      }
    }

    // ── 오실로스코프 (SVG — 색은 CSS 변수로만) ───────────
    const scope = svgEl("svg");
    scope.setAttribute("viewBox", `0 0 ${SCOPE_W} ${SCOPE_H}`);
    scope.classList.add("knock-scope");
    scope.dataset.testid = "knock-scope-view";

    const frame = svgEl("rect");
    frame.setAttribute("x", "1");
    frame.setAttribute("y", "1");
    frame.setAttribute("width", String(SCOPE_W - 2));
    frame.setAttribute("height", String(SCOPE_H - 2));
    frame.classList.add("knock-scope-frame");

    const baseline = svgEl("line");
    baseline.setAttribute("x1", "0");
    baseline.setAttribute("y1", String(SCOPE_H / 2));
    baseline.setAttribute("x2", String(SCOPE_W));
    baseline.setAttribute("y2", String(SCOPE_H / 2));
    baseline.classList.add("knock-scope-baseline");

    const wave = svgEl("polyline");
    wave.classList.add("knock-wave");
    wave.dataset.testid = "knock-wave";

    // 반사 피크 표지 — "되돌아온 것"임을 명시 (흡수로 오해 방지, 빈 벽에서만 표시)
    const echoX = (ECHO_DELAY_S / SCOPE_WINDOW_S) * SCOPE_W;
    const echoMark = svgEl("g");
    echoMark.classList.add("knock-echo-mark");
    const echoLine = svgEl("line");
    echoLine.setAttribute("x1", String(echoX));
    echoLine.setAttribute("y1", "14");
    echoLine.setAttribute("x2", String(echoX));
    echoLine.setAttribute("y2", String(SCOPE_H - 8));
    const echoLabel = svgEl("text");
    echoLabel.setAttribute("x", String(echoX + 5));
    echoLabel.setAttribute("y", "12");
    echoLabel.textContent = "반사";
    echoMark.append(echoLine, echoLabel);
    echoMark.setAttribute("visibility", "hidden");

    scope.append(frame, baseline, wave, echoMark);

    const state = document.createElement("p");
    state.className = "knock-state";
    state.dataset.testid = "knock-state";
    state.textContent = "패널을 두드려 봐라 — 스코프가 되돌아온 소리를 그린다.";

    const open = document.createElement("button");
    open.className = "knock-open";
    open.dataset.testid = "knock-open";
    open.textContent = "[벽감 열기]";
    open.disabled = true;

    const done = document.createElement("div");
    done.className = "knock-done";
    done.dataset.testid = manifest.testIds["solveCheck"];
    done.textContent = `벽감 개방 — 릴 테이프 회수. 둘째 음 [${MELODY_NOTE}] 확보`;
    done.hidden = true;

    const side = document.createElement("div");
    side.className = "knock-side";
    // 작동 버튼은 스크롤러 밖 힌트 바로 — 전 퍼즐 공통 자리다(api.actions).
    api.actions.appendChild(open);
    side.append(scope, state, done);

    // ── 노크 처리 (그리드 위임 — 리스너 1개) ─────────────
    function drawWave(hollow: boolean): void {
      wave.setAttribute("points", wavePoints(hollow));
      wave.classList.toggle("double", hollow);
      echoMark.setAttribute("visibility", hollow ? "visible" : "hidden");
      // 봉우리 수(1 vs 2)를 표시 상태로 노출 — spec 판정과 무음 백업의 단일 기준
      scope.dataset.peaks = String(countEchoHumps(hollow));
      wave.animate([{ opacity: 0.15 }, { opacity: 1 }], { duration: 160 });
    }

    function openNiche(panel: HTMLElement): void {
      if (solved) return;
      solved = true;
      panel.classList.add("opened");
      open.disabled = true;
      done.hidden = false;
      state.textContent = "패널 뒤 벽감 — 릴 테이프가 들어 있다.";
      state.dataset.level = "ok";
      api.solve();
    }

    let hollowPanel: HTMLElement | null = null;

    function onGridClick(e: Event): void {
      if (solved) return;
      const panel = (e.target as HTMLElement).closest<HTMLElement>(".knock-panel");
      if (!panel) return;
      const r = Number(panel.dataset.row);
      const c = Number(panel.dataset.col);
      const hollow = isHollow(r, c);

      // 이미 찾은 빈 패널 재탭 = 벽감 열기 (버튼과 동일 경로)
      if (hollow && foundHollow) {
        openNiche(panel);
        return;
      }

      playKnock(hollow);
      drawWave(hollow);
      panel.classList.add("knocked");

      if (hollow) {
        foundHollow = true;
        hollowPanel = panel;
        panel.classList.add("hollow");
        open.disabled = false;
        state.textContent = "봉우리 둘 — 이 패널 뒤가 비어 있다. 열어라.";
        state.dataset.level = "warm";
      } else {
        state.textContent = "봉우리 하나 — 꽉 찬 벽이다.";
        delete state.dataset.level;
        if (!saidFull) {
          saidFull = true;
          void api.say(manifest.narrative.extra!["full"]);
        }
      }
    }
    grid.addEventListener("click", onGridClick);

    function onOpenClick(): void {
      if (hollowPanel) openNiche(hollowPanel);
    }
    open.addEventListener("click", onOpenClick);

    api.root.append(grid, side);

    return () => {
      grid.removeEventListener("click", onGridClick);
      open.removeEventListener("click", onOpenClick);
    };
  },
};
