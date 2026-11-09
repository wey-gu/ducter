# Building and running Ducter

The builder's reference behind the quickstart in the [README](../README.md): building the Mac
app, handing Ducter to a friend, every command and option, and running it on a Linux server.
The friendly version for people using Ducter is [`docs/install.md`](../docs/install.md).

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
CLI; Ducter's output from the app is in `~/.ducter/app.log`.

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
| 0:30 | The desktop opens on a greeting by name, in their language, with three starters about *their* Mac: the git repos they touched most recently under `~/dev`, `~/code`, `~/src`, `~/Projects`, `~/work` (names only; nothing inside is opened). No repos → everyday starters |
| 1:00 | They tap a starter (it fills the box; it never sends by itself) and press Return. The partner says what it's starting (3–19 s in our two runs) and opens a task |
| ~2:00 | The task comes back done (46–52 s after sending, for "fix the failing tests" in a small repo). The first time ever, a single line with the clay character: "Your first task is done. Everything I finish comes back to you like this, with proof." Then the partner's own short result with evidence (about a minute), and Merge / Draft PR / See changes |

To start over as a brand-new user, `ducter uninstall --all` (or use a fresh `--data-dir`). Ducter's files there: `ducter.db` (the Log), `ducter.log` (its own log lines),
`persona.json` (the name they chose), `firstrun.json` (the repo names for the starters),
`desktop.json` (whether the first result was celebrated).

| Command | What it does |
|---|---|
| `ducter up` | Start Ducter (and the desktop app). Ctrl-C stops everything. Runs `doctor` on first start |
| `ducter open` | Reopen the desktop app for a running Ducter |
| `ducter doctor` | Check bun, git, Claude Code, Codex, Nowledge Mem, cua-driver, the port, and the data folder |
| `ducter status` | Tasks and open decisions from the running Ducter (`--json` for scripts) |
| `ducter version` | Version and build |
| `ducter uninstall [--all]` | Stop and remove the background item; `--all` also removes `~/.ducter` (the Log, task working copies, browser profiles), the app's `~/.local/bin/ducter` link and the app's Library folders. `--dry-run` lists it first; repos, their `ducter/*` branches and the AI tools' logins stay. With `--data-dir <dir>` it removes that instance only: the background item only if it runs that folder, the app's folders and link only for the instance that owns them (the background item's, else `~/.ducter`). The app's **Remove Ducter** runs the same thing, then moves the app to the Trash |
| `ducter report [--include-conversation]` | A diagnostics folder (doctor, versions, the last 500 log lines with secrets removed; the conversation only when asked) and a prefilled GitHub issue link. Nothing is uploaded. The app's **Help → Report a problem…** saves it as a .zip on the Desktop |

Options: `--port` (default 7777, or `DUCTER_PORT`), `--data-dir` (default `~/.ducter`, or
`DUCTER_DATA_DIR`), `--no-desktop`. Messages follow your locale (`LANG`); set
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
sh ducter/install.sh --service   # systemd user service on 127.0.0.1:7777, then a pairing code
ducter doctor                    # says how to sign in Claude Code / Codex without a browser there
```

Reach it one of two ways:

- **Your own domain (recommended):** point a DNS record at the server, open ports 80/443, then
  `sh scripts/caddy-setup.sh ducter.example.com` on the server. Caddy gets the HTTPS
  certificate; Ducter stays on 127.0.0.1.
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
| `ducter service install \| uninstall \| status` | systemd user service with restart on failure; logs in `journalctl --user -u ducter` |
| `ducter pair` | One-time pairing code (10 min) for any device: address, link and QR for a phone or app, and the `ducter worker` command for another computer (D83) |
| `ducter devices` | Connected devices; `disconnect <id>` removes one, `rename <id> <name>` renames one (D84) |
| `ducter worker <address> --code <code>` | Make this machine a worker of that Ducter, with the same one-time code a phone uses (D83; `service install --worker` keeps it running; `--join <address>` and `pair --worker` are hidden aliases) |

`DUCTER_SCRIPTED_MODEL=1 ducter up` runs with a canned model (OAR's scripted runtime) over the
real tools, for demos on a box with no AI signed in. Every reply says so.
