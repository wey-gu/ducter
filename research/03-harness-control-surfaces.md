# 03 — Harness control surfaces (Claude Code, Codex, pi, DeepSeek)

Date: 2026-11-08. Versions examined: Claude Code CLI 2.1.319 (native binary), claude-agent-sdk-python @2209f2c,
Codex CLI 0.167.0 + openai/codex @748ab55, pi 1.4.0 + badlogic/pi-mono @e49b149 (docs now point at
`earendil-works/pi`, npm `@earendil-works/pi-coding-agent`).

Evidence tags: **[V]** verified by experiment on this machine or read in source; **[D]** documented (official docs /
CLI `--help` / generated protocol schema); **[I]** inferred.

Scratch artifacts: experiment scripts in
`<scratch>`, outputs in
`.../scratchpad/exp/`, generated Codex protocol schema in `.../scratchpad/exp/codexschema/`. Experiment sessions
were written only to new project dirs `~/.claude/projects/-private-tmp-claude-tmp--Users-me-dev-ducter-...-scratchpad-exp{,2}`;
Codex threads were `ephemeral: true`. No user config or existing session was modified.

---

## 0. TL;DR

- **Claude Code is the most constrained but still adequate.** `--system-prompt` replaces everything except a fixed
  62-char SDK identity line [V]; `--tools ""` / `--tools A,B` + `--strict-mcp-config` + `--mcp-config` give full
  toolset control [V]. **A hand-built session JSONL (only user/assistant records with a `parentUuid` chain) resumes
  fine** [V]. Prefix caching across *fresh* sessions with an identical system prompt hits 100% [V]. Live injection via
  `--input-format stream-json` works (queued, delivered at the next turn boundary) and `interrupt` works [V].
  Hard blocker: **subscription OAuth is only for "ordinary use of Claude Code"; third-party apps may not route
  requests through Pro/Max credentials** [D, cite §6]. The only defensible path is a user running the *unmodified*
  `claude` binary under *their own* login, for themselves.
- **Codex app-server is the richest surface.** JSON-RPC with `thread/start{baseInstructions, developerInstructions,
  dynamicTools}`, `thread/inject_items` (raw Responses items into history, no turn) [V], `turn/steer` [V],
  `turn/interrupt`, `thread/fork{lastTurnId}`, `thread/revert{beforeTurnId}`, token usage notifications with
  `cachedInputTokens` [V]. Caveat: Codex adds ~20k tokens of its own context with this user's config, and ChatGPT
  cache affinity is keyed on the thread's session id [V source].
- **pi is a library, not a black box.** Full control of the system prompt (sectioned), tools, the provider payload
  (`before_provider_request`), the context window (`context`/`context_with_system` hooks), session tree, steering,
  and even cache warming. Biggest caveat: its Anthropic-OAuth path impersonates Claude Code ("stealth mode") [V source],
  which falls under the Anthropic prohibition. ChatGPT-OAuth in pi is used openly in practice [D secondary].
- **DeepSeek: no official harness exists** as far as I can find (secondhand reports of a pre-launch product) [D, weak].
  DeepSeek exposes an Anthropic-compatible endpoint, so Claude Code or pi can be pointed at it with an API key [D].

---

## 1. Capability matrix

