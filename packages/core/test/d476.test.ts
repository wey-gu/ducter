// D476 (hel, 2026-11-22, read from hel's Log): "在 hel 用 Gemini 审改 Mem 长文案并开 PR", with "请用我们
// hel 上的 agy 而不是 mac 上的". The task went to /root/dev/mem, which hel didn't have; Ducter didn't
// know which repository "mem" was (the project is nowledge-mem, its origin on the Mac), so it
// couldn't clone it onto hel, and the partner's rethink opened the same work on the Mac. Here:
// the repository is known from what Ducter already has, the person's word on where binds every
// later step, and the fix is a clone onto hel. All fakes: no git, no network, no disk.
import { expect, test } from "bun:test";
import type { TaskBound, TaskCard } from "@ducter/protocol";
import type { ClonesAnswer } from "@ducter/protocol/src/clones.ts";
import type { FolderInfo } from "@ducter/protocol/src/folder-info.ts";
import { allowedBy, boundIn, mergeBound, movableTo } from "../src/bound.ts";
import { nextStartRung, startLadder } from "../src/mend.ts";
import { sourcesOf, whichRepo } from "../src/repo-known.ts";
import { createPlaces, createRepoWhere, type WhereComputer } from "../src/repo-where.ts";

const HEL: WhereComputer = { id: "local", name: "Hetzner Server", home: true, online: true, build: 0, aliases: ["hel"], os: "linux" };
const MAC: WhereComputer = { id: "d1f365f665", name: "Wey's MacBook Pro", home: false, online: true, build: 2, os: "darwin" };
const COMPS = [HEL, MAC];
const ASKED = "请用我们 hel 上的 agy 而不是 mac 上的";

test("the person's word, read by code: hel by its host name, the Mac by its kind; named plus excluded is only", () => {
  expect(boundIn([ASKED], COMPS)).toEqual({ only: "local", not: ["d1f365f665"], named: "local" });
  // Named alone: the place they meant, not "only".
  expect(boundIn(["在 hel 用 Gemini 审改 Mem 长文案并开 PR"], COMPS)).toEqual({ named: "local" });
  expect(boundIn(["only on hel please"], COMPS)).toMatchObject({ only: "local" });
  expect(boundIn(["do it on the server, not on my mac"], COMPS)).toMatchObject({ only: "local", not: ["d1f365f665"] });
  expect(boundIn(["只在 Hetzner Server 上做"], COMPS)).toMatchObject({ only: "local" });
  expect(boundIn(["mac 上的不要用"], COMPS)).toMatchObject({ not: ["d1f365f665"] });
  // Nothing about a computer: nothing.
  expect(boundIn(["审改 Mem 长文案并开 PR", "helpful copy for the machine"], COMPS)).toEqual({});
  // "mac" names nothing when two Macs fit.
  expect(boundIn(["not on the mac"], [HEL, MAC, { ...MAC, id: "d2", name: "Mac mini" }])).toEqual({});
  const b: TaskBound = { only: "local", not: ["d1f365f665"] };
  expect(allowedBy(b, "local")).toBe(true);
  expect(allowedBy(b, "d1f365f665")).toBe(false);
  expect(movableTo({ named: "local" }, "d1f365f665")).toBe(false);
  expect(allowedBy({ named: "local" }, "d1f365f665")).toBe(true);
  expect(mergeBound({ not: ["a"] }, { only: "a" })).toEqual({ not: ["a"] });
});

