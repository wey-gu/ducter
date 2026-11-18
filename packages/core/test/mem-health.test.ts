// D374: Nowledge Mem's own health (its `nmem --json doctor`) on Settings › 记忆 and on a lent
// computer's Mem row, and D169's 装上 through Mem's own `nmem connect --tool` before a task.
// Doctor answers are in the shape nmem 0.10.119/0.10.120 prints (research/144), with made-up details.
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { memHealthOf, type LogEvent, type TaskCard } from "@ducter/protocol";
import { createMemHealth } from "../src/mem-health.ts";
import { createMemPlugins, memSetupBrief } from "../src/mem-plugins.ts";
import { createWorkerMem, type WorkerMemSys } from "../src/worker-mem.ts";

const check = (name: string, status: string, detail = "", tool: string | null = null) => ({ name, status, detail, tool });
const doctor = (...checks: ReturnType<typeof check>[]) => JSON.stringify({ checks, failed: checks.some((c) => c.status === "fail") });
const CRED = check("credential home", "pass", "/home/x/.nowledge-mem/config.json — url https://mem.example.invalid (config), key nmem_xx…0000");
const CRED_DEFAULT = check("credential home", "pass", "config.json not present — using http://127.0.0.1:14242 (default), no api key");
const UP = check("server reachable", "pass", "https://mem.example.invalid (server v0.1.0)");
const DOWN = check("server reachable", "fail", "error sending request: dns error");
const KEY_OK = check("api key", "pass", "authenticated probe ok");
const KEY_BAD = check("api key", "fail", "key invalid or rotated — ask for a fresh connect link or key, then run `nmem connect`");
const KEY_SKIP = check("api key", "warn", "skipped (server unreachable)");
const CC = (s = "pass", d = "registered") => check("Claude Code", s, d, "claude-code");
const CX = (s = "pass", d = "registered") => check("Codex", s, d, "codex-cli");
const ok = (out: string, code = 0) => ({ code, out, err: "" });

describe("D374 memHealthOf: the one thing worth saying, from Mem's doctor", () => {
  test("all well: nothing wrong, and never a detail line (the credential one carries a key's tail)", () => {
    const h = memHealthOf(ok(doctor(CRED, UP, KEY_OK, CC(), CX(), check("Cursor", "warn", "not installed", "cursor"))), ["claude-code", "codex"], "2026-11-19T08:00:00.000Z");
    expect(h).toEqual({ checkedAt: "2026-11-19T08:00:00.000Z" });
    expect(JSON.stringify(h)).not.toContain("nmem_");
  });
  test("an nmem without a doctor is too old to tell; one that didn't run or said nothing readable: undefined", () => {
    expect(memHealthOf({ code: 2, out: "", err: "error: unrecognized subcommand 'doctor'" }, [])).toEqual({ issue: "old" });
    expect(memHealthOf(undefined, [])).toBeUndefined();
    expect(memHealthOf({ code: 1, out: "boom", err: "" }, [])).toBeUndefined();
  });
  test("set up but not answering: unreachable; never set up (Mem's built-in local default): signed_out, fresh", () => {
    expect(memHealthOf(ok(doctor(CRED, DOWN, KEY_SKIP), 1), [])).toEqual({ issue: "unreachable" });
    expect(memHealthOf(ok(doctor(CRED_DEFAULT, check("server reachable", "fail", "Connection refused"), KEY_SKIP), 1), [])).toEqual({ issue: "signed_out", fresh: true });
  });
  test("answers, but the key was rejected: signed_out (not fresh)", () => {
    expect(memHealthOf(ok(doctor(CRED, UP, KEY_BAD), 1), ["codex"])).toEqual({ issue: "signed_out" });
  });
  test("a local Mem needs no key: a missing one there is fine", () => {
    const local = check("server reachable", "pass", "http://127.0.0.1:14242 (server v0.1.0)");
    expect(memHealthOf(ok(doctor(CRED_DEFAULT, local, check("api key", "warn", "none (local server, no key needed)"), CC())), ["claude-code"])).toEqual({});
  });
  test("an installed agent not connected: plugin, with only the agents installed there that Mem connects", () => {
    const out = doctor(CRED, UP, KEY_OK, CC("warn", "not registered — run `nmem connect`"), CX("pass"));
    expect(memHealthOf(ok(out), ["claude-code", "codex", "pi"])).toEqual({ issue: "plugin", agents: ["claude-code"] });
    // Not installed here: not its business; one Mem's doctor can't find isn't a failed connection.
    expect(memHealthOf(ok(out), ["codex"])).toEqual({});
    expect(memHealthOf(ok(doctor(CRED, UP, KEY_OK, CC("warn", "not installed"))), ["claude-code"])).toEqual({});
  });
  test("a notice line before the JSON is read past", () => {
    expect(memHealthOf(ok(`note: a newer nmem is out\n${doctor(CRED, UP, KEY_BAD)}`, 1), [])).toEqual({ issue: "signed_out" });
  });
});

