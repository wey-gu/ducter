# 91. The proactive bar: what the best companions do, where Ducter falls short

*2026-11-16. Asked by the author: "我希望你能好好打磨我们的 proactive ai，让它真的能像 grok bot /
muse 那么好用、可靠、可信赖". Builds on `research/35` (dots, Muse and the Grok bot), `research/46`
(nudges, briefings, interruption levels) and `research/81` (the day dots spoke four times). Feeds
D281. Web facts were read 2026-11-16 through search results and secondary press; no primary page was
read in full this pass (help.openai.com refused the automated read), so evidence is thin where marked.
The Ducter facts come from reading the code on this branch and running it on fakes; nothing was read
from hel or from any real account.*

## 0. The question

What does "proactive like Grok's bot or Muse" mean in behaviour, not tone, and which of those
behaviours does Ducter's engine (D165 → D243 → D250 → D258 → D274) lack? The author has said more
than once that the proactive side "still sends me nothing" (主动 ai 还是没有新的消息给我; D258 found
one cause on hel: a pre-D250 只说急的 with 0 mornings).

## 1. The bar, from the products (new since research/35)

- **ChatGPT Pulse was retired.** OpenAI announced on 2026-06-17 that Pulse (the model-chosen morning
  cards over chats, memory and connected Gmail/Calendar) would close within 14 days. It told users to
  make a scheduled task for "a daily briefing based on your interests, past chats, and connected
  apps", which it called "faster, more reliable, and easier to manage". Scheduled tasks got their own
  sidebar page; Free users get up to 3 active. DOCUMENTED (secondary):
  https://www.digit.in/news/general/openai-is-retiring-chatgpt-pulse-and-replacing-it-with-scheduled-tasks-here-is-why.html,
  https://alternativeto.net/news/2026/6/chatgpt-launches-new-scheduled-tasks-and-prepares-to-sunset-pulse/,
  https://gigazine.net/gsc_news/en/20260619-chatgpt-scheduled-tasks/.
  INFERRED: the market leader stepped back from "the model decides what you see each morning" to "a
  briefing you asked for, on a schedule you can see". Reliability was the stated reason.
- **Grok: Tasks became Automations** (July 2026). They run on a schedule ("every weekday at 8:00 AM")
  or on an incoming mail that matches filters, and deliver by app push, email, both or neither, set
  per automation. Mail triggers reportedly need SuperGrok. xAI later added notification filters for
  tasks. DOCUMENTED (secondary): https://blockchain.news/news/grok-automations-scheduled-tasks,
  https://www.remio.ai/post/grok-automations-launch-with-email-triggers-but-reliability-is-the-real-test
  (its headline: "reliability is the real test"),
  https://www.testingcatalog.com/upcoming-groks-tasks-feature-gets-ui-upgrade-and-scheduling-tweaks.
  The Grok bot's own routines and approvals are in research/35 §1.2. No source shows Grok's
  companions (Ani and the others, July 2025; Android March 2026) messaging first. Their complaints
  are about discomfort and safety, not volume: https://www.tomsguide.com/ai/i-tried-groks-new-companion-feature-and-ive-never-felt-so-uncomfortable.
  Evidence is thin.
- **Meta.** Meta's AI Studio bots (July 2025, not Muse) may message first only within 14 days after
  the person started a conversation, only if they sent at least 5 messages in it, and never again
  after one unanswered follow-up. DOCUMENTED:
  https://techcrunch.com/2025/07/03/meta-has-found-another-way-to-keep-you-engaged-chatbots-that-message-you-first/.
  Muse sends reminders drawn from the person's mail and suggests purchases from their history; early
  testers found the alerts useful, and the main criticism is how much data it wants. DOCUMENTED
  (review): https://www.aarp.org/personal-technology/tech-guru-meta-muse-ai/,
  https://androidauthority.com/meta-muse-agentic-ai-report-3708619. Muse "acts on details mentioned
  once" and "comes back when something changes" (research/35 §1.3).
