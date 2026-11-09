// The long-conversation memory: closing, writing, the audit, freezing, the ledger, roll-up,
// restart, the projection, and the recall gate. Real SQLite Log, fake writers, fake clock.
import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import type { Bodies, LogEvent } from "../../protocol/src/index.ts";
import { openLog, type SqliteLog } from "../../core/src/log.ts";
import { audit } from "../src/spine/audit.ts";
import { computeLedger, renderDigest, type SegmentDigest } from "../src/spine/digest.ts";
import { autoRecall, recallIntent } from "../src/spine/recall.ts";
import { chooseCut, identifiers, topicDone, type Unit } from "../src/spine/segment.ts";
import { createSpine, memorySpineStore } from "../src/spine/spine.ts";
import { assemble, parseDigest, type DigestWriter, type WriterInput } from "../src/spine/writer.ts";
import { renderHistoryLine, type RenderCtx } from "../src/render.ts";
import { estTokens } from "../src/spine/digest.ts";
import { createPartner } from "../src/partner.ts";
import { FakeClock, fakeCore, fakeRunner } from "./fakes.ts";

const ctx: RenderCtx = { taskTitle: () => undefined, decision: () => undefined };
const line = (e: LogEvent) => renderHistoryLine(e, ctx);
const SMALL = { hiTokens: 600, loTokens: 200, minTokens: 150, quietMs: 3600_000, gapMs: 30 * 60_000 };

let dirs: string[] = [];
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

function world() {
  const dir = mkdtempSync(join(tmpdir(), "ducter-spine-"));
  dirs.push(dir);
  let t = Date.parse("2026-11-03T09:00:00Z");
  const clock = { now: () => t };
  const log: SqliteLog = openLog({ path: join(dir, "ducter.db"), persona: "p1", clock });
  const user = (text: string) => ((t += 60_000), log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text } }));
  const ai = (text: string) => ((t += 30_000), log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text } }));
  const task = (taskId: string, title: string) => {
    t += 10_000;
    log.append({ stream: "channel", origin: "partner", kind: "ack", body: { jobId: `job_${taskId}`, text: `好，我去做：${title}`, replyTo: log.head() } });
    return log.append({ stream: "channel", origin: "partner", kind: "job_status", body: { jobId: `job_${taskId}`, text: title, state: "running", taskId } });
  };
  const done = (taskId: string, summary: string) => {
    t += 60_000;
    return log.append({ stream: "channel", origin: "task", kind: "report", body: { taskId, state: "done", summary, questions: [], evidence: [] } });
  };
  return { dir, log, clock, user, ai, task, done, advance: (ms: number) => (t += ms) };
}

const units = (log: SqliteLog): Unit[] =>
  log.read({ stream: "channel", fromSeq: 1 }).map((e) => {
    const l = `#${e.seq} ${line(e)}`;
    return { e, line: l, tokens: estTokens(l) };
  });

