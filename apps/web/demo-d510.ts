// A demo core for D510 (新任务默认 / New tasks start): the author's setup from his report. hel is the
// home (a server that never sleeps; Codex and Claude Code), a MacBook does tasks for it (both agents,
// the person's Chrome, the repository's clone). DEMO_SET=1: New tasks start is hel and Codex, and the
// handed-over GitHub to-do runs there, its meta saying so. Real core and real web client; the
// runner is the stub, the worker a socket that says hello.
//   DUCTER_PORT=7841 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh DEMO_SET=1 bun apps/web/demo-d510.ts
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
if (!process.env.DUCTER_DATA_DIR) throw new Error("set DUCTER_DATA_DIR to a scratch folder");
const core = startCore({
  ooSource: noOo,
  persona: { id: "default", name: zh ? "小鸭" : "Duckie", identity: "" },
  hostname: "127.0.0.1",
  deviceProbes: {
    cua: async () => ({ version: "0.44.0" }),
    native: async () => undefined,
    harnesses: async () => [
      { harness: "codex", installed: true, loggedIn: true, canBePartner: true, billing: "plan" },
      { harness: "claude-code", installed: true, loggedIn: true, canBePartner: true, billing: "plan" },
    ],
    kind: async () => "server",
  },
  update: { homeName: "hel", autoEveryMs: 0 } as never,
});
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
core.settings.set({ language: zh ? "zh" : "en" });

// The MacBook, doing tasks for hel (D155), with the person's Chrome.
const mac = core.devices.redeem(core.devices.createCode({ kind: "worker" }).code, { name: "MacBook", platform: "darwin-arm64" }) as { token: string; device: { id: string } };
const ws = new WebSocket(`ws://127.0.0.1:${core.port}/worker`, { headers: { "x-forwarded-for": "203.0.113.9", authorization: `Bearer ${mac.token}` } } as never);
await new Promise<void>((r) => (ws.onopen = () => r()));
ws.send(
  JSON.stringify({
    t: "hello",
    os: "darwin",
    arch: "arm64",
    kind: "laptop",
    version: "0.1.30",
    alwaysOn: false,
    abilities: [{ id: "web", state: "on", detail: "claude", where: "chrome" }],
    harnesses: [
      { id: "claude-code", installed: true, loggedIn: true },
      { id: "codex", installed: true, loggedIn: true },
    ],
  }),
);
await Bun.sleep(100);

if (process.env.DEMO_SET === "1") {
  core.settings.set({ newTasks: { where: "local", agent: "codex" } });
  // The GitHub to-do handed over from the conversation, as the pick with New tasks start makes it.
  const id = "t_issue";
  const title = zh ? "修好 general settings 页面的间距" : "Fix the general settings page spacing";
  core.log.append({ stream: `task:${id}`, origin: "partner", kind: "task_open", body: { taskId: id, title, project: "mem", place: { kind: "repo", device: "local", repoPath: "~/ducter/projects/mem" }, harness: "codex", brief: title } });
  core.log.append({ stream: `task:${id}`, origin: "system", kind: "body_selected", body: { taskId: id, harness: "codex", why: { kind: "rule", ruleId: "new_tasks", text: "Codex", where: { device: "hel", kind: "you", ruleId: "new_tasks" } } } });
  core.tasks.setState(id, "working", "hot");
}
console.log(`demo at http://127.0.0.1:${core.port}/app`);
