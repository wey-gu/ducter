// D444, D487, D490: "你都记得我些什么？" / "what do you know about me?" is answered from what Mem knows about
// the person (D321's set: their preferences, and the decisions and facts they saved or told the partner),
// which the session already holds (D487's block): no code reads the question's words (D490 retired
// ASKS_ABOUT_ME). A session that missed the block gets it with its first search. And 别记这个, taken back by
// Ducter, is said under their words.
import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LogEvent } from "../../protocol/src/index.ts";
import { createPartner } from "../src/index.ts";
import { aboutHits, type MemoryClient } from "../src/memory.ts";
import { renderTrigger, takenBackLine, type RenderCtx } from "../src/render.ts";
import { FakeClock, fakeCore, fakeMemory, fakeRunner, type Script } from "./fakes.ts";

const SEED = [
  { id: "m_week", title: "周报每周五下午发，发给产品组", content: "Weyl 说的：周报每周五下午发。", kind: "preference", source: "ducter" },
  { id: "m_pnpm", title: "JS 项目一律用 pnpm", content: "他所有 JS 项目都用 pnpm。", kind: "preference", source: "claude-code" },
  { id: "m_dec", title: "Ducter 词汇：伙伴不是上下级", content: "界面上不用批准/驳回。", kind: "decision", source: "ducter" },
  { id: "m_ccdec", title: "Use HawDB's WAL v2 format", content: "Claude Code's project decision.", kind: "decision", source: "claude-code" },
  { id: "m_ctx", title: "nowledge-co/mem#10358 working notes", content: "…", kind: "context", source: "codex" },
];

test("about the person: preferences from anyone; decisions and facts only theirs; never another tool's working notes", () => {
  expect(aboutHits(SEED.filter((m) => m.kind === "preference"), "preference").map((h) => h.title)).toEqual(["周报每周五下午发，发给产品组", "JS 项目一律用 pnpm"]);
  expect(aboutHits(SEED.filter((m) => m.kind === "decision"), "decision").map((h) => h.title)).toEqual(["Ducter 词汇：伙伴不是上下级"]);
  // A source Mem doesn't name (a pull request) is not about the person.
  expect(aboutHits([{ title: "x", source: "github-pr-123" }], "preference")).toEqual([]);
});

function setup(script: Script, wrap: (m: MemoryClient) => MemoryClient = (m) => m) {
  const clock = new FakeClock();
  const fc = fakeCore(clock, mkdtempSync(join(tmpdir(), "ducter-about-me-")));
  const inputs: string[] = [];
  const fr = fakeRunner(async (i, s, n) => {
    inputs.push(i);
    await script(i, s, n);
  });
  fr.bindCards(fc.cards);
  const mem = fakeMemory(SEED);
  const partner = createPartner(fc.core, fr.runner, { now: clock.now, persistState: false, onError: () => {}, memory: wrap(mem.memory) });
  const user = (text: string) => partner.onTrigger(fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text } }));
  return { fc, partner, user, mem, inputs };
}

test("asked what it knows about them: the session already holds it, with how to say it; no second read", async () => {
  let r: any;
  const { partner, user, fc, mem, inputs } = setup(async (_i, s) => {
    r = await fc.callTool("memory_search", { query: "me" });
    s.say("你周报是周五下午发给产品组的，JS 项目只用 pnpm。哪条不对、或者不想让我记着，跟我说一声就好。");
    s.end();
  });
  user("你都记得我些什么？");
  await partner.idle();
  expect(mem.abouts.length).toBe(1); // D487: the session's own read, whatever the words
  expect(inputs[0]).toContain("周报每周五下午发，发给产品组");
  expect(inputs[0]).toContain("Ducter 词汇：伙伴不是上下级");
  expect(inputs[0]).not.toContain("Use HawDB's WAL v2 format");
  expect(inputs[0]).toMatch(/at most three short sentences/);
  expect(inputs[0]).not.toContain("m_week"); // never Mem's id
  expect(r.whatTheyToldYouBefore).toBeUndefined();
  expect(r.searchesLeftThisTurn).toBe(1);
});

test("a session that missed it (Mem away at its first turn): its first search carries it, once", async () => {
  const rs: any[] = [];
  let first = true;
  const { partner, user, fc, inputs } = setup(
    async (_i, s) => {
      rs.push(await fc.callTool("memory_search", { query: "me" }));
      rs.push(await fc.callTool("memory_search", { query: "周报" }));
      s.end();
    },
    (m) => ({ ...m, about: () => (first ? ((first = false), Promise.resolve({ ok: false as const, reason: "unavailable" as const, message: "away" })) : m.about!()) }),
  );
  user("你都记得我些什么？");
  await partner.idle();
  expect(inputs[0]).not.toContain("周报每周五下午发");
  expect(rs[0].whatTheyToldYouBefore).toContain("周报每周五下午发，发给产品组");
  expect(rs[0].whatTheyToldYouBefore).toMatch(/at most three short sentences/);
  expect(rs[1].whatTheyToldYouBefore).toBeUndefined();
  expect(rs[1].searchesLeftThisTurn).toBe(0);
});

test("a refused 别记这个: the partner gets the one fact that it was not taken back, never 不记了", () => {
  const e = { seq: 9, ts: "2026-11-21T10:00:00.000Z", persona: "p", stream: "channel", origin: "user", kind: "user_msg", body: { text: "别记这个" } } as LogEvent;
  const ctx = { takenBack: (seq: number) => (seq === 9 ? [{ title: "commit message 用英文", failed: true as const }] : []), taskTitle: () => undefined, decision: () => undefined } as unknown as RenderCtx;
  const line = renderTrigger(e, ctx);
  expect(line).toContain("[the memory was not taken back]");
  expect(line).toContain("commit message 用英文");
  expect(line).not.toContain("already took back");
  expect(line).not.toContain("好，不记了");
  expect(line).toMatch(/still kept/);
  // Both facts, when Mem took one back and refused another.
  expect(takenBackLine([{ title: "a" }, { title: "b", failed: true }])).toContain("already took back");
  expect(takenBackLine([{ title: "a" }, { title: "b", failed: true }])).toContain("[the memory was not taken back]");
});

test("别记这个: the partner sees under their words what Ducter took back", () => {
  const e = { seq: 9, ts: "2026-11-21T10:00:00.000Z", persona: "p", stream: "channel", origin: "user", kind: "user_msg", body: { text: "算了，别记这个" } } as LogEvent;
  const ctx = { takenBack: (seq: number) => (seq === 9 ? [{ title: "commit message 用英文" }] : []), taskTitle: () => undefined, decision: () => undefined } as unknown as RenderCtx;
  const line = renderTrigger(e, ctx);
  expect(line).toContain("[user] 算了，别记这个");
  expect(line).toContain(takenBackLine([{ title: "commit message 用英文" }]));
  expect(line).toMatch(/No memory tool/);
  expect(renderTrigger({ ...e, seq: 10 } as LogEvent, ctx)).not.toContain("took back");
});
