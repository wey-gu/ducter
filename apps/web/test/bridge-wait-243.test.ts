// D656 (research/243 Brief D): a task waiting for another agent's answer has not stopped.
// Its sent bridge message is the fact On hand reads: the card keeps saying 在等{who}回话, the row
// stays under 在等, and the answer removes the wait. The Mac's bridge_wait_test.go reads the same.
import { describe, expect, test } from "bun:test";
import { strings } from "../src/i18n.ts";

const now = Date.now();
const iso = (ms: number) => new Date(now + ms).toISOString();
const card = (id: string, attention: string, at: string, reason = "") => ({
  taskId: id,
  persona: "default",
  title: `Task ${id}`,
  place: { kind: "none" },
  harness: "pi",
  attention,
  residency: "parked",
  openedAt: at,
  updatedAt: at,
  ...(reason ? { reason } : {}),
});
const out = (seq: number, extra: Record<string, unknown> = {}) => ({
  seq,
  ts: iso(-2 * 3_600_000),
  persona: "default",
  stream: "channel",
  origin: "partner",
  kind: "bridge_msg",
  body: { direction: "out", messageId: "bm-o1", opId: "bo-1", operation: "op-1", by: "task", taskId: "t1", decisionId: "d1", contact: "ct-codex", to: "Codex", agent: "Codex", mine: true, text: "为什么要跳过 open？", state: "sent", ...extra },
});
const answer = (seq: number) => ({
  seq,
  ts: iso(-60 * 60_000),
  persona: "default",
  stream: "channel",
  origin: "peer",
  kind: "bridge_msg",
  body: { direction: "in", messageId: "bm-a1", inReplyTo: "bm-o1", state: "task", taskId: "t1", from: "Codex", agent: "Codex", mine: true, text: "没动过。" },
});

async function board(events: unknown[], reason = "") {
  const { A } = await import("../src/app.ts");
  const o = await import("../src/onhand.tsx");
  const { Store } = await import("../src/store.ts");
  A.S = new Store();
  A.L = strings("zh");
  A.send = () => {};
  A.S.welcomed = true;
  A.receive({ t: "on_hand", onHand: { tasks: [card("t1", "blocked", iso(-8 * 60 * 60_000), reason)], counts: { needs_you: 0, working: 0, waiting: 1, done_today: 0 }, waiters: [], missed: [] } } as any);
  A.receive({ t: "events", events } as any);
  return { A, o };
}

describe("a task waiting on another agent's answer (D656)", () => {
  test("the card says 在等{who}回话 and the row stays under 在等, not in 等你", async () => {
    const { A, o } = await board([out(2)]);
    const task = A.S.task("t1");
    expect(A.S.bridgeWaitFor("t1")).toMatchObject({ messageId: "bm-o1", to: "Codex" });
    expect(o.stoppedWait(task)).toBe(false); // 8 h old, but the answer will come
    expect(o.storyOf(task).words).toBe("在等 Codex 回话");
    expect(o.boardParts(o.lensLanes(""))).toMatchObject({ stopped: [], waiting: [expect.objectContaining({ id: "t1" })] });
    A.S.tasks.clear();
  });

  test("the answer, or a send that didn't go, ends the wait", async () => {
    const { A, o } = await board([out(2), answer(3)]);
    expect(A.S.bridgeWaitFor("t1")).toBeUndefined();
    expect(o.stoppedWait(A.S.task("t1"))).toBe(true);
    A.S.tasks.clear();
    const failed = await board([out(2, { state: "failed" })]);
    expect(failed.A.S.bridgeWaitFor("t1")).toBeUndefined();
    failed.A.S.tasks.clear();
  });

  test("the partner's own reason wins when it is there (the card's line as core set it)", async () => {
    const { A, o } = await board([out(2)], "在等 Codex 回话");
    expect(o.storyOf(A.S.task("t1")).words).toBe("在等 Codex 回话");
    A.S.tasks.clear();
  });
});
