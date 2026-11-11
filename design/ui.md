# UI: Themes and Tokens

> 2026-11-08 · Style board: https://claude.ai/artifact/8MchNob8LFMSoKsGgX6v1H

## Decision

**Pebble is the default theme.** Volt, Paper, Signal, and Midnight are designed as
alternative themes; only Pebble ships. Pebble is light; **Midnight** (dark) is planned for the
Mac app (D134, roadmap); web and iPhone follow the system's dark mode today, and the Mac app is
light only for now. Every theme is a **token set**; components never hard-code a color, font,
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
| mode | each theme declares light/dark variants. Midnight is dark-only. Pebble dark = Pebble shapes and motion on Midnight-like surfaces; web and iPhone follow the system's dark mode with it today; the Mac app is light only for now (Midnight planned, D134) |

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
  white on the paper, `#2A221B` in Pebble dark on web and iPhone; the Mac app is light only for now). Corners `bubble-shape` 20/20/6/20, mirrored
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
| type | 12 · 13 · 15 · 16 · 18 · 20 · 28 · 34 · 56; mono 13 (JetBrains Mono) | captions · labels and small controls · body and controls · both bubbles and the composer (D129) · a decision on a phone · card titles and asks · section titles · screen titles and a task's outcome · hero numbers |
| space | 4 · 8 · 12 · 16 · 24 · 32 · 48 (`S1…S7`) | inside a group S2–S3; between groups S4–S5; a screen's sections S6–S7 |
| radius | 8 · 12 · 14 · 16 · 18 · 24 · 28 | inline code, diff boxes · small buttons, fields · buttons · sheets, notices · large buttons · cards · hero cards, the composer |
| controls | 36 · 44 · 52 | chrome and inline lines · cards and the conversation · setup screens and the equip |
| chips | 24 · 28 · 32 (`ChipSM/Chip/ChipLG`) | a state tag · evidence and metadata · a task in the conversation |
| motion | press 70 ms · hover/lift `Snappy` · enter 220 ms (6-pt rise + fade) · `Bouncy` for the living message and the equip | reduced motion: no movement, colors still change |

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

**Motion: character and scene may breathe; status never blinks (D77).**

| Thing | Idle motion |
|---|---|
| the clay partner | breathes (scale 1.012 × 1.03 from its feet, 3.8 s); blinks (150 ms, every 3–6 s, sometimes twice): the same render with its eyes closed (each eye filled from the clay round it, `tools/art/eyes.py`) shows through an upper lid that comes down and a lower lid that rises late, a crease riding the upper lid's edge; it differs from the open face only inside the lids, so no patch can show. The phone swaps to that closed frame. Reduced motion: no blink |
| an awake device | floats 5pt (5.6 s) |
| a cloud machine | drifts ±4pt (11 s) |
| a sleeping device | its blanket rises and falls (scale-y 1.045 from the bottom, 4.8 s) |
| an ability that is on (Devices stage) | floats 5pt like an awake device (5.6 s), its own phase |
| the sea and sky (Devices stage) | clouds drift ±16pt (70 s); slow light on the water drifts and fades (11–19 s); repainted at 12 fps |
| parcels on a bridge | cross at a steady 40 scene-points a second, only while a task runs on that device (a state that is true, not decoration); still mode freezes them in place so "working" still reads |
| an AI agent's coin (D183) | only while a task of that agent shows (task footer, On hand's asker row): working, rocks on its base 5° each way (4.2 s); waiting on you, bobs 2pt (2.6 s); still otherwise, and everywhere else |
| a device that joins | its island rises out of the water (0.55 s), then the device drops on with the equip's squash and sparkles |
| the equip | peel (14%) → arc (50%) → snap (62–69%), 0.82 s, a tock and a 10 ms haptic |
| the title moment (D87) | once per Mac: dawn rises, a 3% push-in with parallax, the eyes open on the tone, the logotype lit by a passing light; see `onboarding.md` |

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

