# UI: Themes and Tokens

> 2026-11-08 · Style board: https://claude.ai/artifact/8MchNob8LFMSoKsGgX6v1H

## Decision

**Pebble is the default theme.** Volt, Paper, Signal, and Midnight are designed as
alternative themes; only Pebble ships. Pebble has a light and a dark paper: web, iPhone and
the Mac app follow the system's light or dark (the Mac: Settings › Look and sound can pin
浅色 / Light or 深色 / Dark, D302). Every theme is a **token set**; components never hard-code a color, font,
radius, or shadow, so adding or switching a theme is pure data. The same tokens drive the MyGo
desktop UI, the phone web client and the iPhone app's own screens.

## Token schema (every theme fills all of it)

| Group | Tokens |
|---|---|
| color | `bg`, `surface`, `surface-raised`, `ink`, `ink-muted`, `accent`, `on-accent`, `decide` (needs-you), `decide-surface`, `ok`, `ok-surface`, `progress`, `progress-surface`, `user-bubble`, `on-user-bubble`, `partner-bubble`, `on-partner-bubble`, `line` |
| type | `display` family + weight, `body` family, `mono` family, CJK fallbacks; scale `xs…xl` |
| shape | `radius-sm/md/lg/pill`, `bubble-shape` (asymmetric corners), `bubble-join`, `bubble-measure`, avatar shape |
| depth | `shadow-style`: `press` (Pebble: solid offset under), `offset` (Volt: hard drop), `hairline` (Paper/Signal), `glow` (Midnight); plus values |
| motion | `personality`: `bouncy` (Pebble), `snappy` (Volt), `calm` (Paper/Midnight), `stepped` (Signal); durations and easing |
| density | `comfortable` (default) / `compact` |
| mode | each theme declares light/dark variants. Midnight is dark-only. Pebble dark = Pebble shapes and motion on Midnight-like surfaces; web, iPhone and the Mac follow the system's dark mode with it (Mac `theme.PebbleDark`, the web's dark values; a change cross-fades every colour over 360 ms, at once under Reduce Motion; an art asset may have a `_dark` cast, D213, D302) |

## Pebble (default) values

> Restored 2026-11-09 from the approved artifacts (D76–D78). Prototype:
> https://claude.ai/artifact/51djLTYeekc14y1GsP7Wn5.

- color: bg `#FFF6EA`, bg-deep `#FCECD7`, surface `#FFFFFF`, sunken `#F7EBDA`, ink `#2B2118`,
  ink-2 `#4A3D30`, muted `#75654F`, line `#E8D9C4`, line-2 `#E0C9B0`, accent `#FF8A3D` (ledge
  `#C9642A`), decide-surface `#FFE3CF` / ink `#8A3A0C` / ledge `#F0C29E`, ok `#D6F5DC` / `#1F5E2F`,
  fail `#FBDDE4` / `#8A1F3B`, user-bubble `#FF8A3D` with ink, partner-bubble `#FFFFFF` (D129)
- type: Bricolage Grotesque (400/700/800) everywhere in the apps; zh body Noto Sans SC (PingFang
  SC on Apple); zh headings Resource Han Rounded CN Bold (D78); mono JetBrains Mono
- shape: radius 12/14/18 (buttons) · 16 (sheets) · 24 (cards) · 28 (hero cards, composer)
- depth: clay (D76): cards on a solid 4pt base, buttons on a ledge with a drop and a highlight
- motion: bouncy; buttons sink on press; character and scene breathe, status never (D77)

## Persona face

Pebble gives Ducter a face: a rounded pebble with two eyes. It is a state display, not
decoration: it blinks while idle, looks aside while working, nods on done, and raises its
brows when something needs you. Other themes render the same states in their own idiom
(Signal: lights; Midnight: glow pulse; Paper: a ink mark; Volt: a rotated badge).

## Pebble refinements (v2)

- **Semantic state colors** (dot / surface / ink): needs-you `#FF8A3D / #FFE3CF / #8A3A0C`,
  working `#4BA8F0 / #DCEFFF / #174A75`, waiting `#FFC94D / #FFF0BF / #6B5000`, done
  `#7FD99A / #D6F5DC / #1F5E2F`, failed `#E5577A / #FBDDE4 / #8A1F3B`. Each state also differs
  in lightness and shape (waiting = dashed outline), not only in hue.
- **Voices (D129):** a messaging app with one partner. The user's messages are accent bubbles
  (`user-bubble` `#FF8A3D` with ink, 6.9:1); the partner's are soft bubbles (`partner-bubble`:
  white on the paper, `#2A221B` in Pebble dark). Corners `bubble-shape` 20/20/6/20, mirrored
  for the partner (tail bottom-left); a bubble stacked on one of its voice tucks its tail
  side's top corner to `bubble-join` 6. One body size for both (16), at most `bubble-measure`
  ~38em wide. An ask's buttons sit in one compact tray under its bubble, a white card on a 3pt
  clay base. Other structured things (files, summaries) are white cards on the clay base (D76).
- **Task line:** a task in the partner's words is one quiet line: a drawn mark of where it
  stands, its title as a link, its status in muted words. No fill, no capsule, no dot (D69,
  D73).
- **Decision buttons:** primary `Go / 好`, or the action itself in sentence case ("Rebase";
  zh "好，rebase"), as a dark press-down pebble button; secondary `Hold / 先等等` as a light press-down button; tertiary
  `Reply… / 回复…` as a text button. No seals or stamps (D22).

## Components and tokens (canonical; polish pass 2026-11-09)

The rules every screen follows, on the desktop (`apps/desktop/internal/theme`,
`views/components.go`) and the phone (`apps/web/static/app.css`) alike. A new screen uses these
components and tokens; a value not in the scales below needs a token first.

**Scales.**

| Scale | Values | Use |
|---|---|---|
| type | (11, only the reply imprint's who-line, D236) · 12 · 13 · 15 · 16 · 18 · 20 · 28 · 34 · 56; mono 13 (JetBrains Mono) | captions · labels and small controls · body and controls · both bubbles and the composer (D129) · a decision on a phone · card titles and asks · section titles · screen titles and a task's outcome · hero numbers |
| space | 4 · 8 · 12 · 16 · 24 · 32 · 48 (`S1…S7`) | inside a group S2–S3; between groups S4–S5; a screen's sections S6–S7 |
| radius | 8 · 12 · 14 · 16 · 18 · 24 · 28 | inline code, diff boxes · small buttons, fields · buttons · sheets, notices · large buttons · cards · hero cards, the composer |
| controls | 36 · 44 · 52 | chrome and inline lines · cards and the conversation · setup screens and the equip |
| chips | 24 · 28 · 32 (`ChipSM/Chip/ChipLG`) | a state tag · evidence and metadata · a task in the conversation |
| motion | press 70 ms · hover/lift `Snappy` · enter 220 ms (6-pt rise + fade: a Settings panel, a notice) · moving between views by D290's vocabulary (below) · `Bouncy` for the living message and the equip | reduced motion: no movement, colors still change |

**Depth: one clay (D76).** Every solid thing stands on clay; how it stands says what it does.
- A **card** (the living message, the composer, On hand cards, Devices cards, a page's cards)
  rests on a solid 4pt base in `line`: `0 4 0 #E8D9C4`. It never moves or presses. A tinted
  card's base is its own ledge color (needs you: `#F0C29E`). A sheet over the page adds
  `Floating` (0 10 32, ink at 14%). Inline parts (a file list, a diff, a proof line) are flat.
- A **button** stands on a 3pt ledge in a darker shade of its fill, with a soft drop (`0 7 12 −4`,
  ink at 28%) and a 1.5pt inner top highlight; pressed, it sinks (translate 3, ledge 0, drop
  `0 1 3` at 22%, 70 ms). The drop and the highlight are what keep an ink button standing on
  an ink surface, where an ink ledge alone disappears.
- Text buttons (回复… / Reply…, 不用了 / No thanks, 看细节 / Details, 都按默认 / Go on all
  defaults in a section's header) are flat: ink only, a soft tint under them on hover and
  press.
- There are no chips for status, evidence or metadata (D73, "No pills" below).

**Buttons** (one family): primary (ink filled from `#3B2D22` at the top, cream text, highlight cream at 26%, a 1pt rim of `#FFECD6` at 8%, a 1pt warm seam `#5A4434` above a `#140D07` ledge, drop at 38%: an ink ledge alone vanishes),
secondary (cream `#FFF6EA` with a 1pt inner rim of ink at 9%, ledge `#CDAE8C` under a 1pt `#EAD6BC` seam (darker than the paper so it reads as tall as the ink button); on a tinted card
it turns white on the card's ledge deepened 45% toward the state's strong tone, e.g. `#E99A65` on Needs you), accent (orange, ledge `#C9642A` under a 1pt `#FFA466` seam, highlight white at
38%: the composer's send, the equip), text (flat), and icon (a square of any of them). Heights
36 / 44 / 52 with radius 12 / 14 / 18 and type 13 / 15 / 16 (700); the 52 size stands on a 4pt
ledge. The same hover (a shade lighter), press (sink) and keyboard focus ring on all of them.
In a row the primary is last (macOS) and at most one primary shows per group.

**The in-place ask.** An action on a card that changes something outside Ducter asks where it
stands, never in a floating layer: a sunken block on the page's ground (`Bg`, radius 12,
padding 12) with one bold question, one note saying what changes and where, then the secondary
button and a text Cancel (`disconnectConfirm` in `views/devupdate.go`, `.dev-cut` on the phone).
Used by 断开 / Disconnect and by an agent's Nowledge Mem line in its coin detail (D169, `views/memplugin.go`,
`MemAction` in `apps/web/src/devcard.tsx`), drawn through the coin detail's `coinLines` (its line) and `coinActions` (its action) slots; a new action of that kind uses it, not a new control.

**Pictures (D206, `media.md`).** A message's pictures sit in one rounded box (`--r-pics`, the 18
of the radius scale), tiles `--pic-gap` (2) apart, laid out by `gridLayout` (one at its own shape,
2–4 in a grid, "+n" on a `--pic-dim` veil). One picture fits `--pics-w` (~70% of the column) and
`--pics-h` (~a third of the screen). Space is kept from the picture's size; its blurred preview
(else `sunken`) fades to it over `t-med`. The user's stand above their bubble, a task's under the
partner's. A file is a white card on the clay base, one line. The upload ring is white on
`--ring-back`. The viewer lies on the theme's paper (`--viewer-scrim`: Pebble's paper at 97%, the
dark ground at 96%), its controls text buttons in ink; it grows out of the tile and shrinks back,
and only fades under reduced motion. Mac: `Lightbox`, `LightboxInk`, `MediaGap`.
D286: five to nine in rows (2+3, 3+3, a 2:1 banner over 3+3, 2+3+3, 3×3), inner corners
`--r-tile` (4); a picture clears out of its blurred preview (blur, scale 1.04, opacity over
`t-med`); a pressed tile sinks to .965 over `t-press`; a landed picture's ring closes, ticks and
lets go, its tile settles over `t-pop` on `--spring`. A file's badge is a page whose band is the
family's colour, `--fam-{pdf,code,text,doc,sheet,slides,archive,audio,video,picture,other}` with
`--fam-on` for the extension on it (muted clay tints; lighter ones in dark); Mac `Family`,
`FamilyOn`. The viewer's strip slides over `t-med` on `ease`; Remove on a tray tile is a small
surface pebble, never an ink disc.

