# Changelog

## Unreleased

<!-- whats-new
zh: App 支持 iPad 和 iPhone Duo；宽屏时对话和手头的事并排
en: The app runs on iPad and iPhone Duo; wide screens show On hand beside the chat
zh: 伙伴也能用 DeepSeek Harness 或 pi 想事情
en: Your partner can now think with DeepSeek Harness or pi
-->

**iPad and iPhone Duo**
- The iPhone app is now one app for iPhone and iPad (same TestFlight link): every orientation,
  Split View, Slide Over and Stage Manager; turning or resizing keeps what you were reading and
  typing.
- On a wide screen the conversation stays on the left and On hand, or the task you opened, stands
  beside it. Narrower, it is one column as on a phone.
- With a keyboard: ⌘N new task, ⌘1 conversation, ⌘2 On hand, ⌘3 your devices, ⌘4 partner, ⌘,
  Settings, ⌘K the box to write in, Esc back one level. Sheets open in the middle on an iPad.
- An iPad calls itself an iPad: "this iPad" in the copy, "iPad · Ducter" in your devices.

**Your partner on DeepSeek Harness or pi**
- In Settings › Partner, DeepSeek Harness and pi can now go in the socket next to Claude Code and
  Codex, with DeepSeek's **V4 Pro** (smartest) or **Flash** (faster replies). A server with only a
  DeepSeek key works as it is: your partner thinks with DeepSeek Harness and says why.
- On every AI agent your partner only reads and decides: on these two as well, it can't change
  your files or run commands itself (checked, not just asked); its tasks do the work.
- On DeepSeek Harness, Ducter's own instructions are its partner's real system prompt, its long
  conversations compact where Ducter sets, and only the model call goes to DeepSeek.

**Under the hood**
- DeepSeek Harness 0.2.2-rc.1 verified; a look-up on the web is never answered from memory.

## 0.0.8

<!-- whats-new
zh: 设备卡片重做；主动提醒只在需要时开口
en: Redesigned device cards; heads-ups only when something needs you
-->

**Devices, as character cards**
- Each device is one card: its clay, its name (rename in place), one line of state, its AI
  agents as coins (a dot when one has an update; tap for details), a few switches, and one
  Disconnect. The command line folds into its computer's card.
- Updates say the truth: no stale "didn't update" once a device runs the new version, a Mac that
  does tasks for your server restarts its helper after the app updates, and release notes show in
  your language or not at all.
- Try it on 上网 now shows the page from your server's browser on the Mac app too.

**Heads-ups from your accounts, with restraint**
- Once you say yes after adding an account, your partner keeps an eye on mail, calendar, GitHub
  and chat, and speaks only when something needs you: a morning note of at most 3 things (none on
  a quiet day), and right away only when it can't wait.
- It never sends, replies, pays or deletes on its own, never keeps mail itself, and never says
  how much it read. 有用 / 这类不用告诉我 teach it.

**Nowledge Mem in tasks**
- Tasks use your own Nowledge Mem plugin under your partner's identity; turning memory off in
  Ducter turns it off inside tasks too. Ducter offers to install the plugin where it's missing, if
  you use Mem. Ducter stays complete without Mem.

**Under the hood**
- Lighter and cheaper background work (batched judging, no-tool one-shots), budgets on every
  prompt and tool list, Claude Code 2.1.322 and pi 1.5.1 verified.
- On Ubuntu 24.04 as a normal user, Ducter's browser gives the one line that lets its Chrome keep
  its sandbox.

## 0.0.7

