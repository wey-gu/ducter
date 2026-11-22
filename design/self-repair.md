# Self-repair: what fails, who mends it, what the person sees (D473)

> Evidence: research/205 (one real home, 13 days: 8 failed task starts, all reached the person,
> none mended; 2,866 failed watch reads nobody counted). Built: the start and stall ladder in
> core (`packages/core/src/mend.ts`), the hand-over to the partner (`packages/partner/src/render.ts`
> `renderMend`), the quiet steps line, and `ducter repairs`. The rest of this note is design;
> what isn't built is in `todo.md` with its trigger.

## Who, and what they feel

- **The heavy developer** hands off ten things and walks away. Before: a task 没能开始 because
  a folder was on another computer; they find out an hour later and have to ask why. After:
  they never see it; at most a quiet line in that task's steps says Ducter cloned the code on
  the server first. 放心: silence means it worked, not that nobody looked.
- **The consumer user** never learns the words folder, clone, session, harness. When Ducter
  truly can't go on, the partner asks once, in one line, with the one thing they can do (which
  folder, sign in on that computer), and nothing else.
- **The fresh user** meets this feature only by not meeting it.

## Taxonomy

Five classes, by where the failure happens. Each row says whether a retry is safe (nothing went
out yet), which rungs apply, and who acts at each.

