---
title: Your phone
description: Connect your phone or iPad to Ducter, get notified only when something needs you, and keep your nights quiet.
order: 7
---

# Your phone

On your phone you can do almost everything you do on your Mac: read the conversation, write to
your partner, answer decisions, look at **On hand**, and open a task. Mostly, though, it tells
you when something needs you and lets you answer in one tap.

One thing stays on the Mac: the changes themselves. On the phone, a finished task names them
in its line of proof ("2 files changed"); to read them line by line, open the task on your Mac.

The phone version opens in your phone's browser. The iPhone app is in public beta through
TestFlight: [join the beta](https://testflight.apple.com/join/Z4GvWt7t), then connect it with
the same address and code.

## Connect your phone

Your phone needs an address it can reach from anywhere: Ducter on a server with your own domain
(see [Install](install.md#a-linux-server-that-stays-on)). A zero-setup address with no domain
of your own is coming soon.

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
- On **Android**, you can answer with **Go** or **Hold** straight from the notification. In
  the iPhone's browser, tapping it opens the decision. The iPhone app (public beta on TestFlight)
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
