// D656 (research/243 Brief D): a task's question that is never answered is held and said.
// A task's sent message joins S3's follow-through under the same windows (2 h, the person around,
// never quiet hours, once); its wait is a record over the outgoing op that settles when the answer
// arrives or the task ends; the answer is read by `bridge follow` where nmem lists it (0.10.125),
// with the inbox kept as the path and the fallback. Fakes only: nothing here reaches Mem.
import { describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Bodies, LogEvent, TaskCard } from "../../protocol/src/index.ts";
import { createNmemBridge, createPartner, type BridgeClient, type BridgeMessage } from "../src/index.ts";
import { followCandidates, followGroup, followLine, taskWaits } from "../src/bridge-out.ts";
import { FakeClock, fakeCore, fakeMemory, fakeRunner } from "./fakes.ts";

const tmp = () => mkdtempSync(join(tmpdir(), "ducter-bridge-task-follow-"));
const HOUR = 3_600_000;

const ev = (seq: number, ts: string, body: Bodies["bridge_msg"]): LogEvent<"bridge_msg"> => ({ seq, ts, persona: "p1", stream: "channel", origin: "partner", kind: "bridge_msg", body });
const SENT: Bodies["bridge_msg"] = {
  direction: "out",
  messageId: "bm-o1",
  opId: "bo-1",
  operation: "op-1",
  by: "task",
  taskId: "t1",
  decisionId: "d1",
  contact: "ct-codex",
  to: "Codex",
  agent: "Codex",
  mine: true,
  text: "live.test.ts 在 Linux 上为什么要跳过 open？",
  state: "sent",
};
const sent = (ts = "2026-11-08T14:00:00.000Z", over: Partial<Bodies["bridge_msg"]> = {}, seq = 1) => ev(seq, ts, { ...SENT, ...over });

describe("the wait record is the outgoing op: it settles on the answer or the task's end, never a timer", () => {
  const at = Date.parse("2026-11-08T16:00:00.000Z"); // 2 h after the send
  const later = Date.parse("2026-11-08T16:30:00.000Z"); // every one of them is due
  test("sent and unanswered: one wait; the task's own line names the task and who it waits on", () => {
    const events = [sent()];
    const wait = taskWaits(events, at, () => true);
    expect(wait.map((o) => o.opId)).toEqual(["bo-1"]);
    expect(followCandidates(events, at, () => true).map((o) => o.opId)).toEqual(["bo-1"]);
    const line = followLine([{ op: wait[0]!, task: "Fix the Linux CI" }], at, "zh");
    expect(line).toBe("「Fix the Linux CI」还在等 Codex 回话：2 小时前问的「live.test.ts 在 Linux 上为什么要跳过 open？」，还没回。回了我马上告诉你。");
    expect(followLine([{ op: wait[0]!, task: "Fix the Linux CI" }], at, "en")).toBe(
      '"Fix the Linux CI" is still waiting for Codex to answer what it asked 2 hours ago: "live.test.ts 在 Linux 上为什么要跳过 open？". I\'ll tell you as soon as it does.',
    );
    expect(followLine([{ op: wait[0]!, task: "Fix the Linux CI" }], at, "zh", true)).toContain("它看过了，还没回");
  });
  test("answered: the wait is gone, and no line", () => {
    const events = [sent(), ev(2, "2026-11-08T15:00:00.000Z", { direction: "in", messageId: "bm-a1", inReplyTo: "bm-o1", state: "task", taskId: "t1", from: "Codex", text: "没动过。" })];
    expect(taskWaits(events, at, () => true)).toEqual([]);
    expect(followCandidates(events, at, () => true)).toEqual([]);
  });
  test("the task ended: nothing is held and nothing is said, even before any answer", () => {
    const events = [sent()];
    expect(taskWaits(events, at, () => false)).toEqual([]);
    expect(followCandidates(events, at, () => false)).toEqual([]);
  });
  test("a send that didn't go holds no wait", () => {
    expect(taskWaits([sent("2026-11-08T14:00:00.000Z", { state: "failed" })], at, () => true)).toEqual([]);
    expect(taskWaits([sent("2026-11-08T14:00:00.000Z", { state: "unconfirmed" })], at, () => true)).toEqual([]);
  });
  test("one line per task per agent: two tasks asking the same agent stay apart; one task's two messages are one line", () => {
    const events = [
      sent("2026-11-08T14:00:00.000Z", {}, 1),
      sent("2026-11-08T14:10:00.000Z", { opId: "bo-2", messageId: "bm-o2", taskId: "t2", text: "还有别的吗？" }, 2),
      // The task's later messages go as a reply on the agent's answer: its own handle changes, the
      // agent does not, so the wait is still one (the line covers both questions).
      sent("2026-11-08T14:20:00.000Z", { opId: "bo-3", messageId: "bm-o3", contact: "reply:bm-a1", text: "第二个问题" }, 3),
    ];
    const due = followCandidates(events, later, () => true);
    const g1 = followGroup(due);
    expect(g1.map((o) => o.opId)).toEqual(["bo-1", "bo-3"]); // t1's two messages stay in t1's group
    const rest = due.filter((o) => !g1.includes(o));
    expect(followGroup(rest).map((o) => o.opId)).toEqual(["bo-2"]); // t2 gets its own line
    const line = followLine(g1.map((op) => ({ op, task: "Fix the Linux CI" })), later, "zh");
    expect(line).toContain("「Fix the Linux CI」还在等 Codex 回话");
    expect(line).toContain("「第二个问题」和「live.test.ts 在 Linux 上为什么要跳过 open？」");
  });
  test("too early, or a week old: no line (the wait is still the op's; only the saying has windows)", () => {
    const early = Date.parse("2026-11-08T15:59:00.000Z");
    expect(followCandidates([sent()], early, () => true)).toEqual([]);
    const late = Date.parse("2026-11-16T14:00:00.000Z");
    expect(followCandidates([sent()], late, () => true)).toEqual([]);
  });
});

