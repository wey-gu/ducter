// D309: 伙伴们 / Partners. The partners on this home: the default (its name is persona.json's,
// Settings › 伙伴's rename) and up to three more, kept in partners.json. Each has its own
// conversation (channelOf(id) in the one Log), a name and a look; devices, projects, accounts
// and On hand are the person's and shared (design/personas.md).
//
// D486: on for every home (DUCTER_PARTNERS=off turns it off; opts.on in tests). With one partner
// nothing about partners shows. D312: a second partner answers in its own session, on its own view
// of core (partner-view.ts). D486: each has what it looks after (`about`, the person's words), and
// another can be removed: its id is never given again, so its conversation is never inherited.
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { HARNESSES, isHarnessId, type Bodies, type Brain, type LogEvent, type PartnerAsk } from "@ducter/protocol";
import type { LogStore } from "@ducter/protocol/src/internal.ts";
import { DEFAULT_PARTNER, PARTNERS_MAX, channelOf, cleanAbout, isFigure, isLook, lookForFigure, nextFigure, partnerNameProblem, lastLine, type PartnerFigure, type PartnerInfo, type PartnerLast, type PartnerLook } from "@ducter/protocol/src/partners.ts";
import { askOpen } from "@ducter/protocol/src/open-asks.ts";

export const PARTNERS_FILE = "partners.json";

interface Kept {
  id: string;
  name: string;
  look: PartnerLook;
  /** D565: its figure; absent: the pebble (every partner made before D565). */
  figure?: PartnerFigure;
  createdAt: string;
  /** D486: what it looks after, in the person's words. */
  about?: string;
  /** D536: what it thinks with, when the person gave it its own (absent: the default partner's). */
  brain?: Brain;
}

/** D536: a model or effort id as kept: one short token, no spaces or control characters. */
const shortId = (x: unknown, n: number): string | undefined => {
  if (typeof x !== "string") return undefined;
  const v = x.trim();
  return v && v.length <= n && !/[\s\p{Cc}]/u.test(v) ? v : undefined;
};

/** D536: a partner's own brain as kept: an agent that may be the partner, its model and effort; else none. */
export function cleanBrain(v: unknown): Brain | undefined {
  const b = v as { harness?: unknown; model?: unknown; effort?: unknown } | null | undefined;
  if (!b || typeof b !== "object" || typeof b.harness !== "string" || !isHarnessId(b.harness) || !HARNESSES[b.harness].partner) return undefined;
  const model = shortId(b.model, 80);
  const effort = shortId(b.effort, 20);
  return { harness: b.harness, ...(model ? { model } : {}), ...(effort ? { effort } : {}) };
}
interface File {
  defaultLook?: PartnerLook;
  /** D565: the default partner's figure, once the person changed it (absent: the pebble). */
  defaultFigure?: PartnerFigure;
  /** D486: what the default partner looks after (once there are others), in the person's words. */
  defaultAbout?: string;
  others: Kept[];
  /** D486: ids of removed partners: never given again (their conversations stay in the Log). */
  gone?: string[];
}

export type PartnerError = "empty" | "long" | "taken" | "full" | "unknown";

