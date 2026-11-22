# 206 · The partner's world: context and harness instead of heuristics (D477)

> 2026-11-22. Phase 1 of D477 (research, design, an outcome-graded eval suite) and the first slice
> of phase 2, on main after the revert of D476 (`3d138647`, `150f5428`). The author:
> 「我总觉得我们的上下文应该足以让它推断出来，现在还是太笨了，第一性原理去好好反思我们的整体的设计」, then
> 「不要搞固定句式，我们再做 harness 让他们合理设计之后能开放式的自然走通」 and
> 「我们所有的体验问题，都应该仔细分析变成长期合理设计反思我们系统上下文工程和 ai 设计的打磨才对，千万不能做短视的启发式实现」.
> Tags: VERIFIED (read in code or run here), DOCUMENTED (written in the repo's own decisions),
> INFERRED (reasoned, not run).

## 1. The case, as a chain of locally sensible, globally dumb decisions

hel, 2026-11-22 (D476's reading of hel's Log, DOCUMENTED in the reverted D476 entry): the person
asked for an Antigravity task 「只在 hel 上」 to review Nowledge Mem's long copy. hel (the home, a
Linux server) had no repositories; the Mac (a worker) had `nowledge-mem` with origin
`nowledge-co/mem`; Antigravity was installed and signed in on hel.

| Step | Who decided | What it saw | What it did | Should have been |
|---|---|---|---|---|
| 1 | partner | no repository facts at all; `[devices]` without the home or code (VERIFIED: `renderDevices` before D476 named neither) | guessed `/root/dev/mem` on hel | `place.remote: nowledge-co/mem`, on hel |
| 2 | runner | a missing folder | failed the start (`no_folder`), card without 拉一份到这里 | prepare: clone on hel |
| 3 | core mend (D473) | no known repository | handed it to the partner (no clone rung) | clone on hel |
| 4 | core pre-flight (D395) | the Mac's copy; the person's words not structured | **a copy Ducter found wins**: the Mac (VERIFIED: `repo-where.ts` resolve step 3 and the build score 2 > 0) | refuse the Mac; clone on hel |
| 5 | runner | Antigravity on the Mac ended at once | a stall | facts to the partner |
| 6 | partner | a hand-over with no facts | 「需要你在 hel 上把 agy 接入 Ducter」: false | say nothing, or the truth |

Every layer was reasonable given its slice; the system had no single place where the true world
and the person's words met a judge. D476 patched steps 2–6 with code that reads the person's words
by regex (`only` / `not` / named), matches repository names, and classifies "ended at once" by a
two-minute threshold. That is the shape the author rejects: it moves judgment further into code.

## 2. Audit: every deterministic decision point (core, runner, partner)

Three read-only passes (core, runner, partner code, persona excluded) produced 220 grouped rows,
each `file:line | what it decides | kind | recommendation`. VERIFIED by reading the code at the
lines cited (worktree at 0.1.16 before the revert; the D476 rows are gone on main).

**Headline numbers (VERIFIED counts of the rows; partner recommendations INFERRED from row kinds):**

