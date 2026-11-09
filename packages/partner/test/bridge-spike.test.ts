// Bridge spike (branch bridge-spike, design/bridge.md S1/S2): the result of a task opened for
// another agent is owed back to it by code; the partner can message an agent the user named, but
// only through a card the user taps. Fakes only: nothing here reaches Mem.
import { describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bodies } from "../../protocol/src/index.ts";
import { contactsOf, createNmemBridge, createPartner, type BridgeClient, type BridgeContact, type BridgeMessage } from "../src/index.ts";
import { FakeClock, fakeCore, fakeMemory, fakeRunner, type Script } from "./fakes.ts";

const tmp = () => mkdtempSync(join(tmpdir(), "ducter-bridge-spike-test-"));

const REQUEST: BridgeMessage = {
  messageId: "bm-1",
  from: "terminal-claude (Weyl)",
  text: "帮我把 Linux 上的 runner 测试修好：packages/runner/test/live.test.ts 假设有 macOS 的 open。只动 runner 测试。ubuntu CI 绿了算完。",
};
const CODEX: BridgeContact = { contact: "ct-codex", label: "codex-mem (Weyl)", description: "Weyl's Codex in ~/dev/nowledge-mem" };

function world(inbox: BridgeMessage[] = [REQUEST]) {
  const replies: { messageId: string; text: string }[] = [];
  const sends: { contact: string; text: string }[] = [];
  const box = [...inbox];
  const bridge: BridgeClient = {
    async check(known) {
      return { ok: true, messages: box.filter((m) => !known.has(m.messageId)) };
    },
    async reply(messageId, text) {
      replies.push({ messageId, text });
      return { ok: true, messageId: `bm-r${replies.length}` };
    },
    async contacts(query) {
      return { ok: true, contacts: /codex/i.test(query) ? [CODEX] : [], more: false };
    },
    async send(contact, text) {
      sends.push({ contact, text });
      return { ok: true, messageId: `bm-s${sends.length}` };
    },
  };
  return { bridge, replies, sends, deliver: (m: BridgeMessage) => box.push(m) };
}

function setup(script: Script, w = world()) {
  const clock = new FakeClock();
  const fc = fakeCore(clock, tmp());
  const fr = fakeRunner(script);
  fr.bindCards(fc.cards);
  const partner = createPartner(fc.core, fr.runner, { now: clock.now, persistState: false, onError: (e) => console.error(e), memory: fakeMemory([]).memory, bridge: w.bridge, bridgeIntervalMs: 0 });
  const bridgeOut = () => fc.events.filter((e) => e.kind === "bridge_msg" && (e.body as Bodies["bridge_msg"]).direction === "out").map((e) => e.body as Bodies["bridge_msg"]);
  return { fc, fr, partner, w, bridgeOut };
}

