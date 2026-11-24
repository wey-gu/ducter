// D293: a home has a key and a list of ways to reach it (its address book), not one address.
// Every device keeps the list, tries the ways it can use, proves each one leads to the home (a
// nonce the home signs with its key) and keeps the best one that answers. Pure: no network, no
// crypto, no clock of its own, so the web bundle can import it and tests drive it with fakes.
// The signature check itself is in reach-verify.ts (node:crypto; CLI, workers, core).

/**
 * How a way reaches the home. lan: the same network (reserved for D293's step 4, nothing adds it
 * yet); tailnet: the person's Tailscale network (D265); domain: their own domain (Caddy on the
 * home, D54); tunnel: their own Cloudflare tunnel (D228).
 */
export type WayKind = "lan" | "tailnet" | "domain" | "tunnel";
export const WAY_KINDS: readonly WayKind[] = ["lan", "tailnet", "domain", "tunnel"];

/** The order a device tries ways in: the nearest, most private first. */
export const WAY_RANK: Record<WayKind, number> = { lan: 0, tailnet: 1, domain: 2, tunnel: 3 };

/** up: the home's own check, or a device connected through it now, says it answers. */
export type WayState = "up" | "down" | "unknown";

export interface ReachWay {
  kind: WayKind;
  /** The http(s) base, no trailing slash: https://hel.example.com, https://hel.tail1234.ts.net. */
  url: string;
  /** The one pairing links lead with, and the only one a Ducter from before D293 knows (public-url). */
  primary?: boolean;
  state?: WayState;
  /** ISO: when the home last checked it from itself. */
  checkedAt?: string;
}

/**
 * How a device is connected to the home right now, as the home sees the request that opened its
 * socket. local: on the home's own computer (loopback, no network). sealed: nobody between the
 * device and the home can read the traffic (false through a Cloudflare tunnel or a domain behind
 * Cloudflare's proxy, whose edge opens it; false for plain http on a network).
 */
export interface DeviceVia {
  kind: WayKind | "local";
  sealed: boolean;
}

/** The home's key, as devices pin it: the raw Ed25519 public key and its fingerprint (both base64url). */
export interface HomeKey {
  key: string;
  fp: string;
}

/** What the home answers at CHALLENGE_PATH?n=<nonce>: its key and its signature of the nonce. */
export interface HomeProof {
  v: 1;
  key: string;
  fp: string;
  sig: string;
}

export const CHALLENGE_PATH = "/.well-known/ducter-home";
/** What the home signs: never a bare nonce, so the key signs nothing else by accident. */
export const challengeText = (nonce: string) => `ducter-home\n${nonce}`;

/**
 * D520: whether the home still knows a device's credential, asked when its socket was refused.
 * A refused upgrade alone proves nothing (a proxy answers 502 while the home restarts), so a
 * device leaves its pairing only on this answer, signed by the pinned key over its own nonce.
 * live: the credential works; revoked: the home disconnected this device (`ducter devices`);
 * unknown: the home has no such credential (another home's, or its devices were reset).
 */
export type DeviceStanding = "live" | "revoked" | "unknown";
export const STANDING_PATH = "/.well-known/ducter-device";
export interface StandingProof {
  v: 1;
  standing: DeviceStanding;
  /** The device id the offered credential names ("" when it names none). */
  device: string;
  key: string;
  fp: string;
  sig: string;
}
/** What the home signs for a standing: never a bare nonce, and never a challenge's text. */
export const standingText = (standing: DeviceStanding, device: string, nonce: string) => `ducter-device\n${standing}\n${device}\n${nonce}`;

export const normalizeBase = (url: string): string => url.trim().replace(/\/+$/, "");

/** A way's kind from its address alone (a ts.net name is the tailnet; anything else a domain). */
export function kindOfUrl(url: string): WayKind {
  try {
    const h = new URL(url).hostname;
    if (/\.ts\.net$/i.test(h)) return "tailnet";
    if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)|\.local$/i.test(h)) return "lan";
  } catch {}
  return "domain";
}

/** The ways a device may try, best first (the rank, then the primary, then the list's order). */
export function ranked(ways: readonly ReachWay[]): ReachWay[] {
  return ways
    .map((w, i) => ({ w, i }))
    .sort((a, b) => WAY_RANK[a.w.kind] - WAY_RANK[b.w.kind] || Number(!!b.w.primary) - Number(!!a.w.primary) || a.i - b.i)
    .map((x) => x.w);
}

/** A way's pairing link fragment: the code and the home's fingerprint (`#c=K7QM-4XPA&k=<fp>`). */
export const pairFragment = (code: string, fp?: string) => `c=${code}${fp ? `&k=${fp}` : ""}`;

