// D294: Bridge over Mem PR #10278's read representation (deployed on Mem Cloud 2026-11-17; in the
// CLI after 0.10.119): `sender` and `in_reply_to` on inbox/open, `mailbox_available` on contact
// cards; and Mem's "can't right now" answers, retried briefly, never as a second copy. Fakes only
// (fake-bridge-nmem.ts with NMEM_FAKE_SHAPE=presentation and NMEM_FAKE_BUSY): nothing reaches Mem.
import { describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Bodies } from "../../protocol/src/index.ts";
import { createNmemBridge, createPartner } from "../src/index.ts";
import { mailboxError, transient } from "../src/bridge.ts";
import { followCandidates, lostLine, type OutOp } from "../src/bridge-out.ts";
import type { LogEvent } from "../../protocol/src/index.ts";
import { FakeClock, fakeCore, fakeMemory, fakeRunner, type Script } from "./fakes.ts";

const tmp = () => mkdtempSync(join(tmpdir(), "ducter-bridge-presentation-test-"));

type M = { id: string; from: string; to: string; body: string; in_reply_to?: string };
function world(opts: { space?: string; messages?: M[] } = {}) {
  const dir = tmp();
  const bin = join(dir, "nmem");
  writeFileSync(bin, `#!/bin/sh\nexec bun ${resolve(import.meta.dir, "../eval/fake-bridge-nmem.ts")} "$@"\n`);
  chmodSync(bin, 0o755);
  const state = join(dir, "state.json");
  const ident = (agent: string, member_id = "m-weyl") => ({ agent, member: "Weyl", member_id, description: agent });
  const at = new Date().toISOString();
  writeFileSync(
    state,
    JSON.stringify({
      seq: 10,
      identities: { ducter: ident("ducter"), terminal: ident("Bridge agent"), coord: ident("Claude 收尾协调"), alex: ident("reviewer", "m-alex") },
      messages: (opts.messages ?? []).map((m, i) => ({ op: `op-${i}`, created_at: at, ...m })),
      ...(opts.space ? { connections: [{ connection_id: "c1", agent_id: "ducter", identity_birth: "b1", client_label: "ducter", state: "active", space_id: opts.space }] } : {}),
    }),
  );
  const env = (extra: Record<string, string> = {}) => ({ PATH: process.env.PATH ?? "", NMEM_FAKE_BRIDGE_STATE: state, NMEM_FAKE_SHAPE: "presentation", ...extra }) as Record<string, string>;
  const bridge = (extra: Record<string, string> = {}) => createNmemBridge({ context: "ducter", bin, env: env(extra), retryDelaysMs: [0, 0] });
  const mailbox = () => JSON.parse(readFileSync(state, "utf8")).messages as M[];
  return { bin, state, env, bridge, mailbox };
}

describe("D294: Mem's error answers", () => {
  test("flat and under upstream; transient is 503, 429, _busy/_unavailable/_capacity or retryable", () => {
    expect(mailboxError('{"error_code":"cloud_bridge_setup_unavailable","http_status":503,"retryable":false,"outcome_unknown":true}')).toEqual({ code: "cloud_bridge_setup_unavailable", http: 503, retryable: false, unknown: true });
    const up = mailboxError('noise\n{"stage":"upstream","upstream":{"error_code":"cloud_agent_original_selection_unavailable","retryable":false,"outcome_unknown":true,"http_status":409},"operation":"bo1:x"}');
    expect(up).toEqual({ code: "cloud_agent_original_selection_unavailable", http: 409, retryable: false, unknown: true });
    expect(transient({ http: 503 })).toBe(true);
    expect(transient({ code: "cloud_agent_original_authority_busy" })).toBe(true);
    expect(transient({ code: "cloud_bridge_setup_role_control_denied", http: 403 })).toBe(false);
    expect(mailboxError("plain words")).toEqual({});
  });
});

