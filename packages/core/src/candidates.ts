// fw_candidates v0 (D89, design/focus-window.md "Choosing a body"): who could do a task, best
// first, with a reason each. Deterministic: hard filters (installed, signed in, 用它做事 / Use it
// for tasks, the partner's reserve, a model picked), then the person's rules, then the shipped
// tier table, then the limit left. A pin (the partner's or the person's choice) wins over all of
// it unless a hard filter says no, and then the move is said, never silent.
//
// D157 (design/where.md §4): where is part of who. With two or more computers the ranking is over
// (computer × agent × model): hard filters (the task's needs, then the agent's own), then rows
// that can start now over rows that wait, then the person's word (a computer they named, a rule),
// then the least access that does the job, then a computer that doesn't sleep for long work, then
// continuity, then the agent's own rank, then the home. One reason says why that computer.
import { HARNESSES, harnessName, isHarnessId, PARTNER_RESERVE, type BodyWhy, type Candidate, type CandidateBlock, type DeviceHarness, type DeviceView, type Place, type RuleView, type Settings, type TaskNeeds, type WhereBlock, type WhereWhy } from "@ducter/protocol";
import { HARNESS_FACTS } from "@ducter/protocol/src/harness-facts.ts";
import { ruleFor } from "./rules.ts";

/** One AI agent and model, as the tier table knows it. smart: the strongest; fast: quick and light on the limit. */
interface Tier {
  harness: string;
  model?: string;
  kind: "smart" | "fast";
  /** Only when the home lists the model: pi's models depend on the providers it is signed in to. */
  listed?: true;
  /** The model in plain words, where its id isn't one (DeepSeek's provider/model ids). */
  label?: string;
}

/**
 * The shipped tier table: curated data, refreshed with Ducter (no learned router). A harness
 * whose models aren't listed here runs on its own default model (one row, no model).
 * D177: DeepSeek's two official models, smart and fast, on DeepSeek Harness and on pi.
 */
const TIERS: Tier[] = [
  { harness: "claude-code", model: "opus", kind: "smart" },
  { harness: "claude-code", model: "sonnet", kind: "fast" },
  { harness: "codex", kind: "smart" },
  { harness: "deepseek-harness", model: "deepseek-official/deepseek-v4-pro", kind: "smart", label: "V4 Pro" },
  { harness: "deepseek-harness", model: "deepseek-official/deepseek-flash", kind: "fast", label: "Flash" },
  { harness: "pi", model: "deepseek/deepseek-v4-pro", kind: "smart", listed: true, label: "V4 Pro" },
  { harness: "pi", model: "deepseek/deepseek-flash", kind: "fast", listed: true, label: "Flash" },
  { harness: "pi", kind: "fast" },
];

/**
 * D157: one computer that runs tasks, as the ranking sees it (from the devices frame: computersOf).
 * sites: the sites Ducter's own browser there is signed in to (Signed-in sites, D151).
 */
export interface Computer {
  id: string;
  name: string;
  home: boolean;
  state: "awake" | "asleep" | "unreachable";
  alwaysOn: boolean;
  mac: boolean;
  harnesses: DeviceHarness[];
  web?: { on: boolean; where?: "chrome" | "ducter" };
  sites?: string[];
  /** D217: Ducter's phone is on here (用手机). */
  phone?: boolean;
  /** D235: 用电脑 / Use the computer is on here (with macOS's two switches). */
  computer?: boolean;
}

/** The computers that run tasks (the home and its workers), from the devices frame. */
export function computersOf(devices: DeviceView[], sites?: (deviceId: string) => string[]): Computer[] {
  return devices
    .filter((d) => d.kind !== "phone")
    .map((d) => {
      const web = d.abilities.find((a) => a.id === "web");
      const phone = d.abilities.find((a) => a.id === "phone");
      const computer = d.abilities.find((a) => a.id === "computer");
      const mac = d.platform ? d.platform.startsWith("darwin") : d.kind !== "server";
      return {
        id: d.id,
        name: d.name,
        home: d.home,
        state: d.state,
        alwaysOn: d.alwaysOn ?? (d.kind === "server" || d.kind === "mini"),
        mac,
        harnesses: d.harnesses,
        ...(web ? { web: { on: web.state === "on", ...(web.where ? { where: web.where } : {}) } } : {}),
        ...(sites ? { sites: sites(d.id) } : {}),
        ...(phone?.state === "on" && !phone.setup ? { phone: true } : {}),
        ...(computer?.state === "on" ? { computer: true } : {}),
      };
    });
}

