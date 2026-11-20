# 176. Alive while working: seven ways to show the partner at work

*2026-11-20. For D425. What Ducter shows while the partner or a task works, inventoried on both
clients from a demo core (never the real home), seven candidates for making that moment feel
alive, including the beautifully literal one, each with a mapping table and its false
implications, a rubric, and naive raters. The raters are LLM proxies (Claude Haiku, `claude -p
--model haiku --no-session-persistence --tools ""`, one candidate per call, a persona per call,
zh and en asked separately): 3 personas × 2 languages × 7 candidates, then the refined winner
again (6 more). They read a description, not the motion itself. No human raters yet. Raw answers
are in the session scratchpad (`alive/raters/out*.json`), not in git. Shots and clips are in
`.shots/alive/` (D75).*

## The moment

The person has asked something and waits, seconds to a minute, or a task works for minutes while
they glance at it. The author, pointing at a chat app's waiting line (the assistant's small round
face, animated, and a short grey present-tense phrase under the last bubble, changing as the work
moves): 「我觉得运行中，我们那个在干嘛的状态更新+小动画是很可爱的，我们能有类似的巧思和更好的质感的设计么？（那个 icon 是动的）」.

| Persona | Before (what they feel waiting) | After (what Ducter should give) |
|---|---|---|
| Heavy developer | knows a turn is a handful of tool calls; reads "在查…" as a spinner that hides which task it means | the step and its object in one glance ("在看「修 CI」做到哪了"), never a tool name |
| Consumer (personal-AI user) | a small figure and grey words: is it doing anything, or stuck? | 放心: it is at it, here is what, and it says so plainly when it takes long |
| Fresh user | no concept of steps or tasks | a little character visibly busy, words that need nothing explained |

First time: nothing to learn. It appears the moment they send (0 ms, the client's own state) and
goes when the reply lands.

## What we showed (inventory, `.shots/alive/before-*`)

Shot from `apps/web/demo-alive.ts` (an ITIN errand: the ask, the ack, a task at work, then
"ITIN 那件查得怎么样了？") at each step, web 390 and 1400, Mac 1280 (the test renderer connected
to the same demo, `alive_shots_test.go`), zh and en, light and dark.

| Where | What it showed | What was wrong |
|---|---|---|
| Conversation, partner thinking (web) | the clay partner (32, the reading pose, never blinking: `still`) rocking 1.4 s on a wrapper, one muted line 在想… / 在查… | one pose for every step; the rock was the only motion, the same for thinking and searching; words generic (在看做到哪了… without which task) |
| Conversation (Mac) | the same line; the partner only breathing | no loop at all on the Mac: the two clients differed |
| A step change | the words swapped in one frame | a 300-ms step flashed (在想… → 在翻… → 在看… in under a second) |
| Past 15 s / 45 s | a second line joined under it | right, kept |
| The reply | the line went, the reply's row glided up | right, kept |
| On hand card, a task at work | the agent's coin rocking, its latest words in two lines, three working bars and 在做 12 分钟 | the words changed in one frame; nothing rested when the person was away |
| Mac menu bar | the pebble mark, eyes down while working (D306) | right: a glance mark, kept still |
| Opened task | D210's foot: a spinner, 在做, the clock and its latest step | out of scope (a transcript, not a waiting line) |

## Candidates

| | Candidate | Shape |
|---|---|---|
| A | Beautifully literal | the figure still; the words cross-fade; a ticking seconds count at the end |
| B | The partner acts out the step | the clay partner's own small loop per step: a sway and blink while thinking, a glance either side while looking back or looking up, the book and a nod as a page turns while checking a task, a lean while passing words on, a look about while on the web; past 15 s only breathing |
| C | Eyes that follow the work | the figure still, only its eyes move: up while thinking, scanning the line while looking |
| D | A breathing pebble | a faceless clay pebble swelling and settling, the same for every step |
| E | Clay beads | three clay beads bouncing in turn (the messaging "typing" dots in clay) |
| F | The thread | a clay line drawing itself under the words, looping |
| G | Stepping stones | a stone set down for each finished step, the current one breathing |

### Mapping tables (what each part says, and what it falsely implies)

| | Maps well | False implications |
|---|---|---|
| A | every fact as text; time is true | a still figure reads as hung (raters 4/6 unsure at 30 s); a ticking count reads as a countdown or a deadline ("6 秒是倒计时") |
| B | figure = the partner you talk to; its action = the step it is on; a calmer breath = a long step, not a stuck one | the action may be read literally (it is physically reading a book); a loop may be read as decoration if it doesn't change with the words |
| C | gaze = attention | eyes on the line read as reading *your* message or staring at you; eye layers for every pose (new art) |
| D | breath = alive | the same for every step: says nothing; read as a mood or a pet |
| E | a familiar idiom | "typing" = the answer is being written now (false while it searches); no partner in it |
| F | motion = progress | a progress bar with a known end; a loop that restarts reads as stuck |
| G | each stone = a real step | a count implies a known total, a percentage, "almost done"; grows a row of objects in the conversation |

### Rubric (1–5; raters' mean over 6 for the starred rows, our judgement for the rest)

| | A | B | C | D | E | F | G |
|---|---|---|---|---|---|---|---|
| Legibility without labels* (clear) | 3.00 | **3.67** | 3.00 | 2.67 | 3.17 | 3.00 | 3.17 |
| Calm* | 3.50 | 4.00 | 4.00 | 4.00 | 4.00 | 4.00 | **4.17** |
| Alive* | 2.67 | 4.00 | 4.00 | 3.17 | **4.50** | 4.00 | **4.50** |
| Delight* | 3.00 | 4.00 | 4.00 | 3.83 | 4.33 | 3.83 | **4.50** |
| Trust (not putting on a show)* | 3.17 | **3.50** | **3.50** | 3.17 | **3.50** | 3.17 | **3.50** |
| Read as stuck at 30 s* (yes / unsure of 6) | 1 / 4 | 0 / 4 | 0 / 2 | 0 / 3 | 0 / 2 | 0 / 4 | 0 / 1 |
| Mapping fidelity | 5 | 4 | 3 | 3 | 2 | 1 | 2 |
| State expressiveness | 2 | **5** | 3 | 1 | 1 | 1 | 3 |
| Emotional fit (a partner, not a mascot; D77) | 3 | **5** | 4 | 3 | 3 | 2 | 4 |
| Distinctiveness | 2 | **5** | 4 | 3 | 1 | 2 | 4 |
| Feasibility, 60 fps on the Mac and a phone, existing art | 5 | 4 | 1 | 4 | 5 | 5 | 3 |

E and G score highest on alive and delight, and both carry a false reading raters named
unprompted: E is "typing" ("以为三颗珠子的跳动就是回复已经开始写了"), G a progress count with a known total
("可能以为是百分比进度条"). F is a progress bar. C needs eye layers for every pose and was read as
staring at the person. D says nothing per step. B is the clearest (3.67), never read as stuck,
the only one that says *which* step with the figure as well as the words, and it is the partner
itself, in the clay it already has.

## Round 2: B refined from the raters' misreadings

Raters on B: "装饰动画" (only decoration), and "it is literally reading a book". The refinement
(B2): the action changes **only at the same moment the words change**, so a new action is
evidence that it moved on; a long step calms to breathing with the reassurance line; the reply
takes the line's place without a jump. B2 (6 more raters): clear 3.50, calm 3.67, alive 4.17,
delight 4.17, trust 3.33, stuck 1 / 2. Alive and delight rose; clear and trust held within the
noise of six raters. Still read by some as a figure "陪你" rather than proof of work, which the
words carry: the figure is company, the line is the fact.

## Words and cadence

- **The step from the person's side, its object only when they already know it**: the task's
  own title (在看「查 ITIN 的申请材料」做到哪了…), the question they asked (在网上查：ITIN 认证代理怎么预约),
  where it looks (在看你的日程…). Never a tool's name, a path, a query, or what it read (proactive
  restraint): a memory search stays 在翻之前聊过的…. Written by code from the tool call, not by a
  model, so it can't be wrong about the step or leak a query (the partner's persona and tools are
  unchanged).
