---
title: Your devices
description: The computers Ducter works on, what each can do, how it keeps working when the window closes, and how to stop it.
order: 3
---

# Your devices

Ducter works on computers you own. The one it **lives on** (your Mac, or a server) holds your
conversation and your partner. Tasks run there, or on another computer you lend it. Your phone
(iPhone, iPad or Android), and other Macs, can connect to it to talk and decide (see
[Your phone](phone.md)).

## Your devices and what they can do

In the Mac app, **Your devices and what they can do** shows all your devices as little clay islands
on a calm sea. The computer Ducter lives on is the big one in the middle, with Ducter sitting
beside it. Each other computer, and each phone you connected, has its own island with a bridge
back to the middle one, because everything connects through the computer Ducter lives on.

- **Little parcels cross a bridge** while a task is running on that computer. When it's done
  they stop; the bridge stays.
- **The AI agents signed in on a device** stand on its island. Tap one on a device's card and
  every island where it is signed in lifts a little.
- **What a device can do** stands in front of its island at full size.
- **A device that can't be reached** sits in a soft mist with one line, such as *"Can't reach ·
  2 h ago"*. Nothing needs fixing on your side; it shows up again when it's back.

The list on the left has one line per device: its name and one word of how it is (*home*,
*2 tasks*, *asleep*, *connected*). Choose a line or an island to see that device's card. It reads
top to bottom like a character in a game:

- **Who:** the device itself, big, with its name under it. Click the name to **rename** it (the
  one Ducter lives on too): type, then Enter to keep it or Esc to leave it as it was.
- **How it is:** one line, such as *Ducter lives here*, *Doing 2 tasks for hel*, *Asleep ·
  carries on when it wakes* or *Can't reach · last seen 2 h ago*.
- **What it carries:** its AI agents, one coin each. A grey coin is signed out; a small dot means
  a newer version is out. Tap a coin to see its details right there: its version and how it was
  installed, an update, **Use it for tasks**, and who shares its account. **Add an AI** at the end
  of the row lists the agents not on that device yet.