describe("D374 the home's reader: cached, in the background, never blocking", () => {
  test("the first look starts a read and says nothing yet; the answer follows; the TTL holds", async () => {
    let t = 0;
    let runs = 0;
    let changed = 0;
    let out = doctor(CRED, UP, KEY_OK, CC());
    const h = createMemHealth({ run: async (a) => (runs++, a[0] === "doctor" ? ok(out) : undefined), on: () => true, agents: async () => ["claude-code"], changed: () => changed++, now: () => t, ttlMs: 1000 });
    expect(h.get()).toBeUndefined();
    await h.refresh();
    expect(h.get()).toMatchObject({});
    expect(h.get()!.issue).toBeUndefined();
    expect(changed).toBe(1);
    const before = runs;
    h.get();
    expect(runs).toBe(before); // inside the TTL: no new read
    out = doctor(CRED, UP, KEY_BAD);
    t += 1000;
    h.get(); // stale: read again in the background
    await h.refresh();
    expect(h.get()!.issue).toBe("signed_out");
  });
  test("on the home, Mem's local default not answering is Mem gone away, not a first sign-in", async () => {
    const h = createMemHealth({ run: async () => ok(doctor(CRED_DEFAULT, check("server reachable", "fail", "Connection refused"), KEY_SKIP), 1), on: () => true, agents: async () => [], changed: () => {} });
    await h.refresh();
    expect(h.get()!.issue).toBe("unreachable");
  });
  test("off (memory off or Mem not connected): nothing read, nothing said", async () => {
    let runs = 0;
    const h = createMemHealth({ run: async () => (runs++, ok("{}")), on: () => false, agents: async () => [], changed: () => {} });
    expect(h.get()).toBeUndefined();
    await h.refresh();
    expect(runs).toBe(0);
  });
});

// ---------- G5: 装上 through Mem's own command ----------

function fakeLog() {
  const events: LogEvent[] = [];
  const fns = new Set<(e: LogEvent) => void>();
  return {
    events,
    append(e: any) {
      const ev = { seq: events.length + 1, ts: new Date().toISOString(), persona: "p", ...e } as LogEvent;
      events.push(ev);
      for (const f of fns) f(ev);
      return ev;
    },
    read: (q: { kinds?: string[] }) => events.filter((e) => !q.kinds || q.kinds.includes(e.kind)),
    subscribe: (f: (e: LogEvent) => void) => (fns.add(f), () => fns.delete(f)),
    head: () => events.length,
    search: () => [],
  };
}
const flush = () => new Promise((r) => setTimeout(r, 5));
const until = async (fn: () => boolean) => {
  for (let i = 0; i < 200 && !fn(); i++) await flush();
};

function plugins(o: { connect?: (id: string, hs: string[]) => Promise<{ ok: boolean; detail?: string } | undefined>; signedIn?: boolean } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "ducter-memhealth-"));
  const state: Record<string, "absent" | "installed"> = { "claude-code": "absent", codex: "absent", pi: "absent" };
  const opened: any[] = [];
  const connects: { id: string; hs: string[] }[] = [];
  const devs = [{ id: "local", name: "hel", home: true, awake: true, harnesses: ["claude-code", "codex", "pi"].map((harness) => ({ harness, installed: true, loggedIn: o.signedIn ?? true })) }];
  const mp = createMemPlugins({
    dataDir: dir,
    log: fakeLog() as any,
    tasks: { get: () => undefined, list: () => [] } as any,
    persona: { id: "p" },
    runner: () => ({ openTask: async (i: any) => (opened.push(i), { taskId: `tsk${opened.length}` } as TaskCard) }) as any,
    on: () => true,
    lang: () => "en",
    inspectLocal: async () => Object.fromEntries(Object.entries(state).map(([h, s]) => [h, s === "installed" ? { state: s, version: "0.7.36" } : { state: s }])),
    inspectWorker: async () => undefined,
    devices: async () => devs,
    everyMs: 0,
    connectTools: async (id, _home, hs) => {
      connects.push({ id, hs });
      const r = o.connect ? await o.connect(id, hs) : { ok: true };
      if (r?.ok) for (const h of hs) state[h] = "installed";
      return r;
    },
  });
  const line = (h: string) => mp.view("local", [{ harness: h, installed: true, loggedIn: true, canBePartner: false }])[0]!.mem;
  return { mp, opened, connects, line, state, done: () => rmSync(dir, { recursive: true, force: true }) };
}

