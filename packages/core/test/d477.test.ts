// D477 (hel, 2026-11-22): "用 hel 上的 agy 细审 Nowledge Mem 的长文案，只在 hel 上做，不要用 Mac 上的".
// hel had no copy; the Mac had nowledge-co/mem. The partner, which understands the words, records the
// person's word on where (task_open's `where`) and the repository it means (place.remote); code checks
// the names, holds every later step to them, fetches the code where the work was put, and never moves
// the work to another computer by itself. Nothing here reads the person's words. All fakes.
import { expect, test } from "bun:test";
import type { TaskBound, TaskCard } from "@ducter/protocol";
import type { ClonesAnswer } from "@ducter/protocol/src/clones.ts";
import type { FolderInfo } from "@ducter/protocol/src/folder-info.ts";
import { allowedBy, boundFrom, mergeBound, movableTo } from "../src/bound.ts";
import { nextStartRung, startLadder } from "../src/mend.ts";
import { createPlaces, createRepoWhere, type WhereComputer } from "../src/repo-where.ts";

const HEL: WhereComputer = { id: "local", name: "Hetzner Server", home: true, online: true, build: 0, aliases: ["hel"], os: "linux" };
const MAC: WhereComputer = { id: "d1f365f665", name: "Wey's MacBook Pro", home: false, online: true, build: 2, os: "darwin" };
const COMPS = [HEL, MAC];

test("the word as the partner recorded it: names (the host name too) to ids; a name that is no computer comes back, never guessed", () => {
  expect(boundFrom({ on: "hel", only: true, not: ["Wey's MacBook Pro"] }, COMPS)).toEqual({ bound: { only: "local", not: ["d1f365f665"], named: "local" } });
  expect(boundFrom({ on: "Hetzner Server" }, COMPS)).toEqual({ bound: { named: "local" } });
  expect(boundFrom({ not: ["d1f365f665"] }, COMPS)).toEqual({ bound: { not: ["d1f365f665"] } });
  // "mac" is a word, not a computer's name: the partner is told, nothing is read into it.
  expect(boundFrom({ on: "mac" }, COMPS)).toEqual({ unknown: ["mac"] });
  expect(boundFrom(undefined, COMPS)).toEqual({ bound: {} });
  const b: TaskBound = { only: "local", not: ["d1f365f665"] };
  expect(allowedBy(b, "local")).toBe(true);
  expect(allowedBy(b, "d1f365f665")).toBe(false);
  expect(movableTo({ named: "local" }, "d1f365f665")).toBe(false);
  expect(mergeBound({ not: ["a"] }, { only: "a" })).toEqual({ not: ["a"] });
});

type Disk = Record<string, { clones: { path: string }[]; canRead?: boolean; folders?: Record<string, FolderInfo> }>;
const DISK: Disk = { local: { clones: [], canRead: true }, d1f365f665: { clones: [{ path: "/Users/weyl/dev/nowledge-mem" }] } };

function hel(o: { card?: Partial<TaskCard>; kept?: TaskBound; disk?: Disk } = {}) {
  const disk = o.disk ?? DISK;
  const where = createRepoWhere({
    computers: () => COMPS,
    async clones(dev, remote, probe) {
      const d = disk[dev];
      if (!d) return "offline";
      const a: ClonesAnswer = { clones: d.clones.map((c) => ({ name: c.path.split("/").pop()!, path: c.path, touchedAt: "2026-11-20T00:00:00.000Z", remote })) };
      return probe && !a.clones.length ? { ...a, ...(d.canRead !== undefined ? { canRead: d.canRead } : {}) } : a;
    },
    async folder(dev, path) {
      return disk[dev]?.folders?.[path] ?? { exists: false };
    },
  });
  const task = { taskId: "smx2jjb3", title: "在 hel 用 agy 审阅 Mem 长文案", place: { kind: "repo", device: "local", repoPath: "~/ducter/projects/mem", clone: "nowledge-co/mem" }, harness: "antigravity", attention: "failed", ...o.card } as TaskCard;
  return createPlaces({
    where,
    computers: () => COMPS,
    tasks: { get: (id) => (id === task.taskId ? task : undefined) },
    opened: () => ({ title: task.title, brief: "brief", language: "zh-CN" }),
    lang: () => "zh-CN",
    async folder(dev, path) {
      return disk[dev]?.folders?.[path] ?? { exists: false };
    },
    boundKept: () => o.kept,
  });
}