| Class | Failures | Idempotent? | Rungs |
|---|---|---|---|
| **Start** (never ran) | no folder; no copy of the repository; a clone that failed; git busy (a lock); the computer away or the wrong one; its agent missing or signed out (D363); its limit out (D297) | Yes: nothing ran, nothing went out | retry, repair, rethink, ask. **Built** (limit: D297's own) |
| **Mid-run** (it ran) | the agent's process gone (crash, restart); a stuck loop; context overflow (compaction failed); tool errors; a phone or computer that went away (D293's grace); a network blip; the limit mid-turn (D297) | **No**: it may have sent, posted or paid; never resend a turn blindly | resume from the session or checkpoint (built: recovery, principle 13); hand over (D297, D446); the stall rule's nudge then **rethink** (built, D473); ask |
| **Finish** | claims done but isn't (D450's checks, `done?`'s ref check) | n/a | the task sent back by the partner (built); asked when it needs judgment |
| **Partner** | its turn stuck; its harness session gone; the prompt cache expired; a tool call failing; a Bridge or connector error; update all failing; a bad turn (D462's promise-only line) | Its outgoing messages: yes by D106's outbox; its turns: re-run only before anything went out | the turn watchdog (10 min, interrupt); a gone session rebuilt from the Log (principle 1); D435's hold and re-run; D402's back-off and stop for a watched account; D462's settling line. **Counting** is D473's (below) |
| **Data and state** | a Log inconsistency; a duplicate open (D472); a card out of step with the runner | n/a | repaired at the source (D472); invariants checked by the soak (`packages/soak`) |

Outward actions are never in a retry: D61's floor and D106's write-ahead outbox hold for every
rung. A rung that would repeat a send is not a rung.

## The ladder

Cheapest first; each rung is one `mend` event on the task's stream, logged before it is tried
(the write-ahead record), so a crash mid-rung never repeats it and `ducter repairs` can count it.

1. **Retry** (start class only): the same start again, fresh, after a short wait: 5 s for "went
   wrong as it started", 30 s for a busy repository, 60 s for a computer that went away. The
   place is asked again (D395's 再试一次), so a computer that came back or another that has the
   code is found.
2. **Prepare the place**, the way the card's buttons would: fetch the code where the work was put
   (拉一份到这里, when the task recorded which repository: its clone, its to-do, its
   `place.remote`), clear the lock git left (清掉旧的再试, only while no git runs), then the
   retry. **Never a move by Ducter alone (D477):** a copy on another computer (在 X 上做) is a fact
   in the hand-over and a button on the card, not a rung; the person's recorded word on where
   (`task_open.bound`) holds every rung. Not by Ducter alone either: an agent that can't start
   (its program or sign-in: the partner picks another agent; signing in is the person's, D363), a
   clone that failed, a folder that isn't there with no repository recorded (which repository a
   folder name means is the partner's judgment from [devices], never a name match in code).
3. **Rethink** (the partner): a typed hand-over with the cause, the computer, the path, what was
   tried, what is still possible, and the facts (D477: the agent and where it ran, how long it
   ran, the tool calls that ended, its last words, the person's recorded word on where). The
   partner judges what code doesn't: the repository the person meant, another agent, another
   computer the person allows. It opens the work again with `replaces` (which carries the person's
   word) on a repository (`place.remote`, never a guessed path) or another agent or computer, and
   Ducter sets the task that couldn't start aside (superseded) so On hand keeps no failure that was
   mended. A stall comes here directly with the same facts, never classified by a threshold: the
   partner judges whether it did the work and only didn't report, stopped partway, or never really
   started, and sends one clear next step, switches its agent, or opens it again; it never asks the
   task to redo anything outward.
4. **Ask the person, once** (the partner): the second time a task comes back, or when no other
   way can work: one short line in their language, the one real fix as the choice. No error
   text, no list of what failed.

**Budgets and loop guards** (code, `mend.ts`): two automatic tries per task a day, never the same
one twice; six on the whole home an hour, past which a failure goes straight to the partner
(`budget`); two hand-overs per task a day, then the card and the partner's one question stand;
nothing at all while the person is on that task (they wrote to it or tapped a fix in the last 10
minutes); nothing for a task opened more than a day ago (a restart failing an old task again is left to its card). An errand D372 retries on the smartest is left to D372.

## Silence and telling

| Rung | The person sees | Where |
|---|---|---|
| A retry or repair that works | Nothing. One quiet line in the task's steps, never an error: **第一次没开起来，我又开了一次 / It didn't start the first time, so I started it again** · **{computer} 上还没有这份代码，我先拉一份再开始 / {computer} didn't have the code yet, so I'm cloning it there first** · **改到 {computer} 上开始，那里有这份代码 / Starting on {computer} instead, which has the code** · **清掉 git 留下的锁，再开一次 / Cleared the lock git left behind and started again** | the opened task's steps (full depth, on demand) |
| Handed to the partner | Nothing yet; the steps say **这样开不起来，我换个办法 / That way didn't work, so I'm finding another** (a stall: **它停下了，没说做得怎样，我来看看怎么接着做 / It stopped without saying how it went, so I'm working out how to carry on**) | the steps |
| The partner found another way | Its ack for the new task, if any (and D395's clone line); the old task is gone from On hand | the conversation |
| The partner asks | One line with the fix: an interruption, so it is rare by construction (D453): it spends attention only when no rung could | the conversation; the brief's 等你 (D467) |

The card's 没能开始 and its buttons (D395, D415) remain the truth while a task is failed; a
mend that lands within the push batch is never pushed (D372's note). A failure the partner
couldn't fix is a 等你 in the brief, with the partner's fix as the button (D467's grammar).

## The partner's own robustness

- **Its reply is never lost or doubled**: D106's outbox (pending, sending, sent) for every
  outgoing operation; D470 shows one line per delivered reply.
- **A stuck turn**: the turn watchdog interrupts after 10 minutes of silence; the message waits
  for the next turn. **Its session gone**: a stream that ends with nothing drops and rebuilds the
  session from the Log (principle 1: sessions are caches). **Its agent failing the turn**: D435
  holds it, runs it again at the reset or on another agent.
- **Cache expiry** is not a failure: principle 4's re-cut.
- **It hears its own tasks' failures**: a task that never started, or stopped without a report,
  reaches it as a typed hand-over (D473) instead of waiting for the person to ask.
- **Owed** (todo): a partner turn that times out is not yet re-run by itself; a watchdog for the
  partner's process as a whole (outside the turn) is the supervisor's (launchd, systemd).

## Observability for the builder

`ducter repairs [--weeks N] [--json]` (D473, `packages/core/src/mend-week.ts`) counts from the
Log, per UTC week: failures by class (couldn't start, stalled); how each ended (Ducter mended it
by itself, the partner found another way, it reached the person: they wrote, tapped a fix, or it
is still failed); hand-overs and the guard's holds; each repair tried and how often it worked;
start failures by cause. On the home of research/205, before D473: 3 failures, 0 mended, 3
reached the person. The line to watch: the share mended without the person, week over week.
