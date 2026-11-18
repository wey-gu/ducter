# 131 · Groups of tasks: one piece of work in several tasks, one card, one after another

> 2026-11-18. Public. Evidence for D360 (the number this branch records; it may be renumbered at
> merge). The author: 「我们如果有很多任务，我们有 section 的概念么？… 一般在不同 task 里做同一个 section
> 的会比较合理，而不是全都并行铺开。你综合考量一下」. A coding-agent workspace app shipped user-made
> sidebar sections in 2026-09; notes on it are kept private (`research/private/131-sections.md`).
>
> Tags: **VERIFIED** run or read by me this session · **DOCUMENTED** from the product's own notes ·
> **INFERRED** my reading. Raters are LLM proxies (claude haiku), no humans.

## 1. What the reference product does, and why (DOCUMENTED, INFERRED)

Its sidebar lists workspaces (one agent session in one checkout each). Sections are folders the
person makes in that sidebar: create, rename and delete from a header's context menu, a symbol per
section, collapse, and agents may move a workspace between sections. INFERRED why: a heavy user
with 20+ parallel workspaces in one repository loses track of which belong to which effort; the
flat list sorted by recency has no other grouping. Sections are filing: they change nothing about
how the work runs.

## 2. What Ducter already has (VERIFIED in code)

- **Project lens** (D261): automatic, from a task's folder; a column on wide screens, tabs when
  narrow. It answers "which part of my life or work", not "which piece of work".
- **State sections** (D287, D315): 等你 / 在做 / 在等 / 今天做完, the strip of counts over them.
- **The pile's queue** (D359): handed-over to-dos open three at a time, the next when one ends:
  the only place where Ducter already paces work instead of fanning it out.
- Nothing ties two tasks together, and nothing holds a task back: every `task_open` started at
  once (`packages/partner/src/partner.ts`, `runner.openTask`).

## 3. Who is in this moment (INFERRED)

| | Before | Needs |
|---|---|---|
| Heavy multi-agent developer | Splits "redo the sign-in page" into three tasks by hand; all three start at once in one repo and conflict, or he waits and opens each when the last is done | the parts to run in order without babysitting; to see the three as one effort; to change the order or stop the rest |
| Consumer | Asked for "plan the Kyoto trip" and sees five unrelated-looking cards | to see one trip, how far along it is |
| Fresh user | Has never heard of a subtask | nothing to set up or learn: the cards just arrive grouped and say what runs next |

Filing by hand serves only the first, and only after he does the chore. The partner already knows
which tasks are one piece of work at the moment it opens them; the person should not have to say it
again. That is the first-principles difference from the reference product.

## 4. The two readings of the ask (INFERRED)

「在不同 task 里做同一个 section」 reads two ways, and both hold: (a) tasks that belong together stand
together, not spread flat across the board; (b) a piece of work split into parts should not have
every part running at once. D360 answers both: one card per group, and parts in one folder run one
after another.

## 5. The naming study (VERIFIED)

Candidates (the card's heading, the menus to make and take apart, the row's way out):

| | zh / en | False implications (INFERRED before raters) |
|---|---|---|
| A | 分组 / Group | a folder you file into; "取消分组" might delete what is in it |
| B | 一组 / A set | a fixed bundle that runs as one; stiff in en |
| C | 同一件事 / One piece of work | long in menus; implies they can't be separated |
| D | 一摊 / A bundle | colloquial zh, a mess; en loses the tone |
| E | 分 3 件做 / In 3 tasks (literal) | ties the name to a count that changes |
| F | 分区 / Section (the reference's word) | a disk partition in zh; "删除分区" deletes |
| G | 接力 / Relay | a race; implies hand-offs between agents, a winner |
| H | no category word, the name alone | nothing to say in a menu ("放在一起…") |

Method: `claude -p --model haiku --no-session-persistence --tools ""` from a scratch folder, 8 at a
time (no `~/.claude/projects` folder was left: the list was the same before and after). Each
rater was one of the three users in zh or en, shown On hand's card in words (the heading, "3 件里做
完 1 件", three rows: done, working, **排着 / In line**, the caption **一件做完接下一件 / One after
another**, the card's and a row's right-click menus), and answered one JSON line: what it is, same
time or in turn, what happens when part 2 is done, word clarity, jargon, feel, one wrong belief,
would you use it by hand.

Round 1 (8 candidates × 3 users × 2 languages × 2 = 96 runs):

