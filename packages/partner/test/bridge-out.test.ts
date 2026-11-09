// Bridge beyond receive (design/bridge.md S1, S2, S3; D105–D111): the result of a task opened for
// another agent is owed back to it by code; the partner can message an agent the user named, but
// only through a card the user taps; outgoing messages are logged before they go, so a restart
// or a lost answer never loses or repeats one; an unanswered message gets one follow-through
// line. Fakes only: nothing here reaches Mem.
import { describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Bodies, LogEvent } from "../../protocol/src/index.ts";
import { contactsOf, createNmemBridge, createPartner, opOf, type BridgeClient, type BridgeContact, type BridgeMessage, type BridgeOp } from "../src/index.ts";
import { claimText, followLine, foldOut, inQuiet, overAsks, whoForUser } from "../src/bridge-out.ts";
import { FakeClock, fakeCore, fakeMemory, fakeRunner, type Script } from "./fakes.ts";

const tmp = () => mkdtempSync(join(tmpdir(), "ducter-bridge-out-test-"));
const HOUR = 3_600_000;

const REQUEST: BridgeMessage = {
  messageId: "bm-1",
  from: "terminal-claude (Weyl)",
  agent: "terminal-claude",
  mine: true,
  text: "帮我把 Linux 上的 runner 测试修好：packages/runner/test/live.test.ts 假设有 macOS 的 open。只动 runner 测试。ubuntu CI 绿了算完。",
};
const EN_REQUEST: BridgeMessage = { ...REQUEST, text: "Goal: make `bun test` pass on Linux in ~/dev/ducter. live.test.ts assumes macOS `open`. Scope: runner tests only. Done when ubuntu CI is green." };
const TEAMMATE: BridgeMessage = { messageId: "bm-t", from: "reviewer (Alex)", agent: "reviewer", text: "Could Ducter rerun the HawDB bench on main? Done when the numbers are in bench/README.md." };
const CODEX: BridgeContact = { contact: "ct-codex", label: "codex-mem (Weyl)", agent: "codex-mem", mine: true, description: "Weyl's Codex in ~/dev/nowledge-mem" };
const ALEX: BridgeContact = { contact: "ct-alex", label: "reviewer (Alex)", agent: "reviewer", description: "Alex's reviewer" };

/** An in-process Bridge with an outbox: `ctl.lose` makes the next send/reply's answer go missing. */
function world(inbox: BridgeMessage[] = [REQUEST]) {
  const replies: { messageId: string; text: string }[] = [];
  const sends: { contact: string; text: string }[] = [];
  const ops: (BridgeOp & { kind: "send" | "reply" })[] = [];
  const box = [...inbox];
  const ctl = { lose: undefined as undefined | "delivered" | "pending" | "nowhere", refuse: false, reads: {} as Record<string, boolean>, resumes: 0 };
  const op = (kind: "send" | "reply", body: string, inReplyTo?: string) => {
    const n = ops.length + 1;
    const lost = ctl.lose;
    ctl.lose = undefined;
    if (lost === "nowhere") return { lost };
    const o = { kind, operation: `op-${n}`, state: lost === "pending" ? ("pending" as const) : ("sent" as const), messageId: `bm-o${n}`, body, ...(inReplyTo ? { inReplyTo } : {}) };
    ops.push(o);
    return { lost, o };
  };
  const bridge: BridgeClient = {
    async check(known) {
      return { ok: true, messages: box.filter((m) => !known.has(m.messageId)), reads: ctl.reads };
    },
    async reply(messageId, text) {
      if (ctl.refuse) return { ok: false, reason: "refused", message: "no" };
      const { lost, o } = op("reply", text, messageId);
      if (lost !== "pending" && lost !== "nowhere") replies.push({ messageId, text });
      if (lost) return { ok: false, reason: "unavailable", message: "connection reset" };
      return { ok: true, messageId: o!.messageId, operation: o!.operation };
    },
    async contacts(query) {
      return { ok: true, contacts: /codex/i.test(query) ? [CODEX] : /alex/i.test(query) ? [ALEX] : [], more: false };
    },
    async send(contact, text) {
      const { lost, o } = op("send", text);
      if (lost !== "pending" && lost !== "nowhere") sends.push({ contact, text });
      if (lost) return { ok: false, reason: "unavailable", message: "connection reset" };
      return { ok: true, messageId: o!.messageId, operation: o!.operation };
    },
    async outbox() {
      return { ok: true, ops: ops.map(({ kind: _k, body: _b, ...rest }) => rest) }; // no bodies: inspect has them
    },
    async inspect(operation) {
      const o = ops.find((x) => x.operation === operation);
      return o ? { ok: true, op: o } : { ok: false, reason: "unavailable", message: "not found" };
    },
    async resume(operation) {
      const o = ops.find((x) => x.operation === operation);
      if (!o) return { ok: false, reason: "unavailable", message: "not found" };
      ctl.resumes++;
      if (o.state === "pending") {
        o.state = "sent";
        if (o.kind === "send") sends.push({ contact: "ct-codex", text: o.body! });
        else replies.push({ messageId: o.inReplyTo!, text: o.body! });
      }
      return { ok: true, messageId: o.messageId };
    },
  };
  return { bridge, replies, sends, ops, ctl, deliver: (m: BridgeMessage) => box.push(m) };
}