| Capability | Claude Code (`claude -p` / Agent SDK) | Codex (`app-server`) | pi (SDK / `--mode rpc`) | DeepSeek |
|---|---|---|---|---|
| Replace system prompt | Yes: `--system-prompt[-file]`; fixed SDK identity line stays as system[0] [V] | Yes: `baseInstructions` (+ `developerInstructions`) per thread [V] | Yes, fully: `--system-prompt`, sections, `before_agent_start`, payload rewrite [D/V src] | n/a (via CC/pi) |
| Harness-injected dynamic context | env/cwd, model id, date, user email/org context are injected as *message-level* attachments after the system prompt [V] | Large developer/context items (permissions, AGENTS.md, skills, plugins, env) [V size; I content] | Only what you enable (`cwd` section, context files, skills); all can be disabled [D] | — |
| Restrict/replace tools | `--tools ""`, `--tools Read,Bash`, `--disallowedTools`, `--restricted` [V/D] | `config` overrides, `dynamicTools` (experimental, client-executed) [D schema] | `--no-tools`, `--tools`, `setActiveTools`, custom tools [D] | — |
| Inject own MCP | `--mcp-config` (+`--strict-mcp-config`), in-process SDK MCP servers [D/V src] | `config.mcp_servers` via `-c`/`config` param; `mcpServer/*` methods [D] | Built-in MCP support (`docs/mcp.md`), or register tools directly [D] | — |
| Client-executed tools (host callback) | SDK MCP (in-process) or stdio MCP | `dynamicTools` → server request `DynamicToolCall` to client [D schema] | Extension/SDK tools run in-process [D] | — |
| Synthesize history | Yes: hand-written JSONL resumed and recalled correctly [V] | `thread/inject_items` on a fresh (ephemeral) thread [V]; rollout file synthesis possible [I] | Construct `SessionManager` with entries; `importFromJsonl` [D] | — |
| Fork at arbitrary point | `fork_session(up_to_message_id)`; `resume_session_at` + `fork_session` [V src] | `thread/fork{lastTurnId}` (turn granularity) [D] | `fork{entryId}`, tree branching, `clone` [D] | — |
| Truncate tail | Rewrite JSONL / `resume_session_at` [V src] | `thread/revert{beforeTurnId}` [D] | Move leaf / branch [D] | — |
| Pluggable session storage | `SessionStore` (SDK; materializes to temp `CLAUDE_CONFIG_DIR`) [V src] | Rollouts in `$CODEX_HOME/sessions`; thread store internal [V] | `SessionManager.inMemory()` / custom [D] | — |
| Mid-run steering | stream-json stdin: queued, consumed at next turn boundary [V]; hooks `additionalContext` [D] | `turn/steer{expectedTurnId}` appends to in-flight turn [V] | `steer` (after current tool calls, before next LLM call), `follow_up`, `sendMessage(deliverAs)` [D] | — |
| Interrupt | `control_request{subtype:"interrupt"}` [V] | `turn/interrupt` [D] | `abort` [D] | — |
| Async external push | stdin message while idle or busy [V]; MCP "channels" only interactive, not `-p`/SDK [D] | `inject_items` (no turn) or `turn/start`/`steer` [V] | `sendMessage(..., {triggerTurn})`, RPC `steer`/`follow_up` [D] | — |
| Cache telemetry | `cache_read_input_tokens`, `cache_creation_input_tokens` split into 5m/1h TTL, per iteration [V] | `cachedInputTokens`, `cacheWriteInputTokens`, `inputTokens`, per turn and cumulative [V] | `cacheRead`/`cacheWrite` per message and `get_session_stats` [D] | `cache_read_input_tokens` on Anthropic-compat endpoint [D] |
| Cache TTL | 1h on subscription (observed `ephemeral_1h_input_tokens`) [V] | provider-managed, opaque [I] | per provider; built-in cache warmer [V src] | automatic disk cache [D] |
| Process model | per-turn spawn (`-p`) or long-lived (stream-json / SDK client) [V] | long-lived server, many threads [V] | long-lived (SDK in-process, or RPC child) [V] | — |
| Cold start (this Mac) | ~0.23 s to `init`; ~1.9–2.1 s for a full haiku turn [V] | ~0.4 s `initialize`, ~0.5 s `thread/start` [V] | ~0.25 s to first RPC response [V] | — |
| Subscription auth | Claude.ai OAuth (Pro/Max) — CC binary only per terms [D] | ChatGPT login (Plus/Pro) or API key [V/D] | OAuth for many providers incl. ChatGPT and Anthropic, or API keys [D/V src] | API key only [D] |

---

## 2. Claude Code

### 2.1 Prompt, tools, MCP
- `--system-prompt` / `--system-prompt-file` replaces the default prompt. The recorded request shape (in the session
  JSONL `api-request-shape` record) had exactly two system blocks: `"You are a Claude agent, built on Anthropic's Claude
  Agent SDK."` (62 chars, fixed, cached with `scope: global`) and our file verbatim [V]. `--append-system-prompt`
  appends to the default instead [D].
