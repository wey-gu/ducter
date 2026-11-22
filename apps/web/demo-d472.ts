// D472: hel's two attempts of 2026-11-22 as a demo core both clients read: the Antigravity task
// "在 hel 用 Gemini 审改 Mem 长文案并开 PR" that went to the Macbook Pro M3 first (an error nobody
// knew a word for) and then to Hetzner Server, which has no /root/dev/mem. Each failed start is
// seeded as the runner writes it (its step with the cant, its state with the cant).
//   DUCTER_PORT=7472 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh bun apps/web/demo-d472.ts
//   then open /app#task=smx2jjb3 (no folder) or /app#task=vzvderrk (other)
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";
import type { CantStart, Place } from "@ducter/protocol";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const dataDir = process.env.DUCTER_DATA_DIR || join(mkdtempSync(join(tmpdir(), "ducter-demo-d472-")), "data");
const persona = { id: "default", name: "Ducter", identity: "" };
const core = startCore({ dataDir, persona, push: false, ooSource: noOo, hostname: process.env.DUCTER_HOST || "127.0.0.1" });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
core.settings.set({ language: zh ? "zh" : "en" });
const title = "在 hel 用 Gemini 审改 Mem 长文案并开 PR";
const brief = "Review Mem's long copy with Gemini (Antigravity) on hel and open a PR with the edits.";
function failed(id: string, place: Place, reason: string, cant: CantStart, line: string) {
  core.log.append({ stream: `task:${id}`, origin: "partner", kind: "task_open", body: { taskId: id, title, project: "mem", place, harness: "antigravity", brief } });
  core.log.append({ stream: `task:${id}`, origin: "task", kind: "task_event", body: { taskId: id, role: "system", from: "runner", text: `failed to start: ${reason}`, raw: { cant } } });
  core.tasks.setState(id, "failed", "archived", line, cant);
}
const other: CantStart = {
  why: "other",
  computer: "Macbook Pro M3",
  what: "Antigravity",
  device: "local",
  harness: "antigravity",
  detail: "git worktree add failed: fatal: invalid reference: ducter/mem-long-copy",
  more: "git worktree add failed: fatal: invalid reference: ducter/mem-long-copy\nPreparing worktree (checking out 'ducter/mem-long-copy')",
};
failed("vzvderrk", { kind: "repo", device: "local", repoPath: "/Users/weyl/dev/nowledge-mem", branch: "ducter/mem-long-copy", baseBranch: "main" }, other.more!, other, zh ? "没能开始：开始的时候出了问题" : "Couldn't start: something went wrong as it started");
const noFolder: CantStart = { why: "no_folder", computer: "Hetzner Server", what: "mem", path: "/root/dev/mem", device: "local", harness: "antigravity", cloneHere: true, pickHere: true };
failed("smx2jjb3", { kind: "folder", device: "local", path: "/root/dev/mem" }, "folder does not exist: /root/dev/mem", noFolder, zh ? "没能开始：Hetzner Server 上没有 mem 这个文件夹" : "Couldn't start: Hetzner Server has no folder mem");
console.log(`[demo] D472 (${zh ? "zh" : "en"}) at http://127.0.0.1:${core.port}/app#task=smx2jjb3 (data: ${dataDir})`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
