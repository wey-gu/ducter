# 130: A computer added for tasks, and its AI agents (D359)

The author lent a Linux box (haswell) with the one-line installer on 0.0.77. Its card showed only a
greyed pi and 再登录一个; Codex installed there by hand afterwards (`~/.local/bin/codex`, a normal
user, the worker as a systemd user service) never showed. This run found why, built D359 (Ducter
installs the agents itself, finds the person's own, and carries each agent's sign-in to wherever
the person is), and walked the fresh path live.

Tags: **VERIFIED** (run here and seen), **INFERRED** (from code or one run only), **NOT RUN**.

## Setup

| | |
|---|---|
| Date | 2026-11-18, 14:00–15:30 (Asia/Shanghai) |
| Home | this branch from a worktree, `ducter up --headless` with `DUCTER_HOST=0.0.0.0`, `DUCTER_PORT=7801`, a data folder in the session scratchpad, `DUCTER_MEMORY=off`, `NMEM_CLI_PATH` at a refusing shim, `DUCTER_PUSH_RELAY=off`, `DUCTER_BROWSER=0`, `DUCTER_IMESSAGE=off`, `DUCTER_SCRIPTED_MODEL=1` (no model). Never `~/.ducter`, :7777, hel or haswell |
| VMs | colima 0.10.3 `--vm-type vz`, Ubuntu 24.04 aarch64, a normal user with linger. `ducter-agents-check` (first 0.0.77 from the real release, then this branch's build); `ducter-agents-fresh` (nothing but curl: no node, codex, claude or pi). Both deleted afterwards |
| The line | the real `https://ducter.ai/install.sh` in worker mode, with `DUCTER_DOWNLOAD_BASE` pointing at a scratch mirror of this branch's linux-arm64 build (Bun 1.4.4) |
| Clients | a 20-line WebSocket client (`devices`, `lend_code`, `agent_setup`); the web app in headless Chrome with a scratch profile; the Mac views through MyGo's tester |
| Accounts | none signed in. Sign-ins were started up to their link and code, and Claude's was fed a made-up code |

## Root causes (0.0.77)

| # | Cause | How it was seen |
|---|---|---|
| R1 | A worker probed its agents only at its welcome and every 30 minutes | **VERIFIED**: Codex installed with its own installer into `~/.local/bin` at 14:08 on the 0.0.77 worker; the card still said not installed a minute later; after `systemctl --user restart ducter` it said installed (0.170.0), not signed in. haswell's Codex is the same case |
| R2 | The service's PATH is the install shell's plus `~/.local/bin` and `~/.bun/bin` | **VERIFIED** (the unit's `Environment=PATH=`); nvm, fnm, a custom npm prefix and Linuxbrew were never looked in. `~/.local/bin` was on it, so haswell was R1, not R2 |
| R3 | `Bun.which` reads the PATH the process started with | **VERIFIED** on Bun 1.4.4: after `process.env.PATH = "/usr/bin:/bin"`, `Bun.which("bun")` still found `~/.bun/bin/bun`, while `child_process` followed the new PATH. Any widening must be passed (`whichNow`) |
| R4 | pi counted as installed when `node` was on PATH | **INFERRED** from code and the author's card: the single binary runs only a `pi` command (runner `oar.ts`), so a server with node showed a pi that couldn't run, greyed |
| R5 | Ducter installed no agent anywhere, and signing in was "on that computer itself" | by design until now (D161's 登录和退出在 {device} 上做) |

## What was built (D359)

- **Finding** (`core/agent-path.ts`): the worker's PATH widened at start and on every probe: the
  login shell's PATH (`$SHELL -lic`, captured at service install and at each start, kept in
  `<data>/login-path`), the usual per-user folders, then `<data>/tools/node/bin` and
  `<data>/tools/bin`. The service unit gets the login PATH too.
- **Looking again**: a fingerprint every 5 s (each agent command's path and time, the sign-in
  files' times; no process), a real probe when it moves; at the welcome, every 30 min, and on
  `agent_setup` `look`, which a device card sends when it opens.
- **Installing** (`core/agent-setup.ts`): Node.js 24.22.3 (SHA-256 pinned per platform) into
  `<data>/tools/node`, then `npm install -g --prefix <that>` of each agent at harness-facts'
  `verified.to` (Codex 0.169.1, Claude Code 2.1.322, pi 1.5.1), one at a time; the first shows
  Node's download as its percentage.
- **Signing in**: `codex login --device-auth` and `claude auth login` spawned there with pipes,
  their link and code parsed from the output and sent up in the agent's row; Claude's pasted code
  written to its stdin; pi says what to run there.
- **Where**: the lend sheet's last step and every device card, web and Mac, the same rows.

## Steps

| # | Step | Result | Timing |
|---|---|---|---|
| 1 | Fresh VM: `command -v node codex claude pi` | none | |
| 2 | Paste the line from the web sheet | **VERIFIED**: installed, joined, user service active; the sheet went to **… is here** and asked **Which AIs should it have?** with Codex and Claude Code checked, pi not (`web-1400-en-02-which.png`) | paste to the question ≈ 15 s |
| 3 | Install | **VERIFIED**: Codex `installing`, Claude Code `queued` at once; Node's 50 MB download (~8 min at ~120 KB/s from nodejs.org on this network), then npm; Codex arrived as a coin with 登录 at 14:56:49 (0.169.1), Claude Code at 15:03:02 (2.1.322), each "installed by npm" under `<data>/tools/node` (`web-1400-en-03-installing.png`, `web-1400-en-04-codex-arrived.png`). The card then offered an update to the latest (0.170.0, 2.1.327): the pins are the verified versions, D156 does the rest | 14:39:59 → 15:03:02 (23 min, the network) |
| 4 | Sign in, Codex | **VERIFIED**: within 1.5 s of 登录, the row showed `https://auth.openai.com/codex/device` and a one-time code (VM 1); on the fresh VM, Sign in on the sheet showed the link, the code, Copy code, Open link and Cancel within 3 s, while Claude Code was still going in (`web-1400-en-05-codex-signin.png`) | 1.5–3 s |
| 5 | Sign in, Claude Code | **VERIFIED**: within 0.1 s, its `claude.com/cai/oauth/authorize…` link and a paste box; a made-up code answered `Invalid code` and the row asked again (`wrong_code`) | 0.1 s |
| 6 | Codex by hand in `~/.local/bin` (haswell's case) on this build | **VERIFIED**: the link moved aside, the card said not installed 3.3 s later; moved back, installed 1.0 s later, no restart | 1–3.5 s |
| 7 | Codex by hand under nvm (`nvm install 22`, `npm i -g @openai/codex@0.169.1`; `~/.local/bin/codex` moved aside first) | **VERIFIED**: the card said Codex 0.169.1 installed, not signed in, with no restart; the nvm folder came from the usual-places scan (the login PATH had been captured before nvm existed). Moving that copy aside and back: not installed 0.9 s later, installed again 1.4 s later | 0.9–1.4 s |
| 8 | Install on a computer already holding Codex (VM 1: Claude Code and pi) | **VERIFIED**: both installed into `<data>/tools/node` (2.1.322, 1.5.1), Codex left as it was | ≈ 5 min, Node's 50 MB at ~120 KB/s most of it |
| 9 | A real sign-in to the end, then a task there | **NOT RUN** (no account is signed in from this run) | |

## Findings

- **F1. The wait is Node's download.** On this network (≈120 KB/s from nodejs.org) the first agent
  sat at 正在装上… for minutes with no sign of life; the row now shows Node's download as a
  percentage. All three agents take about 700 MB in `<data>/tools` (Node and Claude Code's native
  build most of it): todo.
- **F2. `claude auth login` works without a terminal** (2.1.322): it prints the link and
  `Paste code here if prompted >`, reads a line from stdin, and answers a wrong code with
  `Invalid code. Please make sure the full code was copied.` and waits again. **VERIFIED**.
- **F3. `codex login --device-auth` needs no terminal either**; it prints the link and a code that
  lasts 15 minutes. Whether the account has device sign-in on is only known after the person
  tries; the row says how to turn it on when Codex says so (from Codex's wording, **INFERRED**).
- **F4. The lend sheet showed two button rows** (Later and Install, then Rename and Done) while it
  asked; Rename and Done now wait until the question is answered.
- **F5. An agent installed under another user than the service's is not found** (a root system
  worker and a person's `~/.npm-global`): **INFERRED**, todo.

## Implications for Ducter

- A worker's view of its agents must follow the computer, not the moment it joined: a cheap
  fingerprint and a real probe on change, not a timer measured in half-hours.
- Anything a service looks up on PATH must be looked up with the PATH it has now (`whichNow`).
- A bare server can be made ready from the app alone; the slow part is the network, so it must
  show progress.
- Sign-ins that a terminal used to own (device code, link and paste) carry well to any window.

**Summary:** haswell's Codex was invisible because a worker looked at its agents only at its
start and every 30 minutes; nvm-style installs were also never on its PATH, Bun's `which` ignored a
widened PATH, and pi showed whenever node did. D359 widens and re-checks the PATH within seconds,
installs Codex, Claude Code and pi into Ducter's own folder (pinned Node, verified versions, no
sudo), and carries Codex's device code and Claude's link and pasted code to the sheet and every
device card, on the web and the Mac. Walked live on a fresh Ubuntu VM with nothing but curl, up
to each sign-in's link and code; no account was signed in.
