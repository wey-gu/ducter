// D654 (research/245 §3.2): a project is its repository, derived once in core. ssh and https
// forms of one origin agree, a nested repository is its own project, a folder with no remote is
// keyed by its computer and path, and the person's rename/merge/hide/pin/order are kept on the home.
import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { OnHand, Place, TaskCard } from "@ducter/protocol";
import { folderInfo, normalizeRemote, projectKeyOf, projectShortName, type GitRun } from "@ducter/protocol/src/folder-info.ts";
import { createProjects } from "../src/projects.ts";
import { createProjectIdentities, displayNames } from "../src/project-identity.ts";

let dir = "";
beforeEach(() => (dir = realpathSync(mkdtempSync(join(tmpdir(), "ducter-project-")))));
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const card = (taskId: string, place: Place, extra: Partial<TaskCard> = {}): TaskCard => ({
  taskId,
  persona: "default",
  title: taskId,
  project: "",
  place,
  harness: "claude-code",
  attention: "working",
  residency: "warm",
  openedAt: "2026-11-27T00:00:00Z",
  updatedAt: "2026-11-27T00:00:00Z",
  ...extra,
});
const onHand = (tasks: TaskCard[]): OnHand => ({ tasks, counts: { needs_you: 0, working: tasks.length, waiting: 0, done_today: 0 }, waiters: [] });

test("the same origin is one key: ssh and https, .git, case, a port", () => {
  expect(normalizeRemote("git@github.com:Nowledge-Co/mem.git")).toBe("github.com/nowledge-co/mem");
  expect(normalizeRemote("https://github.com/nowledge-co/mem")).toBe("github.com/nowledge-co/mem");
  expect(normalizeRemote("ssh://git@github.com:22/Nowledge-Co/mem.git")).toBe("github.com/nowledge-co/mem");
  expect(projectKeyOf("git@github.com:Acme/Web.git", "local", "/x")).toBe(projectKeyOf("https://github.com/acme/web", "mbp", "/y"));
  expect(projectShortName("https://github.com/nowledge-co/nowledge-labs-website.git")).toBe("nowledge-labs-website");
});

test("a nested repository is its own project; a folder with no remote keys by its computer and path", async () => {
  // The website checkout inside the mem checkout: git's own top is the nested one.
  // Real folders under the test's temp dir: folderInfo checks the folder exists before asking git.
  const memDir = join(dir, "nowledge-mem");
  const siteDir = join(memDir, "nowledge-labs-website");
  mkdirSync(siteDir, { recursive: true });
  const tops: Record<string, string> = { [memDir]: memDir, [siteDir]: siteDir };
  const git: GitRun = async (cwd, args) => {
    if (args[0] === "rev-parse" && args[1] === "--show-toplevel") return { ok: !!tops[cwd], out: tops[cwd] ?? "" };
    if (args[0] === "remote") return { ok: true, out: cwd.endsWith("nowledge-labs-website") ? "git@github.com:nowledge-co/nowledge-labs-website.git" : "https://github.com/nowledge-co/mem" };
    return { ok: false, out: "" };
  };
  const mem = await folderInfo(memDir, git);
  const site = await folderInfo(siteDir, git);
  expect(mem.remote).toBe("github.com/nowledge-co/mem");
  expect(site.remote).toBe("github.com/nowledge-co/nowledge-labs-website");
  const a = projectKeyOf(mem.remote, "mac", mem.root!);
  const b = projectKeyOf(site.remote, "mac", site.root!);
  expect(a).not.toBe(b);
  // No remote: computer and path, never the folder's name alone (two `mem` on two computers differ).
  expect(projectKeyOf(undefined, "hel", "/home/w/code/mem/")).toBe("folder:hel:/home/w/code/mem");
  expect(projectKeyOf(undefined, "haswell", "/home/w/code/mem")).not.toBe(projectKeyOf(undefined, "hel", "/home/w/code/mem"));
});

test("two repositories that share a short name show owner/repo; one keeps its short name", () => {
  const names = displayNames([
    { key: "github.com/acme/web", remote: "github.com/acme/web", short: "web" },
    { key: "github.com/me/web", remote: "github.com/me/web", short: "web" },
    { key: "github.com/acme/mem", remote: "github.com/acme/mem", short: "mem" },
  ]);
  expect(names.get("github.com/acme/web")).toBe("acme/web");
  expect(names.get("github.com/me/web")).toBe("me/web");
  expect(names.get("github.com/acme/mem")).toBe("mem");
});