describe("D294: sender and in_reply_to (Mem #10278)", () => {
  const msgs: M[] = [
    { id: "msg-001", from: "terminal", to: "ducter", body: "Task: fix the Linux runner test." },
    { id: "msg-002", from: "coord", to: "ducter", body: "4 of 5 pass; PR around 22:00.", in_reply_to: "msg-000" },
  ];

  test("in the user's own place: every sender is theirs, even when Mem names the member by a display name", async () => {
    const w = world({ messages: msgs });
    const r = await w.bridge({ NMEM_FAKE_SENDER_MEMBER: "Wey Gu" }).check(new Set());
    expect(r.ok).toBe(true);
    const [a, b] = (r as { messages: Record<string, unknown>[] }).messages;
    // A native session's Agent is only "Bridge agent": unnamed, so the user reads 一个没留名字的 agent.
    expect(a).toMatchObject({ messageId: "msg-001", mine: true });
    expect(a!.agent).toBeUndefined();
    expect(a!.inReplyTo).toBeUndefined(); // in_reply_to: null on an original
    // A named agent keeps its name; the reply links to the message it answers.
    expect(b).toMatchObject({ messageId: "msg-002", agent: "Claude 收尾协调", mine: true, inReplyTo: "msg-000" });
  }, 20_000);

  test("in a shared place: the user's own by member id, a teammate's stays a teammate's", async () => {
    const w = world({ space: "team-x", messages: [msgs[1]!, { id: "msg-003", from: "alex", to: "ducter", body: "Can you review #42?" }] });
    const r = (await w.bridge().check(new Set())) as { messages: Record<string, unknown>[] };
    expect(r.messages[0]).toMatchObject({ agent: "Claude 收尾协调", mine: true });
    expect(r.messages[1]).toMatchObject({ agent: "reviewer" });
    expect(r.messages[1]!.mine).toBeUndefined();
  }, 20_000);

  test("a card whose agent has no registered mailbox is never offered", async () => {
    const w = world();
    const r = (await w.bridge({ NMEM_FAKE_UNREGISTERED: "coord" }).contacts!("Claude")) as { ok: true; contacts: { contact: string }[] };
    expect(r.ok).toBe(true);
    expect(r.contacts.map((c) => c.contact)).not.toContain("ct-coord");
    const all = (await w.bridge().contacts!("Claude")) as { ok: true; contacts: { contact: string }[] };
    expect(all.contacts.map((c) => c.contact)).toContain("ct-coord");
  }, 20_000);
});

describe("D294: an inbound message from the user's own terminal agent wakes the partner", () => {
  // The partner eval runs the fake in "named"; a D294 edit once made its `open` print two JSON
  // documents there, so every inbound message was silently dropped and the partner never woke.
  for (const shape of ["named", "presentation", "released"]) {
    test(`shape ${shape}: one check, one partner turn carrying the message`, async () => {
      const w = world({ messages: [{ id: "msg-001", from: "terminal", to: "ducter", body: "Should I push fix-linux-ci now, or wait for macOS?" }] });
      const clock = new FakeClock();
      const fc = fakeCore(clock, tmp());
      const inputs: string[] = [];
      const fr = fakeRunner((input, s) => {
        inputs.push(input);
        s.end();
      });
      fr.bindCards(fc.cards);
      const env = shape === "released" ? { ...w.env(), NMEM_FAKE_SHAPE: "" } : w.env({ NMEM_FAKE_SHAPE: shape });
      const bridge = createNmemBridge({ context: "ducter", bin: w.bin, env, retryDelaysMs: [0, 0] });
      const partner = createPartner(fc.core, fr.runner, { now: clock.now, persistState: false, settleMs: 0, onError: (e: unknown) => console.error(e), memory: fakeMemory([]).memory, bridge, bridgeIntervalMs: 0, bridgeStartMark: false });
      expect(await partner.checkBridge()).toBe(1);
      await partner.idle();
      const inbound = fc.events.filter((e) => e.kind === "bridge_msg" && (e.body as Bodies["bridge_msg"]).direction === "in");
      expect(inbound).toHaveLength(1);
      expect(inbound[0]!.body).toMatchObject({ messageId: "msg-001", mine: true });
      expect(inputs.some((t) => t.includes("Should I push fix-linux-ci now"))).toBe(true);
      await partner.close();
    }, 30_000);
  }
});

