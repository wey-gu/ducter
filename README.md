# Ducter

Ducter is a personal AI you run yourself: you talk to one partner, and it hands the real work to
Claude Code or Codex on your own machines, using the AI plans you already pay for. It reports back
when something is done, with proof, and only asks for your attention when a decision is truly
yours, while every task stays open for you to look into and steer whenever you want.

<p>
  <img src="apps/desktop/docs/conversation.png" width="49%" alt="The conversation: the partner acknowledges a request, starts a task, and shows one decision with Go, Hold, and Reply">
  <img src="apps/desktop/docs/onhand.png" width="49%" alt="On hand: every task in four lanes, Needs you, Working, Waiting, and Done today">
</p>
<p>
  <img src="apps/desktop/docs/task.png" width="49%" alt="An opened task: its transcript, diff, and a composer to talk to it directly">
  <img src="apps/desktop/docs/task-done.png" width="49%" alt="A finished task: transcript with checkpoints, the diff, why this AI was picked, and the evidence">
</p>

## Quickstart (macOS)

You need [Bun](https://bun.sh) to build, and at least one of Claude Code or Codex logged in.
Go is optional; it builds the desktop app.

```sh
git clone https://github.com/wey-gu/ducter && cd ducter
scripts/install.sh      # builds `ducter` (and the desktop app if Go is present) into ~/.local/bin
ducter doctor           # checks this Mac; every missing item comes with the one command that fixes it
ducter up               # starts your partner and opens the desktop app
```

Then type your first message, for example:

> Fix the flaky test in ~/dev/foo, then tell me.

Your partner replies, opens a task for the work, and comes back
when it's done or when it needs you. `ducter status` shows the same from a terminal.

`install.sh` never edits your shell profile. If `~/.local/bin` isn't on your `PATH`, it prints the
line to add.

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
the address and the code from `ducter pair` (or paste the whole link it prints). Only paired
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

## How it works

- **One partner.** You only talk to your partner (named Ducter unless you rename it). It runs
  on Claude Code as its loop, with Ducter's own tools and persona. Quick questions it answers
  itself; bigger work becomes a task.
- **Tasks run on real harnesses.** Each task is a Claude Code or Codex session, started through
  [OAR](https://github.com/botiverse/oar), in its own git worktree on a `ducter/<slug>` branch.
  Tasks report back with a summary, evidence (tests, diffs), and questions that carry a default,
  so a quiet task means things are going fine.
- **The Log.** Everything (your messages, replies, task events, reports, decisions) is appended
  to one local SQLite log in your data folder. The conversation, On hand, and each task's view
  are all read from it, so nothing is lost when a session ends.
- **Memory in Nowledge Mem.** If [Nowledge Mem](https://mem.nowledge.co) is set up, your partner
  starts with the identity and context you already keep there, shared with every other AI you
  use. Without it, it starts with a default identity.
- **Clients.** The main process listens on `127.0.0.1` only. The desktop app is a native
  [MyGo](https://github.com/egoist/mygo) UI that talks to it over one WebSocket.

The why and the design live in [`motivation.md`](motivation.md), [`docs/principles.md`](docs/principles.md),
and [`docs/design/`](docs/design/). The plan is in [`docs/roadmap.md`](docs/roadmap.md).

## Status

Early, private preview. Expect rough edges: one persona, one
device, macOS only for now; phone access, remote workers, routines, and browser tasks are on the
[roadmap](docs/roadmap.md). Want to help? See [CONTRIBUTING.md](CONTRIBUTING.md).
