# Changelog

## 0.0.49

<!-- whats-new
zh: 安卓开关开着的手机，连上就能被任务借用
en: A phone with its Android switch on is ready to lend at once
zh: 不再把你的手机活交给 Ducter 的模拟器
en: Work on your own phone no longer lands on Ducter's emulator
-->

**用这台手机 / Use this phone**
- A phone whose Android switch for Ducter is already on is added as soon as its app connects, however
  the switch got on. Before, it was added only if the switch turned on while the guide was open, so
  a phone set up in an earlier version stayed unadded and phone work went to Ducter's own phone.
- Taking it off on its card is remembered; a switch still on doesn't add it back.

## 0.0.48

<!-- whats-new
zh: 默认就会主动：每天早上把值得说的放一条里
en: Proactive by default: one morning note with what matters
zh: 和你其他 AI 的互通在真实环境跑通了
en: Talking with your other AI agents now works against real Mem
-->

**Proactive by default**
- A home that never chose how often to hear from the partner is on 每天最多 3 件 / Up to 3 a day:
  one morning note with what is worth saying, and urgent things at once.
- 不再需要 under the morning note now means 只说急的 / Only urgent, never off. If that happened
  before the partner learned trips, maintenance and billing, it asks once whether to bring the
  morning note back.

**Your other AI agents (Nowledge Bridge)**
- Checked against real Nowledge Mem: requests from your own agents reach you, questions go to the
  agent that wrote to you lately, follow-through stays quiet once they've answered, and a send whose
  outcome is unknown is never sent again as a new message.

## 0.0.47

<!-- whats-new
zh: 主动告诉你航班、维护、扣费，旧消息有变会更正
en: It tells you flights, maintenance, billing, and corrects itself
zh: 手头的事三栏并排；PDF、搜索都在 Ducter 里看
en: On hand sits beside a task; PDFs and find open in Ducter
-->

**The partner notices more, on its own**
- Trips coming up (flight time, when to be at the airport), maintenance on services you run, failing
  jobs, billing changes and shutdowns now reach the partner; it says them in time, joins them with
  your plans ("both before your 19:40 flight"), and corrects itself when something it said changed.
  Asked "anything for me?", it checks everything, calendar included, and answers in a few lines.
- Morning notes follow your own time zone.

**On hand beside the opened task**
- On the Mac and on wide screens (iPad, an open Fold), opening a task keeps On hand beside it, with
  the workbench on the right when there is room; ⌘⇧] / ⌘⇧[ walk the tasks. Each row shows one face
  for where it stands; a task that finished while you weren't looking shows its done face.

**Files, phones and routines**
- PDFs show their pages inside Ducter; ⌘F finds in a long file; file links expire after about a day.
- Phone work never asks for adb: if your Android phone is connected, one tap turns on 用这台手机
  there. On Android, the setup asks for restricted settings first, the connecting screen fits an
  open Fold, and a lent phone shows a notification with 停下.
- A phone that is asleep stays asleep until a task or 叫醒 wakes it; reconnects keep the last picture.
- Routines know when they run late, retry once safely, wait out a signed-out account, catch up once,
  and can watch for a change without spending anything until something changes.
- Tasks keep their harness's own tools; a few that compete with Ducter are left out.

## 0.0.46

<!-- whats-new
zh: 用浏览器的任务也有完整的工具了：改文件、搜网页都行
en: Browser tasks keep their full tools: edit files, search the web
zh: 任务始终用原装 harness 的 prompt，Ducter 只附加说明
en: Tasks always run on their harness's own prompt, plus a brief
-->

**Browser tasks keep their tools**
- A task that uses a browser now keeps Claude Code's own tools (edit, search, fetch, skills and
  the rest), like any other task. Only starting its own sub-agents stays off there, because a
  sub-agent wouldn't follow the browser's rules (ask before sending, treat pages as untrusted).
