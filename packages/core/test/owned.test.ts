// D483: a PR a task owns wakes it with its news. hel, 2026-11-22: task b7gw6r2e opened PR #10932,
// a review comment came at 19:07, CI ended at 18:55, another task noted the PR's failure at 20:09,
// and nothing reached the task for 6 h. A fake gh with the shapes of GitHub's answers (synthetic
// data), a fake clock, a fake runner.
import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import type { Bodies, Runner, TaskCard } from "@ducter/protocol";
import type { Exec } from "@ducter/protocol/src/checks-run.ts";
import { prIdentity } from "@ducter/protocol/src/owned.ts";
import { FakeClock } from "../src/clock.ts";
import { openLog } from "../src/log.ts";
import { createMcpHub } from "../src/mcp.ts";
import { createRegistry } from "../src/registry.ts";
import { createWork } from "../src/work.ts";
import { openTask, tempDir, tick } from "./helpers.ts";

let cleanup = () => {};
afterEach(() => cleanup());
const flush = async () => {
  for (let i = 0; i < 20; i++) await tick();
};

/** A tiny GitHub: one PR, its comments, reviews and checks, answered as gh api --jq would. */
function fakeGitHub() {
  const gh = {
    head: "e2b8b625ff6a9de8a3fa5de2bbfb9b3bd72f294d",
    state: "open",
    merged: false,
    comments: [] as { id: number; by: string; at: string; text: string }[],
    notes: [] as { id: number; by: string; at: string; path: string; line: number; text: string }[],
    reviews: [] as { id: number; by: string; at: string; state: string; text: string }[],
    runs: [{ name: "ci/mem-bazel", status: "in_progress", conclusion: null as string | null }],
    calls: 0,
  };
  const exec: Exec = async (argv) => {
    gh.calls++;
    const path = argv[2] ?? "";
    const out = (v: unknown) => ({ exitCode: 0, stdout: JSON.stringify(v) });
    if (/^repos\/[^/]+\/[^/]+\/pulls\/\d+$/.test(path)) return out({ head: gh.head, state: gh.state, merged: gh.merged });
    if (/issues\/\d+\/comments/.test(path)) return out(gh.comments);
    if (/pulls\/\d+\/comments/.test(path)) return out(gh.notes);
    if (/pulls\/\d+\/reviews/.test(path)) return out(gh.reviews);
    if (/check-runs/.test(path)) return out(path.includes(gh.head) ? gh.runs : []);
    if (/\/status$/.test(path)) return out({ state: "pending", n: 0, failed: [] });
    return { exitCode: 1, stdout: "not found" };
  };
  return { gh, exec };
}

function setup(exec: Exec, dir?: string, clock = new FakeClock(Date.parse("2026-11-22T18:40:00Z"))) {
  const t = dir ? { dir, cleanup: () => {} } : tempDir();
  if (!dir) cleanup = t.cleanup;
  const log = openLog({ path: join(t.dir, "ducter.db"), persona: "default", clock });
  const tasks = createRegistry(log, clock);
  const sent: { taskId: string; text: string }[] = [];
  const runner = { async send(taskId: string, text: string) { sent.push({ taskId, text }); return { delivered: "prompted" as const }; }, async openTask() { return {} as TaskCard; }, async interrupt() {} } as unknown as Runner;
  const mcp = createMcpHub({ secret: "s" });
  const work = createWork({ log, tasks, mcp, runner: () => runner, clock, persona: "default", exec, ownedEveryMs: 60 * 60_000 });
  const prev = cleanup;
  cleanup = () => {
    work.stop();
    log.close();
    prev();
  };
  return { dir: t.dir, clock, log, tasks, work, sent, mcp };
}

const checkpoint = (log: ReturnType<typeof openLog>, taskId: string, body: Partial<Bodies["checkpoint"]>) =>
  log.append({ stream: `task:${taskId}`, origin: "task", kind: "checkpoint", body: { taskId, text: "opened the PR", ...body } });

