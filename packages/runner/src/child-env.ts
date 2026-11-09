// The environment of a harness process (D102). Built from an allowlist, never inherited whole:
// Ducter's own process may hold keys (a server's unit used to load them from <dataDir>/env, a
// developer's shell exports a few), and none of them reach a harness unless that harness signs
// in with it (HARNESS_KEYS).
//
// What a child gets:
//   - the basics every program needs: PATH, HOME, user, locale, terminal, temp folder, time
//     zone, XDG folders, proxies and CA bundles, the SSH agent socket, common toolchain homes;
//   - Ducter's own non-secret DUCTER_* settings;
//   - its harness's own non-secret settings (CLAUDE_* / ANTHROPIC_* for Claude Code, CODEX_* /
//     OPENAI_* for Codex, PI_* for pi, DSH_* for DeepSeek Harness);
//   - the keys HARNESS_KEYS grants that harness, from the environment or Ducter's key file;
//   - whatever the session spec sets explicitly (Ducter's own, e.g. DSH_HOME).
// Everything else, and every other secret-shaped name, is removed.
//
// OAR starts each child from the host's environment plus an overlay (a string sets, null
// removes: shared/environment.js sessionEnvironment), so the result is that overlay: a null
// for every inherited variable left out, a value where it differs. A variable kept unchanged is
// not repeated, so OAR's own removals (Claude Code's parent-session markers) still apply.
import { HARNESS_KEYS, type HarnessId } from "@ducter/protocol";
import { isSecretName } from "@ducter/protocol/src/keys.ts";

type Env = Record<string, string | null | undefined>;

/** Named basics every harness child keeps. Adding one is a one-line change; never add a secret. */
const BASE = new Set([
  "PATH", "HOME", "USER", "LOGNAME", "SHELL", "LANG", "LANGUAGE", "TERM", "COLORTERM", "TERM_PROGRAM",
  "TMPDIR", "TMP", "TEMP", "TZ", "NO_COLOR", "FORCE_COLOR", "EDITOR", "VISUAL", "PAGER",
  "SSH_AUTH_SOCK", "DISPLAY", "WAYLAND_DISPLAY", "DBUS_SESSION_BUS_ADDRESS",
  "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "no_proxy", "all_proxy",
  "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE", "SSL_CERT_DIR", "REQUESTS_CA_BUNDLE", "CURL_CA_BUNDLE",
  "GOPATH", "GOROOT", "GOBIN", "CARGO_HOME", "RUSTUP_HOME", "BUN_INSTALL", "DENO_INSTALL", "NVM_DIR", "NVM_BIN",
  "PNPM_HOME", "VOLTA_HOME", "JAVA_HOME", "PYENV_ROOT", "VIRTUAL_ENV", "CONDA_PREFIX", "GEM_HOME", "GEM_PATH",
  "ASDF_DIR", "ASDF_DATA_DIR", "MISE_DATA_DIR", "HOMEBREW_PREFIX", "HOMEBREW_CELLAR", "HOMEBREW_REPOSITORY",
  "ANDROID_HOME", "ANDROID_SDK_ROOT", "DEVELOPER_DIR", "SDKROOT", "XPC_FLAGS", "__CF_USER_TEXT_ENCODING",
]);
const BASE_PREFIX = /^(?:LC_|XDG_|GIT_)/;

/** Each harness's own settings (non-secret names only; its keys come from HARNESS_KEYS). */
const HARNESS_CONFIG: Record<HarnessId, RegExp> = {
  "claude-code": /^(?:CLAUDE_|ANTHROPIC_|DISABLE_|ENABLE_|MAX_THINKING_TOKENS$|MCP_TIMEOUT$|MCP_TOOL_TIMEOUT$)/,
  // BROWSER_USE_ACCESS_*: the Codex desktop app's browser access host, when Ducter itself was
  // started under the app (D130; protocol native-browser.ts). A pipe path, an id and a public key.
  codex: /^(?:CODEX_|OPENAI_|BROWSER_USE_ACCESS_(?:PIPE_PATH|EXECUTOR_ID|VERIFYING_IDENTITY)$)/,
  pi: /^PI_/,
  "deepseek-harness": /^DSH_/,
};

/** Whether a name a harness inherited may stay in its process (keys excepted: see grants). */
export function allowedFor(harness: HarnessId, name: string): boolean {
  if (BASE.has(name)) return true;
  if (isSecretName(name)) return false;
  if (BASE_PREFIX.test(name)) return true;
  if (name.startsWith("DUCTER_")) return name !== "DUCTER_PARENT_PID";
  return HARNESS_CONFIG[harness].test(name);
}

export interface ChildEnvInput {
  /** The environment Ducter itself runs with (default process.env). */
  inherited?: Record<string, string | undefined>;
  /** The port's overlay (e.g. a captured login-shell env), applied to `inherited` first. */
  overlay?: Env;
  /** Ducter's keys (readKeys(dataDir)); only the granted ones are passed. */
  keys?: Record<string, string>;
  /** Extra key names this session may receive (Codex's custom provider env_key). */
  grants?: readonly string[];
  /** Set by Ducter for this session (spec.env, DSH_HOME, ...): passed as is. */
  explicit?: Env;
}

/** The full environment a harness child ends up with (what OAR's overlay produces). */
export function childEnvironment(harness: HarnessId, i: ChildEnvInput = {}): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const [k, v] of Object.entries(i.inherited ?? process.env)) if (typeof v === "string") merged[k] = v;
  for (const [k, v] of Object.entries(i.overlay ?? {})) {
    if (v === null) delete merged[k];
    else if (typeof v === "string") merged[k] = v;
  }
  const grants = new Set([...HARNESS_KEYS[harness], ...(i.grants ?? [])].filter((k) => !k.startsWith("DUCTER_")));
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(merged)) if (allowedFor(harness, k) || grants.has(k)) out[k] = v;
  for (const k of grants) if (!out[k] && i.keys?.[k]) out[k] = i.keys[k]!;
  for (const [k, v] of Object.entries(i.explicit ?? {})) {
    if (v === null) delete out[k];
    else if (typeof v === "string") out[k] = v;
  }
  return out;
}

/** The same, as an OAR SessionOptions.env overlay on top of `inherited`. */
export function childEnvOverlay(harness: HarnessId, i: ChildEnvInput = {}): Record<string, string | null> {
  const inherited = i.inherited ?? process.env;
  const want = childEnvironment(harness, { ...i, inherited });
  const out: Record<string, string | null> = {};
  for (const k of new Set([...Object.keys(inherited), ...Object.keys(i.overlay ?? {}), ...Object.keys(i.explicit ?? {})])) {
    if (!(k in want)) out[k] = null;
  }
  for (const [k, v] of Object.entries(want)) if (inherited[k] !== v) out[k] = v;
  return out;
}