/** One task resting on its question, with an in-process Bridge whose follow/inbox can be chosen. */
function world(opts: { card?: Partial<TaskCard>; bridge?: Partial<BridgeClient> } = {}) {
  const clock = new FakeClock();
  const fc = fakeCore(clock, tmp());
  const fr = fakeRunner(async (_i, s) => s.end());
  fr.bindCards(fc.cards);
  const card: TaskCard = {
    taskId: "t1",
    persona: "p1",
    title: "Fix the Linux CI",
    project: "",
    place: { kind: "none" },
    harness: "pi",
    attention: "blocked",
    residency: "parked",
    openedAt: "",
    updatedAt: "",
    ...opts.card,
  } as TaskCard;
  fc.cards.set("t1", card);
  fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "让 pi 去修 Linux CI" } });
  const calls: { follow: string[]; check: number } = { follow: [], check: 0 };
  const followMsgs: BridgeMessage[] = [];
  const bridge: BridgeClient = {
    async check() {
      calls.check++;
      return { ok: true, messages: opts.bridge?.check ? [] : [] };
    },
    async follow(operation) {
      calls.follow.push(operation);
      return { ok: true, messages: followMsgs.splice(0), adopted: true };
    },
    async canFollow() {
      return true;
    },
    ...opts.bridge,
  };
  const partner = createPartner(fc.core, fr.runner, {
    now: clock.now,
    persistState: false,
    settleMs: 0,
    onError: (e: unknown) => console.error(e),
    memory: fakeMemory([]).memory,
    bridge,
    bridgeIntervalMs: 0,
    bridgeRecoverMs: 0,
    bridgeStartMark: false,
  });
  // The task's message went out before this test starts (the person had already tapped Go).
  fc.core.log.append({ stream: "channel", origin: "partner", kind: "bridge_msg", body: { ...SENT } });
  const said = () => fc.events.filter((e) => e.kind === "ai_msg" && e.origin === "partner").map((e) => (e.body as Bodies["ai_msg"]).text);
  const followed = () => fc.events.filter((e) => e.kind === "bridge_msg" && (e.body as Bodies["bridge_msg"]).state === "followed").map((e) => e.body as Bodies["bridge_msg"]);
  const active = () => partner.onTrigger(fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "在吗" } }));
  return { clock, fc, fr, partner, card, calls, followMsgs, said, followed, active };
}

const settle = () => new Promise((r) => setTimeout(r, 20));

