// D418: the person's own agent's contact tests on hel (2026-11-20, VERIFIED from hel's Log, read only).
// The author's own Codex ("我是 Wey 的 Mem 协作 Codex") sent three contact tests days apart in the
// Space Everyone; all three arrived together at 06:24:51Z, each shown as 「一个没留名字的 agent 发来请求」
// under a 「第一次」 note; the partner asked Go to answer them, though the author had said on 11-17
// 「用 Bridge 查看来信，回复 Mem 协作 Codex 的联络测试。」; after the Go at 08:06Z (and a restart at
// 07:27Z for 0.1.0) each reply went "sending" → "unknown" in about 3 s with no message id, and none
// is in either Space's outbox (VERIFIED read-only with `bridge outbox` / `inspect`). The bodies and
// Mem's shapes below are hel's and the trial's own (ids and references shortened). Stubs and fakes only.
import { describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ownAgentSelf, pingOf } from "../../protocol/src/peer-self.ts";
import { createNmemBridge, createPartner, type Bodies, type BridgeClient, type BridgeMessage, type BridgeOp } from "../src/index.ts";
import { opOf, MEM_TTL_MS } from "../src/bridge.ts";
import { pingLine, whoForModel, whoForUser } from "../src/bridge-out.ts";
import { FakeClock, fakeCore, fakeMemory, fakeRunner } from "./fakes.ts";

const tmp = () => mkdtempSync(join(tmpdir(), "ducter-bridge-own-test-"));
const DAY = 86_400_000;

// hel's three, word for word (seq 31295–31297).
const T1 = "你好 Ducter，我是 Wey 的 Mem 协作 Codex。Wey 请我通过 Bridge 联系你，验证实际通信。请直接回复这条消息：“Ducter 已收到 3590a347df”，并简短说明你当前是否正在运行。这只是联络测试，不授权改文件、配置、身份或凭据。";
const T2 = "Ducter 你好，Wey 已清理重复的 Bridge 连接，请我重新发送联络测试。请直接回复此消息：“Ducter 已收到清理后测试 635e8a48”。这是新的一次测试，不是重发旧消息；无需执行其他任务或修改配置。我是 Wey 的 Mem 协作 Codex。";
const T3 = "Ducter 你好，我是 Wey 的 Mem 协作 Codex。Wey 请我再次测试通信。请直接回复此消息：“Ducter 已收到 a1a25536”。仅为联络测试，不需要修改配置或执行其他任务。";
// hel seq 16022 (iMessage, 2026-11-17 07:35Z).
const SAID = "用 Bridge 查看来信，回复 Mem 协作 Codex 的联络测试。";