/** A writer that reads the segment like a careful model would, from fixed cues in the lines. */
function cueWriter(): DigestWriter & { calls: WriterInput[] } {
  const calls: WriterInput[] = [];
  return {
    name: "cue",
    calls,
    async write(i) {
      calls.push(i);
      const users = i.units.filter((u) => u.e.kind === "user_msg");
      const decisions = users
        .filter((u) => /就用|定了|改成|decided|let's use/i.test((u.e.body as Bodies["user_msg"]).text))
        .map((u) => {
          const text = (u.e.body as Bodies["user_msg"]).text;
          const sup = /改成/.test(text) ? i.inForce[i.inForce.length - 1]?.id : undefined;
          return { text, at: u.e.seq, ...(sup ? { supersedes: sup } : {}) };
        });
      return JSON.stringify({
        toc: [{ from: i.from, to: i.to, gist: (users[0]?.e.body as Bodies["user_msg"] | undefined)?.text.slice(0, 40) ?? "work", keys: i.mustKeep }],
        decisions,
        superseded: decisions.filter((d) => d.supersedes).map((d) => ({ old: i.inForce.find((x) => x.id === d.supersedes)!.text, new: d.text, at: d.at })),
        anchors: decisions.map((d) => ({ at: d.at, quote: d.text.slice(0, 30) })),
        opened: i.units.length && i.units[i.units.length - 1]!.e.kind === "user_msg" ? [{ who: "me", text: "answer", at: i.units[i.units.length - 1]!.e.seq }] : [],
        closed: [],
        narrative: "A stretch of work.",
      });
    },
  };
}

test("a segment closes at a turn boundary past the budget, and never after the user's message", () => {
  const w = world();
  for (let k = 0; k < 12; k++) {
    w.user(`第 ${k} 个问题：foo 仓库里 ${"测试".repeat(20)}`);
    w.ai(`回答 ${k}：${"好的".repeat(25)}`);
  }
  const us = units(w.log);
  const c = chooseCut(us, w.clock.now(), SMALL)!;
  expect(c.reason).toBe("budget");
  const last = c.units[c.units.length - 1]!.e;
  expect(last.kind).toBe("ai_msg");
  const size = c.units.reduce((n, u) => n + u.tokens, 0);
  expect(size).toBeGreaterThanOrEqual(SMALL.hiTokens - SMALL.loTokens);
  expect(size).toBeLessThanOrEqual(SMALL.hiTokens);
  // Too little to close: nothing; quiet for long enough: all of it.
  expect(chooseCut(us.slice(0, 2), w.clock.now(), SMALL)).toBeNull();
  const some = us.slice(0, 8);
  expect(chooseCut(some, Date.parse(some[7]!.e.ts) + 2 * 3600_000, SMALL)).toMatchObject({ reason: "quiet", to: some[7]!.e.seq });
  // A trailing user message is never closed on quiet: it is still waiting for its answer.
  expect(chooseCut(us.slice(0, 7), Date.parse(us[6]!.e.ts) + 2 * 3600_000, SMALL)).toBeNull();
});

test("a topic is done on the user's merge or PR action, whatever its words say", () => {
  const ev = (jobId: string, text: string, origin: LogEvent["origin"] = "user", state: "done" | "failed" = "done") =>
    ({ seq: 1, ts: "2026-11-03T09:00:00Z", stream: "channel", origin, kind: "job_status", body: { jobId, taskId: "t1", state, text } }) as unknown as LogEvent;
  expect(topicDone(ev("act_t1_merge", "合进去了"))).toBe(true);
  expect(topicDone(ev("act_t1_open_pr", "the user opened a draft PR for this task"))).toBe(true);
  // English words alone no longer count: a stop that says "PR", or the partner's own status.
  expect(topicDone(ev("act_t1_interrupt", "stopped before the PR"))).toBe(false);
  expect(topicDone(ev("job_t1", "merged upstream", "partner"))).toBe(false);
  expect(topicDone(ev("act_t1_merge", "merge failed", "user", "failed"))).toBe(false);
});

test("identifiers: paths, files, hashes, versions, numbers with units; not plain words", () => {
  expect(identifiers("改 packages/core/src/log.ts 和 ~/dev/hawdb，commit 9f3e2a1c，v1.2.3，窗口 24K，Go/Hold")).toEqual(
    expect.arrayContaining(["packages/core/src/log.ts", "~/dev/hawdb", "9f3e2a1c", "v1.2.3", "24K"]),
  );
  expect(identifiers("zh/en and Go/Hold")).toEqual([]);
});

test("the audit catches an inexact anchor, an invented identifier, a dangling pointer and a dropped ask", () => {
  const w = world();
  w.user("数据库就用 SQLite，先别上 HawDB");
  w.ai("好，用 SQLite。");
  w.user("还有，把 packages/core/src/log.ts 的搜索改一下？");
  const us = units(w.log);
  const input: WriterInput = { id: "S0001", from: 1, to: 3, units: us, inForce: [], open: [], mustKeep: ["packages/core/src/log.ts"] };
  const good = assemble(
    parseDigest(
      JSON.stringify({
        toc: [{ from: 1, to: 3, gist: "存储与搜索", keys: ["SQLite", "packages/core/src/log.ts"] }],
        decisions: [{ text: "数据库用 SQLite", at: 1 }],
        superseded: [],
        anchors: [{ at: 1, quote: "数据库就用 SQLite" }],
        opened: [{ who: "me", text: "改 log.ts 的搜索", at: 3 }],
        closed: [],
        narrative: "定了存储。",
      }),
    ),
    input,
    { d: 0, o: 0 },
    "test",
  );
  const c = { units: us, open: [], inForce: [], mustKeep: input.mustKeep };
  expect(audit(good, c)).toEqual([]);
  const bad: SegmentDigest = {
    ...good,
    anchors: [{ at: 1, quote: "数据库用 SQLite" }], // paraphrase
    toc: [{ from: 1, to: 9, gist: "see packages/core/src/index.ts", keys: [] }], // invented path, dangling pointer, lost identifier
    opened: [],
  };
  const reasons = audit(bad, c).join("\n");
  expect(reasons).toMatch(/anchor #1.*not copied exactly/);
  expect(reasons).toMatch(/packages\/core\/src\/index\.ts" does not appear/);
  expect(reasons).toMatch(/toc row 1–9/);
  expect(reasons).toMatch(/missing identifiers.*log\.ts/);
  expect(reasons).toMatch(/ask at #3 has no obligation/);
  // The spine's own ids are pointers, not invented identifiers (real run 1: "D-6" degraded a digest).
  const cites = { ...good, narrative: "延续 D-6 的决定。" };
  expect(audit(cites, { ...c, knownIds: ["D-6"] })).toEqual([]);
  expect(audit(cites, c).join()).toMatch(/"D-6" does not appear/);
});

test("a digest that fails its audit is rewritten with the reasons, then frozen; frozen ones are never written again", async () => {
  const w = world();
  for (let k = 0; k < 10; k++) (w.user(`第 ${k} 轮：${"讨论存储".repeat(15)}`), w.ai(`${"收到".repeat(30)}`));
  const store = memorySpineStore();
  let n = 0;
  const writer: DigestWriter = {
    name: "flaky",
    async write(i) {
      n++;
      return JSON.stringify({
        toc: [{ from: i.from, to: i.to, gist: "存储", keys: i.mustKeep }],
        decisions: [],
        superseded: [],
        anchors: [{ at: i.from, quote: n === 1 ? "不存在的话" : "讨论存储" }],
        opened: [],
        closed: [],
        narrative: "讨论了存储。",
      });
    },
  };
  const spine = createSpine({ log: w.log, store, writer, line, now: w.clock.now, cut: SMALL });
  await spine.poke();
  expect(store.tries[0]).toMatchObject({ n: 1, ok: false });
  expect(store.tries[0]!.reasons.join()).toMatch(/not copied exactly/);
  expect(store.tries[1]).toMatchObject({ n: 2, ok: true });
  expect(store.records[0]!.id).toBe("S0001");
  expect(store.tries.filter((t) => !t.ok)).toHaveLength(1);
  expect(spine.stats.rewrites).toBe(1);
  // Nothing new: poking again writes nothing.
  const before = n;
  await spine.poke();
  expect(n).toBe(before);
});

test("two failed tries: repaired by removal and frozen; a writer that keeps erroring gets a mechanical index", async () => {
  const w = world();
  for (let k = 0; k < 10; k++) (w.user(`第 ${k} 轮 ${"问题".repeat(15)}`), w.ai("嗯".repeat(60)));
  const store = memorySpineStore();
  const writer: DigestWriter = {
    name: "liar",
    write: async (i) => JSON.stringify({ toc: [{ from: i.from, to: i.to, gist: "x", keys: i.mustKeep }], decisions: [], superseded: [], anchors: [{ at: i.from, quote: "我从没说过这句" }], opened: [], closed: [], narrative: "x" }),
  };
  const spine = createSpine({ log: w.log, store, writer, line, now: w.clock.now, cut: SMALL });
  await spine.poke();
  const d = store.records[0]!.body as SegmentDigest;
  expect(d.anchors).toEqual([]);
  expect(d.repaired).toEqual([`anchor #${d.from}`]);

  const w2 = world();
  for (let k = 0; k < 10; k++) (w2.user(`第 ${k} 轮 ${"问题".repeat(15)}`), w2.ai("嗯".repeat(60)));
  const store2 = memorySpineStore();
  const down: DigestWriter = { name: "down", write: async () => Promise.reject(new Error("not signed in")) };
  const s2 = createSpine({ log: w2.log, store: store2, writer: down, line, now: w2.clock.now, cut: SMALL, retryMs: 0, maxInfraFailures: 2 });
  await s2.poke();
  expect(store2.records).toHaveLength(0); // first failure: wait and retry, nothing frozen
  await s2.poke();
  const m = store2.records[0]!.body as SegmentDigest;
  expect(m.degraded).toBe(true);
  expect(m.writer).toBe("mechanical");
  expect(audit(m, { units: units(w2.log).filter((u) => u.e.seq <= m.to), open: [], inForce: [], mustKeep: [] })).toEqual([]);
});

test("the ledger: code opens and closes task obligations, decisions supersede, and a roll-up loses nothing that binds", async () => {
  const w = world();
  const pad = "，".repeat(1) + "细节".repeat(40);
  w.user(`数据库就用 SQLite${pad}`);
  w.ai(`好${pad}`);
  w.task("t_fts01", "给 Log 加中文搜索");
  w.ai(`在做了${pad}`);
  w.advance(3 * 3600_000); // quiet: part 1 closes with the task still running
  const store = memorySpineStore();
  const writer = cueWriter();
  const spine = createSpine({ log: w.log, store, writer, line, now: w.clock.now, cut: SMALL, epochAfter: 2, epochSize: 2 });
  await spine.poke();
  let led = spine.ledger();
  expect(led.open.map((o) => o.ref)).toEqual(["task:t_fts01"]);
  expect(led.inForce.map((d) => d.text.slice(0, 12))).toEqual(["数据库就用 SQLite"]);

  w.done("t_fts01", "中文搜索好了：bigram + FTS5，测试 12/12 通过");
  w.user(`存储改成 HawDB 吧${pad}`);
  w.ai(`好，改成 HawDB${pad}`);
  w.advance(3 * 3600_000);
  await spine.poke();
  led = spine.ledger();
  expect(led.open).toEqual([]); // closed by code when the report came
  expect(led.inForce.map((d) => d.text.slice(0, 12))).toEqual(["存储改成 HawDB 吧"]);
  const s2 = store.records.find((r) => r.id === "S0002")!.body as SegmentDigest;
  expect(s2.superseded[0]!.old).toMatch(/SQLite/);

  w.user(`再加一个：周五前把预算表发我${pad}`);
  w.ai(`好${pad}`);
  w.user("还有吗？"); // left unanswered
  w.ai(`${pad}`);
  w.user("在吗"); // the very last: no cut after it
  w.advance(3 * 3600_000);
  w.ai(`在${pad}`);
  w.advance(3 * 3600_000);
  await spine.poke();
  // Three segments, epochAfter 2: the oldest two rolled into an epoch.
  expect(store.records.map((r) => r.id).sort()).toEqual(["E0001", "S0001", "S0002", "S0003"]);
  expect(spine.digests().map((d) => d.id)).toEqual(["E0001", "S0003"]);
  // The ledger from the epoch equals the ledger from its segments.
  const fromSegments = computeLedger(store.records.filter((r) => r.kind === "segment").map((r) => ({ kind: "segment" as const, ...(r.body as SegmentDigest) })));
  expect(spine.ledger()).toEqual(fromSegments);
  const epochText = renderDigest(spine.digests()[0]!);
  expect(epochText).toMatch(/SQLite[^\n]*→[^\n]*HawDB/);
  expect(epochText).toMatch(/D-2 存储改成 HawDB[^\n]*replaces D-1/);
  expect(epochText).not.toMatch(/- D-1 /); // the replaced decision is carried only as a change
  expect(epochText).not.toMatch(/In short/); // narratives are dropped, never re-summarized
});

test("restart: a new spine over the same store carries on numbering and never rewrites a frozen digest", async () => {
  const w = world();
  for (let k = 0; k < 10; k++) (w.user(`第 ${k} 轮 ${"讨论".repeat(15)}`), w.ai("好".repeat(60)));
  const writer = cueWriter();
  await createSpine({ log: w.log, store: w.log.spine, writer, line, now: w.clock.now, cut: SMALL }).poke();
  const first = w.log.spine.list();
  expect(first.map((r) => r.id)).toEqual(["S0001"]);
  for (let k = 10; k < 20; k++) (w.user(`第 ${k} 轮 ${"讨论".repeat(15)}`), w.ai("好".repeat(60)));
  const again = createSpine({ log: w.log, store: w.log.spine, writer, line, now: w.clock.now, cut: SMALL });
  await again.poke();
  const ids = w.log.spine.list().map((r) => r.id);
  expect(ids.slice(0, 2)).toEqual(["S0001", "S0002"]);
  expect(w.log.spine.list()[0]).toEqual(first[0]!);
  expect(writer.calls.every((c) => c.id !== "S0001" || c.from === first[0]!.fromSeq)).toBe(true);
  expect(w.log.spine.list()[1]!.fromSeq).toBe(first[0]!.toSeq + 1);
});

test("the view: digests, ledger, and a verbatim window of at least loTokens; the same Log gives the same bytes", async () => {
  const w = world();
  for (let k = 0; k < 14; k++) (w.user(`第 ${k} 轮 ${"讨论".repeat(15)}`), w.ai("好".repeat(60)));
  const spine = createSpine({ log: w.log, store: memorySpineStore(), writer: cueWriter(), line, now: w.clock.now, cut: SMALL });
  // Before anything is frozen and the tail is over budget: the newest hiTokens, and a pointer to the rest.
  const v0 = spine.view();
  expect(v0.earlier).toBe("");
  expect(v0.gap?.from).toBe(1);
  await spine.poke();
  const v = spine.view();
  expect(v.earlier).toMatch(/^## .*S0001/);
  expect(v.ledger).toMatch(/Decisions in force/);
  const size = v.window.reduce((n, e) => n + estTokens(`#${e.seq} ${line(e)}`), 0);
  expect(size).toBeGreaterThanOrEqual(SMALL.loTokens);
  expect(v.window[0]!.kind).toBe("user_msg");
  expect(JSON.stringify(spine.view())).toBe(JSON.stringify(v));
});

test("recall: only on recall intent, only hits that share most of the message's terms, only outside the window", () => {
  const w = world();
  w.user("向量库先别上，FTS 够用");
  w.ai("好，先用 FTS5。");
  w.user("今天吃什么");
  for (let k = 0; k < 5; k++) w.ai("别的事");
  expect(recallIntent("上次我们说的向量库是怎么定的？")).toBe(true);
  expect(recallIntent("帮我看看 CI")).toBe(false);
  const r = autoRecall(w.log, "上次我们说的向量库是怎么定的？FTS 呢", 5)!;
  expect(r.admitted.map((h) => h.seq)).toEqual([1]);
  expect(autoRecall(w.log, "帮我修一下向量库", 5)).toBeNull(); // no recall intent
  expect(autoRecall(w.log, "上次那个向量库", 1)!.admitted).toEqual([]); // inside the window: nothing to add
});

test("partner: a cold session reads digests, the ledger and the window; digests are written after turns; a warm one past budget re-cuts", async () => {
  const clock = new FakeClock();
  const dir = mkdtempSync(join(tmpdir(), "ducter-spine-partner-"));
  dirs.push(dir);
  const fc = fakeCore(clock, dir);
  const fr = fakeRunner((_input, s) => {
    s.say("好的。".repeat(40));
    s.end();
  });
  const store = memorySpineStore();
  const partner = createPartner(fc.core, fr.runner, {
    now: clock.now,
    persistState: false,
    prewarm: false,
    onError: () => {},
    spine: { writer: cueWriter(), store, cut: SMALL, pokeMs: 0 },
    recutTokens: 2_000,
  });
  const say = async (text: string) => {
    clock.advance(60_000);
    partner.onTrigger(fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text } }));
    await partner.idle();
    await partner.spine!.idle();
  };
  await say("数据库就用 SQLite，别上服务器。" + "背景".repeat(40));
  for (let k = 0; k < 8; k++) await say(`第 ${k} 件事：` + "细节".repeat(40));
  expect(store.records.length).toBeGreaterThan(0); // written in the background after turns
  // Cold: two hours later the next turn starts fresh and reads the spine first.
  clock.advance(2 * 3600_000);
  await say("我们上次定的数据库是什么？");
  const seed = fr.sessions[fr.sessions.length - 1]!.inputs[0]!;
  expect(seed.indexOf("<earlier_conversation>")).toBeGreaterThanOrEqual(0);
  expect(seed.indexOf("<earlier_conversation>")).toBeLessThan(seed.indexOf("<open_items>"));
  expect(seed.indexOf("<open_items>")).toBeLessThan(seed.indexOf("<conversation_so_far>"));
  expect(seed).toMatch(/D-1 数据库就用 SQLite/);
  expect(seed).toMatch(/#\d+ \[2026-/); // window lines carry their seq, so pointers line up
  expect(seed).not.toMatch(/reset|restart|lost|重置|重启/i);
  // Warm, but the live session is past its budget: the next turn re-cuts from the spine.
  const before = fr.sessions.length;
  for (let k = 0; k < 6; k++) await say(`再来 ${k}：` + "长内容".repeat(60));
  expect(partner.stats.recuts).toBeGreaterThan(0);
  expect(fr.sessions.length).toBeGreaterThan(before);
  // Nothing about memory ever reaches the channel.
  const shown = fc.events.filter((e) => e.stream === "channel" && e.origin !== "user").map((e) => JSON.stringify(e.body)).join("\n");
  expect(shown).not.toMatch(/digest|spine|earlier_conversation|摘要/i);
  await partner.close();
});