**Replies: the imprint (D236, research/72).** The message replied to as a small copy of its own
bubble pressed into the reply: `--r-imprint` (14/14/14/4, the partner's tail bottom-left;
`--r-imprint-you` mirrored), debossed by `--imprint-deboss`: the reverse of a raised button, its
shadow under the top and left rims and a lit lower edge, no border line. Its floor sits a little
below the bubble it is pressed into: `--imprint-on-user` (the orange, 10% toward ink),
`--imprint-on-partner` (a partner answer's, pressed into the top of its bubble), `--imprint-on-surface`
(the composer). Quote at 12 (`--xs`) in `--imprint-ink` / `--imprint-ink-on-user`, at most two
lines; who-line at 11 (`--xxs`, a new step below captions, only here), 800. Motion: the swipe mark (the reply pebble at 32,
`--swipe-mark`) eases in with the drag and settles to accent with a spring
at the arming point; the bubble springs home over `--t-back` (320 ms); the composer's imprint
rises in (`--t-med`, spring); a sent imprint is pressed in (`--t-press-in`, 300 ms, from raised
`--imprint-raised` to sunken); found = the original's own tint deepens once (`--found-user`,
`--found-partner`, 1.4 s). The reply mark and × are drawn, never text glyphs. Mac: the same tokens
in `apps/desktop/internal/theme`.

**The reply pebble (D256).** With a mouse, pointing at a message shows one small clay pebble in
the gutter beside it: 30 high, the secondary button's clay at a pebble's size (`--surface`, the
`--hi-secondary` inset light, `--rim`, `--seam-quiet`, the 3 px `--press-quiet` ledge, `--drop`), a
slightly uneven round (16/15/16/14 over 15/16/14/16). 8 px of gutter; its ledge on the message's
bottom line; left of the user's bubble, right of the partner's bubble itself, beside the words under
a message's pictures (pictures alone: beside them), outside a note's card beside a find (the card's
14 inset, then the gutter). It never sits on a bubble's or a card's content; with a mouse a partner
bubble always leaves the room (at most 100% − 44 px). Its mark in `--ink-muted`, `--accent` while
pointed at, when (900 wide and up) it widens away from the message to say **回复 / Reply** at
`--sm` 700 in `--ink`. Motion: it settles in from the bubble's side (6 px, from 0.82, the spring,
380 ms); pressed, it sinks 2 px onto its ledge; none under reduced motion. Touch never shows it.
**The reply mark** is Ducter's own: the drawn chevron (D213) pointing back on a single line that
sweeps back from below, a 16-unit grid at a 1.8 stroke (web `REPLY_PATHS`, Mac `drawReply`), the
same in the pebble, the swipe, the menu, the composer and 回复这段. Mac: `replyButton` (Surface, a
3 pt Line ledge, the Raised shadow softened, `Bouncy`).

**Task lines.** A task line says its title once, then where it stands: the job's status line
when it adds something, else the state (a status line that only repeats the title falls back to
the state). A finished task reads 做完了 / Done: `done?` shows as Done until something actually
checks the result ("在检查 / checking" only while a check runs). In the conversation a task line
lives inside a message's Details (D104); On hand and the opened task show it directly.

