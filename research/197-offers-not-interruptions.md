# 197 · Offers, not interruptions: the proactive mechanism re-derived, and what hel's two weeks say

For D453. The author, 2026-11-21: 「我觉得持续给出主动的不要怕我不回应、寂寞是自然的，毕竟你不能获得全部背景和
上下文，但是哪怕有 1/20 的消息我回复就是很 aha moment 了其实，这是我的观察，你要第一性原理思考我们整个 proactive
机制的设计和我们的动机做相应的设计和决策才行」. Read 2026-11-21: Ducter's code on `main` at e707d844
(`packages/core/src/proactive/`, `task-sources/pile.ts`, web `finds.tsx` and `store.ts`, Mac `finds.go`,
`onhand.go`, `store.go`), and the author's home `hel`, read-only (one python script per run, sqlite opened
`mode=ro`, two JSON state files opened for reading, the script removed after; counts and kinds only, no
subjects, senders or text left the machine). VERIFIED = read in code or counted on hel; INFERRED =
judgment or estimate.

## 1. What the design said before (VERIFIED, `design/connectors.md` Part A, `engine.ts`)

Ducter "may look often; it speaks rarely" (D165 §3). Every step leaned toward silence:

| Mechanism | Where | Effect |
|---|---|---|
| The bar's four tests, the second "missing it costs something, soon" | `judge.ts` `preBar`, the model's prompt "keep only when all four hold" | a find under its kind's bar (50) is never said |
| Learned bars | `engine.ts` `ignored()`: three Holds or untouched finds of a kind in 14 days → its bar +10, to 90 | a kind the person keeps clearing goes quiet for good |
| 每天最多 3 条 (the default since D250) | `DAILY_CAP` | 3 a day |
| Three unread mornings → pause and 早上那条还要吗？ | `checkUnread`, `keep_note` | the note stops; a "no" moves the home to 只说急的 |
| The to-do picks: two unanswered mornings → stop | `pile.ts` `picksIgnored` | the offer stops until a hand-over |
| Each find's step a decision with 先等等 / Hold | `makeFind`; clients' `openDecisions` | every find is needs-you: On hand, the face, the menu bar, the talk's cards, until held or its date passes |

## 2. hel, 2026-11-09 to 11-21 (VERIFIED; the home's conversation starts 11-09, so "two weeks" is twelve days)

| What | Count |
|---|---|
| Notes Ducter said by itself | 13: 6 "now", 6 morning (one quiet, one the D250 offer back and its answer), and the D359 to-do picks inside 3 of them |
| Finds in them | 17: 在等你回 11, 快到了 3, the to-do picks 3 |
| Notes with finds read (a read receipt past them) | 10 of 10; minutes to read: 0, 2, 2, 2, 13, 121, 109, 179, 145, 65 |
| A message from the person within 3 h of a note | 8 of 10 |
| Finds taken up (Go, a reply, 有用) | **2 of 17 (12 %, one in 8.5)**: one Go on the to-do picks, one reply to a 在等你回 |
| Finds held by hand (先等等) | **13 of 17**, five of them in one 7-second burst on 11-18 |
| Finds untouched until they passed | 2 (快到了) |
| 这类不用告诉我 rules | 0 |
| The learned bar for 在等你回 | **80** (from 50): the Holds taught Ducter that a person waiting must have waited six working days or asked again |
| The bar's verdicts kept (last 7 days) | 19: 14 kept, 5 dropped (3 "costs too little", 1 a survey, 1 a trip with no date); 2 security notices kept by the model and never said |
| Facts in the ledger | 165: replies 90, service 44 (resolved 20, failing 19, security 2, maintenance 2, outage 1), incoming asks 18, bookings 8, renewals 2, payments 2, a change 1 |
| Asks left out by D388 / D403's filters | 37 cold pitches, 8 relays, 5 with no ask |
| Notices left out unread today at stage 1 | 89 |

Reading: the author reads everything Ducter says, usually within two hours, and answers almost none.
The "response" the old design saw was Hold, and Hold was not "no": it was clearing a card that sat in
On hand and the needs-you face until cleared. The restraint then fed on itself: those Holds raised the
bar for 在等你回 to 80, so the next people waiting would not be said at all.

## 3. First principles

