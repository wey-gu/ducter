// "Up to date" is only as good as when it was read: the home reads the latest release every hour,
// again when Devices or Updates and about opens and the answer is older than 15 min, and at once
// when a device, worker or app says it runs a newer version than the release it knows (a 0.0.6
// app talking to a home that thinks 0.0.4 is the latest). A fake feed; no network.
import { afterEach, expect, test } from "bun:test";
import type { ServerFrame } from "@ducter/protocol";
import { startCore, type Core } from "../src/core.ts";
import type { DeviceProbes } from "../src/devices.ts";
import { CHECK_EVERY_MS, createReleaseWatch, FRESH_MS } from "../src/release.ts";
import { createUpdates } from "../src/updates.ts";
import { realSys } from "../src/update.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

/** A release feed that says `latest.v` and counts how often it was asked. */
function counted(v: string) {
  const latest = { v, calls: 0 };
  const fetch = async () => {
    latest.calls++;
    return new Response(JSON.stringify({ tag_name: `v${latest.v}`, body: "- What's new" }), { status: 200 });
  };
  return { latest, fetch };
}

const settle = () => Bun.sleep(5);

test("every hour, not every 6", () => {
  expect(CHECK_EVERY_MS).toBe(60 * 60_000);
  expect(FRESH_MS).toBe(15 * 60_000);
});

test("every answer is told, so the cards can say when it was read", async () => {
  const dir = tempDir();
  stops.push(dir.cleanup);
  const { fetch } = counted("0.0.6");
  let now = Date.parse("2026-11-10T10:00:00Z");
  const release = createReleaseWatch({ dataDir: dir.dir, timer: false, env: {}, fetch, now: () => now });
  let told = 0;
  release.onChange(() => told++);
  await release.check(true);
  now += 60_000;
  await release.check(true); // the same version: still told (checkedAt moved)
  await settle();
  expect(told).toBe(2);
  expect(release.checkedAt()).toBe(new Date(now).toISOString());
});

function world(o: { known: string; self?: string }) {
  const dir = tempDir();
  stops.push(dir.cleanup);
  const feed = counted(o.known);
  let now = Date.parse("2026-11-10T10:00:00Z");
  const release = createReleaseWatch({ dataDir: dir.dir, timer: false, env: {}, fetch: feed.fetch, now: () => now });
  const u = createUpdates({
    dataDir: dir.dir,
    log: { append: () => ({}) as any } as any,
    release,
    sys: { ...realSys, now: () => now },
    self: { execPath: "/x/ducter", how: "self", arch: "x64", port: 1 },
    name: () => "hel",
    version: o.self ?? o.known,
    autoEveryMs: 0,
  });
  stops.push(() => u.stop());
  return { feed, release, u, tick: (ms: number) => void (now += ms) };
}

test("opening Devices reads again only when the answer is older than 15 min", async () => {
  const w = world({ known: "0.0.6" });
  await w.release.check(true);
  expect(w.feed.latest.calls).toBe(1);
  w.tick(5 * 60_000);
  w.u.freshen();
  await settle();
  expect(w.feed.latest.calls).toBe(1); // 5 min old: fresh enough
  w.tick(11 * 60_000);
  w.u.freshen();
  await settle();
  expect(w.feed.latest.calls).toBe(2);
});

test("a device on a newer version than the latest known: read again at once, once per version", async () => {
  const w = world({ known: "0.0.4" });
  await w.release.check(true);
  w.feed.latest.v = "0.0.6"; // released since; the home's answer is 1 min old and says 0.0.4
  w.tick(60_000);
  w.u.sawVersion("0.0.4"); // the same: nothing
  w.u.sawVersion("0.0.3"); // older: nothing
  await settle();
  expect(w.feed.latest.calls).toBe(1);
  w.u.sawVersion("0.0.6");
  await settle();
  expect(w.feed.latest.calls).toBe(2);
  expect(w.release.latest()?.version).toBe("0.0.6");
  // A worker's card (view) runs the same: 0.0.6 is the latest now, nothing more to read.
  expect(w.u.view("w1", "0.0.6", "self")).toMatchObject({ latest: "0.0.6", available: false });
  await settle();
  expect(w.feed.latest.calls).toBe(2);
  // A dev build ahead of every release asks at most once per 15 min.
  w.u.sawVersion("0.0.7");
  w.u.sawVersion("0.0.7");
  await settle();
  expect(w.feed.latest.calls).toBe(3);
  w.tick(16 * 60_000);
  w.u.sawVersion("0.0.7");
  await settle();
  expect(w.feed.latest.calls).toBe(4);
});

// Over the real socket: the Mac app's hello says its version; opening Devices freshens.
const probes: Partial<DeviceProbes> = { cua: async () => ({ missing: "no" }), native: async () => undefined, harnesses: async () => [], kind: async () => "server" };

async function client(url: string) {
  const frames: ServerFrame[] = [];
  const ws = new WebSocket(url);
  ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
  await new Promise<void>((res, rej) => ((ws.onopen = () => res()), (ws.onerror = rej)));
  stops.push(() => ws.close());
  return { send: (f: object) => ws.send(JSON.stringify(f)), frames };
}

const until = async (ok: () => boolean) => {
  for (let i = 0; i < 300 && !ok(); i++) await Bun.sleep(10);
  expect(ok()).toBe(true);
};

test("the app's hello says 0.0.6 to a home that knows 0.0.4: the home reads again and the card says so", async () => {
  const t = tempDir();
  const feed = counted("0.0.4");
  const core: Core = startCore({ dataDir: t.dir, port: 0, batchMs: 5, sweepMs: 50, deviceProbes: probes, update: { fetch: feed.fetch, how: "self", version: "0.0.4", autoEveryMs: 0 } });
  stops.push(t.cleanup, () => core.stop());
  core.setPartner({ onTrigger: () => {} });
  await until(() => feed.latest.calls >= 1); // the first read at start
  feed.latest.v = "0.0.6";
  const c = await client(core.url);
  c.send({ t: "hello", client: "desktop", version: "0.0.6" });
  await until(() => feed.latest.calls >= 2);
  c.send({ t: "devices" });
  await until(() => c.frames.some((f) => f.t === "devices" && f.devices.find((d) => d.home)?.update?.latest === "0.0.6"));
  const home = [...c.frames].reverse().find((f): f is Extract<ServerFrame, { t: "devices" }> => f.t === "devices")!.devices.find((d) => d.home)!;
  expect(home.update).toMatchObject({ current: "0.0.4", latest: "0.0.6", available: true });
  expect(home.update?.checkedAt).toBeTruthy();
});
