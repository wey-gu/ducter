// D204: which folder is this computer's Ducter folder, and which Git addresses a clone accepts.
// Against a scratch home folder: never the real ~/ducter.
import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ducterFolder, ensureDucterFolder, readChosenFolder, worktreesRootOf } from "../src/ducter-folder.ts";
import { moveDucterFolder } from "../src/folder-move.ts";
import { cloneReason, parseGitAddress } from "../src/clone.ts";

let home = "";
beforeEach(() => (home = realpathSync(mkdtempSync(join(tmpdir(), "ducter-folder-")))));
afterEach(() => rmSync(home, { recursive: true, force: true }));
const at = (o: { env?: Record<string, string>; dataDir?: string; platform?: string } = {}) =>
  ducterFolder({ home, env: o.env ?? {}, platform: o.platform ?? "linux", ...(o.dataDir ? { dataDir: o.dataDir } : {}) });

test("~/ducter by default, made and marked only when used", () => {
  expect(at()).toEqual({ path: join(home, "ducter"), why: "default" });
  expect(existsSync(join(home, "ducter"))).toBe(false); // resolving makes nothing
  expect(ensureDucterFolder({ home, env: {}, platform: "linux" })).toBe(join(home, "ducter"));
  expect(readFileSync(join(home, "ducter", ".ducter-folder"), "utf8")).toContain("Ducter");
  expect(at().path).toBe(join(home, "ducter"));
});

test("a ~/ducter that is someone else's is never touched: ~/ducter-work, and it stays chosen", () => {
  // Someone's clone of the ducter repo lives at ~/ducter.
  mkdirSync(join(home, "ducter", ".git"), { recursive: true });
  writeFileSync(join(home, "ducter", "README.md"), "theirs\n");
  expect(at()).toEqual({ path: join(home, "ducter-work"), why: "fallback" });
  ensureDucterFolder({ home, env: {}, platform: "linux" });
  expect(existsSync(join(home, "ducter", ".ducter-folder"))).toBe(false);
  // Even if their ~/ducter goes later, Ducter keeps the folder it marked.
  rmSync(join(home, "ducter"), { recursive: true });
  expect(at().path).toBe(join(home, "ducter-work"));
  // ~/ducter-work taken too (and unmarked): the next one.
  rmSync(join(home, "ducter-work"), { recursive: true });
  mkdirSync(join(home, "ducter"), { recursive: true });
  writeFileSync(join(home, "ducter", "notes.txt"), "x");
  mkdirSync(join(home, "ducter-work"), { recursive: true });
  writeFileSync(join(home, "ducter-work", "x"), "x");
  expect(at().path).toBe(join(home, "ducter-work-2"));
});

test("an empty ~/ducter, or one holding only projects/ and worktrees/, is taken as Ducter's", () => {
  mkdirSync(join(home, "ducter"));
  expect(at().path).toBe(join(home, "ducter"));
  mkdirSync(join(home, "ducter", "projects", "api"), { recursive: true });
  mkdirSync(join(home, "ducter", "worktrees"), { recursive: true });
  expect(at()).toEqual({ path: join(home, "ducter"), why: "default" });
});

test("DUCTER_FOLDER wins; a Ducter with a data folder of its own keeps its folder inside it", () => {
  expect(at({ env: { DUCTER_FOLDER: "~/Code/ducter-stuff" } })).toEqual({ path: join(home, "Code", "ducter-stuff"), why: "env" });
  expect(at({ env: { DUCTER_FOLDER: "/srv/ducter" } }).path).toBe("/srv/ducter");
  expect(at({ dataDir: join(home, "scratch-data") })).toEqual({ path: join(home, "scratch-data", "ducter"), why: "data" });
  expect(at({ dataDir: join(home, ".ducter") }).path).toBe(join(home, "ducter"));
});