export interface CandidateInput {
  work: { title: string; brief?: string };
  /** The AI agents on the device the task runs on (one computer; the old input, kept for callers without computers). */
  harnesses?: DeviceHarness[];
  /** D157: every computer that runs tasks; the ranking is over (computer × agent × model). */
  computers?: Computer[];
  /** D157: what the task needs of its computer. */
  needs?: TaskNeeds;
  /** The task's place: a repo or folder fixes its computer. */
  place?: Place;
  /** D157: a computer the user named ("在 MacBook 上做"), by name or id. */
  pinDevice?: string;
  settings: Pick<Settings, "brain" | "taskAccounts">;
  rules: RuleView[];
  /** Who does it now (the switch sheet marks it), and on which computer. */
  current?: { harness: string; model?: string; device?: string; uses?: "chrome" | "ducter" };
  /** D202: the New task card: every agent on every computer, an agent on another computer than the folder's included (one row each). */
  every?: true;
}

/** Why this agent can't take a task now, if it can't. */
export function blockOf(h: DeviceHarness | undefined, s: CandidateInput["settings"]): CandidateBlock | undefined {
  if (!h || !h.installed) return "not_installed";
  if (!h.loggedIn) return h.harness === "pi" ? "no_model" : "signed_out";
  if (isHarnessId(h.harness) && s.taskAccounts?.[h.harness]?.enabled === false) return "off";
  // Tasks never eat the part of the partner's own account kept for its answers.
  if (h.harness === s.brain.harness && h.allowance && h.allowance.left <= PARTNER_RESERVE) return "reserve";
  return undefined;
}

const rows = (h: DeviceHarness): Tier[] => {
  if (h.models?.length) {
    const known = TIERS.filter((t) => t.harness === h.harness && t.model);
    return h.models.map((m, i) => {
      const k = known.find((x) => x.model === m.id);
      return { harness: h.harness, model: m.id, kind: k?.kind ?? (i === 0 ? "smart" : "fast"), ...(k?.label ? { label: k.label } : {}) };
    });
  }
  const own = TIERS.filter((t) => t.harness === h.harness && !t.listed);
  return own.length ? own : [{ harness: h.harness, kind: "fast" }];
};

/**
 * The models the partner may think with on an AI agent (D150): what the home's account lists,
 * else the tier table's models for it (Claude Code: Opus, Sonnet), kept to names the harness
 * facts know. None: it runs on its own default model.
 */
export function brainModelRows(harness: string, h: DeviceHarness | undefined): { id: string; label: string; kind: "smart" | "fast" }[] {
  const facts = isHarnessId(harness) ? HARNESS_FACTS[harness]?.models.value : undefined;
  const known = (id: string) => !facts || !Object.keys(facts).length || id in facts;
  const listed = h?.models?.length ? h.models : undefined;
  return rows(h ?? { harness, installed: true, loggedIn: true, canBePartner: true })
    .filter((t): t is Tier & { model: string } => !!t.model && known(t.model))
    .map((t) => ({ id: t.model, label: t.label || listed?.find((m) => m.id === t.model)?.label || t.model[0]!.toUpperCase() + t.model.slice(1), kind: t.kind }));
}

const same = (a: { harness: string; model?: string }, b?: { harness: string; model?: string }) =>
  !!b && a.harness === b.harness && (a.model ?? "") === (b.model ?? "");

