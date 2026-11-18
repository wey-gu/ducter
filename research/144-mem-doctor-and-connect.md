# 144: Nowledge Mem's doctor and `connect --tool`, read for Mem's health and a one-step plugin (D375)

research/136 left two small gaps: G4 (Mem's own health on Settings › 记忆) and G5 (D169 installs Mem's
plugin into an agent by opening a model task, though Mem now has a command for it). This note records
what `nmem doctor` and `nmem connect` say and accept, read-only, for D375.

Tags: **VERIFIED** (run here and seen), **DOCUMENTED** (`--help`), **INFERRED** (strings in the binary,
or reasoning). Read-only throughout: `--help`, `--json doctor`, `--json connect --detect-only` (which reads
no credential) and `--json connect --dry-run` against the author's real config (it saves nothing, runs no
install and redeems nothing); nothing was written to Mem or to any agent's settings; no key was printed
(the one detail line that carries a key's tail was masked before it reached the terminal).

## Setup

| | |
|---|---|
| Date | 2026-11-19 |
| nmem | 0.10.120 (PyPI wheel in the session scratchpad) and 0.10.119 (`/usr/local/bin/nmem`), Cloud backend |

## 1. `nmem --json doctor`

- **F1 (VERIFIED, both versions).** `{checks: [{name, status, detail, tool}], failed}`: `credential home`,
  `server reachable`, `api key`, then one check per AI tool with `tool` set (`claude-code`, `codex-cli`,
  `cursor`, `gemini-cli`, `opencode`). Status `pass` / `warn` / `fail`; exit 0 when nothing failed, 1 when
  something did (research/136 saw exit 1 on a bare server). On the author's Mac all eight pass.
- **F2 (VERIFIED).** `credential home`'s detail carries the config path, the URL and **the last four
  characters of the API key**. Ducter must never show or forward detail lines: the shape is read, the
  words are not.
- **F3 (INFERRED, strings in the 0.10.120 binary).** The other details Ducter can tell apart: `api key`:
  `authenticated probe ok`, `skipped (server unreachable)`, `no api key`, `key invalid or rotated — ask for
  a fresh connect link or key, then run nmem connect`; a local server: `none (local server, no key
  needed)`; per tool: `registered`, `not registered — run nmem connect`, `(registered but its MCP config
  points at …)`. Research/136 (VERIFIED) saw, on a fresh Ubuntu: `credential home` pass with Mem's built-in
  default (`… (default), no api key`), `server reachable` fail (127.0.0.1:14242 refused), `api key` warn.
- **F4 (INFERRED).** An nmem older than `doctor` answers clap's `unrecognized subcommand 'doctor'` with
  exit 2. No JSON: "too old to tell".

So the classes D375 reads, in order of what blocks most: **old** (no doctor), **unreachable** (a saved
address that doesn't answer; Mem's built-in local default not answering on a fresh computer is "never
signed in", not unreachable), **signed_out** (answers, key `fail`; or a remote one with no key),
**plugin** (signed in; an installed agent's tool check not `pass`, ignoring "not installed" / "not
found"), else all well. Verified only for the all-pass and the fresh shapes; the expired-key and
unreachable shapes are from the strings (F3) and are what the tests use.

## 2. `nmem connect --tool`

- **F5 (DOCUMENTED, `nmem connect --help` 0.10.120).** `--tool <ID>` "Register only this tool
  (repeatable). Ids: claude-code, codex-cli, cursor, gemini-cli, opencode"; with no link it reuses the
  saved credential. `--on-conflict proceed|abort`: `abort` "leaves that tool alone and reports the clash,
  which is what a UI that can ask first uses"; registration is additive and removes nothing. `--detect-only`
  reads no credential; `--dry-run` saves nothing, runs no installs, redeems nothing.
- **F6 (VERIFIED).** `--json connect --dry-run --tool claude-code` (and `--tool codex-cli --tool opencode`)
  answered `{dryRun, url, credential, configFile, tools: [{tool, plan: "already connected — no action"}]}`,
  exit 0. Its `credential` field also carries the key's tail (masked here): never shown either.
- **F7 (VERIFIED).** `--tool pi` exits 1: `unknown --tool 'pi'; expected one of: claude-code, codex-cli,
  cursor, gemini-cli, opencode`. Ducter's pi and DeepSeek Harness have no tool there, so D169's task stays
  their only way.
- **F8 (VERIFIED).** `--json connect --detect-only` gives per tool `{tool, name, installed, registered,
  binaryAvailable, action, competing, manualCommands, mcpCommand}`.
- **F9 (NOT RUN).** A real `connect --tool` that registers a plugin, and `--on-conflict abort` meeting a
  competing integration, were not run: either would change the author's agents. How the abort is
  reported (exit code, JSON) is unknown; D375 doesn't depend on it: success is Mem's own plugin check
  (`plugins inspect`) saying the plugin is there afterwards, and anything else falls back to the task.

## Implications for Ducter

1. Mem's health is one read of `nmem --json doctor` per computer, cached (5 minutes on the home), never
   on the page's critical path, never a detail line forwarded (F2, F6).
2. The four things worth a line map to one action each: old → update Mem's command line; unreachable →
   check again; signed_out → sign in again (the link field in place); plugin → connect, by Mem's own
   command.
3. D169's 装上 for Claude Code and Codex is `nmem connect --tool <id> --on-conflict abort` (no tokens, no
   signed-in agent, seconds), judged by the plugin check after; pi, DeepSeek Harness, an update and a
   review keep the task, and so does anything the command didn't put in (the brief says what it said).

**Summary.** `nmem doctor --json` has a stable shape on 0.10.119 and 0.10.120, and its first check
carries a key's tail, so Ducter reads statuses and a few phrases, never forwards details. `nmem connect
--tool` registers Claude Code and Codex by itself, with `--on-conflict abort` to leave another memory
integration alone; pi and DeepSeek Harness are not among its tools. The real register and the abort path
were not run (they would change the author's agents); D375 judges by Mem's plugin check afterwards and
falls back to D169's task.