test("worktreesRootOf: Ducter's worktrees in both places, never a look-alike", () => {
  const data = join(home, ".ducter");
  expect(worktreesRootOf(join(data, "worktrees", "repo", "fix"), data)).toBe(join(data, "worktrees"));
  expect(worktreesRootOf(join(data, "worktrees", "t_123"), data)).toBe(join(data, "worktrees"));
  expect(worktreesRootOf(join(home, "ducter", "worktrees", "repo", "fix"), data)).toBeUndefined(); // not marked yet
  ensureDucterFolder({ home, env: {}, platform: "linux" });
  expect(worktreesRootOf(join(home, "ducter", "worktrees", "repo", "fix"), data)).toBe(join(home, "ducter", "worktrees"));
  expect(worktreesRootOf(join(home, "ducter", "projects", "repo"), data)).toBeUndefined(); // projects are never worktrees
  expect(worktreesRootOf(join(home, "ducter", "worktrees", "..", "..", "x"), data)).toBeUndefined();
  expect(worktreesRootOf(join(data, "worktrees-x", "a"), data)).toBeUndefined();
});

test("macOS's own convention: a new folder is ~/Ducter; Linux keeps ~/ducter", () => {
  expect(at({ platform: "darwin" })).toEqual({ path: join(home, "Ducter"), why: "default" });
  expect(at({ platform: "linux" })).toEqual({ path: join(home, "ducter"), why: "default" });
  expect(at({ platform: "freebsd" })).toEqual({ path: join(home, "ducter"), why: "default" });
  // A new Mac never makes the lowercase folder; the first fallback is uppercase too.
  mkdirSync(join(home, "Ducter"), { recursive: true });
  writeFileSync(join(home, "Ducter", "someone.txt"), "x");
  expect(at({ platform: "darwin" })).toEqual({ path: join(home, "Ducter-work"), why: "fallback" });
});

test("macOS still finds a marked ~/ducter, so a folder from before the naming keeps working", () => {
  mkdirSync(join(home, "ducter", "projects", "api"), { recursive: true });
  writeFileSync(join(home, "ducter", ".ducter-folder"), "x\n");
  const found = at({ platform: "darwin" });
  expect(found.path.toLowerCase()).toBe(join(home, "ducter").toLowerCase());
  expect(found.path === join(home, "Ducter") || found.path === join(home, "ducter")).toBe(true);
});

test("a marked legacy folder wins over a free new name", () => {
  // Case-sensitive macOS (or a folder named in the old spelling): the marked one is Ducter's.
  mkdirSync(join(home, "ducter", "projects", "api"), { recursive: true });
  writeFileSync(join(home, "ducter", ".ducter-folder"), "x\n");
  mkdirSync(join(home, "Ducter"), { recursive: true });
  expect(at({ platform: "darwin" }).path.toLowerCase()).toBe(join(home, "ducter").toLowerCase());
});

test("the path the person chose wins over the system name, and the env still wins over it", () => {
  const chosen = join(home, "Code", "Ducter");
  expect(ducterFolder({ home, env: {}, platform: "linux", chosen })).toEqual({ path: chosen, why: "chosen" });
  expect(ducterFolder({ home, env: { DUCTER_FOLDER: join(home, "Env") }, platform: "linux", chosen })).toEqual({ path: join(home, "Env"), why: "env" });
  // Kept in the data folder's folder.json (written by the move), read without any other argument.
  const dataDir = join(home, ".ducter");
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(join(dataDir, "folder.json"), JSON.stringify({ path: chosen }));
  expect(readChosenFolder(dataDir)).toBe(chosen);
  expect(ducterFolder({ home, env: {}, platform: "linux", dataDir })).toEqual({ path: chosen, why: "chosen" });
});

test("a case-only rename moves the folder's contents in two steps (APFS: ~/ducter is ~/Ducter)", async () => {
  const from = join(home, "ducter");
  mkdirSync(join(from, "projects", "api"), { recursive: true });
  mkdirSync(join(from, "worktrees", "api", "fix"), { recursive: true });
  writeFileSync(join(from, ".ducter-folder"), "x\n");
  writeFileSync(join(from, "projects", "api", "README.md"), "api\n");
  const r = await moveDucterFolder({
    from,
    to: join(home, "Ducter"),
    home,
    spawn: async () => ({ code: 0, err: "" }),
  });
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.path).toBe(join(home, "Ducter"));
  expect(r.moved).toBe(true);
  expect(r.projects).toBe(1);
  expect(r.worktrees).toBe(1);
  expect(existsSync(join(home, "Ducter", "projects", "api", "README.md"))).toBe(true);
  expect(existsSync(join(home, "Ducter", ".ducter-folder"))).toBe(true);
  expect(existsSync(join(home, "Ducter", "worktrees", "api", "fix"))).toBe(true);
});

