// D203, D204: a worker says which projects its Ducter folder has (the home lists them on New task,
// and finds this computer's copy of a repo by its origin), clones a Git address into it, and lists
// a folder's subfolders for 找一个文件夹… / Find a folder…, confined to its home folder. Against a
// real scratch disk (links included); git is faked for the clone (no network in tests).
import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorkerHost } from "../src/index.ts";
import { listFolders, originOf } from "@ducter/protocol/src/repos.ts";
import type { GitSpawn } from "@ducter/protocol/src/clone.ts";

let dir = "";
let home = "";
beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "ducter-repos-")));
  home = join(dir, "home");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** A checkout as git leaves it on disk: .git/HEAD, config, refs (no git process is run). */
function repo(path: string, o: { origin?: string; head: string; originHead?: string; heads?: string[]; packed?: string[]; at: number }) {
  const git = join(path, ".git");
  mkdirSync(join(git, "refs", "heads"), { recursive: true });
  writeFileSync(join(git, "HEAD"), `ref: refs/heads/${o.head}\n`);
  writeFileSync(join(git, "config"), `[core]\n\tbare = false\n${o.origin ? `[remote "origin"]\n\turl = ${o.origin}\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n` : ""}`);
  for (const h of o.heads ?? []) writeFileSync(join(git, "refs", "heads", h), "0".repeat(40) + "\n");
  if (o.packed) writeFileSync(join(git, "packed-refs"), o.packed.map((b) => `${"1".repeat(40)} refs/heads/${b}`).join("\n") + "\n");
  if (o.originHead) {
    mkdirSync(join(git, "refs", "remotes", "origin"), { recursive: true });
    writeFileSync(join(git, "refs", "remotes", "origin", "HEAD"), `ref: refs/remotes/origin/${o.originHead}\n`);
  }
  const t = new Date(o.at);
  utimesSync(join(git, "HEAD"), t, t);
}

const host = (o: { gitSpawn?: GitSpawn } = {}) => {
  const sent: any[] = [];
  // The worker's data folder is the default one (~/.ducter), so its Ducter folder is ~/ducter.
  const h = createWorkerHost({ dataDir: join(home, ".ducter"), harness: {} as never, mainBase: "http://main", deviceToken: "dvc", send: (f) => sent.push(f), home, ...o });
  const ask = async (id: number, op: string, args: object = {}) => {
    await h.handle({ t: "req", id, op, args });
    return sent.find((f) => f.id === id);
  };
  return ask;
};

test("D204: repos: the projects in this computer's Ducter folder only, most recently touched first, each with its origin and default branch, read from its files", async () => {
  const projects = join(home, "ducter", "projects");
  repo(join(projects, "ducter"), { origin: "git@github.com:wey-gu/ducter.git", head: "worktree-x", originHead: "main", heads: ["main", "worktree-x"], at: 3_000_000 });
  repo(join(projects, "notes"), { head: "master", packed: ["master"], at: 2_000_000 });
  repo(join(projects, "hawdb"), { origin: "https://github.com/Acme/HawDB", head: "trunk", heads: ["trunk"], at: 1_000_000 });
  mkdirSync(join(projects, "plain"), { recursive: true }); // not a repo: not a project here
  // Repos where people often keep code are never looked at (no guessing, D204).
  repo(join(home, "dev", "elsewhere"), { head: "main", heads: ["main"], at: 9_000_000 });
  repo(join(home, "code", "group", "x"), { head: "main", heads: ["main"], at: 9_000_000 });
  const ask = host();
  const r = await ask(1, "repos");
  expect(r.ok).toBe(true);
  expect(r.result).toEqual({
    folder: join(home, "ducter"),
    repos: [
      { name: "ducter", path: join(projects, "ducter"), touchedAt: new Date(3_000_000).toISOString(), remote: "github.com/wey-gu/ducter", defaultBranch: "main" },
      { name: "notes", path: join(projects, "notes"), touchedAt: new Date(2_000_000).toISOString(), defaultBranch: "master" },
      { name: "hawdb", path: join(projects, "hawdb"), touchedAt: new Date(1_000_000).toISOString(), remote: "github.com/acme/hawdb", defaultBranch: "trunk" },
    ],
  });
});

