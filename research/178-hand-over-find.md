# 178: Which ones the person meant: the hand-over's finder, before and after (D428)

**Question.** The author typed two sentences into the hand-over sheet on 0.1.1 and called the result
"根本就不准…根本用不起来的". Why did it pick what it picked, what did he mean, and does a finder that reads
the sentence's facts first do better, by how much, with and without the cheapest model?

## 1. What happened (hel and GitHub, read only, 2026-11-20)

- **The pile** (hel `~/.ducter/task-sources-pile.json`, read with a script copied to /tmp and removed):
  539 open items in the last sort (GitHub's search says 555 open assigned to wey-gu). Per item the pile
  kept `author`, labels, repo, `updatedAt`, comment count; **no assignees, no `created_at`, no body**
  (stripped). VERIFIED.
- **Shape.** Repositories: nowledge-co/mem 432, mem-feedback 40, community 29, nowledge-labs-website 13,
  wey-gu/mem-releases 5, 13 more with 1 to 3. Authors: wey-gu 391, QingZ11 48, neonwatty-bugdrop[bot] 26,
  hawkingrei 14, nowledge-ci[bot] 12, ThaddeusJiang 8, negret1986 7, **100gle 5**, and a long tail of
  one-offs. 97 labels: type/bug 253, component/cloud 148, type/enhancement 133, … **UI/UX design 70**.
  Sort groups: do 240, later 197, decide 101, close 1; 490 with no subject. VERIFIED.
- **Who assigned what** (`gh api graphql`, search `assignee:wey-gu is:open`, the last `AssignedEvent`
  per item, read only, 555 items): 379 of wey-gu's own he assigned himself, QingZ11 assigned 24 of his
  and most of hers, the bugdrop bot's 26 were assigned by wey-gu (17) and QingZ11 (9); **100gle opened
  exactly 5 and assigned exactly those 5**; 52 items have two assignees, 2 have three; no milestones.
  VERIFIED.
- **The five** (all `UI/UX design` + `component/ui`): #10694 Remove unnecessary words for user in
  advanced search (do), #10691 … memory page (decide), #10688 Improve about setting page (later),
  #10559 Improve general setting page (later), #10482 Improve memory space setting page (later).
- **The finds** (hel `task-sources-handover.json` meaning keys): the field searched on every keystroke
  prefix ("100gle 分配给我", "100gle 分配给我的 ui/", …), each a model call. VERIFIED.

## 2. Why 0.1.1 picked 71 (the code, confirmed)

1. `codeMatch` returned **label** when *any* query word was a *substring* of *any* label: "ui" is inside
   "UI/UX design", "component/ui", "build", "guide"… 69 of 71 came this way. VERIFIED (code, and the
   before run in §4 reproduces 70 of 70 UI/UX design ones plus noise).
2. `queryWords` dropped "100" from "100gle" (its word pattern starts at a letter), leaving "gle"; the CJK
   run "分配给我的" became a search word. VERIFIED (`queryWords("100gle 分配给我的…")` → `gle`, `ui`, `ux`,
   `task`, `分配给我的`, `的问题走查的修改`).
3. The intent was structured: a person (100gle, a login in the pile), a role (assigned by him; "他…发现的"
   = he opened them), and what they are about (UI review). The finder saw neither: the model call got id,
   title, ≤ 4 labels, subject and repo, never author, assignees or body. VERIFIED.
4. The summary's subject was the model's own name for the set ("Windows 新界面"), not his words. VERIFIED.
5. Every found item in the do group was ticked (30 of 71), so a wrong set became a wrong action. VERIFIED.

## 3. The eval

- **Pile** (`packages/core/eval/find/pile.ts`): 557 items in the real shape: the real repository,
  author and assigner counts, 70 `UI/UX design` (100gle's five with their real titles and labels, 65 by
  others), 52 with two assignees, the sort's groups scaled, created and updated times spread as the
  real ones are. The other titles are written for the eval, each with a hidden topic (the gold), in the
  mix of English and Chinese the pile has. INFERRED as representative (the counts are VERIFIED; the
  titles are not the real ones).
- **Sentences** (`sentences.ts`): 28 = the author's two word for word, plus 26 in zh and en: a person
  opened / assigned / either, two people, the person themself, a repository by name and by a word
  ("网站仓库"), issue numbers, times (最近一周, 上个月以来, in the last week, 最近一个月), PRs, a label said,
  a bot by part of its login, a typo of a login, and four with a how-note.
- **Scored** (`run.ts`): the ticked set (what Go would hand over) and the shown set against the gold,
  micro-averaged. The after side ticks at most 10 a sentence by design, so its raw ticked recall has a
  ceiling; "capped recall" counts at most 10 per sentence. Before = the 0.1.1 code and prompt, kept in
  `before.ts`. Model: haiku through `claude -p --model haiku`, no tools, no MCP, no session.

## 4. Results

Two runs on the final code (2026-11-20 11:55 and 11:58, haiku, 48 model calls each, ≈1.7 M tokens
each, mostly the cached system prompt of `claude -p`):

| run | ticked precision | ticked recall (capped at 10) | shown precision | shown recall | exactly right |
|---|---|---|---|---|---|
| before, code only | 11.8% (95/804) | 27.7% | 11.3% | 44.1% | 2/28 |
| after, code only | **98.9%** (89/90) | 46.6% | 96.4% | 62.6% | 12/28 |
| before, haiku (run 1 / run 2) | 18.3% / 18.1% | 53.9% / 53.9% | 19.7% / 19.5% | 88.2% / 88.0% | 2/28 |
| after, haiku (run 1 / run 2) | **97.8% / 97.2%** | **93.7% / 90.1%** | 96.0% / 95.7% | 94.0% / 86.9% | 23/28, 22/28 |

Results: `packages/core/eval/find/results/2026-11-20-11-55-haiku.json` and `…-11-58-haiku.json`.
(Earlier runs during the work, before the last ticking change, were in the same range: 97.3% and 98.9%.)
Ticking: a set named by facts ticks every sure one but close; a kind of thing alone ticks the sure do
ones (D385's default), which is why some "about" sentences tick fewer than 10 by design.

The author's sentences (after, haiku): both find exactly 100gle's five (5 shown, nothing else), read as **100gle 分给你的** ·
**关于 UI/UX 问题走查** and **100gle 分给你的** · **100gle 提的** · **关于 UI 走查** (each its own chip);
before, 37 ticked with 1 right (70 shown). The first ticks 5 of 5 in both runs; the second 3 and 4 of
5: haiku marked one or two of the five (#10691, #10688) as maybe, shown with **不太确定** and left for
him to tick. Never a wrong one ticked. The typo ("100gel 提的") finds
nothing, says **这些待办里没有叫 100gel 的人**, offers 100gle and ticks nothing.

Where after still misses (haiku): "bugdrop reports about the desktop app" ticks 10 with 5 right (the
eval's topics split "desktop" and "Windows" more finely than a reader would); "QingZ11 分给我的 bug"
shows 107 for 52 gold (bug vs enhancement labels are random in the eval pile; the model reads "bug" by
the title). Without a model, recall stays low for anything said by meaning (code only matches titles
literally), as designed: facts alone still work.

Cost: the meaning call now reads only the set the facts left (5 rows for the author's sentences, not
555); a sentence of facts alone makes no call.

## Implications for Ducter

- Read a sentence's facts against what the pile holds before any meaning, and never let a word match
  inside a label (D428).
- Keep per item who opened it, who it is assigned to and when it was opened; ask GitHub's timeline once
  per sort who assigned each.
- Show the reading as chips the person can drop; the subject in their words; tick only the sure ones,
  at most 10; a name the pile doesn't have stops the ticks.
- Owed: the live check on the author's pile (the timeline pass on 555 items), and humans on the chip
  words.

## Summary

0.1.1's finder was keyword soup: "100gle" became "gle", "ui" matched inside labels, people were
invisible, and every do one was ticked. The author meant five issues by one person. Reading the
facts first (people and their roles, the person, repositories, numbers, times, PRs) and sending only
the rest to meaning over the filtered set raises ticked precision from 18% to 97–98% with haiku (12% to
99% with code alone), and the author's two sentences tick only the five (all five, or three or four with the rest shown as unsure).
