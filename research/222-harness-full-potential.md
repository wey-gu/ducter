# 222: Every agent at its full strength inside Ducter

The author asked (2026-11-24): 「我们 codex claude code pi dsh agy 的原生的后台任务还有 subagent 机制有支持么？这里不要有功能剪枝 还有官方的 browser use computer use 还有我们用的 cua driver 是有机最优集成的么？我们能保证在 ducter 里用这些 harness 都能发挥他们原本的潜力和实力么？」

Short version: no feature pruning, and each agent as good inside Ducter as when run by hand.
This report checks, for each of the five agents, its background work, subagents, browser,
computer use, the person's own setup, and how all of it behaves under OAR's turn model. Each
cell gets a mark: **full**, **pruned**, **broken** or **unknown**. The top gaps that were
Ducter's own were fixed in D515.

Tags: VERIFIED (run here, how, version), DOCUMENTED (a source read), INFERRED (reasoned).

Versions on this Mac, 2026-11-24: Claude Code 2.1.331, codex-cli 0.172.0, pi 1.6.0, agy 1.5.16,
OAR 0.124.0 (Ducter's patch only touches `shared/same-directory.js`). No DeepSeek Harness here
(`dsh` not installed), so its cells come from OAR's source.

## 1. How a task's session is built today (VERIFIED in code)

`runner.ts` `specFor` builds every ordinary task (one not in a browser place) like this:
- the brief is appended, never replacing the agent's prompt;
- `permissionMode: "bypass"`, so OAR launches with no approval gate (Claude Code
  `--dangerously-skip-permissions`, Codex `approvalPolicy never` with `danger-full-access`,
  DSH full access);
- `isolateUserConfig: false`: the person's own setup is kept;
- `keepNativeTools: true`;
- Ducter's own MCP server is added.

Per agent (`oar.ts` `adaptSpec`):

- **Claude Code.** The person's settings, plugins, hooks, MCP servers, CLAUDE.md, skills and
  custom agents all load. Denied: Ducter's nine, `DISALLOWED`. Plan mode is denied because the
  person approves plans through Ducter. The rest each have a Ducter equivalent:
  - ScheduleWakeup and Cron×3 → `wait_for`;
  - AskUserQuestion → `report_to_main`;
  - PushNotification and RemoteTrigger → they act on the person's account outside the task.

  `--settings` adds `idleCompaction: false`, a PreCompact hook and the skill-listing budget.
  Claude Code merges hooks across setting sources, so the person's own hooks stay (DOCUMENTED,
  Claude Code settings docs).
- **Codex.** The person's `config.toml`, plugins, apps, hooks, skills and `multi_agent` setting
  all stay. Added: `-c model_context_window`, `model_auto_compact_token_limit` and
  `skills.max_context_tokens`. A folder task (D142) also gets
  `sandbox_mode="workspace-write"` with network on.
- **pi.** The person's own pi with its extensions. The clean flags apply only in a browser place.
- **DeepSeek Harness.** The person's own `DSH_HOME`. The brief is the first message's preamble.
  A Ducter-owned home only when memory is off or in a browser place.
- **Antigravity.** agy's own tools. OAR refuses tool denial and `exclude` for agy, so Ducter
  passes neither. Mem's two steps run through `nmem` (D417). The router never sends agy a task
  that browses (`candidates.ts` `no_web`).

## 2. Background work and the turn model

**Claude Code: VERIFIED live.** This turns D266's INFERRED claim into VERIFIED. The run:
OAR's claude runtime, haiku, a scratch folder, `userConfiguration: "exclude"` so the person's
plugins and hooks stayed out, prompt "run `sleep 20; echo BG-DONE-42` with run_in_background,
end your turn".

| t (s) | event |
|---|---|
| 8.2 | `task_started` {taskType shell, background true, nativeType local_bash} |
| 9.2 | `turn_ended` completed ("started.") |
| 28.3 | `task_updated` completed, `task_ended` completed |
| 28.3 | `turn_active` **with no input id**: Claude Code's own turn |
| 30.4 | `turn_ended`: "The background command finished with exit code 0 …" |

So a Claude Code task's background shells, Monitor and background subagents are counted.
D266 keeps the session open while they run, and Claude Code's own turn takes the result.
**full**

The built-in tools in a `-p` session of 2.1.331 (init event, `--setting-sources project,local`):
Bash, CronCreate, CronDelete, CronList, DesignSync, Edit, EnterWorktree, ExitWorktree,
ListAgents, Monitor, NotebookEdit, PushNotification, Read, RemoteTrigger, ReportFindings,
ScheduleWakeup, SendMessage, Skill, Task, TaskStop, ToolSearch, WebSearch, Write. No computer
use tool. A task keeps Task (Agent), SendMessage, ListAgents, TaskStop and Monitor.

