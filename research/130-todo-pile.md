# 130 · The to-do pile: what On hand shows for "your to-dos", and how it shrinks

> 2026-11-18. Public. Evidence for the pile decision (task-sources' triage and hand-over loop; the
> decision number is the one this branch records, which may need renumbering at merge). The author on
> the to-do sources as built (a list of ≤3 cards and a fold): "你这个和外部任务系统涉及的结合有点敷衍吧，
> 没做到我们那种让人欢呼的游戏级别的体验，很 flow". The target: a person with 557 open issues feels
> "终于有人帮我扛了" and watches the pile shrink.
>
> Tags: **VERIFIED** run by me this session · **INFERRED** my reading. LLM proxies only (claude haiku), no
> humans: the numbers say how a careful naive reader parses a described picture and its words, not how
> people feel looking at the real art. A comprehension pass with people is owed.

## 1. What the object must carry (INFERRED)

On hand's to-dos group gets one object above its cards: the person's open to-dos as a whole. It must say,
without a label: *this is the pile*, *it is this big*, *it is getting smaller*, and *someone is working
it with you*. It changes by one at a time (557 → 556) and must work at 3, 557 and 2,000. Its exact count
is always the literal number beside it; the picture only says "a lot / some / a few / none".

Who looks at it:

- the heavy developer with 557 assigned issues across repositories, who has stopped opening GitHub's list;
- the consumer whose Obsidian to-dos keep growing;
- the fresh user, who has "a lot of things not done" and has never heard of an issue.

What it must not do: blame (a debt counter), promise what isn't true (that all 557 will be done), or
turn a pile into a game score that rewards closing things for the sake of it.

## 2. Candidates and their false implications (INFERRED)

| Candidate | Mapping | False implications |
|---|---|---|
| **L · No metaphor, beautifully literal**: a large count, a thin bar whose green part is what was cleared, the day line | count = open; green = cleared | a debt meter ("557 behind"); a bar implies a finish line the person must reach; with 557 the green sliver is invisible (4/557 < 1%), so progress *looks* like none |
| **S · A stack of clay paper sheets**, shorter as it shrinks | sheet = to-do; height = how many | a paperwork backlog (dread); one sheet per item can't hold at 557, so height is a bucket, not a count; nobody is helping |
| **J · Two jars of pebbles**, one moved across per item | pebble = item; right jar = cleared | countable pebbles invite counting (557 can't be drawn); "Pebble" is the theme's own name, so a pebble here collides with the partner's body; a full right jar reads as a score to fill |
| **M · A clay hill being levelled** with a little shovel | hill = backlog; levelled patch = cleared | an endless dig; the shovel says *you* dig; a hill has no unit, so "one fewer" is invisible |
| **T · A tower of clay blocks**, the top one lifted off | block = item | towers fall (fragility, a game of Jenga); a taller tower reads as an achievement to build, not a load to lighten |
| **I · Two letter trays** (to do above, done below) | the office in-tray | the clearest "work backlog" read and the heaviest: the most guilt of all (round 1), office drudgery; nobody but you is at the desk |
| **C · The partner carrying your stack**: Ducter's own clay character beside the stack, holding a few sheets it took off the top | stack = your to-dos (height by bucket); in its arms = what it is working on for you; it alone = cleared | that it will do all 557 (it holds a few; the words must say only what it took); that it suffers under the load (it must look willing, never strained); the character elsewhere shows the partner's state, so this is a new pose of the same one (true: it is the partner) |

Considered and dropped before raters: a clothesline (laundry is the person's chore, the same guilt as
the trays), a mailbox (already the mark for a mail source, `wait_mail`), the apps' own marks (not ours,
and says nothing about size).

## 3. Method (VERIFIED)