**Results (D104; was D73).** The partner's result message already says the outcome in words. In
the conversation, under it: what went out only when something did (a drawn ↗ and the literal
action, "↗ git push -u origin ducter/fix-ci"; never folded), then one quiet row of 13pt text
buttons on the paper: **合进 main / Merge into main** (ink 700) when it is the next step, and
**看细节 / Details ›** (**收起 / Hide** while open). Details opens in place, set in from a 1.5pt
`line` hairline: the line of proof (a drawn ✓, × for a task that didn't work, and plain words per
check; "2 files changed ›" opening the task at its changes; the task's title as a quiet link),
**开草稿 PR / Open draft PR** as a quiet link, and the message's **记下了 / Noted** lines with
**忘掉 / Forget**. The opened task (D74) keeps Merge into main / Open draft PR as clay buttons.
Neither action shows when the task's branch holds nothing its base doesn't: core checks the
branch (commits ahead, uncommitted work) when a done or failed report lands and carries it on the
report (`branch`); unknown keeps them, and the action itself still refuses in words.
No blockquote rule, no label column, no capsules. Full note: `design/quiet-conversation.md`.

**Notices: the app speaking, never the partner.** The partner speaks in 18px on the paper and
in cards; a system notice (the CLI offer, the first-result celebration, a held message) is a
slim strip just above the composer: radius 16, a sunken tint (done: done-surface; alert:
failed-surface), a drawn glyph at its start (no tile), 13/12px text, small (32) buttons at its end.
Something that needs no answer ("ducter now works in Terminal") is a toast instead.

**Shown, not dotted; no pills (anti-slop rule, D69, D73).** No pulsing or glowing status dots,
no decorative identity-color dots, no status that animates on its own (breathing rings, gliding
bars, ticking clocks); only the clay character and scene may breathe (D77). **Status and evidence are never capsules**, on any surface: no state
chip, no evidence chip, no metadata pill, no tag row. State is said in words (in its ink when
it is the exception), evidence is a drawn mark and words, metadata is plain muted text or
lives in Details. On hand needs no state chip: the lane is the state.
- State is shown by the thing itself (D43): the clay art (an awake laptop, the napping one
  under its blanket, a filled or empty slot), the chip's tint and its own words, the face.
- Words appear only for exceptions, plainly ("睡着了 · 醒来就接着做", "连不上 · 2 小时前");
  the normal state says nothing more (an awake worker's line only says what it is, "另一台电脑 ·
  替 Ducter 做事", D84; Ducter's home says "Ducter 在这儿" quietly).
- A state in text is plain text in the state's ink (a failed status line, "Didn't work" on a
  Done row), never a chip and never with a dot in front. Counts are never colored by state: a
  lane's count is in muted ink, and the lane's name says which lane it is.
- A mark is a drawn glyph that means something (✓ done, clock waiting, → under way, a small
  speech bubble for asking you (needs you, and the "asks you first" list), × didn't work or a
  check not met, ↗ went out), in muted ink (or the state's ink for an exception), never on a
  colored tile, never a colored dot. "!" is never a state's mark (it reads as an alarm); it is
  only the glyph of an alert notice (a held message).
- **No emoji, and no symbol the phone can't draw as text (D211).** iOS takes a symbol no text
  font in the stack has from the emoji font, so ↩, ⌄, ⓘ, ✔ and their kind are never UI text, and
  U+FE0E doesn't rescue them (on iOS it draws a box). A mark is a drawn glyph; an "opens more"
  text button ends in the drawn chevron (`Btn chev`); keys use ⌘ ⇧ ⌥ ⌃ ⏎. Only symbols seen drawn
  as text on iOS may appear in words; `scripts/check-glyphs.ts` (in `bun test`) holds the list.
- **One drawn chevron (D213).** Every link, text button or row that opens more ends in the same
  drawn chevron, never a font's › ‹ ⌄: 12 pt, a 1.8 stroke with round ends, in its text's ink (a
  row's in the faint ink), on the text's baseline 3 pt after it; it turns down (90°, 160 ms; none
  under reduced motion) while what it opens is open, and points left for the way back. Web:
  `Chev` (`controls.tsx`, which `Btn chev` uses); Mac: `drawChevron` through `glyph`. A path
  in words ("Settings › Accounts") is prose, not an affordance, and keeps its ›.
- **The agent's coin only where it stands as an object (D213):** 28 pt and up (the who list, the
  switch list, the device tray, Settings › Partner, the account sheet). Smaller, beside a line of
  text (a pill, a meta line, an ask's heading, a quiet line, a row), a sculpted coin reads as an
  emoji; there the agent's name alone says who, in the line's own ink, and where the line has no
  name, nothing stands in for it.
- A small action at the end of a line ("How I know") is a text button like every other one:
  flat, no underline.
- A one-time highlight (a decision found from a notification) deepens the card's own tint;
  it never glows.
- Selection on a card is a 2-point ink hairline (cards are containers: no ledge).
- On the devices stage (D81), every word sits on a small clay tag (a cream card on a 2pt base)
  and no two overlap at 1280 or 900 wide; an ability is labelled by its name only; under an
  island only what is unusual; the accessible name carries the full state. The chosen island
  is shown by brighter foam and an ink hairline on its tag, never a ring round the island.
- The partner's clay face may blink or breathe: it is the thing itself, not a status dot.
- A passed check's ✓ is drawn in the done ink (D76); other marks stay muted.

**Times read like a person says them (D115).** One rule on the desktop and the phone, tested
against the same cases (`packages/protocol/fixtures/when.json`): 今天 18:00 · 明天 9:00 · 周五
9:00 · 12 月 1 日 9:00 · 2027 年 1 月 4 日 / today 18:00 · tomorrow 9:00 · Fri 9:00 · Dec 1, 9:00;
no leading zero on the hour; never 12-01 09:00. A groove's "now" caption sits under Ducter; near
the start it takes the start's place, near the deadline it gives way.

**A keep-going loop shows its goal; a routine shows its next day (D115, legible).** A counted
goal is a row of clay lights lit as its checks pass (`goal_light_on/off`); items a judge counts
use the same lights; when nothing can be counted, Ducter at work and the latest try in one line
(no invented progress picture). A time routine leads with a tear-off clay calendar (`routine_calendar`) showing
the next date big, its cadence in words beside it.

**Time is drawn; words are its caption (D115).** A wait with a deadline is a sunken groove from
when it started to its deadline with the little Ducter on its bench at now. (The routine strip and
the try pebbles were replaced, see above.) No ticking numbers; nothing moves on its
own. Waiting is Ducter's sixth pose (on a bench, looking out) with a small cream bubble holding
the clay thing awaited (PR, cloud, envelope, clock, file; `design/art/assets/alpha/wait_*`).

**A task resting on its own wait (D279).** Its state in the head's meta line is when it comes
back, **21:59 回来 / Back at 21:59**, in the waiting ink with the clock mark. Under the head, the
**watch card**: a 56 ring (a clay disc, its groove `--line-2` at 55%, 8 wide) whose arc in
`--waiting-dot` fills clockwise from the last look (or the arming) to the next, redrawn each
half minute, so it maps to time and nothing else; a bead at the arc's edge breathes once per
`--t-breathe` (3.2 s, scale 1 → 1.3 on `--ease`; Mac `Breathe`), still under reduced motion;
how long is left inside (**45 分 / 45 min**, `--xs` 700). Beside it the rhythm (`--md` 600), then
the looks as pebbles (7, gap 3, at most 12: filled `--waiting-dot` for each wake, hollow
`--line-2` for a look that found nothing yet) and **看了 24 次 · 上次 21:31**. Then **现在就去看一次**
(secondary) and **不用再去看了** (text). When the wait comes true the card turns to the moment for
2.6 s: the ring closes in `--done-dot`, pops on `--spring` over `--t-pop` (560 ms; Mac `Pop`), a
tick draws in `--done-ink`, **等到了，接着做**; under reduced motion it is simply there. A
deadline keeps its groove inside the card. Rows never breathe (D244).

**Keeping your place (D254).** The way back over the composer is a clay pebble, not a pill: the
secondary button's clay (`--surface` fill, `--hi-secondary` inset highlight, `--rim`, `--seam-quiet`,
the `--ledge` of `--press-quiet`) with `--floating`, a slightly uneven radius (21/20/22/19 over
20/22/19/21), the arrow drawn in `--accent` (16, stroke 1.9). Round, 40, when the reader is more
than about a screen up; with news it widens (12 side padding, gap 6) to "{n} 条新消息" at `--sm` 700
in `--ink`, tabular figures. Mac: Surface, a 3pt Line ledge and the Raised shadow, ControlMD high.
Motion: it settles in on `--spring` (420 ms: from 14pt below at 0.86 scale, one overshoot); a new
count eases up 3pt (260 ms); pressed, it sinks 2pt onto its ledge; a new row glides up from below
(smooth scroll; MyGo's Smooth follow); none of it under reduced motion. **新消息 / New messages**:
the time lines' voice (12, centred, 700) in `--accent`, a hairline of the accent at 35% either side.
A code block's **拷贝** sits at its top right (28 high, `--xs` 700, `--ink-muted`, `--surface` on
hover, `--done-ink` once copied); the block's text starts 34 down to leave it room. The message
menu's first line is its time (`--xs`, `--ink-muted`). **选择文字 / Select text** is a sheet over
`--scrim` (`--r-lg`, `--surface`, the menu's ledge), the words at body size with the system's own
selection, **全部拷贝** (secondary) and **完成** (primary) under them.

**Motion: character and scene may breathe; status never blinks (D77).**

| Thing | Idle motion |
|---|---|
| the clay partner | breathes (scale 1.012 × 1.03 from its feet, 3.8 s); blinks (150 ms, every 3–6 s, sometimes twice): the same render with its eyes closed (each eye filled from the clay round it, `tools/art/eyes.py`) shows through an upper lid that comes down and a lower lid that rises late, a crease riding the upper lid's edge; it differs from the open face only inside the lids, so no patch can show. The phone swaps to that closed frame. Reduced motion: no blink |
| an awake device | floats 5pt (5.6 s) |
| a cloud machine | drifts ±4pt (11 s) |
| a sleeping device | its blanket rises and falls (scale-y 1.045 from the bottom, 4.8 s) |
| Ducter's phone asleep in a live view (D248) | the same blanket over the drawn dozing phone (scale-y 1.045 from its bottom, 4.8 s); a live screen that opens again: the held frame, the new stream fading in once (360 ms, an event, not idle motion) |
| an ability that is on (Devices stage) | floats 5pt like an awake device (5.6 s), its own phase |
| the sea and sky (Devices stage) | clouds drift ±16pt (70 s); slow light on the water drifts and fades (11–19 s); repainted at 12 fps |
| parcels on a bridge | cross at a steady 40 scene-points a second, only while a task runs on that device (a state that is true, not decoration); still mode freezes them in place so "working" still reads |
| an AI agent's coin (D183) | working, rocks on its base 5° each way (4.2 s); waiting on you, bobs 2pt (2.6 s); still otherwise. Since D213 no coin stands for a running task (those were the small ones), so every coin shown is still |
| a device that joins | its island rises out of the water (0.55 s), then the device drops on with the equip's squash and sparkles |
| the equip | peel (14%) → arc (50%) → snap (62–69%), 0.82 s, a tock and a 10 ms haptic |
| the title moment (D87) | once per Mac: dawn rises, a 3% push-in with parallax, the eyes open on the tone, the logotype lit by a passing light; see `onboarding.md` |

**Moving between views (D290, research/96).** A move says where you went; it is never waited on.
Tokens (Mac `theme.Nav`; web `:root`): push 380 ms (`--t-push`, `--ease-push`, Mac a spring of 380
ms, bounce 0.08), across 300 ms (`--t-across`), hero 440 ms (`--t-hero` on `--ease-push`, Mac bounce
0.06: a long flight must not overshoot its place), leave 260 ms (`--t-leave`), stagger 22 ms (`--t-stagger`, 8 rows at most), look 620 ms
(`--t-look`, tilt 7°, Mac bounce 0.45); depth 28 · recede 10 · shift 14 · rise 6 (`--nav-*`).

| Move | Mac (toned down) | Phone web | Wide web (the pane) |
|---|---|---|---|
| go deeper (conversation → On hand → task) | page in from 28 pt on the push spring, its fade on a quick ease-out (`EnterDur`); the page left recedes 10, opaque under it | a full push from the trailing edge; the page left recedes a third and dims | the pane's page in from 28px; the one left recedes and fades |
| come back | the reverse | the page left slides off the trailing edge on top | the reverse |
| the card you opened | On hand's row (held on hover or focus) grows into the task's head (`Match` + `Fly`), and the head goes back into it | the row's `.tmain` and the head share `hero` | the same |
| one task to the next (rail, ⌘⇧], j/k) | the task's column alone rises 9 into place; bar and rail stay | the page rises 9 as the old fades | the same |
| a place beside another | page 14 toward its mark; the knob (its own piece under the marks) slides there | — | the knob goes to Devices or Settings while their sheet is over the board |
| the bar | held still against its page (a pose turned back); its words cross-fade | named `bar`: stays, cross-fades | — (two bars) |
| sheets | the New task card springs in (unchanged) | spring up; close back down; drag down from the grab or a top-scrolled sheet (past a quarter or a flick), else spring home | centred: sink 4% and fade |
| Settings pages | panels rise 6 (enter) | a pushed page from the trailing side; the list back from the leading side | the same |
| a list's first paint | On hand's rows rise 6 one after another | the same (CSS, per group) | the same |
| the partner, back at the conversation | glances round (−7°) and settles on a clay wobble | the same (`look-round`) | — |
| edge swipe back | — | from the leading 24px where the browser has none (the app's web view, an installed page, Chrome); the browser's own back never doubled (`hasUAVisualTransition`) | — |

Overshoot only on small objects (the knob on `--spring-soft`, the face), never a page of text or a long flight. Transform and opacity only.
Reduced motion: MyGo fades in place by itself; the web skips view transitions and the CSS stops
every animation; the knob jumps, the face is still. Frames: `.shots/d290/` (Mac tester and headless
Chrome, zh and en); `navmotion_test.go` logs a move's frame time.

Delays are staggered so nothing moves in unison. A device that can't be reached is still and a
little grey. One exception (D87): the title moment's "Press any key" breathes (60–100%, 3.4 s); it
is an invitation, not a status. Status, chips, lines and buttons never animate on their own. Reduced motion: all
of it stops; the equip cross-fades; colors and words are unchanged.

**Chinese typography (D78).** Bricolage sets Latin and digits; Chinese has its own faces and rules.
- Faces: headings (≥ 20, where Latin is 800) Resource Han Rounded CN Bold (OFL 1.1) at 94%
  (`size-adjust`); a native client that can't scale one fallback face sets zh heading sizes one
  step down (34→32, 28→26, 20→19). Body Noto Sans SC (PingFang SC on Apple); controls 700.
  Fallback for headings: Noto Sans SC 800. One token swaps the heading face.
- Letter-spacing on CJK is always 0; Latin tightening (−0.5pt at ≥ 28) applies to Latin runs only.
- Line-height for zh reading text 1.75 (Latin 1.55–1.65); same component, per language.
- A 1/4-em gap between CJK and Latin or digits: written into copy (zh strings have spaces);
  dynamic text (the partner's words, user input, titles) gets it at display time
  (`text-autospace` where supported, else an inserted U+2005); copied text is unchanged.
- Kinsoku: 。，、？！）」』 never start a line, （「『 never end one (`line-break: strict`);
  adjacent punctuation is compressed (`text-spacing-trim`).
- Balanced wrapping (`text-wrap: balance`) is for short headings only (names, screen and
  section titles). A question or an outcome is a sentence: it fills the measure
  (`text-wrap: pretty`), since balancing a long CJK sentence leaves short ragged lines. On a
  phone (≤ 600) a decision's question is set one step down, 18 instead of 20.
- Inline code in a zh line: JetBrains Mono at 0.86em on the same baseline, the same 1/4-em gap,
  short tokens never broken (D73).

**On hand's head and task cards (D287).** The board opens with the partner's figure (76; 56 in the
side pane and on the phone) in the pose for the whole and one sentence beside it (`--lg` 18/600,
the display face, balanced). Working tasks, fresh waits and new results are task cards: `--surface`
on a 2-pt `--line` ledge and a soft drop, radius 20, 14/16 padding, two to a row from 612; the
coin 28, the title `--md` 15/600, two lines of `--sm` 13, the heartbeat foot `--xs` 12/600 in the
state's ink (working bars in `--working-dot`, the wait ring in `--waiting-ink`, done in
`--done-ink`). Washes: working blue and new-result green at the top only; a new result's glow and
one pop on `--spring` for `--t-pop`. Hover lifts 2 pt (`--t-fast`); the keys' card has an accent
outline. The day column (248) is a 2-pt `--line` rule with 10-pt beads.

**On hand cards.** A task's ask is one clay card in the needs-you tint, the same as the ask in
the conversation: the task's title as a small link in the needs-you ink at its top (no solid
colored band), the question, the default and its bar, Reply… · Hold · Go. Working, Waiting
and Done items are the normal card (no dashed outline; a dashed border is not a state). Under
a card, at most one short muted line of where it runs and why ("Codex · MacBook · 你的规则
「后端用 Codex」"); the model, the repo, the branch and the full reason are in the opened task's
Details.

**Conversation rhythm.** Top-aligned (no empty band above a short conversation). 12 between
two things one voice says, 24 where the turn passes; 12 inside a message (text → chip → sheet
→ actions); the composer 24 from the window's edges.

**The shell: one bar for every place (D262).** Every place's top bar has the same anatomy, on the
Mac (`placeBar`, `placeNav` in `views/chrome.go`) and the web (`Top`, `Places` in `views.tsx`,
`FullTop` in `board.tsx`):

| Slot | What goes there | Component |
|---|---|---|
| Left: where you are | **One type size in the bar (D270): 14/600.** The conversation: the partner, two ways in: the face (44) and the name (14/600 ink) open its page, the counts line under it (12 muted, keeping its height while empty) is its own quiet link to On hand, narrowed to what it names when it names one thing; each tints on its own under the pointer. Elsewhere the crumbs (14/600 muted text buttons, `/` faint) and the current one at the same size and weight in full ink, not a button; no line under it (an opened task's agent · state · where is said once, in its head). A page's own large heading lives in its content, never in the bar. A phone's inner page: **‹ 对话 / ‹ Conversation** | `crumb`, `chromeTitle` · `.back`, `.level`, `.trail`, `.here` |
| Right, first: this place's own actions | 新建 / New task (On hand); an opened task's working copy, workbench and ⋯; 铺满 / Full screen | **at most one worded clay button per bar** (D270): the place's primary action (新建), the bar button (secondary clay, 36, a drawn glyph before the word). Every other action is a quiet text or icon button with no ledge until hovered; a view toggle that is open stays pressed in (sunken, no ledge). Spacing alone parts these from the places: no hairline |
| Right, last: the way to the other places | **更新 / Update** only while something waits to update (the accent pebble with its arrow; *n 项更新 / n updates*; 正在更新 while 全部更新 runs; it opens 更新和关于 on the Mac, 你的设备 on the web); then the places as **one segmented control** (D264, D270): a small sunk track (34) holding three drawn marks, each about 28 square: **设备 · 手头的事 · 设置** in that order (a laptop and phone; three things in hand; the gear). **Always the marks alone, at every width**; tooltips and accessible names give the words. The place shown is **the knob** (the card's white raised on a 2-pt clay ledge and a soft drop), its own piece under the marks that slides to the place shown (D290), and does nothing; the others lie flat and tint on hover | `placeSegments`, `knob` · `PlaceSeg` |

One way to the places per screen: wide (the panes side by side) it is in the conversation's bar,
whose 手头的事 is dropped because On hand stands beside it (D176); the side pane's bar holds only
its own actions. A phone has room for **手头的事** (from the conversation) and Settings' drawn
gear, in the same track; 设备 is Settings' first page there (deliberate, see
"Mac and phone" below). A Mac window under 1060 pt cuts an opened task's branch to 18 characters
so the task's name keeps room. The partner's face and name are a second way into Settings › 伙伴
(pointing at either tints the name and says "{name} 的设置"; the face never changes for the
pointer: a face says what the partner is doing, D77, D112); the counts line is never part of that
button (D270).

**The knob (D270).** One look for "chosen", everywhere: the card's white raised on a 2-pt clay
ledge and a soft drop (`knob` on the Mac, `--knob` on the web). The place shown in the bar, the
strip's filter on On hand, the project chosen in the lens column, the row open beside the rail or
under the keys. Never a vertical bar at an edge, for selection or for state. Metadata (model, place, project) is never in the bar: it is in the
task's Details (D74).

**The button set (D262).** Exactly four kinds, and where each may stand:

| Kind | Look | Allowed |
|---|---|---|
| Primary | ink clay | the one decision of a card or sheet (Go, Merge, Update all), last in its row, at most one per group; never in a bar |
| Secondary | cream clay | the other choices of a card or sheet (Hold, Not now); in a bar, **at most one worded one** (the place's primary action, e.g. 新建) and Update, at 36 (D270) |
| Accent | orange clay | send, and the equip; nothing else |
| Quiet text | flat ink, a tint under it on hover | crumbs, Reply…, Details, Cancel, 都按默认; every other action in a bar (branch, 工作台, ⋯, watch, full screen), pressed in while open; the conversation's counts link; never the way to a place |

**Mac and phone (D262).** The same places and the same bar on both, with these deliberate
differences: Settings is a place with a rail on the Mac and a pushed sheet on the phone (D150);
设备 is a place on the Mac and Settings' 你的设备 page on the phone, so a phone's bar has no 设备
button (wide web has it, opening that page); both follow the system's light or dark (D302).

**The first frame is the settled one (D262).** A launch never shows one state and then switches:
the Mac starts in the language it last followed from the person's words (`hints.StartLang`,
`SpokeLang`) and with the partner's name as last shown, its counts line says nothing for the
first second (no 连接中… flash) and keeps its height, and the page does not replay its entrance
when the home says welcome. The web starts in the language it followed last (`ducter.spoke`,
`startLang`), its kept screen (D209) names its language before the first paint, and a first open
with nothing kept shows only the calm ground until the home answers (at most 1.5 s, `settling`).

**Decisions in the conversation (D104; was D73).** The living message has no card. When the
user was away (it came before the window opened and was unread, or while the window was in the
background), a centered 12pt time line "你不在的时候 · 10:40 / While you were away · 10:40". A
task that didn't work is one sentence in the partner's voice with Details; work under way and
waits are not said. Each ask is the partner's words (18, regular), then its default in one 13pt
line in the needs-you ink with Details, then, on the ask whose default comes soonest only, one
36pt row: Reply… (text) · Hold (secondary) · Go-as-the-action (primary, last; zh "好，rebase").
The other open asks gather in one 13pt line, "还有 1 件等你定 › / 1 more waiting on you ›" and
"都按默认 · 2 / Go on all defaults · 2". The count shows only in the header. An answered ask
keeps its question and says the outcome once. Time lines (12pt, centered, muted) stand before
the first message and wherever 15 minutes passed. Short code tokens in a message never break
mid-word; only a long path may wrap.

**The waiting line (D104).** While the user waits on a reply, the clay partner (32pt, working
face, breathing) and one 15pt muted line sit where the reply will land, from the moment of
sending; the line follows the partner's step and a 13pt reassurance joins it past 15 s and
45 s on one step. Words in `design/quiet-conversation.md`. The header no longer says 在想….

### Shared controls (D161)

The author's rule: a card or a settings page shows **only shared controls**; no view styles a
button, switch, chip or row of its own. Each is defined once, per client, and a test fails when a
covered view draws a control any other way (Mac: `TestSharedControlsOnly` in
`apps/desktop/internal/views/shared_controls_test.go`; phone: `apps/web/test/controls.test.ts`).
A new control is added to the set (and to this table) before it is used.

| Control | Mac (`apps/desktop/internal/views`) | Phone (`apps/web/src/controls.tsx`) |
|---|---|---|
| The button family: primary, secondary, accent, text (D76) | `button`, `buttonFor` (`components.go`); `iconButton`, `navButton` | `Btn` |
| A bar button: a place's own action, the way to another place, Update (D262) | `navButton` (`components.go`), `placeNav`, `newTaskButton` (`chrome.go`) | `NavBtn` |
| Quiet text button and link (检查更新, 看日志) | `quietButton`, `quietLink` (`quiet.go`) | `Btn` kind `text` |
| A button that opens a page elsewhere in a new tab (打开 Cloudflare, the sign-in link of 从外面连; D228; as a quiet text link with its chevron, 打开 BotFather, D283) | `button` then `openLink` (`abilities.go`); `quietLink` then `openLink` | `LinkBtn` (kind `text` for the quiet link) |
| Switch | `switchControl` (`shared.go`), inside `switchRow`, `toggleRow` | `Toggle` |
| Segmented choice | `choices` (`partner.go`) | `Seg` |
| Choice row (a theme, Remove's plan) | `selectRow` (`shared.go`) | — |
| A value row's side link (检查更新 and its 正在检查…, 没能更新 ›; D167) | `sideLink` inside `valueRow` (`settings.go`) | the `Versions` line under the device list (`Btn` kind `text`) |
| Disclosure row (素材和致谢) and link row | `disclosureRow` (`shared.go`), `linkRow` (`settings.go`) | — |
| Settings rail tab | `railTab` (`settings.go`) | the pushed-page list |
| Destructive text button (断开这台 MacBook, a connection's 断开) | `dangerText` (`shared.go`) | `DangerButton` |
| ⋯ that opens more in place | `moreButton` (`shared.go`) | `MoreButton` |
| A name renamed in place | `cardName` (`devupdate.go`) | `RenameTitle` |
| An agent's coin in a tray, and the socket | `coinTile`, `socketTile` (`devicecard.go`); `trayToken` (`loadout.go`) | `CoinButton`, `SocketButton` |
| An ability chip with its ⓘ | `abilityChip` (`devicecard.go`) | `Chip` |
| One line in a list of devices | `listRow` (`abilities.go`) | `ListRow` |
| An app a source can read, on the accounts card (D166; the dashed 再连一个 too) | `appTile` (`shared.go`) | `AppTile` |
| A candidate row in 换谁来做 | `candRow` (`shared.go`) | the `cand` row in `SwitchList` |
| A property pill that opens a short list, and that list's rows (New task's where, branch, computer, who, when; D185) | `pill`, `menuRow` (`shared.go`; the list is `listPanel`) | `Pill`, `MenuRow` |
| One short choice in a row of them, the chosen one raised (New task's model and effort under the chosen agent; D202) | `choice` (`shared.go`) | `Choice` |
| A group's name that folds it, with its count (By project; D244) | `foldHead` (`shared.go`) | the folding `Section` in `onhand.tsx` |
| Back to the list | the chrome's crumb | `BackRow` |
| A group's add row: a drawn ＋ in the tile column, title, one line (D273) | `addRow` (`settings_rows.go`) | `AddRow` |
| A destructive action before it is confirmed (停用 OOMOL, 断开 Tuwa, 断开 Telegram; D289): quiet text, the failed ink only under the pointer; it asks in place, and the confirmation is `dangerText` | `quietDanger` (`settings_rows.go`; the ask is `confirmRow`) | `DangerButton` with `quiet` |
| A row that opens more under it, a switch apart at its right edge (a source's service, a setup's step; D289) | `openRow` (`settings_rows.go`) | `OpenRow` |
| A row that goes elsewhere with its tile in the tile column (AI accounts → Devices with the agents' coins; D296) | `tileLinkRow` (`settings_rows.go`) | the phone's Settings list rows |
| The one switch alone at a row's right edge, its words the row's own (Memory's head row, D295; 用我的声音打, D296) | `switchControl` inside the row's control | `Switch` |
| The drawn chevron of anything that opens more (D213) | `drawChevron` through `glyph` (`quiet.go`) | `Chev` |
| A group of separate facts, spaced, wrapping (D291) | `facts` (`facts.go`) | `Facts` |

### No joined text (D291)

The author, on the Mac's device cards ("iPhone · Ducter", "14 小时前" under it): "不能有这样的文本拼接的
UI 设计". A line built by gluing facts together with a separator ("连不上 · 最后在线 3 小时前",
`[harness, model, effort].join(" · ")`) hands the reader a string to take apart again, and it reads
as a database row, not as a partner talking. **The UI never encodes structure by joining strings
with a separator.** Each fact is its own element with its own role:

| The fact | Its element | Example |
|---|---|---|
| The thing's name | The title, alone. Never a kind or brand appended to it | iPhone (not "iPhone · Ducter") |
| What it is doing, said | One secondary line, only when it reads as a natural phrase or sentence in the partner's voice | 14 小时前在线 / Online 14 hours ago; 在 hel 上跑 / Running on hel |
| State | A state word in its color with its dot, its own element (`StateTag`, a dot) | 连不上 / Can't reach in the failed ink |
| A count or a time | Its own muted element, right-aligned in a row or after the line, tabular figures | 3 件 / 3; 21:59 |
| A kind | The icon or the art (a device's art already says it is the Ducter app) | the iPad art, no "Ducter app" words |
| A group of metadata | Separate small elements spaced by a gap token (`facts` / `Facts`, S3), free to wrap | Claude Code  Opus  深入 |
| Provenance, a source | A quiet chip or a small label of its own | 经过 oo |
| A plain-text surface (a push, a notification, a copied or shared line, a toast) | One natural sentence | 修好了 compaction 测试，连跑 50 遍全过。 |
| An accessible name (aria-label, a Mac control's Label) | Spoken: the facts read as a list aloud, "，" / ", " (`spoken`) | 打开，iPhone，14 小时前在线 |

Decide case by case which of these a line needs; never swap "·" for another glyph, a slash, "|",
or "，" and call it done. A secondary line that would need two clauses usually means one of them
is a state (a dot) or a time (its own element), or should not be there at all.

Allowed, because they are typography, not joiners: an en dash in a range (23:03–23:04, 3–5 次);
"/" inside a path or a name the world spells that way; a separator inside a third party's own
name or a quoted string the person wrote. Out of scope: the CLI's terminal output
(`packages/cli`), logs and exported debug text, the site's page titles, the partner's own
messages (model-written), and words only a model reads (a tool result, a brief). The guard is
`scripts/check-joins.ts` (`scripts/joins.test.ts` runs it in every test run): it fails on a
separator in any client's words or view code, the protocol and core words that reach a screen
or a push, with a short, commented allowlist.

Devices are named by their model ("iPhone", "iPad", "Pixel Fold"); the platform (`ios-app`,
`android-app`) says it is the app. Names paired before D291 ("iPad · Ducter") are renamed once by
the core (the old name kept as a former name, D84) and shown without the suffix by both clients.

## Places (D71)

v1 has five places, and every one is reachable from the menu bar, a shortcut and the window:

| Place | Reach it | What it is for |
|---|---|---|
| 对话 / Conversation | ⌘1, Esc from any other place | Home: talk, decide, see results |
| 手头的事 / On hand | ⌘2, 手头的事 at the end of every bar (D262) | Every task and what waits for you |
| 设备 / Devices | ⌘3, 设备 (the clay device) at the end of every bar | The setup surface: devices, what they can do, AI accounts (sign in, install, sign out on this Mac), Connect a phone or computer |
| 伙伴 / Partner | ⌘4, the partner's own face and name | Settings' first tab (D150), below |
| 设置 / Settings | ⌘, Settings… in the app menu and the menu bar extra, and **设置** at the end of every bar (D262) | One place for everything you can set (D150), below; an update waiting is **更新** in every bar |

An opened task is the third zoom level under On hand. The **menu bar extra** (the clay partner)
is the handheld moment and the glance (D306): its mark is quiet (the pebble, a template), at work
(its eyes look down, still a template) or needs you (the pebble in the bar's ink and a soft clay
dot in the accent at its shoulder, drawn for a light or dark bar; never a number, never red). Its
menu opens with On hand's one sentence, lists what needs you, each with Go / Hold / Reply… / Open
the Task, then Open Ducter, Settings…, Don't Show in the Menu Bar (back from Settings › Look and
sound). On the phone (D306) one thing the person chose, or a live call, shows on the iPhone's Lock
Screen and Dynamic Island (`apps/ios/LiveShared/Glance.swift`: the same pebble mark at 34 on the
card, 18 compact, 16 minimal; the paper, the ink and the accent from Pebble) and in Android's
notification shade (the pebble as a one-colour icon).

**Settings (D150).** A game's settings menu. On the left a rail (264 wide, on the chrome's cream
with a hairline) of chunky clay tabs, 56 tall, radius 16: each the clay thing it is about at 40
(the partner's face; `wait_clock`; `wait_mail`; Pebble's paper, accent and ink as three clay
pebbles; `mini_awake`; an arrow up on an accent pebble) and its name 15/700. The tab shown is a
white surface on the card's 4pt base in ink 800 (D296: the knob, its own piece under the tabs,
sliding from the tab left to the tab shown on `Nav.Across`, as the places' knob does, D290); the
others lie flat in soft ink, tinted and on a 2pt base under the pointer, and sink while pressed.
A pane comes in with a short rise (12) from the side the knob came from: down the rail from
below, up the rail from above (`paneEnter`); from another place, the route's own entrance. The build number sits at the rail's foot in
12 muted. On the right one section at a time (max 820, centered): **伙伴 / Partner** · **通知 /
Notifications** · **账号 / Accounts** · **外观和声音 / Look and sound** · **在哪儿运行 / Where it
runs** · **更新和关于 / Updates and about**. Deep links land on their tab: ⌘4 and the partner's face
on Partner, About Ducter and the update line on Updates and about (whose update block is one
slot, `updateSection`).

One vocabulary on every tab:
- **Type:** the tab's name 28 heading (or the hero card's name), a one-line lede 15 muted; a
  section's header 13/700 `ink-soft` on the text edge (D289, as D273 set for the phone; it was a
  20 heading on the paper), its note 13 muted; a row's label 15/700; its helper 13 muted (zh
  1.75); captions 12. 8 from a header to its group, 24 between sections.
- **The grid (D289, `settings_rows.go`):** two edges only, the card's and the text edge 24 in;
  one row anatomy (the 40 tile column, the title, one muted line, the control at the right edge):
  `headRow` (a group that is one thing: its tile, its name 18/800, how it stands in the state's
  ink), `tileRow`, `openRow` (opens more under it; a switch apart at its right), `textBlock`
  (what a row opened, on the text column), `addRow`, `footRow` (the group's quiet note and quiet
  actions) and `confirmRow` (a destructive action asking in place; before that it is
  `quietDanger`). Art lives small in the tile column or in an empty state, never as a hero
  inside a group. **Accounts** (D289): 发现了就说 as a section; under 它能看的 one group per
  source (the connection, a row per app and account with whether Ducter reads it and its switch,
  the add row, the last line); 再连一个账号服务 as an add row; under 打电话 Tuwa, its offer and
  用你自己的号码打 as groups in the same flow; the AI accounts row last (D296: the agents' three
  coins in the tile column, the title **AI 账号 / AI accounts**, where they sign in as its line).
  A service row says its state only where it differs from its source's first row (D296,
  `settings.md`): the switch says the rest.
- **The partner's word after a change (D296, `saidLine` / `Said`):** where a change has a
  consequence the control doesn't show (quiet hours, the default wait, a service's watch
  switch), one line in the partner's voice under the group on the text edge: a 12 clay pebble on
  the done ink popping in on Bouncy's spring, the line in the soft ink rising 4; gone after 4 s;
  never a toast. `settings.md` has the words.
- **Groups:** the header on the paper, then a white card (radius 24, the 4pt clay base) of rows.
  A row is 68 high at least, padded 16 × 24, its label and one-line helper on the left and the
  control at the right end: a switch, a segmented control, a small secondary button, or a ›
  (a link row: the whole row is the button; ↗ for a page outside the app). A 1pt `line-soft`
  hairline, set in 24 from the card's sides, between rows.
- **Actions:** a card's primary (clay) buttons sit at the right end of its last line; a quiet
  text button (Cancel, Add one with an address and key) at the left of the same line. Remove
  Ducter is a quiet text button after the last group, never centered.
- **Partner:** one calm clay header (the partner at 112, its name 34 with Rename, one line "住在
  hel 上，用 Codex 想事情"; with a model, "用 Claude Code 的 Opus 想事情", D296), then the tray titled **{device} 上的 AI agent**, What it thinks with
  (the clay well holding the token; the token flies into it on Switch), Who does the tasks, How it
  talks, On its own or asks you first (two lists side by side in one card). Single column; the faces strip is gone.
- **Memory** (D257; D295 on D289's grid; its mark the partner's own blue notebook, drawn in clay from `--notebook-*` / `Tokens.Notebook`):
  one group (the notebook in the tile column, **{name} 记得你**, **这周新记了 N 条** in the done ink, the switch at
  the right edge, its foot what the switch does); **这周记下的** and **更早记下的** as sections (an accent pebble
  in the tile column, the title, its age, a quiet **忘掉** that asks in place; the last foot Mem's count and
  **去 Nowledge Mem 看**); **你别的 AI 记下的** (the tool's coin or letter, the title, **{tool} 记的**, its age at
  the right; read-only); **Nowledge Mem** as one group (its letter on a notebook-blue pebble, **已连上**, **记在哪儿**,
  **它的名字**, an update as a row, the raw facts behind **详情**, the version as the foot). Before Mem: the partner
  small on the paper (an empty state), then one group with the two setup steps. `design/memory.md`.
- **Chat apps / 聊天软件** (D276; D283): its rail mark is clay art like its neighbours, two puffy
  clay speech bubbles, a cream one behind and a sky one in front with three ink dots
  (`set_chats`, made like `set_autofill`: `design/art/assets/batch_chats.json`, cut with
  `tools/cut.swift`; Mac `art/clay/set_chats@256.png`, web `art/set_chats.webp`). The page is D273's
  grid: the lede, then one raised group per chat app (Telegram, Slack, iMessage), whose first row is
  the app (a letter pebble in a palette tint, the name 18/800 heading, its state 13 in the state's
  ink), never a title on the paper above it; a setup's steps carry a 26 sunken step mark centred in
  the tile column and one 15 sentence on the text column, with a mono chip, a quiet link or a field
  (label 13/700 over a white input with a hairline) under it; the last line is the privacy note
  (13 muted) and the group's one button at the right edge. `design/channels.md` §6.
- **Connected AI agents / 连上的 AI agent** (D257, named by D273; D295 on D289's grid; two of the person's agents'
  coins): the lede, then one group (two coins in the tile column; **你的 AI agent 能找到 {name}** · **已连上**; **它的身份**,
  **在哪儿** in plain words; **谁能找到 {name}** with its choice under its words; the foot's quiet **详情** (the raw
  identity and space id) and quiet **断开** asking in place), then **它记住的规矩** as a section. Shown once it means
  something (J6).
- **Look and sound** opens on a preview stage: the partner, one message of yours and its answer
  in this window's language, and Details folded or shown as set. The partner smiles (its done
  face, cross-faded) for 1.6 s after any choice there, and while **试听 / Play** plays the
  intro's sound (stopped after 5 s). Reduced motion: the face still changes, nothing moves.
- **The phone** shows the same sections as a list (a card of rows: the clay thing at 40, the
  name, a helper, ›) under a partner card; a tap pushes the section (a 24pt slide from the right,
  280 ms; none under reduced motion) with **‹ 设置** to go back. Its fourth section is **这台手机 /
  This phone** (language, Details); its Notifications page also holds this phone's own push.
  `#settings=<section>` deep-links a page.
- **A pushed page on the phone keeps the list's discipline (D273).** Two edges only: the page edge
  (‹ 设置, the title, every group) and the text edge one row inset (16) in: section headers (13/700
  `ink-soft`, not the 20 heading), notes and ledes (13 muted), and every row's 40 icon tile and
  words. One row anatomy everywhere: an optional 40 tile (clay art, a coin, a letter pebble, or an
  add row's drawn ＋ with no tile under it), the title 15/700, one muted line, the control or › at
  the right edge. The rows of one section sit in one raised group (radius 24, the clay base) with
  `line-soft` hairlines; a switch alone is its own one-row group; never a card inside a card, never
  a centred poster (a source, 打电话 and 用你自己的号码打 show their art in the tile column, name and
  line beside it, actions at the right). Rhythm: 8 within a section, 24 between sections. A
  composer's attach button is the drawn paperclip (D273), the picture mark only where it means a
  picture.

Screenshots: `.shots/settings/` (desktop 1280 every tab zh/en, the Partner tab on a Mac and on a
Codex-only server; phone 390 every page light/dark).

**Switching what it thinks with** (D89) is the one game moment on Partner: Switch lifts the
tray tokens that can go in (the others step back and say why: Install first, Pick a model
first, Coming later), a tap flies the token into the socket with the equip's lift → arc →
tock (`research/26`; reduced motion: a cross-fade), then one line: "{name} thinks with {agent}
now". Nothing blinks; only the partner breathes.

**Languages (D292).** The interface language is a BCP 47 tag resolved to a table through a
fallback chain (zh-TW → zh-Hant → zh → en; ko → en), so a system set to Korean shows English words,
never a key; only zh and en have tables and only they are offered. A task's report, summary and
proof labels are shown against that task's own language (then the conversation's), never the
interface's alone. Every bubble with the person's or the partner's words carries `dir="auto"`, and
list indents use logical properties, so Arabic and Hebrew read right to left in a left-to-right
app. The reply-language choice lists languages by their own names (한국어, Español), never
translated.

**Choices** (talk language, interface language, the default wait) are a segmented clay control
(D76): a sunken track (`#F3E6D3`, radius 16, 4pt inset), the chosen one a white surface on a 2pt
`#E0C9B0` base in ink 700, the others muted 500; switches are the platform's. The options
share the track equally while every label fits on one line; when they don't (a 320 phone, the
longer language), the control stacks its options one per row, under its label, and a label longer
than its row wraps inside it. Nothing ever spills out of the track. A page's cards
stand on the card base; an
empty list (no noted lines) is left out with its heading. Screenshots:
`.shots/ia-2026-11-09/` (native zh/en, full-length headless, the phone sheet).

