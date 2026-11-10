# Where a task runs: picking the computer, saying it, changing it

> 2026-11-10 · **Decided (D157): the author took every default in §14.** Build status: §16. Evidence:
> `research/43`. Prototype: `design/prototypes/where.html` (open it from the repo so the clay
> art loads; shots in `.shots/where/`, outside git, D75). Builds on D89 and D128 (who does it),
> D130 and D151 (the two browsers), D152 (the meta line), D155 (one tap makes a Mac do tasks for
> a home elsewhere), E3 and A3 (moving, sleeping).

The author asked: "AI 涉及到选择不同的环境和 harness 这部分我们设计有了么，优雅高标准顺滑自然么？"
Choosing **who** does a task is designed and mostly built. Choosing **where** is not: the
partner names a device or the task runs on the home, New task infers the device, and a worker
can't run browser tasks at all (research/43 §2). This note designs where, and how it joins who.

Labels: **VERIFIED** (code or a vendor page read this session), **DOCUMENTED** (another design
note says so), **INFERRED** (my judgment).

**Words.** "Computer" here is the glossary's 设备 that runs tasks: the home, or another
computer doing tasks for it (D84). Phones reach Ducter but never run tasks. In copy the
computer is always called by its name ("hel", "MacBook"), never 机器 / machine (glossary).
This note is not Settings › 在哪儿运行 / Where it runs (D150), which is where *Ducter itself*
lives.

## 1. The author's setup, and five real moments

hel: a Linux server and Ducter's home; Codex signed in; Ducter's own browser (D151); no Mac
apps; never sleeps. MacBook: Claude Code (and Codex); the user's Chrome, signed in to their
sites; Keynote and other Mac apps; local repos; sleeps when the lid closes on battery; does
tasks for hel after one tap, **让这台 Mac 也替 hel 做事** (D155). Phones: clients. D155 keeps browser
and computer use on such a Mac "the home's only (roadmap)": this note is that roadmap item's
design.

