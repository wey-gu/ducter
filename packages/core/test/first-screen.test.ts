// The empty conversation's words (D149): life first, never a path, code only for a developer,
// rotated by day, everyday examples for someone new, and one timely line for a returning person.
import { expect, test } from "bun:test";
import type { Place, ServerFrame, TaskCard } from "@ducter/protocol";
import { firstScreen, space, starters, type FirstScreenInput } from "../src/first-screen.ts";
import { startCore } from "../src/core.ts";
import { tempDir } from "./helpers.ts";

const NOW = new Date("2026-11-10T08:30:00Z");
const base = (over: Partial<FirstScreenInput> = {}): FirstScreenInput => ({
  tasks: [],
  onHand: { missed: [] },
  noted: [],
  apps: [],
  computers: [{ name: "MacBook", home: true }],
  talked: false,
  now: NOW,
  tz: "Asia/Shanghai",
  ...over,
});
let n = 0;
const task = (over: Partial<TaskCard> & { place?: Place } = {}): TaskCard => ({
  taskId: `t${++n}`,
  persona: "default",
  title: "Some task",
  project: "",
  place: { kind: "none" },
  harness: "codex",
  attention: "done",
  residency: "archived",
  openedAt: "2026-11-01T00:00:00Z",
  updatedAt: "2026-11-01T00:00:00Z",
  ...over,
} as TaskCard);
const repoTask = (name: string, at = "2026-11-08T00:00:00Z") =>
  task({ project: name, place: { kind: "repo", device: "local", repoPath: `/Users/weyl/dev/${name}` }, updatedAt: at });
const days = (k: number) => new Date(NOW.getTime() + k * 86_400_000);
const zh = (i: FirstScreenInput) => starters(i).map((s) => s.words.zh);

test("a brand-new person gets everyday examples: an email, a trip, a folder, a reminder", () => {
  const s = starters(base());
  expect(s).toHaveLength(4);
  expect(s.every((x) => x.kind === "everyday")).toBe(true);
  expect(s.map((x) => x.id).sort()).toEqual(["everyday:folder", "everyday:mail", "everyday:reminder", "everyday:trip"]);
  expect(firstScreen(base()).visit).toBe("first");
  expect(firstScreen(base()).news).toBeUndefined();
});

test("with no computer to tidy, the folder example gives way", () => {
  const ids = starters(base({ computers: [] })).map((x) => x.id);
  expect(ids).not.toContain("everyday:folder");
  expect(ids).toHaveLength(4);
});

test("it rotates by day: tomorrow isn't today, and the same day is stable", () => {
  for (const i of [base(), base({ apps: [{ service: "gmail", title: "Gmail" }, { service: "google_calendar", title: "Google Calendar" }] })]) {
    const today = zh(i);
    expect(zh({ ...i, now: new Date(NOW.getTime() + 3_600_000) })).toEqual(today);
    for (let k = 1; k <= 7; k++) expect(zh({ ...i, now: days(k) })).not.toEqual(zh({ ...i, now: days(k - 1) }));
  }
});

test("life first: connected mail and calendar, a noted thing, a task, before any example", () => {
  const i = base({
    apps: [{ service: "gmail", title: "Gmail" }, { service: "google_calendar", title: "Google Calendar" }],
    noted: [{ title: "下周三去杭州出差", at: "2026-11-08T00:00:00Z" }],
    tasks: [task({ title: "比价：三款空气净化器", attention: "working", updatedAt: "2026-11-09T00:00:00Z" })],
  });
  const s = starters(i);
  expect(s.slice(0, 3).every((x) => x.kind !== "everyday")).toBe(true);
  expect(s).toHaveLength(4);
  // The mailbox replaces the email example.
  expect(s.map((x) => x.id)).not.toContain("everyday:mail");
  // Over a week every personal thing shows up at least once.
  const seen = new Set<string>();
  for (let k = 0; k < 7; k++) for (const x of starters({ ...i, now: days(k) })) seen.add(x.kind);
  for (const k of ["mail", "calendar", "memory", "task"]) expect(seen.has(k)).toBe(true);
  expect(firstScreen(i).line.zh).toBe("邮件、日程、电脑上的文件，都可以交给我。需要你的时候，我再来问你。");
});

test("on a server home, the folder starter names the paired computer", () => {
  const s = starters(base({ computers: [{ name: "MacBook Air", home: false }] }));
  expect(s.find((x) => x.id === "downloads")!.words.zh).toBe("把 MacBook Air 上的下载文件夹理一理");
  expect(s.map((x) => x.id)).not.toContain("everyday:folder");
});

