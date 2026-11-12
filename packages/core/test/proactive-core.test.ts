// D165/D166 through the real core and its socket: the one tap with a fake oo, the first-account
// moment, the cards' frames (look, tiles, 看了哪些), 自己留意 and 不让 Ducter 看这个, a reaction,
// and a find's Go that never wakes the partner. Triage recorded; no model; nothing written outside.
import { afterEach, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Bodies, ConnectionView, LogEvent, ServerFrame } from "@ducter/protocol";
import type { Runner } from "@ducter/protocol/src/internal.ts";
import { startCore, type Core } from "../src/core.ts";
import { ooSource } from "../src/connections.ts";
import { ooCli, ooEnv, ooExec } from "../src/oo-link.ts";
import { recordedTriage } from "../src/proactive/triage.ts";
import { barJudge } from "../src/proactive/judge.ts";
import { fakeOo } from "./fake-oo.ts";
import { busyWeek, MORNING } from "./fixtures/inbox.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

function boot(): { core: Core; oo: ReturnType<typeof fakeOo>; woke: LogEvent[]; opened: unknown[] } {
  const t = tempDir();
  const started = Date.now();
  const fx = busyWeek();
  const bin = join(t.dir, "bin");
  mkdirSync(bin);
  const oo = fakeOo(bin, {
    signedIn: true,
    apps: [
      { service: "gmail", connectionName: "work", accountLabel: "wey@example.com", authType: "oauth2", isDefault: true },
      { service: "discord", connectionName: "wey", accountLabel: "wey", authType: "oauth2" },
    ],
    actions: [
      { service: "gmail", name: "search_threads" },
      { service: "gmail", name: "send_email" },
      { service: "discord", name: "list_mentions" },
    ],
    results: { "gmail.search_threads": { threads: fx.mail }, "discord.list_mentions": { messages: fx.chat } },
  });
  const env = { ...process.env, ...oo.env, PATH: `${bin}:${process.env.PATH}` };
  const cli = ooCli({ exec: ooExec(oo.bin, ooEnv(env, oo.bin)) });
  const core = startCore({
    dataDir: t.dir,
    port: 0,
    batchMs: 5,
    push: false,
    ooSource: ooSource({ env, dir: join(t.dir, "oo-config"), which: () => oo.bin, cli }),
    proactive: { triage: recordedTriage(fx.triage), judge: barJudge, zone: "Asia/Shanghai" },
    // The fixture's "today" (Tuesday 2026-11-10, 07:00 Shanghai), moving at real speed: on the real
    // date a thread ages past the waiting threshold and the finds change with the calendar.
    clock: { now: () => MORNING + (Date.now() - started), setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) },
  });
  stops.push(t.cleanup, () => core.stop());
  const woke: LogEvent[] = [];
  core.setPartner({ onTrigger: (e) => void woke.push(e) });
  const opened: unknown[] = [];
  core.setRunner({ openTask: async (i: unknown) => (opened.push(i), { taskId: "t_go", title: "x" }), send: async () => ({ delivered: "prompted" }) } as unknown as Runner);
  return { core, oo, woke, opened };
}

async function client(core: Core) {
  const frames: ServerFrame[] = [];
  const ws = new WebSocket(core.url);
  ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
  await new Promise<void>((res, rej) => ((ws.onopen = () => res()), (ws.onerror = rej)));
  stops.push(() => ws.close());
  ws.send(JSON.stringify({ t: "hello", client: "web" }));
  const until = async <T extends ServerFrame>(pred: (f: ServerFrame) => boolean, ms = 6000): Promise<T> => {
    for (let i = 0; i < ms / 10; i++) {
      const hit = [...frames].reverse().find(pred);
      if (hit) return hit as T;
      await Bun.sleep(10);
    }
    throw new Error(`timeout; got ${frames.map((f) => f.t)}`);
  };
  await until((f) => f.t === "on_hand");
  return { send: (f: object) => ws.send(JSON.stringify(f)), until, frames };
}

const notes = (core: Core) => core.log.read({ stream: "channel", kinds: ["finds"] }).map((e) => e.body as Bodies["finds"]);

