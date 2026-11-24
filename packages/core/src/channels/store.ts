// D276: what the home keeps about the chat apps, in <dataDir>/channels.json (0600, like every key
// file, D102): the bot's token(s), who the bot is, the one linked account, Telegram's read offset,
// and where the person last spoke. Tokens are never logged and never sent to a client.
//
// Pairing codes are D83's shape (8 letters from the same alphabet, 10 minutes, one use) but live in
// memory only: a restart voids them, and a code links a chat account, never a device.
import { createHash, randomInt } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ChannelKind } from "@ducter/protocol";
import { CODE_ALPHABET, CODE_TTL_MS, formatCode, normalizeCode } from "../auth.ts";

export interface LinkedAccount {
  id: string; // the service's user id
  chat: string; // where to write to them
  name: string;
  at: string;
}

export interface ChannelRec {
  /** Telegram: the BotFather token. Slack: the bot token (xoxb-). */
  token: string;
  /** Slack: the app-level token (xapp-) Socket Mode opens with. */
  appToken?: string;
  bot?: { id: string; name: string; handle?: string; team?: string };
  linked?: LinkedAccount;
  /** Telegram: the next update to read (confirmed only after it was handled). */
  offset?: number;
  strangerAt?: string;
  /** D301, WeChat: the base the scan answered, its newest context_token, getupdates' cursor. */
  base?: string;
  ctx?: string;
  buf?: string;
  /** D301: when the person last wrote there, and how many messages went out since (the window). */
  heardAt?: string;
  sentSince?: number;
  /** D516: the other partners already told how to talk to them in this chat app (once each). */
  hinted?: string[];
}

interface File {
  telegram?: ChannelRec;
  slack?: ChannelRec;
  wechat?: ChannelRec;
  /** Where the person last spoke to the partner: a chat app, or "app" (any Ducter app). */
  lastRoute?: ChannelKind | "app";
}

const CODE_LEN = 8;
const MAX_FAILS_PER_SENDER = 5;
const MAX_FAILS_GLOBAL = 30;
const FAIL_WINDOW_MS = 10 * 60_000;

export interface ChannelStore {
  get(kind: ChannelKind): ChannelRec | undefined;
  set(kind: ChannelKind, rec: ChannelRec | undefined): void;
  patch(kind: ChannelKind, p: Partial<ChannelRec>): void;
  lastRoute(): ChannelKind | "app";
  setLastRoute(r: ChannelKind | "app"): void;
  /** A fresh one-time code for this chat app. */
  newCode(kind: ChannelKind): { code: string; raw: string; expiresAt: number };
  /**
   * Does text carry a live code for this chat app? A match is used up. sender is the service's id
   * of whoever wrote it, for the lockouts; a locked sender is not even checked.
   */
  redeem(kind: ChannelKind, text: string, sender: string): boolean;
}

export function openChannelStore(dataDir: string, o: { now?: () => number } = {}): ChannelStore {
  const now = o.now ?? Date.now;
  const path = join(dataDir, "channels.json");
  let data: File = {};
  if (existsSync(path)) {
    try {
      data = JSON.parse(readFileSync(path, "utf8")) as File;
    } catch (err) {
      console.warn("[channels] channels.json unreadable, starting empty:", (err as Error).message);
    }
  }
  const save = () => {
    if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
    chmodSync(tmp, 0o600);
    renameSync(tmp, path);
  };
  if (existsSync(path)) chmodSync(path, 0o600);

  const sha = (s: string) => createHash("sha256").update(s).digest("hex");
  const codes = new Map<string, { kind: ChannelKind; expiresAt: number }>(); // sha(raw) → …
  const fails = new Map<string, number[]>();
  let globalFails: number[] = [];
  const recent = (xs: number[]) => xs.filter((t) => now() - t < FAIL_WINDOW_MS);

  return {
    get: (k) => data[k],
    set(k, rec) {
      if (rec) data[k] = rec;
      else delete data[k];
      save();
    },
    patch(k, p) {
      const cur = data[k];
      if (!cur) return;
      data[k] = { ...cur, ...p };
      for (const [key, v] of Object.entries(p)) if (v === undefined) delete (data[k] as unknown as Record<string, unknown>)[key];
      save();
    },
    lastRoute: () => data.lastRoute ?? "app",
    setLastRoute(r) {
      if ((data.lastRoute ?? "app") === r) return;
      data.lastRoute = r;
      save();
    },
    newCode(kind) {
      for (const [h, c] of codes) if (c.expiresAt <= now()) codes.delete(h);
      let raw = "";
      for (let i = 0; i < CODE_LEN; i++) raw += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
      const expiresAt = now() + CODE_TTL_MS;
      codes.set(sha(raw), { kind, expiresAt });
      return { code: formatCode(raw), raw, expiresAt };
    },
    redeem(kind, text, sender) {
      const key = `${kind}:${sender}`;
      if (recent(fails.get(key) ?? []).length >= MAX_FAILS_PER_SENDER) return false;
      // The code anywhere in the words ("/start K7QM4XPA", "K7QM-4XPA", "my code is k7qm 4xpa").
      // Every 8 letters in a row of the words (they are short: a code is the whole message).
      const flat = normalizeCode(text.slice(0, 120));
      if (flat.length < CODE_LEN) return false; // not a try at a code: "hi" counts against nobody
      for (let i = 0; i + CODE_LEN <= flat.length; i++) {
        const h = sha(flat.slice(i, i + CODE_LEN));
        const c = codes.get(h);
        if (c && c.kind === kind && c.expiresAt > now()) {
          codes.delete(h);
          return true;
        }
      }
      fails.set(key, [...recent(fails.get(key) ?? []), now()]);
      globalFails = [...recent(globalFails), now()];
      // Too many wrong tries from anyone: every pending code is void (Settings makes a new one).
      if (globalFails.length >= MAX_FAILS_GLOBAL) codes.clear(), (globalFails = []);
      return false;
    },
  };
}