test("hel's shape is three repositories: mem on three computers, mem-backbone, the nested website", async () => {
  const remotes: Record<string, string> = {
    "local\0/home/w/ducter/projects/mem": "git@github.com:nowledge-co/mem.git",
    "haswell\0/home/w/ducter/projects/mem": "https://github.com/nowledge-co/mem",
    "haswell\0/home/w/dev/mem-identity": "git@github.com:nowledge-co/mem.git",
    "mac\0/Users/weyl/dev/nowledge-mem": "https://github.com/nowledge-co/mem.git",
    "haswell\0/home/w/ducter/projects/mem-backbone": "https://github.com/nowledge-co/mem-backbone",
    "mac\0/Users/weyl/dev/nowledge-mem/nowledge-labs-website": "git@github.com:nowledge-co/nowledge-labs-website.git",
  };
  const projects = createProjects({ dataDir: dir });
  const names: Record<string, string> = { local: "hel", haswell: "haswell", mac: "MacBook" };
  const ident = createProjectIdentities({
    projects,
    git: async (_cwd, args) => (args[0] === "remote" ? { ok: true, out: "git@github.com:nowledge-co/mem.git" } : { ok: false, out: "" }),
    remoteFolder: async (dev, path) => (remotes[`${dev}\0${path}`] ? { remote: remotes[`${dev}\0${path}`] } : {}),
    nameOf: (dev) => names[dev] ?? dev,
    changed: () => {},
  });
  const places: Place[] = [
    ...Array.from({ length: 7 }, (_, i) => ({ kind: "repo" as const, device: "local", repoPath: "/home/w/ducter/projects/mem", branch: `b${i}` })),
    { kind: "repo", device: "haswell", repoPath: "/home/w/ducter/projects/mem", branch: "x" },
    { kind: "repo", device: "haswell", repoPath: "/home/w/dev/mem-identity", branch: "y" },
    { kind: "repo", device: "mac", repoPath: "/Users/weyl/dev/nowledge-mem", branch: "z" },
    { kind: "repo", device: "haswell", repoPath: "/home/w/ducter/projects/mem-backbone", branch: "m" },
    { kind: "repo", device: "mac", repoPath: "/Users/weyl/dev/nowledge-mem/nowledge-labs-website", branch: "w1" },
    { kind: "repo", device: "mac", repoPath: "/Users/weyl/dev/nowledge-mem/nowledge-labs-website", branch: "w2" },
    { kind: "none" }, // a research briefing
    { kind: "none" }, // a Mem mailbox
    { kind: "none", device: "local" }, // Prow MCP set-up on hel
    { kind: "none", device: "haswell" }, // Prow MCP set-up on haswell
    { kind: "none", device: "local" }, // an errand
    { kind: "none", device: "local" }, // a routine's run
  ];
  for (const p of places) if (p.kind === "repo") await ident.read(p);
  const tasks = places.map((p, i) => card(`t${i}`, p, { ...(i >= 17 ? { workKind: "errand" as const } : {}), ...(i === 15 || i === 16 ? { computing: { device: "local" } } : {}) }));
  const on = ident.decorate(onHand(tasks));
  expect(on.projectList?.map((p) => p.name).sort()).toEqual(["mem", "mem-backbone", "nowledge-labs-website"]);
  const mem = on.projectList!.find((p) => p.name === "mem")!;
  expect(mem.devices).toEqual(["hel", "haswell", "MacBook"]);
  expect(on.tasks.filter((c) => c.projectName === "mem").length).toBe(10);
  expect(on.tasks.filter((c) => c.projectName === "nowledge-labs-website").length).toBe(2);
  // Keyless tasks: 不在项目里 for ordinary work, 电脑上的事 for errands / computer set-up.
  expect(on.tasks.filter((c) => c.projectGroup === "none").map((c) => c.taskId)).toEqual(["t13", "t14"]);
  expect(on.tasks.filter((c) => c.projectGroup === "computer").map((c) => c.taskId)).toEqual(["t15", "t16", "t17", "t18"]);
});

test("a folder with no remote is its own project; a second, unlike shape keeps two forks apart", async () => {
  const projects = createProjects({ dataDir: dir });
  const ident = createProjectIdentities({
    projects,
    remoteFolder: async (dev, path) =>
      path.includes("fork") ? { remote: path.includes("mine") ? "git@github.com:me/site.git" : "git@github.com:acme/site.git" } : {},
    nameOf: (dev) => dev,
    changed: () => {},
  });
  const places: Place[] = [
    { kind: "repo", device: "mbp", repoPath: "/Users/me/acme-fork" },
    { kind: "repo", device: "mbp", repoPath: "/Users/me/mine-fork" },
    { kind: "folder", device: "mbp", path: "/Users/me/notes" },
  ];
  for (const p of places) await ident.read(p);
  const on = ident.decorate(onHand(places.map((p, i) => card(`u${i}`, p))));
  // Two repositories sharing `site`: both show owner/repo (never one row).
  expect(on.projectList?.map((p) => p.name).sort()).toEqual(["acme/site", "me/site", "notes"]);
  expect(on.projectList?.find((p) => p.name === "notes")?.key).toBe("folder:mbp:/Users/me/notes");
});

