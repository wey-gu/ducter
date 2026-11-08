# 29 — Ducter on a VPS: harness logins on a headless box, and the remote-access slice

Date: 2026-11-09. Inputs: `docs/design/flows/OPEN-QUESTIONS.md` Q16–Q18 (accepted in D52),
`docs/design/flows/A-setup-devices.md` A1-V / A2-W, `research/21` (remote access), `system.md`.

Legend: **[V]** verified in this session, in a local Lima VM (Ubuntu 24.04.5 LTS arm64, kernel
6.8, user-mode networking, no host mounts), with the command given. **[D]** documented by the vendor
(URL given), not exercised to completion here. **[I]** inferred.

No login was completed in the VM: completing one needs the user's browser and account. The user's
own logins were **not** copied into the VM (reasons in §3). Every flow below was run up to the point
where it waits for the human, and the rest of Ducter was exercised end to end with OAR's scripted
runtime (`DUCTER_SCRIPTED_MODEL=1`).

**Bottom line.**
1. **Claude Code** logs in on a headless box with its normal command: `claude auth login` prints a URL
   and waits at `Paste code here if prompted >`, with or without a TTY [V]. The user opens the URL on
   any device and pastes the code back [D]. Credentials land in `~/.claude/.credentials.json` (0600)
   and refresh themselves [D]. `claude setup-token` is the CI-style alternative: a one-year,
   inference-only token for `CLAUDE_CODE_OAUTH_TOKEN` [D]; its flow also starts headless [V].
2. **Codex** has a real headless flow: `codex login --device-auth` prints
   `https://auth.openai.com/codex/device` and a one-time code that expires in 15 minutes [V]. It must
   first be enabled in ChatGPT's security settings (personal) or by a workspace admin [D].
3. **Both flows are relayable** (Q17): each prints a URL (and, for Codex, a code) on stdout and either
   needs nothing back (Codex) or reads one line from stdin (Claude). Ducter can run them as child
   processes on the server and show the URL/code in the user's client; nothing needs a browser on
   the server [V for the prompts; I for the relay, not built tonight].
4. **Doctor must not trust `claude auth status` for tokens:** with any `CLAUDE_CODE_OAUTH_TOKEN`
   set, even a bogus one, it reports `loggedIn: true, authMethod: "oauth_token"`; only a real request
   fails (`401 OAuth access token is invalid`) [V]. Doctor now says "token set; checked on first use".
