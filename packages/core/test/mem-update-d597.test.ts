// D597: 更新 / Update runs the agent's own plugin commands on that computer, reads the version back
// with Mem's inspect, and says 已更新到. A task opens only when it didn't take, handed every command
// and its output. No doctor on the way, so another agent's finding never blocks this one; a reply
// carrying a Mem link or key is hidden before it is kept. Fake CLIs throughout: nothing real runs.
import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bodies, DeviceHarness, LogEvent, MemPluginView, TaskCard } from "@ducter/protocol";
import { hideMemSecrets, MEM_PLUGIN_UPDATE, type MemUpdateRun } from "@ducter/protocol/src/mem-plugins.ts";
import { newestCodexHooks, runMemPluginUpdate, tailOf, updateTook, type MemUpdateSys } from "../src/mem-plugin-update.ts";
import { createMemPlugins, memSetupBrief } from "../src/mem-plugins.ts";
import { openLog } from "../src/log.ts";

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

type Dev = { id: string; name: string; home: boolean; awake: boolean; harnesses: { harness: string; installed: boolean; loggedIn: boolean }[] };
const signed = (...hs: string[]) => hs.map((harness) => ({ harness, installed: true, loggedIn: true }));
const agents = (...hs: string[]): DeviceHarness[] => hs.map((harness) => ({ harness, installed: true, loggedIn: true, canBePartner: false }));
const at = "2026-11-26T07:43:00.000Z";

let dir: string;
beforeEach(() => (dir = mkdtempSync(join(tmpdir(), "ducter-memupd-"))));
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/**
 * haswell as the author has it: a worker, Claude Code's plugin at 0.7.38 with 0.7.39 out, and
 * Codex's own Mem line in trouble (two copies). The direct update is a fake that moves the version
 * (or doesn't) and answers what it ran.
 */
function setup(o: { direct?: (h: string) => Promise<MemUpdateRun | "old" | undefined>; moves?: boolean; signedIn?: boolean; on?: boolean } = {}) {
  const log = fakeLog();
  const plugins: Record<string, MemPluginView> = {
    "claude-code": { state: "installed", version: "0.7.38", checkedAt: at },
    codex: { state: "review", why: "multiple", versions: ["0.1.10", "0.1.55"], checkedAt: at },
  };
  const devs: Dev[] = [
    { id: "local", name: "hel", home: true, awake: true, harnesses: signed("claude-code") },
    { id: "w-haswell", name: "haswell", home: false, awake: true, harnesses: o.signedIn === false ? [] : [{ harness: "claude-code", installed: true, loggedIn: false }, { harness: "codex", installed: true, loggedIn: true }] },
  ];
  const opened: any[] = [];
  const ran: string[] = [];
  const mp = createMemPlugins({
    dataDir: dir,
    log: log as any,
    tasks: { get: () => undefined, list: () => [] } as any,
    persona: { id: "p" },
    runner: () => ({ openTask: async (i: any) => (opened.push(i), { taskId: `tsk${opened.length}` } as TaskCard) }) as any,
    on: () => o.on ?? true,
    lang: () => "zh",
    inspectLocal: async () => ({ "claude-code": { state: "installed", version: "0.7.39", checkedAt: at } }),
    inspectWorker: async () => structuredClone(plugins),
    devices: async () => devs,
    checkUpdates: async () => ({ "claude-code": "0.7.39", codex: "0.1.55" }),
    updateDirect: async (id, home, h) => {
      ran.push(`${id}:${h}`);
      const r = o.direct ? await o.direct(h) : { ok: true, steps: MEM_PLUGIN_UPDATE[h]!.map((a) => ({ cmd: a.join(" "), code: 0, tail: "" })) };
      if (o.moves ?? (r && r !== "old" && r.ok)) plugins[h] = { state: "installed", version: "0.7.39", checkedAt: at };
      return r;
    },
    everyMs: 0,
  });
  const line = () => mp.view("w-haswell", agents("claude-code", "codex"))[0]!.mem!;
  return { log, mp, opened, ran, line, plugins };
}

const settle = async () => {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
};

