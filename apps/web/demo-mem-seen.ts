// D617: a demo core for the opened task's recalled line under the brief. Two memories,
// one a preference and one a search hit; nothing else runs (no nmem, no agent, no Mem).
//   DUCTER_PORT=7977 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh bun apps/web/demo-mem-seen.ts
// Open the printed #task=t_mem: 带进来 2 条记忆 under 你交给它的事; tap it to unfold the titles.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const w = (z: string, e: string) => (zh ? z : e);
const scratch = mkdtempSync(join(tmpdir(), "ducter-demo-mem-seen-"));
const dataDir = process.env.DUCTER_DATA_DIR || join(scratch, "data");
const core = startCore({ dataDir, port: Number(process.env.DUCTER_PORT ?? 0), push: false, persona: { id: "default", name: "Ducter", identity: "" }, ooSource: noOo });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
core.settings.set({ language: zh ? "zh" : "en" });
const log = core.log;
const id = "t_mem";
const now = new Date().toISOString();
log.append({
  stream: `task:${id}`,
  origin: "partner",
  kind: "task_open",
  body: {
    taskId: id,
    title: w("修 session 过期差一秒的偶发测试", "Fix the flaky session-expiry test"),
    project: "acme-api",
    place: { kind: "repo", device: "local", repoPath: "/Users/demo/dev/acme-api", branch: "ducter/session-flaky", baseBranch: "main" },
    harness: "claude-code",
    model: "sonnet",
    brief: w("这个偶发失败每周都红一次，帮我把根因找出来并修掉；修完跑 200 遍确认。", "This flake goes red once a week. Find the root cause and fix it; run it 200 times to confirm."),
    origin: "you",
  },
});
log.append({
  stream: `task:${id}`,
  origin: "task",
  kind: "task_event",
  body: {
    taskId: id,
    role: "system",
    from: "runner",
    text: "recalled 2 from memory for the brief",
    raw: {
      memory: "recall",
      recalled: [
        { id: "mem_a1", title: w("测试统一用假时钟", "Every test uses the fake clock"), space: "personal-1", via: "preferences" },
        { id: "mem_b2", title: w("周报周五下午发给产品组", "The weekly report goes to the product group on Friday afternoon"), space: "team-7", via: "search" },
      ],
    },
  },
});
log.append({ stream: `task:${id}`, origin: "system", kind: "task_state", body: { taskId: id, attention: "working", residency: "warm" } });
const url = core.url.replace("ws://", "http://").replace("/ws", "/app");
console.log(`[demo-mem-seen] ${url}#task=${id} · ${zh ? "zh" : "en"} · ${now}`);
