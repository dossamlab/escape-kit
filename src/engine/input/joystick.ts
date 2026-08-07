/**
 * 모바일 가상 조이스틱 + ACT(상호작용) 버튼.
 * Pointer Events 통일 계층(onDrag) 위에서 동작 — 터치/마우스 공용.
 * 표시 여부는 엔진이 결정 (pointer: coarse 감지).
 */
import { onDrag } from "./pointer";

const KNOB_RADIUS = 40; // 노브 최대 이동 반경(px)

export class VirtualJoystick {
  private dir: [number, number] = [0, 0];
  private root: HTMLElement;
  private detach: (() => void)[] = [];

  constructor(host: HTMLElement, onInteract: () => void) {
    this.root = document.createElement("div");
    this.root.className = "joystick-layer";
    this.root.dataset.testid = "joystick-layer";

    const base = document.createElement("div");
    base.className = "joystick-base";
    const knob = document.createElement("div");
    knob.className = "joystick-knob";
    base.appendChild(knob);

    const act = document.createElement("button");
    act.className = "act-button";
    act.dataset.testid = "act-button";
    act.textContent = "ACT";

    this.root.append(base, act);
    host.appendChild(this.root);

    this.detach.push(
      onDrag(base, {
        onMove: (s) => {
          const len = Math.hypot(s.dx, s.dy);
          const clamped = Math.min(len, KNOB_RADIUS);
          const nx = len > 0 ? s.dx / len : 0;
          const ny = len > 0 ? s.dy / len : 0;
          knob.style.transform = `translate(${nx * clamped}px, ${ny * clamped}px)`;
          // 데드존 20% — 미세 떨림 무시
          this.dir = clamped > KNOB_RADIUS * 0.2 ? [nx, ny] : [0, 0];
        },
        onEnd: () => {
          knob.style.transform = "";
          this.dir = [0, 0];
        },
      })
    );

    act.addEventListener("click", onInteract);
  }

  /** 현재 화면 기준 방향 (정규화) */
  direction(): [number, number] {
    return this.dir;
  }

  destroy(): void {
    this.detach.forEach((d) => d());
    this.root.remove();
  }
}

/** 터치 우선 환경인가 (가상 조이스틱 표시 기준) */
export function isTouchDevice(): boolean {
  return window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
}
