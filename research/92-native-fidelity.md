# 92. Native fidelity: a Ducter task against the agent run by hand, and switching inside one task

Date: 2026-11-16. Question (the author, moving his daily coding-agent work into Ducter): "单独 focus
的高度还原原版 harness 的原本能力和好的原始 system prompt / skill / tool", and "在同一个任务下切换
harness/model 等，不用新建 task session". What does a Ducter task send that the agent run by hand
doesn't, what does it leave out, and can a task change model, effort or agent without a new task?

Tags: VERIFIED (measured here, or read in this repo's source at the path), DOCUMENTED (the
vendor's own text or its shipped source, read here), INFERRED (reasoned, not run).

Builds: Claude Code 2.1.325, codex-cli 0.169.0, @botiverse/oar 0.95.1 (in `node_modules`).

## 1. Method

No request touched a real model, the person's real `~/.claude`, `~/.codex`, `~/.ducter` or any of
their sessions. A capture proxy on 127.0.0.1 recorded each model request's body (never its
headers) and answered "ok" in the Anthropic Messages and OpenAI Responses stream shapes. A scratch
"person" carried marker resources in each place a person keeps them:

- Claude Code (`CLAUDE_CONFIG_DIR`): a global `CLAUDE.md`, a skill, a slash command, a subagent, a
  `SessionStart` hook that adds context, an MCP server (stdio) in `.claude.json`;
- Codex (`CODEX_HOME`): a provider pointing at the proxy (`wire_api = "responses"`), a global
  `AGENTS.md`, a skill, a prompt, the same MCP server;
- a git repo with `CLAUDE.md`, `AGENTS.md` and a project skill.

"By hand" is `claude -p "say ok" --model haiku` and `codex exec "say ok"` in that repo. "Ducter" is
the real runner (`createRunner`) and the real OAR port (`createOarHarnessPort`) opening an
ordinary repo task in it, with a fake core serving the task's MCP tools (report_to_main and
checkpoint only; the real core adds log_search, log_read, wait_for, memory_search and the
place's own tools). The launched argv was logged by a wrapper on `PATH`. Sizes are characters of
the first request with tools; tokens are characters / 3.6 (INFERRED, no tokenizer was called).
The scripts stay in the session's scratchpad; nothing third-party ran.

## 2. The table (VERIFIED)

What a task's first request carries, by hand and in Ducter, before and after D282.

| | Claude Code by hand | Ducter, before | Ducter, after D282 |
|---|---|---|---|
| Launch | `claude -p` | `-p --input-format stream-json --output-format stream-json --verbose --replay-user-messages --include-partial-messages --session-id <id> --model <m> --dangerously-skip-permissions --append-system-prompt-file <brief> --settings {idleCompaction:false, hooks.PreCompact} --mcp-config <ducter> --disallowed-tools <10>` | the same; `--settings` adds `skillListingBudgetFraction: 0.05`; 9 denied |
| Env | | `CLAUDE_CODE_DISABLE_1M_CONTEXT=1`, `CLAUDE_CODE_AUTO_COMPACT_WINDOW=200000`, `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=88.9` (D135) | same |
| System prompt | the harness's own (9.7K chars), first line "You are a Claude agent, built on Anthropic's Claude Agent SDK." | the harness's own, **appended** (not replaced) with the brief (+4.8K chars, ~1.3K tokens); first line "You are Claude Code, Anthropic's official CLI for Claude, running within the Claude Agent SDK." | same |
| Person's and project's `CLAUDE.md` | yes (first user message) | yes | yes |
| `SessionStart` hook context | yes | yes | yes |
| Person's subagents | yes | yes | yes |
| Person's MCP server | yes (deferred behind ToolSearch) | yes | yes |
| Person's and project's skills, commands | **with descriptions** | **names only** | **with descriptions** |
| Built-in tools sent up front | Agent, Bash, Edit, ListAgents, Read, ReportFindings, ScheduleWakeup, Skill, ToolSearch, Workflow, Write (+deferred) | less ScheduleWakeup and **Workflow**; + ducter's | less ScheduleWakeup; Workflow back; + ducter's |
| Permission mode | default (asks) | bypass (D16) | bypass |
| Request size | 51.4K chars (~14.3K tok) | 49.3K (~13.7K) | 54.9K (~15.3K) |

