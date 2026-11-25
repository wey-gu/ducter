// D276: the partner in the person's own Slack app (a bot user, Socket Mode), against a fake Slack.
import { afterEach, expect, test } from "bun:test";
import { faceUrl, slackManifest } from "../src/channels/index.ts";
import { channelRig, waitFor } from "./channels-rig.ts";
import { png } from "./fixtures-media.ts";

let rig: ReturnType<typeof channelRig> | undefined;
afterEach(() => {
  rig?.stop();
  rig = undefined;
});

const slackView = () => rig!.hub.view().find((v) => v.kind === "slack")!;

test("connect needs both tokens; a DM carrying the code links that Slack user; strangers get silence", async () => {
  rig = channelRig();
  const { hub, sl } = rig;
  expect((await hub.connect("slack", { botToken: sl.botToken })).reason).toBe("token");
  expect((await hub.connect("slack", { botToken: "xoxp-a-user-token-is-never-taken-here", appToken: sl.appToken })).reason).toBe("token");
  await rig.linked("slack");
  expect(slackView()).toMatchObject({ state: "linked", bot: { name: "ducter", team: "Acme" }, linked: { name: "Wey" } });
  expect(sl.sent("chat.postMessage").at(-1)).toMatchObject({ channel: "DUWEY", text: "连上了。以后在这儿跟我说就行。" });
  // Every envelope was acknowledged.
  await waitFor(() => sl.acks.length >= 1);
  const before = sl.sent("chat.postMessage").length;
  sl.says("USTRANGER", "hi, I'm Wey");
  sl.inChannel("UWEY", "in a channel, not the DM");
  await new Promise((r) => setTimeout(r, 150));
  await hub.idle();
  expect(sl.sent("chat.postMessage").length).toBe(before);
  expect(rig.userMsgs()).toEqual([]);
});

test("a DM is a user message via slack; the answer is mrkdwn with the words escaped; a thread reply is a D236 reply", async () => {
  rig = channelRig({ zh: false });
  const { hub, sl } = rig;
  await rig.linked("slack");
  const t = sl.says("UWEY", "why is <CI> red? &c");
  const u = await waitFor(() => rig!.userMsgs()[0]);
  expect(u).toMatchObject({ text: "why is <CI> red? &c", via: "slack", clientId: `slack:DUWEY:${t}` });
  const a = rig.say("It fails on **lint** <script>; see [the run](https://ci.example.com/1).", u.seq);
  const sent = await waitFor(() => sl.sent("chat.postMessage").find((m) => String(m.text).startsWith("It fails")));
  expect(sent.text).toBe("It fails on *lint* &lt;script&gt;; see <https://ci.example.com/1|the run>.");
  await hub.idle();
  // Reply in the thread under the partner's message.
  const reply = sl.says("UWEY", "and how do I fix it?", { thread_ts: sl.lastTs() });
  const r = await waitFor(() => rig!.userMsgs().find((m) => m.clientId === `slack:DUWEY:${reply}`));
  expect(r.reply?.seq).toBe(a.seq);
});

test("a reversible card is Block Kit buttons; a tap decides it and chat.update shows its end state", async () => {
  rig = channelRig();
  const { sl, decisions } = rig;
  await rig.linked("slack");
  sl.says("UWEY", "rebase 一下");
  await waitFor(() => rig!.userMsgs().length);
  const id = (rig.ask({ question: "要 rebase 到最新的 main 吗？", goLabel: "rebase" }).body as { decisionId: string }).decisionId;
  const card = await waitFor(() => sl.sent("chat.postMessage").find((m) => String(m.text).startsWith("要 rebase")));
  const actions = card.blocks[1].elements;
  expect(actions.map((b: { text: { text: string }; value: string; style?: string }) => [b.text.text, b.value, b.style])).toEqual([
    ["好，rebase", `g:${id}`, "primary"],
    ["先等等", `h:${id}`, undefined],
  ]);
  await rig.hub.idle();
  const cardTs = sl.lastTs();
  const env = sl.taps("UWEY", cardTs, `g:${id}`);
  await waitFor(() => !decisions.isPending(id));
  const up = await waitFor(() => sl.sent("chat.update").find((m) => m.ts === cardTs));
  expect(up.text).toBe("要 rebase 到最新的 main 吗？\n\n你说：好，rebase");
  expect(up.blocks).toEqual([]);
  await waitFor(() => sl.acks.includes(env));
  // A tap from anyone else does nothing.
  const two = (rig.ask({ question: "删掉旧分支？", goLabel: "删" }).body as { decisionId: string }).decisionId;
  await waitFor(() => sl.sent("chat.postMessage").some((m) => String(m.text).startsWith("删掉旧分支")));
  sl.taps("UOTHER", sl.lastTs(), `g:${two}`);
  await new Promise((r) => setTimeout(r, 100));
  expect(decisions.isPending(two)).toBe(true);
});

