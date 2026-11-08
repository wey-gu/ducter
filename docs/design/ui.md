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

- color: bg `#FFF6EA`, surface `#FFFFFF`, ink `#2B2118`, ink-muted `#7A6A58`, accent `#FF8A3D`,
  decide-surface `#FFE3CF`, decide `#9A3F0E`, ok-surface `#C9F2C7`, progress-surface `#DCEFFF`,
  user-bubble `#7CC6FF`, line `#E8D9C4`, highlight `#FFE9A8`
- type: Bricolage Grotesque (500/700/800) + Noto Sans SC
- shape: radius 14/20/26/pill, chunky and slightly irregular avatar
- depth: `press`, a 3–4px solid offset in a darker tint of the surface
- motion: bouncy; buttons press down on tap

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
  app. Structured things (decisions, files, summaries) are white cards with a press shadow.
- **Task glyph:** each task is a small irregular pebble in its state color. Pebbles are the
  only peripheral signal in the conversation view.
- **Decision buttons:** primary `Go / 好` (or the action itself, e.g. "Rebase") as a dark
  press-down pebble button; secondary `Hold / 先等等` as a light press-down button; tertiary
  `Reply… / 回复…` as a text button. No seals or stamps (D22).

## Three zoom levels (Core UI canvas: https://claude.ai/artifact/U9r15Tpm8AL7aGQZwrtbDL)

1. **The conversation** (default). One partner, no machinery. Tasks appear only as pebble
   chips inside the partner's messages, and as the pebble row on the **手头 / On hand**
   button. The living message carries decisions inline with Go / Hold / Reply, so most days
   the user never leaves this view.
2. **手头 / On hand** (overview for decisions, all personas).
   - The top band is the **attention forecast**: counts per state, plus a timeline from now
     showing when each task will next need you (defaults taking effect, expected completions,
     conclusions due). The user's quiet hours are drawn as a band.
   - Below it are four lanes: **等你 / Needs you** (wide decision cards with the question,
     default, countdown, and Go / Hold / Reply), **在做 / Working**, **在等 / Waiting**
     (dashed, showing what it waits for), and **做完了 / Done** (with "核对中 / checking"
     for `done?`).
   - Lanes can be grouped by state, time, device, project, or persona. A "Go on all
     defaults" batch action sits in the header.
   - On mobile, decisions are a swipeable stack: swipe left takes the default, swipe right
     means later.
   - Routines appear as one card each, with the next firing time.
3. **An opened task** (conductor depth).
   - A breadcrumb leads back up through the levels.
   - The Where and Project chips are editable. The model chip opens switching or handoff.
   - A decision banner is pinned on top.
   - Three columns:
     - the transcript: brief, collapsed tool calls, checkpoint dividers, report cards, and a
       composer that talks to the task *directly*;
     - tabs for changes, terminal, CI, browser, and results;
     - a dossier: why this model, checkpoints, evidence, pending intents.

## Prototype canvases

| Canvas | URL | Covers | Status |
|---|---|---|---|
| Style Directions | https://claude.ai/artifact/8MchNob8LFMSoKsGgX6v1H | 5 themes on one screen | reviewed (Pebble chosen) |
| Core UI | https://claude.ai/artifact/U9r15Tpm8AL7aGQZwrtbDL | 3 zoom levels, desktop + mobile | draft (vocabulary updated) |
| Flows | https://claude.ai/artifact/LKuVp3knPDJ4EdoyWBGSWN | 21 key screens for groups A, B, D, E, C | draft |
| Concept art | https://claude.ai/artifact/HAPoyBbrSkm6sYjqGoNMze | character and screen art directions, rounds 1–2 | round 2 recommended: puffy matte clay |
| Loadout (2D) | https://claude.ai/artifact/CUpw7P1bPjKQKQYeLkUVzG | devices / AI accounts / ability-sticker interaction | grammar prototype; art to be replaced |

## Capability map (D43): metaphor UNDER EVALUATION

> Status: **awaiting the user's decision** (`research/24`, `research/26` done).
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
