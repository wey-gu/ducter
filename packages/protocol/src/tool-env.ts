// The environment of a helper Ducter runs itself (D102): nmem, git in the user's repo, the
// doctor's probes. Built from an allowlist, never inherited whole: Ducter's own process may hold
// keys, and a helper gets only the basics every program needs plus its own settings. Harness
// sessions have their own, richer list (packages/runner/src/child-env.ts).
import { isSecretName } from "./keys.ts";

/** What every program needs: paths, user, locale, terminal, temp folder, proxies, CA bundles. */
const BASICS = new Set([
  "PATH", "HOME", "USER", "LOGNAME", "SHELL", "LANG", "LANGUAGE", "TERM", "TMPDIR", "TMP", "TEMP", "TZ",
  "SYSTEMROOT", "APPDATA", "LOCALAPPDATA", "USERPROFILE", "__CF_USER_TEXT_ENCODING",
  "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "no_proxy", "all_proxy",
  "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE", "SSL_CERT_DIR", "REQUESTS_CA_BUNDLE", "CURL_CA_BUNDLE",
]);
const BASIC_PREFIX = /^(?:LC_|XDG_)/;

export interface ToolEnvOptions {
  /** The helper's own settings (NMEM_* for nmem, GIT_* for git). */
  own?: RegExp;
  /** Its own settings may include its own credential (nmem's NMEM_API_KEY). Default false. */
  ownSecrets?: boolean;
  /** More basics by name (SSH_AUTH_SOCK for git). */
  extra?: readonly string[];
  /** The environment Ducter runs with (default process.env). */
  inherited?: Record<string, string | undefined>;
}

export function toolEnv(o: ToolEnvOptions = {}): Record<string, string> {
  const out: Record<string, string> = {};
  const extra = new Set(o.extra ?? []);
  for (const [k, v] of Object.entries(o.inherited ?? process.env)) {
    if (typeof v !== "string") continue;
    if (o.own?.test(k) && (o.ownSecrets || !isSecretName(k))) out[k] = v;
    else if ((BASICS.has(k) || extra.has(k) || BASIC_PREFIX.test(k)) && !isSecretName(k)) out[k] = v;
  }
  return out;
}

/** nmem: the basics and its own NMEM_* settings, its API key among them; nothing of Ducter's. */
export const nmemEnv = (inherited?: Record<string, string | undefined>) => toolEnv({ own: /^NMEM_/, ownSecrets: true, inherited });

const GIT_EXTRA = ["SSH_AUTH_SOCK", "GNUPGHOME", "GPG_TTY", "EDITOR", "VISUAL"];

/** git: the basics, git's own GIT_* settings and the SSH agent, so a merge signs and pushes as the user's own git does. */
export const gitEnv = (inherited?: Record<string, string | undefined>) => toolEnv({ own: /^GIT_/, extra: GIT_EXTRA, inherited });

/** gh: git's, plus gh's own settings and its own token (GH_TOKEN / GITHUB_TOKEN) when the user set one. */
export const ghEnv = (inherited?: Record<string, string | undefined>) => ({
  ...gitEnv(inherited),
  ...toolEnv({ own: /^(?:GH_|GITHUB_TOKEN$)/, ownSecrets: true, inherited }),
});