- **What `--system-prompt` does NOT remove** [V]: per-request *attachments* rendered as `<system-reminder>` messages:
  `environment` (cwd, platform, OS), `model` (model id/cutoff), `session_context` (contains the account e-mail),
  `date`, `credential_org`, plus `total_tokens_reminder`. `CLAUDE_CODE_DISABLE_ATTACHMENTS=1` dropped only the
  token reminder [V]. `--exclude-dynamic-system-prompt-sections` moves cwd/env/git status out of the *default* prompt
  into the first user message and is ignored with `--system-prompt` [D]. Fully stripping these requires `--bare`,
  which requires `ANTHROPIC_API_KEY` (OAuth/keychain never read) [D].
- **System-prompt snapshotting** (`--system-prompt-snapshot on`, default except under `--bare`): the prompt is recorded
  on the first request and *reused verbatim on every later request and resume, even if a later launch passes
  different text*, until compaction [D]. Implication: changing Ducter's identity/tool block means starting a new
  session (or using `--system-prompt-snapshot off`, which makes every request re-render the prompt).
- Tools: `--tools ""` gave `tools: []` in the request [V]; `--tools "Bash,Edit,Read"` allowlists built-ins [D];
  `--restricted` removes code-exec tools [D]. Config isolation: `--setting-sources ""` (no user/project/local settings),
  `--strict-mcp-config` + `--mcp-config <json>` (only our MCP servers) [V]. Agent SDK adds in-process SDK MCP
  servers (`sdk_mcp_bridge.py`, control subtype `mcp_message`) [V src].
- Hooks (settings JSON passed via `--settings`): `SessionStart`/`UserPromptSubmit` can add `additionalContext`;
  `PreToolUse` can allow/deny/modify; `--include-hook-events` streams them [D]. Note `--bare` skips settings hooks.

### 2.2 Session files (`~/.claude/projects/<sanitized-cwd>/<sessionId>.jsonl`)
Observed record types in a fresh 2.1.319 session [V]: `session-owner`, `queue-operation` (enqueue/dequeue),
`user`, `attachment`, `atis-latch`, `api-request-shape`, `api-request-blob` (content-addressed message/system
blobs), `api-request` (params, betas, `cacheControl` breakpoints, `tail` blob hashes, `requestDigest`),
`assistant` (full API message incl. `usage`), `last-prompt` (`leafUuid`), `mode`, `cost-state`.
Chain invariants: every message/attachment has `uuid` and `parentUuid` (root = null); `isSidechain=false` for main
chain; `sessionId` matches filename; resume picks the leaf (fork code updates only the last message's timestamp for
"leaf detection on resume") [V src `session_mutations.py`].

**Experiment (b) [V]:** wrote a new file containing only 4 records (user/assistant/user/assistant) with fields
`{parentUuid, isSidechain, type, uuid, timestamp, userType, cwd, sessionId, version, message}`; the assistant
`message` was a minimal API message (`id, type, role, model, content, stop_reason, usage`). `claude -p "What is my
codeword and when is the meeting?" --resume <sid>` answered from the fabricated history ("PELICAN-42", "Thursday").
No shape/blob/snapshot records were required. Usage on that call: cache_read 3058 (system prefix), creation 692.

SDK helpers [V src]: `fork_session(session_id, up_to_message_id=…)` remaps all UUIDs and slices; options
`resume`, `fork_session`, `resume_session_at` (`--resume-session-at=<uuid>`, load only up to that message),
`resume_drops_turn`; `SessionStore` protocol (+`InMemorySessionStore`, `import_session_to_store`) — on resume the SDK
materializes the stored entries as JSONL into a temp config dir and copies auth files there. This is effectively an
official "host owns the transcript" hook and matches Ducter's "session = cache" model.

### 2.3 Live control
- `--input-format stream-json --output-format stream-json --verbose` keeps one process alive across turns [V].
- **Injection experiment [V]:** sent a second user message while the first (no-tools) turn was streaming. It was
  queued; the first turn finished, then a second `init`→turn ran and answered from the injected content
  ("X=7"). With tools, queued input is typically folded in between tool iterations [I — not tested]. A user message is the
  only injection primitive; there is no "append to history without a turn" in `-p` mode (do it by writing it into
  the next prompt, or by session-file rewrite while idle).
