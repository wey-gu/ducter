// D301: the partner in the person's own WeChat, through WeChat's ClawBot, against a fake iLink.
import { afterEach, expect, test } from "bun:test";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { WECHAT_WINDOW_SENDS } from "../src/channels/index.ts";
import { parseLossless } from "../src/channels/wechat.ts";
import { channelRig, waitFor } from "./channels-rig.ts";
import { OTHER, SCANNER } from "./fake-wechat.ts";
import { png } from "./fixtures-media.ts";

let rig: ReturnType<typeof channelRig> | undefined;
afterEach(() => {
  rig?.stop();
  rig = undefined;
});

const wechat = () => rig!.hub.view().find((v) => v.kind === "wechat")!;

test("Connect puts up a QR; the scan says how far it got; Confirm on the phone links the one who scanned", async () => {
  rig = channelRig();
  const { hub, wx } = rig;
  expect(wechat().state).toBe("off");
  expect((await hub.connect("wechat", {})).ok).toBe(true);
  const v = wechat();
  expect(v.state).toBe("scan");
  expect(v.scan!.step).toBe("wait");
  expect(v.scan!.link).toContain("qrcode=qr-1");
  expect(v.scan!.qr.length).toBeGreaterThan(20);
  expect(v.scan!.qr.every((r) => /^[01]+$/.test(r))).toBe(true);
  wx.scan({ status: "scaned" });
  await waitFor(() => wechat().scan?.step === "scanned");
  wx.confirm();
  await waitFor(() => wechat().state === "linked");
  const linked = wechat();
  expect(linked.bot).toEqual({ name: "ClawBot" });
  expect(linked.linked?.name).toBe("");
  // It hasn't heard from them yet: nothing it may say on its own.
  expect(linked.openUntil).toBeUndefined();
  // No code to type: the scan was the pairing.
  expect(hub.code("wechat")).toEqual({ ok: false, reason: "busy" });
  // The token is in the 0600 file only; the client frame has neither it nor the scanner's id.
  const path = join(rig.dir, "channels.json");
  expect(statSync(path).mode & 0o777).toBe(0o600);
  expect(readFileSync(path, "utf8")).toContain(wx.token);
  expect(JSON.stringify(hub.frame())).not.toContain(wx.token);
  expect(JSON.stringify(hub.frame())).not.toContain(SCANNER);
  // It says who it is, on every call.
  const start = wx.calls.find((c) => c.path === "msg/notifystart")!;
  expect(start.headers["ilink-app-id"]).toBe("bot");
  expect(start.body.base_info.bot_agent).toMatch(/^Ducter\//);
  expect(start.body.base_info.channel_version).toBe("2.4.10-ducter");
});

test("WeChat's number is passed on; a QR that keeps running out ends back at Connect, saying so", async () => {
  rig = channelRig();
  const { hub, wx } = rig;
  await hub.connect("wechat", {});
  wx.scan({ status: "need_verifycode" });
  await waitFor(() => wechat().scan?.step === "verify");
  expect((await hub.connect("wechat", { verifyCode: "12 34" })).ok).toBe(true);
  await waitFor(() => wx.sent("get_qrcode_status").some((q) => q.verify_code === "1234"));
  wx.scan({ status: "expired" }, { status: "expired" }, { status: "expired" }, { status: "expired" });
  await waitFor(() => wechat().state === "off");
  expect(wechat().reason).toBe("expired");
  expect(wx.sent("get_bot_qrcode").length).toBe(4); // the first and three fresh ones
  // Disconnect during a scan takes the QR down.
  await hub.connect("wechat", {});
  expect(wechat().state).toBe("scan");
  hub.forget("wechat");
  expect(wechat()).toEqual({ kind: "wechat", state: "off" });
});

test("their words come into the one conversation; the answer goes back with their context; anyone else is ignored", async () => {
  rig = channelRig();
  const { wx, hub } = rig;
  await rig.linked("wechat");
  wx.says(SCANNER, "明天上午有什么会？");
  const u = await waitFor(() => rig!.userMsgs()[0]);
  expect(u.text).toBe("明天上午有什么会？");
  expect(u.via).toBe("wechat");
  // The uint64 message id survived JSON.
  expect(u.clientId).toMatch(/^wechat:.+:7000000000000000\d{3}$/);
  expect(hub.lastRoute()).toBe("wechat");
  expect(Date.parse(wechat().openUntil!)).toBeGreaterThan(rig.clock.now()); // the rig's clock, not the day the test runs
  rig.say("十点一个，和设计组。", u.seq);
  await waitFor(() => wx.texts().includes("十点一个，和设计组。"));
  const sent = wx.sent("sendmessage").at(-1)!;
  expect(sent.msg.to_user_id).toBe(SCANNER);
  expect(sent.msg.context_token).toMatch(/^ctx-/);
  expect(sent.msg.message_type).toBe(2);
  // Typing showed while it thought.
  expect(wx.sent("sendtyping").length).toBeGreaterThan(0);
  // Someone else, a group: nothing logged, nothing answered.
  const before = wx.texts().length;
  wx.says(OTHER, "我是他朋友，帮我查一下");
  wx.inGroup(SCANNER, "群里说一句");
  await new Promise((r) => setTimeout(r, 300));
  await hub.idle();
  expect(rig.userMsgs().length).toBe(1);
  expect(wx.texts().length).toBe(before);
  expect(wechat().strangerAt).toBeDefined();
});

test("it writes on its own only inside the window: not before their words, not after a day, not past its few messages", async () => {
  rig = channelRig();
  const { wx, hub, clock, log } = rig;
  await rig.linked("wechat");
  // Never heard from: a find stays in the app (and its push is not claimed).
  log.append({ stream: "channel", origin: "partner", kind: "finds", body: { noteId: "n1", opening: "看了一眼你的邮件。", finds: [{ text: "周五的机票还没值机。" }] } as never });
  await new Promise((r) => setTimeout(r, 50));
  await hub.idle();
  expect(wx.texts()).toEqual([]);
  expect(hub.claimed("n:n1")).toBe(false);
  // They speak: the window opens.
  wx.says(SCANNER, "在吗");
  const u = await waitFor(() => rig!.userMsgs()[0]);
  expect(hub.lastRoute()).toBe("wechat");
  clock.advance(20 * 60_000); // the turn is over: what comes now is its own
  log.append({ stream: "channel", origin: "partner", kind: "finds", body: { noteId: "n2", opening: "又看了一眼。", finds: [{ text: "房东回信了。" }] } as never });
  await waitFor(() => wx.texts().some((t) => t.startsWith("又看了一眼。")));
  expect(hub.claimed("n:n2")).toBe(true);
  // Its few messages for this window: then it stops, and says so to Settings.
  for (let i = 0; i < WECHAT_WINDOW_SENDS + 3; i++) rig.say(`第 ${i} 件`, u.seq);
  await waitFor(() => wx.texts().length >= WECHAT_WINDOW_SENDS);
  await new Promise((r) => setTimeout(r, 50));
  await hub.idle();
  expect(wx.texts().length).toBe(WECHAT_WINDOW_SENDS);
  expect(Date.parse(wechat().openUntil!)).toBeLessThanOrEqual(clock.now());
  // Their next words open it again; a day later it is closed again.
  wx.says(SCANNER, "继续");
  await waitFor(() => rig!.userMsgs().length === 2);
  rig.say("好的。", rig.userMsgs()[1]!.seq);
  await waitFor(() => wx.texts().includes("好的。"));
  clock.advance(24 * 3600_000);
  const n = wx.texts().length;
  log.append({ stream: "channel", origin: "partner", kind: "finds", body: { noteId: "n3", opening: "早上好。", finds: [{ text: "今天下雨。" }] } as never });
  await new Promise((r) => setTimeout(r, 50));
  await hub.idle();
  expect(wx.texts().length).toBe(n);
  expect(hub.claimed("n:n3")).toBe(false);
});

test("WeChat refusing for the window closes it until they speak", async () => {
  rig = channelRig();
  const { wx, hub } = rig;
  await rig.linked("wechat");
  wx.says(SCANNER, "说两句");
  const u = await waitFor(() => rig!.userMsgs()[0]);
  wx.sendAnswers(-2);
  rig.say("第一句。", u.seq);
  await waitFor(() => wx.calls.some((c) => c.path === "sendmessage"));
  await hub.idle();
  rig.say("第二句。", u.seq);
  await new Promise((r) => setTimeout(r, 50));
  await hub.idle();
  expect(wx.texts()).toEqual(["第一句。"]); // the refused one, and nothing after it
  expect(Date.parse(wechat().openUntil!)).toBeLessThanOrEqual(Date.now() + 1000);
});

test("no buttons there: a question says which words answer it, and a typed 好 does; the rest is Open in Ducter with its address", async () => {
  rig = channelRig({ openUrl: "https://home.example.com/" });
  const { wx, decisions, clock, log } = rig;
  await rig.linked("wechat");
  wx.says(SCANNER, "把这个分支合进去");
  const u = await waitFor(() => rig!.userMsgs()[0]);
  const id = (rig.ask().body as { decisionId: string }).decisionId;
  const card = await waitFor(() => wx.texts().find((t) => t.startsWith("要把它合进 main 吗")));
  expect(card).toContain("回「好」就合进去，回「先等等」就先放着。");
  wx.says(SCANNER, "好");
  await waitFor(() => !decisions.isPending(id));
  expect(rig.userMsgs().length).toBe(1);
  const send = (rig.ask({ question: "把这封信发给老王？", goLabel: "发", reversible: false, defaultAt: undefined, defaultOption: "hold" }).body as { decisionId: string }).decisionId;
  const open = await waitFor(() => wx.texts().find((t) => t.startsWith("把这封信发给老王")));
  expect(open).toBe(`把这封信发给老王？\n\n在 Ducter 里看看：https://home.example.com/app#d=${send}`);
  // A long job gets no status line there (it couldn't be brought up to date).
  log.append({ stream: "channel", origin: "partner", kind: "ack", body: { jobId: "job_1", text: "我去跑全部测试。", replyTo: u.seq } });
  await waitFor(() => wx.texts().includes("我去跑全部测试。"));
  clock.advance(61_000);
  await new Promise((r) => setTimeout(r, 50));
  expect(wx.texts().some((t) => t.startsWith("还在做"))).toBe(false);
});

test("a picture and a voice message come in; a picture goes out through WeChat's encrypted CDN", async () => {
  rig = channelRig();
  const { wx, media } = rig;
  await rig.linked("wechat");
  const pic = png(8, 8);
  wx.picture(SCANNER, pic);
  const m = await waitFor(() => rig!.userMsgs().find((x) => x.media?.length));
  expect(m.media![0]!.type).toBe("image/png");
  expect(new Uint8Array(readFileSync(media.path(m.media![0]!.id)!))).toEqual(pic);
  wx.voice(SCANNER, "帮我记一下，周五交房租");
  await waitFor(() => rig!.userMsgs().some((x) => x.text === "帮我记一下，周五交房租"));
  const ref = media.put(png(6, 6), { name: "chart.png" });
  rig.say("这是图。", m.seq, { media: [ref] });
  const sent = await waitFor(() => wx.sent("sendmessage").find((b) => b.msg.item_list[0].type === 2));
  expect(sent.msg.item_list[0].image_item.media.encrypt_type).toBe(1);
  expect(new Uint8Array(wx.opened(sent.msg.item_list[0].image_item)!)).toEqual(png(6, 6));
  const up = wx.sent("getuploadurl").at(-1)!;
  expect(up.media_type).toBe(1);
  expect(up.to_user_id).toBe(SCANNER);
});

test("a stale token reads as Can't connect, and Connect scans again", async () => {
  rig = channelRig();
  const { wx } = rig;
  await rig.linked("wechat");
  wx.goStale();
  await waitFor(() => wechat().state === "cant_connect");
  expect(wechat().reason).toBe("token");
  // No error a client could see carries the token.
  expect(JSON.stringify(rig.hub.frame())).not.toContain(wx.token);
});

test("uint64 ids are read without losing digits", () => {
  expect(parseLossless<{ message_id: string; n: number }>('{"message_id":7000000000000000123,"n":5}')).toEqual({ message_id: "7000000000000000123", n: 5 });
});
