// D298: the partner's first words, from fake Claude Code and Codex records in a scratch home.
import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { LogEvent, ServerFrame } from "@ducter/protocol";
import { startCore } from "../src/core.ts";
import { firstWords, greet, whenSaid } from "../src/first-words.ts";
import { recentProjects, recentSessions } from "../src/local-agents/index.ts";
import { fakeAgents } from "./fake-agents.ts";
import { tempDir } from "./helpers.ts";

const NOW = new Date("2026-11-17T12:30:00Z"); // 20:30 in Shanghai
const ago = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

function scratch() {
  const t = tempDir();
  const home = join(t.dir, "home");
  const data = join(home, ".ducter");
  mkdirSync(data, { recursive: true });
  fakeAgents(home, [
    { agent: "claude-code", cwd: "/Users/ada/dev/hawdb", id: "c1", title: "Fix the flaky compaction test", ask: "the compaction test fails one run in five, find out why", at: ago(26) },
    { agent: "claude-code", cwd: "/Users/ada/dev/hawdb", id: "c0", ask: "older one", at: ago(70) },
    { agent: "codex", cwd: "/Users/ada/dev/website", id: "019a0000-1111-7222-8333-444455556666", title: "Move the blog to the new theme", at: ago(3) },
    { agent: "codex", cwd: "/Users/ada/notes", id: "019a0000-1111-7222-8333-777788889999", ask: "sort my reading list by topic", at: ago(50) },
    // Ducter's own sessions (its data folder) and a stale one: left out.
    { agent: "claude-code", cwd: join(data, "partner"), id: "own", ask: "You are Ducter", at: ago(1) },
    { agent: "claude-code", cwd: "/Users/ada/dev/old", id: "old", ask: "long ago", at: ago(24 * 40) },
  ]);
  return { t, home, data };
}

test("the reader finds the person's own folders, newest first, without Ducter's own or stale ones", () => {
  const { t, home, data } = scratch();
  try {
    const ss = recentSessions({ home, env: {}, now: NOW, exclude: [data] });
    expect(ss.map((s) => s.id)).toEqual(["019a0000-1111-7222-8333-444455556666", "c1", "019a0000-1111-7222-8333-777788889999", "c0"]);
    expect(ss[1]).toMatchObject({ agent: "claude-code", title: "Fix the flaky compaction test", ask: "the compaction test fails one run in five, find out why" });
    expect(ss[0]).toMatchObject({ agent: "codex", cwd: "/Users/ada/dev/website", title: "Move the blog to the new theme" });
    expect(ss[2]!.ask).toBe("sort my reading list by topic"); // the environment block isn't the person's words
    expect(recentProjects({ home, env: {}, now: NOW, exclude: [data] }).map((p) => p.name)).toEqual(["website", "hawdb", "notes"]);
    // An agent never used, or a home with nothing: an empty list.
    expect(recentSessions({ home: join(t.dir, "nobody"), env: {}, now: NOW })).toEqual([]);
  } finally {
    t.cleanup();
  }
});

test("the words: a greeting by the person's hour, then what they were doing, by folder and title", () => {
  const { t, home, data } = scratch();
  try {
    const projects = recentProjects({ home, env: {}, now: NOW, exclude: [data] });
    const zh = firstWords({ name: "小鸭", lang: "zh", now: NOW, tz: "Asia/Shanghai", projects, everyday: [{ zh: "周五下午提醒我交水电费", en: "Remind me on Friday" }], home: "/Users/ada" });
    expect(zh.text.startsWith("晚上好，我是小鸭。")).toBe(true);
    expect(zh.text).toContain("Claude Code 和 Codex");
    expect(zh.first.looked).toEqual(["claude-code", "codex"]);
    expect(zh.first.starts.map((s) => s.from)).toEqual(["codex", "claude-code", "codex", "everyday"]);
    expect(zh.first.starts[1]!.words).toBe("昨天你在 hawdb 里做「Fix the flaky compaction test」，要我接着看看吗？");
    expect(zh.first.starts[1]!.draft).toContain("（文件夹：~/dev/hawdb）");
    expect(zh.first.starts[0]!.words.startsWith("今天")).toBe(true);
    const en = firstWords({ name: "Duckie", lang: "en", now: NOW, tz: "America/New_York", projects: projects.slice(1, 2), everyday: [{ zh: "x", en: "Remind me on Friday" }], home: "/Users/ada" });
    expect(en.text).toBe("Good morning, I'm Duckie. I had a look at what your Claude Code worked on lately on this computer. Want to pick this up?");
    expect(en.first.starts.map((s) => s.words)).toEqual(["Yesterday you were on “Fix the flaky compaction test” in hawdb. Want me to pick it up?", "Remind me on Friday"]);
    for (const s of [...zh.first.starts, ...en.first.starts]) expect(s.words + s.draft).not.toContain(" · ");
  } finally {
    t.cleanup();
  }
});

