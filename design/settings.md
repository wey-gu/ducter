# Settings, pane by pane (D296)

How each pane of Settings feels to the person in it, and the small pieces every pane shares. The
grid and its rows are D273's and D289's (`ui.md`, `settings_rows.go`, `set-grid.tsx`); the
words are the glossary's (`product-model.md`). 记忆 / Memory is D295's and 和你的其他 agent 通信 / Talk with
your other agents (short in the list: Agent 通信 / Agent messaging) is D332's (`bridge.md` "Simple, by who"); neither is covered here, except where D459 made them one hand with the rest and D470 gave Agent messaging the partner's voice (below).

## Who is here, and what they feel

Three people open Settings (AGENTS.md): **H** a heavy multi-agent developer, **C** a consumer
personal-AI user, **F** a fresh user who has never heard of a subagent.

| Pane | Who is here, mostly | Before | After | How it starts (first time, nothing to learn) |
|---|---|---|---|---|
| 伙伴 / Partner | H (which AI agent, which model, who does tasks); C renames it | "Is it on the smart one? Is it using up my limit?" | It is itself, on the model they chose, and they can see what is left in plain sentences | The partner's face and name at the top; one line where it lives and what it thinks with, as a phrase (住在这台 Mac 上，用 Claude Code 的 Opus 想事情) |
| 通知 / Notifications | C and F: "will it bother me at night?" | Unsure when it will interrupt | Quiet hours and the default wait are set, and the partner says in one line what that means | Notifications on, quiet hours 23:00–08:00 offered with one switch |
| 账号 / Accounts | C most (what it may read; whether it may call); F next | A wall of rows each saying the same green word | Calm: the place says how it reads, a row speaks only when it differs; flipping a switch gets one word back from the partner | The one tap (oo) or the add row; nothing read until they say yes |
| 聊天软件 / Chat apps | C (Telegram, Slack), H (Slack) | Connected, but to what? | "在 @bot 等你": it is waiting there, by name | One group per app, resting as its row with 设置 / Set up and its privacy line until pressed (D365); then its steps as rows; nothing connected until they paste a key |
| 密码和银行卡 / Passwords & cards (D336) | C booking travel | Unsure what it can see, and what "autofill" even keeps | Each saved thing is a row with its mark; what it can and cannot read said once | Its list line says what it is for and where it is kept (登录、付款、填地址时用，锁着存在你的电脑上); three add rows, one per kind; the uses section says none yet |
| 外观和声音 / Look and sound | Everyone, briefly | — | The preview smiles back at a choice (D150) | The preview stage and three groups |
| 在哪儿运行 / Where it runs | H (a server home), F once ("does closing the window stop it?") | Afraid closing the window loses work | This Mac (or hel) as the group's first row, small clay in the tile column, and one sentence that it keeps working | The row and its sentence; Rest, data and Remove further down, quiet |
| 更新和关于 / Updates and about | H checks versions; C reads Help | "Up to date · checked…" read as two facts | One phrase per computer (刚看过，已经是最新的) under a name that says what it is to the partner (Ducter 住在这儿); on a Mac home one check and one button for the app and the home (D337) | The About card; the versions card; help links |

## The flows walked

Each pane was walked at Mac 1280 and 900 and web 1400 and 390, zh and en, against the demo core
with the author's accounts laid over it (`.shots/d296/before`, `.shots/d296/after`):

- **First run / empty:** Passwords & cards' three add rows and its empty uses header; Chat apps with
  nothing connected (each app's steps); Accounts with only the offer.
- **Connected:** Accounts with OOMOL (eight services, two calendars), Tuwa connected and own
  number on a server home; Telegram linked.
- **Error:** a source unreachable (every row says 连不上 in the failed ink: a row that differs);
  Tuwa signed out (its first row says so, with 重新登录).
- **Destructive confirm:** 停用 OOMOL, 断开 Tuwa, 删除我的声音, Chat apps' disconnects: quiet
  until hovered, asking in place (D289), unchanged.
- **Long names:** accounts are one line and cut with an ellipsis on the phone; a state word at the
  right edge now appears only for the exceptions, so the account has the room.
- **Narrow:** at 900 the rows keep two edges; at 390 a row's control drops under its words
  (D273) and a group's first row keeps its state at the right edge.

## Shared pieces (D296)

| Piece | Mac | Web | Use |
|---|---|---|---|
| A row that goes elsewhere, with its tile | `tileLinkRow` (`settings_rows.go`) | the list rows of the phone's Settings | AI accounts → Devices (the agents' coins); Your devices and AI accounts (a clay laptop) |
| A switch alone at a row's right edge | `switchControl` in `tileRow` | `Switch` (`controls.tsx`, D295) | Use my voice; a service's 自己留意 |
| The partner's one word after a change | `say` / `saidLine` (`settings_rows.go`) | `say` / `Said` (`set-grid.tsx`) | Quiet hours, the default wait, a service's watch switch |
| A list of names of one kind | `listWords` (、 / , ) | `t("acct.sep")` | oo's accounts; your details |
| A thing never set up, resting until chosen (D337, D365) | `chatHeadWith` + `chatSetUp` (`chats.go`); the own number's group | `Resting` (`channels.tsx`); `own-phone.tsx` | Chat apps (Telegram, Slack, WeChat); calls from your own number |
| A choice of a few as a row, the choice at the right edge (D432) | `tileRow` with `choices` | `chat-row` with `Seg` | 等多久再按默认做, 每天最多, To-do sources' 新的来了 and 做完以后 |
| A pane still being read (D432) | `paneWait` | `Waiting` | Partner and Notifications (Mac), To-do sources, Chat apps (web), Passwords & cards |
| A line to copy (D432; one look D459) | `lendCopy` (kind `line`, `check`, `ask`) | `CopyLine` | Memory's and Agent messaging's missing tool |
| A pane's one switch (D459) | `headRow` with the switch, `footRow` for where it shows up | `GHead` with `Switch`, `GFoot` | Memory, Agent messaging |
| A live preview stage on the paper (D150, D445) | `lookPreview`, `notifyPreview` | `LookPreview`, `NotifyPreview` (`settings-delight.tsx`) | Look and sound / This phone, Notifications |
| A choice of many as one pill (D445) | `pill` + `listPanel` (`modelPill`, `timePill`) | `Select` | Replies in, Codex's models, quiet hours (Mac) |
| A group's note: under its heading, never under the card (D289, D365) | `group(…, note, …)` | `<p class="g-note">` after the heading | To-do sources' empty line; what your AI agents keep; the trust lists |
| The rail's chosen tab | the knob under the tabs, sliding (`railKnob`, `Nav.Across`) | — (the phone's list pushes, D290) | Every move between panes |
| A pane coming in | `paneEnter`: a short rise from the side the knob came from | the pushed page from the trailing side, the list back from the leading side (D290) | Every move between panes |

### The partner's word after a change

Only where the change has a consequence a person might not guess from the control itself, and
only once per change: quiet hours (**好，23:00 到 08:00 我不吵你，结束时一起告诉你。/ Got it: I'll
stay quiet from 23:00 to 08:00 and tell you everything after.**), quiet hours off (**好，有事随时找你。
/ Got it: I'll find you whenever something comes up.**), the default wait (**好，你没回的话，1 小时后我按
默认做。/ Got it: if you don't answer, I'll go with the default after 1 hour.**), a service's watch
switch (**好，Slack bot 我自己留意着。/ Got it: I'll keep an eye on Slack bot myself.** · **好，
Slack bot 你问起来我再看。/ Got it: I'll look at Slack bot only when you ask.**). It is a 12-point
clay pebble on the done ink that pops in on Bouncy's spring (web `--t-pop` on `--spring-soft`)
and the line in the soft ink rising 4 on Across's spring, under the group on the text edge; it
goes after 4 s. Reduced motion: it appears and goes without moving. Never a toast; never for a
choice whose control already says everything (the theme, the language).

### Per-service state on Accounts

A source's first row says how it reads (在留意 / Keeping an eye out, 你问起来才去看 / Reads only when
you ask, 已暂停 / Paused, or what went wrong). A service row says its own state only when it
differs from that: under 在留意, a row with its switch off says **你问起来才看 / Only when you ask**;
under 你问起来才去看, a row watched on its own says **自己留意着 / Watching**; **不看 / Not read** and
**连不上 / Can't reach** always speak, except when the source itself is down: then its first row says it
once with **再试一次** and its rows are quiet, their marks faded (D475). The switch says the rest.

## The rows other choices left behind (D307)

A choice made on a card (a limit card's hand-off, 别再看了 under the first words, 不再显示 in Past
tasks) or a thing that had only one door (a pasted key: the first run and an empty conversation)
also lives in Settings, so it can be seen and undone in one place:

