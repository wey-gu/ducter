# On hand (任务): the conductor surface

How On hand lets one person take in 3 or 50 tasks at a glance and step into any of them. Decided
in D216 (one list), D244 (the rail beside an opened task), D261 (projects as a lens, the strip,
the folds), D535 (every count a door, the overview on arrival, the header the way back; Navigation below), D287 (the partner at its head, the work as cards) and D315 (one short line, the strip of what is
there, headings with character; the review below), D467 (the board by attention: what stopped needs
you, today is today, a source is one summary card, no day beside it) and D471 (one ledger, designed on
the author's real board: the partner's one sentence, then each section one sheet of rows on one grid,
every task said once, every reason in plain words, names said whole) and D498 (alive without a
progress line, a turn's own time, rounds as Ongoing, steps in sentences, the person's own work first
in the to-do source; research/216).
Words are the glossary's (`product-model.md`); the visuals are Pebble's (`ui.md`).

## The two axes

| Axis | What it answers | How it is shown | Kept |
|---|---|---|---|
| **Project** (lens) | Which repository, or part of my work, is moving? | A column at the left of the board (Mac ≥ 1100 pt, web ≥ 1120 px); a row of names when narrower and on the phone, never wrapping (what does not fit is in **更多 / More**) | Per device (`OnHandLens` on the Mac, `ducter.onhand.lens` on the web) |
| **State** (filter) | What needs me, what works, what waits, what got done? | The strip: four counts, each a filter; the board's sections | Not kept: Esc or a second press lets go |
| **From** (filter, D654) | Is this work from GitHub, Obsidian, Linear? | **来自 / From** chips over any project | Not kept: Esc lets go |

**D654 (research/245 §3.2): a project's identity is its repository.** Core derives
`projectKey`/`projectName` once (the normalized `origin`: `github.com/owner/repo`, `git@` and
`https` alike, `.git` stripped, case-folded) and every client reads the card. A folder with no
remote is its own project, keyed by its computer and path. A nested repository (the website inside
the mem checkout) is its own origin, so its own project. Machines and worktrees are attributes,
never projects. A task of no folder stands under **不在项目里 / Not in a project**, or under
**电脑上的事 / On your computers** when it is an errand or a machine set-up. Projects added by hand
(D186) are still rows, before their first task. What belongs to no task (the partner's own asks,
task-less waits, calls) shows under All and 不在项目里.

## The project column

`全部 / All`, each project in the order that matters now: pinned first, then the person's drag
order, else a project with something that needs the person, then the most recent activity; then
不在项目里 and 电脑上的事. Core sends that order (`OnHand.projectList`), and both clients draw it.
A row:

- the name: the repository's short name (`mem`, `mem-backbone`, `nowledge-labs-website`), or
  `owner/repo` when two repositories share one; the person's rename wins. It is one line, cut in
  the middle when too long (`nowledge-…-website`, the start and the end kept), the whole in the
  row's tooltip and the ⋯ menu's head. **其他 / Other** is now **不在项目里 / Not in a project**,
  in muted ink; a person's asks and task-less waits stay there;
- D455: with two or more computers, under it every computer the project lives on (where its tasks
  ran, its routines start and it was added; one origin on any number of computers is one project),
  home first, on one line, each its own small word (never joined), read aloud **在 {computers} 上 /
  on {computers}**; what does not fit is **+N**, and the whole list is in the row's tooltip;
