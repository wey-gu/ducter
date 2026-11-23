---
title: Move Ducter to another computer
description: See what moving your Ducter to a new Mac or a server would carry over, what you'd sign in to again, and what follows by itself. The move itself is coming soon.
order: 3.2
---

# Move Ducter to another computer

Your Ducter runs on one computer: maybe the Mac you started on. One day you may want it on a
server that never sleeps, or on a new Mac. Moving it should lose nothing: not the conversation,
not your partners, not the phone you paired, not the routines it runs for you.

**The move itself is coming soon.** Today you can see the plan: exactly what would move, what
you'd do again on the new computer and why, and what finds the new address by itself. Seeing
the plan changes nothing.

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
  partners, settings, routines, the keys you gave Ducter (named, never shown), Autofill,
  your paired devices, chat apps, notifications, who your partner is in Nowledge Mem, your
  helpers, and what Ducter made for you, each with its size.
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

## Coming soon

The move itself: you start Ducter on the new computer, it shows a one-time code, and one
command moves everything over, encrypted on the way and checked entry by entry when it lands.
Your phone and apps follow without pairing again. Your old computer keeps everything as it was
for 30 days, so moving back is one step.
