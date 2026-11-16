# 109 · The real Mac app, walked (v0.0.64)

**Date:** 2026-11-17. **Build:** v0.0.64 (`f3bdc311`) from source with `scripts/make-app.sh`,
ad-hoc signed, bundle id `co.nowledge.ducter.livewalk` (so its dev.env, logs, LaunchAgent label
and microphone permission are its own), into the session scratchpad. Never installed into
/Applications; the person's installed Ducter (and its `:7777` core) kept running untouched.

**How it was isolated.** The app was opened with `open -n --env …`: `HOME` set to a scratch
folder (so `~/Library/Application Support/Ducter/connection.json`, `imessage.json` and the app log
are scratch files), `DUCTER_URL=ws://127.0.0.1:7911/ws` (the app connects there and runs no
Ducter of its own: no supervisor, no LaunchAgent, no `followCLI`), `DUCTER_DATA_DIR` scratch,
`DUCTER_IMESSAGE=off`, `DUCTER_UPDATE_FEED` pointed at a dead address, `DUCTER_LOCALE=zh`. The
core was the demo (`apps/web/demo.ts`, port 7911, `DEMO_LANG=zh DEMO_PAST=1 DEMO_DID=1 DEMO_RICH=1
DEMO_RECALL=1 DEMO_MEM=cloud`) on a fresh data folder.

