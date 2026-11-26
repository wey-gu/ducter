// D609: returned and declined are said back to the sender, and done is the record's last step. A
// teammate's hand-off is answered in the Space it came from (D595's route); a task's hand-off is
// sent into the task. The partner states it once, never twice.
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bodies, LogEvent, TaskCard } from "../../protocol/src/index.ts";
import { createHelpers } from "../../core/src/helpers.ts";
import { createPartner, type BridgeClient, type BridgeMessage } from "../src/index.ts";
import { FakeClock, fakeCore, fakeMemory, fakeRunner, type Script } from "./fakes.ts";

const tmp = () => mkdtempSync(join(tmpdir(), "ducter-d609-states-"));
const settle = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const HELPER = "Nowledge Mem PR Babysitter";
const TEAM = { from: "AI agent (dev team)", space: "dev-team", spaceLabel: "dev team", shared: true } as const;

function box() {
  const replies: { messageId: string; text: string }[] = [];
  const mail: BridgeMessage[] = [];
  const bridge: BridgeClient = {
    async check(known) {
      return { ok: true, messages: mail.filter((m) => !known.has(m.messageId)) };
    },
    async reply(messageId, text) {
      replies.push({ messageId, text });
      return { ok: true, messageId: `r-${replies.length}` };
    },
    async send(_c, text) {
      replies.push({ messageId: "(send)", text });
      return { ok: true, messageId: `s-${replies.length}` };
    },
  };
  return { bridge, replies, deliver: (m: BridgeMessage) => mail.push(m) };
}

async function setup(script: Script) {
  const clock = new FakeClock();
  clock.t = Date.parse("2026-11-26T19:12:00Z");
  const fc = fakeCore(clock, tmp());
  const fr = fakeRunner(script);
  fr.bindCards(fc.cards);
  const helpers = createHelpers({
    dataDir: fc.core.dataDir,
    partnerName: () => "Ducter",
    home: () => "hel",
    link: () => ({ connectAs: async (id) => ({ ok: true, context: `${id}-on-hel`, connectionId: `c-${id}`, spaceId: "personal-1" }), revokeConnection: async () => true }),
  });
  (fc.core as { helpers?: unknown }).helpers = helpers;
  const peers = { reach: "own" as const, trusted: [] as string[], muted: [] as string[], allowed: [TEAM.from] };
  (fc.core as { settings?: unknown }).settings = { get: () => ({ peers }), setPeers: (p: Partial<typeof peers>) => Object.assign(peers, p), setForgetter() {}, setMemState() {} };
  const made = helpers.make({ name: HELPER, about: "PRs on nowledge-co/mem", brief: "Own each PR to the end." });
  if (!made.ok) throw new Error("helper not made");
  await helpers.tick();
  const main = box();
  const hb = box();
  const partner = createPartner(fc.core, fr.runner, { now: clock.now, persistState: false, settleMs: 0, onError: (e: unknown) => console.error(e), memory: fakeMemory([]).memory, bridge: main.bridge, helperBridge: () => hb.bridge, bridgeIntervalMs: 0, bridgeRecoverMs: 0, bridgeStartMark: false, stallEveryMs: 10 });
  const dev: TaskCard = { taskId: "dev1", persona: "p1", title: "修 Mem #11408", project: "", place: { kind: "none" }, harness: "antigravity", attention: "working", residency: "hot", openedAt: "", updatedAt: "" } as TaskCard;
  fc.cards.set(dev.taskId, dev);
  return { clock, fc, fr, partner, helpers, hb, main, helperId: made.helper.id };
}

const claimOf = (fc: ReturnType<typeof setup>["fc"], messageId: string) =>
  fc.events.find((e) => e.kind === "bridge_msg" && (e.body as Bodies["bridge_msg"]).direction === "out" && (e.body as Bodies["bridge_msg"]).inReplyTo === messageId && (e.body as Bodies["bridge_msg"]).state === "sent")!.body as Bodies["bridge_msg"];

