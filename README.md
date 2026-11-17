<h1 align="center">Ducter</h1>

<p align="center">
  <b>Say it once. Hear back when it's done.</b><br>
  An open-source personal AI on your own Mac or server. You talk to one partner; it runs the
  work on Claude Code, Codex, pi or DeepSeek Harness with the plans you already pay for, and
  speaks up only when something is done or needs you.
</p>

<p align="center">
  <a href="https://github.com/wey-gu/ducter/actions/workflows/ci.yml"><img src="https://github.com/wey-gu/ducter/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="License: Apache-2.0"></a>
</p>

<p align="center">
  <a href="https://ducter.ai">ducter.ai</a> ·
  <a href="https://ducter.ai/download">Download</a> ·
  <a href="docs/getting-started.md">Getting started</a> ·
  <a href="docs/README.md">Docs</a>
</p>

<p align="center">
  <img src=".github/readme/hero.webp" width="100%" alt="Ducter on a Mac and a phone. On the Mac, the conversation: you asked it to fix the flaky compaction test in HawDB; it says it's fixed, with Merge into main and its proof (50 of 50 runs pass, 412 workspace tests pass, a two-file diff). Below, a question with a default: rebase fix-ci, with Reply, Hold and Rebase. The same question is open on the phone.">
</p>

## Why Ducter

- **One partner, not a wall of sessions.** You write *"Fix the flaky compaction test in HawDB
  and tell me when it's done."* Your partner starts the task, watches it, and comes back with
  the result, its proof and **Merge into main**. You can open any task and steer it yourself.
- **Your agents, your subscriptions.** Tasks run on Claude Code, Codex, pi or DeepSeek Harness,
  signed in as you, with your own skills and settings. No Ducter account, no API key to start.
- **Your computers.** It lives on your Mac, or on a Linux server you own, at home or in the
  cloud, so it keeps working while your laptop sleeps. Lend it more computers to run tasks on.
- **Quiet until it matters.** Done comes with proof, a question comes with a default it will
  take if you don't answer, and on a quiet day you hear nothing. Reply to a task's result and
  that task carries on.
- **Open source and self-hosted.** Hosted agent workbenches come and go, and the best personal
  AIs are closed. Ducter is Apache 2.0 and runs where you put it, so nobody can wind it down
  for you ([why it exists](motivation.md)).
- **Ready the first time.** One line installs it; it sets up what's missing and greets you with
  things to start from your own folders and accounts.

## Where you use it

