# 78. Lody: its phone screen, its iOS client, and its Conductor-like layout

Source: `LodyAI/Lody`, cloned `--depth 1` at commit `66c8b96264484f66c6492ebc2933dd869d2b4741`
(2026-11-13), read only; nothing was built or run. The repository root is Apache-2.0; the iOS
client (`apps/mobile/ios`) is AGPL-3.0-only (derived from Innei's `lody-ios`). The pictures cited
are the repository's own (`site-docs/public/_docs-assets/`). Paths below are inside the clone.
Tags: VERIFIED (read in code, or seen in an image in the repo), DOCUMENTED (the repo's own docs
or specs say so), INFERRED (my reading).

The question came from the author: Lody's iOS "phone use" screen looks very good. Is Ducter's
On hand still one column when it should be laid out like Conductor?

## 1. What Lody's phone screen is

**It is a device preview, not an agent using a phone.** (VERIFIED) The screen the author saw is
Lody's *iOS Simulator / Android Emulator preview*. It shows a simulator or emulator running on the
session's Mac, streamed live to the iPhone, iPad or desktop, and the person can touch it.

- The agent's only tool is `lody_ios_simulator_preview` (and an Android twin), with
  `action: list | start | status | stop` (`apps/cli/src/mcp/ios-simulator-tool.ts`). Its
  description: "does not build or install apps … the stream connects when the user opens the iOS
  Simulator panel … Each simulator can be controlled by only one session". The agent never taps
  through Lody, so Lody has no tap overlay, no step line, no approval at a tap and no "take over",
  because the person is always the one driving. (VERIFIED) How the agent drives the app it builds
  (XcodeBuildMCP or its own tools) is outside Lody. (INFERRED)
- **Underneath:** on Apple Silicon Macs with macOS 15+ and Xcode, a pinned, Lody-patched build of
  **Baguette** (`tddworks/baguette`, Apache-2.0, `baguette serve`) handles HID input and the
  frames. Lody patched three `Task.sleep` calls because upstream crashes at the first 30-second
  WebSocket ping (`apps/cli/src/ios-simulator/README.md`, `baguette-manifest.json`). `xcrun`
  handles the pasteboard, appearance, shake and deep links. Frames are H.264 (AVCC) with an MJPEG
  fallback. They travel over a Cloudflare Quick Tunnel, then over **WebRTC DataChannels** (two
  ordered, reliable channels: media in 16 KiB chunks, and controls). The iOS side uses
  libdatachannel, and a WebSocket is the fallback. Input crosses with one or two fingers (pinch,
  rotate, pan). Android uses the same gateway, transport and viewer, H.264 only, with three
  quality tiers: Saver, Balanced and Clear
  (`apps/mobile/ios/packages/LodyKit/Sources/LodyKit/SimulatorStream/README.md`). (DOCUMENTED,
  consistent with the code read)

### 1.1 The iOS presentation (VERIFIED, `LodyKit/SimulatorStream/*`, `Sessions/SimulatorController.swift`)

The screen exists in three forms, all fed by one stream object (`SimulatorStreamView.shared`,
keyed by `platform:session:operation`):

1. **The chip.** A Liquid Glass capsule in the conversation's action bar above the composer. It
   shows an `iphone` glyph and the device name, plus a busy spinner while the device starts. Its
   menu holds **Stop**. The chip appears only when the agent asked for a preview or one is running
   (`Sessions/SessionController+Tools.swift`, `docs/rules/composer.md`).
2. **The floating preview** (`SimulatorPreview.swift`), a picture-in-picture over the transcript:
   - Size: 116–144 pt wide and at most 268 pt tall. The screen sits in a content view (corner 12,
     continuous curve) below a 44 pt strip with two buttons, expand (`arrow.up.left.and.arrow.down.right`)
     and close (`xmark`), 12 pt glyphs with a halo of the page colour. It is inset 12 pt from the
     available area, with a shadow at 0.22 opacity, radius 16, offset y 8, drawn on the device's
     own outline.
   - It starts in the top-right corner. It can be dragged anywhere and snaps to the nearer side
     edge (0.2 s). It hides itself when there is less than 116 × 132 of room.
   - **Entrance:** from 0.86 scale and alpha 0, a 0.36 s spring with damping 0.86. With Reduce
     Motion, a fade only.
   - **Close:** the chrome fades in 0.12 s. The device then flies along a two-keyframe curve
     (0.3 s, cubic) into the **chip**, shrinking to 0.6 and then 0.3 scale and fading over the
     last 27%. The chip then bumps to 1.08 and springs back (damping 0.6). The preview "goes back
     into" the thing that can bring it out again.
   - **Stop ("power off"):** a dark blackout fades over the screen in 0.15 s, then the whole
     preview shrinks to 0.92 and fades in 0.18 s, with a soft haptic.
   - A tap on the screen, or expand, opens the full page.
3. **The full page** (`SimulatorController` hosting `LodySimulatorView`), pushed with UIKit's
   **zoom transition**. The full screen grows out of the floating preview's exact rectangle, and
   swiping down zooms it back. The interactive dismiss is refused when the swipe starts on the
   device, so swipes there stay input to the phone. When the page is left, the same live
   renderer is handed back to the floating preview: one decoder, no reconnect. A snapshot stand-in
   covers the landing.
   - **The device is drawn as the real hardware.** The page fetches `exterior.json` and
     `bezel.png` from the Mac: Xcode's DeviceKit artwork for that exact simulator. Its hardware
     buttons (home, lock, volume, action) become real tappable buttons of at least 44 pt. Without
     the art, the screen is shown alone. The code says "a drawn body would misstate the real
     hardware". Android screens are a plain rounded rectangle (radius 5% of the short side) that
     reshapes when the emulator rotates (`SimulatorDeviceView.swift`).
   - **Bar:** the device name as the title. For iOS: **Home** and **More**. More holds three
     groups: App switcher and Lock; rotate left, rotate right and Shake; Volume up/down and Action
     button. Then **Choose another** and a destructive **Stop**. For Android: Back, Home and More,
     with Recents, rotation, Appearance (Light/Dark), **Paste text** (an alert with a field, typed
     into the focused field) and Quality.
   - **States** are a system `UIContentUnavailableView` in words: preparing/booting → "Starting",
     then "Connecting", "Ready", "Failed" and "Closed" (`SessionSimulator.swift`). The poll runs
     every second, for at most 180 s.
   - **Picking a device** is a grouped list sheet: Booted, Shut down, Unavailable. Each row shows
     the device glyph (iPhone/iPad), its name and runtime, and on the right "Preview", "Boot",
     "In use" (held by another session) or the reason it is unavailable.
   - **Touch:** one finger, then a second as a native two-finger gesture. A press in the bottom 7%
     of the screen is tagged `edge: bottom`, so the home-indicator swipe works. Moves are
     coalesced per frame. The stream disconnects when the app goes to the background and
     reconnects when it returns.

**iPhone vs iPad:** the same three forms. On wide layouts the simulator deliberately keeps its own
zoom page instead of going into the side panel
(`docs/superpowers/specs/2026-10-17-wide-layout-design.md`, "Stay as today: `SimulatorScreen` (its
own `.zoom` PiP / full-screen transition)"). (DOCUMENTED) On the desktop it is a tab of the right
side panel, `ios-simulator` / `android-emulator`
(`packages/components/src/components/sessions/session-side-panel-tab-bar.tsx`). (VERIFIED)

**Why it feels good** (INFERRED): one object stays continuous across the three forms. It enters
from scale, flies back into its chip, zooms into full screen and back, and powers off like a
screen. It never blinks or reloads between forms, the real bezel gives it presence, and the whole
thing is native UIKit with no web views.

## 2. The iOS client overall

Native UIKit with SwiftUI in places, iOS 26+, Liquid Glass. LodyKit owns navigation. A hidden
WebView runs the Loro/Flock sync engine (`apps/mobile/ios/README.md`). (DOCUMENTED)

- **Home** (`docs/rules/home.md`): the system tab bar with Chats, Schedules, Settings and a
  separate create action. **Chats is grouped by status by default**: needs you / just finished /
  open PRs / running / idle, with idle folded after 20. Time and project grouping are the
  alternatives, and Pinned always comes first. Rows lead with the title. The trailing slot holds
  the status mark (alert, hand, a working grid, an unread dot) instead of the age. Team lists add
  the owner's avatar, and the "My tasks" scope is the default. Conversations opened from a
  conversation fold under it ("⌄ N opened chats"). Scrolling Chats by project shows a project
  icon index over the list. Swipe actions never commit on a full swipe. (DOCUMENTED)
- **Conversation** (`docs/rules/conversation.md`, `composer.md`): tool work folds into
  "Working for …" and then "Worked for … ›". A turn ends with an output card: a tasks row and a
  changed-files row that opens the files page; changes never expand inline. Above the composer
  sits **one row of glass capsules**:
  - the environment: the computer with its presence, the browser preview, the simulator and the
    emulator;
  - the context: the PR or branch, with the ±diff;
  - pinned at the right end: the repository action, a split button with Merge or Create PR.

  Colour is used for status only. **Tabs** (several conversations in one working folder) live in
  a glass overlay. Agents' permission prompts are answered in the conversation. (DOCUMENTED)
- **Layout by space, never by device** (`docs/superpowers/specs/2026-10-17-wide-layout-design.md`,
  `2026-10-28-duo-ipad-native-layout.md`, `docs/iphone-duo.md`, `Chrome/LodyHomeLayout.swift`):

  | Mode | When | Layout |
  |---|---|---|
  | Compact | compact width (phone, a narrow iPad window, a closed Duo) | the phone stack; details push |
  | Tall | regular width, taller than wide (iPad upright, Duo unfolded upright) | the conversation full width; the list slides over it; details open as a sheet (medium and large detents) |
  | Wide | regular width, wider than tall | **list \| conversation**; opening a detail (diff, files, PR, subtask) **hides the list: conversation \| detail**. The list is 320 pt preferred and a detail 45% |
  | Duo, half-open like a book | the hinge reports partially open | the same two panes, split exactly at the fold (`UIArrangementViewController`) |

  The rules: **at most two panes on iPad and on Duo**. Pages that *show* something go to the
  panel, pages that *ask for an action* are sheets, and Activity, tool details and message details
  are always sheets. Choosing another session closes the detail. Folding, rotating or resizing
  keeps the session, the draft, the detail's back stack and any open sheet. (DOCUMENTED)
- **Notifications:** push through OneSignal (or direct APNs when self-hosted). **Live Activities
  were removed**, and the rules say not to restore them (`docs/rules/push-notifications.md`).
  (DOCUMENTED)
- **Connection state** (`home.md`): there is no "Offline" in the workspace capsule. A small pill
  in the title shows a spinner while syncing and "Connecting" while the connection comes back,
  never "Offline". It then shows "Connected" for 1.2 s and goes. (DOCUMENTED)
- **Team:** workspaces, members, change owner, machines shared by their owner. Encrypted
  workspaces currently open only on the desktop. (DOCUMENTED)

## 3. The desktop layout (Electron): the Conductor-like part, in detail

The page is three panes and a dock, seen in `_docs-assets/lody-readme-hero.png`,
`20260716-new-ui.png` and `20260507-preview.png`. (VERIFIED) It is the Conductor shape:
**list | the work | its tools**.

### 3.1 The panes

| Pane | Width | What is in it | Source |
|---|---|---|---|
| Sidebar | 280 px by default, resizable 240–420. Hidden with ⌘B; the content width animates, and the sidebar stays mounted and inert | "Lody", New chat, then the conversations. Settings, Help and Archive sit at the foot | `lib/boot-shell-script.ts`, `components/loro-sidebar.tsx` |
| Conversation | the rest, never under 280 px | one row of **tab pills** at the top (several conversations in one working folder), then the transcript on a reading column, then the context row (repo, branch, `+a −d`, Create PR) and the composer (model · effort · permission mode · context %) | `sessions/desktop-session-detail-layout.tsx`, `session-tab-bar.tsx` |
| Right panel | a split ratio dragged by a handle that **paints nothing at rest**: one ink block on hover, a darker one on keyboard focus, the darkest while dragging. It opens and closes on `cubic-bezier(0.32, 0.72, 0, 1)` | closeable tabs in a fixed order: fixed panels (Files, All Changes, PR, Browser, iOS Simulator, Android Emulator), then side conversations, then viewers (a file, a diff). The **iOS and Android previews can be dragged onto each other** to show side by side, split 25–75% | `.agents/docs/sessions-side-panel.md`, `side-panel-split-handle.tsx` |
| Terminal dock | bottom, ⌘J or Ctrl+` | a terminal on the session's computer | `README.md` in `sessions/` |

Viewers never split the conversation: every file or diff opens as a right-panel tab
(`sessions/AGENTS.md`). (DOCUMENTED)

### 3.2 How many sessions are visible

**One conversation is open at a time.** Its tabs are the same working folder, not other tasks.
Watching many agents is done **by the sidebar alone**, so the sidebar's row is the product's
most designed object. (VERIFIED, INFERRED as intent)

### 3.3 The sidebar row (`sidebar-row-shared.tsx`, `session-row-leading-slot.tsx`; VERIFIED)

- **Anatomy:** `[① tree or ⋯ | ② title | ③ the status channel]`. The rows are one line, about
  26–30 px. A row in Updated mode adds a second line naming its project (mark + name, 4 px under
  the title).
- **③ is the row's single status channel.** In priority order it draws:
  - a failed send;
  - waiting for permission: a `Hand`, 12 px, in the primary ink;
  - **working: a 3×3 "working grid"** of tiles moving in a wave;
  - sending: a shimmer;
  - unread: an 8 px dot.

  Any of these **replaces the whole resting metric cluster**, so an active row reads only
  `[title][mark]`. Only a resting row shows its facts: a mergeable mark, a faint worktree glyph,
  and the PR icon with a CI verdict cut into it (success, failure, pending). Line totals are
  **not** on the row; they live in the hover card. On hover, Archive takes the trailing place,
  so the rightmost mark never moves.
- **The "done" handover:** when a working row becomes unread, the grid's tiles **spin and gather
  into the dot** (480 ms gather, then a 620 ms pop with two bounces), played once
  (`ui/working-status-mark.tsx`, `working-grid-collapse.tsx`). The comment says it was tuned at
  the real 14 px size, and sparks were dropped as invisible there.
- **A folded group keeps one mark**: the mark its most urgent row would draw (waiting > working
  > unread), in the same trailing column, with the counts only in the hover and the screen-reader
  label ("1 waiting for approval · 2 working · 3 unread"). Their decision note:
  "a glance answers 'does anything in here need me?', a hover answers 'how much?', and expanding
  answers 'which?'"
  (`.agents/notes/implemented/feature/2026-09-26-sidebar-folded-group-status.md`).
- **Grouping** is Workspace mode (machine › local project or GitHub repo › rows, each group
  previewing **five top-level rows** with "Show all (n)") or Updated mode (one recency list).
  Updated mode shows 20 rows before "Show all" (`sidebar-updated-session-list.tsx`). Pinned
  comes first. A conversation that another one opened nests under it as `├/└` with a disclosure
  "Show n opened sessions", one level deep, and never hides a row.

### 3.4 Keys (`lib/commands/shortcuts.ts`, VERIFIED)

| Key | Action |
|---|---|
| ⌘K or ⌘⇧P | the palette |
| ⌘N | new chat |
| ⌘⇧[ and ⌘⇧] | previous or next **visible conversation in the sidebar** |
| ⌘⇧, and ⌘⇧. | previous or next tab |
| ⌘1–⌘8, ⌘9 | tab n, the last tab |
| ⌘L | focus the composer |
| ⌘F | search the conversation |
| ⌘B | the sidebar |
| ⌘⌥B | the right panel |
| ⌘J | the terminal |
| ⌘. | zen mode (everything but the conversation hidden) |
| ⌘⌥A | archive |
| ⌘⌥P | pin |
| ⌘[ and ⌘] | back and forward |

Every key can be rebound, and an OS-wide global shortcut can be set. The sidebar has no j/k: you
walk it from anywhere with ⌘⇧[ ⌘⇧].

### 3.5 Empty and loading states

- An empty right panel shows a **launcher** of what can be opened. Closing the last tab returns
  to the launcher, and the open tabs and their order persist per conversation.
- An empty child tab offers three suggestions: Review, Summarize, Simplify
  (`child-tab-empty-state.tsx`).
- "Starting…" is shown for at most 30 s after a send with no sign of life, and never next to a
  "machine offline" chip. Live status comes only from presence, never from stored state, after a
  stale state once left finished conversations saying "Starting…" forever
  (`.agents/docs/sessions-live-status.md`). (DOCUMENTED)
- The browser preview offers desktop, tablet and phone widths, zoom, and a **visual comment**:
  pick an element, type what should change, and it lands in the composer as a reference with its
  CSS path (`20260507-preview.png`). (VERIFIED)

### 3.6 Density and look

Small type with tight rows (the pictures show about 20 sidebar rows in 900 px), a flat
light-grey or cream sidebar, and hairlines. It is a calm developer tool (VERIFIED from the
pictures), and **its look is the opposite of Pebble's clay**. What is worth taking is the
structure and the mechanisms, not the skin.

## 4. Other things worth noting

- **Onboarding** (`packages/components/src/components/onboarding/AGENTS.md`,
  `intro-illustration-direction.md`): four illustrated full-screen beats, with words on the left
  and a 3:4 picture on the right that never flips; only the fourth beat offers "Configure Lody".
  Setup screens use a live still of the real product (`TourStill`), never a mock. Built-in agent
  runtimes download **concurrently from the moment onboarding opens**, so the felt wait is the
  longest download, not their sum. An empty first task becomes "Enter Lody" instead of a disabled
  button. (DOCUMENTED)
- **The motion is checked by recording it.** In verification builds the floating preview writes
  sampled scale, alpha and chrome values every 20 ms to a JSON file per motion, so UI checks can
  test the animation and not only the end state (`SimulatorPreview.record`). (VERIFIED)
- **Desktop agent work:** "Worked for 2h 36m 08s" folded, the outcome in prose, then an
  "Edited 5 files" card with +/− per file (`20260716-new-ui.png`). This is close to Ducter's D210
  and D104. (VERIFIED)

## 5. Ducter today, read from the code

**The phone client is one web page everywhere.** `apps/ios` is a WKWebView around the web client
(`apps/ios/Ducter/WebShell.swift`), so the iPhone, the iPad and Android all draw
`apps/web/src/main.tsx`. (VERIFIED)

| Width (CSS px) | Web, iPhone, iPad, Android: `main.tsx`, `wide.ts`, `static/app.css` | Mac (MyGo): `apps/desktop/internal/views` |
|---|---|---|
| < 1000 | one column: the conversation, On hand, or the task | — |
| ≥ 1000, two panes (D176) | **conversation \| side pane** (`clamp(400px, 40%, 560px)`). The side pane holds On hand **or** the task opened from it, never both; opening a task replaces the list | — |
| Whole screen, On hand (D184, D216) | **one list on a 960 measure** (`Board`) | `onhand.go`: **one list, `Width(960)`**, a place of its own (⌘2) |
| Whole screen, a task | from **1360**: a **340 rail of On hand \| the task** (720 measure); from **1720** with the workbench open: **rail \| task \| workbench** (42%, 380–760). Under those widths: the task alone, or task \| workbench | `task.go`: **the task \| the workbench (520)**. **No rail at any width**: opening a task leaves On hand |

So the author is right, and more so on the Mac (VERIFIED):

- **The Mac's On hand is one column, and the Mac has no Conductor layout at all.** `onhand.go`
  draws a single 960-wide column. `task.go` replaces the window with the task, plus an optional
  520 workbench. `grep` finds no rail in `apps/desktop`.
- D216's record says the rail was built on the web only ("web: … the whole screen and the rail;
  the Mac: the list, Find, the keys, hover actions, ⌘O"). `design/ui.md` describes the rail
  without saying it is web-only. This is drift worth one line in the change loop.
- **On the web the Conductor layout exists, but only in one corner.** It needs the whole-screen
  route, a task already opened, and at least 1360 px (1720 with the workbench). An 11" iPad held
  across (1180–1194) never sees it, and a 13" iPad (1366) sees it only with the workbench closed.
  The default wide view, two panes, swaps the list for the task, which is exactly what a person
  managing many tasks does not want.
- **The phone screen** (D217, D220, D238):
  - Ducter's own phone is shown in the workbench's Phone page, or as a full-screen sheet. It is
    the device's own JPEG at ≤ 6 fps, in its own rounded shape, with Android's three keys drawn
    in the user's turn and **接手 / 还给它 / 关闭** (My turn / Hand it back / Close)
    (`design/phone-use.md` §7).
  - The iOS simulator is **view only**, from `simctl io screenshot` at about 4 fps with a rail of
    `simctl` controls (`design/workbench.md`, research/64).
  - The person's own phone shows the **pill** in its status bar, with tap rings and **停下 /
    Stop** (D238).
  - There is no floating preview anywhere: watching means opening the workbench or the sheet.

## 6. Lody and Ducter side by side

| | Lody | Ducter |
|---|---|---|
| Who drives the phone | only the person (the agent can only start or stop a preview) | the task, with the Go gate, turns, blindness during the user's turn, and money apps out of reach (D217/D238) |
| Frames | H.264 over WebRTC DataChannels (WebSocket fallback), about 60 fps class (INFERRED) | JPEG ≤ 6 fps (phone), about 4 fps screenshots (simulator) |
| Input | one or two fingers, hardware buttons, paste text, Android quality tiers | the phone: taps, swipes, keys, text in the user's turn; the simulator: none |
| Where it shows | the chip, then the floating preview, then the full page (zoom) | the workbench's Phone page, or the full-screen sheet |
| Motion | spring entrance, flight into the chip, zoom, power-off with a haptic | D190's view; the pill settles in with overshoot (on the phone) |
| Device shape | the Mac's real DeviceKit bezel, or the bare screen | the bare screen, "no drawn device" (D220) |
| Many tasks | Mac: three panes. iPad: at most two (list \| work, or work \| detail) | web: a rail only at the whole screen from 1360. Mac: none |

## Implications for Ducter

**Style guard (the author's rule):** take Lody's *structure and mechanisms* (panes, thresholds,
what a row shows and in what priority, keys, how one live screen moves between forms). **Never
its skin**: Lody's flat grey sidebar, 26 px rows, Lucide hands and hairline density would flatten
Pebble. Every item below is drawn in Ducter's own tokens:

- the clay cards and bases, radius 24;
- the partner's faces;
- the drawn glyphs;
- D216's two-line rows;
- the Pebble motion curves, with the reduced-motion paths.

Where Lody's mechanism needs a mark, Ducter draws its own clay one. The emotional value (好用,
顺滑, 赏心悦目, 放心, 惊喜) is the test, not Lody's density.

The items are ranked and use glossary words. "Adopt" means take the mechanism as is, "adapt"
means take the idea in Ducter's shape, and "don't copy" says why not.

1. **Adopt: On hand beside the opened task on the Mac (D216's rail, brought to the Mac).**
   - On the Mac's whole window, opening a task from On hand keeps **On hand as a rail** | **the
     task** | **the workbench** (520, ⌥⌘B). The rail is 300–340, resizable 240–420 like Lody's
     sidebar. The task keeps its 720 measure, shrinking to about 560.
   - j/k and ⌘⇧[ ⌘⇧] (Lody's keys for this, which work from anywhere, even in the composer) walk
     the tasks in place. That is the Conductor feel.
   - The list with nothing opened stays the 960 list: with no task opened there is nothing to
     stand beside, and that keeps the fresh user's one calm row.
   - Thresholds by window width: rail plus task from about 1100 pt, all three from about 1560 pt.
     Below that, as today.

   This closes the drift in §5. The rail's rows stay D216's clay rows, the task stays its clay
   page, and only the arrangement is Conductor's. *Tradeoff:* a third pane of Go immediate-mode
   layout to build and test. *Alternative:* only a ⌘O switcher on the Mac, rejected because it
   hides the list that gives the sense of control.
1a. **Adopt Lody's row mechanisms for the rail (§3.3), drawn in clay.**
   - **One status place per row:** what needs you, working or waiting, and "finished, unseen".
     An active row hides its resting facts (`+a −d`, Draft PR), which D216 shows on every row.
     In the narrow rail, drop the facts while a row is active. The full two-line row stays on
     the 960 list.
   - **A folded section keeps one mark:** the most urgent of its rows, with counts on hover.
     This matters for By project, where a folded project must not hide a 等你 / Needs you.
   - **A "done" handover:** when a task finishes unseen, its working mark gathers into the
     unseen mark, once. In Ducter this is the partner's own working → done face, or the clay
     mark of the step, never Lody's tile grid. It is a small 惊喜 that D73's "no status dots"
     allows, because it is the face, not a dot.
2. **Adapt: let the rail reach iPads, and use Lody's two-slot rule where there is not room for
   three.**
   - Lower ROOMY from 1360 to about 1120 with a 300 rail, so an 11" iPad held across gets
     **On hand | task**.
   - Under ROOMY_BENCH, opening the workbench **swaps the rail out**, giving task | workbench, as
     Lody's iPad swaps list | conversation for conversation | detail. It does not drop to a sheet.
   - In the two-pane default (conversation | side pane), keep the conversation on the left. A
     tap on a task opens it in the side pane as now, but its crumb **‹ 手头的事** stays one tap
     away (already true). Do not add a third pane there.
2a. **Adopt the workbench's panel mechanics** (§3.1, §3.5):
   - The divider paints nothing until it is hovered, focused or dragged.
   - Closing the last page shows a launcher of what can be opened, never a blank.
   - The page open is kept per task (already: per device).
   - Two screens (Ducter's phone and the simulator, D220's "a choice of screens when there are
     two") can stand side by side instead of a choice.
2. **Adapt: let the rail reach iPads, and use Lody's two-slot rule where there is not room for
   three.**
   - Lower ROOMY from 1360 to about 1120 with a 300 rail, so an 11" iPad held across gets
     **On hand | task**.
   - Under ROOMY_BENCH, opening the workbench **swaps the rail out**, giving task | workbench, as
     Lody's iPad swaps list | conversation for conversation | detail. It does not drop to a sheet.
   - In the two-pane default (conversation | side pane), keep the conversation on the left. A
     tap on a task opens it in the side pane as now, but its crumb **‹ 手头的事** stays one tap
     away (already true). Do not add a third pane there.
3. **Adopt: a floating little phone, in the opened task.** While a task uses Ducter's phone
   (D217) or the simulator (D220), the opened task shows Lody's floating preview:
   - 116–144 wide, the live screen in its own shape, top-right, draggable and snapping to a side,
     expand and close above it.
   - A tap zooms it into the workbench's Phone page, or into the full sheet on a phone. Close
     flies it back into the **查看手机** chip; Stop (停下) powers it off.
   - Pebble tokens, clay chrome and the reduced-motion paths are Ducter's own.

   **Not in the conversation by default.** "The conversation is a messaging app" and "never show
   what it read" rule that out. Only when it is **轮到你了 / your turn** (a sign-in, a code)
   does the conversation show it, because then the person needs the screen. *Tradeoff:* frames
   flow while it is visible. The existing rule of no frames out of sight holds, and the preview
   is small, so it can be asked for at a small edge.
4. **Adopt (needs its own research and decision): taps on the simulator through Baguette.**
   D220's "view only" todo needs Xcode's private frameworks. Baguette (Apache-2.0) is what Lody
   ships for this: `baguette serve` gives HID input and H.264 frames on Apple Silicon with
   macOS 15+ and Xcode. Lody had to patch a crash at the 30-second ping, and pins and hosts its
   own build. A Ducter version would be one consent sheet like the phone's (D217 §3), then
   **接手 / 还给它** on the simulator too. It would also give the phone and the simulator one
   faster frame path. Next step: a research report checking Baguette's current release, licence
   and behaviour on our Macs, before any D.
5. **Adapt: real device art, when it is the real thing.** Lody draws the simulator inside the
   Mac's own DeviceKit bezel and shows the bare screen otherwise. That is consistent with D220's
   "no drawn device", since this is not drawn but Apple's art for that exact device. It is
   worth trying for the simulator only, after 3; the Android phone stays a rounded screen.
   *Low priority.*
6. **Adopt: the motion is checked by recording it.** Write sampled scale and alpha per motion in
   test builds and assert on them (Lody's `record`). Ducter's motion is reviewed today by
   screenshots, which miss "it blinked".
7. **Adopt: the connection pill's words.** "Connecting", never "Offline"; "Connected" for 1.2 s,
   then nothing. This matches Ducter's restraint. Check the web's reconnecting line against it.
8. **Adopt for the onboarding work: download while the person reads.** Start fetching what the
   first task will need (the agent CLIs, a phone image only if the person asked for one) when the
   first-run screens open, never after the last tap. An empty first task becomes "start" rather
   than a disabled button.
9. **Don't copy:**
   - Team workspaces, owners and avatars on rows: Ducter is one person's partner, and personas
     stay isolated.
   - Tabs inside a conversation: Ducter has one conversation, and tasks carry the work.
   - "Open PRs" as a status group: D216's 等你 / 在做 / 在等 / 今天做完 already cover it, and repo
     facts stay on repo tasks.
   - ±diff and branch on every row for every user: D216 shows them only where there is a repo.
   - An agent tool that starts a preview the person must go and open: a Ducter task that needs
     the phone simply uses it, behind the Go.
   - Lody's absence of turns and gates: Ducter's are the 放心 (trustworthy) part.
   - Live Activities: Lody removed theirs. That is no evidence against Ducter's own plans, only a
     note that they cost more than they gave there.

Also not taken: Lody's tab pills in the conversation, a terminal dock (workbench.md already
leaves it out), rebinding every key, and the sidebar's density.

**Summary.** Lody's "phone use" screen is a simulator or emulator *preview*: the person watches
and drives it, and the agent can only start or stop it. It feels excellent because one live
screen moves continuously between three forms (chip, floating preview, full page) with a spring
entrance, a flight back into its chip, a zoom and a power-off, drawn in the real device's bezel
and fed by H.264 over WebRTC from a patched Baguette. On layout, Lody's desktop is Conductor's
shape (sidebar 280 | conversation | a tabbed panel of files, changes, PR, browser and simulator),
and its iPad deliberately keeps to two panes. Its many-agent view is the sidebar row: one
trailing status place that replaces the resting facts, a working grid that gathers into the
unread dot, and folded groups that keep their most urgent mark. Ducter's On hand is one column on the Mac
(`onhand.go`, 960), and the Mac has no rail at all. The web has the Conductor layout only at the
whole screen, from 1360 px, with a task opened. Recommended, in order:

1. the rail on the Mac, with Lody's row mechanisms drawn in clay;
2. a lower threshold and a two-slot rule for iPads;
3. a floating little phone in the opened task;
4. simulator taps through Baguette, after its own research.

All of them take the structure and never the look, since Pebble's clay is Ducter's.
