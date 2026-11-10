# Product Model: Objects, Vocabulary, Scenarios

> Draft 1 · 2026-11-08 · The single source of truth for *what exists in the product and what it
> is called*. Principles say *why*, design notes say *how*, prototypes show *what it looks like*.
> Decisions and superseded drafts live in `design/decisions.md`. Evidence: `research/19`, `research/20`.

## 1. Vocabulary

**Rules**
- **Partners, not hierarchy.** No court, throne, approve/reject, seal, or boss language.
- **Every user-facing word translates cleanly**, with no puns and no culture-bound images.
  English and Chinese are designed together.
- **No concept to learn.** Seeing the word should be enough to guess what it means.
- **i18n keys from day one** (`decision.go`, `state.needs_you`, …). No hard-coded copy.

**Glossary.** "Internal" is what docs and code say; "shown" is what users see.

| Internal | Shown (中 / EN) | Meaning |
|---|---|---|
| persona, main AI | its **name** (default "Ducter"); as a category 伙伴 / Partner | Whoever you're talking to |
| Log, channel | (hidden) "对话 / the conversation" | |
| job | (no card; just an ack and a status line) | Any work not answered at once. Executed in turn, in a fork, or in a window (principle 6) |
| Focus Window, window | **事 / Task** | A job big enough to need its own session and place. **Only windows get cards** |
| workspace view | "展开 / Open" (no name of its own) | A task opened to full depth |
| overview board | **手头的事 / On hand** | Every task across all personas |
| a level taking the whole screen on a wide screen (D184) | the header's button, arrows out **铺满 / Full screen**, arrows in **放回对话旁边 / Back beside the conversation** (its label and tooltip; the button shows only the arrows) | Wide, On hand or an opened task stands beside the conversation by default; this takes it to the whole screen as the Mac shows it, and back. ⌘2 does the same for On hand |
| attention states | 等你 / Needs you · 在做 / Working · 在等 / Waiting · 做完了 / Done · 没成 / Didn't work · 放下了 / Dropped | `done?` shows as "做完了 · 在检查 / Done · checking" only while a check runs, else as Done (D68); `queued` shows as "还没开始 / Not started yet" |
| decision actions | **好 / Go** · **先等等 / Hold** · **回复… / Reply…** · **看细节 / Details** | The Go button may name the action: en says the action alone in sentence case ("Rebase"), zh keeps 好 in front ("好，rebase") (D73). An ask's small heading is the asking task's title; the count is said once, "2 件等你 / 2 need you" |
| Project | **项目 / Project**; no project = **其他 / Other**; making one (D186): **加一个文件夹 / Add a folder** (the picker: **选一个文件夹，它会成为一个项目 / Choose a folder; it becomes a project**, **加进来 / Add**; not there: **那儿没有这个文件夹。/ There's no folder there.**; for a home elsewhere when this Mac doesn't do tasks for it (D197), greyed with **在设置 › 住在哪儿打开「让这台 Mac 也替 {home} 做事」，就能加这台 Mac 上的文件夹。/ To add a folder on this Mac, turn on "Let this Mac do tasks for {home}" in Settings › Where it lives.**; places on two computers end their path line in **· {computer}**); an added one with nothing yet: **还没有事。/ Nothing here yet.** | An editable grouping label; its everyday form is one folder you work in, named after it (D186) |
| Place | **在哪儿做 / Where** | Where a task works |
| Device (machine, runner) | **设备 / Devices** | |
| harness (Claude Code, Codex, pi, DeepSeek Harness, …) | each by its own product name; as a category **AI agent / AI agent** (D88) | The AI tools Ducter hands work to. Not "coding agent": people use them for much more than code |
| Routine | **例行 / Routine**; the shelf **例行 / Routines**; a run says **来自例行：{name} / From the routine: {name}**; **暂停 / Pause** · **接着来 / Resume**; paused: "停着：连着 3 次没成 / Paused: 3 runs in a row didn't work" · "停着：连着 3 次你没看 / Paused: 3 reports unread" · "停着：到期了，等你说还要不要 / Paused: up for review"; the review card "还要吗？/ Keep this?" with **留着 / Keep it**; the proposal card's rows **什么时候 / When** · **做什么 / Does** · **怎么告诉你 / Reports** · **能动什么 / Can touch** · **花多少 / Cost** ("每次用一点你的 AI 额度 / A little of your AI allowance each time") · **到期 / Review**, Go **好，开始 / Go: Start** | Recurring or triggered work (D114, D115). A time routine shows its next date on a clay tear-off calendar, its cadence in words |
| Waiter | named as awaited: **等 {what} / Waiting until {what}** ("等 PR #1592 通过", "等域名续费的邮件"), never as if done; its deadline **最多等到 {time} / Until {time}**; **不等了 / Stop waiting** · **现在看一眼 / Look now**; ended unmet (D145): **没等到：{why} / Didn't happen: {why}** (到时间了还没等到 / ran out of time) with **接着等 / Keep waiting**, in Done today for the day; in Details only, **怎么判断的 / How it checks** | D112, D115. How often it looks, the command and whether a model judges are never on a card, the head, a proposal card or the conversation |
| `until` loop | "一直…直到… / Keep … until …" on the task; each try **第 n 次 / Try n**; **最多 20 / up to 20**; **停下 / Stop** | D113 |
| Rule | **规则 / Rule**; the list **你的规则 / Your rules** · **不要这条 / Remove** · **跟 {name} 说一条规则… / Tell {name} a rule…** | A standing preference stated in words. Added only by saying it in the conversation; listed and removed on Partner (D89). After two switches the same way the partner asks once "以后…也用 X？ / Use X for … from now on?" |
| what the partner itself runs on (brain) | **它用什么想事情 / What it thinks with**; the socket **想事情用 / Thinks with** · **换一个 / Switch** · **挑一个放进去 / Pick one to put in** · "{name} 现在用 {agent} 想事情了 / {name} thinks with {agent} now" · **从你的下一句话开始用 / Takes over from your next message** · **换了以后，名字、记得的事和你们的对话都还在 / Switching keeps its name, what it remembers and your conversation** · models **最聪明 / Smartest** · **回得更快 / Faster replies** | D89. Never "brain", 脑子, "model settings" or "main AI" on screen. Only AI agents signed in on the Mac it lives on: "只能用 {name} 住的这台 Mac 上登录了的 AI agent" |
| who does the tasks (`fw_candidates`) | **谁来做事 / Who does the tasks** · the tray **这台 Mac 上的 AI agent / AI agents on this Mac** · **用它做事 / Use it for tasks** (per account, on by default) · **按用量付费 / Pay per use** | D89. Default line: "每件事 {name} 挑一个：最合适、额度最够的那个 / For each task {name} picks one: the best fit with the most limit left" |
| the partner's reserve | **其中 10% 给 {name} 留着 / 10% of it is kept for {name}**; when only it is left, "额度还剩 n% · 都是给 {name} 留着的 / n% left · all kept for {name}" | D89. One sentence says tasks and the partner share one limit: "做事和 {name} 想事情用的是同一份额度…" *Not built (D133): not shown until a harness reports its limit.* |
| `body_selected` (who does a task, and why) | **谁在做 / Who's doing it**: "{agent} 在做，按你的规则「…」/ {agent} is doing it, by your rule "…"" · "…，因为 {agent} 额度不多了 / …, because {agent}'s limit is low" · "…，是你换的 / …; you switched it"; switching **换谁来做 / Switch who does it** · **现在 / Now** · reasons **你的规则 / Your rule** · **最适合这件事 / Best fit for this** · **快，省额度 / Fast, uses less of the limit** · "额度不够了 · 剩下的给 {name} 留着 / Not enough limit · the rest is kept for {name}" · **你关了「用它做事」/ Use it for tasks is off** · the button is the handoff's **换到 X 接着做 / Continue on X** | D89, D90. The conversation's task line ends with who (and why when it isn't the plain pick); the opened task's head says who in its meta line; the reason is a sentence in Details |
| device states | **醒着 / Awake · 睡着了 / Asleep · 连不上 / Can't reach** · wake = **叫醒 / Wake** | Never "broken" or "offline" wording for sleep |
| quota | **额度 / limit** ("额度还剩 80% / 80% of the limit left") | One per AI account, shared across its devices |
| screen place controls | **画面 / Screen** tab · **接手 / Take over** · **还给它 / Give it back** | |
| loop iteration | **第 n 次 / Try n** | |
| checkpoint | **保存了进度 · {time} / Progress saved · {time}**; in the dossier **保存的进度 / Saved progress** | Describes what happened; no noun to learn |
| handoff | **换到 X 接着做 / Continue on X** | Never "superseded" in UI |
| pause | **先停 / Pause** | Shown as a waiting reason |
| opening a task's working copy by hand (D198, D201) | **打开 / Open** · **在 Finder 中显示 / Show in Finder** · **用 {editor} 打开 / Open in {editor}** · **在 {terminal} 里打开 / Open in {terminal}** (Terminal itself **在终端里打开 / Open in Terminal**) · **没能打开：{why} / Couldn't open it: {why}** | Mac app only, and only while the working copy (a repo task's worktree, a folder task's folder) is on this Mac; the words are macOS's own. Editors, then terminals, each one installed, the one used last first; an app's name is its own (iTerm2, Ghostty, Warp). The path above the changes is the 工作副本 / working copy, said by its accessible name only |
| Recipe | **准备步骤 / Setup steps** | |
| a non-git folder's changes | **改回去 / Undo all changes** · **就这样 / Keep the changes** · **改回这个 / Undo this** · **随时能改回去，留到 {date} / You can undo this until {date}** | D142; the copy behind it is never named |
| routine fields | **{date} 再问你 / Ask you again {date}** (review date) · **可以碰 / May touch** (also on every task, D61) | |
| default outcomes | **你没回，我照原计划做了 / No answer, so I went ahead** · **都按默认 / Go on all defaults** | D129 |
| an answered ask, in the conversation (D129) | **你说：{Go 的字} / You said: {the Go words}** ("你说：好，创建") · **你说：先等等 / You said: Hold** · **你说：{回复} / You said: {reply}** | One tiny line on the user's side; never "已经说好 / Agreed" |
| an ask's default line (D129) | **{n} 分钟后你没回，我就{动作}，之后还能改回来。/ If you don't answer, I'll {action} in {n}. It can be undone.** · no action named: **…我就接着做… / …I'll go ahead…** · **你没回之前，我先放着。/ I'll leave it until you answer.** · can't be undone: **你说好，我再做。/ I'll do it once you say so.** · due: **这就照原计划做 / Going ahead now** | One small grey line under the ask's tray, never red, never "等你定" |
| a task's question, while the partner puts it into words (D129) | **在看它想问你什么… / Reading what it's asking…** · in Details: **它的原话：{text} / In its words: {text}** | The partner says a task's question in its own words; the task's wording is one tap away |
| the quiet row under a message (D104) | **看细节 / Details ›** · **收起 / Hide** · **合进 main / Merge into main** | 看细节 opens, in place, what stands behind a message: the line of proof, the task's title, 开草稿 PR / Open draft PR, the 记下了 / Noted lines with 忘掉 / Forget. Merge into main is a text button there when it is the next step |
| open asks gathered behind the one being asked (D104) | **还有 n 件等你定 / n more waiting on you** | One line under the ask whose default comes soonest |
| a task in the living message that didn't work, or came back (D104) | **{title}没做成：{text} / {title} didn't work: {text}** · **{title}做完了：{text} / {title} is done: {text}** | Said as one sentence, never a status row |
| the time line (D104) | **10:40** · **你不在的时候 · 10:40 / While you were away · 10:40** | Small and centered, like a messaging app; before the first message and where 15 minutes passed |
| what the partner is doing while you wait (D104) | **在想… / Thinking…** · **在翻之前聊过的… / Looking back at what we said…** · **在看做到哪了… / Checking on that task…** · **在安排一件事去做… / Setting up a task…** · **在把你的话带过去… / Passing it on…** · **在想怎么安排… / Working out the timing…** · **在查… / Looking into it…** · while a finished task is put into words (D124) **在看它做完的结果… / Looking over what it came back with…**; past 15 s **比平常久一点，还在弄 / Taking a bit longer than usual**; past 45 s **还在弄。你可以先忙别的，好了我说 / Still on it. Carry on with something else; I'll say when it's ready** | Beside the clay partner where its reply will land; gone when the reply lands. Never a tool name |
| the partner's sentence when it takes on work (ack, D120) | **好，我去{做的事}，{一般 / 大概 + 多久，有依据才说}，{查清楚了 / 弄好了}告诉你。 / On it: {the action}, {usually about + how long, only when grounded}; I'll tell you when it's clear.** | One sentence, replacing the waiting line; never an outcome, never a promised time; then nothing until the result |
| the display setting (D104) | **对话里的细节 / Details in the conversation**: **收起 / Folded** · **展开 / Shown** | Per client, in Settings › Look and sound (the Mac) and Settings › This phone (the phone) |
| outcomes | **停下了 / Stopped** · **撤销 / Undo** · **再试一次 / Try again** · **告诉它怎么做… / Tell it what to do** · **检查没过 / Check didn't pass** | 告诉它怎么做… sits beside 再试一次 on a task that didn't work and opens the task's composer (D76) |
| a merge / draft PR whose result was lost with the connection | **不确定成没成，你看一眼 / Not sure it went through — check** · **再试一次 / Try again** | Only when the Log doesn't show it done after reconnecting. Never "failed" wording: it may have happened |
| a task the user opens themselves (D128) | **新建 / New task** (⌘N) · the card's rows **在哪儿做 / Where** · **谁来做 / Who does it** · **做什么 / What** · **不用文件夹 / No folder** · the top candidate's coin tag **推荐 / Suggested** · under What **你写的话会原样交给它 / It gets your words as you wrote them** · **开始 / Start** · a pick, on hover "…，是你选的 / …; you picked it" · On hand's toggle **按状态 / By state** · **按项目 / By project** · a group's **在这儿新建 / New task here** · tasks of no place **其他 / Other** · on the phone a **＋** on On hand opens it as a bottom sheet · the branch list **从哪个分支开始 / Start from which branch** (**默认 / default**) · **取消 / Cancel** · while it opens **在交给它… / Starting…** · in the opened task the words are under **你交代的 / What you asked for** · a refusal in one line under Start (**那台设备现在连不上。/ That device can't be reached right now.** · **这个文件夹不是 git 仓库。/ That folder isn't a git repository.** · **现在没有 AI agent 能接这件事。/ No AI agent can take this right now.** · **没能开始：… / It didn't start: …**) · the Changes header **改动 · 3 个文件 +42 −7 / Changes · 3 files +42 −7** | The power path, never required. Nothing is said in the conversation when it opens; the partner reports its result like any task. CLI: `ducter task`, which prints 开了：「…」/ Opened: "…" |
| starting it now or later, by hand (D185) | the card's pill **什么时候开始 / When it starts**: **现在 / Now** (马上开始 / Starts right away) · **定个时间 / At a time** (到点自己开始 / Starts by itself then; **今天 / Today** · **明天 / Tomorrow** · **后天 / Day after**, **几点 / At**) · **定期做 / On a schedule** (每次到点新建一件 / A fresh one each time; **每天 / Every day** · **工作日 / Weekdays** · **每周 / Weekly** · **每隔几小时 / Every few hours**) · **等某件事发生 / When something happens** (现在新建，先等着，等到了再做 / Opens now, waits, then does it; **等到 / Wait until**) · **一直做到… / Keep going until…** (没做到就接着再来一次 / Tries again until it holds; **做到 / Until**) · Start for a time or a schedule **定好 / Schedule** · the foot **⌘↩ 开始 · ⇧⌘↩ 开始并接着新建 / ⌘↩ Start · ⇧⌘↩ and start another** · after ⇧⌘↩ **开了：「X」/ Opened: “X”** with **打开 / Open**, **定好了：{when} ·「X」/ Scheduled: {when} · “X”** · refusals **这个时间已经过了。/ That time has already passed.** · **写一句它等什么，或者做到什么为止。/ Say what it waits for, or what it keeps going until.** · **时间写成 9:00 这样。/ Write the time like 9:00.** · a one-time start on On hand **到时候开始 / Starts then** with **不做了 / Don't do it** · By project a row's kind **等 … / Waiting until …** or **第 n 次 / Try n** | A time and a schedule are routines of the user's own (no proposal card); a wait and a loop are the task's own `wait_for` and `until`. Never "cron" or "trigger" on screen |
| quiet hours | **免打扰 / Quiet hours** ("免打扰 23:00–08:00") | The word the user's phone already uses |
| remote access ability | **在哪儿都能用 / Reach from anywhere** | Done: "MacBook 现在在哪儿都能用了" |
| pairing a client with a server (D54) | **连接到你的 Ducter / Connect to your Ducter** · **地址 / Address** · **连接码 / Code** · **连上 / Connect** · **断开 / Disconnect** · again: **再连一次 / Connect it again** | The desktop card, the phone and the CLI (`ducter pair`, `ducter devices disconnect`). Sentences say "这个码只能用一次 / The code works once". Never "token", "配对 / pair", "授权 / authorize" or "绑定" in UI |
| which Ducter the command line talks to (D147) | **→ {host}** / **→ 这台电脑 / this computer** (the first line of every home command) · **命令行在用 / Command line uses** (doctor) · its own device **CLI on {Mac}** (in `ducter devices`; the app folds it into its Mac's card, D155) · "这台电脑上的 ducter 命令现在都发给 {host} 上的 Ducter / This computer's ducter commands now go to the Ducter on {host}" | CLI only; the verbs are `ducter connect <address> --code <code>` and `ducter disconnect`. Never "home", "active home", "token" or "remote" in printed words |
| a device that runs tasks for a main elsewhere (worker) | (a **设备 / Device**; its card: its own name, renamable (**改名字 / Rename**), and **另一台电脑 · 替 Ducter 做事 / Another computer · does tasks for Ducter**, the second half replaced by its state when something is wrong (睡着了 · 醒来就接着做, 连不上 · {time}); in the CLI "让这台电脑替另一个 Ducter 做事 / make this computer do tasks for another Ducter"; the main is "Ducter 住的那台电脑 / the computer Ducter lives on") | D84. Shown with the device states (醒着 / Awake …). "Worker" stays internal to UI copy; the CLI verb is `ducter worker <address> --code <code>` (its reader is a developer, D83). Never a name containing "ducter" plus a role (reads as Ducter's own background program) |
| does tasks for Ducter | **替 Ducter 做事 / does tasks for Ducter** | What another computer is for (D84); Ducter = the partner's name |
| the code card while it waits | **等它连上… / Waiting for it to connect…** | On the code card and in `ducter pair` (D83) |
| another computer while tasks run on it | **另一台电脑 · 在做 1 件事 / Another computer · working on 1 task** (n: 在做 n 件事 / working on n tasks); under its island alone: **在做 1 件事 / Working on 1 task** | D81, D84: the state replaces the second half |
| a phone (or an app window elsewhere) that reaches Ducter | its own name, and **在哪儿都能找到 Ducter / Reaches Ducter from anywhere**; not seen lately: **最后在线 {time} / Last seen {time}** | D81. A phone never runs tasks; it has no bridge parcels |
| an AI account on several devices | **和 {device} 共用一个账号的额度 / Shares one account's limit with {device}**, in that agent's coin detail | D161: only when the home says the account is shared; names the other devices |
| where browser tasks run (an AI agent's own browser, D130) | **在你的 Chrome 里 / In your Chrome** (上网 tile and detail); status line **在你的 Chrome 里看 {host} / Looking at {host} in your Chrome**, or on Ducter's own **在 Ducter 的浏览器里看 {host} / Looking at {host} in Ducter's browser** (a running task's line on the Mac and the phone, never a transcript line, D127); the move to Ducter's browser: **Claude in Chrome isn't connected; switched to Ducter's own browser** (system line) | Literal: it is the user's own Chrome, signed in as them. Ducter's own browser stays **Ducter 的浏览器 / Ducter's own browser** |
| server keeps running (systemd service) | **一直开着 / Stays on** (doctor row) | |
| the saved sign-ins, cards and details Ducter fills for you (D191) | Settings section **自动填充 / Autofill**; groups **登录 / Sign-ins**, **卡 / Cards**, **你的资料 / Your details**, **用在了哪儿 / Where it was used**; actions **存一个登录 / Add a sign-in**, **存一张卡 / Add a card**, **存好 / Save**, **删掉 / Remove** (**确定删掉 / Remove it**); a secret field when editing: **不改就留空 / leave empty to keep**; lines **{time}用过 / Used {time}**, **还没用过 / Not used yet**, **填了 {thing} / Filled {thing}**, **你同意付 {amount} / You said Go to {amount}**, **你同意用 {thing} / You said OK to {thing}**, **你没让用 {thing} / You said no to {thing}** | Never "credentials", "vault" or "password manager" for Ducter's own store; nothing is ever shown again after saving (`autofill.md`) |
| a payment's Go card (D191) | **在 {site} 付款？ / Pay on {site}?**; rows **金额 / Amount**, **买的是 / For**, **商家 / Merchant**, **用卡 / Card**; tag **第一次在这里付 / First payment here**; field **卡尾号 {last4} 的安全码 / Security code of the card ending {last4}**; buttons **先不付 / Not now** · **付 {amount} / Pay {amount}**; answered **你同意付 {amount} / You said Go to {amount}**, **没付 / Not paid** | No default, ever |
| a saved thing's first use on a site (D191) | **第一次用存着的登录进 {site}？ / Sign in to {site} with what you saved, for the first time?**, **第一次把你的{detail}给 {site}？ / Give {site} your {detail} for the first time?**; **可以 / OK** · **先不用 / Not now** | Once per site |
| signing in to a site in Ducter's own browser (D151) | card **需要你登录一下 {site} / Sign in to {site}**, **去登录 / Sign in** · **先不用 / Not now**; the live view's top line **Ducter 的浏览器 · 它现在看不见 / Ducter's browser · it can't see this now**, its buttons **好了 / Done** · **先不登了 / Not now**; no page in 40 s (D172): **{device} 上的浏览器 40 秒都没有回应，页面没打开。可以再试一次。 / The browser on {device} didn't answer within 40 seconds, so the page didn't open. You can try again.** · **再试一次 / Try again**; answered **登录好了 / Signed in**. Devices › 上网 on a server: **已登录的网站 / Signed-in sites**, **退出 / Sign out**, **全部清掉 / Clear all**; getting it: **正在装浏览器 / Getting the browser ready**, **还差一步 / One step left**, the sandbox line (D172) **这台的系统不让 Chrome 开它的安全沙盒。在这台上运行一次下面这行（只给 Ducter 的 Chrome 放行），再试一次。 / This system doesn't let Chrome start its security sandbox. Run this line on it once (it allows only Ducter's Chrome), then try again.**, **再试一次 / Try again** | The user signs in themselves; never "take over" or "credentials". "Live view" is a builder's word, never on screen |
| seeing Ducter's own browser work (D154) | **试一下 / Try it** on the 上网 block, beside **打开一个测试网页，亲眼看看它能上网。 / Opens a test page so you can see it browse.**; the view's top line **Ducter 自己的浏览器 · 在 {device} 上 · {Chrome for Testing 157} / Ducter's own browser · on {device} · {…}**, its note **这是 {device} 上的浏览器看到的网页，不是你的 Chrome。点点看、滚一滚都行。 / This is the page as the browser on {device} sees it, not your Chrome. Click and scroll as you like.**, one button **好了 / Done**. Terminal: `ducter browser check` | "Ducter's own browser" is the plain name for it everywhere (tools, partner, CLI); the partner says which browser and where in one sentence, no task |
| watching Ducter's own browser, and taking turns in it (D190) | **看它上网 / Watch it browse** (the opened task); **{task} 正在用它 / {task} is using it** · **看看 / Watch** (the 上网 block, and a working card on the wide On hand); the steps: **正在打开 {host} / Opening {host}**, **正在看这一页 / Reading the page**, **正在点「{label}」 / Clicking "{label}"**, **正在往「{label}」里填 / Typing in "{label}"**, **正在按 {key} / Pressing {key}**, **正在翻页 / Scrolling**, **正在后退 / Going back**, **换到了另一个标签页 / Switched tabs**, **正在截图 / Taking a screenshot**; idle **Ducter 的浏览器 · 在 {device} 上 / Ducter's browser · on {device}**; no page yet **它还没打开网页。一打开，这里就能看到。 / It hasn't opened a page yet. You'll see it here as soon as it does.**; the turns: **换我来 / My turn** · **还给它 / Hand it back** · **关掉 / Close**, the band **现在你在用。它看不见这个页面，也不会动它。 / It's your turn. It can't see this page or touch it.**, elsewhere **你正在另一台设备上用它 / You're using it on another device**; the address line **网址 / Web address**, **输入网址 / Type a web address**, **这里只能打开 http 或 https 的网页 / Only http and https pages open here**; **前进 / Forward** | Turn-taking between partners: the user's turn and the task's, never "take over" or "control". A sign-in stays **去登录 / Sign in**; it is the user's turn from the start |
| a task's result the partner hasn't said yet, in another language than the user's (D154) | **{title} 做完了。 / {title} is done.** · **{title} 没做成，细节里有它的原话。 / {title} didn't work. Details has its own words.**; evidence labels not in the user's language read as a name (a file, a command, the page's host) or what they are: **测试结果 / Test results**, **CI 结果 / CI results**, **运行记录 / Output**, **改动 / Changes**, **文件 / File**, **网页 / Web page** | The task's own sentence stays in the opened task (D152) |
| capability (browser, computer use, phone, calls, remote access) | **no noun on screen** (D66). Headings: **你的设备，和它们会做的事 / Your devices and what they can do** · **还能装上的 / You can also add** | Equip = **装上 / Add to <device>**; remove = **取下 / Remove**; result = "MacBook 现在会上网了 / MacBook can now browse the web"; device detail "MacBook 会：… / can: …". Item names are ability phrases (上网, 用电脑, 在哪儿都能用). Never 学会/教会/赋予/授权 (they read as ordering a subordinate). Never 装备/Gear (reads as armour; rhymes with 设备). Claude Code skills stay **技能 / Skills** on their own page, never on the rack |
| the partner saved something to long-term memory (Mem) | **记下了 · <title> / Noted · <title>** | Inside the Details of the reply it belongs to, with 忘掉 / Forget (D104); all of them under 伙伴 / Partner › 记得什么. Never a card, never a notification. Never "已存入记忆 / saved to memory" in the partner's words; recall is never shown at all |
| a request from another agent through Nowledge Bridge (`bridge_msg` in) | **你的 <agent> 发来请求 · <gist> / Request from your <agent> · <gist>**; a teammate's: **<agent> 发来请求 · <gist>** (D170, J-Q5) | One quiet line, then the partner's own Go/Hold question if it would act. Never 交接 / hand-off (that is a task changing body). Never "Bridge", "mailbox", "contact", "Space" in UI |
| the partner messaging an agent the user named (`bridge_send` card) | **发给 <X>？「<gist>」· 发送 / Send this to <X>? "<gist>" · Send** (D105); after: **已发给 <X> / Sent to <X>**; its answer: **<X> 回复了 / <X> replied** (quiet lines D170) | Default wait, can't be undone. Sent by Ducter's code on the tap, once (D106) |
| another agent that belongs to the user (same member as the persona's owner) | **你的 <agent> / your <agent>** (D108) | A teammate's agent: **<agent> · <team>** (D162: Mem's cards carry no member name; an id never shows). The user is never named to the user |
| a question one of the user's own agents sends for the user (X1, D164, built D170) | card **你的 <agent> 问你 · <gist> / Your <agent> asks · <gist>**, options, **回复… / Reply…**, the asker's suggestion **它建议 / It suggests** (never pre-selected), caption **没回就让它先等着 / If you don't answer, it keeps waiting**; On hand **你的 <agent> · <where it works>**; after: **已回复 <X> / Replied to <X>** | A decision card asked for an outside agent; no new object. The asker gets **用户选了：「…」 / The user chose: «…»**, or on silence **用户还没回，先别按这个动，晚点再问。 / No answer from the user yet. Don't act on this; ask again later.** |
| a standing go for one of the user's own agents (X2, D163, built D170) | offer **以后你的 <agent> 发来的活，直接接？ / Take work from your <agent> without asking from now on?** · **直接接 / Take it directly** · **还是先问我 / Keep asking me**; rule **你的 <agent> 发来的活直接接 · 你接过两次以后定的 / Work from your <agent> starts without asking · set after you took it twice** · **不再直接接 / Stop**; the task's brief **你的 <agent> 让我做的 / Your <agent> asked for this** | A learned rule (D161's list), never a setting the user must find first |
| who of the user's other AI agents may reach the partner; a sender's limits (X3, D163, D170) | Settings › 伙伴 **你的其他 AI / Your other AI agents**: **谁能找到 {name} / Who can reach {name}** · **只有你自己的 / Only yours** · **也包括同事的 / Teammates' too** · **谁都不行 / Nobody**; **<agent> 今天又发来 <n> 条，我先放着了 / <agent> sent <n> more today; I've set them aside**; **不再听 <agent> 的 / Stopped listening to <agent>** · **恢复 / Undo**; a teammate's work request defaults to **先不接 / Not now** | The section shows only once another agent has written (J6). Never "Space", "mailbox", "contact" or "Bridge" |
| the claim Ducter sends when a task opens for another agent's request | **接了：「<title>」。做完把结果回你。 / Taken: "<title>". I'll send you the result when it's done.** (D109) | In the requester's language; the title quoted. The other agent sees it, not the user |
| the outcome a teammate's agent gets when the partner didn't reply itself | **「<title>」：做完了 / 没做成** / **"<title>": done / not done** (D107) | Until a sharing rule exists |
| follow-through on a confirmed message with no answer (S3) | **你的 <agent> 还没回你 <n> 小时前问的「…」，它可能停了。回了我马上告诉你。 / Your <agent> hasn't answered what you asked <n> hours ago ("…"); it may have stopped. I'll tell you as soon as it does.** Read but unanswered: **…看过你 <n> 小时前问的「…」，还没回。… / …read what you asked … but hasn't answered yet. …** (D110) | One line, once, ≥ 2 h, while the user is around, never in quiet hours. Never "reminded" (提醒): nothing wakes the other side |
| an outgoing message that couldn't be confirmed, or was refused | **没能确认<what>是否到了 <X> 那里。我没有重发；需要的话再跟我说一次。 / I couldn't confirm <what> reached <X>. I didn't resend it; ask me again if you need it.**; refused: **<what>没能发给 <X>：被拒绝了。 / I couldn't send <what> to <X>: it was refused.** (D106) | <what> = 你让我发的消息 / the message you asked me to send · 「接了」的回复 / the reply saying I took it · 任务的结果 / the task's result · 回复 / the reply |
| the partner answered that agent | **已回复 <X> / Replied to <X>** (D170) | "Replied" is not "done"; nothing promises the other side has seen it |
| Intent | (shown as a decision or a policy line: "要推送到 ducter/fix-ci / Will push to …") | |
| a task message to the partner (report) | **告诉 {name} / Told {name}** (· 要你定 · 做完了 · 在等 · 没成); freshness "{time}更新 / updated {time}" | Never 汇报 or 交回给 (reporting up) |
| task brief · transcript | **你交代的事 / What you asked** · **{name} 交代的事 / What {name} asked** (· **展开 / Show all** · **收起 / Show less**) · the agent's words, **保存了进度 / Progress saved** under saved progress | Each stretch of steps one gist (D152): **查看了一圈 / Looked around** · **改了 n 个文件 / Edited n files** · **在 {app} 里操作 / Worked in {app}** · **跑了几条命令 / Ran commands** · **想了想 / Thought it through**, **· n 步 / n steps**, **· n 处出错 / n failed**. Each step one sentence: the agent's own words, else a verb and a summary (D127): **思考 / Thinking** · **运行 / Ran** · **读取 / Read** · **编辑 / Edited** · **搜索 / Searched** · **浏览 / Browsed** · **操作 / Used** · **等待 / Waited** · **交给 / Handed off** · **查找 {x} 命令 / Looked for {x}** · **请求 {host} / Requested {host}** · **安装 {x} / Installed {x}** · **新建文件夹 {x} / Made the folder {x}** · **运行一段 {lang} / Ran a {lang} snippet** · **连上 Mem / Connected Mem** · **检查 Mem 连接 / Checked the Mem connection** · **在 Mem 里搜了搜 / Searched Mem** · **开 PR / Opened a PR** · **看 PR 的状态 / Checked the PR** · **合并 PR / Merged the PR**; a probe that found nothing: **没找到 {x} / No {x} here** · **还没有 {x} / No {x} yet** · **没搜到 {x} / No match for {x}**; a real failure **出错 / Error**. Never a tool's name, never "tool call" |
| a hidden key | **隐藏了一段密钥 / A key is hidden** | D152: the key's head, then ••••••; never revealed |
| an opened task's meta line | {state} · {clock} · {agent} · {model} · {where} · **换谁来做 / Switch who does it**; **在 {device} 上 / on {device}**; **用了 {duration} / took {duration}** | D152: one clock, since it started |
| where a task runs, when two or more computers run tasks (D157) | on every task's meta line: **在 {device} 上 / on {device}**, then what it uses when that is the point: **用你的 Chrome / in your Chrome** · **用 Ducter 自己的浏览器 / in Ducter's own browser** · **用 {app} / in {app}**; the reason on hover: **为什么在 {device} 上：{reason} / Why {device}: {reason}** (**一直醒着，合上 {laptop} 也不停 / Always awake; keeps going when {laptop} closes** · **要用你登录着的 {site} / Needs your signed-in {site}** · **只有 {device} 有 {thing} / Only {device} has {thing}** · **{other} 睡着了，{device} 醒着** · **改动在 {device} 上** · **{agent} 只在 {device} 上** · **{other} 连不上，换到 {device} 上了** · **用不着你的登录，{device} 自己的浏览器就够了 / No sign-in needed; {device}'s own browser will do** · **Ducter 就住在 {device} 上 / Ducter lives on {device}** · **你说的，在 {device} 上做 / You said {device}** · **要用的文件在 {device} 上 / The files are on {device}**) | Never shown with one computer. "Computer" in copy is always the device's own name; never 机器 / machine. `design/where.md` |
| choosing the computer (D157) | New task's computer part on a Where chip (**不用文件夹 · hel ▾**), its list **在哪台电脑上做 / On which computer** (**一直醒着 / Always awake** · **有你的 Chrome 和 Mac 应用 / Has your Chrome and Mac apps** · **睡着了 · 醒了就开始 / Asleep · starts when it wakes**); an agent on another computer tagged **在 {device} 上 / on {device}**; in 换谁来做 a group per computer, greyed rows **要用你的 Chrome，{device} 上没有** · **要用 {app}，这台没有** · **文件夹在 {device} 上，搬不走**; moving **从最近保存的进度接着做；分支会先推到 {remote}。** and, when access widens, **会用你的 Chrome，你登录着的网站它都能用。**; Go **换到 {device} 上接着做 / Continue on {device}** | Appears only when there is a real choice |
| asking about where (D157) | **{device} 睡着了。等它醒了用你的 Chrome 做，还是现在在 {other} 上做？** with **{other} 那边没登录 {site}，得你登一下。**; the user's own pick that waits: **{agent} 只在 {device} 上，它现在连不上。等它，还是换个来做？** with **等它 / Wait** · **换 {agent} 来做 / Have {agent} do it**; a waiting task: **在等 · {device} 睡着了**; **等它醒 / Wait for it** (default) · **现在在 {other} 上做 / Do it on {other} now**; only one computer can: **得用 {device} 上的 {thing}，它醒了我就开始。**; closing the laptop: **合上之前搬走 / Move before closing**, **合上之前：{moved} 搬到 {dst} 上接着做；{stay} 只能在 {src} 上做，醒了接着。** with **搬走 / Move them** (default) · **先不搬 / Not now**; on the Devices stage a parcel's tag **在等 / Waiting** · **搬到 {device} 上了 / Moved to {device}**; when a second computer starts doing tasks: **以后每件事会写明在哪台电脑上做。** | Defaults as A3: waiting is free, no countdown |
| waiting on you with nothing to answer | **说完了，等你回话 / Over to you** · **它停在这儿了。回它一句，它就接着做。 / It stopped here. Reply and it carries on.** | D152 |
| an ask's default on a card | **{time}后按默认：{default} / In {time}: {default}** beside a small timer; the Go button a short verb, else **好 / Go** | D127 |
| an opened task's sections | **改动 / Changes** (**n 个文件 / n files**) · **发出去的 / Sent out** (only when something went out) · **怎么判断的 / How it checks** (only with a wait) | D74, D152 (no Details table, no usage line) |
| harness turn ended | not shown (D127; the meta line says where it stands, D152) | Never "turn", "step", 这一轮, 这一步 |
| a message to a task | **它正在做，已经告诉它了 / Told it while it works** · **它收到了，接着做 / Got it; it's on it** · **等它忙完手上的就告诉它 / It'll get this once it finishes what it's doing** · **没送到 / Didn't get through** | |
| the result anatomy (D60) | **怎么知道的 / How I know** (also the evidence heading everywhere; no 证据) · **发出去的 / Sent out** (empty: 没有 / Nothing) · **这次没包括 / Left out** · **合进 {branch} / Merge into {branch}** · **开草稿 PR / Open draft PR** · **改了 n 个文件 / n files changed ›** (the changes link: commits and changed files as one item; **看改动 / See changes** when nothing counts them, D124) · a reproduction shows a muted ×, never ✓ · **草稿 PR 没开成：{why} / The draft PR didn't open: {why}** · **这个仓库没有能推送的远端，开不了 PR，可以直接合进来。 / This repo has no remote to push to, so there's no PR to open. You can merge it instead.** | Under a result: one quiet line of proof, a ↗ line only when something went out, then the actions; See changes is not repeated (D73) |
| effects seen but not gated | **它的记录里看到的 / Seen in its log** | |
| the day's record | **今天发出去的 / Sent out today** | |
| place `none` | **不用特定的地方 / Nowhere in particular** | |
| devices, by the user's own words | **这台 Mac / This Mac** · **这台手机 / This phone** (on an iPad **这台 iPad / This iPad**, D176) · **另一台电脑 / another computer** | Never 机器 / machine in UI copy |
| presence | **{name} 在呢 / is here** · **在做事 / is working** · **有事找你 / needs you** · **刚做完一件事 / just finished something** · **还没醒 / isn't up yet** | Never 待命 |
| stopping Ducter on a Mac (D56) | **让 Ducter 歇着 / Stop Ducter** (menu) · **{name} 歇着了 / {name} is resting** · **叫醒 {name} / Wake {name}** | Closing the window or ⌘Q never stops Ducter; this is the one explicit stop. 叫醒 is the same verb as for a device, on purpose |
| updating a device in place (D148) | one quiet dot by its name · **已经是最新的 · {t}查过 / Up to date · checked {t}** (**刚查过 / checked just now**, D160) · **现在检查 / Check now** · **有新版本 {v} / Update to {v}** · **更新 / Update** · **在下载 {v}… / Downloading {v}…** · **在核对 {v}… / Checking {v}…** · **等手头的事停好… / Waiting for work to settle…** · **在重启… / Restarting…** · **回来了，现在是 {v} / Back, now on {v}** · **没更新成，已经换回 {v} / Didn't update; back on {v}** · **再试一次 / Try again** · **夜里自动更新 / Update at night** · Settings: **各台电脑上的 Ducter / Ducter on each computer** · this Mac's own worker when the app is already current (D172): **这台 Mac 上的 Ducter 已经是 {v}，替 {home} 做事的那部分还在用旧的，重启一下就好 / Ducter on this Mac is already {v}; the part that does tasks for {home} still runs the old one. Restart it to catch up.** · **重启它 / Restart it** · a Mac from any client (D187): **{Mac} 上的 Ducter 会下载、核对，等手头的事停好再重启。/ Ducter on {Mac} downloads and checks it, then restarts once nothing is mid-way.** · **那台 Mac 上的 Ducter 没开着，或者 Mac 睡着了… / Ducter isn't open on that Mac, or the Mac is asleep…** · the app's own check: **这次没查成 / Couldn't check this time** · **GitHub 没应答，一小时内再试。/ GitHub didn't answer; it tries again within the hour.** | What's new is a line or two in the reader's own language, never the other one's (D172). No pop-up, no badge count; the partner says it only when asked, or for a security fix (to do). Never "upgrade", "patch", "deploy" on screen |
| a device's card (D148) | its name, renamed by clicking it (**回车保存，Esc 不改 / Enter to keep, Esc to cancel**) · **云上的电脑 / A computer in the cloud** · **一台 Mac / A Mac** · **{what} · {name} 住这儿 / {what} · {name} lives here** · **{what} · 替 {name} 做事 / {what} · does tasks for {name}** · **+ 再登录一个 AI / + Sign in another AI** · **断开 / Disconnect** → **断开 {device}？/ Disconnect {device}?** · **算了 / Keep it** · a phone or a window (D155): **你的 iPhone · 用 Safari 连着 / Your iPhone · connected through Safari** · **一台 Mac · 用 Ducter app 连着 / A Mac · through the Ducter app** · **现在连着 / Connected now** · **最后在线 {time} / Last seen {time}** · **它能为你做的 / What it does for you** (**收到提醒 · 回答等你决定的事 · 和 {name} 说话 / Get notifications · Answer what waits for you · Talk with {name}**) · a second default name gets **· 2** | Never a terminal command in the UI (`ducter devices …` stays for the CLI). Every card renames in place, the home's too (D155) |
| one computer, one card (D155) | **命令行也连着 / The command line is connected too** · **Ducter app 也连着 / The Ducter app is connected too** (a quiet line in its computer's card; **⋯ › 断开 / Disconnect** → **断开 {host} 上的命令行？/ Disconnect the command line on {host}?**) · alone: a computer named after its host, **一台电脑 / A computer** · **命令行连着 / The command line is connected** | Never "CLI on {Mac}" in the app: that name stays in `ducter devices` only |
| this Mac doing tasks for a home elsewhere (D155) | **让这台 Mac 也替 {home} 做事 / Let this Mac do tasks for {home}** (one switch, on this Mac's card and Settings › 在哪儿运行) · off: "{home} 能把事派到这台 Mac 上…它只做事，看不到你们的对话。/ {home} can send tasks to this Mac… It only does tasks; it never sees your conversation." · on: "在后台运行：登录时自己开始，停了会自己重启。/ Runs in the background: starts at login, restarts if it stops." · **在连上… / Connecting…** · **在停下… / Stopping…** | Never "worker", "LaunchAgent" or "daemon" in UI copy; the CLI's own words are `ducter service install --worker` |
| an AI agent's own version (D156) | **版本 {v} / Version {v}** · one quiet dot and **有新版本 {v} / Update to {v}** · **更新 / Update** · **Ducter 还没验证过这个版本。/ Ducter hasn't checked this version yet.** · **Ducter 还没验证过 {v}，要等你点一下才装。/ Ducter hasn't checked {v} yet, so it waits for your tap.** · **随 Codex app 更新 / Updates with the Codex app** · **随 Ducter 更新 / Updates with Ducter** · **等它手上的事停好… / Waiting for its work to settle…** · **在更新到 {v}… / Updating to {v}…** · **在检查 {v}… / Checking {v}…** · **好了，现在是 {v} / Done, now on {v}** · **没更新成，已经换回 {v} / Didn't update; back on {v}** | Under each AI account row in a device card. "Verified" is never on screen: it is **验证过 / checked**, and says nothing alarming. Never "upgrade", "outdated", "unsupported" |
| a device card as a character sheet (D161) | status line **{name} 住这儿 / {name} lives here** · **你正在用的这台 / The one you're using** · **在替 {home} 做 {n} 件事 / Doing {n} tasks for {home}**; the coin socket **再登录一个 / Add an AI**; a coin's detail **版本 {v} · 用 npm 装的 / Version {v} · installed with npm** (**用 Homebrew 装的 / installed with Homebrew** · **它自己装的 / installed by its own installer**) · **和 {device} 共用一个账号的额度 / Shares one account's limit with {device}** · signed out **登录以后，{device} 上的事也能交给它。/ Sign in and {device}'s tasks can go to it too.**; ability chips **上网 / Browse** · **用电脑 / Use apps** · **在哪儿都能用 / From anywhere** · **替 {home} 做事 / Tasks for {home}** · **通知 / Notifications** · on the home only **打电话 / Calls** (D199: + opens 账号 and connects Tuwa; on opens the phone card; its sign-in gone **需要重新登录 / Sign in again**) · the home's abilities still to come as faded ghosts, **用电脑 / Use apps** · **用手机 / Use a phone**, each with **以后会有 / coming later** (a tap only explains); turning one off **{device} 上还有 {n} 件事在做。停下来，还是做完再停？/ {device} still has {n} tasks under way. Stop now, or after they finish?** · **做完再停 / After they finish** · **现在停 / Stop now**; failure **没开成：{reason} · 看日志 / Didn't start: {reason} · See the log**; **通过 app 和命令行连着 / Connected via the app and command line**; **断开这台 {device} / Disconnect this {device}**; the list's one word **住这儿 / home · 在做 {n} 件 / {n} tasks · 现在连着 / connected**; the switch sheet's subtitle **换谁，也可以换一台电脑 / Someone else, or another computer**; a learned rule **你换过两次以后定的 / Set after you switched twice** | `design/ui-devices-card.md`. Replaces on the card (the words stay where other surfaces use them): the kind line (kept in the accessible name), **它能为你做的**, the folded **…也连着** rows, **N 台设备共用**. The en chip labels are short forms of the ability names, which stay on the stage. Also: **做完手上的事就停。/ Stops once its tasks finish.** · **这是做什么的 / What this does** (ⓘ) · **开着 / on** · **没开 / off** (a chip's state, said to screen readers) · **Ducter 有新版本 {v} / Ducter {v} is out** · **登录和退出在 {device} 上做。/ Sign in and out on {device} itself.** · **还没装在 {device} 上：/ Not on {device} yet:** · **再连一台 / Connect another** |

| the Android app updating itself (D181) | **有新版本 {v} / Update to {v}** with the release's own lines · **更新 / Update** · **以后再说 / Later** · **在下载 {v}… n% / Downloading {v}… n%** · **在核对 {v}… / Checking {v}…** · **在安装 {v}… 装好后 Ducter 会关一下，再打开就是新的 / Installing {v}… Ducter closes once it's in; open it again for the new one** · **回来了，现在是 {v} / Back, now on {v}** · **没更新成 / Didn't update** + why · **安卓会问一次：是否允许 Ducter 安装自己的更新 / Android asks once whether Ducter may install its own updates** + **去打开 / Open the setting** · the icon's long-press **检查更新 / Check for updates** · **已经是最新的 / Up to date** · the page: **安卓 App 这一版还不能发通知；打开它就能看到要你看的事 / The Android app can't send notifications in this version yet; open it to see what needs you** · a device: **你的安卓手机 · 用 Ducter app 连着 / Your Android phone · through the Ducter app** | One card, never a dialog; Android's own install words are Android's. Never "APK", "sideload", "upgrade" on screen |
| the home older than the app (D200) | **{home} 上的 Ducter 还是 {v}，比这个 App 旧，有些新东西要等它更新。/ Ducter on {home} is still {v}, older than this app; some new things wait for it to update.** (no version known: **{home} 上的 Ducter 比这个 App 旧，有些新东西要等它更新。/ Ducter on {home} is older than this app; some new things wait for it to update.**) · **去更新 / Update it** · **知道了 / Got it** | The iPhone/iPad and Android apps' own line, never the page's (an older page can't know). Once per pair of versions; never a dialog, never "outdated" or "incompatible" |
| updating the app (D72) | **检查更新… / Check for Updates…** · **有新版本 {v} · 重启时更新 / Update {v} ready · restart to finish** · **有新版本 {v} · 去下载 / Version {v} is out · Download** · **现在重启 / Restart Now** · **正在换上新版本，马上回来 / Putting the new version in, back in a moment** · **已更新到 {v} / Updated to {v}** · **退出时自动更新 / Update automatically when quitting** | One quiet line in the app menu and Settings; never a pop-up the person didn't ask for |
| removing Ducter (D72) | **彻底移除 Ducter / Remove Ducter** · **会删掉 / Removes** · **会留着 / Keeps** · **只停下并移除后台项 / Only stop and remove the background item** · **全部移除 / Remove everything** · **任务的工作副本 / tasks' working copies** (the worktrees) | The page names each path; never "uninstall" in copy. 后台项 matches macOS's own "后台项目 / background items" |
| help (D72) | **Ducter 使用指南 / Ducter docs** · **报告问题… / Report a problem…** · **也带上最近的对话 / Include the last conversation** (off by default) | Nothing is uploaded; the person attaches the .zip themselves |
| the partner's tab (D150; its own page in D71) | **伙伴 / Partner** (Settings' first tab; ⌘4, and the partner's own face and name in the conversation's bar open it) · **改名字 / Rename** · one line **住在 {device} 上 · 用 {agent} 想事情 / Lives on {device} · thinks with {agent}** · **{device} 上的 AI agent / AI agents on {device}** (the home's own name; "这台 Mac / this Mac" when it is this Mac) · **自动选的：只有 {agent} 登录了 / Picked for you: only {agent} is signed in** (core's fallback to Codex, D150) · **自动选的：Claude Code 没登录 / Picked for you: Claude Code isn't signed in** (its fallback to DeepSeek Harness or pi, D177) · **回你用的语言 / Replies in** | A calm header, not a form. The faces strip is gone from the header (D150). Never "profile", "persona", "agent settings" |
| how the partner talks | **怎么说话 / How it talks**: **跟着我 / Follow me** · 中文 · English | Follow me = the language of the user's message |
| notifications and the default wait | **什么时候找你 / When it comes to you**: **通知 / Notifications** · **免打扰 / Quiet hours** ({start} 到 {end} / to) · **你没回的时候 / If you don't answer** · "等多久再按默认做 / How long before it goes with the default" | Only reversible decisions wait; irreversible ones always wait for the user |
| the iPhone app's notifications (D159) | **通知中转 / notification relay** (the small forwarder Ducter's publisher runs for Apple notifications) · the neutral line Apple carries: **Ducter 需要你看一下 / Ducter needs you** · **内容只在这台手机上解开，通知中转和苹果只看到「Ducter 需要你看一下」/ The words are unlocked only on this phone; the notification relay and Apple see just “Ducter needs you”** · **通知中转现在连不上，通知可能晚到。Ducter 会接着试。/ The notification relay can't be reached right now, so notifications may be late. Ducter keeps trying.** · **更新这个 App 之后，才能收到通知。/ Update this app to get notifications.** · **你的 Ducter 还不能给这个 App 发通知：它关掉了通知中转，自己也没有 Apple 推送密钥。/ Your Ducter can't notify this app yet: its notification relay is off and it has no Apple push key of its own.** | Internal: relay, handle, the phone's key (`push-relay.ts`). Never "server", "cloud" or "proxy" for the relay: it only forwards Apple notifications. **Apple 推送密钥 / Apple push key** appears only where a home has turned the relay off |
| a connection (the user's OpenConnector or another MCP server, or the accounts in their oo, D122) | **它能看的账号 / Accounts it can read** (Settings › 账号 / Accounts) · **加一个 / Add one** · where: **OOMOL 托管 / Hosted by OOMOL** · **自己部署的 / Self-hosted** · **其他服务 / Something else** · **地址 / Address** · **钥匙 / Key** · **怎么连 / How to connect** (a fold for Self-hosted and Something else: the setup steps, the only place OpenConnector, its Access page, Create Token and MCP are named) · Hosted by OOMOL (D158) has no address and three steps instead: **去 OOMOL 连账号 / Connect accounts in OOMOL** · **去拿钥匙 / Get a key** · the key's **显示 / Show** (藏起来 / Hide) · **先把钥匙填上。/ Paste a key first.** · added: **加上了 {name}，现在能看：Gmail、Discord / Added {name}. It can now read Gmail, Discord.** · none there yet: **连上了，但 OOMOL 里还没连任何账号。/ Connected, but no accounts are connected in OOMOL yet.** · refused: **钥匙不对或已失效，换一把新的。/ That key was refused or has expired. Use a new one.** · **检查并加上 / Check and add** · **移除 / Remove** · **用你在 oo 里设好的那一套 / Use the one you set up in oo** (an oo with a self-hosted OpenConnector and no sign-in) · with oo signed in (D122), the default offer: **你在 oo 里的账号 / Your accounts in oo** · **用这些账号 / Use these accounts** (正在加上… / Adding…) · **用地址和钥匙加一个 / Add one with an address and key** (the form, stepped back) · the added row **oo 里的账号 / Accounts in oo** · **经过 oo / Through oo** · result "Ducter 现在能看 {name} 里的账号了 / Ducter can now read the accounts in {name}" | 钥匙 / Key: OpenConnector calls it a token (its Access page's Create Token); the UI names that button and otherwise says key, because "token" is retired in UI copy (D66). Decided 2026-11-09 (the author, "按建议") Never "connector", 授权, 接入. 连上 / Connect stays for devices, except what the person does in OOMOL's own console (连账号, D158); Ducter's own act stays 加上 / add. Each one says where what it reads passes, worded by what it holds (D192). The card's default surface says what it does for the person ("让 Ducter 帮你看邮件、日历和 GitHub… / Let Ducter read your mail, calendar and GitHub…"); product and protocol names stay behind 怎么连 / How to connect |
| a phone call (D189, D193; `phone.md`) | **打电话 / Make calls** (the offer; the ability; **打电话 / Calls** as the home's chip, D199) · **连上 Tuwa / Connect Tuwa** · **在手机上登录 Tuwa / Sign in to Tuwa on your phone** · **打开登录页 / Open the sign-in page** · **等你在手机上点同意… / Waiting for your yes on your phone…** · **先不连 / Not now** · **再来一次 / Try again** · the card **打电话 · Tuwa / Calls · Tuwa** · **能打电话了 / Ready to call** · **每天最多 / Daily limit** · **你的声音 / Your voice** · **去 Tuwa 录 / Record on Tuwa** · **我录好了 / I've recorded it** · **用我的声音打 / Call in my voice** · **删除我的声音 / Delete my voice** · the Go card **打给 {name}？ / Call {name}?** with **号码 / Number · 要办的事 / What for · 可以说 / May say · 不说 / Won't say · 声音 / Voice · 从 / From · 大约 / About · 什么时候 / When**, **打过去 / Call** · **先不打 / Not now** · a question **对方在问 / They're asking** · **可以 / 不行 (Yes / No)** · On hand **在打给 X… / Calling X…** · **通话中 / On the call** · **挂断 / Hang up** · **不打了 / Cancel call** · **打完了 / Called** · **没能确认 / Couldn't confirm** · **没人接 / No answer** · **没打出去 / Didn't go through** · **说了什么 / What was said** | One card per call, never a default and never "don't ask next time". The line always says it is an AI (Ducter's voice or the owner's own); never "this is {owner}". Never 拨号 / dial, 授权 / authorize, 克隆 / clone in the UI; the voice is "your voice". Tuwa is named because the owner signs in and pays there |
| proactive help over the accounts (D165, D166, D173) | the switch **自己发现了事，怎么告诉你 / When it notices something**: **只说急的 / Only urgent** · **每天最多 3 件 / Up to 3 a day** (default) · **有用就说 / Whenever useful** · **不用主动找我 / Only when I ask** · the morning note opens **早。/ Morning.** and then the finds; what was left out, **没说的：… / Left out: …**, only when they ask · a silent day: nothing at all · under a find **有用 / Useful** · **这类不用告诉我 / Don't tell me this kind** (→ **好，这类以后不说了。**) · a find not acted on by its date: **过了 / Passed** · the kinds: **两件事对不上 / Two things don't match** · **在等你回 / Waiting on you** · **你在等别人回 / You're waiting on someone** · **你答应过的 / Something you promised** · **快到期 · 要花钱 / Deadlines and money** · **计划变了 / A plan changed** · **开会前 / Before a meeting** · **早上那条还要吗？/ Keep the morning note?** · the card: **在留意 / Keeping an eye out** · **已暂停 / Paused** · **你问起来才去看 / Reads only when you ask** · **自己留意 / Watch on its own** · **只看 @你 和私信 / Only @-mentions and DMs** · **不让 Ducter 看这个 / Don't let Ducter read this one** · **看了哪些 / What it read** · **不用 {name} 了 / Stop using {name}** · the first add: **要不要我现在看一眼过去 3 天，有没有在等你回的？/ Want me to look through the last 3 days for anything waiting on you?** → **有 {k} 件在等你回：/ {k} things are waiting on you:** or **没有在等你回的。/ Nothing is waiting on you.** · **好，看一眼 / Take a look** · **先不用 / Not now** · a find's state: **先放着 / On hold** · **在办了 / On it** · after 有用: **记住了，这类有用。/ Noted: this kind is useful.** · a tile's detail (D192): **会看 / Reads** · **先问你 / Asks first** (labels beside the words) · **最后看过：… / Last read: …** · **Ducter 不看这个账号；你问起来也不看。/ Ducter doesn't read this account, not even when you ask.** · 自己留意's note when nothing looks: **上面选了「不用主动找我」，现在不会自己去看 / You chose “Only when I ask” above, so it won't look on its own** · **上面还没选怎么告诉你，现在不会自己去看 / Choose how it tells you above first; until then it won't look on its own** · where it passes, by what the card holds: **邮件 · 日程 · 消息 · GitHub 通知 · 读到的内容 / emails · events · messages · GitHub notifications · what it reads** · **这个月用了 {p}% / {p}% of this month's budget used** · **让 Ducter 看这个 / Let Ducter read this one** (undo) · **不看 / Not read** · the dashed tile: **再连一个 / Connect another** · **在 oo 里再连一个 / Connect another in oo** | Never "proactive", "digest", "briefing", "watcher", "monitor", "nudge" or "triage" on screen, and never how much it read (D173: 看了 214 封信 only under ⋯ 看了哪些). "The morning note" is the docs' name; on screen it is simply the partner's message. A Rule from 这类不用告诉我 is worded in the kind and the sender. Remove (built, D166): **移除 {name}？Ducter 就看不到这些账号了。/ Remove {name}? Ducter won't read these accounts anymore.** · **算了 / Keep it** |
| memory, as the user controls it | **记得什么 / What it remembers** · **记住事情 / Remember things** (switch) · **最近记下的 / Noted lately** · **忘掉 / Forget** ("忘掉了：{title} / Forgotten: {title}"; when Mem can't: "这里不再显示…；Nowledge Mem 里那条还在 / … is hidden here; it's still in Nowledge Mem") · without Mem, the one mention: **你说过的话它都记着。连上 Nowledge Mem（可以免费下载，在你自己的电脑上跑），它还能跨对话记住你的偏好，你的其他 AI 工具也能一起用。/ It remembers this conversation on its own. With Nowledge Mem (free to download, runs on your own computer), it also keeps what it learns across conversations and shares it with your other AI tools.** + **了解 Nowledge Mem / About Nowledge Mem** · on: **记得你说过的事，存在 Nowledge Mem 里；替你做事时也用得上 / … and uses it in its tasks too** · off: **聊天和做事都不回想，也不记新的 / … in chat or in its tasks** (D168: its tasks use Nowledge Mem; the one switch covers them) | Never "delete memory", "knowledge base", "记忆库" |
| Nowledge Mem in the user's agents, per computer (D169) | One line under each installed agent in its device card: **Nowledge Mem 已装 · {v} / Nowledge Mem {v} installed** · **Nowledge Mem 没装 / Nowledge Mem not installed** + **装上 / Install** · **Nowledge Mem 有新版 / … has an update** + **更新 / Update** · **Nowledge Mem 装了不止一份，要看一下 / … installed more than once; worth a look** · **说不好 Nowledge Mem 装好没有，要看一下 / Can't tell if Nowledge Mem is set up; worth a look** + **理一下 / Sort it out** · **正在装 Nowledge Mem… / Installing Nowledge Mem…** · the ask: **在 {device} 上给 {agent} 装上 Nowledge Mem？/ Install Nowledge Mem for {agent} on {device}?** with what it changes, **装上 / Install** · **算了 / Cancel** · Ducter's one card: **{device} 上的 {agent} 还没装 Nowledge Mem。装上以后，我在那儿做事和你自己用 {agent} 时都记得你；会改 {agent} 自己的设置。/ {agent} on {device} doesn't have Nowledge Mem. With it, my work there and your own {agent} sessions both remember you; it changes {agent}'s own settings.** · **装上 / Install** (suggested, waits for the tap) · **先不装 / Not now** | "Installed", never "working" or "在用" (Mem's check doesn't prove the agent loads it). Never "plugin" in the line (the product's name is the literal thing); never a silent install |
| what runs without asking | **自己就做，还是先问你 / On its own, or asks you first** · **自己就做 / On its own** · **先问你 / Asks you first** | Read-only today; the items say the property (发给别人的 / reaches other people, 收不回的 / can't be taken back) |
| Settings (D150; was D71's app-only Settings) | **设置 / Settings** (⌘,; Settings… in the menus): one place, a rail of tabs (the phone: a list of the same sections, each pushed) · **伙伴 / Partner** · **通知 / Notifications** · **账号 / Accounts** · **外观与声音 / Look and sound** (**外观 / Look**, **语言和对话 / Language and conversation**, **界面语言 / Language** (**跟着系统 / Follow the system**), **声音 / Sound**: **开场的声音 / The intro's sound** with **听一下 / Play**) · **在哪儿运行 / Where it runs** (**住在哪儿 / Where it lives**, **歇着 / Stop**, **数据和记录 / Data and logs**: 数据文件夹 / Data folder · 记录 / Log · **检查一遍 / Run checks** · 都好 / All good; **你的设备和 AI 账号 / Your devices and AI accounts**) · **更新与关于 / Updates and about** (**关于 / About** when the copy doesn't update itself; **帮助 / Help**, **素材与致谢 / Credits**) · the phone's **这台手机 / This phone** | Never "General", "Preferences", "Advanced". 关窗以后 / When you close the window is retired: it said where Ducter runs |
| the look (theme) that ships | **Pebble** (a proper name, the same in zh and en; shown under 外观 / Look) | The only theme that ships. Pebble is light; web and iPhone follow the system's dark mode today; **Midnight** (dark) is planned for the Mac (D134, roadmap) |
| AI accounts on Devices | **登录 / Sign in** · **退出登录 / Sign out** · **装上 / Install** (an account card on this Mac) | The tool's own sign-in, in the browser; Ducter never sees the password |
| the first-wave harnesses (D85) | **Claude Code** · **Codex** · **pi** · **DeepSeek Harness**, each product's own name, the same in zh and en | Never "harness", "runtime" or "adapter" on screen. pi is written lower-case, as its makers write it |
| an account that runs on an API key (pi, DeepSeek Harness) | **需要一个 DeepSeek 密钥 / Needs a DeepSeek key** · **有 DeepSeek 密钥 / Has a DeepSeek key** · pi: **有能用的模型 / Has a model it can use** | The key is typed into a masked field and kept on this machine only (D85 proposal); never shown again, never in the conversation |
| adding a device | **连上手机或另一台电脑 / Connect a phone or computer** (opens the one-time code) | Same words as D54's Connect. One code for any device (D83); the card says both ways: **手机或 Ducter 应用 / On a phone or in the Ducter app** (scan, or open the address and type the code) and **另一台电脑 / Another computer** (run one command) |
| the menu bar extra | the clay partner in the macOS menu bar; its menu: **等你 · {n} / Needs you · {n}** or **没有要你定的事 / Nothing needs you**, each question with **好：{action} / Go: {action}** · **先等等 / Hold** · **回复… / Reply…**, then **打开 Ducter / Open Ducter** | |
| a sandboxed place | **no noun**: the property, **碰不到你的文件 / Can't touch your files** | 沙盒 retired (D66, GQ8) |
| Artifact | **做好的 / Finished**; the list **做好的东西 / Everything finished** | 成果 retired (report-speak) |
| the first screen (empty conversation) | the partner's greeting in its own name: **早上好呀，我是{name}。 / Good morning, I'm {name}.** (returning: **{name} 在呢 / {name} is here**); starters under **可以这样开头 / You could start with**, each in the person's own voice; one timely line with **去看看 / Take a look** | D149. Starters are worked out on the home from names it already has; never a path, never how they were made |

## 2. Objects and ownership

| Object | Owned by | What it is |
|---|---|---|
| **User** | | The person. Attention, quiet hours, devices, subscriptions, skills, projects, and global rules are theirs |
| **Persona** | user | A named partner with one conversation and one Mem identity |
| **Device** | user | An enrolled Mac/Linux box or an ephemeral sandbox; shared by all personas |
| **Project** | user | A grouping label that remembers its places and rules; shared across personas |
| **Repo** | project | A git repository, identified by its remote |
| **Checkout** | repo × device | Where that repo lives on that device; discovered automatically |
| **Folder** | project | A non-git directory on a device |
| **Recipe** | repo | Setup / run / cleanup commands, approved once |
| **Task** (window) | persona | One delegated job with its own session, place, project label, and states |
| **Routine** | persona | A template (trigger, brief, report policy, budget, effect scope, review date) whose firings create runs |
| **Waiter** | task | A one-shot predicate that wakes its task |
| **Rule** | user, persona, or project | A binding preference |
| **Intent** | task | A pending external effect |
| **Result** | task | A file, document, diff/PR, report, or app it produced |
| **Partner settings** | persona | Its name, how it talks, notifications and quiet hours, the default wait, whether it remembers (D71). On the server; the same on every client |
| **App settings** | each client | Look, the window's language (D71). On that device only |

**Rule precedence**, most specific wins: task pin > project rule > persona rule > user rule >
Ducter default. A rule that can't be honored is never skipped silently (principle 14).

## 3. Place and project

Every task shows two editable things on its card and header.

**Where / 在哪儿做**, shown as chips such as `HawDB · MacBook · ducter/fix-ci`. It is one of:
- nothing: thinking or writing;
- a folder on a device;
- one or more repos on a device;
- a browser profile;
- a phone or call.

**Project / 项目** is a short title shared by related tasks. It is a label, not a container.

**Smooth by default.** In the common case Ducter asks no questions:
- **Place:** inferred from what you said (a repo name, a path, a URL, "on the Linux box")
  plus what Ducter knows.
- **Device:** if a repo lives on several devices, Ducter picks one that is awake, has a warm
  cache, or matches a rule. The card says why. D157 (`design/where.md`) generalizes this:
  the computer is ranked together with the agent from what the task needs, said on every task
  once there are two computers, and never moved toward the user's sign-ins without them.
- **Project:** inferred from the place (a repo's project) or from the conversation. It is
  created implicitly the first time and shown as a "new project" chip you can rename or undo.
  You can also make one yourself (D186): **加一个文件夹 / Add a folder** picks a folder (a repo
  or not) on the home's computer, or (D197) on this Mac when the home is on a server and this
  Mac does tasks for it; it becomes a project with the folder's name, shown on On hand
  By project before any task, and every task in that folder belongs to it.

**Controllable always:**
- **Projects:** rename one inline (every task carrying it follows), move a task to another
  project, or merge two projects.
- **Changing a task's device, base branch, or repo** is a handoff (principle 13). The old task
  becomes superseded. Adding a repo just extends the place.
- **新建 / New task** (D128, D185): a quiet text button on On hand, or ⌘N, opens a card:
  做什么 / What first ("你写的话会原样交给它 / It gets your words as you wrote them"), then one
  row of pills: the folder (most recent first, or 不用文件夹 / No folder), the repo's branch,
  the computer when the choice is real, 谁来做 / Who does it (the best fit, tagged 推荐 /
  Suggested; the last pick remembered), and 什么时候开始 / When it starts (现在 / Now, or later,
  on a schedule, when something happens, or until something holds). Start (⌘↩) opens the task
  with those words as its brief, unchanged, and opens it; ⇧⌘↩ starts it and keeps the card for
  the next one. The partner says nothing then and reports the result like any task. It is the
  power path, never required. From a terminal: `ducter task "<words>"`. Details:
  `design/new-task.md`.

**Repos and worktrees**

*Discovery and cloning*
- A runner discovers the checkouts on its device.
- A repo can be cloned onto another device using that device's own git login. Ducter asks
  once per repo.

*Worktrees*
- A task whose brief says it will **write** gets a worktree **at start**, at
  `~/.ducter/worktrees/<repo>/<slug>`, named like its branch `ducter/<slug>` (D198), so Finder
  and an editor's recent list say which task it is. The slug is the title's own words in their
  own script (D201: `修复登录页的闪退`, `fix-the-flaky-test`). On the Mac, the opened task shows the path
  and **打开 / Open** takes the user there by hand.
- A **read-only** task reads the main checkout, including uncommitted changes, and never
  gets a worktree.
- In a **multi-repo** task, the repos marked writable get worktrees at start; the others are
  read on demand.

*Recipes*
- The first time a repo is used, Ducter proposes a Recipe and the user approves it once.
- Recipes are stored in Ducter, with an offer to commit them to the repo.

*Caches and files*
- Dependency caches are shared: pnpm, bun, uv, sccache.
- Build output directories are never shared or symlinked.
- `.env`-style files are copied per `.worktreeinclude`.

*Ports and leases*
- Each task gets a 10-port block.
- Exclusive resources, like a database port, make the second task **wait** instead of
  crashing.
- One writer per write set. A second task wanting the same files shows "在等 · 被占用 /
  Waiting · in use", or proposes its own branch.

*History*
- Checkpoints are private git refs.
- The branch is pushed as `ducter/*` at each checkpoint:
  - personal repos automatically;
  - org repos after asking once per repo.
- This push is what makes moving a task to another device possible.
- A task may also push its branch and open a PR itself when the work calls for it (D132); it
  isn't gated, and what went out shows in Sent out.
- A revert appends to the Log; history is never deleted.

*PRs*
- Draft by default, created as an intent.
- Rebase is a decision with a default.
- A merged PR auto-archives its task.
- Ducter never merges unless a rule allows it.

*Archive and disk*
- A merge (the Merge button or `ducter merge`) archives its task: the device's own runner
  removes the clean worktree Ducter made and keeps the branch. A worktree with leftovers is
  kept, never force-removed, and the task says why (D125). A follow-up adds it back from the
  branch.
- Each device has a disk budget. Reclaiming archived worktrees is automatic; deleting
  anything else needs Go.

*Folders that aren't git*
- The task works in the folder itself, so results show at once. Before its first change Ducter
  keeps a copy (a clone, near-zero space); its **改动 / Changes** say what it did in plain words
  and offer **改回去 / Undo all changes** (exact, checked by hash) and **就这样 / Keep the
  changes**, until 7 days after it finished (D142). A folder that can't be copied cheaply
  (cloud-synced, a network or external drive, too big) asks first. No Merge for a folder.

## 4. Work over time

Two primitives plus one property cover every case.

- **Waiter** on a task: "tell me when the PR is approved" (D112). A time, or a condition compiled
  into a small read-only check run where the task works (no model turn per look), or a
  connection's event (OpenConnector triggers); a cheap model judges only what code can't, only
  on change. It may have a deadline; past it the task needs you. While waiting, the task shows
  **在等 / Waiting** with what it waits for, Ducter sitting on its bench, and a groove from start
  to deadline (D115).
- **`until` on a task**: "keep fixing until CI is green". A cheap model judges the condition
  after each turn. The loop stops on any of:
  - the condition holding;
  - 20 iterations (the default cap);
  - no progress;
  - oscillation.

  The card shows how close the goal is: clay lights for checks that must pass ("6 盏灯里亮了 4 盏"),
  or items a judge counted; when nothing can be counted, the latest try in words (D115). A try's own done report
  doesn't finish the task.
- **Routine / 例行**: "every Monday at 9, draft the weekly report", "when someone replies to
  this thread, summarize it".
  - Each firing creates a **run**: a fresh task by default. A "babysit one thing" routine
    continues a single task across runs.
  - On On hand a routine is **one card**, showing its next firing and its latest run. Runs are
    nested inside it. Only runs that will need the user appear on the attention forecast.
  - **Creation:** always through a proposal card in the conversation, showing:
    - the trigger in words, with the time zone;
    - the next 5 firings, or a live dry run of the condition;
    - the budget;
    - how it reports;
    - its effect scope.

    One Go activates it. The agent may pause it; only the user resumes it.
  - **Time zone:** personal-time routines follow the user ("every morning at 9, brief me");
    world-time routines are pinned ("at market open", "team standup"). Ducter infers which
    and states it on the card.
  - **Budget:** each run is capped at 2× the first run's actual cost, plus a monthly cap.
    Both are shown and editable.
  - **Reporting:** report on change, or when it needs you. Digests the user asked for are
    always delivered.
  - **Missed firings** (devices asleep) coalesce. Ducter tries, in order: another device, then
    waking the device, then one late run, then recording the skip. The cloud fallback is off
    unless enabled per routine.
  - **Lifespan:** each routine has a review date, 30 days by default. It auto-pauses after 3
    consecutive failures or 3 unread reports, then asks "还要吗？ / Keep this?".
  - **Visibility:** the condition is always shown in plain words; the compiled code is
    visible once the task is opened.
  - **Safety:** each routine has a fixed effect scope, and anything beyond it becomes an
    intent. Trigger payloads (emails, webhooks) are untrusted data. Harness-native cron and
    loops stay disabled.

## 5. Personas

- Each persona has its own conversation and Mem identity. Its tasks run under that identity.
- Its tasks run with the user's Nowledge Mem plugin as the persona's identity (D168); where the plugin isn't on that computer, the persona's own recall and a read-only search fill in. Only the partner writes memories; a task proposes.
  The identity is bound once (the user's own if they set one, else Ducter's `ducter`) and
  survives a rename: the name is only its label (D141).
- **Attention is the person's.** On hand aggregates every persona, and each card carries its
  persona's face and color. Conversations stay separate.
- **Isolated by default.** A persona reads or asks another only after the user links them.
- **Recognizable at a glance:** its own face, accent color, and optionally theme.
- **Creating one is light:** a name plus one sentence. Mem's birth-draft flow does the rest.
- **Quota:** subscriptions belong to the user. The main-AI reserve is kept per subscription,
  shared by all personas' main turns. *Not built (D133): no harness reports its limit yet, so
  the reserve and limit-based picking are on the roadmap.*

## 6. Scenario catalog

Each scenario needs a flow, states, copy (zh + en), and motion. Status is tracked in
`design/scenarios.md` once flow work starts.

- **A. Setup and devices.** First run; pairing a device; a device sleeping or waking; going
  offline mid-task; the same repo on two devices; a harness not logged in; quota running out;
  a second persona.
- **B. Kinds of work.**
  - Quick answer done in turn.
  - Research with no place.
  - A code change in one or several repos.
  - Browser work that needs a login.
  - A phone or call task.
  - Writing.
  - A `until` loop; a waiter; a one-off scheduled run; a recurring routine; an always-on
    monitor.
- **C. Places and projects.** First mention of a new repo; discovering repos; a project with
  no repo; a non-git folder; the recipe failing; a port clash; a busy lease; PR, rebase,
  merge, archive; running low on disk.
- **D. Decisions and attention.** A decision with a default and countdown; batch harvest;
  quiet hours; escalation (badge → message → push → call); done with evidence; failed
  verification; failure; stall.
- **E. Steering.** A follow-up in the conversation vs. inside the task; adding scope; switching
  model or harness (换谁来做 / Switch who does it, D89); handoff; pause or cancel; merging or
  splitting tasks; reopening days later; choosing what the partner thinks with and who does the
  tasks (E6, D89).
- **F. Memory and identity.** A rule created, edited, or forgotten; recalling something from
  weeks ago; Mem unavailable; switching or linking personas.
- **G. Safety.** An intent that needs policy (send, post, pay, call; a task's own push or PR is
  not gated, D132); a credential request;
  honesty about isolation.
- **H. Across devices.** Starting on the phone and continuing on the desktop; voice; acting
  on a lock-screen notification.
- **I. Results.** Where results live; sharing; user-made apps (later).

## 7. Motion

The zoom metaphor:
- A task chip in the conversation **grows** into its On hand card, which **unfolds** into the
  open task. Going back reverses the path.
- The living message **re-settles** in place when revised.
- A decision resolves with a soft **press-and-settle**.
- The face reacts to state: blinks while idle, glances aside while working, nods on done,
  raises its brows when it needs you.

Timing and springs come from the theme's `motion.personality`. The spec lives in
`design/ui.md`.

## 8. Open questions

- Results: where finished documents live is decided (D52 Q7: in 做好的 (Finished) on the control plane,
  with an optional "write it into a place"). The results view and the result anatomy are open
  (`flows/I-results.md`, IQ1–IQ11).
- Merging and splitting tasks: the cheap version is decided (D52 Q5); full semantics for the
  Log, leases, and branches stay open.
- Linking personas: scope (read-only? ask-only?) and how it is shown.
