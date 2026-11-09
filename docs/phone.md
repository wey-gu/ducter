---
title: Your phone
description: Connect your phone to Ducter, get notified only when something needs you, and keep your nights quiet.
order: 7
---

# Your phone

On your phone you can do almost everything you do on your Mac: read the conversation, write to
your partner, answer decisions, look at **On hand**, and open a task. Mostly, though, it tells
you when something needs you and lets you answer in one tap.

One thing stays on the Mac: the changes themselves. On the phone, a finished task names them
in its line of proof ("2 files changed"); to read them line by line, open the task on your Mac.

The phone version opens in your phone's browser. An iPhone app is in testing and coming soon.

## Connect your phone

Your phone needs an address it can reach from anywhere: Ducter on a server with your own domain
(see [Install](install.md#a-linux-server-that-stays-on)). A zero-setup address with no domain
of your own is coming soon.

1. On the computer Ducter lives on, run `ducter pair`, or choose **Connect a phone or computer**
   in the Mac app.
2. Scan the QR code with your phone's camera, or open the link it shows. You can also go to the
   address and type the **Code**.
3. The phone says **Connected**.

The code works once and expires after 10 minutes. After that your phone remembers the
connection. To disconnect it, run `ducter devices disconnect <name>` on the computer Ducter
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
  the iPhone's browser, tapping it opens the decision. The iPhone app (in testing, coming soon)
  lets you answer **Go**, **Hold** or **Reply** right from the notification.

### On iPhone

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

To change the hours or turn them off, open **Partner** and use **Quiet hours** (see
[Your partner and settings](settings.md#partner)).
