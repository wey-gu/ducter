// D288: each AI agent's account usage limits on the home, for a task's context card: read from
// the agent itself (OAR accountUsage, no model call: Claude Code starts once in --safe-mode for
// get_usage, Codex asks its app-server account/rateLimits/read), at most every few minutes, and
// kept current by what running sessions say (a limit hit, Codex's rate-limit updates).
import type { AccountUsage } from "@ducter/protocol";
import type { HarnessEvent } from "@ducter/protocol/src/internal.ts";

export type UsageAnswer = { usage?: AccountUsage; why?: "unsupported" | "signed_out" | "unavailable" };

export interface AccountUsageBook {
  /** The last read when fresh enough (or fresh: false), else a new read; one read at a time per agent. */
  get(harness: string, fresh?: boolean): Promise<UsageAnswer>;
  /** What a running session said: merged into the last read by window id (a new one is added). */
  seen(harness: string, limits: NonNullable<HarnessEvent["limits"]>): void;
  /** D478: what was last read or heard, with no read (the partner's world line). */
  peek(harness: string): UsageAnswer | undefined;
}

/** How long a read stands before the card reads again. */
export const USAGE_FRESH_MS = 5 * 60_000;

export function createAccountUsage(o: { read: (harness: string) => Promise<UsageAnswer>; now?: () => number }): AccountUsageBook {
  const now = o.now ?? Date.now;
  const book = new Map<string, { answer: UsageAnswer; at: number }>();
  const reading = new Map<string, Promise<UsageAnswer>>();
  return {
    peek: (harness) => book.get(harness)?.answer,
    async get(harness, fresh) {
      const had = book.get(harness);
      if (had && !fresh && now() - had.at < USAGE_FRESH_MS) return had.answer;
      const inFlight = reading.get(harness);
      if (inFlight) return inFlight;
      const p = o
        .read(harness)
        .catch((): UsageAnswer => ({ why: "unavailable" }))
        .then((answer) => {
          // A failed read keeps what the sessions said since.
          if (answer.usage || !had?.answer.usage) book.set(harness, { answer, at: now() });
          return book.get(harness)?.answer ?? answer;
        })
        .finally(() => reading.delete(harness));
      reading.set(harness, p);
      return p;
    },
    seen(harness, limits) {
      const had = book.get(harness)?.answer.usage;
      const at = new Date(now()).toISOString();
      const windows = [...(had?.windows ?? [])];
      for (const w of limits.windows) {
        const i = w.id ? windows.findIndex((x) => x.id === w.id) : -1;
        if (i >= 0) windows[i] = { ...windows[i]!, ...w };
        else windows.push(w);
      }
      const usage: AccountUsage = {
        harness,
        ...(had?.plan || limits.plan ? { plan: had?.plan ?? limits.plan } : {}),
        ...(had?.account ? { account: had.account } : {}),
        ...(limits.limited !== undefined ? (limits.limited ? { limited: true } : {}) : had?.limited ? { limited: true } : {}),
        windows,
        at,
      };
      // Seen live is no fresher a read: the time of the last real read stands.
      book.set(harness, { answer: { usage }, at: book.get(harness)?.at ?? 0 });
    },
  };
}
