# 153: Handing over several to-dos: the workflows, and one path that grows into them (D384, proposed)

The author, looking at D359's hand-over sheet (**可以交给 Ducter 做的 200**, six small ones ticked,
**交给 Ducter 这 6 件**), asked two things (2026-11-19, paraphrased): (1) let Ducter or a worker pick
out several to-dos on one subject to solve together, for example everything about "memory distill",
issues and optimizations alike, and then let him explain properly how; (2) after handing over, there
should still be a place to say more, rather than the set fanning out at once into parallel tasks. And:
study every way people hand work over, so each feels natural.

This report collects the evidence, lists the workflows, scores the words with naive raters, and ends
with a recommendation. The design is `design/handover.md`; the decision is D384 (proposed, for the
author). Nothing here is built; the screens are a prototype drawn into the real web app on a demo
core (§6).

## 1. What happened the one time the author handed over (hel, read-only, 2026-11-19)

Read from hel's own pile file and Log without writing anything. Issue titles stay in the private
notes (the repositories are closed source); only counts and shapes are given here.

| Fact | Value | Tag |
|---|---|---|
| Open to-dos on the pile | 535, across 8 repositories (430 in one) | VERIFIED |
| The sort's groups | do 245 · decide 101 · later 188 · close 1 | VERIFIED |
| Handed over | **2** (not the sheet's 6), at 00:16, both from the do group | VERIFIED |
| Where they ran | `place: none` on the home itself: no repository folder, no worker | VERIFIED |
| What came back within 4 minutes | one: "already fixed on main in a merged PR"; the other: half merged earlier, the rest unverified because the home has no Rust linker | VERIFIED |
| What the author said after | 8 min later: "构建验证目前推荐去 Mac 或者 haswell" (build checks: the Mac or haswell); 11 min later: "那个 draft 的 pr 你安排验证了么？" (did you arrange the check of that draft PR?); the partner then continued the task on haswell | VERIFIED |
| Then | "你亲自在做？没有安排 agent 单独做？" (are you doing it yourself?): the person could not see who did what | VERIFIED |

What it says:

1. **The person knew how before handing over and had nowhere to say it.** Where to build and how to
   check were known at 00:16 and said at 00:24 and 00:27, after the work had already gone wrong.
2. **Two of two handed-over issues overlapped with work already done.** A task that reads the set and
   the code first would have found both in a minute, before spending a task each.
3. **"Small ones first, six ticked" out of 245 is arbitrary.** He took two; nothing on the sheet
   grouped them by what they are about.

## 2. How a subject cuts across the pile (the "memory distill" case, read-only)

On the same pile:

| Way to find "memory distillation" | Found | Tag |
|---|---|---|
| A word in the title (`distill`, `蒸馏`, `提炼`) | 38 | VERIFIED |
| The repository's own `component/distillation` label | 41 | VERIFIED |
| Either | **49** (the label adds 11 the title misses) | VERIFIED |
| Written in Chinese | 13 of the 49 (an English query alone misses most of these) | VERIFIED |
| Their sort groups | do 23 · decide 10 · later 16 | VERIFIED |
| Repositories | 4 (the main one, its feedback tracker, the community tracker, the website) | VERIFIED |
| An umbrella issue collecting distillation failures | 1 | VERIFIED |

What it says:

1. **A subject is not a sort group.** Half the subject is not in "do": a decide one is usually the
   question the do ones hinge on, and a "later" one is often the big version of a small one.
   Handing over a subject means seeing all three groups together.
2. **Neither words nor labels alone find it.** Title words miss the labelled ones and the other
   language; labels are the person's own and many repositories have none. Finding by subject needs
   meaning, cross-language: the cheapest model reading titles and labels against the person's words
   (535 titles with labels are about 20k tokens: one call, cents) after code's own word and label
   match (instant, free).
3. **One subject spans repositories.** "As one task" is only possible inside one repository; the
   plan has to say which parts go where.

## 3. What exists (VERIFIED in code, `main` at ef5c2ca6)

| Piece | What it does | What it lacks for this |
|---|---|---|
| The pile's sort (D359, `packages/core/src/task-sources/pile.ts`) | One verdict per to-do (group, why, size, ask) by the cheapest model, cached by `updatedAt` | No subject per to-do; nothing groups by meaning |
| The hand sheet (`apps/web/src/pile.tsx` `DoSheet`) | The do group only, small first, six ticked; `pile_hand {refs}` | No find, no other groups, no note, no where/who, no shape |
| `pile.hand` / `startNext` | A queue, `PILE_CAP` 3 at a time, each `openTask(item, "Fixes …")` | Brief is only the issue; place is whatever `openTask` picks (on hel: none); every to-do its own task |
| Groups (D360, `packages/protocol/src/task-groups.ts`) | One card for several tasks; held parts; `one_by_one` / `side_by_side`; `add`; a stopped line | Never made by a hand-over; no "plan first" part |
| The partner's `todos` tool | `list query` (the sources' own search), `take`, `hand refs`, `sort`, `write` | No find by meaning; `hand` carries no note, shape or place |
| Continuity (D373), where (D157), rules by kind (D372, D379) | Follow-ups stay in their task; a place and agent per task; standing rules | Not consulted at hand-over |
| Write-back (D341) | One Go card per bound task's comment | Five tasks in a set mean five cards |
| Pins (D381) | A checklist message kept at the top | Partner-written checklists, not a set of to-dos bound to the pile |

