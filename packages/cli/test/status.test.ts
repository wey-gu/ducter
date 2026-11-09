import { afterAll, describe, expect, test } from "bun:test";
import type { LogEvent, OnHand, TaskCard } from "@ducter/protocol";
import { fetchSnapshot, formatSnapshot, openDecisions, pickTask, toMerge } from "../src/status.ts";
import { planDesktop } from "../src/desktop.ts";
import { commandsFor, translator } from "../src/i18n.ts";

const en = translator("en");
const zh = translator("zh");

const card = (over: Partial<TaskCard>): TaskCard => ({
  taskId: "t1",
  persona: "default",
  title: "Fix the flaky test in hawdb",
  project: "hawdb",
  place: { kind: "none" },
  harness: "claude-code",
  attention: "working",
  residency: "hot",
  updatedAt: "2026-11-09T01:00:00.000Z",
  ...over,
});

const ev = (seq: number, kind: LogEvent["kind"], body: any): LogEvent => ({ seq, ts: "2026-11-09T01:00:00.000Z", persona: "default", stream: "channel", origin: "system", kind, body });

describe("status", () => {
  test("open decisions drop the resolved ones", () => {
    const events = [
      ev(1, "decision", { decisionId: "d1", taskId: "t1", question: "Rebase on main?", goLabel: "Rebase", defaultOption: "go", reversible: true }),
      ev(2, "decision", { decisionId: "d2", taskId: "t2", question: "Delete the old branch?", goLabel: "Delete", defaultOption: "hold", reversible: false }),
      ev(3, "decision_resolved", { decisionId: "d1", option: "go", by: "user" }),
    ];
    expect(openDecisions(events).map((d) => d.decisionId)).toEqual(["d2"]);
  });

  test("lanes, decisions, and counts", () => {
    const onHand: OnHand = {
      tasks: [
        card({ taskId: "t1", attention: "needs_you", reason: "Tests pass locally; CI needs a rebase" }),
        card({ taskId: "t2", title: "Read the HawDB CI logs", attention: "working" }),
        card({ taskId: "t3", title: "Wait for PR #1592 review", attention: "blocked", reason: "Waiting for PR approval" }),
      ],
      counts: { needs_you: 1, working: 1, waiting: 1, done_today: 2 },
    };
    const text = formatSnapshot(
      { personaName: "Ducter", url: "ws://127.0.0.1:7783/ws", onHand, decisions: [{ decisionId: "d1", taskId: "t1", question: "Rebase on main?", goLabel: "Rebase", defaultOption: "go", reversible: true }] },
      en,
    );
    expect(text).toContain("Ducter · running at ws://127.0.0.1:7783/ws");
    expect(text).toContain("Needs you (1)\n  • Fix the flaky test in hawdb  hawdb\n    Tests pass locally; CI needs a rebase");
    expect(text).toContain("Working (1)");
    expect(text).toContain("Waiting (1)");
    expect(text).toContain("Needs you (1)\n  ? Rebase on main?\n    [Go: Rebase] [Hold]");
    expect(text).toContain("Done today: 2");
  });

  // Fresh-user QA: three finished, unmerged tasks; status said only "Done today: 3".
  test("finished work not merged yet has its own lane, with the merge command", () => {
    const repo = { kind: "repo" as const, device: "local", repoPath: "/r", worktree: "/w", branch: "ducter/x", baseBranch: "main" };
    const committed = { state: "done" as const, summary: "Fixed.", questions: [], evidence: [{ kind: "diff" as const, label: "commit", ref: "b6726b1" }] };
    const tasks = [
      card({ taskId: "a", title: "Fix failing tests in tinycart", place: repo, attention: "done", residency: "parked", lastReport: committed }),
      card({ taskId: "b", title: "Merged already", place: repo, attention: "done", residency: "archived", lastReport: committed }),
      card({ taskId: "c", title: "Nothing to merge", place: repo, attention: "done", residency: "parked", lastReport: { ...committed, branch: { commits: 0, uncommitted: false } } }),
      card({ taskId: "d", title: "Answer only", attention: "done", residency: "parked", lastReport: committed }),
    ];
    expect(tasks.filter(toMerge).map((c) => c.taskId)).toEqual(["a"]);
    const t = translator("en", commandsFor({ port: 7798 }));
    const text = formatSnapshot({ personaName: "Ducter", url: "x", onHand: { tasks, counts: { needs_you: 0, working: 0, waiting: 0, done_today: 4 } }, decisions: [] }, t);
    expect(text).toContain("Done, waiting for you to merge (1)\n  • Fix failing tests in tinycart");
    expect(text).toContain("ducter merge --port 7798 <part of its title>");
    expect(pickTask(tasks, "TINYCART").map((c) => c.taskId)).toEqual(["a"]);
    expect(pickTask(tasks, "b").map((c) => c.taskId)).toEqual(["b"]); // an id wins over a title match
  });

  test("quiet, in zh", () => {
    const text = formatSnapshot({ personaName: "小鸭", url: "ws://x", onHand: { tasks: [], counts: { needs_you: 0, working: 0, waiting: 0, done_today: 0 } }, decisions: [] }, zh);
    expect(text).toBe("小鸭 · 在 ws://x 运行\n\n还没有任务，一切安静。");
  });

  // A fake main process speaking the real wire protocol.
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: (req, srv) => (srv.upgrade(req) ? undefined : new Response("no", { status: 400 })),
    websocket: {
      message(ws, raw) {
        const f = JSON.parse(String(raw));
        if (f.t !== "hello") return;
        ws.send(JSON.stringify({ t: "welcome", persona: "default", personaName: "Pebble", headSeq: 1 }));
        ws.send(JSON.stringify({ t: "events", events: [ev(1, "decision", { decisionId: "d9", taskId: "t1", question: "Ship it?", goLabel: "Ship", defaultOption: "hold", reversible: false })] }));
        ws.send(JSON.stringify({ t: "on_hand", onHand: { tasks: [card({ attention: "needs_you" })], counts: { needs_you: 1, working: 0, waiting: 0, done_today: 0 } } }));
      },
    },
  });
  afterAll(() => server.stop(true));

  test("fetchSnapshot over a WebSocket", async () => {
    const s = await fetchSnapshot(server.port!);
    expect(s?.personaName).toBe("Pebble");
    expect(s?.onHand.tasks.length).toBe(1);
    expect(s?.decisions.map((d) => d.question)).toEqual(["Ship it?"]);
  });

  test("fetchSnapshot when nothing is listening", async () => {
    expect(await fetchSnapshot(1, 1000)).toBeUndefined();
  });
});