test("the first open: the repository the partner named, hel only: cloned on hel, the word kept on the task", async () => {
  const r = await hel().preflight({ place: { kind: "repo", remote: "nowledge-co/mem" } as never, remote: "nowledge-co/mem", texts: ["x", "brief"], userTexts: [], where: { on: "hel", only: true, not: ["Wey's MacBook Pro"] } });
  expect(r).toMatchObject({ ok: true, how: "clone", place: { device: "local", clone: "nowledge-co/mem" }, bound: { only: "local", not: ["d1f365f665"] } });
  // With no word on where, the copy found on the Mac is where it goes, and that is said back as a fact (how / computer).
  expect(await hel().preflight({ place: { kind: "none" }, remote: "nowledge-co/mem", texts: ["x", "brief"], userTexts: [] })).toMatchObject({ ok: true, how: "found", computer: "Wey's MacBook Pro" });
  // A name that is no computer here goes back to the partner.
  const odd = await hel().preflight({ place: { kind: "none" }, remote: "nowledge-co/mem", texts: ["x"], userTexts: [], where: { on: "helsinki" } });
  expect(!odd.ok && odd.error).toContain('"helsinki" is not a computer of this home');
});

test("a missing folder: the recorded repository is fetched there (a preparation step); with none recorded, the partner judges, code never matches names", async () => {
  const p = hel();
  const r = await p.preflight({ place: { kind: "folder", device: "local", path: "/root/dev/mem" }, remote: "nowledge-co/mem", texts: ["x", "brief"], userTexts: [] });
  expect(r).toMatchObject({ ok: true, how: "clone", place: { kind: "repo", device: "local", clone: "nowledge-co/mem" } });
  const q = await p.preflight({ place: { kind: "folder", device: "local", path: "/root/dev/mem" }, texts: ["Mem 长文案", "brief"], userTexts: ["Nowledge Mem"] });
  expect(q.ok).toBe(false);
  if (!q.ok) expect(q.error).toContain("[devices]");
});

test("a rethink's reopen with replaces keeps the word: the Mac is refused; the same work on hel clones it there", async () => {
  const kept: TaskBound = { only: "local", not: ["d1f365f665"] };
  const p = hel({ kept });
  const mac = await p.preflight({ place: { kind: "repo", device: "d1f365f665", repoPath: "/Users/weyl/dev/nowledge-mem" }, texts: ["x", "brief"], userTexts: [], replaces: "smx2jjb3" });
  expect(mac.ok).toBe(false);
  if (!mac.ok) expect(mac.error).toContain("only on Hetzner Server");
  const r = await p.preflight({ place: { kind: "none" }, remote: "nowledge-co/mem", texts: ["x", "brief"], userTexts: [], replaces: "smx2jjb3" });
  expect(r).toMatchObject({ ok: true, how: "clone", place: { device: "local", clone: "nowledge-co/mem" }, bound: kept });
});

test("hel named and it can't read the repository: never a quiet move to the Mac's copy; the facts go back", async () => {
  const p = hel({ disk: { local: { clones: [], canRead: false }, d1f365f665: { clones: [{ path: "/Users/weyl/dev/nowledge-mem" }] } } });
  const only = await p.preflight({ place: { kind: "none" }, remote: "nowledge-co/mem", texts: ["x", "brief"], userTexts: [], where: { on: "hel", only: true } });
  expect(!only.ok && only.error).toContain("only on Hetzner Server");
  const named = await p.preflight({ place: { kind: "none" }, remote: "nowledge-co/mem", texts: ["x", "brief"], userTexts: [], where: { on: "hel" } });
  expect(!named.ok && named.error).toContain("Wey's MacBook Pro has a copy");
});

test("a failed start: Ducter fetches the code where the work was put and never moves the work by itself", async () => {
  const p = hel({ kept: { named: "local" } });
  const c = await p.cantStart("smx2jjb3", { why: "no_repo", path: "~/ducter/projects/mem", device: "local" });
  expect(c).toMatchObject({ cloneHere: true });
  expect(startLadder(c, p.boundOf!("smx2jjb3")).map((s) => s.how)).toEqual(["clone_here"]);
  // With no word on where either: the copy elsewhere is a fact for the partner, not a rung.
  expect(startLadder({ ...c, elsewhere: { device: "d1f365f665", name: "Wey's MacBook Pro" } }).map((s) => s.how)).toEqual(["clone_here"]);
  expect(nextStartRung(c, [], 0, p.boundOf!("smx2jjb3"))).toEqual({ step: { how: "clone_here", delayMs: 0 } });
  // The person's own tap on 在 Mac 上做 is a new word: it goes; Ducter by itself never moves it.
  expect(await p.replan("smx2jjb3", { action: "start_at", device: "d1f365f665" }, "ducter")).toMatchObject({ ok: false });
  expect(await p.replan("smx2jjb3", { action: "start_at", device: "d1f365f665" })).toMatchObject({ ok: true, place: { device: "d1f365f665" } });
});
