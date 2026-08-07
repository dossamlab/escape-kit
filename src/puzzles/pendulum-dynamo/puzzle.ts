/**
 * 2막 3번 방 퍼즐 P1: 진자 발전기 — 박자 시동.
 *
 * 물리: 단진동의 등시성. 주기는 진폭과 무관하므로 "언제 미는가"가 전부다.
 *   탭 1회의 진폭 변화 Δ = PUSH_GAIN × cos φ (φ = 최적 순간과의 위상차) —
 *   도출과 수렴 설계는 autoplay.ts 상단 주석.
 *
 * 조작: **리듬 탭**. [밀기] 버튼(또는 Space)을 진자의 박자에 맞춰 누른다.
 *   최적 순간마다 '똑' 소리 + 버튼 발광(무음 환경 시각 백업). 마구 누르면
 *   게이지가 오히려 내려가는 것이 즉시 보인다 — 개념 없이도 수렴한다.
 */
import "./puzzle.css";
import type { PuzzleApi, PuzzleModule, PuzzleManifest } from "../../engine/puzzle-host/types";
import manifestJson from "./manifest.json";
import { audioCtx, isMuted } from "../../engine/audio/sfx";
import {
  AMP_INITIAL,
  AMP_MAX,
  SOLVE_AMP,
  TAP_COOLDOWN_S,
  MISS_STREAK,
  MELODY_NOTE,
  THETA_MAX,
  VIEW_W,
  VIEW_H,
  PIVOT_X,
  PIVOT_Y,
  ROD_LEN,
  phaseAt,
  ampDelta,
  inGlowWindow,
  stepAmp,
  isSolved,
} from "./autoplay";

const manifest = manifestJson as PuzzleManifest;
const SVG_NS = "http://www.w3.org/2000/svg";

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tag);
}

