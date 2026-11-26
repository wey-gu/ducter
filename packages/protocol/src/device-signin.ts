// D599: 用一次性码登录 / Sign in with a one-time code (design/device-signin.md). A command a task
// runs for a sign-in (gh auth login, codex login --device-auth, az login --use-device-code) prints a
// page and a one-time code for the person to type there, and waits in the background until they
// approve. Before this, the task wrote both into a question's words ("请打开 https://github.com/
// login/device，输入设备码 8694-B656…完成后请回复「已授权」"): a bold title the person could neither tap
// nor copy, and a reply they had to type. Now the card carries the page, the code and when it stops
// working as fields, so every client draws Open {service} and the code with Copy, and Ducter sees the
// sign-in finish by the CLI's own status command, so nobody replies.
//
// This file holds what core, the runner and every client share: the card's fields, the CLIs whose
// own check Ducter runs (a fixed table: code guards which command runs, never the task's words), and
// the recognizer for those CLIs' printed lines, so a task that wrote them into a question still gets
// the card's shape. The recognizer reads a page address and a code token, the CLI's output format,
// never what a sentence means (principle 21).
import type { CheckSpec } from "./index.ts";

/** What a one-time-code sign-in card carries (Question.deviceSignIn, the decision's deviceSignIn). */
export interface DeviceSignInAsk {
  /** Who the person signs in to, as the card names it: "GitHub", "ChatGPT", "Microsoft". */
  service: string;
  /** The page to open (https only). */
  url: string;
  /** The one-time code to type there; absent when the page needs none (it opens signed in). */
  code?: string;
  /** ISO: when the code stops working (device codes last about 15 minutes). */
  until: string;
  /** The CLI whose own status command Ducter runs to see the person signed in; absent: the task says so. */
  cli?: DeviceCli;
}

export type DeviceCli = "gh" | "codex" | "claude" | "az" | "gcloud" | "wrangler";

/** How long a code works when the task doesn't say: GitHub's, OpenAI's and Microsoft's device codes last 15 minutes. */
export const DEVICE_CODE_MINUTES = 15;
/** How often Ducter runs the status command while a card waits. */
export const DEVICE_CHECK_MS = 5_000;

interface CliFacts {
  service: string;
  /** The status command, as a check (looked up on PATH where the task runs; a reading command, checks.ts). */
  status: CheckSpec;
  /** Pages this CLI sends the person to, by host and path start. */
  pages: { host: string; path?: string }[];
}

/**
 * The CLIs Ducter checks itself. Their status commands' exits and words are INFERRED from each CLI's
 * documentation and help, never from a real sign-in run here (none is run in tests or by hand).
 */
export const DEVICE_CLIS: Record<DeviceCli, CliFacts> = {
  gh: { service: "GitHub", status: { argv: ["gh", "auth", "status"], succeedWhen: { exitCode: 0 } }, pages: [{ host: "github.com", path: "/login/device" }] },
  codex: { service: "ChatGPT", status: { argv: ["codex", "login", "status"], succeedWhen: { exitCode: 0 } }, pages: [{ host: "auth.openai.com", path: "/codex/device" }] },
  claude: { service: "Claude", status: { argv: ["claude", "auth", "status"], succeedWhen: { path: "loggedIn", equals: true } }, pages: [{ host: "claude.ai", path: "/oauth" }, { host: "console.anthropic.com", path: "/oauth" }] },
  az: { service: "Microsoft", status: { argv: ["az", "account", "show"], succeedWhen: { exitCode: 0 } }, pages: [{ host: "microsoft.com", path: "/devicelogin" }, { host: "login.microsoft.com", path: "/device" }, { host: "login.microsoftonline.com", path: "/common/oauth2/deviceauth" }] },
  gcloud: { service: "Google Cloud", status: { argv: ["gcloud", "auth", "list", "--filter=status:ACTIVE", "--format=value(account)"], succeedWhen: { matches: "@" } }, pages: [{ host: "accounts.google.com", path: "/o/oauth2" }, { host: "google.com", path: "/device" }] },
  wrangler: { service: "Cloudflare", status: { argv: ["wrangler", "whoami"], succeedWhen: { matches: "You are logged in" } }, pages: [{ host: "dash.cloudflare.com", path: "/oauth2" }] },
};