describe("a task's silence said once, by the same windows as the person's own message", () => {
  test("the card says 在等{who}回话 while it waits; after 2 h, with the person around, one line names the task; never again", async () => {
    const w = world();
    await w.partner.checkBridge();
    expect(w.card.attention).toBe("blocked");
    expect(w.card.reason).toBe("在等 Codex 回话");
    w.clock.advance(HOUR);
    await w.active();
    await w.partner.idle();
    expect(w.said().some((x) => x.includes("还在等"))).toBe(false); // 1 h: too early
    w.clock.advance(1.5 * HOUR);
    await w.partner.checkBridge(); // the person was last here 1.5 h ago: not now
    expect(w.said().some((x) => x.includes("还在等"))).toBe(false);
    await w.active();
    await w.partner.idle();
    expect(w.said().filter((x) => x.includes("还在等"))).toEqual(["「Fix the Linux CI」还在等 Codex 回话：2 小时前问的「live.test.ts 在 Linux 上为什么要跳过 open？」，还没回。回了我马上告诉你。"]);
    expect(w.followed()).toHaveLength(1);
    await w.active();
    await w.partner.idle();
    expect(w.said().filter((x) => x.includes("还在等"))).toHaveLength(1);
    expect(w.card.reason).toBe("在等 Codex 回话"); // still waiting: the card keeps saying it
  });

  test("quiet hours: nothing", async () => {
    const w = world();
    (w.fc.core as any).settings = { get: () => ({ language: "auto", quiet: { start: "00:00", end: "23:59", tz: "UTC" } }), setForgetter() {}, setMemState() {} };
    w.clock.advance(3 * HOUR);
    await w.active();
    await w.partner.idle();
    expect(w.said().some((x) => x.includes("还在等"))).toBe(false);
  });

  test("the answer settles the wait and the card's line; nothing is said afterwards", async () => {
    const w = world();
    await w.partner.checkBridge();
    expect(w.card.reason).toBe("在等 Codex 回话");
    w.fc.core.log.append({ stream: "channel", origin: "peer", kind: "bridge_msg", body: { direction: "in", messageId: "bm-a1", inReplyTo: "bm-o1", state: "task", taskId: "t1", from: "Codex", agent: "Codex", mine: true, text: "没动过，放心改。" } });
    await w.partner.checkBridge();
    await settle();
    expect(w.card.reason).toBeUndefined();
    w.clock.advance(3 * HOUR);
    await w.active();
    await w.partner.idle();
    expect(w.said().some((x) => x.includes("还在等"))).toBe(false);
  });

  test("a restart: a card still saying 在等{who}回话 with no wait left clears it", async () => {
    const w = world();
    w.card.reason = "在等 Codex 回话"; // what the card said before the answer arrived while Ducter was down
    w.fc.core.log.append({ stream: "channel", origin: "peer", kind: "bridge_msg", body: { direction: "in", messageId: "bm-a1", inReplyTo: "bm-o1", state: "task", taskId: "t1", from: "Codex", agent: "Codex", mine: true, text: "没动过。" } });
    await w.partner.checkBridge();
    expect(w.card.reason).toBeUndefined();
  });

  test("the task ended before its answer: nothing is said", async () => {
    const w = world();
    await w.partner.checkBridge();
    w.card.attention = "done";
    await w.partner.checkBridge(); // the wait record sees the task ended and clears its line
    w.clock.advance(3 * HOUR);
    await w.active();
    await w.partner.idle();
    expect(w.said().some((x) => x.includes("还在等"))).toBe(false);
    expect(w.card.reason).toBeUndefined();
  });

  test("two tasks asking the same agent: one line each, each naming its task", async () => {
    const w = world();
    await w.partner.checkBridge(); // the start's own check; nothing due yet
    w.fc.cards.set("t2", { ...w.card, taskId: "t2", title: "Review the bridge PR" } as TaskCard);
    w.fc.core.log.append({ stream: "channel", origin: "partner", kind: "bridge_msg", body: { ...SENT, opId: "bo-2", messageId: "bm-o2", operation: "op-2", taskId: "t2", text: "这个 PR 你能看一眼吗？" } });
    w.clock.advance(2.5 * HOUR);
    await w.active();
    await w.partner.idle();
    const lines = w.said().filter((x) => x.includes("还在等"));
    expect(lines).toHaveLength(1);
    await w.active();
    await w.partner.idle();
    expect(w.said().filter((x) => x.includes("还在等"))).toHaveLength(2);
    expect(new Set(w.said().filter((x) => x.includes("还在等")).map((x) => x.match(/「(.+?)」还在等/)?.[1]))).toEqual(new Set(["Fix the Linux CI", "Review the bridge PR"]));
  });
});

