# 28: A 2D visual grammar for the capability map, learned from games

Researched 2026-11-08. The capability map (D43) is decided as **2D, not 3D**. `research/24`
chose a literal playset, `research/26` added the loadout snap and the partner's seat on home,
and `research/27` named the rack items 本事 / Abilities (verb 装上 / Add to, result "MacBook
现在会上网了"). This report studies how 2D games draw equipping, slots, characters in places,
shared resources and state. It turns that into a grammar for Pebble, proposes the screen, and
runs a cheap proxy check on the three riskiest relationships.

**Labels.** **V** = verified this session (a page I searched, or my own experiment). **K** =
established knowledge, not re-fetched. **I** = my inference or judgment.

**The relationships** (this brief's numbering, not `research/24`'s):

| # | Must be instantly legible |
|---|---|
| R1 | The partner lives on **one** home device. If home sleeps, the partner is unavailable |
| R2 | Devices are awake / napping / offline. **Napping is not broken** |
| R3 | AI plans are signed in on some devices. **One quota per account**, shared by all its devices; it must not read as a device battery |
| R4 | Abilities are added to a specific device; that device "can now …" |
| R5 | A task (事) runs on one device with one AI plan; states needs you / working / waiting / done |
| R6 | Remote access links the user's phone to home |
| R7 | Memory (Nowledge Mem) belongs to the partner |

---

## 1. What 2D games do

### 1.1 Equipping, slots and costs

| Game | Concrete UI | Take | Avoid | Label |
|---|---|---|---|---|
| **Hollow Knight, charms** | A grid of round charm icons; equipping drops one into a row of **notches** at the top, and each charm costs 1+ notches. The Knight starts with 3 notches and can reach 11. Equipping past the limit "overcharms" (doubled damage), shown by the notch row glowing pink | The equip target is a *visible row* of sockets, so the effect lands somewhere you can see. A charm keeps its icon when equipped, so the grid and the body speak one language | Costs and caps. Ducter abilities are not scarce, and notches teach budgeting | V ([wiki: Charm Notches](https://hollowknight.wiki/w/Charm_Notches), [Overcharmed](https://hollowknight.wiki/w/Overcharmed)) |
| **Kirby, copy abilities** | Since *Kirby Super Star* (1996) each ability gives Kirby a **hat** that hints at it: a crown of flames for Fire, a starred jester cap for Beam (Beam Kirby also turns yellow). An icon card at the screen corner names it | **The gained ability changes the look of the one who has it.** No list is needed: you see that Kirby *can* do fire. This is R4's "device can now …" | Kirby holds only one ability at a time; Ducter devices hold many | V ([WiKirby: Copy Ability](https://wikirby.com/wiki/Ability), [Giant Bomb](https://giantbomb.com/wiki/Games/Kirby_Super_Star)) |
| **Splatoon, gear abilities** | Each gear piece has one main-ability chip and up to three sub-slot chips, drawn as small round icons on dark circles under the item, with empty slots shown as hollow circles | Small round **ability chips** that sit on the thing they modify, readable at thumbnail size | Empty hollow slots invite filling, which is a chore (I) | K |
| **Pokémon, party / box / held items / types** | Party of 6 as a vertical list; a held item is a tiny bag icon on the sprite; types are coloured pill chips with the type name | Pill chips with a word (types) are the most portable 2D "label + colour" in games. A tiny overlay icon on a portrait says "has something" | The 6 cap and the box (storage that implies inactive, collected things) | K |
| **Slay the Spire, relics and energy** | Relics are a row of icons along the top bar, always visible, with a counter digit where relevant. Energy is a big **orb** at the bottom left with "3/3" that refills at each turn start | **A single orb that refills by itself is the clearest "renewable budget" glyph in 2D games**, and it belongs to the *player*, not to any card | The orb is per turn and spent by you; quota is spent by tasks over hours (I) | K |
| **Hades, keepsakes and boons** | Keepsakes hang on a rack in the House; Zagreus wears one at a time (picking a second replaces the first) and it ranks up after 25 and 50 encounters. Boons are offered as three large cards with the god's portrait and colour frame | God colour on every boon frame ties each power to its giver. The keepsake rack is a calm, physical "shelf of things to take" | One-at-a-time and rank-up levels both contradict R4 (`research/27`: no levels) | V ([Fextralife: Pierced Butterfly](https://hades.wiki.fextralife.com/Pierced+Butterfly), [Hades Wiki](https://hades.fandom.com/wiki/Keepsakes/Hades_II)) |
| **Into the Breach, mechs and pilots** | Each mech card has a separate **pilot portrait** with its own skills; mechs without one run on an "Artificial Pilot". The pilot is a person who carries over between timelines; the mech is the body. Justin Ma: "sacrifice cool ideas for the sake of clarity every time"; every enemy shows its intent before it acts | The **separation of identity (pilot) from body (mech)** is exactly R3's account vs device. And telegraph intent: show what will happen before it does | One pilot per mech, one mech per pilot. A shared account on two devices breaks that, and `research/26` found pilots in cockpits read as one-at-a-time (2/3) | V ([wiki: Artificial Pilot](https://intothebreach.fandom.com/wiki/Artificial_Pilot?oldid=3703), [Game Developer on clarity](https://gamedeveloper.com/design/-i-into-the-breach-i-dev-on-ui-design-sacrifice-cool-ideas-for-the-sake-of-clarity-every-time-), [GDC 2019 postmortem](https://gdcvault.com/play/1025772/-Into-the-Breach-Design)) |
| **Stardew Valley, tools** | A tool upgrade changes the tool's **colour and material** in the hotbar (copper, steel, gold, iridium), and the item stays in the same slot | Change *in place*: the thing keeps its spot and gains a look | Upgrade tiers (a level system) | K |

### 1.2 Characters, places, relationships and shared resources

| Game | Concrete UI | Take | Avoid | Label |
|---|---|---|---|---|
| **Stardew Valley, friendship and map** | A row of 10 hearts per villager in a social tab; the map shows where villagers are now as head icons on the town map | Head icons *on a map place* = "this person is here now" | Heart meters make relationships a score to grind | K |
| **Hades, relationship hearts** | Each character has a heart track in the Codex; gifting Nectar fills it | (as Stardew) | A score on a partner contradicts "partners, not hierarchy" (I) | K |
| **Animal Crossing, NookPhone and DIY** | The phone is a chunky rounded device with a grid of big app tiles; DIY recipes are paper cards you "learn" once, then craft at any workbench | **Rounded phone tiles with a single soft colour each** are the house style for "your own phone". A recipe learned once and used anywhere = per-account knowledge | DIY materials (chores) | K |
| **Into the Breach, the board** | Buildings show a grid-power bar at the top that all mechs defend together: one shared resource drawn once, not per mech | One shared bar, drawn once, at the top | It is a health bar that drops on damage, which reads as danger (I) | K |
| **Mini Metro / Mini Motorways** | Lines are single bold colours passing through stations; capacity is a carriage count on the train. Jamie Churchman's GDC 2017 talk, "When Less Is More", is about what the minimal visual design did and did not convey | **A coloured line is the cleanest 2D "these belong to the same thing"**; colour identity per line | Lines between stations imply stations connect to each other. Ducter devices never talk to each other, only to home (`research/24`) | V ([GDC 2017 listing](https://gdconf.com/news/attend-gdc-2017-and-learn-the-value-of-less-is-more-from-a-mini-metro-dev)); rest K |
| **Overcooked, stations** | A task (an order) sits at a station with a circular progress ring over it; a burning pan flashes and beeps | Progress lives *on the station doing the work* | Flashing alarms and time pressure | K |
| **Duolingo, path, hearts and streak** | Hearts and streak are per account, shown in the top bar on every device; a lesson path of round chunky nodes with press-down shadows; Duo has dozens of emotional poses | **Per-account resources sit in the top bar, not on any device**; the round press-down node is Pebble's own idiom; character emotion carries state | Guilt-driven streaks | K |

### 1.3 State: sleep, illness, waiting, done

| Game | Concrete UI | Take | Avoid | Label |
|---|---|---|---|---|
| **Cult of the Lamb, followers** | Status shows as a small bubble over the head: "Zzz" when tired, a sick follower lies in bed with a green tint. Exhausted followers fall asleep where they stand | A **thought-bubble chip over the character** is the most readable state slot in 2D | Green-sick tint and vomit: illness cues that would make napping read as ill | V ([Steam thread on "Zzz"](https://steamcommunity.com/app/1313140/discussions/0/4295942652159329124), [wiki](https://cultofthelamb.wiki.gg/wiki/Followers)); icons K |
| **Neko Atsume** | Cats curl up on cushions, eyes as closed arcs; all the visual noise is in the pose, not in the HUD | Closed-arc eyes + curled pose = asleep and content, with no text | (none) | K |
| **Tamagotchi** | The creature lives *inside* the egg's screen; when the device sleeps the screen shows the creature asleep, lights off | The character's home is the device; device state and character state are one | When the creature is ill a skull appears, and death exists. Never borrow death or illness | K |
| **Animal Crossing villagers** | Houses go dark at night; a sleeping villager can't be visited | Darkness on the *home* = whoever lives there is asleep | (none) | K |

### 1.4 Craft references for premium, tactile 2D

| Reference | What makes it premium | Label |
|---|---|---|
| **Nintendo flat promo art** (Kirby, Animal Crossing, Splatoon key art) | One light direction (top-left), a soft rim light, a solid contact shadow, saturated but limited palettes, thick rounded silhouettes readable at thumbnail size | K |
| **Monument Valley** (Ken Wong, GDC 2015 "The Art of Monument Valley") | Fixed angle, a tiny palette per screen (coverage says about three colours per object), flat faces lit by tone not texture. Calm comes from restraint | V ([GDC Vault](https://gdcvault.com/play/1022476/The-Art-of-Monument), [Kill Screen](https://killscreen.com/monument-valley-elegance)) |
| **Alto** | Layered parallax planes and colour-graded atmosphere make flat shapes feel deep | K |
| **Headspace** | Blobby characters, flat fills, faces of two dots and a curve; emotion through squash and timing | K |
| **Kurzgesagt** | Strict shape language, inner highlights on every shape, long soft gradients, lively secondary motion | K |
| **Linear illustrations / Arc browser** | Grain over gradients, a single accent, playful 2D squish on interaction (Arc's boosts and spaces) | K |
| **Apple Memoji stickers, vinyl stickers** | A white die-cut border, a soft drop shadow, a slight gloss highlight; it reads as an *object* you could peel | K |

**Cross-cutting lessons** (I):
1. **Equip lands on the body.** Hollow Knight's notches, Kirby's hat and Stardew's recoloured tool
   all show the result *on the thing that gained it*, never only in a list.
2. **Identity is separate from body.** Into the Breach's pilots, Hades' god colours and Duolingo's
   top-bar hearts all put the *owner* of a resource outside the bodies that use it.
3. **State lives in a bubble over the character, and in its pose.** Cult of the Lamb's bubbles and
   Neko Atsume's poses are faster to read than any HUD.
4. **Clarity beats cool** (Into the Breach): telegraph what will happen.

---

## 2. The grammar, relationship by relationship

Each row: 2–3 encodings drawn from §1, their false implications, and a pick. Proxy evidence is
from §4.

### R1. The partner lives on one home device

| Encoding | Source | False implications |
|---|---|---|
| **a. Lives in home's screen window**: the partner pebble sits *inside* a rounded window cut in the home sticker; its cheek glow pulses with home's power light; a small roof tab marks home | Tamagotchi, Cortana's chip (`research/26`) | "Ducter *is* the MacBook" (named 2/2 as the likely misread, V); other devices with screens might also hold one |
| b. Sits on a cushion on top of home, tied with a ribbon | Neko Atsume | Decorative mascot (1/2, V); it could hop off to another device |
| c. Stands in the doorway of a house in the centre; devices around it | Hades' House, Stardew farmhouse | The house is a separate place from the MacBook (2/2 said "separate", V); it adds a fake object (a house that isn't a device) |

**Pick a.**, the screen window with a shared pulse. It is the only one that ties the partner to
the device's power (the cue that made `research/26` D pass R1 3/3), and its misread ("Ducter is the
MacBook") is mostly harmless and fixed by the label "Ducter · 住在 MacBook Air / lives on MacBook
Air". **Key finding (V): the static placement alone never conveyed "home sleeps ⇒ unavailable"**:
0/6 "no" (6/6 "unsure") across all three, and the full scenes 0/2. In this run, raters told to
use only the picture would not infer the consequence. So R1 has to be *shown as a state* rather
than implied by placement:
- **Home napping:** the whole map dims one step; the partner curls up asleep inside the window with
  the same "z"; a line below: "Ducter 跟着 MacBook Air 睡了 · 打开盖子就醒 / Ducter is asleep with
  MacBook Air · open the lid to wake it".
- **On the phone while home sleeps:** the conversation shows the same sleeping pebble, not a typing
  box. That is where the user actually learns R1.

### R2. Awake / napping / offline

| Encoding | Source | False implications |
|---|---|---|
| **a. Eyes and dusk**: awake = dot eyes + gentle idle bob; napping = screen dusky blue, eyes as closed arcs, a drifting "z", a moon chip, slow breathing; offline = flat grey, no eyes, a signal-gap chip | Neko Atsume, Cult of the Lamb, Animal Crossing night | Asleep 4/4, worry 1/5 4/4, but 2/2 still named "broken" as the likely *misread* (V) |
| b. Nightcap and blanket for napping | Cartoon sleep | Asleep 2/2, but "sick" named as a misread 1/2 (a blanket reads as illness, V) |
| c. Lid closed / screen off, literal | `research/24` | Literal, but at thumbnail size a closed lid looks like "off" (`research/24`: sleep read as broken 6/10) |

**Pick a.** Two fixes from the run (V):
- **Offline must not be a pulled plug.** "Plug pulled out" was read as "plug it back in" 4/4, which
  is false for a VPS the user can't touch. Use a **signal gap** instead: the device's thin link to
  home shows a break with three faded dots, and the line is "联系不上 · 上次见到 2 小时前 / Can't
  reach it · last seen 2h ago". Offline is grey *and* has no face, so it differs from napping in
  lightness, shape and motion, not only hue (the `ui.md` rule).
- **Waiting work on a napping device needs words.** The dashed pebble above the Mac mini was read as
  "pending" but 0/4 said it would resume on wake. Its chip says "醒来就接着做 / continues when it wakes".

| State | Face | Body | Motion | Chip / line |
|---|---|---|---|---|
| Awake | two dot eyes, occasional blink (3–6 s random) | full colour | idle bob 2 px, 3 s | none (silence = fine) |
| Napping | closed arcs | screen tinted dusk blue `#5C6FA8` at 35% | breathing scale 1.00 ↔ 1.015, 4 s; "z" drifts every 2.5 s | moon chip "在睡 · 醒来就接着做 / Napping · continues when it wakes" |
| Offline | no eyes | desaturated to `ink-muted` at 60% opacity; border stays solid (dashed is reserved for waiting tasks) | still | signal-gap chip "联系不上 · 2 小时前 / Can't reach · 2h ago" |
| Busy | eyes glance aside (as the partner's working face) | full | a task pebble sits on it | the task pebble carries the state |

### R3. AI plans and shared quota

| Encoding | Source | False implications |
|---|---|---|
| **a. Plan tokens with one ring and cords**: a top shelf "AI 套餐 / AI plans" holds one round token per account, with a self-refilling ring and a plain line; thin cords in the plan's colour run to a small pin on each signed-in device; pins have no ring | Slay the Spire orb + Mini Metro colour lines + Duolingo top bar | Count = 1 (2/2), drain shared (2/2), not battery (2/2) (V). Cords could imply devices connect to each other: run every cord from the token, never device-to-device |
| b. Pilot figures with a ring overhead; each device shows a small portrait of its pilot | Into the Breach | Same scores as a (count 2/2, drain 2/2, V). Pilots read as people/helpers (`research/26` 1/3), and portraits on two devices hint at copies |
| c. Matching pins only; the ring in the header, no cords | Duolingo, Pokémon type chips | Count 2/2, but **drain 0/2** ("no lines, so it doesn't show how they are linked", V) |

**Pick a.**, tokens with cords (or b if the user prefers characters; they test the same). Pins
alone are not enough: the visible link carries the sharing. **No variant conveyed concurrency**:
"can both use Claude at the same time" was "unsure" 6/6 (V). Fix it with motion, not more objects:
when two tasks run on Claude at once, **small sparks travel down both orange cords at the same
time**, and the token's line reads "2 个事在用 · 还剩 60% · 15:00 回满 / used by 2 tasks · 60% left ·
refills 15:00". The ring is a **clockwise arc that refills by itself** (never a vertical bar, a
battery tip, or fuel). The question "is it a battery?" was leading, so the 6/6 "not battery" result
is weak (I); keep the literal line mandatory.

### R4. Abilities on a device

| Encoding | Source | False implications |
|---|---|---|
| **a. Ability sticker + look change**: a round die-cut sticker peels off the 本事 tray and sticks to the device's side; the device gains a tiny accessory that shows the ability (a little globe antenna for 上网, helper-hand mitts for 用电脑, a handset nub for 打电话) | Kirby's hats + Splatoon chips + vinyl stickers | Accessories could be read as decorations or cosmetics (I); keep them tiny and always paired with the sticker |
| b. Charms in notches on each device | Hollow Knight | Costs, a cap, budgeting (rejected in `research/26`) |
| c. Held-item badge on the device corner | Pokémon | One item per device |

**Pick a.** The result line "MacBook Air 现在会上网了" read correctly 2/2 in the full scenes and
4/4 in `research/27` (V). Slots appear only while a sticker is being dragged; the tray never empties
(the sticker leaves a ghost copy), so nothing reads as scarce. Locked stickers show the literal need
("需要一台 Mac / Needs a Mac").

### R5. Tasks

| Encoding | Source | False implications |
|---|---|---|
| **a. Task pebbles sit on their device**, coloured by state, with a tiny dot in the plan's colour at their edge (which AI) | `ui.md` pebble glyph + Overcooked stations + Cult of the Lamb bubbles | The plan dot can be missed; it is secondary on purpose |
| b. Task cards in lanes, with device and plan chips | On hand view | No *where* at a glance; fine for On hand, wrong for this map |
| c. Pebbles travel along the plan's cord | Mini Metro trains | Implies the task lives in the plan, not on the device |

**Pick a.** The en rater read needs-you / working / waiting correctly 3/3; the zh rater read the
orange hand-raising pebble as "active on this machine", not "needs you" (V). Fix: the needs-you
pebble **turns to face the viewer and hops toward the edge nearest the user**, with the
`decide` colour and a chip "等你 / Needs you". State encodings (all from `ui.md` semantic colours):

| State | Pebble | Motion | Bubble chip |
|---|---|---|---|
| 等你 / Needs you | orange `#FF8A3D`, eyes on you, one raised nub hand | hops 2× toward you every 6 s, then rests | "等你" + the question's first words |
| 在做 / Working | blue `#4BA8F0`, eyes glancing at its work | a small sparkle orbits it, 1.6 s | none |
| 在等 / Waiting | yellow `#FFC94D`, **dashed outline** | still, slow blink | the reason: "在等 PR 被批 / Waiting for PR approval", or "醒来就接着做" on a napping device |
| 做完了 / Done | green `#7FD99A` | one nod, then floats to the On hand tray after 2 s | "做完了 ✓" (✓ as a drawn tick, not an emoji) |
| 没成 / Didn't work | rose `#E5577A`, flat-bottomed (sits, doesn't roll) | still | the reason in plain words |

### R6. Remote access

| Encoding | Source | False implications |
|---|---|---|
| **a. Phone sticker at the map edge sending a dotted wave to an antenna on home** | `research/24` walkie (20/20) + NookPhone | zh rater: "you can wake it up from outside" (1/1, V) |
| b. String-and-cups line from phone to home | craft toy | A physical wire; the phone seems like a device on the map |
| c. The phone as another device on the map | literal | It looks like a worker, not a remote |

**Pick a.**, placed *off the mat* at the user's edge so it reads as yours, not as a worker. Label it
"能远程打开 / Can be reached from anywhere" and, to stop the wake misread, show the wave reaching a
sleeping home as a wave that stops short with "MacBook Air 在睡，醒来就能连上 / asleep; reachable
when it wakes" (I, untested).

### R7. Memory

| Encoding | Source | False implications |
|---|---|---|
| **a. A notebook tucked beside the partner in its window** | Hades Codex (Zagreus' own book), `research/24` 18/18 | Unlabelled, it was read as "a notebook, purpose unclear" 2/2 (V) |
| b. A glowing jar of thoughts | Inside Out | Fragile, can spill or be lost |
| c. A lighthouse or library building | Isles | 0/2 in `research/24` |

**Pick a., always labelled** "Ducter 记得的事 / What Ducter remembers". The book travels with the
partner pebble when it hops out to greet you, so it never sits on a device by itself.

---

## 3. Juice and craft

### 3.1 The equip moment in 2D (adapts `research/26` §4.1)

The 3D snap becomes a **sticker peel-and-stick**. Same timings, springs and sound tokens.

| # | Phase | 2D motion |
|---|---|---|
| 1 | Peel | Press: the sticker's corner curls up (a 2-step sprite or a skew + gradient fold), the white die-cut border catches a highlight, the shadow grows 4 → 10 px. A ghost copy stays in the tray |
| 2 | Drag | Sticker follows with spring lag, tilts ≤ 8° toward velocity; valid devices look at it; invalid ones dim to 60% |
| 3 | Approach | A soft dashed circle opens on the device's side (the only time a slot exists) |
| 4 | Capture | Magnetic pull, spring (0.18 s, 0) |
| 5 | Stick | Squash 0.92 × 1.06 for one frame; 50 ms hitstop; "tock"; light haptic; **4–6 star-confetti sparks** in `accent` and `highlight` burst out radially and fall with gravity in 300 ms |
| 6 | Smooth down | The sticker flattens: a highlight sweeps across it left to right (180 ms), like a thumb pressing a sticker down |
| 7 | Look change | The accessory pops on with a "puff" (3 small cloud circles, Kirby-style), the device blinks and nods |
| 8 | Setting up | If setup is needed, the sticker shows a rotating dashed ring; the chime waits |
| 9 | Works | Result line rises: "MacBook Air 现在会上网了"; final chime note; success haptic only here |

Rules: no screen shake anywhere (it reads as damage). Locked sticker = two side wobbles and back to
the tray. Remove = peel off in reverse with a lower "tock". Reduced motion = cross-fade, sounds stay.

### 3.2 What makes 2D feel premium (I, from §1.4)

1. **Layering.** Three planes: the cream mat (with 3% paper grain), the stickers, and floating
   chips/bubbles. Bubbles parallax 1.5× the stickers on scroll or tilt.
2. **One light.** Top-left. Every shape gets an **inner highlight** (1.5 px, white at 55% along the
   top-left inside edge) and the Pebble **press shadow** (solid, 3–4 px, darker tint, offset down).
   A soft ambient contact shadow under raised stickers.
3. **Sticker material.** Device and ability stickers get a 3 px white die-cut border and a faint
   gloss band; it is what makes them feel like objects you can peel.
4. **Texture.** Fine grain (monochrome noise at 3–4%) on large fills and gradients only; never on text.
5. **Hand-made edges.** Silhouettes are slightly irregular (the Pebble avatar rule), drawn *once*
   per shape. No line boil: it reads as jittery in a UI (I).
6. **Motion with secondary action.** Every primary move has a follow-through (the nod after the
   stick, the "z" after the eyes close). Springs from the theme's `motion.snap.*` tokens.
7. **Restraint.** Monument Valley's lesson: few colours per screen. Plan colours and state colours
   are the only saturated hues; devices are cream/white stickers with ink outlines.

---

## 4. Proxy comprehension check (V)

**Method.** 18 `claude -p` calls on Haiku, `--no-session-persistence --tools ""`, cwd
`scratchpad/exp-2d`. A shared preamble (ordinary non-programmer user, a flat 2D sticker screen,
three devices) plus one variant paragraph per call, unlabelled where possible, and the instruction
"answer from the picture alone". 2 calls each for R1 a/b/c, R2 a/b and R3 a/b/c (16), and one
full recommended scene each in en and zh (2). The one `~/.claude/projects` folder the run created
was deleted. Prompts: `scratchpad/exp-2d/run.py`; outputs: `scratchpad/exp-2d/out/`.

| Item (truth) | Variant: result |
|---|---|
| R1 where the partner lives (on home) | a window 2/2 · b cushion 2/2 · c house 0/2 ("in the house", separate from the MacBook) |
| R1 home sleeps ⇒ can't chat (no) | a 0/2 · b 0/2 · c 0/2 · full scenes 0/2; **all "unsure"** |
| R1 role | partner 6/6 |
| R2 napping = asleep, not broken | a eyes/dusk 2/2 · b nightcap 2/2 (one "sick" misread) |
| R2 worry about napping device (1 = none) | 1 in 4/4 |
| R2 offline (pulled plug) | "unplugged, plug it back in" 4/4 |
| R2 dashed pebble resumes on wake | 0/4 (all "pending, unclear") |
| R3 one Claude allowance | a 2/2 · b 2/2 · c 2/2 · full 2/2 |
| R3 heavy VPS use drains the MacBook's Claude (yes) | a cords 2/2 · b pilots 2/2 · **c pins only 0/2** |
| R3 both can use Claude at once (yes) | 0/6, all "unsure" |
| R3 ring ≠ battery, refills by itself | 6/6 (leading question) |
| Full: napping Mac mini not broken | 2/2 |
| Full: ability sticker | 2/2 |
| Full: phone wave = remote access | 2/2 (zh adds "can wake it", false) |
| Full: notebook = memory | 0/2 (unlabelled) |
| Full: task pebble states | en 3/3 · zh 2/3 (needs-you missed) |
| Full: your role | owner 2/2; 0 boss or commander |

**Findings.**
1. **Shared quota needs a visible link.** Cords or pilot portraits: 4/4 drain. Matching pins
   without links: 0/4. The count of allowances was right everywhere (8/8).
2. **Concurrency and "home sleeps ⇒ unavailable" are consequences, and a static picture doesn't
   carry them** (0/6 and 0/8). With "answer from the picture alone", raters said "unsure" rather than
   guess. `research/26` got 3/3 on R1 with a looser prompt, so the two results are compatible: the
   seat makes the right answer *plausible*, and showing the state makes it *visible*. Design
   consequence: show both as **states with motion and a literal line** (sparks on two cords; the
   partner asleep with home, also on the phone).
3. **Napping reads as asleep and calm** (8/8 across scenes; worry 1). "Broken" is still the named
   misread in 3/4, so the literal chip stays.
4. **A pulled plug is a false instruction** for a cloud machine (4/4 "plug it back in"). Use the
   signal gap.
5. **Unlabelled props fail** (notebook 0/2); labels always state the literal thing (AGENTS.md).

**Limits.** Haiku as a proxy, n = 2 per cell, one model, I wrote scenes and key, and the "is it a
battery?" wording led. Motion was described, not shown. Humans decide (§6).

---

## 5. Screen composition: 你的设备和本事 / Your devices and abilities

### 5.1 Desktop (≥ 1024 pt)

```
┌───────────────────────────────────────────────────────────────────────────┐
│ ← 对话   你的设备和本事 / Your devices and abilities         [卡片视图 ▤]  │
│ AI 套餐 / AI plans:  (◔ Claude Max · 还剩 60% · 15:00 回满)  (◕ Codex)   │  top shelf: plan tokens
│            ╲ orange cords ╲            ╲ green cord                       │
│   ┌──────────┐      ┌────────┐      ┌────────┐                           │
│   │⌂ MacBook │      │  VPS   │      │Mac mini│   mat: device stickers in │
│   │ [◕‿◕] nb │      │ (••) cl│      │ (‿ ‿) z│   an arc, home at left of │
│   │ ●orange  │      │●orange │      │●green  │   centre, larger          │
│   │ (o)上网  │      │ ◌ 在做 │      │ ┄ 在等 │   ability stickers on     │
│   └──────────┘      └────────┘      └────────┘   sides, task pebbles on top│
│  (phone)~~~~▸ antenna    "能远程打开"                                      │
│ ───────────────────────────────────────────────────────────────────────── │
│ 本事 / Abilities:  (上网) (用电脑) (打电话) (用手机·需要一台 Mac)          │  bottom tray
└───────────────────────────────────────────────────────────────────────────┘
```
(Sketch only: `nb` = notebook, `cl` = cloud, `(o)` = ability sticker, `◌` working pebble, `┄` dashed waiting pebble.)

- **Three bands, top to bottom: plans (shared), devices (where), abilities (what).** Shared things
  are above the devices, as Duolingo's per-account top bar; things you add are in a tray below,
  as Hollow Knight's charm grid under the notch row. Dragging is always *downward-to-upward*: from
  tray onto device.
- **Home** is left of centre, about 1.25× size, with the roof tab, the partner in its window and the
  notebook. Other devices fan out in an arc by "last used". Cords run only from tokens to pins.
- **Selecting a device** opens a side sheet (not a new page): "MacBook Air 会：上网 · 用电脑 /
  can: …", its plans, its tasks, its state line. **Selecting a token** highlights its cords and the
  devices it reaches; everything else dims to 50%.
- **Card view** (the L1 view from `research/24`) is the same data as a grid of plain cards, for
  accessibility and power users; one toggle.

### 5.2 Phone (< 600 pt)

- Plan tokens become a horizontal chip row pinned at the top; tapping one draws its cords down the
  screen and dims the rest.
- Devices stack as one sticker per row (home first, larger), each row with its pins on the left,
  ability stickers on the right and task pebbles on top. Cords become short coloured ticks at the
  row's left edge that light up on token tap (the full cord drawing is desktop-only).
- The 本事 tray is a bottom sheet; **long-press a sticker and drag it up onto a row**, or tap it and
  pick a device ("装到 MacBook Air 上 / Add to MacBook Air"). Haptics as in `research/26`.
- Remote access is not drawn on the phone map (you are holding the phone); it is one row in the
  device sheet: "这台手机能远程打开 MacBook Air / This phone can reach MacBook Air".

### 5.3 Consistency with the conversation and On hand

| Element | Conversation | On hand | Devices and abilities |
|---|---|---|---|
| Task pebble | chips in the partner's messages; row on the On hand button | lanes by state | sits on its device |
| State colour, outline, motion | the same tokens (`ui.md` semantic colours; dashed = waiting) | same | same |
| Partner face | the speaker | header | in home's window |
| Device chip | `Where` chip "MacBook Air" | group-by-device lanes | the sticker itself |
| Plan colour dot | on the model chip of an opened task | on each card's corner | the token and pins |

Rules (I):
- **One glyph per object everywhere.** A pebble is always a task; a sticker with a white border is
  always a device or ability; a round token with a ring is always a plan. Nothing else uses those
  shapes.
- **Tap through.** Tapping a pebble on the map opens that task (zoom level 3). Tapping a device chip
  in a task's Where opens this map zoomed to that device. Grouping On hand by device shows each
  lane header as the same small device sticker.
- **Problems surface in words in the conversation** and link here ("Codex 额度用完了，15:00 回来 ·
  看看 / Codex is used up until 15:00 · see"), opening the map with that token selected.

---

## 6. Open items and human gate

- **Human test** (extends `research/24` §6 and `research/26` §4): the full 2D still plus two short
  state clips (home falls asleep; two tasks spark down one cord). Pass ≥ 80% on: shared quota and
  drain, concurrency (after the clip), home sleeps ⇒ unavailable (after the clip), napping ≠ broken,
  offline ≠ "plug it in", needs-you pebble in zh and en; 0 boss or commander reads.
- Tokens vs pilots for R3 tied in the proxy; choose on taste (tokens are more literal; pilots
  warmer but risk "helpers").
- The remote-wave "can wake it" misread fix is untested.

## Implications for Ducter

- `ui.md` capability map: once the user agrees, record the 2D grammar (three bands; home window with
  shared pulse; tokens with cords; sticker abilities with look change; pebbles on devices; signal
  gap for offline) and replace the Isles text.
- Glossary additions to propose through the change loop (none are new objects): "AI 套餐 / AI
  plans" as the shelf heading, "在睡 / Napping", "联系不上 / Can't reach", "醒来就接着做 /
  continues when it wakes", "Ducter 记得的事 / What Ducter remembers", "能远程打开 / Can be reached
  from anywhere" (from `research/27`).
- The theme schema gains `illustration.{grain, inner-highlight, sticker-border, light-direction}`
  and `motion.snap.peel`, so other themes can render the same grammar in their own idiom.
- Data model: the map needs per-plan "tasks using it now" to animate concurrency, and a device's
  last-seen time for the offline line.

## Summary

From Hollow Knight, Kirby, Splatoon, Pokémon, Slay the Spire, Hades, Into the Breach, Stardew,
Animal Crossing, Mini Metro, Overcooked, Duolingo, Cult of the Lamb, Neko Atsume, Tamagotchi and
2D craft references, the grammar is: **plans on a top shelf as tokens with one self-refilling ring
and cords to pins on each signed-in device; devices as white-bordered stickers on a cream mat with
Neko-Atsume faces (dot eyes awake, closed arcs and dusk blue napping, grey with a signal gap
offline); the partner living in home's screen window with a shared pulse and a labelled notebook;
abilities as stickers peeled from a bottom tray that give the device a Kirby-style accessory and
the line "现在会…了"; task pebbles sitting on their device in the `ui.md` state colours.** The equip
is a sticker peel-and-stick on `research/26`'s timings. An 18-call Haiku check confirmed one
shared allowance (8/8), that drain needs a visible link (cords or pilots 4/4, pins alone 0/4),
napping ≠ broken (8/8), and owner not boss (2/2). It also found that static pictures don't convey
concurrency (0/6) or "home sleeps ⇒ unavailable" (0/8), so both must be shown as animated states
with literal lines, and that a pulled plug falsely tells you to plug a VPS back in (4/4). The
decision gate is a human test.
