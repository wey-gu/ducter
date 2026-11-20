// D435: the partner never goes quiet when its own agent runs out. When a partner turn fails on the
// agent it thinks with (out of credit, throttled, or its turns failing), that agent is held until
// it is tried again: the reset the agent named (D297's reading, @ducter/protocol limit-hit.ts), else
// what the account said, else a short wait of Ducter's own. While it is held, the next signed-in
// agent that may be the partner answers (PARTNER_FALLBACK order, never one a rule of the person's
// rules out, never one whose own limit is used up); with none, messages wait and are answered when
// the time comes, in order. A turn on the held agent that goes through ends the hold.
//
// The holds are in the Log (partner_session brain_held / brain_back on the "partner" stream), so a
// restart keeps them; who answers is worked out each time it is asked, never stored.
import { HARNESSES, HARNESS_IDS, PARTNER_FALLBACK, type Bodies, type BrainHeld, type HarnessId, type RuleView } from "@ducter/protocol";
import type { LogStore } from "@ducter/protocol/src/internal.ts";
import type { AccountUsageBook } from "./account-usage.ts";
import { realClock, type Clock } from "./clock.ts";
import { RESET_GRACE_MS, THROTTLE_RETRY_MS, UNKNOWN_RETRY_MS } from "./limits.ts";

/** Turns that fail for another reason (not a limit): tried again this soon. */
export const ERROR_RETRY_MS = 10 * 60_000;
/** A hit this soon after the last hold's time counts as the same time out (said once, not again). */
const AGAIN_MS = 30 * 60_000;

export type HoldWhy = BrainHeld["why"];

/** What a partner turn that failed on its agent says (the runner's LimitHit shape, or an error). */
export interface BrainHit {
  harness: string;
  failure: HoldWhy;
  resetsAt?: string;
  source?: string;
  said?: string;
}

/** The hold on what it thinks with now: who answers meanwhile (`to`), or nobody (`waits`). */
export type HoldNow = BrainHeld & { to?: HarnessId };

export interface BrainHold {
  /** The hold on the agent the partner thinks with, with who answers now; undefined when none. */
  now(): HoldNow | undefined;
  /** A partner turn failed on its agent: hold it. tell: the person hasn't heard this yet (say it once). */
  hit(h: BrainHit): Promise<{ now?: HoldNow; tell: boolean }>;
  /**
   * D446: before a partner turn. A task on the home waits for the reset of the same agent's account
   * (D297): the account is read, and when it says its limit is used up (or can't say, and the task's
   * reset is still to come) the agent is held now, as hit() would after one failed turn. held: a
   * hold was made just now (the partner drops its session and says it, when tell).
   */
  ahead(): Promise<{ now?: HoldNow; tell: boolean; held: boolean }>;
  /** A turn on this agent went through: its hold, if any, is over. */
  ok(harness: string): void;
  /** A hold was set or ended, or its time came (D440: or something to think with arrived). */
  onChange(fn: () => void): () => void;
  /** D440: nothing on the home can think: its agents were read and none that may be the partner is installed and signed in. */
  blind(): boolean;
  /** D440: the home's agents were read again (core calls it on every devices change): a home that could not think and now can wakes what waited. */
  seen(): void;
  stop(): void;
}

export interface BrainHoldDeps {
  log: LogStore;
  clock?: Clock;
  /** What the partner thinks with before any hold (brain.ts effectiveBrain's harness). */
  base: () => HarnessId;
  /** The home's agents as last read (signed in or not); undefined before the first read. */
  home: () => { harness: string; loggedIn: boolean; installed?: boolean }[] | undefined;
  /** The person's rules: a never rule with no words and no kind of work rules an agent out here too. */
  rules?: () => RuleView[];
  /** D288: an agent whose account says its limit is used up doesn't take over. */
  usage?: AccountUsageBook;
  /** D446: the limit waits of tasks on the home (D297's armed waits: whose account, when it wakes, whether that is the reset). */
  waits?: () => { harness: string; at?: string; resetKnown: boolean }[];
}

interface Hold {
  harness: HarnessId;
  why: HoldWhy;
  /** The time it is tried again (the reset itself when resetKnown), ms. */
  until: number;
  resetKnown: boolean;
  /** When this time out began (a hit again soon after keeps it). */
  since: number;
  source?: string;
  said?: string;
  /** What the person was told last for it: who answers ("codex"), or "none". */
  told?: string;
}

/** When a hold is tried again: a known reset gets a little slack, so the first turn isn't refused at the edge. */
const tryAt = (h: Hold) => h.until + (h.resetKnown ? RESET_GRACE_MS : 0);

