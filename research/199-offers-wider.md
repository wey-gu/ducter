# 199. Offers from past the accounts: tasks, Mem, the conversation (D458)

Date: 2026-11-21. Follows research/197 (offers, not interruptions, D453). Question: D453 made offers
generous, but where do good offers come from besides mail, calendars, notifications and the to-do
pile? Which other places hold what a good partner would offer, how is each found cheaply and
grounded, and how often does the cheapest model pick the right ones?

## 1. Where offers came from before (VERIFIED, `packages/core/src/proactive/`, main 3a4b715d)

- Every candidate the morning note can offer comes from `detect.ts` over the facts ledger, which is
  filled only from the accounts (mail, calendar, GitHub and chat notifications) and the
  conversation's dated reminders (D281, `said.ts`), plus D359's to-do picks (`morningFinds`).
- research/197 §4 (INFERRED, a python replay of hel): about two offers a morning, 20 of 26 over two
  weeks from the accounts. A person who works mostly in Ducter's own tasks, and talks to other AI
  tools, has most of their loose threads where the funnel never looks.
- `said.ts` keeps a casual "回头看看" with no day deliberately (precision over recall, D281): it
  never becomes a reminder. Nothing else picked it up.
- Mem was read only for focus (D368, Working Memory ranks the note), never as a source of finds.

## 2. Three more places (first principles)

A good offer is (1) timely now, (2) has one concrete next step Ducter can take as a task, (3) is
plausibly off the person's mind (research/197 §3). Three places hold such moments with evidence
Ducter already has, and none needs a new permission:

| Place | Moment that makes it timely | Evidence (shown under 怎么知道的) |
|---|---|---|
| Finished tasks | a merge whose follow-up issue is still open; something a task noticed and left; a failure whose cause (an issue it named) closed after it; a routine whose last two runs differ | the task's report, the issue's state from the to-do sources |
| Nowledge Mem | a preference meeting an event in the next 4 days (a seat preference and a flight); a decision whose condition is met now (a done task or a closed issue about it, or its date passed); a conversation with another AI tool that stopped with something left | the memory or thread (title, date, tool), and the event, task or issue that makes it timely |
| The conversation | a thing the person said they'd get to with no day ("回头看看那个 PR"), a day or more later, nothing since showing it done | their line |

Each says where it came from in code's words, never the model's ("从你和 Codex 11 月 12 日的对话想到的").

## 3. Two stages, as the accounts have (design)

- **Leads, in code** (`wider.ts`): bounded windows (tasks 3 days, failures 14, the conversation 14
  days and at least 20 hours old, threads 2–21 days), at most 6 Mem reads a morning, and three
  filters that need no model: already taken up (a later non-routine task about the same thing, by
  shared terms or the same #number), done since (a later line of theirs saying so), and D281's own
  (anything with a day or an ask to be reminded stays a reminder).
- **The spotter, the cheapest model, once a morning** over at most 24 leads: offer or not, the line
  (two sentences, ≈50 zh characters), the Go (≤ 8 zh characters / 4 words) and one line of what the
  task would do (data for the task, never its instructions). Code checks: the lead exists, the
  words fit the phone budget, the Go is short (else a default per kind of lead). A "no" is
  remembered 14 days; a "yes" the note had no room for is asked again.
- **Then D453 as is:** offers only (never on 只说急的), never needs-you, fade at the next morning,
  ranked with the rest by cost × learned weight, one exploration slot; three new kinds so 这类不用告诉我
  and the weights work per place: 接着可以做的 / A next step, 记得的 / Remembered, 你提过的 / You mentioned.
- **No model:** only code's two joins (a follow-up still open, a cause closed now), in code's words.

## 4. The offers eval (VERIFIED, `packages/core/eval/offers/`, haiku via `claude -p`, no tools)

Two synthetic weeks shaped like the author's (HawDB and Ducter work, a review from Weizhen, a
Tokyo trip, conversations with Codex and Claude Code). The tuning week (`corpus.ts`): 13 planted
good offers (5 tasks, 4 Mem, 4 conversation) among 17 noise items; the held-out week
(`heldout.ts`, written after the prompt was tuned, never tuned on): 6 good among 9 noise.
Recall = good offered / planted; precision = good offered / offered (after code's checks).

| | code's leads | haiku zh | haiku en |
|---|---|---|---|
| tuning week, run a | 13/13 good, 9 noise passed | P 100% (12/12), R 92% (12/13) | P 100% (13/13), R 100% |
| tuning week, run b | 13/13, 9 | P 100% (13/13), R 100% | P 100% (13/13), R 100% |
| held-out, run a | 6/6, 5 | P 100% (6/6), R 100% | P 100% (6/6), R 100% |
| held-out, run b | 6/6, 5 | P 100% (6/6), R 100% | P 100% (6/6), R 100% |

Results: `results/2026-11-21-09-44-haiku.json`, `-09-45-haiku-heldout.json`, `-09-47-haiku.json`,
`-09-48-haiku-heldout.json`; about 25k tokens a call, two calls (zh, en) a run.

What it took (honest about tuning): the first haiku runs on the tuning week dropped every
conversation lead ("no timing trigger") and the merged follow-up ("deliberately deferred"), and
offered a hotel preference against a flight: recall 69–77%, precision 90–91%. Two prompt lines fixed
it: a loose end and a merged change's follow-up need no other trigger (the day passing is the
moment), and a preference must fit the very event it joins. The held-out week then found one gap in
code, not the model: "Once the Android app passes Play review, …" wasn't read as a condition (only
"once X is/lands/ships…" was); the pattern now takes "once X," too. The one miss in the four runs is
code's check, not the model's judgment: run a's zh line for the Codex thread was over the 72-character
budget and was dropped.

Code alone (no spotter) offers only the joins: 2 of 13 on the tuning week, precision 100%.

Limits: synthetic weeks, small (19 planted goods in all), the gold written by the author of the
design; noise the model must drop is the obvious kind (small talk, a wish with no step, a routine
moving by 2%, a vendored warning). Real weeks will hold subtler noise. The fake Mem returns what a
semantic search plausibly would; the real Mem's ranking is not measured here.

## 5. Implications for Ducter

1. Widen the funnel with the three places, two stages each: code leads (bounded, grounded,
   deterministic filters), one cheap model call a morning to pick and word them.
2. Each offer says where it came from under its words, in code's words; 怎么知道的 names 任务 / 记忆 /
   你说的.
3. Mem is read through the partner's own memory_search path (its switch and identity), read-only,
   at most 6 reads a morning; nothing is written.
4. A dated thing the person said stays D281's reminder; only an undated one becomes an offer.
5. Live checks owed: a week on hel (how many leads a morning, what is taken up), the real Mem's
   search for preferences and decisions, and a real-week eval set from the author's own history.

**Summary:** past the accounts, three places hold timely offers: finished tasks, Nowledge Mem and
the conversation. Code finds leads in each (13/13 and 6/6 planted on two synthetic weeks), the
cheapest model picks among them (haiku: precision 100% in all four runs, recall 92–100%, after two
prompt lines from the tuning week; the held-out week 100%/100% twice), and D453's offer rules hold
unchanged.