describe("D374 装上: Mem's own command first, the task as the fallback", () => {
  test("Claude Code: `nmem connect --tool` puts it in, no task opens, the line says to restart it", async () => {
    const s = plugins();
    await s.mp.check();
    const r = await s.mp.install("local", "claude-code");
    expect(r).toEqual({ ok: true });
    expect(s.line("claude-code")).toMatchObject({ busy: true });
    await until(() => !!s.line("claude-code")?.fresh);
    expect(s.connects).toEqual([{ id: "local", hs: ["claude-code"] }]);
    expect(s.opened).toHaveLength(0);
    expect(s.line("claude-code")).toMatchObject({ state: "installed", fresh: true });
    expect(s.line("claude-code")!.busy).toBeUndefined();
    // The next check (a day later, an agent update) puts the plain line back.
    await s.mp.check();
    expect(s.line("claude-code")!.fresh).toBeUndefined();
    s.done();
  });
  test("it needs no signed-in agent there (a task would)", async () => {
    const s = plugins({ signedIn: false });
    await s.mp.check();
    expect(await s.mp.install("local", "codex")).toEqual({ ok: true });
    await until(() => !!s.line("codex")?.fresh);
    expect(s.opened).toHaveLength(0);
    s.done();
  });
  test("the command didn't put it in: one task follows Mem's guide, told what the command said", async () => {
    const s = plugins({ connect: async () => ({ ok: false, detail: "note: another memory integration is registered here: openmemory" }) });
    await s.mp.check();
    await s.mp.install("local", "codex");
    await until(() => s.opened.length > 0);
    expect(s.opened[0].brief).toContain("nmem connect --tool codex-cli --on-conflict abort");
    expect(s.opened[0].brief).toContain("openmemory");
    expect(s.opened[0].brief).toContain("https://mem.nowledge.co/SKILL.md");
    expect(s.line("codex")).toMatchObject({ taskId: "tsk1" });
    s.done();
  });
  test("can't run there (no nmem, an older worker): the task, as before", async () => {
    const s = plugins({ connect: async () => undefined });
    await s.mp.check();
    await s.mp.install("local", "claude-code");
    await until(() => s.opened.length > 0);
    expect(s.opened[0].brief).not.toContain("--on-conflict");
    s.done();
  });
  test("pi (Mem's command has no tool for it), and an update or a review: the task, never the command", async () => {
    const s = plugins();
    await s.mp.check();
    expect(await s.mp.install("local", "pi")).toEqual({ ok: true, taskId: "tsk1" });
    s.state.codex = "installed";
    await s.mp.check();
    expect(s.connects).toHaveLength(0);
    s.done();
  });
  test("a second tap while it runs is refused as running; two agents go one after the other", async () => {
    let release!: () => void;
    let inFlight = 0;
    let most = 0;
    const s = plugins({
      connect: async () => {
        inFlight++;
        most = Math.max(most, inFlight);
        await new Promise<void>((r) => (release = r));
        inFlight--;
        return { ok: true };
      },
    });
    await s.mp.check();
    await s.mp.install("local", "claude-code");
    expect(await s.mp.install("local", "claude-code")).toEqual({ ok: false, reason: "running" });
    await s.mp.install("local", "codex");
    await until(() => s.connects.length === 1);
    release();
    await until(() => s.connects.length === 2);
    release();
    await until(() => !!s.line("codex")?.fresh);
    expect(most).toBe(1);
    s.done();
  });
  test("the brief without a try is D169's, unchanged", () => {
    expect(memSetupBrief({ agent: "Codex", host: "codex-cli", device: "hel", lang: "en" })).not.toContain("ran first");
  });
});

