// research/199: a world shaped like the author's week (HawDB and Ducter work, a review from
// Weizhen, a trip to Tokyo, conversations with Codex and Claude Code), with offers a good partner
// would make planted among things it should leave alone. Every item has an id: g-* is a planted
// good offer, n-* is noise (some code should never gather, some only the model should drop).
// Synthetic content; the names are the author's own projects and tools.
import type { Bodies, TaskCard } from "@ducter/protocol";
import type { MemLookHit, MemLookPort, MemLookThread } from "@ducter/protocol/src/internal.ts";
import type { RefState, Upcoming, WiderInput } from "../../src/proactive/wider.ts";

export const ZONE = "Asia/Shanghai";
export const NOW = Date.parse("2026-11-21T08:00:00+08:00");
const H = 3_600_000;
const D = 24 * H;
const iso = (ms: number) => new Date(ms).toISOString();
const hawdb = { kind: "repo" as const, device: "local", repoPath: "/Users/wey/code/hawdb", branch: "main" };
const ducter = { kind: "repo" as const, device: "local", repoPath: "/Users/wey/code/ducter", branch: "main" };

function card(p: Partial<TaskCard> & { taskId: string; title: string; ended: number; summary: string; state?: "done" | "failed" }): TaskCard {
  const { ended, summary, state = "done", ...rest } = p;
  return {
    persona: "default",
    project: "hawdb",
    place: hawdb as never,
    harness: "codex",
    attention: state,
    residency: "parked",
    openedAt: iso(ended - 2 * H),
    updatedAt: iso(ended),
    lastReport: { taskId: p.taskId, state, summary, questions: [], evidence: [] } as Bodies["report"],
    ...rest,
  } as TaskCard;
}

// ---------- tasks ----------

export const TASKS: TaskCard[] = [
  // g-t1: a merged change whose follow-up issue is still open.
  card({ taskId: "g-t1", title: "WAL group commit", ended: NOW - 18 * H, integrated: { act: "merge", at: iso(NOW - 18 * H) }, summary: "Merged PR #10561: the WAL now commits in groups (p99 commit latency 9.8 ms → 3.1 ms on the bench). Batching fsync for replicas is left for #10562." }),
  // g-t2: a task that noticed something and left it.
  card({ taskId: "g-t2", title: "Fix the flaky LRU-K eviction test", ended: NOW - 30 * H, summary: "The flaky test is fixed: it raced the background flusher. I also noticed the buffer pool's pin count can underflow when a transaction aborts mid-scan; I didn't touch it." }),
  // g-t3: a failure whose cause is closed now.
  card({ taskId: "g-t3", title: "Move CI to Bun 1.4.4", project: "ducter", place: ducter as never, ended: NOW - 6 * D, state: "failed", summary: "Stopped: the test runner crashes on worker threads under 1.4.4 (oven-sh/bun#24011). CI stays on 1.4.3 for now." }),
  // g-t4: a routine whose result changed (two runs).
  card({ taskId: "g-t4a", title: "Nightly HawDB CI", ended: NOW - 32 * H, fromRoutine: { routineId: "g-t4", name: "Nightly HawDB CI" }, summary: "All 1,204 tests pass on main (14 min)." }),
  card({ taskId: "g-t4b", title: "Nightly HawDB CI", ended: NOW - 8 * H, state: "failed", fromRoutine: { routineId: "g-t4", name: "Nightly HawDB CI" }, summary: "3 tests fail on main since 7f3a2c1: planner join-order tests expect the old cost model." }),
  // g-t5: release notes task that noticed broken links.
  card({ taskId: "g-t5", title: "Write the 0.1.9 release notes", project: "ducter", place: ducter as never, ended: NOW - 20 * H, summary: "Release notes for 0.1.9 are in docs/releases/0.1.9.md. Also noticed two links in docs/devices.md return 404 (the worker setup anchors); left them as they are." }),

  // n-t1: noticed something in code that isn't theirs (vendored), nothing to do.
  card({ taskId: "n-t1", title: "Bump the sqlite bindings", ended: NOW - 26 * H, summary: "Bumped the bindings to 3.47. Unrelated: the vendored zstd sources print a lot of compiler warnings; they're upstream's and harmless." }),
  // n-t2: noticed and already taken up by a later task (code drops it).
  card({ taskId: "n-t2", title: "Profile the scan path", ended: NOW - 40 * H, summary: "Scans spend 38% in decoding. I also noticed the row decoder allocates per column; worth fixing." }),
  card({ taskId: "n-t2-later", title: "Stop the row decoder allocating per column", ended: NOW - 10 * H, summary: "The row decoder now reuses one buffer per scan; decode time down 22%." }),
  // n-t3: a routine that moved by a little (worded differently, same news).
  card({ taskId: "n-t3a", title: "Disk check on hel", project: "ops", place: { kind: "none" } as never, ended: NOW - 31 * H, fromRoutine: { routineId: "n-t3", name: "Disk check on hel" }, summary: "Disk on hel is at 61% (122 of 200 GB); nothing to do." }),
  card({ taskId: "n-t3b", title: "Disk check on hel", project: "ops", place: { kind: "none" } as never, ended: NOW - 7 * H, fromRoutine: { routineId: "n-t3", name: "Disk check on hel" }, summary: "hel's disk: 63% used (126/200 GB). Fine." }),
  // n-t4: merged, the issue it names is the one it closed, the other isn't known (code drops it).
  card({ taskId: "n-t4", title: "Fix the checkpoint race", ended: NOW - 22 * H, integrated: { act: "merge", at: iso(NOW - 22 * H) }, summary: "Merged PR #10530, which closes #10490 (the checkpoint race)." }),
  // n-t5: too old to be news (code drops it).
  card({ taskId: "n-t5", title: "Tidy the bench harness", ended: NOW - 7 * D, summary: "Tidied the harness. I also noticed the README's bench section is stale." }),
  // n-t6: "noticed" a fact with nothing to do.
  card({ taskId: "n-t6", title: "Run the full test suite on the M3", ended: NOW - 15 * H, summary: "All tests pass on the M3. I noticed the suite takes 4 minutes there, the same as on hel; that's expected." }),
];

