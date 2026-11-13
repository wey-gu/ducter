# 用手机 / Use a phone: Ducter's own phone

Decided in D217 (2026-11-12), a worker Mac's own phone in D234; evidence in [research/62](../research/62-phone-use.md). Calls (打电话)
are a different thing: [phone.md](phone.md).

## 1. Who, what they feel, how it starts

| | The consumer personal-AI user | The heavy developer | The fresh user |
|---|---|---|---|
| **Moment** | "帮我在小红书上看看…", "在美团上…": the app has no web version | "check our app's onboarding on Android", an app-only dashboard | browsing their Mac's card |
| **Before** | "it can only do the web" | an emulator they set up by hand, an agent with adb and no brakes | nothing |
| **After** | it has a phone of its own with their apps on it, and asks before it sends anything | a phone that starts in 6 s, every commit behind a Go | a phone appeared, no Android Studio, no Java |
| **First time** | the partner says in one line where to add it | **+ 用手机** on the Mac's card | the faded chip becomes **+ 用手机** |

North star: 好用 (one sheet, then it's there), 顺滑 (starts when needed, gone when not), 赏心悦目
(the phone in its own shape in D190's view), 放心 (blind in the user's turn, Go at the tap, money
apps out of reach), 惊喜 (a whole phone on the Mac).

## 2. The phone

- Google's platform-tools, emulator and the Android 16 Google Play arm64 image, pinned in
  `packages/core/src/android/sdk.ts` by version, size and SHA-1 (2.32 GB). Changing one is a
  deliberate change of all three numbers.
- Installed into `<dataDir>/phone/{sdk,home}`; every Android tool runs with `ANDROID_SDK_ROOT`,
  `ANDROID_USER_HOME`, `ANDROID_EMULATOR_HOME`, `ANDROID_AVD_HOME` there and adb on port 5137
  (`DUCTER_PHONE_ADB_PORT`). The user's own SDK, `~/.android` and adb are never touched. The
  emulator itself writes a discovery file under `~/Library/Caches/TemporaryItems/avd/running`
  while it runs (removed when it quits).
- One AVD, `ducter`: 720×1600 at 320 dpi, 3 GB RAM, 2 cores, 6 GB data, Play Store, quick boot.
- Apple Silicon Macs: the home, or a Mac that does tasks for a home elsewhere (D234, §10).
  Anywhere else the chip stays the D199 ghost, except on the home when a Mac has it on or is
  installing it: then **用手机 · 在 {Mac} 上**, which opens that Mac's card (D237).

## 3. Adding it

The install sheet (web `PhoneInstallSheet`, Mac `phoneInstallSheet`): the clay, **将「用手机」安装到
{device}**, one paragraph of what it is, four facts (download, space, what, when it's on), Google's
two licenses by name with **查看全文** opening the full text, the switch **我已阅读并同意这些许可协议**,
then **以后再说 · 安装**. The texts come from Google's repository XML when the sheet opens; the home
installs only when the accepted SHA-256s match the texts as they read then. Progress on the card:
a bar and **正在下载手机 n%**, **正在解压…**, **正在设置手机…**. Failures in plain words (space, a
download that didn't match, offline) with **再试一次**.

## 4. Running

Started by a task's first phone tool or an opened live view; held while a task that needs it works
or a view is open; stopped five minutes after the last use with `adb emu kill` (saves the
snapshot). Animations off. One phone per Mac (D234: the home's and each worker Mac's).

## 5. Tasks on the phone

- `needs.phone` puts a task on a computer with the phone (`no_phone` elsewhere); the brief gets
  `phoneBrief` (runner `brief.ts`); the ten `phone_*` tools are listed only for such a task.
  With no phone anywhere, the person's own phone is offered first (D247, [use-this-phone.md](use-this-phone.md) §3.1);
  no task ever asks the person for adb, debugging or a cable (every brief's `deviceRule`).
- `phone_look` numbers what can be tapped; a tappable row with no words is named by the words
  inside it ("Title · subtitle"); a screen uiautomator can't read comes back as a picture.
- Text: ASCII through `input text`; anything else through the emulator's clipboard (gRPC
  `setClipboard`, its token from its discovery file) and a paste, then the clipboard is emptied.

## 6. The gate and the turns

| What | Who | How |
|---|---|---|
| A tap whose words pay, buy, send, post, delete, install, call, confirm, sign out | the user's Go | `phone_ask_go` card; the Go covers one tap on that button in that app for 15 min, re-checked on screen |
| Banks, wallets, payment apps, password managers, authenticators | nobody | invisible and untouchable (`gate.ts`) |
| Password fields | the user | never read or typed |
| Signing in, codes, CAPTCHAs | the user | `phone_ask_user` card → live view in the user's turn → **完成** |
| Watching | anyone of the user's windows | the task's turn; **接手** makes it the user's, every task blind until **还给它** |

The partner doesn't ask before a send on the phone (persona rule 9): the phone asks at the tap.

## 7. The live view

D190's view for the phone: the same top bar (**Ducter 的手机**, whose task or which computer),
the band in the user's turn, the calm step line, **接手 / 还给它 / 关闭**. The screen in its
phone shape (rounded) on the sunken page; under it, in the user's turn, Android's three keys drawn
(返回 · 主屏幕 · 最近使用). Taps, drags as swipes, the wheel as a swipe, keys (Enter, Backspace,
Esc as back) and text. Frames: the device's own JPEG, one in flight until acked, ≤ 6/s, none while
still; out of sight, none.

It is one component with a small interface (computer, task or none, mode `watch | takeover |
signin`; out: the turn changing, closing): web `PhoneLivePanel` (mounted full screen by
`PhoneLiveSheet`; `embedded` in the workbench), Mac `phoneView` (its body, `phoneBody`, is drawn by
the workbench too). D220: the opened task's **查看手机** opens its workbench at the 手机 / Phone
page, where the live view watches the task while the page is shown; the full-screen sheet stays
for the device card, a card's own turn, and a task without a workbench.

## 8. Its data

The phone's apps, sign-ins and data live only in `<dataDir>/phone/home/avd`. **抹掉这台手机** in
用手机's ⓘ deletes them and leaves a fresh phone. Removing everything is deleting `<dataDir>/phone`.

## 9. Next

- Linux servers (KVM, x86_64 images).
- The real install and a real errand on a worker Mac through a server home (built with fakes, §10).
- The person's own Android phone is D238's 用这台手机 / Use this phone ([use-this-phone.md](use-this-phone.md));
  iPhones are not offered (its §8).
- Autofill on the phone (D191's fills by reference, into app fields).
- A faster screen reader (an accessibility companion, ~70 ms) and video frames (scrcpy) for games.

## 10. On a worker Mac (D234)

The most common shape: the home is a server (hel) and the person's MacBook does tasks for it.

- **The phone is that Mac's own.** The worker on an Apple Silicon Mac makes the same phone host
  as the home (`android/host.ts`): the SDK and the phone in `<worker dataDir>/phone`, its installs
  and erase. 用手机 rides in its hello and abilities frames (install progress at most once a
  second). A Ducter there from before says nothing: its card has no phone chip until it is
  updated.
- **Adding it** is the same sheet on that Mac's card; `phone_terms` / `phone_install` /
  `phone_erase` with its id go over the worker's socket, so Google's texts are read and checked
  there.
- **A task that needs the phone** runs on a computer that has it (`no_phone` elsewhere, D157).
- **The tools, the gate and the live view stay on the home**, driving that Mac's phone over the
  socket (`android/remote.ts`): one `phone_dev` request per device method, from a fixed set
  (`state, ensure, touch, hold, release, stop, jpeg, screen, tap, swipe, key, text, front, apps,
  launch, size`); key codes and app ids checked there; never a shell or adb from the home. The
  phone a tool uses is the one on the task's computer (`place.device`).
- **Turns are per phone**: each Mac's phone has its own live view; the person's turn on the
  MacBook's phone blinds only the tasks on it. **查看手机** and a card's own turn open the phone the
  task uses (`phoning.device`).
- **The socket gone**, the worker lets go of every hold the home had; the phone stops when idle.
