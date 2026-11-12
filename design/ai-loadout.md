# AI loadout: what the partner thinks with, and who does the tasks

> 2026-11-09 · **Decided as D89 (defaults approved "按建议 go") and built on branch
> `ai-loadout`**, except quota: the reserve, limit-based ranking and the quota fallback are not
> built, since no harness reports its limit yet (D133, roadmap); the opened task's layout that came with it is D90. §9 lists the decisions as
> they were proposed; `design/decisions.md` has them as decided. Build evidence:
> `~/dev/ducter-evidence/ai-loadout-build/`. Prototype: https://claude.ai/artifact/GCok6tfLJ91Vgkevz3yD6a (private; recommended
> and runner-up, three kinds of user, Claude Code's limit plenty or almost out, zh/en, Still
> mode, new words marked). Evidence (outside git, D75):
> `~/dev/ducter-evidence/ai-loadout/` (`exp/` prompts, scripts, raw answers in `out/`, grades in
> `judge/`; `proto/` the page).

The author asked: "我们没有 main ai 和 focus window ai 的配置的地方？应该也是游戏界面风格的才对".
Today there is no place. The partner's harness is hard-coded and its model comes from an
environment variable; who does a task is chosen by the partner in the moment, steered only by
rules said in the conversation (VERIFIED below). This note designs where and how a person
chooses (1) what the partner thinks with and (2) who does the tasks, and how one task's choice
is shown and changed.

**Labels.** **VERIFIED**: read in code this session, or my own experiment. **DOCUMENTED**: a
design doc or approved artifact says so. **INFERRED**: my judgment.

## 1. What exists today

| Fact | Source |
|---|---|
| The partner always runs on Claude Code; the model is `DUCTER_PARTNER_MODEL`, default `opus` | VERIFIED `packages/partner/src/partner.ts` (`startSession`: `harness: "claude-code"`; `opts.model ?? process.env.DUCTER_PARTNER_MODEL ?? "opus"`) |
| The partner is always config-isolated; Codex as partner "needs `-c` overrides and no user `AGENTS.md` (not built)" | DOCUMENTED `design/system.md` "The user's own harness config" |
| A task's harness and model are optional arguments of `task_open` (`claude-code` · `codex` · `pi`); unset, `DUCTER_TASK_MODEL`, then the harness default | VERIFIED `partner.ts` tool schema; `system.md` "Task model" |
| `fw_candidates` (filter, rank, top 3 with reasons, `body_selected`, card subtitle "Codex · gpt-x — your rule: backend refactors") is designed, not built | DOCUMENTED `focus-window.md` "Choosing a body"; VERIFIED no `body_selected` / `fw_candidates` in `packages/` |
| Rules are said in the conversation and kept as memories ("0.8+ for explicit always/never rules"); there is no rules list anywhere in the UI | VERIFIED `partner.ts` memory tool; `Settings` in `packages/protocol/src/index.ts` has no rule field |
| Each device reports its harnesses: `installed`, `loggedIn`, and `allowance {left, resetsAt, sharedBy}` only when the harness reports it | VERIFIED `packages/protocol/src/index.ts` `DeviceHarness`, `Allowance` |
| `Settings` is name, language, memory, notify, quiet hours, default wait; one frame `settings` / `settings_set` | VERIFIED same file, D71 |
| A main-AI quota reserve is kept per subscription, shared by all personas' main turns | DOCUMENTED `product-model.md` §5, `focus-window.md` |
| One account's limit is shared by every device signed in to it; the picture never says so, one literal line does (0/56 → 21/40) | DOCUMENTED `research/33` (branch `devices-world`) |
| DeepSeek Harness: no mention in the repo or in OAR as read here | VERIFIED `grep`; whether it bills per use is INFERRED |

## 2. First principles: what does the person actually want to control?

Starting from the person, not from the config surface (INFERRED, checked against D36 and
principle 14):

