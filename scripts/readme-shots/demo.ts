// The README's screenshots: the real core (Log, decisions, living message, devices, web) with a
// silent partner and a stub runner, seeded in English with work like the author's. One finished result
// whose diff is real (a small git fixture), one decision with a default, and tasks in every lane.
//   DUCTER_PORT=7797 DUCTER_DATA_DIR=<scratch> bun scripts/readme-shots/demo.ts
// Then:
//   - the desktop app, light theme, English, its own scratch data folder:
//     DUCTER_DATA_DIR=<scratch2> DUCTER_URL=ws://127.0.0.1:7797/ws DUCTER_LOCALE=en go run ./apps/desktop
//     sized 1280x960 (conversation) or 1280x820 (the rest) and captured at 2x without bringing it
//     forward (cua-driver set_window_frame, then get_window_state --screenshot-out-file);
//   - the phone: the iOS Simulator with the pairing command printed below, then
//     -open 'app#d=<decision id>' for the decision sheet, captured with xcrun simctl io screenshot;
//   - python3 scripts/readme-shots/compose.py <captures> docs/images
// Set DEMO_WORKTREE_AS="~/.ducter/worktrees/t_flaky" (with the fixture created at that path under
// the desktop app's working folder) so the opened task shows a real-looking path.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { startCore, stubRunner } from "../../packages/core/src/index.ts";
import type { Bodies, Place } from "../../packages/protocol/src/index.ts";

const core = startCore({
  persona: { id: "default", name: "Ducter", identity: "" },
  hostname: process.env.DUCTER_HOST || "127.0.0.1",
  deviceProbes: {
    kind: async () => "laptop",
    harnesses: async () => [
      { harness: "claude-code", installed: true, loggedIn: true },
      { harness: "codex", installed: true, loggedIn: true },
    ],
  },
});
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} }); // silent: the seeded conversation is the whole story
const log = core.log;
const tick = () => Bun.sleep(30);

// The finished task's worktree: a tiny HawDB-shaped repo whose branch holds the fix.
// DEMO_WORKTREE_AS is the path recorded in the task's place, as the desktop app reads it
// (relative to its own working folder when it isn't absolute).
const worktree = process.env.DEMO_WORKTREE || join(core.dataDir, "worktrees", "t_flaky");
const worktreeAs = process.env.DEMO_WORKTREE_AS || worktree;
const sh = (...cmd: string[]) => {
  const r = Bun.spawnSync(cmd, { cwd: worktree, env: { ...process.env, GIT_AUTHOR_NAME: "Ducter", GIT_AUTHOR_EMAIL: "ducter@example.com", GIT_COMMITTER_NAME: "Ducter", GIT_COMMITTER_EMAIL: "ducter@example.com" } });
  if (r.exitCode !== 0) throw new Error(`${cmd.join(" ")}: ${r.stderr}`);
};
const put = (path: string, text: string) => {
  mkdirSync(join(worktree, path, ".."), { recursive: true });
  writeFileSync(join(worktree, path), text);
};
mkdirSync(worktree, { recursive: true });
sh("git", "init", "-q", "-b", "main");
put(
  "crates/storage/tests/compaction.rs",
  `use hawdb_storage::{Db, Options};
use std::time::Duration;

#[test]
fn compaction_keeps_latest_versions() {
    let db = Db::open_temp(Options::default()).unwrap();
    for i in 0..1_000 {
        db.put(format!("k{i:04}"), format!("v{i}")).unwrap();
    }
    db.flush_async();
    // Give the flush time to land.
    std::thread::sleep(Duration::from_millis(200));
    db.compact_range(..).unwrap();
    assert_eq!(db.get("k0999").unwrap().as_deref(), Some("v999"));
}
`,
);
put(
  "crates/storage/src/flush.rs",
  `use crate::{Db, Seq};

impl Db {
    /// Starts a flush of the memtable and returns at once.
    pub fn flush_async(&self) -> Seq {
        self.flusher.request()
    }
}
`,
);
sh("git", "add", "-A");
sh("git", "commit", "-q", "-m", "compaction test");
sh("git", "checkout", "-q", "-b", "ducter/compaction-fix");
put(
  "crates/storage/tests/compaction.rs",
  `use hawdb_storage::{Db, Options};
use std::time::Duration;

#[test]
fn compaction_keeps_latest_versions() {
    let db = Db::open_temp(Options::default()).unwrap();
    for i in 0..1_000 {
        db.put(format!("k{i:04}"), format!("v{i}")).unwrap();
    }
    let seq = db.flush_async();
    // Wait for the flush itself, however busy the machine is.
    db.wait_for_flush(seq, Duration::from_secs(5)).unwrap();
    db.compact_range(..).unwrap();
    assert_eq!(db.get("k0999").unwrap().as_deref(), Some("v999"));
}
`,
);
put(
  "crates/storage/src/flush.rs",
  `use crate::{Db, Error, Seq};
use std::time::Duration;

impl Db {
    /// Starts a flush of the memtable and returns at once.
    pub fn flush_async(&self) -> Seq {
        self.flusher.request()
    }

    /// Waits until the flush for \`seq\` is on disk.
    pub fn wait_for_flush(&self, seq: Seq, t: Duration) -> Result<(), Error> {
        self.flusher.wait_durable(seq, t)
    }
}
`,
);
sh("git", "commit", "-q", "-am", "Test waits for the flush signal");