test("Update runs the agent's own commands there, reads 0.7.39 back, and opens no task", async () => {
  const s = setup();
  await s.mp.check("w-haswell");
  expect(s.line()).toMatchObject({ state: "update", version: "0.7.38", available: "0.7.39" });
  const r = await s.mp.install("w-haswell", "claude-code");
  expect(r).toEqual({ ok: true });
  // From the tap on, the line is busy (正在更新到 0.7.39…), with no task.
  expect(s.line()).toMatchObject({ busy: true });
  expect(s.line().taskId).toBeUndefined();
  await settle();
  expect(s.ran).toEqual(["w-haswell:claude-code"]);
  expect(s.opened).toEqual([]);
  expect(s.line()).toMatchObject({ state: "installed", version: "0.7.39", updated: true });
  expect(s.line().busy).toBeUndefined();
});

test("a command that fails hands a task every command, its exit code and output; the line says a task took over", async () => {
  const s = setup({
    direct: async () => ({
      ok: false,
      steps: [
        { cmd: "claude plugin marketplace update nowledge-community", code: 0, tail: "✔ Successfully updated marketplace: nowledge-community" },
        { cmd: "claude plugin update nowledge-mem@nowledge-community", code: 1, tail: "Error: Plugin \"nowledge-mem\" is not installed at scope user" },
      ],
    }),
  });
  await s.mp.check("w-haswell");
  await s.mp.install("w-haswell", "claude-code");
  await settle();
  expect(s.opened).toHaveLength(1);
  const t = s.opened[0];
  expect(t.title).toBe("为 haswell 上的 Claude Code 更新 Nowledge Mem");
  expect(t.place).toEqual({ kind: "none", device: "w-haswell" });
  expect(t.brief).toContain("`claude plugin update nowledge-mem@nowledge-community` exited 1");
  expect(t.brief).toContain('Plugin "nowledge-mem" is not installed at scope user');
  expect(t.brief).toContain("reads 0.7.38");
  expect(t.brief).toContain("Take over from there");
  expect(s.line()).toMatchObject({ state: "update", taskId: "tsk1", handed: true });
  // The task ends: the line is read again and says where it is.
  s.plugins["claude-code"] = { state: "installed", version: "0.7.39", checkedAt: at };
  s.log.append({ stream: "task:tsk1", origin: "system", kind: "task_state", body: { taskId: "tsk1", attention: "done" } });
  await settle();
  expect(s.line()).toMatchObject({ state: "installed", version: "0.7.39", updated: true });
  expect(s.line().handed).toBeUndefined();
});

test("every command exits 0 but the version didn't move: not updated; a task takes it with that said", async () => {
  const s = setup({ moves: false });
  await s.mp.check("w-haswell");
  await s.mp.install("w-haswell", "claude-code");
  await settle();
  expect(s.line().updated).toBeUndefined();
  expect(s.opened).toHaveLength(1);
  expect(s.opened[0].brief).toContain("exited 0");
  expect(s.opened[0].brief).toContain("reads 0.7.38");
});

test("another agent's trouble there never blocks this one: no doctor is read, and the brief keeps the task to its own agent", async () => {
  const s = setup();
  await s.mp.check("w-haswell");
  // Codex's line there is in trouble (two copies); Claude Code's update goes through anyway.
  expect(s.mp.view("w-haswell", agents("codex"))[0]!.mem).toMatchObject({ state: "review" });
  await s.mp.install("w-haswell", "claude-code");
  await settle();
  expect(s.line()).toMatchObject({ updated: true });
  const brief = memSetupBrief({ agent: "Claude Code", host: "claude-code", device: "haswell", lang: "zh", harness: "claude-code", what: { kind: "update", from: "0.7.38", to: "0.7.39" } });
  expect(brief).toContain("another tool's row failing (another agent's MCP address, say) is not: don't fix it, don't stop for it");
  expect(brief).toContain("Ducter's relay");
  expect(brief).toContain("Updating a plugin needs no Mem credential at all.");
  expect(brief).toContain("`claude plugin marketplace update nowledge-community`, then `claude plugin update nowledge-mem@nowledge-community`");
});

test("no Mem connection: nothing is asked for in a text field; a task never asks for a link or key", async () => {
  // Memory on needs Ducter's own Mem connected (D169): without it, Update does nothing and the
  // clients show Settings › Memory's sign-in.
  const off = setup({ on: false });
  expect(await off.mp.install("w-haswell", "claude-code")).toEqual({ ok: false, reason: "off" });
  expect(off.opened).toEqual([]);
  expect(off.ran).toEqual([]);
  for (const kind of ["install", "update", "tidy", "review"] as const) {
    const b = memSetupBrief({ agent: "Claude Code", host: "claude-code", device: "haswell", lang: "zh", what: { kind } as never });
    expect(b).toContain("Never ask the user for a connect link, a server address, an API key or a workspace");
    expect(b).toContain("Settings › Memory signs it in");
    expect(b).not.toContain("ask the user for a connect link (report_to_main");
  }
});

