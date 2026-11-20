// D329: Nowledge Mem down is not Ducter down. A save while Mem is installed and signed in but doesn't
// answer (the app closed, the network gone, Cloud slow) waits here instead of being dropped, under a key
// made from what it is (persona, Log seq, words), and goes in when Mem answers again: on the next call
// that works, and every few minutes. The replay names that key as Mem's own upsert id (`nmem m add
// --id`), so a save Mem took on a try that seemed to fail is still one memory. Mem not installed or not
// signed in is not "down": nothing waits for a Mem that isn't there.
//
// The file (<partner dir>/mem-outbox.json, 0600) holds what waits and, for a while, what went in (its
// Mem id, so 撤销 / Undo on a line that waited still finds it). Memories are an index of the Log, never
// its only copy: a save that waited 30 days is let go, and the Noted line stays in the conversation.
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname } from "node:path";
import type { MemoryAdd, MemoryClient } from "./memory.ts";

export const OUTBOX_EVERY_MS = 5 * 60_000;
/** A save that waited this long is let go (the Noted line and the Log keep it). */
export const OUTBOX_KEEP_MS = 30 * 86_400_000;
/** What went in is remembered this long (an Undo on a line that waited). */
const DONE_KEEP = 100;

interface Entry {
  key: string;
  add: Omit<MemoryAdd, "id" | "plain">;
  at: string;
  tries: number;
  /** Mem refused the upsert key once: the next try writes without it. */
  plainNext?: true;
  /** Went in: Mem's id, and when. */
  id?: string;
  doneAt?: string;
}

export interface Outbox extends MemoryClient {
  /** Keys still waiting for Mem. */
  waiting(): Set<string>;
  /** The Mem id a waited save got once it went in. */
  idOf(key: string): string | undefined;
  /** Takes a waiting save back before it reaches Mem (Undo); true when it was still waiting. */
  drop(key: string): boolean;
  /** Tries every waiting save once, in order; how many went in. */
  flush(): Promise<number>;
  stop(): void;
}

/** The key a save waits under: the same save is always the same key, shaped as a UUID for Mem's --id. */
export function outboxKey(m: Pick<MemoryAdd, "title" | "content" | "provenance">): string {
  const h = createHash("sha256").update(JSON.stringify([m.provenance.persona, m.provenance.logSeq ?? null, m.provenance.taskId ?? null, m.title, m.content])).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-8${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export function withOutbox(inner: MemoryClient, o: { file: string; now?: () => number; everyMs?: number; onChange?: () => void }): Outbox {
  const now = o.now ?? Date.now;
  let entries: Entry[] = [];
  try {
    if (existsSync(o.file)) {
      const j = JSON.parse(readFileSync(o.file, "utf8"));
      if (Array.isArray(j?.entries)) entries = j.entries.filter((e: any) => typeof e?.key === "string" && e?.add && typeof e.add.title === "string");
    }
  } catch {
    entries = [];
  }
  const save = () => {
    try {
      mkdirSync(dirname(o.file), { recursive: true });
      const tmp = `${o.file}.tmp`;
      writeFileSync(tmp, JSON.stringify({ entries }, null, 2) + "\n", { mode: 0o600 });
      chmodSync(tmp, 0o600);
      renameSync(tmp, o.file);
    } catch (err) {
      console.warn("[outbox] could not keep the outbox:", (err as Error).message);
    }
  };
  const changed = () => {
    save();
    o.onChange?.();
  };
  const pending = () => entries.filter((e) => !e.doneAt);

  let flushing: Promise<number> | undefined;
  const flush = (): Promise<number> => {
    if (flushing) return flushing;
    if (!pending().length) return Promise.resolve(0);
    flushing = (async () => {
      let went = 0;
      let dirty = false;
      for (const e of pending()) {
        if (now() - Date.parse(e.at) > OUTBOX_KEEP_MS) {
          entries = entries.filter((x) => x !== e);
          dirty = true;
          continue;
        }
        e.tries++;
        dirty = true;
        const r = await inner.add({ ...e.add, plain: true, ...(e.plainNext ? {} : { id: e.key }) }).catch(() => ({ ok: false as const, reason: "unavailable" as const, message: "" }));
        if (r.ok) {
          e.id = r.id ?? (e.plainNext ? undefined : e.key);
          e.doneAt = new Date(now()).toISOString();
          went++;
          continue;
        }
        if (r.reason === "rejected" && !e.plainNext) {
          e.plainNext = true; // Mem refused the key itself: once more without it, next time
          continue;
        }
        if (r.reason === "rejected") {
          entries = entries.filter((x) => x !== e); // Mem refuses it as it is: let it go
          continue;
        }
        break; // still down: the rest wait too
      }
      const done = entries.filter((e) => e.doneAt);
      if (done.length > DONE_KEEP) entries = [...entries.filter((e) => !e.doneAt), ...done.slice(-DONE_KEEP)];
      if (dirty) changed();
      return went;
    })().finally(() => (flushing = undefined));
    return flushing;
  };
  const kick = () => {
    if (pending().length) void flush().catch(() => {});
  };

  const every = o.everyMs ?? OUTBOX_EVERY_MS;
  const timer = every > 0 ? setInterval(kick, every) : undefined;
  (timer as any)?.unref?.();

  const box: Outbox = {
    async search(q, n) {
      const r = await inner.search(q, n);
      if (r.ok) kick();
      return r;
    },
    async add(m) {
      const r = await inner.add(m);
      if (r.ok) {
        kick();
        return r;
      }
      if (r.reason !== "unavailable") return r;
      const key = outboxKey(m);
      if (!entries.some((e) => e.key === key)) {
        const { id: _id, plain: _plain, ...add } = m;
        entries.push({ key, add, at: new Date(now()).toISOString(), tries: 1 });
        changed();
      }
      return { ok: true, waiting: key };
    },
    ...(inner.about ? { about: () => inner.about!() } : {}),
    ...(inner.threads ? { threads: (q: string, n: number) => inner.threads!(q, n) } : {}),
    ...(inner.forget ? { forget: (id: string) => inner.forget!(id) } : {}),
    ...(inner.correct ? { correct: (id: string, t: string) => inner.correct!(id, t) } : {}),
    ...(inner.archive ? { archive: (id: string) => inner.archive!(id) } : {}),
    ...(inner.restore ? { restore: (id: string, p: MemoryAdd["provenance"]) => inner.restore!(id, p) } : {}),
    waiting: () => new Set(pending().map((e) => e.key)),
    idOf: (key) => entries.find((e) => e.key === key)?.id,
    drop(key) {
      const e = entries.find((x) => x.key === key && !x.doneAt);
      if (!e) return false;
      entries = entries.filter((x) => x !== e);
      changed();
      return true;
    },
    flush,
    stop: () => clearInterval(timer),
  };
  return box;
}
