// D496: the opened task the author met on 2026-11-23, after the fix, as a demo core both clients
// read: a Claude Code task that fixed nowledge-co/mem#8826, opened PR #10847, edited its description
// and labels, pushed twice; Ducter's first look at the PR found a reviewer's request for changes from
// the day before and told the task; the task covered the path, pushed, and now waits for the checks
// on the new head (its condition in English, the task's language, on a Chinese screen). The commands
// are hel's own shapes (synthetic words). Opened at /app#task=t496.
//   DUCTER_PORT=7496 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh bun apps/web/demo-d496.ts
// Then the Mac with DUCTER_SHELL_URL (d496_shots_test.go).
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";
import type { Bodies, Place } from "@ducter/protocol";
import { slugify } from "../../packages/runner/src/places.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const w = (z: string, e: string) => (zh ? z : e);
const dataDir = process.env.DUCTER_DATA_DIR || join(mkdtempSync(join(tmpdir(), "ducter-demo-d496-")), "data");
const persona = { id: "default", name: "Ducter", identity: "" };

let shift = 0;
const clock = { now: () => Date.now() + shift, setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms), clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>) };
const seed = startCore({ dataDir, port: 0, push: false, persona, ooSource: noOo, clock });
seed.setRunner(stubRunner(seed));
seed.setPartner({ onTrigger() {} });
seed.settings.set({ language: zh ? "zh" : "en" });
const log = seed.log;
const MIN = 60_000;
const HOUR = 60 * MIN;
const at = async (ms: number) => {
  await Bun.sleep(40);
  shift = ms;
};
const ID = "t496";
const ev = (b: Omit<Bodies["task_event"], "taskId">) => log.append({ stream: `task:${ID}`, origin: "task", kind: "task_event", body: { taskId: ID, ...b } });
const bash = (command: string, output = "") => ev({ role: "tool", tool: { name: "Bash", input: { command }, output, ok: true } });
const say = (text: string) => ev({ role: "assistant", text });
const ducter = (text: string) => log.append({ stream: `task:${ID}`, origin: "partner", kind: "task_event", body: { taskId: ID, role: "user", from: "partner", text } });

const title = "graph_error_response_tests intermittently misses the typed cause in captured logs";
const slug = slugify(title); // D496: graph-error-response-tests, never "…-intermittentl"
const place = { kind: "repo", device: "local", repoPath: "/Users/weyl/dev/nowledge-mem", worktree: `/Users/weyl/ducter/worktrees/nowledge-mem/${slug}`, branch: `ducter/${slug}`, baseBranch: "main", hasRemote: true } as Place;

log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: w("把 nowledge-co/mem#8826 那个偶发失败的测试修了，修好开 PR。", "Fix the flaky test in nowledge-co/mem#8826 and open a PR.") } });
await at(-(39 * HOUR));
log.append({ stream: `task:${ID}`, origin: "partner", kind: "task_open", body: { taskId: ID, title: "graph_error_response_tests intermittently…", project: "nowledge-mem", place, harness: "claude-code", model: "opus", brief: title, language: "en" } as Bodies["task_open"] });
seed.tasks.setState(ID, "working", "hot");
bash("rg -n 'set_global_default|callsite' nmem-rs/crates/nmem-server/src/graph_error_response.rs", "235:        assert!(logged.contains(cause.id));");
say("Tracing caches each callsite's interest once per process; a sibling test can cache \"no listener\" while this one registers its capture. Setting the capture up once, before any test logs.");
bash("git commit -qam 'test(server): capture graph error logs deterministically'");
bash("git push -u origin ducter/" + slug, "branch 'ducter/" + slug + "' set up to track 'origin/ducter/" + slug + "'.");
bash("cat > /tmp/ger_pr.md <<'EOF'\n### Issue\n\nIssue Number: close #8826\nEOF\ngh pr create --repo nowledge-co/mem --title 'test(server): capture graph error logs deterministically' --body-file /tmp/ger_pr.md", "https://github.com/nowledge-co/mem/pull/10847");
bash("sed -i '' 's/^Issue Number: close #8826$/&\\n\\nFixes nowledge-co\\/mem#8826/' /tmp/ger_pr.md; grep -n Fixes /tmp/ger_pr.md; gh pr edit 10847 --repo nowledge-co/mem --body-file /tmp/ger_pr.md >/dev/null");
bash("gh pr edit 10847 --repo nowledge-co/mem --add-label component/server,component/testing,type/test,severity/minor >/dev/null; gh pr view 10847 --repo nowledge-co/mem --json labels");
await at(-(38 * HOUR));
bash("git add nmem-rs/crates/nmem-server/bazel/hawdb_runtime_blockers.json && git commit -q -m 'test(server): refresh HawDB blocker pin' && git push -q 2>&1 | tail -2");
log.append({ stream: `task:${ID}`, origin: "task", kind: "checkpoint", body: { taskId: ID, text: "PR 10847 open; CI on 4b52ac6.", gitRef: "4b52ac6552163d67c90997c3123d8f1d750ec6b6", owns: ["nowledge-co/mem#10847"] } });

