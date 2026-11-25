# 230: A cast of figures to choose from: how others do it, eight candidates, real renders

The author, 2026-11-25: 「形象我觉得多几个其他形状的可爱形象可以选择？其他项目都是咋做的你好好参考，但是保持我们的水准和特色」.
Today every partner is the same clay pebble in another colour (D497, `LOOK_CLAY`). research/228
found that colour alone reads as "one character in colourways" and that only **shape and face
together, on colour,** read as different characters. This report takes that forward. It looks at
how other products let people pick a companion (§1), proposes a cast of eight clay figures with a
mapping table each (§2–§3), renders them with the project's own pipeline (§4), puts them in front of
naive-rater proxies (§5), and recommends what to ship first and how to present the choice (§7).
No design or product change. Renders, sheets, prompts, the script and the raters' raw answers are in
`.shots/figure-cast/` (not in git, D75).

## 1. How other products let people choose (evidence)

Tags: VERIFIED (read at the primary source), DOCUMENTED (a secondary source says so), INFERRED
(reasoning). Bulbapedia, Replika's help pages and the Slime Rancher wiki refused automated fetches;
those rows rest on secondary pages or search snippets and say so.

### Companion and pet apps

| Item | What | Source | Tag |
|---|---|---|---|
| Finch onboarding | pick an egg colour, then pronouns, a name and one core trait (curiosity, compassion, logic …); then the egg hatches | https://ixd.prattsi.org/2026/02/design-critique-finch-self-care-pet-ios-app/ ; https://androidauthority.com/finch-habit-tracker-app-hands-on-3537434 | DOCUMENTED |
| Finch's egg picker | six colours, the eggs set round a central figure | https://revyl-landing.pages.dev/atlas/finch/flows/complete-onboarding/ | DOCUMENTED |
| Finch's attachment | a reviewer chose a blue egg, named it, "I was emotionally attached"; the look changes later by clothes and decor, never by species | https://www.bustle.com/wellness/finch-app-review-features-price | DOCUMENTED |
| Tamagotchi Uni | the egg's colour does not decide the baby; the adult depends on care; 21 adults, 33 characters in all | https://tamagotchi.fandom.com/wiki/Egg ; https://tamagotchi.fandom.com/wiki/Care | DOCUMENTED |

### Characters in games