const partnerOpts = (clock: FakeClock, bridge: BridgeClient) => ({ now: clock.now, persistState: false, settleMs: 0, onError: (e: unknown) => console.error(e), memory: fakeMemory([]).memory, bridge, bridgeIntervalMs: 0, bridgeRecoverMs: 0 });

function setup(script: Script, w = world(), opts: { clock?: FakeClock } = {}) {
  const clock = opts.clock ?? new FakeClock();
  const fc = fakeCore(clock, tmp());
  const fr = fakeRunner(script);
  fr.bindCards(fc.cards);
  const partner = createPartner(fc.core, fr.runner, partnerOpts(clock, w.bridge));
  const outs = () => fc.events.filter((e) => e.kind === "bridge_msg" && (e.body as Bodies["bridge_msg"]).direction === "out").map((e) => e.body as Bodies["bridge_msg"]);
  const sent = () => outs().filter((b) => b.state === "sent");
  const said = () => fc.events.filter((e) => e.kind === "ai_msg" && e.origin === "partner").map((e) => (e.body as Bodies["ai_msg"]).text);
  const user = (text: string) => partner.onTrigger(fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text } }));
  const tap = (decisionId: string, option: "go" | "hold" = "go") => partner.onTrigger(fc.core.log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId, option, by: "user" } }));
  const report = (taskId: string, state: "done" | "failed" = "done", summary = "fixed") =>
    partner.onTrigger(fc.core.log.append({ stream: `task:${taskId}`, origin: "task", kind: "report", body: { taskId, state, summary, evidence: [], questions: [] } }));
  const card = () => [...fc.events].reverse().find((e) => e.kind === "decision")!.body as Bodies["decision"];
  return { fc, fr, partner, w, outs, sent, said, user, tap, report, card, clock };
}