export const REFS: RefState[] = [
  { ref: "hawdb/hawdb#10562", label: "#10562", title: "Batch fsync for replicas", state: "open", url: "https://github.com/hawdb/hawdb/issues/10562", updatedAt: iso(NOW - 18 * H) },
  { ref: "oven-sh/bun#24011", label: "#24011", title: "bun test crashes on worker threads", state: "closed", url: "https://github.com/oven-sh/bun/issues/24011", updatedAt: iso(NOW - 2 * D) },
  { ref: "hawdb/hawdb#10490", label: "#10490", title: "Checkpoint race on shutdown", state: "closed", updatedAt: iso(NOW - 22 * H) },
  { ref: "hawdb/hawdb#10559", label: "#10559", title: "Planner: cost-based join order", state: "open", url: "https://github.com/hawdb/hawdb/pull/10559", updatedAt: iso(NOW - 3 * D) },
];

export const UPCOMING: Upcoming[] = [
  { name: "NH 920 上海浦东—东京羽田", start: iso(NOW + 3 * D + 11 * H), what: "flight", place: "浦东 T2" },
  { name: "HawDB planner review with Weizhen", start: iso(NOW + 1 * D + 6 * H), what: "meeting" },
];

// ---------- Nowledge Mem (read-only fake) ----------

const MEMS: Record<string, MemLookHit> = {
  // g-m1: a preference and the flight on Friday.
  "g-m1": { id: "g-m1", title: "出差订座偏好", content: "出差坐飞机一定要靠窗，长途别选中间座。", date: "2026-10-02", kind: "preference", source: "ducter" },
  // g-m2: a decision waiting on the WAL work, which is merged now.
  "g-m2": { id: "g-m2", title: "HawDB 0.9 发布节奏", content: "等 WAL group commit 合进去之后再发 0.9 的 RC，先不赶 11 月初。", date: "2026-10-28", kind: "decision", source: "codex" },
  // g-m4: a preference and the meeting tomorrow.
  "g-m4": { id: "g-m4", title: "Meetings: agenda first", content: "Always send the agenda to the other person the day before a review meeting.", date: "2026-09-14", kind: "preference", source: "claude-code" },
  // n-m1: a preference with nothing to do with what is coming (coffee).
  "n-m1": { id: "n-m1", title: "喜欢的咖啡", content: "喜欢燕麦拿铁，少冰。", date: "2026-09-01", kind: "preference" },
  // n-m2: a decision whose condition isn't met.
  "n-m2": { id: "n-m2", title: "Rust edition", content: "等 Rust 2027 edition 正式发布之后再迁移 hawdb-cli。", date: "2026-10-10", kind: "decision", source: "codex" },
  // n-m4: a hotel preference, no hotel coming (only a flight).
  "n-m4": { id: "n-m4", title: "出差住宿", content: "出差住酒店不要吸烟楼层，尽量高楼层。", date: "2026-08-20", kind: "preference" },
};