- **Interrupt [V]:** `{"type":"control_request","request_id":"r1","request":{"subtype":"interrupt"}}` →
  `control_response success {still_queued: []}`, synthetic user message `[Request interrupted by user]`, result
  `error_during_execution`. Other control subtypes in SDK [V src]: `initialize, set_permission_mode, set_model,
  mcp_toggle/reconnect/status, get_context_usage, rewind_files, stop_task, can_use_tool, hook_callback`.
- MCP *channels* (`notifications/claude/channel`) push external events into a session, but are research-preview,
  allowlisted, and **ignored in `-p`/SDK mode** [D channels-reference]. Not usable for Ducter.

### 2.4 Cache behaviour (experiments a, c) — haiku, `--tools ""`, isolated settings [V]
| Call | input | cache_creation | cache_read |
|---|---|---|---|
| a1 fresh, default prompt | 2 | 3023 (1h TTL) | 649 |
| a2 `--resume` a1, new turn | 2 | 422 | 3291 |
| a3 fresh, identical prompt, same cwd | 2 | 0 | 3672 (100%) |
| c1 fresh, `--system-prompt-file` (~1.4k words) | 2 | 3174 | 0 |
| c2 fresh, same file, same cwd | 2 | 0 | 3174 (100%) |
| c3 fresh, same file, **different cwd** | 2 | 382 | 2793 |
| synthesized session resume | 2 | 692 | 3058 |

Conclusions: (1) system+tools prefix is stable and cache-hits across fresh sessions [V]; (2) the env attachment
(cwd) sits right after the system prompt, so a different cwd invalidates only the post-system part (~380 tok) [V];
(3) the date attachment will change daily, invalidating everything after it in a *fresh* session but not in an
existing one (it is appended, not rewritten) [I from record layout]; (4) subscription requests use **1h TTL**
breakpoints at `system[1]`, `system[2]` and the last message [V `api-request.cacheControl`]. Fixing Ducter's cwd per
workspace keeps the prefix identical across fresh projections.

### 2.5 Auth
`claude auth status` → `authMethod: claude.ai` [V]. API key via `ANTHROPIC_API_KEY`/`apiKeyHelper` (required for
`--bare`) [D]. See §6 for terms.

---

## 3. Codex (`codex app-server`, `codex exec`)

