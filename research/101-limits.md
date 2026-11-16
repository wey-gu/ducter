# 101 · When an agent's usage limit runs out: what each agent says, and when it resets

Feeds D297. Question: when a task's agent hits its plan's usage limit, can Ducter tell reliably
that it was a limit (not an outage), and when the limit resets, for Claude Code, Codex, pi and
DeepSeek Harness, through OAR 0.95.1? Read in OAR's shipped source (`@botiverse/oar` 0.95.1,
`dist/runtimes/*/failure.js`, `dist/shared/failure-class.js`, `dist/contracts/failure.d.ts`), in
the Codex source (a fresh shallow clone of `openai/codex` at `0d07dae`, 2026-11-16, read only),
and in the strings of the local Claude Code 2.1.325 binary. No limit was triggered on a real
account and no model was called: every shape below is from source or schema, not from a live hit.

## 1. What OAR gives every host

OAR classifies a failed turn without the host parsing prose (`FailedTurn`, `failure.d.ts`):
`quota` is "a usage or plan limit, until it resets", `rate_limited` is short-term throttling, and
only `quota` may carry `resetsAt`, "where the runtime reports that time … never derived from an
account-usage read or the runtime's prose", possibly already past. `failureAdvice` says `quota` is
`retry: "later"`. OAR never continues a session on its own (DOCUMENTED, `failure.d.ts`).

## 2. Per agent

| Agent | How the limit shows | The reset | Status |
|---|---|---|---|
| Claude Code | A `rate_limit_event` with `rate_limit_info.status: "rejected"`, `resetsAt` (unix s), `rateLimitType` (`five_hour`, `seven_day`, `seven_day_opus`, …), `overageStatus`, sent before the refused request's error frame and the result; then the turn's error frame with category `rate_limit`. OAR (`claudeFailure`) makes it `quota` with `resetsAt` when the latest event names a reset and paid overage isn't taking the requests; a 429 with no limit headers is `rate_limited`, no reset | OAR's `resetsAt`; else the event itself (Ducter reads it, D288); else the words | VERIFIED in OAR's source and the 2.1.325 SDK schema (research/94); the live order of frames is OAR's own claim ("from the SDK types and the binary only") — INFERRED for Ducter |
| Claude Code, its words | `You've hit your ${limit}${suffix}` in the binary, the suffix carrying ` · resets ${time}` (e.g. "resets 3am (Asia/Shanghai)"); older builds said `Claude AI usage limit reached|<unix s>` | the time and zone in the words | the template is VERIFIED in the binary's strings; the exact filled text is INFERRED (no live hit) |
| Codex | Before failing, core calls `update_rate_limits` with the error's own snapshot (`session/turn.rs`), which the app-server sends as `account/rateLimits/updated` (`bespoke_event_handling.rs`): `rateLimits { limitId, primary/secondary { usedPercent, windowDurationMins, resetsAt (unix s) }, planType, rateLimitReachedType }`. Then the turn fails with `codexErrorInfo: "usageLimitExceeded"`, which OAR (`codexFailure`) makes `quota` **without** `resetsAt`. A usage limit and an exhausted credit balance are the same `usageLimitExceeded` | the used-up window's `resetsAt` from that update; else the words | DOCUMENTED (Codex source at `0d07dae`); the update's arrival before the turn's end over the app-server is INFERRED from the code path |
| Codex, its words | `UsageLimitReachedError`'s Display (`protocol/src/error.rs`): "You’ve hit your usage limit. … try again at 3:12 PM." the same day, else "…at Nov 18th, 2026 3:12 PM.", in the codex process's local time; "Try again later." with no reset | parsed in the home's local time | DOCUMENTED (`retry_suffix`, `format_retry_timestamp`, `error_tests.rs`) |
| pi | `piFailure`: an HTTP status and the provider's JSON body; `usage_limit_reached`, `insufficient_quota`, `organization_usage_limit_exceeded`, `usage_not_included` are `quota`, a 429 without such a code `rate_limited` | none | DOCUMENTED in OAR's source |
| DeepSeek Harness | `dshFailureClass`: an `LlmFailure` code `ACCOUNT_QUOTA` or `QUOTA` is `quota`, `RATE_LIMIT` is `rate_limited` | none | DOCUMENTED in OAR's source |

An exhausted pay-per-use balance is usually `billing` (Anthropic "credit balance is too low",
HTTP 402), not a limit; waiting never fixes it, so D297 leaves it a failure (INFERRED: a pi key
out of credits that the provider words as `insufficient_quota` reads as `quota`, and will only
ever be tried again hourly for a day).

## 3. Resuming after the reset

Claude Code resumes a session by id (`--resume`), Codex by `thread/resume`; both are what D282
already uses for an in-task model change, and both keep every word of the session (research/92).
A home restart keeps the session id in the Log (each `session started` line), so a wait that
outlives the home resumes the same session (VERIFIED in Ducter's runner tests with fake
runtimes; not on a real account).

## Implications for Ducter

1. Detect in the runner from OAR's class (`quota`, `rate_limited`), never from prose alone; read
   the reset best first: OAR's `resetsAt`, then the used-up window the session itself said
   (Claude Code's `rate_limit_event`, Codex's `account/rateLimits/updated`), then the agent's words,
   else unknown.
2. Unknown resets (pi, DeepSeek Harness, a throttle): try again on a schedule, cheaply (a refused
   turn fails fast), and say it once only when nobody else can take the task.
3. One account, one reset: tasks on the same agent share it.
4. The wait is the task's own timer (D267), so it survives a restart and wakes the same session.
5. Upstream (todo): ask OAR to carry Codex's reset on the `quota` failure (it has the snapshot) and
   to surface `rate_limit_event` as an event.

**Summary:** OAR already tells a limit from an outage for every agent (`quota`). Only Claude Code's
failure carries its reset; Codex sends it one frame earlier, in the rate-limit snapshot, and in its
words; pi and DeepSeek Harness never say. Verified in source and schema, not on a live hit.
