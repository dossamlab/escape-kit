/**
 * 3번 방 룸 오디오 — 경보 사이렌 간섭 음장 + HUD 소음 미터.
 *
 * P3(silent-node)는 모달이 없는 첫 퍼즐이다 — 방 자체가 퍼즐이라, 퍼즐 폴더의
 * 이 모듈이 방 수준 연출(위치 연동 음량·미터)을 담당한다. main.ts가 init한다.
 *
 * 경보 활성 조건: sonic-room 안 + 전원 복구(code:pend-solved) + 아직 차단 전.
 * 음량은 매 프레임 플레이어 위치의 간섭 진폭(autoplay.loudnessAt)으로 정해지고,
 * 스테레오 팬이 두 스피커 사이 상대 위치를 따라간다. HUD 미터가 시각 백업 —
 * 무음 환경에서도 미터만으로 무음점을 찾을 수 있다.
 *
 * 플레이어 위치는 Game이 노출하는 `window.__qe.player`(라이브 참조)를 읽는다 —
 * 엔진 계약을 넓히지 않고 이미 공개된 상태 API를 쓴다.
 */
import "./puzzle.css";
import { audioCtx, isMuted, onMuteChange } from "../../engine/audio/sfx";
import { showDialogue, isDialogueBusy } from "../../engine/narrative/dialogue";
import { bus } from "../../engine/events/EventBus";
import { loadProgress } from "../../engine/core/save";
import { maps } from "../../maps";
import { SPEAKER_A, SPEAKER_B, ALARM_FREQ, ALARM_GAIN, loudnessAt } from "./autoplay";

const ROOM_ID = "sonic-room";
const POWER_EVENT = "code:pend-solved";
const CUT_EVENT = "code:node-solved";

let inited = false;

/** 경보가 지금 울리고 있는가 — silent-node 퍼즐 모달이 상태 안내에 쓴다 */
let alarmActive = false;
export function isAlarmActive(): boolean {
  return alarmActive;
}

export function initSonicRoomFx(app: HTMLElement): void {
  if (inited) return;
  inited = true;

  // 이어하기 복원 — Game은 저장된 이벤트·시작 맵을 재발화하지 않으므로 저장에서 읽는다
  const progress = loadProgress();
  const saved = new Set(progress.events);
  let inRoom = progress.lastMap === ROOM_ID;
  let powered = saved.has(POWER_EVENT);
  let cut = saved.has(CUT_EVENT);
  // 경보 개시 대사는 P1을 이 세션에서 푼 순간에만 — 이어하기 복원 시엔 생략
  let saidAlarm = powered;

  // ── HUD 소음 미터 ────────────────────────────────────
  const meter = document.createElement("div");
  meter.className = "noise-meter";
  meter.dataset.testid = "noise-meter";
  meter.hidden = true;
  const label = document.createElement("span");
  label.className = "noise-meter-label";
  label.textContent = "소음";
  const bar = document.createElement("div");
  bar.className = "noise-meter-bar";
  const fill = document.createElement("div");
  fill.className = "noise-meter-fill";
  bar.appendChild(fill);
  meter.append(label, bar);
  app.appendChild(meter);

  // ── 오디오 체인: osc ─ gain(간섭 음량) ─ pan ─ master(음소거) ─ 출력 ──
  let audio: { gain: GainNode; pan: StereoPannerNode; master: GainNode; osc: OscillatorNode } | null =
    null;
  let raf = 0;

  const startAudio = (): void => {
    if (audio) return;
    const ac = audioCtx();
    if (!ac) return;
    if (ac.state === "suspended") void ac.resume();
    const master = ac.createGain();
    master.gain.value = isMuted() ? 0 : 1;
    master.connect(ac.destination);
    const pan = ac.createStereoPanner();
    pan.connect(master);
    const gain = ac.createGain();
    gain.gain.value = 0;
    gain.connect(pan);
    const osc = ac.createOscillator();
    osc.type = "sine";
    osc.frequency.value = ALARM_FREQ;
    osc.connect(gain);
    osc.start();
    audio = { gain, pan, master, osc };
  };
  const stopAudio = (): void => {
    if (!audio) return;
    audio.osc.stop();
    audio.master.disconnect();
    audio = null;
  };
  onMuteChange((muted) => {
    if (audio) audio.master.gain.value = muted ? 0 : 1;
  });

  // ── 프레임 루프: 위치 → 음량·팬·미터 ─────────────────
  const midX = (SPEAKER_A[0] + SPEAKER_B[0]) / 2;
  const halfSpan = Math.max(1, (SPEAKER_B[0] - SPEAKER_A[0]) / 2 + 2);
  const loop = (): void => {
    const qe = (window as unknown as { __qe?: { player: { x: number; y: number } } }).__qe;
    if (qe) {
      const { x, y } = qe.player;
      const loud = loudnessAt(x, y);
      if (audio) {
        const ac = audioCtx()!;
        audio.gain.gain.setTargetAtTime(ALARM_GAIN * loud, ac.currentTime, 0.06);
        audio.pan.pan.value = Math.max(-1, Math.min(1, (x - midX) / halfSpan));
      }
      fill.style.width = `${Math.round(loud * 100)}%`;
      fill.classList.toggle("quiet", loud <= 0.25);
      meter.dataset.loudness = loud.toFixed(2);
    }
    raf = requestAnimationFrame(loop);
  };

  const sync = (): void => {
    const active = inRoom && powered && !cut;
    if (active === alarmActive) return;
    alarmActive = active;
    meter.hidden = !active;
    if (active) {
      startAudio();
      raf = requestAnimationFrame(loop);
    } else {
      stopAudio();
      cancelAnimationFrame(raf);
    }
  };

  // ── 이벤트 배선 ──────────────────────────────────────
  for (const id of Object.keys(maps)) {
    bus.on(`map:enter:${id}`, () => {
      inRoom = id === ROOM_ID;
      sync();
    });
  }
  bus.on(POWER_EVENT, () => {
    powered = true;
    sync();
    // 경보 개시 대사 — P1 클리어 대사가 끝난 뒤에 재생 (대사 겹침 방지)
    if (!saidAlarm && inRoom) {
      saidAlarm = true;
      const waitQuiet = setInterval(() => {
        if (isDialogueBusy()) return;
        clearInterval(waitQuiet);
        void showDialogue("#sn-alarm-start", app);
      }, 400);
    }
  });
  bus.on(CUT_EVENT, () => {
    cut = true;
    sync();
  });

  // 이어하기로 곧장 이 방에서 재개하는 경우 — map:enter가 다시 오지 않으므로 즉시 동기화
  sync();
}
