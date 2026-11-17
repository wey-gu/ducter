# Settings, pane by pane (D296)

How each pane of Settings feels to the person in it, and the small pieces every pane shares. The
grid and its rows are D273's and D289's (`ui.md`, `settings_rows.go`, `set-grid.tsx`); the
words are the glossary's (`product-model.md`). 记忆 / Memory and 连上的 AI agent / Connected AI
agents are D295's and are not covered here.

## Who is here, and what they feel

Three people open Settings (AGENTS.md): **H** a heavy multi-agent developer, **C** a consumer
personal-AI user, **F** a fresh user who has never heard of a subagent.

| Pane | Who is here, mostly | Before | After | How it starts (first time, nothing to learn) |
|---|---|---|---|---|
| 伙伴 / Partner | H (which AI agent, which model, who does tasks); C renames it | "Is it on the smart one? Is it using up my limit?" | It is itself, on the model they chose, and they can see what is left in plain sentences | The partner's face and name at the top; one line where it lives and what it thinks with, as a phrase (住在这台 Mac 上，用 Claude Code 的 Opus 想事情) |
| 通知 / Notifications | C and F: "will it bother me at night?" | Unsure when it will interrupt | Quiet hours and the default wait are set, and the partner says in one line what that means | Notifications on, quiet hours 23:00–08:00 offered with one switch |
| 账号 / Accounts | C most (what it may read; whether it may call); F next | A wall of rows each saying the same green word | Calm: the place says how it reads, a row speaks only when it differs; flipping a switch gets one word back from the partner | The one tap (oo) or the add row; nothing read until they say yes |
| 聊天软件 / Chat apps | C (Telegram, Slack), H (Slack) | Connected, but to what? | "在 @bot 等你": it is waiting there, by name | One group per app with its steps as rows; nothing connected until they paste a key |
| 自动填充 / Autofill | C booking travel | Unsure what it can see | Each saved thing is a row with its mark; what it can and cannot read said once | Three add rows, one per kind; the uses section says none yet |
| 外观和声音 / Look and sound | Everyone, briefly | — | The preview smiles back at a choice (D150) | The preview stage and three groups |
| 在哪儿运行 / Where it runs | H (a server home), F once ("does closing the window stop it?") | Afraid closing the window loses work | This Mac (or hel) as the group's first row, small clay in the tile column, and one sentence that it keeps working | The row and its sentence; Rest, data and Remove further down, quiet |
| 更新和关于 / Updates and about | H checks versions; C reads Help | "Up to date · checked…" read as two facts | One phrase per computer (刚看过，已经是最新的) under a name that says what it is to the partner (Ducter 住在这儿) | The About card; the versions card; help links |

## The flows walked

Each pane was walked at Mac 1280 and 900 and web 1400 and 390, zh and en, against the demo core
with the author's accounts laid over it (`.shots/d296/before`, `.shots/d296/after`):

- **First run / empty:** Autofill's three add rows and its empty uses header; Chat apps with
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
| 伙伴 / Partner | **你的 AI agent 留下的记录 / What your AI agents keep**: **读它们留下的记录 / Read what they keep** (D327: one switch for Past tasks and a look the person asked for; off forgets), each hidden agent and each folder left out with **再显示** | 别再看了 / 还是看吧 (D298, D327), Past tasks' 不再显示 (D299), 这个文件夹别看了 (D327) |
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
| **One agent** (the author: Codex on a server) | The agent, its model (or **用它自己默认的模型**), its limit when it reports one; no Switch, no reassurance | One line on the paper: **现在每件事都由 Codex 来做。** (its row would repeat the one above) | **有了第二个，Ducter 就能按事情挑；一个的额度用完了，另一个接着做。**; Claude Code **去装上** / **去登录**; the key | The switch, and **现在只有一个 AI agent 能做事：额度用完时，等它恢复再接着做。** |
| **Several agents** | The agent with **换一个** (the others listed in place, each **用它**), the model's choice with its one phrase, the reassurance as the group's last line | A row per signed-in agent (limit, **Ducter 想事情也用它** on the one it thinks with) with its **用它做事** switch; how it picks as the section's note; the rules; **打开任何一件事，都能换别的 AI agent 接着做。** | **多一个，Ducter 挑的时候就多一个选择。** and the key | The switch |
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
- 要不要先问's note and Autofill's 你的资料 note sit under their headings on the web, as on the Mac.
- The records switch speaks of the partner as 它 / it, like every Settings line; Autofill's kept line
  says 解锁用的密钥在 Mac 的钥匙串里 (密钥 alone read as the API keys right above it).

## Not done

- A comprehension pass with people on the said lines and on a row with no state word.
- The web has no AI accounts row on Accounts (the phone has no Devices page of its own there);
  its Partner page keeps the tray-less lists (D89).
- The iOS Simulator was not used; the phone shots are headless Chrome at 390.