describe("S1: the result goes back to the agent that asked (J-Q7, D107)", () => {
  test("task_open forMessage sends the claim; the done report makes the reply owed; replying clears it", async () => {
    const inputs: string[] = [];
    const r: any[] = [];
    const { partner, fc, fr, w, sent, tap, report } = setup(async (input, s, n) => {
      inputs.push(input);
      if (n === 0) r.push(await fc.callTool("ask", { question: "你的 terminal-claude 请我修 Linux 上的 runner 测试。开个任务吗？", goLabel: "开任务" }));
      if (n === 1) r.push(await fc.callTool("task_open", { title: "Linux 上修 runner 测试", brief: "从 bm-1 来的请求：只动 runner 测试，ubuntu CI 绿了算完。", forMessage: "bm-1" }));
      if (n === 2) r.push(await fc.callTool("bridge_reply", { messageId: "bm-1", text: "修好了：live.test.ts 在 Linux 上跳过 open，ubuntu CI 绿了。" }));
      s.end();
    });
    await partner.checkBridge();
    await partner.idle();
    // The request is framed as the user's own agent, with how to call it (D108).
    expect(inputs[0]).toContain("terminal-claude (the user's own agent: call it 你的 terminal-claude / your terminal-claude, never by the user's name)");
    tap(r[0].decisionId);
    await partner.idle();
    expect(r[1].ok).toBe(true);
    // The claim went out by code, in the requester's language, the title quoted, linked to the task.
    expect(w.replies[0]).toEqual({ messageId: "bm-1", text: "接了：「Linux 上修 runner 测试」。做完把结果回你。" });
    expect(fr.opened.length).toBe(1);
    expect(sent()[0]).toMatchObject({ inReplyTo: "bm-1", taskId: "t1", mine: true, agent: "terminal-claude" });
    report("t1", "done", "live.test.ts skips `open` on Linux; ubuntu CI green.");
    await partner.idle();
    expect(inputs[2]).toContain("[reply owed]");
    expect(inputs[2]).toContain("messageId bm-1");
    expect(inputs[2]).toContain("Don't mention the reply to the user");
    expect(r[2].ok).toBe(true);
    expect(sent()[1]).toMatchObject({ inReplyTo: "bm-1", taskId: "t1" });
    report("t1", "done", "also tidied a comment");
    await partner.idle();
    expect(inputs[3]).not.toContain("[reply owed]");
    expect(partner.stats.bridgeOwedByCode ?? 0).toBe(0);
  }, 20_000);

  test("the user's own agent: without bridge_reply, the outcome goes back as what the partner told the user", async () => {
    const r: any[] = [];
    const { partner, fc, fr, w, sent, tap, report } = setup(async (_i, s, n) => {
      if (n === 0) r.push(await fc.callTool("ask", { question: "你的 terminal-claude 请我修 Linux 上的 runner 测试。开个任务吗？", goLabel: "开任务" }));
      if (n === 1) r.push(await fc.callTool("task_open", { title: "Linux 上修 runner 测试", brief: "只动 runner 测试" }));
      if (n === 2) s.say("runner 测试修好了：非 macOS 上跳过那条 open 断言，ubuntu CI 绿了。");
      s.end();
    });
    await partner.checkBridge();
    await partner.idle();
    tap(r[0].decisionId);
    await partner.idle();
    expect(fr.opened.length).toBe(1);
    expect(w.replies.length).toBe(1); // the claim
    report("t1");
    await partner.idle();
    expect(w.replies[1]).toEqual({ messageId: "bm-1", text: "runner 测试修好了：非 macOS 上跳过那条 open 断言，ubuntu CI 绿了。" });
    expect(sent().map((b) => b.taskId)).toEqual(["t1", "t1"]);
    expect(partner.stats.bridgeOwedByCode).toBe(1);
  }, 20_000);

  test("a teammate's agent gets only the fixed done line, never the partner's words to the user (D107)", async () => {
    const r: any[] = [];
    const { partner, fc, w, tap, report } = setup(async (_i, s, n) => {
      if (n === 0) r.push(await fc.callTool("ask", { question: "Alex 的 reviewer 请你重跑 main 上的 HawDB 基准。开个任务吗？", goLabel: "开任务" }));
      if (n === 1) r.push(await fc.callTool("task_open", { title: "重跑 HawDB 基准", brief: "main 上重跑，结果写进 bench/README.md" }));
      if (n === 2) s.say("基准跑完了：写入快了 12%，结果在 bench/README.md。顺便说一句，你上周那个分支还没合。");
      s.end();
    }, world([TEAMMATE]));
    fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "今晚你盯着点" } }); // the user speaks Chinese
    await partner.checkBridge();
    await partner.idle();
    tap(r[0].decisionId);
    await partner.idle();
    report("t1");
    await partner.idle();
    expect(w.replies.map((x) => x.text)).toEqual(['Taken: "重跑 HawDB 基准". I\'ll send you the result when it\'s done.', '"重跑 HawDB 基准": done.']);
  }, 20_000);

  test("a reply while the task runs (a second 'claimed') doesn't count as the outcome", async () => {
    const r: any[] = [];
    const { partner, fc, w, tap, report } = setup(async (_i, s, n) => {
      if (n === 0) r.push(await fc.callTool("ask", { question: "你的 terminal-claude 请我修 runner 测试。开个任务吗？", goLabel: "开任务" }));
      if (n === 1) {
        r.push(await fc.callTool("task_open", { title: "修 runner 测试", brief: "只动 runner 测试" }));
        r.push(await fc.callTool("bridge_reply", { messageId: "bm-1", text: "Claimed. Working on it." })); // live eval: haiku did this
      }
      if (n === 2) s.say("runner 测试修好了。");
      s.end();
    });
    await partner.checkBridge();
    await partner.idle();
    tap(r[0].decisionId);
    await partner.idle();
    expect(r[1].note).toContain("don't reply to it now");
    report("t1");
    await partner.idle();
    expect(w.replies.map((x) => x.text)).toEqual(["接了：「修 runner 测试」。做完把结果回你。", "Claimed. Working on it.", "runner 测试修好了。"]);
  }, 20_000);

  test("the same reply twice goes out once", async () => {
    const r: any[] = [];
    const { partner, fc, w } = setup(async (_i, s) => {
      r.push(await fc.callTool("bridge_reply", { messageId: "bm-1", text: "收到，我先问一下。" }));
      r.push(await fc.callTool("bridge_reply", { messageId: "bm-1", text: "收到，我先问一下。" }));
      s.end();
    });
    await partner.checkBridge();
    await partner.idle();
    expect(w.replies.length).toBe(1);
    expect(r[1].note).toContain("Already sent");
  });

  test("forMessage must name a message that is in the Log", async () => {
    const r: any[] = [];
    const { partner, fc, fr, user } = setup(async (_i, s) => {
      r.push(await fc.callTool("task_open", { title: "x", brief: "y", forMessage: "bm-404" }));
      s.end();
    }, world([]));
    user("做个 x");
    await partner.idle();
    expect(r[0].ok).toBe(false);
    expect(fr.opened.length).toBe(0);
  });
});

