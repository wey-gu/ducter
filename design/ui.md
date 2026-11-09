# UI: Themes and Tokens

> 2026-11-08 · Style board: https://claude.ai/artifact/8MchNob8LFMSoKsGgX6v1H

## Decision

**Pebble is the default theme.** Volt, Paper, Signal, and Midnight ship as alternative
themes. Every theme is a **token set**; components never hard-code a color, font, radius, or
shadow, so adding or switching a theme is pure data. The same tokens drive MyGo native UI
(desktop/web) and Expo (mobile).

## Token schema (every theme fills all of it)

| Group | Tokens |
|---|---|
| color | `bg`, `surface`, `surface-raised`, `ink`, `ink-muted`, `accent`, `on-accent`, `decide` (needs-you), `decide-surface`, `ok`, `ok-surface`, `progress`, `progress-surface`, `user-bubble`, `on-user-bubble`, `line` |
| type | `display` family + weight, `body` family, `mono` family, CJK fallbacks; scale `xs…xl` |
| shape | `radius-sm/md/lg/pill`, `bubble-shape` (asymmetric corners), avatar shape |
| depth | `shadow-style`: `press` (Pebble: solid offset under), `offset` (Volt: hard drop), `hairline` (Paper/Signal), `glow` (Midnight); plus values |
| motion | `personality`: `bouncy` (Pebble), `snappy` (Volt), `calm` (Paper/Midnight), `stepped` (Signal); durations and easing |
| density | `comfortable` (default) / `compact` |
| mode | each theme declares light/dark variants. Midnight is dark-only. Pebble dark = Pebble shapes and motion on Midnight-like surfaces |

## Pebble (default) values

> Restored 2026-11-09 from the approved artifacts (D76–D78). Prototype:
> https://claude.ai/artifact/51djLTYeekc14y1GsP7Wn5.

- color: bg `#FFF6EA`, bg-deep `#FCECD7`, surface `#FFFFFF`, sunken `#F7EBDA`, ink `#2B2118`,
  ink-2 `#4A3D30`, muted `#75654F`, line `#E8D9C4`, line-2 `#E0C9B0`, accent `#FF8A3D` (ledge
  `#C9642A`), decide-surface `#FFE3CF` / ink `#8A3A0C` / ledge `#F0C29E`, ok `#D6F5DC` / `#1F5E2F`,
  fail `#FBDDE4` / `#8A1F3B`, user-bubble `#2B2118` on cream
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
- **Voices:** the user's messages are cocoa bubbles (`#2B2118` on cream text). Ducter speaks
  bubble-less in 18px body type on the paper, so it reads like a person talking, not a chat
  app. Structured things (decisions, files, summaries) are white cards on the clay base (D76).
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
| type | 12 · 13 · 15 · 16 · 18 · 20 · 28 · 34 · 56; mono 13 (JetBrains Mono) | captions · labels and small controls · body and controls · the user's bubble and the composer · the partner's voice · card titles and asks · section titles · screen titles and a task's outcome · hero numbers |
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
secondary (cream `#FFF6EA` with a 1pt inner rim of ink at 9%, ledge `#E0C9B0` under a 1pt `#F3E3CC` seam; on a tinted card
it turns white with the card's ledge color), accent (orange, ledge `#C9642A` under a 1pt `#FFA466` seam, highlight white at
38%: the composer's send, the equip), text (flat), and icon (a square of any of them). Heights
36 / 44 / 52 with radius 12 / 14 / 18 and type 13 / 15 / 16 (700); the 52 size stands on a 4pt
ledge. The same hover (a shade lighter), press (sink) and keyboard focus ring on all of them.
In a row the primary is last (macOS) and at most one primary shows per group.

**Task lines.** A task in the partner's words says its title once, then where it stands: the
job's status line when it adds something, else the state (a status line that only repeats the
title falls back to the state). A finished task reads 做完了 / Done: `done?` shows as Done until
something actually checks the result ("在检查 / checking" only while a check runs).

