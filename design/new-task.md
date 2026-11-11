# New task: opening a task yourself (D128, D185, D186, D197, D202)

The power path: the user opens a task with their own words, picks where and (optionally) who,
and the task starts at once. Never required: saying it to the partner still works and stays
the default. Decisions: D128, D185 (the card redone; starting later, on a schedule, on an event,
or until), D186 (projects by hand), D197 (a folder on your Mac for a home on a server) in
`decisions.md`. Glossary rows: `product-model.md` §1 ("a
task the user opens themselves").

**Status.** Built end to end. Core, protocol, runner, the Go protocol mirror and the CLI are
tested (`packages/core/test/new-task.test.ts`, `packages/cli/test/talk.test.ts`) and checked
live on a scratch Ducter. The desktop card, ⌘N, By project, the Changes header and `open_task`
are in `apps/desktop/internal/views/{newtask,byproject}.go` (`newtask_test.go`, screenshots
in `.shots/newtask-ui/`); the phone's sheet and `open_task` in `apps/web/src` (`web.test.ts`,
shot against `apps/web/demo-newtask.ts`). D185/D186 built 2026-11-11: core
(`packages/core/test/{new-task,work-over-time}.test.ts`), desktop (`newtask_test.go`, shots in
`.shots/newtask/` before/after, zh/en), web (`apps/web/test/newtask.test.ts`, shots in
`.shots/newtask/web/`, phone and wide, light and dark, zh/en). D197 built 2026-11-11: core
(`new-task.test.ts`, a fake worker), runner (`worker.test.ts`, `folderInfo`), desktop
(`newtask_test.go`, a home elsewhere with and without this Mac's worker), web (`newtask.test.ts`).
D202 built 2026-11-11: core (`packages/core/test/tune.test.ts`), runner (`runner.test.ts`,
`harnesses.test.ts`, `worker.test.ts`), CLI (`talk.test.ts`), desktop (`newtasktune_test.go`, shots
in `.shots/d202/mac/`), web (`apps/web/test/tune.test.ts`, shots in `.shots/d202/web/`, phone, light
and dark). Not yet reviewed by the user.

## Who and how it starts

- **Who:** mostly the heavy multi-agent developer, who knows exactly what to hand off and to
  whom and wants no middleman rewriting it; also anyone who already knows the words.
- **Before:** "I know what I want; let me just start it." **After:** it is running, in the
  place they picked, with their own words, and the partner will tell them when it's done.
- **First time:** they see 新建 / New task on On hand (a quiet text button, never a FAB),
  or press ⌘N. The card's defaults are already right (last repo, its default branch, the best
  fit); typing and pressing Start is all it takes.

## The card (D185)

On the Mac it is a card over the page (a soft scrim, Esc or a click outside closes it and keeps
the words); on the phone, a bottom sheet opened by a **＋** at the top right of On hand, in the
system's light or dark, over a page that only dims slightly (the `--scrim` token, D144). Top to
bottom:

1. **做什么 / What**, focused, then quiet: 你写的话会原样交给它 / It gets your words as you wrote them.
2. **One row of pills**, all one height (the shared `pill` / `Pill`), each opening a short list
   in place (`menuRow` / `MenuRow`; one list open at a time; Esc closes the list first):