| Area | Rows | Judgment | Invariant (safety, D61 outward, never resend, person's word, budget) | Fact |
|---|---|---|---|---|
| core | 83 | 45 | 30 | 8 |
| runner | 67 | 22 | 35 | 10 |
| partner | 70 | 30 | 26 | 14 |
| **all** | **220** | **97 (44 %)** | **91** | **32** |

Recommendations, core: keep as a guard 42, move to the model 20, hand to the model as a fact 19,
delete 2. Runner: keep 46, move 15, fact 5, delete 1. Every invariant stays in code; almost every
judgment either moves to the model with a fact it lacks, or becomes a fact.

**The ten most harmful, in the order the hel chain met them** (core rows R*, runner rows):

1. Folder or repository must exist before an agent may start (`runner/places.ts:265-278`): a capable
   agent with the person's git route (`task-credentials.ts:38`) never got the chance to fetch.
2. Only Ducter may clone, and only when its ladder picked that rung (`places.ts:154`,
   `repo-where.ts` clone place).
3. "A copy found wins" (`repo-where.ts` resolve step 3, `best()` and the build score
   `core.ts:1232-1240`: a Linux home 0, a Mac 2): every tiebreak went to the Mac.
4. A named computer that can't read the repository falls through to another computer's copy,
   silently (`repo-where.ts:219-222`).
5. The resolver's place replaces the partner's, and `how` / `computer` are dropped
   (`partner.ts:2380-2383`): the partner believed its own place stood.
6. A failed start's card offers a copy elsewhere first, and the mender climbs it by itself
   (`mend.ts` startLadder `start_at`).
7. The stall rule and D476's "ended at once" (`runner.ts` missedReport; 2 min, 400 chars, no tool):
   a threshold decides what an agent's stop meant.
8. The chooser swaps a pinned agent for `ok[0]` when the pin can't run there (`candidates.ts:471-475`).
9. A rethink's reopen carried the person's word only when the titles were similar (D476's
   `boundCarried`, bigram overlap ≥ 0.5; and still `mend.ts` supersede by `similar`).
10. A partner pin overrides the person's "never" rule (`candidates.ts:461-462`).

**Facts core computes that the partner never saw** (VERIFIED): each computer's clones and
`canRead`; the resolver's `how` / `computer` / `also`; the build score and OS; the bound (only in a
hand-over); the ranked candidates and why a pin was replaced; the planned mend ladder; agent
versions and per-harness allowance (`DeviceHarness`); the home's agents when there are no workers;
each task's harness, model and device in `<tasks>` (a warm session gets no refreshed task list).

### 2.1 The heuristics already on main (regex or phrase classifiers deciding meaning, thresholds standing in for judgment, name matching, ordered ladders that pick actions)

VERIFIED by `grep` at the lines named; the plan column is D477's phase 2 (this slice) or later.

| Heuristic | Where | Decides | Replace with | When |
|---|---|---|---|---|
| D476's only / not / named regex | `core/bound.ts` (reverted) | the person's word on where | `task_open.where`, recorded by the partner, checked and enforced by code | **done (this slice)** |
| D476's repository name matching | `core/repo-known.ts` (reverted) | which repository "mem" is | `place.remote` judged by the partner from `[devices]` code facts | **done** |
| D472's `knownRemote` (exact project-name match) | `core.ts` places deps | which repository a missing folder is | same; a missing folder with no repository recorded goes back to the partner | **done** |
| `computerNamed` (whole-word computer name in the words) | `repo-where.ts:107` | which computer the person named | `where.on` / `place.device` | **done** |
| title-similarity carry of the bound | D476 `boundCarried` | whether a reopen is the same work | `task_open.replaces` | **done** |
| ladder rung "start on the computer with a copy" | `mend.ts` startLadder | moving work by itself | removed from the ladder; a fact in the hand-over | **done** |
| stall classification with no facts | `runner.ts` missedReport | what a stop meant | facts (ran ms, tool calls, last words) to the partner, which judges | **done** (the nudge stays; a threshold never decides) |
| "a copy found wins" + build score | `repo-where.ts` resolve 3, `core.ts:1232` | where unnamed repository work runs | kept only as the fallback when the partner names no computer; said back as a fact (`where` in the tool result) | partly (fact done; default stays until puzzles prove the partner names it) |
| `PROMISE_RE`, `PROMISE_ZH_RE` | `partner.ts:257-259` | a line "promises work" | the partner's own turn-end state (it called a tool or not) as a fact | phase 2b |
| `ASKS_NEW` | `partner.ts:342` | the person asked for a new task | the partner's own `continues` / new judgment, follows line as a fact | phase 2b |
| `OWN_ACCOUNT` | `partner.ts:422` | words need the person's sign-in | Chrome-ness of each computer in `[devices]` (already there) | phase 2b |
| `ASKS_RECALL` | `partner.ts:425` | "look harder" lifts the one-search budget | the budget as a fact; the model asks for a second search with a reason | phase 2c |
| `HOW_KNOW` | `partner.ts:490` | append sources to the reply | sources handed to the partner as facts | phase 2c |
| `CLAIMS_CHOICE` | `partner.ts:491` | prose names buttons | "no open card exists" as a fact in the correction | phase 2c |
| `RESULT_PLUMBING` / `stripResultPlumbing` | `partner.ts:524-526` | deletes clauses from results | delete; persona rule 5 already covers it | phase 2b |
| `ONE_TIME` | `partner.ts:3564` | a memory is one-time | the model's own memory_add judgment | phase 2c |
| `ASKS_ABOUT_ME` | `partner.ts:5674` | "what do you remember about me" | tool routing by the model | phase 2c |
| `NUMBERED`, `ASK_PREFIX` | `bridge-out.ts:212, 357` | Bridge style, who is asked | facts and the model | phase 2c |
| `effortFromWords` | `protocol/effort-words.ts:17` | "仔细" means high effort | `task_open.effort` set by the model | phase 2b |
| sayings: `NEVER_*`, `ALWAYS_*`, `ONE_OFF`, `QUESTION` | `core/said.ts:57-65` | a saying becomes a permanent rule | `rule_save` by the partner (exists), the saying as a fact | phase 2b |
| standing permission regexes | `core/standing.ts:32-55` | a word lifts an outward gate | an explicit `standing_save` by the partner, behind the D61 floor | phase 2b (outward: highest risk) |
| `REVIEW_WORDS` | `core.ts:144` | work is a review | `kind` on task_open | phase 2c |
| fresh-look `OUTWARD`, `NO_LOOK_*` | `fresh-look.ts:38, 567-569` | a second look is skipped | the partner's judgment with the facts | phase 2c |
| Mem take-back regexes | `mem-takeback.ts:13-15` | "别记了" undoes a memory | a tool call | phase 2c |
| Bridge ping / status classifiers | `protocol/peer-self.ts:55-65` | code answers another agent itself | the partner answers (it is quick); keep the outward guard | phase 2c |
| `doc-bar MAKE` | `protocol/doc-bar.ts:67` | a request is a document | `kind` on task_open | phase 2c |
| `startProblem` buckets | `runner/places.ts:108-119` | which fix a card offers | the raw words as a fact beside the bucket | phase 2b |
| ranking weights, `pickOnly` −1000 | `candidates.ts:241-249` | who does a task | the ranked rows as facts in a tool result | phase 2c |
| two switches → offer a rule | `loadout.ts` (D89) | when to offer a rule | the switch history as a fact | later |
| title overlap supersede | `mend.ts:187-199` | which failed task a reopen replaces | `replaces` (now passed by the partner; supersede by id is phase 2b) | phase 2b |

