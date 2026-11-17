// D335: how often the home reads its Bridge mailbox. Mem's `inbox` is pull-only, so: every minute;
// every 15 s while live with one of the user's own agents; +10 s, 30 s, 1 min, 2 min after a send or
// reply until its answer arrives; and a long-poll (`inbox --wait`) instead when the CLI offers one,
// falling back to the timer when it fails. Fakes only (a fake clock for the timers, and the fake
// nmem for the CLI's side): nothing reaches Mem.
import { describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Bodies } from "../../protocol/src/index.ts";
import { createNmemBridge, createPartner, type BridgeClient, type BridgeMessage } from "../src/index.ts";
import type { BridgeResult } from "../src/bridge.ts";
import { FakeClock, fakeCore, fakeMemory, fakeRunner, type Script } from "./fakes.ts";

const tmp = () => mkdtempSync(join(tmpdir(), "ducter-bridge-cadence-test-"));
const S = 1000;

/** Timers on the fake clock: advance() fires each due timer in order and lets its check finish. */
function fakeTimers(clock: FakeClock) {
  const list = new Map<number, { at: number; fn: () => void }>();
  let id = 0;
  let settle: () => Promise<void> = async () => {};
  return {
    setTimeout: (fn: () => void, ms: number): unknown => (list.set(++id, { at: clock.t + Math.max(0, ms), fn }), id),
    clearTimeout: (h: unknown) => void list.delete(h as number),
    onSettle(fn: () => Promise<void>) {
      settle = fn;
    },
    async advance(ms: number) {
      const target = clock.t + ms;
      for (;;) {
        let due: [number, { at: number; fn: () => void }] | undefined;
        for (const e of list) if (e[1].at <= target && (!due || e[1].at < due[1].at)) due = e;
        if (!due) break;
        list.delete(due[0]);
        clock.t = Math.max(clock.t, due[1].at);
        due[1].fn();
        await settle();
      }
      clock.t = target;
      await settle();
    },
  };
}

const PEER: BridgeMessage = { messageId: "bm-1", from: "reviewer (Alex)", agent: "reviewer", text: "Is the HawDB bench on main still red?" };
const OWN: BridgeMessage = { ...PEER, from: "terminal-claude (Weyl)", agent: "terminal-claude", mine: true };

/** A Bridge whose checks are recorded at the fake clock's time; `waits` holds open long-polls. */
function fakeBridge(clock: FakeClock, inbox: BridgeMessage[], opts: { canWait?: boolean } = {}) {
  const box = [...inbox];
  const checks: number[] = [];
  const replies: { messageId: string; text: string }[] = [];
  const waits: ((r: BridgeResult<{ ids: string[] }>) => void)[] = [];
  const bridge: BridgeClient = {
    async check(known) {
      checks.push(clock.t);
      return { ok: true, messages: box.filter((m) => !known.has(m.messageId)) };
    },
    async reply(messageId, text) {
      replies.push({ messageId, text });
      return { ok: true, messageId: `bm-r${replies.length}` };
    },
    ...(opts.canWait !== undefined
      ? {
          canWait: async () => opts.canWait!,
          waitInbox: () => new Promise<BridgeResult<{ ids: string[] }>>((res) => waits.push(res)),
        }
      : {}),
  };
  return { bridge, box, checks, replies, waits };
}

function setup(script: Script, inbox: BridgeMessage[], opts: { canWait?: boolean } = {}) {
  const clock = new FakeClock();
  const t0 = clock.t;
  const timers = fakeTimers(clock);
  const fc = fakeCore(clock, tmp());
  const fr = fakeRunner(script);
  fr.bindCards(fc.cards);
  const fb = fakeBridge(clock, inbox, opts);
  const partner = createPartner(fc.core, fr.runner, { now: clock.now, persistState: false, settleMs: 0, onError: (e: unknown) => console.error(e), memory: fakeMemory([]).memory, bridge: fb.bridge, bridgeStartMark: false, bridgeRecoverMs: 0, timers });
  timers.onSettle(async () => {
    for (let i = 0; i < 6; i++) await Bun.sleep(1);
    await partner.idle();
  });
  /** Check times in seconds since start, each once. */
  const at = () => [...new Set(fb.checks.map((t) => (t - t0) / S))];
  return { clock, timers, fc, partner, fb, at };
}

