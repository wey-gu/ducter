<h1 align="center">Ducter</h1>

<p align="center">
  <b>One partner for your real work, running on your own machines.</b><br>
  You say what you want. It hands the work to Claude Code or Codex, on the plans you already
  pay for, and comes back when it's done, with how it checked.
</p>

<p align="center">
  <a href="https://github.com/wey-gu/ducter/actions/workflows/ci.yml"><img src="https://github.com/wey-gu/ducter/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="License: Apache-2.0"></a>
</p>

<p align="center">
  <a href="https://ducter.ai">ducter.ai</a> ·
  <a href="docs/getting-started.md">Getting started</a> ·
  <a href="docs/README.md">Docs</a> ·
  <a href="#中文">中文</a>
</p>

<p align="center">
  <img src=".github/readme/hero.webp" width="100%" alt="Ducter on a Mac and a phone. On the Mac, a finished task: the flaky compaction test is fixed, with How I know (50 of 50 runs pass, 412 workspace tests pass, a two-file diff) and Merge into main. Below it, a question with a default: rebase fix-ci, with Go, Hold and Reply. The same question is open on the phone.">
</p>

## What it feels like

You write to Ducter the way you'd write to a colleague: *"Fix the flaky compaction test in
HawDB and tell me when it's done."* It says it's on it, and then it's quiet. The work happens
in the background, on your Mac or a server you own, in a separate copy of your project.

When it's done, it tells you what it did in a line or two, shows **how it knows** (the tests
it ran, the diff), and waits for you to **Merge into main**. When it needs you, it asks one
plain question with a default, *"Rebase it? If you don't answer, I'll rebase in 29 min,"* and
you press **Go**, **Hold**, or reply in your own words, on the Mac or on your phone.

Silence means it's going fine. Everything it's doing is one click away whenever you want to
look.

## What you can do today

- **Hand off coding work.** "Fix the failing tests in my-app." "Upgrade OAR to 0.96 and fix
  what breaks." Each task gets its own git worktree and `ducter/…` branch; merging is your
  call.
- **Ask for reviews and write-ups.** "Review this week's open PRs." "Write the v0.4 release
  notes once CI is green." A task can wait for something and pick up again by itself.
- **Look things up on the web.** On a Mac, Ducter reads pages in its own Chrome window, separate
  from yours. Logins, forms and payments stay with you.
- **Answer from your phone.** Decisions arrive with the default already chosen, and your nights
  stay quiet.
- **Keep it working while your Mac sleeps.** Run Ducter on a Linux server, and lend it other
  machines to work on.
