// D604: a helper receives in every Space the person is in, and the home knows it; a teammate's hand-off
// to it is never lost to a card answered with words. hel, 2026-11-26: Hawkingrei's agent handed
// mem#11389 to 「Nowledge Mem PR Babysitter」 in dev team; the home read it (the identity inbox covers
// all eight Spaces) and logged it muted, because on 11-25 the person had answered that agent's first
// card with their own words ("reply"), which was taken as 不理. The partner then said nothing came and
// couldn't say where the helper receives. Fakes only: an in-process Bridge per address, a stub nmem.
import { describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bodies } from "../../protocol/src/index.ts";
import { createHelpers } from "../../core/src/helpers.ts";
import { createNmemBridge } from "../src/bridge.ts";
import { createPartner, renderHelpers, type BridgeClient, type BridgeMessage } from "../src/index.ts";
import { FakeClock, fakeCore, fakeMemory, fakeRunner, type Script } from "./fakes.ts";

const tmp = () => mkdtempSync(join(tmpdir(), "ducter-d604-"));
const settle = () => new Promise((r) => setTimeout(r, 20));
const SPACES = [
  { id: "personal-1", label: "Only me" },
  { id: "all", label: "Everyone" },
  { id: "dev-team", label: "dev team" },
];

function box(inbox: BridgeMessage[] = []) {
  const replies: { messageId: string; text: string }[] = [];
  const mail = [...inbox];
  const bridge: BridgeClient = {
    async check(known) {
      return { ok: true, messages: mail.filter((m) => !known.has(m.messageId)), receives: SPACES };
    },
    async reply(messageId, text) {
      replies.push({ messageId, text });
      return { ok: true, messageId: `r-${replies.length}`, operation: `op-${replies.length}` };
    },
  };
  return { bridge, replies, deliver: (m: BridgeMessage) => mail.push(m) };
}

// The colleague's agent as hel logged it: unnamed (Mem's generic "Bridge agent"), in dev team.
const TEAM = { from: "AI agent (dev team)", space: "dev-team", spaceLabel: "dev team", shared: true } as const;
const HELLO: BridgeMessage = { ...TEAM, messageId: "bm-hello", text: "你好，我是 Hawkingrei 这边的 Bridge 助手。想同步一下：你目前在推进哪些工作？" };
const HANDOFF: BridgeMessage = { ...TEAM, messageId: "bm-11389", text: "请接手 nowledge-co/mem#11389：三处行为回归、两个 CI 失败，验收要求见 PR 描述。" };

function setup(script: Script, mail: BridgeMessage[] = []) {
  const clock = new FakeClock();
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
  const main = box();
  const hb = box(mail);
  const partner = createPartner(fc.core, fr.runner, { now: clock.now, persistState: false, settleMs: 0, onError: (e: unknown) => console.error(e), memory: fakeMemory([]).memory, bridge: main.bridge, helperBridge: () => hb.bridge, bridgeIntervalMs: 0, bridgeRecoverMs: 0 });
  const inputs = () => fr.sessions.flatMap((s) => s.inputs).join("\n");
  const ins = () => fc.events.filter((e) => e.kind === "bridge_msg" && (e.body as Bodies["bridge_msg"]).direction === "in").map((e) => e.body as Bodies["bridge_msg"]);
  const cards = () => fc.events.filter((e) => e.kind === "decision" && (e.body as Bodies["decision"]).sender).map((e) => e.body as Bodies["decision"]);
  const answer = (decisionId: string, option: "go" | "hold" | "reply", text?: string) =>
    partner.onTrigger(fc.core.log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId, option, by: "user", ...(text ? { text } : {}) } }));
  return { fc, fr, partner, helpers, hb, peers, inputs, ins, cards, answer };
}

async function babysitter(helpers: ReturnType<typeof createHelpers>) {
  const made = helpers.make({ name: "Nowledge Mem PR Babysitter", about: "用 Codex 接手 Nowledge Mem 的 PR", brief: "" });
  if (!made.ok) throw new Error("not made");
  await helpers.tick();
  await settle();
  return made.helper;
}

