# 用这台手机 / Use this phone: a task borrows the person's own phone

Decided in D238 (2026-11-13), the first-time card in D247, which phone in D251, the loan's life in D253, the native link and recording in D255, the person's turn to allow a recording, the loan's end said to the task, a screen that stays on and tests that need the person in D280, the link outside a loan, a Go on a locked phone and a lock that pauses in D331; asking again after Stop once the person writes, the paused line in the task's head, where a phone task says it works and Smart Lock in D339; evidence in [research/74](../research/74-own-phone-use.md) and [research/119](../research/119-phone-link-background.md).
Ducter's own Android phone on a Mac is a different thing: [phone-use.md](phone-use.md) (用手机 / Use
a phone). Calls are [phone.md](phone.md). Tasks in the person's Mac apps: [computer-use.md](computer-use.md).

## 1. Who, what they feel, how it starts

| | The consumer personal-AI user | The heavy developer | The fresh user |
|---|---|---|---|
| **Moment** | "帮我在美团上点一份老样子", "在微信里回妈妈：周六见": the app is on their phone, signed in | "check our app's onboarding on my Pixel", an app-only dashboard on the phone in their hand | opening their phone's card in Ducter |
| **Before** | "it can only do the web"; Ducter's phone would need every app installed and signed in again | adb, a cable, an agent with no brakes on a real phone | nothing |
| **After** | the task borrows the phone they already use, asks first, shows it is using it at the top, asks again before it sends or pays, and gives it back the moment they say | a real device, behind the same gate and Go as everything else | one chip, a one-minute guide that shows exactly where to tap, and a short demo of what a loan looks like |
| **First time** | they just ask; the task's card says **在你的 {phone} 上打开「用这台手机」** and one tap opens the guide on that phone (D247, §3.1) | **+ 用这台手机** on the Pixel's own card, or the same card | the chip, the guide, the demo |

