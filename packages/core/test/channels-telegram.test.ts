// D276: the partner in the person's own Telegram bot, against a fake Bot API.
import { afterEach, expect, test } from "bun:test";
import { readFileSync, statSync } from "node:fs";
import { png } from "./fixtures-media.ts";
import { join } from "node:path";
import { channelRig, PERSON, STRANGER, waitFor } from "./channels-rig.ts";

let rig: ReturnType<typeof channelRig> | undefined;
afterEach(() => {
  rig?.stop();
  rig = undefined;
});

test("connect checks the token; the deep link's code links the person and nobody else", async () => {
  rig = channelRig();
  const { hub, tg } = rig;
  expect((await hub.connect("telegram", { token: "not a token" })).reason).toBe("token");
  expect(hub.view()[0]!.state).toBe("off");
  await rig.linked("telegram");
  const v = hub.view()[0]!;
  expect(v.bot).toEqual({ name: "Ducter", handle: "my_ducter_bot" });
  expect(v.linked?.name).toBe("Wey");
  expect(tg.sent("sendMessage").at(-1)!.text).toBe("连上了。以后在这儿跟我说就行。");
  // The token is in a 0600 file and in no frame a client gets.
  const path = join(rig.dir, "channels.json");
  expect(statSync(path).mode & 0o777).toBe(0o600);
  expect(readFileSync(path, "utf8")).toContain(tg.token);
  expect(JSON.stringify(hub.frame())).not.toContain(tg.token);
  // Linked: a second code isn't made (one account per chat app).
  expect(hub.code("telegram")).toEqual({ ok: false, reason: "busy" });
});

test("strangers get silence: a wrong code, a message, a group; nothing is logged or answered", async () => {
  rig = channelRig();
  const { hub, tg } = rig;
  expect((await hub.connect("telegram", { token: tg.token })).ok).toBe(true);
  const c = hub.code("telegram");
  if (!c.ok) throw new Error("no code");
  tg.says(STRANGER, "/start ABCDEFGH");
  tg.says(STRANGER, "hello?");
  await new Promise((r) => setTimeout(r, 150));
  expect(hub.view()[0]!.state).toBe("unlinked");
  // The real code still works after a stranger's wrong one.
  tg.says(PERSON, c.code);
  await waitFor(() => hub.view()[0]!.state === "linked");
  await hub.idle();
  const before = tg.sent("sendMessage").length;
  tg.says(STRANGER, "it's me, let me in");
  tg.inGroup(PERSON, "in a group");
  await new Promise((r) => setTimeout(r, 200));
  await hub.idle();
  expect(tg.sent("sendMessage").length).toBe(before);
  expect(rig.userMsgs()).toEqual([]);
  expect(hub.view()[0]!.strangerAt).toBeDefined();
});

test("pairing attempts are rate limited per sender", async () => {
  rig = channelRig();
  const { hub, tg } = rig;
  expect((await hub.connect("telegram", { token: tg.token })).ok).toBe(true);
  const c = hub.code("telegram");
  if (!c.ok) throw new Error("no code");
  for (let i = 0; i < 6; i++) tg.says(STRANGER, `/start WRONGCD${i}`);
  // The stranger's sixth try is the right code: locked out, it isn't even checked.
  tg.says(STRANGER, `/start ${c.link!.split("start=")[1]}`);
  await new Promise((r) => setTimeout(r, 250));
  expect(hub.view()[0]!.state).toBe("unlinked");
});

