# 74: 用这台手机 / Use this phone: a task drives the person's own phone

Asked (2026-11-13): can a Ducter task, running on the person's home computer, use the person's
**own** phone, not an emulator (research/62)? On Android the plan is an `AccessibilityService` in
the Ducter app (`apps/android`: sideloaded APK, WebView shell, minSdk 26, targetSdk 36,
`app/build.gradle.kts:33-38`) that reads other apps' UI trees and acts, takes a screen picture
only when needed, shows a persistent "Ducter is using this phone" indicator with Stop, and is on
only while a task needs it. On iPhone the question is what is honestly buildable.

Tags: VERIFIED (read in source at path:line, or a GitHub API answer), DOCUMENTED (the vendor's own
docs or help pages), INFERRED (my reasoning, or a third-party report). AOSP files were read from
`android.googlesource.com` on 2026-11-13, `refs/heads/main` unless a release branch is named; line
numbers are from that day and drift. No device was used; nothing here was measured on a phone.
`leeguooooo/iphone-use` was cloned read-only and never run.

## 1. The AccessibilityService: what it can and can't do

| Topic | Fact | Tag, source |
|---|---|---|
| Config flags needed | `canRetrieveWindowContent="true"` (tree), `canPerformGestures="true"` (`dispatchGesture`), `canTakeScreenshot="true"` (`takeScreenshot`), `accessibilityFlags="flagRetrieveInteractiveWindows\|flagReportViewIds\|flagIncludeNotImportantViews"`. `flagRetrieveInteractiveWindows` is ignored without `canRetrieveWindowContent`; `flagReportViewIds` adds `package:id/name` resource ids "useful for UI test automation" | VERIFIED `core/res/res/values/attrs.xml:4635-4662`, `AccessibilityServiceInfo.java:279-321`; developer.android.com/guide/topics/ui/accessibility/service (fetched 2026-11-13) |
| Not needed | `flagRequestFilterKeyEvents` (0x20) observes hardware key presses: no use for an agent that types by setting text, and it widens what the service can see. `flagRequestAccessibilityButton` optional | VERIFIED `attrs.xml:4645`; INFERRED |
| Typing | `flagInputMethodEditor` (API 33) gives `getInputMethod()` to commit text into the focused field, the fallback where `ACTION_SET_TEXT` is ignored (some WebView, Flutter, game fields) | VERIFIED `AccessibilityService.java:2020-2041`, `attrs.xml:4662` |
| Same shape elsewhere | Droidrun/Mobilerun Portal ships exactly these flags plus `canTakeScreenshot` and `isAccessibilityTool="true"` | VERIFIED `droidrun/mobilerun-portal` `app/src/main/res/xml/accessibility_service_config.xml` (GitHub API, 2026-11-13) |
| `isAccessibilityTool` | "whether the accessibility service is used to assist users with disabilities … If this flag is false, system will show a notification after a duration to inform the user about the privacy implications". The notification reads **"Review app with full device access" / "Ducter can view your screen and perform actions on your device. Accessibility apps need this type of access to function as intended."** (zh **"检查对设备具有完全访问权限的应用"**). Views that are `accessibilityDataSensitive` (API 34) answer only tools; a view that sets `filterTouchesWhenObscured` is data-sensitive by default, and so are its descendants. Android 17's Advanced Protection blocks non-tools entirely (§5) | VERIFIED `attrs.xml:4718-4726`, `attrs.xml:3677-3689`, `View.java:15816-15845`, PermissionController `res/values/strings.xml:940-946`, `values-zh-rCN/strings.xml:297-298` |
| Honest value for Ducter | `false`. Ducter is not a disability tool. Claiming `true` would hide the system's privacy reminder from the person and unlock views apps marked as sensitive (banking apps commonly set `filterTouchesWhenObscured`): against 放心 | INFERRED |
| Taps and swipes | `dispatchGesture(GestureDescription, callback, handler)`, API 24, needs `canPerformGestures`; strokes can continue (`willContinue`) for drags | VERIFIED `AccessibilityService.java:1286`; DOCUMENTED service guide |
| Back / Home / Recents | `performGlobalAction(GLOBAL_ACTION_BACK=1 / HOME=2 / RECENTS=3 / NOTIFICATIONS)` | VERIFIED `AccessibilityService.java:525-536, 2560` |
| Windows | `getWindows()` lists interactive windows (needs `flagRetrieveInteractiveWindows`); `getRootInActiveWindow()` for the focused one | VERIFIED `AccessibilityService.java:1073` |
| CJK text, no IME | `performAction(ACTION_SET_TEXT, bundle{ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE})` sets the field's whole text as a `CharSequence`, so Chinese needs no keyboard switch (contrast ADB Keyboard in Open-AutoGLM, §6) | VERIFIED `AccessibilityNodeInfo.java:484, 599`; Pinky uses it for CJK (DOCUMENTED research/62 `:33`) |
| Password fields | `isPassword()` is set; a `TextView` reports `getTextForAccessibility()` = the **transformed** text (dots from `PasswordTransformationMethod`), or the hint when empty. Compose and WebView fields follow their own semantics (not checked) | VERIFIED `TextView.java:14204-14205, 15111-15119`, `AccessibilityNodeInfo.java:2828`; INFERRED for Compose/WebView |
| Screenshots | `takeScreenshot(displayId, executor, callback)` API 30; `takeScreenshotOfWindow` API 34 (captures a window under an overlay). **One per 333 ms** (`ACCESSIBILITY_TAKE_SCREENSHOT_REQUEST_INTERVAL_TIMES_MS = 333`), else `ERROR_TAKE_SCREENSHOT_INTERVAL_TIME_SHORT`. No extra consent beyond the service itself | VERIFIED `AccessibilityService.java:788, 2687-2705, 2738-2761`, `AbstractAccessibilityServiceConnection.java:1415-1427` |
| FLAG_SECURE | Window capture of a secure window fails with `ERROR_TAKE_SCREENSHOT_SECURE_WINDOW` ("the window contains secure content", `@see FLAG_SECURE`); display capture is taken with default args (no secure layers), so secure layers come out black. `FLAG_SECURE` does **not** hide the accessibility tree; only `accessibilityDataSensitive` does (for non-tools) | VERIFIED `AccessibilityService.java:776-780`, `AbstractAccessibilityServiceConnection.java:1514-1526` (`captureDisplay(displayId, null, …)`); INFERRED that null args mean no secure layers; Open-AutoGLM sees black payment screens (DOCUMENTED, §6) |
| Tree read speed | Pinky's companion service reads the tree in ~70 ms vs ~2 s for `uiautomator dump` | DOCUMENTED research/62 `:33`, research/22 `:250` (Pinky `docs/DESIGN.md`). Not measured here |
| Overlay without SYSTEM_ALERT_WINDOW | The service's own `WindowManager` carries the service's window token, so it can add `TYPE_ACCESSIBILITY_OVERLAY` windows with no `SYSTEM_ALERT_WINDOW`. Such overlays don't hide the windows below from the service's introspection | VERIFIED `AccessibilityService.java:2666-2682`, `WindowManager.java:2499-2510` |
| Turning itself off | `disableSelf()` (API 24): "the service will be disabled and settings will show that it is turned off". **There is no enableSelf.** Turning it back on is the person's job in Settings (or a shortcut, below) | VERIFIED `AccessibilityService.java:1146-1148` |
| Detecting it's on | `AccessibilityManager.getEnabledAccessibilityServiceList(FEEDBACK_ALL_MASK)`, plus `addAccessibilityServicesStateChangeListener` (API 33) for a live change; or `Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES`, a `:`-separated list of flattened ComponentNames | VERIFIED `AccessibilityManager.java:864, 1018`, `Settings.java:8808` |
| Process importance | The system binds the service with `BIND_AUTO_CREATE \| BIND_FOREGROUND_SERVICE_WHILE_AWAKE \| BIND_ALLOW_BACKGROUND_ACTIVITY_STARTS \| BIND_INCLUDE_CAPABILITIES`: while the screen is on, the process ranks like a foreground service | VERIFIED `services/accessibility/.../AccessibilityServiceConnection.java:162-165`; INFERRED for screen-off |
| Quick toggle | The config may name a `tileService` "associated with this accessibility service for one to one mapping"; Settings also offers the per-service accessibility shortcut (button, volume keys, Quick Settings). A path for "turn it on for this task" without digging through Settings | VERIFIED `attrs.xml:4667-4671`, `AccessibilityServiceInfo.java:979`; INFERRED that this works for a sideloaded service once restricted settings are allowed |

