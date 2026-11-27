// What the partner thinks with, and who does the tasks (D89, design/ai-loadout.md): the rules a
// person said, why a task is on the AI agent it is on, and who else could do it. Pure data:
// core computes it (packages/core/src/candidates.ts, rules.ts), clients word it.

/** The share of the partner's own account kept for its answers; tasks can't use it (D89: fixed in v1). */
export const PARTNER_RESERVE = 0.1;

/**
 * D372: the kind of work a task is, decided once by the partner at task_open (or inferred by
 * Ducter when it didn't say): 写代码 / Code, 跑腿 / Errands (booking, comparing prices, forms,
 * looking things up on the web, an app on a phone), 写东西 / Writing, 查资料 / Research, 其他 /
 * Other. Rules can name a kind, and the built-in defaults route by it (errands to a fast tier).
 */
export type WorkKind = "code" | "errand" | "writing" | "research" | "other";
export const WORK_KINDS: readonly WorkKind[] = ["code", "errand", "writing", "research", "other"];
export const isWorkKind = (k: unknown): k is WorkKind => typeof k === "string" && (WORK_KINDS as readonly string[]).includes(k);

/**
 * D372: the built-in default for a kind of work when no rule of the person's covers it (shown on
 * the Partner page under the rules, in literal words). work "rest": every other kind.
 */
export interface KindDefault {
  work: WorkKind | "rest";
  harness: string;
  model?: string;
}

/** A rule the person said in the conversation: work of a kind goes to one AI agent. */
export interface RuleView {
  id: string;
  /** The rule in one line, in the words it was said in ("后端的事 → Codex"). */
  text: string;
  harness: string; // a HarnessId
  model?: string;
  /** Words that mark the kind of work, in any language; a task whose title or brief has one matches. */
  match: string[];
  /** D372: the kinds of work it covers (a task of one of these kinds matches, whatever its words). */
  kinds?: WorkKind[];
  /** D372: "别用 Claude Code 订酒店": never this agent (and model, when named) for this kind of work. */
  never?: true;
  createdAt: string; // ISO
  /** D157: the computer this kind of work runs on ("要登录的网页都在 MacBook 上做"), by name. */
  device?: string;
  /**
   * D538: a placement rule (harness "", device its computer): prefer or avoid that computer for work
   * of a shape the partner judges at task_open: heavy (needs.heavy), web (browse, signedIn, buy), or
   * with neither any work (narrowed by kinds or match when given). Household knowledge every partner
   * shares, never one persona's identity.
   */
  where?: PlaceRule;
  /**
   * D165: a rule about what it tells the person, not who does a task (harness "", match []).
   * mute: 这类不用告诉我 (a kind, from one sender when given). wake: this kind may come through at
   * night ("航班改了，夜里也叫我"), said by the person, never proposed.
   */
  notice?: { kind: string; sender?: string; wake?: boolean };
}

/** D538: what a placement rule says: prefer (多放) or avoid (少放) its computer, and for which work. */
export interface PlaceRule {
  avoid?: true;
  /** For heavy work only (the partner's needs.heavy). */
  heavy?: true;
  /** For web work only (needs.browse, signedIn, buy, or a browser place). */
  web?: true;
  /** D538: the Nowledge Mem memory it is mirrored to, while Mem is on (its id). */
  mem?: string;
}

/**
 * D157: what a task needs of the computer it runs on. The partner says it (task_open needs) and
 * Ducter picks the computer; a computer named by the user is a pin (place.device), not a need.
 *  - browse: web pages (上网 on that computer);
 *  - signedIn: sites the user is signed in to (their Chrome there, or Ducter's own browser
 *    already signed in to `site` there); site: the site, when known ("taobao.com");
 *  - app: a Mac app it works in ("Keynote"): a Mac;
 *  - long: long or ongoing work: a computer that doesn't sleep is preferred.
 */
