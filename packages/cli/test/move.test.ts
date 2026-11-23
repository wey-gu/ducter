// D504: `ducter move --plan` over a fake home in a temp folder: what goes, what is redone, what
// follows, work under way, and that the plan writes nothing (every file's bytes and times kept).
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openLog } from "@ducter/core/src/log.ts";
import { openDeviceAuth } from "@ducter/core/src/auth.ts";
import { parseArgs } from "../src/args.ts";
import { commandClass } from "../src/home.ts";
import { translator } from "../src/i18n.ts";
import { cmdMove, formatMovePlan, keyNames, planMove, type MovePlan } from "../src/move.ts";

const en = translator("en");
const zh = translator("zh");
const NOW = Date.parse("2026-11-24T12:00:00Z");
let home: string;
let dataDir: string;

/** A Mac home of the author's shape: two partners, a routine, tasks here and on hel, three devices, Telegram, Mem. */
function fakeHome() {
  mkdirSync(dataDir, { recursive: true });
  const log = openLog({ path: join(dataDir, "ducter.db"), persona: "default" });
  const open = (taskId: string, title: string, place: object) => log.append({ stream: `fw:${taskId}`, origin: "partner", kind: "task_open", body: { taskId, title, project: "", place, harness: "claude-code", brief: "b" } as never });
  const state = (taskId: string, attention: string, residency = "hot") => log.append({ stream: `fw:${taskId}`, origin: "system", kind: "task_state", body: { taskId, attention, residency } as never });
  log.append({ stream: "persona:default", origin: "user", kind: "user_msg", body: { text: "帮我把 CI 修好" } as never });
  open("t1", "Fix the CI on ducter", { kind: "repo", device: "local", repoPath: "/Users/w/dev/ducter", hasRemote: true });
  state("t1", "working");
  open("t2", "Sum up today's HN thread", { kind: "none" });
  state("t2", "working");
  open("t3", "Tidy the Downloads folder", { kind: "folder", device: "local", path: "/Users/w/Downloads" });
  state("t3", "needs_you");
  open("t4", "Translate the report", { kind: "none", device: "hel" });
  state("t4", "working");
  open("t5", "Old one, done", { kind: "none" });
  state("t5", "done", "archived");
  log.append({ stream: "routine:r1", origin: "schedule", kind: "routine", body: { routineId: "r1", name: "Morning brief", state: "active", trigger: { kind: "time" } } as never });
  log.append({ stream: "routine:r2", origin: "schedule", kind: "routine", body: { routineId: "r2", name: "Weekly tidy", state: "paused", trigger: { kind: "time" }, place: { kind: "folder", device: "local", path: "/Users/w/Downloads" } } as never });
  log.close?.();
  writeFileSync(join(dataDir, "persona.json"), JSON.stringify({ name: "小鸭", mem: { agentId: "ducter", owned: true } }));
  writeFileSync(join(dataDir, "partners.json"), JSON.stringify({ others: [{ id: "p2", name: "Home", look: "sand", createdAt: "x" }] }));
  writeFileSync(join(dataDir, "settings.json"), JSON.stringify({ language: "zh" }));
  writeFileSync(join(dataDir, "keys.env"), "DEEPSEEK_API_KEY=sk-not-a-real-key\nCLAUDE_CODE_OAUTH_TOKEN=not-a-real-token\n");
  writeFileSync(join(dataDir, "channels.json"), JSON.stringify({ telegram: { token: "123:not-real", offset: 42 } }));
  writeFileSync(join(dataDir, "push.json"), JSON.stringify({ subs: [{ endpoint: "https://push.example/1" }, { endpoint: "https://push.example/2" }] }));
  writeFileSync(join(dataDir, "bridge-connection.json"), JSON.stringify({ context: "c", agentId: "ducter", connectionId: "x", spaceId: "s", confirmed: true }));
  writeFileSync(join(dataDir, "helpers.json"), JSON.stringify({ helpers: [{ id: "h1", name: "PR babysitter", agentId: "a", state: "on", link: { context: "c", connectionId: "y", spaceId: "s" } }] }));
  writeFileSync(join(dataDir, "reach.json"), JSON.stringify({ ways: [{ kind: "tailnet", url: "https://mac.tail.ts.net", addedAt: "x" }] }));
  writeFileSync(join(dataDir, "home-key.pem"), "not a real key");
  mkdirSync(join(dataDir, "saved"), { recursive: true });
  writeFileSync(join(dataDir, "saved", "default.enc"), "x".repeat(300));
  mkdirSync(join(dataDir, "browser-profiles", "default"), { recursive: true });
  writeFileSync(join(dataDir, "browser-profiles", "default", "Cookies"), "x".repeat(5000));
  mkdirSync(join(dataDir, "media"), { recursive: true });
  writeFileSync(join(dataDir, "media", "a.png"), "x".repeat(2048));
  const auth = openDeviceAuth(dataDir);
  auth.close();
  // Rows as pairing leaves them (devices.db's own schema, made above).
  const { Database } = require("bun:sqlite");
  const db = new Database(join(dataDir, "devices.db"));
  const add = (id: string, name: string, kind: string, platform: string, seen: number, form = "", computer = "") =>
    db.run("INSERT INTO devices (id, name, kind, platform, token_hash, created_at, last_seen_at, form, computer) VALUES (?, ?, ?, ?, 'h', 0, ?, ?, ?)", [id, name, kind, platform, seen, form, computer]);
  add("d1", "iPhone", "client", "ios-app", NOW - 3_600_000);
  add("d2", "Browser", "client", "web", NOW - 3_600_000);
  add("d3", "hel", "worker", "linux", NOW - 60_000, "", "hel");
  add("d4", "Old iPad", "client", "ios-safari", NOW - 60 * 86_400_000);
  db.close();
}

