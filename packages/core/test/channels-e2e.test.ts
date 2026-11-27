// D276 end to end: a core started in the test, Settings over its WebSocket connects a Telegram bot
// (a fake Bot API) and links it; the person's words reach the partner as a user message via
// telegram, the partner's answer goes back, a card's button decides it, and its push is skipped.
import { afterEach, expect, test } from "bun:test";
import type { Bodies, LogEvent, ServerFrame } from "@ducter/protocol";
import { createTelegram, createWechat } from "../src/channels/index.ts";
import { startCore } from "../src/core.ts";
import { PERSON, waitFor } from "./channels-rig.ts";
import { fakeTelegram } from "./fake-telegram.ts";
import { fakeWechat, SCANNER } from "./fake-wechat.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

test("Settings connects and links Telegram; a turn there goes through the one conversation and back", async () => {
  const t = tempDir();
  stops.push(t.cleanup);
  const tg = fakeTelegram();
  stops.push(() => tg.stop());
  const core = startCore({
    dataDir: t.dir,
    port: 0,
    batchMs: 5,
    pushHoldMs: 30,
    channels: {
      gapMs: 0,
      sleep: async () => {},
      make: (kind, rec, store) => createTelegram({ token: rec.token, api: tg.api, pollSeconds: 1, backoffMs: 20, offset: () => store.get("telegram")?.offset, setOffset: (n) => store.patch("telegram", { offset: n }) }),
    },
  });
  stops.push(() => core.stop());
  // The partner, faked: it answers each message from Telegram, and asks one reversible question.
  core.setPartner({
    onTrigger: (e: LogEvent) => {
      if (e.kind !== "user_msg") return;
      const b = e.body as Bodies["user_msg"];
      core.log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: `收到：${b.text}`, replyTo: e.seq } });
      core.log.append({ stream: "channel", origin: "partner", kind: "decision", body: { decisionId: "d_e2e000001", question: "现在就开始吗？", goLabel: "开始", defaultOption: "go", reversible: true, defaultAt: new Date(Date.now() + 600_000).toISOString() } });
    },
  });

  const frames: ServerFrame[] = [];
  const ws = new WebSocket(core.url);
  ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
  await new Promise<void>((res, rej) => ((ws.onopen = () => res()), (ws.onerror = rej)));
  stops.push(() => ws.close());
  const send = (f: object) => ws.send(JSON.stringify(f));
  send({ t: "hello", client: "web" });
  send({ t: "channels" });
  const first = await waitFor(() => frames.find((f) => f.t === "channels") as Extract<ServerFrame, { t: "channels" }> | undefined);
  expect(first.channels.map((c) => c.kind)).toEqual(["telegram", "slack", "feishu", "wechat"]);
  expect(first.channels.every((c) => c.state === "off")).toBe(true);
  expect(JSON.parse(first.slackManifest).features.bot_user.display_name).toBe("Ducter");

  send({ t: "channel_connect", kind: "telegram", token: tg.token });
  await waitFor(() => frames.find((f) => f.t === "channel_result" && f.op === "connect" && f.ok));
  send({ t: "channel_code", kind: "telegram" });
  const code = (await waitFor(() => frames.find((f) => f.t === "channel_result" && f.op === "code"))) as Extract<ServerFrame, { t: "channel_result" }>;
  expect(code.link).toMatch(/^https:\/\/t\.me\/my_ducter_bot\?start=[A-Z2-9]{8}$/);
  // No frame ever carries the token.
  expect(JSON.stringify(frames)).not.toContain(tg.token);

  tg.says(PERSON, `/start ${code.link!.split("start=")[1]}`);
  await waitFor(() => frames.some((f) => f.t === "channels" && f.channels[0]!.state === "linked"));

  tg.says(PERSON, "今天有什么要我做的？");
  await waitFor(() => tg.sent("sendMessage").some((m) => m.text === "收到：今天有什么要我做的？"));
  // The app sees the same message, marked as said in Telegram.
  await waitFor(() => frames.some((f) => f.t === "events" && f.events.some((e) => e.kind === "user_msg" && (e.body as Bodies["user_msg"]).via === "telegram")));
  const card = await waitFor(() => tg.calls.find((c) => c.method === "sendMessage" && String(c.body.text).startsWith("现在就开始吗")));
  tg.taps(PERSON, card.id!, "g:d_e2e000001");
  await waitFor(() => core.log.read({ kinds: ["decision_resolved"], limit: 5 }).some((e) => (e.body as Bodies["decision_resolved"]).decisionId === "d_e2e000001"));
  await waitFor(() => tg.sent("editMessageText").some((m) => m.text === "现在就开始吗？\n\n你说：好，开始"));
  // It went to Telegram, so the app's push for it is not sent too.
  expect(core.channels.claimed("d:d_e2e000001")).toBe(true);
  await Bun.sleep(80);
  expect(core.pusher.pending()).not.toContain("d:d_e2e000001");
});

