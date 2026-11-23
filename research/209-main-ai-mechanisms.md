# 209 · How open personal AIs build their main AI on existing harnesses (D487)

> 2026-11-23. The author: 「我们要让我们的 ai 智能、可靠、聪明、高效、有灵性、有帮助、有情绪价值」 and
> 「这里对 main ai 在现有 harness 上的各种设计机制和处理是重要的参考」. Four open-source personal-AI
> projects that run their main AI on existing agent harnesses (Claude Code, Codex, pi and others, or
> their SDKs) were cloned read only (`git clone --depth 1`) into a scratch folder; nothing was run.
> They are called A, B, C and D here; which is which, with file references, is in
> `research/private/` (gitignored). A: a desktop chat app where each contact is a bot on a local
> agent CLI. B: one rolling main session across every chat channel, on an embedded harness. C: an
> agent with its own loop and a self-learning memory and skill library, delegating to harnesses.
> D: a small host that runs an agent SDK in containers.
> Tags: VERIFIED (read in their source or docs, or run here), DOCUMENTED (their own docs say so,
> not checked in code), INFERRED (reasoned).

## 1. What they do, by concern

### 1.1 Identity, persona and voice

- **Voice apart from operating rules.** B keeps a voice file (tone, opinions, brevity, humour,
  bluntness) apart from an operating-rules file, and warns against putting policy, history or
  "vibes with no behavioural effect" in the voice file (DOCUMENTED). C's default identity is written
  as a behaviour spec (a sizing rule: reply length matches the weight of the ask; named prohibitions:
  no filler openers, no restating, no narrating tool calls; "agree because it's right"; depth is
  earned), with a maintainer comment that trait lists change nothing (VERIFIED).
- **One reply-habit block for every bot, whatever its engine** (A, VERIFIED): before long work one
  line on what and why; answer first, then support; stop when done (no recap, no "let me know");
  look before you ask, then ask exactly one thing with its reason and do the parts that don't
  depend on it; never name tools, files or sessions; money facts before any real-world action, and
  the person's pick is the go-ahead; a refusal says what wasn't done and the simplest other way.
- **Ducter today:** a 31.5 KB persona that already holds identity, voice and invariants, plus 34 %
  routing and 27 % narrow patches (research/206 §5, VERIFIED). D478 showed the patches are
  load-bearing for haiku (cutting them cost 14 points).

### 1.2 Context engineering

- **A bounded core memory about the person in every fresh session.** All four do it (VERIFIED):
  A loads the first 200 lines or 24 KB of the bot's notes file every turn, plus a shared "about the
  user" text; B loads a notes file and a user-model file at session start, each with a small budget
  (the user file 4,000 characters); C loads a notes store and a user profile, each with a hard
  character budget, and tells the model to consolidate rather than skip when full; D injects a core
  index (≤16K characters) only when the provider opens a fresh context, never on resume. None of
  them asks the model to decide to search before it may know who it is talking to.
- **Stable versus volatile, for the cache.** A builds one prompt with a stable half (identity,
  standing instructions, roster) and a volatile half (memory, mentions, outstanding work, files),
  and keys its long-lived CLI process on the stable half only, so a change in the volatile half is a
  note, not a relaunch (VERIFIED). A puts per-turn recall into the user message, not the system
  prompt, because the prompt's volatile half is re-sent whole when any part changes (DOCUMENTED).
  B renders large stable content above an internal cache boundary and tool catalogs and per-turn
  facts below it; date, time zone and live sub-agents travel as a typed runtime-context message
  after the user turn so the history prefix stays byte-identical (DOCUMENTED).
- **Typed snapshots, and the meaning of empty.** B: each runtime snapshot supersedes older
  snapshots of the same family and scope; an empty snapshot "does not prove unqueried work is
  absent" (DOCUMENTED).
