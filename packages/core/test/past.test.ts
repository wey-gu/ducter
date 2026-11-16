// D285: 做过的事 / Past tasks: search relevance over a seeded corpus, time words, marks that
// persist per persona and rename the task everywhere, and the seed a new task carries.
import { expect, test } from "bun:test";
import { join } from "node:path";
import type { Bodies, Place } from "@ducter/protocol";
import { openLog } from "../src/log.ts";
import { createRegistry } from "../src/registry.ts";
import { createMarks, createPast, kindOf, queryTerms, timeWords } from "../src/past.ts";
import type { Clock } from "../src/clock.ts";
import { tempDir } from "./helpers.ts";

// Monday 2026-11-16, 15:00 local.
const NOW = new Date(2026, 10, 16, 15, 0, 0).getTime();
const DAY = 24 * 3600_000;

interface Seed {
  id: string;
  title: string;
  project?: string;
  harness?: string;
  daysAgo: number;
  brief?: string;
  words?: string[];
  report?: string;
  files?: string[];
  branch?: string;
  end?: "done" | "failed" | "dropped" | "working";
  persona?: string;
}

const CORPUS: Seed[] = [
  { id: "refactor", title: "Refactor the compaction scheduler", project: "hawdb", harness: "codex", daysAgo: 6, words: ["split the picker out of scheduler.go"], report: "Moved the level picker into picker.go; tests pass.", files: ["/src/hawdb/compaction/scheduler.go", "/src/hawdb/compaction/picker.go"], branch: "ducter/compaction-scheduler" },
  { id: "flaky", title: "Why does TestRaftSnapshot fail sometimes", project: "hawdb", daysAgo: 12, report: "Found the cause of the flaky test: the snapshot timer races the leader step-down. Fixed with a fence.", files: ["/src/hawdb/raft/snapshot_test.go"], branch: "ducter/flaky-snapshot" },
  { id: "review", title: "Review PR 482 in mem", project: "mem", daysAgo: 3, report: "Reviewed: the importer re-reads the vault twice; repo uses bun workspaces and a custom test runner.", harness: "claude-code" },
  { id: "compaction-doc", title: "Write the compaction design note", project: "hawdb", daysAgo: 30, report: "Drafted docs/compaction.md with the three levels." },
  { id: "kyoto", title: "订 12 月 6 号京都的酒店", daysAgo: 2, report: "订好了：京都站旁的 Hotel Granvia，两晚，可免费取消到 12 月 3 日。" },
  { id: "dentist", title: "给牙医打电话改约", daysAgo: 9, words: ["改到下周四下午"], report: "改好了，11 月 20 日 15:00。" },
  { id: "release", title: "Release 0.0.60", project: "ducter", daysAgo: 1, report: "Tagged v0.0.60 and published the notes." },
  { id: "live", title: "Port the On hand strip to the web", project: "ducter", daysAgo: 0, end: "working" },
  { id: "dropped", title: "Try a Rust rewrite of the log", project: "ducter", daysAgo: 20, end: "dropped" },
  { id: "bench", title: "Benchmark compaction throughput", project: "hawdb", harness: "pi", daysAgo: 40, report: "3.1 GB/s on the m4; the picker is not the bottleneck.", end: "failed" },
  { id: "other", title: "Someone else's task", project: "hawdb", daysAgo: 1, persona: "bob", report: "compaction for bob" },
];

