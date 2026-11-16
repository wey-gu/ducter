# 85. The app's shell: one bar for every place, and a launch that doesn't switch

The author (2026-11-16, Mac app): "我们整体 UI flow ux 你综合看了么，比如 on hands, devices 内部，右上角没有按钮，而且，新建按钮样式也不统一（我们是否组件花了？有 design.md 之类的规则在维护）设置更新等入口不在 ui 上，mobile UI 和 app 是否仔细对照过？每次打开 app 加载前的状态（语言等信息都有一个切换的过程）都是变一下". And: "我们设置原来是点击头像 … hover 头像的设计是经过仔细设计的么？"

Method: every top-level place and its first pages pictured against the same seeded demo core
(`apps/web/demo.ts`, zh and en): the Mac through the headless tester (`TestShellShots`, 1280×820
and 900×700), the web through headless Chrome with device emulation (390×844, 768×1024,
1024×768, 1400×900; light and dark). Shots before the change in `.shots/shell/base/`, after in
`.shots/shell/mac/` and `.shots/shell/web/`; launch frames in `.shots/shell/launch/`. All of
`.shots/` is outside git (D75).

## 1. What each bar had (before)

| Place | Mac: left · right | Web phone (390): left · right | Web wide (1400) | Tag |
|---|---|---|---|---|
| Conversation | partner (face, name, counts) · **设备** (clay, glyph) **手头的事** (clay) | partner · **手头的事** (clay) | partner · nothing (On hand is the side pane, its bar: level, a bare ＋, full-screen icon) | VERIFIED `base/mac-conversation-zh.png`, `base/p390-conv-zh.png`, `base/w1400-conv-zh.png` |
| On hand | crumbs · **新建** as a plain text button | ‹ 回到对话 · a bare ＋ icon and a 40pt face that does nothing | full screen: crumbs · **新建** text, full-screen icon | VERIFIED `base/mac-onhand-zh.png`, `base/p390-onhand-zh.png`, `base/w1400-onhandfull-zh.png` |
| Opened task | crumbs · branch (text), 工作台 (text) | ‹ 回到对话 · branch and workbench as bare icons | crumbs · the same, full-screen icon | VERIFIED `base/mac-task-zh.png`, `base/p390-task-zh.png` |
| 你的设备 | crumbs · **nothing** | (a Settings page) | (a Settings page) | VERIFIED `base/mac-devices-zh.png` |
| Settings | crumbs · **nothing** | sheet: a list, 关闭 | centered sheet | VERIFIED `base/mac-settings-about-zh.png`, `base/p390-settings-zh.png` |

Findings:
1. **One level in, the way out disappears** (VERIFIED). From On hand, Devices, Settings or a task
   the only way to another place was the crumb back to the conversation, or a shortcut.
2. **The same kind of action looked three ways** (VERIFIED): New task was a clay-less text button
   on the Mac, a bare ＋ glyph on the phone and the side pane, a text button at the web's full
   screen; the places were clay buttons only on the conversation. `design/ui.md` "Chrome" said
   "small secondary buttons" on the right; the code had drifted (D128's "quiet text button" was
   kept for 新建 while the bar's other buttons became clay in D76). The components did not
   multiply (one `button`/`navButton` family on the Mac, `Btn` on the web, D161's test guards
   cards): the drift was in which kind each bar picked, which no rule said.
3. **Settings had no visible way in** (VERIFIED). Mac: ⌘, the app menu, or clicking the partner's
   face and name (unlabelled). Phone: tapping the partner. A person who never clicks a face
   doesn't find it (INFERRED from the author's report; no user study).
4. **Updates were found by hunting** (VERIFIED): 全部更新 sat on Settings › 关于 (Mac) or 你的设备
   (web), said only on the Settings list's row; "已更新到 0.0.56" sat inside a device card.
5. **The partner's hover** (VERIFIED in code, `conversation.go`, `presence.go`): pointing tints
   the face-and-name block (the crumbs' quiet tint). The face does **not** change for the pointer:
   the "sitting on a bench" pose the author saw is `theme.Waiting` (D112: something it waits for),
   the presence at that moment, not a hover state. So the hover is deliberate but says nothing
   about where the click goes.
6. **The phone's inner bar** carried a 40pt face that is not a button (VERIFIED), and its back
   crumb "Back to the conversation" wraps to two lines in English at 390 (VERIFIED
   `web/p390-onhand-en-dark.png` before the fix).

## 2. The launch flash

Mac (VERIFIED in code and with `TestLaunchHasNoVisibleSwitch` written against the old code path):
- **Language:** `main.go` starts in the system's language; `followUserLanguage` switches to the
  person's once the conversation arrives (an English macOS with a Chinese person: the bar's words
  flip after the welcome). Nothing remembered the followed language.
- **Name and counts:** the partner's name is empty until the welcome, and the counts line says
  连接中… for the few milliseconds the local home takes, then the counts.
- **The entrance replays:** the page column was keyed by `Welcomed`, so the welcome rebuilt it and
  played the 6pt rise and fade a second time.
- **The name moves:** an empty counts line collapsed, so the name re-centred when it filled.

Web (VERIFIED by frame-by-frame capture, `launch/launch1-en-browser-frames.json`, an English
browser and a Chinese conversation): frame 1 painted "Ducter · Connecting… · On hand" in English,
frame 2 Chinese. A kept screen (D209) restored the conversation but did not follow its language
before the first paint; the followed language was never saved.

## 3. Mac and phone, place by place

| Place | Same | Different, and kept | Different, fixed |
|---|---|---|---|
| Conversation | partner, counts, places | wide web drops 手头的事 (the pane is beside it, D176) | Settings now visible on both |
| On hand | the one list (D216) | — | 新建 one clay bar button on both |
| Task | crumbs, the working copy and workbench toggles | the phone shows icons, the Mac words (room) | the phone's inner bar ends in Settings, not a dead face |
| Devices | the card and stage | a place on the Mac, a Settings page on the phone | — |
| Settings | the sections (D150) | a rail on the Mac, a pushed list on the phone | — |
| Dark | — | the Mac has no dark theme yet (todo: Midnight / Pebble dark) | — |

## Implications for Ducter

- One bar anatomy for every place: where you are; this place's own actions; a hairline; the way
  to the other places (更新 when something waits, 设备 · 手头的事 · 设置), the place shown pressed in.
  One per screen. Built as `placeBar`/`placeNav` (Mac) and `Places`/`NavBtn` (web).
- Four button kinds with fixed homes: primary (a card's one decision, never in a bar), secondary
  (every bar button), accent (send, equip), quiet text (crumbs, toggles at rest, Reply…, Details).
- Settings is a visible word (a gear where room is short); the partner's face stays a second way
  in, now saying where it goes.
- The first frame is the settled one: remember the followed language and the name, keep the
  counts line's height, never re-key the page on welcome, and on a first open with nothing kept
  show only the calm ground until the home answers.

Summary: the bars had no rule for their right side, so each place picked its own; one anatomy and
a four-kind button table in `design/ui.md` (D262) now say it, and both clients draw it from one
component each. The launch's switch came from four small causes on the Mac and one on the web, all
fixed and checked frame by frame. Not yet checked on the iOS Simulator or Android.
