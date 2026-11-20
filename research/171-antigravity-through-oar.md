# 171: Antigravity through OAR 0.124, and the 0.95.1 → 0.124.0 bump

> 2026-11-20 · For D415. Sources: `@botiverse/oar` 0.124.0 as installed (its `dist/` and
> `docs/runtimes/antigravity.md`), the OAR repository's history `v0.95.1..v0.124.0` (175
> commits under `packages/oar`, read only, cloned into the session scratchpad), Google's
> `https://antigravity.google/cli/install.sh` and its release manifests (read, never run),
> Google's Antigravity FAQ (read 2026-11-20), and the author's Mac (read only: what is in
> `/Applications/Antigravity.app` and `~/.antigravity`). **No agy ran anywhere**: it is not on
> this Mac's PATH, and installing it was out of scope. Every Antigravity fact below is
> DOCUMENTED (by OAR or Google) or INFERRED; none is VERIFIED by Ducter.

## 1. The OAR bump: what changed between 0.95.1 and 0.124.0 that touches Ducter

Ducter imports only the per-runtime entries, `@botiverse/oar/browser` types and
`@botiverse/oar/testing` (runner `oar.ts` and tests). Read against that:

| OAR change | Breaking? | What it means for Ducter | Done |
|---|---|---|---|
| #953 `observe!`: content after a native turn ended stays outside turns (`ViewMessage` gains `activity`) | for view consumers | Ducter reads events and `status()`, not the view; `busy()` (running or a pending prompt) is unchanged. DOCUMENTED (commit body) | nothing to change |
| #851 removed unused public helper exports; #835 removed the usability policy | yes, for importers | none of them imported; `tsc` clean | — |
| #1004 `launchArgs` rejects OAR-owned flags (`--model`, `--effort`, `--system-prompt*`, `--name`, `--`, …) on claude, qoder, qwen, codebuddy, factory | yes | Ducter's Claude Code args are `--tools`, `--settings`, `--plugin-url`, `--chrome`: none is managed. VERIFIED by reading `harness-facts.ts` and `oar.ts` | — |
| #984 Claude Code: a `status: compacting` frame becomes `compaction_started` (once per agent) | no | a Claude task now logs "compaction started" before "ended", as Codex already did. Registry updated (harness-facts `compactionEvents`) | registry |
| #997 DSH: background job stops, session roots, images and **manual compaction** | no | `Session.compact` now exists on DeepSeek Harness, so 现在压缩 / Compact now works there (it said "can't" before). DSH's `HarnessInfo.images` stays `false` until checked live (todo) | noted |
| #1033 `nativeMemoryDefault`, #1020 user-configuration categories, #1031 `mcpTransports`/`stopTask`, #992 per-installation capabilities, #866 steer/images declared before open | additive | not used yet | — |
| #994 resume ids validated, `--flag=value` argv, Claude session id confirmed; #1003 queued inputs withdrawable; #839 Codex refuses idle queue submissions after an interrupt | behaviour, not API | covered by the existing runner suites (fake and scripted) | tests |
| #1017 Claude: cached CLI updates left to Desktop; #1015 native failures apart from model replies; #962/#821 Codex quota resets and credits | behaviour | account-usage and limit paths unchanged in shape | tests |
| bundled pi 1.5.0 → 1.5.2 (#812, #807) | behaviour | pi via OAR's bundled RPC entry; the pi suites pass | tests |
| DSH floor still `0.2.1-rc.5` | — | `DSH_MIN` unchanged | — |

The lockfile gains OAR's new deps (gray-matter, js-yaml 3.15.2) and pi 1.5.2's (lovely-mermaid
in place of grok-mermaid), and the root workspace's version catches up (0.0.45 → 0.0.99);
installed with Bun 1.4.4, the CI's.

## 2. What Antigravity supports through OAR 0.124

DOCUMENTED (OAR `docs/runtimes/antigravity.md`, `runtimes/antigravity/*.js`):

- **The CLI, not the app.** `agy acp --dangerously-skip-permissions --process-per-session`, one
  ACP process per session; floor **1.5.0** (stable only; prereleases and the retired
  `agy_acp_server` refused). Found at `OAR_ANTIGRAVITY_BIN` alone, else `agy` on PATH, else
  `~/.local/bin/agy`; an old PATH copy doesn't hide a good official one. Platforms: Linux,
  macOS, Windows.
- **Models and effort.** `listModels` opens one temporary ACP session (no prompt), selects each
  model and reads its own `thought_level` menu (Flash: low/medium/high; Sonnet, Opus thinking,
  GPT-OSS: none). Only the current model's effort can be its default.
- **Steer** yes (a second prompt into the running loop; the newest answer settles the turn).
  **Images** yes (ACP image blocks, as initialize advertises). **Queue** OAR's in-memory FIFO.
- **Instructions.** `systemPrompt` refused; `appendSystemPrompt` via
  `_meta.antigravity.systemPrompt.append`, sent again on every resume (resume keeps no model,
  effort or instructions of its own).
- **Refused:** `disallowedTools`, `userConfiguration: "exclude"`, `additionalDirectories`,
  `outputSchema`, `fork`, `goals`, `name`, `serviceTier`, `endTurnProcessesOnAbort`,
  `nativeMemoryDefault`, and any MCP entry with non-empty `env` or `headers` (agy writes them
  in plain text into its conversation database).
- **MCP.** Credential-free stdio and HTTP entries attach on open and resume; tools named
  `mcp_<server>_<tool>`. A stdio server inherits `SessionOptions.env` (which agy's own tools can
  read too).
- **Resume** by id, only in the folder it was made in: `ResumeCwdError` (an
  `UnsupportedOptionError` on `cwd`) otherwise, including an id the native list doesn't show.
- **Context** `usage_update.used` / `.size` (1,048,576 on a Gemini account, 1.5.12); compaction
  is agy's own, `manualCompaction` unsupported; no compaction events.
- **Account usage** agy's own `/usage` (`agy -p "/usage" --output-format json`, no turn).
- **Sign-in** `agy acp --login`: a Google URL, then "paste the authorization code, or the full
  URL of the page you land on"; status `agy models` (exit 0 signed in; "Please sign in…"
  signed out; anything else unknown); sign-out ACP `logout`. On Linux agy finds `xdg-open` on
  PATH to open the link, so a do-nothing one first on PATH keeps a server quiet.
