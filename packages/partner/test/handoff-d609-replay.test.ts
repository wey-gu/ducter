// D609: the replay of hel's real sequence, from design/handoff.md §1, as fakes:
//   11-25  the 官网 #562 hand-off, threaded under an old message (never noticed)
//   11-26  16:31  a dev task, mem#11393 (a reply on the babysitter's old outcome)
//          17:02  a dev task, mem#11408
//          dev team #11389, from a colleague's agent: muted, then let in (D604)
//          20:20–20:36  mem-backbone#378 and mem#11441, each sent 3×
// Every item must end as exactly one record: taken by one of the helper's tasks, or said unclaimed
// once, and never silent. The 3× resends are one record, one helper task, two added words.
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bodies, TaskCard } from "../../protocol/src/index.ts";
import { createHelpers } from "../../core/src/helpers.ts";
import { createPartner, type BridgeClient, type BridgeMessage } from "../src/index.ts";
import { FakeClock, fakeCore, fakeMemory, fakeRunner, type Script } from "./fakes.ts";

const tmp = () => mkdtempSync(join(tmpdir(), "ducter-d609-replay-"));
const settle = (ms = 40) => new Promise((r) => setTimeout(r, ms));
const HELPER = "Nowledge Mem PR Babysitter";
const TEAM = { from: "AI agent (dev team)", space: "dev-team", spaceLabel: "dev team", shared: true } as const;

const ITEMS = {
  "website#562": "11-25: 官网 #562，埋在旧消息下",
  "nowledge-co/mem#11393": "16:31: dev task，mem#11393",
  "nowledge-co/mem#11408": "17:02: dev task，mem#11408",
  "nowledge-co/mem#11389": "dev team：同事的 agent，mem#11389",
  "mem-backbone#378": "20:20: mem-backbone #378，发了 3 次",
  "nowledge-co/mem#11441": "20:36: mem#11441，发了 3 次",
} as const;
const OPEN = new Set(["nowledge-co/mem#11393", "nowledge-co/mem#11408", "mem-backbone#378", "nowledge-co/mem#11441"]);
const SKIP = new Set(["website#562", "nowledge-co/mem#11389"]);
const REF_OF = new Map<string, string>([
  ["bm-562", "website#562"],
  ["bm-11389", "nowledge-co/mem#11389"],
  ["bm-378a", "mem-backbone#378"],
  ["bm-378b", "mem-backbone#378"],
  ["bm-378c", "mem-backbone#378"],
  ["bm-11441a", "nowledge-co/mem#11441"],
  ["bm-11441b", "nowledge-co/mem#11441"],
  ["bm-11441c", "nowledge-co/mem#11441"],
]);

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
  clock.t = Date.parse("2026-11-25T17:50:00Z");
  const fc = fakeCore(clock, tmp());
  const fr = fakeRunner(script);
  fr.bindCards(fc.cards);
  const helpers = createHelpers({
    dataDir: fc.core.dataDir,
    partnerName: () => "Ducter",
    home: () => "hel",
    link: () => ({
      async connectAs(agentId) {
        return { ok: true, context: `${agentId}-on-hel`, connectionId: `c-${agentId}`, spaceId: "personal-1" };
      },
      async revokeConnection() {
        return true;
      },
    }),
  });
  (fc.core as { helpers?: unknown }).helpers = helpers;
  const peers: { reach: "own"; trusted: string[]; muted: string[]; allowed?: string[] } = { reach: "own", trusted: [], muted: [] };
  (fc.core as { settings?: unknown }).settings = { get: () => ({ peers }), setPeers: (p: Partial<typeof peers>) => Object.assign(peers, p), setForgetter() {}, setMemState() {} };
  const made = helpers.make({ name: HELPER, about: "PRs on nowledge-co/mem my agents hand over", brief: "Own each PR to the end: an independent review subagent, fix or send rework back, then /lgtm on Prow/Tide repos; never merge by hand." });
  if (!made.ok) throw new Error("helper not made");
  await helpers.tick();
  const main = box();
  const hb = box();
  const partner = createPartner(fc.core, fr.runner, { now: clock.now, persistState: false, settleMs: 0, onError: (e: unknown) => console.error(e), memory: fakeMemory([]).memory, bridge: main.bridge, helperBridge: () => hb.bridge, bridgeIntervalMs: 0, bridgeRecoverMs: 0, bridgeStartMark: false, stallEveryMs: 10 });
  const card = (taskId: string, title: string) => {
    const c: TaskCard = { taskId, persona: "p1", title, project: "", place: { kind: "none" }, harness: "antigravity", attention: "working", residency: "hot", openedAt: "", updatedAt: "" } as TaskCard;
    fc.cards.set(taskId, c);
  };
  card("m2uifpyn", "用 agy 处理 Mem #11390 并准备 PR 交接");
  card("dev2", "mem #11408 修复");
  card("mem-backbone", "mem-backbone #378");
  card("pr11441", "修复 Plus 年付额度卡");
  card("website", "官网 #562");
  const agentMessage = (args: unknown, taskId: string) => {
    const t = fc.tools.get("task:agent_message");
    if (!t) throw new Error("no agent_message");
    return t.handler(args, { role: "task", taskId }) as Promise<any>;
  };
  const said = () => fc.events.filter((e) => e.kind === "ai_msg").map((e) => e.body as Bodies["ai_msg"]);
  return { clock, fc, fr, partner, helpers, hb, main, agentMessage, said };
}

