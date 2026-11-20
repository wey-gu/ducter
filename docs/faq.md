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

Claude Code and Codex, signed in with your own account, pi with your own key, and DeepSeek Harness with
a DeepSeek key or your DeepSeek account (signed in in its Mac app). You need at least one. Your partner thinks with Claude Code; when Claude Code isn't signed in,
it picks the first that is of Codex, DeepSeek Harness and pi, so a server with just one of them works.

Ducter also works with **pi** and **DeepSeek Harness**, which run on an API key you pay for by
use rather than a plan. If one of them is installed and signed in, ask your partner to use it
for a task ("do this with DeepSeek Harness"), or make it what your partner thinks with in
Settings › Partner (see [Your partner and settings](settings.md)). A server with only a DeepSeek
key works as it is: your partner thinks with DeepSeek Harness.

### Can I use it without a Claude or ChatGPT subscription?

Yes. Paste an API key instead: when you first open the app, under Claude Code and Codex, choose
**Paste a key**; or, whenever nothing is signed in, paste it in the card in the conversation. A key
from DeepSeek, Kimi, Zhipu GLM, OpenAI, Anthropic, OpenRouter, Google Gemini, xAI or Groq works.
Ducter tells which one it is, checks it without spending anything, and says what it found in plain
words: it works, the key is wrong, the account has no balance left, or the provider can't be
reached from where you are (from mainland China, OpenAI, Anthropic and Google usually need a proxy;
DeepSeek, Kimi and Zhipu don't). Your partner then thinks with it, through DeepSeek Harness or pi.
The key stays in Ducter on that computer, in a private file, and never appears in the conversation.

No key at all? Under the field, **No key yet?** shows the quickest way to get one from where your
Ducter runs: a free Google Gemini key with a Google account (on the free tier, Google may use what
you send to improve its models, so don't send anything sensitive), or OpenRouter's free models
(about fifty questions a day); in mainland China, Kimi's ¥15 of trial credit for a mainland mobile
number, or DeepSeek with a small top-up. You make the key on the provider's own page; Ducter never
does. Anything you write to your partner before the key works is kept, and answered first as soon
as it does.

If the computer doesn't have pi yet, Ducter puts it in its own folder by itself (no Terminal, no
administrator password) and says **Setting up…** meanwhile; only if that fails does it open pi's own
installer in Terminal.
Alibaba Cloud Model Studio (Qwen) keys are recognised but can't be used yet: that's coming soon. On
a server, `ducter key add < key.txt` does the same from the terminal (see [Install](install.md)).

### How does my partner know what I was working on?

Only when you ask. The first time you open Ducter, if Claude Code or Codex were used on your home
computer lately, one of the things your partner offers is **Pick up what I was doing in Claude Code
lately**. Tap it, and your partner looks at what those agents keep about your recent work: each
conversation's name, the folder it ran in, when, and your first and last words there. It never
opens your folders or your code, and any key you pasted into a prompt stays hidden. It names two or
three things you might want to pick up ("Yesterday you were on 'Fix the flaky test' in hawdb. Want
me to pick it up?"); **How I know** under each says which agent, which folder, when and on which
computer. Those few lines are seen by you and by the AI you chose, since your partner thinks with
it; nobody else. **Leave this folder out** keeps one folder out for good. **Stop looking** turns it
off everywhere and your partner forgets what it saw; Settings › Partner has the same switch.

### What does it run on?

The app runs on a Mac with Apple silicon (M1 or later). Ducter also runs on a Linux server, which you reach
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
its branch, in the words you used for the task (such as `~/ducter/worktrees/hawdb/fix-flaky-test`,
or `…/hawdb/修复登录页` for a task written in Chinese); the opened task on the Mac shows the path.
Tasks started before this version keep theirs in `~/.ducter/worktrees`.
On the Mac, **Open** at the task's top right shows it in Finder, opens it in Cursor, Visual
Studio Code or Zed, or opens it in Terminal, iTerm2, Ghostty or Warp, whichever you have, the one
you used last first. It shows when that copy is on the Mac you're using.

### Can I start a task myself, without asking Ducter?

Yes. Press **⌘N** in the Mac app, or **New task** at the top of **On hand** (on the phone, the
**＋**). Write what to do first; it gets your words as you wrote them. Under the words, one row
says where it works (a folder, and for a repo the branch it starts from, or **No folder**), who
does it (the one marked **Suggested** is already picked, and the one you pick is remembered for
next time) and when it starts. Tap any of them to change it. Under the AI agent you pick, choose
its **Model** and its **Effort** (how hard it thinks: **Low** to **Max**, as that model offers);
the ones it starts with are the suggested model and the model's own default, and your last choice
for that agent is remembered. Every AI agent you have is in the list, on whichever computer it is:
one on another computer says so (*on MacBook*), and picking it moves the task to that computer,
to the same project there, or asks you to pick a folder there. **⌘⏎** starts it; **⇧⌘⏎** starts
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
starts a new task there.

### How do I move a task to another model, like one that just came out?

Four ways, all the same switch:

- **Under the task's box**: the model it's on and its effort (**GPT-6.2-Sol**, then **Low**) are
  always there while it can be switched. Tap it: slide the effort along its levels, or tap the
  model for the list. It says from when: **From its next turn: GPT-6.2-Sol**.
- **Ask your partner** in the conversation: "这个任务换成 6.2 sol" or "use Opus for the login
  task". It finds the model in that agent's own list, so the short name you'd say is enough;
  when it could be more than one, it asks which.
- **Open the task › Switch who does it**: the first row is the **Model** of the agent doing it,
  then its **Effort**. Tap a model and it takes it at that model's own default effort.
- **Type in the task's box**: `/model gpt-6.2-sol` or `/effort high`.

The task keeps going in the same conversation, remembering everything said so far; nothing
starts over. If it's in the middle of a step, that step finishes on the old model and the next
one uses the new one.

The list of models comes from the AI agent itself (Claude Code or Codex on that computer), so a
model released last night is there as soon as you update the agent. You don't need a new
version of Ducter for it. A new task you don't pick a model for runs on your agent's own
default: for Codex, the `model` in your `~/.codex/config.toml`. Change that, or pick a model on
**New task**, to use a newer one by default.

### Can my partner itself use another model?

Yes. In **Settings › Partner**, under **What it thinks with**, **Which model** lists the models
your AI agent offers on the computer Ducter runs on: Codex's own list (GPT-6.2-Sol,
GPT-6.2-Astra, …) or Claude Code's. Tap one; your partner uses it from your next message, and
keeps its name, what it remembers and your conversation.

Or just ask it: "用 astra 跟我聊" or "switch yourself to Opus". When a short name could be more
than one model, it asks which.

### Does a project have to be a Git repository?

No. A project is any folder on the computer that does the work: your invoices, a trip plan, a
book draft. To make one, choose **Add a folder…** in the card's folder list (there is one for
each of your computers, saying which). It offers three ways, on that computer:

