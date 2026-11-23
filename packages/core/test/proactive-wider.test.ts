// D458: offers from past the accounts. Code gathers leads from finished tasks, Mem (a fake, read
// only) and the conversation; a spotter (a fake here, the cheapest model live) picks among them;
// each becomes a quiet offer naming where it came from, with one Go. Fakes and the fake clock only.
import { afterEach, expect, test } from "bun:test";
import type { Bodies, TaskCard } from "@ducter/protocol";
import type { MemLookPort } from "@ducter/protocol/src/internal.ts";
import { codeCandidates, gatherLeads, memLeads, overlap, spotsToCandidates, talkLeads, taskLeads, toolName, type Lead, type WiderInput } from "../src/proactive/wider.ts";
import { MORNING, ZONE } from "./fixtures/inbox.ts";
import { rig, type Rig } from "./proactive-rig.ts";

const H = 3_600_000;
const D = 24 * H;
const iso = (ms: number) => new Date(ms).toISOString();
const NOW = MORNING;

const repo = { kind: "repo" as const, device: "local", repoPath: "/Users/me/code/hawdb", branch: "main" };
function card(p: Partial<TaskCard> & { taskId: string; title: string }): TaskCard {
  return { persona: "default", project: "hawdb", place: repo as never, harness: "codex", attention: "done", residency: "parked", openedAt: iso(NOW - 2 * D), updatedAt: iso(NOW - 20 * H), ...p } as TaskCard;
}
const report = (summary: string, state: "done" | "failed" = "done") => ({ taskId: "x", state, summary, questions: [], evidence: [] }) as Bodies["report"];
const input = (p: Partial<WiderInput>): WiderInput => ({ now: NOW, zone: ZONE, tasks: [], talk: [], refs: [], upcoming: [], focus: [], ...p });

test("tasks: a merged PR's follow-up issue still open, and what a task noticed and left", () => {
  const merged = card({ taskId: "t1", title: "WAL group commit", integrated: { act: "merge", at: iso(NOW - 20 * H) }, lastReport: report("Merged PR #10561: group commit for the WAL. The fsync batching for replicas is left for #10562.") });
  const noticed = card({ taskId: "t2", title: "Fix the LRU-K eviction test", lastReport: report("The flaky test is fixed. I also noticed the buffer pool's pin count can underflow on abort; I didn't touch it.") });
  const old = card({ taskId: "t3", title: "Old work", updatedAt: iso(NOW - 6 * D), lastReport: report("Done. Also noticed the README is out of date.") });
  const leads = taskLeads(input({ tasks: [merged, noticed, old], refs: [{ ref: "hawdb/hawdb#10562", label: "#10562", title: "Batch fsync for replicas", state: "open" }] }));
  expect(leads.map((l) => l.hint).sort()).toEqual(["follow_up", "noticed"]);
  const f = leads.find((l) => l.hint === "follow_up")!;
  expect(f.place).toEqual(repo as never);
  expect(f.how.map((h) => h.src)).toEqual(["task", "github"]);
  expect(f.origin.zh).toBe("从 11 月 9 日做完的「WAL group commit」想到的");
  expect(leads.find((l) => l.hint === "noticed")!.detail).toContain("pin count");
});

test("tasks: something already taken up by a later task is no lead", () => {
  const noticed = card({ taskId: "t2", title: "Fix the LRU-K eviction test", lastReport: report("I also noticed the buffer pool's pin count can underflow on abort.") });
  const later = card({ taskId: "t9", title: "Fix the buffer pool pin count underflow on abort", openedAt: iso(NOW - 10 * H), attention: "working" });
  expect(taskLeads(input({ tasks: [noticed, later] }))).toEqual([]);
});

test("tasks: a failure whose cause closed after it, and a routine whose result changed", () => {
  const failed = card({ taskId: "t4", title: "Upgrade to bun 1.4", attention: "failed", updatedAt: iso(NOW - 5 * D), lastReport: report("Blocked by oven-sh/bun#24011: the test runner crashes on workers.", "failed") });
  const r1 = card({ taskId: "r1", title: "Nightly CI check", fromRoutine: { routineId: "rt1", name: "Nightly CI check" }, openedAt: iso(NOW - 2 * D), updatedAt: iso(NOW - 2 * D), lastReport: report("All 1,204 tests pass on main.") });
  const r2 = card({ taskId: "r2", title: "Nightly CI check", fromRoutine: { routineId: "rt1", name: "Nightly CI check" }, attention: "failed", openedAt: iso(NOW - 1 * D), updatedAt: iso(NOW - 20 * H), lastReport: report("3 tests fail on main since a1b2c3: the planner's join order changed.", "failed") });
  const leads = taskLeads(input({ tasks: [failed, r1, r2], refs: [{ ref: "oven-sh/bun#24011", label: "#24011", title: "test runner crashes on workers", state: "closed", updatedAt: iso(NOW - 1 * D) }] }));
  expect(leads.map((l) => l.hint).sort()).toEqual(["fixed_upstream", "routine_changed"]);
  expect(leads.find((l) => l.hint === "routine_changed")!.origin.en).toBe("From the last two runs of the routine “Nightly CI check”");
});