describe("the answer is read by bridge follow only where nmem lists it, and the inbox stays the path", () => {
  test("follow advertised: the waiting task's original is followed, and its answer goes into the task", async () => {
    const w = world();
    const sent0 = w.fr.sent.length;
    w.followMsgs.push({ messageId: "bm-a1", from: "Codex", agent: "Codex", mine: true, inReplyTo: "bm-o1", text: "没动过，放心改。" });
    await w.partner.checkBridge();
    await settle();
    expect(w.calls.follow).toEqual(["op-1"]);
    expect(w.fr.sent.slice(sent0).some((s) => s.taskId === "t1" && /answered your message/.test(s.text))).toBe(true);
    expect(w.fc.events.some((e) => e.kind === "bridge_msg" && (e.body as Bodies["bridge_msg"]).state === "task" && (e.body as Bodies["bridge_msg"]).inReplyTo === "bm-o1")).toBe(true);
  });
  test("follow not advertised: no follow call, and the inbox delivers the answer as before", async () => {
    const answer: BridgeMessage = { messageId: "bm-a1", from: "Codex", agent: "Codex", mine: true, inReplyTo: "bm-o1", text: "没动过，放心改。" };
    let followed = 0;
    const w = world({
      bridge: {
        async canFollow() {
          return false;
        },
        async follow() {
          followed++;
          return { ok: true, messages: [], adopted: true };
        },
        async check() {
          return { ok: true, messages: [answer] };
        },
      },
    });
    const sent0 = w.fr.sent.length;
    await w.partner.checkBridge();
    await settle();
    expect(followed).toBe(0);
    expect(w.fr.sent.slice(sent0).some((s) => s.taskId === "t1" && /answered your message/.test(s.text))).toBe(true);
  });
  test("follow advertised but its shape is not read: nothing is taken from it, and the inbox still delivers", async () => {
    const answer: BridgeMessage = { messageId: "bm-a1", from: "Codex", agent: "Codex", mine: true, inReplyTo: "bm-o1", text: "没动过，放心改。" };
    let followed = 0;
    const w = world({
      bridge: {
        async follow() {
          followed++;
          return { ok: true, messages: [], adopted: false };
        },
        async check() {
          return { ok: true, messages: [answer] };
        },
      },
    });
    const sent0 = w.fr.sent.length;
    await w.partner.checkBridge();
    await settle();
    expect(followed).toBe(1); // it was tried
    expect(w.fr.sent.slice(sent0).some((s) => s.taskId === "t1" && /answered your message/.test(s.text))).toBe(true); // the inbox's
  });
});

