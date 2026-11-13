# 82 · Screens a task drives: asleep, reconnects, whose turn, what it did, teach by showing

Date: 2026-11-13. Feeds D248. Source of the behaviours: [research/77](77-rakazo.md) §2.3 and §8.5–8.6
(Rakazo's computer panel, VERIFIED there from its code). This report does the naming and metaphor
work AGENTS.md asks for before any of it is drawn, and checks each behaviour against what Ducter
already has (D190 Ducter's browser, D217/D234 Ducter's phone, D235 用电脑, D238 用这台手机, D220 the
workbench's Phone page).

Evidence tags: VERIFIED (read in Ducter's code or measured here), DOCUMENTED (Rakazo's docs, via
research/77), INFERRED (reasoning).

## 1. The moment, per person

| | Heavy developer | Consumer personal-AI user | Fresh user |
|---|---|---|---|
| **Moment** | opens a phone task's workbench to see the app it is testing | glances at the task that books on 美团 for them | sees a phone screen beside a task for the first time |
| **Before** | opening the Phone page boots the emulator (VERIFIED: `android/live.ts` `open()` called `device.ensure()` for every mode, watch included): 3 GB of RAM and a fan for a look | a black box with "正在打开手机…" every time the view reopens; "接手" mid-tap risks a half-done tap | no idea who is touching the phone right now |
| **After** | looking costs nothing; 叫醒 when they mean it | the last picture stays, the new one fades in; "这一步做完就轮到你"; a short list of what it did | a dozing phone they understand at once; one chip that says who is driving |
| **First time** | nothing to learn: the asleep art and one button | same | same |

North star: 好用 (one button to wake, one to take a turn), 顺滑 (no flash, no jump, no lost tap),
赏心悦目 (the dozing clay, the same family as the asleep devices), 放心 (looking never costs, the
task never gets half a tap, a list of effects not of reading), 惊喜 (a phone that dozes like the
laptop does).

## 2. What Ducter already had (VERIFIED, read in code)

- **Turns:** D190's **接手 / My turn** · **还给它 / Hand it back**, blind tasks in the person's turn,
  told on hand-back (`android/live.ts`, `browser/live.ts`). Phone sign-ins are a card's own turn.
- **The driver chip:** the workbench's Screen frame says **它在用 / It's driving** · **你在用 /
  You're driving** with a clay bead (D214). On the web its Phone page always passed `driver="agent"`
  (`workbench.tsx` PhonePage): a bug; the chip didn't follow the phone's turn.
- **Stop:** 停下 / Stop on 用电脑 and 用这台手机 (D235, D238); cancel on any task (D207).
- **The calm step line:** one step for six seconds, then quiet (D190); never what it read.
- **Asleep words for devices:** 醒着 / Awake · 睡着了 / Asleep · 叫醒 / Wake, "never broken or
  offline wording" (glossary); the asleep clay under a knitted blanket that breathes (D77, D81).
  But the phone's card said **已关机 / is off** (D217): off-glossary for a thing that resumes
  where it was (quick boot from a snapshot).
- **Watching Ducter's browser starts nothing** (D190, VERIFIED `browser/live.ts`): the browser half
  of rule 1 already held; the phone half did not.
- **Teach by showing:** nothing. Skills are **技能 / Skills** (Claude Code's, their own page);
  routines are **例行 / Routine** (D114).

## 3. Naming pass

| Thing | Candidates | Chosen | Why |
|---|---|---|---|
| a phone not running | 关机了 / Off · 没开着 · 睡着了 / Asleep · 休眠 | **睡着了 / Asleep** | the glossary's device state; true to quick boot (it resumes); "off" reads as "it can't" |
| waking it | 开机 / Turn on · 启动 / Start · 叫醒 / Wake | **叫醒 / Wake** | the glossary's verb (D56: "the same verb as for a device, on purpose") |
| why looking doesn't wake it | none · a tooltip · one line | one line: **看看不会叫醒它。叫醒要几秒钟，会用 {Mac} 的电和内存。** | the cost said once, in the person's terms |
| the turn while it is mid-step | 等一下 / Wait · 正在操作 · 这一步做完就轮到你 | **这一步做完就轮到你 / Yours after this step** | says what happens and when; reuses D190's turn words; no "lock" or "control" |
| reconnecting | 加载中 · 重新连接中 · 正在重新连上… | **正在重新连上… / Reconnecting…** | plain; on a held picture, not on black |
| the list of effects | 操作记录 / Activity log · 步骤 / Steps · 它做了什么 / What it did | **它做了什么 / What it did** | the person's question; "log" invites reading everything |
| each effect | 点了「{label}」 · 在「{label}」里输入了文字 · 打开了 {app} · 按了{key} · 滑动了屏幕 | as listed | past tense of D217's step words; labels only, never typed text |
| teach by showing (button) | see §4.3 | **做给它看 / Show it how** | clearest with no rater reading it as bossy |
| what it keeps | 做法 · 技能 · 例行 · 录像 | **技能 / Skill** (draft) | an existing word; raters never read it as repeating by itself; 例行 stays for the schedule |

Retired on screen: **已关机 / is off** and **已开机 / is on** for Ducter's phone (now 睡着了 / 醒着).

## 4. Metaphors, with mapping tables, rubric and a naive-rater test

Raters: LLM proxies (claude haiku), each a fresh agent told it is a naive user who never read the
docs, candidates in a different random order per rater, one JSON answer each. Part A/B: 5 raters;
Part C: 4 raters (the first run left Part C's labels out of the prompt by mistake; it was rerun
separately with new raters). Prompts and answers: the session scratchpad (not kept). LLM proxies
are a first filter, not people: humans later (todo).

### 4.1 The asleep screen (six candidates)

| # | Candidate | Maps | False implications |
|---|---|---|---|
| A1 | the phone's clay dozing under a knitted blanket, breathing; "睡着了"; 叫醒 | asleep, resumes, harmless, the same family as the asleep laptop/mini/server | "it's a toy" (mild; the whole look is clay) |
| A2 | black glass, a faint reflection of the last screen | off | broken, dead (2/5 raters said broken), eerie |
| A3 | moon and stars over the phone | night, rest | night mode; 2/5 thought the button might put it to sleep |
| A4 | "Z z z" letters | asleep | letters are not drawn glyphs (D73); snoring, comic |
| A5 | a power symbol on grey | off | "the picture failed to load" (1/5 broken); technical |
| A6 | no metaphor: "手机没开着" | off | flat; "off" is the wrong state word |

Rubric (1–5; legibility without labels, mapping fidelity, scale, state expressiveness, emotional
fit, distinctiveness, feasibility):

| | Leg | Map | Scale | State | Emotion | Distinct | Feasible | Raters: state read as asleep · broken · button = wake |
|---|---|---|---|---|---|---|---|---|
| A1 | 5 | 5 | 4 | 5 | 5 | 5 | 4 | 5/5 · 0/5 · 5/5 |
| A2 | 3 | 2 | 5 | 2 | 1 | 2 | 5 | 0/5 (off) · 2/5 · 0/5 (turn on) |
| A3 | 4 | 3 | 4 | 3 | 4 | 3 | 5 | 5/5 · 0/5 · 3/5 |
| A4 | 4 | 4 | 3 | 3 | 3 | 2 | 5 | 5/5 · 0/5 · 5/5 |
| A5 | 3 | 2 | 5 | 2 | 1 | 1 | 5 | 0/5 (off) · 1/5 · 0/5 |
| A6 | 5 | 2 | 5 | 2 | 2 | 1 | 5 | 0/5 (off) · 0/5 · 0/5 |

No rater thought looking costs anything for any candidate (0/30): the cost has to be said in words,
whatever the picture. **Chosen: A1**, the existing asleep-device language (D77, D81), drawn for the
phone. Feeling words: cute, cozy, adorable (5/5 warm).

Art: no clay raster of a dozing phone existed (`design/art/assets/prompts` has laptop/mini/server
asleep, the phone only awake). Generating one failed this session (the configured image provider
didn't resolve); the prompt is written (`design/art/assets/prompts/phone_asleep.md`, in
`batch.json`). Shipped meanwhile: a drawn SVG in the clay's colours and light (mint body, ink glass
with closed arc eyes, a cream knitted blanket whose rows are drawn, breathing at D77's 4.8 s), the
same drawing on the web (inline SVG) and the Mac (MyGo's SVG, two layers so the blanket moves).

### 4.2 Who is driving (six candidates)

| # | Candidate | False implications | Clarity (mean, 5 raters) | Alarming | "Can I tap now?" read right |
|---|---|---|---|---|---|
| B1 | the existing chip: a clay bead + **它在用 / 你在用**, tinted | none found | 4.6 | 0/5 | 5/5 |
| B2 | steering wheel by a robot / a person | "robot" (Ducter has partners, not robots); a car | 3.4 | 0/5 | 5/5 |
| B3 | red banner "AI IS CONTROLLING THIS DEVICE" | danger, takeover, surveillance | 5.0 | **5/5** | 5/5 |
| B4 | the task's coin and a hand, a bead under whose turn | the bead hard to read | 3.0 | 0/5 | 5/5 |
| B5 | a relay baton | a race | 3.2 | 0/5 | 5/5 |
| B6 | no mark, only the button's words | nobody knows | 1.4 | 0/5 | 3/5 |

**Chosen: B1, unchanged** (no new metaphor): it was the clearest calm one. The rater result also
justifies the instruction "not a red banner": B3 is clear and alarms everyone. What changes is that
the chip now follows the phone's turn on the web's Phone page (it was fixed to "agent"), and
reads idle while the phone sleeps.

### 4.3 Teach by showing: the button and what it keeps

| Label | Clarity (mean, 4) | Bossy | Read as |
|---|---|---|---|
| **做给它看 / Show it how** | 4.0 | 0/4 | "I show it, it learns" |
| 教它一次 / Teach it once | 4.5 | **2/4** | "like a new employee" (and 教会 is banned for abilities) |
| 我来示范 / Let me show you | 3.75 | 0/4 | "I demonstrate" |
| 看我做一遍 / Watch me do it | 3.5 | 1/4 | |
| 录一遍 / Record it | 3.25 | 0/4 | "it records my screen" (surveillance) |
| 演示一遍 / Demonstrate | 3.0 | 0/4 | |

| What it keeps | Clarity | Repeats by itself? | Read as |
|---|---|---|---|
| **技能 / Skill** | 3.5 | 0/4 | "something it knows how to do" |
| 例行 / Routine | 3.75 | **4/4** | a schedule: right for "make it a routine", wrong for the draft |
| 做法 / How-to | 3.0 | 0/4 | written steps |
| 录像 / Recording | 3.0 | 0/4 | a video file (wrong) |

**Chosen:** the button **做给它看 / Show it how**; the draft is a **技能 / Skill** (the person's own,
written as steps, read by tasks like any skill); the draft card offers **试一次 / Try it once**,
**留着 / Keep it**, and **定期做 / Make it a routine** (which opens D114's routine proposal card,
never a routine created silently: research/77 §8.7).

## 5. The behaviours, decided against Ducter's principles

1. **Asleep, never woken by looking.** A watch view of a phone that isn't running is asleep: no
   hold, no start, no frames; a task starting the phone wakes the view by itself (looked for every
   2 s). Only **叫醒 / Wake** starts it. The device card's **打开手机 / Open the phone** and a card's
   own turn (a sign-in) are explicit asks and still start it. Ducter's browser already worked this
   way (D190). 用电脑 has no live view (the Mac's screen is the person's own); 用这台手机 is the
   person's phone in their hand.
2. **Smooth reconnects.** Each client keeps the last frame per phone in memory; a view that opens
   again starts on it, quiet (a little desaturated), with **正在重新连上… / Reconnecting…** over it,
   and the new stream fades in (360 ms; none with reduced motion). Never black, never a spinner
   over black, and the screen keeps its shape (aspect ratio from the frame).
3. **Whose turn, lockable.** My turn while the task is mid-step (a phone tool in flight) waits for
   that step: the button reads **这一步做完就轮到你 / Yours after this step**, the line **它在做这一步，
   做完就停下来等你。**, and the turn is the person's the moment the step ends (8 s at most). Tapping
   it again lets it be. Hand it back stays one tap. 停下 / Stop is never locked (it interrupts the
   task; it doesn't grab the screen). The task "asking" is already the person's turn from the
   start (a sign-in card, D217).
4. **What it did, not what it read.** The home keeps, per task, in memory only, the last eight taps,
   typings, keys, swipes and apps it opened (labels as the screen names them, never typed text,
   never a look or a picture); a watch view gets them, and shows the newest five under the screen.
5. **A picture, not the person's turn.** A brief rule for phone and app work: when the person only
   needs to see something (a QR code, a confirmation number), the task takes `phone_screenshot` and
   puts it in its report's `show` (the conversation shows pictures already, D206); its own turn
   only when the person's hands are needed. On a Mac app, it says which window shows it.
6. **Teach by showing.** Design only (§4.3, `computer-use.md` §8): recording the person's steps in
   the live view and drafting a skill from them is a larger build (a recorder of the person's
   inputs in their turn, password fields never recorded, a model pass to write the steps, the
   skills page). Ducter's phone is the first place: its live view already carries the person's taps.

Small rules (research/77 §8.6):
- **A request for the person's turn keeps the phone awake 30 minutes**, so the sign-in page is
  still there when they come; then the task lets go and the phone may sleep (opening the card
  wakes it). Built.
- **A reminder after about 4 hours waiting on the person:** not built. Ducter has no reminder
  mechanism for an open card (VERIFIED: no such code in core); it belongs with the attention
  forecast and push, decided there (todo, with its trigger).

## Implications for Ducter

- Phone: `android/live.ts` asleep state and `wake`, steps in flight (`acting`) and a waiting take,
  the per-task "did" ring; `android/index.ts` the 30-minute ask; protocol `phone_wake`,
  `phone_view.state: "asleep"`, `taking`, `phone_did`.
- Clients: the asleep drawing, the held frame and fade, the waiting turn button, the did list, the
  chip following the turn (web), on the web and the Mac.
- Brief: one section, "A picture, not the user's turn", for phone and app tasks.
- Copy: 睡着了 / 醒着 for Ducter's phone everywhere; the new words in the glossary.
- Later: the dozing phone as clay raster art (prompt ready); a live view for 用电脑 on a worker Mac;
  teach by showing; the 4-hour reminder; human raters for §4.

## Summary

Ducter already had most of the words (叫醒, 接手 / 还给它, 它在用 / 你在用, 停下) and the asleep
look (a clay device under a breathing blanket); the rater test (LLM proxies) confirmed both over
five alternatives each, and showed the red "AI is controlling" banner alarms 5/5. What was missing
was behaviour: the phone's watch view booted the emulator, a reconnect showed black, My turn could
cut a tap in half, and there was no list of effects. D248 fixes those on the home, the web and the
Mac, adds the picture-not-takeover brief rule and the 30-minute awake window, and designs teach by
showing (做给它看 → a draft 技能) without building it yet.
