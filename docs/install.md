# Installing and running Ducter

This page has the full details behind the quickstart in the [README](../README.md): building
the Mac app, handing Ducter to a friend, the commands, and running it on a Linux server.

## Give Ducter to a friend

### The app (no terminal)

**On your Mac** (needs Bun and Go):

```sh
scripts/make-app.sh            # dist/Ducter.app and dist/Ducter-0.0.1-arm64.dmg
```

Send the `.dmg` (AirDrop, a link, a USB stick). It holds `Ducter.app` (the desktop app, with
the `ducter` CLI inside it) and an Applications shortcut. The build is for your Mac's CPU
(Apple silicon builds run only on Apple silicon).

**The app is not signed by Apple.** It is signed ad hoc (`codesign -s -`), not with a
Developer ID, and not notarized. So the first open needs one extra step. On **macOS 15
(Sequoia)** right-click → Open no longer gets past this; the way through is System Settings:

1. Double-click the `.dmg`, drag **Ducter** onto **Applications**, then open Ducter from
   Applications.
2. macOS says **"“Ducter” Not Opened"**: *"Apple could not verify “Ducter” is free of malware
   that may harm your Mac or compromise your privacy."* Buttons: **Done** and **Move to
   Trash**. Click **Done**.
3. Open **System Settings → Privacy & Security** and scroll down to Security. It says
   *"“Ducter” was blocked to protect your Mac."* Click **Open Anyway**, then **Open Anyway**
   again in the dialog that follows, and confirm with Touch ID or your password.
4. Ducter opens. From then on it opens like any app.

(On macOS 14 and earlier, steps 2 and 3 are simply right-click → Open → Open.)

**What happens next, with no terminal**

| When | What they see |
|---|---|
| 0:00 | The window: "Checking this Mac…" with the sleeping clay character. The app runs `ducter doctor` itself, with the `PATH` a Terminal window would have (an app opened from Finder gets only the system folders) |
| 0:03 | **Ready Mac:** nothing to answer, or one optional line "What should I be called?" (skipped when Nowledge Mem holds the identity). **Not ready:** "One thing first", only the blocking item (e.g. "Claude Code: installed, not signed in") with its command, **Copy**, and **Run in Terminal** (Terminal opens on that one command; no permission prompt). Optional things fold into one line. It checks again by itself when they come back to the window, and every 10 s |
| 0:05 | "Waking Ducter up…", then the conversation with starters about their own recent repos (names only) |
| 0:30 | They type; the partner answers (2.5 s on sonnet in our run) |
| after the first reply | Once: "Use ducter in Terminal too?" Yes links `~/.local/bin/ducter` to the app (no administrator password; never replaces a file already there; not offered while the app still runs from the disk image) |

Ducter runs as long as the app is open: quitting (⌘Q), closing the window, or a force quit
stops it. If Ducter was already running (from `ducter up` in a terminal), the app just
connects and leaves it running when it quits. Data lives in `~/.ducter`, as with the CLI; the
app's own child log is `~/.ducter/app.log`.

For a scratch run of the real app: `~/Library/Application Support/Ducter/dev.env` with lines
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

To start over as a brand-new user, stop Ducter and remove `~/.ducter` (or use a fresh
`--data-dir`). Ducter's files there: `ducter.db` (the Log), `ducter.log` (its own log lines),
`persona.json` (the name they chose), `firstrun.json` (the repo names for the starters),
`desktop.json` (whether the first result was celebrated).

| Command | What it does |
|---|---|
| `ducter up` | Start Ducter (and the desktop app). Ctrl-C stops everything. Runs `doctor` on first start |
| `ducter open` | Reopen the desktop app for a running Ducter |
| `ducter doctor` | Check bun, git, Claude Code, Codex, Nowledge Mem, cua-driver, the port, and the data folder |
| `ducter status` | Tasks and open decisions from the running Ducter (`--json` for scripts) |
| `ducter version` | Version and build |

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

In the Mac app choose **My Ducter is on another machine → Connect to your Ducter** and enter
the address and the code from `ducter pair` (or paste the whole link it prints). On a phone,
open that link or scan the QR it prints (through your domain): it opens the phone web client,
pairs, and offers notifications for decisions that wait for you. Only paired
devices get in from outside the server; `ducter devices` lists them and
`ducter devices disconnect <id>` removes one. Another machine can join as a worker with
`ducter pair --worker` on the server and `ducter worker --join <address> --code <code>` on the
other machine. Then say "在 vps-2 上跑…" / "run it on vps-2": the task runs there (its
worktree on that disk, its harness), and if that machine drops, the task waits and resumes when
it's back.

| Command | What it does |
|---|---|
| `ducter up --headless` | Run as a server: no window. Binds 127.0.0.1 unless `--host` says otherwise |
| `ducter service install \| uninstall \| status` | systemd user service with restart on failure; logs in `journalctl --user -u ducter` |
| `ducter pair` | One-time pairing code (10 min), address, link and QR |
| `ducter devices` | Connected devices; `disconnect <id>` removes one |
| `ducter worker --join <address> --code <code>` | Make this machine a worker of that Ducter (`service install --worker` keeps it running) |

`DUCTER_SCRIPTED_MODEL=1 ducter up` runs with a canned model (OAR's scripted runtime) over the
real tools, for demos on a box with no AI signed in. Every reply says so.
