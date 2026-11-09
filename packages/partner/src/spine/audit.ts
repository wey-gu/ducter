// The mechanical audit a digest passes before it freezes (design/memory.md, research/14 §6.4).
// Deterministic and cheap: no model judges a digest. A digest that fails is rewritten with the
// reasons; it never freezes as it is.
//   1. Anchors are exact substrings of the user message they cite.
//   2. Pointers resolve: every #seq is a channel event inside the segment, every closed id was
//      open, every supersedes names a decision in force.
//   3. Identifiers: every identifier in the digest appears in the source, and the source's
//      salient identifiers appear in the digest.
//   4. Every unanswered ask maps to an obligation.
//   5. Shape: at least one TOC row, a narrative, within the size cap.
import { estTokens, renderDigest, type Decision, type Obligation, type SegmentDigest } from "./digest.ts";
import { identifiers, unansweredAsks, userText, type Unit } from "./segment.ts";

export interface AuditContext {
  units: Unit[];
  open: Obligation[]; // earlier obligations still open
  inForce: Decision[]; // earlier decisions in force
  mustKeep: string[];
  capTokens?: number; // default 3000
  usedO?: number; // the highest O-n anywhere in the spine (ids are never reused)
}

const MAX_ANCHORS = 6;
const MAX_QUOTE = 200;
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");

/** The digest's text that may name identifiers (everything the model wrote). */
function writtenText(d: SegmentDigest): string {
  return [
    ...d.toc.flatMap((r) => [r.gist, ...r.keys]),
    ...d.decisions.flatMap((x) => [x.text, x.why ?? ""]),
    ...d.superseded.flatMap((c) => [c.old, c.new]),
    ...d.opened.filter((o) => !o.ref).map((o) => o.text),
    d.narrative,
  ].join("\n");
}

export function audit(d: SegmentDigest, c: AuditContext): string[] {
  const reasons: string[] = [];
  const bySeq = new Map(c.units.map((u) => [u.e.seq, u]));
  const inside = (n: number) => Number.isInteger(n) && n >= d.from && n <= d.to && bySeq.has(n);

  // 1. Anchors.
  if (d.anchors.length > MAX_ANCHORS) reasons.push(`at most ${MAX_ANCHORS} anchors (got ${d.anchors.length})`);
  for (const a of d.anchors) {
    const u = bySeq.get(a.at);
    const said = u ? userText(u.e) : undefined;
    if (said === undefined) reasons.push(`anchor #${a.at} is not a user message in this part`);
    else if (!a.quote.trim()) reasons.push(`anchor #${a.at} is empty`);
    else if (a.quote.length > MAX_QUOTE) reasons.push(`anchor #${a.at} is longer than ${MAX_QUOTE} characters`);
    else if (!said.includes(a.quote)) reasons.push(`anchor #${a.at} 「${a.quote.slice(0, 60)}」 is not copied exactly from that message`);
  }

  // 2. Pointers.
  for (const r of d.toc) {
    if (!inside(r.from) || !inside(r.to) || r.from > r.to) reasons.push(`toc row ${r.from}–${r.to} does not point inside #${d.from}–#${d.to}`);
  }
  for (const x of d.decisions) if (!inside(x.at)) reasons.push(`decision "${x.text.slice(0, 40)}" points at #${x.at}, not a line in this part`);
  for (const x of d.superseded) if (!inside(x.at)) reasons.push(`superseded "${x.old.slice(0, 40)}" points at #${x.at}, not a line in this part`);
  for (const o of d.opened) if (!o.ref && !inside(o.at)) reasons.push(`obligation "${o.text.slice(0, 40)}" points at #${o.at}, not a line in this part`);
  const open = new Set(c.open.map((o) => o.id));
  for (const x of d.closed) {
    if (!open.has(x.id)) reasons.push(`closed ${x.id} was not an open obligation`);
    else if (!inside(x.at)) reasons.push(`closed ${x.id} points at #${x.at}, not a line in this part`);
  }
  const decided = new Set([...c.inForce.map((x) => x.id), ...d.decisions.map((x) => x.id)]);
  for (const x of d.decisions) if (x.supersedes && (!decided.has(x.supersedes) || x.supersedes === x.id)) reasons.push(`decision ${x.id} supersedes ${x.supersedes}, which is not a decision in force`);

  // 3. Identifiers.
  const source = norm(c.units.map((u) => u.line).join("\n"));
  const known = norm([...c.open.map((o) => o.text), ...c.inForce.map((x) => x.text)].join("\n"));
  const invented = identifiers(writtenText(d)).filter((id) => !source.includes(norm(id)) && !known.includes(norm(id)));
  for (const id of invented.slice(0, 8)) reasons.push(`"${id}" does not appear in the lines`);
  const kept = norm(renderDigest({ kind: "segment", ...d }));
  const missing = c.mustKeep.filter((id) => !kept.includes(norm(id)));
  if (missing.length) reasons.push(`missing identifiers (put them in toc keys): ${missing.join(", ")}`);

  // 4. Every unanswered ask is an obligation.
  const covered = new Set(d.opened.map((o) => o.at));
  for (const at of unansweredAsks(c.units)) if (!covered.has(at)) reasons.push(`the user's ask at #${at} has no obligation in "opened"`);

  // 5. Shape and size.
  if (!d.toc.length) reasons.push("toc is empty");
  if (!d.narrative.trim() && !d.degraded) reasons.push("narrative is empty");
  const size = estTokens(renderDigest({ kind: "segment", ...d }));
  if (size > (c.capTokens ?? 3000)) reasons.push(`the digest is about ${size} tokens; keep it under ${c.capTokens ?? 3000}`);
  return reasons;
}

