// D204: which folder is this computer's Ducter folder, and which Git addresses a clone accepts.
// Against a scratch home folder: never the real ~/ducter.
import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ducterFolder, ensureDucterFolder, worktreesRootOf } from "../src/ducter-folder.ts";
import { cloneReason, parseGitAddress } from "../src/clone.ts";

let home = "";
beforeEach(() => (home = realpathSync(mkdtempSync(join(tmpdir(), "ducter-folder-")))));
afterEach(() => rmSync(home, { recursive: true, force: true }));
const at = (o: { env?: Record<string, string>; dataDir?: string } = {}) => ducterFolder({ home, env: o.env ?? {}, ...(o.dataDir ? { dataDir: o.dataDir } : {}) });

test("~/ducter by default, made and marked only when used", () => {
  expect(at()).toEqual({ path: join(home, "ducter"), why: "default" });
  expect(existsSync(join(home, "ducter"))).toBe(false); // resolving makes nothing
  expect(ensureDucterFolder({ home, env: {} })).toBe(join(home, "ducter"));
  expect(readFileSync(join(home, "ducter", ".ducter-folder"), "utf8")).toContain("Ducter");
  expect(at().path).toBe(join(home, "ducter"));
});

test("a ~/ducter that is someone else's is never touched: ~/ducter-work, and it stays chosen", () => {
  // Someone's clone of the ducter repo lives at ~/ducter.
  mkdirSync(join(home, "ducter", ".git"), { recursive: true });
  writeFileSync(join(home, "ducter", "README.md"), "theirs\n");
  expect(at()).toEqual({ path: join(home, "ducter-work"), why: "fallback" });
  ensureDucterFolder({ home, env: {} });
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
  ensureDucterFolder({ home, env: {} });
  expect(worktreesRootOf(join(home, "ducter", "worktrees", "repo", "fix"), data)).toBe(join(home, "ducter", "worktrees"));
  expect(worktreesRootOf(join(home, "ducter", "projects", "repo"), data)).toBeUndefined(); // projects are never worktrees
  expect(worktreesRootOf(join(home, "ducter", "worktrees", "..", "..", "x"), data)).toBeUndefined();
  expect(worktreesRootOf(join(data, "worktrees-x", "a"), data)).toBeUndefined();
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
