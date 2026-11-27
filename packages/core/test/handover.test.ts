// D385: handing several over (design/handover.md). A heavy developer's pile with a subject that cuts
// across groups, languages and labels ("memory distillation": English titles, Chinese titles, a
// label the titles miss), found by code and then by meaning in one cached call; the sheet's how by
// code's table (where from the note's own words, the repository's computer); Go makes a group:
// plan first reads and reports a typed plan, its card turns it into held parts; side by side three at
// a time; as one task one task that "Fixes" each; review together sends every comment behind one Go.
// Fake gh, fake model, fake runner: never the real GitHub, never a real model.
import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import type { Bodies, Runner, TaskCard } from "@ducter/protocol";
import { canBeOne, defaultShape } from "@ducter/protocol";
import { startCore } from "../src/core.ts";
import { aboutOf, lastingWhere, namedComputer, parsePlan, splitWords } from "../src/task-sources/handover.ts";
import { parseMeaning } from "../src/task-sources/find.ts";
import type { Ask } from "../src/task-sources/pile.ts";
import { fakeGh, type FakeIssue } from "./fake-gh-issues.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

const NOW = Date.parse("2026-11-19T09:00:00Z");
const MEM: [number, string, string[]?][] = [
  [412, "Distillation: fall back to a smaller result instead of failing", ["component/distillation"]],
  [398, "Automatic distillation: the error says nothing useful"],
  [377, "Distillation gets slow on very long threads", ["component/distillation"]],
  [351, "Newer facts should replace older ones by when they were said", ["component/distillation"]],
  [340, "Distillation's first try often fails on long threads"],
  [405, "Retry a failed automatic distillation once?"],
  [366, "长对话的自动提炼总是失败"],
  [290, "Distillation as a tool loop"],
  [11115, "Fix the settings card's focus ring"],
  [11108, "Fix the settings card's label"],
  [11156, "Fix the settings card's scroll"],
];

function issues(): FakeIssue[] {
  const out: FakeIssue[] = MEM.map(([n, title, labels], k) => ({ repo: "acme/mem", number: n, title, ...(labels ? { labels } : {}), updated: new Date(NOW - (k + 1) * 3_600_000).toISOString() }));
  for (let k = 0; k < 30; k++) out.push({ repo: k % 2 ? "acme/web" : "acme/mem", number: 1000 + k, title: k % 3 ? `Small: fix typo ${k}` : `Rework page ${k}`, updated: new Date(NOW - (k + 20) * 3_600_000).toISOString() });
  return out;
}

/** The fake cheapest model: sorts by words (with a subject), and finds by meaning (anything about distilling, in either language). */
function fakeAsk(calls: { finds: number }): Ask {
  return async (prompt) => {
    if (prompt.includes("<logins>")) return { text: "{}", tokens: 500 };
    if (prompt.includes("<about>")) {
      calls.finds++;
      const rows = JSON.parse(/<todos>\n([\s\S]*)\n<\/todos>/.exec(prompt)![1]!) as { id: number; title: string; subject?: string }[];
      return { text: JSON.stringify({ found: rows.filter((r) => /distill|提炼|facts/i.test(r.title)).map((r) => ({ id: r.id, sure: "high", why: "讲记忆提炼" })) }), tokens: 3000 };
    }
    const rows = JSON.parse(/<todos>\n([\s\S]*)\n<\/todos>/.exec(prompt)![1]!) as { id: number; title: string }[];
    return {
      text: JSON.stringify(
        rows.map((r) =>
          /\?$/.test(r.title) ? { id: r.id, group: "decide", why: "要你定", ask: "要不要重试一次？", pick: "hand", subject: "记忆提炼" }
          : /tool loop|长对话/.test(r.title) ? { id: r.id, group: "later", why: "改动大", size: "large", subject: "记忆提炼" }
          : /istill|facts/.test(r.title) ? { id: r.id, group: "do", why: "说得清楚", size: "small", subject: /facts/.test(r.title) ? "Memory distill" : "记忆提炼" }
          : /^Small/.test(r.title) ? { id: r.id, group: "do", why: "改一个错字", size: "small", subject: "错字" }
          : { id: r.id, group: "later", why: "改动大", subject: "页面" },
        ),
      ),
      tokens: 1000,
    };
  };
}

