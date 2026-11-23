# 215: How several partners differ at a glance (D497)

The author, with a screenshot of the Mac app on 2026-11-23: the shown partner 多比 is the same orange
clay figure as Ducter; Ducter sits after the counts line as a 28-point face with an orange dot whose
name is only in a tooltip (「换到 Ducter，有 2 个等你」); the counts under 多比 say 「2 个等你」, which
are Ducter's. 「现在这么只能在上边点击切换的是否合理、优雅、用户价值和情绪价值拉满？」

This report runs AGENTS.md's metaphor process for **how one partner is told from another**: the
candidates (with "no metaphor"), a mapping table for each with its false implications, a rubric,
and a naive-rater comprehension test with LLM proxies on rendered bars. Rendered candidates, the
raters' raw answers and the scripts are in `.shots/d497/raters/` (not in git, D75).

## 1. What must be mapped

| Thing in Ducter | Must read as |
|---|---|
| A partner (its own conversation, memory, name) | a different someone, of the same kind and powers |
| The partner shown | the one you're talking to now |
| Another partner with its own asks | someone else who needs you, and how much |
| The figure's states (idle, working, waiting, needs you, done, napping, the blink; D77) | unchanged: the figure is the thing itself |
| The shared world (devices, accounts, On hand) | not split by partner |

## 2. Candidates and their mapping tables

**A. No metaphor (beautifully literal): the same figure, the name always shown.**

| Maps | False implications |
|---|---|
| name = partner | the default's name, "Ducter", is also the app's name: a pill reading "Ducter" reads as the app or an account (raters: 3 of 3) |
| same figure = same kind | same figure also reads as *the same one* |

**B. The stone (D309): the same face on a pale disc of its own colour.**

| Maps | False implications |
|---|---|
| disc colour = partner | a coloured disc behind a face reads as a status or a frame; sand and apricot are near the orange figure, so two partners look alike |
| face kept = same kind | the face, the largest thing, says "the same one" |

**C. Its own clay: the same figure recoloured (a hue turn and a saturation per look).**

| Maps | False implications |
|---|---|
| clay colour = who | a colour can read as a state; mitigated because states are poses, not colours, and the needs-you colour stays on numbers only |
| same figure = same kind and powers | none found: kin, not clones |
| every state recoloured alike | none |