**The "on only while a task needs it" tension.** Banking apps refuse to run while an accessibility
service is enabled (Pinky keeps its companion off outside tasks for this reason; DOCUMENTED
research/22 `:250`). But a service can only switch itself **off**. So either (a) Ducter calls
`disableSelf()` after each task and the person turns it on again for the next one (one tap via the
shortcut or tile once set up), or (b) it stays enabled but idle (`setServiceInfo` with no event
types between tasks), and banking apps may still refuse. (INFERRED.) The setup guide must say which.

## 2. Restricted settings for a sideloaded app

### 2.1 The logic in AOSP

| Version | Who is restricted | Tag, source |
|---|---|---|
| Android 13, 14 | On a **first install** for a user, if the installer marked the package source `PACKAGE_SOURCE_LOCAL_FILE` or `PACKAGE_SOURCE_DOWNLOADED_FILE` (what the system package installer sets for an APK from a browser or file manager), `OP_ACCESS_RESTRICTED_SETTINGS` is set to `MODE_ERRORED`. Anything else, including a session install that leaves the source unspecified (app stores, `adb install`), isn't restricted | VERIFIED `InstallPackageHelper.java:3115-3129` (the `else` branch); research reports agree (DOCUMENTED androidauthority.com/android-15-restricted-settings-sideloading-3481098, 2024) |
| Android 15, 16, 17 (Enhanced Confirmation Mode) | With `enhancedConfirmationModeApisEnabled` and `extendEcmToAllSettings` (both **ENABLED** in release configs `ap3a`, `ap4a` = Android 15 and `bp1a` = Android 16), a new install gets `MODE_DEFAULT` and is decided lazily: always trusted if pre-installed or on the `enhanced-confirmation.xml` allowlist; **guarded if the source is LOCAL_FILE or DOWNLOADED_FILE**; otherwise exempt only if its immediate installer is pre-installed or allowlisted, or (AOSP default) if the device lists no trusted installers at all | VERIFIED `InstallPackageHelper.java:3101-3113`, `packages/modules/Permission/service/java/com/android/ecm/EnhancedConfirmationService.java:389-437`, `frameworks/base/data/etc/enhanced-confirmation.xml` (AOSP ships `<config></config>`), `platform/build/release/aconfig/{ap3a,ap4a,bp1a}/…_flag_values.textproto` (`state: ENABLED`); same check in `android16-qpr2-release` and `android17-release` |
| What ECM protects | SMS permissions, device admin, **`OPSTR_BIND_ACCESSIBILITY_SERVICE`**, notification access, `SYSTEM_ALERT_WINDOW`, usage stats, default dialer/SMS roles; plus install-packages during an untrusted call | VERIFIED `EnhancedConfirmationService.java:248-271` |
| You must try once first | The "Allow restricted settings" item appears only after the person has seen the block: legacy path shows it when the op is `MODE_IGNORED`; ECM when the state is `GUARDED_AND_ACKNOWLEDGED`, which the block dialog sets when it opens. Choosing it asks for the screen lock first | VERIFIED `AppInfoDashboardFragment.java:408-426, 492-516, 541-560`, `EnhancedConfirmationDialogActivity.kt:85, 112-117`, `EnhancedConfirmationService.java:312-368` |
| Ducter's self-updates | `Updater.kt` installs through `PackageInstaller` sessions with no `setPackageSource` (`apps/android/.../Updater.kt:189-194`). The restricted state is written only for **first** installs (`firstUserIds`), and the Allow choice is stored explicitly (`MODE_ALLOWED` / `ECM_STATE_NOT_GUARDED`), so allowing once should survive updates; an uninstall resets it. Whether a self-update could *clear* the guard on 15+ (lazy check with installer = Ducter) depends on Pixel's trusted-installer list, which isn't public | VERIFIED code paths above; INFERRED outcome, unverified on a Pixel |
| Pixel overlays | Pixel's Settings is AOSP Settings plus overlays; the exact Pixel strings below are AOSP's and weren't seen on a Pixel | INFERRED |

