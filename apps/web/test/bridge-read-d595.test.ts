// D-PENDING: a sent Bridge message's read state on the web: 已送达 / Delivered, 已读 / Read, or
// 「{n}/{m} 已读」 in a Space with several readers; nothing when Mem has no receipt. The state comes
// from a `bridge_read` event, read by the inbox check Ducter already runs, and joins the line it is
// about by its op or message id. No receipt is unknown, never a made-up "unread".
import { describe, expect, test } from "bun:test";
import type { Bodies, LogEvent } from "@ducter/protocol";
import { exchangeThreads } from "../src/mem-view.ts";
import { receiptWords } from "../src/format.ts";
import { strings } from "../src/i18n.ts";
import { Store } from "../src/store.ts";

const zh = strings("zh");
const en = strings("en");

describe("D-PENDING: a sent message's receipt", () => {
  test("0 readers reads Delivered, 1 reads Read, several read n/m; no receipt says nothing", () => {
    expect(receiptWords(undefined, zh)).toBe("");
    expect(receiptWords({ state: "unread", count: 0, total: 1 }, zh)).toBe("已送达");
    expect(receiptWords({ state: "read", count: 1, total: 1 }, zh)).toBe("已读");
    expect(receiptWords({ state: "partly", count: 2, total: 5 }, zh)).toBe("2/5 已读");
    expect(receiptWords({ state: "unread" }, zh)).toBe("已送达");
    expect(receiptWords({ state: "read", count: 1, total: 1 }, en)).toBe("Read");
    expect(receiptWords({ state: "partly", count: 2, total: 5 }, en)).toBe("2/5 read");
    // A missing count is never printed as zero.
    expect(receiptWords({ state: "partly" }, zh)).toBe("已读");
  });

  test("the Store keeps the latest by op and by message id, and finds one by task", () => {
    const s = new Store();
    let seq = 0;
    const ev = (kind: "bridge_msg" | "bridge_read", body: unknown): LogEvent =>
      ({ seq: ++seq, ts: "2026-11-26T10:00:00.000Z", persona: "p1", stream: "channel", origin: "partner", kind, body } as LogEvent);
    s.applyEvent(ev("bridge_msg", { direction: "out", messageId: "m1", opId: "o1", taskId: "t1", to: "Codex", text: "look", state: "sent" }));
    s.applyEvent(ev("bridge_read", { opId: "o1", messageId: "m1", receipt: { state: "unread", count: 0, total: 1 } }));
    expect(s.receiptOf({ opId: "o1" })).toEqual({ state: "unread", count: 0, total: 1 });
    expect(s.receiptOf({ messageId: "m1" })).toEqual({ state: "unread", count: 0, total: 1 });
    expect(s.receiptOfTask("t1")).toEqual({ state: "unread", count: 0, total: 1 });
    expect(s.receiptOfTask("t2")).toBeUndefined();
    s.applyEvent(ev("bridge_read", { opId: "o1", messageId: "m1", receipt: { state: "read", count: 1, total: 1 } }));
    expect(s.receiptOf({ opId: "o1" })).toEqual({ state: "read", count: 1, total: 1 });
    // A message the Store never showed is not given a receipt by a stray event.
    expect(s.receiptOf({ opId: "nowhere" })).toBeUndefined();
  });

  test("an exchange row carries the sent message it should read the receipt for", () => {
    let seq = 0;
    const e = (peer: Record<string, unknown>) => ({ ev: { seq: ++seq, ts: "2026-11-26T10:00:00.000Z" }, peer });
    const feed = [e({ direction: "in", messageId: "in1", agent: "Codex", mine: true, selfNamed: true, text: "status?" }), e({ direction: "out", messageId: "out1", opId: "o1", inReplyTo: "in1", agent: "Codex", mine: true, selfNamed: true, text: "here it is", state: "sent" })];
    const th = exchangeThreads(feed, undefined, []);
    expect(th[0]!.items[0]!.sent).toEqual({ opId: "o1", messageId: "out1" });
    // A task's own agent_message row keeps its op too, so its receipt is read from the same event.
    const taskFeed = [e({ direction: "out", by: "task", taskId: "t1", messageId: "m2", opId: "o2", agent: "Codex", text: "done", state: "sent" })];
    const tt = exchangeThreads(taskFeed, undefined, []);
    expect(tt[0]!.items[0]!.way).toBe("taskasked");
    expect(tt[0]!.items[0]!.sent).toEqual({ opId: "o2", messageId: "m2" });
  });

  test("the words reach a task row too (its message is shown under the time)", () => {
    const s = new Store();
    let seq = 0;
    const ev = (kind: "bridge_msg" | "bridge_read", body: unknown): LogEvent =>
      ({ seq: ++seq, ts: "2026-11-26T10:00:00.000Z", persona: "p1", stream: "channel", origin: "partner", kind, body } as LogEvent);
    s.applyEvent(ev("bridge_msg", { direction: "out", messageId: "m9", opId: "o9", taskId: "t9", by: "task", agent: "Codex", mine: true, text: "done", state: "sent" }));
    s.applyEvent(ev("bridge_read", { opId: "o9", messageId: "m9", receipt: { state: "partly", count: 3, total: 4 } }));
    expect(receiptWords(s.receiptOfTask("t9"), zh)).toBe("3/4 已读");
    expect(s.taskPeers.some((e) => e.peer.opId === "o9")).toBe(true);
  });

  test("a receipt is not an event the conversation shows", () => {
    const s = new Store();
    s.applyEvent({ seq: 1, ts: "2026-11-26T10:00:00.000Z", persona: "p1", stream: "channel", origin: "system", kind: "bridge_read", body: { opId: "o1", messageId: "m1", receipt: { state: "read", count: 1 } } } as LogEvent);
    expect(s.channel).toHaveLength(0);
    expect(s.bySeq.get(1)).toBeNull();
  });
});

// One body type check, so a shape drift is a type error here too.
const _body: Bodies["bridge_read"] = { opId: "o1", messageId: "m1", receipt: { state: "read", count: 1, total: 1 } };
void _body;
