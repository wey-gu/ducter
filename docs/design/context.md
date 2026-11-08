# Main AI Context: Log, Projection, Resume, Working Set

> Design note for principles 1, 2, 4, 5 · Evidence: `research/03`, `11`, `12`, `13`.
> Memory (digest, window, recall) lives in `memory.md`.

## Log contents (principle 1)

- **Channel events**: user messages, main AI messages, job/window lifecycle, typed reports,
  folds, superseding edits, intents, waiter firings. Every event carries its origin.
- **Threads**: OAR's normalized event stream for each Focus Window, mirrored by the runner so
  a thread stays readable while its machine sleeps. Raw harness logs are never mirrored.
  - Text and tool-call metadata go in inline.
  - A tool output over the threshold goes in as a preview in the Log, plus a compressed,
    content-addressed blob in R2/S3/disk. A repeated read is stored once.
  - Retention follows the window: once a window is archived its blobs age out. Text and
    conclusions are kept forever. The harness's own log on its machine is the last-resort
    source.
  - Each window has a storage budget; going over raises a warning.
- **Main AI's own reads**: logged and marked foldable, so they never reach digests.
- **Write coalescing**: events are batched before they are written. The Cloudflare free tier
  allows ~100k rows/day.

## Projection layers (principle 2)

| Layer | Content | Changes |
|---|---|---|
| L0 | harness base + the Ducter tool server | per release; never while the cache is live |
| L1 | stable identity sections from Mem | only at cut points |
| L2 | spine (see `memory.md`) | append-only between cuts |
| L3 | bounded excerpt | ephemeral, rare |
| L4 | this turn's deltas: new events, recall, Working Memory, status, time | every turn |

- The spine is rendered as a few large blocks. Cache lookback counts blocks: in [13], a fold
  15 turns deep missed the cache. The mechanism is inferred and still needs testing.
- Harness-injected volatile context (cwd, date, account) is pinned where possible, using one
  fixed working directory per persona. The date rollover counts as a natural cut. Determinism
  covers the bytes Ducter controls.

## Resume vs. re-cut (principle 4)

- Estimate P(warm) from the last request time, the TTL, and harness signals (Claude Code
  statusline `prompt_cache.warm` / `expires_at`).
- Choose by expected cost: resume, where only the delta is paid on a hit, against re-cut,
  which writes the rebuilt prefix. When P(warm) is unknown, use the time-based estimate rather
  than a fixed "resume" default ([12]: resuming loses once history ≥2× the rebuild unless
  P(warm) ≥ 78–95%).
- On prefix caches, re-cut even while warm once history is several times the rebuild size
  (~3× pays back in 1–5 turns) and L0–L1 are byte-identical.
- On thread caches (Codex), warmth lives in the thread, so prefer continuing it. A re-cut
  there costs the whole prefix.
- Tools, model, effort, and thinking settings change only at a cut.
- A re-cut reads as an ongoing conversation: background blocks, then the real message. It
  never carries a reset notice. Raft found such a notice made 13 of 13 sessions open by
  rebuilding state.

## Working set and folds (principle 5)

Folding is mostly about quality, not price: cache reads cost 0.05× on Opus/Sonnet 5.5, and
finished topics distract every later turn. Options, in order of preference:

1. **Cap at ingress.** Every read result is bounded before it enters.
2. **Read-fold.** Bulky reads run in a side context that shares the cache, and only a
   conclusion of ≤2K plus a pointer comes back.
   - Claude Code: fork. `--resume <sid> --resume-session-at <uuid> --fork-session` was
     measured to keep the spine warm.
   - Codex: `thread/sample`, then `thread/inject_items` (documented, not yet measured).
   - pi: a `/tree` branch whose summary Ducter supplies.
3. **Late fold.** If a read did land in the main session, fold it within a turn or two:
   truncate to before it, then append the conclusion. Measured: about 480 tokens re-written,
   with the spine still fully cached. Never edit in place: Anthropic's preserved thinking
   (5.1+) invalidates every later thinking block once earlier content changes.
4. **Deep eviction.** Anything older waits for the next re-cut.

**Constraints:**
- Fold only between turns, never inside a tool loop.
- Log every fold before applying it.
- Never synthesize opaque artifacts (thinking signatures, encrypted reasoning).
- Codex ephemeral threads can't fork or revert, so there the options are keep or
  `thread/sample`.
- Each harness's own compactor is bounded to Ducter's budget. Claude Code defaults to about
  967K and also compacts on idle; both must be configured off or down.
