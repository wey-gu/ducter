# To-do sources (待办来源): the person's to-dos in other apps, and the tasks bound to them

Decided in D341 (may need renumbering at merge). Evidence: `research/126-task-sources.md`. Words are the
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
| Open / closed (done) | the app | Never inferred from Ducter's own state. Closed there while the task works: the task is told, and one card asks **{label} 在 {app} 上关掉了。这件事停下吗？** (Go 停下, Hold 接着做, default Stop after 30 min: reversible, the task can be continued). Reopened, gone (deleted, the line removed): the task is told, the chip says it |
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
- **New ones (新的来了):** **告诉我 / Tell me** (GitHub's default): a look that finds new ones wakes the
  partner, at most once per source per 3 hours, and it offers them in one line. **不用说 / Don't tell me**
  (Obsidian's default: a personal list churns; it waits to be asked). **直接接下 / Take it directly**: the
  standing go, at most 5 a day per source; the sixth is offered.
- **The standing go is learned, X2's way:** after the person took to-dos from one source twice in 14 days,
  one card once: **以后 GitHub 上标给你的，直接接下？** (Obsidian: **以后 Obsidian 里的待办，直接接下？**) with
  **直接接下 / Take it directly** and **仍然先问我 / Keep asking me** (default Hold). Settings shows **你接下过两次以后定的**.
- A task taken under the standing go still asks before anything outward, like any task.

## 4. Out: writing back

| App | Default when the task is done | What goes out | Consent |
|---|---|---|---|
| GitHub (shared, seen by others) | **先问我 / Ask me** | One comment, written by the partner in the issue's own language (an English issue gets no Chinese comment: the tool refuses one), with the PR link; close only when the work fully resolves it | A card the first times (**在 {repo}#{n} 下留言？** with the comment whole; Go **留言** or **留言并关掉**, Hold **暂不留言**). After two Go'd comments in 14 days, once: **以后在 GitHub 上做完的，直接留言？**. **留言 / Comment**: comments by itself; closing still asks (**关掉 {repo}#{n}？**). **留言并关掉 / Comment and close**: both by itself, set only by the person in Settings |
| Obsidian (local, the person's own) | **勾掉 / Tick it off** | The line's `[ ]` → `[x]` and ` ✅ YYYY-MM-DD` (before a `^block` id), as the Tasks plugin would | None asked: it is their own file, seen by nobody else, and undone by unticking. **先问我** and **不动它 / Leave it** are one tap away. A repeating line (🔁) is never ticked here (the plugin makes the next one when the person ticks it) |

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
  its name, whose or which folder, counts **{n} 件没做完** **{n} 件在做** as separate facts, **新的来了** and
  **做完以后** as segments, the standing line, a problem row, a quiet **移除** that asks in place:
  **移除 {name}？已经接下的事还在。**); **还能加上**: GitHub always while it isn't added (D345: **连上** signs the home in, in place, putting gh there first when it isn't; signed in, it is a source with its defaults), each vault Obsidian
  lists on the home, **加上一个 Obsidian 库…** by folder, and **Jira** with **即将推出 / Coming soon**. Its clay
  art is owed (the page with lines stands in, `todo.md`).
- **The chip** (opened task's meta line, On hand cards, New task's pick, the write card): the app's own
  mark (D314) and `repo#12` or the note's name; it opens the to-do in its app (`obsidian://open…` for a
  vault line); beside it, apart (D291): **已留言 / Commented**, **已关掉 / Closed**, **已勾掉 / Ticked off**,
  **已不在 / Gone**.
- **On hand by source:** after the projects in the lens column (and the row of names on a phone), under
  **来自 / From**, one row per source with a bound task (its mark and name); it narrows the board the way a
  project does (`src:<id>`, kept per device).

## 7. Mechanics

- `packages/protocol/src/task-sources.ts`: kinds, `SourceItemRef`, `SourceItem`, `SourceView`, `SourceAsk`,
  `WhenNew`/`WhenDone`, the frames. Log events: `task_bound`, `source_seen` (new, closed, reopened, edited,
  gone), `source_write`. `TaskCard.source` is projected from them.
- `packages/core/src/task-sources/`: `adapter.ts` (the interface every app implements: `status`, `list`,
  `get`, `write`, `ops`; consent is never an adapter's), `github.ts` (gh: `/issues?filter=assigned` with
  ETag, `/repos/{o}/{r}/issues/{n}`, comment and close through `--input -`), `obsidian.ts` (parser, the
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