| | Clear zh / en | Jargon (5 = a concept to learn) | Feel | Would use | "Ungroup deletes the tasks" | Read it as in turn |
|---|---|---|---|---|---|---|
| **A 分组 / Group** | **3.83 / 3.83** | **2.17** | 4.00 | **3.58** | 3 / 12 | 12 / 12 |
| B 一组 / A set | 3.83 / 3.17 | 2.92 | 4.00 | 3.50 | 0 / 12 | 12 / 12 |
| C 同一件事 | 3.50 / 3.17 | 2.58 | 3.92 | 3.42 | 1 / 12 | 12 / 12 |
| D 一摊 | 2.67 / 3.50 | 3.25 | 4.00 | 3.33 | 2 / 12 | 12 / 12 |
| E literal count | 3.33 / 3.33 | 2.58 | 4.08 | 3.17 | 2 / 12 | 12 / 12 |
| F 分区 / Section | 3.33 / 3.67 | 2.83 | 4.00 | 3.58 | **7 / 12** | 12 / 12 |
| G 接力 / Relay | 3.33 / 3.00 | 3.25 | 4.00 | 3.42 | 3 / 12 | 12 / 12 |
| H no word | 3.17 / 3.17 | 2.67 | 4.00 | 3.33 | 1 / 12 | 12 / 12 |

Every rater read the order right from the caption and **排着**; the "wrong belief" most named (by
others, as a risk) was "all three run at once" (9–11 of 12 everywhere but F): the caption carries
the order, not the name. The reference's word read worst on the one thing that matters: "删除分区"
was read as deleting the tasks by 7 of 12.

Round 2 (36 runs): the take-apart words and the stopped line. With **（任务都留着） / (the tasks
stay)** said, "ungroup deletes" fell to 1 / 12 for 分组 and 0 for the others. For a part that failed,
naming the parts by number (**第 2 件没做成，第 3 件在等你决定。** with **不管它，做第 3 件 / Skip it, do
part 3** and **第 3 件也不做了 / Don't do part 3**) read clearer and calmer (clear 3.89, feel 3.72)
than naming the task (3.39 / 3.17). The one wrong belief left in both: that "skip it" retries the
failed part (about half the raters named it as a risk), so the card also offers **再试第 2 件 / Try
part 2 again** as its own button.

Decided: **分组 / Group**, taken apart as **取消分组（任务都留着） / Ungroup (the tasks stay)**, the card
headed by the group's own name only (labels literal), the order said by **一件做完接下一件 / One after
another** and **排着 / In line** (D359's word for the queue).

## 6. The line: how parts run (INFERRED, then VERIFIED in tests)

- **Which parts wait.** Parts in the same folder on the same computer run one after another (they
  would edit the same files); parts elsewhere, or with no folder (a booking, a search), run side by
  side. The person can switch a group to **同时做 / Side by side**.
- **Held, not started.** A later part is held by the home: its whole `task_open` input is kept, no
  task and no agent session exist yet, so nothing is spent and nothing can race. It opens when the
  part before it in its folder is done, from that part's unmerged branch (`place.baseBranch`), with
  a line in its brief: which part it is and what the one before reported. A part merged by then
  hands on no branch: it starts from the repository's base.
- **Done** means the result came back: `done_claimed` counts (a task stays `done_claimed` until
  merged, D216; waiting for `done` would stall every line until a merge).
- **A part that needs the person** has not ended: the line waits with it, and its question shows
  inside the group's card (what needs you never folds).
- **A part that fails or is put down** stops its line: what is held after it waits for the person:
  **再试第 n 件 / Try part n again** (continues that task; when it is done the line moves by itself),
  **不管它，做第 n 件 / Skip it, do part n**, or **第 n 件也不做了 / 后面的不做了 / Drop the rest**. A
  stopped line counts as one thing that needs the person (the head line and the strip say so).
- **Reordering.** Only what hasn't started moves (**提前 / Move up**); taking a held part out of the
  group, or taking the group apart, opens it at once on its own: work given is never lost.
- **Across computers.** The line key is the folder *and* the computer: two parts in "the same repo"
  on two computers are separate checkouts and run side by side; a held part that will open on
  another computer than the one before says so (**排着，在 {computer} 上做 / In line, on {computer}**).
- **Restarts.** Groups and held parts live in `<dataDir>/task-groups.json`; on start the home opens
  whatever came due while it was down.

## 7. Implications for Ducter

1. Groups are made by the partner, not filed by the person: `task_open`'s `group` when it splits a
   request; `task_group` when the person says "put these together"; by hand from the selection bar
   on the web (**放进一个分组 / Put in a group**). Never a sidebar of folders to curate.
2. One card in the state section of its most urgent part; the strip and section counts stay per task.
3. Sequencing on by default for parts in one folder; side by side for the rest and on request.
4. The project lens is unchanged; a group shows under each project lens its parts are in.
5. Owed: humans on the words (LLM raters only); D359's handed-over to-dos grouping by milestone; a
   by-hand "new group" on the Mac (the web has the selection bar; the Mac has none yet).

**Summary.** The reference product's sections are filing the person does. Ducter's partner already
knows which tasks are one piece of work when it splits them, so it groups them itself and, more
usefully, runs the parts that share a folder one after another from each other's branch, held
without spending an agent until their turn. 132 haiku runs chose **分组 / Group** (clearest,
least jargon) once taking it apart says the tasks stay; "section/分区" was read as deleting tasks by
7 of 12. LLM raters only.
