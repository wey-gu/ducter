// D523: the page's link to its home, by D520's rule. A paired page (a browser, or the iPhone,
// iPad and Android apps that show it) leaves its pairing only on the home's own signed word that
// this device is revoked or unknown. A refused socket, a 401 or 502 from a proxy while the home
// restarts, a sleep or a network change keeps the device token and the screen: a quiet line
// first, after LONG_OUTAGE_MS a notice that says what is wrong, and retrying all the while.
import { askStandingWeb, type StandingAnswer } from "@ducter/protocol/src/reach-verify-web.ts";

/** How long a lost link is only said quietly (the Mac's LongOutage). */
export const LONG_OUTAGE_MS = 30_000;

/**
 * A home from before D520 has no standing to ask. Its 401 is then taken the old way (the device
 * was disconnected) only after this many tries, the first and the last at least OLD_HOME_WINDOW_MS
 * apart, with no answer in between: a proxy's 401 during a restart lasts seconds to minutes, a
 * revoke lasts for good. A home that has ever answered its standing never gets here.
 */
export const OLD_HOME_TRIES = 5;
export const OLD_HOME_WINDOW_MS = 15 * 60_000;
/** A refused socket asks at most this often (a tap on Try now, or coming back, asks at once). */
export const JUDGE_EVERY_MS = 30_000;
/** A refused socket asks /api/me at most this often (the socket itself retries quicker). */
export const ME_EVERY_MS = 5_000;

export type LinkState = "up" | "back" | "lost";

/** The link as the person meets it: up, lost a moment ago (back), or lost for a while. */
export function linkState(status: "connecting" | "connected" | "offline", downAt: number, now: number): LinkState {
  if (status === "connected" || !downAt) return "up";
  return now - downAt >= LONG_OUTAGE_MS ? "lost" : "back";
}

/** What this device remembers of its home's answers (localStorage, beside the device record). */
export interface LinkMemo {
  /** The home has answered a signed standing: it has the endpoint, so no 401 is ever taken alone. */
  standing?: boolean;
  /** An old home's 401s in a row, and when the first came. */
  strikes?: number;
  firstAt?: number;
  /** The home's name, from its last devices frame (the link's words before it answers again). */
  home?: string;
}

type Kv = { getItem(k: string): string | null; setItem(k: string, v: string): void };
const MEMO = "ducter.link.v1";

export function memoStore(kv: Kv | undefined = globalThis.localStorage) {
  return {
    get(): LinkMemo {
      try {
        return JSON.parse(kv?.getItem(MEMO) ?? "{}") ?? {};
      } catch {
        return {};
      }
    },
    set(m: LinkMemo) {
      try {
        kv?.setItem(MEMO, JSON.stringify(m));
      } catch {}
    },
  };
}
export type MemoStore = ReturnType<typeof memoStore>;

/** keep: stay paired and keep retrying. revoked / unknown: the pair screen, in those words. */
export type Verdict = { kind: "keep"; answer?: StandingAnswer } | { kind: "revoked" | "unknown"; answer: StandingAnswer | "old-home" };

export interface JudgeDeps {
  base: URL;
  token: string;
  /** The home's key fingerprint pinned at pairing (or from the first welcome on this device). */
  fp?: string;
  memo: MemoStore;
  fetch?: typeof fetch;
  now?: () => number;
}

/** The home answered this device (a welcome, a 200): an old home's run of 401s is over. */
export function heard(memo: MemoStore) {
  const m = memo.get();
  if (m.strikes) memo.set({ ...m, strikes: 0, firstAt: 0 });
}

/**
 * Something refused this device's credential (a 401 from its own origin, a socket refused before
 * its welcome). Asks the home; only its verified revoked or unknown, or an old home's 401 held for
 * OLD_HOME_TRIES tries over OLD_HOME_WINDOW_MS, ends the pairing.
 */
export async function judge(d: JudgeDeps): Promise<Verdict> {
  const now = (d.now ?? Date.now)();
  const answer = await askStandingWeb(d.base, d.token, d.fp, { fetch: d.fetch });
  const m = d.memo.get();
  switch (answer) {
    case "live":
      d.memo.set({ ...m, standing: true, strikes: 0, firstAt: 0 });
      return { kind: "keep", answer };
    case "revoked":
    case "unknown":
      d.memo.set({ ...m, standing: true, strikes: 0, firstAt: 0 });
      return { kind: answer, answer };
    case "absent": {
      if (m.standing) return { kind: "keep", answer }; // a proxy in front of a home that has it
      const strikes = (m.strikes ?? 0) + 1;
      const firstAt = m.strikes ? (m.firstAt ?? now) : now;
      d.memo.set({ ...m, strikes, firstAt });
      if (strikes >= OLD_HOME_TRIES && now - firstAt >= OLD_HOME_WINDOW_MS) return { kind: "revoked", answer: "old-home" };
      return { kind: "keep", answer };
    }
    default:
      // forged (a proof that doesn't verify, or nothing pinned to check it with) or unreachable:
      // nothing the home said. Never a revoke, and never one of an old home's strikes either.
      return { kind: "keep", answer };
  }
}

/**
 * The page's watch on its link (main.tsx wires it; the tests drive it over a fake home behind a
 * fake proxy). unauthorized(): a 401 from the page's own origin. refused(): a socket closed
 * before its welcome, which asks /api/me first (a home that is down says nothing, a 401 is asked
 * about). Only `gone` ends the pairing, and only on judge()'s revoked or unknown.
 */
export function createLinkWatch(o: { deps: () => JudgeDeps | undefined; me: () => Promise<number>; gone: (kind: "revoked" | "unknown") => void | Promise<void>; now?: () => number }) {
  const judging = createJudge(o.deps, { now: o.now });
  let ended = false;
  const unauthorized = async (now = false): Promise<Verdict | undefined> => {
    if (ended) return;
    const v = await judging.ask(now);
    if (v && v.kind !== "keep" && !ended) {
      ended = true;
      await o.gone(v.kind);
    }
    return v;
  };
  let meAt = -Infinity;
  return {
    unauthorized,
    /** Paired again: watch the new pairing. */
    reset: () => void (ended = false),
    async refused(now = false): Promise<Verdict | undefined> {
      const d = o.deps();
      if (!d || ended) return;
      const t = (o.now ?? Date.now)();
      if (!now && t - meAt < ME_EVERY_MS) return;
      meAt = t;
      const status = await o.me();
      if (status === 401) return unauthorized(now);
      if (status === 200) heard(d.memo);
      return;
    },
  };
}

/**
 * Asks when a credential is refused, at most every JUDGE_EVERY_MS unless asked now, and only one
 * question at a time. ask() returns the verdict, or undefined when it didn't ask.
 */
export function createJudge(deps: () => JudgeDeps | undefined, o: { now?: () => number } = {}) {
  let lastAt = -Infinity;
  let busy: Promise<Verdict | undefined> | undefined;
  return {
    ask(now = false): Promise<Verdict | undefined> {
      const t = (o.now ?? Date.now)();
      if (busy) return busy;
      if (!now && t - lastAt < JUDGE_EVERY_MS) return Promise.resolve(undefined);
      const d = deps();
      if (!d) return Promise.resolve(undefined);
      lastAt = t;
      busy = judge(d).finally(() => (busy = undefined));
      return busy;
    },
  };
}