test("D301: Settings puts up WeChat's QR over the socket; the scan links it; a message there goes through and back", async () => {
  const t = tempDir();
  stops.push(t.cleanup);
  const wx = fakeWechat();
  stops.push(() => wx.stop());
  const core = startCore({
    dataDir: t.dir,
    port: 0,
    batchMs: 5,
    pushHoldMs: 30,
    channels: {
      gapMs: 0,
      sleep: async () => {},
      wechat: { api: wx.api, pollGapMs: 5 },
      make: (_kind, rec, store) => createWechat({ token: rec.token, api: wx.api, ...(rec.base ? { base: rec.base } : {}), cdn: `${wx.api}/cdn`, botId: rec.bot?.id ?? "", pollMs: 400, backoffMs: 20, state: () => ({ ...(store.get("wechat")?.ctx ? { ctx: store.get("wechat")!.ctx } : {}) }), save: (p) => store.patch("wechat", p) }),
    },
  });
  stops.push(() => core.stop());
  core.setPartner({
    onTrigger: (e: LogEvent) => {
      if (e.kind !== "user_msg") return;
      core.log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: `收到：${(e.body as Bodies["user_msg"]).text}`, replyTo: e.seq } });
    },
  });
  const frames: ServerFrame[] = [];
  const ws = new WebSocket(core.url);
  ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
  await new Promise<void>((res, rej) => ((ws.onopen = () => res()), (ws.onerror = rej)));
  stops.push(() => ws.close());
  const send = (f: object) => ws.send(JSON.stringify(f));
  send({ t: "hello", client: "web" });
  send({ t: "channels" });
  send({ t: "channel_connect", kind: "wechat" });
  const wxAt = (f: Extract<ServerFrame, { t: "channels" }>) => f.channels.find((c) => c.kind === "wechat")!;
  const scan = await waitFor(() => frames.find((x) => x.t === "channels" && wxAt(x as Extract<ServerFrame, { t: "channels" }>).state === "scan") as Extract<ServerFrame, { t: "channels" }> | undefined);
  expect(wxAt(scan).scan!.qr.length).toBeGreaterThan(20);
  wx.confirm();
  await waitFor(() => frames.some((f) => f.t === "channels" && wxAt(f).state === "linked"));
  wx.says(SCANNER, "今天有什么要我做的？");
  await waitFor(() => wx.texts().includes("收到：今天有什么要我做的？"));
  await waitFor(() => frames.some((f) => f.t === "events" && f.events.some((e) => e.kind === "user_msg" && (e.body as Bodies["user_msg"]).via === "wechat")));
  expect(JSON.stringify(frames)).not.toContain(wx.token);
});

test("D649: in Telegram, asking for another partner through the partner tool switches the thread, and it answers there under its name", async () => {
  const t = tempDir();
  stops.push(t.cleanup);
  const tg = fakeTelegram();
  stops.push(() => tg.stop());
  const core = startCore({
    dataDir: t.dir,
    port: 0,
    batchMs: 5,
    partners: true,
    channels: {
      gapMs: 0,
      sleep: async () => {},
      make: (kind, rec, store) => createTelegram({ token: rec.token, api: tg.api, pollSeconds: 1, backoffMs: 20, offset: () => store.get("telegram")?.offset, setOffset: (n) => store.patch("telegram", { offset: n }) }),
    },
  });
  stops.push(() => core.stop());
  core.setPartner({ onTrigger: () => {} });
  core.setPartnerFactory(() => ({ onTrigger: () => {} }));
  const made = core.partners.add({ name: "小家", about: "家里的事" });
  if (!made.ok) throw new Error("no second partner");
  const home = made.partner.id;

  expect((await core.channels.connect("telegram", { token: tg.token })).ok).toBe(true);
  const c = core.channels.code("telegram");
  if (!c.ok) throw new Error("no code");
  tg.says(PERSON, `/start ${c.link!.split("start=")[1]}`);
  await waitFor(() => core.channels.view().find((v) => v.kind === "telegram")?.state === "linked");

  // Before the person writes: not a chat-app turn, so nothing moves.
  expect(await core.mcp.call({ role: "partner" }, "partner", { do: "switch", to: "小家" })).toMatchObject({ ok: false });

  tg.says(PERSON, "我想和小家聊");
  await waitFor(() => (core.log.read({ stream: "channel", kinds: ["user_msg"], limit: 5 }).length ? true : undefined));
  const switched = (await core.mcp.call({ role: "partner" }, "partner", { do: "switch", to: "小家" })) as { ok: boolean; with?: string };
  expect(switched).toMatchObject({ ok: true, with: "小家" });
  const passed = core.log.read({ stream: `channel:${home}`, kinds: ["user_msg"], limit: 5 }).at(-1)!;
  expect(passed.body).toMatchObject({ text: "我想和小家聊", passed: { from: "default" } });
  // 小家 answers in the Telegram thread, led by its name.
  core.log.append({ stream: `channel:${home}`, origin: "partner", kind: "ai_msg", body: { text: "在，想聊什么？", replyTo: passed.seq } });
  await waitFor(() => tg.sent("sendMessage").some((m) => String(m.text).startsWith("小家：在，想聊什么？")));
  // The thread stays with it: the next words without a name are 小家's.
  tg.says(PERSON, "这周跑了几次步？");
  await waitFor(() => core.log.read({ stream: `channel:${home}`, kinds: ["user_msg"], limit: 10 }).some((e) => (e.body as Bodies["user_msg"]).text === "这周跑了几次步？"));
});
