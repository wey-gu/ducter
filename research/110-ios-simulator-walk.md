# 110: The phone app walked in the iOS Simulator (v0.0.64)

The iPhone app (`apps/ios`, Debug, unsigned simulator build of `main` at `f3bdc311`) paired to a demo
core and walked screen by screen in the real iOS 26.3 Simulator, because desktop WebKit and
Chromium shots miss what only iOS does (emoji rendering, safe areas, the system's own prompts).
Screens are in `.shots/live-ios/` (not in git, D75); names are cited below.

## Setup

- **Core:** `DUCTER_PORT=7912 DEMO_LANG=zh DEMO_PAST=1 DEMO_DID=1 DEMO_RICH=1 DEMO_RECALL=1 bun apps/web/demo.ts`
  with a scratch `DUCTER_DATA_DIR`. Nothing touched `~/.ducter`.
- **Pairing, for real:** `ducter pair --json` against the scratch data dir (`DUCTER_PORT=7912`) gives
  `http://127.0.0.1:7912/pair#c=…&k=…`; `xcrun simctl launch <udid> co.nowledge.ducter.ios -pairLink '<link>'`
  pairs the app as a device (it shows as "iPhone 2 · 现在连着" under Devices). The Simulator reaches
  the host's loopback, so Devices says **就在这台电脑上 · 不经过网络** for it, which is true here and
  never for a real phone. VERIFIED.
- **Routes:** the Debug launch argument `-open 'app#onhand'` (also `#task=<id>`, `#settings=<page>`)
  starts on a place; everything else was tapped.
- **Taps and drags:** `simctl` has no input, so the Simulator window was driven with cua-driver
  (`run_script` with window-pixel clicks and drags). A drag in the Simulator is a touch pan, so
  scrolling and the edge swipe are real gestures; the mouse wheel did nothing.
- **Devices:** iPhone 17 (402 × 874 pt) for everything, iPad Pro 11-inch (M5) for the main views.
  Simulator appearance switched with `xcrun simctl ui <udid> appearance dark|light`.

## What was verified (VERIFIED, iOS 26.3 Simulator)

| Surface | Result | Shots |
|---|---|---|
| Pairing by link | Pairs, opens the conversation, the device appears in Devices | `00-launch`, `41-device-this-phone` |
| Conversation, rich | Table, line chart with labels, checklist with 报一下进度, choices (ducter / hawdb / foo), 想起了 line, the week's what-it-learned note, 替你做过的 link | `02-conv-up1…6` |
| Pictures | Photo Library → four picked → tray with remove marks → sent as a 2 × 2 grid → viewer (4 / 4, 保存 / 分享 / 拷贝) | `73-attach`, `74-picker`, `75-composer-pics`, `76-sent-pics`, `77-viewer` |
| On hand | Partner head sentence, counts strip, lens chips, decision cards, the folds, links to 一直在跑的 / 做过的事 / 替你做过的, routines | `10-onhand`, `16-onhand-bottom` |
| Opened task | Waiting (OAR) and done (flaky test) heads, result, 开草稿 PR / 合进 main, the brief, the worked line | `11-task`, `13-task-flaky` |
| Edge swipe back | A drag from the screen's left edge goes back from the task to On hand | `12-after-edgeswipe` |
| Past tasks | Starred group, tags, +/− counts, 接着做, tabs with the Ongoing count | `60-past` |
| Done for you | Day summary, per-kind cards, 改回去 with its deadline | `50-did` |
| Devices | List with states, update card, this phone's card and how it is connected | `40-devices`, `41-device-this-phone` |
| Settings | All ten pages (list, partner, memory, peers, notify, accounts, chats, autofill, devices, phone), light and dark via This phone's own setting | `30-settings-*-light`, `32-settings-*-dark` |
| Dark by the system | 跟随系统 + Simulator dark: conversation, On hand, task all follow | `03-conv-sysdark`, `14-onhand-sysdark`, `15-task-sysdark` |
| Voice | Tap on the mic shows the in-app permission card; 用麦克风 raises the iOS prompt (its English text because the Simulator's language is English; `zh-Hans.lproj/InfoPlist.strings` has the Chinese one); Don't Allow gives **Ducter 现在不能用麦克风。 / 去设置里打开** | `70-voice-tap`, `71-voice-ios-prompt`, `72-voice-denied` |
| D306 glance specimen | `-glanceSpecimen YES`: all six phases, zh and en, light and dark | `80-glance-*` |
| iPad | Conversation centred, On hand, task, Devices sheet | `90-ipad-conv`, `91-ipad-*` |

**Emoji:** none anywhere. The marks seen (✓ for done, ★ for starred, the remove ×, arrows in the
version line `2.1.325 → 2.1.326`) render as drawn glyphs or text-only code points; `check-glyphs`
passes. **Safe areas:** the header clears the Dynamic Island, the composer clears the home
indicator, sheets and the photo picker sit correctly. **Chinese/English spacing:** autospace holds
everywhere seen ("Claude Code 记下的", "在 MacBook 上"). **Joins:** the one " · " seen
(`cargo test · 连跑 50 遍全过`) is inside a check's own label, not a UI join.

## Issues found

### Fixed (branch `ios-sim-walk-110`)

1. **Sentences were balanced, against D78 and the file's own comments.** D287 changed
   `text-wrap: pretty` to `balance` on four rules that its decision never mentions: the partner's
   bubble, a decision's question with the task headline, `.hello p`, `.mem-hero p`. The comments
   beside them still say "fills the measure, never balanced". On the phone this gives short ragged
   lines inside a wide bubble ("周四最慢，26 分钟多，是那天加了 / 集成测试…") and split the task
   headline as "…完成的信 / 号，不再写死 200ms。" (`13-task-flaky` → `after-13-task-flaky`). Restored
   `pretty`; the D287 head sentence keeps its intended `balance`. *Tradeoff:* WebKit's `pretty` still
   breaks between any two hanzi (normal Chinese setting), so a line can end "加了集 / 成测试"
   (`after-02-conv-up2`); `balance` happened to break at a clause there. Neither knows Chinese words;
   `pretty` uses the width, which is what D78 asks for. The author may prefer to revisit.
2. **The peers card's coins overflowed into the text.** `.g-tile img { width: 40px }` sized each
   24-pt coin inside the coins tile to 40, so the two coins ran into "已连上"
   (`30-settings-peers-light` → `after-30-settings-peers`). Coins in a tile now keep their own size.
3. **The sheets' close mark was 34 pt** (做过的事, 替你做过的, the recall sheets). A 44-pt hit area
   around it (`::after`, no visual change).
4. **The header's places were 32 × 28 pt.** A hit area 44 pt tall (`::after`, inset −8 px top and
   bottom); they stay 34 pt wide because they sit side by side.

Guarded by `apps/web/test/phone-fit.test.ts` (7 tests; all 7 fail on `main`).

### Open (not fixed; small, or a design call)

- **Under 44 pt, by a 402-pt Chromium audit of the same stylesheet:** header name and summary
  buttons (20 and 19 tall), the 想起了 line (24), 换谁来做 (19), the worked line (30), On hand's count
  cells (28), lens chips and small text buttons (36). Most are text links; widening the places
  (34 wide) is a change to D264's segmented control.
- **Done for you:** a card with only 打开任务 on its last row leaves an empty band above it (`50-did`).
- **Voice permission card** stacks over the notification offer, whose top edge peeks out above it
  (`70-voice-tap`).
- **This phone's device card** shows two back links, "‹ 设置" and "‹ 你的设备" (`41-device-this-phone`).
- **Routine titles** cut with an ellipsis at 402 pt ("每天早上看一眼 hawdb 的 C…", `16-onhand-bottom`).
- **The picture viewer's** cream scrim leaves the conversation faintly visible behind the picture
  (`--viewer-scrim`, by design as far as the code says; noted only).

## Not checked

- **The context ring and its card** (D288): the demo seeds no context readings, so no task shows
  the ring. **The locator** (D284) needs a long transcript (the `t_loop` demo), not in these flags.
- **Hold-to-talk with the microphone granted** (the walk never grants it), and speech itself.
- **The Live Activity on the Lock Screen** from a real push; only the in-app specimen.
- **iPad in Split View or Stage Manager**, and English on the phone (the demo ran in zh).
- **Swipe down to close** the viewer; the × was used.

## Implications for Ducter

- The iOS Simulator walk is cheap once set up: `ducter pair --json` on a scratch data dir pairs
  the real app, `-open` reaches every route, and cua-driver drags make real touch gestures. It
  should run before any phone-facing release, as the memory rule says.
- A mechanical replace across `app.css` can silently undo a decision recorded only in a comment;
  rules that carry a decision want a test (as `phone-fit.test.ts` now does for D78's wrapping).
- Tap targets on the phone are mostly text links under 44 pt; a pass over them is a small design
  task, not a bug fix.

**Summary:** the phone app pairs, renders and moves correctly in the iOS Simulator on v0.0.64
with no emoji, safe-area or dark-mode faults. Four stylesheet bugs fixed (sentence wrapping
regressed by D287, the peers coins, two small hit areas); six cosmetic issues and several
under-44-pt text links left for the author.
