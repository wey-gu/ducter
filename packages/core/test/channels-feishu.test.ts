// D622: the partner in the person's own Feishu / Lark app (企业自建应用), over the long
// connection, against a fake open platform. No real tenant is used.
import { afterEach, expect, test } from "bun:test";
import { channelRig, waitFor } from "./channels-rig.ts";

let rig: ReturnType<typeof channelRig> | undefined;
afterEach(() => {
  rig?.stop();
  rig = undefined;
});

const feishuView = () => rig!.hub.view().find((v) => v.kind === "feishu")!;
const textOf = (body: { content?: string }) => (body.content ? (JSON.parse(body.content) as { text?: string }).text : undefined);

test("connect tests the App ID and App Secret; the code links that Feishu user; strangers and groups get silence", async () => {
  rig = channelRig();
  const { hub, fs } = rig;
  expect((await hub.connect("feishu", { appId: "", appSecret: "" })).reason).toBe("token");
  expect((await hub.connect("feishu", { appId: fs.appId, appSecret: "wrong-secret" })).reason).toBe("token");
  await rig.linked("feishu");
  expect(feishuView()).toMatchObject({ state: "linked", domain: "feishu", bot: { name: "Ducter" }, linked: { name: "" } });
  expect(textOf(fs.sends().at(-1)!)).toBe("连上了。以后在这儿跟我说就行。");
  expect(fs.acks.some((a) => a.code === 200)).toBe(true);
  const before = fs.sends().length;
  fs.says("ou_stranger", "hi, I'm someone else");
  fs.groupSays("ou_wey", "in a group");
  await new Promise((r) => setTimeout(r, 150));
  await hub.idle();
  expect(fs.sends().length).toBe(before);
  expect(rig.userMsgs()).toEqual([]);
  expect(feishuView().strangerAt).toBeTruthy();
});

test("a direct message is a user message via feishu; its answer is plain text; a quote is a D236 reply", async () => {
  rig = channelRig({ zh: false });
  const { hub, fs } = rig;
  await rig.linked("feishu");
  const id = fs.says("ou_wey", "why is CI red?");
  const u = await waitFor(() => rig!.userMsgs()[0]);
  expect(u).toMatchObject({ text: "why is CI red?", via: "feishu", clientId: `feishu:ou_wey:${id}` });
  const a = rig.say("It fails on **lint**; see [the run](https://ci.example.com/1).", u.seq);
  const sent = await waitFor(() => fs.sends().find((m) => textOf(m)?.startsWith("It fails")));
  expect(sent.receive_id).toBe("ou_wey");
  expect(textOf(sent)).toBe("It fails on lint; see the run (https://ci.example.com/1).");
  await hub.idle();
  // A quote reply to the partner's own message is a D236 reply to it.
  const parent = `om_bot_${fs.sends().length}`;
  const reply = fs.says("ou_wey", "and how do I fix it?", { parent });
  const r = await waitFor(() => rig!.userMsgs().find((m) => m.clientId === `feishu:ou_wey:${reply}`));
  expect(r.reply?.seq).toBe(a.seq);
});

test("a reversible card asks for a typed 好, and the answer edits the message it is on", async () => {
  rig = channelRig();
  const { fs, decisions } = rig;
  await rig.linked("feishu");
  fs.says("ou_wey", "rebase 一下");
  await waitFor(() => rig!.userMsgs().length);
  const id = (rig.ask({ question: "要 rebase 到最新的 main 吗？", goLabel: "rebase" }).body as { decisionId: string }).decisionId;
  const card = await waitFor(() => fs.sends().find((m) => textOf(m)?.startsWith("要 rebase")));
  const words = textOf(card)!;
  expect(words).toContain("回「好」就rebase");
  expect(words).toContain("回「先等等」就先放着");
  expect(card.msg_type).toBe("text");
  await rig.hub.idle();
  const cardId = `om_bot_${fs.sends().length}`;
  fs.says("ou_wey", "好");
  await waitFor(() => !decisions.isPending(id));
  const up = await waitFor(() => fs.edits().find((m) => m.path.endsWith(cardId)));
  expect(textOf(up as { content?: string })).toContain("你说：好，rebase");
  // The same words again do not decide anything twice.
  fs.says("ou_wey", "好");
  await new Promise((r) => setTimeout(r, 80));
  expect(fs.edits().length).toBe(1);
});

test("the long connection is acked with code 200 and kept alive with a ping", async () => {
  rig = channelRig();
  const { fs } = rig;
  await rig.linked("feishu");
  fs.says("ou_wey", "hello");
  await waitFor(() => fs.acks.some((a) => a.code === 200));
  const ack = fs.acks.at(-1)!;
  expect(ack.frame.method).toBe(1);
  expect(ack.bizRt).toMatch(/^\d+$/);
  expect(JSON.parse(new TextDecoder().decode(ack.frame.payload))).toEqual({ code: 200, headers: null, data: null });
  // The fake's ping interval is shortened to 30 ms in the rig.
  await waitFor(() => fs.pings.length > 1);
});

test("Lark is the same card: one setting, and its code opens the Lark bot chat", async () => {
  rig = channelRig();
  const { hub, fs } = rig;
  expect((await hub.connect("feishu", { appId: fs.appId, appSecret: fs.appSecret, domain: "lark" })).ok).toBe(true);
  await waitFor(() => fs.connected());
  expect(feishuView()).toMatchObject({ state: "unlinked", domain: "lark" });
  const c = hub.code("feishu");
  expect(c).toMatchObject({ ok: true, link: `https://applink.larksuite.com/client/bot/open?appId=${fs.appId}` });
});

test("a missing bot capability is 'setup', not a refused key, and no live connection is kept", async () => {
  rig = channelRig();
  const { hub, fs } = rig;
  fs.failNext("/open-apis/bot/v3/info", 200, { code: 230006, msg: "Bot ability is not activated." });
  const r = await hub.connect("feishu", { appId: fs.appId, appSecret: fs.appSecret });
  expect(r).toEqual({ ok: false, reason: "setup" });
  expect(feishuView().state).toBe("off");
});
