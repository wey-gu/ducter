# 154. The aha moments: what another app said on 2026-11-19, what Ducter said, and the raise (D388)

> 2026-11-19 · for D388 · Labels: **VERIFIED** read in code or in the home's Log this session ·
> **DOCUMENTED** the author's screenshot as relayed, or his Mem · **INFERRED** judgment.
> The reference app is not named here (research/150's rule); notes that name it are in
> `research/private/154-proactive-aha-refs.md`, outside git.

The author, with a screenshot of another personal AI's proactive messages: "看……的主动 ai 做的很好哈，
我们要好好审视我们的设计，是否能做的这么好，能给我这些 aha-moments 么". This note takes the moments
apart, reads what Ducter really did on his home over the same days, audits the design against each
moment, and records what D388 built and how it was measured.

## 1. The exemplar, moment by moment (DOCUMENTED)

The author's real week, 2026-11-19 (Beijing time):

| # | When | What it said | What makes it land |
|---|---|---|---|
| A | 08:19 | A weekly-report mail writes the AGI Bar Beijing talk as Friday, but it had just checked the calendar: the hold is Saturday 11-21, time to be decided. Confirm with the organiser before booking trains. | Two of his own sources disagree; it names which says what; it names what it doesn't know (the time); it says it before the decision the mistake would cost (booking travel). |
| B | 08:19, same message | Separately: a provider's mail says a plan has used ≥ 95% of its traffic. The mail gives no remaining amount and no reset day. | An unrelated thing bundled into the same calm message, with the unknowns said plainly instead of guessed. |
| C | 10:30, unprompted | "补上刚才缺的时间": the event's site lists Saturday 11-21 19:00 and the address, and 19:00 is the doors, not his slot (the public agenda lists no speaker time). | It kept the gap it named, closed it later from a public source, and said once what the source does and does not settle. |
| D | asked | "How did you know I'm going?": its sources in order (the calendar's all-day hold → the weekly report saying Friday → his own public post about attending → the official site), what it does not know, and what it did not change (it didn't touch the calendar). Every claim links its source. | Provenance as an answer composed from what it holds, not a story. |

Earlier aha moments with the same app (his Mem, 2026-11-09, DOCUMENTED): a domain renewal he had
forgotten to pay, and a flight that didn't match the hotel dates.

## 2. What Ducter did on the author's home, 11-12 to 11-19 (VERIFIED, read-only)

Read with `python3` over `file:/root/.ducter/ducter.db?mode=ro` on hel; counts, kinds and the
partner's own words only; no mail body, address or secret was printed.

- **Watching works.** 6,198 reads by Ducter's own watchers since 11-15 (calendar `list_events`
  2,185, Gmail `fetch_emails` 1,074, Slack 1,074, Discord 1,113). The reads' summaries are counts
  only, so which mail reached triage can't be seen from the Log (the facts file was not read: only
  the database was in scope).
- **What it said by itself.** 8 notes with 13 finds: 11 **在等你回 / Waiting on you**, 1 **快到了 /
  Coming up** (a meeting that morning) and 1 to-dos offer. Not one 两件事对不上, deadline, money,
  plan-changed or update find in eight days. All 11 waiting finds were put on **先放着 / Hold**
  (11 `find_state held`, no Go, no Useful); several were from senders pitching something (an event
  company's invitation, a staffing agency's proposal, a "send a booking link" sales thread).
- **Three "now" notes in the same second** (11-13 22:04:21.177/.178/.179), three notifications:
  the opposite of moment B's one calm message.
- **The AGI Bar trip.** On 11-16 and 11-17 the partner, answering in the conversation from the
  calendar, said the Beijing talk was Friday 11-20, time not set. On 11-18 the author said Saturday
  and asked for a hotel; the partner's answer ended with "旧日历记的是周五 20 日，订房前记得再对一下活动通知"
  (the old calendar says Friday the 20th; check the event notice before booking). That is moment A's
  instinct, but only inside a reply: never followed up, the public page never checked, and the
  engine itself said nothing about the trip on any morning. The 11-19 morning note held the day's
  09:00 meeting and the to-dos offer.