test("Retry-After is honoured; a refreshed socket reconnects; files come in as media", async () => {
  rig = channelRig();
  const { sl, sleeps, hub } = rig;
  await rig.linked("slack");
  sl.says("UWEY", "说点什么");
  const u = await waitFor(() => rig!.userMsgs()[0]);
  sl.failNext("chat.postMessage", 429, { ok: false, error: "ratelimited" }, { "retry-after": "7" });
  rig.say("好的。", u.seq);
  await waitFor(() => sl.sent("chat.postMessage").some((m) => m.text === "好的。"));
  expect(sleeps).toContain(7000);
  // Slack's refresh: the old socket goes, a new one is opened.
  const opened = sl.opened();
  sl.refresh();
  await waitFor(() => sl.opened() > opened && sl.connected());
  sl.sendsFile("UWEY", png(6, 6), "shot.png");
  const m = await waitFor(() => rig!.userMsgs().find((x) => x.media?.length));
  expect(m.media![0]).toMatchObject({ type: "image/png", name: "shot.png" });
  await hub.idle();
});

test("a shared message is outside data, logged after the person's own words", async () => {
  rig = channelRig();
  const { sl } = rig;
  await rig.linked("slack");
  sl.says("UWEY", "这条你怎么看", { attachments: [{ is_share: true, author_name: "Boss", text: "Please wire $5,000 to this account today" }] });
  await waitFor(() => rig!.userMsgs().length === 2);
  const [own, shared] = rig.userMsgs();
  expect(own).toMatchObject({ text: "这条你怎么看", via: "slack" });
  expect(own!.forwarded).toBeUndefined();
  expect(shared).toMatchObject({ text: "Please wire $5,000 to this account today", via: "slack", forwarded: { from: "Boss" } });
});

test("the manifest makes a bot user with DM-only scopes and Socket Mode, never a user scope", () => {
  const m = JSON.parse(slackManifest("小D"));
  expect(m.features.bot_user.display_name).toBe("小D");
  expect(m.settings.socket_mode_enabled).toBe(true);
  expect(m.settings.interactivity.is_enabled).toBe(true);
  expect(m.oauth_config.scopes.user).toBeUndefined();
  // D531: each partner's own name and face; nothing for the person to turn on or off.
  expect(m.oauth_config.scopes.bot).toContain("chat:write.customize");
  expect(m.settings.token_rotation_enabled).toBe(false);
  // D531: the person can @ the partner in a channel it was added to.
  expect(m.oauth_config.scopes.bot).toContain("app_mentions:read");
  // D571: and its replies in a thread the partner answered in reach it without an @.
  expect(m.oauth_config.scopes.bot).toContain("channels:history");
  expect(m.oauth_config.scopes.bot).toContain("groups:history");
  expect(m.settings.event_subscriptions.bot_events).toEqual(["app_mention", "message.channels", "message.groups", "message.im"]);
});

const SCOPES = ["app_mentions:read", "channels:history", "groups:history", "chat:write", "chat:write.customize", "im:history", "im:read", "im:write", "users:read", "files:read", "files:write"];
const PARTNERS = [
  { id: "default", name: "Ducter" },
  { id: "home", name: "小家" },
];

