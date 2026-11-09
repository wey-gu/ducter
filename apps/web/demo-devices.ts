// A demo core for the phone's 你的设备 / Your devices pictures (D148, D156): a home on a VPS one
// version behind, with Codex one version behind on npm and Claude Code on a version Ducter hasn't
// checked; a Mac mini doing tasks (it updates with its app; its Codex is the Codex app's copy), a
// phone, and the update's steps on cue. Real core and real web client; the release feed, the
// registry and the installs are fakes (no network, nothing installed).
//   DUCTER_PORT=7798 DUCTER_DATA_DIR=$(mktemp -d) bun apps/web/demo-devices.ts
// Then POST /step?phase=downloading (or verifying, waiting, restarting, done, failed) on DEMO_CTL_PORT,
// or /agent?phase=waiting (updating, checking, done, failed) for Codex's own update.
import { startCore, stubRunner } from "@ducter/core";

const feed = async () => new Response(JSON.stringify({ tag_name: "v0.0.4", body: "- Update Ducter and its computers in place, with a rollback\n- Device cards you can rename where they are" }));
const registry = async (u: string) =>
  u.includes("@openai/codex") ? new Response('{"version":"0.168.0"}') : u.includes("claude-code-releases") ? new Response("2.1.321") : new Response("", { status: 404 });
const core = startCore({
  persona: { id: "default", name: "Ducter", identity: "" },
  hostname: "127.0.0.1",
  deviceProbes: {
    cua: async () => ({ missing: "no" }),
    native: async () => undefined,
    harnesses: async () => [
      { harness: "codex", installed: true, loggedIn: true, version: "0.167.0", how: "npm" },
      { harness: "claude-code", installed: true, loggedIn: true, version: "2.1.321", how: "installer" },
    ],
    kind: async () => "server",
  },
  update: { fetch: feed, how: "self", version: "0.0.3", homeName: "vps-1", autoEveryMs: 0, run: () => new Promise(() => {}) },
  agents: { fetch: registry as any, sys: { fetch: registry as any, run: () => new Promise(() => {}), freeBytes: () => undefined, sleep: (ms) => Bun.sleep(ms), now: () => Date.now() }, autoEveryMs: 0 },
});
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
await core.release.check(true);

// A Mac mini doing tasks for it, and a phone.
const w = core.devices.redeem(core.devices.createCode({ kind: "worker" }).code, { name: "Mac mini", platform: "darwin-arm64" }) as { token: string };
const ws = new WebSocket(`ws://127.0.0.1:${core.port}/worker`, { headers: { "x-forwarded-for": "203.0.113.9", authorization: `Bearer ${w.token}` } } as any);
ws.onopen = () =>
  ws.send(JSON.stringify({ t: "hello", os: "darwin", arch: "arm64", kind: "mini", version: "0.0.3", how: "app", harnesses: [{ id: "codex", installed: true, loggedIn: true, version: "0.166.0", how: "app" }] }));
core.devices.redeem(core.devices.createCode().code, { name: "Wey 的 iPhone", platform: "ios-safari" });
await core.agents.check();

const name = () => "vps-1";
Bun.serve({
  port: Number(process.env.DEMO_CTL_PORT || 7799),
  fetch(req) {
    const url = new URL(req.url);
    const phase = url.searchParams.get("phase") as any;
    if (url.pathname === "/agent") {
      core.agents.fromWorker("local", name(), { t: "agent_update", harness: "codex", phase, from: "0.167.0", to: "0.168.0", ...(phase === "failed" ? { reason: "version", rolledBack: true } : {}) });
      return new Response("ok");
    }
    if (phase === "failed") core.updates.fromWorker("local", name(), { t: "update", phase, from: "0.0.3", to: "0.0.4", reason: "health", rolledBack: true });
    else core.updates.fromWorker("local", name(), { t: "update", phase, from: "0.0.3", to: "0.0.4", progress: 0.4 });
    return new Response("ok");
  },
});
console.log(`demo at http://127.0.0.1:${core.port}/app`);