5. **Never copy the user's `~/.codex/auth.json` to a second machine as a habit.** ChatGPT logins
   refresh automatically [D]; with two copies, whichever machine refreshes first can leave the other
   with a stale refresh token [I: refresh-token rotation is standard OAuth practice; OpenAI's page
   doesn't discuss reuse]. Codex's own docs offer the copy as a fallback [D]; Ducter offers it last.

---

## 1. Claude Code (2.1.319) on a headless Linux box

| What | Result | Tag |
|---|---|---|
| Install without a browser | `npm install -g --prefix ~/.local @anthropic-ai/claude-code` (Node 18 from Ubuntu apt) → `claude --version` = `2.1.319` | [V] |
| Install via the official one-liner | `curl -fsSL https://claude.ai/install.sh \| bash` | [D] (not run: piping a remote script to a shell was refused in this session) |
| Fresh `claude auth status --json` | `{"loggedIn": false, "authMethod": "none", …}`, exit 1 | [V] |
| `claude auth login` with stdin closed, no TTY, no `DISPLAY` | prints `Opening browser to sign in…` / `If the browser didn't open, visit: https://claude.com/cai/oauth/authorize?…` / `Paste code here if prompted >`, then waits | [V] |
| Same under a pseudo-TTY (`script -qc`) | same three lines; the URL is an OSC-8 hyperlink | [V] |
| Completing it | "If your browser shows a login code instead of redirecting back after you sign in, paste it into the terminal at the `Paste code here if prompted` prompt." | [D] code.claude.com/docs/en/authentication |
| Where credentials live on Linux | `~/.claude/.credentials.json`, mode 0600; refreshed automatically; `/status` warns 3 days before expiry | [D] same page |
| `claude setup-token` under a pTTY | prints the welcome, "long-lived (1-year) auth token", the authorize URL, `Paste code here if prompted >` | [V] |
| What setup-token yields | a one-year OAuth token, printed once, not saved; set it as `CLAUDE_CODE_OAUTH_TOKEN`; needs a Pro/Max/Ultra/Team/Enterprise plan; model requests only (no Remote Control, no claude.ai connectors; local MCP servers still work) | [D] same page |
| Precedence | cloud provider env > `ANTHROPIC_AUTH_TOKEN` > `ANTHROPIC_API_KEY` > `apiKeyHelper` > `CLAUDE_CODE_OAUTH_TOKEN` > profiles > `/login` credentials | [D] same page |
| `auth status` with a bogus `CLAUDE_CODE_OAUTH_TOKEN` | `{"loggedIn": true, "authMethod": "oauth_token", …}` | [V] |
| A request with that bogus token | `claude -p hi` → `Failed to authenticate. API Error: 401 OAuth access token is invalid.` (no tokens spent) | [V] |
| Copying the Mac's login | On macOS the login is in the Keychain, not a file (only falls back to the file when the Keychain refuses the write) | [D] |

**Recommendation for Ducter on a server:** `claude auth login` (refreshing, full-featured) is the
default fix in `ducter doctor`. `claude setup-token` + `CLAUDE_CODE_OAUTH_TOKEN` in `~/.ducter/env`
(the service's `EnvironmentFile`, 0600) is the fallback for people who already have a token, e.g.
from CI. Neither needs a browser on the server.

## 2. Codex CLI (0.167.0) on a headless Linux box

| What | Result | Tag |
|---|---|---|
| Install | `npm install -g --prefix ~/.local @openai/codex` → `codex-cli 0.167.0`; Homebrew (the Mac fix) doesn't exist on a stock server | [V] |
| Fresh `codex login status` | `Not logged in` | [V] |
| `codex login --device-auth` (no TTY) | `1. Open this link in your browser and sign in to your account https://auth.openai.com/codex/device` / `2. Enter this one-time code (expires in 15 minutes)` + a code / a warning to continue only if you started the login | [V] (the code was left to expire unused) |
| Prerequisite | "Enable device code login in your ChatGPT security settings (personal account)", or a workspace admin enables it | [D] learn.chatgpt.com/docs/auth (redirect target of developers.openai.com/codex/auth) |
| Plain `codex login` on a headless box | starts `http://localhost:1455` (listening on 127.0.0.1:1455 [V]), prints the authorize URL, and itself suggests `codex login --device-auth` | [V] |
| SSH alternative | `ssh -L 1455:localhost:1455 user@remote`, then `codex login` there and open the URL locally | [D] |
| Copy alternative | run `codex login` where a browser exists, copy `~/.codex/auth.json` to the server; "Treat `~/.codex/auth.json` like a password" | [D] |
| API key | `printenv OPENAI_API_KEY \| codex login --with-api-key` (billed at API rates) | [D] |
| Refresh | "Codex refreshes tokens automatically during use before they expire" | [D] |

**Recommendation:** `codex login --device-auth` is the default fix; if it says device login is
disabled, the next line is the SSH port-forward variant. The copy is last, with the warning above.

## 3. Why the user's logins were not used in the VM

- The Mac's Claude login lives in the Keychain [D]; extracting it would touch the user's Keychain
  while they sleep, and the result is a refreshing credential that two machines would then share.
- The Mac's `~/.codex/auth.json` holds a ChatGPT login last refreshed 8 days before this session
  (the file's `last_refresh`; no token was read or printed). A VM copy would likely refresh on first
  use and could invalidate the Mac's copy [I]. Logging the user out of Codex on their Mac overnight
  is a real cost; the task allowed this only if it exposes nothing, and the risk is to the login, not
  exposure, so it was skipped.
- No API key was present in the environment.

So the model was replaced, not the plumbing: OAR's `scriptedRuntime` ("for hosts' tests and demos
that need a real Session … without a binary, a login or a provider") runs the partner and the tasks,
and its script calls Ducter's real MCP tools over HTTP (`task_open`, `report_to_main`). Everything
from the client socket through the partner, runner, MCP hub, task, report and back is the production
path [V].

## 4. What else was verified in the VM (server mode, D54)

All with the compiled `ducter` (bun 1.4.4, `linux-arm64`, cross-built on the Mac with
`DUCTER_TARGET=bun-linux-arm64`), installed from the bundle `scripts/install.sh --linux DIR` makes.

| Check | Result | Tag |
|---|---|---|
| `ducter doctor` | "Checking this server for Ducter": headless fix lines for Claude and Codex, `Keeps running` and `Connected devices` rows | [V] |
| `sh ducter/install.sh --service` → `ducter service install` | writes `~/.config/systemd/user/ducter.service` (`Restart=on-failure`, `EnvironmentFile=-~/.ducter/env`), enables it, waits for `/health`, prints the pairing code + QR | [V] |
| Linger without sudo | with `Linger=no` first (Lima turns it on by default), `loginctl enable-linger <self>` from the SSH session succeeded on Ubuntu 24.04 (polkit allows it for an active session) | [V] |
| journald | the doctor report and the "running on lima-ducter-vps" banner are in `journalctl --user -u ducter` | [V] |
| Bind | `127.0.0.1:7777` only by default (`ss -ltn`) | [V] |
| Through Caddy (`reverse_proxy 127.0.0.1:7777`, Ubuntu's caddy 2.6.2, plain HTTP on :8080 since a local VM has no public domain) | no token: `/ws` 401, `/mcp` 401, `/health` 200 `{"ok":true}` only | [V] |
| Pairing through Caddy | code → `POST /pair` 200 + token; the same code again → 401; token → WS 101; `ducter devices disconnect <id>` → 401 | [V] |
| `devices.db` | mode 600; only SHA-256 hashes of codes and tokens (unit test reads the bytes) | [V] |
| Desktop path | from the Mac, over `ssh -L 7781:127.0.0.1:8080`: `remote.Pair` → token → the desktop's client and views: a chat turn and a task that reports done (`TestRemoteDucter`, screenshots `apps/desktop/docs/remote-*.png`) | [V] |
| SSH-tunnel fallback | `ssh -N -L 7782:127.0.0.1:7777` → loopback → no token needed; same conversation and task | [V] |
| `systemctl --user restart ducter` | new PID, same data (headSeq kept), the saved device token still works | [V] |
| SIGKILL | `NRestarts=1`, active again within RestartSec=3 | [V] |
| VM reboot (`limactl stop/start`) | service active at boot (PID 811) before any login, saved token still works | [V] |
| TLS on a real domain | `scripts/caddy-setup.sh` (DNS check, official Caddy apt repo, site block, reload, `/health` probe, `~/.ducter/public-url`) | [I] syntax-checked and shellchecked only; needs a domain |
| x64 build | `DUCTER_TARGET=bun-linux-x64` builds an x86-64 ELF | [V] build only; not run |

## Implications for Ducter

- `ducter doctor` on Linux offers `claude auth login` and `codex login --device-auth` (done), and
  treats `authMethod: oauth_token` as unverified (done).
- The A1-V "Connect" button (Q17) is feasible without new vendor features: spawn the CLI, scrape the
  URL/code, relay a pasted code to stdin for Claude. Build it into the browser setup page when that
  page exists; until then the terminal commands are the path.
- Prefer refreshing logins on the server over copied files or long-lived tokens; document the copy
  only as a fallback with its risk.
- Keep the scripted runtime mode (`DUCTER_SCRIPTED_MODEL=1`) as the demo and e2e default for any
  box without a login.

**Summary.** On a headless Linux box both harnesses log in with their own commands, no server
browser needed: Claude Code via `claude auth login` (paste the code back) or `claude setup-token`;
Codex via `codex login --device-auth` (enable device login first). Both were run up to the human
step in a Ubuntu 24.04 VM; completing them needs the user. Everything else in server mode
(systemd user service, linger, journald, restart and reboot survival, pairing, token gate behind
Caddy, SSH-tunnel fallback, desktop chat and task) was verified end to end with OAR's scripted
runtime in place of a model.
