import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DoctorReport } from "../src/doctor.ts";
import { issueUrl, MAX_ISSUE_URL, redactReport, writeReport } from "../src/report.ts";

const HOME = "/Users/anna";

describe("redactReport", () => {
  const cases: [string, string, string?][] = [
    ["key in a log line", "[runner] calling with sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789", "sk-ant"],
    ["github token", "push failed for ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "ghp_"],
    ["authorization header", "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig", "eyJhbGci"],
    ["bearer alone", "sent bearer abcdefgh12345678 to core", "abcdefgh12345678"],
    ["token query", "dial ws://127.0.0.1:7777/ws?token=dt_9f8e7d6c5b4a&x=1", "dt_9f8e7d6c5b4a"],
    ["password=", "DUCTER_PASSWORD=hunter2 set", "hunter2"],
    ["json token", '{"deviceToken": "abc123secret", "ok": true}', "abc123secret"],
    ["pairing code", "pairing code K7QM-4XPA expires in 10 min", "K7QM-4XPA"],
    ["email", "signed in as anna.li@example.com", "anna.li@example.com"],
    ["private key", "-----BEGIN OPENSSH PRIVATE KEY-----\nAAAA\n-----END OPENSSH PRIVATE KEY-----", "AAAA"],
  ];
  for (const [name, line, secret] of cases)
    test(name, () => {
      const out = redactReport(line, { home: HOME });
      expect(out).not.toContain(secret!);
      expect(out).toContain("[removed]");
    });

  test("home becomes ~; ordinary lines survive", () => {
    expect(redactReport("[ducter] data: /Users/anna/.ducter, port 7777", { home: HOME })).toBe("[ducter] data: ~/.ducter, port 7777");
    expect(redactReport("task t1 done in 46 s")).toBe("task t1 done in 46 s");
  });
});

const doctor: DoctorReport = {
  ok: false,
  harnessReady: true,
  checks: [
    { id: "claude", label: "Claude Code", status: "ok", required: false, detail: "signed in" },
    { id: "cua", label: "cua-driver", status: "missing", required: false, detail: "not installed" },
  ],
} as unknown as DoctorReport;

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ducter-report-"));
  const lines = Array.from({ length: 800 }, (_, i) => `line ${i}`);
  lines.push("calling with sk-proj-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA for anna@example.com");
  writeFileSync(join(dir, "app.log"), lines.join("\n") + "\n");
  const db = new Database(join(dir, "ducter.db"));
  db.exec("CREATE TABLE events (seq INTEGER PRIMARY KEY, ts TEXT, persona TEXT, stream TEXT, origin TEXT, kind TEXT, body TEXT, supersedes INTEGER)");
  const ins = db.query("INSERT INTO events (ts, persona, stream, origin, kind, body) VALUES (?, 'p', ?, ?, ?, ?)");
  ins.run("2026-11-09T10:00:00Z", "channel", "user", "user_msg", JSON.stringify({ text: "fix the tests, key ghp_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" }));
  ins.run("2026-11-09T10:00:05Z", "channel", "partner", "ai_msg", JSON.stringify({ text: "On it." }));
  ins.run("2026-11-09T10:00:06Z", "task:t1", "runner", "task_event", JSON.stringify({ text: "inside the task" }));
  db.close();
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const write = (includeConversation: boolean) =>
  writeReport({ dataDir: dir, out: join(dir, "out"), home: HOME, includeConversation, doctor, versions: "ducter 0.0.1 (abc)\nmacOS 15.7\n", locale: "en" });

describe("writeReport", () => {
  test("no Log content by default; logs tailed and redacted", () => {
    const r = write(false);
    expect(r.files.map((f) => f.name).sort()).toEqual(["app.log.txt", "doctor.json", "ducter.log.txt", "versions.txt"]);
    expect(readdirSync(r.dir)).not.toContain("conversation.txt");
    const log = readFileSync(join(r.dir, "app.log.txt"), "utf8");
    expect(log.trim().split("\n").length).toBe(500);
    expect(log).not.toContain("sk-proj-");
    expect(log).not.toContain("anna@example.com");
    expect(JSON.parse(readFileSync(join(r.dir, "doctor.json"), "utf8")).checks.length).toBe(2);
  });

  test("--include-conversation adds the channel only, redacted", () => {
    const r = write(true);
    const conv = readFileSync(join(r.dir, "conversation.txt"), "utf8");
    expect(conv).toContain("you: fix the tests");
    expect(conv).toContain("partner: On it.");
    expect(conv).not.toContain("ghp_");
    expect(conv).not.toContain("inside the task");
    expect(existsSync(join(r.dir, "conversation.txt"))).toBe(true);
  });

  test("the issue link: prefilled, short, not-ok rows only", () => {
    const u = write(false).issueUrl;
    expect(u.startsWith("https://github.com/wey-gu/ducter/issues/new?title=")).toBe(true);
    const body = decodeURIComponent(new URL(u).searchParams.get("body")!);
    expect(body).toContain("- cua: missing");
    expect(body).not.toContain("claude");
    expect(body).toContain("Attach the .zip");
    const long = issueUrl("x".repeat(20_000), doctor, "zh");
    expect(long.length).toBeLessThanOrEqual(MAX_ISSUE_URL);
    expect(decodeURIComponent(new URL(long).searchParams.get("body")!)).toContain("桌面");
  });
});
