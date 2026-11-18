// D372: the kind of work picks who does it. Errands (booking, comparing prices, forms) go to a
// fast tier the table knows, code stays on the smartest; rules can name a kind and say "never";
// the first errand routed by default is marked once; a fast errand that fails or stalls carries
// on on the smartest, once, by itself.
import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import type { Bodies, DeviceHarness, LogEvent, RuleView, Settings } from "@ducter/protocol";
import { chooseBody, fwCandidates, kindDefaults, kindOf, smartestFor } from "../src/candidates.ts";
import { createKindRetry } from "../src/kind-retry.ts";
import { openLog } from "../src/log.ts";
import { neverFor, openRules, ruleFor } from "../src/rules.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => void)[] = [];
afterEach(() => {
  for (const s of stops.reverse()) s();
  stops = [];
});

const cc = (extra: Partial<DeviceHarness> = {}): DeviceHarness => ({ harness: "claude-code", installed: true, loggedIn: true, canBePartner: true, billing: "plan", models: [{ id: "opus", label: "Opus" }, { id: "sonnet", label: "Sonnet" }], ...extra });
const cx = (extra: Partial<DeviceHarness> = {}): DeviceHarness => ({ harness: "codex", installed: true, loggedIn: true, canBePartner: true, billing: "plan", ...extra });
const dsUsage: DeviceHarness = { harness: "deepseek-harness", installed: true, loggedIn: true, canBePartner: true, billing: "usage" };
const settings: Pick<Settings, "brain" | "taskAccounts"> = { brain: { harness: "claude-code", model: "opus" } };
const r = (x: Partial<RuleView> & Pick<RuleView, "harness">): RuleView => ({ id: `r_${Math.random().toString(36).slice(2, 7)}`, text: "x", match: [], createdAt: "2026-11-18T00:00:00Z", ...x });

test("kindOf: the partner's word, else web pages or a phone are an errand, a repo is code, else none", () => {
  expect(kindOf("writing", { browse: true })).toBe("writing");
  expect(kindOf(undefined, { browse: true })).toBe("errand");
  expect(kindOf(undefined, { phone: "mine" })).toBe("errand");
  expect(kindOf(undefined, undefined, { kind: "browser", device: "local", profile: "default" })).toBe("errand");
  expect(kindOf(undefined, undefined, { kind: "repo", device: "local", repoPath: "~/dev/x" })).toBe("code");
  expect(kindOf("nonsense")).toBeUndefined();
});

test("an errand goes to Sonnet by default, with Opus kept; code stays on Opus with no reason line", () => {
  const errand = chooseBody({ work: { title: "京都住哪儿", kind: "errand" }, harnesses: [cc(), cx()], settings, rules: [] });
  expect(errand).toMatchObject({ harness: "claude-code", model: "sonnet", why: { kind: "kind", work: "errand", keeps: { harness: "claude-code", model: "opus" } } });
  const code = chooseBody({ work: { title: "Fix CI", kind: "code" }, harnesses: [cc(), cx()], settings, rules: [] });
  expect(code).toMatchObject({ harness: "claude-code", model: "opus", why: { kind: "default" } });
  // Writing and research stay on the smartest (D372).
  expect(chooseBody({ work: { title: "写一封信", kind: "writing" }, harnesses: [cc()], settings, rules: [] })).toMatchObject({ model: "opus", why: { kind: "default" } });
});

test("an errand never goes to a fast tier only guessed from a list's order, and plan comes before pay-per-use", () => {
  // Codex lists two models the table doesn't know: no fast tier is assumed, its default does it.
  const guessed = chooseBody({ work: { title: "比价", kind: "errand" }, harnesses: [cx({ models: [{ id: "gpt-a", label: "A" }, { id: "gpt-b", label: "B" }] })], settings, rules: [] });
  expect(guessed).toMatchObject({ harness: "codex", model: "gpt-a", why: { kind: "default" } });
  // DeepSeek Flash is a known fast tier but paid per use: Codex on the plan does the errand.
  const paid = chooseBody({ work: { title: "订酒店", kind: "errand" }, harnesses: [cx(), dsUsage], settings, rules: [] });
  expect(paid).toMatchObject({ harness: "codex" });
});

