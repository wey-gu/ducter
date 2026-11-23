// D484: the opened task's words that are computed, not drawn: a provider's raw error said in a
// line (its original kept behind 看看为什么), the task's pull request wherever it was recorded, and
// what sharing a task sends. Pure functions, so they are tested without a page.

/** A provider's error as an agent printed it (a warning sign, then "INVALID_ARGUMENT (code 400): * GenerateContent…"):
 *  its status word, its HTTP code and the rest. Undefined for anything else. The shape is the
 *  provider's wire format (a status in capitals, then its code), never a guess at meaning. */
export function providerError(text: string): { status: string; code: number; detail: string } | undefined {
  const m = /^\s*(?:\u26A0\uFE0F?\s*)?(?:(?:API )?Error:?\s*)?([A-Z][A-Z_]{2,})\s*\((?:code|status|HTTP)\s*:?\s*(\d{3})\)\s*:?\s*([\s\S]*)$/.exec(text);
  if (!m) return undefined;
  return { status: m[1]!, code: Number(m[2]), detail: m[3]!.trim() };
}

/** The i18n key that says an error with this code in a line (the agent's name fills it). */
export function providerErrorKey(code: number): string {
  if (code === 401 || code === 403) return "perr.auth";
  if (code === 429) return "perr.limit";
  if (code >= 500) return "perr.down";
  if (code >= 400) return "perr.refused";
  return "perr.other";
}

/** The pull request a task has: opened from Ducter (the card's or this client's record), else the
 *  newest link to one in its reports. */
export function prRef(p: { integrated?: { act?: string; ref?: string }; acted?: { action: string; ok: boolean; ref?: string }; links: string[] }): string | undefined {
  if (p.integrated?.act === "open_pr" && p.integrated.ref) return p.integrated.ref;
  if (p.acted?.ok && p.acted.action === "open_pr" && p.acted.ref) return p.acted.ref;
  for (let i = p.links.length - 1; i >= 0; i--) if (/\/pull\/\d+|\/merge_requests\/\d+/.test(p.links[i]!)) return p.links[i];
  return undefined;
}

/** "#212" from a pull request's link, else "". */
export const prNumber = (ref: string) => /\/(?:pull|merge_requests)\/(\d+)/.exec(ref)?.[1] ?? "";

/** What sharing a task sends (D484): its name, where it stands in one sentence, what it last said
 *  for the person, its pull request, and the link that opens it in this person's own Ducter. One
 *  fact a line, nothing joined. */
export function shareText(p: { name: string; state: string; said?: string; pr?: string }): string {
  const lines = [p.name, p.state];
  if (p.said && p.said !== p.state) lines.push(p.said);
  if (p.pr) lines.push(p.pr);
  return lines.filter(Boolean).join("\n");
}

/** The link that opens a task in the person's own Ducter (only their own devices can open it). */
export const taskLink = (origin: string, id: string) => `${origin.replace(/\/+$/, "")}/app#task=${encodeURIComponent(id)}`;