/** D395: the author's computers: a server home with no clone, a Mac worker that has it (or none, and the Mac can read it). */
type Where = { macHas?: string; macReads?: boolean };
function boot(where?: Where, prs?: Record<string, "open" | "merged" | "closed">) {
  const t = tempDir();
  const gh = fakeGh(issues(), { login: "lin-dev" });
  const calls = { finds: 0 };
  let clock = NOW;
  const core = startCore({
    dataDir: join(t.dir, "data"),
    port: 0,
    push: false,
    batchMs: 5,
    // Never the real agents' CLIs: probing them takes seconds on a real machine (more than until's 3 s),
    // and the hand-over waits for the device frame (D454).
    deviceProbes: { cua: async () => ({ missing: "test" }), harnesses: async () => [], kind: async () => "laptop" },
    clock: { now: () => clock, setTimeout: (f: () => void, ms: number) => setTimeout(f, ms), clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>) } as never,
    // Two computers: the home and haswell (a worker), each with acme/mem checked out.
    newTaskComputers: where
      ? ({
          nameOf: (dev: string) => (dev === "w-mac" ? "MacBook" : undefined),
          homeName: () => "Hetzner Server",
          workers: () => [{ id: "w-mac", name: "MacBook", online: true }],
          folderInfo: async () => "offline",
          repos: async () => ({ folder: "/Users/lin/ducter", repos: [] }),
          clones: async (_dev: string, remote: string, probe: boolean) =>
            where.macHas ? { clones: [{ path: where.macHas, name: "mem", remote: "github.com/" + remote, touchedAt: "2026-11-18T00:00:00Z" }] } : probe ? { clones: [], canRead: !!where.macReads } : { clones: [] },
        } as never)
      : ({
          nameOf: (dev: string) => (dev === "w-haswell" ? "haswell" : undefined),
          homeName: () => "mac-mini",
          workers: () => [{ id: "w-haswell", name: "haswell", online: true }],
          folderInfo: async () => "offline",
          repos: async () => ({ folder: "/home/lin/ducter", repos: [{ path: "/home/lin/mem", name: "mem", remote: "github.com/acme/mem", touchedAt: "2026-11-18T00:00:00Z" }] }),
        } as never),
    homeRepos: () => (where ? { folder: "/root/ducter", repos: [] } : { folder: "/Users/lin/ducter", repos: [{ path: "/Users/lin/dev/mem", name: "mem", remote: "github.com/acme/mem", touchedAt: "2026-11-18T00:00:00Z" }] }),
    ...(where ? { platform: "linux", homeClones: async () => ({ clones: [], canRead: false }) } : {}),
    taskSources: { ghRun: gh.run, ghEnv: {}, home: join(t.dir, "home"), pollMs: 3_600_000, boundMs: 0, quietMs: 0, today: () => "2026-11-19", now: () => clock, ask: fakeAsk(calls), prState: async (ref: string) => prs?.[ref.toLowerCase()] ?? "merged" },
  });
  stops.push(t.cleanup, () => core.stop());
  core.settings.set({ language: "zh" });
  core.setPartner({ onTrigger: () => {} });
  let n = 0;
  const opened: Parameters<Runner["openTask"]>[0][] = [];
  const told: [string, string][] = [];
  const runner = {
    harness: { start: async () => ({}) as never, available: async () => [] },
    async openTask(input: Parameters<Runner["openTask"]>[0]): Promise<TaskCard> {
      const taskId = `t${++n}`;
      opened.push(input);
      core.log.append({ stream: `task:${taskId}`, origin: "system", kind: "task_open", body: { taskId, title: input.title, project: input.project ?? "", place: input.place ?? { kind: "none" }, harness: input.harness ?? "codex", brief: input.brief } });
      core.tasks.setState(taskId, "working", "hot");
      return core.tasks.get(taskId)!;
    },
    send: async (taskId: string, text: string) => (told.push([taskId, text]), { delivered: "prompted" as const }),
    interrupt: async () => {},
    drop: async () => {},
  };
  core.setRunner(runner as unknown as Runner);
  return { core, gh, opened, told, calls, ts: core.taskSources, ho: core.taskSources.handover!, advance: (ms: number) => (clock += ms) };
}

async function until(ok: () => unknown, ms = 3000) {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 10));
  }
}
async function sorted(b: ReturnType<typeof boot>) {
  await b.ts.add("github");
  await b.ts.look();
  await until(() => b.ts.view().pile?.sortedAt && !b.ts.view().pile?.sorting);
}
const report = (b: ReturnType<typeof boot>, taskId: string, state: "done" | "failed", summary: string, pr?: string) => {
  b.core.log.append({ stream: `task:${taskId}`, origin: "task", kind: "report", body: { taskId, state, summary, questions: [], evidence: pr ? [{ kind: "url", label: "PR", ref: pr }] : [] } });
  b.core.tasks.setState(taskId, state === "done" ? "done_claimed" : "failed", "cold");
};
const decisions = (b: ReturnType<typeof boot>) => b.core.log.read({ stream: "channel", kinds: ["decision"], limit: 200 }).map((e) => e.body as Bodies["decision"]);

test("the shape by code's table: one is one task; errands as one; a subject or 4+ in one repo plan first; 2–3 in one repo in line; across repos side by side", () => {
  const gh = (where: string) => ({ kind: "github", where });
  const ob = { kind: "obsidian" };
  expect(defaultShape({ items: [gh("a/b")] })).toBeUndefined();
  expect(defaultShape({ items: [ob, ob, ob] })).toBe("one");
  expect(defaultShape({ items: [gh("a/b"), gh("a/c")], bySubject: true })).toBe("plan");
  expect(defaultShape({ items: [gh("a/b"), gh("a/b"), gh("a/b"), gh("a/b")] })).toBe("plan");
  expect(defaultShape({ items: [gh("a/b"), gh("A/B"), gh("a/b")] })).toBe("one_by_one");
  expect(defaultShape({ items: [gh("a/b"), gh("a/c")] })).toBe("side_by_side");
  expect(canBeOne([gh("a/b"), gh("a/c")])).toBe(false);
  expect(canBeOne([gh("a/b"), gh("a/b")])).toBe(true);
});

test("D428 the model's meaning is read strictly: ids in range, once each, sure or maybe, a short why", () => {
  expect(parseMeaning('x {"found":[{"id":0,"sure":"high","why":"讲记忆提炼"},{"id":2,"sure":"maybe"},{"id":2},{"id":9},{"id":"1"}]} y', 3)).toEqual({ found: [{ id: 0, sure: "high", why: "讲记忆提炼" }, { id: 2, sure: "maybe" }] });
  // The 0.1.1 answer ({ids}) still reads, every one sure.
  expect(parseMeaning('{"ids":[1]}', 3)).toEqual({ found: [{ id: 1, sure: "high" }] });
  expect(parseMeaning("nope", 3)).toBeUndefined();
});

