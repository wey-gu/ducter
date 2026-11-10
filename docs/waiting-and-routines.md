---
title: Waiting, keep going, routines
description: Ask Ducter to tell you when something happens, to keep at a task until it works, or to do something every week.
order: 6
---

# Waiting, keep going, routines

Some work is about time: something you are waiting for, a fix that takes a few tries, a report
you want every Monday. You say it the way you would say it to a colleague. Ducter answers once,
in one line, and the rest shows on **On hand**.

## "Tell me when …"

> #1592's CI passes, tell me.
> Tell me when the domain renewal email arrives.

Ducter takes a look right away and tells you where things stand ("Two checks are still
running; I'll tell you when it's all green"). Then it waits quietly. On **On hand** the wait
sits under **Waiting**, with the thing it waits for beside Ducter on its little bench. If it
has a deadline, a groove runs from when it started to the deadline, with Ducter at "now".

When it happens, Ducter tells you in one line, and the card moves on by itself. If it can't
happen any more (a check failed) or the deadline passes first, Ducter tells you what happened
and what you can do next. The wait stays under **Done today** for the rest of the day, with
**Didn't happen** and the reason; **Keep waiting** starts the same wait again.

Watching your email needs a connection to your mail ([Settings](settings.md)). Waiting for a
PR or a website needs nothing more than what Ducter already uses.

To see how a wait checks, open it and look under **How it checks**. **Stop waiting**
and **Look now** are on the same page.

## "Keep going until …"

> main's CI is red; keep fixing until it's green.

Ducter starts a task and keeps at it, one try after another. On **On hand** the task shows how
close it is: when the goal is a set of checks, a row of little lights that turn green as they
pass ("4 of 6 lights on · Try 3"), or as the things to fix get fixed ("12 of 16 done");
otherwise it says how the latest try went. It stops when it works, after 20 tries, or when a
few tries in a row make no progress; then it tells you. **Stop** is on the task's page.

## "Every Monday …"

> Give me a weekly report every Monday at 9.

Ducter answers with a card: when (with the next date on a little calendar), what it will do, how it
will tell you, what it may touch and what it costs. Nothing starts until you press **Go:
Start**.

Your routines sit at the bottom of **On hand**, each with a little desk calendar showing when it
runs next. **Pause** stops one;
only you can **Resume** it. Ducter pauses a routine by itself if three runs in a row don't work
or you haven't read its last three reports, and after 30 days it asks whether to keep it.

Each run uses a little of your AI allowance. If one run uses much more than usual, Ducter stops
it and asks you.

Some of this is still coming: a routine that runs on another of your computers, and editing a
routine by just saying the change.

## Without saying it: from New task

You can set up all of this yourself, without the conversation. Open **New task** (**⌘N**),
write what to do, and tap **When it starts** under your words:

- **At a time**: today, tomorrow or the day after, at the time you type. It starts by itself
  then, with your words as you wrote them. On **On hand** it waits with its date on the little
  calendar; **Don't do it** calls it off.
- **On a schedule**: every day, weekdays, one day a week, or every few hours. Each time it starts
  a fresh task with your words. It sits with your routines (or, **By project**, in its folder's
  group) and pauses and asks like any routine.
- **When something happens**: write what to wait for ("PR #1592's CI passes"). The task opens
  now, waits under **Waiting**, and does the rest when it holds.
- **Keep going until…**: write what should hold ("every test passes"). It tries again until it
  does, and stops to ask you if it isn't getting there.

Because you set these up yourself, there's no card to approve: the button says **Schedule**
(or **Start**) and that's it.
