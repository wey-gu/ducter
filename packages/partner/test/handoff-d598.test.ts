// D598: a hand-off to a helper is real only once one of its tasks has it. hel, 2026-11-26: a dev task
// (Antigravity) handed mem#11393 to "Nowledge Mem PR Babysitter" through Nowledge Mem; it came back as a
// reply on the babysitter's own last outcome, the partner read it as an answer, no task took it, the
// partner said 「已交给 PR Babysitter 跟进」 anyway, and nothing said for 40 minutes that it had stalled.
// Here: a helper on this home is handed work without Mem and without a card; a turn opens it; the claim
// goes into the task that handed it; until then the partner's facts say handed, not taken; nobody
// taking it is said once; and mail through Mem written on the helper's own message is work again.
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bodies, TaskCard } from "../../protocol/src/index.ts";
import { createHelpers } from "../../core/src/helpers.ts";
import { createPartner, type BridgeClient, type BridgeMessage } from "../src/index.ts";
import { FakeClock, fakeCore, fakeMemory, fakeRunner, type Script } from "./fakes.ts";

const tmp = () => mkdtempSync(join(tmpdir(), "ducter-handoff-test-"));
const settle = (ms = 20) => new Promise((r) => setTimeout(r, ms));
const NAME = "Nowledge Mem PR Babysitter";
const ASK = "请接手推进 PR https://github.com/nowledge-co/mem/pull/11393（关联 Issue #11390）。必选 CI 已全绿；最新提交要独立会话评审，通过后只评论 /lgtm，走 Tide 批量合并，禁止手动合并。";

function box() {
  const replies: { messageId: string; text: string }[] = [];
  const mail: BridgeMessage[] = [];
  const bridge: BridgeClient = {
    async check(known) {
      return { ok: true, messages: mail.filter((m) => !known.has(m.messageId)) };
    },
    async reply(messageId, text) {
      replies.push({ messageId, text });
      return { ok: true, messageId: `r-${replies.length}`, operation: `op-${replies.length}` };
    },
    async send(_contact, text) {
      replies.push({ messageId: "(send)", text });
      return { ok: true, messageId: `s-${replies.length}` };
    },
  };
  return { bridge, replies, deliver: (m: BridgeMessage) => mail.push(m) };
}

async function setup(script: Script) {
  const clock = new FakeClock();
  const fc = fakeCore(clock, tmp());
  const fr = fakeRunner(script);
  fr.bindCards(fc.cards);
  const helpers = createHelpers({
    dataDir: fc.core.dataDir,
    partnerName: () => "Ducter",
    home: () => "hel",
    link: () => ({
      connectAs: async (agentId) => ({ ok: true, context: `${agentId}-on-hel`, connectionId: `c-${agentId}`, spaceId: "personal-1" }),
      revokeConnection: async () => true,
    }),
  });
  (fc.core as { helpers?: unknown }).helpers = helpers;
  const made = helpers.make({ name: NAME, about: "PRs on nowledge-co/mem my agents hand over", brief: "Own each PR to the end: an independent review subagent, fix or send rework back, then /lgtm on Prow/Tide repos; never merge by hand." });
  if (!made.ok) throw new Error("helper not made");
  await helpers.tick();
  // The dev task, on Antigravity: it reaches the person's other agents through Ducter (D448).
  const dev: TaskCard = { taskId: "m2uifpyn", persona: "p1", title: "用 agy 处理 Mem #11390 并准备 PR 交接", project: "", place: { kind: "none" }, harness: "antigravity", attention: "working", residency: "hot", openedAt: "", updatedAt: "" } as TaskCard;
  fc.cards.set(dev.taskId, dev);
  fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "修好 #11390，开 PR 交给 Babysitter" } });
  const main = box();
  const hb = box();
  const partner = createPartner(fc.core, fr.runner, { now: clock.now, persistState: false, settleMs: 0, onError: (e: unknown) => console.error(e), memory: fakeMemory([]).memory, bridge: main.bridge, helperBridge: () => hb.bridge, bridgeIntervalMs: 0, bridgeRecoverMs: 0, bridgeStartMark: false, stallEveryMs: 10 });
  const agentMessage = (args: unknown, taskId = "m2uifpyn") => {
    const t = fc.tools.get("task:agent_message");
    if (!t) throw new Error("no agent_message");
    return t.handler(args, { role: "task", taskId }) as Promise<any>;
  };
  const said = () => fc.events.filter((e) => e.kind === "ai_msg").map((e) => e.body as Bodies["ai_msg"]);
  return { fc, fr, partner, helpers, main, hb, clock, agentMessage, said, helperId: made.helper.id };
}

