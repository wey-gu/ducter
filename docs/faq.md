---
title: Questions people ask
description: Short answers about what Ducter is, what it costs, what it runs on, and what it can do today.
order: 9
---

# Questions people ask

### What is Ducter, in one sentence?

A personal AI on your own computers: you talk to one partner, it hands the work to an AI agent
you already use, and it comes back when the work is done, with how it checked.

### Does it cost anything?

Ducter itself is free and open source (Apache 2.0). The AI work runs on your AI agent's plan,
so it counts against that plan's limits like any other session.

### Which AI agents does it work with?

Claude Code and Codex, signed in with your own account. You need at least one. Your partner
thinks with Claude Code; choosing Codex for it instead is coming soon.

Ducter can also hand tasks to **pi** and **DeepSeek Harness**, which run on an API key you pay
for by use rather than a plan. If one of them is installed and has its key, ask your partner to
use it for a task ("do this with DeepSeek Harness"). Choosing them from the app, and typing a
DeepSeek key into Devices, are coming soon. Your partner itself running on pi or DeepSeek
Harness is coming soon too, once each has been checked as carefully as Claude Code and Codex.

### What does it run on?

The app runs on Macs with Apple silicon. Ducter also runs on a Linux server, which you reach
from your Mac or your phone. Windows isn't supported. The iPhone app is in public beta through
[TestFlight](https://testflight.apple.com/join/Z4GvWt7t); the phone version also opens in your
phone's browser.

### Where do I download it?

Paste `curl -fsSL https://ducter.ai/install.sh | sh` into Terminal: it installs the app and opens
it. Or download the `.dmg` from the
[latest release on GitHub](https://github.com/wey-gu/ducter/releases/latest), drag **Ducter** to
**Applications**, and open it. You can also build it from the source. See [Install](install.md).

### Do I need to know about git or "agents"?

No. Write what you want, the way you'd ask a colleague. Coding tasks use git behind the scenes, so each one works on its
own branch, and nothing reaches your main branch until you choose **Merge into main**.

### What happens when I close the window?

Nothing stops. Ducter keeps working, and the Dock icon brings the window back. To stop
everything, choose **Stop Ducter** in the menu. See [Your devices](devices.md#stop-and-wake).

### What if my Mac goes to sleep?

Tasks on a sleeping Mac wait and carry on when it wakes. If you want work to go on through the
night, put Ducter on [a server that stays on](install.md#a-linux-server-that-stays-on).

### Will it bother me all the time?

No. Silence means things are going fine. Ducter comes to you when a decision is yours to make,
always with a suggested default, and your phone stays quiet during quiet hours (23:00 to 08:00
until you change them).

### Can I see what a task is doing?

Any time. **On hand** shows every task; open one to read *What it did*, see its changes, and
write to it directly while it works.

### Can I start a task myself, without asking Ducter?

Yes. Press **⌘N** in the Mac app, or **New task** at the top of **On hand** (on the phone, the
**＋**). Pick where it works (a repo and the branch it starts from, or no particular place), who
does it (the best fit is already picked, with why), and write what to do. Your words go to it as
they are. Ducter tells you the result when it's done, like any other task. On the Mac, **On
hand** can also group tasks **By project**, with each task's branch and how many lines it
changed; the **+** on a project starts a new task there.

### Does it remember me?

It remembers your conversation. With [Nowledge Mem](https://mem.nowledge.co) it also starts out
knowing who you are and what you're working on, from the same memory your other AI tools use,
and its reply's **Details** shows **Noted** when it saves something.
See [Privacy and safety](privacy-and-safety.md#memory-with-nowledge-mem).

### Can it use the web?

Yes, on a Mac. When your AI agent has its own browser (Codex with the Codex app, or Claude
Code with the Claude extension connected), it works in your Chrome, in a window of its own;
otherwise it uses Ducter's own Chrome window. Signing in, submitting forms and paying are left
to you. See [Browsing the web](devices.md#browsing-the-web).

### Can it read my email or calendar?

Yes, when you ask. On **Partner › Accounts it can read**, tap **Use these accounts** if you use
oo, or add an address and key. Reading just happens; sending or changing anything waits for
your **Go**. See [Accounts your partner can read](accounts.md).

### Can it work with the AI agent in my terminal?

Not yet; it's coming soon. With Nowledge Bridge, part of
[Nowledge Mem](https://mem.nowledge.co), the Claude Code or Codex session you have open in a
terminal will be able to hand your partner a job, and your partner will be able to ask that
session what it knows. Either way, your partner checks with you first.

### Can it use my other apps, my phone, or make calls?

Not yet. Those are coming later.

### Can I rename my partner?

Yes. You choose a name the first time you open Ducter, and you can change it any time under
**Partner** with **Rename**. See [Your partner and settings](settings.md#partner).

### Which languages does it speak?

English and Chinese. The app follows your system language, and your partner answers in the
language you write in, unless you pick one under **Partner › How it talks**.

### Can my family or team share one Ducter?

Not yet. Ducter is personal, and running it on a computer other people log in to isn't
recommended for now. See [Privacy and safety](privacy-and-safety.md#who-can-reach-your-ducter).
