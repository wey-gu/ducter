// In-process module boundaries for v1-tonight (one Bun process: `bun run up`).
//   core    owns: Log (SQLite), bus, task registry + state machine, decisions, living message,
//                 WS server (/ws), MCP HTTP server (/mcp), main.ts wiring.
//   runner  owns: HarnessPort over OAR, worktrees, task sessions, event normalization.
//   partner owns: the main AI (persona prompt, projection, turn loop) on any first-wave harness (D85) via runner's HarnessPort.
import type { HarnessId } from "./harnesses.ts";
import type { CallBody, DraftRequest, DraftResult } from "./phone.ts";
import type { AccountUsage, Attention, Bodies, BodyWhy, BranchChanges, Delivery, FolderChanges, UndoConfirm, EventKind, LogEvent, OnHand, Origin, PartnerActivity, Place, Residency, PeersSettings, Settings, TaskCard, TaskNeeds, WorkKind } from "./index.ts";
import type { MediaRef } from "./media.ts";
import type { LangTag } from "./lang.ts";
import type { RuleView } from "./loadout.ts";

// ---------- core ----------

/** D435: what the partner reaches of core's hold on its own agent (core/src/brain-hold.ts). */
export interface BrainHoldPort {
  /** The hold on the agent it thinks with: who answers meanwhile (to), or nobody (waits). */
  now(): { from: HarnessId; why: "quota" | "rate_limited" | "error"; until: string; resetKnown: boolean; waits?: true; to?: HarnessId; free?: import("./free-budget.ts").FreeProvider } | undefined;
  /** A turn failed on its agent (a limit as D297 reads it, or an error): hold it. tell: say it once. */
  hit(h: { harness: string; failure: "quota" | "rate_limited" | "error"; resetsAt?: string; source?: string; said?: string; free?: import("./free-budget.ts").FreeProvider }): Promise<{ now?: ReturnType<BrainHoldPort["now"]>; tell: boolean }>;
  /**
   * D446: before a turn: a task on the home already waits for the reset of the same agent's
   * account, so the account is read and the agent held now, not after one failed turn. held: a hold
   * was made just now.
   */
  ahead?(): Promise<{ now?: ReturnType<BrainHoldPort["now"]>; tell: boolean; held: boolean }>;
  /** A turn on this agent went through: its hold, if any, is over. */
  ok(harness: string): void;
  /** A hold was set or ended, or its time came (D440: or something to think with arrived). */
  onChange(fn: () => void): () => void;
  /**
   * D440: nothing on the home can think at all (its agents were read, and none that may be the
   * partner is installed and signed in): a message waits for the first one, said once by code.
   */
  blind?(): boolean;
}

export interface AppendInput<K extends EventKind = EventKind> {
  persona?: string; // default persona if omitted
  stream: string;
  origin: Origin;
  kind: K;
  body: Bodies[K];
  supersedes?: number;
}

export interface LogStore {
  append<K extends EventKind>(e: AppendInput<K>): LogEvent<K>;
  read(opts: { stream?: string; fromSeq?: number; beforeSeq?: number; limit?: number; kinds?: EventKind[] }): LogEvent[];
  // FTS5 over CJK bigrams + exact substrings, rank-fused (core/src/search.ts); best match first.
  search(query: string, opts?: { stream?: string; limit?: number; beforeSeq?: number }): LogEvent[];
  head(): number;
  subscribe(fn: (e: LogEvent) => void): () => void;
  /**
   * D327: the one exception to append-only: replaces one event's body (and its search text) with
   * what is left after the person said to forget something Ducter read from outside the
   * conversation. Never used for the person's words or the partner's.
   */
  forgetIn?(seq: number, body: LogEvent["body"]): void;
}

// ---------- the main AI's spine (design/memory.md) ----------

/** One frozen digest: a closed segment of the channel, or an epoch rolled up from segments. */
export interface SpineRecord {
  id: string; // "S0001" / "E0001"
  kind: "segment" | "epoch";
  fromSeq: number; // channel seq range it covers, inclusive
  toSeq: number;
  createdAt: string;
  body: unknown; // the digest (partner/src/spine/digest.ts); never changed once stored
}

/** One try at writing a digest, kept for diagnostics (an audit that failed is never frozen). */
export interface SpineAttempt {
  fromSeq: number;
  toSeq: number;
  n: number;
  ok: boolean;
  writer: string;
  reasons: string[];
  at?: string;
}

/** Append-only: frozen digests are never regenerated, updated or deleted. */
export interface SpineStore {
  list(): SpineRecord[]; // by fromSeq, an epoch before the segments it covers
  freeze(r: Omit<SpineRecord, "createdAt">): SpineRecord; // throws on a duplicate id
  attempt(a: SpineAttempt): void;
  attempts(limit?: number): SpineAttempt[];
  /** Automatic recall offered to the model (model-visible means logged). */
  recalled(r: { query: string; hits: number[]; admitted: boolean; turnSeq?: number }): void;
}

export interface TaskRegistry {
  get(taskId: string): TaskCard | undefined;
  list(): TaskCard[];
  onHand(): OnHand;
  setState(taskId: string, attention: Attention, residency: Residency, reason?: string, cant?: import("./index.ts").CantStart): void; // appends task_state
}

// D312: persona: the partner calling (absent: the default), or for a task-role call the partner the task is for.
export type ToolHandler = (args: any, ctx: { role: string; taskId?: string; persona?: string }) => Promise<unknown>;

export interface McpHub {
  // Registers a tool for a role ("partner" or "task"). Core serves them at /mcp.
  // inputSchema may be a function, read on every tools/list (a property that exists only while
  // something is on, e.g. Bridge's forMessage, D205).
  register(role: "partner" | "task", name: string, description: string, inputSchema: object | (() => object), handler: ToolHandler): void;
  // Listed only while `visible` holds (checked on each tools/list); D205: Bridge's tools while it is on.
  registerWhen?(role: "partner" | "task", name: string, description: string, inputSchema: object | (() => object), handler: ToolHandler, visible: (ctx: { role: "partner" | "task"; taskId?: string }) => boolean): void;
  // MCP server config to inject into a harness session for this role.
  configFor(role: "partner" | { taskId: string }): { name: string; url: string; headers: Record<string, string> };
}

/**
 * The Nowledge Mem AI Identity a persona runs as (D141): bound once, kept in persona.json, and
 * named explicitly on every Mem call (memory_add --agent-id, a task's NMEM_AGENT_ID).
 */
export interface MemIdentity {
  agentId: string;
  /** The Space the user had chosen for Ducter (NMEM_SPACE when it was bound); absent: Mem's own default. */
  space?: string;
  /** Ducter enrolled it, so it keeps the identity's display name in step with the partner's name. */
  owned: boolean;
  /** The identity's display name in Mem, for one the user already had. */
  label?: string;
  /**
   * D229: the identity's own lane in Mem (its profile's default Space, an exact id), read from Mem
   * on each start. Recall reads it alongside where saves land, as Mem's plugin reads it for an
   * NMEM_AGENT_ID; absent: the identity has none, or Mem didn't say.
   */
  lane?: string;
}

