/**
 * 앰비언스 — 연구소 저역 험(hum). 외부 에셋 없이 WebAudio로 합성한다.
 * ~55Hz 사인 + 아주 낮은 게인 + 느린 LFO로 미세하게 숨쉬는 배경음.
 * 반드시 사용자 제스처(타이틀 클릭) 안에서 start()할 것 — autoplay 정책.
 *
 * 체인: hum ─▶ lfoGain(LFO가 흔드는 게인) ─▶ master(음소거 램프) ─▶ 출력
 * LFO 변조와 음소거를 분리해야 음소거 중에 LFO가 소리를 다시 밀어올리지 않는다.
 */
import { audioCtx, isMuted, onMuteChange } from "./sfx";

const BASE_GAIN = 0.025;
const RAMP_S = 1.2; // 음소거 토글 시 게인 램프 시간

let started = false;

export const Ambience = {
  /** 멱등 — 두 번 불러도 험이 겹치지 않는다 */
  start(): void {
    if (started) return;
    const ac = audioCtx();
    if (!ac) return;
    started = true;
    if (ac.state === "suspended") void ac.resume();

    const master = ac.createGain();
    master.gain.value = isMuted() ? 0 : 1;
    master.connect(ac.destination);

    const lfoGain = ac.createGain();
    lfoGain.gain.value = BASE_GAIN;
    lfoGain.connect(master);

    const hum = ac.createOscillator();
    hum.type = "sine";
    hum.frequency.value = 55;
    hum.connect(lfoGain);

    // 느린 LFO(0.1Hz)가 게인을 ±40% 흔들어 "기계가 살아 있는" 느낌을 준다
    const lfo = ac.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.1;
    const lfoDepth = ac.createGain();
    lfoDepth.gain.value = BASE_GAIN * 0.4;
    lfo.connect(lfoDepth);
    lfoDepth.connect(lfoGain.gain);

    hum.start();
    lfo.start();

    onMuteChange((muted) => {
      const t = ac.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(muted ? 0 : 1, t + RAMP_S);
    });
  },
};
