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
| Codex | 0.167.0 | `-c model_context_window` | `-c model_auto_compact_token_limit` (clamped to 90% of the window, INFERRED) | n/a |
| pi | 1.4.0–1.5.1 | none per session | settings.json `compaction.reserveTokens` only (DOCUMENTED) | n/a |
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
- **Events through OAR 0.95.1.** `compact_boundary` becomes `compaction_ended` only; there is
  no `compaction_started`.
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

## Codex 0.167.0

- **Models** (`codex debug models`): `gpt-6.1-sol` and `gpt-6.1-terra` 500K; `gpt-6-astra`,
  `gpt-6-sol`, `gpt-6-luna`, `gpt-5.6-*` 272K.
- **Knobs.** `model_context_window` and `model_auto_compact_token_limit` are typed config keys
  (VERIFIED: `codex debug prompt-input -c key="x"` answers "expected i64 in `key`"). PreCompact
  and PostCompact hooks and `compact_prompt` exist (binary strings).
- **Events.** `compaction_started` and `compaction_ended` both reach Ducter.
- **Browser.** Computer Use works headless under OAR (research/38).

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
