// The main AI's long-conversation memory (principle 3, design/memory.md):
//   [epoch digests][segment digests][obligation ledger][verbatim window]
//
// Lifecycle, all off the critical path: after a turn (and on a slow timer for quiet channels),
// poke() looks for a segment to close (segment.ts), writes its digest in the background
// (writer.ts), audits it (audit.ts), and freezes it in the store. A failed audit means a rewrite
// with the reasons; after two failures the digest is repaired by removal, and if that still fails
// a mechanical index is frozen instead (marked degraded). Frozen digests are never regenerated.
// Once more than `epochAfter` segments stand alone, the oldest `epochSize` roll up into an epoch by
// concatenation. Everything here is derived from the Log and the store, so a restart picks up
// where it was: a digest that was being written is simply written again.
//
// A frozen digest is used from the next cut on (a fresh session's projection). The live session
// is never edited: what changed since the cut is in its own transcript already.
import type { LogEvent } from "../../../protocol/src/index.ts";
import type { LogStore, SpineAttempt, SpineRecord, SpineStore } from "../../../protocol/src/internal.ts";
import { audit, repair } from "./audit.ts";
import { computeLedger, renderDigest, renderLedger, rollUp, type AnyDigest, type EpochDigest, type Ledger, type SegmentDigest } from "./digest.ts";
import { chooseCut, DEFAULT_CUT, estTokens, salientIdentifiers, SPINE_KINDS, type CutOptions, type Unit } from "./segment.ts";
import { assemble, mechanicalRaw, parseDigest, type DigestWriter, type WriterInput } from "./writer.ts";

export interface SpineOptions {
  log: LogStore;
  store: SpineStore;
  writer: DigestWriter;
  /** How an event reads to the model, or null to leave it out. */
  line: (e: LogEvent) => string | null;
  now?: () => number;
  cut?: Partial<CutOptions>;
  epochAfter?: number; // standalone segments before the oldest roll up (default 16)
  epochSize?: number; // segments per epoch (default 8)
  backfill?: number; // on first use, digest at most this many segments' worth of old history (default 10)
  capTokens?: number; // digest size cap (default 3000)
  maxInfraFailures?: number; // writer errors on one segment before a mechanical index (default 4)
  retryMs?: number; // after a writer error, wait this long before trying again (default 10 min)
  onError?: (err: unknown) => void;
}

export interface SpineView {
  /** Digest blocks (epochs, then segments) and the ledger, as text; empty when nothing is frozen. */
  earlier: string;
  ledger: string;
  /** The verbatim window, oldest first. */
  window: LogEvent[];
  /** Lines between the newest digest and the window that are not shown (the writer is behind). */
  gap?: { from: number; to: number };
}

export interface Spine {
  /** Close and write what is due, in the background. Resolves when this run is over. */
  poke(): Promise<void>;
  /** The frozen digests the projection uses: epochs, then the segments no epoch absorbed. */
  digests(): AnyDigest[];
  ledger(): Ledger;
  /** The spine as a fresh session reads it, before `beforeSeq` (the turn's own events excluded). */
  view(beforeSeq?: number): SpineView;
  idle(): Promise<void>;
  close(): void;
  readonly stats: { written: number; degraded: number; repaired: number; rewrites: number; infraFailures: number };
}

const pad = (n: number) => String(n).padStart(4, "0");

