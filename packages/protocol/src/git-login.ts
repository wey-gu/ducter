// 在 {computer} 上登录 GitHub / Sign in to GitHub on {computer} (D272): the computer that does the
// work signs in to GitHub itself, through the GitHub CLI's own sign-in (`gh`), so its plain git and
// every task there use it. One module for the home and a worker (runner/src/worker-host.ts).
//
// How (research/87): `gh auth login --hostname github.com --git-protocol https --web` with no
// terminal runs GitHub's device flow and prints, on stderr, "First copy your one-time code: XXXX-XXXX"
// and "Open this URL to continue in your web browser: https://github.com/login/device", then waits
// for the person to approve it there and stores the token in gh's own place on that computer. Non-
// interactive gh skips its git setup, so `gh auth setup-git --hostname github.com` follows: git then
// asks gh for the password (`credential.https://github.com.helper`). The fallback is a token the
// person pastes: `gh auth login … --with-token` reads it on stdin.
//
// Keys never leave the computer: the code and the link are the only things that travel, the token
// goes from the client to gh's stdin and nowhere else, and nothing here is logged.
import { homedir } from "node:os";
import { gitEnv, toolEnv } from "./tool-env.ts";

export const GITHUB_HOST = "github.com";
export const DEVICE_URL = "https://github.com/login/device";
/** GitHub's device codes last 15 minutes; gh gives up then. A little more before it is stopped. */
export const GIT_LOGIN_TIMEOUT_MS = 16 * 60_000;
/** How long the start waits for gh to print the code. */
export const GIT_LOGIN_CODE_MS = 45_000;

import type { GitLoginState, GitLoginWhy } from "./index.ts";
import { spawnNow } from "./which.ts";
export type { GhInstallPlan, GitLoginState, GitLoginWhere, GitLoginWhy } from "./index.ts";
export { TOKEN_NEW_URL } from "./index.ts";


/** Runs `gh <args>`; resolves with its exit code and output. Injected in tests (never a real gh there). */
export type GhRun = (
  args: string[],
  o: { env: Record<string, string>; stdin?: string; timeoutMs: number; onErr?: (chunk: string) => void; signal?: AbortSignal },
) => Promise<{ code: number; out: string; err: string; missing?: true; timedOut?: true }>;

export const realGhRun: GhRun = async (args, o) => {
  let p: ReturnType<typeof Bun.spawn>;
  try {
    p = spawnNow(["gh", ...args], { env: o.env, stdin: o.stdin !== undefined ? "pipe" : "ignore", stdout: "pipe", stderr: "pipe" });
  } catch {
    return { code: 127, out: "", err: "", missing: true };
  }
  if (o.stdin !== undefined && p.stdin && typeof p.stdin !== "number") {
    p.stdin.write(o.stdin);
    p.stdin.end();
  }
  let timedOut = false;
  const stop = () => p.kill();
  const timer = setTimeout(() => ((timedOut = true), stop()), o.timeoutMs);
  o.signal?.addEventListener("abort", stop, { once: true });
  const read = async (s: ReadableStream<Uint8Array>, each?: (c: string) => void) => {
    let all = "";
    const dec = new TextDecoder();
    for await (const chunk of s) {
      const c = dec.decode(chunk, { stream: true });
      all += c;
      each?.(c);
    }
    return all;
  };
  try {
    const [out, err, code] = await Promise.all([read(p.stdout as ReadableStream<Uint8Array>), read(p.stderr as ReadableStream<Uint8Array>, o.onErr), p.exited]);
    // stdout whole: it is the answer. `gh api -i` prints its status line first and a page of
    // issues after it (often hundreds of KB): a tail of it read as an empty list. stderr's tail is enough.
    return { code, out, err: err.slice(-8000), ...(timedOut ? { timedOut: true as const } : {}) };
  } finally {
    clearTimeout(timer);
    o.signal?.removeEventListener("abort", stop);
  }
};

/**
 * gh's environment: git's (tool-env.ts) and gh's own non-secret settings (GH_CONFIG_DIR, GH_HOST…),
 * never asking, never coloured, never offering an update. `withToken` keeps a GH_TOKEN / GITHUB_TOKEN
 * the person set (a status check sees it); a sign-in leaves them out, since gh refuses to store a
 * login while one is set.
 */
