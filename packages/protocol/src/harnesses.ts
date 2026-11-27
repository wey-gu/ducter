// The first-wave harnesses (D85): what each one is called, what Ducter can run on it, and how
// the partner's clean setup is made on it. Pure data: clients, the CLI, core and the runner read
// it; only the runner turns it into OAR options (packages/runner/src/oar.ts).
// Evidence: research/34-harness-adapters.md.

export const HARNESS_IDS = ["claude-code", "codex", "pi", "deepseek-harness", "antigravity", "cursor", "devin", "kimi", "opencode", "dim"] as const;
export type HarnessId = (typeof HARNESS_IDS)[number];

export function isHarnessId(s: unknown): s is HarnessId {
  return typeof s === "string" && (HARNESS_IDS as readonly string[]).includes(s);
}
/**
 * D625: the agents the partner's own tools name (`task_open`, `task_fork`, `task_switch`,
 * `rule_save`, `new_tasks`). Dim is left out until the D175 partner eval can judge the list with
 * it: adding one id changes the partner's tools/list JSON, and that eval is a real-model run this
 * pass could not make. The app's New task picker, Tasks and the runner still take `dim`; lifting
 * this one filter is the whole change once the eval is run (see todo.md).
 */
export const PARTNER_NAMED_HARNESS_IDS: readonly HarnessId[] = HARNESS_IDS.filter((h) => h !== "dim");

/**
 * D448: the agents whose Nowledge Mem plugin carries Bridge (its `bridge` skill), so a session of
 * theirs reaches other agents by itself: Claude Code and Codex (research/66 §10, research/183 §3,
 * VERIFIED 2026-11-18). Every other agent's (pi, Antigravity, DeepSeek Harness) has none.
 */
export const MEM_BRIDGE_HARNESSES: readonly HarnessId[] = ["claude-code", "codex"];

/**
 * D448: a task Ducter runs talks to other agents through Ducter: its message goes out under the
 * partner's identity with the task named, and an answer to it comes back into the task. Never a
 * browser task (D62: a page could ask for it). D494: every agent, Claude Code and Codex too: a task
 * runs as the partner's Mem identity, so its own plugin's Bridge session is a second reader of the
 * partner's mailbox (hel, 2026-11-23); the home is the one receiver and wakes the task.
 */
export function relaysBridge(harness: string, place?: { kind: string }): boolean {
  return isHarnessId(harness) && place?.kind !== "browser";
}

/**
 * How the partner leaves the user's own setup of this harness out (their instructions files,
 * skills, plugins, hooks, MCP servers), keeping the login and the session history:
 *  - native:    OAR userConfiguration "exclude" (claude: --setting-sources project,local, --strict-mcp-config)
 *  - overrides: per-session `-c` config overrides (codex app-server): every user MCP server
 *               disabled by name, hooks, plugins, apps and memories off
 *  - flags:     CLI flags on pi's RPC process: --no-skills --no-context-files --no-extensions
 *               --no-prompt-templates --no-themes
 *  - home:      a Ducter-owned harness home (DSH_HOME, DSH_AGENTS_HOME); the key comes from the env
 *  - none:      no verified way (Antigravity: OAR refuses userConfiguration "exclude"), so it
 *               never carries the partner, a one-shot or a page-reading task (D416)
 */
export type IsolationMethod = "native" | "overrides" | "flags" | "home" | "none";

/** How the user gets the harness signed in. */
export type LoginKind = "account" | "provider-keys" | "api-key";