| Pill | Default | Its list |
|---|---|---|
| folder (在哪儿做 / Where) | the most recently used | the folders tasks used and the projects added (D186), most recent first, each with its path as ~/… (and **· {computer}** when the places span two computers, D197); then the repos `ducter up` noticed; 不用文件夹 / No folder; on the Mac, 加一个文件夹… / Add a folder… (see below) |
| branch (repos only; a worker's repo too, D197) | the repo's default branch | 从哪个分支开始 / Start from which branch: its 30 most recently committed, the default marked 默认 / default |
| computer (only when real, D157) | the suggested one | 在哪台电脑上做 / On which computer |
| 谁来做 / Who does it | the top candidate at the place's computer, tagged 推荐 / Suggested (why on hover); else the one the user last picked on this client; the pill reads **{agent} · {model} · {effort}** (D202) | every agent on every computer, one row each (D202): those that can here, best first, its one reason under it; then each that can only on another computer, **在 {computer} 上** (see below); a blocked one greyed with why. Under the chosen one, **模型 / Model** and **思考深度 / Effort** |
| 什么时候开始 / When it starts | 现在 / Now | 现在 · 定个时间 · 定期做 · 等某件事发生 · 一直做到…, each with one line of what it means |

3. **When it doesn't start now**, one line under the pills: At a time: 今天 / 明天 / 后天 and a
   typed time (9, 9:00, 21:30, 9.30); On a schedule: 每天 / 工作日 / 每周 (and a day) / 每隔几小时
   (1, 2, 4 or 8, round the clock) and the time; When something happens: **等到** and what it
   waits for; Keep going until: **做到** and what must hold (Return starts).
4. **The foot:** one line on the left (what didn't work, in the failed ink; or **开始了：「X」** with
   **打开 / Open** after ⇧⌘↩; or the keys **⌘↩ 开始 · ⇧⌘↩ 开始并接着新建**), then **取消 /
   Cancel** and **开始 / Start** (**定好 / Schedule** for a time or a schedule) at one height.

**⌘↩** (anywhere in the card) starts: `task_new`, then on `task_new_result` ok it opens that task
(Esc returns to where the user was); a time or a schedule instead closes the card on On hand.
**⇧⌘↩** starts and keeps the card, empty, with the same folder, branch, agent and when. A failed
open keeps the card and its words, with the reason in the foot (offline, not a repo, no agent, a
time already past, nothing to wait for, else `message`).

What each when does underneath (no new scheduler):

| When | Underneath |
|---|---|
| Now | the task opens (D128) |
| At a time | a routine of the user's own with one firing (`every: "once"`, `date`, `time`, in the client's zone); it opens the task with the words verbatim at that time, then ends. On hand: its calendar with the date, **到时候开始 / Starts then**, **不做了 / Don't do it** |
| On a schedule | a routine of the user's own (`by: "you"`), active at once, no proposal card; each run gets the words and one line on which run it is, the agent picked, effect `local_writes`, reports every run; D114's pauses and review hold |
| When something happens | the task opens now with **先等到：{X}\n然后：{words}** and a line asking it to wait with `wait_for` and a check; it rests on Waiting (D112 (4)) |
| Keep going until | the task opens with the words verbatim, then `until` with the condition (D113) |

**An agent on another computer (D202).** For a folder on hel, Claude Code on the Mac is still a
row: **Claude Code 在 Macbook Pro M3 上**. Its second line says what picking it does: **会换到
Macbook Pro M3 上的 ducter / Switches to ducter on Macbook Pro M3** when the places list that repo
on the Mac (same origin, `PlaceChoice.remote`; when neither place knows an origin, the exact folder
name), and the card then moves to that copy (the same branch when it has one); else **文件夹要在
Macbook Pro M3 上 / The folder must be on Macbook Pro M3**, and picking it opens the folder list on
the Mac's places only (with **不用文件夹** there and, where this client can, **加一个文件夹…**); a
folder there picks the agent. For No folder it moves the computer, as D157.

**Model and effort (D202).** Under the chosen agent in Who, two short rows of choices that wrap:
**模型 / Model**, the account's own models on that computer (read from the agent itself, token-free:
OAR `listModels`; Claude Code's named models, not its pinned versions), Ducter's suggestion tagged
**推荐**; and **思考深度 / Effort**, that model's own levels (**低 · 中 · 高 · 很高 · 最高**, Codex's
also **极限**), its own default tagged **默认 / Default** (a model that names none starts the row
with **默认**, which sends nothing); no row when the model takes none. Unread in 3 s (a worker away,
an old worker): the tier table's models, no effort row. The last model and effort are remembered
per agent on this client.

**Adding a folder (D186, D197).** 加一个文件夹… opens macOS's folder picker. Where the window's
Ducter runs on this Mac, the folder is the home's own. Where it runs elsewhere (a server) and this
Mac does tasks for it (Settings › 住在哪儿 › 让这台 Mac 也替 {home} 做事), the folder is this Mac's:
`project_add` carries this Mac's worker id and the home reads the folder through the worker
(`folderInfo`). Where it runs elsewhere and this Mac doesn't, the row is greyed with one line:
**在设置 › 住在哪儿打开「让这台 Mac 也替 {home} 做事」，就能加这台 Mac 上的文件夹。/ To add a folder on
this Mac, turn on "Let this Mac do tasks for {home}" in Settings › Where it lives.** The phone and
the browser list these places but don't add one (no picker).

**Which computer (D197).** Only when the listed places span more than one computer does each row's
second line end in **· {computer}**; the list keeps one order, most recent first. **~** is the home
folder of the computer the path is on, read from the path (`/Users/<name>`, `/home/<name>`), never
from this Mac's own home.