export interface Partners {
  /** Whether more than one partner is offered on this home (the preview flag). */
  on(): boolean;
  /** Every partner, the default first, with its conversation's open questions. */
  list(): PartnerInfo[];
  /** A partner by id (the default included). */
  get(id: string): PartnerInfo | undefined;
  /** Whether a client may show this partner's conversation. */
  has(id: string): boolean;
  add(input: { name: string; look?: unknown; /** D565 */ figure?: unknown; about?: unknown }): { ok: true; partner: PartnerInfo } | { ok: false; error: PartnerError };
  /** A rename, a new look or what it looks after. The default's rename goes through settings (persona.json), not here. */
  set(id: string, patch: { name?: string; look?: unknown; /** D565 */ figure?: unknown; about?: unknown; /** D536: null: the default's again. */ brain?: unknown }): { ok: true; partner: PartnerInfo } | { ok: false; error: PartnerError };
  /** D486: removes another partner (never the default). Its conversation stays in the Log; its tasks become the default's. */
  remove(id: string): { ok: true; partner: PartnerInfo } | { ok: false; error: PartnerError };
  /** D486: a partner by its name (trimmed, case folded), the default included. */
  byName(name: string): PartnerInfo | undefined;
  /** The name to say for an event's partner (push, the menu bar): its conversation's, else the default's. */
  nameOf(persona: string | undefined): string;
  /** D312: every partner's own open questions (On hand lists another partner's). */
  questions(): PartnerAsk[];
  /** D513: the last thing said in a partner's conversation, for the person's list of partners. */
  last(id: string): PartnerLast | undefined;
  /** Called after every change (ws sends every socket a fresh partners frame). */
  onChange(fn: () => void): () => void;
}