| # | Moment | What should happen |
|---|---|---|
| W1 | "帮我查一下 HN 今天关于 OAR 的讨论" (public pages) | Runs on hel in Ducter's own browser at once. No question. Line: **在 hel 上 · 用 Ducter 自己的浏览器** |
| W2 | "看看我淘宝上那单到哪了" (needs the user's sign-in) while the MacBook is awake | Runs on the MacBook in a window of the user's Chrome. No question; the line says **在 MacBook 上 · 用你的 Chrome** |
| W2b | The same while the MacBook sleeps | One line with a default: **MacBook 睡着了。等它醒了用你的 Chrome 查（默认），还是现在在 hel 上查？hel 那边没登录淘宝，得你登一下。** |
| W3 | "把这份周报做成 Keynote" while the MacBook sleeps | No alternative exists, so no question: it waits, said once in the partner's ack: **得用 MacBook 上的 Keynote，它醒了我就开始。** The task shows **在等 · MacBook 睡着了** |
| W4 | "修一下 ducter 的 CI" (the repo is on both) | Runs where it can start now and keep going: hel. If the user just said "我刚改的那些" (a read-only task about uncommitted work), it reads the MacBook's checkout, because only there do those changes exist |
| W5 | "用 Claude Code 重构这个" (Claude Code is only on the MacBook) | The pin decides the computer: MacBook. The line says **在 MacBook 上 · Claude Code，是你选的** |
| W6 | A two-hour translation starts, then "我要合电脑了" | It never needed to move: a long task starts on the computer that doesn't sleep (hel). If one is on the MacBook, the partner moves what can move in one decision and names what can't |

## 2. The three people (AGENTS.md "User first")

| | Heavy multi-agent developer (the author) | Consumer personal-AI user | Fresh user |
|---|---|---|---|
| **Who, in this moment** | A server home, a MacBook worker, repos on both, Claude Code only on the Mac, a phone. Starts five tasks an evening, some from New task | One Mac at home, plus (later) a small server the partner suggested so it stays up; one AI subscription; uses Ducter for errands on signed-in sites and for Keynote | One computer. Has never heard of a worker |
| **Before** | "Did it run on the Mac or hel? Will it die when I close the lid? Did it use my Chrome, where I'm signed in to the bank?" Today the answer is in a log, or found by failure (research/43: Cursor's silent cloud default) | "Can it do this while my laptop is off?" and "Is it logging in as me?" | Nothing. Any mention of "which computer" would be a concept to learn |
| **After** | 放心: every task says where in three words; the pick matches what they would have done; one tap moves it, with the cost said. 惊喜: closing the lid doesn't stop the work, because long work was never on the lid | 好用: errands that need their sign-ins just happen in their Chrome; when the Mac sleeps, one plain question with a sensible default. 放心: it never quietly uses their Chrome when it didn't need to | 顺滑: nothing changes. No device word appears anywhere until a second computer exists |
| **How it starts** | The moment they turn on D155's **让这台 Mac 也替 hel 做事**, the switch's confirmation line adds **以后每件事会写明在哪台电脑上做。** From then on the meta line shows **在 hel 上** on every task | The first errand that needs a sign-in, or the first time the Mac sleeps with a task that needs it. The question is the lesson | Never; or the day they add a second computer, as for the developer |

**North star check** (INFERRED, to be judged on the prototype): 好用, the default is right and
needs no choice in W1, W2, W4, W5; 顺滑, one quiet line, no new place, no new picker in the
common case; 赏心悦目, the islands the user already knows, a parcel that lands and travels; 放心,
whose sign-ins act is always said, access never widens without them; 惊喜, the closed laptop
that doesn't matter (W6), the agent coin that brings its computer along (§6.2).

## 3. First principles: what about "where" does a person feel?

Strip away the machinery and a person feels three things about where a task runs (INFERRED,
checked against research/43 §1):

1. **Whose sign-ins act.** In the user's Chrome the task can do anything they are signed in
   to; in Ducter's own browser it can only use what they signed in to there. This is the
   identity question, and the only one that is about trust.
2. **When it can start, and whether it keeps going.** A sleeping computer means waiting; a
   laptop means the work stops when the lid closes.
3. **What it can reach.** A folder, a checkout with uncommitted work, Keynote. Only one
   computer may have it.

Everything else (CPU, which of two equal checkouts, cache warmth, how the bytes travel) is
invisible to them and is Ducter's to decide, silently. So:

- **Decide silently** when the candidates differ only in invisible ways.
- **Say where, always,** once there is more than one computer: three words, never a question.
- **Ask** only when the choice changes whose sign-ins act, or trades "now" for "wait".
- **Never widen access without the person**: the least access that does the job wins a tie.

**Where is part of who.** Principle 14 already lists "machine availability" and
"environment needs" among the hard filters of choosing a body; the code ranks agents on one
device (research/43 §2). The body is really **(computer, agent, model)**. One ranking over
those pairs, one pick, one reason. No second picker, no second mechanism.

## 4. The mechanism

### 4.1 What the task needs (from the partner, or from the New task card)

| Need | How it's known | Hard or soft |
|---|---|---|
| **A place**: a repo, a folder | the place, as today | hard: the folder's computer; a repo's computers, or one that can clone it (C1's ask, once per repo) |
| **Browse** | the partner's judgment from the words (a URL, "查一下网上") | hard: 上网 on that computer |
| **Browse as you** (sites you're signed in to) | the partner's judgment ("我的订单", "我的 Gmail 网页版", a site with no public view); names the site when it can | hard: the user's Chrome on that computer through a native driver (D130), **or** Ducter's own browser already signed in to that site there (Signed-in sites, D151) |
| **A Mac app** (Keynote, Xcode, Figma) | the words name it | hard: a Mac with 用电脑 on; the app's presence is asked of that Mac when needed, never listed in advance |
| **A specific agent** | a pin (yours or the partner's) or a rule | hard: installed and signed in there (as today) |
| **Long or ongoing** (a long job, a keep-going loop, a routine, a wait) | the partner's estimate, or the task's kind (D112–D114) | soft: prefer a computer that doesn't sleep |
| **Continuity** (a follow-up, a resumed task; a read-only look at uncommitted work) | the task's history; the place | soft: prefer where its worktree, session or the dirty checkout is |

The partner passes needs, not a computer name (`task_open {needs}`); "在 MacBook 上做" from the
user is still a pin by name. This replaces today's "place.device = its name" (research/43 §2).

### 4.2 What each computer can do (already known to Devices)

From the devices frame (`DeviceView`): kind, home, state (醒着 / 睡着了 / 连不上), its agents and
whether they're signed in, abilities (上网 with `where: chrome | ducter`, 用电脑), plus two facts to
add: **doesn't sleep** (a server; a Mac on power with the power assertion, A3) and **Signed-in
sites** for Ducter's own browser on it (D151 already lists them on the home). Nothing new is
asked of the user: every fact comes from a computer's hello or its ability state.

### 4.3 One ranking over (computer × agent)

`fw_candidates` takes every computer that runs tasks, not one device's harnesses. For each
(computer, agent, model):

1. **Hard filters**: the needs in §4.1; the agent's existing filters (installed, signed in,
   Use it for tasks, the partner's reserve). A failed filter keeps the row, greyed, with why.
2. **Can it start now?** A computer that is asleep or can't be reached keeps its rows, marked
   **waits**, ranked under every row that can start now.
3. **The person's word**: your pin, then the most specific rule (a rule may name a computer:
   "要登录的网页都用我 Mac 上的 Chrome"), then Ducter's default. As principle 14; a pin of an agent
   that lives on one computer pins that computer too.
4. **Least access that does the job**: among rows that meet the needs, Ducter's own browser
   over the user's Chrome; a computer with only the site's sign-in over one with all of them.
5. **Keeps going**: for long or ongoing work, a computer that doesn't sleep.
6. **Continuity**: where the task's worktree, session or the user's uncommitted work is; where
   the repo already is over one that must clone it.
7. **The agent's own rank**, as today (rule, tier, plan before pay-per-use, the limit when
   reported, D133).
8. **The home before another computer** (one hop fewer), as a last tie-break.

The pick is the top row. Its **one reason** is the highest step above that set it apart from the
best row on another computer, in plain words (§8): **一直醒着，合上 MacBook 也不停** · **要用你登录着的淘宝**
· **只有 MacBook 有 Keynote** · **MacBook 睡着了，hel 醒着** · **改动在 MacBook 上** · **Claude Code 只在 MacBook 上，是你选的**.
When only one computer exists the reason is the agent's, exactly as today.

The partner may override the ranking with a reason, as today (principle 14).

### 4.4 When it asks (and when it never does)

| Situation | Ask? | What happens |
|---|---|---|
| Two computers can both start it, differences invisible (W1, W4) | never | the top row; the line says where |
| The only computer that meets the needs is asleep, and **no** other computer could do it (W3) | never | it waits (`queued`, **在等 · MacBook 睡着了**), said once in the ack; **叫醒它 / Wake it** only where a wake path exists (A3) |
| The best computer sleeps, another could do it **with a visible difference**: other sign-ins, or the user must sign in there (W2b) | **one line, default wait** | **等它醒（默认）** · **现在在 hel 上做**; not answering waits; no countdown (waiting is free, A3) |
| The other computer would **widen** access (your Chrome instead of Ducter's browser; a computer signed in as you) | **always** | never automatic, never by a rule-free fallback |
| Your own pick can't run (the agent's computer can't be reached) | one line | **Claude Code 只在 MacBook 上，它现在连不上。等它，还是换个来做？** (D128's "never moves silently") |
| The repo isn't on the only awake computer | C1's clone ask, once per repo | — |
| The picked computer drops before the task started | never | re-picked by the same ranking; the line says why (**MacBook 连不上，换到 hel 上了**) |
| The picked computer drops while it works | A3 | wait by default; one decision per computer when it matters |

Every ask has a default and fits in one line. Quiet hours: never pushed (A3).

## 5. Saying where

**The rule:** with one computer, never. With two or more, **always, on every task**, because a
phone has no "this machine" and because the Cursor complaint (research/43) is exactly a place
nobody said. This amends D152 (2), which says the device only "when it isn't this machine".

| Surface | What it says |
|---|---|
| The opened task's meta line (D152) | {state} · {clock} · {agent coin} {agent} · {model} · **在 hel 上** (repo: **ducter · main · 在 hel 上**) · **用你的 Chrome** / **用 Ducter 自己的浏览器** / **用 Keynote** when that is the point · **换谁来做** |
| On hand | unchanged when it runs; a waiting row says why (**在等 · MacBook 睡着了**, built) |
| The conversation | nothing extra in the task line when the pick is plain (D104 quiet conversation); the ack says where only when it waits or uses the user's Chrome ("我用你 Mac 上的 Chrome 看一下。") |
| The Devices stage | the parcel on the bridge to that computer while it works (D81, built), now also landing at start and travelling on a move (§9) |

The hover (desktop) or a tap on the where part (phone) shows the reason in one sentence: **为什么在
hel 上：一直醒着，合上 MacBook 也不停。**

## 6. Changing it

### 6.1 In words

"在 Mac 上做" · "换到 hel 上" · "用我的 Chrome" are pins, restated in the ack. After two
moves in the same direction, the existing rule proposal: **以后要登录的网页都在 MacBook 上做？**

### 6.2 The switch sheet: who and where together

The action stays **换谁来做 / Switch who does it** (D89, D152). With one computer the sheet is
today's. With two or more:

- **Top: a strip of the islands.** The computers that run tasks, as on the Devices stage, small:
  home in the middle, each island's agent coins standing on it, a sleeping one under its
  blanket, one that can't be reached in mist. The task's parcel sits on the island where it
  runs. Tapping a coin picks that agent there. This is the Devices vocabulary the user already
  knows; a coin on an island already means "this agent, signed in on this computer" (D81).
- **Below: the literal list** (the accessible layer, and the whole sheet on a narrow phone):
  grouped by computer, a header **hel · 醒着 · 一直醒着**, then its rows: coin, agent · model,
  one reason; **现在 / Now** on the current row; rows that can't with why, greyed (**要用你的
  Chrome，hel 上没有** · **要用 Keynote，这台没有** · **睡着了 · 醒了再做**).
- **Picking a row on another computer** shows what moving does, in one line above Go:
  **从最近保存的进度接着做；分支会先推到 GitHub。** If it widens access, a second line:
  **会用你的 Chrome，你登录着的网站它都能用。** Go reads **换到 MacBook 上接着做**.
- **只这件 / 以后这类都用** stays (pin or rule), now able to name a computer.

### 6.3 New task: the machine appears only when there's a choice

The card keeps its three rows (D128, D144). The Where row's chips gain a **computer part**, like
the branch part, only when the choice is real:

- a repo on two computers: **ducter · main · hel ▾**;
- **不用文件夹 · hel ▾** when two or more computers run tasks;
- a repo or folder on one computer: no computer part (it can only run there).

The computer part opens **在哪台电脑上做 / On which computer**: one row per computer with its
picture (`server_awake`, `laptop_asleep`…), its name, what sets it apart in a few words
(**一直醒着** · **有你的 Chrome 和 Mac 应用**) and its state; the default marked **推荐 / Suggested**
(the ranking for "no particular need": can start now, doesn't sleep, the home first). A computer
that can't be reached is greyed.

The Who row lists the agents on the chosen computer, then agents that live **only on another
computer**, their coins quieter, tagged **在 MacBook 上 / on MacBook**. Picking one moves the
computer part with it (the chip's text slides to **MacBook**): one combined pick. If that
computer is asleep, the chip says **睡着了 · 醒了就开始** and Start still works (the task waits).

New task never parses the words for needs (it is the power path, words unchanged, D128); the
user who wants their Chrome picks the MacBook.

## 7. Moving (E3, reconciled)

E3's mechanics stand: a successor continues from the last checkpoint; a repo moves only through
its pushed branch; uncommitted work never moves. What this note adds:

1. **Targets come from the same ranking**, with the task's needs. A folder task, a task that
   needs a Mac app, or one that needs the user's Chrome can't move to hel; the sheet greys hel
   with why, so the person never picks a move that would fail.
2. **"我要合电脑了"** (the user says it, or taps **合上之前搬走 / Move before closing** on the
   MacBook's island card): one decision for the whole computer, default **move**, because the
   user stated the intent: **合上之前：「修 CI」「英译」搬到 hel 上接着做；「做 Keynote」只能在
   MacBook 上做，醒了接着。** Go moves the movable ones; nothing that would widen access moves.
3. **The lid closes with no warning**: A3 as written (wait by default, one decision per
   computer when it matters).
4. **Prevention beats moving**: long or ongoing work starts on a computer that doesn't sleep
   (§4.3 step 5), so W6 rarely needs a move at all. This is the 惊喜.
5. **Never toward more access without the person**: a move to the user's Chrome or a computer
   signed in as them always comes from their tap or their Go.

## 8. Copy (zh + en, from the glossary; D78 spacing: a space where Han meets Latin or a digit)

| Key | zh | en |
|---|---|---|
| `where.on` | 在 {device} 上 | on {device} |
| `where.your_chrome` | 用你的 Chrome | in your Chrome |
| `where.ducter_browser` | 用 Ducter 自己的浏览器 | in Ducter's own browser |
| `where.app` | 用 {app} | in {app} |
| `where.why` | 为什么在 {device} 上：{reason} | Why {device}: {reason} |
| `where.reason.always_on` | 一直醒着，合上 {laptop} 也不停 | Always awake; keeps going when {laptop} closes |
| `where.reason.signed_in` | 要用你登录着的 {site} | Needs your signed-in {site} |
| `where.reason.only_here` | 只有 {device} 有 {thing} | Only {device} has {thing} |
| `where.reason.awake` | {other} 睡着了，{device} 醒着 | {other} is asleep; {device} is awake |
| `where.reason.changes_here` | 改动在 {device} 上 | The changes are on {device} |
| `where.reason.agent_here` | {agent} 只在 {device} 上 | {agent} is only on {device} |
| `where.reason.moved` | {other} 连不上，换到 {device} 上了 | {other} couldn't be reached, so it's on {device} |
| `where.ask.asleep` | {device} 睡着了。等它醒了用你的 Chrome 做，还是现在在 {other} 上做？ | {device} is asleep. Wait and use your Chrome there, or do it on {other} now? |
| `where.ask.asleep.signin` | {other} 那边没登录 {site}，得你登一下。 | {other} isn't signed in to {site}; you'd sign in there. |
| `where.ask.wait` | 等它醒 | Wait for it |
| `where.ask.now` | 现在在 {other} 上做 | Do it on {other} now |
| `where.ask.default` | 不回的话就等它醒，什么都不会丢 | If you don't answer, it waits. Nothing is lost |
| `where.waits.only` | 得用 {device} 上的 {thing}，它醒了我就开始。 | This needs {thing} on {device}. I'll start when it wakes. |
| `where.pin_blocked` | {agent} 只在 {device} 上，它现在连不上。等它，还是换个来做？ | {agent} is only on {device}, and it can't be reached. Wait, or have someone else do it? |
| `where.first_line` | 以后每件事会写明在哪台电脑上做。 | From now on, every task says which computer it's on. |
| `newtask.computer` | 在哪台电脑上做 | On which computer |
| `newtask.computer.always_on` | 一直醒着 | Always awake |
| `newtask.computer.chrome_apps` | 有你的 Chrome 和 Mac 应用 | Has your Chrome and Mac apps |
| `newtask.computer.asleep` | 睡着了 · 醒了就开始 | Asleep · starts when it wakes |
| `newtask.agent.elsewhere` | 在 {device} 上 | on {device} |
| `switch.computer.head` | {device} · {state} | {device} · {state} |
| `switch.cant.chrome` | 要用你的 Chrome，{device} 上没有 | Needs your Chrome; not on {device} |
| `switch.cant.app` | 要用 {app}，这台没有 | Needs {app}; not on this one |
| `switch.cant.folder` | 文件夹在 {device} 上，搬不走 | The folder is on {device}; it can't move |
| `switch.move.explain` | 从最近保存的进度接着做；分支会先推到 {remote}。 | Continues from its last saved progress; the branch is pushed to {remote} first. |
| `switch.move.widens` | 会用你的 Chrome，你登录着的网站它都能用。 | It will use your Chrome, with every site you're signed in to. |
| `switch.move.go` | 换到 {device} 上接着做 | Continue on {device} |
| `move.closing.button` | 合上之前搬走 | Move before closing |
| `move.closing.line` | 合上之前：{moved} 搬到 {dst} 上接着做；{stay} 只能在 {src} 上做，醒了接着。 | Before you close it: {moved} move to {dst} and carry on; {stay} can only run on {src} and continue when it wakes. |
| `rule.where.restate` | 规则：{kind} 都在 {device} 上做。对吗？ | Rule: {kind} runs on {device}. Right? |

Existing keys reused unchanged: **睡着了 / Asleep**, **连不上 / Can't reach**, **叫醒它 / Wake it**,
**在等 · {device} 睡着了**, **换谁来做**, **现在 / Now**, **推荐 / Suggested**, **只这件 / 以后这类都用**,
**搬到 {dst} 上接着做了** (E3 `move.done`), D151's sign-in card.

## 9. Motion: the parcel on the islands

No new thing is drawn. The Devices stage (D81) already says "parcels crossing a bridge = a task
running on that computer now", "bridges only from home", "asleep under its blanket", "can't
reach in mist". Where adds three moments to the parcel:

| Moment | Motion | Reduced motion |
|---|---|---|
| **Lands** (a task starts on a computer) | a parcel with the task's short title on a clay tag leaves home's grass, crosses that bridge (0.9 s, ease-out), lands with the equip's squash (1.08 × 0.94, 120 ms) and a soft tock; the tag fades after 1.2 s; then the usual steady crossing (40 pt/s) while it works. A task on the home drops onto home's grass beside Ducter (a 0.4 s hop) | the parcel appears on the island; the tag shows 1.2 s |
| **Waits** (its computer sleeps) | the parcel stays at the home end of that bridge, still, its tag **在等**; the island breathes under its blanket. It hasn't gone there yet, and the picture says so | same, still |
| **Moves** | the parcel lifts off the old island, crosses back to home (0.7 s), rests 150 ms beside Ducter (the hand-over), crosses the other bridge (0.7 s), lands with the squash; the old bridge's flow stops | the parcel fades out on one island and in on the other (200 ms); the tag says **搬到 hel 上了** |

Routing a move **through home** is literal: there are no bridges between islands, the work
goes home and out again (the branch through the remote, the brief through the home). A direct
arc across the water would say the computers talk to each other, and that sign-ins or files go
along (false).

**The same strip in the switch sheet** (§6.2) plays Lands and Moves at the sheet's scale.

## 10. Visual vocabulary: reused, nothing new

AGENTS.md's metaphor process applies to a new visual concept. This note introduces none: the
islands, bridges, parcels, coins on islands, blanket and mist are D81's (research/33's 96
rater calls), and the coins are D146's. Two new *states* of existing things: a parcel carries
its task's title on a clay tag for a moment (words on tags is ui.md's rule for the stage), and
a parcel waits at the home end of a bridge. Considered and rejected: a new "task pebble" token
(E3 and A3's older wording, from before the Isles): it would collide with the Pebble theme and
the partner's pebble face, and its "skip in an arc" from island to island implies a direct
path that doesn't exist. E3 and A3's motion lines now point here. Owed: the human comprehension
test of the stage (D81's open item) should include one Lands and one Moves clip (todo).

## 11. Failure and offline

| What | Shown | Then |
|---|---|---|
| The only computer that can do it is asleep | **在等 · MacBook 睡着了**, parcel waiting at the bridge | starts on wake, no push (A3) |
| It can't be reached past 2 min | **在等 · MacBook 连不上**, mist | A3: one decision per computer when it matters |
| The agent was signed out there since | greyed in the sheet: **没登录** | re-ranked at start; your pin asks (`where.pin_blocked`) |
| Ducter on that computer is too old for browser or app tasks | greyed: **{device} 上的 Ducter 旧了，更新一下就能用** with **更新** (D148) | — |
| The site needs a sign-in in Ducter's own browser | D151's card **需要你登录一下 {site}** | the user signs in themselves; the agent is blind meanwhile |
| A move can't push the branch | E3 `move.need_push` | ask |
| Nobody can do it anywhere | **现在没有 AI agent 能接这件事。** (D128) | the reason per computer in the sheet |

## 12. Safety

1. **A worker never reads the conversation.** It receives the brief (the user's words, the
   decisions, scope) and read tools scoped to its own task through the home's `/mcp`
   (system.md "Placement"; D155 (3): a worker reaches only `/worker` and `/mcp`, never the
   conversation). The Log, the partner and Mem stay on the home. Unchanged, now said plainly
   because more tasks will run on the Mac worker.
2. **Sign-ins stay on their computer.** No browser profile, cookie or harness login is ever
   copied between computers (research/25, research/29). A task that needs the user's sign-ins
   runs where they are, or the user signs in again there themselves (D151).
3. **Never widen access silently.** Picking or moving toward the user's Chrome, or a computer
   signed in as them, needs their pick, their rule or their Go. A tie goes to the least access.
4. **The user's Chrome is used in a window of its own** (D130 (4)), and D62's Go for submitting,
   posting, booking and paying holds everywhere.
5. **Uncommitted work never moves** except through the branch (E3).
6. **Honest isolation** (principle 18): the where line says **用你的 Chrome** whenever it is the
   user's signed-in browser.

## 13. What to build (draft; steps and triggers in `todo.md`)

1. Lift "browser places run on this machine only" for workers (`runner.ts:924`; D155 (3) keeps
   it on the roadmap): a worker's 上网 reports `where: chrome | ducter` like the home's. **First**,
   since a MacBook switched on by D155 otherwise loses "your Chrome" for every task.
2. Devices frame: `alwaysOn`, and a worker's Signed-in sites.
3. `fw_candidates` over (computer × agent); `Candidate.device`, `waits`; `BodyWhy.where`.
4. `task_open {needs}`; the partner's `[devices]` line gains abilities and sleep; persona rule:
   pass needs, name a computer only when the user did.
5. Meta line "在 {device} 上" whenever two or more computers run tasks (both clients).
6. The switch sheet's island strip and grouped list; New task's computer part.
7. Queue a task for a sleeping worker instead of refusing it (system.md "Not yet").
8. "Move before closing", the move hop on the stage.

## 14. The author's calls (decided 2026-11-10: every default taken)

The author's answer: "按建议，第一性原理把事情都做好，给用户最优雅体验和情绪价值". Each default below
is now the rule, and the rest of this note already follows it.

1. **Public browsing when both are awake:** Ducter's own browser on hel (least access, and it
   never types into the user's windows, research/38 B2) or the MacBook through Codex's native
   tools (D130's "make the most of Codex")? **Default: hel's own browser**; the user's Chrome only
   when the task needs their sign-ins. D130 stays the rule *within* a computer.
2. **Saying where:** on every task once there are two computers, or only when it isn't the home?
   **Default: every task.**
3. **"我要合电脑了":** default **move** (the user stated the intent) or **ask**? **Default: one
   decision, default move**, moving only what doesn't widen access.
4. **New task:** a computer part on the chip (this note) or a fourth row? **Default: the chip part**,
   shown only when the choice is real.
5. **Long work prefers a computer that doesn't sleep**, even when a laptop is awake and would be
   faster to start? **Default: yes.**
6. **The island strip in the switch sheet** (§6.2): it makes "where" something you see and tap,
   at the cost of about 270 px of sheet. Or the grouped list alone, islands only on Devices?
   **Default: the strip on the desktop when two or more computers run tasks; the list alone on
   the phone.**

## 15. Prototype review (2026-11-10, against the north star)

Shots in `.shots/where/` (full pages zh/en at 1×, zh at 2×, `isles-sequence.png` for Lands and
Moves, the switch sheet with a MacBook row picked, New task with the computer list open).

- **好用:** the common cases (W1, W2, W4) need no choice; the New task card for one computer is
  identical to today's. Good.
- **顺滑:** one line on the task; the coin that brings its computer along reads naturally. The
  English chips wrap to a second line on the 540 px card (`No folder · hel` alone); the real card
  is wider. Watch it in the build.
- **赏心悦目:** the islands are the real clay; the prototype's bridges are flat SVG planks, not
  the stage's clay bridges, and the parcel is small at the sheet's scale (about 13 px). The build
  should draw the parcel at the stage's own size and let the title tag carry the moment.
- **放心:** the widen line ("会用你的 Chrome，你登录着的网站它都能用。") is the most important
  sentence on the page and reads clearly in the accent ink. The ask's default line under the
  buttons is quiet enough.
- **惊喜:** the move that goes home and out again reads as one continuous hop; the "never needed
  to move" moment (W6) is only told, not shown. A later prototype pass could show the lid closing
  over a stage where nothing stops.

