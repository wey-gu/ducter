// D205: Settings › 伙伴's one-tap Bridge connection for the persona, over a FAKE nmem
// (packages/partner/eval/fake-bridge-nmem.ts, in the shapes of nmem 0.10.118-rc2). Nothing here
// reaches Mem. What is checked: the capability check, the exact connect argv (the one personal
// place's id, never a guessed one), each registered refusal said as its own reason with nothing
// else tried, connected → the context that turns the partner's Bridge on, disconnect, old nmem.
import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ServerFrame } from "@ducter/protocol";
import { BRIDGE_CONNECTION_FILE, createBridgeLink, errorCodeIn, nmemCall, parseNmemVersion, personalSpace, REFUSALS, versionConnects } from "../src/bridge-link.ts";
import { startCore } from "../src/core.ts";
import { tempDir } from "./helpers.ts";

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
  const fullEnv = { PATH: process.env.PATH ?? "", NMEM_FAKE_BRIDGE_STATE: state, NMEM_FAKE_ARGV_LOG: argvLog, ...env };
  const calls = (): string[][] => (existsSync(argvLog) ? readFileSync(argvLog, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
  const data = join(t.dir, "data");
  mkdirSync(data);
  let changes = 0;
  const link = createBridgeLink({ dataDir: data, identity: () => "ducter", home: () => "hel", run: nmemCall({ bin, env: fullEnv }), env: fullEnv });
  link.onChange(() => changes++);
  return { link, calls, data, bin, fullEnv, changes: () => changes, state };
}
const writes = (calls: string[][]) => calls.filter((c) => c.includes("connections") && (c.includes("connect") || c.includes("revoke")));

describe("pieces", () => {
  test("version: 0.10.118 and its pre-releases have `bridge connections`; 0.10.117 doesn't", () => {
    expect(parseNmemVersion("nmem 0.10.118-rc2")).toEqual([0, 10, 118]);
    expect(versionConnects(parseNmemVersion("nmem 0.10.118-rc2"))).toBe(true);
    expect(versionConnects([0, 10, 117])).toBe(false);
    expect(versionConnects([0, 11, 0])).toBe(true);
    expect(versionConnects(undefined)).toBe(false);
  });
  test("the one personal place, or none (none listed, or two: never a guess)", () => {
    const c = (kind: string, id: string) => ({ id, label: kind === "personal" ? "Only me" : id, kind, write_default: false });
    expect(personalSpace({ candidates: [c("team", "t"), c("personal", "p")] })).toEqual({ id: "p", label: "Only me" });
    expect(personalSpace({ candidates: [c("team", "t")] })).toBeUndefined();
    expect(personalSpace({ candidates: [c("personal", "p"), c("personal", "q")] })).toBeUndefined();
    expect(personalSpace({ state: "enable_needed" })).toBeUndefined();
  });
  test("a refusal's code, wherever the CLI printed it", () => {
    expect(errorCodeIn('{"error_code":"cloud_bridge_setup_role_lifetime_inactive","http_status":403}', "")).toBe("cloud_bridge_setup_role_lifetime_inactive");
    expect(errorCodeIn("", 'warn\n{"upstream":{"error_code":"cloud_bridge_setup_binding_conflict"}}')).toBe("cloud_bridge_setup_binding_conflict");
    expect(errorCodeIn("", "connection reset")).toBeUndefined();
  });
});

describe("the link over a fake nmem", () => {
  test("an older nmem: one line, update Mem on the home; nothing else is run", async () => {
    const r = rig({ NMEM_FAKE_VERSION: "0.10.116" });
    expect(await r.link.view()).toEqual({ state: "update_mem", identity: "ducter", home: "hel" });
    await r.link.connect();
    expect(writes(r.calls())).toEqual([]);
    // Only the version and the help probe: no setup, no list.
    expect(r.calls().every((c) => c.includes("--version") || c.join(" ").includes("bridge connections --help"))).toBe(true);
  });

  test("ready: what 接上 will do, read passively", async () => {
    const r = rig();
    expect(await r.link.view()).toEqual({ state: "ready", identity: "ducter", space: { id: "fake-space", label: "Only me" } });
    expect(writes(r.calls())).toEqual([]);
    expect(r.calls().some((c) => c.includes("--enable"))).toBe(false);
    expect(r.link.context()).toBeUndefined();
  });

  test("connect: the exact argv, the passive check, then on (and Disconnect undoes it)", async () => {
    const r = rig();
    await r.link.view();
    await r.link.connect();
    expect(writes(r.calls())).toEqual([["--json", "bridge", "connections", "connect", "--space-id", "fake-space", "--agent-id", "ducter", "--context", "ducter"]]);
    const after = r.calls().slice(r.calls().findIndex((c) => c.includes("connect")) + 1);
    expect(after[0]).toEqual(["--json", "--agent-context", "ducter", "bridge", "setup"]);
    expect(r.link.context()).toBe("ducter");
    expect(await r.link.view()).toEqual({ state: "connected", identity: "ducter", space: { id: "fake-space", label: "Only me" } });
    expect(r.changes()).toBeGreaterThanOrEqual(2); // connecting…, then connected
    const kept = JSON.parse(readFileSync(join(r.data, BRIDGE_CONNECTION_FILE), "utf8"));
    expect(kept).toMatchObject({ context: "ducter", agentId: "ducter", spaceId: "fake-space", confirmed: true });

    await r.link.disconnect();
    expect(writes(r.calls()).at(-1)).toEqual(["--json", "bridge", "connections", "revoke", kept.connectionId]);
    expect(r.link.context()).toBeUndefined();
    expect(existsSync(join(r.data, BRIDGE_CONNECTION_FILE))).toBe(false);
    expect((await r.link.view())?.state).toBe("ready");
  });

  test("DUCTER_BRIDGE_CONTEXT names the context it saves", async () => {
    const r = rig({ DUCTER_BRIDGE_CONTEXT: "ducter-bridge" });
    await r.link.view();
    await r.link.connect();
    expect(writes(r.calls())[0]).toEqual(["--json", "bridge", "connections", "connect", "--space-id", "fake-space", "--agent-id", "ducter", "--context", "ducter-bridge"]);
    expect(r.link.context()).toBe("ducter-bridge");
  });

  for (const [code, reason] of Object.entries(REFUSALS))
    test(`refused ${code}: said as ${reason}, nothing else tried`, async () => {
      const r = rig({ NMEM_FAKE_REFUSE: code });
      await r.link.view();
      await r.link.connect();
      expect(await r.link.view()).toEqual({ state: "refused", reason, identity: "ducter", space: { id: "fake-space", label: "Only me" } });
      // One connect, with the persona's identity and the personal place: no other identity, place or key.
      expect(writes(r.calls())).toEqual([["--json", "bridge", "connections", "connect", "--space-id", "fake-space", "--agent-id", "ducter", "--context", "ducter"]]);
      expect(r.calls().some((c) => c.includes("--enable") || c.includes("select-cloud") || c.includes("keys") || c.includes("enroll"))).toBe(false);
      expect(r.link.context()).toBeUndefined();
    });

  for (const which of ["none", "two"])
    test(`no single personal place (${which}): nothing offered, connect runs nothing`, async () => {
      const r = rig({ NMEM_FAKE_SPACES: which });
      expect(await r.link.view()).toEqual({ state: "no_space", identity: "ducter" });
      await r.link.connect();
      expect(writes(r.calls())).toEqual([]);
    });

  test("a connection revoked elsewhere is dropped at the next look", async () => {
    const r = rig();
    await r.link.view();
    await r.link.connect();
    const s = JSON.parse(readFileSync(r.state, "utf8"));
    s.connections[0].state = "revoked";
    writeFileSync(r.state, JSON.stringify(s));
    // A new link (a restart) verifies once with the read-only list.
    const again = createBridgeLink({ dataDir: r.data, identity: () => "ducter", home: () => "hel", run: nmemCall({ bin: r.bin, env: r.fullEnv }), env: r.fullEnv });
    const dropped = new Promise<void>((res) => again.onChange(res));
    await again.view();
    await dropped;
    expect(again.context()).toBeUndefined();
  });

  test("DUCTER_BRIDGE=1 pins it on (no disconnect here); DUCTER_BRIDGE=0 shows nothing", async () => {
    const on = rig({ DUCTER_BRIDGE: "1", DUCTER_BRIDGE_CONTEXT: "ducter-test" });
    expect(await on.link.view()).toEqual({ state: "connected", identity: "ducter", pinned: true });
    expect(on.calls()).toEqual([]);
    const off = rig({ DUCTER_BRIDGE: "0" });
    expect(await off.link.view()).toBeUndefined();
  });

  test("no Mem identity: nothing shows, nothing runs", async () => {
    const r = rig();
    const link = createBridgeLink({ dataDir: r.data, identity: () => undefined, home: () => "hel", run: nmemCall({ bin: r.bin, env: r.fullEnv }), env: r.fullEnv });
    expect(await link.view()).toBeUndefined();
    expect(r.calls()).toEqual([]);
  });
});

test("over the socket: 接上 pushes connecting…, then connected, in the settings frame", async () => {
  const r = rig();
  const t = tempDir();
  stops.push(t.cleanup);
  const core = startCore({ dataDir: t.dir, port: 0, batchMs: 5, deviceProbes: { cua: async () => null, harnesses: async () => [], kind: async () => "laptop" }, bridgeLink: { run: nmemCall({ bin: r.bin, env: r.fullEnv }), env: r.fullEnv } });
  stops.push(() => core.stop());
  core.setPartner({ onTrigger: () => {} });
  core.persona.mem = { agentId: "ducter", owned: true };
  core.settings.setMemState("connected");
  const frames: ServerFrame[] = [];
  const ws = new WebSocket(core.url);
  ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
  await new Promise<void>((res, rej) => ((ws.onopen = () => res()), (ws.onerror = rej)));
  stops.push(() => ws.close());
  ws.send(JSON.stringify({ t: "hello" }));
  const until = async (pred: (f: ServerFrame) => boolean) => {
    for (let i = 0; i < 600; i++) {
      const hit = frames.find(pred);
      if (hit) return hit;
      await Bun.sleep(10);
    }
    throw new Error(`timeout; got ${frames.map((f) => f.t)}`);
  };
  ws.send(JSON.stringify({ t: "settings" }));
  const first = (await until((f) => f.t === "settings" && !!f.bridge)) as Extract<ServerFrame, { t: "settings" }>;
  expect(first.bridge?.state).toBe("ready");
  ws.send(JSON.stringify({ t: "bridge_connect" }));
  await until((f) => f.t === "settings" && f.bridge?.state === "connecting");
  await until((f) => f.t === "settings" && f.bridge?.state === "connected");
  expect(core.bridgeLink.context()).toBe("ducter");
});
