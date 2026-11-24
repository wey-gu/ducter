// D506: the conversation pages back a page at a time: what the paging reads, over an in-memory Log.
import { expect, test } from "bun:test";
import { openLog } from "../src/log.ts";
import { channelPage } from "../src/ws.ts";
import fixture from "../../protocol/fixtures/older-pages.json";

function log() {
  return openLog({ path: ":memory:", persona: "default" });
}

test("a page is the events before beforeSeq, oldest first, and says whether older remain", () => {
  const l = log();
  for (let i = 0; i < 10; i++) l.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: `m${i}` } });
  l.append({ stream: "task:t1", origin: "task", kind: "task_event", body: { taskId: "t1", role: "assistant", text: "not the channel" } });
  l.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: "newest" } });
  const p = channelPage(l, "channel", 8, 4);
  expect(p.events.map((e) => e.seq)).toEqual([4, 5, 6, 7]);
  expect(p.more).toBe(true);
  const q = channelPage(l, "channel", 4, 4);
  expect(q.events.map((e) => e.seq)).toEqual([1, 2, 3]);
  expect(q.more).toBe(false);
  // Only the conversation asked for: another stream's events never come.
  expect(channelPage(l, "channel", 100, 50).events.every((e) => e.stream === "channel")).toBe(true);
  // A partner's own conversation (D309) is its own stream.
  l.append({ stream: "channel:mira", origin: "user", kind: "user_msg", body: { text: "hi mira" } });
  expect(channelPage(l, "channel:mira", 100).events.map((e) => (e.body as { text: string }).text)).toEqual(["hi mira"]);
});

test("a living message revised inside the page or right after it never comes back as its own message", () => {
  const l = log();
  l.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "start two tasks" } });
  const a = l.append({ stream: "channel", origin: "system", kind: "living_msg", body: { items: [] } });
  const b = l.append({ stream: "channel", origin: "system", kind: "living_msg", body: { items: [] }, supersedes: a.seq });
  l.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: "both started" } });
  // The client holds from here: its first event revises b, which is in the page.
  const held = l.append({ stream: "channel", origin: "system", kind: "living_msg", body: { items: [] }, supersedes: b.seq });
  const p = channelPage(l, "channel", held.seq);
  expect(p.events.map((e) => e.kind)).toEqual(["user_msg", "ai_msg"]);
  expect(p.more).toBe(false);
});

test("the clients' fixture: the page before its cut is what both clients are given (seq 5, revised by 6, left out)", () => {
  const l = log();
  for (const e of fixture.events) {
    const got = l.append({ stream: e.stream, origin: e.origin as never, kind: e.kind as never, body: e.body as never, ...(e.supersedes ? { supersedes: e.supersedes } : {}) });
    expect(got.seq).toBe(e.seq);
  }
  const p = channelPage(l, "channel", fixture.cut);
  expect(p.events.map((e) => e.seq)).toEqual([1, 2, 3, 4, 6, 7, 8, 9, 10]);
  expect(p.more).toBe(false);
});

test("the limit is kept within bounds", () => {
  const l = log();
  for (let i = 0; i < 2500; i++) l.append({ stream: "channel", origin: "system", kind: "read_receipt", body: { upToSeq: i } });
  expect(channelPage(l, "channel", 2501).events).toHaveLength(300);
  expect(channelPage(l, "channel", 2501, 99_999).events).toHaveLength(2000);
  expect(channelPage(l, "channel", 2501, 0).events).toHaveLength(300);
});