export function openPartners(opts: {
  dataDir: string;
  log: LogStore;
  /** The default partner (core's persona): its name is read live (a rename shows at once). */
  persona: { id: string; name: string };
  on?: boolean;
  now?: () => Date;
}): Partners {
  const path = join(opts.dataDir, PARTNERS_FILE);
  const now = opts.now ?? (() => new Date());
  const on = opts.on ?? process.env.DUCTER_PARTNERS !== "off";
  const listeners = new Set<() => void>();

  const read = (): File => {
    try {
      if (!existsSync(path)) return { others: [] };
      const raw = JSON.parse(readFileSync(path, "utf8"));
      const others = (Array.isArray(raw?.others) ? raw.others : [])
        .filter((p: any) => typeof p?.id === "string" && /^[a-z0-9-]{1,40}$/.test(p.id) && p.id !== DEFAULT_PARTNER && typeof p?.name === "string" && p.name.trim())
        .slice(0, PARTNERS_MAX - 1)
        .map((p: any): Kept => ({ id: p.id, name: String(p.name).trim(), look: isLook(p.look) ? p.look : "sage", ...(isFigure(p.figure) && p.figure !== "pebble" ? { figure: p.figure } : {}), createdAt: typeof p.createdAt === "string" ? p.createdAt : now().toISOString(), ...(cleanAbout(p.about) ? { about: cleanAbout(p.about) } : {}), ...(cleanBrain(p.brain) ? { brain: cleanBrain(p.brain) } : {}) }));
      const gone = (Array.isArray(raw?.gone) ? raw.gone : []).filter((g: unknown): g is string => typeof g === "string" && /^[a-z0-9-]{1,40}$/.test(g));
      return { ...(isLook(raw?.defaultLook) ? { defaultLook: raw.defaultLook } : {}), ...(isFigure(raw?.defaultFigure) && raw.defaultFigure !== "pebble" ? { defaultFigure: raw.defaultFigure } : {}), ...(cleanAbout(raw?.defaultAbout) ? { defaultAbout: cleanAbout(raw.defaultAbout) } : {}), others, ...(gone.length ? { gone } : {}) };
    } catch (err) {
      console.warn("[partners] couldn't read partners.json:", (err as Error).message);
      return { others: [] };
    }
  };
  let file = read();
  const save = () => {
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, JSON.stringify(file, null, 2), { mode: 0o600 });
    renameSync(tmp, path);
    for (const fn of listeners) fn();
  };

  /** Open questions of a partner's own conversation: its decisions minus their resolutions (no task's). */
  const questions = (id: string): PartnerAsk[] => {
    const stream = channelOf(id);
    const open = new Map<string, PartnerAsk>();
    for (const e of opts.log.read({ stream, kinds: ["decision"], limit: 500 }) as LogEvent<"decision">[]) {
      const d = e.body as Bodies["decision"];
      // D517, D615: an offer never needs the person (D453), and neither does a default already
      // due: the one shared predicate says so everywhere (open-asks.ts).
      if (!d.taskId && askOpen(d, { now: now().getTime() })) open.set(d.decisionId, { persona: id, decisionId: d.decisionId, question: d.question, at: e.ts });
    }
    if (!open.size) return [];
    // D517: a question put off till later (晚点再问我, D382) needs the person again only at its time.
    const nowMs = now().getTime();
    for (const s of stream === "channel" ? ["channel"] : [stream, "channel"])
      for (const e of opts.log.read({ stream: s, kinds: ["decision_later"], limit: 2000 })) {
        const l = e.body as Bodies["decision_later"];
        if (open.has(l.decisionId) && Date.parse(l.until) > nowMs) open.delete(l.decisionId);
      }
    // D312: a resolution lands in its question's own conversation; before D312 in the default's.
    const streams = stream === "channel" ? ["channel"] : [stream, "channel"];
    for (const s of streams) for (const e of opts.log.read({ stream: s, kinds: ["decision_resolved"], limit: 2000 })) open.delete((e.body as Bodies["decision_resolved"]).decisionId);
    return [...open.values()];
  };
  const asks = (id: string): number => questions(id).length;

  const defaultInfo = (): PartnerInfo => ({ id: DEFAULT_PARTNER, name: opts.persona.name, look: file.defaultLook ?? "sand", ...(file.defaultFigure ? { figure: file.defaultFigure } : {}), asks: asks(DEFAULT_PARTNER), ...(file.defaultAbout ? { about: file.defaultAbout } : {}) });
  const info = (p: Kept): PartnerInfo => ({ id: p.id, name: p.name, look: p.look, ...(p.figure ? { figure: p.figure } : {}), asks: asks(p.id), ...(p.about ? { about: p.about } : {}), ...(p.brain ? { brain: p.brain } : {}) });
  const names = (except?: string) => [opts.persona.name, ...file.others.map((p) => p.name)].filter((_, i) => (i === 0 ? except !== DEFAULT_PARTNER : file.others[i - 1]!.id !== except));
  const takenLooks = () => [file.defaultLook ?? "sand", ...file.others.map((p) => p.look)];
  const takenFigures = (): PartnerFigure[] => [file.defaultFigure ?? "pebble", ...file.others.map((p) => p.figure ?? "pebble")];
  const newId = () => {
    for (let n = file.others.length + 2; ; n++) {
      const id = `p${n}`;
      if (!file.others.some((p) => p.id === id) && !(file.gone ?? []).includes(id)) return id;
    }
  };

  return {
    on: () => on,
    list: () => [defaultInfo(), ...(on ? file.others.map(info) : [])],
    get(id) {
      if (id === DEFAULT_PARTNER) return defaultInfo();
      const p = on ? file.others.find((o) => o.id === id) : undefined;
      return p && info(p);
    },
    has: (id) => id === DEFAULT_PARTNER || (on && file.others.some((p) => p.id === id)),
    add(input) {
      if (!on || file.others.length >= PARTNERS_MAX - 1) return { ok: false, error: "full" };
      const name = String(input.name ?? "").trim();
      const why = partnerNameProblem(name, names());
      if (why) return { ok: false, error: why };
      const about = cleanAbout(input.about);
      // D565: a new partner arrives as the first figure nobody has, in that figure's own clay unless taken.
      const figure = isFigure(input.figure) ? input.figure : nextFigure(takenFigures());
      const look = isLook(input.look) ? input.look : lookForFigure(figure, takenLooks());
      const kept: Kept = { id: newId(), name, look, ...(figure !== "pebble" ? { figure } : {}), createdAt: now().toISOString(), ...(about ? { about } : {}) };
      file = { ...file, others: [...file.others, kept] };
      save();
      return { ok: true, partner: info(kept) };
    },
    set(id, patch) {
      if (id === DEFAULT_PARTNER) {
        if (patch.name !== undefined) return { ok: false, error: "unknown" }; // settings_set renames the default
        if (patch.brain !== undefined) return { ok: false, error: "unknown" }; // D536: the default's is Settings.brain
        if (patch.look === undefined && patch.about === undefined && patch.figure === undefined) return { ok: false, error: "unknown" };
        if (patch.look !== undefined && !isLook(patch.look)) return { ok: false, error: "unknown" };
        if (patch.figure !== undefined && !isFigure(patch.figure)) return { ok: false, error: "unknown" };
        const about = patch.about !== undefined ? cleanAbout(patch.about) : file.defaultAbout;
        const figure = patch.figure !== undefined ? (patch.figure as PartnerFigure) : file.defaultFigure;
        const { defaultAbout: _was, defaultFigure: _fig, ...rest } = file;
        file = { ...rest, ...(patch.look !== undefined ? { defaultLook: patch.look as PartnerLook } : {}), ...(figure && figure !== "pebble" ? { defaultFigure: figure } : {}), ...(about ? { defaultAbout: about } : {}) };
        save();
        return { ok: true, partner: defaultInfo() };
      }
      const at = on ? file.others.findIndex((p) => p.id === id) : -1;
      if (at < 0) return { ok: false, error: "unknown" };
      const was = file.others[at]!;
      let next = was;
      if (patch.name !== undefined) {
        const name = String(patch.name).trim();
        const why = partnerNameProblem(name, names(id));
        if (why) return { ok: false, error: why };
        next = { ...next, name };
      }
      if (patch.look !== undefined) {
        if (!isLook(patch.look)) return { ok: false, error: "unknown" };
        next = { ...next, look: patch.look };
      }
      if (patch.figure !== undefined) {
        if (!isFigure(patch.figure)) return { ok: false, error: "unknown" };
        const { figure: _was, ...rest } = next;
        next = patch.figure === "pebble" ? rest : { ...rest, figure: patch.figure };
      }
      if (patch.about !== undefined) {
        const about = cleanAbout(patch.about);
        const { about: _was, ...rest } = next;
        next = about ? { ...rest, about } : rest;
      }
      if (patch.brain !== undefined) {
        // D536: null is the default partner's again; anything it can't think with is refused.
        const brain = patch.brain === null ? undefined : cleanBrain(patch.brain);
        if (patch.brain !== null && !brain) return { ok: false, error: "unknown" };
        const { brain: _was, ...rest } = next;
        next = brain ? { ...rest, brain } : rest;
      }
      file = { ...file, others: file.others.map((p, i) => (i === at ? next : p)) };
      save();
      return { ok: true, partner: info(next) };
    },
    remove(id) {
      const at = on && id !== DEFAULT_PARTNER ? file.others.findIndex((p) => p.id === id) : -1;
      if (at < 0) return { ok: false, error: "unknown" };
      const was = file.others[at]!;
      file = { ...file, others: file.others.filter((_, i) => i !== at), gone: [...new Set([...(file.gone ?? []), id])] };
      save();
      return { ok: true, partner: info(was) };
    },
    byName(name) {
      const n = name.trim().toLocaleLowerCase();
      if (!n) return undefined;
      if (opts.persona.name.trim().toLocaleLowerCase() === n) return defaultInfo();
      const p = on ? file.others.find((o) => o.name.toLocaleLowerCase() === n) : undefined;
      return p && info(p);
    },
    nameOf(persona) {
      if (!persona || persona === DEFAULT_PARTNER) return opts.persona.name;
      return file.others.find((p) => p.id === persona)?.name ?? opts.persona.name;
    },
    last(id) {
      // The newest words of its conversation: the person's, its replies, its acks, its questions.
      const [e] = opts.log.read({ stream: channelOf(id), kinds: ["user_msg", "ai_msg", "ack", "decision"], limit: 1 });
      if (!e) return undefined;
      const b = e.body as { text?: unknown; question?: unknown };
      const text = lastLine(e.kind === "decision" ? b.question : b.text);
      return text ? { text, at: e.ts, ...(e.kind === "user_msg" ? { you: true } : {}) } : undefined;
    },
    questions: () => (on && file.others.length ? [DEFAULT_PARTNER, ...file.others.map((p) => p.id)].flatMap(questions) : []),
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
