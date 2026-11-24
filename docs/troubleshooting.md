---
title: When something goes wrong
description: Run the check-up, find the logs, and fix the problems people usually hit.
order: 10
---

# When something goes wrong

## Start with the check-up

```sh
ducter doctor
```

It looks at everything Ducter depends on: git, Claude Code and Codex (installed, and signed
in), Nowledge Mem, the browser helper (cua-driver), the port Ducter uses, and its data folder.
Anything missing comes with the one command that fixes it. Items marked optional can wait.

The Mac app runs the same check-up by itself when it starts, and shows only what blocks.

## Where the logs are

| Running Ducter as | Its log |
|---|---|
| The Mac app | `~/.ducter/app.log` (the app also shows the last lines if Ducter didn't start) |
| `ducter up` in Terminal | `~/.ducter/ducter.log` |
| A service on a Linux server | `journalctl --user -u ducter` |

## Common problems

### The server ran out of memory

`ducter doctor` says so under **Server memory (RAM)**: how many times in the last day, when, and
the biggest program a task was running then (often a type check, a build or a browser running side
by side). Ducter itself keeps running: only that program is stopped, and the task sees it and
can run its checks one at a time. After an update, Ducter brings its service settings up to
date by itself, and the check-up says **service settings updated** under **Stays on**. A server with little
memory and no swap runs out sooner; adding swap, or running heavy tasks on another computer, helps.

### A task says "Couldn't start"

Most of the time you won't see this: when a task can't start, Ducter first tries the fix itself
(another computer that has the code, a fresh copy of it where the task was to work, one more try a
moment later), and then your partner looks for another way. The task's steps say what it did in one
line. Your partner asks you only when none of that works, with the one thing you can do.

When you do see it, the task's page says why, and its first button is the fix. **No folder there**: the computer doesn't
have the folder the task was to work in. **Clone it onto {computer}** puts the code in Ducter's
folder on that computer and starts there; **Choose a folder on {computer}** lets you pick one that is
already on it, and the task starts in it. **{agent} isn't installed** or **isn't signed in** on that
computer: the button installs it or signs it in there; then tap **Try again**. **Ducter on {computer}
is too old**: update it there, then **Try again**. **Another git kept the repository busy**: something
(an editor, another git program) had the repository locked the whole time. Ducter already waited and
tried again; **Clear it and try again** removes only the lock file git left, and only while no git is
running. When nobody knows yet, the page names the agent and the computer with the first line of
what went wrong, and **See why** shows a little more. **Try again** always looks for where to start
afresh, and a message you send to a task that never started starts it.

### "Ducter" Not Opened

Your copy of the app wasn't signed with an Apple Developer ID by whoever built it, so macOS asks
for one more step:

1. Open Ducter and click **Done** on *"“Ducter” Not Opened"*.
2. Open **System Settings → Privacy & Security**, scroll down, and click **Open Anyway** (you
   may need to do it twice), then confirm with Touch ID or your password.

On macOS 14 and earlier, right-click Ducter, choose **Open**, then **Open** again.

### Installing or signing in to Claude Code or Codex didn't finish

Ducter works through your own AI plan, so Claude Code or Codex has to be installed and signed
in. The row tells you what went wrong:

- *"Couldn't reach the internet"*: connect, then **Try again**.
- *"A folder isn't writable"*: choose **Do it in Terminal** to see which one.
- *"Signing in didn't finish"*: **Try again**. If the browser didn't open, click **Browser
  didn't open?**; if the page showed you a code, click **Did the page show a code?** and paste
  it.

**Do it in Terminal** always runs the same command the button would, so you can watch it.

### "Right now Ducter stops when you close the window"

Running in the background is turned off for Ducter in macOS. Click **Open Login Items**
(System Settings › General › Login Items & Extensions) and turn on **Allow in the Background**
for Ducter. Ducter notices by itself and moves to the background once nothing is running.

### Ducter says the port is in use

Something else is using port 7777. Either quit it, or start Ducter on another port:
`ducter up --port 7790`. Started on another port? Add `--port 7790` (or set `DUCTER_PORT`) to
every command, for example `ducter status --port 7790`.

### `ducter: command not found`

`~/.local/bin` isn't on your `PATH` in this terminal yet. The installer added it to your shell's
profile, so a new Terminal window has it; in this one, run
`export PATH="$HOME/.local/bin:$PATH"`, or use `~/.local/bin/ducter`. (As `root` on a server
the installer also links `/usr/local/bin/ducter`, which every shell finds.)

### Ducter is resting and nothing happens

You (or someone) chose **Stop Ducter**. Choose **Wake Ducter** in the window or the menu, or
open the app again.

### The phone says "That code is wrong or has expired"

Codes work once and only for 10 minutes. Run `ducter pair` again for a new one. After too many
wrong codes Ducter stops accepting them for 10 minutes; wait, or get a new code.

### "Can't reach" the address

Check that the address is right. If you use an SSH tunnel, make sure it's still open on your Mac
(`ssh -N -L 7777:127.0.0.1:7777 you@server`). On a server, check that Ducter is running:
`ducter service status`. An address ending in `.ts.net` (Tailscale) opens only on a device with
the Tailscale app on, in the same Tailscale network.

### The Mac app says "Reconnecting to …" or "Can't reach your Ducter on …"

Your Mac is still connected to your Ducter; it just can't reach it right now. This happens when
the server restarts or updates, when the Mac wakes from sleep, or when the network changes. The
app keeps trying by itself and carries on where it left off, so there's nothing to do. If it lasts,
check that the server is on and online (`ducter service status` on it), then tap **Try now**. You
never need to connect the Mac again for this: the Mac app asks to be connected again only when
your Ducter itself says this Mac was disconnected.

### `ducter tailscale` stops

It says why and what to run next. Usually one of these:

- Tailscale isn't installed, isn't signed in, or is turned off on the server: install it with
  `curl -fsSL https://tailscale.com/install.sh | sh`, then `sudo tailscale up` (it prints a link
  to sign in from any device). On a Mac, open the Tailscale app and sign in there.
- Your Tailscale network hasn't approved this computer yet: approve it on the
  [Machines page](https://login.tailscale.com/admin/machines) of the admin console.
- HTTPS certificates are off for your Tailscale network: turn on **MagicDNS** and **HTTPS
  Certificates** on the [DNS page](https://login.tailscale.com/admin/dns) of the admin console.
- Tailscale asks you to turn on HTTPS (Serve) and shows a link: open it, turn it on.
- Tailscale won't let your user change what it serves: `sudo tailscale set --operator=$USER`
  once.

Then run `ducter tailscale` again.

### From outside didn't finish setting up

The card shows which step stopped, and why:

- *Cloudflare's program couldn't be downloaded:* the computer couldn't reach GitHub. Try again
  when it's online, or install `cloudflared` yourself (`brew install cloudflared` on a Mac).
- *The Cloudflare sign-in didn't finish:* the link works for about 10 minutes. Tap **Try again**
  for a fresh one.
- *Already used for something else in your Cloudflare account:* reply in the task with another
  name, such as `home.example.com`.
- *The tunnel is connected, but the address doesn't lead here yet:* a new address can take a few
  minutes to reach everyone. **Try again** in a minute.
- **See the task** shows what it did and said. Check where it is with `ducter anywhere status`.

### "This phone was disconnected from your Ducter"

The device was removed with `ducter devices disconnect`. Connect it again with a new code from
`ducter pair`.

On a Mac the same moment reads "Your Ducter on *your server* disconnected this Mac", or "doesn't know
this Mac anymore" when the server's list of devices was reset. The address is already filled in;
run `ducter pair` on the server and type the new code.

### No notifications on iPhone

They only work once Ducter is on your Home Screen: in Safari tap **Share → Add to Home Screen**,
then open Ducter from that icon. Also check that it isn't between 23:00 and 08:00, when quiet
hours hold everything. **Send a test** under **Notifications** confirms it works.

### Browsing the web can't be added

If you use Codex, install the Codex app and turn on its computer use; if you use Claude Code,
open Chrome with the Claude extension signed in to the same account. Either one makes **Browse**
ready in your Chrome, with nothing more to set up.

Otherwise, tapping **+ Browse** opens **Browse the web**, three small steps that check themselves
off: install (or update) the browser driver, then turn on **CuaDriver** under **Accessibility**
and under **Screen & System Audio Recording** in System Settings › Privacy & Security. The
switches are for CuaDriver, not for Ducter. If a step won't turn green:

- Click **Take me there**, or **Just open System Settings** and find the pane by its name.
- macOS may ask to reopen CuaDriver after the screen switch; that's fine.
- Google Chrome (or Microsoft Edge) needs to be in Applications.
- From Terminal, `cua-driver update --apply` updates an old driver.

### A website sign-in got lost

Ducter's browser window closes after about five minutes with nothing happening. If a slow
sign-in (a long form, a two-factor code) took longer, ask the task to try again; sign-ins that
finished are remembered.

### Start over as a brand-new user

Run `ducter uninstall --all` (it lists what goes before asking), or choose **Stop Ducter** and
delete the `~/.ducter` folder. This erases your conversation, tasks and settings for good, so
only do it if you mean it. The next start is a first run.

### The Mac app says there's no new version, but a card says there is

Since this version they give one answer: the app hears about a new version from your server too,
and looks again within the hour when GitHub didn't answer. On a version before that, GitHub can
refuse a Mac that asked too often from the same network for an hour, and the app then said **No
new version to find yet** for a day. To get past it: quit Ducter (**Ducter › Quit Ducter**) and
open it again after the top of the hour, then **Settings › Updates and about › Check now**; or
download the newest `Ducter-<version>-arm64.dmg` from the release page and drag it over the one in
Applications.

### An update didn't go through

The device's card says **Didn't update** and why. Nothing is lost:

- **"The download didn't match its checksum"** or **"didn't pass its check":** nothing was
  changed; try again later.
- **"Back on 0.0.3":** the new version was installed but didn't come up within three minutes,
  so Ducter put the previous one back and restarted it. The one that didn't start is kept next
  to `ducter` as `ducter.failed`, and the version before the update as `ducter.prev` (on a
  server, usually in `~/.local/bin`). What happened is in `~/.ducter/updates/result.json` (in
  the data folder). `ducter report` includes the log lines; please attach them to an issue.
- **"A merge or an undo is still running":** try again once it's done.
- **"Ducter isn't open on that Mac, or the Mac is asleep":** a Mac updates through its app; open
  Ducter there and tap **Update** again. Nothing was changed.
- **"…installed by an administrator":** go to that Mac once and choose **Restart Now** under
  **Settings › Updates and about**; it asks for the Mac's password, and from then on it updates
  from anywhere.

To go back to a version by hand on a server: `ducter update --to 0.0.3 --yes`, or move
`ducter.prev` over `ducter` and run `systemctl --user restart ducter`.

### An AI agent didn't update

The agent's line on the device card says **Didn't update** and why:

- **"Its work kept running":** a task was still working with it; try again once it's done.
- **"Back on 0.167.0":** the new version didn't answer, or its sign-in stopped working, so Ducter
  put the previous version back. Nothing else changed.
- **"Its updater ran, but the version didn't change":** the agent's own updater said it was done
  without changing anything. Run `ducter update --agents --check` to see how it was installed,
  then update it the same way yourself (for example `brew upgrade --cask codex`).
- **No Update button:** a copy that came with the Codex app updates with that app, and one
  installed in a way Ducter can't tell is left for you to update where it came from.

## Still stuck?

In the Mac app, choose **Help → Report a problem…**. Ducter collects its check of your Mac, the
versions and its recent log lines with secrets removed (your conversation only if you tick it),
shows you what it would attach, saves it as a .zip on your Desktop, and opens a GitHub issue
with the basics filled in. Nothing is uploaded: you attach the .zip yourself. On a server,
`ducter report` does the same and prints the issue link.

Or open an issue on [GitHub](https://github.com/wey-gu/ducter/issues) yourself with what you
did, what you expected, and the last lines of the log. Leave out anything private (codes,
addresses, tokens).

## Start over on a server

To remove Ducter from a Linux server completely and install it fresh (as the same user, for
example `root`):

```sh
ducter uninstall --all --yes     # the service, the ducter command, ~/.ducter, the PATH lines, Ducter's site in Caddy
curl -fsSL https://ducter.ai/install.sh | sh -s -- --service
ducter domain ducter.example.com # if you use a domain: HTTPS again, and a new code
ducter tailscale                 # or, with Tailscale: HTTPS at its Tailscale name, and a new code
```

It says what it removed and what it kept: Caddy stays installed, and so do your Claude Code and
Codex sign-ins, so the fresh install can use them right away. Devices you connected before
need a new code.

