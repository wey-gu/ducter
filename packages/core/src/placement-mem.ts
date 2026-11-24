// D538: the person's computer rules, optionally in Nowledge Mem. Ducter's own rules.json stays the
// source of truth (inspectable, deterministic, what placement reads). While Mem is on, each computer
// rule is also written to Mem as the person's own preference in their Space (label
// computer-placement, source_app ducter, one memory per rule: an upsert by a stable id), so the
// person's other agents outside Ducter know "heavy jobs go to haswell" too; a rule removed here is
// archived there. It is never written into the partner's Mem AI Identity (D141): who the partner is
// (its voice, name, what it knows of the person) is not where the person's work runs.
//
// The other way: memories with that label that Ducter didn't write from this home (said to another
// agent, or kept by another Ducter) are hints. The partner hears each once in [devices] and may
// offer to keep it as a rule here; nothing becomes a rule silently.
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RuleView } from "@ducter/protocol";
import type { RulesStore } from "./rules.ts";

export const PLACEMENT_LABEL = "computer-placement";
const FILE = "placement-mem.json";
/** How often Mem's labelled memories are read for hints (and at start). */
export const HINTS_EVERY_MS = 30 * 60_000;

/** What the mirror needs of a Mem client (the partner's nmem client fits; tests pass a fake). */
export interface PlacementMemClient {
  add(m: { id: string; title: string; content: string; labels: string[]; unitType: "preference"; importance: number; provenance: { persona: string } }): Promise<{ ok: true; id?: string } | { ok: false }>;
  archive?(id: string): Promise<boolean>;
  labeled?(label: string, limit: number): Promise<{ ok: true; hits: { id?: string; title: string; content: string }[] } | { ok: false }>;
}

interface Kept {
  /** rule id → the memory it is mirrored to, and the words it was written with. */
  mirrored: Record<string, { mem: string; text: string }>;
  /** Mem ids already offered to the partner as hints (each once). */
  offered: string[];
}

/** The memory's id for one rule: stable, so a changed rule updates its memory (`nmem m add --id`). */
export const memIdFor = (ruleId: string) => `ducter-placement-${ruleId.replace(/[^A-Za-z0-9_-]/g, "")}`.slice(0, 80);

/** The memory's words: a statement about the person, never an order (memory.md), with their own words. */
export function memWords(r: RuleView): { title: string; content: string } {
  const what = r.where?.heavy ? "heavy work (builds, test suites, type checks, browsers)" : r.where?.web ? "work on web pages" : "their work";
  return {
    title: r.text,
    content: `Prefers ${what} to run ${r.where?.avoid ? "less" : "more"} on the computer "${r.device}". In their words: "${r.text}". (Kept in Ducter as a computer rule.)`,
  };
}

export function createPlacementMem(o: { dataDir: string; rules: RulesStore; on: () => boolean; client: () => PlacementMemClient | undefined; persona: () => string; now?: () => number }) {
  const path = join(o.dataDir, FILE);
  let kept: Kept = { mirrored: {}, offered: [] };
  try {
    if (existsSync(path)) {
      const raw = JSON.parse(readFileSync(path, "utf8"));
      kept = { mirrored: raw?.mirrored && typeof raw.mirrored === "object" ? raw.mirrored : {}, offered: Array.isArray(raw?.offered) ? raw.offered.filter((x: unknown) => typeof x === "string").slice(-200) : [] };
    }
  } catch {
    /* unreadable: start over (the next sync writes each memory again under the same id) */
  }
  const save = () => {
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, JSON.stringify(kept, null, 2) + "\n", { mode: 0o600 });
    renameSync(tmp, path);
  };
  let syncing: Promise<void> | undefined;
  let again = false;
  let hints: { id: string; text: string }[] = [];
  let hintsAt = 0;
  const now = o.now ?? Date.now;

  const syncOnce = async () => {
    const c = o.client();
    if (!c || !o.on()) return;
    const rules = o.rules.list().filter((r) => r.where && r.device);
    const live = new Set(rules.map((r) => r.id));
    for (const r of rules) {
      const had = kept.mirrored[r.id];
      if (had && had.text === r.text && r.where?.mem) continue;
      const w = memWords(r);
      const res = await c.add({ id: memIdFor(r.id), ...w, labels: [PLACEMENT_LABEL], unitType: "preference", importance: 0.7, provenance: { persona: o.persona() } }).catch(() => ({ ok: false as const }));
      if (!res.ok) continue; // Mem away: tried again on the next change or start
      const mem = res.id ?? memIdFor(r.id);
      kept.mirrored[r.id] = { mem, text: r.text };
      o.rules.setMem(r.id, mem);
      save();
    }
    for (const [id, m] of Object.entries(kept.mirrored)) {
      if (live.has(id)) continue;
      const done = c.archive ? await c.archive(m.mem).catch(() => false) : true;
      if (!done) continue;
      delete kept.mirrored[id];
      save();
    }
  };

  const api = {
    /** Mirror the rules now (after a change, at start); one at a time, a change during it runs again. */
    sync(): Promise<void> {
      if (syncing) {
        again = true;
        return syncing;
      }
      syncing = (async () => {
        do {
          again = false;
          await syncOnce();
        } while (again);
      })().finally(() => (syncing = undefined));
      return syncing;
    },
    /** Read Mem's labelled memories for hints (at most every HINTS_EVERY_MS unless forced). */
    async refreshHints(force = false): Promise<void> {
      const c = o.client();
      if (!c?.labeled || !o.on() || (!force && now() - hintsAt < HINTS_EVERY_MS)) return;
      hintsAt = now();
      const r = await c.labeled(PLACEMENT_LABEL, 20).catch(() => ({ ok: false as const }));
      if (!r.ok) return;
      const mine = new Set(Object.values(kept.mirrored).map((m) => m.mem));
      hints = r.hits.filter((h) => h.id && !mine.has(h.id)).map((h) => ({ id: h.id!, text: (h.content || h.title).slice(0, 200) }));
    },
    /** The hints not offered yet; each is marked offered as it is handed out (the partner hears it once). */
    takeHints(): { text: string }[] {
      if (!o.on()) return [];
      const fresh = hints.filter((h) => !kept.offered.includes(h.id)).slice(0, 2);
      if (!fresh.length) return [];
      kept.offered = [...kept.offered, ...fresh.map((h) => h.id)].slice(-200);
      save();
      return fresh.map((h) => ({ text: h.text }));
    },
  };
  return api;
}
