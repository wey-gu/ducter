// D539: 复制密钥 / Copy a key, through the real core (the partner's key_copy, a task's ask_for_key,
// decisions, the Log, the clients' socket) over fake computers: the Mac has STI_MCP_API_KEY in its
// shell, hel (the home) and haswell don't, and an older worker can't copy at all. Go copies it and
// the next task session there has it; Hold doesn't; the value is never in the Log, a file of the
// home's in clear, a client frame or anything that passed through the home; remove forgets it.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bodies, ServerFrame } from "@ducter/protocol";
import type { SessionSpec } from "@ducter/protocol/src/internal.ts";
import { createKeyShelf, type KeyShelf } from "@ducter/protocol/src/key-shelf.ts";
import { fileKey } from "@ducter/protocol/src/lock-key.ts";
import { startCore, type Core } from "../src/core.ts";
import { cardPolicy } from "../src/channels/hub.ts";
import { tempDir } from "./helpers.ts";

const VALUE = "sti-fake-7c41e2b9d0a35f68e1"; // not any provider's format
const ENV = "STI_MCP_API_KEY";

let core: Core;
let td: ReturnType<typeof tempDir>;
let dirs: string[];
let frames: ServerFrame[];
let sockets: WebSocket[];
let sends: { taskId: string; text: string }[];
/** Everything that passed through the home on its way between computers (args and answers). */
let wire: string[];
let shelves: Record<string, KeyShelf>;

const shelfOn = (name: string, shell: Record<string, string> = {}) => {
  const dir = mkdtempSync(join(tmpdir(), `ducter-keys-${name}-`));
  dirs.push(dir);
  return createKeyShelf({ dataDir: dir, shell: async (e) => shell[e], env: {}, lock: fileKey(join(dir, "kept-keys")) });
};

const start = (keyWaitMs = 5000) => {
  shelves = { local: shelfOn("hel"), w1: shelfOn("mac", { [ENV]: VALUE }), w2: shelfOn("haswell") };
  const workers = [
    { id: "w1", name: "Weyl's MacBook Pro", online: true },
    { id: "w2", name: "haswell", online: true },
    { id: "w3", name: "old-mini", online: true },
  ];
  core = startCore({
    dataDir: td.dir,
    port: 0,
    push: false,
    browser: false,
    keyWaitMs,
    newTaskComputers: { homeName: () => "hel", nameOf: (d: string) => workers.find((w) => w.id === d)?.name, workers: () => workers, folderInfo: async () => ({ exists: false }) } as never,
    keyCopy: {
      shelf: shelves.local,
      async call(device, op, args) {
        wire.push(JSON.stringify({ device, op, args }));
        if (device === "w3") throw new Error(`unknown op ${op}`);
        const fn = shelves[device]?.ops[op];
        if (!fn) throw new Error(`unknown op ${op}`);
        const out = await fn(args);
        wire.push(JSON.stringify(out));
        return out;
      },
    },
  });
  core.setRunner({ send: async (taskId: string, text: string) => void sends.push({ taskId, text }) } as never);
};
const openTask = (taskId: string, title: string, device?: string) =>
  core.log.append({ stream: `task:${taskId}`, origin: "partner", kind: "task_open", body: { taskId, title, project: "", place: { kind: "none", ...(device ? { device } : {}) } as never, harness: "claude-code", brief: "Set up the Prow log MCP and check it answers." } });