test("tasks: a routine that said the same thing again is no lead", () => {
  const r1 = card({ taskId: "r1", title: "Nightly CI check", fromRoutine: { routineId: "rt1", name: "Nightly CI check" }, openedAt: iso(NOW - 2 * D), lastReport: report("All 1204 tests pass on main.") });
  const r2 = card({ taskId: "r2", title: "Nightly CI check", fromRoutine: { routineId: "rt1", name: "Nightly CI check" }, openedAt: iso(NOW - 1 * D), lastReport: report("All 1204 tests pass on main.") });
  expect(taskLeads(input({ tasks: [r1, r2] }))).toEqual([]);
});

function fakeMem(): MemLookPort & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    async search(q, _n, opts) {
      asked.push(opts?.unitType ? `${opts.unitType}:${q}` : q);
      // A decision that shares a word with the flight's name and says "always": not a seat preference (D461).
      if (/flight|航班/.test(q)) return [{ id: "m1", title: "出差订座偏好", content: "出差坐飞机一定要靠窗，别给我选中间座。", date: "2026-10-02", kind: "preference", source: "ducter" }, { id: "m2", title: "喜欢的咖啡", content: "喜欢燕麦拿铁。", date: "2026-09-01", kind: "preference" }, { id: "m4", title: "NH 920 crew notes", content: "Always run the bench before a release preference review.", date: "2026-09-03", kind: "decision", source: "codex" }];
      // D461: decisions are asked for by kind (`--unit-type decision`), with the condition's short words.
      if (opts?.unitType === "decision" && /^once$|以后再/.test(q)) return [{ id: "m3", title: "HawDB 发布节奏", content: "等 WAL group commit 合进去之后再发 0.9 的 RC。", date: "2026-10-28", kind: "decision", source: "codex" }];
      return [];
    },
    async threads(q, _n, opts) {
      asked.push(`t:${q}:${opts?.scan ?? "-"}`);
      // D461: a scan returns old matches first (Mem ranks by match); the recent one is kept.
      return [
        { id: "th0", title: "An old planner thread", source: "claude-code", date: "2026-07-01", lines: [{ who: "user", text: "下次继续。" }] },
        { id: "th2", title: "A distilled note", source: "thread_distillation", date: "2026-11-06", lines: [{ who: "user", text: "下次再说。" }] },
        { id: "th1", title: "HawDB planner join order", source: "codex", date: "2026-11-05", lines: [{ who: "user", text: "先这样，join order 的代价模型下次继续。" }, { who: "assistant", text: "好，还没改的是 cardinality 估计那块。" }] },
      ];
    },
  };
}

test("Mem: a preference meeting a flight, a decision whose condition is met, a conversation left open", async () => {
  const mem = fakeMem();
  const merged = card({ taskId: "t1", title: "WAL group commit", lastReport: report("Merged the WAL group commit.") });
  const leads = await memLeads(input({ mem, tasks: [merged], focus: ["HawDB"], upcoming: [{ name: "NH 920 上海—东京", start: iso(NOW + 3 * D), what: "flight" }] }));
  expect(leads.map((l) => l.hint).sort()).toEqual(["condition_met", "pref_event", "thread_open"]);
  const pref = leads.find((l) => l.hint === "pref_event")!;
  expect(pref.what).toBe("出差订座偏好");
  expect(pref.how.map((h) => h.src)).toEqual(["mem", "calendar"]);
  expect(leads.find((l) => l.hint === "thread_open")!.origin.zh).toBe("从你和 Codex 11 月 5 日的对话想到的");
  expect(leads.find((l) => l.hint === "condition_met")!.origin.zh).toBe("从 Codex 10 月 28 日记下的想到的");
  // Read only, and bounded: six memory reads, two thread scans.
  expect(mem.asked.filter((a) => !a.startsWith("t:")).length).toBeLessThanOrEqual(6);
  expect(mem.asked.filter((a) => a.startsWith("t:"))).toEqual(["t:下次:20", "t:next time:20"]);
  expect(mem.asked).toContain("decision:once");
  // D461: one lead per conversation, only a named AI tool's, only a recent one.
  expect(leads.filter((l) => l.hint === "thread_open").map((l) => l.what)).toEqual(["HawDB planner join order"]);
  expect(leads.filter((l) => l.hint === "pref_event").map((l) => l.what)).toEqual(["出差订座偏好"]);
});

