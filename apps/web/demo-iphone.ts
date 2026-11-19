// A demo core for the phone's opened task and On hand at 390 wide (the author's iPhone report,
// 2026-11-19): a done Codex task on another computer, bound to a GitHub issue it commented on, whose
// report has a long first sentence, a code block with a long link and a file it made; one task
// waiting and a second done today, so On hand's strip and its GitHub lens have something to show.
// A fake gh (never the real GitHub), a scratch home, no agent runs.
//   DUCTER_PORT=7991 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh bun apps/web/demo-iphone.ts
// then open http://127.0.0.1:7991/app/#/task/t398 and #/onhand
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";
import { fakeGh } from "../../packages/core/test/fake-gh-issues.ts";
import type { MediaRef } from "@ducter/protocol";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const scratch = mkdtempSync(join(tmpdir(), "ducter-demo-iphone-"));
const gh = fakeGh(
  [
    { repo: "acme/mem", number: 398, title: "Search misses notes saved while offline", labels: ["bug"], updated: "2026-11-19T02:10:00Z" },
    { repo: "acme/mem", number: 402, title: "Export drops the note's tags", labels: ["bug"], updated: "2026-11-18T20:00:00Z" },
    { repo: "acme/mem", number: 405, title: "Sync stalls behind a captive portal", updated: "2026-11-18T18:00:00Z" },
  ],
  { login: "lin-dev" },
);
const core = startCore({
  ooSource: noOo,
  persona: { id: "default", name: "Ducter", identity: "" },
  hostname: process.env.DUCTER_HOST || "127.0.0.1",
  taskSources: { ghRun: gh.run, home: join(scratch, "home") },
});
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
const log = core.log;
const store = (core as unknown as { media: { put(b: Uint8Array, o?: object): MediaRef } }).media;

const ts = core.taskSources;
await ts.add("github");
await ts.look();
const items = (await ts.items()).items;
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

const open = (taskId: string, title: string, harness: string, device: string, brief: string) =>
  log.append({ stream: `task:${taskId}`, origin: "partner", kind: "task_open", body: { taskId, title, project: "mem", place: { kind: "repo", device, repoPath: "~/dev/mem", branch: `ducter/${taskId}` }, harness, brief, language: zh ? "zh" : "en" } } as never);

// The done Codex task, on the other computer, 47 minutes, with a comment on its issue.
const id = "t398";
open(id, zh ? "修复离线时保存的笔记搜不到" : "Fix search missing notes saved offline", "codex", "studio", "Fix acme/mem#398");
const i398 = items.find((i) => i.ref === "acme/mem#398")!;
ts.bind(id, i398, "partner");
const file = store.put(
  new TextEncoder().encode(["validation run 2026-11-19", "", "offline-save + reindex ........ ok (312 notes)", "search after reconnect ......... ok", "fts rebuild under load ......... ok (2.4 s)", "regression suite ............... 418 passed, 0 failed", ""].join("\n")),
  { files: true, name: "validation-results.txt", from: { taskId: id } },
);
log.append({ stream: `task:${id}`, origin: "task", kind: "task_event", body: { taskId: id, role: "assistant", text: zh ? "先复现：断网时保存一条笔记，再联网搜它，搜不到。" : "Reproducing first: save a note offline, reconnect, search for it: not found." } } as never);
const fence = "```";
log.append({
  stream: `task:${id}`,
  origin: "task",
  kind: "task_event",
  body: {
    taskId: id,
    role: "assistant",
    text: zh
      ? `离线保存的笔记现在联网后会重新进索引，搜得到了。\n\n改动：\n- 离线队列写回时同时排一次索引\n- 重连时补建漏掉的索引\n\n${fence}\nDraft PR https://github.com/acme/mem/pull/10412 (ducter/t398 → main, 3 files, +84 −12)\nValidation: 418 passed, 0 failed; offline-save + reindex ok on 312 notes\n${fence}`
      : `Notes saved offline are indexed again on reconnect and show up in search.\n\nChanges:\n- the offline queue schedules an index pass when it writes back\n- reconnect rebuilds any index it missed\n\n${fence}\nDraft PR https://github.com/acme/mem/pull/10412 (ducter/t398 → main, 3 files, +84 −12)\nValidation: 418 passed, 0 failed; offline-save + reindex ok on 312 notes\n${fence}`,
  },
} as never);
log.append({
  stream: `task:${id}`,
  origin: "task",
  kind: "report",
  body: {
    taskId: id,
    state: "done",
    summary: zh
      ? "离线时保存的笔记，联网后会重新进搜索索引，现在能搜到了，草稿 PR #10412 已开好。重连时会补建漏掉的索引；回归测试 418 个全过。"
      : "Notes saved while offline are now indexed again when you reconnect, so search finds them; draft PR #10412 is open. Reconnecting rebuilds any index it missed; all 418 regression tests pass.",
    questions: [],
    evidence: [{ kind: "url", ref: "https://github.com/acme/mem/pull/10412" }],
    media: [file],
  },
} as never);
log.append({ stream: "channel", origin: "system", kind: "source_write", body: { source: i398.source, item: i398, op: "comment", state: "done", by: "rule", taskId: id, text: "Fixed in draft PR https://github.com/acme/mem/pull/10412", link: "https://github.com/acme/mem/issues/398#issuecomment-1" } } as never);
void ago;

// A second done today, bound too (its card's subline on On hand).
open("t402", zh ? "导出时带上笔记的标签" : "Keep tags on export", "claude-code", "local", "Fix acme/mem#402");
const i402 = items.find((i) => i.ref === "acme/mem#402")!;
ts.bind("t402", i402, "partner");
log.append({ stream: "task:t402", origin: "task", kind: "report", body: { taskId: "t402", state: "done", summary: zh ? "导出的 Markdown 现在带上标签了；草稿 PR #10415。" : "Exported Markdown keeps its tags now; draft PR #10415.", questions: [], evidence: [{ kind: "url", ref: "https://github.com/acme/mem/pull/10415" }] } } as never);

// One waiting.
open("t405", zh ? "查同步卡在登录页的网络后面" : "Sync stalls behind a captive portal", "claude-code", "local", "Look into acme/mem#405");
const i405 = items.find((i) => i.ref === "acme/mem#405")!;
ts.bind("t405", i405, "partner");
core.tasks.setState("t405", "blocked", "warm", zh ? "等 CI 跑完" : "Waiting for CI");
// Done, once the reports have been taken in (a report with a link alone is a done the agent claims).
await Bun.sleep(200);
core.tasks.setState(id, "done", "cold");
core.tasks.setState("t402", "done", "cold");

// The iPhone app in the Simulator pairs with this core (never the person's own home).
const pair = await core.devicesView.pairCode();
console.log(`[demo] phone: xcrun simctl launch booted co.nowledge.ducter.ios -pairLink 'http://127.0.0.1:${core.port}/pair#c=${pair.code}'`);
console.log(`[demo] up at http://127.0.0.1:${core.port}/app (data: ${core.dataDir}; scratch: ${scratch})`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