- **Use what you already have.** Your Claude Code or Codex login, settings and skills, and, if
  you use [Nowledge Mem](https://mem.nowledge.co), the memory your other AI tools share.
  English and 中文 throughout.

<table>
  <tr>
    <td width="50%"><img src=".github/readme/on-hand.webp" alt="On hand: every task in four lanes, Needs you, Working, Waiting and Done today, with the open decision in its card"></td>
    <td width="50%"><img src=".github/readme/task.webp" alt="An opened task: what it did step by step, the diff of the two files it changed, and How I know"></td>
  </tr>
  <tr>
    <td><b>On hand.</b> Every task at a glance, and what is waiting for you.</td>
    <td><b>An opened task.</b> What it did, its changes, and a box to talk to it directly.</td>
  </tr>
</table>

<table>
  <tr>
    <td width="64%"><img src=".github/readme/devices.webp" alt="Your devices and what they can do: this Mac on its stage with what it can do around it, and Claude Code and Codex signed in"></td>
    <td width="36%"><img src=".github/readme/phone-decision.webp" alt="Ducter on a phone with a decision open: Rebase it? with Go, Hold and Reply"></td>
  </tr>
  <tr>
    <td><b>Your devices.</b> The computers Ducter works on, and what each one can do.</td>
    <td><b>Your phone.</b> The same decisions, wherever you are.</td>
  </tr>
</table>

> **Early preview.** Ducter works end to end on a Mac and on a Linux server. Expect rough edges
> and breaking changes. The desktop app is macOS (Apple silicon) only;
> the phone version runs in your phone's browser, and an iPhone app is coming.

## Get Ducter

Ducter works through [Claude Code](https://docs.anthropic.com/en/docs/claude-code) or
[Codex](https://github.com/openai/codex), with your own account. If neither is on your Mac yet,
the app installs it and walks you through signing in.

### Download the Mac app

Signed and notarized builds will be on
[GitHub Releases](https://github.com/wey-gu/ducter/releases). The first release is on its way;
until then, build the app from source (below).

Open the `.dmg`, drag **Ducter** to **Applications**, and open it. It checks your Mac, sets up
what's missing without a Terminal, and opens the conversation. Closing the window doesn't stop
it; **Stop Ducter** in the menu does. [Getting started](docs/getting-started.md) walks you
through the first five minutes.

### Build from source

With [Bun](https://bun.sh) and [Go](https://go.dev) installed:

```sh
git clone https://github.com/wey-gu/ducter && cd ducter
scripts/make-app.sh        # dist/Ducter.app and a .dmg
```

Without a Developer ID the app is signed ad hoc, so macOS needs one extra step the first time
([what to do](docs/troubleshooting.md#ducter-not-opened)). If you'd rather use a terminal,
`scripts/install.sh` puts the `ducter` command in `~/.local/bin`; `ducter doctor` checks your
Mac and `ducter up` starts your partner.

### On a server

Keep your partner awake while your Mac sleeps. Ducter runs as a systemd user service and listens
on `127.0.0.1` only; you reach it through your own domain or an SSH tunnel, and your phone and
Mac connect with a one-time code.

```sh
scripts/install.sh --linux ducter-linux    # on your Mac; copy the folder for your server's CPU
sh ducter/install.sh --service             # on the server
```

The walkthrough is in [Install](docs/install.md#a-linux-server-that-stays-on).

## How it works

```mermaid
flowchart LR
  you(["You<br/>Mac · phone · terminal"]) <-->|one connection| partner
  subgraph main["Ducter, on your Mac or your server"]
    partner["Your partner<br/>Claude Code + Ducter's tools"]
    log[("The Log<br/>local SQLite")]
    partner <--> log
  end
  partner -->|task| t1["Claude Code<br/>its own worktree and branch"]
  partner -->|task| t2["Codex<br/>on a machine you lend it"]
```

- **One partner talks with you.** It runs on Claude Code with Ducter's own tools, answers
  quick things itself, and turns bigger work into tasks.
- **Tasks run on real harnesses.** Each is a Claude Code or Codex session started through
  [OAR](https://github.com/botiverse/oar), in its own worktree. It reports back with a summary,
  how it checked, and questions that carry a default.
- **One local log holds everything.** The conversation, On hand and every task view are read
  from it, so nothing is lost when a session ends or a window closes.
- **Clients are thin.** The Mac app is native ([MyGo](https://github.com/egoist/mygo), no
  webview); the phone client is a small web app. Both speak the same protocol.

## Privacy and safety

- **Nothing lands without you.** Ducter never merges, never works in your own checkout, and never
  types your passwords. Every result says what was sent out.
- **Your machines, your accounts.** There is no Ducter cloud and no Ducter account. Work reaches
  Anthropic or OpenAI only through your own Claude Code or Codex login.
- **Only your devices get in.** A server listens on itself only; a phone or another computer
  connects with a one-time code, and you can disconnect it at any time.

The details are in [Privacy and safety](docs/privacy-and-safety.md).

## Docs

- **Using Ducter:** [Getting started](docs/getting-started.md) · [Install](docs/install.md) ·
  [Your devices](docs/devices.md) · [Your phone](docs/phone.md) ·
  [Privacy and safety](docs/privacy-and-safety.md) · [FAQ](docs/faq.md) ·
  [Troubleshooting](docs/troubleshooting.md)
- **Building Ducter:** [why it exists](motivation.md), the
  [principles](design/principles.md), the [design notes](design/README.md), every command in
  [build and run](design/build-and-run.md), and the [roadmap](design/roadmap.md).

## Contributing

Ducter writes its design down before its code. [CONTRIBUTING.md](CONTRIBUTING.md) explains how a
change is made and what is wanted now. Report security issues as described in
[SECURITY.md](SECURITY.md).

## 中文

Ducter 是跑在你自己机器上的个人 AI。你只跟一个伙伴说话，它把活儿交给你电脑上的 Claude Code 或
Codex 去做，用的是你本来就在付的订阅。做完了，它告诉你结果，也告诉你它是怎么确认的。只有真要你拍板的事才来找你，而且先替你想好默认的做法。哪件事你想看，随时点开就行。

现在是早期预览版：Mac（Apple 芯片）和 Linux 服务器都能用，手机上可以看进展、做决定，界面中英双语。上手请看
[Getting started](docs/getting-started.md)。

## License

[Apache License 2.0](LICENSE)
