// D227, end to end over the real sockets: Update all's Codex step on a Mac whose Ducter restarts
// under the updater (the author's MacBook, 2026-11-12: the row said 正在更新到 0.167.2 for 45 min).
// A real core (the home), the Mac's worker as two processes in turn (boot ids b1, b2), each with
// the real worker-side agent updater over a fake machine; the first one's updater never finishes
// (its process went away mid-npm). No network, nothing installed.
import { afterEach, expect, test } from "bun:test";
import type { ServerFrame, UpdateAllItem } from "@ducter/protocol";
import { createWorkerAgentUpdater } from "../src/agents.ts";
import type { AgentInstall } from "../src/harness-probe.ts";
import { startCore, type Core } from "../src/core.ts";
import type { DeviceProbes } from "../src/devices.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

const NPM_CODEX = "https://registry.npmjs.org/@openai/codex/latest";
const probes: Partial<DeviceProbes> = { cua: async () => ({ missing: "no" }), native: async () => undefined, harnesses: async () => [], kind: async () => "server" };

function boot(): Core {
  const t = tempDir();
  const fetch = async (url: string) => (url === NPM_CODEX ? new Response('{"version":"0.167.2"}') : new Response("not found", { status: 404 }));
  const core = startCore({
    dataDir: t.dir,
    port: 0,
    batchMs: 5,
    sweepMs: 50,
    deviceProbes: probes,
    update: { fetch: async () => new Response(JSON.stringify({ tag_name: "v0.0.32" })), how: "self", version: "0.0.32", autoEveryMs: 0 },
    agents: { fetch: fetch as any, autoEveryMs: 0 },
    updateAll: { tickMs: 20 },
  });
  stops.push(t.cleanup, () => core.stop());
  core.setPartner({ onTrigger: () => {} });
  return core;
}

async function client(url: string) {
  const frames: ServerFrame[] = [];
  const ws = new WebSocket(url);
  ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
  await new Promise<void>((res, rej) => ((ws.onopen = () => res()), (ws.onerror = rej)));
  stops.push(() => ws.close());
  ws.send(JSON.stringify({ t: "hello" }));
  const until = async <T extends ServerFrame>(pred: (f: ServerFrame) => boolean): Promise<T> => {
    for (let i = 0; i < 600; i++) {
      const hit = [...frames].reverse().find(pred);
      if (hit) return hit as T;
      await Bun.sleep(10);
    }
    throw new Error(`timeout; last: ${JSON.stringify((frames.findLast((f) => f.t === "devices") as any)?.updateAll)} ${JSON.stringify((frames.findLast((f) => f.t === "devices") as any)?.devices?.[1]?.harnesses)}`);
  };
  await until((f) => f.t === "on_hand");
  return { send: (f: object) => ws.send(JSON.stringify(f)), until, frames };
}

/** The Mac's Codex: 0.167.1 by npm; `npm` either hangs (the process dies under it) or installs. */
function macCodex() {
  const m = { version: "0.167.1", hang: true, runs: 0 };
  const sys = {
    run: async () => {
      m.runs++;
      if (m.hang) await new Promise(() => {}); // npm killed with its Ducter: never returns
      m.version = "0.167.2";
      return { code: 0, out: "" };
    },
    sleep: (ms: number) => Bun.sleep(Math.min(ms, 5)),
    now: () => Date.now(),
  };
  const detect = async (): Promise<AgentInstall | undefined> => ({ how: "npm", version: m.version, prefix: "/opt/homebrew" });
  return { m, sys, detect };
}

/** One worker process on the Mac: its socket, its hello (with its boot id), its agent updater. */
async function macWorker(core: Core, token: string, bootId: string, codex: ReturnType<typeof macCodex>, dataDir: string) {
  const REMOTE = { "x-forwarded-for": "203.0.113.9" };
  const harnesses = () => [{ id: "codex", installed: true, loggedIn: true, version: codex.m.version, how: "npm" }];
  const agents = createWorkerAgentUpdater({ sys: codex.sys, detect: codex.detect, loggedIn: async () => true, probe: async () => harnesses(), dataDir, pid: bootId === "b1" ? 1111 : 2222, alive: () => false });
  await agents.leftovers();
  const ws = new WebSocket(`ws://127.0.0.1:${core.port}/worker`, { headers: { ...REMOTE, authorization: `Bearer ${token}` } } as any);
  await new Promise<void>((res) => (ws.onopen = () => res()));
  const send = (x: object) => (ws.readyState === WebSocket.OPEN ? void ws.send(JSON.stringify(x)) : false);
  const asked: string[] = [];
  ws.onmessage = (m) => {
    const f = JSON.parse(String(m.data));
    if (f.t === "welcome") agents.attach(send);
    if (f.t === "req" && f.op === "agent_update") asked.push(f.args.harness), void agents.handle(f, send, { turningOn: () => 0 });
  };
  ws.send(JSON.stringify({ t: "hello", os: "darwin", arch: "arm64", version: "0.0.32", how: "app", asksApp: true, boot: bootId, agentUpdates: agents.updating(), harnesses: harnesses() }));
  stops.push(() => ws.close());
  return { ws, asked };
}

