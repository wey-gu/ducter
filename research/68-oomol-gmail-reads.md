# 68 · What OOMOL's Gmail reads answer, and why hel's look back read nothing

> 2026-11-12. Public. Follows D226 (`design/decisions.md`) and `65-calendar.md`. Built from:
> - the author's Mac: `oo` (OOMOL Hosted) `connector schema` for the Gmail actions, and two read-only
>   runs (`gmail.fetch_emails` with `detail: "summary"`, `gmail.search_threads`) over the last day, of
>   which only key names, value types and label counts were looked at; one read-only
>   `googlecalendar.list_events` of the coming 30 days, counted by kind only;
> - hel (the author's server home, Ducter 0.0.33 from 07:15 UTC, 0.0.34 from 07:34), read-only over
>   ssh: `proactive.json`, `watch.json` (counts, checkpoints and action names), the `connection_call`
>   rows of the Log (action, state and summary length only) and the service journal.
>
> No subject, sender, address or snippet is reproduced. Raw output was not kept.
>
> Tags: **VERIFIED** observed in this session · **DOCUMENTED** stated by OOMOL's schema ·
> **INFERRED** my reading.

## 1. The Gmail actions a watcher can use

| Action | Answers | Pages | Tag |
|---|---|---|---|
| `gmail.search_threads` `{query, maxResults ≤ 100}` (no other input allowed) | `threads: [{threadId, snippet}]`, nothing else: no sender, subject, date or labels | no | DOCUMENTED; VERIFIED (5 threads, keys `snippet`, `threadId` only) |
| `gmail.fetch_emails` `{query, maxResults ≤ 500, labelIds, pageToken, includeSpamTrash, detail: ids \| summary \| full}` | `messages: [{messageId, threadId, labelIds, subject, sender, to, messageTimestamp, internalDate, snippet, historyId, sizeEstimate}]`, `nextPageToken`, `resultSizeEstimate` | yes | DOCUMENTED; VERIFIED (16 messages over a day: `internalDate` a 13-digit millisecond string, `sender` as `Name <address>`, labels including `CATEGORY_UPDATES` 5, `CATEGORY_PROMOTIONS` 4, `CATEGORY_PERSONAL` 4, `SENT` 3) |
| `gmail.list_threads` `{query, maxResults ≤ 500, pageToken, verbose}` | threads, with full messages when `verbose` | yes | DOCUMENTED |
| `gmail.fetch_message_by_thread_id`, `gmail.get_message` | one thread or one message in full | – | DOCUMENTED |
| `gmail.list_messages`, `gmail.get_thread` | "metadata request returned HTTP 404" (no such action) | – | VERIFIED |

`fetch_emails` reads as a read for the broker (`fetch` first, no changing word) (VERIFIED in
`ooOp`). Its summary has no `List-Unsubscribe` header; Gmail's category labels and a no-reply sender
still mark notices and promotions (INFERRED from the label counts above).

## 2. What hel shows (counts only)

- The watcher tried `gmail.search_threads` first and remembered it for both Gmail accounts
  (`watch.json` `action`) (VERIFIED). Its `seen` lists held 176 and 15 ids: thread ids, not message
  ids (VERIFIED: the action answers no message id).
- 0.0.33 started at 07:15:54. At 07:16:01–07:16:16 the catch-up look back ran: the 60-day subject
  search answered 28 and 50 items for the two accounts (so the long OR'd query was accepted), the
  calendars 7 and 0 events, and the 3-day read 29 and 50 (VERIFIED, `watch.json` `reads`).
- Every one of those mail items had no subject and was dated 0 (`itemsOf` falls back to 0 when no
  date field is present) (INFERRED from §1 and `items.ts`). The look back keeps an item when its
  subject looks like a booking or a payment, or when it is from the last 3 days by its date: none
  could pass, so it read nothing and marked itself `done` (`backfill={conn:"done"}`) (INFERRED;
  consistent with `today.read=3`, `noted=0`, no `findings.json`).
- The only reading that succeeded was one batch of 3 new items from the 07:26 look
  (`month.tokens` 9,527 for that source; no triage error in the journal since 06:51) (VERIFIED for
  the counts, INFERRED for which look).
- No `[proactive]` or `[watch]` line since 07:15: the look back logged nothing by design.
- Before 0.0.33, triage failed on every call ("harness claude-code is not installed", every 10
  minutes) and every item was still added to `seen`; the in-memory retry list was lost at each
  restart (VERIFIED in the journal and `watch.ts`).
- The calendar: the Mac's default account's primary calendar has 4 events in the coming 30 days,
  all of them all-day and shown as free, no timed one (VERIFIED, counts only). All-day and free
  events are never meetings (D222), so `noted=0` from the calendars is expected, not a fault
  (INFERRED for hel's two accounts).

## 3. Why mail could never surface, even with triage fixed

Items from `search_threads` carry no date, so every fact made from them was dated 1970: an ask, a
payment or a reply is kept from its date and swept the next morning (`ledger.sweep`), and "waiting
on you for 2 working days" is measured from it (INFERRED from `ledger.ts`, `detect.ts`). With no
sender or labels, stage 1 could not leave notices and promotions out, and triage saw a snippet
alone. And a thread id is the same for each new reply in a thread, so a thread once seen hid every
later message in it (INFERRED from `watch.ts`).

## Implications for Ducter

1. Read mail with `gmail.fetch_emails` (`detail: "summary"`, 100 a page, up to 5 pages); keep
   `search_threads` as the fallback, and remember actions a source doesn't have rather than the
   last one that answered.
2. An item is seen only once it was read closely or a rule left it; one whose reading failed waits
   (ids and dates only on disk, up to 3 days) and the next look asks for it again.
3. A look back that ran on the old read ran on nothing: once, it runs again as a catch-up.
4. Split the long look back's subject search into short searches; if one is refused, read the
   newest mail instead and say so in the log. Log what each look back did, in one line.

**Summary.** Through OOMOL, `gmail.search_threads` answers a thread id and a snippet only. Every
mail the watcher read on hel was undated and without a subject, so the D226 look back kept none of
them and called itself done, and no fact from mail could have lasted a day. `gmail.fetch_emails`
answers dated, labelled, paged message summaries and is what the watcher should read. Feeds D226's
follow-up (2026-11-12).
