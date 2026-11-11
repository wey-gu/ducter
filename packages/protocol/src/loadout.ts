// What the partner thinks with, and who does the tasks (D89, design/ai-loadout.md): the rules a
// person said, why a task is on the AI agent it is on, and who else could do it. Pure data:
// core computes it (packages/core/src/candidates.ts, rules.ts), clients word it.

/** The share of the partner's own account kept for its answers; tasks can't use it (D89: fixed in v1). */
export const PARTNER_RESERVE = 0.1;

/** A rule the person said in the conversation: work of a kind goes to one AI agent. */
export interface RuleView {
  id: string;
  /** The rule in one line, in the words it was said in ("后端的事 → Codex"). */
  text: string;
  harness: string; // a HarnessId
  model?: string;
  /** Words that mark the kind of work, in any language; a task whose title or brief has one matches. */
  match: string[];
  createdAt: string; // ISO
  /** D157: the computer this kind of work runs on ("要登录的网页都在 MacBook 上做"), by name. */
  device?: string;
  /**
   * D165: a rule about what it tells the person, not who does a task (harness "", match []).
   * mute: 这类不用告诉我 (a kind, from one sender when given). wake: this kind may come through at
   * night ("航班改了，夜里也叫我"), said by the person, never proposed.
   */
  notice?: { kind: string; sender?: string; wake?: boolean };
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
 *  - home: nothing set them apart; Ducter lives here (one hop fewer).
 */
export interface WhereWhy {
  device: string;
  kind: "always_on" | "signed_in" | "only_here" | "awake" | "changes_here" | "agent_here" | "no_signin" | "moved" | "you" | "home";
  other?: string;
  site?: string;
  thing?: "chrome" | "browser" | "app" | "agent";
  app?: string;
  agent?: string;
  ruleId?: string;
  text?: string;
  /** What it uses on that computer when that is the point: the user's Chrome, Ducter's own browser, an app. */
  uses?: "chrome" | "ducter" | "app";
}

/**
 * Why a task is on the AI agent it is on. Clients word it:
 *  - default: Ducter picked the best fit with the most limit left (no reason line);
 *  - rule:    the person's rule (ruleId, text);
 *  - limit:   the first choice was short of limit (from: who it would have been);
 *  - unavailable: the first choice (the partner's pick or a rule's) can't take it for another
 *             reason (from, blocked: signed out, off, not installed, …);
 *  - you:     the person switched it, or picked it on New task;
 *  - partner: the partner picked it in the moment (text: its words, e.g. "you asked for Codex").
 */
export interface BodyWhy {
  kind: "default" | "rule" | "limit" | "unavailable" | "you" | "partner";
  ruleId?: string;
  text?: string;
  from?: string;
  blocked?: CandidateBlock;
  /** D157: where it runs and why, when two or more computers run tasks. */
  where?: WhereWhy;
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
 * picked), offline (its device can't be reached).
 */
export type CandidateBlock = "not_installed" | "signed_out" | "off" | "reserve" | "no_model" | "offline" | WhereBlock;

/**
 * D157: why a computer can't take a task (the switch sheet greys its rows with this). no_browser:
 * it can't browse (上网 isn't on there); no_chrome: it needs the user's Chrome and that computer
 * has none; no_app: it needs a Mac app and that computer isn't a Mac; elsewhere: the folder or
 * repo is on another computer (place).
 */
export type WhereBlock = "no_browser" | "no_chrome" | "no_app" | "elsewhere";

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
  /** D157: that computer is asleep or can't be reached: it would wait (ranked under every row that can start now). */
  waits?: "asleep" | "unreachable";
  /** D157: what it would use there when the task browses: the user's Chrome, or Ducter's own browser
   *  (needsSignIn: the user would sign in there first). */
  uses?: "chrome" | "ducter";
  needsSignIn?: boolean;
  /** D157: picking it would give the task more access than it has now (the user's Chrome). */
  widens?: boolean;
}
