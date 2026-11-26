# To-do sources (待办来源): the person's to-dos in other apps, and the tasks bound to them

Decided in D341; the pile (§9) in D359 (both may need renumbering at merge). Evidence: `research/126-task-sources.md`. Words are the
glossary's (`product-model.md`); the look is Pebble's (`ui.md`). Built: GitHub (read, bind, comment,
close) and Obsidian on the home (read, bind, tick); Jira and a company's own tracker are adapters later.

## 1. Who is in this moment

| Who | Before | After | How it starts |
|---|---|---|---|
| The heavy developer | Issues assigned across repos, each copied by hand into an agent session, the PR link pasted back into the issue by hand | "接 #12" in the conversation; the task carries the issue; when it is done the comment with the PR link is one Go away, then goes by itself | Settings › 待办来源 always offers GitHub with one **连上** (D345): the home's gh signs in in place (put there first in one tap when it isn't, D272's same panel), and GitHub is a source; or they just ask "GitHub 上有什么分给我的？" and the partner reads it (asking is the consent to read) |
| The consumer | A vault of to-dos in Obsidian that never shrinks | Picks "订高铁票" in New task; it is done; the line is ticked in Obsidian by itself, with the date the Tasks plugin would have written | Settings › 待办来源 lists the vaults Obsidian itself knows on this computer, each with 加上 |
| The fresh user | Has never heard of an issue | Meets nothing new: the pane says plainly what it is ("你在 GitHub、Obsidian 里的待办…"), and nothing happens until something is added | The partner offers nothing until a source is added or they ask |

Feel (D36): 好用 one tap or one sentence; 顺滑 the to-do's own words become the brief, the chip opens it in
its app; 赏心悦目 each app by its own mark; 放心 nothing outside starts work by itself, nothing goes out to a
shared tracker without a Go or a standing go the person said yes to, every write is in Done for you;
惊喜 the line ticks itself, the PR link lands in the issue.

## 2. Who owns what (single source of truth per field)

The outside app owns **what** the to-do is and **whether it is open**; Ducter owns **how** it gets done.
No field is synced both ways: each has one owner, and the other side only reads it.

| Field | Owner | What Ducter does |
|---|---|---|
| Title, body, labels, assignee, due date, priority | the app | Reads them when the task is opened (the brief carries them, fenced as outside text: never instructions). An edit there is told to the running task (`changeNote`), and the chip shows the new title |
| Open / closed (done) | the app | Never inferred from Ducter's own state. Closed there while the task works: the task is told, and one card asks **{label} 在 {app} 上关掉了。这个任务停下吗？** (Go 停下, Hold 接着做, default Stop after 30 min: reversible, the task can be continued). Reopened, gone (deleted, the line removed): the task is told, the chip says it |
| The task's title, session, transcript, reports, branch, PR | Ducter | Never written to the app as state. A comment carries the result once, when done |
| Comments | both, append-only | Ducter adds its own (signed "Written with Ducter"); others' comments are read only when the task looks at the issue itself |

Why not two-way sync (the alternative not taken): mirroring Ducter's working state into the tracker
(labels, assignee, status) writes something every teammate sees on every state change, needs per-team
conventions, and gives two owners for one field, so conflicts need rules. One owner per field needs none.

## 3. In: outside to-dos never start work by themselves