| Where | Row | Same setting as |
|---|---|---|
| 伙伴 / Partner, in **再添一个 AI agent / Add another AI agent** (D322) | **贴一个 API 密钥 / Paste an API key**, its button opening D298's card in place (no title, no card in the card) | the first run's and the conversation's key card |
| 伙伴 / Partner | **额度用完的时候 / When a limit runs out**: **直接换别的 AI agent 接着做** and its one line | the switch under a task's limit card (D297) |
| 伙伴 / Partner | **你的 AI agent 留下的记录 / What your AI agents keep**: **读它们留下的记录 / Read what they keep** (D327: one switch for Past tasks and a look the person asked for; off forgets; D377: off at the home means no computer for tasks is asked either, each of which also keeps its own yes on its card), each hidden agent and each folder left out with **再显示** | 别再看了 / 还是看吧 (D298, D327), Past tasks' 不再显示 (D299), 这个文件夹别看了 (D327) |
| Devices, the home's card | **或者，贴一个 API 密钥 / Or paste an API key**, a flat row under the AI agents' tray | the same card |
| 这台手机 / This phone (web) | **浅色和深色 / Light and dark** | the Mac's row under Look (D302) |

Each change gets the partner's one word (D296) where it has a consequence the switch doesn't show:
the hand-off, the looking, an agent shown again. A key pasted in Settings is answered there only.

## 伙伴 / Partner, as one story (D322, 2026-11-17)

The author on v0.0.65's pane: "你仔细审视过整个 UX flow 视觉细节各方面么？" It was assembled from five
decisions (D89's socket and tray, D150's header, D296's lines, D307's key and hand-off rows), and
it read that way: the same "another AI would help" said three times in three shapes (the tray's dashed
未安装 coin, 谁来做事's one sentence with a button floating over empty space, the key card); a
sunken tray and a 128-pt coin breaking D289's grid; three stacked lines under the coin (用它默认的模型 /
**自动选的：只有 Codex 登录了** / 已登录), two of them saying nothing; the reassurance
**换了以后……都还在** shown when there was nothing to switch to; and no order a person could follow.

### Who comes, with which question

| Who | What they came to find out | What they feel before → after |
|---|---|---|
| **H** heavy developer | Which agent and model it thinks with; which agents get tasks and how it picks; whether a second agent or a key would keep overnight work going when a limit runs out | Hunting through art for facts → each answer is one row, in the order they'd ask |
| **C** consumer | "Is it on something good? Do I need to pay for more?" | A shop of coins they don't own → one row of what it uses, one place that says what another would give |
| **F** fresh user | "What is all this?" Usually arrives from 改名字 | Vocabulary (AI agent, 额度, 密钥) all at once → name, one line where it lives and what it thinks with; the rest only says what is true for them |

### The cases, and what the pane says in each

| Case | 想事情用 / What I think with | 做事的 / Who does the tasks | 再添一个 AI agent / Add another AI agent | 额度用完的时候 |
|---|---|---|---|---|
| **First run, none signed in** | One row: **还没有能想事情的 AI agent**, **在下面登录一个，或者贴一个 API 密钥。** | Not shown (nothing to say that the row above didn't) | Its note says what it unlocks (**…就能开始想事情、做事**); a row per agent to install or sign in, then the key | Not shown: no limit can run out |
| **One agent** (the author: Codex on a server) | The agent, its model (or **用它自己默认的模型**), its limit when it reports one; no Switch, no reassurance | One line on the paper: **现在每个任务都由 Codex 来做。** (its row would repeat the one above) | **有了第二个，Ducter 就能按事情挑；一个的额度用完了，另一个接着做。**; Claude Code **去装上** / **去登录**; the key | The switch, and **现在只有一个 AI agent 能做事：额度用完时，等它恢复再接着做。** |
| **Several agents** | The agent with **换一个** (the others listed in place, each **用它**), the model's choice with its one phrase, the reassurance as the group's last line | A row per signed-in agent (limit, **Ducter 想事情也用它** on the one it thinks with) with its **用它做事** switch; how it picks as the section's note; the rules; **打开任何一个任务，都能换别的 AI agent 接着做。** | **多一个，我挑的时候就多一个选择。** (D551) and the key | The switch |
| **On a server** | Same rows; the header says **住在 hel 上**, sign-in rows say **在 hel 上登录** | Same | The buttons go to Devices, where the server's card signs it in | Same |
| **A pay-per-use key only** | The agent the key runs (DeepSeek Harness) with **用你贴的 API 密钥，按用量付费** | One line, as with one agent | The subscription agents, and the key row again (a second key) | As with one agent |
| **A free key** (D449: OpenRouter's free models, a Gemini key) | pi with **OpenRouter 的免费额度，今天还剩约 12 次** (Gemini without a cap said: **Gemini 的免费额度，每天有上限，用完了到它的时间就恢复**) and **结果不再让另一个 AI 复查，额度先留给你自己的事**, in place of **按用量付费**; spent: **OpenRouter 的免费额度今天用完了，明天 8:00 恢复；想不等的话，充 $10 就能多很多。这期间发来的消息到时按顺序回** | pi's row **用免费额度，和伙伴共用** (with two or more agents) | As with a key | As with one agent |
| **Its own agent held** (D435: out of credit, too busy, or failing) | Another answers: that agent, its first line **Claude Code 的额度用完了，这会儿先用它，20:53 换回去** (D150's **你选的…现在用不了** not said on top); none: the held agent with **额度用完了，20:53 恢复。别的 AI 也接不上，这期间发来的消息到时按顺序回** in place of its limit line. The header: **这会儿先用 Codex 想事情** / **20:53 接着回你** | Unchanged (the one answering is marked **Ducter 想事情也用它**) | Unchanged | Unchanged (D297 is about tasks) |

### The order, and why

1. **The partner** (the pane's header, on the paper like every pane's: the clay partner at 64, the
   name, **住在 {home} 上，用 {agent} 想事情**). Its art lives here only.
2. **想事情用** — what it is (the question every user has first).
3. **做事的** — who does the work, and how it chooses, in one sentence; per-task override last.
4. **再添一个 AI agent** — the one place that answers "should I add another, and what do I get":
   signing in an agent and pasting a key are the same move, so they are one group, said once.
5. **额度用完的时候** — only meaningful once something does tasks.
6. Then how it talks, what your agents keep, and the trust lists (unchanged).

Rules: coins at the 40 tile size (D289), no sunken panels or art inside groups; a line that says
nothing (已登录 on a signed-in agent, 自动选的 when there was no choice) is not shown; the
reassurance and any control appear only where a change is possible; a change is answered once in
the partner's voice under its group (D296: **好，从你的下一句话开始，我用 Codex 想事情。**, **好，挑谁
做事的时候我会算上 Codex。** / **好，Codex 先不接新的事了。**), never a floating toast. The tray, the socket
and the token's flight stay where they belong, on Devices (D89's game moment moves there whole).

Shots: `.shots/d322/before`, `.shots/d322/after` (Mac 1280 and 900, web 1400 and 390, zh and en, light
and dark, each of the five cases).

## The walk of 0.0.67 (research/118, D330)

Every pane walked in the real Mac app (cua-driver, scratch bundle id and HOME) and the web at 1400 and
390, zh and en, light and dark, as each of the three users (`.shots/settings-0067`). What changed:

- The web's **这台手机 / This phone** in a browser on a computer is **这台电脑 / This computer**, with
  the clay laptop (D330 (1)); the phone and iPad keep theirs.
- **回你用的语言 / Replies in** on the web is one pop-up at the row's right edge, as on the Mac, not
  fourteen rows.
- The Settings list's hero says what the partner thinks with only when it can (it said Claude Code with
  none signed in); the partner's face is no longer repeated in the Partner page's title on the web.
- With none ready, the group is **添一个 AI agent / Add an AI agent** (D330 (2)).
- Accounts: the Tuwa row is **用 Tuwa 打 / Call through Tuwa** under 打电话 / Phone calls (the section's
  name was said twice), with its foot line on the Mac too; nothing yet is said on the add row on the
  Mac, as on the web; the own-number foot is one sentence pair with no stray space; the looked time says
  what it is (**14:07 找的 / at 14:07**).
- The web's version line is one phrase as on the Mac (**刚看过，已经是最新的**); the night-update note
  says **一台一台地更新 / one computer at a time** on both (the web said "in the same order", a phrase from
  the update-all card); the Mac's versions note sits under its title like every group's.