/** A computer named by name or id ("local" and "" are the home). */
const isComputer = (c: Computer, name: string | undefined) => {
  const n = (name ?? "").trim().toLowerCase();
  if (!n || n === "local") return c.home;
  return c.id.toLowerCase() === n || c.name.toLowerCase() === n;
};

/** What a computer can do for these needs: why not, or what it would use. */
function fit(c: Computer, needs: TaskNeeds | undefined, place: Place | undefined): { block?: WhereBlock; uses?: "chrome" | "ducter"; needsSignIn?: boolean } {
  // A folder or a repo lives on one computer: the task runs there (a folder never moves, D142).
  if (place && (place.kind === "repo" || place.kind === "folder") && !isComputer(c, place.device)) return { block: "elsewhere" };
  if (needs?.app && !c.mac) return { block: "no_app" };
  // D217: work on an app on a phone runs where Ducter's phone is.
  if (needs?.phone && !c.phone) return { block: "no_phone" };
  const browses = !!(needs?.browse || needs?.signedIn || place?.kind === "browser");
  if (!browses) return {};
  if (!c.web?.on) return { block: needs?.signedIn ? "no_chrome" : "no_browser" };
  if (c.web.where === "chrome") return { uses: "chrome" };
  // Ducter's own browser: the user's sign-ins only where they signed in there (D151); else they would sign in first.
  const site = needs?.site?.replace(/^www\./, "").toLowerCase();
  const signed = !!site && (c.sites ?? []).some((s) => s === site || site.endsWith("." + s));
  return { uses: "ducter", ...(needs?.signedIn && !signed ? { needsSignIn: true } : {}) };
}

interface Row extends Candidate {
  /** Higher is better, compared step by step (design/where.md §4.3). */
  key: number[];
  comp: Computer;
}

/** Steps of the ranking, in order; the index into Row.key. */
const STEP = { ok: 0, now: 1, word: 2, access: 3, keeps: 4, continuity: 5, agent: 6, home: 7 } as const;

/** Every (computer, agent, model) row, best first. */
function rank(inp: CandidateInput): { rows: Row[]; multi: boolean } {
  const comps: Computer[] = inp.computers ?? [{ id: "local", name: "", home: true, state: "awake", alwaysOn: false, mac: true, harnesses: inp.harnesses ?? [] }];
  const multi = (inp.computers?.length ?? 0) > 1;
  const rule = ruleFor(inp.rules, inp.work);
  const all: Row[] = [];
  for (const c of comps) {
    const f = fit(c, inp.needs, inp.place);
    for (const h of c.harnesses) {
      if (!isHarnessId(h.harness) || !HARNESSES[h.harness].task) continue;
      // D206: a picture to make goes only to an agent that makes pictures.
      const blocked = blockOf(h, inp.settings) ?? f.block ?? (inp.needs?.draw && !HARNESSES[h.harness].draws ? ("no_draw" as const) : undefined);
      for (const t of rows(h)) {
        const ruled = !!rule && rule.harness === t.harness && (!rule.model || rule.model === t.model);
        const left = h.allowance?.left;
        const waits = c.state === "awake" ? undefined : c.state;
        // The person's word: their pin of a computer, then their rule (its agent, its computer).
        const word = (inp.pinDevice && isComputer(c, inp.pinDevice) ? 4 : 0) + (ruled ? 2 : 0) + (rule?.device && isComputer(c, rule.device) ? 1 : 0);
        // Least access that does the job: Ducter's own browser (signed in where needed) over the user's Chrome.
        // D235: work in a Mac app goes to a Mac where the person added 用电脑 / Use the computer.
        const access = f.uses === "ducter" && !f.needsSignIn ? 2 : f.uses === "chrome" ? 1 : inp.needs?.app && c.computer ? 1 : 0;
        // Strongest; plan before pay-per-use; then the most limit left (the agent's own rank, D89).
        const agent = (t.kind === "smart" ? 100 : 50) + (h.billing === "usage" ? -30 : 0) + (left ?? 0.5) * 20;
        const key = [blocked ? 0 : 1, waits ? 0 : 1, word, access, inp.needs?.long && c.alwaysOn ? 1 : 0, inp.current?.device && isComputer(c, inp.current.device) ? 1 : 0, agent, c.home ? 1 : 0];
        const reason: Candidate["reason"] = ruled ? { kind: "rule", ruleId: rule!.id, text: rule!.text } : { kind: t.kind === "smart" ? "fit" : "fast" };
        all.push({
          harness: t.harness,
          ...(t.model ? { model: t.model } : {}),
          reason,
          ...(left != null ? { left } : {}),
          ...(h.allowance?.resetsAt ? { resetsAt: h.allowance.resetsAt } : {}),
          ...(h.billing ? { billing: h.billing } : {}),
          ...(blocked ? { blocked } : {}),
          ...(multi ? { device: c.id, deviceName: c.name } : {}),
          ...(multi && waits ? { waits } : {}),
          ...(f.uses ? { uses: f.uses } : {}),
          ...(f.needsSignIn ? { needsSignIn: true } : {}),
          ...(isHarnessId(t.harness) && !HARNESSES[t.harness].images ? { noImages: true as const } : {}),
          ...(f.uses === "chrome" && inp.current && inp.current.uses !== "chrome" && (inp.current.uses || inp.place?.kind === "browser") ? { widens: true } : {}),
          key,
          comp: c,
        });
      }
    }
  }
  all.sort((a, b) => {
    for (let i = 0; i < a.key.length; i++) if (a.key[i] !== b.key[i]) return b.key[i]! - a.key[i]!;
    return 0;
  });
  return { rows: all, multi };
}

