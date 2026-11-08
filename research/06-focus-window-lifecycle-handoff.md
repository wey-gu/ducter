# 06 — Focus Window lifecycle and context handoff: subagent / delegated-session design

Researched 2026-11-08. This builds on `01`–`03` and does not repeat them: OpenClaw announce, dsh-superagent's ≤600-char
reports, Raft's cold recycle, and the harness control surfaces are already covered there.
Clones (read-only, nothing executed) are at
`<scratch>`, written `R/` below.
**V** = verified in source or official docs. **I** = my inference. **3P** = secondary source.

---

## 0. One-paragraph answer

Everyone in 2026 has converged on the same skeleton. A child has its own context, a parent-addressable id, a final
answer pushed back as a typed message, follow-ups to the *same* child by id, a depth cap, a concurrency cap, and an
optional worktree. They disagree on four things, and those four are what matter for Ducter:
1. **What the child starts with.** Codex v2 and Claude Code now *fork by default*. OpenClaw, grok-build, pi and Lody
   send a written brief by default.
2. **Whether "idle" and "resident" are the same thing.** Codex, Claude Code agent view and dsh separate them.
3. **Whether the child may talk to the human.** Claude Code subagents and grok-build cannot. dots, Lody and Claude
   Code teammates can.
4. **Whether completion is a free-form final message or a typed report.** Codex, Claude Code and pi use the final
   message. dsh-superagent uses a typed report.

Ducter differs from all of them in one way. The *parent* is a sessionless, multi-topic channel with a persona, and the
child usually runs on a *different harness*. So forking the parent is rarely possible and rarely wise. What matters
is the **brief, the report, and an explicit residency layer that is separate from attention state.**

---

## 1. Evidence by system

### 1.1 Codex (`R/codex/codex-rs`, MultiAgentV2)
- **Tools** (V, `core/src/tools/handlers/multi_agents_spec.rs:194-371`):
  - `spawn_agent`, `send_message`: "does not trigger a new turn".
  - `followup_task`: "trigger a turn if it is idle; if running, deliver at message boundaries".
  - `wait_agent`, `interrupt_agent`: "remains available for messages and follow-up tasks".
  - `close_agent`: "Completed agents remain open and count toward the concurrency limit until closed".
  - `list_agents`.
  - Agents get hierarchical *task paths* (`/root/task1/task_3`, lines 800-806).
- **Fork is the default.** `fork_turns`: "Parent history to inherit. Defaults to `all`; use `none` to start without
  parent history" (`:665-668`, V). Full-history forks "inherit the parent model and reasoning effort and do not accept
  overrides" (`prompts/src/multi_agent_instructions.rs:10`, V).
  - `agent/control/root_handoff.rs:1-3` narrows the inherited history: "User inputs bypass relevance filtering; only
    assistant context is narrowed" to the "handoff windows" around `spawn_agent/send_message/followup_task` calls (V).
    So a Codex fork is *filtered*, not raw.
- **Delegation guidance in the tool description** (V, `:734-770`). Spawn only on explicit user/AGENTS.md permission.
  Keep critical-path work local. Use "disjoint write set[s]". "Avoid issuing multiple delegate calls on the same
  unresolved thread". "Call wait_agent very sparingly". "Do not redo delegated subagent tasks yourself".
- **States** (V, `protocol/src/protocol.rs:2054-2069`): `PendingInit → Running → Interrupted | Completed(msg) |
  Errored | Shutdown | NotFound`. Status is derived from events (`core/src/agent/status.rs:6-31`). `BudgetLimited`
  aborts map to `Interrupted`, which is resumable, not final.
- **Residency is separate from status** (V). `agent/control/residency.rs:1`: "unloads exact idle runtimes while
  preserving their state". The returned outcome is `Busy | Evicted | NotCurrent`. The test
  `scenarios_agent_eviction_tests.rs:14` is `idle_eviction_preserves_worker_context_for_followup`. Unread mail survives
  eviction (`agent/control/api.rs:142`).
- **Return path** (V). The completion is rendered as `Message Type: FINAL_ANSWER / Task name / Sender / Payload`
  (`core/src/context/inter_agent_completion_message.rs:42-46`). The payload is the final message *verbatim*. Only
  errors are truncated, to 900 tokens, and they come with a next action: "If you still need this agent… give it
  another task" (`core/src/session_prefix.rs:9-14`). After repeated Guardian (safety) denials: "Tell the user… Do not
  resume this agent… until the user explicitly confirms" (`:14`).
- **Limits** (V). `DEFAULT_AGENT_MAX_THREADS = 6` (`core/src/config/mod.rs:270`). There is also
  `default_subagent_model`, per-role configs and a rollout token budget (`agent/control/budget.rs`). Partial answers
  carry a `phase` (`partial_answer | commentary | final_answer`, `core/tests/suite/scenarios_partial_answers.rs`).
- **Siblings.** All agents share one cwd: "edits made by one agent are immediately visible to all other agents"
  (`prompts/src/multi_agent_instructions.rs:15-18`, V). There is also an opt-in **agent message board**, Slack-like
  SQLite channels with read-only/read-write connections (`ext/agent-message-board/README.md`, V).
