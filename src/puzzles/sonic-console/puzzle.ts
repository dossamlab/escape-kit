/**
 * 2막 3번 방 최종 콘솔: 도플러 판독 — "그는 어디로 갔는가"의 답.
 *
 * 게이트(엔진 처리): ①릴 테이프 아이템 → ②4음 멜로디 건반(코드 1365 스킨) →
 *   해금 대사 #sn-tape-voice(한이준 육성) → 인트로 #sn-console-intro → 이 모달.
 *
 * 본 퍼즐: 지오폰 최종 기록(휘파람 4음, 재생 내내 낮아지며 잦아듦)을 듣고/보고
 *   방향×속도변화 4지선다. 정답 '멀어지며 빨라짐' → door:sonic-open (출구 개방).
 *   스펙트로그램의 **점선이 원음 기준선**이다 — 위아래가 방향, 벌어짐이 속도 변화.
 *   오답 시 비교 재생(정지 / 등속 멀어짐 / 가속 멀어짐)으로 수렴 — 물리는 autoplay.ts.
 */
import "./puzzle.css";
import type { PuzzleApi, PuzzleModule, PuzzleManifest } from "../../engine/puzzle-host/types";
import manifestJson from "./manifest.json";
import { audioCtx, isMuted } from "../../engine/audio/sfx";
import {
  MELODY_FREQS,
  NOTE_DUR_S,
  NOTE_GAP_S,
  RECEDE_PITCH_END,
  pitchAt,
  isCorrect,
} from "./autoplay";
import type { DopplerAnswer } from "./autoplay";

const manifest = manifestJson as PuzzleManifest;

