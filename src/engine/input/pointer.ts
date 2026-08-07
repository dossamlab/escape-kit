/**
 * Pointer Events 통일 계층.
 * 퍼즐 코드는 이 헬퍼만 사용한다 — 마우스/터치를 구분하지 않는다.
 * (CLAUDE.md 규칙: 퍼즐에서 pointerdown 직접 바인딩 금지)
 */

export interface DragState {
  /** 드래그 시작점 기준 총 이동량(px) */
  dx: number;
  dy: number;
  /** 요소 로컬 좌표 (getBoundingClientRect 기준) */
  x: number;
  y: number;
  /** 뷰포트(클라이언트) 좌표 — 다른 요소 기준 히트 판정용 */
  clientX: number;
  clientY: number;
}

export interface DragCallbacks {
  onStart?: (s: DragState) => void;
  onMove?: (s: DragState) => void;
  onEnd?: (s: DragState) => void;
}

/**
 * 대상 요소에 드래그 핸들러를 부착한다. 반환값은 해제 함수.
 * touch-action: none을 자동 지정해 모바일 드래그 중 화면 스크롤을 막는다.
 */
export function onDrag(target: HTMLElement | SVGElement, cb: DragCallbacks): () => void {
  (target as HTMLElement).style.touchAction = "none";

  let startX = 0;
  let startY = 0;
  let activeId: number | null = null;

  const local = (e: PointerEvent): DragState => {
    const rect = target.getBoundingClientRect();
    return {
      dx: e.clientX - startX,
      dy: e.clientY - startY,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      clientX: e.clientX,
      clientY: e.clientY,
    };
  };

  const down = (e: PointerEvent) => {
    if (activeId !== null) return; // 멀티터치 중복 방지: 첫 포인터만
    activeId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      // 합성(dispatchEvent) 포인터는 캡처 불가 — 캡처 없이도 대상에 직접 전달되므로 무시
    }
    cb.onStart?.(local(e));
  };
  const move = (e: PointerEvent) => {
    if (e.pointerId !== activeId) return;
    cb.onMove?.(local(e));
  };
  const up = (e: PointerEvent) => {
    if (e.pointerId !== activeId) return;
    activeId = null;
    cb.onEnd?.(local(e));
  };

  target.addEventListener("pointerdown", down as EventListener);
  target.addEventListener("pointermove", move as EventListener);
  target.addEventListener("pointerup", up as EventListener);
  target.addEventListener("pointercancel", up as EventListener);

  return () => {
    target.removeEventListener("pointerdown", down as EventListener);
    target.removeEventListener("pointermove", move as EventListener);
    target.removeEventListener("pointerup", up as EventListener);
    target.removeEventListener("pointercancel", up as EventListener);
  };
}

/** 탭(짧은 터치/클릭) 헬퍼 — 이동량이 작고 짧게 끝난 포인터 조작 */
export function onTap(target: HTMLElement | SVGElement, handler: () => void): () => void {
  const THRESHOLD_PX = 8;
  return onDrag(target, {
    onEnd: (s) => {
      if (Math.hypot(s.dx, s.dy) < THRESHOLD_PX) handler();
    },
  });
}