### 3.1 Protocol
`codex app-server` (stdio JSON-RPC 2.0 by default; also `unix://`, `ws://` (experimental)). Handshake:
`initialize{clientInfo, capabilities:{experimentalApi:true}}` → `initialized` notification [V]. 106 client
methods in the generated schema (`codex app-server generate-json-schema --out DIR [--experimental]`) [V], including:
`thread/start|resume|fork|revert|read|turns/list|items/list|inject_items|compact/start|archive|delete`,
`turn/start|steer|interrupt`, `model/list`, `mcpServer/*`, `config/*`, `account/rateLimits/read`,
`account/usage/read`. Notifications include `thread/tokenUsage/updated`, `turn/started|completed`,
`item/started|completed`, `item/agentMessage/delta`, `thread/compacted`, `model/rerouted`. Server→client requests:
approvals (`CommandExecutionRequestApproval`, `FileChangeRequestApproval`, …) and `DynamicToolCall`
(`{threadId, turnId, callId, namespace, tool, arguments}`) [V schema]. Official docs: "Use it when you want a deep
integration inside your own product"; recommends the Codex SDK for automation/CI [D learn.chatgpt.com/docs/app-server].
Also of interest: `externalAgentConfig/import` (imports other agents' config/sessions) [D schema].

### 3.2 Prompt / tools / MCP
- `thread/start|resume|fork` accept `baseInstructions`, `developerInstructions`, `model`, `cwd`, `sandbox`,
  `approvalPolicy`, `config` (arbitrary config.toml overrides, e.g. `mcp_servers`, features), `ephemeral` [V schema].
  Experimental: `dynamicTools` (client-implemented tools), `environments`, `historyMode` [V src `v2/thread.rs`].
- `baseInstructions` was accepted [V], but the first turn still cost **~22.5k input tokens** for a ~1.3k-token base
  prompt [V]: Codex adds tool specs plus developer messages (permissions, the user's `~/.codex/AGENTS.md`, skills,
  plugins, hooks — this machine has all of these). For Ducter, run with a dedicated `CODEX_HOME` and minimal config
  [I]; beware that copying `auth.json` duplicates a rotating refresh token (risk of logging out the original) [I].
- Core has a `ThreadInstructionsProvider` ("host-owned provider for this root thread's additional instructions"),
  only reachable when embedding codex-core as a Rust library, not over app-server [V src `thread_manager.rs`].

### 3.3 History construction
- **`thread/inject_items` [V]:** on a fresh ephemeral thread, injected `[{type:"message",role:"user",
  content:[{type:"input_text",…}]},{type:"message",role:"assistant",content:[{type:"output_text",…}]}]`; the next
  turn recalled the injected codeword. Docs: appends raw Responses API items to model-visible history "without
  starting a user turn"; items persist to the rollout [D]. This is the cleanest "build session from projection" primitive
  of all harnesses, and also the cleanest **async-event injection** (Focus-Window result → inject while idle, or
  steer while busy).
- `thread/fork{threadId, lastTurnId?, ephemeral?}` copies stored history through a turn; `thread/revert{beforeTurnId}`
  drops that turn and all later ones (does not touch files); `thread/rollback` was removed [D].
- Rollout files `~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl`: lines `{timestamp, ordinal, type, payload}`;
  types seen [V]: `session_meta` (incl. `base_instructions`, `cwd`, `git`, `model_provider`, `history_mode`),
  `turn_context`, `world_state`, `response_item` (message user/assistant/developer, `custom_tool_call(_output)`,
  `additional_tools`), `event_msg` (task_started/complete, item_completed, token_count, thread_settings_applied),
  `token_usage_record`. Synthesizing rollouts is possible in principle but the format churns (`migrate-rollouts`,
  "paginated thread history") — prefer `inject_items` [I].

### 3.4 Live control [V]
`turn/steer{threadId, expectedTurnId, input}` while turn 1 was in flight → the reply included the steered
instruction ("one STEERED"); steer does not emit a new `turn/started` [D]. `turn/interrupt` ends with
`status:"interrupted"` [D]. `turn/start` also takes per-turn `model`, `effort`, `outputSchema`, `cwd`.

### 3.5 Cache telemetry and behaviour [V]
`thread/tokenUsage/updated` → `{total, last: {inputTokens, cachedInputTokens, cacheWriteInputTokens, outputTokens,
reasoningOutputTokens}, modelContextWindow}`. Runs with model `gpt-6-luna`, identical `baseInstructions`:

| Run | inputTokens | cachedInputTokens |
|---|---|---|
| thread A (fresh, + 2 injected items), turn 1 | 29061 | 3328 |
| thread B (fresh, back-to-back), turn 1 | 22899 | 3328 |
| thread C (fresh, ~1 min later), turn 1 | 22544 | 22272 (99%) |
| thread C, turn 2 | 29113 | 22400 (77%) |

Source: the ChatGPT backend "derives cache affinity from the Responses session-id header", which is the thread's
session id by default (`PromptCacheKey::SessionDerived`; `Custom`/`Omit` exist only in core, not app-server)
[V src `core/src/client.rs`, `thread_manager.rs`]. So cross-thread hits are possible but not guaranteed (B missed,
C hit) [V]; a continuing thread is the reliable warm path [I]. Turn 2 grew by ~6.5k tokens of harness-added context, of
which only part was cached [V numbers; I cause].

### 3.6 Lifecycle and auth
Long-lived server with many threads; `initialize` 0.4 s, `thread/start` 0.5 s [V]. Turns on this machine stayed open
~14 s after the final message (likely user hooks/memory plugins) [V timing; I cause]. Auth: "Logged in using ChatGPT"
[V]; API-key login supported (`codex login --with-api-key`) [D]. `codex exec --json` / `--ephemeral` /
`--output-schema` / `--ignore-user-config` exist for one-shot use [D help], but lack steer/inject.

---

## 4. pi (pi-mono coding-agent)

### 4.1 Control
- System prompt is **sectioned** (`preamble`, `tools`, `cwd`, `skills`, custom sections); `--system-prompt` or
  `customPrompt` replaces the preamble; sections can be patched by name; changes are persisted as system messages
  that patch sections and list `toolsAdded/toolsRemoved` [D session-format, V src `system-prompt.ts`].
- Extension hooks [D extensions.md]: `before_agent_start` (durable prompt/tool changes), `context` (rewrite message
  list per LLM call; pi re-adds prompt+tools head), `context_with_system` (own the whole request incl. system),
  `before_provider_request` (replace the final provider payload), `before_provider_headers`, `after_provider_response`,
  `provider_stream_event`, `tool_call`/`tool_result`, `cache_warming_decision`.
- Tools: `--no-tools`, `--no-builtin-tools`, `--tools` allowlist, `--exclude-tools`, `setActiveTools()`; MCP built in
  (`--no-mcp` to disable); `--no-extensions --no-skills --no-context-files --no-prompt-templates` for a clean run [D help].
- Cache key: the openai-codex provider sends `prompt_cache_key = options.sessionId` [V src
  `openai-codex-responses.ts`], so Ducter can choose the key (e.g. a stable workspace id) — unlike Codex app-server.
  Built-in **cache warmer** refreshes at 90% of TTL when expected savings ≥ $0.05 [V src `cache-warmer.ts`] — directly
  the "expire-aware" logic Ducter wants.

### 4.2 Sessions
JSONL v3: header `{type:"session", version:3, id, timestamp, cwd, parentSession?}` then entries
`{type, id(8-hex), parentId, timestamp}` of kinds `message` (AgentMessage: system/user/assistant/toolResult/custom),
`model_change`, `thinking_level_change`, `usage`, `compaction{firstKeptEntryId}`, `context_edit`, `branch_summary`,
`custom`, `custom_message`, `label`, `session_info` [D]. It is a **tree**; context = path from current leaf to root,
honoring the latest compaction, then `context_edit` replacements [D]. SDK: `SessionManager` is authoritative —
"Restore external history by constructing the session with a manager containing those entries" [D sdk.md];
`SessionManager.inMemory()`; runtime `fork()`, `switchSession()`, `importFromJsonl()`.

### 4.3 Live control
RPC (`pi --mode rpc`, JSONL over stdio) commands [D rpc-commands.md]: `prompt`, `steer` (delivered after current tool
calls, before next LLM call), `follow_up`, `abort`, `clear_queue`, `new_session`, `get_state`, `get_messages`,
`set_model`, `compact`, `fork{entryId}`, `clone`, `get_tree`, `get_entries`, `switch_session`, `get_session_stats`
(tokens incl. `cacheRead/cacheWrite`, cost, context usage). Extensions: `pi.sendMessage(custom, {deliverAs:
"steer"|"followUp"|"nextTurn", triggerTurn})` — the right shape for Focus-Window results.
Cold start ~0.25 s to first RPC response [V]. No live LLM call was made with pi (no subscription credential configured on
this machine; only Azure env) — all pi behaviour above is [D]/[V src].

### 4.4 Auth
`/login` OAuth or device flows for hosted providers, API keys via env (`DEEPSEEK_API_KEY` listed) [D providers.md].
**Anthropic OAuth path sends Claude Code identity headers and system line ("You are Claude Code, Anthropic's
official CLI for Claude.") and mimics Claude Code tool naming ("Stealth mode")** [V src
`packages/ai/src/api/anthropic-messages.ts:104,1288,1485`]. ChatGPT OAuth mimics the Codex CLI request format
[D secondary].

---

## 5. DeepSeek
- No official DeepSeek coding harness found; a third-party guide says "Official DeepSeek Code / Harness" was
  pre-launch as of May 2026 [D, secondary, unverified]. Community agents (DeepSeek-TUI, deepcode-cli) exist, not
  affiliated.
- DeepSeek offers an **Anthropic-compatible endpoint**: `ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic`,
  `ANTHROPIC_API_KEY=<deepseek key>`; `cache_control` ignored (caching is automatic), `cache_read_input_tokens`
  reported, `cache_creation_input_tokens` always 0; `claude-opus*` maps to `deepseek-v4-pro`, others to
  `deepseek-flash`; `mcp_servers`, some content types and `type:"custom"` tools are unsupported [D
  api-docs.deepseek.com/guides/anthropic_api]. So "DeepSeek harness" = Claude Code (API-key mode, `--bare` possible)
  or pi with the DeepSeek provider. API key only; no subscription concept.

---

## 6. Auth and terms (cite)
- **Anthropic** (code.claude.com/docs/en/legal-and-compliance, "Authentication and credential use"): "OAuth
  authentication is intended exclusively for purchasers of Claude Free, Pro, Max, Ultra, Team, and Enterprise
  subscription plans and is designed to support ordinary use of Claude Code and other native Anthropic
  applications." "Developers building products or services … including those using the Agent SDK, should use API
  key authentication … Anthropic does not permit third-party developers to offer Claude.ai login into their own
  applications, or to route requests through Free, Pro, Max, or Ultra plan credentials on behalf of their users.
  Moreover, developers may not collect, store, or intermediate Claude.ai credentials or session tokens." Carve-out:
  it does not "prevent an end user from signing in to the unmodified Claude Code binary with their own Claude
  subscription". Also: "Advertised usage limits for Pro, Max, and Ultra plans assume ordinary, individual usage of
  Claude Code and the Agent SDK." Secondary sources report the terms change in Feb 2026 and enforcement in Apr 2026.
  - Reading for Ducter [I, not legal advice]: a user driving the stock `claude` binary (spawned by Ducter) with their
    own login, for their own use, sits closest to the carve-out. Shipping Ducter as a product that relies on users'
    Max logins is exposed. Ducter must never read or forward `~/.claude` credentials. The SDK's `SessionStore` copies
    auth files into a temp dir, which is the SDK's own behaviour, not Ducter intermediating. pi's Anthropic-OAuth
    "stealth" path is clearly outside the terms.
- **OpenAI**: Codex CLI/app-server with ChatGPT login is first-party usage [D]. Third-party use of "Sign in with
  ChatGPT" has been extended to participating tools, and OpenAI staff have publicly cited pi and OpenCode traffic;
  OpenAI's terms do not explicitly address it [D secondary: thenewstack.io/sign-in-with-chatgpt,
  manifest.build/blog/chatgpt-plus-tokens-third-party-harnesses]. Lower risk than Anthropic, but not contractually
  settled.
