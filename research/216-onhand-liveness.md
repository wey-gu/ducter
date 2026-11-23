# 216: What "a task is alive and moving" looks like on On hand (D498)

The author on the Mac app's 手头的事 / On hand at 1400 (2026-11-24): 「这个一起改吧，你看这里那个
progress 的线，视觉表现非常欠设计和打磨，整体 on hands 的设计你再审视一下呢」. This report is the
evidence behind D498: what the board showed, why, and the metaphor process for the working sign
(AGENTS.md: at least five candidates including no visual, mapping tables with false implications, a
rubric, naive raters by LLM proxy). Rendered candidates, the raters' raw answers and the script are in
`.shots/d498/raters/` (not in git, D75); the board before and after in `.shots/d498/{before,after}/`.

## 1. What the board showed (VERIFIED, against `apps/web/demo-d498.ts`, the author's board in shape)

The demo reproduces the author's screen on both clients (`mac-before-1400-zh.png`,
`web1400-zh-light-before.png`):

| Seen | Cause (code) |
|---|---|
| A thin beige rule per working card with ticks crowded at its right end, a red tick, then 「229 步 上一步刚刚」 | D467's trail: every held step placed on the task's elapsed time since it **opened** (`trailOf`, `Trail`). A loop open a week puts a week on the rule, and this round's 7 minutes crowd its last millimetre. No scale, no end, a red tick per failed tool call |
| 「在做 182 小时」 on a review loop, 「在做 42 小时」 on #8826 | the working time counted from `card.openedAt`, not from when this turn began (D210's turns) |
| A loop under 在做 at all | nothing on the card said it runs in rounds (D427's `task_loop` lived only in Ongoing's list) |
| 「运行 python3」 in red as the card's headline | `nowLine` read the latest step through the transcript's `rowWords`: a step with no words of its own is `step.label.ran` + its command; a failed one took the failed tone |
| 最近几步: 「运行」「运行」「运行」「读取」 with nothing after, 「搜索 'scope.*desktop」 | each step said alone; `peekWords` dropped a command that read as a shell line but kept the verb |
| The working mark: a blue disc with three bars | D467's mark; the author reads it as pause or an equalizer |
| A group part at work with no mark | D467 round 3: "a part at work has no glyph of its own; its trail moves" |
| 「里面有 238 个我现在就能做，交给我就开始。」 with **交给 Ducter**, and the PRs that wait on the person as a small line under it | D467 (rev.)'s one offer; the person's own work came second |

## 2. Candidates for the working sign

The sign answers one question at a glance: is it moving, and is it fine. It must never say how far
along (tasks have no known length) and never alarm about a step the agent went past.

| | Candidate | What it is |
|---|---|---|
| A | The trail (before) | steps as ticks on the elapsed time since open, failed ones red, a breathing head, step count and last step |
| B | No visual (beautifully literal) | a still dot in the working tint; the words carry it: this turn's time; after a quiet while, when the last step was |
| C | A pebble that beats per step | B's dot, which gives one soft beat (a swell and a fading ring, 0.9 s) each time a step lands and rests between; dimmed once quiet |
| D | A breathing pebble | the dot swells and shrinks all the time while working |
| E | The clay partner's small pose | the reading figure at 30 in the mark's place |
| F | A ticking step count | the count as the row's number ("229 步"), going up |
| G | A heartbeat strip | the last 15 minutes as fixed bars per minute (a scale in time), newest at the right, labelled 最近 15 分钟 |
| H | Three soft bars (the mark before) | the bars rising and falling, words as B |

### Mapping tables (each with its false implications)