describe("D609: hel's 11-24→26 hand-offs, replayed", () => {
  test("each ends as one record, taken or said unclaimed once; the 3× resends merge", async () => {
    const opened: string[] = [];
    const t = await setup(async (input, s) => {
      const current = input.split("</conversation_so_far>").pop() ?? input;
      const m = current.match(/message ((?:bm|local)-[\w-]+)/);
      const localRef = current.match(/请接手 ([\w./-]+#\d+)/)?.[1];
      const ref = m ? REF_OF.get(m[1]!) ?? localRef : localRef;
      if (m && ref && OPEN.has(ref) && !opened.includes(ref)) {
        opened.push(ref);
        await t.fc.callTool("task_open", { title: `接手 ${ref}`, brief: `nowledge-co/mem ${ref}: own it to the end; /lgtm once it holds.`, forMessage: m[1] });
      }
      s.end();
    });
    const { clock, fc, fr, partner, helpers, hb, agentMessage, said } = t;
    const h = helpers.list().find((x) => x.name === HELPER)!;
    const records = () => fc.core.handoffs?.all() ?? [];

    // A helper's old outcome on the same home, which a task's hand-off came back under (11-25 #562).
    fc.core.log.append({ stream: "channel", origin: "partner", kind: "bridge_msg", body: { direction: "out", messageId: "r-web-old", inReplyTo: "bm-old", helper: h.id, to: "Ducter", text: "PR #11070 merged.", taskId: "t-old", state: "sent" } });
    hb.deliver({ messageId: "bm-562", from: "Ducter", agent: "Ducter", mine: true, inReplyTo: "r-web-old", text: "请接手 website#562：评审最新提交，OK 就 /lgtm。" });
    await partner.checkBridge();
    await partner.idle();
    await settle();
    expect(records().find((r) => r.item.ref === "website#562")).toMatchObject({ state: "given" });

    // The 11-25 hand-off nobody took is said unclaimed once, that evening (not 26 hours later).
    clock.advance(11 * 60_000);
    await settle(80);
    expect(said().filter((x) => x.stalled)).toHaveLength(1);
    expect(said().find((x) => x.stalled)?.text).toContain("website#562");
    expect(records().find((r) => r.item.ref === "website#562")).toMatchObject({ state: "unclaimed" });

    // 16:31 the next day: a dev task hands mem#11393 on this home (a local arrival, never through Mem).
    clock.advance(22 * 3_600_000 + 30 * 60_000);
    const r1 = await agentMessage({ to: "PR Babysitter", text: "请接手 nowledge-co/mem#11393：最新提交要独立会话评审，通过后只评论 /lgtm。" }, "m2uifpyn");
    expect(r1).toMatchObject({ ok: true, handed: true, taken: false });
    await partner.idle();
    await settle();
    expect(records().find((r) => r.item.ref === "nowledge-co/mem#11393")).toMatchObject({ state: "taken" });

    // 17:02: another dev task, mem#11408.
    clock.advance(31 * 60_000);
    expect(await agentMessage({ to: "PR Babysitter", text: "请接手 nowledge-co/mem#11408：三处行为回归、两个 CI 失败。" }, "dev2")).toMatchObject({ ok: true, handed: true, taken: false });
    await partner.idle();
    await settle();
    expect(records().find((r) => r.item.ref === "nowledge-co/mem#11408")).toMatchObject({ state: "taken" });

    // 19:12: the dev-team hand-off: read while its sender is muted, then let in (D604).
    clock.advance(2 * 3_600_000 + 10 * 60_000);
    (t.fc.core as { settings: { get(): { peers: { muted: string[] } } } }).settings.get().peers.muted.push(TEAM.from);
    hb.deliver({ ...TEAM, messageId: "bm-11389", text: "请接手 nowledge-co/mem#11389：三处行为回归、两个 CI 失败，验收要求见 PR 描述。" });
    await partner.checkBridge();
    await partner.idle();
    await settle();
    expect(records().find((r) => r.item.ref === "nowledge-co/mem#11389")).toBeUndefined();
    const p = (t.fc.core as { settings: { get(): { peers: { muted: string[]; allowed?: string[] } } } }).settings.get().peers;
    p.muted = [];
    p.allowed = [TEAM.from];
    await partner.checkBridge();
    await partner.idle();
    await settle();
    expect(records().find((r) => r.item.ref === "nowledge-co/mem#11389")).toMatchObject({ state: "given" });

    // 20:20–20:36: two items sent 3× each, before anything answered.
    clock.advance(3 * 3_600_000 + 20 * 60_000);
    const resend = async (ids: [string, string, string], text: string) => {
      for (const id of ids) {
        hb.deliver({ messageId: id, from: "Ducter", agent: "Ducter", mine: true, text });
        await partner.checkBridge();
        await partner.idle();
        await settle();
      }
    };
    await resend(["bm-378a", "bm-378b", "bm-378c"], "请接手 mem-backbone#378：CI 红了，跟到能合并。");
    clock.advance(16 * 60_000);
    await resend(["bm-11441a", "bm-11441b", "bm-11441c"], "请接手 nowledge-co/mem#11441：Plus 年付额度卡的日期要修。");

    // Ten minutes after the first untaken one: said once, each, to the person.
    clock.advance(11 * 60_000);
    await settle(80);
    const stalled = said().filter((x) => x.stalled);
    expect(stalled).toHaveLength(2);
    expect(stalled[0]!.text).toContain("还没有任务接手");
    expect(stalled[1]!.text).toContain("还没有任务接手");
    clock.advance(30 * 60_000);
    await settle(80);
    expect(said().filter((x) => x.stalled)).toHaveLength(2);

    // Exactly one record per item: the 3× resends are one id, with two added words.
    for (const [ref, why] of Object.entries(ITEMS)) {
      const rs = records().filter((r) => r.item.ref === ref);
      expect({ ref, why, ids: new Set(rs.map((r) => r.handoffId)).size }).toEqual({ ref, why, ids: 1 });
      const rec = rs.at(-1)!;
      if (SKIP.has(ref)) {
        expect(rec.state).toBe("unclaimed");
        expect(rec.unclaimedAt).toBeTruthy();
        const line = said().find((x) => x.stalled === rec.handoffId);
        expect(line?.text).toContain(`交给「${HELPER}」的`);
        continue;
      }
      expect(rec.state).toBe("taken");
      expect(rec.taskId).toBeTruthy();
    }
    for (const ref of ["mem-backbone#378", "nowledge-co/mem#11441"]) {
      const rec = records().find((r) => r.item.ref === ref)!;
      expect(rec.messages).toHaveLength(3);
      expect(rec.adds).toHaveLength(2);
      expect(opened.filter((x) => x === ref)).toHaveLength(1);
    }

    // Never silent: a taken local hand-off is said into the task that gave it; a Mem one in its Space.
    expect(fr.sent.some((x) => x.taskId === "m2uifpyn" && /answered your hand-off/.test(x.text))).toBe(true);
    expect(hb.replies.some((x) => x.messageId === "bm-378a" || x.messageId === "bm-378b" || x.messageId === "bm-378c")).toBe(true);

  }, 40_000);
});
