// The partner's settings over the client socket (D71): one frame for the Partner page and the
// phone's Settings sheet, persisted where each setting already lived, pushed to every subscriber.
import { afterEach, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ServerFrame } from "@ducter/protocol";
import { startCore, type Core } from "../src/core.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

function boot(dir?: string): { core: Core; dir: string } {
  const t = tempDir();
  const d = dir ?? t.dir;
  const core = startCore({ dataDir: d, port: 0, batchMs: 5, deviceProbes: { cua: async () => null, harnesses: async () => [], kind: async () => "laptop" } });
  stops.push(t.cleanup, () => core.stop());
  core.setPartner({ onTrigger: () => {} });
  return { core, dir: d };
}

async function client(url: string) {
  const frames: ServerFrame[] = [];
  const ws = new WebSocket(url);
  ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
  await new Promise<void>((res, rej) => ((ws.onopen = () => res()), (ws.onerror = rej)));
  stops.push(() => ws.close());
  ws.send(JSON.stringify({ t: "hello" }));
  const until = async <T extends ServerFrame>(pred: (f: ServerFrame) => boolean, after = 0): Promise<T> => {
    for (let i = 0; i < 300; i++) {
      const hit = frames.slice(after).find(pred);
      if (hit) return hit as T;
      await Bun.sleep(10);
    }
    throw new Error(`timeout; got ${frames.map((f) => f.t)}`);
  };
  await until((f) => f.t === "on_hand");
  return { send: (f: object) => ws.send(JSON.stringify(f)), until, frames };
}

type SettingsFrame = Extract<ServerFrame, { t: "settings" }>;

test("defaults: follow the user, remember, notifications on, no quiet hours, 30 minutes", async () => {
  const { core } = boot();
  const c = await client(core.url);
  c.send({ t: "settings" });
  const f = await c.until<SettingsFrame>((x) => x.t === "settings");
  expect(f.settings).toEqual({ name: "Ducter", language: "auto", memory: true, notify: true, quiet: null, defaultAfterMin: 30, brain: { harness: "claude-code", model: "opus" } });
  expect(f.mem.state).toBe("missing"); // nothing has answered from Mem yet
  expect(f.mem.noted).toEqual([]);
});

test("a change goes to every subscriber and persists where each setting lives", async () => {
  const { core, dir } = boot();
  const a = await client(core.url);
  const b = await client(core.url);
  a.send({ t: "settings" });
  b.send({ t: "settings" });
  await a.until((x) => x.t === "settings");
  const n = b.frames.length;
  await b.until((x) => x.t === "settings");
  a.send({ t: "settings_set", patch: { name: "  小鸭\n ", language: "zh", quiet: { start: "22:30", end: "07:00", tz: "Asia/Shanghai" }, defaultAfterMin: 60, notify: false } });
  const f = await b.until<SettingsFrame>((x) => x.t === "settings" && (x as SettingsFrame).settings.name === "小鸭", n);
  expect(f.settings).toMatchObject({ name: "小鸭", language: "zh", notify: false, defaultAfterMin: 60, quiet: { start: "22:30", end: "07:00", tz: "Asia/Shanghai" } });
  expect(core.persona.name).toBe("小鸭");
  expect(JSON.parse(readFileSync(join(dir, "persona.json"), "utf8")).name).toBe("小鸭");
  expect(JSON.parse(readFileSync(join(dir, "settings.json"), "utf8"))).toMatchObject({ language: "zh", defaultAfterMin: 60 });
  expect(core.push.settings()).toMatchObject({ off: true, quiet: { start: "22:30" } });
  // A decision asked now waits the chosen hour.
  expect(core.settings.defaultAfterMs()).toBe(60 * 60_000);
});

test("invalid values are ignored", async () => {
  const { core } = boot();
  expect(core.settings.set({ defaultAfterMin: 7, language: "fr" as any, quiet: { start: "25:00", end: "08:00", tz: "UTC" }, name: "   " })).toEqual([]);
  expect(core.settings.get()).toMatchObject({ name: "Ducter", language: "auto", defaultAfterMin: 30, quiet: null });
});

test("forget: Mem forgets it when it has the id, otherwise it is only hidden here", async () => {
  const { core, dir } = boot();
  const forgotten: string[] = [];
  core.settings.setForgetter(async (id) => (forgotten.push(id), true));
  const withId = core.log.append({ stream: "channel", origin: "partner", kind: "memory_noted", body: { title: "测试统一用假时钟", memoryId: "m_123" } });
  const noId = core.log.append({ stream: "channel", origin: "partner", kind: "memory_noted", body: { title: "Prefers short replies" } });
  const c = await client(core.url);
  c.send({ t: "settings" });
  const f0 = await c.until<SettingsFrame>((x) => x.t === "settings");
  expect(f0.mem.state).toBe("connected");
  expect(f0.mem.noted.map((x) => x.title)).toEqual(["Prefers short replies", "测试统一用假时钟"]);

  let n = c.frames.length;
  c.send({ t: "memory_forget", seq: withId.seq });
  const f1 = await c.until<SettingsFrame>((x) => x.t === "settings" && !!(x as SettingsFrame).forgot, n);
  expect(f1.forgot).toEqual({ seq: withId.seq, how: "mem" });
  expect(forgotten).toEqual(["m_123"]);
  expect(f1.mem.noted.map((x) => x.seq)).toEqual([noId.seq]);

  n = c.frames.length;
  c.send({ t: "memory_forget", seq: noId.seq });
  const f2 = await c.until<SettingsFrame>((x) => x.t === "settings" && (x as SettingsFrame).forgot?.seq === noId.seq, n);
  expect(f2.forgot!.how).toBe("hidden");
  expect(f2.mem.noted).toEqual([]);
  expect(existsSync(join(dir, "settings.json"))).toBe(true);
});

test("memory off: the view says off", async () => {
  const { core } = boot();
  core.settings.set({ memory: false });
  const v = await core.settings.view();
  expect(v.settings.memory).toBe(false);
  expect(v.mem.state).toBe("off");
});
