// D376: "接着我终端里那个 Claude 在做的": the partner finds the person's own Claude Code / Codex
// session on the home (D299's reader, under D327's switch) and carries it on as a task: the same
// agent resumes that very session in its own folder, the person's next words going with its first
// turn. Never one still open in a terminal; nothing at all with reading turned off.
import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bodies, TaskCard } from "../../protocol/src/index.ts";
import { createPartner, type OwnSessionsPort } from "../src/partner.ts";
import { FakeClock, fakeCore, fakeRunner, type Script } from "./fakes.ts";

const NOW = Date.parse("2026-11-19T10:00:00Z");
/** Two sessions on the home (obviously fake ids and folders). */
const SESSIONS = [
  { agent: "claude-code", id: "fake-cc-0001", title: "compaction threshold configurable", ask: "make the L0 compaction trigger configurable", cwd: "~/dev/fakedb", branch: "compaction-cfg", updatedAt: new Date(NOW - 40 * 60_000).toISOString() },
  { agent: "codex", id: "fake-codex-0002", title: "fix the flaky TTL test", cwd: "~/dev/fakecache", updatedAt: new Date(NOW - 26 * 3600_000).toISOString() },
];

function port(o: { looks?: boolean; open?: "running" | "recent" } = {}) {
  const adopted: { agent: string; id: string; ask?: string; closed?: boolean }[] = [];
  let looked = false;
  const p: OwnSessionsPort & { cards?: Map<string, TaskCard> } = {
    looks: () => o.looks ?? true,
    computer: () => "fake-home",
    list: (q) => ({ items: SESSIONS.filter((s) => (!q.harness || s.agent === q.harness) && (!q.q || `${s.title} ${s.ask ?? ""} ${s.cwd}`.includes(q.q))) }),
    openNow: (_a, id) => (id === "fake-cc-0001" ? o.open : undefined),
    firstLook: () => (looked ? false : ((looked = true), true)),
    async adopt(_r, _p, agent, id, _h, _m, x = {}) {
      if (o.open === "running" || (o.open === "recent" && !x.closed)) return { ok: false, open: o.open, message: "It's still open in Claude Code." };
      adopted.push({ agent, id, ...x });
      const at = new Date(NOW).toISOString();
      p.cards!.set("t_own", { taskId: "t_own", title: "compaction threshold configurable", project: "fakedb", place: { kind: "folder", device: "local", path: "/fake/dev/fakedb" }, harness: "claude-code", attention: "working", residency: "hot", openedAt: at, updatedAt: at } as TaskCard);
      return { ok: true, taskId: "t_own" };
    },
  };
  return { p, adopted };
}

function setup(script: Script, o: Parameters<typeof port>[0] = {}) {
  const clock = new FakeClock();
  clock.t = NOW;
  const fc = fakeCore(clock, mkdtempSync(join(tmpdir(), "ducter-own-")));
  const { p, adopted } = port(o);
  p.cards = fc.cards;
  (fc.core as unknown as { outside: OwnSessionsPort }).outside = p;
  const fr = fakeRunner(script);
  fr.bindCards(fc.cards);
  const partner = createPartner(fc.core, fr.runner, { now: clock.now, persistState: false, onError: () => {} });
  const user = (text: string) => partner.onTrigger(fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text } }));
  return { fc, partner, user, adopted };
}

type R = { ok: boolean; error?: string; off?: boolean; sessions?: { id: string; open?: string }[]; note?: string; taskId?: string; open?: string };
const call = async (fc: ReturnType<typeof fakeCore>, name: string, args: object) => (await fc.callTool(name, args)) as R;