- 要不要先问's note and Passwords & cards' 你的资料 note sit under their headings on the web, as on the Mac.
- **不用问我的 / Without asking (D413)** sits under 要不要先问 on the Partner page once the person has
  said one: each row says what (**评审写完直接发到 GitHub**) and their words, the owners only when it is
  bounded (D424), with **收回 / Take back**; the word after it is said under the group. Nothing shows
  before the first one; until then 要不要先问's note says how one is made (**评审想直接发，跟它说一声就行。**, D424).
  D499: a task's own steps can be rows too (**重跑 PR 的检查不用先问**, **在它的 PR 下留言不用先问**,
  **推送它自己的分支不用先问**), bounded **在 {owners}** or **只在「{task}」里** (kept for one task, listed
  while that task is open); the word after a take back is **收回了：以后这类先问你。**
- The records switch speaks of the partner as 它 / it, like every Settings line; Passwords & cards' kept line
  says 解锁用的密钥在 Mac 的钥匙串里 (密钥 alone read as the API keys right above it).

## Follow-up on 0.0.68 (D337)

research/118's three open items, closed (`.shots/settings-0068`: Mac test renderer at 1280, web at 390,
zh light, demo cores on fresh data folders):

- Accounts: **用你自己的号码打 / Call from your own number** rests as one row (its tile, one line of why,
  **设置 / Set up**) until the person presses Set up or has started it (a phone plugged in, the
  live-voice key, a test call); what the home finds by itself is not a start. Both clients share the
  rule (`ownStarted`).
- Updates and about on a Mac home says one check, the latest of the app's feed and the home's, with
  one **检查更新** that reads both; this Mac's versions row keeps only an update's news. The web
  already had one.
- Every demo core starts from `apps/web/demo-core.ts`: pretend `nmem`, Mem plugin check, speakers,
  adb, agent sessions and computer name, so no shot shows this machine.

## 待办来源 / To-do sources (D341)

A new pane after 账号 / Accounts, for the developer with issues and the consumer with an Obsidian vault;
the fresh user sees what it is and nothing happens until something is added. Each source is one group
(its own mark, whose or which folder, counts apart), two segments (新的来了, 做完以后), the standing line,
a quiet 移除 that asks in place; then 还能加上 (the home's gh, the vaults Obsidian lists there, a folder by
path, Jira coming soon). Flows and words: `task-sources.md` §6.

## The pass of 0.0.79 (research/135, D365)

Every pane scored (hierarchy, alignment, contrast, states, words, flow, delight) on the Mac's test
renderer and the web, both widths, zh and en, light and dark, the three users (`.shots/settings-pass`).
The two weakest, and what changed:

- **聊天软件 / Chat apps** (21/35): every app never connected showed its whole setup. Each now rests as
  its first row with **设置 / Set up** and its privacy line; the steps open in place. A refused key or a
  connect on its way keeps them open. `docs/chat-apps.md` says **Set up** first.
- **待办来源 / To-do sources** (22/35): with nothing added the add group says
  **还没有加上的。在下面挑一个。** under its heading (no card holding one line); the web's add rows are
  rows at 15/700 and the vault path is the shared add row, as on the Mac; who owns a to-do sits under
  the lede on both.
- Smaller, one each: Where it runs has no group title repeating the page's and **加一台做事的电脑** has its
  clay (a server) on the shared text edge; the records note sits under its heading; the web's trust lists
  carry the Mac's drawn check and ask bubble; the web's 这台电脑 says what each choice does; the web's
  night-update line is its switch's line; 「今天有什么安排」 in 「」.

Left then, done in the second pass (D374): the versions row, the faded marks, 按住说话的键's line.

## The second pass (D374)

- **A faded mark keeps a contrast floor.** "Not set up" (or down, or coming soon) takes the colour
  away, never the shape, and never by transparency: a drawn mark is its shape in the muted ink with its
  white holes the tile's ground; a picture is grey, its tone times the theme's `Faded` token, so its
  middle keeps 3:1 on the card in both themes (`theme/faded_test.go`). The tile keeps its clay. One
  token on each platform (`Tokens.Faded`, `--faded-art`, `--faded-ink`); every faded tile uses it.
- **Updates and about's versions card is rows** (the shared `stateRow`): each computer under a
  hairline, name, line and its one state on the left; its version and the home's **检查更新** at the
  right end. The night switch is a row under its own hairline. The web's version line is a row the same
  way, titled **各台电脑上的 Ducter**.
- **按住说话的键** says what the key does (**Ducter 在最前面时，按住它说话，松开就放进输入框。**); Fn adds
  the dictation line; 不用键 points at the microphone.

## The third pass: the person's real counts (D399)

Every pane walked with the author's own shape, read off his home (nine devices, seven accounts, 557
to-dos, Codex's six models, two chat apps linked, two cards, three sign-ins, two keys, long names), on
the Mac at 1000 and 1400 and the web at 1400 and 390, zh and en, light and dark (`research/163`,
`.shots/settings-pass3`). `apps/web/demo-settings-real.ts` is that shape on fakes; the Mac replays the
frames it sent in `TestSettingsRealShapeFits`, which fails on a text off the window, squeezed, or
drawn over another. The grammar it settled, for every pane:

- **What is true of the whole pane is one small line under its lede**, never a paragraph under the last
  card: who owns a to-do, where saved things are kept, what reaches a chat app.
