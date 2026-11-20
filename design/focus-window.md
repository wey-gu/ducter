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
- `summary`: at most 600 characters, **written for the person** (D349): in their language, the
  result first in one plain sentence, then at most a few short lines; ordinary spacing, numbers
  with their units; none of the task's own bookkeeping (round numbers, counters, ledger or note
  file names, ids, hashes) unless the person needs one to act; only what changed since the last
  report. Work that repeats (a watcher, a review round) and found nothing new **doesn't report**
  (D394): it re-arms its own timer and ends the turn, owing no report (the runner doesn't nudge a
  turn that ends resting on its own wait). When it does report, it says what still stands, never
  "nothing new" alone while requests wait on the person. What would reach other people (a PR
  review) is drafted to files and asked once per round, all drafts in one `needs_input` (Go posts
  them, D61 GQ10). A summary that reads as notes (two or more runs of letters
  and digits glued in turns, such as `5requests4mentions`) is sent back once, unlogged, to be
  written again; the second one goes as it is
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
intents in flight. It is **the task's own note** (D349): what it carries on from after a
compaction, never a report. The person never reads its words: the opened task shows only
**保存了进度 / Progress saved** where it saved (under the words it just said, else alone, a
run of them as one), and the On hand line never quotes it.

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
   `compactions: n`, `before`, and `after` when the agent says it: Claude Code's
   `pre_tokens`/`post_tokens`, pi's `tokensBefore`); otherwise the first reading after it is a
   `context` line with `after: true` (D288). The transcript's hairline says
   **压缩了上下文 · 152k → 31k / Context compacted · 152k → 31k**.

