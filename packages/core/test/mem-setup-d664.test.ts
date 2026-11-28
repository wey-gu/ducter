// D664: one Nowledge Mem setup, its steps live. Over a FAKE nmem (packages/partner/eval/fake-bridge-nmem.ts):
// nothing here reaches Mem. What is checked: a look again reads the home's nmem past the probe's cache
// (a sign-in done in Mem itself shows at once), is read-only, is held to once in LOOK_AGAIN_MS, tells
// a change and only a change; over the socket `mem_health {setup: true}` answers this socket with a
// settings frame even when nothing changed (so a client's spinner ends), and plain `mem_health` still
// only refreshes Mem's doctor.
import { afterEach, expect, setDefaultTimeout, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ServerFrame } from "@ducter/protocol";
import { createBridgeLink, LOOK_AGAIN_MS, nmemCall } from "../src/bridge-link.ts";
import { startCore } from "../src/core.ts";
import { tempDir } from "./helpers.ts";

setDefaultTimeout(30_000);
const FAKE = resolve(import.meta.dir, "../../partner/eval/fake-bridge-nmem.ts");
let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

function rig(env: Record<string, string> = {}) {
  const t = tempDir();
  stops.push(t.cleanup);
  const bin = join(t.dir, "nmem");
  writeFileSync(bin, `#!/bin/sh\nexec bun ${FAKE} "$@"\n`);
  chmodSync(bin, 0o755);
  const state = join(t.dir, "state.json");
  writeFileSync(state, JSON.stringify({ identities: {}, messages: [], seq: 0 }));
  const argvLog = join(t.dir, "argv.log");
  const fullEnv = { PATH: process.env.PATH ?? "", NMEM_CLI_PATH: bin, NMEM_FAKE_BRIDGE_STATE: state, NMEM_FAKE_ARGV_LOG: argvLog, ...env };
  const calls = (): string[][] => (existsSync(argvLog) ? readFileSync(argvLog, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
  const data = join(t.dir, "data");
  mkdirSync(data);
  let clock = 1_000_000;
  let changes = 0;
  const link = createBridgeLink({ dataDir: data, identity: () => "ducter", home: () => "hel", run: nmemCall({ bin, env: fullEnv }), env: fullEnv, now: () => clock });
  link.onChange(() => changes++);
  return { link, calls, bin, fullEnv, state, changes: () => changes, tick: (ms: number) => (clock += ms), signInInMem: () => writeFileSync(`${state}.signed-in`, "1") };
}

/** A call that writes to Mem (anything but a read): a look again makes none. */
const WRITES = /\b(connect|revoke|enroll|set|enable|send|reply|subscribe|unsubscribe|supersede|forget|add)\b/;

test("a look again reads past the cache: a sign-in done in Mem shows at once, read-only", async () => {
  const r = rig({ NMEM_FAKE_SIGNED_OUT: "1" });
  expect((await r.link.view())?.state).toBe("sign_in");
  r.signInInMem(); // the person signed in in Nowledge Mem itself, outside Ducter
  r.tick(1_000);
  // The probe's 5-minute cache still says signed out.
  expect((await r.link.view())?.state).toBe("sign_in");
  r.tick(LOOK_AGAIN_MS);
  const before = r.calls().length;
  const told = r.changes();
  await r.link.lookAgain();
  expect(r.changes()).toBe(told + 1);
  expect((await r.link.view())?.state).toBe("ready");
  const looked = r.calls().slice(before);
  expect(looked.length).toBeGreaterThan(0);
  expect(looked.filter((c) => !c.includes("--help") && WRITES.test(c.filter((a) => !a.startsWith("-")).join(" ")) && !c.includes("setup") && !c.includes("list"))).toEqual([]);
});

test("held to once in LOOK_AGAIN_MS, and a look that finds nothing new tells nothing", async () => {
  const r = rig();
  expect((await r.link.view())?.state).toBe("ready");
  r.tick(LOOK_AGAIN_MS);
  await r.link.lookAgain();
  const n = r.calls().length;
  const told = r.changes();
  expect(told).toBe(0); // the same facts: no change told
  await r.link.lookAgain(); // within LOOK_AGAIN_MS: no nmem call at all
  expect(r.calls().length).toBe(n);
  r.tick(LOOK_AGAIN_MS);
  await r.link.lookAgain();
  expect(r.calls().length).toBeGreaterThan(n);
  expect(r.changes()).toBe(told);
});

test("over the socket: mem_health with setup answers with a settings frame even when nothing changed", async () => {
  const r = rig({ NMEM_FAKE_SIGNED_OUT: "1" });
  const t = tempDir();
  stops.push(t.cleanup);
  const core = startCore({ dataDir: t.dir, port: 0, batchMs: 5, deviceProbes: { cua: async () => null, harnesses: async () => [], kind: async () => "laptop" }, bridgeLink: { run: nmemCall({ bin: r.bin, env: r.fullEnv }), env: r.fullEnv } });
  stops.push(() => core.stop());
  core.setPartner({ onTrigger: () => {} });
  core.settings.setMemState("connected");
  const frames: ServerFrame[] = [];
  const ws = new WebSocket(core.url);
  ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
  await new Promise<void>((res, rej) => ((ws.onopen = () => res()), (ws.onerror = rej)));
  stops.push(() => ws.close());
  ws.send(JSON.stringify({ t: "hello" }));
  const settingsAfter = async (from: number, pred: (f: Extract<ServerFrame, { t: "settings" }>) => boolean = () => true) => {
    for (let i = 0; i < 1500; i++) {
      const hit = frames.slice(from).find((f) => f.t === "settings" && pred(f as Extract<ServerFrame, { t: "settings" }>));
      if (hit) return hit as Extract<ServerFrame, { t: "settings" }>;
      await Bun.sleep(10);
    }
    throw new Error(`timeout; got ${frames.slice(from).map((f) => f.t)}`);
  };
  ws.send(JSON.stringify({ t: "settings" }));
  expect((await settingsAfter(0, (f) => !!f.bridge)).bridge?.state).toBe("sign_in");
  // Nothing changed: this socket still hears the answer.
  let at = frames.length;
  ws.send(JSON.stringify({ t: "mem_health", setup: true }));
  expect((await settingsAfter(at)).bridge?.state).toBe("sign_in");
  // Signed in in Mem itself, then the pane is looked at again: the frame carries it.
  r.signInInMem();
  await Bun.sleep(LOOK_AGAIN_MS + 50);
  at = frames.length;
  ws.send(JSON.stringify({ t: "mem_health", setup: true }));
  await settingsAfter(at, (f) => f.bridge?.state === "ready");
}, 60_000);