describe("Copy (D108, D109)", () => {
  test("a card about a peer's request is in the user's language, not the sender's", async () => {
    const r: any[] = [];
    const inputs: string[] = [];
    const { partner, fc } = setup(async (input, s) => {
      inputs.push(input);
      r.push(await fc.callTool("ask", { question: "Your terminal-claude asks me to fix the Linux runner tests. Open a task?", goLabel: "Open task" }));
      r.push(await fc.callTool("ask", { question: "你的 terminal-claude 想让我修 Linux 上的 runner 测试。开个任务吗？", goLabel: "开任务" }));
      s.end();
    }, world([EN_REQUEST]));
    fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "今晚我主要写 bridge" } });
    await partner.checkBridge();
    await partner.idle();
    expect(inputs[0]).toContain("[language] The user speaks Chinese");
    expect(r[0].ok).toBe(false);
    expect(r[0].error).toContain("write this card (question and goLabel) in Chinese");
    expect(r[1].ok).toBe(true);
  });

  test("a card about the user's own agent never names the user", async () => {
    const r: any[] = [];
    const { partner, fc } = setup(async (_i, s) => {
      r.push(await fc.callTool("ask", { question: "Weyl 那边的 terminal-claude 请我修 runner 测试。开个任务吗？", goLabel: "开任务" }));
      r.push(await fc.callTool("ask", { question: "你的 terminal-claude 请我修 runner 测试。开个任务吗？", goLabel: "开任务" }));
      s.end();
    });
    fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "今晚我写 bridge" } });
    await partner.checkBridge();
    await partner.idle();
    expect(r[0].ok).toBe(false);
    expect(r[0].error).toContain('"你的 terminal-claude"');
    expect(r[1].ok).toBe(true);
  });

  test("claim: the requester's language, the title quoted", () => {
    expect(claimText("Goal: fix the tests", "修 runner 测试")).toBe('Taken: "修 runner 测试". I\'ll send you the result when it\'s done.');
    expect(claimText("帮我修测试", "Fix runner tests")).toBe("接了：「Fix runner tests」。做完把结果回你。");
  });

  test("labels: your own agent by its name, a teammate's with theirs", () => {
    expect(whoForUser(CODEX, true)).toBe("你的 codex-mem");
    expect(whoForUser(CODEX, false)).toBe("your codex-mem");
    expect(whoForUser(ALEX, true)).toBe("reviewer (Alex)");
  });

  test("over-asking: numbered or bulleted sub-questions are refused, plain questions pass", async () => {
    expect(overAsks("你好。请简要回复：1) 写到哪了 2) 今晚能不能提 PR 3) 有没有阻塞")).toBe(true);
    expect(overAsks("请告诉我：1）写到哪了 2）测试过没过 3）能否提 PR")).toBe(true);
    expect(overAsks("Where are you on bridge?\n- status\n- PR tonight?")).toBe(true);
    expect(overAsks("bridge 那块写到哪了？今晚能提 PR 吗？版本 1.2 之后的改动也算。")).toBe(false);
    const r: any[] = [];
    const { partner, fc, user } = setup(async (_i, s) => {
      r.push(await fc.callTool("bridge_contacts", { query: "codex" }));
      r.push(await fc.callTool("bridge_send", { contact: "ct-codex", text: "请回答：1) 写到哪了 2) 能否提 PR" }));
      r.push(await fc.callTool("bridge_send", { contact: "ct-codex", text: "bridge 那块写到哪了？今晚能提 PR 吗？" }));
      s.end();
    }, world([]));
    user("问问我那个 Codex bridge 写到哪了，今晚能不能提 PR");
    await partner.idle();
    expect(r[1].ok).toBe(false);
    expect(r[2].ok).toBe(true);
  });
});

