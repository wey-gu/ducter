// D379: who does which work, said by the person and never saved as a rule, holds without them
// saying it again: read by code from their words (the Log) and recalled memories; it decides a
// task only when explicit (an agent, a directive, a kind of work); asked once to keep it.
import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import type { Bodies, DeviceHarness, Settings } from "@ducter/protocol";
import { chooseBody } from "../src/candidates.ts";
import { neverPick, saidPick } from "../src/loadout.ts";
import { openLog } from "../src/log.ts";
import { openRules } from "../src/rules.ts";
import { keepSaidAtOnce, keepSaidOnGo, openSaid, readSaid } from "../src/said.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => void)[] = [];
afterEach(() => {
  for (const s of stops.reverse()) s();
  stops = [];
});

const cc: DeviceHarness = { harness: "claude-code", installed: true, loggedIn: true, canBePartner: true, billing: "plan", models: [{ id: "opus", label: "Opus" }, { id: "sonnet", label: "Sonnet" }] };
const cx: DeviceHarness = { harness: "codex", installed: true, loggedIn: true, canBePartner: true, billing: "plan" };
const settings: Pick<Settings, "brain" | "taskAccounts"> = { brain: { harness: "claude-code", model: "opus" } };

function home() {
  const { dir, cleanup } = tempDir();
  const log = openLog({ path: join(dir, "log.db"), persona: "default" });
  const rules = openRules(dir);
  const said = openSaid({ log, rules, dataDir: dir });
  stops.push(cleanup, () => log.close?.());
  const say = (text: string) => log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text } });
  return { dir, log, rules, said, say };
}

test("readSaid: explicit never and always, with the kind of work, in the person's words", () => {
  expect(readSaid("对了，请你记住，订酒店等生活相关的工作别用 claude code 哈")).toEqual([{ harness: "claude-code", never: true, kinds: ["errand"], quote: "订酒店等生活相关的工作别用 claude code" }]);
  expect(readSaid("以后写代码都用 Codex。")).toMatchObject([{ harness: "codex", never: false, kinds: ["code"] }]);
  expect(readSaid("Don't use Claude Code for hotel bookings.")).toMatchObject([{ harness: "claude-code", never: true, kinds: ["errand"] }]);
  expect(readSaid("The user prefers not to use Claude Code for booking flights")).toMatchObject([{ harness: "claude-code", never: true, kinds: ["errand"] }]);
  expect(readSaid("From now on, always use Codex for coding")).toMatchObject([{ harness: "codex", never: false, kinds: ["code"] }]);
  // As memories phrase it (the shapes a real Mem keeps, research/142's case).
  expect(readSaid("订酒店等生活相关的工作不要使用 Claude Code。")).toMatchObject([{ harness: "claude-code", never: true, kinds: ["errand"] }]);
  expect(readSaid("生活相关的事不用 Claude Code")).toMatchObject([{ harness: "claude-code", never: true, kinds: ["errand"] }]);
  // A routing habit with no always/never word stays a taste.
  expect(readSaid("Offload verification and CI log reading to Codex to save Claude credits")).toEqual([]);
  // The whole clause, up to 90 characters; a longer one is clipped at a word, never inside one.
  expect(readSaid("By the way, remember: don't use Claude Code for booking hotels and other everyday errands")[0]!.quote).toBe("don't use Claude Code for booking hotels and other everyday errands");
  const long = readSaid("Never use Claude Code for booking hotels and flights and trains and restaurants and concert tickets and museum passes and the like")[0]!.quote;
  expect([...long].length).toBeLessThanOrEqual(90);
  expect(long).toMatch(/ [a-z]+…$/);
  // "Claude Code" alone is not code work.
  expect(readSaid("别用 Claude Code 订机票")[0]!.kinds).toEqual(["errand"]);
});

test("readSaid: a taste, a one-off, a question, or no kind of work is never a preference", () => {
  for (const vague of [
    "I like Codex",
    "我挺喜欢 Codex 的",
    "Codex is great for coding",
    "这次用 Codex 订酒店吧",
    "Use Codex for this one",
    "订酒店要不要别用 Claude Code？",
    "别用 Claude Code 了吗？",
    "别用 claude code",
    "我平时写代码都用 codex",
    "订酒店的事你自己看着办",
  ])
    expect(readSaid(vague)).toEqual([]);
});

