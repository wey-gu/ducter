// D385: the hand-over sheet as data: sections by sort group, the find's line as separate facts (D291),
// the shapes offered (加进「…」 first), their lines, the plan's sections, a group's state, review's keep.
import { expect, test } from "bun:test";
import type { FoundItem, GroupHandView, HandHow, HandPlan } from "@ducter/protocol";
import { foundLine, quietBecause, readingChips, handState, oneRepoOf, planSections, planTasks, refLabel, refsLabel, reviewKeep, sections, setTicks, shapeChoices, shapeLine, suggestedShape } from "../src/handover-view.ts";
import { handoverWords } from "../src/i18n-handover.ts";

const fmt = (s: string, args: unknown[]) => {
  let i = 0;
  return s.replace(/%(?:\[(\d+)\])?[sd]/g, (_, n) => String(args[n ? Number(n) - 1 : i++]));
};
const tz = (k: string, ...a: unknown[]) => fmt(handoverWords.zh[k] ?? k, a);
const te = (k: string, ...a: unknown[]) => fmt(handoverWords.en[k] ?? k, a);

const item = (n: number, group: FoundItem["group"], by: FoundItem["by"] = "title"): FoundItem => ({ item: { source: "s", kind: "github", ref: `acme/mem#${n}`, label: `#${n}`, where: "acme/mem", title: `T${n}`, state: "open" }, group, why: "w", by });

test("sections follow do, decide, later, close and leave empty groups out", () => {
  const s = sections([item(1, "later"), item(2, "do"), item(3, "decide"), item(4, "do")]);
  expect(s.map((x) => x.group)).toEqual(["do", "decide", "later"]);
  expect(s[0]!.items.map((p) => p.item.label)).toEqual(["#2", "#4"]);
});

test("the find's line (D428): the head in their words, then what was ticked when not all, and the unsure ones; never joined", () => {
  expect(foundLine({ n: 5, subject: "UI/UX 问题走查", inTitle: 0, byLabel: 0, byMeaning: 5, within: 5, maybe: 1 }, tz, 4)).toEqual({ head: "找到 5 个讲「UI/UX 问题走查」的", facts: ["1 个不太确定，没勾"] });
  expect(foundLine({ n: 23, subject: "UI review", inTitle: 0, byLabel: 0, byMeaning: 23, cut: 13 }, te, 10)).toEqual({ head: "23 about “UI review”", facts: ["Ticked the 10 likeliest"] });
  expect(foundLine({ n: 0, inTitle: 0, byLabel: 0, byMeaning: 0 }, tz).head).toBe("没有新的可交");
  for (const f of foundLine({ n: 23, subject: "x", inTitle: 3, byLabel: 2, byMeaning: 4, cut: 13, maybe: 2 }, tz, 10).facts) expect(f).not.toContain("·");
});

test("the find's line (D454): one fact said back in its words; the ones already handed over said apart; a row's reason that repeats a chip left off", () => {
  const chip = { key: "person:100gle:assigned", kind: "person" as const, text: "100gle 分给你的", said: "100gle", by: "code" as const };
  expect(foundLine({ n: 4, inTitle: 0, byLabel: 0, byMeaning: 0, within: 4, handed: 1 }, tz, 4, [chip])).toEqual({ head: "100gle 分给你的，有 4 个", facts: ["1 个已经交出去了"] });
  expect(foundLine({ n: 4, inTitle: 0, byLabel: 0, byMeaning: 0, handed: 1 }, te, 4, [{ ...chip, text: "assigned by 100gle" }]).head).toBe("4 assigned by 100gle");
  expect(foundLine({ n: 0, inTitle: 0, byLabel: 0, byMeaning: 0, handed: 2 }, tz, 0, [chip])).toEqual({ head: "没有新的可交", facts: ["2 个已经交出去了"] });
  expect(quietBecause("100gle 分给你的", { about: "", by: "code", facets: [chip] })).toBe(true);
  expect(quietBecause("100gle 提的", { about: "", by: "code", facets: [chip] })).toBe(false);
});

test("the reading's chips (D428): every fact, the about last; the about alone is the words typed, so none", () => {
  const facets = [
    { key: "person:100gle:assigned", kind: "person" as const, text: "100gle 分给你的", said: "100gle", by: "code" as const },
    { key: "about", kind: "about" as const, text: "关于 UI 走查", said: "UI 走查", by: "code" as const },
  ];
  expect(readingChips({ about: "UI 走查", by: "code", facets }).map((c) => c.text)).toEqual(["100gle 分给你的", "关于 UI 走查"]);
  expect(readingChips({ about: "distill", by: "code", facets: [facets[1]!] })).toEqual([]);
  expect(readingChips(undefined)).toEqual([]);
});

const how = (o: Partial<HandHow> = {}): HandHow => ({ shape: "plan", shapes: ["plan", "one", "one_by_one", "side_by_side"], repo: "acme/mem", where: { device: "local", name: "Mac", why: "home" }, wheres: [], who: { why: "usual" }, whos: [], cap: 3, ...o });

