// A demo core for D157's phone pictures (where a task runs): hel is the home (a server that never
// sleeps, Codex, Ducter's own browser), a MacBook does tasks for it (Claude Code and Codex, the
// user's Chrome, asleep or awake), and the author's evening of tasks: a public look-up on hel, an
// order in the user's Chrome on the MacBook, Keynote waiting for the MacBook, and the sleeping-Mac
// ask. Real core and real web client; the runner is the stub, the worker a socket that says hello.
//   DUCTER_PORT=7811 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh DEMO_MAC=asleep bun apps/web/demo-where.ts
import { startCore, stubRunner } from "@ducter/core";
import { noOo } from "./demo-oo.ts";
import type { Bodies, Place } from "@ducter/protocol";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const w = (z: string, e: string) => (zh ? z : e);
const core = startCore({ ooSource: noOo,
  persona: { id: "default", name: "Ducter", identity: "" },
  hostname: "127.0.0.1",
  deviceProbes: {
    cua: async () => ({ version: "0.44.0" }),
    native: async () => undefined,
    harnesses: async () => [{ harness: "codex", installed: true, loggedIn: true }],
    kind: async () => "server",
  },
  update: { homeName: "hel", autoEveryMs: 0 } as any,
});
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });

// The MacBook, doing tasks for hel (D155), with the user's Chrome.
const mac = core.devices.redeem(core.devices.createCode({ kind: "worker" }).code, { name: "MacBook", platform: "darwin-arm64" }) as { token: string; device: { id: string } };
const ws = new WebSocket(`ws://127.0.0.1:${core.port}/worker`, { headers: { "x-forwarded-for": "203.0.113.9", authorization: `Bearer ${mac.token}` } } as any);
await new Promise<void>((r) => (ws.onopen = () => r()));
ws.send(
  JSON.stringify({
    t: "hello",
    os: "darwin",
    arch: "arm64",
    kind: "laptop",
    version: "0.0.5",
    alwaysOn: false,
    abilities: [{ id: "web", state: "on", detail: "claude", where: "chrome" }],
    harnesses: [
      { id: "claude-code", installed: true, loggedIn: true },
      { id: "codex", installed: true, loggedIn: true },
    ],
  }),
);
await Bun.sleep(100);

const log = core.log;
const open = (id: string, title: string, place: Place, harness: string, why: Bodies["body_selected"]["why"], needs?: Bodies["task_open"]["needs"]) => {
  log.append({ stream: `task:${id}`, origin: "partner", kind: "task_open", body: { taskId: id, title, project: "", place, harness, brief: title, ...(needs ? { needs } : {}) } });
  log.append({ stream: `task:${id}`, origin: "system", kind: "body_selected", body: { taskId: id, harness, why } });
};
open("t_hn", w("查一下 HN 今天关于 OAR 的讨论", "What HN says about OAR today"), { kind: "browser", device: "local", profile: "default" }, "codex", { kind: "default", where: { device: "hel", kind: "no_signin", uses: "ducter" } }, { browse: true });
core.tasks.setState("t_hn", "working", "hot");
open("t_order", w("看看淘宝那单到哪了", "Where my Taobao order is"), { kind: "browser", device: "MacBook", profile: "default" }, "claude-code", { kind: "default", where: { device: "MacBook", kind: "signed_in", site: "taobao.com", uses: "chrome" } }, { signedIn: true, site: "taobao.com" });
core.tasks.setState("t_order", "working", "hot");
open("t_key", w("把周报做成 Keynote", "Turn the weekly report into Keynote"), { kind: "none", device: "MacBook" }, "codex", { kind: "default", where: { device: "MacBook", kind: "only_here", thing: "app", app: "Keynote", uses: "app" } }, { app: "Keynote" });
core.tasks.setState("t_key", "blocked", "offline", "device:asleep:MacBook");
// The sleeping-Mac ask (W2b): wait for it by default, or do it on hel now (a sign-in there first).
open("t_mail", w("看看京东那单发货没", "Has my JD order shipped"), { kind: "browser", device: "MacBook", profile: "default" }, "claude-code", { kind: "default", where: { device: "MacBook", kind: "signed_in", site: "jd.com", uses: "chrome" } }, { signedIn: true, site: "jd.com" });
core.tasks.setState("t_mail", "blocked", "offline", "device:asleep:MacBook");
log.append({
  stream: "task:t_mail",
  origin: "task",
  kind: "report",
  body: {
    taskId: "t_mail",
    state: "needs_input",
    summary: "where",
    evidence: [],
    questions: [{ id: "where", text: "MacBook is asleep.", blocking: true, reversible: false, where: { kind: "asleep", device: "MacBook", state: "asleep", other: "hel", site: "jd.com", here: "chrome", uses: "ducter", signIn: true } }],
  },
});
if (process.env.DEMO_MAC === "asleep") {
  ws.send(JSON.stringify({ t: "sleep" }));
  await Bun.sleep(50);
  ws.close();
}
console.log(`demo at http://127.0.0.1:${core.port}/app`);
