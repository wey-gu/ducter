# 33: The Devices page as a place: scene, links, sign-ins and pairing

Researched 2026-11-09. The author asked whether the gamified Devices page could go further:
"我们的游戏化设计的背景和 agents 的连线和表现你看看有没有可能再提高一些". This report runs the
metaphor process from `AGENTS.md` on the **scene layer** of the capability map, prototypes the
winner and the runner-up, and adds a naming study for the card of a computer that runs tasks
and for the CLI that connects it. It builds on `research/24` (capability metaphors),
`research/26` (loadout), `research/28` (2D grammar) and D65 (the hybrid playset).

**Labels.** **VERIFIED**: read in code this session, or my own experiment. **DOCUMENTED**: an
approved artifact or a design doc says so. **INFERRED**: my judgment.

**Prototype:** https://claude.ai/artifact/6TbqEAaPLq9ykJtajtimDD (private; Isles and Floor
switch, all states, in-scene pairing, equip, zh/en, Still mode, new words marked).
**Evidence** (outside git, D75): `~/dev/ducter-evidence/devices-world/` (`exp/` prompts,
scripts, raw answers and grades; `gen/` the new island art with prompts; `proto/` the page and
its images; `s_*.png`, `states*.jpg` screenshots).

## 1. What is wrong today

| Problem | Evidence |
|---|---|
| The stage is a flat beige panel, not a place: no floor, horizon, depth or light direction | VERIFIED: `apps/desktop/internal/views/abilities.go` `stage()` fills one rounded box with `t.Clay`; the approved style board shows the same panel (DOCUMENTED, brand direction artifact `.stage`) |
| Links are faint dotted curves | VERIFIED: `dottedCurve()` in `abilities.go` draws the pedestal-to-token lines |
| The AIs float under the pedestal, not on the device they're signed in on | VERIFIED: `tokens()` lays account cards in one row under the stage; sign-ins are per device (`devices.ts` probes `claude`/`codex` per machine; workers report `harnesses` in `hello`, `worker.ts`) |
| Only the selected device is on stage; the second device never appears | VERIFIED: `stage(c, dv)` draws one `DeviceView` |
| Pairing is a modal over the scene | VERIFIED: `pairSheet()` draws over the stage |
| The worker card shows the raw hostname and no subtitle | VERIFIED: `deviceName()` returns `d.Name`; the CLI sends `hostname()` (`worker.ts`) |

## 2. The relationships the scene must carry

| # | Truth (VERIFIED in code unless marked) |
|---|---|
| S1 | Ducter lives on one computer (the main). If it sleeps, Ducter sleeps (DOCUMENTED, R28 R1) |
| S2 | Every other device connects **only to the main**: workers dial out to `/worker`, clients to `/ws`. No device talks to another directly |
| S3 | A task runs on one device at a time; the main sends it there |
| S4 | AI sign-ins are per device; one account's limit is shared by every device it's signed in on (DOCUMENTED, glossary 额度) |
| S5 | A phone is a client: it reaches Ducter, it never runs tasks |
| S6 | Device states: 醒着 · 睡着了 · 连不上, plus "working" while a task runs there; joining is a short waiting moment with a one-time code |
| S7 | Scale: 1 to ~6 devices, 0 to ~6 abilities per device |

## 3. Candidates and mapping tables

Seven candidates, genuinely different, including no metaphor. Each table lists every element
and its false implications (INFERRED unless a rater count is given; counts are from §4).

**A. Isles.** Each device is a small clay island on a calm sea; home is the big middle island.

