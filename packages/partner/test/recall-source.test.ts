// D304: the 想起了 / Remembered source line. The partner names the memory it leaned on with the
// result's ref ([[m1]]); code takes the mark out of the words, checks it against what memory_search
// returned that turn, and logs one memory_recalled under the message. Fake Mem only.
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bodies } from "../../protocol/src/index.ts";
import { createPartner } from "../src/index.ts";
import { takeRecallMark } from "../src/partner.ts";
import { FakeClock, fakeCore, fakeMemory, fakeRunner, type Script } from "./fakes.ts";

const SEED = [
  { id: "m_week", title: "周报每周五下午发，发给产品组", content: "Weyl 说的：周报每周五下午发。", date: "2026-11-10", kind: "preference", source: "ducter" },
  { id: "m_cc", title: "HawDB release: bump Cargo.toml and CHANGELOG.md together", content: "Before tagging…", date: "2026-11-15", kind: "procedure", source: "claude-code" },
];

const THREADS = [
  { id: "t_flaky", title: "Fix flaky recall test", source: "codex", date: "2026-11-12", lines: [{ who: "user" as const, text: "the recall test is flaky again" }, { who: "assistant" as const, text: "It raced the index build; await indexReady() first." }] },
];

function setup(script: Script, threads?: typeof THREADS) {
  const clock = new FakeClock();
  const fc = fakeCore(clock, mkdtempSync(join(tmpdir(), "ducter-recall-src-")));
  const fr = fakeRunner(script);
  fr.bindCards(fc.cards);
  const mem = fakeMemory(SEED, threads ? { threads } : {});
  const partner = createPartner(fc.core, fr.runner, { now: clock.now, persistState: false, onError: () => {}, memory: mem.memory });
  const user = (text: string) => {
    const e = fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text } });
    partner.onTrigger(e);
    return e;
  };
  const channel = () => fc.events.filter((e) => e.stream === "channel");
  return { fc, partner, user, channel };
}

describe("takeRecallMark", () => {
  test("takes the mark out wherever it is, keeps the first ref", () => {
    expect(takeRecallMark("周五下午发。[[m2]]")).toEqual({ text: "周五下午发。", mark: "m2" });
    expect(takeRecallMark("Friday [[ M1 ]] afternoon.")).toEqual({ text: "Friday afternoon.", mark: "m1" });
    expect(takeRecallMark("A [[m1, m3]]")).toEqual({ text: "A", mark: "m1" });
    expect(takeRecallMark("no mark [[wiki]] here")).toEqual({ text: "no mark [[wiki]] here" });
    expect(takeRecallMark("Await it first. [[c1]]")).toEqual({ text: "Await it first.", mark: "c1" });
    expect(takeRecallMark("周四下午 3 点。[[k2]]")).toEqual({ text: "周四下午 3 点。", mark: "k2" });
  });
});

