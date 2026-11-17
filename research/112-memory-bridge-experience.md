# 112 · What Ducter knows about you, and the first hand-off from a terminal agent

> 2026-11-17. Public. Evidence for redesigning Settings › Memory and the discoverability of Nowledge Bridge
> (a terminal coding session handing work to, or asking the partner, through the shared mailbox).
> Built from public help-center pages, official docs, press coverage and two academic papers, read on the web
> this session. Outside products are not named here; the named, sourced detail (product, page, URL) is in
> `private/112-memory-bridge-experience-refs.md`, and `[n]` below points into it.
>
> Tags: **VERIFIED** read by me in a primary source this session · **DOCUMENTED** stated by an official doc
> or reported by reputable coverage (read through a search summary, not the page itself) · **INFERRED** my reading.
> No experiment was run; nothing here was tested with users.

## 1. How memory is shown

| Pattern | Seen where | Tag |
|---|---|---|
| A list of **topics**, each opened to read, with edit and delete on the topic itself | an AI lab's assistant, current memory [1] | VERIFIED |
| A **synthesized prose summary**, refreshed about every 24 h | the same assistant, older accounts [1] | VERIFIED |
| A **narrative profile split by life area** (work, hobbies, travel, education), kept up to date in the background so stale facts (a past trip) fade | a major chat assistant, mid-2026 [3] | VERIFIED |
| A flat list of saved items, delete one or clear all; later search and sort by date, raise or lower priority | the same chat assistant, 2024–2025 [2][4] | DOCUMENTED |
| Two stores side by side: facts the person **said** ("saved info", now "instructions") vs. what was **learned** from past chats | a search company's assistant [5] | DOCUMENTED |
| A "learned from history" store with **no view at all**, only on/off | the major chat assistant, 2025 [4] | DOCUMENTED |

The direction across vendors runs from raw items to grouped, human-language summaries organized by life
area, with each piece still editable on its own [1][3]. INFERRED: a flat list turns into a wall once it holds
hundreds of items, and a single prose blob can't be corrected one claim at a time. The pattern that is winning
uses a summary as the surface and keeps each claim addressable.

## 2. Correct and forget

- **In place:** an edit icon and Delete on each topic [1] (VERIFIED). On a profile entry, "Make a correction" and
  "Don't mention this again" [3] (VERIFIED). The second one is a softer verb than delete: it governs what gets
  said, not what gets stored.
- **Through chat:** "remember / change / forget" said in conversation applies from the next conversation on [1]
  (VERIFIED). Asking to "forget" works on the search company's assistant too [5] (DOCUMENTED, enterprise doc).
- **Failure mode:** forum reports of accounts that can see the list but get no edit or delete buttons, and they
  read as frustration and distrust [5] (DOCUMENTED, user report). INFERRED: showing someone what is known about
  them without a way to fix it is worse than showing nothing.

## 3. Off switches, scope and the "remembered" moment

- **Graded off:** *Pause* keeps memories but stops using and adding them. *Reset* deletes everything,
  project memories included, and can't be undone [1] (VERIFIED).
- **Per conversation:** an incognito chat (ghost icon) is not saved to memory or history and is left out of past-chat
  search. Memory can also be switched off for one chat, but only before its first message [1] (VERIFIED). A
  temporary chat does the same job on the major chat assistant [2] (DOCUMENTED).
- **Scope:** each project keeps its own memory and can opt out of account memory [1] (VERIFIED).
- **Separate toggles** for "said" and "learned" memory [3][4] (VERIFIED/DOCUMENTED).
- **Turning off does not clear:** on one assistant, switching memory off leaves past activity in place, so a full
  reset takes three separate actions [5] (DOCUMENTED). INFERRED: people miss this, and it erodes trust.
- **The moment:** a quiet "Memory updated" line in the chat. Hovering it leads to "Manage memories" [2]
  (DOCUMENTED). It is a receipt, not an interruption, and it is the one path from the chat to the store.

## 4. Trust: transparency, control, creepiness

- Interviews in a 2025 paper: users want to **review, edit, delete and categorize** memories, and to see **how
  inferred information is used**. They value the efficiency and worry about accuracy and control [7] (DOCUMENTED).
- A 2024 study (N=40 formative, N=36 evaluation): the main obstacle was **low awareness** of what had been
  remembered. **Proactive** control, where the system raises sensitive items in context, beat both a vendor's
  settings page and manual settings on perceived control and transparency [8] (DOCUMENTED).
- Journalism critique: vendor docs repeat "you're in control", while researchers found less control than
  promised [6] (DOCUMENTED).
