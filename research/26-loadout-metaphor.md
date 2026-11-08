# 26: The loadout direction for the capability map (D43)

Researched 2026-11-08 as a follow-up to `research/24`. The user likes the recommended *literal
playset* but wants it to feel like a **mecha suit-up / game-character loadout**: a character with
equipment slots, gear snapping on with a satisfying, fluid (舒爽) feel. This report tests that
direction against the same hidden setup, rubric and LLM-proxy method as `research/24`.

**Labels.** **V** = verified this session (a page I searched or fetched, or my own experiment).
**K** = established work cited from prior knowledge, not re-fetched. **I** = my inference.

The structural truths R1–R9 are the ones in `research/24` (partner is a peer; home sleeps ⇒
partner unavailable; devices dial out to home only; quota is per account; memory belongs to the
persona; the phone for access is a remote, not a worker; tasks go to one device and run in parallel).

---

## 1. Precedents and craft

### 1.1 Loadout, assembly and suit-up

| Precedent | What it does well | What to take / avoid | Label |
|---|---|---|---|
| **Destiny, the Ghost** | A small floating companion that is "companion, scout, librarian, and mechanic" to its Guardian; Bungie recast it (Dinklage → Nolan North, *The Taken King*, 2015) to give it more personality and to "follow you all the way through the game" | Take: a companion with a face that lives beside you and holds knowledge. Avoid: the Ghost exists to serve and resurrect a soldier, which is a servant/soldier frame | V ([Destinypedia](https://www.destinypedia.com/Special:MobileDiff/83547), [Game Informer](https://gameinformer.com/b/news/archive/2015/08/04/destiny-recasts-its-most-important-character-with-nolan-north-9709), [GamesRadar](https://www.gamesradar.com/destinys-changed-ghost-get-story-out-grimoire-and-game)) |
| **Halo, Cortana** | The AI rides *inside* the armour on a chip, so where she lives is visible and physical | Take: the companion has a *seat* on one machine. This became the fix that made R2 legible (§3) | K |
| **Destiny / Genshin equip screens** | The character turns to face you, the new piece appears on the body at once, and a diff panel shows what changed | Take: show the change *on the character*, not in a list. Avoid: number diffs (they read as power levels, §3) | K |
| **Armored Core VI assembly** | Left panel shows how a part changes that slot, right panel how it changes the whole AC; a load limit makes an overweight build unable to sortie | Avoid: slot limits and trade-offs. Ducter capabilities are not scarce, and a slot grid implies a cap | V ([Gigazine](https://gigazine.net/gsc_news/en/20230825-armoredcore-vi-fires-of-rubicon-assemble), [Dot Esports](https://dotesports.com/?p=942424)) |
| **Monster Hunter equipment box** | Equipment previews on the hunter before you commit; the box is a calm room, not a menu | Take: preview-on-hover. Avoid: grind and crafting materials (chores) | K |
| **Zelda TotK, Ultrahand / Fuse** | Parts stick together with a visible green "glue", and the sound team says the glue was easy to render as real-world audio; the sound system combines abstract sounds per object, without hand-authoring each | Take: a visible join material and a physical, slightly wet click; joins always succeed visually | V ([Nintendo Ask the Developer vol. 4](https://www.nintendo.com/sg/interview/totk/04.html), [GDC 2024 talk](https://www.gdcvault.com/play/1034667/Tunes-of-the-Kingdom-Evolving)) |
| **Gundam Breaker** (Gunpla) | Mixing parts from different kits on one body; the joy is the toy kit, not the war | Take: the model-kit idiom (runner tabs, snap-fit) is warm and hobbyist | K |
| **Mega Man Legends, Roll** | The support character who builds and fits your parts is a friend and a peer, not a quartermaster | Take: the person who fits gear is the partner, as an equal | K |
| **Gundam catapult launch / Evangelion launch** | Ritual: locks release one by one, a callout, a launch | Avoid: checklists, clamps, alarms. Eva's launch is deliberately ominous and institutional, the opposite of 放心 | K |
| **Iron Man, Mark 42 suit-up** (*Iron Man 3*) | Pieces fly to the body and each lands with its own clank; sequence reads as competence | Take: staggered arrivals. Avoid: the heavy metallic clank and shockwave | K |
| **Custom Robo, Medabots, Zoids** | Pocket-size robots; Medabots put a *personality medal* in a body of swappable parts; Zoids were wind-up toy kits | Take: small, collectible, toy-scale. All three are still fighting franchises, so weapons must stay out | K |
| **Astro Bot** (Team Asobi) | A cute robot world where touch is the design: a dedicated small "DualSense 2.0" team prototyped haptic techniques, and abilities grew from them | Take: warmth comes from scale, roundness and touch, not from story | V ([TechRadar](https://www.techradar.com/gaming/consoles-pc/team-asobi-says-astro-bot-will-push-the-dualsense-controller-to-a-new-level), [GFinity](https://www.gfinityesports.com/article/astro-bot-developer-created-a-team-just-for-dualsense-features)) |
| **Apple MagSafe, Nintendo Switch Joy-Con "click"** | A magnetic pull for the last few millimetres, then a signature sound (Switch's reveal trailer was built around the Joy-Con snap) | Take: the most loved non-military snaps are consumer hardware. Pull-in + short click + small confirm = the target | K |

### 1.2 Game-feel literature

| Source | Claim | Label |
|---|---|---|
| **Swink, *Game Feel* (2008)** | Feel = real-time control + simulated space + **polish** (effects that sell the physicality of an interaction without changing it) | K |
| **Jonasson & Purho, "Juice it or lose it"** (Nordic Game 2012) | Tweening/easing on position, rotation and scale; colour; random delay; trails; screen shake. "Juicy" feels more fun and more professional. Counter-talk "Don't juice it or lose it" warns that juice can bury the information | V ([lecture summary](https://medienwissenschaft.uni-bayreuth.de/wp-content/uploads/GxD-10-Game-Feel.pdf), [Game Developer](https://gamedeveloper.com/design/video-is-your-game-juicy-enough-), [summary](https://gamejuice.pages.dev/articles/juice-it-or-lose-it-lessons)) |
| **Nijman, "The art of screenshake"** (2013) | Same toolbox for impact; still a primary reference alongside Swink | V (cited as primary in [AIIDE paper](https://ojs.aaai.org/index.php/AIIDE/article/download/18889/18654/22655)) |
| **Sakurai on hitstop** (Famitsu col. 490; YouTube 2022) | Freeze on impact sells weight; he *caps* the freeze, and the shake decays across it; a few frames blend into the reaction | V ([Source Gaming translation](https://sourcegaming.info/2015/11/11/thoughts-on-hitstop-sakurais-famitsu-column-vol-490-1/), [Automaton](https://automaton-media.com/en/news/20220824-15208/)) |
| **Disney's 12 principles** | Anticipation, squash and stretch, follow-through and overlapping action, slow in / slow out | K |
| **Apple HIG, Playing haptics; WWDC23 "Animate with springs"** | Haptics short and tied to discrete events; the light impact is for small UI objects colliding; don't overuse. Springs are set by two numbers, duration and bounce (session example 0.6 s / 0.2), and bounce 0 is valid | V ([HIG](https://developer.apple.com/design/human-interface-guidelines/playing-haptics), [UIImpactFeedbackGenerator](https://developer.apple.com/documentation/uikit/uiimpactfeedbackgenerator), [WWDC23 10158](https://developer.apple.com/videos/play/wwdc2023/10158/)) |

### 1.3 Recipe: what makes a snap feel 舒爽 (I, assembled from the above)

1. **Anticipation on pick-up.** The module lifts (scale up, shadow grows and softens) so the hand
   knows it holds something.
2. **Lag-and-tilt while dragging.** The module trails the pointer on a spring and tilts toward
   its velocity. This is Swink's "simulated space": it has weight.
3. **The world answers before contact.** Only the valid slot opens and glows as the module comes
   near (TotK's highlight, MagSafe's ring).
4. **Magnetic last stretch.** Inside a capture radius the system takes over and pulls the module
   home. The user can't miss, as in Townscaper (`research/24`). This is most of the "fluid".
5. **Contact = one crisp event.** Squash for one beat, a tiny hitstop (capped, far shorter than a
   fight game's), a short click and one light haptic, *all on the same frame*. Synchrony of sight,
   sound and touch makes the satisfaction; volume doesn't.
6. **Settle with overshoot, then follow-through.** A small bounce, then the *character* reacts
   (eyes blink on, a nod), 150–250 ms later. The reaction makes it a creature, not a menu.
7. **Reward with meaning, not numbers.** A one-line card plus a 3 s loop of *what it does* (D43).
   A climbing stat reads as a power level (§3).
8. **Honest two-stage.** The snap is the request; real setup (sign-in, permissions, install) may
   take minutes. A rounded "booting" shell shows that work; the success chime plays only when the
   capability actually works. Juice must never lie (the Trash-eject rule in `research/24`).

**Warm, not military** (I; the cold column is what the as-proposed scene got, §3):

| Cold mecha cue | Warm Pebble replacement |
|---|---|
| "Ka-chunk", clamp, shockwave ring, screen shake | Soft "tock" + rising two-note chime; squash-and-bounce; no shake |
| Hangar, armory rack, roster, HUD hexes, hazard stripes | Sunny play mat, a tray of rounded modules, Pebble press shadows |
| Stat number climbs, rarity colours | One literal ability line + a mini loop |
| Weapons, "scout", "sortie", "mission", "deploy" | Tools (visor, helper hands, antenna); verbs stay the glossary's (事 / Task) |
| Kneeling with a dark visor (reads as disabled) | Sitting with knees folded, breathing light, "z" (napping figure) |
| Pilot in a cockpit (one body, one pilot) | Pilot figure standing *outside*, linked by ribbons to every frame |

---

## 2. Mapping and false implications

**B** = loadout as proposed. **C/D** = loadout with fixes (D = C plus two more fixes after the
first test round, §3). Shared fixes from `research/24` (one source per account with visible links;
calm sleep) were applied to B as well, so B fails only on what is loadout-specific.

| Real | B. As proposed | False implications of B (evidence) | Fix (C/D) |
|---|---|---|---|
| R3 device | A toy mech per device | Mechs are combat vehicles; a mech may be read as *the AI* (B sonnet picked the tall mech as the AI) | **Device-shaped toy frames**: the real silhouette (a lid, a chassis) with toy traits (feet, visor eyes, slots) on a sunny mat. Labels and pictures still agree |
| asleep | Kneels, head down, visor dark | Disabled or broken (named as the likely misread 1/3); "asleep *because* pilot has no stamina" (1/2) | Sitting with knees folded like a napping figure, breathing light, "z". **No charging cradle** (C's cradle read as charging 3×) |
| R2 home | The tall mech in the middle | Nothing ties the companion to it | Home frame has a **seat in its chest** where the companion rides; their lights **share one pulse** (D) |
| R1 partner | A floating companion beside you (Ghost/Cortana) | Free-floating ⇒ "still reachable when home sleeps" (0/3 right in B); the Ghost is a servant to a soldier (1/3 "partner/servant") | The pebble face (not a new one-eyed robot) riding in home's seat; it hops out to greet you and returns. When home sleeps, it curls up and the mat dims |
| R7 memory | Data core inside the companion | Fine (read right), but a core reads as its power source | Notebook in the companion's backpack (18/18 in `research/24`, 4/4 here) |
| R4/R5 harness + account | Pilots in cockpits; one stamina bar per pilot in a top roster | **One-at-a-time** (2/3: "a subscription can't run on two machines at once"); stamina = fatigue, "top them up"; roster/pilots ⇒ you are the commander | Pilot figures stand *outside* on pads at the mat's edge, each with **one ring** (refills by itself) and **ribbons to a badge** on every frame signed in. Cockpits are empty |
| R6 capabilities | Gear modules in slots (scout visor, manipulator arms) | Weapons/combat (3/3 "mild combat" or "fighters"); slots imply a cap and trade-offs (AC VI); equipping raises a stat (2/2) | Rounded **tool modules**; slots appear only while a module is held (no visible cap); the tray never empties (capabilities are not scarce). VM computer use = helper hands under a glass dome; host-screen = no dome |
| R6 phone use / calls (later) | Companion drone; comms module | A drone flies, implies autonomy and surveillance; "comms module" collides with R8 | Phone use = a real phone figure on the mat, **cabled to its host frame**, wearing a module. Calls = a "phone line" module on the mat edge (cloud service, not a device) |
| R8 remote access | Comms link to the user's phone | Fine (20/20 in `research/24`, 4/4 here) | Walkie-talkie handset with a dotted wave to home's antenna |
| R9 tasks | Mission cards dispatched to mechs | Missions imply danger, briefings and a commander ("!" read as alarm) | Task pebbles, unchanged (`ui.md`). 事 / Task stays the word; no "mission" anywhere |
| needs you | "!" card flying at you | Alarm | Pebble raises a hand and hops toward you |
| equip | "Ka-chunk", flash, shake, stat climbs | Power-up, upgrade, maybe purchase (§3) | The §1.3 recipe; reward is an ability line + loop |
| user | (implicit) the player in the hangar | Commander (3/3) | Owner/friend at the mat's edge, beside the companion; nobody issues orders in the picture |

**Remaining false implications of D** (I, partly V): pilots can still read as "people/helpers"
(1/3) and rings as machine batteries (1/3); a mat still implies co-location (mitigated as in
`research/24`); toy robots may trivialize for heavy users (same mitigation: literal labels, L1
cards at zoom-out).

---

## 3. Comprehension test

**Method.** Same preamble, hidden setup, system prompt and probe 1 (12 items) as `research/24`.
Probe 2 was rewritten for this question (tending; does the laptop share an allowance; asleep vs
broken; role of the AI *and of you*; can you talk to the AI if its machine sleeps; what stands
for subscriptions and can one run on two machines at once; fighting or danger; where the blue
task runs; do machines talk directly; likely misread). Probe 3 adds a one-paragraph equip
animation per scene (A: cartridge into the cloud box; B: visor "ka-chunk" with flash, shake and
a stat climb; C: the §1.3 snap). Scenes (240–267 words) and outputs are in the scratchpad,
`exp-metaphor2/scenes/` and `exp-metaphor2/out/`.

- **A** = playset, as finally recommended in `research/24` §6 (plan blocks with rings and cords,
  no batteries, closed lid with breathing light).
- **B** = loadout as proposed.
- **C** = loadout with fixes: play mat, device-shaped frames, companion perched on home's
  shoulder, pilots outside with ribbons, charging cradle for sleep.
- **D** = C with two changes after round 1: the companion rides in a chest seat on home and
  shares its pulse; the cradle is replaced by a napping pose.

Calls: probe 1 × {haiku, sonnet} and probe 2 × {haiku, haiku, sonnet} for A–D, probe 3 ×
{haiku, sonnet} for A–C: **26 `claude -p` calls**, `--no-session-persistence --tools ""`, cwd
`exp-metaphor2`. It created no `~/.claude/projects` folder (diffed before and after; two new
folders appeared from an unrelated `ducter-live` process and were left alone). Graded by me
against the key. n = 2–3 per cell: directional only.

### 3.1 Results (V)

| Probe | A playset | B loadout as proposed | C fixed | D fixed v2 |
|---|---|---|---|---|
| Probe 1 score, haiku / sonnet (of 12) | 12 / 12 | 12 / 10.5 | 12 / 12 | 12 / 12 |
| Shared quota read right (p1 #4 + p2 b) | 5/5 | 4/5 | 5/5 | 5/5 |
| One subscription can run on two machines at once (p2 f) | 3/3 | **1/3** | 3/3 | 3/3 |
| Asleep, not broken (p2 c) | 3/3 | 3/3 | 3/3 | 3/3 |
| …but "broken" named as the likely misread (p2 j) | 1/3 | 1/3 | 0/3 | 0/3 |
| Sleep tied to battery/charging or to quota | 0 | 1 (sonnet: asleep *because* stamina ran out) | **3 mentions** (cradle = charging) | 0 |
| **Home sleeps ⇒ can't talk to the AI** (p2 e, truth: no) | 1/3 | **0/3** | 0/3 | **3/3** |
| Role of the AI | partner, partner, **pet** | partner, partner, **partner/servant** | partner ×3 | partner ×3 |
| Role of the user | owner, friend, owner | **commander ×3** | owner, owner, owner/commander | owner, owner, owner/friend |
| Soldier reads | 0 | 0 | 0 | 0 |
| Fighting or danger suggested (p2 g) | 0/3 | **3/3 mild** ("toy-war styling", "mechs look like fighters") | 0/3 | 0/3 (one true read: "may act on my computer") |
| Where the blue task runs (p2 h) | 3/3 | 3/3 | 3/3 | 3/3 |
| Machines talk directly (p2 i, truth: no) | 2/3 | 3/3 | 3/3 | 3/3 |
| Will I tend things (p2 a, truth: no) | no, no, occasionally | unclear, no, "top them up" | no, no, "keep pilots topped up" | no, no, rarely |
| Equip: says what was gained, on which machine (p3) | 2/2 | **1/2** ("can't tell what it does") | 2/2 | — |
| Equip read as a stat / level-up (p3 4) | 0/2 | **2/2** | 0/2 | — |
| Equip feel (p3 6) | toy; "satisfying" | game; "slight military feel" | toy; "satisfying… doesn't feel military" | — |

### 3.2 Findings

1. **The loadout direction is not the problem; its military idiom is.** With the same structure,
   B lost on exactly the loadout-specific cues: commander 3/3, combat 3/3, stat-up 2/2, and pilots
   in cockpits read as one-at-a-time (2/3). C/D, with toy frames, tools and the warm snap,
   matched the playset on every probe and lost none of the loadout's game feel ("satisfying",
   "toy or game"). (V)
2. **A seat beats a perch.** The first picture in either study to convey R2 ("if home sleeps,
   the partner is unavailable") was D: 3/3, against 0/3 for the floating companion (B), 0/3 for
   the shoulder perch (C), 1/3 for the playset's pebble on the keyboard (A), and 0/10 across all
   of `research/24`. The cue that did it is the *shared pulse* between the companion and home's
   power light, plus the seat (Cortana in the armour). Port it back to the playset too. (V)
3. **A floating companion teaches a falsehood.** Destiny's Ghost is free-floating, and so the
   raters concluded the partner survives home sleeping (B 0/3). The companion can float out to
   greet, but its resting place must be home. (V)
4. **Pilots work only outside the cockpit.** A pilot inside two cockpits confused raters ("a pilot
   can't be in two places at once"); a pilot standing apart with ribbons to badges read as
   shared, concurrent quota 5/5 and 3/3. Residual risk: pilots read as people (1/3). Plan blocks
   (A) score the same on structure, so pilots are a taste choice, not a legibility win. (V)
5. **Anything that charges reads as battery.** The C cradle reintroduced `research/24`'s finding 3
   (sleep = charging) in 3 answers; the napping pose removed it. A ring can still read as a
   battery (1/3 in D), so the plain label "Claude Max · 用完了，15:00 回来" stays mandatory. (V)
6. **Juice that implies numbers misleads.** A climbing stat made 2/2 raters think the machine
   became stronger, and one rater could not say what was gained. Showing *the ability* (a tiny
   loop of browsing) made 4/4 name the capability and the machine. (V)
7. **Caveats.** Text proxies, n = 2–3, a ceiling effect on probe 1, and I wrote scenes and key.
   D was revised after seeing C, so its 3/3 on R2 is a hypothesis to confirm with humans, not a
   result. The proxy cannot judge motion feel; §4's spec must be judged in a prototype. (I)

### 3.3 Rubric (same weights as `research/24`; I, informed by §3.1)

| Cand. | Leg | Fid | Scale | State | Emo | Dist | Feas | **Total** |
|---|---|---|---|---|---|---|---|---|
| **D loadout, fixed (hybrid)** | 5 | 5 | 4 | 5 | 5 | 5 | 4 | **96** |
| A playset (`research/24`) | 5 | 4 | 4 | 5 | 5 | 4 | 4 | 90 |
| B loadout as proposed | 4 | 2 | 3 | 4 | 3 | 5 | 3 | 69 |

D's fidelity rises over A only because of the R2 seat; port the seat to A and they tie on
structure. D wins on distinctiveness and on the user's stated feel.

---

## 4. Recommendation

**Hybrid: keep the playset's world and truths, adopt the loadout's character and equip
interaction.** In one line: *your real devices as little toy frames on a sunny mat; your partner
rides in the home frame; tools snap onto frames like model-kit parts.*

- **World (from the playset):** a sunny play mat, not a hangar. Frames keep their real device
  silhouettes, so "MacBook Air" on the label matches the picture. L1 cards at zoom-out.
- **Characters (from the loadout):** each device gains a face (visor eyes) and slots; the
  partner pebble rides in home's chest seat and shares its pulse; pilot figures for each AI
  account stand at the mat's edge, ring overhead, ribbons to every frame signed in. (Or plan
  blocks: the test can't separate them. Pilots are warmer; blocks are more literal.)
- **Interaction (from the loadout):** the equip snap below is the signature moment of D43 and of
  onboarding's last scene.
- **Never:** weapons, stats, rarity, slot caps, hangar or roster UI, "mission/sortie/deploy",
  kneeling-as-sleep, charging cradles, a free-floating partner.

**Main tradeoff:** robot faces on every device add charm and a bit of noise (more faces than
the one partner). Keep device faces minimal (two visor dots, no mouth); only the partner has
the full pebble face. **Alternative:** the plain playset (A) plus the R2 seat and the same snap
spec: less distinctive, a little more literal, just as legible.

**Human gate:** as in `research/24` §6, plus three items: 0 commander/soldier reads; ≥ 80%
answer "no" to "can I talk to it if home sleeps"; ≥ 80% name what equipping gained, and on which
device.

### 4.1 Motion spec: the equip moment (Pebble, `motion.personality = bouncy`)

Springs are given as (duration, bounce) in the WWDC23 parameterization so MyGo and Expo can map
them to stiffness/damping; the bezier is the fallback.

| # | Phase | Trigger | Motion | Timing / easing | Sound | Haptic (mobile; trackpad: none) |
|---|---|---|---|---|---|---|
| 1 | Pick up | press on a module in the tray | Lift: scale 1.00 → 1.08, press shadow grows 4 → 10 px and softens; a ghost copy stays in the tray (not scarce) | spring (0.22 s, 0.25) | soft "pip", −24 dB relative to UI peak | selection tick |
| 2 | Drag | move | Follows pointer on a spring with lag; tilts ≤ 8° toward velocity; valid frames lift their eyes to look at it; invalid ones dim to 60% | spring (0.30 s, 0.15) | none | none |
| 3 | Approach | within 96 pt of a valid slot | Slot opens (a rounded socket scales in 0 → 1), glow ring breathes; frame leans toward it 4° | spring (0.25 s, 0.3) | faint rising hum | none |
| 4 | Capture | within 32 pt, or release anywhere inside 96 pt | System takes over: module pulled home | spring (0.18 s, 0) | none | none |
| 5 | Contact | arrival frame | Module squashes to 0.92 × 1.06 for 1 frame; **hitstop 50 ms** (whole frame holds, capped, no shake); a small join flash in `accent` at 40% | 50 ms hold | **"tock"** (wood/plastic, ~40 ms, no metal) | `impact .light` (iOS) / short click (Android) |
| 6 | Settle | after hitstop | Module overshoots and settles; frame bobs down 3 px and back | spring (0.35 s, 0.35) | — | — |
| 7 | Follow-through | +150 ms | Frame's visor eyes blink on through the module, small nod; the partner pebble glances and smiles | 220 ms, ease-out `cubic-bezier(.2,.8,.2,1)` | two-note chime, rising major third, soft | none |
| 8 | Setting up | if setup is needed | A rounded "booting" shell orbits the module; a sheet asks for sign-in or permission; the frame waits calmly | loop 1.2 s, linear | none | none |
| 9 | Works | capability verified | "What it does" card rises: one line + 3 s loop of the frame doing it on this device | spring (0.4 s, 0.2), 240 ms after verify | third chime note (completes the arpeggio) | `notification .success`, **only here** |

- **Locked module** (e.g. computer use needs a Mac): on drop, the module does two gentle side
  wobbles (±6 px, 240 ms total, no buzz-shake), floats back to the tray, and the frame shows
  the literal need ("需要一台 Mac / Needs a Mac").
- **Setup fails:** the module pops softly back out to the tray (spring 0.3 s, 0.2) with a reason
  chip on the frame. No red flash, no error sound.
- **Unequip:** pull the module off; reverse of 6 → 4 with a lower "tock"; confirm only if tasks
  are using it.
- **Totals:** pick-up to settled ≈ 0.6–0.8 s; everything after contact is interruptible
  (tap elsewhere and it completes instantly).
- **Reduced motion:** no tilt, squash, hitstop or bob; the module cross-fades into the slot
  (150 ms), sounds and haptics stay.
- **Sound rules:** every sound ≤ 300 ms; off when the system is muted; no metallic clank,
  sirens or voice callouts.
- **Tokens:** add `motion.snap.{lift, follow, capture, settle, hitstop}` and
  `sound.{pip, tock, chime}` to the theme schema, so Volt can be snappier and Paper calmer.

---

## Implications for Ducter

- If the user agrees, the D-entry for D43 should record "playset world + loadout equip", and
  `ui.md` replaces candidate A with it. The R2 **seat with a shared pulse** applies whichever
  candidate wins.
- Glossary: no new user-facing words. 设备 / Devices, 事 / Task, plan names stay literal;
  "frame", "pilot", "module", "seat" are visual only. "Mission" must not enter copy.
- The data model already needs account → devices (`research/24`); this adds nothing new.
- The theme schema gains the snap motion and sound tokens above.
- Prototype: one canvas with the four scenes of `research/24` §6 redrawn as frames, plus the
  equip moment as a clickable interaction (desktop and mobile, reduced motion).

## Summary

The user's loadout direction tested well once it was kept toy-like. As proposed (hangar, pilots
in cockpits, "ka-chunk", stats, missions, a free-floating companion), it leaked commander 3/3,
combat 3/3, stat-ups 2/2 and one-pilot-at-a-time 2/3. A fixed version kept the game feel without
those reads, and matched the playset on every probe. It also produced the first legible R2
across both studies (3/3): the partner rides in a seat on home and shares its pulse. Recommended:
a hybrid with the playset's world (real device silhouettes on a sunny mat) and the loadout's
characters and equip snap. The snap follows a 9-phase spec (pick-up, drag, magnetic capture,
50 ms hitstop with "tock" and a light haptic, settle, follow-through, honest setup, success
chime only when it works). The decision gate is a human test.
