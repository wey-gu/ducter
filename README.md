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
line to add. To share Ducter with a friend on another Mac, run `scripts/install.sh --bundle
ducter-bundle` and hand them the folder; on their Mac, `sh install.sh` installs it with no build
tools.

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
`ducter pair --worker` on the server and `ducter worker --join <address> --code <code>` there
(it connects and shows as awake; running tasks on it comes next).

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