describe("the source line", () => {
  test("a recall that changed the answer: one line under it, the mark never shown", async () => {
    let r: any;
    const { partner, user, fc, channel } = setup(async (_i, s) => {
      r = await fc.callTool("memory_search", { query: "周报" });
      s.say("周五下午发，发给产品组。[[m1]]");
      s.end();
    });
    const u = user("周报哪天发？");
    await partner.idle();
    expect(r.results[0]).toMatchObject({ ref: "m1", title: SEED[0]!.title });
    expect(r.results[0].id).toBeUndefined(); // never Mem's id
    const msgs = channel().filter((e) => e.kind === "ai_msg");
    expect(msgs.map((e) => (e.body as Bodies["ai_msg"]).text)).toEqual(["周五下午发，发给产品组。"]);
    const lines = channel().filter((e) => e.kind === "memory_recalled");
    expect(lines.length).toBe(1);
    expect(lines[0]!.body).toEqual({ memoryId: "m_week", title: SEED[0]!.title, by: "said", date: "2026-11-10", aboutSeq: msgs[0]!.seq, replyTo: u.seq });
  });

  // D487: what the session was given about them (no search this turn): its ref says which, the same line.
  test("a known item leaned on: [[k1]] gives the same line, with no search", async () => {
    let input = "";
    const { partner, user, channel } = setup(async (i, s) => {
      input = i;
      s.say("周五下午，发给产品组。[[k1]]");
      s.end();
    });
    user("周报哪天发来着？");
    await partner.idle();
    expect(input).toContain("k1 preference 2026-11-10: 周报每周五下午发，发给产品组");
    const line = channel().find((e) => e.kind === "memory_recalled")!.body as Bodies["memory_recalled"];
    expect(line).toMatchObject({ memoryId: "m_week", by: "said", date: "2026-11-10" });
  });

  test("another AI tool's memory: by tool, with its name", async () => {
    const { partner, user, fc, channel } = setup(async (_i, s) => {
      await fc.callTool("memory_search", { query: "HawDB release CHANGELOG" });
      s.say("Bump Cargo.toml and add the CHANGELOG entry in the same commit. [[m1]]");
      s.end();
    });
    user("Cutting a HawDB release today; anything first?");
    await partner.idle();
    const line = channel().find((e) => e.kind === "memory_recalled")!.body as Bodies["memory_recalled"];
    expect(line).toMatchObject({ memoryId: "m_cc", by: "tool", from: "Claude Code" });
  });

  // D433: a past conversation with another AI tool leaned on: the same quiet line, naming the tool and the day.
  test("a past conversation: [[c1]] says which, by its tool and day, never its lines", async () => {
    let r: any;
    const { partner, user, fc, channel } = setup(async (_i, s) => {
      r = await fc.callTool("memory_search", { query: "recall test flaky" });
      s.say("It raced the index build: the test now awaits indexReady() first. [[c1]]");
      s.end();
    }, THREADS);
    const u = user("How did I fix that flaky recall test in Codex?");
    await partner.idle();
    expect(r.conversations[0]).toMatchObject({ ref: "c1", tool: "Codex", date: "2026-11-12" });
    expect(r.conversations[0].id).toBeUndefined();
    const msgs = channel().filter((e) => e.kind === "ai_msg");
    expect((msgs[0]!.body as Bodies["ai_msg"]).text).toBe("It raced the index build: the test now awaits indexReady() first.");
    const line = channel().find((e) => e.kind === "memory_recalled")!.body as Bodies["memory_recalled"];
    expect(line).toEqual({ memoryId: "t_flaky", title: "Fix flaky recall test", by: "tool", from: "Codex", thread: true, date: "2026-11-12", aboutSeq: msgs[0]!.seq, replyTo: u.seq });
  });

  test("a conversation with no thread id or an unknown tool: no ref, no line", async () => {
    let r: any;
    const { partner, user, fc, channel } = setup(async (_i, s) => {
      r = await fc.callTool("memory_search", { query: "recall test flaky" });
      s.say("Await the index first. [[c1]]");
      s.end();
    }, [{ ...THREADS[0]!, id: undefined as unknown as string }, { ...THREADS[0]!, id: "t2", source: "some-cli" }]);
    user("How did I fix that flaky recall test in Codex?");
    await partner.idle();
    expect(r.conversations.every((c: any) => !c.ref)).toBe(true);
    expect(channel().some((e) => e.kind === "memory_recalled")).toBe(false);
    expect((channel().find((e) => e.kind === "ai_msg")!.body as Bodies["ai_msg"]).text).toBe("Await the index first.");
  });

  test("no mark: no line; a mark for a ref nobody returned: no line, and no mark shown", async () => {
    let turns = 0;
    const { partner, user, channel } = setup(async (_i, s) => {
      s.say(turns++ === 0 ? "5432." : "Friday. [[m3]]");
      s.end();
    });
    user("Postgres's default port?");
    await partner.idle();
    user("And the report?");
    await partner.idle();
    expect(channel().filter((e) => e.kind === "memory_recalled")).toEqual([]);
    expect(channel().filter((e) => e.kind === "ai_msg").map((e) => (e.body as Bodies["ai_msg"]).text)).toEqual(["5432.", "Friday."]);
  });

  test("at most one line a reply, and a mark said alone goes under the words before it", async () => {
    const { partner, user, fc, channel } = setup(async (_i, s) => {
      await fc.callTool("memory_search", { query: "周报 release" });
      s.say("周五下午发。");
      s.say("[[m2]]");
      s.say("另外发版记得改 CHANGELOG。[[m1]]");
      s.end();
    });
    user("周报和发版？");
    await partner.idle();
    const msgs = channel().filter((e) => e.kind === "ai_msg");
    const lines = channel().filter((e) => e.kind === "memory_recalled");
    expect(lines.length).toBe(1);
    expect((lines[0]!.body as Bodies["memory_recalled"]).aboutSeq).toBe(msgs[0]!.seq);
    expect(msgs.map((e) => (e.body as Bodies["ai_msg"]).text).join("\n")).not.toContain("[[");
  });
});