- **A row speaks only when it differs**: a saved thing never used says nothing; a computer as current as
  the home says nothing in the versions card (the home's row says it once).
- **A destructive action asks in place on every client** (the web's chat-app 断开 now does).
- A line names the person's own setting, not the default's rule (automatic updates in **23:00 到 08:00**).

## The fourth pass: flows, and the phone (D404)

Each pane walked as flows, not pages: connect, the state in between, connected, disconnect, a wrong
input, a retry, on the web at 1400 and 390 (the words read at +80 ms, +600 ms and +2.5 s after every
tap) and the iPhone Simulator's Safari (`research/165`, `.shots/settings-pass4`, three flows recorded:
a chat app disconnected and set up again, a card added on the phone, the partner renamed). The rules it
settled, for every pane:

- **Every tap is answered.** Either the state changes in words the person reads at once, or the partner
  says its one line where the consequence isn't shown: a source stopped, a chat app disconnected, a
  retry that met the same lack. A retry never just repeats the same paragraph.
- **Warmth where the moment earns it, once.** A chat app becoming linked (**连上了。以后在 Telegram 里找我也行。**)
  and a new name (**好，以后我就叫小满。**) get the said line with the pebble's pop; on the change only,
  never on opening the page. Nothing else is added: no confetti, no new art.
- **A field takes what the phone's keyboard can type.** A card's expiry reads 0829 as 08/29; an add form's
  first field takes focus; a rename selects the old name.
- **The home's own words are translated, not shown raw**; a service's own words still follow its line.
- **On a touch screen every control is 44 pt**, by size or by an invisible margin, the drawn size kept;
  **a bottom sheet stands on the iOS keyboard** (`keyboard.ts`, `--kb`).

The partner's word after a change (above) now also covers: a source stopped
(**好，OOMOL 停了：它连着的账号我都不看了。想再用，重新连上就好。**), a chat app disconnected
(**好，Telegram 断开了。你们的对话还在这里。**), linked (**连上了。以后在 Telegram 里找我也行。**), and a new name.

## Pass 4 follow-up: the real Mac app (D406)

The Mac app built from source, run against demo cores on their own ports and data folders
(`demo-settings-real.ts`, `demo-bridge.ts` failed, `demo-apps.ts`, `demo-handover.ts`), driven in the
background with cua-driver at its own 1280 × 860 window, light and dark, zh and en (`.shots/mac-real-walk`).
The test renderer had passed every one of these flows; what only the real window showed:

| Flow | Seen in the real window | Now |
|---|---|---|
| Accounts, a watch switch on the fourth of seven rows | the partner's line said under the group's last line, ~400 pt below the fold, gone after 4 s; two switches named **日历, 自己留意** alike | said under the row that moved, naming app and account; the switch's name too |
| Web, every said line (seen beside the Mac's) | no style at all: the body's ink, flush to the card edge, no pebble | the Mac's pebble and soft ink |
| Passwords & cards, add a key | Save with the variable name empty did nothing (its placeholder **DO_TOKEN** reads like a value) | **「变量名」还没填好。** under the form |
| Agent messaging, 改由这台收 → failed | connecting hid the page from the rail: the window jumped to Partner and the failure was never said | the page stays once opened; **没连上：…** with **再试一次** |
| Memory, 再试一次 then Agent messaging | **刚又试了一次** followed to the other page minutes later | only on the page it was tried on |
| On hand, no task and 571 to-dos sorted | **手头没事** while the partner said "都放在手头的事里了": the board asked for the to-dos only once it had a task | the pile, its groups and the hand-over sheet |
| ⌘K, a small app | a pencil mark | the small window mark its card and Made for you use |
| Accounts with no source | **让 Ducter 帮你看…** under a page that says **小满能看的…** | the partner's name |
| Add a computer, a kind chosen | title and back row the same words (pass 4's leftover) | titled by the kind: **加一台 Linux 服务器** |

Same in both (no change): rename (old name replaced on typing, **好，以后我就叫小满。**), Codex's six models
and the switch line, Telegram disconnect asks in place then says its line, a wrong bot key clears the
field with **这串密钥不对，再拷贝一次试试。** (as the web), a card typed 0829 saves as 08/29, quiet hours by
the arrow keys with **好，22:00 到 08:00 我不吵你…**, the language switch in place, dark mode on every
page walked, the small app's window and its ask answered both in the app and in the conversation,
⌘K by keyboard, the hand-over sheet words first with the subject's 117 found.

Not changed, noted: a pile's partner sentence and the demo's repeated issue titles are fixture data.
The walk's other leftovers are D408 (below).

### D408: what the walk left

- **Read as words, drawn whole.** The views draw every text through `uiText` (`views/type.go`): a text
  holding the word joiners `keepWords` and `keepTokens` put in for line breaking keeps them on screen
  and gives assistive technology its words without them, so 「对话」 is read as a word, not spelled.
  Markdown (the partner's replies, a task's report) is drawn and read by MyGo's own view, which has no
  hook for its accessible text, so it gets the Chinese–Latin gap without the joiners (`mdSpace`): a
  short token there (`ducter/fix-ci`) may wrap at its slash or hyphen. The tray's line has none either.
  `TestNoJoinersInAccessibleText` walks every place and settings page in zh and en against the mock
  home; `TestViewsDrawTextThroughUIText` keeps `ui.Text` out of the views.
- **An expiry shaped as typed, on the Mac too.** 0829 and 829 read 08/29 as the last number goes in,
  the caret after it (the web's `shapeExp`, which now also takes 829). 129 waits for a fourth number
  (1/29 or 12/9…); Save still reads it as 1/29.
- **Doubled keys were the driver's.** The fields take a key once: the key down, its text, the key up
  (`TestKeysTypeOnceInFields`, an input method's composition too). cua-driver's `type_text` sets the
  field's selected text over accessibility first; MyGo applies that on its next frame, so the value the
  driver reads back at once is still the old one, the driver takes the write as failed and types the
  same text again with CGEvents (inferred from the driver's documented read-back and MyGo's
  `setAccessibilitySelectedText:` posting an event; not run against the driver). `set_value` doesn't
  double. A real keyboard was not tried.
- **The window doesn't change page by itself.** The 关于 jump reproduced in a test: the settings rail
  dropped 和你的其他 agent 通信 when a frame no longer called for it, every tab under it moved up one row,
  and a click meant for 在哪儿运行 landed on 关于. The rail now keeps a tab it listed for the session. A
  restart into an update that fails opens Updates and about only after the person's own Restart to
  update here (within two minutes); one asked from the phone or by an Update all plan leaves the page
  as it is. `TestFramesNeverMoveThePage` lets the mock home's frames arrive on every place and settings
  page and checks the page stays.
- **The settings demo links a chat app.** `demo-settings-real.ts`'s Telegram stub sends `/start` with
  each new code 2.5 s after it is shown, so **连上了。以后在 Telegram 里找我也行。** can be reached
  (checked over the demo's socket: forget, connect, code, linked).

## Your devices, a card trimmed (D420)

The author on 0.1.0 with his worker Mac chosen read three lines about Nowledge Mem saying one thing,
**帮 Ducter 做事** twice, and two outline icons beside a negative sentence. The same grammar as the
passes above, on the device card:

- **One line per fact.** Mem is its title and one line (carried: **和 {home} 用同一份记忆，不用设置**);
  a second, soft line only when something asks for the person (an agent to connect, their own
  sessions, trouble), and trouble comes first so the line matches the button beside it.
- **Trust as a sentence, not a list.** What a device uses and never sees is one or two plain sentences
  in the card's soft tray, no marks: the computer for tasks, the phone lent to tasks, and the home
  (**你和 {name} 的对话都存在这台电脑上。**). A phone that is only a window has none.
- **The role once.** The chip that says **帮 {name} 做事** is the role; the line under the name then
  says **待命** while idle.

## Read at a glance (D424)

The author on 0.1.1's Partner page: "这里好多文字啊，我完全看不进去". Five paragraphs on one page, the
trust lists wrapping onto two lines an item, and the same thing said twice (the language under a picker
that names it; **请你评审的 PR** under a title that means it). The rule, on every pane:

- **A row is its title and at most one short line.** A group's note and a pane's lede note are one
  clause. A line the control already says is dropped (the language picker, 浅色和深色).
- **An explanation a careful person may want sits behind 怎么做到的 / How it works ›**, a quiet link
  under the row or note; pressed, the words open in place in the muted ink and it reads **收起 / Hide**.
  Used for: what the records switch reads and forgets; when a chat app is written to; where WeChat's words go after its day; where a saved
  thing's key is kept; what the details' fields it can read; which versions the night's update takes.
  Never for a word the control already says, never a ⓘ or a popover. Mac `how`, `explainedRow`,
  `groupHow`, `ledeHow` (`settings.go`); web `How`, `Toggle`'s `how` (`controls.tsx`), outside the
  switch's label so a tap never flips it.
- **Lists are short phrases** (4–8 characters in zh): 改副本，不动原件 · 读项目和文件 · 查资料、看网页 ·
  能撤销的按默认做; 发给别人的东西 · 改不回来的事 · 登录网站 · 付钱.
- **Said once.** 要不要先问's note is one clause on how a review stops asking (**评审想直接发，跟它说一声就行。**),
  only until one is standing; a standing permission is its title and **你说：「…」**, the owners only when
  it is bounded.

Before and after, per pane, are in D424; shots `.shots/settings-trim/{before,after}` (Mac 1000, web 390,
zh and en, light and dark; `-open` with the tap pressed).

## Polished pane by pane (D432)

After D424 the words were short; what still made a person think was shape (research/182, every pane on the
Mac at 1400 and 760 and the web at 1400 and 390, zh and en, light and dark). The rules it leaves:

- **A choice of a few is a row.** Its title on the text column, the segmented choice at the right edge, a
  standing go or a consequence as the row's line: 等多久再按默认做, 每天最多, and now To-do sources'
  **新的来了** and **做完以后** (Mac `tileRow`, web `chat-row` with `Seg`). On a phone a choice that drops
  under its words takes the text column's width.
- **A step outside Ducter is one line to copy**, for the person's system, never two systems in a sentence:
  Memory's and Agent messaging's missing tool (**{home} 上还缺一个小工具。在它的终端里运行这一行，再点「再试一次」。**
  over `brew install pipx` or `sudo apt install pipx`, the bridge view's `cmd`), with **复制 → 已复制**
  (Mac `lendCopy`, web `CopyLine`).
- **A setting lives on one pane.** **发现了就说** is Notifications' (with 今天看了什么); Accounts starts
  with **它能看的**.
- **A waiting pane keeps its shape**: its first group with a soft sunken square in the tile column and the
  word on the text column (Mac `paneWait`, web `Waiting`), never a bare grey line on the paper.
- **One text edge.** Under a pushed page's lede, 怎么做到的 keeps the lede's edge (web).
- **A title is not said again under its card.** This phone / This computer lost **只改这台手机上的样子。**; its
  voice switch lost the **语音** heading; where the voice goes is behind 怎么做到的 while it works.
Where it runs and About already read in a look and are unchanged. (The Mac's quiet hours then followed the
region's hour cycle; D445 made them 24-hour pills everywhere.)

## Delight and flow, pane by pane (D445)

The author on round two: every pane loved, full of feeling, easy and smooth. D432 fixed shapes; this pass
walked each pane's flows (connect, change a choice, recover, undo) as H, C and F on the Mac at 1400 and 760
and the web at 1400 and 390, zh and en, light and dark (research/192, `.shots/settings-delight/{before,after}`).
The rules it leaves:

- **Show what a setting does, live (D43).** Where a choice's consequence is a thing a person can picture,
  the pane draws it and it follows every pick at once: **Notifications** opens with the notification itself
  (the partner's face, its name, **现在**, a real ask **CI 有两种修法，先试改动小的那个？**, the person's own wait
  **30 分钟内没回，我就先试它。**, and under it the quiet hours **23:00 到 08:00 不响，到点一起告诉你。**, or
  **随时会响。**, or with notifications off the card sunk into the paper and **不弹出来：它在「手头的事」里等你。**);
  **This phone / This computer** has Look and sound's stage, as the Mac (web `LookPreview`); **回你用的语言**
  shows its voice, the preview's reply in the language picked (日本語 → **はい、明日の 9:00 にお知らせします。**,
  `languages.json`'s `samples`); **To-do sources'** rows say what the chosen one does in the source's terms
  (**做完先问你，再在 issue 下留言。**, **做完在笔记里勾掉；想撤回，把勾点掉就行。**), a standing go still speaking
  for itself. Mac `notifyPreview`, `talkSample` (`settings_delight.go`); web `settings-delight.tsx`.
- **A success is felt on the thing it changed.** The partner on a preview smiles for a moment after a change
  on its pane (`cheer`, 1.6 s, the Mac's Look did already); the said line stays the one word (D296).
- **A choice of many is one pill at the row's right edge** opening its list, as the reply language:
  Codex's six models (never a tray wrapping one model onto a second line), the quiet hours' two ends (the
  half hours, 24-hour in every language and region, the chosen one brought into sight). Mac `modelPill`,
  `timePill`; web `Select`.
- **A row's words keep their width.** At the Mac's narrowest a row's control drops under its words on the
  text edge once the words would have less than 160 (`wordsThenControl`, for `row`, `tileRow`, `headRow`);
  To-do sources' choices had squeezed their titles to a letter a line at 760. On the web a choice whose own
  words overflow it stacks (`Seg`). Every row is at least 64 tall, `row` and `tileRow` alike.
- **Waiting looks alive.** The Mac's waiting square breathes as the web's (1.6 s, still under reduced motion);
  the web's Notifications waits in its shape too.

## One hand, every pane (D459)

After D424, D432, D441 and D445 (Settings) and D433, D444, D448 (Memory, Agent messaging) landed from
different branches, every pane was walked again side by side: the Mac at 1400 and 760 and the web at 1400 and
390, zh and en, light and dark, against demo cores in first-run, connected, problem and busy states
(`demo-settings-real.ts`, `demo-mem-bridge.ts` relay/away/boxes, `demo-memory.ts` on/fresh/unreachable;
`.shots/coherence-459/{before,after}`). What one round had done one way and another round another, and the
one shape kept:

| Seen | Kept |
|---|---|
| Memory's switch is its first group's head row; Agent messaging's sat in a last card of its own, its words pushed in by an empty tile column, its title the lede again | **A pane's one switch is its first group's head row** (Memory, Agent messaging): its mark, who it is about, this week in a few words (**这周新记了 5 条**, **这周来往了 3 次**, done ink when there is any), the switch at the right edge, and where it shows up as the group's last line; the said line under that group |
| Who can reach the partner came after Recently | **Who, then what happened:** 能找到{name}的 before 最近, then 试试看 |
| Every memory row a 10-point dot and **你跟我说的**, six times | **A row speaks only when it differs (D399):** what the person told it is said once in the section's note; a row from another tool says so with that tool's coin; a lone 别的 / Other is not titled |
| A row's title ending in 。 (全部的都在 Nowledge Mem 里。) | A title is a phrase, never a sentence with a full stop |
| A line to run: a sunken tint on the Mac, the ink's slab with **$** on the web | One look (`lendCopy` kind `line`, web `CopyLine kind="line"`): the ink's slab, the accent's $, bold mono; a check and a sentence to say stay on the sunken tint |
| The web's Memory, Notifications and Accounts had no lede; Agent messaging drew its own | Every pane's lede sits under its title on both clients (web `PANE_LEDE`); To-do sources, Chat apps and Passwords & cards keep theirs with their lede note |
| Forgetting or fixing a memory in Settings said nothing (every other change has the partner's word) | **好，忘掉「…」。 / 好，改成「…」。** under the section, D296's said line |
| Memory's notes two sentences each (D424 says one clause) | One: **哪条不想让我记，说一声「别记这个」就好。**; off: **记下的都还在 Nowledge Mem 里，一条没删；再打开就接着用。** |
| Memory and Agent messaging read as two products of one Mem | Memory's Nowledge Mem group says **你的其他 agent 也通过它找到{name}** with **看看谁能找到 ›** whenever Agent messaging is shown |
| The Mac's `explainedRow` kept its control beside squeezed words at 760 | It drops the control under the words as `row` and `tileRow` do (D445) |

## One more hand (D468)

Every pane but Memory, Agent messaging and On hand rendered against `demo-settings-real.ts` on the Mac at
1280 and 760 (`TestD468Shots`) and the web at 1280 and 500, zh and en, light and dark
(`.shots/d468/{before,after}`). Findings per pane, ranked, are in D468. The rules it leaves:

- **A control stays beside its row's words on every width** while the words keep about 160; then it drops
  under them. The Mac's rule (D445, `rowWordsMin`) is now the web's on a phone too (`.chat-row`, `.chat-foot`,
  the language's row): 贴密钥, 换一个, 试试 and the model's pill no longer open a line of their own. A group's
  last line on the Mac (`footRow`) follows it, so its note never squeezes to a word a line beside two actions.
- **A choice of a few is one track or one clean stack.** When its options can't stand in one line even
  under the words, they stack across the text column, one per line (Mac `choices` measures, web `Seg`); four
  that fit two by two sit two by two (web), as 发现了就说 on a phone.
- **The hours are pills on both clients.** The web's quiet hours are a row titled **时间段 / Hours** with two
  pills of the half hours (`Select`), as the Mac's; a pill's list opens with the chosen one in sight.
- **An added source is the partner's said line** under the sources (**加上了 OOMOL，现在能看：Gmail、日历**),
  where a stopped one is answered; a refusal keeps the failed look.
- **Two actions never say the same thing.** A linked chat app's account row says **换个账号 / Use another
  account**, not 解除连接 / Unlink above 断开 Telegram.

## New tasks start (D510)

**Who:** H with a server and a laptop who wants work off the lid; C with one favourite agent. F with one
computer and one agent never sees it. **Where:** Settings › Partner, its own group **新任务默认 / New tasks
start** right under 做事的 (who does the tasks), because it is the answer to "and which one by default?".
Two rows, each a segmented choice (a pop-up past three on the web): **在哪儿做 / Where**
(**自动 / Automatic**, then each computer that runs tasks by name; phones never) and **谁来做 / Who does
it** (**自动**, then the signed-in agents; the chosen one's coin on the row). A row shows only when it
has a choice. Each line says what the choice does in one or two clauses (**能做的都在 hel 上做。它连不上，
或者要用别处才有的（你的 Chrome、某个 App），就换一台。**); the foot says it can be said in the conversation
too. The said line after a tap: **新任务默认在 hel 上做 / New tasks now start on hel**, **新任务默认交给 Codex**,
back to automatic **新任务在哪儿做，又由 {name} 来挑**. While an agent is set, 做事的's built-in rows (errands,
code and the rest) step aside: the default speaks for them. Shots: `.shots/d510-new-tasks/` (Mac 1280,
web 1400 and 390, zh, light and dark). `design/where.md` §23 has the mechanics.

## What each partner thinks with (D536)

**Who:** H with several partners who wants one of them (小玛, the growth one) on another agent or model;
C with a partner per family member; F with one partner, who sees the page exactly as before. **Where:**
two places on Settings › 伙伴, one meaning each. **伙伴们 / Your partners**: under each partner's name, a
line with its agent's coin and **想事情用 {agent} / Thinks with {agent}**, its model and **思考：{level} /
Effort: {level}** as separate facts (the default's adds **默认 / The default**); a partner with none of
its own says **想事情跟 {default} 一样 / Thinks with the same as {default}** in the muted ink, no coin, so
the ones set apart stand out. **改一下 / Change** on another partner adds three small pop-ups under its
colours, indented as they are: **想事情用 / Thinks with** (**跟 {default} 一样 / Same as {default}**, then
each agent the home can think with), **用哪个模型 / Which model** (only with more than one) and **思考深度 /
Effort** (only where the model names levels; **默认 / Default** first). A pick applies at once, as a colour
does; **好 / Save** is for the words only. **The default card**, with more than one partner, is titled
**默认用什么想事情 / What partners think with by default**, its note under the heading **{default}
和没单独选的伙伴都用这个。要给哪个伙伴单独选，点它的「改一下」。/ {default} and every partner without its own
choice use this. To give one its own, choose Change on its row.**, and gains the **思考深度 / Effort** row
(the said line **好，从你的下一句话开始，思考深度用「{level}」。/ Got it: from your next message, I use
{level} effort.**). With one partner the card keeps **想事情用 / What I think with** and no note. **做事的**:
an agent another partner thinks with of its own says **{name}想事情也用它 / Also thinks for {name}**.
Shared controls only: the web's Select, Facts and Field (the name and its line, 44 tall with one
accent ring), the Mac's pill (`pickPill`, D445's model pill made general, opening the one clay menu
above it over its own group, never down over the next heading; it flips where the window has no
room), `lineField` and facts. Shots: `.shots/partner-model/` (Mac 1150 and 1400, web 390, zh and en, light and dark).

## Not done

- D459's leftovers: the phone's sign-in still answers with a boxed notice at the top (`partnerToast`), not
  the said line; the web titles a memory kind inside its card (`g-cap`), the Mac above it; Agent messaging's
  problems are bold sentences, not a title and a line.
- D468's leftovers: 移除 / Remove stands alone on its own row under each to-do source; the web's This phone
  has no lede; the web's devices list has no hairlines between devices (D311's list); the Partner page's
  peers line has no chevron on the web (`memory.tsx`); the notification preview's 现在 sits mid-card at 500.
  (移除 and the chevron: done in D500.)

## The partner reports on its own world (D469)

The author after D459, D465, D466 and D468: Settings 「还是原来的样子」. The rows were one grammar; what was
missing was On hand's language (D467): a partner who reports, state carried by its art, what needs you first
with its fix. Candidates, rubric and diagnosis are D469's; what it leaves, on both clients:

- **Settings opens on 概览 / Overview** (Mac: the rail's first tab, the home computer's clay; web: the head of the
  Settings list). **The brief**, On hand's form: the partner at 88 in its pose (flag, smiling, napping), one lead
  (**都好好的，我在这儿。**, **有一处要你看一眼。**, **有 n 处要你看一眼。**, first run **还差一步，我就能想事情了。**), then
  labelled lines in its voice, each opening its pane: **等你** (each need with the button to where its fix is),
  **运行在**, **想事情用**, **能看的**, **记得**, **也能找我**.
- **What needs you, everywhere it is** (`setNeeds`, the web's twin): no agent to think with (Partner), a source
  that can't be reached (Accounts), Mem's questions (D465) and a Mem plugin behind (D466) (Memory), updates
  (About on the Mac, Devices on the web). The brief names each with its button; the pane's head names its own.
- **你的电脑 / Your computers:** each computer one clay card of one width, its clay in its state, its name and what
  it is to the partner (D551: **我在这台上运行**, **帮我做事**, **这会儿连不上**); the home's card carries what
  lives there: the partner's face, Mem's notebook while memory is on, the read accounts' marks (four, then +n).
  On Overview and on Where it runs; a card opens Devices.
- **Every pane's head is the partner speaking** (Mac `paneSpeaks`, the web the same): the pane's name, then the
  partner at 40 and one sentence of what is true there (Accounts counts what it keeps an eye on; Where it runs
  says where and that closing the window doesn't stop it; Memory by its state), then that pane's needs in the
  needs-you ink with the partner's flag. A pane with nothing computed says its old lede in the first person.
- **Said once:** a row under a head that says the same is dropped or speaks only when it differs (Where it runs'
  computer row; Memory's first-run hero).

### Round 2 (D469 rev.)

- **A fix here when it is safe:** a Mem plugin behind says **更新** and opens Memory's own in-place ask under
  its line (sent only on OK); updates waiting are Devices' one tap **全部更新**. Mem's questions, a source down
  and no agent go to their pane.
- **你的电脑和手机:** computers, then phones and tablets (a window on a known computer is that computer's),
  one card width, the clay at 64, what each is to the partner and what it does now, only when true (tasks under
  way, asleep, connected now, last here); the home says **对话和记忆在这儿**.
- **你的账号在哪儿:** each source its own card (its mark, **邮件、日历和消息经过它** or 连不上, its accounts' marks,
  **读和起草；发出去、花钱的先问你**); a calling source **替你打电话，每通先问你**. The accounts no longer stand on
  the home's card: they live with their source, and the home reads them through it.
- **The last word:** **想改什么，直接跟我说也行。**
- **Partner** says its head in the first person (**我在 {home} 上运行，用 {model} 想事情。**). **Notifications**'
  发现了就说 is a row (title and the choice's meaning on the text column, the four choices at the right edge,
  D432), cheering the preview on a pick; every other row already had the right control. **Look and sound**
  needed nothing (its rows are segmented choices, a switch and the live stage; the intro's sound has 试听).
  The web's quiet hours are the 24-hour pills, as the Mac's.
- **Where it runs names the home this window talks to** (its device, a server or another machine) in its head
  and its row, never 这台 Mac beside a home with another name.
- Shots: `DEMO_NEEDS=1` on `demo-settings-real.ts` shows every need at once.

## Agent messaging in the same voice (D470)

Since D557 (the Bridge live trial passed, 2026-11-25) the pane's switch is simply on by default: where the
home's Mem is ready and the person runs agents of their own, the home connects by itself (D332) and nothing
on the pane says "preview" or waits on a trial. Off is the switch, or `DUCTER_BRIDGE=0` for the whole home.

Who: H wants who reaches whom at a glance and what came of each exchange; C wants to know nothing can
make the partner act without them; F sees the page only once they run an agent, and before any exchange
meets an invitation, not an empty list. The pane now reads top-down as the others do: the partner's
sentence (who reaches it; a one-way link in the needs-you ink, and a 等你 on Overview with **打开它的信箱**),
the switch, **谁能找到谁** (a picture per agent: coin, both ways drawn and said, the partner's pose, the fix
under a link that isn't whole), **来往** (a thread per agent, each exchange with what came of it), **谁能让我做什么**
(the rules in code and the muted), then **试试看**. Overview's **也能找我** adds the agents after the chat apps,
each part opening its pane. Full words in `bridge.md` "Who reaches whom…" and D470.

D489 (the author: 「这个 bridge 是什么情况？」): **谁能找到谁** is now **你的 agent / Your agents**, a literal row
per agent saying what it can do as what the person gets (no arrows, no red); pi and Antigravity one quiet row (D555: Antigravity its own row, pi alone in the quiet one);
the one-way agent's offer under its row with the Space already in it (**让它收到回话**, **换一个空间**). The head
says it in the plain ink (the pane carries no needs line; Overview's 等你 stays), and the switch's last line
says what the pane is for. `bridge.md` "Your agents, said as what you get…".

## Pane by pane, again (D475)

The author's bar: every pane loved, full of feeling, easy, smooth, elegant; and the phone first-class.
Every pane but Overview, Memory and Agent messaging rendered against `demo-settings-real.ts` (and
`DEMO_NEEDS=1`) on the Mac at 1280 and 760 (`TestD475Shots`) and the web at 1280, 390 and 430 with touch,
zh and en, light and dark (`.shots/d475/{before,after}`).

| Pane | Who, and what they felt | What was wrong | Now |
|---|---|---|---|
| 伙伴 / Partner | H: which agent, which model, who does tasks | Done in D322 and D469; on a phone the model's pill drops to a line of its own | Unchanged (kept in step) |
| 通知 / Notifications | C and F: "will it bother me?" | The head described the pane; the preview didn't follow 发现了就说; on the web 发现了就说 was a heading over an untitled pill | The head says how it reaches you now; a second, smaller notification follows 发现了就说 (the urgent one now, the morning's note, or none with its line); 发现了就说 a row on the web too |
| 账号 / Accounts | C: what it may read; everyone when something broke | A source down: **连不上** seven times, the head still counting six watched, no way to try again | The source's first row says it once with **再试一次**; rows quiet and faded; the need alone in the head |
| 待办来源 / To-do sources | H with issues, C with a vault | The head described the pane; on a phone each choice stood three rows tall | The head counts what is open where; on a phone a choice takes the card's width, one track |
| 聊天软件 / Chat apps | C, H | The head described the pane | The head names the apps it waits in |
| 密码和银行卡 / Passwords & cards | C booking | The head described the pane; the Mac's globe and card outlines where the web drew the site's letter and the card | The head counts what it keeps; both clients draw each as itself in the 40 column |
| 外观和声音 / Look and sound | Everyone, briefly | Already a live stage and segmented rows | Unchanged |
| 在哪儿运行 / Where it runs | H with a server home; F once | A lone card naming the home under a head that named it | Gone when there is nothing to do here; the head and the home's card say it |
| 关于 / About | H checks versions | No word on how the versions stand | The partner in its pose with **每台电脑上的我都是最新的。** or the update waiting |

The rules it leaves, for every pane:

- **A head is the state, never the purpose.** What is true now, counted where there is a count, the
  pane's old lede only until it is known.
- **A fault is said once, where it starts, with its fix.** The rows it reaches stay quiet and fade.
- **Show the consequence of every choice a person can't picture** (D43): Notifications draws what each
  pick of 发现了就说 sends.
- **A thing kept for the person is drawn as itself**, in the 40 tile column, the same on both clients.
- **On a phone, room goes to the control.** A choice under its words takes the card's whole width.

## Every pane, by one hand (D500)

The author's standing ask: 「每一个设置页面的打磨和 flow/视觉设计，我们要让人爱不释手，充满情绪价值，无比好用顺滑优雅」.
Agent messaging (D480, D489, D494) and On hand (D498) had just been re-seen; this pass took every other
pane: Overview, Partner (with D497's colours), Memory, Notifications, Accounts, To-do sources, Chat apps,
Passwords & cards, Look and sound, Where it runs, About. Shot on the Mac at 1400 and 760 (`TestD475Shots`,
now with Overview) and the web at 1400 and 390, zh and en, light and dark, against `demo-settings-real.ts`
(the author's real shape), `DEMO_NEEDS=1` and `demo-first.ts` (a fresh home with no AI agent):
`.shots/d500/{before,after}`.

**Who, and what they feel.** H opens a pane to change one thing and wants the row where they expect it;
C opens Partner, Notifications or Chat apps and wants calm; F opens Partner first, from 改名字 or from the
first run's 去登录, and must meet only what is true for them. The pass looked for what breaks the
feeling of one hand: a group out of the story's order, a line that repeats its title, a word the pane's
own head contradicts, an edge a few points off, a control alone on a row.

### The audit, ranked (most felt first)

| # | Pane | What was wrong | Fix |
|---|---|---|---|
| 1 | 伙伴 / Partner | With one partner, **伙伴们 / Your partners** led the pane: a fresh user with no AI agent to think with was first offered a second partner (personas.md: with one partner nothing about partners shows but the offer). On the Mac its add row was a bare text button with no ＋ and no line; on the web its note sat under the card | With one partner the group is the pane's last, after the trust lists; with several it leads (who is who). The Mac's add row is the shared add row (＋, **再加一个伙伴**, **比如一个管工作、一个管家里，或者家里每人一个。**); the note sits under the heading on both |
| 2 | 伙伴 / Partner | Rules read as code: **跑腿的事 → Claude Code（Sonnet）**, **写代码和别的事 → Codex**, and a rule the partner wrote (**后端的事 → Codex**) | The defaults in words: **跑腿的事交给 {agent} / Errands go to {agent}**, **写代码和别的事交给 {agent} / Code and everything else goes to {agent}**; a rule's arrow is said as **：/ :** on screen (the partner's tool text is unchanged) |
| 3 | 聊天软件 / Chat apps | Slack, never set up, stood between Telegram and WeChat, both linked: the pane read as linked, not, linked | The apps in use first, then those resting until chosen; the order is fixed when the pane opens, so an app being set up never jumps |
| 4 | 待办来源 / To-do sources | **移除** stood alone on a row of its own under each source (D468's and D475's leftover); **新的来了**'s line began **新的来了，…**, **做完以后**'s **做完…**: the line said its title again | The source's last line says when it last looked (**刚刚看过 / Looked just now**, **10 分钟前看过**) with **移除** at its right edge; the lines say only what the choice does (**在对话里跟你说一声。**, **先问你，再在 issue 下留言。**, **在笔记里勾掉；想撤回，把勾点掉就行。**) |
| 5 | 通知 / Notifications | 发现了就说's card was the only one without a heading, between 什么时候找你 and 你没回的时候; its line wrapped one character onto its last line (说。); on the web 今天看了什么 was a small link indented past the row above | The card's heading **自己发现的事 / What I find**; the lines shorter (**早上一起说，最多 3 条；急的随时说。**); 今天看了什么 a row on the web as on the Mac (its title on the text edge, the chevron at the right edge) |
| 6 | 概览 / Overview, 在哪儿运行 / Where it runs | The card grids' headings (你的电脑和手机, 你的账号在哪儿) sat 16 points left of every other heading, in the muted ink; on the web the home card's face stood on a line of its own above **你们的对话在这儿** | The headings on the text edge in the soft ink, as every group's (`sectionHead`); the face and its words on one line on the web, as on the Mac |
| 7 | 关于 / About | The versions card's note said its title again (**Ducter 和帮它做事的电脑，各自是什么版本。** under **各台电脑上的 Ducter**); the home's row said **10 分钟前看过，已经是最新的** under a head that had just said **每台电脑上的我都是最新的。** | No note; while every computer is current the home's row says only when it looked (**刚看过**, **10 分钟前看过**); with an update waiting it says as before |
| 8 | 账号 / Accounts | Its first group was **它能看的** under a head in the partner's own voice (**我在留意 6 个账号…**): 它 and 我 for the same partner a line apart | **能看的 / Can read**, Overview's own label |
| 9 | 外观和声音 / Look and sound, 这台电脑 / This computer | Lines of two sentences that wrapped a character onto a line of their own on a phone (改。, 听。); **⌘⇧D** offered on a touch screen; **只在这台设备上生效** under a pane titled 这台 | One clause each: **只改这个窗口；回你用的语言在「伙伴」里。** (naming the row it means), **紧凑：头像缩到标题旁边，一屏多看几行；⌘⇧D 随时切换。** (without the shortcut on a touch screen), **按住说话发的消息，回复会念给你听。**; the web's lines wrap without an orphan (`text-wrap: pretty`) |
| 10 | 密码和银行卡 / Passwords & cards | 铁路 12306's pebble said **1** (the first character of 12306.cn) beside a name starting with 铁 | A sign-in's pebble is the first letter of the name beside it |
| 11 | 伙伴 / Partner | The last line (**你自己用的 agent 也能把事交给 Ducter。 看看**) was a card's foot on the paper: a hairline over it and its words pushed in by an empty tile column (Mac); no chevron and its button beside the words (web, D468's leftover) | A line on the paper on the text edge, **看看 ›** at the right edge, on both |

Looked at and kept: Memory (its own pass, D459 and D465–D466; one shape with the rest); Where it runs'
cards; Look and sound's stage and rows; Accounts' per-service state (D296, D475); the Overview brief; the
dark theme on every pane (no finding of its own).

### Not changed, noted

- The web lists a computer that is only a window on Overview (Siweis-MacBook-Pro) where the Mac doesn't. (Done in D551.)
  (Rows under a first-person head, Look and sound's head and the web's device hairlines: D501, below.)

## One voice (D501)

Every pane's head is the partner speaking (D469). D501 makes the whole pane one speaker:

- **我 / I is the partner, and only the partner.** Heads, ledes, lines and group titles that speak of it say
  我 / I: **想事情用 / What I think with**, **怎么说话 / How I talk**, **什么时候找你 / When I come to you**,
  **自己发现的事 / What I find**, **我能看的邮件、日历和别的账号**, **你在 Telegram 里说的，我就在那儿回。**,
  **日历连上了，可以问我「今天有什么安排」。**, **护照、生日、住址我只替你填，看不到。**, **我知道的关于你**.
- **你 / you is the person, and only the person.** A choice or a button they tap names the act and, when it
  needs a person, says 你 / you: **说一声 / Say so**, **直接接下 / Take it on**, **不用说 / Stay quiet**,
  **先问你 / Ask you first**, **仍然先问你 / Keep asking you**, **等你来问 / Only when you ask**,
  **跟着你 / Same as yours**, **录好了 / Done recording**, **Have a look**. Never 我 / me meaning the person.
- **它 / it is never the partner.** An account, a calendar, a key, a phone, a connection still are.
- **Kept as they are:** a line the person sends (the preview's **明天早上提醒我看 PR**) is their own words; pane
  names are the glossary's (**在哪儿运行 / Where it runs**); a line naming the partner among others keeps
  the name.
- **Look and sound's head states the pane** (D475): **这台 Mac 上是 Pebble，深浅和语言都跟着系统。**; with a
  choice made, **这台 Mac 上是 Pebble，一直是深色，界面用中文。**; the web's own page **这台设备上是…**. It
  changes the moment a choice does.
- **Nothing to draw, no tile column:** the fresh Partner pane's **还没有能想事情的 AI agent** sits on the text
  edge on the Mac as on the web.
- **你的设备 / Your devices on the web:** a hairline between devices from the name's edge, as every list.

### The phone in the iOS Simulator (D501)

The iPhone app built for the Simulator (iPhone 17 Pro, iOS 26.3), each demo core paired on its own port,
light, dark and accessibility-large text (`.shots/d501/ios/`): the conversation with several partners, a
second partner's first meeting, On hand, every Settings pane, the decision card in a task and in the
conversation. Fixed: the first meeting's repeated starter, and the bar's partner faces under a finger's 44.
Kept: safe areas, dynamic type, no glyph drawn as an emoji, 44-tall text buttons on the decision card. Owed
(`todo.md`): a launch that once sat on **正在连接…** after the bundle or the appearance changed; a long first
meeting opening scrolled past the figure; a long press, the keyboard and overscroll, which the Simulator
can't be touched for from the shell.

## 上网 / Web: Straight to your Chrome (D505 rev.)

*Who:* a server-mode person whose Mac is a worker, back in Settings after saying 换过去 / Move it
there on a site's first sign-in card, or wondering why a task went to their Mac without asking.
*Felt:* they want to see what they agreed to and take it back in one tap. Under **已登录的网站 /
Signed-in sites** in the home's 上网 / Web, and only when there is one: **直接用你的 Chrome /
Straight to your Chrome**, one line (**这些网站要登录时，任务直接换到你 Mac 上已登录的 Chrome 接着做，不再先问。**),
then one compact line per site on the head's left edge with a quiet **移除 / Remove** (as Your rules'). With a Mac whose Chrome can take a sign-in, Signed-in sites' empty line says the ask that comes first (**还没有。任务要登录哪个网站，会先问你：换到 {computer} 上你已登录的 Chrome 接着做，还是在这里登录。**). Removed, the next sign-in there asks again. No
switch, no empty state: the list is made only by the card's Go (`where.md` §22). Built on web and
the Mac; shots in `.shots/d505-ask-once/v2/`.

## Overview on a phone (D547)

*Who:* any of the three, Settings opened from the phone with a thumb, mostly to see whether
something needs them. *Felt before:* lost: the wide brief squeezed into one column (the fixes 36
buttons under their sentences, the lines 23-tall links), then seven computers as seven 150-tall
cards (a later D469 rule had overridden the phone's two columns), the list far below. *After:* one
column, read in one glance, every row a target for a thumb. Under 600 wide, on the web:

1. **The partner and its lead on one line** (the face at 48, the lead in the display face, 18).
2. **What needs you**, only when something does: one card on the needs tint, each sentence with its
   fix as a full 44 button at its right (it drops under the sentence when they don't fit).
3. **The labelled lines** (运行在, 想事情用, 能看的, 记得, 也能找我) as the Settings list's own rows: the
   label small over what is true, a chevron, the whole row opening its page; 也能找我's agents a row of
   their own after the chat apps.
4. **你的电脑和手机** and **你的账号在哪儿** as rows of the list under its heads: the clay at 40, the
   name, what it is to the partner, what it does now, the home's **对话和记忆在这儿**; a place's
   accounts as their marks under its line.
5. The partner's last word, then the list.

The wide Overview (600 and up, and the Mac) is unchanged. Shots: `.shots/composer-polish/{before,after}/overview-*`.

## Swept again (D551)

The author's standing ask once more, after D547 redid Overview for a thumb. Every pane shot against
`demo-settings-real.ts` on the Mac at 1000, 1150 and 1400 (`TestD475Shots`, now with Memory and Agent
messaging) and the web at 390, 768, 1024 and 1400, zh and en, light and dark (`.shots/settings-sweep/`,
before and after per pane). Opened most often first:

| Pane | Who, and what they felt | Found | Now |
|---|---|---|---|
| 伙伴 / Partner | H choosing who does what; F from 改名字 | Four lines named the partner in its own pane (**每个任务 Ducter 挑…**, **多一个，Ducter 挑的时候…**, **跟 Ducter 说一条规则…**, **其中 10% 给 Ducter 留着**); on the Mac 新任务默认's **谁来做** as a track of five squeezed its line to **那 / 个。** at 1150 | In the first person (**每个任务我挑…**, **跟我说一条规则…**, **其中 10% 留着回你**); past three choices the row's control is the one pill (`fewOrPill`), as the web's Select |
| 记忆 / Memory, Agent 通信 | C first meeting Mem | **…Ducter 会自己找到。**, **…Ducter 会自己连上…**, **…把事交给 Ducter。** under a head in the first person | **我会自己找到**, **我会自己连上**, **把事交给我** |
| 通知 / Notifications | C and F: "will it bother me?" | The web's **等多久再按默认做** stacked its four choices under its words at every width (the old `set-item`); the preview's question left **个？** alone on a line on a phone | A row (`GRow`, `flat`), the choice at the right edge as on the Mac; the preview wraps without an orphan |
| 你的设备 / Your devices (web) | H checking versions; C after a new phone | Rows 56 tall with 36 clay, unlike every other pane's 64 and 40; the home's row **Ducter 在这台上运行** under **我在 Hetzner Server 上运行…** | 64 tall, the clay at 40, the hairline from the name's edge; **我在这台上运行** |
| 概览 / Overview, 在哪儿运行 / Where it runs | All three, to see whether something needs them | The web's sheet put seven devices two across in 200-tall cards (D547 had made the phone one glance, the wide view a long scroll); on the Mac at 1000 the computers stopped 145 short of the card under them; the cards said **帮 Ducter 做事** under **都好好的，我在这儿。**; the web listed a browser window as a place | Three across on the web (172); the Mac's grids share their row (`gridCardW`), one right edge; **我在这台上运行 / 帮我做事 / 随时找我**; a window on a computer is not a place (as the Mac) |
| 账号 / Accounts | C | Tuwa's **录好了** before **去 Tuwa 录** (D543: the primary first); **Ducter 在 Tuwa 上替你关了**, **现在用 Ducter 自己的声音** | **去 Tuwa 录** then **录好了**; **我在 Tuwa 上替你关了**, **现在用我自己的声音** |
| 待办来源 / To-do sources | H, C | **待办还是那个软件的，Ducter 只管做完。** | **…我只管做完。** |
| 聊天软件 / Chat apps | C | **Ducter 不登录你的微信…** | **我不登录你的微信…** |
| 密码和银行卡 / Passwords & cards | C | **让任务向我要密钥**: 我 meaning the person (D501 forbids) | **让任务向你要密钥 / Let tasks ask you for keys** |
| 外观和声音 / Look and sound, 这台电脑 / This computer | Everyone, briefly | The web's four choices stacked under their words at every width, where the Mac sets them at the right edge | Rows, as Notifications' wait |
| 关于 / About | H | Nothing new | Unchanged |

Left, with a recommendation:

- **About's versions card on the Mac:** the home's version sits left of **检查更新** while the other computers'
  versions end at the card's edge, two right edges in one column. Recommended: **检查更新** in the card's last
  line beside the night switch, every version on one edge.
- **New tasks start's empty tile column:** while both are **自动** its two rows keep a 40 tile column with
  nothing in it; the chosen agent's coin fills it once one is picked. Recommended: keep (the words would jump
  52 on a pick); revisit if the group gains a mark of its own.
- **Devices' cards and chips** still say **帮 {name} 做事** (a device's role, read among several partners);
  Overview and the list now say 帮我做事. Recommended: the card in the first person too, in Devices' own pass.
- **The Mac's preview wraps 到 / 期** in a Chinese word on Notifications' morning note at 1150; the web wraps it
  whole. Recommended: `keepWords` over the preview's sentences.
- **The web's partner rows** still put the model's pill on its own line at 390 (D475's choice, kept).

## Not done

- D475's own: Chat apps' quiet
  actions each on a line of their own on a phone; Where it runs'
  cards say what each computer is doing only when the home reports it (the demo reports none); the
  author's review.
- D469's owed: a comprehension pass on Overview's labels; the author's review; Mem's questions answered on
  Overview (they need their two memories read: Memory's job for now).
- D459's leftovers: Accounts' connection added and the phone's sign-in still answer with a boxed notice at the
  top (`partnerToast`), not the said line; the web's quiet hours are the browser's time fields where the Mac
  has pills; 发现了就说's four choices stack into a tall block on a phone; the web titles a memory kind
  inside its card (`g-cap`), the Mac above it; Agent messaging's problems are bold sentences, not a title and
  a line.
- A comprehension pass with people on the said lines and on a row with no state word.
- The web has no AI accounts row on Accounts (the phone has no Devices page of its own there);
  its Partner page keeps the tray-less lists (D89).
- The iPhone keyboard over a sheet seen with a real keyboard (the Simulator can't be tapped from the
  shell).
- The Mac: typing into its fields with a real keyboard (the doubling was the driver's, D408); the
  accessible text and a chat app's link walked again in the real window.
