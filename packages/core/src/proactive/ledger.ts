// The facts ledger (D165 §9): typed facts with a pointer to where they came from, so two mails
// weeks apart can meet without re-reading the inbox. Never a mail body, never a snippet: each fact
// holds its type, a few typed fields (dates, amounts, who), the label it is known by (sender ·
// subject, a header) and the pointer (source, app, message or event id). Each fact expires 30 days
// after its own date; removing an account drops its facts. <dataDir>/findings.json, 0600.
import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BILLING_WHATS, SERVICE_WHATS, type BillingWhat, type ServiceWhat } from "./triage.ts";

export const FINDINGS_FILE = "findings.json";
const DAY = 86_400_000;
export const FACT_KEEP_DAYS = 30;

export interface Pointer {
  connectionId: string;
  service: string;
  account?: string;
  id: string; // the message, thread, event or notification id
  thread?: string;
}

interface Base {
  id: string;
  ref: Pointer;
  /** How I know, in one line (a header: "Cloudflare · Your domain renews soon"), ≤ 80 chars. */
  label: string;
  /** When the source item happened (ISO). */
  at: string;
  /** The date it stops mattering (ISO); the fact expires FACT_KEEP_DAYS after it. */
  date: string;
}

export type Fact = Base &
  (
    | { type: "booking"; what: "flight" | "hotel" | "train" | "other"; name: string; place?: string; from?: string; start: string; end?: string }
    | { type: "renewal"; name: string; due: string; amount?: string; autopay?: boolean; cardExpired?: boolean }
    | { type: "payment"; name: string; amount?: string }
    | { type: "commitment"; to: string; what: string; by: string }
    | { type: "ask_in"; from: string; name?: string; what: string; again?: boolean; person: boolean }
    | { type: "ask_out"; to: string; name?: string; what: string; mattered: boolean }
    | { type: "reply"; out: boolean; with: string }
    | { type: "change"; what: "flight_changed" | "flight_cancelled" | "meeting_moved" | "other"; name: string; on: string }
    | { type: "meeting"; title: string; start: string; end?: string; with: string[]; location?: string }
    | { type: "service"; what: ServiceWhat; name: string; start?: string; end?: string; effect?: string; prod?: boolean }
    | { type: "billing"; what: BillingWhat; name: string; on: string; amount?: string }
  );

export type FactType = Fact["type"];
export type NewFact = Fact extends infer F ? (F extends Fact ? Omit<F, "id" | "date"> & { date?: string } : never) : never;

/** The date a fact stops mattering, when the triage didn't say. */
function dateOf(f: NewFact): string {
  switch (f.type) {
    case "booking":
      return f.end ?? f.start;
    case "renewal":
      return f.due;
    case "commitment":
      return f.by;
    case "change":
      return f.on;
    case "meeting":
      return f.end ?? f.start;
    case "service":
      return f.end ?? f.start ?? f.at;
    case "billing":
      return f.on;
    default:
      return f.at;
  }
}

/** One fact's identity: the same thing said twice (a reminder, a resend) is one fact. */
function identity(f: NewFact | Fact): string {
  const p = `${f.ref.connectionId}|${f.ref.service}|${f.ref.account ?? ""}`;
  switch (f.type) {
    case "meeting":
      return `${p}|meeting|${f.ref.id}`;
    case "reply":
      return `${p}|reply|${f.ref.id}`;
    case "ask_in":
    case "ask_out":
      return `${p}|${f.type}|${f.ref.thread ?? f.ref.id}|${f.ref.id}`;
    // D243: one mail may hold two flights (out and back) or two maintenance windows.
    case "booking":
      return `${p}|booking|${f.ref.id}|${f.name}|${f.start}`;
    case "service":
      return `${p}|service|${f.ref.id}|${f.name}|${f.start ?? ""}`;
    default:
      return `${p}|${f.type}|${f.ref.id}`;
  }
}

export interface Ledger {
  add(facts: NewFact[]): Fact[];
  all(type?: FactType): Fact[];
  of<T extends FactType>(type: T): Extract<Fact, { type: T }>[];
  /** Drops facts past their keep date. */
  sweep(now: number): number;
  /** Removing an account drops its facts. */
  drop(connectionId: string): number;
  size(): number;
}

export function openLedger(dataDir: string): Ledger {
  const path = join(dataDir, FINDINGS_FILE);
  let facts: Fact[] = [];
  if (existsSync(path)) {
    try {
      const raw = JSON.parse(readFileSync(path, "utf8")) as { facts?: Fact[] };
      facts = Array.isArray(raw.facts) ? raw.facts : [];
    } catch {
      facts = [];
    }
  }
  const save = () => {
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, JSON.stringify({ facts }), { mode: 0o600 });
    chmodSync(tmp, 0o600);
    renameSync(tmp, path);
  };
  return {
    add(list) {
      const known = new Map(facts.map((f) => [identity(f), f]));
      const added: Fact[] = [];
      for (const n of list) {
        const id = identity(n);
        if (known.has(id)) continue;
        // Only the typed fields: anything else a caller passes (a snippet, a body) is not kept.
        const f = sanitize({ ...n, id: `f_${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}`, date: n.date ?? dateOf(n) } as Fact);
        if (!f) continue;
        known.set(id, f);
        facts.push(f);
        added.push(f);
      }
      if (added.length) save();
      return added;
    },
    all: (type) => (type ? facts.filter((f) => f.type === type) : [...facts]),
    of: <T extends FactType>(type: T) => facts.filter((f) => f.type === type) as Extract<Fact, { type: T }>[],
    sweep(now) {
      const before = facts.length;
      facts = facts.filter((f) => Date.parse(f.date) + FACT_KEEP_DAYS * DAY > now);
      if (facts.length !== before) save();
      return before - facts.length;
    },
    drop(connectionId) {
      const before = facts.length;
      facts = facts.filter((f) => f.ref.connectionId !== connectionId);
      if (facts.length !== before) save();
      return before - facts.length;
    },
    size: () => facts.length,
  };
}

