/**
 * 오버레이 닫기 규약 — 발견·연구노트처럼 "읽고 닫는" 패널의 공통 처리.
 * 대사 박스(dialogue.ts)와 키를 맞춰, 상호작용 키(E/Space/Enter/Esc)로도 닫히게 한다.
 * 마우스로만 닫아야 하면 키보드로 이동·조사하던 흐름이 끊긴다.
 */

/** 열려 있는 오버레이 스택 — 겹쳐 떠도 맨 위 하나만 키 입력을 받는다 */
const stack: Array<() => void> = [];

/**
 * 닫기 버튼과 키보드를 같은 동작으로 묶는다.
 * 오버레이가 다른 경로로 DOM에서 사라져도 정리는 정확히 한 번 수행되고 done()이 불린다.
 */
export function bindOverlayClose(overlay: HTMLElement, button: HTMLElement, done: () => void): void {
  let settled = false;

  const settle = () => {
    if (settled) return;
    settled = true;
    const i = stack.indexOf(settle);
    if (i >= 0) stack.splice(i, 1);
    observer.disconnect();
    window.removeEventListener("keydown", onKey);
    overlay.remove();
    done();
  };

  const onKey = (e: KeyboardEvent) => {
    // repeat 무시 — 조사 키(E/Space)를 누른 채로 있으면 열리자마자 닫히는 것을 막는다
    if (e.repeat || stack[stack.length - 1] !== settle) return;
    if (e.code === "Space" || e.code === "Enter" || e.code === "KeyE" || e.code === "Escape") {
      e.preventDefault();
      settle();
    }
  };

  // 호스트 오버레이(퍼즐 등)가 통째로 제거되면 이 패널도 함께 사라진다 — 그때도 정리
  const observer = new MutationObserver(() => {
    if (!overlay.isConnected) settle();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  stack.push(settle);
  button.addEventListener("click", settle);
  window.addEventListener("keydown", onKey);
}

/** 닫기 버튼 옆에 붙이는 키 안내 (Space·E·Esc) */
export function makeCloseHint(): HTMLElement {
  const hint = document.createElement("span");
  hint.className = "overlay-hint";
  hint.textContent = "Space · E · Esc";
  return hint;
}
