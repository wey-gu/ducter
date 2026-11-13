# 81. Proactive help against dots: why Ducter said nothing, and the fix (D243)

2026-11-13. The author compared one day of dots (the proactive pet in OpenAI's Codex desktop
app) with Ducter: "不仅我主动问才说，根本没主动 ai，哪怕我主动问，效果也很差". This report traces
each thing dots said through Ducter's pipeline on hel, names where it was lost, and records the
redesign built as D243. Sources: hel's state files read with counts only (no subject, sender or
body printed, copied or summarized), the code at `fac3903f`, and a synthetic replay of the day.

## 1. What each side said (DOCUMENTED: the author's two screenshots, paraphrased)

dots, unprompted unless marked:

| # | When | What |
|---|---|---|
| d1 | Thu evening | A billing change: an AI Search instance starts charging around 11/15; whether it passes the free tier depends on the plan; link to the console |
| d2 | asked | Saturday's flight: time, terminal, airline, flight number, arrival; "be at the airport by 17:40 (2 h before)"; it checked the booking mail and found no later change |
| d3 | Fri 07:35 | A correction: Conductor reversed the shutdown it had mentioned before (new announcement and changelog) |
| d4 | Fri 10:29 | Two production Postgres maintenance windows Saturday 13:00 and 15:00 JST, restarts may drop connections, both before the 19:40 flight, no owner found: who watches recovery? |

Ducter: nothing all morning. Asked "你今天没查邮件给我值得说的么？", it said "有，刚补查了最近一天的邮件，有
三件值得说；我还没主动把这些告诉你。" and listed an early user stuck in onboarding, a production stats
job failing repeatedly, and an office carpet cleaning. No flight, no maintenance, no billing.

## 2. What hel showed (VERIFIED, read-only, counts only, 2026-11-13)

- Ducter 0.0.46; one OOMOL connection (Gmail ×2, Slack, Slack bot, Google Calendar ×1) and Tuwa.
- `settings.json`: `proactive: "urgent"` (只说急的), **no quiet hours**, no language.
- The server's zone is **UTC**; the person is in Tokyo (JST, from dots' own times).
- `proactive.json` today: read closely 15, noted 3, **skipped as notices 114**, promo 7; one
  judge run, 7 verdicts (all `waiting_on_you`), **6 dropped** ("未见付款期限或近期后果", "仅有邀请主题…",
  …), 1 kept and then held; `mornings` empty; `bars` empty.
- `findings.json`: 58 facts: reply 37, ask_in 11, booking 7 (calendar 4, mail 3), renewal 2,
  change 1. **No flight booking at all; no meeting fact from the calendar** (the calendar's
  events there are all-day stays). No fact type existed for maintenance, outages, failing jobs,
  billing changes or shutdowns.
- `watch.json`: Gmail 149 reads, Calendar 98, Slack 75 + 75 today; `missing`:
  `slack.list_mentions`, the three discord actions.

## 3. Where each was lost (VERIFIED in code; the hel step INFERRED from the counts above)

The pipeline: look (`watch.ts`) → stage-1 rules (`stage1.ts`) → triage (`triage.ts`) → ledger →
detectors (`detect.ts`) → bar (`judge.ts`) → rungs (`engine.ts` speak) → said.

| Item | Lost at | Why |
|---|---|---|
| d1 billing change | **stage 1** | a no-reply sender (or Gmail Updates) is `bulk`, and every bulk mail was left out as a notice, also in the 60-day look back (its subject filter ran only over what stage 1 passed). Had it passed, triage had no type for "starts charging" (only `renewal`: due / amount) |
| d2 flight | **stage 1** and **detectors** | the airline's confirmation is no-reply mail: dropped as above, so no flight fact (hel has none). A timed calendar event "Flight to …" became a *meeting*, never a booking. And no detector speaks of a trip that simply is coming up: `mismatch` only joins a flight with a hotel gap or a meeting during it |
| d3 correction | **stage 1**, **detectors**, **memory of what was said** | the product's announcement is list mail (dropped); no type for shutdown / reversal; nothing knew what Ducter had said before, so nothing could correct it |
| d4 maintenance + flight | **stage 1**, **detectors** | the provider's notice is no-reply mail (dropped); no type or detector for maintenance; nothing joins a window with the person's trip |
| quiet morning | **the mode**, **the zone** | `only urgent` has no morning note by design (so `mornings` is empty), and in it only `urgent` finds speak; none of the kinds above could be urgent. Even in 每天最多 3 件 the note would have gone at 08:00 UTC = 17:00 JST: with no quiet hours set, the zone fell back to the server's, so "today", the morning and every date were the server's |
| the judge's drops | **bar** | it saw only headers and a draft, and read test 2 ("missing it costs something soon") as "needs a deadline"; 6 of 7 people-waiting candidates went for "no deadline seen". The rubric had no word on what the cost is per kind |
| the asked-for answer | **partner** | no tool gave it what the pipeline knew, so it read mail itself with `connection_call`, newest first, and did not look at the calendar; the persona had no rule for "anything for me?" and none against narrating its own process, so it said "刚补查了…" and "我还没主动把这些告诉你" |