- **Cross-harness import** (V, `external-agent-migration/src/sessions/`). Codex detects recent **Claude Code ("cla")
  and Cursor ("cur") sessions** and imports them as Codex threads. Messages are reduced to `{role, text, timestamp}`
  (`sessions/mod.rs:172-176`) and an `<EXTERNAL SESSION IMPORTED>` marker is added (`sessions/export.rs:27`).
  `append_existing_session` "appends an exact missing suffix to one cold imported thread… diverged destination fails
  closed" (`sessions/append.rs:20-30`). This is the only production cross-harness *transcript* transfer I found.
  It works at text level and drops tool fidelity.

### 1.2 Claude Code and the Claude Agent SDK (official docs, V)
- **Fresh vs fork.**
  - A fresh subagent gets its own system prompt, the delegation message, CLAUDE.md and a git-status snapshot.
    "Claude composes a delegation message that summarizes the task".
  - **Fork mode is on by default** (v2.1.302+). A fork "sees the same system prompt, tools, model, and message
    history". "Its first request reuses the parent's prompt cache… a fork costs less than a fresh subagent". "A fork
    can't spawn further forks." (code.claude.com/docs/en/sub-agents#fork-the-current-conversation)
- **Background by default.** Results arrive "as a completion notification in a later turn". The Agent tool returns
  `status: "async_launched"` (agent-sdk/subagents).
- **Follow-ups.**
  - `SendMessage` to an agent id or name resumes it "with full conversation history". Built-in Explore/Plan are
    one-shot and have no id.
  - Transcripts are kept at `~/.claude/projects/{p}/{session}/subagents/agent-{id}.jsonl`, for 30 days by default.
  - `maxTurns` returns "output marked as partial, and Claude can resume it".
- **Questions.** `AskUserQuestion` is removed from every subagent. Permission prompts bubble up to the main session.
  "No message from any agent counts as your approval".
- **Caps.** Nesting depth 3. 20 concurrent. `maxBudgetUsd` refuses new spawns, *stops running background subagents*,
  and ends the query.
- **Output scanning.** The parent sees a scanned final message: control tags imitated by the child are neutralized,
  and `Human:`/`Assistant:` lines are escaped.
- **Agent teams** (experimental, agent-teams doc).
  - Teammates are full sessions. "You can also talk to any teammate directly".
  - Coordination uses a shared task list (pending/in-progress/completed, dependencies auto-unblock, claims via file
    locks) and JSON mailboxes.
  - Idle teammates notify the lead "and include[] its final answer".
  - Known failures: "Task status can lag… blocks dependent tasks". "The lead can stop early". "Two teammates editing
    the same file leads to overwrites".
  - A teammate's cache gets a 5-minute TTL by default, even on subscription.
- **Background sessions / agent view** (agent-view doc, V).
  - User-facing states are `Working · Needs input · Idle · Completed · Failed · Stopped`.
  - A supervisor process hosts each session. "Finished or waiting-for-message sessions that go unattached for about
    an hour are stopped… The conversation stays on disk, and attaching or replying resumes it". Pinning keeps the
    process alive.
  - Sessions survive machine sleep: "processes resume on wake".
  - Removing a session deletes Claude-created worktrees, but "a worktree with unpushed commits blocks deletion".
- **Cross-session messaging** (V).
  - A message is "never the sender's conversation history or files". It is delivered between tool calls, or starts a
    turn if the receiver is idle.
  - Messages can't approve anything or change configuration.
  - `notify_when_idle` sends one notice and expires after 12 h.
  - Loop throttling: identical repeats are dropped, and at most 50 messages are queued.

### 1.3 pi (`R/pi-mono`)
- **Example extension** (`packages/coding-agent/examples/extensions/subagent/`, V). One `pi` subprocess per task.
  Three modes: single, parallel (max 8, 4 concurrent) and chain (with a `{previous}` placeholder). Output is capped
  at 50 KB / 2000 lines per task, and the full result stays in tool details. Abort sends SIGTERM, then SIGKILL after
  5 s, and keeps partial usage (README:96-178).
  - The scout agent's contract: "Your output will be passed to an agent who has NOT seen the files you explored".
    The output format is Files Retrieved (with line ranges), Key Code, Architecture, Start Here
    (`agents/scout.md:8-50`).
- **`/handoff`** (`examples/extensions/handoff.ts:1-40`, V). "Instead of compacting (which is lossy), handoff
  extracts what matters for your next task and creates a new session". A model writes a prompt with Context, Key
  decisions, Files involved and Task. **The user edits the draft** before the new session starts, and the new
  session keeps parent tracking.
- **p2 persistent subagents** (`apps/p2/plugins/subagents/tools.ts:379-405`, V). Actions are `spawn · send(followUp
  vs steer) · configure · stop ("stays usable") · archive ("hide…; restore or send brings it back") · answer
  (re-fetch latest answer) · status`. "Answers are reported back to you as messages… do not wait or poll".
  - A child can have its **own location** (env + cwd, e.g. a worktree) or follow the session (`contract.ts:15-31`).
  - Child messages carry an *intent*: `answered | failed | question ("asks; answer with …") | note ("no reply
    needed")` (`tools.ts:111-125`).
  - Reports are exactly-once across restarts via request ids (`tools.ts:145-170`).
  - Siblings get a `team` tool, scoped to subagents: `send` to "parent" or a sibling, `answer` (read a sibling's latest
    answer), and `list`. The tool says "Never send acknowledgements or thanks… No automatic replies: loops are left to
    the prompt" (`tools.ts:675-692`).
  - A report goes to the *branch that asked*, even after a `/tree` switch (`docs/tree.md:60`).
