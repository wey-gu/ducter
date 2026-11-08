# 11 — Context management as a working set: state of the art, consensus, hard constraints

Date: 2026-11-08. Question: the main AI runs inside an off-the-shelf harness session (a cache over the Log, principle 1).
It sometimes does bulky reads (Focus Window transcripts, channel slices) through tool results (principle 3). We want to
manage its context as a **working set**: keep the stable prefix warm, and fold or evict bulky reads at the tail once the
topic moves on. There are two candidate operations:
**(a) tail-fold**: branch off, read, return to the branch point, append only the conclusion.
**(b) tail-rewrite**: replace big tool results in place with a compact summary.

Versions: Claude Code 2.1.319 (native binary; evidence comes from `strings` on the binary and from session JSONL on this
machine), claude-agent-sdk-python @2209f2c, openai/codex @748ab55 (2026-11-08), pi-mono @e49b149 (2026-11-08),
xai-org/grok-build @2bdd1d6 (== remote HEAD), openclaw @3a25991 (local copy from today; remote has moved one commit),
deepseek-harness @fcc0ad4 (== remote HEAD). Repo root `R/` = `<scratch>/repos/`.
I read code but ran none of it.

Tags: **[V]** verified (I read the source, binary strings, or a local file), **[D]** documented (official docs; URL given),
**[I]** inferred. This builds on `01` (OpenClaw/grok-build cache boundaries), `03` (harness surfaces and cache experiments),
and `06` (subagent handoff), and does not repeat them.

---

## 0. Answer in one screen

- **Consensus.** Prefix stability matters more than anything else. Clear tool results first, because that is the lightest
  intervention. Rewrite only when the cache is already cold, or when you save enough tokens to pay for the new cache write.
  Generate summaries cache-aligned (same prefix plus one appended instruction). Keep the recent tail and the user's words
  verbatim. Persist whatever projection you send so that replays are byte-identical. Isolate bulky reads in a
  side context that returns 1–2k tokens.
- **The new hard constraint (Claude 5.1+, "preserved thinking").** Every thinking block is bound to the exact
  `system` + `tools` + all messages before it. Clearing or shortening an earlier `tool_result` **invalidates every later
  thinking block** in the conversation. Depending on account age and settings, the result is either a 400 error or the
  blocks get dropped, the cache restarts at the edit, and output tokens go up. Removing messages **from the end** is valid,
  and so is appending. So on Anthropic models, (b) as a literal in-place edit is the wrong primitive. **(b) has to be
  implemented as (a)**: truncate to before the read, then append a compact replacement.
  [D platform.claude.com/docs/en/build-with-claude/preserved-thinking]
- **Per harness, today:**

| | (a) tail-fold | (b) tail-rewrite in place | Cost of the right way |
|---|---|---|---|
| **Claude Code** | **Yes.** Between turns: `--resume <sid> --resume-session-at <uuid-before-read>` plus an appended conclusion. Or run the read in a *fork* (shares the parent cache) | Only by editing the JSONL. That restarts the cache at the edit and invalidates later thinking (Claude Code then retries with *all* thinking stripped) | (a): about one cache read of P+T, plus a write for the conclusion. The bulky read's cache write is wasted |
| **Codex** | **Yes.** `thread/sample` (one response on an ephemeral fork with the same cache key) or a prediction-mode `thread/fork`, then `thread/inject_items` the conclusion. Or `thread/revert{beforeTurnId}` + `inject_items` | **No API.** Emulate with revert + re-inject at turn granularity. Rollout surgery is possible but fragile | (a): warm prefix on the fork via the inherited `prompt_cache_key` [V]; the parent only appends. Revert warmth is [I] |
| **pi** | **Native.** `/tree` `navigateTree` → `branch_summary` entry. Ducter can supply the summary itself through `session_before_tree` | **Native and durable.** `context_edit` entries (append-only log, `replacement` or `null`), plus per-call `context` hooks | (a): free if Ducter supplies the summary; otherwise one cold summarizer call (pi disables cache writes for it). (b): cache miss from the edited entry; pi sends `drop_block` so stale thinking is dropped |

- **What this means for Ducter.** Shape tool results **before the first send** (bounded, with a pointer to unfold). This is
  the only form of (b) that costs nothing on every provider. Then make "read → conclusion" a **side-context operation**
  whose only effect on the main session is an appended conclusion. Do folds only at turn boundaries, never inside a tool
  loop. When the cache is cold, skip folding and re-cut (principle 4). A re-cut is exactly Anthropic's recommended
  "simple compaction" pattern, which leaves no stale thinking behind.

---

## 1. Claude Code

