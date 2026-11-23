# Building and running Ducter

The builder's reference behind the quickstart in the [README](../README.md): building the Mac
app, handing Ducter to a friend, every command and option, and running it on a Linux server.
The friendly version for people using Ducter is [`docs/install.md`](../docs/install.md).
People without a checkout install a release with `curl -fsSL https://ducter.ai/install.sh | sh`:
that script lives in `apps/site/public/install.sh` and must keep matching the asset names in
`.github/workflows/release.yml` (how it works and how to test it: [Releasing](release/README.md), "The one-line installer").

## Give Ducter to a friend

### The app (no terminal)

**On your Mac** (needs Bun and Go):

```sh
scripts/make-app.sh            # dist/Ducter.app and dist/Ducter-0.0.1-arm64.dmg
```

Send the `.dmg` (AirDrop, a link, a USB stick). It holds `Ducter.app` (the desktop app, with
the `ducter` CLI inside it) and an Applications shortcut, in a laid-out window: the app on its
little island, a clay arrow, Applications on the right, and one line in both languages
(`scripts/macos/dmg/background*.png` from `tools/art/dmg_background.py`; the window's
`.DS_Store` is written by `scripts/macos/dmg-layout.ts`, no Finder or GUI session needed, so CI
builds the same window). The build is for your Mac's CPU
(Apple silicon builds run only on Apple silicon).

**With an Apple Developer ID** in your keychain, `scripts/make-app.sh` signs the app with it
(hardened runtime), notarizes it with Apple, and staples the ticket, and does the same for the
`.dmg`. Notarization needs credentials, for example in the environment:

```sh
APPLE_ID=… APPLE_PASSWORD=… APPLE_TEAM_ID=… scripts/make-app.sh
```

The top of `scripts/make-app.sh` lists the other ways: a `notarytool` keychain profile
(`DUCTER_NOTARY_PROFILE`) or an App Store Connect API key. Your friend then just:

1. Double-clicks the `.dmg` and drags **Ducter** onto **Applications**.
2. Opens Ducter from Applications. macOS asks once, *"“Ducter” is an app downloaded from the
   Internet. Are you sure you want to open it?"*, and names the developer. **Open**.

No System Settings, no Open Anyway. It works offline too: the notarization ticket is stapled.

Releases are built the same way by CI: push a `v*` tag (see [release/README.md](release/README.md)).

**Without a Developer ID**, the script falls back to ad-hoc signing (`codesign -s -`, not
notarized) and the first open needs an extra step. On **macOS 15 (Sequoia)** right-click →
Open no longer gets past it: open Ducter, click **Done** on *"“Ducter” Not Opened"*, then
**System Settings → Privacy & Security → Open Anyway** (twice) and Touch ID or your password.
On macOS 14 and earlier it is right-click → Open → Open.

**What happens next, with no terminal**

| When | What they see |
|---|---|
| 0:00 | The window: "Checking this Mac…" with the sleeping clay character. The app runs `ducter doctor` itself, with the `PATH` a Terminal window would have (an app opened from Finder gets only the system folders) |
| 0:03 | **Ready Mac:** nothing to answer, or one optional line "What should I be called?" (skipped when Nowledge Mem holds the identity). **Not ready:** "One thing first", only the blocking item (e.g. "Claude Code: installed, not signed in") with its command, **Copy**, and **Run in Terminal** (Terminal opens on that one command; no permission prompt). Optional things fold into one line. It checks again by itself when they come back to the window, and every 10 s |
| 0:05 | "Waking Ducter up…" with one line: from now on Ducter keeps working when the window is closed, and Stop Ducter in the menu stops it. Then the conversation with starters about their own recent repos (names only) |
| 0:30 | They type; the partner answers (2.5 s on sonnet in our run) |
| after the first reply | Once: "Use ducter in Terminal too?" Yes links `~/.local/bin/ducter` to the app (no administrator password; never replaces a file already there; not offered while the app still runs from the disk image) |

