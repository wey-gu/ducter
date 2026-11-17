# 119: Reaching the person's own phone with Ducter closed or the phone locked

The question (the author, 2026-11-17, on 0.0.66 with a real Pixel Fold): lending the phone is
"不解锁，不打开 app 就没法用". What does Android allow an app with a bound accessibility service, so a
Go reaches the phone with Ducter closed, in the background or locked; what does it cost in battery;
and can a self-hosted home wake an Android phone without Google's FCM?

Sources: the author's home Log (task vrxcdgr9, 2026-11-17 UTC; read by the parent session, not
quoted here beyond times), Ducter's code (`apps/android`, `packages/core/src/handset/`,
`packages/core/src/push*.ts`), AOSP source and developer.android.com, each tagged. One AOSP file was
read in full for this note (AccessibilityServiceConnection); other source facts are marked as from
the docs or inferred, and should be re-read before they decide anything finer than this note does.

## 1. What happened on hel

| Time (UTC) | What | Tag |
|---|---|---|
| 04:29:40 | the loan card was raised | VERIFIED (Log) |
| 04:29:48 | the person tapped Go (`decision_resolved`) | VERIFIED (Log) |
| 04:29:48 to 05:28 | nothing on the phone: Ducter wasn't open there, so the home had no link to it | VERIFIED (Log), INFERRED cause |
| 05:28:14 | the person had unlocked the phone but not opened Ducter; `phone_look` answered **"Waiting for the user to let you use Pixel Fold: a card is asking them."**, which was false: the card had been answered | VERIFIED (Log) |
| 05:33 | the person opened Ducter by hand; the first `phone_look` worked, Chrome control worked, give-back worked | VERIFIED (Log) |
| earlier rounds | once a loan was on, Chrome in front and Ducter behind kept working (37 s and 607 s), because the loan's own link (`HandsetLinkService`, D255) was up | VERIFIED (Log) |

Root cause, VERIFIED in code (0.0.67 before this change):
- Outside a loan, the only link was the page in the app's web view (`handset.tsx`); the native
  link started only in `Handset.call("start")` (`HandsetLinkService.start`). A Go could not reach a
  phone whose page Android had paused or never opened, so `lend()` parked the task in `toStart` until
  the page said hello.
