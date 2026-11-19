---
title: Your to-dos in other apps
description: Let your partner take on the GitHub issues assigned to you and the to-dos in your Obsidian vault, and comment or tick them off when they are done.
order: 5.3
---

# Your to-dos in other apps

Your to-dos already live somewhere: issues assigned to you on GitHub, a list of `- [ ]` lines in
Obsidian. Your partner can take them on from there, and when one is done, say so where it came from.

The app stays in charge of the to-do itself: what it says, and whether it is open. Your partner only
looks after getting it done.

## Add one

Open **Settings › To-do sources** (**设置 › 待办来源**). Under **You can add** you'll see:

- **GitHub**: tap **Connect**. You'll see a link and a short code: open the link on any device, enter
  the code, and confirm on GitHub. If the computer your partner runs on doesn't have GitHub's
  command-line tool (gh) yet, the same place offers **Install gh** first and says where it goes; no
  terminal, no administrator password. Once you confirm, GitHub shows up with how many issues are
  assigned to you. It reads the issues and pull requests assigned to you.
- **Each Obsidian vault** Obsidian knows on the computer your partner runs on. You can also add one by
  its folder with **Add an Obsidian vault…**.
- **Jira**: coming soon.

Tap **Add** (for GitHub, **Connect**). Nothing starts because you added it.

Right after you add one it says **Looking…** until it has read the list, then how many are open. For
GitHub it also says how many pull requests are waiting for your review. If it
couldn't read it, it says **Couldn't read GitHub.** (or Obsidian) and why, with **Try again**.

## Only part of it

Each source can read just part of what's there. Type in the field and press Return, or just move on:

- **GitHub › Only these repositories**: write `owner/repo`, several separated by commas. Leave it
  empty for every repository.
- **An Obsidian vault › Which folder**: a folder inside the vault, for example `Plans`. Empty means
  the whole vault.
- **An Obsidian vault › Only with this tag**: for example `#ducter`, so only lines with that tag count.
  Empty means any tag.

## Ask, or pick

Ask the way you'd ask a person:

- GitHub 上有什么分给我的？ / Anything assigned to me on GitHub?
- 接 #12 / Take #12
- 我 Obsidian 里这周到期的有哪些？ / What's due this week in my Obsidian?

Or open **New task** and choose **Pick from your to-dos**. The to-do's words become what you ask, and
the task remembers where it came from: its app's mark and number sit on the task (for example
`web#12`), and tapping it opens the issue or the note.

A to-do that already has a task opens that task instead of starting a second one.

## See them on On hand

Once a source is added, **On hand** (**手头的事**) shows your to-dos after **Done today**, under
**Assigned to you on GitHub** (or **To-dos in** your vault, or **Your to-dos** with more than one),
with how many are open.

Only a few stand there, so the list never takes over: a pull request waiting for your review, an
issue where someone mentioned you, an Obsidian to-do due in the next couple of days, and the most
recently updated. Each says why it's there. Tap one to open it in GitHub or Obsidian, or tap **Hand to**
your partner's name and it becomes a task right there on On hand. The task works in the copy of
that repository on one of your computers (a Mac first); if none of them has it, your partner clones
it on a computer that can read it and tells you so in one line.

The rest are folded under **{n} more**. Open it to find one by its title or number, narrow it to one
repository, one folder or tag of your vault, or the pull requests waiting for your review, and see
more a page at a time.

In **Settings › To-do sources**, the counts (how many are open, how many pull requests wait for your
review) take you straight there.

Nothing shows on On hand until you add a source.

## Let your partner go through the pile

When you connect GitHub, your partner reads every open issue assigned to you (with the AI agent it
already thinks with, on its smallest model) and sorts them. You see it working, then one message:
how many you could hand to it, how many need your call, how many you might close (you see each one
first), and how many can wait. If there are more than it reads in one go, it says how many it hasn't
looked at closely yet. It sorts again once a day, reading only what changed, or when you tap **Sort
again** or ask it ("go through my GitHub issues").

At the top of your to-dos on On hand, your partner stands beside the stack: **{n} still open**, how
many it cleared for you today, and one row for each group with one button:

- **Hand to** your partner: the hand-over sheet opens with the ones it could take ticked. Say how in
  **A note for {name}**, choose how they're done, and hand them over (see below). Each becomes a task
  bound to its issue, and nothing is posted on GitHub until the work is done and you say so.