export interface CoreApi {
  log: LogStore;
  tasks: TaskRegistry;
  mcp: McpHub;
  persona: {
    id: string;
    name: string;
    identity: string /* L1 text from Nowledge Mem or default */;
    /** The persona's Mem AI Identity (D141); absent until bound, or with Mem off or missing. */
    mem?: MemIdentity;
  };
  dataDir: string; // ~/.ducter
  /** Paired worker machines (system.md "Workers"); absent in tests and stubs. */
  workers?: WorkerLinks;
  /** The partner's settings (D71); absent in tests and stubs (then: follow the user, remember). */
  settings?: SettingsApi;
  /** What the partner thinks with when the user hasn't chosen and the default (Claude Code)
   *  isn't signed in here: the first signed-in agent of PARTNER_FALLBACK, so a Codex-only (D143)
   *  or DeepSeek-only (D177) server just works. */
  partnerFallback?(): { harness: HarnessId; model?: string } | undefined;
  /** D435: the partner's own agent held after a turn failed on it (core/src/brain-hold.ts); absent in tests and stubs (then: as before). */
  brainHold?: BrainHoldPort;
  /** D449: a free key's day (core/src/free-budget.ts): a partner turn's requests on its agent are counted. Absent in tests and stubs. */
  freeBudget?: { spend(harness: string, requests: number): void; frugal?(harness: string): boolean; low?(): boolean; view?(): import("./free-budget.ts").FreeBudget | undefined; mark?(provider: string, free: boolean): void; onChange?(fn: () => void): () => void };
  /** D437: another AI's one look before a result goes out (core/src/fresh-look.ts); absent in tests and stubs. */
  freshLook?: { take(taskId: string, body: import("./index.ts").Bodies["report"], also?: { words: string; found: string }): boolean; readonly heldWords: string; readonly heldWithDocWords?: string; waiting?(taskId: string): boolean };
  /** D439: a document a done report shows, checked page by page (core/src/doc-check.ts); absent in tests and stubs. */
  docCheck?(taskId: string, body: import("./index.ts").Bodies["report"]): Promise<{ again?: string; againFound?: string; doc?: import("./doc-bar.ts").DocCheck; media?: import("./media.ts").MediaRef[] } | undefined>;
  /** D444: the memories Ducter took back at this user message's words (别记这个), for the partner's line under them. */
  takenBackFrom?(seq: number): { seq: number; title: string }[];
  /** Who does a new task (D89, core/src/loadout.ts); absent in tests and stubs (then: the runner's default). */
  bodies?: BodyChooser;
  /** D395: where a repository task works, resolved by code (core/src/repo-where.ts); absent in tests and stubs. */
  places?: PlacesPort;
  /** D476: the home itself as the partner's [devices] line names it: its name, its other names, its agents as last probed. */
  homeDevice?(): { name: string; aliases?: string[]; harnesses?: { id: string; installed?: boolean; loggedIn: boolean; version?: string }[] } | undefined;
  /**
   * D480: facts about the person's own agents' mail, for the partner: Mem lists an agent's mailbox
   * closed (box): it reaches the partner, the answers can't go back. Only what isn't whole.
   */
  agentMail?(): { harness: string; box: "closed" }[];
  /** D477: the code Ducter knows is on each computer (device "local" for the home): the person's projects and the places tasks worked in, with origins when known. */
  codeOn?(): { device: string; name: string; remote?: string }[];
  /** D486: the person's partners (with what each looks after) and which one this is; for the [partners] line. */
  partnersNow?(): { me: string; list: import("./partners.ts").PartnerInfo[] };
  /** D478: each agent's usage limit per computer (device "local" for the home): used up (until when, the tasks resting on it) or room left, from the runner's hits, the limit waits and the home's account reads. */
  agentLimits?(): { device: string; harness: string; state: "used_up" | "room"; until?: string; waiting?: string[] }[];
  /** D483: what each task declared it owns outside and Ducter watches for it (PRs as owner/repo#123). */
  /** D483; D496: `said` is where each PR stands at the last look, as short facts. */
  owned?(): { taskId: string; refs: string[]; said?: Record<string, string> }[];
  /** D379: memories the partner's recall returned, read by code for who-does-which-work the person said. */
  said?: {
    fromMemory(hits: { id?: string; title: string; content: string; date?: string }[]): void;
    /** D401: the rules Ducter kept by itself from this user message (seq). */
    keptFrom?(seq: number): RuleView[];
  };
  /** D413: what the person said may go without asking. D495: recorded by the partner's without_asking tool. */
  standing?: {
    list(): import("./standing.ts").StandingView[];
    hear(
      key: string,
      s:
        | { kind: "grant"; action: import("./standing.ts").StandingAction; orgs?: string[]; quote: string; taskId?: string; taskTitle?: string }
        | { kind: "revoke"; action: import("./standing.ts").StandingAction; quote: string; taskId?: string },
      at: string,
      seq?: number,
    ): { kept?: import("./standing.ts").StandingView; revoked?: import("./standing.ts").StandingView[] } | undefined;
    /** D499: the permission covering this step of this task, if any. */
    covers?(action: import("./standing.ts").StandingAction, at: { taskId: string; owner?: string }): import("./standing.ts").StandingView | undefined;
  };
  /**
   * D499: a task's open ask answered Go for the person under a kept permission (code checks the ask
   * is a task's plain question, not the floor, and that a kept permission covers the step there).
   */
  answerFor?(decisionId: string, action: import("./standing.ts").StandingAction): { ok: true; standing: import("./standing.ts").StandingView; question: string } | { ok: false; error: string };
  /** D499: the kept permissions covering a task's own steps (for its brief and the partner's report line). */
  goesFor?(taskId: string): import("./standing.ts").StandingView[];
  /** D499: the task an open ask is from, its title and its repo's owner (for keeping a go for one task). */
  askOf?(decisionId: string): { taskId: string; title: string; owner?: string; open: boolean } | undefined;
  /** The user's connections (D96, core/src/connections.ts); absent in tests and stubs. */
  connections?: ConnectionsApi;
  /** What the partner is doing while the user waits (D104); absent in tests and stubs. */
  activity?: { set(a: PartnerActivity | null): void };
  /** Frozen digests of the channel (design/memory.md), in the Log's own database; absent in stubs. */
  spine?: SpineStore;
  /** D151: Ducter's own browser (a server's 上网); absent in tests and stubs. */
  browser?: DucterBrowserPort;
  /** D168: memory for tasks, from the partner's own Mem client; absent in tests, stubs and with no partner. */
  taskMemory?: TaskMemoryPort;
  /** D448: Bridge for a task on an agent with no Bridge of its own (agent_message), carried by the
   *  partner's own client: on while Bridge is on and the task is one it relays for. Absent: no partner, tests. */
  taskBridge?: { on(taskId: string): boolean };
  /** D193: phone calls through the calling connection (core/src/phone.ts); absent in tests and stubs. */
  phone?: PhonePort;
  /** D168: the user's Nowledge Mem plugin for this agent is on that device in any form but absent (by id or name; undefined = the home), as Mem's own check last said (research/48 M1). */
  memPluginIn?(device: string | undefined, harness: string): boolean;
  /**
   * D393: Mem carried to tasks from the home's one connection (core/src/mem-relay.ts): the relay
   * env a task elsewhere gets (NMEM_API_URL to the home, a per-task key that dies with the task),
   * and the home's copy of Mem's plugin for an agent, by URL, for a session that lacks its own.
   * Absent: no Mem connected on the home, memory off, or a test without it.
   */
  memCarry?: MemCarry;
  /** D205: the persona's own Bridge connection, made from Settings › 伙伴 (core/src/bridge-link.ts); absent in tests and stubs. */
  bridgeLink?: BridgeLinkApi;
  /** D494: 帮手 / Helpers, the person's named addresses in Bridge that this home owns (core/src/helpers.ts). */
  helpers?: HelpersApi;
  /** D511: 照看 / Looking after, every Keep on the home (core/src/keeps.ts); absent in tests and stubs. */
  keeps?: import("./keeps.ts").KeepsApi;
  /** D206: pictures and files on the home (core/src/media.ts); absent in tests and stubs. */
  media?: MediaApi;
  /** D288: account limits a running session said, kept with the agent's last read (core/src/account-usage.ts); absent in tests and stubs. */
  limits?: { seen(harness: string, limits: NonNullable<HarnessEvent["limits"]>): void };
  /**
   * D312: with more than one partner, what is this partner's own: an event (its conversation, its
   * tasks, its waits, its routines) and a task. Absent: everything (one partner, tests, stubs).
   */
  mine?: { event(e: LogEvent): boolean; task(c: TaskCard): boolean };
  /** D312: the partner a task is for, by its persona id: its name (the task's brief) and Mem identity (NMEM_AGENT_ID). */
  personaFor?(id: string | undefined): { name: string; mem?: MemIdentity };
  /** D368: Nowledge Mem's Working Memory, read-only (core/src/working-memory.ts); absent in tests and stubs, or with memory off. */
  workingMemory?: WorkingMemoryPort;
  /**
   * D458: the partner hands core its own read of Mem (memory_search's path: the same switch and
   * identity) for the morning's offers; read-only. Never set: offers never read Mem.
   */
  setMemLook?(m: MemLookPort | undefined): void;
  /** D380: a quick web look for one live fact (core/src/web-look.ts); absent in tests and stubs (then a browsing task does it). */
  webLook?: WebLookPort;
  /**
   * D388: the pages the last `noticed` call's answers rest on (each find's web source), so a reply to
   * "how did you know?" carries them even when the model leaves them out. Cleared at each turn. A
   * holder object: the Core the partner gets is a copy of the api, so a field set later wouldn't reach it.
   */
  noticedSources?: { links?: { label: string; url: string }[]; whys?: { text: string; why: string }[] };
  /**
   * D381: 置顶 / Pinned, the default conversation's (core/src/pins.ts). The partner sees them in a
   * line each turn and claims a block's "pin" before writing its message; absent for a second
   * partner (preview) and in stubs.
   */
  pins?: {
    list(): import("./pins.ts").PinView[];
    claim(asks: readonly import("./rich.ts").RichPinAsk[]): Map<number, string>;
    put(seq: number, ui: readonly import("./rich.ts").RichUi[], asks: readonly import("./rich.ts").RichPinAsk[]): void;
  };
  /**
   * D405: 小应用 / Apps (core/src/apps.ts). The partner makes and changes them with its app tool and
   * sees them in a line each turn; absent for a second partner (preview) and in stubs.
   */
  apps?: {
    list(persona: string): import("./apps.ts").AppMeta[];
    get(id: string): import("./apps.ts").AppMeta | undefined;
    html(id: string): string | undefined;
    data(id: string): Record<string, unknown>;
    make(persona: string, a: { name: string; html: string; ask?: string; note?: string; task?: import("./apps.ts").AppTask; data?: Record<string, unknown>; summary?: string; icon?: import("./apps.ts").AppIcon }): { ok: true; app: import("./apps.ts").AppMeta; lifted?: string[] } | { ok: false; error: string };
    /** D410: deleted on the person's word, kept a while to bring back (the card's 撤销 / Undo). */
    remove?(id: string): boolean;
    /** D410: the app's one line for its shelf tile. */
    summarize?(id: string, text: string): boolean;
    change(id: string, c: { html?: string; edits?: { find: string; replace: string }[]; name?: string; note?: string }): { ok: true; app: import("./apps.ts").AppMeta; lifted?: string[] } | { ok: false; error: string };
    put(id: string, key: string, value: unknown, by: "app" | "partner"): { ok: true } | { ok: false; error: string };
    answered(id: string, ref?: string): void;
    /** D407: the routine task that keeps the app current. */
    give?(id: string, task: import("./apps.ts").AppTask | undefined): boolean;
    /** D422: a new mark for an app the partner changes. */
    set?(id: string, c: { icon?: import("./apps.ts").AppIcon }): { ok: boolean };
  };
  /** D407: a routine fills an app: the review board made from its template for a review task. */
  boards?: {
    makeReviewBoard(taskId: string): { ok: true; app: import("./apps.ts").AppMeta } | { ok: false; error: string };
    isReview(taskId: string): boolean;
    /** The offer, now (Ducter's own card; the eval seeds it this way). */
    offer(taskId: string, kind: "reviews" | "reports"): string | undefined;
  };
}

