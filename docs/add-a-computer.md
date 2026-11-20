---
title: Add a computer
description: Add another computer to your Ducter, a server at home, a NAS or another Mac, so tasks can run on it. One line to paste.
order: 3.1
---

# Add a computer

Your Ducter runs on one computer: your Mac, or a server. You can add more that do its tasks: a Linux server
in the closet, a NAS, a cloud machine, another Mac. Tasks can then run there, with that
computer's own files and its own AI agents, and you just say where: *"run it on the NAS"*.

A computer added this way only does tasks. It can't read your conversation or decide anything for you.

## Add one

1. In Ducter, open **Your devices**, choose **Add a device** (the last line of the list), then
   **For Ducter to do tasks on**. (**Add a computer for tasks** is also in
   **Settings › Where it runs**. Or just tell your partner, *"add my NAS"*, and it shows you
   the same card.)
2. Say what kind of computer it is: **A Mac** or **A Linux server**.
3. Ducter shows one line. Copy it, open a terminal on that computer, paste it and press
   Return:

   ```sh
   curl -fsSL https://ducter.ai/install.sh | sh -s -- worker https://ducter.example.com --code K7QM-4XPA
   ```

   It installs Ducter, joins your Ducter with that one-time code, and keeps running in the
   background: it starts again after a restart. You don't need to be an administrator; if you
   run it as root, it runs as a system service instead.
4. Ducter shows **Waiting for it to connect…** until it arrives, then **nas is here**, with
   its system. Rename it there if you like.
5. **Which AIs should it have?** Codex and Claude Code are already checked; tap **Install**.
   Ducter puts them in its own folder on that computer: no administrator password, nothing else
   on it changes. They arrive one by one, which takes a few minutes on a slow connection.
6. Tap **Sign in** beside each one. Codex shows a link and a code: open the link on any device
   and enter the code. Claude Code shows a link: sign in there, then paste the code the page
   gives you back into Ducter. When one is signed in, Ducter says **nas is ready for tasks**.

Tasks run on that computer with its own AI agents. Until one is signed in, asking for a task
there gets one line saying so; the task never quietly runs somewhere else.

**Later, or on any computer.** Tap **Later** to skip, and do it from the computer's card in
**Your devices** whenever you like: **Add an AI** lists what isn't there yet, each with
**Install**, and an AI that isn't signed in opens on **Sign in**. If you install an AI on that
computer yourself (with npm, nvm or its own installer), its card shows it within seconds.

For Codex, the code works once device sign-in is on in your ChatGPT account's security
settings; if it isn't, Ducter says so. pi signs in from a terminal on that computer: run `pi`,
then type `/login`.

**DeepSeek Harness.** It's offered too, unchecked: Ducter installs its command line (about
1.3 GB, a few minutes). To sign it in, tap **Sign in** and paste a DeepSeek API key (**Make one on
DeepSeek** opens the page where you get one); Ducter checks it without spending anything and keeps
it only on that computer. On a Mac with the DeepSeek Harness app, **Sign in** also opens the app
there: sign in to your DeepSeek account in it, and the card turns ready by itself. A DeepSeek
account works without an API key. If you installed the app yourself, Ducter finds the copy inside
it within seconds, and it updates with the app.

**Antigravity.** Google's Antigravity can take tasks too (never your partner's own thinking). It's
offered last, unchecked: Ducter puts its command line, `agy`, where Google's own installer does
(`~/.local/bin`, about 85 MB), checked against Google's release list. The Antigravity desktop app
alone doesn't count: it carries no command line, and the card says so with an **Install**. To sign
in, tap **Sign in**, open the Google link on any device, and paste back the code that page gives
you (or the address it ends on); on a server nothing opens there. Google's terms say using
third-party software to access Antigravity can get an account suspended, so the card says that
before you sign in: it's your call. **Sign out** on its card signs it out again with its own
sign-out. Ducter only gives it a task when you name it ("让 Antigravity 来做"), or when nothing
else can, and never a task on web pages.

