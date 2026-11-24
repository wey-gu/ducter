// D309: more than one partner on one home (design/personas.md). Each partner is a named persona
// with its own conversation (its own channel stream in the one Log) and its own look; devices,
// projects, accounts and On hand stay the person's, shared by every partner.

/** The default partner: the one every home starts with, whose conversation is the "channel" stream. */
export const DEFAULT_PARTNER = "default";

/** At most this many partners on one home (the default and three more): a family, or work and home. */
export const PARTNERS_MAX = 4;

/**
 * A partner's look: the colour of its own clay (design/personas.md "Look", D497). A token name,
 * never a colour: the character is the same clay figure, recoloured by LOOK_CLAY. "sand" is the
 * default partner's own, the orange Pebble clay it has always had.
 */
export const PARTNER_LOOKS = ["sand", "sage", "sky", "plum", "apricot"] as const;
export type PartnerLook = (typeof PARTNER_LOOKS)[number];

/**
 * D497: how each look recolours the clay figure: a hue turn (degrees) and a saturation, applied as
 * CSS's `hue-rotate()` then `saturate()` (web app.css --clay) and the same sRGB matrices on the Mac
 * (theme.Tinted). The default's sand is the art as drawn. "apricot" keeps its id; it reads as coral.
 */
export const LOOK_CLAY: Record<PartnerLook, { hue: number; sat: number }> = {
  sand: { hue: 0, sat: 1 },
  sage: { hue: 95, sat: 0.62 },
  sky: { hue: 175, sat: 0.85 },
  plum: { hue: 255, sat: 0.7 },
  apricot: { hue: -28, sat: 1 },
};

/** One partner as every client sees it. asks: its conversation's own open questions (not its tasks'). */
export interface PartnerInfo {
  id: string;
  name: string;
  look: PartnerLook;
  /** Open questions in this partner's own conversation; its tasks' are On hand's (shared). */
  asks: number;
  /** D486: what it looks after, in the person's own words ("家里的事、看病、孩子"); absent: not said. */
  about?: string;
  /**
   * D513: the last thing said in its conversation, for the person's list of partners (the Mac's
   * and the web's): the words, when, and whether the person said them. Sent to the person's own
   * clients only, with more than one partner; never in any partner's own turn.
   */
  last?: PartnerLast;
}

/** D513: one line of a partner's conversation for the list (at most PARTNER_LAST_MAX characters). */
export interface PartnerLast {
  text: string;
  at: string;
  /** The person said it (the list reads it as theirs). */
  you?: boolean;
}

/** D513: how much of the last message the list carries (one line on a phone shows less). */
export const PARTNER_LAST_MAX = 80;

/** D513: a message's words as one list line: one line, trimmed, clipped; "" when there are none. */
export function lastLine(v: unknown): string {
  if (typeof v !== "string") return "";
  const one = v
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[*_`#>\[\]]/g, "")
    .replace(/[\p{Cc}\p{Cf}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const chars = [...one];
  return chars.length > PARTNER_LAST_MAX ? `${chars.slice(0, PARTNER_LAST_MAX - 1).join("")}…` : one;
}

/** D486: what a partner looks after: one short line in the person's words, trimmed, at most this long. */
export const PARTNER_ABOUT_MAX = 120;

/** D486: a partner's "looks after" line as kept: one line, trimmed, clipped; "" when nothing was said. */
export function cleanAbout(v: unknown): string {
  if (typeof v !== "string") return "";
  const one = v.replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/\s+/g, " ").trim();
  return [...one].slice(0, PARTNER_ABOUT_MAX).join("");
}

/** The conversation stream of a partner: the default's is "channel", every other's "channel:<id>". */
export function channelOf(id: string | undefined): string {
  return !id || id === DEFAULT_PARTNER ? "channel" : `channel:${id}`;
}

/** Which partner a stream's conversation belongs to; undefined for a stream that is no conversation. */
export function partnerOfStream(stream: string): string | undefined {
  if (stream === "channel") return DEFAULT_PARTNER;
  return stream.startsWith("channel:") ? stream.slice("channel:".length) : undefined;
}

/** A second partner's conversation (never the default's): the default's subscribers leave it alone. */
export function isOtherChannel(stream: string): boolean {
  return stream.startsWith("channel:");
}

export const isLook = (v: unknown): v is PartnerLook => typeof v === "string" && (PARTNER_LOOKS as readonly string[]).includes(v);

/** The look a new partner gets unless the person picks one: the first no partner has yet. */
export function nextLook(taken: readonly PartnerLook[]): PartnerLook {
  return PARTNER_LOOKS.find((l) => l !== "sand" && !taken.includes(l)) ?? PARTNER_LOOKS[1];
}

export const PARTNER_NAME_MAX = 24;

/** Why a name can't be a partner's, or undefined when it can (trimmed; one name per partner). */
export function partnerNameProblem(name: string, others: readonly string[]): "empty" | "long" | "taken" | undefined {
  const n = name.trim();
  if (!n) return "empty";
  if ([...n].length > PARTNER_NAME_MAX) return "long";
  if (others.some((o) => o.trim().toLocaleLowerCase() === n.toLocaleLowerCase())) return "taken";
  return undefined;
}

/**
 * The one "needs you" count across partners (D309: attention is the person's): what this client
 * already counts (On hand's needs-you cards, which are every partner's, and the open questions of
 * the conversation it shows) plus every other partner's own open questions.
 */
export function needsAcross(here: number, partners: readonly PartnerInfo[] | undefined, shown: string): number {
  return here + (partners ?? []).filter((p) => p.id !== shown).reduce((n, p) => n + p.asks, 0);
}
