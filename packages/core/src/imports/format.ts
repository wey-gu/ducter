// D651 (research/246): the one format another app's history comes in as, `ducter-import/1`.
//
// JSON lines on stdin/stdout, one record per line:
//   {"t":"source","format":"ducter-import/1","app":"Lody","account":"workspace:my-team",…}
//   {"t":"thread","id":"S-8f2a","title":"Fix the flaky WAL test","folder":"…","repo":"…",…}
//   {"t":"msg","thread":"S-8f2a","id":"m1","role":"user","text":"…","at":"2026-10-02T03:11:00Z"}
//   {"t":"skipped","thread":"S-8f2a","what":"attachment","n":2}
//   {"t":"end","threads":1,"messages":2}
//
// Everything is checked here, once: types, order and the format's limits. Unknown fields are
// dropped (never stored), an unknown `t` stops the stream, and every string that is kept passes
// through Ducter's one secret detector (`redact`) before anything is stored, the D327 rule: a key
// is hidden before a title exists. An invalid record, or a stream with no `end`, keeps every
// thread that was whole before it and says where it stopped; the last thread may have been cut
// off mid-way, so it is not brought in.
import { redact } from "@ducter/protocol/src/redact.ts";

export const IMPORT_FORMAT = "ducter-import/1";
/** One message's text, in bytes. */
export const IMPORT_TEXT_MAX = 256 * 1024;
/** One thread's title, in characters. */
export const IMPORT_TITLE_MAX = 200;
/** Per thread, per run. */
export const IMPORT_MESSAGES_MAX = 20_000;
export const IMPORT_ID_MAX = 200;

export interface ImportSource {
  format: string;
  app: string;
  account?: string;
  reader?: string;
  readerVersion?: string;
}

export interface ImportMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  at: string;
}

export interface ImportSkipped {
  what: string;
  n: number;
}

export interface ImportThread {
  id: string;
  title: string;
  folder?: string;
  repo?: string;
  branch?: string;
  agent?: string;
  model?: string;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
  messages: ImportMessage[];
  skipped: ImportSkipped[];
}

export interface ImportEnd {
  threads: number;
  messages: number;
}

export interface ImportStopped {
  /** 1-based line in the stream. */
  line: number;
  reason: string;
}

export interface ImportParse {
  /** True when the whole stream was valid and closed with a matching `end`. */
  ok: boolean;
  source?: ImportSource;
  threads: ImportThread[];
  end?: ImportEnd;
  stopped?: ImportStopped;
  /** What would be stored from this stream (whole threads only). */
  counts: { threads: number; messages: number; skipped: number };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const chars = (s: string) => [...s].length;
const ENCODER = new TextEncoder();
const bytes = (s: string) => ENCODER.encode(s).length;
/** A kept string field: redacted, trimmed; undefined when absent; "" is not a value here. */
function textField(v: unknown, max = IMPORT_ID_MAX): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = redact(v).trim();
  return s ? [...s].slice(0, max).join("") : undefined;
}
function timeField(v: unknown, now: number): string | undefined {
  if (typeof v !== "string" || !v.trim()) return undefined;
  const ms = Date.parse(v);
  if (!Number.isFinite(ms) || ms > now) return undefined;
  return new Date(ms).toISOString();
}

/**
 * Reads one `ducter-import/1` stream. `now` is the clock the "not in the future" rule is checked
 * against (injected in tests).
 */