test("a worker from before D597 (no op): the task as before, nothing to tell it", async () => {
  const old = setup({ direct: async () => "old" });
  await old.mp.check("w-haswell");
  await old.mp.install("w-haswell", "claude-code");
  await settle();
  expect(old.opened).toHaveLength(1);
  expect(old.opened[0].brief).not.toContain("Ducter already ran");
  expect(old.line().handed).toBeUndefined();
});

test("no agent there to take over: stuck, and Update stays", async () => {
  const none = setup({ signedIn: false, direct: async () => ({ ok: false, steps: [{ cmd: "claude plugin update nowledge-mem@nowledge-community", code: 1, tail: "network" }] }) });
  await none.mp.check("w-haswell");
  await none.mp.install("w-haswell", "claude-code");
  await settle();
  expect(none.opened).toEqual([]);
  expect(none.line()).toMatchObject({ state: "update", stuck: true });
});

test("a double tap runs the commands once", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const s = setup({ direct: async (h) => (await gate, { ok: true, steps: MEM_PLUGIN_UPDATE[h]!.map((a) => ({ cmd: a.join(" "), code: 0, tail: "" })) }) });
  await s.mp.check("w-haswell");
  await Promise.all([s.mp.install("w-haswell", "claude-code"), s.mp.install("w-haswell", "claude-code")]);
  await s.mp.install("w-haswell", "claude-code");
  release();
  await settle();
  expect(s.ran).toEqual(["w-haswell:claude-code"]);
  expect(s.line()).toMatchObject({ updated: true });
});

// ---------- the runner itself, with fake CLIs ----------

function fakeSys(o: { fail?: string; missing?: string; hooks?: string; out?: string } = {}): MemUpdateSys & { argv: string[][] } {
  const argv: string[][] = [];
  return {
    argv,
    which: (c) => c !== o.missing,
    codexHooks: () => o.hooks,
    async run(a) {
      argv.push(a);
      return a.join(" ").includes(o.fail ?? "\0") ? { code: 1, out: o.out ?? "error: boom" } : { code: 0, out: "ok" };
    },
  };
}

test("runs Claude Code's two commands in order; stops at the first that fails", async () => {
  const ok = fakeSys();
  expect(await runMemPluginUpdate("claude-code", ok)).toMatchObject({ ok: true, steps: [{ cmd: "claude plugin marketplace update nowledge-community", code: 0 }, { cmd: "claude plugin update nowledge-mem@nowledge-community", code: 0 }] });
  const bad = fakeSys({ fail: "marketplace update" });
  const r = await runMemPluginUpdate("claude-code", bad);
  expect(r).toMatchObject({ ok: false, steps: [{ code: 1, tail: "error: boom" }] });
  expect(bad.argv).toHaveLength(1);
});

test("Codex: marketplace upgrade, plugin add, then the newest copy's hooks setup; no copy found is a failure", async () => {
  const s = fakeSys({ hooks: "/h/.codex/plugins/cache/nowledge-community/nowledge-mem/0.1.55/scripts/install_hooks.py" });
  const r = await runMemPluginUpdate("codex", s);
  expect(r?.ok).toBe(true);
  expect(s.argv).toEqual([
    ["codex", "plugin", "marketplace", "upgrade", "nowledge-community"],
    ["codex", "plugin", "add", "nowledge-mem@nowledge-community"],
    ["python3", "/h/.codex/plugins/cache/nowledge-community/nowledge-mem/0.1.55/scripts/install_hooks.py"],
  ]);
  const none = await runMemPluginUpdate("codex", fakeSys());
  expect(none).toMatchObject({ ok: false });
  expect(none!.steps.at(-1)!.tail).toContain("install_hooks.py");
});

test("an agent's command not on PATH is said as such (127); pi updates its one package; DeepSeek Harness has none", async () => {
  expect(await runMemPluginUpdate("claude-code", fakeSys({ missing: "claude" }))).toMatchObject({ ok: false, steps: [{ code: 127 }] });
  const pi = fakeSys();
  await runMemPluginUpdate("pi", pi);
  expect(pi.argv).toEqual([["pi", "update", "npm:nowledge-mem-pi"]]);
  expect(await runMemPluginUpdate("deepseek-harness", fakeSys())).toBeUndefined();
});