const partner = (args: object) => core.mcp.call({ role: "partner" }, "key_copy", args) as Promise<{ ok: boolean; error?: string; note?: string }>;
const ask = (taskId: string, args: object) => core.mcp.call({ role: "task", taskId }, "ask_for_key", args) as Promise<string>;
const cards = () => core.log.read({ fromSeq: 0, limit: 10_000, kinds: ["decision"] }).map((e) => e.body as Bodies["decision"]).filter((d) => d.copyKey);
const copies = () => core.log.read({ fromSeq: 0, limit: 10_000, kinds: ["key_copy"] }).map((e) => e.body as Bodies["key_copy"]);
const resolutions = () => core.log.read({ fromSeq: 0, limit: 10_000, kinds: ["decision_resolved"] }).map((e) => e.body as Bodies["decision_resolved"]);
const until = async (pred: () => boolean, ms = 3000) => {
  for (const end = Date.now() + ms; Date.now() < end; ) {
    if (pred()) return;
    await Bun.sleep(10);
  }
  throw new Error("timed out");
};
async function socket() {
  const ws = new WebSocket(core.url);
  sockets.push(ws);
  ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
  await new Promise((r) => (ws.onopen = r));
  ws.send(JSON.stringify({ t: "hello" }));
  return (f: object) => ws.send(JSON.stringify(f));
}
/** Every file under dir, as bytes (the task key files, which hold it on purpose, left out). */
function filesOf(dir: string, skip: RegExp): string[] {
  const out: string[] = [];
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, f.name);
    if (skip.test(p)) continue;
    if (f.isDirectory()) out.push(...filesOf(p, skip));
    else out.push(readFileSync(p).toString("latin1"));
  }
  return out;
}
function nowhere() {
  const all = [JSON.stringify(core.log.read({ fromSeq: 0, limit: 100_000 })), JSON.stringify(frames), JSON.stringify(sends), ...wire, ...filesOf(td.dir, /task-keys/)].join("\n");
  expect(all).not.toContain(VALUE);
}
const spec = (keyRefs?: string[]): SessionSpec => ({ harness: "claude-code", cwd: "/tmp", mcp: [], permissionMode: "bypass", ...(keyRefs ? { keyRefs } : {}) });

