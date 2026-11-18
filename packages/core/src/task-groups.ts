// D360: groups of tasks that are one piece of work, and their line. See protocol/src/task-groups.ts
// for the shapes and design/on-hand.md §Groups for what the person sees.
//
// The line: members of a one-by-one group that work in the same folder on the same computer run one
// after another. A later one is held here (its whole task_open input, no task yet, no agent spent);
// it opens when every member before it in that folder is done, from the last one's unmerged branch.
// A member that ends without being done (failed, put down) stops the line: what is held after it
// waits for the person (go on with the next, or drop the rest). A member that needs the person, or
// waits, simply hasn't ended: the line waits with it. Members elsewhere (another folder, another
// computer, no place) never wait for each other.
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Bodies, LogEvent, Place, TaskCard, TaskGroupFrame, TaskGroupView, GroupMember, GroupOrder } from "@ducter/protocol";
import { GROUP_MEMBERS_MAX, GROUP_NAME_MAX, GROUPS_MAX, isHeld } from "@ducter/protocol";
import type { Runner, TaskRegistry } from "@ducter/protocol/src/internal.ts";
import { isActive } from "./registry.ts";

export const GROUPS_FILE = "task-groups.json";

/** What a held member opens with: task_open's input, kept until its turn. */
export type HeldOpen = Parameters<Runner["openTask"]>[0];

type Held = { key: string; title: string; at: string; open: HeldOpen; device?: string };
type Rec = Omit<TaskGroupView, "members"> & { members: ({ taskId: string } | Held)[]; doneAt?: string };

export interface TaskGroups {
  /** On hand's view: groups with two or more members, held ones by title only. */
  list(): TaskGroupView[];
  /** The group a task is in. */
  of(taskId: string): TaskGroupView | undefined;
  /** The partner's group by its name (task_open's `group`), this persona's live ones first. */
  named(persona: string, name: string): TaskGroupView | undefined;
  /** Whether a task_open into this group at this place would be held (another in its folder is ahead). */
  wouldHold(persona: string, name: string, place: Place | undefined): boolean;
  /**
   * task_open with a group: joins (or makes) the group; opens now, or holds it in line. Returns the
   * card when it opened, else where it waits.
   */
  open(persona: string, name: string, input: HeldOpen): Promise<{ card: TaskCard; group: TaskGroupView } | { held: true; key: string; after: string; group: TaskGroupView }>;
  /** Puts an existing task into a group by name (an early-opened first member, the person's words). */
  join(persona: string, name: string, taskIds: string[], by: "partner" | "you"): TaskGroupView | { error: string };
  /** A client's frame (On hand's hand path). */
  frame(f: TaskGroupFrame): Promise<{ ok: true; group?: TaskGroupView } | { ok: false; error: string }>;
  /** A Log event: a task ended, so the line may move. */
  onEvent(e: LogEvent): void;
  /** Opens what is due (after a restart, or a change of order). */
  pump(): Promise<void>;
}

export interface TaskGroupsDeps {
  dataDir: string;
  tasks: TaskRegistry;
  runner: () => Pick<Runner, "openTask"> | undefined;
  now?: () => number;
  changed?: () => void;
  newId?: () => string;
}

const clean = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, GROUP_NAME_MAX);
const same = (a: string, b: string) => a.toLocaleLowerCase() === b.toLocaleLowerCase();
const expand = (p: string) => p.replace(/\/+$/, "");
/** A part that is done for the line: its result came back (done_claimed is a task's done until it is merged, D216). */
export const doneForLine = (a: string | undefined) => a === "done" || a === "done_claimed" || a === "superseded";

/** Which line a place is in: its folder on its computer; none for a task with no folder. */
export function lineOf(place: Place | undefined): string | undefined {
  if (!place) return undefined;
  const dev = ("device" in place && place.device) || "local";
  if (place.kind === "repo") return `${dev}:${expand(place.repoPath)}`;
  if (place.kind === "folder") return `${dev}:${expand(place.path)}`;
  return undefined;
}

