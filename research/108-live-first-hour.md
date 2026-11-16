# 108: The first hour, live (v0.0.63 from source)

A real run of the first hour against real agents, to replace "verified only with fakes" where it
is safe and cheap. A Ducter core from source (main at v0.0.63, then the fix branch) ran with a
scratch data folder on its own port, the person's existing Claude Code and Codex sign-ins (read
only), the partner and tasks on the cheapest models, and a scratch git repo with one failing test.
It was driven over the client WebSocket by a small script that records every frame (the same
protocol the apps speak); the protocol's own models (`blocksOf`, `contextMeter`, `validateRich`,
`limitSpan`) were run on the recorded frames.

Tags: **VERIFIED** (run here, frames recorded), **FAILED** (run here, wrong), **NOT RUN**,
**INFERRED**.

## Setup

| | |
|---|---|
| Date | 2026-11-17 (Asia/Shanghai), about 05:04 to 06:30 |
| Build | `bun run packages/core/src/main.ts` from the checkout, 0.0.63 `dev` |
| Agents | Claude Code 2.1.325 (Max plan, signed in), codex-cli 0.169.0 (ChatGPT sign-in) |
| Partner | Claude Code, `claude-haiku-5-5` (`DUCTER_PARTNER_MODEL=haiku`; seen on the partner's process: `--model claude-haiku-5-5`, `claudeMdExcludes` for `~/.claude/**`) |
| Tasks | Claude Code haiku (`DUCTER_TASK_MODEL=haiku`); Codex `gpt-6-luna`, effort low, for the switch |
| Data | `DUCTER_DATA_DIR=<scratchpad>/live-home`, `DUCTER_PORT=7910` (never `~/.ducter` or :7777); the Ducter folder followed the data dir (`<data>/ducter/worktrees/…`) |
| Kept off | `DUCTER_OUTSIDE=0` (the agents' records reader points at `<data>/no-outside`, which doesn't exist: core.ts), `DUCTER_MEMORY=off`, `DUCTER_BRIDGE=0`, `DUCTER_DIGEST=off`, `DUCTER_AUTO_RECALL=0`, `DUCTER_UPDATE_CHECK=off`, `DUCTER_PUSH_RELAY=off`, `DUCTER_BROWSER=0`, no desktop window |
| Never touched | No connection, channel, call, payment, Autofill or Mem; `~/.claude` and `~/.codex` settings unchanged (Codex's user MCP servers and features are turned off per session by `-c` flags, `oar.ts`; Claude Code gets `--settings` and the worktree's own `.claude/settings.local.json`) |
| Repo | `<scratchpad>/repo/calc`: `sum.ts` whose loop starts at 1, `sum.test.ts` expecting `sum([1,2,3]) == 6` (1 fail) |

How the records stayed unread: the first words came back with only everyday examples, and
`past` answered `outside: []`, `sources: []` (step 1 and step 6). **VERIFIED**.

## Results

### 1. First run, first words, following the language (D298, D292)

| Check | Result | Evidence |
|---|---|---|
| Welcome on hello (`client: desktop`, `locale: en`) | **VERIFIED** | `welcome {personaName: "Ducter", headSeq: 0, version: "0.0.63", ping: true}`, then `first_screen` (`visit: "first"`, four everyday starters, `looks: true`) |
| The partner's first words, with the records reader off | **VERIFIED** | seq 1, `ai_msg`, said by the home with no model: "Good morning, I'm Ducter. Tell me anything you'd like done: look something up, tidy some files, write an email. Bigger work goes to a task, and I come back when it's done." Starts: the three everyday ones (desktop, 9 am reminder, landlord letter); no project of the person's |
| A CLI hello says no first words | **VERIFIED** (by design) | The first hello as `client: cli` got `events: []`; only `desktop` and `web` trigger them (ws.ts) |
| Korean in, Korean out (D292) | **VERIFIED** | Sent "안녕하세요! 오늘 할 일을 정리하는 좋은 방법 하나만 짧게 알려줄래요?"; the reply 4.4 s later was all Korean ("좋은 질문이에요! 제가 짧게 정리해 드릴게요. …") |

`looks: true` in `first_screen` is the person's setting (on by default), not what was read; the
reader itself was pointed away. `first_screen` offers four starters while the first words carry
three; both are by design (D298: "everyday examples to make three").

### 2. A real task end to end

| Check | Result | Evidence |
|---|---|---|
| "Fix the failing test in <repo>" opens a task on Claude Code haiku in a worktree | **VERIFIED**, with a bug (**B1**) | ack in 3 s ("On it: I'll find the failing test in calc and fix it, then tell you when it's clear."); `body_selected {harness: claude-code, model: haiku, why: default}`; worktree `<data>/ducter/worktrees/calc/fix-failing-test-in-calc-gm5nfi3j` on branch `ducter/fix-failing-test-in-calc-gm5nfi3j` |
| It runs and reports with evidence | **VERIFIED** | 21 s from the words to the report: `bun test` (fails, 5 vs 6), the loop bound fixed, `bun test` passes, a commit; `report {state: done, summary: "The failing test is fixed and the full suite passes. …"}`; the partner: "The test is fixed. `sum()` was skipping the first number, so it came out one short. The suite passes now, and the fix is committed on its own branch, not merged or pushed." |
| `task_history` opens fast (D284) | **VERIFIED** | `task_history {limit: 200}` answered in 1 ms on loopback: 21 events, `more: false` |
| Transcript blocks render-able | **VERIFIED** | `blocksOf("claude-code", events)`: 7 blocks (brief, steps, voice, steps, voice, steps, voice), 1 turn; `latestVoice`: "The failing test is fixed and the suite passes." |
| No " · " in strings in frames | **VERIFIED** | 0 occurrences in every recorded frame |

### 3. The context meter and Compact now (D288)

| Check | Result | Evidence |
|---|---|---|
| Usage lines carry the window and compactAt | **VERIFIED** | turn end: `usage {contextTokens: 39113, contextWindow: 200000, compactAt: 160000, turn: {input: 225039, output: 2068, cached: 185916}}`; `contextMeter`: `{level: calm, percent: 20, window: 200000, compactAt: 160000}`. Codex: `context {contextTokens: 26034, contextWindow: 190000, compactAt: 160000}` |
| Compact now on the task (`/compact` through Claude Code) gives a compaction note with sizes | **VERIFIED** | `compaction completed {trigger: manual, before: 39332, after: 11144, compactions: 1}` (Claude Code's own `compact_boundary` sizes) |
| …and nothing else | **FAILED** on v0.0.63 (**B2**), **VERIFIED** after the fix | see B2 |
| Account limits (`account_usage`, fresh) | **VERIFIED** | 2.1 s: `plan: max`, windows `five_hour` used 0.34, `seven_day` 0, `model_scoped:Fable` 0, each with `resetsAt` |

The card's words for that answer (`limitSpan`, `i18n-context.ts`): **Claude Code account**:
"5-hour limit, 66% left, resets …" (the tightest, shown first), "7-day limit, 100% left", "7-day
limit (Fable), 100% left".

### 4. A rich answer (D303)

| Check | Result | Evidence |
|---|---|---|
| "Compare these two options in a small table: …" | **VERIFIED** | `ai_msg.ui[0] = {type: table, title: "SQLite vs Postgres", columns: ["", "Setup", "Concurrency", "Best for"], rows: 2}`; `validateRich` accepts it; `splitRich`: words, then the block |
| Plain fallback | **VERIFIED**, one oddity (**N1**) | `text` holds the lead sentence and the plain table; `wordsOnly` leaves only the lead: "SQLite is the simpler pick when one app is the only thing touching the data. Postgres is for when many users or processes write at once." |

### 5. Done for you (D300)

| Check | Result | Evidence |
|---|---|---|
| Before any outward action | **VERIFIED** | `did_result {items: [], counts: {}}` for the last 7 days: the task's own commit is not an outward action |
| After Merge (local, into the scratch repo's main) | **VERIFIED** | `action_result {ok: true, message: "Merged ducter/fix-failing-test-in-calc-gm5nfi3j into main."}`; then `did_result` has one item `{kind: changed, sub: merge, to: <that branch>, who: {by: you, taskId, title: "Fix failing test in calc"}, go: {by: you}, where: {kind: computer, name: "Mac.lan"}}`, `counts: {changed: 1}`. The client's line: "Merged ducter/fix-failing-test-in-calc-gm5nfi3j". Nothing sent, paid or called |

### 6. Ongoing and routines (D285)

A one-minute routine can't be made: the smallest time trigger is `every: "hours"` (protocol
`RoutineTrigger`). So: every 1 hour from two minutes ahead, then pause before it fired, wait past
the time, resume, run now.

| Check | Result | Evidence |
|---|---|---|
| Create (`task_new` with `when: every hours`) | **VERIFIED** | `task_new_result {routineId, triggerWords: "Every 1 h from 5:13 (follows your time zone)", nextAt: 21:13Z, budget: {monthTokens: 2000000}}` |
| Ongoing lists it | **VERIFIED** | `ongoing_result` item `{kind: routine, state: resting, cadence: "Every 1 h from 5:13 (follows your time zone)"}` |
| Pause, and it doesn't fire | **VERIFIED** | `action_result pause ok`; at 21:13:35Z `state: paused, pausedBy: user`, no run |
| Resume, run now | **VERIFIED**, with a bug (**B3**) | `action_result resume ok`, `run_now ok`; a task "Reply with today's date in one short line for Nov 17 at 05:13 AM" ran on haiku and reported "Today is Tuesday, November 17, 2026. No files were touched."; `routine_run {state: done, tokens: 0}` |
| Past keeps the person's records out | **VERIFIED** | `past_result {outside: [], sources: []}` |

`ongoing_result` after an action goes only to app sockets (ws.ts `ongoingChanged` skips CLI
ones); by design.

### 7. Switching the task's agent (D282)

| Check | Result | Evidence |
|---|---|---|
| To Codex (`gpt-6-luna`, low) | **VERIFIED** | `action_result switch ok`; "moved from claude-code to codex (gpt-6-luna)"; the next words ran on Codex (`session started {harness: codex}`), which reported "I am Codex, running on GPT-6. …" with one evidence item |
| And back to Claude Code haiku | **VERIFIED** | `switched {from: codex, to: claude-code, back: true}`; the same Claude Code session id as before the switch (`8e3b4bbd…`) resumed; it reported "I am Claude Code, running on Claude Haiku 5.5 (claude-haiku-5-5)." |

## Bugs

**B1: an early open the partner replaced leaves a worktree, a branch and a ghost task.**
**FIXED** (unit-tested; the hiding also checked live on the same Log after restart).
Repro: say "Fix the failing test in <repo path>". D120 opens the task at the title (the place is in
the words, no `needs`); the partner's full call then adds `needs: {app: "Terminal"}`, so
`openEarly` (partner.ts) sees another `who`, rejects the first brief and opens again. The runner
drops the first as `not started` but kept its worktree `…/fix-failing-test-in-calc` and its branch
`ducter/fix-failing-test-in-calc` in the person's repo, so the real task got
`…-gm5nfi3j` (both). Past listed "Fix failing test in calc" twice (one `dropped`), and On hand
carried the dropped card (the partner's own render already hid it). Fix: the never-briefed drop
archives its worktree and deletes its branch while the branch still sits on its base
(`archiveWorktree(…, {unstarted: true})`, through the worker link too); On hand and Past leave out
`dropped` + `not started` (registry.ts `neverStarted`). Not changed: whether adding only `needs`
should restart the task at all (partner.ts compares the whole `who`); a design call.

**B2: Compact now made a finished task do its work again, and the partner said it again.**
**FIXED**, **VERIFIED** live after the fix. Repro on v0.0.63: a done Claude Code task, send
`task_send {text: "/compact"}` (the composer; the web card's own button is offered only while a
task isn't finished, but a waiting or blocked task gets the same). The runner flipped it to
`working`, steered "Your context was just compacted … Carry on with the brief" into the compacting
turn, then nudged "Report status via report_to_main." The agent re-ran the tests, filed a second
done report, the context went back to 39K, and the partner said "Same result as before: …" in the
conversation. On a parked task (after a restart) the same, twice ("Same as the last run…", "Same
result again…"): about 160K input tokens for nothing. Fix (runner.ts): the person's bare
`/compact` on Claude Code is a compact turn: the task keeps its state, the brief-again waits in the
prefix for the next words (never steered in, and never put in front of the `/compact`, which must
stay a command), and the turn owes no report. A parked task resumes for the `/compact` alone; if it
can't be resumed (a fresh session), nothing is compacted and the seed waits for the next words.
Live after the fix: `compaction completed {before: 40165, after: 12781}`, the task stayed `done`,
no nudge, no report, no message.

**B3: a routine run's tokens are counted as 0 on Claude Code.** **FIXED by D308** (the run closes at its turn's end; was: needs a call on
when a run closes). Repro: any routine run on Claude Code. Its `report_to_main` (an MCP call inside
the turn) arrives before the turn's usage, and `finishRun` (routines.ts) closes the run on the
report, so the usage event that follows finds no running run: `routine_run {state: done, tokens:
0}` while that turn used 75,725 input and 508 output tokens. So the per-run budget is never set
(it is 2x the first run's tokens) and the month's count (rebuilt from `routine_run.tokens`) stays
0: the routine budget never binds. The existing test passes because it logs usage before the
report. Options: close a done run at its turn end (usage, or the residency leaving `hot`), with the
report's seq; or count the usage that follows a closed run toward its month. The first changes when
"done" is said; the second loses the per-run record.

**N1 (minor): the table's plain fallback joins sentence cells with commas.** "Setup Zero setup.
It's a file inside your app., Concurrency Single writer at a time. …" (rich.ts `plainOf`:
`${column} ${cell}` joined by the comma). Reads oddly once a cell ends with a full stop. Fixed with D308: a part's own end punctuation is never doubled.

**N2 (minor, the partner's words): "The hourly check moved to Codex".** Only that run's task
moved; the routine still runs on Claude Code haiku. Haiku as the partner; not fixed.

**N3 (minor): Done for you names the computer by its host name** ("Mac.lan") on a home with no
display name set. Not checked against the apps' own fallback.

## Spend

Everything ran on the person's plans (`billing: plan` in `candidates`): Claude Code Max and ChatGPT.
Tokens the tasks reported (turn totals): about 668K input, of which about 548K cached, and 7K
output, over 7 task turns (3 of them the B2 repeats); about 8 short partner turns on haiku. The
5-hour Claude window read 34% used before and is shared with the person's other work, so no share
is attributable. No API key was used; no money was charged beyond the plans.

## Implications for Ducter

- The first hour holds up on real agents: first words with nothing read, the language followed,
  a real fix in 21 s with evidence, the meter and the account card, a rich table, Done for you,
  routines, and a harness switch there and back on one session.
- Compact now must be "not work" (B2); it now is, on every path a Claude Code task can be in.
- D120's speculative open must leave nothing in the person's repo when it is replaced (B1). Whether a
  `needs`-only change should replace it is still open.
- Routine budgets didn't bind on Claude Code (B3); D308 closes a run at its turn's end, so they do.
- A real run caught three bugs the fakes didn't: each fake emitted events in the order the code
  expected, not the order the agents send them. Worth a recorded-order fixture per harness.

## Summary

Seven steps run live on v0.0.63 from source, all VERIFIED in their main path. Three bugs: B1 (a
replaced early open left a worktree, a branch and a duplicate task in Past) and B2 (Compact now
redid a finished task's work and made the partner repeat itself) are fixed with tests on
`fix/live-108`; B3 (routine tokens counted as 0, so routine budgets never bind) is listed with a
repro and two options.
