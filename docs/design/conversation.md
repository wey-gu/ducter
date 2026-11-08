# Conversation Surface: Jobs and the Living Message

> Design note for principles 6, 7 · Evidence: `research/16`, `research/01`.

## Turn protocol (principle 6)

The human sees one conversation: text now, voice later. Focus Windows are hidden unless the
human opens them.

1. **Ack.** It names the *action* ("I'll check the CI"), never the outcome. OpenAI documents
   that models invent results for calls still pending.
2. **Job.** Shown as a status line kept by the control plane. A cheap model may write the
   line. The main AI sees each open job as an explicit pending marker.
3. **Result.** A new message replying to the ask, rendered from the job's typed report.

**Executors.** All three return the same report, so they look the same to the human.

| Executor | Use when (starting budget; logged and tuned) |
|---|---|
| Main AI, in turn | no environment, read-only, ≤3 calls, ~10s |
| Fork (side context sharing the cache) | read-only, ≤ ~2 min |
| Focus Window | needs an environment, writes, runs longer, or will take follow-ups |

- **Promotion.** A fork that outgrows its budget becomes a window seeded with a brief plus
  the fork's checkpoint. The fork itself does not continue, so a long job never carries the
  whole channel.
- **Follow-ups** while a job runs are steered in or queued, and the sender gets a receipt.
  "Never mind" cancels the job.
- **Models.** Text uses one model. Voice adds a realtime front-end limited to an allow-list,
  which escalates to the main AI and logs every utterance (OpenAI's chat-supervisor
  pattern). A fast decision model (e.g. Jev/Kev class) may run the gates: attention tagging,
  the recall precision gate, and the voice escalation gate.

## The living message (principle 7)

| State | Meaning |
|---|---|
| `open` | Unread and always the last message; at most one exists. Revised in place. |
| `seen` | A read receipt arrived. Frozen; anything new starts a fresh message. |
| `superseded` | Replaced by a newer version (a Log event). |

**Content and order**
- Rendered from typed reports, never paraphrased by a model.
- Order: `needs-you` items first, each with its default. Then blocked items with their
  reasons. Then successes, compressed to one line each with evidence links.
- A default applies on its own only if the action is reversible.

**Honesty rules**
- Edits never re-notify.
- An item already shown in a push preview can be marked resolved, but never reworded or
  removed.

**Push**
- Only `needs-you` or urgent items get a push.
- Pushes are coalesced and held while the human is in the app.
- Escalation goes badge → message → push → call. Each level has an explicit trigger.
- The human can say "don't tell me about this kind of thing". That becomes a ledger
  constraint.

**Mechanics**
- Each revision is a superseding Log event.
- In the session, a revision is a tail operation: truncate to before the message, then
  append the new version.