**Chrome.** 60pt bar, the title region. Left: where you are (crumbs are text buttons, 15/700
muted, the level's name 18/800). Right: what you can do (small secondary buttons). Metadata
(model, place, project) is never in the chrome: it is in the task's Details (D74).

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
| Quiet text button and link (现在检查, 看日志) | `quietButton`, `quietLink` (`quiet.go`) | `Btn` kind `text` |
| Switch | `switchControl` (`shared.go`), inside `switchRow`, `toggleRow` | `Toggle` |
| Segmented choice | `choices` (`partner.go`) | `Seg` |
| Choice row (a theme, Remove's plan) | `selectRow` (`shared.go`) | — |
| A value row's side link (现在检查 and its 在查…, 没更新成 ›; D167) | `sideLink` inside `valueRow` (`settings.go`) | the `Versions` line under the device list (`Btn` kind `text`) |
| Disclosure row (素材与致谢) and link row | `disclosureRow` (`shared.go`), `linkRow` (`settings.go`) | — |
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
| Back to the list | the chrome's crumb | `BackRow` |

## Places (D71)

v1 has five places, and every one is reachable from the menu bar, a shortcut and the window:

| Place | Reach it | What it is for |
|---|---|---|
| 对话 / Conversation | ⌘1, Esc from any other place | Home: talk, decide, see results |
| 手头的事 / On hand | ⌘2, the button in the conversation's bar | Every task and what waits for you |
| 设备 / Devices | ⌘3, the clay device button | The setup surface: devices, what they can do, AI accounts (sign in, install, sign out on this Mac), Connect a phone or computer |
| 伙伴 / Partner | ⌘4, the partner's own face and name | Settings' first tab (D150), below |
| 设置 / Settings | ⌘, and Settings… in the app menu and the menu bar extra | One place for everything you can set (D150), below |

An opened task is the third zoom level under On hand. The **menu bar extra** (the clay partner
as a template icon) is the handheld moment: with the window closed, its menu lists what needs
you, each with Go / Hold / Reply…, then Open Ducter.

**Settings (D150).** A game's settings menu. On the left a rail (264 wide, on the chrome's cream
with a hairline) of chunky clay tabs, 56 tall, radius 16: each the clay thing it is about at 40
(the partner's face; `wait_clock`; `wait_mail`; Pebble's paper, accent and ink as three clay
pebbles; `mini_awake`; an arrow up on an accent pebble) and its name 15/700. The tab shown is a
white surface on the card's 4pt base in ink 800; the others lie flat in soft ink, tinted and on a
2pt base under the pointer, and sink while pressed. The build number sits at the rail's foot in
12 muted. On the right one section at a time (max 820, centered): **伙伴 / Partner** · **通知 /
Notifications** · **账号 / Accounts** · **外观与声音 / Look and sound** · **在哪儿运行 / Where it
runs** · **更新与关于 / Updates and about**. Deep links land on their tab: ⌘4 and the partner's face
on Partner, About Ducter and the update line on Updates and about (whose update block is one
slot, `updateSection`).

One vocabulary on every tab:
- **Type:** the tab's name 28 heading (or the hero card's name), a one-line lede 15 muted; a
  group's title 20 heading on the paper, its note 13 muted; a row's label 15/700; its helper 13
  muted (zh 1.75); captions 12.
- **Groups:** the title on the paper, then a white card (radius 24, the 4pt clay base) of rows.
  A row is 68 high at least, padded 16 × 24, its label and one-line helper on the left and the
  control at the right end: a switch, a segmented control, a small secondary button, or a ›
  (a link row: the whole row is the button; ↗ for a page outside the app). A 1pt `line-soft`
  hairline, set in 24 from the card's sides, between rows.
- **Actions:** a card's primary (clay) buttons sit at the right end of its last line; a quiet
  text button (Cancel, Add one with an address and key) at the left of the same line. Remove
  Ducter is a quiet text button after the last group, never centered.
- **Partner:** one calm clay header (the partner at 112, its name 34 with Rename, one line "住在
  hel 上 · 用 Codex 想事情"), then the tray titled **{device} 上的 AI agent**, What it thinks with
  (the clay well holding the token; the token flies into it on Switch), Who does the tasks, How it
  talks, What it remembers (no Mem: no switch; one gentle line on what Mem adds and **了解 Nowledge Mem**, D169), On its own or asks
  you first (two lists side by side in one card). Single column; the faces strip is gone.
- **Look and sound** opens on a preview stage: the partner, one message of yours and its answer
  in this window's language, and Details folded or shown as set. The partner smiles (its done
  face, cross-faded) for 1.6 s after any choice there, and while **听一下 / Play** plays the
  intro's sound (stopped after 5 s). Reduced motion: the face still changes, nothing moves.
