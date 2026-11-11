// The partner's name file and the first-run screens of `ducter up`, against a fake disk and machine.
import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatBlocked, formatSummary, runDoctor, tildePath, type Host } from "../src/doctor.ts";
import { cleanName, readPersonaFile, removeOldHints, writePersonaFile } from "../src/firstrun.ts";
import { translator } from "../src/i18n.ts";

// D204: `ducter up` no longer scans for repos (that list is the Ducter folder's projects now,
// protocol/src/repos.ts projectRepos); it removes the old hints file.
describe("no first-run repo scan", () => {
  test("`ducter up` removes a stale firstrun.json and nothing else", () => {
    const dir = mkdtempSync(join(tmpdir(), "ducter-firstrun-"));
    writeFileSync(join(dir, "firstrun.json"), JSON.stringify({ version: 1, repos: [{ name: "a", path: "~/dev/a" }] }));
    writePersonaFile(dir, { name: "小鸭" });
    removeOldHints(dir);
    removeOldHints(dir); // and again, with nothing there
    expect(existsSync(join(dir, "firstrun.json"))).toBe(false);
    expect(readPersonaFile(dir)?.name).toBe("小鸭");
  });
});

describe("files in the data folder", () => {
  test("the name round-trips as JSON", () => {
    const dir = mkdtempSync(join(tmpdir(), "ducter-firstrun-"));
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
