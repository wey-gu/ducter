// D516, D649: several partners in the one thread of each chat app, against the fake servers.
import { afterEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Bodies } from "@ducter/protocol";
import { channelRig, PERSON, waitFor } from "./channels-rig.ts";
import { SCANNER } from "./fake-wechat.ts";

const PARTNERS = [
  { id: "default", name: "Ducter" },
  { id: "home", name: "小家" },
  { id: "dobby", name: "多比" },
];

let rig: ReturnType<typeof channelRig> | undefined;
afterEach(() => {
  rig?.stop();
  rig = undefined;
});

const msgsIn = (r: ReturnType<typeof channelRig>, stream: string) =>
  r.log.read({ stream, kinds: ["user_msg"], limit: 100 }).map((e) => ({ seq: e.seq, ...(e.body as Bodies["user_msg"]) }));
const rec = (r: ReturnType<typeof channelRig>, kind: string) => JSON.parse(readFileSync(join(r.dir, "channels.json"), "utf8"))[kind] as { hinted?: boolean; with?: { id: string } };
const HINT = "这里能跟 Ducter、小家、多比 聊。想跟谁说，开头写它的名字，比如「小家，…」，或者说「切到小家」。";

test("the first words carry one line listing the partners; a name at the start talks to that partner, and the thread stays there past 15 minutes", async () => {
  rig = channelRig({ partners: PARTNERS });
  const { tg, log, clock } = rig;
  await rig.linked("telegram");
  tg.says(PERSON, "小家，周六提醒我交房租");
  const [u] = await waitFor(() => (msgsIn(rig!, "channel:home").length ? msgsIn(rig!, "channel:home") : undefined));
  expect(u).toMatchObject({ text: "小家，周六提醒我交房租", via: "telegram" });
  expect(rig.userMsgs()).toEqual([]); // nothing in the default's conversation
  // 小家 answers in its own conversation: it goes to Telegram, led by its name, with the one-time line.
  log.append({ stream: "channel:home", origin: "partner", kind: "ai_msg", body: { text: "好，周六早上九点提醒你。", replyTo: u!.seq } });
  const a = await waitFor(() => tg.sent("sendMessage").find((m) => String(m.text).startsWith("小家：")));
  expect(a.text).toBe(`小家：好，周六早上九点提醒你。\n\n${HINT}`);
  // The line is in channels.json as said, and the thread is written down with 小家.
  expect(rec(rig, "telegram")).toMatchObject({ hinted: true, with: { id: "home" } });
  // Quiet for 20 minutes: no silent fall-back; words without a name are still 小家's.
  clock.advance(20 * 60_000);
  tg.says(PERSON, "顺便把水费也加上");
  await waitFor(() => msgsIn(rig!, "channel:home").length === 2);
  log.append({ stream: "channel:home", origin: "partner", kind: "ai_msg", body: { text: "加上了。", replyTo: msgsIn(rig, "channel:home")[1]!.seq } });
  const b = await waitFor(() => tg.sent("sendMessage").find((m) => m.text === "小家：加上了。"));
  expect(b.text).not.toContain("这里能跟"); // the line is said once, never again
  expect(rec(rig, "telegram").hinted).toBe(true);
});


test("asking who they can talk to gets the one line too, once", async () => {
  rig = channelRig({ partners: PARTNERS });
  const { tg } = rig;
  await rig.linked("telegram");
  tg.says(PERSON, "我都能和谁聊？");
  const [u] = await waitFor(() => (rig!.userMsgs().length ? rig!.userMsgs() : undefined));
  rig.say("Ducter、小家、多比。", u!.seq);
  const a = await waitFor(() => tg.sent("sendMessage").find((m) => String(m.text).includes("Ducter、小家、多比。")));
  expect(String(a.text)).toContain(HINT);
  tg.says(PERSON, "好");
  await waitFor(() => (msgsIn(rig!, "channel").length === 2 ? true : undefined));
  rig.say("好。", msgsIn(rig, "channel")[1]!.seq);
  await waitFor(() => tg.sent("sendMessage").some((m) => m.text === "Ducter：好。"));
});
test("the one-line hint survives a restart: the partners are listed once per chat app", async () => {
  rig = channelRig({ partners: PARTNERS });
  const { tg } = rig;
  await rig.linked("telegram");
  tg.says(PERSON, "在吗");
  const [u] = await waitFor(() => (rig!.userMsgs().length ? rig!.userMsgs() : undefined));
  rig.say("在。", u!.seq);
  await waitFor(() => tg.sent("sendMessage").find((m) => m.text === `Ducter：在。\n\n${HINT}`));
  // A fresh hub on the same home: channels.json remembers it was said.
  rig.hub.stop();
  const again = rig.make(rig.dir);
  await again.start();
  rig.hub = again;
  tg.says(PERSON, "还在吗");
  const q = await waitFor(() => (msgsIn(rig!, "channel").length === 2 ? msgsIn(rig!, "channel")[1] : undefined));
  rig.say("在。", q!.seq);
  await waitFor(() => tg.sent("sendMessage").filter((m) => String(m.text).includes("在。")).length >= 2);
  const last = tg.sent("sendMessage").at(-1)!;
  expect(String(last.text)).toContain("Ducter：在。");
  expect(String(last.text)).not.toContain("这里能跟");
});