- **No quota or renewal find.** Nothing about a traffic allowance or a renewal in any note.
- **The 11-19 morning note came at 05:15 local**, the same second the home restarted into 0.0.85.
  Quiet hours end at 07:00 there; a client's hello within two hours of the end assembles the note at
  once (`engine.ts` `hello`), and an app reconnecting after an update says hello. INFERRED: the
  reconnect, not the person, opened the morning (todo).

Why the engine missed A–D (VERIFIED in code at `5b6e6c8a`):

1. An all-day calendar event **without a place** became no fact at all (`triage.ts` `eventFact`
   returned nothing), so "AGI Bar 北京分享, all day, Saturday" never reached the ledger.
2. The only "calendar vs mail" join was a timed meeting against a **confirmation** (D226), matched by
   a shared word of four letters or more: a weekly report is not a confirmation, and "AGI", "Bar"
   are three letters each.
3. The person's **own words** ("我周六要去 agibar 北京…") were a source only for reminders (D281), not
   for the plan's day.
4. Nothing kept a question **open** after saying it, so nothing could come back to fill it; a web
   look (D380) ran only when the person asked.
5. 怎么知道的 lines held a header and a date only: no source kind, no "what it says", no link, no
   "what I don't know / didn't change"; the `noticed` tool gave the partner the same.
6. Stage 1 let a no-reply notice reach triage only by its subject's words; a quota mail worded
   "流量包使用已达 95%" carried none of them ("用量", "额度" were there; "流量" was not), and money
   changing had no "nearly used up" kind. INFERRED for the author's actual mail (its subject isn't
   in the Log).
7. "Now" finds of one look were each their own message and notification (`sayNow`).

## 3. The audit (design and code vs the moments)

