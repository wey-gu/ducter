# A hand-off is a thing, not a message (D609)

When one agent gives work to another, it is a **hand-off**: one record, always with an
owner, always visible, and it never dies quietly. This note replaces "send a Bridge message and
hope". It covers:
- a Ducter task giving a PR to a helper (a Keep, such as the PR Babysitter);
- a teammate's agent doing the same over Bridge;
- a helper giving work back to the task that made it.

## 1. What went wrong (2026-11-24 to 26, hel's Log)

The same failure happened in five different shapes in three days. Each time the person found
out by asking.

| When | Sender | What happened to it | How it was found |
|---|---|---|---|
| 11-25 | the 官网 #562 hand-off | filed as a reply to an old message, so no task picked it up | never noticed |
| 11-26 16:31 | dev task, mem#11393 | same | the author asked "is the Babysitter on it?" |
| 11-26 17:02 | dev task, mem#11408 | same | found while investigating |
| 11-26 19:1x | colleague's agent, mem#11389, sent in the dev-team Space | read, then dropped as muted: on 11-25 the author typed a reply on that sender's card, and any answer but Go muted the sender, silently and for good (D604) | the colleague's agent said "delivered, unread" |
| 11-26 20:20–20:36 | two dev tasks, mem-backbone#378 and mem#11441 | same as the first row; each resent 3× because nothing answered | the author asked |

Meanwhile the partner said 「已交给 PR Babysitter」 for work no one had taken (11-26 15:54).

## 2. Why: the design, not the bugs

D598 fixes the reply-threading bug and D604 the single-Space poller. But both come from the
same design mistake. We treated a hand-off as **mail**, and mail has none of the properties a
hand-off needs:

1. **No owner between "sent" and "taken".** Mail goes into an inbox, and nothing is
   responsible for it until someone reads it. A hand-off must always belong to someone: the
   sender until the receiver takes it, then the receiver.
2. **Its meaning was guessed from its shape.** "Is this new work or a reply?" was read from
   Bridge's `inReplyTo`, which Bridge sets by a convention (D249: a new message to someone you
   wrote to becomes a reply). The kind has to be stated, not inferred.
3. **Where it lands was an accident of addressing.** A Space, a mailbox, a reply thread: each
   is a way for the work to land where nobody looks. A helper is one thing to the person, so it
   must be reachable in one way wherever it's addressed.
4. **Silence was the failure mode.** A typed reply on a sender's card even muted the sender for good, with no word to anyone (D604). Unread, unclaimed and stuck all looked the same as "fine"
   to everyone. The sender retried blindly (3×), and the partner reported success it didn't
   have.
5. **No one could see the queue.** Neither the person nor the sender nor the partner had a
   list of "given, and not yet taken". Each found out only by asking.

## 3. The model

A hand-off is a record in the home's Log. Each step is an event:

```
handoff  { id, from: {task | agent+Space}, to: helper, item: {kind: pr|issue|task|text,
           ref, title}, ask: what to do, said: the sender's words, key: from+to+item.ref }
  states:  given → taken (by a task of the receiver) → done | returned (back to the sender, with why)
           given → unclaimed after 10 min → said to the person once
           given → declined by the receiver (out of scope) → back to the sender with why
           given → withdrawn by the person (不用跟了) → said to the sender once
           any open → settled (its PR merged or closed) → 用不着了, why merged | closed, nobody told
```

**Rules. Code guards these; the model only words them.**

- **One key per item.** A second hand-off of the same item to the same receiver merges into the
  open one, adding what's new. It is never a second record. The sender can't spam, and
  retrying is safe.
- **Taken is a fact.** It is true only when one of the receiver's tasks claims the hand-off by
  id. Until then:
  - the partner, the sender and the UI say 「交给了，等它接手」;
  - nobody says 「已交给…跟进」.
- **Every door makes the same record:**
  - a Ducter task's `hand_to`;
  - the partner's `keep_change hand`;
  - D596's `open_pr` hand-off;
  - Bridge mail to a helper, in **any** Space the helper is reachable in, whether or not
    Bridge threaded it under an old message.

  Bridge mail becomes a hand-off when it is addressed to a helper and isn't an answer to a
  question *that helper* asked. That's a fact about our own outbox, not about the thread.
- **The receiver wakes at once.** The hand-off is the first thing in the round's message, as
  D593's wake format does.
- **Answers go back where they came from.** Taken, done and returned are each said to the
  sender: to the task by `task_send`, to a teammate's agent in the same Space with Bridge's
  `reply_args_prefix`.
- **Unclaimed is said once, after 10 minutes,** to the person. It comes with the choice to run
  the work directly. A hand-off is never left silent.
- **One truth for a PR (D628).** A hand-off whose subject is a PR settles by itself when that
  PR merges or closes: `settled`, why `merged` or `closed`, never a reminder to anyone. The fact is
  Ducter's own owned look (`owned_news`), not a phrase in anyone's words. A task whose work was that
  merged PR and whose only remaining waits are timers is done: its waiters are cancelled and it
  leaves 等结果; when it wakes anyway for something else, its wake says the hand-off is over and to
  report done, never to wait for an acknowledgement. An issue hand-off settles when GitHub says the
  issue is closed (the usual way is the merged PR); that look runs only for an issue a helper got.
