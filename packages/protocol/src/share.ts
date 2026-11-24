// D537: 分享到 Ducter / Share to Ducter. Something sent from another app through the phone's own
// share sheet (Safari, Photos, WeChat, Files, X): the person's note (附言) and the shared thing,
// one message in the conversation. The phone uploads pictures and files with POST /api/media
// first, then posts POST /api/share with this body; the home makes the message (shareMessage).
//
// One message, two voices: the note is the person's own words; the link or the words they shared
// are someone else's (a page, a post, a passage), data for the partner, never its instructions.
// The message's text shows both in every client as they are (note, a blank line, the thing);
// `shared.at` says where the thing begins, so the partner's turn can tell them apart.

/** What the phone posts to POST /api/share. */
export interface ShareRequest {
  /** The phone's own id for this share (≤ 64): a resend from its outbox appends nothing twice. */
  clientId: string;
  /** The person's note (附言); empty means "here is something". */
  note?: string;
  /** Which partner it is for (D513); absent or gone: the default partner. */
  partner?: string;
  /** Pictures and files already up (POST /api/media ids), at most MEDIA_LIMITS.perMessage. */
  media?: string[];
  /** A shared link (http or https only). */
  url?: string;
  /** The link's title, when the sharing app gave one. */
  title?: string;
  /** Shared words (a passage, a post), when the sharing app gave text rather than a link. */
  text?: string;
  /** The app it came from, when the phone knows it (Android says; iOS doesn't). */
  from?: string;
}

/** On the message (user_msg.shared): where in its text the shared thing begins, and from where. */
export interface SharedFrom {
  /** Characters of `text` before the shared thing (the note and the blank line); text.length: nothing but pictures or files. */
  at: number;
  /** The app it came from, when the phone said. */
  from?: string;
  /** The shared link, as the phone gave it (also in the text). */
  link?: string;
}

export const SHARE_LIMITS = {
  note: 4000,
  title: 200,
  text: 8000,
  url: 2048,
  from: 60,
} as const;

const clean = (v: unknown, max: number): string => {
  if (typeof v !== "string") return "";
  // Keep line breaks (a passage's paragraphs); drop other control and format characters.
  const s = v.replace(/\r\n?/g, "\n").replace(/[\p{Cc}\p{Cf}]/gu, (c) => (c === "\n" || c === "\t" ? c : " "));
  const t = s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  const chars = [...t];
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : t;
};

const oneLine = (v: unknown, max: number): string => clean(v, max).replace(/\s+/g, " ");

/** A shared link: http or https only, one line, at most SHARE_LIMITS.url; "" for anything else. */
export function shareLink(v: unknown): string {
  const s = oneLine(v, SHARE_LIMITS.url + 1);
  if (!s || s.length > SHARE_LIMITS.url) return "";
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : "";
  } catch {
    return "";
  }
}

/**
 * The message a share makes: its text (the note, a blank line, then the link with its title
 * above it, or the shared words) and `shared`. undefined when there is nothing at all to send
 * (no note, no link, no words, no media).
 */
export function shareMessage(r: Partial<ShareRequest>, mediaCount: number): { text: string; shared: SharedFrom } | undefined {
  const note = clean(r.note, SHARE_LIMITS.note);
  // Some apps share a link as plain words: words that are one link alone are that link.
  const link = shareLink(r.url) || (/^\S+$/.test(clean(r.text, SHARE_LIMITS.url + 1)) ? shareLink(r.text) : "");
  const title = link ? oneLine(r.title, SHARE_LIMITS.title) : "";
  // Words that carry the link again (X and WeChat send "the post's words https://…" beside the
  // link) keep only what they add; words that are only the link or its title add nothing.
  let words = clean(r.text, SHARE_LIMITS.text);
  if (link && words) {
    for (const l of [r.url, link]) if (typeof l === "string" && l) words = words.split(l).join(" ");
    words = clean(words, SHARE_LIMITS.text);
    if (words === title) words = "";
  }
  const thing = [link ? (title && title !== link ? `${title}\n${link}` : link) : "", words].filter(Boolean).join("\n\n");
  if (!note && !thing && mediaCount <= 0) return undefined;
  const head = note && thing ? `${note}\n\n` : note;
  const from = oneLine(r.from, SHARE_LIMITS.from);
  return { text: head + thing, shared: { at: head.length, ...(from ? { from } : {}), ...(link ? { link } : {}) } };
}

/** The note and the shared thing of a message a share made (render, clients). */
export function shareParts(text: string, shared: SharedFrom): { note: string; thing: string } {
  const at = Math.max(0, Math.min(text.length, Math.floor(shared.at)));
  return { note: text.slice(0, at).trim(), thing: text.slice(at).trim() };
}