Third-party confirmations: the menu path "Settings › Apps › the app › More (⋮) › Allow restricted
settings" (DOCUMENTED support.google.com/android/answer/12623953, "Some of these steps work only
on Android 13 and up", fetched 2026-11-13); old vs new dialog wording (DOCUMENTED
bayton.org/android/android-13-restricted-permissions, 2025-04-18); a Samsung user with no ⋮ item
(INFERRED, droidwin comments); ADB fallback `adb shell appops set <pkg> ACCESS_RESTRICTED_SETTINGS
allow` (DOCUMENTED gitlab.com/fdroid/fdroidclient/-/issues/2680).

### 2.2 What Pixel shows, step by step

Strings are AOSP's en and zh-rCN as of 2026-11-13 (VERIFIED: Settings `res/values*/strings.xml`
on `android14-release` for 13/14 and `main` for the rest, framework `core/res/res/values*/strings.xml`,
PermissionController `res/values*/strings.xml`). "Ducter" stands in for the app label.

| # | Screen | Words on screen (en / zh) | Tap | Versions |
|---|---|---|---|---|
| 1 | Settings › Accessibility | **Accessibility** / **无障碍**; section **Downloaded apps** / **已下载的应用**; Ducter's row is greyed, summary **Controlled by Restricted Setting** / **由受限设置控制** | Ducter's row | 13–17 (summary VERIFIED for 13/14, SettingsLib `strings.xml:1144`, zh `:486`; 15+ uses its own ECM summary resource, not checked) |
| 2a | Block dialog (13, 14) | **Restricted setting** / **受限制的设置** · **For your security, this setting is currently unavailable.** / **出于安全考虑，此设置目前不可用。** | OK / 确定 | Settings `android14-release` `strings.xml:10146-10150`, zh `:4017-4019` |
| 2b | Block dialog (15, 16, 17) | **App was denied access** / **系统已拒绝向此应用授予访问权限** · **Access to this permission can put your personal and financial info at risk. It's possible the app won't work properly without this restricted permission. Learn how to allow access** / **如果授予此权限，您的个人信息和财务信息可能会面临风险。如果不授予这项受限权限，该应用可能无法正常运行。了解如何授予访问权限** | **OK / 确定** | PermissionController `strings.xml:2035-2042`, zh `:683-686`; chosen as `SettingType.OTHER` (`EnhancedConfirmationDialogActivity.kt:177-180`). The older "Restricted setting / For your security…" pair still exists as `enhanced_confirmation_dialog_title/desc` (`:2015-2017`) |
| 3 | Settings › **Apps** / **应用** › **See all N apps** / **查看所有 # 个应用** › Ducter (**App info** / **应用信息**) | ⋮ (top right) | ⋮ | 13–17 |
| 4 | ⋮ menu | **Allow restricted settings** / **允许受限制的设置** (only after step 2) | it | `strings.xml:4265`, zh `:1831` |
| 5 | Screen lock | PIN, pattern, password or fingerprint | confirm | `AppInfoDashboardFragment.java:493` (`showLockScreen`) |
| 6 | Toast | **Restricted settings allowed for Ducter** / **已允许"Ducter"使用受限制的设置** | — | `strings.xml:11506`, zh `:4597` |
| 7 | Back to Accessibility › Downloaded apps › Ducter | Switch **Use Ducter** / **使用"Ducter"** | the switch | `strings.xml:5527`, zh `:2377` |
| 8 | Full-control dialog | **Allow Ducter to have full control of your device?** / **要允许"Ducter"完全控制您的设备吗？** · **Full control is appropriate for apps that help you with accessibility needs, but not for most apps.** / **对于能满足您的无障碍功能需求的应用，可授予其完全控制权限；但对大部分应用来说，都不适合授予此权限。** · **View and control screen** / **查看和控制屏幕** — "It can read all content on the screen and display content over other apps." · **View and perform actions** / **查看及执行操作** — "It can track your interactions with an app or a hardware sensor, and interact with apps on your behalf." | **Allow / 允许** (or Deny / 拒绝) | framework `strings.xml:4855-4888`, zh `:1758-1765` |
| 9 | Later, for a non-tool | Notification **Review app with full device access** / **检查对设备具有完全访问权限的应用** | — | §1 |

