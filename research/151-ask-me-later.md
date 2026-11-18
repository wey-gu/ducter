# 151: Ask me later, a question put off to a time (D382)

Gap #3 of the second gap audit (research/150): a question waiting on the person can't be put off
for later. 23:00, four asks waiting; the heavy developer wants them in the morning, not now and
not never. This note is the evidence for D382: what Hold does today, what "later" must mean for a
card with a countdown, the word, and where the put-off card lives and how it comes back.

## 1. What is there today

- **Hold resolves the card.** `decisions.decide(id, "hold")` logs `decision_resolved` with option
  hold; the task goes to `blocked` (Waiting) with no reason and nothing brings it back
  (`packages/core/src/decisions.ts`, `onResolved`). VERIFIED (code, `flow.test.ts` "irreversible
  questions wait for the user; … hold is not [forwarded]").
- **The flow's Q3 left it open.** `design/flows/D-decisions-attention.md` §2: Hold "stays Needs you,
  countdown removed, default cancelled"; the built code moves it to Waiting instead. Either way
  nothing returns it. A typed "明早再说" is a Reply: it goes to the task as words, and whether it
  becomes a time depends on the model (§6 "Reply is ambiguous … M treats it as Hold"). VERIFIED.
- **Quiet hours already hold a decision's push to their end** and coalesce what waited into one
  "早上好。n 件等你。" (`push.ts` `tick`, `heldByQuiet`; `push.test.ts` "quiet hours: nothing
  breaks through"). VERIFIED. The morning note (D165) runs at the same moment (`proactive/engine.ts`
  `armMorning`: the end of quiet hours). VERIFIED.
- **"Later" already exists for two other things, without a time:** the Mac app's gentle asks
  (`views/asks.go`: 稍后 / Later keeps an ask away for days) and the Android update (D181: 以后再说
  / Later holds a version back three days). The glossary's rule (D212) says a dialog's "not now"
  is 以后再说 or 暂不 + verb. VERIFIED (`product-model.md` §1).
- **Outside:** a task inbox with "done" and "later until …" became a daily habit in an open agent
  app (research/150 §3, DOCUMENTED in private notes). Mail apps' snooze offers "later today,
  tomorrow, this weekend, next week, pick a date", each with its time (DOCUMENTED, common UI;
  not re-checked for this note).

## 2. Who, and what they feel

- **The heavy developer** at 23:00 with four asks: before, Hold means never and leaving them means
  the defaults fire overnight on things he wanted to look at; after, two taps each and the evening
  is clear, and they are back with the morning's one notice. 放心: nothing ran while he slept.
- **The consumer** in a meeting: "send the weekly report to Wang?" can't be answered now. Before,
  the countdown runs while she can't look; after, "tonight 20:00" and it is gone until then.
- **The fresh user** sees one more quiet action beside Reply…; the times say themselves. No
  concept to learn; the line under the times says nothing happens before then.

## 3. What "later" means (the countdown)

| Option | What happens | Problem |
|---|---|---|
| The countdown keeps running | the default may fire while it is away | Later becomes meaningless for a 10–30 min countdown; worse, it fires unseen |
| The default is cancelled (like Hold) | it comes back with no countdown | the work can stall again on a card nobody answers; silence no longer means success |
| **The countdown stops, and on return starts again with its first length** | nothing happens while away; back, the same 30 min (or whatever it had) runs from then | at 08:00 the person may still be asleep, so the default may fire at 08:30: the same promise the card made the first time, now at a time they chose |

