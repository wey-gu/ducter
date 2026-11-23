// D444: "你都记得我些什么？" / "what do you know about me?" is answered from what Mem knows about the
// person (D321's set: their preferences, and the decisions and facts they saved or told the partner),
// not from a semantic search for "me"; and 别记这个, taken back by Ducter, is said under their words.
import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LogEvent } from "../../protocol/src/index.ts";
import { createPartner } from "../src/index.ts";
import { aboutHits } from "../src/memory.ts";
import { ASKS_ABOUT_ME } from "../src/partner.ts";
import { renderTrigger, takenBackLine, type RenderCtx } from "../src/render.ts";
import { FakeClock, fakeCore, fakeMemory, fakeRunner, type Script } from "./fakes.ts";

const SEED = [
  { id: "m_week", title: "周报每周五下午发，发给产品组", content: "Weyl 说的：周报每周五下午发。", kind: "preference", source: "ducter" },
  { id: "m_pnpm", title: "JS 项目一律用 pnpm", content: "他所有 JS 项目都用 pnpm。", kind: "preference", source: "claude-code" },
  { id: "m_dec", title: "Ducter 词汇：伙伴不是上下级", content: "界面上不用批准/驳回。", kind: "decision", source: "ducter" },
  { id: "m_ccdec", title: "Use HawDB's WAL v2 format", content: "Claude Code's project decision.", kind: "decision", source: "claude-code" },
  { id: "m_ctx", title: "nowledge-co/mem#10358 working notes", content: "…", kind: "context", source: "codex" },
];

test("the words that ask what it knows about them", () => {
  for (const s of ["你都记得我些什么？", "你了解我多少", "你对我有多少了解", "你都知道我什么", "What do you know about me?", "What do you actually know about me?", "how well do you know me", "What have you learned about me so far?"]) expect([s, ASKS_ABOUT_ME.test(s)]).toEqual([s, true]);
  for (const s of ["你记得上次那个 PR 吗", "我都记得什么来着", "what do you know about Rust lifetimes?", "周报哪天发？"]) expect([s, ASKS_ABOUT_ME.test(s)]).toEqual([s, false]);
});

test("about the person: preferences from anyone; decisions and facts only theirs; never another tool's working notes", () => {
  expect(aboutHits(SEED.filter((m) => m.kind === "preference"), "preference").map((h) => h.title)).toEqual(["周报每周五下午发，发给产品组", "JS 项目一律用 pnpm"]);
  expect(aboutHits(SEED.filter((m) => m.kind === "decision"), "decision").map((h) => h.title)).toEqual(["Ducter 词汇：伙伴不是上下级"]);
  // A source Mem doesn't name (a pull request) is not about the person.
  expect(aboutHits([{ title: "x", source: "github-pr-123" }], "preference")).toEqual([]);
});

function setup(script: Script) {
  const clock = new FakeClock();
  const fc = fakeCore(clock, mkdtempSync(join(tmpdir(), "ducter-about-me-")));
  const fr = fakeRunner(script);
  fr.bindCards(fc.cards);
  const mem = fakeMemory(SEED);
  const partner = createPartner(fc.core, fr.runner, { now: clock.now, persistState: false, onError: () => {}, memory: mem.memory });
  const user = (text: string) => partner.onTrigger(fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text } }));
  return { fc, partner, user, mem };
}

test("asked what it knows about them: memory_search answers with aboutYou and how to say it", async () => {
  let r: any;
  const { partner, user, fc, mem } = setup(async (_i, s) => {
    r = await fc.callTool("memory_search", { query: "me" });
    s.say("你周报是周五下午发给产品组的，JS 项目只用 pnpm。哪条不对、或者不想让我记着，跟我说一声就好。");
    s.end();
  });
  user("你都记得我些什么？");
  await partner.idle();
  // D487: one read for what the session is given, one for the answer.
  expect(mem.abouts.length).toBe(2);
  expect(r.aboutYou.map((x: { title: string }) => x.title)).toEqual(["周报每周五下午发，发给产品组", "JS 项目一律用 pnpm", "Ducter 词汇：伙伴不是上下级"]);
  expect(JSON.stringify(r)).not.toContain("m_week"); // never Mem's id
  expect(r.note).toMatch(/at most three short sentences/);
  expect(r.note).toMatch(/Never a list, a count/);
  expect(r.results).toBeUndefined();
});

test("any other question: no aboutYou, the search as before", async () => {
  let r: any;
  const { partner, user, fc, mem } = setup(async (_i, s) => {
    r = await fc.callTool("memory_search", { query: "周报" });
    s.say("周五下午。");
    s.end();
  });
  user("周报哪天发？");
  await partner.idle();
  expect(mem.abouts.length).toBe(1); // D487: only the session's own read
  expect(r.aboutYou).toBeUndefined();
  expect(r.results.length).toBeGreaterThan(0);
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