/** The next free O-n after everything this digest and the ledger already use. */
function nextId(d: SegmentDigest, c: AuditContext): string {
  const n = [...d.opened, ...c.open].map((o) => Number(o.id.slice(2))).filter(Number.isFinite);
  return `O-${Math.max(c.usedO ?? 0, ...n) + 1}`;
}

/**
 * Repair by removal only: drop what failed (an inexact anchor, a dangling pointer, a bad
 * supersedes), never add model-free claims. Returns the digest and what was dropped; the caller
 * audits it again. Adding identifiers to TOC keys is allowed: they are copied from the source.
 */
export function repair(d: SegmentDigest, c: AuditContext): { digest: SegmentDigest; dropped: string[] } {
  const bySeq = new Map(c.units.map((u) => [u.e.seq, u]));
  const inside = (n: number) => Number.isInteger(n) && n >= d.from && n <= d.to && bySeq.has(n);
  const dropped: string[] = [];
  const keep = <T>(xs: T[], ok: (x: T) => boolean, what: (x: T) => string) =>
    xs.filter((x) => {
      if (ok(x)) return true;
      dropped.push(what(x));
      return false;
    });
  const open = new Set(c.open.map((o) => o.id));
  const anchors = keep(
    d.anchors,
    (a) => {
      const said = bySeq.get(a.at) ? userText(bySeq.get(a.at)!.e) : undefined;
      return said !== undefined && !!a.quote.trim() && a.quote.length <= MAX_QUOTE && said.includes(a.quote);
    },
    (a) => `anchor #${a.at}`,
  ).slice(0, MAX_ANCHORS);
  const decided = new Set([...c.inForce.map((x) => x.id), ...d.decisions.map((x) => x.id)]);
  const decisions = keep(d.decisions, (x) => inside(x.at), (x) => `decision ${x.id}`).map((x) => {
    if (x.supersedes && (!decided.has(x.supersedes) || x.supersedes === x.id)) {
      dropped.push(`${x.id} supersedes ${x.supersedes}`);
      const { supersedes: _, ...rest } = x;
      return rest;
    }
    return x;
  });
  const toc = keep(d.toc, (r) => inside(r.from) && inside(r.to) && r.from <= r.to, (r) => `toc ${r.from}–${r.to}`);
  const superseded = keep(d.superseded, (x) => inside(x.at), (x) => `superseded #${x.at}`);
  const opened = keep(d.opened, (o) => !!o.ref || inside(o.at), (o) => `obligation #${o.at}`);
  const closed = keep(d.closed, (x) => open.has(x.id) && inside(x.at), (x) => `closed ${x.id}`);
  // An ask code can see is open, as the user's own words (code-observed, so not a claim).
  const covered = new Set(opened.map((o) => o.at));
  let next = Number(nextId(d, c).slice(2));
  for (const at of unansweredAsks(c.units)) {
    if (covered.has(at)) continue;
    const said = userText(bySeq.get(at)!.e) ?? "";
    opened.push({ id: `O-${next++}`, who: "me", text: `answer: ${said.replace(/\s+/g, " ").slice(0, 160)}`, at });
    dropped.push(`(added) the ask at #${at}`);
  }
  const out: SegmentDigest = { ...d, toc, decisions, superseded, anchors, opened: opened.sort((a, b) => a.at - b.at), closed };
  if (out.toc.length) {
    const kept = norm(renderDigest({ kind: "segment", ...out }));
    const missing = c.mustKeep.filter((id) => !kept.includes(norm(id)));
    if (missing.length) {
      const last = out.toc[out.toc.length - 1]!;
      out.toc = [...out.toc.slice(0, -1), { ...last, keys: [...last.keys, ...missing] }];
    }
  }
  return { digest: out, dropped };
}
