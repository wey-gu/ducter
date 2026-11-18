// D357: 你的待办 / Your to-dos on On hand. The few shown (never more than three, chosen to save
// attention: a review request, a mention, a due line, the newest), the fold's pages through the
// adapters (GitHub's own pages, its search for words, a repository or the review requests, kept for
// a while, its rate limit said), a vault's folders and tags, and where a handed-over issue is done.
import { afterEach, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SourceItem } from "@ducter/protocol";
import { startCore } from "../src/core.ts";
import { RateLimited } from "../src/task-sources/adapter.ts";
import { createGitHub, searchWords } from "../src/task-sources/github.ts";
import { createObsidian } from "../src/task-sources/obsidian.ts";
import { commonest, folderOf, glanceOf, placeForRepo } from "../src/task-sources/index.ts";
import { fakeGh, type FakeIssue } from "./fake-gh-issues.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

const it = (ref: string, o: Partial<SourceItem> = {}): SourceItem => ({ source: "s1", kind: "github", ref, label: `#${ref.split("#")[1]}`, where: ref.split("#")[0], title: ref, state: "open", ...o });
const at = (h: number) => `2026-11-18T${String(h).padStart(2, "0")}:00:00Z`;

test("the few shown: the newest review request, then mentions, then due lines, then the newest; never a live one, never more than three", () => {
  const from = [
    {
      recent: [it("a/b#1", { updatedAt: at(9) }), it("a/b#2", { updatedAt: at(11) }), it("a/b#3", { updatedAt: at(10) })],
      review: [it("a/c#7", { updatedAt: at(8), review: true, pr: true }), it("a/c#8", { updatedAt: at(12), review: true, pr: true })],
      mentioned: [it("a/b#3", { updatedAt: at(10) })],
    },
  ];
  const g = glanceOf(from, () => false, "2026-11-18");
  expect(g.map((x) => [x.ref, x.why])).toEqual([
    ["a/c#8", "review"],
    ["a/b#3", "mentioned"],
    ["a/b#2", "recent"],
  ]);
  // One with a live task is on the board already: the next one stands instead.
  expect(glanceOf(from, (r) => r === "a/b#2", "2026-11-18").map((x) => x.ref)).toEqual(["a/c#8", "a/b#3", "a/b#1"]);
  // Nothing to review, nothing mentioned: the newest, and a second review request only when room is left.
  expect(glanceOf([{ recent: [it("a/b#1", { updatedAt: at(9) })], review: [it("a/c#7", { review: true }), it("a/c#9", { review: true })], mentioned: [] }], () => false, "2026-11-18").map((x) => x.why)).toEqual(["review", "recent", "review"]);
  // An Obsidian line due by the day after tomorrow comes before the newest; one due later doesn't.
  const obs = (ref: string, due?: string, h = 9): SourceItem => ({ source: "s2", kind: "obsidian", ref, label: "Week", where: "Plans/Week.md", title: ref, state: "open", updatedAt: at(h), ...(due ? { due } : {}) });
  const g2 = glanceOf([{ recent: [obs("x::1", undefined, 12), obs("x::2", "2026-11-20"), obs("x::3", "2026-11-25"), obs("x::4", "2026-11-17")], review: [], mentioned: [] }], () => false, "2026-11-18");
  expect(g2.map((x) => [x.ref, x.why])).toEqual([
    ["x::4", "due"],
    ["x::2", "due"],
    ["x::1", "recent"],
  ]);
  expect(glanceOf([], () => false, "2026-11-18")).toEqual([]);
  // Two sources: their newest a source at a time, never one app's three.
  const both = glanceOf([{ recent: [it("a/b#1", { updatedAt: at(1) }), it("a/b#2", { updatedAt: at(2) })], review: [], mentioned: [] }, { recent: [obs("y::1", undefined, 9), obs("y::2", undefined, 8), obs("y::3", undefined, 7)], review: [], mentioned: [] }], () => false, "2026-11-18");
  expect(both.map((x) => x.ref)).toEqual(["a/b#2", "y::1", "a/b#1"]);
});

