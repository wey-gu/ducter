# Focus Windows: Handoff, Report, Checkpoint, Body

> Design note for principles 9, 11–14 · States: `focus-window-states.md` · Evidence:
> `research/06`, `07`, `02`.

## Brief: the push (principle 11)

Target about 2K tokens, in this order:
1. **The ask, verbatim**: the user's own words.
2. **Decisions already made** that bind this job.
3. **Done-criteria**: what evidence will count.
4. **Out of scope**: things the window must not touch.
5. **Write set**: the repo, branch, or paths it holds the lease on.
6. **Quoted channel messages** wherever wording matters (quote them, don't summarize).
7. **Pointers**: Log ranges, artifacts, related windows.

The brief gets no skills list, because windows inherit the user's harness config
(principle 17).

The runner's frame around the brief also names **the language the user reads reports in**
(`task_open.language`: the Partner-page setting, else the user's words that turn, else their
last message). The task writes its summary, questions and evidence labels in it, whatever
language the code or tool output is in; those labels show on On hand as they are (D125).

## Pull tools

Windows get the same `log.search` / `log.read` tools as the main AI. Scope: the persona's
channel, sibling windows, and memory. A window that is missing context fetches it itself
instead of asking the main AI.

As built (`packages/core/src/tools.ts`): a task's `log_search` / `log_read` reach its own
stream, its persona's `channel` events and that persona's other tasks; any other stream is
refused with one line. A browser task reaches only its own stream (D62). The partner's tools
read the whole Log.

## Before spawning

- **Dedupe on the work key** (PR, branch, artifact, thread). If a window already holds that
  key, reopen it or send it a follow-up instead of spawning.
- **Forks.** Fork only window→window, on the same harness. The main AI's channel is never
  forked into a long job.
- **Verifiers** always start from a clean context.
- **Depth cap.** Delegation is capped in depth and must not form cycles.

## Report (principle 12)

`report_to_main` has these fields:
- `state`: `progress · needs_input · blocked · done · failed`
- `summary`: at most 600 characters
- `questions[]`: each has `blocking`, a `default`, and whether the default is reversible
- `evidence[]`: refs such as CI run, artifact, diff, URL

Ducter adds two fields when a done or failed report is logged, never the task: `branch` (what
a repo task's branch holds, D125) and `folder` (what a task changed in a non-git folder against
the copy kept before its first change, and until when it can be undone, D142). A task in such a
folder that can't be copied cheaply gets a runner-written `needs_input` report before its first
turn (Hold by default); its first turn waits for the answer.

A wait is not a report field: the task calls `wait_for` (D112). The transcript is the task's
own stream in the Log (`task_history`), not a pointer in the report.

The report is the only way a window wakes the main AI. Reads never wake anyone.

## Checkpoint (principle 13)

The window writes a checkpoint after each meaningful step, while it is still healthy. It
records where the work stands, what is done, what comes next, open questions, and any
intents in flight.

**Small windows and compaction (D135).** A task runs on a 200K window with a standard-window
model, and its harness compacts it at 160K (`Settings.windows.tasks`, env `DUCTER_TASK_WINDOW`
/ `DUCTER_TASK_COMPACT_AT`). Around each compaction:
1. **Before.** Once the harness's context reading passes 140K, the runner asks the task once to
   call `checkpoint` now (steered into the running turn, else first in the next one). On
   Claude Code a `PreCompact` hook (through `--settings`, so the worktree stays clean) adds
   compact instructions: keep the ask, the latest checkpoint, files and commits, the next step.
2. **After.** On `compaction_ended` the runner sends the brief again and the latest
   checkpoint (steered, else as the next turn's prefix, logged as the runner's own input).
3. **Logged.** Each compaction is a `task_event` (`raw.kind: "compaction_ended"`,
   `compactions: n`, the size it had reached); the opened task's Details shows
   **压缩过 n 次 / Compacted n times** under Saved progress, quietly.

Knobs per harness: Claude Code `CLAUDE_CODE_DISABLE_1M_CONTEXT=1`,
`CLAUDE_CODE_AUTO_COMPACT_WINDOW=200000`, `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=88.8889`
(threshold = (window − 20K) × pct = 160K); Codex `model_context_window=200000`,
`model_auto_compact_token_limit=160000`; pi and DeepSeek Harness none yet.

A handoff never depends on the old model still working. A new window is seeded from the
brief + latest checkpoint + Log on the *same* environment, and the old one becomes
`superseded`. Triggers: quota exhausted, a failure, a machine going offline, or a deliberate
switch.

## Choosing a body (principle 14)

`fw_candidates(TaskSpec)` is deterministic:
- **Filter on hard constraints**: environment needs, installed and logged-in harnesses,
  machine availability, user pins.
- **Rank**: tier fit for the task kind, cache continuity, quota pace (readable for Claude via
  `get_usage` / `rate_limit_event`, Codex via `account/rateLimits/*`, Grok; estimated from
  Ducter's own ledger otherwise), wake cost, API spend, and outcome history.
- **Return** the top 3 with reasons.

The main AI picks one, and gives a reason if it overrides the ranking. A user pin always
wins, and there is no silent fallback. The choice is logged as `body_selected` and shown as a
one-line subtitle on the card.

Capability tiers are curated, versioned data refreshed weekly. There is no learned router;
LLMRouterBench found routers rarely beat the best single model. When a user repeatedly
overrides a choice, Ducter proposes a rule and the user confirms it.

**Steering it: zero config by default, conversation first, a file for power users.**
- **Default:** Ducter decides. Tier data ships with Ducter and is refreshed from tracked
  evals. The user never maintains a table.
- **In the moment:** "do this one with Codex", or a tap on the card subtitle, pins that
  window. If the window is already running, the switch goes through a handoff (principle 13).
- **Semantic rules in plain language:** e.g. "backend refactors on Codex, UI work on Claude,
  translations on something cheap". Ducter restates the rule in one line and asks for
  confirmation, then stores it as a binding ledger constraint. It is compiled into
  `fw_candidates` filters and boosts, and the rule's ID appears in the selection reason.
- **Learned suggestion:** after 2–3 overrides in the same direction, Ducter asks once: "make
  this the rule?"
- **Power users:** an optional rules file with the same schema. Conversation and file are
  two views of one rule set.
- **Precedence:** window pin > the most specific rule (newest wins a tie) > Ducter's default.
- **When a rule can't be satisfied** (no quota, logged out), Ducter never falls back silently.
  It posts one line with a default, e.g. "Your rule says Codex, but its quota resets in 40
  min — wait, or use Claude?"
- **Card subtitle:** "Codex · gpt-x — your rule: backend refactors", so the reason is always
  visible.

A quota reserve is kept for the main AI: **10% of its own account** (D89; fixed in v1). A task
never draws on it: at the reserve that account is a hard filter for tasks, and a task that
would have gone there moves with the reason said ("Claude Code's limit is low"). Kimi's
host-side token reader stays disabled (principle 17).

**v0 as built (D89).** `fw_candidates` in core (`packages/core/src/candidates.ts`): hard
filters are installed, signed in, **用它做事 / Use it for tasks** (per account, on by
default), the reserve, and a model picked (pi); then the person's rules (a rule names words
that mark its kind of work, matched in the title and brief, newest first); then the shipped
tier table (Claude Code Opus and Codex "smart", Sonnet and the per-use agents "fast"); then
the most limit left, plan before pay-per-use. The pick is logged as `body_selected {harness,
model, why}` with `why` one of default · rule · limit · unavailable · you · partner, and the
card, the conversation's task line and Details say it. The pick's model goes with it (a
default pick's gives way to `DUCTER_TASK_MODEL`), so the card names what runs. A rule or the
partner's pin that can't run moves to the next best with the real reason: `limit` only for
the partner's reserve, else `unavailable {from, blocked}` (signed out, off, not installed;
"{X} 现在用不了 / {X} can't take it now"). The person's own pick (New task, `--agent`) never
moves: the open fails with one line, "Codex can't take this task: it isn't signed in. Pick
another AI agent, or fix that first." Nobody left: the open fails with one line the partner
says, never a silent fallback.

**Switching (换谁来做 / Switch who does it).** The list is the one doing it now, the top three
others with why and the limit each, and the ones that can't, greyed with why. **换到 X 接着做 /
Continue on X** closes the old session and starts the new agent from the brief and the saved
progress (a handoff; the native session can't carry across harnesses); a waiting or finished
task keeps its state and the next message (an answer, a follow-up, reopen) starts it there,
seeded from the brief + every checkpoint and then that message. As built, the switch is logged
as a system line with `raw.switched {from, to}`, and a restarted runner ignores the session ids
logged before it, so the new agent never resumes the old one's session. Each switch leaves a hidden note
for the partner; after the second switch the same way (from → to), the partner is woken once
to offer a rule: it names the kind of work in a few words and asks with Go / Hold, default
hold, and saves it with `rule_save` on Go.

**Rules as built.** Said in the conversation and saved by the partner (`rule_save`, after it
restated the rule); kept in `rules.json` in the data folder; listed on Partner as **你的规则 /
Your rules** with **不要这条 / Remove**. No rule editor.

**When quota runs out mid-task:**
1. Wait, if the reset is soon.
2. Otherwise switch to another model in the same harness.
3. Otherwise hand off to another harness (checkpoint above).

## How a task is shown (D74)

What the window writes is what the user reads when they open the task, in one column:
- the latest **report** is said once, at the top: a finished task's report is its outcome
  (with its evidence as a line of proof and what went out), an unfinished one's is the line
  of where it stands. Earlier reports stay in What it did as "Told {name}" lines;
- the **transcript** becomes What it did (D152, after D127): the window's own words are the
  readable layer; each stretch of tool calls between two of them folds under one gist line
  (`packages/protocol/src/transcript.ts`), each call one sentence (the agent's own words for
  it, else a verb and a short summary, the same kinds on every harness:
  `packages/protocol/src/steps.ts`), thinking as its headings, a probe that found nothing in
  neutral words, a real failure one Error line with its raw text on a click;
- **checkpoints** are the window's words said once, marked saved (D152);
- **keys** in the brief, a command or its output never leave the home: the projection hides
  them in every frame and push it sends; the Log keeps them for the task (D152);
- the diff of the worktree is a list of files; a diff shows only when the user opens a file.