/** Every file under dir with its size and modification time: the plan must leave them as they were. */
function snapshot(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const n of readdirSync(d).sort()) {
      const p = join(d, n);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else out.push(`${p} ${st.size} ${st.mtimeMs}`);
    }
  };
  walk(dir);
  return out;
}

const plan = (extra: Partial<Parameters<typeof planMove>[0]> = {}) => {
  const p = planMove({ dataDir, t: en, computer: "Wey's MacBook Pro", platform: "darwin", now: NOW, home, env: {}, agents: [{ name: "Claude Code", harness: "claude-code", signedIn: true }, { name: "Codex", harness: "codex", signedIn: true }], github: true, ...extra });
  if (!p.ok) throw new Error("no home");
  return p;
};
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "ducter-move-"));
  dataDir = join(home, ".ducter");
  fakeHome();
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

describe("ducter move --plan", () => {
  test("the command parses, is this computer's, and needs --plan", async () => {
    const a = parseArgs(["move", "--plan", "--to", "hel"]);
    expect(a.ok && a.args.command === "move" && a.args.plan && a.args.to === "hel").toBe(true);
    expect(commandClass("move")).toBe("machine");
    // D473's command was never in the parser's list: `ducter repairs` said "unknown command".
    const r = parseArgs(["repairs", "--weeks", "2"]);
    expect(r.ok && r.args.command).toBe("repairs");
    const lines: string[] = [];
    expect(await cmdMove({ t: en, dataDir, json: false, plan: false, computer: "Mac", platform: "darwin", print: (s) => lines.push(s) })).toBe(2);
    expect(lines.join("\n")).toContain("--plan");
  });

  test("what goes: the Log counted, partners named, keys by name only, sizes", () => {
    const p = plan();
    expect(ids(p.goes)).toEqual(["log", "partners", "settings", "routines", "keys", "autofill", "devices", "chats", "push", "mem", "helpers", "made"]);
    const log = p.goes.find((g) => g.id === "log")!;
    expect(log.detail).toBe("13 entries, 5 tasks; checked entry by entry when they arrive");
    expect(log.bytes).toBeGreaterThan(0);
    expect(p.goes.find((g) => g.id === "partners")!.detail).toBe("小鸭, Home");
    expect(p.goes.find((g) => g.id === "routines")!.detail).toContain("1 running, 1 paused");
    expect(p.goes.find((g) => g.id === "keys")!.detail).toBe("DEEPSEEK_API_KEY, CLAUDE_CODE_OAUTH_TOKEN");
    expect(p.goes.find((g) => g.id === "devices")!.what).toBe("Paired devices (4), and this Ducter's own key");
    expect(p.bytes).toBe(p.goes.reduce((n, g) => n + (g.bytes ?? 0), 0));
    // No secret's value is anywhere in the plan.
    const all = JSON.stringify(p);
    for (const s of ["sk-not-a-real-key", "not-a-real-token", "123:not-real", "push.example"]) expect(all).not.toContain(s);
  });

  test("what is redone: each signed-in agent unless its key moves, GitHub, Mem; the browser across systems", () => {
    const p = plan({ to: "a-new-server" });
    // Claude Code's key is in keys.env, so it goes; Codex's sign-in is Codex's own.
    expect(ids(p.redo)).toEqual(["agent:Codex", "github", "mem-signin", "browser"]);
    expect(p.to).toEqual({ name: "a-new-server", os: "linux", known: false, assumed: true });
    expect(ids(p.risks)).toContain("assumed");
    expect(ids(p.risks)).toContain("autofill");
  });

  test("--to a computer that already does tasks: known, its system read from its pairing", () => {
    const p = plan({ to: "hel" });
    expect(p.to).toEqual({ name: "hel", os: "linux", known: true, assumed: false });
    expect(ids(p.risks)).not.toContain("assumed");
    // Mac to Mac: the browser's sign-ins go with it.
    const mac = plan({ platform: "linux", to: "hel" });
    expect(ids(mac.goes)).toContain("browser");
    expect(ids(mac.redo)).not.toContain("browser");
  });

  test("what follows: apps by themselves, web pages, workers, chat apps, Bridge and helpers handed over", () => {
    const p = plan();
    expect(ids(p.follow)).toEqual(["apps", "web", "workers", "chats", "bridge", "helpers", "push", "tailnet", "imessage"]);
    expect(p.follow.find((f) => f.id === "apps")!.what).toBe("Ducter apps and command lines (1)");
    expect(p.follow.find((f) => f.id === "web")!.what).toBe("Web pages (2)");
  });

  test("work under way: a repo pushes its branch, place-less carries, a folder stays, a worker's keeps going", () => {
    const p = plan({ to: "hel" });
    expect(p.work.map((w) => [w.title, w.then])).toEqual([
      ["Fix the CI on ducter", "branch"],
      ["Sum up today's HN thread", "carry"],
      ["Tidy the Downloads folder", "stays"],
      ["Translate the report", "keeps"],
    ]);
    expect(p.work[1]!.line).toContain("on hel");
    expect(ids(p.stays)).toEqual(["local-work", "mac"]);
    expect(p.stays[0]!.what).toBe("Tasks and routines that use folders on this computer (2)");
    expect(p.risks.find((r) => r.id === "busy")!.what).toContain("Tasks under way on this computer: 3");
    expect(p.risks.find((r) => r.id === "quiet")!.what).toContain("Old iPad");
  });

  test("the printed plan, in both languages, and nothing on disk changed", async () => {
    const before = snapshot(dataDir);
    const lines: string[] = [];
    expect(await cmdMove({ t: en, dataDir, json: false, plan: true, to: "hel", computer: "Wey's MacBook Pro", platform: "darwin", probe: async () => ({ agents: [{ name: "Codex", signedIn: true }] }), print: (s) => lines.push(s) })).toBe(0);
    const out = lines.join("\n");
    expect(out.split("\n")[0]).toBe("Moving 小鸭 from Wey's MacBook Pro to hel: what would happen");
    for (const h of ["Goes with it", "To do again on the new computer", "What follows the new address", "Work under way", "Stays on this computer", "Worth knowing"]) expect(out).toContain(h);
    expect(out.trimEnd().endsWith("This is only the plan. Nothing was changed, and nothing was sent anywhere.")).toBe(true);
    const z = formatMovePlan(planMove({ dataDir, t: zh, computer: "Mac", platform: "darwin", now: NOW, home, env: {} }) as MovePlan, zh);
    expect(z).toContain("把小鸭从 Mac 搬到另一台电脑：会怎样");
    expect(z).toContain("到新电脑上从停下的地方接着做");
    expect(z).not.toMatch(/\d+ ?件/); // D434: no counter 件
    expect(z).toContain("小鸭、Home");
    expect(z).toContain("聊天软件：Telegram");
    const j: string[] = [];
    await cmdMove({ t: en, dataDir, json: true, plan: true, computer: "Mac", platform: "darwin", print: (s) => j.push(s) });
    expect(JSON.parse(j.join("\n")).ok).toBe(true);
    expect(snapshot(dataDir)).toEqual(before);
  });

  test("a computer with no home says so", async () => {
    const empty = join(home, "empty");
    mkdirSync(empty);
    expect(planMove({ dataDir: empty, t: en, computer: "Mac", platform: "darwin" })).toEqual({ ok: false, error: "no_home", dataDir: empty });
    const lines: string[] = [];
    expect(await cmdMove({ t: en, dataDir: empty, json: false, plan: true, computer: "Mac", platform: "darwin", print: (s) => lines.push(s) })).toBe(1);
    expect(lines[0]).toContain("doesn't run on this computer");
  });

  test("keys.env: names only, comments and blanks skipped", () => {
    writeFileSync(join(dataDir, "keys.env"), "# mine\n\nexport OPENAI_API_KEY=x\nlower=y\n");
    expect(keyNames(dataDir)).toEqual(["OPENAI_API_KEY"]);
  });
});