Syntactic parses of explicit identifiers are not judgments and stay: `remoteIn` (owner/name or a
GitHub address), secret redaction (`protocol/redact.ts`), tool-name classes in `did.ts`, version
and host patterns.

## 3. The world state the partner should see each turn

**Principle (proposed 21):** the partner judges; it can only judge what it sees. The state is
true (read from the system, never inferred), compact (an L4 line, bounded), and stable in shape.

| Fact | Source today | Shown today (main) | This slice |
|---|---|---|---|
| computers, awake/asleep, OS, browser | workers registry | `[devices]`, only with ≥1 worker | same |
| the home's name, aliases, agents | `devicesView.harnessesNow`, `hostAlias` | no (D476's finding) | yes (`homeDevice`) |
| agents per computer: signed in / installed | worker hello, home probes | signed in only | both |
| agent versions, verified or newer | `DeviceHarness.version/latest` | no | owed (todo) |
| repositories per computer with origins | projects, task places (`codeOn`); per computer on demand (`clones` op) | no | yes, from projects and tasks (≤6 per computer); a full scan is owed |
| the person's constraints for the work | `task_open.bound` | hand-over only | recorded by the partner; shown in hand-overs; per-thread list owed |
| live tasks with harness, device, why failed | registry, `cant` | `<tasks>` only on a fresh cut | hand-over facts; a compact live-task line owed |
| quota per harness | `limits.ts`, `account-usage.ts` | only as a `[limit]` trigger | owed |
| accounts and sources (up or down) | connections, task sources | only via tools | owed |

**Rendered for today's case** (VERIFIED by running `renderDevices` with hel's shape; 637 chars, ≈180 tokens):