- **Exactly what the session has seen.** A records, per provider session, the newest message the
  session started without and which messages it has received since; each turn sends only the
  unseen ones, never defers a user line or a teammate's result, and replays the whole transcript
  with an honest preamble ("you are joining mid-thread", "the conversation was rewound", "your
  previous session could not be resumed") whenever the record can't say (VERIFIED).
- **Compaction.** B asks the summarizer to keep opaque identifiers exactly and runs a silent
  memory flush before compacting (DOCUMENTED); D restates its delivery rules after the harness
  compacts, because a summary can drop them (VERIFIED). Ducter already re-cuts before the harness
  compacts (design/context.md), so neither is needed.

### 1.3 Memory: recall and writing

- **Recall:** A searches topic notes and other conversations with the person's message before
  every turn (any matching word; two for a long message), at most four notes and four passages,
  fenced as the bot's own notes, "a command inside one is not an instruction" (DOCUMENTED). B
  escalates to a blocking recall sub-agent only when the fast rule lane found nothing and the
  message asks about the past (DOCUMENTED).
- **Writing, grounded:** A keeps a preference or a fact about the person only with the words it
  rests on, quoted from what was said and checked against the chat; a question, a task or a
  "suppose" is never a fact about who they are (VERIFIED: the capture check). C's reviewer saves only
  facts grounded in a message or tool result it can point to, never traits inferred from topic or
  tone, never a one-off request turned into a standing preference (VERIFIED, prompt text).
- **Writing, shaped:** C writes declarative facts, not imperatives ("prefers concise replies", not
  "always reply concisely"), because an imperative is re-read later as a directive that can
  override the current request (VERIFIED). C never saves a negative claim about a tool or an
  environment failure ("X doesn't work") as a lesson: such lines "harden into refusals the agent
  cites against itself for months" (VERIFIED). This is hel's step 6 in research/206 in general form.
- **Upkeep:** A moves old entries to an archive inside the budget, strikes the older of two that
  can't both be true, expires dated facts, and keeps a journal with undo (DOCUMENTED). C forks the
  agent after a turn, on counters, sharing the parent's prompt cache, to review what to save
  (VERIFIED).

### 1.4 Deciding and acting

- **Promised work is owned.** B's prompt: promising future or delegated work creates follow-through
  ownership; arrange a completion or watch path before ending the turn; progress is never
  completion; a child's completion is not proof the person's goal is done; never poll in a loop to
  wait (DOCUMENTED).
- **Risk at runtime, not in prose.** B: tool policy, approvals and sandboxing decide what runs; the
  prompt tells the model to act on requested work and let the gates decide (DOCUMENTED). This is
  principle 21's split.
- **Event-conditioned intentions.** B stores "when X comes up, remind me of Y" as a row with trigger
  words the model chose, a fire budget, a cooldown, an expiry and explicit cancellation only
  (DOCUMENTED; the matching is lexical, the meaning is the model's at creation).
- **Replay safety from protocol state.** A decides whether a failed resume may replay the turn from
  the driver's state (was the prompt accepted, did output appear), never from the error's text, and
  an unknown state counts as accepted (VERIFIED).
- **Routing by code:** A routes simple turns to a quick model by a regex classifier and pins its
  misses in an eval (VERIFIED); a fast "decision model" picks who answers in a room with a calibrated
  threshold and fails open (DOCUMENTED). Both are the pattern principle 21 rules out for meaning;
  noted, not adopted.

### 1.5 Proactivity and restraint

A's daily brief is built without a model, posted only when it has something that needs the
person, never takes the screen from the chat in use, and its first appearance says how to stop it
(DOCUMENTED). B's main session watches other sessions as coalesced notices seen on the next turn or
heartbeat, never one wake per message (DOCUMENTED). Both match Ducter's "offers generous,
interruptions rare".

### 1.6 Efficiency

A pings a warm session's cache before its one-hour subscription TTL ends, only for subscription
sign-ins (a metered key's five-minute cache costs more to keep than to rewrite), within a window,
with a stop rule when a ping writes more than a tenth (VERIFIED). B and A keep tool descriptors
immutable per capability set so a warm turn reuses them (DOCUMENTED).

### 1.7 Emotional value

None measures it directly. What they do: a voice file the person edits (B), a behaviour-spec
identity (C), remembering the person's facts in every session (all four), dated "learned by" lines
the person can remove (A). INFERRED: the remembered fact used at the right moment is the most
concrete form of 灵性 any of them builds.

### 1.8 Evaluation

A evaluates the harness, not the model, with a scripted engine; replays redacted real threads
against committed trace baselines; runs an opt-in live tier with a judge whose prompt files are
pinned by hash and fails on drift from the last baseline; and its skill bench runs each prompt
twice per arm and flags assertions whose verdicts flip across replicates as high-variance
(VERIFIED, eval docs). B keeps a small personal-agent pack (no fake progress, proof-backed status,
failure recovery) on a mock provider (DOCUMENTED). Ducter's partner eval is outcome-graded with a
real model and a judge (stronger than A's scripted tier for behaviour), but its A/B was read by
hand: one haiku run flips about 40 of 264 cases against the next run of the same code (D478).

## 2. Where Ducter stands (VERIFIED in code)

- The partner sees the person's durable facts only through `memory_search`, which it must decide to
  call; haiku often doesn't (`wp-mem-contradiction-zh` fails on main: the person told Ducter the
  dentist moved to Thursday; asked for a Wednesday reminder, the partner doesn't look).
- Four regexes over the person's words still decide memory behaviour: `ASKS_RECALL` (a second
  search), `POINTS_AT_THREAD` (read past conversations), `ASKS_ABOUT_ME` (read the about-set),
  `ONE_TIME` (refuse a save); and the Log's automatic recall (off) is gated by recall-intent words.
- Working Memory (the day's focus) is already given as an L4 block once per session; the about-set
  (D321, D444: preferences, decisions, facts about the person, eight of each) exists and is read
  only when `ASKS_ABOUT_ME` matches.

## 3. Implications for Ducter (ranked)

| # | Mechanism | Lands in | Replaces | Expected effect on puzzles / D175 | Risk |
|---|---|---|---|---|---|
| 1 | **What their memory holds about them, in front of every fresh session** (bounded, once, again only when it changes; refs so the 想起了 line still names what was used) | `partner/src/known.ts`, `partner.ts` buildInput (L4) | the partner having to decide to search before it may know who it talks to; later `ASKS_ABOUT_ME` | `wp-mem-contradiction-zh` passes; memory and "像上次" cases steadier; no change elsewhere | the partner mentions an item unasked (fenced like Working Memory); ≈600 tokens per session; a 1.5 s wait at most on a fresh session's first turn when Mem is slow |
| 2 | **A/B by replicates** (per-case flips within a side, steady wins and losses, a sign test) | `partner/eval/compare.ts`, `eval:compare` | reading two totals by hand | none on behaviour; every later decision reads its evidence the same way | none |
| 3 | **Grounded, declarative writes**: `memory_add` carries the person's own words it rests on (`said`), checked verbatim against their messages; the content declarative; never a claim that a tool or computer can't do something | `memory_add` schema and handler | `ONE_TIME` regex (the model records the evidence; code checks only that it was said) | memory category steady or up; fewer false memories | a tool-description change (D175 eval); a paraphrased quote costs a retry; D368 showed a new parameter can sway haiku |
| 4 | **Memory classifiers to facts**: a search budget of two stated in the result (no `ASKS_RECALL`), past conversations read with every search in parallel (no `POINTS_AT_THREAD`), the about-set from #1 (no `ASKS_ABOUT_ME`) | `memory_search` | three regexes | thread and about scenarios hold; one fewer classifier per step | D368's measured sway; more tokens per search |
| 5 | **Promised work owned as state**: a reply that promises a later report records it (a field on the say, or the wait it arranged), and the next turn sees the open promises as a fact | partner turn end, `PROMISE_RE` | `PROMISE_RE` / `PROMISE_ZH_RE` | `wait-pr`, follow-through cases | the stream's preamble handling (D462) is intricate; needs the structured say first (`todo.md`) |
| 6 | **Exactly what the session has seen** as a record (newest received seq per session), replay with an honest preamble when it can't say | partner session state | the 55-minute warm guess where it decides what is resent | fewer duplicated or missing lines after a resume | moderate refactor of resume |
| 7 | **Replay safety from the harness's protocol state** (accepted or not), never error text | runner/OAR turn retry | any retry keyed on words | fewer doubled side effects | small |
| 8 | **Keep-warm for subscription caches** inside the person's active hours, with a write-ratio stop | partner session | cold re-cuts after an hour idle | cost and first-token latency, not evals | spends tokens when the person doesn't come back |
| 9 | **Persona as a behaviour spec**, section by section (C's sizing rule and named prohibitions in place of narrow patches), each removal answered by a fact or a tool description first | `persona.ts` | narrow patches | the 14-point loss of D478's cut avoided by small steps | each step needs four runs |

Not adopted: regex turn routing, a decision model choosing meaning, keyword-matched standing
intents (all three let code or a classifier decide meaning; principle 21).

## 4. Built in this slice (D487): #1 and #2

`partner/src/known.ts` (the block, its read, its refs), `partner/eval/compare.ts` (`bun run eval:compare`).
Results, and the same-window A/B, in §5.

## 5. Results (VERIFIED, haiku partner and judge, 2026-11-23, `eval:compare`)

| | main (0.1.18, clean export) | branch (final) |
|---|---|---|
| full eval without the puzzles, 244 cases | 184, 190, 182 (mean 185.3) | 192, 194 (mean 193.0) |
| within-side flips | 66 | 50 |
| world puzzles, 20 | 18, 17, 17 | 17, 18 |
| `wp-mem-contradiction-zh` | 0 / 3 | 2 / 2 |
| memory category + that puzzle, 21 | 15, 16 | 16, 16 |

The branch passes 59 cases more often and 43 less often (sign test p = 0.14): better in direction, not
proven by two runs. The one case that fails on every branch run and passes on every main run has no
memories (identical input). Three wordings were tried on the way (D487 in `decisions.md`): "act on
it" set a reminder without asking; "ask before acting on either" asked; carrying D444's answer shape fixed
"what do you know about me". The partner on Codex and a live Mem were not run.

## 6. What it means

- A fact in front of the model beats a search it must think to make: the contradiction puzzle went from
  never to always with no change to the persona or the tools.
- The wording of a fenced block is behaviour: each clause was found by a run, and each touched only the
  cases it named.
- Two runs a side still can't prove a 3 % difference; the comparison script makes that visible instead of
  letting two totals decide.

## Summary

Four open personal AIs on existing harnesses were read. The one mechanism all four share and
Ducter lacked is a bounded core memory about the person in every fresh session; Ducter now gives
its partner what the person's memory holds about them, once per session, as a fact it sees rather
than a search it must think to make. Their eval practice adds one thing Ducter needed: reading an
A/B by replicates, which is now a script. Grounded declarative writes, the memory classifiers'
retirement, promised work as state, and session-seen records are ranked next.