**Your tasks know which computer to run on**
- With more than one computer (say a server and a MacBook that does tasks for it), your partner
  picks the computer and the AI agent together, from what the task needs: a repo, browsing, your
  signed-in sites, a Mac app, a long run. Each task says where it runs ("在 hel 上 · 用 Ducter
  自己的浏览器"), and why on a tap.
- It asks only when it matters: the right computer is asleep (wait for it, the default, or do it
  elsewhere now), or a task would get more access, like your Chrome. Equal computers never ask.
- Switch who and where from one sheet. Tasks move between computers (a repo task pushes its
  branch first); New task offers a computer when there's a real choice.
- "我要合电脑了": one card moves what can move to an always-on computer.
- A Mac that does tasks for your server can now browse too, in your Chrome first.

**Updating, calmly**
- Restart to update shows "Putting the new version in, back in a moment", then the window goes;
  no blank, frozen window. The new version says once that it was updated.
- "Up to date" always says when it was checked; Ducter checks every hour, and again as soon as a
  newer app connects.

## 0.0.6

**Notifications on the iPhone app, from any Ducter**
- The iPhone app now gets notifications from your own Ducter on any computer, with no Apple key
  on that computer: they go through a small notification relay at ducter.ai.
- What a notification says is encrypted on your Ducter and opened only on your phone; the relay
  and Apple see a neutral "Ducter needs you", a device token, and the time. Go and Hold still
  work from the notification.
- A Ducter with its own Apple key can keep sending directly. Disconnecting a phone stops its
  notifications at once.

## 0.0.5

**Accounts through OOMOL's hosted service work**
- Hosted by OOMOL now connects at the right address with a key from console.oomol.com/api-key:
  a **Get a key** button opens the page, the key is masked with Show, and Return adds it. After
  adding, it says which accounts it can now read (Gmail, Discord, …), or that none are connected
  in OOMOL yet, with a link.
- Every refusal says why (no key, wrong key, can't reach) in the warning look, never in the
  success look.

**Devices, tidier**
- The command line on a computer folds into that computer's card ("The command line is
  connected too") instead of showing as its own device.
- Every card renames in place, phones and the home included; two phones with the same name get
  "· 2". Cards say what each device is in plain words, when it was last seen, and what it does.
- **Let this Mac do tasks for your server:** one switch on the Mac's card (and in Settings › Where
  it runs). It keeps running in the background and at login; turning it off removes it and
  disconnects it on the server. `ducter service install --worker` works on a Mac too.
- The right side of Devices is one scroll; nothing is clipped.

**Each AI agent's version**
- Device cards show the version of Claude Code, Codex, pi and DeepSeek Harness on each computer,
  where that copy came from, and an Update button when its own channel has a newer one. It waits
  until nothing is using it, checks the new version answers, and goes back where it can.
  A copy that came with the Codex app updates with the app. `ducter update --agents`.
- The night update (off by default) only installs versions Ducter has checked.

**Browsing, easier to trust**
- **Try it** on 上网 opens a live view of a page in Ducter's own browser; `ducter browser check`
  does the same from the terminal. Browser results say which browser and machine they came from.
- Your partner tells you a task's result in your language, even when the AI agent reported in
  English.

**Phone and site**
- ducter.ai fits every phone width; docs tables read as lists on narrow screens.
- Settings choices on the phone stack instead of spilling out of their pill.

## 0.0.4

**Update in place, from the app**
- Each computer's card in Devices shows its Ducter version and, when a newer one is out, an
  Update button. The update downloads from GitHub, checks its checksum, waits for running work to
  reach a safe point, restarts, and puts the old version back on its own if the new one isn't
  healthy. `ducter update [--all] [--check]` does the same from the terminal; an optional night
  update runs in quiet hours.
- Device cards are redone: rename a computer by clicking its name, disconnect with a confirm.

**A Ducter on a server can browse**
- Add 上网 / Browse the web on a Linux server with one tap (or `ducter ability add browser`):
  tasks browse in Ducter's own headless Chrome.
- When a site needs you to sign in, a card opens a live view on your Mac or phone and you sign in
  yourself; the AI agent sees nothing meanwhile and never reads password or code fields. Signed-in
  sites are listed per computer, with Sign out.

**Settings, in one place**
- The Mac app's Settings is one window with tabs: Partner, Notifications, Accounts, Look and
  sound, Where it runs, Updates and about. The phone has the same sections.
- The Partner tab shows what your partner actually thinks with, on the computer it lives on: a
  Codex-only server says Codex, and only signed-in AI agents can be picked.
- What your partner does by itself and what it asks you first is written in everyday words.

**An opened task reads like the agent tells it**
- The agent's own words come first; the steps between them fold into one line you can open.
  Steps say what was done, and a "not found" while looking around is no longer shown as an error.
- What you asked sits in a small card. Keys and tokens you paste are hidden everywhere Ducter
  shows a task (the home hides them before anything leaves it).
- When the agent is waiting for you, its question sits right above the box you answer in.

**First look**
- Your partner greets you by name and time of day, with everyday things to start with, taken
  from what your Ducter knows (your accounts, recent tasks, folders), not developer examples.
- Each AI agent has its own clay coin (pi's carries its logo; the others their names, as their
  makers' terms ask), and it moves while its task works.

**Command line**
- When the Mac app is connected to a Ducter on a server, `ducter status`, `say`, `task` and the
  other home commands go there and say so (`→ your.server`); machine commands stay on this
  computer, and `--local` forces it. `ducter connect` / `disconnect` for any computer.

**Known limits**
- Coming from 0.0.3, update once with the installer (`curl -fsSL https://ducter.ai/install.sh | sh`);
  from 0.0.4 on, the Update button and `ducter update` do it.
- In-place updates and server browsing were tested with fakes and a local Chrome, not yet on a
  real server: please report anything odd.

## 0.0.3

**Servers that just work**
- `ducter domain your.domain`: checks your DNS, sets up HTTPS with Caddy, and prints a code for
  your phone and Mac. It tells apart "DNS or ports" from "Ducter isn't running" and says what to
  run next.
- After install, `ducter` works right away in the same shell; the service survives logout and
  reboot.
- A server with only Codex signed in now uses Codex for your partner.
- `ducter uninstall --all --yes` cleans up everything Ducter added, for a fresh start.

**For AI agents**
- Skills in `skills/` (deploy, operate, troubleshoot), also at
  `https://ducter.ai/skills/<name>/SKILL.md`, so your own agent can set up and run Ducter.

**iPhone**
- The iPhone app is in public beta: https://testflight.apple.com/join/Z4GvWt7t

**Mac**
- Settings › Connect to a Ducter on another computer, and back again.
- Folder tasks show only what changed and the Undo; no stray file count.

## 0.0.2

**Talk to it like a messaging app**
- The conversation reads like iMessage: your words and your partner's in bubbles, a question as
  one small card with its action on the button, and plainer, shorter replies with no file paths
  or jargon unless you used them.
- The opened task shows what it did one quiet line per step, and On hand asks one question at a
  glance.

**Start work yourself**
- New task (⌘N): pick where, who, and say what; it starts right away with your own words.
  On hand can group tasks by project, with each branch and its changes.
- The `ducter` command can talk too: `ducter task`, `ducter say`, `ducter tail`, `ducter answer`,
  `ducter open`, `ducter merge`, `ducter undo`.

**Ordinary folders are safe to hand over**
- Before a task changes a folder that isn't a git repo, Ducter keeps a copy. You see what changed
  in plain words and can undo it all with one tap for 7 days.

**Better and safer under the hood**
- AI agents use their own browser and computer use first (in your Chrome, in a window of their
  own); Ducter's browser is the fallback.
- Your partner and tasks run on small 200K context windows, and your partner can only read and
  start tasks, never change files itself.
- A task's "done" is checked against its evidence; tasks only see their own part of the record.
- Quiet hours are on by default (23:00–08:00).
- Memory in Nowledge Mem is kept under your partner's own identity.

## 0.0.1-rc.1

A release candidate for 0.0.1: the same build, cut first to check the release pipeline end to
end (signing, notarization, the Linux bundles). The notes are those of 0.0.1 below.

## 0.0.1

The first early preview. Ducter is a personal AI you run yourself: you talk to one partner, and it
hands the work to AI agents on your own machines and comes back when it's done, with proof.

**Talk to one partner**
- One conversation with a named partner. It answers right away and starts the work at the same
  time; you see its words, not its plumbing.
- The partner thinks with Claude Code or Codex, signed in as you, on your existing plan.
- It can remember what matters across days through Nowledge Mem if you use it, and keeps long
  conversations in view on its own.

**Work that runs while you're away**
- Tasks run on Claude Code, Codex, pi or DeepSeek Harness, each in its own copy of your repo.
  A task reports back with what changed and the checks that passed; you merge with one tap.
- **On hand** shows every task at a glance and what is waiting for you. Decisions come with a
  default, and nothing that can't be undone happens without your Go.
- Keep going until a goal is met ("until CI is green"), wait for something to happen, or run a
  routine on a schedule.

**Your devices and accounts**
- A Mac app (Apple silicon, signed and notarized), a phone web client, and a server mode for a
  Linux machine. Another computer can do tasks for Ducter too.
- With OOMOL's `oo` signed in, one tap lets the partner read your mail, calendar and other
  accounts. Reads are logged; anything it would send or change waits for your Go.

**Install**
- `curl -fsSL https://ducter.ai/install.sh | sh` on a Mac with Apple silicon or a Linux machine.
  It checks the download's checksum and, on a Mac, Apple's notarization before installing.

**Known limits**
- Early preview: expect rough edges. Intel Macs are not supported yet.
- See the docs at https://ducter.ai/docs for install and what each page does.