test("shapes: add to a live group first and suggested; plan first always says you nod first; one to-do has none", () => {
  const h = how({ addTo: { groupId: "g", name: "记忆提炼", n: 4, planning: false } });
  expect(shapeChoices(h)).toEqual(["add", "plan", "one", "one_by_one", "side_by_side"]);
  expect(suggestedShape(h)).toBe("add");
  expect(suggestedShape(how())).toBe("plan");
  expect(shapeChoices(how({ shape: undefined, shapes: [] }))).toEqual([]);
  expect(shapeLine("plan", how(), tz, false)).toBe("你点头再做");
  expect(shapeLine("one_by_one", how(), tz, false)).toBe("在 acme/mem 里排着，每个从上一个的分支接着做");
  expect(shapeLine("side_by_side", how(), te, false)).toBe("3 at a time, a PR each");
  expect(shapeLine("one", how(), te, true)).toBe("One task that does them in order");
  expect(shapeLine("add", h, tz, false)).toBe("它正在做 4 个");
  // Never "一起做 / Together" for a shape (research/153: read as side by side).
  for (const k of ["ho.shape.plan", "ho.shape.one", "ho.shape.one_by_one", "ho.shape.side_by_side"]) {
    expect(handoverWords.zh[k]).not.toBe("一起做");
    expect(handoverWords.en[k]).not.toBe("Together");
  }
});

test("refs as the plan says them: #n in one repository, repo#n across several", () => {
  expect(refLabel("acme/mem#405", true)).toBe("#405");
  expect(refLabel("acme/mem#405", false)).toBe("mem#405");
  expect(refsLabel(["acme/mem#398", "acme/mem#412"], true)).toBe("#398 + #412");
  expect(oneRepoOf(["acme/mem#1", "acme/mem#2"])).toBe(true);
  expect(oneRepoOf(["acme/mem#1", "acme/web#2"])).toBe(false);
});

test("the plan's sections in the shapes' words, empty ones left out; Go opens one task per part", () => {
  const p: HandPlan = { fixed: [{ ref: "a/b#1", where: "PR #3" }], one: [{ id: "p1", refs: ["a/b#2", "a/b#4"], title: "", why: "" }], line: [], side: [{ id: "p2", refs: ["a/b#5"], title: "", why: "" }], later: [], limits: [], read: { n: 4 } };
  expect(planSections(p).map((s) => s.kind)).toEqual(["fixed", "one", "side"]);
  expect(planTasks(p)).toBe(2);
});

test("a hand-over group's state: planning, waiting for a look, held, going, review, sent", () => {
  const h = (o: Partial<GroupHandView>): GroupHandView => ({ shape: "plan", items: [], ...o });
  expect(handState(h({ plan: { taskId: "t", state: "planning" } }))).toBe("planning");
  expect(handState(h({ plan: { taskId: "t", state: "ready" } }))).toBe("ready");
  expect(handState(h({ plan: { taskId: "t", state: "held" } }))).toBe("held");
  expect(handState(h({ plan: { taskId: "t", state: "going" } }))).toBe("going");
  expect(handState(h({ shape: "side_by_side" }))).toBe("going");
  expect(handState(h({ review: "ready", plan: { taskId: "t", state: "going" } }))).toBe("review");
  expect(handState(h({ review: "sent" }))).toBe("sent");
  expect(handState(undefined)).toBeUndefined();
});

test("review together sends every to-do of the rows not left out; the set card carries its own ticks", () => {
  const row = (refs: string[]) => ({ items: refs.map((ref) => ({ source: "s", kind: "github" as const, ref, label: ref.slice(ref.indexOf("#")), title: ref })), comment: "x", close: false });
  expect(reviewKeep([row(["a#1", "a#2"]), row(["a#3"]), row(["a#4"])], new Set([1]))).toEqual(["a#1", "a#2", "a#4"]);
  // research/244 rule 9: a row with no merged PR of its own is never sent.
  expect(reviewKeep([{ ...row(["a#5"]), merged: false }, { ...row(["a#6"]), merged: true }], new Set())).toEqual(["a#6"]);
  const own = new Map<string, Set<string>>();
  expect([...setTicks("s1", ["a", "b"], own)]).toEqual(["a", "b"]);
  own.set("s1", new Set(["b"]));
  expect([...setTicks("s1", ["a", "b"], own)]).toEqual(["b"]);
});

test("the note placeholders fit one short line at 320 in both languages (D638)", () => {
  const han = (s: string) => [...s].filter((c) => /[\u3400-\u9fff]/.test(c)).length;
  for (const lang of ["zh", "en"] as const) {
    for (const key of ["ho.ask.ph", "ho.note.ph", "ho.item.note.ph"]) {
      const s = handoverWords[lang][key]!;
      // One line at 320 px: zh at most ~14 Han (and its punctuation), en at most 32 letters.
      expect(s).not.toContain("\n");
      expect(han(s)).toBeLessThanOrEqual(14);
      expect(s.length).toBeLessThanOrEqual(32);
      // No author's own world: no hard-coded computer, subject or product the person may not have.
      expect(s).not.toMatch(/haswell|memory distill|nowledge/i);
    }
  }
  // The link's words are still a link (the placeholder is its own key, never the link's).
  expect(handoverWords.zh["ho.item.note"]).toBe("给这个的话…");
  expect(handoverWords.en["ho.item.note"]).toBe("A note for this one…");
});

// research/244 rule 9: the review card names every item it will comment on, with the exact line each gets.
test("group review card lines: item, title and the exact comment per item", async () => {
  const { groupReviewLines } = await import("../src/todos.tsx");
  const item = (n: number, title: string) => ({ source: "s", kind: "github" as const, ref: `acme/mem#${n}`, label: `#${n}`, where: "acme/mem", title });
  const src = { kind: "group_review" as const, item: item(11108, "设置卡的标签"), items: [{ item: item(11108, "设置卡的标签"), text: "Fixed in #11163." }, { item: item(11156, "设置卡的滚动"), text: "Fixed in #11163." }] };
  expect(groupReviewLines(src)).toEqual([
    { ref: "acme/mem#11108", title: "设置卡的标签", text: "Fixed in #11163." },
    { ref: "acme/mem#11156", title: "设置卡的滚动", text: "Fixed in #11163." },
  ]);
});
