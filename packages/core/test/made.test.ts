// D383: 给你做的 / Made for you: what Ducter made, read from the Log (a task's shown files and pictures, the
// files it wrote or named, the partner's tables and lists, a PR), found by words, kind and time.
import { expect, test } from "bun:test";
import { join } from "node:path";
import type { Bodies, MediaRef, PinView } from "@ducter/protocol";
import { openLog } from "../src/log.ts";
import { createRegistry } from "../src/registry.ts";
import { createMade, linkedPaths, madePath } from "../src/made.ts";
import type { Clock } from "../src/clock.ts";
import { tempDir } from "./helpers.ts";

// Thursday 2026-11-19, 15:00 local.
const NOW = new Date(2026, 10, 19, 15, 0, 0).getTime();
const DAY = 24 * 3600_000;
const ref = (id: string, name: string, type: string, bytes = 2048): MediaRef => ({ id: id.padEnd(64, "0"), type, bytes, name, k: "fake.key" });

function seed(pins: PinView[] = []) {
  const t = tempDir();
  let now = NOW - 30 * DAY;
  const clock: Clock = { now: () => now, setTimeout: () => 0, clearTimeout: () => {} };
  const log = openLog({ path: join(t.dir, "ducter.db"), persona: "ann", clock });
  const tasks = createRegistry(log, clock);
  const at = (daysAgo: number) => (now = NOW - daysAgo * DAY);
  const open = (id: string, title: string) => log.append({ stream: `task:${id}`, origin: "partner", kind: "task_open", body: { taskId: id, title, project: "", place: { kind: "none" }, harness: "claude-code", brief: title } });
  const report = (id: string, b: Partial<Bodies["report"]>) => log.append({ stream: `task:${id}`, origin: "task", kind: "report", body: { taskId: id, state: "done", summary: "", questions: [], evidence: [], ...b } as Bodies["report"] });

  // Nine days ago (last week): the Kyoto itinerary, written by a task and named in its report.
  at(9);
  open("kyoto", "排 12 月京都三日行程");
  log.append({ stream: "task:kyoto", origin: "task", kind: "task_event", body: { taskId: "kyoto", role: "tool", tool: { name: "Write", input: { file_path: "/Users/ann/.ducter/scratch/kyoto/kyoto-itinerary.md", content: "# Day 1" } } } });
  log.append({ stream: "task:kyoto", origin: "task", kind: "task_event", body: { taskId: "kyoto", role: "tool", tool: { name: "Write", input: { file_path: "/Users/ann/.ducter/scratch/kyoto/node_modules/x/readme.md", content: "" } } } });
  report("kyoto", { summary: "排好了三天的行程：[京都行程](/Users/ann/.ducter/scratch/kyoto/kyoto-itinerary.md)，第一天伏见稻荷。" });
  // Five days ago: the visa PDF the task showed, and a screenshot of the booking page.
  at(5);
  open("visa", "Fill the Japan visa application");
  report("visa", { summary: "The application form is filled; the PDF is ready to print.", media: [ref("aa", "japan-visa-application.pdf", "application/pdf"), ref("bb", "booking-confirmation.png", "image/png")] });
  // Two days ago: the partner's comparison of two Macs, answering the person's question.
  at(2);
  const q = log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "M4 Pro 和 M4 Max 的 MacBook Pro 比一下" } });
  const plain = "M4 Pro 和 M4 Max";
  log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: `对比如下：\n${plain}`, replyTo: q.seq, ui: [{ type: "table", columns: ["", "M4 Pro", "M4 Max"], rows: [["CPU", "14 核", "16 核"], ["价格", "¥16,999", "¥27,999"]], plain }] } });
  // Yesterday: a PR opened from Ducter, and a checklist.
  at(1);
  open("fix", "Fix the flaky snapshot test");
  log.append({ stream: "channel", origin: "partner", kind: "job_status", body: { jobId: "j1", text: "Fix the flaky snapshot test", state: "done", taskId: "fix", act: "open_pr", ref: "https://github.com/example/hawdb/pull/412" } });
  log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: "Packing:\n- Passport", ui: [{ type: "checklist", title: "Osaka packing list", items: ["Passport", "Yen in cash"], plain: "- Passport" }] } });
  // Someone else's, never shown to ann.
  log.append({ persona: "bob", stream: "channel", origin: "partner", kind: "ai_msg", body: { text: "x", ui: [{ type: "table", title: "Bob's budget", columns: ["a", "b"], rows: [["1", "2"]], plain: "x" }] } });
  now = NOW;
  const made = createMade({ log, tasks, pins: () => pins, now: () => NOW });
  return { made, log, cleanup: t.cleanup };
}