/** D380: what a quick web look came back with: typed and clipped by Ducter, never page text. */
export type WebLookResult = { state: "found" | "unsettled" } & Pick<import("./index.ts").WebLook, "answer" | "sources" | "confidence" | "why" | "harness" | "model" | "ms">;
export interface WebLookPort {
  /** A look can run now: the agent the partner thinks with can hold a session to its web tools alone. */
  can(): boolean;
  /** One look, settled within its time budget; never throws (a failure is unsettled). */
  look(q: { question: string; lang: string }): Promise<WebLookResult>;
}

/**
 * D368: the person's Working Memory in Nowledge Mem (their daily focus surface), as the partner may
 * see it: their own notes kept by another app, so data, never instructions; one line each, clipped.
 */
export interface WorkingMemoryView {
  /** The day Mem wrote it for (YYYY-MM-DD). */
  date: string;
  /** Changes when what is here changes: the partner is given it again then, and once per session. */
  key: string;
  focus: { name: string; about?: string }[];
  briefing?: string;
  /** What waits for the person's decision, in Mem's words (at most 3); awaitingMore counts the rest. */
  awaiting: string[];
  awaitingMore?: number;
  flags: string[];
}

/** D393: what the home carries to a task so Mem works there with nothing set up on that computer. */
export interface MemCarry {
  /** The env that points a task's nmem (and Mem's plugin) at the home's relay: NMEM_API_URL, NMEM_API_KEY (a task token, never Mem's key). undefined: nothing to carry. */
  envFor(taskId: string, base: string): Record<string, string> | undefined;
  /** URLs of Mem's plugin for this agent, as the home has it, for `--plugin-url` (Claude Code); [] when the home has none for it. */
  kitFor(taskId: string, harness: string, base: string): string[];
  /** Whether that computer has an nmem the plugin's hooks can run (a worker's Mem look; the home: true). */
  nmemIn(device: string | undefined): boolean;
}

