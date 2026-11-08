---
title: Questions people ask
description: Short answers about what Ducter is, what it costs, what it runs on, and what it can do today.
order: 6
---

# Questions people ask

### What is Ducter, in one sentence?

A personal AI you run yourself: you talk to one partner, it hands the work to Claude Code or
Codex on your own computers, and it comes back when the work is done, with how it checked.

### Does it cost anything?

Ducter itself is free and open source (Apache 2.0). The AI work runs on the Claude Code or Codex
plan you already have, so it counts against that plan's limits, like any other session.

### Which AIs does it work with?

Claude Code and Codex, signed in with your own account. You need at least one.

### What does it run on?

The app runs on Macs with Apple silicon. Ducter also runs on a Linux server, which you reach
from your Mac or your phone. Windows isn't supported. An iPhone app is coming soon; until then
the phone version opens in your phone's browser.

### Where do I download it?

A download is coming soon. For now, the Mac app is built once from the source, and the result
can be shared with anyone. See [Install](install.md).

### Do I need to know about git or "agents"?

No. You just write what you want. Coding tasks use git behind the scenes, so each one works on
its own branch and nothing reaches your main branch unless you choose **Merge**.

### What happens when I close the window?

Nothing stops. Ducter keeps working, and the Dock icon brings the window back. To stop
everything, choose **Stop Ducter** in the menu. See [Your devices](devices.md#stop-and-wake).

### What if my Mac goes to sleep?

Tasks on a sleeping Mac wait and carry on when it wakes. If you want work to go on through the
night, put Ducter on [a server that stays on](install.md#a-linux-server-that-stays-on).

### Will it bother me all the time?

No. Silence means things are going fine. Ducter comes to you when a decision is truly yours,
always with a suggested default, and your phone stays quiet from 23:00 to 08:00.

### Can I see what a task is doing?

Any time. **On hand** shows every task; open one to read *What it did*, see its changes, and
write to it directly while it works.

### Does it remember me?

It remembers your conversation. With [Nowledge Mem](https://mem.nowledge.co) it also starts out
knowing who you are and what you're working on, and you see **Noted** when it saves something.
See [Privacy and safety](privacy-and-safety.md#memory-with-nowledge-mem).

### Can it use the web?

Yes, on a Mac: it uses its own Chrome window to look things up and read pages. Signing in,
submitting and paying are left to you. See [Browsing the web](devices.md#browsing-the-web).

### Can it use my other apps, my phone, or make calls?

Not yet. Those are coming later.

### Can I rename my partner?

You choose a name the first time you open Ducter. Renaming it later in the app is coming soon.

### Does it speak Chinese?

Yes. Ducter is in English and 中文 throughout and follows your system language. Set
`DUCTER_LOCALE=zh` or `DUCTER_LOCALE=en` to choose.

### Can my family or team share one Ducter?

Not yet. Ducter is personal, and running it on a computer other people log in to isn't
recommended for now. See [Privacy and safety](privacy-and-safety.md#who-can-reach-your-ducter).