export interface HarnessInfo {
  id: HarnessId;
  /** The product's own official name (glossary). */
  name: string;
  /** Short mark for tight places (desktop tokens). */
  badge: string;
  /** The command on PATH, when the harness is a separate install. pi ships inside Ducter. */
  command?: string;
  partner: boolean;
  task: boolean;
  /** D206: it sees pictures handed to it (OAR's capabilities.images for its runtime: 0.95.1, Antigravity 0.124 by agy's ACP initialize). */
  images: boolean;
  /**
   * D325: it takes words in the middle of a turn (a steer), read at its next step, with an echo
   * that says it took them in. OAR 0.95.1, by its source: Claude Code writes a user message into
   * the running stream-json turn and replays it (--replay-user-messages); Codex `turn/steer` on
   * its app-server, a userMessage item; pi its SDK `steer`, the message in its conversation;
   * DeepSeek Harness its bridge `steer`, a user turn item; (OAR 0.124, D416) Antigravity a second
   * ACP prompt into the running loop, the newest answer settling the turn. false: words sent while it works wait
   * for the turn to end (Ducter holds them), and the composer says so.
   */
  steer: boolean;
  /** D206: it makes pictures itself (Codex's image_generation, kept on for tasks). */
  draws?: boolean;
  isolation: IsolationMethod;
  /** replace: native system prompt; home-file: AGENTS.md in the Ducter-owned home; none: no replacement channel (Antigravity, D416). */
  systemPrompt: "replace" | "home-file" | "none";
  taskInstructions: "append" | "first-turn";
  /** http: native HTTP MCP with headers; stdio-bridge: Ducter's stdio bridge to its HTTP endpoint. */
  mcp: "http" | "stdio-bridge";
  login: LoginKind;
  /** How a signed-in account is usually paid (the device view may say otherwise, e.g. an API key on Claude Code). */
  billing: "plan" | "usage";
  /** The cheapest model that still does the partner's job well enough for the smoke eval. */
  cheapModel?: string;
  /** How a model is written for this harness, for the partner's tool description. */
  modelForm: string;
  install?: string;
  signIn?: string;
  /**
   * D416: picked, never chosen. The ranking puts it after every other agent that can take the
   * work, so it runs a task only when the person (or a rule) names it, or nothing else can.
   */
  pickOnly?: true;
  /**
   * D594/D600: run the way an editor runs it, and only that way: it works when the person asks
   * (their own words, or a task the partner opened from them), never by itself. No wait or timer
   * wakes it, no routine or Keep runs it, and Ducter never reads its account's quota. The reason
   * and its source are on `directOnlyWhy`, beside the entry.
   */
  directOnly?: true;
  /** D600: one plain line in each language, next to the entry, with the page it comes from. */
  directOnlyWhy?: { zh: string; en: string; source: string };
  /**
   * D416: it can't hold a task that reads web pages to Ducter's rules (its own setup can't be
   * left out of a session, D241), so browsing work never goes to it (block no_web).
   */
  noWebTasks?: true;
  /** D416: Ducter can sign it out with its own sign-out (OAR's runtime logout), from its row. */
  signOut?: true;
}

