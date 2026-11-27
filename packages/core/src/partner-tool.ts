// D486: the partner's own word on the person's partners. One tool, four verbs:
//
// - make: the person asked for another partner ("再给我做一个管家里事的伙伴"): made at once, with a
//   name and what it looks after in their words. It shows in the list of partners (D513); a tap talks to it.
// - pass: the person's words meant for another partner (they named it, or asked to tell it) go into
//   that partner's own conversation as theirs, marked passed on by this one. It answers there; the
//   person sees the dot on its stone. Nothing else of this conversation goes along (D24, D309).
// - switch: D649, in a chat app: asking for someone is switching. The chat-app thread is with
//   that partner from now on (no quiet fall-back), and that partner answers there first under its
//   name. Code guards only that the turn came from a chat app and that the partner is real; the
//   model judges what the person asked (principle 21).
// - set: a new name, or what it looks after, in the person's words.
//
// The model judges whose a request is (principle 21); code guards the invariants only: the four
// at most, a unique name, never passing to itself, never removing (Settings does that, two taps).
import type { Bodies, ChannelKind } from "@ducter/protocol";
import { CHANNEL_KINDS } from "@ducter/protocol";
import type { LogStore } from "@ducter/protocol/src/internal.ts";
import { DEFAULT_PARTNER, PARTNERS_MAX, PARTNER_ABOUT_MAX, PARTNER_NAME_MAX, channelOf } from "@ducter/protocol/src/partners.ts";
import { TURN_MS } from "./channels/hub.ts";
import type { CoreMcpHub } from "./mcp.ts";
import type { Partners } from "./partners.ts";

/** How long passed words may be (the person's words, not a summary of this conversation). */
export const PASS_MAX = 2_000;

/** D649: the chat-app turn the person's latest message belongs to, while it is now. */
function chatTurn(log: LogStore, me: string, now: () => number): { kind: ChannelKind; text: string; seq: number } | undefined {
  const e = log.read({ stream: channelOf(me), kinds: ["user_msg"], limit: 1 })[0];
  if (!e) return undefined;
  const b = e.body as Bodies["user_msg"];
  // Words another partner passed on are not the person writing in the chat app.
  if (b.passed) return undefined;
  if (!b.via || !(CHANNEL_KINDS as readonly string[]).includes(b.via)) return undefined;
  const at = Date.parse(e.ts);
  if (Number.isFinite(at) && now() - at > TURN_MS) return undefined;
  return { kind: b.via as ChannelKind, text: b.text, seq: e.seq };
}

export function registerPartnerTool(mcp: CoreMcpHub, deps: { log: LogStore; partners: Partners; now?: () => number }) {
  const { partners, log } = deps;
  const now = deps.now ?? Date.now;
  const description =
    "The user's partners (the [partners] line lists the others and what each looks after). " +
    `do=make: the user asks for another partner ("再给我做一个管家里事的伙伴"): name (theirs, or a short warm one you pick when they gave none) and about (what it looks after, their words); at most ${PARTNERS_MAX} partners. ` +
    "do=pass: the user's words are for another partner's own conversation (they name it, or ask you to tell it), and are not a switch: to = its name, text = what they want, in their words. It lands in that partner's own conversation and it answers there; nothing else of yours goes along. When a request only falls in another partner's care, offer to pass it in one short line instead. " +
    "do=switch: in a chat app, the user asks to talk to another partner there, to bring one in, or to come back to one (they name it, ask to switch, ask whether they can talk to it, or the name stands alone): the chat-app thread is with that partner from then on, and it answers there first, under its name. Use it whenever the person wants that partner here; use pass for words meant for the partner's own conversation. " +
    "do=set: rename one (to, name) or change what it looks after (to, about), on the user's word. After any of these say one short line at most; never claim the other partner's answer.";
  mcp.register(
    "partner",
    "partner",
    description,
    {
      type: "object",
      properties: {
        do: { type: "string", enum: ["make", "pass", "switch", "set"] },
        to: { type: "string", description: "pass, switch, set: the partner's name" },
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
        return { ok: true, made: { name: r.partner.name, ...(r.partner.about ? { about: r.partner.about } : {}) }, next: `${r.partner.name} is made. It is in the user's list of partners now (on a computer, left of this conversation; on a phone, one tap back with ‹); a tap on it talks to it, and it keeps its own conversation and memory. Tell them that in one short line. Pass nothing to it unless they ask.` };
      }
      const target = partners.byName(String(a.to ?? ""));
      if (!target) return { ok: false, error: `No partner called "${String(a.to ?? "")}". The user's partners: ${names()}.` };
      if (a.do === "set") {
        if (target.id === DEFAULT_PARTNER && a.name !== undefined) return { ok: false, error: "This partner is renamed in Settings › Partner (its name is the one Mem knows)." };
        const r = partners.set(target.id, { ...(a.name !== undefined ? { name: a.name } : {}), ...(a.about !== undefined ? { about: a.about } : {}) });
        if (!r.ok) return { ok: false, error: r.error === "taken" ? `That name is taken (partners now: ${names()}).` : `Not changed (${r.error}).` };
        return { ok: true, now: { name: r.partner.name, ...(r.partner.about ? { about: r.partner.about } : {}) } };
      }
      if (a.do === "switch") {
        if (partners.list().length < 2) return { ok: false, error: "This home has one partner only; there is nobody to switch to." };
        const turn = chatTurn(log, me, now);
        if (!turn) return { ok: false, error: "Not in a chat app just now: in the user's Ducter apps they switch with a tap on a partner; for words meant for one there, use do=pass." };
        if (target.id === me) return { ok: true, with: target.name, next: `The chat is already with you here: answer the user's words now, in one short line.` };
        // D649: the person's own words go along, so the partner they asked for knows what was said.
        log.append({ stream: channelOf(target.id), origin: "user", kind: "user_msg", persona: target.id, body: { text: [...turn.text].slice(0, PASS_MAX).join(""), passed: { from: me, via: turn.kind, seq: turn.seq } } });
        return { ok: true, with: target.name, next: `The chat is with ${target.name} now, and ${target.name} answers there first under its name. Say at most one short line here (it is coming, or answer the person's question if they asked one); never answer for ${target.name}.` };
      }
      if (a.do === "pass") {
        if (target.id === me) return { ok: false, error: "That is you: answer it here." };
        const text = String(a.text ?? "").trim();
        if (!text) return { ok: false, error: "Nothing to pass: text is the user's words for it." };
        log.append({ stream: channelOf(target.id), origin: "user", kind: "user_msg", persona: target.id, body: { text: [...text].slice(0, PASS_MAX).join(""), passed: { from: me } } });
        return { ok: true, passed: target.name, next: `It is in ${target.name}'s own conversation; ${target.name} answers there, and right here when they wrote from a chat app (the user sees the dot on its stone). Say so in one short line, nothing more; you won't see its answer.` };
      }
      return { ok: false, error: "do is make, pass, switch or set." };
    },
  );
}