const many = (n: number, o: Partial<FakeIssue> = {}): FakeIssue[] =>
  Array.from({ length: n }, (_, i) => ({ repo: i % 3 ? "acme/web" : "acme/api", number: i + 1, title: `Issue ${i + 1}`, updated: new Date(Date.parse("2026-11-18T12:00:00Z") - i * 60_000).toISOString(), ...o }));

test("GitHub's fold: its own pages while nothing narrows it, search for words, a repository and the review requests; kept a while", async () => {
  const gh = fakeGh([...many(75), { repo: "acme/web", number: 500, title: "Review the parser", pr: true, assigned: false, review: true, author: "mei" }]);
  let now = Date.parse("2026-11-18T12:00:00Z");
  const a = createGitHub({ source: "s1", run: gh.run, now: () => now });
  await a.status();
  const p1 = await a.browse!({ page: 1 });
  expect(p1.items).toHaveLength(30);
  expect(p1.more).toBe(true);
  expect(p1.items[0]!.ref).toBe("acme/api#1");
  const p3 = await a.browse!({ page: 3 });
  expect(p3.items.map((i) => i.number ?? i.label)).toHaveLength(15);
  expect(p3.more).toBe(false);
  // The same page again within two minutes: nothing asked.
  const calls = gh.calls.length;
  await a.browse!({ page: 1 });
  expect(gh.calls.length).toBe(calls);
  now += 3 * 60_000;
  await a.browse!({ page: 1 });
  expect(gh.calls.length).toBe(calls + 1);
  // Words: "#12" is the number; the person's own qualifiers are dropped.
  expect(searchWords("#12 repo:evil/x  parser")).toBe("12 parser");
  const byNumber = await a.browse!({ page: 1, query: "#12" });
  expect(byNumber.items.map((i) => i.ref)).toEqual(["acme/web#12"]);
  // A repository narrows through search.
  const web = await a.browse!({ page: 1, where: "acme/web" });
  expect(web.items.every((i) => i.where === "acme/web")).toBe(true);
  expect(web.more).toBe(true);
  // The review requests: marked as such, with who asked.
  const rv = await a.browse!({ page: 1, review: true });
  expect(rv.items).toEqual([expect.objectContaining({ ref: "acme/web#500", review: true, author: "mei", pr: true })]);
  // Over GitHub's rate limit: said as such, never as "nothing there".
  gh.limited = true;
  await expect(a.browse!({ page: 2, query: "parser" })).rejects.toBeInstanceOf(RateLimited);
});