### 1.1 Auto-compaction, `/compact`, and what survives
- **Thresholds.** Configurable via the `/autocompact <N>` command (saved per model in `modelSettings`) and the env vars
  `CLAUDE_CODE_AUTO_COMPACT_WINDOW`, `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`, `CLAUDE_CODE_MAX_CONTEXT_TOKENS`,
  `DISABLE_AUTO_COMPACT`, and `DISABLE_COMPACT` (the last also disables manual `/compact`). Further settings:
  `autoCompactEnabled`, `precomputeCompactionEnabled` ("Precompute the compaction summary in the background before it is
  needed"), `idleCompaction`, `CLAUDE_CODE_IDLE_COMPACT_MIN_TOKENS` [V binary strings; D code.claude.com/docs/en/model-config].
  Current models default to a 1M window. Haiku 5.5 "auto-compact[s] at about 967K tokens" [D]. A local main session
  compacted at `preTokens: 967182 → postTokens: 9832` and again at `968046 → 10489` [V
  `~/.claude/projects/<project>/<session>.jsonl:5894,12954`].
  *That trigger is far above Ducter's 128–256K budget. Ducter must set `CLAUDE_CODE_AUTO_COMPACT_WINDOW` per window.*
- **What survives** [D code.claude.com/docs/en/context-window]: the system prompt and output style still apply. The
  project-root CLAUDE.md, auto memory, skill descriptions, the plan, and a fresh git snapshot are re-injected from disk.
  Up to **5 recently modified files are re-read** (a file over 5k tokens comes back as a `Referenced file` path).
  Invoked skill bodies come back, capped at 5k tokens each and 25k total. Running background tasks are reminded.
  `SessionStart` hooks with source `compact` run. **Hook-added context is summarized away.**
- **Cache behaviour** [D code.claude.com/docs/en/prompt-caching]: compaction "invalidates the conversation layer". The
  system prompt stays cached. Project context stays cached only if it is unchanged on disk. The summarization request
  "repeats your conversation's system prompt, tools, and the history being summarized. It ends with a summarization
  instruction", so while the cache is warm it is mostly cache reads. The Claude Code engineering blog says the same:
  "exact same system prompt, user context, system context, and tool definitions … append the compaction prompt as a new
  user message … The only new tokens are the compaction prompt itself" [D claude.dev/blog/lessons-from-building-claude-code-prompt-caching-is-everything].
  Cold `/compact` on an old session is the most expensive case. **Idle compaction** may compact a long conversation that
  sits idle on the 1h TTL (`idleCompaction: false` disables it) [D].
- **Partial compaction** [D code.claude.com/docs/en/checkpointing]: `/rewind` → **"Summarize from here"** compresses
  the conversation *from the selected point forward* and keeps everything before it intact. That is exactly (a), but
  it is offered as an interactive menu action. **"Summarize up to here"** is the opposite. The originals stay in the
  transcript. There is no documented SDK or `-p` entry point, although `summarizeMetadata` exists in the SDK types [V strings].

### 1.2 Microcompact and tool-result clearing (undocumented internals) [V binary strings, 2.1.319]
- **Client-side keep-recent microcompact.** This is triggered by a server "context_hint" (also used as a 400 recovery
  path, `retry:context-hint`). It replaces older tool-result contents with the constant
  `hCe="[Old tool result content cleared]"`, **persists the cleared content** (`await r.persist?.(z.content,
  tool_use_id)`), keeps the last N, logs `[KEEP-RECENT MC] … cleared ${n} tool results (~${tokens} tokens)`, and writes
  a `microcompact_boundary` system record into the transcript.
- **Server-side clearing after idle.** Claude Code emits
  `{type:"clear_tool_uses_20250919", trigger:{type:"tool_uses",…}, keep:{type:"tool_uses",…}, clear_at_least:{…},
  exclude_tools}` with defaults `{minIdleSeconds:3900, keepToolUses:12, clearAtLeastTokens:20000,
  minTriggerToolUses:27}`, behind the flag `tengu_jiggly_blossom` (`off|on|shadow`). **3900 s = 65 min, just past the 1h
  TTL**: it clears only when the cache is already cold. This is the same idea as OpenClaw's `cache-ttl` mode (§5.2). The set
  of clearable tools is a fixed set of built-ins (`_Ce`, which includes `mcp__container__*` aliases). *Ducter's own MCP
  tool results are probably not eligible* [I].
- When thinking is on, it always sends `{type:"clear_thinking_20251015", keep:"all"}` first, so prior thinking is never
  cleared server-side [V].
- **Thinking binding.** Claude Code sends the beta `thinking-binding-controls-2026-08-01` with
  `block_binding.prefix_mismatch_behavior` set from a flag. If the server rejects a thinking block, it logs "stripping
  all thinking blocks and retrying" (`retry:thinking-signature-strip`) [V]. So an externally edited JSONL degrades to
  "all reasoning lost" rather than failing [I from the code path].

### 1.3 Session JSONL compaction boundary and resume [V]
- The boundary record is `{"parentUuid":null, "logicalParentUuid":"<old leaf>", "type":"system",
  "subtype":"compact_boundary", "compactMetadata":{trigger, preTokens, postTokens, cumulativeDroppedTokens, durationMs,
  preCompactDiscoveredTools, preservedSegment:{headUuid, anchorUuid, tailUuid}, preservedMessages:{…uuids},
  runningTurnSends}}`. It is followed by a user message with `isCompactSummary:true` that begins "This session is being
  continued from a previous conversation that ran out of context…". **`preservedSegment` = a verbatim recent tail kept
  after the summary** (keep-tail compaction).
- **Resume** walks `parentUuid` back from the leaf. `parentUuid:null` at the boundary cuts the chain, so only the
  post-boundary context loads. The SDK deliberately does not follow `logicalParentUuid` (`sdkpy/src/claude_agent_sdk/_internal/sessions.py:940`).
  `fork_session` remaps `logicalParentUuid` (`_internal/session_mutations.py:423`).
- **Truncating resume.** SDK `resume_session_at` (`--resume-session-at=<uuid>`) loads only up to that entry.
  `resume_drops_turn` makes the CLI *validate* that everything after the cut belongs to the turn being dropped, and
  refuses otherwise (for example, when a queued message was absorbed mid-turn) (`sdkpy/…/types.py:2622-2655`). This
  primitive is what makes (a) safe in Claude Code.
- **Exposure.** The Agent SDK exposes compaction only through `PreCompact` hooks, `get_context_usage`
  (`autoCompactThreshold`, `isAutoCompactEnabled`), and the settings above. **No `context_management` / context-editing
  option exists in the SDK or CLI** (grep of sdkpy for it found nothing) [V]. Ducter cannot add API context edits to
  Claude Code requests. A rewriting `ANTHROPIC_BASE_URL` proxy would technically work, but on subscription OAuth it
  conflicts with "unmodified official binary" (principle 15) [I].

### 1.4 Cache rules that matter for folding [D code.claude.com/docs/en/prompt-caching]
- "**Rewinding truncates back to a prefix that is already cached** … the next request hits the earlier cache entry.
  Every turn since then has read through that prefix, which kept the entry warm even if the original turn was longer ago
  than the TTL." → (a) by truncation is warm.
- "A fork … inherits the parent's system prompt, tools, and conversation history exactly, so its first request reads the
  parent's cache." Subagents/forks/compaction requests get the **5-minute TTL bucket** by default (the main conversation
  gets 1h on a subscription); `CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL`.