describe("D294: Mem can't take it right now", () => {
  test("a read is tried again briefly and then succeeds", async () => {
    const w = world({ messages: [{ id: "msg-001", from: "coord", to: "ducter", body: "hello" }] });
    const r = await w.bridge({ NMEM_FAKE_BUSY: "inbox:2" }).check(new Set());
    expect(r).toMatchObject({ ok: true, messages: [{ messageId: "msg-001" }] });
  }, 20_000);

  test("a send Mem did not admit is tried again, and goes out exactly once", async () => {
    const w = world();
    const r = await w.bridge({ NMEM_FAKE_BUSY: "send:1" }).send!("ct-coord", "CI 那个红是 flaky 吗？");
    expect(r).toMatchObject({ ok: true, messageId: "msg-011" });
    expect(w.mailbox().filter((m) => m.from === "ducter")).toHaveLength(1);
  }, 20_000);

  test("still busy after the retries: busy, nothing went out", async () => {
    const w = world();
    const r = await w.bridge({ NMEM_FAKE_BUSY: "send:9" }).send!("ct-coord", "hi");
    expect(r).toMatchObject({ ok: false, reason: "busy" });
    expect(w.mailbox()).toHaveLength(0);
  }, 20_000);

  test("Mem unsure whether it went out: never retried, the outcome stays unknown (D106)", async () => {
    const w = world();
    const r = await w.bridge({ NMEM_FAKE_BUSY: "reply:1:unknown" }).reply("msg-001", "ok");
    expect(r).toMatchObject({ ok: false, reason: "unavailable" });
    expect(JSON.parse(readFileSync(w.state, "utf8")).busy).toEqual({ reply: 1 }); // one call, no retry
  }, 20_000);

  test("the user hears it in the partner's words: nothing went out, not their fault, ask again", () => {
    const op = { last: { direction: "out", messageId: "", text: "x", agent: "Claude Code", mine: true, to: "Claude Code" } } as unknown as OutOp;
    expect(lostLine(op, "zh", "busy", "message")).toBe("你让我发的消息没发给 Claude Code：Nowledge Mem 那边这会儿收不了，不是你这边的问题。这次什么都没发出去，过一会儿再跟我说一声，我重新发。");
    expect(lostLine(op, "en", "busy", "message")).toContain("Nothing went out");
    expect(lostLine(op, "en", "busy", "message")).not.toMatch(/Bridge|mailbox|503/);
  });

  test("a tapped send that Mem can't take: failed once, said once, and the user may simply ask again", async () => {
    const w = world();
    const got: any[] = [];
    const clock = new FakeClock();
    const fc = fakeCore(clock, tmp());
    const script: Script = async (_i, s, n) => {
      if (n === 0) {
        got.push(await fc.callTool("bridge_contacts", { query: "收尾协调" }));
        got.push(await fc.callTool("bridge_send", { contact: "ct-coord", text: "CI 那个红是不是 flaky？" }));
      }
      s.end();
    };
    const fr = fakeRunner(script);
    fr.bindCards(fc.cards);
    const partner = createPartner(fc.core, fr.runner, { now: clock.now, persistState: false, settleMs: 0, onError: (e: unknown) => console.error(e), memory: fakeMemory([]).memory, bridge: w.bridge({ NMEM_FAKE_BUSY: "send:9" }), bridgeIntervalMs: 0, bridgeRecoverMs: 0, bridgeStartMark: false });
    partner.onTrigger(fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "问问收尾协调 CI 那个红是不是 flaky" } }));
    await partner.idle();
    const card = [...fc.events].reverse().find((e) => e.kind === "decision")!.body as Bodies["decision"];
    partner.onTrigger(fc.core.log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: card.decisionId, option: "go", by: "user" } }));
    const outs = () => fc.events.filter((e) => e.kind === "bridge_msg" && (e.body as Bodies["bridge_msg"]).direction === "out").map((e) => (e.body as Bodies["bridge_msg"]).state);
    for (let i = 0; i < 200 && outs().at(-1) === "sending"; i++) await Bun.sleep(30);
    await partner.idle();
    expect(outs()).toEqual(["pending", "sending", "failed"]);
    const said = fc.events.filter((e) => e.kind === "ai_msg").map((e) => (e.body as Bodies["ai_msg"]).text);
    expect(said.filter((t) => t.includes("Nowledge Mem 那边这会儿收不了"))).toHaveLength(1);
    expect(w.mailbox()).toHaveLength(0);
    await partner.close();
  }, 30_000);
});

