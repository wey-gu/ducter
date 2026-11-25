# 232: Platform conventions, the unwritten rules every hand knows (D573)

The author, 2026-11-25: 「我们连 cmd+w 的关闭窗口快捷键都没有？你审视一下这些隐性知识原则下的体验？」
A Mac user's hands press ⌘W, ⌘[ and ⌘+ without thinking; a phone user swipes back and expects
Back to close what is on top. Missing even one feels broken and cheap (D36: 顺滑, 放心). This report
audits Ducter against those conventions on the Mac app, the web client and the phone shells,
ranks the gaps, and records what D573 fixed.

Method. Code read on `main` at 0.1.69/0.1.70 (`apps/desktop`, MyGo v0.10.0 in the module cache,
`apps/web/src`, `apps/ios`, `apps/android`). The Mac menu bar after the fix was run for real: a
build of this branch against a demo core (`apps/web/demo-onhand.ts` on its own port and data
folder), each menu opened and shot, ⌘K → ⌘W, ⌘, → ⌘W → ⌘W, ⌘2 → ⌘[ → ⌘] driven by key presses
(shots in `.shots/conventions/`). Tags: **VERIFIED** (run, or a test that fails without the fix),
**CODE** (read in the code, not run), **DOCUMENTED** (Apple HIG / Android docs), **INFERRED**.

Sources: Apple HIG "The menu bar" and "Keyboards" (standard menus, their order and keys;
DOCUMENTED); AppKit adds AutoFill, Start Dictation and Emoji & Symbols to an app's Edit menu by
itself (VERIFIED in the shot `mac-menu-3-Edit-en`); Android "Add support for the predictive back
gesture" (an always-enabled callback suppresses the back-to-home preview; DOCUMENTED).

## 1. Mac (Apple HIG)

Before the fix the menu bar was: the app menu, MyGo's default Edit menu, a View menu that also held
New Task / Find Anything / Open Task, MyGo's default Window menu and Help. **There was no File
menu, so no Close Window item, so ⌘W did nothing in any window** (CODE: MyGo's `RoleWindowMenu` on
macOS is Minimize, Zoom, Bring All to Front; no Close). `docs/devices.md` already promised "Closing
the window (⌘W, or the red button) hides it".

