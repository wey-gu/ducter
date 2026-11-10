# 46. Nudges, daily briefings and interruption levels

> 2026-11-10 · For the first-principles redo of proactive work (`design/connectors.md` Draft 4,
> draft D165). research/35 covered dots, Muse, the Grok bot, Pulse and Gemini's Daily Brief, and
> listed Superhuman, Copilot and others as "not covered". This report fills only the facts the
> redo needs and research/35 lacks: **waiting on others / waiting on you** (Gmail's nudges),
> **commitments found in mail and meeting prep** (Microsoft's Briefing email), and **what may
> break through** (Apple's interruption levels and Scheduled Summary).
>
> Labels: VERIFIED (read at the source this session), DOCUMENTED (a vendor or secondary source
> says so; not tried), INFERRED (my judgment).

## 1. Gmail's nudges: the two directions of "waiting"

- **Two separate switches**, Settings › General › Nudges: **"Suggest emails to reply to"** (mail
  you received and didn't answer) and **"Suggest emails to follow up on"** (mail you sent that got
  no reply). On by default; conversation view required. DOCUMENTED (secondary, consistent across
  several guides): https://mailmeteor.com/blog/gmail-nudges,
  https://www.laptopmag.com/articles/how-to-turn-off-gmail-nudge.
- **The thresholds are a few days, and unpublished.** Launch examples read "Received 3 days ago.
  Reply?" and "Sent 5 days ago. Follow up?", in orange beside the message. No official figure.
  DOCUMENTED (secondary): https://9to5google.com/2018/05/14/new-gmail-web-nudge-ai-reminders/.
- **Shown in place, never pushed.** A nudge is a label on the thread in the inbox list; it never
  sends anything. DOCUMENTED (same sources).
- **Its reputation:** guides explaining how to turn it off ("The one Gmail feature you should
  disable now", Laptop Mag) are common. The complaint is noise: newsletters and threads that
  needed no answer get nudged. DOCUMENTED (secondary), the cause INFERRED.

## 2. Microsoft's Briefing email: commitments, requests, meeting prep

- **What it held** (Viva Insights, formerly Cortana, a daily email from about 2020): the day's
  first meetings with a suggested action (a related document to read), **outstanding tasks** from
  mail, and a slot to book focus time. Tasks were of two kinds: **commitments you made** in mail
  you sent and **requests others made of you**, plus **follow-ups on requests you made**. Tasks
  related to an upcoming meeting were listed with that meeting. DOCUMENTED:
  https://learn.microsoft.com/viva/insights/personal/reference/briefing-pause (read this session,
  VERIFIED as quoted below), and the search summaries of the older overview pages.
- **The window is 14 days:** "These reminders are based on emails you've sent and requests your
  colleagues have emailed you over the last 14 days." VERIFIED (briefing-pause page).
- **Meeting prep moved into the moment:** Outlook's reminders "typically show up … 15 minutes
  before a scheduled event", and show related pre-read documents with them. VERIFIED (same page).
- **It was paused:** "We're taking some time to improve the Briefing email … we've taken a break
  from sending you your daily Briefing." (page dated 2024-10-23, updated 2025-09-08). The features
  live on in places the person already looks (the Outlook add-in, My Day, To Do). VERIFIED.
- **Research behind it:** Morrison, Iqbal, Horvitz, "AI-Powered Reminders for Collaborative
  Tasks: Experiences and Futures", CSCW 2024 (arXiv 2403.01365): interviews and surveys of
  knowledge workers using the Briefing email about which reminders they want, how they want to
  act on them, and how work style changes their value. The abstract gives no numbers; I did not
  read the full paper. DOCUMENTED.
- **INFERRED lessons.** (1) A separate daily email is one more inbox; Microsoft moved the same
  items into the surfaces people already open. Ducter's equivalent is the one conversation, not a
  separate digest. (2) Commitments and requests are the high-value class for knowledge workers,
  and the same reminder is wanted *at the meeting* rather than in the morning when the two are
  related.

## 3. What may break through: Apple's interruption levels

- **Four levels on every notification** (iOS 15+): `passive` (no sound, no screen wake),
  `active` (the default), `timeSensitive` (may break through a Focus and is delivered at once
  instead of waiting for the Scheduled Summary, if the person allows it for that app) and
  `critical` (bypasses mute; Apple entitlement only). DOCUMENTED (Apple's API page returned only
  its title to my fetch; the behavior is from Apple's WWDC21 session 10091 notes,
  https://www.wwdcnotes.com/notes/wwdc21/10091, and developer guides such as Braze's).
- **Scheduled Summary** batches non-urgent notifications into deliveries at times the person
  picks; Time Sensitive ones skip it, and the person can turn Time Sensitive off per app.
  DOCUMENTED (secondary): https://www.howtogeek.com/751402/how-to-set-up-notification-summary-on-iphone-and-ipad/.
- **INFERRED:** the phone already gives people a vocabulary of "a batch at a time I chose" and
  "this one may come through". Ducter's morning note maps to a *passive* notification (no
  sound), and only a find that would cost something today earns *time-sensitive*, which the
  phone itself lets the person veto. Ducter never asks for `critical`.

## 4. What this adds to research/35

| Need | research/35 | This report |
|---|---|---|
| Waiting on you / on others | not covered | Gmail splits them into two switches; a few days; shown in place; noisy without a "did it need an answer" filter |
| Commitments in your own mail | not covered | Microsoft's Briefing: commitments, requests, follow-ups over 14 days; listed with the related meeting |
| Meeting prep | not covered | 15 minutes before, in the reminder itself, with the related documents |
| Delivery levels | Ducter's own push rules (D52, D59) | passive / active / time-sensitive; the summary is a time the person picked |
| A separate digest channel | Gemini Daily Brief (morning), Pulse (morning cards) | Microsoft paused its daily email and moved the items into surfaces people already open |

## Implications for Ducter

1. **Treat the two directions of waiting as two kinds**, each with its own switch-by-reaction
   (这类不用告诉我), and filter both by "did this need an answer": a question, a request or a
   deadline in the mail, and a person who matters (Mem). Nudging every unanswered thread is
   Gmail's noise.
2. **Commitments you made** ("我周五发给你") are a first-class kind: extracted from sent mail
   over a 14-day window, said once on the due morning if nothing shows they were kept.
3. **Meeting prep belongs at the meeting**, about 10–15 minutes before, and only when there is
   something open between you and those people; never a list of every meeting in the morning.
4. **The morning note is a passive notification** (no sound) into the one conversation, not a
   separate email or feed. Only a find that costs something today is time-sensitive.
5. **Never ask for critical alerts.** A missed flight change is not a safety alert.

## Summary

Gmail's nudges split "waiting on you" from "waiting on others" and show both in place, after a
few days, with a noise problem. Microsoft's Briefing email found commitments and requests in 14
days of mail and joined them to meetings, then was paused in favor of surfaces people already
open. Apple's interruption levels give the phone's own words for "a batch at a time I chose" and
"this one may come through". Ducter takes all three into one conversation: two waiting kinds and
a commitments kind with a "needed an answer" filter, meeting prep only at the meeting and only
with something open, and a morning note that never makes a sound.
