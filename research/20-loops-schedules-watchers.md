# 20 — Loops, schedules, watchers, and always-on work

Researched 2026-11-08. **V** = verified from source (`R/` = cloned repos under the session scratchpad
`.../scratchpad/repos/`, read-only) or from official docs fetched today. **I** = inferred, or from
secondary press only. Builds on [1] §loops, [2] §waiting, [16] §living summary, and principles 6, 7,
10, 12, 15, 16, 18, 19.

## 0. Answer in one screen

- **No product treats loops, schedules, and watchers as one thing, and the ones that work best do not
  try.** Two primitives cover everything in the evidence:
  1. a **waiter**: a one-shot predicate that wakes *an existing* window (Multica `WakeupCondition`,
     Lody `lody_automation`, DimAgent `schedule_wakeup`, CC `ScheduleWakeup`). Ducter already has
     this (system.md §Waits);
  2. a **Routine**: a durable object, *trigger × run template × report policy × budget × end*, which
     spawns **runs** (CC cloud scheduled tasks, Codex/ChatGPT scheduled tasks, Multica Autopilot,
     OpenClaw jobs, Devin automations, dots *Scheduled*).
  A **loop** ("until CI is green") is not a third object. It is a window with an `until` predicate
  and a budget, which the control plane re-drives turn after turn. CC `/goal` is exactly this (a
  Stop hook plus a small-model judge). "Monitor and react" and "always-on agent" are Routines with a
  condition or stream trigger in `continue` run mode. Nothing needs a resident process.