| Convention | Before (how known) | Gap | Fix (D573) |
|---|---|---|---|
| App menu: About, Settings ⌘, , Services, Hide ⌘H, Hide Others ⌥⌘H, Show All, Quit ⌘Q | all there, plus Check for Updates and Stop Ducter (CODE `main.go` appMenu) | none | kept; guard test |
| File: New ⌘N, Close Window ⌘W | no File menu; ⌘N lived in View; ⌘W nothing (CODE) | **⌘W dead everywhere** | File: New Task… ⌘N, Open Task… ⌘O, Find Anything… ⌘K, Close Window ⌘W (VERIFIED live) |
| ⌘W on every window | nothing (CODE) | **main, Settings, app windows, sheets, viewers** | one Close Window item: the main window closes the sheet or viewer on top first (one per press), then Settings (back to where you were), then hides the window; an app's own window closes; the mini window hides (VERIFIED live and by `TestCmdWClosesTheTopLayerThenTheWindow`) |
| Edit: Undo/Redo, Cut/Copy/Paste, Paste and Match Style, Delete, Select All | MyGo's default Edit menu (CODE) | none | ours, the same roles |
| Edit › Find ⌘F, Find Next ⌘G, Find Previous ⇧⌘G | none; ⌘F worked only inside the file viewer and the hand-over sheet (CODE) | no Find menu | Edit › Find: ⌘F finds in the file viewer or the hand-over sheet when one is in front, else opens Find anything; ⌘G / ⇧⌘G step the file viewer's find (CODE; the menu takes ⌘F before any view, so this is the one way in) |
| Emoji & Symbols, Start Dictation, AutoFill | AppKit adds them to the Edit menu (VERIFIED shot) | none | — |
| Spelling and Grammar | none; MyGo's text fields have no spell checker (CODE) | gap | todo (MyGo needs NSSpellChecker in its text input) |
| View: zoom ⌘0 / ⌘+ / ⌘− | none; MyGo's zoom roles skip native UI (CODE `performRole`) | gap | View › Actual Size ⌘0, Zoom In ⌘=, Zoom Out ⌘−: the window content's zoom (`ui.Context.SetZoom`), steps 75–200 %, kept on this Mac (VERIFIED by menu click: `desktop.json` zoom 1.1; `TestZoomSteps`). The ⌘= key press itself did not land in the live run (INFERRED: the run lost the foreground); owed a check |
| View: Enter Full Screen ⌃⌘F | MyGo's "Toggle Full Screen" (VERIFIED shot) | wrong words | Enter Full Screen / Exit Full Screen, following the window (CODE) |
| View: Show/Hide Sidebar ⌃⌘S | no sidebar to hide: the partners' list shows only with more than one partner and has its own control (CODE) | not applicable yet | todo with trigger |
| Window: Minimize ⌘M, Zoom, Bring All to Front, the window list | MyGo's Window menu; macOS adds Fill, Center, Move & Resize and the list (VERIFIED shot) | none | kept |
| Help with a search field | `RoleHelp` gives macOS's search (VERIFIED shot) | Keyboard sheet not reachable from Help | Help › Keyboard Shortcuts ⌘/ |
| ⌘[ / ⌘] back and forward | none: Esc only went up a level; no history (CODE) | gap | View › Back ⌘[ / Forward ⌘]: a history of places seen (route plus task), 50 deep (VERIFIED live and `TestBackAndForwardThroughPlaces`) |
| Trackpad two-finger swipe back, mouse side buttons | none (CODE) | gap | the same Back and Forward on MyGo's `KeyBack` / `KeyForward` (unit test; a real trackpad swipe owed) |
| Esc closes the top sheet, popover or menu | every sheet is a MyGo dialog that closes on Esc; the app's Esc walks the place's own steps (CODE `shortcuts`) | none | — |
| Dock click with no window reopens it | `App.OnActivate` shows and focuses the window (CODE) | none | — |
| Window size and position restored | the mini window and app windows had a StateKey; **the main window had none** (CODE) | main window forgot its place | `StateKey: "main"`; guard test that every window has one |
| Tab / ⇧Tab with a visible focus ring | shared controls draw the keyboard focus ring (ui.md Buttons; CODE) | none found | — |
| ⌘↩ sends where ↩ sends | ↩ sends, ⇧↩ breaks the line; ⌘↩ did nothing in the composer (CODE) | the web sends on ⌘↩ too | ⌘↩ sends in the shared composer as on the web |
| Messages selectable, copyable; right-click menus | the bubble holds the selection with Reply and Copy (D254); right-click menus on messages, finished rows, groups, devices (CODE `contextMenu`) | files have no Reveal in Finder | todo |
| Drag files in and out | drop onto a composer (CODE `DroppedFiles`); a picture drags out (CODE `DragDataFrom`) | a file card can't be dragged out | todo |
| Services, VoiceOver labels, Reduce Motion, contrast, Dark Mode live | Services in the app menu; ~380 accessible labels; Reduce Motion honoured; WCAG AA tokens (`TestContrast`); appearance follows macOS live (D302) (CODE) | Increase Contrast and the system accent are not read | todo |
| ⌘K find anything | there (D391) | it lived in View | now in File, beside Open Task |
| ⌘1–⌘5 places | there (CODE) | none | kept |
| Scroll position kept per view | MyGo keeps a scroll's offset by key while the element lives (INFERRED) | not checked across a place switch | todo |
| Notification click opens the right thing | a partner's notification opens its conversation (D497, CODE) | none | — |

## 2. Web (desktop browsers)

| Convention | Before (how known) | Gap | Fix (D573) |
|---|---|---|---|
| Esc closes the top layer only | about 40 separate handlers; `escUp` (go up a level) skipped only a sheet and the live view (CODE `wide.ts`) | **one Esc closed the picture viewer and also left the task** (or asked to pause it); a message's menu and the place under it moved together | `layerUp()`: a sheet, the live view, the picture or file viewer, or an open menu holds `escUp` (unit test) |
| ⌘/Ctrl+K | opens Find anything from anywhere (CODE `openKey`) | none | — |
| ⌘/Ctrl+Enter | sends in every composer and starts in the sheets; Enter sends in chat-like fields with a fine pointer (CODE) | none | — |
| Browser Back through views | routes are hash history entries; sheets are not (CODE) | **Back with a sheet open moved the place under it** | Back with a layer up closes it and puts the address back (`popstate` in `main.tsx`) |
| Links open in a new tab, middle-click | external links `_blank` + noopener (CODE) | task rows are buttons, not `<a href>`: no middle-click | todo |
| Tab title shows what needs you | static "Ducter" (CODE) | gap | 「(3) Ducter」 from `needsCount()` (unit test for the words) |
| ⌘F not hijacked | only the file viewer takes it (CODE) | none | — |
| Focus ring, focus trap | global `:focus-visible` ring; sheets don't trap focus or return it (CODE) | Tab can walk behind a sheet | todo |

