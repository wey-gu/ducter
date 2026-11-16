# 103 · Agent sessions on the person's own computer: where they live, what they hold, how to carry one on

Date: 2026-11-17. For D299: earlier Claude Code, Codex and pi sessions the person ran outside
Ducter show up in 做过的事 / Past tasks and can be carried on in Ducter. Builds read: Claude Code
2.1.325, codex-cli 0.169.0, pi 1.5.2 (all on the author's Mac), @botiverse/oar 0.95.1 (in
`node_modules`).

Tags: VERIFIED = run here against the installed binary, on a scratch home; DOCUMENTED = read in
the agent's own help text, OAR's source or the binary's strings; INFERRED = judgment.

## 1. Method

Nothing touched the person's real `~/.claude`, `~/.codex`, `~/.pi` or any of their sessions'
contents. Each agent ran with `HOME` (and `CLAUDE_CONFIG_DIR`, `CODEX_HOME`) pointed at a scratch
home in the session's scratchpad, its model answered by a capture proxy on 127.0.0.1 that
records each request body and replies "ok" (the proxy of research/92). A scratch git repo on a
branch `fix/flaky-parser` was the working folder; a second empty folder tested resuming from
elsewhere. One prompt by hand (`claude -p`, `codex exec`, `pi -p`), then a resume by id, then a
resume by id from the other folder. The record shapes below are from those files; the test
fixtures in `packages/core/test/fixtures-agents.ts` are written from scratch in the same shapes.
For sizes (§4) only file sizes were read on the author's machine (`stat`), never contents.

## 2. Where each agent keeps sessions, and what a record says

