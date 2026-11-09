---
title: Install
description: Install the Mac app or the ducter command, run Ducter on a Linux server that stays on, and connect your phone.
order: 2
---

# Install

There are four ways to have Ducter, and you can mix them:

| | Best for | Status |
|---|---|---|
| [The Mac app](#the-mac-app) | Most people. Double-click and go | Ready, built from source for now |
| [The `ducter` command](#the-ducter-command) | People who live in Terminal | Ready |
| [A Linux server](#a-linux-server-that-stays-on) | Keeping your partner working while your Mac sleeps | Ready |
| [Your phone](#your-phone) | Answering decisions and checking results on the go | Ready in the phone's browser; an iPhone app is coming soon |

Whichever you choose, you need a coding agent, **Claude Code or Codex** today, installed and
signed in on the computer that does the work ([which agents](faq.md#which-coding-agents-does-it-work-with)).
Ducter uses your own plan through it; it never asks for an API key to get started.

## The Mac app

A ready-made download is coming soon. Until then the app is built once from the source, on a
Mac with [Bun](https://bun.sh) and [Go](https://go.dev) installed:

```sh
git clone https://github.com/wey-gu/ducter && cd ducter
scripts/make-app.sh        # makes dist/Ducter.app and a .dmg
```

The `.dmg` can go to anyone with an Apple silicon Mac (AirDrop, a link, a USB stick). They
need no build tools.

To install: open the `.dmg`, drag **Ducter** onto **Applications**, and open it from there.
If whoever built it signed it with an Apple Developer ID, macOS asks once whether to open an app
from the Internet; choose **Open**. If not, see
[Ducter can't be opened](troubleshooting.md#ducter-not-opened).

What happens next is in [Getting started](getting-started.md). In short: Ducter checks your Mac,
shows the one thing to fix if anything blocks, and opens the conversation. It keeps working
when you close the window.

## The `ducter` command

The app already includes the command: after your partner's first reply it offers *"Use ducter
in Terminal too?"*, and **Yes** puts `ducter` in `~/.local/bin`.

Without the app, from the source (needs Bun; Go too if you want the desktop window):

```sh
scripts/install.sh      # puts ducter (and the desktop app) in ~/.local/bin
ducter doctor           # checks this Mac; anything missing comes with the command that fixes it
ducter up               # starts your partner and opens the desktop window
```

To hand the command to a friend who doesn't build anything, run
`scripts/install.sh --bundle ~/Desktop/ducter-for-anna` and send them that folder. On their Mac
they type `sh ` in Terminal, drag `install.sh` from the folder into the window, press Return, and
run the one command it prints.

| Command | What it does |
|---|---|
| `ducter up` | Start Ducter and open the desktop window. Ctrl-C stops everything |
| `ducter open` | Open the desktop window again for a Ducter that's already running |
| `ducter status` | Your tasks and the decisions waiting for you |
| `ducter doctor` | The check-up (see [Troubleshooting](troubleshooting.md)) |
| `ducter pair` | A one-time code to connect your phone or another computer |
| `ducter devices` | The devices connected to your Ducter; `ducter devices disconnect <name>` removes one |
| `ducter version` | Which version you have |

Messages follow your system language. Set `DUCTER_LOCALE=zh` or `DUCTER_LOCALE=en` to choose.

## A Linux server that stays on

A Mac sleeps; a small server doesn't. Put Ducter on a Linux server you own and your partner
keeps working through the night, while your Mac and phone connect to it.

**1. On your Mac, make the Linux files** (from the source):

```sh
scripts/install.sh --linux ducter-linux
scp -r ducter-linux/linux-x64 you@server:ducter    # or linux-arm64; `uname -m` on the server tells you
```

**2. On the server, install it as a service:**

```sh
sh ducter/install.sh --service
ducter doctor
```

Ducter now starts with the server and restarts if it ever crashes. It only listens on the
server itself (`127.0.0.1`), so nobody reaches it from outside until you choose how. The
install ends by showing a code to connect your first device.

`ducter doctor` also tells you how to sign in Claude Code or Codex on a server that has no
browser: `claude auth login` prints a link to open on any device and waits for the code, and
`codex login --device-auth` works the same way.

**3. Choose how to reach it:**

- **Your own domain (recommended).** Point a DNS record at the server, open ports 80 and 443,
  copy `scripts/caddy-setup.sh` from the source to the server, and run
  `sh caddy-setup.sh ducter.example.com` there. It sets up HTTPS for you. This is also the way
  to reach Ducter from your phone.
- **No domain.** Open an SSH tunnel from your Mac:
  `ssh -N -L 7777:127.0.0.1:7777 you@server`. The address is then `http://127.0.0.1:7777`.
  This works for your Mac, not your phone.
- A zero-setup address with no domain of your own is coming soon.

**4. Connect your Mac.** Open the Mac app and choose **My Ducter is on another computer**, then
**Connect to your Ducter**. On the server, run `ducter pair`, and type the **Address** and
**Code** it shows (or paste the whole link). The code works once, for 10 minutes.

Ducter's own messages on the server go to the system journal:
`journalctl --user -u ducter`.

### Lend another computer

A second server or Mac can do tasks for your Ducter. On the computer Ducter lives on, run
`ducter pair --worker`; on the other one, run `ducter worker --join <address> --code <code>`
(add `ducter service install --worker` on a Linux server to keep it running). Then just say
where: *"run it on vps-2"*. If that computer drops off, its task waits and carries on when it's
back.

## Your phone

Your phone connects to the Ducter on your server through your own domain. On the server, run
`ducter pair` and scan the QR code it shows, or open the link. The phone opens Ducter in its
browser, connects, and asks whether to notify you when something needs you.

Everything about the phone, including notifications and quiet hours, is on
[Your phone](phone.md). An iPhone app is coming soon.

## Updates

The Mac app looks for a new version when it opens and once a day, and gets it ready in the
background. When one is ready, the Ducter menu says **Update 0.2.0 ready · restart to finish**.
It installs the next time you quit Ducter, or right away if you click that line. Your tasks
carry on.

## Remove Ducter

- **Mac app:** choose **Stop Ducter** in the menu, then drag Ducter from Applications to the
  Trash.
- **Server:** `ducter service uninstall`.
- **Everything, in one go:** `ducter uninstall --all`. It first lists exactly what it removes
  (Ducter in the background, `~/.ducter` with your conversation and tasks, its browser profiles,
  the `ducter` command it put in `~/.local/bin`) and what it keeps (your repos and their
  `ducter/*` branches, your Claude Code and Codex sign-ins, Nowledge Mem, cua-driver), and
  asks you to type `remove`. A task's changes that were never committed are named before
  anything goes. It cannot be undone. Without `--all` it only stops Ducter in the background.
