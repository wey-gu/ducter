# Changelog

## Unreleased

<!-- whats-new
zh: 每台电脑上的代码仓库直接出现在新建的文件夹列表里
en: Each computer's repositories are already in New task's folder list
zh: 在手机上也能找别的电脑上的文件夹
en: Find a folder on any of your computers, from your phone too
-->

**New task: folders on every computer**
- The folder list shows the repositories already on each of your computers (the most recently
  touched first), after the folders you used. When your Ducter lives on a server and you pick
  Claude Code on your Mac, it switches to your Mac's copy of the same project by itself.
- **Find a folder…** at the bottom of the list looks through any of your computers' folders, one
  level at a time from the home folder, repositories first, on the phone and in the browser too;
  **Use this folder** adds it as a project there. When a computer has no folders listed yet, the
  list says so and offers it, instead of only **No folder**.

## 0.0.17

<!-- whats-new
zh: 从手机更新 Mac 不再卡住
en: Updating your Mac from your phone no longer stalls
zh: 手机上的自动填写和「以后」能力图标回来了
en: Autofill and the coming-later abilities show their pictures on the phone
-->

**Fixes**
- **Update** on a Mac, asked from your phone, no longer stalls: the copy already checked when it
  was downloaded is not sent to macOS's Gatekeeper a second time just before the restart (that
  check could hang for two minutes, and the update was then dropped).
- The phone shows the Autofill tab's keyring and the **Use a computer** and **Use a phone** chips
  again, when your Ducter runs from the installed binary (a server).

## 0.0.16

<!-- whats-new
zh: 新建时能选别的电脑上的 AI agent
en: New task offers every AI agent, on whichever computer it is
zh: 新建时选模型和思考深度，下次还记得
en: Pick the model and how hard it thinks in New task; it remembers
-->

**New task: who, which model, how hard it thinks**
- **Who does it** lists every AI agent you have, on every computer. When your folder is on your
  server and Claude Code is on your Mac, Claude Code is there, marked with the computer it's on: picking it moves the
  task to the same project on your Mac (with its branch), or asks you to pick a folder there.
- Under the AI agent you pick: its **Model** (the ones your account offers, read from the agent
  itself) and its **Effort** (**Low**, **Medium**, **High**, **Extra high**, **Max**, as that
  model offers). The suggested model and the model's own default are already picked; your last
  choice is remembered for each agent. The task keeps its effort when it resumes.
- `ducter task --agent claude-code/opus --effort high` does the same from the command line.

**A task's working copy, in your words**
- A task's folder and branch keep the language you wrote in: a task called 修复登录页 works in
  `ducter/修复登录页`, not `ducter/task`.
- **Open** lists every terminal you have that can open a folder: Terminal, iTerm2, Ghostty, Warp,
  and con (from its 0.1.0-beta.177).

## 0.0.15

<!-- whats-new
zh: 在 Mac 上加文件夹，家在服务器上也行
en: Add a folder on your Mac even when Ducter lives on a server
zh: 一键打开任务的工作副本：Finder、终端或编辑器
en: Open a task's working copy in Finder, Terminal or your editor
-->

**Your own development work, beside Ducter's**
- **Add a folder** works on your Mac when your Ducter lives on a server: pick the folder there,
  and tasks in it run on that Mac (it needs to be doing tasks for that Ducter). Its branches show
  in **New task**, and when folders are on more than one computer each says which.
- A task's working copy now has a name you can tell apart: `~/.ducter/worktrees/<repo>/<branch>`.
  The opened task shows its path, and **Open** takes you there: **Show in Finder**, **Open in
  Terminal**, or your editor (Cursor, Visual Studio Code, Zed).
- **New task** is **新建** in Chinese.

**Calls, and what's coming**
- **Calls** is on your Ducter's card in Your devices again: tap **+** to connect Tuwa, or open it
  to set the daily limit. **Use a computer** and **Use a phone** show there as coming later.

**Apps and updates**
- The iPhone, iPad and Android apps say when the Ducter they talk to is older than the app, with
  **Update it**.
- A Mac too old to update from your phone says the one step: update it once on that Mac.
- The Mac app keeps its own log (`~/Library/Logs/co.nowledge.ducter/app.log`), and **Restart
  Now** asks again if the app hasn't quit.
- Autofill has its own clay keyring.

## 0.0.14

<!-- whats-new
zh: 伙伴能替你打电话、付款前给你看清楚再付
en: Your partner can make calls for you and pay with your OK on every payment
zh: 看它在浏览器里做事，随时换你来，用完还给它
en: Watch its browser work, take a turn yourself, then hand it back
-->

**Phone calls**
- Your partner can call a restaurant, a clinic or a shop for you, through Tuwa (you need a Tuwa
  account; connect it in Settings › Accounts by approving on your phone). Every call shows you
  who, what it may say and what it won't, whose voice and the likely cost, and waits for your
  **Call**.
