// D377: the person's own Claude Code / Codex sessions on a computer for tasks (the author's case: the
// home is a Linux server, the terminal sessions are on the MacBook). The worker reads them only after
// the person's yes for that computer, kept there; without it only the agents and their file times go
// up. The home asks every awake computer, ranks their sessions with its own, and carries one on there
// (the open check done on that computer). Synthetic sessions in scratch homes; obviously fake ids.
import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { WorkerInfo, WorkerLink, WorkerLinks, Runner } from "@ducter/protocol/src/internal.ts";
import { createLocalAgents } from "../src/local-agents/index.ts";
import { createOutside } from "../src/outside.ts";
import { createWorkerRecords } from "../src/worker-records.ts";
import { writeSession } from "./fixtures-agents.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => void)[] = [];
afterEach(() => {
  for (const s of stops.reverse()) s();
  stops = [];
});

const NOW = Date.now();
const CC = "fake0000-cc00-4000-8000-0000000000a1";
const CODEX = "0fa0e000-0000-7000-8000-0000000000a2";
const HOME_CC = "fake0000-cc00-4000-8000-0000000000b1";

/** The MacBook's scratch home (its Claude Code session 5 min ago, a Codex one yesterday) and the home's (an older Claude Code one). */
function world(o: { running?: boolean } = {}) {
  const t = tempDir();
  stops.push(t.cleanup);
  const mac = join(t.dir, "mac");
  const repo = join(mac, "dev", "fakedb");
  mkdirSync(repo, { recursive: true });
  writeSession(mac, { agent: "claude-code", id: CC, cwd: repo, title: "compaction 阈值做成可配置", branch: "compaction-cfg", turns: [["把 L0 compaction 的触发阈值做成可配置的", "改好了，测试还没补。"]], startedAt: new Date(NOW - 3600_000), updatedAt: new Date(NOW - 5 * 60_000) });
  writeSession(mac, { agent: "codex", id: CODEX, cwd: join(mac, "dev", "fakecache"), turns: [["fix the flaky TTL test", "Done."]], startedAt: new Date(NOW - 26 * 3600_000), updatedAt: new Date(NOW - 25 * 3600_000) });
  // Ducter's own task session on the Mac (its worktree in the worker's data folder): never listed.
  const macData = join(t.dir, "mac-ducter");
  writeSession(mac, { agent: "claude-code", id: "fake0000-cc00-4000-8000-0000000000c1", cwd: join(macData, "worktrees", "fakedb", "x"), turns: [["a Ducter task", "ok"]], startedAt: new Date(NOW - 600_000), updatedAt: new Date(NOW - 60_000) });
  const reg = join(mac, ".claude", "sessions");
  mkdirSync(reg, { recursive: true });
  writeFileSync(join(reg, "4343.json"), JSON.stringify({ pid: 4343, sessionId: CC, cwd: repo, kind: "interactive", entrypoint: "cli", status: "idle" }));
  const macReader = createLocalAgents({ home: mac, env: {}, uid: null, alive: (pid) => pid === 4343 && !!o.running });
  let sentUp = 0;
  const records = createWorkerRecords({ dataDir: macData, reader: macReader, home: mac, changed: () => sentUp++ });

  const home = join(t.dir, "server");
  mkdirSync(join(home, "src", "notes"), { recursive: true });
  writeSession(home, { agent: "claude-code", id: HOME_CC, cwd: join(home, "src", "notes"), title: "tidy the notes index", turns: [["tidy the notes index", "Done."]], startedAt: new Date(NOW - 4 * 86_400_000), updatedAt: new Date(NOW - 3 * 86_400_000) });
  const homeReader = createLocalAgents({ home, env: {}, uid: null });

  // The worker link: the home's requests answered by the Mac's own ops, as over the socket.
  let online = true;
  let calls = 0;
  const link: WorkerLink = {
    id: "w-mac",
    name: "Macbook Pro M3",
    online: () => online,
    call: async <T,>(op: string, args: unknown) => {
      calls++;
      const fn = (records.ops as Record<string, (a: unknown) => Promise<unknown>>)[op];
      if (!fn) throw new Error(`unknown op ${op}`);
      return JSON.parse(JSON.stringify(await fn(args ?? {}))) as T;
    },
    onSession: () => () => {},
    onOnline: () => () => {},
  };
  const workers: WorkerLinks = { link: (d) => (d === "w-mac" || d === "Macbook Pro M3" ? link : undefined), list: () => [{ id: "w-mac", name: "Macbook Pro M3", online: online } as WorkerInfo] };
  const opened: Parameters<Runner["openTask"]>[0][] = [];
  const runner = { openTask: async (i: Parameters<Runner["openTask"]>[0]) => (opened.push(i), { taskId: "t_mac" }) } as unknown as Runner;
  const log = { read: () => [], subscribe: () => () => {} } as never;
  const outside = createOutside({ reader: homeReader, dataDir: join(t.dir, "server-ducter"), log, tasks: { list: () => [] } as never, home, language: () => "zh", computer: () => "Hetzner Server", workers: () => workers });
  return { records, macData, repo, outside, runner, opened, setOnline: (v: boolean) => (online = v), calls: () => calls, sentUp: () => sentUp };
}

