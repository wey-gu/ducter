// A demo core for the phone's 你的设备 / Your devices pictures (D148, D156, D161): hel is the home
// (a server: Claude Code, Codex signed out, Ducter's own browser), a MacBook does tasks for it
// (Claude Code on a version Ducter hasn't checked, Codex installed with Homebrew, pi; two tasks
// under way, the app and the command line on it), and a phone. Real core and real web client;
// the release feed, the registry and the installs are fakes (no network, nothing installed).
//   DUCTER_PORT=7798 DUCTER_DATA_DIR=$(mktemp -d) bun apps/web/demo-devices.ts
// Then POST /step?phase=downloading (or verifying, waiting, restarting, done, failed) on DEMO_CTL_PORT,
// or /agent?phase=waiting (updating, checking, done, failed) for Codex's own update on hel.
import { startCore, stubRunner } from "@ducter/core";
import { noOo } from "./demo-oo.ts";

const feed = async () => new Response(JSON.stringify({ tag_name: "v0.0.8", body: "- Every device card is a character sheet\n- Coins pop when an update lands" }));
const registry = async (u: string) =>
  u.includes("@openai/codex") ? new Response('{"version":"0.168.0"}') : u.includes("claude-code-releases") ? new Response("2.1.322") : new Response("", { status: 404 });
const core = startCore({ ooSource: noOo,
  persona: { id: "default", name: "Ducter", identity: "" },
  hostname: "127.0.0.1",
  // D237: with DEMO_PHONE, hel is the Linux server it is (no 用电脑, no 用手机 of its own).
  ...(process.env.DEMO_PHONE ? { platform: "linux" as const } : {}),
  deviceProbes: {
    cua: async () => ({ missing: "no" }),
    native: async () => undefined,
    harnesses: async () => [
      { harness: "claude-code", installed: true, loggedIn: true, version: "2.1.319", how: "installer" },
      { harness: "codex", installed: true, loggedIn: false, version: "0.167.0", how: "npm" },
    ],
    kind: async () => "server",
  },
  update: { fetch: feed, how: "self", version: "0.0.7", homeName: "hel", autoEveryMs: 0, run: () => new Promise(() => {}) },
  agents: { fetch: registry as any, sys: { fetch: registry as any, run: () => new Promise(() => {}), freeBytes: () => undefined, sleep: (ms) => Bun.sleep(ms), now: () => Date.now() }, autoEveryMs: 0 },
  // D169: Mem's own check, faked: Claude Code doesn't have it yet, Codex does (nothing is installed by the demo).
  memPlugins: { inspectLocal: async () => ({ "claude-code": { state: "absent" }, codex: { state: "installed", version: "0.7.34" } }), everyMs: 0, connected: () => true },
});
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
await core.release.check(true);

// The MacBook, doing tasks for hel, with the app and the command line on it; and a phone.
const w = core.devices.redeem(core.devices.createCode({ kind: "worker" }).code, { name: "MacBook", platform: "darwin-arm64", computer: "MacBook" } as any) as { token: string };
const ws = new WebSocket(`ws://127.0.0.1:${core.port}/worker`, { headers: { "x-forwarded-for": "203.0.113.9", authorization: `Bearer ${w.token}` } } as any);
await new Promise<void>((r) => (ws.onopen = () => r()));
ws.send(
  JSON.stringify({
    t: "hello",
    os: "darwin",
    arch: "arm64",
    kind: "laptop",
    version: "0.0.7",
    how: "app",
    abilities: [
      { id: "web", state: "off", where: "chrome" },
      { id: "computer", state: "on" },
      // D237: DEMO_PHONE=on gives the MacBook 用手机, so hel's card points there.
      ...(process.env.DEMO_PHONE ? [{ id: "phone", state: process.env.DEMO_PHONE === "installing" ? "off" : "on", ...(process.env.DEMO_PHONE === "installing" ? { setup: "installing" } : {}) }] : []),
    ],
    harnesses: [
      { id: "claude-code", installed: true, loggedIn: true, version: "2.1.400", how: "installer" },
      { id: "codex", installed: true, loggedIn: true, version: "0.167.0", how: "brew" },
      { id: "pi", installed: true, loggedIn: true, version: "1.4.0", how: "installer" },
    ],
  }),
);
core.devices.redeem(core.devices.createCode().code, { name: "MacBook", platform: "darwin", form: "app", computer: "MacBook" } as any);
core.devices.redeem(core.devices.createCode().code, { name: "CLI on MacBook", platform: "darwin", form: "cli", computer: "MacBook" } as any);
core.devices.redeem(core.devices.createCode().code, { name: "iPhone", platform: "ios-safari" });
await Bun.sleep(100);
await core.agents.check();

// Two tasks under way on the MacBook.
for (const [id, title] of [
  ["t_order", process.env.DEMO_LANG === "en" ? "Where my Taobao order is" : "看看淘宝那单到哪了"],
  ["t_key", process.env.DEMO_LANG === "en" ? "Turn the weekly report into Keynote" : "把周报做成 Keynote"],
]) {
  core.log.append({ stream: `task:${id}`, origin: "partner", kind: "task_open", body: { taskId: id, title, project: "", place: { kind: "none", device: "MacBook" }, harness: "claude-code", brief: title } });
  core.tasks.setState(id!, "working", "hot");
}

const name = () => "hel";
Bun.serve({
  port: Number(process.env.DEMO_CTL_PORT || 7799),
  fetch(req) {
    const url = new URL(req.url);
    const phase = url.searchParams.get("phase") as any;
    if (url.pathname === "/agent") {
      core.agents.fromWorker("local", name(), { t: "agent_update", harness: "codex", phase, from: "0.167.0", to: "0.168.0", ...(phase === "failed" ? { reason: "version", rolledBack: true } : {}) });
      return new Response("ok");
    }
    if (phase === "failed") core.updates.fromWorker("local", name(), { t: "update", phase, from: "0.0.7", to: "0.0.8", reason: "health", rolledBack: true });
    else core.updates.fromWorker("local", name(), { t: "update", phase, from: "0.0.7", to: "0.0.8", progress: 0.4 });
    return new Response("ok");
  },
});
console.log(`demo at http://127.0.0.1:${core.port}/app`);
