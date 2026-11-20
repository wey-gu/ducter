// D428: the hand-over's finder reads the sentence's facts against the pile (who, whose, where, which
// number, since when), filters by them, and sends only what is left to meaning; chips for every fact;
// a name the pile doesn't have is said and ticks nothing; at most TICK_MAX ticked. On the eval pile
// (research/178: the author's real shape) and the author's own two sentences.
import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TICK_MAX } from "@ducter/protocol";
import { createHandover } from "../src/task-sources/handover.ts";
import { aboutTokens, chips, closestLogins, filterBy, labelHit, labelTokens, parseRead, pileFacts, readFacets, titleHas } from "../src/task-sources/find.ts";
import { evalPile, ME, NOW } from "../eval/find/pile.ts";
import { SENTENCES } from "../eval/find/sentences.ts";
import { findBefore } from "../eval/find/before.ts";

const pile = evalPile();
const facts = pileFacts(pile, { me: ME, now: NOW });
const GLE = ["nowledge-co/mem#10694", "nowledge-co/mem#10691", "nowledge-co/mem#10688", "nowledge-co/mem#10559", "nowledge-co/mem#10482"];

test("the eval pile has the real shape: 557 open, 100gle's five, the bot by its login", () => {
  expect(pile.length).toBe(557);
  expect(pile.filter((p) => p.item.author === "100gle").map((p) => p.item.ref).sort()).toEqual([...GLE].sort());
  expect(pile.filter((p) => (p.item.labels ?? []).includes("UI/UX design")).length).toBe(70);
  expect(facts.people.get("100gle")).toMatchObject({ login: "100gle", opened: 5, assigned: 5 });
});

test("the author's first sentence: 100gle stays a login (never \"gle\"), assigned by him, the rest is what it is about", () => {
  const r = readFacets("100gle 分配给我的 UI/UX 的问题走查的修改 task", facts);
  expect(r.facets.map((x) => x.kind === "person" ? `${x.login}:${x.role}` : x.kind)).toEqual(["100gle:assigned"]);
  expect(r.about).toBe("UI/UX 问题走查");
  expect(r.unknown).toEqual([]);
  expect(filterBy(pile, r.facets, facts).map((p) => p.item.ref).sort()).toEqual([...GLE].sort());
  expect(chips(r.facets, r.about, "zh", facts).map((c) => c.text)).toEqual(["100gle 分给你的", "关于 UI/UX 问题走查"]);
});

test("the author's second sentence: 他…发现的 is 100gle again, as the one who opened them; the words between stay", () => {
  const r = readFacets("100gle 分配给我的那些他 UI 走查发现", facts);
  expect(r.facets.map((x) => x.kind === "person" ? `${x.login}:${x.role}` : x.kind)).toEqual(["100gle:assigned", "100gle:opened"]);
  expect(r.about).toBe("UI 走查");
  expect(chips(r.facets, r.about, "zh", facts).map((c) => c.text)).toEqual(["100gle 分给你的", "100gle 提的", "关于 UI 走查"]);
  // 其他 is not 他.
  expect(readFacets("100gle 提的其他 UI 问题", facts).facets.filter((x) => x.kind === "person").length).toBe(1);
});

