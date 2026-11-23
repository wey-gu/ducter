# 219. The same model, another route: how a second account shows itself (D503)

> Source: the installed CLIs on the author's Mac, read only: Claude Code 2.1.330 (`claude --help`,
> `claude auth --help`, `claude auth status --json`), Codex 0.171.0 (`codex --help`,
> `codex login --help`, `codex login status`); OAR 0.124.0 as Ducter pins it
> (`dist/runtimes/{claude,codex}`, `dist/contracts/login.d.ts`); Ducter's code at 0.1.27. Every
> second-account check ran with `CLAUDE_CONFIG_DIR` / `CODEX_HOME` pointed at an empty folder in the
> session scratchpad; `~/.claude` and `~/.codex` were only read. No token, key, email or org id is
> quoted here: values were printed as their type, keys of the keychain only as service names. The
> question comes from research/218 item 5 (same model, another door) on its branch.

## 1. Who is signed in, and where that lives

| Fact | Tag |
|---|---|
| `claude auth status --json` (the default output) answers `loggedIn`, `authMethod` (`claude.ai` for a plan, `api_key` for a key), `apiProvider`, `email`, `orgId`, `orgName`, `subscriptionType` / `planTier` (`pro`, `max`), `loginExpiresAt`, `configDirectory` and `projectsDirectory`. No token is in it. | VERIFIED (2.1.330, 2026-11-24) |
| With `CLAUDE_CONFIG_DIR=<empty folder>`, the same command answers `loggedIn: false`, `authMethod: none`, and names that folder as `configDirectory` and `<folder>/projects` as `projectsDirectory`, while the default folder stays signed in. A config folder is an account of its own. | VERIFIED |
| On macOS the sign-in is in the login keychain: the default folder's service is `Claude Code-credentials`; other services are `Claude Code-credentials-<8 hex>`. For `CLAUDE_CONFIG_DIR=~/.claude` (spelled out) the suffix equals the first 8 hex of SHA-256 of that path, so each folder named by `CLAUDE_CONFIG_DIR` has its own keychain item. The author's keychain holds two such suffixed items besides the default, so a second Claude sign-in already exists on this Mac, in a folder Ducter has never been told about. | VERIFIED (names and the hash match); which folder the other suffix is: unknown (the hash isn't reversible) |
| Claude Code's sessions live under the config folder (`projectsDirectory`), so a session id resumes only with the folder it was made in; another account on the same computer starts a fresh session unless the session file is carried over. | VERIFIED (the path), INFERRED (resume across folders not tried) |
| `codex login status` says `Logged in using ChatGPT` and names no account. With `CODEX_HOME=<empty folder>` it says `Not logged in` while `~/.codex` stays signed in. | VERIFIED (0.171.0) |
| `$CODEX_HOME/auth.json` holds `auth_mode`, `OPENAI_API_KEY` (null on a plan), `tokens.{id_token, access_token, refresh_token, account_id}` and `last_refresh`. The id token's claims include `email` and, under `https://api.openai.com/auth`, `chatgpt_account_id`, `chatgpt_plan_type` (`pro` here) and the subscription's dates. `tokens.account_id` names the ChatGPT account the limits belong to. | VERIFIED (claim names only); that the limit follows `account_id`: INFERRED (Codex's rate limits are per ChatGPT workspace) |
| Codex's sessions live under `$CODEX_HOME/sessions`. | VERIFIED (Ducter's `local-agents/agents.ts` reads them there) |
| OAR's `authStatus` already returns the account for both: Claude from `claude auth status --json` (`email`, `plan`, `metering: plan` for claude.ai, `credential: api_key` for a key); Codex from the app-server's `account/read` (`email`, `planType`). Ducter's `available()` reads only `kind`. | VERIFIED (OAR 0.124.0 source) |
| Ducter's own probe (`harness-probe.ts`) runs `claude auth status` and reads only `loggedIn`; for Codex it runs `codex login status` and matches its words. Neither keeps who is signed in, and a worker's hello carries the same rows, so Ducter can't tell whether two computers share one account. | VERIFIED (code at 0.1.27) |

## 2. Where a limit and its reset come from (already structured)

| Fact | Tag |
|---|---|
| Codex: a turn that fails on `usageLimitExceeded` is OAR's `failure: "quota"`, with `resetsAt` from the error's own seconds when it gives them; the app-server also pushes `account/rateLimits/updated` with each window's used percent and reset. | VERIFIED (OAR `codex/failure.js`; Ducter D297) |
| Claude Code: a `rate_limit` while its latest `rate_limit_event` says the subscription was rejected becomes `quota` with `resetsAt` (OAR `claudeLimitReset`); without one it stays `rate_limited`. | VERIFIED (OAR `claude/failure.js`) |
| Reading an account's windows without a model call: Claude's `get_usage` control query in `--safe-mode`, Codex's `account/rateLimits/read` (Ducter D288's book). Both take the same env overlay as a session, so a second config folder can be read the same way. | VERIFIED (the call takes `env`); a read against a second folder: INFERRED (not run: no second sign-in was made) |
| Ducter's text fallback (`resetFromWords`) reads only the reset time out of each agent's own fixed sentence; whether a turn was a limit is OAR's class, never Ducter's guess. | VERIFIED (code) |

## 3. What a key route means

| Fact | Tag |
|---|---|
| Ducter grants `ANTHROPIC_API_KEY` / `CLAUDE_CODE_OAUTH_TOKEN` to Claude Code and `OPENAI_API_KEY` / `CODEX_API_KEY` to Codex from its key file whenever they are there (`HARNESS_KEYS`), so a pasted key is not a second route beside a plan on the same computer today: it is the route. | VERIFIED (code) |
| Claude Code prefers a key in the environment over the stored claude.ai sign-in in print mode. | INFERRED (from its docs as remembered; not re-read here) |
| A key is paid per use (`billing: "usage"`); Ducter's rule is to say so before it costs anything. | VERIFIED (D298, `Candidate.billing`) |

## Implications for Ducter

1. **Account identity is cheap and safe to know:** both agents already say who is signed in with no
   model call. Ducter should keep a fingerprint of it (a hash, never the email) per agent per
   computer, so "the same agent on another computer" can be told apart from "the same account on
   another computer", which hits the same wall.
2. **Another computer on another account is the route that exists today** (a worker, the Mac when
   the home is a server), and Ducter can already move a task there with its brief and progress
   (D157 `moveTask`). It needs nothing from the person.
3. **A second account on the same computer is a config folder** (`CLAUDE_CONFIG_DIR`,
   `CODEX_HOME`). Ducter can't find the person's own extra folders (the keychain names are hashes),
   so the honest way is a Ducter-owned folder per extra account, signed in once through the agent's
   own login with that folder; a session resumes only inside its folder.
4. **A key never takes over by itself:** it spends money, and today it replaces the plan rather
   than standing beside it.

**Summary.** Claude Code and Codex each keep one account per config folder and say who it is
(`claude auth status --json`; Codex's `account/read` and its auth file's account id) without a
model call; their limit hits and resets are already structured through OAR. Ducter reads none of
the identity today, so it can't tell a second account from the same one. Knowing a fingerprint per
computer makes "another computer, another account" a safe automatic route now; a second account on
one computer needs a Ducter-owned folder and one sign-in; a key stays a paid route the person agrees to.