function seed(): { past: ReturnType<typeof createPast>; marks: ReturnType<typeof createMarks>; tasks: ReturnType<typeof createRegistry>; dir: string; log: ReturnType<typeof openLog>; cleanup: () => void } {
  const t = tempDir();
  let now = NOW - 60 * DAY;
  const clock: Clock = { now: () => now, setTimeout: () => 0, clearTimeout: () => {} };
  const log = openLog({ path: join(t.dir, "ducter.db"), persona: "ann", clock });
  const tasks = createRegistry(log, clock);
  const marks = createMarks({ dataDir: t.dir, now: () => NOW });
  for (const s of [...CORPUS].sort((a, b) => b.daysAgo - a.daysAgo)) {
    now = NOW - s.daysAgo * DAY - 3600_000;
    const persona = s.persona ?? "ann";
    const place: Place = s.branch ? { kind: "repo", device: "local", repoPath: `/src/${s.project}`, branch: s.branch, baseBranch: "main" } : { kind: "none" };
    const st = `task:${s.id}`;
    log.append({ persona, stream: st, origin: "partner", kind: "task_open", body: { taskId: s.id, title: s.title, project: s.project ?? "", place, harness: s.harness ?? "claude-code", brief: s.brief ?? s.title } });
    for (const w of s.words ?? []) log.append({ persona, stream: st, origin: "user", kind: "task_event", body: { taskId: s.id, role: "user", from: "user", text: w } });
    for (const f of s.files ?? []) log.append({ persona, stream: st, origin: "task", kind: "task_event", body: { taskId: s.id, role: "tool", tool: { name: "Edit", input: { file_path: f, old_string: "a", new_string: "b" } } } });
    if (s.report) log.append({ persona, stream: st, origin: "task", kind: "report", body: { taskId: s.id, state: s.end === "failed" ? "failed" : "done", summary: s.report, questions: [], evidence: [] } as Bodies["report"] });
    const end = s.end ?? "done";
    log.append({ persona, stream: st, origin: "system", kind: "task_state", body: { taskId: s.id, attention: end, residency: end === "working" ? "hot" : "parked" } });
  }
  now = NOW;
  tasks.setMarks((p, id) => marks.get(p, id));
  const past = createPast({ log, tasks, marks, now: () => NOW });
  return { past, marks, tasks, dir: t.dir, log, cleanup: t.cleanup };
}

const ids = (r: { items: { taskId: string }[] }) => r.items.map((i) => i.taskId);

test("browsing lists what is done, newest first, without what is still on hand or another persona's", () => {
  const s = seed();
  const r = s.past.query("ann", {});
  expect(ids(r)).toEqual(["release", "kyoto", "review", "refactor", "dentist", "flaky", "dropped", "compaction-doc", "bench"]);
  expect(r.items.find((i) => i.taskId === "kyoto")!.outcome).toStartWith("订好了");
  expect(r.facets.projects[0]).toEqual({ name: "hawdb", n: 4 });
  s.cleanup();
});

test("words find by title, a file, a branch, what the person said and what it reported, best first", () => {
  const s = seed();
  // "compaction": the title beats a file, a file beats a report.
  const c = s.past.query("ann", { q: "compaction" });
  expect(ids(c).slice(0, 2)).toEqual(["refactor", "compaction-doc"]);
  expect(ids(c)).toContain("bench");
  expect(ids(c)).not.toContain("other");
  // A file name only the tool touched.
  const f = s.past.query("ann", { q: "picker.go" });
  expect(ids(f)[0]).toBe("refactor");
  expect(f.items[0]!.hit).toMatchObject({ field: "file" });
  // A branch.
  expect(ids(s.past.query("ann", { q: "flaky-snapshot" }))[0]).toBe("flaky");
  // "that task where we found the flaky test's cause": in its report, not its title.
  const why = s.past.query("ann", { q: "the task where we found the flaky test's cause" });
  expect(ids(why)[0]).toBe("flaky");
  expect(why.items[0]!.hit?.field).toBe("report");
  // The person's own words in a task, in Chinese.
  const zh = s.past.query("ann", { q: "改到下周四" });
  expect(ids(zh)[0]).toBe("dentist");
  expect(zh.items[0]!.hit).toMatchObject({ field: "words", text: "改到下周四下午" });
  // Chinese without spaces and with filler words: 那个订酒店的事.
  expect(ids(s.past.query("ann", { q: "那个订京都酒店的事" }))[0]).toBe("kyoto");
  // The agent.
  expect(ids(s.past.query("ann", { q: "codex compaction" }))).toEqual(["refactor"]);
  // Nothing has every word: the closest instead.
  expect(ids(s.past.query("ann", { q: "compaction kubernetes" })).length).toBeGreaterThan(0);
  s.cleanup();
});

test("time words become a range: last Tuesday, 上周二, yesterday", () => {
  const s = seed();
  // NOW is Monday the 16th; last Tuesday is the 10th: the refactor (6 days ago).
  const r = s.past.query("ann", { q: "continue the refactor I did last Tuesday" });
  expect(ids(r)).toEqual(["refactor"]);
  expect(r.range?.words).toBe("last Tuesday");
  expect(ids(s.past.query("ann", { q: "上周二的重构" }))).toEqual([]); // the title is English: nothing has 重构
  expect(ids(s.past.query("ann", { q: "上周二" }))).toEqual(["refactor"]);
  expect(ids(s.past.query("ann", { q: "yesterday" }))).toEqual(["release"]);
  expect(timeWords("最近 7 天", NOW)!.rest).toBe("");
  expect(new Date(timeWords("上周", NOW)!.since).getDate()).toBe(9);
  expect(new Date(timeWords("周日", NOW)!.since).getDate()).toBe(15);
  s.cleanup();
});

