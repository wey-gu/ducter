# Harness facts

> The readable twin of `packages/protocol/src/harness-facts.ts`, which is the single source of
> truth (D135). The runner reads windows, compaction points and model ids from it. Re-check with
> `bun scripts/probe-harnesses.ts` (no model calls, no logins); `ducter doctor` warns when an
> installed version is outside the verified range. Tags: VERIFIED (how, date, version),
> DOCUMENTED (source), INFERRED.

## Verified versions (2026-11-09; widened 2026-11-10, D175 (2), D177)

| Harness | Verified | Window knob | Compaction point | 1M off |
|---|---|---|---|---|
| Claude Code | 2.1.319–2.1.322 | env `CLAUDE_CODE_AUTO_COMPACT_WINDOW` (100K–1M) | env `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`: min(⌊(W − 20K) × pct⌋, W − 33K) | env `CLAUDE_CODE_DISABLE_1M_CONTEXT=1` |
| Codex | 0.167.0–0.169.1 (D352) | `-c model_context_window` (never above the model's own window) | `-c model_auto_compact_token_limit` (clamped to 90% of the window, INFERRED) | n/a |
| pi | 1.4.0–1.5.1 | none per session | settings.json `compaction.reserveTokens` only (DOCUMENTED) | n/a |
| Antigravity | 1.5.0–1.5.12, OAR's own range (D416; not run by Ducter) | none: the model's own (1M on a Gemini account) | none: agy's own | n/a |
| DeepSeek Harness | 0.2.2-rc.1 (D177) | none: the model's window (1M for both official models) | profile layer `compaction-basic.thresholdRatio` (+ `retainTokens`), in a Ducter-owned home only; VERIFIED live | n/a |

## Claude Code 2.1.319–2.1.322

- **Models.** `opus`, `sonnet`, `haiku` resolve to `claude-opus-5-5`, `claude-sonnet-5-5`,
  `claude-haiku-5-5`. Every name, alias or full id, got a 1,000,000 window on this Max
  account; with `CLAUDE_CODE_DISABLE_1M_CONTEXT=1` each got 200,000. There is no separate
  standard-window id; `[1m]` asks for the 1M variant. VERIFIED: `claude -p --model <name>
  --output-format json`, `modelUsage[id].contextWindow`.
- **Compaction point.** The binary's threshold is min(⌊e × pct/100⌋, e − 13,000) with
  e = window − min(maxOutputTokens, 20,000), so a 200K window compacts at 167K by default and
  at 160K with pct 88.8889. VERIFIED: binary, and live with `--debug-file` (window 100K, a
  49K-token prompt: `level=ok` without the override, `level=compact` with 50). `/context`
  ignores the override.
- **Settings.** `idleCompaction`, `precomputeCompactionEnabled` (binary).
- **PreCompact hook.** `hooks.PreCompact` (matcher `manual` / `auto`): exit 0 stdout is
  appended to the compact instructions; exit 2 blocks compaction (binary's hook catalog).
- **Events through OAR 0.124.0 (D416).** `compact_boundary` becomes `compaction_ended`; a system
  `status: compacting` frame becomes `compaction_started`, once per agent (OAR #984; read in
  OAR's source, not run live). Through 0.95.1 there was no `compaction_started`.
- **Context reading.** The last request's input + cache read + cache write; unknown right
  after a compaction.
- **Tool search.** MCP tools deferred by default; `ENABLE_TOOL_SEARCH=false` (the adapter sets
  it for every clean session: the partner, the judge, the digest writer) or the per-tool `_meta`
  `anthropic/alwaysLoad` (Ducter's tools in tasks). Both strings, and the Read cap, are
  `CLAUDE_SWITCHES` in harness-facts; a test fails on them anywhere but the registry and the
  adapter, and the probe checks the binary still has them (research/48).
- **2.1.322, re-verified live 2026-11-10 (D175 (2), research/48 addendum).** Windows 1M / 200K;
  `effectiveWindow` = window − 20K; the percent override still lowers the compaction point
  (`level=compact` at 8K tokens with pct 1, `ok` without). The binary also has per-window
  entries and a rule that a fork ignores the override (Ducter doesn't fork). `verified` is now
  2.1.319–2.1.322.
- **Browser.** Claude in Chrome through `--chrome`; no computer use in `-p` (research/38).

## Codex 0.167.0–0.169.1

- **Models** (`codex debug models`): `gpt-6.2-sol` (0.169.1), `gpt-6.1-sol` and `gpt-6.1-terra`
  500K; `gpt-6.2-astra` (0.169.1), `gpt-6-astra`, `gpt-6-sol`, `gpt-6-luna`, `gpt-5.6-*` 272K.
  Hidden ones (`gpt-reserve`, `codex-auto-review`) are never offered. Effort: the 6.2 and 6.1
  models and `gpt-5.6-sol` default to low, the rest to medium; the luna models stop at max, the
  rest go to ultra (OAR listModels and `codex debug models` agree, 2026-11-18).
- **The list is live (D352).** What the pickers offer is Codex's own `model/list` (OAR
  `listModels`) on that computer, read again when its version changes. The registry above only
  adds what Ducter has checked (the window); a model it doesn't know yet takes the window
  `codex debug models` gives it and is marked `fresh`, so a model released overnight is offered
  and switchable without a Ducter release. The probe reports it as drift to add here.
- **Knobs.** `model_context_window` and `model_auto_compact_token_limit` are typed config keys
  (VERIFIED: `codex debug prompt-input -c key="x"` answers "expected i64 in `key`"). PreCompact
  and PostCompact hooks and `compact_prompt` exist (binary strings).
- **Events.** `compaction_started` and `compaction_ended` both reach Ducter.
- **Browser.** Computer Use works headless under OAR (research/38).
- **0.171.0: tool search by model, and the clean setup's one table (D510).** A model whose
  catalog entry supports tool search (`gpt-6.2-sol`) gets every MCP server as a deferred
  namespace behind tool search and code mode's `exec`; no config switch keeps them direct
  (`features.tool_search` is removed). The app-server sets a thread's `config` after the launch's
  `-c` list in one layer, so OAR's thread `mcp_servers` table replaced the clean setup's
  `enabled=false` entries and the person's servers came back (`codex mcp list` never sees a
  thread's config). Ducter's own servers now ride in the launch as one `mcp_servers={…}` table
  ahead of those entries, the bearer through `env_http_headers`. `features.shell_tool=false`
  drops `exec_command` and `write_stdin`. VERIFIED with `codex debug prompt-input`
  (`packages/runner/test/codex-prompt-input.test.ts`) and the eval's rollouts.

## pi 1.4.0–1.5.1 and DeepSeek Harness 0.2.2-rc.1 (D177, research/50)

pi has no per-session window or compaction flag (`pi --help`); its compaction lives in
settings.json, and `session_before_compact` can cancel or replace a summary (research/11). As
the partner its window is bounded by Ducter's own re-cut at 120K (pi reports the context size
on every turn, VERIFIED), far below pi's own point (the model's window minus 16K).

DeepSeek Harness reads a profile layer from its home (`$DSH_HOME/profiles/acp/cordis.patch.yml`,
the user's layer, applied after every bundle and before OAR's `--patch`). In a home Ducter owns
(the partner, a one-shot, a memory-off task) Ducter writes it (`dshLayer` in `runner/oar.ts`,
the ids in `DSH_PROFILE`):
- the system prompt: `system-prompt` with `includeHarnessIdentity: false` and `personaPrefix` set
  to Ducter's prompt, so the prompt opens the system message; AGENTS.md would arrive as a user
  message of "workspace instructions" that "do not override system instructions";
- read-only: the tool rows that run, write, delegate or plan disabled (bash, pwsh, jobs,
  subagents, workflow, goals, todos, skills, the working-directory switch), `tool-fs` with
  `write`/`edit`/`applyPatch` false, and `DSH_PERMISSION_MODE=read-only` underneath (Ducter's MCP
  tools still answer under it, VERIFIED);
- compaction: `thresholdRatio` = compaction point / W and `retainTokens` = a quarter of it. Its
  default retention (16% of W, ~104K) at or above the threshold rejects the whole plugin at load,
  with no error: no compaction and no overflow recovery (VERIFIED: a 20K point did nothing until
  `retainTokens` was set, then compacted at ~20K and kept the conversation);
- the session-log upload (`session-log-deepseek`, the canonical log sent to DeepSeek's API beside
  each request) off.

Gotcha found here: under Bun 1.3.1 a host that opens and closes several pi RPC sessions is
SIGKILLed after a few (the eval died after 2–9 scenarios, every time; no `process.kill` from the
host). Under the pinned Bun 1.4.4 the same runs finish. Ducter ships 1.4.4; run evals with it.

## Antigravity (D416, research/171): OAR 0.124's facts, not run by Ducter

- **Tasks only.** OAR refuses `disallowedTools`, `systemPrompt` and `userConfiguration:
  "exclude"`, so no read-only partner, one-shot or quick web look runs there; it never takes a
  task on web pages (block `no_web`), and the ranking puts it after every other agent
  (`pickOnly`).
- **The command line.** `agy` ≥ 1.5.0, stable only (`ANTIGRAVITY.minVersion`, OAR's floor),
  found at `OAR_ANTIGRAVITY_BIN`, else on PATH, else `~/.local/bin/agy`. The desktop app carries
  none. Verified range in the registry: OAR's own, 1.5.0–1.5.12.
- **Session.** Instructions appended (`appendSystemPrompt`), again on every resume; Ducter's MCP
  over its stdio bridge (no env or headers in an entry); steer and pictures; effort per model
  from its list (`thought_level`); no window or compaction knob (agy compacts by itself; 1M on
  a Gemini account); resume in the same folder only (`ResumeCwdError`).
- **Install / update / sign-in.** Google's manifest per platform, its sha512, the binary to
  `~/.local/bin/agy`; `agy update`; `agy acp --login` with a pasted code; `agy models` for the
  status; `/usage` for the limits.
- **Tool schemas (D479, research/207).** agy hands Ducter's MCP tools to Gemini as
  `FunctionDeclaration.parameters`, an OpenAPI subset; a schema outside it fails the whole request
  (hel 2026-11-22, 1.5.14: `wait_for`'s array without `items`, every task at its first call). A
  model named by its label ("Gemini 4 Neon") is read as the agent's id from its own list when a
  task opens (OAR accepts only catalog ids). The verified range is still OAR's; 1.5.14 shows
  "Ducter hasn't verified this version", which only holds back the night-time update.

## Tool schemas, per model family (D479, research/207)

Each agent names the model families it sends Ducter's tools to (`toolSchema` in
`harness-facts.ts`); each family's limits are facts with evidence (`protocol/src/tool-schema.ts`).
Ducter's tools are written inside all of them at once, never translated per agent, and
`packages/partner/test/tool-schemas.test.ts` checks every registered tool, listed or not.

| Agent | Families | Evidence |
|---|---|---|
| Claude Code | anthropic | DOCUMENTED |
| Codex | openai (MCP tools sent non-strict) | VERIFIED, Codex source |
| pi | anthropic, openai, gemini | INFERRED (any provider) |
| DeepSeek Harness | openai | INFERRED |
| Antigravity | gemini | VERIFIED, hel 2026-11-22 |

| Family | What a schema must be |
|---|---|
| gemini | a type on every node (one name); `items` on every array; named `properties` on every nested object; `enum` only on strings; only the OpenAPI subset's keys (no `oneOf`, `allOf`, `$ref`, `const`, `additionalProperties`); names `^[a-zA-Z_][a-zA-Z0-9_.:-]{0,63}$` |
| openai | an object at the top; `items` on every array; names `^[a-zA-Z0-9_-]{1,64}$` |
| openai-strict | as openai, and every object closed with every property required (no agent uses it today) |
| anthropic | an object at the top, no `anyOf` / `oneOf` / `allOf` there |

A free-form map (a connection action's input, an app's keys, a trigger's config) is JSON text,
read back by `jsonArg`; a value a check matches is text (the check compares values as text).

## Where each copy comes from, and how it updates (D156, 2026-11-10)

`channels` in harness-facts (research/42). The real path of the binary decides `how`; each
channel names where its latest is read and how it updates. Ducter never touches an app's copy.

| Harness | npm | Homebrew cask | Its own installer (mark · update · pinned) | App copy |
|---|---|---|---|---|
| Claude Code | `@anthropic-ai/claude-code` | `claude-code` (follows stable) | `/claude/versions/` · `claude update` · `claude install <v>` (VERIFIED `--help`) | the Claude app's own copy |
| Codex | `@openai/codex` | `codex` | `/packages/standalone/` · `codex update` · `install.sh --release <v>` (DOCUMENTED) | inside the Codex app |
| pi | `@earendil-works/pi-coding-agent` | none | `managed-install.json` · `pi update --self` · none | none (inside Ducter from a checkout) |
| DeepSeek Harness | `@deepseek-ai/dsh` (npm's `latest` is a pre-release) | none | none | none |

## One-shots with no tools (D175 (3), research/48 F8)

`noTools` in harness-facts: the judge and the digest writer set `SessionSpec.noTools`, and the
adapter sends Claude Code `--tools ""` (VERIFIED 2.1.322: 9,679 → 629 input tokens a call) and pi
`--no-tools` (DOCUMENTED); DeepSeek Harness runs a one-shot in a Ducter-owned home whose profile
layer drops every tool row (VERIFIED 0.2.2-rc.1: an empty tool list, 228 input tokens for the
judge's prompt, D177); Codex keeps the named denials (no switch known).

## The Nowledge Mem plugin in tasks (D168, D174, research/48 M3/M4)

`memPlugin` in harness-facts: Mem's host name, the plugin's id, and how one session runs without
it when memory is off. The probe checks pi's flag and that `nmem plugins inspect` still names
each host.

| Harness | Host | Id | Off in one session | Evidence | Context it adds |
|---|---|---|---|---|---|
| Claude Code | `claude-code` | `nowledge-mem@nowledge-community` | `--settings {"enabledPlugins": {id: false}}` | DOCUMENTED | unknown (todo) |
| Codex | `codex-cli` | `nowledge-mem@nowledge-community` | `-c plugins.<id>.enabled=false` (ids in config.toml only) | INFERRED: its hooks script may sit outside the plugin | unknown |
| pi | `pi` | `npm:nowledge-mem-pi` | `--no-extensions` (every user extension; `-e` ones stay) | DOCUMENTED | unknown |
| DeepSeek Harness | `deepseek-harness` | `nowledge-mem` (a profile bundle) | a Ducter-owned `DSH_HOME` for that task | INFERRED: DSH unverified | unknown |

`bun scripts/probe-harnesses.ts` prints each channel's latest beside the verified range
(`--offline` skips it). On 2026-11-10: Claude Code npm/installer 2.1.321, cask 2.1.311; Codex
0.167.0 everywhere (verified); pi 1.5.0; DeepSeek Harness 0.2.2-rc.1.

## One account per folder (D503, research/219)

Each agent keeps one signed-in account per config folder, and says who it is with no model call
(`account` in `harness-facts.ts`):

| Agent | The folder | Who is signed in | Sessions |
|---|---|---|---|
| Claude Code | `CLAUDE_CONFIG_DIR` (default `~/.claude`; on macOS a keychain item per folder) | `claude auth status --json`: email, org, `authMethod`, plan; no token | `<folder>/projects`: a session resumes only in its folder |
| Codex | `CODEX_HOME` (default `~/.codex`) | `auth.json` `tokens.account_id` (`codex login status` names no account; the app-server's `account/read` gives email and plan) | `$CODEX_HOME/sessions` |

Ducter keeps only a fingerprint of the account (`DeviceHarness.account`), so the same account on
two computers counts as one limit (`design/where.md` §21).