1. **"Which of my subscriptions is Ducter spending, and is it the smart one?"** For the
   partner, the person wants one thing: the best model they already pay for, answering fast.
   The control is *one choice*: account + model. Nothing else about the partner's brain is
   theirs to tune.
2. **"Don't burn the account I need."** For tasks, people don't want to assign; they want
   to *bound*: prefer X for this kind of work, don't use Y for tasks at all, and never run out
   of the partner's own answers. So the controls are a rule list (already the design), an
   on/off per account for tasks, and a visible reserve.
3. **"Why that one?"** Trust comes from a reason in words on every task and a way to switch,
   not from a settings table. Principle 14 already says this; the gap is only that the UI
   doesn't show it.
4. **"Will it still be my Ducter?"** Switching the brain must say, in words, that the name,
   memory and conversation stay. That is true by construction (principle 9: the partner is
   sessionless, rebuilt from the Log and Mem) and **never read from the picture**: 0 of 48
   raters in round 1 (§5).

What makes it zero-setup: the first run already signs in one account (D70), and that account
is both the brain and the doer. The page shows the one choice made, and the second card
appears only once a second account exists.

Limits that must be visible (from Isles, `research/33`): one limit per account, **shared by the
partner and tasks and by every device** signed in to it; the slice **kept for the partner**;
when it comes back; and, for any harness billed per use, that it costs money each time.

## 3. The three people (AGENTS.md "User first")

| | Heavy multi-agent developer (the author) | Consumer personal-AI user | Fresh user (never heard of a subagent) |
|---|---|---|---|
| **Who, in this moment** | Claude Max (Opus, Sonnet) and ChatGPT Pro (Codex) on this Mac, pi installed, a VPS (cloud-1) also signed in to Claude Code. Has opinions: backend on Codex, UI on Claude | Pays for one assistant (say ChatGPT Plus, so Codex). Picked Ducter for "the same powers with stronger models" (D44) | Got here through the five-minute first run with one Claude sign-in. Doesn't know there is a "harness" |
| **Before** | Suspicious: which account is it burning, why did it pick Codex, will the VPS starve the partner? | Curious and a little proud of their choice; afraid of surprise costs | Nothing to feel; any settings page is a chore |
| **After** | 放心: the brain is in one socket, every account's ring and reserve is right there, every task says who and why, two switches propose a rule | 好用 / 惊喜: their one subscription runs everything; the brain socket feels like picking a character's power; the "pay per use" line is said before it costs anything | 顺滑: nothing asked; the page says one sentence ("Tasks use Claude Code too") |
| **How it starts** | Opens 伙伴 / Partner (⌘4) and finds the socket already holding Claude Code · Opus, the tray filled from the sign-ins, and the rules they said last week listed | Same page; one token in the socket, one line under "Who does the tasks" with a link to sign in another account on Devices | Never has to open it. If they do: a clay Ducter, a socket with one token, one reassuring line |

## 4. Where it lives

Candidates for the place (INFERRED):

| Place | For | Against |
|---|---|---|
| **伙伴 / Partner** (character sheet) | "What it thinks with" is *about the partner*; the sheet already holds how it talks and what it remembers (D71); equipping a character is the author's own game reference | Accounts also live on Devices: two views of the same tokens |
| **设备 / Devices** (accounts stand on islands) | Accounts are already there, per device, with the shared-limit lift | The brain is a property of the partner, not of a device; a fresh user would never look for "what Ducter thinks with" under Devices; the page is already the busiest |
| A new place | Room for a big loadout screen | D71 closed the IA at five places; a sixth for one choice and a rule list fails "avoid a new place unless clearly better" |

