// D277: the Mac app's iMessage bridge relays the person's words with via "imessage" and says how it
// stands; only a desktop socket may say via, and the home knows a chat app reaches the person.
import { afterEach, expect, test } from "bun:test";
import type { Bodies, ServerFrame } from "@ducter/protocol";
import { startCore, type Core } from "../src/core.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

async function client(core: Core, kind?: string) {
  const frames: ServerFrame[] = [];
  const ws = new WebSocket(core.url);
  ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
  await new Promise<void>((res, rej) => ((ws.onopen = () => res()), (ws.onerror = rej)));
  stops.push(() => ws.close());
  ws.send(JSON.stringify({ t: "hello", ...(kind ? { client: kind } : {}) }));
  const until = async (pred: (f: ServerFrame) => boolean) => {
    for (let i = 0; i < 200; i++) {
      const hit = frames.find(pred);
      if (hit) return hit;
      await Bun.sleep(10);
    }
    throw new Error(`timeout; got ${frames.map((f) => f.t)}`);
  };
  await until((f) => f.t === "on_hand");
  return { send: (f: object) => ws.send(JSON.stringify(f)), until, close: () => ws.close() };
}

const echoOf = (clientId: string) => (f: ServerFrame) =>
  f.t === "events" && f.events.some((e) => e.kind === "user_msg" && (e.body as Bodies["user_msg"]).clientId === clientId);

test("a desktop socket's via imessage is kept on the user message; a web socket's is dropped", async () => {
  const t = tempDir();
  stops.push(t.cleanup);
  const core = startCore({ dataDir: t.dir, port: 0, batchMs: 5 });
  core.setPartner({ onTrigger: () => {} });
  stops.push(() => core.stop());
  const mac = await client(core, "desktop");
  mac.send({ t: "send", text: "看下 CI", clientId: "imessage:g1", via: "imessage" });
  await mac.until(echoOf("imessage:g1"));
  const web = await client(core, "web");
  web.send({ t: "send", text: "hi", clientId: "w1", via: "imessage" });
  await web.until(echoOf("w1"));
  const vias = core.log.read({ kinds: ["user_msg"] }).map((e) => (e.body as Bodies["user_msg"]).via);
  expect(vias).toEqual(["imessage", undefined]);
});

test("channel_status on says a chat app reaches the person, until the socket goes", async () => {
  const t = tempDir();
  stops.push(t.cleanup);
  const core = startCore({ dataDir: t.dir, port: 0, batchMs: 5 });
  core.setPartner({ onTrigger: () => {} });
  stops.push(() => core.stop());
  const mac = await client(core, "desktop");
  expect(core.channelUp("imessage")).toBe(false);
  mac.send({ t: "channel_status", channel: "imessage", state: "on" });
  for (let i = 0; i < 100 && !core.channelUp("imessage"); i++) await Bun.sleep(10);
  expect(core.channelUp("imessage")).toBe(true);
  expect(core.channelUp("telegram")).toBe(false);
  mac.send({ t: "channel_status", channel: "imessage", state: "needs_permission" });
  for (let i = 0; i < 100 && core.channelUp("imessage"); i++) await Bun.sleep(10);
  expect(core.channelUp("imessage")).toBe(false);
  mac.send({ t: "channel_status", channel: "imessage", state: "on" });
  for (let i = 0; i < 100 && !core.channelUp("imessage"); i++) await Bun.sleep(10);
  mac.close();
  for (let i = 0; i < 100 && core.channelUp("imessage"); i++) await Bun.sleep(10);
  expect(core.channelUp("imessage")).toBe(false);
});

test("D323: every Chat apps page hears which Mac carries iMessage, and that it stops when its socket goes", async () => {
  const t = tempDir();
  stops.push(t.cleanup);
  const core = startCore({ dataDir: t.dir, port: 0, batchMs: 5 });
  core.setPartner({ onTrigger: () => {} });
  stops.push(() => core.stop());
  type Channels = Extract<ServerFrame, { t: "channels" }>;
  const web = await client(core, "web");
  web.send({ t: "channels" });
  const first = (await web.until((f) => f.t === "channels")) as Channels;
  expect(first.imessage).toBeUndefined();
  const mini = await client(core, "desktop");
  mini.send({ t: "channel_status", channel: "imessage", state: "on", computer: "Mac mini\u0007" });
  const on = (await web.until((f) => f.t === "channels" && !!f.imessage)) as Channels;
  expect(on.imessage).toEqual([{ computer: "Mac mini", state: "on" }]);
  mini.send({ t: "channels" });
  const own = (await mini.until((f) => f.t === "channels" && !!f.imessage)) as Channels;
  expect(own.imessage).toEqual([{ computer: "Mac mini", state: "on", here: true }]);
  mini.close();
  const gone = (await web.until((f) => f.t === "channels" && f !== first && !f.imessage)) as Channels;
  expect(gone.imessage).toBeUndefined();
});

test("D516: a Mac showing another partner keeps via imessage on that partner's words, so its bridge answers there", async () => {
  const t = tempDir();
  stops.push(t.cleanup);
  const core = startCore({ dataDir: t.dir, port: 0, batchMs: 5, partners: true });
  core.setPartner({ onTrigger: () => {} });
  stops.push(() => core.stop());
  expect(core.partners.add({ name: "小家" }).ok).toBe(true);
  const frames: ServerFrame[] = [];
  const ws = new WebSocket(core.url);
  ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
  await new Promise<void>((res, rej) => ((ws.onopen = () => res()), (ws.onerror = rej)));
  stops.push(() => ws.close());
  ws.send(JSON.stringify({ t: "hello", client: "desktop", persona: "p2" }));
  for (let i = 0; i < 200 && !frames.some((f) => f.t === "welcome"); i++) await Bun.sleep(10);
  ws.send(JSON.stringify({ t: "send", text: "周六的牙医约了吗", clientId: "imessage:g2", via: "imessage" }));
  for (let i = 0; i < 200 && !frames.some(echoOf("imessage:g2")); i++) await Bun.sleep(10);
  const mine = core.log.read({ stream: "channel:p2", kinds: ["user_msg"] }).map((e) => e.body as Bodies["user_msg"]);
  expect(mine.map((b) => [b.text, b.via])).toEqual([["周六的牙医约了吗", "imessage"]]);
});
