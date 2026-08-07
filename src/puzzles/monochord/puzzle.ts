/**
 * 2막 3번 방 퍼즐 P4: 모노코드 — 낼 수 없는 음 (부스 자물쇠).
 *
 * 물리: 양 끝 고정 현의 정상파. 한 점을 **가볍게 짚고** 튕기면 그 점이 강제
 *   마디가 되어, 그 점을 마디로 갖는 배음(f = n·f₀)만 살아남는다 — 하모닉스.
 *   개방현 '도'(130.81 Hz)로 3배음 '솔'(392.43 Hz)을 내는 것이 정답.
 *   도출·마디 목록·수렴 설계는 autoplay.ts 상단 주석.
 *
 * 조작: **현 위 지점 탭**(드래그·핸들 없는 불연속 탭). 탭한 지점을 짚은 채
 *   자동으로 튕겨진다. 마디(1/2·1/3·2/3·1/4·3/4 ± POS_TOL)면 맑게 울리고
 *   정상파 형상 + 음이름 점등, 아니면 '툭' 죽은 소리 + 무음 표시(시각 백업).
 *   2배음·4배음은 울리되 "자물쇠가 원하는 음이 아니다" — 3배음이 정답.
 */
import "./puzzle.css";
import type { PuzzleApi, PuzzleModule, PuzzleManifest } from "../../engine/puzzle-host/types";
import manifestJson from "./manifest.json";
import { audioCtx, isMuted } from "../../engine/audio/sfx";
import {
  TARGET_HARMONIC,
  ALLOWED_HARMONICS,
  MELODY_NOTE,
  VIEW_W,
  VIEW_H,
  STR_X0,
  STR_X1,
  STR_Y,
  WAVE_AMP,
  harmonicFreq,
  nodeSpotAt,
  noteNameOf,
  fracToX,
  xToFrac,
} from "./autoplay";

const manifest = manifestJson as PuzzleManifest;
const SVG_NS = "http://www.w3.org/2000/svg";

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tag);
}

/** 하모닉스 울림 감쇠 시간 (s) — 가청 연출 값 */
const RING_DECAY_S = 1.6;
/** 울림의 부분음 상대 게인 — 기본음(n·f₀) + 약한 상음 2개 (사인 합성 음색) */
const RING_PARTIAL_GAINS = [0.32, 0.1, 0.05] as const;
/** 죽은 소리 '툭' — 짧은 저음 (마디가 아니면 진동이 즉시 죽는다) */
const THUD_FREQ_HZ = 82;
const THUD_DECAY_S = 0.11;
/** 탭 판정 이동량 문턱 (px) — 이 이상 움직이면 탭이 아니라 드래그로 본다 */
const TAP_SLOP_PX = 10;

/** n배음의 맑은 울림 — 기본음 n·f₀에 약한 정수배 상음을 얹은 사인 합성 */
function playRing(n: number): void {
  if (isMuted()) return;
  const ac = audioCtx();
  if (!ac) return;
  if (ac.state === "suspended") void ac.resume();
  const t0 = ac.currentTime;
  const base = harmonicFreq(n); // f = n·f₀
  RING_PARTIAL_GAINS.forEach((vol, i) => {
    const osc = ac.createOscillator();
    osc.type = "sine";
    osc.frequency.value = base * (i + 1);
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + RING_DECAY_S);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + RING_DECAY_S + 0.05);
  });
}

/** '툭' — 마디가 아닌 자리를 짚었을 때의 죽은 소리 */
function playThud(): void {
  if (isMuted()) return;
  const ac = audioCtx();
  if (!ac) return;
  if (ac.state === "suspended") void ac.resume();
  const t0 = ac.currentTime;
  const osc = ac.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(THUD_FREQ_HZ, t0);
  osc.frequency.exponentialRampToValueAtTime(THUD_FREQ_HZ * 0.6, t0 + THUD_DECAY_S);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.3, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + THUD_DECAY_S);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + THUD_DECAY_S + 0.02);
}