/** D458: one memory as the offers read it (the partner's MemoryHit). Someone else's words: data. */
export interface MemLookHit {
  id?: string;
  title: string;
  content: string;
  /** YYYY-MM-DD it was recorded. */
  date?: string;
  /** preference, decision, fact, … */
  kind?: string;
  /** Who saved it: "ducter", an AI tool ("codex"), the person's own. */
  source?: string;
}
/** D458: one past conversation with another AI tool that Mem keeps (the partner's ThreadHit). */
export interface MemLookThread {
  id?: string;
  title: string;
  source?: string;
  date?: string;
  lines: { who: "user" | "assistant"; text: string }[];
}
/** D458: Mem, read-only, for the offers; undefined when memory is off, not connected or slow. */
export interface MemLookPort {
  /** D461: `unitType` asks Mem for one kind of memory (`--unit-type`). */
  search(query: string, n: number, opts?: { unitType?: "decision" | "plan" | "preference" | "fact" }): Promise<MemLookHit[] | undefined>;
  /** D461: `scan`: read that many conversations (Mem ranks by match, not date) and return them all. */
  threads?(query: string, n: number, opts?: { scan?: number }): Promise<MemLookThread[] | undefined>;
}

export interface WorkingMemoryPort {
  /** What is known now (never older than a few days); a stale read is refreshed in the background. */
  get(): WorkingMemoryView | undefined;
  /** Read now (one read in flight at a time). */
  refresh(): Promise<WorkingMemoryView | undefined>;
  /** Fresh if a read is due, waiting at most ms for it; else what is known. */
  ready(ms: number): Promise<WorkingMemoryView | undefined>;
}

/** D206: the home's media store as the runner and the partner use it. */
export interface MediaApi {
  get(id: string): import("./media.ts").MediaRef | undefined;
  /** The file the bytes are in, on the home. */
  path(id: string): string | undefined;
  /** D259: the same bytes under the file's own name, for an agent to read (falls back to path). */
  named?(id: string): string | undefined;
  /** A file on the home (a task's report): copied in. files: besides pictures. Throws when it isn't one Ducter shows. */
  putFile(path: string, o?: { name?: string; from?: { taskId: string }; files?: boolean }): import("./media.ts").MediaRef;
  put(bytes: Uint8Array, o?: { name?: string; from?: { taskId: string }; files?: boolean; sent?: boolean }): import("./media.ts").MediaRef;
  /** D242: v with every media ref in it carrying a fresh, expiring key (what a client gets). */
  fresh?<T>(v: T): T;
  /** D242: fresh keys for the ids the home holds. */
  keysFor?(ids: unknown): Record<string, string>;
}

/**
 * D205: the Agent Context the persona's Bridge connection saved (`nmem bridge connections connect
 * --context <name>`), once the user connected it in Settings › 伙伴 and Mem confirmed it; undefined
 * when not connected. onChange fires on connect and disconnect, so the partner turns Bridge on or
 * off without a restart.
 */
export interface BridgeLinkApi {
  context(): string | undefined;
  onChange(fn: () => void): () => void;
  /**
   * D334: where the home reads the identity's mailbox: the connection's own context first, then one
   * local context per other Space the identity is reachable in. wide: Mem reads every Space with one
   * inbox (nowledge-co/mem#10402), so the first context alone reads them all. Undefined while not connected.
   */
  places?(): BridgeWhere | undefined;
  /**
   * D444: the pane was looked at and Mem's grouped contact list is older than 30 minutes (or never
   * read): true once, then false until it is set again. The partner's Bridge client reads it then.
   */
  takeMailboxWant?(): boolean;
  /** D444: the person's own agents Mem lists, by tool, and whether their mailboxes take messages. */
  setMailboxes?(list: { harness: string; open: boolean }[]): void;
  /** D480: the last list setMailboxes was given (undefined: never read). */
  mailboxesNow?(): { harness: string; open: boolean }[] | undefined;
}

/** D494: the home's helpers, as the partner uses them (core/src/helpers.ts has the whole of it). */
export interface HelpersApi {
  list(): import("./helpers.ts").Helper[];
  get(id: string): import("./helpers.ts").Helper | undefined;
  byName(name: string): import("./helpers.ts").Helper | undefined;
  make(a: { name: string; about: string; brief: string; persona?: string }): { ok: true; helper: import("./helpers.ts").Helper } | { ok: false; error: "empty" | "taken" | "full" };
  set(id: string, a: { about?: string; brief?: string }): import("./helpers.ts").Helper | undefined;
  stop(id: string): Promise<import("./helpers.ts").Helper | undefined>;
  resume(id: string): import("./helpers.ts").Helper | undefined;
  /** On, with a confirmed address: whose mail the home reads now. */
  listening(): { id: string; name: string; context: string }[];
  onChange(fn: () => void): () => void;
}

/** D334: one Space the home reads the partner's mailbox in, through its own local Agent Context. */
export interface BridgePlace {
  context: string;
  spaceId?: string;
  spaceLabel?: string;
  /** Mem's kind for the Space ("personal" = Only me, "team", ...), when known. */
  kind?: string;
}
export interface BridgeWhere {
  places: BridgePlace[];
  wide: boolean;
}

/** One memory as a task sees it: its id (to look closer), title, a clipped content, when. */
export interface TaskMemoryNote {
  id?: string;
  title: string;
  content: string;
  date?: string;
  /** D304: another AI tool saved it (its name, "Claude Code"); absent: the person or the partner. */
  from?: string;
}

/**
 * D168 (design/memory.md "Mem and tasks"): memory inside Ducter's tasks comes from Ducter. The
 * partner owns the Mem client and the switch; the runner asks this for the few memories that
 * matter to a task's brief, once, before its first turn.
 */
export interface TaskMemoryPort {
  /** Memory is on (Settings › 记得什么 and the run): tasks get it, and the user's own Mem plugin is off inside them. */
  on(): boolean;
  /** The few memories that matter here; undefined: off, Mem down or slow, or nothing fits. Never throws. */
  recall(work: { taskId: string; persona: string; title: string; brief: string }): Promise<TaskMemoryNote[] | undefined>;
}

/**
 * Who does a new task and why. undefined: nothing to choose by (no device info), the runner keeps
 * its own default; { none }: no AI agent can take it, the open fails with that reason.
 */