/** 톤 하나 재생 — fFrom→fTo로 미끄러진다(등속이면 두 값이 같다). 짧은 페이드 */
function playNote(fFrom: number, fTo: number, at: number, dur: number, gainPeak: number): void {
  const ac = audioCtx();
  if (!ac || isMuted()) return;
  if (ac.state === "suspended") void ac.resume();
  const osc = ac.createOscillator();
  osc.type = "sine";
  const g = ac.createGain();
  const t = ac.currentTime + at;
  // 음 안에서도 트레이스와 같은 기울기로 미끄러져야 한다 — 그림은 활강인데 소리는
  // 계단이면 "빨라지는가"를 귀로는 못 읽는다.
  osc.frequency.setValueAtTime(fFrom, t);
  osc.frequency.linearRampToValueAtTime(fTo, t + dur);
  g.gain.setValueAtTime(0.001, t);
  g.gain.exponentialRampToValueAtTime(gainPeak, t + 0.03);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(g);
  g.connect(ac.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

export const sonicConsole: PuzzleModule = {
  manifest,
  mount(api: PuzzleApi): () => void {
    let solved = false;
    let saidWrong = false;
    let playing = false;
    let raf = 0;
    const timeouts: ReturnType<typeof setTimeout>[] = [];

    api.root.classList.add("dop-root");

    // ── 스펙트로그램: 피치 트레이스 (시각 백업의 핵심) ────
    const canvas = document.createElement("canvas");
    canvas.className = "dop-canvas";
    canvas.dataset.testid = "dop-spectrogram";
    canvas.width = 560;
    canvas.height = 220;
    const ctx = canvas.getContext("2d")!;
    const css = (name: string) =>
      getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#fff";

    const totalS = MELODY_FREQS.length * (NOTE_DUR_S + NOTE_GAP_S);
    const fMin = Math.min(...MELODY_FREQS) * RECEDE_PITCH_END * 0.92;
    // 원음 기준선(배율 1)이 눈금 안에 들어와야 한다 — 관측선이 그 아래라는 게 판독의 절반이다
    const fMax = Math.max(...MELODY_FREQS) * 1.06;
    const yOf = (freq: number): number =>
      canvas.height - ((freq - fMin) / (fMax - fMin)) * (canvas.height - 30) - 15;

    /** 트레이스 그리기 — progress(0~1)까지의 기록. 각 음이 짧은 활강 선분으로 남는다 */
    const drawTrace = (progress: number): void => {
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = css("--color-line");
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
      ctx.fillStyle = css("--color-text");
      ctx.font = "11px sans-serif";
      ctx.fillText("주파수 ↑ / 시간 →", 8, 16);

      // 원음 기준선 — 기억 속 휘파람(도·미·라·솔)이 제자리에서 났다면 그렸을 높이.
      // 관측선이 이 아래면 멀어지는 중, 위면 다가오는 중. 없으면 방향을 읽을 수 없다.
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = css("--color-line");
      ctx.lineWidth = 2;
      for (let i = 0; i < MELODY_FREQS.length; i++) {
        const start = i * (NOTE_DUR_S + NOTE_GAP_S);
        const y = yOf(MELODY_FREQS[i]);
        ctx.beginPath();
        ctx.moveTo((start / totalS) * (W - 20) + 10, y);
        ctx.lineTo(((start + NOTE_DUR_S) / totalS) * (W - 20) + 10, y);
        ctx.stroke();
      }
      ctx.restore();

      ctx.strokeStyle = css("--color-hologram");
      ctx.lineWidth = 3;
      for (let i = 0; i < MELODY_FREQS.length; i++) {
        const start = i * (NOTE_DUR_S + NOTE_GAP_S);
        const end = start + NOTE_DUR_S;
        const shownEnd = Math.min(end, progress * totalS);
        if (shownEnd <= start) break;
        ctx.beginPath();
        for (let t = start; t <= shownEnd; t += 0.02) {
          const x = (t / totalS) * (W - 20) + 10;
          const y = yOf(MELODY_FREQS[i] * pitchAt(t, totalS));
          if (t === start) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    };
    drawTrace(0);

    // ── 재생 컨트롤 ──────────────────────────────────────
    const playBtn = document.createElement("button");
    playBtn.className = "dop-play";
    playBtn.dataset.testid = "dop-play";
    playBtn.textContent = "▶ 최종 기록 재생";

    const startedAtRef = { t: 0 };
    const animate = (): void => {
      const u = Math.min(1, (performance.now() - startedAtRef.t) / (totalS * 1000));
      drawTrace(u);
      if (u < 1) raf = requestAnimationFrame(animate);
      else {
        playing = false;
        playBtn.disabled = false;
      }
    };
    const playRecord = (): void => {
      if (playing) return;
      playing = true;
      playBtn.disabled = true;
      for (let i = 0; i < MELODY_FREQS.length; i++) {
        const at = i * (NOTE_DUR_S + NOTE_GAP_S);
        // 잦아드는 게인 — 멀어지는 파원은 작아지기도 한다
        const gain = 0.3 * (1 - (0.55 * i) / MELODY_FREQS.length);
        playNote(
          MELODY_FREQS[i] * pitchAt(at, totalS),
          MELODY_FREQS[i] * pitchAt(at + NOTE_DUR_S, totalS),
          at,
          NOTE_DUR_S,
          gain
        );
      }
      startedAtRef.t = performance.now();
      raf = requestAnimationFrame(animate);
    };
    playBtn.addEventListener("click", playRecord);

    // 비교 재생 — 오답 후 해금.
    // ⚠ 물리: 등속으로 다가오는 파원의 관측 진동수는 **일정하게 높은 값**이다
    //   (f′ = fv/(v−vs) = 상수) — "다가올수록 점점 높아진다"는 대표적 학생
    //   오개념이라 스윕(활강/상승)으로 재생하면 안 된다(physics-reviewer 지적).
    //   기준음 → 등속으로 멀어짐(낮은 채로 **일정**) → 빨라지며 멀어짐(계속 낮아짐)의
    //   세 대비로, 방향(위아래)과 속도 변화(수평이냐 미끄러지냐)를 갈라 들려준다.
    const compareBtn = document.createElement("button");
    compareBtn.className = "dop-compare";
    compareBtn.dataset.testid = "dop-compare";
    compareBtn.textContent = "비교 듣기 — 정지 / 등속으로 멀어짐(낮은 채로) / 빨라지며 멀어짐";
    compareBtn.hidden = true;
    const playSteady = (freq: number, at: number, dur: number, toFreq = freq): void => {
      const ac = audioCtx();
      if (!ac || isMuted()) return;
      const osc = ac.createOscillator();
      osc.type = "sine";
      const t = ac.currentTime + at;
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.linearRampToValueAtTime(toFreq, t + dur);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.001, t);
      g.gain.exponentialRampToValueAtTime(0.22, t + 0.03);
      g.gain.setValueAtTime(0.22, t + dur - 0.08);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(g);
      g.connect(ac.destination);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    };
    compareBtn.addEventListener("click", () => {
      playSteady(375, 0, 0.8); // 정지한 파원 — 원래 음
      playSteady(330, 1.1, 0.9); // 등속으로 멀어짐 — 낮은 채로 **일정**
      playSteady(330, 2.3, 0.9, 285); // 빨라지며 멀어짐 — 낮은 데서 계속 더 낮아진다
    });

    const question = document.createElement("p");
    question.className = "dop-question";
    question.textContent =
      "점선이 원음이다. 이 소리의 주인은 어떻게 움직이고 있었는가 — 방향과 속도 변화까지.";

    // ── 4지선다: 방향(원음 위/아래) × 속도 변화(차이가 벌어짐/좁혀짐) ──
    const choices = document.createElement("div");
    choices.className = "dop-choices";
    const mkChoice = (answer: DopplerAnswer, label: string): HTMLButtonElement => {
      const btn = document.createElement("button");
      btn.className = "dop-choice";
      btn.dataset.testid = `dop-${answer}`;
      btn.textContent = label;
      btn.addEventListener("click", () => {
        if (solved) return;
        if (isCorrect(answer)) {
          solved = true;
          done.hidden = false;
          btn.classList.add("right");
          api.solve();
        } else {
          api.fail();
          btn.classList.add("wrong-pick");
          timeouts.push(setTimeout(() => btn.classList.remove("wrong-pick"), 500));
          compareBtn.hidden = false;
          if (!saidWrong) {
            saidWrong = true;
            void api.say(manifest.narrative.extra!["wrong"]);
          }
        }
      });
      return btn;
    };
    choices.append(
      mkChoice("approach-faster", "가까워지며 빨라진다"),
      mkChoice("approach-slower", "가까워지며 느려진다"),
      mkChoice("away-faster", "멀어지며 빨라진다"),
      mkChoice("away-slower", "멀어지며 느려진다")
    );

    const legend = document.createElement("p");
    legend.className = "dop-legend";
    legend.textContent = "점선 = 원음(기억 속 휘파람) · 실선 = 지오폰이 받은 소리";

    const done = document.createElement("div");
    done.className = "dop-done";
    done.dataset.testid = manifest.testIds["solveCheck"];
    done.textContent = "판독 확정 — 멀어지며 빨라지는 휘파람. 격리 해제, 문이 열렸다.";
    done.hidden = true;

    api.root.append(canvas, legend, playBtn, compareBtn, question, choices, done);

    return () => {
      cancelAnimationFrame(raf);
      timeouts.forEach(clearTimeout);
    };
  },
};
