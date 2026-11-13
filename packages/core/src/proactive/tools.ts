// D165: the one thing the person may say about what Ducter tells them, kept as a Rule in 你的规则
// (removable there with 不要这条): a kind that may wake them at night ("航班改了，夜里也叫我"), or
// a kind (and sender) not to tell them about. Ducter never proposes either.
// D243: and what it has noticed, for the partner's own answer to "anything for me?".
import { FIND_KINDS, isFindKind } from "@ducter/protocol";
import type { CoreMcpHub } from "../mcp.ts";
import type { RulesStore } from "../rules.ts";
import type { Proactive } from "./engine.ts";

export function registerProactiveTools(mcp: CoreMcpHub, rules: RulesStore, proactive?: Pick<Proactive, "noticed">) {
  mcp.register(
    "partner",
    "notice_rule",
    [
      "Keep what the user said about the things you notice in their accounts by yourself (the morning note, \"now\", before a meeting), as a rule they can remove in Your rules.",
      "wake: true only when they ask to be woken at night for a kind (\"航班改了，夜里也叫我\" → kind plan_changed); never suggest it.",
      "mute: a kind they don't want to hear about, from one sender when they name one (\"Cloudflare 的续费提醒不用告诉我\" → kind deadline, sender Cloudflare).",
      `Kinds: ${FIND_KINDS.join(", ")}. text: the rule in their words, one line. Say it back in one line after saving.`,
    ].join(" "),
    {
      type: "object",
      properties: {
        kind: { type: "string", enum: [...FIND_KINDS] },
        text: { type: "string" },
        sender: { type: "string" },
        wake: { type: "boolean" },
      },
      required: ["kind", "text"],
    },
    async (a: { kind?: unknown; text?: unknown; sender?: unknown; wake?: unknown }) => {
      if (!isFindKind(a.kind)) return { ok: false, error: `kind must be one of ${FIND_KINDS.join(", ")}` };
      const r = rules.addNotice({ text: String(a.text ?? ""), kind: a.kind, ...(typeof a.sender === "string" && a.sender.trim() ? { sender: a.sender } : {}), ...(a.wake === true ? { wake: true } : {}) });
      return { ok: true, ruleId: r.id };
    },
  );
  if (!proactive) return;
  mcp.register(
    "partner",
    "noticed",
    "What you have noticed in the user's accounts by yourself, most costly first, said or not: trips coming up, deadlines and money, services they use (maintenance, outages, failing jobs), people waiting on them, plans that changed. Call it first when they ask what's worth knowing. Each item: kind, your words, when, how you know (headers, dates), said, the next step you can take.",
    { type: "object", properties: {} },
    async () => {
      const n = proactive.noticed();
      return { ok: true, watching: n.watching, items: n.items, ...(n.items.length ? {} : { note: n.watching ? "nothing noticed: read their mail and calendar yourself if they asked" : "not watching: read their mail and calendar yourself" }) };
    },
  );
}