- **DeepSeek**: API key, normal API terms.

---

## 7. Implications for the adapter design

1. **Adapter interface = the intersection that all three can do well:**
   `start(projection) → session`, `resume(sessionRef)`, `send(userInput)`, `steer(input)`, `interrupt()`,
   `injectEvent(event, mode: idle-append | steer | next-turn)`, `usage()` stream normalized to
   `{input, cache_read, cache_write, output}`, `fork/truncate(at)`. Keep per-harness capability flags (`canInjectNoTurn`,
   `canSteerMidTurn`, `canChooseCacheKey`, `hasFixedPreamble`).
2. **Projection = stable prefix + append-only tail works on all three**, with caveats:
   - Claude Code: put identity+tool docs in `--system-prompt-file`; use `--tools`/`--mcp-config --strict-mcp-config
     --setting-sources ""`; run every projection from a **fixed cwd per workspace** (the env attachment follows the
     system prompt). Expect an unavoidable ~60-token SDK preamble and harness attachments (env/model/date/user
     context) between our system prompt and our first message — budget for them, and never place volatile content in
     the system prompt. Because of the snapshot rule, **any change to the stable prefix ⇒ new session**.
   - Codex: `baseInstructions` + `developerInstructions` for the prefix; history via `thread/inject_items`; dedicated
     minimal `CODEX_HOME` to shed the ~20k harness tokens. Cache affinity follows thread id, so prefer **continuing a
     thread** over fresh threads; treat fresh-thread cache hits as opportunistic.
   - pi: full control, so implement the projection directly via `context_with_system` / SessionManager and set the
     cache key to a Ducter-chosen value.