The restraint rule ("never show what it read; speak only when needed") was sound; the overshoot
was in mechanism, not in the rule: a filter that removed the very notices a good assistant reads,
no detector for the commonest useful kinds, a zone that wasn't the person's, and a judge rubric
that asked every kind for a deadline.

## 4. First principles: what a great partner notices, and when it speaks

*Who:* the heavy developer (production systems, travel, many tools' notices), the consumer user
(trips, bills, bookings), the fresh user (one Gmail). *Feels before:* "it reads my mail and tells
me nothing". *After:* 放心 (it watches the edges) and 惊喜 (it joined my flight and my database
maintenance). *First time:* nothing to set up; the same chips.

What deserves a word (each must still pass the four tests of D165):
1. **Time-bound plans**: a flight or train in the next day and a half (when, from where, when to
   leave); a booked thing today.
2. **Things that collide with the plans**: maintenance on their production during or before a
   trip; two meetings at once (D222); a confirmation on another day than the calendar (D226).
3. **Money changing**: a charge starting, a price rising, a payment that failed, usage over a
   free tier, a trial ending; renewals due (D165).
4. **Their systems**: production maintenance ahead, an outage now, a job that keeps failing (two
   or more in three days, one on production), a product they use shutting down. One CI failure on
   a branch is noise.
5. **Corrections**: a later notice that undoes or changes something already said is said at once,
   before they act on the old one.
6. **People waiting** (D165, D232) and **promises due**.

When: the morning note for what can wait to the morning; **now** for what costs something if it
waits a day (a trip within 30 h, production maintenance within 30 h, a correction, a failed
payment, money changing tomorrow), in its own room of three a day; never between 23:00 and 08:00
in the person's zone unless it is due within six hours, even with no quiet hours set; a
heads-up ripens with time, so the detectors run every half hour, not only when mail arrives.

How: one or two sentences, specific (dates, times, amounts, the joined fact), what to do when
there is something, How I know, at most one read-only next step. Never "I read N emails", never
about itself ("我还没主动告诉你"). Asked "anything for me?", the same detectors answer, most
pressing first, at most four.