beforeEach(() => {
  td = tempDir();
  dirs = [];
  frames = [];
  sockets = [];
  sends = [];
  wire = [];
});
afterEach(async () => {
  for (const s of sockets) s.close();
  await core.stop();
  td.cleanup();
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

describe("复制密钥 / Copy a key", () => {
  test("the partner proposes it; Go copies it to hel and haswell; the next task session there has it; nothing carries the value", async () => {
    start();
    expect(core.mcp.listed({ role: "partner" })).toContain("key_copy");
    const r = await partner({ env: ENV, name: "Prow log MCP key", from: "Mac", to: ["hel", "haswell"], why: "the Prow log MCP needs it there" });
    expect(r.ok).toBe(true);
    const d = cards()[0]!;
    expect(d.copyKey).toMatchObject({ env: ENV, name: "Prow log MCP key", from: { device: "w1", name: "Weyl's MacBook Pro" }, to: [{ device: "local", name: "hel" }, { device: "w2", name: "haswell" }], source: "shell" });
    expect(d.defaultOption).toBe("hold");
    expect(d.defaultAt).toBeUndefined();
    expect(d.reversible).toBe(false);
    // Asked only in Ducter itself; never a standing go, never a reply, never a direct decide.
    expect(cardPolicy(d)).toBe("never");
    expect(() => core.decisions.decide(d.decisionId, "go")).toThrow();
    const send = await socket();
    send({ t: "decide", decisionId: d.decisionId, option: "go" });
    await until(() => resolutions().some((x) => x.decisionId === d.decisionId));
    expect(copies()[0]).toMatchObject({ decisionId: d.decisionId, env: ENV, from: "Weyl's MacBook Pro", to: ["hel", "haswell"], by: "go" });
    expect(shelves.local!.list().map((k) => k.env)).toEqual([ENV]);
    expect(shelves.w2!.list()).toMatchObject([{ env: ENV, name: "Prow log MCP key", from: "Weyl's MacBook Pro" }]);
    // The next task on hel asks for it: given at once, by reference; its session starts with it.
    openTask("t1", "在 hel 配置并验证 Prow 日志 MCP");
    const out = await ask("t1", { env: ENV, name: "Prow log MCP key" });
    expect(out).toContain("kept by Ducter on hel");
    expect(out).not.toContain(VALUE);
    expect(core.keyCopy.refsFor("t1")).toEqual([ENV]);
    expect(core.keyCopy.withKeys(spec(core.keyCopy.refsFor("t1"))).env?.[ENV]).toBe(VALUE);
    // haswell's own side: a session started there with the reference gets it from haswell's shelf.
    expect(shelves.w2!.withKeys(spec([ENV])).env?.[ENV]).toBe(VALUE);
    expect(shelves.w2!.withKeys(spec()).env?.[ENV]).toBeUndefined();
    // A command on hel that printed it: the Log and every screen show dots.
    core.log.append({ stream: "task:t1", origin: "task", kind: "task_event", body: { taskId: "t1", role: "tool", text: `curl -H "x-api-key: ${VALUE}" ok` } });
    expect(JSON.stringify(core.log.read({ stream: "task:t1", fromSeq: 0, limit: 1000 }))).toContain("••••••");
    nowhere();
  });

  test("Hold copies nothing", async () => {
    start();
    await partner({ env: ENV, from: "Weyl's MacBook Pro", to: ["haswell"] });
    const d = cards()[0]!;
    const send = await socket();
    send({ t: "decide", decisionId: d.decisionId, option: "hold" });
    await until(() => resolutions().some((x) => x.decisionId === d.decisionId));
    expect(resolutions().find((x) => x.decisionId === d.decisionId)?.option).toBe("hold");
    expect(copies()).toHaveLength(0);
    expect(shelves.w2!.list()).toHaveLength(0);
    expect(wire.some((w) => w.includes("keys_seal"))).toBe(false);
  });

  test("a task on haswell needs it: Ducter finds it on the Mac, the task waits in 等你 on the card, and Go answers it in its call", async () => {
    start();
    openTask("t2", "在 haswell 配置并验证 Prow 日志 MCP", "w2");
    const call = ask("t2", { env: ENV, name: "Prow log MCP key", why: "the MCP server reads it" });
    await until(() => cards().length === 1);
    const d = cards()[0]!;
    expect(d.taskId).toBe("t2");
    expect(d.copyKey).toMatchObject({ from: { device: "w1" }, to: [{ device: "w2", name: "haswell" }], taskIds: ["t2"] });
    expect(core.tasks.get("t2")?.attention).toBe("needs_you");
    // D481: open at the home, so no client closes it as answered elsewhere.
    expect(core.decisions.openIds()).toContain(d.decisionId);
    // A message to the task never answers it.
    core.decisions.answeredByMessage("t2", "好了吗", "user");
    expect(core.decisions.isPending(d.decisionId)).toBe(true);
    const send = await socket();
    send({ t: "decide", decisionId: d.decisionId, option: "go" });
    const out = await call;
    expect(out).toContain("kept by Ducter on haswell");
    expect(out).not.toContain(VALUE);
    const file = /\. '([^']+)'/.exec(out)![1]!;
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(Bun.spawnSync(["sh", "-c", `. '${file}' && printf %s "$${ENV}"`]).stdout.toString()).toBe(VALUE);
    await until(() => resolutions().some((x) => x.decisionId === d.decisionId));
    expect(resolutions().find((x) => x.decisionId === d.decisionId)).toMatchObject({ option: "go", delivered: true });
    expect(core.tasks.get("t2")?.attention).toBe("working");
    expect(core.keyCopy.refsFor("t2")).toEqual([ENV]);
    // Its task ends: its file there goes, and its grant.
    core.tasks.setState("t2", "done", "hot");
    await until(() => core.keyCopy.refsFor("t2").length === 0);
    nowhere();
  });

  test("remove: the computer forgets it, the list says so, and a new session there no longer has it", async () => {
    start();
    await partner({ env: ENV, from: "Mac", to: ["haswell"] });
    const send = await socket();
    send({ t: "decide", decisionId: cards()[0]!.decisionId, option: "go" });
    await until(() => shelves.w2!.list().length === 1);
    send({ t: "kept_keys", device: "w2" });
    await until(() => frames.some((f) => f.t === "kept_keys" && (f as { ok?: boolean }).ok === true));
    expect((frames.find((f) => f.t === "kept_keys") as { keys: { env: string }[] }).keys.map((k) => k.env)).toEqual([ENV]);
    send({ t: "kept_key_remove", device: "w2", env: ENV });
    await until(() => frames.some((f) => f.t === "kept_keys" && (f as { removed?: string }).removed === ENV));
    expect(shelves.w2!.list()).toHaveLength(0);
    expect(shelves.w2!.withKeys(spec([ENV])).env?.[ENV]).toBeUndefined();
    expect(copies().at(-1)).toMatchObject({ env: ENV, removed: "haswell", by: "user" });
    nowhere();
  });

  test("checked by code: not on the Mac, not a computer of theirs, an older worker; a copy that can't go keeps its card", async () => {
    start();
    expect((await partner({ env: "OTHER_TOKEN", from: "Mac", to: ["hel"] })).error).toContain("isn't on Weyl's MacBook Pro");
    expect((await partner({ env: ENV, from: "Mac", to: ["prod-db"] })).error).toContain("isn't one of the person's computers");
    expect((await partner({ env: ENV, from: "old-mini", to: ["hel"] })).error).toContain("older Ducter");
    expect((await partner({ env: ENV, from: "Mac", to: ["old-mini"] })).error).toContain("older Ducter");
    expect((await partner({ env: "PATH", from: "Mac", to: ["hel"] })).ok).toBe(false);
    expect(cards()).toHaveLength(0);
    // The Mac lost it between the card and the Go: nothing goes, the card stays open, saying why.
    await partner({ env: ENV, from: "Mac", to: ["haswell"] });
    const d = cards()[0]!;
    shelves.w1 = shelfOn("mac-now");
    const send = await socket();
    send({ t: "decide", decisionId: d.decisionId, option: "go" });
    await until(() => copies().length === 1);
    expect(copies()[0]).toMatchObject({ to: [], failed: [{ name: "haswell", why: "gone" }] });
    expect(core.decisions.isPending(d.decisionId)).toBe(true);
    // A list from a worker too old to say: said plainly.
    send({ t: "kept_keys", device: "w3" });
    await until(() => frames.some((f) => f.t === "kept_keys" && (f as { device?: string }).device === "w3"));
    expect(frames.find((f) => f.t === "kept_keys" && (f as { device?: string }).device === "w3")).toMatchObject({ ok: false, why: "unsupported" });
  });
});