/** '똑' — 진자가 최저점을 지나는 소리 (정확한 박자 신호라 ZzFX 대신 직접 합성) */
function playTick(): void {
  if (isMuted()) return;
  const ac = audioCtx();
  if (!ac) return;
  if (ac.state === "suspended") void ac.resume();
  const osc = ac.createOscillator();
  osc.type = "triangle";
  osc.frequency.value = 190;
  const gain = ac.createGain();
  const t = ac.currentTime;
  gain.gain.setValueAtTime(0.3, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(t);
  osc.stop(t + 0.1);
}

export const pendulumDynamo: PuzzleModule = {
  manifest,
  mount(api: PuzzleApi): () => void {
    let amp = AMP_INITIAL;
    let solved = false;
    let saidMiss = false;
    let missStreak = 0;
    let lastTapAt = -Infinity;
    let raf = 0;
    const t0 = performance.now();

    api.root.classList.add("pend-root");

    // ── 진자 도면 ────────────────────────────────────────
    const view = svgEl("svg");
    view.setAttribute("viewBox", `0 0 ${VIEW_W} ${VIEW_H}`);
    view.classList.add("pend-svg");
    view.dataset.testid = "pend-view";

    // A-프레임
    const frame = svgEl("path");
    frame.setAttribute(
      "d",
      `M${PIVOT_X - 92} ${VIEW_H - 12} L${PIVOT_X} ${PIVOT_Y - 14} L${PIVOT_X + 92} ${VIEW_H - 12}`
    );
    frame.classList.add("pend-frame");

    // 진자 (막대 + 추) — 피벗 기준 회전
    const arm = svgEl("g");
    const rod = svgEl("line");
    rod.setAttribute("x1", String(PIVOT_X));
    rod.setAttribute("y1", String(PIVOT_Y));
    rod.setAttribute("x2", String(PIVOT_X));
    rod.setAttribute("y2", String(PIVOT_Y + ROD_LEN));
    rod.classList.add("pend-rod");
    const bob = svgEl("circle");
    bob.setAttribute("cx", String(PIVOT_X));
    bob.setAttribute("cy", String(PIVOT_Y + ROD_LEN));
    bob.setAttribute("r", "18");
    bob.classList.add("pend-bob");
    arm.append(rod, bob);

    // 피벗 램프 — '똑' 순간 점멸 (무음 백업)
    const pivot = svgEl("circle");
    pivot.setAttribute("cx", String(PIVOT_X));
    pivot.setAttribute("cy", String(PIVOT_Y));
    pivot.setAttribute("r", "7");
    pivot.classList.add("pend-pivot");
    pivot.dataset.testid = "pend-pivot";

    // 최저점 눈금 — "가장 낮은 곳"의 시각 기준선
    const nadir = svgEl("line");
    nadir.setAttribute("x1", String(PIVOT_X));
    nadir.setAttribute("y1", String(PIVOT_Y + ROD_LEN + 22));
    nadir.setAttribute("x2", String(PIVOT_X));
    nadir.setAttribute("y2", String(PIVOT_Y + ROD_LEN + 34));
    nadir.classList.add("pend-nadir");

    view.append(frame, nadir, arm, pivot);

    // ── 패널: 진폭 게이지 + 밀기 버튼 ─────────────────────
    const panel = document.createElement("div");
    panel.className = "pend-panel";

    const gaugeWrap = document.createElement("div");
    gaugeWrap.className = "pend-gauge-wrap";
    const gaugeLabel = document.createElement("span");
    gaugeLabel.className = "pend-gauge-label";
    gaugeLabel.textContent = "흔들림";
    const gauge = document.createElement("div");
    gauge.className = "pend-gauge";
    const gaugeFill = document.createElement("div");
    gaugeFill.className = "pend-gauge-fill";
    gaugeFill.dataset.testid = "pend-gauge";
    const gaugeTarget = document.createElement("div");
    gaugeTarget.className = "pend-gauge-target";
    gaugeTarget.style.left = `${SOLVE_AMP * 100}%`;
    gauge.append(gaugeFill, gaugeTarget);
    gaugeWrap.append(gaugeLabel, gauge);

    const push = document.createElement("button");
    push.className = "pend-push";
    push.dataset.testid = "pend-push";
    push.textContent = "밀기";

    const state = document.createElement("p");
    state.className = "pend-state";
    state.dataset.testid = "pend-state";
    state.textContent = "발전기의 진자가 약하게 흔들리고 있다. 박자를 찾아라.";

    const done = document.createElement("div");
    done.className = "pend-done";
    done.dataset.testid = manifest.testIds["solveCheck"];
    done.textContent = `발전기 시동 — 첫째 음 [${MELODY_NOTE}] 확보`;
    done.hidden = true;

    panel.append(gaugeWrap, push, state, done);

    // ── 탭 처리 ──────────────────────────────────────────
    const now = () => (performance.now() - t0) / 1000;

    function tap(): void {
      if (solved) return;
      const t = now();
      if (t - lastTapAt < TAP_COOLDOWN_S) return;
      lastTapAt = t;
      const d = ampDelta(phaseAt(t));
      amp = Math.min(AMP_MAX, Math.max(0, amp + d));
      if (d > 0) {
        missStreak = 0;
        push.classList.add("hit");
        setTimeout(() => push.classList.remove("hit"), 160);
      } else {
        missStreak += 1;
        push.classList.add("bad");
        setTimeout(() => push.classList.remove("bad"), 160);
        if (missStreak >= MISS_STREAK) {
          missStreak = 0;
          api.fail();
          if (!saidMiss) {
            saidMiss = true;
            void api.say(manifest.narrative.extra!["miss"]);
          }
        }
      }
      syncState();
    }
    push.addEventListener("click", tap);

    function syncState(): void {
      if (solved) {
        state.textContent = "시동 완료 — 조명 회로에 전력이 돈다.";
        state.dataset.level = "ok";
      } else if (amp >= SOLVE_AMP * 0.7) {
        state.textContent = "흔들림이 커진다 — 박자를 놓치지 마라.";
        state.dataset.level = "warm";
      } else {
        state.textContent = "발전기의 진자가 약하게 흔들리고 있다. 박자를 찾아라.";
        delete state.dataset.level;
      }
    }

    // e2e 훅 — 진폭 직접 설정 (__qeCylSetQ와 같은 규약; 리듬 입력은 CI에서 플레이키)
    (window as unknown as Record<string, unknown>).__qePendSet = (v: number) => {
      amp = Math.min(AMP_MAX, Math.max(0, v));
    };

    // ── 루프: 감쇠·렌더·'똑'·판정 ────────────────────────
    let lastT = now();
    let lastPhase = phaseAt(lastT);
    const loop = (): void => {
      const t = now();
      const dt = Math.min(t - lastT, 0.1);
      lastT = t;
      // 판정을 감쇠보다 먼저 — 탭(또는 e2e 훅)으로 임계에 정확히 닿은 프레임이
      // 감쇠에 깎여 영영 못 붙는 경계 레이스를 막는다
      if (!solved && isSolved(amp)) {
        solved = true;
        done.hidden = false;
        push.disabled = true;
        syncState();
        api.solve();
      }
      if (!solved) amp = stepAmp(amp, dt);

      const phase = phaseAt(t);
      // 최적 순간(φ=0) 통과 감지 — '똑' + 램프 점멸 (한 주기에 한 번)
      if (phase < lastPhase) {
        playTick();
        pivot.classList.add("tick");
        setTimeout(() => pivot.classList.remove("tick"), 200);
      }
      lastPhase = phase;

      // 발광 창 — 버튼이 밝아지는 시각 백업
      push.classList.toggle("glow", !solved && inGlowWindow(phase));

      // 진자 각도: θ = A·Θmax·sin φ
      const theta = amp * THETA_MAX * Math.sin(phase);
      arm.setAttribute(
        "transform",
        `rotate(${(theta * 180) / Math.PI} ${PIVOT_X} ${PIVOT_Y})`
      );
      gaugeFill.style.width = `${Math.round(amp * 100)}%`;
      gaugeFill.classList.toggle("high", amp >= SOLVE_AMP * 0.7);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    syncState();
    api.root.append(view, panel);

    return () => {
      cancelAnimationFrame(raf);
      push.removeEventListener("click", tap);
      delete (window as unknown as Record<string, unknown>).__qePendSet;
    };
  },
};
