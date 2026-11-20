# Past tasks (做过的事): finding earlier work and picking it up again

How a person finds a task they had before, marks it so they find it faster next time, and gets
back to work from it. Decided in D285; the scenarios and the evidence are in
`research/93-past-work.md`. Words are the glossary's (`product-model.md`); visuals are Pebble's
(`ui.md`).

## Who and how it starts

- **The heavy developer** comes back to "the refactor from last Tuesday", "the task that found
  the flaky test's cause", "everything about hawdb compaction". They type a few words, a file
  name or a branch and get the card first.
- **The consumer** comes back to "the hotel booking in Kyoto" or "that call to the dentist". They
  never need a filter or a tag: words and dates find it.
- **The fresh user** meets it with no setup. On hand's last line says **做过的事 ›**, and an empty
  Find in On hand offers **在做过的事里找「…」**. Nothing has to be learned first.

## The place

A view, **做过的事 / Past tasks** (three tabs: 做过的事, 给你做的 / Made for you (D383), 一直在跑的): on the Mac a whole-window place (like On hand at the whole
screen); on the web a sheet, a centred 920-wide panel when wide, the whole screen on a phone.

Ways in:

| From | How |
|---|---|
| On hand | Its last line, **做过的事 ›**, under every section (the seen fold leads to it: what you have seen today is also there, with everything before) |
| On hand's Find | No match: **在做过的事里找「{q}」 / Look for "{q}" in Past tasks**, which opens it with the words |
| 找什么都行 / Find anything (⌘K, ⌘O; D391) | Its 做过的 / Earlier group finds every task in place; Enter opens, ⌘Enter continues |
| The Mac's menu | **做过的事… / Past Tasks…** (⌘Y) |

Esc clears the field, then goes back to where it came from.

## The field and the filters

One large field: **找以前的事：说过的话、文件、分支、哪天… / Find earlier work: what was said, a file, a branch, a day…**.
It searches as you type (no Enter), across, in this order of weight: the person's name for a task,
its title, its tags, its branch and PR, its project, the files it touched, the person's own words
in it, its agent and computer, its reports, its brief, the agent's words. Every word must match
somewhere; when nothing has them all, the closest show instead. Time words become a date range
on when it was worked on, said under the field (**上周二 · 11月10日**): 今天, 昨天, 前天, 这周, 上周,
上周二, 周二, 这个月, 上个月, 最近 7 天, 3 天前, 11月10日, and the English ones.

Under the field, one row of chips, each a filter (the chosen one the knob, D270): **全部 / All**,
**标了星的 / Starred**, then the projects, the agents and the tags in use, most used first. D391: then
the computers (from two) and how it ended (**做完了 / Done · 没做成 / Didn't work · 取消了 / Cancelled ·
还在手头 / Still on hand**).

D391: on a wide screen the selected card's **停在哪儿 / Where it stopped** stands beside the list (a
sheet on a phone): how it ended in full, its last words, what it asks, the diff and PR, and its
steps, each with **从这一步开新任务**. A single click selects; double-click or Enter opens.

## The list

Without words: **标了星的 / Starred** first, then **今天 · 昨天 · 这周 · 上周 · 这个月** and months.
What is still on hand is not listed (it lives in On hand) unless starred. With words: one list,
best first, every task included, those still on hand said so.

A card, at a glance what it was and how it ended:

- the **picture**: a 36 clay pebble with a drawn glyph: the person's glyph on their tint, or
  Ducter's guess from the task's own words in muted ink on the sunken ground;