test("where from the note's own words: a computer named as a word; a lasting where is told from a one-off", () => {
  const comps = [{ device: "local", name: "mac-mini" }, { device: "w-haswell", name: "haswell" }];
  expect(namedComputer("先别动数据库迁移。验证都去 haswell 上跑", comps)).toEqual({ device: "w-haswell", name: "haswell", said: "haswell" });
  expect(namedComputer("run it on haswellx", comps)).toBeUndefined();
  expect(lastingWhere("验证都去 haswell 上跑")).toBe(true);
  expect(lastingWhere("这次在 haswell 上跑")).toBe(false);
});

test("the plan's report is read strictly: unknown refs dropped, each placed once, the unplaced go last in line", () => {
  const refs = ["acme/mem#1", "acme/mem#2", "acme/mem#3", "acme/mem#4"];
  const p = parsePlan({ fixed: [{ ref: "#1", where: "PR #360" }], one: [{ refs: ["acme/mem#2", "acme/mem#9"], title: "合起来", why: "同一处" }], line: [{ refs: ["acme/mem#2"] }], limits: ["不动迁移", 3] }, refs, { repo: "acme/mem" });
  expect(p.fixed).toEqual([{ ref: "acme/mem#1", where: "PR #360" }]);
  expect(p.one.map((x) => x.refs)).toEqual([["acme/mem#2"]]);
  expect(p.line.map((x) => x.refs)).toEqual([["acme/mem#3"], ["acme/mem#4"]]);
  expect(p.line.map((x) => x.step)).toEqual([1, 2]);
  expect(p.limits).toEqual(["不动迁移"]);
  expect(p.read).toEqual({ n: 4, repo: "acme/mem" });
});

test("the sort names a subject per to-do; the pile shows 讲的是 past 20 open, a subject of 3+, one name however it was written", async () => {
  const b = boot();
  await sorted(b);
  const v = b.ts.view().pile!;
  expect(v.read).toBeGreaterThan(20);
  const mem = v.subjects!.find((s) => s.name === "记忆提炼")!;
  // "Memory distill" and "记忆提炼" are two names; the sort's prompt asks to reuse; code merges only spelling.
  expect(mem.n).toBeGreaterThanOrEqual(6);
  expect(v.subjects!.every((s) => s.n >= 3)).toBe(true);
});

test("find: meaning across languages in one cached call, each with why; every sort group; the sure ones ticked; the subject is their words", async () => {
  const b = boot();
  await sorted(b);
  const r = await b.ho.find({ query: "distill" });
  const refs = r.items.map((p) => p.item.ref);
  expect(refs).toContain("acme/mem#366"); // Chinese title: by meaning
  expect(refs).toContain("acme/mem#351"); // its label says distillation, its title doesn't: the model's, never code's
  expect(r.items.find((p) => p.item.ref === "acme/mem#366")!.by).toBe("meaning");
  expect(r.items.find((p) => p.item.ref === "acme/mem#351")!.by).toBe("meaning");
  expect(r.items.every((p) => p.because === "讲记忆提炼" && p.sure === "high")).toBe(true);
  expect(new Set(r.items.map((p) => p.group))).toEqual(new Set(["do", "decide", "later"]));
  expect(r.items[0]!.group).toBe("do"); // do first
  // D428: a kind of thing (no facts) ticks the sure do ones, at most TICK_MAX.
  expect(r.ticked).toEqual(r.items.filter((p) => p.group === "do").map((p) => p.item.ref));
  expect(r.found).toMatchObject({ n: 8, subject: "distill", byLabel: 0 });
  await b.ho.find({ query: "distill" });
  expect(b.calls.finds).toBe(1); // cached until the next sort
  const chip = await b.ho.find({ subject: "记忆提炼" });
  expect(chip.items.every((p) => p.by === "subject")).toBe(true);
});

test("D396 the words split by clause: what to find, and the note word for word; filler around the subject dropped", () => {
  expect(splitWords("关于 distill 的，先别动数据库")).toEqual({ about: "distill", note: "先别动数据库" });
  expect(splitWords("那些关于记忆提炼的都交给你，先别动数据库迁移，验证都去 haswell 上跑。")).toEqual({ about: "记忆提炼", note: "先别动数据库迁移，验证都去 haswell 上跑。" });
  expect(splitWords("everything about offline mode, but don't touch the sync schema")).toEqual({ about: "offline mode", note: "don't touch the sync schema" });
  expect(splitWords("sign-in issues; run every check on haswell")).toEqual({ about: "sign-in", note: "run every check on haswell" });
  expect(splitWords("搬家的事，下周六前搞定，预算 3000")).toEqual({ about: "搬家", note: "下周六前搞定，预算 3000" });
  // Only a subject: no note; only a how: the whole stays the subject (nothing found is said, not guessed).
  expect(splitWords("memory distill")).toEqual({ about: "memory distill" });
  expect(splitWords("关于登录的")).toEqual({ about: "登录" });
  expect(splitWords("#405")).toEqual({ about: "#405" });
  expect(aboutOf("the ones about the importer")).toBe("importer");
});

