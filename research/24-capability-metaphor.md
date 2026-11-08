# 24: A metaphor for the capability map (D43)

Researched 2026-11-08 for D43 ("enabling capabilities is game-like and visual: you see *where*
a capability lives and *what* it does"). The current candidate is the Isles (`docs/design/ui.md`,
"Capability map"). The user rejected choosing it by extending the Pebble theme
(pebbles → shores → islands). AGENTS.md requires at least 5 candidates including "no
metaphor", a mapping table with false implications for each, a rubric, and a comprehension test.

**Labels.**
- **V**: verified this session, either on a page I fetched or searched, or in my own experiment.
- **K**: established literature cited from prior knowledge; not re-fetched this session.
- **I**: my inference or judgment.

**What has to be legible.** These are the real things, taken from the product model, `research/21`,
`research/22` and `research/23`:

| # | Real concept | Structural truth a picture must not contradict |
|---|---|---|
| R1 | Partner (main AI), named, with a face; several personas later | You talk only to it. It is a peer, not a boss or a servant (glossary rule) |
| R2 | Home device (runs the main process) | The home also does work. **If home sleeps, the partner is unavailable** (`research/21`: the main AI needs an awake machine) |
| R3 | Devices (Mac, Linux box/VPS, later Android/iPhone) | Separate machines. They **dial out to home only** and never talk to each other. They can be asleep or offline |
| R4 | Harness login (Claude Code, Codex, pi) on a device | A program installed per device, signed in to an account |
| R5 | Subscription / quota | **Per account, not per device.** One Claude Max account signed in on two devices shares one quota. Quota refills on its own by time window; the user tends nothing |
| R6 | Capabilities on a device | Browser use; computer use, either on the host screen via cua-driver or in an isolated VM via Lume/cua (`research/23`); later phone use, which needs a tethered phone and a host (adb, or Mac + Xcode, `research/22`) and calls, which are a cloud service rather than a device |
| R7 | Memory (Nowledge Mem) | Belongs to the persona's identity, not to a device |
| R8 | Remote access (Ducter Edge relay, or a custom domain) | A way **for you to reach** the partner. A paired phone here is a remote control, not a worker |
| R9 | Tasks | Flow from the partner to one device. States: working, waiting (with a reason), needs you, done, didn't work. Mostly independent and parallel, not in sync |

---

## 1. Precedents: what made invisible systems legible and loved

