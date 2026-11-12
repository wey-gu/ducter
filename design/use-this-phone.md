# 用这台手机 / Use this phone: a task borrows the person's own phone

Decided in D238 (2026-11-13); evidence in [research/74](../research/74-own-phone-use.md).
Ducter's own Android phone on a Mac is a different thing: [phone-use.md](phone-use.md) (用手机 / Use
a phone). Calls are [phone.md](phone.md). Tasks in the person's Mac apps: [computer-use.md](computer-use.md).

## 1. Who, what they feel, how it starts

| | The consumer personal-AI user | The heavy developer | The fresh user |
|---|---|---|---|
| **Moment** | "帮我在美团上点一份老样子", "在微信里回妈妈：周六见": the app is on their phone, signed in | "check our app's onboarding on my Pixel", an app-only dashboard on the phone in their hand | opening their phone's card in Ducter |
| **Before** | "it can only do the web"; Ducter's phone would need every app installed and signed in again | adb, a cable, an agent with no brakes on a real phone | nothing |
| **After** | the task borrows the phone they already use, asks first, shows it is using it at the top, asks again before it sends or pays, and gives it back the moment they say | a real device, behind the same gate and Go as everything else | one chip, a one-minute guide that shows exactly where to tap, and a short demo of what a loan looks like |
| **First time** | the partner says in one line to add 用这台手机 on their phone's card | **+ 用这台手机** on the Pixel's own card | the chip, the guide, the demo |

North star: 好用 (one chip, one switch, once), 顺滑 (each step opens the right page and comes back by
itself), 赏心悦目 (the guide draws Android's own pages in clay with a fingertip; the pill is Pebble),
放心 (asked every time, shown the whole time, Go at the effect, money and keys out of reach, Stop
in the hand), 惊喜 (it really uses their phone, and they can watch every tap land).

## 2. How it works

- **The phone's side** (`apps/android`, `Handset.kt`): an Android accessibility service in the
  Ducter app. Switched on once in Android's settings; from then on bound by the system but it
  reads and does nothing outside a **loan** the home started. It answers a fixed set of calls
  (`HandsetMethod`: state, start, doing, stop, off, screen, jpeg, tap, swipe, key, text, front,
  apps, launch, size); every one but state/start/stop/off refuses outside the loan it names.
  - The screen goes back in uiautomator's XML shape (`HandsetTree.kt`), so the home reads it with
    the same parser as Ducter's phone. A password field's text is never sent, only that it is one.
  - Typing is `ACTION_SET_TEXT` on the field in focus: any language, no keyboard switch.
  - Taps and swipes are `dispatchGesture`; back, home and recents are global actions; Enter is
    the field's own Enter (Android 11+); only those five keys.
  - Pictures of the screen are the accessibility screenshot (Android 11+, no extra consent; a
    protected window gives none). Never MediaProjection (research/74 §3).
- **The link** is the app's existing connection: the page in its web view (`handset.tsx`) says
  what the app can do (`handset_hello`), relays each `handset_req` to the app's bridge and its
  answer back (`handset_res`), and passes on 停下 from the pill. While a loan is on, the app keeps
  its renderer important so the page keeps running with Ducter in the background.
- **The home's side** (`packages/core/src/handset/`): which phone a phone task uses, the loan, and a
  `PhoneDevice` that speaks to that phone. The phone tools, the gate at the effect, the blocked
  apps and the blind rule are the same code as Ducter's phone (`android/tools.ts`, `gate.ts`).

## 3. Which phone a phone task uses

`needs.phone` work uses **the person's own phone when one is added** (its apps and sign-ins are
theirs); Ducter's phone on its computer otherwise. Bound at the task's first phone tool, for the
task's life. With a phone added, phone work may run on any computer (`loadout.ts`): the tools drive
the phone from the home wherever the task runs. Several phones added: the one connected most
recently.

## 4. The loan

