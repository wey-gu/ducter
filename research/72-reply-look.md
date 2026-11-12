# 72: How a reply looks: the metaphor pass for 回复 / Reply (D236)

Asked (2026-11-12, the author's brief for GitHub issue #3): "The visual expression must be maxed
out: our style's mechanism, emotional value and distinctive stylization, with matching animation."
AGENTS.md requires the metaphor process before anything is prototyped: at least five genuinely
different candidates including "no metaphor", a mapping table with every false implication, a
rubric, and a comprehension test with naive raters. This note is that pass. The facts about other
apps come from research/71.

Tags: VERIFIED (measured here), DOCUMENTED (research/71's sources), INFERRED.

## 1. The moment, from the user's side

- **Who:** all three. The heavy multi-agent developer has three tasks reporting at once and wants
  to answer the second one, not the latest; the consumer-AI user knows swipe-to-reply from WeChat,
  iMessage and WhatsApp (DOCUMENTED, research/71 §4); the fresh user has never heard of a task and
  only sees bubbles.
- **Before:** "Which one will it think I mean?" They retype context ("关于刚才 TTL 那个…") or give
  up and wait for one thing to finish before raising the next.
- **After:** they point at the message itself, say one line, and the right work moves. Two or
  three replies in a row each land where they belong. Emotional value: 放心 (it can't mix them up)
  and 顺滑 (the thumb already knows the gesture).
- **First time, zero setup:** the gesture is the one their thumb already has; the composer shows
  what they are answering before they type; nothing to learn.

## 2. What the look has to say

Three places: the quote in the composer while writing, the quote on the sent bubble, and the link
back. It has to say, without a label: (a) this answers *that* message, (b) whose words those were,
(c) tap to go back to it. And it must not say: a forwarded message, an attachment, a draft still
being edited, a link preview, a pinned note, or a new thread or branch (a reply never forks
anything, research/71 §5).

## 3. Candidates

| # | Candidate | What it looks like |
|---|---|---|
| A | **No metaphor, beautifully literal** | One muted line outside the bubble, above it: a drawn turn-back arrow and the start of the quoted words (WeChat-like, "回复 Ducter：…" when labelled) |
| B | **Inset quote block** (the messaging convention) | A lighter rounded box inside the top of the bubble with a thick bar on its leading edge, a name, two clipped lines (Telegram, WhatsApp) |
| C | **The imprint** (clay-native) | A small copy of the quoted message's *own bubble* (its voice's colour, its tail) pressed into the reply's clay so it reads sunken, like a pebble pressed into clay and lifted out |
| D | **Stacked pebble** | A smaller copy of the original bubble standing behind and above the reply, peeking out, joined by a thin curve |
| E | **Tether** | A thin drawn line from the reply's corner up to a tiny faded copy of the original (Discord's reply hook) |
| F | **Paper slip** | A torn slip with the quote, clipped to the bubble's corner with a drawn paperclip |
| G | **Half-pressed imprint** | C, but the small bubble sits on the reply's top edge, half pressed in, half standing out |

## 4. Mapping tables

What each part of a candidate maps to, and the false implications it carries.

| # | Maps well | False implications |
|---|---|---|
| A | arrow = "in reply to"; grey = secondary | outside the bubble it can read as a caption of the bubble below or a system line; who said it needs the name in text; at 13pt one line hides most of a CJK quote |
| B | box = "quoted"; bar = "from elsewhere" | voice-neutral: whose words they were only from the name label; a lighter box in an orange bubble reads like an attachment or link preview; generic (every app has it) |
| C | small copy of a bubble = "a message"; its voice's colour and tail = "theirs"; pressed in = "carried inside this one, part of it now" | sunken may read as a field to edit (Ducter's in-place asks are sunken blocks); a bubble inside a bubble can read as nested replies |
| D | standing behind = "came before" | behind implies a stack or thread view (raters: "expands into a thread"); peeks get clipped by the bubble above; fragile at phone width |
| E | line = "connected to" | lines across the gutter tangle with two replies in a row; at 390pt the faded copy has no room; a line is decoration the quiet conversation removed (D104) |
| F | slip = "a note"; clip = "attached" | reads as the user's own note or an attachment, not someone else's earlier words; paper is foreign to clay; the paperclip is a tool glyph Ducter doesn't use |
| G | as C, and standing out = "came in from outside" | the half that stands out reads as a separate tab; harder to keep crisp at every width |

## 5. Rubric

Scored 1–5 by the lead against the brief and D36 (好用 · 顺滑 · 赏心悦目 · 放心 · 惊喜); the raters'
numbers in §6 feed "legibility".

