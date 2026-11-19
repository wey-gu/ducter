# 164 · Waiting for your reply: worth a tap, with the reply already written

Date: 2026-11-19, on main at `04249066` (0.0.93). Follows research/154 (D388) and research/162 gap #3
("the finds aren't worth a tap yet", score 24). Decision: D403.

Tags: **VERIFIED** = read in hel's Log or files (read only) or measured on this branch; **DOCUMENTED**
= a source's own docs; **INFERRED** = judgment.

## 1. What hel said, and what came of it (VERIFIED, read only)

hel runs 0.0.92 (`ducter --version`). Read with `python3` over `file:/root/.ducter/ducter.db?mode=ro`
(`finds`, `find_state`) and `findings.json` (the facts ledger: types, booleans, dates and the names
the partner already said; no subject, snippet or address printed or kept).

- 2026-11-12 to 11-18: **13 finds**: 11 `waiting_on_you`, one `coming_up`, one `todos` (D359). The
  11 waiting finds: 7 said on the **"now" rung** (one each, pushed time-sensitive), 4 in the 11-18
  morning note. **All 11 held** (`find_state` held), none taken; every Go label was 拟个回复, which
  opens a task that drafts.
- Cross-read against the ledger (counts and booleans per sender, names as the partner said them):

| # | The partner's words (as said) | What the ledger shows | Verdict |
|---|---|---|---|
| 1 | ケンタロウ…购买 Plus 后仍显示 "Not active" | a customer they had written to before; the person held the find and **replied himself two minutes later** (1 h 33 min after it was said) | **worth it**: a ready reply would have been the tap |
| 2 | Thaddeus 10 月 20 日申请报销… | asked 24 days before it was said; nothing since; the ask is a payment, not a reply | silent: stale, likely handled elsewhere |
| 3 | Iryna…再次询问你是否参加 NexTech Week Tokyo | a stranger's event drip, "again" because it is a sequence; a pitch word in the subject | silent (D388's pitch filter catches it) |
| 4 | Heyong…请求提供已签名的 Apple Silicon 测试版 | a tester, no reply anywhere | **worth it** |
| 5 | CamXing 跟进了「重建搜索一直在报错」 | a user asking again, no reply | **worth it** |
| 6 | Boardy…「send a booking link」 | an AI networking bot | silent (D388) |
| 7 | Yuki…「consider the Manufacturing DX CAMP invitation」 | a stranger's invitation | silent (D388) |
| 8 | 株式会社WINWILL…「discuss freelance talent proposals」 | an agency's role address | silent (D388) |
| 9 | Weizhen…「review recent failures and harden prompts」 | **GitHub's notification relay** (`notifications@…`), marked a person by triage; answered on GitHub, where Ducter's mail read can't see | silent: a mail reply reaches nobody; GitHub's own watch says it |
| 10 | 2294426674…「help with POST /memories returning HTTP 409」 | a user whose name is a number; no reply | **worth it** |
| 11 | Yuexin…问你一件事 | the ask had no words (triage gave none) | silent: nothing to answer, nothing to draft |

So **4 of 11 were worth saying, 7 should have been silent**; D388 (in 0.0.93, not on hel) already
silences 4 of the 7. What would have made the 4 worth a tap: the reply written (in Japanese for #1,
Chinese for #5), editable, one Go to send; and the morning note, not a push each (INFERRED from the
holds and #1's own reply soon after).

Two more facts from the ledger: 14 of the person's sent mails were read (their voice is there to
learn from), and the watch never sees their own Slack messages (9 Slack facts, all inbound), so
"answered elsewhere" can only use mail (VERIFIED, counts).

## 2. The rebuilt week (VERIFIED on this branch)