/** n배음 정상파 포락선 경로 — y = ±A·sin(nπ·frac). 마디 n+1개, 배 n개 */
function envelopePath(n: number, sign: 1 | -1): string {
  const STEPS = 96;
  const parts: string[] = [];
  for (let i = 0; i <= STEPS; i++) {
    const frac = i / STEPS;
    const x = fracToX(frac);
    const y = STR_Y - sign * WAVE_AMP * Math.sin(n * Math.PI * frac);
    parts.push(`${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return parts.join(" ");
}

export const monochord: PuzzleModule = {
  manifest,
  mount(api: PuzzleApi): () => void {
    let solved = false;
    let saidDead = false;

    api.root.classList.add("mono-root");

    // ── 표지 + 목표 음 듣기 ──────────────────────────────
    const signRow = document.createElement("div");
    signRow.className = "mono-sign-row";
    const sign = document.createElement("p");
    sign.className = "mono-sign";
    sign.textContent = "“이 현이 낼 수 없는 음을 내라 — 그것이 넷째 음이다.”";
    const target = document.createElement("button");
    target.className = "mono-target";
    target.dataset.testid = "mono-target";
    target.textContent = "목표 음 듣기";
    // 목표 음(392.43 Hz)을 현의 울림과 같은 음색으로 재생 — 귀로 대조하는 기준
    function onTargetClick(): void {
      playRing(TARGET_HARMONIC);
      target.classList.remove("played");
      void target.offsetWidth; // 애니메이션 재시작
      target.classList.add("played");
    }
    target.addEventListener("click", onTargetClick);
    signRow.append(sign, target);

    // ── 현 도면 (SVG) ────────────────────────────────────
    const view = svgEl("svg");
    view.setAttribute("viewBox", `0 0 ${VIEW_W} ${VIEW_H}`);
    view.classList.add("mono-svg");
    view.dataset.testid = "mono-view";

    // 공명통 몸체 + 양 끝 브리지 (여기 사이가 길이 L)
    const body = svgEl("rect");
    body.setAttribute("x", String(STR_X0 - 22));
    body.setAttribute("y", String(STR_Y - 8));
    body.setAttribute("width", String(STR_X1 - STR_X0 + 44));
    body.setAttribute("height", "52");
    body.setAttribute("rx", "8");
    body.classList.add("mono-body");
    const bridges = svgEl("g");
    for (const bx of [STR_X0, STR_X1]) {
      const bridge = svgEl("path");
      bridge.setAttribute("d", `M${bx - 8} ${STR_Y + 26} L${bx} ${STR_Y} L${bx + 8} ${STR_Y + 26} Z`);
      bridge.classList.add("mono-bridge");
      bridges.appendChild(bridge);
    }

    // 현 (정지선) — 죽은 탭이면 잠깐 흐릿하게 떨린다
    const stringLine = svgEl("line");
    stringLine.setAttribute("x1", String(STR_X0));
    stringLine.setAttribute("y1", String(STR_Y));
    stringLine.setAttribute("x2", String(STR_X1));
    stringLine.setAttribute("y2", String(STR_Y));
    stringLine.classList.add("mono-string");

    // 정상파 형상 — 위/아래 포락선 + 마디 점 (울릴 때만 표시)
    const waveUp = svgEl("path");
    waveUp.classList.add("mono-wave");
    const waveDown = svgEl("path");
    waveDown.classList.add("mono-wave");
    const nodeDots = svgEl("g");
    nodeDots.classList.add("mono-nodes");
    const waveGroup = svgEl("g");
    waveGroup.append(waveUp, waveDown, nodeDots);
    waveGroup.setAttribute("visibility", "hidden");

    // 짚은 손가락 표지
    const finger = svgEl("circle");
    finger.setAttribute("r", "9");
    finger.setAttribute("cy", String(STR_Y));
    finger.classList.add("mono-finger");
    finger.setAttribute("visibility", "hidden");

    view.append(body, bridges, stringLine, waveGroup, finger);

    // ── 음이름 램프 + 상태 ───────────────────────────────
    const lampRow = document.createElement("div");
    lampRow.className = "mono-lamps";
    const lamps = new Map<number, HTMLElement>();
    for (const n of ALLOWED_HARMONICS) {
      const lamp = document.createElement("span");
      lamp.className = "mono-lamp";
      lamp.dataset.testid = `mono-note-${n}`;
      lamp.textContent = `${n}배음 ${noteNameOf(n)}`;
      lampRow.appendChild(lamp);
      lamps.set(n, lamp);
    }
    const mute = document.createElement("span");
    mute.className = "mono-mute";
    mute.dataset.testid = "mono-mute";
    mute.textContent = "✕ 무음";
    mute.hidden = true;
    lampRow.appendChild(mute);

    const state = document.createElement("p");
    state.className = "mono-state";
    state.dataset.testid = "mono-state";
    state.textContent = "현 위의 한 점을 탭해라 — 가볍게 짚은 채 튕겨진다.";

    // 오개념 방지 캡션: 하모닉스(가볍게 짚기) ≠ 프렛(꽉 눌러 길이 줄이기)
    const caption = document.createElement("p");
    caption.className = "mono-caption";
    caption.textContent =
      "이 짚기는 '가볍게'다 — 짚은 점을 마디로 만드는 하모닉스이지, 꽉 눌러 줄 길이를 줄이는 프렛이 아니다.";

    const done = document.createElement("div");
    done.className = "mono-done";
    done.dataset.testid = manifest.testIds["solveCheck"];
    done.textContent = `개방현 '도'로 '솔'을 냈다 — 넷째 음 [${MELODY_NOTE}] 확보`;
    done.hidden = true;

    // ── 정상파 렌더 ──────────────────────────────────────
    function drawStandingWave(n: number): void {
      waveUp.setAttribute("d", envelopePath(n, 1));
      waveDown.setAttribute("d", envelopePath(n, -1));
      nodeDots.replaceChildren();
      // 마디는 x = (k/n)·L, k = 0…n — 양 끝 포함 n+1개 (배는 그 사이 n개)
      for (let k = 0; k <= n; k++) {
        const dot = svgEl("circle");
        dot.setAttribute("cx", String(fracToX(k / n)));
        dot.setAttribute("cy", String(STR_Y));
        dot.setAttribute("r", "4");
        dot.classList.add("mono-node-dot");
        nodeDots.appendChild(dot);
      }
      waveGroup.setAttribute("visibility", "visible");
      waveUp.animate([{ opacity: 0.15 }, { opacity: 1 }], { duration: 180 });
      waveDown.animate([{ opacity: 0.15 }, { opacity: 1 }], { duration: 180 });
    }

    // ── 탭 처리 ──────────────────────────────────────────
    function tap(posFrac: number): void {
      if (solved) return;
      const p = Math.min(1, Math.max(0, posFrac));
      const spot = nodeSpotAt(p);

      finger.setAttribute("cx", String(fracToX(p)));
      finger.setAttribute("visibility", "visible");
      for (const [n, lamp] of lamps) lamp.classList.toggle("lit", spot !== null && spot.n === n);

      if (!spot) {
        // 마디가 아닌 자리 — 짚은 손가락이 진동을 즉시 죽인다
        playThud();
        view.dataset.harmonic = "0";
        waveGroup.setAttribute("visibility", "hidden");
        mute.hidden = false;
        // 현이 잠깐 흐릿하게 떨리다 멈춘다 (WAAPI — 재탭 시 자동 재시작)
        stringLine.animate(
          [
            { transform: "translateY(0)", opacity: 1 },
            { transform: "translateY(2.5px)", opacity: 0.4 },
            { transform: "translateY(-2px)", opacity: 0.5 },
            { transform: "translateY(1px)", opacity: 0.75 },
            { transform: "translateY(0)", opacity: 1 },
          ],
          { duration: 380, easing: "ease-out" }
        );
        state.textContent = "툭 — 죽은 소리다. 이 자리를 짚으면 현은 침묵한다.";
        delete state.dataset.level;
        if (!saidDead) {
          saidDead = true;
          void api.say(manifest.narrative.extra!["dead"]);
        }
        return;
      }

      // 마디 적중 — 그 점을 마디로 갖는 배음만 살아남는다: f = n·f₀
      playRing(spot.n);
      drawStandingWave(spot.n);
      view.dataset.harmonic = String(spot.n);
      mute.hidden = true;

      if (spot.n === TARGET_HARMONIC) {
        solved = true;
        state.textContent = `${noteNameOf(spot.n)} — 3배음 ${Math.round(harmonicFreq(spot.n))} Hz. 자물쇠가 응답한다.`;
        state.dataset.level = "ok";
        done.hidden = false;
        api.solve();
      } else {
        state.textContent = `${noteNameOf(spot.n)} — 맑게 울리지만, 자물쇠가 원하는 음이 아니다.`;
        state.dataset.level = "warm";
        api.fail(); // 힌트 해금
      }
    }

    // 탭 = 이동량이 작은 포인터 조작 — 엔진 onDrag 헬퍼로 위치를 받는다 (직접 바인딩 금지)
    const offDrag = api.onDrag(view, {
      onEnd: (s) => {
        if (Math.hypot(s.dx, s.dy) >= TAP_SLOP_PX) return;
        const rect = view.getBoundingClientRect();
        if (rect.width <= 0) return;
        tap(xToFrac((s.x / rect.width) * VIEW_W));
      },
    });

    // e2e 훅 — 지정 위치 탭과 동일 동작 (__qePendSet/__qeCylSetQ 규약)
    (window as unknown as Record<string, unknown>).__qeMonoTap = (posFrac: number) => tap(posFrac);

    api.root.append(signRow, view, lampRow, state, caption, done);

    return () => {
      offDrag();
      target.removeEventListener("click", onTargetClick);
      delete (window as unknown as Record<string, unknown>).__qeMonoTap;
    };
  },
};