test("D396 find by words: the subject by code, the note beside it; the model's split kept only when it is their words; suggestions put what they handed over first", async () => {
  const b = boot();
  await sorted(b);
  const r = await b.ho.find({ words: "关于 distill 的，先别动数据库" });
  expect(r.said).toMatchObject({ about: "distill", note: "先别动数据库", by: "code", facets: [{ key: "about", kind: "about", text: "关于 distill" }] });
  expect(r.query).toBe("distill");
  expect(r.found.n).toBe(8);
  expect(r.suggest).toContain("记忆提炼"); // the pile's biggest subjects
  // The note heard in the words names a computer: it wins Where over the computer with the clone (D395's order).
  const w = await b.ho.find({ words: "关于 distill 的，先别动数据库迁移，验证都去 haswell 上跑" });
  expect(w.said?.note).toBe("先别动数据库迁移，验证都去 haswell 上跑");
  const how = await b.ho.how({ refs: w.ticked, note: w.said!.note!, bySubject: true });
  expect(how.where).toMatchObject({ device: "w-haswell", name: "haswell", why: "note", said: "haswell" });
  const plain = await b.ho.how({ refs: w.ticked, bySubject: true });
  expect(plain.where.why).not.toBe("note");
  // The conversation's set: the same split, the note kept on the set.
  const s = await b.ho.set({ query: "关于 distill 的，先别动数据库" });
  expect(s.query).toBe("distill");
  expect(s.note).toBe("先别动数据库");
  expect(s.found.n).toBe(8);
  // Nothing asked: only the suggestions.
  const none = await b.ho.find({});
  expect(none.items.length).toBe(0);
  expect(none.suggest.length).toBeGreaterThan(0);
  // A subject handed over leads the suggestions next time.
  const h = await b.ho.hand({ refs: ["acme/web#1001", "acme/web#1003"], subject: "错字", bySubject: true });
  await b.ho.idle();
  expect(h).toMatchObject({ ok: true });
  expect((await b.ho.find({})).suggest[0]).toBe("错字");
});

test("how: the note's computer fills where (and is lasting); else the computer with the repository; plan first for a subject set", async () => {
  const b = boot();
  await sorted(b);
  const r = await b.ho.find({ query: "distill" });
  const h = await b.ho.how({ refs: r.ticked, note: "先别动数据库迁移。验证都去 haswell 上跑。", bySubject: true });
  expect(h.shape).toBe("plan");
  expect(h.shapes).toEqual(["plan", "one", "one_by_one", "side_by_side"]);
  expect(h.repo).toBe("acme/mem");
  expect(h.where).toMatchObject({ device: "w-haswell", name: "haswell", why: "note", hasRepo: true });
  expect(h.lasting).toBe(true);
  const h2 = await b.ho.how({ refs: r.ticked.slice(0, 2) });
  expect(h2.shape).toBe("one_by_one");
  expect(h2.where).toMatchObject({ why: "repo", said: "acme/mem" });
  const one = await b.ho.how({ refs: r.ticked.slice(0, 1) });
  expect(one.shape).toBeUndefined();
  expect(one.shapes).toEqual([]);
});

test("one to-do with a note: one task, the note quoted at the top of its brief, on the computer the note names, in its folder there", async () => {
  const b = boot();
  await sorted(b);
  const r = await b.ho.hand({ refs: ["acme/mem#398"], note: "验证去 haswell 上跑" });
  await b.ho.idle();
  expect(r).toMatchObject({ ok: true, handed: 1 });
  const o = b.opened[0]!;
  expect(o.brief.startsWith("The person's note")).toBe(true);
  expect(o.brief).toContain("<person-note>\n验证去 haswell 上跑\n</person-note>");
  expect(o.brief).toContain('Fixes acme/mem#398');
  expect(o.place).toMatchObject({ kind: "repo", device: "w-haswell", repoPath: "/home/lin/mem" });
  // D638: Go answers before the task opens; the binding lands when it does.
  expect(b.ts.taskOf("acme/mem#398")?.taskId).toBe("t1");
  expect(b.ts.pile.all().some((p) => p.item.ref === "acme/mem#398")).toBe(false);
  // Not lasting ("去", no "都"): no rule is asked.
  expect(decisions(b).some((d) => d.src?.kind === "where_rule")).toBe(false);
});

