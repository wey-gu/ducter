# 174 · Small apps to the bar: the author's app on 0.1.0, what a new app looks like now, marks, state

Date: 2026-11-20, on main at `95890a64` (D421 merged). Feeds D422 (`design/apps.md`). Follows
research/166 (D405) and research/169 (D410).

Tags: **VERIFIED** = read in Ducter's code or run here; **REPORTED** = what the author said or
showed; **INFERRED** = judgment. Raters are LLM proxies (haiku, sonnet), never people: they show how
a careful naive reader parses a screen, not how a person feels.

Shots (`.shots/apps-bar/`, gitignored, D75): before `before-web-shelf-1400.png`,
`before-phone-app-390.png`, `before-phone-shelf-390.png`, `before-web-app-1400.png`; D410's best case
`d410-web-shelf-1400.png`, `d410-phone-app-390.png`; after `after-web-shelf-1400.png`,
`after-phone-shelf-390.png`, `after-phone-shelf-390-dark.png`, `after-phone-oldapp-390.png`,
`after-phone-changing-390.png`, `after-phone-trip-390.png`, `after-web-failed-1400.png`,
`after-ios-shelf.png`, `after-ios-oldapp.png`, `after-ios-changing.png` (iPhone 17 Pro Simulator,
Safari); the real Mac app built from this branch, the old app's window `after-mac-real-window-oldapp.png` and its page `after-mac-real-page-oldapp.png`; the Mac `mac-states-shelf-{1400,1000}-{zh,en}-{light,dark}.png`,
`mac-states-window-<id>-…png` (the views' test renderer); generated apps `gen/`; the mark test
`icon-test-d418-marks.png`, `icon-test-d410-marks.png`; the image trial `icon-trial-codex-*.png`.
All against demo cores on scratch data (`apps/web/demo-apps-home.ts`, `DEMO_STAGE=before|shelf|states`);
never `~/.ducter` or :7777.

## 1. What the author saw (REPORTED) and why (VERIFIED)

His Your apps on 0.1.0: one white tile with a grey placeholder glyph, 出差花销, 「6 小时前更新」, 「⋯」.
The app: a plain form (出差名称, 日期, a native 分类 select, 金额 with a number stepper, 币种 CNY, 备注,
a small 保存), then 花销明细 with a second native select and a bold 「暂无花销」; the foot 「不联网；它要
问的都经过 Ducter。」 and the line to change it.

- **It is the 0.0.99 app, never brought up.** D410 shipped the kit, the lint and filling from what
  Ducter knows for apps made *after* it. This app was made the morning before, so its file has no kit,
  its meta no mark and no line. Nothing on the home looks at an existing app again: no migration, no
  offer, no word on its tile. The author met the old app inside the new place. (VERIFIED: the demo's
  `before` stage reproduces his screen exactly, `before-phone-app-390.png`.)
- **The grey square** is `appIcon()`'s fallback: no `icon` → the window glyph. Six marks existed and
  the partner rarely needs the fallback, but every old app shows it.
- **Nothing alive.** The tile had a line only from `ducter.summary` (an old app never calls it), and
  「{time} 更新」. A routine's state (D407) was a pill 「自动更新」 with a dot (a dotted pill, against the
  author's own rule) and no last or next round; a change asked for, a page that threw, a round that
  failed: none had a word anywhere. The bridge already posted the page's `error`; no client listened.
- **The foot** said the sandbox's mechanism (「不联网；它要问的都经过 Ducter」): true, but it is plumbing,
  not what a person wants to know (who sees it; whether it is current).

Measured against D36: 好用 no (his own trip, already booked, had to be typed); 顺滑 no (a form before
anything); 赏心悦目 no (the system's grey controls inside clay; a placeholder mark); 放心 half (the
sandbox is real, its sentence is jargon, and no state is said); 惊喜 no.

## 2. What a new app looks like on 0.1.1 (VERIFIED, 6 asks × 2 runs, haiku through the real tool)

The eval's real partner path (`--only`, `DUCTER_EVAL_APPS_DIR`) on six asks: the trip with bookings
known (`app-trip-known-zh`), spending with nothing known (`app-generic-en`), a habit tracker
(`app-habit-en`), a trip by day (`app-make-zh`), and two new ones: a parent's feeds with two given in
the sentence (`app-baby-zh`) and the developer's four waiting PRs just listed in the conversation
(`app-prs-known-en`). Each app was rendered as a client runs it (`appDocument`, 390 × 844) and a
sonnet rater, as that person, answered from the first-open screenshot only.

| | value on first open (1–5) | answer first | filled | looks finished (1–5) | would keep |
|---|---|---|---|---|---|
| the author's 0.0.99 app | 1 | no | no | 2 | no |
| 0.1.1 (D410 kit), 12 apps | 3.67 | 12/12 | 8/8 where known | 4.0 | 12/12 |
| D422 instructions, 12 apps | 3.75 | 12/12 | 8/8 where known | 3.75 | 10/12 |

- **The kit works for new apps.** With something known the value is 4–5 every time (the trip opens at
  ¥1,698 with both bookings; the four PRs open with who each waits on). The author's complaint is the
  stranded old app, not D410's generator.
- **Empty apps are the weak spot**, before and after: nothing known → value 1–3 ("Empty zero total,
  nothing useful until I type"). D422's instruction (the add form folded last, one empty line for the
  whole app) moved `app-make-zh` 2 → 3 and folded the baby app's adding behind 记一笔
  (`gen/gen-after-r1-app-baby-zh.png`), but the generic spending app still opened with a form and two
  empty boxes in one run. Owed (`todo.md`): an empty app that answers first needs something to answer
  with (the month so far from Done for you's payments, a first sample the person confirms).
- **What the rater still flagged:** the bare 删 / × on every row (now told not to), no "time since the
  last feed" (the sum's next line, now asked for), rows cramped with titles and sub lines run together
  with " · " (now told: each fact its own element).
- **No measurable gain** on the 12 new apps from the instruction changes (3.67 → 3.75 is noise at
  n = 12). The gains of D422 are elsewhere: the old app's way up, the marks, the state, the words.

**The author's own app, given the new look** (VERIFIED, `app-renew-zh`, haiku, in the second full
eval): from the old grey form and the booking in the conversation, one call rewrote the same app with
the kit: 「这趟合计 ¥1,698」 on top, the train and both hotel nights in it, 记一笔 folded last
(`after-renewed-oldapp-haiku-390.png`). The judge failed it only because its items carry no `from`.

**Two full evals** (D175, haiku): `2026-11-20-haiku-d422-run1.md` 176/222 and `-run2.md` 173/223,
against D414–D417's 173/220 and 170/220. Apps: run 1 8/11, run 2 8/12. Failing in both: `app-generic-en`
(its line lists features) and `app-prs-known-en` (the four PRs drawn into the file, never put into
`data`, both runs); `app-trip-known-zh` named 出差花销 once; `app-baby-zh` once two lines; `app-renew-zh`
no `from` (run 2 only, its first run).

## 3. Marks: the rubric (AGENTS.md) and the test

Candidates, each mapped to what an app tile must carry (which app at a glance, among up to 40):

| Candidate | False implications | Legible without the label | Fidelity | Scale | Feasible |
|---|---|---|---|---|---|
| A. No mark (name alone, or the headline number as the face) | every app is "a document"; a number without a unit reads as a badge | low (names wrap, numbers mean nothing alone) | n/a | fine | free |
| B. A letter pebble (D314's for unknown things) | a brand or a contact | low | none | poor past 10 | free |
| C. D410's six marks, the partner's pick | a habit = a checkbox = a to-do; coins = any app about money | 2.3/12 below | coarse | poor (six for forty) | built |
| D. **A kit set of drawn marks by meaning, pressed into the clay** | a suitcase may read as "work" | **12/12** below | good where the set covers it | 28 now, grows | instant, offline, both clients, no cost |
| E. A sculpted clay object per app, generated by an image harness | a toy (good), but each is one-off: two apps of one kind differ | high | best | fine | 83–89 s, 19K–44K tokens of the person's Codex, a cut-out step, ~1.8 MB raw; only where Codex or Antigravity is signed in |
| F. A thumbnail of the app itself | the app's state frozen at one moment | low at 52 pt | literal | poor | a render per change |

**The test** (`icons-test.ts`, haiku, 3 runs): twelve apps' tiles in a shuffled grid, the twelve names
listed; match each name to a tile. D422's marks: **12/12, 12/12, 12/12**. D410's six (the partner's
best pick per app): **3, 1, 3 of 12** (shared marks cap it; the point is that they don't say which app).

**The image trial** (VERIFIED, `codex exec` with the image tool, the Claude Code coin as the style
reference, two asks): both came back in the clay of the agents' coins, on the asked ground, no text
(`icon-trial-codex-trip.png`: a suitcase with the Temple of Heaven and a coin; `-habit.png`: a flame).
Beautiful, and 85 seconds, on the person's subscription, a 1254 px RGB file with no transparency (a
cut-out like `design/art/assets/tools/cut.swift` before it can sit on a tile).

**Chosen: D.** The cheapest reliable path is drawn marks chosen by meaning, the same table on the web
and the Mac (`fixtures/app-glyphs.json`), the partner's pick, else the app's own words (出差花销 → a
suitcase, before coins: a trip before its spending), so every old app gets a real mark at once. E is
the upgrade, owed: made once in the background after an app is kept, only where an image harness is
signed in, the drawn mark until it lands and if it fails (`todo.md`).

## 4. State: one truth each

An app's state is worked out by the home on every list, never stored: **kept current** from the
Ongoing card of the task that keeps it (running; resting with its next time; paused; its last round
failed, with why), **being changed** from the person's words about it with no answer yet (cleared by
the partner's next message, at most 10 minutes), **broke** from the page's own error on that version
(kept until the next version), **the old look** from the file failing the kit's lint. Tile and window
say the most urgent one in the partner's voice, with the one button that fixes it: 让 Ducter 修好它,
换成新样子 (both said as the person's words about that app, so the partner gets them with its id),
现在再试一次 and 恢复 (the Ongoing card's own actions).

## 5. Words

- 「不联网；它要问的都经过 Ducter。」 → 「只有你看得到，每台设备上都一样。」 (what a person wants to know:
  who sees it, and that it is the same everywhere). The sandbox stays in `docs/apps.md`.
- New lines: 「Ducter 正在弄你说的…」, 「它打开时出了点问题」 + 「让 Ducter 修好它」, 「它还是旧样子」 +
  「换成新样子」, 「「{task}」正在更新它」, 「「{task}」明天 9:00 会再更新它」, 「「{task}」上一轮没更新成」 +
  「现在再试一次」, 「「{task}」暂停了，先不会更新它」 + 「恢复」; the 「自动更新」 pill is gone (its dot was
  a dotted pill).

## 6. Design reviews used

`kill-ai-slop` (the code scan found no tell in the apps' sources; the slop was in what they draw:
dotted pills in `k-from` and the first-open line, a placeholder mark, a meaningless 「自动更新」 pill);
`impeccable` critique (an independent design review from the shots, Nielsen 25/40: the summary line
is the product but was styled as a subtitle, meaningless mark tiles, per-row 删, the footer's system
talk; its detector ran degraded, regex only, and found nothing in the demo files); `design-taste-
frontend` (a marketing-site skill; only its tap-size and one-button-system rules apply here);
`ios-design-review` (no daemon for a web page: its rubric applied to the iPhone 17 Pro Simulator in
Safari: no emoji, every target ≥ 44 pt, no blank states).

## Implications for Ducter

1. Look again at what already exists: a better kit helps nobody whose app predates it. Every app the
   home can see is checked, and its tile offers the way up.
2. A tile shows the app's own answer, big, and one state line; time only when nothing else matters.
3. Marks by meaning from a drawn set beat a generic mark 12/12 to ~2/12; generated clay objects are a
   later delight, not a dependency.
4. State has one source each (Ongoing, the conversation, the page, the file), never a second copy.
5. Empty apps are where value on first open is still low; the next lever is giving them something
   true to show.

**Summary.** The author's app was the 0.0.99 one, stranded: D410's kit only reached new apps. New apps
on 0.1.1 already open filled and answer first (value 4–5 when something is known; LLM raters, n = 12).
D422: every app gets a drawn mark by meaning (raters matched 12/12 vs ~2/12), one state line from one
truth each with the one fix, a way up for old apps, a clay floor under any control an app forgot, and
plain words in the foot. Owed: empty apps that still open empty, generated clay marks, people as raters.
