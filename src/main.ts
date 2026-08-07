import "./style.css";
import tokens from "../design-tokens.json";
import { showDialogue } from "./engine/narrative/dialogue";
import { bus } from "./engine/events/EventBus";
import { Game } from "./engine/core/Game";
import { maps, FIRST_ROOM } from "./maps";
import { loadProgress, hasProgress, clearProgress, saveProgress } from "./engine/core/save";
import { Sfx } from "./engine/audio/sfx";
import { Ambience } from "./engine/audio/ambience";
import { initSonicRoomFx } from "./puzzles/silent-node/roomfx";
import type { GameMap } from "./maps/types";
import {
  TITLE_SUB,
  TITLE_MAIN,
  START_LABEL,
  CHAR_SELECT_LABEL,
  CREDIT,
  CONTACT_EMAIL,
  CONTACT_CATEGORIES,
} from "./config";

/** design-tokens.json → :root CSS 변수 주입 (색·치수 단일 소스) */
function applyTokens(): void {
  const root = document.documentElement.style;
  for (const [name, value] of Object.entries(tokens.color)) {
    root.setProperty(`--color-${name}`, value);
  }
  root.setProperty("--stroke-outline", `${tokens.stroke.outline}px`);
  root.setProperty("--glow-blur", `${tokens.stroke["glow-blur"]}px`);
  root.setProperty("--corner-radius", `${tokens["corner-radius"]}px`);
  root.setProperty("--font-family", tokens.font.family);
  root.setProperty("--font-holo-letter-spacing", tokens.font["holo-letter-spacing"]);
}

/** 문의하기 — Netlify Forms 제출, 실패 시(로컬 실행 등) 메일 앱 폴백 */
function showContactForm(app: HTMLElement): void {
  const overlay = document.createElement("div");
  overlay.className = "contact-overlay";
  overlay.dataset.testid = "contact-overlay";

  const panel = document.createElement("form");
  panel.className = "contact-panel";

  const title = document.createElement("div");
  title.className = "contact-title";
  title.textContent = "문의하기";

  const fieldset = document.createElement("fieldset");
  fieldset.className = "contact-categories";
  for (const [i, label] of CONTACT_CATEGORIES.entries()) {
    const wrap = document.createElement("label");
    wrap.className = "contact-radio";
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "category";
    radio.value = label;
    radio.checked = i === 0;
    wrap.append(radio, document.createTextNode(label));
    fieldset.appendChild(wrap);
  }

  const textarea = document.createElement("textarea");
  textarea.className = "contact-textarea";
  textarea.name = "message";
  textarea.dataset.testid = "contact-message";
  textarea.placeholder = "내용을 적어 주세요. 버그라면 어느 장치에서 무슨 일이 있었는지 알려 주시면 큰 도움이 됩니다.";
  textarea.rows = 5;

  const status = document.createElement("div");
  status.className = "contact-status";
  status.dataset.testid = "contact-status";

  const actions = document.createElement("div");
  actions.className = "contact-actions";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "title-start contact-btn";
  cancel.dataset.testid = "contact-close";
  cancel.textContent = "닫기";
  const send = document.createElement("button");
  send.type = "submit";
  send.className = "title-start contact-btn";
  send.dataset.testid = "contact-submit";
  send.textContent = "제출";
  actions.append(cancel, send);

  const close = () => {
    document.removeEventListener("keydown", onKey);
    overlay.remove();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
  };
  document.addEventListener("keydown", onKey);
  cancel.addEventListener("click", close);

  panel.addEventListener("submit", (e) => {
    e.preventDefault();
    const checked = panel.querySelector<HTMLInputElement>('input[name="category"]:checked');
    const category = checked?.value ?? CONTACT_CATEGORIES[0];
    const message = textarea.value.trim();
    if (!message) {
      status.textContent = "내용을 입력해 주세요.";
      return;
    }
    send.disabled = true;
    status.textContent = "보내는 중…";
    void fetch("/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ "form-name": "contact", category, message }).toString(),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        Sfx.confirm();
        status.textContent = "전송 완료! 소중한 의견 감사합니다.";
        setTimeout(close, 1500);
      })
      .catch(() => {
        // 로컬 실행·폼 미설정 등 — 기기의 메일 앱으로 폴백
        const subject = encodeURIComponent(`[${TITLE_SUB}] ${category}`);
        const body = encodeURIComponent(message);
        window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
        status.textContent = "전송 서버에 연결하지 못해 메일 앱을 엽니다.";
        send.disabled = false;
      });
  });

  panel.append(title, fieldset, textarea, status, actions);
  overlay.appendChild(panel);
  app.appendChild(overlay);
  textarea.focus();
}

