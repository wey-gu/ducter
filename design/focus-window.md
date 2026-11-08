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

## Pull tools

Windows get the same `log.search` / `log.read` tools as the main AI. Scope: the persona's
channel, sibling windows, and memory. A window that is missing context fetches it itself
instead of asking the main AI.

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
- `wait?`: a typed waiter
- `transcript`: a pointer to the full transcript

The report is the only way a window wakes the main AI. Reads never wake anyone.

## Checkpoint (principle 13)

The window writes a checkpoint after each meaningful step, while it is still healthy. It
records where the work stands, what is done, what comes next, open questions, and any
intents in flight.

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

A quota reserve is kept for the main AI. Kimi's host-side token reader stays disabled
(principle 17).

**When quota runs out mid-task:**
1. Wait, if the reset is soon.
2. Otherwise switch to another model in the same harness.
3. Otherwise hand off to another harness (checkpoint above).