- A question from the other end comes to you at once, even in quiet hours; the result says what
  was agreed. It never calls in your quiet hours or outside 9:00–20:00 where the other person is,
  keeps to a daily limit, starts every call by saying it's an AI calling for you, and never
  dials emergency numbers. Mainland China numbers aren't reachable yet.

**Watch it browse, take a turn**
- **Watch it browse** shows Ducter's browser live on your phone, iPad, Android or Mac, with what
  it's doing in one quiet line. **My turn** lets you use the page yourself (sign in, a two-step
  code, a payment check) while it can't see or touch it; **Hand it back** and the task goes on,
  told what changed.

**Autofill**
- Save a sign-in, a card or your travel details once in Settings › Autofill. Your partner fills
  them in for you without ever seeing them, on the right site only. Every payment asks first:
  the shop, the amount, what for and the card, with its security code typed each time and never
  kept.

**Starting work by hand**
- **New task** is one quick card: the words first, then one row for the folder, branch,
  computer, who does it and **When it starts**: **Now**, **At a time**, **Every …**, **When
  something happens**, or **Keep going until …**. ⌘↩ starts it; ⇧⌘↩ starts it and keeps the
  card open for the next one.
- **Add a folder** makes a project of your own; On hand's **By project** shows each task's kind
  and when it runs next.

**iPad and foldables**
- On a wide screen, On hand or an opened task can take the whole screen, as on the Mac, and come
  back beside the conversation in one move (⌘2, the header's button or Esc).

**Updates and settings**
- The Mac app finds a new version even when GitHub is busy, and you can update a Mac from your
  phone: it downloads, checks it, and restarts once its work is at a safe stop.
- The Accounts card names every account plainly (Gmail · weyl.gu, Slack · your workspace) and
  says why one isn't read; Settings' switches, headings and buttons line up on every screen.

## 0.0.13

<!-- whats-new
zh: 让伙伴看邮件，它会用你真正连着的账号
en: Ask about your mail and your partner uses the accounts you connected
zh: 安卓 App 在设备卡片上显示为 App
en: The Android app shows as the app on its device card
-->

**Accounts through OOMOL**
- Asking your partner about your mail no longer ends in "not connected": OOMOL's search lists
  every service it knows, and Ducter now offers your partner only the ones you have an account
  for (Gmail, Slack…), asking each of them when the first answer has none.

**Android**
- The Android app's device card says it's connected through the Ducter app, not the browser,
  even after you rename the phone.

## 0.0.12

<!-- whats-new
zh: 安卓 App 来了：从 GitHub 发布页下载，之后自己更新
en: Ducter for Android: get it from the GitHub release; it updates itself
zh: 折叠屏打开时，对话和手头的事分在折痕两边
en: On a foldable, the conversation and On hand meet at the fold
-->

**Android**
- A Ducter app for Android, with each release on GitHub (`Ducter-<version>-android.apk`): scan
  the QR code from `ducter pair`, paste the link, or type the address and code, and it opens
  straight into the conversation, edge to edge, in light or dark.
- It updates itself: when a version is out, one card says what's new in your language; **Update**
  downloads it from GitHub, checks it against the release and that it's signed the same way, and
  hands it to Android. Touch and hold the icon › **Check for updates** to ask now.
- On a foldable, open like a book: the conversation on one side of the fold, On hand or the task
  on the other. Half-open on a table: the conversation above, On hand below. Folded: one column.
  Folding and turning never reload the page. Chrome on a foldable gets the same split.
- Notifications in the Android app are not in this version; Ducter in Chrome still notifies you.

**Your agents, in clay**
- Each AI agent's coin is now its own mark, sculpted in clay: Claude Code's starburst, OpenAI's
  knot for Codex, DeepSeek's whale, pi's blocks. Signed out, the same shape in grey clay; at work,
  it rocks gently on its spot.

## 0.0.10

<!-- whats-new
zh: 又能读 OOMOL 里的邮件和账号了
en: Mail and accounts through OOMOL work again
zh: 设备名字旁有支小铅笔，点一下就能改
en: A small pencil by each device's name: click to rename it
-->

**Accounts through OOMOL**
- OOMOL renamed the tools its hosted service offers, and every read of your mail failed. Ducter
  now works out what each of a connection's tools does from what it takes, so a rename on their
  side keeps working; one it can't make sense of any more still works as a plain connection,
  asking before anything that isn't marked read-only.

**Renaming a device**
- A quiet pencil sits by every name you can change, on the Mac and on the phone; this Mac can be
  renamed too (it changes the name your other devices see). Long names wrap on the phone's card.

## 0.0.9

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