- D471: no line counts (a sum of branches says nothing about a project) and no faces;
- its count, in the needs-you ink where something there needs you (a question, a wait that
  stopped, a task that didn't work out); in the narrow row of names, the name itself in that ink.

D471 (amended): the name is never two ragged lines at a hyphen; one line with a middle ellipsis
keeps its start and end. A project whose every task never started there (its folder missing on that computer,
D395) is no project yet: no row; its tasks stand under All, where their fix is. All counts every task.

**Managing a project, with zero setup.** Everything is on the row's ⋯ (D421's one menu), and every
one is reversible from the same menu: **改名 / Rename** (kept per project key on the home, so every
device sees it; **恢复原名 / Undo rename**), **合并到… / Merge into…** (for two remotes the person
counts as one, a fork; it records an alias, **取消合并 / Undo merge**), **隐藏 / Hide** (its tasks
still count under 全部 and in needs-you; a hidden project with something needing the person shows
again), **置顶 / Pin** (pinned rows first, then by urgency). A drag on a project row keeps the
person's order on the Mac and the wide web; the order is kept on the home too. The partner can do
the same in words through one `project_change` tool (D175's eval owed).

**The tab row never wraps.** On the phone and the narrow web, one row of names; what does not fit
goes into one **更多 / More** menu. The column and the row keep the same order and the same names.

**Origin is a filter, not a project.** 来自 GitHub, Obsidian and Linear are **来自 / From** chips
over any project lens ("mem, from GitHub issues"), never a row in the project column. The D341
summary card stays on the board. No project lens is made from a to-do source.

The chosen row is the knob (D270: the card's white on its clay ledge). Opening a task turns the board into the rail (D244), narrowed by the
same lens, whose head names it and goes back. With one project there is no lens to name, but the head stays: **‹ 任务 / Tasks** goes back
to the board, so the sidebar always has its bar and rule. The column never stands beside the rail.

At its foot, **＋ 添加文件夹 / Add a folder** (on the phone and the narrow web, a **＋** at the end
of the lens row) opens D455's sheet: **在哪台电脑上 / On which computer** first (chips; the
computer of the newest task with a folder already chosen), then **选已有的文件夹 / Choose a
folder** (that computer's folders, looked through by that computer: **最近 / Recent** first, a
field **输入名字筛选，或输入路径 / Type to filter, or type a path**, each repo with its origin,
**添加 {name} / Add {name}**), **从 Git 地址克隆 / Clone from a Git address** or **新建文件夹 /
New folder** (D272's panels), **取消 / Cancel**. Added, the sheet closes on that project's lens.
Never this Mac's picker for another computer; on the Mac, **用访达选… / Pick in Finder…** for this
Mac's own folders. Details: `new-task.md` (Adding a folder anywhere, D272, D455).

D457 brings the sheet to the clay bar: each computer a small clay tile (its drawn device, its name,
one state word: **{name} 在这台上 / {name} runs here** for the home, else **醒着 / Awake** or
**睡着了 / Asleep**), home first, the chosen one on an ink ledge; the ways one segmented track; the
browser an instrument: the breadcrumb (`~ / code / hawdb`, each part a step back), ↑↓ ⏎ ⌘↑ ⌘⏎
said once at the foot in drawn caps, rows with a repo's mark in the accent's tint, its origin, a
recent one's last use and **已添加 / Added**; an empty, missing or away folder each says the way
on (**回到 {where} / Back to {where}**, **换到 {home} / Use {home} instead**); the button reads
**添加 {name}（{computer} 上）/ Add {name} on {computer}**, and at the home folder, where nothing
can be added, **进到一个文件夹里，再添加它 / Go into a folder to add it** in place of a greyed
button. Added, the project's row rises into the column with an accent ring that fades (1.8 s;
none under Reduce Motion), and a project with nothing yet says **在 {name} 里开个任务 / Start a
task in {name}** where the bare ＋ stood.

## The board

1. D287, D471: **the partner** at the head, always: its clay figure (72; 56 in the side pane and on
   the phone) in the pose for the whole (its flag when anything needs you > reading while anything
   works > on its bench while all waits > smiling when what is left came back done > idle), and
   D315: **one short line** in its voice (`onhand.line.*`, the display face 22/700): **有 n 个待你处理。**
   when anything needs you (when all of it stopped or didn't work out, **有一个停下了，要你看一眼。 / One
   has stopped and needs a look.**, several **有 n 个停下了，要你看一眼。**); else **没有待你处理的，我在做。**
   while anything works; else, when all waits, **没有待你处理的。最早 9:06 回来。** (one wait: **等结果的那个
   9:06 回来。**; none coming back on its own: **等结果的都没有新动静。**); else **今天就这些，都做完了。** or
   **手上没有事。** It never repeats a count. The long sentence (`headSay`, D287) stays the menu bar's.
   D471: nothing more under it. D467's lines (刚才, 待你处理 with the first two stuck tasks, 接下来) named
   tasks the rows named again, and on the author's real board the two disagreed; every task is now its
   own row, said once. **A turn's end is checked every time** (D645, research/245 §3.7): 在做 only
   while a turn runs (or a start is queued); a task told to wait for the person is 等你 with its question
   until the answer reaches it; a turn that ended with nothing running is stopped (D467's 停下了). A
   task whose GitHub read no computer can run says so on its row after half an hour, with the fix
   (装上 gh on that computer, or 在 hel 上读). **D661 (research/245 §3.3): one state, derived
   once in core.** `OnHand.truth` is `{needsYou, working, waiting, stopped, done, failed}`; each
   card carries the same state in `truth`, and the head's line, the counts, the sections, the Dock
   badge, the menu bar, the phone and the partner's facts read it, so the Mac and the web cannot
   disagree. **在做** means a turn is running now or a start is queued, never a card nobody moved;
   **等你** carries `waitsFor`, one line of what the person owes it, until the answer is delivered to
   that task; **等结果** waits on a named thing that comes back by itself, says when it is blind, and
   after half an hour becomes **等你** with its fix; **停下了** is a rest with nothing running and
   nothing asked (D467), and after its half hour it is 等你. A Keep's held item and a routine Ducter
   paused for a budget or a sign-in count as 等你 through the same function. D584: a row whose story
   is only the state's own word (**在做 / 做完了**, a task that said nothing yet) has no second line:
   its time (**在做 3 分钟了 / 7:52 做完**) says it. D661 turn 2: a stopped task that now needs the
   person never asks the old bare **这个任务停下吗？**; its line is the fact (**它停了 40 分钟，没说在等什么。/
   It stopped 40 minutes ago without saying what it waits for.**) and its row offers **接着做 / 放下**
   (Continue / Put down). A real question names its object; a Keep, a PR, a blind read and a call each
   name theirs.
   **How a stuck task is said** (D467 round 4, D471; core-free, from what the home already knows, in one
   classifier, `onhandfix.go` `stuckFix` and the web's `stuckOf`): couldn't start (D472's line and its
   real fix, one implementation with the task's page, `cant.tsx` / `cant.go`: **拉一份到 {computer} 上**,
   **选 {computer} 上的文件夹**, a sign-in or an install there; 再试一次 only when nothing more is known); its
   agent signed out on its computer (**重新登录**); a computer gone away for half an hour (**在等 Mac mini
   连上：上次在线是 2 小时前。打开那台电脑，它就接着做。**); the person's Mac without its two switches
   (**在那台 Mac 上打开指引**); a phone taken back, from its steps or its own report's words (**停在手机上：
   要你在那台手机上重新允许访问。** with **允许好了，接着做**); a failure with words of its own (**没做成：
   {its report's first sentence}**); one with only a tool's or git's raw output, never shown: a lock git left
   behind (**没能开始：仓库被另一个 git 操作锁住了。**), else **停在了一个我没认出的错误上。**; a stop with no
   waiter is said as the partner, from the task's last words, with the honest next step (D471 rev.):
   **PR #n 已经提了，在等 CI，之后没人再看过。接着做，它先去看 CI 的结果。** (接着做 asks it to check that
   PR's CI first), **它提了 PR #n 就停下了，之后没再说话。**, **它最后说「…」，之后就停了。**, else **它停了，没留下
   话。接着做，它从停下的地方接着来。** (its whole last words are the peek's, under **它最后说**). D473: a failure
   or a stop Ducter is mending right now (its newest event a repair under way, not the partner's
   rethink; the home puts it on the card) stands under 在做 in the steps' words (**%s 上还没有这份代码，
   我先拉一份再开始**) and needs no one. A limit used up
   (D297) is its row's line (**等 Claude Code 的额度恢复**) with **现在换 Codex 接着做** when another agent
   can take it; several on one limit share D297's head.
2. D467 (rev.): no strip of counts and no counts on the sections (the line and the rows say how
   much); the filter it gave is gone, Find and the lens narrow. Under the line, on its own row, under
   a project **在这儿新建 / New task here**; Find from ten.
3. D467 round 4, D471: no forecast line; each wait's row says when it is back.
4. **One count (D517).** 待你处理's items are the person's one count: the Dock badge, the menu bar,
   each partner's number in the list of partners, the conversation's line and the head all count
   them, and each is drawn under 待你处理 with its action (a group with such a part stands there too).
   A question leaves when answered; a stop, a failure or a PR to merge leaves once opened on this
   device after it last changed, then stands with the rest (a stop in 等结果, a failure with that
   day's finished, a PR in 等结果), its action kept. Offers and questions put off never count.
   **The asks are calm (D586).** An ask card's question (On hand's, and the same shared card in an
   opened task and on a call) is the reading face at 18/600 (tokens `AskSize`/`AskWeight` on the
   Mac, `--ask-face`/`--ask-size`/`--ask-weight` on the web), one step under D287's 20/800 heading:
   nine of them in the needs-you wash read as a list to work through, and the partner's one line at
   the head is what stands out. The card itself (wash, ledge, radius, buttons) is unchanged.
   Sections by attention (D467): 待你处理, 在做, 等结果, D507's **你的帮手 / Your helpers**, D498's **一直在跑的 / Ongoing**, 今天做完. 待你处理 answers in place (decision cards),
   then what **stopped** (a wait nothing brings back on its own: no waiter of any kind, not a
   question put off, not a computer that will come back, quiet for 30 minutes or more) with
   **接着做 / Continue** and **放下 / Put down** always shown and **上次有动静是 {ago}**, then what
   didn't work out with **再试一次 / Try again** and D454's × and ⋯. 在做 cards. 等结果: fresh cards, task-less
   waits, then the quiet ones; D382: a question put off with **晚点再问我 / Ask me later** stands
   here, out of 待你处理 and its count, its line **{time} 再问你：{question} / Asking again {time}:
   {question}** with **现在就定 / Decide now** (on hover on a wide screen; the opened card always),
   until its time puts it back in 待你处理 (no default runs on it there until it is seen). 今天做完 (D467:
   finished on today's date, a done still being checked too; D508: never one whose PR is open, which
   stands under its PR, ready in 待你处理 and the rest in 等结果): new results, then the seen ones;
   what finished before today folds under **还有 n 个是昨天做完的 / n more done yesterday**, closed by
   default. Its count is D310's one number. One reading
   column (760; 840 beside the peek). D467 (rev.), D471: a section's name is a quiet label (12/700,
   muted, a little tracking), no count. D471's type scale, four sizes on the page: the lead 22/700, a
   title 15/600, every line and time 13, a label 12. 等结果
   D628: a task whose work was a merged PR and whose only remaining waits are timers leaves this section for 今天做完 when its hand-off settles; a timer that keeps coming back with the same words backs off, and says so once.
   D633: a loop or a wait ending is never a turn: with no turn running, a finished task is done (its
   report said done, or its PR merged/closed/let go) and an unfinished one goes back to where it stood
   (blocked/needs you), never 在做. The person's 结束任务 / keep_change stop is the same path. Anything
   Ducter holds about a PR or an issue (a task, a hand-off, a Keep's item, a wait) settles from the true
   state in `core/src/holdings.ts`; the person hears one quiet line for the batch, never one per item.
   When the settle line is the task's last word, its row and the opened task's head say it, not the
   report written while it still waited.
   D471: no time axis; each wait's time stands on its row's right edge, so the times read down one
   line. State is said by the small glyph, never a bar at the edge.
5. D467, D471: **one row shape** for every task, and **each section one clay sheet** (white, radius
   16, its ledge; the needs-you ledge when what is on it stopped or didn't work out) with its tasks as
   rows on hairlines (below); only the rail beside an opened task stays D244's rows.
6. D467: nothing beside the board. D287's day column (接下来, 现在, 今天回来的) said the column again
   and is gone; each wait's row says when it is back (D471).

### The row (D467, D471)

Every task on the board is one row of its section's sheet, the sheet's full width, at least 60 high
(48 in D457's compact density), a hairline above it but the first; hover warms it within its sheet's ground (D529: never grey, never
a change of size or place), the row under the keys has the accent outline. D471's one grid: **the mark** (24), **the words**, **the time** on one
right edge (112 pt; 92 under 700), and, on a sheet whose rows carry an action (what stopped, what
didn't work out, a quiet wait, a limit with a hand-over), **one column for what to do** (252; 216, D529: two fixes and the ⋯ that joins them) so
every first button starts at one x, and its ⋯ stands last in that group (D529); elsewhere a hover's
actions come in beside the time (the Mac) or over it on the row's own fill (the web), faded in, pushing nothing. Beside the
conversation and on the phone (D471 rev., one hand, 390 to 430) a row stacks: the task first (up to
two lines), why under it (up to three), then a quiet line of where and when (the project, a computer
that isn't the usual, a PR it made, the time: each its own element, wrapping, never past the edge),
then the one fix the full width of the words at 44 high, other actions as text beside or under it. No
source chip in a row there and no ⋯ (a finished row leaves by its swipe). Never a tinted fill, never the agent's brand coin or the partner's face: who does it is a
detail, on hover and in the task.

| Part | What it shows |
|---|---|
| State mark | A 32-pt sunk round with a group part's glyph: a flag (needs you, stopped), D498's pebble (working: it beats once each time a step lands and rests between, dimmed after ten quiet minutes; research/216), Ongoing's drawn repeat (a task in rounds between rounds), the D279 ring filling toward its next look (waiting), a tick (a new result; quiet once seen), a cross (didn't work out) |
| Subject | The short title (15/600, D471: up to two lines; a title a source already cut is said to its last real word and never cut again; D508: past two lines cut at a word's end, the whole title then its tooltip, and no other tooltip; a seen result's recedes to soft ink), then where: its project when the board shows them all (never 其他 / Other), its computer when it isn't the one most tasks run on; each its own element. D661: another holder of the same PR is a fact on this row, each its own element (**作者：Mac 上的 Antigravity**, **复审：PR Babysitter**, **交给：…**), never a row of its own. +a −d and 草稿 PR / 已合并 at the end |
| Living line | What it is on now (D210's latest step or the agent's words, held by D425's dwell, up to two lines); what it waits for (D467 rev.: never the title's words again: then the report's first line, else its look); why it stopped (two lines, in the needs-you ink); what came of it. D661: when it is the report's words, the row says the person-language gist of the latest report (`gist`, one cheap-model line, D519's asker); until that exists the raw report is shown in the muted face behind **它说：… / It said: …**, never as Ducter speaking |
| Quiet (working) | D498: no progress line. After ten minutes with no step, under the living line, **上一步 {ago} / last step {ago}** in the quiet ink (a fact; the partner judges a stall, D481). The living line is D498's `saidOf`: this turn's latest line in a sentence (the agent's words, a step that said what it was for, or the unworded steps as one gist, **跑了 3 条命令，看了 2 个文件**), never a bare command; a failed step the task went past keeps the quiet ink. The client asks once for a working task's history |
| Outcome (done) | D467 (rev.): what it made, to open: a PR chip (GitHub's mark, **#1190**): D508: the PR Ducter watches for it first, else the report's evidence, the merge or draft PR, or `PR #n` in a repo task's result |
| Under its PR (D508) | A finished task whose PR is open is not done: its living line is where the PR stands (`pr-state.ts`), the phase in the state's ink and its facts each its own element: **在等 CI 跑完**, **CI 没过** (**没过的：{names}**), **在等评审** (**等 {who} 看**), **{who} 要求修改**, **和 {base} 有冲突**, **还是草稿**, **可以合了** (**{who} 通过了评审**), CI as **CI 过了 {n}/{m}** or **CI 都过了**; its mark the waiting ring at rest (ready: the flag); its right edge when it last moved. Ready stands in 待你处理 with **到 GitHub 合并 / Merge on GitHub**; every other open phase in 等结果; merged or closed in 今天做完 (**已合并** beside its +a −d). Never 合进 {base} or 开草稿 PR while a PR holds the branch |
| Right end | The heartbeat in words (**在做 12 分钟**: D498, this turn's time; a task in rounds **这一轮 7 分钟** or **下一轮 14:30**; **22:40 回来**, **14:10 做完**) or its one action: **接着做** and **放下** for what stopped, **再试一次** for what didn't work out, **现在看一次** for a quiet wait that looks; on hover, in a slot of its own inside the row (D508: never over the time, never past the sheet's edge), Pause, D454's × and ⋯ (D529: always laid out, faded in, Tab reaches them; on a row with its own action only its ⋯, last in that group); a branch with no PR has 合进 {base} and 开草稿 PR in that ⋯ |

A new result pops once the first time it is drawn (D313). A group (D360) is the same card with its
name at the head and a **track** of its parts under it (done, at work, needing you, didn't work, in
line); D498: a part at work has the board's pebble and its living line.

> D511 (built 2026-11-24, phases 1–3 of `standing-work.md` §11): helpers, routines and tasks in rounds are one object, 看守中 / Looking after (a Keep), with its own page; see `standing-work.md`. On hand's **看守中 / Looking after** takes the place of the two sections below when the home sends `OnHand.keeps` (every home from 0.1.34): each Keep one sheet, its tasks under it, what waits for the person in 待你处理 once with the Keep's name, a tap opening its page. What follows is kept for an older home's clients.

**一直在跑的 / Ongoing (D498, D427).** A task in rounds (the home's `rounds` on its card), at work on a
round or resting till the next, is a row here, never under 在做 or 等结果; one that asks or stopped stays
in 待你处理. Its mark between rounds is Ongoing's drawn repeat (at work, the pebble); beside its project
**每 {n} 一轮 / A round every {n}**; its line between rounds the last round's facts, each its own
element (health when it isn't on time, D427's words in the waiting ink; else a review's standing,
D394's **8 个请求在等你：3 个有新提交已复审，5 个没变**; else the round's own line); at its right
**这一轮 {n} / This round {n}** while a round runs, else **下一轮 {time} / Next round {time}** or
**暂停了 / Paused**. Its gestures stay on its opened task and the Ongoing tab.

**A helper (D507, D494; research/220).** Each helper that is on is its own clay sheet, never a row in a
section. *Who:* the heavy developer whose agents hand PRs on; the consumer who asked for something to keep an
eye on their PRs; the fresh user never meets it until they ask. Its **head**: its first letter on the sunken
pebble (the Settings tile: the literal mark kept, the raters' tray owed as art), its name (15/700), how it
reads at a glance (**还没有活交过来 / Nothing handed over yet** with **你的 agent 在 Nowledge Mem 里按这个名字找到
它，就能把活交给它**; **手头有 {n} 个**; **{n} 个在等你 / {n} waiting for you** in the needs-you ink, then **手头有
{n} 个**; its address's Settings words while not ready), **接：{about}** (two lines at most), and **这周接了 {n}
个** on the time edge; each its own element. A tap opens its row in Settings › Agent 通信. **Under it**, set in
by the mark's width (38 wide, 36 stacked; Mac 46) on the same sheet, the work it keeps, each the board's own row
(what waits for the person first): a task until it ends, and a finished one while its PR is open, its line
D508's (where the PR stands, "Under its PR" above: **评审中**, **可合并** with **到 GitHub 合并**, never 做完;
a PR ready to merge waits for the person, so the sheet stands in 待你处理); a merge or a close lets it go to 今天做完 with the helper's
name among its where-facts (as anywhere else it stands: beside an opened task, in Find, under a project lens).
**Where:** like a group (D360), at the head of 待你处理 when something on it waits for the person (the sheet on the
needs-you ledge), else under **你的帮手 / Your helpers** after 等结果. Both clients read the home's one model of
it (`OnHand.helpers`, `HelperWork`), which a helper's small app will read too.

### The peek (D467 rev.)

From 1280 (Mac pt, web px), a clay card 360 wide beside the list sits in on a task: D471: the one the
keys moved to on this board (a focus kept from a task opened before doesn't hold it), else the first
at work, else the first in the walk. Its mark, title (16/700, up to three lines) and where, its
heartbeat, the living line in full (a stuck task's reason, then **它最后说 / Its last words**: what it
reported, whole; D584: left out when it is only the state's own word, 在做 / 做完了, which the heartbeat
already says), **最近几步 / Latest steps** (D498: the last six lines of `saidOf`, newest last and in
ink; steps with no words of their own as one gist; a failed step quiet, with the small cross), a PR
chip when done, and **打开任务 / Open the task**. Arrows and j/k move it; Enter opens;
hovering a row doesn't move it. Round 4: its picture
from what exists: the phone view's last frame this device held (D248) under **上次看到的画面 / Last
seen**, and **看它用手机 / Watch the phone** or **查看浏览器 / Watch it browse** into the live views.
Owed: a live picture inside the peek (a second live stream per client).

### Folds

| Fold | What goes in | Line | Opens |
|---|---|---|---|
| Quiet waits | A waiting task that still looks on its own, whose card and looks haven't changed for 24 h (D467: one with nothing to bring it back has stopped and stands in 待你处理) | 还有 n 个，一天多没有动静 / n more, quiet for over a day | Tap (this session), Find, or 等结果 in the strip |
| Seen results | Done today that isn't a new result, missed waits, ended calls | 还有 n 个，你都看过了 / n more you've seen | Tap (kept per device), Find, or 今天做完 in the strip |
| Yesterday (D467) | Finished before today, still in the home's day window | 还有 n 个是昨天做完的 / n more done yesterday | Tap (this session), Find; from one |

| Your to-dos (D357) | Open to-dos in the person's own apps beyond the three shown | 还有 n 个 / n more | Tap (this session), or a count in Settings › 待办来源 |

What needs you never folds. Folded cards are not in the keys' walk. D287: a fold folds from three;
one or two stay in sight under a quiet caption (**一天多没有动静 / Quiet for over a day**, **你看过的 /
Seen**).

D357, D467: after 今天做完, while a to-do source is on and something is open there, **GitHub 上标给你的 /
Assigned to you on GitHub** (a vault: **{vault} 里的待办**; several: **你的待办 / Your to-dos**) as a
quiet label like the sections'. Under it, with a sort (D359), **one sheet** of the board's shape, the
app's mark where a task has its state mark. D498: what is the person's own first, as its own row:
**{n} 个 PR 等你 review / {n} PRs wait for your review** with **去看看 / Take a look** (opens them in
place, behind 看看全部); then one offer in the partner's voice at a sane size (**里面有 236 个我能直接做，
先挑几个交给我吧。 / I can take 236 of them on now. Pick a few to start with.**; with none to hand over,
the first of the others) and **挑几个交给我 / Pick a few for me** (D385's sheet on the do list, the
first six ticked; never the whole pile in one press). Before a sort the card says **让{name}一个个看过，分出能交给它做的、要你定的、也许能关的。** with **理一理 / Sort them**;
while it sorts, **正在一个个看…** and its count. Under the card, **看看全部 {n} 个 / See all {n}**
(this session; **收起 / Hide**) opens the whole sort behind it: **the pile** (D359: the partner in
clay beside a stack whose height is the count's bucket, at most 88 wide, the count at heading size,
**今天替你清掉 n 个**, **在做 n 个** and **排着 n 个** apart, the sort's groups as rows with their one
button, **可以先放着的**, **还没细看的** and **已经在做的** as quiet rows, **{ago}理过** with **再理一遍**),
then at most three to-dos as cards of the board's shape, one to a row (a PR waiting for review, a
mention, a line due soon, the newest; each opens in its app and offers **交给{name}**, a review request
**在 GitHub 里打开**, a pre-read **我看过了** with its counts), then **还有 n 个 / n more** (opened in
place, Find, chips on a sunk track, pages of 30; `task-sources.md` §6). Without a sort (a vault,
several sources) the few cards and the fold stand without the summary. Nothing shows for someone with
no source, under a project's lens, with a filter on, or while finding. The source counts as something
on hand (the empty state doesn't show over it). Sheets and their Go: `task-sources.md` §9.

## Groups (D360)

D471: a group draws only the parts whose tasks are on the board (one removed or gone is no row: on
the author's board it drew a lone order number); with one part left it is that task's own row.
D535: a hand-over's group (D385) stands by one rule on every client (`handGroupStand` in
`packages/protocol`, its Go port `HandStand`, one fixture): its plan or review waiting for the person in
待你处理 as its card; with tasks on the board, by its most urgent one; with only parts held in line, in 在做,
each part saying where it waits; with nothing on the board and nothing in line, nowhere.

Several tasks that are one piece of work (登录页重做 in three tasks) stand as **one card** in the state
section of their most urgent part; a stopped line stands in 待你处理 and counts as one thing that needs
you. The partner makes a group when it splits a request (`task_open` `group`) or when the person says
"把这几件放一起" (`task_group`); on the web the selection bar offers **放进一个分组 / Put in a group**.
Nothing is filed by hand first. A group shows from two parts; counts stay per task; while finding,
and in the rail beside an opened task, its tasks are rows of their own.

The card (D430: no counter noun, no 件 and no "part"): the group's name (display face 15/800), beads one
per part and, only while something is done and something is left, the conversation's count **好了 {k}
个，还有 {m} 个 / {k} done, {m} to go** (a part that didn't work out counts in neither; the beads say the
rest); its menu (⋯ on the web, right-click on the Mac: **改名**, **改成同时做 / 改成一个做完接下一个**,
**取消分组（任务都留着）**); then the parts on a thread, each with a quiet order number (not spoken),
its mark (a tick, three working bars, a flag, a ring, a cross, a dashed ring for **排着**), its name and
its right-hand words (the card's heartbeat words). A part's name is the person's own words when it
does one line of their message (D426), else its task's title. A part that needs you shows its question
inside the card. More than three parts fold to what is live and the next in line (**还有 {n} 个 / {n}
more**). Under the parts: **一个做完接下一个 / One after another** (or **同时做**) while something is
held; a stopped line instead names the parts by their words: **「{ended}」没做成，「{next}」在等你决定。**
(several waiting: **「{ended}」没做成，后面的都在等你决定。**; **放下了** for one put down) with **再试一次 /
Try it again**, **不管它，往下做 / Skip it, go on** and **后面的不做了 / Drop the rest**. A held part offers
**提前** on hover.

The line (core `task-groups.ts`): parts in the same folder on the same computer run one after another;
a later one is held by the home (no task, no agent) and opens when the part before it is done (its
result back) from that part's unmerged branch, its brief led by which part it is and what the one
before reported. Parts elsewhere run side by side. Research and words: research/133.

D426: when one message asks for several things, the same work has three views and one state: the
lines under the person's message in the conversation (their words, a mark, a note;
`conversation.md` §Several things in one message), the group's card here when it took more than one
task, and the opened task, which shows its own lines under its head. Who does each line is named here
and in the opened task, never in the conversation (a hover on the Mac only).

D285: under the sections, On hand's last line leads on: **一直在跑的 n 个 ›** (when something keeps
going on its own) and **做过的事 ›**, where every finished task stays, findable and marked
(`past.md`). D315: the line wraps, so nothing is clipped from 900 to 1280. A Find that matches
nothing here offers **在做过的事里找「{q}」**.

## Taking a finished card off (D454)

A card whose task is done or didn't work out, and a group none of whose parts is still at work, can
always leave On hand: **×** in its corner on hover (a pointer), a swipe to the left (touch, the card
follows the finger and slides out past 96), and **⋯** with what fits it: **再试一次 / Try again** and
**看看为什么 / See why** (the task at its failure) for one that didn't work out, **打开 / Open** for one
that is done, **移走 / Remove** for both. A group's ⋯ adds them to its own menu (rename, shape,
dissolve); 再试一次 there sends each part that didn't work back to work. Removed, it leaves On hand on
every device (core `onhand-away.ts`, `<dataDir>/onhand-away.json`, the frame `onhand_away`) and stays in
做过的事 / Past tasks (nothing is deleted; Past keeps its own **接着做 / Continue**); the toast says
**移走了「{name}」，做过的事里还找得到** with **撤销 / Undo**. A removed task that goes back to work comes
back by itself, with its group; what waited in line after a stopped part is dropped with the group.
The × is quiet ink, never the failed red: removing isn't a loss. *Why:* the author on 0.1.8 had a
group card (通用设置, Macbook Pro M3, **1 ✕ 通用设置 没成**) in 今天做完 that stayed, with no way to clear it; a card the
person can't clear is noise that never ends (D36 好用, 放心).

## A row (the rail beside an opened task)

Two lines (one line cut the news to half a width). D315: beside an opened task a row says only its
title and its face; a wait's small cloud of a bubble is not drawn there (two signs read as one
unknown icon).

- **Line one:** the title (short form, full on hover); then **+a −d**, 草稿 PR / 已合并, a new
  result's face, the time (how long it has worked; else when it changed, in days past 36 h).
- **Line two:** what it is on now, in words:

| State | Source, in order (deterministic; never a model) |
|---|---|
| Needs you | the decision's question, the report's question, the report |
| Working | a keep-going loop's line; the latest step in D210's words (with its mark), or the agent's latest words |
| Waiting | the waiter's reason (as 等 …); the state's reason; the first line of the last report; **停下了，没说在等什么** |
| Done, didn't work | the result's first line |

  A wait adds when it comes back with a 12-pt ring of the interval gone by (**11:39 回来 / back at
  11:39**, D279),
  or, once quiet, **上次有动静是 2 天前**. The right end says where: the project (under All, from
  two groups) and the computer (with two or more). The branch and the agent are in the task.

D542: a row opens what it names. A Keep in rounds stands in the rail as its round's task; its row
opens the Keep's page (the other Keeps at its left from 1120, the page on the right), never the
round's task; a Keep's item (one PR it babysits) opens its own task. A task opens at its
conversation, never at another task's workbench page (`workbench.md`). On a touch screen a tap
anywhere on a row opens the row: what a row reveals on hover takes no tap while faded.

## Navigation: where things live and how you move (D535)

Three zoom levels, one header shape at each (D262, D270), one way back. The Mac at 1000, 1150 and
1400 and the web at 1400, 1000 and on a phone follow the same table.

| Level | Where it lives | In | Out | The header says |
|---|---|---|---|---|
| **The conversation** | The window's default; with two or more partners the list of them at its left (a phone: the level above it) | ⌘1, 对话 in any breadcrumb, Esc from On hand | the places' marks, a count's door, a task's line | the partner's face and name, then its counts (「n 个待你处理」 its own door, the rest a link to On hand) |
| **任务 / Tasks** | The overview: the partner's line, 待你处理, 在做, 等结果, 看守中, 今天做完; the project column from 1100 (a row of names narrower) | ⌘2, the places' On hand mark, the counts line, a count's door, 任务 in a breadcrumb | 对话, Esc, a row or a sheet | 对话 / 任务 (Mac and web whole screen); beside the conversation its own name; on a phone ‹ 对话 |
| **A Keep's page** | In On hand's place; the other Keeps as one list at its left from 1100 (Mac) or at the whole screen (web), under the shared section head, the open one the knob | its sheet on On hand, the rail, a deep link (its card in the conversation, Settings' helper row, ⌘K, a push, `#keep=`) | the breadcrumb's 任务, Esc, ‹ 任务 | 对话 / 任务 / {the Keep} at every width (web beside the conversation and phone: ‹ 任务); never a back link inside the page or its column |
| **An opened task** | Its own page; beside it On hand's rail where there is room (D244) | a row, a card's 打开任务, ⌘O / ⌘K, a door's item opened, a push | 任务 or 对话 in the breadcrumb, Esc (back where it was opened from, D244) | 对话 / 任务 / {the task} (web beside the conversation: ‹ 任务; a phone ‹ 对话) |

**What persists between visits.** On hand always opens on its overview: a Keep's page lives only while
On hand is shown, and leaving On hand closes it (a deep link opens it straight). The project lens is
kept per device (D261). Find, the 待你处理 filter and the selection are let go on Esc and when a count's
door opens. The conversation keeps its place (D254) and each partner its own. An opened task keeps
its draft and the rail its lens.

**Every count leads to its items.** The person's one count (D517) is a door wherever it shows: the
conversation's 「n 个待你处理」, a partner's pebble in the list (and that partner's row while shown), the
mini window's count and the line pinned over the composer, **有 n 个待你处理 ›**, while something it
counts is out of view. A tap opens the next item in 待你处理's order (a stopped line, the partner's own
questions, another partner's, then the tasks): the partner's own question in the conversation,
scrolled to with a needs-you wash that deepens once; anything else On hand's overview with the item
focused, scrolled to the middle, its tint or edge deepening once (Reduce Motion: the colour only).
The next tap steps on; after the last, the first. The Dock badge and the menu bar's count open the
window; the menu bar's own list names each item. On hand's head line is a sentence, not a door: 待你处理
under it is the list.

**The breadcrumb is the one way back.** Every crumb but the last goes there and is a button; the last
is the place, in full ink, never a button (D270). Esc goes up exactly one level (a Keep's page to the
overview, the overview to the conversation, a task to where it came from). No page draws its own
back link where the header already has one.

## The opened task

A waiting task's headline is the row's waiting line, never its title again; under it one line, when
it looks again and since when it has been quiet. The rest is D152/D210's transcript.

D544: a task in rounds (a Keep's, or one of its own) keeps who it is while it is read. Once its head
is out of view (it opens at its end, so at once), a slim clay line under the bar says the Keep's
lantern, **看守中**, what waits for the person, **下一轮 18:49** (live) or **本轮进行中**, and **第 302
轮**, each its own element; a tap opens the Keep's page (or, without a Keep, goes back to the head).
Ordinary tasks get nothing. Rounds that changed nothing (from their structured outcome: a done or
progress-only round, nothing said to it, no PR marked `changed`) fold into one row, **又看过 9 次，都没有变化，
13:15 到 17:45**, that opens on a click; the latest round stays.

Beside the conversation (D544) On hand takes the phone's grid: the partner and its lead in the first
row (the face 56, the lead `lg`), Find on the pane's left edge at its width, a section's name and an
ask on the rows' inner edge (16), an ask's question at `lg`, a row's mark on its title's first line.

## Review 2026-11-17 (D315)

The author on 0.0.65 (Mac, 1280 and narrower), on their own evening: 「这个 on hands 各种细节、wording、
设计、flow 达到我们的情绪价值、设计性格、质感、水准和流畅要求了么 … 风格化似乎都不如我们在 readme 里的
老截图」, and the locator's focus mark 「处理的不够好」. Seen on the test renderer against the
author's evening as a seed (`demo-onhand.ts` `DEMO_STATE=author`), at 900, 1280 and 1600, zh and
en, light and dark; before and after in `.shots/d315/` (`mac-before-author-*`, `mac-after-author-*`,
`web-before-*`, `web-after-*`, `before-locator/`, `after-locator/`).

### Element by element (before)

| Element | Heavy developer | Consumer | Fresh user | What was wrong |
|---|---|---|---|---|
| The head sentence 「现在没有待你处理的。4 个等结果：最早 9:06 回来，2 个一天多没有动静；今天做完 1 个。」 | reads it once, then skips it: the strip says the same numbers | a paragraph to parse before a glance | long, bold, and the first thing; feels like a status report, not a partner | Hierarchy: a 40-character bold sentence is the loudest thing on the page and says nothing the strip and sections don't. Redundancy: every count three times (sentence, strip, section head). Wording: a report, not the partner's voice. |
| The strip 「0 待你处理 0 在做 4 等结果 1 今天做完」 | the zeros are noise to skip | "0 待你处理" in faint grey reads as disabled, or as something missing | four labels to learn on day one | Zero states drawn as faint cells take half the track; with one state there the strip filters nothing. |
| 等结果 cards | good: coin, title, ring, time | 放心: says when it's back | clear | The title cut at one line ("你能帮我准备好能 review nowledge-co 这…") lost the part that says what it is. Two cards side by side of different heights. |
| 一天多没有动静 rows | "is anything stuck?" with no way to act from here | grey rows read as broken, or as hers to fix, with no next step | doesn't know what to do | A different language from the cards above (flat rows, receded ink), no action: the board raised a worry and offered nothing. |
| 「Hetzner Server」 on every row and card | noise: every task runs there | a word they don't know repeated | same | Where was said for every task, though it only matters when it differs. 其他 / Other said on every errand says nothing. |
| 今天做完 as a plain row | fine | the good news looks the same as the stale | — | Mixed card and row styles for the same kind of thing. |
| Section names 「等结果 4」 (12/600 muted) | fine | hard to find the parts of the page | the page has no landmarks | Hierarchy inverted: the sentence shouts, the sections whisper. |
| The links 「做过的事 › 替你做过的 › 一直在跑的 1 个 ›」 | — | — | — | At narrower widths (0.0.64) the right ones were clipped: the row didn't wrap. |
| 接下来 / Next line at 900 | — | — | — | Said 「今天 20:41」 for both waits: the end of the watch, not the next look the cards say (9:11, 9:26). The same fact disagreed on one screen. |
| The locator's focus | in a long task, a dark stack where the eye lands | reads as a broken scrollbar | — | The ticks in view turned to ink at 75% and grew 2 pt on a dense rail (8-pt pitch): stacked dark bars over a faint clay pill. |
| The rail's first row | — | a cloud-like icon nobody can name | — | A wait's raised bubble (its glyph on a cloud) drawn beside the face in a 300-wide rail. |
| The default line in the conversation | — | 「我就等你登录后继续。，之后还能改回来。」 | — | The Go label's own full stop doubled the sentence's comma. |

### What the README shots had that the board lost

- **Typography with a hierarchy.** Section names were bold display headings at about 20 ("Needs you
  1", "Working 2") with the count in muted figures beside them; card titles bold and allowed two
  lines; the page had landmarks. 0.0.65 inverted it: the sentence at 18/600 shouted, sections at
  12/600 muted whispered, titles cut at one line.
- **One object language.** Everything was a white card on its clay ledge, one radius, one shadow;
  nothing was a grey line. 0.0.65 mixed cards, flat rows and receded ink.
- **Composition with air.** Fewer, larger things; each column or section started with its heading;
  a short top band (one line) instead of a paragraph.
- **Colour that means something.** The peach decision card, the orange clock coins, green ticks;
  zeros never drawn. 0.0.65 drew greyed zeros as the second thing on the page.
- **Depth.** Cards stood on a 2-pt ledge with a soft drop; 0.0.65 kept that for live cards only.
- The partner's clay figure on the task page (the done face holding its phone) gave the old shots
  their warmth; 0.0.65's head already has the figure: what it lacked was a short line beside it.

### Against the north star (D36)

| | Before | After (D315) |
|---|---|---|
| 好用 easy | the facts were there, said three times | one line, one strip of what is there, sections as landmarks |
| 顺滑 smooth | a worry (quiet waits) with no next step | Check now / Continue / Put down right on the card |
| 赏心悦目 delightful | flat grey rows under cards; inverted type | one card language, display headings, titles that keep their end |
| 放心 trustworthy | two times for the same wait (9:11 and 20:41) | every time is the next look; the line, the cards and Next agree |
| 惊喜 surprising | — | the partner speaks: 「没有要你定的，我在做。」 |

### Decided (D315), built on the Mac and the web

The line, the strip of what is there, display headings, one card language with low cards (since D467 one card shape) and their
calm actions, titles in two lines and cards of one height, where said only when it differs, the
forecast line only while something needs you and with next-look times, the links wrapping, the
rail row without the wait bubble, the locator's calm lens, the default line's one mark, and the
web's cheer swelling from rest (D313's todo).

### Proposed, not built

- The conversation's header says 「1 个待你处理　在做 2 个」: two word orders side by side. One order
  (「1 个待你处理　2 个在做」) needs the header keys on both clients and their tests.
- 今天做完's section counts the rows (a done only claimed included) while the strip counts D310's
  Done today: one task can show 「今天做完 1」 over a strip without it. Either the section says its
  claimed ones apart, or D310 counts what is listed.
- A demo with two computers, so the shots show where on the one card that runs elsewhere.
- Test with the author first, then a consumer who has never heard "agent" (research/95's next step).

## Review 2026-11-22 (D467)

The author on 0.1.10 (Mac, about 1400 wide): 「怪怪的」. Six card shapes at two widths, the finished
work loudest and the one stopped task a grey row under a head that said 没有要你定的, the day column
saying the column again, the agent's logo and the partner's face on every result, yesterday inside
今天做完 under a strip that counted 1, and GitHub's triage as a second app whose rows made 553 of 555.
The diagnosis, five layouts against a rubric and what was built are D467's. Seen against
`apps/web/demo-d467.ts` (the author's screen as a demo core) at 1000 and 1400, zh and en, light and
dark, Mac and web, before and after: `.shots/d467/`. Round 2 (D467 rev.), on the author's "better, not
yet at the bar": the partner's brief in place of the line and the strip, no counts on the sections,
the trail, the group's track and the waits' time axis, results as PR chips, the source as one offer,
the peek; `{mac,web}-r2-…` and the frame sequences `{mac,web}-r2-motion-01..06`.

## At the source

A task's `wait_for` is refused when its reason reads as notes (`shorthand` in `core/src/work.ts`)
or its check only reads the clock (`clockCheck`). The reason is shown to the person as written.

## 列表 / List (D662, research/245 §3.5)

**Who.** The heavy multi-agent developer: 20 to 100 tasks over four to six repositories, three
computers and four or more agents, helpers and loops running overnight. The consumer with 3 to 8
tasks never sees it; the fresh user has 1 or 2.

**Felt before / after.** Before: 吃力 — scanning 22 cards with no way to say "all of these, end",
and the same PR or project read three ways. After: 好用 — one dense row per task, one key to end
ten finished things, and the confirmation says exactly what will and won't happen.

**How it starts.** Nothing to set up. From eight tasks on, the board's head offers **概览 / Overview**
and **列表 / List** (a segmented choice beside Find); ⌘2 on the board goes on to List, ⌘1 in the
List comes back to Overview (on Overview ⌘1 is still the conversation). The choice is kept per
device and is never made by itself.

**The table.** One row per task (a card shown under another holder's PR is not a second row,
D661), 32 tall, a shared control (`tableRow` / `TableRow`): the state's drawn glyph (D661's state;
a failure in the done tier), the title (13/600), then in 12: project, computer, AI agent, age (the
state's own time), last step (the gist; before it, the task's own words muted behind 它说 / It
said), PR and CI, each its own cell, never joined. Under 760 wide the computer and agent columns
step out (their filter chips stay); a phone shows a two-line row (the title, then the glyph,
project, age and last step as separate facts). The list has no peek beside it: the row is the
peek, and the table takes the board's width up to 1060.

**Sort and filter.** By urgency (needs-you, stopped, working, waiting, done; the oldest first in a
tier), by last change, or by age. Chips for state, project, computer, AI agent and from-source (a
chip with one value is not drawn); the project column stays, and 来自 / From's own chips still
narrow the board on the Mac. **存成视图 / Save as view** keeps the filter, the sort and the mode
with a name on the home (`views.json`, the `view_save` frame), so every device has it; it is
listed under the projects as **视图 / Views**, after the three built-ins, each shown only while it
has rows: **今天要我看的 / Needs me today**, **跑了很久的 / Running long** (working or in rounds
for over six hours), **PR 在等 / PRs waiting**. Under eight tasks there are no views either.

**Many at once.** x picks a row, ⌘-click picks, ⇧-click and ⇧↑↓ extend, ⌘A picks every row the
filter shows. A picked set raises the selection bar (`selectionBar` / `SelectionBar`) at the
board's foot: **已选 n 个 / n selected**, then **结束 / End**, **暂停 / Pause**, **接着做 /
Continue**, **换到… / Move to…**, **换人做… / Reassign…**, **放下 / Put down** (each only when it
fits one of the picked), and **取消选择 / Deselect**. A press (or e, p, m, a, ⌘⌫) never acts: it
raises the one ask in the bar that names the count and what is skipped — 「8 个里 2 个正在做，会做完
这一轮再停。」 / "Of 8, 2 are working; they stop when this round ends." — with **就这样 / Do it**
and **先不 / Not now**. Core runs each task through its own path (`work.endTask`, the runner's
interrupt, reopen and drop, the loadout switch), logs one `task_bulk` record for the gesture, and
answers once; the toast says what was done with **撤销 / Undo** for ten seconds. A working task
is never cut mid-turn: its end is queued and lands when its turn ends (Undo cancels it). A Keep
that owns an ended task stops with it, on the same clock.

**Keys.** j/k or ↑↓ move, ⏎ opens, Esc lets go (the ask, then the selection, then the filter, then
Find), x picks, ⇧ extends, ⌘A picks all, / finds, f the first filter chip (web), g p the row's
project, g s its state, e ends, p pauses, m moves, a reassigns, ⌘⌫ puts down. They are said once
at the list's foot in drawn caps (`keyCaps` / `KeyCaps`); ⌘⌫ is written 「⌘ 退格」 / "⌘ Delete"
(⌫ is not a glyph a phone draws as text, D211).

## Keys

j/k and the arrows walk what is drawn, Enter opens, `/` finds, Esc lets go of a selection, then
Find, then the strip's filter, then goes up (D184). ⌘⇧] / ⌘⇧[ walk the lens's tasks from anywhere
(D244); ⌘O opens any task (D216).

## Review 2026-11-22 (D471)

The author on 0.1.12, on their own home at about 1400: 「感觉好乱呀」. Designed this time on the real
board first: the home's Log replayed into a demo core (`apps/web/demo-replay.ts`; the person's export
never enters the repository) and the same shapes with invented words
(`apps/web/demo-replay-shapes.ts`). Three directions (one ledger; tray and desk; the partner's note)
rendered on the real board, scored, and the ledger built on both clients; the six things the author
saw, the rethink and the rubric are D471's. Shots: `.shots/d471/{before,directions,after}/`.