describe("D604: where a helper receives, and a teammate's hand-off to it", () => {
  test("its receiving Spaces are kept from Mem's identity inbox and are a fact in [helpers]", async () => {
    const t = setup(async (_i, s) => s.end());
    const h = await babysitter(t.helpers);
    await t.partner.checkBridge();
    expect(t.helpers.get(h.id)?.spaces).toEqual(SPACES);
    expect(t.helpers.views(() => ({ open: 0, week: 0 }))[0]?.spaces).toEqual(["Only me", "Everyone", "dev team"]);
    const line = renderHelpers(t.helpers.list(), () => [], "zh");
    expect(line).toContain('receives in 3 Spaces, every one the user is in: "Only me", "Everyone", "dev team"');
    expect(line).toContain("it replies in the Space a message came from");
    // Read again with the same Spaces: nothing rewritten.
    let writes = 0;
    const off = t.helpers.onChange(() => writes++);
    await t.partner.checkBridge();
    off();
    expect(writes).toBe(0);
  }, 20_000);

  test("a card answered with words lets the sender through: nothing muted, its message read with the person's words", async () => {
    const t = setup(async (_i, s) => s.end(), [HELLO]);
    await babysitter(t.helpers);
    await t.partner.checkBridge();
    await t.partner.idle();
    expect(t.ins().map((b) => [b.messageId, b.state ?? "read", b.helper, b.space])).toEqual([["bm-hello", "held", "nowledge-mem-pr-babysitter", "dev-team"]]);
    // The card names the helper it was written to, not the partner.
    expect(t.cards()[0]!.question.split("\n")[0]).toBe("dev team 里一个没留名字的 agent 想找 Nowledge Mem PR Babysitter：");
    t.answer(t.cards()[0]!.decisionId, "reply", "你可以说一下，wey 还没把日常主动开发放到 ducter");
    await t.partner.idle();
    expect(t.peers.muted).toEqual([]);
    expect(t.peers.allowed).toEqual(["AI agent (dev team)"]);
    const again = t.ins().find((b) => b.messageId === "bm-hello" && !b.state)!;
    expect(again.told).toBe("你可以说一下，wey 还没把日常主动开发放到 ducter");
    expect(t.inputs()).toContain('[message to your helper "Nowledge Mem PR Babysitter"');
    expect(t.inputs()).toContain("The user let this agent through on its card and told you");
    // Its hand-off the next day comes straight through, to the helper, in dev team.
    t.hb.deliver(HANDOFF);
    await t.partner.checkBridge();
    await t.partner.idle();
    expect(t.ins().find((b) => b.messageId === "bm-11389")).toMatchObject({ helper: "nowledge-mem-pr-babysitter", space: "dev-team" });
    expect(t.ins().find((b) => b.messageId === "bm-11389")!.state).toBeUndefined();
    expect(t.inputs()).toContain("nowledge-co/mem#11389");
  }, 20_000);

  test("不理 still mutes; the muted mail is a fact in [helpers]; 恢复 reads it again from Mem", async () => {
    const t = setup(async (_i, s) => s.end(), [HELLO]);
    const h = await babysitter(t.helpers);
    await t.partner.checkBridge();
    t.answer(t.cards()[0]!.decisionId, "hold");
    await t.partner.idle();
    expect(t.peers.muted).toEqual(["AI agent (dev team)"]);
    t.hb.deliver(HANDOFF);
    await t.partner.checkBridge();
    await t.partner.idle();
    expect(t.ins().find((b) => b.messageId === "bm-11389")).toMatchObject({ state: "muted", text: "" });
    // The partner's facts say it came and why it wasn't read, so 「为什么没收到」 has a true answer.
    const sessions = t.fr.sessions.length;
    t.partner.onTrigger(t.fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "为什么我同事通过 bridge 发过来的 baby sitting 请求，我们没收到哈" } }));
    await t.partner.idle();
    const asked = t.fr.sessions.slice(sessions > 0 ? sessions - 1 : 0).flatMap((s) => s.inputs).join("\n");
    expect(asked).toContain('mail to it not read: from AI agent (dev team) in "dev team"');
    expect(asked).toContain("the user chose 不理 for that sender");
    // 恢复 in Settings: the sender isn't muted any more; what came while muted is read from Mem again.
    t.peers.muted = [];
    await t.partner.checkBridge();
    await t.partner.idle();
    const read = t.ins().filter((b) => b.messageId === "bm-11389");
    expect(read.map((b) => b.state ?? "read")).toEqual(["muted", "read"]);
    expect(read[1]).toMatchObject({ helper: h.id, space: "dev-team" });
    expect(t.inputs()).toContain("nowledge-co/mem#11389");
  }, 20_000);

  test("hel's state before D604 (a card answered with words, the sender muted, its hand-off logged muted) is repaired once", async () => {
    const t = setup(async (_i, s) => s.end());
    const h = await babysitter(t.helpers);
    // Mem still has both (it keeps mail 7 days); the Log has them as hel did.
    t.hb.deliver(HELLO);
    t.hb.deliver(HANDOFF);
    const log = t.fc.core.log;
    log.append({ stream: "channel", origin: "peer", kind: "bridge_msg", body: { direction: "in", ...HELLO, helper: h.id, state: "held" } });
    const card = log.append({ stream: "channel", origin: "partner", kind: "decision", body: { decisionId: "d-hel", question: "dev team 里一个没留名字的 agent 想找 Ducter：\n「你好…」", goLabel: "答应", holdLabel: "不理", defaultOption: "hold", reversible: false, sender: { from: TEAM.from, space: TEAM.space, messageId: HELLO.messageId } } });
    expect(card.seq).toBeGreaterThan(0);
    log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: "d-hel", option: "reply", by: "user", text: "你可以说一下，其他你根据实际情况回答吧" } });
    t.peers.muted = [TEAM.from];
    log.append({ stream: "channel", origin: "peer", kind: "bridge_msg", body: { direction: "in", messageId: HANDOFF.messageId, from: TEAM.from, helper: h.id, space: "dev-team", spaceLabel: "dev team", text: "", state: "muted" } });
    await t.partner.checkBridge();
    await t.partner.idle();
    expect(t.peers.muted).toEqual([]);
    expect(t.peers.allowed).toEqual([TEAM.from]);
    expect(t.ins().filter((b) => b.messageId === HANDOFF.messageId).map((b) => b.state ?? "read")).toEqual(["muted", "read"]);
    expect(t.ins().find((b) => b.messageId === HELLO.messageId && !b.state)?.told).toBe("你可以说一下，其他你根据实际情况回答吧");
    // Once: a later 不理 the person says is kept.
    t.peers.muted = [TEAM.from];
    await t.partner.checkBridge();
    expect(t.peers.muted).toEqual([TEAM.from]);
  }, 20_000);
});