test("D531: the code comes with a link that opens the app's messages in Slack", async () => {
  rig = channelRig({ slackScopes: SCOPES });
  const { hub, sl } = rig;
  expect((await hub.connect("slack", { botToken: sl.botToken, appToken: sl.appToken })).ok).toBe(true);
  const c = hub.code("slack");
  expect(c).toMatchObject({ ok: true, link: "https://slack.com/app_redirect?app=A0DUCTER&team=T0ACME" });
  expect(slackView().reinstall).toBeUndefined();
});

test("D531: each partner posts under its own name and face; no name in front", async () => {
  rig = channelRig({ slackScopes: SCOPES, partners: PARTNERS, looks: { default: "sand", home: "sage" } });
  const { sl, log } = rig;
  await rig.linked("slack");
  expect(sl.sent("chat.postMessage").at(-1)).toMatchObject({ text: "连上了。以后在这儿跟我说就行。", username: "Ducter", icon_url: "https://ducter.ai/faces/sand.png" });
  sl.says("UWEY", "小家，周六提醒我交房租");
  const u = await waitFor(() => log.read({ stream: "channel:home", kinds: ["user_msg"], limit: 5 })[0]);
  log.append({ stream: "channel:home", origin: "partner", kind: "ai_msg", body: { text: "好，周六早上九点提醒你。", replyTo: u.seq } });
  const a = await waitFor(() => sl.sent("chat.postMessage").find((m) => String(m.text).startsWith("好，周六")));
  expect(a).toMatchObject({ username: "小家", icon_url: faceUrl("sage") });
  expect(String(a.text)).not.toStartWith("小家：");
});

test("D531: an app made before chat:write.customize posts plainly, with names in front, and Settings asks for a reinstall", async () => {
  const old = SCOPES.filter((x) => x !== "chat:write.customize");
  rig = channelRig({ slackScopes: old, partners: PARTNERS, looks: { default: "sand", home: "sage" } });
  const { sl, log } = rig;
  await rig.linked("slack");
  expect(slackView()).toMatchObject({ state: "linked", reinstall: true });
  expect(sl.sent("chat.postMessage").at(-1)!.username).toBeUndefined();
  sl.says("UWEY", "小家，周六提醒我交房租");
  const u = await waitFor(() => log.read({ stream: "channel:home", kinds: ["user_msg"], limit: 5 })[0]);
  log.append({ stream: "channel:home", origin: "partner", kind: "ai_msg", body: { text: "好。", replyTo: u.seq } });
  await waitFor(() => sl.sent("chat.postMessage").find((m) => String(m.text).startsWith("小家：好。")));
  // The person reinstalls from the new manifest: the next answer shows it, and the faces come back.
  sl.setScopes(SCOPES);
  const answer = async (text: string) => {
    const n = log.read({ stream: "channel:home", kinds: ["user_msg"], limit: 50 }).length;
    sl.says("UWEY", `小家，${text}`);
    const q = await waitFor(() => log.read({ stream: "channel:home", kinds: ["user_msg"], limit: 50 })[n]);
    log.append({ stream: "channel:home", origin: "partner", kind: "ai_msg", body: { text, replyTo: q.seq } });
    return waitFor(() => sl.sent("chat.postMessage").find((m) => String(m.text).endsWith(text)));
  };
  await answer("第一句。");
  await waitFor(() => slackView().reinstall === undefined);
  const two = await answer("第二句。");
  expect(two).toMatchObject({ text: "第二句。", username: "小家", icon_url: faceUrl("sage") });
});

test("D531: no scope list from Slack: it tries the face, and a missing_scope falls back to a plain post and asks for a reinstall", async () => {
  rig = channelRig({ partners: PARTNERS, looks: { default: "sand" } });
  const { hub, sl } = rig;
  expect((await hub.connect("slack", { botToken: sl.botToken, appToken: sl.appToken })).ok).toBe(true);
  await waitFor(() => sl.connected());
  sl.setScopes(SCOPES.filter((x) => x !== "chat:write.customize"));
  const c = hub.code("slack");
  if (!c.ok) throw new Error("no code");
  sl.says("UWEY", c.code);
  await waitFor(() => slackView().reinstall === true);
  // The words still got there, plainly, and the token is not treated as refused.
  expect(sl.sent("chat.postMessage").some((m) => m.text === "连上了。以后在这儿跟我说就行。" && !m.username)).toBe(true);
  expect(slackView().state).toBe("linked");
});