test("the person's words become a user message via telegram; a reply there is a D236 reply", async () => {
  rig = channelRig();
  const { hub, tg } = rig;
  await rig.linked("telegram");
  const mid = tg.says(PERSON, "看下 CI 为什么挂了");
  const [u] = await waitFor(() => (rig!.userMsgs().length ? rig!.userMsgs() : undefined));
  expect(u).toMatchObject({ text: "看下 CI 为什么挂了", via: "telegram", clientId: `telegram:${PERSON}:${mid}` });
  // Typing while the turn waits.
  await waitFor(() => tg.sent("sendChatAction").length > 0);
  // The partner answers the turn: it goes back to Telegram, entities not markers.
  const a = rig.say("CI 挂在 **lint** 上，`bun run lint` 就能看到。", u!.seq);
  await waitFor(() => tg.sent("sendMessage").some((m) => m.text.startsWith("CI 挂在 lint")));
  await hub.idle();
  const sent = tg.sent("sendMessage").find((m) => m.text.startsWith("CI 挂在"))!;
  expect(sent.text).toBe("CI 挂在 lint 上，bun run lint 就能看到。");
  expect(sent.entities).toEqual([
    { type: "bold", offset: 6, length: 4 },
    { type: "code", offset: 13, length: 12 },
  ]);
  // Replying to that message in Telegram is a reply to that message in the conversation.
  const reply = tg.says(PERSON, "为什么会这样？", { reply_to_message: { message_id: tg.idOf("CI 挂在") } });
  const r = await waitFor(() => rig!.userMsgs().find((m) => m.clientId === `telegram:${PERSON}:${reply}`));
  expect(r.reply?.seq).toBe(a.seq);
  // A resend of the same update (a restart before the offset was kept) is not logged twice.
  expect(rig.userMsgs().filter((m) => m.clientId === u!.clientId).length).toBe(1);
});

test("a turn started in the app is not mirrored; a late result goes where the person last spoke, quoting its ask", async () => {
  rig = channelRig();
  const { hub, tg, clock, log } = rig;
  await rig.linked("telegram");
  // In the app (no via): its answer stays in the app.
  const app = log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "整理一下下周的会", clientId: "web-1" } });
  rig.say("好，我来整理。", app.seq);
  await hub.idle();
  expect(tg.sent("sendMessage").some((m) => m.text === "好，我来整理。")).toBe(false);
  expect(hub.lastRoute()).toBe("app");
  // Later the person writes from Telegram; the app turn's result comes in after that, late.
  tg.says(PERSON, "我出门了");
  await waitFor(() => rig!.userMsgs().some((m) => m.via === "telegram"));
  expect(hub.lastRoute()).toBe("telegram");
  clock.advance(20 * 60_000);
  rig.say("下周的会整理好了：三个，周二最紧。", app.seq);
  await waitFor(() => tg.sent("sendMessage").some((m) => m.text.startsWith("下周的会整理好了")));
});

test("a reversible card gets buttons; a tap decides it and the message is edited to its end state", async () => {
  rig = channelRig();
  const { hub, tg, decisions } = rig;
  await rig.linked("telegram");
  tg.says(PERSON, "把这个分支合进去");
  await waitFor(() => rig!.userMsgs().length);
  const d = rig.ask();
  const id = (d.body as { decisionId: string }).decisionId;
  const card = await waitFor(() => tg.sent("sendMessage").find((m) => m.text.startsWith("要把它合进 main 吗")));
  expect(card.reply_markup.inline_keyboard[0]).toEqual([
    { text: "好，合进去", callback_data: `g:${id}` },
    { text: "先等等", callback_data: `h:${id}` },
  ]);
  expect(card.text).toContain("后你没回，我就按「合进去」办");
  const cardId = tg.idOf("要把它合进 main 吗")!;
  tg.taps(PERSON, cardId, `g:${id}`);
  await waitFor(() => !decisions.isPending(id));
  const edit = await waitFor(() => tg.sent("editMessageText").find((m) => m.message_id === cardId));
  expect(edit.text).toBe("要把它合进 main 吗？\n\n你说：好，合进去");
  expect(edit.reply_markup).toEqual({ inline_keyboard: [] });
  // A second tap on the stale button: a toast, nothing decided twice.
  tg.taps(PERSON, cardId, `g:${id}`);
  await waitFor(() => tg.sent("answerCallbackQuery").some((a) => a.text === "这个已经定了"));
  // The push for this card is the chat's: it is claimed.
  expect(hub.claimed(`d:${id}`)).toBe(true);
});