| Element | Means | False implications |
|---|---|---|
| island | a device | islands are far apart (true for a VPS, false for the phone in your pocket); bigger island = more powerful device |
| big middle island + Ducter on the laptop | where Ducter lives | none seen (q1 16/20) |
| rope bridge from home | the connection | you can walk across; people travel; a broken bridge needs repair (fixed by the mist state: 0/20 asked to repair) |
| parcels crossing | a task running there | physical files shipped (half true: repos and briefs do move) |
| flag/badge on the island | AI account signed in there | territory, claiming, conquest |
| island fades into mist, bridge pale | can't reach | the device is gone for good (0/20 said broken) |
| jetty with a sign and a ring of still water | a new device can join here with this code | waiting for a boat (none seen) |
| islet with the phone | the phone reaches Ducter | the phone is a place where work happens (S5); q6 "phone reaches the server directly" was answered correctly by only 10/20 |
| sea | the space between devices (the network) | danger, isolation, drowning |

**B. Desk and cables.** Devices as gadgets on a wooden desk, cables into a hub cushion,
cartridges plugged in for AI accounts, an empty coaster with a tagged cable end for pairing.
False: everything is in the same room; an unplugged cable means "go plug it in" (8/8);
cartridges are consumables or batteries; the desk is one place you sit at.

**C. Board game.** Pieces on spaces joined by tile paths, pawns for AI accounts, a token
moving along the path. False: turns, players, competition, penalties (8/8 read it as a game);
the path is a route pieces move along; "skip" is a punishment.

**D. Shelf and pipes.** Devices in cubbies, brass pipes with capsules, jars for AI accounts.
False: shelved things are stored, not in use; pipes leak and need a plumber (6/8 wanted a
repair); jars are ingredients that get used up.

**E. Constellation.** Devices as stars, lines of light, moons for AI accounts. False:
constellation lines are imaginary; cosmic distance; dark night conflicts with the warm light
Pebble theme; a dimming star is dying. Link meaning was read by 1/8.

**F. Clay floor (no metaphor, beautifully literal).** The real devices as clay models on one
warm studio floor that curves into a backdrop, real cords from the Mac's pedestal, badges for AI
accounts, an empty pad with a coiled cord end and a code card. False: all devices sit in one
room; cords are physical cables you can unplug (7/8 wanted to plug in when the cord went
slack); pedestals are trophies on display.

**G. Network map.** Boxes and lines, chips for AI accounts, arrows animating. False: a
technical diagram for admins; dashed = pending; nothing about it is warm (3/8 felt good). It
is the only one with no place at all.

## 4. Comprehension test (VERIFIED)