- **Everything held about an outside thing settles when it ends (D633).** The one path is
  `packages/core/src/holdings.ts` (`settleRef`). A PR or an issue is read from GitHub itself (`gh api …`,
  the same read-only reader the owned look uses), on start and then hourly, grouped by repository, and
  the facts Ducter already knows (`owned_news`, a new hand-off) settle at once. Every holder settles
  from that state: a task (its own PR, the item it was handed, the ref its report names, the wait it
  armed), the hand-off, a Keep's held item (a helper's, a loop's, a routine's watch) and a wait.
  Why: other agents open PRs and hand them over, so Ducter never watched them (hel: #11441,
  mem-backbone#378, #11389, #11408). Nothing is written to GitHub: the read is a read. The person hears
  one quiet summary (`ai_msg.settled`) when holders actually changed, never one line per item.

## 4. What the person sees

- **On the helper's Keep:** 手上的事 is one card. Inside it, a small section head (the shared
  secHead) names each state that has something in it: 等接手 first, who gave it and when as two
  separate facts; then 在做; then 退回了 and 没接, each carrying why it came back. Rows are on the
  card's hairline. A waiting row has 让它现在接 (a fresh arrival wakes the helper's round for that
  record) and 不用跟了 (the D602 confirm; the record is withdrawn, the sender hears once). A row
  with a task keeps 打开任务 and 不用跟了. Nothing is drawn for an empty group.
- **On the sending task:** one line under its last report, 「交给 PR Babysitter，等它接手」 →
  「PR Babysitter 接手了」 → its outcome, or 「用不着了：PR 已合并」 when the PR ended it. No card.
- **In the conversation:** nothing while it goes well. One line if it's unclaimed for 10 min,
  or if it's returned.
- **Settings › the helper:** 别的 agent 怎么找到它 lists every Space it's reachable in (D604).

## 5. What already exists

| Piece | State |
|---|---|
| Local hand-off without Mem, a held item, an immediate wake, "taken" only on claim, the 10-min line | D598 (in 0.1.91) |
| A typed reply never mutes; a muted sender's mail is re-read on unmute; the Spaces a helper receives in are a fact | D604 (in review) |
| 不用跟了 on a held item; release when its task ends | D602 (in review) |
| **One key per item, merging duplicates** | built (D614): a `handoff` record in the Log, `core/src/handoffs.ts`; the four doors all call it, and a resend adds to the open record, never a second one |
| **Declined and returned as states, said back to the sender in its Space** | built (D614): `report_to_main` `handoff` from a helper's task; a task is told by `task_send`, an agent answered in the Space its message came from (D595's route); done is the record's last step |
| **The sending task's one line, and 手上的事 grouped by state** | built (D616): the task's one line under its last report follows the record; the helper's page draws one card grouped by state on the web and the Mac, with 让它现在接 / 不用跟了 on a waiting row and the withdrawn state said back |
| **Bridge mail classified by our outbox (did this helper ask?), never by `inReplyTo`** | built (D614), replacing D598's "a reply under the helper's own old message counts as new": `helperQuestions` reads the messages one of the helper's tasks sent |
| A replay test over hel's real 11-24→26 sequence: every row of §1 ends taken or said | built (D614): `packages/partner/test/handoff-d609-replay.test.ts` (the muted dev-team hand-off, the two 3× resends, the 11-25 one, and the 10-minute line) |
| **A PR's hand-off settles when the PR merges or closes; the task that gave it is done, its timers cancelled** | built (D628, now the one path in D633's `core/src/holdings.ts`): `core/test/waits-truth.test.ts`, the `settled` state and words on both clients |
| **Everything held about an outside thing settles when it ends; the person hears one quiet summary** | built (D633): `core/src/holdings.ts` (`settleRef`), `core/src/handoffs.ts` `observeGithub`, `core/test/close-loop-dpending.test.ts` |

**Alternative not taken:** keep mail, and add more heuristics for "is this work". That's the
path that failed five times. The record makes the failure state visible by construction.

### What step 2 built

The record, the four doors, the states and the replay are built (D614). The record is
`handoff` on the Log (`protocol/src/handoff.ts`), written by `core/src/handoffs.ts`: given →
taken (only a claim by one of the receiver's tasks) → done | returned | declined, plus
withdrawn by the person and unclaimed after ten minutes. `open_pr`'s `hand_to`, `keep_change hand`, a task's
`agent_message` to a helper, and Bridge mail to a helper in any Space all make the same
record; a second hand-off of the same item joins the open one. A helper's task hands work
back through `report_to_main` `handoff: {back: "returned" | "declined", why}`, and the
outcome is said where it came from. An untaken one is said to the person once, as D598 did.

**The UI (D616).** A sender task's card carries its latest record (`TaskCard.handoff`), so its
opened task draws one quiet line under the last report: 交给 {helper}，等它接手 → {helper} 接手了
→ the outcome (做完了 / 退回了 / 没接 / 不用 {helper} 跟了, with the gist or why), no card. A
helper's Keep page carries every record (`KeepPage.handoffs`), and 手上的事 is one card with a
small section head inside it for each state that has something: 等接手 with the giver and the
given time as two facts, 在做, 退回了, 没接. A waiting row has 让它现在接 (a fresh arrival wakes
the helper's round for that record) and 不用跟了 (the D602 confirm; the record becomes
withdrawn, and the sender hears once). A row with a task keeps 打开任务 and 不用跟了. A hand-off
arrival round never ends on its head's colon: it says the clean head and the item, or just the
item (`arrivalDid`). The records reach both clients through `on_hand` and the Keep page; the
Mac's and web's controls are the shared ones (D161). Tests: `core/test/handoff-d609.test.ts`
(the card and page facts, wake and withdraw), `apps/web/test/handoff-d609.test.ts` (the words
and groups), `apps/web/test/handoff-geometry.test.ts` (390 and 1150, one card, a long title
wraps), `apps/desktop/internal/views/handoff_d609_test.go` (both surfaces, long title at 1150,
the waiting row's actions), and `handoff_d609_shots_test.go` (the shots). Shots:
`.shots/handoff/` (Mac 1150 and web 390, zh, light and dark; every state and the one-card Keep).