test("everything made, newest first, with the task that made it; working files left out", () => {
  const s = seed();
  const r = s.made.query("ann", {});
  expect(r.items.map((i) => i.title)).toEqual(["Osaka packing list", "PR #412", "对比如下：", "booking-confirmation.png", "japan-visa-application.pdf", "kyoto-itinerary.md"]);
  const it = r.items.find((i) => i.title === "kyoto-itinerary.md")!;
  expect(it.kind).toBe("file");
  expect(it.task).toEqual({ taskId: "kyoto", title: "排 12 月京都三日行程" });
  expect(it.path).toBe("/Users/ann/.ducter/scratch/kyoto/kyoto-itinerary.md");
  expect(r.items.find((i) => i.kind === "table")!.ask).toBe("M4 Pro 和 M4 Max 的 MacBook Pro 比一下");
  expect(r.items.find((i) => i.kind === "picture")!.media?.name).toBe("booking-confirmation.png");
  expect(r.kinds).toEqual([{ kind: "file", n: 2 }, { kind: "picture", n: 1 }, { kind: "table", n: 1 }, { kind: "list", n: 1 }, { kind: "link", n: 1 }]);
  s.cleanup();
});

test("找一下上周做的那个行程表: last week's itinerary, by the task's words and the time", () => {
  const s = seed();
  const r = s.made.query("ann", { q: "找一下上周做的那个行程表" });
  expect(r.range?.words).toBe("上周");
  expect(r.items[0]?.title).toBe("kyoto-itinerary.md");
  expect(r.items[0]?.hit?.field).toBe("task");
  s.cleanup();
});

test("the PDF you made for the visa: a kind word narrows, the rest finds it", () => {
  const s = seed();
  const r = s.made.query("ann", { q: "the PDF you made for the visa" });
  expect(r.items.map((i) => i.title)).toEqual(["japan-visa-application.pdf"]);
  s.cleanup();
});

test("words inside a table find it; the kind word 对比表 narrows to tables", () => {
  const s = seed();
  expect(s.made.query("ann", { q: "M4 Max 价格" }).items[0]?.kind).toBe("table");
  expect(s.made.query("ann", { q: "那个 mac 对比表" }).items.map((i) => i.kind)).toEqual(["table"]);
  expect(s.made.query("ann", { q: "the PR for the flaky test" }).items[0]?.url).toBe("https://github.com/example/hawdb/pull/412");
  s.cleanup();
});

test("nothing like it: an honest empty list", () => {
  const s = seed();
  expect(s.made.query("ann", { q: "the wedding seating chart" }).items).toEqual([]);
  expect(s.made.query("ann", { q: "昨天的行程表" }).items).toEqual([]);
  s.cleanup();
});

test("a pinned block shows as pinned and as it is now; an older version is left out", () => {
  const s = seed();
  const list = s.made.query("ann", { kind: "list" }).items[0]!;
  const pin: PinView = { id: "pabcd", seq: list.seq!, index: 0, ui: { type: "checklist", title: "Osaka packing list", items: ["Passport", "Yen in cash", "Power bank"], plain: "x" }, at: new Date(NOW).toISOString() } as PinView;
  const s2 = seed([pin]);
  const now = s2.made.query("ann", { kind: "list" }).items[0]!;
  expect(now.pinned).toBe(true);
  expect(now.block?.type === "checklist" && now.block.items).toContain("Power bank");
  const old: PinView = { ...pin, seq: 9999, was: [{ seq: list.seq!, index: 0 }] } as PinView;
  const s3 = seed([old]);
  expect(s3.made.query("ann", { kind: "list" }).items).toEqual([]);
  for (const x of [s, s2, s3]) x.cleanup();
});

test("get by id; kept live as the Log grows", () => {
  const s = seed();
  s.made.query("ann", {});
  s.log.append({ stream: "task:visa", origin: "task", kind: "report", body: { taskId: "visa", state: "done", summary: "Also the cover letter.", questions: [], evidence: [], media: [ref("cc", "cover-letter.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")] } });
  expect(s.made.get(`m:${"cc".padEnd(64, "0")}`)?.title).toBe("cover-letter.docx");
  expect(s.made.query("ann", { q: "cover letter" }).items[0]?.title).toBe("cover-letter.docx");
  s.cleanup();
});

test("paths: links and code spans in words; a kind a person keeps, never a project's machinery", () => {
  expect(linkedPaths("see [a](/x/a.md) and `~/b.csv` and https://e.com/c.pdf")).toEqual(["/x/a.md", "~/b.csv"]);
  expect(madePath("/x/report.pdf")).toBe(true);
  expect(madePath("/x/src/main.ts")).toBe(false);
  expect(madePath("/x/node_modules/pkg/README.md")).toBe(false);
  expect(madePath("/x/.claude/plans/p.md")).toBe(false);
});