export const HARNESSES: Record<HarnessId, HarnessInfo> = {
  "claude-code": {
    id: "claude-code",
    name: "Claude Code",
    badge: "cc",
    command: "claude",
    partner: true,
    task: true,
    images: true,
    steer: true,
    isolation: "native",
    systemPrompt: "replace",
    taskInstructions: "append",
    mcp: "http",
    login: "account",
    billing: "plan",
    cheapModel: "haiku",
    modelForm: "an alias (opus, sonnet, haiku) or a full model id",
    install: "curl -fsSL https://claude.ai/install.sh | bash",
    signIn: "claude auth login",
  },
  codex: {
    id: "codex",
    name: "Codex",
    badge: "cx",
    command: "codex",
    partner: true,
    task: true,
    images: true,
    steer: true,
    draws: true,
    isolation: "overrides",
    systemPrompt: "replace",
    taskInstructions: "append",
    mcp: "http",
    login: "account",
    billing: "plan",
    cheapModel: "gpt-6-luna",
    modelForm: "a Codex model id (e.g. gpt-6.1-sol)",
    install: "curl -fsSL https://chatgpt.com/codex/install.sh | sh",
    signIn: "codex login",
  },
  pi: {
    id: "pi",
    name: "pi",
    badge: "pi",
    partner: true, // D177: passed the partner eval (research/50 §5), read-only enforced live (§2)
    task: true,
    images: true,
    steer: true,
    isolation: "flags",
    systemPrompt: "replace",
    taskInstructions: "append",
    mcp: "http",
    login: "provider-keys",
    billing: "usage",
    modelForm: "provider/model (e.g. anthropic/claude-haiku-4-5)",
    signIn: "pi, then /login; or a provider key in the environment (e.g. ANTHROPIC_API_KEY)",
  },
  "deepseek-harness": {
    id: "deepseek-harness",
    name: "DeepSeek Harness",
    badge: "ds",
    command: "dsh",
    partner: true, // D177: passed the partner eval (research/50 §5), read-only enforced live (§2)
    task: true,
    images: false,
    steer: true,
    isolation: "home",
    systemPrompt: "home-file",
    taskInstructions: "first-turn",
    mcp: "stdio-bridge",
    login: "api-key",
    billing: "usage",
    cheapModel: "deepseek-official/deepseek-flash",
    modelForm: "provider/model (e.g. deepseek-official/deepseek-flash)",
    install: "npm install -g @deepseek-ai/dsh",
    signIn: "a DeepSeek API key (DEEPSEEK_API_KEY)",
  },
  // D416: Google's Antigravity CLI (agy) over its native ACP, OAR 0.124 (runtimes/antigravity).
  // Tasks only: OAR refuses tool denial, a replaced system prompt and leaving the person's own
  // setup out, so a read-only partner can't be held there (principle 6).
  antigravity: {
    id: "antigravity",
    name: "Antigravity",
    badge: "ag",
    command: "agy",
    partner: false,
    task: true,
    images: true,
    steer: true,
    isolation: "none",
    systemPrompt: "none",
    taskInstructions: "append",
    mcp: "stdio-bridge",
    login: "account",
    billing: "plan",
    modelForm: "a model id from its own list (e.g. gemini-3.8-flash)",
    install: "curl -fsSL https://antigravity.google/cli/install.sh | bash",
    signIn: "agy acp --login (a Google sign-in: open the link anywhere, paste the code back)",
    pickOnly: true,
    directOnly: true,
    directOnlyWhy: {
      zh: "{agent} 只在你发话时干活：它不会自己等、定时醒来或按时重复（Google 对个人账号登录的条款）。这件事交给别的 AI，或者到时候你再叫它。",
      en: "{agent} works only when you ask: it doesn't wait, wake on a timer or repeat on a schedule by itself (Google's terms for a personal sign-in). Give this to another AI, or ask it again when the time comes.",
      source: "https://antigravity.google/terms",
    },
    noWebTasks: true,
    signOut: true,
  },
  // D600/D630: Cursor's own SDK, embedded by OAR 0.137 (runtimes/cursor, subprocess mode).
  // Tasks only: the SDK refuses tool denial and a replaced prompt. Ducter installs @cursor/sdk
  // 1.4.1 in its own tools folder on demand and re-enters its binary as the SDK child
  // (research/239). Cursor's OAuth apps cannot sign the CLI or SDK in.
  cursor: {
    id: "cursor",
    name: "Cursor",
    badge: "cu",
    command: "agent",
    partner: false,
    task: true,
    images: true,
    steer: true,
    isolation: "native",
    systemPrompt: "none",
    taskInstructions: "first-turn",
    mcp: "http",
    login: "account",
    billing: "plan",
    cheapModel: "composer-2.5",
    modelForm: 'a Cursor catalog id or alias (e.g. composer-2.5, gpt-5.6-sol); "default" is Auto',
    signIn: "a cursor.com sign-in link (open it anywhere; it completes on its own), or CURSOR_API_KEY",
    signOut: true,
    noWebTasks: true,
  },
  // D600: Devin CLI over ACP (OAR 0.124 runtimes/devin). Tasks only: OAR refuses tool denial, a
  // system prompt and leaving the person's setup out; no sign-out OAR can run (research/240).
  devin: {
    id: "devin",
    name: "Devin CLI",
    badge: "dv",
    command: "devin",
    partner: false,
    task: true,
    images: false,
    steer: false,
    isolation: "none",
    systemPrompt: "none",
    taskInstructions: "first-turn",
    mcp: "stdio-bridge",
    login: "account",
    billing: "plan",
    cheapModel: "swe-1-6-fast",
    modelForm: "a model id from its own list (e.g. swe-1-6-fast)",
    install: "curl -fsSL https://cli.devin.ai/install.sh | bash",
    signIn: "devin auth login (a browser sign-in; or WINDSURF_API_KEY)",
    noWebTasks: true,
  },
  // D600: Kimi Code CLI over ACP (OAR 0.124 runtimes/kimi). Tasks only, and only when asked:
  // Kimi's community guidelines keep subscriptions to interactive use, so no wait, timer,
  // routine or Keep runs on it (the source is on directOnlyWhy). OAR refuses tool denial, a
  // prompt and leaving the person's setup out; it takes pictures and HTTP MCP (research/241).
  kimi: {
    id: "kimi",
    name: "Kimi Code CLI",
    badge: "km",
    command: "kimi",
    partner: false,
    task: true,
    images: true,
    steer: false,
    isolation: "none",
    systemPrompt: "none",
    taskInstructions: "first-turn",
    mcp: "http",
    login: "account",
    billing: "plan",
    cheapModel: "kimi-code/kimi-for-coding",
    modelForm: "a model id from its own list (e.g. kimi-code/k3.1-pro, kimi-code/kimi-for-coding)",
    install: "curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash",
    signIn: "kimi login (device code; --region global outside mainland China)",
    signOut: true,
    directOnly: true,
    directOnlyWhy: {
      zh: "{agent} 只在你发话时干活：Kimi Code 的订阅只限个人交互使用，Ducter 不会让它自己等、定时醒来，也不会把它排进例行任务或看守。这件事交给别的 AI，或者到时候你再叫它。",
      en: "{agent} works only when you ask: Kimi Code subscriptions are for personal interactive use, so Ducter never lets it wait, wake on a timer or run in routines or Keeps. Give this to another AI, or ask it again when the time comes.",
      source: "https://www.kimi.com/code/docs/en/kimi-code/community-guidelines.html",
    },
    noWebTasks: true,
  },
  // D600: OpenCode over ACP (OAR 0.124 runtimes/opencode). Tasks only and picked, never chosen:
  // one sign-in route is a provider's consumer subscription OAuth, and Ducter cannot tell which
  // provider is signed in, so it runs only when named (the source is on directOnlyWhy). OAR
  // refuses tool denial and a clean setup; prompts, images, steer and HTTP MCP work (research/242).
  opencode: {
    id: "opencode",
    name: "OpenCode",
    badge: "oc",
    command: "opencode",
    partner: false,
    task: true,
    images: true,
    steer: true,
    draws: false,
    isolation: "none",
    systemPrompt: "replace",
    taskInstructions: "append",
    mcp: "http",
    login: "provider-keys",
    billing: "usage",
    cheapModel: "opencode/big-pickle",
    modelForm: "provider/model, with #variant for effort (e.g. anthropic/claude-sonnet-5-5#high)",
    install: "curl -fsSL https://opencode.ai/v2/install | bash",
    signIn: "opencode auth login (pick a provider: OAuth or API key)",
    pickOnly: true,
    directOnly: true,
    directOnlyWhy: {
      zh: "{agent} 只在你发话时干活：它能用某个模型服务商的订阅登录，而 Anthropic 不允许第三方程序用订阅额度代你请求，Ducter 也分不出你登的是哪一种。这件事交给别的 AI，或者到时候你再叫它。",
      en: "{agent} works only when you ask: it can sign in with a model provider's consumer subscription, and Anthropic does not allow third-party apps to route plan credentials for you; Ducter cannot tell which one is signed in. Give this to another AI, or ask it again when the time comes.",
      source: "https://code.claude.com/docs/en/legal-and-compliance",
    },
    noWebTasks: true,
  },
  // D625: Dim (DimAgent) over its ACP gateway (`dima acp`), OAR's community runtime
  // (createDimRuntime from @botiverse/oar/community; docs/runtimes/dim.md). Tasks only: the gateway
  // refuses tool denial, a replaced or appended prompt, and excluding the person's home, so it can
  // never be the partner, a one-shot or a quick web look. Pictures, stdio and HTTP MCP; no steer,
  // no task stop, opaque attribution and a non-durable queue. `model`/`effort` exist only on a
  // catalog home (a --model-config file has neither), and OAR has no model listing, login or usage
  // reader: sign in with dima itself, and its own auth failure ends a turn.
  dim: {
    id: "dim",
    name: "Dim",
    badge: "dm",
    command: "dima",
    partner: false,
    task: true,
    images: true,
    steer: false,
    isolation: "none",
    systemPrompt: "none",
    taskInstructions: "first-turn",
    mcp: "stdio-bridge",
    login: "account",
    billing: "usage",
    modelForm: "a model id from the home's provider catalog, or none with a --model-config file",
    install: "npm install -g dimcode-alpha",
    signIn: "dima itself: /login, or /connect in its TUI for an API key",
    noWebTasks: true,
  },
};