- `/recap` *appends* its summary as output, so the cache stays intact. Skills, plan mode, and output-style changes are
  appended as messages.
- Image eviction: removing old images "reprocesses the conversation from the earliest of those messages onward", done in
  batches so it happens once per batch. This is Claude Code's own instance of (b), and it is paid for in exactly this way.

---

## 2. Anthropic API: context editing, compaction, memory, thinking

### 2.1 Context editing (beta `context-management-2025-06-27`) [D platform.claude.com/docs/en/build-with-claude/context-editing]
- `clear_tool_uses_20250919`: `trigger` (default 100k input tokens; or `tool_uses`), `keep` (default 3 tool uses),
  `clear_at_least`, `exclude_tools`, `clear_tool_inputs` (default false). `clear_thinking_20251015`: `keep`
  (`{type:"thinking_turns",value:N}` or `"all"`; must be listed first). The response carries `context_management.applied_edits`
  (with `cleared_input_tokens`). `count_tokens` reports `original_input_tokens`.
- "Applied server-side … **Your client application maintains the full, unmodified conversation history.**"
- Cache: tool clearing "invalidates cached prompt prefixes when content is cleared … clear enough tokens to make the cache
  invalidation worthwhile … You'll incur cache write costs each time content is cleared, but subsequent requests can reuse
  the newly cached prefix." Thinking clearing: kept = cache preserved; cleared = "invalidated at the point where clearing
  occurs".
- Thinking: "On Claude 5.1+ … **server-side context management never invalidates thinking blocks. Client-side edits to
  earlier turns can invalidate the thinking blocks in every later assistant turn.**"
- Memory tool `memory_20250818` + clearing: "Claude receives an automatic warning to preserve important information" before
  results are cleared. This is the restorable-compression hook. In Ducter, the Log plays the role of memory.

### 2.2 Server compaction [D platform.claude.com/docs/en/build-with-claude/compaction]
There are three modes. **On-demand** (`compact-2026-09-04`, top-level `compaction`; the returned block goes first in
`messages`; it supports keep-recent-turns and **background** generation, and kept turns keep their thinking). **Threshold**
(`compact_20260112` in `context_management.edits`; runs inside the request; the API drops everything before the block;
re-inserted turns must have their thinking stripped, or you use `drop_block`). **Your own summarizer.** SDK
`compaction_control` is deprecated.

### 2.3 Thinking-block constraints (the binding ones) [D platform.claude.com/docs/en/build-with-claude/thinking, …/preserved-thinking]
1. **Within a tool-use turn**: "pass the thinking blocks from the assistant message back … complete and unmodified". Within
   the latest assistant message, consecutive thinking blocks "can't [be] rearrange[d], edit[ed], or partially drop[ped]"
   (this includes `redacted_thinking`). Violations produce a 400. ⇒ **Never fold mid tool loop.**
