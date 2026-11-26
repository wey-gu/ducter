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

/** D598: how long work handed to a helper may wait for one of its tasks to take it before the person hears so, once. */
export const HELPER_TAKE_MS = 10 * 60_000;

/** D598: a message id Ducter gave a hand-off on this home (never one of Mem's). */
export const LOCAL_MSG = "local-";

type HelperMailBody = { direction: "in" | "out"; messageId: string; helper?: string; inReplyTo?: string; state?: string };

/**
 * D598: the messages each helper sent (its claims and its outcomes), by id: an agent that writes again on
 * one of them is handing the helper new work, not answering something the person asked.
 */
export function helperSent(evs: Iterable<{ body: unknown }>): Set<string> {
  const out = new Set<string>();
  for (const e of evs) {
    const b = e.body as HelperMailBody;
    if (b?.direction === "out" && b.helper && b.messageId) out.add(b.messageId);
  }
  return out;
}

/**
 * D598: mail at a helper's address that is a piece of work handed to it: an original, a hand-off on this
 * home, or a message written as a reply on the helper's own earlier message (hel, 2026-11-26: a task's
 * hand-off of mem#11393 went as a reply on the babysitter's last outcome, for #11070, and was read as
 * an answer, so no task took it). Not a held, muted or set-aside copy.
 */
export function isHelperWork(b: HelperMailBody, sent: Set<string>): boolean {
  if (b.direction !== "in" || !b.helper) return false;
  if (b.state && b.state !== "held") return false;
  return !b.inReplyTo || sent.has(b.inReplyTo);
}

/**
 * D598: a hand-off to a helper on this very home, as the Log keeps it: mail at its address that never
 * went through Nowledge Mem. `fromTask`: the task that handed it (its claim and outcome go there);
 * absent: the person handed it, through the partner.
 */
export function localHandoff(a: { id: string; helper: string; text: string; from: string; fromTask?: string; head?: string }) {
  return {
    direction: "in" as const,
    messageId: `${LOCAL_MSG}${a.id}`,
    from: a.from,
    agent: a.from,
    mine: true,
    helper: a.helper,
    local: true as const,
    ...(a.fromTask ? { fromTask: a.fromTask } : {}),
    text: a.head ? `${a.head}\n${a.text}` : a.text,
  };
}

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
  /** D507: what the partner last said of its address in the conversation (once each: ready, refused). */
  said?: "ready" | "refused";
  /** D533: pieces of work it starts in a day without asking, as the person set it on its Keep (absent: HELPER_DAILY). */
  daily?: number;
  /**
   * D604: the Spaces its mailbox was last read in, as Mem's identity inbox answered (`spaces[]` with
   * `status: "observed"`), by id and the person's label for it. Absent: not read yet. One identity has
   * one card in every Space the person is in, and its inbox reads them all (VERIFIED hel, nmem 0.10.123).
   */
  spaces?: { id: string; label: string }[];
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
  /** D604: the labels of the Spaces it receives in (Helper.spaces), once read. */
  spaces?: string[];
}

/**
 * D507: one piece of work a helper keeps, as the home reads it: the task, the PR it owns and where that
 * PR stands, and whether something waits for the person. A helper keeps a task until it ends, and a
 * finished one while its PR is still open (a merge or a close lets it go). This is the one model of a
 * helper's state: On hand's sheet reads it, and so will a helper's small app (D405/D407: the home
 * writes the app's key from it, as review-board.ts writes `board` from review_report).
 */
export interface HelperItem {
  taskId: string;
  title: string;
  /** "work": it is on it (at work, or its PR waiting on CI, a review or its next turn); "you":
   *  something waits for the person (a question, a stop, a failure); "ready": finished, its PR ready
   *  to merge (D508: the merge is the person's, so it waits for them too). */
  at: "work" | "you" | "ready";
  /** What waits for the person, in the task's words (its question, or why it stopped). */
  yours?: string;
  /** The PR it owns, owner/repo#n, once the task declared it (D483). */
  pr?: string;
  /** D508: where that PR stands, in the one model every row reads (pr-state.ts `prSaid`). */
  said?: import("./pr-state.ts").PrSaid;
}

/** D507: a helper that is on, with the work it keeps (HelperView's `open` is items.length). */
export interface HelperWork extends HelperView {
  items: HelperItem[];
}

/** D507: how a helper reads at a glance: nothing handed over, its work under way, or one waits for the
 *  person (D508: a PR ready to merge waits for them too). */
export function helperGlance(h: Pick<HelperWork, "mem" | "items">): "address" | "idle" | "busy" | "you" {
  if (h.mem !== "ready" && !h.items.length) return "address";
  if (h.items.some((x) => x.at === "you" || x.at === "ready")) return "you";
  return h.items.length ? "busy" : "idle";
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