function showTitle(app: HTMLElement): void {
  const screen = document.createElement("div");
  screen.className = "title-screen";
  screen.dataset.testid = "title-screen";

  const sub = document.createElement("div");
  sub.className = "title-sub";
  sub.textContent = TITLE_SUB;

  const main = document.createElement("h1");
  main.className = "title-main";
  // 작은 영문 시리즈명 + 큰 한글 부제. 한 방 이름을 부제로 쓰면 방이 늘었을 때
  // 한 방이 전체를 대표하는 꼴이 된다. 브라우저·링크 제목은 index.html이 따로 들고 있다.
  main.textContent = TITLE_MAIN;

  const buttons = document.createElement("div");
  buttons.className = "title-buttons";

  // 저장된 진행이 있으면 '이어하기'를 먼저 노출
  if (hasProgress()) {
    const cont = document.createElement("button");
    cont.className = "title-start";
    cont.dataset.testid = "continue-button";
    cont.textContent = "이어하기";
    cont.addEventListener("click", () => {
      Sfx.confirm();
      Ambience.start(); // 사용자 제스처 안 — autoplay 정책 안전
      screen.remove();
      void startContinue(app);
    });
    buttons.appendChild(cont);
  }

  const start = document.createElement("button");
  start.className = "title-start";
  start.dataset.testid = "start-button";
  start.textContent = hasProgress() ? "처음부터" : START_LABEL;
  start.addEventListener("click", () => {
    Sfx.confirm();
    Ambience.start();
    clearProgress();
    screen.remove();
    void showCharSelect(app).then((character) => {
      saveProgress({ events: [], notes: [], character });
      void startPrologue(app);
    });
  });
  buttons.appendChild(start);

  const footer = document.createElement("div");
  footer.className = "title-footer";
  const credit = document.createElement("div");
  credit.className = "title-credit";
  credit.textContent = CREDIT;
  const contact = document.createElement("button");
  contact.className = "title-contact";
  contact.dataset.testid = "contact-button";
  contact.textContent = "문의하기";
  contact.addEventListener("click", () => {
    Sfx.select();
    showContactForm(app);
  });
  footer.append(credit, contact);

  screen.append(sub, main, buttons, footer);
  app.appendChild(screen);
}

/** 새 시작 시 캐릭터 선택 — 픽셀 스프라이트 2종 중 탭 */
function showCharSelect(app: HTMLElement): Promise<"m" | "f"> {
  return new Promise((resolve) => {
    const screen = document.createElement("div");
    screen.className = "char-select";
    screen.dataset.testid = "char-select";

    const title = document.createElement("div");
    title.className = "title-sub";
    title.textContent = CHAR_SELECT_LABEL;

    const row = document.createElement("div");
    row.className = "char-select-row";

    const BASE = import.meta.env.BASE_URL;
    for (const g of ["m", "f"] as const) {
      const btn = document.createElement("button");
      btn.className = "char-select-btn";
      btn.dataset.testid = `char-${g}`;
      const img = document.createElement("img");
      img.src = `${BASE}assets/char-${g}-se-idle.png`;
      img.alt = g === "m" ? "남학생" : "여학생";
      btn.appendChild(img);
      btn.addEventListener("click", () => {
        Sfx.confirm();
        screen.remove();
        resolve(g);
      });
      row.appendChild(btn);
    }

    screen.append(title, row);
    app.appendChild(screen);
  });
}

/** 방별 배선 — 방에 처음 들어설 때 한 번만 실행할 것들.
 *
 *  ⚠ **`new Game(...)` 전에 호출해야 한다.** `map:enter`는 첫 방에서도 발화하는데
 *  (`Game.start()` 끝), 그 뒤에 구독하면 첫 방의 발화를 놓친다.
 *
 *  방 인트로 대사도 같은 자리에 건다:
 *
 *    const shown = new Set<string>();
 *    bus.on(`map:enter:<방 id>`, () => {
 *      if (shown.has("<방 id>")) return;
 *      shown.add("<방 id>");
 *      void showDialogue("#<인트로 앵커>", app);
 *    });
 *
 *  다만 첫 방의 인트로는 프롤로그 대사 **뒤에** 와야 순서가 맞으므로
 *  startPrologue에서 직접 재생한다 (map:enter는 start() 시점 = 튜토리얼보다 앞이다). */
function registerRoomFx(app: HTMLElement): void {
  // 청음실 룸 오디오(경보 간섭 음장 + 소음 미터) — 모달 없는 퍼즐 silent-node의 무대장치
  initSonicRoomFx(app);
}

async function startPrologue(app: HTMLElement): Promise<void> {
  await showDialogue("#prologue-wake", app);
  registerRoomFx(app);

  const game = new Game(app, FIRST_ROOM);
  await game.start();
  bus.emit("prologue:done");

  await showDialogue("#prologue-tutorial", app);
  await showDialogue("#prologue-rule", app); // 시험 규칙: 네 자리 열쇠는 네 장치에 나뉘어 있다
  await showDialogue("#sn-room-intro", app);
}

/** 이어하기: 프롤로그 생략, 마지막 방에서 재개 */
async function startContinue(app: HTMLElement): Promise<void> {
  const saved = loadProgress();
  const startMap: GameMap = (saved.lastMap && maps[saved.lastMap]) || FIRST_ROOM;
  registerRoomFx(app);

  const game = new Game(app, startMap);
  await game.start();
  bus.emit("prologue:done");
}

const app = document.getElementById("app");
if (!app) throw new Error("#app 루트가 없습니다");
applyTokens();
showTitle(app);