2. **Preservation by model**: Opus 4.5+, Sonnet 4.6+, Haiku 5.5, and the Fable/Mythos models *keep all prior turns'*
   thinking in context and bill it as input. Older models strip it. Outside tool use, "omit prior turns' thinking" is allowed.
3. **Prefix check (Claude 5.1+)**: a block is valid only while `system`, `tools`, and *every message before it* are
   unchanged. Valid: appending; **removing thinking from the start, from the end, or entirely**; server-side edits; changing
   non-prefix params. **Invalid for every later block**: clearing/shortening an earlier `tool_result`, re-encoding an
   image, changing an earlier `tool_use` input, re-rendering the first user message, any system or tool change, removing a
   middle thinking block, or putting a removed block back.
4. **Mismatch behaviour** (beta `thinking-binding-controls-2026-08-01`): `"error"` → 400; `"drop_block"` → drop the failing
   block and all later ones, "the prompt cache restarts at the edit", reported in `input_transformations`. When unset,
   accounts created on or after 2026-08-31 get a 400 on Fable 5.1 / Opus 5.5 / Sonnet 5.5 / Haiku 5.5. Older accounts
   pass the stale blocks through. Dropping "can significantly increase output tokens … A one-time drop … at a
   client-side compaction boundary costs little. A drop on every turn costs more."
5. The docs' replacement table: shorten a tool result **before the first send**, and clear later only server-side; use
   mid-conversation system messages, `tool_addition`/`tool_removal`, per-message `output_config`. "Simple compaction"
   (summary as one user message, no replay) is valid. **Keep-tail compaction with your own summary makes the kept turns'
   thinking fail** (fix: `drop_block`, or let the API write the summary).
6. Signatures are opaque encrypted full reasoning. With `display:"omitted"` (the default on 5.x) the field is empty, and a
   serializer that skips empty blocks silently drops all reasoning. Thinking from Sonnet 5.5 and Haiku 5.5 is
   **account-bound**: it is dropped silently in another account. Thinking config and effort are rendered into the prompt, so
   changing them breaks the cache. Claude Code says effort changes keep the cache on the 5.5 models through per-message
   effort [D Claude Code prompt-caching].
7. **Interleaved thinking**: automatic with adaptive thinking. Reasoning between tool calls lives in thinking blocks that
   belong to the same assistant turn, so the whole multi-call turn is one unit for rules 1 and 3.

**Consequence for synthesis.** Synthesized assistant turns *without* thinking are fine: there is nothing to check. Replayed
turns *with* thinking are valid only if every byte before them is identical. A re-cut with a new prefix must strip
thinking from all replayed turns (the model re-derives the reasoning, at some output-token cost) [I from 3–5].

---

## 3. Codex

### 3.1 Compaction [V `R/codex/codex-rs`]
- **Trigger**: `auto_compact_token_limit() = min(config, 90% of context window)` (`protocol/src/openai_models.rs:579-590`).
  It also accepts `model_auto_compact_token_limit_scope` (full context vs. tokens after the carried prefix),
  `model_post_turn_compact_threshold_percent` (turn-end compaction), and `async_compaction_threshold_percent` (background)
  (`core/src/config/mod.rs:668-680`).
- **Provider choice** (`core/src/session/turn.rs:1722-1785`): with `RemoteCompactionSupport::V2`, remote compaction is used;
  otherwise compaction is local.
  - **Remote v2** is an ordinary streamed Responses request on the **same client session, the same tools, and the same base
    instructions** (`compact_remote_v2_attempt.rs:180-197`), so it is cache-aligned. It must return **exactly one
    `ResponseItem::Compaction{encrypted_content}`** (`compact_remote_v2.rs:391-487`; `protocol/src/models.rs:1313`). The new
    history keeps user messages, optionally client-authored developer messages, and retained client tool outputs, all
    within `RETAINED_MESSAGE_TOKEN_BUDGET = 64_000`, followed by the opaque checkpoint (`compact_remote_v2.rs:93,497-614`).
    Agent messages are kept at ≤10k tokens each (`compact_pending_input.rs:10`). The old `/responses/compact` endpoint no
    longer appears in core. **The summary is encrypted: Ducter can neither read nor author it.**
  - **Local**: a summarization prompt, then initial context + the most recent user messages up to
    `COMPACT_USER_MESSAGE_MAX_TOKENS = 20_000` + the summary (`compact.rs:64,732-800`).
  - **Async/background compaction**: a speculative request whose validity is keyed by
    `{history_version, model_slug, compaction_hash, auth_owner}`. Any history edit invalidates it
    (`session/async_compaction.rs:1-40`). This is the same pattern as grok-build's prefix fingerprint.
- Reasoning: Codex replays `encrypted_content` reasoning items. Compaction drops them all, since only user messages and
  the checkpoint are retained. You cannot author or edit them; you can only drop them. Mid-history removal semantics for
  OpenAI reasoning items are not documented in the repo [I].

