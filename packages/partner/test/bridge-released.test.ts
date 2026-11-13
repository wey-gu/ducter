// D249: Bridge over the shapes nmem 0.10.118 really answers with against Mem Cloud (the 2026-11-13
// live trial, research/66 §7): `open` names no sender and its `reply_to` is the message's own
// handle; in the user's "Only me" place every sender is one of their own agents; an agent that wrote
// is reached again through `reply` on its latest message; a 409 "no registered mailbox" stays
// unknown and is never replaced. Fakes only (a stub binary and fake-bridge-nmem.ts): nothing here
// reaches Mem.
import { describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Bodies } from "../../protocol/src/index.ts";
import { createNmemBridge, createPartner } from "../src/index.ts";
import { outgoingReads } from "../src/bridge.ts";
import { whoForModel, whoForUser } from "../src/bridge-out.ts";
import { FakeClock, fakeCore, fakeMemory, fakeRunner, type Script } from "./fakes.ts";

const tmp = () => mkdtempSync(join(tmpdir(), "ducter-bridge-released-test-"));

function stub(script: string) {
  const dir = tmp();
  const bin = join(dir, "nmem");
  writeFileSync(bin, `#!/bin/sh\n${script}\n`);
  chmodSync(bin, 0o755);
  return bin;
}
const context = (space: string) => `'{"name":"ducter","selection":{"scope":{"space_id":"${space}"},"address":{"custodian_id":"m-1","agent_id":"ducter"}}}'`;

describe("D249: the released CLI's message shapes", () => {
  const script = (space: string) => `case "$*" in
  *"agents context show"*) echo ${context(space)} ;;
  *" bridge inbox"*) echo '{"messages":[{"message":"m-a"},{"message":"m-b"}],"next":"","outgoing":[{"message":"m-o","status":"read","read_recipients":1,"recipients":1}]}' ;;
  *" bridge open m-a"*) echo '{"message":"m-a","body":"Task: fix the Linux runner test","reply_to":"m-a","outgoing":[]}' ;;
  *" bridge open m-b"*) echo '{"message":"m-b","body":"Done at 22:00","reply_to":"m-b","in_reply_to":"m-o","outgoing":[]}' ;;
  *) echo "unexpected $*" >&2; exit 9 ;;
esac`;

  test("no sender in the user's own place: one of theirs; reply_to is the message's own handle, not a parent", async () => {
    const r = await createNmemBridge({ context: "ducter", bin: stub(script("personal-m-1")), env: {} }).check(new Set());
    expect(r).toEqual({
      ok: true,
      messages: [
        { messageId: "m-a", from: "another agent", mine: true, text: "Task: fix the Linux runner test" },
        { messageId: "m-b", from: "another agent", mine: true, text: "Done at 22:00", inReplyTo: "m-o" },
      ],
      reads: { "m-o": true },
    });
  });

  test("anywhere else an unnamed sender stays someone else's (the safe side)", async () => {
    const r = await createNmemBridge({ context: "ducter", bin: stub(script("team-123")), env: {} }).check(new Set(["m-b"]));
    expect(r).toMatchObject({ ok: true, messages: [{ messageId: "m-a", from: "another agent" }] });
    expect((r as { messages: { mine?: boolean }[] }).messages[0]!.mine).toBeUndefined();
  });

  test("read status from the outgoing refresh", () => {
    expect(outgoingReads({ outgoing: [{ message: "a", status: "delivered", read_recipients: 0, recipients: 1 }, { message: "b", status: "read", read_recipients: 1, recipients: 1 }] })).toEqual({ a: false, b: true });
  });

  test("an own agent Mem doesn't name: 你的另一个 AI to the user, told to the model as the user's own", () => {
    expect(whoForUser({ mine: true, from: "another agent" }, true)).toBe("你的另一个 AI");
    expect(whoForUser({ mine: true, label: "" }, false)).toBe("your other AI agent");
    expect(whoForUser({ from: "another agent" }, true)).toBe("another agent");
    expect(whoForModel({ mine: true, from: "another agent" })).toContain("one of the user's own AI agents");
  });
});

/** The real core-less partner over fake-bridge-nmem.ts in its default (0.10.118) shapes. */
function rig(script: Script, extraEnv: Record<string, string> = {}) {
  const dir = tmp();
  const bin = join(dir, "nmem");
  writeFileSync(bin, `#!/bin/sh\nexec bun ${resolve(import.meta.dir, "../eval/fake-bridge-nmem.ts")} "$@"\n`);
  chmodSync(bin, 0o755);
  const state = join(dir, "state.json");
  const ident = (agent: string) => ({ agent, member: "Weyl", member_id: "m-weyl", description: agent });
  writeFileSync(
    state,
    JSON.stringify({
      seq: 1,
      identities: { ducter: ident("Ducter"), terminal: ident("Bridge agent"), coord: ident("Claude 收尾协调") },
      messages: [{ id: "msg-001", op: "op-1", from: "terminal", to: "ducter", body: "Task: fix the Linux failure in the runner tests in ~/dev/ducter.", created_at: new Date().toISOString() }],
    }),
  );
  const env = { PATH: process.env.PATH ?? "", NMEM_FAKE_BRIDGE_STATE: state, ...extraEnv } as Record<string, string>;
  const bridge = createNmemBridge({ context: "ducter", bin, env });
  const clock = new FakeClock();
  const fc = fakeCore(clock, tmp());
  const fr = fakeRunner(script);
  fr.bindCards(fc.cards);
  const partner = createPartner(fc.core, fr.runner, { now: clock.now, persistState: false, settleMs: 0, onError: (e: unknown) => console.error(e), memory: fakeMemory([]).memory, bridge, bridgeIntervalMs: 0, bridgeRecoverMs: 0, bridgeStartMark: false });
  const outs = () => fc.events.filter((e) => e.kind === "bridge_msg" && (e.body as Bodies["bridge_msg"]).direction === "out").map((e) => e.body as Bodies["bridge_msg"]);
  const ins = () => fc.events.filter((e) => e.kind === "bridge_msg" && (e.body as Bodies["bridge_msg"]).direction === "in").map((e) => e.body as Bodies["bridge_msg"]);
  const user = (text: string) => partner.onTrigger(fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text } }));
  const tap = (decisionId: string) => partner.onTrigger(fc.core.log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId, option: "go", by: "user" } }));
  const card = () => [...fc.events].reverse().find((e) => e.kind === "decision")!.body as Bodies["decision"];
  const mailbox = () => JSON.parse(readFileSync(state, "utf8")).messages as { id: string; from: string; to: string; body: string; in_reply_to?: string }[];
  const peerWrites = (body: string, inReplyTo?: string) => {
    const s = JSON.parse(readFileSync(state, "utf8"));
    s.messages.push({ id: `msg-${String(++s.seq).padStart(3, "0")}`, op: `op-${s.seq}`, from: "terminal", to: "ducter", body, ...(inReplyTo ? { in_reply_to: inReplyTo } : {}), created_at: new Date().toISOString() });
    writeFileSync(state, JSON.stringify(s));
  };
  return { fc, partner, outs, ins, user, tap, card, mailbox, peerWrites };
}