const strip = ({ key: _k, comp: _c, ...c }: Row): Candidate => c;

/**
 * Everyone who could do this work, best first: the one doing it now, then others who can take it,
 * then (greyed) those who can't, with why. With two or more computers (D157) the rows say which
 * computer, and each computer keeps a few of its own so the sheet can group them.
 */
export function fwCandidates(inp: CandidateInput): Candidate[] {
  const { rows: all, multi } = rank(inp);
  const isCur = (c: Row) => same(c, inp.current) && (!multi || !inp.current?.device || isComputer(c.comp, inp.current.device));
  const cur = all.find(isCur);
  const perComp = new Map<string, number>();
  const free = inp.every ? all.filter((c) => !c.blocked && c !== cur) : all.filter((c) => !c.blocked && c !== cur && (perComp.set(c.comp.id, (perComp.get(c.comp.id) ?? 0) + 1).get(c.comp.id)! <= 3)).slice(0, multi ? 9 : 3);
  // A row whose only difference is a model of an agent already listed as blocked says nothing new.
  const seenBlocked = new Set<string>();
  const blocked = all.filter((c) => c.blocked && c !== cur && !seenBlocked.has(c.comp.id + c.harness) && seenBlocked.add(c.comp.id + c.harness)).slice(0, inp.every ? undefined : multi ? 6 : 3);
  return [...(cur ? [{ ...strip(cur), current: true, reason: { kind: "current" as const } }] : []), ...free.map(strip), ...blocked.map(strip)];
}

/** Why the first choice moved: a short limit, or whatever else stops it (said, never silent). */
function movedWhy(from: string, b: CandidateBlock, rule?: RuleView): BodyWhy {
  const r = rule ? { ruleId: rule.id, text: rule.text } : {};
  return b === "reserve" ? { kind: "limit", from, ...r } : { kind: "unavailable", from, blocked: b, ...r };
}

const BLOCK_WORDS: Record<CandidateBlock, string> = {
  not_installed: "it isn't installed on that device",
  signed_out: "it isn't signed in",
  off: "Use it for tasks is off for it",
  reserve: "only the part of its limit kept for the partner is left",
  no_model: "no model is picked for it yet",
  offline: "its device can't be reached",
  no_browser: "no computer it is on can browse the web",
  no_chrome: "it needs the user's Chrome, and no computer it is on has it",
  no_app: "it needs a Mac app, and it isn't on a Mac",
  elsewhere: "the folder is on another computer",
  no_draw: "it can't make pictures (only Codex can)",
  no_phone: "it needs a phone, and none is set up yet: the user adds 用这台手机 / Use this phone on their Android phone (in the Ducter app there), or 用手机 / Use a phone on their Mac in 设备 / Devices (a one-time download of about 2.3 GB)",
};

