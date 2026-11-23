// D486: the partner's own word on the person's partners. One tool, three verbs:
//
// - make: the person asked for another partner ("再给我做一个管家里事的伙伴"): made at once, with a
//   name and what it looks after in their words. It shows beside the name; a tap talks to it.
// - pass: the person's words meant for another partner (they named it, or asked to tell it) go into
//   that partner's own conversation as theirs, marked passed on by this one. It answers there; the
//   person sees the dot on its stone. Nothing else of this conversation goes along (D24, D309).
// - set: a new name, or what it looks after, in the person's words.
//
// The model judges whose a request is (principle 21); code guards the invariants only: the four
// at most, a unique name, never passing to itself, never removing (Settings does that, two taps).
import type { LogStore } from "@ducter/protocol/src/internal.ts";
import { DEFAULT_PARTNER, PARTNERS_MAX, PARTNER_ABOUT_MAX, PARTNER_NAME_MAX, channelOf } from "@ducter/protocol/src/partners.ts";
import type { CoreMcpHub } from "./mcp.ts";
import type { Partners } from "./partners.ts";

/** How long passed words may be (the person's words, not a summary of this conversation). */
export const PASS_MAX = 2_000;

export function registerPartnerTool(mcp: CoreMcpHub, deps: { log: LogStore; partners: Partners }) {
  const { partners, log } = deps;
  const description =
    "The user's partners (the [partners] line lists the others and what each looks after). " +
    `do=make: the user asks for another partner ("再给我做一个管家里事的伙伴"): name (theirs, or a short warm one you pick when they gave none) and about (what it looks after, their words); at most ${PARTNERS_MAX} partners. ` +
    "do=pass: the user's words are for another partner (they name it, or ask you to tell it): to = its name, text = what they want, in their words. It lands in that partner's own conversation and it answers there; nothing else of yours goes along. When a request only falls in another partner's care, offer to pass it in one short line instead. " +
    "do=set: rename one (to, name) or change what it looks after (to, about), on the user's word. After any of these say one short line; never claim the other partner's answer.";
  mcp.register(
    "partner",
    "partner",
    description,
    {
      type: "object",
      properties: {
        do: { type: "string", enum: ["make", "pass", "set"] },
        to: { type: "string", description: "pass, set: the partner's name" },
        name: { type: "string", description: `make, set: its name (at most ${PARTNER_NAME_MAX} characters)` },
        about: { type: "string", description: `make, set: what it looks after, the user's words (at most ${PARTNER_ABOUT_MAX})` },
        text: { type: "string", description: "pass: the user's words for it" },
      },
      required: ["do"],
    },
    async (args, ctx) => {
      const a = (args ?? {}) as { do?: string; to?: string; name?: string; about?: string; text?: string };
      const me = ctx.persona && partners.has(ctx.persona) ? ctx.persona : DEFAULT_PARTNER;
      const names = () => partners.list().map((p) => p.name).join(", ");
      if (!partners.on()) return { ok: false, error: "This home has one partner only." };
      if (a.do === "make") {
        const r = partners.add({ name: String(a.name ?? ""), ...(a.about !== undefined ? { about: a.about } : {}) });
        if (!r.ok) {
          const why = { empty: "it needs a name", long: `a name is at most ${PARTNER_NAME_MAX} characters`, taken: `the name is taken (partners now: ${names()})`, full: `the user already has ${PARTNERS_MAX} partners, the most a home has`, unknown: "it couldn't be made" }[r.error];
          return { ok: false, error: `Not made: ${why}.` };
        }
        return { ok: true, made: { name: r.partner.name, ...(r.partner.about ? { about: r.partner.about } : {}) }, next: `${r.partner.name} is made. Its stone is beside your name now; the user taps it to talk to it, and it keeps its own conversation and memory. Tell them that in one short line. Pass nothing to it unless they ask.` };
      }
      const target = partners.byName(String(a.to ?? ""));
      if (!target) return { ok: false, error: `No partner called "${String(a.to ?? "")}". The user's partners: ${names()}.` };
      if (a.do === "set") {
        if (target.id === DEFAULT_PARTNER && a.name !== undefined) return { ok: false, error: "This partner is renamed in Settings › Partner (its name is the one Mem knows)." };
        const r = partners.set(target.id, { ...(a.name !== undefined ? { name: a.name } : {}), ...(a.about !== undefined ? { about: a.about } : {}) });
        if (!r.ok) return { ok: false, error: r.error === "taken" ? `That name is taken (partners now: ${names()}).` : `Not changed (${r.error}).` };
        return { ok: true, now: { name: r.partner.name, ...(r.partner.about ? { about: r.partner.about } : {}) } };
      }
      if (a.do === "pass") {
        if (target.id === me) return { ok: false, error: "That is you: answer it here." };
        const text = String(a.text ?? "").trim();
        if (!text) return { ok: false, error: "Nothing to pass: text is the user's words for it." };
        log.append({ stream: channelOf(target.id), origin: "user", kind: "user_msg", persona: target.id, body: { text: [...text].slice(0, PASS_MAX).join(""), passed: { from: me } } });
        return { ok: true, passed: target.name, next: `It is in ${target.name}'s own conversation; ${target.name} answers there (the user sees the dot on its stone). Say so in one short line, nothing more; you won't see its answer.` };
      }
      return { ok: false, error: "do is make, pass or set." };
    },
  );
}
