// D203: a worker says which repos it has (the home lists them on New task, and finds this
// computer's copy of a repo by its origin), and lists a folder's subfolders for 找一个文件夹… /
// Find a folder…, confined to its home folder. Against a real scratch disk (links included).
import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorkerHost } from "../src/index.ts";
import { listFolders, originOf } from "@ducter/protocol/src/repos.ts";

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

const host = () => {
  const sent: any[] = [];
  const h = createWorkerHost({ dataDir: join(dir, "w"), harness: {} as never, mainBase: "http://main", deviceToken: "dvc", send: (f) => sent.push(f), home });
  const ask = async (id: number, op: string, args: object = {}) => {
    await h.handle({ t: "req", id, op, args });
    return sent.find((f) => f.id === id);
  };
  return ask;
};

test("D203: repos: this computer's repos, most recently touched first, each with its origin and default branch, read from its files", async () => {
  repo(join(home, "dev", "ducter"), { origin: "git@github.com:wey-gu/ducter.git", head: "worktree-x", originHead: "main", heads: ["main", "worktree-x"], at: 3_000_000 });
  repo(join(home, "dev", "notes"), { head: "master", packed: ["master"], at: 2_000_000 });
  repo(join(home, "code", "group", "hawdb"), { origin: "https://github.com/Acme/HawDB", head: "trunk", heads: ["trunk"], at: 1_000_000 });
  mkdirSync(join(home, ".config", "tool", "x", ".git"), { recursive: true }); // never read: hidden
  const ask = host();
  const r = await ask(1, "repos");
  expect(r.ok).toBe(true);
  expect(r.result).toEqual([
    { name: "ducter", path: join(home, "dev", "ducter"), touchedAt: new Date(3_000_000).toISOString(), remote: "github.com/wey-gu/ducter", defaultBranch: "main" },
    { name: "notes", path: join(home, "dev", "notes"), touchedAt: new Date(2_000_000).toISOString(), defaultBranch: "master" },
    { name: "hawdb", path: join(home, "code", "group", "hawdb"), touchedAt: new Date(1_000_000).toISOString(), remote: "github.com/acme/hawdb", defaultBranch: "trunk" },
  ]);
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
