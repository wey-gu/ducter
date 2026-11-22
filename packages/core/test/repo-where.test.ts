// D395: the repository is named by its remote, never guessed by path. The resolver (which
// computer has a clone, which one builds, clone when none), task_open's pre-flight, a failed
// start's reason and fixes, and 再试一次 re-resolving. All fakes: no git, no network, no disk.
import { expect, test } from "bun:test";
import type { RuleView, TaskCard } from "@ducter/protocol";
import type { ClonesAnswer } from "@ducter/protocol/src/clones.ts";
import type { FolderInfo } from "@ducter/protocol/src/folder-info.ts";
import { createPlaces, createRepoWhere, remoteIn, type WhereComputer } from "../src/repo-where.ts";

const HEL: WhereComputer = { id: "local", name: "Hetzner Server", home: true, online: true, build: 0 };
const MAC: WhereComputer = { id: "dev_mac", name: "MacBook", home: false, online: true, build: 2 };
const HASWELL: WhereComputer = { id: "dev_haswell", name: "haswell", home: false, online: true, build: 1 };

type Disk = Record<string, { clones: { path: string; touchedAt?: string }[]; canRead?: boolean; folders?: Record<string, FolderInfo> }>;

function world(disk: Disk, comps: WhereComputer[] = [HEL, MAC, HASWELL], rules: RuleView[] = []) {
  const asked: { dev: string; probe: boolean }[] = [];
  const where = createRepoWhere({
    computers: () => comps,
    async clones(dev, remote, probe) {
      asked.push({ dev, probe });
      const d = disk[dev];
      if (!d) return "offline";
      const a: ClonesAnswer = { clones: d.clones.map((c) => ({ name: c.path.split("/").pop()!, path: c.path, touchedAt: c.touchedAt ?? "2026-11-18T10:00:00.000Z", remote: "github.com/" + remote.replace(/^github\.com\//, "") })) };
      return probe && !a.clones.length ? { ...a, ...(d.canRead !== undefined ? { canRead: d.canRead } : {}) } : a;
    },
    async folder(dev, path) {
      return disk[dev]?.folders?.[path] ?? { exists: false };
    },
    rules: () => rules,
  });
  return { where, asked };
}

test("a to-do on a repo only a worker has: that worker's clone, never a guessed path on the server", async () => {
  const { where } = world({
    local: { clones: [], canRead: false },
    dev_mac: { clones: [{ path: "/Users/wey/dev/mem" }] },
    dev_haswell: { clones: [] },
  });
  const r = await where.resolve({ remote: "nowledge-co/mem", given: { kind: "repo", device: "local", repoPath: "/root/dev/mem" } });
  expect(r).toMatchObject({ ok: true, how: "found", computer: "MacBook", repo: "mem", place: { kind: "repo", device: "dev_mac", repoPath: "/Users/wey/dev/mem" } });
});

test("two computers have it: the one that builds (a Mac) over a worker server; the given place kept when it is that repo", async () => {
  const both: Disk = {
    local: { clones: [] },
    dev_mac: { clones: [{ path: "/Users/wey/dev/mem", touchedAt: "2026-11-01T00:00:00.000Z" }] },
    dev_haswell: { clones: [{ path: "/home/wey/dev/mem", touchedAt: "2026-11-18T00:00:00.000Z" }], folders: { "/home/wey/dev/mem": { exists: true, kind: "repo", remote: "github.com/nowledge-co/mem" } } },
  };
  const { where } = world(both);
  expect(await where.resolve({ remote: "nowledge-co/mem" })).toMatchObject({ ok: true, computer: "MacBook", also: ["haswell"] });
  // haswell's own copy, as the partner gave it, checks out: it stays.
  const kept = await world(both).where.resolve({ remote: "https://github.com/nowledge-co/mem.git", given: { kind: "repo", device: "dev_haswell", repoPath: "/home/wey/dev/mem", baseBranch: "main" } });
  expect(kept).toMatchObject({ ok: true, how: "given", computer: "haswell", place: { repoPath: "/home/wey/dev/mem", baseBranch: "main" } });
  // A folder there that is another repository is replaced.
  const other: Disk = { ...both, local: { clones: [], folders: { "/root/dev/mem": { exists: true, kind: "repo", remote: "github.com/someone/mem" } } } };
  expect(await world(other).where.resolve({ remote: "nowledge-co/mem", given: { kind: "repo", device: "local", repoPath: "/root/dev/mem" } })).toMatchObject({ ok: true, how: "found", computer: "MacBook" });
});

test("a computer named in words wins, even over a better builder; with no copy there it is cloned there", async () => {
  const disk: Disk = { local: { clones: [] }, dev_mac: { clones: [{ path: "/Users/wey/dev/mem" }] }, dev_haswell: { clones: [], canRead: true } };
  const named = await world(disk).where.resolve({ remote: "nowledge-co/mem", named: "haswell" });
  expect(named).toMatchObject({ ok: true, how: "clone", computer: "haswell", place: { device: "dev_haswell", clone: "nowledge-co/mem" } });
  const withCopy: Disk = { ...disk, dev_haswell: { clones: [{ path: "/home/wey/src/mem" }] } };
  expect(await world(withCopy).where.resolve({ remote: "nowledge-co/mem", named: "dev_haswell" })).toMatchObject({ ok: true, how: "named", computer: "haswell", place: { repoPath: "/home/wey/src/mem" } });
});

test("a where-rule sends the work to its computer when no computer is named", async () => {
  const rule: RuleView = { id: "r1", text: "mem 的活在 haswell 上做", harness: "codex", match: ["mem"], device: "haswell", addedAt: "2026-11-01T00:00:00.000Z" } as RuleView;
  const disk: Disk = { local: { clones: [] }, dev_mac: { clones: [{ path: "/Users/wey/dev/mem" }] }, dev_haswell: { clones: [{ path: "/home/wey/dev/mem" }] } };
  const r = await world(disk, [HEL, MAC, HASWELL], [rule]).where.resolve({ remote: "nowledge-co/mem", texts: ["Improve the mem settings page"] });
  expect(r).toMatchObject({ ok: true, how: "rule", computer: "haswell" });
});

test("no clone anywhere: cloned on the best computer whose git can read it; none can: no place, a clear error", async () => {
  const some: Disk = { local: { clones: [], canRead: true }, dev_mac: { clones: [], canRead: true }, dev_haswell: { clones: [], canRead: false } };
  const r = await world(some).where.resolve({ remote: "nowledge-co/mem" });
  expect(r).toMatchObject({ ok: true, how: "clone", computer: "MacBook", place: { kind: "repo", device: "dev_mac", clone: "nowledge-co/mem" } });
  const none: Disk = { local: { clones: [], canRead: false }, dev_mac: { clones: [], canRead: false }, dev_haswell: { clones: [], canRead: false } };
  const n = await world(none).where.resolve({ remote: "nowledge-co/mem" });
  expect(n.ok).toBe(false);
  if (!n.ok) {
    expect(n.why).toBe("no_access");
    expect(n.message).toContain("nowledge-co/mem");
  }
});

test("each computer's answer is kept for a while; forget asks again", async () => {
  const w = world({ local: { clones: [] }, dev_mac: { clones: [{ path: "/Users/wey/dev/mem" }] }, dev_haswell: { clones: [] } });
  await w.where.resolve({ remote: "nowledge-co/mem" });
  const n = w.asked.length;
  await w.where.resolve({ remote: "nowledge-co/mem" });
  expect(w.asked.length).toBe(n);
  w.where.forget();
  await w.where.resolve({ remote: "nowledge-co/mem" });
  expect(w.asked.length).toBe(2 * n);
});

test("remoteIn reads a GitHub address or a to-do's ref, nothing else", () => {
  expect(remoteIn("see https://github.com/nowledge-co/mem/issues/10559")).toBe("nowledge-co/mem");
  expect(remoteIn("fix nowledge-co/mem#10559 please")).toBe("nowledge-co/mem");
  expect(remoteIn("10559 帮我用 codex astra 仔细做一下")).toBeUndefined();
  expect(remoteIn("a/b path is ~/dev/x")).toBeUndefined();
});

function places(disk: Disk, card?: Partial<TaskCard>, staged?: { kind: string; where?: string }, more: { title?: string; brief?: string } = {}) {
  const { where } = world(disk);
  const task = card ? ({ taskId: "t1", title: "Improve general setting page", place: { kind: "none" }, attention: "failed", ...card } as TaskCard) : undefined;
  return createPlaces({
    where,
    computers: () => [HEL, MAC, HASWELL],
    tasks: { get: (id) => (id === "t1" ? task : undefined) },
    opened: () => ({ title: more.title ?? "Improve general setting page", brief: more.brief ?? "nowledge-co/mem#10559", language: "zh-CN" }),
    lang: () => "zh-CN",
    staged: () => staged,
    async folder(dev, path) {
      return disk[dev]?.folders?.[path] ?? { exists: false };
    },
  });
}

test("pre-flight: a guessed bad path is replaced by the copy found; the to-do taken names the repository", async () => {
  const disk: Disk = { local: { clones: [], canRead: false }, dev_mac: { clones: [{ path: "/Users/wey/dev/mem" }] }, dev_haswell: { clones: [] } };
  const p = places(disk, undefined, { kind: "github", where: "nowledge-co/mem" });
  const r = await p.preflight({ place: { kind: "repo", device: "local", repoPath: "/root/dev/mem" }, texts: ["Improve general setting page", "预计 ~/dev/mem"], userTexts: ["10559 帮我用 codex astra 仔细做一下"] });
  expect(r).toMatchObject({ ok: true, how: "found", place: { device: "dev_mac", repoPath: "/Users/wey/dev/mem" } });
  // The partner left place out: the to-do's repository still decides.
  expect(await p.preflight({ place: { kind: "none" }, texts: ["x"], userTexts: ["10559 做一下"] })).toMatchObject({ ok: true, place: { device: "dev_mac" } });
  // A browser place is never turned into a repo.
  expect(await p.preflight({ place: { kind: "browser", device: "local", profile: "default" }, texts: [], userTexts: [] })).toMatchObject({ ok: true, place: { kind: "browser" } });
});

test("pre-flight: a clone is said in one line; a guessed path with no repository named is an error the model can act on", async () => {
  const clone = places({ local: { clones: [], canRead: false }, dev_mac: { clones: [], canRead: true }, dev_haswell: { clones: [], canRead: false } }, undefined, { kind: "github", where: "nowledge-co/mem" });
  // D477: no copy anywhere and nothing says where: where to make one is the partner's choice, with the computers named.
  const ask = await clone.preflight({ place: { kind: "none" }, texts: [], userTexts: ["10559 做一下"] });
  expect(!ask.ok && ask.error).toContain("place.device: one of Hetzner Server, MacBook, haswell");
  const r = await clone.preflight({ place: { kind: "none", device: "MacBook" } as never, texts: [], userTexts: ["10559 做一下"] });
  expect(r).toMatchObject({ ok: true, how: "clone", said: "mem 的代码还没在哪台电脑上，我先在 MacBook 上拉一份。" });
  const guess = places({ local: { clones: [] }, dev_mac: { clones: [] }, dev_haswell: { clones: [] } });
  const g = await guess.preflight({ place: { kind: "repo", device: "local", repoPath: "/root/dev/mem" }, texts: ["fix it"], userTexts: ["fix it"] });
  expect(g.ok).toBe(false);
  if (!g.ok) {
    expect(g.error).toContain("Hetzner Server has no git repository at /root/dev/mem");
    expect(g.error).toContain('"remote":"owner/name"');
  }
  const noAccess = places({ local: { clones: [], canRead: false }, dev_mac: { clones: [], canRead: false }, dev_haswell: { clones: [], canRead: false } }, undefined, { kind: "github", where: "nowledge-co/mem" });
  const n = await noAccess.preflight({ place: { kind: "none" }, texts: [], userTexts: ["做一下"] });
  expect(n.ok).toBe(false);
  if (!n.ok) expect(n.error).toContain("ask the user once");
});

test("a task that couldn't start: the cause in plain words and the fixes; 再试一次 re-resolves instead of repeating", async () => {
  const disk: Disk = { local: { clones: [], canRead: true }, dev_mac: { clones: [{ path: "/Users/wey/dev/mem" }] }, dev_haswell: { clones: [] } };
  const p = places(disk, { place: { kind: "repo", device: "local", repoPath: "/root/dev/mem" }, source: { source: "g", kind: "github", ref: "nowledge-co/mem#10559", label: "#10559", where: "nowledge-co/mem", title: "Improve general setting page" } });
  const c = await p.cantStart("t1", { why: "no_repo", path: "/root/dev/mem", device: "local" });
  expect(c).toMatchObject({ why: "no_repo", computer: "Hetzner Server", what: "mem", line: "没能开始：Hetzner Server 上没有 mem 的代码", elsewhere: { device: "dev_mac", name: "MacBook" }, cloneHere: true });
  expect(await p.replan("t1", { action: "reopen" })).toMatchObject({ ok: true, place: { device: "dev_mac", repoPath: "/Users/wey/dev/mem" } });
  expect(await p.replan("t1", { action: "clone_here" })).toMatchObject({ ok: true, place: { device: "local", clone: "nowledge-co/mem" } });
  expect(await p.replan("t1", { action: "start_at", device: "dev_mac" })).toMatchObject({ ok: true, place: { device: "dev_mac" } });
});

// D472 (hel, 2026-11-22): "在 hel 用 Gemini 审改 Mem 长文案并开 PR" was opened in /root/dev/mem on
// Hetzner Server, which had no such folder; it failed at once and the person had to ask why.
test("D472, D477: a folder that isn't there is found before the task opens; which repository it is, is the partner's judgment from [devices]", async () => {
  const disk: Disk = { local: { clones: [], canRead: true }, dev_mac: { clones: [{ path: "/Users/wey/dev/mem" }] }, dev_haswell: { clones: [] } };
  const p = places(disk);
  const r = await p.preflight({ place: { kind: "folder", device: "local", path: "/root/dev/mem" }, texts: ["在 hel 用 Gemini 审改 Mem 长文案并开 PR"], userTexts: ["在 hel 上用 gemini 改一下 mem 的长文案"] });
  expect(r.ok).toBe(false);
  if (!r.ok) {
    expect(r.error).toContain("Hetzner Server has no folder /root/dev/mem");
    expect(r.error).toContain("[devices]");
    expect(r.error).toContain('"device":"Hetzner Server"');
  }
  // The partner recorded the repository: the code is fetched there first, a preparation step.
  expect(await p.preflight({ place: { kind: "folder", device: "local", path: "/root/dev/mem" }, remote: "nowledge-co/mem", texts: ["x"], userTexts: ["x"] })).toMatchObject({ ok: true, how: "clone", place: { device: "local", clone: "nowledge-co/mem" } });
  const q = await places(disk).preflight({ place: { kind: "folder", device: "local", path: "/root/dev/notes" }, texts: ["x"], userTexts: ["x"] });
  expect(!q.ok && q.error).toContain("ask the user in one short line which folder or repository it is");
  // A folder that is there opens as it is.
  const there = places({ ...disk, local: { clones: [], folders: { "/root/dev/notes": { exists: true, kind: "folder" } } } });
  expect(await there.preflight({ place: { kind: "folder", device: "local", path: "/root/dev/notes" }, texts: ["x"], userTexts: ["x"] })).toMatchObject({ ok: true });
});

test("D472: a task that couldn't start in a missing folder offers to clone the repository there or choose a folder on it", async () => {
  const disk: Disk = { local: { clones: [], canRead: true }, dev_mac: { clones: [{ path: "/Users/wey/dev/mem" }] }, dev_haswell: { clones: [] } };
  // D477: with no repository recorded on the task, code doesn't guess one from the folder's name.
  const p = places(disk, { place: { kind: "folder", device: "local", path: "/root/dev/mem" }, harness: "antigravity" }, undefined, { title: "在 hel 用 Gemini 审改 Mem 长文案并开 PR", brief: "Review Mem's long copy" });
  const c = await p.cantStart("t1", { why: "no_folder", path: "/root/dev/mem", device: "local" });
  expect(c).toMatchObject({ why: "no_folder", computer: "Hetzner Server", what: "mem", device: "local", harness: "antigravity", pickHere: true, line: "没能开始：Hetzner Server 上没有 mem 这个文件夹" });
  expect(c.cloneHere).toBeUndefined();
  expect(await p.replan("t1", { action: "clone_here" })).toMatchObject({ ok: false });
  // Recorded on the task (its words carry owner/name): cloned there.
  const rec = places(disk, { place: { kind: "folder", device: "local", path: "/root/dev/mem" }, harness: "antigravity" }, undefined, { title: "x", brief: "nowledge-co/mem#10559" });
  expect(await rec.cantStart("t1", { why: "no_folder", path: "/root/dev/mem", device: "local" })).toMatchObject({ cloneHere: true });
  expect(await rec.replan("t1", { action: "clone_here" })).toMatchObject({ ok: true, place: { kind: "repo", device: "local", clone: "nowledge-co/mem" } });
  // An agent that hit something unknown says itself and the computer.
  const o = await p.cantStart("t1", { why: "other", path: "", device: "dev_mac" });
  expect(o).toMatchObject({ why: "other", computer: "MacBook", what: "Antigravity", line: "没能开始：Antigravity 在 MacBook 上一开始就出了错" });
  // D477: its words are not read by code for a computer: the card offers no move; the partner reads the words.
  const named = places(disk, { place: { kind: "none" }, harness: "antigravity" }, undefined, { title: "在 Hetzner Server 上审 Mem 的文案", brief: "x" });
  const ni = await named.cantStart("t1", { why: "not_installed", path: "", device: "dev_mac" });
  expect(ni).toMatchObject({ why: "not_installed", line: "没能开始：MacBook 上还没装 Antigravity" });
  expect(ni.elsewhere).toBeUndefined();
});
