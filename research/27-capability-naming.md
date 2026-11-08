# 27: What to call the things you equip onto a device

Researched 2026-11-08. Names the user-facing word (中 + EN) for the rack items from the D43
loadout (`research/26`): browser use, computer use, later phone use, phone calls, maybe remote
access. You snap one onto a device, and the device "can now …". Working word: **本事** (rack 本事架).

**Labels.** **V** = verified this session (my own experiment). **K** = established usage from prior
knowledge. **I** = my inference.

**Constraints** (from `docs/design/product-model.md` §1 and the brief): partners not hierarchy;
plain words that translate cleanly with no puns; guessable at a glance; as simple as 事 / Task.
Must not collide with **skills** (Claude Code skills, kept separate in Ducter), **tools** (MCP),
**plugins**, **extensions** or **apps**. It needs an equip verb and a result line in both languages.
It should feel warm and a little like a game, and never military.

---

## 1. Candidates

The result line is the same idea for every candidate: **MacBook 现在会上网了 / MacBook can now
browse the web**. Only the noun and the verb change.

| # | 中 | EN | Equip verb (中 · EN) | Hint / result phrasing | Notes |
|---|---|---|---|---|---|
| 1 | **本事** | **Abilities** | 装上 / 学会 · add / teach | 拖到设备上，它就会了 · Drag an ability onto a device | Everyday zh (有本事, 学本事); its natural partner is 会, the same word as the result |
| 2 | 本领 | Talents | 学会 · teach | 学会了新本领 · learned a new talent | More written than 本事. "Talent" is innate, so you can't equip it |
| 3 | 能力 | Powers | 给 / 加上 · give | 给它这项能力 · give it that power | 能力 is formal and reads like docs. "Powers" is superhero |
| 4 | 能力 | Abilities | 加上 · add | 加上上网能力 · add an ability | Clean, but 能力 = "capability" in tech zh, so it reads like a spec sheet |
| 5 | 装备 | Gear | 装上 · equip | 装上装备 · equip gear | Most game-like. Military/armour read in zh. **装备 rhymes with 设备 (zhuāngbèi / shèbèi)** |
| 6 | 配件 | Add-ons | 装上 · add | 装上配件 · add an add-on | zh = hardware accessories (to be bought). "Add-on" = Firefox and Office add-ons, so it collides with plugins |
| 7 | 绝活 | Tricks | 教会 · teach | 教它一手绝活 · teach it a trick | "Teach an old dog new tricks" is warm in en, but 绝活 means rare mastery, which is too grand for "browse" |
| 8 | 招式 | Moves | 学会 · learn | 学会新招 · learns a new move | Martial arts and fighting games, so it reads as combat |
| 9 | 手艺 | Crafts | 学会 · learn | 学会一门手艺 · learn a craft | Warm, but implies years of practice; "Crafts" in en means knitting |
| 10 | 门道 | Know-how | 摸清 · learn | (no natural phrasing) | Culture-bound and no clean translation; fails the i18n rule |
| 11 | 家伙什 | Kit | 带上 · pack | 带上家伙什 · pack the kit | Northern dialect. 家伙 also hints at weapons |
| 12 | 小帮手 | Helpers | 派 · send | 派个小帮手 · send a helper | Reads as more agents (subagents), which adds a level of hierarchy under the partner |
| 13 | 道具 | Items | 装上 · equip | 装上道具 · equip an item | Game item bar, but zh 道具 also means a stage prop, and "Items" is empty in en |
| 14 | 卡带 | Cartridges | 插上 · plug in | 插上卡带 · plug in a cartridge | Lovely retro image (`research/24` used one), but generational, and it names the object instead of what it does |
| 15 | 玩法 | Modes | 解锁 · unlock | 解锁新玩法 · unlock a mode | 解锁 implies paywalls and progression. "Mode" means a switch you flip, not something you add |
| 16 | 技能 | Skills | 学会 · learn | — | Control: a direct collision with Claude Code skills (zh UIs translate them as 技能). Rejected |

## 2. Scores (I)

1–5, higher is better. For the two risk rows, 5 means no risk.