### 3.2 History-edit surface over app-server [V `app-server-protocol/src/protocol/v2/`]
- `thread/inject_items{items: raw Responses items}`: appends to model-visible history without a turn (`thread.rs:1803`).
- `thread/revert{beforeTurnId}`: "Replace a paginated thread's durable history with the prefix before one turn". It does
  not touch files (`thread.rs:1319-1325`). `thread/rollback` is gone.
- `thread/fork{lastTurnId | beforeTurnId, ephemeral, experimentalPredictionMode}`. Prediction mode: "Start from the loaded
  parent's effective config, tools, environments, and persisted history **to maximize prompt-cache reuse**. Requires
  `ephemeral: true` … Cannot be combined with `path`, `lastTurnId`, or `beforeTurnId`" (`thread.rs:544-570`). The server
  comment reads "Runtime retention does not change the inherited prompt or cache key"
  (`app-server/src/request_processors/thread_processor.rs:5410-5427`).
- **`thread/sample{threadId, expectedTurnId, prompt, effort?}`**: "One model response on an ephemeral fork that inherits
  the source's configuration and context". It returns `{text, input_tokens, cached_input_tokens, output_tokens}`, gives
  null text if the model tries a tool, and leaves the parent untouched (`thread_sample.rs:1-50`). **This is a
  cache-preserving side query**: the Codex counterpart of grok-build's `/btw`.
- `thread/compact/start{threadId}` takes no instructions (`thread.rs:1207`). There is **no in-place item replacement
  API** [V method list]. Cache affinity follows `PromptCacheKey::SessionDerived` (the session id, or
  `"{source}:{parent_thread_id}"` for internal sources) (`core/src/client.rs:712-735`). Subagents inherit the parent's
  policy (`codex_delegate.rs:109`).

---

## 4. pi (pi-mono coding-agent) [V `R/pi-mono/packages/coding-agent`]

- **Compaction**: the trigger is `contextTokens > contextWindow − reserveTokens` with defaults `{reserveTokens:16384,
  keepRecentTokens:20000}` (`src/core/compaction/compaction.ts:126-129,267-269`). The cut point walks back about 20k tokens
  and may split a turn (`isSplitTurn`, summarizing the prefix of the turn) (`:412-500`). It summarizes iteratively with
  `<previous-summary>` (`:696-757`). The summarizer **serializes the conversation to text in a separate context**, and
  "Summarization requests disable prompt-cache writes" (`docs/compaction.md:23`). *That design is the opposite of
  Claude Code, Codex, and grok-build, which reuse the prefix.* It appends `CompactionEntry{summary, firstKeptEntryId}`.
- **Session tree and branch summarization**: `navigateTree` (`src/core/agent-session.ts:4126-4310`) finds the common
  ancestor, collects old-leaf→ancestor entries (`branch-summarization.ts:115-152`), budgets newest-first to
  `contextWindow − 16384` (`:203-260,307-330`), and asks for a fixed format (Goal / Constraints / Progress / Key Decisions
  / Next Steps; `:272-299`). The summary is prefixed with "The user explored a different conversation branch before
  returning here" (`:267`). `SessionManager.branchWithSummary()` moves the leaf to the branch point and appends a
  `branch_summary` entry as its child (`src/core/session-manager.ts:1611-1636`). **This is (a), built in.**
- **`context_edit`**: an "append-only change to one earlier entry's contribution to model context". `replacement` either
  replaces the content (same role and metadata) or is `null` (omit) (`session-manager.ts:168-180,1371-1408`). The
  projection applies the latest edit per target (`:554-575`). It is branch-local and must target the active branch. **This
  is (b) as a durable, replayable log operation**, the closest match anywhere to Ducter's projection model (principle 2).
- **Extension hooks** (`docs/extensions.md`): `session_before_compact` (cancel, or return your own
  `{summary, firstKeptEntryId}`; `:534-570`); `session_before_tree` (cancel, or **supply the branch summary yourself**;
  `:575-597`); `turn_end` boundary drafts that may append `context_edit` / `custom_message` / `compaction` entries and
  force one `continue` (`:715-746`); `context` (per-call message rewrite, non-destructive; pi re-adds the prompt and tools
  head; an unchanged list keeps mid-conversation system messages "so models that accept them retain their cached prefix";
  `:815-827`); `context_with_system` (own the whole request; `:829-850`); `before_provider_request` (replace the payload;
  `:864`); `cache_warming_decision` (`:912`).
- **Anthropic thinking in pi**: managed-effort models are sent `thinking:{type:"adaptive",
  block_binding:{prefix_mismatch_behavior:"drop_block"}}` with a fixed top-level effort ("part of the cached prompt") and
  per-message effort markers (`packages/ai/src/api/anthropic-messages.ts:1538-1552`). Unsigned thinking is converted to
  text (`:1713-1740`). So `context_edit` on a Claude 5.1+ model does not error: it drops the stale reasoning after the edit [V].
- Caveat (from `03`): pi's Anthropic OAuth path impersonates Claude Code, so it is usable for Ducter only with API keys or
  other providers.

---

## 5. Other harnesses

