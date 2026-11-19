// D400: Nowledge Bridge in nmem 0.10.121 (research/161). #10402's identity inbox is the plain `bridge
// inbox` (no `--all-spaces`), entries carry their Space and Mem's own open/reply argv, `--wait` takes
// 1–5 s, `--watch` streams changes, a context the identity inbox doesn't take is refused in plain text,
// and an identity cursor can go stale. Both CLI shapes keep working: the fake answers as 0.10.120 or
// 0.10.121 by NMEM_FAKE_VERSION. Fakes only: nothing here reaches Mem.
import { describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createNmemBridge, createPartner, type BridgeClient, type BridgeMessage } from "../src/index.ts";
import { inboxShapeIn, memArgv, namesTarget, stuckSpaceIn, waitBoundIn, UNSTATED_WAIT_S, type BridgeResult } from "../src/bridge.ts";
import { WATCH_TRIES } from "../src/bridge-out.ts";
import { peerInboxBlocked } from "../eval/bridge-trial.ts";
import { FakeClock, fakeCore, fakeMemory, fakeRunner } from "./fakes.ts";

const tmp = () => mkdtempSync(join(tmpdir(), "ducter-bridge-0121-test-"));
const S = 1000;
/** The fake's `bm1:` reference for a message (an opaque string to Ducter). */
const ref = (id: string) => `bm1:${Buffer.from(JSON.stringify({ message: id })).toString("base64url")}`;

// nmem 0.10.121's own `bridge inbox --help` (VERIFIED, research/161; the long --api-url line cut).
const HELP_121 = `List incoming identity mail across currently authorized Spaces

Usage: nmem bridge inbox [OPTIONS]

Options:
      --cursor <CURSOR>
  -j, --json                  Emit raw JSON instead of human-readable output
      --wait <WAIT>           Wait up to five seconds for an incoming change, without consuming mail
      --agent-context <NAME>  Reuse a named local agent context for mailbox or collaboration hints.
      --watch                 Observe incoming changes continuously as JSON lines; never acknowledges mail
  -h, --help                  Print help`;
const HELP_120 = `List incoming messages and automatically refresh outgoing read status

Usage: nmem bridge inbox [OPTIONS]

Options:
      --cursor <CURSOR>
  -j, --json
      --agent-context <NAME>`;

type M = { id: string; from: string; to: string; body: string; space?: string; in_reply_to?: string; read_at?: string };
/** The person's home partner `ducter` in Only me, a teammate's reviewer in "dev team", and their own terminal. */
function world(version: string, extra: Record<string, string> = {}) {
  const dir = tmp();
  const bin = join(dir, "nmem");
  writeFileSync(bin, `#!/bin/sh\nexec bun ${resolve(import.meta.dir, "../eval/fake-bridge-nmem.ts")} "$@"\n`);
  chmodSync(bin, 0o755);
  const state = join(dir, "state.json");
  const log = join(dir, "argv.log");
  const ident = (agent: string, space?: string, member = "Weyl") => ({ agent, member, member_id: `m-${member.toLowerCase()}`, description: agent, ...(space ? { space } : {}) });
  const spaces = [
    { id: "personal-m-weyl", label: "Only me", kind: "personal" },
    { id: "ws-team", label: "dev team", kind: "team" },
  ];
  writeFileSync(
    state,
    JSON.stringify({
      seq: 100,
      spaces,
      identities: { ducter: ident("ducter", "personal-m-weyl"), "ducter-in-team": ident("ducter", "ws-team"), terminal: ident("terminal-claude", "personal-m-weyl"), reviewer: ident("reviewer", "ws-team", "Alex") },
      messages: [],
    }),
  );
  const env = (more: Record<string, string> = {}) => ({ PATH: process.env.PATH ?? "", NMEM_FAKE_BRIDGE_STATE: state, NMEM_FAKE_VERSION: version, NMEM_FAKE_ARGV_LOG: log, ...extra, ...more }) as Record<string, string>;
  // The connection as core saved it before 0.10.121: one context per Space (not wide).
  const places = [
    { context: "ducter", spaceId: "personal-m-weyl", spaceLabel: "Only me", kind: "personal" },
    { context: "ducter-in-team", spaceId: "ws-team", spaceLabel: "dev team", kind: "team" },
  ];
  const bridge = (more: Record<string, string> = {}, o: { inboxPages?: number } = {}) => createNmemBridge({ context: "ducter", places, bin, env: env(more), me: "m-weyl", retryDelaysMs: [0, 0], ...o });
  const add = (m: M) => {
    const s = JSON.parse(readFileSync(state, "utf8"));
    s.messages.push({ op: `op-${m.id}`, created_at: new Date().toISOString(), ...m });
    writeFileSync(state, JSON.stringify(s));
  };
  const msgs = () => JSON.parse(readFileSync(state, "utf8")).messages as (M & { read_at?: string })[];
  const calls = () => readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as string[]);
  const inboxReads = () => calls().filter((c) => c.includes("inbox") && !c.includes("--help"));
  return { bin, env, bridge, add, msgs, calls, inboxReads, state };
}