**Recommendation: the Partner page.** Two new cards at the top of the character sheet, above
the four D71 cards. Devices stays the place to install and sign in (unchanged), and its account
tokens gain one mark ("Ducter 想事情用 / Ducter thinks with this") so the two views agree.
Rules live on Partner too because they are *the partner's* way of choosing; the tray shows only
accounts on the Mac Ducter lives on, because the partner can only think with those (S1 in
`research/33`). Accounts on cloud-1 stay on its island on Devices; tapping Claude Code on either
page lifts every place it's signed in.

## 5. Metaphor candidates and false implications

Six candidates, genuinely different, two with no metaphor. Every table lists what each part
would wrongly suggest (INFERRED; rater counts from §6).

**A. Equipment slots around the character** (RPG character sheet). A "Thinks with" slot on the
partner's forehead, four "Works with" slots in a ring, a padlocked slot for DeepSeek, rule tags
hanging from slots.

| Element | Means | False implications |
|---|---|---|
| forehead slot | what the partner thinks with | the account is part of its body; a different token = a different being |
| ring of slots | accounts for tasks | the partner *owns* them; slot count is a limit; more slots = stronger |
| padlock | not installed | earned by levelling up; paid unlock |
| hanging tags | rules | stats, buffs |
| reads | | game 8/8, Ducter is boss 6/8 |

**B. Party roster.** The partner at the front, coin figures with feet behind it as party
members, stamina bars, role sashes, "Recruit" for DeepSeek.
False: AIs are people (6/8) or servants (6/8); Ducter commands them (8/8); stamina = they get
tired and need rest (half true for limits, false about why); "recruit" = hire. Violates
"partners, not hierarchy" at the next level down.

**C. Formation board.** A clay field with zones (Backend, Interface, Writing, Anything else),
tokens placed in zones, a bench.
False: players and a coach (people 8/8); competition; zones are exclusive positions; the bench
is punishment. Mapping fidelity for rules is the best of all (a zone *is* a kind of work), but
rules that aren't about a kind of work ("not on cloud-1") have nowhere to go.

