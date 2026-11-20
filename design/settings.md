# Settings, pane by pane (D296)

How each pane of Settings feels to the person in it, and the small pieces every pane shares. The
grid and its rows are D273's and D289's (`ui.md`, `settings_rows.go`, `set-grid.tsx`); the
words are the glossary's (`product-model.md`). 记忆 / Memory is D295's and 和你的其他 agent 通信 / Talk with
your other agents (short in the list: Agent 通信 / Agent messaging) is D332's (`bridge.md` "Simple, by who"); neither is covered here.

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
| A line to copy (D432) | `lendCopy` | `CopyLine` | Memory's and Agent messaging's missing tool |
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
**连不上 / Can't reach** always speak. The switch says the rest.

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

| Case | 想事情用 / What it thinks with | 做事的 / Who does the tasks | 再添一个 AI agent / Add another AI agent | 额度用完的时候 |
|---|---|---|---|---|
| **First run, none signed in** | One row: **还没有能想事情的 AI agent**, **在下面登录一个，或者贴一个 API 密钥。** | Not shown (nothing to say that the row above didn't) | Its note says what it unlocks (**…就能开始想事情、做事**); a row per agent to install or sign in, then the key | Not shown: no limit can run out |
| **One agent** (the author: Codex on a server) | The agent, its model (or **用它自己默认的模型**), its limit when it reports one; no Switch, no reassurance | One line on the paper: **现在每个任务都由 Codex 来做。** (its row would repeat the one above) | **有了第二个，Ducter 就能按事情挑；一个的额度用完了，另一个接着做。**; Claude Code **去装上** / **去登录**; the key | The switch, and **现在只有一个 AI agent 能做事：额度用完时，等它恢复再接着做。** |
| **Several agents** | The agent with **换一个** (the others listed in place, each **用它**), the model's choice with its one phrase, the reassurance as the group's last line | A row per signed-in agent (limit, **Ducter 想事情也用它** on the one it thinks with) with its **用它做事** switch; how it picks as the section's note; the rules; **打开任何一个任务，都能换别的 AI agent 接着做。** | **多一个，Ducter 挑的时候就多一个选择。** and the key | The switch |
| **On a server** | Same rows; the header says **住在 hel 上**, sign-in rows say **在 hel 上登录** | Same | The buttons go to Devices, where the server's card signs it in | Same |
| **A pay-per-use key only** | The agent the key runs (DeepSeek Harness) with **用你贴的 API 密钥，按用量付费** | One line, as with one agent | The subscription agents, and the key row again (a second key) | As with one agent |

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

Where it runs and About already read in a look and are unchanged. The Mac's quiet-hours fields follow the
region's hour cycle (MyGo's `TimeInput`), so a 24-hour Mac shows 23:00.

## Not done

- A comprehension pass with people on the said lines and on a row with no state word.
- The web has no AI accounts row on Accounts (the phone has no Devices page of its own there);
  its Partner page keeps the tray-less lists (D89).
- The iPhone keyboard over a sheet seen with a real keyboard (the Simulator can't be tapped from the
  shell).
- The Mac: typing into its fields with a real keyboard (the doubling was the driver's, D408); the
  accessible text and a chat app's link walked again in the real window.
