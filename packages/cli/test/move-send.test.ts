// D627: the one-shot send between two temp homes on localhost. The new home listens with a
// one-time code; the old home freezes, bundles and sends over X25519 + AES-GCM; the new side checks
// exactly as `--receive <file>` does. A wrong code is refused, a dropped connection leaves the old
// home frozen (and `--unfreeze` restores it), and nothing listens after one use.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openLog } from "@ducter/core/src/log.ts";
import { parseArgs } from "../src/args.ts";
import { translator } from "../src/i18n.ts";
import { cmdMove, openRead, readLog, type MoveCtx } from "../src/move.ts";
import type { MoveHost } from "../src/move-send.ts";

const en = translator("en");
const NOW = Date.parse("2026-11-27T12:00:00Z");
let home: string;
let oldDir: string;

function fakeOld() {
  mkdirSync(oldDir, { recursive: true });
  const log = openLog({ path: join(oldDir, "ducter.db"), persona: "default" });
  log.append({ stream: "persona:default", origin: "user", kind: "user_msg", body: { text: "帮我修好 CI" } as never });
  log.append({ stream: "fw:t1", origin: "partner", kind: "task_open", body: { taskId: "t1", title: "Fix the CI", project: "", place: { kind: "none" }, harness: "claude-code", brief: "b" } as never });
  log.append({ stream: "fw:t1", origin: "system", kind: "task_state", body: { taskId: "t1", attention: "working", residency: "hot" } as never });
  log.append({ stream: "keep:k1", origin: "system", kind: "keep", body: { keepId: "k1", title: "Watch the PR", said: "watch #12", from: { kind: "loop", taskId: "t1" }, run: "same", wakes: [{ kind: "changes" }], life: "on", createdAt: "2026-11-27T00:00:00.000Z", made: "task_loop" } as never });
  log.close?.();
  writeFileSync(join(oldDir, "persona.json"), JSON.stringify({ name: "小鸭" }));
  writeFileSync(join(oldDir, "device-name"), "Old Mac\n");
  writeFileSync(join(oldDir, "settings.json"), JSON.stringify({ language: "zh" }));
  writeFileSync(join(oldDir, "keys.env"), "DEEPSEEK_API_KEY=send-not-real\n");
  writeFileSync(join(oldDir, "mcp.secret"), "move-secret\n");
  writeFileSync(join(oldDir, "home-key.pem"), "not-a-real-key");
  mkdirSync(join(oldDir, "media"), { recursive: true });
  writeFileSync(join(oldDir, "media", "a.png"), "x".repeat(1024));
  mkdirSync(join(oldDir, "apps", "a1"), { recursive: true });
  writeFileSync(join(oldDir, "apps", "a1", "app.json"), JSON.stringify({ id: "a1", name: "Tracker", version: 1 }));
}

function fakeHost() {
  let frozen = false;
  const host: MoveHost = {
    async freeze() {
      frozen = true;
      return { frozen, running: [] };
    },
    async status() {
      return { frozen, running: [] };
    },
    async unfreeze() {
      frozen = false;
      return { frozen, running: [] };
    },
    close() {},
  };
  return { host, isFrozen: () => frozen };
}

const baseCtx = (dataDir: string): MoveCtx => ({ t: en, dataDir, json: false, plan: false, computer: "Old Mac", platform: "darwin", env: { DUCTER_SAVED_KEY: "file" }, now: NOW });

async function waitFor(lines: string[], needle: string, ms = 3_000) {
  const until = Date.now() + ms;
  while (Date.now() < until && !lines.join("\n").includes(needle)) await Bun.sleep(10);
  if (!lines.join("\n").includes(needle)) throw new Error(`no ${needle} in ${lines.join("\n")}`);
}

async function startListener(dataDir: string, code = "ABCD-EFGH") {
  const lines: string[] = [];
  const p = cmdMove({ ...baseCtx(dataDir), listen: true, listenCode: code, bindHost: "127.0.0.1", bindPort: 0, listenTimeoutMs: 5_000, print: (s) => lines.push(s) } as never);
  await waitFor(lines, "On it, run:");
  const m = /--to (\S+) --code (\S+)/.exec(lines.join("\n"))!;
  return { p, lines, address: m[1]!, code: m[2]! };
}

function eventsOf(dir: string): unknown[] {
  const db = openRead(join(dir, "ducter.db"));
  try {
    return db.query("SELECT seq, ts, stream, origin, kind, body FROM events ORDER BY seq").all();
  } finally {
    db.close();
  }
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "ducter-move-send-"));
  oldDir = join(home, "old", ".ducter");
  fakeOld();
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