test("plan first: a read-only lead part; its typed plan becomes a card (no default); Go opens the parts in line with their notes; fixed ones wait for review", async () => {
  const b = boot();
  await sorted(b);
  const found = await b.ho.find({ query: "distill" });
  const refs = [...found.ticked, "acme/mem#405"];
  const r = await b.ho.hand({ refs, note: "先别动数据库迁移。验证都去 haswell 上跑。", bySubject: true, shape: "plan", subject: "记忆提炼" });
  await b.ho.idle();
  expect(r).toMatchObject({ ok: true, shape: "plan" });
  const g = () => b.core.taskGroups.get(r.groupId!)!;
  expect(g().name).toBe("记忆提炼");
  expect(g().hand).toMatchObject({ shape: "plan", note: "先别动数据库迁移。验证都去 haswell 上跑。", where: { device: "w-haswell", name: "haswell" }, plan: { taskId: "t1", state: "planning" } });
  expect(b.opened.length).toBe(1); // nothing else starts before the plan
  expect(b.opened[0]!.brief).toContain("Change nothing");
  expect(b.opened[0]!.brief).toContain("plan_report");
  // Held off the pile while planning.
  expect(b.ts.pile.all().some((p) => refs.includes(p.item.ref))).toBe(false);
  // The lasting where is asked once as a rule.
  expect(decisions(b).filter((d) => d.src?.kind === "where_rule").length).toBe(1);
  // The tool is the plan task's only.
  expect(b.core.mcp.tools("task")).toContain("plan_report");
  const plan = { fixed: [{ ref: "acme/mem#351", where: "PR #360", comment: "This was fixed in #360 (merged). Closing." }], one: [{ refs: ["acme/mem#398", "acme/mem#412", "acme/mem#405"], title: "失败时退一步，并重试一次", why: "改的是同一处" }], line: [{ refs: ["acme/mem#377"], title: "组包变快", why: "先做：后面用到它" }, { refs: ["acme/mem#340"], title: "第一次就成功", why: "从 #377 的分支接着做" }], limits: ["都在 haswell 上验证", "不动数据库迁移"] };
  expect(await b.core.mcp.call({ role: "task", taskId: "t1" } as never, "plan_report", plan)).toContain("Plan kept");
  expect(b.ts.wakes({ kind: "report", body: { taskId: "t1", state: "done" } } as never)).toBe(false);
  report(b, "t1", "done", "看完了：一件已经修好，其余排成三步。");
  await until(() => g().hand?.plan?.state === "ready");
  const card = decisions(b).find((d) => d.src?.kind === "plan")!;
  expect(card).toMatchObject({ question: "记忆提炼：方案", goLabel: "照这个做", holdLabel: "先等等", defaultOption: "hold" });
  expect(card.defaultAt).toBeUndefined();
  expect(card.src!.plan!.fixed.map((f) => f.ref)).toEqual(["acme/mem#351"]);
  // Go with a note on the second part.
  const ans = await b.ho.answerPlan(r.groupId!, "go", { notes: { p2: "组包别改公开接口" } });
  expect(ans.ok).toBe(true);
  await until(() => b.opened.length === 3);
  // As one task and the first in line open; the next waits for #377.
  expect(b.opened[1]!.brief).toContain("One task for these 3 to-dos");
  expect(b.opened[1]!.brief).toContain('"Fixes acme/mem#398", "Fixes acme/mem#412", "Fixes acme/mem#405"');
  expect(b.opened[2]!.brief).toContain("<person-note>\n组包别改公开接口\n</person-note>");
  expect(b.opened[2]!.place).toMatchObject({ device: "w-haswell" });
  expect(g().members.filter((m) => "key" in m).length).toBe(1);
  expect(g().hand?.fixed?.map((f) => f.ref)).toEqual(["acme/mem#351"]);
  expect(b.core.log.read({ stream: "channel", kinds: ["decision_resolved"], limit: 50 }).some((e) => (e.body as Bodies["decision_resolved"]).decisionId === card.decisionId)).toBe(true);
  // The line moves: #377 done → #340 opens from its branch.
  report(b, "t3", "done", "组包线性了", "https://github.com/acme/mem/pull/421");
  await until(() => b.opened.length === 4);
  expect(b.opened[3]!.brief).toContain("part 2 of 2");
  // Every part done → review together.
  report(b, "t2", "done", "失败时退回并重试一次", "https://github.com/acme/mem/pull/420");
  report(b, "t4", "done", "先检查每一条", "https://github.com/acme/mem/pull/422");
  await until(() => g().hand?.review === "ready");
  const rev = (await b.ho.review(r.groupId!))!;
  expect(rev.rows.length).toBe(4);
  expect(rev).toMatchObject({ prs: 3, fixed: 1 });
  const fixedRow = rev.rows.find((x) => x.fixedIn)!;
  expect(fixedRow).toMatchObject({ close: true, comment: "This was fixed in #360 (merged). Closing." });
  expect(rev.rows.find((x) => x.taskId === "t2")!.comment).toBe("Fixed in #420.");
  // A part's own write-back waits for review together.
  expect(await b.ts.propose({ taskId: "t2", text: "x" })).toMatchObject({ ok: true, held: true });
  // One Go: every comment, the fixed one also closes; nothing else closes.
  const keep = rev.rows.flatMap((x) => x.items.map((i) => i.ref)).filter((x) => x !== "acme/mem#340");
  const sent = await b.ho.reviewSend(r.groupId!, keep);
  expect(sent).toMatchObject({ ok: true, done: keep.length, failed: 0 });
  expect(b.gh.comments.length).toBe(keep.length);
  expect(b.gh.closes.map((c) => c.number)).toEqual([351]);
  expect(g().hand?.review).toBe("sent");
});

test("review together: a fixed comment names each item's own merged PR; an open PR gets no fixed line and is not sent", async () => {
  // hel's shape (research/244 rule 9, seq 83456): three issues, one PR still open (#11230), another
  // merged (#11163) covering two of them. The old card said "Fixed in #11230." on all three.
  const b = boot(undefined, { "acme/mem#11230": "open", "acme/mem#11163": "merged" });
  await sorted(b);
  const refs = ["acme/mem#11115", "acme/mem#11108", "acme/mem#11156"];
  const r = await b.ho.hand({ refs, shape: "one_by_one" });
  await b.ho.idle();
  const g = () => b.core.taskGroups.get(r.groupId!)!;
  report(b, "t1", "done", "设置卡的焦点环好了，PR 开着等评审。", "https://github.com/acme/mem/pull/11230");
  await until(() => b.opened.length === 2);
  report(b, "t2", "done", "标签修好了，和 #11156 一起合的。", "https://github.com/acme/mem/pull/11163");
  await until(() => b.opened.length === 3);
  report(b, "t3", "done", "滚动也好了。", "https://github.com/acme/mem/pull/11163");
  await until(() => g().hand?.review === "ready");
  const rev = (await b.ho.review(r.groupId!))!;
  const open = rev.rows.find((x) => x.items.some((i) => i.ref === "acme/mem#11115"))!;
  // The open PR's row says what is true and is never called fixed.
  expect(open.merged).toBe(false);
  expect(open.comment).not.toContain("Fixed in");
  expect(open.comment).toContain("#11230");
  const fixed = rev.rows.filter((x) => x.merged);
  expect(fixed.flatMap((x) => x.items.map((i) => i.ref))).toEqual(["acme/mem#11108", "acme/mem#11156"]);
  for (const row of fixed) expect(row.comment).toBe("Fixed in #11163.");
  // One Go sends only the two true comments; the open one is left out with its reason.
  const sent = await b.ho.reviewSend(r.groupId!, refs);
  expect(sent).toMatchObject({ ok: true, done: 2, failed: 0 });
  expect(b.gh.comments.map((c) => c.body)).toHaveLength(2);
  for (const c of b.gh.comments) {
    expect(c.body).toContain("Fixed in #11163.");
    expect(c.body).not.toContain("#11230");
  }
  // The card names every item it comments on, and the exact words for each.
  const card = decisions(b).find((d) => d.src?.kind === "group_review")!;
  expect(card.src!.items!.map((x) => x.item.ref)).toEqual(["acme/mem#11108", "acme/mem#11156"]);
  expect(card.src!.items!.map((x) => x.text)).toEqual(["Fixed in #11163.", "Fixed in #11163."]);
  expect(card.question).toBe("在这 2 个下面留言？");
});