describe("D604: the nmem client says which Spaces a mailbox was read in", () => {
  test("the identity inbox's observed Spaces, labelled from passive `bridge setup`; an unavailable one is left out", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ducter-d604-nmem-"));
    const inbox = {
      identity: "ducter-helper-nowledge-mem-pr-babysitter",
      coverage_scope: "observed_spaces",
      spaces: [
        { space_id: "personal-1", status: "observed", next_cursor: null, outgoing: [] },
        { space_id: "dev-team", status: "observed", next_cursor: null, outgoing: [] },
        { space_id: "codex", status: "unavailable", error_code: "cloud_bridge_space_unavailable" },
      ],
      messages: [],
      next: null,
    };
    const setup = { candidates: [{ id: "personal-1", label: "Only me", kind: "personal" }, { id: "dev-team", label: "dev team", kind: "team" }, { id: "codex", label: "Codex", kind: "team" }] };
    const data = join(dir, "data.json");
    writeFileSync(data, JSON.stringify({ inbox, setup }));
    const bin = join(dir, "nmem");
    writeFileSync(
      bin,
      `#!/usr/bin/env bun
const d = JSON.parse(require("node:fs").readFileSync(${JSON.stringify(data)}, "utf8"));
const a = process.argv.slice(2);
if (a.includes("--version")) { console.log("nmem 0.10.123"); process.exit(0); }
if (a.includes("--help")) { console.log("List incoming identity mail across currently authorized Spaces\\n  --wait <SECONDS>  Wait up to five seconds"); process.exit(0); }
const v = a.indexOf("bridge");
const verb = v >= 0 ? a.slice(v + 1).find((x) => !x.startsWith("-")) : undefined;
if (verb === "inbox") { console.log(JSON.stringify(d.inbox)); process.exit(0); }
if (verb === "setup") { console.log(JSON.stringify(d.setup)); process.exit(0); }
console.log("{}");
`,
    );
    chmodSync(bin, 0o755);
    const b = createNmemBridge({ context: "ducter-helper-x", places: [{ context: "ducter-helper-x", spaceId: "personal-1", spaceLabel: "Only me", kind: "personal" }], bin, me: "m-weyl", env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "" }, retryDelaysMs: [] });
    const r = await b.check(new Set());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.receives).toEqual([
      { id: "personal-1", label: "Only me" },
      { id: "dev-team", label: "dev team" },
    ]);
  }, 20_000);
});