An app installed from a store or by `adb install` on 13/14 skips steps 1–6. The person always does
steps 7–8.

### 2.3 Deep links

| Intent | Works for a third-party app? | Tag, source |
|---|---|---|
| `Settings.ACTION_ACCESSIBILITY_SETTINGS` | Yes, the Accessibility list. "In some cases, a matching Activity may not exist" | VERIFIED `Settings.java:423-433` |
| …plus the row highlighted | Put `":settings:fragment_args_key" = ComponentName(pkg, service).flattenToString()` **inside** the `":settings:show_fragment_args"` bundle (also as a top-level extra for OEM forks). The service's preference key is exactly the flattened component, and the highlight adapter reads that argument, so the list scrolls to Ducter's row and flashes it; it does **not** open the detail page | VERIFIED `SettingsActivity.java:109-114, 522`, `AccessibilityServicePreference.java:64`, `HighlightablePreferenceGroupAdapter.java:86`; INFERRED on Pixel (not tried) |
| `ACTION_ACCESSIBILITY_DETAILS_SETTINGS` + `EXTRA_COMPONENT_NAME` | **No.** `@hide @SystemApi`, and the activity requires `OPEN_ACCESSIBILITY_DETAILS_SETTINGS`, `signature\|installer` | VERIFIED `Settings.java:435-448`, Settings `AndroidManifest.xml:2442-2457`, framework `AndroidManifest.xml:5418-5419` |
| `ACTION_APPLICATION_DETAILS_SETTINGS`, `package:co.nowledge.ducter…` | Yes, Ducter's App info, where the ⋮ is (step 3) | DOCUMENTED (standard public intent) |