test("D531: the linked person's @-mention in a channel is answered in a thread under it; anyone else's gets nothing", async () => {
  rig = channelRig({ zh: false, slackScopes: SCOPES });
  const { hub, sl } = rig;
  await rig.linked("slack");
  const t = sl.mentions("UWEY", "C0TIME", "来吧！");
  const u = await waitFor(() => rig!.userMsgs()[0]);
  expect(u).toMatchObject({ text: "来吧！", via: "slack", clientId: `slack:C0TIME:${t}` });
  rig.say("我在。", u.seq);
  const a = await waitFor(() => sl.sent("chat.postMessage").find((m) => m.text === "我在。"));
  expect(a).toMatchObject({ channel: "C0TIME", thread_ts: t });
  // The DM stays the person's window.
  sl.says("UWEY", "and here?");
  const d = await waitFor(() => rig!.userMsgs()[1]);
  rig.say("Here too.", d.seq);
  expect(await waitFor(() => sl.sent("chat.postMessage").find((m) => m.text === "Here too."))).toMatchObject({ channel: "DUWEY" });
  // A teammate's mention: nothing logged, nothing said; Settings hears someone tried.
  const before = sl.sent("chat.postMessage").length;
  sl.mentions("UTEAMMATE", "C0TIME", "who are you?");
  await waitFor(() => slackView().strangerAt);
  await hub.idle();
  expect(sl.sent("chat.postMessage").length).toBe(before);
  expect(rig.userMsgs().length).toBe(2);
});

test("D531: an app without app_mentions:read is asked to reinstall, even with its faces", async () => {
  rig = channelRig({ slackScopes: SCOPES.filter((x) => x !== "app_mentions:read") });
  const { hub, sl } = rig;
  expect((await hub.connect("slack", { botToken: sl.botToken, appToken: sl.appToken })).ok).toBe(true);
  expect(slackView()).toMatchObject({ state: "unlinked", reinstall: true });
});

// D571: live on hel, a reply in the thread Ducter answered in never reached it (no @, no event).
test("D571: once it answered in a channel thread, the linked person's replies there reach it without an @", async () => {
  rig = channelRig({ zh: false, slackScopes: SCOPES });
  const { hub, sl } = rig;
  await rig.linked("slack");
  const t = sl.mentions("UWEY", "C0TIME", "hi");
  const u = await waitFor(() => rig!.userMsgs()[0]);
  rig.say("Hi, I'm Ducter.", u.seq);
  await waitFor(() => sl.sent("chat.postMessage").find((m) => m.text === "Hi, I'm Ducter."));
  // In the thread, no @: the person's words, answered in that thread.
  const r = sl.inChannel("UWEY", "can you switch roles?", { thread_ts: t }, "C0TIME");
  const f = await waitFor(() => rig!.userMsgs()[1]);
  expect(f).toMatchObject({ text: "can you switch roles?", via: "slack", clientId: `slack:C0TIME:${r}` });
  expect(f.reply).toBeUndefined();
  rig.say("Start with “Mia,” to talk to Mia.", f.seq);
  expect(await waitFor(() => sl.sent("chat.postMessage").find((m) => String(m.text).startsWith("Start with")))).toMatchObject({ channel: "C0TIME", thread_ts: t });
  // The same reply with an @ comes twice from Slack (app_mention and message.channels): taken once.
  const n = rig.userMsgs().length;
  const both = sl.mentions("UWEY", "C0TIME", "and once more", { thread_ts: t });
  sl.inChannel("UWEY", "<@UBOT> and once more", { thread_ts: t, ts: both }, "C0TIME");
  await waitFor(() => rig!.userMsgs().length > n);
  // Not for it: a teammate in that thread (no stranger line either), the person's own top-level talk,
  // and a thread it never answered in.
  sl.inChannel("UTEAMMATE", "nice", { thread_ts: t }, "C0TIME");
  sl.inChannel("UWEY", "lunch?", {}, "C0TIME");
  sl.inChannel("UWEY", "in someone else's thread", { thread_ts: "1700000000.000001" }, "C0TIME");
  await new Promise((res) => setTimeout(res, 150));
  await hub.idle();
  expect(rig.userMsgs().length).toBe(n + 1);
  expect(slackView().strangerAt).toBeUndefined();
  // The DM stays the person's window.
  sl.says("UWEY", "here?");
  const d = await waitFor(() => rig!.userMsgs()[n + 1]);
  rig.say("Here.", d.seq);
  expect(await waitFor(() => sl.sent("chat.postMessage").find((m) => m.text === "Here."))).toMatchObject({ channel: "DUWEY" });
});

