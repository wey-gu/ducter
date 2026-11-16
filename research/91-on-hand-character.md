# 91. On hand with character: seven ways to draw the same evening

*2026-11-16. For D287. Seven layout/metaphor candidates for On hand's board, including the
beautifully literal list it had, each with a mapping table and its false implications, a rubric,
and naive raters. The raters are LLM proxies (Claude Haiku, `claude -p --model haiku
--no-session-persistence --tools ""` in a scratch folder, one candidate per call, a persona per
call, zh and en asked separately): 3 personas × 2 languages × 7 candidates, then the refined
winner again. No human raters yet. Raw answers are in the session scratchpad
(`d287/raters/out-rate*.json`), not in git.*

## The moment

The person opens On hand to answer "how is everything, and does anything need me". The author's
evening (2026-11-16, 22:20) is the test case: nothing needs you, nothing at work, 4 waiting (a
review loop that looks every 45 min, back at 22:56; PR #1592 waiting for CI, back at 22:40; two
Pixel Fold recordings unchanged for 2 days), 1 done today (movers' quotes: Nippon Express cheapest,
¥86,000). After D270 the board said "现在没有要你定的事。", a sunk strip of four counts, flat rows,
two folds, and an empty canvas below: calm, and, in the author's words, mediocre and without
character ("平庸而且不够有追求和有性格").

| Persona | Before | What they want to feel after |
|---|---|---|
| Heavy developer (20–50 tasks) | scans a list that looks the same at 4 or 40 | the whole at a glance, then the one thing to look at; a team at work |
| Consumer (errands) | "在等 4": waiting for *me*? | 放心: someone is minding it, and says when it's back |
| Fresh user | an empty page with two lines | the partner is here, these are its two errands |

## Candidates

| | Candidate | Shape |
|---|---|---|
| A | Beautifully literal list (today) | sentence, strip, flat rows, folds |
| B | The partner and its cards | the partner's figure in a pose for the whole + one warm sentence; each task a small clay card (coin, title, line, live sign); a narrow "Today" column |
| C | The day's river | a horizontal timeline of today, tasks as beads; titles on hover |
| D | The little village | each task a clay house (lit window = working, mailbox flag = waiting, flower = done) |
| E | The garden | each task a potted plant (seedling = waiting, growing = working, bloom = done) |
| F | Four columns | a board of four state columns |
| G | The partner's note | a letter from the partner on top, a plain compact list below |

### Mapping tables (what each part says, and what it falsely implies)

| | Maps well | False implications |
|---|---|---|
| A | every fact as text; scales | nothing says a team is at work; "在等" read as "waiting on me"; folds hide what may be stuck |
| B | partner = who you talk to; card = one task; coin = who does it (D183); ring = when it comes back (D279) | "all quiet" read as "stopped"; greyed cards read as failed; a ring read as progress; a cute figure read as decoration |
| C | time is real; next and done are true positions | titles hidden; a task without a time has no place; a loop is one bead; collapses at 40 |
| D | spatial memory; lit window = working | houses imply places; dark house = broken; reading the legend is a concept to learn; 40 houses won't fit |
| E | growth = progress | a wilted plant = failed or neglected by you; watering = your job; growth implies percentage |
| F | literal, familiar | two empty columns take half the page; a kanban implies moving cards by hand |
| G | the partner's voice, informative | a letter re-written per open needs a model (latency, can be wrong, D261 (9)); the list below is A |

### Rubric (1–5; raters' mean over 6 for the starred rows, our judgement for the rest)

| | A | B | C | D | E | F | G |
|---|---|---|---|---|---|---|---|
| Legibility without labels* (clear) | 3.67 | **3.83** | 3.50 | 3.67 | 3.33 | 3.67 | 3.67 |
| Calm* | 5.00 | 5.00 | 4.50 | 4.67 | 4.67 | 5.00 | 4.67 |
| Alive* | 2.17 | 3.33 | 3.00 | 3.17 | **3.50** | 2.33 | 3.00 |
| Delight* | 2.50 | **4.00** | 3.00 | 3.50 | 3.67 | 2.83 | 3.00 |
| Scale to 40* | **3.33** | 3.00 | 2.33 | 2.83 | 2.67 | 3.00 | 2.67 |
| Mapping fidelity | 5 | 4 | 3 | 2 | 2 | 4 | 4 |
| State expressiveness | 3 | 5 | 3 | 4 | 4 | 3 | 3 |
| Emotional fit (partner, not mascot, D77) | 2 | 5 | 3 | 3 | 3 | 2 | 4 |
| Distinctiveness | 1 | 4 | 4 | 5 | 4 | 1 | 3 |
| Feasibility (both clients, existing art) | 5 | 4 | 3 | 1 | 1 | 4 | 2 |

D and E would need new art (houses, plants) and a legend; both carry a "broken / neglected" reading
of quiet work that raters raised unprompted ("灭灯的房子当成已经放弃", "蔫掉的幼苗看起来像出了故障").
C hides titles. B is the only one high on delight and emotional fit while keeping A's literal words.

## Round 2: B refined from the raters' misreadings

Round 1 raters on B: "都挺安静" read as the partner having stopped; greyed quiet cards read as
failed; "下一件 22:40" read as a deadline; the header's 4 vs the 2 greyed ones counted twice. B2:

- The sentence is facts only: **现在没有要你定的。4 件在等：最早 22:40 回来，2 件一天多没有动静；今天做完 1 件。**
  The quiet count uses the fold's own words ("一天多"), never a second number.
- Quiet waits are plain rows (never greyed cards) under **一天多没有动静**, each saying what it
  waits for or **停下了，没说在等什么**, and when it last changed.
- A wait's card says what it waits for in words and, by the ring, **22:40 回来**.
- A new result's card says the result in full ink, with the smiling face.
- The day column's headings say **接下来** and **今天回来的**.

| | clear | calm | alive | delight | scale |
|---|---|---|---|---|---|
| A (round 1) | 3.67 | 5.00 | 2.17 | 2.50 | 3.33 |
| B (round 1) | 3.83 | 5.00 | 3.33 | 4.00 | 3.00 |
| **B2** | **3.83** | 4.67 | **3.50** | 3.83 | **3.67** |

B2 keeps B's legibility and delight and passes A on scale. What raters still raised: zero working
at night reads a little empty ("晚上 0 在做的状态让我觉得它有点空", true: nothing is working); a ring
could be read as progress (the words beside it say when); a consumer doesn't know "coin" (the coin
is never named in the UI; the agent's name is in the task).

## Implications for Ducter

1. Take B2: the partner at the head with a pose for the whole (needs you > working > waiting >
   done > idle, the existing clay art), a deterministic sentence, the strip kept as filters.
2. What is alive stands as cards with the agent's coin and one truthful heartbeat each; what has
   gone quiet or been seen stays rows; the rail beside an opened task stays rows (D244).
3. Fill the wide screen with the day (what comes back next, now, what came back today with its
   result), never with decoration.
4. A fold earns its line from three: one or two quiet waits or seen results stay in sight (raters
   asked "is anything stuck?" about what the fold hid).
5. Test with people next: the author first, then a consumer who has never heard "agent".

**Summary.** Seven ways to draw the author's evening were rated by Haiku proxies (3 personas, zh
and en). The literal list was the calmest and least alive (2.17); villages and gardens were alive
but implied broken or neglected work and needed new art; a timeline hid titles. The partner with
its cards was the most delightful (4.0) and, refined with facts-only words and quiet waits as plain
rows, held legibility (3.83) and passed the list on scale (3.67). LLM raters only.
