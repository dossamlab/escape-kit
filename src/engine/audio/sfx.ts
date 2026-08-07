/**
 * 효과음 — ZzFX (MIT, 코드로 생성하는 초경량 신디사이저, 외부 에셋·유료 없음).
 * https://github.com/KilledByAPixel/ZzFX (MIT License, Frank Force)
 * WebAudio로 즉석 합성하므로 파일이 필요 없다. 첫 사용자 제스처 후에만 소리가 난다.
 *
 * 음소거 상태는 localStorage에 보존한다.
 */

const MUTE_KEY = "quantum-escape:muted:v1";
let muted = false;
try {
  muted = localStorage.getItem(MUTE_KEY) === "1";
} catch {
  /* 무시 */
}

let ctx: AudioContext | null = null;
/** 공유 AudioContext — 앰비언스도 같은 컨텍스트를 쓴다 (브라우저당 컨텍스트 수 제한) */
export function audioCtx(): AudioContext | null {
  if (typeof AudioContext === "undefined") return null;
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

/**
 * ZzFX 코어 (축약 이식). 파라미터로 파형을 생성해 재생한다.
 * 인자는 원본 ZzFX 순서를 따른다: volume, randomness(미사용), frequency, attack, sustain,
 * release, shape, shapeCurve, slide, deltaSlide, pitchJump, pitchJumpTime,
 * repeatTime, noise, modulation, bitCrush, delay, sustainVolume, decay, tremolo.
 * (randomness는 프리셋 재현성을 위해 생략 — 위치는 원본과 맞춰 hole로 둔다)
 */
function zzfx(...p: number[]): void {
  if (muted) return;
  const ac = audioCtx();
  if (!ac) return;
  if (ac.state === "suspended") void ac.resume();

  const [
    volume = 1,
    ,
    frequency = 220,
    attack = 0,
    sustain = 0,
    release = 0.1,
    shape = 0,
    shapeCurve = 1,
    slide = 0,
    deltaSlide = 0,
    pitchJump = 0,
    pitchJumpTime = 0,
    repeatTime = 0,
    noise = 0,
    modulation = 0,
    bitCrush = 0,
    delay = 0,
    sustainVolume = 1,
    decay = 0,
    tremolo = 0,
  ] = p;

  const sampleRate = 44100;
  const PI2 = Math.PI * 2;
  const sign = (v: number) => (v > 0 ? 1 : -1);
  let freq = (frequency * PI2) / sampleRate;
  let slideV = (slide * 500 * PI2) / sampleRate ** 2;
  const deltaSlideV = (deltaSlide * 500 * PI2) / sampleRate ** 2;
  const pitchJV = (pitchJump * PI2) / sampleRate;
  const pitchJT = (pitchJumpTime * sampleRate) | 0;
  const repeatT = (repeatTime * sampleRate) | 0;
  const modV = (modulation * PI2) / sampleRate;

  const attackS = (attack * sampleRate) | 0 || 1;
  const decayS = (decay * sampleRate) | 0;
  const sustainS = (sustain * sampleRate) | 0;
  const releaseS = (release * sampleRate) | 0;
  const delayS = (delay * sampleRate) | 0;
  const length = attackS + decayS + sustainS + releaseS + delayS;

  const buffer = ac.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);

  let phase = 0;
  for (let i = 0; i < length; i++) {
    // shape: 0 sine, 1 triangle, 2 saw, 3 tan-ish, 4 noise
    const cyc = phase % PI2;
    let w: number;
    if (shape === 1) w = 1 - (4 * Math.abs(Math.round(cyc / PI2) - cyc / PI2));
    else if (shape === 2) w = 1 - ((2 * (cyc / PI2)) % 2);
    else if (shape === 4 || noise) w = Math.random() * 2 - 1;
    else w = Math.sin(cyc);
    w = sign(w) * Math.abs(w) ** shapeCurve;

    // 엔벨로프
    let env: number;
    if (i < attackS) env = i / attackS;
    else if (i < attackS + decayS) env = 1 - ((i - attackS) / decayS) * (1 - sustainVolume);
    else if (i < attackS + decayS + sustainS) env = sustainVolume;
    else env = sustainVolume * (1 - (i - attackS - decayS - sustainS) / releaseS);
    if (i < delayS) env = 0;

    const trem = 1 + tremolo * Math.sin((i / sampleRate) * PI2 * 8);
    const s = w * env * volume * trem * 0.4;
    data[i] = Math.max(-1, Math.min(1, bitCrush ? Math.round(s * 8) / 8 : s));

    // 주파수 변화
    freq += slideV;
    slideV += deltaSlideV;
    phase += freq + modV * Math.sin((i / sampleRate) * PI2 * 5);
    if (pitchJT && i === pitchJT) freq += pitchJV;
    if (repeatT && i % repeatT === 0) {
      phase = 0;
      freq = (frequency * PI2) / sampleRate;
    }
  }

  const src = ac.createBufferSource();
  src.buffer = buffer;
  src.connect(ac.destination);
  src.start();
}

/** 게임 효과음 프리셋 (파라미터는 톤에 맞춰 조정) */
export const Sfx = {
  select: () => zzfx(0.5, 0.02, 520, 0, 0.02, 0.08, 0, 1.5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0),
  confirm: () => zzfx(0.5, 0.02, 660, 0, 0.04, 0.14, 0, 1.2, 0, 0, 220, 0.03, 0, 0, 0, 0, 0, 1, 0, 0),
  success: () => zzfx(0.6, 0.02, 523, 0.01, 0.09, 0.2, 1, 1, 0, 0, 300, 0.06, 0, 0, 0, 0, 0, 1, 0, 0),
  error: () => zzfx(0.5, 0.03, 160, 0, 0.05, 0.16, 2, 1.3, -3, 0, 0, 0, 0, 0.4, 0, 0.2, 0, 1, 0, 0),
  note: () => zzfx(0.4, 0.02, 780, 0, 0.03, 0.1, 0, 1.4, 0, 0, 400, 0.02, 0, 0, 0, 0, 0, 1, 0, 0),
  door: () => zzfx(0.55, 0.03, 220, 0.02, 0.12, 0.24, 2, 0.9, 3, 0, 0, 0, 0, 0.1, 0, 0, 0, 1, 0, 0.05),
  lightsOn: () => zzfx(0.5, 0.02, 330, 0.05, 0.2, 0.35, 0, 1, 0, 0, 500, 0.1, 0, 0, 0, 0, 0, 1, 0, 0.06),
  transition: () => zzfx(0.4, 0.02, 300, 0, 0.05, 0.12, 1, 1, 6, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0),
  launch: () => zzfx(0.5, 0.02, 520, 0.01, 0.06, 0.28, 4, 1, -9, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0),
  zap: () => zzfx(0.3, 0.02, 820, 0, 0.015, 0.05, 2, 1.4, 0, 0, 0, 0, 0, 0.15, 0, 0.3, 0, 1, 0, 0),
};

export function isMuted(): boolean {
  return muted;
}

const muteListeners: Array<(muted: boolean) => void> = [];

/** 음소거 변경 구독 — 앰비언스처럼 지속음을 내는 쪽이 게인을 맞추는 데 쓴다 */
export function onMuteChange(cb: (muted: boolean) => void): void {
  muteListeners.push(cb);
}

export function setMuted(v: boolean): void {
  muted = v;
  try {
    localStorage.setItem(MUTE_KEY, v ? "1" : "0");
  } catch {
    /* 무시 */
  }
  for (const cb of muteListeners) cb(muted);
}

export function toggleMuted(): boolean {
  setMuted(!muted);
  return muted;
}