describe("D418: an own agent by its own words, and what a contact test is", () => {
  test("hel's three name their sender and ask only for an acknowledgement", () => {
    for (const t of [T1, T2, T3]) expect(ownAgentSelf(t)).toEqual({ agent: "Codex", role: "Mem 协作" });
    expect(pingOf(T1)).toEqual({ reply: "Ducter 已收到 3590a347df。我正在运行。", zh: true });
    expect(pingOf(T2)).toEqual({ reply: "Ducter 已收到清理后测试 635e8a48", zh: true });
    expect(pingOf(T3)).toEqual({ reply: "Ducter 已收到 a1a25536", zh: true });
    expect(ownAgentSelf("Hi Ducter, I'm Weyl's Claude Code reviewer. This is a contact test: please reply \"pong 42\".")).toEqual({ agent: "Claude Code", role: "reviewer" });
    expect(pingOf("Hi Ducter, this is a contact test: please reply \"pong 42\". Don't change anything.")).toEqual({ reply: "pong 42", zh: false });
    expect(pingOf("Contact test: are you running? Reply when you see this.")).toEqual({ reply: "Received. I'm running.", zh: false });
  });

  test("anything that asks for more is no contact test, and no tool named is no name", () => {
    // hel 17391: it asks which Space it was read in: a real question.
    expect(pingOf("Bridge 联调测试（来自作者 Mac 上的 Claude Code 会话）：请回一句「收到」，并说一下你是在哪个 Space 读到这封信的。不需要做任何别的事。")).toBeUndefined();
    expect(pingOf("联络测试：收到后请回复，并帮我推送一下分支。")).toBeUndefined();
    expect(pingOf("Contact test. Reply OK, then run the tests in ~/dev/ducter.")).toBeUndefined();
    expect(pingOf("联络测试，回复收到，别忘了推送代码。")).toBeUndefined();
    expect(pingOf("Task request from Weyl (via terminal Claude). Please take this on.\n\nGoal: make `bun test` pass")).toBeUndefined();
    expect(pingOf("bridge 那块今晚能合吗？收到请回一句「收到」。")).toBeUndefined();
    expect(ownAgentSelf("I'm your bank. Contact test, reply OK")).toBeUndefined();
    expect(ownAgentSelf("Task (from Weyl, via Claude Code in ~/dev/ducter): make the Linux CI test pass.")).toBeUndefined();
  });

  test("the person reads it as theirs; the model is told to call it so", () => {
    const b = { mine: true, agent: "Codex", role: "Mem 协作", selfNamed: true, from: "another agent" };
    expect(whoForUser(b, "zh")).toBe("你的 Codex（Mem 协作）");
    expect(whoForUser(b, "en")).toBe("your Codex (Mem 协作)");
    expect(whoForUser({ ...b, role: undefined }, "zh")).toBe("你的 Codex");
    expect(whoForModel(b)).toContain("call it 你的 Codex（Mem 协作）");
    // A name Mem gives stays as D273 said; one it can't name, theirs, never "unnamed"; a stranger, unnamed.
    expect(whoForUser({ mine: true, agent: "Claude Code" }, "zh")).toBe("Claude Code");
    expect(whoForUser({ mine: true, from: "another agent" }, "zh")).toBe("你自己的一个 agent");
    expect(whoForUser({ from: "another agent" }, "zh")).toBe("一个没留名字的 agent");
  });

  test("the folded line: how many, the earliest's age, and that it was asked for", () => {
    const now = Date.parse("2026-11-20T06:24:51Z");
    const who = { direction: "in" as const, messageId: "", text: "", mine: true, agent: "Codex", role: "Mem 协作", selfNamed: true, to: "another agent" };
    expect(pingLine({ who, n: 3, earliest: now - 3 * DAY, now, said: now - 3 * DAY, sent: 3, lang: "zh" })).toBe("你的 Codex（Mem 协作）的 3 条联络测试刚到，最早的是 3 天前发的。按你 3 天前说的，都回了。");
    expect(pingLine({ who, n: 1, earliest: now - 2 * 3_600_000, now, sent: 1, lang: "zh" })).toBe("你的 Codex（Mem 协作）的联络测试刚到，是 2 小时前发的。回了。");
    expect(pingLine({ who, n: 3, earliest: now - 3 * DAY, now, sent: 2, lang: "zh" })).toBe("你的 Codex（Mem 协作）的 3 条联络测试刚到，最早的是 3 天前发的。回了 2 条，1 条没回成：Nowledge Mem 没收下。");
    expect(pingLine({ who, n: 3, earliest: now - 3 * DAY, now, said: now - 3 * DAY, sent: 3, lang: "en" })).toBe("3 contact tests from your Codex (Mem 协作) just arrived; the earliest was sent 3 days ago. I answered them all, as you asked 3 days ago.");
  });
});

// ---------- nmem 0.10.121's real shapes, through a stub binary ----------