test("with several partners every partner's words lead with its name, the default's too; a reply still goes to the one replied to", async () => {
  rig = channelRig({ partners: PARTNERS });
  const { tg, log, clock } = rig;
  await rig.linked("telegram");
  tg.says(PERSON, "@多比 这周跑了几次步？");
  const [u] = await waitFor(() => (msgsIn(rig!, "channel:dobby").length ? msgsIn(rig!, "channel:dobby") : undefined));
  log.append({ stream: "channel:dobby", origin: "partner", kind: "ai_msg", body: { text: "三次，一共 15 公里。", replyTo: u!.seq } });
  await waitFor(() => tg.idOf("多比：三次"));
  tg.says(PERSON, "Ducter, 帮我看下 PR");
  const [d] = await waitFor(() => (rig!.userMsgs().length ? rig!.userMsgs() : undefined));
  log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: "PR 看过了。", replyTo: d!.seq } });
  // The default's own words carry its name too, or who answers is a guess.
  await waitFor(() => tg.sent("sendMessage").some((m) => m.text === "Ducter：PR 看过了。"));
  clock.advance(60_000);
  // Replying to 多比's message goes to 多比, and the thread is with it from then on.
  tg.says(PERSON, "下周目标四次", { reply_to_message: { message_id: tg.idOf("多比：三次") } });
  await waitFor(() => msgsIn(rig!, "channel:dobby").length === 2);
  const r = msgsIn(rig, "channel:dobby")[1]!;
  expect(r.reply?.seq).toBeGreaterThan(u!.seq);
  // A name that only starts a word is no address.
  tg.says(PERSON, "小家里的灯坏了");
  await waitFor(() => msgsIn(rig!, "channel:dobby").length === 3);
  expect(msgsIn(rig, "channel:home")).toEqual([]);
});

test("asking for a partner switches the thread by passing the words; it answers first under its name, and the thread stays (never back to the default on its own)", async () => {
  rig = channelRig({ partners: PARTNERS });
  const { tg, log, clock } = rig;
  await rig.linked("telegram");
  tg.says(PERSON, "我想和多比聊");
  const [u] = await waitFor(() => (rig!.userMsgs().length ? rig!.userMsgs() : undefined));
  expect(u!.via).toBe("telegram");
  // The partner tool's switch (D649): the person's words go to 多比, marked passed, and the hub
  // is with 多比 there from then on.
  const p = log.append({ stream: "channel:dobby", origin: "user", kind: "user_msg", persona: "dobby", body: { text: "我想和多比聊", passed: { from: "default", via: "telegram", seq: u!.seq } } });
  log.append({ stream: "channel:dobby", origin: "partner", kind: "ai_msg", body: { text: "在，想聊什么？", replyTo: p.seq } });
  await waitFor(() => tg.sent("sendMessage").some((m) => String(m.text).startsWith("多比：在，想聊什么？")));
  expect(rec(rig, "telegram").with?.id).toBe("dobby");
  clock.advance(20 * 60_000);
  tg.says(PERSON, "这周跑了几次步？");
  await waitFor(() => msgsIn(rig!, "channel:dobby").length === 2);
  expect(rig.userMsgs().length).toBe(1); // the first words only; the next ones are 多比's
});