Learning: unchanged (有用 / 这类不用告诉我 as a Rule, Go/Hold, three ignored raise a kind's bar);
the new kinds take part (`notice_rule` lists them).

Cost (INFERRED): hel skipped 114 notices today. Notice-worthy subjects are a fraction; at most 60
a day go to the cheap model (`NOTICE_DAY_MAX`), about 400 tokens each: ≤ 24K tokens a day, ≤ 0.75M
a month, inside the existing 2M per source per month (hel used 352K by the 13th). Receipts,
marketing and newsletters stay out by rule.

## 5. What was built (D243)

- **Stage 1** passes a bulk or no-reply mail to triage when its subject or sender says it may
  be a booking, a renewal or payment change, maintenance, an outage, a failing job, a security
  alert, a billing change, a shutdown, a delivery or boarding (`NOTICE_TERMS`), up to 60 a day;
  receipts' words alone never pass it, Promotions never.
- **Triage** has two new typed facts: `service` (maintenance, outage, incident, failing,
  security, shutdown, resolved; with a window, an effect, prod) and `billing` (starts charging,
  price up, payment failed, over limit, trial ends); a flight's terminal goes in `from`.
- **The ledger** keeps two flights or two windows from one mail (identity by name and start).
- **A flight or train in the calendar** is a booking, never a meeting.
- **Detectors**: `coming_up` (快到了), `service` (你用的服务: maintenance joined with the trip that
  day, outages, failing jobs, shutdowns, security alerts), `update` (之前说的有变, over the finds
  already said, which now keep their topic and facts), and money changing under `deadline`.
- **The bar**: the new kinds need no step (the heads-up is the help); the judge's prompt says what
  the cost is per kind, sees typed details (an effect, a count), and never writes about itself.
- **Speaking**: urgent finds have their own room (`NOW_MAX` 3) instead of the note's 3; the
  detectors run every half hour (`ripen`); with no quiet hours, a heads-up that can wait six hours
  waits for 08:00.
- **The zone**: the home keeps the zone the person's app last said (hello `tz`) and uses it for
  the note, "today" and the calendar when no quiet hours are set.
- **The partner**: a `noticed` tool (the same detectors, ranked, said or not, with How I know),
  and a persona rule for "anything for me?": `noticed` first, at most four, time-bound first,
  never what it read or hadn't told them.
- **Words**: zh and en for the three new kinds in core, the web client and the Mac app.

## 6. Proof (VERIFIED, synthetic, no real mail)

The day replayed through the whole engine (fake clock and accounts, recorded triage, code's
bar): `packages/core/test/fixtures/dots-day.ts`, `packages/core/test/proactive-dots.test.ts`,
printed by `bun packages/partner/eval/proactive/day.ts [three|urgent]`. The same fixture on the
code before D243 (`fac3903f`) and after:

| Mode | Before | After |
|---|---|---|
| 每天最多 3 件 | 1/7 in time (only the stuck user), 1 said | **7/7 in time, 0 false alarms**, 7 said, 5 notifications |
| 只说急的 (hel's) | 1/7, 1 said | 5/7 (the two Conductor items are correctly never said: the shutdown was called off before it became urgent), 0 false alarms |

After, 每天最多 3 件 (Asia/Shanghai): Wed 08:00 note: Conductor 说 12/1 停止服务 · Mia waiting.
Fri 08:00 now: nightly-stats 失败了 3 次 · 更正：之前说的「Conductor 说 12/1 停止服务」不算数了. Fri
08:00 note: 明天 19:40 NH 920 从 Shanghai Pudong T2 起飞，飞 Tokyo Haneda；17:40 前到机场 · Cloudflare
AI Search 11/15 起开始收费. Fri 10:30 now: 明天 13:00、15:00 PlanetScale 2 个生产实例要维护，都在你
19:40 的航班之前. Never: the carpet cleaning, the newsletter, marketing, a branch's CI failure, a
receipt, a usage digest.

Asked at Fri 11:00, `noticed` ranks the maintenance, the failing job, the stuck user, the flight
and the billing change first; the carpets last. The partner eval (haiku) has two new scenarios
(`noticed-anything-zh`, `-en`) over the same facts. Full run (haiku, `2026-11-13-haiku-d243.md`):
77/105 (the last committed run: 71/103). `noticed-anything-en` passes; `-zh` calls `noticed`,
never narrates, but the judge failed it for folding the flight into the maintenance line ("在你
19:40 的航班之前") instead of giving it its own line. Before D243 neither scenario could pass: there
was no `noticed`, and the probe of the old behaviour is the author's own screenshot.

## 7. Still owed (live, on hel, after release)

- Whether OOMOL's `fetch_emails` summary carries the labels and List-Unsubscribe that make a mail
  `bulk`, and how many of hel's ~114 daily notices pass `NOTICE_TERMS` (counts only in 今天看了什么).
- Triage on the real cheap model (Codex's) for `service` and `billing`: the recorded answers are
  what a good model should say, not a measurement.
- The judge on the partner's model with the new rubric: its keep rate on hel's people-waiting
  candidates.
- That the app's hello sets the zone on hel (one `proactive.json` key, `clientZone`).
- The real cost per day against `NOTICE_DAY_MAX`.

## Implications for Ducter

- Restraint is about what is *said*, never about what is *read*: a filter that keeps the model
  from reading service notices removes the ground truth of most useful heads-ups.
- A heads-up is a find of its own (a trip, a window, a correction); the old bar's "something to
  do" excluded it.
- Every home needs the person's zone, not the server's.
- The partner's on-demand answer and the proactive note must come from one source.
- Next (in `design/todo.md`): a labelled week from the author to score precision and recall per
  kind, and topics they follow (dots' "news on something you care about") through Mem.

**Summary.** dots' four items were lost at stage 1 (all service notices were left out unread),
at the detectors (no kind for a trip coming up, maintenance, money changing or a correction), at
the zone (UTC on hel) and the mode (只说急的 had nothing that could be urgent); the asked-for answer
had no access to what the pipeline knew. D243 reads notices, adds the kinds, ripens by time,
keeps the person's zone and answers "anything for me?" from the same detectors. On the replayed
day: 1/7 before, 7/7 after, no false alarms.
