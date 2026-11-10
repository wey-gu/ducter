// D157 (design/where.md §7): 我要合电脑了 / Move before closing is one decision for the computer.
// Go (the default) moves what can move to a computer that stays awake; what can only run there
// (a folder, Keynote) stays; nothing moves toward more access.
import { expect, test } from "bun:test";
import type { Bodies, Candidate, LogEvent, TaskCard } from "@ducter/protocol";
import { createClosing } from "../src/closing.ts";
import type { Computer } from "../src/candidates.ts";

function fakeLog() {
  const events: LogEvent[] = [];
  const fns = new Set<(e: LogEvent) => void>();
  return {
    events,
    append(e: any) {
      const ev = { seq: events.length + 1, ts: new Date().toISOString(), persona: "p", ...e } as LogEvent;
      events.push(ev);
      for (const f of fns) f(ev);
      return ev;
    },
    read: (q: { kinds?: string[] }) => events.filter((e) => !q.kinds || q.kinds.includes(e.kind)),
    subscribe: (f: (e: LogEvent) => void) => (fns.add(f), () => fns.delete(f)),
  };
}

const card = (taskId: string, title: string, place: TaskCard["place"], attention: TaskCard["attention"] = "working") => ({ taskId, title, place, attention, persona: "p", project: "", harness: "codex", residency: "hot", openedAt: "", updatedAt: "" }) as TaskCard;

test("one card for the MacBook: CI and the translation move to hel; Keynote and the folder stay; Go moves them", async () => {
  const log = fakeLog();
  const tasks = [
    card("t_ci", "修 CI", { kind: "repo", device: "MacBook", repoPath: "~/dev/ducter" }),
    card("t_tr", "英译", { kind: "none", device: "MacBook" }),
    card("t_key", "做 Keynote", { kind: "none", device: "MacBook" }),
    card("t_dir", "整理照片", { kind: "folder", device: "MacBook", path: "~/Pictures" }),
    card("t_hel", "on hel already", { kind: "none", device: "local" }),
    card("t_done", "done one", { kind: "none", device: "MacBook" }, "done"),
  ];
  const comps: Computer[] = [
    { id: "local", name: "hel", home: true, state: "awake", alwaysOn: true, mac: false, harnesses: [] },
    { id: "w1", name: "MacBook", home: false, state: "awake", alwaysOn: false, mac: true, harnesses: [] },
  ];
  const cand = (o: Partial<Candidate>): Candidate => ({ harness: "codex", reason: { kind: "fit" }, ...o });
  const candidates: Record<string, Candidate[]> = {
    t_ci: [cand({ current: true, device: "w1", deviceName: "MacBook" }), cand({ device: "local", deviceName: "hel" })],
    t_tr: [cand({ current: true, device: "w1", deviceName: "MacBook" }), cand({ device: "local", deviceName: "hel" })],
    t_key: [cand({ current: true, device: "w1", deviceName: "MacBook" }), cand({ device: "local", deviceName: "hel", blocked: "no_app" })],
  };
  const switched: [string, string | undefined][] = [];
  const loadout = {
    computers: async () => comps,
    candidates: async (id: string) => candidates[id] ?? [],
    switchTask: async (id: string, _h: string, _m: string | undefined, _r: unknown, device?: string) => (switched.push([id, device]), { ok: true }),
  } as any;
  const closing = createClosing({ log: log as any, tasks: { list: () => tasks } as any, loadout, runner: () => undefined, now: () => 0 });
  const r = await closing.ask("MacBook", true);
  expect(r).toMatchObject({ ok: true });
  const d = log.events.find((e) => e.kind === "decision")!.body as Bodies["decision"];
  expect(d.question).toBe("合上之前：「修 CI」「英译」搬到 hel 上接着做；「做 Keynote」「整理照片」只能在 MacBook 上做，醒了接着。");
  expect(d).toMatchObject({ defaultOption: "go", reversible: true, goLabel: "搬走" });
  expect(d.closing!.moves.map((m) => m.taskId)).toEqual(["t_ci", "t_tr"]);
  expect(d.closing!.stays.map((s) => [s.taskId, s.why])).toEqual([["t_key", "only_here"], ["t_dir", "folder"]]);
  log.append({ stream: "channel", origin: "system", kind: "decision_resolved", body: { decisionId: d.decisionId, option: "go", by: "default" } });
  await Bun.sleep(5);
  expect(switched).toEqual([["t_ci", "local"], ["t_tr", "local"]]);
  // Nothing running: no card, just "close it whenever".
  tasks.length = 0;
  expect(await closing.ask("MacBook", true)).toMatchObject({ ok: true, none: true });
  closing.stop();
});

test("never toward more access: a move that would widen (the user's Chrome) stays", async () => {
  const log = fakeLog();
  const tasks = [card("t_b", "看网页", { kind: "browser", device: "MacBook", profile: "default" })];
  const loadout = {
    computers: async () => [
      { id: "local", name: "hel", home: true, state: "awake", alwaysOn: true, mac: false, harnesses: [] },
      { id: "w1", name: "MacBook", home: false, state: "awake", alwaysOn: false, mac: true, harnesses: [] },
      { id: "w2", name: "Mac mini", home: false, state: "awake", alwaysOn: true, mac: true, harnesses: [] },
    ],
    candidates: async () => [{ harness: "codex", reason: { kind: "fit" }, current: true, device: "w1" }, { harness: "codex", reason: { kind: "fit" }, device: "w2", deviceName: "Mac mini", widens: true }],
  } as any;
  const closing = createClosing({ log: log as any, tasks: { list: () => tasks } as any, loadout, runner: () => undefined });
  const p = await closing.plan("MacBook");
  expect(p!.moves).toEqual([]);
  expect(p!.stays[0]).toMatchObject({ taskId: "t_b", why: "only_here" });
  closing.stop();
});