test("hel's evening: CI's end and a review comment on the task's own PR wake it with the news; nothing twice", async () => {
  const { gh, exec } = fakeGitHub();
  const { clock, log, tasks, work, sent } = setup(exec);
  openTask(log, "b7", "在 hel 上审改 mem 长文案并开 PR");
  checkpoint(log, "b7", { gitRef: gh.head, owns: ["nowledge-co/mem#10932"] });
  tasks.setState("b7", "blocked", "warm"); // resting on its own wait
  expect(work.owned.of("b7")).toEqual(["nowledge-co/mem#10932"]);
  await work.owned.sweep();
  expect(sent).toEqual([]); // the first look learns where it stands
  // 18:55: CI ends with a failure; 19:07: a P2 review comment.
  clock.advance(30 * 60_000);
  gh.runs = [{ name: "ci/mem-bazel", status: "completed", conclusion: "success" }, { name: "ci/mem-playwright-e2e", status: "completed", conclusion: "failure" }];
  gh.comments.push({ id: 1, by: "hawkingrei", at: "2026-11-22T19:07:25Z", text: "P2: the German copy names a button that doesn't exist." });
  await work.owned.sweep();
  expect(sent.length).toBe(1);
  expect(sent[0]!.taskId).toBe("b7");
  expect(sent[0]!.text).toContain("nowledge-co/mem#10932");
  expect(sent[0]!.text).toContain("hawkingrei");
  expect(sent[0]!.text).toContain("ci/mem-playwright-e2e");
  expect(sent[0]!.text).not.toContain("head 变成了"); // its own commit
  await work.owned.sweep();
  expect(sent.length).toBe(1); // nothing new, nothing said
  expect(log.read({ stream: "task:b7", kinds: ["owned_news"] }).length).toBe(2);
});

test("news waits while the task is in a turn; a push not its own is said; a restart repeats nothing; merged ends the watch", async () => {
  const { gh, exec } = fakeGitHub();
  const a = setup(exec);
  openTask(a.log, "b7", "fix the PR");
  checkpoint(a.log, "b7", { gitRef: gh.head.slice(0, 10), owns: ["https://github.com/nowledge-co/mem/pull/10932"] });
  await a.work.owned.sweep();
  a.tasks.setState("b7", "working", "hot");
  gh.head = "206fa3ff6a5057d2ce69fd4022534505f1f211e2"; // someone else pushed
  gh.notes.push({ id: 7, by: "hawkingrei", at: "2026-11-22T19:10:00Z", path: "e2e/cloud-web-auth.spec.ts", line: 780, text: "this still asserts the old copy" });
  await a.work.owned.sweep();
  expect(a.sent).toEqual([]); // in a turn: it goes with the next look
  a.tasks.setState("b7", "working", "warm");
  await a.work.owned.sweep();
  expect(a.sent.length).toBe(1);
  expect(a.sent[0]!.text).toContain("206fa3ff6a");
  expect(a.sent[0]!.text).toContain("e2e/cloud-web-auth.spec.ts:780");
  // A restart picks up from what was told.
  a.work.stop();
  const b = setup(exec, a.dir, new FakeClock(a.clock.now()));
  await b.work.owned.sweep();
  expect(b.sent).toEqual([]);
  gh.merged = true;
  gh.state = "closed";
  await b.work.owned.sweep();
  expect(b.sent.at(-1)!.text).toContain("merged");
  expect(b.work.owned.of("b7")).toEqual([]);
  const calls = gh.calls;
  await b.work.owned.sweep();
  expect(gh.calls).toBe(calls); // no longer watched
});

test("another task's report naming the PR in its evidence reaches the task that owns it (by the PR's identity, never words)", async () => {
  expect(prIdentity("https://github.com/nowledge-co/mem/pull/10932/files")).toBe("nowledge-co/mem#10932");
  expect(prIdentity("Nowledge-Co/Mem/pull/10932")).toBe("nowledge-co/mem#10932");
  expect(prIdentity("PR 10932")).toBeUndefined();
  expect(prIdentity("https://github.com/nowledge-co/mem/issues/10931")).toBeUndefined();
  const { gh, exec } = fakeGitHub();
  const { log, tasks, work, sent } = setup(exec);
  openTask(log, "b7", "open the PR");
  openTask(log, "swj", "review nowledge-co");
  checkpoint(log, "b7", { owns: ["nowledge-co/mem#10932"] });
  await work.owned.sweep();
  log.append({ stream: "task:swj", origin: "task", kind: "report", body: { taskId: "swj", state: "progress", summary: "#10932's playwright e2e is failing on the zh-Hans dark tray.", questions: [], evidence: [{ kind: "link", label: "PR", ref: "https://github.com/nowledge-co/mem/pull/10932" }] } });
  // A report that only mentions it in words is not an identity: nothing is matched on text.
  log.append({ stream: "task:swj", origin: "task", kind: "report", body: { taskId: "swj", state: "progress", summary: "mem#10932 looks fine", questions: [], evidence: [] } });
  await flush();
  tasks.setState("b7", "blocked", "warm");
  await work.owned.sweep();
  expect(sent.length).toBe(1);
  expect(sent[0]!.text).toContain("review nowledge-co");
  expect(sent[0]!.text).toContain("zh-Hans dark tray");
  expect(sent[0]!.text).not.toContain("looks fine");
  void gh;
});

