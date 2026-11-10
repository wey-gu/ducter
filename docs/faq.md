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

Claude Code and Codex, signed in with your own account, and pi and DeepSeek Harness with your own
key. You need at least one. Your partner thinks with Claude Code; when Claude Code isn't signed in,
it picks the first that is of Codex, DeepSeek Harness and pi, so a server with just one of them works.

Ducter also works with **pi** and **DeepSeek Harness**, which run on an API key you pay for by
use rather than a plan. If one of them is installed and has its key, ask your partner to use it
for a task ("do this with DeepSeek Harness"), or make it what your partner thinks with in
Settings › Partner (see [Your partner and settings](settings.md)). A server with only a DeepSeek
key works as it is: your partner thinks with DeepSeek Harness. Typing a DeepSeek key into Devices
is coming soon; until then it goes in the key file (see [Install](install.md)).

### What does it run on?

The app runs on Macs with Apple silicon. Ducter also runs on a Linux server, which you reach
from your Mac or your phone. Windows isn't supported. On iPhone and iPad there's one app, in
public beta through [TestFlight](https://testflight.apple.com/join/Z4GvWt7t). On Android there's the
Ducter app, from each release on GitHub, and it updates itself; any phone's browser works too.

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

### Can I edit a task's code myself?

Yes. Each coding task works in its own copy of your project, a folder named after the project and
its branch (such as `~/.ducter/worktrees/hawdb/fix-flaky-test`); the opened task on the Mac
shows the path.
On the Mac, **Open** at the task's top right shows it in Finder, opens it in Terminal, or opens
it in Cursor, Visual Studio Code or Zed, whichever you have. It shows when that copy is on the
Mac you're using.

### Can I start a task myself, without asking Ducter?

Yes. Press **⌘N** in the Mac app, or **New task** at the top of **On hand** (on the phone, the
**＋**). Write what to do first; it gets your words as you wrote them. Under the words, one row
says where it works (a folder, and for a repo the branch it starts from, or **No folder**), who
does it (the one marked **Suggested** is already picked, and the one you pick is remembered for
next time) and when it starts. Tap any of them to change it. **⌘↩** starts it; **⇧⌘↩** starts
it and keeps the card open for the next one, so you can start several in a row. Ducter tells
you the result when it's done, like any other task.

**When it starts** is **Now** unless you pick **At a time** (today, tomorrow or the day after,
at the time you type), **On a schedule** (every day, weekdays, one day a week, or every few
hours), **When something happens** (it opens now and waits for what you write, like "PR #1592's
CI passes") or **Keep going until…** (it tries again until what you write holds). See
[Waiting, keep going, routines](waiting-and-routines.md).

On the Mac, **On hand** can also group tasks **By project**: each folder you work in is a
project, with each task's branch, what it waits for or which try it is on, and how many lines it
changed; what starts later or repeats there sits in the same group. The **+** on a project
starts a new task there. To make a project yourself, choose **Add a folder** (at the bottom of
**By project**, or in the card's folder list) and pick a folder on your Mac; it becomes a
project with the folder's name, before any task runs there. If your Ducter lives on a server,
this works once your Mac does tasks for it (Settings › Where it lives › **Let this Mac do tasks
for …**): the folder stays on your Mac and tasks there run on your Mac. When your folders are on
more than one computer, the list says which computer each one is on.

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