- **Asked:** "GitHub 上有什么分给我的？" → `todos do=list` → one short line naming one to three by number and
  asking which; nothing starts. "接 #12" → `todos do=take` → `task_open`; Ducter binds the task (also when
  the take was skipped and the brief names exactly one open issue: `bindStaged`'s fallback).
- **New task:** **从待办里选 / Pick from your to-dos** lists the open ones (search, due dates, 在做 for one that
  has a live task: picking it opens that task, never a second one). The pick fills the words and binds.
- **New ones (新的来了):** **说一声 / Say so** (GitHub's default): a look that finds new ones wakes the
  partner, at most once per source per 3 hours, and it offers them in one line. **不用说 / Stay quiet**
  (Obsidian's default: a personal list churns; it waits to be asked). **直接接下 / Take it on**: the
  standing go, at most 5 a day per source; the sixth is offered.
- **The standing go is learned, X2's way:** after two to-dos the person took from one source in 14 days
  finished well (D395: never at the take, never beside a task that couldn't start or failed), one card
  once, when the second finishes: **以后 GitHub 上标给你的，直接接下？** (Obsidian: **以后 Obsidian 里的待办，直接接下？**) with
  **直接接下 / Take it on** and **仍然先问你 / Keep asking you** (default Hold). Settings shows **你接下过两次以后定的**.
- A task taken under the standing go still asks before anything outward, like any task.

## 4. Out: writing back

| App | Default when the task is done | What goes out | Consent |
|---|---|---|---|
| GitHub (shared, seen by others) | **先问你 / Ask you first** | One comment, written by the partner in the issue's own language (an English issue gets no Chinese comment: the tool refuses one), with the PR link; close only when the work fully resolves it | A card the first times (**在 {repo}#{n} 下留言？** with the comment whole; Go **留言** or **留言并关掉**, Hold **暂不留言**). After two Go'd comments in 14 days, once: **以后在 GitHub 上做完的，直接留言？**. **留言 / Comment**: comments by itself; closing still asks (**关掉 {repo}#{n}？**). **留言并关掉 / Comment and close**: both by itself, set only by the person in Settings |
| Obsidian (local, the person's own) | **勾掉 / Tick it off** | The line's `[ ]` → `[x]` and ` ✅ YYYY-MM-DD` (before a `^block` id), as the Tasks plugin would | None asked: it is their own file, seen by nobody else, and undone by unticking. **先问你** and **不动它 / Leave it** are one tap away. A repeating line (🔁) is never ticked here (the plugin makes the next one when the person ticks it) |

Every write is a `source_write` event (the gate's say: `go` with its decision, `rule`, or `undo`) and is
in **替你做过的 / Done for you**: a comment as sent (发出的), a close or tick as changed (改动), with the Go or
"allowed before". A PR whose body says `Fixes #n` closes the issue at the person's merge; no card for that.

## 5. The Obsidian write, safely

The person may have the note open, and a sync may be bringing a copy (`research/126` §2). One line, in
place (the same inode: Obsidian and the syncs keep following the file):

1. Find the line by its 🆔, else its `^block` id, else the hash of its words (never a line number).
2. Refuse and try at the next look if: a sync conflict copy is beside the note; the file is evicted to
   iCloud (size but no blocks); it changed in the last 3 s; the line is no longer open (ticked or edited by
   hand: then nothing is written and the chip shows what the app says).
3. Compare and swap: read bytes and mtime, build the one new line, re-stat and re-read just before the
   write; any difference refuses.
4. Keep the BOM, CRLF or LF, and the last newline; never touch another line; read back to confirm.

## 6. Where it shows

- **Settings › 待办来源 / To-do sources** (after 账号 / Accounts): the lede; one card per source (its mark,
  its name, whose or which folder, counts **{n} 个没做完** **{n} 个在做** as separate facts (D351: only after a look
  that read the list; GitHub's is the true total, **至少 {n} 个没做完** when only a bound is known, and
  **{n} 个 PR 等你 review** apart; before a look **正在看…**; a failed look **没能读到 {app}。**, its reason
  apart, and **再试一次**), **新的来了** and
  **做完以后** as segments, which part it reads as labelled 44-tall fields saved on Return or leaving them (D348:
  GitHub **只看这些仓库** as owner/repo by commas, blank = every repository; a vault **看哪个文件夹** and **只看带这个标签的**,
  blank = the whole vault, any tag; `source_set`, read by the adapters from the next look), the standing line, a problem row, a quiet **移除** that asks in place:
  **移除 {name}？已经接下的事还在。**); **还能加上**: GitHub always while it isn't added (D345: **连上** signs the home in, in place, putting gh there first when it isn't; signed in, it is a source with its defaults), each vault Obsidian
  lists on the home, **加上一个 Obsidian 库…** by folder, and **Jira** with **即将推出 / Coming soon**. Its clay
  art (D348): `set_todos`, a cream note page with one box ticked in mint and one still open.
- **The chip** (opened task's meta line, On hand cards, New task's pick, the write card): the app's own
  mark (D314) and `repo#12` or the note's name; it opens the to-do in its app (`obsidian://open…` for a
  vault line); beside it, apart (D291): **已留言 / Commented**, **已关掉 / Closed**, **已勾掉 / Ticked off**,
  **已不在 / Gone**.
- **On hand (D357):** a group after 今天做完 / Done today, only while a source is on and something is
  open, under All or that source's lens: **GitHub 上标给你的 / Assigned to you on GitHub** (a vault: **{vault}
  里的待办**; several: **你的待办 / Your to-dos** with their marks) and its count as 在等 5 has it. At most
  three stand as the board's cards, chosen by the home (`glanceOf`): the newest PR waiting for review
  (**等你 review**, opened only), assigned ones that mention the person (**提到了你**, two at most), an
  Obsidian line due by the day after tomorrow, then the newest a source at a time; none with a live
  task. Each says why, its chip and labels apart (D291), when it changed, and **交给{name} / Hand to
  {name}** (New task's pick without the card: `task_new` with `handed`; D395: where it works is the
  one resolver's answer, `core/src/repo-where.ts`, see design/where.md §18). The rest fold under **还有 {n} 个 / {n} more**, opened in place: Find,
  chips (sources, **等你 review {n}**, repositories, a vault's folders and tags), low cards, pages of 30.
  Settings' **{n} 个没做完 ›** and **{n} 个 PR 等你 review ›** open it there; no list in Settings.
- **On hand by source:** after the projects in the lens column (and the row of names on a phone), under
  **来自 / From**, one row per source with a bound task (its mark and name); it narrows the board the way a
  project does (`src:<id>`, kept per device).

## 7. Mechanics

- `packages/protocol/src/task-sources.ts`: kinds, `SourceItemRef`, `SourceItem`, `SourceView`, `SourceAsk`,
  `WhenNew`/`WhenDone`, the frames. Log events: `task_bound`, `source_seen` (new, closed, reopened, edited,
  gone), `source_write`. `TaskCard.source` is projected from them.
- `packages/core/src/task-sources/`: `adapter.ts` (the interface every app implements: `status`, `list`,
  `get`, `write`, `ops`, optional `total` and `browse`; consent is never an adapter's), `github.ts` (gh: `/issues?filter=assigned` with
  ETag, one page of the 50 most recent for offering and "new"; the count is `search/issues` `total_count`
  over the same scope (`assignee:{login} is:open archived:false`, plus `repo:`/`label:` for the filters),
  and PRs waiting for review apart (`review-requested:{login} is:open is:pr`), asked when the list changed
  or every 10 min (D351), with the newest three review requests and assigned mentions for On hand
  (D357); the fold's pages (D357): `/issues?filter=assigned&page=n` while nothing narrows, else search
  (`assignee:`/`review-requested:`, `repo:`, `label:`, the words), 30 a page, each kept 2 min, the
  rate limit said as such; `/repos/{o}/{r}/issues/{n}`, comment and close through `--input -`; D428: each item
  keeps who opened it, who it is assigned to, `created_at` and its milestone, and the sort's read of every
  open one (`all()`) asks GitHub's timeline once, through GraphQL search, 100 a page, who assigned each to
  the person (`assignedBy`; a failure leaves it unsaid, never the list); the pile keeps a body's first
  300 characters for the hand-over's finder, handover.md §12), `obsidian.ts` (parser, the
  write above, Obsidian's own vault list), `index.ts` (the store `task-sources.json`, looks every 2 min
  and each bound to-do every 5 min while its task is live, bindings, the cards and their Go, the standing
  goes, the tick on done).
- The partner's tool `todos` (do=list/take/write), listed while a source is on or the home's gh is
  signed in. Report lines for a bound task say what to propose; core makes and runs the cards.
- Polling, not webhooks: a self-hosted home has no public address; an unchanged ETag'd look costs nothing.

## 8. Later adapters

Jira (`/rest/api/3/search/jql`, ADF comments, done as a chosen workflow transition, asking when several
fit) and a company's own tracker (an MCP or HTTP adapter with list mine, get, comment, set done, a link)
implement `SourceAdapter`; nothing else changes: the gate, the Log, the chip and the pane are shared.
Triggers in `todo.md`.

## 9. The pile: sorted, handed over, seen shrinking (D359)

Who and why: the person with 557 open needs one thing first, someone to carry the pile; the list of
three (§6) only showed it. Evidence for the look and the words: `research/130-todo-pile.md`.

| Step | When | What the person sees | What runs |
|---|---|---|---|
| Sort | the first look that reads a source's list, once a day after, **再理一遍 / Sort again**, or "帮我理一理" (`todos do=sort`) | **正在一个个看…** with a bar, **看了 n 个** · **共 n 个** apart; then one sentence in the conversation (on connect and when asked only) and the groups on the pile | GitHub's list in pages of 100 (at most 600), batches of 25 to the harness's cheapest model (`createHarnessAsk`, cheap), the text fenced and redacted; code's rules first (a duplicate or won't-fix label); a verdict kept until the issue's `updated_at` changes; stopped at 300k weighted tokens (`failed: budget`, the rest **还没细看的**) |
| Hand over | **交给{name}** on the do row | a sheet, small ones first, six ticked, **一次做 3 个，一个做完接下一个。**; **交给{name}这 6 个** | a queue in `task-sources-pile.json`: `PILE_CAP` (3) tasks at a time, each opened like New task's pick with "Fixes owner/repo#n" in its brief and bound by the person; the next on any task's end. Never offers the standing go. Nothing is posted |
| Decide | **一个个定** | one question each, **交给{name} · 可以关掉 · 先放着**, the suggestion marked **建议** | `pile_choose`: handed over, moved to the closable ones, or left. Never a Log decision |
| Close | **过目** | each closable one with **会留一句** and **留着**; **关掉这 n 个，各留一句** | one `decision` (src `batch`, every line) resolved Go by the person where it was given; per issue a comment then a close as *not planned*, each a `source_write` (`by: go`); the count drops at each close |
| Pre-read | the two newest PRs waiting for review, by themselves (at most 6 a day), or **看看** | on the card **我看过了** · **2 处问题** · **1 条建议**; the sheet with the drafted comments, **不发这条**, **发出这 n 条** | the PR's diff (cut at 60 KB) and the repository's own review guide when its folder is on the home, to the cheapest model; sent as one `COMMENT` review (`source_write` op `review`), never a verdict on the PR (only comments) |
| Morning | the morning note, unless 只说急的 or 等你来问 | a find **你的待办**: **昨天替你清掉了 4 个。今天能替你清掉这 3 个。**, the three under 怎么知道的, Go **交给{name}** | `proactive.morningFinds` → `pile.morning`: once a day, an offer (D453: never needs-you, fades; unanswered mornings never stop it); a yes in words is `todos do=hand picks=true` |

The numbers: the pile's count is GitHub's search total (§7), ticked down at once by each close or
tick Ducter writes; **今天替你清掉 n 个** counts the to-dos Ducter closed or ticked for the person that
day (their day, their zone); every group count is code's count of verdicts still open and not handed
over. None is a number a model wrote.

**A review task's drafts (D394).** A task of the person's that reviews their requests every so often
reports each round with `review_report`, from the round's final look (D612: only a task the partner recorded as `needs.reviews` at open; a dev task that fixes code and opens its own PR never gets the tool or a board) (D528: a later call in the
same round replaces the earlier one, so a request found by the end-of-round look is in that round's
report and board; a formal request the round newly brought is said once in one line, **新来了一个评审请求：{link}「{title}」。**,
never again at the same head); the drafts for PRs it reviewed again land as those PRs'
pre-reads (marked with the task and the head), so the same card and sheet show them. One card a
round, **{n} 个 PR 的评审写好了，发到 GitHub？**, carries every unsent draft; Go posts each as one
comment-only review (`source_write` op `review`), Hold posts nothing. **Under a standing
permission (D413)** the person said (**不用问我的 / Without asking**, `core/src/standing.ts`), the
drafts inside it (its orgs; D495: a PR the round marks `mention` too, the routine reviews what the
person asked it to) are posted in the round through
the same write (`by: "rule"`, `standing`, `said` = their words), the card carries only the rest, and
the first post under a new permission is one partner line listing what went with links. The request is tied to the
task by its read, not bound (a binding's end comments or closes, which a review must not).
**Every review can go (D540).** A PR reviewed this round carries the review's own `body` (its
conclusion and what was checked, in the PR's language) beside its notes; with no notes the body is
the whole review, so a PR with nothing to change still gets one on GitHub. `changed` means reviewed
this round: a new head, a new request, the person's ask, or no review of the task's yet at this
head. A call between rounds (the person asked about one PR) replaces the round's report and posts at
once; a PR already posted at the same head is never posted twice. While a pr_review permission
holds, every round's wake and the task's brief say it as a fact with where, the person's words and
the one means (review_report, posted at once; never `gh pr review` by the task, never a draft left in
a report, never held for the next round). A draft outside it is on one card at once.

What it never does: post at hand-over, close without the sheet's Go, close a vault line (a tick says
it was done: a closable-looking line can wait instead), give a PR a verdict (only comments), or speak
in the evening (the day's line lives on the pile and opens the next morning's find).

## 10. A comment the person asked for before the work (D415)

A hand-over's note can ask Ducter to tell the issues first ("在 issue 里留言说一下我的 ducter agent 要开始做
了"). That comment is an outward write like D341's write-backs: it goes through the same audited write
(`source_write`, in 替你做过的), by Go on one card (**先在这 {n} 个下面留一句，再开始？**) or under a
standing permission the person said for issue comments (D413's `issue_comment`, bounded by the owners
they named). Only issues (never a PR, never a vault line), only a comment (never a close). The tasks
start after it, and their briefs say it went (handover.md §11).