Inside an opened task, ⌘N opens the card with that task's place prefilled. On hand's group
header "+" (By project) is 在这儿开一件 / New task here, prefilling that place.

`open_task` (`ducter open`): the desktop opens the task as if tapped and brings its window
forward; the phone shows it. Esc (or back) returns to where the user was. Both say
`hello.client` ("desktop", "web").

## On hand by project

A toggle at On hand's head: 按状态 / By state (today's lanes) · 按项目 / By project. Desktop
only; remembered per client (local storage), not a setting. By project:

- Groups by the card's `project` (an added project's name, D186, else a folder's name), else
  the folder's name, else 其他 / Other; then the projects added by hand with nothing yet
  (**还没有事。/ Nothing here yet.**). The header has the group's path as ~/… and "+"
  (在这儿开一件 / New task here). At the foot, on the Mac whose Ducter runs here or that does tasks for it (D197), **＋ 加一个文件夹 /
  Add a folder** (D186).
- A row is `title · kind · branch · +adds −dels · state`: kind is what it waits for (**等 …**) or
  which try of a loop it is (**第 n 次**), else nothing; `place.branch`, `changes.adds` /
  `changes.dels` (absent until counted: show nothing, never 0), the state word.
- What starts later or repeats in that folder (a routine with a place, D185) is a row of its
  group: its calendar page, its name, when in words, and **下次…** (or paused / running). The
  shelf under By project keeps only routines of no folder.

The opened task's Changes header says **改动 · 3 个文件 +42 −7 / Changes · 3 files +42 −7**
from the same `changes`.

## Wire (built)

| Frame | Answer | Notes |
|---|---|---|
| `{t:"task_new_options", place?}` | `{t:"task_new_options", places: PlaceChoice[], candidates: Candidate[], models?: AgentModels[]}` | Candidates at `place` (default this machine), every agent on every computer (D202). `PlaceChoice` = place (repo, folder or none), name, usedAt, defaultBranch, branches (a worker's repo: asked of it, at most 3 s, D197), added (D186), computer (D197: only when the places span two computers), remote (D202: the origin as host/owner/repo). `AgentModels` = harness, device (with two computers), from (`live` or `tiers`), models: `ModelChoice` = id, label, suggested, default, efforts, defaultEffort (read alongside, at most 3 s) |
| `{t:"task_new", words, place?, harness?, model?, effort?, clientId?, when?}` | `{t:"task_new_result", ok, clientId, taskId, card}`; for a time or a schedule `{ok, clientId, routineId, routine}`; or `{ok:false, reason, message}` | `reason`: empty, no_agent, not_repo, offline, past, no_condition, failed. `when` (D185): `{kind:"now"}`, `{kind:"at", date, time, tz}`, `{kind:"every", every: day\|weekday\|week\|hours, days?, hours?, time, tz}`, `{kind:"when"\|"until", condition}`. A resend with the same clientId opens nothing twice. Send `harness` only when the user picked someone other than the top candidate; `model` and `effort` (D202) only when they differ from the suggestion and the model's own default, and then `harness` too. An effort the chosen model on its computer doesn't offer, or that can't be checked, is dropped with a line in the task, never sent |
| `{t:"project_add", path, device?, clientId?}` (D186, D197) | `{t:"project_add_result", ok, clientId, place: PlaceChoice}` or `{ok:false, reason: not_found\|offline\|failed, message}` | A folder on the home's computer, or with `device` on that worker, read there by its `folderInfo` op (`{exists, kind, root, name, defaultBranch?, branches?}`); a folder inside a repo adds the repo. `OnHand.projects` lists the added ones |
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

- The computer (D157, `design/where.md` §6.3): a computer part on a Where chip, shown
  only when a repo is on two computers (No folder's is built).
- D202: Claude Code's pinned model versions (claude-opus-4-8, …) in the Model row (todo).

- Attachments on the card (todo, trigger: the first brief that needs a screenshot).
- By project on the phone (todo).
- Enforcing "retitle once" in code (today the note asks for it).
- D186's rename and remove of a project, and adding a folder on the server itself from a
  server home, or from the phone (todo; a folder on this Mac is D197).
- Recurring on a condition ("every time X happens") from the card: still said to the partner
  (a condition routine needs its check compiled by a model); the card's 等某件事发生 is one-shot.
