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

In the Mac app, **Your devices and what they can do** shows all your devices as little clay islands
on a calm sea. The computer Ducter lives on is the big one in the middle, with Ducter sitting
beside it. Each other computer, and each phone you connected, has its own island with a bridge
back to the middle one, because everything connects through the computer Ducter lives on.

- **Little parcels cross a bridge** while a task is running on that computer. When it's done
  they stop; the bridge stays.
- **The AI agents signed in on a device** stand on its island. Tap one and every island where it
  is signed in lifts a little; the card beside the scene says, for example, *"Signed in · shared
  by 2 devices"*.
- **What a device can do** stands in front of its island at full size. An empty spot is
  something you can add: tap it, or drag it from **You can also add**.
- **A device that can't be reached** sits in a soft mist with one line, such as *"Can't reach ·
  2 h ago"*. Nothing needs fixing on your side; it shows up again when it's back.

Choose an island (or its card on the left) to see that device's card: its name, what it is
(*A computer in the cloud · Ducter lives here*, *Another computer · does tasks for Ducter*), whether
it's awake, what it can do, the AI agents signed in on it, and its Ducter version. AI agents that
aren't signed in there stay behind **+ Sign in another AI**.

- **Rename** a device by clicking its name on the card: type, then Enter to keep it or Esc to
  leave it as it was.
- **Disconnect** is at the bottom of the card. Ducter asks once and says what it means; to bring
  the device back, connect it again with a new code. Phones and other windows have the same card.
