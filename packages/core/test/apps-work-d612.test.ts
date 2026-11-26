// D612: review boards are for review work only (the partner records needs.reviews once at
// task_open; a task that opens its own PR never is one), one board per purpose showing only its own
// tasks' rows, an app given to a Keep filled by its rounds, and an app whose task or Keep ended
// saying so. Fake gh, no model: never the real GitHub.
import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import { appState, type Bodies, type ReviewBoard, type Runner, type TaskCard } from "@ducter/protocol";
import { startCore } from "../src/core.ts";
import { fakeGh, type FakeIssue } from "./fake-gh-issues.ts";
import { seedOld } from "./fixtures/keeps-old.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});
const NOW = Date.parse("2026-11-26T05:37:00Z");
const issue = (repo: string, number: number, title: string): FakeIssue => ({ repo, number, title, pr: true, assigned: false, review: true, author: "mei-chen", updated: new Date(NOW - number * 1000).toISOString(), diff: "diff --git a/x b/x\n+x\n" });

function boot(seedHelpers = false) {
  const t = tempDir();
  stops.push(t.cleanup);
  if (seedHelpers) seedOld(t.dir);
  const gh = fakeGh([issue("nowledge-co/mem", 1, "One"), issue("nowledge-co/mem", 2, "Two")], { login: "lin-dev" });
  const dataDir = seedHelpers ? t.dir : join(t.dir, "data");
  const core = startCore({ dataDir, port: 0, push: false, batchMs: 5, taskSources: { ghRun: gh.run, ghEnv: {}, home: join(t.dir, "home"), pollMs: 3_600_000, boundMs: 0, quietMs: 0, today: () => "2026-11-26", now: () => NOW } });
  stops.push(() => core.stop());
  core.settings.set({ language: "en" });
  core.setPartner({ onTrigger: () => {} });
  const told: { taskId: string; text: string }[] = [];
  core.setRunner({
    harness: { start: async () => Promise.reject(new Error("no model in this test")), available: async () => [] },
    async openTask(): Promise<TaskCard> {
      throw new Error("no");
    },
    send: async (taskId: string, text: string) => (told.push({ taskId, text }), { delivered: "prompted" as const }),
    interrupt: async () => {},
    drop: async () => {},
  } as unknown as Runner);
  const open = (taskId: string, title: string, brief: string, needs?: { reviews?: boolean }) => {
    core.log.append({ stream: `task:${taskId}`, origin: "system", kind: "task_open", body: { taskId, title, project: "", place: { kind: "none" }, harness: "codex", brief, ...(needs ? { needs } : {}) } });
    core.tasks.setState(taskId, "working", "hot");
  };
  // D615: a board offer needs work that comes back in rounds; a loop's own fact says so.
  const loop = (taskId: string) => core.log.append({ stream: `task:${taskId}`, origin: "system", kind: "task_loop", body: { taskId, state: "on", reason: "every round", since: new Date(NOW).toISOString() } });
  const call = (taskId: string, tool: string, args: unknown) => core.mcp.call({ role: "task", taskId } as never, tool, args) as Promise<string>;
  return { core, gh, told, open, loop, call, dir: t.dir };
}
const round = (ref: string, changed = true) => ({ prs: [{ ref, title: ref, head: "a1b2c3d", ci: "passing", changed, notes: changed ? [{ kind: "problem", path: "src/x.rs", line: 2, text: "x" }] : [] }] });

test("a dev task never gets review_report or a board offer; a review task does, and one that opens its own PR is never one", async () => {
  const b = boot();
  await b.core.taskSources.add("github");
  await b.core.taskSources.look();
  // The author's dev fix: its brief speaks of review and of handing the PR to the Babysitter, but it
  // is not a review task. No model: the recorded judgment is absent, so code keeps it out.
  b.open("tfix", "Fix the Plus card date", "Fix PR #11441, get it reviewed by the Babysitter and hand it over after review.");
  expect(b.core.mcp.listed({ role: "task", taskId: "tfix" } as never)).not.toContain("review_report");
  expect(b.core.boards!.offer("tfix", "reviews")).toBeUndefined();
  // Marked as a review task by the partner, yet it opens a PR of its own: code guards it out.
  b.open("tdev", "Fix the flaky test", "Fix it and open a PR.", { reviews: true });
  b.core.log.append({ stream: "task:tdev", origin: "task", kind: "task_event", body: { taskId: "tdev", role: "tool", tool: { name: "Bash", input: { command: "gh pr create --title x --body y" } } } as never });
  expect(b.core.mcp.listed({ role: "task", taskId: "tdev" } as never)).not.toContain("review_report");
  expect(b.core.boards!.offer("tdev", "reviews")).toBeUndefined();
  // A real review Keep: the tool, and after three rounds the one offer.
  b.open("trev", "Review nowledge-co requests", "Every 45 minutes, review the PRs that request my review.", { reviews: true });
  b.loop("trev");
  expect(b.core.mcp.listed({ role: "task", taskId: "trev" } as never)).toContain("review_report");
  await b.call("trev", "review_report", round("nowledge-co/mem#1"));
  await b.call("trev", "review_report", round("nowledge-co/mem#1", false));
  await b.call("trev", "review_report", round("nowledge-co/mem#1", false));
  expect(b.core.log.read({ stream: "channel", kinds: ["decision"], limit: 100 }).map((e) => e.body as Bodies["decision"]).filter((d) => d.board).length).toBe(1);
});