| | Codex by hand | Ducter, before | Ducter, after D282 |
|---|---|---|---|
| Launch | `codex exec` | app-server; `thread/start {developerInstructions: <brief>, approvalPolicy: never}`, `-c model_context_window=200000 -c model_auto_compact_token_limit=160000` | + `-c skills.max_context_tokens=5440` |
| Base instructions | Codex's own (17.0K chars) | Codex's own, unchanged | same |
| The brief | | a developer message of its own (5.2K chars), **after** Codex's base instructions and **before** the skills, AGENTS.md and environment | same |
| Person's and project's `AGENTS.md` | yes | yes | yes |
| Person's skills (`CODEX_HOME/skills`, `~/.agents/skills`) | 114, listing 18.0K chars | 114, **descriptions cut**, listing 13.8K | 114, listing 18.0K (same as by hand) |
| Tools | exec_command, write_stdin, MCP resources ×3, request_user_input, view_image, multi_agent_v1, goals ×3, web_search, the person's MCP | the same + `mcp__ducter` | same |
| Sandbox | `codex exec`'s read-only | danger-full-access, approvals never (D16) | same |
| Request size | 58.3K chars | 62.3K | 66.6K (the restored skill listing) |

Two causes found, one per agent, both from D135's small window:

- **Claude Code** sizes its skill listing at `window × 4 chars × skillListingBudgetFraction`
  (default 0.01; DOCUMENTED, the shipped binary's settings schema: "Fraction of the context window
  (in characters) reserved for the skill listing … When the listing exceeds this, descriptions
  are shortened to fit"). `CLAUDE_CODE_DISABLE_1M_CONTEXT=1` takes the window from 1M to 200K and
  the budget from 40K to 8K chars. Bisected: of every flag and variable Ducter sets, only that one
  turns the listing to names only; `--settings {"skillListingBudgetFraction":0.05}` brings the
  descriptions back. A person with the author's ~150 skills gets names without descriptions in
  every task before this: the model can't tell when a skill applies.
- **Codex** sizes it at about 2% of `model_context_window` (measured: 18.0K chars at its default,
  13.8K at 200K; `skills.max_context_tokens` overrides it: 5000 → 16.8K, 20000 → 32.8K). 5440 is
  2% of the default 272K window, and gave exactly the listing by hand (18,009 chars both).

Not compared: an interactive (TTY) Claude Code session. Its first line is "You are Claude Code,
Anthropic's official CLI for Claude." (INFERRED from the `-p` variants above: appending a prompt
switches `-p` to the Claude Code identity, which is closer to the interactive one than `-p` alone).

## 3. What Ducter takes away, each re-justified

From first principles: a task should be the person's own agent, and Ducter leaves out only what
would act around it or without the brief.

