/**
 * 게임 텍스트가 쓸 수 있는 유일한 인라인 표기 — `==강조==`.
 *
 * story.md의 굵게(`**`)는 build-story가 벗겨 내므로, 화면에 남는 강조는 이것뿐이다.
 * 쓰는 자리는 하나로 정해 둔다: **퍼즐의 답을 직접 정하는 문구**.
 * (그 시대의 기온, 그 반응의 방향처럼 학생이 그대로 조작에 옮길 사실.)
 * 분위기용 강조로 쓰면 표시가 흔해져 단서 구실을 못 한다.
 */

/** `==강조==` 구간만 <mark>로 세우고 나머지는 텍스트 노드로 붙인다 */
export function setInline(el: HTMLElement, text: string): void {
  for (const part of text.split(/(==[^=]+==)/)) {
    if (!part) continue;
    if (part.startsWith("==") && part.endsWith("==")) {
      const mark = document.createElement("mark");
      mark.className = "key-phrase";
      mark.textContent = part.slice(2, -2);
      el.appendChild(mark);
    } else {
      el.appendChild(document.createTextNode(part));
    }
  }
}
