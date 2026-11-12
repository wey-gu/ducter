---
title: Your phone
description: Connect your iPhone, iPad or Android phone (foldables too) to Ducter, get notified only when something needs you, and keep your nights quiet.
order: 7
---

# Your phone

On your phone you can do almost everything you do on your Mac: read the conversation, write to
your partner, answer decisions, look at **On hand**, and open a task. Mostly, though, it tells
you when something needs you and lets you answer in one tap.

One thing stays on the Mac: the changes themselves. On the phone, a finished task names them
in its line of proof ("2 files changed"); to read them line by line, open the task on your Mac.

Where you can use it:

| | How | Status |
|---|---|---|
| **iPhone and iPad** | The Ducter app, one app for both ([join the beta](https://testflight.apple.com/join/Z4GvWt7t)), or Safari | Public beta on TestFlight |
| **Android** | The Ducter app, with each release on GitHub ([below](#the-android-app)), or Chrome | Ready; the app updates itself |
| **Any other phone** | Its browser | Ready |

## Connect your phone

Your phone needs an address it can reach from outside. If Ducter runs on a server with your own
domain (see [Install](install.md#a-linux-server-that-stays-on)), it has one already. If not (a Mac
at home, say), set up **From outside** with your own domain on Cloudflare: see
[From outside](#from-outside) below.

1. On the computer Ducter lives on, run `ducter pair`, or choose **Devices › Connect a phone or
   computer** in the Mac app.
2. Scan the QR code with your phone's camera, or open the link it shows. You can also go to the
   address and type the **Code**.
3. The phone says **Connected**.

Each code works once, for one device, and expires after 10 minutes. After that your phone
remembers the connection. For a second phone or another computer, get a new code the same way:
`ducter pair` on the computer Ducter lives on, or **Devices › Connect a phone or computer** in the Mac app (it works when the app is connected to a Ducter on a server, too). A code that was already used or ran out says so; just get a
new one. To disconnect it, run `ducter devices disconnect <name>` on the computer Ducter
lives on.

### From outside

**From outside** gives the computer Ducter lives on an address at your own domain, for example
`ducter.example.com`, through your own Cloudflare account. You need:

- a free Cloudflare account, and
- a domain on it. No domain yet? You can buy one right in Cloudflare; it's sold at cost.

Then tap **+ From outside** on the card of the computer Ducter lives on and **Set it up for me**
(or run `ducter anywhere on`). Ducter starts a task that does the steps with Cloudflare's own
program, and the card ticks them off as it goes. It needs you twice:

1. **Sign in to Cloudflare and pick your domain.** On a Mac a browser opens by itself; elsewhere
   the card shows a link and a QR code to open on your phone. Press **Authorize**.
2. **Say go** in the conversation, to create the tunnel and point the address (it suggests
   `ducter.<your domain>`) at this computer. Want another name? Reply with it. A name that is
   already used for something in your account is never replaced.

Then Ducter starts the tunnel, checks that the address opens from outside, and uses it: new codes
carry it. The address never changes. Only devices you connected get in; the address alone opens
nothing. Cloudflare decrypts the traffic at its edge before passing it on, as with any site on
Cloudflare.

**Turn off** (tap **From outside** on the card) stops the tunnel and takes the address away. The
tunnel and its address stay in your Cloudflare account: turn it on again any time, or delete them
in Cloudflare.

Made a tunnel yourself in Cloudflare's dashboard (pointing at `http://localhost:7777`)? Run
`ducter anywhere on --token <its token> --hostname <its address>` instead.

## Notifications

Right after connecting, Ducter asks: *"Shall I notify this phone when something needs you?"*
Choose **Yes, notify me**, or **Not now** and turn them on later under **Notifications**.

You get a notification **only when something waits for you and you haven't seen it** for about
half a minute. If several things come up close together, they arrive as one, so your phone
doesn't buzz over and over.

- **Results don't notify you** by default. Turn on **Also tell me when something's done** if
  you want them.
- **Send a test** checks that notifications reach this phone.
- **Stop notifications** turns them off for this phone.
- On **Android**, in Chrome, you can answer with **Go** or **Hold** straight from the
  notification. The Android app can't notify you yet: open it to see what needs you, or keep
  Ducter in Chrome as well for its notifications. In the iPhone's browser, tapping it opens the
  decision. The iPhone app (public beta on TestFlight)
  lets you answer **Go**, **Hold** or **Reply** right from the notification.

### In the iPhone app

The app's notifications work with any Ducter, with nothing to set up. Apple delivers them only
for the app's publisher, so your Ducter sends them through a small **notification relay** run by
Nowledge, the makers of Ducter. What it says stays private:

- **The words are encrypted for your phone.** When you turn notifications on, the app gives your
  Ducter a key that only this phone has. Your Ducter locks every notification with it; the phone
  unlocks it when it arrives. The relay and Apple only ever see **Ducter needs you**, which is
  also what you see for a moment if the phone can't unlock one.
- **What the relay does see:** your phone's notification address from Apple, when a
  notification goes out, roughly how big it is, and whether it's a question for you. It keeps
  none of that, only short-lived counters to stop abuse.
- **Disconnecting the phone** (or turning its notifications off, or connecting the app to another
  Ducter) stops the relay delivering anything more to it.
- If the relay can't be reached, the app says so under **Notifications**, and notifications may
  arrive late.
- **Rather not use it?** Use Ducter in Safari, added to your Home Screen (below): those
  notifications go through Apple's web push and never touch the relay. If you build the app
  yourself under your own Apple developer account, your Ducter can send to Apple directly with
  your own push key instead.

### In Safari on iPhone

iPhone shows notifications from a web app only once it's on your Home Screen (iOS 16.4 or
later). In Safari, tap **Share**, then **Add to Home Screen**, and open Ducter from the Home
Screen icon from then on. Ducter reminds you of this when it matters.

## Quiet hours

From **23:00 to 08:00**, in your phone's time zone, Ducter doesn't notify you at all. Nothing
breaks through. When quiet hours end, you get at most one notification about what waited
overnight.

Your tasks keep working through the night; only the notifications wait. A decision that can be
undone still goes ahead with its default if you don't answer in time, and you'll see **No answer, so I
went ahead** on it. Anything that can't be undone waits for you.

If you turn quiet hours off, they stay off, even when you connect another phone.

To change the hours or turn them off, open **Partner** and use **Quiet hours** (see
[Your partner and settings](settings.md#partner)).

## On an iPad

The iPhone app runs on iPad too, from the same TestFlight link, and so does Ducter in Safari.
Connect it the same way, with its own code.

- **Held across** (or a 13-inch iPad held upright), the conversation stays on the left and
  **On hand** stands beside it. Open a task there, and it opens in that place while the
  conversation stays where it was.
- **The whole screen.** Tap the arrows at the right of On hand's header (or press ⌘2) and On
  hand fills the screen as it does on a Mac: everything that needs you, what's working, what's
  waiting and what's done today, side by side, sorted by state or by project. Open a task from
  there and it fills the screen too. The same arrows, ⌘2 again, or **Conversation** at the top
  bring you back to the two sides. On a foldable opened like a book, it splits at the fold.
- **Upright, or side by side with another app** in Split View or Stage Manager, Ducter is one
  column, as on a phone. Turning the iPad or resizing the window keeps what you were reading and
  typing.
- **With a keyboard:** ⌘N starts a new task, ⌘1 shows the conversation, ⌘2 On hand, ⌘3 your
  devices, ⌘4 your partner, ⌘, Settings and ⌘K the box to write in. Esc goes back one level. Hold
  ⌘ to see the list. A trackpad shows what you can tap as you point at it.
- Everything that says "this phone" says "this iPad" there; notifications and quiet hours work
  the same way.

On iPhone Duo the app runs open or closed, laid out for the display it is on. Filling the whole
open display, edge to edge, is coming soon.

**Opening the app** shows what you saw last straight away, even when your Ducter is far away;
what's new since then arrives a moment later. If your Ducter can't be reached, the app says so
and offers to try again.

**When the app is newer than your Ducter.** The app shows the pages your Ducter serves, so a
Ducter still on an older version shows its older pages, and newer things wait for it. The app
(iPhone, iPad or Android) then says so in one line: "Ducter on … is still …, older than this app".
Tap **Update it** to go to **Settings › Your devices**, where your Ducter's own card has
**Update**, or **Got it** to put the line away until the versions change again.

## The Android app

**Install it.** On your Android phone, open
[Ducter's latest release](https://github.com/wey-gu/ducter/releases/latest) and tap the file that
ends in `-android.apk`. Android asks once whether your browser may install apps; allow it, then
open Ducter. Connect it the same way: scan the QR code from `ducter pair`, paste the link, or type
the address and code.

**It updates itself.** When a new version is out, a card says what's new; tap **Update**. The first
time, Android asks once whether Ducter may install its own updates: turn on **Allow from this
source** and come back. Ducter checks the download against the release before anything changes,
and only installs a copy signed the same way as the one you have. Android closes the app to put
the new one in; open it again and it says **Back, now on** the new version. To check yourself,
touch and hold the Ducter icon and choose **Check for updates**.

**On a foldable.** Open it like a book and the conversation sits on one side of the fold and
**On hand**, or the task you open, on the other. Stand it half-open on a table and the
conversation is above the fold, On hand below. Folded, it is one column as on any phone. Folding,
unfolding and turning keep what you were reading and typing.

Notifications in the Android app are coming soon; until then, Ducter in Chrome notifies you as
above.

## Let tasks borrow your Android phone

Some errands live in an app on your phone: an order in a delivery app, a reply in a chat app. With
**Use this phone**, a task can borrow the phone you already use, with your apps and accounts on it,
for as long as the errand takes.

**Turn it on (once, about a minute).** In the Ducter app on your Android phone, open **Settings ›
Devices**, tap your phone, then **+ Use this phone**. Android wants you to flip one switch
yourself; Ducter shows each page you'll see, with a fingertip where to tap, and opens the right one
for you:

1. On Android 13 and later, the first time: in **Accessibility**, tap **Ducter**, then its switch.
   Android says the setting is restricted; tap **OK**.
2. In Ducter's **App info**, tap the three dots at the top right, then **Allow restricted settings**, and
   confirm with your screen lock.
3. In **Accessibility**, tap **Ducter**, turn on **Use Ducter**, then **Allow**. You come straight
   back to Ducter.

If Android asks you to **Allow** straight away at step 1, that's all.

**When a task wants it**, you get a card: **"Order lunch" wants to borrow your Pixel**, with
**Not now** and **Lend it**. Nothing happens until you say. While it's lent:

- A small pill sits at the top of the screen over every app: **Ducter is using this phone**, what
  it's doing right now, and **Stop**. Each tap shows as a soft ring where it lands.
- Anything that sends, pays, deletes or confirms waits for your Go on a card, every time.
- Banking, wallet, payment, password and authenticator apps stay out of reach, and password fields
  are never read or typed. Signing in is yours: the card asks you to do it on the phone, and the
  task sees nothing until you tap **Done**.
- Tap **Stop** on the pill, or **Stop** on the task from any of your devices, and the phone is
  yours again at once.

Between tasks it reads nothing. To turn it off, tap **Use this phone** on the phone's card and
**Remove**: that also turns Ducter's switch off in Android. Keep the Ducter app open (in the
background is fine) while a task is borrowing the phone.

**iPhone:** not available. iOS doesn't let one app use other apps, and the ways around it need
Xcode and a Mac next to the phone. On an iPhone, tasks use apps on your Mac or Ducter's own phone
instead.
