# 139 · The second Bridge live trial on nmem 0.10.120: a guard too strict, and a mailbox Mem must sort out

> 2026-11-18. Public. Evidence for D369 (the next free number on this branch; it may be renumbered at
> merge). Follows research/137 (the first run; D367 read every inbox page and put the trial's peer behind
> a guard). The coordinator ran `NMEM_CLI_PATH=<scratch nmem 0.10.120> bun run bridge:live -- --connected
> --real` on main at 14:41 UTC, haiku on both sides, as the trial's own identity
> `ducter-trial-202611181441-4af9`. This report reads its transcript and its 30 recorded nmem calls (in
> the evidence folder, outside git: `live-2026-11-18T14-41-24-620Z-trial-haiku.md` and
> `raw-2026-11-18T14-41-24-620Z/`). Nothing was run against Mem for this report.
>
> Tags: **VERIFIED** read in the recorded calls or run here · **DOCUMENTED** from Nowledge's own help ·
> **INFERRED** my reading.

## 1. The result

Every scenario failed before any message got through: S1 0/4, S2 0/5, S3 1/3,
X1 0/3. Nothing went from the peer to Ducter and nothing from Ducter reached the peer. Two causes, one ours
and one Mem's. VERIFIED (transcript).

## 2. Ours: the guard refused the right send

| Fact | Tag |
|---|---|
| `bridge contacts --query ducter-trial-…` as the peer's context returned exactly one card, `agent_id` the trial's, with Mem's own `send_args_prefix`: `nmem --api-url=… --agent-context=<peer ctx> bridge --resolved-space-id=<Only me> send --to=bc1:…` (008, 011, 022). | VERIFIED |
| The peer sent with that prefix, so its argv used `--agent-context=<ctx>`. The guard looked only for `--agent-context <ctx>` (two words), found none, and asked `contacts` with no context (012, 023). Mem answered `selection_needed` ("Bridge talks inside one Space. Choose it"), no cards, so the guard refused the send (`trial_guard_refused`) twice, in S1 and X1. | VERIFIED |
| Once (010) the guard's `contacts` met Mem's 503 `feature_policy_unavailable` (`retryable: true`), which the guard also read as "no cards". | VERIFIED |

**Fix (D369):** the guard reads a flag in both forms (`--flag value`, `--flag=value`), asks `contacts` as
the context the send names (or `NMEM_AGENT_CONTEXT`), and asks again up to three times when Mem's side
doesn't answer. Unit tests replay the real shapes (008, 010, 012): the right card passes as the peer's
own context, any other card is refused with nothing sent, a busy first answer is asked again.

## 3. Mem's: the peer's mailbox "requires reconciliation"

| Fact | Tag |
|---|---|
| From its second inbox read on (014, 015, 019, 020, 025, 026), the peer's own mailbox (the author's native Claude Code session in Only me) answered exit 1 with `{stage: "upstream", upstream: {error_code: "cloud_mailbox_own_source_unreconciled", detail: "Mailbox source authority requires reconciliation before browsing.", retryable: false, outcome_unknown: true, http_status: 409}, operation: null, detail: "The IM operation could not be confirmed. …"}`. | VERIFIED |
| The trial's own mailbox (a fresh identity) read fine throughout (007, 009, 013, 021, 024). | VERIFIED |
| In the first run (research/137, 10:59 UTC) the same peer mailbox read fine (20 a page). Between the runs the peer had opened 20 older messages and answered one; whether that, or something on Mem's side, put the mailbox in this state is unknown. | VERIFIED (both runs), INFERRED (the cause) |
| `nmem bridge --help` (0.10.119 here; 0.10.120 per the coordinator) has no reconcile command. | DOCUMENTED |
| `outcome_unknown: true` on a read is Mem's generic envelope ("could not be confirmed"); a read changes nothing, so "unknown" says nothing useful here. | INFERRED |

**What Ducter did with it (before D369):** the check's failure reading took `outcome_unknown: true` first and
called it "Nowledge Mem didn't say whether it went out", a sender's sentence on a read; the check stayed
silent and ran again every minute (the read isn't retried within a check, since `retryable: false`).
Settings showed nothing. VERIFIED (code).

**Fix (D369):**
- A read that Mem answers with `cloud_mailbox_*_unreconciled` (not retryable) is `stuck`, with Mem's code,
  read before the "outcome unknown" rule. Never retried inside the check.
- The partner tells Settings once (and clears it after the next read that works); the regular check slows
  to every 30 minutes while it lasts. 查看来信 still reads at once, and the partner says it as Mem's state in
  one line.
- Settings › 和你的其他 agent 通信 / Talk with your other agents, connected: one quiet line, nothing to tap:
  **Nowledge Mem 那边暂时读不了 {name} 的来信** / **Nowledge Mem can't let {name} read its messages for now**,
  **Mem 说这个信箱要先在它那边理顺，这边没有要做的。理顺以后，{name} 会自己接着读。（{code}）** / **Mem says
  this mailbox needs sorting out on its side; there's nothing to do here. {name} picks up again by itself
  once it is. ({code})**. Web and Mac.
- The trial binds the peer's native session and reads its inbox once (read-only) **before** making the
  trial's identity; a mailbox Mem must sort out stops the run there, with one line naming Mem's code.

## 4. Implications for Ducter

1. The peer guard must read argv the way Mem's own `send_args_prefix` writes it; a guard that refuses the
   right send makes the trial measure nothing. Its tests now use the recorded shapes.
2. A read error is not a send error: Mem's generic `outcome_unknown: true` must not be told to anyone as
   "may have gone out" when nothing was sent.
3. A non-retryable mailbox state is the person's to know about, once, in Settings, and costs one read per
   30 minutes, not one a minute.
4. The rerun is blocked on Mem until the author's Claude Code mailbox reads again; the preflight now says so
   before anything is made.
5. **B19 for Nowledge** (draft, not posted): `cloud_mailbox_own_source_unreconciled` on `bridge inbox` for a
   native Claude Code session's mailbox, 409, not retryable, request ids `01a1ef1c-e03e-7790-…` and
   `01a1ef1d-…` (in the raw files), with no command in nmem 0.10.120 to reconcile. Asks: what puts a mailbox
   in this state (it read fine four hours earlier, after which its owner opened 20 older messages and
   replied to one), how a person gets out of it (a `bridge … reconcile`, or Mem doing it by itself), and
   `outcome_unknown: false` on reads, which change nothing.

## Summary

The second live run on nmem 0.10.120 passed nothing that needed a message: the trial's own peer guard
refused the right send (it read `--agent-context <ctx>` but Mem's send prefix writes `--agent-context=<ctx>`,
so it asked contacts with no context and Mem asked for a Space), and the author's native Claude Code mailbox
answered every read 409 `cloud_mailbox_own_source_unreconciled`, not retryable, with no reconcile command in
the CLI. D369 fixes the guard (both flag forms, the send's own context, three tries) with tests on the real
shapes; makes Ducter's reader call that state "stuck" with Mem's code, never "may have gone out", say it once
in Settings and check only every 30 minutes while it lasts; and makes the trial read the peer's mailbox
before it makes anything. B19 to Nowledge is drafted.