test("the service: the glance in the sources view, the fold's pages with its chips, a vault by folder and tag, the rate limit", async () => {
  const t = tempDir();
  stops.push(t.cleanup);
  const gh = fakeGh([
    ...many(40),
    { repo: "acme/web", number: 900, title: "Review: the new pick list", pr: true, assigned: false, review: true, author: "mei", updated: "2026-11-18T13:00:00Z" },
    { repo: "acme/api", number: 901, title: "Ping: can you look", mentions: true, updated: "2026-11-17T13:00:00Z" },
  ]);
  const home = join(t.dir, "home");
  const v = join(t.dir, "Life");
  mkdirSync(join(v, "Plans"), { recursive: true });
  mkdirSync(join(v, "Home"), { recursive: true });
  writeFileSync(join(v, "Plans", "Week.md"), "- [ ] Renew the passport 📅 2026-11-19 #errand\n- [ ] Draft the trip plan #trip\n");
  writeFileSync(join(v, "Home", "List.md"), "- [ ] Fix the tap #errand\n");
  const core = startCore({ dataDir: join(t.dir, "data"), port: 0, push: false, batchMs: 5, taskSources: { ghRun: gh.run, ghEnv: {}, home, pollMs: 3_600_000, boundMs: 0, quietMs: 0, today: () => "2026-11-18" } });
  stops.push(() => core.stop());
  const ts = core.taskSources;
  const added = await ts.add("github");
  await ts.look();
  const view = ts.view();
  expect(view.glance?.length).toBe(3);
  expect(view.glance!.map((g) => [g.ref, g.why])).toEqual([
    ["acme/web#900", "review"],
    ["acme/api#901", "mentioned"],
    ["acme/api#1", "recent"],
  ]);
  // The fold: a page, more after it, the repositories as chips (commonest first).
  const p = await ts.browse({ page: 1 });
  expect(p.items).toHaveLength(30);
  expect(p.more).toBe(true);
  expect(p.wheres.slice(0, 2)).toEqual(["acme/web", "acme/api"]);
  expect((await ts.browse({ page: 2 })).more).toBe(false);
  const rv = await ts.browse({ page: 1, review: true });
  expect(rv.items.map((i) => i.ref)).toEqual(["acme/web#900"]);
  // A vault: by folder and by tag, its tags as chips; no review list there.
  const vault = await ts.add("obsidian", v);
  await ts.look();
  const obs = await ts.browse({ source: vault.id!, page: 1 });
  expect(obs.items.map((i) => i.title).sort()).toEqual(["Draft the trip plan #trip", "Fix the tap #errand", "Renew the passport #errand"].sort());
  expect(obs.wheres.sort()).toEqual(["Home", "Plans"]);
  expect(obs.tags[0]).toBe("errand");
  expect((await ts.browse({ source: vault.id!, page: 1, where: "Home" })).items.map((i) => i.title)).toEqual(["Fix the tap #errand"]);
  expect((await ts.browse({ source: vault.id!, page: 1, tag: "trip" })).items.map((i) => i.title)).toEqual(["Draft the trip plan #trip"]);
  expect((await ts.browse({ source: vault.id!, page: 1, review: true })).items).toEqual([]);
  // The vault's line due tomorrow now stands among the few.
  expect(ts.view().glance!.some((g) => g.why === "due" && g.kind === "obsidian")).toBe(true);
  expect(ts.view().glance!.length).toBeLessThanOrEqual(3);
  // GitHub over its rate limit: said, the vault still answers.
  gh.limited = true;
  const lim = await ts.browse({ page: 1, query: "nothing cached" });
  expect(lim.limited).toBe(true);
  expect(lim.errors.map((e) => e.source)).toEqual([added.id!]);
});

test("where a handed-over issue is done: the folder whose origin is its repository, this computer's first; else one named like it", () => {
  const places = [
    { place: { kind: "repo", device: "mac2" }, name: "web", remote: "github.com/acme/web" },
    { place: { kind: "repo", device: "local" }, name: "web", remote: "github.com/acme/web" },
    { place: { kind: "repo" }, name: "api" },
    { place: { kind: "none" }, name: "" },
  ];
  expect(placeForRepo(places, "acme/web")).toBe(places[1]!);
  expect(placeForRepo(places, "Acme/API")).toBe(places[2]!);
  expect(placeForRepo(places, "acme/infra")).toBeUndefined();
  expect(placeForRepo(places, undefined)).toBeUndefined();
});

test("the chips: commonest first; a note's folder is its top folder", () => {
  expect(commonest(["b", "a", "b", "", "c", "a", "b"])).toEqual(["b", "a", "c"]);
  expect(folderOf("Plans/2026/Week.md")).toBe("Plans");
  expect(folderOf("Inbox.md")).toBe("");
});

test("a vault line's tags are its labels", async () => {
  const t = tempDir();
  stops.push(t.cleanup);
  writeFileSync(join(t.dir, "N.md"), "- [ ] Call the bank #errand #money/tax 📅 2026-11-20\n");
  const items = await createObsidian({ source: "s1", vault: t.dir }).list();
  expect(items[0]!.labels).toEqual(["errand", "money/tax"]);
});
