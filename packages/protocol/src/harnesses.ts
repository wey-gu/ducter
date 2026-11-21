// The first-wave harnesses (D85): what each one is called, what Ducter can run on it, and how
// the partner's clean setup is made on it. Pure data: clients, the CLI, core and the runner read
// it; only the runner turns it into OAR options (packages/runner/src/oar.ts).
// Evidence: research/34-harness-adapters.md.

export const HARNESS_IDS = ["claude-code", "codex", "pi", "deepseek-harness", "antigravity"] as const;
export type HarnessId = (typeof HARNESS_IDS)[number];

export function isHarnessId(s: unknown): s is HarnessId {
  return typeof s === "string" && (HARNESS_IDS as readonly string[]).includes(s);
}

/**
 * D448: the agents whose Nowledge Mem plugin carries Bridge (its `bridge` skill), so a session of
 * theirs reaches other agents by itself: Claude Code and Codex (research/66 §10, research/183 §3,
 * VERIFIED 2026-11-18). Every other agent's (pi, Antigravity, DeepSeek Harness) has none.
 */
export const MEM_BRIDGE_HARNESSES: readonly HarnessId[] = ["claude-code", "codex"];

/**
 * D448: a task Ducter runs on an agent with no Bridge of its own talks to other agents through
 * Ducter: its message goes out under the partner's identity with the task named, and an answer to
 * it comes back into the task. Never a browser task (D62: a page could ask for it).
 */
export function relaysBridge(harness: string, place?: { kind: string }): boolean {
  return isHarnessId(harness) && !MEM_BRIDGE_HARNESSES.includes(harness) && place?.kind !== "browser";
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
    noWebTasks: true,
    signOut: true,
  },
};

/**
 * D150/D177: what the partner thinks with when the user never chose and Claude Code (the default)
 * isn't signed in on the home: the first of these that is signed in there and may be the partner.
 * A plan before a key paid by use; DeepSeek Harness before pi, by the partner eval (research/50 §5).
 */
export const PARTNER_FALLBACK: readonly HarnessId[] = ["claude-code", "codex", "deepseek-harness", "pi"];

export function harnessName(id: string): string {
  return isHarnessId(id) ? HARNESSES[id].name : id;
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
};

/** A device's view of one harness, completed from the table: may it be the partner, how is it paid. */
export function deviceHarness<T extends { harness: string; installed: boolean; loggedIn: boolean; billing?: "plan" | "usage" }>(h: T): T & { canBePartner: boolean; billing?: "plan" | "usage" } {
  const info = isHarnessId(h.harness) ? HARNESSES[h.harness] : undefined;
  const billing = h.billing ?? (h.loggedIn ? info?.billing : undefined);
  return { ...h, canBePartner: !!info?.partner && h.installed && h.loggedIn, ...(billing ? { billing } : {}) };
}