| Criterion | A | B | C | D | E | F | G |
|---|---|---|---|---|---|---|---|
| Legibility without labels (§6) | 4 | 3 | 5 | 4 | 5 | 2 | 5 |
| Mapping fidelity (who, which, tap) | 3 | 3 | 5 | 3 | 4 | 2 | 4 |
| Scale (390pt phone to wide; long and CJK quotes; two replies in a row) | 3 | 5 | 5 | 2 | 1 | 3 | 4 |
| State expressiveness (composing, sent, found, gone) | 2 | 3 | 5 | 3 | 3 | 2 | 4 |
| Emotional fit (clay, warm, quiet) | 3 | 2 | 5 | 4 | 2 | 2 | 4 |
| Distinctiveness | 2 | 1 | 5 | 4 | 2 | 3 | 4 |
| Feasibility (web, iPhone shell, MyGo) | 5 | 5 | 4 | 3 | 2 | 3 | 3 |
| **Total (35)** | 22 | 22 | **34** | 23 | 19 | 17 | 28 |

## 6. Naive-rater comprehension test

Method (VERIFIED, run 2026-11-12): `claude -p --model haiku --no-session-persistence` in a scratch
directory; each candidate described in plain visual words with no label naming its purpose
("Ducter's messages are white bubbles on the left; yours are orange on the right…"); the rater
answers in JSON what it shows and what tapping does; a second haiku call grades against the truth
(meaning 0–2, tap 0–2). Three raters per candidate. A second probe removed the name from B and
asked only whose words the small thing holds (four raters each).

| # | Meaning (/6) | Tap (/6) | "Whose words?" Ducter's (/4), sureness (1–5) | False readings raters gave |
|---|---|---|---|---|
| A | 6 | 6 | 4 · 3.5 | none |
| B | 6 | 6 | **0** · 2.0 | none with the name; without it, nobody could say whose words |
| C | 6 | 6 | 4 · 3.8 | one rater hedged "jump to or expand in place" |
| D | 6 | 5 | 4 · 3.8 | "expands into a thread view"; "the earlier message sits behind" |
| E | 6 | 6 | 4 · 4.5 | none |
| F | 3 | 3 | **0** · 2.8 | "the user's own pinned note"; "a standalone note" |
| G | 6 | 6 | 4 · 3.8 | one rater hedged "expand the quote" |

Reading: the reply convention itself is saturated (every candidate but F reads as a reply; LLM
raters know chat apps, so this is a floor, not a ranking). The discriminating probe is *whose
words*: the conventional inset (B) needs its name label to say it at all, and the slip (F) fails
both. The candidates that keep the original voice's shape and colour (C, D, G) and the tether (E)
say it unlabelled. INFERRED: human raters who don't know the convention would separate them more;
a human pass is in `design/todo.md`.

## 7. Decision

**C, the imprint.** It is the only candidate that is clay-native (Pebble's mechanism is clay: cards
stand on a base, buttons sink, so a quote *pressed in* is our own physics, not a borrowed box),
carries whose words they were without a label (the voice's colour and tail), scales to two replies
in a row and to the composer, and has a natural motion story: the imprint is pressed in when the
reply is sent, and the original is "found" (its own tint deepens once) when the imprint is tapped.
Labels still state the literal thing: the who-line says **Ducter** or **你 / You**.

Its false implications are handled: the imprint is never a field (no caret, never editable, its
cancel is a separate ×), and nesting is impossible (a reply's imprint quotes only the message's
own words, never its imprint).

Motion (tokens in `design/ui.md`): swipe right with the drawn mark easing in (opacity and scale 0.6
→ 1 with the drag), settling with a spring and a light haptic at the arming point (56pt,
research/71's Lorca values); the swiped bubble springs home (`--t-back` 320 ms, `--spring`); the
imprint rises into the composer (`--t-med`, spring); a sent imprint is pressed in (from 5pt above
with a small raised shadow to sunken, `--t-press-in` 260 ms); tap → scroll the original to the
centre and deepen its own tint once (1.4 s, the same "found you" as a decision's flash, never a
glow ring). Under reduced motion nothing moves; the tint still changes.

## Implications for Ducter

- Build the imprint on both clients from tokens (`--r-imprint`, `--imprint-depth`,
  `--imprint-*-on-*`, `--found-*`, `--t-back`, `--t-press-in`).
- The who-line is literal text; the colour and tail are the unlabelled second channel.
- A human comprehension pass (five people who don't use Telegram) before calling it settled.

## Summary

Seven candidates (literal line, inset block, imprint, stacked pebble, tether, paper slip,
half-pressed imprint), each with a mapping table of false implications, a seven-criterion rubric
and a 33-call LLM rater test. Every candidate but the paper slip reads as a reply (6/6); only
those that keep the original's own bubble shape say whose words without a label (the conventional
inset block: 0/4). The imprint scored 34/35 on the rubric and is chosen: a small copy of the
quoted bubble pressed into the reply like a pebble into clay.