describe("D249: reaching the agent that wrote, over the released shapes", () => {
  test("S2: the one that wrote comes first, the message goes by reply to exactly it, and its answer links back", async () => {
    const got: any[] = [];
    const t = rig(async (_i, s, n) => {
      if (n === 1) {
        got.push(await t.fc.callTool("bridge_contacts", { query: "Claude" }));
        got.push(await t.fc.callTool("bridge_send", { contact: got[0].wroteLately[0].contact, text: "bridge 那块写到哪了？今晚能提 PR 吗？" }));
      }
      s.end();
    });
    await t.partner.checkBridge(); // S1's request: one of the user's own
    await t.partner.idle();
    expect(t.ins()[0]).toMatchObject({ messageId: "msg-001", mine: true });
    t.user("问一下我终端里那个 Claude，bridge 那块写到哪了");
    await t.partner.idle();
    // Who wrote lately leads, described by what it wrote; Mem's named card is still there, apart.
    expect(got[0].wroteLately[0]).toMatchObject({ contact: "reply:msg-001" });
    expect(got[0].wroteLately[0].who).toContain("Task: fix the Linux failure");
    expect(got[0].contacts.map((c: { who: string }) => c.who)).toContain("Claude 收尾协调 (the user's own agent: call it 你的 Claude 收尾协调 / your Claude 收尾协调, never by the user's name)");
    expect(t.card().question.split("\n")[0]).toBe("发给你的另一个 AI？");
    expect(t.card().question).toContain("（就是发来「Task: fix the Linux failure in the runne…」的那个）");
    t.tap(t.card().decisionId);
    await t.partner.idle();
    for (let i = 0; i < 100 && t.outs().at(-1)?.state !== "sent"; i++) await Bun.sleep(30);
    const out = t.outs().at(-1)!;
    expect(out).toMatchObject({ state: "sent", contact: "reply:msg-001", messageId: "msg-002" });
    expect(out.inReplyTo).toBeUndefined(); // the user's own question, not an answer
    // It reached the agent that wrote, and nobody else.
    expect(t.mailbox().filter((m) => m.from === "ducter")).toEqual([expect.objectContaining({ id: "msg-002", to: "terminal", in_reply_to: "msg-001" })]);
    t.peerWrites("4 of 5 tests pass; PR around 22:00.", "msg-002");
    await t.partner.checkBridge();
    expect(t.ins().at(-1)).toMatchObject({ messageId: "msg-003", inReplyTo: "msg-002", mine: true });
    await t.partner.close();
  }, 30_000);

  test("a card whose agent has no registered mailbox: unknown, recovered, never replaced", async () => {
    const got: any[] = [];
    const t = rig(
      async (_i, s, n) => {
        if (n === 0) {
          got.push(await t.fc.callTool("bridge_contacts", { query: "收尾协调" }));
          got.push(await t.fc.callTool("bridge_send", { contact: "ct-coord", text: "CI 那个红是不是 flaky？" }));
        }
        if (n >= 1 && !got[2] && t.fc.events.some((e) => e.kind === "user_msg" && (e.body as Bodies["user_msg"]).text.includes("再发"))) got.push(await t.fc.callTool("bridge_send", { contact: "ct-coord", text: "再问一次：CI 那个红是不是 flaky？" }));
        s.end();
      },
      { NMEM_FAKE_UNREGISTERED: "coord" },
    );
    t.user("问问收尾协调 CI 那个红是不是 flaky");
    await t.partner.idle();
    t.tap(t.card().decisionId);
    await t.partner.idle();
    for (let i = 0; i < 100 && t.outs().at(-1)?.state === "sending"; i++) await Bun.sleep(30);
    expect(t.outs().map((b) => b.state)).toEqual(["pending", "sending", "unknown"]);
    expect(t.outs().at(-1)!.operation).toMatch(/^op-x/);
    t.user("没送到就再发一次");
    await t.partner.idle();
    expect(got[2]).toMatchObject({ ok: false });
    expect(String(got[2].error)).toContain("never sends a replacement");
    // Recovery inspects and resumes the same original; nothing new is sent.
    await t.partner.checkBridge();
    expect(t.mailbox().filter((m) => m.from === "ducter")).toEqual([]);
    expect(t.outs().filter((b) => b.state === "sending").length).toBe(1);
    await t.partner.close();
  }, 30_000);
});
