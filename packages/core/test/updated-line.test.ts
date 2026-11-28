// D344: after an update the partner says so once, the first time the person is back: one line with
// the release's two what's-new lines and a link to its full notes. Once per version; not at all
// when the person read that version's notes from a card the same day; nothing on a fresh install.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { LogEvent, ServerFrame } from "@ducter/protocol";
import { startCore } from "../src/core.ts";
import { FakeClock } from "../src/clock.ts";
import { SUBJECT_LIVE_MS } from "../src/quiet-gap.ts";
import { createUpdatedLine, notesIn, updatedWords } from "../src/updated-line.ts";
import { tempDir } from "./helpers.ts";

const CHANGELOG = `# Changelog

## 0.0.72 - 2026-11-17

<!-- whats-new
zh: 待办来源：接上 GitHub 和 Obsidian 的待办
en: To-do sources: your GitHub issues and Obsidian tasks
zh: 你对任务说的话，伙伴都看得到
en: The partner sees what you told a task
-->

**To-do sources**
- Settings › To-do sources connects your GitHub issues.

## 0.0.71 - 2026-11-17

<!-- whats-new
zh: 停下以后你一开口，它就能再借手机
en: After Stop, ask and it can borrow your phone again
-->
`;

const line = (dir: string, version: string, o: { existing?: boolean; now?: Date } = {}) =>
  createUpdatedLine({ dataDir: dir, version, changelog: CHANGELOG, existing: () => o.existing ?? false, now: () => o.now ?? new Date("2026-11-17T09:00:00Z") });

test("the words: the version, the two lines in the person's language, and the link to that version's notes", () => {
  const n = notesIn(CHANGELOG, "0.0.72");
  expect(updatedWords("0.0.72", n, "zh")).toBe("更新到 0.0.72 了：待办来源：接上 GitHub 和 Obsidian 的待办；你对任务说的话，伙伴都看得到。[看看都改了什么](https://ducter.ai/changelog#0.0.72)");
  expect(updatedWords("0.0.72", n, "en")).toBe("Updated to 0.0.72: To-do sources: your GitHub issues and Obsidian tasks; The partner sees what you told a task. [See what changed](https://ducter.ai/changelog#0.0.72)");
  expect(updatedWords("0.0.73", notesIn(CHANGELOG, "0.0.73"), "en")).toBe("Updated to 0.0.73. [See what changed](https://ducter.ai/changelog#0.0.73)");
  // One line: never a list, never the other language.
  expect(updatedWords("0.0.72", n, "zh")).not.toContain("\n");
  expect(updatedWords("0.0.72", n, "zh")).not.toContain("Obsidian tasks");
});

test("the real CHANGELOG has the lines for this version", () => {
  const changelog = readFileSync(new URL("../../../CHANGELOG.md", import.meta.url), "utf8");
  const v = JSON.parse(readFileSync(new URL("../../cli/package.json", import.meta.url), "utf8")).version as string;
  const n = notesIn(changelog, v);
  // A version being prepared may not have its section yet; the latest section always has both.
  const latest = /^## (\S+)/m.exec(changelog)![1]!;
  const m = notesIn(changelog, latest);
  expect(m.zh?.length).toBeGreaterThan(0);
  expect(m.en?.length).toBeGreaterThan(0);
  if (latest === v) expect(n).toEqual(m);
});

test("once per version: the home updated, said at the first hello, never again", () => {
  const t = tempDir();
  try {
    expect(line(t.dir, "0.0.71").due({ lang: "zh" })).toBeUndefined(); // a fresh install: nothing to say
    const l = line(t.dir, "0.0.72");
    expect(l.pending()).toBe("0.0.72");
    expect(l.due({ lang: "zh" })).toStartWith("更新到 0.0.72 了：");
    expect(l.due({ lang: "zh" })).toBeUndefined();
    // A restart on the same version, or an app catching up to it, says nothing.
    const again = line(t.dir, "0.0.72");
    again.sawApp("phone", "0.0.71");
    again.sawApp("phone", "0.0.72");
    expect(again.due({ lang: "en" })).toBeUndefined();
    expect(JSON.parse(readFileSync(join(t.dir, "updates", "told.json"), "utf8")).told).toEqual(["0.0.72"]);
  } finally {
    t.cleanup();
  }
});

test("a fresh install says nothing; a home from before the record, with a conversation, says it", () => {
  const t = tempDir();
  const u = tempDir();
  try {
    expect(line(t.dir, "0.0.72", { existing: false }).pending()).toBeUndefined();
    expect(line(u.dir, "0.0.72", { existing: true }).due({ lang: "en" })).toStartWith("Updated to 0.0.72:");
  } finally {
    t.cleanup();
    u.cleanup();
  }
});