| | |
|---|---|
| **Mac** | The desktop app, Apple silicon. Ducter can live here and run tasks here. |
| **Linux server** | x64 or arm64, at home or in the cloud. Runs as a service and stays on. |
| **iPhone and iPad** | One app, in public beta on [TestFlight](https://testflight.apple.com/join/Z4GvWt7t). On a wide iPad, On hand stands beside the conversation. |
| **Android** | The Ducter app, from each [GitHub release](https://github.com/wey-gu/ducter/releases/latest); it updates itself, and a foldable opened like a book shows the conversation and On hand on either side of the fold. Or your phone's browser. |
| **Terminal** | The `ducter` command, on the Mac or the server. |

Away from home, a phone reaches Ducter in one of three ways: over your Tailscale network, at a
server's own domain, or at a Mac at home set up **From outside** with your domain on Cloudflare
([Your phone](docs/phone.md)).

## Get Ducter

You need [Claude Code](https://docs.anthropic.com/en/docs/claude-code) or
[Codex](https://github.com/openai/codex) signed in with your own account; if neither is there,
the Mac app installs one and walks you through signing in.

**On a Mac** (Apple silicon), paste this into Terminal. It installs the signed app and the
`ducter` command, and opens it:

```sh
curl -fsSL https://ducter.ai/install.sh | sh
```

Or download the `.dmg` from the [latest release](https://github.com/wey-gu/ducter/releases/latest).

**On a server**, run it as a service, then give it your domain (HTTPS, and a code for your Mac
and phone):

```sh
curl -fsSL https://ducter.ai/install.sh | sh -s -- --service
ducter domain ducter.example.com
```

**On iPhone or iPad**, [join the TestFlight beta](https://testflight.apple.com/join/Z4GvWt7t) and
connect with the address and code from `ducter pair`.

**With your AI agent:** ask it to *"Install the ducter-deploy skill from
github.com/wey-gu/ducter/tree/main/skills and deploy Ducter on my server."*
([For AI agents](docs/for-agents.md))

Building from source, the walkthroughs and every command: [Install](docs/install.md) and
[Getting started](docs/getting-started.md).

## What it looks like

<table>
  <tr>
    <td width="50%"><img src=".github/readme/on-hand.webp" alt="On hand: tasks in four lanes, Needs you, Working, Waiting and Done today, the open decision in its card, and two routines on the shelf below with their next runs"></td>
    <td width="50%"><img src=".github/readme/task.webp" alt="An opened task: its outcome as the headline with Merge into main, what it did step by step, and the diff of one of the two files it changed"></td>
  </tr>
  <tr>
    <td><b>On hand.</b> Every task, what's waiting for you, and your routines.</td>
    <td><b>An opened task.</b> The outcome first, then what it did and its changes.</td>
  </tr>
  <tr>
    <!-- devices.webp predates the 0.0.8 device cards; retake it from the app, don't redraw it. -->
    <td><img src=".github/readme/devices.webp" alt="Your devices: this Mac as a clay island with Ducter, Claude Code and Codex on it, and what it can do around it"></td>
    <td><img src=".github/readme/partner.webp" alt="Partner: the AI agents on this Mac, what Ducter thinks with (Claude Code, Opus), and who does the tasks"></td>
  </tr>
  <tr>
    <td><b>Your devices.</b> The computers Ducter works on, and what each one can do.</td>
    <td><b>Partner.</b> What it thinks with, and who does the tasks.</td>
  </tr>
</table>

## What you can hand it

- **Coding work.** Each task gets its own git worktree and `ducter/…` branch; merging is your call.
- **Reviews and write-ups.** "Review this week's open PRs." "Write the v0.4 release notes."
- **Things that take time.** Wait for a CI run, keep trying until the tests pass, or run every
  Monday at 9 ([Waiting and routines](docs/waiting-and-routines.md)).
- **The web.** It browses in its own Chrome; watch it from your phone and take a turn when a page
  needs you ([Your devices](docs/devices.md)).
- **Your Mac's apps, and a phone of its own.** With **Use the computer** on a Mac, a task exports
  the Keynote deck or answers the mail in that Mac's apps, in the background, with **Stop** in
  reach; password managers, banks and System Settings stay out of reach. **Use a phone** gives it
  an Android phone of its own, running on a Mac with Apple silicon, for apps that live only on a
  phone. Anything that sends, pays or deletes waits for your Go
  ([Your devices](docs/devices.md#tasks-in-your-macs-apps)).
- **Errands.** Book and buy with your saved sign-ins and cards, filled in without being seen, and
  every payment waits for your OK ([Autofill](docs/autofill.md)). A task that needs a key (a
  deploy key, an API key) asks you with a card, never in the chat, and the key stays on your own
  computer. Calls through Tuwa, after you tap Call ([Phone calls](docs/calls.md); needs a Tuwa
  account).
- **Your mail and calendar.** Say yes once, and it tells you only what needs you: a first look
  over the last two weeks, then a morning message with at most three things, and right away only
  when waiting would cost you ([Accounts it can read](docs/accounts.md)).
- **Where you already chat.** Talk to the same partner from Telegram or Slack through a bot of
  your own, or from Messages on your iPhone through your Mac
  ([Chat apps](docs/chat-apps.md), [iMessage](docs/imessage.md)).
- **What you did before.** Find any earlier task by what it did or what you said, star it, and
  carry on with it; pause and resume what runs on its own ([Past tasks](docs/past-tasks.md)).
- **What you already decided.** With [Nowledge Mem](https://mem.nowledge.co) (optional), your
  partner and its tasks share one memory with the AI tools you use elsewhere.

> **Early preview.** Expect rough edges and breaking changes. See the
> [changelog](CHANGELOG.md).

## Under the hood

For people who already run several agents at once, what makes them hold up as one partner:

- **One adapter for four agents**, through [OAR](https://github.com/botiverse/oar): clean
  sessions that still carry your own skills and settings, and a partner that can only read and
  decide on every one of them (enforced, not asked).
- **Small windows on purpose.** About 200K tokens per session; a long conversation stays coherent
  through digests and recall ([memory](design/memory.md), [context](design/context.md)).
- **One registry of facts per agent** ([`harness-facts.ts`](packages/protocol/src/harness-facts.ts),
  [readable twin](design/harnesses.md)): windows, compaction points and verified versions, which
  `ducter doctor` checks against what you have installed.
- **Budgets are tests.** Prompt and tool-list sizes fail the build when they grow, and a partner
  change carries a fresh eval result.

```mermaid
flowchart LR
  you(["You<br/>Mac, iPhone, iPad, browser, terminal"]) <-->|one connection| partner
  subgraph main["Ducter, on your Mac or your server"]
    partner["Your partner"]
    log[("The Log<br/>local SQLite")]
    partner <--> log
  end
  partner -->|task| t1["Claude Code, Codex, pi, DeepSeek Harness<br/>own worktree and branch, here or on a computer you lend it"]
  partner <-.->|memory, optional| mem[("Nowledge Mem")]
```

## Privacy and safety

Nothing lands without you: Ducter never merges, never works in your own checkout, never sees
your passwords, and never pays, sends or calls without your OK. In your Mac's apps it never opens
a password manager, a bank or System Settings. Your work reaches an AI provider only through your own agent's
login or key. A server listens on itself only, and each phone or computer connects with a
one-time code. Details: [Privacy and safety](docs/privacy-and-safety.md).

## Docs and contributing

- **Using Ducter:** [the docs](docs/README.md), starting with [Getting started](docs/getting-started.md).
- **Building Ducter:** [why it exists](motivation.md), the [principles](design/principles.md),
  the [design notes](design/README.md), [build and run](design/build-and-run.md) and the
  [roadmap](design/roadmap.md). Ducter writes its design down before its code;
  [CONTRIBUTING.md](CONTRIBUTING.md) explains how, and [SECURITY.md](SECURITY.md) how to report
  a security issue.

Ducter is made by the people behind Nowledge Mem. Once a pull request of yours is merged, mention
it and we'll send you a free lifetime Nowledge Mem license ([details](CONTRIBUTING.md)).

## License

[Apache License 2.0](LICENSE)