describe("the nmem client: bridge follow behind its own help", () => {
  const binFor = (dir: string, body: string) => {
    const bin = join(dir, "nmem");
    writeFileSync(bin, `#!/bin/sh\n${body}\n`);
    chmodSync(bin, 0o755);
    return bin;
  };
  const followJson = (reply = "没动过，放心改。") =>
    JSON.stringify({ operation: "op-1", state: "sent", replies: [{ message: "bm-a1", in_reply_to: "bm-o1", body: reply, sender: { agent: "Codex", member: "Weyl" }, created_at: "2026-11-08T15:00:00Z" }] });

  test("canFollow reads follow --help; follow passes only the documented flags and reads the reply", async () => {
    const dir = tmp();
    const log = join(dir, "argv.log");
    const bin = binFor(
      dir,
      `echo "$*" >> "${log}"
if [ "$1" = "--version" ]; then echo "nmem 0.10.125"; exit 0; fi
case "$*" in
  *" bridge follow --help"*) echo "Follow one original in its exact Space without opening or acknowledging mail"; exit 0 ;;
  *" bridge follow "*) echo '${followJson()}' ;;
esac`,
    );
    const c = createNmemBridge({ context: "ducter-test", bin, env: { NMEM_FAKE_ARGV_LOG: log } });
    expect(await c.canFollow!()).toBe(true);
    const r = await c.follow!("op-1");
    expect(r).toMatchObject({ ok: true, adopted: true, messages: [{ messageId: "bm-a1", inReplyTo: "bm-o1", agent: "Codex", text: "没动过，放心改。" }] });
    const calls = readFileSync(log, "utf8").trim().split("\n");
    const call = calls.find((a) => a.includes("follow") && !a.includes("--help"))!;
    expect(call).toContain("op-1");
    expect(call).toContain("--max-pages");
    expect(call).toContain("--agent-context");
    expect(call).toContain("ducter-test");
    expect(call).not.toContain("--wait"); // one scan: it never holds a check open
  });

  test("a CLI without follow: canFollow false", async () => {
    const dir = tmp();
    const bin = binFor(dir, `if [ "$1" = "--version" ]; then echo "nmem 0.10.121"; exit 0; fi\necho "error: unrecognized subcommand 'follow'" >&2; exit 2`);
    const c = createNmemBridge({ context: "ducter-test", bin, env: {} });
    expect(await c.canFollow!()).toBe(false);
  });

  test("the repo's fake nmem answers follow as the documented flags and shape (INFERRED), and its reply is read", async () => {
    const dir = tmp();
    const state = join(dir, "state.json");
    writeFileSync(
      state,
      JSON.stringify({
        identities: {
          me: { agent: "ducter", member: "Weyl", member_id: "m1", description: "" },
          codex: { agent: "Codex", member: "Weyl", member_id: "m1", description: "" },
        },
        messages: [
          { id: "msg-001", op: "op-1", from: "me", to: "codex", body: "q", created_at: "2026-11-08T14:00:00Z" },
          { id: "msg-002", op: "op-2", from: "codex", to: "me", body: "没动过，放心改。", in_reply_to: "msg-001", created_at: "2026-11-08T15:00:00Z" },
        ],
        seq: 2,
      }),
    );
    const bin = join(dir, "nmem");
    writeFileSync(bin, `#!/bin/sh\nexec bun ${resolve(import.meta.dir, "../eval/fake-bridge-nmem.ts")} "$@"\n`);
    chmodSync(bin, 0o755);
    const c = createNmemBridge({
      context: "me",
      bin,
      env: { ...process.env, NMEM_FAKE_BRIDGE_STATE: state, NMEM_FAKE_FOLLOW: "1", NMEM_FAKE_VERSION: "0.10.125" },
    });
    expect(await c.canFollow!()).toBe(true);
    expect(await c.follow!("op-1")).toMatchObject({ ok: true, adopted: true, messages: [{ messageId: "msg-002", inReplyTo: "msg-001", agent: "Codex", text: "没动过，放心改。" }] });
    // An unseen shape takes nothing: the inbox is the fallback.
    const other = createNmemBridge({ context: "me", bin, env: { ...process.env, NMEM_FAKE_BRIDGE_STATE: state, NMEM_FAKE_FOLLOW: "1", NMEM_FAKE_VERSION: "0.10.125", NMEM_FAKE_FOLLOW_SHAPE: "other" } });
    expect(await other.follow!("op-1")).toMatchObject({ ok: true, adopted: false, messages: [] });
  });

  test("a shape this branch doesn't know is not adopted (and the inbox is then the reader)", async () => {
    const dir = tmp();
    const log = join(dir, "argv.log");
    const bin = binFor(
      dir,
      `echo "$*" >> "${log}"
if [ "$1" = "--version" ]; then echo "nmem 0.10.125"; exit 0; fi
case "$*" in
  *" bridge follow --help"*) echo "Follow one original in its exact Space"; exit 0 ;;
  *" bridge follow "*) echo '{"operation":"op-1","state":"sent","items":[{"message":"bm-a1"}]}' ;;
esac`,
    );
    const c = createNmemBridge({ context: "ducter-test", bin, env: {} });
    expect(await c.follow!("op-1")).toMatchObject({ ok: true, adopted: false, messages: [] });
  });
});
