// D288: the context meter (shared cases with the Mac), the token words, the limit spans, and the
// compaction hairline's sizes in the transcript.
import { expect, test } from "bun:test";
import type { LogEvent } from "../src/index.ts";
import { contextMeter, limitSpan, tightest, tokensShort } from "../src/context-meter.ts";
import { blocksOf } from "../src/transcript.ts";
import cases from "../fixtures/context-meter.json";

const ev = (seq: number, body: object): LogEvent => ({ seq, ts: `2026-11-16T10:00:${String(seq).padStart(2, "0")}.000Z`, persona: "p", stream: "task:t1", origin: "task", kind: "task_event", body: { taskId: "t1", ...body } as LogEvent["body"] });

for (const c of cases.cases) {
  test(`meter: ${c.name}`, () => {
    expect(contextMeter(c.events.map((e) => ev(e.seq, e.body)))).toEqual(c.want as ReturnType<typeof contextMeter>);
  });
}

test("tokens as people read them", () => {
  for (const [n, s] of cases.tokens as [number, string][]) expect(tokensShort(n)).toBe(s);
});

test("a usage window's span: 5 hours, a week (scoped to a model), extra, or its own label", () => {
  expect(limitSpan({ id: "five_hour", label: "Current session", durationMs: 18_000_000 })).toEqual({ span: "hours", n: 5 });
  expect(limitSpan({ id: "seven_day", label: "Current week (all models)" })).toEqual({ span: "days", n: 7 });
  expect(limitSpan({ id: "model_scoped:Opus", label: "Current week (Opus)", durationMs: 604_800_000 })).toEqual({ span: "days", n: 7, model: "Opus" });
  expect(limitSpan({ id: "codex:secondary", label: "Codex · 1 week", durationMs: 604_800_000 })).toEqual({ span: "days", n: 7 });
  expect(limitSpan({ id: "extra_usage", label: "Extra usage" })).toEqual({ span: "extra" });
  expect(limitSpan({ label: "Usage limit" })).toEqual({ span: "other", label: "Usage limit" });
  expect(tightest([{ label: "a", used: 0.2 }, { label: "b", used: 0.6 }, { id: "extra_usage", label: "x", used: 0.9 }])?.label).toBe("b");
});

test("the compaction hairline carries its size before and after (the after from the first reading)", () => {
  const blocks = blocksOf("codex", [
    ev(1, { role: "assistant", text: "Working." }),
    ev(2, { role: "system", text: "compaction completed", raw: { kind: "compaction_ended", outcome: "completed", before: 152_000, compactions: 1 } }),
    ev(3, { role: "system", raw: { kind: "context", contextTokens: 31_000, contextWindow: 200_000, compactAt: 160_000, after: true } }),
    ev(4, { role: "system", text: "could not compact: its agent isn't running now", raw: { slash: "compact", failed: "its agent isn't running now" } }),
  ], false);
  const notes = blocks.filter((b) => b.k === "note");
  expect(notes.map((n) => n.k === "note" && [n.say, n.from, n.to, n.bad])).toEqual([
    ["compacted", 152_000, 31_000, undefined],
    ["compact_failed", undefined, undefined, true],
  ]);
});