test("a rule by kind matches by meaning; a word rule is more specific than a kind rule", () => {
  const kindRule = r({ harness: "codex", kinds: ["errand"], text: "跑腿的事 → Codex" });
  const wordRule = r({ harness: "claude-code", match: ["机票"], text: "机票 → Claude Code" });
  expect(ruleFor([kindRule], { title: "京都住哪儿", kind: "errand" })?.id).toBe(kindRule.id);
  expect(ruleFor([kindRule], { title: "京都住哪儿" })).toBeUndefined();
  expect(ruleFor([wordRule, kindRule], { title: "看机票", kind: "errand" })?.id).toBe(wordRule.id);
  const pick = chooseBody({ work: { title: "京都住哪儿", kind: "errand" }, harnesses: [cc(), cx()], settings, rules: [kindRule] });
  expect(pick).toMatchObject({ harness: "codex", why: { kind: "rule", ruleId: kindRule.id } });
});

test("a never rule rules an agent out for that kind; a pin in the moment still may; alone it's said, never run", () => {
  const never = r({ harness: "claude-code", kinds: ["errand"], never: true, text: "跑腿的事 → 不用 Claude Code" });
  expect(neverFor([never], { title: "订酒店", kind: "errand" })).toHaveLength(1);
  expect(neverFor([never], { title: "Fix CI", kind: "code" })).toHaveLength(0);
  const pick = chooseBody({ work: { title: "订酒店", kind: "errand" }, harnesses: [cc(), cx()], settings, rules: [never] });
  expect(pick).toMatchObject({ harness: "codex" });
  const list = fwCandidates({ work: { title: "订酒店", kind: "errand" }, harnesses: [cc(), cx()], settings, rules: [never] });
  expect(list.find((c) => c.harness === "claude-code")!.blocked).toBe("ruled_out");
  // Code is untouched by it.
  expect(chooseBody({ work: { title: "Fix CI", kind: "code" }, harnesses: [cc(), cx()], settings, rules: [never] })).toMatchObject({ harness: "claude-code", model: "opus" });
  // "这次就用 Claude Code": the partner's pin goes past the never.
  expect(chooseBody({ work: { title: "订酒店", kind: "errand" }, harnesses: [cc(), cx()], settings, rules: [never], pinned: { harness: "claude-code" } })).toMatchObject({ harness: "claude-code" });
  // Only Claude Code here: one line to ask, nothing opened.
  const alone = chooseBody({ work: { title: "订酒店", kind: "errand" }, harnesses: [cc()], settings, rules: [never] });
  expect(alone && "problem" in alone && alone.problem).toContain("rule says not to use Claude Code");
});

test("the rules store: kinds and never kept; a never replaces a rule that sends the work to that agent, and back", () => {
  const { dir, cleanup } = tempDir();
  stops.push(cleanup);
  const rules = openRules(dir);
  const to = rules.add({ text: "跑腿的事 → Claude Code", harness: "claude-code", match: [], kinds: ["errand", "bogus"] });
  expect(to.kinds).toEqual(["errand"]);
  const no = rules.add({ text: "跑腿的事 → 不用 Claude Code", harness: "claude-code", match: [], kinds: ["errand"], never: true });
  expect(rules.list().map((x) => x.id)).toEqual([no.id]);
  expect(rules.list()[0]!.never).toBe(true);
  // A never for another agent stays beside it; a rule sending errands to Claude Code again replaces the never.
  const no2 = rules.add({ text: "跑腿 → 不用 Codex", harness: "codex", match: [], kinds: ["errand"], never: true });
  expect(rules.list().map((x) => x.id)).toEqual([no.id, no2.id]);
  const back = rules.add({ text: "跑腿的事 → Claude Code", harness: "claude-code", match: [], kinds: ["errand"] });
  expect(rules.list().map((x) => x.id)).toEqual([no2.id, back.id]);
  expect(() => rules.add({ text: "x", harness: "codex", match: [] })).toThrow();
  // Kept on disk.
  expect(openRules(dir).list().map((x) => x.id)).toEqual([no2.id, back.id]);
});