- **Decide them**: one question each, with your partner's suggestion already picked. Hand it over,
  mark it as one you might close, or leave it.
- **Look them over**: every issue it thinks you might close, with the line it would leave on each.
  Tap **Keep open** on any you want kept. **Close these {n}, with a line on each** closes the rest:
  each gets its line and is closed as not planned. Each one is in **Done for you**, and any can be
  reopened on GitHub. Watch the count go down as they close.

A pull request waiting for your review may already say **I've read it**, with how many problems and
suggestions your partner found. **See them** shows the comments it drafted; drop any you don't want,
then **Send these {n}** posts them as review comments. They are comments only: whether to merge stays your call.

In the morning note, your partner may offer up to three it can clear for you today. Tap **Hand them
to** your partner, or just say yes. If you leave the offer twice, it stops offering until you hand
something over again.

## Hand several over at once

When there are more than twenty open, the pile shows **Subjects**: what they're about, each with its
count ("Distillation 13"). Tap one, or type in **Find…** on the hand-over sheet: it matches words,
issue numbers and labels at once, then reads every title for meaning, in Chinese and English, so
"memory distill" also finds the issue written as 长对话的自动提炼总是失败. The line under the field says
how many it found and how. Everything shows, grouped as your partner sorted it: the ones it could take
are ticked; one that needs your call shows its question (tick it to go with the suggestion).

Then, on the same sheet:

- **A note for {name}**: how it should go, in your own words ("leave the database migrations alone;
  run every check on haswell"). Every task gets it at the top. **A note for this one…** on an item adds
  words for that one only. Name a computer and **Where** follows it; say it as a habit ("always") and
  your partner asks once whether to keep it as a rule.
- **How**, with one marked **Suggested**:
  - **Plan first** (starts when you say so): one task reads them all and the code, changes nothing,
    and shows you a plan: what's already fixed, what belongs in one change, what goes in order. Add a
    note to any part, then **Go with this**, **Hold**, or **Reply…** to have it plan again.
  - **As one task**: one task and one pull request that fixes them all (one repository, or errands).
  - **One after another**: each starts from the one before's branch.
  - **Side by side**: three at a time, a pull request each.
  - **Add to "{group}"** shows first when work on the same subject is already under way.
- **Where** and **Who does it**: filled for you, each with why; tap to change.

**Hand these {n} to {name}** makes one group on On hand that carries them all. You can also say it in
the conversation: "pull out everything about memory distill so we can look" shows the set there, ticked
the same way; "just these, plus #405; check everything on haswell" hands it over with your words as the
note.

When every part is done, the group offers **Review together**: each pull request with its checks, its
size, what it did and the comment it will leave on its issue. Turn off any comment with **Not this
one**, then **Comment on these {n}** posts them all at once. Ones that were already fixed are closed
after their comment; the rest close themselves when their pull request is merged.

## When a new one comes

Each source has **When a new one comes**:

- **Tell me** (GitHub's default): your partner mentions new ones in one short line, and asks which to
  take.
- **Don't tell me** (Obsidian's default): it waits until you ask.
- **Take it directly**: new ones start without asking, up to five a day. Your partner offers this once,
  after a couple you took from the same place have finished well.

## When it's done

- **GitHub:** your partner writes one short comment for the issue, in the issue's own language, with
  the link to the pull request. You see the whole comment first and tap **Comment** (or **Comment and
  close**). After you've said yes a couple of times, it offers to comment by itself from then on.
  Closing an issue still asks, unless you choose **Comment and close** in Settings. Every comment ends
  with "Written with Ducter", so your teammates know.
- **Obsidian:** the line is ticked, with today's date, the way the Tasks plugin writes it. Nobody else
  sees your vault, so this happens by itself; choose **Ask me** or **Leave it** if you prefer. Repeating
  to-dos are left for you to tick in Obsidian, so Obsidian can make the next one. If you have the note
  open and are typing, it waits and tries again.

Everything it writes is in **[Done for you](done-for-you.md)**.

## If the to-do changes

- **Edited** in its app: the task is told what changed.
- **Closed** by someone else while the task is working: your partner asks whether to stop. If you don't
  answer, it stops after half an hour; you can continue it any time.
- **Removed**: the task is told, and the chip on it says so.

## Read On hand by where things came from

On **[On hand](on-hand.md)**, the list beside the board shows **From** with GitHub and each vault that
has a task. Pick one to see just those.