| Left out | Why, now | Verdict |
|---|---|---|
| EnterPlanMode / ExitPlanMode | Approving a plan is the person's turn; headless, nobody is at Claude Code's prompt. A plan in a task is a `report_to_main` with the plan and a default (Go = do it). | keep denied |
| ScheduleWakeup, CronCreate/List/Delete | A second clock, invisible on On hand, that dies when Ducter parks the session. D267's `wait_for` with a time covers every use (`/loop` included: the task calls it again on waking). | keep denied |
| AskUserQuestion | Same as plan mode: the person is never at the harness's prompt; `report_to_main` asks with a default. | keep denied |
| PushNotification | A push to the person's terminal and phone around Ducter, which is the one voice. | keep denied |
| RemoteTrigger | Scheduled remote agents on the person's claude.ai account that outlive the task and never show on On hand. | keep denied |
| **Workflow** | D241 denied it as "a fan-out of agents that never see the brief". So does Agent, and D241 kept Agent because a subagent's result returns to the task, which holds the brief. The same holds for a workflow's agents. Only a browser place (whose tools enforce none of D62's rules) needs both denied. Cost ~2K tokens a request, a cache read after the first. | **allowed** in ordinary tasks; still denied in browser places and for the read-only partner |
| Codex `request_user_input`, goals | Present by hand and in a task; not touched. `request_user_input` only offers itself in Codex's plan mode (INFERRED); goals stay the person's (D241). | unchanged |

What Ducter adds: the brief (appended; only what Ducter alone knows: the ask, where, how to
report), its MCP server, bypass permissions (D16), the small window and its PreCompact note (D135).

## 4. Slash commands typed into a task (VERIFIED, Claude Code)

Sent as a stream-json user message, the way the runner sends a turn:

| Typed | Claude Code headless |
|---|---|
| `/marker-cmd` (a command of the person's) | expanded and run |
| `/marker-skill` (a skill) | expanded and run |
| `/review` | its review prompt ran |
| `/compact` | ran ("Not enough messages to compact.") |
| `/context`, `/cost` | answered with the context table, the cost |
| `/clear` | ran |
| `/model sonnet` | "Set model to `Sonnet 5.5` for this session only" |

54 slash commands are listed in the session's init. Codex's app-server takes no slash commands
(they are its TUI's); a `/word` reaches the model as text (DOCUMENTED: OAR's codex runtime sends
`turn/start` text; INFERRED that the model treats a skill name as a hint).

So: everything goes to Claude Code as typed, except `/model` and `/effort`, which Ducter runs on
every agent with the same meaning, so the card and On hand stay true (a `/model` Claude Code ran
by itself would leave the card on the old model); on Codex a bare `/compact` is OAR's manual
compaction (`Session.compact`, Codex only).

## 5. Switching inside one task (VERIFIED against the real binaries, model answered by the proxy)

OAR (DOCUMENTED, `runtimes/codex/open.js`): "Same-runtime model switch = resume the same thread id
with a new model. thread/resume accepts `model` … and applies it when the thread is loaded cold";
the effort is set on the loaded thread after a resume. Claude: `--resume <id> --model <m> --effort
<e>` (`runtimes/claude/launch.js`). OAR's Session has no mid-session model setter.

The real runner and OAR, one task, four turns (`retune.ts` in the scratchpad):

| Step | Claude Code first | Codex first |
|---|---|---|
| open | haiku, session A | gpt-5.4-mini, thread A |
| model + effort in place | sonnet, effort high, **same session A**, the first turn still in the request | gpt-5.5, effort high, **same thread A**, the first turn still in the request |
| to the other agent | Codex, new thread, seeded with the carry-over; the person's words since the last report in it | Claude Code (Opus), new session, seeded likewise |
| back again | sonnet, **session A resumed**, its own earlier turns in it, told "You are back on this task" | gpt-5.5, **thread A resumed**, likewise |

Lossless: the same agent with another model or effort (its native session), and an agent coming
back to its own earlier session (plus what happened since); the worktree, the branch, the Log,
the transcript, the card and On hand in every case. Condensed: another agent's first session on
the task. It gets the brief (its instructions), the last six checkpoints, the last report and its
questions with their defaults, the person's words since, the agent's last words, and what the
branch holds (commits, files, lines, uncommitted); it does not get the other agent's tool calls,
reasoning, or its compacted context, and reads the files and git for the rest.

Not run: pi (not installed here) and DeepSeek Harness; a real model on any of this; Codex's
`/compact` through OAR (scripted only); a switch back after a restart on a worker.

## Implications for Ducter

1. Size the skill listing for a task as the person's own session would (Claude Code
   `skillListingBudgetFraction: 0.05`, Codex `skills.max_context_tokens = 5440`), keeping D135's
   small window.
2. Allow Workflow in ordinary tasks; keep the other nine denials, each for its own reason.
3. Keep the brief appended (Claude Code's appended system prompt, Codex's developer instructions):
   neither replaces the harness's prompt, and both sit where each harness puts instructions that
   aren't the project's.
4. `/model` and `/effort` are Ducter's; everything else goes to the agent as typed; Codex's bare
   `/compact` is OAR's.
5. Switch the same agent's model or effort in place (resume by id); hand another agent a richer,
   automatic carry-over; resume an agent's own earlier session when the task comes back to it.

## Summary

A Ducter task already appended its brief and kept the person's CLAUDE.md, AGENTS.md, hooks,
subagents and MCP servers. Two real losses were found, both side effects of the small window:
Claude Code tasks listed the person's skills and commands by name only, and Codex tasks cut every
skill description short. Both are restored to the size by hand. Of the ten Claude Code tools
Ducter denied, Workflow had no reason the kept Agent doesn't share; it is allowed again. Claude
Code runs every slash command headless, `/model` included; Ducter keeps `/model` and `/effort` so
the card stays true. Model and effort switch inside the task on the same native session, and an
agent switched away and back resumes its own session, verified against both binaries; a first
switch to another agent is the one condensed step.
