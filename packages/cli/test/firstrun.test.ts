// First-run hints and the first-run screens of `ducter up`, against a fake disk and machine.
import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatBlocked, formatSummary, runDoctor, tildePath, type Host } from "../src/doctor.ts";
import { buildHints, cleanName, findRepos, readPersonaFile, writeHints, writePersonaFile, type FsLike } from "../src/firstrun.ts";
import { translator } from "../src/i18n.ts";

/** A fake disk: paths that exist, as dirs (ending in /) or files with an mtime. */
function disk(entries: Record<string, number | "dir">): FsLike & { opened: string[] } {
  const opened: string[] = [];
  const has = (p: string) => p in entries || Object.keys(entries).some((k) => k.startsWith(p + "/"));
  return {
    opened,
    readdir: (d) => [...new Set(Object.keys(entries).filter((k) => k.startsWith(d + "/")).map((k) => k.slice(d.length + 1).split("/")[0]!))],
    isDir: (p) => entries[p] === "dir" || (has(p) && !(p in entries)),
    mtime: (p) => (typeof entries[p] === "number" ? (entries[p] as number) : 0),
    real: (p) => p.toLowerCase(), // a case-insensitive disk
  };
}

const H = "/Users/friend";

describe("findRepos", () => {
  test("finds checkouts under the usual folders, newest first, names and ~ paths only", () => {
    const fs = disk({
      [`${H}/dev/hawdb/.git/HEAD`]: 3_000,
      [`${H}/dev/hawdb/.git/index`]: 9_000,
      [`${H}/dev/old/.git/HEAD`]: 1_000,
      [`${H}/code/org/api/.git/logs/HEAD`]: 5_000, // depth 2
      [`${H}/Projects/notes/README.md`]: 1, // not a repo
      [`${H}/dev/.hidden/.git/HEAD`]: 99_000, // hidden folders are skipped
      [`${H}/dev/app/node_modules/x/.git/HEAD`]: 99_000,
      [`${H}/Documents/secret/.git/HEAD`]: 99_000, // not a code folder: never looked at
    });
    const r = findRepos(H, fs);
    expect(r.count).toBe(3);
    expect(r.repos.map((x) => [x.name, x.path])).toEqual([
      ["hawdb", "~/dev/hawdb"],
      ["api", "~/code/org/api"],
      ["old", "~/dev/old"],
    ]);
  });

  test("worktrees and submodules (a .git file) don't count twice", () => {
    const fs = disk({ [`${H}/dev/a/.git/HEAD`]: 2, [`${H}/dev/a-wt/.git`]: 5 });
    expect(findRepos(H, fs).repos.map((r) => r.name)).toEqual(["a"]);
  });

  test("~/projects and ~/Projects on one disk are one folder", () => {
    const fs = disk({ [`${H}/Projects/x/.git/HEAD`]: 2, [`${H}/projects`]: "dir" });
    expect(findRepos(H, fs).count).toBe(1);
  });

  test("a consumer Mac with no code folders: no repos, and that's fine", () => {
    const h = buildHints(H, disk({}), new Date("2026-11-09T00:00:00Z"));
    expect(h).toEqual({ version: 1, generatedAt: "2026-11-09T00:00:00.000Z", repoCount: 0, repos: [] });
  });
});

describe("files in the data folder", () => {
  test("hints and the name round-trip as JSON", () => {
    const dir = mkdtempSync(join(tmpdir(), "ducter-firstrun-"));
    writeHints(dir, { version: 1, generatedAt: "x", repoCount: 1, repos: [{ name: "a", path: "~/dev/a", touchedAt: "y" }] });
    expect(JSON.parse(readFileSync(join(dir, "firstrun.json"), "utf8")).repos[0].name).toBe("a");
    expect(readPersonaFile(dir)).toBeUndefined();
    writePersonaFile(dir, { name: "小鸭", askedAt: "z" });
    expect(readPersonaFile(dir)?.name).toBe("小鸭");
  });

  test("cleanName keeps one short line", () => {
    expect(cleanName("  小鸭 \n")).toBe("小鸭");
    expect(cleanName("a\u0007b   c")).toBe("ab c");
    expect([...cleanName("名".repeat(40))].length).toBe(24);
  });

  test("tildePath", () => {
    expect(tildePath("/Users/friend/.ducter", "/Users/friend")).toBe("~/.ducter");
    expect(tildePath("/tmp/x", "/Users/friend")).toBe("/tmp/x");
  });
});

const machine = (tools: string[]): Host => ({
  which: (c) => (tools.includes(c) ? `/usr/local/bin/${c}` : null),
  run: async (cmd) => {
    const k = cmd.join(" ");
    if (k === "claude auth status") return { code: 0, stdout: JSON.stringify({ loggedIn: true }) };
    if (k === "claude --version") return { code: 0, stdout: "2.1.319" };
    if (k === "git --version") return { code: 0, stdout: "git version 2.50.1" };
    return { code: 1, stdout: "" };
  },
  port: async () => "free",
  writable: () => true,
  compiled: true,
  bunVersion: "1.4.4",
});

describe("first-run screens", () => {
  const zh = translator("zh");
  const opts = { port: 7795, dataDir: "/tmp/d" };

  test("a ready Mac gets one line, optional things dim below it", async () => {
    const r = await runDoctor(machine(["git", "claude"]), zh, opts);
    const text = formatSummary(r, zh);
    expect(text.split("\n")[0]).toBe("  ✓ 这台 Mac 准备好了：Claude Code");
    expect(text).toContain("Codex");
    expect(text).not.toContain("Bun"); // built in: nothing to say
  });

  test("a fresh Mac shows only what blocks, with its one fix", async () => {
    const r = await runDoctor(machine(["git"]), zh, opts);
    const text = formatBlocked(r, zh);
    expect(text).toContain("✗ Claude Code");
    expect(text).toContain("修复：curl -fsSL https://claude.ai/install.sh | bash");
    expect(text).not.toContain("brew install codex"); // optional fixes wait for `ducter doctor`
    expect(text).toContain("另外 3 项可选");
  });
});

describe("a Chinese name sits flush in zh copy", () => {
  test("spaces around a name drop only between two Chinese characters", () => {
    const zh = translator("zh");
    expect(zh("up.ready", { name: "小鸭" })).toBe("小鸭准备好了");
    expect(zh("up.ready", { name: "Ducter" })).toBe("Ducter 准备好了");
    expect(zh("up.where.value", { dir: "~/.ducter" })).toBe("这台 Mac · 数据在 ~/.ducter");
  });
});
