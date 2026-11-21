# 198: The opened task and ⌘K at volume, walked (D456)

The author, 2026-11-21: 「我们除了 personal agent 的模式，应该能够允许像〔一个 workspace 工具〕这类工具一样有的掌控感和打磨
程度，有特别优雅的 task view；以前的任务 Session 查找，特别特别好用有情绪价值……现在感觉还是没有那种让我很顺滑，
欢呼雀跃的牛逼的同时特别可靠自成一体一致的设计感」. This report walks the opened task and 找什么都行 / Find anything
(⌘K) on the web (1400 and 390) and the Mac against a demo core holding a heavy month, lists every friction found,
compares with what the workspace-per-branch desktop tools the author migrates from do well (described generically;
names, versions and pages are in `research/private/198-taskview-refs.md`, gitignored, and research/59 and 61's
private notes), and ends with what Ducter takes. The design is D456 in `design/decisions.md`, propagated to
`design/sessions.md` and `design/workbench.md`.

Tags: VERIFIED (walked or read in code), DOCUMENTED (a product's own docs), INFERRED.

## 1. How it was walked

- **The corpus.** `apps/web/demo-sessions.ts` with `DEMO_MORE=1` (added for this walk): 119 tasks over six weeks,
  four repos (hawdb, nowledge-mem, ducter, test-infra) plus errands, three computers (the home, haswell, hel), three
  agents and six models; 13 on hand (3 need the person, 8 at work, 2 waiting), long transcripts on a dozen (60–220
  reads, searches and commands with output), steps with commits, merged and draft PRs, failures, cancellations, two
  redone from a step. Every value is pretend. VERIFIED.
- **The web**: Chrome through Playwright at 1400 × 900 and 390 × 844, zh and en, light and dark; the Mac: the views'
  offscreen tester at 1400 × 900 (`apps/desktop/internal/views/taskview_test.go`) against the D391 fixture.
  Before shots `.shots/taskview-456/before/`, after `.shots/taskview-456/after/`. VERIFIED.
- Timing: ⌘K then "bloom" typed at once to the first earlier row on screen: 17–30 ms on this Mac (the home on the
  same machine, the field's 120 ms rest not counted). VERIFIED. Instant is not the problem.

## 2. Frictions found

Ranked by how much each costs the heavy developer's trust or flow. F = fixed by D456, L = left (with where it goes).

| # | Friction | Where | Evidence | |
|---|---|---|---|---|
| F1 | **An old task opened from ⌘K said 在做 with a 144-hour clock and a Stop button.** Its newest window said done; the page of older events D320 then fetched carried its first `working` state, and the client took whichever state arrived last, not the newest. Same in the Mac's store. | `apps/web/src/store.ts` `applyTask`, `apps/desktop/internal/store/store.go` | VERIFIED, before shot `web-1400-zh-light-task.png` (an earlier walk); reproduced only with long transcripts, which is why the 45-task demo never showed it | F |
| F2 | **One slipped letter finds nothing.** "compactoin" returned only Tell and New; the five tasks about compaction vanished. | `core/src/past.ts` `termIn`, `web onhand.tsx matches`, Mac `findMatches` | VERIFIED, `k-typo` before | F |
| F3 | **The initials find nothing.** "wgc" for "WAL 的 group commit", "lruk" for "LRU-K": the habit every palette trains. | same | VERIFIED, `k-abbr` before | F |
| F4 | **To see where a task stopped you leave the field.** The row has one line; the result, the last words, the ask, the diff and the steps are one Enter, one look and one Esc away, per candidate. Past tasks has the preview beside its list; ⌘K, where people look most, did not. | `palette.tsx`, Mac `palette.go` | VERIFIED | F |
| F5 | **The field jumps.** The card is as tall as its rows, so it grows and shrinks with each answer while typing. | `.palette .k-list` | VERIFIED (before shots differ in height for each word) | F |
| F6 | **A task still on hand found by a file or a branch sat under 做过的 / Earlier, marked 还在手头.** One task, two places; and the group name contradicts the row. | `paletteGroups` | VERIFIED, `k-compaction` before | F |
| F7 | **Rows are tall.** Three lines each (title, outcome, facts) at 1400 shows six tasks; the outcome repeats what the peek now says. | `RowView` | VERIFIED | F (wide: the outcome moves to the peek) |
| F8 | **Where the open task sits among what is on hand is unsaid**, and ⌘⇧[ ⌘⇧] (which walk them) are found only by those who already know. No way to jump to the third task by number. | task header (web `Top`, Mac `taskHeader`) | VERIFIED | F |
| F9 | **No one place says the keys.** ⌘K, ⌘Y, ⌥⌘B, ⌘⇧[ and the palette's ⌘↵ / ⌥↵ / ⇧⌘↵ live in tooltips and design notes. | — | VERIFIED | F |
| F10 | A typo's "why it matched" line pointed at the task's first file, not the one near the word. | `past.ts` snippet | VERIFIED during the build | F |
| L1 | The opened task's head spends ~170 px on the partner's 96 px face and a meta line before the first word of the work; a compact density is wanted for the developer, but the face is the clay identity and the decision is the author's. | `task-head` | VERIFIED | L: proposal below, not built |
| L2 | No terminal of the task's own, and no comments on diff lines carried to the agent. | workbench | VERIFIED; research/59 | L: todo (D214's) |
| L3 | No side-by-side diff of two tasks' branches (a redo against its original). | — | VERIFIED | L: todo (D391's) |
| L4 | ⌘K's peek on a phone: none (the sheet is the whole screen; a tap opens). Long-press for the peek is a later idea. | 390 | VERIFIED | L |
| L5 | The palette's key hints say ⌘ on Windows and Linux browsers too (the keys themselves are Ctrl there). | palette, keymap | VERIFIED | L: todo |
| L6 | The web's On hand Find and ⌘K mark the words typed, not the word a slip found. | `Marked` | VERIFIED | L (small) |

## 3. What the workspace-per-branch tools do well (generically)

From their public docs and changelogs (sources in `research/private/198-taskview-refs.md`; research/59 and 61 read
the same products for D214 and D216). DOCUMENTED unless marked.

- **The list of every session is always beside the work**, one row per session, its status and PR state on the row;
  ⌘1–⌘9 jump to the nth; a key opens a palette over everything. Ducter has the rail beside an opened task (D244) and
  ⌘K; it had no jump by number and no word of where the open one sits. → F8 (⌃1–⌃9, ‹ 3 / 9 ›).
- **A palette that forgives**: fuzzy subsequence matching on names and branches is the norm in editors and these
  tools; nobody expects to type a word exactly. Ducter's index is words-exact by design (deterministic, the same on
  every device). → F2, F3: forgive one slip and the initials, still deterministic, still weaker than the word.