- line one: its **name** (the person's, else its title), the star, its tags as small chips;
- line two: **how it ended**, the first line of its last report; while searching, **where the
  words matched** instead: **你说过 / You said**, **它说过 / It said**, **文件 / File**,
  **分支 / Branch**, **标签 / Tag**, **最初的要求 / The ask**, **原名 / Was**, with the words marked;
- line three, small: project · agent · date · **+a −d** · 已合并 / 草稿 PR, and an ending other
  than done: **没做成 / Didn't work**, **取消了 / Cancelled**, **还在手头 / Still on hand**.

Hover (or the keys on it) lifts the card 2 pt with a deeper drop, and shows its actions.

## Actions

| Action | What it does |
|---|---|
| Open (click the card) | The task as it is, read-only until you write to it (the opened task, D152) |
| **接着做 / Continue** | The same task goes back to work and opens: its own session resumed when the agent still has it; otherwise a new session in the same task from its brief and saved progress (the runner's resume-or-seed); a worktree removed after a merge comes back from its branch; a task on a computer that is away says so and starts when it is back. Still on hand: **打开 / Open** instead |
| **换一个 agent 接着做 / Continue with another agent** | The ⋯ menu: the same, with another agent; the saved progress goes over (D89's switch) |
| **带着它开新任务 / New task from this** | New task opens at the same place with a chip **带着「{name}」的发现 / With what "{name}" found**; the new task's brief is the person's words, then that task's reports, branch and files. The chip can be removed |
| **标记 / Mark** | The marks popover |
| **从这一步开新任务 / New task from this step** (D391) | On a step in 停在哪儿 / Where it stopped, or 从某一步开新任务… in the foot: a new task does that step again from what led up to it, its code from the last commit before it, any agent; the original stays (`sessions.md`) |

## Marks

Kept per persona on the home (`marks.json`), the same on every device, changed from any.

- **改名字 / Rename**: the person's name becomes the task's title everywhere (On hand, the task,
  the switcher); the old title stays findable and is shown as **原名 / Was** when it matched.
- **标星 / Star**: the star pops (scale 1 → 1.3 → 1, 220 ms, the clay tock); starred tasks lead.
- **标签 / Tags**: up to five, free words with suggestions (tags in use, the task's project). A
  chip drops in on add; × removes.
- **图案 / Picture**: ten drawn glyphs of kinds of work, **修问题 / Fix · 做东西 / Build ·
  查原因 / Look into · 审一审 / Review · 写东西 / Write · 发布 / Ship · 数据 / Data · 沟通 / Talk ·
  跑腿 / Errand · 想法 / Idea**, on six clay tints (陶土 · 沙 · 苔 · 雾 · 藕 · 石). The tints are the
  person's own grouping and never a state's colour. **不用图案 / No picture** goes back to the guess.

## Keys (Mac and wide web)

`/` the field; ↑↓ or j/k walk the cards; Enter opens; ⌘Enter continues; ⇧⌘Enter new task from
this; `s` stars; `r` renames; D391: Space or → the preview, ⌥Enter a new task from a step; Esc
clears, then goes back.

## 给你做的 / Made for you (D383)

The middle tab: the files, pictures, tables, charts, lists and links the partner and its tasks made,
found by a name, a kind, a day or what is in them, each opened with what already opens it. The
field's words are shared with the first tab. `made.md`.

## 一直在跑的 / Ongoing

The second tab: what keeps going on its own. Two kinds, one set of gestures.

| Kind | What it is | Its runs |
|---|---|---|
| A routine (D114) | on a schedule or a condition, each firing a run (a task) | each run, done, didn't work or skipped |
| A task resting on its own wait (D267/D279) | it looks again every so often | each look that changed something, and its reports |

**A task resting on its own wait (D394).** It has one timer of its own (the newest; another wake
moves it, never adds one), and a round that found nothing new is silent: no report, its pebble
only. It reports when something new needs the person, and then says what still stands. What
would reach other people (a review on someone's PR) is drafted and asked once per round, all drafts
in one card (**3 个 PR 的评审写好了，发到 GitHub？ / 3 PR reviews are written. Post them to
GitHub?**), each draft opened from the card on the phone and the Mac; Go posts them (D61 GQ10, no
countdown). What the person said may go without asking (D413, **不用问我的 / Without asking**)
posts in the round with no card, and the line says **3 份评审已发到 GitHub / 3 reviews posted to GitHub**. A review task reports each round with `review_report`; its card adds a standing line under the
state line: **8 个请求在等你：3 个有新提交已复审，5 个没变 / 8 requests wait on you: 3 had new commits
and are reviewed again, 5 unchanged** and **3 份评审还没发 / 3 drafted reviews not posted yet**, each its
own element. While its round card is unanswered the card stands under **等你** (the card is the one needs-you, never counted twice) and goes back to **等下一次** once it is answered. Each draft is that PR's pre-read (`task-sources.md` §9), opened with **看草稿 / Read
draft** from the round's card. A round after a long rest, or after its session compacted, starts in a
fresh session from the brief and its latest progress (Codex, Claude Code).

A card: the picture (a drawn repeat for a routine, a clock for a task, or the person's mark), the
name, one state line (**{cadence} · 下次 {time}**, **每 45 分钟看一次 · 下次 {time}**, **暂停到 {time}**,
**暂停了，等你恢复**, Ducter's own reason when it paused one), and the last twelve runs as 10-pt
pebbles in the state colours (done and it happened green, didn't work red, skipped an outline,
looked yellow, running blue and breathing); a pebble opens its run. Sections: 等你, 正在跑,
**等下一次 / Up next** (soonest first), **暂停了 / Paused**. A paused card is calmer: muted ink, its
pebble settled 2 pt; it lifts back on resume.

| Gesture | Routine | Task resting on a wait |
|---|---|---|
| **暂停 / Pause** ▾ 1 小时 · 明天早上 · 一周 · 直到我恢复 | the routine's own pause; the time kept beside it | its waits end and are kept as they were (`paused.json`) |
| **恢复 / Resume** | resumes; also by itself at the time | the same waits armed again |
| **现在跑一次 / Run now** · **现在就去看一次 / Check now** | one run now (also while paused) | one look now |
| **改时间 / Change when** | every day, weekdays, every week, every few hours, and the time | (a wait keeps its own pace) |
| **结束 / End** · **不用再去看了 / Stop checking** | ends it | ends the waits |
| **多久跑一轮 / How often** (D427, a task in rounds) | (改时间) | every 15, 30, 45 min, 1, 2, 4 h, from the round waiting now |

### A task in rounds is a promise Ducter keeps (D427)

A task that rests on its own wait between rounds ("每 45 分钟 review 一轮", "每天早上看一下机票")
is a **loop**: Ducter keeps it (`core/src/loops.ts`, a `task_loop` record on the task's stream,
rebuilt on every start), not the agent's habit of calling `wait_for` again. It is known from the
person's words in the brief (每 45 分钟, 每天, 一直, every morning, keep checking) when it first
rests on its own wait, or from its rounds (it rested again after a wake). Then:

- **Only the person ends it**: dropping the task, **结束 / End** on its card, "别跑了" through the
  partner (`routine_change end`), or a stop said to the task itself; or the end condition they
  gave in the brief ("直到 #10473 合并"), which the task's done then means.
- **Nothing else does.** A round's done or failed report ends the round (the card stays on 等下一次);
  a crashed harness, a card marked done, a turn that forgot to re-arm, a lost wait, a restart or an
  upgrade bring the next round back by itself: at its time, or once soon when that is behind (one
  catch-up, never a burst). A round that can't start (its computer asleep, the runner not up) is
  tried again every 10 min. The person's own rhythm (**多久跑一轮**, or "把 review 改成每小时") wins over
  the task's: its later waits follow it.
- **The watchdog says it once.** A round overdue by half its rhythm (between 15 min and an hour),
  a round running three rhythms (at least two hours), or three failed rounds in a row: one card,
  plainly, with its Go **现在跑一次 / Run it now** (`decision.loop`), at most once in 12 hours,
  never when the task already asks (the runner's "asleep" card). An agent out of allowance says
  nothing more: D297's wait carries on at the reset.

**The card's health line** (only when it isn't on time; silence means fine), in its state's ink
with a small drawn mark, each fact its own element: **晚了 {n} / {n} late** with why
(**{computer} 睡着了，醒了马上补一轮 / {computer} is asleep; it catches up as soon as it wakes**,
**这一轮跑得太久了 / This round is taking far too long**, **这一轮还没开始 / Its round hasn't started
yet**), **额度用完了，{time} 恢复后接着跑 / Out of allowance; carries on at {time}**, **它的账号要重新
登录 / Its account needs signing in again**, **最近 {n} 轮都没做成 / Its last {n} rounds didn't work**,
and for a day after a stop by mistake **{time} 被误停，已经接着跑了 / Stopped by mistake at {time},
running again**. Its one fix, **现在跑一次 / Run now**, is the card's primary button (kept in sight on
the Mac). Under it **上一轮 {time} / Last round {time}** (a routine: **上次 / Last run**) and that
round's one line, clipped; with the pebbles, **where it runs** and **which agent** (Ada's MacBook
Air, Codex). A task in rounds says **每 {n} 一轮 / A round every {n}**. The partner answers "我的循环
任务都怎么样了" from the same list (`routine_list`, the one not on time first) and changes one by
talking (`routine_change`: pause, resume, run now, every, end). `#ongoing` opens the tab.

### Saying how it's doing, and running it where it can (D429)

- **"这个循环怎么样了" in one line.** `routine_list` gives each item a ready line, `say`, in the
  person's language: the rhythm, the next round and on time, or why not and the fix waiting for
  their tap (「看 nowledge-co 的评审请求」在跑，每 45 分钟一轮，下一轮 14:46，按时。 / “Review
  requests on nowledge-co” is running, a round every 45 minutes; the next is at 14:46, on time.).
  Rule 15: always `routine_list` first, then that line for the one asked about, as it is; about all
  of them, their lines, the one not on time first. No internals ("resting between rounds") reach
  the person because the list no longer carries them.
- **A round knows it is a round.** The wake a task in rounds gets ends with one more paragraph:
  **这是循环里的一轮：这一轮做完，用 report_to_main 报 progress，不要报 done；下一轮到时 Ducter 会叫你。**
  (with the person's until: done only once 「{until}」 holds). The transcript reads it as the same
  wake hairline.
- **The late line names the computer** wherever it is known (a worker's name, the home's own), and
  when that computer is asleep and another is awake to take it (the home first: it is the one
  keeping time; else an online worker with the task's agent signed in; never a folder's task, nor
  a repo's, whose move pushes its branch and keeps task_switch's own Go), the line adds **{name}
  醒着 / {name} is awake** and the card's one fix becomes **换到醒着的电脑上跑 / Run it on an awake
  computer** (`fix: "move"`, `moveTo`). The keeper's card says it too, with that Go. The tap is the
  person's go: the task moves there with D157's move (its saved progress), then a round runs at
  once. Nothing moves without the tap.
- **The Mac's ⋯ is the clay menu (D421)**: 多久跑一轮 a submenu of the rhythms with the current one
  marked; 改时间 opens its own small sheet at the ⋯ (a time field has no place in a menu); 打开,
  标记, then 结束 in the failed ink.

## Edge cases

- **The agent's session is gone** (an old Claude Code session pruned, another computer): Continue
  still works; the task says **之前的记录接不上了，从保存的进度接着做** (D207's line).
- **The worktree was removed** (merged, or idle past the archive horizon): it is added back from
  the kept branch; a branch deleted since makes Continue fail with the runner's words.
- **From the conversation** (D373): the partner continues a task the talk was on, or one the
  person names ("接着昨天那个 compaction 的活"), the same way as Continue: `task_send` to it; the
  task's line moves under the newest ask. New only for separate work, after a merge, or when
  asked ("开个新的"). A follow-up that needs another computer's sign-ins moves the task there
  first (D376, `where.md` §6.1).
- **On another computer**: the card says which; Continue on a computer that is away answers with
  its line, and the person can pick another agent (or Move, D157) from the opened task.
- **A dropped task**: Continue brings it back (it is no longer dropped).
- **Hundreds of tasks**: the index is built from the Log on first use and kept live; a query
  reads memory only.

## 也在这台电脑上 / Also on this computer (D299)

The sessions the person ran by hand in their own AI agents on the home (Claude Code, Codex, pi),
under Ducter's own cards as one quiet section with one line (D327: it names the home and the
scope): **你自己在 {computer} 上用 AI 做过的：只读名字、文件夹、时间和你说的第一句与最后一句，密钥一律遮住。
接着做，就在 Ducter 里接着同一段对话。/ What you did yourself with your AI agents on {computer}. Only
names, folders, times and your first and last words are read, keys hidden. Continue carries on the
same conversation in Ducter.** Where they live and what their records say: `research/103`.

- **D327:** on by default (the person came here to look; research/115), and governed by the one
  switch **读它们留下的记录 / Read what they keep**: off, nothing from the records is listed or
  read. Keys are hidden at the reader, before a title exists. The ⋯ menu adds **这个文件夹别看了 /
  Leave this folder out** (that folder and those inside it, here and in the first words' offers;
  Settings lists each with 再显示). Files of another account on the computer are never read.

- **Read** only when Past tasks asks (or, D376, the person asks the partner for one), on the home, each file's head and tail only (the shared
  reader `packages/core/src/local-agents/`, also D298's), kept until the file changes. Ducter's own
  sessions never show (their ids are in the Log; its data folder, the Ducter folder and temporary
  folders are left out); one carried on already shows as its task.
- **Found** by the same field: its name (`/rename`, Claude Code's own title, pi's `--name`), the
  person's first and last words, its folder and project (a worktree of another agent workbench is
  its repo), its branch, its agent, and time words; the agent and project chips narrow it; starred
  and tags are Ducter's tasks only. Newest first without words, at most 40.
- **A card:** the picture guessed from its words (the same rule as a task's, pressed into the
  ground), its name, the person's first words (or where the words matched), and project, agent,
  branch and day, each its own word. A folder no longer there: **文件夹不在了 / Folder gone**, and
  Continue says why instead.
- **接着做 / Continue:** a new task working in that folder directly (no copy), the same agent
  resuming that very session by its id, which appends to its own file as by hand. Its transcript
  opens with **在 {agent} 里开始的，{day} / Began in {agent} on {day}**, the last 60 turns (the
  person's words and the agent's), then **{time} 在 Ducter 里接着做 / Picked up in Ducter at
  {time}**. Again on the same session opens that task. Its Past card then says **从 {agent}
  接过来的 / Carried on from {agent}**.
- **⋯:** **换一个 agent 接着做 / Continue with another agent** (the other agent starts there from
  what the session said, D282's condensed start; also the fallback when the agent refuses the
  resume), and **不再显示 {agent} 的 / Don't show {agent} here** (for good, on the home; the
  section's last line **不显示的：{agents} / Not shown: {agents}** with **再显示 / Show again**).
- **Still open where the person runs it** (D376): never carried on. Claude Code keeps one file per
  running process (`sessions/<pid>.json`, with the session's id): a live one says **它还在 {agent}
  里开着。先在那边退出（/exit），再在这里接着做。 / It's still open in {agent}. Close it there first
  (/exit), then carry it on here.** A session written in the last two minutes (Codex and pi keep no
  such file) says once **{agent} 刚刚还在写它。那边关掉了的话，再试一次。 / {agent} wrote to it a
  moment ago. If it's closed there, try again.**, and goes when asked again within 10 minutes.
- **From the conversation** (D376): "接着我终端里那个 Claude 在做的" finds it with the same reader
  (`own_session_find`: at most 5, newest first without words, the agent and time words narrow it)
  and carries it on the same way (`own_session_continue`), the person's words for it sent with its
  first turn and shown as Ducter's words to it after 在 Ducter 里接着做; the partner's line is the
  task's ack. Only when the person asks, never from a report or a routine; off (读它们留下的记录)
  means nothing is read. Two close matches: the partner asks which, naming each by what it was
  about and its folder. The first look ever, Ducter says once, before the answer, **我看了
  {computer} 上你在 {agents} 里的对话记录：只看名字、文件夹、时间和你说的头一句，不看代码和文件。 / I
  looked at your {agents} conversations on {computer}: only their names, folders, times and your
  first words, no code or files.**
- **On a computer for tasks** (D377): the partner also looks on every awake computer for tasks
  whose records the person said yes to on its card in 你的设备 (**读它们留下的记录 / Read what they
  keep**, saved on that computer, which reads them itself and sends up only what D327 (4) names);
  before the yes, that computer says only which agents wrote there and when (file times). Found
  there, a session is carried on there: a folder task on that computer, the same agent resuming it,
  the open check made there. When the person's agent wrote more lately on a computer not read yet,
  the partner's whole answer is **你最近在 {computer} 上用过 {agents}，那台电脑上的记录我还没读过。在
  「你的设备」里打开 {computer}，点「读它们留下的记录」，我就去找。** The first-look line names the
  computers whose records it read, once per computer.
- **Not here yet:** a computer for tasks' sessions in Past tasks' list (the conversation only, D377),
  New task from an outside session.
