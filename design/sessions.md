# Every task open: finding, reading and reusing earlier tasks (D391)

Technically a task is an agent session (`motivation.md`), and every background session is fully
open to the person whenever they want it. This note says how a person, or the partner on their
behalf, finds the right earlier task, sees where it stopped, carries it on, or redoes it from one
of its steps. It builds on 做过的事 / Past tasks (`past.md`, D285), 手头的事 / On hand (`on-hand.md`),
continuity first (D373), carrying on outside sessions (D299, D376, D377) and the workbench
(`workbench.md`). The audit, the field's evidence and the naming panels are in
`research/155-sessions-open.md`. Words are the glossary's (`product-model.md`). On screen there is
never "session", "workspace", "palette", "fork" or "archive": the person sees tasks, steps, and
plain verbs.

## Who, what they feel, how it starts

- **The heavy developer** runs 20 to 60 tasks a week across four repos, three computers and three
  agents. Before: Past tasks found a task by words, but the card said only how it ended; to see
  where it stopped they opened it; to try step 3 again with Codex they copied words into a new
  task by hand, and the code came from main, not from that step. Asking the partner for "last
  week's compaction PR" worked only if the task was still in the partner's short list. After: ⌘K,
  a few words, and the task is under the keys with where it matched; the preview beside the list
  says where it stopped (the result, its last words, what it asks, the diff and PR, the steps);
  one key carries it on, another redoes a step with another agent from the commit that step
  started from. In the conversation, "接着上周那个 compaction 的 PR" and "从第 3 步换 Codex 再试"
  are each one turn. Feel: 放心 (nothing is lost, the original is never touched), 顺滑 (one key
  or one sentence), 惊喜 (the code really is as it was at that step).
- **The consumer** says "the Kyoto hotel from last week" or opens Past tasks and types "酒店"; the
  same preview says what was booked; New task from this step is there for "the same search, another
  date" but nothing else is new to them.
- **The fresh user** meets none of it until they look for something: ⌘K or On hand's Find shows
  the field, its placeholder says what it finds, and typing finds. No setup, no concept.

## One model