test("kindDefaults: errands and the rest, in literal agents; none when they'd be the same", () => {
  expect(kindDefaults({ harnesses: [cc(), cx()], settings })).toEqual([
    { work: "errand", harness: "claude-code", model: "sonnet" },
    { work: "rest", harness: "claude-code", model: "opus" },
  ]);
  expect(kindDefaults({ harnesses: [cx()], settings })).toEqual([]);
});

test("smartestFor: the smartest other than the one on it, never one a rule rules out", () => {
  expect(smartestFor({ work: { title: "订酒店", kind: "errand" }, harnesses: [cc(), cx()], settings, rules: [], current: { harness: "claude-code", model: "sonnet" } })).toEqual({ harness: "claude-code", model: "opus" });
  const never = r({ harness: "claude-code", kinds: ["errand"], never: true });
  expect(smartestFor({ work: { title: "订酒店", kind: "errand" }, harnesses: [cc(), cx()], settings, rules: [never], current: { harness: "deepseek-harness" } })).toEqual({ harness: "codex" });
});

test("kind retry: a fast errand's failed report starts one retry and doesn't wake the partner; a second doesn't", async () => {
  const { dir, cleanup } = tempDir();
  const log = openLog({ path: join(dir, "log.db"), persona: "default" });
  stops.push(cleanup, () => log.close());
  const retries: { taskId: string; stalled?: boolean; summary?: string }[] = [];
  const kr = createKindRetry({
    log,
    loadout: {
      retry: async (taskId, how) => {
        retries.push({ taskId, ...how });
        log.append({ stream: `task:${taskId}`, origin: "system", kind: "body_selected", body: { taskId, harness: "claude-code", model: "opus", why: { kind: "retry", from: "claude-code", fromModel: "sonnet", work: "errand" } } });
        return { ok: true };
      },
    },
    runner: () => undefined,
  });
  stops.push(log.subscribe((e: LogEvent) => kr.onEvent(e)));
  const sel = (taskId: string, why: Bodies["body_selected"]["why"]) => log.append({ stream: `task:${taskId}`, origin: "system", kind: "body_selected", body: { taskId, harness: "claude-code", model: "sonnet", why } });
  const fail = (taskId: string) => log.append({ stream: `task:${taskId}`, origin: "task", kind: "report", body: { taskId, state: "failed", summary: "the site kept timing out", questions: [], evidence: [] } });
  sel("t1", { kind: "kind", work: "errand", keeps: { harness: "claude-code", model: "opus" } });
  sel("t2", { kind: "default" });
  const f1 = fail("t1");
  const f2 = fail("t2");
  expect(kr.wakes(f1)).toBe(false);
  expect(kr.wakes(f2)).toBe(true);
  await Bun.sleep(10);
  expect(retries).toEqual([{ taskId: "t1", summary: "the site kept timing out" }]);
  // The smartest failed too: the person hears it (the partner is woken).
  const again = fail("t1");
  expect(kr.wakes(again)).toBe(true);
  // A stall on a fast errand is retried as stalled.
  sel("t3", { kind: "kind", work: "errand" });
  log.append({ stream: "task:t3", origin: "task", kind: "task_event", body: { taskId: "t3", role: "system", text: "no report after one nudge", raw: { stall: true } } });
  await Bun.sleep(10);
  expect(retries.at(-1)).toEqual({ taskId: "t3", stalled: true });
});
