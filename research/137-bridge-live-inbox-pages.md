# 137 · The Bridge live trial on nmem 0.10.120: the answer was on the inbox's second page

> 2026-11-18. Public. Evidence for D367 (the next free number on this branch; it may be renumbered at
> merge). The author approved and the coordinator ran the live trial: `NMEM_CLI_PATH=<scratch nmem
> 0.10.120> bun run bridge:live -- --connected --real`, haiku on both sides, 448.7 s, as the trial's own
> identity `ducter-trial-202611181059-72c5` (D324) and a native Claude Code session as the peer. This
> report reads its transcript and its 53 recorded nmem calls (argv, stdout, stderr; kept outside git in
> the evidence folder as `live-2026-11-18T10-59-12-852Z-trial-haiku.md` and `raw-2026-11-18T10-59-12-852Z/`).
> Nothing was run against Mem for this report.
>
> Tags: **VERIFIED** read in the recorded calls or run here · **DOCUMENTED** from Nowledge's own help ·
> **INFERRED** my reading.

## 1. The result

| Scenario | Checks | What failed |
|---|---|---|
| S1 · the terminal hands work to the partner | 6/6 | nothing in the count, but see §3: "the terminal session read the result" passed on any words |
| S2 · the partner asks the terminal | 2/5 | "an answer came in after ours", "a reply to ours", "the partner told the user" |
| S3 · follow-through | 2/3 | "not said again an hour later" (follows from S2: two questions open, so a second one-time line) |
| X1 · the terminal asks for the person's call | 3/3 | nothing in the count, but its last check passed the same way as S1's |
| Closing line | ✓ | "Mem marks an original as one" (`in_reply_to: null`, D364) |

Everything Ducter's own side does passed: the request became one card, the task opened on Go, the claim
and result went back as replies, the S2 and S3 questions went out once each, X1's answer went back by code
as a reply. What failed is what the peer read. VERIFIED (transcript).

## 2. What Mem's inbox answers (nmem 0.10.120, Mem Cloud)