- **Raters:** `claude -p --model haiku --no-session-persistence --tools "" -- <prompt>` from a scratch
  folder in the session scratchpad, 8 at a time. Its runs created one `~/.claude/projects` folder (the
  scratch folder's); it was deleted, and the list was the same as before afterwards.
- **Personas:** the three users above, each in zh and en.
- **Stimulus:** On hand's group **GitHub 上标给你的 / Assigned to you on GitHub**, and at its top the object
  described in words (the picture), the count line and the day line.
- **Asked (one JSON line):** what it shows; how it changes when the AI finishes one; what 0 means;
  clarity 1–5; feel 1–5 (1 stressed, guilty; 5 relieved, someone is carrying this with me); one feeling
  word; guilt 1–5 (being blamed); one wrong belief it might give; would you want to see it daily 1–5.
- **Round 1:** the 7 looks, all with the debt framing ("557 件没做完 · 今天替你清掉 4 件"), 7 × 3 × 2 × 2 = 84.
- **Round 2:** round 1 said the framing drowned the picture, so three looks (L, S, C) × three framings
  (debt: the count first; cleared: the day line first; sorted: the partner's triage sentence with one
  button per group) × 12 = 108 (4 unparsable answers rerun).
- **Round 3:** the triage sentence's words, three versions × 12 = 36, asked the three false beliefs
  round 2 surfaced (the 212 are already done; the 61 close without asking; the rest are handled).
- 228 runs in all.

## 4. Results (VERIFIED)

Round 1, debt framing (12 runs each; clarity and feel as zh / en; negative feeling words =
overwhelmed, 压力, 压迫, 沉重 and the like):

| Look | Clarity | Feel | Guilt | Like | Negative words |
|---|---|---|---|---|---|
| C partner carrying | 3.50 / 3.33 | **2.83 / 3.33** | **2.67** | **3.17** | 8 / 12 |
| T tower | 3.50 / 3.33 | 2.50 / 3.00 | 2.67 | 2.42 | 10 / 12 |
| M hill | 3.33 / 2.83 | 2.67 / 3.00 | 3.08 | 2.58 | 11 / 12 |
| J jars | 2.83 / 3.17 | 2.17 / 2.83 | 3.00 | 2.50 | 10 / 12 |
| L literal | 3.33 / 3.00 | 2.17 / 2.33 | 3.50 | 2.00 | 12 / 12 |
| S stack | 3.33 / 3.67 | 2.00 / 2.33 | 3.42 | 2.00 | 12 / 12 |
| I trays | **3.83 / 3.50** | 1.83 / 2.00 | 3.67 | 1.92 | 12 / 12 |

Every look read "one done" right (the count drops by one and the object loses a piece: all 84), and 0
as "all cleared". The dominant wrong belief, in every look, was "I'm 557 behind and it's my fault" /
"以为自己欠了 557 件事". Only C got "supported", "被帮衬", "安心".

Round 2, the framing (12 runs each):

| Look × framing | Clarity | Feel | Guilt | Like |
|---|---|---|---|---|
| L × debt | 3.17 / 3.33 | 1.67 / 2.67 | 3.50 | 2.25 |
| L × cleared first | 3.17 / 3.17 | 2.83 / 2.83 | 2.58 | 2.58 |
| L × sorted | 2.83 / 3.50 | 3.00 / 3.50 | 1.92 | 3.58 |
| S × debt | 3.67 / 3.67 | 2.17 / 2.50 | 3.42 | 2.17 |
| S × cleared first | 3.17 / 3.67 | 2.50 / 2.67 | 2.75 | 2.67 |
| S × sorted | 3.33 / 3.33 | 2.83 / 3.50 | 2.08 | 3.50 |
| C × debt | 3.50 / 3.17 | 2.67 / 3.00 | 2.67 | 2.92 |
| C × cleared first | 3.33 / 3.67 | 3.33 / 3.67 | 2.17 | 3.75 |
| **C × sorted** | 3.17 / 3.50 | **3.67 / 3.67** | **1.75** | **3.83** |

The framing moves feel by about a point, the look by about half a point, and they add up: the partner
carrying the stack with the sorted sentence is the only cell where most raters wrote "relieved",
"松一口气", "安心". The sorted framing's own wrong beliefs: "the 212 are already done" (3 of 12), "the 61
are verified safe to close" (3), "the rest are handled" (3).

Round 3, the sorted sentence's words (12 runs each; right answers out of 12):

| Words | 212 not done yet | 61 asked first | rest not handled | Clarity | Feel |
|---|---|---|---|---|---|
| A 我能直接做完 212 件，要你拿主意的 38 件，看起来可以关掉 61 件；其余的还没细看 / 212 I can finish myself… 61 look safe to close… | 9 | **0** | 11 | 3.00 / 3.67 | 3.00 / 2.83 |
| **B 可以交给我做的 212 件，要你拿主意的 38 件，也许可以关掉的 61 件（关之前给你过目）；另外 246 件我还没细看** | **11** | **11** | 11 | **3.83 / 3.67** | **3.50 / 3.00** |
| Cw 我能接手的 212 件…可能可以关掉的 61 件；还有 246 件没细看 | 9 | 0 | 12 | 3.00 / 3.33 | 3.17 / 3.17 |

"看起来可以关掉 / look safe to close" was read as *the AI will close them by itself* by every rater (0 of
12 in both A and Cw): the words must say the person sees them before anything closes. "closable" was
flagged as an odd word in 10 of 12 en runs of B and Cw; "接手" in 4 zh runs.

## 5. The rubric (INFERRED, informed by §4; 1–5 each)

| Candidate | Legible without labels | Mapping fidelity | Scale (3 / 557 / 2,000) | State (big → one fewer → none) | Emotional fit | Distinctive | Feasible | Total |
|---|---|---|---|---|---|---|---|---|
| **C partner carrying** | 4 | 4 | 4 | 4 | **5** | **5** | 4 | **30** |
| L literal | 4 | 4 | 5 | 3 | 2 | 2 | 5 | 25 |
| T tower | 4 | 3 | 2 | 4 | 3 | 3 | 4 | 23 |
| S stack | 4 | 3 | 3 | 4 | 2 | 3 | 4 | 23 |
| M hill | 3 | 2 | 4 | 3 | 2 | 3 | 4 | 21 |
| J jars | 3 | 3 | 2 | 4 | 2 | 3 | 3 | 20 |
| I trays | 4 | 3 | 3 | 4 | 1 | 2 | 4 | 21 |

C's scale is a bucket (the stack's height), never a count, which holds at 2,000 as at 557; its fidelity
loses a point for "it will do all of them", which the words fix (round 3, B). Its feasibility is four
clay states and code motion.

