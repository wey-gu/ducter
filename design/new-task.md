# New task: opening a task yourself (D128)

The power path: the user opens a task with their own words, picks where and (optionally) who,
and the task starts at once. Never required: saying it to the partner still works and stays
the default. Decision: D128 in `decisions.md`. Glossary rows: `product-model.md` §1 ("a task the
user opens themselves").

**Status.** Built end to end. Core, protocol, runner, the Go protocol mirror and the CLI are
tested (`packages/core/test/new-task.test.ts`, `packages/cli/test/talk.test.ts`) and checked
live on a scratch Ducter. The desktop card, ⌘N, By project, the Changes header and `open_task`
are in `apps/desktop/internal/views/{newtask,byproject}.go` (`newtask_test.go`, screenshots
in `.shots/newtask-ui/`); the phone's sheet and `open_task` in `apps/web/src` (`web.test.ts`,
shot against `apps/web/demo-newtask.ts`). Not yet reviewed by the user.

## Who and how it starts

- **Who:** mostly the heavy multi-agent developer, who knows exactly what to hand off and to
  whom and wants no middleman rewriting it; also anyone who already knows the words.
- **Before:** "I know what I want; let me just start it." **After:** it is running, in the
  place they picked, with their own words, and the partner will tell them when it's done.
- **First time:** they see 开一件事 / New task on On hand (a quiet text button, never a FAB),
  or press ⌘N. The card's defaults are already right (last repo, its default branch, the best
  fit); typing and pressing Start is all it takes.

## The card

On the Mac it is a card over the page (a soft scrim, Esc or a click outside closes it and keeps
the words); on the phone, a bottom sheet opened by a **＋** at the top right of On hand, in the
system's light or dark, over a page that only dims slightly (the `--scrim` token: a light warm
brown in light, a deeper dim in dark, D144). Three
rows, top to bottom, each a row of flat chips (the chosen one white with an ink hairline):

| Row | Default | List |
|---|---|---|
| 在哪儿做 / Where | the most recently used repo | repos tasks used, most recent first, then the ones `ducter up` noticed (`firstrun.json`), then 不用文件夹 / No folder. The repo chip has a branch part: the repo's default branch (origin's, else main or master, else the checkout's), pickable from its 30 most recently committed branches |
| 谁来做 / Who does it | the top candidate, its coin tagged 推荐 / Suggested; its one-line reason on hover (the same reasons as 换谁来做 / Switch who does it). No line under the row (D144) | the agent coins from fw_candidates at that place, best first; a blocked one greyed with why on hover. Picking another pins it for this task; its coin says "…，是你选的 / …; you picked it" on hover |
| 做什么 / What | empty, focused | a text field; under it, quiet: 你写的话会原样交给它 / It gets your words as you wrote them |

**开始 / Start** (Return; ⌘Return in a multi-line field) sends `task_new` and, on
`task_new_result` ok, opens that task (Esc returns to where the user was). A failed open keeps
the card and its words, with the reason in one line under Start (offline, not a repo, no agent,
else `message`). The device is inferred as today; there is no device row, no model or effort
picker, no tabs, no pin or search. The chosen repo's chip reads `ducter · main ▾`; a click on it
opens 从哪个分支开始 / Start from which branch (the default marked 默认 / default), a popover on
the Mac and an inline list on the phone. In the opened task, the words stand under 你交代的 /
What you asked for (the partner's brief stays {name} 交代的).

Inside an opened task, ⌘N opens the card with that task's place prefilled. On hand's group
header "+" (By project) is 在这儿开一件 / New task here, prefilling that place.

`open_task` (`ducter open`): the desktop opens the task as if tapped and brings its window
forward; the phone shows it. Esc (or back) returns to where the user was. Both say
`hello.client` ("desktop", "web").

## On hand by project

A toggle at On hand's head: 按状态 / By state (today's lanes) · 按项目 / By project. Desktop
only; remembered per client (local storage), not a setting. By project:

- Groups by the card's `project` (a repo's folder name for tasks opened with New task), else
  the repo's folder name, else 其他 / Other. The header carries "+" (在这儿开一件 / New task here).
- A row is `title · branch · +adds −dels · state`: `place.branch`, `changes.adds` /
  `changes.dels` (absent until counted: show nothing, never 0), the state word.

The opened task's Changes header says **改动 · 3 个文件 +42 −7 / Changes · 3 files +42 −7**
from the same `changes`.

## Wire (built)

| Frame | Answer | Notes |
|---|---|---|
| `{t:"task_new_options", place?}` | `{t:"task_new_options", places: PlaceChoice[], candidates: Candidate[]}` | Candidates at `place` (default this machine). `PlaceChoice` = place, name, usedAt, defaultBranch, branches |
| `{t:"task_new", words, place?, harness?, model?, clientId?}` | `{t:"task_new_result", ok, clientId, taskId, card}` or `{ok:false, reason, message}` | `reason`: empty, no_agent, not_repo, offline, failed. A resend with the same clientId opens nothing twice. Send `harness` only when the user picked someone other than the top candidate |
| `{t:"open_task", taskId}` | the sender: `{t:"open_result", taskId, ok, apps}`; every other live app socket: `{t:"open_task", taskId}` | Apps should say `hello.client` ("desktop", "web"); a `cli` socket is never told. An app that gets `open_task` opens that task as if tapped, and focuses its window |

`TaskCard.openedBy: "you"` marks a task the user opened; `TaskCard.changes` is the cached diff
stat `{files, adds, dels, at}`.

## What happens underneath (built)

- One opening path for the card and `ducter task`: `core/src/newtask.ts` `openYourTask`. The
  title is the first sentence, about 24 Chinese characters or 48 letters, cut with "…". The
  language is the partner's setting, else the words'. The runner logs `task_open` with
  `origin: "you"` and `body_selected` with why `you` for a pick.
- Nothing appears in the conversation at open time. The partner reads a hidden note (a
  user-origin `body_<task>_opened` job_status that clients already hide and that never wakes
  it): 你自己开了「X」/ You opened "X" yourself, the words, and that it may retitle once after
  the first report (task_retitle). Its task list marks the task "the user opened this one
  themselves". The task's report wakes it as usual and it says the result (D124).
- The diff stat: `core/src/changes.ts` asks the runner's `branchChanges` (on a worker too) after
  each turn end, report and state change (debounced 1.5 s), and once for any repo task On hand
  shows uncounted; a report's own count lands at once. On hand never waits for it.

## Not yet

- The computer (draft D157, `design/where.md` §6.3): a computer part on a Where chip, shown
  only when a repo is on two computers or for No folder with two or more; an agent that lives
  only on another computer in Who, picking it moves the computer part too.

- Attachments on the card (todo, trigger: the first brief that needs a screenshot).
- By project on the phone (todo).
- Enforcing "retitle once" in code (today the note asks for it).