**How it was driven.** `cua-driver` 0.44 (`run_script`, one session): window captures only
(`get_window_state … screenshot_out_file`), clicks as foreground pixel clicks (background
CGEvent clicks don't reach MyGo's window; background wheel scrolls do). Shots in `.shots/live-mac/`
(1366×918, the window's 1280×860 points scaled), compared with the test renderer's
`.shots/d289…d307`.

## Verified on the real app

| What | Result | Shot |
|---|---|---|
| The title moment on first launch | Plays, "按任意键开始", dismissed by a key | `00-title-zh.png` |
| Conversation: rich table, line chart, checklist | Same layout, type and spacing as the test renderer at 1280 (`d303/mac-wide-zh-light`) | `02-…table`, `03-…chart`, `02-…checklist` |
| 想起了 lines (D304) | 「想起了你 11 月 14 日说的 ›」 and 「想起了 11 月 16 日 Claude Code 记下的 ›」 under their replies; the week's learned offer under 早。 | `01-conversation-zh-light.png` |
| On hand at 1280 (project column, day column, calls, decisions) | Renders; one clipping bug, below | `04-onhand-zh-light.png` |
| Opening a task | Instant: the first frame captured after the click (≈150 ms) is the opened task, fully laid out. The locator glide could not be seen: the capture rate (one frame per ≈120 ms) is slower than the motion | `05-task-open-instant.png` |
| The context ring card (D302) | Opens over the composer; "刚压缩过，下一步就知道有多满 · 压缩过 1 次 · 现在压缩 · Claude Code 不提供额度信息" | `07-context-ring-zh-light.png` |
| Past tasks and 也在这台电脑上 (D285, D299) | Marked, by month, and the four sessions from this computer with 接着做 on hover | `08-past…`, `09-past-outside…` |
| Done for you (D300) | Day summary chips, filters, 改回去 / 打开任务 | `10-did-zh-light.png` |
| Devices (D307) | Matches `d307/mac-devices-1280-light-zh` (island higher in the shorter window) | `11-devices-zh-light.png` |
| Every Settings pane | 伙伴, 记忆, 连上的 AI agent, 通知, 账号, 聊天软件, 自动填充, 外观和声音 (with 声音 and 语音), 在哪儿运行, 更新和关于 | `12-settings-01…10` |
| Dark through Settings › 外观和声音 › 深色 and back to 跟随系统 (D302) | The whole window and its title bar switch at once; conversation, On hand, task, Devices and About in dark read well; no hard-coded light surfaces seen. macOS's own appearance was never touched | `13-look-dark-zh`, `14…18-*-dark-zh` |
| Accessibility | The window exposes a real tree (buttons, tabs, radio groups, the Settings rows by name) | (cua-driver read) |
| Voice first use (D305) | Pressing the mic shows Ducter's own card first: 「用说的，不用打字 · 只在你按住的时候听，松开就停。· 转成文字是在这台设备上做的，声音不离开它。」 with 先不用 / 用麦克风 | `19-voice-first-use-card-zh.png` |
| The real microphone prompt | 用麦克风 → macOS's own alert: "“Ducter” would like to access the microphone." with the Info.plist text, Help, Don't Allow, Allow. So an ad-hoc build without the hardened runtime does reach TCC with its usage description (the notarized build adds the `audio-input` entitlement; not checked here). Escape did **not** dismiss it, and quitting the app did not either; it was left for the person, neither allowed nor denied | `21-macos-mic-prompt.png` |

## Differences the test renderer hid

1. **On hand's last line ran out of the window (fixed).** At 1280 with the project column and
   the day column, 做过的事 › 替你做过的 › 一直在跑的 sat as a third column top right and was cut
   at the window's edge (`04-onhand-zh-light.png`). Since D287 put the day beside the board,
   `pastEndLine` had been the board row's third child, not the list's last line as D285/D300
   say. The test renderer's shots had no day column or no lens, so it fit. Fixed: it is the last
   line under the list (`22-onhand-fixed-*.png`), with a test at 1100/1280/1400/1700.
2. **The permission prompts are English on a Chinese Mac (fixed).** The bundle declared
   `CFBundleLocalizations` en + zh-Hans but carried no `zh-Hans.lproj/InfoPlist.strings`, so
   the microphone and speech prompts could only be English. The iPhone app has them. Fixed in
   `make-app.sh` with a test that every usage description has both lines. Not seen live: this
   Mac's first language is English, which correctly showed the English text.
3. **"Mac.lan" in the UI (fixed by D310).** The home's name falls back to
   `os.hostname()` with only `.local` stripped. On a network whose DHCP domain is `.lan` the
   person reads 「在 Mac.lan 上」 (Done for you), 「Mac.lan 上的 Claude Code」 (About) and
   「用 USB 线把安卓手机接到 Mac.lan 上」 (Accounts). Sixteen TypeScript sites and the Go app's
   `remote.DeviceName` share the rule, and names are compared across devices and stored, so this
   is not a one-line fix. Recommendation: one helper that drops any DNS domain (or, on macOS,
   uses the Computer Name), recorded as a Dn, with a migration note for names already saved.
4. **Two "今天做完" counts disagree (fixed by D310: one rule).** The conversation header said 今天做完 26 件 while
   On hand's sentence, strip and the tray said 32. The header (`doneToday`) leaves out failed
   tasks and anything not finished today; On hand's strip counts the whole done lane plus
   today's missed waits. Same words, different numbers, side by side: one rule should win.
5. **The menu bar item (D306) is there but hidden here.** The status item exists (a 34×24
   window on the status layer, and an `AXMenuBarItem` whose help is the On hand sentence), but
   this Mac runs Dozer, which pushes it off screen, exactly as it does the installed Ducter's.
   So its menu could not be opened or shot; not an unbundled-app problem. Two small things seen
   in its accessibility: the item has a help text but no title (VoiceOver reads only the help),
   and the help text has doubled spaces around the time (「最早  7:02  回来」). Both fixed by D310.
6. **Demo-only artefacts, not product bugs:** the call card's outcome reads the raw word
   `booked` (the demo seeds an enum where Tuwa gives a sentence); the demo's seeded 早。 note
   and the proactive engine's own morning note both land when the demo starts after the quiet
   hours; a demo data folder reused across runs doubles every seeded task's transcript (start
   each run on a fresh folder).

## Couldn't check

- **The listening strip and the denied card:** they need the microphone granted or refused,
  and the prompt was left unanswered as asked. Hold Right Option could not be sent either:
  `cua-driver` presses and releases keys, it can't hold one.
- **The locator glide and other motion:** captures are ≈120 ms apart; only the end states.
- **The tray menu:** hidden by Dozer (above).
- **The notarized build's behaviour** (hardened runtime, entitlements): this was ad-hoc.
- **English:** walked in zh only.

## Implications for Ducter

- The test renderer is right about drawing (fonts, spacing, dark tokens all matched); what it
  misses is *data shape*: real windows have every column at once. Shot tests for On hand should
  include the busiest board at 1280.
- Ship what the OS shows in both languages: Info.plist strings belong with the i18n keys.
- Decide the home's display name (item 3) and one meaning of 今天做完 (item 4).

**Summary:** the real v0.0.64 Mac app matched the test renderer on every surface walked, light
and dark, with a working accessibility tree and a real microphone prompt. Two bugs fixed (On
hand's last line clipped at 1280; English-only permission prompts), two open for a decision
(the `.lan` home name, the two done-today counts), and the tray menu, the listening strip and
motion could not be checked here.