**Method.** `claude -p --model haiku --tools "" --no-session-persistence` in a scratch
directory. Each candidate was written as **the same real scene** (Mac with Ducter, Claude Code
and Codex; cloud-1 running a task with Claude Code signed in; the phone; a code waiting for a
new device), then two changes (the task finishes; cloud-1 can't be reached). Each rater got one
non-technical persona and 11 questions, "answer from the picture alone", JSON out. Sonnet
graded every answer against a written key (§2). Round 1: 7 candidates × 8 raters. Round 2: the
two best, repaired (mist instead of slack or broken; a literal limit line under each account;
jetty or pad with a sign for pairing), × 20 raters in two panels of 10. Total 96 rater calls,
13 grading calls. The one `~/.claude/projects` folder the run created was deleted.

**Round 1 (n = 8 each).**

| Candidate | Lives on Mac | Link meaning | Work running | Claude Code where | Limit shared | New-device spot | Done, still linked | Can't reach | Wants to plug in / repair | Felt good |
|---|---|---|---|---|---|---|---|---|---|---|
| A Isles | 8 | 6 | 7 | 6 | 0 | 0 | 4 | 8 | **0** | 7 |
| B Desk | 7 | 7 | 8 | 2 | 0 | 6 | 7 | 8 | **8** | 7 |
| C Board | 6 | 0 | 3 | 1 | 0 | 1 | 0 | 3 | 0 | 2 |
| D Shelf | 6 | 1 | 6 | 6 | 0 | 4 | 0 | 6 | **6** | 7 |
| E Stars | 8 | 1 | 7 | 4 | 0 | 2 | 0 | 4 | 0 | 8 |
| F Floor | 6 | 5 | 8 | 3 | 0 | 4 | 5 | 5 | **7** | 7 |
| G Map | 8 | 0 | 5 | 5 | 0 | 4 | 0 | 5 | 0 | 3 |

C was read as a game by 8/8. "Phone talks to the server directly? (no)" was 2–5/8 everywhere.

**Round 2 (n = 20 each, repaired).**

| Candidate | Lives on Mac | Link meaning | Work running | Claude Code where | Limit shared | New-device spot | Done, still linked | Can't reach | Plug in / repair | Felt good | Sum of 9 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **A2 Isles** | 16 | 15 | 20 | 11 | 9 | 16 | 14 | 18 | 0 | 16 | **129/180** |
| F2 Floor | 12 | 5 | 13 | 14 | 12 | 12 | 12 | 14 | 0 | 11 | 106/180 |

The two panels agreed in direction (A2 61 and 68 of 90; F2 50 and 56 of 90).

**Findings.**
1. **Any cord, cable or pipe that goes slack or comes apart reads as "go plug it in"**: 21/24
   in round 1 (B, D, F). This repeats `research/28` (4/4). Showing can't-reach as **mist and a
   pale link that stays in place** took it to 0/40 in both scenes. So the brief's "taut vs
   slack" idea is out; state lives in the device (mist) and the words, not in the link's shape.
2. **A link with something moving on it only while work runs** was understood everywhere
   (work running 7–8/8 in A, B, F; 20/20 in A2), and its stopping read as "done, still
   connected" for bridges and cords (A2 14/20, B 7/8), never for lines of light or map arrows
   (0/8 each).
3. **A shared limit is never read from the picture** (0/56 in round 1). One literal line under
   each account, "64% of the limit left · shared by 2 devices", gave 21/40. Keep the line; keep
   the "tap one account, all its places lift" interaction from `research/28`.
4. **Pairing must be attached to home.** A buoy floating in the sea: 0/8. A jetty out of the
   home island with the code on a sign: 16/20. A coaster with a cable end and a tag: 6/8.
5. **Isles won** on comprehension (129 vs 106), on feeling (16 vs 11 of 20) and in round 1
   it was the only candidate with no physical-repair misread before repair. The floor scored
   higher only on "Claude Code where" (14 vs 11) and "limit shared" (12 vs 9).
6. "Is it yours?" cannot be answered from a card alone (17–20/20 "unsure" in every card
   variant, §6): ownership comes from the page ("你的设备"), not from the card.

**Limits.** Haiku as a proxy, one model, scenes and key written by me, motion described in
words, small n in round 1. The proxies hedge a lot ("unsure"), which lowers every cell. The
human test from D65 is still owed, now with the Isles scene.

## 5. Rubric (INFERRED, 1–5; legibility from §4)

| | Legible | Fidelity | Scale 1→6 / 0→6 | States | Emotion | Distinct | Feasible in MyGo | Total |
|---|---|---|---|---|---|---|---|---|
| **A Isles** | 4 | 4 | 3 | 5 | 5 | 5 | 3 | **29** |
| F Floor | 3 | 4 | 4 | 4 | 3 | 2 | 5 | 25 |
| B Desk | 3 | 3 | 3 | 4 | 4 | 3 | 4 | 24 |
| D Shelf | 2 | 3 | 4 | 3 | 4 | 4 | 3 | 23 |
| E Stars | 2 | 3 | 5 | 3 | 3 | 3 | 4 | 23 |
| G Map | 2 | 4 | 5 | 3 | 1 | 1 | 5 | 21 |
| C Board | 1 | 2 | 4 | 3 | 2 | 3 | 4 | 19 |

Scale for Isles: up to 6 islands fit an arc around home at the 760 × 560 design size; beyond
that, far islands shrink (depth) and the card list carries the rest. Abilities stay badges on
the island rim (up to 6 in two rows); the catalog stays in the right column.

## 6. The prototype

One HTML artifact (link above). Real setup: **这台 Mac** (Ducter lives here; 上网 and 在哪儿都能用
added; Claude Code and Codex signed in), **cloud-1** (Linux VPS; Claude Code signed in;
醒着 / 在做事 / 睡着了 / 连不上), **iPhone** (reaches Ducter from anywhere), and a **Mac mini**
that joins during the demo. Controls switch Isles/Floor, language, motion, each state, and mark
the new words.

- **A place.** A pale sky band, a horizon, a clay sea (or, in Floor, a wall curving into a
  floor), far islands smaller and higher, one light from the top left, shadows and foam to the
  bottom right, a slow glint on the water.
- **Links as objects.** Plank-and-rope bridges (Floor: a thick clay cord with an edge and a
  highlight), only from home. Parcels (Floor: clay beads) roll at a steady 40 px/s only while
  cloud-1 is working. Asleep: the bridge relaxes a little. Can't reach: the bridge stays and
  turns pale, the island sits in mist, the device desaturates, and the card says
  "连不上 · 14:20 起". Nothing blinks.
- **AIs on the device they're signed in on**: account tokens stand on each island; tapping one
  lifts every island where the same account is signed in, and the right column says
  "额度还剩 64% · 2 台设备共用".
- **Pairing in the scene**: "连上手机或另一台电脑" makes a jetty grow out of home toward a ring
  of still water, with a clay sign (code, "这个码只能用一次 · 10 分钟内有效", address, the
  command for a computer, "等它连上…"). On join the island rises, the Mac mini drops on with a
  squash, sparkles and a tock, the bridge closes, and a new card pops into the list.
- **Equip** reuses the approved peel → arc → snap (0.82 s) onto the selected island's rim.
- **Motion rule** (DOCUMENTED, brand direction): Ducter breathes; awake devices float, asleep
  ones rise and fall under a blanket; status never animates. Still mode stops all of it; the
  parcels freeze in place so "working" still reads.
- **New art.** Two clay islands generated with the existing `_style.md` and the pedestal and
  server renders as references (Gemini 2.5 Flash Image), cut out with `tools/cut.swift`.
  Prompts in `gen/prompts/`. The big one reads well; the small one is plain butter sand and
  should get a second pass before shipping (INFERRED).

**Feasibility in the native app (INFERRED).** Everything is PNG clay art plus vector drawing
plus motion, which `stage()` already does: the sea and mist are gradient fills, a bridge is a
dashed thick path plus two thin ones, parcels are rounded rects placed by evaluating the cubic,
islands are two new PNGs. The layout moves from one device to all devices in an arc
(`layoutRig` becomes per device). Estimate 2–3 days for the stage, plus the art pass.

## 7. Naming study (VERIFIED, Haiku raters, Sonnet grades)

### 7a. The overview label (closed by D80)

Run before D80 landed; kept as a note. 20 raters per label, five-item nav (对话 · X · 设备 · 伙伴 ·
设置). "money/other meaning" = the rater named a distinct other meaning.

| Label | Read as the assistant's tasks | Other meaning first | Done shown | Waiting shown | Routines shown |
|---|---|---|---|---|---|
| 手头 | 18 | 20 (手头紧 money) | 0 | 7 | 0 |
| **手头的事** (D80) | 13 (7 read "my own to-dos") | 12 | 1 | 11 | 0 |
| 事情 | 18 | 19 | 13 | 14 | 2 |
| 进度 | 20 | 17 | 19 | 6 | 0 |
| 在办的 | 20 | 14 | 0 | 4 | 0 |
| 一览 | 11 | 11 | 10 | 5 | 2 |
| 任务 | 16 | 20 | 13 | 3 | 13 |
| 当下 (n = 21) | 1; **19 "only what's happening right now"** | 19 (活在当下, 当下流行) | **0** | 1 | **0** |

当下 implies "live, right now" (19/21) and excludes finished work (0/21), waiting decisions
(1/21) and scheduled routines (0/21); raters named the mindfulness/literary sense
unprompted. En: On hand 15/20 tasks, 5 "other"; Tasks 20/20 and the only label where raters
expected finished, waiting and scheduled work together (20, 11, 8). No label conveys
"scheduled routines" except 任务 / Tasks; if On hand must show them, the page has to say so.

### 7b. The card of a computer that runs tasks

20 raters per card; the art is the clay server on a cloud.

| Title · subtitle | Read as a computer | Read as a program/service (keyword) | Graded "Ducter's company's" | Would rename |
|---|---|---|---|---|
| ducter-worker · (none) | 20 zh / 19 en | 7 / 13 | 0 / 1 | 10 / 15 |
| ducter-worker · 醒着 | 19 | 9 | 2 | 7 |
| ducter-worker · 替 Ducter 做事 · 醒着 | 18 | **16** | 1 | 12 |
| ducter-worker · Does tasks for Ducter · Awake | 9 | **20** | 1 | 16 |
| cloud-1 · 云上的电脑 · 替 Ducter 做事 | 20 | 0 | 0 | 19 |
| cloud-1 · Cloud computer · does tasks for Ducter | 20 | 15 (keyword hits "for Ducter"; grader: 20/20 understood) | 3 | 16 |
| cloud-1 · Ducter 的事可以放在这儿做 · 醒着 | 19 | 0 | **20** | 17 |
| cloud-1 · 另一台电脑 · 在做 1 件事 | 20 | 0 | 0 | 12 |
| cloud-1 · Another computer · working on 1 task | 20 | 0 | 1 | 20 |

- A name containing "ducter" plus a role line makes the card read as **Ducter's own background
  program** (16/20 zh, 20/20 en). Saying what kind of thing it is ("另一台电脑", "云上的电脑")
  removes that completely (0/20).
- "Ducter 的事可以放在这儿做" reads as a Ducter-run cloud service (20/20). Drop it.
- People want to rename these machines (12–20/20), so rename must be one tap on the card.

**Recommendation.** Name = the machine's own name, renamable (改名字, already a glossary verb).
Subtitle = **另一台电脑 · 替 Ducter 做事 / Another computer · does tasks for Ducter** when all is
well; the state replaces the second half when it isn't (在做 1 件事 · 睡着了 · 醒来就接着做 ·
连不上 · 14:20 起). The combined line is assembled from two tested halves, not tested as one.
**Alternative:** 另一台电脑 · 在做 1 件事 (state only, all glossary words; 20/20), at the cost
of saying nothing about the role when idle. 云上的电脑 tested best in zh but the app can't know a
Linux box is in the cloud, so it stays an option for when the person names it.