- **Cadence**: a line stays at least 1.4 s; a newer step arriving sooner waits, and only the newest
  waits. INFERRED from the demo's pacing (`apps/web/demo.ts` paces a turn after a live one: a
  first step at 0.4 s, the next at 1.5 s): without a dwell, 在想… shows for 0.4 s and flashes;
  with it each line is there long enough to be read (about 9 zh characters at a glance). Not yet
  timed on a real partner turn (`todo.md`).
- **The change**: a 240-ms cross-fade with a 3-pt rise (`--t-say`); the figure's loop changes at
  the same moment. Under reduced motion: the step's pose, still, and a plain cross-fade.
- **Long**: 15 s adds 比平时久一点，还在处理; 45 s changes it and the loop calms to breathing.
- **End**: the reply lands where the line stood; the line goes at once and the reply's own
  entrance (the row gliding up) carries the eye. No nod before it: nothing waits on an animation.
- **CPU**: CSS transforms on one layer (web), paint-time transforms at 30 fps on a 32-pt box (Mac);
  still while the window or page is hidden and after 90 s with no input from the person (web: no
  pointer, key or touch; Mac: not the active window).

## Implications for Ducter

1. Build B as one alive line on both clients: figure slot + motion + dwelled words + reassurance,
   from one model (`packages/protocol/src/alive.ts`, its Go port, one fixture).
2. The step's object comes from code (task titles, a web look's question, a source), carried as
   `about` / `source` on the existing activity frame; older clients ignore them.
3. The same line serves every row that waits: a task's card (its coin, its latest words held and
   faded the same way, resting together), and the rows of one message with many asks (each its
   own figure and words).
4. The menu bar stays a still mark (D306): the glance must not pull attention.
5. Owed: eyes that follow (C) need eye layers; a partner-written step line (closer to the
   reference's 整理申请路线) needs a persona change and its eval; human raters.

**Summary.** Seven candidates; B, the clay partner acting out the step it is on beside a
present-tense line in the person's terms, is the clearest and the only one that says the step
with the figure too, never read as stuck. E and G rate more alive but say false things (typing; a
known total). Built with code-written objects, a 1.4-s dwell, a 240-ms change, calm after 45 s,
still when away or reduced.