const repo = (repoPath: string, branch: string, wt?: string): Place => ({ kind: "repo", device: "MacBook", repoPath, branch, baseBranch: "main", ...(wt ? { worktree: wt } : {}) });

async function task(id: string, title: string, project: string, place: Place, brief: string, model = "opus", harness = "claude-code") {
  log.append({ stream: `task:${id}`, origin: "partner", kind: "task_open", body: { taskId: id, title, project, place, harness, model, brief } });
  core.tasks.setState(id, "working", "hot");
  await tick();
}
const ev = (id: string, b: Omit<Bodies["task_event"], "taskId">) => log.append({ stream: `task:${id}`, origin: "task", kind: "task_event", body: { taskId: id, ...b } });
const report = (id: string, r: Omit<Bodies["report"], "taskId">) => log.append({ stream: `task:${id}`, origin: "task", kind: "report", body: { taskId: id, ...r } });

// 1. A result that came back: the flaky compaction test.
const ask = "Fix the flaky compaction test in HawDB and tell me when it's done";
const u = log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: ask } });
log.append({ stream: "channel", origin: "partner", kind: "ack", body: { jobId: "j1", text: "On it. I'm giving it its own task in hawdb on the MacBook.", replyTo: u.seq } });
await task("t_flaky", "Fix the flaky compaction test", "HawDB", repo("~/dev/hawdb", "ducter/compaction-fix", worktreeAs), ask);
log.append({ stream: "channel", origin: "partner", kind: "job_status", body: { jobId: "j1", text: "Working", state: "running", taskId: "t_flaky" } });
ev("t_flaky", { role: "assistant", text: "Running it 50 times first to see how often it fails." });
ev("t_flaky", { role: "tool", tool: { name: "Bash", input: { command: "for i in $(seq 50); do cargo test -p hawdb-storage compaction -q; done" }, ok: false, output: "test result: FAILED. 47 passed; 3 failed" } });
ev("t_flaky", { role: "assistant", text: "All 3 failures compact before the flush has landed. The test sleeps a fixed 200 ms, which isn't enough on a busy machine." });
ev("t_flaky", { role: "tool", tool: { name: "Edit", input: { file_path: "crates/storage/src/flush.rs" }, ok: true } });
ev("t_flaky", { role: "tool", tool: { name: "Edit", input: { file_path: "crates/storage/tests/compaction.rs" }, ok: true } });
log.append({ stream: `task:t_flaky`, origin: "task", kind: "checkpoint", body: { taskId: "t_flaky", text: "Test waits for the flush signal", gitRef: "ducter/compaction-fix" } });
ev("t_flaky", { role: "tool", tool: { name: "Bash", input: { command: "for i in $(seq 50); do cargo test -p hawdb-storage compaction -q; done" }, ok: true, output: "50 runs: 50 passed, 0 failed" } });
ev("t_flaky", { role: "tool", tool: { name: "Bash", input: { command: "cargo test --workspace" }, ok: true, output: "test result: ok. 412 passed; 0 failed" } });
ev("t_flaky", { role: "assistant", text: "Fixed: the test waits for its flush to be durable. 50 runs in a row pass, and the whole workspace is green." });
report("t_flaky", {
  state: "done",
  summary: "The test now waits for its flush to be durable instead of sleeping 200 ms. 50 runs in a row pass.",
  questions: [],
  evidence: [
    { kind: "test", label: "cargo test · 50/50 pass", ref: "cargo test -p hawdb-storage compaction" },
    { kind: "test", label: "Workspace · 412 pass", ref: "cargo test --workspace" },
    { kind: "diff", label: "Diff · 2 files", ref: "ducter/compaction-fix" },
  ],
});
await tick();
log.append({ stream: "channel", origin: "partner", kind: "job_status", body: { jobId: "j1", text: "Done", state: "done", taskId: "t_flaky" } });
log.append({
  stream: "channel",
  origin: "partner",
  kind: "ai_msg",
  body: {
    replyTo: u.seq,
    text: "Fixed. The test slept a fixed 200 ms and hoped the flush had landed; now it waits for the flush itself. 50 runs in a row pass.\n\nThe change is on `ducter/compaction-fix`. Nothing is pushed.",
  },
});
await tick();
// The user saw that result (so what follows is "while you were away").
log.append({ stream: "channel", origin: "user", kind: "read_receipt", body: { upToSeq: log.head() } });
await tick();

