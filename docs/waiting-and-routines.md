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

A task that waits on its own, like a review it checks every 45 minutes, says when it comes
back: **Back at 21:59**. Open it to see a ring fill toward that time, when it looks next, how
often it looks, how many times it has looked so far, and what it found last. **Check now** has it look right away instead of at
21:59; **Stop checking** ends the wait and keeps the task. When the wait comes true, the ring
closes with a tick and the task carries on. To see how a wait checks, click the line at the end
of the task, which says what it waits for and when it is back.

A task that looks again every so often stays quiet when a look finds nothing new: you hear from
it only when something new needs you, and then it also says what is still waiting. When someone
new asks for your review, you get one short line ("A new review request: website#551 …"), once
for that pull request, even if the review itself has nothing to ask you; times it gives are in
your own time zone. Anything it
would send to other people, like a review on a colleague's pull request, it writes first and
asks you once for the whole round ("3 PR reviews are written. Post them to GitHub?"); you can
read each one before you say Go, and nothing is posted before you do. If you'd rather it didn't
ask, say so once ("just post the reviews, don't ask me"): from then on its reviews go straight
to GitHub, the first time with one line listing what went, every one in Done for you. It is
listed in Settings › Partner under "Without asking", where Take back ends it (or say "ask me
before posting reviews"). Saying it to a review that runs every so often works the same way
("keep posting the reviews yourself"), and every round after that posts on its own, pull
requests that only mention you included, and a pull request where it found nothing to change
gets its review too. To have it look at one pull request now, say so ("review website#551 this
round"): that round does it first, and the review is on GitHub when it's done. One in a place it hasn't looked before still asks. Paying, passwords and sign-ins, and deleting always ask. In Past tasks › Looking after,
its card also says where your requests stand, like "8 requests wait on you: 3 had new commits and
are reviewed again, 5 unchanged".

Something that runs in rounds keeps going until you say stop. A round that finishes, a round that
fails, a restart or an update never ends it; if its next round goes missing, Ducter brings it
back by itself. Only you end it: **End** on its card, or say "stop the review loop". If you gave
it an end ("until #10473 merges"), it stops there.

In Past tasks › Looking after each card says how it is keeping its time, and only when it isn't:
**1 h late: Ada's MacBook Pro is asleep; it catches up as soon as it wakes**, **Its last 3 rounds
didn't work**, **Out of allowance; carries on at 20:53**, or, for a day after it was stopped by
mistake, **Stopped by mistake at 15:12, running again**. When there is something to do, the card's
button is **Run now**; when its computer is asleep and another of yours is awake, the card says
so (**Ada's MacBook Air is awake**) and its button is **Run it on an awake computer**: one tap
moves it there and runs a round. When a round is late or keeps failing, you also get one card in
the conversation with the same button, once. Under it: the last round and what came of it, and
which computer and which AI agent run it. **⋯ › How often** sets it (every 15 minutes
to every 4 hours). You can ask too: "how is my loop doing?" (one line back: how often, the next round, on time or not), "make the review every hour",
"pause it until tomorrow", "stop it".

## "Remind me …" and what you said you'd do

> Remind me at 3 this afternoon to pay the landlord.
> I need to renew the passport on Wednesday.

Ask for a reminder and it comes at that time, in your own words: **Reminder: pay the landlord.**
Name a day without a time and it comes that morning; with no day at all, the next morning. This holds even if you chose **Only when you ask** in [Settings](settings.md), because you
asked.

When you mention something you'll do on a given day, the morning message that day starts with it:
**On Monday you said you'd renew the passport today.** **How I know** shows the line you wrote.
It brings back only lines like that, never a question, a guess, or something that repeats. For
something every week, ask for a routine (below). It says each one once. If you'd rather it
didn't, **Don't tell me this kind** is under it.

The morning message also says what is coming back today and what has been waiting on you since
yesterday or longer, in one line: **At 15:00 today: remind you to pay the utility bill.** It
mentions each waiting card once. If your computer was asleep or restarting when your quiet hours
ended, the morning message comes when it is back, up to a few hours late. Later than that, it
waits for the next morning.

## "Keep going until …"

> main's CI is red; keep fixing until it's green.

Ducter starts a task and keeps at it, one try after another. On **On hand** the task shows how
close it is: when the goal is a set of checks, a row of little lights that turn green as they
pass ("4 of 6 lights on", and which try it's on), or as the things to fix get fixed ("12 of 16 done");
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

### When something changes

> Whenever a new file shows up in ~/Downloads/invoices, rename it to the date and vendor.

Ducter can also run a routine when something changes: files in a folder, a web page, what a
command prints, or what one of your connected apps shows. It looks for changes itself, without
using your AI, so nothing is spent until something actually changes. Its card says so under
**Cost**. When it runs, it is told what is new, what changed and what is gone. If a look ever
seems wrong (everything vanished at once), Ducter asks **Run it anyway?** before doing anything.

### When things don't go to plan

- **It ran late.** If your computer was asleep or Ducter was off at the time, the routine runs
  once when it's back, not once per missed time. It knows it's late and adjusts: a morning brief
  at 3 pm says so. The routine shows **12 min late** under its last run.
- **A run didn't work.** If it failed before doing anything, Ducter tries once more about 12
  minutes later (**Tries again 9:12**).
- **An account needs signing in again**, or your allowance ran out. Ducter tells you once what to
  do and keeps trying by itself, less and less often (**Can't run for now: needs signing in
  again**). Once it works again, it carries on, and Ducter tells you.

Some of this is still coming: a routine that runs on another of your computers, and editing a
routine by just saying the change.

## When an AI agent's limit runs out

Claude Code, Codex and the other AI agents have usage limits that reset after a few hours or a
week. When a task's agent reaches its limit, the task doesn't stop: it waits on its own and
carries on, in the same session, once the limit is back. You'll see **额度 3:12 恢复 / Limit
resets 3:12** on its card, and a ring that fills toward that time. Several tasks on the same
account wait together and are shown under one line in On hand. If Ducter restarts meanwhile,
they still carry on at the reset.

A limit belongs to one account. If the same AI agent is signed in to a different account on another
of your computers, the task doesn't wait at all: it carries on there right away, with the same
model, from where it got to. Its lines say so once: **Claude Code 的额度用完了 / Claude Code's limit
ran out**, then **换到 hel 接着做 / Continued on hel**. There's nothing to set up. Ducter also keeps
some room on the account your partner thinks with: when that account is nearly used up, new tasks
go to the other account first, so your partner can always answer you.

If another AI agent is signed in on the same computer, the task's card offers **现在换 Codex 接着做 /
Hand it to Codex now**: it picks up from where the task got to. **先停下 / Stop here** ends the wait
and leaves the task for you. Under them, a switch lets you hand tasks over right away every time
a limit runs out, instead of waiting.

Ducter only tells you about a limit when it matters: when the agent doesn't say when it resets
and nobody else can take the work. If a task carried on overnight, Ducter may mention it with
the result.

### When your partner's own AI agent runs out

Your partner thinks with an AI agent too, and that one can run out of its limit (or stop working
for a while) right when you write. Your partner doesn't go quiet. If another AI agent that can be
your partner is signed in, that one answers at once, and your partner says so in one line first:
**Claude Code 的额度用完了，这会儿先用 Codex 答你，20:53 换回来。/ Claude Code is out of
credit, so Codex is answering you for now. Back to Claude Code at 20:53.** Its name, what it
remembers and your conversation stay the same. At that time it goes back by itself; you don't
do anything.

If nothing else can answer, it says that once, with when it's back. What you send meanwhile
isn't lost: it is answered then, in order. Until then the header under its name says when it
answers again (**20:53 接着回你 / Answers at 20:53**), and **Settings › Partner** says what
happened. Ducter never takes over with an AI agent you told it never to use.

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