test("plan first: Hold keeps it waiting; a reply goes to the plan's own task, which plans again in place", async () => {
  const b = boot();
  await sorted(b);
  const found = await b.ho.find({ query: "distill" });
  const r = await b.ho.hand({ refs: found.ticked, bySubject: true });
  await b.ho.idle();
  expect(r.shape).toBe("plan");
  await b.core.mcp.call({ role: "task", taskId: "t1" } as never, "plan_report", { side: [{ refs: found.ticked }] });
  report(b, "t1", "done", "好了");
  const g = () => b.core.taskGroups.get(r.groupId!)!;
  await until(() => g().hand?.plan?.state === "ready");
  expect((await b.ho.answerPlan(r.groupId!, "hold")).ok).toBe(true);
  expect(g().hand?.plan?.state).toBe("held");
  expect((await b.ho.answerPlan(r.groupId!, "reply", { text: "#412 单独做" })).ok).toBe(true);
  expect(b.told.at(-1)![0]).toBe("t1");
  expect(b.told.at(-1)![1]).toContain("#412 单独做");
  expect(g().hand?.plan?.state).toBe("planning");
  expect(b.opened.length).toBe(1);
});

test("side by side: three at a time, each bound to its own to-do; the next opens when one ends", async () => {
  const b = boot();
  await sorted(b);
  const small = b.ts.pile.all().filter((p) => p.item.title.startsWith("Small")).slice(0, 5).map((p) => p.item.ref);
  const h = await b.ho.how({ refs: small });
  expect(h.shape).toBe("side_by_side");
  const r = await b.ho.hand({ refs: small, shape: "side_by_side" });
  await b.ho.idle();
  expect(r.ok).toBe(true);
  await until(() => b.opened.length === 3);
  await new Promise((res) => setTimeout(res, 30));
  expect(b.opened.length).toBe(3);
  expect(b.ts.taskOf(small[0]!)?.taskId).toBe("t1");
  report(b, "t1", "done", "ok");
  await until(() => b.opened.length === 4);
});

test("as one task: one task bound to all, its brief says Fixes each; the group shows with its one task", async () => {
  const b = boot();
  await sorted(b);
  const r = await b.ho.hand({ refs: ["acme/mem#398", "acme/mem#412"], shape: "one", note: "一个 PR" });
  await b.ho.idle();
  expect(r.ok).toBe(true);
  expect(b.opened.length).toBe(1);
  expect(b.opened[0]!.brief).toContain('"Fixes acme/mem#398", "Fixes acme/mem#412"');
  expect(b.core.taskGroups.list().find((g) => g.id === r.groupId)!.hand!.parts).toEqual({ t1: ["acme/mem#398", "acme/mem#412"] });
  expect(b.ts.pile.all().some((p) => p.item.ref === "acme/mem#412")).toBe(false);
});

test("the conversation's set: a card under the partner's line with the do ones ticked; handing it over marks the card with its group", async () => {
  const b = boot();
  await sorted(b);
  const s = await b.ho.set({ query: "memory distill" });
  expect(s.rows.length).toBe(4);
  expect(s.found.n).toBe(8);
  const ev = b.core.log.read({ stream: "channel", kinds: ["todo_set"], limit: 5 });
  expect(ev.length).toBe(1);
  const r = await b.ho.hand({ refs: s.ticked, setId: s.setId, bySubject: true });
  await b.ho.idle();
  expect(r.ok).toBe(true);
  const after = b.core.log.read({ stream: "channel", kinds: ["todo_set"], limit: 5 }).map((e) => e.body as Bodies["todo_set"]);
  expect(after.at(-1)!.groupId).toBe(r.groupId!);
});

test("adding later: into a live group still planning, the to-do goes to the plan task as a follow-up", async () => {
  const b = boot();
  await sorted(b);
  const found = await b.ho.find({ query: "distill" });
  const r = await b.ho.hand({ refs: found.ticked.slice(0, 4), bySubject: true, subject: "记忆提炼" });
  await b.ho.idle();
  const h = await b.ho.how({ refs: [found.ticked[4]!], subject: "记忆提炼" });
  expect(h.addTo).toMatchObject({ groupId: r.groupId, name: "记忆提炼", planning: true });
  const add = await b.ho.hand({ refs: [found.ticked[4]!], group: r.groupId! });
  await b.ho.idle();
  expect(add.ok).toBe(true);
  expect(b.told.at(-1)![0]).toBe("t1");
  expect(b.core.taskGroups.get(r.groupId!)!.hand!.items.length).toBe(5);
});