**Your memory there too.** If you use [Nowledge Mem](https://mem.nowledge.co) with Ducter, tasks
on every computer you add remember you with nothing to set up there: they use the one Nowledge Mem
your Ducter is connected to, and its own Claude Code plugin comes with them. An Antigravity task
remembers you too: it starts with what Nowledge Mem knows about you, and its conversation is saved
to your memory after each turn, with nothing added to Antigravity's own settings. The computer's card
says **Same memory as** and the name of the computer Ducter runs on, **nothing to set up**. Your Nowledge Mem key stays where Ducter runs.

If you also want the AIs you open on that computer yourself (outside Ducter) to remember you, the
card offers it quietly. Tap **Install** there: Ducter puts Nowledge Mem in its own folder on that computer, with no
administrator password. Then, in Nowledge Mem, open **Settings › Connectors › Any AI agent**,
click **Generate connect link & copy prompt**, paste everything it copied, and tap **Sign in**. Nowledge Mem signs that computer in and connects its
Codex and Claude Code, and the card names the AIs there that share your one memory. A link works once, within 15
minutes, and Ducter doesn't keep it. Without Nowledge Mem, nothing about it shows. If the
computer later can't reach your Nowledge Mem, the card says so with **Check again**; if its sign-in
stopped working, it asks for a new one the same way. If you installed Nowledge Mem there yourself
long ago and your copy is too old to sign in, the card says so before you paste anything and offers
**Install a current one**: Ducter puts its own current copy in its own folder and uses that one
for tasks there. Yours stays as it is; the card shows the command that updates it.

The code works once, for 10 minutes; the card shows how long it has left. Pasting the line
again later is fine: what is already installed and connected stays as it is.

**A Mac that already has the Ducter app**, connected to your Ducter: no line needed. On that
Mac, open its own card in **Your devices** and turn on **Let this Mac help … with tasks**.

**Let your AI agent do it.** Under the line there's one sentence to give Claude Code or Codex
on that computer. It follows [Ducter's setup guide](for-agents.md) and runs the same line.

## Which computers can join

It depends on where your Ducter lives.

- **Your Ducter is on a server** with an address (your domain or your Tailscale name): any
  computer that can reach that address can join, at home or anywhere else. A computer on your
  home network needs no public address, no open port and no Tailscale of its own: it only
  connects *out* to your server.
- **Your Ducter is on your Mac:** the other computer has to reach the Mac. Turn on **From
  outside** in Your devices, and any computer with internet can join. If your Ducter listens on
  your network, the card offers its network address instead; then both computers must be on
  the same network, like the same home Wi-Fi.

If nothing outside reaches your Ducter yet, the card says so and offers **From outside** first.

## If it doesn't connect

Under **Waiting for it to connect…**, **Didn't connect?** lists the usual reasons, each with
what to do:

| What you see | What to do |
|---|---|
| The code expired | Choose **New code** and paste the new line. |
| The code was already used | Choose **New code** and paste the new line. |
| That computer can't reach your Ducter | It only needs to reach your Ducter's address, outbound. Run the check the card shows on that computer (`curl -sS -m 10 <address>/health`); if it fails, that computer's network or firewall is in the way. |
| `curl: not found` | Install curl (on Debian or Ubuntu: `sudo apt install curl`) and paste the line again. |
| This computer isn't supported | Ducter runs on Linux (Intel, AMD or ARM) and on a Mac with Apple silicon (M1 or later). |

To take a computer back, open its card in **Your devices** and choose **Disconnect**.

## From the command line

On the computer Ducter runs on, `ducter pair` prints a code and the command for another
computer. On that computer, `ducter worker <address> --code <code> --service` joins and keeps
it running; `ducter service status --worker` shows it, and `ducter service uninstall --worker`
removes it. `ducter devices rename nas "Build box"` renames it.