- **What it can do:** a few chips, such as **Browse**, **Use apps** and **From anywhere**. One tap
  turns one on or off. The small **i** on a chip says what it does.
  - **Calls** is on the card of the computer Ducter lives on, because a call doesn't run on any
    one computer. **+ Calls** takes you to **Settings › Accounts** and starts connecting Tuwa,
    the phone line Ducter calls through; once it's connected, tapping **Calls** opens its card
    there. If your Tuwa sign-in runs out, the chip says **Sign in again**. See
    [Phone calls](calls.md).
  - **Use a phone** is on the card of a Mac with Apple silicon that Ducter lives on. It gives
    Ducter a phone of its own: see [Ducter's phone](#ducters-phone) below.
  - Faded chips marked **coming later**, such as **Use apps**, show what Ducter will be able to
    do in a later version. Tap one to read what it will do; there is nothing to turn on yet.
- **How it's connected:** one quiet line, such as *Connected via the app and command line*. The
  **⋯** beside it shows each connection with its own **Disconnect**.
- **Disconnect this MacBook** is at the very bottom. Ducter asks once and says what it means; to
  bring the device back, connect it again with a new code.

Ducter's own version shows on the card only when there is an update; **Settings › About** lists
every computer's version, with **Check now**.

Phones and app windows have the same card, without coins. Two phones that would get the same name
get *· 2* after the second one; rename either.

**One computer, one card.** When the Ducter app connects your Mac to a Ducter on a server, the
`ducter` command line on that Mac connects too. It isn't a device of its own: the Mac's card says
*Connected via the app and command line*, and the **⋯** beside that line disconnects just the
command line.

## Ducter's phone

Some things only happen in an app on a phone. **Use a phone** gives Ducter its own Android phone
(Android 16 with Google Play), running on your Mac and apart from your own phone. You put apps on
it and sign in to them yourself; then Ducter can get things done in those apps for you.

**Adding it.** Tap **+ Use a phone** on the card of your Mac. Ducter says what it downloads (about
2.3 GB, once), how much space it takes (about 10 GB once the phone has been used), and when it
runs. The phone comes from Google under Google's licenses: read them there (**Read**), turn on
**I've read and agree to these licenses**, and tap **Add it**. The card shows the download; you
can do something else meanwhile. You don't need Android Studio or anything else. For now this is
for Macs with Apple silicon; other computers show **Use a phone** as coming later.

**When it's on.** The phone starts by itself when a task needs it or you open it, and turns itself
off a few minutes after nothing needs it. The first start takes about a minute; after that, a few
seconds.

**Putting your apps on it.** Tap **Open the phone** on the card. It's your turn: tap, swipe and type
as on a phone (Back, Home and Recent apps are under the screen). Open Google Play, sign in to your
Google account, install the apps you want, and sign in to them. Ducter can't see the phone while
it's your turn. Tap **Done** when you're finished.

**Asking for something.** Just say it, such as *"Use your phone to check my orders in the app"*.
The task works on the phone; you can watch it from the task (**Watch it use the phone**) or from
the card (**Watch**), and take a turn with **My turn** and **Hand it back**, as with
[Ducter's browser](#browsing-the-web-on-a-server).

**What always waits for you.**
- Any tap that sends, posts, pays, buys, installs, deletes, calls, confirms or signs out: the task
  asks first on a card that says what it will do (**Tap it**, or **Not yet**). One yes covers that
  one tap.
- Signing in, codes and puzzles: the card says **Open the phone**; you do it, then **Done**.
- Banking, wallet and payment apps, password managers and authenticator apps: Ducter can't see or
  use them at all, and never types into a password field.

**Erasing it.** The **i** on **Use a phone** has **Erase this phone**: its apps, sign-ins and data
are deleted and you get a fresh phone.

## Let this Mac do tasks

When the Ducter app on your Mac is connected to a Ducter on a server (say, *hel*), your Mac's
card has a chip **Tasks for hel**, and **Settings › Where it runs** has the same switch: **Let this
Mac do tasks for hel**. Turn it on and your Mac becomes one of hel's computers, with the AI agents signed in on it (Claude
Code and others), its repos and its browsers: *"run it on my Mac"* now works, and so do errands
that need the sites you're signed in to in your Chrome. It keeps running in the background,
starts when you log in, and starts again if it stops. It only does tasks: it never sees your
conversation. Turn it off and it stops, and hel forgets it. If tasks are still running on it,
Ducter asks first, and **After they finish** is the default. From then on, every task says which
computer it's on (see [Which computer a task runs on](#which-computer-a-task-runs-on)).
- **Update:** a device that's behind says **Update available** by its name and gets an
  **Update** button on its card. See [Updates](install.md#updates).

### Your AI agents' versions

Tap an AI agent's coin on a device's card to see the version it runs there and how it was
installed, for example *Version 0.167.0 · installed with npm*. When a newer one is out, the coin
has a small dot, and its details say **Update to 0.168.0** with an **Update** button. When an
update lands, the coin pops once. Ducter updates it the same way it was installed (npm, Homebrew, or the agent's
own installer), but only once nothing is running on that agent there: you may see *Waiting for its
work to settle…* first, then *Updating to 0.168.0…* and *Done, now on 0.168.0*. If the new version
doesn't start, or its sign-in stops working, Ducter puts the previous version back where it can
and says so.

- **Ducter hasn't checked this version yet** means Ducter hasn't tried it with this version
  yet. It usually works fine; it is just said plainly.
- **Updates with the Codex app** means this copy came with the Codex app, so the app updates it;
  Ducter leaves it alone. **Updates with Ducter** means it ships inside Ducter.
- **Update at night** (under your devices) also covers your AI agents: in quiet hours, when
  nothing is running on one, Ducter updates it, but only to a version it has checked. Anything
  else waits for your tap.

From the command line: `ducter update --agents --check` shows them, `ducter update --agents`
updates the ones behind (`--all` for every computer, `--json` for scripts).

The phone shows the same list and cards under **Settings › Your devices**, without the islands: tap
a device to open its card.

### Nowledge Mem in your AI agents

Only if you already use [Nowledge Mem](https://mem.nowledge.co): tap an AI agent's coin on a
device's card to see whether Nowledge Mem is set up in it there: *Nowledge Mem 0.7.34 installed*,
or *Nowledge Mem not installed* with **Install**. It matters twice: Ducter's tasks on that
computer run with it, and so do your own sessions. Ducter reads this from Nowledge Mem's own
check on that computer, which looks at the agent's settings but can't prove the agent loads it,
so the line says "installed", never more. *Worth a look* means the check couldn't settle it, for
example two copies; **Sort it out** fixes it the same way.

**Install** first says what it will change, then starts one task on that computer that follows
Nowledge Mem's own setup guide. It changes only that agent's own settings, nothing of
Ducter's, and asks you for a connect link if Nowledge Mem isn't connected there yet. Start the
agent again afterwards to use it. Nothing is ever installed without your tap.

When an AI agent on one of your computers doesn't have it, your partner recommends it once, with
**Install** and **Not now**, and waits for your answer. It never asks again for that computer and
agent. With **Remember things** off, or without Nowledge Mem, none of this shows: Ducter and its
tasks work the same without it.

Each device is in one of three states:

- **Awake:** ready to work.
- **Asleep · carries on when it wakes:** a laptop with its lid closed, for example. Its tasks
  pause and pick up again when it wakes. Nothing is lost.
- **Can't reach:** Ducter can't get to it right now, with when it was last seen.

Another computer you lent Ducter shows its own name and the line *Does tasks for hel* (or what it
is doing). When it is asleep or can't be reached, the line says that instead. To give it a name
you'll recognise, click its name on its card; Ducter knows it by the new name from then
on, and tasks you started there before keep going.

What a device can do:

| | What it means | Status |
|---|---|---|
| **Browse the web** | The computer can get things done on the web: look things up, read pages, gather what it finds. In your Chrome when your AI agent has its own browser, otherwise in Ducter's own browser | Ready on every computer that does tasks (a Mac, or a server: see below) |
| **Reach from anywhere** | Reach Ducter from your phone or another computer, with a one-time code | Ready (needs an address that works from outside; see [Install](install.md#a-linux-server-that-stays-on)) |
| **Use this computer** | Ducter uses the other apps on the computer the way you do | Coming later |
| **Use a phone** | Ducter does things on your phone | Coming later |
| **Make calls** | Ducter makes phone calls for you | Coming later |

To give a device something, tap its dashed chip (**+ Browse**). When it's done you see, for
example, *"MacBook can browse the web now"*. Tap the chip again to take it away.

### Browsing the web

Browsing the web now uses your AI agent's own browser when it can:

- **Codex**, with the Codex app installed and its computer use turned on, works in your Chrome.
- **Claude Code** works in your Chrome through the Claude extension, when the extension is
  connected.

Then **Browse** is ready, its **i** says it works in your Chrome, and there is nothing to set up. A task there is
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

- **Adding it is one tap.** Tap **+ Browse** on the server's card in Devices.
  Ducter downloads Chrome (about 170 MB, the first time only) and says **Getting ready…** until
  it can start. From a terminal, `ducter ability add browser` does the same.
- **If the server lacks a few system libraries**, and Ducter doesn't run as root, it can't
  install them itself. The card says so under its chips, with the one line to run on the server
  (`sudo apt-get install …`); run it, then **Try again**. As root, Ducter installs them itself.
- **On Ubuntu 23.10 and later** (24.04 included), the system doesn't let a normal user's Chrome
  start its security sandbox. The card says so with one line to run on the server once: it
  allows only Ducter's copy of Chrome, and keeps the sandbox on. Run it, then **Try again**.
- **Its profile is its own**, kept on the server, separate from any Chrome of yours. Sites you
  sign into stay signed in for later tasks.
- **Files a page downloads** land in the task's own folder.

**Seeing it work.** Once it's added, **Try it** (in **Browse**'s **i** on the server's card, in the
Mac app or on your phone) opens a test page in the server's browser, live, so you can see it browse
for yourself. The top line says whose browser it is and where it runs: **Ducter's own browser ·
on hel · Chrome for Testing 157**. Tap **Done** to close it. If the page doesn't come up within
40 seconds, it says the server's browser didn't answer, with **Try again**. You can also just ask Ducter
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

**Watching it browse.** While a task works in the server's browser, you can watch the page live:
tap **Watch it browse** in the task, or **Watch** beside it on the server's **Browse** block (on
a wide screen, on its card in On hand too). You see the page as the task works, with a calm line
of what it is doing: *Opening shop.example.com*, *Clicking "Add to cart"*, *Typing in "Search"*.
Watching changes nothing for the task, and nothing you tap goes in. On a phone, double-tap the
page to zoom in, and again to zoom out.

**Your turn.** Tap **My turn** to use the page yourself: a band says plainly that it's your turn
and that the task can't see the page or touch it; the task waits. Tap the address to open
another page, use the back and forward arrows, type (Chinese input included; on a phone the
keyboard button brings up the keyboard). When you're done, tap **Hand it back**: the task carries
on, and if the page changed while you had it, it is told where it is now. Closing the view hands
it back too. This is also the easy way to sign in to a site before a task needs it: sites you
sign in to on your turn join **Signed-in sites**.

When the app goes to the background the picture pauses, so it costs nothing on your data; it
picks up again when you come back.

**Signed-in sites.** The **i** on the server's **Browse** chip lists the sites you signed into
there. **Sign out** forgets one site's sign-in on the server; **Clear all** forgets every one.
(To be sure, also sign that session out on the site's own security page.) From a terminal:
`ducter browser sites`, `ducter browser signout <site>`, `ducter browser clear`.

Good to know: sites see a server's address, which some treat with suspicion; you may get a
"confirm it's you" check or a puzzle the first time. Solve it in the same live view.

## Which computer a task runs on

With one computer, nothing changes: every task runs there. Once a second computer does tasks
(your Mac for a server, say), Ducter picks the computer together with who does the task, from
what the task needs, and every task says where in a few words: **on hel**, **on MacBook · in your
Chrome**. Hover over it on the Mac, or tap it on your phone, and it says why: *Always awake; keeps
going when MacBook closes*, *Needs your signed-in taobao.com*, *Only MacBook has Keynote*.

- **Public pages** run in Ducter's own browser on the computer that stays awake. **Your Chrome**,
  where you're signed in, is used only when a task needs your sign-ins. Ducter never moves a task
  to more access on its own: when a choice would use your Chrome, the card says so first.
- **Long work** starts on a computer that doesn't sleep, so closing your laptop doesn't stop it.
- **Your Mac is asleep** and the task needs it (Keynote, your Chrome): the task waits, *Waiting ·
  MacBook is asleep*, and starts when the Mac wakes. When another computer could do it with a
  difference you'd notice (you'd sign in there), one card asks: **Wait for it** (if you don't
  answer, it waits; nothing is lost) or **Do it on hel now**.
- **Change it** with **Switch who does it** on the task: on the Mac, a strip of your islands shows
  each computer with its AI agents, and the list below is grouped by computer, with why a row
  can't take it. Choosing a row on another computer says what moving does and reads **Continue on
  MacBook**: the task carries on there from its last saved progress; a repo's branch is pushed
  first, and changes that aren't committed stay where they are. A folder can't move.
- **New task**: with two computers, **No folder** names a computer (**No folder · hel**); tap it
  to choose another. An AI agent you can only use on another computer shows *on MacBook*; picking
  it brings that computer along. For a folder on hel, that means the same project on the MacBook
  (the same repository, with its branch), or, when the MacBook has no copy, a folder you pick
  there. The projects in each computer's Ducter folder (`~/ducter/projects`) are in the folder
  list; **Find a folder…** looks through any of your computers' folders, and **Add from a Git
  address…** clones a repository onto any of them, from your phone too.
- **About to close your laptop?** Say *"I'm closing my laptop"*, or choose **Move before closing**
  on its card in Devices. One card says what moves to a computer that stays awake and what can
  only run on the laptop; **Move them** is what happens if you don't answer, after a minute.

Sign-ins never copy between computers: a site you're signed in to in your Mac's Chrome isn't
signed in on the server, and the other way round.

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