// D395 (the author on 0.0.90): the sheet's 在哪儿做 for acme/mem defaulted to the server home with
// no clone. The sheet and the tasks it opens use the one resolver task_open uses.
test("D395: the sheet's Where is the computer with the clone, never a server home without one; the task opens in that clone", async () => {
  const b = boot({ macHas: "/Users/lin/dev/mem" });
  await sorted(b);
  const h = await b.ho.how({ refs: ["acme/mem#398", "acme/mem#412"] });
  expect(h.where).toMatchObject({ device: "w-mac", name: "MacBook", why: "repo", hasRepo: true });
  expect(h.wheres.find((w) => w.device === "local")?.hasRepo).toBeFalsy();
  const r = await b.ho.hand({ refs: ["acme/mem#398"] });
  await b.ho.idle();
  expect(r).toMatchObject({ ok: true, handed: 1 });
  expect(b.opened[0]!.place).toMatchObject({ kind: "repo", device: "w-mac", repoPath: "/Users/lin/dev/mem" });
});

test("D395: no computer has it: the sheet's Where says it is cloned on the computer that can read it, and the task clones it there first", async () => {
  const b = boot({ macReads: true });
  await sorted(b);
  const h = await b.ho.how({ refs: ["acme/mem#398"] });
  expect(h.where).toMatchObject({ device: "w-mac", name: "MacBook", clone: true });
  expect(h.where.hasRepo).toBeFalsy();
  await b.ho.hand({ refs: ["acme/mem#398"] });
  await b.ho.idle();
  expect(b.opened[0]!.place).toMatchObject({ kind: "repo", device: "w-mac", clone: "acme/mem" });
});

// ---------- D415: the author on 0.0.99 ("github task-aware 的 flow 就走不下去", "分类只能是自动分类？") ----------

test("D415: as one task: titled by its own to-dos (the first, and how many more), the group carries the subject; its branch names the issues", async () => {
  const b = boot();
  await sorted(b);
  const r = await b.ho.hand({ refs: ["acme/mem#398", "acme/mem#412"], shape: "one", subject: "通用设置", bySubject: true });
  await b.ho.idle();
  expect(r.ok).toBe(true);
  expect(b.opened[0]!.title).toBe("Automatic distillation: the error says nothing… 等 1 个");
  expect(b.opened[0]!.title).not.toContain("通用设置");
  // D522: the numbers go with it; the runner's slug writer puts ASCII words after them.
  expect(b.opened[0]!).toMatchObject({ todo: "398-412", place: { kind: "repo" } });
  expect((b.opened[0]!.place as { branch?: string }).branch).toBeUndefined();
  const g = b.core.taskGroups.get(r.groupId!)!;
  expect(g.name).toBe("通用设置");
  expect(g.hand!.subject).toBe("通用设置");
  // One to-do: its own title and its own number on the branch.
  await b.ho.hand({ refs: ["acme/mem#377"] });
  await b.ho.idle();
  expect(b.opened[1]!).toMatchObject({ title: "Distillation gets slow on very long threads", todo: "377" });
});

const NOTE = "确保这些任务都没开始，然后再 issue 里留言说一下 我的 ducter agent 要开始做了";

test("D415: a note that asks to comment first: one card, nothing starts; Go comments on each, then starts, and the brief says it went", async () => {
  const b = boot();
  await sorted(b);
  const r = await b.ho.hand({ refs: ["acme/mem#398", "acme/mem#412"], shape: "one", note: NOTE });
  await b.ho.idle();
  expect(r).toMatchObject({ ok: true, handed: 0 });
  expect(r.asked).toBeTruthy();
  expect(b.opened.length).toBe(0);
  const card = decisions(b).find((d) => d.decisionId === r.asked)!;
  expect(card).toMatchObject({ question: "先在这 2 个下面留一句，再开始？", goLabel: "留言并开始", holdLabel: "只开始，不留言", src: { kind: "hand_comment", text: "我的 ducter agent 要开始做了" } });
  expect(card.src!.items!.map((x) => x.item.ref)).toEqual(["acme/mem#398", "acme/mem#412"]);
  // Held while it asks: not on the pile to be handed twice.
  expect(b.ts.pile.all().some((p) => p.item.ref === "acme/mem#398")).toBe(false);
  b.core.log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: r.asked!, option: "go", by: "user" } });
  await until(() => b.opened.length === 1);
  expect(b.gh.comments.map((c) => c.number)).toEqual([398, 412]);
  for (const c of b.gh.comments) expect(c.body.startsWith("我的 ducter agent 要开始做了")).toBe(true);
  expect(b.opened[0]!.brief).toContain('Ducter already left the comment the person\'s note asked for, on acme/mem#398, acme/mem#412: "我的 ducter agent 要开始做了". Don\'t comment again.');
  const said = b.core.log.read({ stream: "channel", kinds: ["ai_msg"], limit: 20 }).map((e) => (e.body as Bodies["ai_msg"]).text);
  expect(said.at(-1)).toBe("按你说的，先在 #398、#412 下留了言：「我的 ducter agent 要开始做了」，然后开始做。");
  const writes = b.core.log.read({ stream: "channel", kinds: ["source_write"], limit: 20 }).map((e) => e.body as Bodies["source_write"]);
  expect(writes.map((w) => [w.op, w.by, w.decisionId])).toEqual([["comment", "go", r.asked], ["comment", "go", r.asked]]);
});

