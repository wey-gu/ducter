# 13 — Tail-fold experiments (Claude Code, Codex)

Date: 2026-11-08. Claude Code CLI 2.1.319, `--model haiku` (request records show `claude-haiku-5-5`), subscription
OAuth. Codex CLI 0.167.0 `app-server`, model `gpt-6-luna`. Builds on [3] §2.2–2.4 and §3.3–3.5.

Question: can the main AI **fold** a bulky read at the tail of a warm session (replace it with a short summary, or
branch back to before it and continue with only a conclusion) **without losing the warm prefix cache**? This is what
principle 3 ("only the conclusion goes into the spine") and principle 4 ("never compact a warm session") need from the
adapter.

Tags: **[V]** measured here · **[I]** inferred.

## Setup

- Fixed cwd `.../scratchpad/exp3/work` for every call. Flags: `-p --model haiku --system-prompt-file sp.txt --tools Read
  --allowedTools Read --strict-mcp-config --setting-sources "" --output-format stream-json --verbose`. Usage is
  recorded per API call (assistant `message.usage`, deduplicated by message id).
- **Spine**: a synthesized session JSONL with 6 user/assistant pairs (frozen "digests", each with a codeword
  `SPINE-k k 7`). That gives **25.5K tokens** after a 3.6K system prefix.
- **Read**: `big.txt`, 221 lines, **16.8K tokens** as a `Read` tool_result. One meaningful line: port 48213, owner
  Marisol.
- **Fold summary**: about 100 tokens, marked `[FOLDED READ]`, with a pointer for re-reading the file.
- Scripts are in `<scratch>`:
  `fold_gen.py` (spine JSONL + file), `fold_run.py` (one call + usage), `fold_rewrite.py` (copy to a new session id
  with `fold`, `branch <uuid>`, `fold_tamper_sig`, `fold_drop_thinking`), `fold_deep.py` (fold + N later pairs),
  `codex_fold.py`, `codex_recut.py`. Raw stream outputs are in `.../scratchpad/exp3/out/`.
- Cleanup: the only Claude project dir created (`~/.claude/projects/-private-tmp-...-scratchpad-exp3-work`) was
  deleted. Codex threads were `ephemeral: true`, and no rollout containing the marker was found. No user config or
  session was touched.

## Results — Claude Code [V]

| Call | What | input | cache_read | cache_creation | Notes |
|---|---|---|---|---|---|
| C1 | resume synthesized spine, "ready" | 2 | 3,583 | 25,497 | system prefix was already warm; spine written |
| C2.1 | read turn: model emits `Read` tool_use | 2 | 28,696 | 454 | |
| C2.2 | same turn after tool_result | 2 | 29,150 | 16,773 | the read is 16.8K |
| C3 | **control**: continue unfolded session | 2 | 45,923 | 302 | every later turn carries 46.2K |
| **C4** | **E2 tail rewrite**: tool_result → summary (copy, new sid), resume | 2 | **29,125** | **478** | spine hit; answer correct |
| C5 | next turn on the folded session | 2 | 29,603 | 155 | steady state 29.8K/turn (−16.4K) |
| **C6** | **E3 branch**: synthesized JSONL truncated before the read turn; conclusion in the new user msg | 2 | **28,696** | **497** | answer correct |
| **C7** | **E3 official**: `--resume <sid> --resume-session-at <full-uuid> --fork-session` + conclusion | 2 | **28,696** | **493** | same as C6, no file writing; an 8-char uuid prefix is rejected ("No message found") |
| C8 | **E4**: fold + **tampered** thinking signature | 2 | 29,150 | 454 | **accepted, no error** |
| C9 | **E4**: fold + thinking block **removed** (chain re-linked) | 2 | 29,604 | **0** | byte-equivalent to C4 → full hit |
| C10 | fold, with 4 later user/assistant pairs after the read | 2 | 29,125 | 582 | still hits |
| **C11** | fold, with **15** later pairs after the read | 2 | **3,583** | **26,410** | **miss**: only the system prefix hits; the spine is rewritten |

(An earlier oversized run with a 53.6K spine was discarded and is not in the table.)

### Findings

1. **A tail fold keeps the cache warm [V].** Rewriting the tool_result in the session JSONL (both
   `message.content[0].content` and `toolUseResult.file.content`, with uuid/parentUuid and tool_use/tool_result
   pairing kept) and resuming the copy re-created only **478 tokens**. Everything up to the read was a cache hit.
   Every later turn is 16.4K tokens smaller (C3 46.2K vs C5 29.8K). Copies that kept CC's own
   `api-request*`/`prompt_snapshot` records resumed without complaint [V].
2. **Branch-and-return works the same way, and the official CLI path works [V].** Both a synthesized truncation (C6)
   and `--resume-session-at <full uuid> --fork-session` (C7) cost about 495 tokens of creation, hitting the spine
   entry written at C2.1. C7 needs no JSONL surgery and leaves the original session intact. It is the cleanest
   primitive for "do the read in a side branch, come back with the conclusion".