The third is the honest reading of the tap: "not now, ask me then", with the card's own promise
intact afterwards. Remaining-time pause was rejected: a card put off with 40 s left would come
back with 40 s. **Amended in review (2026-11-19):** restarting at the return still lets a default
run at 08:30 on a card that came back at 08:00 while the person slept. They said "ask me", so the
countdown waits for the card to be seen: the first read past its return on any client (the
conversation's existing read receipt; the Mac app sends it only with its window in front), then
the first length from that moment. Never seen, it waits in Needs you and the count.

## 4. The word (comprehension test, LLM proxies)

Two panels of five simulated naive raters (haiku; a 55-year-old shop owner, a student, a nurse,
an engineer, a retired teacher), zh and en, one card ("send the weekly report to Mr. Wang?") with
Go / Hold / Reply and one more control. Scores 1–5, averaged; these are proxies, not people.

| Candidate | zh clarity | zh warmth | zh ≠ 先等等 | en clarity | en warmth | en ≠ Hold | Most common false belief |
|---|---|---|---|---|---|---|---|
| 晚点再说 / Later | 3.0 | 3.4 | 2.0 | 2.4 | 2.8 | 2.2 | the same as Hold, or gone for good |
| 稍后提醒我 / Remind me later | 4.4 | 3.0 | 3.8 | 4.2 | 4.0 | 4.0 | the work is handed back to me; it buzzes at an unknown time |
| **晚点再问我 / Ask me later** | 4.2 | **4.6** | **4.2** | 3.4 | **4.2** | 4.0 | it asks again and again; the assistant picks the time |
| 推迟 / Snooze | 3.2 | 2.0 | 2.6 | 3.2 | 2.0 | 4.2 | the report's deadline moves; an alarm |
| 以后再说 / Not now | 2.6 | 2.8 | 2.4 | 2.2 | 3.0 | 2.2 | never asked again |
| no word: three times as buttons | **4.8** | 4.0 | **4.6** | **4.8** | 3.4 | **5.0** | choosing a time **sends** it at that time |

Read together: the word that says the literal thing is "ask me", not "remind me" (the work is
not handed back) and not "later" alone (reads as Hold or never). The times are clearest but carry
the most dangerous false belief (a send at that time), and six buttons do not fit a phone row.
So: **晚点再问我 / Ask me later** opens the times, each its own chip with its own clock
("今晚 20:00", "明早 8:00", "下周一 8:00", "选个时间…"), and one line under them answers both false
beliefs: **到时再问你。在那之前，什么都不做。/ I'll ask you again then. Nothing happens before that.**
"Asks again and again" is answered by the card itself: back once, said once.

## 5. Where it lives and how it returns

- **Out of Needs you, into Waiting.** A put-off ask is not the person's now; it leaves 等你 and the
  one needs-you count (D310) and stands in 在等 like any wait, its line saying when and what:
  **明早 8:00 再问你：{question}** with **现在就定 / Decide now**. A fold of its own was weighed and
  dropped: one more section to learn, and Waiting already means "comes back by itself at a time".
- **Back at its time,** core logs `decision_back`: Needs you again, the countdown again, and the
  living message carries it once with **你说晚点再问，现在来问你。/ You said to ask later, so here it
  is.** The push follows the usual rules (unseen after the hold); in quiet hours it waits for their
  end and joins the morning's one notice, so 明早 = the end of quiet hours is the morning itself.
  Brought back by the person (Decide now), nothing is said or pushed.
- **Answering it while away still works** from the opened task or the conversation; the answer
  stands and it never comes back.
- **A restart** keeps it away; one whose time passed while Ducter was down comes back at start.
- **Not offered** where the moment is the point: a sign-in, a fill or pay on a site, a key a task
  waits in a call for, a phone or computer turn, a call, a computer to wait for or move off; nor
  a find's step (it lives in its note), a "keep as a rule?" (D379) or a stranger's first message
  (D334), whose own Hold already means "not now". Partner-level asks (routine proposals, D169's
  Mem offer, D170's trust) may be put off.

## 6. Not in this slice

- **"When something happens"** (a condition the partner watches, D112's check) needs a partner tool
  that turns words into a waiter on a decision; a partner-tool change carries a fresh eval (D175).
  Typed words ("等 CI 过了再问我") stay a Reply for now.
- **Chat apps, iMessage, the menu bar, the CLI and the phones' notification actions** offer Go /
  Hold / Reply only; a put-off card there stays as it was sent.

## Implications for Ducter

1. Add **晚点再问我 / Ask me later** to an ask, opening the times; never on cards whose moment is
   the point.
2. Put off = out of Needs you into Waiting, countdown stopped; back = Needs you, said once, pushed
   by the usual rules; its countdown (first length) starts only once it is seen.
3. Three Log events (`decision_later`, `decision_back`, `decision_seen`) and one client frame
   (`later`); no partner turn, no partner change.
4. Conditions and the other surfaces wait for their triggers (`todo.md`).

**Summary.** Hold today is "never". Later is "not now, ask me at a time I pick": the card leaves
Needs you, nothing runs, and at that time it comes back once; its countdown starts over only when
it is seen.
"Ask me later" beat "Later", "Snooze" and "Remind me" with LLM-proxy raters; the times as chips
under it, with one line that nothing happens before then, answer the panels' worst false belief.