test("people, the person, numbers, repositories, times, pull requests, labels: only what the pile holds", () => {
  const kinds = (s: string) => readFacets(s, facts).facets.map((x) => (x.kind === "person" ? `${x.login}:${x.role}` : x.kind === "since" ? `since:${x.days}:${x.field}` : x.kind === "repo" ? `repo:${x.repo}` : x.kind === "ref" ? `#${x.n}` : x.kind === "mine" ? `mine:${x.role}` : x.kind === "label" ? `label:${x.label}` : x.kind));
  expect(kinds("everything assigned to me by hawkingrei")).toEqual(["hawkingrei:assigned"]);
  expect(kinds("issues opened by QingZ11 about search")).toEqual(["QingZ11:opened"]);
  expect(kinds("negret1986 和 Icemap 提的")).toEqual(["negret1986:opened", "Icemap:opened"]);
  expect(kinds("我自己提的关于蒸馏的")).toEqual(["mine:opened"]);
  expect(kinds("最近一周提的 Windows 问题")).toEqual(["since:7:created"]);
  expect(kinds("distillation issues updated in the last week")).toEqual(["since:7:updated"]);
  expect(kinds("mem-feedback 里的")).toEqual(["repo:nowledge-co/mem-feedback"]);
  expect(kinds("the PRs in mem")).toEqual(["repo:nowledge-co/mem", "pr"]);
  expect(kinds("#10559 和 #10482")).toEqual(["#10559", "#10482"]);
  expect(kinds("技能分享相关的 标签 component/skills-sharing")).toEqual(["label:component/skills-sharing"]);
  expect(kinds("bugdrop reports about the desktop app")).toEqual(["neonwatty-bugdrop[bot]:any"]);
  // A number in "7 天" is a time, never a to-do's number; a word is never a login.
  expect(kinds("最近 7 天的")).toEqual(["since:7:updated"]);
  expect(kinds("UI design issues")).toEqual([]);
  // Calendar points: since last month's 1st (2026-11-20 → 1 October: 51 days), said in their words.
  const m = readFacets("上个月以来更新过的会话同步问题", facts);
  expect(m.facets[0]).toMatchObject({ kind: "since", days: 51, field: "updated" });
  expect(chips(m.facets, m.about, "zh", facts).map((c) => c.text)).toEqual(["上个月以来有动静的", "关于 会话同步"]);
});

test("a name the pile doesn't have is said with the closest logins, never read as words", () => {
  const r = readFacets("100gel 提的", facts);
  expect(r.unknown).toEqual([{ said: "100gel", closest: ["100gle"] }]);
  expect(r.about).toBe("");
  expect(closestLogins("hawkingre", facts)).toEqual(["hawkingrei"]);
});

test("a label counts only as a whole word (never \"ui\" inside \"build\"), and only as a maybe", () => {
  expect(labelTokens("UI/UX design")).toEqual(expect.arrayContaining(["ui/ux design", "ui/ux", "ui", "ux", "design"]));
  expect(labelHit(["component/build", "guide"], aboutTokens("UI 走查"))).toBeUndefined();
  expect(labelHit(["component/ui"], aboutTokens("UI 走查"))).toBe("component/ui");
  expect(titleHas("Rebuild the guide page", aboutTokens("ui"))).toBe(false);
  expect(titleHas("Sign-in loops back", aboutTokens("sign-in and SSO"))).toBe(true);
});

test("the model's reading keeps only the pile's own values", () => {
  const got = parseRead('{"people":[{"login":"QINGZ11","role":"assigned"},{"login":"nobody"}],"repos":["nowledge-co/community","x/y"],"labels":["type/bug","made-up"],"since_days":30,"since":"created","unknown":["小王"]}', facts, "QingZ11 分给我的 community 里标签 type/bug 的")!;
  expect(got.facets).toEqual([
    { kind: "person", login: "QingZ11", role: "assigned", said: "", by: "model" },
    { kind: "repo", repo: "nowledge-co/community", said: "", by: "model" },
    { kind: "label", label: "type/bug", said: "", by: "model" },
    { kind: "since", days: 30, field: "created", said: "", by: "model" },
  ]);
  expect(got.unknown).toEqual([{ said: "小王", closest: [] }]);
});

/** A careful fake of the cheapest model: sure about the rows whose title or labels say the about words' topic. */
function fakeAsk() {
  const calls = { meaning: 0, read: 0, rows: 0 };
  const ask = async (prompt: string) => {
    if (prompt.includes("<logins>")) return calls.read++, { text: "{}", tokens: 1 };
    calls.meaning++;
    const about = /<about>([\s\S]*?)<\/about>/.exec(prompt)![1]!;
    const rows = JSON.parse(/<todos>\n([\s\S]*)\n<\/todos>/.exec(prompt)![1]!) as { id: number; title: string; labels?: string[] }[];
    calls.rows += rows.length;
    const ui = /ui|走查|界面/i.test(about);
    return { text: JSON.stringify({ found: rows.filter((r) => (ui ? (r.labels ?? []).includes("UI/UX design") : new RegExp(about, "i").test(r.title))).map((r) => ({ id: r.id, sure: /about setting/.test(r.title) ? "maybe" : "high", why: "UI 走查里提的" })) }), tokens: 1 };
  };
  return { ask, calls };
}
function ho(ask?: ReturnType<typeof fakeAsk>["ask"]) {
  return createHandover({ dataDir: mkdtempSync(join(tmpdir(), "ducter-find-")), pile: { all: () => pile, model: () => ask, sortedAt: () => "s1" }, now: () => NOW, lang: () => "zh", name: () => "Ducter", me: () => ME, changed: () => {} } as never);
}

