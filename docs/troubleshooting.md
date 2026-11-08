---
title: When something goes wrong
description: Run the check-up, find the logs, and fix the problems people usually hit.
order: 7
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

### "One thing first: Claude Code: installed, not signed in"

Ducter works through your own AI plan, so Claude Code or Codex has to be signed in. Click
**Run in Terminal**, follow the sign-in, and come back: Ducter checks again by itself.

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

- *"The browser driver (cua-driver) isn't installed here yet"*: install cua-driver, then add it
  again.
- *"This device's browser driver (cua-driver) is too old"*: run `cua-driver update --apply`.
- macOS needs **Accessibility** and **Screen Recording** for **CuaDriver** (not for Ducter).
  Run `cua-driver permissions grant` and click Allow for both in System Settings → Privacy &
  Security.
- Google Chrome (or Microsoft Edge) needs to be in Applications.

### A website sign-in got lost

Ducter's browser window closes after about five minutes with nothing happening. If a slow
sign-in (a long form, a two-factor code) took longer, ask the task to try again; sign-ins that
finished are remembered.

### Start over as a brand-new user

Choose **Stop Ducter**, then delete the `~/.ducter` folder. This erases your conversation,
tasks and settings for good, so only do it if you mean it. The next start is a first run.

## Still stuck?

Open an issue on [GitHub](https://github.com/wey-gu/ducter/issues) with what you did, what you
expected, and the last lines of the log. Leave out anything private (codes, addresses, tokens).