- **The phone** shows the same sections as a list (a card of rows: the clay thing at 40, the
  name, a helper, ›) under a partner card; a tap pushes the section (a 24pt slide from the right,
  280 ms; none under reduced motion) with **‹ 设置** to go back. Its fourth section is **这台手机 /
  This phone** (language, Details); its Notifications page also holds this phone's own push.
  `#settings=<section>` deep-links a page.

Screenshots: `.shots/settings/` (desktop 1280 every tab zh/en, the Partner tab on a Mac and on a
Codex-only server; phone 390 every page light/dark).

**Switching what it thinks with** (D89) is the one game moment on Partner: Switch lifts the
tray tokens that can go in (the others step back and say why: Install first, Pick a model
first, Coming later), a tap flies the token into the socket with the equip's lift → arc →
tock (`research/26`; reduced motion: a cross-fade), then one line: "{name} thinks with {agent}
now". Nothing blinks; only the partner breathes.

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
the level (18/800, the chrome's rule) with New task's ＋; an opened task's crumb there is
**‹ 手头的事 / On hand**. The conversation's header drops its On hand button; the face lives
only in the conversation's header. Sheets from 700 × 640 stand centered as a card (radius 24 all
round, no grab). Keys as on the Mac (⌘N, ⌘1–⌘4, ⌘,, ⌘K, Esc), in the iPad app's menu bar.
Screens: `.shots/ipad/`.

**The whole screen, as the Mac shows it (D184).** The two panes stay the default. At the right
end of the side pane's header a 44-point button with two arrows out (**铺满 / Full screen**) takes
the level shown to the whole screen; there the same button with the arrows in (**放回对话旁边 /
Back beside the conversation**) brings it back, and so do ⌘2 (a toggle for On hand), the crumb
**对话** and Esc (one level up: a whole-screen task goes to the whole-screen On hand). On hand at
the whole screen is the Mac's On hand, part for part (`apps/web/src/board.tsx` mirrors
`onhand.go` and `byproject.go`): a 60-high header on the chrome's hairline with the crumbs (15/600
muted, `/` faint, the title 18/800, the counts 12 muted), then **按状态 · 按项目** (`Seg`) and
**开一件事** (`Btn` text); **接下来** in 13 muted (the side pane shows the same one line above its sections, D192); the lanes as flex columns with the Mac's grow and
basis (Needs you 2/400, Working 1/240, Waiting 1/220, Done today 1/260, each at most 2.2× its basis),
their names at 20/800 with the count muted; working and waiting cards white on the card's base
(title 15/800, where it stands 13 soft, the rest 12 muted), Done today one card of rows; by
project, groups at most 960. An opened task at the whole screen keeps its page on the 720 measure
under the crumbs **对话 / 手头的事 / {task}**, with **暂停 / 不做了** in the header (D207). The move between
the two is one view transition (`level` and `conv`, 320 ms, `--ease`; none under reduced motion).
On a book fold the whole-screen On hand puts Needs you on the first half and the other lanes on
the second; a task stays in its half; a tabletop offers neither. Screens:
`.shots/onhand-wide/` (Mac vs iPad sheets, `sheet-*.png`).

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
     (defaults taking effect, waits coming due; D127). The lanes' headers carry the counts.
   - Below it are four lanes: **等你 / Needs you** (wide decision cards read at one glance,
     D127: the agent's coin and the task's short title, one question, the default as a small
     timer and one caption, Reply… · Hold · a short Go), **在做 / Working**, **在等 / Waiting**
     (dashed, showing what it waits for), and **做完了 / Done** (with "在检查 / checking"
     for `done?`).
   - Lanes can be grouped by state, time, device, project, or persona. "Go on all defaults"
     is a text button at the end of the Needs you lane's header.
   - On mobile, decisions are a swipeable stack: swipe left takes the default, swipe right
     means later.
   - Routines appear as one card each, with the next firing time.