test("D204: repos makes nothing: with no Ducter folder yet, none and the folder it would be", async () => {
  const r = await host()(1, "repos");
  expect(r.result).toEqual({ folder: join(home, "ducter"), repos: [] });
  expect(existsSync(join(home, "ducter"))).toBe(false);
});

test("D204: repos: a ~/ducter that is someone else's (a clone of the ducter repo) is left alone; the fallback is used and said", async () => {
  repo(join(home, "ducter"), { head: "main", heads: ["main"], at: 1 }); // their checkout, no marker
  writeFileSync(join(home, "ducter", "README.md"), "theirs\n");
  repo(join(home, "ducter-work", "projects", "api"), { head: "main", heads: ["main"], at: 5 });
  writeFileSync(join(home, "ducter-work", ".ducter-folder"), "x\n");
  const r = await host()(1, "repos");
  expect(r.result.folder).toBe(join(home, "ducter-work"));
  expect(r.result.repos.map((x: any) => x.name)).toEqual(["api"]);
});

test("D204: clone: git gets only the checked address after --, never a prompt, https and ssh only; the project lands in ~/ducter/projects", async () => {
  const calls: { args: string[]; env: Record<string, string> }[] = [];
  const spawn: GitSpawn = async (args, o) => {
    calls.push({ args, env: o.env });
    repo(args[args.length - 1]!, { origin: args[2]!, head: "main", heads: ["main"], at: 1 });
    return { code: 0, err: "" };
  };
  const ask = host({ gitSpawn: spawn });
  const r = await ask(1, "clone", { address: "wey-gu/ducter" });
  const target = join(home, "ducter", "projects", "ducter");
  expect(r.result).toEqual({ ok: true, path: target, name: "ducter", remote: "github.com/wey-gu/ducter", defaultBranch: "main" });
  expect(calls[0]!.args).toEqual(["clone", "--", "https://github.com/wey-gu/ducter.git", target]);
  expect(calls[0]!.env).toMatchObject({ GIT_TERMINAL_PROMPT: "0", GIT_ALLOW_PROTOCOL: "https:ssh" });
  expect(existsSync(join(home, "ducter", ".ducter-folder"))).toBe(true); // the folder is marked as Ducter's
  // The same origin again (in any spelling): that project, not a second clone.
  const again = await ask(2, "clone", { address: "git@github.com:Wey-Gu/ducter.git" });
  expect(again.result).toMatchObject({ ok: true, path: target, existed: true });
  expect(calls).toHaveLength(1);
  // Another repo with the same name: -2.
  const other = await ask(3, "clone", { address: "https://gitlab.com/someone/ducter" });
  expect(other.result).toMatchObject({ ok: true, path: join(home, "ducter", "projects", "ducter-2"), remote: "gitlab.com/someone/ducter" });
  // A refused address never reaches git.
  const bad = await ask(4, "clone", { address: "ext::sh -c touch% /tmp/pwned" });
  expect(bad.result).toMatchObject({ ok: false, reason: "invalid" });
  expect(calls).toHaveLength(2);
});

test("D204: clone failures are sorted into words the clients say, and leave nothing behind", async () => {
  const errs: Record<string, { code: number; err: string; timedOut?: boolean }> = {
    "a/missing": { code: 128, err: "remote: Repository not found.\nfatal: repository 'https://github.com/a/missing.git/' not found\n" },
    "a/private": { code: 128, err: "fatal: could not read Username for 'https://github.com': terminal prompts disabled\n" },
    "a/offline": { code: 128, err: "fatal: unable to access 'https://github.com/a/offline.git/': Could not resolve host: github.com\n" },
    "a/slow": { code: 143, err: "", timedOut: true },
    "a/odd": { code: 128, err: "fatal: something else entirely\n" },
  };
  const spawn: GitSpawn = async (args) => {
    const target = args[args.length - 1]!;
    mkdirSync(join(target, ".git"), { recursive: true }); // a half-made clone
    const key = Object.keys(errs).find((k) => args[2]!.includes(k.split("/")[1]!))!;
    return errs[key]!;
  };
  const ask = host({ gitSpawn: spawn });
  const want = { "a/missing": "not_found", "a/private": "no_access", "a/offline": "network", "a/slow": "timeout", "a/odd": "failed" } as const;
  let id = 10;
  for (const [address, reason] of Object.entries(want)) {
    const r = await ask(id++, "clone", { address });
    expect(r.result).toMatchObject({ ok: false, reason });
    expect(existsSync(join(home, "ducter", "projects", address.split("/")[1]!))).toBe(false);
  }
  expect((await ask(id++, "clone", { address: "a/odd" })).result.message).toBe("something else entirely");
});