### 7c. The CLI verb, and one code for everything

10 developer personas per command, on a fresh Linux server.

| Command | Says what it does | Says "this server will run its tasks" | Says "it can control/chat" | Misleading reading |
|---|---|---|---|---|
| `ducter worker --join <url> --code <c>` | 10 | **10** | 0 | 3 (cluster/fleet) |
| `ducter join <url> --code <c>` | 10 | **2** | 0 | 6 (node, cluster member) |
| `ducter connect <url> --code <c>` | 8 | 0 | 3 | 2 |

`join` says "becomes part of it" but not "does its work"; `connect` reads as a client. The
glossary's rule that "worker stays internal" is about UI copy; the CLI's reader is a developer,
and the word carries the meaning (INFERRED).

**One code for phones, app windows and computers (VERIFIED by reading code).**
- Codes carry a kind at creation: `auth.createCode({ kind: "client" | "worker" })`
  (`packages/core/src/auth.ts`), copied into the device row when redeemed (`insertDevice`).
- The desktop's "连上手机或另一台电脑" asks for `pair_code`, which `devices.ts` `pairCode()`
  creates as **client**. A worker token is required at `/worker` (`workers.ts`
  `deviceRoutes`: 403 "a worker pairing code is needed"). So **today the desktop's code cannot
  connect another computer**, despite its label; only `ducter pair --worker` can.
