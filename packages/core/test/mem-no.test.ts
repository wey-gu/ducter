// D669 (#4): Mem's no reaches the person. A spoken 别记这个 whose undo Mem refuses is not
// silent: the Noted line says still noted in the failed ink on every client (the settings frame's
// undid), the partner's next turn gets the fact that it was not taken back (a refused undo has
// failed:true by the time takenBackSettled answers), and the Log keeps the failed intent. Over fake
// hooks only; nothing here reaches Mem.
import { afterEach, expect, test } from "bun:test";
import type { Bodies, ServerFrame } from "@ducter/protocol";
import { startCore, type Core } from "../src/core.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

type SettingsFrame = Extract<ServerFrame, { t: "settings" }>;

function boot(): { core: Core } {
  const t = tempDir();
  const core = startCore({ dataDir: t.dir, port: 0, batchMs: 5, deviceProbes: { cua: async () => null, harnesses: async () => [], kind: async () => "laptop" } });
  stops.push(t.cleanup, () => core.stop());
  core.setPartner({ onTrigger: () => {} });
  return { core };
}

async function client(url: string) {
  const frames: ServerFrame[] = [];
  const ws = new WebSocket(url);
  ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
  await new Promise<void>((res, rej) => ((ws.onopen = () => res()), (ws.onerror = rej)));
  stops.push(() => ws.close());
  ws.send(JSON.stringify({ t: "hello" }));
  const until = async <T extends ServerFrame>(pred: (f: ServerFrame) => boolean, after = 0): Promise<T> => {
    for (let i = 0; i < 400; i++) {
      const hit = frames.slice(after).find(pred);
      if (hit) return hit as T;
      await Bun.sleep(10);
    }
    throw new Error(`timeout; got ${frames.map((f) => f.t).join(",")}`);
  };
  await until((f) => f.t === "on_hand");
  return { send: (f: object) => ws.send(JSON.stringify(f)), until, frames };
}

function spokenTakeBack(core: Core, title = "周报周五发") {
  const noted = core.log.append({ stream: "channel", origin: "partner", kind: "memory_noted", body: { title, memoryId: "m-1" } satisfies Bodies["memory_noted"] });
  const said = core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "别记这个" } satisfies Bodies["user_msg"] });
  return { noted, said };
}

test("a refused spoken undo: the failed ink reaches every window, the partner the fact, the Log the failure", async () => {
  const { core } = boot();
  const c = await client(core.url);
  c.send({ t: "settings" });
  await c.until((f) => f.t === "settings");
  core.settings!.setMemHooks({ undo: async () => false, waiting: () => new Set() });
  const { noted, said } = spokenTakeBack(core);

  const f = await c.until<SettingsFrame>((x) => x.t === "settings" && (x as SettingsFrame).undid?.seq === noted.seq);
  expect(f.undid).toEqual({ seq: noted.seq, ok: false });

  await core.takenBackSettled!(said.seq);
  expect(core.takenBackFrom!(said.seq)).toEqual([{ seq: noted.seq, title: "周报周五发", failed: true }]);

  const feedback = core.log.read({ stream: "channel", kinds: ["memory_feedback"], limit: 10 }).at(-1)!;
  expect(feedback.body as Bodies["memory_feedback"]).toEqual({ memoryId: "m-1", op: "forget", sent: false, failed: true });

  // Not undone: the line stays as it was, and every later frame keeps saying so.
  const view = await core.settings!.view();
  expect(view.mem.undone ?? []).not.toContain(noted.seq);
});

test("a taken-back spoken undo: undone, no failed frame, and the partner's fact is the plain one", async () => {
  const { core } = boot();
  const c = await client(core.url);
  c.send({ t: "settings" });
  await c.until((f) => f.t === "settings");
  core.settings!.setMemHooks({ undo: async () => true, waiting: () => new Set() });
  const before = c.frames.length;
  const { noted, said } = spokenTakeBack(core, "喜欢深色模式");
  await core.takenBackSettled!(said.seq);
  expect(core.takenBackFrom!(said.seq)).toEqual([{ seq: noted.seq, title: "喜欢深色模式" }]);
  await Bun.sleep(60);
  expect(c.frames.slice(before).some((f) => f.t === "settings" && (f as SettingsFrame).undid)).toBe(false);
  expect((await core.settings!.view()).mem.undone).toContain(noted.seq);
  expect(core.log.read({ stream: "channel", kinds: ["memory_feedback"], limit: 10 }).some((e) => (e.body as Bodies["memory_feedback"]).failed)).toBe(false);
});

test("a refused tap's undo also reaches every window, not only the socket that tapped", async () => {
  const { core } = boot();
  const a = await client(core.url);
  const b = await client(core.url);
  for (const c of [a, b]) {
    c.send({ t: "settings" });
    await c.until((f) => f.t === "settings");
  }
  core.settings!.setMemHooks({ undo: async () => false, waiting: () => new Set() });
  const noted = core.log.append({ stream: "channel", origin: "partner", kind: "memory_noted", body: { title: "周报周五发", memoryId: "m-1" } satisfies Bodies["memory_noted"] });
  a.send({ t: "memory_undo", seq: noted.seq });
  for (const c of [a, b]) {
    const f = await c.until<SettingsFrame>((x) => x.t === "settings" && (x as SettingsFrame).undid?.seq === noted.seq);
    expect(f.undid).toEqual({ seq: noted.seq, ok: false });
  }
});