test("rename, merge, hide, pin and order are kept in projects.json and are reversible", () => {
  const projects = createProjects({ dataDir: dir });
  const a = "github.com/nowledge-co/mem";
  const b = "folder:haswell:/home/w/dev/mem-identity";
  const c = "github.com/nowledge-co/mem-backbone";
  expect(projects.change({ act: "rename", key: a, name: "Mem" })).toMatchObject({ ok: true });
  expect(projects.change({ act: "merge", key: b, into: a })).toMatchObject({ ok: true });
  expect(projects.canonical(b)).toBe(a);
  expect(projects.change({ act: "hide", key: c, hidden: true })).toMatchObject({ ok: true });
  expect(projects.change({ act: "pin", key: c, pinned: true })).toMatchObject({ ok: true });
  expect(projects.change({ act: "order", keys: [c, a] })).toMatchObject({ ok: true });
  const again = createProjects({ dataDir: dir });
  expect(again.meta()).toMatchObject({ names: { [a]: "Mem" }, aliases: { [b]: a }, hidden: [c], pinned: [c], order: [c, a] });
  expect(again.canonical(b)).toBe(a);
  expect(again.nameFor(a, "mem")).toBe("Mem");
  // Every one is reversible from the same menu.
  expect(again.change({ act: "unmerge", key: b })).toMatchObject({ ok: true });
  expect(again.canonical(b)).toBe(b);
  expect(again.change({ act: "rename", key: a })).toMatchObject({ ok: true });
  expect(again.nameFor(a, "mem")).toBe("mem");
  expect(again.change({ act: "hide", key: c, hidden: false })).toMatchObject({ ok: true });
  expect(again.meta().hidden).toEqual([]);
});

test("one remote read per folder per computer, cached for every card", async () => {
  const projects = createProjects({ dataDir: dir });
  let calls = 0;
  const ident = createProjectIdentities({
    projects,
    remoteFolder: async () => {
      calls++;
      return { remote: "git@github.com:acme/web.git" };
    },
    nameOf: (dev) => dev,
    changed: () => {},
  });
  const place: Place = { kind: "repo", device: "mbp", repoPath: "/Users/me/web" };
  await ident.read(place);
  await ident.read(place);
  const on = ident.decorate(onHand([card("a", place), card("b", place)]));
  expect(calls).toBe(1);
  expect(on.projectList?.map((p) => p.name)).toEqual(["web"]);
  expect(on.tasks.every((c) => c.projectKey === "github.com/acme/web")).toBe(true);
});

test("default order: a project needing the person first, then the most recent activity; pinned on top; the person's drag order wins", async () => {
  const projects = createProjects({ dataDir: dir });
  const ident = createProjectIdentities({ projects, nameOf: (d) => d, changed: () => {} });
  const at = (h: number) => new Date(Date.UTC(2026, 10, 27, h)).toISOString();
  const p = (key: string, path: string): Place => ({ kind: "repo", device: "local", repoPath: path });
  const one = (id: string, key: string, name: string, path: string, attention: TaskCard["attention"], updatedAt: string): TaskCard => ({ ...card(id, p(key, path), { projectKey: key, projectName: name, attention }), updatedAt });
  const tasks = [
    one("a", "github.com/acme/a", "a", "/a", "needs_you", at(8)),
    one("b", "github.com/acme/b", "b", "/b", "working", at(12)),
    one("c", "github.com/acme/c", "c", "/c", "working", at(6)),
  ];
  const on = ident.decorate(onHand(tasks));
  expect(on.projectList?.map((x) => x.name)).toEqual(["a", "b", "c"]);
  // Pinned comes first whatever happens now.
  projects.change({ act: "pin", key: "github.com/acme/c", pinned: true });
  expect(ident.decorate(onHand(tasks)).projectList?.map((x) => x.name)).toEqual(["c", "a", "b"]);
  // The person's drag order wins once set (pinned still first).
  projects.change({ act: "order", keys: ["github.com/acme/b", "github.com/acme/a"] });
  expect(ident.decorate(onHand(tasks)).projectList?.map((x) => x.name)).toEqual(["c", "b", "a"]);
});

test("a place that names the home and one that says local are one computer, so one project", async () => {
  const projects = createProjects({ dataDir: dir });
  const ident = createProjectIdentities({
    projects,
    deviceKey: (d) => (d === "home-server" ? "local" : d),
    nameOf: (d) => (d === "local" ? "home-server" : d),
    changed: () => {},
  });
  const viaName: Place = { kind: "repo", device: "home-server", repoPath: "/Users/weyl/dev/hawdb" };
  const viaLocal: Place = { kind: "repo", device: "local", repoPath: "/Users/weyl/dev/hawdb" };
  expect(ident.of(viaName).key).toBe("folder:local:/Users/weyl/dev/hawdb");
  expect(ident.of(viaLocal).key).toBe(ident.of(viaName).key);
  const on = ident.decorate(onHand([card("a", viaName), card("b", viaLocal), card("c", { kind: "repo", device: "local", repoPath: "/Users/weyl/dev/ducter" })]));
  expect(on.projectList?.filter((p) => p.name === "hawdb").length).toBe(1);
  expect(on.tasks.filter((t) => t.projectKey === "folder:local:/Users/weyl/dev/hawdb").map((t) => t.taskId)).toEqual(["a", "b"]);
});
