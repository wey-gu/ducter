// D638: Go is answered in a moment and the slow work follows. The sheet already asked its how;
// Go makes the group and replies, and only then reads every to-do, New task's places, the repository's
// folders and opens the task. Every step is slowed here (item reads, places, where, open) so the test
// can prove the answer comes before any task opens, that the sheet's how is never read twice, and that
// a failure after the answer lands on the card and puts the to-dos back. Per-step times are logged.
import { afterEach, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { SourceItem, TaskCard, TaskGroupView } from "@ducter/protocol";
import type { HandoverDeps } from "../src/task-sources/handover.ts";
import { createHandover } from "../src/task-sources/handover.ts";
import type { HeldOpen } from "../src/task-groups.ts";
import { tempDir } from "./helpers.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const NOW = Date.parse("2026-11-26T09:00:00Z");

function itemOf(n: number, title: string): SourceItem {
  return { source: "src_1", kind: "github", ref: `acme/mem#${n}`, label: `#${n}`, where: "acme/mem", title, state: "open", body: `The body of ${n}.`, url: `https://github.com/acme/mem/issues/${n}`, updatedAt: new Date(NOW - n * 60_000).toISOString() };
}

/** The slow steps, each one's count so a repeated read shows. */
type Calls = { item: number; places: number; where: number; open: number };

function boot(o: { failOpen?: string } = {}) {
  const t = tempDir();
  mkdirSync(join(t.dir, "data"), { recursive: true });
  const items = [itemOf(412, "Distillation: fall back to a smaller result instead of failing"), itemOf(398, "Automatic distillation: the error says nothing useful"), itemOf(377, "Distillation gets slow on very long threads")];
  const calls: Calls = { item: 0, places: 0, where: 0, open: 0 };
  const held = new Set<string>();
  const handed = new Map<string, string>();
  const pile = {
    all: () => items.filter((i) => !held.has(i.ref) && !handed.has(i.ref)).map((item) => ({ item, group: "do" as const, why: "说得清楚", subject: "记忆提炼" })),
    taken: (r: string) => held.has(r) || handed.has(r),
    hold: (refs: string[]) => refs.forEach((r) => held.add(r)),
    release: (refs: string[]) => refs.forEach((r) => held.delete(r)),
    handed: (r: string, taskId: string) => (held.delete(r), handed.set(r, taskId)),
    handedOver: () => [],
    model: () => undefined,
    sortedAt: () => "s1",
  };
  let g: TaskGroupView | undefined;
  const parts: HeldOpen[] = [];
  const groups = {
    create(_persona: string, name: string, h: { order: "one_by_one" | "side_by_side"; hand: NonNullable<TaskGroupView["hand"]> }) {
      g = { id: "g1", name, order: h.order, by: "you", persona: "p1", members: [], createdAt: new Date(NOW).toISOString(), hand: h.hand };
      return g;
    },
    setHand(_id: string, patch: Partial<NonNullable<TaskGroupView["hand"]>>) {
      if (g) g = { ...g, hand: { ...g.hand!, ...patch } };
      return g;
    },
    hold(_id: string, ps: HeldOpen[]) {
      parts.push(...ps);
      return g;
    },
    attach(_id: string, taskId: string) {
      if (g) g = { ...g, members: [{ taskId }, ...g.members] };
      return g;
    },
    get: () => g,
    list: () => (g ? [g] : []),
    onSubject: () => undefined,
  };
  const cards: HeldOpen[] = [];
  const opened: string[] = [];
  const said: string[] = [];
  const log = {
    append: (e: { kind: string; body: unknown }) => {
      if (e.kind === "ai_msg") said.push((e.body as { text: string }).text);
      return { seq: said.length, ts: new Date(NOW).toISOString() };
    },
    read: () => [],
    head: () => 0,
    subscribe: () => () => {},
  };
  const d = {
    dataDir: join(t.dir, "data"),
    log,
    tasks: { get: () => undefined },
    pile,
    now: () => NOW,
    lang: () => "zh" as const,
    name: () => "小鸭",
    persona: () => "p1",
    // Every read slow: a GitHub issue (250 ms), New task's places (800 ms), the folder resolver (500 ms).
    item: async (ref: string) => {
      calls.item++;
      await sleep(250);
      return items.find((i) => i.ref === ref);
    },
    groups: () => groups,
    places: async () => {
      calls.places++;
      await sleep(800);
      return { places: [{ place: { kind: "repo" as const, device: "w-haswell", repoPath: "/home/lin/mem" }, name: "mem" }], harnesses: ["claude-code"] };
    },
    computers: () => [{ device: "local", name: "Mac" }, { device: "w-haswell", name: "haswell" }],
    rules: () => [],
    repoWhere: async () => {
      calls.where++;
      await sleep(500);
      return { ok: true as const, how: "named" as const, place: { kind: "repo" as const, device: "w-haswell", repoPath: "/home/lin/mem" }, computer: "haswell" };
    },
    open: async (input: HeldOpen) => {
      calls.open++;
      cards.push(input);
      opened.push(input);
      started.push(input.title);
      await sleep(1200);
      if (o.failOpen) throw new Error(o.failOpen);
      return { taskId: "t1", persona: "p1", title: input.title, project: input.project ?? "", place: input.place ?? { kind: "none" }, attention: "queued", openedAt: new Date(NOW).toISOString(), updatedAt: new Date(NOW).toISOString() } as TaskCard;
    },
    bind: () => {},
    tell: () => {},
    write: async () => ({ ok: true }),
    changed: () => {},
  } as unknown as HandoverDeps;
  const ho = createHandover(d);
  const started: string[] = [];
  return { t, ho, items, calls, pile, groups: () => g, parts, log: () => said, opened, started };
}

let stops: (() => void)[] = [];
afterEach(() => {
  for (const s of stops) s();
  stops = [];
});

const REFS = ["acme/mem#412", "acme/mem#398", "acme/mem#377"];

test("the answer comes back before any task opens, however slow the reads and the open are", async () => {
  const b = boot();
  stops.push(b.t.cleanup);
  const lines: string[] = [];
  const orig = console.debug;
  console.debug = (...a: unknown[]) => void lines.push(a.join(" "));
  try {
    const t0 = Date.now();
    const r = await b.ho.hand({ refs: REFS, note: "先别动数据库迁移，验证都去 haswell 上跑。", shape: "plan", subject: "记忆提炼", bySubject: true });
    const replyMs = Date.now() - t0;
    // The group and its record are there; the plan task is not. The reply is a moment, not the reads.
    expect(r).toMatchObject({ ok: true, groupId: "g1", handed: 3, shape: "plan", planning: true });
    expect(b.opened.length).toBe(0);
    expect(replyMs).toBeLessThan(80);
    await b.ho.idle();
    // Now the slow work is done: the plan task opened, and the group carries its plan.
    expect(b.opened.length).toBe(1);
    expect(b.opened[0]!.title).toContain("方案");
    expect(b.groups()!.hand!.plan).toMatchObject({ taskId: "t1", state: "planning" });
    // One per-step line the lead can read: the reply, then every slow step with its own time.
    const reply = lines.find((l) => l.includes("hand reply"));
    const ready = lines.find((l) => l.includes("hand ready"));
    expect(reply).toContain("3 to-dos");
    expect(ready).toContain("items 3");
    expect(ready).toMatch(/how \d+ms/);
    expect(ready).toMatch(/where \d+ms/);
    expect(ready).toMatch(/open\/hold \d+ms/);
  } finally {
    console.debug = orig;
  }
});

test("the how the sheet asked for is not read again: places once, and the reply does not wait on it", async () => {
  const b = boot();
  stops.push(b.t.cleanup);
  const note = "先别动数据库迁移。验证都去 haswell 上跑。";
  // The sheet: how is asked as the ticks and the note change.
  const h = await b.ho.how({ refs: REFS, note, bySubject: true, subject: "记忆提炼" });
  expect(h.where).toMatchObject({ device: "w-haswell", name: "haswell" });
  const places = b.calls.places;
  const t0 = Date.now();
  const r = await b.ho.hand({ refs: REFS, note, shape: "plan", subject: "记忆提炼", bySubject: true });
  expect(Date.now() - t0).toBeLessThan(80);
  expect(r.ok).toBe(true);
  // No second New task's places for the same refs and note.
  expect(b.calls.places).toBe(places);
  await b.ho.idle();
  expect(b.calls.places).toBe(1);
  expect(b.opened.length).toBe(1);
  expect(b.opened[0]!.place).toMatchObject({ kind: "repo", device: "w-haswell", repoPath: "/home/lin/mem" });
});

test("a failure after the answer: the group's card says it and the to-dos are handable again", async () => {
  const b = boot({ failOpen: "现在没有 AI agent 能接这个任务。" });
  stops.push(b.t.cleanup);
  const r = await b.ho.hand({ refs: REFS, shape: "plan", subject: "记忆提炼", bySubject: true });
  expect(r.ok).toBe(true); // answered before the open failed
  await b.ho.idle();
  expect(b.groups()!.hand!.error).toContain("现在没有 AI agent");
  expect(b.log().at(-1)).toContain("没交出去");
  expect(b.log().at(-1)).toContain("现在没有 AI agent");
  // Back on the pile: handable again, and the group no longer holds them.
  for (const ref of REFS) expect(b.pile.taken(ref)).toBe(false);
});

test("a held part that couldn't open: the card says it and its to-dos are handable again", async () => {
  const b = boot();
  stops.push(b.t.cleanup);
  const r = await b.ho.hand({ refs: REFS.slice(0, 2), shape: "side_by_side", subject: "记忆提炼", bySubject: true });
  await b.ho.idle();
  expect(r.groupId).toBe("g1");
  b.ho.heldFailed(r.groupId!, "h1", "现在没有 AI agent 能接这个任务。", b.items.slice(0, 2).map((i) => ({ source: i.source, kind: i.kind, ref: i.ref, label: i.label, title: i.title })));
  expect(b.groups()!.hand!.error).toContain("现在没有 AI agent");
  expect(b.log().at(-1)).toContain("没交出去");
  for (const ref of REFS.slice(0, 2)) expect(b.pile.taken(ref)).toBe(false);
});