| Moment | What happens |
|---|---|
| A task's first phone tool | one card, **「{task}」想借你的 {phone} 用一会儿 / "{task}" wants to borrow your {phone}**, with what it will do; **不借 / Not now** · **借给它 / Lend it**; no default ever (silence never lends a phone); the task is told to end its turn |
| The phone isn't connected | the card says so (**{phone} 上的 Ducter 现在没开着…**); a Go waits, and the loan starts when the app connects |
| Go | the home starts the loan on the phone: the pill appears, the task is told "you may use {phone} now", and works |
| Not now | the task is told no, and its phone tools refuse for the rest of the task |
| A send, payment, delete… | `phone_ask_go`: the card says **在你的 {phone} 上** and what it taps; one Go, one tap |
| The person's own step (a sign-in, a code) | `phone_ask_user`: **在你的 {phone} 上自己来，这时它什么都看不到。做完点「好了」。** The pill says **轮到你了**; every tool is blind until **好了 / Done** |
| The task stops working | the loan ends; the pill goes |
| **停下 / Stop** from any window, or on the pill | the loan ends, the task's turn is interrupted, it is told, and its phone tools refuse from then on |
| The phone comes back without the loan (its app restarted, the service went) | the loan is over on the home too, as a Stop |
| Another task wants the phone | it waits: one loan at a time |

## 5. The indicator (research/74 §8.1)

A small clay pill sitting in the status bar over every app (an accessibility overlay: no "draw
over other apps" permission, never in the screen it reads): the partner's face, breathing; **{name}
正在用这台手机 / {name} is using this phone**; under it what it is doing now (**在看屏幕**, **点「发送」**,
**在「{field}」里打字**); and **停下 / Stop** on its ledge. Each tap shows as a soft accent ring where
it lands. In the person's turn: **轮到你了 / Your turn on this phone** · **做完以后，在卡片上点「好了」**,
its border in accent. It settles in from the top edge with a small overshoot; with animations off it
just appears.

## 6. Turning it on (the guide, research/74 §8.2)

Only on the phone itself (Android's switch is there). The chip on that phone's own card: **+ 用这台
手机**. One sheet, **让任务能借用这台手机 / Let tasks borrow this phone**: one paragraph, then the steps,
each a clay miniature of Android's own page with Android's own words and a fingertip where to tap,
**去设置 / Open settings** opening the right page, and the step ticking itself when it is done:

1. Android 13+ and the app restricted (a browser-downloaded APK, research/74 §2): **先点一下那个开关**
   (Accessibility › Ducter › the switch › **受限制的设置 · 确定**); **允许受限制的设置** (App info ›
   ⋮ › **允许受限制的设置**, then the screen lock); then step 3.
2. Otherwise (and as the last step): **打开 Ducter** (Accessibility › Ducter › **使用 Ducter** ›
   **允许**). The moment the service connects, the app brings itself back to the front.

Then the chip is on, and the sheet becomes **好了，这台手机能借给任务了**: a small clay phone that loops a
loan (the pill settling in, a tap's ring, a Go card, Stop pressed) beside four lines: 先问你 · 顶上
一直显示 · 发送付款再等 Go · 随时停下. **知道了**.

Pages Ducter can open: App info, and the Accessibility list scrolled to Ducter's row (Android has no
public way to open the service's own page). The app op tells whether restricted settings are still
on where Android lets it read it; otherwise the guide shows all three steps, and step 1 says what
to do if Android asks to Allow straight away.

## 7. On the card

- On the phone itself: **+ 用这台手机** (the guide); on; failed when Android's switch went off
  (**安卓里 Ducter 的开关关掉了。再打开一次就好。** · **再打开开关**).
- From another window: on or off with what it does; added on the phone only
  (**在 {phone} 上打开 Ducter，在那里加上…**).
- ⓘ when on: how it works; **移除 / Remove** (also turns Android's switch off on the phone: a service
  may turn itself off, never on); while lent **「{task}」正在用这台手机 · 停下**.
- The opened task: **正在用你的 {phone} / On your {phone}** · **停下**.

## 8. Not here (and why)

- **iPhone:** not offered (research/74 §7). iOS gives no app a way to use other apps; the paths that
  exist need Xcode, Developer Mode and re-signing every 7 days on a Mac within reach (XCTest), or
  read only pixels through iPhone Mirroring (the phone locked, one Mac, not in the EU). An iPhone's
  card shows no chip and no "coming later".
- **Android 17 Advanced Protection** turns off non-tool accessibility services: such a phone can't be
  lent (research/74 §5); the chip says Android's switch is off.
- **Banking apps that refuse to run beside an accessibility service**: removing the chip turns the
  switch off (research/74 §1).