export function ghRunEnv(inherited?: Record<string, string | undefined>, withToken = false): Record<string, string> {
  // A service started without HOME (a root unit with no User=): gh keeps its sign-in under
  // ~/.config/gh, so the home folder of the user this runs as stands in.
  const home = (inherited ?? process.env).HOME || homeOf();
  return {
    ...(home ? { HOME: home } : {}),
    ...gitEnv(inherited),
    ...toolEnv({ own: withToken ? /^(?:GH_|GITHUB_TOKEN$)/ : /^GH_(?!TOKEN$|ENTERPRISE_TOKEN$)/, ownSecrets: withToken, inherited }),
    GH_PROMPT_DISABLED: "1",
    GH_NO_UPDATE_NOTIFIER: "1",
    GH_SPINNER_DISABLED: "1",
    NO_COLOR: "1",
  };
}

const homeOf = () => {
  try {
    return homedir();
  } catch {
    return "";
  }
};

const CODE = /one-time code[^A-Z0-9]*([A-Z0-9]{4}-[A-Z0-9]{4})/i;
const URL_RE = /(https:\/\/[^\s]+\/login\/device)\b/;

/** The one-time code and the link gh printed (research/87: stderr, without a terminal). */
export function parseDeviceCode(text: string): { code?: string; url?: string } {
  const c = CODE.exec(text)?.[1];
  const u = URL_RE.exec(text)?.[1];
  return { ...(c ? { code: c.toUpperCase() } : {}), ...(u ? { url: u } : {}) };
}

/** The account gh is signed in as on github.com, from `gh auth status` (JSON on a newer gh, text on an older one). */
export function parseStatus(out: string, err: string): string | undefined {
  try {
    const j = JSON.parse(out) as { hosts?: Record<string, { state?: string; active?: boolean; login?: string }[]> };
    const list = j.hosts?.[GITHUB_HOST] ?? [];
    const ok = list.filter((h) => h.state === "success" && h.login);
    return (ok.find((h) => h.active) ?? ok[0])?.login;
  } catch {}
  const m = /Logged in to github\.com (?:account|as) ([A-Za-z0-9-]+)/.exec(`${out}\n${err}`);
  return m?.[1];
}

/** Why a sign-in failed, from gh's words. */
export function loginWhy(err: string): GitLoginWhy {
  const e = err.toLowerCase();
  // D345: GitHub out of reach (no network, DNS, a proxy, TLS) before "timeout" reads as expired.
  if (/dial tcp|no such host|lookup [^ ]+ on|connection refused|network is unreachable|tls handshake|i\/o timeout|proxyconnect|could not resolve|connection reset by peer/.test(e)) return "network";
  if (/expired|expire|timed out|timeout/.test(e)) return "expired";
  if (/access_denied|denied|cancel/.test(e)) return "denied";
  if (/token|scope|401|bad credentials/.test(e)) return "bad_token";
  return "failed";
}

const lastLine = (s: string) =>
  s
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/one-time code|login\/device/i.test(l))
    .pop()
    ?.replace(/^(?:error|failed to authenticate via web browser):\s*/i, "")
    .slice(0, 300) ?? "";

export interface GitLoginOpts {
  run?: GhRun;
  /** The environment Ducter runs with (default process.env). */
  env?: Record<string, string | undefined>;
  timeoutMs?: number;
  codeMs?: number;
}

/** One computer's GitHub sign-in: at most one in flight; a second start answers the same code. */
export interface GitLogin {
  status(): Promise<GitLoginState>;
  /** Starts a sign-in (or answers the one in flight): its code and link, or that it is already signed in, or why not. */
  start(): Promise<GitLoginState>;
  /** The end of the sign-in in flight (signed in, failed, cancelled); with none in flight, the status. */
  wait(): Promise<GitLoginState>;
  /** Signs in with a token the person pasted (the fallback). The token goes to gh's stdin only. */
  token(token: string): Promise<GitLoginState>;
  cancel(): Promise<GitLoginState>;
}

