// D516: several partners in the one thread of each chat app, against the fake servers.
import { afterEach, expect, test } from "bun:test";
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

test("a name at the start talks to that partner; its answer comes back with its name; the thread stays with it", async () => {
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
  expect(a.text).toBe("小家：好，周六早上九点提醒你。\n\n想直接跟小家说，开头写「小家，」就行。");
  // Words without a name a minute later are still for 小家.
  clock.advance(60_000);
  tg.says(PERSON, "顺便把水费也加上");
  await waitFor(() => msgsIn(rig!, "channel:home").length === 2);
  log.append({ stream: "channel:home", origin: "partner", kind: "ai_msg", body: { text: "加上了。", replyTo: msgsIn(rig, "channel:home")[1]!.seq } });
  const b = await waitFor(() => tg.sent("sendMessage").find((m) => m.text === "小家：加上了。"));
  expect(b.text).not.toContain("想直接跟"); // the line is said once
  // After a quiet while, words without a name are the default's again.
  clock.advance(20 * 60_000);
  tg.says(PERSON, "CI 怎么样了");
  const [d] = await waitFor(() => (rig!.userMsgs().length ? rig!.userMsgs() : undefined));
  expect(d).toMatchObject({ text: "CI 怎么样了", via: "telegram" });
  // The default's own words carry no name: the bot is the default's.
  rig.say("CI 是绿的。", d!.seq);
  await waitFor(() => tg.sent("sendMessage").some((m) => m.text === "CI 是绿的。"));
});

test("a reply to a partner's message is for that partner, whatever the thread is with; @name works too", async () => {
  rig = channelRig({ partners: PARTNERS });
  const { tg, log, clock } = rig;
  await rig.linked("telegram");
  tg.says(PERSON, "@多比 这周跑了几次步？");
  const [u] = await waitFor(() => (msgsIn(rig!, "channel:dobby").length ? msgsIn(rig!, "channel:dobby") : undefined));
  log.append({ stream: "channel:dobby", origin: "partner", kind: "ai_msg", body: { text: "三次，一共 15 公里。", replyTo: u!.seq } });
  await waitFor(() => tg.idOf("多比：三次"));
  tg.says(PERSON, "Ducter, 帮我看下 PR");
  await waitFor(() => rig!.userMsgs().length === 1);
  clock.advance(60_000);
  // Replying to 多比's message goes to 多比, and quotes it there.
  tg.says(PERSON, "下周目标四次", { reply_to_message: { message_id: tg.idOf("多比：三次") } });
  await waitFor(() => msgsIn(rig!, "channel:dobby").length === 2);
  const r = msgsIn(rig, "channel:dobby")[1]!;
  expect(r.reply?.seq).toBeGreaterThan(u!.seq);
  // A name that only starts a word is no address.
  tg.says(PERSON, "小家里的灯坏了");
  await waitFor(() => msgsIn(rig!, "channel:dobby").length === 3); // still with 多比 (the reply made it so)
  expect(msgsIn(rig, "channel:home")).toEqual([]);
});

test("another partner's question reaches the person's place with its name; a tap answers it", async () => {
  rig = channelRig({ partners: PARTNERS });
  const { tg, log, decisions, clock } = rig;
  await rig.linked("telegram");
  tg.says(PERSON, "在吗");
  await waitFor(() => rig!.userMsgs().length);
  clock.advance(20 * 60_000); // the turn is over; Telegram is still the person's place
  const body: Bodies["decision"] = { decisionId: "d_dentist", question: "周四下午三点约牙医，行吗？", goLabel: "约上", defaultOption: "go", reversible: true, defaultAt: new Date(clock.now() + 3600_000).toISOString() };
  log.append({ stream: "channel:home", origin: "partner", kind: "decision", body });
  const card = await waitFor(() => tg.sent("sendMessage").find((m) => String(m.text).startsWith("小家：周四")));
  expect(card.reply_markup.inline_keyboard[0][0]).toEqual({ text: "好，约上", callback_data: "g:d_dentist" });
  tg.taps(PERSON, tg.idOf("小家：周四")!, "g:d_dentist");
  await waitFor(() => !decisions.isPending("d_dentist"));
  const edit = await waitFor(() => tg.sent("editMessageText").find((m) => m.message_id === tg.idOf("小家：周四")));
  expect(edit.text).toBe("小家：周四下午三点约牙医，行吗？\n\n你说：好，约上");
});

test("words the default passes on during a Telegram turn are answered in Telegram by the partner they went to", async () => {
  rig = channelRig({ partners: PARTNERS });
  const { tg, log } = rig;
  await rig.linked("telegram");
  tg.says(PERSON, "告诉小家周末我妈来");
  await waitFor(() => rig!.userMsgs().length);
  // The partner tool's pass (D486): the person's words land in 小家's conversation, marked passed.
  const p = log.append({ stream: "channel:home", origin: "user", kind: "user_msg", persona: "home", body: { text: "周末我妈来", passed: { from: "default" } } });
  log.append({ stream: "channel:home", origin: "partner", kind: "ai_msg", body: { text: "记下了，周六我把客房收拾的事排上。", replyTo: p.seq } });
  await waitFor(() => tg.sent("sendMessage").some((m) => String(m.text).startsWith("小家：记下了")));
  // And the person is talking with 小家 there now.
  tg.says(PERSON, "谢谢");
  await waitFor(() => msgsIn(rig!, "channel:home").some((m) => m.text === "谢谢"));
});

test("WeChat: one ClawBot, the same rules; with one partner nothing changes", async () => {
  rig = channelRig({ partners: PARTNERS });
  const { wx, log } = rig;
  await rig.linked("wechat");
  wx.says(SCANNER, "小家：明天几点倒垃圾？");
  const [u] = await waitFor(() => (msgsIn(rig!, "channel:home").length ? msgsIn(rig!, "channel:home") : undefined));
  expect(u!.via).toBe("wechat");
  log.append({ stream: "channel:home", origin: "partner", kind: "ai_msg", body: { text: "早上七点前。", replyTo: u!.seq } });
  await waitFor(() => wx.texts().some((t) => t.startsWith("小家：早上七点前。")));
  rig.stop();
  // One partner: a name at the start is just words, for the default.
  rig = channelRig();
  await rig.linked("wechat");
  rig.wx.says(SCANNER, "小家，明天几点倒垃圾？");
  await waitFor(() => rig!.userMsgs().length);
  expect(rig.userMsgs()[0]!.text).toBe("小家，明天几点倒垃圾？");
});