test("which repository 'mem' is: the project nowledge-mem on the Mac, its origin read there; two that fit are asked, never picked", async () => {
  const projects = [{ name: "nowledge-mem", place: { kind: "repo" as const, device: "d1f365f665", repoPath: "/Users/weyl/dev/nowledge-mem" } }];
  const origin = async (dev: string, path: string) => (dev === "d1f365f665" && path === "/Users/weyl/dev/nowledge-mem" ? "github.com/nowledge-co/mem" : undefined);
  expect(await whichRepo({ name: "mem", words: ["在 hel 用 Gemini 审改 Mem 长文案并开 PR"] }, sourcesOf(projects, []), origin)).toEqual({ remote: "github.com/nowledge-co/mem" });
  // A task that once cloned it says it too, with nothing to read.
  expect(await whichRepo({ name: "mem" }, sourcesOf([], [{ kind: "repo", device: "local", repoPath: "~/ducter/projects/mem", clone: "nowledge-co/mem" }]))).toEqual({ remote: "github.com/nowledge-co/mem" });
  // Two repositories called mem: never a guess.
  const two = sourcesOf([{ name: "mem", place: { kind: "repo", device: "local", repoPath: "/a/mem" }, remote: "github.com/nowledge-co/mem" }, { name: "mem", place: { kind: "repo", device: "local", repoPath: "/b/mem" }, remote: "github.com/someone/mem" }], []);
  expect(await whichRepo({ name: "mem" }, two)).toEqual({ ambiguous: ["nowledge-co/mem", "someone/mem"] });
  // The person's words narrow it ("Nowledge Mem").
  const named = sourcesOf([{ name: "nowledge-mem", place: { kind: "repo", device: "local", repoPath: "/a/nowledge-mem" }, remote: "github.com/nowledge-co/mem" }, { name: "mem-notes", place: { kind: "repo", device: "local", repoPath: "/b/mem-notes" }, remote: "github.com/someone/mem-notes" }], []);
  expect(await whichRepo({ name: "mem", words: ["Review the Nowledge Mem copy"] }, named)).toEqual({ remote: "github.com/nowledge-co/mem" });
  expect(await whichRepo({ name: "notes" }, named)).toEqual({ remote: "github.com/someone/mem-notes" });
  expect(await whichRepo({ name: "zzz" }, named)).toBeUndefined();
});

type Disk = Record<string, { clones: { path: string }[]; canRead?: boolean; folders?: Record<string, FolderInfo> }>;

function hel(o: { card?: Partial<TaskCard>; title?: string; brief?: string; kept?: TaskBound; carried?: TaskBound; disk?: Disk } = {}) {
  const disk: Disk = o.disk ?? { local: { clones: [], canRead: true }, d1f365f665: { clones: [{ path: "/Users/weyl/dev/nowledge-mem" }] } };
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
  const task = { taskId: "smx2jjb3", title: o.title ?? "在 hel 用 Gemini 审改 Mem 长文案并开 PR", place: { kind: "folder", device: "local", path: "/root/dev/mem" }, harness: "antigravity", attention: "failed", ...o.card } as TaskCard;
  return createPlaces({
    where,
    computers: () => COMPS,
    tasks: { get: (id) => (id === task.taskId ? task : undefined) },
    opened: () => ({ title: task.title, brief: o.brief ?? `Review Mem's long copy and open a PR.\n\nUser's words (verbatim):\n> ${ASKED}`, language: "zh-CN" }),
    lang: () => "zh-CN",
    async folder(dev, path) {
      return disk[dev]?.folders?.[path] ?? { exists: false };
    },
    knownRepo: async (name) => (name === "mem" ? { remote: "github.com/nowledge-co/mem" } : undefined),
    boundKept: () => o.kept,
    boundCarried: () => o.carried,
  });
}

test("the failed start on hel: clone onto hel is offered and climbed first; the Mac is never offered", async () => {
  const p = hel();
  const c = await p.cantStart("smx2jjb3", { why: "no_folder", path: "/root/dev/mem", device: "local" });
  expect(c).toMatchObject({ why: "no_folder", computer: "Hetzner Server", what: "mem", cloneHere: true, pickHere: true });
  expect(c.elsewhere).toBeUndefined();
  const b = p.boundOf!("smx2jjb3");
  expect(b).toMatchObject({ only: "local", not: ["d1f365f665"] });
  expect(startLadder(c, b).map((s) => s.how)).toEqual(["clone_here"]);
  expect(nextStartRung(c, [], 0, b)).toEqual({ step: { how: "clone_here", delayMs: 0 } });
  expect(await p.replan("smx2jjb3", { action: "clone_here" }, "ducter")).toMatchObject({ ok: true, place: { kind: "repo", device: "local", clone: "nowledge-co/mem", repoPath: "~/ducter/projects/mem" } });
  // Ducter by itself never moves it to the Mac.
  expect(await p.replan("smx2jjb3", { action: "start_at", device: "d1f365f665" }, "ducter")).toMatchObject({ ok: false });
});

