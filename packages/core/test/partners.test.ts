// D309: 伙伴们 / Partners: a second partner on one home, with its own conversation and look;
// attention (the needs-you count, push) across them; nothing of one conversation in another's.
import { afterEach, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Bodies, LogEvent, ServerFrame } from "@ducter/protocol";
import { channelOf, isOtherChannel, needsAcross, nextLook, partnerNameProblem, partnerOfStream } from "@ducter/protocol";
import { startCore, type Core } from "../src/core.ts";
import { openLog } from "../src/log.ts";
import { openPartners, PARTNERS_FILE } from "../src/partners.ts";
import { decisionMessage, doneMessage } from "../src/push.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

function rig(on = true) {
  const t = tempDir();
  stops.push(t.cleanup);
  const log = openLog({ path: join(t.dir, "ducter.db"), persona: "default" });
  stops.push(() => log.close());
  const persona = { id: "default", name: "Ducter" };
  return { dir: t.dir, log, persona, partners: openPartners({ dataDir: t.dir, log, persona, on }) };
}

test("streams: the default's conversation is channel, every other's channel:<id>", () => {
  expect(channelOf(undefined)).toBe("channel");
  expect(channelOf("default")).toBe("channel");
  expect(channelOf("p2")).toBe("channel:p2");
  expect(partnerOfStream("channel")).toBe("default");
  expect(partnerOfStream("channel:p2")).toBe("p2");
  expect(partnerOfStream("task:t1")).toBeUndefined();
  expect(isOtherChannel("channel")).toBe(false);
  expect(isOtherChannel("channel:p2")).toBe(true);
});

test("names: trimmed, at most 24 characters, one per partner whatever the case", () => {
  expect(partnerNameProblem("  ", [])).toBe("empty");
  expect(partnerNameProblem("小".repeat(25), [])).toBe("long");
  expect(partnerNameProblem("ducter", ["Ducter"])).toBe("taken");
  expect(partnerNameProblem(" 小家 ", ["Ducter"])).toBeUndefined();
  expect(nextLook(["sand"])).toBe("sage");
  expect(nextLook(["sand", "sage", "sky"])).toBe("plum");
});

test("the needs-you count is one across partners: every other partner's own questions are added", () => {
  const ps = [
    { id: "default", name: "Ducter", look: "sand" as const, asks: 1 },
    { id: "p2", name: "小家", look: "sage" as const, asks: 2 },
  ];
  // This client shows the default: it counts its own question (and On hand) already.
  expect(needsAcross(3, ps, "default")).toBe(5);
  expect(needsAcross(3, ps, "p2")).toBe(4);
  expect(needsAcross(3, undefined, "default")).toBe(3);
});

test("a second partner is made with a name and a look, kept in partners.json, and offered only in the preview", () => {
  const off = rig(false);
  expect(off.partners.add({ name: "小家" })).toEqual({ ok: false, error: "full" });
  expect(off.partners.list().map((p) => p.id)).toEqual(["default"]);

  const { dir, partners, persona, log } = rig();
  expect(partners.add({ name: " " })).toEqual({ ok: false, error: "empty" });
  expect(partners.add({ name: "DUCTER" })).toEqual({ ok: false, error: "taken" });
  const a = partners.add({ name: "小家" });
  expect(a.ok && a.partner).toEqual({ id: "p2", name: "小家", look: "sage", asks: 0 });
  const b = partners.add({ name: "Mia", look: "plum" });
  expect(b.ok && b.partner.look).toBe("plum");
  expect(partners.add({ name: "Leo" }).ok).toBe(true);
  expect(partners.add({ name: "Ann" })).toEqual({ ok: false, error: "full" }); // four in all
  expect(partners.list().map((p) => p.name)).toEqual(["Ducter", "小家", "Mia", "Leo"]);
  expect(existsSync(join(dir, PARTNERS_FILE))).toBe(true);
  expect(JSON.parse(readFileSync(join(dir, PARTNERS_FILE), "utf8")).others).toHaveLength(3);

  // A rename and a look; the default keeps its name in persona.json (settings), only its look here.
  expect(partners.set("p2", { name: "Mia" })).toEqual({ ok: false, error: "taken" });
  expect(partners.set("p2", { name: "Home", look: "sky" }).ok).toBe(true);
  expect(partners.set("default", { name: "X" })).toEqual({ ok: false, error: "unknown" });
  expect(partners.set("default", { look: "apricot" }).ok).toBe(true);
  expect(partners.set("nope", { look: "sky" })).toEqual({ ok: false, error: "unknown" });
  persona.name = "Ada"; // a rename on Settings › 伙伴 shows at once
  expect(partners.get("default")).toMatchObject({ name: "Ada", look: "apricot" });

  // Read again from disk (a restart).
  const again = openPartners({ dataDir: dir, log, persona, on: true });
  expect(again.list().map((p) => [p.id, p.name, p.look])).toEqual([
    ["default", "Ada", "apricot"],
    ["p2", "Home", "sky"],
    ["p3", "Mia", "plum"],
    ["p4", "Leo", "sky"], // the first look nobody had
  ]);
  expect(again.nameOf("p3")).toBe("Mia");
  expect(again.nameOf(undefined)).toBe("Ada");
});

