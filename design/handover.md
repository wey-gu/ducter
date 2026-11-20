# Handing over: several to-dos, a note, a shape (D385)

**Status: decided by the author (2026-11-19, all six defaults) and built (all seven slices; §9 says
how, and what is still owed).** Evidence and the rater panels: `research/153-handover-flows.md`. The
first screens were a prototype drawn into the real web app (`design/prototypes/handover.js`, shots in
`.shots/handover-flows/`); the built screens run on `apps/web/demo-handover.ts` (shots in
`.shots/handover-build/`). Builds on D341 (to-do
sources), D359 (the pile and its hand sheet), D360 (groups), D373 (continuity), D157 (where), D372
and D379 (rules by kind and what was said).

## 1. Who is in this moment

- **The heavy developer** (the author: 535 open on hel, 245 the sort calls doable). He thinks in
  subjects ("everything about memory distill"), knows how the work should go (where to build, what
  not to touch), and wants to say it once, then see a plan before a fan-out. *Before:* a list sorted
  by size, six ticked, three tasks at once on whatever computer; he says where to build after it
  failed (hel, 2026-11-19). *After:* the subject in one tap, the note carried into every task, a plan
  that says "this one is already fixed", one review at the end. 放心 and 惊喜.
- **The consumer** with an Obsidian list ("搬家", "日本行"). *Before:* five errands become five
  tasks with five browsers. *After:* "搬家的都交给你，下周六前搞定，预算 3000" makes one errand task
  that carries them in order with one signed-in browser. 好用.
- **The fresh user** with three to-dos. Meets none of this: no subjects under 20 open, no shape row
  for one to-do, the default shape said in one line. "这几件你帮我弄一下" just works. 顺滑.

**First time:** the sheet the person already knows (D359's) gains a find field at the top and, on
the right (wide) or on its second screen (phone), **给{name}的话** and **怎么做**. Nothing to learn:
every part has a default; Go works without touching them.

## 2. One path, many doors

```
 doors                                 the one sheet                          after Go
 ─────                                 ─────────────                          ────────
 讲的是 chip on the pile ─┐         ┌ what   the ticked set (find, all groups)     a group (D360) when 2+
 the sheet's find field ──┤         │ note   给{name}的话 · 给这件的话…            ├ plan first: its first part
 "把…拉出来看看" (set card)┼──────▶ │ how    shape (建议 + why) · 在哪儿做 · 谁来做 ├ 加进「{group}」later
 the pile's do row ───────┤         └ Go     交给{name}这 n 件                     ├ a worker = the group's Where
 the morning's picks ─────┤                                                       └ 一起过目 when all are done
 New task › 从待办里选 ────┘
```

Every door opens the same sheet with its set pre-ticked; the conversation's set card is the same
set, and words said after it are its note. One to-do (W10) skips the how part: it is one task, as
today.

A sentence that names several to-dos outright ("把 #10559 #10560 #10571 修了") is not a door to this
sheet: the partner opens their tasks at once (one `group`), each a line under the message (D425,
`conversation.md` §Several things in one message), and binds each by its ref (D341). The sheet stays
the door for a set found by words or meaning, where a note, a shape and a plan earn their place.

## 3. The sheet

**What (D396: words first, §10).** The sheet asks **想交给{name}哪些？ / What should {name} take on?**
over one field for a sentence; the list below is for confirming and trimming, and the do row's list
is **一件件挑 / Pick one by one**, a link away. The find under it (code's match on words, numbers and
the source's labels at once, then the cheapest model over every open title and label for meaning, across zh and en: one
call, cached per query). Its line says what it found as separate facts: **找到 9 件讲{subject}的 /
9 about {subject}**, **标题里写着的 6 件 / 6 say it in the title**, **说的是同一件事的 3 件 / 3 are
about the same thing**. Items show by the sort's group (**可以交给{name}做的**, **要你拿主意的**,
**可以先放着的**), each with its why, size and number; one found by meaning carries **意思相近 / Same
subject**. Ticked by default: the do ones. A decide one shows its question with the suggestion; ticking
it carries the suggestion as the answer (its note can change it). A later one is unticked.