test("found by the newest Claude Code session, carried on with the person's words, its line the task's ack", async () => {
  let found: R | undefined;
  let went: R | undefined;
  const { fc, partner, user, adopted } = setup(async (_i, s) => {
    found = await call(fc, "own_session_find", { agent: "claude-code" });
    // A line written before the call (haiku did): it becomes the carried-on task's ack.
    s.say("我接着做你在 Claude Code 里改的 compaction 阈值，把测试补上。");
    s.emit({ role: "tool", tool: { name: "mcp__ducter__own_session_continue", input: { agent: "claude-code", id: "fake-cc-0001" } } });
    went = await call(fc, "own_session_continue", { agent: "claude-code", id: "fake-cc-0001", ask: "把剩下的测试补上" });
    s.say("补完告诉你。");
    s.end();
  });
  user("接着我终端里那个 Claude 在做的，把剩下的测试补上");
  await partner.idle();
  expect(found!.ok).toBe(true);
  expect(found!.sessions!.map((x) => x.id)).toEqual(["fake-cc-0001"]);
  // The first look: the code says once what it read, by the computer's name, before the answer.
  expect(fc.events.filter((e) => e.kind === "ai_msg").map((e) => (e.body as Bodies["ai_msg"]).text)).toEqual(["我看了 fake-home 上你在 Claude Code 里的对话记录：只看名字、文件夹、时间和你说的头一句，不看代码和文件。"]);
  expect(found!.note).toContain("don't say it again");
  expect(went!.ok).toBe(true);
  expect(adopted).toEqual([{ agent: "claude-code", id: "fake-cc-0001", ask: "把剩下的测试补上" }]);
  const ack = fc.events.find((e) => e.kind === "ack")!.body as Bodies["ack"];
  expect(ack.text).toBe("我接着做你在 Claude Code 里改的 compaction 阈值，把测试补上。");
  const job = fc.events.find((e) => e.kind === "job_status")!.body as Bodies["job_status"];
  expect(job).toMatchObject({ jobId: ack.jobId, taskId: "t_own", state: "running" });
});

test("reading turned off: nothing is read or carried on, and the partner is told where it is turned on", async () => {
  let found: R | undefined;
  let went: R | undefined;
  const { fc, partner, user, adopted } = setup(
    async (_i, s) => {
      found = await call(fc, "own_session_find", {});
      went = await call(fc, "own_session_continue", { agent: "claude-code", id: "fake-cc-0001" });
      s.end();
    },
    { looks: false },
  );
  user("接着我终端里那个 Claude 在做的");
  await partner.idle();
  expect(found).toMatchObject({ ok: false, off: true });
  expect(found!.error).toContain("读它们留下的记录");
  expect(went!.ok).toBe(false);
  expect(adopted).toEqual([]);
});

test("still open in its terminal: listed as open, not carried on, no line put up for it", async () => {
  let found: R | undefined;
  let went: R | undefined;
  const { fc, partner, user, adopted } = setup(
    async (_i, s) => {
      found = await call(fc, "own_session_find", { agent: "claude-code" });
      went = await call(fc, "own_session_continue", { agent: "claude-code", id: "fake-cc-0001" });
      s.say("它还在终端里开着，先在那边 /exit，我再接着。");
      s.end();
    },
    { open: "running" },
  );
  user("接着我终端里那个 Claude 在做的");
  await partner.idle();
  expect(found!.sessions![0]!.open).toBe("open in its terminal now");
  expect(went).toMatchObject({ ok: false, open: "running" });
  expect(adopted).toEqual([]);
  expect(fc.events.some((e) => e.kind === "job_status")).toBe(false);
  expect(fc.events.some((e) => e.kind === "ai_msg")).toBe(true);
});

test("written a moment ago: carried on once the person says it is closed", async () => {
  let first: R | undefined;
  let second: R | undefined;
  const { fc, partner, user, adopted } = setup(
    async (_i, s) => {
      first = await call(fc, "own_session_continue", { agent: "claude-code", id: "fake-cc-0001" });
      second = await call(fc, "own_session_continue", { agent: "claude-code", id: "fake-cc-0001", closed: true });
      s.say("我接着做。");
      s.end();
    },
    { open: "recent" },
  );
  user("关掉了，接着做吧");
  await partner.idle();
  expect(first).toMatchObject({ ok: false, open: "recent" });
  expect(first!.error).toContain("closed: true");
  expect(second!.ok).toBe(true);
  expect(adopted).toEqual([{ agent: "claude-code", id: "fake-cc-0001", closed: true }]);
});

test("never unasked: a turn with no words from the person (a task's report) can't look", async () => {
  let found: R | undefined;
  const { fc, partner } = setup(async (_i, s) => {
    found = await call(fc, "own_session_find", {});
    s.end();
  });
  const at = new Date(NOW).toISOString();
  fc.cards.set("t1", { taskId: "t1", title: "x", project: "", place: { kind: "none" }, harness: "codex", attention: "done", residency: "parked", openedAt: at, updatedAt: at } as TaskCard);
  partner.onTrigger(fc.core.log.append({ stream: "task:t1", origin: "task", kind: "report", body: { taskId: "t1", state: "done", summary: "done", questions: [], evidence: [] } }));
  await partner.idle();
  if (found) expect(found.ok).toBe(false);
});
