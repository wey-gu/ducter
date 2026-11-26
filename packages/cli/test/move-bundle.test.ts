// D-PENDING: `ducter move --bundle` and `--receive` over temp homes. One encrypted file of what
// moves, checked file by file and entry by entry into a fresh data folder; a wrong passphrase, a
// changed bundle and a target that already has work are refused; the running home is only read.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createCipheriv, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openLog } from "@ducter/core/src/log.ts";
import { openDeviceAuth } from "@ducter/core/src/auth.ts";
import { keySource } from "@ducter/protocol/src/lock-key.ts";
import { parseArgs } from "../src/args.ts";
import { translator } from "../src/i18n.ts";
import { cmdMove, openRead, readLog } from "../src/move.ts";
import { homeHasWork, normalizePassphrase, readBundleInfo } from "../src/move-bundle.ts";

const en = translator("en");
const zh = translator("zh");
const NOW = Date.parse("2026-11-24T12:00:00Z");
const PASS = "ABCD-EFGH-JKMN-PQRS";
const ENV = { DUCTER_SAVED_KEY: "file" };
const VAULT = {
  signins: [{ id: "s1", handle: "GitHub", site: "github.com", username: "me", password: "hunter2-not-real", addedAt: "2026-01-01T00:00:00.000Z", okSites: [] }],
  cards: [],
  details: [],
  keys: [],
  grants: [],
};
let home: string;
let dataDir: string;

/** A home of the author's shape, with a task, a routine, a Keep, an app, a secret and Autofill. */
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
  open("t3", "Old one, done", { kind: "none" });
  state("t3", "done", "archived");
  log.append({ stream: "routine:r1", origin: "schedule", kind: "routine", body: { routineId: "r1", name: "Morning brief", state: "active", trigger: { kind: "time" } } as never });
  log.append({
    stream: "keep:k1",
    origin: "system",
    kind: "keep",
    body: { keepId: "k1", title: "Watch the PR", said: "watch #12 until it merges", from: { kind: "loop", taskId: "t1" }, run: "same", wakes: [{ kind: "changes" }], life: "on", createdAt: "2026-11-24T00:00:00.000Z", made: "task_loop" } as never,
  });
  log.close?.();
  writeFileSync(join(dataDir, "persona.json"), JSON.stringify({ name: "小鸭", mem: { agentId: "ducter", owned: true } }));
  writeFileSync(join(dataDir, "partners.json"), JSON.stringify({ others: [{ id: "p2", name: "Home", look: "sand", createdAt: "x" }] }));
  writeFileSync(join(dataDir, "settings.json"), JSON.stringify({ language: "zh" }));
  writeFileSync(join(dataDir, "keys.env"), "DEEPSEEK_API_KEY=sk-not-a-real-key\nCLAUDE_CODE_OAUTH_TOKEN=not-a-real-token\n");
  writeFileSync(join(dataDir, "mcp.secret"), "task-keys-stay-valid\n");
  writeFileSync(join(dataDir, "connection-tokens.json"), JSON.stringify({ github: "conn-not-real" }));
  writeFileSync(join(dataDir, "channels.json"), JSON.stringify({ telegram: { token: "123:not-real", offset: 42 } }));
  writeFileSync(join(dataDir, "push.json"), JSON.stringify({ subs: [{ endpoint: "https://push.example/1" }] }));
  writeFileSync(join(dataDir, "bridge-connection.json"), JSON.stringify({ context: "c", agentId: "ducter", connectionId: "x", spaceId: "s", confirmed: true }));
  writeFileSync(join(dataDir, "helpers.json"), JSON.stringify({ helpers: [{ id: "h1", name: "PR babysitter", agentId: "a", state: "on", link: { context: "c", connectionId: "y", spaceId: "s" } }] }));
  writeFileSync(join(dataDir, "reach.json"), JSON.stringify({ ways: [{ kind: "tailnet", url: "https://mac.tail.ts.net", addedAt: "x" }] }));
  writeFileSync(join(dataDir, "home-key.pem"), "not a real key");
  writeFileSync(join(dataDir, "device-name"), "Wey's MacBook Pro\n");
  writeFileSync(join(dataDir, "public-url"), "https://mac.tail.ts.net\n");
  writeFileSync(join(dataDir, "doorbells.json"), JSON.stringify({ k1: "hash-not-real" }));
  mkdirSync(join(dataDir, "saved"), { recursive: true });
  writeSaved(dataDir, "default", VAULT);
  mkdirSync(join(dataDir, "browser-profiles", "default"), { recursive: true });
  writeFileSync(join(dataDir, "browser-profiles", "default", "Cookies"), "cookie-not-real");
  mkdirSync(join(dataDir, "media"), { recursive: true });
  writeFileSync(join(dataDir, "media", "a.png"), "x".repeat(2048));
  mkdirSync(join(dataDir, "apps", "a1"), { recursive: true });
  writeFileSync(join(dataDir, "apps", "a1", "app.json"), JSON.stringify({ id: "a1", name: "Tracker", version: 1, updated: "2026-11-01T00:00:00.000Z" }));
  writeFileSync(join(dataDir, "apps", "a1", "index.html"), "<h1>Tracker</h1>");
  mkdirSync(join(dataDir, "evidence"), { recursive: true });
  writeFileSync(join(dataDir, "evidence", "proof.txt"), "checked\n");
  const auth = openDeviceAuth(dataDir);
  auth.close();
  const { Database } = require("bun:sqlite");
  const db = new Database(join(dataDir, "devices.db"));
  const add = (id: string, name: string, kind: string, platform: string, seen: number, form = "", computer = "") =>
    db.run("INSERT INTO devices (id, name, kind, platform, token_hash, created_at, last_seen_at, form, computer) VALUES (?, ?, ?, ?, 'h', 0, ?, ?, ?)", [id, name, kind, platform, seen, form, computer]);
  add("d1", "iPhone", "client", "ios-app", NOW - 3_600_000);
  add("d3", "hel", "worker", "linux", NOW - 60_000, "", "hel");
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  db.close();
  for (const f of ["devices.db-wal", "devices.db-shm"]) rmSync(join(dataDir, f), { force: true });
}

