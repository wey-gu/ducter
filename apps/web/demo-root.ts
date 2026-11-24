// D549: a home that runs as root (hel, "Hetzner Server"), as both clients read it. Claude Code is
// there and signed in but won't run as root: its row on the computer's card, and the task that
// tried it anyway, failed with Claude Code's own line (the card in the conversation, On hand and
// the opened task). Everything is a fake: no agent runs, nothing is installed, no sign-in is read.
//   DUCTER_PORT=7549 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh bun apps/web/demo-root.ts
//   then open /app (the conversation), /app#onhand, /app#task=kwhtu5a7, /app#settings=devices
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CantStart } from "@ducter/protocol";
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const dataDir = process.env.DUCTER_DATA_DIR || join(mkdtempSync(join(tmpdir(), "ducter-demo-root-")), "data");
const core = startCore({
  dataDir,
  ooSource: noOo,
  persona: { id: "default", name: "Ducter", identity: "" },
  hostname: "127.0.0.1",
  platform: "linux",
  push: false,
  deviceProbes: {
    cua: async () => ({ missing: "no" }),
    native: async () => undefined,
    harnesses: async () => [
      { harness: "claude-code", installed: true, loggedIn: true, version: "2.1.331", how: "ducter", trouble: { kind: "root" } },
      { harness: "codex", installed: true, loggedIn: true, version: "0.172.0", how: "installer" },
      { harness: "antigravity", installed: true, loggedIn: true, version: "1.5.16", how: "installer" },
    ],
    kind: async () => "server",
  },
  update: { fetch: async () => new Response(JSON.stringify({ tag_name: "v0.1.53", body: "" })), how: "self", version: "0.1.53", homeName: "Hetzner Server", autoEveryMs: 0, run: () => new Promise(() => {}) },
  agents: { fetch: (async () => new Response("", { status: 404 })) as never, sys: { fetch: (async () => new Response("", { status: 404 })) as never, run: () => new Promise(() => {}), freeBytes: () => undefined, sleep: (ms) => Bun.sleep(ms), now: () => Date.now() }, autoEveryMs: 0 },
  memPlugins: { inspectLocal: async () => ({}), everyMs: 0, connected: () => false },
});
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
core.settings.set({ language: zh ? "zh" : "en" });

const id = "kwhtu5a7";
const title = zh ? "更新 Claude Code 的 Mem 插件" : "Update the Mem plugin for Claude Code";
const said = "--dangerously-skip-permissions cannot be used with root/sudo privileges for security reasons";
const cant: CantStart = { why: "refuses_root", computer: "Hetzner Server", what: "Claude Code", device: "local", harness: "claude-code", detail: said };
core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: zh ? "把 Claude Code 的 Mem 插件更新一下" : "Update the Mem plugin for Claude Code" } });
core.log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: zh ? "好，我让 Claude Code 去更新。" : "Sure, I'll have Claude Code update it." } });
core.log.append({ stream: `task:${id}`, origin: "partner", kind: "task_open", body: { taskId: id, title, project: "", place: { kind: "none" }, harness: "claude-code", brief: "Update the Nowledge Mem plugin for Claude Code." } });
core.log.append({ stream: "channel", origin: "partner", kind: "job_status", body: { jobId: "j1", text: title, state: "running", taskId: id } });
core.log.append({ stream: `task:${id}`, origin: "task", kind: "task_event", body: { taskId: id, role: "system", from: "runner", text: `failed to start: Claude Code exited as it started: ${said}`, raw: { cant } } });
core.tasks.setState(id, "failed", "archived", zh ? "没能开始：Claude Code 不肯在 Hetzner Server 上以 root 身份运行" : "Couldn't start: Claude Code won't run as root on Hetzner Server", cant);
core.log.append({ stream: "channel", origin: "partner", kind: "job_status", body: { jobId: "j1", text: title, state: "failed", taskId: id } });
console.log(`[demo] D549 (${zh ? "zh" : "en"}) at http://127.0.0.1:${core.port}/app (data: ${dataDir})`);