test("D461: Mem's own distillers, connectors and test runs are not AI tools by name", () => {
  for (const s of ["thread_distillation", "knowledge_agent", "ai-now", "agent", "im_connector", "codex-smoke", "cli", "mcp", "openai"]) expect(toolName(s)).toBeUndefined();
  expect(toolName("codex")).toBe("Codex");
  expect(toolName("Claude-Code")).toBe("Claude Code");
});

test("Mem: no event coming, no condition met: nothing from it", async () => {
  const leads = await memLeads(input({ mem: { search: fakeMem().search } }));
  expect(leads).toEqual([]);
});

test("the conversation: an undated 回头看看 a day later; never a dated one (D281's), a fresh one, or one done since", () => {
  const talk = [
    { text: "回头看看 Weizhen 那个 PR #10559 的 review 意见", at: NOW - 2 * D },
    { text: "周五提醒我交水电费", at: NOW - 2 * D },
    { text: "改天研究一下 Grafana 的告警规则", at: NOW - 3 * H },
    { text: "有空把 bench 脚本整理一下", at: NOW - 4 * D },
    { text: "bench 脚本整理好了", at: NOW - 1 * D },
    { text: "今天天气不错", at: NOW - 2 * D },
  ];
  const leads = talkLeads(input({ talk }));
  expect(leads.map((l) => l.what)).toEqual(["回头看看 Weizhen 那个 PR #10559 的 review 意见"]);
  expect(leads[0]!.origin.en).toBe("From what you said on Nov 8");
});

test("gatherLeads numbers each lead for the model", async () => {
  const leads = await gatherLeads(input({ talk: [{ text: "回头看看那个 PR #10559", at: NOW - 2 * D }], tasks: [card({ taskId: "t2", title: "Fix test", lastReport: report("Fixed. I also noticed the docs are stale.") })] }));
  expect(leads.map((l) => l.id)).toEqual(["t1", "c1"]);
});

test("the spotter's words are checked: unknown ids, words too long and a long Go don't pass as written", () => {
  const lead = talkLeads(input({ talk: [{ text: "回头看看那个 PR #10559", at: NOW - 2 * D }] }))[0]!;
  const l: Lead = { ...lead, id: "c1" };
  const cs = spotsToCandidates([l], [{ id: "c9", offer: true, text: "x" }, { id: "c1", offer: true, text: "你前天说回头看看 PR #10559，要我先把 review 意见理一下吗？", go: "把这个 PR 的所有 review 意见都理一遍然后回复" }], "zh");
  expect(cs).toHaveLength(1);
  expect(cs[0]).toMatchObject({ kind: "loose_end", spotted: true, origin: l.origin, step: { goLabel: { zh: "看一下" } } });
  expect(spotsToCandidates([l], [{ id: "c1", offer: true, text: "很长".repeat(60) }], "zh")).toEqual([]);
  expect(spotsToCandidates([l], [{ id: "c1", offer: false, text: "好" }], "zh")).toEqual([]);
});

test("with no model, only code's joins are offered", () => {
  const merged = card({ taskId: "t1", title: "WAL group commit", integrated: { act: "merge", at: iso(NOW - 20 * H) }, lastReport: report("Merged PR #10561. Follow-up in #10562.") });
  const noticed = card({ taskId: "t2", title: "Fix test", lastReport: report("Fixed. I also noticed the docs are stale.") });
  const leads = taskLeads(input({ tasks: [merged, noticed], refs: [{ ref: "a/b#10562", label: "#10562", title: "Batch fsync", state: "open" }] }));
  const cs = codeCandidates(leads, "zh");
  expect(cs.map((c) => c.kind)).toEqual(["next_step"]);
  expect(cs[0]!.words.zh).toBe("「WAL group commit」合进去了，它的后续 #10562 还开着，要我接着做吗？");
});

