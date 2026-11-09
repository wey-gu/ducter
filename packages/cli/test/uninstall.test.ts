import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { translator } from "../src/i18n.ts";
import { agentLabel, bundleIdAround, dataDirIsOurs, executeUninstall, formatPlan, planUninstall, type Runner } from "../src/uninstall.ts";

const t = translator("en");
const git = (dir: string, ...args: string[]) => {
  const r = Bun.spawnSync(["git", "-C", dir, ...args], { stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.toString();
};

let home: string;
let dataDir: string;
let repo: string;
const label = "co.nowledge.ducter.test.agent";

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "ducter-uninstall-"));
  dataDir = join(home, ".ducter");
  mkdirSync(join(dataDir, "browser-profiles", "default"), { recursive: true });
  writeFileSync(join(dataDir, "ducter.db"), "log");
  writeFileSync(join(dataDir, "persona.json"), "{}");
  mkdirSync(join(home, "Library", "LaunchAgents"), { recursive: true });
  writeFileSync(join(home, "Library", "LaunchAgents", `${label}.plist`), "<plist/>");
  writeFileSync(join(home, "Library", "LaunchAgents", "com.other.agent.plist"), "<plist/>");
  mkdirSync(join(home, "Library", "Application Support", "Ducter", "updates"), { recursive: true }); // the real app's
  mkdirSync(join(home, "Library", "Application Support", "co.nowledge.ducter.test", "updates"), { recursive: true });
  mkdirSync(join(home, "Library", "Caches", "co.nowledge.ducter.test"), { recursive: true });
  mkdirSync(join(home, "Library", "Caches", "com.other"), { recursive: true });
  // A real repo with a task worktree on a ducter/* branch and an uncommitted change in it.
  repo = join(home, "dev", "app");
  mkdirSync(repo, { recursive: true });
  git(repo, "init", "-q", "-b", "main");
  git(repo, "-c", "user.email=t@e.st", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "init");
  mkdirSync(join(dataDir, "worktrees"), { recursive: true });
  git(repo, "worktree", "add", "-q", "-b", "ducter/fix-tests", join(dataDir, "worktrees", "t1"));
  writeFileSync(join(dataDir, "worktrees", "t1", "wip.txt"), "unsaved");
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

const plan = (all: boolean, extra: Partial<Parameters<typeof planUninstall>[0]> = {}) =>
  planUninstall({ home, dataDir, platform: "darwin", agentLabel: label, execPath: "/usr/local/bin/ducter", all, t, ...extra });

function fakeRunner(healthy = false) {
  const calls: string[][] = [];
  const r: Runner = { uid: 501, run: async (c) => (calls.push(c), { code: 0, stdout: "" }), healthy: async () => healthy };
  return { r, calls };
}

describe("planUninstall", () => {
  test("without --all: only the background item, data kept", () => {
    const p = plan(false);
    expect(p.remove.map((x) => x.kind)).toEqual(["agent"]);
    expect(p.remove[0]!.path).toBe(join(home, "Library", "LaunchAgents", `${label}.plist`));
    expect(p.keep.map((k) => k.what)).toContain(t("uninstall.keep.data"));
    expect(p.warnings).toEqual([]);
  });

  test("--all: data, worktree warning, app link, Library folders of this bundle only", () => {
    mkdirSync(join(home, ".local", "bin"), { recursive: true });
    symlinkSync(join(home, "Gone", "Ducter.app", "Contents", "Helpers", "ducter"), join(home, ".local", "bin", "ducter")); // an app since deleted
    const p = plan(true);
    const paths = p.remove.map((x) => x.path);
    expect(paths).toContain(dataDir);
    expect(paths).toContain(join(home, ".local", "bin", "ducter"));
    expect(paths).toContain(join(home, "Library", "Application Support", "co.nowledge.ducter.test"));
    expect(paths).not.toContain(join(home, "Library", "Application Support", "Ducter"));
    expect(paths).toContain(join(home, "Library", "Caches", "co.nowledge.ducter.test"));
    expect(paths.some((x) => x.includes("com.other"))).toBe(false);
    expect(p.remove.find((x) => x.kind === "data")!.bytes).toBeGreaterThan(0);
    expect(p.warnings.map((w) => w.id)).toEqual(["unsaved-worktree"]);
    expect(p.repos!.map((r) => r.replace("/private", ""))).toEqual([repo.replace("/private", "")]);
    expect(p.keep.map((k) => k.what)).toEqual(expect.arrayContaining(["Your repos", "Claude Code and Codex", "Nowledge Mem", "cua-driver", "Ducter.app"]));
    expect(formatPlan(p, t, home)).toContain("~/.ducter");
  });

  test("a link to another copy of Ducter.app that still exists is that copy's, and stays", () => {
    const other = join(home, "Other", "Ducter.app", "Contents", "Helpers");
    mkdirSync(other, { recursive: true });
    writeFileSync(join(other, "ducter"), "binary");
    mkdirSync(join(home, ".local", "bin"), { recursive: true });
    symlinkSync(join(other, "ducter"), join(home, ".local", "bin", "ducter"));
    expect(plan(true).remove.some((x) => x.kind === "link")).toBe(false);
    expect(plan(true, { execPath: join(other, "ducter") }).remove.some((x) => x.kind === "link")).toBe(true);
  });

  test("a copied ducter in ~/.local/bin is kept, with how to remove it", () => {
    mkdirSync(join(home, ".local", "bin"), { recursive: true });
    writeFileSync(join(home, ".local", "bin", "ducter"), "binary");
    const p = plan(true);
    expect(p.remove.some((x) => x.kind === "link")).toBe(false);
    expect(p.keep.some((k) => k.detail.includes("rm "))).toBe(true);
  });

  test("safety: a data dir set to $HOME or / is never removed", () => {
    for (const d of [home, "/"]) {
      const p = plan(true, { dataDir: d });
      expect(p.remove.some((x) => x.kind === "data")).toBe(false);
      expect(p.warnings.map((w) => w.id)).toContain("unsafe-data-dir");
    }
    const other = join(home, "Documents");
    mkdirSync(other);
    expect(dataDirIsOurs(other, home)).toBe(false);
    expect(dataDirIsOurs(dataDir, home)).toBe(true);
  });

  test("linux: the systemd unit", () => {
    const unit = join(home, ".config", "systemd", "user", "ducter.service");
    mkdirSync(join(unit, ".."), { recursive: true });
    writeFileSync(unit, "[Unit]");
    const p = plan(false, { platform: "linux" });
    expect(p.remove).toEqual([{ path: unit, what: t("uninstall.item.service"), kind: "service" }]);
    expect(p.keep.some((k) => k.what === "Ducter.app")).toBe(false);
  });
});

