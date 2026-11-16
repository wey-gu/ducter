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

function setup(script: Script) {
  const clock = new FakeClock();
  const fc = fakeCore(clock, mkdtempSync(join(tmpdir(), "ducter-recall-src-")));
  const fr = fakeRunner(script);
  fr.bindCards(fc.cards);
  const mem = fakeMemory(SEED);
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