describe("D400: what `bridge inbox --help` says", () => {
  test("0.10.121: the identity inbox, a 5 s wait, --watch; 0.10.120: none of it; an older preview's --all-spaces", () => {
    expect(inboxShapeIn(HELP_121)).toEqual({ identity: true, allSpaces: false, waitMax: 5, watch: true });
    expect(inboxShapeIn(HELP_120)).toEqual({ identity: false, allSpaces: false, waitMax: 0, watch: false });
    expect(inboxShapeIn(`${HELP_120}\n      --all-spaces  Read every Space\n      --wait <SECONDS>  Hold until a message arrives`)).toEqual({ identity: false, allSpaces: true, waitMax: UNSTATED_WAIT_S, watch: false });
    expect(inboxShapeIn("      --wait <WAIT>  [possible values: 1..=8]").waitMax).toBe(8);
    expect(waitBoundIn("error: invalid value '25' for '--wait <WAIT>': 25 is not in 1..=5")).toBe(5);
    expect(waitBoundIn("some other error")).toBeUndefined();
  });

  test("Mem's argv is used only as a bridge command of that verb", () => {
    expect(memArgv(["nmem", "--agent-context=ducter", "bridge", "open", "m-1"], "open")).toEqual(["--agent-context=ducter", "bridge", "open", "m-1"]);
    expect(memArgv(["/usr/local/bin/nmem", "--json", "--agent-context", "ducter", "bridge", "reply"], "reply")).toEqual(["--agent-context", "ducter", "bridge", "reply"]);
    expect(memArgv(["nmem", "bridge", "send", "--to=x"], "open")).toBeUndefined();
    expect(memArgv(["nmem", "rm", "bridge", "open"], "open")).toBeUndefined();
    expect(memArgv(["nmem", "--agent-context=x", "keys", "create"], "open")).toBeUndefined();
    expect(memArgv("nmem bridge open m-1", "open")).toBeUndefined();
    expect(memArgv([1, 2], "open")).toBeUndefined();
    // nmem 0.10.121's live shape (2026-11-19): the reference is already in both.
    expect(namesTarget(["--api-url=x", "--agent-context=c", "bridge", "reply", "bm1:abc"])).toBe(true);
    expect(namesTarget(["--agent-context=c", "bridge", "reply"])).toBe(false);
    expect(namesTarget(["bridge", "reply", "--body-file", "-"])).toBe(false);
  });

  test("the live read's spaces[]: a Space Mem must sort out, by its code", () => {
    // Shape VERIFIED in the read-only read of 2026-11-19 (ids changed).
    const j = { messages: [], spaces: [{ space_id: "all", status: "observed", next_cursor: "", outgoing: [] }, { space_id: "personal-x", status: "unavailable", error_code: "cloud_mailbox_own_source_unreconciled" }], next: null, incomplete: true, outcome_unknown: false };
    expect(stuckSpaceIn(j)).toEqual({ code: "cloud_mailbox_own_source_unreconciled", space: "personal-x" });
    expect(stuckSpaceIn({ spaces: [{ space_id: "all", status: "observed" }] })).toBeUndefined();
    // The trial's preflight stops on it too: the peer's personal Space is where its mail goes.
    expect(peerInboxBlocked({ code: 0, out: JSON.stringify(j), err: "" })).toMatch(/personal-x.*cloud_mailbox_own_source_unreconciled/);
    expect(peerInboxBlocked({ code: 0, out: JSON.stringify({ messages: [], spaces: [{ space_id: "all", status: "observed" }] }), err: "" })).toBeUndefined();
  });
});