export interface TaskNeeds {
  browse?: boolean;
  signedIn?: boolean;
  site?: string;
  app?: string;
  long?: boolean;
  /** D206: it makes a picture (画一张… / Draw…): only an agent that generates images takes it. */
  draw?: boolean;
  /**
   * D217, D251: it works in an app on a phone. Which phone (D251): "mine" = the person's own phone
   * (用这台手机: their apps, accounts, messages), never Ducter's; "ducter" = Ducter's own phone (用手机,
   * a clean emulator on a Mac); true = either (the person's when added, else Ducter's: D238, D247).
   */
  phone?: boolean | "mine" | "ducter";
  /** D436: it buys or books something: Ducter's own browser, and it stops at the checkout for the person's own tap. */
  buy?: boolean;
  /**
   * D538: heavy on the computer's memory and cores (a build, a test suite, type checks, a browser or
   * Playwright, a dev server, an eval), as the partner judges it from the words and the repository.
   * It goes to a computer with room, and waits for room rather than start where there is none.
   */
  heavy?: boolean;
  /**
   * D612: its job is reviewing other people's pull requests (a review routine/Keep), not fixing
   * code. The partner judges it once at task_open from the brief, and code records it here; only a task
   * with this gets `review_report`. A task that opens its own PR never is a review task, whatever this
   * says (core guards it).
   */
  reviews?: boolean;
}

/** D251: which phone a task's work needs: undefined when it needs none; "any" for the legacy true. */
export function whichPhone(needs: { phone?: boolean | "mine" | "ducter" } | undefined): "mine" | "ducter" | "any" | undefined {
  const p = needs?.phone;
  return p === "mine" || p === "ducter" ? p : p ? "any" : undefined;
}

/**
 * D157: why a task runs on the computer it runs on, when two or more computers run tasks (the
 * reason behind the where line; clients word it, design/where.md §8). device: the computer's name.
 *  - always_on: it doesn't sleep (other: the laptop that does);
 *  - signed_in: it has the user's sign-ins (site);
 *  - only_here: no other computer can (thing: chrome | browser | app | agent; app / agent named);
 *  - awake: the other one (other) is asleep or can't be reached;
 *  - changes_here: the work (a checkout, a session) is there;
 *  - agent_here: the agent picked lives only there (agent);
 *  - no_signin: it needs no sign-ins, so Ducter's own browser there does it (least access);
 *  - moved: the first pick (other) couldn't be reached before it started;
 *  - you: the user named this computer (or a rule did: ruleId, text);
 *  - room (D538): heavy work, and the other computer (other) hasn't the memory free for it now;
 *  - home: nothing set them apart; Ducter lives here (one hop fewer).
 */
export interface WhereWhy {
  device: string;
  kind: "always_on" | "signed_in" | "only_here" | "awake" | "changes_here" | "agent_here" | "no_signin" | "moved" | "you" | "room" | "home";
  other?: string;
  site?: string;
  thing?: "chrome" | "browser" | "app" | "agent" | "phone";
  app?: string;
  agent?: string;
  ruleId?: string;
  text?: string;
  /** What it uses on that computer when that is the point: the user's Chrome, Ducter's own browser, an app. */
  uses?: "chrome" | "ducter" | "app";
  /** D505 (rev.): with signed_in: the site is one the person said goes straight to their Chrome (Settings' chromeSites). */
  always?: boolean;
}

/**
 * Why a task is on the AI agent it is on. Clients word it:
 *  - default: Ducter picked the best fit with the most limit left (no reason line);
 *  - rule:    the person's rule (ruleId, text);
 *  - limit:   the first choice was short of limit (from: who it would have been);
 *  - unavailable: the first choice (the partner's pick or a rule's) can't take it for another
 *             reason (from, blocked: signed out, off, not installed, …);
 *  - you:     the person switched it, or picked it on New task;
 *  - partner: the partner picked it in the moment (text: its words, e.g. "you asked for Codex");
 *  - kind (D372): the built-in default for this kind of work (work) put it on a fast tier, and the
 *             smartest (keeps) is kept for harder work; first: the first time for this kind;
 *  - retry (D372): the fast tier (from, fromModel) failed or stalled (stalled), so it carries on
 *             here, on the smartest, once by itself.
 *  - said (D379): what the person said earlier ("订酒店这类别用 Claude Code", text), never saved as
 *             a rule, changed who does it.
 */