export function parseImport(input: string, o: { now?: () => number } = {}): ImportParse {
  const now = (o.now ?? Date.now)();
  const threads: ImportThread[] = [];
  let source: ImportSource | undefined;
  let end: ImportEnd | undefined;
  let stopped: ImportStopped | undefined;
  /** The last thread may be partial (a bad record in it, or no `end`): leave it out. */
  let dropLast = false;
  /** The `t` of the record being read, so a bad record can say where. */
  const lines = input.split(/\r?\n/);
  let seenEnd = false;
  const fail = (line: number, reason: string, drop = true) => {
    if (!stopped) stopped = { line, reason };
    if (drop) dropLast = true;
  };
  const find = (id: string) => threads.find((t) => t.id === id);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const n = i + 1;
    if (!line.trim()) continue;
    if (stopped) break;
    if (seenEnd) {

      fail(n, "a record after end", false);
      break;
    }
    let rec: unknown;
    try {
      rec = JSON.parse(line);
    } catch {
      fail(n, "not JSON");
      break;
    }
    if (!isObj(rec)) {
      fail(n, "a record must be an object");
      break;
    }
    const t = rec.t;
    if (typeof t !== "string") {
      fail(n, "a record must say what it is (t)");
      break;
    }
    if (t === "source") {
      if (source || threads.length) {
        fail(n, "source must be the first record, once", false);
        break;
      }
      if (rec.format !== IMPORT_FORMAT) {
        fail(n, `unknown format ${JSON.stringify(rec.format ?? "")}`, false);
        break;
      }
      const app = textField(rec.app, 120);
      if (!app) {
        fail(n, "source needs an app", false);
        break;
      }
      const account = textField(rec.account, 200);
      const reader = textField(rec.reader, 120);
      const readerVersion = textField(rec.readerVersion, 60);
      source = {
        format: IMPORT_FORMAT,
        app,
        ...(account ? { account } : {}),
        ...(reader ? { reader } : {}),
        ...(readerVersion ? { readerVersion } : {}),
      };
      continue;
    }
    if (!source) {
      fail(n, "source must be the first record", false);
      break;
    }
    if (t === "thread") {
      const id = textField(rec.id);
      const title = textField(rec.title, IMPORT_TITLE_MAX * 4);
      if (!id) {
        fail(n, "a thread needs an id", false);
        break;
      }
      if (find(id)) {
        fail(n, `thread ${id} was already declared`, false);
        break;
      }
      if (!title) {
        fail(n, "a thread needs a title", false);
        break;
      }
      if (chars(redact(String(rec.title)).trim()) > IMPORT_TITLE_MAX) {
        fail(n, `a thread title is at most ${IMPORT_TITLE_MAX} characters`, false);
        break;
      }
      const createdAt = timeField(rec.createdAt, now);
      const updatedAt = timeField(rec.updatedAt, now);
      if (!createdAt || !updatedAt) {
        fail(n, "a thread needs a valid createdAt and updatedAt, not in the future", false);
        break;
      }
      if (rec.archived !== undefined && typeof rec.archived !== "boolean") {
        fail(n, "archived must be true or false", false);
        break;
      }
      const folder = textField(rec.folder, 1024);
      const repo = textField(rec.repo, 300);
      const branch = textField(rec.branch, 200);
      const agent = textField(rec.agent, 80);
      const model = textField(rec.model, 120);
      threads.push({
        id,
        title,
        ...(folder ? { folder } : {}),
        ...(repo ? { repo } : {}),
        ...(branch ? { branch } : {}),
        ...(agent ? { agent } : {}),
        ...(model ? { model } : {}),
        createdAt,
        updatedAt,
        archived: rec.archived === true,
        messages: [],
        skipped: [],
      });
      continue;
    }
    if (t === "msg") {
      const thread = typeof rec.thread === "string" ? find(rec.thread) : undefined;
      if (!thread) {
        fail(n, "a message needs a thread declared before it");
        break;
      }
      const id = textField(rec.id);
      if (!id) {
        fail(n, "a message needs an id");
        break;
      }
      if (thread.messages.some((m) => m.id === id)) {
        fail(n, `message ${id} was already declared in thread ${thread.id}`);
        break;
      }
      if (rec.role !== "user" && rec.role !== "assistant") {
        fail(n, "a message role is user or assistant");
        break;
      }
      if (typeof rec.text !== "string") {
        fail(n, "a message needs its text");
        break;
      }
      if (bytes(rec.text) > IMPORT_TEXT_MAX) {
        fail(n, `a message's text is at most ${IMPORT_TEXT_MAX} bytes`);
        break;
      }
      const at = timeField(rec.at, now);
      if (!at) {
        fail(n, "a message needs a valid time, not in the future");
        break;
      }
      if (thread.messages.length >= IMPORT_MESSAGES_MAX) {
        fail(n, `a thread has at most ${IMPORT_MESSAGES_MAX} messages in a run`);
        break;
      }
      thread.messages.push({ id, role: rec.role, text: redact(rec.text), at });
      continue;
    }
    if (t === "skipped") {
      const thread = typeof rec.thread === "string" ? find(rec.thread) : undefined;
      if (!thread) {
        fail(n, "a skipped record needs a thread declared before it");
        break;
      }
      const what = textField(rec.what, 40);
      if (!what) {
        fail(n, "a skipped record needs what it was");
        break;
      }
      if (!Number.isInteger(rec.n) || Number(rec.n) < 1 || Number(rec.n) > 1_000_000) {
        fail(n, "a skipped record's n is a whole number of at least 1");
        break;
      }
      thread.skipped.push({ what, n: Number(rec.n) });
      continue;
    }
    if (t === "end") {
      if (!Number.isInteger(rec.threads) || Number(rec.threads) < 0 || !Number.isInteger(rec.messages) || Number(rec.messages) < 0) {
        fail(n, "end needs whole numbers of threads and messages", false);
        break;
      }
      const messages = threads.reduce((a, x) => a + x.messages.length, 0);
      if (Number(rec.threads) !== threads.length || Number(rec.messages) !== messages) {
        fail(n, `end says ${rec.threads} threads and ${rec.messages} messages, but the stream has ${threads.length} and ${messages}`, false);
        break;
      }
      end = { threads: Number(rec.threads), messages: Number(rec.messages) };
      seenEnd = true;
      continue;
    }
    fail(n, `unknown record type ${JSON.stringify(t)}`);
    break;
  }

  if (!stopped && !source) stopped = { line: 1, reason: "a stream must begin with a source record" };
  else if (!stopped && !end) {
    stopped = { line: lines.length, reason: "the stream ended without an end record" };
    dropLast = true;
  }
  if (dropLast && threads.length) threads.pop();
  // Messages in source order; a stable sort keeps the reader's order on equal times.
  for (const t of threads) t.messages.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const messages = threads.reduce((a, x) => a + x.messages.length, 0);
  const skipped = threads.reduce((a, x) => a + x.skipped.reduce((s, y) => s + y.n, 0), 0);
  return {
    ok: !stopped && !!end,
    ...(source ? { source } : {}),
    threads,
    ...(end ? { end } : {}),
    ...(stopped ? { stopped } : {}),
    counts: { threads: threads.length, messages, skipped },
  };
}
