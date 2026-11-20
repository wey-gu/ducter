// D325: the composer while a task works on the web: Return steers and says when it was read,
// After this is held at the home (a chip over the composer, changed, taken back or said now),
// and an agent that can't steer says so. The Mac's keys and words are the same (turns.go).
import { describe, expect, test } from "bun:test";
import { HARNESS_IDS, HARNESSES, type LogEvent, type TaskCard } from "@ducter/protocol";
import { strings } from "../src/i18n.ts";
import { Store } from "../src/store.ts";

let n = 0;
const ev = (body: object, seq = ++n): LogEvent => ({ seq, ts: new Date(1_763_000_000_000 + seq * 1000).toISOString(), persona: "p", stream: "task:t1", origin: "task", kind: "task_event", body: { taskId: "t1", ...body } }) as LogEvent;
const card = (held?: TaskCard["held"]): TaskCard => ({ taskId: "t1", persona: "p", title: "Ship it", project: "", place: { kind: "none" }, harness: "claude-code", attention: "working", residency: "hot", openedAt: "2026-11-17T10:00:00Z", updatedAt: "2026-11-17T10:00:00Z", ...(held ? { held } : {}) }) as TaskCard;

describe("words", () => {
  test("every agent says whether it takes a steer (OAR 0.95.1: all four do; 0.124, D416: Antigravity too)", () => {
    for (const h of HARNESS_IDS) expect(typeof HARNESSES[h].steer).toBe("boolean");
    expect(HARNESS_IDS.filter((h) => HARNESSES[h].steer)).toEqual(["claude-code", "codex", "pi", "deepseek-harness", "antigravity"]);
  });
});

describe("the store", () => {
  test("held at the home: its bubble goes (the card's chip takes over); a steer stays a bubble", () => {
    const s = new Store();
    s.addSend("t1", "then the docs", 1, "c1");
    s.addSend("t1", "use staging", 2, "c2");
    s.apply({ t: "sent", taskId: "t1", delivered: "steered", clientId: "c2" });
    s.apply({ t: "sent", taskId: "t1", delivered: "queued", clientId: "c1" });
    expect(s.tasks.get("t1")!.sends.map((x) => [x.text, x.delivered])).toEqual([["use staging", "steered"]]);
  });

  test("the runner's read marks the steers the agent took in", () => {
    const s = new Store();
    s.apply({ t: "events", events: [ev({ role: "user", from: "user", text: "a", raw: { delivered: "steer" } }, 10), ev({ role: "system", from: "runner", raw: { read: [10] } }, 11)] });
    expect([...(s.tasks.get("t1")!.reads ?? [])]).toEqual([10]);
  });

  test("the card carries the queue in order", () => {
    const s = new Store();
    s.apply({ t: "on_hand", onHand: { tasks: [card([{ id: "h1", text: "one", at: "x" }, { id: "h2", text: "two", at: "y" }])], counts: { needs_you: 0, working: 1, waiting: 0, done_today: 0 }, waiters: [] } });
    expect(s.tasks.get("t1")!.card!.held!.map((h) => h.text)).toEqual(["one", "two"]);
  });
});

describe("receipts and chips", () => {
  test("a steer: waiting while it works and unread; read, only the newest says Seen", async () => {
    const { A } = await import("../src/app.ts");
    const { steerReceipt } = await import("../src/transcript.tsx");
    A.L = strings("zh");
    const s = A.S;
    s.apply({ t: "on_hand", onHand: { tasks: [card()], counts: { needs_you: 0, working: 1, waiting: 0, done_today: 0 }, waiters: [] } });
    s.apply({ t: "events", events: [ev({ role: "user", from: "user", text: "a", raw: { delivered: "steer" } }, 20), ev({ role: "user", from: "user", text: "b", raw: { delivered: "steer" } }, 21), ev({ role: "user", from: "user", text: "c", raw: { delivered: "turn" } }, 22)] });
    const t = s.tasks.get("t1")!;
    expect([steerReceipt(t, 20), steerReceipt(t, 21), steerReceipt(t, 22)]).toEqual(["wait", "wait", undefined]);
    s.apply({ t: "events", events: [ev({ role: "system", from: "runner", raw: { read: [20, 21] } }, 23)] });
    expect([steerReceipt(t, 20), steerReceipt(t, 21)]).toEqual([undefined, "read"]);
  });

  test("a chip changed, taken back or said now shows at once and goes to the home", async () => {
    const { A } = await import("../src/app.ts");
    const sent: object[] = [];
    const was = A.send;
    A.send = ((f: object) => void sent.push(f)) as typeof A.send;
    try {
      A.S.apply({ t: "on_hand", onHand: { tasks: [card([{ id: "h1", text: "one", at: "x" }, { id: "h2", text: "two", at: "y" }, { id: "h3", text: "three", at: "z" }])], counts: { needs_you: 0, working: 1, waiting: 0, done_today: 0 }, waiters: [] } });
      A.heldOp("t1", "h2", "edit", "  two, but shorter ");
      A.heldOp("t1", "h1", "drop");
      A.heldOp("t1", "h3", "now");
      const t = A.S.tasks.get("t1")!;
      expect(t.card!.held!.map((h) => h.text)).toEqual(["two, but shorter"]);
      expect(t.sends.at(-1)).toMatchObject({ text: "three", clientId: "h3", mode: "steer" });
      expect(sent).toEqual([
        { t: "task_held", taskId: "t1", id: "h2", op: "edit", text: "two, but shorter" },
        { t: "task_held", taskId: "t1", id: "h1", op: "drop" },
        { t: "task_held", taskId: "t1", id: "h3", op: "now" },
      ]);
      A.heldOp("t1", "gone", "drop"); // no longer held: nothing
      expect(sent).toHaveLength(3);
    } finally {
      A.send = was;
    }
  });
});