const REF = (id: string) => `bm1:eyJ${id}`;
const API = "--api-url=https://cloud.nowledge.co/remote-api";
const entry = (id: string, sentMs: number) => ({
  message: id,
  mine: true,
  state: "pending",
  eligible: true,
  expires_at_ms: sentMs + MEM_TTL_MS,
  sequence: 1,
  sender: { actor_id: "a-1", member: "Member 4e742092", agent: "Bridge agent", agent_id: "bridge-9e18" },
  in_reply_to: null,
  space_id: "all",
  reference: REF(id),
  open_args: ["nmem", API, "--agent-context=ducter", "bridge", "open", REF(id)],
  reply_args_prefix: ["nmem", API, "--agent-context=ducter", "bridge", "reply", REF(id)],
});
// The trial's raw 020: what `reply` by Mem's argv answers.
const REPLIED = { message: "804869d4-d37e", status: "delivered", delivery_state: "queued", read_state: "unknown", reply_state: "not_observed", work_state: "unknown", operation: "bo1:eyJop", outgoing: [{ message: "804869d4-d37e", status: "delivered", read_recipients: 0, recipients: 1 }], status_observed_at_us: 1795143839946686, outcome_unknown: false, space_id: "all" };

function memStub(sentMs: number) {
  const dir = tmp();
  const bin = join(dir, "nmem");
  const log = join(dir, "argv.log");
  const inbox = { messages: [entry("64cfcf0d", sentMs)], spaces: [{ space_id: "all", status: "observed", next_cursor: "", outgoing: [] }], next: null, incomplete: false, outcome_unknown: false, identity: "ducter" };
  const open = { message: "64cfcf0d", body: T1, reply_to: "64cfcf0d", sender: { actor_id: "a-1", member: "Member 4e742092", agent: "Bridge agent", agent_id: "bridge-9e18" }, in_reply_to: null, outgoing: [], status_observed_at_us: 1, outcome_unknown: false, space_id: "all" };
  // hel's personal outbox (2026-11-20, read only): ops with a phase only; inspect has the rest.
  const outbox = { operations: [{ operation: "bo1:old1", phase: "accepted" }, { operation: "bo1:old2", phase: "accepted" }], next: null, outgoing: [], status_observed_at_us: 1, outcome_unknown: false, space_id: "personal-4e742092" };
  const inspect = { operation: "bo1:old1", source: "server_original", body: "The user chose: «现在推送»", contacts: ["bc1:x"], reply_to: "fbf28de8", outgoing: [], outcome_unknown: false };
  writeFileSync(join(dir, "inbox.json"), JSON.stringify(inbox));
  writeFileSync(join(dir, "open.json"), JSON.stringify(open));
  writeFileSync(join(dir, "replied.json"), JSON.stringify(REPLIED));
  writeFileSync(join(dir, "outbox.json"), JSON.stringify(outbox));
  writeFileSync(join(dir, "outbox-all.json"), JSON.stringify({ operations: [], next: null, outgoing: [], outcome_unknown: false, space_id: "all" }));
  writeFileSync(join(dir, "inspect.json"), JSON.stringify(inspect));
  writeFileSync(
    bin,
    `#!/bin/sh
echo "$*" >> ${log}
case "$*" in
  "--json --version") echo "nmem 0.10.121" ;;
  *"bridge inbox --help"*) echo "List incoming identity mail across currently authorized Spaces"; echo "      --watch   Observe incoming changes continuously as JSON lines" ;;
  *"agents context show"*) echo '{"selection":{"scope":{"space_id":"personal-4e742092"},"address":{"custodian_id":"4e742092"}}}' ;;
  *"bridge setup"*) echo '{"candidates":[{"id":"all","label":"Everyone","kind":"shared"}]}' ;;
  *"bridge inbox"*) cat ${dir}/inbox.json ;;
  *"bridge open ${REF("64cfcf0d")}"*) cat ${dir}/open.json ;;
  *"bridge reply ${REF("64cfcf0d")}"*) cat > /dev/null; cat ${dir}/replied.json ;;
  *"bridge reply"*) cat > /dev/null; echo "error: Reply to a message reference from your identity inbox" >&2; exit 1 ;;
  *"--resolved-space-id all outbox"*) cat ${dir}/outbox-all.json ;;
  *"bridge outbox"*) cat ${dir}/outbox.json ;;
  *"bridge inspect"*) cat ${dir}/inspect.json ;;
  *) echo "unexpected $*" >&2; exit 9 ;;
esac
`,
  );
  chmodSync(bin, 0o755);
  return { bin, argv: () => readFileSync(log, "utf8").trim().split("\n") };
}