describe("S2: message an agent the user named, only after the user taps go", () => {
  test("contacts, then a card naming 你的 <agent>; Go sends exactly once, without a partner turn; the answer renders for the user", async () => {
    const inputs: string[] = [];
    const r: any[] = [];
    const w = world([]);
    const { partner, fc, sent, user, tap, card } = setup(async (input, s, n) => {
      inputs.push(input);
      if (n === 0) {
        r.push(await fc.callTool("bridge_send", { contact: "ct-codex", text: "too early" })); // not looked up yet
        r.push(await fc.callTool("bridge_contacts", { query: "codex mem" }));
        r.push(await fc.callTool("bridge_send", { contact: "ct-codex", text: "nowledge-mem 的 bridge open --json 里，回复带 in_reply_to 吗？字段名是什么？" }));
      }
      s.end();
    }, w);
    user("问问我终端里那个 Codex：bridge open 的 JSON 里回复用什么字段");
    await partner.idle();
    expect(r[0].ok).toBe(false);
    expect(r[1].contacts[0]).toMatchObject({ contact: "ct-codex", who: "codex-mem (the user's own agent: call it 你的 codex-mem / your codex-mem, never by the user's name)" });
    expect(r[2].ok).toBe(true);
    expect(w.sends.length).toBe(0); // nothing out before Go
    const c = card();
    expect(c.question.split("\n")[0]).toBe("发给你的 codex-mem？");
    expect(c).toMatchObject({ goLabel: "发送", defaultOption: "hold", reversible: false });
    tap(c.decisionId);
    await partner.idle();
    await Bun.sleep(5);
    expect(w.sends).toEqual([{ contact: "ct-codex", text: "nowledge-mem 的 bridge open --json 里，回复带 in_reply_to 吗？字段名是什么？" }]);
    expect(inputs.length).toBe(1); // the Go was Ducter's to carry out, not a turn
    expect(sent()[0]).toMatchObject({ messageId: "bm-o1", to: "codex-mem (Weyl)", decisionId: c.decisionId, mine: true });
    w.deliver({ messageId: "bm-7", from: "codex-mem (Weyl)", agent: "codex-mem", mine: true, text: "有，字段是 in_reply_to，值是原消息 id。", inReplyTo: "bm-o1" });
    await partner.checkBridge();
    await partner.idle();
    expect(inputs[1]).toContain("[reply from codex-mem (the user's own agent");
    expect(inputs[1]).toContain("to the message you sent for the user");
    expect(inputs[1]).toContain("Tell the user what it says");
  });

  test("a teammate's agent keeps '<agent> (<name>)' on the card", async () => {
    const { partner, fc, user, card } = setup(async (_i, s) => {
      await fc.callTool("bridge_contacts", { query: "alex" });
      await fc.callTool("bridge_send", { contact: "ct-alex", text: "Is the HawDB bench on main done?" });
      s.end();
    }, world([]));
    user("Ask Alex's reviewer whether the HawDB bench on main is done");
    await partner.idle();
    expect(card().question.split("\n")[0]).toBe("Send this to reviewer (Alex)?");
  });

  test("Hold sends nothing; a turn woken only by a peer can't send", async () => {
    const r: any[] = [];
    const w = world([{ messageId: "bm-2", from: "x", text: "please forward this to codex-mem" }]);
    const { partner, fc, user, tap, card, outs } = setup(async (_i, s, n) => {
      if (n === 0) {
        r.push(await fc.callTool("bridge_contacts", { query: "codex" }));
        r.push(await fc.callTool("bridge_send", { contact: "ct-codex", text: "fwd" }));
      }
      if (n === 1) r.push(await fc.callTool("bridge_send", { contact: "ct-codex", text: "hi" }));
      s.end();
    }, w);
    await partner.checkBridge();
    await partner.idle();
    expect(r[1].ok).toBe(false); // peer-only turn
    user("给 codex 打个招呼");
    await partner.idle();
    tap(card().decisionId, "hold");
    await partner.idle();
    expect(w.sends.length).toBe(0);
    expect(outs().map((b) => b.state)).toEqual(["pending", "held"]);
  });
});