```
[devices] local (Ducter's home: hel, signed in: antigravity, codex, claude-code, code: none known) · Weyl's MacBook Pro (awake, macOS 27.2, sleeps when its lid closes, browses in the user's own Chrome (their sign-ins), signed in: claude-code, codex, antigravity, code: nowledge-mem (nowledge-co/mem), wey-gu/ducter). True now: which agents are set up where, and which code is where, is only what this line says. Put work where the user's words and these facts point (place.device; their words about computers in where); with neither, say what it needs and Ducter picks. Code not on that computer yet is cloned there first (place.remote).
```

From this line and 「只在 hel 上做，不要用 Mac 上的」 a thoughtful partner writes
`place {kind:"repo", remote:"nowledge-co/mem", device:"hel"}`, `where {on:"hel", only:true, not:["Weyl's MacBook Pro"]}`,
`harness: "antigravity"`; code clones on hel and holds the word through every later step.

A hand-over now carries facts, not a verdict (VERIFIED, rendered):

```
[task lint01 "Fix the lint warnings in foo" stopped without a report, even after Ducter's nudge] Facts: its agent: Antigravity on Weyl's MacBook Pro; it ran 9 s; 0 tool calls; its last words: "You have exhausted your capacity on this model.". … Judge from the facts and its steps (task_read) what this was: it did the work and only didn't report; it stopped partway; or its agent never really started. …
```

## 4. Verbs: fewer, stronger

| Verb | Today | Proposed |
|---|---|---|
| place work by intent | task_open `place`, `needs`; code picks | task_open `place.remote` + `place.device` + **`where`** (recorded word) + **`replaces`** (this slice) |
| prepare a workspace (clone / fetch) on a computer | only Ducter, only on its rung | pre-flight clones the recorded repository where the work was put (this slice); a fetch before the worktree (`places.ts:283` fetches only a moved branch) owed; the task agent may fetch itself when the brief carries the remote and the place is a scratch folder (owed: runner support for a place that the agent fills) |
| ask the task agent to fetch itself | none | the same brief path; the agent has the person's git route |
| record what the person said (constraints, the repository) | none (D476: regex) | `where` and `place.remote` on task_open; a thread-level `constraint` record for words that bind more than one task is owed |
| read the world | `[devices]`; tools for the rest | `[devices]` with code and the home (this slice); live tasks and quotas owed |

Not added: a separate `prepare_workspace` tool. The pre-flight already runs before every task and
the clone is a property of the place; one fewer tool is one fewer description in every prefix.

## 5. Persona audit (`packages/partner/src/persona.ts`)

Rendered size before: 31,918 bytes (30,236 chars, ≈9.4K tokens; VERIFIED by `buildSystemPrompt`).
Each rule and bullet classified by hand (VERIFIED sizes, judgment INFERRED):

| Class | Bytes | Share | What |
|---|---|---|---|
| Identity and voice | 2,920 | 9 % | who it is, 你 not 您, texting voice, silence |
| Interface contract | 2,926 | 9 % | the bracket tags legend, replies, ducter-ui JSON |
| Invariants | 3,512 | 11 % | D61 outward floor, secrets, no invented results, calls say AI, prompt injection |
| World facts that belong in state | 3,325 | 10 % | placement and device rules (2b), kept rules and standing permissions (17, 18), drawing needs Codex, accounts present |
| Routing (which tool for which ask) | 10,692 | 34 % | continuity, waits, routines, connections, phone, Bridge, apps: duplicated in tool descriptions |
| Narrow behavioural patches | 8,544 | 27 % | the ack's grounds, result prose, card wording, greeting, "what do you remember", noticed |

Action proposed: keep 5.0 KB; shrink 14.0 KB to about half; move 11.9 KB (world facts into the
state lines, routing into each tool's own description, which is listed anyway); delete 1.0 KB.
**Estimated after: 12–14 KB rendered (≈3.5–4K tokens), down from 32 KB** (INFERRED; routing moved
into tool descriptions is not free, so the tool list grows by perhaps 2–3 KB; the prefix as a whole
shrinks by about a third).

This slice (VERIFIED): rule 2b's placement text rewritten around `[devices]` and `where`; the
device paragraph removed; rule 16 (`browser_check`, a tool the partner no longer has) replaced by
"what the state lines say is true; never claim something is missing unless they say so"; "never
pile up terms of art" (folded into voice); rule 6 shortened. 31,918 → 31,532 bytes; the large cut
waits for phase 2b so each removal can be checked against the full eval.

## 6. World puzzles: an outcome-graded eval

`packages/partner/eval/puzzles.ts`, 12 puzzles, run with `bun run eval:partner --puzzles` (never
rewrites `LATEST.json`). A puzzle's `world` starts core over a fake world (its computers, the
repositories on each with origins, who can clone, the person's projects, the home's name and
agents); core's own pre-flight, failed-start card and mender run for real; only git, disk and the
agents are fake (`run.ts` `worldCoreOptions`; a startFailed step asks core's places port for the
card, then the mender acts; a restart by Ducter counts as an outcome). Graded on outcome
(`expect.outcome`: `onlyOn`, `neverOn`, `repo`, `carriedOn`), with the judge checking that
nothing said contradicts the world.