test("the author's sentence: the five, a reason each, the sure ones ticked, the chips, meaning read over 5 rows (not 557)", async () => {
  const f = fakeAsk();
  const r = await ho(f.ask).find({ words: "100gle 分配给我的 UI/UX 的问题走查的修改 task" });
  expect(r.items.map((p) => p.item.ref).sort()).toEqual([...GLE].sort());
  expect(f.calls.rows).toBe(5);
  expect(r.items.every((p) => p.because === "UI 走查里提的")).toBe(true);
  expect(r.ticked.sort()).toEqual(GLE.filter((x) => x !== "nowledge-co/mem#10688").sort()); // the unsure one shown, not ticked
  expect(r.found).toMatchObject({ n: 5, subject: "UI/UX 问题走查", within: 5, maybe: 1 });
  expect(r.said?.facets?.map((c) => c.text)).toEqual(["100gle 分给你的", "关于 UI/UX 问题走查"]);
});

test("dropping a chip finds again without it; a name it doesn't know ticks nothing; past TICK_MAX only the likeliest are ticked", async () => {
  const h = ho(fakeAsk().ask);
  const all = await h.find({ words: "100gle 分配给我的 UI/UX 的问题走查的修改 task", drop: ["person:100gle:assigned"] });
  expect(all.items.length).toBe(70); // every UI/UX one, by anyone
  expect(all.ticked.length).toBe(TICK_MAX);
  expect(all.found.cut).toBe(all.items.filter((p) => p.sure === "high" && p.group === "do").length - TICK_MAX); // the about alone left: a kind of thing, the do ones
  expect(all.said?.dropped).toEqual(["person:100gle:assigned"]);
  const typo = await h.find({ words: "100gel 提的" });
  expect(typo.ticked).toEqual([]);
  expect(typo.said?.unknown).toEqual([{ said: "100gel", closest: ["100gle"] }]);
  // Facts alone (nothing about): every one they leave, no model call.
  const f = fakeAsk();
  const only = await ho(f.ask).find({ words: "hawkingrei 提的" });
  expect(only.items.length).toBe(14);
  expect(only.ticked.length).toBe(TICK_MAX);
  expect(only.items[0]!.because).toBe("hawkingrei 提的");
  expect(f.calls.meaning).toBe(0);
});

test("research/178: code alone (no model) beats 0.1.1 on every sentence's ticked set", async () => {
  let before = { hit: 0, n: 0 };
  let after = { hit: 0, n: 0 };
  const h = ho(undefined);
  for (const s of SENTENCES) {
    const gold = new Set(pile.filter((p) => s.gold(p)).map((p) => p.item.ref));
    const b = await findBefore(s.words, pile, s.lang);
    const a = await h.find({ words: s.words });
    before = { hit: before.hit + b.ticked.filter((r) => gold.has(r)).length, n: before.n + b.ticked.length };
    after = { hit: after.hit + a.ticked.filter((r) => gold.has(r)).length, n: after.n + a.ticked.length };
  }
  expect(before.hit / before.n).toBeLessThan(0.2);
  expect(after.hit / after.n).toBeGreaterThan(0.9);
});

test("a word before a CJK word that starts like a role is still a word (\"distill 记忆提炼\"), and a word the titles use is never an unknown person", () => {
  const r = readFacets("memory distill 记忆提炼", facts);
  expect(r.unknown).toEqual([]);
  expect(r.about).toBe("memory distill 记忆提炼");
  expect(readFacets("search 提的", facts).unknown).toEqual([]);
});