### 5.1 grok-build [V `R/grok-build/crates/codegen`]
- **Prefire two-pass compaction**: pass 1 runs in the background and summarizes about 95% of history (by estimated tokens)
  into NOTE₁. Pass 2 runs blocking and rewrites NOTE₁ plus the ~5% tail; the tail is kept small because "prod pass2
  latency is dominated by tail prefill" (`xai-grok-shell/src/session/two_pass.rs:1-19`). NOTE₁ validity depends on a
  prefix fingerprint: "A mismatch means the prefix changed (edit / rewind / branch)" (`session/compaction.rs:69-72`).
- **Cache-aligned summarizer**: "keep tool I/O + images so the prefix matches the engine cache; set `strip_reasoning` when
  the provider rejects mutated thinking blocks" (`xai-chat-state/src/compaction_utils.rs:131-142`).
- **Side calls** (`/btw`, recap, title) reuse the parent's exact prefix (same tools, same effort, reasoning preserved,
  tools attached but never executed) (`01` §2b, `side_call.rs:104-133`). Post-compaction state rehydration
  (`compaction_context.rs`).

### 5.2 OpenClaw [V `R/openclaw/docs/concepts/session-pruning.md`]
- On direct Anthropic routes, OpenClaw sends server-side `clear_tool_uses_20250919` with derived parameters
  `trigger=max(50k, 30% window)`, `keep=3`, `clear_at_least=max(12.5k, 5% window)`, `clear_tool_inputs=false`. "Clearing
  invalidates the prompt cache from the first cleared result; `clear_at_least` prevents a clearing event that would remove
  too few tokens to justify the new cache write" (`:36-60`).
- On other routes it prunes client-side in `cache-ttl` mode: "Before the TTL elapses, no new pruning occurs. Existing
  projections still replay unchanged". It soft-trims, then hard-clears to `[Old tool result content cleared]` once usage
  is ≥50% and ≥50k chars are prunable. Each change is recorded as a **session projection** (delta-logged, checkpointed,
  restored on restart) so that "follow-up requests reuse the same projected bytes" (`:73-92`). It never prunes the last 3
  assistant turns or anything before the first user message (`:100`). Images are not age-cleaned, because replacing them
  discards the cache (`:106-110`).

### 5.3 DeepSeek harness [V `R/deepseek-harness/docs/architecture.md:126-132`]
"**Model-visible means logged.** Every model request must be reconstructable from the log." `deriveMessages()` projects
model history from the session log. Plugins that change message content register *pure message projections*. Compaction
is an event family (`compaction/start|summary|prune|end`, persistence catalog). This is the same stance as Ducter's
principle 2, applied inside one harness.

### 5.4 Not verified
I did not verify the Gemini CLI or OpenCode compaction internals in this pass, since neither repo is cloned and the
OpenCode source path returned a 404. They are left out rather than reported from memory.

---