## 3. MediaProjection, and why not

| Fact | Tag, source |
|---|---|
| Consent "before each media projection session. A session is a single call to `createVirtualDisplay()`. A `MediaProjection` token must be used only once." On 14+, reusing the intent or calling `createVirtualDisplay()` twice throws `SecurityException` | DOCUMENTED developer.android.com/media/grow/media-projection (fetched 2026-11-13) |
| Needs a foreground service of type `mediaProjection` with `FOREGROUND_SERVICE_MEDIA_PROJECTION`, started after `createScreenCaptureIntent()` is granted; can't start from `BOOT_COMPLETED` on 15+ | DOCUMENTED same page; …/fgs/service-types |
| 14+: the person may share one app instead of the screen. 15 QPR1+: a large status-bar chip for any projection; tap to stop; **projection stops when the screen locks** | DOCUMENTED media-projection §"Status bar chip and auto stop" |
| So: one more system dialog each task, a red chip, and a stop on lock. Accessibility screenshots need no extra consent and one every 333 ms is plenty for an agent | INFERRED from §1 |

Use MediaProjection only for a live video view of the phone (a later "watch it" feature), never for
the agent's eyes.

## 4. Foreground service and notifications

| Question | Answer | Tag, source |
|---|---|---|
| Does the accessibility service need an FGS? | No: the system binds and keeps it (§1). The connection to the home lives in the same process | VERIFIED bind flags; INFERRED |
| An FGS for the "in use" indicator and a socket that survives screen-off | `specialUse` with `PROPERTY_SPECIAL_USE_FGS_SUBTYPE` (no runtime prerequisites; Play reviews the text, irrelevant when sideloaded) is the honest fit. `connectedDevice` requires e.g. `CHANGE_NETWORK_STATE` and is meant for "external devices" over BT/NFC/USB/network (the home computer is arguably one). `dataSync` is capped at **6 h in 24 h** in the background for targetSdk 35+ (`onTimeout`), wrong for an on-call link. Droidrun Portal uses `dataSync` for its reverse link | DOCUMENTED developer.android.com/develop/background-work/services/fgs/service-types and …/fgs/timeout (2026-11-13); VERIFIED Portal manifest (GitHub API) |
| Notification permission | `POST_NOTIFICATIONS` is a runtime permission from Android 13; without it the FGS notification is hidden from the shade (the service still runs). The in-use indicator should be the accessibility overlay (§1), with the notification as the second place for Stop | DOCUMENTED (Android 13 behaviour change); INFERRED |

## 5. Policy and platform limits (sideloading still affected)

- **Google Play** (irrelevant for a sideloaded APK, noted for later): "Any use of the Accessibility
  API that enables an app to autonomously initiate, plan, and execute actions or decisions is
  strictly prohibited"; verified tools are exempt; `isAccessibilityTool` only for apps whose
  "primary purpose" is supporting people with disabilities; others need in-app prominent disclosure
  and consent (DOCUMENTED support.google.com/googleplay/android-developer/answer/10964491, fetched
  2026-11-13; the clause came with the October 2025 update). Ducter can't ship this in Play.