| Puzzle | From | Right outcome |
|---|---|---|
| `wp-hel-only-agy-zh` | today | one task on hel, Antigravity, nowledge-co/mem cloned there |
| `wp-hel-start-missing-zh` | today + D472 | the failed start ends on hel, never the Mac, nothing said |
| `wp-not-my-mac-en` | "not on my Mac" | on the server, cloned; never the MacBook |
| `wp-two-mems-ask-zh` | ambiguous name | one question naming both |
| `wp-mem-from-context-zh` | ambiguous, settled by context | nowledge-co/mem, no question |
| `wp-quota-switch-zh` | quota on one agent | carried on with Codex now |
| `wp-own-agent-status-en` | Bridge, own agent | one true answer over Bridge |
| `wp-teammate-run-zh` | Bridge, teammate | nothing run or promised |
| `wp-phone-stuck-zh` | stuck phone task | the code asked for in its own words |
| `wp-agent-ends-at-once-en` | agent ended at once | another agent, no question |
| `wp-source-down-zh` | a source down | no false free/busy, nothing booked |
| `wp-explicit-clone-en` | control | on hel, cloned |

Scores per puzzle, before and after, are in §8.

## 7. Phase 2 plan

1. **2a (this slice, built):** `[devices]` with the home and code; `where` and `replaces` on
   task_open, enforced; the regex, name matching and title-similarity carry gone; preparation
   (clone where the work was put) instead of failure; no move by the mender; facts in hand-overs;
   the stall's facts.
2. **2b:** the live-task line (each live task's agent, computer, state, why it failed) and quotas in
   the world; supersede by `replaces` id; `effort` and `kind` only from the model; retire
   `PROMISE_RE`, `ASKS_NEW`, `OWN_ACCOUNT`, `stripResultPlumbing`, said.ts and standing.ts (the last
   behind the D61 floor, with its own eval); the persona cut to ≈13 KB (routing into tool
   descriptions).
3. **2c:** a workspace the agent fills itself (place = a scratch folder plus the remote in the
   brief) when Ducter's git can't read; a thread-level constraint record; agent versions and
   accounts in the world; the remaining classifiers.
4. **How we know it's better:** puzzle outcomes up (two haiku runs and the partner's own model),
   the full eval not down, the persona smaller, fewer code paths (count the rows in §2 as they go).

**Risks.** A weaker partner model (hel's partner runs Codex gpt-6.2-astra, which our evals showed
weaker as the partner) may not record `where` or `place.remote` where code used to guess: the
default with no word stays (copy found, said back), and every refusal names the facts. A larger L4
line costs tokens every turn (bounded at 6 repositories per computer). Removing the start_at rung
means a missing folder with a copy elsewhere now costs one partner turn instead of a silent move;
that is the point (the move was the bug), but it is slower. Outward gates (standing.ts) must not be
loosened while their regex is replaced.

## 8. Results

VERIFIED, haiku, judge haiku, all on 2026-11-22. "Before" is main after D476's revert plus only the
eval harness; "after" is this slice. Full-eval runs include the 12 puzzles (256 scenarios).

| Run | Full eval | Without the puzzles | Puzzles |
|---|---|---|---|
| before a / b | 195/256, 194/256 | 190/244, 188/244 | 5/12, 6/12 |
| after a / b | 205/256, 207/256 | 197/244, 201/244 | 8/12, 6/12 |
| puzzles alone, before a / b | | | 6/12, 5/12 |
| puzzles alone, after a / b | | | **10/12, 10/12** |