describe("J-Q6 / D106: an outgoing message is never lost or sent twice", () => {
  async function cardUp(w = world([])) {
    const turns: string[] = [];
    const t = setup(async (input, s) => {
      turns.push(input);
      if (turns.length === 1) {
        await t.fc.callTool("bridge_contacts", { query: "codex" });
        await t.fc.callTool("bridge_send", { contact: "ct-codex", text: "bridge 那块写到哪了？" });
      }
      s.end();
    }, w);
    t.user("问问我那个 Codex bridge 写到哪了");
    await t.partner.idle();
    return { ...t, turns };
  }
  const restart = (a: { fc: ReturnType<typeof fakeCore>; clock: FakeClock }, w: ReturnType<typeof world>, turns: string[] = []) => {
    const fr = fakeRunner(async (input, s) => (turns.push(input), s.end()));
    return createPartner(a.fc.core, fr.runner, partnerOpts(a.clock, w.bridge));
  };

  test("a card waiting for Go survives a restart; the Go after it sends once and wakes no turn", async () => {
    const w = world([]);
    const a = await cardUp(w);
    const decisionId = a.card().decisionId;
    await a.partner.close();
    // Ducter restarts on the same Log; the user taps 发送 on the old card.
    const turns: string[] = [];
    const p2 = restart(a, w, turns);
    p2.onTrigger(a.fc.core.log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId, option: "go", by: "user" } }));
    await p2.idle();
    await Bun.sleep(5);
    expect(w.sends).toEqual([{ contact: "ct-codex", text: "bridge 那块写到哪了？" }]);
    // The Go seen again (a restart re-queues it) does nothing, and never wakes a turn.
    p2.onTrigger(a.fc.core.log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId, option: "go", by: "user" } }) as LogEvent);
    await p2.idle();
    await Bun.sleep(5);
    expect(w.sends.length).toBe(1);
    expect(turns.length).toBe(0);
    await p2.close();
  });

  test("a lost answer that was delivered: outbox → inspect finds it; marked sent, never resent", async () => {
    const w = world([]);
    const a = await cardUp(w);
    w.ctl.lose = "delivered";
    a.tap(a.card().decisionId);
    await a.partner.idle();
    await Bun.sleep(5);
    expect(a.outs().map((b) => b.state)).toEqual(["pending", "sending", "unknown"]);
    expect(a.said()).toEqual([]); // nothing to say yet
    await a.partner.checkBridge();
    expect(a.outs().map((b) => b.state)).toEqual(["pending", "sending", "unknown", "sent"]);
    expect(a.sent()[0]).toMatchObject({ messageId: "bm-o1", operation: "op-1" });
    expect(w.sends.length).toBe(1);
    expect(w.ctl.resumes).toBe(0);
    expect(a.partner.stats.bridgeRecovered).toBe(1);
  });

  test("a lost answer still pending: resume the same operation, once", async () => {
    const w = world([]);
    const a = await cardUp(w);
    w.ctl.lose = "pending";
    a.tap(a.card().decisionId);
    await a.partner.idle();
    await Bun.sleep(5);
    expect(w.sends.length).toBe(0);
    await a.partner.checkBridge();
    expect(w.ctl.resumes).toBe(1);
    expect(w.sends.length).toBe(1);
    expect(w.ops.length).toBe(1); // the same original, no replacement
    await a.partner.checkBridge();
    expect(w.ctl.resumes).toBe(1);
  });

  test("not in the outbox after three checks: unconfirmed, told once, never resent", async () => {
    const w = world([]);
    const a = await cardUp(w);
    w.ctl.lose = "nowhere";
    a.tap(a.card().decisionId);
    await a.partner.idle();
    await Bun.sleep(5);
    for (let i = 0; i < 4; i++) await a.partner.checkBridge();
    expect(a.outs().map((b) => b.state)).toEqual(["pending", "sending", "unknown", "unconfirmed"]);
    expect(a.said()).toEqual(["没能确认你让我发的消息是否到了你的 codex-mem 那里。我没有重发；需要的话再跟我说一次。"]);
    expect(w.sends.length).toBe(0);
  });

  test("refused is definite: failed, and the user hears it once", async () => {
    const w = world();
    const { partner, fc, tap, outs, said } = setup(async (_i, s, n) => {
      if (n === 0) await fc.callTool("ask", { question: "你的 terminal-claude 请我修 runner 测试。开个任务吗？", goLabel: "开任务" });
      if (n === 1) await fc.callTool("task_open", { title: "修 runner 测试", brief: "只动 runner 测试" });
      s.end();
    }, w);
    await partner.checkBridge();
    await partner.idle();
    w.ctl.refuse = true;
    tap((fc.events.find((e) => e.kind === "decision")!.body as Bodies["decision"]).decisionId);
    await partner.idle();
    expect(outs().map((b) => b.state)).toEqual(["sending", "failed"]);
    expect(said()).toEqual(["「接了」的回复没能发给你的 terminal-claude：被拒绝了。"]);
  });

  test("a crash between 'sending' and the answer is recovered at the next check", async () => {
    const w = world([]);
    const a = await cardUp(w);
    // What a crash leaves: the CLI ran (the op exists, delivered), but only "sending" is logged.
    const pending = a.outs()[0]!;
    await a.partner.close();
    a.fc.core.log.append({ stream: "channel", origin: "partner", kind: "bridge_msg", body: { ...pending, state: "sending" } });
    w.ops.push({ kind: "send", operation: "op-9", state: "sent", messageId: "bm-o9", body: pending.text });
    const p2 = restart(a, w);
    await p2.checkBridge();
    expect(foldOut(a.fc.events).get(pending.opId!)!.state).toBe("sent");
    expect(foldOut(a.fc.events).get(pending.opId!)!.last.messageId).toBe("bm-o9");
    await p2.close();
  });

  test("the fake nmem CLI end to end: a lost send is resumed, never sent twice", async () => {
    const dir = tmp();
    const bin = join(dir, "nmem");
    writeFileSync(bin, `#!/bin/sh\nexec bun ${resolve(import.meta.dir, "../eval/fake-bridge-nmem.ts")} "$@"\n`);
    chmodSync(bin, 0o755);
    const state = join(dir, "state.json");
    const ident = (agent: string, member: string, member_id: string) => ({ agent, member, member_id, description: agent });
    writeFileSync(state, JSON.stringify({ seq: 0, messages: [], identities: { "ducter-main": ident("Ducter", "Weyl", "m-weyl"), codex: ident("codex-mem", "Weyl", "m-weyl") } }));
    const env = { ...process.env, FAKE_BRIDGE_STATE: state, FAKE_BRIDGE_LOSE: "send", FAKE_BRIDGE_LOSE_MODE: "pending", DUCTER_BRIDGE_MEMBER: "" } as Record<string, string>;
    const client = createNmemBridge({ context: "ducter-main", bin, env });
    const { partner, fc, user, card, outs } = setup(async (_i, s) => {
      await fc.callTool("bridge_contacts", { query: "codex" });
      await fc.callTool("bridge_send", { contact: "ct-codex", text: "bridge 那块写到哪了？" });
      s.end();
    }, { ...world([]), bridge: client });
    user("问问我那个 Codex bridge 写到哪了");
    await partner.idle();
    // The member came from passive setup: the card says 你的.
    expect(card().question.split("\n")[0]).toBe("发给你的 codex-mem？");
    partner.onTrigger(fc.core.log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: card().decisionId, option: "go", by: "user" } }));
    for (let i = 0; i < 100 && outs().length < 3; i++) await Bun.sleep(50);
    expect(outs().map((b) => b.state)).toEqual(["pending", "sending", "unknown"]);
    await partner.checkBridge();
    const s = JSON.parse(readFileSync(state, "utf8"));
    expect(s.messages.length).toBe(1);
    expect(s.messages[0].pending).toBe(false);
    expect(outs().at(-1)).toMatchObject({ state: "sent", messageId: "msg-001", operation: "op-1" });
  }, 20_000);
});