describe("D418: nmem 0.10.121's shapes (a stub with the real answers)", () => {
  test("the entry is read as the person's own Codex, with Mem's route and when it was sent", async () => {
    const sent = Date.parse("2026-11-17T08:00:00Z");
    const s = memStub(sent);
    const r = await createNmemBridge({ context: "ducter", bin: s.bin, env: {}, me: "4e742092" }).check(new Set());
    expect(r.ok).toBe(true);
    const m = (r as { messages: BridgeMessage[] }).messages[0]!;
    // D470 round 2 (hel, 2026-11-22): logged by the known name, never "another agent".
    expect(m.from).toBe("Codex");
    expect(m).toMatchObject({ messageId: "64cfcf0d", mine: true, agent: "Codex", role: "Mem 协作", selfNamed: true, space: "all", spaceLabel: "Everyone", sentAt: new Date(sent).toISOString(), linked: true });
    expect(m.route).toEqual([API, "--agent-context=ducter", "bridge", "reply", REF("64cfcf0d")]);
  });

  test("a reply after a restart goes Mem's way: the route kept in the Log, else the inbox read again; its message id is confirmed", async () => {
    const s = memStub(Date.now() - DAY);
    // A fresh client (as after hel's 07:27 restart): no map of routes. With the kept route: straight there.
    const c1 = createNmemBridge({ context: "ducter", bin: s.bin, env: {} });
    expect(await c1.reply("64cfcf0d", "Ducter 已收到 3590a347df。", "all", [API, "--agent-context=ducter", "bridge", "reply", REF("64cfcf0d")])).toEqual({ ok: true, messageId: "804869d4-d37e", operation: "bo1:eyJop" });
    expect(s.argv().at(-1)).toBe(`--json ${API} --agent-context=ducter bridge reply ${REF("64cfcf0d")} --body-file -`);
    // Without it (an event logged before D418): once the shape is known, the inbox gives the route again.
    const c2 = createNmemBridge({ context: "ducter", bin: s.bin, env: {} });
    await c2.canWatch!();
    expect(await c2.reply("64cfcf0d", "Ducter 已收到 a1a25536", "all")).toMatchObject({ ok: true, messageId: "804869d4-d37e" });
    const calls = s.argv();
    expect(calls.at(-2)).toBe("--json --agent-context ducter bridge inbox");
    expect(calls.at(-1)).toContain(`bridge reply ${REF("64cfcf0d")} --body-file -`);
    expect(calls.some((a) => a.endsWith("bridge reply --body-file - 64cfcf0d"))).toBe(false);
  });

  test("a reply Mem turns down is failed, not unknown; a call cut off is unknown", async () => {
    const dir = tmp();
    const bin = join(dir, "nmem");
    writeFileSync(bin, `#!/bin/sh\ncat >/dev/null\ncase "$*" in\n  *"bm-plain"*) echo '{"error":"message reference not found","outcome_unknown":false}'; exit 1 ;;\n  *"bm-usage"*) echo "error: unexpected argument '--x' found" >&2; exit 2 ;;\n  *"bm-slow"*) exec sleep 8 ;;\nesac\n`);
    chmodSync(bin, 0o755);
    const c = createNmemBridge({ context: "ducter", bin, env: {}, timeoutMs: 500 });
    expect(await c.reply("bm-plain", "x")).toMatchObject({ ok: false, reason: "refused" });
    expect(await c.reply("bm-usage", "x")).toMatchObject({ ok: false, reason: "refused" });
    expect(await c.reply("bm-slow", "x")).toMatchObject({ ok: false, reason: "unavailable" });
  }, 20_000);

  test("the outbox's ops with a phase only are bare (inspect tells), and Mem's word that it is whole", async () => {
    const s = memStub(Date.now());
    const c = createNmemBridge({ context: "ducter", bin: s.bin, env: {} });
    await c.canWatch!();
    const r = await c.outbox!(["all"]);
    expect(r).toEqual({ ok: true, complete: true, ops: [{ operation: "bo1:old1", state: "pending", bare: true }, { operation: "bo1:old2", state: "pending", bare: true }] });
    expect(s.argv()).toContain("--json --agent-context ducter bridge --resolved-space-id all outbox");
    expect(opOf({ operation: "bo1:old1", source: "server_original", body: "The user chose: «现在推送»", reply_to: "fbf28de8" })).toEqual({ operation: "bo1:old1", state: "unknown", inReplyTo: "fbf28de8", body: "The user chose: «现在推送»" });
  });
});