test("back to the default the same way: its name leads, and the thread is the default's afterwards", async () => {
  rig = channelRig({ partners: PARTNERS });
  const { tg, log } = rig;
  await rig.linked("telegram");
  tg.says(PERSON, "我想和多比聊");
  await waitFor(() => rig!.userMsgs().length);
  const p = log.append({ stream: "channel:dobby", origin: "user", kind: "user_msg", persona: "dobby", body: { text: "我想和多比聊", passed: { from: "default" } } });
  log.append({ stream: "channel:dobby", origin: "partner", kind: "ai_msg", body: { text: "在。", replyTo: p.seq } });
  await waitFor(() => tg.sent("sendMessage").some((m) => String(m.text).startsWith("多比：在。")));
  // 「回到 Ducter」 is 多比's words now; 多比's model switches back (D649).
  tg.says(PERSON, "回到 Ducter");
  await waitFor(() => msgsIn(rig!, "channel:dobby").length === 2);
  const q = msgsIn(rig, "channel:dobby")[1]!;
  const back = log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "回到 Ducter", passed: { from: "dobby", via: "telegram", seq: q.seq } } });
  log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: "在。", replyTo: back.seq } });
  await waitFor(() => tg.sent("sendMessage").some((m) => m.text === "Ducter：在。"));
  expect(rec(rig, "telegram").with?.id).toBe("default");
  tg.says(PERSON, "刚才说到哪了");
  await waitFor(() => rig!.userMsgs().some((m) => m.text === "刚才说到哪了"));
});

test("WeChat: one ClawBot, the same rules; with one partner nothing changes (no hint, no names)", async () => {
  rig = channelRig({ partners: PARTNERS });
  const { wx, log } = rig;
  await rig.linked("wechat");
  wx.says(SCANNER, "小家：明天几点倒垃圾？");
  const [u] = await waitFor(() => (msgsIn(rig!, "channel:home").length ? msgsIn(rig!, "channel:home") : undefined));
  expect(u!.via).toBe("wechat");
  log.append({ stream: "channel:home", origin: "partner", kind: "ai_msg", body: { text: "早上七点前。", replyTo: u!.seq } });
  await waitFor(() => wx.texts().some((t) => t.startsWith("小家：早上七点前。")));
  expect(wx.texts().at(-1)).toContain("这里能跟 Ducter、小家、多比 聊");
  rig.stop();
  // One partner: a name at the start is just words, for the default, and no name or hint comes back.
  rig = channelRig();
  await rig.linked("wechat");
  rig.wx.says(SCANNER, "小家，明天几点倒垃圾？");
  const [d] = await waitFor(() => (rig!.userMsgs().length ? rig!.userMsgs() : undefined));
  expect(d!.text).toBe("小家，明天几点倒垃圾？");
  rig.say("早上七点前。", d!.seq);
  await waitFor(() => rig!.wx.texts().some((t) => t === "早上七点前。"));
  expect(rig.wx.texts().some((t) => t.includes("这里能跟"))).toBe(false);
});


test("a switch moves the chat app it came from, not one the person wrote in after it", async () => {
  rig = channelRig({ partners: PARTNERS });
  const { tg, sl, log } = rig;
  await rig.linked("telegram");
  await rig.linked("slack");
  tg.says(PERSON, "我想和多比聊");
  const [u] = await waitFor(() => (rig!.userMsgs().length ? rig!.userMsgs() : undefined));
  // A later message in another chat app must not move that app's thread.
  sl.says("UWEY", "在吗");
  await waitFor(() => log.read({ stream: "channel", kinds: ["user_msg"], limit: 5 }).some((e) => (e.body as Bodies["user_msg"]).text === "在吗"));
  const p = log.append({ stream: "channel:dobby", origin: "user", kind: "user_msg", persona: "dobby", body: { text: "我想和多比聊", passed: { from: "default", via: "telegram", seq: u!.seq } } });
  log.append({ stream: "channel:dobby", origin: "partner", kind: "ai_msg", body: { text: "在，想聊什么？", replyTo: p.seq } });
  await waitFor(() => tg.sent("sendMessage").some((m) => String(m.text).startsWith("多比：在，想聊什么？")));
  expect(sl.sent("chat.postMessage").some((m) => String(m.text).includes("多比："))).toBe(false);
  expect(rec(rig, "telegram").with?.id).toBe("dobby");
  expect(rec(rig, "slack").with?.id).not.toBe("dobby");
});

test("Feishu / Lark: the same rules (a switch passes the words, the answer leads with the name, the hint is once)", async () => {
  rig = channelRig({ partners: PARTNERS });
  const { fs, log } = rig;
  await rig.linked("feishu");
  fs.says("ou_wey", "我想和多比聊");
  await waitFor(() => rig!.userMsgs().length);
  const p = log.append({ stream: "channel:dobby", origin: "user", kind: "user_msg", persona: "dobby", body: { text: "我想和多比聊", passed: { from: "default" } } });
  log.append({ stream: "channel:dobby", origin: "partner", kind: "ai_msg", body: { text: "在，想聊什么？", replyTo: p.seq } });
  await waitFor(() => fs.sends().some((b) => String(b.content).includes("多比：在，想聊什么？")));
  expect(fs.sends().some((b) => String(b.content).includes("这里能跟 Ducter、小家、多比 聊"))).toBe(true);
});