describe("D400: the identity inbox (nmem 0.10.121)", () => {
  test("one plain read with the home's context, each message's own Space; Mem's argv opens and replies", async () => {
    const w = world("0.10.121");
    w.add({ id: "m-own", from: "terminal", to: "ducter", body: "我这边写 bridge，Linux 上的 runner 测试你看一下" });
    w.add({ id: "m-team", from: "reviewer", to: "ducter", body: "Is the HawDB bench on main still red?", space: "ws-team" });
    const b = w.bridge();
    const r = await b.check(new Set());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Read once, not once per Space (0.10.121's plain inbox already reads every Space: no duplicates).
    expect(w.inboxReads()).toEqual([["--json", "--agent-context", "ducter", "bridge", "inbox"]]);
    expect(r.messages.map((m) => [m.messageId, m.space, m.spaceLabel, !!m.mine])).toEqual([
      ["m-own", "personal-m-weyl", "Only me", true],
      ["m-team", "ws-team", "dev team", false],
    ]);
    expect(r.messages[1]!.from).toBe("reviewer (dev team)");
    // Opened by Mem's own argv (its `--api-url=`, its `--agent-context=` form, the entry's `bm1:` reference), never a per-Space context.
    const api = "--api-url=https://cloud.example/remote-api";
    const opens = w.calls().filter((c) => c.includes("open"));
    expect(opens).toEqual([
      ["--json", api, "--agent-context=ducter", "bridge", "open", ref("m-own")],
      ["--json", api, "--agent-context=ducter", "bridge", "open", ref("m-team")],
    ]);
    // The reply by Mem's prefix (which already names the reference) lands in the Space the message came from.
    expect(await b.reply("m-team", "Still red; I'll look.", "ws-team")).toMatchObject({ ok: true });
    expect(w.calls().find((c) => c.includes("reply"))).toEqual(["--json", api, "--agent-context=ducter", "bridge", "reply", ref("m-team"), "--body-file", "-"]);
    const sent = w.msgs().find((m) => m.in_reply_to === "m-team")!;
    expect(sent).toMatchObject({ to: "reviewer", body: "Still red; I'll look." });
    expect(sent.space ?? "ws-team").toBe("ws-team");
    expect(w.calls().some((c) => c.includes("ducter-in-team"))).toBe(false);
  });

  test("an entry Mem won't open (expired) is never opened; one Space Mem must sort out is said, the others are read", async () => {
    const w = world("0.10.121", { NMEM_FAKE_EXPIRED: "m-old", NMEM_FAKE_SPACE_STUCK: "personal-m-weyl" });
    w.add({ id: "m-old", from: "reviewer", to: "ducter", body: "expired", space: "ws-team" });
    w.add({ id: "m-team", from: "reviewer", to: "ducter", body: "Is the bench red?", space: "ws-team" });
    w.add({ id: "m-own", from: "terminal", to: "ducter", body: "hidden behind the stuck Space" });
    const r = await w.bridge().check(new Set());
    expect(r).toMatchObject({ ok: true, messages: [{ messageId: "m-team" }], stuckIn: { code: "cloud_mailbox_own_source_unreconciled", space: "personal-m-weyl" } });
    expect(w.calls().filter((c) => c.includes("open")).map((c) => c.at(-1))).toEqual([ref("m-team")]);
  });

  test("the partner says the stuck Space in Settings and keeps reading the rest at its pace", async () => {
    const w = world("0.10.121", { NMEM_FAKE_SPACE_STUCK: "personal-m-weyl" });
    w.add({ id: "m-team", from: "reviewer", to: "ducter", body: "Is the bench red?", space: "ws-team" });
    const clock = new FakeClock();
    const fc = fakeCore(clock, tmp());
    const said: ({ code: string } | undefined)[] = [];
    (fc.core as { settings?: unknown }).settings = { get: () => ({}), setForgetter() {}, setMemState() {}, setBridgeTrouble: (t: { code: string } | undefined) => said.push(t) };
    const fr = fakeRunner((_i, s) => s.end());
    fr.bindCards(fc.cards);
    const partner = createPartner(fc.core, fr.runner, { now: clock.now, persistState: false, settleMs: 0, onError: () => {}, memory: fakeMemory([]).memory, bridge: w.bridge(), bridgeIntervalMs: 0, bridgeRecoverMs: 0, bridgeStartMark: false });
    expect(await partner.checkBridge()).toBe(1);
    await partner.checkBridge();
    expect(said).toEqual([{ code: "cloud_mailbox_own_source_unreconciled" }]);
    await partner.close();
  }, 30_000);

  test("0.10.120 with the same connection: one read per Space, as before", async () => {
    const w = world("0.10.120");
    w.add({ id: "m-team", from: "reviewer", to: "ducter-in-team", body: "Is the bench red?", space: "ws-team" });
    const r = await w.bridge().check(new Set());
    expect(r).toMatchObject({ ok: true, messages: [{ messageId: "m-team", space: "ws-team", spaceLabel: "dev team" }] });
    expect(w.inboxReads().map((c) => c[2])).toEqual(["ducter", "ducter-in-team"]);
    expect(w.calls().some((c) => c.some((a) => a.startsWith("--agent-context=")))).toBe(false);
  });

  test("the plain-text refusal (no JSON) is not_configured", async () => {
    const w = world("0.10.121", { NMEM_FAKE_UNAPPROVED: "ducter" });
    const r = await w.bridge().check(new Set());
    expect(r).toMatchObject({ ok: false, reason: "not_configured" });
  });

  test("a stale identity cursor restarts from page one, once", async () => {
    const w = world("0.10.121", { NMEM_FAKE_INBOX_PAGE: "2", NMEM_FAKE_CURSOR_STALE: "1" });
    for (let i = 0; i < 5; i++) w.add({ id: `m-${i}`, from: "terminal", to: "ducter", body: `note ${i}` });
    const r = await w.bridge().inboxIds!();
    expect(r).toEqual({ ok: true, ids: ["m-0", "m-1", "m-2", "m-3", "m-4"] });
    const reads = w.inboxReads();
    expect(reads[0]).toEqual(["--json", "--agent-context", "ducter", "bridge", "inbox"]);
    expect(reads[2]).toEqual(["--json", "--agent-context", "ducter", "bridge", "inbox"]); // the restart
  });

  test("the wait is clamped to what the CLI takes: never 25 on 0.10.121", async () => {
    const w = world("0.10.121");
    const b = w.bridge();
    expect(await b.canWait!()).toBe(true);
    expect(await b.canWatch!()).toBe(true);
    expect(b.waitContexts!()).toEqual(["ducter"]);
    w.add({ id: "m-1", from: "terminal", to: "ducter", body: "hi" });
    expect(await b.waitInbox!(25)).toEqual({ ok: true, ids: ["m-1"] });
    const waits = w.inboxReads().filter((c) => c.includes("--wait"));
    expect(waits).toEqual([["--json", "--agent-context", "ducter", "bridge", "inbox", "--wait", "5"]]);
  });

  test("0.10.120 without --wait or --watch: no long-poll offered", async () => {
    const b = world("0.10.120").bridge();
    expect(await b.canWait!()).toBe(false);
    expect(await b.canWatch!()).toBe(false);
  });

  test("contacts: the grouped default first (one card per identity, sent in the home's Space)", async () => {
    const w = world("0.10.121");
    const r = await w.bridge().contacts!("reviewer");
    expect(r).toMatchObject({ ok: true, contacts: [{ contact: "ct-reviewer", agent: "reviewer", space: "personal-m-weyl" }] });
    const asked = w.calls().filter((c) => c.includes("contacts"));
    expect(asked).toEqual([["--json", "--agent-context", "ducter", "bridge", "contacts", "--query", "reviewer"]]);
    expect(await w.bridge().send!("ct-reviewer", "Bench is green now.", "personal-m-weyl")).toMatchObject({ ok: true });
    // 0.10.120 keeps --all-spaces first.
    const old = world("0.10.120");
    await old.bridge().contacts!("reviewer");
    expect(old.calls().filter((c) => c.includes("contacts"))[0]).toContain("--all-spaces");
  });

  test("watch: one child, a JSON line per change, killed on stop", async () => {
    const w = world("0.10.121");
    let lines = 0;
    const watch = w.bridge().watchInbox!(() => lines++);
    // A new message every half second until the child (a cold bun start) has seen one.
    for (let n = 0; n < 16 && !lines; n++) {
      w.add({ id: `m-w${n}`, from: "terminal", to: "ducter", body: "ping" });
      for (let i = 0; i < 10 && !lines; i++) await Bun.sleep(50);
    }
    expect(lines).toBeGreaterThanOrEqual(1);
    expect(w.msgs().every((m) => !m.read_at)).toBe(true); // a watch never opens anything
    watch.stop();
    expect(await watch.ended).toEqual({ ok: true });
    // A watch that can't start says why.
    const bad = world("0.10.121", { NMEM_FAKE_WATCH: "exit" }).bridge().watchInbox!(() => {});
    expect(await bad.ended).toMatchObject({ ok: false, reason: "unavailable" });
  });
});

/** Timers on the fake clock (bridge-cadence.test.ts's): advance() fires each due timer in order. */
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

describe("D400: the partner long-polls by --watch", () => {
  function rig() {
    const clock = new FakeClock();
    const t0 = clock.t;
    const timers = fakeTimers(clock);
    const fc = fakeCore(clock, tmp());
    const fr = fakeRunner(async (_i, s) => s.end());
    fr.bindCards(fc.cards);
    const box: BridgeMessage[] = [];
    const checks: number[] = [];
    const children: { line: () => void; end: (r: BridgeResult<{}>) => void; stopped: boolean }[] = [];
    let waits = 0;
    const bridge: BridgeClient = {
      async check(known) {
        checks.push(clock.t);
        return { ok: true, messages: box.filter((m) => !known.has(m.messageId)) };
      },
      async reply() {
        return { ok: true, messageId: "bm-r" };
      },
      canWait: async () => true,
      waitInbox: () => (waits++, new Promise(() => {})),
      canWatch: async () => true,
      watchInbox(onChange) {
        let end!: (r: BridgeResult<{}>) => void;
        const ended = new Promise<BridgeResult<{}>>((res) => (end = res));
        const c = { line: onChange, end, stopped: false };
        children.push(c);
        return {
          stop() {
            c.stopped = true;
            end({ ok: true });
          },
          ended,
        };
      },
    };
    const partner = createPartner(fc.core, fr.runner, { now: clock.now, persistState: false, settleMs: 0, onError: (e: unknown) => console.error(e), memory: fakeMemory([]).memory, bridge, bridgeStartMark: false, bridgeRecoverMs: 0, timers });
    timers.onSettle(async () => {
      for (let i = 0; i < 6; i++) await Bun.sleep(1);
      await partner.idle();
    });
    const at = () => [...new Set(checks.map((t) => (t - t0) / S))];
    return { timers, partner, box, children, at, waits: () => waits, fc };
  }

  test("a line runs the check; the minute timer rests; a child that ends starts again after a backoff; close kills it", async () => {
    const r = rig();
    await r.timers.advance(0);
    expect(r.children.length).toBe(1);
    expect(r.waits()).toBe(0); // --watch, not --wait
    await r.timers.advance(2 * 60 * S);
    expect(r.at()).toEqual([0]);
    r.box.push({ messageId: "bm-1", from: "terminal-claude (Weyl)", agent: "terminal-claude", mine: true, text: "ping" });
    r.children[0]!.line();
    await r.timers.advance(0);
    expect(r.at()).toEqual([0, 120]);
    // The child ends: started again 1 s later, then 2 s, 4 s …
    r.children[0]!.end({ ok: false, reason: "unavailable", message: "gone" });
    await r.timers.advance(0);
    expect(r.children.length).toBe(1);
    await r.timers.advance(1 * S);
    expect(r.children.length).toBe(2);
    r.children[1]!.end({ ok: false, reason: "unavailable", message: "gone" });
    await r.timers.advance(0);
    await r.timers.advance(1 * S);
    expect(r.children.length).toBe(2);
    await r.timers.advance(1 * S);
    expect(r.children.length).toBe(3);
    await r.partner.close();
    expect(r.children[2]!.stopped).toBe(true);
  });

  test(`after ${WATCH_TRIES} quick ends in a row the timer takes arrivals, and tries again 10 min later`, async () => {
    const r = rig();
    await r.timers.advance(0);
    for (let i = 0; i <= WATCH_TRIES; i++) {
      r.children[i]!.end({ ok: false, reason: "unavailable", message: "gone" });
      await r.timers.advance(0);
      await r.timers.advance(2 ** i * S);
    }
    expect(r.children.length).toBe(WATCH_TRIES + 1);
    const before = r.at().length;
    await r.timers.advance(2 * 60 * S + 5 * S);
    expect(r.at().length - before).toBeGreaterThanOrEqual(2); // the minute checks are back
    await r.timers.advance(9 * 60 * S);
    expect(r.children.length).toBe(WATCH_TRIES + 2);
    await r.partner.close();
  });
});