| Item | What | Source | Tag |
|---|---|---|---|
| Animal Crossing: New Horizons | about 35 species, 8 personalities (4 + 4); villager counts 393 to 413 by source and update | https://imore.com/animal-crossing-new-horizons-how-many-villagers-are-there-and-how-many-can-i-have-my-island | DOCUMENTED |
| Animal Crossing's reactions | 59 reactions, taught by villagers **by personality, not species** (5 per personality, the 5th at best friends); every species performs the same set | https://animalcrossingworld.com/guides/new-horizons/reactions-emotes-how-to-unlock-complete-list-by-personality | VERIFIED (the mapping); one rig across species INFERRED from play |
| Pikmin | one body; each type is a colour **plus one silhouette feature** that also says its power (red's nose, yellow's ears, blue's gill) | https://play.nintendo.com/news-tips/tips-tricks/all-about-pikmin/ ; https://www.pikminwiki.com/Pikmen | DOCUMENTED |
| Slime Rancher | one round body, each kind told by a small add-on; a mix shows both | https://www.pockettactics.com/slime-rancher/slimes | DOCUMENTED |
| Pokémon starters | always three; their designer gives each a distinct personality ("a cool one, a serious one, a funny one") | https://comicbook.com/anime/news/pokemon-creation-process-starters-personalities-anime-nintendo | DOCUMENTED |

### Avatars

| Item | What | Source | Tag |
|---|---|---|---|
| Memoji | made inside Messages, feature by feature, presets plus a colour slider, a live animated preview; Edit, Duplicate, Delete later | https://support.apple.com/111115 ; https://www.macrumors.com/how-to/create-memoji-ios-12 | VERIFIED (steps) / DOCUMENTED (live preview) |
| Bitmoji | a selfie makes a starting avatar, then edited "as if … a computer game"; the style can change later | https://newsroom.snap.com/bitmoji-deluxe | DOCUMENTED |

### AI companions

| Item | What | Source | Tag |
|---|---|---|---|
| ChatGPT's voices | nine core voices, **each a name and a two-word temperament**: Arbor "Easygoing and versatile", Breeze "Animated and earnest", Cove "Composed and direct", Ember "Confident and optimistic", Juniper "Open and upbeat", Maple "Cheerful and candid", Sol "Savvy and relaxed", Spruce "Calm and affirming", Vale "Bright and inquisitive"; chosen in Settings › Voice | https://help.openai.com/en/articles/8400625-voice-mode | VERIFIED |
| How those voices were cast | five at launch from 400+ submissions; criteria "timeless", "an approachable voice that inspires trust" | https://openai.com/index/how-the-voices-for-chatgpt-were-chosen/ | VERIFIED |
| Pi (Inflection) | six voices at launch, about eight later; voices, no face | https://www.maginative.com/article/inflection-launches-pi-for-android/ | DOCUMENTED |
| Replika | at onboarding: your name, its gender, a 3D avatar, its name; a new avatar later is for subscribers | https://help.replika.com/hc/en-us/articles/115001095892 (via snippet) | DOCUMENTED |
| Grok's companions | two whole characters at launch (a third "coming soon"), each a character, not a variant | https://www.engadget.com/ai/groks-ai-chatbot-now-includes-companions-for-you-to-romance-133017601.html | DOCUMENTED |

### Mascot families

| Item | What | Source | Tag |
|---|---|---|---|
| Duolingo's cast | about 18 months; every human built from **Duo's construction** (simple geometric shapes, big eyes, detached feet); each has its own correct-answer animation | https://blog.duolingo.com/building-character/ | VERIFIED |
| Duolingo's shape language | rounder shapes since 2018, "the fewest details needed", shapes "clearly silhouetted" | https://blog.duolingo.com/shape-language-duolingos-art-style/ | VERIFIED |
| Duolingo's Vikram redesign | a circle body read "big belly", "jolly", so it became a straight-sided pill: shapes imply traits "for better or for worse" (circles friendly but can read lazy; blocks strong but rigid) | https://blog.duolingo.com/vikram-redesign/ | VERIFIED |
| Duolingo on silhouette | if the overall shape isn't appealing, the details inside can't save it | https://blog.duolingo.com/reshaping-duo/ | VERIFIED |
| Duolingo's temperaments | one contrasting line each (Zari sociable achiever, Lily introverted and sarcastic, Bea nervous and ambitious, Lin easygoing) | https://blog.duolingo.com/story-behind-female-duolingo-characters/ | VERIFIED |
| Headspace | "ambiguous" characters of many shapes, sizes and colours, with faces for stress and sadness too; its AI companion as "a friendly blob" | https://www.figma.com/blog/headspace-ebb-ai-companion/ | DOCUMENTED |
| Team Fortress 2 (Valve, NPAR 2007) | "class differentiation is the core"; a read hierarchy: team by colour, class by **distinctive silhouettes** and body proportions, then props | https://cdn.fastly.steamstatic.com/apps/valve/2007/NPAR07_IllustrativeRenderingInTeamFortress2_Slides.pdf | VERIFIED |
| Shape conventions | circles friendly, squares steady, triangles energetic: craft conventions, not findings | https://waltdisney.org/sites/default/files/2020-04/T&T_ShapeLang_v9.pdf | DOCUMENTED |
| How many options | the "jam study" did not hold: a meta-analysis of 50 experiments found a mean choice-overload effect near zero, dependent on context | https://abcwest.cogs.indiana.edu/pmwiki/pdf/scheibehenne.options.2010.pdf | DOCUMENTED |

**The similar project** (`private/brigade-2026-11-25.md`, read only): six pebble blobs in six oklch
colours, the logo's one shape, falling on its landing headline, and one face whose moods follow the
pointer (VERIFIED from its source). It is a landing toy; its figures differ by colour only, the
case research/228 found reads as a skin. Not covered: Character.ai, Overwatch, Kirby, Notion's
illustrations, Sanrio and Line Friends.

### Principles taken from it (INFERRED unless marked)

1. **One construction, one feature each.** Duolingo builds everyone from Duo's kit (VERIFIED);
   Pikmin and slimes keep one body and change one silhouette feature (DOCUMENTED); TF2 reads team
   by colour and class by silhouette (VERIFIED). For Ducter: shared clay, light, blush, smile,
   nubby feet and arms, the notebook; **the body's outline is the one thing each owns**, the eyes
   second, colour third.
2. **How many.** No study fixes a number. Products cluster at 3 (starters), 6 (Finch, Pi), 8
   (Animal Crossing's personalities), 9 (ChatGPT's voices). Six fits one phone sheet in a 3 × 2
   grid and is above `PARTNERS_MAX` (4), so everyone can have a different one with room to choose.
3. **A name and a temperament per option.** ChatGPT's "name + two words" and Duolingo's contrasting
   lines turn swatches into someones. A shape implies a temperament whether we want it or not
   (Vikram), so the line must agree with the shape. **Honesty:** the figure never changes what the
   partner can do (Tamagotchi's egg colour; D497's same-kind mapping); the line describes a look and
   a manner, never a skill.
4. **A moment, not a dropdown.** Finch hatches, Pokémon introduces three, Memoji previews live. Start
   from a good default (Memoji, Bitmoji), show each figure alive, end on a short "meet", and keep
   changing later free (Replika's paywalled change is the anti-pattern).
5. **States are shared, identity is not.** Animal Crossing ties reactions to personality, not
   species; every species does them all. Duolingo shares the kit and gives each one celebration.
   For Ducter: every figure does all of D77's states with the same grammar; a figure may, later,
   own one flourish (on done), never a state.

## 2. Who, and what they feel

**Who.** The consumer personal-AI user making a second partner for the family or for writing (the
main one); the heavy developer with a work and a home partner; the fresh user meets one figure and
no picker (zero concepts).
**Before:** "the new one is my partner in green" (a skin). **After:** "this is 小云, the soft one
that looks after the house" (a someone), and, glancing at a 24-point task mark, "that one's 小云's".
**Emotional value:** 惊喜 at the reveal, 赏心悦目 in the lineup, 放心 because the shape never
changes what it can do or what its states mean.
**How it starts:** the fresh user never sees the cast until they make a second partner; the
default partner stays the pebble (its continuity is the brand).

## 3. Candidates

Every figure keeps: the same orange clay drawn once (recoloured at run time, as today), the top-left
key light, the peach blush, the tiny smile, nubby feet and stubby arms, and the sky-blue notebook.
Only **the body's outline** and **the eyes' shape, size and spacing** are its own. The eyes never
use the states' vocabulary (brows, ^ ^ arcs, closed arcs, half-lids, a mouth change), per
research/228. **The states are shared:** idle looks out; working glances aside at the notebook;
waiting sits on the bench shading its eyes; needs you **raises the brows and lifts the flag**; done
is **^ ^** hugging the notebook; napping is **closed arcs** under the knitted wrap; the blink closes
the eyes. (The brief's "waiting raises the brows" is today's *needs-you* pose; that is the state
rendered here, as the one where a cast is most likely to break.)

Names are **candidates only**, never glossary words until the change loop. Copyright: none of these
recreates an existing character (§3.9 lists the near ones and how each stays clear).

### 3.1 Pebble 小石子 / Pebble (today's partner)
Eyes: tall ovals with one highlight. Temperament: **steady and warm, the one who was there first.**

| Maps | False implications |
|---|---|
| the round pebble = the original, the default | a new partner in another figure could read as "lesser"; mitigated by never ranking the cast |
| round = friendly, reliable | round can read as plain or lazy (Vikram) |

### 3.2 Bean 豆豆 / Bean
A plump kidney bean, taller than wide, a dent on one side. Eyes: small round beads set close and high.
Temperament: **quiet and easygoing, thinks before it speaks.**

| Maps | False implications |
|---|---|
| a lean bean = gentle, a little shy | its fixed lean can read as a tilt, i.e. a mood (research/228's B) |
| food = homely | food can read as a recipe or groceries partner |
| small bead eyes = calm | small eyes read as sleepy at 24 (one rater: "a bit sleepy") |

### 3.3 Bun 包子 / Bun
A wide dome with a flat bottom and a pleated knot on top, wider than tall. Eyes: big round buttons
set wide and low. Temperament: **cosy and cheerful, makes home feel like home.**

| Maps | False implications |
|---|---|
| a steamed bun = warmth, home, comfort | food: a cooking or meal-planning partner; "a bit hungry-looking" (one rater) |
| wide and low = settled | wide and low can read as squashed, the hop's squash or napping (228's B); the knot on top keeps it a bun |
| a strongly zh-cultural object | en readers say "dumpling"; the name must be translated with care (bun / dumpling / bao) |

### 3.4 Sprout 芽芽 / Sprout
A round seed, a little taller than wide, two mint leaves on a short stem. Eyes: small tall ovals set close.
Temperament: **curious and hopeful, always learning something.**

| Maps | False implications |
|---|---|
| a sprout = growth, learning | "young", "a seedling" (raters' words): new, a beginner, less able (INFERRED) |
| the leaves = its feature | the leaves are a second colour that the run-time hue turn also moves (they go brown on some looks) |
| | the body is near the pebble's: in orange alone, raters paired it with the pebble or the bun as "the same one, growing" (§5) |
| | a leaf on the head sits near a well-known game's creatures: kept clear by the seed body, two leaves and no long stalk (§3.9) |

### 3.5 Cloud 云朵 / Cloud
Four soft lumps along the top, a flat bottom, wider than tall. Eyes: small dots set wide.
Temperament: **soft and unhurried, never in a rush.**

| Maps | False implications |
|---|---|
| a cloud = soft, calm | Ducter already draws a cloud for **a CI run waiting** (`wait_ci`): a cloud figure on On hand beside a CI wait could read as "the CI" |
| | weather: "it's going to rain"; "dreamy" = not focused (raters) |
| | "the cloud" = a server or online storage, the opposite of Ducter's "on your own computers" |

### 3.6 Star 星星 / Star
A puffy five-point star standing on its two lower points. Eyes: big rounds with two highlights each.
Temperament: **bright and eager, the first to say "on it".**

| Maps | False implications |
|---|---|
| a star = bright, energetic | a star is a rating, a favourite, "starred" (GitHub): a starred partner reads as the favourite |
| big two-highlight eyes = eager | big eyes **amplify every state**: its needs-you read "alarmed" to all three raters (§5); a strongest-signal figure misleads |
| | its points make the 24-pt outline busy; it reads as the "special" one in a lineup |

### 3.7 Drop 水滴 / Drop
A round bottom rising to a soft point that curls over. Eyes: larger tall ovals set low.
Temperament: **playful and a little mischievous.**

| Maps | False implications |
|---|---|
| a drop = fluid, adaptable | a tear: sad; water: a leak, "low on" something |
| the curl = playful | read as "a teardrop or flame" by 3 of 3 raters in orange: fire, "hot", "urgent" |
| | its tall oval eyes are the pebble's, so in one colour the two pair up (§5) |

### 3.8 Cube 方糖 / Cube
A soft rounded cube, squarish sides. Eyes: small upright pill shapes set apart.
Temperament: **solid and dependable, keeps things in order.**

| Maps | False implications |
|---|---|
| a square = steady, dependable (VERIFIED convention, Vikram) | rigid, "a box", a container or a file; a block = a building block, code |
| sugar = sweet | sugar is food again; the en "Cube" loses the sweetness |
| | flat sides read as a device or an app icon at 24 (a rounded square is the app-icon shape) |

### 3.9 Not chosen, and copyright
- **A round seal-like blob:** the body is the pebble's (no silhouette of its own); flippers make it
  an animal, and an animal implies a species and a pet (a different kind, 228's E).
- **An animal with ears** (a cat, a bunny): species, near Sanrio's and many others' characters.
- **Near characters checked:** the bun is a generic bao, not any brand's bun mascot; the sprout keeps
  a seed body with two leaves and no long stalk (a well-known game's creatures carry one leaf on a
  long stalk on a slim body); the drop's curl stays a clay tip, not any known water mascot; the star
  has no face mask or limbs of a game's star character. INFERRED: no candidate recreates one; a human
  check is owed before any ships.

## 4. Real renders (the pipeline, VERIFIED run 2026-11-25)

- **Tool and model:** the `baoyu-image-gen` CLI the art batches use (`design/art/assets/batch_*.json`
  format), provider Google, **`gemini-3.1-flash-image`** (the cheaper flash model). The concept art was
  made with `gemini-3-pro-image-preview` (`design/art/concepts/README.md`); one bean was rendered with
  both, and flash was as good for this (`raw/test_bean_idle_*`). The key was already configured; none
  was printed.
- **Prompts:** `design/art/assets/prompts/_style.md` unchanged, plus one prompt per figure and pose
  (`.shots/figure-cast/prompts/`): "a NEW member of the SAME clay family … only its BODY SHAPE and its
  EYES are its own". **References:** `alpha/ducter_idle.png` flattened on `#FFF4E6` and
  `concepts/r2/r2_char_clay.jpg` for idle; `ducter_idle` and `ducter_needsyou` for needs you.
- **Run:** 21 renders (two idle and one needs-you per figure), 21 of 21 succeeded, one pass, no
  rerolls; one idle per figure picked (two of the second variants had smeared shadows), cut out with
  `design/art/assets/tools/cut.swift` (Vision), recoloured with `LOOK_CLAY`'s matrices.
- **Colours on the sheets:** today's five looks (pebble sand, bean sage, sprout coral, cloud sky, drop
  plum) and three trial hues (bun +22° butter, star 215° lavender, cube 135° teal). A shape-only sheet
  keeps all eight in the default orange.

**What came out (reviewed by eye at 2x):** the family holds: material, light, blush, feet and notebook
match the pebble in every render. Silhouettes are distinct at 96 and still distinct at 24 on both
papers (the sprout's leaves, the bun's knot, the cloud's lumps, the star's points, the drop's curl,
the cube's corners all survive). Faults: the bean's cut-out kept a drip of shadow under it; **the
bean's needs-you came out with no brows** (the state lost); the bun's, sprout's and drop's brows came
out worried rather than raised; the star's needs-you eyes grew a white ring (alarm); the notebook is
recoloured with the body (as today), so the "same notebook" is not the same colour across the cast.

## 5. Naive raters (research/215's protocol)

`claude -p --model haiku` from a scratch folder, a fresh session per answer, the prompt on stdin, the
image read with the Read tool, opaque names (`img01` … `img04`), three answers a stimulus (12 in all).
No word "partner", "look" or "colour" in the prompts. The run's `~/.claude/projects` folder was deleted.
Raw answers: `.shots/figure-cast/raters/`.

| Stimulus | How many characters | One family? | Cutest (3 picks each) | Same one twice? |
|---|---|---|---|---|
| img01: eight, coloured, 96, light | **8, 3 of 3**, each named by its shape (bean, bun, sprout, cloud, star, teardrop, cube) | **yes, 3 of 3** ("same clay style, same face, same feet, same book; only body shape and colour change") | sprout 3, bun 3, pebble 2, star 1 | none, 3 of 3 (pebble and sprout "closest", still different) |
| img02: eight, coloured, 24, dark | **8, 3 of 3** | **yes, 3 of 3** | sprout 3, pebble 2, cloud 2, bun 1, bean 1 | none, 3 of 3 |
| img03: eight, shape only (all orange), 96 | 8, 2 of 3; 7, 1 of 3 | yes, 3 of 3 ("variations of one species") | bun 3, sprout 3, pebble 1, cloud 1, star 1 | **a pair, 3 of 3**: bun and sprout (2), pebble and sprout (1) "the same one, growing"; pebble and drop weaker (2) |
| img04: idle over needs you, coloured, 96 | — | — | — | each bottom figure the same as the one above, **3 of 3** |

img04's further questions: the bottom row reads as one shared gesture, "flag up, heads-up, look here",
3 of 3; **but the face does not mean the same on every figure** (3 of 3 named outliers): the star
"alarmed or startled" (3 of 3), the bean "calm, barely changed" (3 of 3, its brows are missing), the
bun "cheerful" or "looking sideways" (3 of 3), the cloud "content" (1 of 3).

**What it says.**
1. **Shape with colour reads as eight different characters in one family**, 3 of 3 at 96 and at 24
   on the dark paper, with no "skin" reading at all. research/228's H (shape + face on colour) holds
   with real renders, and better than with its composites (2 of 3 at 24 there).
2. **Shape alone is weaker**: in one colour the close round shapes (pebble, sprout, bun, drop) pair
   up as "the same one in another form". Colour stays a needed cue; the sprout is the figure closest
   to the pebble.
3. **The states survive the identity** (every rater matched each needs-you to its own figure), but
   **the face's state must be drawn to one spec**: generated brows drift (worried, missing, alarmed)
   and the raters read the drift as a different meaning. That is an art-direction rule, not a
   reason to drop a figure, except the star, whose big two-highlight eyes amplify every state.
4. **Cutest:** the sprout (in 9 of 9 answers' top three), the bun (7 of 9), then the pebble (5),
   the cloud (3), the star (2), the bean (1); the drop and the cube in none.

**Honest limits.** LLM proxies, not people; three answers a cell; one render per figure per pose, with
known faults (§4); no names, temperaments or app context shown; the 40-pt size not rated (INFERRED
between 96 and 24). research/228 §7's human-rater step is still owed and now has real stimuli.

## 6. Rubric

1 (poor) to 5 (strong); legibility is 24 and 96 on both papers without labels.

| | Legible 24/96 | Mapping fidelity | Distinct from the others | States kept | Emotional fit | Cute (raters) | Feasible (art risk) | Total |
|---|---|---|---|---|---|---|---|---|
| Pebble (today) | 5 | 5 | 3 | 5 | 4 | 4 | 5 | **31** |
| Bun | 5 | 4 | 5 | 3 (brows drift) | 5 | 5 | 4 | **31** |
| Sprout | 5 | 3 ("young") | 3 (near pebble) | 4 | 5 | 5 | 3 (leaf colour) | **28** |
| Cloud | 5 | 2 (CI wait, "the cloud") | 5 | 4 | 4 | 4 | 4 | **28** |
| Cube | 4 | 4 | 5 | 4 | 3 | 2 | 5 | **27** |
| Bean | 4 | 4 | 4 | 2 (brows lost) | 4 | 3 | 4 | **25** |
| Drop | 4 | 2 (tear, flame) | 3 (pebble's eyes) | 3 | 3 | 2 | 4 | **21** |
| Star | 4 | 2 (rating, favourite) | 5 | 1 (alarmed) | 3 | 4 | 3 | **22** |

## 7. Recommendation

**Ship six first: Pebble, Bun, Sprout, Cloud, Cube, Bean.** Their outlines are the six most distinct
(round, low dome with a knot, round with leaves, lumpy wide, square, a tall lean bean), they span the
shape conventions (round, soft, square, tall), and each temperament contrasts with the others
(steady, cosy, curious, unhurried, dependable, quiet). Drop the star (a rating, and its eyes amplify
every state into alarm) and the drop (a tear or a flame, and the pebble's eyes). Fixes before art:
the cloud keeps its place only if `wait_ci` is redrawn or the cloud figure never sits beside a CI wait
(INFERRED: redraw the wait's cloud as a rain cloud with a tick, a cheaper change than losing a top-four
figure); the sprout's leaves are a separate layer that the hue turn leaves green; the bean gets its
brows; every needs-you face is drawn from one brow spec (the pebble's: a small raised arc, never a
slant).

**Shape and colour are chosen separately, with a suggested pairing.** Each figure arrives in its own
suggested colour (as on the sheets); the colour row stays below it (D497's looks are kept). A new
partner gets the first figure nobody has, in the first colour nobody has, as now.

**How the choice is presented.**
1. **A "meet your partner" moment when one is made** (D309's form, which asks a name, what it looks
   after and a colour today). The form's first step becomes the cast: the six figures on the paper,
   each **alive** (D77's breath and blink, out of step), the suggested one already chosen and standing
   a touch taller, its candidate name and one temperament line under it ("包子 · 暖乎乎的，把家照顾得
   像家" / "Bun · cosy and cheerful"). Tapping one hops it forward (the D290 hop); the others settle.
   On Go the chosen figure walks into the conversation and says its first line in its own words
   (personas.md's greeting), with the name the person gave it. Reduce Motion: a cross-fade and no hop.
2. **A picker in Settings › Partners** for changing later, free and at once: the same six in a 3 × 2
   grid (one row of six on a wide window), the current one marked, the colour row under it; the
   partner says one line after a change (settings.md's partner's word).
3. The temperament is **a manner, never a skill**: every figure can do everything, and the picker
   says nothing that suggests otherwise. The person's own name for it replaces the candidate name.

**Tradeoff.** About six days of art and pipeline (below) and a larger asset set, for "each its own
character", which colour cannot give (228). The design space tightens past six; adding the seventh
later needs its own rater pass.

**Alternative.** Ship three first (Pebble, Bun, Cloud: the most distinct trio and two of the three
cutest), as a Pokémon-like "meet three", and add Sprout, Cube and Bean in a second batch. Half the art
up front; but with `PARTNERS_MAX` at four, three figures cannot give every partner its own.

## 8. Art cost

**Today's full pose set (VERIFIED in the repo):**
- the six poses as 1024 alpha masters, `design/art/assets/alpha/ducter_{idle, working, waiting,
  needsyou, done, napping}.png`, each with its prompt in `prompts/ducter_*.md`;
- the blink, `ducter_idle_closed`, derived from idle by `tools/art/eyes.py` (lid boxes in
  `apps/site/src/art.json` and the Mac's `theme.FaceLids`);
- the Mac's crops at 128 and 256 for all seven (`apps/desktop/internal/theme/art/crop/`), the site's
  AVIF/WebP for idle, working, done, needs you, napping and the closed idle (`apps/site/public/art`),
  the phone's `idle.webp` and `idle_closed.webp` (`apps/web/static/art`);
- **scenes that also hold the figure:** `pile_{big, mid, small, clear}` (On hand's to-dos) and the
  device screens (`tablet`, `foldable`; the phone's); INFERRED these stay the pebble (the person's
  pile and devices, not a partner's) unless a partner's own page shows them.

**Per new figure:** the six poses, generated and picked like this run (about 3 to 5 generations a pose
on the flash model, so 20 to 30 a figure; this run's yield was 1 good of 1 to 2), cut out, the eyes
checked against the state spec; the blink's closed eyes by `eyes.py` (its eye finder must be checked
on each eye shape: beads and pills are new to it); lid boxes; the Mac crops, the site's and the
phone's frames. Five new figures: **30 kept renders**, about 150 generations, two to three days of
art with selection and clean-up; one to two days of pipeline (a figure dimension beside the look in
`LOOK_CLAY`'s table, `art.mjs`, the Mac's crops and `FaceLids` by figure, the phone's frames); one day
of clients and tests (the picker, looks_test and the contrast test per figure). Assets grow about
0.4 MB of masters and 0.25 MB of Mac crops per figure (D75's 2 MB per file holds).

## Implications for Ducter

1. **Shape plus colour gives "each its own character" without losing the family**: 8 of 8 read as
   different characters and as one family, 3 of 3, at 96 and at 24 in the dark, with real renders.
2. **The family rule:** one construction (clay, light, blush, smile, feet, arms, notebook); the
   outline is each one's own, the eyes second, colour third; the states are everyone's, drawn from
   one face spec. Generated faces drift; the state faces need a written spec and a check per figure.
3. **Recommended:** six figures (Pebble, Bun, Sprout, Cloud, Cube, Bean), each with a suggested
   colour, a candidate name and a one-line manner; a "meet your partner" moment when one is made, and
   a 3 × 2 picker in Settings › Partners. The default partner stays the pebble.
4. **Owed before art is commissioned:** a decision through the change loop (names and temperament
   lines into the glossary), human raters per research/228 §7 with these renders, a copyright check by
   a person, and the fixes in §7 (`wait_ci`'s cloud, the sprout's leaf layer, the brow spec).
5. **Rejected:** the star (reads as a rating; its eyes turn every state into alarm), the drop (a tear
   or a flame; the pebble's eyes), an animal (a species and a pet: a different kind of thing).

## Summary

Products that let people choose a companion keep one construction and change one silhouette feature
(Duolingo, Pikmin, slimes), give each option a name and a short temperament (ChatGPT's voices,
Duolingo's cast), offer about six to nine, and make the choice a moment (Finch's hatch, Pokémon's
three, Memoji's live preview) with free changes later; shared reactions follow personality, not
species (Animal Crossing). Eight clay figures were drafted with mapping tables and rendered with the
project's pipeline on the cheaper flash model (21 of 21, one pass). Haiku proxies read the coloured
eight as eight characters of one family, 3 of 3, at 96 and at 24 dark; in one colour the round ones
pair up; the needs-you pose is matched to its figure every time, but drifted brows change what it
means. Recommendation: ship Pebble, Bun, Sprout, Cloud, Cube and Bean, with a "meet your partner"
moment and a Settings picker; about five to six days; human raters and the change loop first.