export function createGitLogin(o: GitLoginOpts = {}): GitLogin {
  const run = o.run ?? realGhRun;
  const statusEnv = () => ghRunEnv(o.env ?? process.env, true);
  const loginEnv = () => ghRunEnv(o.env ?? process.env, false);
  let flight: { code: Promise<GitLoginState>; done: Promise<GitLoginState>; abort: AbortController } | undefined;

  async function status(): Promise<GitLoginState> {
    const r = await run(["auth", "status", "--hostname", GITHUB_HOST, "--json", "hosts"], { env: statusEnv(), timeoutMs: 20_000 });
    if (r.missing) return { state: "no_gh" };
    let account = parseStatus(r.out, r.err);
    if (!account && /unknown flag|--json/.test(r.err)) {
      // An older gh: no --json on auth status; its text says it.
      const t = await run(["auth", "status", "--hostname", GITHUB_HOST], { env: statusEnv(), timeoutMs: 20_000 });
      if (t.missing) return { state: "no_gh" };
      account = parseStatus(t.out, t.err);
    }
    return account ? { state: "signed_in", account } : { state: "signed_out" };
  }

  /** After a login: plain git asks gh for github.com's password; then who it is. */
  async function settle(): Promise<GitLoginState> {
    await run(["auth", "setup-git", "--hostname", GITHUB_HOST], { env: loginEnv(), timeoutMs: 20_000 });
    const s = await status();
    return s.state === "signed_in" ? s : { state: "failed", reason: "failed", message: "gh finished, but github.com still has no login there." };
  }

  function begin(): NonNullable<typeof flight> {
    const abort = new AbortController();
    let said = "";
    let tell: (s: GitLoginState) => void = () => {};
    const code = new Promise<GitLoginState>((r) => (tell = r));
    const codeTimer = setTimeout(() => tell({ state: "failed", reason: "failed", message: lastLine(said) || "gh didn't give a code." }), o.codeMs ?? GIT_LOGIN_CODE_MS);
    const done = (async (): Promise<GitLoginState> => {
      const r = await run(["auth", "login", "--hostname", GITHUB_HOST, "--git-protocol", "https", "--web"], {
        env: loginEnv(),
        timeoutMs: o.timeoutMs ?? GIT_LOGIN_TIMEOUT_MS,
        signal: abort.signal,
        onErr(chunk) {
          said += chunk;
          const d = parseDeviceCode(said);
          if (d.code) tell({ state: "code", code: d.code, url: d.url ?? DEVICE_URL });
        },
      });
      clearTimeout(codeTimer);
      if (r.missing) return { state: "no_gh" };
      if (abort.signal.aborted) return { state: "cancelled" };
      if (r.timedOut) return { state: "failed", reason: "expired", message: "The code expired before it was entered." };
      if (r.code !== 0) return { state: "failed", reason: loginWhy(r.err), message: lastLine(r.err) || "gh auth login failed." };
      return settle();
    })();
    // The sign-in ending before a code (gh missing, refused) answers the start too.
    void done.then((s) => tell(s));
    return { code, done, abort };
  }

  return {
    status,
    async start() {
      if (!flight) {
        const s = await status();
        if (s.state !== "signed_out") return s;
        if (!flight) {
          const f = begin();
          flight = f;
          void f.done.finally(() => {
            if (flight === f) flight = undefined;
          });
        }
      }
      return flight.code;
    },
    async wait() {
      return flight ? flight.done : status();
    },
    async token(token: string) {
      const t = String(token ?? "").trim();
      // A GitHub token is one line of letters, digits and underscores (ghp_…, github_pat_…, gho_…).
      if (!/^[A-Za-z0-9_]{20,255}$/.test(t)) return { state: "failed", reason: "bad_token", message: "That doesn't look like a GitHub token." };
      const r = await run(["auth", "login", "--hostname", GITHUB_HOST, "--git-protocol", "https", "--with-token"], { env: loginEnv(), stdin: t + "\n", timeoutMs: 60_000 });
      if (r.missing) return { state: "no_gh" };
      if (r.code !== 0) return { state: "failed", reason: loginWhy(r.err) === "network" ? "network" : "bad_token", message: lastLine(r.err) || "GitHub didn't take that token." };
      return settle();
    },
    async cancel() {
      const f = flight;
      if (!f) return status();
      f.abort.abort();
      return f.done;
    },
  };
}