test("the one tap, the first-account moment, the card's frames and its controls, over the socket", async () => {
  const { core, oo, woke, opened } = boot();
  const c = await client(core);
  c.send({ t: "connection_oo" });
  const added = await c.until<Extract<ServerFrame, { t: "connection_result" }>>((f) => f.t === "connection_result");
  expect(added.ok).toBe(true);
  // The partner speaks once in the conversation; nothing has read or watched yet.
  const offer = notes(core).at(-1)!;
  expect(offer).toMatchObject({ rung: "first", ask: "first_look" });
  expect(oo.calls().some((x) => x.argv.includes("search_threads"))).toBe(false);

  c.send({ t: "proactive_answer", noteId: offer.noteId, ask: "first_look", yes: true });
  // D232: the first look reads two weeks more (each a real oo subprocess here): seconds, not one.
  for (let i = 0; i < 1500 && !notes(core).some((n) => n.ask === "cadence"); i++) await Bun.sleep(10);
  const answer = notes(core).find((n) => n.ask === "cadence")!;
  expect(answer.finds.map((f) => f.kind)).toEqual(["mismatch", "deadline", "waiting_on_you"]); // D232

  // The card: tiles per account, the status line's numbers, 看了哪些.
  c.send({ t: "connections" });
  const frame = await c.until<Extract<ServerFrame, { t: "connections" }>>((f) => f.t === "connections" && !!(f.connections[0] as ConnectionView | undefined)?.look);
  const look = frame.connections[0]!.look!;
  expect(look.watching).toBe(false); // the cadence isn't answered yet
  expect(look.apps.map((a) => [a.service, a.account])).toEqual([
    ["gmail", "wey@example.com"],
    ["discord", "wey"],
  ]);
  c.send({ t: "connection_reads", id: frame.connections[0]!.id });
  const reads = await c.until<Extract<ServerFrame, { t: "connection_reads" }>>((f) => f.t === "connection_reads");
  expect(reads.reads.find((r) => r.service === "gmail")).toMatchObject({ what: "new" });

  // The chips answer the question; watching starts.
  c.send({ t: "settings_set", patch: { proactive: "three" } });
  await c.until((f) => f.t === "connections" && !!(f.connections[0] as ConnectionView | undefined)?.look?.watching);
  // 自己留意 off for Discord, then 不让 Ducter 看这个 for Gmail.
  const id = frame.connections[0]!.id;
  c.send({ t: "app_watch", id, service: "discord", account: "wey", watch: false });
  await c.until((f) => f.t === "connections" && (f.connections[0] as ConnectionView).look?.apps.find((a) => a.service === "discord")?.watch === false);
  c.send({ t: "app_watch", id, service: "gmail", account: "wey@example.com", excluded: true });
  await c.until((f) => f.t === "connections" && !!(f.connections[0] as ConnectionView).look?.apps.find((a) => a.service === "gmail")?.excluded);
  const refused = await core.connections.read({ role: "partner" }, id, "gmail.search_threads", {});
  expect(refused.ok).toBe(false);

  // 有用 on the find; Go on its step opens one read-only task and never wakes the partner.
  const f = answer.finds[0]!;
  c.send({ t: "find_react", findId: f.findId, reaction: "useful" });
  woke.length = 0;
  c.send({ t: "decide", decisionId: f.decisionId, option: "go" });
  for (let i = 0; i < 300 && !opened.length; i++) await Bun.sleep(10);
  expect(opened).toHaveLength(1);
  expect(woke.filter((e) => e.kind === "decision_resolved")).toHaveLength(0);
  const states = core.log.read({ stream: "channel", kinds: ["find_state"] }).map((e) => (e.body as Bodies["find_state"]).state);
  expect(states).toEqual(["useful", "go"]);
  // Nothing was ever sent, replied, labelled or marked read.
  expect(oo.calls().filter((x) => x.argv[0] === "connector" && x.argv[1] === "run").map((x) => x.argv.join(" ")).filter((a) => /send_|reply|modify|label|trash|mark/.test(a))).toEqual([]);
});