test("before the yes: nothing inside a session goes up, only which agents wrote there and when", async () => {
  const w = world();
  expect(w.records.view().state).toBe("unasked");
  const a = (await w.records.ops.local_sessions({})) as { allowed: boolean; agents: { agent: string; lastAt: string }[]; sessions?: unknown };
  expect(a.allowed).toBe(false);
  expect(a.sessions).toBeUndefined();
  // Ducter's own task session (written a minute ago) is not the person's: Claude Code's newest is 5 min ago.
  const cc = a.agents.find((x) => x.agent === "claude-code")!;
  expect(Math.abs(Date.parse(cc.lastAt) - (NOW - 5 * 60_000))).toBeLessThan(2000);
  expect(a.agents.map((x) => x.agent).sort()).toEqual(["claude-code", "codex"]);
  expect(await w.records.ops.local_session({ agent: "claude-code", id: CC })).toEqual({ allowed: false });
  // The home: the server's own session found, the Mac said as waiting for its yes (newer than anything found).
  const f = await w.outside.find({ harness: "claude-code" });
  expect(f.items.map((i) => i.id)).toEqual([HOME_CC]);
  expect(f.read.map((r) => r.computer)).toEqual(["Hetzner Server"]);
  expect(f.notYet).toMatchObject([{ device: "w-mac", computer: "Macbook Pro M3" }]);
});

test("after the yes on that computer: its sessions are ranked with the home's, said by computer, Ducter's own left out", async () => {
  const w = world();
  w.records.set(true);
  expect(w.sentUp()).toBe(1);
  expect(JSON.parse(readFileSync(join(w.macData, "records.json"), "utf8"))).toMatchObject({ allowed: true });
  const f = await w.outside.find({ harness: "claude-code" });
  expect(f.items.map((i) => [i.id, i.computer])).toEqual([
    [CC, "Macbook Pro M3"],
    [HOME_CC, "Hetzner Server"],
  ]);
  const mac = f.items[0]!;
  expect(mac).toMatchObject({ device: "w-mac", cwd: "~/dev/fakedb", project: "fakedb", branch: "compaction-cfg", title: "compaction 阈值做成可配置" });
  expect(f.read.map((r) => r.computer)).toEqual(["Hetzner Server", "Macbook Pro M3"]);
  expect(f.notYet).toEqual([]);
  // Words find it there too; asked again within a few seconds, the Mac's answer is reused.
  const before = w.calls();
  expect((await w.outside.find({ q: "compaction" })).items[0]!.id).toBe(CC);
  expect(w.calls()).toBe(before);
  // The first look on each computer is said once (the home's and the Mac's apart).
  expect(w.outside.firstLookAt(["w-mac"])).toEqual(["w-mac"]);
  expect(w.outside.firstLookAt(["local", "w-mac"])).toEqual(["local"]);
  expect(w.outside.firstLookAt(["local", "w-mac"])).toEqual([]);
});

