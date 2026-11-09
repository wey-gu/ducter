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
| attention states | 等你 / Needs you · 在做 / Working · 在等 / Waiting · 做完了 / Done · 没成 / Didn't work · 放下了 / Dropped | `done?` shows as "做完了 · 在检查 / Done · checking" only while a check runs, else as Done (D68); `queued` shows as "还没开始 / Not started yet" |
| decision actions | **好 / Go** · **先等等 / Hold** · **回复… / Reply…** · **看细节 / Details** | The Go button may name the action: en says the action alone in sentence case ("Rebase"), zh keeps 好 in front ("好，rebase") (D73). An ask's small heading is the asking task's title; the count is said once, "2 件等你 / 2 need you" |
| Project | **项目 / Project**; no project = **其他 / Other** | An editable grouping label |
| Place | **在哪儿做 / Where** | Where a task works |
| Device (machine, runner) | **设备 / Devices** | |
| harness (Claude Code, Codex, pi, DeepSeek Harness, …) | each by its own product name; as a category **AI agent / AI agent** (D88) | The AI tools Ducter hands work to. Not "coding agent": people use them for much more than code |
| Routine | **例行 / Routine**; the shelf **例行 / Routines**; a run says **来自例行：{name} / From the routine: {name}**; **暂停 / Pause** · **接着来 / Resume**; paused: "停着：连着 3 次没成 / Paused: 3 runs in a row didn't work" · "停着：连着 3 次你没看 / Paused: 3 reports unread" · "停着：到期了，等你说还要不要 / Paused: up for review"; the review card "还要吗？/ Keep this?" with **留着 / Keep it**; the proposal card's rows **什么时候 / When** · **做什么 / Does** · **怎么告诉你 / Reports** · **能动什么 / Can touch** · **花多少 / Cost** ("每次用一点你的 AI 额度 / A little of your AI allowance each time") · **到期 / Review**, Go **好，开始 / Go: Start** | Recurring or triggered work (D114, D115). A time routine shows its next date on a clay tear-off calendar, its cadence in words |
| Waiter | named as awaited: **等 {what} / Waiting until {what}** ("等 PR #1592 通过", "等域名续费的邮件"), never as if done; its deadline **最多等到 {time} / Until {time}**; **不等了 / Stop waiting** · **现在看一眼 / Look now**; in Details only, **怎么判断的 / How it checks** | D112, D115. How often it looks, the command and whether a model judges are never on a card, the head, a proposal card or the conversation |
| `until` loop | "一直…直到… / Keep … until …" on the task; each try **第 n 次 / Try n**; **最多 20 / up to 20**; **停下 / Stop** | D113 |
| Rule | **规则 / Rule**; the list **你的规则 / Your rules** · **不要这条 / Remove** · **跟 {name} 说一条规则… / Tell {name} a rule…** | A standing preference stated in words. Added only by saying it in the conversation; listed and removed on Partner (D89). After two switches the same way the partner asks once "以后…也用 X？ / Use X for … from now on?" |
| what the partner itself runs on (brain) | **它用什么想事情 / What it thinks with**; the socket **想事情用 / Thinks with** · **换一个 / Switch** · **挑一个放进去 / Pick one to put in** · "{name} 现在用 {agent} 想事情了 / {name} thinks with {agent} now" · **从你的下一句话开始用 / Takes over from your next message** · **换了以后，名字、记得的事和你们的对话都还在 / Switching keeps its name, what it remembers and your conversation** · models **最聪明 / Smartest** · **回得更快 / Faster replies** | D89. Never "brain", 脑子, "model settings" or "main AI" on screen. Only AI agents signed in on the Mac it lives on: "只能用 {name} 住的这台 Mac 上登录了的 AI agent" |
| who does the tasks (`fw_candidates`) | **谁来做事 / Who does the tasks** · the tray **这台 Mac 上的 AI agent / AI agents on this Mac** · **用它做事 / Use it for tasks** (per account, on by default) · **按用量付费 / Pay per use** | D89. Default line: "每件事 {name} 挑一个：最合适、额度最够的那个 / For each task {name} picks one: the best fit with the most limit left" |
| the partner's reserve | **其中 10% 给 {name} 留着 / 10% of it is kept for {name}**; when only it is left, "额度还剩 n% · 都是给 {name} 留着的 / n% left · all kept for {name}" | D89. One sentence says tasks and the partner share one limit: "做事和 {name} 想事情用的是同一份额度…" |
| `body_selected` (who does a task, and why) | **谁在做 / Who's doing it**: "{agent} 在做，按你的规则「…」/ {agent} is doing it, by your rule "…"" · "…，因为 {agent} 额度不多了 / …, because {agent}'s limit is low" · "…，是你换的 / …; you switched it"; switching **换谁来做 / Switch who does it** · **现在 / Now** · reasons **你的规则 / Your rule** · **最适合这件事 / Best fit for this** · **快，省额度 / Fast, uses less of the limit** · "额度不够了 · 剩下的给 {name} 留着 / Not enough limit · the rest is kept for {name}" · **你关了「用它做事」/ Use it for tasks is off** · the button is the handoff's **换到 X 接着做 / Continue on X** | D89, D90. The conversation's task line ends with who (and why when it isn't the plain pick); the opened task's head says who in its meta line; the reason is a sentence in Details |
| device states | **醒着 / Awake · 睡着了 / Asleep · 连不上 / Can't reach** · wake = **叫醒 / Wake** | Never "broken" or "offline" wording for sleep |
| quota | **额度 / limit** ("额度还剩 80% / 80% of the limit left") | One per AI account, shared across its devices |
| screen place controls | **画面 / Screen** tab · **接手 / Take over** · **还给它 / Give it back** | |
| loop iteration | **第 n 次 / Try n** | |
| checkpoint | **保存了进度 · {time} / Progress saved · {time}**; in the dossier **保存的进度 / Saved progress** | Describes what happened; no noun to learn |
| handoff | **换到 X 接着做 / Continue on X** | Never "superseded" in UI |
| pause | **先停 / Pause** | Shown as a waiting reason |
| Recipe | **准备步骤 / Setup steps** | |
| non-git draft copy | **草稿副本 / Draft copy** | |
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
| the display setting (D104) | **对话里的细节 / Details in the conversation**: **收起 / Folded** · **展开 / Shown** | Per client, in Settings (the Mac) and the Settings sheet (the phone) |
| outcomes | **停下了 / Stopped** · **撤销 / Undo** · **再试一次 / Try again** · **告诉它怎么做… / Tell it what to do** · **检查没过 / Check didn't pass** | 告诉它怎么做… sits beside 再试一次 on a task that didn't work and opens the task's composer (D76) |
| a merge / draft PR whose result was lost with the connection | **不确定成没成，你看一眼 / Not sure it went through — check** · **再试一次 / Try again** | Only when the Log doesn't show it done after reconnecting. Never "failed" wording: it may have happened |
| a task the user opens themselves (D128) | **开一件事 / New task** (⌘N) · the card's rows **在哪儿做 / Where** · **谁来做 / Who does it** · **做什么 / What** · **不用特定的地方 / No particular place** · under What **原话会交给它 / It gets your words as they are** · **开始 / Start** · a pick "…，是你选的 / …; you picked it" · On hand's toggle **按状态 / By state** · **按项目 / By project** · a group's **在这儿开一件 / New task here** · tasks of no place **其他 / Other** · on the phone a **＋** on On hand opens it as a bottom sheet · the branch list **从哪个分支开始 / Start from which branch** (**默认 / default**) · **取消 / Cancel** · while it opens **在开… / Starting…** · in the opened task the words are under **你交代的 / What you asked for** · a refusal in one line under Start (**那台设备现在连不上。/ That device can't be reached right now.** · **这个文件夹不是 git 仓库。/ That folder isn't a git repository.** · **现在没有 AI agent 能接这件事。/ No AI agent can take this right now.** · **没开成：… / It didn't start: …**) · the Changes header **改动 · 3 个文件 +42 −7 / Changes · 3 files +42 −7** | The power path, never required. Nothing is said in the conversation when it opens; the partner reports its result like any task. CLI: `ducter task`, which prints 开了：「…」/ Opened: "…" |
| quiet hours | **免打扰 / Quiet hours** ("免打扰 23:00–08:00") | The word the user's phone already uses |
| remote access ability | **在哪儿都能用 / Reach from anywhere** | Done: "MacBook 现在在哪儿都能用了" |
| pairing a client with a server (D54) | **连接到你的 Ducter / Connect to your Ducter** · **地址 / Address** · **连接码 / Code** · **连上 / Connect** · **断开 / Disconnect** · again: **再连一次 / Connect it again** | The desktop card, the phone and the CLI (`ducter pair`, `ducter devices disconnect`). Sentences say "这个码只能用一次 / The code works once". Never "token", "配对 / pair", "授权 / authorize" or "绑定" in UI |
| a device that runs tasks for a main elsewhere (worker) | (a **设备 / Device**; its card: its own name, renamable (**改名字 / Rename**), and **另一台电脑 · 替 Ducter 做事 / Another computer · does tasks for Ducter**, the second half replaced by its state when something is wrong (睡着了 · 醒来就接着做, 连不上 · {time}); in the CLI "让这台电脑替另一个 Ducter 做事 / make this computer do tasks for another Ducter"; the main is "Ducter 住的那台电脑 / the computer Ducter lives on") | D84. Shown with the device states (醒着 / Awake …). "Worker" stays internal to UI copy; the CLI verb is `ducter worker <address> --code <code>` (its reader is a developer, D83). Never a name containing "ducter" plus a role (reads as Ducter's own background program) |
| does tasks for Ducter | **替 Ducter 做事 / does tasks for Ducter** | What another computer is for (D84); Ducter = the partner's name |
| the code card while it waits | **等它连上… / Waiting for it to connect…** | On the code card and in `ducter pair` (D83) |
| another computer while tasks run on it | **另一台电脑 · 在做 1 件事 / Another computer · working on 1 task** (n: 在做 n 件事 / working on n tasks); under its island alone: **在做 1 件事 / Working on 1 task** | D81, D84: the state replaces the second half |
| a phone (or an app window elsewhere) that reaches Ducter | its own name, and **在哪儿都能找到 Ducter / Reaches Ducter from anywhere**; not seen lately: **最后在线 {time} / Last seen {time}** | D81. A phone never runs tasks; it has no bridge parcels |
| an AI account on several devices | **N 台设备共用 / shared by N devices**, after its state ("已登录 · 2 台设备共用") | D81, D82: N counts the devices where that AI agent is signed in |
| what the chosen device can do | **{device} 会：上网 · 在哪儿都能用 / {device} can: Browse the web · Reach from anywhere** | The device card beside the stage (D81) |
| where browser tasks run (an AI agent's own browser, D130) | **在你的 Chrome 里 / In your Chrome** (上网 tile and detail); status line **在你的 Chrome 里看 {host} / Looking at {host} in your Chrome**; the move to Ducter's browser: **Claude in Chrome isn't connected; switched to Ducter's own browser** (system line) | Literal: it is the user's own Chrome, signed in as them. Ducter's own browser stays **Ducter 的浏览器 / Ducter's own browser** |
| server keeps running (systemd service) | **一直开着 / Stays on** (doctor row) | |
| capability (browser, computer use, phone, calls, remote access) | **no noun on screen** (D66). Headings: **你的设备，和它们会做的事 / Your devices and what they can do** · **还能装上的 / You can also add** | Equip = **装上 / Add to <device>**; remove = **取下 / Remove**; result = "MacBook 现在会上网了 / MacBook can now browse the web"; device detail "MacBook 会：… / can: …". Item names are ability phrases (上网, 用电脑, 在哪儿都能用). Never 学会/教会/赋予/授权 (they read as ordering a subordinate). Never 装备/Gear (reads as armour; rhymes with 设备). Claude Code skills stay **技能 / Skills** on their own page, never on the rack |
| the partner saved something to long-term memory (Mem) | **记下了 · <title> / Noted · <title>** | Inside the Details of the reply it belongs to, with 忘掉 / Forget (D104); all of them under 伙伴 / Partner › 记得什么. Never a card, never a notification. Never "已存入记忆 / saved to memory" in the partner's words; recall is never shown at all |
| a request from another agent through Nowledge Bridge (`bridge_msg` in) | **<X> 发来请求 · <gist> / Request from <X> · <gist>** (pending user OK, J-Q5) | One quiet line, then the partner's own Go/Hold question if it would act. Never 交接 / hand-off (that is a task changing body). Never "Bridge", "mailbox", "contact", "Space" in UI |
| the partner messaging an agent the user named (`bridge_send` card) | **发给 <X>？「<gist>」· 发送 / Send this to <X>? "<gist>" · Send** (D105); after: **已发给 <X> / Sent to <X>**; its answer: **<X> 回复了 / <X> replied** (quiet lines pending user OK, J-Q5) | Default wait, can't be undone. Sent by Ducter's code on the tap, once (D106) |
| another agent that belongs to the user (same member as the persona's owner) | **你的 <agent> / your <agent>** (D108) | A teammate's agent: **<agent> (<name>)**. The user is never named to the user |
| the claim Ducter sends when a task opens for another agent's request | **接了：「<title>」。做完把结果回你。 / Taken: "<title>". I'll send you the result when it's done.** (D109) | In the requester's language; the title quoted. The other agent sees it, not the user |
| the outcome a teammate's agent gets when the partner didn't reply itself | **「<title>」：做完了 / 没做成** / **"<title>": done / not done** (D107) | Until a sharing rule exists |
| follow-through on a confirmed message with no answer (S3) | **你的 <agent> 还没回你 <n> 小时前问的「…」，它可能停了。回了我马上告诉你。 / Your <agent> hasn't answered what you asked <n> hours ago ("…"); it may have stopped. I'll tell you as soon as it does.** Read but unanswered: **…看过你 <n> 小时前问的「…」，还没回。… / …read what you asked … but hasn't answered yet. …** (D110) | One line, once, ≥ 2 h, while the user is around, never in quiet hours. Never "reminded" (提醒): nothing wakes the other side |
| an outgoing message that couldn't be confirmed, or was refused | **没能确认<what>是否到了 <X> 那里。我没有重发；需要的话再跟我说一次。 / I couldn't confirm <what> reached <X>. I didn't resend it; ask me again if you need it.**; refused: **<what>没能发给 <X>：被拒绝了。 / I couldn't send <what> to <X>: it was refused.** (D106) | <what> = 你让我发的消息 / the message you asked me to send · 「接了」的回复 / the reply saying I took it · 任务的结果 / the task's result · 回复 / the reply |
| the partner answered that agent | **已回复 <X> / Replied to <X>** (pending user OK) | "Replied" is not "done"; nothing promises the other side has seen it |
| Intent | (shown as a decision or a policy line: "要推送到 ducter/fix-ci / Will push to …") | |
| a task message to the partner (report) | **告诉 {name} / Told {name}** (· 要你定 · 做完了 · 在等 · 没成); freshness "{time}更新 / updated {time}" | Never 汇报 or 交回给 (reporting up) |
| task brief · transcript | **{name} 交代的 / What {name} asked for** · **过程 / What it did** | Each step one line, a verb and a summary (D127): **思考 / Thinking** · **运行 / Ran** · **读取 / Read** · **编辑 / Edited** · **搜索 / Searched** · **浏览 / Browsed** ("在 Chrome 里打开 … / … in Chrome") · **操作 / Used** (the computer: "在 Chrome 里按 ⌘T / pressed ⌘T in Chrome") · **等待 / Waited** · **交给 / Handed off** · **出错 / Error**; **前面还有 n 条 / n more above ›**. Never a tool's name, never "tool call" |
| who and how long, over a task's composer | **{agent} · {model}** · **在做 · 12:34** · **用了 {duration} / took {duration}** | D127 |
| an ask's default on a card | **{time}后按默认：{default} / In {time}: {default}** beside a small timer; the Go button a short verb, else **好 / Go** | D127 |
| an opened task's sections | **改动 / Changes** (**n 个文件 / n files**) · **细节 / Details** (谁在做 / Who's doing it · 在哪儿做 / Where · 保存的进度 / Saved progress · 发出去的 / Sent out · 用量 / Usage, said as **用了大约 4.5 万字的额度 / About 45k words' worth of the limit** (D121; the word token never shows in UI)) · **{time}开始的 / started {time}** | D74 |
| harness turn ended | not shown (D127; the bar over the composer says where it stands) | Never "turn", "step", 这一轮, 这一步 |
| a message to a task | **它正在做，已经告诉它了 / Told it while it works** · **它收到了，接着做 / Got it; it's on it** · **等它忙完手上的就告诉它 / It'll get this once it finishes what it's doing** · **没送到 / Didn't get through** | |
| the result anatomy (D60) | **怎么知道的 / How I know** (also the evidence heading everywhere; no 证据) · **发出去的 / Sent out** (empty: 没有 / Nothing) · **这次没包括 / Left out** · **合进 {branch} / Merge into {branch}** · **开草稿 PR / Open draft PR** · **改了 n 个文件 / n files changed ›** (the changes link: commits and changed files as one item; **看改动 / See changes** when nothing counts them, D124) · a reproduction shows a muted ×, never ✓ · **草稿 PR 没开成：{why} / The draft PR didn't open: {why}** · **这个仓库没有能推送的远端，开不了 PR，可以直接合进来。 / This repo has no remote to push to, so there's no PR to open. You can merge it instead.** | Under a result: one quiet line of proof, a ↗ line only when something went out, then the actions; See changes is not repeated (D73) |
| effects seen but not gated | **它的记录里看到的 / Seen in its log** | |
| the day's record | **今天发出去的 / Sent out today** | |
| place `none` | **不用特定的地方 / Nowhere in particular** | |
| devices, by the user's own words | **这台 Mac / This Mac** · **这台手机 / This phone** · **另一台电脑 / another computer** | Never 机器 / machine in UI copy |
| presence | **{name} 在呢 / is here** · **在做事 / is working** · **有事找你 / needs you** · **刚做完一件事 / just finished something** · **还没醒 / isn't up yet** | Never 待命 |
| stopping Ducter on a Mac (D56) | **让 Ducter 歇着 / Stop Ducter** (menu) · **{name} 歇着了 / {name} is resting** · **叫醒 {name} / Wake {name}** | Closing the window or ⌘Q never stops Ducter; this is the one explicit stop. 叫醒 is the same verb as for a device, on purpose |
| updating the app (D72) | **检查更新… / Check for Updates…** · **有新版本 {v} · 重启时更新 / Update {v} ready · restart to finish** · **有新版本 {v} · 去下载 / Version {v} is out · Download** · **现在重启 / Restart Now** · **退出时自动更新 / Update automatically when quitting** | One quiet line in the app menu and Settings; never a pop-up the person didn't ask for |
| removing Ducter (D72) | **彻底移除 Ducter / Remove Ducter** · **会删掉 / Removes** · **会留着 / Keeps** · **只停下并移除后台项 / Only stop and remove the background item** · **全部移除 / Remove everything** · **任务的工作副本 / tasks' working copies** (the worktrees) | The page names each path; never "uninstall" in copy. 后台项 matches macOS's own "后台项目 / background items" |
| help (D72) | **Ducter 使用指南 / Ducter docs** · **报告问题… / Report a problem…** · **也带上最近的对话 / Include the last conversation** (off by default) | Nothing is uploaded; the person attaches the .zip themselves |
| the partner's page (D71) | **伙伴 / Partner** (nav, ⌘4; also the partner's own face and name in the conversation's bar) · **改名字 / Rename** · faces **在呢 / Here · 在做事 / Working · 有事找你 / Needs you · 刚做完 / Just done · 歇着了 / Resting** · **住在{device} 上 / Lives on {device}** | A character sheet, not a form. Never "profile", "persona", "agent settings" |
| how the partner talks | **怎么说话 / How it talks**: **跟着我 / Follow me** · 中文 · English | Follow me = the language of the user's message |
| notifications and the default wait | **什么时候找你 / When it comes to you**: **通知 / Notifications** · **免打扰 / Quiet hours** ({start} 到 {end} / to) · **你没回的时候 / If you don't answer** · "等多久再按默认做 / How long before it goes with the default" | Only reversible decisions wait; irreversible ones always wait for the user |
| a connection (the user's OpenConnector or another MCP server, or the accounts in their oo, D122) | **它能看的账号 / Accounts it can read** (Partner, for now) · **加一个 / Add one** · where: **OOMOL 托管 / Hosted by OOMOL** · **自己部署的 / Self-hosted** · **其他服务 / Something else** · **地址 / Address** · **钥匙 / Key** · **怎么连 / How to connect** (a fold: the setup steps, the only place OpenConnector, its Access page, Create Token and MCP are named) · **检查并加上 / Check and add** · **移除 / Remove** · **用你在 oo 里设好的那一套 / Use the one you set up in oo** (an oo with a self-hosted OpenConnector and no sign-in) · with oo signed in (D122), the default offer: **你在 oo 里的账号 / Your accounts in oo** · **用这些账号 / Use these accounts** (正在加上… / Adding…) · **用地址和钥匙加一个 / Add one with an address and key** (the form, stepped back) · the added row **oo 里的账号 / Accounts in oo** · **经过 oo / Through oo** · result "Ducter 现在能看 {name} 里的账号了 / Ducter can now read the accounts in {name}" | 钥匙 / Key: OpenConnector calls it a token (its Access page's Create Token); the UI names that button and otherwise says key, because "token" is retired in UI copy (D66). Decided 2026-11-09 (the author, "按建议") Never "connector", 授权, 接入. 连上 / Connect stays for devices. Each one says where mail passes. The card's default surface says what it does for the person ("让 Ducter 帮你看邮件、日历和 GitHub… / Let Ducter read your mail, calendar and GitHub…"); product and protocol names stay behind 怎么连 / How to connect |
| memory, as the user controls it | **记得什么 / What it remembers** · **记住事情 / Remember things** (switch) · **最近记下的 / Noted lately** · **忘掉 / Forget** ("忘掉了：{title} / Forgotten: {title}"; when Mem can't: "这里不再显示…；Nowledge Mem 里那条还在 / … is hidden here; it's still in Nowledge Mem") · **装上 Nowledge Mem / Get Nowledge Mem** | Never "delete memory", "knowledge base", "记忆库" |
| what runs without asking | **自己就做，还是先问你 / On its own, or asks you first** · **自己就做 / On its own** · **先问你 / Asks you first** | Read-only today; the items say the property (发给别人的 / reaches other people, 收不回的 / can't be taken back) |
| the app's own settings (D71) | **设置 / Settings** (⌘,; Settings… in the menus) · **外观 / Look** · **界面语言 / Language** (**跟着系统 / Follow the system**) · **关窗以后 / When you close the window** · **更新 / Updates** · **数据和记录 / Data and logs** (打开数据文件夹 · 打开记录 · **检查一遍 / Run checks** · 都好 / All good) · **关于 / About** | What the partner is like lives on Partner, not here |
| AI accounts on Devices | **登录 / Sign in** · **退出登录 / Sign out** · **装上 / Install** (an account card on this Mac) | The tool's own sign-in, in the browser; Ducter never sees the password |
| the first-wave harnesses (D85) | **Claude Code** · **Codex** · **pi** · **DeepSeek Harness**, each product's own name, the same in zh and en | Never "harness", "runtime" or "adapter" on screen. pi is written lower-case, as its makers write it |
| an account that runs on an API key (pi, DeepSeek Harness) | **需要一个 DeepSeek 密钥 / Needs a DeepSeek key** · **有 DeepSeek 密钥 / Has a DeepSeek key** · pi: **有能用的模型 / Has a model it can use** | The key is typed into a masked field and kept on this machine only (D85 proposal); never shown again, never in the conversation |
| adding a device | **连上手机或另一台电脑 / Connect a phone or computer** (opens the one-time code) | Same words as D54's Connect. One code for any device (D83); the card says both ways: **手机或 Ducter 应用 / On a phone or in the Ducter app** (scan, or open the address and type the code) and **另一台电脑 / Another computer** (run one command) |
| the menu bar extra | the clay partner in the macOS menu bar; its menu: **等你 · {n} / Needs you · {n}** or **没有要你定的事 / Nothing needs you**, each question with **好：{action} / Go: {action}** · **先等等 / Hold** · **回复… / Reply…**, then **打开 Ducter / Open Ducter** | |
| a sandboxed place | **no noun**: the property, **碰不到你的文件 / Can't touch your files** | 沙盒 retired (D66, GQ8) |
| Artifact | **做好的 / Finished**; the list **做好的东西 / Everything finished** | 成果 retired (report-speak) |

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
  cache, or matches a rule. The card says why.
- **Project:** inferred from the place (a repo's project) or from the conversation. It is
  created implicitly the first time and shown as a "new project" chip you can rename or undo.

**Controllable always:**
- **Projects:** rename one inline (every task carrying it follows), move a task to another
  project, or merge two projects.
- **Changing a task's device, base branch, or repo** is a handoff (principle 13). The old task
  becomes superseded. Adding a repo just extends the place.
- **开一件事 / New task** (D128): a quiet text button on On hand, or ⌘N, opens a three-row
  card: 在哪儿做 / Where (a repo, most recent first, or 不用特定的地方 / No particular place;
  the base branch in its chip, default the repo's default branch; the device inferred as
  today) · 谁来做 / Who does it (the best fit with its reason; picking another pins it for
  this task, "…，是你选的 / …; you picked it") · 做什么 / What ("原话会交给它 / It gets your
  words as they are"). Start opens the task with those words as its brief, unchanged, and
  opens it. The partner says nothing then and reports the result like any task. It is the
  power path, never required. From a terminal: `ducter task "<words>"`. Details:
  `design/new-task.md`.

**Repos and worktrees**

*Discovery and cloning*
- A runner discovers the checkouts on its device.
- A repo can be cloned onto another device using that device's own git login. Ducter asks
  once per repo.

*Worktrees*
- A task whose brief says it will **write** gets a worktree **at start**, in
  `~/.ducter/worktrees`. The agent names the branch `ducter/<slug>` on its first turn.
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
- Writes go to a **draft copy** and are applied with one Go at the end, unless you mark the
  folder trusted. Either way, writes stay reversible.

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
- **Attention is the person's.** On hand aggregates every persona, and each card carries its
  persona's face and color. Conversations stay separate.
- **Isolated by default.** A persona reads or asks another only after the user links them.
- **Recognizable at a glance:** its own face, accent color, and optionally theme.
- **Creating one is light:** a name plus one sentence. Mem's birth-draft flow does the rest.
- **Quota:** subscriptions belong to the user. The main-AI reserve is kept per subscription,
  shared by all personas' main turns.

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
- **G. Safety.** An intent that needs policy (push, send, pay, call); a credential request;
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