const codexStep = (f: ServerFrame): UpdateAllItem | undefined => (f.t === "devices" ? f.updateAll?.plan?.items.find((i) => i.key.endsWith(":codex")) : undefined);

test("the Mac's Ducter restarts under Codex's update: the row waits for it to reconnect, then the step starts again by itself and finishes", async () => {
  const core = boot();
  await core.release.check(true);
  const mac = tempDir();
  stops.push(mac.cleanup);
  const w = core.devices.redeem(core.devices.createCode({ kind: "worker" }).code, { name: "Macbook Pro M3", platform: "darwin-arm64" }) as { token: string; device: { id: string } };
  const codex = macCodex();
  const first = await macWorker(core, w.token, "b1", codex, mac.dir);
  const phone = await client(core.url);
  phone.send({ t: "agent_update", device: "local", harness: "", check: true }); // read the channels now
  await phone.until((x) => x.t === "agent_update_result");
  core.devicesView.refresh();
  phone.send({ t: "devices" });
  await phone.until((x) => x.t === "devices" && !!x.updateAll?.offer.some((i) => i.key === `agent:${w.device.id}:codex`));

  phone.send({ t: "update_all" });
  expect(await phone.until((x) => x.t === "update_all_result")).toMatchObject({ ok: true });
  await phone.until((x) => codexStep(x)?.phase === "updating");
  expect(first.asked).toEqual(["codex"]);

  // The Mac app swaps itself in and launchd restarts the worker: the socket goes, npm with it.
  first.ws.close();
  const away = await phone.until((x) => codexStep(x)?.wait === "reconnect");
  expect(codexStep(away)).toMatchObject({ state: "running", deviceName: "Macbook Pro M3" });

  // The new process says hello (another boot, nothing under way), still on 0.167.1; this time npm works.
  codex.m.hang = false;
  const second = await macWorker(core, w.token, "b2", codex, mac.dir);
  const done = await phone.until((x) => codexStep(x)?.state === "done");
  expect(codexStep(done)).toMatchObject({ state: "done", retried: true, to: "0.167.2" });
  expect(second.asked).toEqual(["codex"]); // started again once, by itself
  expect(codex.m.runs).toBe(2);
  const log = core.log.read({ stream: "devices", kinds: ["agent_update"] }).map((e) => `${(e.body as any).phase}${(e.body as any).reason ? `:${(e.body as any).reason}` : ""}`);
  expect(log).toContain("failed:interrupted");
  expect(log.at(-1)).toBe("done");
});

test("a Ducter that restarts under it twice: the step fails with the honest reason, long before 45 minutes", async () => {
  const core = boot();
  await core.release.check(true);
  const mac = tempDir();
  stops.push(mac.cleanup);
  const w = core.devices.redeem(core.devices.createCode({ kind: "worker" }).code, { name: "Macbook Pro M3", platform: "darwin-arm64" }) as { token: string; device: { id: string } };
  const codex = macCodex();
  const first = await macWorker(core, w.token, "b1", codex, mac.dir);
  const phone = await client(core.url);
  phone.send({ t: "agent_update", device: "local", harness: "", check: true });
  await phone.until((x) => x.t === "agent_update_result");
  core.devicesView.refresh();
  phone.send({ t: "devices" });
  await phone.until((x) => x.t === "devices" && !!x.updateAll?.offer.length);
  phone.send({ t: "update_all" });
  await phone.until((x) => codexStep(x)?.phase === "updating");
  first.ws.close();
  const second = await macWorker(core, w.token, "b2", codex, mac.dir);
  await phone.until((x) => codexStep(x)?.retried === true && codexStep(x)?.phase === "updating");
  second.ws.close();
  await macWorker(core, w.token, "b3", codex, mac.dir);
  const failed = await phone.until((x) => codexStep(x)?.state === "failed");
  expect(codexStep(failed)).toMatchObject({ state: "failed", reason: "interrupted", retried: true });
  expect(codex.m.runs).toBe(2);
});