**Ducter keeps working when the window is closed.** Closing the window hides it; the
Dock icon brings it back as it was, and the Dock badge counts what is waiting for you. Ducter
itself runs as a per-user LaunchAgent (`~/Library/LaunchAgents/co.nowledge.ducter.agent.plist`,
started at login, restarted if it crashes), so ⌘Q quits only the window app. To stop Ducter
and every task: **Ducter menu → Stop Ducter** (让 Ducter 歇着); it stays off, at login too,
until **Wake Ducter** or the next time you open the app. Run from the disk image instead of
Applications, Ducter stops with the app. If Ducter was already running (from `ducter up` in a
terminal), the app just connects and leaves it alone. Dragged in by hand over an older Ducter.app, the app restarts
the background Ducter on its own helper when it opens (`/health` says which build runs), so the
window never talks to the old one. Data lives in `~/.ducter`, as with the
CLI; Ducter's output from the app is in `~/.ducter/app.log`; the app's own lines (updates, Restart Now, quitting) are in `~/Library/Logs/co.nowledge.ducter/app.log` (one per bundle id, 1 MB, the previous kept as `app.1.log`).

**Updates.** The app checks GitHub Releases at launch and once a day, downloads and checks a
newer version in the background, and says so in one line of the app menu (and Settings): "Update
0.2.0 ready · restart to finish". It installs when you next quit, or right away with Restart
Now; Ducter in the background is restarted on the new version and carries on from the Log.
Details and a local test: [release/README.md](release/README.md#how-the-app-updates-itself-d72).

For a scratch run of the real app: `~/Library/Application Support/Ducter/dev.env` (a build with another bundle id reads
`~/Library/Application Support/<bundle id>/dev.env`) with lines
like `DUCTER_DATA_DIR=/tmp/ducter-scratch` and `DUCTER_PORT=7798` (only `DUCTER_*` keys are
read). Delete the file afterwards.

### The terminal path

**On your Mac** (needs Bun, and Go for the desktop app):

```sh
scripts/install.sh --bundle ~/Desktop/ducter-for-anna
```

You get one folder: `ducter`, `ducter-desktop`, `install.sh`, and a two-language `README.txt`.
Send it any way you like (AirDrop, a zip, a USB stick).

**On their Mac** (no build tools; they need Claude Code or Codex signed in):

1. In Terminal, type `sh ` (with the space), drag `install.sh` from the folder into the window,
   press Return. It puts two files in `~/.local/bin`, clears the download quarantine flag on
   those two only, and prints one next step.
2. Run that step: `ducter up` (or its full path, if `~/.local/bin` isn't on `PATH` yet).

**What they see in the first five minutes**

| When | What happens |
|---|---|
| 0:00 | `install.sh` says "Ducter is installed" and prints the one command to run next |
| 0:10 | First `ducter up`: a quick check of the Mac. Ready → one line ("This Mac is ready: Claude Code, Codex"). Not ready → only what blocks, each with the one command that fixes it |
| 0:15 | One optional question: "What should I be called? (Enter keeps Ducter)". Skipped when Nowledge Mem is connected, since the identity there has a name |
| 0:25 | The banner: where Ducter lives (this Mac, data in `~/.ducter`), memory, the desktop window, and how to connect another device later (`ducter pair`) |
| 0:30 | The desktop opens on the partner saying hello in its own name by the time of day, in their language, with 3–4 starters worked out on the home from what it already knows (connected mail and calendar, things noted, tasks; everyday examples for someone new; D149) |
| 1:00 | They tap a starter (it fills the box; it never sends by itself) and press Return. The partner says what it's starting (3–19 s in our two runs) and opens a task |
| ~2:00 | The task comes back done (46–52 s after sending, for "fix the failing tests" in a small repo). The first time ever, a single line with the clay character: "Your first task is done. Everything I finish comes back to you like this, with proof." Then the partner's own short result with evidence (about a minute), and Merge / Draft PR / See changes |

To start over as a brand-new user, `ducter uninstall --all` (or use a fresh `--data-dir`). Ducter's files there: `ducter.db` (the Log), `ducter.log` (its own log lines),
`persona.json` (the name they chose), `desktop.json` (whether the first result was celebrated).
`ducter up` no longer writes `firstrun.json` and removes an old one (D204). What Ducter makes for
the user to see lives in the Ducter folder, `~/ducter` (D204): `projects/` (cloned with 从 Git
地址加…) and `worktrees/` (tasks' working copies); `DUCTER_FOLDER` sets another place, and a
Ducter run with its own `--data-dir` keeps it in `<data-dir>/ducter`, so a scratch run never
touches the real `~/ducter`. `ducter uninstall --all` removes its `worktrees/`, never `projects/`.

| Command | What it does |
|---|---|
| `ducter up` | Start Ducter (and the desktop app). Ctrl-C stops everything. Runs `doctor` on first start |
| `ducter open` | Reopen the desktop app for a running Ducter |
| `ducter doctor` | Check bun, git, Claude Code, Codex, Nowledge Mem, cua-driver, the port, and the data folder |
| `ducter status` | Tasks and open decisions from the running Ducter, with finished work still waiting to be merged (`--json` for scripts). Hints repeat the `--port` / `--data-dir` given |
| `ducter merge <part of a title>` | Merge one finished task's branch into its base branch, as the app's Merge does (its worktree is then removed, the branch kept) |
| `ducter task "<words>" [--repo <dir>\|none] [--agent <name>] [--base <branch>]` | Open a task yourself (D128): your words go to it as they are, as its brief. `--repo` defaults to the current folder when it is a git repo (else one line says how to name one; `none` = no particular place); `--agent` pins who does it (`codex`, `claude-code/haiku`, `sonnet`: a harness, harness/model, or a model on the candidate list), else the top candidate; `--base` defaults to the repo's default branch. Prints `开始了：「…」· <repo> · <agent>（你选的）` and the next commands. Nothing appears in the conversation |
| `ducter say "<words>" [--timeout <s>]` | Send a user message over the client WebSocket, exactly as an app does, and print the partner's words as they arrive; ends when its turn settles (activity ends), or after `--timeout` (default 300 s, exit 1). Prints any decision it raised with its id. `--json`: `{seq, settled, replies, decisions}` |
| `ducter tail [task]` | Follow the conversation (the last dozen lines, then live), or one task's steps one line each (tools, its words, reports, state; Ducter's own MCP tools and the runner's kickoff left out). Ctrl-C stops; `--json` prints the raw events, one per line |
| `ducter answer <id \| part of the question> go\|hold\|"<reply>"` | Answer an open decision, as the app's Go / Hold / Reply do |
| `ducter open [part of a title or id]` | No argument: reopen the desktop app. With one: the connected apps show that task (`open_task` frame); with none connected, it prints where the task is and how to tail it |
| `ducter version` | Version and build |
| `ducter uninstall [--all]` | Stop and remove the background item; `--all` also removes `~/.ducter` (the Log, task working copies, browser profiles), the app's `~/.local/bin/ducter` link and the app's Library folders. `--dry-run` lists it first; repos, their `ducter/*` branches and the AI tools' logins stay. With `--data-dir <dir>` it removes that instance only: the background item only if it runs that folder, the app's folders and link only for the instance that owns them (the background item's, else `~/.ducter`). The app's **Remove Ducter** runs the same thing, then moves the app to the Trash |
| `ducter report [--include-conversation]` | A diagnostics folder (doctor, versions, the last 500 log lines with secrets removed; the conversation only when asked) and a prefilled GitHub issue link. Nothing is uploaded. The app's **Help → Report a problem…** saves it as a .zip on the Desktop |
| `ducter proactive replay [--days 1-7] [--no-web]` | What Ducter would have said by itself over the last days of your accounts, dry: a second engine on the home, nothing sent, no task, nothing in the conversation (D388) |
| `ducter proactive week [--weeks 1-12] [--json]` | What Ducter offered by itself each week (default the last 2) and what came of it, read from the home's Log: offered, opened, Go, useful, replied, held, muted, faded, still live; by where it came from and by kind; taken up ÷ offered against the one-in-twenty line; interruptions apart; the finds taken up, quoted; the weights learned now; and, once shadow passes ran, the week's cross-source findings against the detectors. Read-only (D464, D502, `connectors.md` §8.1, §4.4) |
| `ducter proactive cross [--json]` | One shadow pass now: the cheapest model over the ledger's open facts says what contradicts or endangers what; code keeps only findings that cite real facts. Logged for `proactive week`, never said to the person; counts against the day's 3 passes (D502, `connectors.md` §4.4) |
| `ducter repairs [--weeks 1-12] [--json]` | How self-repair did each week (default the last 2, UTC weeks), read from the home's Log: tasks that couldn't start or stopped without a report; how many Ducter mended by itself, how many the partner found another way for, how many reached the person; hand-overs and the hourly guard's holds; each repair tried and how often it worked; why tasks couldn't start. Read-only (D473, `self-repair.md`) |

Options: `--port` (default 7777, or `DUCTER_PORT`), `--data-dir` (default `~/.ducter`, or
`DUCTER_DATA_DIR`), `--no-desktop`, `--json`. `task`, `say`, `tail`, `answer` and `open <task>`
speak the client protocol to the running Ducter on `--port` (or the home the CLI follows, D147, below), so a lead agent can work a
scratch Ducter (`--port 7791 --data-dir <scratch>`) without anyone relaying. Messages follow your locale (`LANG`); set
`DUCTER_LOCALE=zh` or `en` to choose.

From a checkout you can also skip the install: `bun install && bun packages/cli/src/main.ts up`.

## On a server (Linux VPS)

Keep your partner awake while your Mac sleeps. On your Mac, build the Linux binaries; on the
server, install them as a service; then connect the Mac app.

```sh
# on your Mac
scripts/install.sh --linux ducter-linux            # ducter-linux/linux-x64 and linux-arm64
scp -r ducter-linux/linux-x64 you@server:ducter    # pick the server's CPU (uname -m)

# on the server
sh ducter/install.sh --service   # systemd user service on 127.0.0.1:7777; ends with what's next: `ducter tailscale` in a tailnet, else a domain, Tailscale, the tunnel
ducter doctor                    # says how to sign in Claude Code / Codex without a browser there
```

Reach it one of these ways (D265: none assumes a public IP):

- **Tailscale (a server in a tailnet, no public port):** `ducter tailscale` on the server
  (`packages/cli/src/tailscale.ts`, research/86). It reads `tailscale status --json` (Running,
  `Self.DNSName`, `CertDomains`), refuses a 443 already serving something else, runs
  `tailscale serve --bg --https=443 http://127.0.0.1:<port>`, waits for
  `https://<machine>.<tailnet>.ts.net/health`, writes `<dataDir>/public-url` and pairs.
  `--remove` runs `tailscale serve --https=443 off` when 443 is Ducter's. Tests use a fake CLI
  (`packages/cli/test/tailscale.test.ts`); not yet run on a real tailnet.
- **Your own domain:** point an A record at the server, open ports 80/443, then
  `ducter domain ducter.example.com` on the server (`packages/cli/src/domain.ts`). It checks the
  record against the server's public IP (api.ipify.org) and that nothing but Caddy holds 80/443,
  installs Caddy (apt, as root without sudo), writes a marked site block
  (`# ducter: begin` … `# ducter: end`), waits for `https://<name>/health`, writes
  `<dataDir>/public-url` and pairs. Idempotent; `--remove` takes the block out, `--print` prints
  it, `--json` for agents. `scripts/caddy-setup.sh` writes the same block from a checkout.
  Caddy gets the certificate; Ducter stays on 127.0.0.1.
- **No domain:** an SSH tunnel from your Mac, `ssh -N -L 7777:127.0.0.1:7777 you@server`, then
  the address is `http://127.0.0.1:7777`.

Keys for harness sign-ins (`CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token`,
`DEEPSEEK_API_KEY`) go in `~/.ducter/keys.env` (`KEY=value`, `chmod 600`). Ducter reads that
file and hands each key only to the harness that signs in with it; the service never loads it
into its environment (D102). The unit's `EnvironmentFile`, `~/.ducter/env`, is for non-secret
settings; a key left there by an older install moves to `keys.env` on the next start or
`service install`. Every harness process gets an allowlisted environment
(`packages/runner/src/child-env.ts`), so a key or token in the shell Ducter was started from
doesn't reach tasks either.

In the Mac app choose **My Ducter is on another machine → Connect to your Ducter** and enter
the address and the code from `ducter pair` (or paste the whole link it prints). On a phone,
open that link or scan the QR it prints (through your domain): it opens the phone web client,
pairs, and offers notifications for decisions that wait for you. Only paired
devices get in from outside the server; `ducter devices` lists them and
`ducter devices disconnect <id>` removes one. Another machine can join as a worker with
`ducter pair` on the server and `ducter worker <address> --code <code>` on the
other machine. Then say "在 vps-2 上跑…" / "run it on vps-2": the task runs there (its
worktree on that disk, its harness), and if that machine drops, the task waits and resumes when
it's back.

| Command | What it does |
|---|---|
| `ducter up --headless` | Run as a server: no window. Binds 127.0.0.1 unless `--host` says otherwise |
| `ducter service install \| uninstall \| status` | systemd user service with restart on failure; logs in `journalctl --user -u ducter`. With `--worker` on a Mac: the LaunchAgent `co.nowledge.ducter.worker` running `ducter worker` (login start, KeepAlive, `<dataDir>/worker.log`; D155) |
| `ducter pair` | One-time pairing code (10 min) for any device: address, link and QR for a phone or app, and the `ducter worker` command for another computer (D83). With no public address on a server it leads with `ducter tailscale` when the machine is in a tailnet, else Cloudflare (`ducter anywhere`), `ducter domain` with the public IP and Tailscale, then the SSH tunnel; `--json` adds `reachable`, `publicIp`, `tailnet`, `tunnel` and `steps` |
| `ducter tailscale [--remove] [--json]` | HTTPS at this machine's Tailscale name through `tailscale serve`, private to the tailnet, then a pair code (D265) |
| `ducter domain <name> [--remove \| --print \| --no-dns-check] [--json]` | HTTPS at that name with Caddy, DNS checked first, then a pair code |
| `ducter devices` | Connected devices; `disconnect <id>` removes one, `rename <id> <name>` renames one (D84) |
| `ducter worker <address> --code <code>` | Make this machine a worker of that Ducter, with the same one-time code a phone uses (D83; `service install --worker` keeps it running; `--join <address>` and `pair --worker` are hidden aliases) |
| `ducter connect <address\|pair link> --code <code>` | Make this machine's home commands go to that Ducter (D147): trades the code at `POST /pair` for the CLI's own device token, writes `<dataDir>/home.json` (0600). A loopback address (a tunnel) needs no code |
| `ducter disconnect` | Remove `home.json`: home commands go to this machine's Ducter again (the CLI device stays listed there until it's disconnected there) |

**The CLI follows the active home (D147).** Machine commands (`up`, `service`, `uninstall`,
`worker`, `doctor`, `domain`, `report`, `update` without `--all`) act on this machine. Home
commands (`status`, `say`, `task`, `tail`, `answer`, `merge`, `undo`, `open`, `pair`, `devices`,
`update --all`) go to the Ducter in `<dataDir>/home.json`
(`{address, token, name, since, deviceId?, by}`), else to `127.0.0.1:--port`. Each prints
`→ <host>` / `→ this computer` first (human mode) and carries `home` in `--json`. `--local` or
an explicit `--port` forces this machine; `--home <address>` goes elsewhere once, with the
token `home.json` holds for it (no token and not loopback: exit 1 with the exact
`ducter connect` line). Remote transport is the client WebSocket over `wss://<address>/ws` with
`Authorization: Bearer dvc.…`; a failure is diagnosed with a `GET /ws` (401 → the device was
disconnected; no answer → unreachable). `pair` asks the home for a code with the `pair_code`
frame; `devices` reads the `devices` frame (`rename` uses `rename_device`; `disconnect` only on
the home's own machine). The Mac app writes `home.json` when it connects elsewhere
(`apps/desktop/internal/remote/home.go`): over its authenticated socket it asks for a second
code and redeems it as the device **CLI on <Mac>**; at launch it re-pairs only when that token
stopped working, and leaves a `home.json` written by `ducter connect` alone. Back to this Mac,
the app removes it. `ducter doctor` adds two rows: what the CLI follows, and whether this
`ducter` is the app's helper (updates with the app) or a copy / a checkout that won't.

`DUCTER_SCRIPTED_MODEL=1 ducter up` runs with a canned model (OAR's scripted runtime) over the
real tools, for demos on a box with no AI signed in. Every reply says so.

Installers and `PATH`: as root (or with a writable `/usr/local/bin`) the bundle's `install.sh`
links `/usr/local/bin/ducter`; otherwise both installers append one block between
`# added by Ducter` and `# end of Ducter's lines` to the shell's profile (zsh, bash, fish or
`~/.profile`), once. `ducter uninstall --all` removes the link, that block, the binary
`install.sh` copied, and Ducter's Caddy site (Caddy stays). The Agent Skills in `skills/` are
copied to the site's `public/skills/` at build time (`apps/site/scripts/skills.mjs`).


## The Mac app against a demo core (developer switches)

To see a change in the real Mac app without touching `~/.ducter` or `:7777`, run a demo core on
its own port and data folder, then the app from this checkout pointed at it:

```sh
DUCTER_PORT=7983 DUCTER_DATA_DIR=/tmp/demo DEMO_LANG=zh bun apps/web/demo-apps.ts   # prints the app's id
cd apps/desktop && go build -o /tmp/ducter-desktop .
DUCTER_URL=ws://127.0.0.1:7983/ws DUCTER_DATA_DIR=/tmp/demo-mac DUCTER_NO_TITLE=1 /tmp/ducter-desktop
```

| Variable | What it does |
|---|---|
| `DUCTER_URL`, `DUCTER_TOKEN` | the home to dial (and its device token); the command line is left alone |
| `DUCTER_DATA_DIR` | the app's own data folder (hints, `desktop.json`), never `~/.ducter` |
| `DUCTER_NO_TITLE` | skip the first-launch title |
| `DUCTER_OPEN_APP=<id>` | D405: open that app's window five seconds after launch |
| `DUCTER_APP_SHOT_DIR=<dir>` | D405: write the app window's page as `mac-app-window-<id>.png` four seconds after it opens |
| `DUCTER_APP_PROBE=1` | D405, with the shot dir: run `ducter.set("probe", 1)` and a `ducter.ask` in the page and write the page's title once answered (`mac-app-probe-<id>.txt`): the bridge both ways |

## Live checks (D463)

What fakes can't prove (a real shop's pay page, a real free key's 429, Mem's real shapes, a week of
loops and offers on hel, a real microphone, an iPhone in the hand) is owed as a live check in
`design/todo.md`. Each is one entry of `ducter check`, a maintainer's command left out of `ducter
help` (English only). It ships in the binary, so it runs on hel, a worker or a bare Mac without the
repo; from a checkout, `bun packages/cli/src/main.ts check …`.

| Command | What it does |
|---|---|
| `ducter check list [--json]` | Every owed check: its Dn, what it needs from you (a device, an account, a login), where to run it, how long, whether it needs you, its last result |
| `ducter check run <name> [--<option> <value>…]` | Runs one. Automatic steps read only: the Log opened read-only, nmem's read verbs, the running home's read-only frames (`devices`, `folder_browse`, `browser_sites`; any other is refused), files you saved. A step that is yours asks for it ("now pay yourself in the live view", "talk over it while it speaks") and takes y / n / s(kip). Writes `~/.ducter/checks/YYYY-MM-DD-<name>.json` (a second run that day `-2`; `DUCTER_CHECKS_DIR` overrides): outcome and, per step, counts, field names and yes/no, never a value you typed or a message's words, passed through the report's secret filter. Exit 1 on a fail |
| `ducter check report [--json]` | The newest result per check and the line to put under its item in `design/todo.md` ("Seen live: `<file>` (pass, …)") |

Outcomes: `pass`; `fail`; `not-yet` (what it measures hasn't happened here: no limit hit in 14 days,
no worker awake, under a week of offers); `incomplete` (a step was skipped). The checks, riskiest
first:

| Check | Dn | Needs | Runs |
|---|---|---|---|
| `errand-checkout` | D436 D446 | your phone; Ducter's browser signed in to one shop with a cart | home and browser read, you ask from the phone, the 去付款 card read off the Log (host, total, items, picture), you confirm and pay yourself, the card's settling read (by you; Ducter's refused pay presses counted) |
| `pay-words` | D436 D446 | five checkout pages saved at the pay step (`--page`, repeat) | each page's controls named as the live reader names them and judged by the gate's `paysAt`; you say whether the real pay button is among the refused |
| `worker-browser` | D436 | an awake worker with Web on; your phone | finds the worker, you ask for an errand there, the card's picture read, you confirm the live view and your click |
| `first-answer` | D440 | a bare macOS account, a free key made by a person, Ducter installed | PATH has no Node or agent, you paste the key, pi found in Ducter's tools folder, you send a message, the seconds to the answer read off the Log |
| `free-key-429` | D449 | a throwaway free OpenRouter or Gemini key (`--provider`) | asks first, spends the key until the provider's 429 (OpenRouter paced under its minute cap), reads the body with `readFreeLimit` as pi passes it on; shapes only, the key never kept |
| `limit-hit` | D435 D297 D449 | a real limit hit in the last 14 days | automatic: each partner hold back at its reset (not early, within 30 min), tasks resting on a limit woke |
| `loops` | D427 D429 | a task in rounds for a day (hel) | automatic: every on-loop has its next wait armed; none ended by no one; backs and late cards counted |
| `mem-shapes` | D433 D444 D458 | nmem signed in; optional `--uri`, `--message <saved bridge open>`, `--query` | automatic: `bridge contacts`, `connections list --include-activity`, `m search`, `resources get`, a message's references, each through Ducter's own reader |
| `talk-mic` | D442 | one platform a run (`--platform`), speakers and earphones | you answer each: the gaps in zh and en, the echo guard, talking over it, a long silence, the screen, a card by voice |
| `offers-week` | D453 D458 | a week of offers (hel) | automatic: offers a morning (≤ 3), taken up (≥ 1 in 20), the wider kinds |
| `add-folder` | D455 | hel and an awake worker | automatic: the home's folders, `/` refused outside the roots, each awake worker's folders |
| `poppler` | D439 | nothing | automatic: Poppler and LibreOffice on this home |
| `ios-device` | D447 D452 D425 D431 | an iPhone with the latest build | you answer each: the keyboard, Accessibility sizes, the waiting line's motion, apps, the long-press menu |
| `mini-window` | D438 | the signed Mac app | you answer each: over a full-screen app, the keyboard kept, another Space, Stage Manager |
| `pkg-line` | D445 | a Fedora or Arch home | automatic: the pipx line against `/etc/os-release` |

Tests: `packages/cli/test/live-check.test.ts` runs every check against fakes (a clock, a Log, a
home's frames, nmem's answers, a provider's 429s, saved pages) and holds that none passes on a
computer with nothing on it.

## What a test must earn

A test stays only if deleting it lets through a real failure no other test catches, or it pins a
contract another side reads (the protocol fixtures Go and TypeScript share, redaction, the D175
tool budget and eval results, the word, link, join and binary guards, secrets and consent).
- **Ablate before adding.** Name the failure only it catches. Mutate the code it covers (flip a
  condition, drop a branch); a test that kills no mutant the others miss is a duplicate.
- **Words are checked once, for every table** (`apps/web/test/words.test.ts`): same keys and
  arguments in zh and en, no table overwritten in the merge, every key the source asks for exists,
  the Mac's mirrored tables match. A feature's test asserts a word only to pin a product rule.
- **One case per real difference**: a table, not a copy with other strings, sizes or languages.
- **Timing**: one test per user-facing budget, a quiet Mac's number stretched by the machine's
  measured slowness (`apps/web/test/slowness.ts`, `views/slowness_test.go`), never a CI constant.