test("terms: a later line about the same thing overlaps; tool names read plainly", () => {
  expect(overlap("回头看看 PR #10559 的 review", "PR #10559 看过了")).toBeGreaterThan(0.4);
  expect(overlap("Grafana 告警", "bench 脚本")).toBe(0);
  expect(toolName("claude-code")).toBe("Claude Code");
  expect(toolName("ducter")).toBeUndefined();
});

// ---------- in the engine ----------

const rigs: Rig[] = [];
afterEach(() => rigs.splice(0).forEach((r) => r.stop()));

test("the morning note carries them as offers, each naming where it came from; Go starts the task where the work was", async () => {
  const merged = card({ taskId: "t1", title: "WAL group commit", integrated: { act: "merge", at: iso(NOW - 20 * H) }, lastReport: report("Merged PR #10561. The fsync batching is left for #10562.") });
  let calls = 0;
  const r = rig({
    mode: "useful",
    wider: async (c) => gatherLeads(input({ now: c.now, tasks: [merged], refs: [{ ref: "hawdb/hawdb#10562", label: "#10562", title: "Batch fsync for replicas", state: "open" }], talk: [{ text: "回头看看 Weizhen 那个 PR #10559", at: NOW - 2 * D }] })),
    spotter: async (leads) => {
      calls++;
      return { spots: leads.map((l) => ({ id: l.id, offer: true, text: l.src === "task" ? "WAL group commit 合进去了，后续 #10562 还开着，要接着做吗？" : "你前天说回头看看 PR #10559，要我先把 review 意见理一下吗？", go: l.src === "task" ? "接着做" : "理一下" })), tokens: 0 };
    },
  });
  rigs.push(r);
  await r.p.lookNow(40);
  await r.advance(H + 2 * 60_000);
  const n = r.notes().map((e) => e.body).find((b) => b.rung === "morning" && !b.quiet)!;
  const next = n.finds.find((f) => f.kind === "next_step")!;
  const loose = n.finds.find((f) => f.kind === "loose_end")!;
  expect(next).toMatchObject({ offer: true, origin: "从 11 月 9 日做完的「WAL group commit」想到的", goLabel: "接着做" });
  expect(loose.origin).toBe("从你 11 月 8 日说的话想到的");
  expect(calls).toBe(1);
  // Never needs-you: the decision is an offer's.
  const d = r.log.read({ stream: "channel", kinds: ["decision"] }).map((e) => e.body as Bodies["decision"]).find((x) => x.findId === next.findId)!;
  expect(d.offer).toBe(true);
  r.decisions.decide(next.decisionId!, "go");
  await r.settle();
  expect(r.opened.at(-1)).toMatchObject({ place: repo, project: "hawdb" });
  expect(r.opened.at(-1)!.brief).toContain("follow-up issue");
  expect(r.opened.at(-1)!.brief).toContain("#10562");
});

test("a lead the spotter passed over is not asked about again; one it offered is said once", async () => {
  const seen: string[][] = [];
  const r = rig({
    mode: "useful",
    wider: async (c) => talkLeads(input({ now: c.now, talk: [{ text: "回头看看那个 PR #10559", at: NOW - 2 * D }, { text: "改天整理一下 bench 脚本", at: NOW - 2 * D }] })).map((l, i) => ({ ...l, id: `c${i + 1}` })),
    spotter: async (leads) => {
      seen.push(leads.map((l) => l.what));
      return { spots: leads.map((l) => ({ id: l.id, offer: /PR/.test(l.what), text: "你前天说回头看看 PR #10559，要我先看一下吗？", go: "看一下" })), tokens: 0 };
    },
  });
  rigs.push(r);
  await r.p.lookNow(40);
  await r.advance(H + 2 * 60_000);
  await r.advance(D);
  expect(seen[0]).toHaveLength(2);
  // The next morning: the offered one was said, the other was passed over: nothing to ask.
  expect(seen.length).toBe(1);
  const all = r.notes().flatMap((e) => e.body.finds).filter((f) => f.kind === "loose_end");
  expect(all).toHaveLength(1);
});

test("只说急的: no morning note, so nothing is read past the accounts", async () => {
  let asked = 0;
  const r = rig({ mode: "urgent", wider: async () => (asked++, []) });
  rigs.push(r);
  await r.p.lookNow(40);
  await r.advance(H + 2 * 60_000);
  expect(asked).toBe(0);
});