describe("D335: the period", () => {
  test("every minute by default, one check at a time", async () => {
    const { timers, partner, at } = setup(async (_i, s) => s.end(), []);
    await timers.advance(0);
    await timers.advance(3 * 60 * S + 5 * S);
    expect(at()).toEqual([0, 60, 120, 180]);
    await partner.close();
  });

  test("every 15 s while a conversation with one of the user's own agents is live", async () => {
    const { timers, partner, at } = setup(async (_i, s) => s.end(), [OWN]);
    await timers.advance(0);
    await timers.advance(61 * S);
    expect(at()).toEqual([0, 15, 30, 45, 60]);
    await partner.close();
  });
});

describe("D335: after a send or reply", () => {
  /** The partner answers the first message with bridge_reply. */
  const replyingSetup = () => {
    const ref: { fc?: ReturnType<typeof fakeCore> } = {};
    const r = setup(async (_input, s, n) => {
      if (n === 0) await ref.fc!.callTool("bridge_reply", { messageId: "bm-1", text: "Still red on main; I'll look." });
      s.end();
    }, [PEER]);
    ref.fc = r.fc;
    return r;
  };

  test("checks at +10 s, 30 s, 1 min and 2 min, then the period again", async () => {
    const r = replyingSetup();
    await r.timers.advance(0);
    expect(r.fb.replies.length).toBe(1);
    await r.timers.advance(3 * 60 * S + 5 * S);
    expect(r.at()).toEqual([0, 10, 30, 60, 120, 180]);
    await r.partner.close();
  });

  test("the rest are cancelled once its answer arrives", async () => {
    const r = replyingSetup();
    await r.timers.advance(0);
    expect(r.fb.replies.length).toBe(1);
    r.fb.box.push({ ...PEER, messageId: "bm-2", text: "Thanks, ping me when it's green.", inReplyTo: "bm-r1" });
    await r.timers.advance(2 * 60 * S + 5 * S);
    // The 10 s check took the answer; the 30 s, 1 min and 2 min ones never ran; the period did.
    expect(r.at()).toEqual([0, 10, 75]);
    const ins = r.fc.events.filter((e) => e.kind === "bridge_msg" && (e.body as Bodies["bridge_msg"]).direction === "in");
    expect(ins.map((e) => (e.body as Bodies["bridge_msg"]).messageId)).toEqual(["bm-1", "bm-2"]);
    await r.partner.close();
  });
});

describe("D335: the long-poll", () => {
  test("instead of the timer: a new handle runs the check; an error falls back to the timer, which tries again after 10 min", async () => {
    const { timers, partner, fb, at } = setup(async (_i, s) => s.end(), [], { canWait: true });
    await timers.advance(0);
    expect(fb.waits.length).toBe(1); // one long-poll running
    await timers.advance(2 * 60 * S);
    expect(at()).toEqual([0]); // no minute checks while it long-polls
    // A message arrives: the wait comes back with its handle, the check reads it, the next wait starts.
    fb.box.push({ ...PEER, messageId: "bm-9" });
    fb.waits[0]!({ ok: true, ids: ["bm-9"] });
    await timers.advance(0);
    expect(at()).toEqual([0, 120]);
    expect(fb.waits.length).toBe(2);
    // A wait that comes back at once with nothing new pauses 15 s: it never spins.
    fb.waits[1]!({ ok: true, ids: ["bm-9"] });
    await timers.advance(0);
    await timers.advance(10 * S);
    expect(fb.waits.length).toBe(2);
    await timers.advance(5 * S);
    expect(fb.waits.length).toBe(3);
    // The long-poll fails: the timer brings arrivals again, every minute.
    fb.waits[2]!({ ok: false, reason: "unavailable", message: "503" });
    await timers.advance(0);
    const before = at().length;
    await timers.advance(2 * 60 * S + 5 * S);
    expect(at().length - before).toBe(2);
    expect(fb.waits.length).toBe(3);
    // Ten minutes after the failure it tries the long-poll again.
    await timers.advance(8 * 60 * S);
    expect(fb.waits.length).toBe(4);
    await partner.close();
  });

  test("a CLI without `inbox --wait` stays on the timer", async () => {
    const { timers, partner, fb, at } = setup(async (_i, s) => s.end(), [], { canWait: false });
    await timers.advance(0);
    await timers.advance(2 * 60 * S + 5 * S);
    expect(fb.waits.length).toBe(0);
    expect(at()).toEqual([0, 60, 120]);
    await partner.close();
  });
});