test("carried on there: the Mac's own folder, the same session resumed by its agent; refused while open in its terminal", async () => {
  const w = world({ running: true });
  w.records.set(true);
  await w.outside.find({ harness: "claude-code" });
  const a = await w.outside.adopt(w.runner, "p1", "claude-code", CC, undefined, undefined, { ask: "把剩下的测试补上" });
  expect(a).toMatchObject({ ok: false, open: "running" });
  expect(a.message).toBe("它还在 Claude Code 里开着。先在那边退出（/exit），再在这里接着做。");
  expect(w.opened).toEqual([]);
});

test("closed there: it opens as a folder task on that computer, its earlier turns and the person's words with it", async () => {
  const w = world();
  w.records.set(true);
  await w.outside.find({});
  const a = await w.outside.adopt(w.runner, "p1", "claude-code", CC, undefined, undefined, { ask: "把剩下的测试补上" });
  expect(a).toMatchObject({ ok: true, taskId: "t_mac" });
  expect(w.opened[0]).toMatchObject({ place: { kind: "folder", device: "w-mac", path: w.repo }, project: "fakedb", harness: "claude-code", origin: "you" });
  expect(w.opened[0]!.adopt).toMatchObject({ agent: "claude-code", sessionId: CC, ask: "把剩下的测试补上" });
  expect(w.opened[0]!.adopt!.turns.map((x) => x.role)).toEqual(["user", "assistant"]);
});

test("a Ducter there from before D377 (it doesn't know the op): said as unread, never as waiting for a yes", async () => {
  const t = tempDir();
  stops.push(t.cleanup);
  const old: WorkerLink = { id: "w-old", name: "fake-mini", online: () => true, call: async () => Promise.reject(new Error("unknown op local_sessions")), onSession: () => () => {}, onOnline: () => () => {} };
  const workers: WorkerLinks = { link: (d) => (d === "w-old" ? old : undefined), list: () => [{ id: "w-old", name: "fake-mini", online: true } as WorkerInfo] };
  const outside = createOutside({ reader: createLocalAgents({ home: join(t.dir, "none"), env: {}, uid: null }), dataDir: join(t.dir, "d"), log: { read: () => [], subscribe: () => () => {} } as never, tasks: { list: () => [] } as never, computer: () => "fake-home", workers: () => workers });
  expect(await outside.find({})).toMatchObject({ items: [], unread: ["fake-mini"], notYet: [] });
});

test("off on that computer forgets and refuses; asleep, it is said as unreachable", async () => {
  const w = world();
  w.records.set(true);
  await w.outside.find({});
  w.records.set(false);
  expect(JSON.parse(readFileSync(join(w.macData, "records.json"), "utf8"))).toMatchObject({ allowed: false });
  expect(await w.records.ops.local_session({ agent: "claude-code", id: CC })).toEqual({ allowed: false });
  const r = await w.outside.adopt(w.runner, "p1", "claude-code", CC, undefined, undefined, { device: "w-mac" });
  expect(r).toMatchObject({ ok: false, message: "Macbook Pro M3 还没让我看你的记录。" });
  w.setOnline(false);
  expect((await w.outside.adopt(w.runner, "p1", "claude-code", CC, undefined, undefined, { device: "w-mac" })).message).toBe("现在连不上 Macbook Pro M3。");
  expect((await w.outside.find({})).read.map((x) => x.computer)).toEqual(["Hetzner Server"]);
  // Kept across a restart there.
  const again = createWorkerRecords({ dataDir: w.macData, reader: createLocalAgents({ home: join(w.macData, "none"), env: {}, uid: null }) });
  expect(again.view()).toEqual({ state: "off", agents: [] });
  expect(existsSync(join(w.macData, "records.json"))).toBe(true);
});