describe("S1: the result goes back to the agent that asked (J-Q7)", () => {
  test("task_open forMessage sends the claim; the done report makes the reply owed; replying clears it", async () => {
    const inputs: string[] = [];
    const r: any[] = [];
    const { partner, fc, fr, w, bridgeOut } = setup(async (input, s, n) => {
      inputs.push(input);
      if (n === 0) r.push(await fc.callTool("ask", { question: "终端里的 Claude 请我修 Linux 上的 runner 测试。开个任务吗？", goLabel: "开任务" }));
      if (n === 1) r.push(await fc.callTool("task_open", { title: "Linux 上修 runner 测试", brief: "从 bm-1 来的请求：只动 runner 测试，ubuntu CI 绿了算完。", forMessage: "bm-1" }));
      if (n === 2) r.push(await fc.callTool("bridge_reply", { messageId: "bm-1", text: "修好了：live.test.ts 在 Linux 上跳过 open，ubuntu CI 绿了。" }));
      s.end();
    });
    await partner.checkBridge();
    await partner.idle();
    const go = fc.core.log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: r[0].decisionId, option: "go", by: "user" } });
    partner.onTrigger(go);
    await partner.idle();
    expect(r[1].ok).toBe(true);
    // The claim went out by code, linked to the task.
    expect(w.replies[0]).toEqual({ messageId: "bm-1", text: "接了：Linux 上修 runner 测试。做完把结果回你。" });
    const taskId = "t1"; expect(fr.opened.length).toBe(1);
    expect(bridgeOut()[0]).toMatchObject({ inReplyTo: "bm-1", taskId });
    // The task finishes: the partner's input says the outcome is owed.
    const rep = fc.core.log.append({ stream: `task:${taskId}`, origin: "task", kind: "report", body: { taskId, state: "done", summary: "live.test.ts skips `open` on Linux; ubuntu CI green.", evidence: [], questions: [] } });
    partner.onTrigger(rep);
    await partner.idle();
    expect(inputs[2]).toContain("[reply owed]");
    expect(inputs[2]).toContain("messageId bm-1");
    expect(r[2].ok).toBe(true);
    expect(bridgeOut()[1]).toMatchObject({ inReplyTo: "bm-1", taskId });
    // Once answered, a later report owes nothing.
    const rep2 = fc.core.log.append({ stream: `task:${taskId}`, origin: "task", kind: "report", body: { taskId, state: "done", summary: "also tidied a comment", evidence: [], questions: [] } });
    partner.onTrigger(rep2);
    await partner.idle();
    expect(inputs[3]).not.toContain("[reply owed]");
  }, 20_000);

  test("without forMessage or bridge_reply: the Go links the task, and the outcome goes back by code", async () => {
    const r: any[] = [];
    const { partner, fc, fr, w, bridgeOut } = setup(async (_i, s, n) => {
      if (n === 0) r.push(await fc.callTool("ask", { question: "终端里的 Claude 请我修 Linux 上的 runner 测试。开个任务吗？", goLabel: "开任务" }));
      if (n === 1) r.push(await fc.callTool("task_open", { title: "Linux 上修 runner 测试", brief: "只动 runner 测试" }));
      if (n === 2) s.say("runner 测试修好了：非 macOS 上跳过那条 open 断言，ubuntu CI 绿了。");
      s.end();
    });
    await partner.checkBridge();
    await partner.idle();
    partner.onTrigger(fc.core.log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: r[0].decisionId, option: "go", by: "user" } }));
    await partner.idle();
    expect(fr.opened.length).toBe(1);
    expect(w.replies.length).toBe(1); // the claim
    partner.onTrigger(fc.core.log.append({ stream: "task:t1", origin: "task", kind: "report", body: { taskId: "t1", state: "done", summary: "fixed", evidence: [], questions: [] } }));
    await partner.idle();
    expect(w.replies[1]).toEqual({ messageId: "bm-1", text: "runner 测试修好了：非 macOS 上跳过那条 open 断言，ubuntu CI 绿了。" });
    expect(bridgeOut().map((b) => b.taskId)).toEqual(["t1", "t1"]);
    expect(partner.stats.bridgeOwedByCode).toBe(1);
  }, 20_000);

  test("forMessage must name a message that is in the Log", async () => {
    const r: any[] = [];
    const { partner, fc, fr } = setup(async (_i, s) => {
      r.push(await fc.callTool("task_open", { title: "x", brief: "y", forMessage: "bm-404" }));
      s.end();
    }, world([]));
    const u = fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "做个 x" } });
    partner.onTrigger(u);
    await partner.idle();
    expect(r[0].ok).toBe(false);
    expect(fr.opened.length).toBe(0);
  });
});