test("an app that updated (the Android app) says so once; an older home never says an older version", () => {
  const t = tempDir();
  try {
    line(t.dir, "0.0.71");
    const l = line(t.dir, "0.0.71");
    l.sawApp("phone", "0.0.71");
    expect(l.due({ lang: "en" })).toBeUndefined();
    l.sawApp("phone", "0.0.72");
    expect(l.due({ lang: "en" })).toStartWith("Updated to 0.0.72:");
    // The home catches up later: 0.0.72 was said already.
    expect(line(t.dir, "0.0.72").due({ lang: "en" })).toBeUndefined();
  } finally {
    t.cleanup();
  }
});

test("read from a card that day: not said; a card read another day doesn't silence it", () => {
  const t = tempDir();
  const u = tempDir();
  try {
    line(t.dir, "0.0.71").sawNotes("0.0.72", "Asia/Shanghai");
    const l = line(t.dir, "0.0.72");
    expect(l.due({ lang: "zh", tz: "Asia/Shanghai" })).toBeUndefined();
    expect(l.pending()).toBeUndefined();
    // Read yesterday, updated today: the line still comes.
    line(u.dir, "0.0.71", { now: new Date("2026-11-16T09:00:00Z") }).sawNotes("0.0.72", "Asia/Shanghai");
    expect(line(u.dir, "0.0.72").due({ lang: "zh", tz: "Asia/Shanghai" })).toStartWith("更新到 0.0.72 了");
  } finally {
    t.cleanup();
    u.cleanup();
  }
});

test("the home says it in the conversation at the app's hello, once; notes_seen is taken", async () => {
  const t = tempDir();
  const clock = new FakeClock(Date.parse("2026-11-17T09:00:00Z"));
  const opts = (version: string) => ({ dataDir: t.dir, port: 0, batchMs: 5, clock, update: { version }, deviceProbes: { cua: async () => null, harnesses: async () => [], kind: async () => "laptop" as const } });
  const hello = async (core: ReturnType<typeof startCore>, then?: (ws: WebSocket) => void) => {
    const frames: ServerFrame[] = [];
    const ws = new WebSocket(core.url);
    ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
    await new Promise<void>((res, rej) => ((ws.onopen = () => res()), (ws.onerror = rej)));
    ws.send(JSON.stringify({ t: "hello", tz: "Asia/Shanghai", locale: "zh", client: "web" }));
    for (let i = 0; i < 200 && !frames.some((f) => f.t === "on_hand"); i++) await Bun.sleep(10);
    then?.(ws);
    await Bun.sleep(60);
    ws.close();
    return frames.filter((f) => f.t === "events").flatMap((f) => (f as { events: LogEvent[] }).events).filter((e) => e.kind === "ai_msg" && /^更新到/.test((e.body as { text: string }).text));
  };
  try {
    let core = startCore(opts("0.0.71"));
    core.setPartner({ onTrigger: () => {} });
    core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "早" } });
    expect(await hello(core)).toEqual([]);
    core.stop();

    core = startCore(opts("0.0.72"));
    core.setPartner({ onTrigger: () => {} });
    // research/244 rule 6: the person just wrote, so the update note waits for a quiet moment.
    expect(await hello(core)).toEqual([]);
    clock.advance(SUBJECT_LIVE_MS + 1_000);
    const said = await hello(core);
    expect(said.length).toBe(1);
    expect(said[0]).toMatchObject({ origin: "partner", stream: "channel" });
    expect((said[0]!.body as { text: string }).text).toContain("(https://ducter.ai/changelog#0.0.72)");
    await hello(core);
    expect(core.log.read({ stream: "channel", kinds: ["ai_msg"] }).filter((e) => /^更新到/.test((e.body as { text: string }).text)).length).toBe(1);
    // The person reads 0.0.73's notes on the card, then updates the same day: nothing more.
    await hello(core, (ws) => ws.send(JSON.stringify({ t: "notes_seen", version: "0.0.73" })));
    core.stop();
    core = startCore(opts("0.0.73"));
    core.setPartner({ onTrigger: () => {} });
    await hello(core);
    expect(core.log.read({ stream: "channel", kinds: ["ai_msg"] }).filter((e) => /^更新到/.test((e.body as { text: string }).text)).length).toBe(1);
    core.stop();
  } finally {
    t.cleanup();
  }
});