| # | Pair | Instant | Collision | Warm / game | Military / hierarchy | Verb 中 | Verb EN | 事 / Task style | Sum |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 本事 / Abilities | 5 | 4 | 4 | 4 | 5 | 4 | 5 | **31** |
| 4 | 能力 / Abilities | 5 | 3 | 2 | 5 | 4 | 4 | 4 | 27 |
| 5 | 装备 / Gear | 4 | 4 | 5 | 2 | 4 | 5 | 3 | 27 |
| 3 | 能力 / Powers | 4 | 4 | 4 | 4 | 4 | 3 | 3 | 26 |
| 2 | 本领 / Talents | 4 | 4 | 3 | 4 | 4 | 2 | 4 | 25 |
| 7 | 绝活 / Tricks | 3 | 5 | 4 | 4 | 4 | 4 | 2 | 26 |
| 13 | 道具 / Items | 3 | 4 | 4 | 4 | 4 | 3 | 3 | 25 |
| 14 | 卡带 / Cartridges | 3 | 5 | 5 | 5 | 4 | 3 | 1 | 26 |
| 6 | 配件 / Add-ons | 4 | 1 | 2 | 5 | 5 | 4 | 3 | 24 |
| 9 | 手艺 / Crafts | 3 | 5 | 4 | 5 | 3 | 1 | 3 | 24 |
| 8 | 招式 / Moves | 3 | 5 | 4 | 1 | 4 | 4 | 3 | 24 |
| 15 | 玩法 / Modes | 3 | 4 | 3 | 5 | 2 | 2 | 3 | 22 |
| 12 | 小帮手 / Helpers | 4 | 2 | 5 | 2 | 3 | 3 | 3 | 22 |
| 11 | 家伙什 / Kit | 2 | 4 | 4 | 3 | 3 | 3 | 1 | 20 |
| 10 | 门道 / Know-how | 2 | 5 | 3 | 5 | 2 | 1 | 1 | 19 |
| 16 | 技能 / Skills | 5 | **0** | 4 | 5 | 5 | 5 | 5 | rejected |

"事 / Task style" means a common word, one or two characters, about *what gets done*, not about
an object or a mechanism. 本事 shares the 事 morpheme with 事 / Task, so the two read as one family:
a 事 is a thing to do, a 本事 is something you are able to do (I).

I sent the top five on distinct ideas to the test: 本事/Abilities, 装备/Gear, 配件/Add-ons,
能力/Powers, 绝活/Tricks. 能力/Abilities was left out because it shares its English with #1, and
its zh half was tested anyway as 能力/Powers.

## 3. LLM-proxy test (V)

**Setup.** 24 `claude -p` calls on Haiku with `--no-session-persistence`, no tools, and a scratch
cwd. The one project folder this created was deleted. The persona: "an ordinary user who has used
ChatGPT, not a programmer". The screen description: devices drawn as rounded toys on top; below,
a rack titled with the candidate word, holding *Browse the web, Use the computer, Make phone calls,
Remote access*, with a one-line hint. The user drags *Browse the web* onto the MacBook, it clicks
on, and the line "MacBook can now browse the web" appears.
- **Blind:** 5 candidates × 2 languages × 2 reps = 20. Raters answered what the word means, what
  equipping does, anything odd (military, boss-like, techy, or confusable with
  skills/plugins/extensions/apps/tools), and gave clarity and warmth scores of 1–5.
- **Comparative:** 4 calls (zh ×2, en ×2). Raters saw all 5 words, were told that skills, tools
  and plugins are taken, and ranked them.

Prompts: `scratchpad/exp-naming/run.py`. Outputs: `scratchpad/exp-naming/out/`.

**Comprehension.** All 20 blind calls described the mechanic correctly: "a thing the device can
do, and dragging it on gives that device the ability". The word is not the bottleneck here; the
result line carries the meaning. Clarity was 3–4 for every candidate, so the blind scores don't
separate them.

**Ranking (the clearest signal).**

| Call | 1st | 2nd | 3rd | 4th | 5th |
|---|---|---|---|---|---|
| zh 1 | 本事 | 能力 | 装备 | 绝活 | 配件 |
| zh 2 | 本事 | 能力 | 装备 | 绝活 | 配件 |
| en 1 | Abilities | Gear | Powers | Tricks | Add-ons |
| en 2 | Abilities | Powers | Gear | Tricks | Add-ons |

**本事 / Abilities was first in 4/4 calls and 配件 / Add-ons last in 4/4.** Reasons given: 本事 is
"what ordinary people say (学本事, 有本事)" and the hint "needs no explanation"; Abilities "describes
what a device can do, which matches 'MacBook can now browse the web'".

**Flags from the blind calls** (counts out of 2 per cell):