- What unification takes: (1) `createCode` gets a kind-free code (e.g. `kind: "any"`, the new
  default); (2) `/pair` accepts `role: "client" | "worker"` in the body and, for an "any" code,
  stores that role; absent role = client, so the web, iOS and desktop clients don't change;
  (3) `ducter worker` sends `role: "worker"` and takes the address as a plain argument;
  `pair --worker` stays as a hidden alias; (4) `cmdPair` and the desktop/phone code card print
  both ways to use the code; (5) tests in `auth`, `workers` and the CLI; glossary, `design/system.md`
  Workers and the docs page. No schema change (`pair_codes.kind` is text).
- Security: a worker has strictly less access than a client (`/worker` and `/mcp` only), so
  letting the holder of a code choose "worker" grants nothing a client code didn't. One-time,
  10-minute expiry and the rate limits stay as they are (INFERRED).
- **Effort: about half a day to one day** including tests and copy (INFERRED).

**Recommendation.** One code everywhere; CLI `ducter worker <address> --code <code>` (keep
the verb, drop `--join`; accept `--join` as an alias). **Alternative:** `ducter join` with a
confirmation line printed before it connects, "这台电脑会替 <name> 做事 / This computer will do
tasks for <name>", which fixes the 2/10 at the cost of a word that alone misleads.