describe("ducter move --receive --listen and --to", () => {
  test("the command parses --receive --listen and --unfreeze", () => {
    const a = parseArgs(["move", "--receive", "--listen"]);
    expect(a.ok && a.args.listen).toBe(true);
    expect(a.ok && a.args.receive).toBeUndefined();
    const b = parseArgs(["move", "--unfreeze"]);
    expect(b.ok && b.args.unfreeze).toBe(true);
    const c = parseArgs(["move", "--to", "http://127.0.0.1:9", "--code", "ABCD-EFGH"]);
    expect(c.ok && c.args.to).toBe("http://127.0.0.1:9");
  });

  test("the send round-trips the same Log and files into the new home, and stops listening", async () => {
    const target = join(home, "new", ".ducter");
    const l = await startListener(target);
    const { host, isFrozen } = fakeHost();
    const send: string[] = [];
    const code = await cmdMove({
      ...baseCtx(oldDir),
      to: l.address,
      code: l.code,
      host,
      probe: async () => ({ agents: [{ name: "Codex", signedIn: true }], github: true }),
      print: (s) => send.push(s),
    } as never);
    expect(code).toBe(0);
    expect(isFrozen()).toBe(true);
    expect(send.join("\n")).toContain("This Ducter is frozen");
    expect(send.join("\n")).toContain("To lift it: ducter move --unfreeze");
    expect(send.join("\n")).not.toContain("30 days");
    expect(await l.p).toBe(0);
    expect(l.lines.join("\n")).toContain("The old computer is frozen and still owns everything");
    expect(l.lines.join("\n")).toContain("Received 小鸭");
    expect(eventsOf(target)).toEqual(eventsOf(oldDir));
    expect(readLog(target)).toEqual(readLog(oldDir));
    for (const f of ["persona.json", "settings.json", "keys.env", "mcp.secret", "home-key.pem", "media/a.png", "apps/a1/app.json"]) {
      expect(readFileSync(join(target, f))).toEqual(readFileSync(join(oldDir, f)));
    }
    expect(readFileSync(join(target, "move-receiving.json")).length).toBeGreaterThan(0);
    // One use: the listener has stopped by the time its done resolves (a moment to release the port).
    await Bun.sleep(100);
    await expect(fetch(`${l.address}/move/hello`, { method: "POST", body: "{}" })).rejects.toBeDefined();
  });

  test("a wrong code is refused and writes nothing", async () => {
    const target = join(home, "wrong", ".ducter");
    const l = await startListener(target);
    const { host } = fakeHost();
    const send: string[] = [];
    const code = await cmdMove({
      ...baseCtx(oldDir),
      to: l.address,
      code: "ZZZZ-ZZZZ",
      host,
      probe: async () => ({}),
      print: (s) => send.push(s),
    } as never);
    expect(code).toBe(1);
    expect(send.join("\n")).toContain("didn't prove the code");
    expect(await l.p).toBe(1);
    expect(l.lines.join("\n")).toContain("Stopped. Nothing was written.");
    expect(statSafe(target)).toBe(false);
  });

  test("a dropped connection leaves the old home frozen, and --unfreeze restores it", async () => {
    const { host, isFrozen } = fakeHost();
    const send: string[] = [];
    const code = await cmdMove({
      ...baseCtx(oldDir),
      to: "http://127.0.0.1:1",
      code: "ABCD-EFGH",
      host,
      probe: async () => ({}),
      print: (s) => send.push(s),
    } as never);
    expect(code).toBe(1);
    expect(isFrozen()).toBe(true);
    expect(send.join("\n")).toContain("This Ducter is frozen");
    const lifted: string[] = [];
    expect(await cmdMove({ ...baseCtx(oldDir), unfreeze: true, host, print: (s) => lifted.push(s) } as never)).toBe(0);
    expect(isFrozen()).toBe(false);
    expect(lifted.join("\n")).toContain("Unfrozen");
  });

  test("a target that already has work refuses before listening", async () => {
    const target = join(home, "taken", ".ducter");
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, "settings.json"), "{}");
    const lines: string[] = [];
    expect(await cmdMove({ ...baseCtx(target), listen: true, listenCode: "ABCD-EFGH", bindHost: "127.0.0.1", bindPort: 0, print: (s) => lines.push(s) } as never)).toBe(1);
    expect(lines.join("\n")).toContain("already has a Ducter with work");
  });
});

function statSafe(path: string): boolean {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

// Keep readdirSync imported for a future file-set comparison without an unused import.
void readdirSync;