describe("D598: a hand-off on this home", () => {
  test("handed without Mem or a card; a turn opens it as the helper's; the claim goes into the task that handed it", async () => {
    const inputs: string[] = [];
    const opened: any[] = [];
    const { fc, fr, partner, main, hb, agentMessage, helperId } = await setup(async (input, s) => {
      inputs.push(input);
      const m = input.match(/work handed to your helper "[^"]+" on this home by your task m2uifpyn, message (local-[\w-]+)/);
      if (m) {
        // research/244 §5.2: whatever the model says, Ducter's own traffic gets no line of its own.
        s.say("好，我让 Babysitter 接手。");
        opened.push(await fc.callTool("task_open", { title: "接手 mem#11393：独立评审，OK 就 /lgtm", brief: "nowledge-co/mem#11393: independent review of the latest head; /lgtm once it holds.", forMessage: m[1] }));
      }
      s.end();
    });
    const r = await agentMessage({ to: "PR Babysitter", text: ASK });
    expect(r).toMatchObject({ ok: true, handed: true, taken: false });
    expect(r.note).toContain("never report");
    // No card, nothing through Mem.
    expect(fc.events.some((e) => e.kind === "decision")).toBe(false);
    expect(main.replies.length + hb.replies.length).toBe(0);
    const hand = fc.events.find((e) => e.kind === "bridge_msg" && (e.body as Bodies["bridge_msg"]).local)!.body as Bodies["bridge_msg"];
    expect(hand).toMatchObject({ direction: "in", helper: helperId, fromTask: "m2uifpyn", mine: true });
    expect(hand.text).toContain("Ducter 的任务「用 agy 处理 Mem #11390 并准备 PR 交接」：");
    await partner.idle();
    await settle();
    // No ack, no partner message: the task card is the only thing the person sees.
    expect(fc.events.filter((e) => e.kind === "ai_msg" || e.kind === "ack")).toHaveLength(0);
    // Before the task opened, the turn's facts said it was handed and not taken.
    expect(inputs[0]).toContain("handed, waiting to be taken");
    expect(inputs[0]).toContain("from task m2uifpyn");
    expect(opened[0]).toMatchObject({ ok: true });
    expect(fr.opened).toHaveLength(1);
    expect(fr.opened[0]!.brief).toContain(`交给「${NAME}」的`);
    expect(fr.opened[0]!.brief).toContain("任务 m2uifpyn");
    expect(fr.opened[0]!.brief).toContain("/lgtm on Prow/Tide repos");
    // The claim: into the dev task, never through Mem.
    expect(fr.sent.find((x) => x.taskId === "m2uifpyn")?.text).toContain(`answered your hand-off`);
    expect(main.replies.length + hb.replies.length).toBe(0);
    const claim = fc.events.find((e) => e.kind === "bridge_msg" && (e.body as Bodies["bridge_msg"]).direction === "out" && (e.body as Bodies["bridge_msg"]).inReplyTo === hand.messageId && (e.body as Bodies["bridge_msg"]).state === "sent");
    expect(claim?.body).toMatchObject({ helper: helperId, state: "sent" });
    const helperTask = (claim!.body as Bodies["bridge_msg"]).taskId!;
    // More words on the same work go to the helper's task, never a second piece of work.
    const again = await agentMessage({ to: "PR Babysitter", text: "只差 /lgtm 了：Tide 的 pending 不是要等的检查。" });
    expect(again).toMatchObject({ ok: true, sent: true });
    expect(fr.sent.find((x) => x.taskId === helperTask)?.text).toContain("只差 /lgtm");
    expect(fc.events.filter((e) => e.kind === "bridge_msg" && (e.body as Bodies["bridge_msg"]).local && (e.body as Bodies["bridge_msg"]).direction === "in" && !(e.body as Bodies["bridge_msg"]).inReplyTo)).toHaveLength(1);
    // The helper's claim and outcome are local replies too (research/244 §5.2: no markers).
    expect(fc.events.filter((e) => e.kind === "bridge_msg" && (e.body as Bodies["bridge_msg"]).local && (e.body as Bodies["bridge_msg"]).direction === "out")).toHaveLength(2);
  }, 20_000);

  test("no task takes it: the facts say so, and after ten minutes the person hears it once, with the offer", async () => {
    const inputs: string[] = [];
    const { partner, clock, agentMessage, said } = await setup(async (input, s) => {
      inputs.push(input);
      s.end(); // the turn doesn't open it
    });
    expect((await agentMessage({ to: "PR Babysitter", text: ASK })).handed).toBe(true);
    await partner.idle();
    expect(inputs[0]).toContain("handed, waiting to be taken");
    expect(inputs[0]).toContain("never that it took it or is on it");
    // A second hand-off of the same work while nothing took it: one record, merged (D609).
    expect(await agentMessage({ to: "PR Babysitter", text: "再补一句" })).toMatchObject({ ok: true, handed: true, taken: false });
    clock.advance(9 * 60_000);
    await settle(40);
    expect(said().filter((x) => x.stalled)).toHaveLength(0);
    clock.advance(2 * 60_000);
    await settle(40);
    const stalled = said().filter((x) => x.stalled);
    expect(stalled).toHaveLength(1);
    expect(stalled[0]!.text).toContain(`交给「${NAME}」的`);
    expect(stalled[0]!.text).toContain("还没有任务接手");
    expect(stalled[0]!.text).toContain("要我直接开一个任务来做吗");
    clock.advance(30 * 60_000);
    await settle(40);
    expect(said().filter((x) => x.stalled)).toHaveLength(1);
  }, 20_000);

  test("through Mem, written on the helper's own earlier message: still work handed to it, opened without a card", async () => {
    const inputs: string[] = [];
    const { fc, fr, partner, hb, helperId } = await setup(async (input, s) => {
      inputs.push(input);
      const m = input.match(/\[message to your helper "[^"]+" from [^\]]*message (bm-[\w-]+)\]/);
      if (m) await fc.callTool("task_open", { title: `PR ${m[1]}`, brief: "the PR in the message", forMessage: m[1] });
      s.end();
    });
    // The helper's last outcome went out earlier (for #11070) as r-1.
    fc.core.log.append({ stream: "channel", origin: "partner", kind: "bridge_msg", body: { direction: "out", messageId: "r-0", inReplyTo: "bm-11070", helper: helperId, to: "Ducter", text: "PR #11070 已由 Prow 自动合并。", taskId: "itwryrgy", state: "sent" } });
    hb.deliver({ messageId: "bm-11393", from: "Ducter", agent: "Ducter", mine: true, inReplyTo: "r-0", text: `Ducter 的任务「用 agy 处理 Mem #11390 并准备 PR 交接」：\n${ASK}` });
    await partner.checkBridge();
    await partner.idle();
    await settle();
    const turn = inputs.find((i) => i.includes("bm-11393"))!;
    expect(turn).toContain(`[message to your helper "${NAME}" from`);
    expect(turn).not.toContain("reply from Ducter via Bridge to the message you sent for the user");
    expect(fr.opened).toHaveLength(1);
    expect(fc.events.some((e) => e.kind === "decision")).toBe(false);
    // The claim goes back from the helper's own address, as for any original.
    expect(hb.replies[0]?.messageId).toBe("bm-11393");
  }, 20_000);
});
