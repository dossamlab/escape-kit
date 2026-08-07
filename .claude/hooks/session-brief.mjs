#!/usr/bin/env node
/**
 * SessionStart 훅 — 세션 시작·재개·clear·compact 직후 프로젝트 브리핑을 컨텍스트에 주입한다.
 *
 * 컨텍스트가 비워져도 "지금 어디까지 했고 다음이 뭔지"를 매번 다시 설명하지 않기 위한 장치.
 * 고정 내용은 .claude/session-brief.md가 소유하고(사람이 편집), 여기서는 거기에
 * **실시간 git 상태**(최근 커밋·작업 트리)를 붙여 브리핑이 낡지 않게 한다.
 *
 * 출력: stdout에 JSON — hookSpecificOutput.additionalContext (최대 10,000자)
 * 실패해도 세션을 막지 않는다 (항상 exit 0).
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MAX = 10_000;

const git = (...args) => {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
};

try {
  let brief = "";
  try {
    brief = readFileSync(join(root, ".claude", "session-brief.md"), "utf8").trim();
  } catch {
    brief = "(.claude/session-brief.md 없음 — 고정 브리핑 미설정)";
  }

  const log = git("log", "--oneline", "-5");
  const status = git("status", "--short");
  const branch = git("rev-parse", "--abbrev-ref", "HEAD");

  const live = [
    `브랜치: ${branch || "?"}`,
    "",
    "최근 커밋:",
    log || "(없음)",
    "",
    status ? `작업 트리 (미커밋 ${status.split("\n").length}건):\n${status}` : "작업 트리: 깨끗",
  ].join("\n");

  const text = `${brief}\n\n## 현재 저장소 상태 (세션 시작 시점 자동 수집)\n\n${live}`;

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: text.slice(0, MAX),
      },
      suppressOutput: true,
    })
  );
} catch {
  /* 브리핑 실패는 무시 — 세션 시작을 막지 않는다 */
}