## 8. What needs a decision or a new word

| Item | Status |
|---|---|
| The scene: devices as clay isles in one place, all devices on stage, bridges only from home, mist for can't reach, jetty pairing (replaces D65's one-device stage) | **Proposed D81** |
| 替 Ducter 做事 / does tasks for Ducter (card subtitle, with 另一台电脑) | New phrase, proposal |
| 在哪儿都能找到 Ducter / Reaches Ducter from anywhere (phone card) | New phrase, proposal |
| 等它连上… / Waiting for it to connect… (pairing sign) | New phrase, proposal |
| One code for every kind of device; `ducter worker <address>` | Proposal; small code change (§7c) |
| A desktop bug: its "or another computer" code can't connect a computer | Fix with the unification, or change the label until then |

## Implications for Ducter

1. Make the Devices stage **a place with every device on it**: Isles, home in the middle,
   others in an arc by depth; the selected device gets the ink hairline (D69) and drives the
   right column.
2. **Links leave home only** and carry state by **movement while work runs**, never by shape:
   no slack, unplugged or broken links. Can't reach = pale link + mist + one line of words.
3. **AI accounts stand on the device they're signed in on**, with the literal shared-limit
   line; tapping one lifts all its places.
4. **Pairing happens in the scene** (jetty, sign, ring of water, the island rising on join);
   no modal.
5. Worker cards: machine name (renamable) + "另一台电脑 · 替 Ducter 做事".
6. Unify the code and keep `worker` as the CLI verb; this also fixes the desktop's code that
   can't connect a computer.
7. Run the human comprehension test owed by D65 on the Isles scene before building.

## Summary

Seven scene metaphors for the Devices page were written as the same real scene and shown to
naive LLM proxy raters (96 Haiku calls, Sonnet grading). Slack or broken cords, cables and pipes
make people want to plug something in (21/24); a pale link with mist fixes it (0/40). Repaired
**Isles** beat the repaired literal floor 129 to 106 of 180 and felt better (16 vs 11 of 20).
Shared limits need a literal line (0/56 without, 21/40 with); pairing reads only when attached
to home (buoy 0/8, jetty 16/20). The prototype shows Isles and Floor with every state, in-scene
pairing, equip, zh/en and Still mode. For the worker card, a "ducter" name plus a role reads as
a background program (16–20/20) unless the subtitle says 另一台电脑 (0/20); recommend the machine
name plus "另一台电脑 · 替 Ducter 做事". `ducter join` says "runs its tasks" to 2/10 developers
against 10/10 for `ducter worker --join`; keep `worker`. One code for every device is a half-day
to one-day change and fixes a real gap: the desktop's code can't connect a computer today.
当下 reads as "only what's live" (19/21) and drops done, waiting and routines; D80 chose 手头的事.
