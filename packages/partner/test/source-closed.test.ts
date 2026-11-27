// research/244 rule 3: a to-do closed on a running task is a fact for the partner, with the task's
// own name and the person's latest words about it; code makes no template card. The partner judges:
// words that already answer it mean silence, otherwise it may ask once, naming the task.
import { expect, test } from "bun:test";
import type { Bodies, LogEvent } from "@ducter/protocol";
import { renderTrigger } from "../src/render.ts";

const ev = (item: Partial<Bodies["source_seen"]["item"]> = {}): LogEvent => ({
  seq: 9,
  ts: "2026-11-27T14:53:00.000Z",
  persona: "p",
  stream: "channel",
  origin: "system",
  kind: "source_seen",
  body: { source: "s", change: "closed", taskId: "t1", item: { source: "s", kind: "github", ref: "nowledge-co/mem#10500", label: "#10500", where: "nowledge-co/mem", title: "Data migration page", state: "closed", ...item } },
} as LogEvent);

const ctx = (words?: string) => ({ taskTitle: (id: string) => (id === "t1" ? "数据迁移页" : undefined), taskWords: () => words, decision: () => undefined });

test("seq 83323's shape: the person's own latest words arrive with the fact, so the partner can stay silent", () => {
  const r = renderTrigger(ev(), ctx("没做完的你现在能帮忙做掉么？接着做。"));
  expect(r).toContain("nowledge-co/mem#10500");
  expect(r).toContain("数据迁移页");
  expect(r).toContain("接着做。");
  expect(r).toContain("say nothing and ask nothing");
  expect(r).not.toContain("Stop this task?");
});

test("a third, unlike case: someone else closed it and there are no recent words; the task is named and the partner may ask", () => {
  const r = renderTrigger(ev({ closedBy: "100gle" }), ctx(undefined));
  expect(r).toContain("was closed there by 100gle");
  expect(r).toContain("数据迁移页");
  expect(r).toContain("latest words about that task: none");
  expect(r).toContain("naming the task by its title");
  expect(r).toContain("Go = stop");
});