- **New folder on …**: type a name (like *Invoices*). Ducter makes the folder in that computer's
  Ducter folder (`~/ducter/projects`) and the card starts there. No Git needed.
- **Choose a folder on …**: look through that computer's folders one level at a time, starting
  from its home folder (repositories first); go in, then **Use this folder**. On your Mac, for the
  Mac itself, this is Finder's own picker. If your Ducter runs on a server, the server's row
  shows the server's folders, never your Mac's. To add a folder on your Mac for a Ducter on a
  server, your Mac does tasks for it (Settings › Where it runs › **Let this Mac help … with
  tasks**), and the Mac's own **Add a folder…** row appears.
- **Clone from a Git address**: below.

Each becomes a project with the folder's name, before any task runs there. Ducter doesn't go
looking for your code: the list shows the folders you used and added, and the projects in each
computer's Ducter folder. Only folders inside a computer's home folder are shown, never the files
in them. When your folders are on more than one computer, the list says which computer each one
is on.

### Can I start from a repository I don't have yet?

Yes. In the folder list choose **Add a folder…** for the computer you want it on, then **Clone
from a Git address**, from your phone too, and paste its address: `https://github.com/owner/repo`, `git@github.com:owner/repo`
or just `owner/repo` for GitHub. That computer clones it into `~/ducter/projects`, using its own
git sign-in (so a private repository works where you're signed in to git), and the card starts
there. It shows **Cloning…** while it works (a big repository takes a few minutes, at most ten),
and says plainly if the repository isn't there, that computer has no access to it, or it can't
reach the address. If the same repository is already in `~/ducter/projects`, it simply uses it.

### How do I sign in to GitHub on my server?

Right where you clone. For a GitHub address, the clone field says whether that computer is signed
in to GitHub, and if it isn't, offers **Sign in to GitHub on …**. Tap it: Ducter shows a link
(`github.com/login/device`) and a short code. Open the link on any device (your phone is fine),
enter the code, and confirm it on GitHub. A few seconds later the field says who it signed in as,
and a clone that failed for access tries again by itself. From then on that computer's own git,
and every task there, can reach your private repositories.

Prefer a key? Choose **Use a key instead** and paste one you made in GitHub's Settings ›
Developer settings (it needs at least *repo* and *read:org*). It goes to that computer only;
Ducter doesn't keep it.

This uses GitHub's own command-line tool, `gh`, on that computer. If it isn't installed there,
the field says so: install it (`brew install gh` on macOS, `sudo apt install gh` on Ubuntu), then
**Check again**. In a terminal on that computer (over SSH, say), `ducter git login` does the same;
`ducter git login --with-token < key.txt` uses a key, and `ducter git status` says who is signed in.

If a computer says **Ducter on … needs an update**, update it in Devices first: an older Ducter
can't add folders or clone there.

### What does uninstalling remove?

`ducter uninstall --all` (or **Remove everything** in the Mac app) removes Ducter's data and the
tasks' working copies, in `~/ducter/worktrees` and in `~/.ducter`. It never removes
`~/ducter/projects`: the projects Ducter cloned are yours, and the list it shows before removing
anything says so.

### Does it remember me?

It remembers your conversation. With [Nowledge Mem](https://mem.nowledge.co) it also starts out
knowing who you are and what you're working on, from the memory it shares with the AI tools you use elsewhere,
and it can tell you how you did something in one of them ("how did I fix this in Codex?"),
and its reply's **Details** shows **Noted** when it saves something, with **Undo** right after.
Its first hello says when your Nowledge Mem is there; ask it *What do you remember about me?* and it
looks then, not before.
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

### Can it work with my own Claude Code, Codex or other agents?

Coming soon: Nowledge Mem is still opening this up on its side. When it does, any agent of yours
connected to Nowledge Mem (such as Claude Code, Codex or Grok Build) can message your partner
through Nowledge Bridge: **Settings › Talk with your other agents** lets the session you have open
hand your partner a job or ask for your call, and lets your partner ask that session what it knows. Either way, your
partner checks with you first. Once Nowledge Mem is signed in, it connects by itself; one switch on
that page turns it all off.

What it needs, and what you can do today from that same section:

- [Nowledge Mem](https://mem.nowledge.co), the app on your computer or a cloud workspace, in a version that
  connects agents (free to download and sign up). If yours doesn't yet, the section says so.
- Nowledge Mem's command-line tool, 0.10.118 or later, on the computer Ducter runs on. If it's
  missing or older, the section shows **Install** or **Update**: one tap, done the way Nowledge
  Mem's own guide says (with pipx). On a Linux server where Ducter can't add pipx itself, it
  shows the one command to run there, with **Copy**. If the tool came with the Nowledge Mem app,
  update the app. If your copy was installed in a way that bypasses the system's Python
  protection, the section offers **Move it**: one tap puts in Nowledge Mem's recommended
  install, and you stay signed in.
- That tool signed in: in Nowledge Mem, open **Settings › Connectors › Any AI agent**, click
  **Generate connect link & copy prompt**, paste everything it copied and tap **Sign in**. The link
  works once, within 15 minutes, and isn't kept.

If Nowledge Mem isn't ready on its side yet, the section says so; nothing is wrong on yours, and
your memory works as usual.

### My other agent says it sent my partner a message. Where is it?

Messages from your other agents come in by themselves within about a minute. To look now, just
say so: "check my messages" or "查看来信". Your partner looks right away, answers what you asked
it to, and tells you what came. Your partner reads its messages in every place you share in
Nowledge Mem, and answers in the place a message came from. If nothing came although your agent
says it sent something, it didn't reach your partner: have your agent look your partner up again
by its name and send it again.

### Can a teammate's agent reach my partner?

The first time a teammate's agent writes to your partner, you see one card: who wants to reach
your partner, and what it wrote. **Let it** lets that agent ask your partner questions from then
on; your partner answers only with what you already share there, and anything else asks you
first. It can never start work on your computers. **Ignore** (the default) keeps it out; you can
undo that in Settings.

### Can it use my other apps, my phone, or make calls?

Yes, on a Mac: it can use your Mac's apps, apps on a phone of its own, and make calls.

- **Your Mac's apps:** **Use the computer** on a Mac's card lets a task use its apps in the
  background, once you turn on two macOS switches. Anything that sends, pays or deletes waits for
  your Go, and **Stop** ends it at once. See [Tasks in your Mac's apps](devices.md#tasks-in-your-macs-apps).
- **Apps on a phone:** on an Apple silicon Mac (the one Ducter runs on, or one that does tasks
  for it), **Use a phone** gives Ducter an Android phone of its own, running on that Mac. You install the apps and sign in yourself; anything that sends,
  pays or deletes waits for your Go. See [Ducter's phone](devices.md#ducters-phone).
- **Calls:** through Tuwa, or from your own Android phone and SIM (with a small cable kit and a
  live-voice API key). Every call waits for your **Call**. See
  [Phone calls](calls.md).

### Can I rename my partner?

Yes. You choose a name the first time you open Ducter, and you can change it any time under
**Partner** with **Rename**. See [Your partner and settings](settings.md#partner).

### Which languages does it speak?

English and Chinese. The app follows your system language, and your partner answers in the
language you write in, unless you pick one under **Partner › How it talks**.

### Can my family or team share one Ducter?

Not yet. Ducter is personal, and running it on a computer other people log in to isn't
recommended for now. See [Privacy and safety](privacy-and-safety.md#who-can-reach-your-ducter).