describe("D364: nmem 0.10.120 asks for the linked shape; an unlinked original answers nothing", () => {
  test("the fake at 0.10.120 answers in Mem's representation by itself; every message says whether it is linked", async () => {
    const w = world({ messages: [{ id: "msg-001", from: "terminal", to: "ducter", body: "Task: fix the Linux runner test." }] });
    const r = (await w.bridge({ NMEM_FAKE_SHAPE: "", NMEM_FAKE_VERSION: "0.10.120" }).check(new Set())) as { messages: Record<string, unknown>[] };
    expect(r.messages[0]).toMatchObject({ messageId: "msg-001", mine: true, linked: true });
    expect(r.messages[0]!.inReplyTo).toBeUndefined();
    // 0.10.119's bare shape carries no in_reply_to on an original: not linked.
    const old = world({ messages: [{ id: "msg-001", from: "terminal", to: "ducter", body: "Task: fix the Linux runner test." }] });
    const o = (await old.bridge({ NMEM_FAKE_SHAPE: "", NMEM_FAKE_VERSION: "0.10.119" }).check(new Set())) as { messages: Record<string, unknown>[] };
    expect(o.messages[0]!.linked).toBeUndefined();
  }, 20_000);

  test("follow-through: an unnamed own agent's new message stops the nudge only when Mem can't link replies", () => {
    const t0 = Date.parse("2026-11-18T08:00:00Z");
    const at = (min: number) => new Date(t0 + min * 60_000).toISOString();
    const ev = (seq: number, ts: string, body: Record<string, unknown>) => ({ seq, ts, stream: "channel", origin: "partner", kind: "bridge_msg", body }) as unknown as LogEvent;
    const sent = ev(1, at(0), { direction: "out", opId: "bo-1", messageId: "bm-o1", to: "another agent", mine: true, text: "那个 PR 今晚能提吗？", decisionId: "d-1", state: "sent" });
    const other = (linked: boolean) => ev(2, at(10), { direction: "in", messageId: "bm-x", from: "another agent", mine: true, text: "Task: tidy the README.", ...(linked ? { linked: true } : {}) });
    const now = t0 + 3 * 3_600_000;
    // nmem 0.10.119: it may be the answer (Mem links nothing), so Ducter stays quiet (D249).
    expect(followCandidates([sent, other(false)], now)).toEqual([]);
    // nmem 0.10.120: Mem says it answers nothing, so the question is still open: one nudge is due.
    expect(followCandidates([sent, other(true)], now).map((o) => o.opId)).toEqual(["bo-1"]);
    // And a linked answer still closes it.
    const answer = ev(3, at(20), { direction: "in", messageId: "bm-a", from: "another agent", mine: true, text: "能，22 点。", inReplyTo: "bm-o1", linked: true });
    expect(followCandidates([sent, other(true), answer], now)).toEqual([]);
  });
});
