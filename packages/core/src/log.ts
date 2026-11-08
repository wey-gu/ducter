// The Log: append-only SQLite event store with gapless seq and an FTS5 (trigram) index.
import { Database } from "bun:sqlite";
import type { EventKind, LogEvent } from "@ducter/protocol";
import type { AppendInput, LogStore } from "@ducter/protocol/src/internal.ts";
import { realClock, type Clock } from "./clock.ts";

export interface SqliteLog extends LogStore {
  close(): void;
}

interface Row {
  seq: number;
  ts: string;
  persona: string;
  stream: string;
  origin: string;
  kind: string;
  body: string;
  supersedes: number | null;
}

const MAX_INDEXED_CHARS = 16_000;

/** Collects searchable text from an event body (skips raw harness payloads). */
export function textOf(body: unknown): string {
  const out: string[] = [];
  let size = 0;
  const walk = (v: unknown, key?: string) => {
    if (size > MAX_INDEXED_CHARS || key === "raw") return;
    if (typeof v === "string") {
      out.push(v);
      size += v.length;
    } else if (Array.isArray(v)) v.forEach((x) => walk(x));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, k);
  };
  walk(body);
  return out.join("\n").slice(0, MAX_INDEXED_CHARS);
}

export function openLog(opts: { path: string; persona: string; clock?: Clock }): SqliteLog {
  const clock = opts.clock ?? realClock;
  const db = new Database(opts.path, { create: true });
  db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      seq INTEGER PRIMARY KEY,
      ts TEXT NOT NULL,
      persona TEXT NOT NULL,
      stream TEXT NOT NULL,
      origin TEXT NOT NULL,
      kind TEXT NOT NULL,
      body TEXT NOT NULL,
      supersedes INTEGER
    );
    CREATE INDEX IF NOT EXISTS events_stream ON events(stream, seq);
    CREATE INDEX IF NOT EXISTS events_kind ON events(kind, seq);
    CREATE VIRTUAL TABLE IF NOT EXISTS events_fts USING fts5(text, tokenize = 'trigram');
  `);

  const insert = db.prepare(
    "INSERT INTO events (seq, ts, persona, stream, origin, kind, body, supersedes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const insertFts = db.prepare("INSERT INTO events_fts (rowid, text) VALUES (?, ?)");
  const maxSeq = db.query("SELECT COALESCE(MAX(seq), 0) AS h FROM events");
  let headSeq = (maxSeq.get() as { h: number }).h;

  const listeners = new Set<(e: LogEvent) => void>();
  // Delivery is queued so every listener sees events in seq order, even when a listener appends.
  const pending: LogEvent[] = [];
  let dispatching = false;
  const dispatch = (e: LogEvent) => {
    pending.push(e);
    if (dispatching) return;
    dispatching = true;
    try {
      while (pending.length) {
        const next = pending.shift()!;
        for (const fn of [...listeners]) {
          try {
            fn(next);
          } catch (err) {
            console.error(`[log] listener failed on ${next.kind}#${next.seq}:`, err);
          }
        }
      }
    } finally {
      dispatching = false;
    }
  };

  const toEvent = (r: Row): LogEvent => {
    const e: LogEvent = {
      seq: r.seq,
      ts: r.ts,
      persona: r.persona,
      stream: r.stream,
      origin: r.origin as LogEvent["origin"],
      kind: r.kind as EventKind,
      body: JSON.parse(r.body),
    };
    if (r.supersedes != null) e.supersedes = r.supersedes;
    return e;
  };

  const write = db.transaction((e: LogEvent) => {
    // Seq is taken inside the write transaction, so it stays gapless and unique.
    e.seq = (maxSeq.get() as { h: number }).h + 1;
    insert.run(e.seq, e.ts, e.persona, e.stream, e.origin, e.kind, JSON.stringify(e.body), e.supersedes ?? null);
    const text = textOf(e.body);
    if (text) insertFts.run(e.seq, text);
  });

  return {
    append<K extends EventKind>(input: AppendInput<K>): LogEvent<K> {
      const e: LogEvent<K> = {
        seq: 0, // assigned in write()
        ts: new Date(clock.now()).toISOString(),
        persona: input.persona ?? opts.persona,
        stream: input.stream,
        origin: input.origin,
        kind: input.kind,
        body: input.body,
      };
      if (input.supersedes != null) e.supersedes = input.supersedes;
      write(e as LogEvent);
      headSeq = e.seq;
      dispatch(e as LogEvent);
      return e;
    },

    read({ stream, fromSeq, beforeSeq, limit = 1000, kinds } = {}) {
      const where: string[] = [];
      const args: (string | number)[] = [];
      if (stream) (where.push("stream = ?"), args.push(stream));
      if (fromSeq != null) (where.push("seq >= ?"), args.push(fromSeq));
      if (beforeSeq != null) (where.push("seq < ?"), args.push(beforeSeq));
      if (kinds?.length) (where.push(`kind IN (${kinds.map(() => "?").join(",")})`), args.push(...kinds));
      const cond = where.length ? `WHERE ${where.join(" AND ")}` : "";
      // With a start point read forward; otherwise return the latest `limit` events, oldest first.
      const sql =
        fromSeq != null
          ? `SELECT * FROM events ${cond} ORDER BY seq ASC LIMIT ?`
          : `SELECT * FROM (SELECT * FROM events ${cond} ORDER BY seq DESC LIMIT ?) ORDER BY seq ASC`;
      return (db.query(sql).all(...args, limit) as Row[]).map(toEvent);
    },

    search(query, { stream, limit = 20 } = {}) {
      const terms = query.trim().split(/\s+/).filter(Boolean);
      if (!terms.length) return [];
      const args: (string | number)[] = [];
      let match: string;
      if (terms.every((t) => [...t].length >= 3)) {
        // Trigram MATCH: each term as a quoted substring phrase, all required.
        match = "events_fts MATCH ?";
        args.push(terms.map((t) => `"${t.replaceAll('"', '""')}"`).join(" AND "));
      } else {
        // Terms shorter than 3 chars (common in Chinese) cannot use trigram MATCH; fall back to LIKE.
        match = terms.map(() => "events_fts.text LIKE ? ESCAPE '\\'").join(" AND ");
        for (const t of terms) args.push(`%${t.replace(/[\\%_]/g, (c) => "\\" + c)}%`);
      }
      const streamCond = stream ? "AND e.stream = ?" : "";
      if (stream) args.push(stream);
      const sql = `SELECT e.* FROM events_fts JOIN events e ON e.seq = events_fts.rowid
                   WHERE ${match} ${streamCond} ORDER BY e.seq DESC LIMIT ?`;
      return (db.query(sql).all(...args, limit) as Row[]).map(toEvent);
    },

    head: () => headSeq,

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    close: () => db.close(),
  };
}
