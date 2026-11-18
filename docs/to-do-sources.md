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
  the code, and confirm on GitHub. If the computer your partner lives on doesn't have GitHub's
  command-line tool (gh) yet, the same place offers **Install gh** first and says where it goes; no
  terminal, no administrator password. Once you confirm, GitHub shows up with how many issues are
  assigned to you. It reads the issues and pull requests assigned to you.
- **Each Obsidian vault** Obsidian knows on the computer your partner lives on. You can also add one by
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

## When a new one comes

Each source has **When a new one comes**:

- **Tell me** (GitHub's default): your partner mentions new ones in one short line, and asks which to
  take.
- **Don't tell me** (Obsidian's default): it waits until you ask.
- **Take it directly**: new ones start without asking, up to five a day. Your partner offers this once,
  after you've taken a couple from the same place.

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