## 6. Published lessons (the consensus sources)
- **Manus** (manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus) [D]: "the KV-cache hit rate is
  the single most important metric for a production-stage AI agent". Input:output ≈ 100:1. No timestamp at the top of
  the prompt. "Make your context append-only". Deterministic serialization. Explicit breakpoints. **Mask tools instead of
  removing them** (logit masking, prefill). The file system as context with **restorable compression** ("the content of a
  web page can be dropped … as long as the URL is preserved"). Recitation via todo.md. "Leave the wrong turns in the
  context".
- **Anthropic, "Effective context engineering"** [D anthropic.com/engineering/effective-context-engineering-for-ai-agents]:
  context rot and the attention budget; "the smallest possible set of high-signal tokens". "One of the safest lightest
  touch forms of compaction is tool result clearing". Structured note-taking outside the window. Sub-agents return "a
  condensed, distilled summary … (often 1,000–2,000 tokens)". Lightweight identifiers loaded just in time.
- **Claude Code blog** [D, §1.1]: "we build our entire harness around prompt caching". Never change tools or model
  mid-session; plan mode is implemented as tools; deferred tool stubs; `<system-reminder>` in the next message. "We alert
  on cache breaks and treat them as incidents".
- **Cognition** (see `06` §1.8): share full traces when the work is shared; writes single-threaded; clean-context
  reviewers. This tension is relevant: a fold *discards trace*, so it is safe only when the conclusion is the decision
  that matters.

---

## 7. Synthesis

### 7.1 The consensus playbook (each item has independent support from ≥3 systems)
1. **An append-only, stable prefix; volatile content at the tail.** Manus, the Claude Code blog and docs, grok-build
   (`ProjectInstructions` never replaced), OpenClaw's cache boundary, Codex's `SessionDerived` key, Ducter principle 2.
2. **Shape before you send.** Bound tool outputs and keep a pointer: Manus's URL, Claude Code's `<persisted-output>` and
   `Referenced file`, Anthropic's "shorten … before the first time you send it".
3. **The lightest eviction is tool-result clearing, with a placeholder and the content persisted for restore.** Anthropic
   context editing, Claude Code microcompact (content persisted), OpenClaw hard-clear, pi `context_edit` + `null`.
4. **Only edit when the cache is cold or the saving is large.** OpenClaw `cache-ttl`, Claude Code idle ≥ 3900 s + 20k
   minimum, `clear_at_least` (API and OpenClaw). The cost of an edit is a re-write of everything after it.
5. **Cache-aligned summarization**: same prefix + an appended instruction (Claude Code, Codex remote v2, grok-build).
   **Pi is the dissenter** (cold, separate summarizer).
6. **Prepare compaction in the background, keyed to the prefix**: grok-build's fingerprint, Codex's `history_version`,
   Claude Code's `precomputeCompactionEnabled`, Anthropic's background on-demand compaction.
7. **Keep the user's words and the recent tail verbatim**: Claude Code's `preservedSegment`, Codex user messages
   (20k/64k), OpenClaw's budget (newest ½, user ¼), pi's `keepRecentTokens` 20k.
8. **Persist the projection so replays are byte-identical**: OpenClaw projections, pi `context_edit`, DeepSeek "model-visible
   means logged", Claude Code `microcompact_boundary` / `compact_boundary`.
9. **Isolate bulky reads in a side context that returns a conclusion**: Anthropic (1–2k tokens), Manus, Claude Code docs
   ("Delegate verbose operations"), cache-sharing side calls (grok-build `/btw`, Codex `thread/sample`, Claude Code forks).
10. **Rehydrate live state after a cut**: grok-build reminders, Claude Code re-reading 5 files and re-injecting skills,
    the Codex world-state.

### 7.2 Where they disagree
- **Server-side vs. client-side edits.** Anthropic pushes server-side, which never invalidates thinking and keeps the client
  log intact. Claude Code, OpenClaw, and pi do client-side edits when they have to. Codex goes further and makes the
  summary itself opaque, encrypted, and server-authored.
- **Summary visibility.** Plaintext and editable (Claude Code, pi, local Codex, grok-build) vs. encrypted (Codex remote v2,
  Anthropic compaction blocks are API-owned). For Ducter, an opaque summary cannot become a Log digest, so the summaries
  must be Ducter's own.
- **Keep failures in vs. prune.** Manus keeps wrong turns as evidence. Pruning systems drop them. A fold should keep a
  one-line record of failed attempts [I].
- **When to compact.** Threshold (most), TTL-gated (OpenClaw, Claude Code idle clearing), turn-end (Codex `post_turn`),
  background prefire (grok-build, Codex, Claude Code).
- **Thinking.** Keep-all (newer Anthropic models, Claude Code `clear_thinking keep:"all"`) vs. strip-on-rewrite
  (grok-build `strip_reasoning`, pi `drop_block`, Claude Code's fallback that strips everything).

### 7.3 Hard constraints a Ducter adapter must respect
1. **Fold only at turn boundaries** (after `end_turn`, with no pending `tool_use`). Inside a tool loop, the latest
   assistant message and its thinking must round-trip unmodified (Anthropic). Claude Code's `resume_drops_turn` enforces
   this; Codex revert/fork work at turn granularity; pi's `turn_end` drafts are the sanctioned point.
2. **On Claude 5.1+, never edit before the last kept thinking block.** Truncating from the end and appending are the only
   free operations. A literal (b) costs: re-write from the edit + reasoning lost after it (400 on new accounts unless
   `drop_block`).
3. **(b) is cheap only at the very tail, and there it is the same as (a).** So implement every eviction as "truncate to
   before the read turn + append (user question verbatim + conclusion + pointer)". Mid-history evictions belong to
   re-cuts (principle 4), not to warm sessions.
4. **Fixed tools, model, effort, and thinking config for the life of a cache** (all providers). A fold must never touch
   them.
5. **The cache TTL bucket of the side context**: Claude Code forks use 5 min by default and the main conversation 1h. Codex
   caching is by session key, and the prediction fork and `thread/sample` inherit the key. A side read that runs past its
   TTL loses the shared prefix.
6. **Opaque artifacts cannot be synthesized**: Anthropic signatures (account-bound on Sonnet/Haiku 5.5), Codex
   `encrypted_content` reasoning and compaction items. A history Ducter synthesizes contains only plain messages. Anything
   opaque must come byte-for-byte from the same harness session.
7. **The harness's own compactor must be bounded or disabled for the main AI.** Claude Code
   `CLAUDE_CODE_AUTO_COMPACT_WINDOW` (default ≈967K ≫ budget), `idleCompaction:false` (otherwise idle compaction rewrites
   our cache behind our back), `precomputeCompactionEnabled`. Codex `model_auto_compact_token_limit`. Pi
   `session_before_compact` → return Ducter's digest or cancel. Otherwise the harness's summary competes with the Log's
   digests (principle 2).
8. **Every fold is logged before it is applied.** The conclusion, the pointer, and the truncation point go into the Log
   first. Then the session is a deterministic projection again (principle 2 + DeepSeek/OpenClaw/pi practice), and a lost
   or rebuilt session replays identical bytes.

### 7.4 Per-harness recipe and cost
Let P = the stable prefix, T = the tail before the read, R = the read, C = the conclusion with a pointer. Anthropic prices,
as multiples of base input: cache read 0.1×, 5-min write 1.25×, 1h write 2× [D platform.claude.com/docs/en/about-claude/pricing].

- **Claude Code (a), recommended.** Do the read in a *fork*, so the first request reads P+T from cache at 0.1× and R is
  written once at 1.25× (5m bucket). The main session receives only C as a tool result: C at 2× (1h) plus normal
  growth. The in-harness way is the forked subagent or a `context: fork` skill. The adapter way, between turns, is
  `fork_session` / `--resume … --fork-session`, then the read, then the next turn in the main session with C appended as
  a user turn. **(a) by truncation**, when the read already happened in the main session:
  `--resume <sid> --resume-session-at <last-uuid-before-read> --resume-drops-turn <read-prompt-uuid>` (restarts the CLI,
  ~0.23 s), then the next prompt carries C. The prefix is warm per the rewind docs. Cost: R's earlier cache write is
  sunk; the new cost is only C. **(b)**: rewrite the JSONL at the read's position. Everything after it is re-written,
  later thinking is lost (Claude Code strips all thinking and retries), and you depend on undocumented record formats. Do
  not do this.
- **Codex (a), recommended.** Ducter fetches the slice itself (no inference), then calls `thread/sample{prompt: slice +
  question}`: one response on an ephemeral fork with the parent's cache key, so P+T is cached
  (`cached_input_tokens` reports it) and no tools run. Then `thread/inject_items` C into the main thread: append only,
  cache warm. If the read needs tools, use a prediction-mode `thread/fork{ephemeral:true}` instead. **(a) by
  truncation**: `thread/revert{beforeTurnId: read turn}` + `inject_items` [user question + C]. The retained prefix is
  byte-identical under the same session key, so it should be warm [I, untested]. The reverted turn's encrypted reasoning
  is gone, which is acceptable. **(b)**: not available. Rollout-file surgery on an unloaded thread is possible but the
  format churns (see `03` §3.3).
- **pi (a).** Run the read on a branch, then `navigateTree` back to the branch point. Return C from `session_before_tree`,
  so no summarizer call is needed. Pi then appends a `branch_summary`, the prefix is unchanged, and the cache is warm.
  With pi's default summarizer, add one cold call over R (cache writes disabled). **(b)**: `context_edit{targetId,
  replacement:{content:C}}`, as a `turn_end` draft or through the SDK. The cache misses from the target onward, and on
  Claude 5.1+ the later reasoning is dropped (`drop_block`). Use it only for the last turn, or when the cache is cold.

### 7.5 Recommended Ducter mechanism (draft for principles 2–4)
- **"Read-fold" as one control-plane operation**: `pull(question, source) → side context (cache-sharing fork / thread/sample
  / pi branch) → conclusion C (≤ ~1–2k tokens) + pointer → logged as an event → appended to the main session`. The main
  session never sees R. This turns principle 3 ("only the conclusion goes into the spine") into a mechanism, and it costs
  one warm side request.
- **Folding inline reads**: if a turn ended with a bulky inline read and the cache is warm, truncate + append (Claude Code
  `resume_session_at`, Codex `revert`, pi `navigateTree`). Never edit mid-history while warm. Mid-history evictions wait
  for the next cold re-cut, which rebuilds from digests with no thinking replayed (the "simple compaction" pattern;
  principle 4).
- **Declare it as adapter capabilities** (principle 13): `fold.side_query` (Codex `thread/sample`; Claude Code fork; pi
  branch), `fold.truncate` (all three), `fold.inplace` (pi only), `thinking.binding` (Anthropic 5.1+), `compactor.control`
  (per harness).

---

## 8. Open questions / to test
1. Claude Code: does `--resume-session-at` + `--fork-session` give cache_read ≈ P+T on the first request, given that the
   date/env attachments are appended? `03` measured warm resume, but not truncation.
2. Codex: are `thread/revert` and `thread/sample` warm in practice (`cached_input_tokens`)? Does `revert` require a
   "paginated" thread (`historyMode`)?
3. Claude Code: are Ducter MCP tool results ever cleared by microcompact or idle clearing (the `_Ce` membership)?
4. On this account, is `prefix_mismatch_behavior` unset → 400 or pass-through (it depends on account creation date)?
5. What does a fold lose in quality? (Cognition: actions carry implicit decisions.) Measure answer-consistency after
   folds vs. after keeping R.

## Sources
Official: platform.claude.com/docs/en/build-with-claude/{context-editing, compaction, thinking, extended-thinking,
preserved-thinking}; code.claude.com/docs/en/{prompt-caching, context-window, costs, model-config, checkpointing};
claude.dev/blog/lessons-from-building-claude-code-prompt-caching-is-everything; anthropic.com/engineering/effective-context-engineering-for-ai-agents;
manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus. Source: paths given inline under `R/`. Binary:
`~/.local/share/claude/versions/2.1.319` (strings dump at `…/scratchpad/cc-strings.txt`).
