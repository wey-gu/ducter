// A demo core for D395: the author's first real hand-off (hel, 2026-11-19). A GitHub to-do on
// nowledge-co/mem, "10559 帮我用 codex astra 仔细做一下", on a home that is a server with no clone.
// For screenshots of the web and Mac clients.
//   DUCTER_PORT=7981 DUCTER_DATA_DIR=/tmp/x DEMO_LANG=zh bun apps/web/demo-first-task.ts
// DEMO_STAGE: 1 = a task that couldn't start, its cause and fixes (default; a stale place still
//   can: a folder removed between the check and the start); 2 = the clone line: no computer had
//   the code, so Ducter clones it on the MacBook and says so in one line under the ack.
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";
import type { CantStart, DeviceHarness } from "@ducter/protocol";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const stage = Number(process.env.DEMO_STAGE ?? "1");
const harnesses: DeviceHarness[] = [
  { harness: "codex", installed: true, loggedIn: true, canBePartner: true, billing: "plan", models: [{ id: "gpt-6.2-astra", label: "GPT-6.2-Astra" }] },
  { harness: "claude-code", installed: true, loggedIn: true, canBePartner: true, billing: "plan", models: [{ id: "opus", label: "Opus" }] },
];
const core = startCore({
  ooSource: noOo,
  persona: { id: "default", name: "Ducter", identity: "" },
  hostname: process.env.DUCTER_HOST || "127.0.0.1",
  update: { homeName: "Hetzner Server" },
  deviceProbes: { cua: async () => ({ missing: "demo" }), harnesses: async () => harnesses, kind: async () => "server" },
});
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
const log = core.log;
const tick = () => Bun.sleep(30);

const w = zh
  ? {
      ask: "10559 帮我用 codex astra 仔细做一下",
      ack: "好，我让 Codex 仔细改通用设置页，做完告诉你。",
      title: "改进通用设置页（mem #10559）",
      clone: "mem 的代码还没在哪台电脑上，我先在 MacBook 上拉一份。",
      line: "没能开始：Hetzner Server 上没有 mem 的代码",
    }
  : {
      ask: "Have Codex astra do 10559, carefully",
      ack: "On it: Codex will rework the general settings page carefully; I'll tell you when it's done.",
      title: "Improve the general settings page (mem #10559)",
      clone: "mem's code isn't on any of your computers yet, so I'm cloning it on MacBook first.",
      line: "Couldn't start: Hetzner Server has no copy of mem",
    };

const u = log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: w.ask } });
log.append({ stream: "channel", origin: "partner", kind: "ack", body: { jobId: "j1", text: w.ack, replyTo: u.seq } });
const taskId = "t_mem";
const place =
  stage >= 2
    ? { kind: "repo" as const, device: "local", repoPath: "~/ducter/projects/mem", clone: "nowledge-co/mem", worktree: "~/ducter/worktrees/mem/improve-general-setting-page", branch: "ducter/improve-general-setting-page" }
    : { kind: "repo" as const, device: "local", repoPath: "/root/dev/mem", worktree: "/root/ducter/worktrees/mem/improve-general-setting-page-10559", branch: "ducter/improve-general-setting-page-10559" };
log.append({ stream: `task:${taskId}`, origin: "partner", kind: "task_open", body: { taskId, title: w.title, project: "mem", place, harness: "codex", model: "gpt-6.2-astra", effort: "high", brief: w.ask, language: zh ? "zh-CN" : "en" } });
log.append({ stream: `task:${taskId}`, origin: "system", kind: "body_selected", body: { taskId, harness: "codex", model: "gpt-6.2-astra", effort: "high", why: { kind: "partner" } } });
log.append({ stream: "channel", origin: "partner", kind: "job_status", body: { jobId: "j1", text: w.title, state: "running", taskId } });
await tick();
if (stage >= 2) {
  // Said by Ducter's code under the ack, once (packages/core/src/repo-where.ts LINES.cloning).
  log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: w.clone } });
  core.tasks.setState(taskId, "working", "provisioning");
} else {
  log.append({ stream: `task:${taskId}`, origin: "task", kind: "task_event", body: { taskId, role: "system", from: "runner", text: "failed to start: not a git repository: /root/dev/mem" } });
  const cant: CantStart = { why: "no_repo", computer: "Hetzner Server", what: "mem", path: "/root/dev/mem", elsewhere: { device: "dev_mac", name: "MacBook" }, cloneHere: true };
  core.tasks.setState(taskId, "failed", "archived", w.line, cant);
}
console.log(`demo-first-task ready on :${process.env.DUCTER_PORT ?? "?"} (stage ${stage}, ${zh ? "zh" : "en"})`);
