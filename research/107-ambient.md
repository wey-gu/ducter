# 107: At a glance without opening the app (D306)

What each platform lets an app show "where the eye already is", what it costs the person's
attention, and what Ducter can build with what it has: the Mac's MyGo tray, the iPhone's existing
notification relay (D159), and an Android app with no push from the home yet. research/100 item 9
names the gap ("Ambient presence ends at the menu bar").

Tags: **VERIFIED** (run or read here), **DOCUMENTED** (the vendor's documentation), **INFERRED**.

## 1. The Mac menu bar (MyGo 0.8.3)

- `mygo.NewTray(TrayOptions{ID, Icon, IconIsTemplate, Title, ToolTip, Menu})`; `Tray.SetIcon(png,
  template)`, `SetTitle`, `SetToolTip`, `SetMenu`, `Destroy`, `Dark()` (whether the bar it sits on is
  dark) and `OnAppearanceChange`. **VERIFIED** (read in `github.com/egoist/mygo@v0.8.3/modules.go`).
- A template image is tinted by macOS to the bar (black on light, white on dark, inverted when the
  menu is open); a coloured image is drawn as is, so a coloured mark must be drawn for the bar it is
  on (`Dark()`, redrawn on `OnAppearanceChange`). **VERIFIED** (MyGo's doc comments) / **DOCUMENTED**
  (AppKit `NSImage.isTemplate`).
- `SetTitle` puts text beside the icon; digits are fixed-width. A number there is the one way to
  make the bar nag (it changes and asks to be read). **VERIFIED** (MyGo doc comment); the judgement is
  ours.
- Menu items are native (`NSMenu`): label, subtitle, submenu, disabled. The test renderer can't draw
  them; a native screenshot needs room in the bar (todo K4 since D71). **VERIFIED**.

## 2. iPhone: Live Activities and the Dynamic Island

- **Requirements** (**DOCUMENTED**, Apple "Displaying live data with Live Activities", "ActivityKit"):
  iOS 16.1+ (Ducter's app targets 17.0); `NSSupportsLiveActivities = YES` in the app's Info.plist;
  the views live in a **Widget Extension** (`ActivityConfiguration` with a Lock Screen view and the
  Dynamic Island's expanded, compact leading/trailing and minimal regions); `ActivityAttributes`
  (fixed at start) and `ContentState` (`Codable`, changes). The person can turn Live Activities off
  per app; `ActivityAuthorizationInfo().areActivitiesEnabled` says so.
- **Starting:** `Activity.request(attributes:content:pushType:)` only from the app in the foreground,
  or from a push-to-start token (iOS 17.2+). An activity lasts up to 8 hours active, then up to
  4 hours more on the Lock Screen. **DOCUMENTED**.
- **Updating locally vs by push.** Locally (`activity.update`) only while the app runs. By push:
  `pushType: .token` gives a per-activity push token (`pushTokenUpdates`, it may change); the
  provider sends `apns-push-type: liveactivity` to topic `<bundle id>.push-type.liveactivity` with
  `aps: {timestamp, event: update|end, content-state, stale-date?, dismissal-date?}`; priority 5 for
  routine updates, 10 when the person should see it at once (a budget applies to 10; frequent
  priority-10 needs `NSSupportsLiveActivitiesFrequentUpdates`). Token auth (the same .p8 key as
  alerts) works. **DOCUMENTED**.
- **No extension opens a Live Activity push.** `content-state` is decoded by the system and handed
  to the widget; there is no Notification Service Extension step. So D159's end-to-end sealing can't
  apply: Apple and any relay see the content state in the clear. **DOCUMENTED** (the payload format;
  no decrypting hook exists) / **INFERRED** (that no workaround exists short of putting nothing
  private in it).
- `content-state` is decoded with the default `JSONDecoder`: a `Date` would be read as seconds since
  2001, so a time travels as an integer. **INFERRED** from `JSONDecoder`'s default date strategy.
- `stale-date`: past it, `context.isStale` is true and the view can say it may be out of date.
  `dismissal-date` on `end`: how long the final state stays. **DOCUMENTED**.
- **Simulator:** an activity started locally shows in the Dynamic Island of an iPhone 17 Pro
  simulator (Xcode 26.3) once another app is in front. **VERIFIED** (`.shots/d306/ios-island-*`).
  Push-to-update needs a real device and APNs (`simctl push` delivers alerts; we did not get a Live
  Activity update through it). **INFERRED / not verified.**

## 3. Android: an ongoing notification

- `NotificationCompat.Builder.setOngoing(true)`, `setUsesChronometer` with `setWhen` (a live clock the
  system draws), `setOnlyAlertOnce`, `setSilent`, `setTimeoutAfter(ms)` (the system removes it after
  that long unless reposted), `CATEGORY_CALL` / `CATEGORY_PROGRESS`; a channel of
  `IMPORTANCE_LOW` makes no sound or heads-up. Android 13+ needs `POST_NOTIFICATIONS` (already
  declared, D246). Android 16's "Live Updates" (`setRequestPromotedOngoing`) promote a progress-centric
  notification to the status bar chip, with rules (no custom views, a title, ongoing). **DOCUMENTED**.
- **The Ducter Android app has no push from the home** (the WebView has no Web Push; UnifiedPush is
  todo, D181 (4)). So the page must keep the notification true while the app lives; when the
  process is frozen, nothing updates it. **VERIFIED** (`Notify.kt`, `native.ts`).

## 4. What deserves a glance (first principles)

Attention is the scarce thing; silence means success. A glance surface is never a feed:

- **Earns it:** whether anything needs the person (the only thing that asks for a look); whether
  something is at work (quiet reassurance, a mark that doesn't move the eye); one thing the person
  *chose* to keep in sight; a live call made in their name (short, time-bound, theirs).
- **Never:** a count in the bar or on a badge that grows with work (it reads as debt); every task
  as a Live Activity (Apple would show a stack of them; each nags); progress percentages Ducter
  can't vouch for; a sound or a heads-up for a phase change (the existing push already speaks for
  what needs you); the task's words on the Lock Screen, where anyone can read them.
- **Honest when it can't keep up:** a glance that may be wrong says so (iOS stale date) or goes
  (Android timeout), never shows a confident phase it can no longer vouch for.

## Implications for Ducter

1. Mac: keep D71's extra; its mark carries three states (quiet, at work, needs you) and no number;
   needs you is a soft clay dot in the accent (coloured, drawn for the bar), the others templates.
   The menu leads with On hand's one sentence. A "Don't show in the menu bar" item and a Settings
   switch (this Mac only).
2. iPhone: a widget extension and a words-free content state `{phase, since}`; the title set on the
   phone at start; the home pushes only changes of phase, priority 10 for needs you and the end;
   a 4 h stale date; the end dismisses after 15 min. Through the relay, a separate handle kind for
   activity tokens, and the relay builds the payload itself from a phase it validates (so a home
   can't put words on someone's Lock Screen). Behind a flag until a real device checks the push path.
3. Android: the same phases in one ongoing, silent notification per followed thing, kept true by the
   page, with a timeout so it goes rather than goes stale; UnifiedPush would let it update while
   closed.
4. Only explicit follows for tasks; a call shows by itself when it goes live while the app is open.

## Summary

The Mac's tray in MyGo 0.8.3 can carry a state mark (template or coloured, per bar appearance); a
Live Activity is feasible with the existing APNs key and relay, but its push is unsealed, so it
carries a phase and a time only, never words; Android can show an ongoing notification only while
the app lives, so it must time out rather than go stale. What gets a glance: needs you (a dot),
at work (a quiet mark), and what the person chose to follow, or a live call.