test("a never said in the conversation decides an errand; code is untouched; asked once", () => {
  const h = home();
  h.say("对了，请你记住，订酒店等生活相关的工作别用 claude code 哈");
  h.say("好的");
  const rules = h.said.rulesFor("errand");
  expect(rules).toMatchObject([{ harness: "claude-code", never: true, kinds: ["errand"], text: "订酒店等生活相关的工作别用 claude code" }]);
  expect(h.said.rulesFor("code")).toEqual([]);
  expect(h.said.rulesFor(undefined)).toEqual([]);

  const input = { work: { title: "北京往返大阪", kind: "errand" as const }, harnesses: [cc, cx], settings };
  const pick = saidPick(chooseBody({ ...input, rules }), () => chooseBody({ ...input, rules: [] }), rules);
  expect(pick).toMatchObject({ harness: "codex", why: { kind: "said", text: "订酒店等生活相关的工作别用 claude code", said: { harness: "claude-code", never: true, kinds: ["errand"] } } });
  // The partner's pin that follows the saying (it recalled it): the same, said with their words.
  const pinned = { ...input, pinned: { harness: "codex" } };
  expect(saidPick(chooseBody({ ...pinned, rules }), () => chooseBody({ ...input, rules: [] }), rules)).toMatchObject({ harness: "codex", why: { kind: "said" } });
  // Where it changes nothing (no Claude Code here), nothing is said.
  const only = { work: input.work, harnesses: [cx], settings };
  expect(saidPick(chooseBody({ ...only, rules }), () => chooseBody({ ...only, rules: [] }), rules)).toMatchObject({ harness: "codex", why: { kind: "default" } });
});

test("answered once, never again: Go keeps it as a rule; 只这次 stops it; a newer saying counts again", () => {
  const h = home();
  stops.push(keepSaidOnGo(h.log, h.rules));
  h.say("订酒店这类别用 Claude Code");
  const s = { key: "said:1", harness: "claude-code", never: true as const, kinds: ["errand" as const], quote: "订酒店这类别用 Claude Code" };
  const ask = (id: string) => h.log.append({ stream: "channel", origin: "partner", kind: "decision", body: { decisionId: id, question: "?", goLabel: "记成规则", defaultOption: "hold", reversible: false, saying: s } as Bodies["decision"] });
  ask("d_1");
  expect(h.said.asked(s)).toBe(true);
  // Waiting for the answer: it still holds.
  expect(h.said.rulesFor("errand")).toHaveLength(1);
  h.log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: "d_1", option: "go", by: "user" } as Bodies["decision_resolved"] });
  expect(h.rules.list()).toMatchObject([{ harness: "claude-code", never: true, kinds: ["errand"], text: "订酒店这类别用 Claude Code" }]);
  expect(h.said.rulesFor("errand")).toEqual([]);
  // Removed on the Partner page: the old saying doesn't come back by itself.
  h.rules.remove(h.rules.list()[0]!.id);
  expect(h.said.rulesFor("errand")).toEqual([]);
});

test("只这次 keeps nothing and stops it; a saved rule newer than the saying decides instead", async () => {
  const h = home();
  stops.push(keepSaidOnGo(h.log, h.rules));
  h.say("Don't use Claude Code for hotel bookings.");
  h.log.append({ stream: "channel", origin: "partner", kind: "decision", body: { decisionId: "d_2", question: "?", goLabel: "Keep", defaultOption: "hold", reversible: false, saying: { key: "said:1", harness: "claude-code", never: true, kinds: ["errand"], quote: "x" } } as Bodies["decision"] });
  h.log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: "d_2", option: "hold", by: "user" } as Bodies["decision_resolved"] });
  expect(h.rules.list()).toEqual([]);
  expect(h.said.rulesFor("errand")).toEqual([]);

  const g = home();
  g.say("以后订机票都用 Codex");
  await Bun.sleep(5);
  g.rules.add({ text: "跑腿的事 → Claude Code", harness: "claude-code", match: [], kinds: ["errand"] });
  expect(g.said.rulesFor("errand")).toEqual([]);
});

test("the newest saying per agent wins, and only the newest agent named to do it", async () => {
  const h = home();
  h.say("以后订酒店都用 Codex");
  await Bun.sleep(5);
  h.say("以后订酒店都用 pi");
  await Bun.sleep(5);
  h.say("订酒店别用 Claude Code");
  const r = h.said.rulesFor("errand");
  expect(r.map((x) => [x.harness, !!x.never])).toEqual([["pi", false], ["claude-code", true]]);
});

test("recalled memories: an explicit one is kept and holds; a vague one never is", () => {
  const h = home();
  h.said.fromMemory([
    { id: "m-1", title: "Booking preference", content: "The user said: never use Claude Code for hotel or flight bookings.", date: "2026-11-01" },
    { id: "m-2", title: "Likes Codex", content: "The user likes Codex.", date: "2026-11-02" },
  ]);
  expect(h.said.rulesFor("errand")).toMatchObject([{ id: "mem:m-1", harness: "claude-code", never: true }]);
  expect(h.said.all().some((p) => p.key.startsWith("mem:m-2"))).toBe(false);
  // Kept across a restart.
  const again = openSaid({ log: h.log, rules: h.rules, dataDir: h.dir });
  expect(again.rulesFor("errand")).toHaveLength(1);
});