## 6. Chosen: the partner carrying your stack (C), with the sorted words (B)

- **Look:** Ducter's clay character beside a stack of cream clay sheets, holding a few it took off the
  top, willing, never strained. Four states chosen by code from the open count's bucket:
  `pile_big` (≥ 100: a stack as tall as the partner, three sheets in its arms), `pile_mid` (20–99: a
  middle stack, two in its arms), `pile_small` (1–19: three sheets at its feet, one in its hands),
  `pile_clear` (0: one ticked sheet on the floor, the partner sitting back with its eyes smiling). One
  canvas for every state, bottom-aligned, so a change of state never moves the layout.
- **Words beside it** (INFERRED from rounds 2 and 3; B was tested in zh and en, the en edits below not):
  - The lead, after a sort: **557 件里，可以交给我做的 212 件，要你拿主意的 38 件，也许可以关掉的 61 件（关之前
    给你过目）；另外 246 件我还没细看。** en, with "closable" replaced: **Of 557: 212 you could hand to me,
    38 need your call, 61 you might close (you see each one first); 246 I haven't looked at closely yet.**
    On screen each group is its own line with its own button (D291: never one dot-joined line).
  - The count, small, never first: **还有 557 件 / 557 still open** (not **557 件没做完 / 557 open**, the debt
    read).
  - The day line: **今天替你清掉 4 件 / Cleared 4 for you today** (read right by every rater who saw it).
- **Motion** (INFERRED): one item done → the count rolls down one digit (557 → 556, 240 ms), one sheet
  lifts from the partner's arms and fades up and right (500 ms), the partner gives one small nod (scale
  1 → 1.04 → 1, 300 ms); a bucket change crossfades the art (400 ms). Several at once tick one by one, at
  most five, then jump. Reduced motion: no sheet, no nod; the number and the day line change in place with
  a 150 ms opacity fade, the art swaps without a crossfade.

## Implications for Ducter

1. **The words decide the feeling more than the picture.** A count first reads as debt in every look
   (12 of 12 negative words for the literal number). Lead with what the partner can take and what is
   cleared; the total is a small second line.
2. **Never "看起来可以关掉 / look safe to close" without saying the person sees them first**: every rater
   believed the AI would close them by itself. The close batch is reviewed and goes behind one Go.
3. **Say the unread part out loud** ("另外 246 件我还没细看"): without it raters assumed the rest was
   handled. Never a model-made number pretending to cover the whole pile.
4. **The partner itself is the metaphor**: it is the one carrying, so the object needs no new concept
   (D43) and no new name; its pose must stay willing, never strained, or it reads as a burden handed over.
5. **The picture is a bucket, the number is literal**: four states, never one sheet per item.
6. Owed: a comprehension pass with people on the real art, and the en group words as edited.

## Summary

Seven looks for "your to-dos" (including the beautifully literal count), 228 haiku runs as the three
users in zh and en. The count-first framing read as debt in every look; the partner's own clay character
carrying the stack, with the partner's sorted sentence (可以交给我做的 · 要你拿主意的 · 也许可以关掉的，关之前给你
过目 · 还没细看的), scored best (feel 3.67 / 3.67, guilt 1.75, like 3.83) and the B words removed the two
false beliefs (closing without asking: 0 → 11 of 12 right). Four clay states (`pile_big`, `pile_mid`,
`pile_small`, `pile_clear`) made in the existing pipeline. LLM raters only.