describe("executeUninstall", () => {
  test("--all removes only Ducter's paths; the repo and its branch stay; worktree pruned", async () => {
    const p = plan(true);
    const { r, calls } = fakeRunner();
    const res = await executeUninstall(p, { runner: r, port: 1, label, t });
    expect(res.failed).toEqual([]);
    expect(calls[0]).toEqual(["/bin/launchctl", "bootout", `gui/501/${label}`]);
    expect(existsSync(dataDir)).toBe(false);
    expect(existsSync(join(home, "Library", "LaunchAgents", `${label}.plist`))).toBe(false);
    expect(existsSync(join(home, "Library", "LaunchAgents", "com.other.agent.plist"))).toBe(true);
    expect(existsSync(join(home, "Library", "Caches", "com.other"))).toBe(true);
    expect(existsSync(join(repo, ".git"))).toBe(true);
    expect(git(repo, "branch", "--list", "ducter/*")).toContain("ducter/fix-tests");
    expect(git(repo, "worktree", "list")).not.toContain("t1");
  });

  test("without --all: the background item only", async () => {
    const { r } = fakeRunner();
    const res = await executeUninstall(plan(false), { runner: r, port: 1, label, t });
    expect(res.removed).toEqual([join(home, "Library", "LaunchAgents", `${label}.plist`)]);
    expect(existsSync(join(dataDir, "ducter.db"))).toBe(true);
  });

  test("a Ducter still answering stops it before any data is touched", async () => {
    const { r } = fakeRunner(true);
    const res = await executeUninstall(plan(true), { runner: r, port: 1, label, t });
    expect(res.warnings.map((w) => w.id)).toContain("running-elsewhere");
    expect(existsSync(join(dataDir, "ducter.db"))).toBe(true);
  }, 15_000);

  test("linux service: disable --now, remove, daemon-reload", async () => {
    const unit = join(home, ".config", "systemd", "user", "ducter.service");
    mkdirSync(join(unit, ".."), { recursive: true });
    writeFileSync(unit, "[Unit]");
    const { r, calls } = fakeRunner();
    await executeUninstall(plan(false, { platform: "linux" }), { runner: r, port: 1, label, t });
    expect(calls).toEqual([
      ["systemctl", "--user", "disable", "--now", "ducter.service"],
      ["systemctl", "--user", "daemon-reload"],
    ]);
    expect(existsSync(unit)).toBe(false);
  });
});

describe("agent label", () => {
  test("env, then the bundle around the helper, then the default", () => {
    const app = join(home, "X.app", "Contents");
    mkdirSync(join(app, "Helpers"), { recursive: true });
    writeFileSync(join(app, "Info.plist"), "<dict><key>CFBundleIdentifier</key>\n\t<string>co.nowledge.ducter.scratch</string></dict>");
    const exe = join(app, "Helpers", "ducter");
    expect(bundleIdAround(exe)).toBe("co.nowledge.ducter.scratch");
    expect(agentLabel({}, exe)).toBe("co.nowledge.ducter.scratch.agent");
    expect(agentLabel({ DUCTER_AGENT_LABEL: "x.agent" }, exe)).toBe("x.agent");
    expect(agentLabel({}, "/usr/local/bin/ducter")).toBe("co.nowledge.ducter.agent");
  });
});