/** The latest reset a used-up window names (limits.ts usageReset). */
function usageReset(windows: { used: number; resetsAt?: string }[] | undefined, now: number): number | undefined {
  let best: number | undefined;
  for (const w of windows ?? []) {
    const t = Date.parse(w.resetsAt ?? "");
    if (!Number.isFinite(t) || t <= now || w.used < 0.999) continue;
    if (best === undefined || t > best) best = t;
  }
  return best;
}

const isHarness = (h: string): h is HarnessId => (HARNESS_IDS as readonly string[]).includes(h);

export function createBrainHold(o: BrainHoldDeps): BrainHold {
  const clock = o.clock ?? realClock;
  const holds = new Map<HarnessId, Hold>();
  const subs = new Set<() => void>();
  const timers = new Map<HarnessId, unknown>();
  /** Agents whose account said, at the last hit, that their limit is used up (read async, used sync). */
  const spent = new Map<string, number>();
  let stopped = false;

  const emit = () => {
    for (const f of subs) {
      try {
        f();
      } catch (err) {
        console.warn(`[brain-hold] ${(err as Error).message}`);
      }
    }
  };
  const arm = (h: Hold) => {
    if (timers.has(h.harness)) clock.clearTimeout(timers.get(h.harness));
    const ms = tryAt(h) - clock.now();
    if (ms <= 0 || stopped) return void timers.delete(h.harness);
    timers.set(
      h.harness,
      clock.setTimeout(() => {
        timers.delete(h.harness);
        if (!stopped) emit();
      }, ms),
    );
  };
  const active = (h: Hold | undefined, now = clock.now()): h is Hold => !!h && now < tryAt(h);

  // The holds as the Log has them (a restart keeps them).
  for (const e of o.log.read({ stream: "partner", kinds: ["partner_session"], beforeSeq: o.log.head() + 1, limit: 2000 })) {
    const b = e.body as Bodies["partner_session"];
    if (!isHarness(b.harness)) continue;
    if (b.event === "brain_back") holds.delete(b.harness);
    else if (b.event === "brain_held" && b.held) {
      const until = Date.parse(b.held.until);
      if (!Number.isFinite(until)) continue;
      holds.set(b.harness, { harness: b.harness, why: b.held.why, until, resetKnown: b.held.resetKnown, since: Date.parse(b.held.since) || until, ...(b.held.source ? { source: b.held.source } : {}), ...(b.held.said ? { said: b.held.said } : {}), ...(b.held.told ? { told: b.held.told } : {}) });
    }
  }
  for (const h of holds.values()) arm(h);

  const record = (h: Hold) => {
    o.log.append({
      stream: "partner",
      origin: "system",
      kind: "partner_session",
      body: {
        event: "brain_held",
        harness: h.harness,
        held: { why: h.why, until: new Date(h.until).toISOString(), resetKnown: h.resetKnown, since: new Date(h.since).toISOString(), ...(h.source ? { source: h.source } : {}), ...(h.said ? { said: h.said } : {}), ...(h.told ? { told: h.told } : {}) },
      },
    });
  };

  /** Never an agent the person's rules say never to use for anything (no words, no kind of work). */
  const ruledOut = (id: string) => (o.rules?.() ?? []).some((r) => r.never && !r.notice && r.harness === id && !r.model && !r.match.length && !r.kinds?.length);

  /** The next agent that can answer now: signed in on the home, may be the partner, not held, not spent, not ruled out. */
  function next(): HarnessId | undefined {
    const home = o.home();
    if (!home) return undefined;
    const now = clock.now();
    const order = [...PARTNER_FALLBACK, ...HARNESS_IDS.filter((h) => !PARTNER_FALLBACK.includes(h))];
    for (const id of order) {
      if (!HARNESSES[id].partner || !home.find((x) => x.harness === id)?.loggedIn) continue;
      if (active(holds.get(id), now) || ruledOut(id)) continue;
      if ((spent.get(id) ?? 0) > now) continue;
      return id;
    }
    return undefined;
  }

  function view(): HoldNow | undefined {
    const base = o.base();
    const h = holds.get(base);
    if (!active(h)) return undefined;
    const to = next();
    return { from: base, why: h.why, until: new Date(h.until).toISOString(), resetKnown: h.resetKnown, ...(to ? { to } : { waits: true as const }) };
  }

  /** Read the usage book for the agents that could take over, so next() can skip one already spent. */
  async function readSpent() {
    if (!o.usage) return;
    const now = clock.now();
    const home = o.home() ?? [];
    await Promise.all(
      home
        .filter((x) => x.loggedIn && isHarness(x.harness) && HARNESSES[x.harness].partner && !active(holds.get(x.harness as HarnessId), now))
        .map(async (x) => {
          const u = await o.usage!.get(x.harness).catch(() => undefined);
          if (u?.usage?.limited) spent.set(x.harness, usageReset(u.usage.windows, now) ?? now + UNKNOWN_RETRY_MS);
          else spent.delete(x.harness);
        }),
    );
  }

  /** D440: the agents were read and none that may be the partner can run and is signed in. */
  const blind = (): boolean => {
    const home = o.home();
    return !!home && !home.some((x) => isHarness(x.harness) && HARNESSES[x.harness].partner && x.loggedIn && x.installed !== false);
  };
  let wasBlind = blind();

  const api: BrainHold = {
    now: view,
    blind,
    async ahead() {
      const none = { tell: false, held: false };
      const base = o.base();
      const now = clock.now();
      if (active(holds.get(base), now)) return none;
      const waits = (o.waits?.() ?? []).filter((w) => w.harness === base && Date.parse(w.at ?? "") > now);
      if (!waits.length) return none;
      // The account itself, as last read (or read now): room left means the turn goes as it is.
      const read = o.usage ? (await o.usage.get(base).catch(() => undefined))?.usage : undefined;
      if (read && !read.limited) return none;
      // The reset: the account's used-up window, else the task's own known reset (its wait wakes a little after).
      const known = waits.filter((w) => w.resetKnown).map((w) => Date.parse(w.at!) - RESET_GRACE_MS);
      const reset = usageReset(read?.windows, now) ?? (known.length ? Math.max(...known) : undefined);
      // Nothing read and no reset known: only a guess; the turn tries (and is held if it fails).
      if (!read && reset === undefined) return none;
      const r = await api.hit({ harness: base, failure: "quota", ...(reset !== undefined && reset > now ? { resetsAt: new Date(reset).toISOString() } : {}), source: "account" });
      return { ...r, held: true };
    },
    seen() {
      const b = blind();
      if (b === wasBlind) return;
      wasBlind = b;
      if (!b && !stopped) emit();
    },
    async hit(hit) {
      if (!isHarness(hit.harness)) return { tell: false };
      const harness = hit.harness;
      const now = clock.now();
      let until = Date.parse(hit.resetsAt ?? "");
      let known = Number.isFinite(until) && until > now;
      // D297's order: the agent's own word; else what the account says is used up.
      if (!known && hit.failure === "quota" && o.usage) {
        const u = await o.usage.get(harness).catch(() => undefined);
        const r = usageReset(u?.usage?.windows, now);
        if (r) (until = r), (known = true);
      }
      if (!known) until = now + (hit.failure === "rate_limited" ? THROTTLE_RETRY_MS : hit.failure === "quota" ? UNKNOWN_RETRY_MS : ERROR_RETRY_MS);
      const prev = holds.get(harness);
      const same = !!prev && now - tryAt(prev) < AGAIN_MS;
      const h: Hold = {
        harness,
        why: hit.failure,
        until,
        resetKnown: known,
        since: same ? prev!.since : now,
        ...(hit.source ? { source: hit.source } : {}),
        ...(hit.said ? { said: hit.said.slice(0, 300) } : {}),
        ...(same && prev!.told ? { told: prev!.told } : {}),
      };
      holds.set(harness, h);
      await readSpent();
      // What the person hears is about the agent they think with: who answers now, or nobody.
      const v = view();
      let tell = false;
      const base = v ? holds.get(v.from) : undefined;
      if (v && base) {
        // Said once per time out: when it starts, and when nobody can answer any more (or someone can
        // again). Another agent taking over from the one answering is only shown, not said.
        const key = v.to ?? "none";
        tell = !base.told || (base.told === "none") !== (key === "none");
        base.told = key;
        if (base !== h) record(base);
      }
      record(h);
      arm(h);
      emit();
      return { ...(v ? { now: v } : {}), tell };
    },
    ok(harness) {
      if (!isHarness(harness) || !holds.has(harness)) return;
      holds.delete(harness);
      if (timers.has(harness)) clock.clearTimeout(timers.get(harness)), timers.delete(harness);
      o.log.append({ stream: "partner", origin: "system", kind: "partner_session", body: { event: "brain_back", harness } });
      emit();
    },
    onChange(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    stop() {
      stopped = true;
      for (const t of timers.values()) clock.clearTimeout(t);
      timers.clear();
      subs.clear();
    },
  };
  return api;
}