**Results (D73).** The partner's result message already says the outcome in words, so nothing
under it restates the state (no task chip). Under it:
1. one quiet line of proof in muted ink at 13: a drawn ✓ (× for a task that didn't work) and
   plain words per check ("✓ 50/50 cargo test"), then "2 files changed ›" as a text link
   (opens the task at its changes), then the task's title as a quiet link ("Fix the flaky
   compaction test ›"). It wraps on a narrow screen and never truncates;
2. only when something went out, the same kind of line with a drawn ↗ and the literal action
   ("↗ git push -u origin ducter/fix-ci");
3. the actions: Merge into main (primary), Open draft PR (secondary). "See changes" is the
   "2 files changed ›" link, so it is not repeated.
No blockquote rule, no label column, no capsules.

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
  the normal state says nothing (an awake worker has no status line; Ducter's home says
  "Ducter 在这儿" quietly).
- A state in text is plain text in the state's ink (a lane's count, a failed status line,
  "Didn't work" on a Done row), never a chip and never with a dot in front.
- A mark is a drawn glyph that means something (✓ done, clock waiting, → under way, × didn't
  work, ! look at this, ↗ went out), in muted ink (or the state's ink for an exception),
  never on a colored tile, never a colored dot.
- A one-time highlight (a decision found from a notification) deepens the card's own tint;
  it never glows.
- Selection on a card is a 2-point ink hairline (cards are containers: no ledge).
- On the devices stage, a slot is labelled by its ability's name only and is laid out so the
  label never leaves the stage; AI-account cards shrink to fit; the accessible name carries
  the full state.
- The partner's clay face may blink or breathe: it is the thing itself, not a status dot.
- A passed check's ✓ is drawn in the done ink (D76); other marks stay muted.

**Motion: character and scene may breathe; status never blinks (D77).**

| Thing | Idle motion |
|---|---|
| the clay partner | breathes (scale 1.012 × 1.03 from its feet, 3.8 s); blinks with an eyelid over its eyes (150 ms, every 3–6 s, sometimes twice) |
| an awake device | floats 5pt (5.6 s) |
| a cloud machine | drifts ±4pt (11 s) |
| a sleeping device | its blanket rises and falls (scale-y 1.045 from the bottom, 4.8 s) |
| an AI account's cords | a sheen runs along once every 9 s |
| the equip | peel (14%) → arc (50%) → snap (62–69%), 0.82 s, a tock and a 10 ms haptic |

Delays are staggered so nothing moves in unison. A device that can't be reached is still and a
little grey. Status, chips, lines and buttons never animate on their own. Reduced motion: all
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
- Inline code in a zh line: JetBrains Mono at 0.86em on the same baseline, the same 1/4-em gap,
  short tokens never broken (D73).

**Conversation rhythm.** Top-aligned (no empty band above a short conversation). 12 between
two things one voice says, 24 where the turn passes; 12 inside a message (text → chip → sheet
→ actions); the composer 24 from the window's edges.

**Chrome.** 60pt bar, the title region. Left: where you are (crumbs are text buttons, 15/700
muted, the level's name 18/800). Right: what you can do (small secondary buttons). Metadata
(model, place, project) is never in the chrome: it is in the task's Details (D74).

**Decisions in the conversation (D73).** The living message's title "你不在的时候 / While you
were away" shows only when the user was away: it came before the window opened and was
unread, or while the window was in the background. The count shows once, in the section's
header ("2 件等你 / 2 need you"), with 都按默认 / Go on all defaults as a text button at its
end. Each ask names the task that asks as plain small words in the needs-you ink (nothing for
the partner's own asks); its buttons are Go-as-the-action, Hold, Reply…, and Details right
after them (on the phone, where four don't fit, and on On hand, the asking task's title is
the link instead). The other items are one line each: a drawn mark in muted ink, no tile.
Short code tokens in a message never break mid-word; only a long path may wrap.

## Places (D71)

v1 has five places, and every one is reachable from the menu bar, a shortcut and the window:

| Place | Reach it | What it is for |
|---|---|---|
| 对话 / Conversation | ⌘1, Esc from any other place | Home: talk, decide, see results |
| 手头的事 / On hand | ⌘2, the button in the conversation's bar | Every task and what waits for you |
| 设备 / Devices | ⌘3, the clay device button | The setup surface: devices, what they can do, AI accounts (sign in, install, sign out on this Mac), Connect a phone or computer |
| 伙伴 / Partner | ⌘4, the partner's own face and name | A character sheet: the clay partner large with its five faces (hover one to see it big), the name renamed in place, then How it talks · When it comes to you · What it remembers · On its own, or asks you first |
| 设置 / Settings | ⌘, and Settings… in the app menu and the menu bar extra | The app's own, calm: Look, Language, When you close the window, Updates, Data and logs, About, Remove Ducter (last, a quiet text button) |

An opened task is the third zoom level under On hand. The **menu bar extra** (the clay partner
as a template icon) is the handheld moment: with the window closed, its menu lists what needs
you, each with Go / Hold / Reply…, then Open Ducter. The phone has one **Settings sheet**
(tap the partner) with the partner's settings and the phone's own language.

**Choices** (talk language, interface language, the default wait) are a segmented clay control
(D76): a sunken track (`#F3E6D3`, radius 16, 4pt inset), the chosen one a white surface on a 2pt
`#E0C9B0` base in ink 700, the others muted 500; switches are the platform's. A page's cards
stand on the card base; an
empty list (no noted lines) is left out with its heading. Screenshots:
`.shots/ia-2026-11-09/` (native zh/en, full-length headless, the phone sheet).

## Three zoom levels (Core UI canvas: https://claude.ai/artifact/U9r15Tpm8AL7aGQZwrtbDL)

1. **The conversation** (default). One partner, no machinery. Tasks appear only as quiet
   task lines inside the partner's messages; the header line says in words what needs you and what is
   being worked on, and **手头的事 / On hand** is a plain button. The living message carries decisions inline with Go / Hold / Reply, so most days
   the user never leaves this view.
2. **手头的事 / On hand** (overview for decisions, all personas).
   - The top band is the **attention forecast** in plain words: when each task will next need
     you (defaults taking effect, waits coming due). The lanes' headers carry the counts.
   - Below it are four lanes: **等你 / Needs you** (wide decision cards with the question,
     default, countdown, and Go / Hold / Reply), **在做 / Working**, **在等 / Waiting**
     (dashed, showing what it waits for), and **做完了 / Done** (with "在检查 / checking"
     for `done?`).
   - Lanes can be grouped by state, time, device, project, or persona. "Go on all defaults"
     is a text button at the end of the Needs you lane's header.
   - On mobile, decisions are a swipeable stack: swipe left takes the default, swipe right
     means later.
   - Routines appear as one card each, with the next firing time.
3. **An opened task** (conductor depth; D74). One centered column on the conversation's
   measure and rhythm, read top to bottom; the header is the breadcrumb and the title only.
   1. Where it stands, in words in the state's ink (a drawn mark, "Done · started 14 min
      ago"; for a task under way, its latest status line).
   2. A pending ask, as in the conversation.
   3. The outcome, said once: the report in the partner's size, the line of proof, what went
      out, then Merge / Open draft PR (Try again for one that didn't work). It replaces the
      result banner and the "Told Ducter · done" card.
   4. **过程 / What it did**: the task's own words as a short narrative; tool calls that went
      fine fold into one line per stretch ("跑了 2 条命令，改了 1 个文件 / Ran 2 commands,
      edited 1 file ›") that opens in place; a step that didn't work stands on its own, in
      words, with its first line of output.
   5. **改动 / Changes**: the changed files, each with +added −removed; a file opens its diff
      in place, full width, under a quiet header. No diff shows by default; a task in no repo
      has no section. The phone names the changes in the proof line and shows no diff.
   6. A quiet **细节 / Details ›** disclosure: who is doing it and why, where (repo and
      branch; the path as the user named it, never a scratch absolute path), saved progress
      as a plain list, what went out, usage only if there is any. A row with nothing to say
      is left out.
   The box to talk to the task stays at the bottom of the window, as the conversation's
   composer does.

## Prototype canvases

| Canvas | URL | Covers | Status |
|---|---|---|---|
| Style Directions | https://claude.ai/artifact/8MchNob8LFMSoKsGgX6v1H | 5 themes on one screen | reviewed (Pebble chosen) |
| Core UI | https://claude.ai/artifact/U9r15Tpm8AL7aGQZwrtbDL | 3 zoom levels, desktop + mobile | draft (vocabulary updated) |
| Flows | https://claude.ai/artifact/LKuVp3knPDJ4EdoyWBGSWN | 21 key screens for groups A, B, D, E, C | draft |
| Concept art | https://claude.ai/artifact/HAPoyBbrSkm6sYjqGoNMze | character and screen art directions, rounds 1–2 | round 2 recommended: puffy matte clay |
| Loadout (2D) | https://claude.ai/artifact/CUpw7P1bPjKQKQYeLkUVzG | devices / AI accounts / ability-sticker interaction | grammar prototype; art to be replaced |
| Phone web (built) | `.shots/phone-*.png` (390×844, zh/en, light/dark) | the real `apps/web` client: conversation, decisions, On hand, opened task, pairing, notifications | built, pending review |

### Screenshots of the built clients (2026-11-09)

These are screenshots of the real clients, not canvases. Like the canvases, they decide nothing;
they show what the code does today, for review against the docs. They are not in git (D75): the
tools write to `.shots/` (gitignored), the maintainer's archive is `~/dev/ducter-evidence` (same
relative paths as before), and each review is shown as a published gallery.

| Set | Files | How it was made | Shows |
|---|---|---|---|
| Desktop, mock | `.shots/desktop/{conversation,conversation-done,onhand,task,task-sent,task-done}.png` | headless renderer, mock server | the three zoom levels; README images |
| Desktop, first run | `.shots/desktop/firstrun*.png` (`firstrun-empty-{zh,en,fresh}`, `firstrun-first-result`) | headless renderer | empty conversation with repo starters, the first-result line |
| Desktop, first run live | `.shots/desktop/firstrun-live-{empty,ack,first-result,result-message}.png` | live: real `ducter up` + sonnet (`onboarding.md`) | the first five minutes, timed |
| Desktop, live | `.shots/desktop/live-*.png` | live backend, real harness | ack, early send, task sent/done/result, On hand, reconnecting |
| Desktop, remote | `.shots/desktop/remote-{conversation,onhand,device-unreachable}.png`, `connect{,-badcode,-revoked}.png` | VM over an SSH tunnel (`research/29`); connect cards headless | Connect to your Ducter, a worker that can't be reached |
| Ducter.app | `.shots/desktop/app-*.png` | setup screens headless (fake backend); `app-live-first-reply` live; `app-dmg-finder`, `app-gatekeeper-macos15` real macOS screenshots; `app-icon` the drawn icon | checking, blocked, name, starting, stopped, CLI offer, Gatekeeper |
| Polish pass | `.shots/desktop/polish-{before,after}-*.png` | native window (cua-driver) on a scripted backend, plus the headless renderer | the components above: buttons, chips, notices, the result sheet, rhythm |
| Taste review | `.shots/desktop/review-{before,after}-{zh-1280,en-900}-*.png` | headless renderer, mock (`DUCTER_REVIEW`) | every screen at 1280 and 900 px, before and after the taste pass |
| Phone web | `.shots/phone-*.png` | headless browser at 390×844 on a demo core; `phone-real-sonnet-result-zh` from a real sonnet run | conversation, decision sheet, decided, On hand, task, result, pairing, notify ask, iOS hint, offline; dark variants |
| Design QA (D73, D74) | `.shots/qa-2026-11-09/{before,after}-*.png`, index in its `README.md` | native desktop window (cua-driver) on the demo seed, iOS Simulator, headless Chromium at 390 and 1440 (phone web, site) | no pills, the result line, the living message, On hand, the one-column task (done, working, didn't work), devices, setup, the site |

## Capability map (D43): the hybrid (D65)

> Status: **decided D65**: the literal playset's world with the loadout's equip snap, still to
> pass a human comprehension test before it ships. No category noun on screen (D66): headings
> say 你的设备，和它们会做的事 / Your devices and what they can do. The research summary below is
> the evidence (`research/24`, `26`, `28`).
> - **research/26 (loadout, the user's mecha/equip feel):**
>   - Loadout as first proposed reads as military: the user as commander (3/3), combat, pilots
>     that can't share a plan, and a floating partner that's still reachable while home sleeps.
>   - **Recommended hybrid:** the playset's world (real device shapes on a sunny mat, literal
>     cards when zoomed out) plus the loadout's characters and **equip snap**.
>   - The partner **rides in a seat on the home device and shares its pulse light**; "home
>     sleeps, so the partner is unavailable" read correctly 3/3 (needs a human test).
>   - Never: weapons, stats, slot limits, hangar or roster screens, "mission", kneeling as
>     sleep, a floating partner, a charging cradle.
>   - **Equip motion:** about 0.6–0.8 s. Lift → drag with lag → slot opens → magnetic pull →
>     50 ms freeze + "tock" + light haptic → bounce → device blinks and nods. The chime fires
>     only once the capability actually works. Reduced motion = cross-fade.
> - **Recommendation:** a *literal playset*. The user's real devices are drawn as chunky toys on
>   a table, with plain cards at zoom-out.
>   - Each AI plan is one block per account, with cords to every device signed into it
>     (shared quota read correctly 11/12 times with cords, vs 0/2 for the Isles woodpile).
>   - Capabilities are cartridges that click into devices.
>   - The partner sits on its home device and naps with it.
>   - Memory is a book in the partner's backpack (read correctly 18/18; the lighthouse got 0/2).
>   - The phone used to reach home is a walkie-talkie (20/20).
> - **Scores:** playset 90, literal cards 80, Isles and the others 66–71, orchestra 55.
> - **Pitfalls found:** sleep reads as "broken"; battery and fuel read as device power; an apron
>   reads as "servant", a baton as "boss".
> - **Caveats:** text-proxy raters only; humans are needed (pass bar ≥80% on key items, no
>   boss or servant reads).
>
> The Isles text below is candidate A, kept for comparison.

### Candidate A: The Isles

**The problem:** "devices, harnesses, subscriptions, browser, computer use, memory, remote
access" is a wall of concepts. Settings lists never make it land.

**The answer:** draw the user's setup as a small archipelago they can see and play with.

#### Why islands (first draft reasoning, not validated)

- **It grows from the theme.** The partner and every task are pebbles, and pebbles live on
  shores and in water, so a sea of islands is their natural world.
- **It encodes real architecture, not decoration.**
  - Devices are separate, isolated islands. They connect only by explicit piers and boats,
    which matches "devices dial out only" and honest isolation.
  - The sea is the network.
- **The verbs are universal and delightful.** Handing work to a device is *skipping a stone*
  (打水漂) from the home isle to another island. Every culture knows it; no pun is needed.
- **It scales:** more devices are more islands, a phone is a boat at the pier, calls later
  are a lighthouse radio.
- **It restyles per theme:**
  - Pebble: a sunny cozy sea.
  - Paper: an old ink sea chart.
  - Midnight: a night sea with sweeping lighthouse beams.
  - Signal: a sonar schematic.
  - Volt: a bold poster map.
- *Rejected:*
  - **Town:** buildings flatten everything into "places", and a town loses isolation and
    distance.
  - **Courtyard:** warm, but cramped beyond 2–3 devices, and cloud machines don't belong in
    a yard.

### The rule: pictures metaphorical, words plain

Labels always say exactly what a thing is ("MacBook · Claude Code", "Browser"). The metaphor
makes things graspable at a glance; it never makes the user guess.

### Mapping

| Picture | Real thing | States shown in the picture |
|---|---|---|
| **Home isle**, where the partner(s) live | The device running the main process | Faces of all personas idle here |
| **Isle** | Any device. A VPS floats slightly above the water, held up by a small cloud | Fog = asleep; storm-grey = offline; a tiny "z" |
| **Workshop hut** on an isle | A harness logged in on that device (Claude Code, Codex, pi) | Chimney smoke = working; **woodpile** = remaining quota; "sign in" sign = logged out |
| **Spyglass** | Browser use on that device | Looking out = in use |
| **Little hands at a desk** | Computer use (cua) on that device | Hands moving = in use; VM bubble around them = isolated VM |
| **Lighthouse** on Home | Nowledge Mem | Beam = connected; dark = unavailable |
| **Pier** + **boats** | Remote access (Ducter Edge or own domain); each paired phone or laptop is a boat | Boat docked = paired; a paper boat floating in = a notification |
| **Pebbles** | Tasks | Skipping across = being handed to a device; resting on an isle = working there; **orange flag** = needs you; mint = done |

### Enabling a capability ("place a piece")

1. A **driftwood shelf** at the bottom holds the available pieces. A locked piece says exactly
   what it needs ("Needs a Mac", "Sign in to Codex").
2. Tap a piece and the **island where it will live glows**. A card shows *what it does* as one
   line plus a 3-second looping mini scene (the spyglass finds a page and fills a form).
3. Confirm. The piece **floats out over the water and lands** on its island with a soft
   bounce and a ripple. Setup steps (official login, permissions) run in a sheet.
   Progress is a tiny scaffold around the piece; health is a small lantern.
4. Problems appear **where they live**: an empty woodpile, a broken pier plank, a fogged isle
   holding a waiting pebble. Tapping one opens the fix.

### Where the Isles appear

- **Onboarding:** the cartoon's last scene pulls back into the Isles, which *is* the live setup
  checklist: Home, this device's isle, at least one workshop, the lighthouse (optional).
- **Devices / settings:** the Isles are that page, with a plain list view beside them for
  accessibility and power users.
- **Anywhere something is missing:** the partner says so in words and links to the Isles,
  zoomed to that island.

### Name

**群岛 / The Isles.** The page title reads "你的群岛 / Your isles". In conversation the
partner says "我放到你的 VPS 那座岛上了 / I sent it over to your VPS isle" only when the
user is on the Isles view. Elsewhere it uses the plain device names.

### Constraints

- Renders in MyGo native UI: flat vector shapes, transforms, and a light isometric tilt. No
  3D engine.
- Every element has a text label and an i18n key.
- Respects reduced motion: stones teleport instead of skipping.

## Art direction (D53)

- **Medium:** puffy matte clay 3D illustrations, pre-rendered as assets and composed in a 2D
  UI (MyGo native). No real-time 3D.
- **Lighting rules:** one soft key light from the top left, gentle ambient occlusion and
  contact shadows. Never glow, neon, bloom, rainbow gradients, lens flare, or over-gloss.
- **Character:** the round-2 clay Ducter (`design/art/concepts/r2/r2_char_clay.jpg`) is the
  identity reference for every pose.
- **Capability screen:** round-2 board v2 (`r2_board_2.jpg`): device cards on the left, the
  hero device on a pedestal with slots, the ability grid on the right, AI-account tokens with
  allowance rings at the bottom.
- **Equip motion:** sticker peel-and-stick (`research/26`, `research/28` timings).
- **Asset pipeline:** generate with the reference images for consistency, select, clean up,
  and export at 1×/2×/3× with transparent backgrounds. Only final exports go into git, plain
  git with no LFS (D64); raw generations stay in the concept-art canvas. Labels are always live UI text, never
  baked into art.