test("an old note is not brought up", () => {
  const s = starters(base({ noted: [{ title: "去年的事", at: "2026-09-01T00:00:00Z" }] }));
  expect(s.some((x) => x.kind === "memory")).toBe(false);
});

test("code only for someone who clearly works on code, by name, never a path, and last", () => {
  expect(starters(base({ tasks: [repoTask("hawdb")] })).some((x) => x.kind === "code")).toBe(false);
  const dev = base({ tasks: [repoTask("hawdb", "2026-11-09T00:00:00Z"), repoTask("ducter")], talked: true });
  for (let k = 0; k < 7; k++) {
    const s = starters({ ...dev, now: days(k) });
    const code = s.filter((x) => x.kind === "code");
    expect(code).toHaveLength(1);
    expect(s.at(-1)!.kind).toBe("code");
    expect(code[0]!.words.zh).toContain("hawdb");
    for (const x of s) {
      expect(x.words.zh).not.toMatch(/[~/\\]/);
      expect(x.words.en).not.toMatch(/[~/\\]/);
    }
  }
  // A project field holding a path falls back to the folder's name.
  const pathy = base({ tasks: [task({ project: "~/dev/hawdb", place: { kind: "repo", device: "local", repoPath: "/Users/x/dev/hawdb" } }), repoTask("y")] });
  expect(starters(pathy).find((x) => x.kind === "code")!.words.en).not.toContain("/");
});

test("returning with news: what waits for you first, then a wait that didn't come true, then a fresh result", () => {
  const done = task({ title: "整理发票", attention: "done", updatedAt: "2026-11-10T07:00:00Z" });
  const needs = task({ title: "回复 Alice 的报价", attention: "needs_you", updatedAt: "2026-11-09T00:00:00Z" });
  const missed = { waiterId: "w1", reason: "PR #9950 的检查都过", state: "expired" as const, endedAt: "2026-11-10T06:00:00Z" };
  expect(firstScreen(base({ tasks: [done, needs], onHand: { missed: [missed] } })).news).toMatchObject({ kind: "needs_you", taskId: needs.taskId });
  expect(firstScreen(base({ tasks: [done], onHand: { missed: [missed] } })).news).toMatchObject({ kind: "missed" });
  const d = firstScreen(base({ tasks: [done] }));
  expect(d.visit).toBe("returning");
  expect(d.news).toMatchObject({ kind: "done", taskId: done.taskId, words: { zh: "「整理发票」做好了，结果在这儿。" } });
  // Nothing new: just the greeting.
  expect(firstScreen(base({ tasks: [task({ updatedAt: "2026-11-01T00:00:00Z" })] })).news).toBeUndefined();
});

test("the home sends the first screen after an app's hello, never to a CLI", async () => {
  const t = tempDir();
  const core = startCore({ dataDir: t.dir, port: 0, batchMs: 5, deviceProbes: { cua: async () => null, harnesses: async () => [], kind: async () => "laptop" } });
  core.setPartner({ onTrigger: () => {} });
  try {
    const hello = async (client?: string) => {
      const frames: ServerFrame[] = [];
      const ws = new WebSocket(core.url);
      ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
      await new Promise<void>((res, rej) => ((ws.onopen = () => res()), (ws.onerror = rej)));
      ws.send(JSON.stringify({ t: "hello", tz: "Asia/Shanghai", ...(client ? { client } : {}) }));
      for (let i = 0; i < 100 && !frames.some((f) => f.t === "first_screen"); i++) await Bun.sleep(10);
      ws.close();
      return frames;
    };
    const app = (await hello("desktop")).find((f) => f.t === "first_screen") as Extract<ServerFrame, { t: "first_screen" }>;
    expect(app.first.visit).toBe("first");
    expect(app.first.starters.map((s) => s.id)).toContain("everyday:folder"); // the home is a laptop
    expect((await hello("cli")).some((f) => f.t === "first_screen")).toBe(false);
  } finally {
    await core.stop();
    t.cleanup();
  }
});

test("zh words keep a space between Chinese and Latin (D78)", () => {
  expect(space("看看Gmail上有没有")).toBe("看看 Gmail 上有没有");
  expect(space("明早9点")).toBe("明早 9 点");
  const s = starters(base({ apps: [{ service: "slack", title: "Slack" }] }));
  for (const x of s) expect(x.words.zh).not.toMatch(/[\p{Script=Han}][A-Za-z0-9]|[A-Za-z0-9][\p{Script=Han}]/u);
});