- **Android 17 Advanced Protection** (opt-in; Android 17 stable 2026-06-16): with it on, only
  `isAccessibilityTool="true"` services may use the API (INFERRED from reports:
  securityaffairs.com 2026-03-16, Android 17 Beta 2; thehackernews.com 2026-10). Ducter must
  detect it (`AdvancedProtectionManager`) and say plainly that this phone can't be used.
- **Developer verification**: from 2026-09-30 in Brazil, Indonesia, Singapore and Thailand, apps
  from unregistered developers install only through the "advanced flow" (a restart and a waiting
  period) or ADB; global in 2027 (DOCUMENTED developer.android.com/developer-verification;
  INFERRED details from androidauthority.com 2026-10-01). Ducter's signing key should be
  registered before 2027.

## 6. How others do it

| Agent | Reads | Acts | CJK typing | Setup the person does | Indicator / stop | Tag, source |
|---|---|---|---|---|---|---|
| Open-AutoGLM (Zhipu, Apache-2.0, 26.6k stars) | ADB screenshots to a vision model; no tree | ADB input; HarmonyOS via HDC | **ADB Keyboard** IME, switched to automatically | Developer options (tap build number), USB debugging (some phones also "USB 调试(安全设置)"), install and enable ADB Keyboard, a computer with adb | Confirmation callback for sensitive steps; "Take_over" for login/codes; black payment screens trigger a takeover | DOCUMENTED github.com/zai-org/Open-AutoGLM README (2026-11-13); VERIFIED GitHub API |
| AutoGLM app | A cloud phone (Android 14) inside the app, not the person's phone | — | — | Sign in to apps inside the cloud phone | In-app | INFERRED cls.cn, 36kr reports |
| Doubao phone assistant (nubia M153, Dec 2025) | System level, by the phone maker | `INJECT_EVENTS` (signature permission) granted through the OEM | System IME | Buy that phone | "User-triggered, user-supervised, can be interrupted"; WeChat, Alipay, Taobao refused or flagged "login environment abnormal" | INFERRED thepaper.cn 2025-12-03, 南都 2025-12-04 |
| Gemini "multi-step tasks in apps" (beta) | "An on-device virtual phone environment"; per-app permission "to read and interact with an app's screen content" | Inside the virtual display | Gemini's own | Pixel 10/11, Galaxy S26/Z 8; US, UK, India, Japan, Korea; 18+; food, rides, tickets | Live-update notification: **View progress**, **Stop task**, **Take control** (not on Pixel 10/S26); pauses for passwords, payment, sign-in | DOCUMENTED support.google.com/gemini/answer/16940971 (2026-11-13) |
| Pinky (Apache-2.0) | Companion accessibility service tree (~70 ms), `uiautomator dump` fallback | adb + scrcpy; hidden second display on 13+ | `ACTION_SET_TEXT` | A Mac or PC with adb, USB debugging, the companion APK | Its own window; approvals; companion on only during a task | DOCUMENTED research/62 `:33`, research/22 `:250` |
| Droidrun / Mobilerun (MIT; Portal "NOASSERTION") | Portal accessibility service (tree, screenshots); overlay highlights elements | Gestures from the service; adb, local HTTP/WS, or a reverse WebSocket to the cloud | Mobilerun Keyboard IME | Install Portal, enable it under Accessibility, optional unrestricted battery | "Portal local server running" notification | VERIFIED GitHub API README and manifest (2026-11-13) |
| mobile-mcp (Apache-2.0, 10.5k) | Accessibility tree first, screenshots as fallback; iOS via WDA | adb | adb input | adb, USB debugging authorized | None on the phone | VERIFIED README via GitHub API |
| mobile-use (minitap, Apache-2.0) / AppAgent (Tencent, MIT, idle since 2025-03) | UIAutomator tree + screenshots | adb | adb | adb on a computer | None | VERIFIED READMEs via GitHub API |
| Apple Intelligence / Siri | Only what apps expose as App Intents; in-app actions were "in development" and timing reports conflict | App Intents | — | Nothing, but only for apps that adopt it | Siri UI | INFERRED macrumors.com 2026-02-06 and others; no Apple release note found |

