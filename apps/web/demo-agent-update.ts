// A demo core for D362: 全部更新 with Codex on a MacBook that does tasks for the home, from npm, on a
// slow line. The home (Hetzner) is the real core; the MacBook is a pretend worker over the real
// worker socket that answers agent_update and reports its download as a real worker does (bytes,
// then the install, then the check), and stops on agent_update_stop. Nothing is downloaded or
// installed; the registry is a fake.
//   DUCTER_PORT=7998 DUCTER_DATA_DIR=$(mktemp -d) bun apps/web/demo-agent-update.ts
// then open http://127.0.0.1:7998/app#settings=devices. DEMO_RATE: bytes a second (default 400 KB).
// DEMO_SIZE=0: the source doesn't say the size. DEMO_STEP=time: an updater Ducter can't see inside.
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";

const SIZE = Number(process.env.DEMO_SIZE ?? 155_000_000);
const RATE = Number(process.env.DEMO_RATE ?? 400_000);
const feed = async () => new Response(JSON.stringify({ tag_name: "v0.0.77", body: "" }));
const registry = async (u: string) => (u.includes("@openai/codex") ? new Response('{"version":"0.170.0"}') : new Response("", { status: 404 }));
const core = startCore({
  ooSource: noOo,
  persona: { id: "default", name: "Ducter", identity: "" },
  hostname: "127.0.0.1",
  platform: "linux",
  deviceProbes: {
    cua: async () => ({ missing: "no" }),
    native: async () => undefined,
    harnesses: async () => [{ harness: "codex", installed: true, loggedIn: true, version: "0.170.0", how: "npm" }],
    kind: async () => "server",
  },
  update: { fetch: feed, how: "self", version: "0.0.77", homeName: "Hetzner", autoEveryMs: 0, run: () => new Promise(() => {}) },
  agents: { fetch: registry as any, sys: { fetch: registry as any, run: () => new Promise(() => {}), freeBytes: () => undefined, sleep: (ms) => Bun.sleep(ms), now: () => Date.now() }, autoEveryMs: 0 },
  memPlugins: { inspectLocal: async () => ({}), everyMs: 0, connected: () => false },
});
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
await core.release.check(true);

const w = core.devices.redeem(core.devices.createCode({ kind: "worker" }).code, { name: "MacBook Pro M3", platform: "darwin-arm64", computer: "MacBook Pro M3" } as any) as { token: string };
const ws = new WebSocket(`ws://127.0.0.1:${core.port}/worker`, { headers: { authorization: `Bearer ${w.token}` } } as any);
await new Promise<void>((r) => (ws.onopen = () => r()));
let version = "0.169.1";
const hello = () => ({
  t: "hello",
  os: "darwin",
  arch: "arm64",
  kind: "laptop",
  version: "0.0.77",
  how: "app",
  abilities: [],
  harnesses: [{ id: "codex", installed: true, loggedIn: true, version, how: "npm" }],
});
ws.send(JSON.stringify(hello()));

let stop = false;
const send = (f: object) => ws.send(JSON.stringify(f));
ws.onmessage = async (m) => {
  const f = JSON.parse(String(m.data));
  if (f.t !== "req") return;
  if (f.op === "agent_update_stop") {
    stop = true;
    return send({ t: "res", id: f.id, ok: true, result: { ok: true } });
  }
  if (f.op !== "agent_update") return send({ t: "res", id: f.id, ok: true, result: {} });
  send({ t: "res", id: f.id, ok: true, result: { ok: true } });
  const base = { t: "agent_update", harness: "codex", from: "0.169.1", to: "0.170.0" };
  send({ ...base, phase: "updating" });
  if (process.env.DEMO_STEP === "time") await Bun.sleep(30 * 60_000);
  else
    for (let got = 0; got < SIZE || (!SIZE && got < 155_000_000); got += RATE) {
      if (stop) {
        send({ ...base, phase: "failed", reason: "stopped", rolledBack: false });
        return send({ t: "agents", harnesses: hello().harnesses });
      }
      send({ ...base, phase: "updating", step: "downloading", got, ...(SIZE ? { size: SIZE } : {}) });
      await Bun.sleep(1000);
    }
  send({ ...base, phase: "updating", step: "installing" });
  await Bun.sleep(4000);
  send({ ...base, phase: "checking" });
  version = "0.170.0";
  await Bun.sleep(1000);
  send({ ...base, phase: "done", to: "0.170.0" });
  send({ t: "agents", harnesses: hello().harnesses });
};
await Bun.sleep(300);
await core.agents.check();
console.log("update all:", JSON.stringify(await core.updateAll.start("user")));
console.log(`demo at http://127.0.0.1:${core.port}/app#settings=devices`);
// DEMO_STOP_AFTER=<s>: 停止 on the MacBook's step after that long, through the home as a tap does.
if (process.env.DEMO_STOP_AFTER) {
  await Bun.sleep(Number(process.env.DEMO_STOP_AFTER) * 1000);
  const key = core.updateAll.plan()?.items.find((i) => i.kind === "agent" && i.state === "running")?.key ?? "";
  console.log("stop", key, await core.updateAll.stopItem(key));
  await Bun.sleep(1500);
  console.log("after stop:", JSON.stringify(core.updateAll.plan()?.items.map((i) => [i.key, i.state, i.reason])));
}