function savedKey(dir: string): Buffer {
  return keySource({ dataDir: dir, dir: join(dir, "saved"), platform: "linux", env: ENV }).get(false)!;
}

function writeSaved(dir: string, persona: string, vault: object) {
  mkdirSync(join(dir, "saved"), { recursive: true });
  const key = keySource({ dataDir: dir, dir: join(dir, "saved"), platform: "linux", env: ENV }).get(true)!;
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([c.update(Buffer.from(JSON.stringify(vault), "utf8")), c.final()]);
  writeFileSync(join(dir, "saved", `${persona}.enc`), JSON.stringify({ v: 1, iv: iv.toString("base64"), tag: c.getAuthTag().toString("base64"), data: data.toString("base64") }), { mode: 0o600 });
}

function readSaved(dir: string, persona: string): object {
  const key = savedKey(dir);
  const f = JSON.parse(readFileSync(join(dir, "saved", `${persona}.enc`), "utf8"));
  const { createDecipheriv } = require("node:crypto");
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(f.iv, "base64"));
  d.setAuthTag(Buffer.from(f.tag, "base64"));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(f.data, "base64")), d.final()]).toString("utf8"));
}

/** Every file with its size and modification time: a bundle must leave the running home as it was. */
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

function eventsOf(dir: string): unknown[] {
  const db = openRead(join(dir, "ducter.db"));
  try {
    return db.query("SELECT seq, ts, stream, origin, kind, body FROM events ORDER BY seq").all();
  } finally {
    db.close();
  }
}

async function bundle(file: string, extra: Record<string, unknown> = {}) {
  const lines: string[] = [];
  const code = await cmdMove({
    t: en,
    dataDir,
    json: false,
    plan: false,
    bundle: file,
    passphraseStdin: true,
    stdin: async () => PASS,
    to: "hel",
    computer: "Wey's MacBook Pro",
    platform: "darwin",
    env: ENV,
    now: NOW,
    print: (s) => lines.push(s),
    probe: async () => ({ agents: [{ name: "Claude Code", signedIn: true }, { name: "Codex", signedIn: true }, { name: "Antigravity", signedIn: true }, { name: "Kimi Code CLI", signedIn: true }], github: true }),
    ...extra,
  } as never);
  return { code, out: lines.join("\n") };
}

async function receive(file: string, target: string, pass = PASS, extra: Record<string, unknown> = {}) {
  const lines: string[] = [];
  const code = await cmdMove({
    t: en,
    dataDir: target,
    json: false,
    plan: false,
    receive: file,
    stdin: async () => pass,
    computer: "hel",
    platform: "linux",
    env: ENV,
    now: NOW,
    print: (s) => lines.push(s),
    ...extra,
  } as never);
  return { code, out: lines.join("\n") };
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "ducter-move-bundle-"));
  dataDir = join(home, ".ducter");
  fakeHome();
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

