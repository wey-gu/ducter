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
`ducter service status`.

### "This phone was disconnected from your Ducter"

The device was removed with `ducter devices disconnect`. Connect it again with a new code from
`ducter pair`.

### No notifications on iPhone

They only work once Ducter is on your Home Screen: in Safari tap **Share → Add to Home Screen**,
then open Ducter from that icon. Also check that it isn't between 23:00 and 08:00, when quiet
hours hold everything. **Send a test** under **Notifications** confirms it works.

### Browsing the web can't be added

If you use Codex, install the Codex app and turn on its computer use; if you use Claude Code,
open Chrome with the Claude extension signed in to the same account. Either one makes **Browse
the web** ready **In your Chrome**, with nothing more to set up.

Otherwise, choosing **Browse the web** opens **Set up browsing**, three small steps that check themselves
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

### An update didn't go through

The device's card says **Didn't update** and why. Nothing is lost:

- **"The download didn't match its checksum"** or **"didn't pass its check":** nothing was
  changed; try again later.
- **"Back on 0.0.3":** the new version was installed but didn't come up within a minute, so
  Ducter put the previous one back and restarted it. The one that didn't start is kept next to
  `ducter` as `ducter.failed`, and the version before the update as `ducter.prev` (on a server,
  usually in `~/.local/bin`). `ducter report` includes the log lines; please attach them to an
  issue.
- **"A merge or an undo is still running":** try again once it's done.

To go back to a version by hand on a server: `ducter update --to 0.0.3 --yes`, or move
`ducter.prev` over `ducter` and run `systemctl --user restart ducter`.

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
```

It says what it removed and what it kept: Caddy stays installed, and so do your Claude Code and
Codex sign-ins, so the fresh install can use them right away. Devices you connected before
need a new code.