- Your own Claude setup still stays out of a browser task, so it has no way to your own Chrome.
- Every task runs on its harness's own prompt; Ducter only adds a short brief on top.

## 0.0.45

<!-- whats-new
zh: 任务做出的文件，点开就在 Ducter 里看
en: A file a task made now opens right inside Ducter
zh: 报告排好版，表格和代码都清楚，存一份留在本机
en: Reports laid out, tables and code clear; Save a copy keeps one
-->

**Files open inside Ducter**
- Tap a file a task made and it opens in Ducter, growing out of its card: a Markdown report laid
  out as a document, a CSV as a table, code and logs with colours and line numbers. 看原文 / Show
  source switches to the raw text.
- 存一份 / Save a copy keeps the whole file on this device (Downloads on the Mac, the share sheet
  on a phone). Open no longer sends you to your home's address in a browser, so a file's link no
  longer lands in your browser history.
- Kinds Ducter can't show yet (PDF, Office, zip) say so, with Save a copy; on the Mac also Open on
  this Mac. Tasks can now show code and text files (.ts, .go, .sh, .log, …), never .env.

## 0.0.44

<!-- whats-new
zh: 用这台手机：任务能借你的安卓手机用一会儿，先问你
en: Use this phone: a task can borrow your Android phone, asking first
zh: 借出时顶上一直显示，发送付款等你点 Go，随时停下
en: While lent, a pill shows it; sends and payments wait for your Go
-->

**用这台手机 / Use this phone** (Android)
- On your Android phone's own card, add 用这台手机. A short guide shows each tap in Android's own
  settings (three steps on a phone where the app was installed from its file), ticks each one off
  by itself and comes back to Ducter.
- A task that needs a phone asks to borrow yours, every time, with no default. While it holds it,
  a pill at the top says so with what it is doing and Stop; each tap shows as a soft ring.
- Sends, payments and deletes wait for your Go; banking, wallet, password and authenticator apps
  are out of reach, and password fields are never read. iPhones can't do this: iOS doesn't let one
  app use others, so the iPhone card says so plainly.

## 0.0.43

<!-- whats-new
zh: 家里那台卡片会指向能用手机、用电脑的那台 Mac
en: Your home's card now points to the Mac that can use a phone or apps
zh: 没有屏幕的服务器不再显示"用电脑·以后会有"
en: A server with no screen no longer promises Use the computer later
-->

**Devices**
- When Ducter lives on a server and a Mac does tasks for it, the home's card shows 用手机 and
  用电脑 as "on {Mac}" instead of "coming later"; tap one to open that Mac's card.
- A Linux server with no screen no longer shows 用电脑 / Use the computer as coming later.

## 0.0.42

<!-- whats-new
zh: 可以回复某一条消息了：右滑或长按，引用会压进你的话里
en: Reply to one message: swipe or long-press, and it's pressed into yours
zh: 回复任务的结果就接着那件事做，几件事可以同时回
en: Reply to a task's result to carry it on; reply to several at once
-->

