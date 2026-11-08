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
| 0:25 | The banner: where Ducter lives (this Mac, data in `~/.ducter`), memory, the desktop window. Phone and other computers can't connect yet, and it says so |
| 0:30 | The desktop opens on a greeting by name, in their language, with three starters about *their* Mac: the git repos they touched most recently under `~/dev`, `~/code`, `~/src`, `~/Projects`, `~/work` (names only; nothing inside is opened). No repos → everyday starters |
| 1:00 | They tap a starter (it fills the box; it never sends by itself) and press Return. The partner says what it's starting (19 s in our run, a cold start) and opens a task |
| ~2:00 | The task comes back done (52 s after sending, for "fix the failing tests" in a small repo). The first time ever, a single line with the clay character: "Your first task is done. Everything I finish comes back to you like this, with proof." Then the partner's own short result with evidence (58 s), and Merge / Draft PR / See changes |

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
