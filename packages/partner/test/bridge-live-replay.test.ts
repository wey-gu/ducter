// D409: the live trial of 2026-11-20 (nmem 0.10.121, Mem Cloud, research/161 §9), replayed over the
// fake. Everything the terminal sent was "delivered, not yet read", and Ducter never saw it: Mem's
// identity inbox, reading eight Spaces at once, answered in 44 to 52 s, and every read Ducter made was
// killed at its 20 s limit (the raw output holds one `inbox` per check and no `open`, no `setup`). The
// mail itself was there and readable: an entry in the "Before the team" Space (where the peer's card
// resolved the trial), `mine: true`, `state: "pending"`, Mem #10278's sender. The fake answers in that
// exact shape at 0.10.121 and, with NMEM_FAKE_LATENCY, at Mem's pace. Fakes only: nothing reaches Mem.
import { describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createNmemBridge, createPartner, type Bodies } from "../src/index.ts";
import { CALL_TIMEOUT_MS, mergeInboxPages, outgoingReads } from "../src/bridge.ts";
import { FakeClock, fakeCore, fakeMemory, fakeRunner } from "./fakes.ts";

const tmp = () => mkdtempSync(join(tmpdir(), "ducter-bridge-replay-test-"));

/** The trial's world: its identity connected in Only me; the terminal's mail lands in "Before the team". */
function trial(extra: Record<string, string> = {}) {
  const dir = tmp();
  const bin = join(dir, "nmem");
  writeFileSync(bin, `#!/bin/sh\nexec bun ${resolve(import.meta.dir, "../eval/fake-bridge-nmem.ts")} "$@"\n`);
  chmodSync(bin, 0o755);
  const state = join(dir, "state.json");
  const log = join(dir, "argv.log");
  const ident = (agent: string) => ({ agent, member: "Weyl", member_id: "m-weyl", description: "", space: "personal-m-weyl" });
  writeFileSync(
    state,
    JSON.stringify({
      seq: 0,
      spaces: [
        { id: "default", label: "Before the team", kind: "default" },
        { id: "personal-m-weyl", label: "Only me", kind: "personal" },
      ],
      // A native Claude Code session's Agent is named only "Bridge agent" (research/66 §7).
      identities: { "ducter-trial": ident("ducter-trial"), "bridge-peer": ident("Bridge agent") },
      messages: [],
    }),
  );
  const env = { PATH: process.env.PATH ?? "", NMEM_FAKE_BRIDGE_STATE: state, NMEM_FAKE_VERSION: "0.10.121", NMEM_FAKE_ARGV_LOG: log, ...extra } as Record<string, string>;
  const add = (id: string, body: string, o: { from?: string; to?: string; space?: string; in_reply_to?: string } = {}) => {
    const s = JSON.parse(readFileSync(state, "utf8"));
    s.messages.push({ id, op: `op-${id}`, from: o.from ?? "bridge-peer", to: o.to ?? "ducter-trial", body, space: o.space ?? "default", created_at: new Date().toISOString(), ...(o.in_reply_to ? { in_reply_to: o.in_reply_to } : {}) });
    writeFileSync(state, JSON.stringify(s));
  };
  const calls = () => (existsSync(log) ? readFileSync(log, "utf8") : "").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as string[]);
  const bridge = (o: { timeoutMs?: number } = {}) => createNmemBridge({ context: "ducter-trial", bin, env, retryDelaysMs: [0, 0], ...o });
  return { bridge, add, calls, state };
}

const S1 = "Task: fix the Linux CI failure in the ducter repo. packages/runner/test/live.test.ts calls the macOS `open` command.";

