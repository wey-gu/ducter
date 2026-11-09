// The spine store: frozen digests of the channel, kept in the Log's own database (design/memory.md).
// Append-only by construction: SQLite triggers refuse UPDATE and DELETE on frozen digests, so a
// digest can never be regenerated in place. Later changes are a later digest's Superseded entries.
import type { Database } from "bun:sqlite";
import type { SpineAttempt, SpineRecord, SpineStore } from "@ducter/protocol/src/internal.ts";
import type { Clock } from "./clock.ts";

/** Schema for the spine tables (migration step 1 of the Log database, see log.ts). */
export const SPINE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS spine (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('segment', 'epoch')),
    from_seq INTEGER NOT NULL,
    to_seq INTEGER NOT NULL,
    created TEXT NOT NULL,
    body TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS spine_range ON spine(from_seq, to_seq);
  CREATE TRIGGER IF NOT EXISTS spine_frozen_update BEFORE UPDATE ON spine BEGIN SELECT RAISE(ABORT, 'frozen digests never change'); END;
  CREATE TRIGGER IF NOT EXISTS spine_frozen_delete BEFORE DELETE ON spine BEGIN SELECT RAISE(ABORT, 'frozen digests never change'); END;
  CREATE TABLE IF NOT EXISTS spine_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at TEXT NOT NULL,
    from_seq INTEGER NOT NULL,
    to_seq INTEGER NOT NULL,
    n INTEGER NOT NULL,
    ok INTEGER NOT NULL,
    writer TEXT NOT NULL,
    reasons TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS spine_recall (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at TEXT NOT NULL,
    turn_seq INTEGER,
    query TEXT NOT NULL,
    hits TEXT NOT NULL,
    admitted INTEGER NOT NULL
  );
`;

interface Row {
  id: string;
  kind: "segment" | "epoch";
  from_seq: number;
  to_seq: number;
  created: string;
  body: string;
}

export function openSpine(db: Database, clock: Clock): SpineStore {
  const insert = db.prepare("INSERT INTO spine (id, kind, from_seq, to_seq, created, body) VALUES (?, ?, ?, ?, ?, ?)");
  const iso = () => new Date(clock.now()).toISOString();
  return {
    list() {
      // An epoch sorts before the segments it absorbed (same from_seq): kind 'epoch' < 'segment'.
      return (db.query("SELECT * FROM spine ORDER BY from_seq ASC, kind ASC, id ASC").all() as Row[]).map((r) => ({
        id: r.id,
        kind: r.kind,
        fromSeq: r.from_seq,
        toSeq: r.to_seq,
        createdAt: r.created,
        body: JSON.parse(r.body),
      }));
    },
    freeze(r) {
      const rec: SpineRecord = { ...r, createdAt: iso() };
      insert.run(rec.id, rec.kind, rec.fromSeq, rec.toSeq, rec.createdAt, JSON.stringify(rec.body));
      return rec;
    },
    attempt(a: SpineAttempt) {
      db.prepare("INSERT INTO spine_attempts (at, from_seq, to_seq, n, ok, writer, reasons) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
        a.at ?? iso(),
        a.fromSeq,
        a.toSeq,
        a.n,
        a.ok ? 1 : 0,
        a.writer,
        JSON.stringify(a.reasons),
      );
    },
    attempts(limit = 50) {
      const rows = db.query("SELECT * FROM spine_attempts ORDER BY id DESC LIMIT ?").all(limit) as { at: string; from_seq: number; to_seq: number; n: number; ok: number; writer: string; reasons: string }[];
      return rows.reverse().map((r) => ({ at: r.at, fromSeq: r.from_seq, toSeq: r.to_seq, n: r.n, ok: !!r.ok, writer: r.writer, reasons: JSON.parse(r.reasons) }));
    },
    recalled(r) {
      db.prepare("INSERT INTO spine_recall (at, turn_seq, query, hits, admitted) VALUES (?, ?, ?, ?, ?)").run(iso(), r.turnSeq ?? null, r.query, JSON.stringify(r.hits), r.admitted ? 1 : 0);
    },
  };
}
