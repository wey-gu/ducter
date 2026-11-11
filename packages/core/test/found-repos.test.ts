// D203, D204: the home lists the projects in each computer's Ducter folder on New task (after the
// used and added ones, with their origin, so the Mac's copy of a hel repo is found), reads a
// reported repo's branches only when it is asked about, keeps each computer's list a while, says
// where each Ducter folder is (or that a worker is too old), looks through a computer's folders
// for 选择文件夹… / Find a folder…, and clones a Git address there (从 Git 地址加…).
import { afterEach, expect, test } from "bun:test";
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { LogEvent, ServerFrame, TaskCard } from "@ducter/protocol";
import type { Runner } from "@ducter/protocol/src/internal.ts";
import type { FolderInfo } from "@ducter/protocol/src/folder-info.ts";
import { listFolders, type BrowseResult, type RepoHint } from "@ducter/protocol/src/repos.ts";
import { startCore, type Core } from "../src/core.ts";
import { createFoundRepos } from "../src/newtask.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

const sh = (cwd: string, ...args: string[]) => {
  const r = Bun.spawnSync(["git", "-C", cwd, ...args], { stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0) throw new Error(r.stderr.toString());
  return r.stdout.toString().trim();
};

function repo(dir: string, name: string, origin?: string): string {
  const r = join(dir, name);
  Bun.spawnSync(["git", "init", "-q", "-b", "main", r]);
  sh(r, "config", "user.name", "t");
  sh(r, "config", "user.email", "t@t");
  writeFileSync(join(r, "a.txt"), "a\n");
  sh(r, "add", ".");
  sh(r, "commit", "-qm", "init");
  if (origin) sh(r, "remote", "add", "origin", origin);
  return realpathSync(r);
}

/** The author's Mac as hel's worker: the repos it reports, a folder read there, its folders. */
function fakeMac(state: { online: boolean; reposAsked: number; slowRepos?: boolean; asked: string[]; old?: boolean; cloned?: string[] }) {
  const reported: RepoHint[] = [
    { name: "ducter", path: "/Users/weyl/ducter/projects/ducter", touchedAt: "2026-11-10T09:00:00.000Z", remote: "github.com/wey-gu/ducter", defaultBranch: "main" },
    { name: "mem", path: "/Users/weyl/ducter/projects/mem", touchedAt: "2026-11-09T09:00:00.000Z", remote: "github.com/nowledge-co/mem", defaultBranch: "main" },
    { name: "notes", path: "/Users/weyl/ducter/projects/notes", touchedAt: "2026-11-01T09:00:00.000Z", defaultBranch: "master" },
  ];
  const folders: Record<string, FolderInfo> = {
    "/Users/weyl/ducter/projects/ducter": { exists: true, kind: "repo", root: "/Users/weyl/ducter/projects/ducter", name: "ducter", defaultBranch: "main", branches: ["main", "next", "worktree-x"], remote: "github.com/wey-gu/ducter" },
    "/Users/weyl/Sites/blog": { exists: true, kind: "repo", root: "/Users/weyl/Sites/blog", name: "blog", defaultBranch: "main", branches: ["main"] },
  };
  const tree: Record<string, BrowseResult> = {
    "": { ok: true, path: "/Users/weyl", home: "/Users/weyl", folders: [{ name: "dev", path: "/Users/weyl/dev" }, { name: "Sites", path: "/Users/weyl/Sites" }] },
    "/Users/weyl/Sites": { ok: true, path: "/Users/weyl/Sites", home: "/Users/weyl", parent: "/Users/weyl", folders: [{ name: "blog", path: "/Users/weyl/Sites/blog", repo: true }] },
  };
  return {
    nameOf: (dev: string) => (dev === "wmac" || dev === "Macbook Pro M3" ? "Macbook Pro M3" : undefined),
    homeName: () => "hel",
    workers: () => [{ id: "wmac", name: "Macbook Pro M3", online: state.online }],
    async folderInfo(dev: string, path: string) {
      state.asked.push(path);
      if (dev !== "wmac" || !state.online) return "offline" as const;
      return folders[path] ?? { exists: false };
    },
    async repos(dev: string) {
      state.reposAsked++;
      if (dev !== "wmac" || !state.online) return "offline" as const;
      if (state.old) return "old" as const;
      if (state.slowRepos) await Bun.sleep(4_000);
      return { folder: "/Users/weyl/ducter", repos: reported };
    },
    async browse(dev: string, path: string | undefined) {
      if (dev !== "wmac" || !state.online) return "offline" as const;
      if (state.old) return "old" as const;
      return tree[path ?? ""] ?? ({ ok: false, reason: "outside", message: "Only folders inside the home folder can be listed." } as const);
    },
    // D204: the Mac clones into its own Ducter folder; the home then reads the folder there.
    async clone(dev: string, address: string) {
      if (dev !== "wmac" || !state.online) return "offline" as const;
      if (state.old) return "old" as const;
      (state.cloned ??= []).push(address);
      if (address === "acme/private") return { ok: false as const, reason: "no_access" as const, message: "could not read Username for 'https://github.com': terminal prompts disabled" };
      const name = address.split("/").pop()!;
      const path = `/Users/weyl/ducter/projects/${name}`;
      folders[path] = { exists: true, kind: "repo", root: path, name, defaultBranch: "main", branches: ["main"], remote: `github.com/${address}` };
      return { ok: true as const, path, name, remote: `github.com/${address}`, defaultBranch: "main" };
    },
  };
}

function boot(extra: Partial<Parameters<typeof startCore>[0]> = {}): { core: Core; dir: string } {
  const t = tempDir();
  const harnesses = async () => [{ harness: "codex", installed: true, loggedIn: true }];
  const core = startCore({ dataDir: t.dir, port: 0, batchMs: 5, deviceProbes: { cua: async () => ({ missing: "test" }), harnesses, kind: async () => "server" }, ...extra });
  stops.push(t.cleanup, () => core.stop());
  core.setPartner({ onTrigger: (_e: LogEvent) => {} });
  return { core, dir: t.dir };
}

function fakeRunner(core: Core) {
  let n = 0;
  core.setRunner({
    harness: { start: async () => ({}) as any, available: async () => [] },
    async openTask(input: any): Promise<TaskCard> {
      const taskId = `t${++n}`;
      core.log.append({ stream: `task:${taskId}`, origin: "system", kind: "task_open", body: { taskId, title: input.title, project: input.project ?? "", place: input.place ?? { kind: "none" }, harness: "codex", brief: input.brief, origin: "you" } });
      return core.tasks.get(taskId)!;
    },
    send: async () => ({ delivered: "prompted" as const }),
    interrupt: async () => {},
    drop: async () => {},
    branchChanges: async () => undefined,
  } as unknown as Runner);
}

async function client(core: Core) {
  const frames: ServerFrame[] = [];
  const ws = new WebSocket(core.url);
  ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
  await new Promise<void>((res, rej) => ((ws.onopen = () => res()), (ws.onerror = rej)));
  stops.push(() => ws.close());
  ws.send(JSON.stringify({ t: "hello" }));
  const until = async <T extends ServerFrame>(pred: (f: ServerFrame) => boolean, ms = 6000): Promise<T> => {
    for (let i = 0; i < ms / 10; i++) {
      const hit = frames.find(pred);
      if (hit) return hit as T;
      await Bun.sleep(10);
    }
    throw new Error(`timeout; got ${frames.map((f) => f.t)}`);
  };
  await until((f) => f.t === "on_hand");
  let n = 0;
  /** Sends a frame and waits for the next answer of that type. */
  const ask = async <K extends ServerFrame["t"]>(f: object, t: K): Promise<Extract<ServerFrame, { t: K }>> => {
    const before = frames.length;
    n++;
    ws.send(JSON.stringify(f));
    return until<Extract<ServerFrame, { t: K }>>((x) => x.t === t && frames.indexOf(x) >= before);
  };
  return { ask, until, frames };
}

test("D203: hel's ducter, and the Mac's copy of it among the repos the Mac reports, after the used one, each on its computer", async () => {
  const mac = { online: true, reposAsked: 0, asked: [] as string[] };
  const { core, dir } = boot({ newTaskComputers: fakeMac(mac) });
  fakeRunner(core);
  const hel = repo(dir, "ducter", "https://github.com/wey-gu/ducter.git");
  const c = await client(core);
  const placeHel = { kind: "repo", device: "local", repoPath: hel };
  expect(await c.ask({ t: "task_new", words: "Fix the card.", place: placeHel, clientId: "a" }, "task_new_result")).toMatchObject({ ok: true });
  const o = await c.ask({ t: "task_new_options", place: placeHel }, "task_new_options");
  expect(o.places.map((p) => [p.name, p.computer, p.found ?? false])).toEqual([
    ["ducter", "hel", false],
    ["ducter", "Macbook Pro M3", true],
    ["mem", "Macbook Pro M3", true],
    ["notes", "Macbook Pro M3", true],
    ["", undefined, false],
  ]);
  // Both copies say the same origin: the phone's 谁来做 switches to the Mac's one for Claude Code.
  expect(o.places[0]).toMatchObject({ remote: "github.com/wey-gu/ducter", defaultBranch: "main", branches: ["main"] });
  expect(o.places[1]).toMatchObject({ place: { kind: "repo", device: "wmac", repoPath: "/Users/weyl/ducter/projects/ducter" }, remote: "github.com/wey-gu/ducter", defaultBranch: "main" });
  // A reported repo's branches are read only when it is the one asked about.
  expect(o.places[1]!.branches).toBeUndefined();
  expect(mac.asked).toEqual([]);
  const o2 = await c.ask({ t: "task_new_options", place: { kind: "repo", device: "wmac", repoPath: "/Users/weyl/ducter/projects/ducter" } }, "task_new_options");
  expect(o2.places.find((p) => p.name === "ducter" && p.computer === "Macbook Pro M3")).toMatchObject({ found: true, branches: ["main", "next", "worktree-x"] });
  expect(mac.asked).toEqual(["/Users/weyl/ducter/projects/ducter"]);
  // Kept a while: the Mac was asked for its repos once for three cards.
  expect(mac.reposAsked).toBe(1);
});

test("D203: a task on a reported repo makes it a used place (listed once, no longer found); an away Mac reports none", async () => {
  const mac = { online: true, reposAsked: 0, asked: [] as string[] };
  const { core } = boot({ newTaskComputers: fakeMac(mac) });
  fakeRunner(core);
  const c = await client(core);
  expect(await c.ask({ t: "task_new", words: "Look at mem.", place: { kind: "repo", device: "wmac", repoPath: "/Users/weyl/ducter/projects/mem" }, clientId: "m" }, "task_new_result")).toMatchObject({ ok: true });
  const o = await c.ask({ t: "task_new_options" }, "task_new_options");
  expect(o.places.filter((p) => p.name === "mem").map((p) => p.found ?? false)).toEqual([false]);
  mac.online = false;
  const { core: core2 } = boot({ newTaskComputers: fakeMac(mac) });
  const c2 = await client(core2);
  const o3 = await c2.ask({ t: "task_new_options" }, "task_new_options");
  expect(o3.places.map((p) => p.name)).toEqual([""]);
});

test("D203: a slow Mac's repos land for the next card; kept 10 minutes, then asked again", async () => {
  let now = 0;
  const calls: number[] = [];
  let slow = true;
  const found = createFoundRepos({
    now: () => now,
    computers: {
      nameOf: () => "Mac",
      homeName: () => "hel",
      folderInfo: async () => "offline",
      repos: async () => {
        calls.push(now);
        if (slow) await Bun.sleep(80);
        return [{ name: "a", path: "/Users/x/a", touchedAt: "2026-11-01T00:00:00.000Z" }];
      },
    },
  });
  expect(await found.get("wmac", 10)).toEqual([]); // the card doesn't wait for it
  await Bun.sleep(120);
  expect((await found.get("wmac", 10)).map((r) => r.name)).toEqual(["a"]); // it landed
  slow = false;
  now += 9 * 60_000;
  await found.get("wmac", 10);
  expect(calls.length).toBe(1);
  now += 2 * 60_000;
  await found.get("wmac", 50);
  expect(calls.length).toBe(2);
});

test("D203: Find a folder… on the Mac: its folders one level at a time; using one adds it there, and the card lists it next time", async () => {
  const mac = { online: true, reposAsked: 0, asked: [] as string[] };
  const { core } = boot({ newTaskComputers: fakeMac(mac) });
  const c = await client(core);
  const top = await c.ask({ t: "folder_browse", device: "wmac", clientId: "b1" }, "folder_browse_result");
  expect(top).toMatchObject({ ok: true, clientId: "b1", device: "wmac", path: "/Users/weyl", home: "/Users/weyl", folders: [{ name: "dev" }, { name: "Sites" }] });
  const sites = await c.ask({ t: "folder_browse", device: "wmac", path: "/Users/weyl/Sites", clientId: "b2" }, "folder_browse_result");
  expect(sites).toMatchObject({ ok: true, parent: "/Users/weyl", folders: [{ name: "blog", path: "/Users/weyl/Sites/blog", repo: true }] });
  expect(await c.ask({ t: "folder_browse", device: "wmac", path: "/etc", clientId: "b3" }, "folder_browse_result")).toMatchObject({ ok: false, reason: "outside" });
  expect(await c.ask({ t: "folder_browse", device: "nobody", clientId: "b4" }, "folder_browse_result")).toMatchObject({ ok: false, reason: "failed" });
  const added = await c.ask({ t: "project_add", path: "/Users/weyl/Sites/blog", device: "wmac", clientId: "p1" }, "project_add_result");
  expect(added).toMatchObject({ ok: true, place: { name: "blog", added: true, place: { kind: "repo", device: "wmac", repoPath: "/Users/weyl/Sites/blog" } } });
  const o = await c.ask({ t: "task_new_options" }, "task_new_options");
  expect(o.places[0]).toMatchObject({ name: "blog", added: true, place: { device: "wmac" } });
  expect(o.places[0]!.found).toBeUndefined();
  // Away: looking says so.
  mac.online = false;
  expect(await c.ask({ t: "folder_browse", device: "wmac", clientId: "b5" }, "folder_browse_result")).toMatchObject({ ok: false, reason: "offline" });
});

test("D203: Find a folder… on the home's own computer: confined to its home folder", async () => {
  const t = tempDir();
  stops.push(t.cleanup);
  const home = realpathSync(t.dir);
  mkdirSync(join(home, "dev", "site"), { recursive: true });
  const { core } = boot({ browseHome: (p) => listFolders(p, home) });
  const c = await client(core);
  expect(await c.ask({ t: "folder_browse", clientId: "h1" }, "folder_browse_result")).toMatchObject({ ok: true, path: home, folders: [{ name: "dev" }] });
  expect(await c.ask({ t: "folder_browse", path: join(home, "dev"), clientId: "h2" }, "folder_browse_result")).toMatchObject({ ok: true, parent: home, folders: [{ name: "site" }] });
  expect(await c.ask({ t: "folder_browse", path: "/", clientId: "h3" }, "folder_browse_result")).toMatchObject({ ok: false, reason: "outside" });
});

test("D204: the home's own projects are its Ducter folder's (here <data>/ducter/projects), after the used ones; the card says where that folder is", async () => {
  const { core, dir } = boot();
  fakeRunner(core);
  const a = repo(join(dir, "ducter", "projects"), "alpha", "git@github.com:a/alpha.git");
  repo(join(dir, "ducter", "projects"), "beta");
  repo(dir, "elsewhere"); // a repo outside the Ducter folder: never listed by itself
  const c = await client(core);
  expect(await c.ask({ t: "task_new", words: "x", place: { kind: "repo", device: "local", repoPath: a }, clientId: "a" }, "task_new_result")).toMatchObject({ ok: true });
  const o = await c.ask({ t: "task_new_options" }, "task_new_options");
  expect(o.places.map((p) => [p.name, p.found ?? false])).toEqual([["alpha", false], ["beta", true], ["", false]]);
  expect(o.ducterFolders).toEqual([{ device: "local", path: join(dir, "ducter") }]);
});

test("D204: an older Mac says so: the card hears it is old, and Find, Add a folder and the clone say to update it", async () => {
  const mac = { online: true, reposAsked: 0, asked: [] as string[], old: true };
  const comps = fakeMac(mac);
  const { core } = boot({ newTaskComputers: { ...comps, folderInfo: async () => { throw Object.assign(new Error("Macbook Pro M3 runs an older Ducter that can't read its folders for this home yet; update it first."), { old: true }); } } });
  const c = await client(core);
  const o = await c.ask({ t: "task_new_options" }, "task_new_options");
  expect(o.ducterFolders).toEqual([{ device: "local", path: expect.stringContaining("ducter") }, { device: "wmac", old: true }]);
  expect(await c.ask({ t: "folder_browse", device: "wmac", clientId: "b" }, "folder_browse_result")).toMatchObject({ ok: false, reason: "old" });
  expect(await c.ask({ t: "project_add", path: "/Users/weyl/x", device: "wmac", clientId: "p" }, "project_add_result")).toMatchObject({ ok: false, reason: "old" });
  expect(await c.ask({ t: "project_clone", address: "wey-gu/ducter", device: "wmac", clientId: "k" }, "project_clone_result")).toMatchObject({ ok: false, reason: "old", device: "wmac" });
});

test("D204: Add from a Git address on the Mac, from the phone: cloned there, added there, the card's place; failures say why; away says so", async () => {
  const mac = { online: true, reposAsked: 0, asked: [] as string[], cloned: [] as string[] };
  const { core } = boot({ newTaskComputers: fakeMac(mac) });
  const c = await client(core);
  const r = await c.ask({ t: "project_clone", address: "nowledge-co/con", device: "wmac", clientId: "k1" }, "project_clone_result");
  expect(r).toMatchObject({ ok: true, clientId: "k1", device: "wmac", place: { name: "con", added: true, place: { kind: "repo", device: "wmac", repoPath: "/Users/weyl/ducter/projects/con" }, defaultBranch: "main" } });
  expect(mac.cloned).toEqual(["nowledge-co/con"]);
  // A resend with the same id (the phone's socket came back) waits for the same clone.
  expect(await c.ask({ t: "project_clone", address: "nowledge-co/con", device: "wmac", clientId: "k1" }, "project_clone_result")).toMatchObject({ ok: true });
  expect(mac.cloned).toHaveLength(1);
  expect(await c.ask({ t: "project_clone", address: "acme/private", device: "wmac", clientId: "k2" }, "project_clone_result")).toMatchObject({ ok: false, reason: "no_access" });
  mac.online = false;
  expect(await c.ask({ t: "project_clone", address: "a/b", device: "wmac", clientId: "k3" }, "project_clone_result")).toMatchObject({ ok: false, reason: "offline" });
});

test("D204: Add from a Git address on the home itself: the home clones (its own git), refuses a bad address before git", async () => {
  const asked: string[] = [];
  const t = tempDir();
  stops.push(t.cleanup);
  const target = repo(join(t.dir, "ducter", "projects"), "tinycart", "https://github.com/acme/tinycart.git");
  const { core } = boot({
    cloneHome: async (address) => {
      asked.push(address);
      return address === "acme/tinycart" ? { ok: true, path: target, name: "tinycart", remote: "github.com/acme/tinycart", defaultBranch: "main" } : { ok: false, reason: "invalid", message: "That doesn't look like a Git address." };
    },
  });
  const c = await client(core);
  const r = await c.ask({ t: "project_clone", address: "acme/tinycart", clientId: "h1" }, "project_clone_result");
  expect(r).toMatchObject({ ok: true, place: { name: "tinycart", added: true, place: { kind: "repo", device: "local", repoPath: target } } });
  expect(r.device).toBeUndefined();
  expect(await c.ask({ t: "project_clone", address: "file:///etc", clientId: "h2" }, "project_clone_result")).toMatchObject({ ok: false, reason: "invalid" });
});