test("D571: an app without channels:history is asked to reinstall (its thread replies can't reach it)", async () => {
  rig = channelRig({ slackScopes: SCOPES.filter((x) => x !== "channels:history") });
  const { hub, sl } = rig;
  expect((await hub.connect("slack", { botToken: sl.botToken, appToken: sl.appToken })).ok).toBe(true);
  expect(slackView()).toMatchObject({ state: "unlinked", reinstall: true });
});

test("D571: switching to another partner in a thread: passed on, it says hello in that thread, and the thread is with it", async () => {
  const MANY = [
    { id: "default", name: "Ducter" },
    { id: "p4", name: "小玛" },
  ];
  rig = channelRig({ slackScopes: SCOPES, partners: MANY, looks: { default: "sand", p4: "sage" } });
  const { sl, log } = rig;
  await rig.linked("slack");
  const t = sl.mentions("UWEY", "C0TIME", "hi");
  const u = await waitFor(() => rig!.userMsgs()[0]);
  rig.say("嗨，我是 Ducter。", u.seq);
  await waitFor(() => sl.sent("chat.postMessage").find((m) => m.text === "嗨，我是 Ducter。"));
  // The person asks, in the thread, no @, to switch. The default partner judges it and passes it on (D486).
  sl.inChannel("UWEY", "切换到小玛", { thread_ts: t }, "C0TIME");
  const ask = await waitFor(() => rig!.userMsgs()[1]);
  const passed = log.append({ stream: "channel:p4", origin: "user", kind: "user_msg", persona: "p4", body: { text: "切换到小玛", passed: { from: "default" } } });
  rig.say("好，小玛来了。", ask.seq);
  log.append({ stream: "channel:p4", origin: "partner", kind: "ai_msg", persona: "p4", body: { text: "嗨，我是小玛。想聊增长还是投放？", replyTo: passed.seq } });
  const hello = await waitFor(() => sl.sent("chat.postMessage").find((m) => String(m.text).includes("我是小玛")));
  // In that thread, under 小玛's own name and face.
  expect(hello).toMatchObject({ channel: "C0TIME", thread_ts: t, username: "小玛", icon_url: faceUrl("sage") });
  // The person's next words in that thread are 小玛's, with no name in front.
  sl.inChannel("UWEY", "下周的投放怎么排？", { thread_ts: t }, "C0TIME");
  const next = await waitFor(() => log.read({ stream: "channel:p4", kinds: ["user_msg"], limit: 5 }).find((e) => (e.body as { text: string }).text === "下周的投放怎么排？"));
  expect((next.body as { via?: string }).via).toBe("slack");
  // The DM is still with the default: a thread never takes it.
  sl.says("UWEY", "DM 里呢？");
  await waitFor(() => rig!.userMsgs().find((m) => m.text === "DM 里呢？"));
  // And "Ducter，…" in the thread brings it back there.
  sl.inChannel("UWEY", "Ducter，你回来", { thread_ts: t }, "C0TIME");
  await waitFor(() => rig!.userMsgs().find((m) => m.text === "Ducter，你回来"));
});