test("filters: project, agent, starred, tag", () => {
  const s = seed();
  expect(ids(s.past.query("ann", { project: "mem" }))).toEqual(["review"]);
  expect(ids(s.past.query("ann", { harness: "pi" }))).toEqual(["bench"]);
  s.marks.set("ann", "flaky", { starred: true, tags: ["Raft", "flaky", "raft"] });
  expect(s.marks.get("ann", "flaky")!.tags).toEqual(["raft", "flaky"]);
  expect(ids(s.past.query("ann", { starred: true }))).toEqual(["flaky"]);
  expect(ids(s.past.query("ann", { tag: "RAFT" }))).toEqual(["flaky"]);
  expect(ids(s.past.query("ann", { q: "raft" }))[0]).toBe("flaky");
  expect(s.past.query("ann", {}).facets.tags).toEqual([{ tag: "flaky", n: 1 }, { tag: "raft", n: 1 }]);
  // A starred task still on hand is listed while browsing.
  s.marks.set("ann", "live", { starred: true });
  expect(ids(s.past.query("ann", {}))).toContain("live");
  s.cleanup();
});

test("marks persist per persona, rename the task everywhere, and keep the old title findable", () => {
  const s = seed();
  s.marks.set("ann", "flaky", { name: "Raft 快照的坑", glyph: "fix", tint: "sage" });
  s.marks.set("bob", "flaky", { name: "bob's name" });
  // The registry's card (On hand, the task, the switcher) says the person's name.
  expect(s.tasks.get("flaky")).toMatchObject({ title: "Raft 快照的坑", original: "Why does TestRaftSnapshot fail sometimes", mark: { glyph: "fix", tint: "sage" } });
  const r = s.past.query("ann", { q: "TestRaftSnapshot" });
  expect(r.items[0]).toMatchObject({ taskId: "flaky", title: "Raft 快照的坑", original: "Why does TestRaftSnapshot fail sometimes" });
  expect(ids(s.past.query("ann", { q: "快照" }))[0]).toBe("flaky");
  // Kept on disk: a new store reads them back.
  const again = createMarks({ dataDir: s.dir });
  expect(again.get("ann", "flaky")).toMatchObject({ name: "Raft 快照的坑", glyph: "fix", tint: "sage" });
  expect(again.get("bob", "flaky")?.name).toBe("bob's name");
  // Clearing every mark removes the entry; a bad glyph is ignored.
  expect(again.set("ann", "flaky", { name: null, glyph: null, tint: null })).toBeUndefined();
  expect(again.set("ann", "kyoto", { glyph: "rocket" as never })).toBeUndefined();
  s.cleanup();
});

test("a new task from an earlier one carries what it found", () => {
  const s = seed();
  const en = s.past.seed("flaky", "Add the same fence to the WAL snapshot", "en");
  expect(en).toStartWith("Add the same fence to the WAL snapshot\n\n---\nThis picks up from an earlier task: \"Why does TestRaftSnapshot fail sometimes\"");
  expect(en).toContain("the snapshot timer races the leader step-down");
  expect(en).toContain("Its branch: ducter/flaky-snapshot");
  expect(en).toContain("/src/hawdb/raft/snapshot_test.go");
  const zh = s.past.seed("dropped", "再试一次", "zh");
  expect(zh).toContain("它没有留下报告。");
  s.cleanup();
});

test("the picture Ducter guesses, and the query's words", () => {
  expect(kindOf("Why does TestRaftSnapshot fail sometimes")).toBe("fix");
  expect(kindOf("订 12 月 6 号京都的酒店")).toBe("errand");
  expect(kindOf("Review PR 482 in mem")).toBe("review");
  expect(kindOf("Release 0.0.60")).toBe("ship");
  expect(kindOf("Refactor the compaction scheduler")).toBe("build");
  expect(queryTerms("show me everything about hawdb compaction")).toEqual(["hawdb", "compaction"]);
  expect(queryTerms("那个找到 flaky 原因的任务")).toEqual(["flaky", "原因"]);
});
