// D465: what Nowledge Mem would like the person to settle (contradictions, learned rules) and the
// rules on, for Settings › 记忆; settled with one tap through a fake nmem. Shapes from research/202
// (nmem 0.10.122 against the real Mem, read only).
import { afterEach, describe, expect, test } from "bun:test";
import { openLog } from "../src/log.ts";
import { actionFor, contradictionOf, createMemCheck, resolvedOf, rulesOf, upsertArgs } from "../src/mem-check.ts";
import { openPushStore } from "../src/push.ts";
import { openSettings } from "../src/settings.ts";
import { tempDir } from "./helpers.ts";

const stops: (() => void)[] = [];
afterEach(() => stops.splice(0).forEach((s) => s()));

const NOW = Date.parse("2026-11-22T12:00:00Z");
const review = (o: object = {}) => ({ state: "pending", allowed_actions: ["keep_newer_as_latest", "keep_older_as_latest", "keep_both_linked", "no_change_needed", "dismiss", "custom_note_only"], recommended_action: "keep_both_linked", automatic_resolution: "expired_no_change", expires_at: "2026-12-09T22:49:39+00:00", ...o });
const contra = (id: string, created: string, titles: [string, string], o: { review?: object; newFirst?: boolean; resolved?: boolean } = {}) => ({
  id,
  event_type: "flag_contradiction",
  title: "Possible contradiction",
  description: "never shown",
  resolved: o.resolved ?? false,
  created_at: created,
  metadata: {
    memory_ids: o.newFirst ? ["new", "old"] : ["old", "new"],
    new_memory_id: "new",
    memory_pairs: [
      { date: "2026-11-09", title: titles[0], source: "cli" },
      { date: "2026-11-10", title: titles[1], source: "cli" },
    ],
    content_snippets: [{ id: "old", content: "never shown either" }],
  },
  review: review(o.review),
});
const feed = (events: object[]) => JSON.stringify({ events, total: events.length, has_more: false });
const rule = (id: string, status: string, o: object = {}) => ({ id, title: `Rule ${id}`, body: `Body of ${id}`, status, scope: "space", spaceId: "personal-1", priority: 50, tags: ["engineering", "learned"], source: "learned_candidate", createdAt: "2026-11-20T08:00:00Z", ...o });