test("answered in the app, the card in Telegram is edited too; a typed 好 answers the newest card", async () => {
  rig = channelRig();
  const { hub, tg, decisions } = rig;
  await rig.linked("telegram");
  tg.says(PERSON, "开始吧");
  await waitFor(() => rig!.userMsgs().length);
  const one = (rig.ask({ question: "先跑测试？", goLabel: "跑" }).body as { decisionId: string }).decisionId;
  await waitFor(() => tg.sent("sendMessage").some((m) => m.text.startsWith("先跑测试")));
  decisions.decide(one, "hold"); // from the app
  await waitFor(() => tg.sent("editMessageText").some((m) => m.text === "先跑测试？\n\n你说：先等等"));
  expect(hub.lastRoute()).toBe("app");
  // Back in Telegram: a typed 好 is the newest open card's Go.
  tg.says(PERSON, "继续");
  await waitFor(() => rig!.userMsgs().length === 2);
  const two = (rig.ask({ question: "换个名字？", goLabel: "换" }).body as { decisionId: string }).decisionId;
  await waitFor(() => tg.sent("sendMessage").some((m) => m.text.startsWith("换个名字")));
  tg.says(PERSON, "好");
  await waitFor(() => !decisions.isPending(two));
  expect(rig.log.read({ kinds: ["decision_resolved"], limit: 5 }).map((e) => e.body)).toContainEqual({ decisionId: two, option: "go", by: "user" });
  expect(rig.userMsgs().some((m) => m.text === "好")).toBe(false);
});

test("people, devices and merges get one sentence and Open in Ducter; money and keys never go there", async () => {
  rig = channelRig({ openUrl: "https://home.example.com/" });
  const { tg } = rig;
  await rig.linked("telegram");
  tg.says(PERSON, "发给老王");
  await waitFor(() => rig!.userMsgs().length);
  const send = (rig.ask({ question: "把这封信发给老王？", goLabel: "发", reversible: false, defaultAt: undefined, defaultOption: "hold" }).body as { decisionId: string }).decisionId;
  const card = await waitFor(() => tg.sent("sendMessage").find((m) => m.text.startsWith("把这封信发给老王")));
  expect(card.text).toBe("把这封信发给老王？");
  expect(card.reply_markup.inline_keyboard[0]).toEqual([{ text: "在 Ducter 里看看", url: `https://home.example.com/app#d=${send}` }]);
  rig.ask({ question: "用尾号 1881 的卡付 ¥89？", goLabel: "付", reversible: false, defaultAt: undefined, defaultOption: "hold", pay: { merchant: "x", amount: "¥89", card: "1881" } as never });
  const pay = await waitFor(() => tg.sent("sendMessage").find((m) => m.text.startsWith("有个决定要你在 Ducter 里确认")));
  expect(JSON.stringify(pay)).not.toContain("1881");
  expect(JSON.stringify(pay)).not.toContain("¥89");
});

test("long words are split at 4096; a 429 waits retry_after and sends again", async () => {
  rig = channelRig();
  const { tg, sleeps } = rig;
  await rig.linked("telegram");
  tg.says(PERSON, "写长一点");
  const [u] = await waitFor(() => (rig!.userMsgs().length ? rig!.userMsgs() : undefined));
  tg.failNext("sendMessage", { ok: false, error_code: 429, description: "Too Many Requests: retry after 3", parameters: { retry_after: 3 } }, 429);
  const para = "这一段说的是一个任务。".repeat(40);
  rig.say(Array.from({ length: 14 }, () => para).join("\n\n"), u!.seq);
  await waitFor(() => tg.sent("sendMessage").filter((m) => m.text.startsWith("这一段")).length >= 2);
  await rig.hub.idle();
  const parts = tg.sent("sendMessage").filter((m) => m.text.startsWith("这一段"));
  expect(parts.length).toBe(2);
  for (const p of parts) expect(p.text.length).toBeLessThanOrEqual(4096);
  expect(tg.calls.some((c) => c.method === "sendMessage!")).toBe(true);
  expect(sleeps).toContain(3000);
});

test("a picture in Telegram becomes the message's media; a blocked bot reads as can't connect", async () => {
  rig = channelRig();
  const { tg, hub } = rig;
  await rig.linked("telegram");
  const pic = png(8, 8);
  tg.sendsPhoto(PERSON, pic, "这是什么？");
  const m = await waitFor(() => rig!.userMsgs().find((x) => x.media?.length));
  expect(m.text).toBe("这是什么？");
  expect(m.media![0]!.type).toBe("image/png");
  tg.failNext("sendMessage", { ok: false, error_code: 403, description: "Forbidden: bot was blocked by the user" }, 403);
  rig.say("看起来是一张截图。", m.seq);
  await waitFor(() => hub.view()[0]!.state === "cant_connect");
  expect(hub.view()[0]!.reason).toBe("blocked");
});