// ---------- a lent computer's row ----------

function workerRig(o: { doctor: () => { code: number; out: string }; nmemAt?: (dataDir: string) => string; connect?: { code: number; out: string } }) {
  const dataDir = mkdtempSync(join(tmpdir(), "wmem-health-"));
  const calls: string[][] = [];
  const nmem = o.nmemAt ? o.nmemAt(dataDir) : "/usr/bin/nmem";
  const sys: WorkerMemSys = {
    platform: "linux",
    arch: "x64",
    which: (c) => (c === "nmem" ? nmem : null),
    env: () => ({ PATH: "/usr/bin" }),
    download: async () => new Uint8Array(),
    async run(argv) {
      calls.push(argv);
      if (argv[1] === "--version") return { code: 0, out: "nmem 0.10.120\n" };
      if (argv.includes("doctor")) return o.doctor();
      if (argv.includes("connect")) return o.connect ?? { code: 0, out: "{}" };
      if (argv[1] === "tool") return { code: 0, out: "Updated nmem-cli" };
      return { code: 1, out: "unknown" };
    },
  };
  const m = createWorkerMem({ dataDir, sys, agents: () => ["claude-code", "codex"], changed: () => {} });
  return { m, calls, dataDir, done: () => rmSync(dataDir, { recursive: true, force: true }) };
}

describe("D374 a lent computer's Mem row", () => {
  test("set up but its Mem doesn't answer: sign_in with health unreachable (not a paste box)", async () => {
    const w = workerRig({ doctor: () => ok(doctor(CRED, DOWN, KEY_SKIP), 1) });
    await w.m.look();
    expect(w.m.view()).toMatchObject({ state: "sign_in", health: { issue: "unreachable" } });
    w.done();
  });
  test("a key that stopped working says so; a first sign-in stays the row's own state", async () => {
    const a = workerRig({ doctor: () => ok(doctor(CRED, UP, KEY_BAD), 1) });
    await a.m.look();
    expect(a.m.view()).toMatchObject({ state: "sign_in", health: { issue: "signed_out" } });
    const b = workerRig({ doctor: () => ok(doctor(CRED_DEFAULT, check("server reachable", "fail", "refused"), KEY_SKIP), 1) });
    await b.m.look();
    expect(b.m.view().health).toBeUndefined();
    a.done();
    b.done();
  });
  test("an nmem without doctor: old; Ducter's own copy is upgraded in place by its uv", async () => {
    const w = workerRig({ doctor: () => ({ code: 2, out: "error: unrecognized subcommand 'doctor'" }), nmemAt: (d) => join(d, "tools", "bin", "nmem") });
    // Ducter's uv is there (it put nmem in).
    const { mkdirSync, writeFileSync } = await import("node:fs");
    mkdirSync(join(w.dataDir, "tools", "bin"), { recursive: true });
    writeFileSync(join(w.dataDir, "tools", "bin", "uv"), "#!/bin/sh\n");
    await w.m.look();
    expect(w.m.view()).toMatchObject({ state: "sign_in", health: { issue: "old" }, ours: true });
    w.m.install();
    await until(() => w.calls.some((c) => c.includes("upgrade")));
    expect(w.calls.find((c) => c.includes("upgrade"))!.slice(1)).toEqual(["tool", "upgrade", "nmem-cli"]);
    w.done();
  });
  test("the person's own nmem is theirs: no upgrade, and the row isn't ours", async () => {
    const w = workerRig({ doctor: () => ({ code: 2, out: "error: unrecognized subcommand 'doctor'" }) });
    await w.m.look();
    expect(w.m.view().ours).toBeUndefined();
    w.m.install();
    await flush();
    expect(w.calls.some((c) => c.includes("upgrade"))).toBe(false);
    w.done();
  });
  test("connectTools: Mem's own command for those agents only, leaving another memory integration alone", async () => {
    const w = workerRig({ doctor: () => ok(doctor(CRED, UP, KEY_OK, CC(), CX())) });
    expect(await w.m.connectTools(["claude-code", "pi"])).toEqual({ ok: true });
    expect(w.calls.find((c) => c.includes("connect"))!.slice(1)).toEqual(["--json", "connect", "--tool", "claude-code", "--on-conflict", "abort"]);
    expect(await w.m.connectTools(["pi"])).toEqual({ ok: false, reason: "unsupported" });
    w.done();
  });
  test("connectTools that failed says its last line, scrubbed", async () => {
    const w = workerRig({ doctor: () => ok(doctor(CRED, UP, KEY_OK)), connect: { code: 1, out: "error: key nmem_ab_fakefakefakefake rejected" } });
    const r = await w.m.connectTools(["codex"]);
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain("fakefake");
    w.done();
  });
});