test("a board shows only its own task's rows; a second review task joins the one board, never a second board", async () => {
  const b = boot();
  await b.core.taskSources.add("github");
  await b.core.taskSources.look();
  b.open("ta", "Review A", "Review the PRs waiting on me in A.", { reviews: true });
  b.open("tb", "Review B", "Review the PRs waiting on me in B.", { reviews: true });
  b.loop("ta");
  b.loop("tb");
  await b.call("ta", "review_report", round("nowledge-co/mem#1"));
  const made = b.core.boards!.makeReviewBoard("ta");
  expect(made.ok).toBe(true);
  const id = (made as { app: { id: string } }).app.id;
  // The exact kind + task is the same app, never a second.
  const same = b.core.apps.make(b.core.persona.id, { name: "审查看板", html: "<main class=\"k-app\"></main>", kind: "reviews", task: { id: "ta", title: "Review A" } });
  expect((same as { app: { id: string } }).app.id).toBe(id);
  let board = b.core.apps.data(id).board as ReviewBoard;
  expect(board.prs.map((p) => p.ref)).toEqual(["nowledge-co/mem#1"]);
  // B's own round never leaks into A's board while B has no board.
  await b.call("tb", "review_report", round("nowledge-co/mem#2"));
  board = b.core.apps.data(id).board as ReviewBoard;
  expect(board.prs.map((p) => p.ref)).toEqual(["nowledge-co/mem#1"]);
  // Asking for B's board adds B's work to the one that exists: still one app, now both tasks' rows.
  const again = b.core.boards!.makeReviewBoard("tb");
  expect(again.ok).toBe(true);
  expect((again as { app: { id: string } }).app.id).toBe(id);
  const apps = b.core.apps.list(b.core.persona.id);
  expect(apps.filter((a) => a.kind === "reviews")).toHaveLength(1);
  expect(apps[0]!.tasks?.map((t) => t.id)).toEqual(["tb"]);
  board = b.core.apps.data(id).board as ReviewBoard;
  expect(board.prs.map((p) => p.ref).sort()).toEqual(["nowledge-co/mem#1", "nowledge-co/mem#2"]);
});

test("an app given to the Babysitter Keep is filled by the task on its round, and says stopped when the Keep ends", async () => {
  const b = boot(true);
  const keep = b.core.keeps!.all().find((k) => k.from.kind === "helper" && k.from.helperId === "nowledge-mem-pr-babysitter")!;
  // The task the Babysitter handed the work to (its claim names the helper).
  b.core.log.append({ stream: "channel", origin: "task", kind: "bridge_msg", body: { direction: "out", messageId: "m1", helper: "nowledge-mem-pr-babysitter", taskId: "tsit", text: "PR #1, fix CI", state: "sent" } } as never);
  b.open("tsit", "Fix PR #1", "Fix the CI on PR #1.");
  expect(b.core.keeps!.ofTask("tsit")?.id).toBe(keep.keepId);
  const html = `<main class="k-app"><script>var rows=ducter.get("rows")||[]</script></main>`;
  const app = b.core.apps.make(b.core.persona.id, { name: "PR babysitter board", html, keep: { id: keep.keepId, title: keep.title }, kind: undefined });
  expect(app.ok).toBe(true);
  const id = (app as { app: { id: string } }).app.id;
  expect(b.core.mcp.listed({ role: "task", taskId: "tsit" } as never)).toContain("app_data");
  await Bun.sleep(10);
  expect(b.told.find((t) => t.taskId === "tsit")?.text).toMatch(new RegExp(`app ${id}.*app_data`, "s"));
  expect(await b.call("tsit", "app_data", { app: id, set: { rows: [{ ref: "#1", next: "fix CI" }] } })).toMatch(/^Kept/);
  expect(b.core.apps.data(id).rows).toEqual([{ ref: "#1", next: "fix CI" }]);
  // The Keep ends: the app says so, never promising another round.
  b.core.keeps!.act(keep.keepId, { action: "stop" });
  const live = b.core.apps.list(b.core.persona.id).find((a) => a.id === id)!;
  expect(live.live?.kept).toMatchObject({ keep: keep.keepId, state: "ended" });
  expect(appState(live)).toBe("kept_ended");
});

test("an app whose task ended shows stopped-updating; a snapshot says it is one", async () => {
  const b = boot();
  b.open("tdone", "Done task", "Do the thing.");
  const app = b.core.apps.make(b.core.persona.id, { name: "Work board", html: `<main class="k-app"></main>`, task: { id: "tdone", title: "Done task" } });
  const id = (app as { app: { id: string } }).app.id;
  b.core.tasks.setState("tdone", "done", "cold");
  const live = b.core.apps.list(b.core.persona.id).find((a) => a.id === id)!;
  expect(live.live?.kept).toMatchObject({ task: "tdone", state: "ended" });
  expect(appState(live)).toBe("kept_ended");
  // A snapshot follows nothing: it says 截至 its own read time.
  const snap = b.core.apps.make(b.core.persona.id, { name: "PR snapshot", html: `<main class="k-app"></main>`, snapshot: true });
  const sid = (snap as { app: { id: string } }).app.id;
  const s = b.core.apps.list(b.core.persona.id).find((a) => a.id === sid)!;
  expect(s.live?.snapshot).toEqual({ at: s.updated });
  expect(appState(s)).toBe("plain");
});