| Fact | Tag |
|---|---|
| `bridge inbox --json` is `{messages[], next, outgoing[], status_observed_at_us}`; a message entry is `{message, sender {actor_id, member, agent, agent_id}, in_reply_to}` (no time, no body, no read flag). | VERIFIED (calls 007–049) |
| At most **20 messages a page**. The peer's inbox answered exactly 20 with a non-empty `next` three times (calls 016, 023, 049). | VERIFIED |
| `next` is an opaque cursor, **a different string on every call** for the same first page (016, 023, 049); `""` on the last page (the trial's own inbox, 007–046). | VERIFIED |
| `--cursor <CURSOR>` is the flag that takes it. | DOCUMENTED (`nmem bridge inbox --help`, 0.10.119 on this Mac; 0.10.120's binary wasn't at hand to re-read, INFERRED the same) |
| **Oldest first.** The trial's own mailbox listed S1's request (acef9d61) before X1's question (32cfa74c), sent four minutes later (046); the peer's first page never showed anything this run sent. | VERIFIED (order in 046; the peer's page by absence) |
| **Opened messages stay listed.** The three the peer opened in S1 (017–019) are on the same first page at 023 and 049, in the same places. An inbox is the whole mailbox, not what's unread. | VERIFIED |
| The peer's mailbox (the author's own Claude Code identity in Only me) held at least 20 older messages, all from the author's own partner (`agent_id: ducter`), each an answer (`in_reply_to` set): earlier trials' traffic from 2026-11-13 and 2026-11-16, when the trial still ran as `ducter` (before D324). | VERIFIED (sender and bodies at 023–040) |

## 3. What happened, call by call

- **S1.** The peer sent the request (010); Ducter took it, claimed it and sent the result as two replies
  (014, 015). Asked "Ducter 那边怎么样了？", the peer ran one inbox (016), got the 20 older messages, opened
  three of them (017–019) and said Ducter "hasn't replied yet". The check passed because it accepted any
  non-empty answer. VERIFIED.
- **S2.** Ducter's question went out as message f36cc3f9, a reply in the thread of the peer's own request
  (022; D249 reaches an agent through `reply` on its latest message). The peer ran one inbox (023): the same
  20 older messages and a `next`. It never paged, opened 17 more older messages (024–040), and **replied to
  one of them, 960715b8** (041), an old question from an earlier trial, with this run's status text. So
  Ducter's question had no answer, and S2's three answer checks failed. VERIFIED.
- **S3.** With S2's question still open, the two-hour line covered it, and an hour later the one-time line
  for S3's own question followed: "not said again" failed because two questions were open, not because one
  was said twice. VERIFIED (transcript), INFERRED as the cause.
- **X1.** The peer sent its question (045); Ducter carded it and the answer went back by code (048). Asked
  what Weyl decided, the peer ran one inbox (049), saw only older messages and said no answer had come. The
  check passed on any words. VERIFIED.

## 4. The same bug in Ducter

Ducter's own reader (`packages/partner/src/bridge.ts`) read **only the first page** of every inbox: in the
check (`check`), in the start mark (`inboxIds`) and after a long-poll (`waitInbox`). Its only paging code
was in `contacts`, which looks for `next_args` / `spaces_cursor` / `next_spaces_cursor`, not the inbox's
`next`. So a partner whose mailbox holds 20 or more messages, opened or not, never sees a new one again:
it is on a later page. VERIFIED (code). The trial's own identity was fresh (an empty mailbox), so the trial
itself never showed this on Ducter's side. The author's live partner `ducter` has sent and received well
over 20 messages in Only me since 2026-11-13 (its answers alone fill the peer's first page), so INFERRED:
the person's real Ducter may already be missing new mail.

## 5. Side effects on the author's real mailboxes

- **20 older messages opened** in the author's own Claude Code mailbox (S1: 3, S2: 17). `open` records the
  recipient's first read; whether some were unread before is unknown. VERIFIED (the calls), INFERRED (the
  read marks).
- **One reply sent to the author's own partner `ducter`** (041, message 47dcd5db), answering its old
  question 960715b8 with this run's made-up status ("4 个通过；… 预计今晚 22:00 左右"). The author's live
  Ducter will see it as an answer from his terminal agent when it next reads that mailbox (or would, once
  it pages, §4). VERIFIED (the call), INFERRED (what the live Ducter shows).
- Nothing was acknowledged, archived or deleted. The trial's own identity and connection were removed at
  the end. VERIFIED (050–052).
- **While building the fix, one fake run went to the real CLI.** The first `bun run bridge:live` over the
  fake Bridge with the new guard (2026-11-18 ~11:26 UTC) failed S1 0/4 and X1 0/3: the peer's calls never
  reached the fake. Its own words say it saw the real CLI (`agent context "terminal-claude" was not found`,
  the author's real Spaces listed by passive `bridge setup`), and that it **sent** two messages "in Only me"
  without a context (S1's request, X1's question). Where they went (the author's own `ducter`, or nowhere)
  was not checked: that would mean reading the author's mailbox. How it got around `PATH` is not known: a
  direct reproduction with the same `claude -p` flags and environment reached the guard every time, and so
  did the next two fake runs. VERIFIED (the run's transcript), INFERRED (the sends). Since then a fake run
  gives the peer an empty Mem config (`NMEM_CLI_CONFIG_DIR`), so any other nmem finds no account;
  `NMEM_CLI_PATH` names the guard too (Mem's own Claude Code plugin tells agents to use it); and the guard
  logs every call, so a peer turn with no call through it stops the run.

## 6. Implications for Ducter

1. **Ducter reads every page** of an inbox (D367): it follows `next` with `--cursor` (or `next_cursor`, by
   the same name in other answers), at most 25 pages (500 messages at 20) per inbox per read, merges them
   (each message once, the later page's read status winning), and stops early on a page that adds nothing.
   The start mark, the check and the long-poll all use it. An answer with no `next` is one page, as before.
   Opening order stays Mem's (oldest first): five bodies a check, so a burst comes in order.
2. **The fake pages like Mem**: 20 a page, oldest first, opened ones kept, a new opaque cursor per call
   (`NMEM_FAKE_INBOX_PAGE` for another size); the `named` shape stays one page with no `next`. Tests: a new
   message behind 25 older ones is seen and only it is opened; the start mark covers every page; an answer
   behind older mail comes back linked; the bound holds; a long-poll's first page is followed.
3. **The trial never touches the person's own mail again**: the peer's `nmem` is a guard
   (`packages/partner/eval/bridge-peer-guard.ts`) that opens and answers only what this run's Ducter sent,
   sends only to this run's Ducter's card, and refuses every verb besides contacts/send/inbox/open/reply.
   It logs every call; a peer turn that made none through it stops the run (§5's fake run).
   The peer is told the inbox is oldest first, 20 a page, and to page with `--cursor` and open only this
   run's Ducter's messages. Before each peer turn the transcript says how many messages its mailbox holds,
   over how many pages, and on which page this run's are.
4. **"Read" means opened**: S1's and X1's terminal checks now pass only if the peer opened the result or
   the answer (the recorded `open` call; the fake's read mark), never on any words.
5. **The fake run rehearses the live mailbox**: 25 older answers from the person's own partner sit in the
   peer's mailbox before S1, and the fake answers as nmem 0.10.120 by default.
6. **B18 for Nowledge** (draft, not posted): an agent's inbox lists the whole mailbox, oldest first, 20 a
   page, so the first page of a mailbox with history is all old mail and an agent that reads one page (as
   both Ducter and a haiku Claude Code session did) misses everything new. Asks: newest first by default,
   or an `--unread` filter (or `--since <cursor>`) so a reader can ask for what's new without walking every
   page; a resumable cursor (one that stays valid for "after the last thing I saw"); and the order and
   paging said in `bridge inbox --help` and the Bridge skill.

## Summary

The live trial on nmem 0.10.120 failed S2 2/5 and S3 2/3 because Mem's inbox answers 20 messages a page,
oldest first, opened ones included, and the peer read only the first page: 20 older answers from earlier
trials. It never saw Ducter's question, opened 20 old messages and answered an old one, sending a reply to
the author's real partner. S1's and X1's "the terminal read it" checks passed on any words though the peer
saw nothing new. Ducter had the same bug: it read one page of every inbox, so a mailbox of 20 or more
messages hides new mail. D367 pages every inbox (bounded), makes the fake page like Mem, puts the trial's
peer behind a guard that touches only this run's mail, and makes the terminal checks count only an actual
open. The rerun is the author's step; B18 goes to Nowledge as a draft.