- `ready()` answered every one of `asking`, `toStart` and `granted` with the same sentence ("a card
  is asking them"), so a Go given and a phone out of reach read as a card still open.
- A start on a locked phone was refused ("this phone is locked") and the home, catching it, sent a
  stop, so nothing on the phone said that a Go was waiting.

## 2. What Android allows

| # | Fact | Tag | Source |
|---|---|---|---|
| 1 | The system binds an accessibility service with `BIND_AUTO_CREATE \| BIND_FOREGROUND_SERVICE_WHILE_AWAKE \| BIND_ALLOW_BACKGROUND_ACTIVITY_STARTS \| BIND_INCLUDE_CAPABILITIES` (plus `BIND_ALLOW_INSTANT_SERVICE` when allowed) | VERIFIED | `AccessibilityServiceConnection.bindLocked()`, frameworks/base `services/accessibility/java/com/android/server/accessibility/AccessibilityServiceConnection.java` (main) |
| 2 | So the app's process is bound foreground (BFGS) while the screen is on and drops lower with it off; bound by system_server it stays out of the cached state, so the cached-apps freezer leaves it alone | INFERRED from (1) and how OomAdjuster treats the flags | |
| 3 | An app may start a foreground service from the background when it "can start an activity from the background"; the binding's `BIND_ALLOW_BACKGROUND_ACTIVITY_STARTS` gives that. D255 already saw a loan's `specialUse` service start from the background on the emulator | DOCUMENTED (exemption list) + INFERRED (that this binding meets it) + VERIFIED on the emulator (D255) | developer.android.com/develop/background-work/services/fgs/restrictions-bg-start |
| 4 | Other documented exemptions: the user turned off battery optimizations ("Unrestricted"), a notification action, an exact alarm the user asked for | DOCUMENTED | same page |
| 5 | Doze "suspends network access", ignores wake locks, defers alarms; it ends when the person moves the phone, turns the screen on or plugs it in | DOCUMENTED | developer.android.com/training/monitoring-device-state/doze-standby |
| 6 | Apps in the battery-optimization exemption list keep network and partial wake locks in Doze; Play allows asking for it only when Doze breaks the app's core function | DOCUMENTED | same page, "Support for other use cases" and the acceptable-use table |
| 7 | A process at the foreground-service state keeps network in Doze (`NetworkPolicyManagerService.isProcStateAllowedWhileIdleOrPowerSaveMode`: proc state ≤ FOREGROUND_SERVICE, or the power-restricted-network capability); BFGS alone is not enough for that | INFERRED from source not re-read for this note | frameworks/base `NetworkPolicyManagerService.java` |
| 8 | `specialUse` has no runtime cap (Android 15's six hours are for `dataSync` and `mediaProcessing`), needs `FOREGROUND_SERVICE_SPECIAL_USE` and a `PROPERTY_SPECIAL_USE_FGS_SUBTYPE` justification (reviewed by Play); it is not on Android 15's list of types barred from BOOT_COMPLETED | DOCUMENTED (from the docs, not re-read here) | developer.android.com/about/versions/15/behavior-changes-15 |
| 9 | `SCREEN_ON`, `SCREEN_OFF` and `USER_PRESENT` reach a receiver registered at runtime (the accessibility service registers one today); not a manifest receiver | DOCUMENTED (screen) / INFERRED (`USER_PRESENT` since Android 8's implicit-broadcast limits) + VERIFIED in use (`HandsetService.screenOff`, D253/D280) | |
| 10 | A notification with actions shows on the lock screen per the person's lock-screen setting; its actions run without unlocking unless `setAuthenticationRequired(true)` (Android 12+); `VISIBILITY_PRIVATE` with a public version hides its content there | DOCUMENTED | Notification.Action.Builder, NotificationCompat |
| 11 | Android 13+ with notifications denied: a foreground service still runs, its notification only in the drawer's task manager; Android 14+ lets the person swipe most foreground-service notifications away, the service running on | DOCUMENTED (from the docs, not re-read here) | |
| 12 | Android WebView has no Push API (Web Push works in Chrome, not in an app's web view) | DOCUMENTED (MDN compatibility data, not re-read here; `Notify.kt` already records it) | developer.mozilla.org Push API compatibility |

## 3. Waking a phone without FCM

- Ducter's push today (VERIFIED in code): Web Push from the home (`packages/core/src/push.ts`, VAPID,
  RFC 8291) reaches browsers; the iPhone app goes through Ducter's sealed APNs relay
  (`push-relay.ts`, `apps/site/api/push`). The Android app is a web view (no Push API, §2 #12), and
  `Notify.kt` says so: nothing from the home reaches it without its own connection.
- FCM is the only system-level push on Android with Google Play services; a high-priority FCM
  message is also a documented foreground-service exemption (DOCUMENTED). Using it would put a
  Google key and a Firebase project in every self-hosted home, or route through a Ducter relay as
  the iPhone does.
- UnifiedPush (a distributor app such as ntfy) works without Google, but its distributor holds its
  own foreground service and socket: the same cost, in another app the person must install
  (DOCUMENTED, unifiedpush.org; not tried here).
- So, honestly: with a self-hosted home and no FCM, **the app's own long-lived connection is the
  only wake path**. It reaches the phone at once while the screen is on, while the phone is in
  light Doze within its maintenance windows, and always when the person picks it up (any movement or
  the screen ends Doze, §2 #5). In deep Doze, reaching a locked phone lying still depends on the
  foreground-service network exemption (§2 #7, INFERRED) and on the Wi-Fi or modem firmware waking
  for a packet (vendor-dependent, INFERRED); Battery › Unrestricted removes the Doze limit (§2 #6).

## 4. What it costs

- An idle WebSocket costs nothing while nothing is sent; the cost is keepalives. The app pings every
  30 s with OkHttp while awake (a sleeping phone runs no timers, so none fire in Doze); the home's
  Bun server closes a socket idle for 120 s (`idleTimeout: 120`, VERIFIED in `core.ts`). Each ping
  wakes a cellular radio for its tail (seconds); on Wi-Fi it is far cheaper. INFERRED: a few percent a
  day at most on cellular, close to nothing on Wi-Fi; to be measured on the author's Pixel (todo).
- Carrier NATs forget idle mappings in 30 s to 5 min, home routers in minutes to hours (INFERRED,
  common practice). A dead link is found by the next ping or, at once, when the screen comes on:
  the app reconnects on `SCREEN_ON` and `USER_PRESENT`.
- One quiet notification (IMPORTANCE_MIN, its own channel the person may hide) for as long as the
  switch is on.

## Implications for Ducter

1. **The app's own link holds while Android's switch is on, lent or not** (bridge 4): started by the
   accessibility service when it connects, by the page's hello, on screen-on and unlock, and by a
   loan; the token comes from the page or the copy the app keeps for the device (D293). Retries back
   off to a minute when not lent; the screen or the unlock retries at once.
2. **A Go on a locked phone never goes through the lock**: the phone shows a notification that it
   starts when unlocked (content hidden on the lock screen), and `USER_PRESENT` tells the home, which
   starts the loan; nobody needs to open Ducter.
3. **Every wait is said as it stands** (card asking; Go given and waiting for the unlock; Go given and
   the phone out of reach, with why: Android's background limit, an app too old to hold its own link,
   offline or closed, never heard; starting), in the tool's words and in every window.
4. **Locking pauses a loan** (a locked phone may not answer, so no lost rule while paused; a cap of
   30 minutes): no FGS-from-background or network risk is added by it, only taken away.
5. **Not built, and why:** FCM (a Google project per home, or a relay holding Android tokens);
   asking for the battery-optimization exemption directly (Play's policy; the card offers Battery ›
   Unrestricted in words when Android limits Ducter).

**Summary.** Android lets Ducter's bound accessibility service start and keep a `specialUse`
foreground service from the background, and that service's socket is the only FCM-free way a
self-hosted home reaches the phone; it works whenever the screen is on or the phone is picked up,
and in deep Doze only as far as the foreground-service exemption and the radio allow (Battery ›
Unrestricted makes it reliable). The cost is a 30-second ping while awake and one quiet notification.