- **Install and update.** Google's installer reads
  `…/manifests/<platform>.json` (`{version, url, sha512}`; 1.5.13 on 2026-11-20, an ~85 MB
  `.tar.gz` holding one `antigravity` binary), checks the sha512, copies the binary to
  `~/.local/bin/agy`, clears macOS's quarantine, then runs `agy install` ("Configuring shell
  environment"); it never overwrites an existing `agy`. agy "automatically self-updates in the
  background during regular runs"; `agy update` replaces that same file.
- **Input cap.** OAR refuses one input over 185,000 UTF-8 bytes (`input_too_large`): agy was seen
  cutting longer ones silently.
- **Failures that look like success** (agy 1.5.9–1.5.12): provider 401/429/5xx after a tool call
  end as `end_turn` with warning text; the individual-quota notice is classed `quota` with a
  reset time.

## 3. The author's Mac (read only, 2026-11-20)

- `/Applications/Antigravity.app` (the desktop app): its `Contents/Resources/bin` holds
  `agy-desktop-helper`, `agy-desktop-script`, `cable_ble_scanner`, `language_server`: **no `agy`
  CLI**.
- `~/.antigravity/antigravity/bin/{agy,antigravity}`: links from 2025-11-24 to
  `/Applications/Antigravity.app/Contents/Resources/app/bin/antigravity`, which no longer exists.
- No `~/.local/bin/agy`, no `agy` on PATH, no `~/.gemini/antigravity-cli/` (the CLI's state).
  `~/.gemini/` holds the app's own folders.

So "installed" here means the app, and the card must say that plainly.

## 4. Google's terms (FAQ, read 2026-11-20)

> "Using third-party software, tools, or services to access Antigravity is a violation of our
> Terms of Service … Such actions can result in suspension or termination of your account."
> "To use a third-party coding agent with Gemini, we recommend using a Gemini Enterprise or
> Google AI Studio API key." Wrapping `agy` inside third-party coding agents or applications "is
> not supported under consumer plans."

OAR runs agy's own login and its own ACP server rather than the credential, and leaves the call
to the host and the user (decided for Raft by its owner). Ducter does the same, and says it on
the card before the sign-in (D415).

## Implications for Ducter

1. **Tasks only, never the partner.** Tool denial, a replaced system prompt and leaving the
   person's own setup out are all refused: the partner's read-only session (principle 6) can't
   be held there, nor a one-shot or a quick web look.
2. **Never a page-reading task** (D241: a browser place leaves the person's own setup out; agy
   can't). A new hard block, `no_web`.
3. **Ducter's MCP over its stdio bridge**: the entry carries only the bridge's command and a
   0600 file path, never the token, so nothing secret reaches agy's database.
4. **Picked, never chosen**: unverified by Ducter, its failures can look like success, and its
   consumer terms are against this use; the ranking puts it after every other agent.
5. **Install like Google's installer, minus the shell-profile step**, to `~/.local/bin/agy`
   where OAR looks; too old → its own `agy update`; broken → replaced; the app alone → said.
6. **Resume elsewhere** falls back to the runner's existing fresh start from the brief and saved
   progress (`resume_rejected`).
7. **Live checks owed** (agy not run here): the list in D415 and `design/todo.md`.

**Summary.** OAR 0.124 drives Google's `agy` CLI ≥ 1.5.0 over native ACP with steer, images,
per-model effort, resume in the same folder, credential-free MCP, its own Google sign-in and
`/usage`; it refuses everything that would hold a read-only partner. Ducter adds it as a work
agent only, behind its stdio bridge, picked rather than chosen, never on web pages, with the
terms said before sign-in. The 0.95.1 → 0.124.0 bump needed no code change for the existing four
beyond the registry; Claude Code now reports compaction starts and DeepSeek Harness takes a
manual compaction.