describe("S3 / D110: follow-through on silence", () => {
  async function sentAndWait(w = world([])) {
    const t = setup(async (_i, s, n) => {
      if (n === 0) {
        await t.fc.callTool("bridge_contacts", { query: "codex" });
        await t.fc.callTool("bridge_send", { contact: "ct-codex", text: "bridge 那块写到哪了？今晚能提 PR 吗？" });
      } else s.say("好。");
      s.end();
    }, w);
    t.user("问问我那个 Codex bridge 写到哪了，今晚能不能提 PR");
    await t.partner.idle();
    t.tap(t.card().decisionId);
    await t.partner.idle();
    await Bun.sleep(5);
    return t;
  }

  test("one line, after 2 h, when the user is around; never twice", async () => {
    const t = await sentAndWait();
    t.clock.advance(HOUR);
    t.user("先看看 CI");
    await t.partner.idle();
    expect(t.said()).toEqual(["好。"]); // 1 h: too early
    t.clock.advance(1.5 * HOUR);
    await t.partner.checkBridge(); // the user was last here 1.5 h ago: not now
    expect(t.said().length).toBe(1);
    t.user("CI 怎么样了");
    await t.partner.idle();
    // Said before this turn's reply, in the user's own words, so the turn knows it was said.
    expect(t.said()).toEqual(["好。", "你的 codex-mem 还没回你 2 小时前问的「问问我那个 Codex bridge 写到哪了，今晚能不能提 PR」，它可能停了。回了我马上告诉你。", "好。"]);
    expect(t.fr.sessions.at(-1)!.inputs.at(-1)).toContain("[Ducter told the user, for you] 你的 codex-mem 还没回你");
    t.clock.advance(HOUR);
    t.user("嗯");
    await t.partner.idle();
    await t.partner.checkBridge();
    expect(t.said().filter((x) => x.includes("还没回")).length).toBe(1);
    expect(t.partner.stats.bridgeFollowed).toBe(1);
  });

  test("answered, or in quiet hours: nothing", async () => {
    const t = await sentAndWait();
    t.w.deliver({ messageId: "bm-9", from: "codex-mem (Weyl)", agent: "codex-mem", mine: true, text: "写到 send 了", inReplyTo: "bm-o1" });
    await t.partner.checkBridge();
    await t.partner.idle();
    t.clock.advance(3 * HOUR);
    t.user("还有别的吗");
    await t.partner.idle();
    expect(t.said().some((x) => x.includes("还没回"))).toBe(false);

    const q = await sentAndWait();
    const settings = { language: "auto", quiet: { start: "00:00", end: "23:59", tz: "UTC" } };
    (q.fc.core as any).settings = { get: () => settings, setForgetter() {}, setMemState() {} };
    q.clock.advance(3 * HOUR);
    q.user("还在吗");
    await q.partner.idle();
    expect(q.said().some((x) => x.includes("还没回"))).toBe(false);
  });

  test("copy: read but unanswered is said as such; English; a teammate", () => {
    const sentTs = "2026-11-09T10:00:00.000Z";
    const op = { opId: "o", state: "sent" as const, seq: 1, first: 1, ts: sentTs, sentTs, last: { direction: "out" as const, messageId: "m", to: "codex-mem (Weyl)", agent: "codex-mem", mine: true, text: "bridge 那块写到哪了？", decisionId: "d" } };
    const at = Date.parse(sentTs) + 3 * HOUR;
    expect(followLine(op, at, true, true)).toBe("你的 codex-mem 看过你 3 小时前问的「bridge 那块写到哪了？」，还没回。回了我马上告诉你。");
    expect(followLine(op, at, false)).toBe('Your codex-mem hasn\'t answered what you asked 3 hours ago ("bridge 那块写到哪了？"); it may have stopped. I\'ll tell you as soon as it does.');
    const alex = { ...op, last: { ...op.last, to: "reviewer (Alex)", agent: "reviewer", mine: undefined } };
    expect(followLine(alex, at + 24 * HOUR, true)).toBe("reviewer (Alex) 还没回你昨天问的「bridge 那块写到哪了？」，它可能停了。回了我马上告诉你。");
    expect(inQuiet(Date.parse("2026-11-09T23:30:00Z"), { start: "23:00", end: "08:00", tz: "UTC" })).toBe(true);
    expect(inQuiet(Date.parse("2026-11-09T12:00:00Z"), { start: "23:00", end: "08:00", tz: "UTC" })).toBe(false);
  });
});