export interface BodyChooser {
  // by "you": the user picked harness/model themselves (D128 New task): the pin's why says so.
  // D157: needs say what the task needs of its computer; the pick says which computer (device:
  // its name, "local" for the home), whether it waits there, and what it uses.
  // D202: effort, the user's pick, is checked against the chosen model's levels on its computer.
  choose(work: { title: string; brief?: string; place?: Place; harness?: string; model?: string; effort?: string; by?: "you"; needs?: TaskNeeds; workKind?: WorkKind; /** D476 */ bound?: import("./index.ts").TaskBound }): Promise<BodyChoice | { none: string } | undefined>;
}

/** D157: who does a new task, on which computer, and why. */
export interface BodyChoice {
  harness: string;
  model?: string;
  why: BodyWhy;
  device?: string;
  deviceId?: string;
  home?: boolean;
  waits?: "asleep" | "unreachable";
  uses?: "chrome" | "ducter";
  needsSignIn?: boolean;
  now?: { device: string; deviceId: string; name: string; harness: string; model?: string; uses?: "chrome" | "ducter"; needsSignIn?: boolean };
  /** D202: the effort asked for, when the chosen model offers it. */
  effort?: string;
  /** D202: the effort asked for was dropped (the model doesn't list it, or its list couldn't be read): why, in words. */
  effortDropped?: string;
  /** D372: the kind of work the pick was ranked for (the partner's word, else read from its needs and place). */
  workKind?: WorkKind;
}

/** Who is calling into a connection: the partner, or one task (which must have been granted it). */
// "watch" (D165): Ducter's own looks on a schedule, model-free. Reads only (a write is refused
// like a task's), logged on the "watch" stream so the conversation and the partner never see them.
export type ConnectionCaller = { role: "partner" } | { role: "task"; taskId: string } | { role: "watch" };

export interface ConnectionInfo {
  id: string;
  name: string;
  source: "oomol" | "self" | "mcp" | "oo";
  /** Source oo: the services in it, and each one's accounts (pass a name as `account`; the default is used without one). */
  services?: { service: string; accounts: { name: string; label: string; default: boolean }[] }[];
  /** For a task: whether it may read this one. */
  granted?: boolean;
}

export type ConnectionOutcome =
  | { ok: true; op: "read" | "write"; result: unknown }
  | { ok: false; error: string; op?: "read" | "write" };

/** The broker as the partner and tasks see it (design/connectors.md §4). */
export interface ConnectionsApi {
  list(who: ConnectionCaller): ConnectionInfo[];
  /** Find actions (OpenConnector) or tools (other MCP servers), each marked read or write. */
  search(who: ConnectionCaller, query: string, opts?: { connection?: string; service?: string }): Promise<ConnectionOutcome>;
  /** One action's guide: its input, and whether it reads or writes. */
  guide(who: ConnectionCaller, connection: string, action: string): Promise<ConnectionOutcome>;
  /** read or write, from the server's own metadata; unknown counts as write. */
  classify(connection: string, action: string): Promise<"read" | "write">;
  /** Runs a read. A write is refused here: it needs stage() and the user's Go. */
  read(who: ConnectionCaller, connection: string, action: string, input: unknown, account?: string): Promise<ConnectionOutcome>;
  /** Records a write that waits for Go on decisionId (the partner made the card). */
  stage(connection: string, action: string, input: unknown, decisionId: string, account?: string): { ok: true; callId: string } | { ok: false; error: string };
  /** Runs the write staged on decisionId, once, only if the user said Go. */
  runApproved(decisionId: string): Promise<ConnectionOutcome>;
  /** Lets a task read one connection (the partner decides; recorded). */
  grant(taskId: string, connection: string): { ok: true } | { ok: false; error: string };
}

/** What the partner reads of the settings, and how it lets the user forget a memory. */
export interface SettingsApi {
  get(): Settings;
  /** The partner registers how to forget a memory in Mem; true when Mem forgot it. */
  setForgetter(fn: (memoryId: string) => Promise<boolean>): void;
  /** D304: how to correct a memory's words in Mem (这周记下的); true when Mem took it. */
  setCorrector?(fn: (memoryId: string, title: string) => Promise<boolean>): void;
  /**
   * D329: how to take a Noted line's save back (撤销 / Undo): archived in Mem (or dropped from the
   * outbox while it waits), and a memory it replaced written back; true when it was. waiting: the
   * outbox keys still waiting for Mem; changed: the outbox moved (a fresh settings frame follows).
   */
  setMemHooks?(h: { undo(noted: { memoryId?: string; waiting?: string; replaced?: { id?: string; title: string } }): Promise<boolean>; waiting(): Set<string> }): void;
  memChanged?(): void;
  /** The partner says whether Mem answers (connected) or not (missing), as it finds out. */
  setMemState(state: "connected" | "missing"): void;
  /** D170: the partner keeps the learned rules (trusted) and the muted senders here. */
  setPeers?(peers: Partial<PeersSettings>): void;
  /** D369: Mem said the partner's mailbox needs sorting out on Mem's side (its code), or that is over (undefined). */
  setBridgeTrouble?(t: { code: string } | undefined): void;
}

// ---------- workers (main ↔ worker over the worker's outbound /worker socket) ----------

/** One frame the worker sends up about a remote harness session. */
export type WorkerSessionFrame =
  | { t: "ev"; key: string; ev: HarnessEvent; busy: boolean; sessionId?: string }
  | { t: "end"; key: string; error?: string; offline?: boolean }
  // D293: the worker's socket dropped and the worker keeps the session for a grace (away), or it
  // came back within it and still has the session (back). Made by the home; never on the wire.
  | { t: "away"; key: string }
  | { t: "back"; key: string }
  // D157: Ducter's own browser on a worker. One CDP message (an event) from the browser there,
  // or the browser's connection closed (closed: true); the main drives it with cdpSend.
  | { t: "cdp"; key: string; msg?: { method: string; params?: unknown; sessionId?: string }; closed?: boolean };

export interface WorkerInfo {
  id: string; // device id
  name: string;
  online: boolean;
  os?: string;
  arch?: string;
  harnesses?: { id: string; installed: boolean; loggedIn: boolean }[];
  /** D157: it said it was going to sleep before its socket went (online false). */
  asleep?: boolean;
  /** D157: how it browses for tasks (its 上网), when it is on. */
  web?: "chrome" | "ducter";
  /** D157: it doesn't sleep. */
  alwaysOn?: boolean;}

/** The main's handle on one worker. Stable across reconnects. */
export interface WorkerLink {
  readonly id: string;
  readonly name: string;
  online(): boolean;
  /** One request; rejects with a WorkerOfflineError when the worker is (or goes) away. */
  call<T = unknown>(op: string, args: unknown, timeoutMs?: number): Promise<T>;
  /** Frames for one remote session; an `end` with offline:true arrives when the socket drops. */
  onSession(key: string, fn: (f: WorkerSessionFrame) => void): () => void;
  /** Runs fn each time the worker (re)connects and says hello. */
  onOnline(fn: () => void): () => void;
}