test("someone else's words passed on are not the person's preference", () => {
  const h = home();
  h.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "订酒店别用 Claude Code", forwarded: { from: "Mia" } } });
  expect(h.said.rulesFor("errand")).toEqual([]);
});

// D401: hel, 2026-11-18: said at 14:29, the booking at 14:52 still went to Claude Code, and the rule
// came at 14:53 only behind a Go card. Now the person's words are their rule the moment they land.
test("said in the conversation: kept as the person's rule at once, before the partner's turn, with no card", () => {
  const h = home();
  stops.push(keepSaidAtOnce(h.log, h.said));
  const e = h.say("对了，请你记住，订酒店等生活相关的工作别用 claude code 哈");
  expect(h.rules.list()).toMatchObject([{ harness: "claude-code", never: true, kinds: ["errand"], text: "订酒店等生活相关的工作别用 claude code" }]);
  expect(h.said.keptFrom(e.seq)).toHaveLength(1);
  // Kept, so it is no longer a provisional saying (no card will ask about it).
  expect(h.said.rulesFor("errand")).toEqual([]);
  // The next errand goes by the rule, and says so with their words.
  const input = { work: { title: "订北京往返机票和朗丽兹一晚", kind: "errand" as const }, harnesses: [cc, cx], settings };
  const rules = h.rules.list();
  const pick = chooseBody({ ...input, rules })!;
  expect(pick).toMatchObject({ harness: "codex" });
  expect(neverPick(pick as never, () => chooseBody({ ...input, rules: [] }) as never, rules, input.work)).toMatchObject({ harness: "codex", why: { kind: "rule", text: "订酒店等生活相关的工作别用 claude code" } });
  // Code is untouched, and says nothing about the rule.
  const code = { work: { title: "修 CI", kind: "code" as const }, harnesses: [cc, cx], settings };
  const cp = chooseBody({ ...code, rules })!;
  expect(neverPick(cp as never, () => chooseBody({ ...code, rules: [] }) as never, rules, code.work).why.kind).not.toBe("rule");
});

test("kept once: removed on the Partner page it stays removed; said again, it is kept again", () => {
  const h = home();
  stops.push(keepSaidAtOnce(h.log, h.said));
  h.say("Don't use Claude Code for hotel bookings.");
  expect(h.rules.list()).toHaveLength(1);
  h.rules.remove(h.rules.list()[0]!.id);
  expect(h.said.backfill()).toEqual([]);
  expect(h.said.rulesFor("errand")).toEqual([]);
  // Across a restart too.
  expect(openSaid({ log: h.log, rules: h.rules, dataDir: h.dir }).backfill()).toEqual([]);
  h.say("Again: don't use Claude Code for hotel bookings.");
  expect(h.rules.list()).toHaveLength(1);
});

test("a taste, a one-off or someone else's words keep no rule", () => {
  const h = home();
  stops.push(keepSaidAtOnce(h.log, h.said));
  h.say("我挺喜欢 Codex 的");
  h.say("这次用 Codex 订酒店吧");
  h.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "订酒店别用 Claude Code", forwarded: { from: "Mia" } } });
  expect(h.rules.list()).toEqual([]);
});

test("said before Ducter kept sayings at once: kept when it starts, unless answered on a card or a newer rule covers it", async () => {
  const h = home();
  h.say("订酒店等生活相关的工作别用 claude code 哈");
  h.say("以后写代码都用 Codex。");
  // hel's own later rule (words only, no kind): it doesn't cover the kind, so the never is kept too.
  await Bun.sleep(5);
  h.rules.add({ text: "查机票和酒店 → Codex", harness: "codex", match: ["机票", "酒店"] });
  const kept = h.said.backfill();
  expect(kept.map((r) => [r.harness, !!r.never, r.kinds])).toEqual([["claude-code", true, ["errand"]], ["codex", false, ["code"]]]);
  expect(h.said.backfill()).toEqual([]);

  // A newer rule for the kind is the person's newer word; a 只这次 on a D379 card is their answer.
  const g = home();
  g.say("以后订机票都用 Codex");
  await Bun.sleep(5);
  g.rules.add({ text: "跑腿的事 → Claude Code", harness: "claude-code", match: [], kinds: ["errand"] });
  expect(g.said.backfill()).toEqual([]);
  const k = home();
  k.say("Don't use Claude Code for hotel bookings.");
  k.log.append({ stream: "channel", origin: "partner", kind: "decision", body: { decisionId: "d_9", question: "?", goLabel: "Keep", defaultOption: "hold", reversible: false, saying: { key: "said:1", harness: "claude-code", never: true, kinds: ["errand"], quote: "x" } } as Bodies["decision"] });
  k.log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: "d_9", option: "hold", by: "user" } as Bodies["decision_resolved"] });
  expect(k.said.backfill()).toEqual([]);
});