/** D594/D600: the one-line why for an agent that works only when asked. */
export function directOnlyWhy(id: string | undefined): { zh: string; en: string; source: string } | undefined {
  return id && isHarnessId(id) && HARNESSES[id].directOnly ? HARNESSES[id].directOnlyWhy : undefined;
}

/**
 * D150/D177: what the partner thinks with when the user never chose and Claude Code (the default)
 * isn't signed in on the home: the first of these that is signed in there and may be the partner.
 * A plan before a key paid by use; DeepSeek Harness before pi, by the partner eval (research/50 §5).
 */
export const PARTNER_FALLBACK: readonly HarnessId[] = ["claude-code", "codex", "deepseek-harness", "pi"];

export function harnessName(id: string): string {
  return isHarnessId(id) ? HARNESSES[id].name : id;
}

/** D594: an agent that works only when the person asks (HarnessInfo.directOnly). */
export function directOnly(id: string | undefined): boolean {
  return !!id && isHarnessId(id) && !!HARNESSES[id].directOnly;
}

/** Provider keys pi reads from the environment (its own docs); any one makes pi usable. */
export const PI_PROVIDER_ENV = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "AZURE_OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "OPENROUTER_API_KEY",
  "DEEPSEEK_API_KEY",
  "GROQ_API_KEY",
  "XAI_API_KEY",
  "MISTRAL_API_KEY",
  "CEREBRAS_API_KEY",
  // D298: the providers a pasted key can name (Kimi, GLM), as pi 1.5 reads them.
  "MOONSHOT_API_KEY",
  "ZAI_API_KEY",
  "ZAI_CODING_CN_API_KEY",
] as const;