- **Update:** a device that's behind gets one small dot by its name and an **Update** button on its
  card. See [Updates](install.md#updates).

The phone shows the same cards under **Settings › Your devices**, without the islands.

Each device is in one of three states:

- **Awake:** ready to work.
- **Asleep · carries on when it wakes:** a laptop with its lid closed, for example. Its tasks
  pause and pick up again when it wakes. Nothing is lost.
- **Can't reach:** Ducter can't get to it right now, with when it was last seen.

Another computer you lent Ducter shows its own name and the line *Another computer · does tasks
for Ducter*. When it is asleep or can't be reached, the second half says that instead. To give it
a name you'll recognise, choose it and then **Rename**; Ducter knows it by the new name from then
on, and tasks you started there before keep going.

What a device can do:

| | What it means | Status |
|---|---|---|
| **Browse the web** | The computer can get things done on the web: look things up, read pages, gather what it finds. In your Chrome when your AI agent has its own browser, otherwise in Ducter's own browser | Ready on the computer Ducter lives on (a Mac, or a server: see below) |
| **Reach from anywhere** | Reach Ducter from your phone or another computer, with a one-time code | Ready (needs an address that works from outside; see [Install](install.md#a-linux-server-that-stays-on)) |
| **Use this computer** | Ducter uses the other apps on the computer the way you do | Coming later |
| **Use a phone** | Ducter does things on your phone | Coming later |
| **Make calls** | Ducter makes phone calls for you | Coming later |

To give a device something, choose **Add to** it. When it's done you see, for example,
*"MacBook can browse the web now"*. **Remove** takes it away again; before anything changes,
Ducter tells you what that means.

### Browsing the web

Browsing the web now uses your AI agent's own browser when it can:

- **Codex**, with the Codex app installed and its computer use turned on, works in your Chrome.
- **Claude Code** works in your Chrome through the Claude extension, when the extension is
  connected.

Then **Browse the web** says **In your Chrome**, and there is nothing to set up. A task there is
signed in to the sites you are signed in to, as you. It keeps to what it opened:

- **It opens a window or tab of its own** and works only there. It never types into a page you
  had open.
- **Before it types, it checks** that the window in front is the one it opened. If it isn't, it
  stops and asks.
- **It closes what it opened** when it's done, and nothing else.
- **Signing in, submitting forms, posting and paying are always left to you.** When a page needs
  one of these, the task asks, and you tap **Go** when you've done it.

Otherwise, and always for pi and DeepSeek Harness, Ducter uses its own browser. That needs
Google Chrome in Applications and a small free helper, the browser driver (cua-driver). Choose
**Browse the web** and Ducter walks you through **Set up browsing**: three small steps, no
Terminal. It installs the driver, then asks you to turn on two switches in System Settings,
which macOS wants you to flip yourself. Each step checks itself off. If the Claude extension
turns out not to be connected when a task starts, that task moves to Ducter's own browser by
itself and says so.

What you'll notice with Ducter's own browser:

- **A second Chrome window** appears while a web task runs. It is Ducter's own Chrome, with its
  own profile, separate from yours. It moves itself to the bottom right, behind your work, gives
  your keyboard back right away, and closes when the task is done.
- **Signing in is yours.** When a site needs a login, the task asks you to type it yourself in
  that window, then tap **Go**. Your password never reaches the AI. Sign-ins are remembered for
  the next task.
- **Submitting forms and paying are always left to you.**

### Browsing the web on a server

On a Linux server (a VPS with no screen) your AI agent has no browser of its own, so Ducter
brings one: **Ducter's own browser**, a real Chrome that runs on the server with no window.

- **Adding it is one tap.** Choose **Browse the web** on the server in Devices, then **Add to**.
  Ducter downloads Chrome (about 170 MB, the first time only) and says **Getting ready…** until
  it can start. From a terminal, `ducter ability add browser` does the same.
- **If the server lacks a few system libraries**, and Ducter doesn't run as root, it can't
  install them itself. Devices shows **One step left** and the one line to run on the server
  (`sudo apt-get install …`); run it, then **Try again**. As root, Ducter installs them itself.
- **Its profile is its own**, kept on the server, separate from any Chrome of yours. Sites you
  sign into stay signed in for later tasks.
- **Files a page downloads** land in the task's own folder.

**Seeing it work.** Once it's added, **Try it** (under Browse the web on the server, in the Mac
app or on your phone) opens a test page in the server's browser, live, so you can see it browse
for yourself. The top line says whose browser it is and where it runs: **Ducter's own browser ·
on hel · Chrome for Testing 157**. Tap **Done** to close it. You can also just ask Ducter
"I just added the browser, can you check it works?": it opens a test page itself and tells you
in a sentence, no task needed. From a terminal: `ducter browser check` (add `--json` for a
script) starts it, opens example.com, says which Chrome and how long it took, and closes it.

**Signing in.** When a task needs you signed in to a site, it pauses and asks: **Sign in to
github.com** (the site it needs). Tap **Sign in**, in the Mac app or on your phone, and the
server's browser opens right there, live: the page as the server sees it, and your taps, scrolls
and typing go straight into it. Sign in the way you always do, two-step codes included, then tap
**Done**. The task carries on, signed in.

While that view is open, the task can't see the page at all: it waits. Your password and your
codes go from your keyboard to the site and nowhere else; nothing of it is shown to the AI or
kept in your conversation. **Not now** closes the view and leaves the question open.

**Signed-in sites.** Devices › **Browse the web** on the server lists the sites you signed into
there. **Sign out** forgets one site's sign-in on the server; **Clear all** forgets every one.
(To be sure, also sign that session out on the site's own security page.) From a terminal:
`ducter browser sites`, `ducter browser signout <site>`, `ducter browser clear`.

Good to know: sites see a server's address, which some treat with suspicion; you may get a
"confirm it's you" check or a puzzle the first time. Solve it in the same live view.

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

On the computer Ducter lives on, choose **Connect a phone or computer** in the app, or run
`ducter pair` in Terminal. You get one **Code**, and it works for any kind of device, once, for
10 minutes. In the app, a small jetty grows out of the middle island and the code stands on a
sign beside it, with *"Waiting for it to connect…"*; when the device connects, its island rises
there and the device lands on it. The sign shows both ways to use the code:

- **A phone or the Ducter app:** scan the QR code or open the **Address**, then type the code
  (in the app, choose **Connect to your Ducter** first).
- **Another computer that should do tasks for Ducter:** run the one command shown there, for
  example `ducter worker https://ducter.example.com --code K7QM-4XPA`. See
  [Lend another computer](install.md#lend-another-computer) to keep it running.

A computer connected this way can only do tasks for Ducter: it can't read your conversation or
decide anything for you.

`ducter devices` lists everything connected, `ducter devices rename <name> <new name>` renames
one, and `ducter devices disconnect <name>` removes a device at once. To bring it back, connect
it again with a new code.