/** The fingerprint in a pairing link (`…/pair#c=…&k=<fp>`), or undefined. */
export function fpFromLink(link: string): string | undefined {
  return /[#&?]k=([A-Za-z0-9_-]{16,64})/.exec(link)?.[1];
}

// ---------- choosing a way ----------

export interface RaceOptions {
  /** Answers whether the home behind this base proved itself (signed the nonce with the pinned key). */
  probe(url: string): Promise<boolean>;
  /** Waits ms (a fake clock in tests). */
  sleep(ms: number): Promise<void>;
  /** Each way starts this much after the one before it (happy eyeballs). */
  staggerMs?: number;
  /** After the first answer, how long a better-ranked way still pending may take to win. */
  graceMs?: number;
}

/**
 * Tries every way, best first, each one staggerMs after the one before, and keeps the best that
 * proves it is the home. A better-ranked way still pending when a worse one answers gets graceMs
 * more. Undefined when none answers.
 */
export async function race(ways: readonly ReachWay[], o: RaceOptions): Promise<string | undefined> {
  const list = ranked(ways);
  if (!list.length) return undefined;
  const stagger = o.staggerMs ?? 250;
  const grace = o.graceMs ?? 300;
  const result = new Map<number, boolean>();
  let wake: (() => void) | undefined;
  const ping = () => wake?.();
  list.forEach((w, i) => {
    void (async () => {
      if (i) await o.sleep(stagger * i);
      let ok = false;
      try {
        ok = await o.probe(w.url);
      } catch {}
      result.set(i, ok);
      ping();
    })();
  });
  let firstAt: number | undefined;
  let graceOver = false;
  for (;;) {
    // The best answer so far, if nothing better-ranked is still pending (or the grace ran out).
    let best: number | undefined;
    for (let i = 0; i < list.length; i++) {
      const r = result.get(i);
      if (r === true) {
        best = i;
        break;
      }
      if (r === undefined && !(firstAt !== undefined && graceOver)) {
        best = undefined;
        break;
      }
    }
    if (best !== undefined) return list[best]!.url;
    if (result.size === list.length) return undefined;
    if (firstAt === undefined && [...result.values()].some(Boolean)) {
      firstAt = 0;
      void o.sleep(grace).then(() => ((graceOver = true), ping()));
    }
    await new Promise<void>((r) => (wake = r));
    wake = undefined;
  }
}

export interface KeeperOptions {
  probe(url: string): Promise<boolean>;
  /** How many misses in a row make a device leave the way it is on (and answers in a row move it to a better one). */
  misses?: number;
}

/**
 * The 30-second look while connected (the caller's timer calls tick): the way in use and every
 * better one are probed. The device leaves its way only after `misses` misses in a row, for the
 * best way that answered this time; it moves up to a better way only after that way answered
 * `misses` times in a row. So one lost packet never moves it, and two ways that both work never
 * flap. Returns the url to move to, or undefined to stay.
 */
export function createKeeper(o: KeeperOptions & { ways: () => readonly ReachWay[]; current: () => string | undefined }) {
  const need = o.misses ?? 2;
  const streak = new Map<string, number>(); // >0 answers in a row, <0 misses in a row
  const note = (url: string, ok: boolean) => {
    const s = streak.get(url) ?? 0;
    streak.set(url, ok ? Math.max(s, 0) + 1 : Math.min(s, 0) - 1);
  };
  return {
    streak: (url: string) => streak.get(url) ?? 0,
    async tick(): Promise<string | undefined> {
      const list = ranked(o.ways());
      const cur = o.current();
      const at = list.findIndex((w) => normalizeBase(w.url) === normalizeBase(cur ?? ""));
      // On a way the list doesn't have (an address typed by hand, an old pairing): only its own misses count.
      const look = at < 0 ? list : list.slice(0, at + 1);
      const answers = await Promise.all(look.map((w) => o.probe(w.url).catch(() => false)));
      look.forEach((w, i) => note(w.url, answers[i]!));
      if (cur && at < 0) note(cur, await o.probe(cur).catch(() => false));
      const curStreak = cur ? (streak.get(at < 0 ? cur : list[at]!.url) ?? 0) : -need;
      // Moving up: a better way that answered `need` times in a row.
      for (let i = 0; i < (at < 0 ? 0 : at); i++) if ((streak.get(list[i]!.url) ?? 0) >= need) return list[i]!.url;
      // Leaving: the way in use missed `need` times in a row; the best one that answered now.
      if (curStreak <= -need) {
        const ok = look.findIndex((w, i) => answers[i] && normalizeBase(w.url) !== normalizeBase(cur ?? ""));
        if (ok >= 0) return look[ok]!.url;
        // Worse ways weren't probed this time: try them now.
        const rest = at < 0 ? [] : list.slice(at + 1);
        for (const w of rest) if (await o.probe(w.url).catch(() => false)) return w.url;
      }
      return undefined;
    },
  };
}