test("asks: a partner's own open questions, never its tasks' (those are On hand's)", () => {
  const { log, partners } = rig();
  partners.add({ name: "小家" });
  const ask = (stream: string, decisionId: string, taskId?: string) =>
    log.append({ stream, origin: "partner", kind: "decision", body: { decisionId, question: "Book it?", reversible: true, ...(taskId ? { taskId } : {}) } as Bodies["decision"] });
  ask("channel", "d1");
  ask("channel", "d2", "t1");
  ask("channel:p2", "d3");
  ask("channel:p2", "d4");
  log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: "d4", option: "go" } as Bodies["decision_resolved"] });
  expect(partners.list().map((p) => p.asks)).toEqual([1, 1]);
});

// ---------- over the socket ----------

async function client(core: Core, hello: object = {}) {
  const frames: ServerFrame[] = [];
  const ws = new WebSocket(core.url);
  ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
  await new Promise<void>((res, rej) => ((ws.onopen = () => res()), (ws.onerror = rej)));
  stops.push(() => ws.close());
  const until = async (pred: (f: ServerFrame) => boolean, from = 0) => {
    for (let i = 0; i < 300; i++) {
      const hit = frames.slice(from).find(pred);
      if (hit) return hit;
      await Bun.sleep(10);
    }
    throw new Error(`timeout; got ${frames.map((f) => f.t)}`);
  };
  const hi = async (h: object) => {
    const n = frames.length;
    ws.send(JSON.stringify({ t: "hello", ...h }));
    await until((f) => f.t === "on_hand", n);
    return n;
  };
  await hi(hello);
  return { send: (f: object) => ws.send(JSON.stringify(f)), until, frames, hi };
}
const msgs = (frames: ServerFrame[], from = 0) =>
  frames
    .slice(from)
    .flatMap((f) => (f.t === "events" ? f.events : []))
    .filter((e) => e.kind === "user_msg")
    .map((e) => [e.stream, (e.body as Bodies["user_msg"]).text]);

test("each socket shows one partner's conversation; the other's words never reach it, and only the default's wake the default partner", async () => {
  const t = tempDir();
  stops.push(t.cleanup);
  const core = startCore({ dataDir: t.dir, port: 0, batchMs: 5, partners: true });
  stops.push(() => core.stop());
  const woke: LogEvent[] = [];
  core.setPartner({ onTrigger: (e) => void woke.push(e) });
  expect(core.partners.add({ name: "小家", look: "sage" }).ok).toBe(true);

  const home = await client(core); // the default's
  expect(home.frames.find((f) => f.t === "partners")).toMatchObject({ shown: "default", partners: [{ id: "default" }, { id: "p2", name: "小家" }] });
  const family = await client(core, { persona: "p2" });
  const w = family.frames.find((f) => f.t === "welcome") as Extract<ServerFrame, { t: "welcome" }>;
  expect([w.persona, w.personaName]).toEqual(["p2", "小家"]);

  const h0 = home.frames.length;
  const f0 = family.frames.length;
  family.send({ t: "send", text: "周六的牙医约了吗", clientId: "f1" });
  home.send({ t: "send", text: "ship the release", clientId: "h1" });
  await family.until((f) => f.t === "events" && f.events.some((e) => (e.body as Bodies["user_msg"]).clientId === "f1"), f0);
  await home.until((f) => f.t === "events" && f.events.some((e) => (e.body as Bodies["user_msg"]).clientId === "h1"), h0);
  await Bun.sleep(30);
  // Each sees only its own, and both as "channel" (the client's conversation, whoever it is).
  expect(msgs(family.frames, f0)).toEqual([["channel", "周六的牙医约了吗"]]);
  expect(msgs(home.frames, h0)).toEqual([["channel", "ship the release"]]);
  // In the Log: its own stream.
  expect(core.log.read({ stream: "channel:p2", kinds: ["user_msg"] }).map((e) => (e.body as Bodies["user_msg"]).text)).toEqual(["周六的牙医约了吗"]);
  expect(woke.filter((e) => e.kind === "user_msg").map((e) => (e.body as Bodies["user_msg"]).text)).toEqual(["ship the release"]);

  // A switch is a hello again: the conversation replayed is the other partner's.
  const n = await home.hi({ persona: "p2" });
  expect(msgs(home.frames, n)).toEqual([["channel", "周六的牙医约了吗"]]);
  // A partner the home doesn't have falls back to the default's.
  const m = await home.hi({ persona: "nobody" });
  expect((home.frames.slice(m).find((f) => f.t === "welcome") as Extract<ServerFrame, { t: "welcome" }>).persona).toBe("default");
  expect(msgs(home.frames, m)).toEqual([["channel", "ship the release"]]);
});

