import { afterEach, describe, expect, test } from "bun:test";
import { AMBIENT_PHASES, AMBIENT_WORDS, callPhase, taskPhase } from "@ducter/protocol/src/ambient.ts";
import { activityPayload, createActivitySender, createAmbient, openAmbientStore, phaseOf, type ActivitySender, type Follow } from "../src/ambient.ts";
import type { ApnsRequest } from "../src/apns.ts";
import { FakeClock } from "../src/clock.ts";
import { openLog } from "../src/log.ts";
import { openTask, tempDir } from "./helpers.ts";

const stops: (() => void)[] = [];
afterEach(() => {
  for (const s of stops.splice(0).reverse()) s();
});

const TOKEN = "ab".repeat(40);
const TOPIC = "co.nowledge.ducter.ios";
const HANDLE = "h1." + "x".repeat(60);

function setup(sender?: ActivitySender) {
  const t = tempDir();
  const clock = new FakeClock(Date.parse("2026-11-17T09:00:00Z"));
  const log = openLog({ path: `${t.dir}/d.db`, persona: "default", clock });
  const store = openAmbientStore(t.dir);
  const sent: { f: Follow; phase: string }[] = [];
  const s: ActivitySender = sender ?? { configured: true, send: async (f, st) => (sent.push({ f, phase: st.phase }), { status: 200, gone: false }) };
  const ambient = createAmbient({ log, store, sender: s, clock });
  stops.push(() => ambient.stop(), () => log.close(), t.cleanup);
  return { log, store, sent, ambient, clock, dir: t.dir };
}
const state = (log: ReturnType<typeof setup>["log"], taskId: string, attention: string) =>
  log.append({ stream: `task:${taskId}`, origin: "system", kind: "task_state", body: { taskId, attention, residency: "hot" } as never });
const settle = () => new Promise((r) => setTimeout(r, 5));

describe("D306 glance phases", () => {
  test("every attention and call state has a phase, and every phase its words in zh and en", () => {
    expect(taskPhase("queued")).toBe("working");
    expect(taskPhase("blocked")).toBe("waiting");
    expect(taskPhase("done_claimed")).toBe("done");
    expect(taskPhase("superseded")).toBe("cancelled");
    expect(callPhase("needs_go")).toBeUndefined(); // not live yet
    expect(callPhase("question")).toBe("asking");
    for (const p of AMBIENT_PHASES) {
      expect(AMBIENT_WORDS.zh!.phase[p]).toBeTruthy();
      expect(AMBIENT_WORDS.en.phase[p]).toBeTruthy();
    }
  });

  test("the payload is words-free: a phase and times, the end with a dismissal date", () => {
    const up = activityPayload({ phase: "needs_you", since: 100 }, 100) as { aps: Record<string, unknown> };
    expect(up.aps.event).toBe("update");
    expect(up.aps["content-state"]).toEqual({ phase: "needs_you", since: 100 });
    expect(up.aps["stale-date"]).toBe(100 + 4 * 3600);
    expect(up.aps["dismissal-date"]).toBeUndefined();
    const end = activityPayload({ phase: "done", since: 200 }, 200) as { aps: Record<string, unknown> };
    expect(end.aps.event).toBe("end");
    expect(end.aps["dismissal-date"]).toBe(200 + 15 * 60);
  });
});

