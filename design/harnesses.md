# Harness facts

> The readable twin of `packages/protocol/src/harness-facts.ts`, which is the single source of
> truth (D135). The runner reads windows, compaction points and model ids from it. Re-check with
> `bun scripts/probe-harnesses.ts` (no model calls, no logins); `ducter doctor` warns when an
> installed version is outside the verified range. Tags: VERIFIED (how, date, version),
> DOCUMENTED (source), INFERRED.

## Verified versions (2026-11-09)

| Harness | Verified | Window knob | Compaction point | 1M off |
|---|---|---|---|---|
| Claude Code | 2.1.319 | env `CLAUDE_CODE_AUTO_COMPACT_WINDOW` (100K–1M) | env `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`: min(⌊(W − 20K) × pct⌋, W − 33K) | env `CLAUDE_CODE_DISABLE_1M_CONTEXT=1` |
| Codex | 0.167.0 | `-c model_context_window` | `-c model_auto_compact_token_limit` (clamped to 90% of the window, INFERRED) | n/a |
| pi | 1.4.0 | none per session | settings.json `compaction.reserveTokens` only (DOCUMENTED) | n/a |
| DeepSeek Harness | none | unknown | unknown | unknown |

## Claude Code 2.1.319

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
- **Drift seen 2026-11-10 (2.1.322, binary only, INFERRED).** The compaction code now has
  per-window entries and a rule that a fork ignores `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`; the 20K
  reserve's minified name moved. The knobs' strings are all present. Re-run the live
  compaction check before widening `verified` (research/48 F4).
- **Browser.** Claude in Chrome through `--chrome`; no computer use in `-p` (research/38).

## Codex 0.167.0

- **Models** (`codex debug models`): `gpt-6.1-sol` and `gpt-6.1-terra` 500K; `gpt-6-astra`,
  `gpt-6-sol`, `gpt-6-luna`, `gpt-5.6-*` 272K.
- **Knobs.** `model_context_window` and `model_auto_compact_token_limit` are typed config keys
  (VERIFIED: `codex debug prompt-input -c key="x"` answers "expected i64 in `key`"). PreCompact
  and PostCompact hooks and `compact_prompt` exist (binary strings).
- **Events.** `compaction_started` and `compaction_ended` both reach Ducter.
- **Browser.** Computer Use works headless under OAR (research/38).

## pi 1.4.0 and DeepSeek Harness

pi has no per-session window or compaction flag (`pi --help`); its compaction lives in
settings.json, and `session_before_compact` can cancel or replace a summary (research/11).
DeepSeek Harness is not installed on the verifying Mac. Both run with their defaults (todo).

## Where each copy comes from, and how it updates (D156, 2026-11-10)

`channels` in harness-facts (research/42). The real path of the binary decides `how`; each
channel names where its latest is read and how it updates. Ducter never touches an app's copy.

| Harness | npm | Homebrew cask | Its own installer (mark · update · pinned) | App copy |
|---|---|---|---|---|
| Claude Code | `@anthropic-ai/claude-code` | `claude-code` (follows stable) | `/claude/versions/` · `claude update` · `claude install <v>` (VERIFIED `--help`) | the Claude app's own copy |
| Codex | `@openai/codex` | `codex` | `/packages/standalone/` · `codex update` · `install.sh --release <v>` (DOCUMENTED) | inside the Codex app |
| pi | `@earendil-works/pi-coding-agent` | none | `managed-install.json` · `pi update --self` · none | none (inside Ducter from a checkout) |
| DeepSeek Harness | `@deepseek-ai/dsh` (npm's `latest` is a pre-release) | none | none | none |

## The Nowledge Mem plugin in tasks (D168, D173, research/48 M3/M4)

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