// D496: hel, 2026-11-23. Task xfnccfi7 declared PR nowledge-co/mem#10847 at 12:56Z; a reviewer had
// requested changes at 03:17Z the day before. The first look "only learned where it stands" (the
// review predated `since`), so the task told the person it only needed an approval and waited a
// day for a merge that couldn't come. Synthetic data with the same shapes.
test("a request for changes from before the PR was declared is told on the first look, once; a wait's wake and its answer carry where the PR stands", async () => {
  const { gh, exec } = fakeGitHub();
  gh.head = "4b52ac6552163d67c90997c3123d8f1d750ec6b6";
  gh.runs = [];
  gh.reviews.push({ id: 41, by: "hawkingrei", at: "2026-11-22T03:17:00Z", state: "CHANGES_REQUESTED", text: "rest_sources/source_graph_scan_tests.rs still reaches the shared graph error response without the new initialization. Please cover this path before closing #8826.", on: gh.head } as never);
  const statuses = { state: "pending", n: 10, failed: [] as string[], pending: ["tide"] };
  const exec2: Exec = async (argv, o) => ((argv[2] ?? "").endsWith("/status") ? { exitCode: 0, stdout: JSON.stringify(statuses) } : exec(argv, o));
  const { clock, log, tasks, work, sent, mcp } = setup(exec2, undefined, new FakeClock(Date.parse("2026-11-23T12:56:00Z")));
  openTask(log, "xf", "graph_error_response_tests intermittently misses the typed cause");
  checkpoint(log, "xf", { gitRef: gh.head, owns: ["nowledge-co/mem#10847"] });
  tasks.setState("xf", "blocked", "warm", "PR #10847 is merged");
  // The first look comes soon after the declaration, not a round later.
  clock.advance(31_000);
  await flush();
  expect(sent.length).toBe(1);
  const said = sent[0]!.text;
  expect(said).toContain("hawkingrei requested changes at 2026-11-22T03:17:00Z");
  expect(said).toContain("source_graph_scan_tests.rs");
  expect(said).toContain("9 of 10 passed; still pending: tide");
  expect(said).toContain("can't come true");
  // Told once: the next look has nothing new.
  await work.owned.sweep();
  expect(sent.length).toBe(1);
  // Where it stands goes with the task's own wake and its wait's answer, and to the partner as facts.
  expect(work.owned.standing("xf")).toContain("hawkingrei requested changes at 2026-11-22T03:17:00Z");
  expect(work.owned.all()[0]!.said?.["nowledge-co/mem#10847"]).toContain("changes requested by hawkingrei");
  const w = (await mcp.call({ role: "task", taskId: "xf" }, "wait_for", { reason: "PR #10847 is merged", check: { argv: ["gh", "pr", "view", "10847", "--json", "state"], succeedWhen: { path: "state", equals: "MERGED" } } })) as { ok: boolean; yourPRs?: string };
  expect(w.yourPRs ?? "").toContain("hawkingrei");
  // An approval later: the request no longer stands.
  gh.reviews.push({ id: 42, by: "hawkingrei", at: "2026-11-23T14:00:00Z", state: "APPROVED", text: "", on: gh.head } as never);
  await work.owned.sweep();
  expect(work.owned.standing("xf")).not.toContain("requested changes");
  expect(work.owned.standing("xf")).toContain("approved by hawkingrei");
});
