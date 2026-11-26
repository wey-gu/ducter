// D587: one waiting line for the whole conversation. Two living messages, each with a result the
// partner is still putting into words (or a task's question it is still relaying), wait as one
// line at the conversation's end; a message holding nothing else is not drawn until its words come.
// The Mac's is apps/desktop/internal/views/d587_test.go.
import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { LogEvent } from "@ducter/protocol";

// The app's one state is shared by every file in a run: leave it as found (no task or message of ours).
afterEach(async () => {
  const { A } = await import("../src/app.ts");
  for (const id of ["t1", "t2", "t3"]) A.S.tasks.delete(id);
  A.S.channel.splice(0);
  A.S.decisions.delete("d9");
  A.status = "connecting";
});

let seq = 0;
const ev = (kind: string, body: unknown, o: Partial<LogEvent> = {}): LogEvent =>
  ({ seq: ++seq, ts: new Date().toISOString(), persona: "default", stream: "channel", origin: "partner", kind, body, ...o }) as LogEvent;

const card = (taskId: string, now: string) =>
  ({ taskId, persona: "default", title: taskId, project: "", place: { kind: "none" }, harness: "codex", attention: "done", residency: "archived", openedAt: now, updatedAt: now, lastReport: { taskId, state: "done", summary: "全绿。", questions: [], evidence: [] } }) as never;

describe("one waiting line", () => {
  test("two results on their way in two living messages: one line, and neither message drawn", async () => {
    const { A } = await import("../src/app.ts");
    const { conversationWait } = await import("../src/views.tsx");
    A.status = "connected";
    const now = new Date().toISOString();
    for (const id of ["t1", "t2"]) A.S.tasks.set(id, { id, events: [], spans: [], card: card(id, now) } as never);
    const said = ev("ai_msg", { text: "第一个好了，我再看看第二个。" });
    A.S.apply({ t: "welcome", persona: "default", personaName: "Ducter", headSeq: 0 } as never);
    A.S.apply({ t: "events", events: [
      ev("user_msg", { text: "两个都做一下" }, { origin: "user" }),
      ev("living_msg", { items: [{ taskId: "t1", kind: "done", title: "修 CI #1592", text: "全绿。" }] }),
      said,
      ev("living_msg", { items: [{ taskId: "t2", kind: "done", title: "升级 bun", text: "全绿。" }] }),
    ] } as never);
    const { rows, livingItems } = A.rows();
    const w = conversationWait(rows, livingItems);
    expect(w.kind).toBe("result");
    expect(w.ms).toBeGreaterThan(60_000);
    const living = rows.filter((e) => e.living).map((e) => e.firstSeq);
    expect(living.length).toBe(2);
    expect([...w.hidden].sort()).toEqual(living.sort());
    // Past the wait (offline counts as late): nothing waits, both messages say their results.
    A.status = "offline";
    const late = conversationWait(rows, livingItems);
    expect(late.kind).toBeUndefined();
    expect(late.hidden.size).toBe(0);
    A.status = "connected";
  });

  test("a message with something said keeps it; a question still relayed waits behind a result", async () => {
    const { A } = await import("../src/app.ts");
    const { conversationWait } = await import("../src/views.tsx");
    A.status = "connected";
    const now = new Date().toISOString();
    A.S.tasks.set("t3", { id: "t3", events: [], spans: [], card: card("t3", now) } as never);
    const later = new Date(Date.now() + 30 * 60_000).toISOString();
    A.S.apply({ t: "events", events: [
      ev("decision", { decisionId: "d9", taskId: "t9", question: "现在合并吗？", goLabel: "合并", defaultOption: "hold", defaultAt: later }),
      ev("living_msg", {
        items: [
          { taskId: "t3", kind: "done", title: "原则英译", text: "好了。" },
          { taskId: "t8", kind: "failed", title: "Bump tokio", text: "4 places don't build." },
          { taskId: "t9", kind: "decision", title: "合并", text: "现在合并吗？", decisionId: "d9" },
        ],
      }),
    ] } as never);
    const { rows, livingItems } = A.rows();
    const last = rows.filter((e) => e.living).at(-1)!;
    const w = conversationWait(rows, livingItems);
    expect(w.kind).toBe("result");
    expect(w.hidden.has(last.firstSeq)).toBe(false);
  });

  test("the conversation draws the one line at its end, never one inside a message", () => {
    const src = readFileSync(join(import.meta.dir, "../src/views.tsx"), "utf8");
    expect(src.match(/<Presence kind=/g)?.length).toBe(1);
    expect(src).toContain("{A.thinking() ? <Presence /> : waits.kind && <Presence kind={waits.kind} />}");
    expect(src).not.toContain("wordsHeldBefore");
  });
});