- **Poke** texts first over iMessage, SMS, WhatsApp and Telegram when something needs the person (a
  bill due, a calendar conflict). Reviewers call it "finally proactive"; it has no audit log. Its maker
  was bought by Cognition in July 2026. DOCUMENTED:
  https://techcrunch.com/2026/04/08/poke-makes-ai-agents-as-easy-as-sending-a-text/; Product Hunt has
  2 reviews (thin).
- **Alexa+** was turned on for Prime users by default (January 2026) with only a revert. A
  notification said yes to by voice could only be turned off in the phone app; users reported
  "unsolicited responses" and feeling watched. DOCUMENTED:
  https://www.techradar.com/ai-platforms-assistants/amazon-is-pushing-alexa-upgrades-on-prime-members-and-users-arent-happy-about-it,
  https://www.emarketer.com/content/alexa--rolls-by-default-tests-user-trust.
- **Gemini** scheduled actions: at most 10 active. DOCUMENTED:
  https://support.google.com/gemini/answer/17094710.
- **Research.**
  - Harari & Amir (arXiv 2509.09309, two experiments, N = 761 and 571): help offered before it was
    asked raised perceived threat and lowered adoption against the same help when requested. The
    cost is to the person's sense of competence, not only to trust. DOCUMENTED.
  - DoubleAgents (arXiv 2509.12626, small n) names consistency, controllability and explainability
    as what builds trust in a proactive agent. DOCUMENTED.
  - Interruption is a cost, so timing matters (arXiv 2502.18658). DOCUMENTED.
  - Older findings are in research/35 §1.4: false alarms are the core metric (ProactiveBench), about
    60 % of failures are unwanted interventions (KnowU-Bench), and more frequent suggestions hurt.

### 1.1 What the bar is (INFERRED synthesis)

1. **Reliability first.** What the person was told would happen, happens, at the time they were
   told. Pulse lost to "reliable" scheduled tasks, and the Grok coverage leads with reliability.
2. **Their own words are the safest thing to bring back.** A reminder they asked for, or a thing they
   said they'd do, is help they requested (Harari & Amir), so it carries none of the threat of
   unasked advice. It is also Muse's "details mentioned once" and Microsoft Briefing's "commitments
   you made" (research/46).
3. **Fewer, and only with reason.** Meta's own rule is one follow-up, then silence. The research says
   false alarms are what hurts.
4. **Say where it came from.** Explainability is one of DoubleAgents' three patterns. Apple's
   summaries show what an unsourced line in the system's own voice costs (research/35).
5. **Turned off where it was turned on.** Alexa shows what happens otherwise. Ducter already has
   这类不用告诉我 under every find.

## 2. Ducter's engine against the bar

What it does, from `packages/core/src/proactive/engine.ts` and `detect.ts`:

- **Modes:** 只说急的 / 每天最多 3 件 (the default, D250) / 有用就说 / 不用主动找我.
- **Ten kinds,** all over a facts ledger from connected accounts (mail, calendar, GitHub, Slack):
  mismatches and calendar clashes, waiting on you, waiting on them, promises in sent mail,
  deadlines and money, plans changed, meeting prep, coming up, services, updates.
- **The bar:** a judge per kind that learns from Go and Not now (D258).
- **One morning note** at the end of quiet hours. A quiet day sends nothing (D173).
- **Other rungs:** "now" for what can't wait (its own room of 3), fold-ins while the person is in the
  app, and 开会前.