describe("desktop plan", () => {
  const base = { env: {}, execPath: "/opt/ducter/bin/ducter", compiled: true, exists: (_: string) => false, which: (_: string) => null as string | null };

  test("DUCTER_DESKTOP wins", () => {
    expect(planDesktop({ ...base, env: { DUCTER_DESKTOP: "/x/d" }, exists: (p) => p === "/x/d" })).toEqual({ kind: "binary", path: "/x/d" });
    expect(planDesktop({ ...base, env: { DUCTER_DESKTOP: "/x/d" } })).toEqual({ kind: "none" });
  });

  test("installed next to the binary", () => {
    expect(planDesktop({ ...base, exists: (p) => p === "/opt/ducter/bin/ducter-desktop" })).toEqual({ kind: "binary", path: "/opt/ducter/bin/ducter-desktop" });
  });

  test("source checkout builds with go, or uses a prior build", () => {
    const src = { ...base, compiled: false, repoRoot: "/r" };
    expect(planDesktop({ ...src, exists: (p) => p === "/r/apps/desktop/go.mod", which: () => "/usr/local/go/bin/go" })).toEqual({
      kind: "build",
      dir: "/r/apps/desktop",
      out: "/r/apps/desktop/bin/ducter-desktop",
      go: "/usr/local/go/bin/go",
    });
    expect(planDesktop({ ...src, exists: (p) => p.endsWith("go.mod") || p.endsWith("bin/ducter-desktop") })).toEqual({ kind: "binary", path: "/r/apps/desktop/bin/ducter-desktop" });
    expect(planDesktop(src)).toEqual({ kind: "none" });
  });
});