const s80 = (v: unknown) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) : undefined);
/** A date as given when it says its own day ("2026-11-16") or zone ("…T21:40:00+09:00": a time where it happens); else normalized. */
const iso = (v: unknown) => {
  if (typeof v !== "string" || Number.isNaN(Date.parse(v))) return undefined;
  const s = v.trim();
  return /^\d{4}-\d\d-\d\d$/.test(s) || /^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d(\.\d+)?)?([+-]\d\d:\d\d|Z)$/.test(s) ? s : new Date(Date.parse(s)).toISOString();
};

/** Keeps exactly the fields a fact type has; drops a fact whose dates don't parse. */
export function sanitize(f: Fact): Fact | undefined {
  const ref: Pointer = { connectionId: String(f.ref?.connectionId ?? ""), service: String(f.ref?.service ?? ""), id: String(f.ref?.id ?? ""), ...(f.ref?.account ? { account: String(f.ref.account) } : {}), ...(f.ref?.thread ? { thread: String(f.ref.thread) } : {}) };
  const at = iso(f.at);
  const date = iso(f.date);
  if (!ref.connectionId || !ref.id || !at || !date) return;
  const base = { id: f.id, ref, label: s80(f.label) ?? "", at, date };
  switch (f.type) {
    case "booking": {
      const start = iso(f.start);
      if (!start) return;
      return { ...base, type: "booking", what: ["flight", "hotel", "train"].includes(f.what) ? f.what : "other", name: s80(f.name) ?? "", ...(s80(f.place) ? { place: s80(f.place) } : {}), ...(s80(f.from) ? { from: s80(f.from) } : {}), start, ...(iso(f.end) ? { end: iso(f.end) } : {}) };
    }
    case "renewal": {
      const due = iso(f.due);
      if (!due) return;
      return { ...base, type: "renewal", name: s80(f.name) ?? "", due, ...(s80(f.amount) ? { amount: s80(f.amount) } : {}), ...(f.autopay ? { autopay: true } : {}), ...(f.cardExpired ? { cardExpired: true } : {}) };
    }
    case "payment":
      return { ...base, type: "payment", name: s80(f.name) ?? "", ...(s80(f.amount) ? { amount: s80(f.amount) } : {}) };
    case "commitment": {
      const by = iso(f.by);
      if (!by) return;
      return { ...base, type: "commitment", to: s80(f.to) ?? "", what: s80(f.what) ?? "", by };
    }
    case "ask_in":
      return { ...base, type: "ask_in", from: s80(f.from) ?? "", ...(s80(f.name) ? { name: s80(f.name) } : {}), what: s80(f.what) ?? "", ...(f.again ? { again: true } : {}), person: Boolean(f.person) };
    case "ask_out":
      return { ...base, type: "ask_out", to: s80(f.to) ?? "", ...(s80(f.name) ? { name: s80(f.name) } : {}), what: s80(f.what) ?? "", mattered: Boolean(f.mattered) };
    case "reply":
      return { ...base, type: "reply", out: Boolean(f.out), with: s80(f.with) ?? "" };
    case "change": {
      const on = iso(f.on);
      if (!on) return;
      return { ...base, type: "change", what: ["flight_changed", "flight_cancelled", "meeting_moved"].includes(f.what) ? f.what : "other", name: s80(f.name) ?? "", on };
    }
    case "meeting": {
      const start = iso(f.start);
      if (!start) return;
      return { ...base, type: "meeting", title: s80(f.title) ?? "", start, ...(iso(f.end) ? { end: iso(f.end) } : {}), with: (Array.isArray(f.with) ? f.with : []).map((x) => s80(x)).filter((x): x is string => Boolean(x)).slice(0, 20), ...(s80(f.location) ? { location: s80(f.location) } : {}) };
    }
    case "service": {
      const start = iso(f.start);
      const end = iso(f.end);
      return { ...base, type: "service", what: (SERVICE_WHATS as readonly string[]).includes(f.what) ? f.what : "other", name: s80(f.name) ?? "", ...(start ? { start } : {}), ...(end ? { end } : {}), ...(s80(f.effect) ? { effect: s80(f.effect) } : {}), ...(f.prod ? { prod: true } : {}) };
    }
    case "billing": {
      const on = iso(f.on);
      if (!on) return;
      return { ...base, type: "billing", what: (BILLING_WHATS as readonly string[]).includes(f.what) ? f.what : "other", name: s80(f.name) ?? "", on, ...(s80(f.amount) ? { amount: s80(f.amount) } : {}) };
    }
    default:
      return;
  }
}
