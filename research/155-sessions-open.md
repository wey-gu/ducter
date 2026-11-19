# 155: Every task open: an audit of finding, reading and reusing earlier tasks (D390)

The author, 2026-11-19: "我们的设计是在 conductor-like 产品之上的超集，所以，应该能允许用户或者 main ai
找到适合的旧 session 然后继续任何一个 Session task，这方面在 ax/ux 上都要充分考虑，拉满…这里我们做的远远
不够". This report audits what a power user of a multi-agent workbench does with sessions, against
what Ducter has (with code references), adds the field's evidence and the harness facts that decide
what "fork from a turn" can mean, and records two naming panels. The design is `design/sessions.md`.

Reference products are described generically here; their names, pages and versions are in
`research/private/sessions-reference-apps.md` (gitignored), read 2026-11-19.

## 1. Evidence from the author's own use (read only)

- **hel** (the author's home server, Ducter 0.0.8x), `ducter.db` opened read only
  (`mode=ro`), aggregates only. VERIFIED. 33 tasks in 10 days: 26 Codex, 6 Claude Code, 1 pi;
  20 in a browser place, 11 with none, 2 in a folder, none in a repo; 28 tasks with one native
  session, 3 with two (a switch or a rejected resume); 3 of 31 went back to work after finishing;
  of 83 messages to the partner, 3 say carry on (接着, 继续), 6 ask to try again or with another
  agent, none name a task by time ("上次", "last week"). So the home is used for errands so far;
  the author's heavy development still runs in his own terminals.
- **This Mac**, listing only (no file read). VERIFIED. 287 Claude Code project folders, 247
  session files touched in the last 30 days; 65 Codex sessions in 30 days; 532 Claude Code
  session files (subagents included) under the Ducter repo alone. A multi-agent workbench's
  folder holds 6 repos with named workspaces (4 under one repo) and 5 archived contexts. This is
  the scale "find the right old one" has to work at: hundreds a month, across repos.
- INFERRED: the two together say the heavy-dev case is real, but it isn't on the home yet. The
  first time it is, hundreds of tasks arrive at once, so finding has to be instant and the
  partner must not rely on its short list of recent tasks.

## 2. The audit (exists / partial / missing)

Heavy developer first, then the consumer and the fresh user; "now" is main at 0.0.89.

| Job | State | Where (now) | Gap |
|---|---|---|---|
| Find by words, file, branch, time words | exists | `core/src/past.ts` query (weights, time words, CJK bigrams) | none for words |
| Find by repo / project, agent, tag, star | exists | Past chips, `PastQuery.project/harness/tag/starred` | |
| Find by computer | **missing** → built | `PastQuery.computer`, `facets.computers` | |
| Find by how it ended | **missing** → built | `PastQuery.ended` | |
| Find by meaning (synonyms, "the slow one") | partial | deterministic words only | by design: the partner's judgement over task_find |
| Find anything from anywhere (⌘K) | partial → built | D216 switcher (⌘O, client-known tasks only) | now ⌘K over every task, Made, own sessions, places, Tell, New |
| See how it ended (result) | exists | Past card's first report line | full report only by opening → built in the preview |
| See its last words, its open question | **missing** → built | `PastItem.lastWords`, `asking` | |
| See diff and PR | exists | card +a −d, 草稿 PR / 已合并 | CI checks on the row: missing (todo, needs a PR watcher) |
| See its steps | **missing** → built | `past_steps` | |
| Continue the same session, worktree, branch, sign-ins | exists | `past_continue`, runner `resumeOrSeed`, D373 | |
| Continue with another agent | exists | D89 switch, `task_switch` | |
| Fork from a turn (new branch at that step, another agent) | **missing** → built | `core/src/redo.ts`, `past_fork`, `task_fork` | code only from commits (§3) |
| New task from findings | exists | D285 New task from this | |
| Rename, star, tags, picture | exists | `marks.json`, `past_mark` | |
| Group | exists | D360 | |
| Pin to the top | partial | star leads Past; D381 pins are for replies | not added (design §Organizing) |
| Archive / restore | partial | auto: worktree removed after merge or 14 idle days (`runner/src/integrate.ts` `archiveWorktree`), back on Continue | no verb; not added |
| Clean up finished worktrees | exists (automatic) | archive horizon `DUCTER_ARCHIVE_IDLE_MS` | no "what would be removed" list (todo) |
| Compare two | **missing** | | not built: two previews; side-by-side branches in todo |
| Open its worktree in the editor | exists (Mac) | workbench Open in the editor (D198), Copy path | web: path only |
| Open its terminal | missing | | todo (D214) |
| Keyboard everything | partial → built | Past keys (D285), On hand keys (D216) | palette + preview keys |
| Across projects and computers | exists | On hand lens (D261), Past chips | computers chip built |
| Restore after a restart | exists | runner recovery, `resumeOrSeed` | |
| Partner: find from vague words | partial → built | `log_search` (raw events), the short list (8 finished tasks) | `task_find` over the Past index |
| Partner: read where it stopped cheaply | partial → built | `task_read` card/report | task_find carries it; `task_find {taskId}` the steps |
| Partner: continue | exists | `task_send` (D373) | |
| Partner: fork / redo from a step | **missing** → built | | `task_fork` |
| Partner: merge | exists (person) | D125 merge/PR buttons; the partner asks first (rules) | unchanged |
| Partner: say which it picked and why | partial → built | persona 2d | task_find's note: name by title and day; ask when two fit |
| Consumer: "the Kyoto hotel last week" | exists | Past words + time words | preview shows what was booked |
| Fresh user: first meeting | exists | On hand's 做过的事 ›, Find's no-match line | ⌘K placeholder says what it finds |

## 3. Harness facts that decide "fork from a turn" (research/private for sources)

- Claude Code: `--resume`, `--continue`, `--fork-session` (a new id with the history); the
  Agent SDK forks up to a message uuid; `/rewind` restores code only for files its own edit tools
  wrote, not Bash's. DOCUMENTED. A CLI flag to resume at a message is not public (INFERRED name).
- Codex: `codex resume`, `codex fork`, `exec fork` (whole session); app-server `thread/fork`
  (to a turn, inclusive) and `thread/revert`, which "does not revert local file changes".
  VERIFIED from source.
- pi: sessions are trees; `/fork` from an earlier user message, `--fork`, RPC `fork`. VERIFIED
  from its docs; no code rewind found (INFERRED from absence).
- **So no harness forks the code with the conversation**, and a native fork never crosses
  agents. Ducter's redo is therefore: its own condensed start (what led up to the step) for any
  agent, and the code from the newest commit the task made before that step (agents commit their
  work, `runner/src/brief.ts`). Uncommitted work at that moment is not recoverable until Ducter
  takes its own per-turn snapshot (todo).

## 4. What the field does well (generic; names in research/private)

- A ⌘K palette that searches titles and message content and acts on the result (archive, PR,
  jump to what needs you) is universal among multi-agent workbenches; one also has a separate
  branch/PR search key.
- Rows carry status, branch, ± lines, PR and CI; a hover card previews.
- Archive keeps or snapshots uncommitted work before a worktree goes; restore brings the chat
  back.
- Forking: one copies "the changes up to the fork point plus a summary"; another picks a source
  point and a context-transfer strategy (native fork when possible, else portable context). One
  user report: archiving a session deleted a worktree a fork still used (a guard Ducter gets for
  free: a redo has its own branch and worktree).
- What Ducter adds that none has: one finder across agents and computers, the partner finding
  and acting from plain words, and a redo that crosses agents with the code at that step.

## 5. Naming panels (LLM proxies, haiku, five naive raters per call, one call per candidate)

Question for the step action: a finished task lists its steps; hovering step 3 shows X. What
happens; is the original changed (yes count); is there a new task (yes count); is what came after
step 3 kept (yes count); natural (1–5).

| Candidate | Original changed | New task | Later kept | Natural |
|---|---|---|---|---|
| 从这一步重来 | **3** | 1 | 0 | 3.4 |
| 从这里再试一次 | 2 | 2 | 2 | 3.4 |
| 回到这一步 | 2 | 2 | 1 | 3.6 |
| 从这一步分出去 | 1 | 4 | 2–3 | 3.2 |
| 从这儿换个做法 | 1–2 | 4 | 1–2 | 3.2–3.4 |
| 分叉 | 1 | 4 | 1 | 3.2 |
| 从这一步开一件新的 | 1 | 4 | 2 | 3.4 |
| 从这一步另开一件 | 1 | 3 | 2 | 3.4 |
| Redo from here | 2 | 3 | 1 | 3.2 |
| Try again from here | 2 | 2 | 1 | 3.8 |
| Go back to here / Rewind to here | 2 | 2 | 0–1 | 3.2–3.4 |
| Fork from here | 1 | 4 | 1 | 3.6 |
| Branch off here | 0–1 | 4–5 | 1 | 2.8–3.2 |
| New task from this step | 1 | 4 | 1 | 3.0 |

Read: every "again / back / redo" word made some raters think the original changes; the ones
that say a new thing is made did not. Fork and branch read right but are developer words.
**Chosen: 从这一步开新任务 / New task from this step**, the literal twin of D285's 带着它开新任务 / New
task from this (the zh form follows the tested 从这一步开一件新的). The sheet says the rest (the
original stays; where the code starts).

For ⌘K (what does it open for; find last month's work; find a changed file; talk to the AI):
找什么都行 3/2/3, 3.6; 找… 4/2/1, 3.4; 搜索 3/1/1, 4.0; 打开一件事 4/2/4, 3.2; Find anything
3/2/3, 3.6; Find… 4/2/2, 3.6; Search 3/2/2, 3.4. A file was found by at most two of five for
any name: the placeholder names it (**一件事、说过的话、文件、分支、PR…**). **Chosen: 找什么都行 / Find
anything**, with that placeholder. Noise is high (a second run moved counts by one or two); LLM
raters only, no humans.

## Implications for Ducter

1. Keep one list of every task (做过的事 / Past tasks) and make its card open in place: where it
   stopped, its steps, and every way back, on the Mac, the web and the phone. No new place.
2. ⌘K becomes the one finder for tasks, what Ducter made, the person's own sessions and places,
   with Tell and New task as its last rows; ⌘O stays.
3. A redo is a new task from step n: what led up to it, the code at the last commit before it,
   any agent; the original untouched and linked. Per-turn snapshots and native forks are later.
4. The partner gets `task_find` (the same index) and `task_fork`; its short list says that older
   tasks exist and how to find them.
5. Archive, pins, compare and a terminal wait for someone to ask (design note).

**Summary:** Ducter could already find, mark and continue any earlier task, but showed only how it
ended, could not redo a step, filtered neither by computer nor by ending, and the partner found
named tasks through raw Log search or its eight-task list. D390 adds the preview of where a task
stopped, its steps, a new task from any step (code from that step's commit, any agent), the ⌘K
finder, and task_find / task_fork for the partner.