| Candidate | zh flags | en flags |
|---|---|---|
| 本事 / Abilities | 学会 reads as "training a subordinate" 2/2; slightly 江湖 or not everyday 2/2 | game stat or combat term 1/2 |
| 装备 / Gear | 打仗 / armour 2/2; sounds like 设备 (comparative) | game loadout or military 1/2; "physical hardware" (comparative 2/2) |
| 配件 / Add-ons | computer hardware parts, maybe paid 2/2 | "= browser extensions/plugins" 2/2; also lowest warmth (3, 3) |
| 能力 / Powers | 给 reads as giving orders or permissions 2/2; abstract or permission-like 1/2 | superhero, grandiose 2/2 |
| 绝活 / Tricks | 教会 is boss-like 1/2; 江湖 1/2 | pet or circus trick 2/2; "undersells remote access" |

Every cell got a "could be confused with skills/plugins/apps" flag. The prompt invited it, so I
treat that as a noise floor, not as evidence (I). The one strong collision signal is Add-ons.

**Two findings beyond the noun.**
1. **The zh verb, not the noun, causes the hierarchy flag.** 学会 / 教会 / 给 drew "像在训练/指挥下属"
   in 5 of the 6 zh cells whose hint used them. The 4 cells whose hint used 装上 (a physical snap) drew none. So the zh verb should be 装上 and the
   result 会 ("现在会上网了"), never 教会 or 学会. In en, "teach" drew no hierarchy flag.
2. **Item names matter as much as the rack word.** "Use the computer" and "Remote access" were
   called technical or security-like in 7/10 en blind calls. They should read like the result
   line: 会用电脑 / Can use the computer, 能远程打开 / Can be reached from anywhere (I; not tested).

**Limits.** Haiku plays an ordinary user; this is not a human test. With 2 reps per cell there is
no statistical power. The comparative calls were told the taken words, which nudges them away
from Add-ons.

## 4. Recommendation

**本事 / Abilities.**

| Slot | 中 | EN |
|---|---|---|
| Rack heading | **本事** | **Abilities** |
| Rack (in docs and copy, if a noun is needed) | 本事架 | ability rack |
| One item | 一项本事 · 上网 | an ability · Browse the web |
| Equip (drag hint) | 拖到设备上装上 | Drag onto a device |
| Equip (menu/button) | 装到 MacBook 上 | Add to MacBook |
| Result line | **MacBook 现在会上网了** | **MacBook can now browse the web** |
| Device detail | MacBook 会：上网 · 用电脑 | MacBook can: browse the web · use the computer |
| Unequip | 取下 | Remove |
| i18n keys | `ability.rack`, `ability.equip`, `ability.result` ("{device} 现在会{verb}了 / {device} can now {verb}") | |

**Why.**
- **Ranked first in 4/4 comparisons**, in both languages, and the wording explains itself (V).
- **Same family as 事 / Task.** A 事 is something to do and a 本事 is something you can do. It is a
  plain two-character everyday word, and the user already reached for it (I).
- **The noun names what a device can do, not a part.** That fits remote access and phone calls,
  which aren't objects (raters criticised Gear and 配件 for being physical, V). The rack's
  physicality comes from the motion (`research/26` §4.1), not from the word.
- **No collision with skills/tools/plugins/extensions/apps** in either language. "Abilities"
  appears in some developer APIs (WordPress Abilities API, K), but ordinary users meet it only in
  games, which is the warmth we want.
- **Device detail reads as a sentence:** "MacBook 会：…" / "MacBook can: …". The noun is needed
  only as a heading; everywhere else the copy is a verb, which is how 事 works too.

**Guardrails.**
- zh verb **装上**, result **会…了**. Never 教会 / 学会 / 赋予 / 授权 (they read as hierarchy, V).
- No levels, stars, counts or "解锁 / unlock" (power-up read, `research/26`).
- Keep Claude Code skills as **技能 / Skills** on their own page and never put them on the rack. Then
  技能 vs 本事 stays a clear line between "what the AI knows how to do" and "what a device can do"
  (I).
- Item labels should be ability phrases (上网, 用电脑, 打电话, 用手机, 远程打开), not product
  names (Browser, cua, ADB).

**Runner-up: 能力 / Abilities.** It ranked second in zh 2/2 and keeps the English unchanged. It is
clearer to a careful reader but colder: it reads like a spec sheet, and 能力 is how tech zh writes
"capabilities". Use it if 本事 tests as too colloquial with real users (raters said "略显生硬 / 江湖"
2/2). For a more game-like English alternative, **Gear** was the strongest, but its zh 装备 rhymes
with 设备 and reads as armour, so it doesn't pair cleanly.

**Next step.** A 5-minute human check with 3 zh and 3 en non-developers on the equip prototype
(`research/26` §4.1), comparing 本事 with 能力 and the revised item labels. Pass if ≥ 5/6 say what
was gained and on which device, and no one mentions training, orders or upgrades.