**Wide screens: the phone client on an iPad (D176).** The phone client lays itself out from the
width it has, never the device or orientation, and changes in place. Under 1000 CSS px it is
the phone's one column (at most 640): a phone, iPad Split View's thirds, halves and two-thirds,
an 11" iPad upright, both displays of iPhone Duo. From 1000 (an iPad held across, a 13" iPad
upright, a wide window) it is two panes: the conversation on the left at its 720 measure, and on
a 1pt `line` hairline the side pane (40% of the width, 400–560: the width On hand and the opened
task were drawn for) showing On hand, or the task opened from it. The side pane's header names
the level (14/600, the bar's one size, D270) with the bar button **＋ 新建** (D262); an opened task's crumb there is
**‹ 手头的事 / On hand**. The conversation's header drops its On hand button; the face lives
only in the conversation's header. Sheets from 700 × 640 stand centered as a card (radius 24 all
round, no grab). Keys as on the Mac (⌘N, ⌘1–⌘4, ⌘,, ⌘K, Esc), in the iPad app's menu bar.
Screens: `.shots/ipad/`.

**The whole screen, as the Mac shows it (D184).** The two panes stay the default. At the right
end of the side pane's header a 44-point button with two arrows out (**铺满 / Full screen**) takes
the level shown to the whole screen; there the same button with the arrows in (**放回对话旁边 /
Back beside the conversation**) brings it back, and so do ⌘2 (a toggle for On hand), the crumb
**对话** and Esc (one level up: a whole-screen task goes to the whole-screen On hand). On hand at
the whole screen is the Mac's On hand: a 60-high header on the chrome's hairline with the crumbs
(14/600 muted, `/` faint, the current one 14/600 ink; D270) and **新建** (the bar button, `NavBtn`, D262), then
the one list (D216, below) on one 760 reading column. An opened task at the whole screen keeps its page on
the 720 measure under the crumbs **对话 / 手头的事 / {task}**; **暂停 / 取消任务** are in its foot
(D210, D213, D212); from 1120 CSS px On hand stands beside it as a rail (`clamp(300px, 22vw,
340px)`, D244), and all three (rail, task, workbench) from 1560; narrower with the workbench open,
the workbench takes the rail's place (task | workbench, Lody's two-slot rule). The move between
them is one view transition (`level` and `conv`, 320 ms, `--ease`; none under reduced motion). On
a book fold On hand never takes the whole screen (the book is conversation | On hand); a task
opened at the whole screen stands in the second half with the rail in the first, nothing across
the fold (D244, D252); a tabletop offers neither. Screens:
`.shots/onhand-wide/` (D184), `.shots/onhand-redesign/` (D216), `.shots/onhand-rail/` (D244).

