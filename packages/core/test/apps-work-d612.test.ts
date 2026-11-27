// D624: D612's app-fill rules stay (an app given to a task or a Keep is filled with data, says
// stopped when its work ends, and a snapshot says it is one). Boards are no longer offered or
// written: an app the person already has (kind reviews) is left exactly as it was.
import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import { appState, type Bodies, type Runner, type TaskCard } from "@ducter/protocol";
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
  const call = (taskId: string, tool: string, args: unknown) => core.mcp.call({ role: "task", taskId } as never, tool, args) as Promise<string>;
  return { core, gh, told, open, call, dir: t.dir };
}
const round = (ref: string, changed = true) => ({ prs: [{ ref, title: ref, head: "a1b2c3d", ci: "passing", changed, notes: changed ? [{ kind: "problem", path: "src/x.rs", line: 2, text: "x" }] : [] }] });
const settle = () => new Promise((r) => setTimeout(r, 30));

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
  await settle();
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

test("a board the person already has is their app: a review round leaves it exactly as it was", async () => {
  const b = boot();
  await b.core.taskSources.add("github");
  await b.core.taskSources.look();
  b.open("trev", "Review nowledge-co requests", "Every 45 minutes, review the PRs that request my review.", { reviews: true });
  const made = b.core.apps.make(b.core.persona.id, { name: "审查看板", html: `<main class="k-app"></main>`, kind: "reviews", task: { id: "trev", title: "Review nowledge-co requests" } });
  expect(made.ok).toBe(true);
  const id = (made as { app: { id: string } }).app.id;
  const before = b.core.apps.get(id)!;
  const data = b.core.apps.data(id);
  const decisions = () => b.core.log.read({ stream: "channel", kinds: ["decision"], limit: 100 }).map((e) => e.body as Bodies["decision"]).filter((d) => (d as { board?: unknown }).board);
  await b.call("trev", "review_report", round("nowledge-co/mem#1"));
  await b.call("trev", "review_report", round("nowledge-co/mem#1", false));
  await b.call("trev", "review_report", round("nowledge-co/mem#1", false));
  await settle();
  const after = b.core.apps.get(id)!;
  expect(after.updated).toBe(before.updated);
  expect(after.version).toBe(before.version);
  expect(after.kind).toBe("reviews");
  expect(after.name).toBe("审查看板");
  expect(b.core.apps.data(id)).toEqual(data);
  // No offer, and nothing written into it or said about it.
  expect(decisions()).toHaveLength(0);
  expect(b.core.log.read({ stream: "channel", kinds: ["ai_msg"], limit: 100 }).map((e) => e.body as Bodies["ai_msg"]).filter((m) => m.app?.id === id)).toHaveLength(0);
});