/** The one line the New task card / `ducter task --agent` shows when the person's own pick can't run. */
/** D247: never the person's phone over adb, a cable or Developer options. */
const NO_ADB = "Never suggest adb, USB or wireless debugging, a cable or Developer options.";

/** D217, D247: what the partner hears when work needs a phone and none can serve it (no Android app connected). */
export const NO_PHONE = `no phone to work on yet: the user installs Ducter on their own Android phone (from this home's web page there), opens it, and adds 用这台手机 / Use this phone on that phone's card (one switch in Android, once); or on their Mac 用手机 / Use a phone (Ducter's own phone, a one-time download of about 2.3 GB). Tell the user that in one line; no task was opened. ${NO_ADB}`;

/**
 * D247: the line for work that needs a phone when none can serve it now. A paired Android phone
 * whose app isn't open (or is too old) is named, so the person knows the one thing to do; with no
 * Android phone at all, NO_PHONE. (A connected one never gets here: the task opens and its card
 * offers to turn 用这台手机 on.)
 */
export function noPhoneLine(clients: { name: string; platform: string; connected: boolean; handset?: { added: boolean; able: boolean; linked: boolean } }[] | undefined): string {
  const androids = (clients ?? []).filter((c) => /android/i.test(c.platform) || c.handset);
  const nm = (c: { name: string }) => c.name.replace(/\s*·\s*Ducter$/, "").trim() || "their Android phone";
  const old = androids.find((c) => c.handset?.linked && !c.handset.able);
  if (old) return `no phone to work on yet: the Ducter app on ${nm(old)} is too old for 用这台手机 / Use this phone. Tell the user in one line to update Ducter on ${nm(old)}, then ask again; no task was opened. ${NO_ADB}`;
  const away = androids.find((c) => c.handset?.added) ?? androids[0];
  if (away) return `no phone to work on yet: Ducter isn't open on ${nm(away)} right now. Tell the user in one line to open Ducter on ${nm(away)} and ask again${away.handset?.added ? "" : "; it then offers to turn on 用这台手机 / Use this phone there (one switch in Android, once)"}; no task was opened. ${NO_ADB}`;
  return NO_PHONE;
}

export function pinProblem(harness: string, b: CandidateBlock): string {
  return `${harnessName(harness)} can't take this task: ${BLOCK_WORDS[b]}. Pick another AI agent, or fix that first.`;
}

/**
 * D157: the one reason the top row is on its computer: the first step of the ranking that set it
 * apart from the best row on another computer (design/where.md §4.3). Undefined with one computer.
 */
