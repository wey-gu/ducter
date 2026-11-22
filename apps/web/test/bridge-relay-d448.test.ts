// D448: a task Ducter runs on an agent with no Bridge of its own passes messages through Ducter. The
// reach row says so honestly (Ducter's tasks on it can, the person's own sessions of it can't yet);
// a task's own exchanges join 最近 / Recently by the task's name and stay out of the conversation,
// except the one the person said go to on its card. The Mac has the same rules (peers_reach_test.go).
import { describe, expect, test } from "bun:test";
import type { Bodies, LogEvent } from "@ducter/protocol";
import { memoryWords } from "../src/i18n-memory.ts";
import { reachRows, recentHandoffs } from "../src/mem-view.ts";
import { Store } from "../src/store.ts";

const dev = (harnesses: string[]) => ({ id: "local", name: "Mac", home: true, harnesses: harnesses.map((harness) => ({ harness, installed: true, loggedIn: true })) });
let n = 0;
const ev = (body: Bodies["bridge_msg"], seq = ++n): LogEvent => ({ seq, ts: new Date(1_763_000_000_000 + seq * 1000).toISOString(), persona: "p", stream: "channel", origin: body.direction === "in" ? "peer" : "partner", kind: "bridge_msg", body }) as LogEvent;

describe("能找到{name}的: pi and Antigravity where Ducter runs tasks", () => {
  test("signed in on a computer of Ducter's: relay; known only from the person's own records: none", () => {
    expect(reachRows([dev(["pi", "antigravity"])], [], []).map((r) => [r.harness, r.can])).toEqual([
      ["pi", "relay"],
      ["antigravity", "relay"],
    ]);
    expect(reachRows([], ["antigravity"], []).map((r) => r.can)).toEqual(["none"]);
  });
  test("the line says both halves, in both languages", () => {
    expect(memoryWords.zh["peers.reach.relay"]).toBe("%[1]s开的 %[2]s 任务能传话，你自己开的还不行");
    expect(memoryWords.en["peers.reach.relay"]).toBe("%[2]s tasks %[1]s runs pass messages; yours can't yet");
  });
});

describe("a task's own exchanges", () => {
  const card: Bodies["bridge_msg"] = { direction: "out", messageId: "bm-o1", to: "codex-mem", agent: "Codex", mine: true, text: "为什么跳过 open？", head: "Ducter 的任务「修 CI」：", by: "task", taskId: "t1", decisionId: "d1", opId: "bo1", state: "sent" };
  const answer: Bodies["bridge_msg"] = { direction: "in", messageId: "bm-a1", from: "codex-mem", agent: "Codex", mine: true, text: "用 xdg-open。", inReplyTo: "bm-o1", taskId: "t1", state: "task" };
  const follow: Bodies["bridge_msg"] = { direction: "out", messageId: "bm-o2", to: "codex-mem", agent: "Codex", mine: true, text: "镜像里有 xdg-utils 吗？", head: "Ducter 的任务「修 CI」：", by: "task", taskId: "t1", contact: "reply:bm-a1", opId: "bo2", state: "sent" };

  test("the carded one shows in the conversation; the answer and a follow-up with no card are the task's", () => {
    const s = new Store();
    s.apply({ t: "events", events: [ev(card, 1), ev(answer, 2), ev(follow, 3)] });
    expect(s.channel.filter((e) => e.peer).map((e) => e.peer!.messageId)).toEqual(["bm-o1"]);
    expect(s.taskPeers.map((e) => e.peer.messageId)).toEqual(["bm-a1", "bm-o2"]);
  });

  test("Recently names the task: what it asked, what came back into it", () => {
    const feed = [card, answer, follow].map((peer, i) => ({ ev: { seq: i + 1, ts: `2026-11-21T08:0${i}:00Z` }, peer }));
    const list = recentHandoffs(feed, 5);
    expect(list.map((h) => [h.way, h.taskId, h.words])).toEqual([
      ["tasksent", "t1", "镜像里有 xdg-utils 吗？"],
      ["taskin", "t1", "用 xdg-open。"],
      ["tasksent", "t1", "为什么跳过 open？"],
    ]);
    // D470: a thread says it by the task: 「{task}」问的，它回了：…
    expect(memoryWords.zh["peers.ex.task.answered"]).toBe("「%[1]s」问的，它回了：%[2]s");
    expect(memoryWords.zh["peers.ex.task.waiting"]).toBe("「%s」问的，在等它回话");
  });
});