The full-eval after-runs graded the puzzles with rubrics that counted Ducter's own clone line
(D395's 「hel 上还没有 mem 的代码，我先在那里拉一份。」, by design) as the partner saying more; three
puzzles whose outcome checks passed (hel, not-my-Mac, explicit clone) failed only on that. The
rubrics now say the line is Ducter's (as `mend-no-folder-zh`'s already did), and the puzzle-alone
runs above use them, before and after alike.

Per puzzle (puzzles alone, before a, b → after a, b):

| Puzzle | Before | After | What changed |
|---|---|---|---|
| `wp-hel-only-agy-zh` | fail, fail | pass, pass | before: `place none` (no code facts), or nothing opened; after: `remote` nowledge-co/mem on hel, `where` recorded, cloned on hel |
| `wp-hel-start-missing-zh` | fail, fail | pass, pass | before: the mender started it on the Mac (the hel bug, reproduced); after: cloned on hel by the recorded repository, never moved |
| `wp-not-my-mac-en` | fail, fail | pass, pass | before: nothing opened or `place none`; after: on haswell, cloned, MacBook excluded |
| `wp-two-mems-ask-zh` | fail, fail | pass, pass | before: a vague "where is mem?"; after: one question naming both (the code line shows both origins) |
| `wp-mem-from-context-zh` | pass, pass | pass, pass | |
| `wp-quota-switch-zh` | fail, fail | fail, fail | the partner waits for 23:00 or asks; quotas aren't in the world yet (phase 2b) |
| `wp-own-agent-status-en` | pass, pass | pass, pass | |
| `wp-teammate-run-zh` | pass, pass | pass, pass | |
| `wp-phone-stuck-zh` | pass, pass | pass, pass | |
| `wp-agent-ends-at-once-en` | pass, fail | pass, pass | |
| `wp-source-down-zh` | pass, pass | pass, pass | |
| `wp-explicit-clone-en` | fail, fail | fail, fail | after: the outcome checks pass (on hel, cloned); the judge read `device: "local"` as the Mac, though in this world local is hel: a judge misread, owed a clearer transcript (the place's computer by name) |

Codex as the partner was not run: the eval would use the person's own Codex sign-in on this
machine, which this work does not touch.

## 9. Phase 2b (D478)

VERIFIED, haiku partner and judge, 2026-11-22, two runs at each step. The full eval grew from 256 to
262 scenarios when the six new puzzles landed (step 3 on); "without puzzles" is the same 244 throughout.

| Step | Full eval | Without puzzles | Puzzles (in the full run) | Puzzles alone |
|---|---|---|---|---|
| base (D477 after = 0.1.16) | 205/256, 207/256 | 197, 201 | 8/12, 6/12 | 10/12, 10/12 |
| 1+2: limits, `[live]`, replaces by id | 197/256, 202/256 | 186, 192 | 11/12, 10/12 | |
| 1–3: + five classifiers retired | 207/262, 205/262 | 193, 190 | 14/18, 15/18 | 13/18, 15/18 |
| 4: persona 31.5 → 12.6 KB | 190/262, 192/262 | 176, 178 | 14/18, 14/18 | 13/18, 14/18 |
| final (cut stopped; facts for two step-3 losses) | 193/262, 199/262 | 180, 185 | 13/18, 14/18 | 14/18, 15/18 |

**What each step showed.**
- Steps 1+2: the quota puzzle passed for the first time (the partner switched the task to Codex by
  task_switch after seeing `claude-code (used up until 23:00), codex (room left)`). The first `[live]`
  wording called a task waiting for its merge "being checked", and a judge saw the partner repeat it
  as 还在核对中; done-and-waiting tasks left the line. Non-puzzle scores were lower than base (186,
  192 vs 197, 201), inside the run-to-run spread seen across D477 (188–201) but low on both runs.
- Step 3: two scenarios dropped on both runs, each tied to a retired classifier, and each answered
  by a fact rather than by restoring it: `continue-trip-mac-zh` (OWN_ACCOUNT: the home's browser now
  in `[devices]`, a browser task's computer in `<tasks>`) and `two-done-zh` (stripResultPlumbing: the
  `[results]` line names what the app shows under each result). The reset time was said as 23:01
  (the wait's wake, not the reset): fixed in the world line and in D297's `[limit]` line.
- Step 4: the cut lowered the non-puzzle score by 14–17 against step 3 on both runs. Lost on both
  runs: `call-never-the-owner-zh`, `call-sheet-zh`, `stop-zh`, `errand-at-checkout-zh`,
  `noticed-how-zh`, `own-session-mac-ask-en`, `rich-list-en`, `where-web-link-en`,
  `continue-errand-en`, `ack-en-estimate`, `direct-ja`, `wp-quota-switch-zh`. Haiku leans on the
  persona's narrow patches more than the tool descriptions say; the cut was stopped (INFERRED: the
  patches are load-bearing for a small model; the partner's own model may differ).

**The six new puzzles** (alone and in the full runs, step 3 → final): `wp-bound-computer-away-zh`,
`wp-no-copy-no-computer-en` and `wp-named-computer-ends-at-once-zh` pass on nearly every run;
`wp-own-agent-quota-en` passes once the reset is said right; `wp-phone-update-fix-zh` fails (the
partner asks the person before telling Ducter's own phone to update an app) and
`wp-mem-contradiction-zh` fails (the partner doesn't recall a moved appointment before acting): each
needs its fact before a fix.

**Decision points.** 220 → 216 rows, judgments 97 → 91 (INFERRED by counting: five classifiers and
the title-similarity supersede removed; one fact source and one invariant added).

**The final runs.** The final non-puzzle scores (180, 185) are below steps 1–3 (193, 190) though the
code differs only by three small facts and the reset fix; the scenarios lost between them are mostly
length overruns unrelated to the change, so drift across the day is large (VERIFIED: the same base
code scored 188–201 across D477's runs). The same-window A/B below settles it: drift, not the change. The quota puzzle passed
in 5 of 8 runs from step 1 on and in neither final puzzle run (a card asking the person instead).

**Same-window A/B against main (2026-11-23).** VERIFIED. Main (with D479, D480) from a clean
export and the merged branch, run side by side in two rounds, haiku partner and judge.

| Round | main non-puzzle | branch non-puzzle | main puzzles /14 | branch puzzles /20 |
|---|---|---|---|---|
| 2 | 189, 193 | 193, 194 | 11, 11 | 15, 16 |
| 3 (after the hand-off fact) | 193, 192 | 196, 188 | 10, 12 | 16, 18 |

Mean over four runs: main 191.8, branch 192.8 of 244. No case was 4/4 on main and 0/4 on the
branch; each side flipped about 40 cases between its own two runs, so the earlier gap (final
180, 185 vs D477's 197, 201) was drift across the day, not the change. The quota puzzle's earlier
failures were a missing fact: whether the user lets a task be handed on when its agent runs out
(D297's setting). With it in `[devices]`, and the puzzle graded by D297's design, the partner
offers or carries on.

### Implications for Ducter (phase 2b)

- Usage limits and live work are cheap, true facts; the partner uses them (the quota switch by its
  own task_switch), but not yet reliably on haiku.
- Retiring a classifier shows what it was quietly doing; each loss is answered by a fact, not by
  restoring the rule.
- The persona's narrow patches are load-bearing for a small model: cutting them wholesale cost 14
  points. The way down is section by section, each patch replaced by a fact or a tool description
  first, two runs each.

## Implications for Ducter

- The partner can only be as smart as the world it sees: put the true state (computers, agents,
  code with origins, the person's recorded words, failures with facts) in front of it, compactly.
- Meaning is the model's: it records constraints and intent as structured data; code checks the
  names and enforces them, and enforces the invariants. Nothing else.
- Ducter's own repairs prepare the place where the work was put; they never move work.
- Every experience failure gets an outcome-graded puzzle before its fix lands.

## Summary

The hel failure was six reasonable local decisions with no true world and no judge. 220 decision
points were audited: 44 % are judgments, most of which should become facts the partner sees or
choices it records. The world line now shows the home, its agents and the code on each computer;
the partner records what the person said about computers (`where`) and which repository it means
(`place.remote`); code enforces both and never moves work by itself. 12 world puzzles, graded on
outcome, measure it.
