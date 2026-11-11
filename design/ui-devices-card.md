# The device card as a character sheet

> 2026-11-10 · **D161, decided 2026-11-10** (the author: "按建议", all seven defaults in §10) **and
> built on both clients** (§12). Amends the card parts of D148 (11), D155 (1)–(3), D156 (2) and
> D157 (4)–(5); keeps every mechanism they decided.
> Prototype: `design/prototypes/device-card.html` (open from the repo; art loads by relative
> path; shots in `.shots/device-card-v2/`, outside git, D75). Builds on D81 (the Isles), D89
> (who does it, rules, 用它做事), D146 (coins), D150 (Settings), D157 (draft: where a task runs,
> `design/where.md`).

The author looked at the right-hand card on the Mac's Devices page (hel, then the MacBook) and
asked: "这些卡片设计好么，达到了我们的游戏级别的情绪价值和顺滑优雅标准了么，文字很多，layout
也很乱". The honest answer is no. This note says why, proposes one card for every device built
like a game's character sheet, and puts D157's "who and where" into the same language, so that
several computers × several AI agents read as one system.

**Labels.** VERIFIED: read in code this session. DOCUMENTED: a design doc says so. INFERRED: my
judgment.

## 1. Who is in this moment

| | Heavy multi-agent developer (the author) | Consumer personal-AI user | Fresh user |
|---|---|---|---|
| **Who** | hel (a server, Ducter's home), a MacBook that also does tasks for hel, an iPhone; Claude Code, Codex and pi on two computers | One Mac, one subscription, an iPhone | One Mac, the first-run sign-in, nothing else |
| **Before** | Opens Devices to check one thing (is pi current? is the MacBook doing work?) and has to read a page of sentences to find it | Sees "worker log", "版本 2.1.322 · Ducter 还没验证过这个版本" and wonders if something is broken | Sees a card that looks like a settings dump |
| **After** | Reads the card in one glance, like a character in a game: who it is, how it is, what it carries, what it can do. Taps a coin for the detail | 放心: nothing is red, nothing asks; the one dot is an update, one tap | 惊喜: the Mac is a little clay thing with its own name and its AI coins standing on it |
| **How it starts** | Clicking any island or list row; nothing new to learn | Same | Same; the card for a single Mac shows the Mac, its coins and two abilities, nothing else |

## 2. The card today, honestly (VERIFIED in `apps/desktop/internal/views/devicecard.go`, `i18n/computers.go`)

| # | What the author saw | Root cause |
|---|---|---|
| 1 | Paragraphs everywhere: the worker switch explains itself in four lines and prints `/Users/weyl/.ducter/worker.log`; **Ducter 还没验证过这个版本** under every agent; **它能为你做的：和 Ducter 说话 · 看手头的事 · 管理设备** | Every fact the system knows got a sentence, always visible. A helper that is only needed once (what the switch does) or only on failure (where the log is) is printed on every visit |
| 2 | Name, kind line, **现在连着**, section labels, agent names, versions and warnings at nearly one weight | No hero. The card is a list of rows of 13–15pt text; the clay art lives only on the stage, not on the card |
| 3 | **一台 Mac · 用 Ducter app 连着** and, with the switch on, **另一台电脑 · 替 Ducter 做事**, plus folded rows **Ducter app 也连着** / **命令行也连着**, each with its own ⋯ | Three ideas share the kind line: what the thing is, how it is connected, what it does. D155 folded the connections but each fold kept its own row and menu |
| 4 | The ⋯ menu's **断开** popover covers the card; another orphan **断开** at the bottom | A floating menu inside a scrolling card, and two disconnects that mean different things (a connection, the whole computer) |
| 5 | Each AI account is four lines (已登录 / 版本 / 未验证 / 更新) | The card repeats in words what the island's coins already show, and prints per-version facts that matter only when you act on them |
| 6 | **Codex 已登录 · 2 台设备共用** is unclear | "共用" names a fact about an account's limit (research/33) as if it were about devices |
| 7 | Left list subtitles wrap to two lines; uneven rows | The subtitle is the kind line, up to 20 characters plus a state |

The common cause: **the card describes; it doesn't show.** D43 asks that capabilities be shown,
not explained, and the stage does that; the card beside it went back to prose.

## 3. The shape: a character sheet

A game's character sheet answers four questions in a fixed order, at a glance, with detail one
tap away. The card does the same:

1. **Who** — the clay device, big, on its own little clay ground; its name under it, renamed in
   place.
2. **How it is** — one status line in words.
3. **What it carries** — its AI agents as a row of coins (the loadout).
4. **What it can do** — its abilities as a few toggle chips.

Then one quiet line of how it is connected, the version line (D148, only when there is
something to say), and one **断开** at the very bottom. Nothing else is visible by default:
every explanation is behind an ⓘ or a tap on the thing it explains.

**Vocabulary: reused, nothing new.** The clay devices, coins (D146), the dot for an update
(D148), the ability objects (D81's equip art, at chip size) and Settings' clay rows (D150) are all
existing. "Character sheet" names a layout, not a visual metaphor: there are no slots, stat bars
or levels (ai-loadout.md §5 candidate A's false implications: "slot count is a limit", "more
slots = stronger"). The metaphor process does not apply.

### 3.1 Who: the hero

- The device's clay at 140 (desktop) / 120 (phone), standing on a soft sunken oval (the card's
  own `sunken` tone, no new art). The art already says what kind of thing it is: `server_*`,
  `laptop_*`, `mini_*`, `phone`. So **the kind line goes away**; the accessible name keeps it
  ("hel, 云上的电脑").
- The art carries the state D77 already allows: awake floats 5pt (5.6 s); asleep wears its
  blanket; can't reach is a little grey in mist (`device_unreachable`). Reduced motion: still.
- The name at 28 (zh heading face, D78), centered under the art, renamed by clicking it (D148:
  Enter keeps, Esc cancels). A pencil appears on hover only.

### 3.2 How it is: one status line, not a chip

The author's direction proposed one status chip. **Recommendation: a status line in words, not
a capsule**, because D69/D73 rule out status chips everywhere (they were the first thing the
de-slop pass removed) and the art already shows the state. The line is 15, centered under the
name; normal states in muted ink, exceptions in their state's ink, never a dot:

| Device | Line (zh / en) | Ink |
|---|---|---|
| the home, idle | **Ducter 住这儿 / Ducter lives here** | muted |
| the home, working | **Ducter 住这儿 · 在做 3 件事 / Ducter lives here · 3 tasks under way** | muted |
| this Mac, not doing tasks | **你正在用的这台 / The one you're using** | muted |
| a computer doing tasks, idle | **替 hel 做事 / Does tasks for hel** | muted |
| a computer doing tasks, working | **在替 hel 做 2 件事 / Doing 2 tasks for hel** | working ink |
| asleep | **睡着了 · 醒来就接着做 / Asleep · carries on when it wakes** | dusk ink |
| can't reach | **连不上 · 最后在线 2 小时前 / Can't reach · last seen 2 h ago** | failed ink |
| a phone, now | **现在连着 / Connected now** | muted |
| a phone, earlier | **最后在线 今天 9:12 / Last seen today 9:12** | muted |

One line, one idea: the role or the state, never the kind and never how it connects (§3.5).

### 3.3 What it carries: the loadout row

- The agents on that device as coins at 56, in one row with their names under them (13/700),
  D183's looks: the agent's own mark in clay when signed in; **grey clay (`*_off`) when signed out**; not installed
  is not shown (it folds into **+ 再登录一个 AI**, D148, now a dashed coin-sized socket at the
  row's end, `slot_empty` art).
- **A small static dot** on a coin's top right when that agent has an update (D148/D156's one
  quiet dot, accent, 10pt, never pulsing). Nothing else is printed under a coin: no version, no
  "已登录", no "未验证".
- The coin Ducter itself thinks with carries ai-loadout's mark **Ducter 想事情用 / Ducter thinks
  with this** in its popover, not on the row.
- **Tap a coin → its detail opens in place** under the tray, a small notch pointing at the coin,
  pushing what is below down (never a floating layer over the card: that is issue 4's cause).
  The tapped coin lifts onto a white tile. The same on the phone. It holds:
  - the agent's name and model line (**Claude Code · Opus**);
  - **版本 2.1.322 · 用 npm 装的 / Version 2.1.322 · installed with npm** (one line; the
    channel in words: 用 npm 装的 · 用 Homebrew 装的 · 它自己装的 · 随 Codex app 更新 · 随
    Ducter 更新);
  - only when it applies, one muted line: **Ducter 还没验证过这个版本。** (D156, said once, in
    the popover of the agent it is about);
  - with an update: **有新版本 1.4.2** and **更新** (primary, small); an unverified latest keeps
    D156's line **要等你点一下才装** as the button's helper;
  - **用它做事 / Use it for tasks** as a switch (D89's per-agent toggle, now where the agent is);
  - D169 (built, through the `coinLines` slot for the line and `coinActions` for its action:
    `views/memplugin.go`, `MemAction` in `apps/web/src/devcard.tsx`): one line for Nowledge Mem
    in this agent, **Nowledge Mem 已装 · 0.7.34** quietly, or **没装 Nowledge Mem** with **装上**
    and its in-place ask; none with memory off;
  - when the same account is signed in elsewhere: **和 hel 共用一个账号的额度 / Shares one
    account's limit with hel** (replaces **2 台设备共用**, issue 6);
  - signed out: **登录** (primary) and nothing else.
  - **退出登录 / Sign out** stays as a quiet text button at the detail's foot (not on the home's
    card from another device, D148).
- Updating: the detail shows D156's steps in place (**在更新到 1.4.2…**); when done the coin
  **pops** (§7) and the dot is gone. Closing the detail mid-update is fine: the dot gives way to
  a thin accent ring turning round the coin's rim (a progress the user started, not a status
  that animates on its own), and the pop still plays when it lands.

### 3.4 What it can do: ability chips

- Each ability on that device as a **toggle chip**: the ability's clay object at 30
  (`ab_web`, `ab_computer`, `ab_remote`; `wait_mail` for notifications, as Settings' tab;
  the home's own clay for **替 hel 做事**) and 2–5 words: **替 hel 做事 / Tasks for hel** ·
  **上网 / Browse** · **在哪儿都能用 / From anywhere** · **用电脑 / Use apps** · **通知 /
  Notifications**. English takes the short forms on chips (the long ability names wrapped one
  chip per line at 380); the long names stay on the stage and in ⓘ. On: white chip on a 2pt clay base,
  ink 700. Off: flat sunken chip, the object desaturated (the art's `_later` look). These are
  controls, not status, so D73 doesn't forbid them; there is no "on" dot or word.
- An ability that can be added but isn't (D81's socket) is a dashed chip **+ 用电脑**; tapping
  it runs the equip (D65) in place: the object flies into the chip.
- Every chip has an ⓘ revealed on hover (desktop) or by a long press (phone): one sentence,
  the old helper text moved here (**hel 能把事派到这台 Mac 上，用这里登录的 AI 和这里的代码
  仓库。它只做事，看不到你们的对话。**).
- **Turning one off with nothing at stake is one tap.** When something would stop, the chip
  asks in one line under the row, default safe: **MacBook 上还有 2 件事在做。停下来，还是做完再停？**
  **做完再停** (default) · **现在停**. A browser sign-in, a domain, a code to pair: the chip opens
  its existing flow (D151, D143, D83).
- **Log paths only on failure**: the chip turns to the failed tint with **没开成** and one
  line under the row, **{reason} · 看日志**, the path appearing only after **看日志**.

Which chips a device gets:

| Device | Chips (default order) |
|---|---|
| hel (home, server) | 上网 (Ducter's own browser, D151) · 在哪儿都能用 (D143) · 打电话 (D199) · then the ghosts 用电脑 · 用手机 |
| a Mac that is the home | 上网 · 用电脑 · 在哪儿都能用 · 打电话 · then the ghosts still to come |
| a Mac connected to a home elsewhere | **替 hel 做事** first (D155's switch, now a chip) · 上网 (needs D157 (9)) · 用电脑; no 打电话, no ghosts |
| a phone | 通知 · 用手机 (later) |

**打电话 / Calls (D199)** is the home's only: a call runs on Tuwa's line, not on a computer. On while
a calling connection is connected (`ab_call`); a tap opens Settings › 账号 at the phone card. Off,
the dashed **+ 打电话** opens 账号 and starts the offer's own Tuwa sign-in (never a second flow;
the core refuses an `ability` request for it). Its sign-in gone (D193), the failed tint with **需要重新登录
/ Sign in again**, and a tap goes to the card that signs in again. ⓘ: **替你打电话，走 Tuwa 的线路。每一通都先给你看要说什么，你点了打过去才打；Tuwa
按分钟收费。** and **在设置 › 账号里连上和管理。**

**Ghosts (D199):** on the home's sheet only, after the live chips, each ability still to come
(`later`) shows as a flat sunken chip with its `_later` clay, no base, its name and a faint **以后会有
/ coming later**. It never sinks, squishes or adds; a tap opens its ⓘ (what it will do). So the
author sees what is coming, without a control that does nothing.

### 3.5 How it is connected: one quiet line

- One 13 muted line under the chips: **通过 app 和命令行连着 / Connected via the app and
  command line** (or **通过 app 连着**, **通过命令行连着**, **通过 Safari 连着**), with one ⋯
  at its end. Fits one line at 380 in both languages.
- ⋯ **opens in place**, pushing what is below down (never a floating menu): one row per
  connection, its own **断开** as a quiet text button: **Ducter app · 现在连着 · 断开**,
  **命令行 · 3 分钟前 · 断开**. The confirm is inline in that row (**断开 MacBook 上的命令行？
  断开 · 算了**). This fixes issues 3 and 4: the card never says "app 也连着" as if it were a
  second device, and nothing overlaps.

### 3.6 The foot

- The version line only when it says something (D148): **Ducter 0.0.6 · 有新版本 0.0.7** with
  **更新**. Current: nothing (the version is in Settings › About and the popover of ⋯).
- After a hairline, one **断开这台 MacBook / Disconnect this MacBook**, as the shared
  destructive text button (failed ink, flat), left aligned, confirm inline. There is one; the
  connection rows' 断开 lives only inside the ⋯ disclosure.
- The home has no disconnect; its foot is **停下 Ducter…** only in Settings › 在哪儿运行 (D150),
  never here.

## 4. The left list

One line per device: the clay at 32, the name 15/700 and, after a middle dot, **one short
word** of state in muted ink: **住这儿 · 替 hel 做事 · 睡着了 · 连不上 · 现在连着 · 2 小时前**
(the status line shortened to its first idea), then, when it is behind, **· 有更新 / · Update
available** in the highlight's ink at 700 (D213; never a dot). Never wraps; overflow ellipsizes
the name, not the state. Rows are 52 high, all equal.

## 5. The phone

Settings › 设备 (D150) lists the devices the same way (one line each); a tap pushes the card,
single column at 390: the hero at 128 (a phone's clay at 64), name 26, status, the coin row
(four fit at 70 each; more scroll sideways), chips wrapping, the connection line, the foot. The
coin's detail opens in place exactly as on the desktop. The phone's own card says **你正在用的这台**.

## 6. One language for computers × agents (D157 in the same system)

The coin row is the **one component** for "this agent on this computer" wherever it appears:
the card's loadout, the switch sheet's island strip and list, and New task's Who list. The same
coin, same grey for signed out, same dot for an update. Never under 28 points (D213): New task's
Who pill and the opened task's meta line say the agent's name alone.

### 6.1 The task card's one line (D157 §5)

**{state} · {clock} · [coin] Codex · gpt-5.5 · 在 hel 上 · 换谁来做**. The where part is ink-soft
700 with a dotted underline; hover or tap shows the reason sentence (**为什么在 hel 上：一直醒着，
合上 MacBook 也不停。**). With one computer the where part is never shown.

### 6.2 换谁 · 换哪台 (the switch sheet)

The sheet's title stays **换谁来做 / Switch who does it** (D89); its subtitle says what it now
covers: **换谁，也可以换一台电脑 / Someone else, or another computer**.

- **Desktop:** a strip of the islands (D157 §6.2) with each computer's clay and its coin row
  standing on it; the task's parcel on the island where it runs; asleep under its blanket; can't
  reach in mist. Tap a coin = pick that agent there. Under it the literal list grouped by
  computer: a group head is the device's mini card (clay 32, name, the status line); rows are
  coin · agent · model · one reason; **现在** on the current one; greyed rows with why.
- **Phone:** the list alone, the group heads the same.
- Picking a row on another computer shows the move line above Go (**从最近保存的进度接着做；分支
  会先推到 GitHub。**) and, when access widens, the accent line **会用你的 Chrome，你登录着的网站它
  都能用。**
- **只这件 / 以后这类都用** (D89) as a segmented control above Go; default **只这件**.

### 6.3 How the user's intent gets in (all existing, laid out once)

| Way | Where it is seen |
|---|---|
| Autonomy by default | the task's one line; the reason on tap |
| Words ("在 MacBook 上做", "用我的 Chrome") | the partner's ack restates the pin |
| Tap to switch | 换谁来做 with **只这件 / 以后这类都用** |
| Learned rules (two moves the same way propose one) | Settings › 伙伴 › **你的规则** lists them, each with the computer's or agent's coin and **不要这条** |
| Per-agent toggle | the coin popover's **用它做事** |
| Per-computer toggle | the card's **替 hel 做事** chip |

**It asks only** for a sign-in (D151), for widening access (the user's Chrome, D157 (7)), or when
the only computer that can is asleep and another could with a visible difference (D157 (3));
always one line with the default (**等它醒**) and the reassurance (**不回的话就等它醒，什么都不会
丢**).

## 7. Motion (ui.md tokens; reduced motion: no movement, colors still change)

| Moment | Motion |
|---|---|
| a chip toggled | press sinks 2pt (70 ms, the button press), on release a squish: scale-x 1.06 / scale-y 0.94 → 1 with `Bouncy` (240 ms); the clay object hops 3pt once when it turns on |
| an update lands on a coin | the coin pops: scale 1 → 1.16 → 1 (`Bouncy`, 420 ms) with one small wiggle (D183; D146's sheen sweep is retired), the dot shrinks to 0 (160 ms) |
| the coin's detail | enter 220 ms (6pt rise + fade, ui.md's enter) |
| ⋯ disclosure | height eases open (`Snappy`, 200 ms) |
| the name saved | the name settles from 0.98 (140 ms) |
| awake / asleep art | D77's float and blanket, unchanged; the card's art and the stage's share the phase |

Nothing animates on its own except the art (D77): the update dot never pulses.

## 8. Copy (zh + en; D78 spacing; new keys marked ★, the rest reused)

| Key | zh | en |
|---|---|---|
| ★ `card.status.home` | Ducter 住这儿 | Ducter lives here |
| ★ `card.status.this_mac` | 你正在用的这台 | The one you're using |
| `device.other.does` | 替 {home} 做事 | Does tasks for {home} |
| ★ `card.status.working_for` | 在替 {home} 做 {n} 件事 | Doing {n} tasks for {home} |
| `device.state.asleep` | 睡着了 · 醒来就接着做 | Asleep · carries on when it wakes |
| `device.unreachable.line` | 连不上 · 最后在线 {time} | Can't reach · last seen {time} |
| ★ `card.via` | 通过 {ways} 连着 | Connected through {ways} |
| ★ `card.via.app` · `.cli` · `.safari` | app · 命令行 · Safari | the app · the command line · Safari |
| ★ `card.disconnect.device` | 断开这台 {device} | Disconnect this {device} |
| ★ `coin.installed_with` | 用 npm 装的 · 用 Homebrew 装的 · 它自己装的 | installed with npm · with Homebrew · by its own installer |
| ★ `coin.shared` | 和 {device} 共用一个账号的额度 | Shares one account's limit with {device} |
| `token.use_for_tasks` | 用它做事 | Use it for tasks |
| ★ `chip.stop.ask` | {device} 上还有 {n} 件事在做。停下来，还是做完再停？ | {device} still has {n} tasks under way. Stop now, or after they finish? |
| ★ `chip.stop.after` · `chip.stop.now` | 做完再停 · 现在停 | After they finish · Stop now |
| ★ `chip.failed` · `chip.log` | 没开成 · 看日志 | Didn't start · See the log |
| ★ `switch.sub` | 换谁，也可以换一台电脑 | Someone else, or another computer |
| ★ `chip.web` · `chip.computer` · `chip.remote` · `chip.worker` | 上网 · 用电脑 · 在哪儿都能用 · 替 {home} 做事 | Browse · Use apps · From anywhere · Tasks for {home} |
| ★ `coin.socket` | 再登录一个 | Add an AI |
| ★ `coin.signin.why` | 登录以后，{device} 上的事也能交给它。 | Sign in and {device}'s tasks can go to it too. |
| ★ `list.state.*` | 住这儿 · 在做 {n} 件 · 睡着了 · 连不上 · 现在连着 | home · {n} tasks · asleep · can't reach · connected |
| ★ `rule.learned` | 你换过两次以后定的 | Set after you switched twice |
| ★ `rules.lede` | 你说过的，和你换过两次以后定下的。 | What you said, and what you settled after switching twice. |

Removed from the card (the words stay in the glossary where other surfaces use them): **它能为
你做的** and its lists, **现在连着** as a separate line on computers, **一台 Mac · 用 Ducter app
连着**, **另一台电脑**, **Ducter app 也连着 / 命令行也连着** as rows, **N 台设备共用**.

## 9. What it changes in earlier decisions (if approved)

- D148 (11): "what it is in plain words" becomes the art plus one status line; the coins carry
  no text but their names; the actions at the bottom are one 断开.
- D155 (1): the folded lines become one **通过 … 连着** line with one ⋯ that opens in place.
  D155 (2): the phone's **它能为你做的** list becomes chips (only 通知 is a choice; talking and
  answering are what any phone does, so they aren't listed). D155 (3): the switch becomes the
  first chip, its helper behind ⓘ, the log path only on failure.
- D156 (2): the version, channel and "not checked" lines move into the coin popover; the card
  shows one dot.
- D157 (4)–(5): drawn with the same coin row and the same mini card as group heads.

Mechanisms (pairing, rename, revoke, updates, rules) are unchanged.

## 10. The author's calls (decided 2026-11-10: every default taken)

1. **Status as a line, not a chip** (D73 keeps capsules out). **Default: the line.**
2. **Kind line removed**, the art says what it is (accessible name keeps it). **Default: yes.**
3. **Ability chips toggle in one tap**, asking only when something would stop. **Default: yes.**
4. **The coin's detail holds per-version facts** (版本, 装的方式, 未验证); the card shows only the
   dot. **Default: yes.**
7. **English chip labels in short forms** (Browse, Use apps, Tasks for hel, From anywhere), the
   long names kept on the stage. **Default: yes.**
5. **The version line** shows only with an update. **Default: yes** (versions live in Settings ›
   About).
6. **The switch sheet's subtitle 换谁，也可以换一台电脑** (or keep the title alone). **Default: the
   subtitle**, only when two or more computers run tasks.

## 11. Prototype review (2026-11-10, against D36 and the seven issues)

Shots in `.shots/device-card-v2/` (headless Chromium, 1340 wide, zh and en; `page-zh@2x.png`
at 2×; `full-en-still.png` is reduced motion): `before-after-*`, `page-*` (the pi detail open;
`page-zh-updated.png` after the update landed), `states-*`, `phone-*`, `where-*`, `full-*`.

The seven issues, checked on the shots:

| # | After | Holds? |
|---|---|---|
| 1 | Default card: name, one status line, coin names, chip labels, the connection line, Disconnect: five lines of text. No path, no paragraph, "not checked" once and only inside pi's or Claude Code's detail | yes |
| 2 | Four clear levels: clay 150, name 28/26, status 15, then the tray and chips | yes |
| 3 | The kind line is gone; the status line says one thing (在替 hel 做 2 件事) | yes |
| 4 | ⋯ and the coin's detail both open in place; one 断开这台 MacBook at the foot | yes |
| 5 | Each agent is one coin; the update is one dot | yes |
| 6 | **和 hel 共用一个账号的额度** in Codex's detail | yes, but it is still a sentence about limits a fresh user won't need: it only appears when the same account is signed in on two computers |
| 7 | One line per device, one word of state | yes (zh and en) |

Against the north star:

- **好用:** the common question (is it up to date, is it working) is one glance; every action is
  one tap on the thing it is about. The hel card from another device has no Sign out (right),
  but also no hint where to manage hel's sign-ins; the build should keep D148's "on that device"
  line inside the coin's detail.
- **顺滑:** in-place openings keep the eye in one column; nothing overlaps. In English three chips
  wrap two-and-one even with short labels; it reads fine centered, but a fourth chip would push
  the card past the window's height on a 13" Mac. Watch it.
- **赏心悦目:** the hero clay is what makes it feel like a character; the asleep laptop under its
  blanket and the grey unreachable one are the strongest moments. The coins at 52 on the sunken
  tray read as a loadout without slots. The "替 hel 做事" chip borrows hel's server clay at 30; it
  reads as "for hel" but is the weakest icon (owed: a small parcel-on-a-bridge object, or keep
  hel's clay).
- **放心:** nothing red unless something failed; "not checked" is said quietly and once; turning
  off a computer with tasks running asks with a safe default.
- **惊喜:** the update pop with its wiggle and the chip squish are small and earned. The
  prototype's stage on the Devices page is a stub (flat bridges, static coins); the built stage
  stays D81's.

Not shown, owed: the rename moment at full size, Pebble dark on the phone, a device with five or
more agents (the tray scrolling), and the human comprehension check of the chips without labels
in ⓘ.

## 12. As built (2026-11-10)

Built on the Mac (`apps/desktop/internal/views/devicecard.go`, the left list in `abilities.go`, the
switch sheet in `loadout.go`, copy in `i18n/devicecard.go`) and the phone
(`apps/web/src/devcard.tsx`, words in `sheet.ts`, shared controls in `controls.tsx`). Tested with
the mock main and offscreen testers (Mac: `TestCharacterSheet`, the updated D148/D155/D156 view
tests; phone: `test/sheet.test.ts`), and against a demo core for the phone
(`apps/web/demo-devices.ts`, driven headless). Shots in `.shots/device-card-built/` (outside git,
D75): Mac `mac-*-{zh,en}.png` at 1100×720 and 1280×860, phone `phone-*-{zh,en}.png` at 390.

**The shared-controls rule** came with the approval (the author: "这种事情要杜绝"): every control on
a card or a settings page is one of the set in `design/ui.md` "Shared controls"; a test on each
client fails otherwise. Settings › About's version rows (D167, built on main the same day) are
shared pieces too: 现在检查 sits in the home's row there. On the phone, with the card's version
line gone when current, **已经是最新的 · {t}查过 · 现在检查** stands once under the device list.

What differs from the prototype, and why:

| Prototype | Built | Why |
|---|---|---|
| The card at 380 beside a 250 list at every width | 380 always; under a 1360 window the list is 226 and the gutters 24; under 1180 the list goes on top as one row; under 1040 the card goes under the stage | the stage's scene needs about 600 points or its words overlap (`TestIslesScenes`) |
| ⓘ appears inside the chip on hover | ⓘ sits on the chip's top-right corner, shown on hover (always on touch) | nothing moves on hover; a chip that grew on hover could re-wrap the row under the pointer |
| **和 hel 共用一个账号的额度** whenever the same agent is signed in elsewhere | only when the home says the account is shared (`allowance.sharedBy` > 1), naming the other devices | "signed in elsewhere" is not "the same account"; the line must not guess |
| 上网's Try it and signed-in sites | in 上网's ⓘ note (Ducter's own browser) | the card shows no paragraphs by default; the sites stay one tap away |
| The socket **再登录一个** opens a sign-in | its detail lists the agents not on that device; on the Mac Ducter runs on each installs from there (the existing account sheet), elsewhere it says to do it on that device | sign-ins never copy between computers (D157 (7)) |
| The phone's iPhone card with a 通知 chip | only on the phone's own card (the web client knows its own notifications, not another phone's); the Mac's card for a phone has no chips | the Mac can't see a phone's notification state |
| Learned rules on Settings › 伙伴 with **你换过两次以后定的** | not built in this step | todo |
| Coins at 52 printed with their names | the coin at 52, the agent's mark in clay (D183) | a sculpted mark reads at every size; the name is under the coin anyway |
| The socket **再登录一个** on every tray | only when an agent isn't on that device yet | an always-there socket that opens nothing new is noise |
| MacBook's 上网 off as a flat chip | off and can be added is the dashed **+ 上网**; flat grey is "can't now" (asleep, unavailable), a tap says why | one look per meaning: dashed = one tap adds it, flat = it can't be added right now |
| (not in the prototype) | **合上之前搬走** under a working laptop's status line | D157 (6), kept |
| The coin detail | also keeps a slot for more per-agent lines (the next is the memory line, from another branch) | — |
