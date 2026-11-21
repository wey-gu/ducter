// D449 (research/195, research/194 ★1): a free key's day, known and spent on what the person sees
// first. A key a provider says is on its free tier (OpenRouter's is_free_tier; a Gemini key, free
// until its project turns on billing) is kept as such here, next to the day's count:
//   - known: the cap is the provider's documented one (OpenRouter: 50 a day under $10 of credit) or
//     the one it said in a limit answer (Gemini's `limit: N`, OpenRouter's X-RateLimit-*); the
//     count is Ducter's own (one request per turn, plus one per finished tool call), set right
//     whenever the provider says what is left;
//   - spent first on the person: on a free key the fresh look (D437) and the doc check's bounce
//     (D439) don't spend it, and a task's brief asks it to be frugal;
//   - said truly: a limit answer gives the provider's own reset (its header, else its day
//     boundary), which D435's hold and D297's waits use instead of a guessed hour.
// Kept in <dataDir>/free-budget.json (no key, no words: which providers are free, the day's count).
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FREE_PROVIDERS, FREE_TIERS, freeDayKey, freeDayReset, freeProviderOfModel, readFreeLimit, type Bodies, type FreeBudget, type FreeLimitRead, type FreeProvider, type LogEvent } from "@ducter/protocol";
import type { LogStore } from "@ducter/protocol/src/internal.ts";
import { realClock, type Clock } from "./clock.ts";

interface Day {
  day: string;
  used: number;
  /** What the provider said was left, and Ducter's count when it said it. */
  left?: number;
  usedAtLeft?: number;
  /** The day's cap is spent until this instant (ms). */
  outUntil?: number;
}

interface State {
  /** Each provider whose key was pasted: free (true) or paid (false). */
  keys: Partial<Record<FreeProvider, boolean>>;
  /** A cap the provider said (Gemini's per project), kept across days. */
  limits: Partial<Record<FreeProvider, number>>;
  days: Partial<Record<FreeProvider, Day>>;
  /** The once-said line that a fresh look was skipped on the free key. */
  toldLookOff?: boolean;
}

export interface FreeBudgetBook {
  /** A pasted key was taken: its provider, free or not (a paid key ends the pacing). */
  mark(provider: string, free: boolean): void;
  /** The free tier the home's pi thinks on now, or undefined (a paid key, a plan, no key). */
  provider(): FreeProvider | undefined;
  /** This agent spends the free key (pi on a free provider). */
  frugal(harness: string): boolean;
  /** Requests a turn spent on this agent (counted when it is the free key's). */
  spend(harness: string, requests: number): void;
  /** The provider said its limit (a failed turn's words, read by readFreeLimit). */
  limited(read: FreeLimitRead): void;
  /** Settings › Partner's readout; undefined when not on a free key. */
  view(): FreeBudget | undefined;
  /** The day's cap is nearly spent: only what the person asked for spends it. */
  low(): boolean;
  /** A fresh look was skipped on the free key: true the first time ever (say it once). */
  lookSkipped(): boolean;
  onChange(fn: () => void): () => void;
  stop(): void;
}

export interface FreeBudgetDeps {
  dataDir: string;
  /** What the partner thinks with (the setting): pi's model names the provider. */
  brain: () => { harness: string; model?: string };
  clock?: Clock;
  /** The Log: tasks' turns and limit hits on pi are counted from it. */
  log?: LogStore;
  /** The agent a task runs on. */
  taskHarness?: (taskId: string) => string | undefined;
  /** The person's language, for the once-said line. */
  lang?: () => string | undefined;
}

const FILE = "free-budget.json";
const LOOK_OFF = {
  zh: "这个结果没让另一个 AI 再看一遍：用的是免费额度，先留给你自己的事。",
  en: "I didn't have another AI look this one over: the free allowance is kept for your own asks.",
};
export const lookOffWords = (lang: string | undefined) => (/^zh/i.test(lang ?? "") ? LOOK_OFF.zh : LOOK_OFF.en);

/** Left at or under this share of the cap (and FREE_RESERVE): low. */
const LOW_SHARE = 0.2;