test("only named (no exclusion): the card still offers the Mac's copy, but Ducter's own ladder clones on hel instead of moving", async () => {
  const p = hel({ brief: "Review Mem's long copy" });
  const c = await p.cantStart("smx2jjb3", { why: "no_folder", path: "/root/dev/mem", device: "local" });
  expect(c).toMatchObject({ cloneHere: true, elsewhere: { device: "d1f365f665" } });
  expect(startLadder(c, p.boundOf!("smx2jjb3")).map((s) => s.how)).toEqual(["clone_here"]);
  // Without any word on where, D473's order stands: the copy elsewhere first.
  expect(startLadder(c).map((s) => s.how)).toEqual(["start_at", "clone_here"]);
  // The person's own tap on 在 Mac 上做 is a new word: it goes.
  expect(await p.replan("smx2jjb3", { action: "start_at", device: "d1f365f665" })).toMatchObject({ ok: true, place: { device: "d1f365f665" } });
});

test("the partner's rethink: a task opened again on the Mac is refused with a clear error; the same work on hel clones it there", async () => {
  const carried: TaskBound = { only: "local", not: ["d1f365f665"] };
  const p = hel({ carried });
  const mac = await p.preflight({ place: { kind: "repo", device: "d1f365f665", repoPath: "/Users/weyl/dev/nowledge-mem" }, texts: ["用 Gemini 审改 Mem 长文案并开 PR", "brief"], userTexts: [] });
  expect(mac.ok).toBe(false);
  if (!mac.ok) {
    expect(mac.error).toContain("only on Hetzner Server");
    expect(mac.error).toContain("Never on Wey's MacBook Pro");
  }
  // The repository with no device: found on the Mac would have won; the word keeps it on hel, cloned there.
  const r = await p.preflight({ place: { kind: "none" }, remote: "nowledge-co/mem", texts: ["用 Gemini 审改 Mem 长文案并开 PR", "brief"], userTexts: [] });
  expect(r).toMatchObject({ ok: true, how: "clone", place: { device: "local", clone: "nowledge-co/mem" }, bound: carried, said: "Hetzner Server 上还没有 mem 的代码，我先在那里拉一份。" });
});

test("the first open: a missing folder on hel the person named, a repository Ducter knows: cloned there at once, no question", async () => {
  const p = hel();
  const r = await p.preflight({ place: { kind: "folder", device: "local", path: "/root/dev/mem" }, texts: ["在 hel 用 Gemini 审改 Mem 长文案并开 PR", "brief"], userTexts: [ASKED] });
  expect(r).toMatchObject({ ok: true, how: "clone", place: { kind: "repo", device: "local", clone: "nowledge-co/mem" }, bound: { only: "local", not: ["d1f365f665"] } });
  // Two repositories fit: one question naming both.
  const amb = createPlaces({
    where: createRepoWhere({ computers: () => COMPS, clones: async () => ({ clones: [] }), folder: async () => ({ exists: false }) }),
    computers: () => COMPS,
    tasks: { get: () => undefined },
    opened: () => undefined,
    lang: () => "en",
    folder: async () => ({ exists: false }),
    knownRepo: async () => ({ ambiguous: ["nowledge-co/mem", "someone/mem"] }),
  });
  const q = await amb.preflight({ place: { kind: "folder", device: "local", path: "/root/dev/mem" }, texts: ["x"], userTexts: ["x"] });
  expect(!q.ok && q.error).toContain("could be nowledge-co/mem or someone/mem");
});

test("hel can't read the repository and the person said only hel: no fallback to the Mac's copy", async () => {
  const p = hel({ carried: { only: "local" }, disk: { local: { clones: [], canRead: false }, d1f365f665: { clones: [{ path: "/Users/weyl/dev/nowledge-mem" }] } } });
  const r = await p.preflight({ place: { kind: "none" }, remote: "nowledge-co/mem", texts: ["Mem 长文案", "brief"], userTexts: [] });
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error).toContain("only on Hetzner Server");
});
