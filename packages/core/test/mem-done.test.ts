// D652: a correction that sticks. Settings › 记忆's 改 and 忘掉 are answered only after Nowledge
// Mem did: a success says the partner's line and the row follows Mem; a refusal says why in D590's
// words, leaves the row as it was, and changes no glance. The intent to tell Mem a recall was wrong
// is in the Log either way (nmem has no feedback verb yet). Over fake hooks: nothing reaches Mem.
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
type Done = Extract<ServerFrame, { t: "mem_done" }>;

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

const about = () => [{ id: "codex-1", title: "Deploy on Fridays is fine", kind: "preference" as const, by: "tool" as const, from: "Codex" }];

test("a 这条不对 message carries its memory id to the Log for the partner", async () => {
  const { core } = boot();
  const c = await client(core.url);
  c.send({ t: "send", text: "「x」这条记忆不对（codex-1），帮我改正。", clientId: "c-correct", corrects: "codex-1" });
  await c.until((f) => f.t === "events" && f.events.some((e) => e.kind === "user_msg"));
  const ev = core.log.read({ kinds: ["user_msg"], limit: 1 })[0]!;
  expect((ev.body as Bodies["user_msg"]).corrects).toBe("codex-1");
  // A malformed id is dropped, never stored.
  c.send({ t: "send", text: "bad", clientId: "c-bad", corrects: "../etc/passwd" });
  await Bun.sleep(50);
  const last = core.log.read({ kinds: ["user_msg"], limit: 2 });
  expect(last.map((e) => (e.body as Bodies["user_msg"]).corrects)).toEqual(["codex-1", undefined]);
});

test("a refused fix answers mem_done with why; the row and the glance stay as they were", async () => {
  const { core } = boot();
  const c = await client(core.url);
  c.send({ t: "settings" });
  await c.until((f) => f.t === "settings");
  const seen: string[] = [];
  core.settings.setGlance(() => ({ total: 1, about: about(), tools: [] }), {
    forgot: (id) => seen.push(`forgot:${id}`),
    fixed: (id) => seen.push(`fixed:${id}`),
    replaced: (id, nid) => seen.push(`replaced:${id}:${nid}`),
    find: async () => [],
  });
  core.settings.setReplacer(async () => ({ ok: false, reason: "not_configured", why: "signed_out" }));
  const n = c.frames.length;
  c.send({ t: "mem_fix", id: "codex-1", title: "Avoid Friday deploys", kind: "preference" });
  const done = await c.until<Done>((f) => f.t === "mem_done", n);
  expect(done).toEqual({ t: "mem_done", id: "codex-1", op: "fix", ok: false, why: "signed_out" });
  // No success frame, no glance change, and the partner says nothing.
  expect(c.frames.slice(n).some((f) => f.t === "settings")).toBe(false);
  expect(seen).toEqual([]);
  expect(core.log.read({ stream: "channel", kinds: ["memory_feedback"], limit: 10 })).toEqual([]);
});

test("a fix Mem took changes the glance (the replacement's id), says its words, and Logs the feedback intent", async () => {
  const { core } = boot();
  const c = await client(core.url);
  c.send({ t: "settings" });
  await c.until((f) => f.t === "settings");
  const seen: string[] = [];
  const g = { total: 1, about: about(), tools: [] };
  core.settings.setGlance(() => g, {
    forgot: (id) => seen.push(`forgot:${id}`),
    fixed: (id) => seen.push(`fixed:${id}`),
    replaced: (id, nid, title, kind) => {
      seen.push(`replaced:${id}:${nid}:${title}:${kind}`);
      g.about = g.about.map((x) => (x.id === id ? { ...x, id: nid, title, kind } : x));
      core.settings.memChanged();
    },
    find: async () => [],
  });
  core.settings.setReplacer(async (id, title, kind) => ((seen.push(`write:${id}:${title}:${kind}`), { ok: true, id: "codex-2" })));
  core.settings.setFeedback(async () => false);
  const n = c.frames.length;
  c.send({ t: "mem_fix", id: "codex-1", title: "Avoid Friday deploys", kind: "preference" });
  const done = await c.until<Done>((f) => f.t === "mem_done", n);
  expect(done).toEqual({ t: "mem_done", id: "codex-1", op: "fix", ok: true, title: "Avoid Friday deploys", newId: "codex-2" });
  expect(seen).toEqual(["write:codex-1:Avoid Friday deploys:preference", "replaced:codex-1:codex-2:Avoid Friday deploys:preference"]);
  const f = await c.until<SettingsFrame>((x) => x.t === "settings" && (x as SettingsFrame).mem.glance?.about?.[0]?.id === "codex-2", n);
  expect(f.mem.glance!.about[0]).toMatchObject({ id: "codex-2", title: "Avoid Friday deploys", kind: "preference" });
  const logged = core.log.read({ stream: "channel", kinds: ["memory_feedback"], limit: 10 });
  expect(logged.length).toBe(1);
  expect(logged[0]!.body as Bodies["memory_feedback"]).toEqual({ memoryId: "codex-1", op: "fix", note: "Avoid Friday deploys", sent: false });

  // D652: when this nmem has a feedback verb, the same correction says so (sent true).
  core.settings.setFeedback(async () => true);
  const m = c.frames.length;
  c.send({ t: "mem_fix", id: "codex-2", title: "Releases wait for Monday", kind: "preference" });
  await c.until<Done>((f) => f.t === "mem_done", m);
  const after = core.log.read({ stream: "channel", kinds: ["memory_feedback"], limit: 10 });
  expect(after.length).toBe(2);
  expect(after.at(-1)!.body as Bodies["memory_feedback"]).toMatchObject({ memoryId: "codex-2", op: "fix", sent: true });
});

test("forget: a refusal is unreachable, a success Logs the intent and carries the title for the said line", async () => {
  const { core } = boot();
  const c = await client(core.url);
  c.send({ t: "settings" });
  await c.until((f) => f.t === "settings");
  core.settings.setGlance(() => ({ total: 1, about: about(), tools: [] }), { forgot: () => {}, fixed: () => {}, replaced: () => {}, find: async () => [] });
  core.settings.setForgetter(async () => ({ ok: false, reason: "unavailable" }));
  let n = c.frames.length;
  c.send({ t: "mem_forget", id: "codex-1" });
  expect(await c.until<Done>((f) => f.t === "mem_done", n)).toEqual({ t: "mem_done", id: "codex-1", op: "forget", ok: false, why: "unreachable" });

  core.settings.setForgetter(async () => ({ ok: true, id: "codex-1" }));
  n = c.frames.length;
  c.send({ t: "mem_forget", id: "codex-1" });
  expect(await c.until<Done>((f) => f.t === "mem_done", n)).toEqual({ t: "mem_done", id: "codex-1", op: "forget", ok: true, title: "Deploy on Fridays is fine" });
  const logged = core.log.read({ stream: "channel", kinds: ["memory_feedback"], limit: 10 });
  expect(logged.at(-1)!.body as Bodies["memory_feedback"]).toEqual({ memoryId: "codex-1", op: "forget", sent: false });
});
