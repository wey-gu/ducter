// D388: `ducter proactive replay` against a running core: the frame goes over the WebSocket, the
// home answers (here: no AI agent to read with, so a plain error, never a silent nothing), and the
// report prints as lines with each find's sources.
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { OfferCounts, ReplayReport, WeekReport } from "@ducter/protocol";
import { FakeClock } from "@ducter/core/src/clock.ts";
import { startCore, type Core } from "@ducter/core/src/core.ts";
import { cmdProactive, replayLines, weekLines } from "../src/proactive-cmd.ts";
import { translator } from "../src/i18n.ts";

let core: Core | undefined;
let dir = "";
afterEach(async () => {
  await core?.stop();
  core = undefined;
  if (dir) rmSync(dir, { recursive: true, force: true });
});

test("usage: only `proactive replay`, days 1 to 7", async () => {
  const lines: string[] = [];
  const t = translator("en");
  expect(await cmdProactive({ t, target: { kind: "local", port: 1 }, json: false, rest: [], print: (l) => lines.push(l) })).toBe(2);
  expect(await cmdProactive({ t, target: { kind: "local", port: 1 }, json: false, rest: ["replay"], days: 9, print: (l) => lines.push(l) })).toBe(2);
  expect(lines[0]).toContain("ducter proactive replay");
});