- I found no study that measures "creepiness" of inferred memories directly (gap). INFERRED from [4][7][8]:
  the creepy cases are things learned but never said, shown with no source, and impossible to fix. The
  remedies are to separate said from learned, name a quiet source ("from your chat on 3 Nov"), and correct in
  the same place.

## 5. Hand-off between agents

| Pattern | What makes it work | Tag |
|---|---|---|
| Assign an issue to a code-hosting site's agent | An instant acknowledgement (a reaction on the issue), then a draft change request within seconds, linked in the timeline. Comments after that go on the change, not the issue. A mention brings the agent back. | DOCUMENTED [9] |
| The same agent started from web, phone, CLI, IDE or any tool that speaks the tool protocol | One concept and many doors. The result always lands in the same place. | DOCUMENTED [9] |
| A payments platform's CLI onboarding | Exact copyable commands (`… listen --forward-to localhost:4242/webhook`), then a **live listening state** that prints "Ready!" and a secret, then a command that **fires a sample event** so the first success is seen at once | VERIFIED/DOCUMENTED [10] |
| The same platform's "agent setup" command | One command wires the person's coding harness | VERIFIED [10] |

INFERRED from these: a hand-off feels magical when (a) the receiver acknowledges within a second or two,
(b) the work shows up in a place the person already looks, (c) the way back is a single mention, and (d) the
first use can be triggered on demand instead of waited for. It feels confusing when the sender can't tell
whether anyone received it, when replies land somewhere new, or when setup asks for concepts like "space",
"agent id" or "mailbox" before showing anything working. The empty state that teaches best holds **one exact
phrase to paste**, not a description of the capability (the payments CLI hands over commands, not prose) [10].

## 6. What I could not verify

- The major chat assistant's own help pages returned 403, so its in-chat notice comes from its announcement and
  press coverage [2][4].
- Notes on the search company's assistant come from third-party guides and one enterprise doc, and the menu
  paths vary by region [5].
- The two papers were read through abstracts and summaries, not in full [7][8].
- I found no public writeup that measures hand-off delight. Section 5's conclusions are INFERRED.

## Implications for Ducter

1. **Group in human terms, not by store.** Settings › Memory opens on a short "About you" summary, grouped by
   life area (work, people, places, preferences, routines) in glossary words. No sections named after the
   digest, window or recall mechanics.
2. **Never show raw working-note titles.** Every line is a plain sentence about the person. Internal note
   titles, task slugs and Mem ids stay behind it.
3. **Correct in place.** Each line gets *Fix this* (an inline edit that also tells the partner) and *Don't bring
   this up* / *Forget*. Saying it in conversation gives the same result, and the page shows that it worked.
4. **Provenance as a quiet source.** One muted line per item: "you said it, 3 Nov" or "learned from a task, 12
   Nov". Said and learned are told apart, because learned-without-a-source is where creepiness lives.
5. **Search** across everything known, plus "newest first". It is cheap and both reference products ended up
   needing it.
6. **Graded off:** Pause (keep, don't use) next to Forget everything (confirmed, permanent), plus a
   this-conversation-only switch. Say plainly what each one clears.
7. **A receipt in the conversation:** a quiet "remembered" line the person can tap to reach that item in place,
   in keeping with Ducter's proactive restraint. Never show what was read.
8. **Bridge: one exact phrase per agent.** The Bridge card shows a copyable sentence for each terminal agent the
   person has, e.g. "Ask Ducter to …", worded for each coding harness Ducter supports. Concrete words only. No space,
   agent id or mailbox vocabulary before the first success.
9. **A live waiting state that turns into a confirmation.** After copying, the card shows a calm "listening for
   your first message from <agent>" state, plus a *Send a test* button that fires a sample. On arrival it
   flips in place to "Got it, from <session> on <computer>".
10. **A one-time first card that explains itself.** The first real hand-off lands in the conversation as a card
    that says where it came from and what will happen ("Your <agent> session in <project> asked me to …; I'll
    reply there"). Later ones are plain. The reply always goes back to where the request came from.
11. **Acknowledge in seconds.** The sending session should see a receipt right away, the way an agent reacts to
    an assignment, so nobody wonders whether the hand-off landed.

## Summary

Memory UIs are moving from raw lists to grouped, human-language profiles in which every claim can still be
fixed in place ("make a correction", "don't mention this again"). They come with graded off switches and a
quiet in-chat receipt. Research says people mostly don't know what was remembered, and that proactive, in-context
control earns the most trust. Hand-offs feel magical when they are acknowledged instantly, land where the person
already looks, start from one copyable phrase, and can be proven with a test event that turns a live
"listening" state into a confirmation.