// ---------- the partner: answered by code, told once, and a stuck reply settled ----------

function rig(client: Partial<BridgeClient>) {
  const clock = new FakeClock();
  clock.t = Date.parse("2026-11-17T07:35:26Z");
  const fc = fakeCore(clock, tmp());
  let turns = 0;
  const fr = fakeRunner(async (_i, s) => {
    turns++;
    s.end();
  });
  fr.bindCards(fc.cards);
  const bridge = { async check() { return { ok: true, messages: [] }; }, async reply() { return { ok: true, messageId: "r" }; }, ...client } as BridgeClient;
  const partner = createPartner(fc.core, fr.runner, { now: clock.now, persistState: false, settleMs: 0, onError: (e: unknown) => console.error(e), memory: fakeMemory([]).memory, bridge, bridgeIntervalMs: 0, bridgeRecoverMs: 0, bridgeStartMark: false });
  const of = (kind: string) => fc.events.filter((e) => e.kind === kind);
  const bm = () => of("bridge_msg").map((e) => e.body as Bodies["bridge_msg"]);
  return { clock, fc, partner, of, bm, turns: () => turns };
}

describe("D418: an own agent's contact tests answered by code, no card", () => {
  const msg = (id: string, text: string, sentAt: string): BridgeMessage => ({ messageId: id, from: "another agent", mine: true, agent: "Codex", role: "Mem 协作", selfNamed: true, linked: true, text, sentAt, space: "all", spaceLabel: "Everyone" });

  test("hel's morning: three late tests, the person's words from 11-17: three replies, one line, no Go", async () => {
    const replies: { id: string; text: string; space?: string }[] = [];
    let box: BridgeMessage[] = [];
    const t = rig({
      async check(known) {
        return { ok: true, messages: box.filter((m) => !known.has(m.messageId)) };
      },
      async reply(id, text, space) {
        replies.push({ id, text, ...(space ? { space } : {}) });
        return { ok: true, messageId: `r-${replies.length}` };
      },
    });
    t.fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: SAID, via: "imessage" } as Bodies["user_msg"] });
    t.clock.t = Date.parse("2026-11-20T06:24:51Z");
    box = [msg("64cfcf0d", T1, "2026-11-17T07:40:00Z"), msg("d34c06fc", T2, "2026-11-18T02:00:00Z"), msg("f37d8df0", T3, "2026-11-19T09:00:00Z")];
    await t.partner.checkBridge();
    await t.partner.idle();
    expect(t.of("decision")).toHaveLength(0);
    expect(t.turns()).toBe(0);
    expect(replies).toEqual([
      { id: "64cfcf0d", text: "Ducter 已收到 3590a347df。我正在运行。", space: "all" },
      { id: "d34c06fc", text: "Ducter 已收到清理后测试 635e8a48", space: "all" },
      { id: "f37d8df0", text: "Ducter 已收到 a1a25536", space: "all" },
    ]);
    const ins = t.bm().filter((b) => b.direction === "in");
    expect(ins.map((b) => b.state)).toEqual(["ping", "ping", "ping"]);
    expect(ins.map((b) => !!b.first)).toEqual([true, false, false]);
    const outs = t.bm().filter((b) => b.direction === "out" && b.state === "sent");
    expect(outs.map((b) => [b.inReplyTo, b.ack, b.messageId])).toEqual([["64cfcf0d", true, "r-1"], ["d34c06fc", true, "r-2"], ["f37d8df0", true, "r-3"]]);
    const said = t.of("ai_msg").map((e) => (e.body as Bodies["ai_msg"]).text);
    expect(said).toEqual(["你的 Codex（Mem 协作）的 3 条联络测试刚到，最早的是 3 天前发的。按你 3 天前说的，都回了。"]);
    // The line stands in for the quiet one: it names the tests it tells about.
    expect((t.of("ai_msg")[0]!.body as Bodies["ai_msg"]).pings).toEqual(["64cfcf0d", "d34c06fc", "f37d8df0"]);
  });

  test("late but not asked for: answered, and only the quiet line says how late", async () => {
    const t = rig({
      async check(known) {
        return { ok: true, messages: [msg("p1", T3, "2026-11-14T07:00:00Z")].filter((m) => !known.has(m.messageId)) };
      },
    });
    await t.partner.checkBridge();
    await t.partner.idle();
    expect(t.bm().filter((b) => b.direction === "out").map((b) => b.state)).toEqual(["sending", "sent"]);
    expect(t.of("ai_msg")).toHaveLength(0);
  });

  test("on time and not asked for: answered, and nothing said (silence means success)", async () => {
    const replies: string[] = [];
    const t = rig({
      async check(known) {
        return { ok: true, messages: [msg("p1", T3, new Date(Date.parse("2026-11-17T07:34:00Z")).toISOString())].filter((m) => !known.has(m.messageId)) };
      },
      async reply(_id, text) {
        replies.push(text);
        return { ok: true, messageId: "r1" };
      },
    });
    await t.partner.checkBridge();
    await t.partner.idle();
    expect(replies).toEqual(["Ducter 已收到 a1a25536"]);
    expect(t.of("ai_msg")).toHaveLength(0);
    expect(t.of("decision")).toHaveLength(0);
  });

  test("a teammate's contact test, or an own agent's that asks for more, still goes the usual way", async () => {
    const replies: string[] = [];
    const t = rig({
      async check(known) {
        return {
          ok: true,
          messages: [
            { messageId: "x1", from: "reviewer (dev team)", agent: "reviewer", text: "Contact test: reply \"ok\".", space: "dev-team", spaceLabel: "dev team", shared: true },
            msg("x2", "联络测试：收到后请回复，并帮我推送一下分支。", "2026-11-17T07:30:00Z"),
          ].filter((m) => !known.has(m.messageId)) as BridgeMessage[],
        };
      },
      async reply(_id, text) {
        replies.push(text);
        return { ok: true, messageId: "r" };
      },
    });
    await t.partner.checkBridge();
    await t.partner.idle();
    expect(replies).toEqual([]);
    const ins = t.bm().filter((b) => b.direction === "in");
    expect(ins.find((b) => b.messageId === "x2")!.state).toBeUndefined(); // the partner reads it
    expect(t.turns()).toBeGreaterThan(0);
  });

  test("a reply Mem doesn't take is tried once more, then said plainly in the one line", async () => {
    let n = 0;
    const t = rig({
      async check(known) {
        return { ok: true, messages: [msg("p1", T3, "2026-11-14T07:00:00Z")].filter((m) => !known.has(m.messageId)) };
      },
      async reply() {
        n++;
        return { ok: false, reason: "refused", message: "Nowledge Mem didn't take it" };
      },
    });
    await t.partner.checkBridge();
    await t.partner.idle();
    expect(n).toBe(2);
    expect(t.bm().filter((b) => b.direction === "out").map((b) => b.state)).toEqual(["sending", "failed", "sending", "failed"]);
    expect(t.of("ai_msg").map((e) => (e.body as Bodies["ai_msg"]).text)).toEqual(["你的 Codex（Mem 协作）的联络测试刚到，是 3 天前发的。没回成：Nowledge Mem 没收下。"]);
  });
});