test("output is cut to its last lines and scrubbed of Mem links and keys", () => {
  const t = tailOf(`a\nb\nc\nd\ne\nf\ng\nkey nmem_ck_${"x".repeat(24)} at https://mem.example/app?nmem_connect=nmem_ct_abc123456789`);
  expect(t.split("\n")).toHaveLength(6);
  expect(t).not.toContain("nmem_ck_x");
  expect(t).not.toContain("nmem_connect=");
});

test("took: at least the one out, or past the one it had; unchanged is not", () => {
  expect(updateTook("0.7.38", "0.7.39", "0.7.39")).toBe(true);
  expect(updateTook("0.7.38", "0.7.38", "0.7.39")).toBe(false);
  expect(updateTook("0.7.38", "0.7.39", "0.7.40")).toBe(true); // the marketplace trails Mem's list by one
  expect(updateTook("0.7.38", undefined, "0.7.39")).toBe(false);
});

test("the newest Codex copy's hooks setup", () => {
  const tree: Record<string, string[]> = {
    "/h/plugins/cache": ["nowledge-community", "other"],
    "/h/plugins/cache/nowledge-community": ["nowledge-mem"],
    "/h/plugins/cache/nowledge-community/nowledge-mem": ["0.1.10", "0.1.55", "0.1.9"],
    "/h/plugins/cache/other": [],
  };
  const has = new Set(["0.1.10", "0.1.55", "0.1.9"].map((v) => `/h/plugins/cache/nowledge-community/nowledge-mem/${v}/scripts/install_hooks.py`));
  const list = (p: string) => {
    if (!tree[p]) throw new Error("ENOTDIR");
    return tree[p]!;
  };
  expect(newestCodexHooks("/h", (p) => has.has(p), list)).toBe("/h/plugins/cache/nowledge-community/nowledge-mem/0.1.55/scripts/install_hooks.py");
  expect(newestCodexHooks("/nowhere", () => false, list)).toBeUndefined();
});

// ---------- a Mem link or key typed into a reply ----------

test("hides Mem's own link, token and key shapes; a placeholder and ordinary words stay", () => {
  const prompt = `Connect Nowledge Mem for this AI tool.\nPOST https://cloud.nowledge.co/api/connect/redeem {"token":"nmem_ct_${"a1".repeat(16)}"}\nnmem config client set --url https://cloud.nowledge.co --api-key <api_key from step 1>\nnmem connect --url https://m.example --api-key nmem_ck_${"z9".repeat(12)}`;
  const h = hideMemSecrets(prompt);
  expect(h.hid).toBe(true);
  expect(h.text).not.toContain("nmem_ct_a1");
  expect(h.text).not.toContain("nmem_ck_z9");
  expect(h.text).toContain("--api-key <api_key from step 1>");
  expect(hideMemSecrets("用 token_bucket_implementation 那个方案，继续").hid).toBe(false);
});

test("a reply to a task's ask carrying a connect token is kept hidden: the task never gets it", async () => {
  const log = openLog({ path: join(dir, "ducter.db"), persona: "default" });
  const { createDecisions } = await import("../src/decisions.ts");
  const { FakeClock } = await import("../src/clock.ts");
  const cards = new Map<string, TaskCard>([["t1", { taskId: "t1", attention: "working" } as TaskCard]]);
  const dec = createDecisions({ log, clock: new FakeClock(Date.parse(at)), tasks: { get: (id: string) => cards.get(id), setState: () => {}, pendingDecisions: () => [] } as never } as never);
  try {
    log.append({ stream: "task:t1", origin: "task", kind: "report", body: { taskId: "t1", state: "needs_input", summary: "还缺连接链接。", evidence: [], questions: [{ id: "q", text: "请提供连接链接", blocking: true, reversible: true }] } });
    const d = log.read({ stream: "channel", kinds: ["decision"] })[0]!.body as Bodies["decision"];
    const token = `nmem_ct_${"f0".repeat(16)}`;
    dec.decide(d.decisionId, "reply", `https://cloud.nowledge.co/app?nmem_connect=${token} 用这个`);
    const r = log.read({ stream: "channel", kinds: ["decision_resolved"] }).at(-1)!.body as Bodies["decision_resolved"];
    expect(r.text).toBe("<link> 用这个");
    expect(JSON.stringify(log.read({}))).not.toContain(token);
  } finally {
    dec.stop?.();
    log.close?.();
  }
});