**D. An accessory tied to what it looks after (a clay house on the home partner's head, glasses and a laptop on the work one).**

| Maps | False implications |
|---|---|
| accessory = its part | it only does that part (a partner does anything asked); a part said in the person's words ("读书、跑步和周末的安排") has no single object; one figure with two props reads as **one helper in two roles or states** (raters: 3 of 3) |
| | needs new art per part, and changes when the part changes |

**E. A different clay character per partner (another species).**

| Maps | False implications |
|---|---|
| character = partner | different kinds imply different powers or roles (raters: "different roles or specialties", 2 of 3); needs a full art set per character (six states, the blink) |

**F. An initial pressed into a clay pebble (多, D).**

| Maps | False implications |
|---|---|
| letter = name | reads as an account or the user's own avatar (raters: 3 of 3 "the user's account"); loses the figure and its life |

**G. A coloured ring round the face, or a theme per partner** (D309's review, kept for the record): a ring reads as a state (needs you, working); a theme reads as another app.

## 3. Rubric

Scored 1 (poor) to 5 (strong). Feasibility: with the existing clay art set, no new art.

| | Legible without labels | Mapping fidelity | Scales to 4 | States kept | Emotional fit | Distinct | Feasible now | Total |
|---|---|---|---|---|---|---|---|---|
| A name only | 2 | 3 | 4 | 5 | 2 | 1 | 5 | 22 |
| B stone | 2 | 3 | 4 | 5 | 3 | 2 | 5 | 24 |
| **C own clay** | **5** | **5** | **4** | **5** | **5** | **4** | **5** | **33** |
| D accessory | 3 | 2 | 3 | 4 | 4 | 4 | 1 | 21 |
| E other species | 5 | 3 | 3 | 5 | 5 | 5 | 1 | 27 |
| F initial pebble | 2 | 2 | 4 | 1 | 1 | 2 | 5 | 17 |
| G ring / theme | 2 | 1 | 4 | 3 | 2 | 2 | 4 | 18 |

C with A (the recoloured figure *and* its name beside it) keeps C's glance and A's certainty.

## 4. Comprehension test (LLM proxies)

**Method.** Each candidate rendered as the Mac bar at 760 wide with real content (the shown partner
多比, its counts line, the other partner Ducter with something waiting, the empty conversation's
figure and greeting). Claude haiku, a fresh session per answer, three answers per candidate, the
image read with the Read tool, no word about partners or metaphors in the question: (q1) how many
helpers, same or different; (q2) who you are talking to; (q3) is anything waiting, whose; (q4) what
the thing after the counts does; (q5) what a colour difference means. D and E (no art) were given
as a one-paragraph description instead of an image, a weaker test.

| Candidate | Two different helpers (q1) | Colour read as who, not a state (q5) | Notes |
|---|---|---|---|
| A name only | 0 of 3 | n/a | "Ducter" read as the app, a workspace or the user |
| B stone (before) | 1 of 3 | 0 of 3 | "same character, maybe another instance" |
| C own clay, faces only | 3 of 3 | 2 of 3 | the dot read as unread, whose unknown |
| C + A, name and number | 2 of 3 | n/a | one rater still unsure "Ducter" is a helper |
| D accessory (text) | 0 of 3 | 0 of 3 | "one helper in two roles / a working mode" |
| E other species (text) | 3 of 3 | 0 of 3 | "different roles or specialties" |
| F initial pebble | 0 of 3 | 0 of 3 | "the user's account" |

Every rater, on every candidate that kept the counts line under the shown name, attributed the
needs-you count to the shown partner (e.g. "the 2 items waiting appear to belong to 多比, because the
counts sit under its name").

**Round 2, the built Mac app** (`mac-conv-home-1280-light-zh`, before and after, three answers each):
after, all three named the three partners and read them as different helpers (one hedged that 小家
might be one of the others), all three read the pills as switching to that helper, and two of three
read the pill's number as that partner's own pending count; the bar's 「1 个等你」 was read as the
shown partner's, which it now is. Before, all three hedged on whether the small face was another
helper ("looks like the same orange character, so most likely a second helper or a status marker")
and read the 「4 个等你」 under 小家 as 小家's or "across the app".

Honest limits: LLM proxies, not people; three answers a cell; one language of copy (zh) in the
images; D and E judged from words. Human raters are owed (todo).

## Implications for Ducter

1. Each partner is the same clay figure in its own clay (C), its name always beside it (A). Ducter's
   orange is the default's; the others turn the hue (sage, sky, plum, coral). Every state of the figure
   is recoloured alike, by one table shared by the Mac and the web (`LOOK_CLAY`). The stone is retired.
2. Never a bare face behind a tooltip: the other partners sit in the bar as face, name and their own
   number.
3. The line under a partner's name speaks for that partner; the person's one count stays where the
   person is counted (Dock badge, menu bar, On hand).
4. An accessory per part and an initial pebble are rejected: they read as roles and as accounts.
5. A different character per partner (E) is the stronger later upgrade, but needs a full art set and
   implies different powers; owed through this process with real art and human raters.

## Summary

Seven ways to tell partners apart were mapped and scored; the recoloured clay figure with its name won
on every axis that matters (raters read it as different helpers 3 of 3, the old stone 1 of 3), uses
the existing art at the token level, and keeps every state of the figure. The test also showed the
real cause of the author's confusion: the person-level count under the shown partner's name, read as
that partner's by every rater; D497 moves it.