function whereWhy(top: Row, all: Row[], inp: CandidateInput, rule: RuleView | undefined): WhereWhy | undefined {
  const c = top.comp;
  const needs = inp.needs;
  const uses: WhereWhy["uses"] = top.uses ?? (needs?.app ? "app" : undefined);
  const base = { device: c.name, ...(uses ? { uses } : {}), ...(uses === "app" && needs?.app ? { app: needs.app } : {}) };
  const other = all.find((r) => !r.blocked && r.comp.id !== c.id);
  if (!other) {
    // Nobody else can. Say what only this computer has.
    if (inp.place && (inp.place.kind === "repo" || inp.place.kind === "folder")) return { ...base, kind: "changes_here" };
    if (needs?.app) return { ...base, kind: "only_here", thing: "app", app: needs.app };
    if (needs?.phone) return { ...base, kind: "only_here", thing: "phone" };
    if (needs?.signedIn && top.uses === "chrome") return { ...base, kind: "signed_in", ...(needs.site ? { site: needs.site } : {}) };
    if (needs?.browse || needs?.signedIn) return { ...base, kind: "only_here", thing: top.uses === "chrome" ? "chrome" : "browser" };
    const elsewhere = all.some((r) => r.comp.id !== c.id && r.harness === top.harness && !r.blocked);
    if (!elsewhere && all.some((r) => r.comp.id !== c.id)) return { ...base, kind: "agent_here", agent: top.harness };
    return { ...base, kind: c.home ? "home" : "only_here", ...(c.home ? {} : { thing: "agent" as const, agent: top.harness }) };
  }
  const step = top.key.findIndex((v, i) => v !== other.key[i]);
  switch (step) {
    case STEP.now:
      return { ...base, kind: "awake", other: other.comp.name };
    case STEP.word: {
      if (inp.pinDevice && isComputer(c, inp.pinDevice)) return { ...base, kind: "you" };
      if (rule?.device && isComputer(c, rule.device)) return { ...base, kind: "you", ruleId: rule.id, text: rule.text };
      return { ...base, kind: "agent_here", agent: top.harness };
    }
    case STEP.access:
      if (top.uses === "chrome") return { ...base, kind: "signed_in", ...(needs?.site ? { site: needs.site } : {}) };
      if (needs?.signedIn) return { ...base, kind: "signed_in", ...(needs.site ? { site: needs.site } : {}) };
      return { ...base, kind: "no_signin" };
    case STEP.keeps:
      return { ...base, kind: "always_on", other: other.comp.name };
    case STEP.continuity:
      return { ...base, kind: "changes_here" };
  }
  // An agent's own rank, or nothing at all, set them apart: the home is one hop fewer.
  const has = all.some((r) => r.comp.id !== c.id && r.harness === top.harness && !r.blocked);
  if (!has) return { ...base, kind: "agent_here", agent: top.harness };
  return { ...base, kind: c.home ? "home" : "always_on", ...(c.home ? {} : { other: other.comp.name }) };
}

/** A pick: who, on which computer, and why. */
export interface BodyPick {
  harness: string;
  model?: string;
  why: BodyWhy;
  /** D157: the computer (name; "local" for the home with one computer) and what it uses there. */
  device?: string;
  deviceId?: string;
  home?: boolean;
  waits?: "asleep" | "unreachable";
  uses?: "chrome" | "ducter";
  needsSignIn?: boolean;
  /** D157: the best row on another computer that can start now, when the pick waits (the ask's other choice). */
  now?: { device: string; deviceId: string; name: string; harness: string; model?: string; uses?: "chrome" | "ducter"; needsSignIn?: boolean };
}

/**
 * Who does a new task, on which computer, and why (the body_selected the card shows). pinned: a
 * choice in the moment, the partner's or the person's own (pinnedBy "you": the New task card,
 * `--agent`). The partner's pin or a rule that can't run moves to the next best, with why. The
 * person's own pick never moves silently: `problem` is the one line to show them. Undefined when
 * no AI agent can take it: the caller says so in one line.
 */
