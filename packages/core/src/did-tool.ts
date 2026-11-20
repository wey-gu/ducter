// D300: the partner's answer to "你今天替我发了什么？ / what did you send for me today?", from the
// same record the 替你做过的 / Done for you page shows (did.ts). Read-only.
import { DID_KINDS, type DidItem, type DidKind } from "@ducter/protocol";
import type { CoreMcpHub } from "./mcp.ts";
import { rangeOf, type Did } from "./did.ts";

const hm = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const ALLOWED = { you: "the user agreed", default: "nobody answered; it went ahead as the card said it would", before: "agreed there earlier", said: "the user said it goes without asking" } as const;

/** One action as the partner reads it: short, no ids it can't use. */
function compact(it: DidItem, withDay: boolean): Record<string, unknown> {
  return {
    at: withDay ? `${it.at.slice(0, 10)} ${hm(it.at)}` : hm(it.at),
    kind: `${it.kind}.${it.cal ?? it.sub}`,
    // A message to another AI agent (Bridge) is a send like any other: said so, so it isn't skipped as internal.
    ...(it.to ? { to: it.sub === "agent" ? `${it.to} (an AI agent)` : it.to } : {}),
    ...(it.via ? { via: it.via } : {}),
    ...(it.line ? { what: it.line } : {}),
    ...(it.amount ? { amount: it.amount } : {}),
    ...(it.count ? { count: it.count } : {}),
    ...(it.unsure ? { unsure: it.unsure } : {}),
    asked: it.who.by === "you" ? "the user" : it.who.by === "routine" ? `routine ${it.who.routine ?? ""}`.trim() : `task ${it.who.title ?? it.who.taskId ?? ""}`.trim(),
    ...(it.go ? { allowed: it.go.words ? `${ALLOWED[it.go.by]}: "${it.go.words}"` : ALLOWED[it.go.by] } : {}),
    ...(it.where?.name ? { where: it.where.name } : it.where ? { where: it.where.kind } : {}),
    ...(it.undo ? { undo_until: it.undo.until.slice(0, 10) } : {}),
  };
}

export function registerDidTool(mcp: CoreMcpHub, did: Did, now: () => number) {
  mcp.register(
    "partner",
    "did_list",
    "What Ducter did outside on the user's behalf (their Done for you page): sent, paid, called, filled (sign-ins, saved details, keys), changed, deleted; plus how many times each account was looked at. Pass the kind they ask about (\"what did you send\" → sent). Answer from it only, in a line or two.",
    {
      type: "object",
      properties: {
        when: { type: "string", enum: ["today", "yesterday", "week"] },
        kind: { type: "string", enum: [...DID_KINDS] },
      },
    },
    async (a: { when?: unknown; kind?: unknown }) => {
      const when = a.when === "yesterday" || a.when === "week" ? a.when : "today";
      const kind = (DID_KINDS as readonly string[]).includes(String(a.kind)) ? (a.kind as DidKind) : undefined;
      const r = did.query({ ...rangeOf(when, now()), ...(kind ? { kinds: [kind] } : {}), limit: 60 });
      const acts = r.items.filter((it) => it.kind !== "read");
      // Looks are counts of times an account was read, never what was in it: kept apart from the actions.
      const looked = r.items.filter((it) => it.kind === "read").map((it) => ({ account: it.via, times: it.count ?? 1, asked: compact(it, false).asked }));
      return {
        ok: true,
        when,
        counts: r.counts,
        items: acts.map((it) => compact(it, when === "week")),
        ...(looked.length ? { looked_at: looked } : {}),
        ...(r.more ? { more: true } : {}),
        ...(acts.length ? {} : { note: "nothing went out in this range: say so plainly" }),
      };
    },
  );
}