- **Cross-provider context** (V, `packages/ai/test/cross-provider-handoff.test.ts:1-22`). pi messages are
  provider-agnostic, and a test concatenates contexts produced by every provider and replays them on every other one.
  It covers tool-call id formats and thinking-block transforms. So pi *can* switch model or provider mid-session
  within one harness.

### 1.4 grok-build (`R/grok-build/crates/codegen/xai-grok-pager/docs/user-guide/16-subagents.md`, V)
- `spawn_subagent{prompt, description, run_in_background=true, isolation: none|worktree, resume_from, cwd}`
  (lines 148-158).
  - `resume_from` "continue[s] a completed subagent's conversation". The source must be completed and of the same
    type, and its system prompt and tools are *re-rendered* (209-216).
- **Personas declare I/O contracts** (`inputs/outputs` with `io_type=file`), "so one persona's output file becomes
  the next persona's input" (111-129).
- **Delivery modes** for messages to a child: `steer` (default) | `queue` | `interject`. Interject is urgent and ends
  a blocking wait, but background work keeps running (174-180).
  - Sends are bounded at 4 in-flight per pair and 32 per attempt (172).
  - "A child whose parent is the root session cannot message the root" (170).
- **The child transcript view is "observational"**: the user cannot type into a child (367).
- MCP inheritance is `all | none | named | except`. Worktree results include the path, plus an *apply* operation that
  merges them back (256-262).

### 1.5 OpenClaw (`R/openclaw/docs/tools/subagents/`, V; complements `01`)
- **Context.** `isolated` is the default. "Use `fork` sparingly. It is for context-sensitive delegation, not a
  replacement for writing a clear task prompt" (`tool-reference.md:18-23`).
  - **An oversized fork silently degrades to isolated, with a note** (`:94-98`).
  - The task arrives as a user message after any forked history, and the "system prompt carries shared runtime
    rules, keeping its prefix reusable across equivalent child spawns" (`:74`).
- **Visibility.** Hidden helpers vs `visible: true` persistent sessions. The rule: "Create a persistent visible
  session only when the user requests a separate session or needs to return to and steer that work independently. A
  PR or report, a long run, or an isolated worktree alone does not make a worker a separate user-facing task"
  (`subagents.md:61-68`).
- **Lifecycle.**
  - "A subagent run ends; a session does not."
  - Auto-archive happens after `archiveAfterMinutes` (default **60**). It renames the transcript to
    `*.deleted.<ts>`. "Run timeouts do not auto-archive; they only stop the run". `runTimeoutSeconds` defaults to 0,
    meaning none (`thread-bound-sessions.md:107-114`, `tool-reference.md:72`).
- **Caps.** Depth 5 (range 1-5), `maxChildrenPerAgent` 5, `maxConcurrent` 8 (`nesting.md:13-25`). Leaves get no
  orchestration tools.
- **Recovery** (`operations.md:68-112`).
  - A stale-run window of 2 h, or the timeout plus grace.
  - On restart, "Children are not independently resumed… The parent uses its transcript… then can send a fresh
    instruction to a retained child or spawn a replacement. Check whether files or external actions already changed
    before repeating work."

### 1.6 dsh-superagent (`R/dsh-superagent-prototype`, V; complements `02`)
- **Ticket stages** are derived from the latest report, and the first matching row wins (`docs/003-execution.md:7-21`):
  `person/delivery · person/answer · person/review · person/blocked|failed · working/queued · idle · working`.
  - Ended outcomes are `completed · merged · closed · dropped · stopped` (`src/app/cards.ts:17`).
  - "A `person` stage means the Ticket cannot continue without human input".
- **Report tool** `orchestrator_report{state: progress|ready|blocked|failed|dropped, summary, human_action (≤1000
  chars, "One concrete question… also with state=progress"), question_for_trigger_id, pr_number, reply_to_trigger_id}`
  (`src/app/tools/executor.ts:75-86`).
  - The worker prompt says: "Do not merely write the question in summary… and wait". "Repeating the same question
    reuses its request". "Keep full evidence in summary and let the orchestrator send the short question"
    (`prompts/handoff-worker.md`).
- **Slots and background work** (`003-execution.md:31-59`).
  - Shell commands move to background after 5 s.
  - Background work gets at most **30 min after a turn**, then it is killed, and the report includes the last words
    and the killed jobs.
  - A handoff to a person *frees the slot*.
  - **One extra slot is reserved for a person's message**: "New work therefore cannot prevent a person from
    continuing an existing Ticket".
- **Dropped is a first-class outcome.** "An Executor that finds no work… reports `dropped`".
- **Restart.** "Running Assignments end with 'host restarted' and new ones start with a recovery note that tells the
  Executor to check its directory, git history and GitHub before repeating any outside action" (`:45`, `:146`).
  Out-of-scope follow-ups are handed back with `orchestrator_trigger_handback`.