describe("Mem check (D465)", () => {
  test("a contradiction: the two titles older first, Mem's suggestion the default, contents never", () => {
    const c = contradictionOf(contra("e1", "2026-11-09T22:49:39Z", ["Ducter zh name 搭子 (D153)", "Ducter v0.0.4 release"]), NOW)!;
    expect(c).toMatchObject({ id: "e1", kind: "contradiction", suggest: "both", answers: ["newer", "older", "both"] });
    expect(c.pair!.map((p) => p.title)).toEqual(["Ducter zh name 搭子 (D153)", "Ducter v0.0.4 release"]);
    expect(JSON.stringify(c)).not.toContain("never shown");
    const flipped = contradictionOf(contra("e2", "2026-11-09T00:00:00Z", ["A", "B"], { newFirst: true }), NOW)!;
    expect(flipped.pair!.map((p) => p.title)).toEqual(["B", "A"]);
  });

  test("not asked: settled, expired, kept for the person alone, too few answers, no pair", () => {
    expect(contradictionOf(contra("r", "2026-11-09T00:00:00Z", ["A", "B"], { resolved: true }), NOW)).toBeUndefined();
    expect(contradictionOf(contra("x", "2026-11-09T00:00:00Z", ["A", "B"], { review: { expires_at: "2026-11-01T00:00:00Z" } }), NOW)).toBeUndefined();
    expect(contradictionOf(contra("p", "2026-11-09T00:00:00Z", ["A", "B"], { review: { person_only: true } }), NOW)).toBeUndefined();
    expect(contradictionOf(contra("d", "2026-11-09T00:00:00Z", ["A", "B"], { review: { allowed_actions: ["dismiss", "keep_both_linked"] } }), NOW)).toBeUndefined();
    expect(contradictionOf({ ...contra("n", "2026-11-09T00:00:00Z", ["A", "B"]), metadata: {} }, NOW)).toBeUndefined();
    expect(contradictionOf({ ...contra("bad id!", "2026-11-09T00:00:00Z", ["A", "B"]) }, NOW)).toBeUndefined();
  });

  test("rules read back with every field upsert needs; written back unchanged but the status", () => {
    const [r] = rulesOf(JSON.stringify({ rules: [rule("feishu-deploy", "draft"), { id: "no-title", body: "x" }] }))!;
    expect(r).toMatchObject({ id: "feishu-deploy", scope: "space", spaceId: "personal-1", status: "draft" });
    expect(upsertArgs(r!, "active")).toEqual(["rules", "upsert", "feishu-deploy", "--title", "Rule feishu-deploy", "--body", "Body of feishu-deploy", "--scope", "space", "--status", "active", "--priority", "50", "--space-id", "personal-1", "--tags", "engineering,learned"]);
    expect(rulesOf("not json")).toBeUndefined();
  });

  test("answers map to Mem's own actions; a preview's plan is read by its id", () => {
    expect(actionFor("newer", ["newer", "both"])).toBe("keep-newer-as-latest");
    expect(actionFor("older", ["newer", "both"])).toBeUndefined();
    expect(resolvedOf(JSON.stringify({ preview: true, plan_id: "plan_1" }))).toEqual({ applied: false, planId: "plan_1" });
    expect(resolvedOf(JSON.stringify({ applied: true }))).toEqual({ applied: true });
    expect(resolvedOf("")).toEqual({ applied: false });
  });

  function fake(o: { reviewsTotal?: number; rules?: object[]; events?: object[]; preview?: object; confirm?: { code: number; out: string } } = {}) {
    const calls: string[] = [];
    const run = async (args: string[]) => {
      calls.push(args.join(" "));
      if (args[0] === "feed" && args[1] === "--type") return { code: 0, out: feed(o.events ?? [contra("e1", "2026-11-09T22:49:39Z", ["Older", "Newer"]), contra("e2", "2026-11-12T10:00:00Z", ["Cloud resets at UTC midnight", "Mem resets on a rolling 24h"])]), err: "" };
      if (args[0] === "feed" && args[1] === "reviews") return { code: 0, out: JSON.stringify({ events: [], total: o.reviewsTotal ?? 1033 }), err: "" };
      if (args[0] === "rules" && args[1] === "list") return { code: 0, out: JSON.stringify({ rules: o.rules ?? [rule("feishu-deploy", "draft"), rule("ci-first", "active")] }), err: "" };
      if (args[0] === "feed" && args[1] === "resolve") return args.includes("--plan-id") ? (o.confirm ?? { code: 0, out: JSON.stringify({ applied: true }), err: "" }) : { code: 0, out: JSON.stringify(o.preview ?? { preview: true, plan_id: "plan_9" }), err: "" };
      if (args[0] === "rules" && args[1] === "upsert") return { code: 0, out: "{}", err: "" };
      return { code: 1, out: "", err: "unknown" };
    };
    return { calls, run };
  }

  test("read once per while, only when on: newest contradiction first, a draft rule asked, the rules on listed, the rest said once", async () => {
    const f = fake();
    let changed = 0;
    let on = true;
    let now = NOW;
    const c = createMemCheck({ run: f.run, on: () => on, changed: () => changed++, now: () => now, ttlMs: 1000 });
    expect(c.get()).toBeUndefined();
    await c.refresh();
    const v = c.get()!;
    expect(v.asks.map((a) => a.id)).toEqual(["e2", "e1", "rule:feishu-deploy"]);
    expect(v.asks[2]).toMatchObject({ kind: "rule", suggest: "use", answers: ["use", "not"], title: "Rule feishu-deploy" });
    expect(v.rules).toEqual([{ id: "rule:ci-first", title: "Rule ci-first", body: "Body of ci-first" }]);
    expect(v.more).toBe(true);
    expect(f.calls.sort()).toEqual(["feed --type flag_contradiction --days 30 -n 50", "feed reviews -n 1", "rules list"]);
    now += 500;
    c.get();
    expect(f.calls.length).toBe(3);
    on = false;
    expect(c.get()).toBeUndefined();
    expect(await c.answer("e1", "both")).toBe(false);
    expect(changed).toBe(1);
  });

  test("nothing waiting and no rules: no section at all", async () => {
    const f = fake({ events: [], rules: [], reviewsTotal: 0 });
    const c = createMemCheck({ run: f.run, on: () => true, changed: () => {}, now: () => NOW });
    await c.refresh();
    expect(c.get()).toBeUndefined();
  });

  test("a contradiction settled: previewed, then that exact plan confirmed; it leaves and stays gone", async () => {
    const f = fake();
    const c = createMemCheck({ run: f.run, on: () => true, changed: () => {}, now: () => NOW, ttlMs: 0 });
    await c.refresh();
    expect(await c.answer("e2", "newer")).toBe(true);
    expect(f.calls.slice(-2)).toEqual(["feed resolve e2 --action keep-newer-as-latest", "feed resolve e2 --action keep-newer-as-latest --plan-id plan_9"]);
    expect(c.get()!.asks.map((a) => a.id)).not.toContain("e2");
    await c.refresh(); // Mem hasn't caught up yet: still not shown
    expect(c.get()!.asks.map((a) => a.id)).not.toContain("e2");
    expect(await c.answer("e2", "newer")).toBe(false);
    expect(await c.answer("e1", "use")).toBe(false); // not an answer for a contradiction
  });

  test("applied at once needs no confirm; a preview without a plan, or a refused confirm, keeps the ask", async () => {
    const direct = fake({ preview: { applied: true } });
    const c1 = createMemCheck({ run: direct.run, on: () => true, changed: () => {}, now: () => NOW });
    await c1.refresh();
    expect(await c1.answer("e1", "both")).toBe(true);
    expect(direct.calls.filter((x) => x.includes("--plan-id"))).toEqual([]);

    const noPlan = fake({ preview: { preview: true } });
    const c2 = createMemCheck({ run: noPlan.run, on: () => true, changed: () => {}, now: () => NOW });
    await c2.refresh();
    expect(await c2.answer("e1", "both")).toBe(false);
    expect(c2.get()!.asks.map((a) => a.id)).toContain("e1");

    const refused = fake({ confirm: { code: 1, out: "", err: "as-person required" } });
    const c3 = createMemCheck({ run: refused.run, on: () => true, changed: () => {}, now: () => NOW });
    await c3.refresh();
    expect(await c3.answer("e1", "older")).toBe(false);
    expect(c3.get()!.asks.map((a) => a.id)).toContain("e1");
  });

  test("a learned rule turned on joins the rules on; one turned off leaves", async () => {
    const f = fake();
    const c = createMemCheck({ run: f.run, on: () => true, changed: () => {}, now: () => NOW });
    await c.refresh();
    expect(await c.answer("rule:feishu-deploy", "use")).toBe(true);
    expect(f.calls.at(-1)).toContain("rules upsert feishu-deploy");
    expect(f.calls.at(-1)).toContain("--status active");
    expect(c.get()!.asks.map((a) => a.id)).toEqual(["e2", "e1"]);
    expect(c.get()!.rules.map((r) => r.id)).toEqual(["rule:feishu-deploy", "rule:ci-first"]);
    expect(await c.answer("rule:ci-first", "not")).toBe(true);
    expect(f.calls.at(-1)).toContain("--status archived");
    expect(c.get()!.rules.map((r) => r.id)).toEqual(["rule:feishu-deploy"]);
    expect(await c.answer("rule:ci-first", "newer")).toBe(false);
  });

  test("the settings view carries Mem's check only when Mem is connected; a bad answer never reaches Mem", async () => {
    const t = tempDir();
    stops.push(t.cleanup);
    const log = openLog({ path: t.dir + "/log.db", persona: "p" });
    stops.push(() => log.close?.());
    const s = openSettings({ dataDir: t.dir, log, push: openPushStore(t.dir), persona: { name: "Pebble", identity: "" } });
    const asked: string[] = [];
    s.setCheck(() => ({ asks: [], rules: [{ id: "rule:a", title: "A" }] }), async (id, a) => (asked.push(`${id} ${a}`), true));
    s.setMemState("connected");
    expect((await s.view()).mem.check).toEqual({ asks: [], rules: [{ id: "rule:a", title: "A" }] });
    s.setMemState("missing");
    expect((await s.view()).mem.check).toBeUndefined();
    expect(await s.answerMem("rule:a", "not")).toBe(true);
    expect(await s.answerMem("rule:a; rm", "not")).toBe(false);
    expect(await s.answerMem("rule:a", "maybe" as never)).toBe(false);
    expect(asked).toEqual(["rule:a not"]);
  });
});