test("nothing found, and nothing to think with yet: a warm hello, everyday things, and how to start", () => {
  const out = firstWords({ name: "Ducter", lang: "zh", now: NOW, tz: "Asia/Shanghai", projects: [], everyday: [{ zh: "a", en: "a" }, { zh: "b", en: "b" }, { zh: "c", en: "c" }, { zh: "d", en: "d" }], noBrain: true });
  expect(out.first.looked).toBeUndefined();
  expect(out.first.starts.length).toBe(3);
  expect(out.text).toContain("贴一个 API 密钥");
  expect(greet("en", "D", new Date("2026-11-17T19:00:00Z"), "Asia/Shanghai")).toBe("Up late? I'm D.");
  expect(whenSaid("zh", ago(24 * 3).toISOString(), NOW, "Asia/Shanghai")).toBe("3 天前");
});

test("the home says them once, in the Log, to an app's first hello; 别再看了 stops the looking", async () => {
  const { t, home, data } = scratch();
  const core = startCore({ dataDir: data, port: 0, batchMs: 5, firstWords: { home, env: {} }, deviceProbes: { cua: async () => null, harnesses: async () => [], kind: async () => "laptop" } });
  core.setPartner({ onTrigger: () => {} });
  try {
    const open = async (client: string, then?: (ws: WebSocket) => void) => {
      const frames: ServerFrame[] = [];
      const ws = new WebSocket(core.url);
      ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
      await new Promise<void>((res, rej) => ((ws.onopen = () => res()), (ws.onerror = rej)));
      ws.send(JSON.stringify({ t: "hello", tz: "Asia/Shanghai", locale: "zh", client }));
      for (let i = 0; i < 200 && !frames.some((f) => f.t === "first_screen"); i++) await Bun.sleep(10);
      then?.(ws);
      await Bun.sleep(80);
      ws.close();
      return frames;
    };
    expect((await open("cli")).filter((f) => f.t === "events").flatMap((f) => (f as { events: LogEvent[] }).events)).toEqual([]);
    const first = await open("desktop");
    const said = first.filter((f) => f.t === "events").flatMap((f) => (f as { events: LogEvent[] }).events);
    expect(said.length).toBe(1);
    expect(said[0]).toMatchObject({ kind: "ai_msg", origin: "partner" });
    const body = said[0]!.body as { text: string; first: { starts: { from: string }[]; looked: string[] } };
    expect(body.text).toMatch(/我是 Ducter。我看了看这台电脑上你的 Claude Code 和 Codex/);
    expect(body.first.starts.filter((s) => s.from !== "everyday").length).toBe(3);
    expect((first.find((f) => f.t === "first_screen") as Extract<ServerFrame, { t: "first_screen" }>).first.looks).toBe(true);
    // Said once: a second app sees the same message, not a second one.
    const again = (await open("web")).filter((f) => f.t === "events").flatMap((f) => (f as { events: LogEvent[] }).events);
    expect(again.length).toBe(1);
    // 别再看了: kept, and every app's first screen says so.
    const off = await open("desktop", (ws) => ws.send(JSON.stringify({ t: "local_agents", on: false })));
    const screens = off.filter((f) => f.t === "first_screen") as Extract<ServerFrame, { t: "first_screen" }>[];
    expect(screens.at(-1)!.first.looks).toBe(false);
    expect(JSON.parse(readFileSync(join(data, "settings.json"), "utf8")).localAgents).toBe(false);
  } finally {
    core.stop();
    t.cleanup();
  }
});

test("with looking off from the start, the first words read nothing and offer everyday things", async () => {
  const { t, home, data } = scratch();
  writeFileSync(join(data, "settings.json"), JSON.stringify({ localAgents: false }));
  const core = startCore({ dataDir: data, port: 0, batchMs: 5, firstWords: { home, env: {} }, deviceProbes: { cua: async () => null, harnesses: async () => [], kind: async () => "laptop" } });
  core.setPartner({ onTrigger: () => {} });
  try {
    const ws = new WebSocket(core.url);
    const frames: ServerFrame[] = [];
    ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
    await new Promise<void>((res) => (ws.onopen = () => res()));
    ws.send(JSON.stringify({ t: "hello", locale: "en", client: "web" }));
    for (let i = 0; i < 200 && !frames.some((f) => f.t === "first_screen"); i++) await Bun.sleep(10);
    ws.close();
    const said = frames.filter((f) => f.t === "events").flatMap((f) => (f as { events: LogEvent[] }).events);
    const body = said[0]!.body as { text: string; first: { starts: { from: string }[]; looked?: string[] } };
    expect(body.first.looked).toBeUndefined();
    expect(body.first.starts.every((s) => s.from === "everyday")).toBe(true);
    expect(body.text).not.toContain("hawdb");
  } finally {
    core.stop();
    t.cleanup();
  }
});