export function createSpine(o: SpineOptions): Spine {
  const now = o.now ?? (() => Date.now());
  const cut: CutOptions = { ...DEFAULT_CUT, ...o.cut };
  const epochAfter = o.epochAfter ?? 16;
  const epochSize = o.epochSize ?? 8;
  const backfill = o.backfill ?? 10;
  const maxInfra = o.maxInfraFailures ?? 4;
  const retryMs = o.retryMs ?? 10 * 60_000;
  const onError = o.onError ?? ((err) => console.error("[spine]", err));
  let running: Promise<void> | null = null;
  let closed = false;
  let retryAt = 0;
  const stats = { written: 0, degraded: 0, repaired: 0, rewrites: 0, infraFailures: 0 };

  const asDigest = (r: SpineRecord): AnyDigest => ({ kind: r.kind, ...(r.body as SegmentDigest & EpochDigest) }) as AnyDigest;
  const all = () => o.store.list().map(asDigest);
  /** Epochs, then the segments no epoch covers, oldest first. */
  const active = (ds = all()): AnyDigest[] => {
    const epochs = ds.filter((d) => d.kind === "epoch");
    const covered = (d: AnyDigest) => epochs.some((e) => d.from >= e.from && d.to <= e.to);
    return ds.filter((d) => d.kind === "epoch" || !covered(d)).sort((a, b) => a.from - b.from || (a.kind === "epoch" ? -1 : 1));
  };
  const lastTo = (ds: AnyDigest[]) => ds.reduce((m, d) => Math.max(m, d.to), 0);
  const usedIds = (ds: AnyDigest[]) => {
    const n = (s: string) => Number(s.slice(2)) || 0;
    let d = 0;
    let ob = 0;
    for (const x of ds) {
      for (const k of x.decisions) d = Math.max(d, n(k.id));
      for (const k of x.opened) ob = Math.max(ob, n(k.id));
    }
    return { d, o: ob };
  };

  const toUnit = (e: LogEvent): Unit | null => {
    const l = o.line(e);
    if (l === null) return null;
    const line = `#${e.seq} ${l}`;
    return { e, line, tokens: estTokens(line) };
  };
  const unitsAfter = (seq: number, beforeSeq?: number): Unit[] => {
    const out: Unit[] = [];
    let from = seq + 1;
    for (;;) {
      const page = o.log.read({ stream: "channel", fromSeq: from, kinds: [...SPINE_KINDS], limit: 1000 });
      for (const e of page) {
        if (beforeSeq !== undefined && e.seq >= beforeSeq) return out;
        const u = toUnit(e);
        if (u) out.push(u);
      }
      if (page.length < 1000) return out;
      from = page[page.length - 1]!.seq + 1;
    }
  };
  /** Where the spine starts on first use: at most `backfill` segments' worth before the end. */
  const startSeq = (ds: AnyDigest[]): number => {
    if (ds.length) return lastTo(ds);
    const budget = backfill * cut.hiTokens;
    const tail = o.log.read({ stream: "channel", kinds: [...SPINE_KINDS], beforeSeq: o.log.head() + 1, limit: 5000 });
    let acc = 0;
    for (let i = tail.length - 1; i >= 0; i--) {
      const u = toUnit(tail[i]!);
      acc += u?.tokens ?? 0;
      if (acc > budget) return tail[i]!.seq; // start after this one
    }
    return 0;
  };

  async function writeOne(c: { from: number; to: number; units: Unit[] }, ds: AnyDigest[]): Promise<"frozen" | "stop"> {
    const segs = ds.filter((d) => d.kind === "segment");
    const id = `S${pad(segs.length + 1)}`;
    const led = computeLedger(active(ds));
    const ids = usedIds(ds);
    const base: Omit<WriterInput, "feedback"> = { id, from: c.from, to: c.to, units: c.units, inForce: led.inForce, open: led.open, mustKeep: salientIdentifiers(c.units) };
    const ctx = { units: c.units, open: led.open, inForce: led.inForce, mustKeep: base.mustKeep, capTokens: o.capTokens, usedO: ids.o, knownIds: ds.flatMap((x) => [...x.decisions.map((k) => k.id), ...x.opened.map((k) => k.id)]) };
    const attempt = (a: Omit<SpineAttempt, "fromSeq" | "toSeq">) => o.store.attempt({ fromSeq: c.from, toSeq: c.to, ...a });
    const freeze = (d: SegmentDigest) => {
      o.store.freeze({ id, kind: "segment", fromSeq: d.from, toSeq: d.to, body: d });
      stats.written++;
      return "frozen" as const;
    };
    const failedBefore = o.store.attempts(200).filter((a) => a.fromSeq === c.from && a.toSeq === c.to && !a.ok && a.reasons[0]?.startsWith("writer error")).length;

    let feedback: string[] | undefined;
    let lastDigest: SegmentDigest | undefined;
    if (failedBefore < maxInfra) {
      for (let n = 1; n <= 2; n++) {
        let text: string;
        try {
          text = await o.writer.write({ ...base, ...(feedback ? { feedback } : {}) });
        } catch (err) {
          stats.infraFailures++;
          attempt({ n, ok: false, writer: o.writer.name, reasons: [`writer error: ${String((err as Error)?.message ?? err).slice(0, 200)}`] });
          retryAt = now() + retryMs;
          if (failedBefore + 1 < maxInfra) return "stop";
          break;
        }
        if (closed) return "stop";
        let d: SegmentDigest;
        try {
          d = assemble(parseDigest(text), base, ids, o.writer.name);
        } catch (err) {
          feedback = [`your answer was not one JSON object (${String((err as Error)?.message ?? err).slice(0, 120)})`];
          attempt({ n, ok: false, writer: o.writer.name, reasons: feedback });
          stats.rewrites++;
          continue;
        }
        lastDigest = d;
        const reasons = audit(d, ctx);
        attempt({ n, ok: !reasons.length, writer: o.writer.name, reasons });
        if (!reasons.length) return freeze(d);
        feedback = reasons;
        if (n < 2) stats.rewrites++;
      }
      // Two tries failed: repair by removal, and freeze only if that passes the audit.
      if (lastDigest) {
        const r = repair(lastDigest, ctx);
        const reasons = audit(r.digest, ctx);
        attempt({ n: 3, ok: !reasons.length, writer: `${o.writer.name}+repair`, reasons: reasons.length ? reasons : r.dropped.map((x) => `dropped ${x}`) });
        if (!reasons.length) {
          stats.repaired++;
          return freeze({ ...r.digest, repaired: r.dropped });
        }
      }
    }
    // A mechanical index: says less, never anything false. Search carries the rest.
    const m = { ...assemble(mechanicalRaw(base), base, ids, "mechanical"), degraded: true };
    const reasons = audit(m, ctx);
    attempt({ n: 4, ok: !reasons.length, writer: "mechanical", reasons });
    if (reasons.length) {
      onError(new Error(`spine: even the mechanical index for #${c.from}–#${c.to} failed its audit: ${reasons.join("; ")}`));
      return "stop";
    }
    stats.degraded++;
    return freeze(m);
  }

  function rollUpDue(): void {
    for (;;) {
      const ds = all();
      const standalone = active(ds).filter((d): d is { kind: "segment" } & SegmentDigest => d.kind === "segment");
      if (standalone.length <= epochAfter) return;
      const epochs = ds.filter((d) => d.kind === "epoch").length;
      const e = rollUp(`E${pad(epochs + 1)}`, standalone.slice(0, epochSize));
      o.store.freeze({ id: e.id, kind: "epoch", fromSeq: e.from, toSeq: e.to, body: e });
    }
  }

  async function run(): Promise<void> {
    while (!closed) {
      if (now() < retryAt) return;
      const ds = all();
      const units = unitsAfter(startSeq(ds));
      const c = chooseCut(units, now(), cut);
      if (!c) return;
      const r = await writeOne(c, ds);
      if (r === "stop") return;
      rollUpDue();
    }
  }

  return {
    poke() {
      if (closed) return Promise.resolve();
      if (!running)
        running = run()
          .catch(onError)
          .finally(() => {
            running = null;
          });
      return running;
    },
    digests: () => active(),
    ledger: () => computeLedger(active()),
    view(beforeSeq) {
      const ds = active();
      const end = lastTo(ds);
      // The window: everything after the newest digest, at least loTokens (overlapping the
      // newest digest when the tail is short), at most hiTokens.
      let tail = unitsAfter(end, beforeSeq);
      let size = tail.reduce((n, u) => n + u.tokens, 0);
      let gap: SpineView["gap"];
      if (size > cut.hiTokens) {
        let acc = 0;
        let i = tail.length;
        while (i > 0 && acc + tail[i - 1]!.tokens <= cut.hiTokens) acc += tail[--i]!.tokens;
        // Never start the window on a partner line whose user message is cut away.
        while (i < tail.length - 1 && tail[i]!.e.kind !== "user_msg") i++;
        if (i > 0) gap = { from: tail[0]!.e.seq, to: tail[i - 1]!.e.seq };
        tail = tail.slice(i);
      } else if (size < cut.loTokens && end > 0) {
        const before = o.log.read({ stream: "channel", kinds: [...SPINE_KINDS], beforeSeq: end + 1, limit: 400 });
        const extra: Unit[] = [];
        for (let i = before.length - 1; i >= 0 && size < cut.loTokens; i--) {
          const u = toUnit(before[i]!);
          if (!u) continue;
          extra.unshift(u);
          size += u.tokens;
        }
        while (extra.length && extra[0]!.e.kind !== "user_msg") extra.shift();
        tail = [...extra, ...tail];
      }
      if (!ds.length && tail.length && !gap) {
        const first = o.log.read({ stream: "channel", kinds: [...SPINE_KINDS], fromSeq: 1, limit: 1 })[0];
        if (first && first.seq < tail[0]!.e.seq) gap = { from: first.seq, to: tail[0]!.e.seq - 1 };
      }
      const when = (seq: number) => o.log.read({ fromSeq: seq, limit: 1 })[0]?.ts;
      return {
        earlier: ds.map(renderDigest).join("\n\n"),
        ledger: ds.length ? renderLedger(computeLedger(ds), when) : "",
        window: tail.map((u) => u.e),
        ...(gap ? { gap } : {}),
      };
    },
    async idle() {
      while (running) await running;
    },
    close() {
      closed = true;
    },
    stats,
  };
}

/** An in-memory spine store (tests and the eval); the real one lives in the Log's database. */
export function memorySpineStore(): SpineStore & { records: SpineRecord[]; tries: SpineAttempt[]; recalls: unknown[] } {
  const records: SpineRecord[] = [];
  const tries: SpineAttempt[] = [];
  const recalls: unknown[] = [];
  return {
    records,
    tries,
    recalls,
    list: () => [...records].sort((a, b) => a.fromSeq - b.fromSeq || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id)).map((r) => structuredClone(r)),
    freeze(r) {
      if (records.some((x) => x.id === r.id)) throw new Error(`digest ${r.id} is already frozen`);
      const rec = { ...structuredClone(r), createdAt: new Date().toISOString() };
      records.push(rec);
      return rec;
    },
    attempt: (a) => void tries.push(a),
    attempts: (limit = 50) => tries.slice(-limit),
    recalled: (r) => void recalls.push(r),
  };
}
