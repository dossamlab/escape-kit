/**
 * 2막 3번 방 퍼즐 P3: 무음 지점 — 경보 차단 해치.
 *
 * 퍼즐의 본체는 방 자체다(roomfx.ts가 위치 연동 경보음과 HUD 소음 미터를 담당).
 * 플레이어가 상쇄 간섭으로 조용해진 바닥 지점을 걸어서 찾아 해치를 열면,
 * 이 모달은 **반위상 주입 미니 과제**를 낸다: 주입 신호(B)를 가로로 끌어
 * 경보 신호(A)와 반대 위상으로 맞추면 합성파가 평평해지고, 그때만 차단 스위치가
 * 활성화된다(노이즈 캔슬링 — 흡음이 아니라 상쇄라는 오개념 교정을 손으로 재현).
 *
 * 물리·기하·수렴 설계는 autoplay.ts 상단 주석.
 */
import "./puzzle.css";
import type { PuzzleApi, PuzzleModule, PuzzleManifest } from "../../engine/puzzle-host/types";
import manifestJson from "./manifest.json";
import { isAlarmActive } from "./roomfx";
import {
  MELODY_NOTE,
  WAVE_CYCLES,
  WAVE_CANVAS_W,
  PHASE_SUM_TOLERANCE,
  sumAmplitudeAt,
} from "./autoplay";

const manifest = manifestJson as PuzzleManifest;

export const silentNode: PuzzleModule = {
  manifest,
  mount(api: PuzzleApi): () => void {
    api.root.classList.add("node-root");

    // 전원 복구 전(경보가 아직 없다) — 열 이유가 없다. 안내만 하고 닫는다.
    if (!isAlarmActive()) {
      void api.say("#sys-console-locked").then(() => api.exit());
      return () => {};
    }

    let raf = 0;
    let solved = false;
    // 주입 신호(B)의 위상차 (rad) — 동위상에서 시작해 π로 끌어와야 한다
    let phase = 0;
    let dragStartPhase = 0;

    // ── 반위상 주입 패널: 경보 신호 + 주입 신호(드래그) + 합성 ────
    const canvas = document.createElement("canvas");
    canvas.className = "node-canvas";
    canvas.dataset.testid = "node-canvas";
    canvas.width = WAVE_CANVAS_W;
    canvas.height = 240;
    const ctx = canvas.getContext("2d")!;
    const css = (name: string) =>
      getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#fff";

    const aligned = (): boolean => sumAmplitudeAt(phase) <= PHASE_SUM_TOLERANCE;

    const draw = (t: number): void => {
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      const ok = aligned();
      const sumAmp = sumAmplitudeAt(phase);
      const rows = [
        { y0: H * 0.2, kind: "a" as const, color: css("--color-hologram"), label: "경보 신호" },
        { y0: H * 0.47, kind: "b" as const, color: css("--color-spectrum-cyan"), label: "주입 신호 ⟺ 좌우로 끌기" },
        {
          y0: H * 0.8,
          kind: "sum" as const,
          color: ok ? css("--color-success") : css("--color-danger"),
          label: ok ? "합성 — 상쇄" : "합성",
        },
      ];
      ctx.font = "12px sans-serif";
      for (const row of rows) {
        ctx.strokeStyle = row.color;
        ctx.globalAlpha = row.kind === "sum" ? 1 : 0.85;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let x = 0; x <= W; x += 2) {
          const arg = (x / W) * Math.PI * 2 * WAVE_CYCLES + t * 0.003;
          // 합성: 같은 진폭 두 파의 합 = 2·cos(φ/2)·sin(arg+φ/2) — 동위상이면 **두 배**,
          // 정렬되면 평평해진다 (마루+마루=2배, 마루+골=0 — 중첩 원리를 그대로 그린다)
          const y =
            row.kind === "sum"
              ? row.y0 + Math.sin(arg + phase / 2) * (44 * sumAmp + 1.5)
              : row.y0 + Math.sin(arg + (row.kind === "b" ? phase : 0)) * 22;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = row.color;
        ctx.fillText(row.label, 8, row.y0 - 28);
      }
      ctx.globalAlpha = 1;
    };
    const loop = (t: number): void => {
      draw(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const caption = document.createElement("p");
    caption.className = "node-caption";
    caption.dataset.testid = "node-caption";

    const switchBtn = document.createElement("button");
    switchBtn.className = "node-switch";
    switchBtn.dataset.testid = "node-switch";
    switchBtn.textContent = "경보 차단 스위치 내리기";

    // 정렬 상태 → 스위치·캡션 동기화 (드래그 중 실시간)
    const CAPTION_SEEK =
      "차단기는 회선에 소리를 더해 소리를 지운다 — 주입 신호를 좌우로 끌어 " +
      "경보와 반대 위상으로 맞춰라. 합성이 평평해지면 스위치가 열린다.";
    const CAPTION_OK =
      "반대 위상 — 마루가 골을 만나 서로를 지운다. 벽이 소리를 삼킨 게 아니다. " +
      "소리가 소리를 지웠다.";
    const syncAligned = (): void => {
      if (solved) return;
      const ok = aligned();
      canvas.dataset.aligned = String(ok);
      switchBtn.disabled = !ok;
      caption.textContent = ok ? CAPTION_OK : CAPTION_SEEK;
      caption.classList.toggle("ok", ok);
    };
    syncAligned();

    // 가로 드래그 = 위상 이동 (캔버스폭/WAVE_CYCLES px = 2π). CSS 폭과 논리 폭이
    // 다를 수 있어 rect 기준으로 환산한다. 위상은 rad 그대로 누적 (cos이 주기 처리).
    const offDrag = api.onDrag(canvas, {
      onStart: () => {
        dragStartPhase = phase;
      },
      onMove: (s) => {
        const rect = canvas.getBoundingClientRect();
        if (rect.width <= 0) return;
        const pxPerCycle = rect.width / WAVE_CYCLES;
        phase = dragStartPhase + (s.dx / pxPerCycle) * Math.PI * 2;
        syncAligned();
      },
    });

    const done = document.createElement("div");
    done.className = "node-done";
    done.dataset.testid = manifest.testIds["solveCheck"];
    done.textContent = `경보 정지 — 셋째 음 [${MELODY_NOTE}] 확보`;
    done.hidden = true;

    const onSwitch = (): void => {
      if (solved || !aligned()) return;
      solved = true;
      done.hidden = false;
      switchBtn.disabled = true;
      api.solve();
    };
    switchBtn.addEventListener("click", onSwitch);

    // 작동 버튼은 스크롤러 밖 힌트 바로 — 전 퍼즐 공통 자리다(api.actions).
    api.actions.appendChild(switchBtn);
    api.root.append(canvas, caption, done);

    return () => {
      cancelAnimationFrame(raf);
      offDrag();
      switchBtn.removeEventListener("click", onSwitch);
    };
  },
};