**The note.** **给{name}的话 / A note for {name}** (placeholder **比如：先别动数据库；验证去 haswell
上跑 / For example: don't touch the database; check it on haswell**), quoted whole at the top of every
task's brief, fenced as the person's words. Per item: **给这件的话… / A note for this one…**, added
to that item's task only. A note that names a computer fills Where; one that states a lasting rule
("验证都去 haswell") is offered once as a rule after the hand-over (D379's ask, unchanged).

**How.** Four shapes, one marked **建议 / Suggested** with its one line of why:

| Shape (zh / en) | Its line | What it makes |
|---|---|---|
| **先出个方案 / Plan first** | **你点头再做 / Starts when you say so** | a group whose first part reads the set and proposes the rest (§4) |
| **合成一件做 / As one task** | **一个任务，一个 PR 修好这几件 / One task, one PR fixes them all** | one task bound to every to-do; its PR says "Fixes" each; only within one repository or one errand |
| **一件做完接下一件 / One after another** (D360) | **在 {repo} 里排着，每件从上一件的分支接着做** | a group, `one_by_one` |
| **同时做 / Side by side** (D360) | **一次 3 件，各自一个 PR / 3 at a time, a PR each** | a group, `side_by_side`, at most `PILE_CAP` at once (today's queue) |
| **加进「{group}」/ Add to "{group}"** | **它正在做 {n} 件 / {n} under way** | shown first only when a live group shares the subject; the set joins its line, or its plan if still planning |

Defaults are code's rule, never a model's: one to-do → no shape row; a subject set or 4+ in one
repository → plan first; 2–3 in one repository → one after another; small ones across repositories
(the do row, the morning picks) → side by side; errands and life to-dos → as one task; a live group
on the subject → add to it.

**Where and who.** New task's rows, **在哪儿做 / Where** and **谁来做 / Who does it**, filled in this
order and said on the row: the note's own words (**你写了 haswell / Your note says haswell**), a rule
(D372, D379), the computer that has the repository's folder (never `place: none` for a code to-do when
a folder exists anywhere in the home), else the home. D395: this order is one shared resolver
(`core/src/repo-where.ts`, design/where.md §18) that task_open and every hand-over use; with no copy
anywhere it clones on the computer that can read it. Who follows rules by kind. Both change on a tap
(the New task pickers).

**Go:** **交给{name}这 n 件 / Hand these n to {name}**, its shape as its own line beneath (never
joined with a dot, D291). On the phone the sheet is two screens: what (foot: **勾了 n 件** and
**下一步：怎么做 / Next: how**), then the note and how (foot: Go).

## 4. Plan first

The group's first part is a task like any other (it shows on On hand as the group's first bead) with
a brief led by: read every to-do in the set with its comments and linked PRs, the repository at its
default branch and the note; do not change anything; report a plan. Its report becomes one card in
the conversation (and inside the group's card on On hand), titled **{group}：方案 / {group}: the
plan**, with **看了这 n 件和 {repo} 的代码 / Read these n and {repo}'s code**, then sections in the
shapes' own words:

- **已经修好了，只差关掉 / Already fixed, only to close**: each with where it was fixed;
- **合成一件做 / As one task**: which to-dos, why together;
- **一件做完接下一件 / One after another**: numbered, each with why in that place;
- **同时做 / Side by side**, when some are independent;
- **先放着 / Leave for now**, with why;
- the note's constraints as separate facts (**都在 haswell 上验证**, **不动数据库迁移**).

Each part has **给这件的话…**. Buttons: **照这个做 / Go with this** (the parts become held members of
the same group, opened by D360's rules; the already-fixed ones go straight to the review sheet),
**先等等 / Hold**, **回复… / Reply…** (words go to the plan's own task, D373, which reports a new plan
in place of the old one). The card is a decision of the plan task; no default runs on it (it has no
countdown: a plan waits for the person).

## 5. In the conversation

"把 memory distill 相关的拉出来我们看看" → the partner calls `todos do=find query="memory distill"`
and says one line (**找到 9 件讲记忆提炼的。能直接交给我的 6 件先勾上了；#405 要你定一下；两件改动大，
先放着。**). Core posts the **set card** under it: the subject as its title and count, four rows with
ticks, **还有 n 件 / n more**, **交给{name}这 n 件… / Hand these n to {name}…** (opens the sheet)
and **也可以直接说怎么做 / Or just say how**. Words after it ("就这几个，#405 也加上，按你的建议。先别
动数据库迁移，验证都去 haswell 上跑。") are its hand-over: the partner calls `todos do=hand set=<id>
note="<their words>"` with the shape it hears (none said: the default), and says one line (**好，我先
看一遍，出个方案给你，你点头再做。**); the task line carries the group's name, its state, where and who.
The set card is never pinned (D381 keeps partner-made lists only).

## 6. After: adding, a worker, review together

- **Adding later:** "这个也加进去" or the sheet's **加进「{group}」**: `task_group add` for a group
  in line; for a group still planning, the to-do goes to the plan task as a follow-up (D373).
- **A worker takes a subject:** "让 haswell 做记忆提炼这一摊" sets the group's Where: every part not
  yet started opens there; one already running stays (moving is D376's, asked).
- **一起过目 / Review together:** when every part of a group is done (done_claimed or merged), its
  card offers it. The sheet lists each part: its PR, checks (**检查都过了 / Checks passed**, **1 项没过
  / 1 check failed**), size, its result line, and the comment it will leave (**会留一句 / Will
  comment**, **不留这条 / Not this one**). **在这 n 件下留言 / Comment on these n** is the Go for all of
  them: one decision (D359's close sheet's pattern), each comment a `source_write` in 替你做过的; the
  already-fixed ones also close; the rest close when their PR merges. The per-task write-back cards of
  D341 are not raised for a group's parts while the group is under way.

## 7. Mechanics (as designed; §9 is what was built)

- Protocol: `pile_hand` gains `note?`, `notes?: Record<ref, string>`, `shape?: "plan" | "one" |
  "one_by_one" | "side_by_side"`, `group?` (add to), `place?`, `harness?`; `pile_find {query}` →
  `pile_find_result {items, how}`; a set card event (`todo_set {setId, query, refs, ticked}`).
- Core (`pile.ts`): `find(query)` (code's match, then one cheapest-model call over titles and labels,
  cached by query and the pile's `sortedAt`); `hand()` makes a group via `task-groups.ts` for 2+;
  the plan part's brief; the review decision. The sort's verdict gains `subject` (the person's
  language, chosen from the subjects already given when one fits), merged once per sort.
- Partner: `todos do=find`, `do=hand set= note= shape= group=` (a tool description change: D175's
  eval with new scenarios: find in zh for an English pile, hand with a note, add to a group).
- Clients: the sheet's find, note and how; the set card; the plan card; Review together. Web and Mac.

## 8. What it never does

Start anything from a find or a set card without a Go or the person's words; fan out a subject set
before the person saw the plan (unless they chose another shape); write to an issue at hand-over;
merge a PR; make a subject a fifth sort group; call a shape **一起做 / Together** (read as side by side
by the raters).

## 9. As built (2026-11-19)

All seven slices, in the plan's order, on one core path (`packages/core/src/task-sources/handover.ts`)
with the shapes in `packages/protocol/src/handover.ts`.

- **Subjects.** The sort's verdict gains `subject` (1–4 words in the person's language); the prompt
  lists the subjects already given so one thing keeps one name across batches and sorts. Code merges
  only spelling (case, spaces). `PileView.subjects` appears past `SUBJECTS_PAST` (20) open, for a
  subject of `SUBJECT_MIN` (3) or more, at most `SUBJECTS_SHOWN` (8), with `subjectsMore`.
- **Find.** `pile_find {query | subject | setId}` → every sort group, each item with how it was found
  (`ref`, `title`, `label`, `subject`, `meaning`). Code first: a number, every query word in the
  title (a word may start a longer one, so "distill" finds "Distillation"), a word in a label, the
  subject. Then meaning: one cheapest-model call over every open title, its labels and subject, across
  zh and en, cached by query + the last sort + language. No model: code's match only, said as
  `noMeaning`. Ordered do, decide, later, close; the do ones ticked.
- **How.** `pile_how {refs, note}` → the shape by code's table (`defaultShape`, `canBeOne`), the one
  repository, `addTo` a live group on the same subject, where (the note's own words → a rule's
  computer → the computer with the repository's folder → the home), who (a rule by kind, else as
  usual), and `lasting` when the note states a lasting where.
- **Go.** `pile_hand` with the note, per-item notes, shape, group, device, harness, subject, setId.
  One to-do: one task now, bound, its brief led by the note (fenced as the person's words). Two or
  more: a D360 group carrying `hand` (its note, shape, where, who, items, plan, review). As one task:
  one task bound to all, "Fixes" each. One after another and side by side: held parts that open by
  the group's line (a hand-over group with no folder still keeps one line) and its cap
  (`HAND_CAP` 3). A lasting where is asked once as a rule (`where_rule`, Go keeps it, the default
  holds). The old `refs`-only `pile_hand` still queues as D359's did.
- **Plan first.** The lead part is a task whose brief asks it to read every to-do (comments, linked
  PRs), the code and the note, change nothing, and call `plan_report` (a task tool only that task
  sees) with `fixed`, `one`, `line`, `side`, `later`, `limits`; read strictly (unknown refs dropped,
  each placed once, the unplaced last in line). Its done report becomes the plan card (decision
  `src.kind: "plan"`, no default, the partner not woken); the group shows it too. 照这个做 (from the
  card's own buttons or `plan_answer` with per-part notes) holds the parts: each as-one and
  side-by-side part its own line, the plan's line one line; later ones go back on the pile; fixed
  ones wait for review together. 先等等 holds; 回复… goes to the plan's own task, which plans again
  (the old card answered by the reply).
- **Review together.** When every part is done (done_claimed or merged), `hand.review` is `ready`.
  `group_review` → rows: each part's to-dos, its PR (the draft PR it opened, or a pull link in its
  report), GitHub's checks (`gh pr checks --json bucket`), its size, its result line, and the line each
  to-do gets in its own language; the already-fixed ones with their comment and `close`.
  `group_review_send {keep}` is one decision recorded as given on the sheet (D359's close sheet), each
  comment a `source_write` in 替你做过的; only the already-fixed close. A part's own write-back card
  (D341) is held while its group is under way (`propose` → `held`).
- **The conversation.** `todos do=find` posts the set card (Log kind `todo_set`, re-logged with its
  group once handed over); `todos do=hand set= note= shape= group=` hands it over (packages/partner).

**Still owed** (also in `todo.md`): humans on the words; recall of the find on hel's real 49; a plan
task's report without `plan_report` falls back to one after another of the whole set (said on the
card); moving a running part to another computer stays D376's.

## 10. Words first (D396)

The author on 0.0.90, with two shots of the Mac sheet: with hundreds open, the sheet opened on a list
to tick by hand, and its find field said only 找…. **Who:** the heavy developer thinks "those about
memory distill" and cannot hunt 500 by hand; the consumer says "搬家的事，下周六前搞定，预算 3000";
the fresh user meets one question.

- **The question first.** From the do row (and the subjects' "more"): **想交给{name}哪些？ / What
  should {name} take on?**, one field (**比如：关于 memory distill 的，先别动数据库 / e.g. memory
  distill, but leave the database alone**), focused on a wide screen. Before anything is said: **说一类
  就行：讲这件事的我都找出来，你再删减。 / Name a kind of thing: I'll find every one about it, and you
  trim.**, **可以这样说 / You could say** (the subjects handed over lately, then the pile's biggest;
  `SUGGEST_MAX` 5; a tap finds it), and **一件件挑 / Pick one by one** with **能直接交给{name}的 n 件**
  (the do group's list, the first few ticked, **用一句话说 / Say it in a sentence** back). A 讲的是 chip
  or a set card opens with its words in the field and its set already found.
- **A sentence finds a set.** `pile_find {words}` (debounced; Enter finds at once): a new sentence is a
  new set, its do ones ticked; the found line and the groups as before. Nothing found: **没找到讲「…」的
  / Nothing about "…"**, **换个说法，中文英文都行；或者一件件挑。**, the suggestions and one by one.
- **One sentence, two parts.** Code splits by clause (`splitWords`): a clause that says how (a limit,
  a place, a tool, an order, a deadline: "先别…", "验证都去 … 上跑", "don't…", "run … on …", "下周六前
  搞定") is the note, word for word, a joining word in front dropped ("but", "不过"); the first that
  isn't is the subject, its filler dropped ("那些关于…的都交给你", "the ones about…"). One clause
  holding both stays the subject. The cheapest model, in the find's one call, may read the split better;
  its note is kept only when it is the person's own words. `said {about, note, by}` is shown under the
  field as **找的是 / Looking for** and, when the note went to the note field, one quiet line **给{name}的话已写进
  右边 / Your note for {name} is on the right** (narrow: **给{name}的话下一步里能改**); the note is shown once, in its field. The note field takes it while the
  person hasn't written their own; theirs is never replaced.
- **The conversation agrees.** `todos do=find query=` runs the same split: the set's query is the
  subject and `TodoSet.note` keeps the how (shown on the set card as **给{name}的话**); `do=hand set=`
  uses it unless other words are said; the sheet opened from the card carries it.
- **The right column is never dead.** `pile_how` answers where and who with nothing ticked; the column
  is the note, **在哪儿做 / 谁来做**, then how once two or more are ticked. A computer's name wraps and
  its reason sits under it, whole; the row's highlight is clipped by the group's corners.
- **Mac sheets keep below the title bar.** Every sheet over the window centers in the room under the
  60pt bar that holds the traffic lights (`sheetBack`), whatever the window's height: the ⌘K palette and
  Past tasks' redo and where sheets too (D391).
- **Where follows the note.** The note heard in the words goes to `pile_how` with the set, so a computer
  it names wins Where over the one with the clone (D395's order: named computer, rule, clone).

Shots: `.shots/handover-words/` (`before-*`, `after-*`; web on `apps/web/demo-handover.ts`, now with
the pile across nowledge-co repos; Mac from `TestHandoverWordsShots`, the traffic lights painted in).
**Still owed:** the split read by real models on the author's own sentences, and humans on the words
(the question, the hint, **找的是**).

## 11. The author's own run, and subjects of the person's own (D415)

The author on 0.0.99, after his first real hand-over: *"我随便试了 github task-aware 的 flow 就走不下去呢，到底
是为啥？还有，你的那个分类只能是咱们自动分类？不能用户自己想发起的分类在整个 flow 里？"* hel's Log (read only,
2026-11-20) says what happened: he tapped the 通用设置 chip, both to-dos ticked, chose 合成一件做 and wrote
"确保这些任务都没开始，然后再 issue 里留言说一下 我的 ducter agent 要开始做了".

**Who.** The heavy developer, mid-flow, with 557 open: he named a kind of thing and expected it to go.
*Before:* a task titled 通用设置 bound to #10612 (Default-space aliases, which the sort had put under
通用设置 too), a start that failed on a git lock with a bare path, a task page whose 你交给它的事 opened
with Ducter's instructions to the agent, no comment on the issues as he asked, and no way to say "this
one isn't about settings". *After:* he sees why and what to tap, the comment he asked for goes first (or
is asked once), the task is called by its own to-do, and his own subjects stay his. The consumer and
the fresh user meet the same words: 分类, + 新的分类, 改名, 移出.

**What failed, and the fixes** (design/where.md §18 has the start's):
- *The title.* As one task took the subject as its name. A task is titled by its own to-do (several:
  **{first title} 等 {n} 件 / {first title} and {n} more**, the first cut to 48 characters); the group
  carries the subject.
- *The branch.* `ducter/通用设置` would be shared by every hand-over of that subject. Each task's branch
  names its issues (`ducter/10612-10559-…`), set by the hand-over on the place.
- *The lock.* The Mac's changes pane ran `git diff` in the new worktree while `git worktree add` was
  still filling it, and took the index lock: Ducter's reads take no optional lock now, the Mac waits
  for the place, and the add is tried again (where.md §18).
- *The bare card.* Every start failure has its why and its taps (where.md §18).
- *The other task.* 改进 Mem 常规设置页 had failed the day before on a guessed path; his reply to it tried
  to resume a session that never was. Words to a task that never started start it, its place asked
  again (where.md §18).
- *The brief shown.* 你交给它的事 shows the person's note as written, then each to-do by its reference
  and title (`protocol/src/brief-shown.ts`, the Mac's `briefshown.go`); the agent's plumbing (the note's
  fence, the to-do's outside text, what not to do, the Fixes line) stays in the agent's brief only.
- *The comment first.* A note that asks to tell the issues first ("在 issue 里留言说一下…", "comment on
  the issues that…") is honoured before anything starts (`commentFirst`): the words after 说一下 /
  saying are the comment (else **我的 Ducter agent 开始做这件了。 / My Ducter agent is starting on
  this.**). Inside a standing permission for issue comments (D413's second action, **在 GitHub issue 下
  留言不用先问**, said like "以后在 nowledge-co 的 issue 里留言不用问我") it goes at once through the one
  audited write; else one card asks, **先在这 {n} 件下留一句，再开始？** with **留言并开始** and **只开始，
  不留言**, and nothing starts until it is answered (no default runs: the order was the person's). Either
  way one line says what went, and each task's brief says the comment already went (so its agent
  doesn't comment again). A note that says not to comment never asks.

**Subjects of the person's own.** The sort names a subject per to-do (D385); the person can now say
theirs, and theirs wins:
- *Doors.* **+ 新的分类** on the pile's subject row (the sheet in its make mode: **叫什么**, then the
  words field or one by one, Go **放进「{name}」**); **归到分类…** on any sheet with ticks (a new name or
  one of theirs); a subject's own set has **改名** (into one that exists: **并到「X」**, a merge),
  **去掉这个分类**, and **移出** on each row; in words, "把这几件归到「通用设置」", "把 记忆提炼 改名叫
  Distill", "#366 移出去" (`todos do=subject name= refs|set op=put|take|rename|remove to=`).
- *Kept.* The pile keeps what was said (`pile.ts` `mine`): where each to-do was put (or taken out),
  the names given to the sort's subjects (a merge is a rename into one that exists), the ones removed,
  and the ones made (shown even before anything is in them). A sort never moves a to-do the person
  placed, never brings back a subject they removed; their names are listed first to the sort, so a
  new to-do about one of them lands in it by meaning.
- *Shown.* Their subjects come first on the row, drawn with an ink hairline, on any pile (the sort's
  still only past 20 open, of 3 or more). The row is called **分类 / Subjects** (was 讲的是: the
  author's word, and it reads with + 新的分类).
- *Found and handed over.* A subject's find is explicit membership plus the sort's (by `subject`), so
  the chip opens exactly what is in it; it is handed over as a set like any (plan first by default),
  and the group carries the person's name.

**Never.** A subject change starts nothing and writes nothing outside; removing a subject never
removes a to-do; the comment card never has a countdown.

Shots: `.shots/handover-fix/` (`before-*` from main on the same demo, `after-*`;
`apps/web/demo-handover-fix.ts`: the 557 plus hel's #10612 and #10559, a scratch nowledge-mem clone,
the real runner with a scripted agent, a git that meets hel's lock: `DEMO_LOCK=once|stale|hold`,
`DEMO_STAGE=hand|go|mine`; Mac shots from its view tests). **Still owed:** the words by humans
(分类, 移出, 只开始，不留言); a model reading the comment out of a note no rule catches; the live run on the
author's MacBook.