1. **Value of a line = P(it lands) × what landing is worth − what it costs the person.** P(lands) is
   low and will stay low: Ducter reads mail and calendars, not the person's head; the author's own
   estimate is one in twenty. What landing is worth is large (the domain renewal, the flight against
   the hotel, motivation.md). So the whole question is cost.
2. **Cost has two parts of very different size.** An *interruption* (a sound, a lock-screen line, a
   needs-you count, a card that waits to be cleared) costs a context switch and trust. A *quiet line*
   in a place the person already looks, needing nothing, costs a glance. The old design priced every
   find as an interruption, so it rationed them all.
3. **Ration interruptions; be generous with offers.** motivation.md's "needs your attention only when it
   truly matters … a handful a day at most … held overnight" is about interruptions and stays exactly
   so. An offer doesn't need attention; it is there for attention. The morning note already batches.
4. **Silence carries almost no signal.** The author reads and doesn't answer; that is the normal case,
   not a verdict. Learning must come from what was taken up, and silence may only nudge, never stop.
   This is an explore/exploit problem: keep some offers on kinds that went quiet, or a kind that missed
   once is never tried again.
5. **An offer must never become a chore.** No Hold to press, no card to clear, no count of what was left,
   no "you didn't reply", no pause that asks "still want this?". Unanswered offers fade by themselves.
6. **The aha is the answer, not the offer.** When one lands, the response must be instant and specific:
   its one Go starts the work at once; a reply about it is acted on at once.

## 4. The new design's numbers on hel (INFERRED: an approximation of the detectors in python over the facts ledger, 14 mornings, with D388 / D403's filters, one offer per thing, said once)

| | Before (said) | D453 (would offer) |
|---|---|---|
| From the accounts | 14 (11 在等你回, 3 快到了) | about 20: 在等你回 5, 快到了 5, production services 5, an outage 1, security notices 2, a maintenance window 1, money 1 |
| The to-do picks | 3 (and the rule would have stopped them after two unanswered mornings) | one each morning there is something to clear |
| The most on one morning | 5 | 4 (never at OFFERS_A_DAY) |
| Cards the person had to clear by hand | 13 | 0 (offers fade) |
| Needs-you entries from finds | 17 | 0 (offers); "now" stays an ask |
| Time-sensitive notifications | 6 (all 在等你回, before D403) | 0 for those kinds |

Offer → reply rate: before, 2 taken up of 17 offered (12 %). After, at the same two hits over about 26
offers, 8 % (one in 13), still above the author's one in twenty; the new kinds (security, an outage,
production jobs failing) were never offered before, so their hit rate is unknown, not zero. The low
rate is the point: what changes is that the 24 that don't land cost a glance, not a Hold.

What the ledger shows is that the funnel upstream is narrow (89 notices left unread a day, 37 pitches
filtered), so "generous" on hel means two offers a day, not twenty. Widening the funnel (reading more
notices closely, offers from the conversation and tasks) is the next lever, left to `todo.md`.

## 5. Implications for Ducter

- Two lanes: interruptions keep every guard (urgent, NOW_MAX, quiet hours, wake rules, D61); offers
  are generous: 有用就说 becomes the default, up to 6 in a note, 10 a day, the first 3 in full.
- An offer's decision is `offer`: no client counts it as needs-you; it has no Hold; it fades at the next
  morning, its words dimmed, nothing said about it.
- The bar keeps grounding and a step or join; its floor drops to 35 (the old floor 50 stays for a
  person who chose 每天最多 3 条). The model drops only what is plainly not for them.
- Learning ranks, never gates: Go, 有用 and a reply ×1.5, Hold ×0.85, fading ×0.95, within [0.5, 3]; one
  slot a morning for a kind not offered for three days; at most two of a kind in what is shown in full.
  The per-kind bars only move a kind from interrupting to offering.
- Retired: the three-unread pause and 早上那条还要吗？, the two-unanswered stop on the to-do picks.
- The partner never brings up an offer left alone.

**Summary.** On hel the author read every note and took up 2 of 17 finds (12 %); 13 of 17 were cleared
with Hold because each find was a card that needed clearing, and those Holds raised the bar until
people waiting would go unsaid. Interruptions cost attention; offers cost a glance. D453 keeps the
first rare and makes the second generous, quiet, self-fading and learned from what lands.