test("partner_add and partner_set over the socket: every socket hears the change; a refusal says why to the asker only", async () => {
  const t = tempDir();
  stops.push(t.cleanup);
  const core = startCore({ dataDir: t.dir, port: 0, batchMs: 5, partners: true });
  stops.push(() => core.stop());
  core.setPartner({ onTrigger: () => {} });
  const a = await client(core);
  const b = await client(core);
  const b0 = b.frames.length;
  a.send({ t: "partner_add", name: "Mia", look: "plum", clientId: "k1" });
  const mine = (await a.until((f) => f.t === "partners" && f.clientId === "k1")) as Extract<ServerFrame, { t: "partners" }>;
  expect(mine.error).toBeUndefined();
  expect(mine.partners.map((p) => p.name)).toEqual(["Ducter", "Mia"]);
  await b.until((f) => f.t === "partners" && f.partners.length === 2, b0);
  a.send({ t: "partner_add", name: "mia", clientId: "k2" });
  expect(await a.until((f) => f.t === "partners" && f.clientId === "k2")).toMatchObject({ error: "taken" });
  a.send({ t: "partner_set", id: "p2", look: "sky", clientId: "k3" });
  expect(((await a.until((f) => f.t === "partners" && f.clientId === "k3")) as Extract<ServerFrame, { t: "partners" }>).partners[1]!.look).toBe("sky");
});

test("a question in a second partner's conversation counts for every client, and a decision there shows only there", async () => {
  const t = tempDir();
  stops.push(t.cleanup);
  const core = startCore({ dataDir: t.dir, port: 0, batchMs: 5, partners: true });
  stops.push(() => core.stop());
  core.setPartner({ onTrigger: () => {} });
  core.partners.add({ name: "小家" });
  const home = await client(core);
  const h0 = home.frames.length;
  core.log.append({ stream: "channel:p2", origin: "partner", kind: "decision", body: { decisionId: "dx", question: "要我订周六上午吗？", reversible: true } as Bodies["decision"] });
  const f = (await home.until((x) => x.t === "partners" && x.partners[1]!.asks === 1, h0)) as Extract<ServerFrame, { t: "partners" }>;
  expect(needsAcross(0, f.partners, f.shown)).toBe(1);
  expect(home.frames.slice(h0).some((x) => x.t === "events" && x.events.some((e) => e.kind === "decision"))).toBe(false);
});

test("push: with more than one partner a notification says whose; with one it reads as before", () => {
  const d = { decisionId: "d1", question: "Send it?", reversible: true, taskId: "t1" } as Bodies["decision"];
  const base = { persona: "Ducter", locale: "en" as const, platform: "mac", now: 0 };
  expect(decisionMessage(d, { ...base, task: "Book the dentist" }).title).toBe("Book the dentist");
  expect(decisionMessage(d, { ...base, task: "Book the dentist", who: "Mia" }).title).toBe("Mia: Book the dentist");
  expect(decisionMessage(d, { ...base, locale: "zh", task: "约牙医", who: "小家" }).title).toBe("小家：约牙医");
  expect(decisionMessage({ ...d, taskId: undefined }, { ...base, who: "Mia" }).title).toBe("Mia");
  expect(doneMessage({ taskId: "t1", title: "Book the dentist" }, { persona: "Ducter", locale: "en", who: "Mia" }).title).toBe("Mia: Book the dentist");
});