`packages/core/test/fixtures/waiting-days.ts` mirrors the 11 as synthetic mail (made-up people and
domains; GitHub's relay address is a service), added to the aha week (research/154), run from Monday
11-09 so every mail arrives at its time: `bun packages/partner/eval/proactive/aha.ts <mode> --waiting`.
No model, no network (recorded triage, a recorded drafter).

| Mode | Code | Waiting said | On "now" | Worth said | With a draft | False positives | The aha six in time |
|---|---|---|---|---|---|---|---|
| 每天最多 3 件 | main (0.0.93) | 8 | 4 | 4/4 | 0 | 3 (stale refund, GitHub relay, wordless ask) | 6/6 |
| 每天最多 3 件 | D403 | 5 | 0 | 4/4 | 4/4 (+ Mia's) | 0 | 6/6 |
| 有用就说 | main | 8 | 2 | 4/4 | 0 | 3 | 6/6 |
| 有用就说 | D403 | 5 | 0 | 4/4 | 4/4 | 0 | 6/6 |
| 只说急的 | main | 8 | 8 | 4/4 | 0 | 3 | 2/6 (the time fill late: the "now" room taken) |
| 只说急的 | D403 | 5 | 5 | 4/4 | 4/4 | 0 | 3/6 (fill in time; the rest wait for a note this mode doesn't have, as before) |

Before D403, people waiting filled the day's "now" room (three a day) and pushed the AGI Bar time
fill a day late in 只说急的; with 有用就说 on hel's own mail, the same pattern produced the seven
one-at-a-time pushes of 11-12 to 11-14.

## 3. Design (INFERRED, from §1 and D61)

- **Worth it, by code** (`detect.ts`): a person (not a relay: GitHub's and other services'
  notification senders, no-reply, mailers), not a role address they never wrote to, an ask with
  words, last asked within 10 working days, and nothing the person sent them since on any service
  (a reply, a new mail asking them, a promise). D388's pitch filter stays.
- **Never "now" by itself:** a person waiting goes in the morning note; 只说急的 still says the ones
  who asked again or waited three working days (D232, kept as `pressing`).
- **The reply, written before it is said** (`reply.ts`): the thread with them and up to five of the
  person's own sent mails are read as the watch (reads only, kept nowhere), the cheapest capable
  model writes at most five sentences in the thread's language and the person's voice, never
  inventing a fact (an honest holding reply instead, with what to check named), never repeating a
  code or key. A bracketed blank or an empty answer is no draft. One minute at most; without one the
  find is said as before (拟个回复 opens a task).
- **Shown in the card, editable in place; Go sends** the text as left, after **30 seconds with 撤回**
  (D61 GQ3), through the staged write every outward action takes (`connections.stage` +
  `runApproved`, so it appears in 替你做过的). Undo, a refused send or a restart inside the window
  asks again (a new decision); nothing is ever sent unseen; nothing is saved into the mailbox.
- **The send action** is read from the account's own catalog (`gmail.reply_to_thread`, then
  `gmail.send_email`), its input from the schema's own field names; no recipient or text field: no
  send ("这个账号现在没法从这里发信。"). OOMOL's real Gmail send schema was **not read** on this branch
  (no account touched): a live check is owed (`design/todo.md`).

## 4. What is not covered

- Outlook, chat apps and GitHub get no draft yet (GitHub keeps 先帮我读一遍; chat's own replies are
  the person's in that app).
- "Answered elsewhere" can't see Slack or Discord replies the person wrote (the watch reads only what
  is addressed to them).
- The drafter's quality was measured with recorded drafts only; a haiku panel over real-shaped
  threads (language, voice, no invented facts) is the next eval (`design/todo.md`).

## Implications for Ducter

Say a person waiting only when it is worth a tap, and when it is, make the tap the reply itself: a
draft in the thread's language and the person's voice, editable, sent behind Go with a 30-second
undo. Keep people waiting off the "now" rung. Verify on hel once 0.0.94 is there: the number of
waiting finds per day, how many go out on Go, and the first real send's input against OOMOL's schema.

**Summary:** of hel's 11 waiting finds (all held), 4 were worth saying and 7 should have been silent;
D388 already silences 4, and D403's code gate the other 3 (a stale ask, GitHub's relay, an ask with no
words). On the rebuilt week, waiting finds said go from 8 to 5 with 0 false positives (was 3), none on
"now" (was 4), and every worth one arrives with its reply written; the aha six stay 6/6.