test("D415: 只开始，不留言 starts without a comment; inside a standing permission (D413) the comment goes without a card", async () => {
  const b = boot();
  await sorted(b);
  const r = await b.ho.hand({ refs: ["acme/mem#398"], note: "先在 issue 里留言说一声再开始" });
  await b.ho.idle();
  expect(decisions(b).find((d) => d.decisionId === r.asked)!.question).toBe("先在 acme/mem#398 下留一句，再开始？");
  b.core.log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: r.asked!, option: "hold", by: "user" } });
  await until(() => b.opened.length === 1);
  expect(b.gh.comments.length).toBe(0);
  expect(b.opened[0]!.brief).not.toContain("already left the comment");
  // "在 acme 的 issue 里留言不用问我": the partner keeps it (D495: without_asking, as here); the next
  // such note comments without asking.
  const said = b.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "以后在 acme 的 issue 里留言不用问我，直接发" } });
  b.core.standing.hear(`tool:${said.seq}`, { kind: "grant", action: "issue_comment", orgs: ["acme"], quote: "以后在 acme 的 issue 里留言不用问我，直接发" }, said.ts, said.seq);
  await until(() => b.core.standing.list().some((s) => s.action === "issue_comment"));
  expect(b.core.standing.list().find((s) => s.action === "issue_comment")!.orgs).toEqual(["acme"]);
  const n = decisions(b).length;
  const r2 = await b.ho.hand({ refs: ["acme/mem#377"], note: "comment on the issue first saying my agent is on it" });
  await b.ho.idle();
  expect(r2).toMatchObject({ ok: true, handed: 1 });
  expect(decisions(b).length).toBe(n);
  expect(b.gh.comments.map((c) => c.number)).toEqual([377]);
  expect(b.gh.comments[0]!.body.startsWith("my agent is on it")).toBe(true);
  const w = b.core.log.read({ stream: "channel", kinds: ["source_write"], limit: 20 }).map((e) => e.body as Bodies["source_write"]).at(-1)!;
  expect(w).toMatchObject({ op: "comment", by: "rule", standing: expect.any(String) });
});

test("D415: own subjects: put, find by membership, take out, rename, merge, remove; a re-sort never undoes them", async () => {
  const b = boot();
  await sorted(b);
  const pile = b.ts.pile;
  // "把这几个归到「通用设置」": a new subject, first among the chips, shown whatever its size.
  expect(pile.subject({ op: "put", name: "「通用设置」", refs: ["acme/mem#1002", "acme/mem#1006"] })).toMatchObject({ ok: true, name: "通用设置", n: 2 });
  expect(b.ts.view().pile!.subjects![0]).toEqual({ name: "通用设置", n: 2, own: true });
  const f = await b.ho.find({ subject: "通用设置" });
  expect(f.items.map((p) => [p.item.ref, p.by])).toEqual(expect.arrayContaining([["acme/mem#1002", "subject"], ["acme/mem#1006", "subject"]]));
  expect(f.items.length).toBe(2);
  // Out of a subject: the to-do carries none (not its old sort subject either).
  expect(pile.subject({ op: "take", name: "通用设置", refs: ["acme/mem#1006"] })).toMatchObject({ ok: true, name: "通用设置", n: 1, out: 1 });
  expect(pile.subjectOf("acme/mem#1006")).toBeUndefined();
  expect(b.ts.view().pile!.subjects![0]).toEqual({ name: "通用设置", n: 1, own: true });
  // Rename the sort's own subject, then merge it into the person's.
  const typos = b.ts.view().pile!.subjects!.find((s) => s.name === "错字")!.n;
  pile.subject({ op: "rename", name: "错字", to: "文案" });
  expect(b.ts.view().pile!.subjects!.find((s) => s.name === "文案")).toEqual({ name: "文案", n: typos, own: true });
  pile.subject({ op: "rename", name: "文案", to: "通用设置" });
  expect(b.ts.view().pile!.subjects!.find((s) => s.name === "通用设置")!.n).toBe(typos + 1);
  expect(b.ts.view().pile!.subjects!.some((s) => s.name === "文案" || s.name === "错字")).toBe(false);
  // Remove one of the sort's: gone from the chips and from its to-dos.
  pile.subject({ op: "remove", name: "页面" });
  expect(b.ts.view().pile!.subjects!.some((s) => s.name === "页面")).toBe(false);
  // A re-sort (another language reads every to-do again): what the person said stands.
  b.core.settings.set({ language: "en" });
  await pile.sort("asked");
  b.core.settings.set({ language: "zh" });
  await pile.sort("asked");
  const v = b.ts.view().pile!;
  expect(v.subjects![0]).toMatchObject({ name: "通用设置", own: true, n: typos + 1 });
  expect(v.subjects!.some((s) => s.name === "页面")).toBe(false);
  expect(pile.subjectOf("acme/mem#1006")).toBeUndefined();
  // Handed over as a set: the group carries the person's subject.
  const set = await b.ho.find({ subject: "通用设置" });
  const r = await b.ho.hand({ refs: set.ticked.slice(0, 2), subject: "通用设置", bySubject: true, shape: "side_by_side" });
  await b.ho.idle();
  expect(b.core.taskGroups.get(r.groupId!)!.name).toBe("通用设置");
});

test("D415: an own subject shows on a small pile too; one made with nothing in it yet is kept", async () => {
  const b = boot();
  await sorted(b);
  b.ts.pile.subject({ op: "make", name: "设置页" });
  expect(b.ts.view().pile!.subjects!.find((s) => s.name === "设置页")).toEqual({ name: "设置页", n: 0, own: true });
  expect(b.ts.pile.subject({ op: "put", name: "", refs: ["acme/mem#1002"] })).toMatchObject({ ok: false });
});