### 1.7 Lody, Multica, Raft, DimAgent (deltas beyond `02`)
- **Lody** (`R/lodyai-lody/specs/`, V).
  - Delegation depth ≤16, plus `REVERSE_CHAT_FORBIDDEN` (`session-orchestration.md:9-31`).
  - A steer "hands off the running work; it does not fail it", and returns a receipt `steered|queued|dispatched`. An
    uncertain steer fails as `STEER_DELIVERY_UNKNOWN` and is never replayed.
  - "Lody does not claim tasks, lock tasks or reject sends as duplicates": overlap is left to the coordinator (`:83`).
  - Failure `reason ∈ {usage_limit(+resetAt), context_overflow, model_error, permission_denied, cancelled,
    agent_crash, unknown}` (`:104-112`). Results carry "how many later inputs the target received meanwhile", so the
    coordinator judges staleness.
  - Quota exhaustion is reported with `availableAt` (`:127-133`).
  - **Worktree lifecycle**: archive removes the worktree *directory* but "Their branches remain". Restore recreates
    the worktree from the branch. This works even if the owning machine was asleep at archive time
    (`session-worktree-lifecycle.md:9-20`).
  - Relations distinguish `parentSessionId` (contained tab) from `openedBySessionId` (independent session). Archiving
    cascades into opened children only by user choice (`session-relations.md:8-48`).
- **Multica** (V). The resume key is *(agent, issue)*. `PinTaskSession` persists `session_id + work_dir` mid-flight
  "so a daemon crash doesn't lose the resume pointer" (`server/internal/daemon/client.go:719`). A session that
  produced no output before a cancel is **retired**, "so later triggers start fresh" (`client.go:561`). Sessions with
  invalid-history errors are never offered for resume (`handler/daemon_cancel_retire_test.go:164`).
- **Raft.** A machine move "transfers the workspace and memory but starts a new conversation" (`02`). The empty
  re-cut briefing result (13/13) is in principles §4.
- **DimAgent.** Summary-only completion. Users built a plugin to recover child transcripts (`01` §1). This is an
  anti-pattern.

### 1.8 Published context-engineering evidence
- **Anthropic, multi-agent research** (anthropic.com/engineering/multi-agent-research-system, V).
  - An Opus-4 lead with Sonnet-4 workers beat single Opus 4 by **90.2%**. Token usage explains **~80%** of variance.
    Multi-agent systems cost about **15×** chat tokens; single agents about 4×.
  - Each brief needs an "objective, output format, guidance on tools and sources, and clear task boundaries", or
    workers duplicate work or leave gaps.
  - Effort scales from 1 agent with 3–10 calls up to more than 10 agents.
  - The lead saves its plan to memory because context beyond 200K is truncated.
  - Workers "pass lightweight references back", so outputs go to storage rather than through a "game of telephone".
  - Errors resume from checkpoints.
  - It is a poor fit for "most coding" and for heavily inter-dependent tasks.
- **Anthropic, effective context engineering** (V). Sub-agents return "a condensed, distilled summary… (often
  1,000–2,000 tokens)". Keep "lightweight identifiers (file paths, stored queries, web links)" and load them just in
  time.
- **Cognition, "Don't Build Multi-Agents"** (2025-06-12, V). "Share context, and share full agent traces, not just
  individual messages". "Actions carry implicit decisions, and conflicting decisions carry bad results" (the Flappy
  Bird anecdote).
- **Cognition, "Multi-Agents: What's Actually Working"** (2026-04-22, V).
  - What works: "multiple agents contribute intelligence… while writes stay single-threaded".
  - A **clean-context** reviewer works best ("do not share any context beforehand"). Devin Review finds about 2
    bugs/PR, about 58% of them severe.
  - Manager→child Devins coordinate over an internal MCP.
  - For a consulting model, "share a fork of the full context" is the 80/20 answer.
  - Failures: child→manager messaging "doesn't happen by default, because models haven't been trained in environments
    where it needed to". Agents "assume they share state with children when they don't". Managers are "overly
    prescriptive". Swarms are "mostly a distraction".
  - Across model families, delegation becomes "a capability router rather than a difficulty escalator".