**On hand beside the opened task (D244), on the Mac and the web.** The rail is not web-only (D216
built it for the web alone; the Mac's opened task used to replace the window). The Mac
(`task.go`, `onhandrail.go`): under the window's header (crumbs and the task's actions stay full
width), **rail | task | workbench (520)**: the rail `clamp(22% of the window, 300, 340)` pt on
`bg-deep` with no hairline, from 1100 pt; all three from 1560; narrower with the workbench open,
task | workbench; under 1100 the task alone. It stands beside any opened task when there is room;
with no task open On hand stays the 760 list. Rail and workbench slide their widths (260 ms,
Pebble's ease; snap under reduced motion). **⌘⇧] / ⌘⇧[** (the View menu's **下一件事 / Next
Task** · **上一件事 / Previous Task**) open the next and previous task in the rail's order from
anywhere, the composer included; j/k when no field has the keys. **The rail row** is D216's
two-line row, narrower (13/16 padding; no branch, computer or agent on line two). Line one ends
in **one status place**, needs you > working > new result: the partner's own clay face at 24 pt,
still (needs you: the raised flag; working: reading; new result: the done face, the flag for one
that didn't work). An active row shows only its title and face; a resting row its `+a −d` and
time (Draft PR stays off the narrow rail). The rows lie flat on the rail's ground; the task open beside it is the knob (D270). Elsewhere (the 760 list,
beside the conversation, the phone) only **新结果 / New result** takes the place, before the
time, and that row does not recede. **The handover:** a row seen working that turns into a new
result plays once: the reading face sinks 5pt and fades as the done face pops from 0.55 on a
back-out curve (about 560 ms); under reduced motion a cross-fade only. **Folded groups:** By
project's groups fold from their name (a drawn chevron); a folded group carries its most urgent
task's face, its counts on hover (**1 件等你 · 2 件在做 · 3 个新结果**).