## 4. The workflows (who, the moment, before → after, what's missing)

Three people: **H** the heavy developer (535 open, the author); **C** the consumer with an Obsidian
list ("搬家", "报税", "日本行"); **F** the fresh user with three to-dos and no idea what a task is.

| # | Workflow | Who | Before (feel) | After (feel) | Missing today | Smallest addition |
|---|---|---|---|---|---|---|
| W1 | **Pick by subject** on the pile | H, C | 245 rows sorted by size; the subject is in his head (乱) | the pile shows what it is about; one tap gives the nine (好用) | a subject per to-do; a find by meaning | the sort writes a short subject per to-do; **讲的是 / Subjects** chips on the pile; a find field on the sheet |
| W2 | **Ask in the conversation** ("把 memory distill 相关的拉出来我们看看") | H, C, F | has to open On hand and hunt (麻烦) | the set comes back in the conversation, ticked, one tap to the sheet (顺滑) | a find by meaning; a set the conversation can show | `todos do=find`; a **set card** in the conversation that opens the same sheet |
| W3 | **Say how before it starts** (one note for all, a note per item) | H, C | knows where and how; nowhere to say it (憋) | it is said once, carried into every task (放心) | the note | **给{name}的话 / A note for {name}** on the sheet; **给这件的话… / A note for this one…** per item |
| W4 | **Choose the shape**: one task / in order / side by side / plan first | H | every to-do its own task, 3 at once (失控) | one sensible default with one line of why; four plain choices (放心) | as one task; plan first; groups from a hand-over | a hand-over of 2+ makes a **group** (D360); shapes **先出个方案 · 合成一件做 · 一件做完接下一件 · 同时做** |
| W5 | **Plan first, then say more** | H | dispatched before thinking (hel: 2/2 overlapped done work) | reads a plan, adds a word on a part, says go (惊喜: "2 are already fixed") | a lead part that proposes and holds the rest | the group's first part is a plan; its report is a card **照这个做 / Go with this · 先等等 · 回复…**; the parts it proposes are held members |
| W6 | **Where and who** for the set | H | ran on the home with no repo and no linker | the set runs on the computer the note or a rule names (放心) | place at hand-over | **在哪儿做 / Where** and **谁来做 / Who does it** rows on the sheet (New task's words), filled from the note, rules and where the repository is |
| W7 | **A worker takes a subject** | H | one computer does everything | "让 haswell 做记忆提炼这一摊" puts the whole group there | the same as W6 at group level | the group's Where; a later part may name another computer (D360 already says it on the row) |
| W8 | **Add to a running set** ("这个也加进去") | H, C | a new to-do on the same subject starts alone | it joins the line (or the plan, if still planning) | hand-over into an existing group | the sheet's shape list offers **加进「{group}」/ Add to "{group}"** first when a live group shares the subject; `todos do=hand group=` |
| W9 | **Review as a set** | H | five Go cards, one per comment, in five places | one sheet: every PR, its checks, its line; one Go (好用) | a batch of write-backs | **一起过目 / Review together** on a group whose parts are all done; one decision covering every comment (D359's close sheet's pattern) |
| W10 | **A single to-do** (today's 接 #12) | all | works | unchanged: one task, no sheet steps | none | none: a set of one skips the shape (it is one task) |
| W11 | **The consumer's errand set** ("搬家的都交给你") | C | five errands as five tasks with five browsers | one errand task carrying them in order, the same signed-in browser (D373) | errands as one task | shape default by kind: errands **合成一件做** |
| W12 | **The fresh user** | F | three to-dos; never sees a subject or a shape | "这几件你帮我弄一下" just works | none | subjects show only past 20 open and 3 in a subject; the shape is decided and said in one line; the sheet looks like today's |

How they connect (the one primary path, §7): every door (a subject chip, the find field, the
conversation, New task's pick, the pile's do row, the morning picks) leads to **one sheet** with
three parts in one place: **what** (the ticked set), **给{name}的话** (the note), and **how**
(shape, where, who), each pre-filled with a default. Go makes a **group** (when two or more). The
group is what grows: plan first is its first part, adding is its `add`, a worker is its Where,
review is its last step. Seven modes would be seven things to learn; this is one sheet and one
card.

## 5. The words (naive LLM-proxy raters; proxies, not people)

Two panels of five simulated naive raters on haiku (a shop owner who has never heard of AI agents, a
student, a nurse with a long to-do list in a notes app, a software engineer, a retired teacher), zh
and en, one prompt describing the sheet; scores 1–5 (understood at a glance and what a tap does),
averaged, with each rater's misreading. Run in a scratch folder; 20 calls; its Claude Code project
folders removed after.

**Round 1**

| Group | Candidate (zh / en) | zh | en | Most common false belief |
|---|---|---|---|---|
| The note | 交代几句 / A few words first | 3.8 | 2.4 | en: a greeting or preamble Ducter ignores |
| | 说说怎么做 / Say how | 3.0 | 2.4 | step-by-step method; spoken |
| | 要求 / Requirements | 3.8 | 3.0 | must be filled in; hard rules that are checked |
| | 备注 / Notes | 4.0 | 3.8 | my notes, maybe not read |
| | **给 Ducter 的话 / A note for Ducter** | **4.2** | **5.0** | zh: "what format?" (fav 3/5 zh, 5/5 en) |
| Plan first | 先出个方案 / Plan first | 3.6 | 3.8 | it plans, then starts without waiting |
| | 先看一遍再分 / Read them first | 2.0 | 2.2 | splits them among people; reads then runs |
| | 先想好再动手 / Think it through first | 3.6 | 2.8 | silent thinking, then runs |
| | 先给我过目 / Show me first | 4.6 | 3.8 | en: a preview of the result |
| | **先出个方案，你点头再做 / Plan first, start when you say so** | **5.0** | **5.0** | none (fav 5/5 both) |
| As one | **合成一件做 / As one task** | **4.0** | 3.6 | the originals are deleted or lose their own ticks |
| | 一起做 / Together | 2.8 | 2.0 | **side by side** (the worst: the opposite shape) |
| | 并成一件 / Combine them | 3.8 | **4.0** | the list is rewritten |
| | 一次做完 / All in one go | 3.4 | 3.8 | quickly; in parallel |
| The chips' label | 话题 / Topics | 3.0 | 2.8 | a chat topic; school subjects |
| | 主题 / Themes | 3.2 | 2.2 | a colour theme |
| | 按类 / By kind | 3.6 | **4.8** | zh: reads as a verb; en: issue type (bug, feature) |
| | (no label) | 3.2 | 3.0 | what are these buttons? |
| | 相关的 / Related | 2.0 | 1.6 | suggestions |
| Review | **一起过目 / Review together** | **4.8** | **4.0** | en: a review shared with someone else |
| | 一起看结果 / See the results | 3.8 | 2.4 | look only, no approval |
| | 全部检查 / Check them all | 2.8 | 3.2 | Ducter checks them itself |
| | 一起验收 / Look them over | 3.8 | 2.6 | formal; look only |

"By kind" collides with D372's **kind of work** (写代码 / 跑腿) and two en raters read it as issue
type, so the label went to a second round.

**Round 2: the chips' label** (the row of "记忆提炼 23 · 登录 9 …")

| Candidate (zh) | zh | Candidate (en) | en |
|---|---|---|---|
| 分类 | 3.6 | By kind | 2.0 (issue type: bug, feature) |
| 按类 | 2.2 | By subject | 3.4 (re-sorts the whole list) |
| 关于 | 1.2 (an About page) | About | 1.4 (an About page) |
| 挑出一堆 | 3.0 | Pick out | 2.4 |
| **讲的是** | **4.2** (fav 5/5) | **Subjects** | **3.8** (fav 4/5) |

So: **讲的是 / Subjects**. The two read the same (what these to-dos are about) though they are not word
for word; each is the clearest in its own language, and "讲的是：记忆提炼 23" reads as a sentence.

**Taken:** **给{name}的话 / A note for {name}** (and per item **给这件的话… / A note for this one…**);
**先出个方案 / Plan first** with its second line always shown, **你点头再做 / Starts when you say so**
(the line is what the raters needed); **合成一件做 / As one task** with its line **一个任务，一个 PR
修好这几件 / One task, one PR fixes them all** (answers "the originals are deleted": the issues stay,
each gets its line); **讲的是 / Subjects**; **一起过目 / Review together**. Existing words reused
unchanged: 一件做完接下一件 / One after another and 同时做 / Side by side (D360), 在哪儿做 / Where and
谁来做 / Who does it (D128), 建议 / Suggested (D359), 先等等 / Hold. **Never "一起做 / Together"** for a
shape: it reads as side by side.

## 6. Prior art (brief)

- **Conductor** (the tool the author used daily; private notes `research/private/61-workspace-overviews.md`,
  DOCUMENTED): a workspace from an issue, one issue one workspace one branch; parallel workspaces
  are the person's own fan-out; no grouping by subject, no plan across issues.
- **Plan modes** in the agents themselves (Claude Code's plan mode, Codex's): a plan per session
  before edits (DOCUMENTED in their docs, as known before this report). Ducter's plan first is the
  same idea one level up: a plan across several to-dos, whose approval opens the tasks.
- **Issue trackers' bulk actions** (select many, assign, label): bulk without understanding; the
  person does the grouping (INFERRED from common use).

None reads a set and says "two of these are already fixed" before spending work: the hel case.

## 7. Recommendation

**One hand-over sheet with three parts on one screen (what, the note, how), reached from every door,
whose Go makes a D360 group; a set found by subject defaults to plan first.**

- The sheet: a find field (words and meaning, every sort group), **讲的是** chips, the ticked set
  shown by sort group (a decide one shows its question; ticking it carries the suggested answer, its
  per-item note can change it), **给{name}的话**, per-item **给这件的话…**, the shape with one
  **建议** and its line of why, **在哪儿做** and **谁来做** pre-filled (the note's own words first:
  "haswell" in the note fills Where; then rules; then the computer that has the repository).
- Defaults (code's rule, never a model's): one to-do → one task (no shape row); a set found by
  subject, or of 4+ in one repository → **先出个方案**; 2–3 in one repository → **一件做完接下一件**;
  small ones across repositories (the pile's do row, the morning picks) → **同时做** (today's queue
  of 3); errands and life to-dos → **合成一件做** (D373: one errand keeps its browser). A live group
  that shares the subject → **加进「{group}」** first.
- Plan first: the group's first part reads every to-do, the repository and the note, and reports a
  **plan card**: what's already fixed, what goes as one task, what goes in order, where it is checked;
  each part with **给这件的话…**; **照这个做 / 先等等 / 回复…**. A reply changes the plan in the same
  task (D373). Go turns the plan into held parts of the same group.
- Review together: when every part is done, the group card offers **一起过目**: every PR, its checks,
  its result line and the comment it would leave; one Go posts them all (a fixed one also closes).

**Main tradeoff:** plan first spends one extra task (minutes and tokens) before any change and asks
the person once more. For a set of small unrelated fixes that is waste, so it is the default only for
a set found by subject or 4+ in one repository; the pile's small ones keep today's side-by-side
default.

**Alternative not taken:** a wizard (pick → note → shape → go as separate steps). Clearer on a phone,
but every hand-over pays three screens, and the author asked for less ceremony, not more. On the
phone the sheet is two screens (what; then the note and how), on wide one.

## 8. Build plan (slices, each shippable alone)

1. **The note and where at hand-over** (smallest, fixes the hel case): `pile_hand` takes `note`,
   per-item notes, `place`, `harness`; the sheet shows **给{name}的话** and the two rows; the note
   is quoted in every task's brief. Partner: `todos do=hand note=`. Eval scenario: "按这个思路做" after a
   set is offered.
2. **Find by subject**: `todos do=find` (code's word and label match, then the cheapest model over
   titles and labels, cross-language, at most one call per query, cached); the sheet's find field and
   every sort group on it.
3. **Subjects on the pile**: the sort gives each to-do a short subject (the person's language,
   reusing the subjects it already gave), merged once per sort; **讲的是** chips (shown past 20 open,
   a subject of 3+).
4. **The set card in the conversation**: a message bound to a find, tickable, opening the sheet;
   words after it ("就这几个，按这个思路做") are its note.
5. **Shapes and the group**: a hand-over of 2+ makes a D360 group; **合成一件做** (one task, "Fixes"
   every issue), in order, side by side; **加进「{group}」**.
6. **Plan first**: the plan part, the plan card, held parts on Go, per-part notes.
7. **Review together**: one sheet and one decision for a done group's write-backs.

## Implications for Ducter

- The hand-over's missing piece is not more parallelism; it is a place to say how, and a first look
  across the set. The hel log shows both, the first time the author used it.
- A subject is a lens across the sort's groups and repositories, found by meaning in two languages;
  it cannot be a fifth sort group.
- Everything the workflows need already has a home: groups (D360) are the set, continuity (D373)
  carries replies to the plan, where (D157) and rules (D372, D379) fill Where and Who. New: a note,
  a subject, a find, two shapes (as one task, plan first) and one batch review.
- Five new user words, each through two rater panels; "一起做 / Together" must never name a shape.

## Summary

On hel the author's first hand-over took 2 of 245 small ones, ran them on the home with no folder,
found one already fixed and the other half merged, and he said where to build only after. "Memory
distillation" on his pile is 49 to-dos across 4 repositories and three sort groups, 13 in Chinese,
found fully only by words plus labels plus meaning. Recommendation: one sheet with what, a note and
how; a group on Go; plan first by default for a subject set; review together at the end. Words by
two haiku panels: 给{name}的话 / A note for {name}; 先出个方案 · 你点头再做 / Plan first · Starts when
you say so; 合成一件做 / As one task; 讲的是 / Subjects; 一起过目 / Review together.
