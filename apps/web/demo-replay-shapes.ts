// D471: a heavy home's On hand in the shapes and lengths real ones have, with invented words: English
// titles a source already cut ("…with the…"), Chinese titles longer than a row, a start that failed
// on a raw git error, two that couldn't start for a missing folder (one in a project that has no
// other task), a phone task stopped days ago whose report says the phone was taken back, a wait that
// looks every 45 minutes, a CI wait, two results with PRs, one from yesterday, and a worker Mac.
// demo-replay.ts replays these when no export is given; a person's own export never enters git.
import type { Row } from "./demo-replay.ts";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export function shapeRows(now: number): Row[] {
  const rows: Row[] = [];
  const at = (ago: number) => new Date(now - ago).toISOString();
  const put = (ago: number, stream: string, origin: string, kind: string, body: unknown) =>
    rows.push({ seq: 0, ts: at(ago), persona: "default", stream, origin, kind, body: JSON.stringify(body), supersedes: null });
  const MAC = "w0rk3rmac1";
  put(30 * DAY, "devices", "system", "device_update", { device: MAC, name: "Studio Mac", phase: "done", from: "0.1.10", to: "0.1.12" });
  const repo = (name: string, branch: string, device = MAC) => ({ kind: "repo", device, repoPath: `/Users/ada/dev/${name}`, branch: `ducter/${branch}`, baseBranch: "main" });
  const open = (ago: number, id: string, title: string, project: string, place: unknown, harness = "codex") =>
    put(ago, `task:${id}`, "partner", "task_open", { taskId: id, title, project, place, harness, brief: title });
  const state = (ago: number, id: string, attention: string, more: Record<string, unknown> = {}) =>
    put(ago, `task:${id}`, "system", "task_state", { taskId: id, attention, residency: attention === "working" ? "hot" : "parked", ...more });
  const report = (ago: number, id: string, st: string, summary: string, evidence: unknown[] = []) =>
    put(ago, `task:${id}`, "task", "report", { taskId: id, state: st, summary, evidence, questions: [] });
  const bound = (ago: number, id: string, ref: string, title: string) =>
    put(ago, `task:${id}`, "partner", "task_bound", { taskId: id, by: "partner", item: { source: "src_demo", kind: "github", ref, label: `#${ref.split("#")[1]}`, where: ref.split("#")[0], title, url: `https://github.com/${ref.replace("#", "/issues/")}` } });

  // Yesterday: a result with its PR.
  open(26 * HOUR, "s_cache", "Warm the tile cache before the morning import", "lumen-notes", repo("lumen-notes", "warm-tile-cache"));
  report(25 * HOUR, "s_cache", "done", "The cache warms at 05:40 now; the import read 0 cold tiles. Draft PR #4411.", [{ kind: "url", ref: "https://github.com/lumen/notes/pull/4411" }]);
  state(25 * HOUR, "s_cache", "done");

  // Nine days ago: a phone task its phone was taken back from; its report reads like a tool's log.
  open(9 * DAY + HOUR, "s_phone", "用借来的手机录一段 Lumen 官网的屏，配上字幕发到社交平台", "", { kind: "browser", device: "local" });
  report(9 * DAY, "s_phone", "blocked", "又试了一次，手机那边还是说这个任务的手机访问被停止了，没法接着操作。官网已打开；录屏、上传和发帖都还没做。");
  state(9 * DAY, "s_phone", "blocked");

  // Eleven hours ago: a source's title, already cut, in a project whose folder isn't on that Mac.
  open(11 * HOUR, "s_orbit", "Reconcile the orbit plugin's tail offsets with the…", "lumen-notes-orbit-plugin", repo("lumen-notes-orbit-plugin", "reconcile-orbit-tail-offsets-wi"));
  bound(11 * HOUR, "s_orbit", "lumen/lumen-notes-orbit-plugin#31", "Reconcile the orbit plugin's tail offsets with the scheduler's clock");
  state(11 * HOUR - MIN, "s_orbit", "failed", { reason: "Couldn't start: Studio Mac has no copy of lumen-notes-orbit-plugin", cant: { why: "no_repo", computer: "Studio Mac", what: "lumen-notes-orbit-plugin", path: "/Users/ada/dev/lumen-notes-orbit-plugin", cloneHere: true } });

  // Six hours ago: two starts that failed, one on a raw git error, one on a folder the home lacks.
  open(6 * HOUR, "s_lock", "整理 Lumen 设置页的长文案，让每一句都像人说的话", "lumen-notes", repo("lumen-notes", "整理设置页长文案"));
  state(6 * HOUR - MIN, "s_lock", "failed", { reason: "git worktree add failed: Preparing worktree (new branch 'ducter/整理设置页长文案')\nfatal: Unable to create '/Users/ada/dev/lumen-notes/.git/worktrees/x/index.lock': File exists.\n\nAnother git process seems to be running in this repository" });
  open(6 * HOUR - 2 * MIN, "s_folder", "在服务器上用另一个模型复审设置页文案并开 PR", "", { kind: "folder", device: "local", path: "/srv/dev/lumen" });
  state(6 * HOUR - 3 * MIN, "s_folder", "failed", { reason: "没能开始：Home Server 上没有 lumen 这个文件夹", cant: { why: "no_folder", computer: "Home Server", what: "lumen", device: "local", path: "/srv/dev/lumen", cloneHere: true, pickHere: true } });
  // D471 round 2: it was tried three times the same way; its page says it once, with the count.
  for (const [k, ago] of [[1, 6 * HOUR + 10 * MIN], [2, 6 * HOUR + 6 * MIN], [3, 6 * HOUR + 2 * MIN]] as const) {
    put(ago, "task:s_folder", "system", "task_event", { taskId: "s_folder", role: "system", text: "failed to start: Home Server has no folder /srv/dev/lumen", raw: { cant: { why: "no_folder", computer: "Home Server", what: "lumen" } } });
    if (k < 3) put(ago - MIN, "task:s_folder", "system", "mend", { taskId: "s_folder", cls: "start", rung: "retry", how: "reopen", attempt: k, tried: [], state: "going" });
  }
  // D473: a start Ducter is mending by itself (it stands at work, never as a failure).
  open(25 * MIN, "s_mend", "给 lumen 的导入脚本补上断点续传", "lumen-notes", repo("lumen-notes", "import-resume"));
  state(24 * MIN, "s_mend", "failed", { reason: "Couldn't start: Studio Mac has no copy of lumen-notes", cant: { why: "no_repo", computer: "Studio Mac", what: "lumen-notes", cloneHere: true } });
  put(23 * MIN, "task:s_mend", "system", "mend", { taskId: "s_mend", cls: "start", rung: "repair", how: "clone_here", name: "Studio Mac", attempt: 1, tried: [], state: "going" });

  // A wait on CI, bound to an issue whose title a source cut.
  open(10 * HOUR, "s_flaky", "tile_merge_response_tests fail intermittently under…", "lumen-notes", repo("lumen-notes", "tile-merge-response-tests-fail"));
  bound(10 * HOUR, "s_flaky", "lumen/notes#2207", "tile_merge_response_tests fail intermittently under load");
  report(9 * HOUR, "s_flaky", "progress", "The flaky tile merge test fix is up for review as PR #4420 (\"Fixes lumen/notes#2207\"). CI is still running.\n\nCause: the logger caches whether each line has a writer.");
  state(9 * HOUR, "s_flaky", "blocked");
  put(9 * HOUR, "task:s_flaky", "task", "task_loop", { taskId: "s_flaky", state: "on", reason: "PR #4420's checks finish on the new head", since: at(9 * HOUR), by: "rounds", rhythmBy: "task", look: { everyMs: 4 * MIN } });

  // A loop that reviews every 45 minutes.
  open(2 * DAY, "s_review", "持续看 lumen 的评审请求，并处理分给你的待办", "", { kind: "none" });
  put(2 * DAY, "task:s_review", "task", "task_loop", { taskId: "s_review", state: "on", reason: "复查评审请求、提及和分派", since: at(2 * DAY), by: "rounds", rhythmBy: "task", everyMs: 45 * MIN });
  report(20 * MIN, "s_review", "progress", "新增的评审 #4418 已完成；还有 6 个 PR 等评审，没有新分派。");
  state(20 * MIN, "s_review", "blocked");

  // This morning: two results, one already fixed upstream.
  open(5 * HOUR, "s_label", "A half-finished tag merge leaves no record of the…", "lumen-notes", repo("lumen-notes", "a-partially-failed-label-merge-r"));
  bound(5 * HOUR, "s_label", "lumen/notes#2190", "A half-finished tag merge leaves no record of the tags it saved");
  report(4 * HOUR, "s_label", "done", "This is already fixed on main: PR #4390 (\"record tag merges saved before failure\") merged yesterday, so I didn't open a duplicate.", [{ kind: "url", ref: "https://github.com/lumen/notes/pull/4390" }]);
  state(4 * HOUR, "s_label", "done");
  open(7 * HOUR, "s_plugin", "为 Studio Mac 上的 Pi 安装 Lumen 插件并确认能读到记忆", "", { kind: "none", device: MAC }, "pi");
  report(6 * HOUR + 30 * MIN, "s_plugin", "done", "装好了。插件从 0.1.2 升到 0.2.2，检查命令确认已启用。");
  state(6 * HOUR + 30 * MIN, "s_plugin", "done");

  rows.sort((a, b) => a.ts.localeCompare(b.ts));
  rows.forEach((r, i) => (r.seq = i + 1));
  return rows;
}