// 2. One decision with a reversible default; tasks working and waiting.
await task("t_rebase", "Bring fix-ci up to date with main", "Ducter", repo("~/dev/ducter", "ducter/fix-ci"), "rebase");
report("t_rebase", {
  state: "needs_input",
  summary: "12 commits behind main",
  questions: [
    {
      id: "q1",
      text: "fix-ci is 12 commits behind main with 2 conflicts, both in the CI config, which I can resolve. Rebase it?",
      blocking: true,
      default: "rebase",
      reversible: true,
    },
  ],
  evidence: [],
});
await tick();
await task("t_oar", "Upgrade OAR to 0.96", "Ducter", repo("~/dev/ducter", "ducter/oar-096"), "upgrade", "gpt-5", "codex");
ev("t_oar", { role: "assistant", text: "0.96 renamed the steer call; updating the 3 places in the runner, then the runner tests." });
report("t_oar", { state: "progress", summary: "Updating the 3 steer calls in the runner", questions: [], evidence: [] });
await tick();
await task("t_review", "Review this week's 3 open PRs", "Ducter", { kind: "folder", device: "MacBook", path: "~/dev/ducter" }, "review", "sonnet");
report("t_review", { state: "progress", summary: "Read 2; the third is waiting on CI", questions: [], evidence: [] });
await tick();
await task("t_notes", "Write the v0.4 release notes", "Ducter", repo("~/dev/ducter", "ducter/notes-04"), "notes", "sonnet");
log.append({ stream: "channel", origin: "partner", kind: "waiter", body: { waiterId: "w1", taskId: "t_notes", at: new Date(Date.now() + 40 * 60_000).toISOString(), reason: "CI to finish", state: "armed" } });
report("t_notes", { state: "blocked", summary: "Waiting for the v0.4 CI run", questions: [], evidence: [] });
await tick();

const pair = await core.devicesView.pairCode();
console.log(`[demo] up at http://127.0.0.1:${core.port}/app (data: ${core.dataDir})`);
console.log(`[demo] phone: xcrun simctl launch booted co.nowledge.ducter.ios -pairLink 'http://127.0.0.1:${core.port}/pair#c=${pair.code}'`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