North star: 好用 (one chip, one switch, once), 顺滑 (each step opens the right page and comes back by
itself), 赏心悦目 (the guide draws Android's own pages in clay with a fingertip; the pill is Pebble),
放心 (asked every time, shown the whole time, Go at the effect, money and keys out of reach, Stop
in the hand), 惊喜 (it really uses their phone, and they can watch every tap land).

## 2. How it works

- **The phone's side** (`apps/android`, `Handset.kt`): an Android accessibility service in the
  Ducter app. Switched on once in Android's settings; from then on bound by the system but it
  reads and does nothing outside a **loan** the home started. It answers a fixed set of calls
  (`HandsetMethod`: state, start, doing, stop, off, beat (D253), screen, jpeg, tap, swipe, key, text, front,
  apps, launch, size); every one but state/start/stop/off refuses outside the loan it names.
  - The screen goes back in uiautomator's XML shape (`HandsetTree.kt`), so the home reads it with
    the same parser as Ducter's phone. A password field's text is never sent, only that it is one.
  - Typing is `ACTION_SET_TEXT` on the field in focus: any language, no keyboard switch.
  - Taps and swipes are `dispatchGesture`; back, home and recents are global actions; Enter is
    the field's own Enter (Android 11+); only those five keys.
  - Pictures of the screen are the accessibility screenshot (Android 11+, no extra consent; a
    protected window gives none). Never MediaProjection for pictures (research/74 §3); a recording
    the task asks for is (§11, D255).
- **The link, outside a loan (D331),** is the app's own too: while Android's switch for Ducter is on
  and the phone is paired, `HandsetLinkService` holds its WebSocket to the home, lent or not, so a Go
  reaches the phone with Ducter closed or in the background. On hel (task vrxcdgr9) the person
  tapped Go at 04:29 with Ducter closed and nothing happened for an hour, because outside a loan the
  only link was the page in the web view, which Android pauses. It starts when the accessibility
  service connects, when the page says hello, on screen-on and unlock (`ACTION_SCREEN_ON`,
  `ACTION_USER_PRESENT`), and with a loan; its token is the page's, else the copy the app keeps for
  the device (D293), so it comes up after a reboot. Not lent, its notification is a quiet **用这台手机开着
  / Use this phone is on** (IMPORTANCE_MIN, its own channel the person may hide); retries back off
  to a minute (lent: 8 s), the screen or the unlock retries at once, a ping every 30 s finds a dead
  link while awake; a home that refuses the device (401/403) stops it, and it goes with the switch.
  What Android allows and costs: research/119 (no FCM: it is a self-hosted home's only wake path;
  in deep Doze it reaches a still, locked phone only as far as a foreground service's socket gets
  through, and Battery › Unrestricted makes it sure). The page still says hello, relays and passes on
  停下 (an app before bridge 4 has only it); the guide opens only in the page.
- **The link, while lent (D255),** is the app's own: the loan's start starts (D331: or finds) a foreground service
  (`HandsetLink.kt`, its notification the loan's, **{name} 正在用这台手机** with 停下) that holds its
  own WebSocket to the home (the device's token from the page's hello, in memory only), says
  `hello` as `client: "handset"` and `handset_hello` with `link: "native"`, answers the home's calls
  itself, and reconnects with backoff (0.5 to 8 s, inside the 15 s rule). On hel the loan died a
  minute after the task opened Chrome because the page carried it, and Android pauses a page (or
  drops its socket) with Ducter in the background. The home prefers this link and keeps the page's
  as the fallback (used at once when this one drops). Type `specialUse` on Android 14+ (no other
  fits: connectedDevice is for Bluetooth, USB or NFC peripherals, dataSync is time-limited on
  Android 15+), plus `mediaProjection` while recording; Android lets it start from the background
  because the bound accessibility service keeps Ducter at BFGS (seen on the emulator). Doze never
  sets in while lent: the screen stays on (§4.2). When the loan ends (after a recording in flight has
  been sent) the service goes back to standby (D331), or goes when the switch is off.
- **The home's side** (`packages/core/src/handset/`): which phone a phone task uses, the loan, and a
  `PhoneDevice` that speaks to that phone. The phone tools, the gate at the effect, the blocked
  apps and the blind rule are the same code as Ducter's phone (`android/tools.ts`, `gate.ts`).

## 3. Which phone a phone task uses

**Added means Android's switch is on** (fixed 2026-11-13, 0.0.49): the home adds the phone as soon as its app reports the switch on, however it got on (an earlier version, Android's Settings, the guide closed); before, only the switch turning on while the guide was open added it, so the author's Pixel, switched on in 0.0.44, was never added and phone work fell to Ducter's own phone. Taking 用这台手机 off on its card is remembered: a switch still on doesn't add it back by itself.

**The work says which phone (D251).** `needs.phone` is `"mine"` (the person's own: their apps,
accounts, messages; 用我的手机, 我的微信, "on my Pixel"), `"ducter"` (Ducter's own clean phone: 在安卓上试我们的
App, an APK, a fresh phone) or `"any"` (either; `true` from before D251 means the same). The partner
picks; unsure, mine (a wrong mine costs one card, a wrong ducter does the work in accounts that
aren't theirs).

| `needs.phone` | Their phone added | Their Android app connected, not added | Neither |
|---|---|---|---|
| `"mine"` | it (the loan, §4) | it, with the setup card (§3.1), **even where Ducter's phone could do it** | nothing opens: `MINE_NO_PHONE` (install Ducter on their Android phone; Ducter's phone only as a question, when the work needs none of their accounts) |
| `"ducter"` | Ducter's phone (never theirs) | Ducter's phone | Ducter's phone; none anywhere: `DUCTER_NO_PHONE` (用手机 on a Mac) |
| `"any"` / `true` | it | Ducter's phone where it runs; none: the setup card (D247) | Ducter's phone; none: `noPhoneLine` (D247) |

A `"mine"` task never falls back to Ducter's phone: its phone is bound for the task's life; with
none of theirs reachable its tools say so (`HANDSET_MINE_NONE`) and it reports blocked. **先不用 /
Not now** (or **不借**) on a `"mine"` task: `HANDSET_MINE_NO`, no phone of theirs, report blocked; it
may ask, waiting as the default, whether Ducter's phone would do when the work needs none of their
accounts, and never switches by itself. The task knows which phone it has: the brief's phone
section opens with it (`phoneBrief` in `packages/runner/src/brief.ts`), and every `phone_look`
starts with **Phone: {Pixel Fold}, the user's own phone…** or **Phone: Ducter's own phone, an
Android emulator on {Mac}. It is not the user's own phone…**.

For `"any"`, a phone task uses **the person's own phone when one is added** (its apps and sign-ins are
theirs); Ducter's phone on its computer otherwise. Bound at the task's first phone tool, for the
task's life. With a phone added, phone work may run on any computer (`loadout.ts`): the tools drive
the phone from the home wherever the task runs. Several phones added: the one connected most
recently.

### 3.1 When it isn't on yet (D247)

