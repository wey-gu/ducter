// D451: 第一次 / The first time. A capability the person can't read from the thing itself meets them
// once, in place: one line under the thing in the partner's own words, led by its small face. Once
// seen on any device it is met everywhere (Settings' `met`, kept on the home). This file names the
// moments; the clients hold the words (zh and en designed together) and draw the line.
//
// Only what the thing can't say for itself gets a line. Shown already, so no line: the asks' rows
// (D426), an app's first state (D431), the checkout card (D436), the key's way (D440), 记下了 (D444),
// the relay's card (D448). Consent, not a hint, so per device and kept as is: hold to talk (D305),
// talk hands-free (D442). The mini window's own first line stays its own (D438: it is the window).

/** The first-time lines, by the thing they sit under. */
export const FIRST_MEETS = [
  // A task that repeats, the first time Ongoing shows it (D427): Ducter keeps it going.
  "loop",
  // The finder's chips, the first time a sentence is read into them (D428): a tap drops one.
  "find",
  // 另一个 AI 看过, the first time it shows (D437): what it is and why only these are left.
  "look",
  // 看过每一页, the first time it shows (D439): the same, for a made document.
  "pages",
] as const;
export type FirstMeet = (typeof FIRST_MEETS)[number];

export const isFirstMeet = (v: unknown): v is FirstMeet => typeof v === "string" && (FIRST_MEETS as readonly string[]).includes(v);

/**
 * A line is shown while the moment isn't met, and only on its first thing on this screen (the
 * caller passes whether this instance is the first). A home too old to keep `met` (undefined)
 * never shows one: the line would come back on every device and every day.
 */
export const firstMeetDue = (met: readonly string[] | undefined, name: FirstMeet): boolean => met !== undefined && !met.includes(name);