**Codex: VERIFIED live, broken before D515.** The run: OAR's codex runtime, `gpt-6-luna`, low
effort, a scratch `CODEX_HOME` (a copied sign-in, a two-line config, no MCP), prompt "start
`sleep 25; echo BG-DONE-42` with a 1 s yield, don't poll, end your turn".

| t (s) | event |
|---|---|
| 11.1 | `tool_call_started` commandExecution |
| 13.8 | `turn_ended` completed ("started") |
| 36.1 | `tool_call_ended` ok, exitCode 0, content "BG-DONE-42" |
| … | nothing more: **Codex takes no turn of its own** |

OAR emits no task event for a background terminal: the tool call just stays open past the
turn (`observe/agent-status.js` says so: "can arrive after its turn ended (codex background
terminals)"). Before D515, Ducter therefore:
1. nudged at once ("Report status via report_to_main.");
2. counted nothing, so after 15 idle minutes it parked the session and killed the app-server,
   and the bench or build died with it;
3. logged the late output as a step, but never told the agent.

D266's todo already said this ("Codex's background terminals … invisible (and dies at park)").
Codex subagent threads are reported (`subAgentActivity` → tasks, `background: true`). Whether a
subagent's end starts a parent turn is **unknown**. Before D515 Ducter waited 60 s and then
sent the bare nudge, which never said what had ended.

**DeepSeek Harness: DOCUMENTED.** OAR 0.124 `runtimes/dsh/jobs.js` maps `job/registered` to
`task_started` (shell for bash or pwsh) and `job/settled` to `task_ended` with DSH's `detail`.
`projection.js` maps `subagent/start` and `subagent/end` to agent tasks. Both are counted, since
a task still running at its turn's end counts. Whether DSH starts a turn of its own is
**unknown**. Before D515 Ducter waited 60 s, then sent the bare nudge.

**pi: n/a.** pi has no background or subagent tool of its own (`pi --help`). An extension that
adds one stays in an ordinary task.

**Antigravity: unknown.** OAR maps no task events for agy: its session profile says "subagent
transport attribution remains unverified", `attribution: "opaque"`. A background command of
agy's own would be invisible, as Codex's terminals were.

**Waits and wakes (D483) with background work (VERIFIED in code).**
- A task that rests on `wait_for` while a job runs is not nudged (`rests`).
- `park()` re-arms while `bgLive > 0`.
- The archive horizon skips the task.
- Before D515, a resting task was never told when the job ended, because only an owed report
  armed the settle. Claude Code's own turn told it; Codex, DSH and agy had nothing.

## 3. The person's own setup in tasks

**Claude Code: full.** Plugins (Mem's among them), skills (listing budget restored, D282), MCP
servers (deferred behind tool search as in their own session; Ducter's own always loaded),
hooks, CLAUDE.md and custom agents. VERIFIED in code and tests (`task-tools.test.ts`); D282
measured the skill listing.

**Codex: full, except folder tasks (pruned before D515).** VERIFIED live, the same OAR runtime
with a stdio server of "the person's" (`notes`, a tool `save_note` with no read-only mark):

| launch | result |
|---|---|
| OAR default (an ordinary task) | `saved: NOTE-OK-77` |
| Ducter's folder task: `-c sandbox_mode="workspace-write"` | **failed: "MCP tool call requires approval, but approval policy is never"** |
| the same + `-c mcp_servers.notes.default_tools_approval_mode="approve"` | `saved: NOTE-OK-77` |

So in every folder task on Codex, the person's MCP servers (Mem's tools, docs, cua-driver)
were refused. Ducter's own server had been fixed the same way for itself (D142's
`?sandbox=read-only` marks), but the person's never were. Codex 0.172's `features list`
(scratch home) shows `multi_agent` deprecated, on by default, and `multi_agent_v2` stable, off
by default. The clean setup turned off only the first, so a person who enabled v2 kept
subagents in a browser place, against D240.

**pi: full.** Their extensions, skills, context files and prompt templates. With memory off,
`--no-extensions` turns off every extension, not only Mem's (D168, known).

**DeepSeek Harness: full.** Their own home. With memory off, a Ducter-owned home leaves all of
their profiles out, not only Mem's (known, D168).

**Antigravity: full, as far as OAR lets.** agy's own config and plugins. Mem through Ducter's
two steps, or the person's own Mem plugin when it is there (D417).

## 4. Browser and computer use

**Claude Code.**
- Browser: Claude in Chrome through `--chrome`, checked at task open. Not connected:
  cua-driver, and a task that meets "not connected" moves to it in place (D130). **full**