/**
 * D151: Ducter's own browser, owned by the main process: Chrome for Testing headless, one
 * profile per persona, driven by Ducter's own browser tools on its MCP (core/src/browser).
 */
export interface DucterBrowserPort {
  /** Installed and able to start here, or why not (words for the partner and the task). */
  status(): Promise<{ ok: true; version: string } | { ok: false; why: string }>;
  /** Turns the task's browser tools on (listed on Ducter's MCP) for this profile. Downloads land in `downloads`. */
  attach(taskId: string, a: { profile: string; evidenceDir: string; downloads: string }): void;
  /** The task is done with the browser: quits it cleanly (sign-ins saved) when nobody else uses it. */
  release(taskId: string): Promise<boolean>;
  /** D191: this task fills from Autofill (its brief names a saved handle): Ducter's own browser
   *  first, wherever it runs, since only there is a fill by reference possible. */
  wants?(taskId: string, brief?: string, needs?: import("./loadout.ts").TaskNeeds): boolean;
}

export interface WorkerLinks {
  /** By device id or name; undefined when no such worker was ever paired. */
  link(device: string): WorkerLink | undefined;
  list(): WorkerInfo[];
}

// ---------- runner ----------

/** A per-task MCP sidecar the harness starts over stdio (e.g. cua-driver for a browser place). */
export interface StdioMcpConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface SessionSpec {
  harness: HarnessId;
  model?: string;
  // D202: the reasoning effort (one of the model's own levels, checked before it gets here); a
  // resume passes it again (Claude Code keeps no effort per session).
  effort?: string;
  cwd: string;
  systemPrompt?: string; // replaces the harness default where supported
  appendSystemPrompt?: string;
  mcp: (ReturnType<McpHub["configFor"]> | StdioMcpConfig)[];
  permissionMode: "bypass"; // D16: no per-call approvals
  // Leave out the user's own harness config (global CLAUDE.md, user settings, plugins and their
  // hooks, user MCP servers). The partner always isolates; tasks keep it by default (system.md).
  isolateUserConfig?: boolean;
  env?: Record<string, string>; // extra env for the harness process (never logged)
  resumeSessionId?: string;
  // Per-task narrowing (e.g. a browser place): extra denied tools, and for claude-code only,
  // extra launch flags and whether to leave out the user's own Claude config.
  disallowedTools?: string[];
  launchArgs?: string[];
  // claude-code: leave out the user's own Claude config. codex: Ducter's clean setup, keeping
  // Codex's own browser and Computer Use plugins (a browser place on Codex's own tools, D130).
  // deepseek-harness: a home of Ducter's for the task, DSH's own tools kept (a browser place, D241).
  userConfiguration?: "include" | "exclude";
  // D135: the window the session runs on (standard-window models, never a 1M variant when it
  // fits) and where the harness's own compactor may fire. The partner keeps its compactor above
  // the re-cut (research/11 §7.3.7); a task compacts at its compaction point. Each harness maps
  // them in runner/oar.ts from protocol/harness-facts.ts.
  contextWindow?: number;
  harnessCompactAt?: number;
  // Tasks (D130): under the clean setup, Codex keeps its own browser and Computer Use plugins.
  // The partner and the judge leave it unset (their clean setup turns them off).
  keepNativeTools?: boolean;
  /** D168: the user's plugins to turn off by id in this session only (their Mem plugin, when memory is off in Ducter). */
  disablePlugins?: string[];
  /** D393: plugins this session loads for itself only, by URL (Claude Code `--plugin-url`): Mem's plugin the home carries where the computer has none. */
  pluginUrls?: string[];
  /**
   * D417: Mem's two lifecycle steps, run by Ducter around a session whose agent can't load Mem's
   * plugin for one session (harness-facts memSteps: Antigravity): the Context Bundle read before
   * the first turn, the thread saved after each turn ends, both by Mem's own `nmem` on the
   * computer the agent runs on, in the session's env (runner/src/mem-steps.ts).
   */
  memSteps?: boolean;
  /** D175 (3): a one-shot that needs no tools at all (the judge, the digest writer); the adapter maps it per harness (harness-facts noTools). */
  noTools?: boolean;
  // Tasks only (D135): what the harness keeps when it compacts (Claude Code's PreCompact hook
  // prints it as compact instructions). Absent: the partner's setup (no hook).
  preCompactNote?: string;
  // The partner only (principle 6: the in-turn executor has no environment and only reads): no
  // native tool that writes or runs anything; Ducter's MCP tools stay. Each harness maps it in
  // runner/oar.ts (Claude Code and pi deny the tools, Codex runs its read-only sandbox).
  readOnly?: boolean;
  // The partner only (D378): none of the harness's own web tools (search, fetch). What a site or
  // the web says is read by a task, and only its report reaches the partner. Each harness maps it
  // by its own switch (harness-facts noWeb, runner/oar.ts).
  noWeb?: boolean;
  // D380, a quick web look only: the harness's own web tools and nothing else (no files, shell, MCP
  // or memory), mapped per harness from harness-facts webLook; never set where it isn't supported.
  webOnly?: boolean;
  // D142, a folder place: writes stay inside cwd where the harness can enforce it (Codex: its
  // workspace-write sandbox, network on). Claude Code has no such switch under bypass; its brief
  // asks it, and the folder's copy makes what it changed there undoable.
  confineWrites?: boolean;
}

export interface HarnessEvent {
  role: "assistant" | "user" | "tool" | "system";
  text?: string;
  tool?: { name: string; input?: unknown; output?: string; ok?: boolean };
  thinking?: string[]; // the headings of a stretch of thinking (D127)
  // Totals are the session's running bill. contextTokens is what the context held at the turn's
  // last model call, as the harness reported it (input + cache read + cache write), when it did.
  // D288: contextWindow, the window the harness read it against; turn, this turn alone (on a
  // turn end: the totals' difference since the previous one, in this session).
  usage?: { inputTokens?: number; cacheRead?: number; cacheWrite?: number; outputTokens?: number; contextTokens?: number; contextWindow?: number; turn?: { input: number; output: number; cached?: number } };
  // D288: the account's usage limits as a running session said them (Claude Code
  // rate_limit_event, Codex account/rateLimits/updated): the windows it named.
  limits?: Pick<AccountUsage, "windows" | "limited" | "plan">;
  turnEnd?: boolean;
  raw?: unknown;
}

/** D206: one picture handed to an agent with its input: a file on the home. */
export interface SendImage {
  path: string;
  mediaType: string;
}

/**
 * D259: one file (not a picture) the user sent, handed to an agent: the text names `path`; an agent
 * on the home reads it there, and a worker's session gets the bytes, writes them on its side and
 * says its own path in the text instead.
 */
export interface SendFile {
  path: string;
  name: string;
}