3. **"Session as cache" is viable on Claude Code**: we verified that a Ducter-written JSONL resumes. Two
   implementation options: (a) write `~/.claude/projects/<cwd>/<uuid>.jsonl` with only user/assistant(/tool) records
   chained by `parentUuid`, then `--resume <uuid>`; (b) use the Agent SDK `SessionStore` so Ducter *is* the store and
   the SDK materializes it into a temp config dir. (b) is supported API; (a) depends on an undocumented format (the
   2.1.x format added records like `api-request-shape`/`prompt_snapshot`; they are optional today but may become
   required). Pin the CLI version and add a canary test: synthesize → resume → assert recall + cache_read > 0.
4. **Expire-aware resume rule**: the Claude subscription prefix uses **1h TTL**; Codex TTL is opaque; pi exposes TTL
   and a warmer. Track `last_request_at` and `prefix_hash` per harness session; resume only if
   `prefix_hash` matches and `now - last_request_at < TTL - margin`; otherwise build fresh. On Claude Code a fresh
   build costs nothing extra for the system prefix (cross-session hits were 100%); only the history tail is re-written.
   Verify with telemetry (`cache_read` / `cachedInputTokens`) and feed misses back into the policy.
5. **Focus-Window results (async)**:
   - Codex: idle → `thread/inject_items` (no turn) or `turn/start`; busy → `turn/steer` (precondition `expectedTurnId`).
   - pi: `sendMessage(custom, {deliverAs:"steer"|"followUp", triggerTurn})` or RPC `steer`.
   - Claude Code: keep a long-lived stream-json process per active main session; write a user message
     framed as an event (e.g. `<focus_result id=…>`). It queues and runs as the next turn; there is no idle "append
     without turn" — for that, fold pending events into the next real prompt. MCP channels are not available in
     `-p`/SDK mode.
