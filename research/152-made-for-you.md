# 152 · Made for you: what Ducter already records about the things it made, and the name

Gap #9 of `research/150-gap-audit.md` ("what it made is found only through its task"; scenarios
I3, I4, I5). This note records what the Log and the media store already hold, where a browse
place could live, and a naive-rater test of the tab's name. Feeds D383.

## 1. What is already recorded (VERIFIED, read in source on 0.0.87)

| Thing | Where it is | Opened by today |
|---|---|---|
| Files and pictures a task chose to show | `report.media` (D206), copied into the content-addressed media store; `MediaRef.from.taskId` names the task | the viewer (D239) from the result message |
| The same, relayed | `ai_msg.media` under the partner's words | the same |
| A file a task wrote | `task_event` role tool, `Write` / `write_file` / `create_file` with `file_path`; Codex's `apply_patch` "*** Add File:" | nothing, unless its report links the path |
| A file a report or reply links to | Markdown links and code spans in `report.summary` / `ai_msg.text` | `file_open` (D356) |
| A file a task cites as evidence | `report.evidence` kind `file` (checked `verified` / `missing` at done) | a chip in How I know |
| A page | `report.evidence` kind `url` | a chip |
| A PR | `job_status` act `open_pr` with its address; `TaskCard.integrated` | the result's buttons |
| Tables, charts, lists | `ai_msg.ui` (D303), its plain form in `text`; pinned ones in `pins.json` (D381) with older versions in `was` | the conversation, the pinned sheet |
| What the person asked | `user_msg` text; `ai_msg.replyTo` names the message a reply answers | — |

So an index needs no new store: Past tasks' approach (D285: built from the Log on first use, kept
live by subscription, deterministic search) carries over. Past tasks already indexes the files a
task touched, but as one of a task's fields: it finds the task, not the table inside a reply or a
file across tasks. Nothing indexes blocks or shown files by themselves (INFERRED from the absence
of any reader of `ai_msg.ui` outside the clients and pins).

What is not recorded: the contents of a file a task wrote and never showed (only its path), and
anything about a file after the task ended (moved, deleted). Opening such a path goes through
`file_open`, which says why when it can't (gone, offline, outside).

## 2. Where browsing lives

Candidates, against D71 (no new place unless clearly better) and principle 20 (three zoom levels):

| Candidate | For | Against |
|---|---|---|
| A new place (a fourth level, a "Files" page) | familiar from Drive and chat apps' media pages | a new place to learn and find; splits "earlier" across two places |
| On hand's Done lane, "做好的东西 →" (I-results IQ3) | the 2026-11 draft | On hand was rebuilt around what is on hand now (D261); the history lives in Past tasks (D285) |
| **A tab in Past tasks** | Past tasks is already "earlier work", with the field, time words and chips; one more tab is one more lens | the sheet gets a third tab |
| Hits inside Past tasks' search only | no new surface | can't browse pictures or tables by kind; a hit still lands on the task |
| The opened task's workbench files (D214) | the place a file lives | needs the task first: the gap itself |

Chosen: a tab in Past tasks, between 做过的事 and 一直在跑的.

## 3. Asking first

The person remembers the moment and the topic (I-results I4). The partner already answers from
the Log (`log_search`), but that returns events to read, not the thing to hand back, and the
partner can't attach an old file to a reply. A partner tool (`made_find`) returns the made things
by words, time and kind, and `show` puts them under the reply as they are. In the first eval try
haiku answered "where's the seating chart you made for the wedding?" from `log_search` and memory
without the index (honest, but a list of tasks and a question back); a persona line and a
pointer in `log_search`'s description ("A file, picture, table or PR Ducter made: made_find
instead") made it look in the index first.

## 4. The name: LLM proxy raters (haiku, one candidate per call)

Method: `claude -p --model haiku --no-session-persistence` from a scratch folder; no
`~/.claude/projects` folder was added (174 before and after). The stimulus: a personal-AI app's
page with three tabs, 做过的事 / Past tasks, the candidate, 一直在跑的 / Ongoing. Three personas
(the heavy developer, the consumer, the fresh user), two runs each. Asked: what is inside; would
you tap it for the visa PDF it made last week, for the Mac comparison it made in the chat, for the
task you gave it last Tuesday (the wrong answer); clarity 1–5; one false implication. LLM raters
only; numbers say how a careful naive reader parses a label, not how people feel.

Round 1 (name alone, n = 6 each):

| Candidate | PDF | Chat table | Task (wrong) | Clarity | False implication raised |
|---|---|---|---|---|---|
| 做出来的 | 6 | 5 | 0 | 3.17 | only files, not the process |
| 做好的 | 6 | 3 | 0 | 2.83 | "all finished tasks", "only good ones" |
| 做好的东西 | 4 | 2 | 0 | 3.33 | only files to take away |
| 它做的东西 | 6 | 5 | 0 | 3.00 | — |
| 成品 | 6 | 3 | 0 | 3.17 | only final versions |
| 文件 | 6 | 0 | 0 | 3.00 | your own uploads |
| Made | 6 | 1 | 0 | 3.00 | things you made yourself (3/6) |
| Things made | 6 | 0 | 0 | 3.00 | every chat reply |
| Finished | 2 | 0 | 1 | 2.67 | finished *tasks* (6/6) |
| What it made | 6 | 2 | 0 | 3.33 | — |
| Files | 6 | 0 | 0 | 3.33 | uploads; not chat tables |
| Results | 5 | 0 | 0 | 3.17 | every chat answer |

The glossary's earlier 做好的 / Finished read as finished tasks in English (6/6) and as a twin of
做过的事 in Chinese; every name alone left raters unsure a table made in the chat is there.

Round 2 (the three best per language, alone and with the tab's one line "{name} 给你做的文件、图片、
表格和链接，聊天里做的也在这里。", n = 6 each):

| Candidate | Chat table alone | Chat table with the line | Clarity alone / with |
|---|---|---|---|
| 做出来的 | 3 | 6 | 3.00 / 3.67 |
| 给你做的 | 5 | 6 | 3.00 / 3.83 |
| 它做的东西 | 6 | 6 | 3.00 / 3.83 |
| What it made | 1 | 6 | 3.00 / 3.50 |
| Made for you | 2 | 6 | 3.00 / 3.67 |
| Things it made | 0 | 6 | 3.00 / 4.00 |

No rater in round 2 read any of them as the person's own uploads or as the tasks. With the line,
all reach 6/6. Chosen: **给你做的 / Made for you**: the two languages say the same thing (it was
made, for you), "Made" alone read as "made by you", and it carries the partner's care without a
new concept. 它做的东西 tested best alone in Chinese but has no clean English twin ("Things it
made" was weakest alone) and names the partner as "it". The line under the tabs is part of the
design, not a fallback.

## Implications for Ducter

- Build the index from the Log and the media store, the way Past tasks does; no new store.
- Ask first: a partner tool that finds by words, time and kind, and shows the thing itself.
- Browse in Past tasks' middle tab, **给你做的 / Made for you**, with its literal line.
- Retire 做好的 / Finished and 做好的东西 / Everything finished from the glossary for this.
- Left: saving into a place (I3), versions, sharing (I5), deleting from the list, and finding by
  the contents of a file the home never read.

Summary: everything Ducter makes is already in the Log or the media store; a deterministic index
over it, a partner tool and a third tab in Past tasks close gap #9 without a new place. Haiku
raters chose 给你做的 / Made for you with a literal line under the tabs.