// D580: live on hel (0.1.74), a colleague's post with a PR link and 「@Ducter …帮我合下」; the author's
// 「@Ducter 你帮忙交给我的 review loop 看下…」 in its thread. Ducter saw none of the thread and asked which PR.
const PR = "https://github.com/nowledge-co/nowledge-labs-website/pull/562";
const STEAM = "我把 siwei 之前 coscon（agibar）的演讲整理稿弄了，你帮我 review 下，没问题就帮我合下。有问题请评论";
const ASK = "你帮忙交给我的 review loop 看下，然后再给 pr babysitter 吧";

test("D580: first @ in a thread someone else started: the thread so far comes along, fenced and attributed, its link intact", async () => {
  rig = channelRig({ slackScopes: SCOPES, slackNames: { USTEAM: "Steam.yang" } });
  const { hub, sl } = rig;
  await rig.linked("slack");
  // The colleague's post @s the bot: not the linked person, so nothing (the stranger line only).
  const top = sl.mentions("USTEAM", "C0WEB", `<${PR}>\n<@UBOT> ${STEAM}`);
  sl.inChannel("USTEAM", "图在 PR 里", { thread_ts: top }, "C0WEB");
  await waitFor(() => slackView().strangerAt);
  await hub.idle();
  expect(rig.userMsgs()).toEqual([]);
  expect(sl.sent("conversations.replies")).toEqual([]);
  // The author's @ in that thread: the thread is read once, up to the mention.
  const at = sl.mentions("UWEY", "C0WEB", ASK, { thread_ts: top });
  const u = await waitFor(() => rig!.userMsgs()[0]);
  expect(u).toMatchObject({ text: ASK, via: "slack", clientId: `slack:C0WEB:${at}` });
  expect(sl.sent("conversations.replies")).toEqual([expect.objectContaining({ channel: "C0WEB", ts: top, latest: at })]);
  expect(u.thread).toEqual({
    app: "slack",
    said: [
      { who: "other", name: "Steam.yang", text: `@ducter ${PR}\n@ducter ${STEAM}` },
      { who: "other", name: "Steam.yang", text: "图在 PR 里" },
    ],
  });
  // The person's words stay only theirs.
  expect(u.text).not.toContain("合下");
  // Its answer goes in that thread, one it answers in from now on.
  rig.say("好，交给 review loop 看 #562，审完再给 PR babysitter。", u.seq);
  expect(await waitFor(() => sl.sent("chat.postMessage").find((m) => String(m.text).startsWith("好，交给")))).toMatchObject({ channel: "C0WEB", thread_ts: top });
});

test("D580: a thread it already answers in: nothing read, then only what it missed there", async () => {
  rig = channelRig({ slackScopes: SCOPES, slackNames: { USTEAM: "Steam.yang" } });
  const { hub, sl } = rig;
  await rig.linked("slack");
  const t = sl.mentions("UWEY", "C0WEB", "看下 #562");
  const u = await waitFor(() => rig!.userMsgs()[0]);
  expect(u.thread).toBeUndefined();
  rig.say("在看了。", u.seq);
  await waitFor(() => sl.sent("chat.postMessage").find((m) => m.text === "在看了。"));
  await hub.idle();
  // The person's reply (no @) and an @ in the thread it answers in: it knows the thread, no read.
  sl.inChannel("UWEY", "顺便看下图", { thread_ts: t }, "C0WEB");
  await waitFor(() => rig!.userMsgs()[1]);
  sl.mentions("UWEY", "C0WEB", "还有标题", { thread_ts: t });
  const third = await waitFor(() => rig!.userMsgs()[2]);
  expect(sl.sent("conversations.replies")).toEqual([]);
  expect(rig.userMsgs().every((m) => !m.thread)).toBe(true);
  expect(third.text).toBe("还有标题");
  // A colleague writes in it (dropped unread, nothing logged); the person's next words bring only that.
  const said = sl.inChannel("USTEAM", "标题我改过了，见 PR 第二个 commit", { thread_ts: t }, "C0WEB");
  await new Promise((r) => setTimeout(r, 100));
  await hub.idle();
  expect(rig.userMsgs().length).toBe(3);
  sl.inChannel("UWEY", "那就合吧", { thread_ts: t }, "C0WEB");
  const fourth = await waitFor(() => rig!.userMsgs()[3]);
  expect(sl.sent("conversations.replies")).toEqual([expect.objectContaining({ channel: "C0WEB", ts: t, oldest: said })]);
  expect(fourth.thread).toEqual({ app: "slack", since: true, said: [{ who: "other", name: "Steam.yang", text: "标题我改过了，见 PR 第二个 commit" }] });
  // Caught up: the next words there read nothing again.
  sl.inChannel("UWEY", "好了吗", { thread_ts: t }, "C0WEB");
  const fifth = await waitFor(() => rig!.userMsgs()[4]);
  expect(fifth.thread).toBeUndefined();
  expect(sl.sent("conversations.replies").length).toBe(1);
});