| Precedent | What worked | What failed, and the lesson | Label |
|---|---|---|---|
| **Xerox Star / Mac desktop** | Concrete nouns (document, folder) with direct manipulation; Smith et al. designed the nouns first and the verbs second (Byte 1982) | Classic breakdown: **dragging a disk to the Trash ejected it** on the Mac, a metaphor-implied action that meant the opposite. *Every verb a picture invites must be true* | K |
| **Alan Kay, "User Interface: A Personal View"** (1989/90) | "User illusion." The metaphor (paper) is only a starting point: "it is the magic, understandable magic, that really counts." Don't carry physical limits into software | *Use real nouns, add magical behaviour; don't simulate a world* | V ([pdf](https://www.dgsiegel.net/files/refs/Kay%20-%20User%20Interface:%20A%20Personal%20View.pdf)) |
| **Halasz & Moran, "Analogies Considered Harmful"** (CHI '82, pp. 383–386) | An analogy is structurally partial. Novices must sort valid inferences from invalid ones before they know enough to do so | *Each extra metaphor object multiplies the inferences a user must reject* | V (citation, via secondary) |
| **Carroll, Mack & Kellogg (1988)**, "Interface metaphors and user interface design" | Mismatches can be productive if they are *discoverable and safe* | Mismatches that are silent, or that cost something, erode trust | K |
| **Blackwell (thesis 1998; TOCHI 13(4) 2006)** | Empirically, metaphor's benefit in diagrams is **mainly mnemonic**. It does little for problem solving, and its importance is "greatly over-stated" | *Don't expect a metaphor to explain; expect it to help people remember and like it.* Explanation comes from structure and labels | V ([thesis](https://www.cl.cam.ac.uk/~afb21/publications/thesis/index.html), [dblp](https://dblp.dagstuhl.de/rec/journals/tochi/Blackwell06.html)) |
| **Lakoff & Johnson (1980)**; **Hurtienne & Israel (TEI 2007)** | Image schemas (CONTAINER, LINK, SOURCE–PATH–GOAL, NEAR–FAR, UP–DOWN) are understood pre-culturally and pre-linguistically, and work as interaction primitives | *Build on schemas (a cord = linked, inside = contained, hopping toward you = coming to you), not on domain stories (islands, kitchens)* | K |
| **Norman, conceptual model / system image** (*Design of Everyday Things*) | The user builds their model only from the system image. If the picture differs from the system, the user's model is wrong | *The map is the system image, so a false implication in it is a product bug* | K |
| **Microsoft Bob / Magic Cap** (rooms, hallway, "Downtown") | Friendly at first, and Magic Cap was well crafted | The literal metaphor was "extended further than it should" for consistency's sake. It grew **tedious for experienced users**, and it added a translation layer between person and task | V ([Stanford HCI](https://hci.stanford.edu/publications/bds/7p-bob.html), [nathan.com](https://nathan.com/ixd-blast-from-the-past-2-magiccap/)) |
| **Skeuomorphic → flat** (iOS 7, 2013), **NN/g 2017** on flat UI | Flat removed costume | Weak signifiers cost attention and caused uncertainty (NN/g eye-tracking) | K. *Realism isn't the point; signifiers are* |
| **Harry Beck map → Mini Metro / Mini Motorways** | Beck chose topology over geography (rejected in 1931 as "too revolutionary", then canonical). Mini Metro turns a system into a playable Beck diagram | Transit implies **routes you design** and continuous travel | V ([press kit](https://dinopoloclub.com/press/index.php), [pocketgamer](https://www.pocketgamer.com/mini-metro/mini-metro-challenges-you-to-provide-subway-services-for-a-rapidly-growing-city/)) |
| **Townscaper** (Stålberg) | Placing a block can never fail: the system makes every placement look good, and that is the delight | *Placing a piece should always produce something pretty; failure states show as gentle needs* | K |
| **Monument Valley** | One focus and one affordance per screen; the beauty is in the reveal | Impossible geometry is fine for puzzles, but deadly for a map of truth | K/I |
| **Animal Crossing / cozy games** | Real-time clock; nothing punishes; gentle "come back later" states | Cozy games create **chores**: they *want* you to tend. Ducter's north star is the opposite ("silence means success") | K/I |
| **Wii Channels** | Borrowed an everyday structure (a TV channel grid) people already knew; panes and the name were chosen together, and the team asked "what could be discarded" | | V ([Iwata Asks](https://iwataasks.nintendo.com/interviews/wii/wii_channels/0/1)) |
| **Duolingo path** (Nov 2022) | A single linear path for "more guidance, less complexity" | Backlash: a petition and critiques that "learning isn't linear". *A shape imposes a behaviour: a path implies order* | V ([blog](https://blog.duolingo.com/new-duolingo-home-screen-design), [NBC](https://www.nbcnews.com/tech/tech-news/duolingos-update-redesign-luis-von-ahn-interview-rcna44655), [uxdesign.cc](https://uxdesign.cc/down-the-wrong-path-the-disaster-of-the-latest-duolingo-ui-update-a4cdd1e6ea1c)) |
| **Apple Home / Find My** | Here the "metaphor" is literal: real rooms, device pictures and tiles. Find My draws *your actual devices* | Home's room model breaks for things that aren't in a room (hubs, scenes) | K. *Literal with craft is Apple's answer* |
| **Tailscale / ZeroTier admin** | Machines are shown as a **list** with status, not a topology map | | I (from product use). *Mesh maps turn into hairballs; vendors avoid them* |
| **Home Assistant** | Powerful | It exposes entity / device / area / integration concepts that users must learn, a known source of confusion | K/I. *Don't make users learn the object model* |
| **Raycast Store** | Each extension is a card with one line, a screenshot, and one-click install | | K. *Model for "what it does" cards* |
| **Factorio / Satisfactory** | Flow is visible (belts), and bottlenecks appear **where they occur** | Its legibility depends on the player having built the system; the complexity is the game | K/I |
| **Kitchen ticket rail / KDS** | Tickets move through stations with very readable states | Implies a customer/servant role and time pressure | K |
| **Conductor imagery** (the product name evokes it) | The conductor coordinates many players | Implies **one score played in sync** and command from a podium | I |

**Distilled rules from the precedents.**
1. Blackwell: the metaphor's job is memorability and affect. Structure and labels do the
   explaining.
2. Halasz & Moran, and the Trash-eject breakdown: every object adds inferences, so cut objects.
3. Kay and Apple: **real nouns plus magic verbs** beat simulated worlds.
4. Image schemas (link, contain, near/far, toward-you) are the cross-cultural core.
5. Bob, cozy games, Duolingo: the scene must imply no chores, no order, no rank.

---

## 2. Candidates and mappings

Ten candidates. A–H are metaphors; L1 and L2 are "no metaphor", that is, literal. Each mapping
is the most faithful version I could design. Where a fix discovered in this study applies
naturally (one shared supply with visible lines), I applied it to that candidate, except the
Isles, which I kept as written in `ui.md`.

### 2.1 Mapping table, part 1

| Real | A. Isles (as in ui.md) | B. Town | C. Transit map | D. Restaurant | E. Orchestra |
|---|---|---|---|---|---|
| R1 partner | Pebble on the home isle | Pebble at the window of the central house | Face in the hub interchange | Waiter in an apron at your table | Conductor with a baton |
| R2 home | Home isle | Central house | Hub station | Main kitchen | Podium + front section |
| R3 device | Isle; a VPS floats on a cloud | House / tower across a river | Terminal station | Kitchen station / food truck | Section of chairs |
| R4 harness | Workshop hut (roof colour) | Workers inside the house | Line colour | Cook (hat colour) | Players (shirt colour) |
| R5 quota | **Woodpile per hut** | Power station with wires to houses | Gauge in the legend | Gas tank with hoses | Sheet-music stack |
| R6 browser / computer | Spyglass / hands in a bubble | Roof telescope / hands in a greenhouse | Magnifier icon / hand-in-box icon | Shopping bike / robot arm in a glass case | Spyglass-horn / hands in a glass box |
| R7 memory | Lighthouse | Library | Book icon by the hub | Waiter's little book | Score on the stand |
| R8 remote | Pier + boats | Post office + messenger | Dotted line to a phone station | Wall phone with a cord to a mobile | Mic with a radio wave |
| R9 tasks | Pebbles skipping across water | Parcels | Trains | Order tickets | Notes |
| asleep / offline | Fog + "z" / storm grey | Lights off, curtains drawn | Grey station | Stove off, cook dozing | Section in darkness |
| needs you | Orange flag | Flagged parcel at the door | Flagged train at the hub | Waiter brings the ticket to your table | Note turned to the audience |

### 2.2 Mapping table, part 2

| Real | F. Workshop floor | G. Desk & cubbies | H. Garden | L1. Literal cards (no metaphor) | L2. Literal playset (no metaphor, toy-rendered) |
|---|---|---|---|---|---|
| R1 | Pebble at the front desk | Pebble on the desk | Pebble on a bench | Pebble on the laptop picture | Pebble sitting **on the real home device** |
| R2 | Front bench | Open cubby | Bed by the bench | Card for the home device | That device; when it sleeps, the pebble naps with it |
| R3 | Bench / mezzanine bench | Cubby | Garden bed | Card with a device illustration | Toy-rendered real device (MacBook, mini, Linux box on a cloud, phone) |
| R4 | Robot | Token | Gnome | Tile | A provider **plug** in the device's socket |
| R5 | Wall battery with cables | Ink bottle | Rain barrel with hoses | Ring-gauge tile + thread | One **plan block** per account at the table's edge, with **cords** to each device signed in |
| R6 | Magnifier / hands in a glass box | Magnifier / hands in a jar | Scarecrow with spyglass / cloche | Icon tiles | Chunky **cartridges** in device slots: globe+cursor; screen under a glass dome = VM (no dome = host screen); later a real phone tethered to its host, and a "phone line" block for calls |
| R7 | Notebook | Notebook | Notebook | Book icon | **Book in the pebble's backpack** (travels with the persona) |
| R8 | Intercom to a phone | String-and-can phone | Gate bell on a string | Dotted line to a phone | **Walkie-talkie handset** paired by a dotted wave to a base on home; relay = small antenna "workers.dev" |
| R9 | Work pieces | Paper slips | Plants (seed → sprout → harvest) | Pebbles | Pebbles that hop from partner to device |
| asleep | Dust sheet | Closed door | Frost | Dim card, screen off | **Lid closed** / dark screen with a slow "breathing" light |
| needs you | Flagged piece on the desk | Flagged slip | Flower turned to you | Flag | Pebble raises a hand and **hops toward you** |

### 2.3 Per-candidate analysis

Each entry covers: false implications (FI), scale, states, zh/en, tone, art direction (AD), and 2D
vector rendering. The test results it cites are in §4.

**A. The Isles.**
- **FI:**
  - A woodpile per hut implies **per-device quota**. 2/2 raters said "each has its own". False
    for a shared account.
  - Water and boats imply travel time, a possible route between isles, and that the phone is
    a boat (but a phone used for *phone use* is also a device).
  - The lighthouse as memory was read correctly 0/2 times; one rater read it as the remote link.
  - Islands connote remoteness and loneliness, and "the sea is the network" suggests a
    peer-to-peer sea.
  - The fogged isle was read as "out of fuel / broken".
- **Scale:**
  - 1 isle feels empty. 8 isles is a lovely archipelago, but placing them carries no meaning,
    since geography means nothing here.
  - Phones and calls add more vehicles and lighthouses, meaning more objects to decode.
- **States:** rich (fog, smoke, flags).
- **zh/en:** 群岛 is clear; 打水漂 is universal.
- **Tone:** cozy and adventurous.
- **AD:** high, but needs water, waves and isometric isles, about 15–20 bespoke assets.
- **Render:** feasible in flat vector, though water motion costs the most.

**B. Town.**
- **FI:**
  - Houses on shared streets imply co-location and neighbours that talk (one rater thought a
    messenger carries work between houses).
  - The probe rater said each power station means "each pays separately".
  - City-builder priors (SimCity, Townscaper) imply **you build and grow** the town.
  - The hub/spoke structure is lost.
  - Sleeping cottage = broken (probe).
- **Scale:** gets crowded at 8. Phones become bikes? Cloud boxes become towers?
- **States:** good (lights, chimneys).
- **zh/en:** 小镇 is fine.
- **Tone:** warm.
- **AD:** good, but generic (many cozy-town apps).
- **Render:** many buildings to draw.

**C. Transit map.**
- **FI:**
  - Lines imply routes the user designs (Mini Metro) and trains running continuously.
  - The hub did **not** read as a worker (0/2 counted home as a machine).
  - Colour-matched lines implied per-line quota (2/2 said "each has its own").
- **Scale:** best of the metaphors, since Beck diagrams scale to hundreds of nodes.
- **States:** positional (where the train sits) is good; device states are weak (grey only).
- **zh/en:** 地铁图 is universal in cities, weaker for rural users.
- **Tone:** cool and cerebral, not cozy.
- **AD:** elegant, Beck-like.
- **Render:** trivial (lines and circles).

**D. Restaurant (waiter + kitchen).**
- **FI:**
  - **The probe answered "Servant"** for the AI's role: the apron and "takes my orders"
    violate the glossary rule, partners not hierarchy.
  - It implies paying per dish, a kitchen you don't own, and time pressure.
  - "Fixed order" of tickets.
  - The browser as a bike was read wrongly 1/2.
- **Scale:** good (stations).
- **States:** the best of all; the ticket rail is canonical, and "the waiter brings the
  question to your table" is exactly needs-you.
- **zh/en:** universal.
- **Tone:** busy and service-y, which misses 放心.
- **AD:** medium.
- **Render:** medium.

**E. Orchestra.**
- **FI:**
  - **The probe answered "Boss"** (the baton), and "all at the same time in sync". Both are
    false.
  - Sheet music as quota is arbitrary.
  - Instruments as capabilities are arbitrary (a spyglass-horn?).
- **Scale:** sections are capped and fixed.
- **States:** a dark section is fine, but notes are weak glyphs.
- **zh/en:** 指挥 resonates with the name, but it is a pun-adjacent cue.
- **Tone:** formal.
- **AD:** distinctive.
- **Render:** medium.
- The name "Ducter → conductor" is a reason *against* it: it doubles down on a hierarchy the
  vocabulary forbids.

**F. Workshop floor.**
- **FI:**
  - One room implies co-located machines.
  - One rater counted robots as the machines, conflating harness with device.
  - **Batteries implied upkeep** (probe: "Yes, needs recharging").
  - Covered bench = broken.
- **Scale:** medium.
- **States:** good.
- **Tone:** maker-ish, which fits developers.
- **AD:** generic.
- **Render:** easy.

**G. Desk & cubbies.**
- **FI:**
  - Cubbies imply storage, not machines.
  - The ink bottle with a clock was read as "broken/out of ink, not a timer".
  - Tokens are ambiguous.
- **Scale:** okay to about 8.
- **States:** weak.
- **Tone:** office.
- **AD:** low novelty.
- **Render:** trivial.
- It scored at the ceiling in the test (11.75/12), mostly because its objects are few and
  plainly connected. That is the lesson, not the desk.

**H. Garden.**
- **FI:**
  - **Tending**: cozy-game chores, the opposite of "silence means success".
  - Tasks "grow" slowly.
  - The probe rater thought "the pebble does all the work".
  - Frost suggests damage.
- **Scale:** medium.
- **States:** expressive (seed → sprout → harvest).
- **Tone:** gentle.
- **AD:** good.
- **Render:** medium.

**L1. Literal cards (Apple-like).**
- **FI:**
  - Almost none. One rater read the thread linking same-plan tiles as "live sync / work
    moves between machines".
  - Ring gauges were least understood as quota (1.5/2).
- **Scale:** best (a grid; it is also the accessibility list `ui.md` already requires).
- **States:** good (dim card, screen off).
- **zh/en:** perfect.
- **Tone:** competent, a dashboard, **not a game**.
- **AD:** craft only, low distinctiveness.
- **Render:** trivial.

**L2. Literal playset (real devices rendered as toys on a tabletop; "magic, not metaphor").**
- **FI:**
  - A **battery** for quota implied upkeep and was read as *device* power. Raters of the fuel and power scenes (A, B, F, L2) repeatedly explained the sleeping
    machine as "out of power". Hence: no batteries in the final design; use a provider plan block (see §6).
  - The probe read cartridges as per-machine payment, so cartridges must stay neutral, with
    colour only on plan blocks.
  - A tabletop implies co-location. It is mitigated because the table is "your collection",
    not geography, as in Find My's device list. Far devices sit on clouds at the back.
  - Toys could trivialize, a risk to 放心 for heavy users. Mitigation: labels are plain, and
    the zoomed-out view is L1.
- **Scale:**
  - 1 device is the onboarding moment: one laptop, the pebble on it.
  - At 8 it auto-arranges in an arc (home front-centre). Zooming out collapses it into L1
    cards, so L1 and L2 are one system at two zoom levels.
  - Phone use = a real phone lying on the table, **tethered by a cable to its host Mac**
    (true per `research/22`).
  - Calls = a "phone line" block beside the plan blocks, because calls are a cloud service,
    not a device.
- **States:**
  - The best: a lid that literally closes, the breathing sleep light Mac owners know, cords
    that visibly unplug when signed out.
  - Cartridges show a glow while in use and a progress shell while installing.
- **zh/en:** every object is a real device, plus 卡带 (game cartridge, universal via FC/Game
  Boy), 对讲机, and a book.
- **Tone:** toy-like, tactile, Nintendo-ish; "placing a piece" = clicking a cartridge in.
- **AD:** high and theme-portable (Paper = ink drawings of devices, Midnight = a desk at night
  with device glows, Signal = schematic).
- **Render:**
  - About 6 device archetypes, 1 cartridge shell × icons, cords as béziers, and state from tokens.
  - No water or terrain, so it is cheaper than the Isles.

---

## 3. Comprehension test design

**Protocol (cheap, repeatable).**
- One **fixed hidden setup**:
  - MacBook = home, with the partner, browser use, and Claude signed in.
  - Mac mini asleep, with computer use in a VM and Codex signed in at 0% quota, refilling later.
  - VPS awake, with the *same* Claude account (shared quota at two-thirds).
  - Memory connected; remote access on, with a phone paired.
  - Tasks: one working (VPS), one waiting (mini, asleep), one needs you (home), one done.
- Each candidate gets an **unlabeled picture description** of 182–218 words (scenes are in the
  scratchpad, `exp-metaphor/scenes/`). The same preamble for all: "a personal AI that hands work
  to your computers using your own AI subscriptions".
- **Probe 1** (12 scored items): partner, machine count, which machine is unavailable,
  subscription element, used-up one, shared vs separate, browser location, computer-use
  location + isolation, needs-you, why the waiting task is stuck, memory, phone role. It also
  asks for 3 free assumptions and a confidence rating.
- **Probe 2** (implied behaviours; truth in brackets):
  - (a) do I tend anything [no];
  - (b) can work move [rarely];
  - (c) do machines talk directly [no];
  - (d) does everything stop if home sleeps [yes];
  - (e) does each machine pay separately [no];
  - (f) is the AI boss / servant / partner [partner];
  - (g) fixed order or in sync [neither];
  - (h) what you would most likely misunderstand.
- **LLM proxies now:**
  - `claude -p --model haiku|sonnet --tools "" --no-session-persistence`, run from a scratch cwd.
  - 20 runs of probe 1 (10 scenes × 2 models) and 10 runs of probe 2 (haiku), 30 calls in all.
  - It created no `~/.claude/projects` folders (diffed before and after).
- **Humans later:** see §6.

**Scoring.** 1 = correct best guess (hedging allowed, since confidence captures it), 0.5 =
partially correct or split between a right and a wrong option, 0 = wrong. Graded by me against
the key.

## 4. Results (V, my experiment; n = 2 per scene, so treat as directional)

| Cand. | Probe 1 (haiku / sonnet, of 12) | Shared quota read right | Memory right | Notable misreads (probe 1 and 2) |
|---|---|---|---|---|
| A Isles | 10 / 9.5 | **0/2** | **0/2** | Woodpile = per-device; lighthouse ≠ memory (once read as the remote link); fog = "out of fuel / broken" |
| B Town | 11.5 / 12 | 2/2 | 2/2 | Greenhouse counted as a machine; probe: "each pays separately"; dark = broken |
| C Transit | 9 / 10 | **0/2** | 2/2 | **Hub not seen as a worker (0/2)**; browser on the "cloud" station; probe: "machines link directly" |
| D Restaurant | 10 / 11 | 2/2 | 2/2 | Needs-you device unclear (the waiter carries it); **probe: "Servant"**; "fixed order" |
| E Orchestra | 11 / 11.5 | 1/2 | 2/2 | **Probe: "Boss"; "all at the same time, in sync"** |
| F Workshop | 10.5 / 11.5 | 2/2 | 2/2 | Robots = machines (harness/device conflation); **probe: batteries need tending** |
| G Desk | 11.5 / 12 | 2/2 | 2/2 | Ink bottle + clock = "broken, not a timer"; "each uses its own allowance" (self-contradiction) |
| H Garden | 12 / 12 | 2/2 | 2/2 | Probe: "the pebble does all the work"; seed → harvest = fixed order |
| L1 Cards | 10.5 / 12 | 2/2 | 2/2 | Haiku missed the ring gauge as quota; thread = "live sync" |
| L2 Playset | 10.5 / 12 | 1/2 | 2/2 | Haiku: "they don't share" despite the cables; **probe: battery needs recharging; cartridges = separate payment** |

**Findings that hold across candidates.** These are stronger than any ranking, because they
repeat.
1. **Shared quota is legible only as one source with visible links to each device.** With
   cords, wires or hoses (B, D, F, H, L1, L2) it was read right 11/12 times; with per-site
   stock or colour-coding alone (A, C, E, G), 3/8. The Isles as written teaches a falsehood. (V)
2. **Asleep reads as broken.** 6/10 probe-2 raters named the sleeping element as what they'd
   misread as broken or out of fuel. Sleep needs a calm, familiar "will wake" glyph (a closed
   lid, a breathing light) and a plain line ("asleep · runs when it wakes"). (V)
3. **Fuel, power and battery images for quota are read as device power, and as chores.**
   Raters wrote "asleep *because* its power is empty" (A, B, F, L2) and "needs recharging"
   (F, L2). My scene co-located the two states, so this is partly a confound, but it predicts
   a real failure on laptops, which have real batteries. (V, plus I on the generalization)
4. **Memory = a book/notebook beside the partner: 18/18. The lighthouse: 0/2.** (V)
5. **A phone joined by a link (cord, wave, dotted line) reads as "a way to reach the AI":
   20/20.** Phone-as-worker must therefore look different: on the table, with a cartridge. (V)
6. **Role cues leak hierarchy.** An apron reads as servant, a baton as boss. Every other scene
   read "partner". (V)
7. **No candidate conveyed R2** ("if home sleeps, everything stops"): 10/10 answered "can't
   tell". The picture must make the partner *sit on* its home and nap with it. (V)
8. **The text proxy has a ceiling.** Scores of 9–12 mostly separate badly; confidence was
   always 2–3. LLMs know UI conventions, and naming an object in text ("a laptop") gives literal
   designs an advantage that a real picture *also* has. The proxy cannot measure beauty,
   gestalt speed, or delight. I wrote both the scenes and the key, which is a bias risk. (I)

## 5. Rubric and scores

Weights: legibility without labels 20 · mapping fidelity / no false implications 20 ·
scalability 15 · state expressiveness 15 · emotional fit to the north star 15 · distinctiveness
5 · feasibility 10. Each criterion is scored 1–5 and the total is normalized to 100.

| Cand. | Leg | Fid | Scale | State | Emo | Dist | Feas | **Total** |
|---|---|---|---|---|---|---|---|---|
| **L2 Literal playset** | 5 | 4 | 4 | 5 | 5 | 4 | 4 | **90** |
| **L1 Literal cards** | 4 | 5 | 5 | 4 | 2 | 1 | 5 | **80** |
| F Workshop | 4 | 3 | 3 | 4 | 4 | 2 | 4 | 71 |
| A Isles | 3 | 3 | 4 | 4 | 4 | 4 | 3 | 70 |
| C Transit | 3 | 3 | 5 | 3 | 3 | 3 | 5 | 70 |
| D Restaurant | 4 | 3 | 4 | 5 | 2 | 3 | 3 | 70 |
| B Town | 4 | 3 | 3 | 4 | 4 | 2 | 3 | 69 |
| G Desk | 4 | 3 | 3 | 3 | 3 | 2 | 5 | 67 |
| H Garden | 4 | 2 | 3 | 4 | 4 | 3 | 3 | 66 |
| E Orchestra | 4 | 2 | 3 | 2 | 2 | 4 | 3 | 55 |

The scores are I, informed by §4.

**Honesty notes.**
- L2 is my own construction and it absorbed this study's fixes, so its lead on legibility is
  not proven by the proxy. Its real advantages are structural:
  - it uses no foreign domain whose implied behaviours must be suppressed (Halasz & Moran);
  - its nouns are the real ones (Kay, Apple), so labels and picture never disagree;
  - its game verb (click a cartridge in) is an image schema (CONTAINER), not a story.
- The Isles is mid-pack, not bad. It could be repaired (one supply boat per account, the book
  in the pebble's hands, gentle fog), but each repair adds an object to decode.

## 6. Recommendation

**Pick L2, the "literal playset": your real devices, drawn as chunky toys on a sunny table,
with L1 cards as its zoomed-out and accessible view.** It is the same data at two zoom levels,
not two designs. Working name only; per the glossary the view stays **设备 / Devices**.
"Pictures toy-like, nouns literal" replaces "pictures metaphorical, words plain".

**Main tradeoff.** It gives up a distinctive *world* (the Isles' romance) for zero false
geography. Delight must come from motion and touch instead:
- the click of a cartridge;
- a device "booting" a tiny scene;
- a pebble hopping;
- a lid closing as the pebble yawns.

**Alternative:** the Isles repaired, if a world matters more than precision. The prototype
would have to beat L2 on the same human test (below).

**Design rules to carry into any choice (from §4):**
1. Each **AI plan is one block per account**, with cords to every device signed in. The
   colour lives on the block; cartridges stay neutral.
2. The quota glyph is **not a battery or fuel**. Use a ring on the plan block that refills by
   itself, plus a plain line: "Claude Max · 用完了，15:00 回来 / used up, back at 15:00". A/B
   test it against a "ticket roll" glyph.
3. **Sleep is calm, never broken**: a closed lid or dark screen, a slow breathing light, and the
   line "睡着了 · 醒来就接着做 / asleep · continues when it wakes". Offline gets a distinct
   unplugged cord.
4. The **partner sits on its home device** and naps with it. That alone makes R2 visible.
5. **Memory is the book in the partner's backpack.** Every persona carries its own.
6. **Phone as remote** = the handset with a dotted wave. **Phone as worker** = a phone on the
   table, cabled to its host, wearing a cartridge.
7. **No role props:** no apron, baton, crown, or desk-behind-desk.
8. Problems show where they live, Factorio-style: an unplugged cord, an empty ring, a closed lid.

**What the prototype must show** (one canvas, Pebble theme, native-renderable vector):
1. *Onboarding, 1 device:* the cartoon's last frame becomes the table. A laptop with the
   pebble on it; the Claude plan block snaps in with its cord; the Browser cartridge is placed
   with a "what it does" card (one line + a 3 s loop).
2. *3 devices:* a shared Claude cord to the MacBook and the VPS; Codex on the mini used up
   ("back 15:00"); the mini's lid closed with a waiting pebble carrying a reason chip; a
   needs-you pebble hopping forward.
3. *8 devices + later things:* the arc layout; a tethered Android phone with a Phone-use
   cartridge; a "phone line" block for calls; the handset + Edge antenna; zoom-out to the L1
   card grid.
4. *Home asleep:* the pebble naps and the whole table dims, with the line "Ducter 也睡了 /
   Ducter is asleep too".
5. Reduced motion, dark mode, and zh + en labels.

**Human validation** (the decision gate):
- 8–12 naive raters per arm (L2 vs. repaired Isles), with zh and en speakers. Nielsen's
  "5 users find most problems" applies per arm (K).
- Unlabeled stills: a 5-second test ("what is this?"), then the 12 probe-1 items and probe 2,
  then a first-click task ("let the AI use a browser on the Mac mini").
- **Pass bar:**
  - ≥ 80% correct on shared quota, sleep ≠ broken, memory, phone role, and the home-sleep
    consequence;
  - 0 boss or servant reads;
  - median first click < 5 s.
- Repeat the LLM proxy on each revision as a cheap regression check (≤ 30 calls).

## Implications for Ducter

- Replace candidate A in `ui.md` with L2 + L1 *after* the user decides. Record it as a D-entry
  that supersedes "pictures metaphorical, words plain".
- The glossary gains no new user-facing words. 设备 / Devices, 浏览器, 记忆 and plan names stay
  literal; "cartridge" is visual only.
- `onboarding.md` scene 4 already uses a "battery marked your AI plan". Change it to the plan
  block, per finding 3.
- The data model must expose **account → devices** (quota per account) and **host → tethered
  phone**, or the picture can't be truthful.

## Summary

Ten candidates (8 metaphors, 2 literal), mapped and scored, with a 30-call LLM-proxy
comprehension test. The strongest evidence is cross-cutting:
- shared quota is only legible as one source with links (11/12 vs. 3/8);
- sleep reads as broken (6/10);
- fuel and battery read as device power and chores;
- memory = a book next to the partner (18/18; lighthouse 0/2);
- aprons and batons leak servant/boss.

The Isles fails two items by design (per-hut quota, lighthouse memory). The recommendation is
a **literal playset**: your real devices as toys on a table, with plan blocks, cords and
cartridges, plus an L1 card view at zoom-out. It follows Kay's "magic, not metaphor" and
Blackwell's finding that metaphor mostly aids memory, not understanding. The decision gate is
a human test against a repaired Isles.
