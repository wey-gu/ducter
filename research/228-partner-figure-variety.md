# 228: How several partners could differ by more than colour

The author, 2026-11-25: several partners now differ only by colour (D497, research/215). A similar
open-source project (read only, 2026-11-25; named in `private/brigade-2026-11-25.md`, D414) has six
oklch pebble blobs with faces that fall on its landing hero with gravity, and a face on a sphere
whose weighted moods follow the pointer. Its figures also differ mostly by colour; its extra is
expression, mood and motion. Can it teach us anything about figure variety?

This report runs AGENTS.md's metaphor process for **what, beyond colour, makes one partner's figure
its own**: candidates inside the clay pebble family (D53) including "no change", a mapping table per
candidate with every false implication, a rubric, cheap stimuli made from the existing renders, and
research/215's naive-rater test with LLM proxies. No product change. Stimuli, the script, the
raters' raw answers: `.shots/figure-variety/` (not in git, D75).

## 0. What the other project does (VERIFIED from its landing source, read only)

| Item | What | Tag |
|---|---|---|
| Hero blobs | six pebble blobs (the logo's shape) in six oklch colours, each with two dot eyes, falling on the headline with gravity; the letters spring under them | VERIFIED |
| The pebble | one face on a sphere; a few weighted moods (eye and mouth shapes) blend toward the pointer | VERIFIED |
| Teammates | named personas are the main object; the blobs are the landing's play. Whether the product gives each teammate its own blob was not read | DOCUMENTED (landing), not checked (product) |

What it teaches: **motion and expression make a figure feel alive**, which Ducter already has (D77's
breath and blink, D290's look-round, D517's out-of-step breathing and the hop). What it does not
teach: its figures are told apart by colour alone, exactly as Ducter's are, and its moods are moods
of *one* face, which is the false implication we must avoid (§2, candidate G). It is a landing toy,
not an identity system for 24-point marks.

## 1. Who, and what they feel

**Who.** Mostly the consumer personal-AI user (a family partner, a writing partner, the default for
work) and the heavy developer with a work and a home partner; two to five partners (today
`PARTNERS_MAX` is 4: the default and three). The fresh user has one partner and sees none of this.

**Where they must tell partners apart at a glance:**

| Place | Size | What it must say |
|---|---|---|
| The list of partners (D513), the phone's stack (D541) | 40 (rows), 24 (the stack) | which one is which, before reading the name |
| A needs-you number on a figure's shoulder | 40 | whose ask it is |
| A task's mark on On hand, its rail, a wait's figure (D546) | 24 | whose task, among many rows |
| The conversation's own figure, a first meeting | 96 and up | "this is the one I'm talking to", and that it has a character |
| Dark mode | all | the same, on the dark paper |

**What they want to feel.** 放心: never "wait, which one is this?" in a list of tasks. And more
than recognition: **"mine, each its own character"**, the way two pets of one breed are still
obviously themselves. Colour gives recognition; it gives little character (all five are the same
figure in another paint). The ask is character without losing kinship (same kind, same powers,
D497's mapping) and without making any figure read as a *state* of another.

**The constraint that decides most of this.** The figure's face is already a state display (ui.md
"Persona face", D77): idle has tall oval eyes; working looks aside at the notebook; needs you
**raises its brows** and lifts a flag; done has **^ ^ arcs**; napping has **closed down-arcs** in a
knitted wrap; the blink is a closed-eyes frame. Any identity cue drawn in the face's vocabulary
(brows, eye arcs, half-closed lids, a mouth) collides with a state.

## 2. Candidates and their mapping tables

Every candidate keeps the clay pebble body, one top-left key light and matte clay (D53), and every
state pose (D77). "Identity" below means "a different partner of the same kind".

**A. No change: colour only, the name beside it (today, D497).**

| Maps | False implications |
|---|---|
| clay colour = who | a colour can read as a status (mitigated: states are poses; the needs-you colour is only on numbers); sand and coral are near (research/215) |
| same figure = same kind and powers | also "the same one, re-skinned": no character of its own |

**B. Silhouette proportions (round, tall, flat, a lean).** The body is squashed or stretched; the
eyes, arms and feet keep their size.

| Maps | False implications |
|---|---|
| body shape = who | tall/flat can read as age or size (a child, a big one), or as "squashed" (a squash is also the equip's and the hop's motion, D290: a flat figure could read as mid-bounce) |
| same face, same clay = same kind | a flat one can read as tired or asleep (napping is a low, wrapped pose) |
| | the shape must stay legible inside a square mark: a flat figure fitted to 24 is shorter |

**C. Eyes and face (shape, spacing, size; a resting expression).**

| Maps | False implications |
|---|---|
| eye shape = who | collides with the state face: brows = needs you, ^ ^ = done, closed arcs = napping, half-closed = sleepy; any of these read as a mood of the same one |
| | round button eyes read as "younger" or "cuter"; small bead eyes as "calmer" or "shy": a temperament the person didn't choose |
| | almost invisible at 24 (the eyes are 2 to 3 pixels) |

**D. Finish (matte, glazed, speckled).**

| Maps | False implications |
|---|---|
| finish = who | gloss is against D53 ("never over-gloss"); speckles read as dirt, freckles or "sick"; both read as a theme or skin, not a someone |
| | invisible at 24 (speckles fall under a pixel); dark mode flattens a glaze |

**E. One small held object tied to what it looks after** (the default keeps its notebook; work a
laptop; family a calendar).

| Maps | False implications |
|---|---|
| object = its part | it only does that part (a partner does anything asked, D486's "looks after" is the person's words, not a role); a part like 「读书、跑步和周末的安排」 has no one object |
| | the default already holds a notebook in every pose, so an object is a change to every pose (working reads it, needs you holds it while it waves) |
| | an object swap reads as "the same helper, now doing a different job" (D497's accessory finding, 3 of 3) |

**F. A temperament in motion (idle rhythm, blink cadence, how it hops)**, still under Reduce Motion.

| Maps | False implications |
|---|---|
| rhythm = who | a faster bob or a quick double blink reads as excited, urgent or "something's happening" (a status; D77: status never moves); a slow sway reads as sleepy |
| | gone under Reduce Motion and in every still (a screenshot, a notification's image, the 24 marks, which never move on On hand) |
| | seen only side by side and only over seconds: no glance |

**G. Mood and expression per moment (the other project's idea), on today's colours.**

| Maps | False implications |
|---|---|
| expression = how it feels now | it is a state of *one* figure by construction: the person reads "the same one, happy / worried", the false implication D497 rejected |
| | Ducter's poses already carry real states; a decorative mood would lie about state (D43: state is shown by the thing itself) |

**H. Silhouette + face, colour kept** (B and C together, on A).

| Maps | False implications |
|---|---|
| shape + face + colour = who | B's and C's, weakened: three cues agree, so no single one is read as a state |
| | a taller or flatter one can still read as older/younger or as a different kind ("a different species", research/215's E: different powers) |
| | needs its own art for every pose and the blink (§5) |

**E′. E with colour kept** (the object on top of today's recolour) is tested too, since D497 left
the question open whether an object tied to the partner's job differs from an accessory.


## 3. Stimuli (cheap, honest about what they are)

`.shots/figure-variety/make.py` (Python, PIL and numpy, reusing `tools/art/eyes.py`) builds every
sheet from the idle and needs-you renders in `design/art/assets/alpha` (VERIFIED: run 2026-11-25):

| Transform | How | What it is not |
|---|---|---|
| Colour | `LOOK_CLAY`'s hue turn then saturation, as sRGB matrices (the shipped recolour) | the same as shipped |
| Silhouette | the eyes filled with clay (eyes.py's harmonic fill), the body scaled (tall 0.80 × 1.22, flat 1.30 × 0.76, wide 1.12 × 0.94) or leaned (a 0.18 shear), the original eyes pasted back unscaled | the notebook, arms and feet stretch with the body; a real render would keep them |
| Face | eyes filled with clay, new eyes drawn (round buttons set wider, small beads, wide ovals, a half-lid), 4× supersampled | flat drawn eyes, not sculpted; no rim, no shading |
| Finish | a soft top-left glaze highlight with a little more contrast; or 900 random specks | not a render; the glaze knowingly breaks D53 to test it |
| Object | an existing clay asset (`laptop_awake`, `routine_calendar`) laid over the notebook | no hand re-sculpted round it; the notebook peeks |
| Motion | not made: described in words (as research/215 did for D and E), a weaker test | |

Each sheet fits every figure into a square box (as the UI's marks are), feet on one line: a 96-pt
sheet on the light paper (`#FFF6EA`) and a 24-pt sheet on the dark paper, both at @2x. Sheets:
`A-colour`, `A5-colour` (five looks), `B-silhouette`, `B5-silhouette`, `C-face`, `D-finish`,
`E-object`, `G-object-colour` (E′), `F-combo` (H: sand as drawn, sage tall with buttons, sky wide
and flat with beads), `F5-combo` (H with five: plus plum wide with wide ovals, apricot leaned with
the original eyes), and three **state tests** where one figure appears twice, idle and needs you,
beside another (the right answer is two helpers): `SA` (colour), `SC` (face), `SF` (H); and `M`,
the other project's idea: three colours, each in another mood (idle, done, needs you).

## 4. Comprehension test (LLM proxies)

**Method** (research/215's protocol): Claude haiku, `claude -p` from a scratch folder, a fresh
session per answer, three answers per stimulus, the image read with the Read tool, the prompt on
stdin. The question never says partner, persona, colour or metaphor: "You are opening a personal
AI app for the first time … the image shows figures from the app: **q1** how many different
helpers do you see; **q2** what is each one like; **q3** are any of them the same helper shown
twice, for example in another mood, pose or state; **q4** what do the differences mean to you (a
different helper, a different job or role, a status or mood, a theme or skin, or nothing)." The
run folders under `~/.claude/projects` were deleted afterwards.

**A flaw caught and redone.** Round 1 named the files by candidate (`C-face-96.png`,
`M-moods-colour-96.png`), and several raters quoted the name as evidence ("the filename says
'states-face'"). Round 2 re-ran all 69 answers with opaque names (`img01` … `img23`); **the table
is round 2**. Round 1 agrees with it on every row except small wobbles; both are kept in
`.shots/figure-variety/raters/`.

q1 alone misleads: raters often count figures, then say in q3 that two are one helper. The table
reads q1 with q3 ("seen as separate") and codes q4's first reading.

| Stimulus | Seen as separate helpers | What the differences mean (q4, first reading) |
|---|---|---|
| A colour, 96 | 3 of 3 | **a theme or skin of one character, 3 of 3** |
| A colour, 24 dark | 2 of 3 | a theme or skin, 3 of 3 |
| A colour, five, 96 / 24 dark | 3 of 3 / 3 of 3 | a theme or skin, 3 of 3 / 3 of 3 |
| B silhouette, 96 / 24 dark | 0 of 3 / 0 of 3 | a status or mood ("flat and lying down = resting"), 3 of 3 / 3 of 3 |
| B silhouette, five, 96 | 0 of 3 | mood or state, squash-and-stretch frames, 3 of 3 |
| C face, 96 / 24 dark | 0 of 3 / 0 of 3 | a mood ("attentive, happy, calm, sleepy or smug"), 3 of 3 / 3 of 3 |
| D finish, 96 | 0 of 3 | a theme or skin, 3 of 3 |
| D finish, 24 dark | 0 of 3 | a state, size or "level-up", 3 of 3 (the speckles vanish) |
| E object, 96 | 0 of 3 | **a different job or role, 3 of 3** |
| E object, 24 dark | 0 of 3 | a task or state, 2 of 3; a role, 1 of 3 |
| E′ object + colour, 96 | 3 of 3 | **different helpers, each with a role, 3 of 3** ("orange with a book for notes, green with a laptop for coding") |
| E′ object + colour, 24 dark | 3 of 3 | a theme or skin, 3 of 3 (the objects vanish) |
| H silhouette + face + colour, 96 | 3 of 3 | **different helpers, 3 of 3** ("not just a theme or skin swap") |
| H, 24 dark | 3 of 3 | different helpers, 2 of 3; a skin, 1 of 3 |
| H with five, 96 | 1 of 3 (2 of 3: "orange and red look like one design in two colourways") | a theme or skin, 3 of 3 |
| H with five, 24 dark | 3 of 3 | different helpers ("a roster"), 2 of 3; a skin, 1 of 3 |
| F motion only (words) | 0 of 3 | a status or mood ("idle, busy, resting"), 3 of 3 |
| F motion + colour (words) | 3 of 3 | different helpers with "personalities", 2 of 3; a theme, 1 of 3 |
| G moods on colours (the other project's idea) | 3 of 3 | **different characters, 3 of 3**: the mood read as each one's fixed personality |
| State test, colour (SA) | the needs-you pose found as the same one, 3 of 3 | the other colour: a skin, 2 of 3; another helper, 1 of 3 |
| State test, face (SC) | **all three one helper, 3 of 3**: the identity face and the state face collapse | a mood |
| State test, H (SF) | the needs-you pose found as the same one, 3 of 3 | the other: a skin, 2 of 3; another helper, 1 of 3 |

**What it says.**

1. **Colour separates, but gives no character.** Every colour sheet was read as separate figures
   and every rater, at every size, called the difference "one character in several colourways, a
   theme or skin". research/215 found 3 of 3 "different helpers" for the same recolour, but inside
   the app's bar with names and counts; without that context, colour says *instances*, not
   *someones*. The author's feeling is right.
2. **Any single non-colour cue on its own reads as the same one** in a state (silhouette, face,
   motion), a skin (finish) or a job (object). Silhouette and face are the state vocabulary
   (squash and stretch, expressions), so they are borrowed by the states at once.
3. **Shape and face together, on colour, read as different characters** (3 of 3 at 96, 2 of 3 at
   24 on the dark paper, "not just a skin swap"). It is the only candidate that moved the reading
   from "skin" to "someone".
4. **An object tied to the job reads as the job**, with or without colour (3 of 3 role at 96),
   and vanishes at 24. D497's accessory finding holds for a job object: it implies "it only does
   that".
5. **The other project's moods would mislead in Ducter**: a mood on one colour read as that
   figure's fixed personality (3 of 3). Ducter's faces carry real states; a mood that reads as
   character makes a partner who needs you look "worried by nature".
6. **Five strains every cue.** With five, the weakest pair (apricot leaned, with the default's face,
   beside the default) was read as one design twice by 2 of 3 at 96. Each look needs a shape *and*
   a face clearly its own, and apricot's hue is near sand.
7. **States survive colour and H, not a face-only identity.** In SA and SF every rater found the
   needs-you pose to be the same one; with face-only identity (SC) the three collapsed into one
   helper. Any identity face must stay out of the state vocabulary (§1).

**Honest limits.** LLM proxies, not people; three answers a cell; crude composites (flat drawn
eyes, stretched props), which if anything understate H and C; no names or app context (on purpose,
the glance test; research/215 had the context); motion judged from words; the 24-pt sheets are
small images a model may upscale differently from an eye. The 40-pt size was not rated separately
(it sits between the two; INFERRED to follow 96).

## 5. Rubric

1 (poor) to 5 (strong). Legibility is 24, 40 and 96 together, without labels. Feasibility is the
current pipeline (clay renders generated with references, cut out, `art.mjs` and `eyes.py`,
recoloured at run time) and the cost of each new look.

| | Legible 24/40/96 | Mapping fidelity | Scale to 5 | States kept | Emotional fit | Distinct | Feasible, cost per look | Total |
|---|---|---|---|---|---|---|---|---|
| A no change (colour only) | 4 | 2 | 3 | 5 | 3 | 2 | 5: none | 24 |
| B silhouette | 3 | 1 | 3 | 2 | 3 | 3 | 3 | 18 |
| C face | 1 | 1 | 3 | 1 | 3 | 2 | 2 | 13 |
| D finish | 1 | 1 | 2 | 4 | 1 | 2 | 4 | 15 |
| E object | 2 | 1 | 2 | 3 | 4 | 3 | 1 | 16 |
| E′ object + colour | 3 | 2 | 2 | 3 | 4 | 4 | 1 | 19 |
| F motion only | 1 | 1 | 3 | 2 | 4 | 2 | 4 | 17 |
| F + colour (as an add-on to A) | 4 | 3 | 3 | 4 | 4 | 3 | 4: one row of numbers | 25 |
| G moods (the other project) | 2 | 1 | 3 | 1 | 4 | 3 | 3 | 17 |
| **H silhouette + face, colour kept** | **5** | **4** | **3** | **4** | **5** | **5** | **2: a pose set per look** | **28** |

Why H is not higher: five shapes and five faces that stay out of the state vocabulary are a tight
design space (the fifth was confused); and it needs real art. F + colour is scored from words only.

## 6. Feasibility and cost

**Today** (VERIFIED in the repo): one pose set, drawn once in the orange clay: `ducter_{idle,
working, waiting, needsyou, done, napping}` (1024 alpha masters, about 2.5 MB together), the closed
eyes made by `tools/art/eyes.py`; the Mac's crops (`theme/art/crop`, about 1.4 MB), the site's
AVIF/WebP (about 450 KB), the phone's `idle.webp` and `idle_closed.webp`. Every look is the same
art recoloured at run time (`LOOK_CLAY`, web `clayFilter`, Mac `theme.LookClay`). The blink's lids
are one pair for every look (`theme.FaceLids`, art.json's lid boxes).

**H, the size of the work.**

| Part | Work | Size |
|---|---|---|
| Design | four shapes and four eye styles beside the default's, chosen through this process with real renders; identity cues only from body proportion and eye shape/size/spacing, never brows, arcs, half-lids or a mouth (those are states) | half a day, then the human raters (§7) |
| Art | per look, the six poses in the default orange clay (then recoloured at run time, so a shape is drawn once), generated with `r2_char_clay.jpg` and the default's pose as references, chosen, cut out; the napping pose hides the body, so it may share the default's with only the face changed | four looks × six poses = 24 kept renders; at 5 to 10 generations each, about 120 to 240 generations; one to two days with selection and clean-up |
| Pipeline | `art.mjs` and the Mac's crops per look (`ducter_<look>_<state>`), `eyes.py` per look, lid boxes per look (the Mac's `FaceLids` and art.json become a table by look), the phone's two frames per look | about one day; assets grow about 0.4 MB of masters and 0.25 MB of Mac crops per look (D75's 2 MB per file holds) |
| Clients | the face picks its art by look as it picks its tint now; the picker shows each look's figure; tests (looks_test, the locator contrast test) per look | about one day |
| Per new look later | one pose set (six renders) and a pipeline run | about a day of art |

**A transform pipeline instead of renders** (what `make.py` does) costs nothing per look but fails
D53's bar: stretched props, flat eyes, a seam risk round the eyes, and the working and needs-you
poses (arms, the flag, the book) distort. Good enough for this test, not for the product.

**F + colour, the size of the work.** Per look, a breath period and depth and a blink interval
(a row in the same table as `LOOK_CLAY`), within D77's ranges so nothing reads as a status; the
web's CSS variables and the Mac's figure loop read them. About half a day; nothing changes under
Reduce Motion or in the still marks (the 24-pt marks on On hand never move), where it gives nothing.

## 7. The human-rater step

Owed before any art is commissioned, and it absorbs todo's open "human raters for the recoloured
figure":
- **Who:** five to eight people who have never seen Ducter, half reading zh and half en, at least
  two of them not technical (the consumer user), none told the word "partner".
- **Stimuli:** real renders, not transforms: A (today) and H (two shape-and-face sets), shown in
  the built list of partners at 40, On hand's rows at 24 on the light and the dark paper, and the
  conversation's figure at 96; three and five partners; plus the state test (one partner idle and
  needs you beside another).
- **Tasks:** (1) research/215's questions and this report's four; (2) **match** a 24-pt task mark
  to its partner among three or five (accuracy and time); (3) after five minutes on something else,
  "which one looks after your family?" from the figures alone; (4) "does each feel like its own
  character?" on a 1 to 5 scale, and which they would want as theirs.
- **Pass bar:** H must beat A on (2) and (4), with at least four in five reading different helpers
  and at most one in five reading any figure as a state of another; otherwise keep A.

## Implications for Ducter

1. **The other project teaches liveliness, not identity.** Its figures differ by colour only, as
   ours do; its moods are one face's. Ducter already has the liveliness (breath, blink,
   look-round, the hop), tied to true states. Do not add decorative moods: raters read a mood as
   a fixed personality.
2. **Colour alone reads as a skin of one character** when the context is gone (3 of 3, every
   size). It keeps every state and costs nothing, so it stays the base; it does not give "each its
   own character".
3. **Recommended: H, silhouette and face with colour kept**, one shape and one eye style per look
   (a look stays one token, so a partner's look carries all three). Identity only in body
   proportion and the eyes' shape, size and spacing, never in brows, eye arcs, lids or the mouth,
   which are the states'. Tradeoff: a pose set per look (24 renders now, a day of art per look
   later), lids per look, and a tight design space at five. Gate it on the human raters (§7).
4. **Alternative, cheap now: F + colour**, a temperament per look in motion (breath and blink
   cadence within D77's ranges). Half a day, no art; it adds "personality" in words-only tests but
   nothing in stills, at 24, or under Reduce Motion. It can ship before H and stays after it.
5. **Rejected:** silhouette alone and face alone (read as states), a finish (a skin, and gloss
   breaks D53), a held object tied to the job (reads as the job, 3 of 3, and vanishes at 24), the
   other project's moods (read as character, and lie about state).
6. **If five partners are allowed** (`PARTNERS_MAX` is 4 today), apricot's hue should move further
   from sand whatever is chosen: it was the pair confused in both the five-colour and the H sheets.

## Summary

Ten ways for partners to differ beyond colour were mapped, scored, and tested with cheap composites
of the real clay figure and LLM proxy raters (69 answers, re-run blind after file names leaked).
Colour alone separates the figures but reads as "one character in colourways"; every single
non-colour cue reads as a state, a skin or a job; only body shape and face together, on colour,
read as different characters (3 of 3 at 96, 2 of 3 at 24 in the dark). The similar project's moods
teach liveliness, which Ducter has, and would mislead as identity. Recommendation: shape and face
per look with colour kept, after human raters on real renders; about 24 renders and three days.
The cheap alternative is a per-look temperament in motion, half a day, that only helps while moving.
