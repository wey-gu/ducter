// D480: opening an agent's Nowledge Mem mailbox in place (design/bridge.md "The mailbox's Space,
// chosen in place"). Nowledge Mem's Bridge needs an explicit Space and never picks one silently
// (its passive `nmem --json bridge setup` lists `candidates[{id,label,kind,readers,write_default}]`
// and says "suggested entries are hints, not a choice"). So Ducter shows the person's real Spaces,
// recommends one (the Space its partner already listens in) and the person's one tap chooses.
// Never typed, never chosen for them. And a fact first: an agent whose own Mem is another server than
// the partner's can't reach it whatever Space it opens, so that is said instead of a choice.

/** One Space a mailbox can be opened in, as Mem's passive setup lists it. */
export interface MailboxSpace {
  /** Mem's exact Space id (what `--space-id` takes). */
  id: string;
  /** Mem's own label ("Only me", "Everyone", "dev team"). */
  label: string;
  /** Mem's kind: personal, team, commons, default (another kind is kept as Mem says it). */
  kind: string;
  /** How many members can read it, when Mem says (Only me: 1). */
  readers?: number;
  /** The partner itself listens in this Space (its own Bridge connection is there). */
  partner?: true;
}

/**
 * What the in-place choice shows for one agent on one computer. choose: the Spaces, the recommended
 * one first; apart: that computer's own Mem is another server than the partner's (theirs / ours,
 * hosts), so no Space would help; no_mem: Mem isn't signed in there; away: the computer isn't
 * connected now; old: its Ducter is too old to look; failed: Mem didn't answer (detail, clipped).
 */
export interface MailboxLook {
  state: "choose" | "apart" | "no_mem" | "away" | "old" | "failed";
  spaces?: MailboxSpace[];
  /** The Space Ducter recommends (an id in spaces): preselected, never chosen without the tap. */
  recommend?: string;
  theirs?: string;
  ours?: string;
  detail?: string;
}

/** A Mem server's host from its API URL ("https://cloud.nowledge.co/remote-api" → "cloud.nowledge.co"); undefined when it isn't a URL. */
export function memHost(url: unknown): string | undefined {
  if (typeof url !== "string" || !url.trim()) return undefined;
  try {
    const u = new URL(url.trim());
    return u.port ? `${u.hostname.toLowerCase()}:${u.port}` : u.hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

/** Two Mem servers are the same one only when their hosts are; unknown on either side is never "apart". */
export function memApart(theirs: string | undefined, ours: string | undefined): boolean {
  return !!theirs && !!ours && theirs !== ours;
}

const KIND_ORDER: Record<string, number> = { personal: 0, team: 1, default: 2, commons: 3 };

/**
 * Mem's passive setup answer read into the choice: its candidates, the partner's own Space marked,
 * the recommendation (the partner's Space; else Mem's personal Space, the one only the person reads),
 * and an order that puts the recommendation first and the widest audiences last. Facts from Mem's
 * fields only: nothing is read from a label's words.
 */
export function mailboxChoice(setup: unknown, partnerSpace?: string): { spaces: MailboxSpace[]; recommend?: string } {
  const raw = (setup as { candidates?: unknown } | undefined)?.candidates;
  const list = Array.isArray(raw) ? raw : [];
  const spaces: MailboxSpace[] = [];
  for (const c of list) {
    const o = c as Record<string, unknown>;
    if (typeof o?.id !== "string" || !o.id) continue;
    const readers = typeof o.readers === "number" && Number.isFinite(o.readers) ? { readers: o.readers } : {};
    spaces.push({ id: o.id, label: typeof o.label === "string" && o.label.trim() ? o.label.trim() : o.id, kind: typeof o.kind === "string" ? o.kind : "team", ...readers, ...(partnerSpace && o.id === partnerSpace ? { partner: true as const } : {}) });
  }
  const recommend = spaces.find((s) => s.partner)?.id ?? spaces.find((s) => s.kind === "personal")?.id;
  const rank = (s: MailboxSpace) => (s.id === recommend ? -1 : (KIND_ORDER[s.kind] ?? 2));
  const sorted = spaces.map((s, i) => ({ s, i })).sort((a, b) => rank(a.s) - rank(b.s) || a.i - b.i).map((x) => x.s);
  return { spaces: sorted, ...(recommend ? { recommend } : {}) };
}