/** The env var DeepSeek Harness reads its DeepSeek key from (dsh-credentials-local). */
export const DSH_KEY_ENV = "DEEPSEEK_API_KEY";

/** The Claude Code login token from `claude setup-token` (research/29); a server keeps it in keys.env. */
export const CLAUDE_TOKEN_ENV = "CLAUDE_CODE_OAUTH_TOKEN";

/**
 * D102: the only secret-shaped variables each harness's processes may receive, from Ducter's key
 * file (<dataDir>/keys.env) or the environment Ducter was started with. Every other key or token
 * is left out of a harness child. A key is granted to the harness that signs in with it and to no
 * other. D298: DEEPSEEK_API_KEY goes to DeepSeek Harness and to pi (both sign in with it, and a
 * pasted DeepSeek key runs on pi where DeepSeek Harness isn't installed), never to Claude Code or
 * Codex. Codex also gets the
 * `env_key` its own config.toml names for a custom provider (runner child-env.ts).
 */
export const HARNESS_KEYS: Readonly<Record<HarnessId, readonly string[]>> = {
  "claude-code": [CLAUDE_TOKEN_ENV, "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"],
  codex: ["OPENAI_API_KEY", "CODEX_API_KEY"],
  pi: PI_PROVIDER_ENV,
  "deepseek-harness": [DSH_KEY_ENV],
  // D416: agy's Gemini API provider reads it (OAR's local-provider fixture); a Google sign-in needs none.
  antigravity: ["GEMINI_API_KEY"],
  // D600: Cursor's SDK reads only its own key (OAR access.js); a Cursor OAuth app cannot sign it in.
  cursor: ["CURSOR_API_KEY"],
  // D600: Devin reads WINDSURF_API_KEY (DEVIN_API_KEY is ignored); its browser sign-in uses no env key.
  devin: ["WINDSURF_API_KEY"],
  // D600: Kimi signs in with OAuth (OAR login.js), not a static key.
  kimi: [],
  // D600: OpenCode's own key only: its plugins run in-process and can read the child env (never a provider key).
  opencode: ["OPENCODE_API_KEY"],
  // D625: Dim signs in through its own home (a catalog account or /connect); a --model-config
  // file can name any apiKeyEnv, which Ducter cannot grant by name without knowing the file. Nothing
  // static is granted here.
  dim: [],
};

/** A device's view of one harness, completed from the table: may it be the partner, how is it paid. */
export function deviceHarness<T extends { harness: string; installed: boolean; loggedIn: boolean; billing?: "plan" | "usage"; trouble?: { kind: string } }>(h: T): T & { canBePartner: boolean; billing?: "plan" | "usage" } {
  const info = isHarnessId(h.harness) ? HARNESSES[h.harness] : undefined;
  const billing = h.billing ?? (h.loggedIn ? info?.billing : undefined);
  // D549: an agent that refuses to run as root here can't carry the partner here either.
  return { ...h, canBePartner: !!info?.partner && h.installed && h.loggedIn && h.trouble?.kind !== "root", ...(billing ? { billing } : {}) };
}