3. **The fold must be shallow [V threshold, I mechanism].** Claude Code puts a breakpoint only on the system blocks
   and the **last** message ([3] §2.4). A folded prefix hits only if an earlier request wrote a cache entry that ends
   at or before the fold point *and* lies within the API's automatic lookback window. The Anthropic docs describe
   that window as about 20 content blocks [I]. With 4 later pairs (C10) it hit. With 15 pairs (C11) it fell back to
   system-only and **re-wrote 26.4K**. So fold in the same turn as the read, or the next one. A deep fold costs as
   much as a re-cut and should follow principle 4's cold-path rule.
4. **Thinking blocks do not block a rewrite [V], with limits.** CC 2.1.319 sends `thinking: {type: adaptive,
   display: updates}` with `clear_thinking_20251015 keep: all`. The stored thinking block has empty text plus a
   signature. The read session already had one (after the tool_result), so E4 was tested with no extra setup. All
   three variants were accepted: fold with the block intact (C4), with its signature tampered (C8), or with the block
   removed (C9). Total input was identical in each case (29,605 / 29,606 / 29,606), so a prior-turn thinking block
   adds about 0 input tokens [V], meaning it is stripped server-side [I]. Removing it gave a byte-equivalent prompt
   (0 creation). Tampering did not error, but it changed the cache key (454 re-created) [V]. **Untested**: altering
   thinking inside an *unfinished* tool loop (assistant thinking+tool_use awaiting its tool_result), where the API
   requires the block to be preserved. Expect a signature error there [I], so never fold inside an open tool loop.
5. A ~25-token gap (29,125 vs the 29,150 entry) shows on fold hits. It is probably a per-request reminder attachment
   that differs [I]. It doesn't matter in practice.

### Economics [I, from the numbers above and standard cache pricing]
At 1h TTL a cache write costs about 2× base input and a read about 0.1×. The fold costs ~480 write tokens once
(≈ 960 base-equivalent). It saves ~16.4K read tokens on every later turn (≈ 1,640 base-equivalent per turn) and
16.4K of context budget. It pays for itself on the first later turn, and the attention benefit comes on top.

## Results — Codex app-server (E5) [V]

| Run | inputTokens | cachedInputTokens | Notes |
|---|---|---|---|
| X1 thread A (ephemeral) + injected 13K spine, "ready" | 36,391 | 3,328 | ~22K of harness context + spine |
| X2 same thread, read (~7K) in the user turn | 43,735 | 36,224 | continuing the thread is warm |
| `thread/fork{lastTurnId: X1}` on A | — | — | error: `no rollout found for thread id …` |
| `thread/revert{beforeTurnId: X2}` on A | — | — | error: `ephemeral threads do not support thread/revert` |
| X3 fresh ephemeral thread, re-injected the identical spine + conclusion pair | 36,453 | 3,328 | **cross-thread miss**: spine not reused |

So, on Codex, fold (revert + inject summary) and branch (fork at a turn) are **unavailable on ephemeral threads**
[V]. The ephemeral re-cut workaround misses the cache [V], which is consistent with cache affinity keyed on the
thread's session id ([3] §3.5). **Untested** (it would write rollouts under `~/.codex/sessions`): `thread/revert` +
`inject_items` on a persisted thread. The id stays the same there, so it may stay warm [I]. `thread/fork` creates a new
id and is likely cold [I].

## Conclusions for the adapter

1. **Add a `fold(at, replacement)` capability with a cost model.** On Claude Code the cost is
   `cache_creation ≈ tokens after the fold point`, provided the fold point is within ~20 content blocks of the tail
   (measured: OK at ≈10 blocks, miss at ≈30). Otherwise it costs a full re-cut. Declare it as `foldWarm: shallow` for
   Claude Code and `foldWarm: none` for Codex ephemeral (`unknown` for persisted, pending a test).
2. **Prefer branch-and-return over in-place rewrite on Claude Code.** Use
   `--resume <main> --resume-session-at <uuid-before-read> --fork-session` and put the conclusion in the next user
   message (L4). This uses only official flags, keeps the original session as a recoverable record, and costs the same
   (~500 tokens). Use JSONL rewrite only when the read must stay as a stub in place, for example to keep the tool_use
   pairing visible. Always pass full uuids.
3. **Fold promptly.** Fold in the same main turn as the read, or the next one. If the bulky content is already deep,
   don't fold a warm session. Wait for the cold path (principle 4) and re-cut from a clean point.
4. **Rewrite rules.** Keep the uuid chain and the tool_use↔tool_result pairing, replacing content rather than
   removing it. Rewrite both `message.content` and `toolUseResult`. Mark the stub `[FOLDED READ]` with a pointer for
   re-reading. Never fold inside an open tool loop. Prior-turn thinking blocks may be dropped (byte-neutral), but never
   edited.
5. **Better still, avoid folding.** Principle 3's ladder puts bulky reads in a Focus Window or a bounded tool result.
   The fold measured here is the fallback for when the main AI read something big itself.
6. **Canary test** (add next to [3]'s): synthesize spine → read → fold → assert `cache_read ≥ spine` and
   `cache_creation < 1K`. This catches changes to CLI breakpoint placement or the lookback window.

[3]: research/03-harness-control-surfaces.md
