import { afterAll, describe, expect, test } from "bun:test";
import type { LogEvent, OnHand, TaskCard } from "@ducter/protocol";
import { fetchSnapshot, formatSnapshot, openDecisions } from "../src/status.ts";
import { planDesktop } from "../src/desktop.ts";
import { translator } from "../src/i18n.ts";

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
    expect(text).toContain("Open decisions (1)\n  ? Rebase on main?\n    [Go: Rebase] [Hold]");
    expect(text).toContain("Done today: 2");
  });

  test("quiet, in zh", () => {
    const text = formatSnapshot({ personaName: "小鸭", url: "ws://x", onHand: { tasks: [], counts: { needs_you: 0, working: 0, waiting: 0, done_today: 0 } }, decisions: [] }, zh);
    expect(text).toBe("小鸭 · 运行于 ws://x\n\n还没有任务，一切安静。");
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
