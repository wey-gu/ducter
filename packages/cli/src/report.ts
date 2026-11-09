// `ducter report`: a diagnostics bundle for "Report a problem". It never uploads anything:
// the files land in a folder the person can read first, and the issue link is only prefilled.
// No Log content unless they ask for the last conversation (--include-conversation).
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { redactSecrets } from "@ducter/partner";
import type { DoctorReport } from "./doctor.ts";
import type { Locale } from "./i18n.ts";

export const ISSUE_BASE = "https://github.com/wey-gu/ducter/issues/new";
export const MAX_ISSUE_URL = 6000;
export const LOG_LINES = 500;
const R = "[removed]";

/**
 * The CLI's redactor for anything that leaves the machine: the partner's secret shapes (API keys,
 * tokens, private keys), then headers, key=value secrets, JSON secret fields, pairing codes,
 * emails, and the home folder as ~.
 */
export function redactReport(text: string, o: { home?: string } = {}): string {
  let s = redactSecrets(text).replace(/\[secret removed:[^\]]*\]/g, R);
  s = s
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g, R)
    .replace(/\b(authorization|proxy-authorization)(\s*[:=]\s*)("?)[^\n"]+\3/gi, `$1$2${R}`)
    .replace(/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, `$1 ${R}`)
    .replace(/("(?:[a-z_]*)(?:token|secret|password|passwd|apikey|api_key|key|code|cookie|auth)"\s*:\s*)"[^"]*"/gi, `$1"${R}"`)
    .replace(/\b([a-z_]*(?:token|secret|password|passwd|apikey|api_key|key|code|cookie|sig))=([^\s&"'<>]+)/gi, `$1=${R}`)
    .replace(/\b(code|码|连接码)(\s*[:：]?\s*)([A-Z0-9]{3,}-?[A-Z0-9]{3,})\b/g, `$1$2${R}`)
    .replace(/\b(?=[A-Z0-9-]*\d)(?=[A-Z0-9-]*[A-Z])[A-Z0-9]{4}-[A-Z0-9]{4}\b/g, R)
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, R);
  if (o.home && o.home.length > 1) s = s.split(o.home).join("~");
  return s;
}

/** The last n lines of a file ("" if missing). */
export function tailLines(path: string, n: number): string {
  try {
    const lines = readFileSync(path, "utf8").split("\n");
    if (lines.at(-1) === "") lines.pop();
    return lines.slice(-n).join("\n") + "\n";
  } catch {
    return "";
  }
}

/** The channel's last messages (user and partner), read-only, oldest first. */
export function lastConversation(dbPath: string, limit = 100): string {
  if (!existsSync(dbPath)) return "";
  const db = new Database(dbPath, { readonly: true });
  try {
    const rows = db
      .query("SELECT ts, kind, body FROM events WHERE stream = 'channel' AND kind IN ('user_msg', 'ai_msg') ORDER BY seq DESC LIMIT ?")
      .all(limit) as { ts: string; kind: string; body: string }[];
    return rows
      .reverse()
      .map((r) => {
        let text = "";
        try {
          text = String((JSON.parse(r.body) as { text?: string }).text ?? "");
        } catch {}
        return `[${r.ts}] ${r.kind === "user_msg" ? "you" : "partner"}: ${text}`;
      })
      .join("\n\n") + "\n";
  } finally {
    db.close();
  }
}

export interface ReportInput {
  dataDir: string;
  out?: string;
  home: string;
  includeConversation: boolean;
  doctor: DoctorReport;
  versions: string;
  locale: Locale;
}

export interface ReportResult {
  dir: string;
  files: { name: string; bytes: number }[];
  issueUrl: string;
}

export function writeReport(i: ReportInput): ReportResult {
  const dir = i.out ?? mkdtempSync(join(tmpdir(), "ducter-report-"));
  mkdirSync(dir, { recursive: true });
  const red = (s: string) => redactReport(s, { home: i.home });
  const files: [string, string][] = [
    ["doctor.json", red(JSON.stringify(i.doctor, null, 2)) + "\n"],
    ["versions.txt", red(i.versions)],
    ["app.log.txt", red(tailLines(join(i.dataDir, "app.log"), LOG_LINES))],
    ["ducter.log.txt", red(tailLines(join(i.dataDir, "ducter.log"), LOG_LINES))],
  ];
  if (i.includeConversation) files.push(["conversation.txt", red(lastConversation(join(i.dataDir, "ducter.db")))]);
  for (const [name, body] of files) writeFileSync(join(dir, name), body, { mode: 0o600 });
  return {
    dir,
    files: files.map(([name]) => ({ name, bytes: statSync(join(dir, name)).size })),
    issueUrl: issueUrl(i.versions, i.doctor, i.locale, i.home),
  };
}

export function issueUrl(versions: string, doctor: DoctorReport, locale: Locale, home = ""): string {
  const zh = locale === "zh";
  const notOk = doctor.checks.filter((c) => c.status !== "ok").map((c) => `- ${c.id}: ${c.status}`);
  const head = [
    zh ? "## 发生了什么" : "## What happened",
    "",
    zh ? "（请描述你做了什么、看到了什么）" : "(What you did, and what you saw)",
    "",
    zh ? "## 版本" : "## Versions",
    "",
    "```",
  ];
  const tail = [
    "```",
    "",
    zh ? "## 检查结果（未通过的项）" : "## Doctor (items not ok)",
    "",
    ...(notOk.length ? notOk : [zh ? "- 全部通过" : "- all ok"]),
    "",
    zh ? "请把桌面上的 .zip 拖到这里附上（发之前可以先打开看看）。" : "Attach the .zip from your Desktop (you can open it first to see what's inside).",
  ];
  const title = zh ? "问题：" : "Problem: ";
  let v = redactReport(versions.trim(), { home });
  for (;;) {
    const body = [...head, v, ...tail].join("\n");
    const url = `${ISSUE_BASE}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
    if (url.length <= MAX_ISSUE_URL || v.length < 40) return url.length <= MAX_ISSUE_URL ? url : url.slice(0, MAX_ISSUE_URL).replace(/%[0-9A-F]?$/i, "");
    v = v.slice(0, Math.floor(v.length * 0.7));
  }
}

/** versions.txt: Ducter, the app, the OS, Bun. */
export function versionsText(o: { versionLine: string; env: Record<string, string | undefined>; os: string }): string {
  return [o.versionLine, o.env.DUCTER_APP_VERSION ? `app ${o.env.DUCTER_APP_VERSION}` : "", o.os.trim(), `bun ${Bun.version}`].filter(Boolean).join("\n") + "\n";
}

export function osText(platform: NodeJS.Platform): string {
  const run = (c: string[]) => {
    const r = Bun.spawnSync(c, { stdout: "pipe", stderr: "ignore", stdin: "ignore" });
    return r.exitCode === 0 ? r.stdout.toString().trim() : "";
  };
  const sw = platform === "darwin" ? run(["sw_vers"]) : "";
  return [sw, run(["uname", "-srm"])].filter(Boolean).join("\n");
}