// ---------- over the socket ----------

describe("D374 over the socket", () => {
  test("the settings frame carries Mem's health once read; 再看一次 reads it again; 装上 runs Mem's own command on the home", async () => {
    const { startCore } = await import("../src/core.ts");
    const { tempDir } = await import("./helpers.ts");
    const t = tempDir();
    let out = doctor(CRED, UP, KEY_BAD);
    const run = async (args: string[]) => {
      if (args[0] === "doctor") return { code: 1, out, err: "" };
      if (args[0] === "--version") return ok("nmem 0.10.120");
      return { code: 2, out: "", err: "not scripted" };
    };
    const sys = { which: (c: string) => (c === "nmem" ? "/usr/bin/nmem" : undefined), exists: () => false, read: () => undefined, list: () => [], real: (p: string) => p, home: "/home/x", platform: "linux" as const, uid: 1000 };
    let cc: "absent" | "installed" = "absent";
    const connects: string[][] = [];
    const core = startCore({
      dataDir: t.dir,
      port: 0,
      batchMs: 5,
      deviceProbes: { cua: async () => null, harnesses: async () => [{ harness: "claude-code", installed: true, loggedIn: true }] as any, kind: async () => "laptop" },
      bridgeLink: { run, env: {}, sys, exec: async () => undefined } as any,
      memPlugins: {
        inspectLocal: async () => ({ "claude-code": cc === "installed" ? { state: "installed", version: "0.7.36" } : { state: "absent" } }),
        everyMs: 0,
        connected: () => true,
        connectLocal: async (args) => (connects.push(args), (cc = "installed"), { code: 0, out: "{}", err: "" }),
      },
    });
    core.setPartner({ onTrigger: () => {} });
    core.persona.mem = { agentId: "ducter", owned: true };
    core.settings.setMemState("connected");
    const frames: any[] = [];
    const ws = new WebSocket(core.url);
    ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
    await new Promise<void>((res, rej) => ((ws.onopen = () => res()), (ws.onerror = rej)));
    const until = async (pred: (f: any) => boolean) => {
      for (let i = 0; i < 600; i++) {
        const hit = [...frames].reverse().find(pred);
        if (hit) return hit;
        await Bun.sleep(10);
      }
      throw new Error(`timeout; got ${frames.map((f) => f.t)}`);
    };
    try {
      ws.send(JSON.stringify({ t: "hello" }));
      ws.send(JSON.stringify({ t: "settings" }));
      const f = await until((x) => x.t === "settings" && x.mem?.health);
      expect(f.mem.health).toMatchObject({ issue: "signed_out" });
      expect(JSON.stringify(f)).not.toContain("nmem_xx");
      out = doctor(CRED, UP, KEY_OK, CC("warn", "not registered — run `nmem connect`"));
      ws.send(JSON.stringify({ t: "mem_health" }));
      await until((x) => x.t === "settings" && x.mem?.health?.issue === "plugin");
      // 接上 on the pane: D169's install for the home's agent, by Mem's own command, no task.
      ws.send(JSON.stringify({ t: "devices" }));
      await until((x) => x.t === "devices");
      out = doctor(CRED, UP, KEY_OK, CC());
      ws.send(JSON.stringify({ t: "mem_plugin_install", device: "local", harness: "claude-code" }));
      const r = await until((x) => x.t === "mem_plugin_result");
      expect(r).toEqual({ t: "mem_plugin_result", device: "local", harness: "claude-code", ok: true });
      await until((x) => x.t === "devices" && x.devices.some((d: any) => d.home && d.harnesses.some((h: any) => h.harness === "claude-code" && h.mem?.fresh)));
      expect(connects).toEqual([["--tool", "claude-code", "--on-conflict", "abort"]]);
      // The health follows (read again after the command).
      await until((x) => x.t === "settings" && x.mem?.health && !x.mem.health.issue);
    } finally {
      ws.close();
      core.stop();
      t.cleanup();
    }
  });
});
