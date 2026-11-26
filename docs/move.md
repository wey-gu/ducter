---
title: Move Ducter to another computer
description: See what moving your Ducter to a new Mac or a server would carry over, make one encrypted bundle of it, and receive it on the new computer. The switch-over itself is coming soon.
order: 3.2
---

# Move Ducter to another computer

Your Ducter runs on one computer: maybe the Mac you started on. One day you may want it on a
server that never sleeps, or on a new Mac. Moving it should lose nothing: not the conversation,
not your partners, not the phone you paired, not the routines it runs for you.

**The switch-over is coming soon.** You can already see the plan, make one encrypted bundle of
what moves, and receive it on the new computer. The new computer checks every file and every
entry of the Log before it keeps anything. Until the switch-over, keep using the Ducter on the
old computer.

## See the plan

On the computer Ducter runs on, open a terminal and run:

```sh
ducter move --plan
```

To name where it would go, add `--to` and the computer's name:

```sh
ducter move --plan --to hel
```

If that computer already does tasks for your Ducter (see [Add a computer](add-a-computer.md)),
the plan knows what kind of computer it is and says the move can go over that connection, with
no code to type. Any other name is taken to be a Linux server, and the plan says so.

The plan comes in your language (`DUCTER_LOCALE=zh` or `en` picks one) and has six parts:

- **Goes with it:** the conversation and every task's record (with how many entries), your
  partners, settings, routines, the keys you gave Ducter (named, never shown), your saved
  sign-ins and cards, your paired devices, chat apps, notifications, who your partner is in
  Nowledge Mem, your helpers, and what Ducter made for you, each with its size.
- **To do again on the new computer:** signing in to each AI agent, to GitHub and to Nowledge
  Mem. Those sign-ins belong to each program on this computer, and Ducter never copies them.
  Moving to a different kind of computer (a Mac to a Linux server) also means signing in again
  to the sites in Ducter's own browser.
- **What follows the new address:** your Ducter apps, the command line and the computers that
  do tasks find the new address by themselves, with no pairing again. A web page stays on its
  address, so you open the new one once. Telegram, Slack and WeChat need nothing changed in the
  apps. If you use your own domain, its DNS record has to point at the new computer.
- **Work under way:** what happens to each task that's running. A task on another computer
  keeps going. A task with no folder pauses after its current step and carries on there. A task
  in a repository pushes its branch first. A task in a folder on this computer carries on here.
- **Stays on this computer:** the code in your repositories, and what only a Mac can do (your
  Chrome, your Mac apps, Ducter's own phone). After the move this computer can keep doing tasks
  for your Ducter, so those keep working.
- **Worth knowing:** tasks under way, devices that haven't connected for a month, how much free
  space the new computer needs.

Add `--json` for the same plan as data.

## Make a bundle

On the old computer, write the move into one file:

```sh
ducter move --bundle ~/Desktop/ducter-move.ducter --to hel
```

Ducter prints a passphrase once. **Write it down.** The passphrase is not inside the bundle and
is not saved anywhere on the computer, so Ducter cannot show it again. If you would rather choose
the passphrase yourself, add `--passphrase-stdin` and pipe it in; it is read once and not saved.

The bundle is encrypted. A copy of the file on a disk or in a message opens nothing without the
passphrase.

Nothing on the old computer changes while the bundle is made: it keeps running and keeps
answering. The Log is taken as one consistent snapshot, not as a copy of a file that is being
written.

**What the bundle carries:** the conversation and every task's record, your partners and their
looks, settings and projects, routines, the keys you gave Ducter, account connections,
your saved sign-ins and cards (locked again, so the old computer's key stays there), your paired
devices with Ducter's own key, chat apps and where they had read up to, notifications, who your
partner is in Nowledge Mem, helpers, what Ducter made for you, and the Cloudflare tunnel if you
use one.

**What it leaves out, and says so:** the AI agents' sign-ins, GitHub's and Nowledge Mem's
sign-ins, the code in your repositories, the tasks' working copies, the keys Ducter keeps on this
computer for its tasks, Ducter's own browser profiles when the new computer is a different kind
of system, and programs, updates and logs that are made again there.

## Receive it on the new computer

Install Ducter on the new computer, but don't start it yet. Its data folder must be empty. Copy
the bundle there, then run:

```sh
ducter move --receive ~/Desktop/ducter-move.ducter
```

Type the passphrase when it asks. The command refuses if this computer already has a Ducter with
work in its data folder; receiving needs a fresh, empty one.

It checks the passphrase, every file, and the conversation's entry count and last entry before
it keeps anything. If anything is wrong, it writes nothing. Your saved sign-ins and cards are
locked again with the new computer's own key.

Then it prints, in plain words, what still has to be done: the AI agents to sign in to, GitHub,
Nowledge Mem and the partner's Nowledge Bridge handover. It also says that your devices and apps
need no pairing again: they follow when the move is switched over.

Nothing starts on the new computer yet; keep using the Ducter on the old computer. The
switch-over is the next version.

## After the bundle arrives

1. Sign in to the AI agents, GitHub and Nowledge Mem on the new computer, as the receive command
   listed.
2. Switch the move over. That step is coming soon; until then, keep using the Ducter on the old
   computer.
3. Once the switch-over works, delete the bundle. Until then, leave the old computer untouched;
   it is still the one running.
