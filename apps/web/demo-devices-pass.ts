// A demo core for the devices pass (D398): the author's own set. Hetzner Server is the home (a
// server: Codex and Claude Code, Ducter's own browser, From outside); Wey's MacBook Pro and haswell
// do tasks for it; an iPhone and an iPad reach it; a Pixel Fold is lent to tasks (用这台手机 added,
// its app linked). Real core and real web client; nothing is installed, nothing leaves the machine.
//   DUCTER_PORT=7841 DUCTER_DATA_DIR=$(mktemp -d) bun apps/web/demo-devices-pass.ts

import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";

const none = async () => new Response("", { status: 404 });
const core = startCore({
  ooSource: noOo,
  persona: { id: "default", name: "Ducter", identity: "" },
  hostname: "127.0.0.1",
  platform: "linux",
  deviceProbes: {
    cua: async () => ({ missing: "no" }),
    native: async () => undefined,
    harnesses: async () => [
      { harness: "codex", installed: true, loggedIn: true, version: "0.168.0", how: "npm" },
      { harness: "claude-code", installed: true, loggedIn: true, version: "2.1.400", how: "installer" },
    ],
    kind: async () => "server",
  },
  // The release feed and the registry are fakes: nothing is fetched, everything is current.
  update: { fetch: async () => new Response(JSON.stringify({ tag_name: "v0.0.91", body: "" })), how: "self", version: "0.0.91", homeName: "Hetzner Server", autoEveryMs: 0, run: () => new Promise(() => {}) },
  agents: { fetch: none as never, sys: { fetch: none as never, run: () => new Promise(() => {}), freeBytes: () => undefined, sleep: (ms: number) => Bun.sleep(ms), now: () => Date.now() }, autoEveryMs: 0 },
});
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });

/** A computer that does tasks for the home: paired as a worker, then its hello. */
async function worker(name: string, os: string, kind: string, abilities: unknown[], harnesses: unknown[]) {
  const w = core.devices.redeem(core.devices.createCode({ kind: "worker" }).code, { name, platform: `${os}-arm64`, computer: name } as never) as { token: string };
  const ws = new WebSocket(`ws://127.0.0.1:${core.port}/worker`, { headers: { authorization: `Bearer ${w.token}` } } as never);
  await new Promise<void>((r) => (ws.onopen = () => r()));
  ws.send(JSON.stringify({ t: "hello", os, arch: "arm64", kind, version: "0.0.91", how: "app", abilities, harnesses }));
}
await worker(
  "Wey's MacBook Pro",
  "darwin",
  "laptop",
  [{ id: "web", state: "on", where: "chrome" }, { id: "computer", state: "on" }, { id: "phone", state: "off" }],
  [
    { id: "claude-code", installed: true, loggedIn: true, version: "2.1.400", how: "installer" },
    { id: "codex", installed: true, loggedIn: true, version: "0.168.0", how: "brew" },
    { id: "pi", installed: true, loggedIn: true, version: "1.4.0", how: "installer" },
    { id: "deepseek-harness", installed: true, loggedIn: true, version: "0.3.0", how: "npm" },
  ],
);
await worker("haswell", "linux", "server", [{ id: "web", state: "on", where: "ducter" }], [
  { id: "claude-code", installed: true, loggedIn: true, version: "2.1.400", how: "installer" },
  { id: "codex", installed: true, loggedIn: true, version: "0.168.0", how: "npm" },
]);

// The handhelds: an iPhone and an iPad on the app; the Pixel Fold's app linked and added.
core.devices.redeem(core.devices.createCode().code, { name: "iPhone", platform: "ios-app" } as never);
const pad = core.devices.redeem(core.devices.createCode().code, { name: "iPad", platform: "ios-app" } as never) as { device: { id: string } };
core.devices.setShape?.(pad.device.id, "tablet");
const fold = core.devices.redeem(core.devices.createCode().code, { name: "Pixel Fold", platform: "android-app" } as never) as { token: string; device: { id: string } };
const phone = new WebSocket(`ws://127.0.0.1:${core.port}/ws`, { headers: { authorization: `Bearer ${fold.token}` } } as never);
await new Promise<void>((r) => (phone.onopen = () => r()));
phone.send(JSON.stringify({ t: "hello", client: "handset" }));
await Bun.sleep(100);
phone.send(JSON.stringify({ t: "handset_hello", state: { bridge: 1, sdk: 34, model: "Pixel Fold", foldable: true, service: true, pictures: true } }));
await Bun.sleep(200);
core.handsets.set(fold.device.id, true);

await Bun.sleep(200);
console.log(`demo at http://127.0.0.1:${core.port}/app`);
