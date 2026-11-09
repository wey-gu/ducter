// A demo core for the phone's 你的设备 / Your devices pictures (D146): a home on a VPS one version
// behind, a Mac mini doing tasks (it updates with its app), a phone, and the update's steps on cue.
// Real core and real web client; the release feed and the install are fakes (no network).
//   DUCTER_PORT=7798 DUCTER_DATA_DIR=$(mktemp -d) bun apps/web/demo-devices.ts
// Then POST /step?phase=downloading (or verifying, waiting, restarting, done, failed) on DEMO_CTL_PORT.
import { startCore, stubRunner } from "@ducter/core";

const feed = async () => new Response(JSON.stringify({ tag_name: "v0.0.4", body: "- Update Ducter and its computers in place, with a rollback\n- Device cards you can rename where they are" }));
const core = startCore({
  persona: { id: "default", name: "Ducter", identity: "" },
  hostname: "127.0.0.1",
  deviceProbes: { cua: async () => ({ missing: "no" }), native: async () => undefined, harnesses: async () => [{ harness: "claude-code", installed: true, loggedIn: true }, { harness: "codex", installed: false, loggedIn: false }], kind: async () => "server" },
  update: { fetch: feed, how: "self", version: "0.0.3", homeName: "vps-1", autoEveryMs: 0, run: () => new Promise(() => {}) },
});
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
await core.release.check(true);

// A Mac mini doing tasks for it, and a phone.
const w = core.devices.redeem(core.devices.createCode({ kind: "worker" }).code, { name: "Mac mini", platform: "darwin-arm64" }) as { token: string };
const ws = new WebSocket(`ws://127.0.0.1:${core.port}/worker`, { headers: { "x-forwarded-for": "203.0.113.9", authorization: `Bearer ${w.token}` } } as any);
ws.onopen = () => ws.send(JSON.stringify({ t: "hello", os: "darwin", arch: "arm64", kind: "mini", version: "0.0.3", how: "app", harnesses: [{ id: "claude-code", installed: true, loggedIn: true }] }));
core.devices.redeem(core.devices.createCode().code, { name: "Wey 的 iPhone", platform: "ios-safari" });

const name = () => "vps-1";
Bun.serve({
  port: Number(process.env.DEMO_CTL_PORT || 7799),
  fetch(req) {
    const phase = new URL(req.url).searchParams.get("phase") as any;
    if (phase === "failed") core.updates.fromWorker("local", name(), { t: "update", phase, from: "0.0.3", to: "0.0.4", reason: "health", rolledBack: true });
    else core.updates.fromWorker("local", name(), { t: "update", phase, from: "0.0.3", to: "0.0.4", progress: 0.4 });
    return new Response("ok");
  },
});
console.log(`demo at http://127.0.0.1:${core.port}/app`);