describe("D409: the live trial's S1, replayed", () => {
  test("the timeout is longer than Mem's slowest identity inbox read seen live (52 s), with room", () => {
    expect(CALL_TIMEOUT_MS).toBeGreaterThanOrEqual(2 * 52_000);
  });

  test("a read slower than the limit is given up and nothing is opened (what happened live)", async () => {
    const t = trial({ NMEM_FAKE_LATENCY: "inbox:600" });
    t.add("m-s1", S1);
    const r = await t.bridge({ timeoutMs: 150 }).check(new Set());
    expect(r).toMatchObject({ ok: false, reason: "unavailable" });
    expect(t.calls().some((c) => c.includes("open"))).toBe(false);
  });

  test("at Mem's pace within the limit: the request is opened, as the person's own agent's, in the Space it came", async () => {
    const t = trial({ NMEM_FAKE_LATENCY: "inbox:300" });
    t.add("m-s1", S1);
    const r = await t.bridge({ timeoutMs: 5_000 }).check(new Set());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.messages).toHaveLength(1);
    expect(r.messages[0]).toMatchObject({ messageId: "m-s1", mine: true, space: "default", spaceLabel: "Before the team", linked: true });
    expect(r.messages[0]!.text).toContain("live.test.ts");
    // Mem's own argv opened it (the trial's context in its `=` form, the entry's reference).
    expect(t.calls().filter((c) => c.includes("open")).map((c) => c.filter((a) => a.startsWith("--agent-context")))).toEqual([["--agent-context=ducter-trial"]]);
    // 0.10.121's passive setup for a connected context says `enable_needed`; the member is read from it all the same.
    expect(t.calls().some((c) => c.join(" ") === "--json --agent-context ducter-trial bridge setup")).toBe(true);
  });

  test("the partner: the start mark is taken before the mail, the request arrives once, as the person's own", async () => {
    const t = trial();
    const clock = new FakeClock();
    const fc = fakeCore(clock, tmp());
    const fr = fakeRunner((_i, s) => s.end());
    fr.bindCards(fc.cards);
    const partner = createPartner(fc.core, fr.runner, { now: clock.now, persistState: false, settleMs: 0, onError: () => {}, memory: fakeMemory([]).memory, bridge: t.bridge(), bridgeIntervalMs: 0, bridgeRecoverMs: 0 });
    expect(await partner.checkBridge()).toBe(0); // the mark: an empty mailbox
    t.add("m-s1", S1);
    expect(await partner.checkBridge()).toBe(1);
    expect(await partner.checkBridge()).toBe(0);
    const ins = fc.core.log.read({ stream: "channel", kinds: ["bridge_msg"], limit: 100 }).map((e) => e.body as Bodies["bridge_msg"]);
    expect(ins).toHaveLength(1);
    expect(ins[0]).toMatchObject({ direction: "in", messageId: "m-s1", mine: true, space: "default" });
    await partner.close();
  }, 30_000);
});

describe("D409: our sent mail's read status lives under each Space on 0.10.121", () => {
  // The raw answer's shape (ids changed): no top-level `outgoing`; each Space's own.
  const page1 = {
    messages: [{ message: "m-1", mine: true, state: "pending", eligible: true, sequence: 1, space_id: "personal-x" }],
    spaces: [
      { space_id: "default", status: "observed", next_cursor: "", outgoing: [{ message: "out-1", status: "delivered", read_recipients: 0, recipients: 1 }, { message: "out-2", status: "delivered", read_recipients: 1, recipients: 1 }] },
      { space_id: "personal-x", status: "observed", next_cursor: "c2", outgoing: [] },
    ],
    next: "bip1:x",
    incomplete: true,
  };
  const page2 = { messages: [{ message: "m-2", mine: true, state: "pending", eligible: true, sequence: 26, space_id: "personal-x" }], spaces: [{ space_id: "personal-x", status: "observed", next_cursor: "", outgoing: [] }], next: null, incomplete: false };

  test("read from spaces[].outgoing", () => {
    expect(outgoingReads(page1)).toEqual({ "out-1": false, "out-2": true });
    expect(outgoingReads({ messages: [] })).toBeUndefined();
  });

  test("a later page that lists only one Space keeps what page one said of the others", () => {
    const all = mergeInboxPages(page1, page2);
    expect(all.messages.map((m: { message: string }) => m.message)).toEqual(["m-1", "m-2"]);
    expect(all.spaces.map((s: { space_id: string }) => s.space_id)).toEqual(["default", "personal-x"]);
    expect(outgoingReads(all)).toEqual({ "out-1": false, "out-2": true });
  });

  test("the fake answers in it: a reply Ducter sent shows as read once the terminal opens it", async () => {
    const t = trial();
    t.add("m-s1", S1);
    const b = t.bridge();
    const r = await b.check(new Set());
    expect(r.ok && r.messages.length).toBe(1);
    const sent = await b.reply("m-s1", "接了，修好告诉你。", "default");
    expect(sent.ok).toBe(true);
    const id = sent.ok ? sent.messageId! : "";
    const again = await b.check(new Set(["m-s1"]));
    expect(again).toMatchObject({ ok: true, reads: { [id]: false } });
    const s = JSON.parse(readFileSync(t.state, "utf8"));
    s.messages.find((m: { id: string }) => m.id === id).read_at = new Date().toISOString();
    writeFileSync(t.state, JSON.stringify(s));
    expect(await b.check(new Set(["m-s1"]))).toMatchObject({ ok: true, reads: { [id]: true } });
  });
});
