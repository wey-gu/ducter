// D-PENDING (research/245 §3.5): saved views, kept on the home so every device has them. A view is
// the list's filter, its sort and its mode with a name the person gave it. The file is user data
// like projects.json and settings.json: read once, written whole, never in the Log.
//
// The three built-ins are not kept here (protocol BUILTIN_VIEWS): they are always offered and drawn
// only while they have rows, so saving one is not needed and ending all its rows hides it again.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { VIEW_NAME_MAX, type BoardMode, type BoardView, type TaskFilter, type TaskSort } from "@ducter/protocol";

export interface Views {
  /** The person's saved views, oldest first. */
  list(): BoardView[];
  /** Add or replace one by its id (a fresh name makes one). */
  save(raw: BoardView): { ok: true; view: BoardView; views: BoardView[] } | { ok: false; error: string };
  /** Remove one of the person's views. */
  remove(id: string): { ok: true; views: BoardView[] } | { ok: false; error: string };
}

const MODES: BoardMode[] = ["overview", "list"];
const SORTS: TaskSort[] = ["urgency", "changed", "age"];
const STATES: NonNullable<TaskFilter["state"]>[] = ["needs_you", "stopped", "working", "waiting", "done"];
const isString = (v: unknown): v is string => typeof v === "string" && v.length > 0;

/** One view as the wire sent it, kept only where it is well formed (the home never trusts a client
 *  blindly, and a bad field is dropped rather than kept forever). */
export function cleanView(raw: unknown): BoardView | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const v = raw as Partial<BoardView>;
  const f = (v.filter ?? {}) as TaskFilter;
  const name = typeof v.name === "string" ? v.name.trim().slice(0, VIEW_NAME_MAX) : "";
  if (!name) return undefined;
  const filter: TaskFilter = {
    ...(isString(f.state) && STATES.includes(f.state as NonNullable<TaskFilter["state"]>) ? { state: f.state } : {}),
    ...(isString(f.project) ? { project: f.project.slice(0, 240) } : {}),
    ...(isString(f.computer) ? { computer: f.computer.slice(0, 120) } : {}),
    ...(isString(f.agent) ? { agent: f.agent.slice(0, 80) } : {}),
    ...(isString(f.source) ? { source: f.source.slice(0, 120) } : {}),
    ...(f.long === true ? { long: true } : {}),
    ...(f.pr === true ? { pr: true } : {}),
  };
  const sort = SORTS.includes(v.sort as TaskSort) ? (v.sort as TaskSort) : "urgency";
  const mode = MODES.includes(v.mode as BoardMode) ? (v.mode as BoardMode) : "list";
  const id = isString(v.id) ? v.id.slice(0, 80) : `v_${name.replace(/\s+/g, "-").slice(0, 40)}_${Date.now().toString(36)}`;
  return { id, name, filter, sort, mode };
}

export function createViews(opts: { dataDir: string; onChange?: () => void }): Views {
  const file = join(opts.dataDir, "views.json");
  let items: BoardView[] = [];
  try {
    if (existsSync(file)) {
      const j = JSON.parse(readFileSync(file, "utf8")) as { views?: unknown[] };
      items = Array.isArray(j.views) ? j.views.map(cleanView).filter((v): v is BoardView => !!v) : [];
    }
  } catch {
    items = [];
  }
  const save = () => {
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify({ version: 1, views: items }, null, 2));
    renameSync(tmp, file);
  };
  const list = () => items.map((v) => ({ ...v, filter: { ...v.filter } }));
  return {
    list,
    save(raw) {
      const v = cleanView(raw);
      if (!v) return { ok: false, error: "A view needs a name." };
      const at = items.findIndex((x) => x.id === v.id || x.name === v.name);
      if (at >= 0) items[at] = v;
      else {
        if (items.length >= 40) return { ok: false, error: "That is a lot of views. Remove one first." };
        items.push(v);
      }
      try {
        save();
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
      opts.onChange?.();
      return { ok: true, view: v, views: list() };
    },
    remove(id) {
      const at = items.findIndex((x) => x.id === id);
      if (at < 0) return { ok: false, error: "I can't find that view." };
      items = items.filter((x) => x.id !== id);
      try {
        save();
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
      opts.onChange?.();
      return { ok: true, views: list() };
    },
  };
}