test("worktree repair is asked for every repo under projects/ and every working copy", async () => {
  const from = join(home, "ducter");
  mkdirSync(join(from, "projects", "api", ".git"), { recursive: true });
  mkdirSync(join(from, "projects", "plain"), { recursive: true });
  mkdirSync(join(from, "worktrees", "api", "fix"), { recursive: true });
  writeFileSync(join(from, "worktrees", "api", "fix", ".git"), `gitdir: ${join(from, "projects", "api", ".git", "worktrees", "fix")}\n`);
  const calls: string[][] = [];
  const r = await moveDucterFolder({
    from,
    to: join(home, "Code", "Ducter"),
    home,
    spawn: async (args) => {
      calls.push(args);
      return { code: 0, err: "" };
    },
  });
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  const newRepo = join(home, "Code", "Ducter", "projects", "api");
  const newWt = join(home, "Code", "Ducter", "worktrees", "api", "fix");
  expect(calls).toContainEqual(["-C", newRepo, "worktree", "repair", newWt]);
  expect(calls).toContainEqual(["-C", newWt, "worktree", "repair"]);
  expect(r.repaired).toBe(2);
});

test("a real move repairs both sides: .git/worktrees/<name>/gitdir and the worktree's .git file", async () => {
  const from = join(home, "ducter");
  const oldRepo = join(from, "projects", "api");
  const oldWt = join(from, "worktrees", "api", "fix");
  mkdirSync(oldRepo, { recursive: true });
  const git = (cwd: string, ...args: string[]) => {
    const r = Bun.spawnSync(["git", "-C", cwd, ...args], { stdout: "pipe", stderr: "pipe" });
    if (r.exitCode !== 0) throw new Error(r.stderr.toString());
    return r.stdout.toString();
  };
  git(oldRepo, "init", "-q", "-b", "main");
  git(oldRepo, "config", "user.name", "t");
  git(oldRepo, "config", "user.email", "t@t");
  writeFileSync(join(oldRepo, "a.txt"), "a\n");
  git(oldRepo, "add", ".");
  git(oldRepo, "commit", "-qm", "init");
  mkdirSync(join(from, "worktrees", "api"), { recursive: true });
  git(oldRepo, "worktree", "add", "-q", oldWt, "-b", "ducter/fix");
  const to = join(home, "Code", "Ducter");
  const r = await moveDucterFolder({ from, to, home });
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  const newRepo = realpathSync.native(join(to, "projects", "api"));
  const newWt = realpathSync.native(join(to, "worktrees", "api", "fix"));
  const admin = readFileSync(join(newRepo, ".git", "worktrees", "fix", "gitdir"), "utf8").trim();
  const side = readFileSync(join(newWt, ".git"), "utf8").trim();
  expect(admin).toBe(join(newWt, ".git"));
  expect(side).toBe(`gitdir: ${join(newRepo, ".git", "worktrees", "fix")}`);
  expect(Bun.spawnSync(["git", "-C", newWt, "status", "--short"]).exitCode).toBe(0);
});

test("another disk is refused, never copied silently", async () => {
  const from = join(home, "ducter");
  mkdirSync(join(from, "projects", "api"), { recursive: true });
  writeFileSync(join(from, "projects", "api", "a.txt"), "a\n");
  const r = await moveDucterFolder({
    from,
    to: join(home, "Other", "Ducter"),
    home,
    rename: () => {
      const err = new Error("cross-device link") as NodeJS.ErrnoException;
      err.code = "EXDEV";
      throw err;
    },
  });
  expect(r).toMatchObject({ ok: false, reason: "cross_device" });
  expect(existsSync(join(from, "projects", "api", "a.txt"))).toBe(true);
  expect(existsSync(join(home, "Other", "Ducter"))).toBe(false);
});

