# 75: What a task actually gets: prompts, built-in tools and user config, per harness

Asked (2026-11-13): does Ducter make tasks weaker than the same harness run by hand? The worry was
that Ducter replaces the harnesses' own prompts. Checked here: what an ordinary task and a browser
task get on each harness (system prompt, built-in tools, the user's config, plugins), what Claude
Code's built-in tools cost per request, where the browser "token diet" (332k → 140k input tokens)
came from, and whether any removed tool was a safety boundary.

Tags: VERIFIED (read in this repo's source at path, or measured here), DOCUMENTED (the vendor's
own `--help` or docs, or an earlier report that verified it), INFERRED (my reasoning).

Versions on this Mac: Claude Code 2.1.322, codex-cli 0.167.2, pi 1.5.2. OAR as pinned in
`packages/runner/package.json`.

## 1. The prompt: appended everywhere, never replaced for a task

- A task's brief is appended: `specFor` sets `appendSystemPrompt: taskBrief(...)`
  (`packages/runner/src/runner.ts`), no `systemPrompt`. VERIFIED.
- OAR maps it per harness (`design/system.md` First-wave harnesses table, `adaptSpec` in
  `packages/runner/src/oar.ts`): Claude Code `--append-system-prompt-file`; Codex
  `developerInstructions` (not `baseInstructions`, which would replace Codex's own); pi
  `--append-system-prompt`; DeepSeek Harness the first message's preamble (or AGENTS.md in a
  Ducter-owned home). VERIFIED (source), DOCUMENTED (OAR 0.95.1 runtime docs, research/34).
- Size: about 1K tokens, about 2.2K with the phone and apps sections. INFERRED from the snapshot
  strings (`packages/runner/test/__snapshots__`).
- The partner (main AI) replaces the prompt on purpose (its persona, eval'd under D175). Out of scope.

## 2. Per harness: what a task gets

| | Ordinary task (default: the user's setup kept) | Browser task, before D239 | Browser task, D239 |
|---|---|---|---|
| **Claude Code** | Claude Code's own prompt + the brief appended. Built-ins: the default set less Ducter's 7 denials (plan mode, Cron×3, ScheduleWakeup, AskUserQuestion: they compete with Ducter's waits and talking to the person). The user's CLAUDE.md, skills, plugins, MCP servers, hooks kept; the Mem plugin off only when memory is off (D168). VERIFIED | `--tools Bash,Read,Write,ToolSearch` (an allowlist) + `userConfiguration: "exclude"` + the cua-driver denials. No Edit, no WebSearch/WebFetch, no Skill, Monitor, NotebookEdit, task tools. VERIFIED (`browser.ts` before this change) | The default built-ins less Ducter's 7 and **Agent, Workflow**; `exclude` and the cua-driver denials unchanged. VERIFIED (tests) |
| **Codex** | Codex's own prompt + `developerInstructions`. The user's `config.toml` as it is (multi_agent, goals, apps, plugins as they set them); Computer Use on (D130); the Mem plugin off by id only when memory is off. VERIFIED | `codexCleanArgs(…, {nativeTools: true})`: every user MCP server off by name, every user plugin off by id except the four bundled browser / computer-use ones, `features.{hooks,codex_hooks,apps,memories,js_repl,goals,multi_agent}=false`, `notify=[]`; plugins, image generation, `computer_use`, `browser_use` kept. VERIFIED | Unchanged. `js_repl` is `removed` in 0.167.2 (`codex features list`), so that override is a no-op there. `goals` and `multi_agent` now stay off on purpose (§5), and the docs say so. |
| **pi** | pi's own prompt + `--append-system-prompt`. Built-ins pi's default `read, bash, edit, write` (grep/find/ls are "off by default" in pi itself, `pi --help` 1.5.2). The user's extensions, skills, context files kept; `--no-extensions` only when memory is off (research/48 M3). VERIFIED / DOCUMENTED | `PI_CLEAN_FLAGS`: `--no-skills --no-context-files --no-prompt-templates --no-extensions --no-themes`. All five are the user's own resources (DOCUMENTED, `pi --help`). No built-in tool is removed: no `--tools`, `--no-tools` or `--exclude-tools` is passed. `--no-extensions` also drops pi's built-in extensions, which come from the host's `extensionFactories` (VERIFIED, read in pi's bundle: `builtinExtensions` = the runtime's factories); Ducter's MCP still answers under these flags (research/50, the pi partner eval). | Unchanged. |
| **DeepSeek Harness** | DSH's own prompt; the brief as the first message's preamble; the user's DSH home kept. VERIFIED | **Keeps its own setup** (no clean home): the user's profiles, plugins and AGENTS.md stay (`withBrowser` comment, `system.md`). No capability lost; the gap is the other way (§6). VERIFIED | Unchanged; open in `todo.md`. |

One thing pi's `--no-context-files` also drops: the **project's** AGENTS.md / CLAUDE.md, not only
the user's. For a browser task that costs nothing (its folder is a fresh scratch folder). It matters
only for a repo task under `isolateUserConfig` (opt-in, off by default). INFERRED from `pi --help`
("Disable AGENTS.md and CLAUDE.md discovery and loading"); recorded in `todo.md`.

## 3. Claude Code's built-in tools: the real per-request cost

Method: `claude -p "Reply with just: ok" --model haiku --strict-mcp-config --setting-sources ""
--no-session-persistence --output-format json`, a scratch cwd, each variant twice; tokens are
`input + cache_creation + cache_read` from `usage`. The tool list comes from the `init` message of
`--output-format stream-json --verbose`. Total spend under $0.02. The one project folder the runs
created under `~/.claude/projects` was deleted afterwards. VERIFIED.

| Built-in set (`--tools` / `--disallowedTools`) | Tokens per request | 2nd identical call |
|---|---|---|
| none (`--tools ""`) | 3,800 | 649 cache read + ~3.1K fresh (the empty set isn't cached as a prefix) |
| the 4 (Bash, Read, Write, ToolSearch): browser tasks before D239 | **6,628** | 6,628 cache read, 0 written |
| a middle set (+ Edit, Grep, Glob, WebFetch, WebSearch, Agent) | 12,182 | 12,182 cache read |
| default (24 tools, 13 of them deferred behind ToolSearch) | 18,753 | 18,751 cache read |
| default less Ducter's 7 denials: an ordinary task today | 17,042 | |
| default less Ducter's 7 and Agent, Workflow: **a browser task under D239** | **12,168** | |

Marginal cost on top of the 4 (one tool added each time): Edit +350, Glob +290, Grep +1,290,
WebSearch +760, WebFetch +630, NotebookEdit +630, TaskCreate +630, Agent +2,290, Skill +3,140,
**Workflow +8,240**. `TodoWrite` adds 0: it no longer exists in 2.1.322 (an allowlist that names
it silently gets nothing; an allowlist rots as the harness renames tools). The default set has no
Grep/Glob (2.1.322 lists neither in `init`); naming them adds them.

So D239's browser task costs **+5.5K tokens per request** over the old four, and an ordinary task
costs +10.4K over them. On a repeated call in one session the whole tool block is a cache read,
which Anthropic prices at a tenth of fresh input (DOCUMENTED, prompt caching). In the window
(D135: tasks compact at 160K of 200K) 5.5K is 3.4%.

## 4. Where the 332k → 140k came from

The measurement is one live HN lookup before and after commit `1f0827ea` (2026-11-09), which
changed three things at once: (a) the user's Claude config left out (their MCP servers, claude.ai
connectors, plugins with their skills and hooks, CLAUDE.md), (b) ~40 of cua-driver's ~50 MCP tools
denied, (c) the built-ins cut to four. **The old measurement does not separate them** (VERIFIED: the
commit message and `onboarding.md` give one pair of totals; no per-request numbers were kept).

Estimate (INFERRED): at today's numbers (c) is ~12K tokens per request (default 18.75K vs the four
6.6K). If the lookup took about 10 model requests, (c) explains roughly 100–120K of the 192K saved,
and (a)+(b) the rest. Re-running "before" with the user's own config was not done: it would run the
user's own hooks (their Mem plugin, RTK) against a live account. D239 gives back about half of (c)
(+5.5K a request) and keeps (a) and (b), so the same lookup would land around 190K (INFERRED),
mostly cache reads. A live rerun of the HN lookup was not done (it needs the author's Chrome and
running instance, which this session must not touch).

## 5. Was any removed tool a safety boundary?

The browser boundary that matters is what reaches the user's accounts and their real Chrome
without the brief's rules (D62: Go before sign-in/pay/submit/post, page text is data; D130: its
own window). D126 already made "never touch the user's Chrome" a non-goal; the brief's rules are
the boundary now.

- **Edit, Grep, Glob, NotebookEdit, Monitor, task tools:** local files and processes. Bash, kept
  all along, can do everything they do. No boundary. INFERRED (Bash is a superset).
- **WebFetch / WebSearch:** a plain HTTP fetch with no browser cookies, and a server-side search.
  Neither reaches Chrome or a signed-in session; Bash's `curl` already could fetch and exfiltrate.
  No boundary. INFERRED.
- **Skill:** under `exclude` only project skills load (the user's skills, commands, agents and
  plugin skills are absent; DOCUMENTED, OAR's native regression test, research/08). A browser
  task's folder has none. No boundary.
- **Agent and Workflow: yes, a boundary.** Measured: with `--append-system-prompt "The secret word
  is PLUM…"`, a general-purpose subagent asked for the secret word answered "NONE. My
  instructions don't contain a secret word." VERIFIED (2.1.322, haiku, one run). A subagent gets
  the parent's MCP tools but not its appended brief, so it would drive the browser (cua-driver,
  Claude in Chrome, Ducter's browser) with none of the Go, untrusted-page or own-window rules.
  Workflow starts agents the same way (INFERRED: same mechanism). These two stay denied in a
  browser place.
- **Codex `multi_agent`:** whether a Codex subagent carries the thread's `developerInstructions`
  was not checked. Under the clean setup a task has Codex's browser or Computer Use, whose rules
  are in that brief, so it stays off (as the code already did; the docs said otherwise). Codex
  `goals` stay off: Ducter owns when a task's turn ends.
- **The user's config (`exclude`):** keeps the user's MCP servers (mail, chat, their own browser
  automation), plugins and hooks out of a session that reads hostile pages. That is the real
  boundary against a page steering the task into the user's accounts; it stays.

Found on the way, not changed (recorded in `todo.md`):
- An ordinary Codex task keeps the user's `multi_agent` with Computer Use on (D130): the same
  question as above, outside browser places.
- The default Claude Code set carries `PushNotification` and `RemoteTrigger`; Ducter owns talking
  to the person and starting work. What they do headless under `-p` is unchecked.
- `Workflow` costs 8.2K tokens in every ordinary task.

## Implications for Ducter

1. A browser place should change **which of the user's config loads**, not **which of the
   harness's own tools exist**. Drop Claude Code's `--tools` allowlist; deny only Agent and
   Workflow, the two that start a model without the brief. (+5.5K tokens a request, cached.)
2. Codex: keep the clean setup as built; document why `multi_agent` and `goals` are off for tasks.
3. pi: its clean flags remove only user resources; nothing to change for browser tasks.
4. DeepSeek Harness: no capability lost; its browser tasks keep the user's setup, an open gap.
5. Tool allowlists rot (`TodoWrite` is gone in 2.1.322): prefer naming what to deny.

## Summary

Tasks append Ducter's brief on every harness and never replace the harness prompt. The one real
weakening was Claude Code browser tasks: four built-ins, no Edit, WebSearch or WebFetch. The
built-ins cost 6.6K tokens per request with four, 12.2K with the default set less the agent
starters, 17.0K for an ordinary task; repeated calls read them from cache. The old 332k → 140k
mixed three changes and can't be split; the built-ins were roughly half of it. No removed
built-in was a safety boundary except Agent and Workflow: a Claude Code subagent does not see the
appended brief (verified), so it would use the browser without its rules. Feeds D239.