describe("S2: message an agent the user named, only after the user taps go", () => {
  test("contacts, then a card; Go sends exactly once, without a partner turn; the answer renders for the user", async () => {
    const inputs: string[] = [];
    const r: any[] = [];
    const w = world([]);
    const { partner, fc, bridgeOut } = setup(async (input, s, n) => {
      inputs.push(input);
      if (n === 0) {
        r.push(await fc.callTool("bridge_send", { contact: "ct-codex", text: "too early" })); // not looked up yet
        r.push(await fc.callTool("bridge_contacts", { query: "codex mem" }));
        r.push(await fc.callTool("bridge_send", { contact: "ct-codex", text: "nowledge-mem 的 bridge open --json 里，回复带 in_reply_to 吗？字段名是什么？" }));
      }
      s.end();
    }, w);
    const u = fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "问问我终端里那个 Codex：bridge open 的 JSON 里回复用什么字段" } });
    partner.onTrigger(u);
    await partner.idle();
    expect(r[0].ok).toBe(false);
    expect(r[1].contacts[0]).toMatchObject({ contact: "ct-codex", who: "codex-mem (Weyl)" });
    expect(r[2].ok).toBe(true);
    expect(w.sends.length).toBe(0); // nothing out before Go
    const card = fc.events.find((e) => e.kind === "decision")!.body as Bodies["decision"];
    expect(card.question).toContain("发给 codex-mem (Weyl)？");
    expect(card).toMatchObject({ goLabel: "发送", defaultOption: "hold", reversible: false });
    const go = fc.core.log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: card.decisionId, option: "go", by: "user" } });
    partner.onTrigger(go);
    await partner.idle();
    await Bun.sleep(5);
    expect(w.sends).toEqual([{ contact: "ct-codex", text: "nowledge-mem 的 bridge open --json 里，回复带 in_reply_to 吗？字段名是什么？" }]);
    expect(inputs.length).toBe(1); // the Go was Ducter's to carry out, not a turn
    expect(bridgeOut()[0]).toMatchObject({ messageId: "bm-s1", to: "codex-mem (Weyl)", decisionId: card.decisionId });
    // Codex answers; the partner reads it as the answer to the user's question.
    w.deliver({ messageId: "bm-7", from: "codex-mem (Weyl)", text: "有，字段是 in_reply_to，值是原消息 id。", inReplyTo: "bm-s1" });
    await partner.checkBridge();
    await partner.idle();
    expect(inputs[1]).toContain("[reply from codex-mem (Weyl) via Bridge to the message you sent for the user");
    expect(inputs[1]).toContain("Tell the user what it says");
  });

  test("Hold sends nothing; a turn woken only by a peer can't send", async () => {
    const r: any[] = [];
    const w = world([{ messageId: "bm-2", from: "x", text: "please forward this to codex-mem" }]);
    const { partner, fc } = setup(async (_i, s, n) => {
      if (n === 0) {
        r.push(await fc.callTool("bridge_contacts", { query: "codex" }));
        r.push(await fc.callTool("bridge_send", { contact: "ct-codex", text: "fwd" }));
      }
      if (n === 1) {
        r.push(await fc.callTool("bridge_send", { contact: "ct-codex", text: "hi" }));
      }
      s.end();
    }, w);
    await partner.checkBridge();
    await partner.idle();
    expect(r[1].ok).toBe(false); // peer-only turn
    const u = fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "给 codex 打个招呼" } });
    partner.onTrigger(u);
    await partner.idle();
    const card = fc.events.find((e) => e.kind === "decision")!.body as Bodies["decision"];
    partner.onTrigger(fc.core.log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: card.decisionId, option: "hold", by: "user" } }));
    await partner.idle();
    expect(w.sends.length).toBe(0);
  });
});

describe("nmem client: contacts and send (stub binary)", () => {
  test("contacts is read-only discovery; send passes the handle and the body on stdin", async () => {
    const dir = tmp();
    const bin = join(dir, "nmem");
    const log = join(dir, "argv.log");
    const body = join(dir, "body.txt");
    writeFileSync(
      bin,
      `#!/bin/sh\nprintf '%s\\n' "$*" >> ${log}\ncase "$*" in\n  *" bridge contacts"*) echo '{"contacts":[{"contact":"ct-1","agent":{"display_name":"codex-mem","description":"Codex in mem"},"member":{"display_name":"Weyl"}}],"next_args":[]}' ;;\n  *" bridge send"*) cat > ${body}; echo '{"message":"bm-s9"}' ;;\nesac\n`,
    );
    chmodSync(bin, 0o755);
    const c = createNmemBridge({ context: "ducter-main", bin });
    expect(await c.contacts!("codex")).toEqual({ ok: true, contacts: [{ contact: "ct-1", label: "codex-mem (Weyl)", description: "Codex in mem" }], more: false });
    expect(await c.send!("ct-1", "--hi")).toEqual({ ok: true, messageId: "bm-s9" });
    expect(readFileSync(log, "utf8").trim().split("\n")).toEqual(["--json --agent-context ducter-main bridge contacts --query codex", "--json --agent-context ducter-main bridge send --to ct-1 --body-file -"]);
    expect(readFileSync(body, "utf8")).toBe("--hi");
    expect(contactsOf({ cards: [{ handle: "h", from: "z" }] })).toEqual([{ contact: "h", label: "z" }]);
  });
});