**On hand is one list (D216).** The phone, the pane beside the conversation, the whole screen and
the rail draw the same rows (`apps/web/src/onhand.tsx`, `apps/desktop/internal/views/onhandlist.go`).
Sections small and quiet (D270): 12/600 muted, the count 12/500 faint; what needs you is its
decision card, answered in place (in the rail, a row); every other section's rows **lie flat on
the ground** (no card around them), 2 apart, each at least 58 high (54 in the rail) with radius
16, so the list reads as one even rhythm. A row is two lines, 8/14 padding: the title 14/500
(settled: 400 at 70% ink), then on the right `+a −d` (mono 12, the done and failed inks), **草稿 PR
/ 已合并** (12/700 soft), the state word only by project (12/700, needs and failed inks), the time
(12 muted, tabular); line two one muted line at 12: the step's drawn mark (14, the transcript's)
and what is happening now in words, the command in mono 12 muted, then on wide where (project,
computer; 12 muted). State is said by the small glyph or face, never a bar. Waiting rows lead with
their wait bubble and carry the groove; a keep-going loop its lights. Hover (pointer) is a faint
ink tint (4%) and puts the one next step in the time's place. The row the keys are on, and the
task open beside the rail: **the knob** (D270); selected for many at once: `working-surface`.
The strip of counts over the list (D261, D270) is a small sunk track (as the places are) of four
cells, each a calm numeral (14/600, tabular; what needs you in its ink) and its state's name
(13/500 muted) on one line; a zero is faint and does nothing; the filter chosen is the knob. The
partner's calm sentence over it keeps its voice (15, soft ink); **接下来 / Next** is one quiet
12 line.
Find is a 40-high `sunken` field (radius 12, a drawn lens) beside **按状态 · 按项目** (`Seg`). The
bulk bar is a raised white card (radius 24, `floating` + base) stuck to the list's foot, rising
8pt in 200 ms. The switcher (⌘O) is a white card (radius 28) 10vh from the top, at most 640 wide:
a 18 field, then rows (15/700 title, the project · branch in mono 12, the state word), the chosen
one on `sunken`.

**At a foldable's fold (D182).** A fold in view splits the panes at the fold, at any width: held
like a book (the fold top to bottom, flat or half-open, each side ≥ 320 CSS px) the conversation
runs from the left edge to the fold and On hand or the task from the fold to the right; stood up
half-open (tabletop) the conversation sits above the fold and On hand below it, at the
conversation's 720 measure. A hinge's width stays empty; each pane keeps only the insets of its
outer edges (`data-split`, `--fold-a`, `--fold-gap`; `apps/web/src/fold.ts`). Flat with the fold
across, and folded, it is one column. The Android app's own screens follow the rule: the connect
screen spreads partner | form across the two halves, connecting and can't-reach keep to the first
half, an update card stands in the half past the fold. Screens: `.shots/android/`.

**The home older than the app (D200).** The iPhone/iPad and Android apps' one native line over
the page, at the bottom in the Android update card's form (surface, hairline rim, the clay Quiet
and Primary buttons side by side: **知道了 · 去更新**), one phone-wide column (≤ 520) on an iPad;
it slides up once and goes with either button. Simulator shot: `.shots/d200/`.

## Three zoom levels (Core UI canvas: https://claude.ai/artifact/U9r15Tpm8AL7aGQZwrtbDL)

1. **The conversation** (default). One partner, no machinery: its words, and one quiet row
   (Merge into main, Details) under a message with something behind it (D104). The header line
   says in words what needs you and what is being worked on, and **手头的事 / On hand** is a plain
   button. The ask due soonest carries Go / Hold / Reply in one small row, so most days the user
   never leaves this view.
2. **手头的事 / On hand** (overview for decisions, all personas).
   - The top is one quiet line, **接下来 / Next**, only when more than one thing is coming
     (defaults taking effect, waits coming due; D127). The sections' names carry the counts.
   - Below it is one list (D216): **等你 / Needs you** (wide decision cards read at one glance,
     D127: the task's short title with the drawn chevron (no coin, D213), one question, the default as a small
     timer and one caption, Reply… · Hold · a short Go), then **在做 / Working**, **在等 / Waiting**
     and **今天做完 / Done today**, each one card of two-line rows saying what the task is doing
     now, its question, what it waits for, or its result.
   - By state, or by project from two projects. Find from ten tasks; keys, hover actions,
     selection and the rail where there is a keyboard, a pointer and room. "Go on all defaults"
     is a text button at the end of the Needs you section's name.
   - On mobile, decisions are a swipeable stack: swipe left takes the default, swipe right
     means later.
   - Routines appear as one card each, with the next firing time.
