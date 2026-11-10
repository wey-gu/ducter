# 48 · Harness engineering audit after the D146–D169 merges (2026-11-10)

**Question.** About twenty agent branches merged in one day (D146–D167 on main, D165/D166 and
D168/D169 still on branches). Do the harness engineering and the efficiency still match what
the research found and the principles decided? Where they drifted, fix what is clearly low-risk
and add guardrails, so the next round of parallel merges can't drift silently.

**Method.** Main read at `ecea3bb`, plus the two in-flight branches, read-only:
`worktree-agent-a753a944ced8febd7` (proactive, D165/D166) and `worktree-agent-ab55cd49186763c4b`
(Mem in tasks, D168/D169).
- Measured on main, with no model calls:
  - the system prompt;
  - the tool list each role gets, through Ducter's real MCP endpoint;
  - a fresh session's seed and one warm turn, rendered from large fixtures (now `packages/partner/test/prompt-budget.test.ts`).
- `bun scripts/probe-harnesses.ts --offline`, run against the installed Claude Code, Codex and pi.
- Read against principles 2, 5, 15, 16 and 17, D85, D135, and research/03, 08, 11, 30, 34 and 38.
- Tags: **VERIFIED** (read in code, measured or run), **INFERRED** (reasoned, not run).
- The partner eval was **not** run (no model spend). That gap is itself finding F6.

## 1. What a session costs now (VERIFIED, measured 2026-11-10)

| Part | Size | Note |
|---|---|---|
| Partner system prompt | 17,020 chars ≈ 4.5K tokens | stable bytes; identity is the last block |
| Partner tools (24) | 25,510 JSON chars ≈ 7.1K tokens | largest: `task_open` 4.4K chars, `wait_for` 3.9K, `keep_going` 2.5K, `routine_propose` 2.0K |
| Task tools (5) | 6,429 chars ≈ 1.8K tokens | `wait_for` alone is 3.6K chars, 57% of the list |
| Fresh seed, busy history (300 long exchanges, 100 tasks, 30 computers) | ≈ 22.7K tokens | 40 history lines clipped at 1,200/800 chars, `<tasks>` 20 open + 8 finished |
| Warm turn (one user line, `[time]`, `[devices]`) | ≈ 250 tokens | |
| Fixed + seed vs the 120K re-cut | ≈ 34K, 28% | room for a long conversation before the re-cut |

The shape research/34 measured still holds: the clean partner setup costs about 12K fixed
tokens before the conversation, against Codex's 43K → 13K and pi's 13.5K → 1.2K.

## 2. Findings, ranked

Severity: **H**, the efficiency or correctness of a decided strategy is at risk; **M**, a bounded
cost or a drift that grows; **L**, hygiene. Owner: **here**, fixed in this change; **branch**,
for the in-flight branch's author; **author**, needs a decision (§4).