**The context meter (D288, research/94).** The runner logs a `context` reading
(`contextTokens`, `contextWindow`, `compactAt`) as the context moves: every 5% of the window,
across the save point, and the first after a compaction; each turn end's usage carries the
window, the compaction point and `turn` (this turn alone, the running totals' difference). The
clients read the task's Log into one meter (`protocol/context-meter.ts`, the Mac's port on the
same fixture): a ring by the task's composer (the compaction point a tick; butter once past the
save point, never red) and its card (window used, last turn, this task in all, compactions with
the last sizes, **现在压缩 / Compact now**, the agent account's limits). Compact now is the
person's `/compact`: Claude Code's own as typed; every other agent's is OAR's
`Session.compact()`, run when the turn ends if one is running. Account limits come from the agent
itself (OAR `accountUsage`, no model call), read on the home at most every 5 minutes and kept
current by what sessions say (Claude Code `rate_limit_event`, Codex `account/rateLimits/updated`).

Knobs per harness: Claude Code `CLAUDE_CODE_DISABLE_1M_CONTEXT=1`,
`CLAUDE_CODE_AUTO_COMPACT_WINDOW=200000`, `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=88.8889`
(threshold = (window − 20K) × pct = 160K); Codex `model_context_window=200000`,
`model_auto_compact_token_limit=160000`; pi and DeepSeek Harness none yet.

A handoff never depends on the old model still working. A new window is seeded from the
brief + latest checkpoint + Log on the *same* environment, and the old one becomes
`superseded`. Triggers: quota exhausted, a failure, a machine going offline, or a deliberate
switch.

**A usage limit (D297, research/101).** The runner reads a failed turn OAR classes `quota` (or a
throttle, `rate_limited`) as a limit and its reset (OAR's `resetsAt`, else the used-up window the
session said, else the agent's words). By default the task waits for the reset on a timer of its
own (D267) and carries on in the same session, resumed by id; tasks on one account share the
reset; with no reset known it tries again (10 min after a throttle, else hourly, for a day).
**Hand it to {agent} now** moves it through D282's in-task switch with its progress; the person
can choose, on that card, to hand off right away every time (`Settings.limitHandoff`). The
partner is told only when no reset is known and nobody else can take it. The partner's own turns
are read the same way (D435, `system.md` "The brain held"): the next signed-in agent answers, or
the message waits for the reset.

## Choosing a body (principle 14)

`fw_candidates(TaskSpec)` is deterministic:
- **Filter on hard constraints**: environment needs, installed and logged-in harnesses,
  machine availability, user pins.
- **Rank**: tier fit for the task kind (D372: the partner names the kind at `task_open`; errands
  go to a fast tier the table knows, every other kind to the smartest; `ai-loadout.md` "Kinds of
  work"), cache continuity, quota pace (readable for Claude via
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
- **Precedence:** window pin > the most specific rule (words over a kind; newest wins a tie) >
  Ducter's default by kind. A rule may say never (D372): that agent is filtered out for that kind
  unless the window is pinned to it. D379: a saying never saved as a rule (explicit: an agent, a
  never or always, a kind) counts as a rule below the saved ones; when it changes who does it, the
  task says so in the person's words and Ducter asks once to keep it (`ai-loadout.md`).
- **Safety net (D372):** an errand on a fast tier that fails or stalls carries on on the smartest,
  once, by itself, said on the task; only a second miss reaches the person.
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

**Switching (换谁来做 / Switch who does it).** First the agent doing it, its **模型 / Model** and
**思考深度 / Effort** (D282): a pick changes them in place. The native session reopens by its id
with them before the next turn (at once when idle, after the running turn otherwise): Claude
Code `--resume <id> --model --effort`, Codex `thread/resume` with the model; lossless, logged as
`raw.retuned {harness, model, effort}`. `/model` and `/effort` typed in the task do the same, and
so does asking the partner ("这个任务换成 6.2 sol": `task_switch`, the model matched to the agent's
own list as said, D352). The row is the agent's live list; the model a task is on is always a
chip in it, even past the row's first eight. **Under the task's composer (D354, D387)** the same two
are always in sight while the task can switch: one quiet chip, the model in its own words
(**GPT-6.1-Terra**) in ink and, where the model has levels, the effort (**低 / Low**) muted with a
small level mark. It opens one clay card kept inside the screen: the effort big, a stepped control
(a dot per level that model takes, a thumb; a tap or drag switches on release, the arrow keys once
they rest), **回到默认 / Back to default** where the model names its default, and **模型 / Model
{name} ›** turning the card to the live list. A
choice is this in-place switch, said once in a quiet line for 8 s: **下一轮起用 {model} / From
its next turn: {model}**, **下一轮起思考：{effort} / From its next turn: {effort} effort**. No
live list, or a task that can't switch: no chip. The agent itself is switched only here.
Then the list: the top three others with why and the limit each, and the ones that can't, greyed
with why. **换到 X 接着做 / Continue on X** closes the old session (kept by agent) and starts the
new agent from the brief, the last six checkpoints and the carry-over (the last report and its
questions, the person's words since, the agent's last words, what the branch holds; D282); a
waiting or finished task keeps its state and the next message (an answer, a follow-up, reopen)
starts it there, the seed and then that message. Switching back to an agent that worked on the
task resumes its own session, told what happened since. The switch is logged as
`raw.switched {from, to, model?, effort?, back?}`; a restarted runner resumes the new agent's own
earlier session when `back`, never the old agent's. Each switch of agent leaves a hidden note
for the partner; after the second switch the same way (from → to), the partner is woken once
to offer a rule: it names the kind of work in a few words and asks with Go / Hold, default
hold, and saves it with `rule_save` on Go.

**Rules as built.** Said in the conversation and saved by the partner (`rule_save`, after it
restated the rule); kept in `rules.json` in the data folder; listed on Partner as **你的规则 /
Your rules** with **删除 / Remove**. No rule editor.

**When quota runs out mid-task:**
1. Wait, if the reset is soon.
2. Otherwise switch to another model in the same harness.
3. Otherwise hand off to another harness (checkpoint above).

## How a task is shown (D74)

What the window writes is what the user reads when they open the task, in one column:
- the latest **report** is said once, at the top: a finished task's report is its outcome
  (with its evidence as a line of proof and what went out), an unfinished one's is the line
  of where it stands. Earlier reports stay in What it did as "Told {name}" lines;
- the **transcript** is a conversation with the window, turn by turn (D210, after D152): a turn
  opens with what was said to it (the brief, the user's words, the partner's) and holds its
  answer in order (`turnsOf(blocksOf(…))`, `packages/protocol/src/transcript.ts`): its own words,
  and each tool call one line between them: a sentence (the agent's own words for it, with the
  command beside them, else a verb and a short summary, the same kinds on every harness:
  `packages/protocol/src/steps.ts`; a connected service's tool keeps its service as `via`),
  thinking as its headings with how long it took, a probe that found nothing in neutral
  words. D268: every run of steps between two things said is one line (`linesOf`: a group
  with its tally, edits and commands first, then the rest by count); a failure, a subagent
  (with how long it took) and thinking stand alone; output that says nothing ("Action
  completed.") is dropped; the harness's plan (TodoWrite, update_plan) is one `plan` block
  holding its latest items; a compaction and an interruption are notes drawn as dividers, a
  retry a note kept only while it is the latest thing. An edit carries its diff, read from
  the edit tool's own input (`packages/protocol/src/editdiff.ts`, at most 60 lines); a real
  failure carries its words (`failOf`: the service's JSON message and its HTTP status, a stack
  frame never the telling line) and its output on a click (40 lines kept);
- the **runner's own lines** (D207) are said in the user's words from a key (`note.<say>`,
  `noteOf` in `transcript.ts` and its Go port): the stall (**它停下了，没交回结果 / It stopped
  without reporting back**), a computer going and coming back, a fresh session, a switch, an
  effort left out, the browser guard and fallback, and four kinds of failure under **出错 /
  Error** with the line as logged on hover; every other line the runner logs (session started,
  memory recalled, a retry, archiving, a restart) says nothing;
- a **message the user sends** (D325) carries a receipt only when it says something: **在发… /
  Sending…** or **没送到 / Didn't get through**, and for a steer what the agent did with it.
  **Idle**, Return sends it as the next turn. **While it works**, Return steers (`task_send`
  `mode: "steer"`; the placeholder **插一句，它做到下一步就会看到… / Add something; it sees it at
  its next step…**, the hint **回车：它做到下一步就会看到 · ⌥ 回车：这一轮做完再说**): the runner
  writes it into the running turn and keeps it as unread until the agent's own echo of it comes
  (OAR's `user_message`, mapped to `user_echo` by the normalizer; matched by the UUID the runner
  passed as OAR's `inputId` where the agent echoes it, else by its words, and every steer before
  it counts as read too; live per agent in the table below), then logs `{role: system, from: runner, raw: {read: [seq…]}}`.
  Under the bubble: **它做到下一步就会看到 / It'll see this at its next step** (a small working dot)
  while it works and unread, **✓ 它看到了 / Seen** on the newest one read; nothing otherwise.
  **⌥ Return or 做完再说 / After this** holds the words **at the home, never in the agent's own
  queue**: the runner keeps `held` (logged whole as `task_held` on each change; the card's
  `held`, so every window shows the same queue and a restart keeps it), and the composer shows them
  as chips above it under **这一轮做完再说 / After this turn**, in order: a click edits one in place
  (Return saves, Esc cancels), **现在就说 / Say it now** turns it into a steer (or the next turn
  once idle), **×** (**不说了 / Take back**) drops it (`task_held` frame, ops edit / drop / now; an
  id already gone is an error the client says as **这句已经发给它了**). When a turn ends completed,
  everything held goes as the next turn, each logged as the person's own words in order (after a
  Stop, a failure, a limit or a compaction it stays held); a send while idle carries what is held
  first. **An agent that can't steer** (`HarnessInfo.steer` false; by OAR 0.95.1 all four can:
  Claude Code's stream-json user message replayed with `--replay-user-messages`, Codex's
  `turn/steer` with its userMessage item, pi's SDK `steer`, DeepSeek Harness's bridge `steer`)
  has Return hold as well, and says so: **{agent} 做事时不能插话，发出的话会等这一轮做完**, the chips'
  head **{agent} 这一轮做完就会看到**, no 做完再说 and no 现在就说 while it works. The partner's and
  Ducter's own queued words still go through the agent's queue.

  The echo per agent (research/116, live 2026-11-17 unless said):

  | Agent | When the echo comes | Its id | Matched by |
  |---|---|---|---|
  | Claude Code | when the tool call already chosen before the steer ends; the next model call acts on it (VERIFIED) | the stream-json `uuid` = Ducter's `inputId` (VERIFIED) | id |
  | Codex | as Codex records the words into the turn, at the next sampling, even while a shell runs under its exec cell (VERIFIED) | the userMessage `clientId` = Ducter's `inputId` (VERIFIED) | id |
  | pi | when the tool call already chosen ends (VERIFIED) | none | words |
  | DeepSeek Harness | not run (not installed) | the bridge's message id = Ducter's `inputId` (OAR source) | id |

  **它看到了 / Seen** means the agent read the words, not that it did what they say (one Codex run
  read the steer and kept to the brief). A worker on a Ducter before the id was passed matches by
  words;
- **what Ducter itself says to the window** (D271) is never the user's words: a wake of its own
  wait opens a turn as a `wake` block (`wakeOf`, the text core's `work.ts` sends), drawn as a
  hairline with its time and the reason on hover; everything else Ducter tells it (the user's
  phone lent or back, its browser handed back, a Stop, a reopen) goes with `from: "ducter"` and
  is a `told` block (`toldOf`; older lines logged as from the user are known by their words),
  a hairline in the user's language. A wake's text leaves out what the check saw when it is a
  bare number;
- **the end line** (D271) says only what the state proves: `inTurn` (something happened since
  the last `turn_ended`) and a working card is a turn under way (what it is on, the turn's
  clock); no turn and an armed wait of its own is **等 {what} · {time} 回来** (D279), how it checks
  opened under it; otherwise nothing. Since D279 a progress report after `wait_for` leaves the
  card on Waiting (core's `rests`); the wake puts it back on Working;
- **a long session** (D320; 10,000–100,000 events) is read through its **session index** and a
  **window**. The home keeps one small row per turn (`packages/protocol/src/session.ts`: where it
  starts and ends, when, what opened it cut to 200 characters, about how tall it draws in 16 px
  steps, its compactions, switches, moves, reports and first plan), made once from the stream and
  then grown by every append (`core/src/session-index.ts`, the 64 tasks asked about last), sent
  with `task_index` when a task opens (from its last turn after a new socket) and grown live by
  each client with the same `indexAdd`. The page lays out every turn of the index; a client holds
  only `WINDOW.keep` (1,500) events around what is on screen and always the newest
  `WINDOW.tail` (200): `nextAsk` asks the next page of 300 (`task_history` `beforeSeq`, or
  `afterSeq` for a far stretch growing down), 600 events ahead of the scroll and 300 behind,
  one at a time; `keepFor` lets far ones go (two thirds of what is kept ahead of the scroll); a
  turn is built from its own events only when it is drawn and kept until they change
  (`slotsOf`), so a page or a live event builds only its own turns; a turn with nothing held is
  a blank of the index's height; a turn of more than 1,000 events is built from its newest.
  The locator draws the whole session from the index; a click on a turn far away goes there at
  once, its blank first, and it is tinted when it lands (a near one keeps D284's glide). A task
  nobody has open keeps its newest 2,000. A text over 20,000 characters (an output over 8,000)
  is cut, with **显示全部（{n} 字）/ Show all ({n} characters)** opening the whole, read from its
  event, as plain text;
- **checkpoints** are a quiet **保存了进度** where the window saved, never their words (D349;
  was D152's "said once"); a progress report stays where it was said, even the latest (only
  an outcome is said above the transcript);
- **keys** in the brief, a command or its output never leave the home: the projection hides
  them in every frame and push it sends; the Log keeps them for the task (D152);
- the diff of the worktree is a list of files; a diff shows only when the user opens a file.
