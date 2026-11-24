// D507: 新任务默认 / New tasks start. The author's report (2026-11-24): a GitHub to-do handed over
// from the conversation went to the MacBook (the clone there builds first, D395) on Claude Code (the
// default's smartest). With New tasks start set to hel and Codex, every later task goes there when
// it can, and hard facts (the person's Chrome, a Mac app, a rule for a kind of work, a pin) still win.
import { describe, expect, test } from "bun:test";
import type { DeviceHarness, RuleView } from "@ducter/protocol";
import type { ClonesAnswer } from "@ducter/protocol/src/clones.ts";
import { chooseBody, kindDefaults, NEW_TASKS, type BodyPick, type Computer } from "../src/candidates.ts";
import { createRepoWhere, type WhereComputer } from "../src/repo-where.ts";
import { cleanNewTasks } from "../src/settings.ts";
import { startCore } from "../src/core.ts";
import { tempDir } from "./helpers.ts";

const h = (harness: string, o: Partial<DeviceHarness> = {}): DeviceHarness => ({ harness, installed: true, loggedIn: true, canBePartner: true, ...o });
const base = { brain: { harness: "claude-code" as const }, taskAccounts: {} };
const comps = (mac: Computer["state"] = "awake"): Computer[] => [
  { id: "local", name: "hel", home: true, state: "awake", alwaysOn: true, mac: false, harnesses: [h("claude-code"), h("codex")], web: { on: true, where: "ducter" }, sites: [] },
  { id: "dev_mac", name: "MacBook", home: false, state: mac, alwaysOn: false, mac: true, harnesses: [h("claude-code"), h("codex")], web: { on: true, where: "chrome" } },
];
const choose = (settings: object, extra: Partial<Parameters<typeof chooseBody>[0]> = {}) => chooseBody({ work: { title: "fix the flaky test", kind: "code" }, computers: comps(), settings: settings as never, rules: [], ...extra }) as BodyPick;

describe("the ranking (candidates)", () => {
  test("nothing set: Ducter's own pick, as before (Claude Code, the smartest)", () => {
    const p = choose(base);
    expect(p.harness).toBe("claude-code");
    expect(p.why.kind).toBe("default");
  });

  test("hel and Codex: the task goes to hel on Codex, and says both are the person's default", () => {
    const p = choose({ ...base, newTasks: { where: "local", agent: "codex" } });
    expect(p).toMatchObject({ device: "local", harness: "codex" });
    expect(p.why).toMatchObject({ kind: "rule", ruleId: NEW_TASKS, text: "Codex" });
    expect(p.why.where).toMatchObject({ device: "hel", kind: "you", ruleId: NEW_TASKS });
  });

  test("only where: the MacBook default, the agent as usual there", () => {
    const p = choose({ ...base, newTasks: { where: "dev_mac" } });
    expect(p).toMatchObject({ device: "MacBook", harness: "claude-code" });
    expect(p.why.where).toMatchObject({ kind: "you", ruleId: NEW_TASKS });
  });

  test("a hard fact wins: a page that needs the person's sign-in goes to the Mac's Chrome", () => {
    const p = choose({ ...base, newTasks: { where: "local" } }, { work: { title: "看看淘宝订单", kind: "errand" }, needs: { browse: true, signedIn: true, site: "taobao.com" } });
    expect(p).toMatchObject({ device: "MacBook", uses: "chrome" });
  });

  test("the preferred computer asleep: one that is awake takes it (if it's awake)", () => {
    const p = chooseBody({ work: { title: "x", kind: "code" }, computers: comps("asleep"), settings: { ...base, newTasks: { where: "dev_mac" } } as never, rules: [] }) as BodyPick;
    expect(p).toMatchObject({ device: "local" });
    expect(p.waits).toBeUndefined();
  });

  test("a rule for a kind of work and a pin in the moment come first", () => {
    const rule: RuleView = { id: "rule_1", text: "后端的事 → Claude Code", harness: "claude-code", match: ["后端"], createdAt: "2026-11-24T00:00:00Z" };
    const byRule = choose({ ...base, newTasks: { agent: "codex" } }, { work: { title: "后端 API 加个字段" }, rules: [rule] });
    expect(byRule.harness).toBe("claude-code");
    expect(byRule.why).toMatchObject({ kind: "rule", ruleId: "rule_1" });
    const pinned = choose({ ...base, newTasks: { agent: "codex" } }, { pinned: { harness: "claude-code" }, pinnedBy: "you" });
    expect(pinned.harness).toBe("claude-code");
    expect(pinned.why.kind).toBe("you");
  });

  test("the agent isn't on the computer the task must use: the move is said, never silent", () => {
    const only: Computer[] = [{ id: "local", name: "hel", home: true, state: "awake", alwaysOn: true, mac: false, harnesses: [h("claude-code")] }];
    const p = chooseBody({ work: { title: "x" }, computers: only, settings: { ...base, newTasks: { agent: "codex" } } as never, rules: [] }) as BodyPick;
    expect(p.harness).toBe("claude-code");
    expect(p.why).toMatchObject({ kind: "unavailable", from: "codex", ruleId: NEW_TASKS });
  });

  test("the Partner page's built-in defaults stay Ducter's own (the default is shown apart)", () => {
    const d = kindDefaults({ computers: comps().slice(0, 1), settings: { ...base, newTasks: { agent: "codex" } } as never });
    expect(d.find((x) => x.work === "rest")?.harness).toBe("claude-code");
  });
});