| Moment | Before D388 | Where | After D388 |
|---|---|---|---|
| Contradiction across sources (mail vs calendar vs the person) | **partly**: calendar meeting vs a confirmation mail (D226), flight vs hotel, meeting during a flight, two meetings at once | `detect.ts` `mismatches` | **exists**: one sheet per coming plan from the calendar's hold or event, a confirmation, a mail that mentions it, the person's own words and a public page (`plans.ts`); a day disagreement is a find unless only their own words disagree with their own calendar |
| Cost-of-miss and timing ("before you book trains") | **partly**: cost by kind and days left; nothing about the decision it precedes | `detect.ts` costs; `engine.ts` rungs | **exists**: cost by how soon the first disputed day is and whether travel is booked near it; urgent within three days (said "now", never at night); the find names the next step (`订票前先跟主办方确认`) or the booked flight's day |
| Naming what it doesn't know | **missing** | — | **exists**: `unknown` on a find (`几点开始`, `你几点上场`, `还剩多少、哪天重置`), shown under 怎么知道的 |
| An open question closed later, said once | **missing** (D243 updates only correct a find after a later notice) | `detect.ts` `updates` | **exists**: `OpenRec` per said contradiction; closed by a later mail, the calendar, or a quick web look (no sooner than 30 min, ≤ 2 per question, ≤ 3 a day, ≤ 10 days ahead; only the plan's name, place and the two days leave Ducter); said once as **补上刚才缺的时间：… / Filling in the time: …** or **…对上了 / … is settled**; let go silently when its day passes |
| The quota mail with unknowns | **missing** (no near-limit kind; stage 1 words) | `stage1.ts`, `triage.ts`, `detect.ts` `billing` | **exists**: `near_limit` (used, what's left, reset day only if the mail says), words that say what the mail doesn't; allowance words reach triage |
| One calm message for things found together | **partly**: the morning note bundles; "now" did not | `engine.ts` `sayNow` | **exists**: one "now" message and one notification for one look's urgent finds |
| "How did you know?" | **partly**: 怎么知道的 listed headers and dates; the partner had the same and wrote its own story | `finds.tsx`, `finds.go`, `tools.ts` `noticed` | **exists**: each line has its source kind, what that source says and its link; `noticed` gives `why`, composed by code from those lines in order with what it doesn't know and didn't change; the persona answers from it and adds nothing |
| "I didn't touch the calendar" | implicit (nothing proactive writes, D165 (7)) | `connections.ts` | said: **日历我没改。/ I didn't change your calendar.** on a find that rests on the calendar |
| The person's public post as a source | **missing** | — | still missing (todo): Ducter doesn't read the person's public posts; their words in Ducter's conversation are the source instead |
| Domain renewal; flight vs hotel dates | **exists** (D165) | `detect.ts` `deadlines`, `mismatches` | unchanged; the flight line now fits one phone line (it was 80 characters with long names) |

## 4. Measured on the aha days (fakes; VERIFIED)

`packages/core/test/fixtures/aha-days.ts` rebuilds the week with synthetic mail, calendar and the
person's words (every company, person, domain and page made up): the AGI Bar hold vs a colleague's
weekly report, the event page a fake web look finds, a 95 % quota mail with no amounts, a renewal
with the card expired, a flight landing the night before the hotel, and three negatives (a meetup
whose event and confirmation agree, the person's own words against their own calendar only, the
usual noise). `bun packages/partner/eval/proactive/aha.ts` runs it through the whole engine (fake
clock, fake accounts, recorded triage, code's bar).

| | main `5b6e6c8a` | D388 |
|---|---|---|
| In time | **2/5** (renewal, flight-hotel) | **5/5** |
| AGI Bar contradiction | missed | Wed 18:10, ten minutes after the weekly report, before night: "日历上「AGI Bar 北京分享」是 11/21（周六），Lina 的周报写的是 11/20（周五）。时间也没定，订票前先跟主办方确认。" |
| The time filled | missed | Wed 18:40, once, linked: "补上刚才缺的时间：「AGI Bar 北京分享」11/21（周六）19:00 开门（agibar.example.com）。你几点上场页面上没写。" |
| Quota | missed (left out at stage 1) | Thu 08:00 in the morning note: "Lumen Cloud CDN 流量包的额度已经用了 95%。信里没写还剩多少、哪天重置。" |
| False alarms | 0 | 0 (no find on the agreeing meetup or on their own words; one web look, for the one open question) |
| Over one phone line | 1 (the flight line, 80 characters) | 0 |

"你怎么知道我要去的？" composed by code: "1. 日历「AGI Bar 北京分享」：11/21（周六），全天，没写时间；2. Lina Zhou
的邮件「本周周报 W47」：11/20（周五）。还不知道：几点开始。日历我没改。"

## Implications for Ducter

- The aha class is **joins over the person's own sources**, and the sources were there; what was
  missing was a place where one plan's words sit side by side. A plan sheet per coming thing is that
  place, built by code from typed facts, with no new model call.
- **Restraint holds**: a gap alone is never said; it rides a contradiction that is worth saying, and
  is kept only once named. Their own words against their own calendar are theirs to know.
- **Coming back** is the moment that reads as care. It needs a kept question and one cheap way to
  close it (a later mail, the calendar, a quick web look on public facts) and the discipline to say
  it once and let go.
- **Provenance is data**, not prose: each line says which source and what it says, and the answer
  to "how did you know?" is composed from those lines. The partner never adds a source.
- The precision problem on hel is the waiting kind: eleven held of eleven, several cold pitches. The
  next raise is a cold-sender test for 在等你回 (todo), measured against the same rig.
- What can't be shown with fakes: how the cheapest model types a weekly report's mention as a `plan`
  fact. `ducter proactive replay` (D388) lets the author run his real last days through the engine,
  dry, and compare.

## Summary

The other app's four moments (a contradiction said before travel, a quota with its unknowns in
the same message, an unprompted follow-up that filled the named gap, an honest "how did you know")
were all within reach of Ducter's design and none happened on the author's home: an all-day hold
without a place never became a fact, the join knew only confirmations, nothing kept a question
open, and 怎么知道的 had no sources' words or links. D388 adds the plan sheet, cost-of-miss timing,
open questions closed once by a later source or a quick web look, near-limit quotas, one message per
look, and provenance composed by code. On the rebuilt week: 2/5 → 5/5 in time, no false alarms.