test("D580: the thread can't be read (an app without the history scopes): said plainly, never 'nothing there'", async () => {
  rig = channelRig({ slackScopes: SCOPES.filter((x) => x !== "channels:history" && x !== "groups:history") });
  const { sl } = rig;
  await rig.linked("slack");
  const top = sl.posted("USTEAM", `<${PR}> 帮我合下`, {}, "C0WEB");
  sl.mentions("UWEY", "C0WEB", ASK, { thread_ts: top });
  const u = await waitFor(() => rig!.userMsgs()[0]);
  expect(u.thread).toEqual({ app: "slack", unread: "scope" });
  // Known from the listed scopes: Slack isn't even asked.
  expect(sl.sent("conversations.replies")).toEqual([]);
});

test("D580: no scope list, and Slack answers missing_scope: the same honest line; another refusal reads 'failed'", async () => {
  rig = channelRig();
  const { sl } = rig;
  await rig.linked("slack");
  const top = sl.posted("USTEAM", `<${PR}> 帮我合下`, {}, "C0WEB");
  sl.failNext("conversations.replies", 200, { ok: false, error: "missing_scope", needed: "channels:history" });
  sl.mentions("UWEY", "C0WEB", ASK, { thread_ts: top });
  expect((await waitFor(() => rig!.userMsgs()[0])).thread).toEqual({ app: "slack", unread: "scope" });
  // Not a refused token: Slack stays linked.
  expect(slackView().state).toBe("linked");
  const other = sl.posted("USTEAM", "另一个", {}, "C0OPS");
  sl.failNext("conversations.replies", 200, { ok: false, error: "thread_not_found" });
  sl.mentions("UWEY", "C0OPS", "看下这个", { thread_ts: other });
  expect((await waitFor(() => rig!.userMsgs()[1])).thread).toEqual({ app: "slack", unread: "failed" });
});

test("D580: a long thread comes bounded: its first message, then the newest, about 4,000 characters", async () => {
  rig = channelRig({ slackScopes: SCOPES, slackNames: { USTEAM: "Steam.yang" } });
  const { sl } = rig;
  await rig.linked("slack");
  const top = sl.posted("USTEAM", `<${PR}> 帮我 review`, {}, "C0WEB");
  for (let i = 0; i < 40; i++) sl.posted(i % 2 ? "UWEY" : "USTEAM", `第 ${i} 条 ${"字".repeat(300)}`, { thread_ts: top }, "C0WEB");
  sl.mentions("UWEY", "C0WEB", ASK, { thread_ts: top });
  const u = await waitFor(() => rig!.userMsgs()[0]);
  const said = u.thread!.said!;
  expect(said[0]).toEqual({ who: "other", name: "Steam.yang", text: `${PR} 帮我 review` });
  expect(said.at(-1)!.text).toStartWith("第 39 条");
  expect(said.length).toBeLessThanOrEqual(20);
  expect(said.map((s) => s.text).join("").length).toBeLessThanOrEqual(4_100);
  expect(u.thread!.more).toBe(41 - said.length);
  // The person's own earlier words there are marked as theirs, with no name.
  expect(said.at(-1)).toMatchObject({ who: "user" });
  expect(said.at(-1)!.name).toBeUndefined();
});
