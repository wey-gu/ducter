// D494: 帮手 / Helpers. A helper is a named address of the person's own in Nowledge Bridge that their
// other agents hand one kind of work to ("Nowledge Mem PR babysitter": a PR to watch until it can
// merge). Ducter's home owns it: the home enrolls its Mem identity and holds its one connection, reads
// its mail with the partner's, and every handed-over piece of work becomes a task (or joins the one
// already on it) that Ducter wakes on its waits; when the work is done the answer goes back to whoever
// sent it, from the helper's address. A helper is not a partner (no conversation, no memory of its
// own) and not a harness session (nothing on it listens or wakes itself).

/** At most this many helpers on a home. */
export const HELPERS_MAX = 6;
/** A helper's name, the one other agents find it by. */
export const HELPER_NAME_MAX = 48;
/** What it takes, in the person's words (one line). */
export const HELPER_ABOUT_MAX = 200;
/** What each piece of work it takes is told: the person's words, its authority, when it is done. */
export const HELPER_BRIEF_MAX = 2_000;
/** Pieces of work one helper starts in a day without asking; the next asks the person (X2's cap, D170). */
export const HELPER_DAILY = 10;

/** How a helper's Nowledge Mem address stands on the home. */
export type HelperMem = "connecting" | "ready" | "waiting" | "refused";

/** One helper as the home keeps it (helpers.json). */
export interface Helper {
  id: string;
  name: string;
  /** What it takes, the person's words. */
  about: string;
  /** What each piece of work is told (the partner writes it from the person's words). */
  brief: string;
  /** The partner that made it (D312): its tasks are that partner's. */
  persona: string;
  /** Its own Nowledge Mem identity (the address other agents find it by). */
  agentId: string;
  state: "on" | "stopped";
  createdAt: string;
  /** The home's one connection for it, once Mem confirmed it. */
  link?: { context: string; connectionId: string; spaceId: string };
  mem: HelperMem;
  /** Why it is waiting or refused, in Mem's terms (shown behind 细节 / Details). */
  detail?: string;
}

/** A helper as Settings › Agent 通信 shows it. */
export interface HelperView {
  id: string;
  name: string;
  about: string;
  state: "on" | "stopped";
  mem: HelperMem;
  detail?: string;
  /** Work it has on hand now (its open tasks). */
  open: number;
  /** Work it took in the last 7 days. */
  week: number;
}

/** A helper's name as kept: one line, trimmed, clipped; "" when none. */
export function cleanHelperName(v: unknown): string {
  if (typeof v !== "string") return "";
  const one = v.replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/\s+/g, " ").trim();
  return [...one].slice(0, HELPER_NAME_MAX).join("").trim();
}

/** One line in the person's words, clipped to `max`. */
export function cleanLine(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return [...v.replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/\s+/g, " ").trim()].slice(0, max).join("");
}

/** The words of a brief as kept: newlines kept, other controls dropped, clipped. */
export function cleanBrief(v: unknown): string {
  if (typeof v !== "string") return "";
  return [...v.replace(/[^\P{Cc}\n]/gu, " ").replace(/\n{3,}/g, "\n\n").trim()].slice(0, HELPER_BRIEF_MAX).join("");
}

/** The Mem identity Ducter enrolls for a helper: `ducter-helper-<its name as a slug>` (Mem's canonical id). */
export function helperIdentity(name: string, taken: (id: string) => boolean = () => false): string {
  const slug = name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48).replace(/-+$/, "") || "helper";
  const base = `ducter-helper-${slug}`;
  for (let n = 1; n < 100; n++) {
    const id = n === 1 ? base : `${base}-${n}`;
    if (!taken(id)) return id;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/**
 * The helper's card in Mem (its public profile description, which other agents read in `bridge
 * contacts`): what to send it, what it does with it, and that the answer comes back here.
 */
export function helperCard(h: { name: string; about: string }, partner: string, home: string): string {
  return `${h.name}: a helper of ${partner} (Ducter, a personal AI partner), on its home computer ${home}. It takes: ${h.about} Send it the work in one message (a link, and what it may and may not do). It answers once now that it took it, and again when the work is done or needs its owner. It reads every Space it is in and replies in the Space the message came from.`;
}