const THREADS: Record<string, MemLookThread> = {
  // g-m3: a conversation with Codex that stopped with the cost model left.
  "g-m3": { id: "g-m3", title: "HawDB planner join order cost model", source: "codex", date: "2026-11-12", lines: [{ who: "user", text: "先这样，join order 的代价模型下次继续，cardinality 估计那块还没改。" }, { who: "assistant", text: "好，下次从 estimate_join_card 接着做。" }] },
  // n-m3: small talk that "continues next time".
  "n-m3": { id: "n-m3", title: "Rust lifetimes chat", source: "claude-code", date: "2026-11-15", lines: [{ who: "user", text: "哈哈有意思，下次再聊聊生命周期的那些坑" }, { who: "assistant", text: "好的，随时。" }] },
  // n-m5: left for next time, then done by a task since (code drops it).
  "n-m5": { id: "n-m5", title: "Weekly report format", source: "claude-code", date: "2026-11-10", lines: [{ who: "user", text: "周报格式下次再改，表格太宽了" }, { who: "assistant", text: "好，下次把表格改窄。" }] },
  // n-m6: finished, nothing left (code drops it).
  "n-m6": { id: "n-m6", title: "Fix the zsh completion", source: "codex", date: "2026-11-13", lines: [{ who: "user", text: "可以了，终于好了，谢谢" }, { who: "assistant", text: "不客气。" }] },
};

// The later task that took up the weekly report (n-m5) and finished it.
TASKS.push(card({ taskId: "n-m5-later", title: "Make the weekly report table narrower", project: "ducter", place: ducter as never, ended: NOW - 5 * D, summary: "The weekly report's table is narrower now: weekly report format fixed." }));

/** A fake Mem: what a semantic search would plausibly return for the queries the gatherer asks. */
export function fakeMem(): MemLookPort & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    async search(q) {
      asked.push(q);
      const hits: MemLookHit[] = [];
      if (/flight|航班/.test(q)) hits.push(MEMS["g-m1"]!, MEMS["n-m4"]!, MEMS["n-m1"]!);
      if (/meeting|会议/.test(q)) hits.push(MEMS["g-m4"]!, MEMS["n-m1"]!);
      if (/decision|决定/.test(q)) hits.push(MEMS["g-m2"]!, MEMS["n-m2"]!);
      return hits;
    },
    async threads(q) {
      asked.push(`t:${q}`);
      if (/HawDB/i.test(q)) return [THREADS["g-m3"]!, THREADS["n-m6"]!];
      return [THREADS["n-m3"]!, THREADS["n-m5"]!, THREADS["g-m3"]!];
    },
  };
}

// ---------- the conversation ----------

export const TALK: { id: string; text: string; at: number }[] = [
  { id: "g-c1", text: "回头看看 Weizhen 那个 PR #10559 的 review 意见", at: NOW - 2 * D - 3 * H },
  { id: "g-c2", text: "有空把 nightly bench 的脚本整理一下，现在太乱了", at: NOW - 3 * D },
  { id: "g-c3", text: "I should update the install docs for the Linux worker at some point.", at: NOW - 4 * D },
  { id: "g-c4", text: "改天研究一下 OpenRouter 的免费额度到底怎么算的", at: NOW - 5 * D },
  { id: "n-c1", text: "周五提醒我交水电费", at: NOW - 2 * D - 11 * 60_000 },
  { id: "n-c2", text: "改天一起吃饭吧哈哈", at: NOW - 3 * D - 12 * 60_000 },
  { id: "n-c3", text: "嗯，回头看看那个", at: NOW - 2 * D - 13 * 60_000 },
  { id: "n-c4", text: "过两天看看 #10480 怎么回事", at: NOW - 6 * D },
  { id: "n-c4-done", text: "#10480 看过了，是配置问题", at: NOW - 4 * D - 14 * 60_000 },
  { id: "n-c5", text: "我晚点再跟你说为什么", at: NOW - 2 * D - 15 * 60_000 },
  { id: "n-c6", text: "回头把 CHANGELOG 补一下", at: NOW - 3 * H },
  { id: "n-c7", text: "maybe someday I'll learn Haskell properly", at: NOW - 4 * D - 16 * 60_000 },
];

export function corpus(): WiderInput {
  return { now: NOW, zone: ZONE, tasks: TASKS, talk: TALK.map(({ text, at }) => ({ text, at })), refs: REFS, upcoming: UPCOMING, focus: ["HawDB", "Ducter"], mem: fakeMem() };
}

/** The fixture a lead rests on, from its key. */
export function fixtureOf(key: string): string | undefined {
  const m = /^(?:task|routine):([^:]+)/.exec(key) ?? /^mem:([^:]+)/.exec(key) ?? /^thread:([^:|]+)/.exec(key);
  if (m) return m[1];
  const t = /^talk:(\d+):/.exec(key);
  if (t) return TALK.find((x) => x.at === Number(t[1]))?.id;
  return undefined;
}

export const GOOD = ["g-t1", "g-t2", "g-t3", "g-t4", "g-t5", "g-m1", "g-m2", "g-m3", "g-m4", "g-c1", "g-c2", "g-c3", "g-c4"];