| Layer | What it is | Kept |
|---|---|---|
| A task | one piece of work and its agent session(s), in its place (worktree and branch, folder, browser) on one computer | the Log |
| Its steps | its brief (step 1), then each later message to it (the person's, or the partner's for them), each with what came of it (the agent's last words before the next step) and the code as it stood when it began (the newest commit the task made before it) | derived from the Log and the branch, never stored twice |
| Where it stopped | its state, its last report in full, its last words, its open question, the branch's +a −d and PR | the card, the Past index |
| Its marks | the person's name, star, tags, picture (D285) | `marks.json` |

Three ways back into a task, each with one meaning:

| Verb | Means | Session | Place | Original |
|---|---|---|---|---|
| **打开 / Open** | look at it as it is | none started | untouched | untouched |
| **接着做 / Continue** (D285, D373) | the same task goes on from where it stopped | its own, resumed (else seeded from its brief and saved progress) | its own worktree, branch, browser and sign-ins | it *is* the original |
| **从这一步开新任务 / New task from this step** (new) | a new task does step n again, differently if the person says so | new, seeded with what led up to step n | repo: a new branch off the commit before step n (else where the task began); a folder or browser task: the same place | untouched; linked both ways |

**带着它开新任务 / New task from this** (D285) stays for new work that uses what one task found.

## 从这一步开新任务 / New task from this step

The name was tested (research/155 §4): 从这一步重来 / Redo from here read as changing the original
(3 of 5 raters); the literal one, the twin of 带着它开新任务 / New task from this, read as a new task
that leaves the original alone. The sheet: **从第 {n} 步开新任务 / New task from step {n}**, the step's
words in a field, the agent chips, the code line, **原来那个不动。/ The original stays as it is.**,
**开始 / Start** and **取消 / Cancel**.

What the new task gets:

1. **Its words:** that step's own words, editable before it starts (step 1 is the brief).
2. **What led up to it:** steps 1 to n−1, each with its words and what came of it, newest kept
   when the budget (about 9 KB) runs out, with a line saying how many earlier ones were left
   out; never anything after step n.
3. **Its code** (repo tasks on the home): a new worktree on a new branch off the newest commit
   the task made before step n began; none made yet: where the task began (its base). Said
   on the sheet before Start: **代码从这一步之前的样子开始（{commit}，{time}）。之后的改动留在原来那个里。**
   or **这一步之前它没提交过，代码从它开始时的样子开始。** Uncommitted work at that moment is not
   recoverable: no harness forks code with a session (research/155 A), and Ducter takes no
   per-turn snapshot yet (todo, with its trigger).
4. **Its agent:** the same, or the one the person picks (chips, as Continue with another agent).
5. **Its link:** `task_open.from` + `fromStep` (+ `fromCommit`); its card's third line says
   **从「{title}」第 {n} 步开的 / Started from step {n} of "{title}"**; the original is not
   changed, so both stay findable and the person compares them side by side in the preview.

Why a new task and not a rewind of the same one: a rewind loses what came after (the person may
want both), cannot be undone, and breaks the original's branch for anything already built on it.
The field agrees: every workbench that forks makes a new item and leaves the source (research/155
B). Native forks (`--fork-session`, `thread/fork`, pi's `/fork`) copy only the conversation and
only within one agent; Ducter's condensed start works across agents and is what lets "换 Codex"
work. Native fork for the same agent is a later optimisation (todo).

## Finding: one field, everywhere

**⌘K: 找什么都行 / Find anything** (⌘O stays as its other key; D216's ⌘K to the composer is
superseded: the palette's own last rows say it to the partner). Mac and wide web: a centred
card over the screen; phone: from On hand's Find, full width at the top, no key hints.

- **No words:** the tasks the client knows, needs-you first, then working, then newest (up to 8),
  then **去 / Go to**: 对话, 手头的事, 做过的事, 给你做的, 设备, 设置 with their keys.
- **Words:** groups in order, each only when it has rows: **手头的 / On hand** (the client's own
  match, instant), **做过的 / Earlier** (core's Past index: every task, words in names, titles,
  tags, branches and PRs, files touched, the person's words, reports, agents and computers, time
  words; the row says where it matched), **给你做的 / Made for you** (D383), **你自己做过的 / Your
  own sessions** (D299), **去 / Go to**; then always **跟 {name} 说：「…」 / Tell {name}: "…"** and
  **新建：「…」 / New task: "…"**. So "find a file" and "find a PR" are finding the task that
  touched it; the row says **文件 / File** or **分支 / Branch** with the words marked.
- **Keys:** ↑↓, ⌃N/⌃P; Enter the row's first action (open; a place: go; Tell: send); ⌘Enter
  接着做 / Continue; ⌥Enter 从某一步开新任务… / New task from a step…; ⇧⌘Enter 带着它开新任务 / New task
  from this; Esc. The selected task's actions stand in a foot bar, each its own button with its
  key (D291).

Ranking is Past tasks' (deterministic, every word somewhere, time words as a range, newer first
on a tie); never a model, so it is instant and the same on every device. **It forgives (D456):**
only when the word itself is nowhere, a Latin word of five letters or more one slip off (a letter
changed, missing, extra, or two swapped) matches a word in a name, title, tag, branch or file at
0.55 of the word, and three to six letters that are a run of a title's initials match the title at
0.8 (`protocol/src/fuzzy.ts`, the Mac's `views/loosefind.go`, the same in the home's index and both
clients' own match). Never subsequence matching over everything: over what anyone said it buries
the right task.

- **The peek (D456):** wide (web ≥ 1000 px with a fine pointer, the Mac from 1100 pt), **停在哪儿 /
  Where it stopped** stands beside the list for the row under the keys: facts, state, what it asks,
  how it ended (at work: its newest words), +a −d and the PR, its last steps with their commits. No
  buttons: the foot holds the ways on. Its steps are asked once a row rests 140 ms. The card keeps
  one height while the words change; a wide row drops its outcome line. A task still on hand that
  the index finds by a file, a branch or its words stands under 手头的 / On hand, with where it
  matched. "By meaning" beyond
words (synonyms, "the slow one") is the partner's job, in the conversation, through task_find
plus its own judgement.

## Where the open task sits, and every key (D456)

- **‹ 3 / 9 ›** in the opened task's bar (web wide, Mac): its place in the order ⌘⇧[ ⌘⇧] walk (On
  hand's list as shown, else needs you, working, waiting, done today), with the steps to the one
  before and after. **⌃1–⌃9** open the first to ninth from anywhere (⌘1–⌘5 stay the places).
- **键盘 / Keyboard** (⌘/, and a row in ⌘K's 去 / Go to): every key by where it works, from one list
  of rows on each client (`apps/web/src/keymap.tsx`, `views/keymap.go`), and one line saying that a
  slip and the initials find too.
- **A task's state is the newest by seq** on both clients: an older page of its Log (D320) landing
  after the newest never turns a done task back to working.
- **紧凑 / Compact** (D457): **打开的任务 / An opened task** is **宽松 / Comfortable** (default) or
  **紧凑 / Compact**, in Settings › Look and sound (the web's 这台手机 / This phone), this device
  only, and **⌘⇧D** from anywhere (in 键盘; a toast says which). Compact: the face at 40 on one line
  with the title, the state and who does it under it; the turns, the rail's rows (44) and the
  workbench's header close up; the type scale and the reading measure stay.

## 做过的事 / Past tasks as the list of every task

Unchanged where D285 holds; added:

- **Chips:** after the agents, the computers (from two), then **做完了 / Done · 没做成 / Didn't
  work · 取消了 / Cancelled · 还在手头 / Still on hand** (how it ended; `PastQuery.ended`). With
  a filter on, what is on hand is listed too.
- **停在哪儿 / Where it stopped** (wide: a column beside the list for the selected card; phone and
  narrow: a sheet on tap): the name; its facts, each its own pill (project, branch, computer,
  agent and model, when); **结果 / How it ended** (the last report in full); **最后说的 / Last
  words** when they differ; **在问你 / Asking you** in the needs ink; +a −d with 草稿 PR / 已合并;
  **步骤 / Steps**: 第 n 步, who (你 / You, {name} 替你说的 / {name}, for you), the words, what came
  of it, the commit as a small mono pill, and on hover **从这一步开新任务 / New task from this step**. Its foot:
  打开, 接着做, 换一个 agent 接着做, 带着它开新任务 and 从某一步开新任务…, each its own button.
- **Keys:** as D285, plus Space or → for the preview, ⌥Enter redo from a step. On wide screens
  a single click selects and double-click or Enter opens.

No new place (D71): Past tasks already is the list of every task (On hand is what is alive);
a separate "Sessions" place would be a second list of the same things with a developer's word
on it. The palette is not a place either: it is a way to any place and any task.

## The partner (AX)

| The person says | The partner does | Tools |
|---|---|---|
| "接着上周那个 compaction 的 PR，把锁粒度改细" | finds it, carries the same task on, names it in its line | `task_find`, `task_send` |
| "我上个月在 haswell 上那个 Rust 构建的，再弄快增量构建" | the same; the computer narrows, dropped if it isn't a name here | `task_find`, `task_send` |
| "WAL 那个从第 3 步换 Codex 再试" | redoes step 3 with Codex as a new task; one line says so | (`task_find`), `task_fork` |
| "从加 io_uring 那一步重来" | reads the steps first, picks the step whose words fit | `task_find {taskId}`, `task_fork` |
| "pick the bloom filter one back up" (two fit) | asks which, naming each by what it was about | `task_find`, no send |
| "接着我终端里那个 Claude" | unchanged (D376) | `own_session_find/continue` |

- **task_find** {words, computer?, agent?, ended?} returns at most five, best first, each with
  where it stopped (ended, result, last words, asking, branch, PR, changes, steps, where it
  matched, what it was redone from) and the time as "N days ago (date)"; {taskId} returns its
  steps with the commit each began at. Same index as Past tasks; only in a turn the person asked.
- **task_fork** {taskId, step?, harness?, model?, words?} opens the redo (above); its line is the
  one said before the call, as task_open's.
- **The partner's short list** (its projection) now says how many earlier tasks it doesn't list
  and that task_find finds them; persona rule 2d names task_find for a task the person names and
  task_fork for a redo.
- **Say which and why:** one clear fit is acted on and named by title and day in the line; two
  alike get one question naming each; none: own_session_find if it may be theirs, else one
  question. A redo never sends to the original.

## Organizing verbs: only those that earn their place

Kept (D285): rename, star, tags, picture; D360 groups. Not added:

- **Archive:** Ducter already keeps every task in Past tasks and removes a finished task's
  worktree after a merge or 14 idle days, bringing it back from its branch on Continue; a verb
  would be a second way to do what happens by itself. Reopened when someone asks to hide tasks
  from Past tasks.
- **Pin to the top of On hand:** the star already leads Past tasks and the palette's empty state
  shows what is alive; reopened with the first request to keep a finished task on hand.
- **Compare two:** the preview of each, one after the other, plus the workbench's changes
  (D214). A side-by-side diff of two tasks' branches is in `todo.md`.
- **Open its terminal:** the workbench's Open in the editor (D198) and Copy path cover it; a
  server-owned terminal stays in `todo.md` (D214).

## Edge cases

- **A worker's repo task:** its commits are read on the home only for now; on a worker the redo
  starts from where the task began and the sheet says so (`todo.md`).
- **A step written while the agent was mid-turn** (a steer): it is a step like any other; what
  came of it is the agent's next words.
- **A task with one step:** New task from this step is the same as "do it again", from its base.
- **A redo of a redo:** links to its own source; the chain is visible one hop at a time.
- **The original still working:** the redo is allowed (different branch); the sheet adds no
  warning, since nothing is shared.
- **A dropped or failed task:** redo works the same; the original keeps its ending.

## Where it lives

`packages/protocol/src/past.ts` (PastStep, PastForkInput, past_steps / past_fork, filters),
`packages/core/src/{past,redo,ws,newtask,registry}.ts`, `packages/partner/src/partner.ts`
(task_find, task_fork), `apps/web/src/{onhand,past,app}.tsx`, the Mac's
`apps/desktop/internal/views/{past,taskswitch,…}.go`.