test("D203: originOf reads only the origin's url", () => {
  expect(originOf('[remote "upstream"]\n\turl = git@github.com:a/up.git\n[remote "origin"]\n\turl = ssh://git@github.com:22/Wey-Gu/Ducter.git\n')).toBe("github.com/wey-gu/ducter");
  expect(originOf("[core]\n\tbare = false\n")).toBeUndefined();
  expect(originOf(undefined)).toBeUndefined();
});

test("D203: browse lists a folder's subfolders under home, repos first, never files, hidden ones or a way out", async () => {
  repo(join(home, "dev", "ducter"), { origin: "git@github.com:wey-gu/ducter.git", head: "main", heads: ["main"], at: 1 });
  mkdirSync(join(home, "dev", "Archive"), { recursive: true });
  mkdirSync(join(home, "dev", "zeta"), { recursive: true });
  mkdirSync(join(home, "Documents"), { recursive: true });
  mkdirSync(join(home, ".ssh"), { recursive: true });
  writeFileSync(join(home, "secret.txt"), "no");
  writeFileSync(join(home, "dev", "notes.md"), "no");
  mkdirSync(join(dir, "outside", "etc"), { recursive: true });
  symlinkSync(join(dir, "outside"), join(home, "escape")); // a link that leads out of home
  symlinkSync(join(home, "Documents"), join(home, "docs-link")); // a link that stays inside
  symlinkSync(join(home, "secret.txt"), join(home, "file-link")); // a link to a file
  const ask = host();
  const top = (await ask(1, "browse")).result;
  expect(top).toEqual({
    ok: true,
    path: home,
    home,
    folders: [
      { name: "dev", path: join(home, "dev") },
      { name: "docs-link", path: join(home, "Documents") },
      { name: "Documents", path: join(home, "Documents") },
    ],
  });
  const devs = (await ask(2, "browse", { path: join(home, "dev") })).result;
  expect(devs).toEqual({
    ok: true,
    path: join(home, "dev"),
    home,
    parent: home,
    folders: [
      { name: "ducter", path: join(home, "dev", "ducter"), repo: true },
      { name: "Archive", path: join(home, "dev", "Archive") },
      { name: "zeta", path: join(home, "dev", "zeta") },
    ],
  });
  expect((await ask(3, "browse", { path: "~/dev" })).result.path).toBe(join(home, "dev"));
  // Refused: outside home, through a link, by .., or not there.
  expect((await ask(4, "browse", { path: dir })).result).toMatchObject({ ok: false, reason: "outside" });
  expect((await ask(5, "browse", { path: join(home, "escape") })).result).toMatchObject({ ok: false, reason: "outside" });
  expect((await ask(6, "browse", { path: join(home, "escape", "etc") })).result).toMatchObject({ ok: false, reason: "outside" });
  expect((await ask(7, "browse", { path: join(home, "dev", "..", "..") })).result).toMatchObject({ ok: false, reason: "outside" });
  expect((await ask(8, "browse", { path: "/" })).result).toMatchObject({ ok: false, reason: "outside" });
  expect((await ask(9, "browse", { path: "dev" })).result).toMatchObject({ ok: false, reason: "outside" });
  expect((await ask(10, "browse", { path: join(home, "nope") })).result).toMatchObject({ ok: false, reason: "not_found" });
  expect((await ask(11, "browse", { path: join(home, "secret.txt") })).result).toMatchObject({ ok: false, reason: "not_found" });
  // Never a file name anywhere in an answer.
  const all = JSON.stringify([top, devs]);
  expect(all).not.toContain("secret");
  expect(all).not.toContain("notes.md");
  expect(all).not.toContain(".ssh");
});

test("D203: browse caps a listing and says there were more", () => {
  for (let i = 0; i < 12; i++) mkdirSync(join(home, `f${String(i).padStart(2, "0")}`), { recursive: true });
  const r = listFolders(home, home, undefined, 10);
  expect(r).toMatchObject({ ok: true, more: true });
  if (r.ok) expect(r.folders.length).toBe(10);
});