3. **An opened task** (conductor depth; D74, D90). One centered column on the reading measure
   (D268: 640 pt on the Mac, 40 em on the web, head, transcript, changes and composer alike), read top to bottom; the window's header is the breadcrumb and the title only.
   1. **The head is one block** (D90): the state face (96 pt) beside one quiet meta line
      (D152): the state in its ink, the task's one clock once finished ("用了 18 分钟 / took 18
      min"; while it works the clock ticks on the working line, D268), the agent and the model (no coin, D213), where
      (repo · branch, a folder, "在 hel 上 / on hel" for another machine; nothing for no
      place), and **换谁来做 / Switch who does it** with the drawn chevron as a small action; a group that wraps to a new line never starts with "·"; then a headline that is always there (D152: the task's short title, or where a browser or a wait stands; never the agent's latest sentence, which the transcript says): before D152, while it works, what it is doing now in a
      sentence (why it waits, its latest report, its latest saved progress, else its title)
      at 28/800; finished, the outcome at 34/800. No link chain in the head.
   2. A pending ask, as in the conversation; **换谁来做 / Switch who does it** opens here as
      a card (D89): who does it now, the top three others with why and the limit each, the
      ones that can't greyed with why, then Continue on X.
   3. The outcome, said once: the report in the partner's size, the line of proof, what went
      out, then Merge / Open draft PR (Try again for one that didn't work). It replaces the
      result banner and the "Told Ducter · done" card.
   4. **The conversation with the agent, turn by turn** (D210, after D152; no heading), turns
      24 apart. A turn opens with what was said to the agent: the brief **你交给它的事 / What you
      asked** on a quiet sunken card (Surface Sunken, radius MD, no base), SM, three lines until
      **展开 / Show all**, a hidden key saying **隐藏了一段密钥 / A key is hidden** with a small
      drawn key; your words as your bubble (the user's Go too); the partner's passed-on words
      on the same sunken card under **{name} 对它说**. Pictures in a turn stay small (about 15
      rem / 240 pt). Then the agent's answer in order, items 12 apart (D268): its messages and
      saved progress (said once, a small flag and **保存了进度 / Progress saved**) at 14, leading
      1.6, or 1.75 when the text holds Han, autospaced (paragraphs 10 apart, list items 4, h1/h2
      body+3/body+1 at 600, inline code a step down in mono on a faint fill, code blocks radius
      8), and between them **each run of steps as one summary line**: the tally in at most two
      phrases by priority, then the rest counted (**看了 9 个文件，跑了 2 条命令，还做了 3 件别的 /
      Read 9 files, ran 2 commands, and 3 other things**; a service by its name, **用了 GitHub 9 次
      / Used GitHub 9 times**); a single step keeps its own line. A step line: min 24, gap 6,
      a 16 glyph in muted ink, the words at 13 in InkSoft, its subject (command, path) in mono
      in ink, an edit's **+n** / **−n**, ×n, a 12 chevron in Faint only when it opens; 2 between
      step lines, padding 1/6 bleeding past the column so a hover reads as a row. While the
      run is live its line shows only its latest step in the present tense (**正在跑 bun test /
      Running bun test**) with an 11 spinner. Opened, its steps indented 22, scrolling past 288.
      A failure, a subagent and thinking stand alone: a failure with a small × and **出错 /
      Error** in secondary ink, its words under it at 13 soft ink (**GitHub 找不到这个文件（404）**),
      never red mono; a subagent **交给一个子 agent：{what}** with a check and how long; thinking
      **想了 4 秒 / Thought for 4s**, opening to its headings at 13/1.5 muted. The plan is one card
      (Surface, a LineSoft hairline, radius MD): an empty ring, a dashed accent ring, a check
      (done faded), **计划 · n/m 完成**. A compaction or an interruption is a hairline with an 11
      label. A step whose output says nothing doesn't open. Opened, a step shows `$ command` and
      its output on Sunken (mono 12, radius 8, 12 lines then **还有 n 行 / n more lines**), an
      edit its diff on Sunken: put-in lines on the done surface in the done ink, taken-out lines
      on the failed surface in the failed ink, context plain, "@@ path" headers bold muted, ⋯
      between hunks. A finished turn folds its work under **做了 3 分 12 秒 › / Worked for 3m 12s
      ›** (13 muted over a hairline), keeping its last words; the live one never folds. While it
      works, the transcript ends on the working line: what it is on at 13 with a light sweeping
      across it, the turn's clock right-aligned in tabular figures. A queued message is a dashed
      outline, no fill, muted words, **排队中 / Queued**. Every turn is drawn (D271: the Mac
      builds only the turns near the view; the web skips settled turns off screen).
   6. **改动 / Changes**: the changed files, each with +added −removed; a file opens its diff
      in place, full width, under a quiet header. No diff shows by default; a task in no repo,
      or with nothing changed yet, has no section (D127). The phone names the changes in the proof line and shows no diff.
   7. **发出去的 / Sent out**, only when something went out, and a wait's **怎么判断的 / How it
      checks**, only when there is a wait. No Details table (D152).

   Type and rhythm (D90): section headings 18/800, one step above the 15 body; gaps 8 / 16 /
   24 / 32; a headline or paragraph at most about 68 Latin or 36 Chinese characters a line
   (D78 Chinese rules: leading 1.75, no tracking).
   The box to talk to the task stays at the bottom of the window, as the conversation's
   composer does, on the same 640 measure (D268); a pending ask sits over it (D152). While it
   works, a square **暂停 / Pause** button sits beside Send, ⌥↩ or **做完再说 / After this** queues
   the words, and under the box **它会在下一步读到 / It reads this at its next step** with **⌥↩
   做完再说** faint at the right. Over it, **the foot** says only the moment (D268): Esc once,
   **再按一次 Esc 就暂停** with **继续** and **暂停**; over to you, **等你回复** in the needs ink and
   the hint muted. Where it is at is the working line at the transcript's end. A task that works or waits on you opens
   at its latest, a finished one at its head; while it works a reader at the end follows the
   newest step, one who scrolled up gets **回到最新 / Jump to latest**, a 40 pt round raised
   button (Surface, the floating shadow) centred over the transcript's foot. D271: the Mac's
   page is one `ui.List` (MyGo's virtual list) of rows (the head, each turn, the tail), keyed
   by the turn's seq, `FollowEnd` while it works or waits, so only turns near the view are built
   and the end is followed only while the reader is at it; the transcript is made once per
   change of the events, never per frame (1,501 events: 69 ms a frame before, 2.7 ms after, in
   the test renderer). Nothing inside the page scrolls on its own: an opened run grows in place,
   60 steps then **还有 n 步**. A task resting on its wait opens at its end too. The **locator**
   (wide windows only, the Mac's task column ≥ 760 pt, the web's full view over 900 px): a rail
   18 pt in from the right edge, one 8×2.5 rounded bar per turn evenly spaced (at most 360
   tall), faint ink, the turns in view 10 wide in ink; hovered or focused, a clay card (Surface,
   the floating shadow, 300 wide, at most 420 tall) lists each turn's first line, newest at the
   bottom, those in view in ink at 600 with a mark; a click goes to that turn. D284: the page opens from what the client holds and asks the home for its newest 200 events, painted the moment they land, older pages of 300 following in the background up to 2,000, then at the head. The locator lists only what was said (the brief, the person's, the partner's); a run of quiet turns between them is one muted line at 12 with a 7×1 hairline mark, and on the rail a quiet turn is a 4-wide tick; the turns in view sit on a clay thumb (the accent at 12–13%, 12 wide) that glides (Smooth / 260 ms) as the page moves; the card rises out of the rail (scale 0.94 → 1 and fade from its bottom right, 180–200 ms in, 120 ms out); a click eases to the turn (the Mac row by row, ease-in-out 260–520 ms; the web 280–640 ms, landing a screen short first from afar), at once under reduced motion, and the turn wears the accent at 14–16% that rises fast and fades over 1.6 s. A Go the person gave on a card is a pill on their side (the sunken clay, 13 secondary ink, its time at 11 muted), never their bubble. The agent's
   words carry one quiet line at 11: **保存了进度** when saved (no icon), and on hover their time ·
   how long the turn worked · **拷贝**, drawn over the gap below so nothing moves. Header actions: **打开 / Open** (D198: a menu, Show in
   Finder; then Open in each of Cursor / Visual Studio Code / Zed installed; then, D201, Open
   in each terminal installed, Terminal / iTerm2 / Ghostty / Warp, and Rex or con once they
   open folders; a separator between the groups, the one used last first in each) in every state while its working copy is on this Mac;
   **取消任务 / Cancel task** is in the header's quiet **⋯ / More** (D268), **暂停 / Pause** by Send.
   The header's title (D270): the task's name as the last crumb at the bar's one size (14/600, ink)
   on one line, its full title on hover; no line under it (who, state and where are in the head). Over its changes, the working copy's path,
   `~/…`, mono, small and selectable (D198).
   **工作台 / Workbench** (D214, `design/workbench.md`): a drawn panel mark in the header (⌥⌘B),
   only when the task has something to show; wide, a column at the right (`--bench-w`, 42%,
   380–760 px, resizable) on `--bg-deep` with a hairline, its strip of pages on the sunken track
   with the one shown raised (the Seg look); on a phone a sheet over the task whose pages swipe.
   Code reads in a well of `--code-bg` with `--tk-*` token colours and `--code-add` / `--code-del`
   lines, numbers in the faint ink, ligatures off. Screens a task drives (browser, phone,
   computer) share one frame: a chip of who is driving (working tint for it, waiting tint for
   you, a clay bead), then the screen on a raised surface.

## Prototype canvases

| Canvas | URL | Covers | Status |
|---|---|---|---|
| Style Directions | https://claude.ai/artifact/8MchNob8LFMSoKsGgX6v1H | 5 themes on one screen | reviewed (Pebble chosen) |
| Core UI | https://claude.ai/artifact/U9r15Tpm8AL7aGQZwrtbDL | 3 zoom levels, desktop + mobile | draft (vocabulary updated) |
| Flows | https://claude.ai/artifact/LKuVp3knPDJ4EdoyWBGSWN | 21 key screens for groups A, B, D, E, C | draft |
| Concept art | https://claude.ai/artifact/HAPoyBbrSkm6sYjqGoNMze | character and screen art directions, rounds 1–2 | round 2 recommended: puffy matte clay |
| Loadout (2D) | https://claude.ai/artifact/CUpw7P1bPjKQKQYeLkUVzG | devices / AI accounts / ability-sticker interaction | grammar prototype; art to be replaced |
| Work over time | https://claude.ai/artifact/CMBoqncshR96q9fzgUhpXy | waits, keep-going tries, routines: On hand, the opened task, proposal cards, the phone (D112–D115) | v5, reviewed by the lead; author review pending |
| Quiet conversation (D104) | https://claude.ai/artifact/8ZaW9XS7a7NEBX1ATD4Khr | before / after on the demo seed, the waiting line, where each removed line went, three users (zh/en) | proposal, pending the author's review |
| Where a task runs (draft D157) | `design/prototypes/where.html` (open from the repo; shots in `.shots/where/`) | New task with and without a computer choice, the where line, Switch who does it with the island strip, the sleeping-Mac ask, the parcel landing / waiting / moving, closing the laptop; zh/en, motion / still | draft, pending the author's review |
| Your other agents ask you (draft D163, D164) | `design/prototypes/bridge-asks.html` (open from the repo; shots in `.shots/bridge/`) | X1 "有事问 Ducter": the terminal side, the phone card with the asker's coin and suggestion, answered → 已回复; the same ask in On hand's Needs you beside a task; X2's offer "直接接" and Settings › 伙伴's learned rules with X3's team switch and a muted sender; zh/en, motion / still | draft, pending the author's review (`design/bridge.md` "Beyond itself") |
| Device card as a character sheet (D161) | `design/prototypes/device-card.html` (open from the repo; shots in `.shots/device-card-v2/`) | before → after on the MacBook, the Mac's Devices page, five card states, the phone's Settings › Devices, and D157's switch sheet, where line, ask and rules in the same coin language; zh/en, motion / still | decided 2026-11-10 and built on both clients (`design/ui-devices-card.md` §12; built shots `.shots/device-card-built/`) |
| Where a task runs (D157) | `design/prototypes/where.html` (open from the repo; shots in `.shots/where/`) | New task with and without a computer choice, the where line, Switch who does it with the island strip, the sleeping-Mac ask, the parcel landing / waiting / moving, closing the laptop; zh/en, motion / still | decided (D157); the build follows it |
| Accounts and proactive help (drafts D165, D166) | `design/prototypes/accounts.html` (open from the repo; shots in `.shots/accounts/`) | today's card → the source as a character sheet; the first account (the 3-day look, the one question); the morning note in the conversation and on the lock screen; a silent day; an aha find becoming a Go-gated 上网 task; 有用 / 这类不用告诉我 → a rule; the other kinds; the Mac's Accounts page with four sources and a tile's detail; the phone; zh/en, motion / still | draft, pending the author's review (`design/connectors.md` Part A) |
| Use this phone (D238) | `design/prototypes/use-this-phone.html` (open from the repo; shots in `.shots/use-this-phone/`, the emulator's in the same folder) | the indicator's seven candidates with the naive raters' readings; the pill in the task's turn and the person's turn on a phone; the guide's three steps (Android's own pages in clay with the fingertip, zh/en) and the demo of a loan; the ask and a Go on the person's phone | draft, pending the author's review |
| Reply to one message (D236) | `design/prototypes/reply.html` (open from the repo; built shots in `.shots/reply/`) | the seven candidates for how a reply looks (research/72) and the chosen imprint: the swipe and its mark at rest and armed, the composer with the imprint, the sent reply, two replies in a row with their answers and the answer's tab, the found original, the long-press menu, light and dark, zh/en | draft, pending the author's review |
| Phone web (built) | `.shots/phone-*.png` (390×844, zh/en, light/dark) | the real `apps/web` client: conversation, decisions, On hand, opened task, pairing, notifications | built, pending review |

### Screenshots of the built clients (2026-11-09)

These are screenshots of the real clients, not canvases. Like the canvases, they decide nothing;
they show what the code does today, for review against the docs. They are not in git (D75): the
tools write to `.shots/` (gitignored), the maintainer's archive is `~/dev/ducter-evidence` (same
relative paths as before), and each review is shown as a published gallery.

| Set | Files | How it was made | Shows |
|---|---|---|---|
| Desktop, mock | `.shots/desktop/{conversation,conversation-done,onhand,task,task-sent,task-done}.png` | headless renderer, mock server | the three zoom levels; README images |
| Desktop, first run | `.shots/desktop/firstrun-first-result.png` | headless renderer | the first-result line |
| First screen (D149) | `.shots/first-screen/{desktop,phone}-{new,developer,returning-news,typing}-*.png` | desktop: headless renderer 1280 (`welcome_test.go` FirstScreenShots); phone: headless Chrome 390@2x against scratch homes, zh/en, light/dark | the greeting by time of day, life-first starters, the news line, the partner leaning in |
| Desktop, first run live | `.shots/desktop/firstrun-live-{empty,ack,first-result,result-message}.png` | live: real `ducter up` + sonnet (`onboarding.md`) | the first five minutes, timed |
| Desktop, live | `.shots/desktop/live-*.png` | live backend, real harness | ack, early send, task sent/done/result, On hand, reconnecting |
| Desktop, remote | `.shots/desktop/remote-{conversation,onhand,device-unreachable}.png`, `connect{,-badcode,-revoked}.png` | VM over an SSH tunnel (`research/29`); connect cards headless | Connect to your Ducter, a worker that can't be reached |
| Ducter.app | `.shots/desktop/app-*.png` | setup screens headless (fake backend); `app-live-first-reply` live; `app-dmg-finder`, `app-gatekeeper-macos15` real macOS screenshots; `app-icon` the drawn icon | checking, blocked, name, starting, stopped, CLI offer, Gatekeeper |
| Polish pass | `.shots/desktop/polish-{before,after}-*.png` | native window (cua-driver) on a scripted backend, plus the headless renderer | the components above: buttons, chips, notices, the result sheet, rhythm |
| Taste review | `.shots/desktop/review-{before,after}-{zh-1280,en-900}-*.png` | headless renderer, mock (`DUCTER_REVIEW`) | every screen at 1280 and 900 px, before and after the taste pass |
| Phone web | `.shots/phone-*.png` | headless browser at 390×844 on a demo core; `phone-real-sonnet-result-zh` from a real sonnet run | conversation, decision sheet, decided, On hand, task, result, pairing, notify ask, iOS hint, offline; dark variants |
| Design QA (D73, D74) | `.shots/qa-2026-11-09/{before,after}-*.png`, index in its `README.md` | native desktop window (cua-driver) on the demo seed, iOS Simulator, headless Chromium at 390 and 1440 (phone web, site) | no pills, the result line, the living message, On hand, the one-column task (done, working, didn't work), devices, setup, the site |
| Quiet conversation (D104) | `~/dev/ducter-evidence/quiet-conversation/{desktop,web}/` | native desktop window (cua-driver) on the demo seed with its scripted partner, scratch HOME; headless Chromium at 390 | before / after zh and en, Details open, the waiting line at 0.15–3.2 s and past 15 s / 45 s, Settings |

## Devices stage: the Isles (D81)

The decision is D81 (and D82 for the shared line); the evidence is `research/33` (seven scene
metaphors, 96 rater calls: Isles 129/180 against the literal floor's 106, felt better 16 vs 11
of 20), building on `research/24`, `26`, `28` and D65's equip snap. Built in
`apps/desktop/internal/views/isles.go` (the scene), `pairing.go` (the jetty and its sign) and
`devicecard.go` (the chosen device's card); the scripted demo has a scene for every state
(`MOCK_SCENE` / `GET /demo/scene?name=…` on the mock server).

| In the scene | What it is | States |
|---|---|---|
| the big island in the middle, Ducter on its grass beside the laptop | the Mac (or server) Ducter lives on | Ducter's face: idle, working (reading), done after an equip, napping when home sleeps |
| a smaller island round it, far ones smaller | another computer (D84), or a phone / app window that reaches Ducter | awake floats; asleep under its blanket; can't reach: soft mist, the device a little grey, one line of words |
| a plank-and-rope bridge from home | the connection (only ever to home) | pale when the device can't be reached; relaxed when asleep; never slack or broken |
| parcels crossing a bridge | a task running on that device now | none when nothing runs there |
| small clay tokens on an island, names on tags | the AI agents signed in on that device | tap one: every island where it is signed in lifts; the card says "N 台设备共用" |
| full-size clay objects on the water in front of the island (a globe in a browser frame, a hand on a laptop, a little lighthouse, a hand tapping a phone, a handset on its base) | abilities that are on | bob gently; the equip flies in; not yet: the same object desaturated and a little see-through (the list beside the stage) |
| a stitched clay socket beside them, the object faint inside it | an ability that can be added (or needs a fix first) | dashed accent ring while one is held over the stage, hovered or in flight |
| small clay mailboxes on home's right rim | the user's connections (D96), at most three | |
| a jetty from home, a ring of still water, a sign | the one-time code is out, waiting for a device (D83) | the scene makes room for the sign; the new island rises in that water |

The website draws the same scene (`apps/site`, a wide and a narrow layout). Its narrow layout is
spaced for a ~360 px stage; on a smaller phone the words on the tags shrink with the stage, down
to 11 px (10 px on an account's tag), so neighbouring tags never meet.

Layout: home in the middle; six spots round it (back right, back left, front right, front
left, far left, far right), an island keeps its spot while it is there; the abilities' row sits
under home's name and below the front islands' words. The scene frames itself to fit what is on
stage (one device large, up to 1.35×; six fill it) and eases when that changes. Art: the islands
are clay renders (`design/art/assets/alpha/island_big.png`, `island_small.png`, 1600 wide,
runtime @1280); the sea, sky, foam, reflections, bridges and parcels are drawn from the
`Isles` tokens (`theme.go`).

A handheld stands on its island in its own shape (D263): `phone` (an iPhone, an Android phone,
anything unknown), `tablet` (an iPad, an Android tablet: the phone's bezel and face, 3 : 4, a head
taller on the island) and `foldable` (a book-style fold such as a Pixel Fold: drawn half open
like a book, one screen across the crease, Ducter on its right half). The same art is the list's
icon and the card's hero, on the Mac and the web. The shape comes from `clientShape`
(`packages/protocol`): the model its Android app reports, else what its page said in its hello
(`shapeFromBrowser`: an iPad, an Android model in the user agent, an Android screen 600 px wide
or more), else an "iPad …" name, else a phone. Flips (Galaxy Z Flip, Razr) open into a phone and
stay one. Masters `design/art/assets/alpha/tablet.png`, `foldable.png` (prompts
`prompts/tablet.md`, `foldable.md`, batch `batch_forms.json`, the phone as the first reference);
`python3 tools/art/devices.py` writes the Mac's @640 and the web's `dev_*.webp`.

## Art direction (D53)

- **Medium:** puffy matte clay 3D illustrations, pre-rendered as assets and composed in a 2D
  UI (MyGo native). No real-time 3D.
- **Lighting rules:** one soft key light from the top left, gentle ambient occlusion and
  contact shadows. Never glow, neon, bloom, rainbow gradients, lens flare, or over-gloss.
- **Character:** the round-2 clay Ducter (`design/art/concepts/r2/r2_char_clay.jpg`) is the
  identity reference for every pose.
- **Capability screen:** device cards on the left, the Isles scene in the middle (D81), the
  chosen device's card and the ability grid on the right. (First drafted as round-2 board v2,
  `r2_board_2.jpg`: the hero device on a pedestal with slots, AI-account tokens with
  allowance rings at the bottom.)
- **The AI agents' coins (D183):** each agent's real mark sculpted as a small free-standing
  clay toy (Claude Code's starburst, Codex's cloud with `>_`, DeepSeek's whale, pi's blocks), in
  the same clay, light and camera as the character; one family by material and optical size,
  told apart by silhouette. Two looks: the coin, and the same object in grey clay when signed
  out (`*_off`); a coin whose clay would vanish on the dark ground has a third, the dark theme's
  (`*_dark`, D213): the same object re-cast in a pale clay, its form and top light kept (Codex's
  charcoal knot becomes bone clay, the way the mark itself turns light on a dark page). Shown at
  28 pt and up only (D213). Pipeline and sources: `design/art/LOGOS.md`, `tools/art/coins.py`.
- **Equip motion:** sticker peel-and-stick (`research/26`, `research/28` timings).
- **Asset pipeline:** generate with the reference images for consistency, select, clean up,
  and export at 1×/2×/3× with transparent backgrounds. Only final exports go into git, plain
  git with no LFS (D64); raw generations stay in the concept-art canvas. Labels are always live UI text, never
  baked into art.