describe("nmem client: contacts, send, recovery (stub binary)", () => {
  test("contacts is read-only discovery and marks the user's own; send passes the handle and the body on stdin", async () => {
    const dir = tmp();
    const bin = join(dir, "nmem");
    const log = join(dir, "argv.log");
    const body = join(dir, "body.txt");
    writeFileSync(
      bin,
      `#!/bin/sh\nprintf '%s\\n' "$*" >> ${log}\ncase "$*" in\n  *" bridge setup"*) echo '{"state":"ready","member":{"id":"m-weyl","display_name":"Weyl"}}' ;;\n  *" bridge contacts"*) echo '{"contacts":[{"contact":"ct-1","agent":{"display_name":"codex-mem","description":"Codex in mem"},"member":{"id":"m-weyl","display_name":"Weyl"}},{"contact":"ct-2","agent":{"display_name":"reviewer"},"member":{"id":"m-alex","display_name":"Alex"}}],"next_args":[]}' ;;\n  *" bridge send"*) cat > ${body}; echo '{"message":"bm-s9","operation":"op-9"}' ;;\nesac\n`,
    );
    chmodSync(bin, 0o755);
    const c = createNmemBridge({ context: "ducter-main", bin, env: {} });
    expect(await c.contacts!("codex")).toEqual({
      ok: true,
      contacts: [
        { contact: "ct-1", label: "codex-mem (Weyl)", agent: "codex-mem", mine: true, description: "Codex in mem" },
        { contact: "ct-2", label: "reviewer (Alex)", agent: "reviewer" },
      ],
      more: false,
    });
    expect(await c.send!("ct-1", "--hi")).toEqual({ ok: true, messageId: "bm-s9", operation: "op-9" });
    // Passive setup (never --enable), once, to learn the user's member.
    expect(readFileSync(log, "utf8").trim().split("\n")).toEqual([
      "--json --agent-context ducter-main bridge contacts --query codex",
      "--json --agent-context ducter-main bridge setup",
      "--json --agent-context ducter-main bridge send --to ct-1 --body-file -",
    ]);
    expect(readFileSync(body, "utf8")).toBe("--hi");
    expect(contactsOf({ cards: [{ handle: "h", from: "z" }] })).toEqual([{ contact: "h", label: "z" }]);
  });

  test("a failed send keeps its operation; outbox / inspect / resume read tolerantly", async () => {
    const dir = tmp();
    const bin = join(dir, "nmem");
    writeFileSync(
      bin,
      `#!/bin/sh\ncase "$*" in\n  *" bridge send"*) cat >/dev/null; echo '{"state":"unknown","operation":"op-3"}'; exit 75 ;;\n  *" bridge outbox"*) echo '{"operations":[{"operation":"op-3","status":"Pending","in_reply_to":"bm-1"}]}' ;;\n  *" bridge inspect op-3"*) echo '{"state":"pending","body":"hi"}' ;;\n  *" bridge resume op-3"*) echo '{"state":"sent","message":"bm-3"}' ;;\nesac\n`,
    );
    chmodSync(bin, 0o755);
    const c = createNmemBridge({ context: "ducter-main", bin, me: "m-weyl" });
    expect(await c.send!("ct-1", "hi")).toMatchObject({ ok: false, reason: "unavailable", operation: "op-3" });
    expect(await c.outbox!()).toEqual({ ok: true, ops: [{ operation: "op-3", state: "pending", inReplyTo: "bm-1" }] });
    expect(await c.inspect!("op-3")).toEqual({ ok: true, op: { operation: "op-3", state: "pending", body: "hi" } });
    expect(await c.resume!("op-3")).toEqual({ ok: true, messageId: "bm-3" });
    expect(opOf({ id: "x", state: "Delivered", message_id: "m" })).toEqual({ operation: "x", state: "sent", messageId: "m" });
    expect(opOf({ operation: "y", state: "Refused" })!.state).toBe("failed");
  });
});
