# 94. Context, compaction and account limits: what each agent reports, what OAR keeps

Date: 2026-11-16. Question (the author, on the context card in the author's current coding-agent
app: a ring by the composer opens "Context 438.8k/475.0k", a bar, "Window used 92.4%", input,
cached input and output, then the provider's usage, "7d limit 60% left" with its reset, the plan
and the account): "展示 context window 等等的，我们也得有设计，还有 claude code/codex 等 harness 自身
自动 compact 的机制，还有手动 compaction 的设计，也看看 oar 怎么抽象的，我们应该设计成如何".

Tags: VERIFIED (read in shipped code or a shipped binary's own schema here, or run here),
DOCUMENTED (the vendor's text or OAR's own comments), INFERRED (reasoned, not run).

Builds: Claude Code 2.1.325, codex-cli 0.169.0 (its app-server binary), pi 1.5.x through OAR's
bundled RPC, `@botiverse/oar` 0.95.1 (in `node_modules`). No model was called and no session of
the person's was touched: binaries were read with `grep -a` on their own schemas, never run for
this note (the live runs behind D135 and D282 are research/11 and research/92).

## 1. What each agent reports

| | Claude Code (stream-json) | Codex (app-server) | pi (RPC through OAR) |
|---|---|---|---|
| Context held now | each root `assistant` frame's `message.usage`: input + cache read + cache creation = what that call sent (OAR `claudeContextSent`, VERIFIED in `runtimes/claude/context-usage.js`) | `thread/tokenUsage/updated` → `tokenUsage.last.totalTokens` (the last call's input incl. cached + its output; the TUI's own reading), VERIFIED `runtimes/codex/token-usage.js` | `get_session_stats` context, read at `agent_settled` (after any threshold compaction), VERIFIED `runtimes/pi/projection.js` comment; INFERRED live |
| Window | `result.modelUsage[model].contextWindow` (200000 with `CLAUDE_CODE_DISABLE_1M_CONTEXT=1`, D135) | `tokenUsage.modelContextWindow` (the `-c model_context_window` Ducter sets) | pi's model catalog window |
| Running spend | `result.modelUsage` (subagents, sidechains and compaction included) | `tokenUsage.total` (cumulative over the thread's life; less the resume baseline) | per `message_end` usage, summed |
| Per turn | not reported; the difference of the running totals | not reported; the same difference | the same |
| Auto-compaction point | `min(floor((W − min(maxOut, 20K)) × pct), W − 33K)` with `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`; 167K default on 200K (harness-facts, VERIFIED on 2.1.319) | `model_auto_compact_token_limit`, clamped to 90% of the window (INFERRED from codex-rs) | `W − compaction.reserveTokens` (16K), settings.json only (DOCUMENTED) |
| Compaction events | `system/compact_boundary` after it is done: `compact_metadata { trigger: manual \| auto, pre_tokens, post_tokens?, cumulative_dropped_tokens?, duration_ms? }` (VERIFIED: the 2.1.325 binary's SDK schema); no start event | `item/started` + `item/completed` of a `contextCompaction` item (VERIFIED `runtimes/codex/projection.js`); no sizes; legacy `thread/compacted` | `compaction_start` / `compaction_end { reason, aborted, errorMessage, result.tokensBefore }` (INFERRED from pi's CompactionResult; OAR reads reason/aborted/errorMessage) |
| Before / after compaction hooks | `PreCompact` (stdout appended to compact instructions; exit 2 blocks); Ducter's task note (D135) | `PreCompact` / `PostCompact` hooks, `compact_prompt` | extension `session_before_compact` |
| Manual compaction | `/compact [instructions]` runs headless (research/92 §4) | `thread/compact/start { threadId }` (VERIFIED in the binary's method list; app-server takes no slash commands) | `AgentSession.compact()` |
| Account limits, on demand | `get_usage` control request (OAR runs `claude --safe-mode` so no hooks or MCP servers start): `rate_limits.{five_hour, seven_day, seven_day_oauth_apps, model_scoped[]}` with `utilization` 0..100 and `resets_at`, `subscription_type`, `extra_usage` | `account/rateLimits/read`: `rateLimits` + `rateLimitsByLimitId`, each `{ primary, secondary: { usedPercent, windowDurationMins, resetsAt } , planType, rateLimitReachedType }`, `rateLimitResetCredits` | none |
| Account limits, live | `rate_limit_event { rate_limit_info: { status: allowed \| allowed_warning \| rejected, resetsAt (unix s), rateLimitType: five_hour \| seven_day \| seven_day_opus \| seven_day_sonnet \| …, utilization?, overageStatus?, unifiedWindows? } }` whenever its view of the limits changes (VERIFIED: the 2.1.325 schema; OAR comment) | `account/rateLimits/updated` notification (VERIFIED: the method name in the 0.169.0 binary; its params INFERRED to be the read's `rateLimits` bucket, as the TUI merges both) | none |

DeepSeek Harness: context and compaction events reach Ducter through OAR (research/50 §3); no
manual compaction declared by OAR and no account reader.

## 2. What OAR 0.95.1 abstracts, and what it drops

Kept (VERIFIED, `dist/contracts`):

- `usage` events: `UsageReport { context?: { tokens, contextWindow, percent }, tokens?, total? }`;
  `Session.contextUsage()` and `Session.usage()` folds (`tokens` null right after a compaction).
- `compaction_started` / `compaction_ended { outcome, trigger?, reason? }`.
- `Session.compact()` (manual compaction) on claude (via its builtin `/compact`, refused unless
  the command catalog confirms the builtin, and only idle: "a queued /compact can be reinterpreted
  as a project or user command"), codex (`thread/compact/start`) and pi; each declares
  `manualCompaction: { kind: "supported", activeTurn: "reject" }`. DeepSeek Harness declares none.
- `Runtime.accountUsage(installation)` on claude and codex: `AccountUsageSnapshot { plan, email,
  displayName, rateLimited, windows: [{ label, usedRatio, resetsAt, id, durationMs }],
  limitResets }`; `redeemLimitReset` on codex (spends the owner's reset: never automatic).
- `contextBreakdown()` (claude's `/context` categories).
- A failure's `quota` class with `resetsAt` when Claude Code's latest `rate_limit_event` said so.

Dropped (each still in the record's `native`, which Ducter can read through `Session.records()` /
`rawEvents`):

- Claude Code's `compact_metadata.pre_tokens` / `post_tokens` (OAR keeps `trigger` only).
- pi's `result.tokensBefore`.
- Claude Code's `rate_limit_event` as an event (it only feeds the failure class).
- Codex's `account/rateLimits/updated` (no event; the read is the only way).
- Per-turn usage (only running totals).

## 3. How Ducter's small window and checkpoints meet auto-compaction (D135, as built)

Every task runs on 200K with a standard-window model; the agent compacts at 160K (Claude Code
`CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`, Codex `model_auto_compact_token_limit`; pi and DeepSeek
Harness keep their own points). At 140K (`saveBeforeAt`) the runner asks once for a `checkpoint`;
Claude Code's `PreCompact` hook adds compact instructions (keep the ask, the latest checkpoint,
files and commits, the next step); after `compaction_ended` the brief and the latest checkpoint go
back in. Idle compaction and precomputed compaction are off on Claude Code (`--settings`), so a
compaction only ever happens mid-work, near the point, or when asked. A manual compaction takes
the same after-path (it is a `compaction_ended` like any other), so "Compact now" never loses the
brief.

## 4. Where a person's limits can be read

Claude Code: only by a control query on a process of its own (`get_usage`), or as they change in
a running session (`rate_limit_event`). The live event's `utilization` scale is not documented;
only `status`, `resetsAt` and `rateLimitType` are certain, so Ducter reads a limit hit from it and
takes the numbers from the read. Codex: the read, and live updates. pi and DeepSeek Harness: none
(their providers bill per token; nothing to show). A worker's agents read on the worker (not
built: the card shows the home's own read).

## Implications for Ducter

1. Read the context from OAR's `usage` events (window included) and log it as it moves, so a task
   that spends an hour in one turn still has a live meter; per-turn tokens are the running totals'
   difference, computed where the session is known (the normalizer).
2. Read a compaction's sizes from the native frame where they exist (Claude Code, pi) and from the
   readings around it elsewhere (before: the last reading; after: the first one after).
3. Compact now = the agent's own: Claude Code's `/compact` as typed (custom instructions work);
   OAR's `Session.compact()` for Codex and pi, deferred to the end of a running turn (every
   runtime refuses mid-turn).
4. Account limits from OAR's `accountUsage` on demand (cached, since Claude Code starts a process),
   merged with what sessions say live; never redeem a reset automatically.
5. Ask OAR upstream for: compaction sizes on `compaction_ended`, `rate_limit` events, and a Codex
   rate-limit update event (todo).

Summary: all three agents report the context and its window well enough for a live meter; only
Claude Code reports a compaction's sizes, and only Claude Code and Codex report account limits.
OAR keeps the context, compaction events, manual compaction and an account read; it drops the
sizes and the live limit updates, which Ducter reads from the native frames. Feeds D288.