/** The status command of a CLI, as a check spec (never one the task wrote). */
export const statusCheck = (cli: DeviceCli): CheckSpec => DEVICE_CLIS[cli].status;

/** A CLI by the name a task gave (gh, "GitHub CLI", a path ending in /gh), or undefined. */
export function cliOf(said: unknown): DeviceCli | undefined {
  const s = String(said ?? "").trim().toLowerCase();
  if (!s) return undefined;
  const base = s.split(/[\\/]/).pop()!.split(/\s+/)[0]!;
  if (base in DEVICE_CLIS) return base as DeviceCli;
  for (const [id, f] of Object.entries(DEVICE_CLIS)) if (f.service.toLowerCase() === s) return id as DeviceCli;
  return undefined;
}

const URL_RE = /https:\/\/[^\s"'<>()\[\]{}「」（），。、；！？]+/g;
/** A one-time code as these CLIs print it: groups of capitals and digits with a dash (8694-B656, ABCD-12345). */
const CODE_DASH = /(?<![A-Za-z0-9-])([A-Z0-9]{4,5}-[A-Z0-9]{4,6})(?![A-Za-z0-9-])/;
/** Microsoft's: nine capitals and digits after "code" (az login --use-device-code). */
const CODE_MS = /\bcode\s+([A-Z0-9]{8,10})\b/;

/** A page of one of the CLIs above, by host and path. */
export function pageOf(url: string): DeviceCli | undefined {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return undefined;
  }
  if (u.protocol !== "https:") return undefined;
  const host = u.hostname.replace(/^www\./, "");
  for (const [id, f] of Object.entries(DEVICE_CLIS)) if (f.pages.some((p) => (host === p.host || host.endsWith(`.${p.host}`)) && (!p.path || u.pathname.startsWith(p.path)))) return id as DeviceCli;
  return undefined;
}

/** A code token in text, as the CLIs print it (needs a digit: words like WAIT-HERE are not one). */
export function codeIn(text: string): string | undefined {
  const m = CODE_DASH.exec(text) ?? CODE_MS.exec(text);
  const c = m?.[1];
  return c && /\d/.test(c) ? c : undefined;
}

/**
 * A one-time-code sign-in in text (a question's words, a command's output): the first page of a
 * known CLI and the code beside it. Only pages in DEVICE_CLIS count; any other link stays a link.
 */
export function deviceFlowIn(text: string): { cli: DeviceCli; service: string; url: string; code?: string } | undefined {
  for (const m of text.matchAll(URL_RE)) {
    const url = m[0].replace(/[.,;:!?]+$/, "");
    const cli = pageOf(url);
    if (!cli) continue;
    const code = codeIn(text.replace(url, " "));
    return { cli, service: DEVICE_CLIS[cli].service, url, ...(code ? { code } : {}) };
  }
  return undefined;
}

/** Whether the card's code has stopped working at `now` (ms). */
export const codeExpired = (d: Pick<DeviceSignInAsk, "until">, now: number) => Date.parse(d.until) <= now;

/** Whole minutes left (at least 1 while it works, 0 once past). */
export function minutesLeft(d: Pick<DeviceSignInAsk, "until">, now: number): number {
  const ms = Date.parse(d.until) - now;
  return ms <= 0 ? 0 : Math.max(1, Math.ceil(ms / 60_000));
}

/** A service name as given, cut to a card's measure; falls back to the CLI's or the page's host. */
export function serviceName(said: unknown, cli: DeviceCli | undefined, url: string): string {
  const s = String(said ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
  if (s) return s;
  if (cli) return DEVICE_CLIS[cli].service;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

// ---------- what the task is told (English, the task's tool language) ----------

export const deviceSignedInText = (service: string) => `Signed in to ${service}: its own status command says so now. Carry on with the work that needed it; don't ask the person about it.`;
export const deviceSaidInText = (service: string) => `The person says they approved the sign-in on ${service}'s page. Check it with that CLI's own status command now: if it says signed in, carry on; if not, call sign_in_with_code again with the same page and code and end your turn.`;
export const deviceNewCodeText = (service: string) => `The code for ${service} ran out before the person approved it, and they asked for a new one. Stop the old sign-in command if it still runs, run it again in the background, and call sign_in_with_code with its new page and code.`;