// The lead's review: the task's copy card must stay open in the conversation of a client that
// gets exactly what the home sends (its events and On hand, with D481's openAsks), and Go from
// there must copy. Fed through the real socket into the web client's own Store.
test("a task's copy card stays open in the web client's conversation, and Go from there copies", async () => {
  const { Store } = await import("../../../apps/web/src/store.ts");
  start();
  openTask("t3", "在 haswell 配置并验证 Prow 日志 MCP", "w2");
  const call = ask("t3", { env: ENV, name: "Prow log MCP key" });
  await until(() => cards().length === 1);
  const d = cards()[0]!;
  const send = await socket();
  await until(() => frames.some((f) => f.t === "on_hand" && JSON.stringify(f).includes(d.decisionId)) && frames.some((f) => f.t === "events" && JSON.stringify(f).includes(`"decisionId":"${d.decisionId}"`)));
  const store = new Store();
  for (const f of frames) store.apply(f as never);
  const held = store.decisions.get(d.decisionId)!;
  expect(held.copyKey?.env).toBe(ENV);
  expect(held.resolved).toBeUndefined(); // D481's reconcile leaves it open: the home lists it
  expect(held.pending ?? "").toBe("");
  expect(store.pendingDecision("t3")?.decisionId).toBe(d.decisionId);
  // What the conversation's Copy sends (app.ts copyKey): the copy runs and the call is answered.
  send({ t: "decide", decisionId: d.decisionId, option: "go" });
  expect(await call).toContain("kept by Ducter on haswell");
  expect(shelves.w2!.list().map((k) => k.env)).toEqual([ENV]);
  nowhere();
});