- **"How I know"** under each find, and dedupe across chat apps (D276's `claimed`).

Its own evals pass: `eval/proactive/run.ts` 7/7 mornings with no misses or false alarms;
`eval/proactive/day.ts` (the dots day) 7/7 in time, 0 false alarms.

All of that is about accounts. **The conversation itself was never a source.** A new eval,
`packages/partner/eval/proactive/life.ts`, scripts eleven days of ordinary life through the whole
engine on fakes (fake clock, a quiet inbox, the real Log, settings, decisions and push). It scores:

- **recall:** it said what mattered, inside its window;
- **precision:** everything it said was wanted;
- **timing:** late counts separately;
- **wording:** the person's language, at most two sentences, zh ≤ 60 characters.

### 2.1 The gaps, ranked (evidence)

1. **What the person said in the conversation is lost unless the model armed a wait in that very
   turn.** "下午 3 点提醒我给房东转账" works only if the partner calls `wait_until` then. Rule 13 of
   the persona asks it to, but no code checks that it did. "我明天要给张三回邮件", a thing they'll do
   themselves, is never brought back at all. Neither is the partner's own "好，明天 9 点提醒你" with
   no wait behind it, which is a broken promise in Ducter's own voice.
   - *Evidence:* life.ts before D281: asked-no-wait, partner-promise, said-for-tomorrow, en-weekday
     and off-still-asked all missed.
   - *Evidence:* `engine.ts` subscribed to `user_msg` only to time the D274 offers.
   - *Evidence (VERIFIED, the partner eval with Haiku):* `timer-set-en` ("remind me at 3pm…") fails
     with "no reminder set" in both the 2026-11-13 run and this branch's 2026-11-16 run
     (`packages/partner/eval/results/2026-11-16-haiku-d281.md`). The model does not always arm the wait.
   - **Highest value:** it is the safest kind of proactive help (§1.1, point 2), and its failure is
     the most damaging (§1.1, point 1).
2. **The morning note is lost on any day the home isn't running or awake at its hour.**
   - `armMorning` schedules the *next* end of quiet hours. A home that starts at 09:40 (after a
     restart, or a Mac that slept through 08:00) skips that day's note silently, and nothing says so.
   - Night is when updates restart homes (`agent_update` and device updates run `by: "night"`), and
     a laptop asleep at 08:00 is the common case [INFERRED: timers of a sleeping macOS process fire
     late; not measured].
   - *Evidence:* life.ts asleep-at-eight before: missed.
   - One more cause of "it sent me nothing".
3. **The morning note is blind to Ducter's own side.**
   - A reminder the partner set for 15:00 today, or a card waiting on the person since yesterday,
     never shows in the morning.
   - With few accounts connected most days are quiet, so "what matters today" was empty even when
     Ducter itself was holding things for the person.
   - *Evidence:* life.ts today-line before: missed both.
4. **"Why I'm telling you" exists only as the source list.** "How I know" lists the mails or events a
   find rests on. That is good, and it never quotes. A find from the conversation needs the person's
   own line there instead: it is the most reassuring source there is, because they wrote it.
5. **Language follows the last message when none is set.** `zh()` reads the newest `user_msg`, so one
   English line flips the next morning note's language. *Evidence:* code reading. Not changed here
   (a setting fixes it). Recorded in `todo.md`.
6. **No trust number is surfaced.** Go, 有用 and 这类不用告诉我 move bars per kind, but nobody sees
   "of what it said this month, you acted on 60%". *Evidence:* the `bars` and `finds` state only.
   Not built; recorded in `todo.md`.

Checked and not a gap:

- **Calendar clashes:** `mismatches` already joins overlapping events across calendars.
- **Bills, flights, deadlines and maintenance:** covered by D243, and pass run.ts and day.ts.
- **Duplicates across chat apps and push:** D276's `claimed` plus text dedupe in `judged`.
- **A wait that came true:** the waiter fires and the partner says the outcome (persona rule 15).
- **Tasks that finished while away:** the partner says each outcome when it happens, and the
  conversation's time line reads 你不在的时候 / While you were away (D104). Repeating them in the
  morning would say each thing twice, the noise the bar warns about.

## 3. What was built (D281)

- **你说过的 / Something you said, a find kind of its own, read by code with no model**
  (`proactive/said.ts`). Three things are kept:
  - an ask to be reminded (提醒我… / remind me…), with a time, a day, both or neither;
  - something the person said they would do on a day (我明天要… / I need to … on Friday);
  - the partner's own promise to remind (…提醒你 / I'll remind you…).

  What is never kept: recurring asks (a routine's job), questions, guesses and states (要不要, 觉得,
  I'll be in…), lines about the past, forwarded messages, and the partner's heads-ups with no time
  in them.

  A wait the partner arms within 10 minutes covers the line: it never becomes two reminders.

  When each is said:
  - an exact time: at that minute (a timer, not the 5-minute tick);
  - a day: first in that day's morning note, outside the day's 3;
  - an ask with no day: the next morning.

  An ask is kept in every mode, 不用主动找我 too, because they asked. A thing they'd do is proactive,
  so it is never kept with 不用主动找我. A line not said within 12 hours of its moment is let go,
  never said stale. "How I know" shows their own line: **你说的：「…」 / You said: "…"**.
- **The morning always comes once.**
  - A home that missed its hour runs the note at the next tick, up to 4 hours late.
  - Past that, the day is skipped: a "morning" note at 15:00 is noise.
  - A home that never had a morning (just set up) waits for tomorrow's.
- **The morning's one line.** It opens the note with what Ducter holds for today, and only when that
  is something:
  - the reminders the partner set for today (**今天 15:00：提醒你交水电费。**);
  - cards waiting on the person for over 12 hours (**还有 1 件等你定，最早的是昨天的。**), each named
    once and never again.

  A day with nothing still sends nothing.

## 4. Numbers (life.ts; fakes only)

| | recall (in window) | precision | late | wording |
|---|---|---|---|---|
| before D281 (this branch's base, `57ed9da7`) | 0/8 (0%) | 0/0 (nothing said) | 0 | – |
| after D281 | 8/8 (100%) | 7/7 (100%) | 0 | 7/7 |

The partner eval (D175: one tool's list of kinds gained `said`): Haiku 76/112. The last run, on
2026-11-13, scored 84/112 on fewer and older scenarios. The proactive scenarios (`noticed-anything-*`,
`timer-set-en`, `wait-pr-zh`, `routine-zh`) fail in both runs, for the same reasons. The difference
sits in scenarios this change doesn't touch: calls, phone and where.

- **Unchanged after D281:** run.ts 7/7 mornings with 0 misses and 0 false alarms; day.ts 7/7 in
  time, 0 false alarms, 5 notifications.
- **Precision corpus:** 23 ordinary lines (questions about tomorrow's meeting, "我明天在东京", "I'll
  be in Tokyo tomorrow", "我觉得明天可能会下雨", recurring asks…). None is kept, but the rules were
  tuned on this same corpus, so it is not a held-out score. Three lines were wrongly kept before
  tuning.
- **What the numbers do not say:**
  - The scenarios were written by the same hand that built the fixes.
  - The parser is rules, so real phrasing will find misses. A miss is silent, as before; a wrong
    keep is one line the person can mute.
  - Nothing ran on the author's machines or accounts.

## Implications for Ducter

- **Treat the person's own words as a first-class source.** They carry the least risk of any
  proactive line and the most trust. Their failure (a broken "I'll remind you") is the most
  damaging there is.
- **Reliability is a feature of its own.** A morning note that silently doesn't come is worse than
  one that is plain. Catch-ups are bounded, so lateness never turns into noise.
- **Keep the morning's own-side line to what is held for today and what was forgotten.** Never a
  digest of what happened.
- **Owed:**
  - a model pass over a turn for phrasings the rules miss (a cheap model, only on lines with a day
    word, at most once a turn);
  - a held-out precision set from the author's real conversation (counts only);
  - a surfaced trust number per kind;
  - the language pinned when unset.

## Summary

The best companions are judged on reliability, on bringing back what the person said, and on
restraint. Pulse was retired for scheduled briefings described as "more reliable", and Meta caps
follow-ups at one. Ducter's engine was strong on accounts (its evals pass) but deaf to the
conversation: a reminder rested on the model arming a wait in that very turn. The morning note was
also lost whenever the home wasn't up at its hour, and it never said what Ducter itself held for the
day.

D281 adds:
- 你说过的 / Something you said: asks, things the person said they'd do on a day, and the
  partner's promises, read by code, covered by any wait the partner arms, and said once at their
  moment;
- a bounded catch-up for a missed morning;
- one opening line for reminders due today and cards forgotten for over half a day.

Life-days eval on fakes: recall 0/8 → 8/8, precision 7/7, with the account evals unchanged.