// Ducter's first look at the PR it owns: a request for changes from the day before (D496).
await at(-(25 * MIN));
ducter(
  [
    "News on your PR nowledge-co/mem#10847 (Ducter watches it for you):",
    "- hawkingrei requested changes at 2026-11-22T03:17:00Z (on 4b52ac6552): rest_sources/source_graph_scan_tests.rs in the full Cargo test binary still reaches the shared graph error response without the new initialization. Initialize from the common response entrypoint or isolate the capture test. Please cover this path before closing #8826.",
    "",
    "Where it stands (looked at 2026-11-23 12:58 UTC):",
    "- hawkingrei's request for changes above still stands",
    "- checks on 4b52ac6552: 9 of 10 passed; still pending: tide",
    "While a request for changes stands, GitHub doesn't count the PR as approved, so a wait for its merge can't come true. Answering these requests is part of this PR, within your brief: you judge how; then report_to_main as usual.",
  ].join("\n"),
);
await at(-(24 * MIN));
say("hawkingrei is right: source_graph_scan_tests.rs reaches graph_error_response through the shared entrypoint. Moving the initialization into the common response entrypoint so every caller gets it.");
bash("rg -n 'graph_error_response' nmem-rs/crates/nmem-server/src/rest_sources", "source_graph_scan_tests.rs:41:    let resp = graph_error_response(err);");
ev({ role: "tool", tool: { name: "Edit", input: { file_path: "/Users/weyl/dev/nowledge-mem/nmem-rs/crates/nmem-server/src/graph_error_response.rs", old_string: "pub fn graph_error_response(", new_string: "pub fn graph_error_response(\n    ensure_capture();" }, output: "ok", ok: true } });
bash("cargo test -p nmem-server --test-threads 8 2>&1 | tail -3", "test result: ok. 214 passed; 0 failed");
bash("git commit -qam 'test(server): initialize the capture from the common response entrypoint' && git push -q");
bash("gh pr comment 10847 --repo nowledge-co/mem --body 'Covered: the capture is initialized from graph_error_response itself, so source_graph_scan_tests.rs and every other caller get it. 214 tests pass locally.'");
log.append({ stream: `task:${ID}`, origin: "task", kind: "report", body: { taskId: ID, state: "progress", summary: w("评审要求的那条路径已经覆盖：初始化挪到了公共入口，所有调用方都走得到；本地 214 个测试都过了，已推送并在 PR 上回复。等新提交的检查跑完。", "The path the reviewer asked about is covered: the initialization moved into the common entrypoint, so every caller gets it; 214 tests pass locally. Pushed and answered on the PR. Waiting for the checks on the new commit."), questions: [], evidence: [{ kind: "url", label: "PR", ref: "https://github.com/nowledge-co/mem/pull/10847" }] } });
await at(-(20 * MIN));
seed.work.waiters.arm({ reason: "PR #10847's checks pass on the new head", taskId: ID, check: { argv: ["gh", "pr", "checks", "10847", "--repo", "nowledge-co/mem", "--json", "state"], succeedWhen: { path: "[].state", oneOf: ["SUCCESS", "SKIPPED", "NEUTRAL"] } }, everyMs: 5 * MIN, until: new Date(Date.now() + 23 * HOUR).toISOString() });
seed.tasks.setState(ID, "blocked", "parked", "PR #10847's checks pass on the new head");
await at(0);
await Bun.sleep(300);
await seed.stop();

const core = startCore({ dataDir, persona, push: false, ooSource: noOo, hostname: process.env.DUCTER_HOST || "127.0.0.1", work: { exec: async () => ({ exitCode: 0, stdout: '[{"state":"SUCCESS"},{"state":"PENDING"}]', stderr: "" }) } });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
console.log(`[demo] D496 (${zh ? "zh" : "en"}) at http://127.0.0.1:${core.port}/app#task=${ID} (data: ${dataDir})`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