export interface BodyWhy {
  kind: "default" | "rule" | "limit" | "unavailable" | "you" | "partner" | "kind" | "retry" | "said";
  ruleId?: string;
  text?: string;
  from?: string;
  blocked?: CandidateBlock;
  /** D157: where it runs and why, when two or more computers run tasks. */
  where?: WhereWhy;
  /** D372: the kind of work (kind, retry). */
  work?: WorkKind;
  /** D372 (kind): the smartest, kept for harder work. */
  keeps?: { harness: string; model?: string };
  /** D372 (kind): the first task of this kind routed by the default (the partner says it once). */
  first?: true;
  /** D372 (retry): the model it was on. */
  fromModel?: string;
  /** D372 (retry): it stopped without a report (else it failed). */
  stalled?: true;
  /**
   * D379 (said): what the person said earlier and never saved as a rule decided it (text: their
   * words): the saying, so the partner asks once to keep it.
   */
  said?: { key: string; harness: string; never?: true; kinds: WorkKind[] };
}

export interface TaskBody {
  harness: string;
  model?: string;
  effort?: string;
  why: BodyWhy;
}

/**
 * Why an AI agent can't take a task: not_installed, signed_out, off (用它做事 / Use it for tasks
 * is off), reserve (only the part kept for the partner is left), no_model (pi before a model is
 * picked), offline (its device can't be reached), ruled_out (D372: the person's rule says never
 * this one for this kind of work).
 */
export type CandidateBlock = "not_installed" | "signed_out" | "refuses_root" | "off" | "reserve" | "no_model" | "offline" | "ruled_out" | WhereBlock;

/**
 * D157: why a computer can't take a task (the switch sheet greys its rows with this). no_browser:
 * it can't browse (上网 isn't on there); no_chrome: it needs the user's Chrome and that computer
 * has none; no_app: it needs a Mac app and that computer isn't a Mac; elsewhere: the folder or
 * repo is on another computer (place); no_draw (D206): the task makes a picture and this agent
 * can't (only Codex generates images); no_phone (D217): it needs Ducter's phone and 用手机 isn't on there;
 * no_web (D416): the task reads web pages and this agent can't be held to Ducter's rules there (Antigravity).
 */
export type WhereBlock = "no_browser" | "no_chrome" | "no_app" | "elsewhere" | "no_draw" | "no_phone" | "no_web";

/** One AI agent (and model) that could do a task, best first, with why in words the client builds. */
export interface Candidate {
  harness: string;
  model?: string;
  /** Doing the task now. */
  current?: boolean;
  /** fit: the shipped tier table says it suits this kind of work; fast: quick and light on the limit. */
  reason: { kind: "rule" | "fit" | "fast" | "left" | "current"; ruleId?: string; text?: string };
  /** 0..1, as the harness reported it; absent = it doesn't report one. */
  left?: number;
  resetsAt?: string;
  /** Paid per use: say so before it costs anything. */
  billing?: "plan" | "usage";
  /** Set when it can't take the task; the list still shows it, greyed, with this reason. */
  blocked?: CandidateBlock;
  /** D157: the computer it runs on (absent with one computer): its id and name. */
  device?: string;
  deviceName?: string;
  /**
   * D157: that computer is asleep or can't be reached: it would wait (ranked under every row that can
   * start now). D538: room: heavy work, and it hasn't the memory free for it now (it waits for room).
   */
  waits?: "asleep" | "unreachable" | "room";
  /** D157: what it would use there when the task browses: the user's Chrome, or Ducter's own browser
   *  (needsSignIn: the user would sign in there first). */
  uses?: "chrome" | "ducter";
  needsSignIn?: boolean;
  /** D157: picking it would give the task more access than it has now (the user's Chrome). */
  widens?: boolean;
  /** D206: it can't see pictures (看不了图片 / Can't see images, shown when the card holds some). */
  noImages?: true;
}