export function chooseBody(inp: Omit<CandidateInput, "current"> & { pinned?: { harness: string; model?: string }; pinnedBy?: "you" }): BodyPick | { problem: string } | undefined {
  const { rows: all, multi } = rank(inp);
  // A computer the user named holds, even asleep: the task waits there (never moved silently).
  const named = inp.pinDevice ? all.filter((c) => !c.blocked && isComputer(c.comp, inp.pinDevice)) : [];
  const ok = named.length ? named : all.filter((c) => !c.blocked);
  const rule = ruleFor(inp.rules, inp.work);
  const pick = (c: Row, why: BodyWhy): BodyPick => {
    const where = multi ? whereWhy(c, all, inp, rule) : undefined;
    // The one that can start now, for the ask (never one that widens access silently: the ask says so).
    const now = c.waits && !named.length ? all.find((r) => !r.blocked && !r.waits && r.comp.id !== c.comp.id) : undefined;
    return {
      harness: c.harness,
      ...(c.model ? { model: c.model } : {}),
      why: where ? { ...why, where } : why,
      ...(multi ? { device: c.comp.home ? "local" : c.comp.name, deviceId: c.comp.id, home: c.comp.home } : {}),
      ...(c.waits ? { waits: c.waits } : {}),
      ...(c.uses ? { uses: c.uses } : {}),
      ...(c.needsSignIn ? { needsSignIn: true } : {}),
      ...(now ? { now: { device: now.comp.home ? "local" : now.comp.name, deviceId: now.comp.id, name: now.comp.name, harness: now.harness, ...(now.model ? { model: now.model } : {}), ...(now.uses ? { uses: now.uses } : {}), ...(now.needsSignIn ? { needsSignIn: true } : {}) } } : {}),
    };
  };
  if (inp.pinned) {
    const mine = all.filter((c) => c.harness === inp.pinned!.harness);
    const usable = [...mine.filter((c) => !c.blocked && named.includes(c)), ...mine.filter((c) => !c.blocked)];
    const best = usable.find((c) => !inp.pinned!.model || c.model === inp.pinned!.model) ?? usable[0];
    if (best) {
      // D128: the user picked it on the New task card (or `ducter task --agent`): "…，是你选的".
      const why: BodyWhy = inp.pinnedBy === "you" ? { kind: "you" } : rule && rule.harness === inp.pinned.harness ? { kind: "rule", ruleId: rule.id, text: rule.text } : { kind: "partner" };
      const p = pick(best, why);
      // The pinned model rides along even when the tier table doesn't list it.
      return { ...p, ...(inp.pinned.model ? { model: inp.pinned.model } : {}) };
    }
    const b = mine[0]?.blocked ?? "not_installed";
    if (inp.pinnedBy === "you") return { problem: pinProblem(inp.pinned.harness, b) };
    const next = ok[0];
    if (!next) return undefined;
    return pick(next, movedWhy(inp.pinned.harness, b));
  }
  if (rule) {
    const theirs = ok.filter((c) => c.harness === rule.harness);
    const mine = [...theirs.filter((c) => !rule.model || c.model === rule.model), ...theirs];
    if (mine[0]) return { ...pick(mine[0], { kind: "rule", ruleId: rule.id, text: rule.text }), ...(rule.model ? { model: rule.model } : {}) };
    const b = all.find((c) => c.harness === rule.harness)?.blocked ?? "not_installed";
    const next = ok[0];
    if (!next) return undefined;
    return pick(next, movedWhy(rule.harness, b, rule));
  }
  let best = ok[0];
  if (!best) return undefined;
  // D157 (where.md §4.4): the best computer for the task is asleep, and another can start now.
  // Never ask between equal computers: the awake one just does it. When what the user would see
  // differs (other sign-ins; they'd sign in there first) or the awake one widens access (their
  // Chrome instead of Ducter's own browser), the pick waits by default and the ask offers now.
  const ideal = [...ok].sort((a, b) => {
    for (let i = 0; i < a.key.length; i++) if (i !== STEP.now && a.key[i] !== b.key[i]) return b.key[i]! - a.key[i]!;
    return 0;
  })[0]!;
  if (multi && ideal.waits && ideal.comp.id !== best.comp.id && !best.waits) {
    const visible = !!best.needsSignIn || best.uses !== ideal.uses || (best.uses === "chrome" && ideal.uses !== "chrome");
    if (visible) best = ideal;
  }
  // The brain's own account was the natural first choice but only its reserve is left: say it.
  const brain = best.comp.harnesses.find((x) => x.harness === inp.settings.brain.harness);
  if (best.harness !== inp.settings.brain.harness && brain && blockOf(brain, inp.settings) === "reserve") {
    return pick(best, { kind: "limit", from: inp.settings.brain.harness });
  }
  // The model the ranking chose goes with it, so the card says what runs (the runner may put
  // DUCTER_TASK_MODEL in its place for a default pick, and logs what it actually ran).
  return pick(best, { kind: "default" });
}