6. **Thread unfolding at the tail** maps to fork primitives: CC `resume_session_at` + `fork_session`; Codex
   `thread/fork{lastTurnId}` (turn granularity only); pi `fork{entryId}`/tree branches. Folding a thread back = start
   from the trunk session again (cache stays warm on the trunk prefix).
7. **Process model**: one long-lived process per *hot* main session (CC stream-json / SDK client; one shared Codex
   app-server for all threads; pi in-process SDK). Cold starts are small (0.25–0.5 s) compared with model latency, so
   per-turn spawn is fine for cold/background work.
8. **Telemetry normalization**: CC reports `input_tokens` *excluding* cache reads/writes; Codex `inputTokens`
   *includes* `cachedInputTokens`; DeepSeek-compat reports hits in `cache_read_input_tokens`. Normalize to
   `uncached_in = total_in - cache_read - cache_write`.
9. **Biggest blockers / risks**: (i) Anthropic terms on subscription OAuth outside "ordinary use of Claude Code"
   (product risk; only "user runs stock binary with own login" is defensible); (ii) CC's harness-injected per-request
   context (including the account e-mail) and its fixed preamble cannot be removed without an API key (`--bare`);
   (iii) undocumented, churning CC JSONL and Codex rollout formats — prefer SessionStore / `inject_items`;
   (iv) Codex cache affinity tied to thread id plus heavy harness context; (v) no official DeepSeek harness.

## 8. Open questions / not tested
- CC: whether queued stream-json input is folded into the same turn between tool calls (needs a tool-using test);
  whether a synthesized session with tool_use/tool_result pairs and thinking blocks resumes (thinking signatures
  likely must be dropped or kept verbatim); exact date-rollover behaviour within a long session.
- Codex: `dynamicTools` round trip; `thread/fork` cache behaviour (does the fork reuse the parent's cache affinity?);
  cost of an isolated `CODEX_HOME` with no AGENTS.md/plugins.
- pi: live run with ChatGPT OAuth to confirm `cacheRead` with a custom session id.