export interface HarnessSession {
  id: string; // native session id, resumable
  readonly canSteer: boolean; // harness accepts input mid-turn
  busy(): boolean; // a turn is in progress
  // D206: images ride with the text as the runtime's own image input (OAR InputOptions.images):
  // files on the home; a worker's session gets their bytes and writes them on its side. D259:
  // files are named in the text; `files` only lets a worker's session bring them across. D325:
  // `inputId` (a UUID) is OAR's input id; the agent's echo of the words names it where it keeps one.
  send(text: string, mode?: "turn" | "steer" | "queue", images?: SendImage[], files?: SendFile[], inputId?: string): Promise<void>;
  interrupt(): Promise<void>;
  close(): Promise<void>;
  events(): AsyncIterable<HarnessEvent>;
  /** D282: the agent's own manual compaction, where the runtime has one (Codex through OAR). */
  compact?(): Promise<void>;
  /** D518: stop one background job by its id (OAR's stopTask), where the runtime has it; rejects with its reason. Absent: nothing here can stop one. */
  stopBackground?(id: string): Promise<void>;
  /** D293: a session on a worker: its worker dropped and holds it (away), or came back with it (back). */
  onLink?(fn: (state: "away" | "back") => void): void;
}

export interface HarnessPort {
  start(spec: SessionSpec): Promise<HarnessSession>;
  available(): Promise<{ harness: string; installed: boolean; loggedIn: boolean; models?: string[] }[]>;
  /** D202: the models this account offers here now (the agent's own list, token-free), or
   *  undefined when it can't say (not installed, signed out, no listing). Never throws. */
  models?(harness: string): Promise<ListedModel[] | undefined>;
  /** D288: the account's usage limits as the agent reports them (OAR accountUsage, no model
   *  call), or why not. Never throws. */
  accountUsage?(harness: string): Promise<{ usage?: AccountUsage; why?: "unsupported" | "signed_out" | "unavailable" }>;
  /** D416: the agent's own sign-out (OAR runtime logout: Antigravity's ACP logout), confirmed by its own status. Never throws. */
  logout?(harness: string): Promise<{ ok: boolean; detail?: string }>;
}

/** D202: one model as an AI agent lists it (OAR listModels), the disabled ones left out. */
export interface ListedModel {
  id: string;
  label: string;
  efforts?: string[];
  defaultEffort?: string;
  /** What it runs when no model is named, where the agent says so. */
  default?: true;
  /** D352: its context window: the registry's (harness-facts) when Ducter knows the model, else what the agent's own catalog says. */
  window?: number;
  /** D352: the agent lists it but Ducter's registry doesn't know it yet (a model newer than this Ducter): its facts are the agent's own. */
  fresh?: true;
}

/** D299: what carrying on an outside session hands the runner. */
export interface AdoptSession {
  agent: string;
  sessionId: string;
  startedAt: string;
  turns: { role: "user" | "assistant"; text: string; at?: string }[];
  /** D376: what the person asks of it now (carried on from the conversation), sent with its first turn. */
  ask?: string;
}

export interface Runner {
  harness: HarnessPort;
  // language: the language the user reads the task's report in (from the conversation or their setting).
  // origin "you" (D128): the user opened it themselves; logged on task_open, and a harness given is their pick.
  // needs (D157): what the task needs of its computer; Ducter picks the computer (a place.device
  // the user named stays a pin).
  // media (D206): the pictures the brief carries; the first turn hands them to the agent.
  // adopt (D299): a session the person ran in their own agent outside Ducter, carried on as this
  // task in its own folder: its conversation (the person's words and the agent's) goes into the
  // task's history; the same agent resumes it by id, another agent starts from what it said.
  openTask(input: { persona: string; title: string; brief: string; place?: Place; project?: string; harness?: string; model?: string; effort?: string; language?: LangTag; origin?: "you"; needs?: TaskNeeds; workKind?: WorkKind; media?: MediaRef[]; from?: string; fromStep?: number; fromCommit?: string; adopt?: AdoptSession; /** D476 */ bound?: import("./index.ts").TaskBound; /** D479 */ replaces?: string }): Promise<TaskCard>;
  // Optional (D120, ack and go): open a task while its brief is still being written. The card,
  // the place and the session start now; the brief becomes the session's first turn when it
  // settles. If it rejects, the task is dropped before it did anything.
  // media (D206): settles with the brief (the call's last part), the pictures the brief carries.
  openTaskEarly?(input: { persona: string; title: string; place?: Place; project?: string; harness?: string; model?: string; language?: LangTag; needs?: TaskNeeds; workKind?: WorkKind }, brief: Promise<string>, media?: Promise<MediaRef[]>): Promise<TaskCard>;
  // Logs the text as task_event {role:"user", from, clientId} before delivering it.
  // media (D206): pictures that go with the text (an agent that can't see them gets a line saying so).
  send(taskId: string, text: string, mode?: "steer" | "queue", from?: "user" | "partner" | "ducter", clientId?: string, media?: MediaRef[]): Promise<{ delivered: Delivery }>;
  // D325: the person's held words (TaskCard.held): change one, take it back, or say it now.
  // Throws when that id is no longer held (it already went).
  held?(taskId: string, id: string, op: "edit" | "drop" | "now", text?: string): Promise<{ delivered?: Delivery }>;
  interrupt(taskId: string): Promise<void>;
  // Optional (D518): stop one of the task's background jobs (TaskCard.background) through its agent's own stop.
  stopBackground?(taskId: string, jobId: string): Promise<{ ok: boolean; message?: string }>;
  // Optional: resume (or start) a finished/dropped task's session and tell it to carry on.
  reopen?(taskId: string): Promise<{ delivered: Delivery }>;
  /** D395: a task that couldn't start starts in this place instead (its brief and agent stay). */
  /** D415: clearLock: 清掉旧的再试, the lock git left there is cleared first (when no git is running). */
  restartAt?(taskId: string, place: Place, o?: { clearLock?: boolean; then?: { text: string; from: "user" | "partner"; clientId?: string } }): Promise<{ ok: boolean; message?: string }>;
  // Optional: Undo a drop; merge the task branch into its base in the user's checkout; push +
  // open a draft PR (an outside effect). Each resolves with a user-facing message.
  undrop?(taskId: string): Promise<{ ok: boolean; message: string; ref?: string }>;
  merge?(taskId: string): Promise<{ ok: boolean; message: string; ref?: string }>;
  openPr?(taskId: string): Promise<{ ok: boolean; message: string; ref?: string }>;
  // Optional (D89): move a task to another AI agent. A running task is handed off: its session
  // closes and the new one starts from the brief, the saved progress and the task's own history
  // condensed (D282), or resumes that agent's own earlier session on the task. The same agent
  // with another model or effort (D282) keeps its native session: it reopens with them for the
  // next turn. ok:false with a user-facing message when it can't.
  switchBody?(taskId: string, harness: string, model?: string, effort?: string): Promise<{ ok: boolean; message?: string }>;
  // Optional (D157, E3): move a task to another computer (to.device: its name, "local" for the
  // home), with who does it there. A repo task's branch is pushed first; a folder never moves.
  /** signIn (D505): Ducter moved it there for a sign-in the person already has there (site, and what it browses with); always (D505 rev.): the site is on their straight-to-Chrome list. */
  moveTask?(taskId: string, to: { device: string; name: string; homeName?: string; signIn?: { site: string; uses: "chrome" | "ducter"; always?: boolean } }, harness?: string, model?: string): Promise<{ ok: boolean; message?: string }>;
  drop(taskId: string): Promise<void>;
  // Optional: what a repo task's branch holds that its base doesn't, with its diff stat (D128:
  // On hand by project). Undefined when not a repo task or it can't tell.
  branchChanges?(taskId: string): Promise<BranchChanges | undefined>;
  // Optional (D142): a non-git folder task's changes against the copy Ducter kept (files: with
  // the list); undefined when not a folder task or nothing was ever kept. undoFolder puts the
  // folder back (path: one entry only; force: even though it changed after the task finished);
  // keepFolder frees the copy. Each resolves with a user-facing message.
  folderChanges?(taskId: string, opts?: { files?: boolean }): Promise<FolderChanges | undefined>;
  undoFolder?(taskId: string, opts?: { path?: string; force?: boolean }): Promise<{ ok: boolean; message: string; confirm?: UndoConfirm }>;
  keepFolder?(taskId: string): Promise<{ ok: boolean; message: string }>;
  // Optional (D148): what a restart mustn't cut short right now (a merge, an undo, a keep, an
  // archive), as task ids; and, while an update restarts Ducter, a reason new ones are refused
  // with (undefined lets them through again).
  critical?(): string[];
  holdCritical?(why: string | undefined): void;
  // Optional (D156): while an AI agent's updater runs on this machine, a session on it waits to start.
  holdHarness?(harness: string, on: boolean): void;
  // Optional (D214): the opened task's workbench, on the computer that holds its working copy.
  // A refusal rejects with { code: WbError }. said: ports the task's own output named (the home
  // reads the Log); exclude: ports never offered (Ducter's own). A write or a revert is the
  // user's own change: the task hears of it with its next turn.
  workbench?(taskId: string, req: import("./workbench.ts").WbRequest, o?: { said?: number[]; exclude?: number[]; simSaid?: boolean }): Promise<import("./workbench.ts").WbAnswer>;
  // Optional (D214): where a task's page is reached from the home: "here" (this machine's
  // loopback), or a fetch that carries the request to its worker. undefined: no such task.
  pageRoute?(taskId: string): { here: true } | { here: false; fetch(a: { port: number; method: string; path: string; headers: [string, string][]; body?: string }): Promise<{ status: number; headers: [string, string][]; body: string }> } | undefined;
  // Optional (D356): a file a link in a task's or the partner's words points at, read on the
  // computer the task works on from its own folders (D206's shown rules) and kept in the home's
  // media for the viewer. taskId: the task the link was shown in (a hint; the path decides).
  // Throws an Error whose `code` is a FileOpenError.
  fileOpen?(path: string, taskId?: string): Promise<import("./media.ts").MediaRef>;
}