3. **An opened task** (conductor depth; D74, D90). One centered column on the conversation's
   measure and rhythm, read top to bottom; the window's header is the breadcrumb and the title only.
   1. **The head is one block** (D90): the state face (96 pt) beside one quiet meta line
      (D152): the state in its ink, the task's one clock once finished ("用了 18 分钟 / took 18
      min"; while it works the clock ticks in the foot, D210), the agent's coin, the agent and the model, where
      (repo · branch, a folder, "在 hel 上 / on hel" for another machine; nothing for no
      place), and **换谁来做 / Switch who does it ›** as a small action; then a headline that is always there (D152: the task's short title, or where a browser or a wait stands; never the agent's latest sentence, which the transcript says): before D152, while it works, what it is doing now in a
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
      rem / 240 pt). Then the agent's answer in order, items 12 apart: its messages and saved
      progress (said once, a small flag and **保存了进度 / Progress saved**) in body ink at the
      reading measure, and its steps between them, **one line each**, consecutive lines tight
      (26–28 pt, padding 0/6 bleeding past the column so a hover background reads as a row):
      a drawn mark in muted ink; the sentence (the agent's own words, else a verb and a
      summary, SM, InkSoft); the command or path in mono, muted, cut first (no inline-code
      tile); an edit's **+n** in the done ink and **−n** in the failed ink; ×n; a chevron in
      Faint only when the line opens. Consecutive looks fold into **看了 3 个文件，搜了 2 次 /
      Read 3 files, 2 searches**. A probe that found nothing in muted ink. A real failure in
      the failed ink with **出错 / Error**, and its telling output line under it in mono XS,
      failed ink, indented 24. Opened, a step shows `$ command` and its output on Sunken (mono
      XS, 12 lines then **还有 n 行 / n more lines**), an edit its diff on Sunken: put-in lines
      on the done surface in the done ink, taken-out lines on the failed surface in the failed
      ink, context plain, "@@ path" headers bold muted, ⋯ between hunks. Your words while it
      is busy are lighter with **排队中 · 它忙完手上的就看**. Past 240 lines the older turns wait
      behind **显示更早的 n 步 / Show n earlier steps**.
   6. **改动 / Changes**: the changed files, each with +added −removed; a file opens its diff
      in place, full width, under a quiet header. No diff shows by default; a task in no repo,
      or with nothing changed yet, has no section (D127). The phone names the changes in the proof line and shows no diff.
   7. **发出去的 / Sent out**, only when something went out, and a wait's **怎么判断的 / How it
      checks**, only when there is a wait. No Details table (D152).

   Type and rhythm (D90): section headings 18/800, one step above the 15 body; gaps 8 / 16 /
   24 / 32; a headline or paragraph at most about 68 Latin or 36 Chinese characters a line
   (D78 Chinese rules: leading 1.75, no tracking).
   The box to talk to the task stays at the bottom of the window, as the conversation's
   composer does; a pending ask sits over it (D152). Over it, **the foot** (D210): while the task
   works, a spinner (the only thing that moves), **在做 / Working** in the working ink, the clock
   in tabular figures, its latest step in InkSoft, and **暂停 / Pause** at the end (Esc twice: the
   first turns it into **再按一次 Esc 就暂停** with **接着做** and **暂停**); over to you, **该你了**
   in the needs ink and the hint muted; silent otherwise. A task that works or waits on you opens
   at its latest, a finished one at its head; while it works a reader at the end follows the
   newest step, one who scrolled up gets **回到最新 / Jump to latest**, a 40 pt round raised
   button (Surface, the floating shadow) centred over the transcript's foot. Header actions: **打开 / Open** (D198: a menu, Show in
   Finder; then Open in each of Cursor / Visual Studio Code / Zed installed; then, D201, Open
   in each terminal installed, Terminal / iTerm2 / Ghostty / Warp, and Rex or con once they
   open folders; a separator between the groups, the one used last first in each) in every state while its working copy is on this Mac, and
   **不做了 / Cancel task** until it finishes (D207); **暂停 / Pause** is in the foot (D210). Over its changes, the working copy's path,
   `~/…`, mono, small and selectable (D198).

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
  out (`*_off`). Pipeline and sources: `design/art/LOGOS.md`, `tools/art/coins.py`.
- **Equip motion:** sticker peel-and-stick (`research/26`, `research/28` timings).
- **Asset pipeline:** generate with the reference images for consistency, select, clean up,
  and export at 1×/2×/3× with transparent backgrounds. Only final exports go into git, plain
  git with no LFS (D64); raw generations stay in the concept-art canvas. Labels are always live UI text, never
  baked into art.