A phone task never reaches the person's phone by its own means: every task's brief says never to
ask for USB or wireless debugging, a cable or Developer options, and never to run adb against
their phone (`deviceRule` in `packages/runner/src/brief.ts`); without phone tools it reports
blocked. The partner sets `needs.phone` for any work on a phone, set up or not.

| Moment | What happens |
|---|---|
| No phone can serve it (none added, no Ducter's phone where it runs), or the work is `"mine"` (D251), the person's Android app connected | the task opens and binds that phone; its first phone tool posts one card, **「{task}」要用你的 {phone} / "{task}" needs your {phone}** · **在你的 {phone} 上打开「用这台手机」… / Turn on Use this phone on your {phone}…** · **先不用 / Not now** · **去打开 / Turn it on**; no default; the task ends its turn |
| Turn it on, from any window | Android's switch already on: added at once. Otherwise the home sends `handset_guide` to that phone's page and the guide (§6) opens there; the app isn't open: when it next connects |
| The guide finishes (the chip is added) | the loan starts for that task with no second card (the tap on its card was the yes); **在你的 {phone} 上打开了 / Opened on your {phone}** |
| Not now | the task carries on without a phone; its phone tools refuse (**没用手机 / No phone**); `"mine"`: it reports blocked, never another phone by itself (D251) |
| No Android app connected | nothing opens; the partner says one line: open Ducter on {phone} (paired, not open), update it (too old), or install Ducter on the Android phone and add 用这台手机 there (or 用手机 on a Mac) |

## 4. The loan

| Moment | What happens |
|---|---|
| A task's first phone tool | one card, **「{task}」想借你的 {phone} 用一会儿 / "{task}" wants to borrow your {phone}**, with what it will do; **不借 / Not now** · **借给它 / Lend it**; no default ever (silence never lends a phone); the task is told to end its turn |
| The phone isn't connected | the card says so (**现在连不上 {phone}：借给它以后，手机连上就开始。**); a Go waits, and the loan starts when the app's own link connects (D331: it is up whenever the switch is on, so with Ducter closed too); meanwhile the tools and the opened task say it as it stands (§4.5) |
| Go, the phone locked (D331) | never through the lock: the phone shows **解锁后，「{task}」就开始** with **不借了**, and the loan starts on unlock (§4.5) |
| Go | the home starts the loan on the phone: the pill appears, the task is told "you may use {phone} now", and works |
| Not now | the task is told no, and its phone tools refuse until the person writes to the task again (D339): then its next phone tool asks with one new card |
| A send, payment, delete… | `phone_ask_go`: the card says **在你的 {phone} 上** and what it taps; one Go, one tap |
| The person's own step (a sign-in, a code) | `phone_ask_user`: **在你的 {phone} 上自己来，这时它什么都看不到。做完点「好了」。** The pill says **轮到你了**; every tool is blind until **好了 / Done** |
| The task stops working | the loan ends; the pill goes; the task's page shows **它把 {phone} 还给你了 · {time}** (D280: a hairline only, never a turn that wakes a finished task) |
| The task is done with the phone but still working | `phone_give_back` (D280): the loan ends now, and the tool answers once the phone has let go, so the task can say it is the person's again; its next phone tool asks with a new card |
| **停下 / Stop** from any window, on the pill or in the notification | the loan ends at once, the task's turn is interrupted, it is told, and its phone tools refuse; D339: once the person writes to the task (any message of their own), its next phone tool asks with one new card. The task never asks again on its own, and Ducter's or the partner's words never count |
| The person locks the phone | **locking pauses it** (D331, superseding D253's "locking gives it back"): nothing runs; after the unlock the phone asks **继续借给它 / 不借了**; 30 minutes paused ends it (§4.5) |
| The screen times out (D280) | not a lock: the loan holds and the app turns the screen back on (§4.2) |
| Android's switch goes off, or 用这台手机 is removed | as Stop, for the rest of the task |
| The phone stops answering | its tools say so at once; 15 s later the loan ends as lost (§4.1) |
| Another task wants the phone | it waits: one loan at a time |

### 4.1 The loan's life (D253)

A **yes is for one loan.** The person's Go on the card starts one loan; every way a loan ends spends
it, ends it on both sides, is said to the task once with why, and never comes back by itself.

| The loan ends because | On the phone | On the home | The task |
|---|---|---|---|
| **停下 / Stop** (any window, the pill, the notification) | pill and notification go at once | ended; a moot card (the person's turn, an open ask) closes as not answered | interrupted, told; its tools refuse until the person writes to the task, then one new card (D339) |
| **Android's switch goes off**, or the chip turned off (**不借了**, D398) | the service ends it (**service**) | ended | told; never again in this task |
| **The person locks it** (the screen goes off and the lock screen is up 1.5 s later, D280) | D331: the app pauses it (`paused`), the pill goes, the loan's notification says **「{task}」暂停了** with Stop | paused; no quiet or lost rule while paused | told once that it is paused; its tools say so; on unlock the phone asks, and Keep lending carries on (told **answers again and is still lent**) (§4.5). An app before bridge 4 still ends it (**locked**) |
| **不借了 / Not now** on the phone after the unlock, or on a Go waiting for the unlock (D331) | the notification goes | ended (**taken**) | told the person chose Not now; its next tool asks with one new card |
| **Paused 30 minutes** (D331) | the app ends it (**expired**) | ended | told; its next tool asks with one new card |
| **The screen times out** (off, no lock screen 1.5 s later; D280) | the loan holds, `asleep` in its hello; the app wakes the screen once | holds; tools say the screen went off by itself and send nothing | told when it is on again (**phone_look first**) |
| **The phone goes quiet** (no answer to the beat for 6 s) | — | **暂时没回应 / isn't answering** on the opened task and the phone's card; every tool says so at once, nothing is sent | told when it answers again: **phone_look first** |
| **Quiet for 15 s**, or its page gone for 3 s with no link of its own (D255: its own link gone falls back to the page, else the 15 s rule) | the app ends it itself after 15 s with no word from the home (**lost**, or **network** when its own link was down) | ended | told it was lost and why (D255: as precisely as known), told again when the phone is back (only on a later hello that answers); the next tool asks again |
| **The task stops working** | the home ends it | ended | — |

- **The beat.** While lent, the home calls the phone every 3 s; the app ends a loan it has heard
  nothing about for 15 s. Both sides converge within 15 s whatever broke (a network change, the
  app killed, a page Android paused), and a phone that comes back still showing an old loan is told
  to end it.
- **Never a late step.** Every call carries its deadline in the home's time; the app refuses a tap,
  swipe, key, text or launch that arrives after it, so a page that wakes with queued steps never
  runs them after the person has taken the phone back.
- **Announced only when it works.** The task hears **you may use {phone} now** only after the
  start and a first read have both answered; a start that answers after Stop, after the task
  stopped, or after its deadline lends nothing (the home also stops it there).
- **Why, when it can be known.** The app says whether the screen is on, the phone is locked, and
  whether Android restricts Ducter in the background; a tool that can't reach it says which, or says
  it doesn't know with the likely causes, and one next step: end the turn, a message follows.
- **Why it was lost, precisely (D255).** The app says its run (`boot`), its own link's generation
  (`gen`) and why it ended a loan: **network** (its own link had been up and couldn't reach the home
  for 15 s), **lost** (no beat), locked, stop, service. The home says the cause in words: the phone's
  network; Android closed the app (a hello from a new run that holds no loan); the page paused (an
  app without its own link); the app's connection gone; quiet.
- **Said once, "back" only when it is (D255).** A loss that a hello reports is said once, as ended
  with the app answering again now, and no "back" follows it (on hel "lost" and "back" came 3 ms
  apart from one hello). Otherwise "back" is said only on a later hello, after the phone answered a
  call. The next tool repeats a loss only within 2 minutes; later it just asks with a new card (on hel
  the next tool, six hours later, said the old loss again and the task gave up).
- **The screen stays on while lent** (§4.2), so the phone never locks itself while the task
  thinks; only the person's own lock pauses it (D331).
- **States kept apart:** whether the task has the person's yes (a loan, or a card asking), whether
  the phone holds the loan (its pill), whether it is answering now (quiet or not), and whose turn it
  is. The opened task and the phone's card show the loan and, when quiet, **暂时没回应**.

### 4.2 The screen stays on, and a timeout is not a lock (D280)

On the author's Pixel Fold the screen went dark during an idle loan. Two holds now keep it on, each
enough alone:

- **The pill's window** carries `FLAG_KEEP_SCREEN_ON` (D253). AOSP honours it for any window type,
  an accessibility overlay included (no type check; the flags `NOT_FOCUSABLE` / `NOT_TOUCHABLE`
  don't matter), but only while that window has a drawn surface that no full-screen opaque window
  above it covers (`DisplayContent.applySurfaceChangesTransaction`; an accessibility overlay is
  layer 31, above the keyguard and the shade). It lapses silently whenever the pill isn't drawn.
- **The app's own hold** (`HandsetAwake.kt`): a `SCREEN_BRIGHT_WAKE_LOCK | ON_AFTER_RELEASE` for
  exactly the loan's life. The level is deprecated in favour of the window flag *for apps with an
  activity in front*; an accessibility service has none. PowerManagerService still honours it (it is
  the lock WindowManager itself takes for the flag) and refuses it only to a cached process, which a
  bound accessibility service with a foreground service never is. Never `ACQUIRE_CAUSES_WAKEUP` on it.

If the screen goes off anyway, the app tells the person's lock from a timeout by the lock screen
1.5 s later: Android's keyguard comes at once for the power key ("Power button instantly locks", on
by default, or no secure lock) but for a timeout only after "Lock after screen timeout" (5 s by
default, `KEYGUARD_LOCK_AFTER_DELAY_DEFAULT` in SystemUI). Lock screen up: the person's lock, the
loan pauses (D331, §4.5; before it ended, **locked**). Not up: a timeout, the loan holds (`asleep`), and the app turns the screen
back on once (`ACQUIRE_CAUSES_WAKEUP`, with `TURN_SCREEN_ON` declared) before the lock delay ends. A
second screen-off within 2 minutes of that wake is the person's. Nothing runs while the screen is
off. Limits: with "Lock after screen timeout" set to *Immediately*, a timeout looks like a lock and
ends the loan (as before); with "Power button instantly locks" off, the person's power key looks
like a timeout once and the screen comes back, and the second press ends it.

### 4.3 The task always knows how the loan stands (D280)

At the end of the author's run the task wrote "借用是否结束还没确认". Now every end is said to the
task in one line that starts **Your loan of {phone} ended:** and says the phone was returned (Stop,
Not now on the phone or a pause past 30 minutes (D331; a lock, from an app before bridge 4), Android's switch, Remove, lost); its phone tools answer the same words afterwards (after
Stop until the person writes to the task (D339), Android's switch and Remove for the rest of the task; after a lock (an app before bridge 4), Not now on the phone, a 30-minute pause or a loss once, then a new
card). The task ending is never told (it would wake a finished task) but logged as Ducter's own line;
`phone_give_back` ends a loan the task no longer needs and answers once the phone has let go. Each
is a hairline in the opened task (D271's `told`): **你收回了 {phone} · {time}**, **它把 {phone}
还给你了 · {time}**, **{phone} 断开了，借用结束了 · {time}**. The brief says it always knows, so it
never writes that it isn't sure.

### 4.4 Tests that take the phone away (D280)

Locking the phone, airplane mode or Wi-Fi off, swiping Ducter away from recents, restarting: a task
never does these itself (it would lose the phone mid-step; the switches wait for Go anyway). The
brief and `phone_ask_user`'s description say: ask the person with `phone_ask_user`, `what` giving
the exact steps in their language ("按一下电源键锁屏，10 秒后再解锁"), end the turn, then report what
it saw (the message that came, what `phone_look` shows, whether and how the loan ended), never what
it expected. A step that ends the loan needs a new card before the next; a lock (D331) only pauses
it, and the person's Keep lending on the phone carries on.


### 4.5 With Ducter closed, a Go on a locked phone, and a lock that pauses (D331)

**Who and how it feels.** The consumer taps 借给它 on their Mac with the Pixel in a pocket: before, an
hour of nothing until they happened to open Ducter there, while the task said a card was still
asking; now the loan starts with Ducter closed, or the phone says on its lock screen that it starts
when they unlock (放心: never through the lock; 顺滑: Go is enough). The developer locks the phone to
test something: before, the lock gave it back and a new card asked; now the loan pauses and the phone
asks once, after the unlock (好用: one tap there, no new card).

**Where a loan stands, said the same everywhere** (`HandsetWait`, `HandsetAway`; the tool's words in
`packages/core/src/handset/index.ts`, the opened task's line on the web and the Mac, the resolved card's
**借给它了，还没开始 / Lent, not started yet**):

| State | Tool words start | Opened task | Button |
|---|---|---|---|
| the card asking | **Waiting for the user to answer the card asking to lend you {phone}.** | (the card) | |
| Go, the phone locked (`unlock`) | **The user said yes … and it is locked: the loan starts by itself when they unlock it** | **借给它了：解锁你的 {phone} 就开始 / Lent: starts when you unlock your {phone}** | **不借了 / Not now** |
| Go, the phone out of reach (`away`) | **The user said yes … but the home can't reach it right now ({why})** | **借给它了：现在连不上你的 {phone}，连上就开始** with why under it | **不借了** |
| Go, starting (`starting`) | **… the loan is starting on it now** | **借给它了：正在你的 {phone} 上开始** | **不借了** |
| lent | (works) | **正在用你的 {phone}** | **停下** |
| paused, locked | **{phone} is locked, so your loan is paused** | **暂停了：你的 {phone} 锁着** · **它什么都不做。解锁以后，在手机上点「继续借给它」才接着用。** | **停下** |
| paused, asking after the unlock | **{phone} is unlocked, and the phone is asking the user whether to keep lending it** | **在你的 {phone} 上问你：继续借给它吗？** | **停下** |

Why it can't be reached, as far as the home knows (`awayOf`, from what the phone last said, kept after
its link goes): **limited** (Android restricts Ducter in the background: **在应用信息里把 Ducter 的「电池」设为「无限制」**),
**old** (its Ducter is from before bridge 4 and is reachable only while open: open it or update),
**offline** (its own link dropped: no network, or Android closed Ducter), **unknown** (never heard
since the home started). Never a guess beyond that.

**A Go on a locked phone.** The home's `start` meets a locked phone: the app keeps it as `waiting`
(said in its hello), shows **解锁后，「{task}」就开始 / "{task}" starts when you unlock** with **你点了「借给它」。解锁这台手机就开始，用的时候顶上一直显示。**
and **不借了 / Not now** (channel **借用这台手机**, high importance; on the lock screen only **解锁后，Ducter 就开始用这台手机**:
a task's title is the person's, never shown to whoever holds the phone), and answers `locked:`; the
home keeps the Go (no stop) and starts the loan on the hello that `ACTION_USER_PRESENT` sends. Not now
there ends it as **taken** (over the link, or in the next hello).

**A lock that pauses.** The watch (§4.2) sees the person's lock and pauses: the pill and the screen hold
go, nothing runs (every call but beat and `record_stop` refuses), the loan's notification says
**「{task}」暂停了 / "{task}" is paused** · **你锁屏了，它什么都不做。解锁以后，由你决定要不要它接着用。**, Stop still in it. No
beat is needed while paused, on either side. On unlock the phone asks **还借给「{task}」吗？** ·
**你锁屏时它停下了。继续借给它，就从停下的地方接着做；不借了，手机就回到你手里。** with **不借了** and **继续借给它**; it never
resumes by itself, and swiping the notification away leaves it paused. A refresh from the home (the
person's turn, Done) keeps it paused. **The cap is 30 minutes** (`PAUSE_MAX_MS`, both sides): the yes
was for a while; short pauses are minutes; past half an hour an old yes coming back is a surprise and a
new card costs one tap. The task ending ends it too; Stop gives it back at once.

## 5. The indicator (research/74 §8.1)

A small clay pill sitting in the status bar over every app (an accessibility overlay: no "draw
over other apps" permission, never in the screen it reads): the partner's face, breathing; **{name}
正在用这台手机 / {name} is using this phone**; under it what it is doing now (**在看屏幕**, **点「发送」**,
**在「{field}」里打字**); and **停下 / Stop** on its ledge. Each tap shows as a soft accent ring where
it lands. In the person's turn: **轮到你了 / Your turn on this phone** · **做完以后，在卡片上点「好了」**,
its border in accent; while Android asks to record (D280) **轮到你：点「立即开始」 / Your turn: tap
Start now** · **安卓在问能不能录屏 / Android is asking to record the screen**, the same rim. It settles in from the top edge with a small overshoot; with animations off it
just appears.

## 6. Turning it on (the guide, research/74 §8.2)

Only on the phone itself (Android's switch is there). The chip on that phone's own card: **+ 用这台
手机**. One sheet, **让任务能借用这台手机 / Let tasks borrow this phone**: one paragraph, then the steps,
each a clay miniature of Android's own page with Android's own words and a fingertip where to tap,
**去设置 / Open settings** opening the right page, and the step ticking itself when it is done:

1. **允许受限制的设置 / Allow restricted settings** (D246), only where Android restricts a
   sideloaded Ducter (Android 13+, an APK from a download, research/74 §2). Android shows the Allow
   item only after the person has met its block once, so the step has two parts, listed under it and
   ticked in turn: **在「无障碍」里碰一下 Ducter** (Accessibility › the grey Ducter row › Android's
   block, **关闭 / 确定**) and **在应用信息里允许** (App info › ⋮ › **允许受限制的设置**, then the
   screen lock).
2. **打开 Ducter / Turn on Ducter** (Accessibility › Ducter › **使用 Ducter** › **允许**); it opens only
   once step 1 is done. The moment the service connects, the app brings itself back to the front.
   Where the app can't tell whether Allow was chosen, it carries **「Ducter」还是灰的？回到第 1 步**.

Then the chip is on, and the sheet becomes **好了，这台手机能借给任务了**: a small clay phone that loops a
loan (the pill settling in, a tap's ring, a Go card, Stop pressed) beside four lines: 先问你 · 顶上
一直显示 · 发送付款再等 Go · 随时停下. **知道了**.

Pages Ducter can open: App info, and the Accessibility list scrolled to Ducter's row (Android has no
public way to open the service's own page). What the app knows of restricted settings (D246): none
on Android 12 or older, for a store install, or once its switch has been on on this install; likely
for an APK from a download; the app op where Android lets it read it (Android 16 doesn't). Otherwise
the guide shows both steps, moves on by the person's visits, and step 1 says what to do if Android
lets the switch on straight away.

Once the switch is on and the app is back, Android asks once whether Ducter may show notifications
(D246): the loan's notification, **{name} 正在用这台手机** with **停下**, is the second place for Stop.

## 7. On the card

- On the phone itself: **+ 用这台手机** (the guide); on; failed when Android's switch went off
  (**安卓里 Ducter 的开关关掉了。再打开一次就好。** · **再打开开关**).
- From another window (D398): **用这台手机** is the phone's chip. On while added: a tap asks
  **以后不借给任务了？** · **留着** · **不借了** (also turns Android's switch off on the phone: a service
  may turn itself off, never on; D238's **移除** retired); can't reach: the failed tint and why;
  not added: dashed, its ⓘ **在 {phone} 的 Ducter 里加上：安卓要你在手机上亲手开一个开关。**
- D398: under the chip, while lent, **「{task}」正在用这台手机** with **停下** (primary); once added,
  what it can and can't touch as two plain sentences in a soft tray, no marks (D420):
  **只在借出去时看屏幕、点、打字，发送、付款、删除先等你点 Go。银行、钱包、密码、验证器它都碰不到。**
- The opened task: **正在用你的 {phone} / On your {phone}** · **停下**; D331: paused, asking on the phone, or a Go waiting (for the unlock, out of reach and why, starting), each its own line with **不借了** before the loan is on (§4.5). D339: a calm row in the task's head (the line, the line under it, the button), never in the window's title bar.
- D339: the task's head says where it works, **在你的 {phone} 上 / on your {phone}**, once the task asked for the person's phone (the ask in its stream, or the loan on its card), in place of the computer and its browser; 看它上网 / Watch it browse (the header and the workbench) only once it opened a page in Ducter's browser.
- D339, as D398 shows it: lending it while not holding it is an optional row, **锁屏时也能借给任务 ›**, opening in place to three steps (search Settings for **延长解锁**, **Smart Lock** on some phones; confirm the screen lock when Android asks; turn on **随身检测 / On-body detection** or **可信地点 / Trusted places**) and **锁屏密码只给安卓，Ducter 从来不要。**

## 8. Not here (and why)

- **iPhone:** not offered (research/74 §7). iOS gives no app a way to use other apps; the paths that
  exist need Xcode, Developer Mode and re-signing every 7 days on a Mac within reach (XCTest), or
  read only pixels through iPhone Mirroring (the phone locked, one Mac, not in the EU). An iPhone's
  card shows no chip and no "coming later".
- **Android 17 Advanced Protection** turns off non-tool accessibility services: such a phone can't be
  lent (research/74 §5); the chip says Android's switch is off.
- **Banking apps that refuse to run beside an accessibility service**: removing the chip turns the
  switch off (research/74 §1).
- **The phone's PIN** (D339, rejected): Ducter never asks for, stores or types the screen lock. The PIN
  guards everything on the phone (banking, mail, the passwords it keeps); locking is the person's own
  Stop (D331 pauses on it), and a lock Ducter could open would take that away; and Google Play's
  accessibility policy forbids an accessibility service that gets around Android's built-in security
  (DOCUMENTED, research/74 §1; not re-checked for D339). To lend it while not holding it, the person
  turns on Android's own Smart Lock (Settings › Security; Extend Unlock on newer Pixels), one line in
  ⓘ (§7). Whether a screen that timed out under Smart Lock wakes past the lock screen for a task is
  INFERRED from Android's trust agents; the live check is in `todo.md`.
- **Android's own screen recorder for a task** (D255 supersedes D253's card): Ducter records the
  screen itself (§11); the brief says never to ask the person to start Android's recorder, and the
  recorder's tile, chip and Stop wait for Go (§9). On hel the recordings the person started stopped
  at the task's `phone_open_app` both times; not reproduced on the emulator (a single-app recording
  kept going when Chrome opened), so the cause is the Pixel's recorder or the person's hand, not a
  tap of ours.
- **Sound in a recording, and a recorder on Ducter's own phone**: not yet (`todo.md`).

## 9. The gate on the phone's own switches (D253)

In quick settings and Settings, a tap on a switch that cuts the phone off or changes what it shares
(Wi-Fi, Bluetooth, airplane mode, mobile data, hotspot, location, NFC, VPN, Do not disturb) waits for
the person's Go like a send (`toggleOf` in `android/gate.ts`): by its name in quick settings (a tile
flips on one tap), only on the switch itself in Settings (a row of that name only opens its page). A
tap there at a place with nothing named is refused: only by [number]. On hel a task looking for the
screen recorder tapped the Wi-Fi tile and turned it on. D255: in System UI the screen recorder's
tile, its status-bar chip and its Stop (recording or sharing) wait for Go the same way (`record`),
and a tap on Android's dialog asking whether the screen may be recorded or shared is refused: only
the person answers it.

## 10. Every step says which phone (D253)

A task's phone is bound at its first phone tool for its life, Ducter's phone as much as the person's:
it never moves to the other one (on hel a task began on the emulator and went on on the Pixel once
it was added). Besides `phone_look`'s first line, every step's answer ends with which phone it ran
on (**on Pixel Fold, the user's own phone** / **on Ducter's own phone (an emulator, not the user's)**).
D255: `phone_open_app` says **opened; it is in front** only once that app is in front (within 3 s);
otherwise it says what is in front and not to take it as opened (on hel it said "Opened
com.android.chrome" twice while the recorder's preview, then the home screen, was in front).

## 11. Ducter records the screen (D255)

| Moment | What happens |
|---|---|
| `phone_record_start` (in a loan) | Android's own dialog opens over the app in front (**要与"Ducter"共享屏幕吗？ · 共享整个屏幕 · 共享屏幕 / Share your screen with Ducter?**, Android's words); on Android 14+ it offers the whole screen only, so opening another app never ends or blanks the recording. The dialog shows only on the phone, so it is **the person's turn** (D280, D248's pattern): one card in every window, **在 {phone} 上点「立即开始」，它才能录屏 / Tap Start now on {phone} so it can record the screen**, with **还剩 {m:ss}** counting down the 2 minutes and one button, **不录了 / Skip recording** (no Go: only the phone answers); the Mac notifies when its window isn't in front, phones get a push; the pill says **轮到你：点「立即开始」 / Your turn: tap Start now** over **安卓在问能不能录屏**, with the accent rim, and the loan's notification the same. The task is blind until the person answers, and its tap on the dialog is refused. The card resolves by itself when the phone answers (**开始录了**), gives up after 2 minutes (**手机上没点，这次没录**; the home gives up too if the phone never says), or the loan ends; **不录了** closes Android's dialog on the phone and the task hears it once |
| The person allows it | it records: H.264, long edge ≤ 1280, 1.5 Mbit/s, no sound, at most 8 minutes; the pill shows a red dot and **在录屏 / Recording the screen**, the notification too; the task hears **Recording … now** |
| The person says no | the task hears it once and doesn't ask again by itself |
| `phone_record_stop` | the app stops it, saves it in the phone's Movies/Ducter (in Photos), and sends it to the home (`POST /api/handset/recording`, that phone's token, a recording the home asked for); the pill says **在把录屏发回 Ducter / Sending the recording to Ducter**. The home checks it (an MP4 by its header, the size the phone said, its length from the movie header) and keeps it in the task's evidence; only then the tool says **saved and checked** with length, size and path for the report's `show` (videos up to 100 MB play in the file viewer) |
| The loan ends while recording (Stop, Not now, lost; a lock pauses it, D331, and the recording runs on) | it stops cleanly; what was recorded is kept, sent and marked partial; the task is told when it is saved |
| Android stops it (its own Stop in the status bar) | the same, partial |

Never Android's own recorder for a task, and never a tap on the person's consent. Pictures stay the
accessibility screenshot (§2).