export function createFreeBudget(d: FreeBudgetDeps): FreeBudgetBook {
  const clock = d.clock ?? realClock;
  const path = join(d.dataDir, FILE);
  const subs = new Set<() => void>();
  let state: State = { keys: {}, limits: {}, days: {} };
  try {
    if (existsSync(path)) {
      const j = JSON.parse(readFileSync(path, "utf8")) as Partial<State>;
      state = { keys: j.keys ?? {}, limits: j.limits ?? {}, days: j.days ?? {}, ...(j.toldLookOff ? { toldLookOff: true } : {}) };
    }
  } catch (err) {
    console.warn(`[free-budget] couldn't read ${FILE}:`, (err as Error).message);
  }
  const save = () => {
    try {
      const tmp = `${path}.tmp`;
      writeFileSync(tmp, JSON.stringify(state), { mode: 0o600 });
      renameSync(tmp, path);
    } catch (err) {
      console.warn(`[free-budget] couldn't keep ${FILE}:`, (err as Error).message);
    }
  };
  const emit = () => {
    for (const f of subs) {
      try {
        f();
      } catch (err) {
        console.warn("[free-budget]", (err as Error).message);
      }
    }
  };

  const provider = (): FreeProvider | undefined => {
    const b = d.brain();
    const named = b.harness === "pi" ? freeProviderOfModel(b.model) : undefined;
    if (named) return state.keys[named] ? named : undefined;
    // pi on its own default, or the partner on another agent while tasks run on pi: the one free key, when it's the only one kept.
    const kept = FREE_PROVIDERS.filter((p) => state.keys[p] !== undefined);
    return kept.length === 1 && state.keys[kept[0]!] ? kept[0] : undefined;
  };

  /** Today's page for the provider (a new day starts empty; a spent cap past its reset is over). */
  const today = (p: FreeProvider): Day => {
    const now = clock.now();
    const key = freeDayKey(p, now);
    let day = state.days[p];
    if (!day || day.day !== key) {
      // A cap spent until a reset still to come (a header that said so) stays.
      day = { day: key, used: 0, ...(day?.outUntil && day.outUntil > now ? { outUntil: day.outUntil } : {}) };
      state.days[p] = day;
    }
    if (day.outUntil && day.outUntil <= now) delete day.outUntil;
    return day;
  };

  const capOf = (p: FreeProvider) => state.limits[p] ?? FREE_TIERS[p].perDay;
  const leftOf = (p: FreeProvider, day: Day): number | undefined => {
    if (day.outUntil) return 0;
    if (day.left !== undefined) return Math.max(0, day.left - (day.used - (day.usedAtLeft ?? day.used)));
    const cap = capOf(p);
    return cap === undefined ? undefined : Math.max(0, cap - day.used);
  };

  // A timer to say the day is back when a spent cap's reset comes.
  let timer: unknown;
  const arm = () => {
    if (timer !== undefined) clock.clearTimeout(timer), (timer = undefined);
    const p = provider();
    const until = p ? state.days[p]?.outUntil : undefined;
    if (!until) return;
    timer = clock.setTimeout(() => {
      timer = undefined;
      emit();
    }, Math.max(0, until - clock.now()));
  };

  const api: FreeBudgetBook = {
    mark(p, free) {
      if (!(FREE_PROVIDERS as readonly string[]).includes(p)) return;
      if (state.keys[p as FreeProvider] === free) return;
      state.keys[p as FreeProvider] = free;
      save();
      emit();
    },
    provider,
    frugal: (harness) => harness === "pi" && !!provider(),
    spend(harness, requests) {
      if (harness !== "pi" || requests <= 0) return;
      const p = provider();
      if (!p) return;
      const day = today(p);
      day.used += Math.round(requests);
      save();
      emit();
    },
    limited(read) {
      const day = today(read.provider);
      const now = clock.now();
      if (read.limit !== undefined && read.scope === "day") state.limits[read.provider] = read.limit;
      if (read.left !== undefined) (day.left = read.left), (day.usedAtLeft = day.used);
      if (read.scope === "day") {
        const t = Date.parse(read.resetsAt);
        day.outUntil = Number.isFinite(t) && t > now ? t : Date.parse(freeDayReset(read.provider, now));
        day.left = 0;
        day.usedAtLeft = day.used;
      }
      save();
      arm();
      emit();
    },
    view() {
      const p = provider();
      if (!p) return undefined;
      const day = today(p);
      const now = clock.now();
      const cap = capOf(p);
      const left = leftOf(p, day);
      const resetsAt = day.outUntil ? new Date(day.outUntil).toISOString() : freeDayReset(p, now);
      return { provider: p, ...(cap !== undefined ? { limit: cap } : {}), ...(left !== undefined ? { left } : {}), resetsAt, ...(day.outUntil ? { out: true as const } : {}) };
    },
    low() {
      const p = provider();
      if (!p) return false;
      const day = today(p);
      const left = leftOf(p, day);
      const cap = capOf(p);
      if (left === undefined || cap === undefined) return !!day.outUntil;
      return left <= Math.max(8, Math.floor(cap * LOW_SHARE));
    },
    lookSkipped() {
      if (state.toldLookOff) return false;
      state.toldLookOff = true;
      save();
      return true;
    },
    onChange(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    stop() {
      offLog?.();
      if (timer !== undefined) clock.clearTimeout(timer), (timer = undefined);
      subs.clear();
    },
  };

  // Tasks on pi: each finished tool call and each turn's end is a request on the key; a limit hit
  // (the runner's raw.limit, the partner's brain_held) is the provider's own word on its day.
  const fromHit = (said: string | undefined, free: FreeProvider | undefined, failure: string | undefined, resetsAt: string | undefined) => {
    const read = readFreeLimit(said, clock.now());
    if (read) return api.limited(read);
    if (free && resetsAt) api.limited({ provider: free, scope: failure === "rate_limited" ? "minute" : "day", resetsAt, source: "documented" });
  };
  let pendingLookOff = false;
  const offLog = d.log?.subscribe((e: LogEvent) => {
    if (e.kind === "task_event") {
      const b = e.body as Bodies["task_event"];
      const raw = b.raw as { turnEnd?: boolean; outcome?: string; limit?: { harness?: string; free?: FreeProvider; said?: string; failure?: string; resetsAt?: string } } | undefined;
      if (raw?.limit) {
        if (raw.limit.harness === "pi") fromHit(raw.limit.said, raw.limit.free, raw.limit.failure, raw.limit.resetsAt);
        return;
      }
      const harness = d.taskHarness?.(b.taskId);
      if (harness !== "pi") return;
      if (b.role === "tool" && b.tool && (b.tool.output !== undefined || b.tool.ok !== undefined)) api.spend("pi", 1);
      else if (raw?.turnEnd && raw.outcome !== "failed") api.spend("pi", 1);
      return;
    }
    if (e.kind === "partner_session") {
      const b = e.body as Bodies["partner_session"];
      if (b.event === "brain_held" && b.harness === "pi" && b.held && (b.held.why === "quota" || b.held.why === "rate_limited")) {
        // Said once: a hold recorded again for the same time out doesn't move the day.
        const day = b.held.free ? state.days[b.held.free] : undefined;
        if (day?.outUntil && Math.abs(day.outUntil - Date.parse(b.held.until)) < 1000) return;
        fromHit(b.held.said, b.held.free, b.held.why, b.held.resetKnown ? b.held.until : undefined);
      }
      return;
    }
    // D449: the once-said line that a look was skipped goes right after the partner's next words.
    if (pendingLookOff && e.kind === "ai_msg" && e.origin === "partner" && e.stream === "channel" && (e.body as Bodies["ai_msg"]).text !== lookOffWords(d.lang?.())) {
      pendingLookOff = false;
      d.log!.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: lookOffWords(d.lang?.()) } });
    }
  });
  const skipped = api.lookSkipped;
  api.lookSkipped = () => {
    const first = skipped();
    if (first) pendingLookOff = true;
    return first;
  };
  arm();
  return api;
}