describe("D306 the home follows the Log for a followed task", () => {
  test("validates the follow; pushes each change of phase once; ends and forgets on done", async () => {
    const { log, store, sent, ambient } = setup();
    expect(ambient.follow("phone", { kind: "task", id: "t1", apns: { token: "nope", topic: TOPIC, env: "sandbox" } })).toEqual({ error: "apns" });
    expect(ambient.follow("phone", { kind: "routine", id: "t1" })).toEqual({ error: "kind" });
    const r = ambient.follow("phone", { kind: "task", id: "t1", phase: "working", apns: { token: TOKEN, topic: TOPIC, env: "sandbox" } });
    expect("id" in r).toBe(true);
    openTask(log, "t1", "回张三的邮件");
    state(log, "t1", "working"); // the phase it started with: nothing to say
    state(log, "t2", "needs_you"); // another task: not followed
    await settle();
    expect(sent).toEqual([]);
    state(log, "t1", "needs_you");
    state(log, "t1", "needs_you"); // the same phase again: no heartbeat
    await settle();
    expect(sent.map((s) => s.phase)).toEqual(["needs_you"]);
    state(log, "t1", "done");
    await settle();
    expect(sent.map((s) => s.phase)).toEqual(["needs_you", "done"]);
    expect(store.list()).toEqual([]);
  });

  test("a call: live phases, and the end", async () => {
    const { log, sent, ambient } = setup();
    ambient.follow("phone", { kind: "call", id: "c1", apns: { token: TOKEN, topic: TOPIC, env: "production" } });
    const call = (st: string) => log.append({ stream: "channel", origin: "system", kind: "phone_call", body: { callId: "c1", connectionId: "x", state: st, plan: {} } as never });
    call("calling");
    call("talking");
    call("question");
    call("done");
    await settle();
    expect(sent.map((s) => s.phase)).toEqual(["calling", "talking", "asking", "called"]);
    expect(phaseOf(log.read({ stream: "channel" }).at(-1)!)?.kind).toBe("call");
  });

  test("a token Apple calls gone is forgotten; a disconnected device too; one phone keeps at most four", async () => {
    const { log, store, ambient } = setup({ configured: true, send: async () => ({ status: 410, gone: true }) });
    ambient.follow("phone", { kind: "task", id: "t1", apns: { token: TOKEN, topic: TOPIC, env: "sandbox" } });
    state(log, "t1", "needs_you");
    await settle();
    expect(store.list()).toEqual([]);
    for (const id of ["a", "b", "c", "d", "e"]) ambient.follow("phone", { kind: "task", id, apns: { token: TOKEN, topic: TOPIC, env: "sandbox" } });
    expect(store.list().map((f) => f.target)).toEqual(["b", "c", "d", "e"]);
    const other = store.list()[0]!;
    expect(ambient.unfollow("someone-else", other.id)).toBe(false);
    expect(ambient.unfollow("phone", other.id)).toBe(true);
  });

  test("kept across a restart", () => {
    const { ambient, dir } = setup();
    ambient.follow("phone", { kind: "task", id: "t1", apns: { token: TOKEN, topic: TOPIC, env: "sandbox" } });
    expect(openAmbientStore(dir).list().map((f) => f.target)).toEqual(["t1"]);
  });
});

describe("D306 the way out", () => {
  const follow: Follow = { id: "a", deviceId: "phone", kind: "task", target: "t1", apns: { token: TOKEN, topic: TOPIC, env: "production", relay: HANDLE }, startedAt: "" };

  test("this home's own key: push type liveactivity on the bundle's liveactivity topic, priority by phase", async () => {
    const reqs: ApnsRequest[] = [];
    const { privateKey } = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"])) as CryptoKeyPair;
    const pk = Buffer.from(await crypto.subtle.exportKey("pkcs8", privateKey)).toString("base64");
    const s = createActivitySender({ config: { keyId: "K", teamId: "T", key: `-----BEGIN PRIVATE KEY-----\n${pk}\n-----END PRIVATE KEY-----` }, transport: async (r) => (reqs.push(r), { status: 200, body: "" }) });
    await s.send(follow, { phase: "working", since: 1 }, 1);
    await s.send(follow, { phase: "needs_you", since: 2 }, 2);
    expect(reqs[0]!.host).toBe("api.push.apple.com");
    expect(reqs[0]!.path).toBe(`/3/device/${TOKEN}`);
    expect(reqs[0]!.headers["apns-push-type"]).toBe("liveactivity");
    expect(reqs[0]!.headers["apns-topic"]).toBe(`${TOPIC}.push-type.liveactivity`);
    expect(reqs.map((r) => r.headers["apns-priority"])).toEqual(["5", "10"]);
    expect(JSON.parse(reqs[1]!.body).aps["content-state"]).toEqual({ phase: "needs_you", since: 2 });
  });

  test("the relay: the activity op with the handle and the phase only", async () => {
    const calls: { url: string; body: string }[] = [];
    const s = createActivitySender({ relayUrl: "https://relay.test/api/push", relayFetch: async (url, init) => (calls.push({ url, body: String(init.body) }), new Response("{}", { status: 200 })) });
    expect(s.configured).toBe(true);
    await s.send(follow, { phase: "done", since: 9 }, 9);
    expect(calls[0]!.url).toBe("https://relay.test/api/push/activity");
    expect(JSON.parse(calls[0]!.body)).toEqual({ handle: HANDLE, s: { phase: "done", since: 9 }, at: 9 });
    // No handle: never a raw token through the relay.
    const r = await s.send({ ...follow, apns: { ...follow.apns, relay: undefined } }, { phase: "done", since: 9 }, 9);
    expect(r.status).toBe(0);
    expect(calls.length).toBe(1);
  });
});