**Reply to one message** (#3)
- Swipe right on a message on the phone, long-press it, or use the reply button beside it on a
  wide screen. The message you're answering sits pressed into your reply, in its own colour; tap
  it to find the original.
- Reply to a task's result and that task carries on; reply to a find or a question and it's about
  that one. Replies to several messages at once each stay with their own.
- On a wide screen, select part of the partner's words and reply to just that part.

## 0.0.41

<!-- whats-new
zh: 替家里做事的 Mac 也能装上 Ducter 自己的手机
en: A Mac that works for your home can now have Ducter's own phone
zh: 用电脑：任务能在你的 Mac 应用里做事，要紧的先问你
en: Use the computer: tasks work in your Mac's apps, asking first when it counts
-->

**用手机 / Use a phone**
- A Mac that does tasks for a home elsewhere (a server, say) can now add Ducter's own phone on its
  card. Tasks that need a phone run there; the home drives it through a fixed set of phone actions.

**用电脑 / Use the computer**
- Turn it on on a Mac's card and tasks can work in that Mac's apps (Keynote, Mail, Finder…). It
  shows plainly which two macOS switches it needs and opens the guide for them on that Mac.
- Anything that sends, pays or deletes waits for your Go; password managers, banks, System
  Settings and Ducter itself are out of reach; while a task uses an app you see it, with Stop.

## 0.0.40

<!-- whats-new
zh: 任务缺密钥时会给你一张卡，填一次就接着做
en: A task that needs a key asks you with a card, then carries on
zh: 密钥存在家里那台电脑上，对话和记录里都看不到
en: Keys stay on your home computer, never in the chat or the record
-->

**Keys a task asks for**
- A task that needs a key (a deploy key, an API key) asks you for it with a card, like a decision:
  type it once, keep it or use it just this once, and the task carries on, even if it had already
  stopped and waited for you. Your answer never goes through the chat.
- Keys are kept encrypted on the computer Ducter lives on, under Settings › Autofill › Keys, with
  where each was used. 让任务向我要密钥 / Let tasks ask me for keys turns the cards off.
- A task that prints a key on purpose could still see it; Ducter keeps it out of the conversation,
  the record and its own reads, and lists every use. Tasks on another computer can't get keys yet.

**Fixes**
- `ducter doctor` no longer says Nowledge Mem is unreachable when a local nmem answers "ok" (#2).

## 0.0.39

<!-- whats-new
zh: 第一次看一眼，会挑出最近两周真正要你管的事
en: Its first look picks what needs you from the last two weeks
zh: 有人追问或等了三天，只说急的也会告诉你
en: Only urgent now tells you when someone asked again or waited days
-->

**Proactive**
- The first look reads the last three days in full and two weeks of mail that may hold a booking,
  a bill or a promise, and says at most three things that need you, not only who is waiting.
- Only urgent now counts what waiting costs: someone who asked you again, or has waited three
  working days, and a promise due today.
- All-day calendar events with a place (a hotel stay, a trip) are read as bookings, so a flight
  that lands the night before a stay can be caught.
- If it reads plenty of mail closely for a day and keeps nothing, 今天看了什么 / What it looked at
  today says something may be wrong, instead of staying silent.

**Names**
- Shorter Chinese names: 从外面连 (was 在哪儿都能用), 连上手机或电脑, 发现了就说, 要不要先问,
  用什么想, and 和 instead of 与 in section names.

## 0.0.38

<!-- whats-new
zh: 主动留意终于看得到 Slack 里找你的消息了
en: Watching now sees Slack messages addressed to you
zh: 开机后邮件回看会等账号就绪，不再空跑
en: The mail look back waits for your accounts after a start
-->

**Proactive**
- Slack mentions and DMs reach the watcher: Slack's search answers had no mention or DM flag, so
  every one was dropped; and the time window now goes the way Slack's search takes it.
- Right after Ducter starts, the 60-day look back could run before your accounts had answered,
  read nothing and call itself done. It now waits for them, and a home where it read nothing looks
  back once more, quietly.
- 今天看了什么 / What it looked at today counts each mail once, not again on every look, and a
  calendar's events once a day.
- Quiet hours turned off no longer hold finds for the morning.

## 0.0.37

<!-- whats-new
zh: 家里的 Mac 也能在外面用，挂在你自己的域名上
en: Reach a Mac at home from anywhere, on your own domain
zh: 一个任务帮你接好 Cloudflare，每步都先问你
en: A task sets up Cloudflare for you, asking before each step
-->

**From anywhere**
- A computer without a public address, like a Mac at home, can now be reached from anywhere at an
  address on your own domain, through your own free Cloudflare account.
- On its card, **让 Ducter 帮我设好 / Set it up for me** starts one task: sign in to Cloudflare
  (a link to open on your phone when the computer has no screen), pick the name, tap Go, and it
  checks the address answers before your devices use it. The steps tick off on the card.
- Already made a tunnel in Cloudflare's dashboard? `ducter anywhere on --token … --hostname …`.
  Only devices you've connected can come in; nothing goes through Ducter's own servers.

## 0.0.36

<!-- whats-new
zh: 回忆会连它自己那块记忆一起找，不再漏掉
en: Recall now searches its own memory space too, so nothing is missed
zh: Nowledge Mem 按官方方式装和更新，一键换过去
en: Nowledge Mem installs and updates the official way, with a one-tap move
-->

**Memory**
- Recall searches where your memories are saved and Ducter's own memory space together, and uses
  whichever answers if one doesn't.
- Turning memory off says what stays: everything already noted is still in Nowledge Mem.

**Nowledge Mem on your computers**
- Ducter installs Nowledge Mem the way Mem recommends, never asking for a password. A copy that was
  installed another way can be moved over in one tap; your sign-in stays, and if the move fails the
  old copy is put back.
- Tasks find the same Nowledge Mem Ducter uses, and Mem's own "update available" now shows.

## 0.0.35

<!-- whats-new
zh: 读信能看到日期和标题了，主动提醒真正开始工作
en: Mail is read with its date and subject, so heads-ups actually work
zh: 没读成的信会重试，不会被当成看过
en: Mail it couldn't read is retried, never counted as seen
-->

**Heads-ups**
- Mail through OOMOL is now read with its sender, subject, labels and date. Before, it arrived as
  a thread id and a snippet, so nothing could be kept, noted or dated.
- Mail counts as seen only once it was really read; a failed read waits and is retried, across
  restarts too. A look back from before this runs once more by itself.
- The 60-day look back searches in several short queries, and each look back logs one line of
  what it read, kept and noted.

## 0.0.34

<!-- whats-new
zh: 今天看了什么，分组更清楚，问题一眼看到
en: What it looked at today reads in clear groups, problems shown up front
zh: Mac 上一打开通知就能看到读信出了问题
en: On the Mac, a reading problem shows as soon as Notifications opens
-->

**What it looked at today**
- The counts read in four groups: what it saw, what it read closely and told you, what it held
  back and why, and what it's doing now.
- A problem reading your mail shows without opening the list, on the Mac too, and the counts
  refresh when the home comes back after a restart.

## 0.0.33

<!-- whats-new
zh: 主动提醒修好了，还能看今天看了什么、为什么没说
en: Heads-ups work again, and you can see what it looked at today
zh: 全部更新不会再被重启打断而卡住
en: Update all no longer stalls when a computer restarts mid-way
-->

**Heads-ups**
- Reading your mail and calendar for heads-ups now uses the AI your partner actually thinks with.
  A home without Claude Code had silently skipped every look.
- If it can't read for a while, it tells you once, in plain words. Choosing how it tells you in
  Settings now runs the first look back (the last 3 days, 60 days of bookings and payments, a month
  of calendar).
- New: a booking whose date differs between your calendar and its confirmation mail. Before a
  meeting now counts as urgent too. Calendars are read two weeks ahead.
- **今天看了什么 / What it looked at today**, under the switch in Settings › Notifications: counts
  of what it read and kept, and why anything was held back.

**Update all**
- A computer's own Ducter update and its AI agents' updates no longer cut each other off. A step
  interrupted by a restart is judged again by what runs now, retried once, and the row says what
  it waits for.

## 0.0.32

<!-- whats-new
zh: 在 Ducter 里就能装上、更新 Nowledge Mem
en: Install and update Nowledge Mem from inside Ducter
zh: 连接你其他 AI 时的报错都说人话了
en: Connecting your other AI agents explains every error plainly
-->

**Your other AI agents**
- Settings › Partner › Your other AI agents walks a computer without Nowledge Mem, or with an old
  one, through **Install**, **Update** and **Sign in** (a one-time link from Mem's web app), then
  **Connect**. It uses Mem's official `nmem-cli` package through uv, pipx or pip; no restart.
- Every answer Mem's Bridge can give now reads as one plain line. When Mem's side isn't open yet,
  it says so, and that it isn't anything on your side.

## 0.0.31

<!-- whats-new
zh: 一键全部更新：Ducter 和各台电脑上的 AI 按顺序更新
en: Update all in one tap: Ducter and every computer's AI agents, in order
zh: 正在做的事不会被打断，失败的那一项会自己换回去
en: Work in progress is never cut off; a failed step rolls itself back
-->

**Update all**
- When anything has an update, Settings › Your devices (on the Mac, Updates and about) shows one
  card with what will change, from which version to which, and one button: **全部更新 / Update all**.
- Ducter puts it in order: the home first, then the other computers, then each computer's AI
  agents, then this app last. An agent a task is using waits until that task pauses.
- Each step that fails is put back as it was, and the rest carry on unless they depend on it. The
  plan survives the home's own restart.
- **自动更新 / Update automatically** runs the same plan at night when nothing is working (off by
  default). On the command line: `ducter update --all`.

## 0.0.30

<!-- whats-new
zh: 通过 OOMOL 连的日历也能读了，日程卡正常显示
en: Calendars connected through OOMOL read again, with the day card
zh: 读不到日历时直接告诉你，不再瞎猜
en: When a calendar can't be read, it says so instead of guessing
-->

**Calendars through OOMOL**
- With accounts hosted by OOMOL, Ducter asked the Gmail app for calendar reads, so every read was
  refused. It now asks each account's calendar app, and the day card and change card show.
- If a calendar can't be read, Ducter says so in one line and offers no guessed free time; calendar
  changes only go through the calendar's own card.

**Heads-ups**
- Watching chat no longer retries an action OOMOL doesn't have every ten minutes.

## 0.0.29

<!-- whats-new
zh: 能看你的日历了，两个账号合成一天
en: Ducter reads your calendars, every account merged into one day
zh: 加日程、改时间、回邀请，点了 Go 才改
en: Add, move or answer events; nothing changes until you tap Go
-->

**Calendars**
- With Google Calendar connected in oo, Ducter reads every account's calendars as one day in your
  time zone. Ask "我今天怎么安排" or "what's tomorrow" and a day card answers: times, each
  calendar's colour, what clashes, what you haven't answered.
- It finds free time across both accounts, and can add, move, cancel or answer an event. Each
  change waits on a card showing which calendar, the time on both sides, and who gets an email.
- Settings › Accounts lists the calendars it reads, each with a switch. If only Gmail is
  connected, it points you to adding Google Calendar in oo.
- The morning greeting mentions what's still on today, and two meetings at the same time get
  flagged.

**Releases**
- A release no longer creates or revokes an Apple certificate, so no more emails about one.

## 0.0.28

<!-- whats-new
zh: 打开任务就能看手机和 iOS 模拟器的实时画面
en: An opened task shows Ducter's phone and your iOS Simulator live
zh: 任务顶部一眼看到分支、改动和开 PR
en: The task's top shows its branch, changes and PR at a glance
-->

**The workbench's Phone page**
- When a task uses Ducter's phone, the phone is live in the task's workbench under **手机 / Phone**.
- For iOS work on a Mac, a booted iOS Simulator shows there too, with home, dark or light, text
  size, open a link, and a screenshot that drops into the message box. Tapping is done in Simulator
  itself for now.

**Working copy**
- The branch name at the task's top opens the computer, folder, branch and its base, the changes
  against the base, Open draft PR or Merge, and who has worked on it.

**Site**
- The launch film plays on every browser again, in a new cut with the workbench, pictures, Ducter's
  phone and calls.

## 0.0.27

<!-- whats-new
zh: 可以用你自己的手机和号码打电话了，全球都能打
en: Calls can go out from your own phone and number, to anywhere your SIM can call
zh: 工作台、手头的事和手机的中文说法更自然
en: Plainer Chinese in the workbench, On hand and Ducter's phone
-->

**Calls from your own number**
- Plug your Android phone into the computer Ducter lives on, with a small headset cable bridge
  (about US$15 of parts; the card lists them), add a live-voice key, and make a test call. Then a
  call can go out from your own number and SIM, wherever it can call, under the same rules as
  every call: your OK first, it says it's an AI first, never emergency numbers, at most 10 a day.
- Ask for it ("用我的号码打"), or turn on **每通电话都用我的号码**; Tuwa stays the line otherwise. The
  card shows which number calls and what the voice costs. Ducter only dials, hangs up, reads the
  call's state and presses keypad digits on your phone; nothing is recorded.

**Words**
- The workbench, On hand and Ducter's phone read like the rest of Ducter: **保存 / 取消 / 还原**,
  **点击 / 暂不点击**, **打开手机**, **安装**, and more.

## 0.0.26

<!-- whats-new
zh: Ducter 有了自己的安卓手机：装 app、登录，让它替你在手机上办事
en: Ducter has its own Android phone: add apps, sign in, and let it do things there
zh: 手头的事改成一个清单，每行都写着它此刻在做什么
en: On hand is one list, and every row says what each task is doing right now
-->

**Ducter's phone** (a Mac with Apple silicon)
- On your Mac's card in **Devices**, **+ 用手机 / Use a phone** adds an Android phone that lives
  inside Ducter (about 2.3 GB to download, about 10 GB once used; Google's licenses are shown first).
  It starts when a task or you need it and sleeps after five idle minutes.
- Open it to install apps from Google Play and sign in yourself; the task can't see while you do.
  Tasks then work in those apps. Sending, paying, posting, deleting, installing, calling or signing
  out waits for your OK on a card first; banking, wallet and password apps stay out of its reach.

**On hand**
- One list on every screen: what needs you on top, answered in place; every other task a row that
  says what it's on right now, with its changes, draft PR or merge, and time.
- Find (from 10 tasks), **By project**, keys (j/k, Enter, /), **⌘O** to jump to any task, actions on
  hover, several at once on a wide screen, and beside a task opened full screen the list stays as a
  rail.

## 0.0.25

<!-- whats-new
zh: 任务右侧多了工作台：改动、文件、预览、浏览器，按需打开
en: A workbench beside each task: changes, files, live preview, browser
zh: 中文文案全面重写，按钮说法更自然
en: Clearer Chinese throughout, and no emoji-like marks anywhere
-->

**The workbench**
- Open it beside a task (⌥⌘B, or the button in the task's header): **Changes** with a diff and
  undo per file, **Files** with the tree, highlighted code and editing (the agent is told what you
  changed), **Preview** of the page the task serves (through your Ducter, never public),
  **Browser** with Ducter's browser live, and **Results**. Pages appear only when they have
  something. On the phone it's a full-screen sheet you swipe through.

**Words and looks**
- Every Chinese string was rewritten to read like native product copy: **取消任务**, **继续**,
  **立即拨打**, **暂不拨打**, **定时 / 定期 / 等条件满足**, **全部还原 / 保留改动**, and many more.
- Nothing on any screen is drawn with an emoji or a symbol the phone can't draw as text; a check
  keeps it that way. Agent marks are shown only where they're big enough to read; elsewhere the
  name. Codex's mark has a light version for the dark theme. Updates are said in words, and every
  "more" arrow is the same drawn chevron.

**Calls**
- A number no line can call (a country Tuwa doesn't reach) gets a **call sheet**: what to say first,
  what to ask and not to share, what to note down, with **Call it yourself**; afterwards your partner
  asks how it went.

## 0.0.24

<!-- whats-new
zh: 在文件夹里做事的 Codex 任务又能交回结果了
en: Codex tasks working in a folder can report back again
zh: 停下没交回结果的任务会等你，不再一直显示在做
en: A task that stops without reporting waits for you, not "Working" for hours
-->

**Fixes**
- A task on Codex that works in a folder can report back again: everything it tried to tell your
  partner was refused, so it ran on without a word.
- A task that stops without reporting, even after a nudge, now waits for you instead of reading
  **Working** for hours.

## 0.0.23

<!-- whats-new
zh: 任务页像编程助手一样一步一行：命令、改动、出错都看得见
en: A task reads like a coding agent: every command, edit and error, one line each
zh: 按两下 Esc 暂停，排队的话看得出来，长任务也顺滑
en: Esc twice pauses; queued messages show as queued; long tasks stay smooth
-->

**The opened task, like a coding agent**
- Every step is its own line: what the agent said it was doing, the command, an edit's +n −n.
  Looking at files folds into one line ("Read 3 files, 2 searches").
- Edits show their diff inline, and a failed step shows the line that names the error, where it
  happened. A command's output opens in place, first 12 lines and the rest on request.
- At the bottom, over the box: **Working**, the clock, the latest step and **Pause** while it
  works; **Over to you** when it waits for you. Esc twice pauses.
- What you send while it's busy shows as queued until it reads it. Scroll up and **Jump to latest**
  takes you back; very long tasks show older steps on request.

## 0.0.22

<!-- whats-new
zh: 手机和 iPad 一打开就是上次的对话，不再闪空白
en: The phone and iPad apps open on your conversation at once, no blank screen
zh: iPad 上第二栏全屏立刻切换
en: Full screen on the iPad's second column happens at once
-->

**Opening fast**
- The apps open on your last conversation and On hand straight away and catch up with your Ducter
  in the background; they never show an empty screen while connecting.
- Full screen on the second column (iPad, wide windows) takes effect at once instead of after
  about four seconds.
- The apps keep the page's code until your Ducter has a newer one, so opening doesn't wait on the
  network.

## 0.0.21

<!-- whats-new
zh: 你说「现在打」就现在打，电话结果按实际情况说
en: Calls go now when you say now, and say what really happened
zh: 任务页的说法更自然，任务不再碰 Ducter 自己的数据
en: Plainer words in a task, and tasks never touch Ducter's own data
-->

**Calls**
- A call you ask for while you're here goes now; your quiet hours only hold calls Ducter starts on
  its own. When it's late or early where they are, the card says so with their clock and offers
  **Call now**; never before 8:00 or after 21:00 their time. Calls to your own number have no hours.
  US and Canadian numbers are placed in the right time zone by area code.
- What happened is said as it was: an automated message (voicemail, or Google Voice screening, with
  how to let it through), no answer, didn't connect, or didn't go through.
- The call card puts Tuwa's own wording under a fold, in rows; the Tuwa card in Settings says
  plainly what Ducter turned off there.

**Tasks**
- No task ever works in Ducter's own data folder.
- The opened task: **Pause** and **Cancel task** at the top, no needless "got it" under your
  messages, the composer empties when you send, runner notes in plain words, and commands are no
  longer called browsing.

## 0.0.20

<!-- whats-new
zh: 能给伙伴发图片了，事情做出来的图也直接出现在对话里
en: Send screenshots and photos; what a task makes shows up in the conversation
zh: 说「画一张…」就画给你，点开大图左右滑着看
en: Ask it to draw something; tap a picture to see it big and swipe through
-->

**Pictures, both ways**
- Send your partner a screenshot or a photo: the picture button, paste, or drag and drop, up to
  10 at a time, in the conversation, in a task or with a New task. On your phone they're made
  smaller and anything stored inside them (where a photo was taken, too) is removed before they
  leave. If one doesn't go up, your words and the picture wait with **Retry**.
- What a task makes worth seeing (a screenshot that shows it works, a picture it drew, a file)
  appears under your partner's words. Say "draw…" and a task on Codex draws it.
- Tap a picture to open it: pinch or double-tap to zoom, swipe through every picture, swipe down
  to close; **Save**, **Share**, **Copy**, and **From** the task that made it. On the Mac, Space,
  the arrow keys, ⌘C and drag to Finder.
- An AI agent that can't see pictures says so when you start a task with some.

**Your other AI agents: connect with one tap (needs Nowledge Mem 0.10.118 on the computer Ducter
lives on)**
- Settings › Partner › Your other AI agents now has **Connect**: Ducter uses your own Nowledge Mem
  sign-in to let your terminal Claude Code or Codex reach it, as its own identity and only in your
  "Only me" place, and says exactly that before you tap. **Disconnect** turns it all off. If Mem
  says no, you see why and what to do in Mem; Ducter never tries another identity or key. With an
  older Mem, the section says to update it first.
- **Who can reach it › Nobody** now still brings back the answer to a message you asked it to send.

**Fixes**
- A task that only reads (on Codex) can report back again: its report, checkpoints and history
  search were all refused before, so it stopped without a word.

## 0.0.19

<!-- whats-new
zh: Ducter 更新后，手机上开着的页面会自己换成新版
en: A page left open on your phone moves to the new version after Ducter updates
zh: 新建不再列出找不到电脑的旧文件夹
en: New task no longer lists old folders on a computer Ducter can't find
-->

**Fixes**
- The phone and browser load the new page by themselves once your Ducter has updated (when
  nothing is open and nothing is unsent), instead of drawing the old one until you close the app.
- **New task** leaves out a folder whose computer Ducter no longer knows; it couldn't start there.

## 0.0.18

<!-- whats-new
zh: 新建时贴一个 Git 地址，就能在任意一台电脑上克隆
en: Paste a Git address in New task to clone it onto any of your computers
zh: Ducter 的东西都放在 ~/ducter 里，一眼就找到
en: What Ducter makes on a computer now lives in one folder you can see, ~/ducter
-->

**New task: one Ducter folder, and projects from a Git address**
- Each computer has one folder of Ducter's own, `~/ducter`: the projects it cloned for you in
  `~/ducter/projects`, and new tasks' working copies in `~/ducter/worktrees` (tasks already
  running keep theirs). If a `~/ducter` is already yours, Ducter leaves it alone and uses
  `~/ducter-work`; set `DUCTER_FOLDER` to choose another place.
- **Add from a Git address…** in the folder list clones a repository (`https://…`,
  `git@host:owner/repo` or `owner/repo` for GitHub) onto the computer you choose, from the phone
  too, with that computer's own git sign-in. It says where it goes, shows **Cloning…**, and says
  plainly when the repository isn't there, that computer has no access, or it can't reach it.
- **Find a folder…** looks through any of your computers' folders, one level at a time, from the
  phone and the browser too; **Use this folder** adds it as a project there.
- The folder list no longer guesses which folders hold code: it lists the folders you used and
  added and the projects in each computer's Ducter folder. With nothing there yet it offers the
  ways to get one, never only **No folder**; a computer whose Ducter is older says to update it.
- `ducter uninstall --all` removes tasks' working copies in both places and never the projects
  Ducter cloned for you (its listing says so).
- With your home on a server and Claude Code only on your Mac, picking Claude Code for a project
  on the server switches to the same project on the Mac when it's there (matched by its Git
  address), or asks you to pick or clone one there.

**Autofill on real sites**
- Tried end to end on real pages for the first time (a sign-in, a details form, a test-mode
  checkout); several things that broke there are fixed: a task naming something saved now always
  gets Ducter's own browser, one OK per sign-in instead of two, a value is never typed into a field
  the page swapped under it, payment buttons drawn by the page are found, and dropdowns can be
  chosen.

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