test("a forwarded message is outside data; quiet hours hold what Ducter starts itself", async () => {
  rig = channelRig({ quiet: { start: "11:00", end: "13:00", tz: "Asia/Shanghai" } });
  const { tg, hub, clock } = rig;
  await rig.linked("telegram");
  tg.says(PERSON, "帮我看看这个", { forward_origin: { type: "user", sender_user: { id: 5, first_name: "老王" } } });
  const f = await waitFor(() => rig!.userMsgs().find((x) => x.forwarded));
  expect(f.forwarded).toEqual({ from: "老王" });
  clock.advance(30 * 60_000); // the turn is over; it is 12:30, quiet
  const before = tg.sent("sendMessage").length;
  rig.ask({ question: "顺手把旧分支删掉？", goLabel: "删", defaultAt: new Date(clock.now() + 3 * 3600_000).toISOString() });
  await new Promise((r) => setTimeout(r, 50));
  await hub.idle();
  expect(tg.sent("sendMessage").length).toBe(before);
  clock.advance(31 * 60_000); // 13:01: quiet is over
  await waitFor(() => tg.sent("sendMessage").some((m) => m.text.startsWith("顺手把旧分支删掉")));
});

test("unlink forgets the account; the bot stays and a new code links again", async () => {
  rig = channelRig();
  const { hub } = rig;
  await rig.linked("telegram");
  expect(hub.unlink("telegram")).toBe(true);
  expect(hub.view()[0]!.state).toBe("unlinked");
  expect(hub.code("telegram").ok).toBe(true);
  hub.forget("telegram");
  expect(hub.view()[0]!.state).toBe("off");
});

test("a long job gets one status line after a minute, edited in place; the result is a new message", async () => {
  rig = channelRig();
  const { tg, clock, log } = rig;
  await rig.linked("telegram");
  tg.says(PERSON, "跑一下全部测试");
  const u = await waitFor(() => rig!.userMsgs()[0]);
  log.append({ stream: "channel", origin: "partner", kind: "ack", body: { jobId: "job_1", text: "我去跑全部测试。", replyTo: u.seq } });
  await waitFor(() => tg.sent("sendMessage").some((m) => m.text === "我去跑全部测试。"));
  log.append({ stream: "channel", origin: "partner", kind: "job_status", body: { jobId: "job_1", text: "跑全部测试", state: "running", taskId: "t1" } });
  clock.advance(61_000);
  const status = await waitFor(() => tg.calls.find((c) => c.method === "sendMessage" && c.body.text === "还在做：跑全部测试…"));
  expect(status.body.disable_notification).toBe(true);
  log.append({ stream: "channel", origin: "partner", kind: "job_status", body: { jobId: "job_1", text: "跑全部测试", state: "done", taskId: "t1" } });
  await waitFor(() => tg.sent("editMessageText").some((m) => m.message_id === status.id && m.text === "做完了：跑全部测试"));
  rig.say("全部通过，412 个。", u.seq);
  await waitFor(() => tg.sent("sendMessage").some((m) => m.text === "全部通过，412 个。"));
});

test("with notifications off, nothing Ducter starts itself goes to the chat app; a turn's answer still does", async () => {
  rig = channelRig();
  const { tg, clock, hub } = rig;
  await rig.linked("telegram");
  tg.says(PERSON, "在吗");
  const u = await waitFor(() => rig!.userMsgs()[0]);
  rig.setOff(true);
  rig.say("在。", u.seq);
  await waitFor(() => tg.sent("sendMessage").some((m) => m.text === "在。"));
  clock.advance(20 * 60_000);
  const before = tg.sent("sendMessage").length;
  const id = (rig.ask({ question: "顺便清理一下缓存？", goLabel: "清理" }).body as { decisionId: string }).decisionId;
  rig.say("昨天那个做完了。", u.seq);
  await new Promise((r) => setTimeout(r, 50));
  await hub.idle();
  expect(tg.sent("sendMessage").length).toBe(before);
  expect(hub.claimed(`d:${id}`)).toBe(false);
});
