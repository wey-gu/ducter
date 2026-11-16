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
| A switch alone at a row's right edge | `switchControl` in `tileRow` | `RowSwitch` (`controls.tsx`) | Use my voice; a service's 自己留意 |
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

## Not done

- A comprehension pass with people on the said lines and on a row with no state word.
- The web has no AI accounts row on Accounts (the phone has no Devices page of its own there);
  its Partner page keeps the tray-less lists (D89).
- The iOS Simulator was not used; the phone shots are headless Chrome at 390.
