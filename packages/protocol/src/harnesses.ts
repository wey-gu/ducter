// The first-wave harnesses (D85): what each one is called, what Ducter can run on it, and how
// the partner's clean setup is made on it. Pure data: clients, the CLI, core and the runner read
// it; only the runner turns it into OAR options (packages/runner/src/oar.ts).
// Evidence: research/34-harness-adapters.md.

export const HARNESS_IDS = ["claude-code", "codex", "pi", "deepseek-harness"] as const;
export type HarnessId = (typeof HARNESS_IDS)[number];

export function isHarnessId(s: unknown): s is HarnessId {
  return typeof s === "string" && (HARNESS_IDS as readonly string[]).includes(s);
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
 */
export type IsolationMethod = "native" | "overrides" | "flags" | "home";

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
  isolation: IsolationMethod;
  /** replace: native system prompt; home-file: AGENTS.md in the Ducter-owned home; first-turn: prefixed to the first message. */
  systemPrompt: "replace" | "home-file";
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
}

export const HARNESSES: Record<HarnessId, HarnessInfo> = {
  "claude-code": {
    id: "claude-code",
    name: "Claude Code",
    badge: "cc",
    command: "claude",
    partner: true,
    task: true,
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
] as const;

/** The env var DeepSeek Harness reads its DeepSeek key from (dsh-credentials-local). */
export const DSH_KEY_ENV = "DEEPSEEK_API_KEY";

/** The Claude Code login token from `claude setup-token` (research/29); a server keeps it in keys.env. */
export const CLAUDE_TOKEN_ENV = "CLAUDE_CODE_OAUTH_TOKEN";

/**
 * D102: the only secret-shaped variables each harness's processes may receive, from Ducter's key
 * file (<dataDir>/keys.env) or the environment Ducter was started with. Every other key or token
 * is left out of a harness child. A key is granted to the harness that signs in with it and to no
 * other: DEEPSEEK_API_KEY goes to DeepSeek Harness only, never to pi. Codex also gets the
 * `env_key` its own config.toml names for a custom provider (runner child-env.ts).
 */
export const HARNESS_KEYS: Readonly<Record<HarnessId, readonly string[]>> = {
  "claude-code": [CLAUDE_TOKEN_ENV, "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"],
  codex: ["OPENAI_API_KEY", "CODEX_API_KEY"],
  pi: PI_PROVIDER_ENV.filter((k) => k !== DSH_KEY_ENV),
  "deepseek-harness": [DSH_KEY_ENV],
};

/** A device's view of one harness, completed from the table: may it be the partner, how is it paid. */
export function deviceHarness<T extends { harness: string; installed: boolean; loggedIn: boolean; billing?: "plan" | "usage" }>(h: T): T & { canBePartner: boolean; billing?: "plan" | "usage" } {
  const info = isHarnessId(h.harness) ? HARNESSES[h.harness] : undefined;
  const billing = h.billing ?? (h.loggedIn ? info?.billing : undefined);
  return { ...h, canBePartner: !!info?.partner && h.installed && h.loggedIn, ...(billing ? { billing } : {}) };
}