## 3. Phone (iOS and Android shells)

| Convention | Before (how known) | Gap | Fix (D573) |
|---|---|---|---|
| Android Back closes the top layer first | `goBack()` when it can, else leaves (CODE `MainActivity.kt`) | **Back with a sheet or the viewer open moved the route under it, or left the app** | Back asks the page (`ducterBack()`): the layer on top closes, else up a level, at the top it leaves (web unit test; on a device owed) |
| Android predictive back | `enableOnBackInvokedCallback` on, callback always enabled (CODE) | no back-to-home preview at the top | todo: the page reports whether Back has a step |
| Android edge-to-edge, keyboard | insets as `--safe-*`, the IME margin set by hand (CODE) | none | — |
| Android share out | no `navigator.share` in WebView; share hidden (CODE) | gap | todo |
| iOS swipe from the edge back | the WKWebView's own gesture **and** the page's edge swipe (CODE) | two back gestures on one edge (INFERRED double step) | todo: check on a device, then keep one |
| iOS tap the status bar to scroll to top | the document never scrolls; inner scrollers (CODE) | does nothing | todo (a hidden scrollsToTop view relaying to the page) |
| iOS keyboard over the composer | KeyboardFit + visualViewport (CODE) | none | — |
| Long-press menus | messages have the reply menu; WebKit's callout still shows on images and links (CODE) | small | todo |
| Share sheet (iOS) | `navigator.share` (CODE) | none | — |
| Pull to refresh | off on purpose: the socket keeps the page live (CODE) | none | — |

## 4. Ranked (how often hands hit it × how broken it feels)

1. ⌘W does nothing anywhere (Mac): every session, feels broken. **Fixed.**
2. No File menu, a non-standard menu bar (Mac): every look at the menu bar. **Fixed.**
3. Android Back moves under a sheet or leaves the app: every Back on Android. **Fixed (device check owed).**
4. One Esc closes two things (web viewer, menus): often in tasks with pictures. **Fixed.**
5. Browser Back under a sheet (web): often. **Fixed (closes the layer).**
6. Main window forgets its size and place (Mac): every launch. **Fixed.**
7. ⌘[ ⌘] and the swipe back (Mac): heavy keyboard users, every session. **Fixed.**
8. Zoom ⌘+ ⌘− ⌘0 (Mac): people with small or big screens. **Fixed (key press owed a live check).**
9. Edit › Find, ⌘↩, Enter Full Screen words, Help › Keyboard Shortcuts (Mac). **Fixed.**
10. Tab title count (web). **Fixed.**
11. iOS double edge-swipe, tap status bar, Android predictive back and share, spelling, Reveal in
    Finder, file drag out, Increase Contrast and accent, focus trap in web sheets, task rows as
    links. **Left, each in `design/todo.md` with its trigger.**

## Implications for Ducter

- The standard menu bar is a contract, not a style: its menus, their order and their keys are
  guarded by `TestStandardMenuBar` (apps/desktop), and every window's place by
  `TestEveryWindowRemembersItsPlace`.
- ⌘W is one item for every window, and inside the main window it walks the same layers Esc does:
  every sheet and viewer goes through `dialogBase` (`TestDialogsCloseWithCmdW` fails on a raw
  `ui.DialogBase(`).
- On the web and the phone, "one key, one step" is the rule: a layer up holds the place still, and
  Back is that step from the outside (`backOne`, `ducterBack`).
- `design/ui.md` "Platform conventions" is the checklist from now on; the ducter-ui skill sends
  every reviewer to it.

**Summary.** Ducter broke the most basic Mac convention (⌘W) and several quieter ones. D573 gives
the Mac app the standard menu bar (App, File, Edit with Find, View with Back/Forward and zoom,
Window, Help with Keyboard Shortcuts), ⌘W for every window and layer, a remembered main window,
back and forward through places; on the web and Android one Esc or one Back closes one thing; the
tab title counts what waits. What needs a device or a MyGo change is in todo with its trigger.