test("the home answers over the socket: with no AI agent yet, the replay says why it didn't run", async () => {
  dir = mkdtempSync(join(tmpdir(), "ducter-cli-replay-"));
  core = startCore({ dataDir: dir, port: 0, push: false, platform: "linux" });
  const lines: string[] = [];
  const code = await cmdProactive({ t: translator("en"), target: { kind: "local", port: core.port }, json: false, rest: ["replay"], days: 2, print: (l) => lines.push(l) });
  expect(code).toBe(1);
  expect(lines.at(-1)).toMatch(/didn't finish: no AI agent/);
}, 30_000);

test("a report prints each find with its sources, what it doesn't know, and how it knew", () => {
  const r: ReplayReport = {
    days: 3,
    mode: "three",
    zone: "Asia/Shanghai",
    web: true,
    looked: { mail: 412, events: 38, mentions: 5 },
    read: 61,
    noted: 27,
    said: [{ rung: "now", kind: "mismatch", text: "日历上「AGI Bar 北京分享」是 11/21（周六），Lina 的周报写的是 11/20（周五）。", how: [{ src: "calendar", what: "AGI Bar 北京分享", at: "2026-11-12T02:00:00.000Z", says: "11/21（周六），全天，没写时间" }, { src: "web", what: "agibar.example.com", at: "2026-11-19T02:00:00.000Z", url: "https://agibar.example.com/e" }], unknown: "几点开始" }],
    held: [{ reason: "below_bar", n: 4 }],
    noticed: [{ kind: "mismatch", text: "x", said: true, why: "1. 日历「AGI Bar 北京分享」" }],
    open: [{ name: "AGI Bar 北京分享", fields: ["day", "time"], state: "filled" }],
    looks: 1,
  };
  const out = replayLines(translator("zh"), r).join("\n");
  expect(out).toContain("[now] mismatch: 日历上「AGI Bar 北京分享」");
  expect(out).toContain("calendar  2026-11-12  AGI Bar 北京分享  11/21（周六），全天，没写时间");
  expect(out).toContain("https://agibar.example.com/e");
  expect(out).toContain("还不知道：几点开始");
  expect(out).toContain("1. 日历「AGI Bar 北京分享」");
});

// ---------- D464: ducter proactive week ----------

const counts = (o: Partial<OfferCounts>): OfferCounts => ({ shown: 0, opened: 0, go: 0, useful: 0, replied: 0, held: 0, muted: 0, faded: 0, waiting: 0, taken: 0, answered: 0, ...o });

/** The author's week, as research/197 measured hel: 26 offered, 3 taken up. */
const sample: WeekReport = {
  at: "2026-11-22T02:00:00.000Z",
  zone: "Asia/Shanghai",
  mode: "useful",
  weeks: [
    { from: "2026-11-09", to: "2026-11-15", current: false, offers: counts({ shown: 24, opened: 4, go: 1, faded: 22, taken: 1, answered: 5, held: 0, muted: 1 }), byKind: { deadline: counts({ shown: 24, go: 1, taken: 1 }) }, bySource: { accounts: counts({ shown: 24, go: 1, taken: 1 }) }, interruptions: counts({}), takenUp: [] },
    {
      from: "2026-11-16",
      to: "2026-11-22",
      current: true,
      offers: counts({ shown: 26, opened: 7, go: 2, useful: 1, faded: 17, waiting: 4, muted: 1, taken: 3, answered: 9 }),
      byKind: { waiting_on_you: counts({ shown: 8, go: 2, taken: 2, opened: 3 }), next_step: counts({ shown: 4, useful: 1, taken: 1 }), todos: counts({ shown: 7, faded: 7 }) },
      bySource: { accounts: counts({ shown: 15, go: 2, taken: 2 }), tasks: counts({ shown: 4, useful: 1, taken: 1 }), todos: counts({ shown: 7, faded: 7 }) },
      interruptions: counts({ shown: 2, go: 1, taken: 1, faded: 1 }),
      takenUp: [
        { kind: "waiting_on_you", text: "Lina 问你 #2141 什么时候能 review", by: "go", at: "2026-11-17T01:01:00.000Z", offer: true },
        { kind: "plan_changed", text: "CA930 改到 21:40 起飞", by: "go", at: "2026-11-19T06:05:00.000Z", offer: false },
      ],
    },
  ],
  weights: { kind: { waiting_on_you: 2.25, todos: 0.74 }, senders: [{ sender: "lina@example.org", w: 2.25 }] },
};

test("week: usage for weeks past twelve", async () => {
  const lines: string[] = [];
  expect(await cmdProactive({ t: translator("en"), target: { kind: "local", port: 1 }, json: false, rest: ["week"], weeks: 13, print: (l) => lines.push(l) })).toBe(2);
  expect(lines[0]).toContain("ducter proactive week");
});

test("week: plain lines in Chinese, the line against one in twenty, interruptions apart, the weights now", () => {
  const out = weekLines(translator("zh"), sample, "zh");
  const text = out.join("\n");
  expect(out[0]).toBe("Ducter 自己提的事，按周算（Asia/Shanghai，有用就说）");
  expect(text).toContain("11 月 9 日 – 11 月 15 日\n  提了 24 条，你接了 1 条：4%。线是二十条接一条（5%）：还在线下。");
  expect(text).toContain("11 月 16 日 – 11 月 22 日（这周，到今天）\n  提了 26 条，你接了 3 条：12%。线是二十条接一条（5%）：到线了。");
  expect(text).toContain("有任何回应的：9 条（35%）");
  expect(text).toContain("打断你的（每次一条及时通知）：2 次，接了 1 次");
  expect(text).toContain("打断你的：没有");
  // Tables line up by terminal columns (a Chinese character is two).
  const wide = (s: string) => s.length + [...s].filter((c) => /\p{Script=Han}/u.test(c)).length;
  const at = out.findIndex((l) => l.trimStart().startsWith("在等你回"));
  const head = out.slice(0, at).findLast((l) => l.includes("还在"))!;
  expect(wide(head)).toBe(wide(out[at]!));
  // The busiest kind first.
  expect(out[at - 1]).toBe(head);
  expect(text).toContain("    好  在等你回  「Lina 问你 #2141 什么时候能 review」");
  expect(text).toContain("    好  计划变了  「CA930 改到 21:40 起飞」（打断你的那种）");
  expect(text).toContain("  按类：在等你回 ×2.25，你的待办 ×0.74");
  expect(text).toContain("  按发件人：lina@example.org ×2.25");
});

test("week: English, and nothing learned yet", () => {
  const out = weekLines(translator("en"), { ...sample, weights: { kind: {}, senders: [] } }, "en").join("\n");
  expect(out).toContain("Nov 16 – Nov 22 (this week, so far)\n  Offered 26, you took up 3: 12%. The line is one in twenty (5%): at or above it.");
  expect(out).toContain("By where it came from");
  expect(out).toContain("Waiting on you");
  expect(out).toContain("  Nothing learned yet.");
});

test("week: the home counts its own Log over the socket (json and plain)", async () => {
  dir = mkdtempSync(join(tmpdir(), "ducter-cli-week-"));
  const clock = new FakeClock(Date.parse("2026-11-17T00:00:00Z"));
  core = startCore({ dataDir: dir, port: 0, push: false, platform: "linux", clock, proactive: { zone: "Asia/Shanghai" } });
  core.log.append({ stream: "channel", origin: "partner", kind: "finds", body: { noteId: "n1", rung: "morning", opening: "早。", finds: [{ findId: "f1", kind: "deadline", text: "域名 12/01 到期", how: [], decisionId: "d1", offer: true }, { findId: "f2", kind: "next_step", text: "#2203 还开着", how: [], offer: true }] } });
  core.log.append({ stream: "channel", origin: "user", kind: "find_state", body: { findId: "f1", kind: "deadline", state: "useful" } });
  const lines: string[] = [];
  const target = { kind: "local" as const, port: core.port };
  expect(await cmdProactive({ t: translator("en"), target, json: true, rest: ["week"], weeks: 1, print: (l) => lines.push(l) })).toBe(0);
  const j = JSON.parse(lines[0]!) as { ok: boolean; report: WeekReport };
  expect(j.ok).toBe(true);
  expect(j.report.weeks).toHaveLength(1);
  expect(j.report.weeks[0]!.offers).toMatchObject({ shown: 2, useful: 1, taken: 1, waiting: 1 });
  expect(j.report.weeks[0]!.bySource).toMatchObject({ accounts: { shown: 1 }, tasks: { shown: 1 } });
  lines.length = 0;
  expect(await cmdProactive({ t: translator("en"), target, json: false, rest: ["week"], lang: "en", print: (l) => lines.push(l) })).toBe(0);
  expect(lines.join("\n")).toContain("Offered 2, you took up 1: 50%.");
}, 30_000);