- **Runs: a fresh session per run by default, with "continue one thread" as an explicit mode.** CC
  cloud, Desktop, GitHub triggers, and Codex standalone tasks all start fresh. Codex in-chat tasks,
  Lody `own_session`, OpenClaw `session:<key>`, and grok-build loops continue one thread, and
  grok-build forces a fresh transcript every 10 iterations. Memory across runs lives in files or
  state, not in the transcript (Ralph's `fix_plan.md`, OpenClaw `trigger.state` ≤16 KB).
- **Natural language → structured happens through a confirmation card.** The strongest pattern is
  Lody's `lody_schedule_propose`. The agent writes a card with a **Create** button and must not
  claim the schedule exists until the user presses it. It must ask instead of guessing when the
  what, the when, or the destination is unclear. `lody_schedule_get` returns the **next five run
  times**. Use named rules (daily, weekdays, weekly, monthly, once), not raw cron: both CC and
  OpenClaw document cron's day-of-month OR day-of-week trap.
- **Catch-up converges on "coalesce to one run, the most recent, inside a staleness window".**
  Window sizes: CC Desktop 7 days, Multica 5 min, OpenClaw rescheduled at startup, CC `/loop`
  none.
- **Conditions compile to read-only code with typed reads.** The code returns
  `{fire, state, message}` (OpenClaw `trigger.script`, Lody CodeMode). A quiet tick produces no
  model turn and no history. An LLM judge runs only on changed observations.
- **Forgotten automations are bounded by default.** CC `/loop` and grok-build expire after 7 days.
  Gemini and ChatGPT turn off after inactivity. GitHub disables schedules after 60 days without repo
  activity. Zapier auto-pauses at 95% errors over 7 days. Devin goes to `Error` after consecutive
  failures. Lody lets an agent pause, but **"Resume requires a human."**
- **Ducter recommendation (§7):** Waiter (exists) + Routine (new) + `until` on windows, all owned by
  the control plane. Confirm through a proposal card in conversation. Report only on change by
  default. Coalesce missed runs. Give every Routine a review date. Default budgets. Effects stay
  intents (principle 18).

## 1. Evidence by product

### 1.1 Claude Code (V, code.claude.com docs)
- **Three scheduling surfaces** (`/docs/en/scheduled-tasks`, comparison table):

  | | Cloud | Desktop | `/loop` |
  |---|---|---|---|
  | Needs machine on / session open | no / no | yes / no | yes / yes |
  | Minimum interval | 1 h | 1 min (Claude-set), 1 h (form) | 1 min |
  | Permission prompts | auto mode | per task | inherited |

- **`/loop`.** It takes an interval and a prompt. If you omit the interval, Claude self-paces
  between 1 min and 1 h "based on what it observed", and prints the chosen delay and the reason at
  the end of each iteration. A self-paced loop ends itself with `ScheduleWakeup{stop:true}`. If an
  iteration neither reschedules nor stops, CC schedules one fallback wakeup about 20 min later and
  then ends the loop. Tasks fire *between turns* at low priority.
  - Limits: 50 tasks per session. **Recurring tasks expire 7 days after creation** ("bounds how
    long a forgotten loop can run"). There is **no catch-up**: a task fires once when Claude goes
    idle, not once per missed interval.
  - Jitter: a recurring task starts late by up to half its period, capped at 30 min. `*/5` instead
    runs 15 s *early*, to stay inside the 5-minute cache TTL.
  - Bare `/loop` runs a maintenance prompt that "does not start new initiatives". Irreversible
    actions "only proceed when they continue something the transcript already authorized".
  - The docs point to **Monitor**, which streams a background script's output lines, as "often
    more token-efficient" than polling with a prompt.
- **`/goal`** (`/docs/en/goal`) is the loop-until primitive.
  - After every turn, a *small fast model* judges the condition (up to 4,000 chars) and returns
    `not met` (with a reason that guides the next turn), `met`, or `impossible`. The judge "does
    not call tools", so the condition must be provable from the transcript.
  - **No-progress guard:** if there is no tool use for several turns in a row, the loop stops and
    returns control to the user with the goal kept.
  - Errors the user must fix (auth, credits, context overflow, model unavailable) clear the goal.
    Transient errors retry 3× and then pause the goal.
  - Status shows the condition, elapsed time, turns evaluated, **token spend**, and the last
    reason. Budgets go in the condition as prose ("or stop after 20 turns").
  - Background work defers evaluation, with check-ins at 30 min, then 1 h, then every 2 h, and
    at most 3 idle check-ins.
- **Cloud scheduled tasks**, formerly routines (`/docs/en/routines`). A saved configuration of
  prompt, repos, connectors, and environment, with one or more triggers: schedule, API `/fire`, or
  GitHub event.
  - Each run is "a new [session] for each run". GitHub events "don't reuse sessions".
  - A fired API payload is wrapped in `<routine-fire-payload>` and labelled untrusted. The stored
    prompt is the assignment.
  - Pushes go to `claude/`-prefixed branches. History rows read Succeeded / Failed / Cancelled.
    There is **Run now**, a pause toggle, and a 100/h scheduled-run cap.
  - `/schedule tomorrow at 9am …`: "Claude resolves the phrase … and **confirms the absolute
    timestamp before saving**." A one-off run turns itself off and shows as Completed.
  - Time zones are inconsistent across surfaces: presets use local time, but a bare cron
    expression is **UTC** unless it starts with `CRON_TZ=`.
- **Desktop tasks** (`/docs/en/desktop-scheduled-tasks`). Each run is a fresh session with an
  optional worktree, checked every minute.
  - "If your computer sleeps through a scheduled time, the run is skipped". On wake, Desktop runs
    "**exactly one catch-up run for the most recently missed time** [within 7 days] and discards
    anything older", and shows a notification.
  - The docs warn that "a 9am task might run at 11pm" and advise guards in the prompt.
  - History shows skipped runs with a reason: asleep, previous run still running, or too many
    tasks running.
  - A task may change its own schedule only through an approved `update_scheduled_task` call.

### 1.2 OpenAI: Codex / ChatGPT scheduled tasks, Pulse, dots
- **Codex / ChatGPT scheduled tasks** (V, learn.chatgpt.com/docs/automations).
  - *Standalone* tasks "start a new chat for each scheduled run". *In-chat* tasks reuse that chat's
    context and are suggested for "checking a long-running operation or a PR".
  - Schedules are custom controls or an RRULE. Event triggers (Gmail, Slack, GitHub) "can't
    combine … with a time-based schedule".
  - "**The Scheduled view acts as your inbox**". Runs with findings show unread.
  - Unattended runs use `approval_policy = never` inside the sandbox mode, and full access is
    flagged as "elevated risk".
- **ChatGPT Tasks** (V via search of help.openai.com/10291617; the page itself returned 403).
  - Active-task caps by plan: 3, 5, 10, or 15. At most once per hour.
  - "Check for changes and notify … when there's a meaningful update". The *model* judges
    significance.
  - Recurring tasks auto-pause after inactivity (I: exact rule not found).
- **Pulse** is being **retired** in favour of scheduled tasks (V via search of help article
  12293630). Proactive overnight curation collapsed back into the explicit-schedule object.
- **dots** (V, [1] §dots). Three separate ledgers: the main task, Activity (delegations), and
  **Scheduled**. A schedule has *what, when, time zone, end date, which changes merit notification,
  destination*. The agent self-schedules wakeups ("a fixed schedule isn't required"). "Connecting
  Slack … alone doesn't create a monitoring task." Pause main ≠ stop delegations ≠ cancel
  schedules.

### 1.3 Google, Meta, xAI, Devin
- **Gemini scheduled actions** (V, support.google.com/gemini/answer/16316416).
  - You describe the schedule in the prompt and Gemini "will reply with a summary of your
    schedule".
  - Up to 10 active. Results are **prepared within the hour before delivery**, so the docs warn
    that fast-changing data may be stale.
  - The chat is marked unread and you get a push. Pause, resume, edit, and delete are all
    available.
  - "**A schedule may turn off after inactivity.**"
- **Meta Muse** (I, press only). It runs on a cloud VM per user and has an "upcoming" section for
  recurring tasks next to an activity log and an **approvals queue**. It returns "when something
  needs a decision … or explicit approval" (sending email, purchases).
- **Grok** (I, press). Tasks are being folded into Automations, with schedule plus email triggers
  filtered by sender, recipient, and subject. No notify-on-change condition was found.
- **Devin** (V, docs.devin.ai/product-guides/scheduled-sessions).
  - Statuses are Active / Paused / **Error** ("encountered consecutive failures").
  - **Email notifications default to "On failure only"**, with Always / Never as options.
  - A one-time schedule disables itself. Times show in local time and are stored in UTC, and
    custom cron is UTC.
  - Devin "can schedule Devins" from plain language (cognition.ai blog).
- **Manus**: no primary source found.

### 1.4 Orchestration platforms (source)
- **Multica**.
  - `Autopilot` = a trigger (cron + IANA tz, webhook, manual) plus an assignee and an
    `execution_mode ∈ {create_issue, run_only}` (`R/multica/server/migrations/042_autopilot.up.sql:14`).
    Runs are rows in `autopilot_run`, idempotent on `(trigger_id, planned_at)`.
  - **Missed fires are collapsed to the most recent occurrence**, and a slot more than **5 min**
    late "should wait for the next configured slot instead of firing at an arbitrary activation
    time" (`internal/scheduler/jobs_autopilot.go:33-38,64-68`).
  - At fire time an **admission gate** records a `skipped` run with a reason when the runtime is
    offline, "rather than pile thousands of doomed tasks" (`service/autopilot.go:106-110,1552`).
  - Instructive failure: a `concurrency_policy {skip, queue, replace}` was shipped and then
    **dropped** because "skip had orphan bug, queue didn't actually queue, replace didn't cancel
    running tasks" (`migrations/043_fix_orphaned_autopilot_runs.up.sql:1-2`).
  - Wakeups take `kind ∈ {at, interval, cron, event}`, a platform-evaluated `Condition`,
    `expires_at | expires_in_seconds`, `on_timeout ∈ {end, wake}`, and **`MaxFires`, default 20
    for repeating event rules** (`service/issue_wakeup.go:31-60`, `issue_wakeup_activity.go:20`).
    Evidence from receipts is merged into a bounded `[WAKEUP]` block of at most 40 KB
    (`issue_wakeup_evidence.go:13`).
- **Lody**.
  - Durable JS conditions: `false` keeps waiting, and `{resumeText, payload}` queues *one*
    continuation into the registering session. Checks begin at registration ("already-ready
    conditions do not require a later source transition"). Interval default 30 s, minimum 1 s.
  - Expired waits cannot continue. Identical registrations deduplicate.
  - Reads are typed resources (`github.workflowRuns`, `provider.capacity`, …) returning
    `{value, observedAt}`, and "resources describe available data, not a catalog of business
    conditions" (`R/lodyai-lody/apps/cli/src/automations/README.md`).
  - Schedules (`apps/cli/src/mcp/schedule-tools.ts:60-110`):
    - `propose` writes a durable card with **Create**, and a dismissed proposal stays dismissed
      (`lib/schedules/schedule-proposal.ts:26-32`);
    - rule shapes are `manual | minutes | hours | daily | weekdays | weekly | monthly | once`;
    - destination is `new_session` (default), `own_session`, or `existing_session`;
    - `get` shows the next five times;
    - `pause` is agent-callable, but **"Resume requires a human."**
  - The engine skips with typed reasons: `DISPATCH_EXPIRED`, `CAPACITY_EXHAUSTED`,
    `ACTIVATION_REVOKED` (`lib/schedules/schedule-engine.ts:162-335`).
- **OpenClaw** (`R/openclaw/docs/automation/cron-jobs/`).
  - Schedule kinds are `at | every | cron | stream | on-exit`, with targets `main | isolated |
    session:<key>` [1]. Top-of-hour schedules are staggered by up to 5 min, and `activeHours` is
    a time-zone-aware window with tz = `user | local | IANA` (`schedules.md:30,67-80`).
  - DST: a time inside the spring-forward gap is invalid, and a repeated fall-back time uses its
    first occurrence (`:28`).
  - **Condition watchers** (`schedules.md:252-330`): a read-only `trigger.script` returns
    `{fire, message?, state?}`, and state is capped at 16 KB.
    - `fire:false` → "no model turn or visible update", and no run history.
    - Observation errors must throw, never become `fire:false`.
    - If a fired run fails, its new state is not persisted, so the watcher can fire again.
    - "**Do not use a change-only gate for an explicitly requested recurring report**."
  - **Pacing:** the agent proposes `next_check in 30m`, clamped to `pacing.min/max`.
  - `/loop` self-paces between 1 min and 1 h.
  - Startup: overdue agent jobs are *rescheduled* rather than replayed. Deferrals back off from
    30 s to 5 min. Missed timer ticks are coalesced (`how-it-works.md:26-31`).
  - **Jobs are created enabled, by design**: "Nothing supervises a disabled job … left disabled
    waiting for a confirmation that never arrives". Repeated errors auto-disable the job and
    notify the owner (`how-it-works.md:100-106`).
  - Delivery modes are `announce | webhook | none`, plus failure alerts with thresholds and
    cooldowns (`delivery.md`). Heartbeat monitors were retired into ordinary jobs [1].
- **Raft.** Reminders are server-authoritative, one-shot or recurring. Each fire is classified as
  a **catch-up** when it is observed after its due time plus a tolerance, and the user sees that
  label (`R/raft-source/packages/server/src/apps/reminder/fireTiming.ts:8-23`, `service.ts:551`).
  An agent detail tab lists "Pending Reminders".
- **grok-build** (`R/grok-build/.../scheduler/types.rs`).
  - Each loop iteration runs as a subagent that **resumes the previous iteration's transcript**,
    but `LOOP_FRESH_CHAIN_EVERY = 10` forces a fresh chain (`:227`). Patching the prompt also
    forces a fresh chain (`chain_reset_pending`, `:219-222`).
  - Iteration output is capped at 4,000 chars (`:229`). `RECURRING_TASK_TTL_DAYS = 7` (`:234`),
    and `next_wake_at = min(next_fire, expires_at)` (`:286-293`).
  - Minimum interval 60 s, at most 50 tasks. `SchedulerFired` is a typed synthetic message [1].
- **DimAgent.** `schedule_wakeup` is a background-task type next to `agent` and `exec`
  (`R/dim-ext/docs/HANDOFF.md:29`).

### 1.5 Triggers outside agents
- **GitHub Actions** (V, docs.github.com events-that-trigger-workflows). UTC by default, with an
  optional IANA time zone. Minimum interval 5 min. Runs "can be delayed during periods of high
  loads". In public repos, schedules are "automatically disabled when no repository activity has
  occurred in 60 days".
- **Zapier** (V via search). A Zap is auto-paused when 95% of its runs in 7 days errored. A polling
  trigger can miss items when the source paginates. Auto-re-enabling a Zap led one user to 10
  runs/min. (I, common knowledge: the editor's "Test trigger" pulls real sample records before
  you turn a Zap on. That is the UX precedent for a predicate dry run.)

### 1.6 The Ralph Wiggum loop (V, ghuntley.com/ralph)
- **Mechanism.** `while :; do cat PROMPT.md | claude-code ; done`. Each pass starts with fresh
  context, does **one item per loop**, and stores its state in `specs/`, `fix_plan.md`, and
  `AGENT.md`. "Backpressure" comes from tests, type checkers, and builds.
- **Failure modes** (named by Huntley):
  - ripgrep false negatives make it re-implement code that exists;
  - placeholder stubs ("compiling is rewarded");
  - duplicate implementations ("Achilles' heel");
  - waking up to a broken tree;
  - eventually going "completely off track", which needs `git reset --hard` or a regenerated plan.
- **Tuning:** add "signs", i.e. targeted prompt guards.
- **The CC ralph plugin** (I, community docs): a Stop hook that blocks the stop until a
  `--completion-promise` string appears, plus `--max-iterations`. Without a cap "Claude will loop
  indefinitely".
- **Further failure modes** (I, secondary sources): agents deleting tests that earlier passes
  wrote, and agents colliding on a repo used as shared mutable state.

## 2. Q1: object model and run representation

| System | Object | A run is | Memory across runs |
|---|---|---|---|
| CC cloud / Desktop | task (config + triggers) | new session | repo, files |
| CC `/loop`, `/goal` | session-scoped task / goal | turn in the same session | transcript |
| Codex / ChatGPT | task (standalone / in-chat) | new chat / same chat | chat or none |
| Multica | Autopilot + runs; wakeup rule | issue or task | issue comments |
| Lody | Schedule (destination mode); automation (wait) | session message | session |
| OpenClaw | job (schedule + trigger + payload + delivery) | turn: main / isolated / keyed | `trigger.state` 16 KB |
| grok-build | ScheduledTask | subagent, resumed, fresh every 10 | transcript chain |
| Ralph | bash loop | fresh process | plan and spec files |

**Pattern.** Every product has a template that spawns runs, and runs are first-class rows with a
status and a reason. In-chat continuation is reserved for babysitting a single thing. Long chains
are periodically re-cut (grok-build every 10, Ralph every pass), because a transcript that grows
without bound degrades. That is principle 4's physics.

## 3. Q2: natural language → schedule, confirmation, time

- **Parse and confirm.** CC confirms the absolute timestamp. Gemini replies with a summary. Lody's
  card needs a click. OpenClaw creates the job enabled and relies on supervision.
- **Preview.** Lody shows the next 5 runs. CC shows the next run on each row and prints the
  rounded interval it picked ("7m → nearest clean step, and tells you").
- **Representation.** Prefer named rules or RRULE (Lody, Codex) over raw cron. Raw cron has the
  day-of-month OR day-of-week trap (CC, OpenClaw `0 9 15 * 1` fires 5–6×/month) and UTC confusion
  (CC cloud, Devin, GitHub).
- **Time zones.** Store the rule as wall-clock time plus an IANA zone. OpenClaw's `user` zone
  follows the user. The DST gap is invalid or skipped, and fall-back uses the first occurrence.
- **Jitter.** Use a deterministic per-task offset (CC Desktop "same offset", OpenClaw ≤5 min for
  top-of-hour). Pass `exact` when the time matters.
- **Missed runs.**
  - Coalesce to one: CC Desktop (7 days), Multica, OpenClaw, CC `/loop`.
  - Skip if stale: Multica beyond 5 min, Lody `DISPATCH_EXPIRED`.
  - Always tell the run its scheduled time and its actual start (CC's 11 pm advice).
  - Label catch-ups (Raft, CC notification).
  - Record skips with a reason (CC Desktop history, Multica admission, Lody codes).

## 4. Q3: semantic conditions → code

- **Who compiles.** The agent writes the predicate at registration time (Lody, OpenClaw) or picks
  a structured type (Multica: `pull_request{checks_finished|merged|conflicts}`, `children_done`,
  `issue_field`). The platform runs it, not the LLM.
- **Verifying the predicate.**
  - Lody evaluates it immediately at registration. OpenClaw offers `run --due` to test the gate,
    and forced runs bypass it. Observation errors throw and become a visible failure. Nothing
    fails silently quiet.
  - Missing everywhere (gap): a *dry-run readout* shown to the user ("currently false because the
    PR has 1/2 approvals").
- **Intervals.** Lody uses 30 s as a minimum delay. Multica polls every 30 s and pushes events.
  CC and OpenClaw self-pace between 1 min and 1 h with min/max clamps. OpenClaw deferral backs off
  from 30 s to 5 min.
- **LLM-judged conditions.** ChatGPT's "meaningful update" is model-judged. CC `/goal` judges
  every turn with the small model, which is "typically negligible". The cost is controlled by
  Ducter's rule: hash the observation and call the judge only when the hash changes (principle
  16). Code does the cheap part ("new email from X in thread Y"). The model does only the
  semantic part ("is this a real reply or an auto-responder?").
- **False positives.** OpenClaw compares exact identities (head SHA, check identity) instead of an
  aggregate status. A failed run does not persist its state, so the watcher can fire again. The
  woken run must re-verify the condition before acting (I: no product states this; recommended).
- **User view.** Products show a prose reason (Lody `--reason`, Multica instruction). OpenClaw
  shows saved configuration versus observed runtime state. None shows the predicate code to
  end users.

## 5. Q4: stop conditions, budgets, progress

- **Caps seen.**
  - Iterations or fires: Multica `MaxFires` 20, Ralph `--max-iterations`.
  - Lifetime: 7 days for CC and grok-build, `expires_at` in Multica and Lody.
  - Rate: CC cloud 100 runs/h, ChatGPT 1/h.
  - Budget as prose in the condition (CC `/goal` "stop after 20 turns"). CC shows token spend but
    does not cap it.
- **No-progress detection.**
  - CC `/goal`: no tool use for several turns → stop.
  - Ducter's existing circuit breaker: the same error N times → `failed`.
  - Ralph's documented failures need *diff-level* signals: the same diff hash recurring
    (oscillation), the same failing-test set over N iterations (no progress), tests deleted or
    stubs inserted (cheating), and a broken build left at the end of an iteration.
- **Progress display.** CC shows a per-turn verdict plus a reason, and status shows turns, spend,
  and the last reason. Desktop and cloud show a History list. No product shows a sparkline. This
  is a gap Ducter can fill cheaply from typed reports.

## 6. Q5–Q6: reporting without spam; lifecycle and stale cleanup

- **Report policies seen.**
  - Inbox with unread (Codex Scheduled, Gemini).
  - Only on meaningful change (ChatGPT; OpenClaw `fire:false`).
  - Failure only (Devin's default).
  - `none` / webhook (OpenClaw).
  - Explicit digests must *not* be change-gated (OpenClaw).
- **Pause, resume, edit.** Every product has a pause toggle and Run now. Lody: the agent can pause,
  only a human resumes. CC: a self-edit needs approval. OpenClaw: an edited condition is protected
  from the old evaluation's writes.
- **Stale cleanup.** TTL (7 days), inactivity auto-off (Gemini, ChatGPT, GitHub at 60 days),
  error auto-pause (Zapier 95%/7 days, OpenClaw, Devin `Error`). OpenClaw's counterpoint: a
  disabled-pending job is invisible, so *supervise active jobs* rather than parking them
  unconfirmed.

## 7. Recommendation for Ducter

### 7.1 Object model: one new object, and one property on windows

```
Waiter   (exists)  owner: a window.  one-shot predicate → wakes that window (blocked→working).
                    kinds: timer | poll(code) | webhook | judge(code-gated LLM) | fw:<id> | quota.
Window.until (new) the loop. {predicate, budget, progress_signal}. C re-drives the window after
                    each turn until predicate holds, budget is spent, or no-progress fires.
Routine  (new)     owner: the persona (Log). trigger × brief template × run_mode × report_policy
                    × budget × effect_scope × review_at. Each fire → a Run.
Run                 = a Focus Window (run_mode=fresh) or a turn in the Routine's own window
                    (run_mode=continue). A quiet tick (trigger false) is not a Run.
```

- **Trigger kinds:**
  - `at` (one-shot);
  - `rule` (named rule or RRULE, plus an IANA zone or `user`);
  - `condition` (code predicate on a poll interval, with an optional judge stage);
  - `event` (webhook or connector event, filtered);
  - `stream` (line or batch source, for "monitor and react").
- **Run modes:**
  - `fresh`, the default for reports and sweeps. Each run is a new window seeded from the brief
    template, plus a **Routine notebook**: a small state blob and a pointer to the last run's
    report (the Ralph and OpenClaw pattern).
  - `continue`, for babysitting one thing. A single long-lived window, re-cut every N runs or
    whenever the brief changes (grok-build's rule, i.e. principle 4).
- **Always-on agents** are a Routine with `event` or `stream` triggers in `continue` mode. They are
  never a resident process (principle 19). Their residency parks between fires like any other
  window.
- **No harness-native scheduling.** Keep `CronCreate`, `ScheduleWakeup`, and `/loop` disabled
  inside windows ([5] §11). A window that wants to wait calls `report_to_main(blocked_on=…)` or
  `propose_routine`. Ducter's tool server owns every timer, so the forecast is complete.

### 7.2 States and actors (extends focus-window-states.md)

| Routine from → to | Actor | Trigger |
|---|---|---|
| (none) → `proposed` | M | the user asked; card written to the channel (Lody `propose`) |
| `proposed` → `active` | U | the user presses Create, or replies "yes" (a policy may auto-confirm read-only routines, see D2) |
| `proposed` → `dismissed` | U / C | dismissed, or unanswered past its horizon (the card stays in the Log) |
| `active` → `paused` | U / M / C | the user asks; M sees N unread results in a row; C sees K consecutive failures or an exhausted budget |
| `paused` → `active` | **U only** | resume is a human act (Lody) |
| `active` → `review` | C | `review_at` reached; M asks "keep, change, or stop?" with default *pause* |
| `active` → `ended` | C | one-shot fired, `until` met, `max_runs` reached, or `end_at` passed |
| any → `deleted` | U | runs and their windows are archived, never deleted |

A Run's attention follows the window machine unchanged. Two additions:
- a `skipped(reason)` Run row: `machine_asleep`, `stale`, `previous_running`, `budget`, `quota`;
- `catch_up: true` on Runs that started late.

Overlap policy is **skip if the previous run is still running**, and nothing else. Multica's
three-way policy shipped broken and was removed.

### 7.3 Conversation pattern: ack → proposal card → confirm

The user says: "every weekday at 9, check my open PRs and tell me what needs me". M acks, then
writes one card, rendered from typed fields:

```
Routine · PR triage                                      [Create] [Adjust]
When     Weekdays 09:00 Asia/Shanghai (follows you)  next: Mon 11-10 09:00 · Tue 09:00 · Wed 09:00
Does     list open PRs I own or review; flag CI red, requested changes, stale >3d
Runs on  mac-mini  (if asleep: one catch-up until 21:00, else skip and say so)
Reports  only when something needs you  · quiet days leave a tick on the Desk
Budget   ≤ 15 min, ≤ $0.40 per run       Effects  read-only
Review   2026-12-08 (30 days)            Condition check now: 2 PRs would be flagged
```

- **Ask, don't guess.** M asks a short question instead of proposing when the what, the when, or
  the destination is ambiguous (Lody rule). The *what* is written as a self-contained brief with
  no reference to this conversation.
- **Dry run.** Show a live dry run of the predicate (code) or of the first run's plan (cheap
  model), so the user sees what the Routine *would* say today. Watchers show "currently false
  because …".
- **Spell back.** Echo the rule in words plus the next 3 dates. Flag rounding ("every 7 min →
  every 10 min"). Refuse DST-gap times with a suggestion.
- **Edit the same way.** "Make it 8:30" produces a diff card (old → new, next dates), not a
  silent change.

### 7.4 On the Desk and in the attention forecast

- **Forecast timeline (ui.md §Desk).** Plot each active Routine's next fires, but **only fires
  that are expected to need the user**: runs with report policy `always`, or runs that may raise
  an intent. Quiet-unless-change runs show as faint ticks. Also plot `review_at` dates, budget
  run-outs, `until` deadlines, and waiter deadlines (which already exist). Quiet hours suppress
  runs, which shift per `activeHours`.
- **Lanes.** Active Routines sit in 候着 as a compact "Standing" group, each showing its next fire
  and its last result. A running Run is a normal window card in 在办. A Run that produced a
  decision is a normal 待批 card.
- **Loop window cards.** These carry an **iteration strip**, one cell per iteration colored by
  outcome: progress, no change, regressed. Next to it sits a sparkline of the progress signal
  (failing tests, eval score, queue length), plus `iter 7/20 · $1.10/$3`. The workspace view adds a
  per-iteration diff list taken from checkpoints (principle 13).

### 7.5 Defaults

| Item | Default |
|---|---|
| Report policy | Watchers and monitors: **only on change** (code-gated). Explicit reports and digests: **every run** (OpenClaw rule). Maintenance sweeps: **only on failure or finding**. Every report goes into the living message (principle 7), never a push, unless it carries a decision. |
| Loop budget | `max_iterations` 20 (Multica `MaxFires`). Wall time 4 h. Spend 3× the estimate that M shows on the card. No-progress: the same failing set or diff hash 3× → `needs-you`. Oscillation: a recurring A↔B diff hash → `needs-you`. Cheating guard: tests deleted or skipped, or an assert weakened, without a brief permit → `needs-you`. |
| Routine budget | Per-run time and spend caps. Weekly spend cap per Routine. 3 consecutive failures → `paused` + report. |
| Lifetime | Every Routine has a `review_at`: 30 days for recurring, 7 days for watchers, unless the user sets one. Session-born "keep checking" loops expire at 7 days (CC, grok-build). |
| Staleness | 3 consecutive unread results → M proposes a pause, with default = pause (reversible). |
| Poll | Code predicates: 60 s floor, with backoff to the source's natural cadence (CI ≈ 1 min, email ≈ 5 min, prices ≈ the user's stated tolerance). Prefer webhooks or connector events when the source supports them. Judge only on a changed observation hash. Debounce 2 consecutive true results for judge-stage predicates. |

### 7.6 Catch-up when machines sleep

The control plane never sleeps (principle 19), so **triggers never miss**. Only *execution* is
late. On a due fire, the policy is:
1. If the Routine needs no local state, run it on any eligible body (another machine, or a cloud
   body if one is configured).
2. Otherwise **wake the machine** if a wake path exists (C may wake machines).
3. Otherwise **hold one pending occurrence** and coalesce later ones into it. When the machine
   returns inside `late_ok`, run once with `catch_up: true`, passing `scheduled_for` and
   `started_at` into the brief. `late_ok` defaults to min(period/2, 12 h): a daily 09:00 job runs
   by 21:00 at the latest.
4. Past `late_ok`, record `skipped(machine_asleep)` and mention it once in the next report ("Tue's
   triage was skipped: mac-mini asleep").

Never replay N missed runs. One-shots (`at`) always run late rather than never, and are labelled.

### 7.7 Safety

- **A Run is unattended, so the bar is higher than for a live window.**
  - Its `effect_scope` is fixed on the card (`read-only`, `drafts`, `push to ducter/* branches`,
    …). Anything beyond it becomes an **intent** (principle 18) and waits in 待批 for the next
    harvest.
  - Approvals never auto-apply for Routine runs. Defaults auto-apply only for reversible internal
    choices.
  - A Routine cannot widen its own scope or schedule. `propose_routine` and edits from inside a
    window become a card for U (CC `update_scheduled_task` needs approval).
- **Trigger payloads** (webhook bodies, email text, stream lines) are **untrusted data** wrapped
  as such (CC `<routine-fire-payload>`). The stored brief is the only instruction.
- **The woken run re-verifies the predicate** before any effect, and the evidence goes into its
  report.
- **Loops** (`until`) inherit the brief's write set and lease (cross-axis invariant 4). A loop
  never runs two iterations at once.

### 7.8 User decisions

- **D1. Naming.** Is it "Routine" (CC's old term), or a Chinese term to match the Desk vocabulary
  (e.g. 常例)?
- **D2. Confirmation strictness.** Always use the Create card (Lody)? Or auto-activate read-only,
  no-effect Routines with an undo window (OpenClaw's "supervise enabled jobs" argument)?
  Recommended: card always, but "yes" in chat counts as Create.
- **D3. Time-zone semantics.** Do rules follow the user when they travel (`user`, recommended for
  personal routines) or stay pinned to their creation zone?
- **D4. Cloud fallback body.** May a Routine run on a cloud body when the home machine sleeps
  (credentials, cost)? Or wake-or-skip only?
- **D5. Default spend caps** per run and per week, and whether hitting one pauses or only reports.
- **D6. Default review horizons** (30 days recurring / 7 days watcher), and whether unread-streak
  auto-pause is proposed (recommended) or automatic.
- **D7. Who may see predicate code.** Is it shown on demand in the power view (recommended), or
  only as prose?

## Sources

- Claude Code docs: code.claude.com/docs/en/scheduled-tasks, /routines, /desktop-scheduled-tasks,
  /goal (fetched 2026-11-08).
- learn.chatgpt.com/docs/automations (Codex / ChatGPT scheduled tasks). help.openai.com/en/articles/10291617
  (Tasks; via search, 403 on fetch). help.openai.com/en/articles/12293630 (Pulse retirement; via
  search).
- support.google.com/gemini/answer/16316416 (Gemini scheduled actions).
- docs.devin.ai/product-guides/scheduled-sessions. cognition.ai/blog/devin-can-now-schedule-devins.
- docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows.
- ghuntley.com/ralph. Ralph plugin: community guides (e.g. github.com/Glucksberg/ralph-loop-plugin) (I).
- Meta Muse: testingcatalog.com, kdnuggets.com, foxbusiness.com (I). Grok: remio.ai,
  testingcatalog.com (I). Zapier: help.zapier.com and community threads (I/V mixed).
- Source: `R/multica/server/{migrations/042,043, internal/scheduler/jobs_autopilot.go,
  internal/service/{autopilot.go,issue_wakeup.go,issue_wakeup_activity.go,issue_wakeup_evidence.go}}`.
  `R/lodyai-lody/apps/cli/src/{automations/README.md, mcp/schedule-tools.ts,
  lib/schedules/{schedule-proposal.ts,schedule-engine.ts}}`. `R/openclaw/docs/automation/cron-jobs/{schedules,
  how-it-works,delivery}.md`. `R/raft-source/packages/server/src/apps/reminder/{fireTiming,service}.ts`.
  `R/grok-build/crates/codegen/xai-grok-tools/src/implementations/grok_build/scheduler/types.rs`.
  `R/dim-ext/docs/HANDOFF.md`.