describe("D335 with D334: one long-poll per Space context", () => {
  test("two places, a wait on each: a message in the second Space runs the check and the reply goes back there; one place failing puts only arrivals back on the timer", async () => {
    const clock = new FakeClock();
    const t0 = clock.t;
    const timers = fakeTimers(clock);
    const fc = fakeCore(clock, tmp());
    const fr = fakeRunner(async (_i, s, n) => {
      if (n === 0) await fc.callTool("bridge_reply", { messageId: "bm-t1", text: "收到" });
      s.end();
    });
    fr.bindCards(fc.cards);
    const box: BridgeMessage[] = [];
    const checks: number[] = [];
    const replies: { messageId: string; text: string; space?: string }[] = [];
    const waits: { ctx?: string; res: (r: BridgeResult<{ ids: string[] }>) => void }[] = [];
    const bridge: BridgeClient = {
      async check(known) {
        checks.push(clock.t);
        return { ok: true, messages: box.filter((m) => !known.has(m.messageId)) };
      },
      async reply(messageId, text, space) {
        replies.push({ messageId, text, ...(space ? { space } : {}) });
        return { ok: true, messageId: `bm-r${replies.length}` };
      },
      canWait: async () => true,
      waitContexts: () => ["ducter", "ducter-in-team"],
      waitInbox: (_s, ctx) => new Promise((res) => waits.push({ ...(ctx ? { ctx } : {}), res })),
    };
    const partner = createPartner(fc.core, fr.runner, { now: clock.now, persistState: false, settleMs: 0, onError: (e: unknown) => console.error(e), memory: fakeMemory([]).memory, bridge, bridgeStartMark: false, bridgeRecoverMs: 0, timers });
    timers.onSettle(async () => {
      for (let i = 0; i < 6; i++) await Bun.sleep(1);
      await partner.idle();
    });
    const at = () => [...new Set(checks.map((t) => (t - t0) / S))];
    await timers.advance(0);
    expect(waits.map((w) => w.ctx)).toEqual(["ducter", "ducter-in-team"]);
    await timers.advance(2 * 60 * S);
    expect(at()).toEqual([0]); // every place waits: no minute checks
    box.push({ ...OWN, messageId: "bm-t1", text: "联络测试：收到请回一句「收到」。", space: "ws-team", spaceLabel: "Team" });
    waits[1]!.res({ ok: true, ids: ["bm-t1"] });
    await timers.advance(0);
    expect(at()).toEqual([0, 120]);
    expect(replies).toEqual([{ messageId: "bm-t1", text: "收到", space: "ws-team" }]);
    // The second Space's wait starts again; the first is still open, never doubled.
    expect(waits.map((w) => w.ctx)).toEqual(["ducter", "ducter-in-team", "ducter-in-team"]);
    // The home's wait fails: the timer reads every minute again; the team Space keeps its wait.
    waits[0]!.res({ ok: false, reason: "unavailable", message: "503" });
    await timers.advance(0);
    const before = at().length;
    await timers.advance(2 * 60 * S + 5 * S);
    expect(at().length - before).toBeGreaterThanOrEqual(2);
    expect(waits.length).toBe(3);
    // Ten minutes after, only the failed place's long-poll is tried again.
    await timers.advance(8 * 60 * S);
    expect(waits.map((w) => w.ctx)).toEqual(["ducter", "ducter-in-team", "ducter-in-team", "ducter"]);
    await partner.close();
  });
});