- **Manus** (blog, July 2025, V; Lance Martin's webinar notes 2025-10-15, 3P).
  - Cached input costs **10×** less than uncached ($0.30 vs $3/MTok).
  - Context is append-only. Compression is restorable ("keep the URL").
  - Sub-agents exist mainly to *isolate context*. Simple tasks get instructions; complex ones that share files get the
    planner's *full context*. The planner defines an **output schema**, and a "submit results" tool is constrained by
    decoding.

---

## 2. Answers to the questions

**Q1 Lifecycle.**
- **Spawn new** is the default everywhere.
- **Reuse** goes by explicit id: Codex `followup_task`, CC `SendMessage`, pi `send`, grok `resume_from` and
  `send_subagent_message`. Multica and dsh go further and reuse *automatically by work key*: (agent, issue) or
  Ticket+Threads.
- **Fork** is the default only where it shares cache with a same-harness parent (Codex v2, CC). OpenClaw caps fork
  size. CC forbids fork-of-fork.
- **State vocabularies.**

  | System | States |
  |---|---|
  | Codex | PendingInit / Running / Interrupted / Completed / Errored / Shutdown, plus residency (evicted) |
  | CC agent view | Working / Needs input / Idle / Completed / Failed / Stopped, plus process stopped after ~1 h unattached |
  | dsh | person/{delivery, answer, review, blocked, failed} / queued / idle / working, plus ended outcomes |
  | pi p2 | working / idle / archived |
  | OpenClaw | running / finished, plus archived after 60 min |

- **Parking.** Every serious system parks by *killing the process and keeping the session*. Waking is just the next
  message (CC, Codex eviction, Lody's 30-min ACP idle timeout from `02`, Raft's cold recycle).
- **Follow-ups to finished children** are universal, except for one-shot types (CC Explore/Plan).

**Q2 Handoff in.** There are four mechanisms:
1. Written brief: the default in OpenClaw, grok, pi, Lody and teams.
2. Fork: Codex v2 (filtered) and CC (exact, cache-shared).
3. Shared filesystem: Codex's shared cwd, grok persona file I/O, Anthropic's lightweight refs.
4. Memory/notes pointers: Anthropic plan-in-memory, Raft MEMORY.md.

The measured tradeoffs come from different setups. Anthropic shows +90% with briefs on *parallelizable research*.
Cognition shows that brief-only *parallel writers* fail, while a *clean-context* reviewer works better than a shared
one. So the right amount of context depends on the role: **writer = needs the decisions; verifier = should not get
them.** The environment is passed by reference:
- a cwd or worktree (grok `isolation`, pi `location`, OpenClaw `worktree: true`);
- env vars (dsh `DSH_SUPERAGENT_*`, "none contains credentials");
- brokered credentials (Raft, Multica).

Nobody passes secrets in the brief.

**Q3 Return path.**
- **Format.** The final message is verbatim in Codex and CC (CC scans it for injection). pi caps it at 50 KB. dsh
  caps the summary at 600 chars plus a read pointer. Anthropic suggests 1–2K tokens. Only dsh and Manus *type* the
  report (state enum + question field + artifact ids, or a schema with constrained decoding).
- **Partial results.** CC `maxTurns` returns partial output. Codex has a `partial_answer` phase. dsh has
  `state=progress`.
- **Questions to the parent.** pi intent `question` vs `note`, Codex/grok `send_message` to "parent", dsh
  `human_action`.
- **Questions to the human.** Only dsh routes them structurally, to where the person wrote. CC strips
  `AskUserQuestion` from subagents.
- **Heartbeats.** None of these systems uses LLM heartbeats. Liveness comes from harness events: Lody
  `status_many{turn start, last output, current action}`, and Multica's awake clock from `02`.

**Q4 Cross-window.**
- **Peer messaging.** CC teams mailboxes, pi `team`, the Codex message board, grok `send_subagent_message`. All of
  them add loop guards (rate limits, "never send acknowledgements", reverse-chat bans).
- **Shared state.** The CC teams task list with dependencies and file-lock claims. Multica `children_done` waiters.
- **Conflicts.** Nobody locks files. Everyone says "disjoint write sets" or "one worktree per writer"; Lody says so
  explicitly. Cognition's 2026 data says single-threaded writes per artifact.

**Q5 Cross-harness handoff.** Rare. What exists:
- Codex imports Claude Code and Cursor transcripts at text level, with incremental suffix append. This is *offline
  import*, not live handoff.
- pi switches provider mid-session within one harness.
- OpenClaw seeds fresh Codex threads with bounded history plus a summary (`01`).
- Raft and pi `/handoff` start a *new* conversation from a generated brief, plus memory and workspace.

No one does live Codex→Claude mid-turn transfer with tool fidelity (I: tool-call ids, thinking signatures and
harness-specific tool schemas make it unsound). In practice, "handoff" means a new session, the same environment, and
a brief.

**Q6 Failure.**
- **Timeouts.** OpenClaw `runTimeoutSeconds` (default none) and a 2 h stale window. dsh: 30 min background after a
  turn, prepare commands get 10 min, transient errors get 3 retries at 15/30/60 s.
- **Budgets.** CC `maxBudgetUsd` stops background children. Codex `BudgetLimited` maps to Interrupted, which is
  resumable.
- **Kill semantics.** Interrupt ≠ stop ≠ archive (pi, Codex, CC).
- **Restart.** Children are *not* auto-resumed. The root reconciles, after checking the world for side effects
  (OpenClaw, dsh).
- **Poison sessions** are retired, not resumed (Multica).
- **Guardian denials** go to the human, and the agent is not retried (Codex).
- **Loops.** Nobody detects semantic loops. Only message-loop throttles exist (CC dedupe, grok quotas). This is a gap
  (I).

---

## 3. First principles for Ducter

These constraints differ from all of the prior art:
- **(a)** The parent is the sessionless main AI. Its context is a projection of a multi-topic channel plus a persona.
- **(b)** Focus Windows live for hours to weeks, the user opens them directly, and they usually run on another harness
  or model.
- **(c)** The scarce resource is *user attention*, then subscription quota, then tokens.
- **(d)** Machines sleep, and a sleeping FW must not look stuck.
- **(e)** Cache physics differ per harness (principles §8).

**Consequence 1: forking the parent is almost never right.** Codex and CC fork by default because their parent *is*
a single-task coding session on the same harness, so the cache is shared. Ducter's parent fails all three conditions:
- it is multi-topic (dots data: unrelated detail raises scope violations from 8.6% to 19.7%);
- it carries a persona (OpenClaw deliberately keeps SOUL/USER/MEMORY out of workers);
- it is usually on a different harness (a fork is impossible there).

What Cognition's "share full traces" argument actually needs is the *decisions and the user's own words*, not the
main AI's whole spine. **So the brief must carry verbatim user quotes and the decision log, plus pointers.** Forking
is allowed only **FW→FW on the same harness** (try alternatives, or ask a side question of a thread), where it is
cheap and topic-pure.

**Consequence 2: attention state and residency state are orthogonal.** The user cares whether a FW needs them. The
control plane cares whether a process, cache or environment exists. Codex (status vs eviction), CC agent view
(Idle vs "process stopped after ~1 h") and dsh (stage vs slot) all separate them implicitly. Ducter should make the
separation explicit, so that parking, machine sleep and quota waits never surface as user-visible state changes.

**Consequence 3: reuse beats spawn for a personal AI.** Follow-ups arrive days later ("also make it work for teams").
The FW that did the work holds the decisions in its transcript. Reusing it is the cheapest way to honor Cognition's
principle. OpenClaw's 60-minute archive suits a gateway, not a person. **Park aggressively; archive lazily.**

**Consequence 4: the report must be typed, short, and the only thing that wakes the main AI.** A free-form final
message (Codex, CC) forces the main AI to read and classify every completion, which costs main-context tokens and
attention. dsh's enum-plus-question shape is the right one. The final message is only a fallback.

### 3.1 Proposed FW state machine (two orthogonal axes)

**Attention axis** (what the card shows, and what passes the attention policy). This extends principles §6:

```
            ┌──────────── steer / follow-up / answer ────────────┐
            v                                                    │
 queued ─> working ──report(progress)──> working                 │
   │          │──report(needs-you, ask)──> needs-you ──answer────┤
   │          │──report(blocked, on=X)───> blocked ──X resolves──┤   (waiter, not LLM)
   │          │──report(ready, evidence)─> done? ──user ack──> done
   │          │──report(dropped, why)────> dropped
   │          └──error/budget/stuck──────> failed ──retry/new brief──┘
   └─ (no slot / quota / machine offline: stays queued, invisible to user)
 any ──superseded by handoff──> superseded
```

- `done?` means *claimed* done, awaiting verification by the main AI or the user. It becomes `done` only with
  evidence (principles §6).
- `blocked` always names its blocker as a typed waiter: `ci`, `fw:<id>`, `quota:<harness>@resetAt`,
  `machine:<id>`, `intent-approval:<id>`, or `time`. Unblocking is code (principles §9).
- `dropped` (dsh) is distinct from `failed`. "Nothing to do" is a success mode and is silent by default.

**Residency axis** (control plane only, never shown as a state change):

```
 provisioning ─> hot (turn active) <─> warm (idle, process alive, cache within TTL)
                    ^                        │ idle > max(TTL, 15 min) or slot pressure
                    │ next message/answer    v
                    └───────── wake ──── parked (process gone; session ref + env kept)
                                             │ attention ∈ {done, dropped, superseded} and acked,
                                             │ or parked > 14 d with no open asks
                                             v
                                         archived (env reclaimed: worktree dir removed, branch kept;
                                                   browser closed; transcript + Log kept)
                                             │ user restore or reuse-match
                                             └──> provisioning (recreate worktree from branch)
 offline is a property of parked/warm when the machine sleeps (awake-clock aware, never "stuck")
```

- **TTL** comes from the adapter: 1 h for CC on subscription, 5 min for API/teammates, unknown for Codex's thread
  affinity (I). The 1 h park matches CC's supervisor and Raft's 60-min cold threshold.
- **Wake on a parked FW**:
  1. resume the harness session by ref;
  2. if the session is cold *and* large, re-cut per principles §4, with background blocks and no "you were reset";
  3. if the harness rejects the resume (Multica's retire rule), start fresh from the FW's **resume packet** (§3.3).
- **Archive never deletes the transcript.** The Log is the truth. A branch with unpushed commits blocks environment
  reclamation (CC agent view, Lody).

### 3.2 Rules: new vs reuse vs fork vs handoff

The main AI decides by a deterministic pre-check, followed by a model judgment on ties.
1. **Reuse** an existing FW (any residency) when the request names or resolves to its *work key*: the same
   PR/branch/worktree, the same artifact, the same external thread (email, issue), or an explicit reference to it. The
   control plane indexes FWs by work key, like Multica's (agent, issue) and dsh's Ticket↔Threads. Reuse is sent as a
   follow-up, never as a steer, unless the FW is mid-turn on the same goal.
2. **New FW, written brief** for independent work. This is the default. The *verifier role is always new and
   clean-context*: it gets the diff and done-criteria, not the writer's decisions (Cognition 2026).
3. **Fork (FW→FW, same harness only)** for: alternatives from the same state; a side question that would pollute the
   thread; or a reviewer that *should* see context (rare). Never fork the main AI.
4. **Handoff** (new FW that supersedes an old one) for a harness or model change, or when a FW is past its window
   budget and cold:
   - the **old FW writes its own resume packet** ("ask the window", principles §3);
   - the new FW inherits the environment (same worktree and branch);
   - the old one becomes `superseded`, then archived.
   - Do not transcode transcripts across harnesses (Codex import shows this is text-only and lossy anyway).
5. **No FW at all** if the work fits the main turn budget (principles §5).

**Hard limits.**
- Only the main AI opens FWs, so depth in the Log is 1. A FW may *request* a sibling through `report(needs-you |
  blocked on fw:new)`.
- Harness-internal subagents are allowed and invisible (principles §7).
- No cycles (Lody `REVERSE_CHAT_FORBIDDEN`).
- One *writer* FW per work key at a time. Others get a read-only view (Cognition: single-threaded writes).

### 3.3 Handoff contract (brief schema)

The brief is stored in the Log as the FW's genesis event. It is delivered as the first user message after a
*harness-shared, FW-invariant* system prompt, so that all FWs on one harness share an L0 cache (OpenClaw `:74`). It
contains no persona, only project and identity facts the task needs. Target size is ≤2K tokens, with pointers over
payloads.

```yaml
fw_brief:
  id, work_key: {kind: pr|branch|artifact|thread|topic, ref}
  goal: one sentence outcome
  user_words: [verbatim quotes with Log event ids]   # quoted authority (Lody); kills the "telephone" loss
  why: 1–3 lines of purpose (what the user will do with it)
  decisions: [already-settled choices + rejected alternatives]   # Cognition's "implicit decisions", made explicit
  done_when: [checkable criteria] ; evidence_required: [test-run|diff|PR|screenshot|url|none]
  scope: {in: [...], out: [...], write_set: [paths|branch], read_only: bool}
  authority: {may: [...], must_ask: [push, PR, message, purchase, delete…]}  # external effects become intents (§11)
  env: {kind: none|worktree|browser|phone|machine, machine, repo, base_ref, branch, cwd, ports}
  creds: [broker handles only]                         # never secrets in text
  inputs: [{ref: path|url|fw:<id>#entry|log:<id>, why}]  # lightweight identifiers (Anthropic, Manus)
  siblings: [{fw, role, write_set}]                     # so it knows what not to touch
  budget: {window_tokens: 128K–256K, wall: h, usd|quota_share, max_asks_per_day}
  ask_policy: decide-if-reversible | ask-if-irreversible | default-and-continue
  report: report_contract@v1                            # see 3.4
```

Writing rules:
- The main AI fills `user_words` and `decisions` *from the Log*, not from memory of the conversation.
- `out` scope is mandatory (Anthropic: missing boundaries cause duplicate work and gaps).
- For writers, `decisions` is mandatory. For verifiers it is deliberately empty.

### 3.4 Report contract (FW→main)

`report_to_main` is the only call that wakes the main AI.

```yaml
report:
  fw, seq (idempotency, exactly-once like pi request ids), at, answers_input: <event id>|null
  state: progress | needs-you | blocked | ready | dropped | failed
  summary: ≤600 chars, outcome-first (dsh)          # the card text; never the transcript
  asks: [{q, options?, default?, blocking: bool, reversible: bool, raised_by: <event id>?}]  # one concrete question each
  blocked_on: {kind, ref, resume_at?}               # becomes a waiter
  evidence: [{kind: diff|pr|test|url|file|screenshot, ref, verified_by_fw: bool}]
  effects: [{intent_id, status}]                    # external side effects, via intent ledger
  unverified: [claims not checked]
  next_if_silent: what it will do if nobody answers (or "idle")
  transcript: {harness, session_id, path, entry_id} # pull-only, paged (OpenClaw sessions_history)
  usage: {in, cache_read, cache_write, out, usd|quota, window_pct}
```

Rules:
- **No liveness heartbeats.** The control plane derives liveness from harness events. A FW sends `progress` only at
  milestones or when it changes plan. Main receives `progress` as a non-waking L4 delta, unless an ask is attached.
- **Questions.** A blocking ask moves the FW to `needs-you` and frees its slot (dsh). A non-blocking ask continues on
  the default. The main AI first tries to answer from the Log and memory. It escalates to the human only what it
  cannot answer, using the badge→push ladder (principles §6).
  - If the human answers in-window, that reaches the FW directly. The FW's next report must cite it
    (`answers_input`), so the main AI's card stays coherent.
  - A repeated identical ask reuses the same request (dsh).
- **Fallback.** If a FW turn ends without a report, the adapter synthesizes `{state: ready|failed, summary: truncated
  final message, unverified: ["no report"]}` and marks it low-trust.
  - I: per Cognition, models are not trained to message managers, so expect missed reports. Enforce the report with a
    Stop-hook nudge (CC `TeammateIdle`/Stop `decision: block`, from `02`).
- **Scanning.** Before the main AI reads report text, strip control-tag imitation (as CC does).

### 3.5 Cross-window rules
- **Hub-and-spoke by default.** Siblings do not message each other. A FW may *read* a sibling's latest report (pi
  `team answer`), or `ask_window(sibling, q)` read-only through the control plane. The answer comes back as one event,
  rate-limited and with no acknowledgements.
- **Conflicts.** Each writer FW gets its own worktree and branch. The `write_set` in the brief is an *advisory lease*
  that the control plane checks at spawn and reuse time. Overlap leads to a refused spawn, or to the existing writer.
  Merges are intents.
- **Dependencies.** Use `blocked_on: fw:<id>` plus a `children_done` style waiter. The DAG lives in the control plane
  (Multica, CC teams auto-unblock), never in an LLM loop.

### 3.6 Failure rules
- **Stuck.** The FW is working, no harness events have arrived for N min of *awake* machine time, and no background
  job is registered. Response: interrupt (the session is kept), then one nudge, then `failed(reason: stuck)`.
- **Loop.** K identical tool calls, or no new diff/file/output across M turns. Response: interrupt, with a recovery
  note that names the loop.
- **Budget.** Window, wall time, $ or quota caps → `interrupted (partial)`, which stays resumable (Codex
  `BudgetLimited`, CC `maxTurns`). Quota exhaustion → `blocked_on quota@resetAt`, not failed (Lody).
- **Failure reasons** use Lody's enum.
- **Kill levels.** Kill is explicit: `interrupt` (keep the turn's work) < `stop` (kill the process, park) < `archive`
  < `delete env`.
- **No replay.** An uncertain steer or side effect is never replayed (Lody, principles §11).
- **Crash or restart.** Reconcile each live FW: check git, PRs and the intent ledger, then resume with a factual
  recovery event as L4. A session that produced nothing, or that the harness rejects, is retired, and the FW restarts
  from its resume packet (brief + last report + Log-derived decision delta).

---

## 4. The three decisions that matter most
1. **Two-axis state model.** Attention (`queued·working·needs-you·blocked·done?·done·dropped·failed·superseded`) is
   separate from residency (`provisioning·hot·warm·parked·archived`, plus `offline`). Parking, sleep, quota and
   eviction never cost user attention. Park at max(TTL, 15 min). Archive lazily, keeping the branch and transcript.
2. **Never fork the main AI. The brief carries verbatim user words, explicit decisions, done-criteria, scope-out and
   pointers.** Fork only FW→FW on the same harness. Verifiers are always fresh and clean-context. Cross-harness
   handoff is a new FW whose brief the *old FW* writes, on the same environment.
3. **Typed `report_to_main` is the only wake-up.** It has six states, a ≤600-char summary, structured asks with
   blocking and default, evidence refs and a transcript pointer. Asks go first to the main AI, which answers from the
   Log, and only then to the human. Reuse is chosen by work key before any new spawn.

## 5. Uncertain / to test
- Whether briefs written by the old FW beat briefs written by the main AI for handoffs. Run an A/B with Raft-style
  behavioral equivalence.
- Codex warmth after a fork or resume: does a parked Codex thread keep any cache affinity? This decides its park TTL.
- Report-call compliance per model (Cognition says it is untrained). Measure missed-report rate, and the false-done
  rate without evidence.
- The `write_set` lease granularity: path globs vs branch. Real repos may need a "shared files" escape hatch.
- Whether in-window human answers confuse the main AI's card. `answers_input` linkage should be enough, but this is
  unproven.

## Sources
Code (V):
- `R/codex/codex-rs/{core/src/tools/handlers/multi_agents_spec.rs, core/src/agent/{status.rs,control/residency.rs,control/root_handoff.rs}, core/src/session_prefix.rs, core/src/context/inter_agent_completion_message.rs, core/src/config/mod.rs, external-agent-migration/src/sessions/}`
- `R/pi-mono/{packages/coding-agent/examples/extensions/{subagent/,handoff.ts}, apps/p2/plugins/subagents/{tools.ts,contract.ts}, apps/p2/docs/tree.md, packages/ai/test/cross-provider-handoff.test.ts}`
- `R/grok-build/.../16-subagents.md`
- `R/openclaw/docs/tools/subagents/*`
- `R/dsh-superagent-prototype/{docs/003-execution.md, src/app/tools/executor.ts, src/app/cards.ts, prompts/handoff-worker.md}`
- `R/lodyai-lody/specs/{session-orchestration,session-worktree-lifecycle,session-relations,imported-acp-session-identity}.md`
- `R/multica/server/internal/daemon/client.go`

Docs and posts:
- [CC subagents](https://code.claude.com/docs/en/sub-agents)
- [CC agent teams](https://code.claude.com/docs/en/agent-teams)
- [CC agent view](https://code.claude.com/docs/en/agent-view)
- [CC cross-session messaging](https://code.claude.com/docs/en/cross-session-messaging)
- [Agent SDK subagents](https://code.claude.com/docs/en/agent-sdk/subagents)
- [Anthropic multi-agent research](https://www.anthropic.com/engineering/multi-agent-research-system)
- [Anthropic context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Cognition 2025](https://cognition.com/blog/dont-build-multi-agents)
- [Cognition 2026](https://cognition.com/blog/multi-agents-working)
- [Manus](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus)
- [L. Martin on Manus (3P)](https://rlancemartin.github.io/2025/10/15/manus/)
