---
title: When something goes wrong
description: Run the check-up, find the logs, and fix the problems people usually hit.
order: 9
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
`ducter up --port 7790`.

### `ducter: command not found`

`~/.local/bin` isn't on your `PATH` yet. Ducter prints the one line to add when you install it;
after adding it, open a new Terminal window. Until then you can run `~/.local/bin/ducter`.

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

Choosing **Browse the web** opens **Set up browsing**, three small steps that check themselves
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

## Still stuck?

In the Mac app, choose **Help → Report a problem…**. Ducter collects its check of your Mac, the
versions and its recent log lines with secrets removed (your conversation only if you tick it),
shows you what it would attach, saves it as a .zip on your Desktop, and opens a GitHub issue
with the basics filled in. Nothing is uploaded: you attach the .zip yourself. On a server,
`ducter report` does the same and prints the issue link.

Or open an issue on [GitHub](https://github.com/wey-gu/ducter/issues) yourself with what you
did, what you expected, and the last lines of the log. Leave out anything private (codes,
addresses, tokens).