describe("D609: declined and returned said back; done is the record's end", () => {
  test("a teammate's hand-off declined: answered in its Space, with why, once", async () => {
    const opened: string[] = [];
    const t = await setup(async (input, s) => {
      const m = input.split("</conversation_so_far>").pop()?.match(/message (bm-[\w-]+)/);
      if (m && !opened.includes(m[1]!)) {
        opened.push(m[1]!);
        await t.fc.callTool("task_open", { title: "接手 mem#11389", brief: "nowledge-co/mem#11389: own it to the end.", forMessage: m[1] });
      }
      s.end();
    });
    const { fc, partner, hb, helperId } = t;
    hb.deliver({ ...TEAM, messageId: "bm-11389", text: "请接手 nowledge-co/mem#11389：三处行为回归、两个 CI 失败。" });
    await partner.checkBridge();
    await partner.idle();
    await settle();
    // The person's Go on its card (a teammate's agent is not trusted to start work): the partner
    // opens the helper's task, which claims it.
    await fc.callTool("task_open", { title: "接手 mem#11389", brief: "nowledge-co/mem#11389: own it to the end.", forMessage: "bm-11389" });
    await settle();
    const rec = fc.core.handoffs!.ofHelper(helperId)[0]!;
    expect(rec.state).toBe("taken");
    const taskId = rec.taskId!;
    expect(claimOf(fc, "bm-11389").taskId).toBe(taskId);

    const ended = await fc.core.handoffs!.finishForTask(taskId, "declined", { why: "我只接 PR，这个是 issue。", say: true });
    expect(ended).toMatchObject({ state: "declined", why: "我只接 PR，这个是 issue。" });
    const answer = fc.events.filter((e) => e.kind === "bridge_msg" && (e.body as Bodies["bridge_msg"]).direction === "out" && (e.body as Bodies["bridge_msg"]).inReplyTo === "bm-11389" && (e.body as Bodies["bridge_msg"]).state === "sent").map((e) => e.body as Bodies["bridge_msg"]);
    expect(answer.length).toBe(2); // the claim, then the decline
    const decline = answer[1]!;
    expect(decline).toMatchObject({ helper: helperId, space: "dev-team", state: "sent" });
    expect(hb.replies.at(-1)!.messageId).toBe("bm-11389");
    expect(hb.replies.at(-1)!.text).toContain("接不了");
    expect(hb.replies.at(-1)!.text).toContain("我只接 PR");
    // Said once, never again.
    expect(await fc.core.handoffs!.finishForTask(taskId, "declined", { why: "again", say: true })).toBeUndefined();
    expect(hb.replies).toHaveLength(2);
  }, 20_000);

  test("a done report ends the record and is said into the task that gave the work", async () => {
    const opened: string[] = [];
    const t = await setup(async (input, s) => {
      const m = input.split("</conversation_so_far>").pop()?.match(/message (local-[\w-]+)/);
      if (m && !opened.includes(m[1]!)) {
        opened.push(m[1]!);
        await t.fc.callTool("task_open", { title: "接手 mem#11408", brief: "nowledge-co/mem#11408: own it to the end.", forMessage: m[1] });
      }
      s.end();
    });
    const { fc, partner, fr } = t;
    const tool = fc.tools.get("task:agent_message")!;
    const sent = await tool.handler({ to: "PR Babysitter", text: "请接手 nowledge-co/mem#11408" }, { role: "task", taskId: "dev1" });
    expect(sent).toMatchObject({ ok: true, handed: true });
    await partner.idle();
    await settle();
    const rec = fc.core.handoffs!.ofHelper(fc.core.handoffs!.all()[0]!.to.helper)[0]!;
    expect(rec.state).toBe("taken");
    const taskId = rec.taskId!;
    const report = fc.core.log.append({ stream: `task:${taskId}`, origin: "task", kind: "report", body: { taskId, state: "done", summary: "评审通过，已评论 /lgtm。", questions: [], evidence: [] } });
    partner.onTrigger(report as LogEvent);
    await partner.idle();
    await settle();
    expect(fc.core.handoffs!.get(rec.handoffId)).toMatchObject({ state: "done", outcome: "评审通过，已评论 /lgtm。" });
    expect(fr.sent.some((x) => x.taskId === "dev1" && /answered your hand-off/.test(x.text) && x.text.includes("评审通过"))).toBe(true);
  }, 20_000);
});