| | Claude Code | Codex | pi |
|---|---|---|---|
| Folder (macOS and Linux alike) | `$CLAUDE_CONFIG_DIR` or `~/.claude`, then `projects/<cwd with every non-alphanumeric as ->/<session id>.jsonl` (VERIFIED) | `$CODEX_HOME` or `~/.codex`, then `sessions/YYYY/MM/DD/rollout-<local time>-<thread id>.jsonl`; archived ones in `archived_sessions/` (VERIFIED) | `~/.pi/agent/sessions/--<cwd, / as ->--/<UTC time>_<id>.jsonl` (VERIFIED); `PI_CODING_AGENT_DIR` moves the agent folder (INFERRED from OAR's `piAgentDir`, which mirrors pi) |
| Id | the file name, and `sessionId` on each record | the UUID ending the file name; `session_meta.payload.id` | `type:"session"` line's `id`, and the file name's tail |
| Folder it ran in | `cwd` on each `user`/`assistant`/`attachment` record | `session_meta.payload.cwd`; each turn's `turn_context.payload.cwd` | the `session` line's `cwd` |
| Branch | `gitBranch` on each record (`HEAD` when detached) | `session_meta.payload.git.branch` (+ `commit_hash`) | not recorded |
| Model | `message.model` on `assistant` records | `turn_context.payload.model` | `model_change.modelId`; `message.model` on replies |
| When | `timestamp` on records; the file's mtime is the last write | `session_meta.payload.timestamp`; record `timestamp` | `session` line `timestamp` |
| The person's words | `type:"user"`, `message.content` a string or text blocks; tool results ride as `user` records with `tool_result` blocks; `isMeta` and `<command-…>`/`<local-command-…>` text are the harness's | `response_item` with `payload.role:"user"`, `content[].input_text`; the first user item is `<environment_context>` (the harness's) | `type:"message"`, `message.role:"user"`, `content[].text` |
| The agent's words | `type:"assistant"`, one content block per record (`text`, `tool_use`, `thinking`) | `response_item` `role:"assistant"` `output_text`; tool calls are `function_call` items | `message.role:"assistant"`, `content[].text` |
| A name | `custom-title` (`customTitle`, from `/rename`), `ai-title` (`aiTitle`, Claude Code's own), older `summary` (DOCUMENTED, binary strings); `last-prompt` holds the last words (VERIFIED) | `/rename` writes `thread_name_updated` (INFERRED from the event name); the `state_5.sqlite` `threads` table has `title`, `name`, `first_user_message`, `git_branch` (VERIFIED schema; internal, versioned in its file name, not read by Ducter) | `session_info.name` (VERIFIED with `--name`) |
| Other records | `queue-operation`, `attachment` (environment, skills, date), `api-request*`, `cost-state`, `mode`, `pr-link` | `world_state`, `event_msg` (task_started, token_count, task_complete), `token_usage_record` | `model_change`, `thinking_level_change` |

Claude Code keeps a subagent's transcript inside a folder named for the session, not at the top
level (DOCUMENTED); only top-level files are sessions.

## 3. Carrying one on

| | By hand | Through OAR (what Ducter runs) |
|---|---|---|
| Claude Code | `claude --resume <id>` (VERIFIED). It finds the session **from any folder**: run from the other folder, it resumed the same id, the earlier turn was in the model request, it **appended to the same file** in the original project folder, and the new turn's `cwd` was the other folder | `SessionOptions.resume` = `--resume <id>` with the session's `cwd` (DOCUMENTED, `runtimes/claude/launch.js`; `--continue`/`--resume` in launch args are refused in favour of it) |
| Codex | `codex resume <id>` / `codex exec resume <id> "…"` (VERIFIED). From the other folder (outside a trusted git folder it needs `--skip-git-repo-check`) it resumed, appended to the same rollout file (14 → 27 lines), the earlier turn was in the request, and the new `turn_context.cwd` was the other folder | `thread/resume` by id over app-server (DOCUMENTED, research/92 §5) |
| pi | `pi --session <id>` (VERIFIED): same folder resumes in place and appends (a `--name` adds `session_info`); another folder asks "Session found in different project … Fork this session into current directory? [y/N]" | per-folder lookup; another folder is `SessionNotFoundError` (DOCUMENTED, `runtimes/pi/resolve.js`) |

So all three resume by id and append to the session's own file; none writes a second copy unless
asked (`--fork-session`, pi's fork). Claude Code and Codex would run a resumed session in
whatever folder they are started in, which would point the old turns' paths at the wrong place:
Ducter starts it in the session's own folder (INFERRED, and what the person does by hand).

## 4. Size and privacy

On the author's Mac (sizes only): Claude Code 135 session files in 170 project folders, 1.2 GB,
median 297 KB, p90 909 KB, largest 386 MB; Codex 122 files, 3.4 GB, median 528 KB, p90 41 MB,
largest about 1 GB; pi 18 files. VERIFIED (`stat`).

- A listing must never read a whole file: the head until it has the folder, branch, model and
  first words (at most 1 MB), and the last 128–256 KB for a name and the last words. A history
  reads only the last 8 MB. A 12 MB synthetic session summarizes in well under 500 ms
  (`local-agents.test.ts`). VERIFIED.
- The files hold everything the person and agent said, tool output included (file contents,
  command output, sometimes secrets). INFERRED: read them only on the person's own home, only
  when Past tasks asks, keep only the few lines a card needs, and send them only to the person's
  own clients, as Ducter does with its own tasks. Nothing goes to a model to list them.
- Ducter's own tasks run the same agents with the person's own setup, so their sessions sit in
  the same folders: the Log knows each task's native id (`session started`), Ducter's folders
  (its data folder, the Ducter folder's worktrees) and temporary folders tell the rest.

## Implications for Ducter

- One small shared reader (`packages/core/src/local-agents/`): list projects, list sessions,
  summarize one, read the conversation at its end. Head-and-tail reads, cached by size and mtime.
- Show them by default in Past tasks as a quiet section under Ducter's own, searchable by the same
  words; let the person hide one agent's sessions for good.
- Carry one on as a Ducter task in the session's own folder, working there directly (no copy):
  the same agent resumes the very session by id (it appends, as by hand); another agent starts
  from what the session said (D282's condensed start). The transcript shows the earlier turns
  as history. Ducter never writes the session file itself.
- Not yet: a worker's sessions (needs an op over the worker link), Codex's thread names from its
  database, pi's resume through OAR from a moved folder.

**Summary:** Claude Code, Codex and pi keep each session as one JSONL file under the person's
home, with its folder, branch (not pi), model, time and words in plain records; all three resume
by id and append to that same file. Sessions reach a GB, so Ducter reads only their ends. D299
lists them in Past tasks and carries one on in its own folder.