describe("ducter move --bundle and --receive", () => {
  test("the command parses both forms, and one at a time", async () => {
    const b = parseArgs(["move", "--bundle", "a.ducter"]);
    expect(b.ok && b.args.bundle).toBe("a.ducter");
    const r = parseArgs(["move", "--receive", "b.ducter", "--passphrase-stdin"]);
    expect(r.ok && r.args.receive).toBe("b.ducter");
    expect(r.ok && r.args.passphraseStdin).toBe(true);
    const both = parseArgs(["move", "--bundle", "a", "--receive", "b"]);
    expect(both.ok && both.args.bundle === "a" && both.args.receive === "b").toBe(true);
    const lines: string[] = [];
    expect(await cmdMove({ t: en, dataDir, json: false, plan: false, bundle: "a", receive: "b", computer: "Mac", platform: "darwin", print: (s) => lines.push(s) })).toBe(2);
    expect(lines.join("\n")).toContain("can't be used together");
  });

  test("the round trip keeps the Log, tasks, a Keep, an app, a secret and Autofill the same", async () => {
    const file = join(home, "move.ducter");
    const b = await bundle(file);
    expect(b.code).toBe(0);
    expect(b.out).toContain("ready to carry to another computer");
    expect(b.out).toContain("The passphrase was read from stdin");
    expect(b.out).toContain("To do again on the new computer");
    expect(b.out).toContain("Sign in to Claude Code, Codex, Antigravity and Kimi Code CLI");
    expect((b.out.match(/their sign-ins are their own/g) ?? []).length).toBe(1);
    expect(b.out).toContain("Sign in again to the sites in Ducter's own browser");
    expect(b.out).toContain("Stays on this computer");
    // The secrets crossed only inside the ciphertext.
    const bytes = readFileSync(file);
    for (const s of ["sk-not-a-real-key", "not-a-real-token", "123:not-real", "hunter2-not-real", "cookie-not-real", "conn-not-real"]) expect(bytes.includes(Buffer.from(s))).toBe(false);
    expect(readBundleInfo(file)?.createdAt).toBe(new Date(NOW).toISOString());

    const target = join(home, "new", ".ducter");
    const r = await receive(file, target);
    expect(r.code).toBe(0);
    expect(r.out).toContain("Received 小鸭 from Wey's MacBook Pro");
    expect(r.out).toContain("every one checked");
    expect(r.out).toContain("locked again with this computer's own key");
    expect(r.out).toContain("The move is not switched over");
    expect(r.out).toContain("Nothing to pair again");
    expect(r.out).toContain("Sign in to Claude Code, Codex, Antigravity and Kimi Code CLI");
    expect((r.out.match(/their sign-ins are their own/g) ?? []).length).toBe(1);
    expect(r.out).toContain("Sign in to Nowledge Mem here");
    expect(r.out).toContain("use the Ducter on Wey's MacBook Pro");
    expect(r.out).not.toContain("30 days");
    expect(r.out).not.toContain("moving back");

    // The same events, in the same order, and the same projection of tasks, routines and Keeps.
    expect(eventsOf(target)).toEqual(eventsOf(dataDir));
    expect(readLog(target)).toEqual(readLog(dataDir));
    expect((readLog(target)?.open ?? []).map((t) => t.taskId)).toEqual(["t1", "t2"]);
    const keep = eventsOf(target).find((e: any) => e.kind === "keep") as any;
    expect(JSON.parse(keep.body).title).toBe("Watch the PR");

    for (const f of ["keys.env", "mcp.secret", "persona.json", "partners.json", "settings.json", "channels.json", "push.json", "connection-tokens.json", "home-key.pem", "device-name", "public-url", "doorbells.json", "media/a.png", "apps/a1/app.json", "apps/a1/index.html", "evidence/proof.txt"]) {
      expect(readFileSync(join(target, f))).toEqual(readFileSync(join(dataDir, f)));
    }
    expect(readFileSync(join(target, "devices.db")).length).toBeGreaterThan(0);
    expect(existsSync(join(target, "browser-profiles"))).toBe(false);
    expect(existsSync(join(target, "saved", "key"))).toBe(true);
    expect(readFileSync(join(target, "saved", "key"))).not.toEqual(readFileSync(join(dataDir, "saved", "key")));
    expect(readSaved(target, "default")).toEqual(VAULT);
    expect(readFileSync(join(target, "saved", "default.enc"))).not.toEqual(readFileSync(join(dataDir, "saved", "default.enc")));
    expect(JSON.parse(readFileSync(join(target, "move-receiving.json"), "utf8")).from.computer).toBe("Wey's MacBook Pro");
    expect(homeHasWork(target)).toBe(true);
  });

  test("a made passphrase is shown once, is nowhere in the file, and opens it", async () => {
    const file = join(home, "generated.ducter");
    const lines: string[] = [];
    const code = await cmdMove({
      t: en,
      dataDir,
      json: false,
      plan: false,
      bundle: file,
      to: "hel",
      computer: "Wey's MacBook Pro",
      platform: "darwin",
      env: ENV,
      now: NOW,
      print: (s) => lines.push(s),
    });
    expect(code).toBe(0);
    const out = lines.join("\n");
    expect(out).toContain("Passphrase, shown once and not saved anywhere:");
    const at = out.split("\n").findIndex((l) => l.includes("Passphrase, shown once"));
    const pass = out.split("\n")[at + 1]!.trim();
    expect(pass).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
    expect(normalizePassphrase(pass)).toHaveLength(16);
    expect(readFileSync(file).includes(Buffer.from(pass))).toBe(false);
    expect(readFileSync(file).includes(Buffer.from(normalizePassphrase(pass)))).toBe(false);
    const target = join(home, "generated-new", ".ducter");
    expect((await receive(file, target, pass)).code).toBe(0);
  });

  test("a wrong passphrase opens nothing and writes nothing", async () => {
    const file = join(home, "wrong.ducter");
    expect((await bundle(file)).code).toBe(0);
    const target = join(home, "wrong-new", ".ducter");
    const r = await receive(file, target, "ZZZZ-ZZZZ-ZZZZ-ZZZZ");
    expect(r.code).toBe(1);
    expect(r.out).toContain("That passphrase doesn't open this bundle");
    expect(existsSync(target)).toBe(false);
  });

  test("a bundle changed after it was written is refused", async () => {
    const file = join(home, "changed.ducter");
    expect((await bundle(file)).code).toBe(0);
    const b = readFileSync(file);
    b[b.length - 20] = b[b.length - 20]! ^ 0xff;
    const changed = join(home, "changed-copy.ducter");
    writeFileSync(changed, b);
    const target = join(home, "changed-new", ".ducter");
    const r = await receive(changed, target);
    expect(r.code).toBe(1);
    expect(r.out).toContain("changed or damaged after it was written");
    expect(existsSync(target)).toBe(false);
  });

  test("a target that already has a Ducter with work is refused, and is not touched", async () => {
    const file = join(home, "not-empty.ducter");
    expect((await bundle(file)).code).toBe(0);
    const target = join(home, "occupied", ".ducter");
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, "settings.json"), '{"language":"zh"}\n');
    const before = snapshot(target);
    const r = await receive(file, target);
    expect(r.code).toBe(1);
    expect(r.out).toContain("already has a Ducter with work");
    expect(snapshot(target)).toEqual(before);
  });

  test("bundling a home while it is running reads it and changes nothing", async () => {
    const live = openLog({ path: join(dataDir, "ducter.db"), persona: "default" });
    live.append({ stream: "persona:default", origin: "user", kind: "user_msg", body: { text: "还在跑的时候打包" } as never });
    const before = snapshot(dataDir);
    const file = join(home, "live.ducter");
    expect((await bundle(file)).code).toBe(0);
    expect(snapshot(dataDir)).toEqual(before);
    const target = join(home, "live-new", ".ducter");
    expect((await receive(file, target)).code).toBe(0);
    expect(eventsOf(target)).toEqual(eventsOf(dataDir));
    live.close?.();
  });

  test("the new computer's words: sign-ins, the Mem handover, and no pairing again (zh)", async () => {
    const file = join(home, "zh.ducter");
    const lines: string[] = [];
    expect(
      await cmdMove({
        t: zh,
        dataDir,
        json: false,
        plan: false,
        bundle: file,
        stdin: async () => PASS,
        to: "hel",
        computer: "Wey's MacBook Pro",
        platform: "darwin",
        env: ENV,
        now: NOW,
        print: (s) => lines.push(s),
        probe: async () => ({ agents: [{ name: "Claude Code", signedIn: true }, { name: "Codex", signedIn: true }, { name: "Antigravity", signedIn: true }, { name: "Kimi Code CLI", signedIn: true }], github: true }),
      }),
    ).toBe(0);
    expect(lines.join("\n")).toContain("登录 Claude Code、Codex、Antigravity、Kimi Code CLI");
    const target = join(home, "zh-new", ".ducter");
    const r = await receive(file, target, PASS, { t: zh });
    expect(r.code).toBe(0);
    expect(r.out).toContain("收下了从 Wey's MacBook Pro 来的小鸭");
    expect(r.out).toContain("到了新电脑上要重做的");
    expect(r.out).toContain("登录 Claude Code、Codex、Antigravity、Kimi Code CLI");
    expect((r.out.match(/各自的登录/g) ?? []).length).toBe(1);
    expect(r.out).toContain("登录 Nowledge Mem");
    expect(r.out).toContain("不用重新连");
    expect(r.out).toContain("还没");
    expect(r.out).toContain("切换");
    expect(r.out).not.toContain("30 天");
    expect(r.out).not.toContain("搬回来");
  });

  test("a bundle cannot be written inside the data folder", async () => {
    const file = join(dataDir, "inside.ducter");
    const r = await bundle(file);
    expect(r.code).toBe(1);
    expect(r.out).toContain("can't be written inside Ducter's own data folder");
    expect(existsSync(file)).toBe(false);
  });
});