export function createTaskGroups(d: TaskGroupsDeps): TaskGroups {
  const file = join(d.dataDir, GROUPS_FILE);
  const now = d.now ?? Date.now;
  let seq = 0;
  const newId = d.newId ?? (() => `g${now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`);
  let groups: Rec[] = [];
  if (existsSync(file))
    try {
      const j = JSON.parse(readFileSync(file, "utf8")) as { groups?: Rec[] };
      groups = Array.isArray(j.groups) ? j.groups.filter((g) => g && typeof g.id === "string" && Array.isArray(g.members)) : [];
    } catch (err) {
      console.warn(`[groups] ${file} is unreadable; starting empty:`, (err as Error).message);
    }
  const save = () => {
    // The oldest finished groups go first when there are too many.
    if (groups.length > GROUPS_MAX) groups = [...groups.filter((g) => !g.doneAt), ...groups.filter((g) => g.doneAt).sort((a, b) => (b.doneAt! < a.doneAt! ? -1 : 1))].slice(0, GROUPS_MAX);
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify({ version: 1, groups }) + "\n", { mode: 0o600 });
    renameSync(tmp, file);
    d.changed?.();
  };
  const iso = () => new Date(now()).toISOString();
  const card = (id: string) => d.tasks.get(id);
  const view = (g: Rec): TaskGroupView => ({
    id: g.id,
    name: g.name,
    order: g.order,
    by: g.by,
    persona: g.persona,
    createdAt: g.createdAt,
    ...(g.stopped ? { stopped: g.stopped } : {}),
    members: g.members.map((m): GroupMember => (isHeld(m as GroupMember) ? { key: (m as Held).key, title: (m as Held).title, at: (m as Held).at, ...((m as Held).device ? { device: (m as Held).device } : {}) } : { taskId: (m as { taskId: string }).taskId })),
  });
  const placeOfMember = (m: Rec["members"][number]): Place | undefined => ("key" in m ? m.open.place : card(m.taskId)?.place);
  const groupOf = (taskId: string) => groups.find((g) => g.members.some((m) => !("key" in m) && m.taskId === taskId));
  const live = (g: Rec) => !g.doneAt;
  const named = (persona: string, name: string) => {
    const n = clean(name);
    return groups.find((g) => live(g) && g.persona === persona && same(g.name, n));
  };

  /** The member a held one waits for: the nearest one before it in its line, or none. */
  function ahead(g: Rec, i: number): Rec["members"][number] | undefined {
    if (g.order === "side_by_side") return undefined;
    const line = lineOf(placeOfMember(g.members[i]!));
    if (!line) return undefined;
    for (let k = i - 1; k >= 0; k--) {
      const m = g.members[k]!;
      if (lineOf(placeOfMember(m)) === line) return m;
    }
    return undefined;
  }

  /** Whether what is ahead lets this one start: nothing ahead, or it is a task that is done. */
  function clear(g: Rec, i: number): "go" | "wait" | { stop: string; why: "failed" | "dropped" } {
    const a = ahead(g, i);
    if (!a) return "go";
    if ("key" in a) return "wait";
    const c = card(a.taskId);
    if (!c) return "go"; // a task the registry no longer knows can't hold the line
    if (doneForLine(c.attention)) return "go";
    if (isActive(c.attention)) return "wait";
    return { stop: a.taskId, why: c.attention === "failed" ? "failed" : "dropped" };
  }

  /** The held member's input, from the one before it in its line: its unmerged branch, and a line in the brief. */
  function withBefore(g: Rec, i: number, h: Held): HeldOpen {
    const a = ahead(g, i);
    const prev = a && !("key" in a) ? card(a.taskId) : undefined;
    const step = g.members.filter((m) => lineOf(placeOfMember(m)) === lineOf(h.open.place)).indexOf(g.members[i]!) + 1;
    const of = g.members.filter((m) => lineOf(placeOfMember(m)) === lineOf(h.open.place)).length;
    let place = h.open.place;
    let from = "";
    if (prev && prev.place.kind === "repo" && place?.kind === "repo" && prev.place.branch && prev.integrated?.act !== "merge") {
      place = { ...place, baseBranch: prev.place.branch };
      from = ` It starts from the branch of the one before it ("${prev.title}", ${prev.place.branch}), which isn't merged yet.`;
    } else if (prev) from = ` The one before it ("${prev.title}") is done${prev.integrated?.act === "merge" ? " and merged" : ""}.`;
    const said = prev?.lastReport?.summary ? ` What it reported: ${prev.lastReport.summary.slice(0, 600)}` : "";
    const head = `This is part ${step} of ${of} of "${g.name}", one piece of work done one task after another.${from}${said}`;
    return { ...h.open, ...(place ? { place } : {}), brief: `${head}\n\n${h.open.brief}` };
  }

  let pumping: Promise<void> | undefined;
  let again = false;
  async function pump(): Promise<void> {
    if (pumping) return void (again = true);
    pumping = (async () => {
      do {
        again = false;
        let touched = false;
        for (const g of groups) {
          if (!live(g)) continue;
          for (let i = 0; i < g.members.length; i++) {
            const m = g.members[i]!;
            if (!("key" in m)) continue;
            const c = clear(g, i);
            if (c === "wait") continue;
            if (typeof c === "object") {
              if (!g.stopped || g.stopped.taskId !== c.stop) (g.stopped = { taskId: c.stop, why: c.why }), (touched = true);
              continue;
            }
            const r = d.runner();
            if (!r) break; // no agent yet: the next event or restart opens it
            try {
              const opened = await r.openTask(withBefore(g, i, m));
              g.members[i] = { taskId: opened.taskId };
              touched = true;
            } catch (err) {
              console.warn(`[groups] couldn't open "${m.title}" in "${g.name}":`, (err as Error).message);
              break;
            }
          }
          if (g.stopped) {
            const s = card(g.stopped.taskId);
            if (s && (doneForLine(s.attention) || isActive(s.attention))) delete g.stopped, (touched = true), (again = true);
          }
          // Finished: every member a task that has ended (kept for the board's day, pruned later).
          const ended = g.members.every((x) => !("key" in x) && (() => { const c = card(x.taskId); return !c || doneForLine(c.attention) || !isActive(c.attention); })());
          if (ended && !g.doneAt) (g.doneAt = iso()), (touched = true);
          if (!ended && g.doneAt) delete g.doneAt, (touched = true);
        }
        if (touched) save();
      } while (again);
    })().finally(() => (pumping = undefined));
    return pumping;
  }

  function make(persona: string, name: string, by: "partner" | "you"): Rec {
    const g: Rec = { id: newId(), name: clean(name) || "…", order: "one_by_one", by, persona, members: [], createdAt: iso() };
    groups.push(g);
    return g;
  }

  function take(taskIds: string[], into: Rec) {
    for (const id of taskIds) {
      const was = groupOf(id);
      if (was === into) continue;
      if (was) was.members = was.members.filter((m) => "key" in m || m.taskId !== id);
      if (into.members.length < GROUP_MEMBERS_MAX) into.members.push({ taskId: id });
    }
    // A group left with one member is no longer a group.
    groups = groups.filter((g) => g === into || g.members.length >= 2 || g.members.some((m) => "key" in m));
  }

  const api: TaskGroups = {
    list: () => groups.filter((g) => g.members.length >= 2).map(view),
    of: (taskId) => ((g) => (g ? view(g) : undefined))(groupOf(taskId)),
    named: (persona, name) => ((g) => (g ? view(g) : undefined))(named(persona, name)),
    wouldHold(persona, name, place) {
      const g = named(persona, name);
      if (!g || g.order === "side_by_side") return false;
      const line = lineOf(place);
      if (!line) return false;
      return g.members.some((m) => {
        if (lineOf(placeOfMember(m)) !== line) return false;
        if ("key" in m) return true;
        const c = card(m.taskId);
        return !!c && !doneForLine(c.attention);
      });
    },
    async open(persona, name, input) {
      const g = named(persona, name) ?? make(persona, name, "partner");
      if (g.members.length >= GROUP_MEMBERS_MAX) throw new Error(`a group holds at most ${GROUP_MEMBERS_MAX} tasks`);
      if (api.wouldHold(persona, g.name, input.place)) {
        const key = `h${newId()}`;
        const prev = [...g.members].reverse().find((m) => lineOf(placeOfMember(m)) === lineOf(input.place));
        const prevDev = prev ? (("device" in (placeOfMember(prev) ?? {}) && (placeOfMember(prev) as { device?: string }).device) || "local") : "local";
        const dev = (input.place && "device" in input.place && input.place.device) || "local";
        g.members.push({ key, title: input.title, at: iso(), open: input, ...(dev !== prevDev ? { device: dev } : {}) });
        delete g.doneAt;
        save();
        const after = prev ? ("key" in prev ? prev.title : (card(prev.taskId)?.title ?? "")) : "";
        return { held: true, key, after, group: view(g) };
      }
      const c = await d.runner()!.openTask(input);
      g.members.push({ taskId: c.taskId });
      delete g.doneAt;
      save();
      return { card: c, group: view(g) };
    },
    join(persona, name, taskIds, by) {
      const ids = taskIds.filter((id) => card(id));
      if (!ids.length) return { error: "no such task" };
      const g = named(persona, name) ?? make(persona, name, by);
      take(ids, g);
      if (!groups.includes(g)) return { error: "a group needs two tasks" };
      delete g.doneAt;
      save();
      return view(g);
    },
    async frame(f) {
      const g = f.groupId ? groups.find((x) => x.id === f.groupId) : undefined;
      if (f.op !== "make" && !g) return { ok: false, error: "That group isn't there any more." };
      switch (f.op) {
        case "make": {
          const ids = (f.taskIds ?? []).filter((id) => typeof id === "string" && card(id)).slice(0, GROUP_MEMBERS_MAX);
          if (ids.length < 2) return { ok: false, error: "A group needs two tasks." };
          const persona = card(ids[0]!)!.persona;
          const n = make(persona, clean(f.name) || card(ids[0]!)!.title.slice(0, GROUP_NAME_MAX), "you");
          take(ids, n);
          save();
          return { ok: true, group: view(n) };
        }
        case "add": {
          take((f.taskIds ?? []).filter((id) => card(id)), g!);
          save();
          return { ok: true, group: view(g!) };
        }
        case "rename": {
          const n = clean(f.name);
          if (!n) return { ok: false, error: "A group needs a name." };
          g!.name = n;
          save();
          return { ok: true, group: view(g!) };
        }
        case "remove": {
          const k = g!.members.findIndex((m) => ("key" in m ? m.key : m.taskId) === f.member);
          if (k < 0) return { ok: false, error: "That isn't in this group." };
          const [m] = g!.members.splice(k, 1);
          // A held member taken out is not dropped: it opens now, on its own.
          if (m && "key" in m) {
            const r = d.runner();
            if (r) await r.openTask(m.open).catch((err) => console.warn(`[groups] couldn't open "${m.title}":`, (err as Error).message));
          }
          if (g!.members.length < 2 && !g!.members.some((x) => "key" in x)) groups = groups.filter((x) => x !== g);
          save();
          await pump();
          return { ok: true };
        }
        case "dissolve": {
          groups = groups.filter((x) => x !== g);
          // Held members open now, on their own: taking the group apart never loses work it was given.
          const r = d.runner();
          for (const m of g!.members) if ("key" in m && r) await r.openTask(m.open).catch((err) => console.warn(`[groups] couldn't open "${m.title}":`, (err as Error).message));
          save();
          return { ok: true };
        }
        case "move": {
          const held = g!.members.filter((m): m is Held => "key" in m);
          const from = held.findIndex((m) => m.key === f.member);
          if (from < 0) return { ok: false, error: "Only what hasn't started yet moves." };
          const to = Math.max(0, Math.min(held.length - 1, Math.floor(Number(f.to ?? 0))));
          const [m] = held.splice(from, 1);
          held.splice(to, 0, m!);
          const tasks = g!.members.filter((x) => !("key" in x));
          g!.members = [...tasks, ...held];
          save();
          await pump();
          return { ok: true, group: view(g!) };
        }
        case "order": {
          if (f.order !== "one_by_one" && f.order !== "side_by_side") return { ok: false, error: "unknown order" };
          g!.order = f.order as GroupOrder;
          if (f.order === "side_by_side") delete g!.stopped;
          save();
          await pump();
          return { ok: true, group: view(g!) };
        }
        case "next": {
          // Go on with the next: the stopped one no longer holds its line.
          const s = g!.stopped;
          if (!s) return { ok: true, group: view(g!) };
          const k = g!.members.findIndex((m) => !("key" in m) && m.taskId === s.taskId);
          const next = g!.members.findIndex((m, i) => i > k && "key" in m && lineOf(m.open.place) === lineOf(card(s.taskId)?.place));
          delete g!.stopped;
          if (next >= 0) {
            const h = g!.members[next] as Held;
            const r = d.runner();
            if (!r) return { ok: false, error: "No agent is here to start it." };
            const opened = await r.openTask({ ...h.open, brief: `This is the next part of "${g!.name}". The part before it ("${card(s.taskId)?.title ?? ""}") didn't finish; the person said to go on without it.\n\n${h.open.brief}` });
            g!.members[next] = { taskId: opened.taskId };
          }
          save();
          await pump();
          return { ok: true, group: view(g!) };
        }
        case "drop_rest": {
          g!.members = g!.members.filter((m) => !("key" in m));
          delete g!.stopped;
          if (g!.members.length < 2) groups = groups.filter((x) => x !== g);
          save();
          return { ok: true };
        }
      }
      return { ok: false, error: "unknown op" };
    },
    onEvent(e) {
      if (e.kind !== "task_state") return;
      const id = (e.body as Bodies["task_state"]).taskId;
      if (groupOf(id)) void pump();
    },
    pump,
  };
  return api;
}
