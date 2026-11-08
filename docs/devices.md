---
title: Your devices
description: The computers Ducter works on, what each can do, how it keeps working when the window closes, and how to stop it.
order: 3
---

# Your devices

Ducter works on computers you own. The one it **lives on** (your Mac, or a server) holds your
conversation and your partner. Tasks run there, or on another computer you lend it. Your phone
and other Macs can connect to it to talk and decide.

## Your devices and what they can do

In the app, **Your devices and what they can do** shows each device with its state and what it
can do, and **You can also add** shows what else it could learn.

Each device is in one of three states:

- **Awake:** ready to work.
- **Asleep · carries on when it wakes:** a laptop with its lid closed, for example. Its tasks
  pause and pick up again when it wakes. Nothing is lost.
- **Can't reach:** Ducter can't get to it right now, with when it was last seen.

What a device can do:

| | What it means | Status |
|---|---|---|
| **Browse the web** | The computer can get things done on the web in Ducter's own browser: look things up, read pages, gather what it finds | Ready on the computer Ducter lives on (a Mac) |
| **Reach from anywhere** | Reach Ducter from your phone or another computer, with a one-time code | Ready (needs an address that works from outside; see [Install](install.md#a-linux-server-that-stays-on)) |
| **Use this computer** | Ducter uses the other apps on the computer the way you do | Coming later |
| **Use a phone** | Ducter does things on your phone | Coming later |
| **Make calls** | Ducter makes phone calls for you | Coming later |

To give a device something, choose **Add to** it. When it's done you see, for example,
*"MacBook can browse the web now"*. **Remove** takes it away again; before anything changes,
Ducter tells you what that means.

### Browsing the web

Browsing needs Google Chrome in Applications and a small free helper, the browser driver
(cua-driver). Choose **Browse the web** and Ducter walks you through **Set up browsing**: three
small steps, no Terminal. It installs the driver, then asks you to turn on two switches in
System Settings, which macOS wants you to flip yourself. Each step checks itself off.

What you'll notice:

- **A second Chrome window** appears while a web task runs. It is Ducter's own Chrome, with its
  own profile, separate from yours. It moves itself to the bottom right, behind your work, gives
  your keyboard back right away, and closes when the task is done.
- **Signing in is yours.** When a site needs a login, the task asks you to type it yourself in
  that window, then tap **Go**. Your password never reaches the AI. Sign-ins are remembered for
  the next task.
- **Submitting forms and paying are always left to you.**

## It keeps working when you close the window

The window is only a view. Ducter is the one doing the work, so:

- **Closing the window** (⌘W, or the red button) hides it. Click Ducter in the Dock to bring it
  back as it was. The Dock badge counts what is waiting for you.
- **⌘Q** closes the app window only. Your tasks keep going.
- **Ducter starts again when you log in**, and restarts by itself if it ever crashes.

On a Linux server, Ducter runs as a service: it starts with the server and keeps going while
you're away.

## Stop and wake

To stop Ducter and every task, choose **Stop Ducter** in the Ducter menu (*"Stops every task
until you wake it"*). The window then says *"Ducter is resting"*. It stays stopped, even after
you log in again, until you choose **Wake Ducter** or open the app again.

From Terminal, `ducter up` runs Ducter for as long as that window is open; Ctrl-C stops it.
On a server, `ducter service status` shows whether it's running, and `ducter service uninstall`
stops it for good.

## Connect another device

On the computer Ducter lives on, choose **Connect another device** in the app, or run
`ducter pair` in Terminal. You get an **Address** and a **Code**, plus a QR code for your phone.
On the other device, choose **Connect to your Ducter** and enter them. The code works once, for
10 minutes.

`ducter devices` lists everything connected, and `ducter devices disconnect <name>` removes a
device at once. To bring it back, connect it again with a new code.

To have another computer *do* tasks for your Ducter, see
[Lend another computer](install.md#lend-another-computer).