export function createRunnerSignature(_core: CoreApi): Runner {
  throw new Error("signature only: runner exports createRunner(core: CoreApi): Runner");
}

// ---------- partner ----------

export interface Partner {
  // Called by core for: user_msg, report (done/failed/needs_input), decision_resolved, waiter fired.
  onTrigger(e: LogEvent): void; // must not block; queues and coalesces (principle 6)
}

export function createPartnerSignature(_core: CoreApi, _runner: Runner): Partner {
  throw new Error("signature only: partner exports createPartner(core: CoreApi, runner: Runner): Partner");
}

/** D193: what the partner's phone_call tool reaches (core/src/phone.ts). */
export interface PhonePort {
  available(): { connectionId: string; provider: string } | undefined;
  draft(req: DraftRequest, o: { lang: LangTag; callId?: string; answers?: string }): Promise<DraftResult>;
  answer(text: string, callId?: string): { ok: true } | { ok: false; error: string };
  cancel(callId: string, by: "owner" | "ducter"): Promise<boolean>;
  block(number: string, why?: string): { ok: true; number: string } | { ok: false; error: string };
  /** D215: how a call the user made themselves from a call sheet went, in their words (reached false: nobody answered). */
  result(callId: string, outcome: string, reached?: boolean): { ok: true } | { ok: false; error: string };
  get(callId: string): CallBody | undefined;
  calls(): (CallBody & { updatedAt: string })[];
}

/** D395: task_open's pre-flight answer: the place to open in (checked, replaced, or a clone first), or what to tell the model. */
export type PreflightResult =
  | { ok: true; place: Place; how?: "given" | "named" | "rule" | "prefer" | "found" | "clone"; computer?: string; repo?: string; /** A line Ducter says itself (the clone). */ said?: string; /** D476: the person's word on where this work runs, kept on the task. */ bound?: import("./index.ts").TaskBound }
  | { ok: false; error: string };

/** D395: where a repository task works, resolved by code from the repository (core/src/repo-where.ts). */
export interface PlacesPort {
  /**
   * Before a task exists: a repository place is checked (there, a git repository, that origin),
   * replaced by the resolver's answer when it isn't, or planned as a clone; a place that can't be
   * fixed is an error the partner can act on. remote: the repository the work is on (the partner's
   * place.remote, the to-do it took, an address in the words).
   */
  preflight(a: {
    place: Place;
    remote?: string;
    texts: string[];
    userTexts: string[];
    /** D477: the person's word on where this work runs, as the partner recorded it (computer names): held on this task and whatever replaces it. */
    where?: { on?: string; only?: boolean; not?: string[] };
    /** D477: the task this one opens again (a rethink): its recorded word on where carries over. */
    replaces?: string;
  }): Promise<PreflightResult>;
  /** D120's early open: a place on this computer that is that repository now (read at once, no git). */
  quick(place: Place, remote?: string): boolean;
  /** Why a task couldn't start and the fixes, in the task's language (the runner asks before it marks it failed). */
  cantStart(taskId: string, p: { why: import("./index.ts").CantStart["why"]; path: string; device: string }): Promise<import("./index.ts").CantStart & { line: string }>;
  /** 再试一次 / 在 X 上做 / 拉一份到这里 on a task that couldn't start: the place it starts in now. */
  replan(taskId: string, how: { action: "reopen" | "start_at" | "clone_here" | "clear_lock"; device?: string }, by?: "ducter" | "person"): Promise<{ ok: true; place: Place } | { ok: false; message: string }>;
  /** D476: the person's word on where this task's work runs (its own words, and the task it carries on). */
  boundOf?(taskId: string): import("./index.ts").TaskBound | undefined;
  /** D476: a computer's name, for words (its device id; "local" for the home). */
  nameOf?(device: string): string;
}