test("a move never merges into a folder that holds things, nor goes inside itself or Ducter's data", async () => {
  const from = join(home, "ducter");
  mkdirSync(join(from, "projects"), { recursive: true });
  const taken = join(home, "Documents");
  mkdirSync(taken, { recursive: true });
  writeFileSync(join(taken, "theirs.txt"), "x");
  expect(await moveDucterFolder({ from, to: taken, home })).toMatchObject({ ok: false, reason: "exists" });
  expect(await moveDucterFolder({ from, to: join(from, "inner"), home })).toMatchObject({ ok: false, reason: "inside" });
  expect(await moveDucterFolder({ from, to: join(home, ".ducter"), home, dataDir: join(home, ".ducter") })).toMatchObject({ ok: false, reason: "data" });
});

test("parseGitAddress accepts https, ssh://, scp-like and GitHub owner/repo", () => {
  const ok = (s: string) => {
    const r = parseGitAddress(s);
    if (!r.ok) throw new Error(`refused ${s}`);
    return [r.url, r.name, r.remote];
  };
  expect(ok("https://github.com/wey-gu/ducter")).toEqual(["https://github.com/wey-gu/ducter", "ducter", "github.com/wey-gu/ducter"]);
  expect(ok("https://github.com/wey-gu/ducter.git/")).toEqual(["https://github.com/wey-gu/ducter.git", "ducter", "github.com/wey-gu/ducter"]);
  expect(ok("https://git.example.com:8443/group/sub/app.git")).toEqual(["https://git.example.com:8443/group/sub/app.git", "app", "git.example.com/group/sub/app"]);
  expect(ok("git@github.com:wey-gu/ducter.git")).toEqual(["git@github.com:wey-gu/ducter.git", "ducter", "github.com/wey-gu/ducter"]);
  expect(ok("ssh://git@github.com:22/wey-gu/ducter.git")).toEqual(["ssh://git@github.com:22/wey-gu/ducter.git", "ducter", "github.com/wey-gu/ducter"]);
  expect(ok("ssh://gitlab.com/a/b")[1]).toBe("b");
  expect(ok("wey-gu/ducter")).toEqual(["https://github.com/wey-gu/ducter.git", "ducter", "github.com/wey-gu/ducter"]);
  expect(ok("  nowledge-co/con.git ")).toEqual(["https://github.com/nowledge-co/con.git", "con", "github.com/nowledge-co/con"]);
  expect(ok("github.com/wey-gu/ducter")).toEqual(["https://github.com/wey-gu/ducter", "ducter", "github.com/wey-gu/ducter"]);
});

test("parseGitAddress refuses options, other transports, local paths, credentials, spaces and newlines", () => {
  for (const s of [
    "",
    "-uhttps://github.com/a/b",
    "--upload-pack=touch /tmp/x",
    "ext::sh -c touch% /tmp/pwned",
    "ext::sh",
    "file:///etc/passwd",
    "file://localhost/tmp/repo",
    "/tmp/repo",
    "./repo",
    "../repo",
    "~/dev/repo",
    "C:\\repo",
    "http://github.com/a/b", // plain http: no
    "git://github.com/a/b",
    "https://user:token@github.com/a/b",
    "https://token@github.com/a/b",
    "https://github.com/a/b c",
    "https://github.com/a/b\n--upload-pack=x",
    "https://github.com/a/../../b",
    "https://github.com/onlyowner",
    "github.com:a/b", // scp-like needs a user, or it is a local path to git
    "git@github.com:/abs/path",
    "git@github.com:-u/x",
    "a/b/c",
    "a",
    "https://-evil.com/a/b",
    "https://github.com/a/.hidden",
    "x".repeat(400) + "/y",
    { address: "a/b" },
  ]) expect(parseGitAddress(s).ok).toBe(false);
});

test("cloneReason sorts git's words", () => {
  expect(cloneReason("ERROR: Repository not found.\nfatal: Could not read from remote repository.")).toBe("not_found");
  expect(cloneReason("git@github.com: Permission denied (publickey).\nfatal: Could not read from remote repository.")).toBe("no_access");
  expect(cloneReason("Host key verification failed.")).toBe("no_access");
  expect(cloneReason("fatal: unable to access 'https://x/': Failed to connect to x port 443")).toBe("network");
  expect(cloneReason("ssh: Could not resolve hostname gitlab.example: nodename nor servname provided")).toBe("network");
  expect(cloneReason("fatal: destination path exists")).toBe("failed");
});
