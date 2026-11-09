// The Log: append-only SQLite event store with gapless seq and two FTS5 indexes: trigram (exact
// substrings, any language) and CJK bigrams (BM25 ranking that works for Chinese; search.ts).
// The same database holds the spine: the frozen digests of the channel (spine.ts).
//
// Migrations run on open, by PRAGMA user_version:
//   1: the bigram index (back-filled from every indexed event) and the spine tables.
import { Database } from "bun:sqlite";
import { chmodSync, existsSync } from "node:fs";
import type { EventKind, LogEvent } from "@ducter/protocol";
import type { AppendInput, LogStore, SpineStore } from "@ducter/protocol/src/internal.ts";
import { realClock, type Clock } from "./clock.ts";
import { bigramQuery, fuseRanks, indexText } from "@ducter/protocol/src/search.ts";
import { openSpine, SPINE_SCHEMA } from "./spine.ts";

export interface SqliteLog extends LogStore {
  /** Frozen digests of the channel, in this database. */
  spine: SpineStore;
  close(): void;
}

const SCHEMA_VERSION = 1;
const CANDIDATES = 50; // per ranked list, before fusion

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
  // The Log is every conversation: owner-only, like devices.db and mcp.secret. SQLite creates
  // -wal/-shm with the main file's mode, so it is set before WAL is on (and fixed on old installs).
  const ownerOnly = () => {
    for (const f of [opts.path, `${opts.path}-wal`, `${opts.path}-shm`])
      try {
        if (existsSync(f)) chmodSync(f, 0o600);
      } catch {
        /* not ours to change (e.g. a read-only copy) */
      }
  };
  if (opts.path !== ":memory:") ownerOnly();
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
  const version = (db.query("PRAGMA user_version").get() as { user_version: number }).user_version;
  if (version < 1) {
    db.transaction(() => {
      db.exec("CREATE VIRTUAL TABLE IF NOT EXISTS events_bg USING fts5(text, tokenize = 'unicode61 remove_diacritics 2');");
      db.exec(SPINE_SCHEMA);
      // Back-fill the bigram index from the text the trigram index already holds.
      const add = db.prepare("INSERT INTO events_bg (rowid, text) VALUES (?, ?)");
      for (const r of db.query("SELECT rowid, text FROM events_fts").all() as { rowid: number; text: string }[]) add.run(r.rowid, indexText(r.text));
      db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    })();
  }

  const insert = db.prepare(
    "INSERT INTO events (seq, ts, persona, stream, origin, kind, body, supersedes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const insertFts = db.prepare("INSERT INTO events_fts (rowid, text) VALUES (?, ?)");
  const insertBg = db.prepare("INSERT INTO events_bg (rowid, text) VALUES (?, ?)");
  const spine = openSpine(db, clock);
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
    if (text) {
      insertFts.run(e.seq, text);
      insertBg.run(e.seq, indexText(text));
    }
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

    search(query, { stream, limit = 20, beforeSeq } = {}) {
      const terms = query.trim().split(/\s+/).filter(Boolean);
      if (!terms.length) return [];
      const scope: string[] = [];
      const scopeArgs: (string | number)[] = [];
      if (stream) (scope.push("AND e.stream = ?"), scopeArgs.push(stream));
      if (beforeSeq != null) (scope.push("AND e.seq < ?"), scopeArgs.push(beforeSeq));
      const where = scope.join(" ");

      // 1. Exact: every term as a substring, newest first. Trigram MATCH; terms shorter than 3
      //    chars (common in Chinese) cannot use it, so those fall back to LIKE.
      const args: (string | number)[] = [];
      let match: string;
      if (terms.every((t) => [...t].length >= 3)) {
        match = "events_fts MATCH ?";
        args.push(terms.map((t) => `"${t.replaceAll('"', '""')}"`).join(" AND "));
      } else {
        match = terms.map(() => "events_fts.text LIKE ? ESCAPE '\\'").join(" AND ");
        for (const t of terms) args.push(`%${t.replace(/[\\%_]/g, (c) => "\\" + c)}%`);
      }
      const exact = db
        .query(`SELECT e.seq, e.kind FROM events_fts JOIN events e ON e.seq = events_fts.rowid WHERE ${match} ${where} ORDER BY e.seq DESC LIMIT ?`)
        .all(...args, ...scopeArgs, CANDIDATES) as { seq: number; kind: string }[];

      // 2. Ranked: BM25 over CJK bigrams and words, any term matching.
      const q = bigramQuery(query);
      let ranked: { seq: number; kind: string }[] = [];
      if (q) {
        try {
          ranked = db
            .query(`SELECT e.seq, e.kind FROM events_bg JOIN events e ON e.seq = events_bg.rowid WHERE events_bg MATCH ? ${where} ORDER BY bm25(events_bg) LIMIT ?`)
            .all(q, ...scopeArgs, CANDIDATES) as { seq: number; kind: string }[];
        } catch {
          ranked = []; // a query FTS5 can't parse: the exact list still answers
        }
      }
      if (!exact.length && !ranked.length) return [];

      // 3. Fuse by reciprocal rank, with recency as a light third list; the user's words get a boost.
      const kinds = new Map<number, string>([...exact, ...ranked].map((r) => [r.seq, r.kind]));
      const order = fuseRanks(
        [
          { seqs: exact.map((r) => r.seq), weight: 1 },
          { seqs: ranked.map((r) => r.seq), weight: 1 },
          { seqs: [...kinds.keys()].sort((a, b) => b - a), weight: 0.3 },
        ],
        (seq) => (kinds.get(seq) === "user_msg" ? 1.15 : 1),
      ).slice(0, limit);
      const rows = db.query(`SELECT * FROM events WHERE seq IN (${order.map(() => "?").join(",")})`).all(...order) as Row[];
      const bySeq = new Map(rows.map((r) => [r.seq, r]));
      return order.map((s) => bySeq.get(s)).filter((r): r is Row => !!r).map(toEvent);
    },

    head: () => headSeq,

    spine,

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    close: () => db.close(),
  };
}