- **Preview before you commit to a switch**: the hover card on a session row (status, PR, CI), and the editors'
  quick-open preview. → F4: Ducter's peek says more (the result, the last words, the ask, the steps with commits).
- **A shortcuts sheet behind one key** (⌘/). → F9.
- **The diff, files, a terminal and a browser per session in one right panel**: Ducter's workbench (D214) has all but
  the terminal (L2).
- What they do not do (research/61): say on the row what the agent is doing now, carry a task across agents from a
  step, find by what anyone said or what it reported, run errands. Ducter's find is already a superset there; this
  pass was about feel, not reach.

## 4. The design in brief (D456)

One system, four parts, all in Pebble's tokens; no new place, no new object:

1. **Find forgives** (`packages/protocol/src/fuzzy.ts`, mirrored in `views/loosefind.go`): a Latin word of five
   letters or more one slip off (changed, missing, extra, two swapped) matches a word in a name, title, tag, branch or
   file at 0.55 of the word; three to six letters that are a run of a title's initials match the title at 0.8. Only
   when the word itself is nowhere. The same in the home's index (task_find too), the web's own match and the Mac's.
2. **⌘K's peek** (wide, ≥ 1000 px web / 1100 pt Mac): 停在哪儿 / Where it stopped beside the list: the state, what it
   asks, how it ended (or its newest words while it works), +a −d and the PR, the last steps with their commits.
   No buttons in it: the foot keeps the ways on, each with its key. Its steps are asked once a row rests 140 ms. The
   body has one height while typing. On a wide screen a row drops its outcome line (the peek says it), so ten rows
   show instead of six.
3. **One task, one place in ⌘K**: a task still on hand that the index finds by a file, a branch or its words stands
   under 手头的 with where it matched.
4. **Where am I, and the keys**: ‹ 3 / 9 › in the opened task's bar (the same order ⌘⇧[ ⌘⇧] walk: On hand's list as
   shown, else needs you, working, waiting, done today); ⌃1–⌃9 open the first to ninth; **键盘 / Keyboard** (⌘/,
   and a row in ⌘K's Go to) lists every key by where it works, and says that a slip and the initials find too.
5. **The state never goes back in time**: a task's state is the newest by seq (a card counts as the newest at its
   cursor).

**Proposed, not built (the author's call, L1):** a compact density for the opened task, the face at 40 beside the
title on one line with the meta, the same tokens, chosen in Settings › Appearance or by ⌘⇧D; default unchanged.

## Implications for Ducter

- Speed was already there (17–30 ms); what read as "not smooth" was trust (F1), forgiveness (F2, F3), the extra
  trip to see where a task stopped (F4), and a card that moved under the hand (F5). Those are fixed on both clients.
- Keep the index deterministic: the forgiving rules are two, small, and the same on every surface, so a result on
  the phone is the result on the Mac.
- The next increments, in order: the compact density (L1) if the author wants it; Ctrl in the key hints off a Mac
  (L5); the terminal of the task's own (L2) as its own phase.

**Summary.** Walked at 119 tasks: ⌘K was instant but unforgiving and blind (a slip or initials found nothing; seeing
where a task stopped meant leaving the field), the card jumped, a still-working task sat under Earlier, and an old
task could open as working with a 144-hour clock because an older page overwrote its newer state. D456 fixes all of
these on the web and the Mac, adds where the open task sits (‹ 3 / 9 ›, ⌃1–⌃9) and one list of every key (⌘/),
and leaves a compact density for the author to choose.