| # | Sev | Finding | Evidence | Fix | Owner |
|---|---|---|---|---|---|
| P1 | H | **Proactive: the partner-model judge runs on every look that brings anything new, outside the budget.** | VERIFIED on branch a753…: every new item calls `speak("look")`, which calls `judged(detect(ledger))` (`core/src/proactive/engine.ts:265-269, 344`). Verdicts aren't remembered, so turned-down candidates are re-judged on each look. The judge runs `cheap: false` (the partner's model). `overBudget` gates triage only (`:250`). Worst case, with mail and GitHub every 10 min and a calendar every 15: ≈380 partner-model calls a day, against D165's "a few times a day". | Judge only when the ledger gained facts or a candidate key is new; remember verdicts per key; one model judge a day (the morning run) plus code-only `preBar` for urgent candidates; count the judge against the budget. Add a test that asserts the number of judge calls across repeated looks. | branch |
| P2 | H | **Proactive: no count cap on candidates in the judge prompt; notes uncapped in 有用就说; fold-ins re-render all earlier finds.** | VERIFIED: `detect.ts:343-353` and `judge.ts:52-64` have no cap. `capLeft = Infinity` at `engine.ts:280`. `render.ts:165-172` renders each revision in full. | Top N (≈ 8–12) by cost before the model sees them; a hard per-note cap (≈ 5); render only the newest revision of a find. | branch |
| M1 | H | **Mem in tasks: Ducter's recall and the plugin's own context both run whenever the plugin check says anything but "installed".** | VERIFIED on branch ab55…: `core/src/mem-plugins.ts:237` treats only `installed` as present. "review" and "update" fall through to Ducter's mode (`runner.ts:863`): the task gets `<what_i_know>` (`:875, 1109`), and the plugin's SessionStart Context Bundle is injected too. The author's own Codex fixture is in "review". | Choose the mode from a `present` flag (any state but `absent`), not from the card's display state. | branch |
| M2 | H | **Mem in tasks: the plugin's context cost is unmeasured and unbounded; it re-enters after every compaction.** | VERIFIED absent: research/47 lists the hooks (SessionStart incl. "compact", UserPromptSubmit) but no token count. Ducter's own recall is bounded (4×200 chars, 6 s). | Measure the bundle on a real persona at the task window; record it in harness-facts as a per-harness cost; ask Mem for a size knob if it is large. | branch, Mem |
| F1 | M | **The persona's identity (L1 of every partner session) was unbounded.** `identityFromBundle` copied Mem's profile context, custom instructions and the whole rule stack verbatim. | VERIFIED: `core/src/persona.ts:13-25` before this change. | Fixed: per-field cap 2,000 chars, 30 rules × 300 chars, block 8,000 chars, with a line naming the rest. Test: a 40K-char profile + 400 rules stays ≤ 8.2K chars. | here |
| F2 | M | **A task report's questions and evidence were uncapped**, and they enter the partner's turn verbatim. Only `summary` had a bound (600). Smaller: task titles in `<tasks>` and report heads, the `[devices]` line (one entry per computer), and open tasks in `<tasks>`. | VERIFIED: `runner/src/tools.ts:62-84`, `partner/src/render.ts:31, 213-240`, `partner.ts:renderDevices` before this change. | Fixed: `REPORT_BOUNDS` (5 questions × 500 chars, 12 evidence × 120/300); titles clipped at 120; `[devices]` ≤ 12 computers (awake first) with names ≤ 40; `<tasks>` ≤ 20 open (those that need the user first) with the rest counted. | here |
| F3 | M | **The cheap judge's model came from a private table that named only Claude Code**, though the registry has `cheapModel` for Codex and DeepSeek Harness. A Codex brain ran every `wait_for` and `keep_going` judgment on its full partner model, against principle 16. | VERIFIED: `core/src/judge.ts:12` (`CHEAP = { "claude-code": "haiku" }`) vs `protocol/src/harnesses.ts:69, 87, 120`. The proactive branch's `createHarnessAsk` reuses the same table. | Fixed: `judgeModel()` reads `HARNESSES[h].cheapModel`. Codex now judges on `gpt-6-luna`, the model research/34 measured at 9/10 on the partner smoke. Test added. | here (proactive: rebase onto it) |
| F4 | M | **Version drift: Claude Code 2.1.322 and pi 1.5.1 are installed, outside the verified 2.1.319 / 1.4.0.** The 2.1.322 binary's compaction code changed shape: per-window entries, and "a fork ignores `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`". The probe's 20K-reserve check keyed on a minified name, so it fails on every build. | VERIFIED: the probe's output; the binary read (strings only; the semantics are INFERRED). | Probe: the reserve check now only informs. Five new checks for the switches Ducter sets (tool search, `alwaysLoad`, the Read cap, `claudeMdExcludes`, `--chrome`) all pass on 2.1.322. Open: the live compaction check on 2.1.322, then widen `verified`. | here (probe); author (live re-verify, §4) |
| F5 | M | **Per-harness switches were written outside the registry and the adapter**, so the probe couldn't check them. | VERIFIED: `partner.ts:817` set `ENABLE_TOOL_SEARCH` on every harness's spec; `core/mcp.ts:65` held `anthropic/alwaysLoad`; `oar.ts:261` held the Read cap env. | Fixed: `CLAUDE_SWITCHES` in harness-facts. The adapter sets tool search for every clean Claude session (and only Claude), and the hub reads the meta key from it. The lint test (G3) fails on such literals elsewhere. | here |
| F6 | M | **The persona changed after the last eval run, and the eval has no scenarios for the new rules.** D157 changed `persona.ts` (needs, "where", rules naming a computer) on 11-10. The latest eval results are from 11-09. The eval has no case for `needs`/where (W1–W6), `rule_save`, connections (D158), browser places, folder tasks (D142), proactive notes or `remember` in tasks. | VERIFIED: `git log` of `partner/src/persona.ts` vs `partner/eval/results/*`; the scenario id list in `partner/eval/scenarios.ts`. persona.ts itself says "change it there first". | Add the scenarios (owner of each D) and run haiku + sonnet once (≈ $1–2 total at research/30's $0.93/run). Proposed rule: a persona change carries an eval result file in the same merge. | author, per-D owners |
| F7 | M | **Two secret detectors disagree.** The brief-side `redactSecrets` (partner.ts) knows 6 formats. The display-side `redact` (protocol/redact.ts, shared with Go) knows about 20, including `nmem_*_`, `glpat-`, `hf_`, JWTs and bearer tokens. A pasted `nmem_ct_…` key reaches a task's brief. | VERIFIED: `partner.ts:254-258`, `protocol/src/redact.ts:16-30`. G-safety G3 says secrets never reach a task; D152's note says the Log keeps a pasted key because the task may need it to connect. | Needs a decision (§4); not changed. | author |
| F8 | L | **One-shot sessions (the judge, the digest writer) deny 12 named built-ins instead of passing `--tools ""`.** Built-ins added since then (Agent, Skill, LSP, …) still ship their schemas on each call. | VERIFIED: `judge.ts:13`, `spine/writer.ts:174`; research/03 VERIFIED that `--tools ""` gives `tools: []`. Per-call cost not measured (INFERRED: several K tokens of schemas). | Add a SessionSpec `noTools` that the adapter maps per harness (`--tools ""`, pi `--no-tools`); measure the cost before and after with one cheap call. Not done here: it needs one live call, and `~/.claude` is out of bounds for this audit. | author (defaults §4) |
| F9 | L | **`wait_for`'s description is 57% of a task's tool list** (3.6K of 6.4K chars), and tasks rarely wait. | VERIFIED: measured. | Shorten the task-role description (keep the partner's), or list it only for repo tasks with CI. Small; owner of D112. | author |
| P3 | M | **Proactive: mail subject lines go into task briefs unfenced, and snippets reach triage unredacted.** | VERIFIED: `engine.ts:468-469`, `detect.ts` step briefs, `items.ts:46, 152`. | Fence mail fields in `<data>`; `redact()` snippets before `triagePrompt`. | branch |
| P4 | M | **Proactive: budget accounting.** Every call counts cache reads at full weight. The judge's spend is charged to whichever source is first. One source over budget makes the whole mode "urgent only". | VERIFIED: `engine.ts:186, 202, 288`. | Weight cache reads; charge each source; apply the budget per source. | branch |
| P5 | L | **Proactive: recovery and growth.** The cursor is saved before triage (at-most-once). The 60-day backfill has no resume marker. `st.said` is never pruned. A test whose judge throws probably fails (`judged()` has no catch). | VERIFIED code; the test failure is INFERRED. | As listed in the branch review. | branch |
| M3 | M | **Mem in tasks: "memory off" doesn't hold on pi and DeepSeek Harness, and may not on Codex.** The plugin keeps running without the persona's identity. | VERIFIED: `MEM_PLUGIN_IDS` covers only claude-code and codex; `runner.ts:842-845` removes the identity env. Codex user-level hooks: INFERRED. | Per-harness facts for the pi extension and DSH; a Codex hooks check; a probe case. | branch |
| M4 | M | **Mem in tasks: the plugin ids and the disable method are outside harness-facts, and the probe doesn't cover them.** Principle 17's "every Mem write records `source_app = ducter`" no longer holds for the plugin's thread capture. | VERIFIED: `protocol/src/mem-plugins.ts:21`; `principles.md:103-109`. | Move the ids and the method into harness-facts with evidence; add a probe case. Amend principle 17 to "Ducter's own writes", or ask Mem for an orchestrator-provenance env. | branch, author |
| L1 | L | Proactive duplicates the quiet-hours default (`push.ts` `DEFAULT_QUIET`) and the CJK test. Its prompts open with the date. | VERIFIED. | Reuse the helpers; move the date next to the data. | branch |

Checked and holding on main (VERIFIED):
- The system prompt is stable bytes, with identity last. Every volatile line (`[time]`,
  `[devices]`, `[language]`, recall) enters at L4.
- A fresh seed puts the stable blocks first (principle 2).
- Bridge text is capped at intake (4,000) and framed.
- Recall is ≤ 3 hits × 400 chars.
- The judge runs only on changed data, at most every 10 min, over ≤ 6,000 chars.
- Background loops run in code: release checks hourly, agent checks every 6 h, oo every 5 min,
  Bridge follow-through ≥ 2 h. None wakes the partner model.
- `agent_update` events go to the `devices` stream, never a trigger.
- A partner turn that was in flight at a restart is carried (`carriedFrom`).
- Go ports share fixtures (redact, say, steps, transcript, when).
- The partner's harness compactor stays above the re-cut.

## 3. Where Ducter is ahead, and where it is behind

**Ahead** (against research/03, 11, 34, 36 and 38, and the products they read):
- The conversation is rebuilt from the Log with digests, and the harness session is a cache.
  Peers compact one raw session (Claude Code, Codex) or reset it.
- There is one registry of per-harness facts, with evidence tags and a probe that reports drift.
  research/34 found no peer that keeps one.
- The clean setup is measured per harness (43K → 13K, 13.5K → 1.2K), and the partner is
  isolated from the user's config while tasks inherit it.
- Waits are code, with a cheap judge over changed data only. Peers poll with the main model
  (research/20).
- Reports are typed and evidence is checked by Ducter, not by the model.

**Behind, or not proven:**
- Prompt-cache hit rates are not measured anywhere. Principle 4's cost model (resume vs re-cut)
  is still a heuristic (55 min, 120K). The Claude Code JSONL `api-request` records hold
  `cacheControl` and usage (research/03 §2.2), so a cheap measurement exists.
- Tool loading is static: the partner always gets all 24 tools (7K tokens). Claude Code's tool
  search and Codex's direct loading both allow fewer. A two-tier list is untested (the core
  tools, plus routines, rules and connections when used).
- The partner eval lags the persona (F6), and no real-model check covers the proactive or Mem
  paths.
- Live re-verification on the new harness versions (F4) is owed; the probe only sees strings.

No fresh web check was made. The sources for this section are from 2026-11-08 to 11-10 and
under a month old.

## 4. Decisions for the author (each with a proposed default)

1. **One secret detector for the brief (F7).** Default: the brief uses the shared `redact`
   formats too, except an `nmem_*` connect code, which stays when the user's own words ask the
   task to connect with it, as D152's case needs. Alternative: keep the two lists and document
   why.
2. **Live re-verify Claude Code 2.1.322 and pi 1.5.1 (F4).** Default: run the D135 live checks
   (compaction point with `--debug-file`, window knob, 1M switch) on a scratch login with
   haiku. Widen `verified` only if they pass. ≈ $0.05.
3. **Tool-less one-shots (F8).** Default: add `noTools` to SessionSpec, mapped in the adapter,
   after one measured cheap call that shows the saving.
4. **Persona changes carry an eval run (F6).** Default: a merge that changes `persona.ts` or
   the partner's tool descriptions includes `eval/results/<date>-*.md` from haiku (≈ $0.93).
   Owners add W1–W6, `rule_save` and connections scenarios first.
5. **A two-tier partner tool list.** Default: not now. Revisit when the list passes 30 tools or
   32K chars; the G2 ceiling will force that conversation.
6. **Principle 17 wording (M4).** Default: "Every Mem write Ducter makes records…", plus a
   todo to ask Mem for orchestrator provenance on plugin captures.

## 5. Reflection: how the parallel merges drifted, and the guardrails added

What went wrong is structural, not careless:
- Each branch was right in its own scope.
- Each added text to a prompt, a switch to a session or a model call to a loop, and each looked
  small in its own diff.
- Nothing checked the sum.
- The principles say "cap every read" and "cheapest capable model", but a principle isn't
  executable. The partner eval was the only cross-cutting check, and it costs money, so it was
  skipped.
- Two private tables duplicated the registry (`CHEAP`, the brief's secret list). A literal
  switch in partner.ts survived because nobody grepped for one.

Guardrails added (all deterministic, with no model calls, run in `bun test`):
- **G1 `packages/partner/test/prompt-budget.test.ts`.** Every prompt path is rendered from
  large fixtures (a 40K-char profile, 400 rules, 60 report questions, 300 evidence items, 60
  computers, 200 tasks, 300 long exchanges). The test asserts:
  - a ceiling per part;
  - stable system-prompt bytes with no dates or times;
  - identity as the last block;
  - fixed + seed under half the re-cut point.
- **G2 `packages/partner/test/tool-budget.test.ts`.** Each role's tool list, read through the real
  MCP endpoint, is a named snapshot with a size ceiling. A new tool, or a partner tool leaking
  into tasks, fails it.
- **G3 `packages/protocol/test/harness-lint.test.ts`.** Fails on a harness flag, env or config key
  written anywhere but the registry, the adapter and four listed places, each with a reason.
- **Probe.** It checks every Claude switch Ducter sets, and a check keyed on a minified name only
  informs.

Process rules proposed alongside (for AGENTS.md, the author's call):
1. A branch that adds a prompt path, a tool, a model call or a harness switch updates G1, G2 or
   harness-facts in the same merge. The tests make this the default.
2. A persona change carries an eval run (§4.4).
3. After a day of parallel merges, re-run this audit's measurements (`DUCTER_BUDGET_PRINT=1 bun
   test packages/partner/test/prompt-budget.test.ts`, the probe).

## Follow-up: what was fixed after the merges (2026-11-10, D173)

VERIFIED by tests with no model calls; numbers from `packages/core/test/proactive-cost.test.ts`.

| # | Fix | Test that would have caught it |
|---|---|---|
| P1 | The judge runs before the morning note and, by day, only for urgent or due-today candidates, ≤ 4 runs a day; verdicts memoized by key + content hash; judge tokens charged to the candidates' sources; triage stays on `cheapModel`. A synthetic busy 24 h (144 looks) costs 8 judge calls, ≤ 4 per day. | `proactive-cost`: the busy-day ceiling, no re-judging, over-budget source; `judge-model`: triage on the cheap model, the bar on the brain |
| P2 | ≤ 10 candidates per judge call (urgent first), ≤ 5 finds per note in 有用就说 (the rest counted as 还有 N 件没说, for the partner), a fold-in renders only its new finds to the partner. | `proactive-cost`: the prompt cap, the note cap; `prompt-budget`: the finds line |
| P3 | A Go task's brief holds Ducter's words only; mail-derived fields travel as JSON in `<data>`; subjects and snippets are `redact`ed before triage. | `proactive-cost`: the fence; `prompt-budget`: the Go brief; `proactive-cascade`: a key in a mail |
| P4 | Cache reads weigh 0.1; each source pays its share; the budget is per source, never the whole mode. | `judge-model`: weighted tokens; `proactive-learn`, `proactive-cost`: per-source budget |
| P5 | The look's checkpoint moves after intake; failed triage batches retry; the 60-day back-fill resumes after a restart; said keys and old verdicts are pruned; a throwing judge falls back to code (it already did: the INFERRED failure didn't hold). | `proactive-watch`: the checkpoint; `proactive-cost`: restart, prune, throwing judge |
| L1 | The quiet-hours default is `push.ts`'s; the prompts put the date next to the data. Not done: one CJK helper (there is no shared one yet; five call sites use the same regex). | `proactive-cascade`: the date after the instructions |
| M1 | The task's memory mode reads "present in any form" (installed, review, update); Ducter's recall only where the check says absent or has nothing to say (deviation, said in D173 (6)); `<what_i_know>` capped at the render. | `mem-plugins`: present(); `prompt-budget`: the first turn with recall |
| M2 | Not measurable without a live session: `memPlugin.contextCost: "unknown"` in harness-facts; todo with its trigger. | — |
| M3 | Memory off on pi (`--no-extensions`) and DeepSeek Harness (a Ducter-owned home); Codex's separate hooks script is a todo. | runner `memory`: every agent with a plugin |
| M4 | Host, ids, off method, context cost in harness-facts `memPlugin`; `MEM_HOSTS`/`MEM_PLUGIN_IDS` derive from it; the probe checks pi's flag and Mem's host names. Principle 17's wording stays the author's (§4.6). | runner `memory`: the ids come from the registry |
| F7 | Not changed: unifying the brief's detector is a behaviour choice (§4.1). | — |

## Implications for Ducter

- The small-window strategy holds on main: a busy fresh session starts at about 34K of a 120K
  re-cut.
- The risks are in the two in-flight branches:
  - proactive's judge cadence and uncapped lists;
  - Mem-in-tasks' double context and unmeasured plugin bundle.
- Fix both before they merge. The new guardrails catch the list-cap class automatically once
  those paths render through the partner.
- Live re-verification of the new harness versions and the eval run are the owed real-model
  evidence.

**Summary.**
- Main's context discipline holds: identity, report fields, devices and the task list are now
  bounded.
- Two efficiency drifts are fixed: the judge's cheap model now comes from the registry, and
  per-harness switches live in the registry.
- Three tests now enforce prompt budgets, tool lists and where harness switches are written.
- The high-severity problems are on the unmerged proactive and Mem branches (P1, P2, M1, M2).
- Real-model evidence is owed: the eval after D157, and Claude Code 2.1.322 / pi 1.5.1 live checks.