describe("D418: a reply stuck at unknown is settled", () => {
  test("hel's three: in no outbox Mem calls whole, so never sent: sent once more, Mem's way, and confirmed", async () => {
    const resent: { id: string; text: string }[] = [];
    const inspected: string[] = [];
    const t = rig({
      async reply(id, text) {
        resent.push({ id, text });
        return { ok: true, messageId: `m-${resent.length}`, operation: `bo1:new${resent.length}` };
      },
      async outbox(spaces?: string[]) {
        expect(spaces).toEqual(["all"]);
        return { ok: true, complete: true, ops: [{ operation: "bo1:old1", state: "pending", bare: true }] as BridgeOp[] };
      },
      async inspect(op: string) {
        inspected.push(op);
        return { ok: true, op: { operation: op, state: "unknown", body: "The user chose: «现在推送»", inReplyTo: "fbf28de8" } as BridgeOp };
      },
    });
    const L = t.fc.core.log;
    L.append({ stream: "channel", origin: "peer", kind: "bridge_msg", body: { direction: "in", messageId: "64cfcf0d", from: "another agent", mine: true, text: T1, linked: true, space: "all", spaceLabel: "Everyone" } });
    for (const [id, text, op] of [["64cfcf0d", "Ducter 已收到 3590a347df。我正在运行。", "bo_1"], ["64cfcf0d-b", "Ducter 已收到 a1a25536", "bo_2"]] as const) {
      const base = { to: "another agent", mine: true, space: "all", spaceLabel: "Everyone", text, inReplyTo: id, opId: op, direction: "out" as const, messageId: "" };
      L.append({ stream: "channel", origin: "partner", kind: "bridge_msg", body: { ...base, state: "sending" } });
      L.append({ stream: "channel", origin: "partner", kind: "bridge_msg", body: { ...base, state: "unknown" } });
    }
    await t.partner.checkBridge();
    await t.partner.idle();
    expect(inspected).toEqual(["bo1:old1"]); // looked at once for both
    expect(resent).toEqual([{ id: "64cfcf0d", text: "Ducter 已收到 3590a347df。我正在运行。" }, { id: "64cfcf0d-b", text: "Ducter 已收到 a1a25536" }]);
    const outs = t.bm().filter((b) => b.direction === "out");
    expect(outs.filter((b) => b.state === "failed").map((b) => b.opId)).toEqual(["bo_1", "bo_2"]);
    expect(outs.filter((b) => b.state === "sent").map((b) => [b.retryOf, b.messageId])).toEqual([["bo_1", "m-1"], ["bo_2", "m-2"]]);
    expect(t.of("ai_msg")).toHaveLength(0); // it went: nothing to say
  });

  test("an outbox Mem doesn't call whole never makes it a resend: still unknown, looked at again", async () => {
    let replies = 0;
    const t = rig({
      async reply() {
        replies++;
        return { ok: true, messageId: "x" };
      },
      async outbox() {
        return { ok: true, complete: false, ops: [] };
      },
    });
    const base = { to: "another agent", mine: true, text: "hi", inReplyTo: "m1", opId: "bo_9", direction: "out" as const, messageId: "" };
    t.fc.core.log.append({ stream: "channel", origin: "partner", kind: "bridge_msg", body: { ...base, state: "unknown" } });
    await t.partner.checkBridge();
    expect(replies).toBe(0);
    expect(t.bm().at(-1)!.state).toBe("unknown");
  });
});
