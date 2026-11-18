// D368: Nowledge Mem's Working Memory (the person's daily focus areas, its briefing, what waits for their
// decision) reaches the partner as an L4 delta (design/system.md "Identity and Mem boundary",
// design/memory.md "Working Memory"), and the morning note ranks by it. Read-only: `nmem --json
// working-memory read`, with the home's own nmem and sign-in, at most once per TTL, in the background
// (a turn never waits for it), never on a test without a fake nmem (core.ts gates it like the glance).
// What comes back is the person's own notes, kept by another app: data, never instructions; the partner
// fences it as such (packages/partner/src/render.ts renderWorkingMemory). Nothing here writes Mem.
import { createHash } from "node:crypto";
import type { WorkingMemoryPort, WorkingMemoryView } from "@ducter/protocol/src/internal.ts";
import type { NmemCall } from "./bridge-link.ts";

export type { WorkingMemoryView };

/** Mem rewrites it about once a day; a look every half hour catches a change the same morning. */
const TTL_MS = 30 * 60_000;
/** A Working Memory older than this many days is no one's focus any more: not given. */
export const STALE_DAYS = 3;
export const FOCUS_MAX = 4;
export const AWAITING_MAX = 3;
const FLAGS_MAX = 3;

/** One line of someone else's text, safe to put inside a fence: no control characters, no angle brackets, clipped. */
export function oneLine(s: unknown, n: number): string {
  if (typeof s !== "string") return "";
  const t = s
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[<>]/g, " ")
    .replace(/\*\*|__|`/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return t.length <= n ? t : t.slice(0, n - 1).trimEnd() + "…";
}

/** A ruling or a flag: Mem gives strings or objects; the words of either. */
function itemText(x: unknown, n: number): string {
  if (typeof x === "string") return oneLine(x, n);
  if (x && typeof x === "object") {
    const o = x as Record<string, unknown>;
    for (const k of ["title", "question", "summary", "text", "name", "description"]) if (typeof o[k] === "string" && o[k]) return oneLine(o[k], n);
  }
  return "";
}

/** `nmem --json working-memory read` → what the partner may see; undefined when there is none or it isn't one. */
export function parseWorkingMemory(out: string): WorkingMemoryView | undefined {
  let j: any;
  try {
    j = JSON.parse(out);
  } catch {
    return undefined;
  }
  if (!j || typeof j !== "object" || j.exists === false) return undefined;
  const p = j.parsed && typeof j.parsed === "object" ? j.parsed : {};
  const date = typeof j.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(j.date) ? j.date : undefined;
  if (!date) return undefined;
  const focus = (Array.isArray(p.focus_areas) ? p.focus_areas : [])
    .map((f: any) => ({ name: oneLine(f?.name, 60), about: oneLine(f?.description, 200) }))
    .filter((f: { name: string }) => f.name)
    .slice(0, FOCUS_MAX)
    .map((f: { name: string; about: string }) => (f.about ? f : { name: f.name }));
  const briefing = oneLine(p.briefing, 320);
  const awaitingAll = (Array.isArray(p.awaiting_rulings) ? p.awaiting_rulings : []).map((x: unknown) => itemText(x, 140)).filter(Boolean);
  const awaiting = awaitingAll.slice(0, AWAITING_MAX);
  const more = (awaitingAll.length - awaiting.length) + (Number.isInteger(p.awaiting_rulings_more) && p.awaiting_rulings_more > 0 ? p.awaiting_rulings_more : 0);
  const flags = (Array.isArray(p.flags) ? p.flags : []).map((x: unknown) => itemText(x, 140)).filter(Boolean).slice(0, FLAGS_MAX);
  if (!focus.length && !briefing && !awaiting.length && !flags.length) return undefined;
  const view: WorkingMemoryView = { date, key: "", focus, awaiting, flags, ...(briefing ? { briefing } : {}), ...(more > 0 ? { awaitingMore: more } : {}) };
  // What the partner was given changes only when what it would see changes (not Mem's epoch alone).
  view.key = createHash("sha256").update(JSON.stringify({ ...view, key: "" })).digest("hex").slice(0, 16);
  return view;
}

/** Days from a's date to b's (YYYY-MM-DD, UTC midnights). */
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/**
 * The focus names as words to match a find against: Latin words of 3+ letters, CJK runs of 2+
 * characters, lowercased; the person's own names for what they're on ("Ducter", "HawDB 发布").
 */
export function focusTerms(v: WorkingMemoryView | undefined): string[] {
  if (!v) return [];
  const out = new Set<string>();
  for (const f of v.focus) for (const m of f.name.toLowerCase().matchAll(/[a-z0-9][a-z0-9.+-]{2,}|[\p{Script=Han}]{2,}/gu)) if (!COMMON.has(m[0])) out.add(m[0]);
  return [...out];
}

/** Words in a focus name that say nothing about what it is. */
const COMMON = new Set(["the", "and", "for", "with", "from", "into", "this", "that", "next", "week", "work", "project", "release", "follow-up", "todo", "工作", "项目", "这周", "本周"]);

/** Whether a find's words touch one of the focus terms. */
export function touchesFocus(text: string, terms: readonly string[]): boolean {
  if (!terms.length) return false;
  const t = text.toLowerCase();
  return terms.some((w) => t.includes(w));
}

export function createWorkingMemory(opts: {
  run: NmemCall;
  on: () => boolean;
  /** The persona's chosen Space (D141), read on each look; absent: Mem's default, as `nmem` reads it. */
  space?: () => string | undefined;
  now?: () => number;
  ttlMs?: number;
  /** Today in the person's zone (YYYY-MM-DD), for staleness. */
  today?: () => string;
  changed?: (v: WorkingMemoryView | undefined) => void;
}): WorkingMemoryPort {
  const now = opts.now ?? Date.now;
  const ttl = opts.ttlMs ?? TTL_MS;
  const today = opts.today ?? (() => new Date(now()).toISOString().slice(0, 10));
  let last: WorkingMemoryView | undefined;
  let at: number | undefined;
  let loading: Promise<WorkingMemoryView | undefined> | undefined;
  const fresh = (v: WorkingMemoryView | undefined) => (v && daysBetween(v.date, today()) <= STALE_DAYS ? v : undefined);
  const refresh = (): Promise<WorkingMemoryView | undefined> => {
    if (!opts.on()) return Promise.resolve(undefined);
    if (loading) return loading;
    loading = (async () => {
      const space = opts.space?.();
      const r = await opts.run(["working-memory", "read", ...(space ? ["--space", space] : [])]).catch(() => undefined);
      at = now();
      // Mem away or slow: what it said last still holds (it is a day's focus, not a live reading).
      if (!r || r.code !== 0) return fresh(last);
      const v = parseWorkingMemory(r.out);
      if ((v?.key ?? "") !== (last?.key ?? "")) {
        last = v;
        opts.changed?.(v);
      }
      return fresh(last);
    })().finally(() => (loading = undefined));
    return loading;
  };
  return {
    get() {
      if (!opts.on()) return undefined;
      if (at === undefined || now() - at >= ttl) void refresh();
      return fresh(last);
    },
    refresh,
    async ready(ms) {
      if (!opts.on()) return undefined;
      if (at !== undefined && now() - at < ttl) return fresh(last);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const late = new Promise<undefined>((res) => (timer = setTimeout(() => res(undefined), ms)));
      const v = await Promise.race([refresh(), late]);
      clearTimeout(timer);
      return v ?? fresh(last);
    },
  };
}