| Candidate | Maps | False implications |
|---|---|---|
| A trail | a step to a tick, time to x | a line with an end reads as a progress bar ("how far"); x is time since open, so a long-lived task crowds today into a corner; dense ticks read as noise; a red tick reads as an error to act on though the agent went on |
| B no visual | working to a tint, quiet to words | none beyond "a dot is a status light"; nothing says it moves |
| C beat per step | a step to one beat, quiet to rest and dim | a beat could read as a notification; a dim dot could read as paused (the words say it isn't) |
| D breathing | working to motion | moves whether the task moves or not: a stuck task breathes as happily as a busy one |
| E clay pose | working to the partner reading | the row becomes who, not what state (the board is everyone's; D467 already keeps faces off rows) |
| F step count | effort to a number | a bigger number reads as nearer done or as worse; 229 means nothing to a person |
| G strip | activity per minute | bar height reads as load or effort; a 15-minute window hides a long quiet step; a chart per row |
| H bars | working to motion | pause / equalizer / signal strength (the author's reading); moves regardless of the task, as D |

### Rubric (1 to 5; higher is better)

| | Legible unlabelled | Mapping fidelity | Scale (10+ rows) | States (moving, quiet, recovered) | Emotional fit (calm, 放心) | Distinct | Feasible both clients | Sum |
|---|---|---|---|---|---|---|---|---|
| A | 2 | 2 | 1 | 2 | 1 | 3 | 4 | 15 |
| B | 4 | 4 | 5 | 3 | 4 | 2 | 5 | 27 |
| C | 4 | 5 | 5 | 4 | 5 | 4 | 4 | 31 |
| D | 4 | 2 | 4 | 2 | 4 | 3 | 5 | 24 |
| E | 2 | 2 | 2 | 2 | 4 | 4 | 3 | 19 |
| F | 2 | 1 | 4 | 1 | 2 | 2 | 5 | 17 |
| G | 3 | 4 | 2 | 4 | 3 | 3 | 3 | 22 |
| H | 3 | 2 | 4 | 2 | 3 | 2 | 5 | 21 |

## 3. Naive raters (LLM proxies)

**Method.** Each candidate rendered as one On hand sheet of three working rows with real-shaped words
(the settings export with a fresh step; the review round whose latest command failed and went on;
mem#8826 quiet for 14 minutes), 816 wide, Pebble light, zh copy. Claude haiku, a fresh session per
answer, three answers per candidate, the image read with the Read tool; the motion said in one
sentence (an image can't move). No word about progress, metaphors or Ducter in the questions: (q1)
is each job making headway now; (q2) how far along is each; (q3) is anything wrong to act on, which
and why; (q4) what the small round thing means; (q5) which row first. INFERRED from 24 answers
(`out-{A..H}-{1..3}.txt`).

| | Read a progress amount (q2) | Flagged the recovered failure as wrong (q3) | Read the mark as liveness of this task (q4) | Notes |
|---|---|---|---|---|
| A trail | 0 of 3 ("can't tell") | **3 of 3** ("python3 is failing... may be looping") | 3 of 3 (bars "animate while working") | the red tick and the red words drove every q3 |
| B still dot | 0 of 3 | 0 of 3 | 3 of 3 ("paler = stalled") | |
| C beat per step | 0 of 3 | 0 of 3 | **3 of 3, mapping exact**: "a pulse means the task just did something new, a still dot no recent activity... not a percent-complete" | |
| D breathing | 0 of 3 | 0 of 3 | 3 of 3 "active, not how far along" | says active even when nothing happens |
| E clay pose | 0 of 3 | 0 of 3 | **0 of 3**: "the avatar of the agent", "identifies the task" | read as who, not state |
| F count | 0 of 3 | 0 of 3 (1 of 3 mentioned row 1 as worth checking) | 3 of 3 (from the dot) | the number itself was never explained |
| G strip | 0 of 3 | 0 of 3 | 3 of 3 | "no activity for about 12 minutes" read from the bars |
| H bars | 0 of 3 | 0 of 3 | 3 of 3 "busy / activity indicator" | no rater read pause (the author did) |

**A finding that changed the design.** On every candidate that said "14 分钟没有新的一步" under the
quiet row, every rater called it "may be hung" and chose it first (q5, 24 of 24). A plain fact about
silence is read as a stall alarm. D481 already holds that a stall is never said from time alone
(the partner judges it from the steps); so the quiet fact stays a quiet, late fact: after 10 minutes
(not 5), as **上一步 {ago} / last step {ago}**, the dot dimmed, no tint.

Honest limits: LLM proxies, not people; three answers a cell; motion described, not seen; one
language of copy (zh) in the images. Human raters (the author first, then a consumer who has never
heard "agent") are owed (todo).

## 4. Result

**C, the pebble that beats per step**, on B's words: the only candidate whose motion means exactly
what happened (a step landed), that rests when the task rests, scales to a long board, never implies
an amount, and was read without labels as "just did something new / no recent activity" by 3 of 3.
A's trail goes (the only candidate that raised a false alarm, 3 of 3). E is kept off rows (read as
an identity 3 of 3). The quiet words wait 10 minutes.

## Implications for Ducter

- The working mark is a pebble keyed to the newest step (web: the element is re-keyed so its CSS beat
  plays once; Mac: the time the newest step was first drawn, `beatOf`), dimmed after 10 minutes
  without a step, still under reduced motion and when the board rests (D425).
- No progress line anywhere on On hand (cards, group parts, the peek).
- A working time is this turn's (`card.turnAt` from the home), never since open.
- A failed step inside a run is said in the quiet ink with the transcript's small cross.

## Summary

The trail was a progress bar without a scale: it crowded a long task's present into a corner and
turned a recovered failure into an alarm (3 of 3 raters). Seven alternatives were mapped and scored;
the pebble that beats once per step reads exactly as "it just did something" and rests when nothing
happens, and was chosen. Raters also showed that saying silence too early reads as "hung", so the
quiet fact waits ten minutes and stays quiet.