Pattern: everyone who drives the person's **own** phone without being the OS uses either adb from a
computer (developer options, a cable) or an accessibility service. Only the accessibility route
works with no computer and no developer options, which is why it fits Ducter. Two products
(Doubao, Gemini) that are the OS or the OEM still pause on passwords and payment, and Chinese
super-apps push back against automated control.

## 7. iPhone

### 7.1 `leeguooooo/iphone-use`

Snapshot `aa21767` (2026-11-08 21:00 +0900), 494 stars, 55 forks, created 2026-06-09 (VERIFIED
GitHub API, 2026-11-13).

**License: PolyForm Shield 1.0.0, source-available, not open source.** "Any purpose is a permitted
purpose, except for providing any product that competes with the software" (VERIFIED `LICENSE`);
"Its competition restriction includes free competing products" (VERIFIED `LICENSING.md:5-12`).
Earlier revisions were MIT and those grants aren't revoked, but "it does not offer newly added
project code under MIT" (VERIFIED `LICENSING.md:38-44`). GitHub reports `NOASSERTION`. A "use this
iPhone" feature in Ducter is a competing product: **read for ideas, take no code, don't ship it as
a dependency.**

How it drives the phone:

| | | Source |
|---|---|---|
| Path | A daemon on the Mac → USB or Wi-Fi → its own **XCTest UI-test runner** on the iPhone ("replaced WebDriverAgent and speaks the same HTTP API"), started through Xcode tooling and `devicectl`; relays over usbmuxd; Wi-Fi through CoreDevice's encrypted tunnel (iOS 17+), lockdown TLS on iOS 15/16 | VERIFIED `README.md:95-100`, `docs/guide.md:14-28` |
| Reads | The accessibility tree via XCTest, ~0.1 s; one tap returning the settled screen ~1.9 s | VERIFIED `README.md:70, 276-289` |
| Needs | macOS 15+, **full Xcode**, an Apple ID team in Xcode ("a free Personal Team works, but its runner profile needs periodic renewal": **7 days**), iPhone with **Developer Mode** on, paired and **trusted over USB** first, **unlocked and awake** the whole time ("It cannot get past Face ID or the passcode") | VERIFIED `docs/guide.md:70-80`, `README.md:106-108`, `crates/server/src/setup/flow.rs:1663-1666, 3070` |
| Steps only the person can do | "signing in to an Apple ID in Xcode, tapping Trust on the iPhone, turning on Developer Mode, unlocking the phone" | VERIFIED `README.md:131-132` |
| On the phone without a Mac | Only with a **paid** team: a packet-tunnel extension runs the runner on the phone (iOS 17.4+), first pairing still by cable; a free team "does not let … sign network extensions" | VERIFIED `docs/guide.md:322-336` |
| Secure screens | Payment and banking apps hide from capture; it shows a wireframe of the tree instead | VERIFIED `docs/guide.md:308-311` |
| iPhone Mirroring | It **had** a Mirroring backend (ScreenCaptureKit capture + CGEvent injection on the Mac) and **removed it in v0.9** (PR #103, 2026-10-02: "Mirroring is gone … ≈ -9k lines"); earlier issues: input dropped (#29), "stuck at Connecting" (#17), "Connection Paused" detection | VERIFIED `docs/guide.md:195-196`, GitHub API issues #103, #29, #17 |
| Shortcuts | An experimental "iU Bridge" shortcut on the phone, triggered by the UI layer through Spotlight, posts JSON (battery, Health, HomeKit, App Intents) back to the Mac | VERIFIED `shortcuts/README.md:1-25` |

### 7.2 What Ducter would need for "use this iPhone"

- **Real driving (XCTest runner):** a Mac (Xcode is macOS-only), full Xcode, an Apple ID team,
  Developer Mode, a cable once, the phone unlocked during the task, and re-signing every 7 days on
  a free team (or $99/year). It's a developer's setup; a fresh user won't do it, and Ducter would
  have to write its own runner (no code from iphone-use). (INFERRED from §7.1.)
- **iPhone Mirroring + the Mac's computer use (cua-driver):** macOS 15+ with Apple silicon or T2,
  iOS 18+, same Apple Account with 2FA, Bluetooth and Wi-Fi on, the **iPhone locked and near the
  Mac**, one Mac and one iPhone at a time, no camera/mic (so no Face ID), **"currently unavailable
  in the European Union"** (DOCUMENTED support.apple.com/en-us/120421, 2026-10-14; EU status still
  so per macrumors.com 2025-06-18 and later reports). The mirrored window is a video: the Mac's
  accessibility tree sees the window, not the iPhone app's elements, so the agent works from pixels
  (INFERRED, and the reason iphone-use's backend used ScreenCaptureKit + CGEvent). The person can't
  use the phone while it's mirrored, and iphone-use dropped this path as unreliable.
- **Shortcuts / App Intents:** a narrow, honest path: the Ducter iPhone app exposes its own
  intents, and the person may add shortcuts Ducter can name. No general app control.

**Verdict.** Android's own-phone use is buildable well. iPhone isn't, for the person Ducter
serves: the full path needs Xcode, Developer Mode and weekly re-signing; Mirroring is pixel-only,
locked-phone, single-Mac and not in the EU. Offer it at most as a labelled experiment on a Mac
home ("通过 iPhone 镜像 / through iPhone Mirroring"), and say plainly elsewhere that iPhone can't be
used yet.

## Implications for Ducter

1. **Build the Android accessibility service** with `canRetrieveWindowContent`,
   `canPerformGestures`, `canTakeScreenshot`, `flagRetrieveInteractiveWindows | flagReportViewIds |
   flagIncludeNotImportantViews`, `flagInputMethodEditor` for fallback typing, **`isAccessibilityTool`
   false**. Read with the tree, type with `ACTION_SET_TEXT`, act with `dispatchGesture` and global
   actions, take a picture only when the tree isn't enough (≤ 3 a second). No MediaProjection.
2. **The indicator is a `TYPE_ACCESSIBILITY_OVERLAY` pill** ("Ducter 正在用这台手机 · 停 / Ducter is
   using this phone · Stop") plus a `specialUse` FGS notification with Stop. Stop calls
   `disableSelf()` if the design picks "off between tasks".
3. **Decide "off between tasks"** (banking apps may refuse while it's on) against "on but idle"
   (no re-enable step). Recommendation: off between tasks, re-enabled per task through the
   accessibility shortcut or tile, with the switch's state watched live through
   `AccessibilityManager`.
4. **The setup guide is §2.2**: on 13+ the person meets the block once, then App info › ⋮ › Allow
   restricted settings › screen lock, then Accessibility › Downloaded apps › Ducter › Use Ducter ›
   Allow. Ducter opens App info with `ACTION_APPLICATION_DETAILS_SETTINGS` and the list with
   `ACTION_ACCESSIBILITY_SETTINGS` and the highlight bundle; no public intent opens the detail page.
   Show the dialogs' real words, in the person's language.
5. **Refuse or hand over**, as Gemini and Pinky do: password fields (only dots anyway), payment
   and banking (black screens, data-sensitive views), sign-in and codes.
6. **Detect and say**: Advanced Protection on (Android 17) means this phone can't be used; a
   Samsung/other OEM without the ⋮ item gets the adb fallback in the builder docs only.
7. **iPhone**: not in v1. At most a labelled Mirroring experiment on a Mac home; never iphone-use code.
8. **Unverified, to check on a real Pixel before the guide ships**: the exact Pixel strings, the
   highlight extra, whether allowing survives a self-update on 15+, the tile/shortcut toggle for a
   sideloaded service, and tree-read times.

## Summary

Android's accessibility service gives Ducter everything it needs on the person's own phone: the
tree, gestures, back/home, CJK typing without a keyboard, screenshots without extra consent (one per
333 ms, black on secure windows), an overlay without `SYSTEM_ALERT_WINDOW`, and self-disable but no
self-enable. A browser-downloaded APK is restricted on Android 13–17; the person must meet the block
once, then allow restricted settings from App info's ⋮ menu behind the screen lock, then switch the
service on and accept "full control". The texts are in AOSP and listed above. Being honest
(`isAccessibilityTool` false) brings a system reminder, keeps sensitive views out of reach, and
leaves the phone unusable under Android 17's Advanced Protection. iPhone isn't buildable well:
iphone-use (PolyForm Shield, no code for us) needs Xcode, Developer Mode and weekly re-signing, and
Mirroring is pixel-only, locked-phone and unavailable in the EU.