describe("D335: the nmem client's long-poll (fake nmem)", () => {
  function world(messages: { id: string; from: string; to: string; body: string }[] = []) {
    const dir = tmp();
    const bin = join(dir, "nmem");
    writeFileSync(bin, `#!/bin/sh\nexec bun ${resolve(import.meta.dir, "../eval/fake-bridge-nmem.ts")} "$@"\n`);
    chmodSync(bin, 0o755);
    const state = join(dir, "state.json");
    const argv = join(dir, "argv.log");
    writeFileSync(argv, "");
    const ident = (agent: string) => ({ agent, member: "Weyl", member_id: "m-weyl", description: agent });
    const at = new Date().toISOString();
    writeFileSync(state, JSON.stringify({ seq: 10, identities: { ducter: ident("ducter"), terminal: ident("terminal-claude") }, messages: messages.map((m, i) => ({ op: `op-${i}`, created_at: at, ...m })) }));
    const bridge = (extra: Record<string, string> = {}) =>
      createNmemBridge({ context: "ducter", bin, env: { PATH: process.env.PATH ?? "", NMEM_FAKE_BRIDGE_STATE: state, NMEM_FAKE_ARGV_LOG: argv, ...extra }, retryDelaysMs: [0, 0] });
    const calls = () => readFileSync(argv, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as string[]);
    const deliver = (id: string) => {
      const s = JSON.parse(readFileSync(state, "utf8"));
      s.messages.push({ id, op: `op-${id}`, from: "terminal", to: "ducter", body: "ping", created_at: new Date().toISOString() });
      writeFileSync(state, JSON.stringify(s));
    };
    return { bridge, calls, deliver, argv };
  }

  test("canWait reads `inbox --help` once per nmem version", async () => {
    const w = world();
    const b = w.bridge({ NMEM_FAKE_INBOX_WAIT: "1" });
    expect(await b.canWait!()).toBe(true);
    expect(await b.canWait!()).toBe(true);
    expect(w.calls().filter((a) => a.includes("--help"))).toEqual([["--json", "--agent-context", "ducter", "bridge", "inbox", "--help"]]);
    expect(await w.bridge().canWait!()).toBe(false); // a CLI without it
  });

  test("with two places, each context waits on its own Space, and one failing fails only its own", async () => {
    const dir = tmp();
    const bin = join(dir, "nmem");
    writeFileSync(bin, `#!/bin/sh\nexec bun ${resolve(import.meta.dir, "../eval/fake-bridge-nmem.ts")} "$@"\n`);
    chmodSync(bin, 0o755);
    const state = join(dir, "state.json");
    const ident = (agent: string, space?: string) => ({ agent, member: "Weyl", member_id: "m-weyl", description: agent, ...(space ? { space } : {}) });
    writeFileSync(state, JSON.stringify({ seq: 10, messages: [], spaces: [{ id: "fake-space", label: "Only me", kind: "personal" }, { id: "ws-team", label: "Team", kind: "team" }], identities: { ducter: ident("ducter"), "ducter-in-team": ident("ducter", "ws-team"), codex: ident("codex", "ws-team") } }));
    const places = [{ context: "ducter-in-team", spaceId: "ws-team", spaceLabel: "Team", kind: "team" }];
    const mk = (wait: string) => createNmemBridge({ context: "ducter", places, bin, env: { PATH: process.env.PATH ?? "", NMEM_FAKE_BRIDGE_STATE: state, NMEM_FAKE_INBOX_WAIT: wait }, retryDelaysMs: [0, 0] });
    const b = mk("1");
    expect(b.waitContexts!()).toEqual(["ducter", "ducter-in-team"]);
    const home = b.waitInbox!(1, "ducter");
    const team = b.waitInbox!(5, "ducter-in-team");
    await Bun.sleep(300);
    const s = JSON.parse(readFileSync(state, "utf8"));
    s.messages.push({ id: "msg-030", op: "op-30", from: "codex", to: "ducter-in-team", body: "ping", created_at: new Date().toISOString(), space: "ws-team" });
    writeFileSync(state, JSON.stringify(s));
    expect(await team).toEqual({ ok: true, ids: ["msg-030"] });
    expect(await home).toEqual({ ok: true, ids: [] }); // the home's Space had nothing: its wait ran out
    const half = mk("error:ducter");
    expect((await half.waitInbox!(1, "ducter")).ok).toBe(false);
    expect((await half.waitInbox!(1, "ducter-in-team")).ok).toBe(true);
  }, 30_000);

  test("waitInbox holds until a message arrives, opens nothing; a failing wait is a failure", async () => {
    const w = world();
    const b = w.bridge({ NMEM_FAKE_INBOX_WAIT: "1" });
    const pending = b.waitInbox!(5);
    await Bun.sleep(300);
    w.deliver("msg-020");
    const r = await pending;
    expect(r).toEqual({ ok: true, ids: ["msg-020"] });
    expect(w.calls().some((a) => a.includes("open"))).toBe(false);
    expect(w.calls().at(-1)).toEqual(["--json", "--agent-context", "ducter", "bridge", "inbox", "--wait", "5"]);
    const bad = await w.bridge({ NMEM_FAKE_INBOX_WAIT: "error" }).waitInbox!(5);
    expect(bad.ok).toBe(false);
  });
});

