// D276: everything the partner sends to a chat app goes through one outbox per chat: one call at a
// time, a gap between sends (about one message a second per chat, both services' limit), the
// service's own wait honoured when it asks (Telegram retry_after, Slack Retry-After), and a few
// tries with a growing pause when the network fails. A refusal that sending again won't fix
// (a revoked token, a blocked bot) fails at once and is reported, so the hub can say so in words.
import { ChannelError, RetryAfter } from "./port.ts";

export interface Outbox {
  /** Runs fn in this chat's line; resolves with its answer once it went through. */
  run<T>(chat: string, fn: () => Promise<T>, o?: { send?: boolean }): Promise<T>;
  /** Resolves when every line is empty (tests). */
  idle(): Promise<void>;
  stop(): void;
}

export const SEND_GAP_MS = 1_000;
export const MAX_TRIES = 5;
/** Never wait longer than this for a service that asked (a minute is already a lot). */
export const MAX_WAIT_MS = 120_000;

export function createOutbox(o: {
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  gapMs?: number;
  onTrouble?: (e: ChannelError) => void;
}): Outbox {
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = o.now ?? Date.now;
  const gap = o.gapMs ?? SEND_GAP_MS;
  const lines = new Map<string, Promise<unknown>>();
  const lastSend = new Map<string, number>();
  let stopped = false;

  const attempt = async <T>(chat: string, fn: () => Promise<T>, send: boolean): Promise<T> => {
    for (let n = 1; ; n++) {
      if (stopped) throw new Error("stopped");
      if (send) {
        const wait = (lastSend.get(chat) ?? -Infinity) + gap - now();
        if (wait > 0) await sleep(wait);
      }
      try {
        const r = await fn();
        if (send) lastSend.set(chat, now());
        return r;
      } catch (err) {
        if (err instanceof RetryAfter && n < MAX_TRIES) {
          await sleep(Math.min(err.ms, MAX_WAIT_MS));
          continue;
        }
        if (err instanceof ChannelError && err.permanent) {
          if (err.trouble !== "refused") o.onTrouble?.(err);
          throw err;
        }
        if (n >= MAX_TRIES) throw err;
        await sleep(Math.min(1000 * 2 ** (n - 1), 30_000));
      }
    }
  };

  return {
    run(chat, fn, opts = {}) {
      const prev = lines.get(chat) ?? Promise.resolve();
      const next = prev.catch(() => {}).then(() => attempt(chat, fn, opts.send !== false));
      lines.set(chat, next);
      void next.catch(() => {}).finally(() => lines.get(chat) === next && lines.delete(chat));
      return next;
    },
    async idle() {
      while (lines.size) await Promise.allSettled([...lines.values()]);
    },
    stop() {
      stopped = true;
    },
  };
}
