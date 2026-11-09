# 36 · How dots, Muse and Grok Bot keep the main conversation quiet

Question (2026-11-09): the author wants the conversation to show the partner's concise words by
default, "dots muse 都是这么设计的". What do OpenAI dots, Meta Muse and xAI Grok Bot show in
their main conversation by default, and what is one tap away (background work, progress,
approvals, proof, memory, verbosity)? And how quickly does Ducter give first feedback today?

Method: web reading on 2026-11-09 by a research subagent (fetched pages and search results);
Ducter's own client measured on the demo seed (`apps/web/demo.ts`). Several primary pages
refused automated reads (below), so part of this rests on secondary sources.

## What could not be read

openai.com/index/introducing-dots/ (403), help.openai.com/articles/20001530, androidauthority
and technobezz (403); docs.x.ai/grok-bot pages (404). No source describes a visible "Memory
updated" line in any of the three.

## OpenAI dots

- Default chat is short first-person status texts: "I spotted a bug in mobile checkout. I'm
  looking into it now." / "Done. FAQ updated." / "Fixed and tested on mobile and desktop. Ready
  for review." VERIFIED, chatgpt.com/features/dots/
- Background work is not in the chat stream: Activity sits under the dot's profile; "open a task
  to inspect its progress, files, results, or requests for input"; each task has "its own
  conversation, separate from your conversations with your dot". VERIFIED,
  learn.chatgpt.com/docs/dots/tasks-and-memory.md
- Check-ins are questions with a default ("Want me to move it?"); requests are answered in
  Activity; from Slack or texts "it sends you a link to review the request in ChatGPT".
  VERIFIED, learn.chatgpt.com/docs/dots/controls.md, channels.md
- Proof and files are inside the task. VERIFIED, learn.chatgpt.com/docs/dots.md
- No verbosity setting; the user routes by kind in plain words ("routine progress in ChatGPT,
  decisions to you in Slack"). VERIFIED, channels.md, getting-started.md

## Meta Muse (launched 2026-09-08)

- A messaging-style chat with a named avatar. VERIFIED, techcrunch.com/2026/09/08 (layout not
  described).
- Live status sits on the avatar at the top of the screen, not as chat lines: "作業中"
  (working), "何かを作っています" (making something), "メモリーを更新中" (updating memory).
  DOCUMENTED, smartscope.blog
- An Activity log behind the assistant icon records actions and permissions given; scheduled
  items under "upcoming". DOCUMENTED, Meta Help Center (JP rendering), lennysnewsletter.com
- Approvals are a scoped choice (once / this task / this site / always / decline) with "see
  task details" before choosing, as a dialog apart from the chat. DOCUMENTED, meta.com help,
  smartscope.blog (the two list the scopes slightly differently)
- Memory is a file behind Identity → Memory, editable; updates show only as the transient
  avatar status. DOCUMENTED

## xAI Grok Bot (beta since about 2026-08-11)

- The transcript "shows tool activity, computer use, created files, and approval requests
  inline", noisier than dots. DOCUMENTED, eesel.ai/blog/grok-bot-review
- Approvals are inline cards with buttons (Cancel / Call; Allow once / Skip / Always allow);
  a background card expires after 30 minutes; finished replies skip the phone while the
  desktop app is in use, and a needed answer pings the phone about 3 minutes later.
  DOCUMENTED, flaviocopes.com/grok-bot/

## Ducter today (measured)

- Before D104, on the demo seed at 390 px (phone web), the conversation under one result showed
  a proof line, a task link, two clay buttons, a living-message card with a heading, a count,
  two tinted ask cards with countdown bars and four buttons each, and three status rows.
  VERIFIED, `~/dev/ducter-evidence/quiet-conversation/web/before-conversation-*.png`
- While the partner thinks, the only feedback was "在想… / Thinking…" in the header's second
  line; tool calls and task setup were invisible. VERIFIED (code: `summary()` in both clients)
- After D104, first feedback appears 2–4 ms after Send on the phone web (DOM, headless
  Chromium), before any server reply; the steps then follow the partner (scripted at 0.4, 1.5,
  2.3 s). VERIFIED, `web/wait-*.png`, timings in the D104 commit's verification notes. The real
  partner's ack takes about 2.3 s on opus (INFERRED from the author's report; not re-measured
  here).

## Implications for Ducter

1. Words by default in the partner's voice; the task's proof, files and steps live behind the
   message (dots), never inline (Grok Bot).
2. Live progress belongs to the partner, not the transcript: a transient line beside the clay
   partner, gone when the reply lands (Muse's avatar status), driven by what it really does.
3. A decision is a question with its default; the smallest answer row, one at a time.
4. Memory updates are not transcript lines; they are visible on demand and on the partner's
   page (Muse, dots).
5. Interruption by kind, in plain words, rather than a verbosity slider; one display setting
   (Details folded or shown) for the heavy user.

Summary: all three keep machinery out of the default stream except Grok Bot, which is the
noisiest; Muse puts live status on the avatar. Ducter adopts words by default, Details one tap
away, a waiting line beside the clay partner, and one ask at a time (D104).
