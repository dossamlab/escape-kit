/** PC 이동 입력: 방향키/WASD → 정규화된 방향 벡터. 모바일 가상 조이스틱은 2단계에서 추가. */

const KEY_DIRS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  KeyW: [0, -1],
  KeyS: [0, 1],
  KeyA: [-1, 0],
  KeyD: [1, 0],
};

export class KeyboardInput {
  private pressed = new Set<string>();
  /** 상호작용 키(E/Space) 눌림 이벤트 구독자 */
  onInteract: (() => void) | null = null;

  attach(target: Window = window): () => void {
    const down = (e: KeyboardEvent) => {
      if (KEY_DIRS[e.code]) {
        this.pressed.add(e.code);
        e.preventDefault();
      }
      if (e.code === "KeyE" || e.code === "Space") this.onInteract?.();
    };
    const up = (e: KeyboardEvent) => this.pressed.delete(e.code);
    /**
     * 눌린 키를 통째로 비운다 — **창이 포커스를 잃으면 keyup이 영영 안 온다.**
     * (alt-tab, 주소창 클릭, 개발자도구 열기, 탭 전환) 그때 키가 눌린 채로 남으면
     * 캐릭터가 입력 없이 혼자 걷는다. 2026-08-19 제보로 잡았고 input.spec.ts가 지킨다.
     */
    const clear = () => this.pressed.clear();
    const onVisibility = () => {
      if (target.document.hidden) clear();
    };
    target.addEventListener("keydown", down);
    target.addEventListener("keyup", up);
    target.addEventListener("blur", clear);
    target.document.addEventListener("visibilitychange", onVisibility);
    return () => {
      target.removeEventListener("keydown", down);
      target.removeEventListener("keyup", up);
      target.removeEventListener("blur", clear);
      target.document.removeEventListener("visibilitychange", onVisibility);
    };
  }

  /** 현재 프레임의 이동 방향 (정규화, 대각선 √2 보정) */
  direction(): [number, number] {
    let x = 0;
    let y = 0;
    for (const code of this.pressed) {
      const d = KEY_DIRS[code];
      if (d) {
        x += d[0];
        y += d[1];
      }
    }
    const len = Math.hypot(x, y);
    return len > 0 ? [x / len, y / len] : [0, 0];
  }
}