**D. Console and cartridges.** The partner as a handheld console with a cartridge slot on its
back; a cartridge rack for tasks; stickers for rules.
False: Ducter is a machine whose identity is the cartridge (one rater: "memory may live in the
cartridge"); cartridges are bought; swapping restarts the game. Needs the partner redrawn as a
device, which breaks the clay character's identity reference (D53).

**E. Literal clay (no metaphor).** The real tokens on a tray in front of the Mac, a clay cord
from the brain's account up to the partner labelled "Ducter thinks with Claude Code · Opus",
plain rule lines.
False: the cord is a cable you can unplug (`research/33`: slack cords read as "plug it in";
here it never goes slack); the tray is a shop.

**F. Plain settings list (no metaphor, no art).** Two dropdowns, an "Available" list, a rules
table.
False: none structural; it feels like admin (1/8 positive) and tells the fresh user there is
config to maintain.

**H. Socket beside the partner + tray of this Mac's accounts** (the hybrid this note
recommends; built from round 1's findings). One round clay socket beside the partner's head,
labelled "Thinks with", holding one token; the tray below holds this Mac's accounts with limit
rings; the brain's token leaves a dashed "Thinks with" place on the tray; switching lifts the
tokens that can go in, and the chosen one flies into the socket with the approved
lift → arc → tock (`research/26`), the old one drops back.

| Element | Means | False implications |
|---|---|---|
| socket beside the head (not on it) | what it thinks with, one at a time | the token is a body part (weakened: the socket is beside it); one socket = you can't use two (true for the partner) |
| tray labelled "AI accounts on this Mac" | the accounts that do tasks, on this computer | a shop or inventory to fill; accounts on other devices are missing (true: they're on Devices) |
| dashed place on the tray | the brain's token is in use as the brain, still yours | it's gone from tasks (false: the same account still does tasks) |
| ring around a token, darker last stretch | limit left, and the part kept for the partner | battery of the device (`research/24`) |
| rule lines on the card | the person's rules | a fixed table; complete list of what Ducter considers |
| switch with a tock | a choice that takes effect | a permanent upgrade |

## 6. Comprehension test (VERIFIED)

**Method.** Same harness as `research/33`: `claude -p --model haiku --tools ""
--no-session-persistence` in a scratch directory, one persona per rater, "answer from the
picture alone", JSON out; Sonnet grades every answer against a written key (`exp/judge.py`).
Each candidate is the same real scene (this Mac: Claude Code with Opus/Sonnet, 64% left, shared
with cloud-1, 10% kept for Ducter; Codex gpt-5, 48%, Mac only; pi installed, no model; DeepSeek
not installed; rules "Backend → Codex", "Interface → Claude Code"; a task "Fix CI in HawDB ·
Claude Code · Sonnet"), then two changes: Codex becomes what it thinks with; Claude Code drops
to 5% and the task moves to Codex. Personas mix all three users: of each 8, four never used an
AI, two daily AI-chat users, two multi-agent developers (round 2 and 3 add 8 more of the same
mix). 11 questions: q1 what it thinks with · q2 still the same Ducter and remembers (after
change 1) · q3 who does a task when unsaid · q4 the rule · q5a tasks share the partner's limit ·
q5b the reserve · q6 cloud-1 shares the limit · q7 what DeepSeek needs · q8 why the task moved
and how to switch · q9 who's in charge, what the AIs are · q10 feeling. Misread flags:
**boss** (Ducter is boss/manager of the AIs, or the user commands troops), **servant** (AIs or
Ducter read as servants/employees), **people** (AIs read as living characters), **game**
(competition, stats, levelling), **newself** (a switch makes a different Ducter).

Totals: round 1, 6 × 8 = 48 raters; round 2, 4 × 16 = 64; round 3, 3 × 16 = 48 (one English,
two Chinese panels). 160 rater calls and 20 grading calls. The one `~/.claude/projects` folder
the runs created was deleted.

**Round 1 (n = 8 each).**

| Candidate | q1 | q2 | q3 | q4 | q5a | q5b | q6 | q7 | q8 | Sum /72 | boss | servant | people | game | positive |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A Equip slots | 7 | 0 | 7 | 8 | 8 | 8 | 6 | 8 | 7 | 59 | 6 | 3 | 0 | **8** | 5 |
| B Party | 8 | 0 | 5 | 6 | 8 | 7 | 8 | 5 | 8 | 55 | **8** | **6** | **6** | **8** | 5 |
| C Field | 8 | 0 | 3 | 8 | 8 | 8 | 8 | 8 | 8 | 59 | 6 | 4 | **8** | 5 | 7 |
| D Console | 8 | 0 | 8 | 5 | 7 | 8 | 7 | 8 | 8 | 59 | 0 | 2 | 0 | 0 | 5 |
| E Literal cord | 8 | 0 | 7 | 8 | 8 | 8 | 8 | 8 | 7 | **62** | 0 | 4 | 0 | 0 | 6 |
| F List | 7 | 0 | 6 | 5 | 6 | 6 | 8 | 8 | 8 | 54 | 4 | 6 | 0 | 0 | **1** |

**Round 2 (n = 16 each, repaired).** Repairs: one literal line under the thinking spot,
"Switching keeps its name, what it remembers and your conversation"; the accounts on a tray
that belongs to "this Mac", not in slots around the body; no padlock. E2b is E2 with the word
"brain" ("Ducter's brain: Claude Code · Opus").

| Candidate | q1 | q2 | q3 | q4 | q5a | q5b | q6 | q7 | q8 | Sum /144 | boss | servant | people | game | positive |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A2 Sheet with socket | 16 | 15 | 14 | 14 | 15 | 16 | 16 | 16 | 10 | 132 | 9 | 9 | 0 | 16 | **14** |
| D2 Console | 16 | 15 | 12 | 15 | 15 | 16 | 16 | 16 | 16 | 137 | 5 | 1 | 0 | 0 | 11 |
| E2 Literal cord | 15 | 8 | 12 | 15 | 15 | 15 | 13 | 15 | 14 | 122 | 12 | 3 | 2 | 0 | **14** |
| E2b Literal, "brain" | 16 | 15 | 15 | 15 | 16 | 16 | 15 | 16 | 16 | **140** | 14 | 5 | 1 | 0 | 12 |

**Round 3 (n = 16 each): the recommended design H**, described without the words "game-style"
(rounds 1–2 used them for A, B, C and A2, which inflates their **game** flag), in English and in
two Chinese panels comparing the socket label 想事情用 with 脑子.

| Panel | q1 | q2 | q3 | q4 | q5a | q5b | q6 | q7 | q8 | Sum | boss | servant | people | game | positive |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| H, English, "Thinks with" (n = 15, one grade lost) | 14 | 11 | 13 | 13 | 14 | 14 | 13 | 14 | 14 | 120/135 | 11 | 3 | 1 | 0 | 9 |
| H, 中文, 想事情用 | 16 | 15 | 16 | 16 | **4** | 16 | 16 | 16 | 16 | 131/144 | 3 | 2 | 1 | 0 | **16** |
| H, 中文, 脑子 | 16 | 16 | 16 | 16 | **5** | 16 | 16 | 16 | 16 | **133/144** | 0 | 1 | 2 | 0 | **16** |

With "game-style" removed from the prompt, the **game** flag is 0 in all three panels. The two
Chinese panels felt warmest of any run (16/16 positive: "温暖、柔软、好玩", "像养了个小伙伴").
Chinese q5a is low because "2 台设备共用" says the limit is shared by devices but not that tasks
and the partner draw on the same one; most raters answered "不确定会不会挤到留给它的那部分". The
prototype now says it outright: "做事和 Ducter 想事情用的是同一份额度".

**Findings.**
1. **Memory continuity is never read from a picture.** 0/48 in round 1, in every candidate:
   raters said "the picture can't show memory". One literal line took it to 15/16 (A2, D2,
   E2b). The line is part of the design, not optional copy. Same lesson as the shared limit in
   `research/33`.
2. **Slots around the character read as a game and the partner as owner of the AIs** (A: game
   8/8, boss 6/8; A2 kept game 16/16 even with the tray, partly from the prompt). **Figures with
   feet read as people and servants** (B: people 6/8, servant 6/8; C: people 8/8). Keep the
   AIs as coins, never characters.
3. **The literal shared limit and reserve lines work everywhere** (q5a, q5b, q6 at 13–16/16 in
   round 2): the words do the work; the ring is a glance.
4. **"Ducter is in charge" is mostly true, not a misread.** The **boss** flag counted any
   "Ducter is in charge"; raters almost always meant "Ducter picks which AI does what", which is
   the design. Only a few said "boss of workers"; servant counts are the better hierarchy
   signal (D2 1, E2 3, E2b 5, A2 9 of 16). The user being in charge was said spontaneously by
   few raters in any candidate (INFERRED from reading q9); the page says "你的规则 / Your rules"
   and every rule is removable, which is the honest way to show it.
5. **"Brain" was understood at least as well as "thinks with" in English** (E2b 140 vs E2 122;
   most of the gap is q2 hedging), with a little less warmth (12 vs 14 positive). In Chinese, 脑子 and 想事情用 were indistinguishable (133 vs 131 of 144, both 16/16 positive, 脑子 0 boss reads vs 3); a few raters asked whether 脑子 "is Ducter itself or a card". No rater read 换脑子 as the idiom "change your mindset", but the proxies may not catch it (INFERRED).
6. **Switching a task was found from the small "Switch" link** (q8 14–16/16 except A2 10/16,
   where raters weren't sure a switch was possible while the limit was low).

**Limits.** Haiku as a proxy, one model, scenes and key written by me, motion described in
words, Chinese only in round 3. The proxies hedge ("unsure"), which lowers every cell. The
grader's **boss** flag is too broad (finding 4). A human test is still owed (D65's bar: ≥ 80%
on key items, no boss or servant reads).

## 7. Rubric (INFERRED, 1–5; legibility from §6)

| | Legible | Fidelity | Scale (1→6 accounts, 0→10 rules) | States | Emotion (D36) | Distinct | Feasible in MyGo | Total |
|---|---|---|---|---|---|---|---|---|
| **H Socket + tray** | 4 | 4 | 4 | 5 | 4 | 4 | 4 | **29** |
| E Literal cord | 4 | 4 | 4 | 4 | 4 | 2 | 4 | 26 |
| A Equip slots | 3 | 2 | 4 | 4 | 4 | 4 | 4 | 25 |
| F List | 3 | 4 | 5 | 3 | 1 | 1 | 5 | 22 |
| D Console | 4 | 2 | 3 | 4 | 3 | 4 | 1 | 21 |
| C Field | 2 | 3 | 2 | 3 | 4 | 4 | 3 | 21 |
| B Party | 2 | 2 | 3 | 4 | 4 | 3 | 2 | 20 |

Notes: D's comprehension is high but it turns the partner into a gadget and needs the clay
character redrawn (feasibility 1, fidelity 2: identity in the cartridge). E is the runner-up:
the same understanding, less of the game feel the author asked for, and a cord already means
"connection to a device" on Devices (D65/R33), so a second meaning for cords on Partner muddies
both. H keeps the partner a character, the AIs coins, and the one game moment (dropping a token
into a socket) where it carries meaning: a single choice that takes effect.

## 8. The recommended design (prototype)

**Partner page, top of the character sheet** (the clay partner and its socket on a small
stage, the tray in front; two cards beside it; the four D71 cards below).

1. **用什么想 / What it thinks with** (proposal). The token in the socket, the model as a
   segmented clay control with two plain words per model (Opus **最聪明 / Smartest**, Sonnet
   **回得更快 / Answers faster**; Codex gpt-5 and gpt-5-mini the same), **换一个 / Switch**
   (only when a second account can be a brain), and two standing lines: **换了以后，名字、记得的
   事和你们的对话都还在。/ Switching keeps its name, what it remembers and your conversation.**
   and the reserve (**其中 10% 给 Ducter 留着 / 10% of it is kept for Ducter**). A switch takes
   effect from the next message (principle 9: the next turn's projection starts a session on the
   new harness; no state moves). The result line: "Ducter 现在用 Codex 想事情了 / Ducter thinks
   with Codex now". Only accounts on the home Mac can go in (said once, quietly).
2. **谁来做事 / Who does the tasks** (proposal). One sentence for the default: "每件事 Ducter
   挑一个：最合适、额度最够的那个。/ For each task Ducter picks one: the best fit with the most
   limit left." Tapping a token opens its line: limit, where it's signed in, the reserve, **按用量
   付费 / Pay per use** for API-billed harnesses, and a switch **用它做事 / Use it for tasks**
   (off = a hard filter in `fw_candidates`). Then **你的规则 / Your rules**, one sentence each,
   **删除 / Remove**, and **跟 Ducter 说一条规则… / Tell Ducter a rule…** which opens the
   conversation (rules stay conversation-first, `focus-window.md`). With one account the card is
   one line: "做事也用 Claude Code。再登录一个 AI 账号，Ducter 就能按事情挑。" and a link to Devices.
3. **States on the tray:** signed in (ring), installed with no model (pi: dashed ring, "先选模型 /
   Pick a model first" → pi's own setup), not installed (DeepSeek: dashed spot, **装上 /
   Install** → the D70 installer row), limit almost out (ring nearly empty; when only the reserve
   is left, "额度还剩 5% · 都是给 Ducter 留着的"). Nothing blinks (D77); tokens float, the partner
   breathes and blinks.
4. **On a task:** the conversation's task line ends with who's doing it ("· Codex · gpt-5");
   the reason shows when it isn't the plain default ("Claude Code 额度不多了"); Details gains
   "谁在做 / Who's doing it: Codex · gpt-5 · 按你的规则「后端的事 → Codex」". Both open **换谁来做 /
   Switch who does it**: the top three from `fw_candidates` with a reason and the limit each,
   unavailable ones greyed with why, and **换到 X 接着做 / Continue on X** (the glossary's handoff,
   from saved progress). After the second switch the same way, one decision card: "以后后端的事也用
   Claude Code？" with 好 / 先等等, default hold (`focus-window.md` "Learned suggestion").
5. **Runner-up in the prototype:** the literal cord (E2), same cards.

**New words** (all proposals; none is in the glossary yet): 用什么想 / What it thinks
with · 想事情用 / Thinks with · 换一个 / Switch · 挑一个放进去 / Pick one to put in · 换了以后，名字、
记得的事和你们的对话都还在 / Switching keeps its name, what it remembers and your conversation ·
从你的下一句话开始用 / Takes over from your next message · 最聪明 / Smartest · 回得更快 / Answers
faster · 谁来做事 / Who does the tasks · 其中 n% 给 {name} 留着 / n% of it is kept for {name} · 按用量
付费 / Pay per use · 用它做事 / Use it for tasks · 你的规则 / Your rules · 删除 / Remove · 跟
{name} 说一条规则… / Tell {name} a rule… · 换谁来做 / Switch who does it · 先选模型 / Pick a model
first. Reused: 规则, 额度, 装上, 换到 X 接着做, 谁在做, 好 / 先等等, and **AI agent** as the category (D88): the tray is labelled "这台 Mac 上的 AI agent / AI agents on this Mac" (the raters saw "AI accounts on this Mac"; D88 landed after the test, and the tray holds pi and DeepSeek, which have no account yet).

## 9. Decisions the author needs to make (proposed defaults)

1. **Where:** both cards on 伙伴 / Partner; Devices only marks the brain's token. *Default: yes.*
   Alternative: the brain on Partner, the tray and rules on Devices.
2. **The metaphor:** H (socket beside the partner + tray), cord (E) as runner-up. *Default: H.*
3. **The word:** zh 想事情用 vs 脑子; en Thinks with vs Brain. *Default: 想事情用 / Thinks with as the socket label and 用什么想 / What it thinks with as the heading: literal, says what it does, and avoids 换脑子 (an idiom for changing one's mindset) and the "brain transplant" image. The proxies do not separate the two (§6 finding 5), so 脑子 / Brain is a fair alternative; the prototype has a switch for it.**
4. **The partner's default brain** when several accounts exist: the strongest signed-in model
   (Claude Code · Opus today, as the code does) vs the fastest good one (Sonnet) for quicker
   acks. *Default: keep Opus; show Sonnet as "回得更快".*
5. **The reserve:** 10% of the brain's account, shown as a darker stretch of its ring and in
   words; tasks wait or move when only the reserve is left. *Default: 10%, not editable in v1.*
6. **Which harnesses may be the brain in v1:** Claude Code only (built, isolated) and show the
   others as tasks-only with "以后会有 / Coming later" in the socket, vs build Codex-as-partner
   (`-c` overrides, no user `AGENTS.md`). *Default: Claude Code and Codex; pi and DeepSeek
   tasks-only until each passes the partner eval (`packages/partner/eval`).* Both passed it
   (D177, research/50): all four may be the brain now, so "以后会有 / Coming later" shows only for
   an AI agent the registry doesn't let carry the partner (none today).
7. **Rules UI:** list and remove on Partner, add only by saying it. *Default: yes; no rule
   editor form.*
8. **Per-account "Use it for tasks" switch.** *Default: on for every signed-in account.*
9. **Record as a decision** (the next free number, D89 or later; D81–D87 are held by open branches) once 1–3 are answered, then run the
   change loop: glossary rows, `focus-window.md` "Choosing a body" (UI part), `ui.md` (the
   Partner canvas), `scenarios.md` (E "switching model or harness"), `docs/` (a "Choosing the
   AI" page), `todo.md`.

## 10. Build plan

**Protocol (`packages/protocol`, mirrored in Go `apps/desktop/internal/protocol` and web):**
- `Settings` gains `brain: { harness: string; model: string } | null` (null = Ducter's default)
  and `taskAccounts: Record<string, boolean>` (missing = on). Persisted in `settings.json`.
  `settings_set` validates that `brain.harness` is signed in on the home device and supports the
  partner role; otherwise an `error` frame with a reason the clients word.
- `DeviceHarness` gains `models?: { id: string; label: string; speed?: "fast" }[]`,
  `canBePartner: boolean`, `billing: "subscription" | "usage"`, and `allowance.reservedFor?:
  { persona: string; share: number }`.
- New frames: `rules` → `{ t: "rules"; rules: RuleView[] }` with `RuleView { id; text; scope:
  "user" | "persona" | "project"; createdAt }`, and `rule_remove { id }`. Rules come from the
  ledger constraint the partner compiles (`focus-window.md`); until that exists, from the
  memories it saved as rules (importance ≥ 0.8, a rule tag).
- Task cards gain `body?: { harness; model; why: { kind: "default" | "rule" | "limit" | "you";
  ruleId?: string; text: string } }` from a new `body_selected` Log event; new client frame
  `task_switch { taskId; harness; model }` (a pin, and a handoff if running) answered by
  `action_result`; a `candidates` request returning the top three with reasons.

**Core / partner:**
- `startSession` reads `settings.brain` (env stays as an override for tests); a change ends the
  current session at the next cut and the next turn starts on the new harness. Codex as partner
  needs the isolation flags from `system.md` and a pass of the partner eval.
- `fw_candidates` v0: hard filters (signed in, `taskAccounts`, reserve), then rules, then the
  shipped tier table; writes `body_selected`; the partner's `task_open` passes its pick.
- Reserve: before starting a task on the brain's account, check `allowance.left` against the
  reserve; at the reserve, rank it last and say why.

**Desktop (MyGo, `apps/desktop/internal/views/partner.go`):** a stage at the top of the sheet
(pedestal, the partner's state faces, a socket drawn like the D65 slot, tokens with rings as
vector arcs), the two cards, the equip motion already in `abilities.go`; Devices' account token
gets the "thinks with" mark; the task line and Details get the who line and the switch sheet.
Estimate 3–4 days, plus one art item: a socket render matching `slot_empty` (INFERRED).

**Phone web (`apps/web`):** in the Settings sheet (tap the partner, D71), the same two cards as
lists (a row with the token, the model as a two-choice segmented control, the keep line; the
rules list with Remove); the task page's Details gets the who line and the switch sheet. No
stage on the phone. Estimate 1–2 days.

**Tests:** `packages/core/test/settings.test.ts` for `brain` and `taskAccounts`; a fake runtime
where a brain switch starts the next session on the other harness and the conversation
projection is unchanged; `fw_candidates` table tests (rule, reserve, account off, nothing left →
one line with a default, never a silent fallback).

## Summary

There is no place today; the partner is hard-coded to Claude Code. Recommendation: two cards at
the top of the Partner page, built around one clay socket beside the partner (what it thinks
with) and a tray of this Mac's accounts (who does the tasks, with Ducter picking by default and
the person's rules listed); every task says who and why and can be switched. The decisive
evidence: memory continuity and the shared limit are only read from words (0/48 → 15/16), slots
around a character read as a game and an owner, figures with feet read as people and servants.
Runner-up: the literal cord.