- Computer use: 2.1.331's binary has a computer-use server ("Enable computer use on the user's
  own computer for this conversation …"), but the `-p` tool list has no such tool, and the
  binary says "Claude in Chrome and computer use are not available until …" for some session
  kinds. **pruned by the harness** in `-p`.
- Ducter fills computer use with its own app tools over cua-driver when the task has `needs.app`
  (D235).

**Codex.**
- Browser and Computer Use: tasks keep Computer Use (`cua_repl`) and the bundled browser plugins
  in every place (D130). The DOM-level browser needs the desktop app's access host (research/38).
  **full**, with that limit being Codex's own.
- Computer use in a task that works in the person's Mac apps (`needs.app`): the brief carried
  two routes for the same thing, an inconsistency. D235's section says use the `computer_*`
  tools of Ducter's server (in the background, the commit held for Go at the effect), while
  `codexComputerBrief` said "your Computer Use tool … use it only when the brief needs an app".
  **broken (conflicting)** before D515.

**pi, DeepSeek Harness.** No browser or computer use of their own. Ducter's browser place on
cua-driver (D126, D130) and its app tools (D235). **full** through Ducter.

**Antigravity.**
- Browser: agy's browser is not exposed through ACP (OAR maps none). Ducter never routes a
  browsing task to agy (`no_web`), because OAR refuses `exclude` and tool denial for agy, so the
  person's setup can't be kept out of a session that reads hostile pages (D62). **pruned (by
  OAR's contract; deliberate)**.
- Computer use: Ducter's app tools on a Mac with 用电脑 on (D235). **full** through Ducter.

**cua-driver and the official tools together (VERIFIED in code).**
- cua-driver is the fallback in a browser place (D130).
- For the person's Mac apps it is Ducter's route on every agent (D235, the commit held for Go
  at the effect).
- A person's own cua-driver MCP, configured in their Claude Code or Codex, stays in an ordinary
  task (their own tool); the apps brief directs app work to Ducter's tools.
- After D515 a Codex app task has one route.

## 5. The matrix

Marks after D515's fixes, with the earlier mark in brackets where it changed.

| | Claude Code | Codex | pi | DeepSeek Harness | Antigravity |
|---|---|---|---|---|---|
| 1. Background shells / jobs | **full** (VERIFIED live: counted, kept open, its own turn reads the result) | **full** [broken: invisible, nudged at once, killed at park] (VERIFIED live) | n/a (none of its own) | **full** (counted from OAR's jobs; woken after the settle if it takes no turn) [pruned: bare nudge] | **unknown** (OAR reports no task events) |
| 2. Subagents | **full** (Task/Agent, SendMessage, ListAgents, custom agents; background ones counted; denied only in a browser place, D240) | **full** (person's `multi_agent`; threads counted; v2 now off in a browser place too) [pruned: woken with a bare nudge] | n/a (extensions only) | **full** (subagent tasks counted) | **unknown** (opaque to OAR) |
| 3. Official browser | **full** (Claude in Chrome, checked at open, fallback in place) | **full** (Computer Use + bundled browser plugins; DOM browser needs the desktop app's host) | n/a (Ducter's cua-driver place) | n/a (Ducter's cua-driver place) | **pruned** (never routed web work: OAR refuses exclude; deliberate, D62) |
| 4. Computer use | harness: **pruned** in `-p`; Ducter: **full** (app tools over cua-driver, `needs.app`) | **full** [broken: two routes for apps] | Ducter's app tools: **full** | Ducter's app tools: **full** | Ducter's app tools: **full** |
| 5. Person's plugins, skills, MCP, hooks, memory | **full** | **full** [pruned in folder tasks: every MCP call of theirs refused] | **full** | **full** | **full** as OAR allows (Mem by Ducter's steps) |
| 6a. Turn end while background runs | **full** (no nudge, kept hot, never parked) | **full** [broken] | n/a | **full** | **unknown** |
| 6b. Results reach the task and the Log | **full** (Log step; its own turn) | **full** (Log step with exit code; the wake carries the output's tail) [Log only] | n/a | **full** (wake with DSH's detail) [bare nudge] | **unknown** |
| 6c. Waits (D483) with background work | **full** | **full** (a resting task is woken with the result) [never told] | n/a | **full** [never told] | **unknown** |
| 6d. Flags narrower than the agent's default | denials each with a Ducter equivalent (D282); none else | folder tasks' sandbox (D142, the person's own choice of place) now keeps their MCP; none else | none | none | none (OAR refuses denials) |

What stays not-full, and whose it is:
- Claude Code computer use in `-p`: the harness's.
- agy's browser and the opacity of its background work and subagents: OAR's.
- Codex plugin-provided MCP servers in a folder task: Ducter's, owed. A plugin's server isn't
  named in `config.toml`, and a dotted key for it would create a broken entry.
- Codex goals in ordinary tasks: on by default (stable). Whether a goal's own continuation turns
  interact well with Ducter's report rule is **unknown**; it is not pruned.

## 6. Gaps ranked by who feels them

1. **Codex background terminals (Ducter's, fixed).** Every developer whose Codex task starts a
   build, bench or server and ends its turn. Felt: nagged at once, then the work silently dies
   at 15 minutes, and the result never reaches the agent. Codex is the second agent by use.
2. **Codex folder tasks refuse the person's MCP servers (Ducter's, fixed for config.toml
   servers).** Anyone whose task works in a folder (D142) on Codex. Their Mem, docs and app
   tools fail with an approval error the person can never answer.
3. **Background ends with no turn of their own got a bare "report status" (Ducter's, fixed).**
   This covered Codex subagents, DSH jobs and subagents, and a task resting on a wait. The
   agent was asked for a report about work whose result it had never seen.
4. **Two computer routes in a Codex app task (Ducter's, fixed).** The consumer who asks for
   Keynote or Mail work on Codex. Codex's Computer Use moves their own mouse and holds nothing
   for Go; Ducter's tools run in the background and hold the commit.
5. **multi_agent_v2 left on in a Codex browser place (Ducter's, fixed).** Only someone who
   enabled v2. A subagent there would drive pages without the browser rules (D240).
6. **Codex plugin MCP servers in folder tasks (Ducter's, owed: todo).**
7. **agy's background work and subagents are invisible (OAR's: draft issue, todo).**
8. **agy never takes web work (OAR's: draft issue, todo).**
9. **Claude Code computer use in `-p` (the harness's).** Ducter's app tools cover it; todo to
   re-check when a release lists the tool in `-p`.

## 7. What D515 changed (VERIFIED by tests; the cause by the live runs above)

- `normalize.ts`: a non-MCP tool call still open when its turn completed is background work
  (type shell, said by its command without Codex's `/bin/zsh -lc` wrapper). Its late
  `tool_call_ended` is its end: failed on a non-zero exit, carrying the exit code and the
  output's last 1,500 characters. A call left open by an aborted or failed turn is never
  counted. A task's end keeps the harness's own `summary` and `outputFile`.
- `harness-facts.ts`: `background.ownTurn` per agent:
  - Claude Code "yes" (VERIFIED);
  - Codex "no" (VERIFIED);
  - pi, DeepSeek Harness and Antigravity "unknown".
- `runner.ts`: when the last background job ends between turns and the task isn't finished, the
  task is woken with `backgroundEnded` (what ended, how, the exit code, the output's tail, the
  output file):
  - after 1.5 s for an agent that takes no turn of its own;
  - after the 60 s settle for one not known to;
  - never, when a turn of the agent's own comes first: a turn's end clears the timer.

  Jobs that end during a turn are said before the next input on an agent that won't take its
  own turn. This replaces D266's bare nudge after the settle. A finished task isn't woken for a
  job it left running.
- `oar.ts`:
  - a Codex folder task sets `default_tools_approval_mode="approve"` on each server the
    person's `config.toml` names, unless the server is off or they set an approval of their own;
  - the clean setup also turns `multi_agent_v2` off.
- `browser.ts`: a Codex task with Ducter's app tools is told to use them for every app, never
  `cua_repl`.

## Implications for Ducter

- A harness fact is needed for every behaviour Ducter waits on (`background.ownTurn`), so an
  agent that changes is one row, not a code path.
- Each live check here cost under a cent. A Codex and a Claude Code background run belong in
  `scripts/probe-harnesses.ts`'s live mode before the next agent upgrade (todo).
- What OAR doesn't report can still be read from what it does: an open call outliving its turn
  is a fact, not a guess.

## Summary

Claude Code tasks were already at full strength: background shells, Monitor and subagents
counted, Claude Code's own turn reading the result (now VERIFIED live). Codex was not:
- its background terminals were invisible, nagged and killed at park;
- its folder tasks refused every MCP tool of the person's.

Both were Ducter's doing and are fixed in D515. So are the bare nudge after background work on
agents that take no turn of their own, the two computer routes in a Codex app task, and
`multi_agent_v2` in a browser place. Still open:
- Codex plugin servers in folder tasks (Ducter's);
- agy's opaque background work, subagents and browser (OAR's);
- Claude Code computer use in `-p` (the harness's).