describe("a repository (repo-where, D395)", () => {
  const HEL: WhereComputer = { id: "local", name: "hel", home: true, online: true, build: 0 };
  const MAC: WhereComputer = { id: "dev_mac", name: "MacBook", home: false, online: true, build: 2 };
  const world = (disk: Record<string, { clones: string[]; canRead?: boolean }>, prefer?: string, mac = MAC) =>
    createRepoWhere({
      computers: () => [HEL, mac],
      async clones(dev, remote, probe) {
        const d = disk[dev];
        if (!d) return "offline";
        const a: ClonesAnswer = { clones: d.clones.map((p) => ({ name: "mem", path: p, touchedAt: "2026-11-20T00:00:00Z", remote: "github.com/" + remote.replace(/^github\.com\//, "") })) };
        return probe && !a.clones.length && d.canRead !== undefined ? { ...a, canRead: d.canRead } : a;
      },
      async folder() {
        return { exists: false };
      },
      prefer: () => prefer,
    });

  test("the author's case: the Mac has the clone and builds first; with no default it goes there", async () => {
    const r = await world({ local: { clones: [], canRead: true }, dev_mac: { clones: ["/Users/wey/dev/mem"] } }).resolve({ remote: "nowledge-co/mem" });
    expect(r).toMatchObject({ ok: true, how: "found", computer: "MacBook" });
  });

  test("hel as the default: hel clones it first, since its git can read it", async () => {
    const r = await world({ local: { clones: [], canRead: true }, dev_mac: { clones: ["/Users/wey/dev/mem"] } }, "local").resolve({ remote: "nowledge-co/mem" });
    expect(r).toMatchObject({ ok: true, how: "clone", computer: "hel", place: { device: "local", clone: "nowledge-co/mem" }, also: ["MacBook"] });
  });

  test("hel has a copy: that copy", async () => {
    const r = await world({ local: { clones: ["/root/dev/mem"] }, dev_mac: { clones: ["/Users/wey/dev/mem"] } }, "local").resolve({ remote: "nowledge-co/mem" });
    expect(r).toMatchObject({ ok: true, how: "prefer", computer: "hel", place: { repoPath: "/root/dev/mem" } });
  });

  test("hel can't read it: the Mac's copy, as before (a preference, never a dead end)", async () => {
    const r = await world({ local: { clones: [], canRead: false }, dev_mac: { clones: ["/Users/wey/dev/mem"] } }, "local").resolve({ remote: "nowledge-co/mem" });
    expect(r).toMatchObject({ ok: true, how: "found", computer: "MacBook" });
  });

  test("the preferred Mac is away: hel's copy, no wait", async () => {
    const r = await world({ local: { clones: ["/root/dev/mem"] } }, "dev_mac", { ...MAC, online: false }).resolve({ remote: "nowledge-co/mem" });
    expect(r).toMatchObject({ ok: true, computer: "hel" });
  });

  test("a computer the person named in words still wins over the default", async () => {
    const r = await world({ local: { clones: ["/root/dev/mem"] }, dev_mac: { clones: ["/Users/wey/dev/mem"] } }, "local").resolve({ remote: "nowledge-co/mem", named: "MacBook" });
    expect(r).toMatchObject({ ok: true, how: "named", computer: "MacBook" });
  });
});

test("the setting keeps only a computer id and an agent that does tasks", () => {
  expect(cleanNewTasks({ where: " dev_mac ", agent: "codex" })).toEqual({ where: "dev_mac", agent: "codex" });
  expect(cleanNewTasks({ where: "", agent: "nope" })).toEqual({});
  expect(cleanNewTasks(undefined)).toEqual({});
});

test("the partner's new_tasks: the person's words set the same setting Settings shows; names checked, the other field kept", async () => {
  const tmp = tempDir();
  const core = startCore({ dataDir: tmp.dir, port: 0, push: false, platform: "linux" });
  try {
    const call = (args: object) => core.mcp.call({ role: "partner" }, "new_tasks", args) as Promise<any>;
    const r = await call({ where: "local", agent: "codex" });
    expect(r.ok).toBe(true);
    expect(core.settings.get().newTasks).toEqual({ where: "local", agent: "codex" });
    expect((await call({ where: "nowhere" })).error).toContain("not a computer of this home");
    expect(core.settings.get().newTasks).toEqual({ where: "local", agent: "codex" });
    await call({ agent: "auto" });
    expect(core.settings.get().newTasks).toEqual({ where: "local" });
    await call({ where: "auto" });
    expect(core.settings.get().newTasks).toBeUndefined();
  } finally {
    await core.stop();
    tmp.cleanup();
  }
});
