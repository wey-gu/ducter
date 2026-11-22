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
| W1 | "帮我查一下 HN 今天关于 OAR 的讨论" (public pages) | Runs on hel in Ducter's own browser at once. No question. Line: **在 hel 上 · 用 Ducter 自己的浏览器**. A task: a page to read and sum up. The partner has no web tools of its own (D378); only ONE live fact (the weather, a version) is a quick web look with no task (D380) |
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
| **How it starts** | The moment they turn on D155's **让这台 Mac 也替 hel 做事**, the switch's confirmation line adds **以后每个任务都会写明在哪台电脑上做。** From then on the meta line shows **在 hel 上** on every task | The first errand that needs a sign-in, or the first time the Mac sleeps with a task that needs it. The question is the lesson | Never; or the day they add a second computer, as for the developer |

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

**The person's word binds (D476).** When the person says where in words (只在 hel 上, 用 hel 上的
agy 而不是 mac 上的, not on my Mac), Ducter reads it by code (`core/src/bound.ts`; a computer by its
name, the home's host name, or its kind when only one fits) and keeps it on the task. The
ranking never picks a computer they ruled out, the repository resolver never asks one or falls
back to its copy when they said only, task_open refuses a place on one, and Ducter's own mends
never move the work off the one they named. Only their own tap or words change it.

### 4.4 When it asks (and when it never does)

| Situation | Ask? | What happens |
|---|---|---|
| Two computers can both start it, differences invisible (W1, W4) | never | the top row; the line says where |
| The only computer that meets the needs is asleep, and **no** other computer could do it (W3) | never | it waits (`queued`, **在等 · MacBook 睡着了**), said once in the ack; **叫醒它 / Wake it** only where a wake path exists (A3) |
| The best computer sleeps, another could do it **with a visible difference**: other sign-ins, or the user must sign in there (W2b) | **one line, default wait** | **等它醒（默认）** · **现在在 hel 上做**; not answering waits; no countdown (waiting is free, A3) |
| The other computer would **widen** access (your Chrome instead of Ducter's browser; a computer signed in as you) | **always** | never automatic, never by a rule-free fallback |
| Your own pick can't run (the agent's computer can't be reached) | one line | **Claude Code 只在 MacBook 上，它现在连不上。等它，还是换个来做？** (D128's "never moves silently") |
| The computer you named has no agent that can take it (a lent server with none signed in) | one line | no task opens; the partner says so and offers to sign one in there or do it elsewhere (D353) |
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
| The opened task's meta line (D152) | {state} · {clock} · {agent} · {model} (no coin, D213) · **在 hel 上** (repo: **ducter · main · 在 hel 上**) · **用你的 Chrome** / **用 Ducter 自己的浏览器** / **用 Keynote** when that is the point · **换谁来做** |
| On hand | unchanged when it runs; a waiting row says why (**在等 · MacBook 睡着了**, built) |
| The conversation | nothing extra in the task line when the pick is plain (D104 quiet conversation); the ack says where only when it waits or uses the user's Chrome ("我用你 Mac 上的 Chrome 看一下。") |
| The Devices stage | the parcel on the bridge to that computer while it works (D81, built), now also landing at start and travelling on a move (§9) |

The hover (desktop) or a tap on the where part (phone) shows the reason in one sentence: **为什么在
hel 上：一直醒着，合上 MacBook 也不停。**

## 6. Changing it

### 6.1 In words

"在 Mac 上做" · "换到 hel 上" · "用我的 Chrome" are pins, restated in the ack. After two
moves in the same direction, the existing rule proposal: **以后要登录的网页都在 MacBook 上做？**

D376: a task already going moves the same way. A follow-up that names a computer, or asks for the
person's own account ("用我的携程账号") while another computer browses in their Chrome and this
one doesn't, moves the task there first (the partner's `task_switch` with `device`; the brief,
checkpoints and last report go with it), then gets the follow-up, under one line naming the
action and where: **我到你 MacBook 的 Chrome 上用携程比一下价格，顺便看机票。** Code asks the
partner back once when the words want the account and the task's computer lacks it. A code task
moves only after the person's go (its branch is pushed); a folder never.

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
- **只这个 / 以后这类都用** stays (pin or rule), now able to name a computer.

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

The Who row lists the agents that can on the chosen computer, then each agent that can't there
but can **on another computer**, tagged **在 MacBook 上 / on MacBook** (D202: also when the folder is
on the chosen computer; an agent greyed here because it isn't installed gives way to the same agent
there). Picking one moves the computer part with it (the chip's text slides to **MacBook**): one
combined pick. For a folder (D202) it moves the folder: to the same repo's copy on that computer
(same origin; neither knowing one, the exact folder name; D204: among the projects in that
computer's Ducter folder, `~/ducter/projects`, too), else the folder list on that computer's places,
with 添加文件夹… for that computer: a new folder there, one chosen there, or a clone there (D204, D272; never this Mac's picker for another computer). On hand's 添加文件夹 (D455) asks the computer first, then looks through that computer's folders there; a computer may set DUCTER_FOLDER_ROOTS to allow other folders than its home folder. If that computer is asleep, the chip says **睡着了 · 醒了就开始** and Start still works (the
task waits).

New task never parses the words for needs (it is the power path, words unchanged, D128); the
user who wants their Chrome picks the MacBook.

## 7. Moving (E3, reconciled)

E3's mechanics stand: a successor continues from the last checkpoint; a repo moves only through
its pushed branch; uncommitted work never moves. What this note adds:

1. **Targets come from the same ranking**, with the task's needs. A folder task, a task that
   needs a Mac app, or one that needs the user's Chrome can't move to hel; the sheet greys hel
   with why, so the person never picks a move that would fail.
2. **"我要合电脑了"** (the user says it, or taps **合盖前转移 / Move before closing** on the
   MacBook's island card): one decision for the whole computer, default **move**, because the
   user stated the intent: **合上之前：「修 CI」「英译」搬到 hel 上接着做；「做 Keynote」只能在
   MacBook 上做，醒了接着。** Go moves the movable ones; nothing that would widen access moves.
3. **The lid closes with no warning**: A3 as written (wait by default, one decision per
   computer when it matters).
4. **Prevention beats moving**: long or ongoing work starts on a computer that doesn't sleep
   (§4.3 step 5), so W6 rarely needs a move at all. This is the 惊喜.
5. **Never toward more access without the person**: a move to the user's Chrome or a computer
   signed in as them always comes from their tap, their Go, or their words asking for their own
   account (D376).

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
| `where.first_line` | 以后每个任务都会写明在哪台电脑上做。 | From now on, every task says which computer it's on. |
| `newtask.computer` | 在哪台电脑上做 | On which computer |
| `newtask.computer.always_on` | 一直醒着 | Always awake |
| `newtask.computer.chrome_apps` | 有你的 Chrome 和 Mac 应用 | Has your Chrome and Mac apps |
| `newtask.computer.asleep` | 睡着了 · 醒了就开始 | Asleep · starts when it wakes |
| `newtask.agent.elsewhere` | 在 {device} 上 | on {device} |
| `newtask.agent.copy` (D202) | 会换到 {device} 上的 {folder} | Switches to {folder} on {device} |
| `newtask.agent.needsfolder` (D202) | 文件夹要在 {device} 上 | The folder must be on {device} |
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
**在等 · {device} 睡着了**, **换谁来做**, **现在 / Now**, **推荐 / Suggested**, **只这个 / 以后这类都用**,
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
| Nobody can do it anywhere | **现在没有 AI agent 能接这个任务。** (D128) | the reason per computer in the sheet |

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

## 13. What to build (built 2026-11-10 in this order; status in §16)

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


## 16. Build status (2026-11-10)

Built in §13's order, one commit per step, tested with fakes (fake workers over an in-process link,
a fake Chrome behind the CDP tunnel, fake clocks); not yet run on hel and the MacBook (todo).
Shots: `.shots/where-built/` (Mac `mac-*-{zh,en}.png` from `TestWhereShots`; phone `phone-*` from
`apps/web/demo-where.ts` driven headless), outside git (D75).

| Step | Built | Where | Left (todo) |
|---|---|---|---|
| 1. Browser places on a worker | the worker builds the browser (D130 native first, cua-driver, D151 Ducter's own); Ducter's own browser on a worker is driven over the worker socket (CDP down, events up), so tools, blind rule and the live view's frames are the home's code; 上网 and `alwaysOn` per computer, set on that computer; `worker_old` for an older Ducter | `core/src/browser/remote.ts`, `core/src/worker-browse.ts`, `runner/src/worker-host.ts`, `runner/src/remote.ts` | live check; a worker's Signed-in sites in Settings; evidence screenshots land on the home |
| 2. Needs and one ranking | `task_open needs`; (computer × agent × model) ranked as §4.3; one reason (`BodyWhy.where`); a named computer holds even asleep; the `[devices]` line says how each browses and whether it sleeps; a rule may name a computer | `core/src/candidates.ts`, `core/src/loadout.ts`, `partner/src/partner.ts` | partner eval W1–W6; continuity as a real signal; a repo on two computers |
| 3. Say it | the where line on the opened task (both clients) with what it uses; why on hover (Mac) or tap (phone); On hand rows name the computer; the switch-on line | `apps/desktop/internal/views/where.go`, `apps/web/src/where.ts` | — |
| 4. Ask only when it matters | a task waits for its computer (在等 · MacBook 睡着了) and starts when it is back; the one-line ask with Hold (等它醒) as the default, no countdown; Go re-places it; the user's own pick that waits; widening said on the card | `runner/src/runner.ts` (`waitThere`, `askWhere`, `moveWaiting`), `core/src/decisions.ts` | waiting across a home restart |
| 5. Change it | the switch sheet: islands strip (Mac) + list grouped by computer (both); the move (no repo: free; repo: push, fetch on the target; folder: never) | `runner.moveTask`, `whereswitch.go`, `views.tsx` `SwitchList` | — |
| 6. New task | the computer part on No folder; 在哪台电脑上做; an agent on another computer brings it along | `newtaskwhere.go`, `views.tsx` `NewTaskSheet` | a repo on two computers |
| 7. 我要合电脑了 | one card, Go (move) by default after 90 s, never toward more access; `move_before_closing` for the partner; 合上之前搬走 on a working laptop's card | `core/src/closing.ts` | the Mac's willSleep as the trigger for this card (D293 sends `{t:"sleep"}` at willSleep, so the computer reads 睡着了 at once, but nothing offers the move then yet) |
| 8. Motion | Lands (0.9 s, squash, title tag 1.2 s), Waits (still at the home end, 在等), Moves (home, a rest, out again); reduced motion shows the parcel where it is with its tag | `isles_where.go`, `isles.go` | the human comprehension test (D81) |

Copy as built: `apps/desktop/internal/i18n/where.go` (the web client's table is generated from it),
with §8's keys and these added in the build: `where.reason.no_signin` (用不着你的登录，{device} 自己的
浏览器就够了), `where.reason.home` (Ducter 就在 {device} 上运行), `where.reason.you` / `.rule`,
`where.ask.*` (the ask's question, Go, Hold, the default line), `where.waiting` ({device} 睡着了),
`switch.cant.web`, `switch.waits.away`, `switch.move.plain` / `.signin`, `move.closing.*` (搬走 · 先不搬),
`isles.tag.*` (在等 · 搬到 {device} 上了). `switch.move.explain` says "推上去" without the remote's name
(the client doesn't know it).

D161 (2026-11-10) restyles two of these surfaces in its coin language: 换谁来做 with two or more
computers says **换谁，也可以换一台电脑 / Someone else, or another computer** under its title, and
each group head is the device's mini card (its clay, name and state; asleep in dusk ink), on the
Mac and the phone (`design/ui-devices-card.md` §6, §12).

## 17. Adding a computer for tasks (D347; entry, look and name D358)

Where a task can run is only as wide as the computers Ducter has. Adding one is its own moment:
**加一台做事的电脑 / Add a computer for tasks** (was 借一台电脑来干活 / Lend a computer: 借 read as
"handed over, no longer yours", research/128).

**Who.** The author: the home is hel, a public server; a Linux box on the home network has no
public address and no Tailscale. The consumer: a NAS, an old Mac. The fresh user never reads
"worker". **Felt before:** possible (a worker dials out, so it only needs outbound access to the
home's address) but four manual steps and no sign it arrived. **After:** one line, the app
waiting for it, the computer arriving with its name, system and signed-in agents.

**The address.** The home offers the address the other computer can dial: its public one
(domain, tunnel, tailnet) when it has one, which also serves a computer on the same home network;
else its own network address when it listens on the network (`sameNetwork`: both on one
network); else none, and the sheet asks for 从外面连 first. A Mac home listens only to itself by
default, so a Mac home without From outside has nothing to offer (todo: opening it to its network
on demand).

**The flow** (web and Mac, the same): 你的设备 › **加一台设备 / Add a device** › **让 {name} 在上面做事 /
For {name} to do tasks on** (D358), or Settings, or the partner's card → **是哪种电脑？/ What kind of computer?** (A Mac:
the app's own switch on that Mac first, else the line; A Linux server: the line) → the line with
Copy, what it does, the code's minutes left, the same-network note, **让你的 AI agent 来装 / Let
your AI agent do it** → **在等它连上… / Waiting for it to connect…** (`lend` `waiting`) →
**连上了，正在开好… / Joined. Starting up…** (`joined`: the code was traded) → **{name} 来了 /
{name} is here** (`here`: its worker said hello) with 改名字 / Rename. **没连上？/ Didn't connect?**
folds the four failures. A code that lapses while waiting shows **这个码过期了。/ This code
expired.** with **换一个新码 / New code**.

**Where it starts.** 你的设备's one **加一台设备** row (its sheet asks what the device is for, D358),
Settings › 在哪儿运行, and the partner's lend card (a ```ducter-ui `{"type":"lend"}`
block) when the person asks to add a computer. The partner says nothing as it arrives.

**The line** (`apps/site/public/install.sh` `worker` mode → `ducter worker … --service`): reach
check, install unless this version is there, join (kept if the saved one still works), the
service (a system unit as root). Safe to paste twice.


**Its AI agents (D363, research/132).** A computer that just joined usually has none. The sheet's
last step asks **装上哪些 AI？/ Which AIs should it have?** (Codex and Claude Code checked, pi not),
**装上 / Install** or **以后再说 / Later**; then each agent as a row arriving (正在装上… / 等着装), its
**登录 / Sign in** in place (Codex's link and code; Claude's link and the code pasted back; pi's line
for that computer's terminal), and **{name} 可以干活了 / {name} is ready for tasks** once one is
signed in. Every device card has the same rows (安装 in Add an AI's detail, 登录 on a coin not signed
in). Ducter installs into `<data>/tools` there (its own pinned Node, each agent's npm package at the
version it verified; no sudo), and finds the person's own copies: the worker's PATH is widened with
the login shell's PATH and the usual per-user folders, and it looks again within seconds of a
change (a fingerprint every 5 s, a real probe when it moves, and when a card opens).

**DeepSeek Harness (D371, research/140).** Found inside its Mac app too (the `dsh` it carries, never
on PATH; such a copy **随 DeepSeek Harness app 更新** and Ducter never updates it), and the home looks
every 5 s like a worker, its fingerprint including DeepSeek Harness's own credential file. Signed in
means a DeepSeek key or the DeepSeek account its app signed in with; with only the account its
sessions run the account's model route, and a home of Ducter's reads the person's own credential file
where it is. Its 登录 opens the app on that Mac (when there) and takes a pasted DeepSeek API key,
checked and kept only on that computer; the row turns ready by itself either way. 安装 puts its
command line in Ducter's folder (about 1.3 GB, said before the tap); the lend sheet offers it unchecked.

**The look (D358).** The sheet is clay, not a form: the kind question as two clay cards; the computer's
own clay over every step, its pose the state (asleep under its blanket while the line is made, a ripple
under it while it is waited for, awake with one swell as it joins, floating once here, grey when the code
ran out or nothing outside reaches the home); the three steps **复制这一行 · 粘到它的终端里 · 它会自己连上来**
as a numbered row; the line in the app's ink code block with Copy; the agent's way and 没连上？ as folds;
each failure one sentence and one button under the clay (D353's 没有回应 / 没能给出一个码 with 再试一次).
Back is an arrow, one step. Reduced motion keeps the clay still.

**The words for the computers (D358, research/128).** The home: **{name} 在这台上运行 / {name} runs here**;
a computer that does tasks: **帮 {name} 做事 / Helps {name} with tasks**, the partner's name, never a
machine's. Where a computer is added or switched on, one line says it never sees the conversation.

## 18. A repository is named by its remote, never guessed by path (D395)

**Who.** The author's first real hand-off (hel, 2026-11-19): a GitHub to-do on `nowledge-co/mem`,
「10559 帮我用 codex astra 仔细做一下」. The partner guessed `/root/dev/mem` on the home (a server
with git and no clones); the task failed at once with 没成 and a bare worktree path, and 再试一次
would have failed the same way. The fresh user has never cloned anything and should never need to.
**Felt before:** let down on the very first try, then asked "以后…直接接下？" beside the failure.
**After:** the task starts where the code is, or Ducter clones it first and says so in one line.

**One resolver** (`packages/core/src/repo-where.ts`), used by task_open's pre-flight, a to-do handed
over from On hand (`task_new` `handed`), the pile's hand-over, 再试一次 on a task that couldn't
start, and D385's hand-over of several (the sheet's Where default, and the place each of its tasks opens in; `HandWhere.clone` when it is cloned there first). Its order generalizes D385's:

1. a computer the person named in words (or the place's own device when the partner set one);
2. a where-rule (a rule with a computer whose words match the work);
3. a computer that has a clone: the one that builds first (a Mac 2, a worker 1, a server home 0),
   then the most recently touched copy;
4. no clone anywhere: clone it on the best computer whose own git can read it (`git ls-remote`, its
   own gh sign-in or credentials, no prompt) into that computer's Ducter folder
   (`place.clone`, provisioned by the runner before the worktree);
5. no computer can read it: no task; the partner asks once (sign in to GitHub on a computer, or say
   where the code is).

A place the caller gave stays when it checks out on its computer (it exists, is a git repository,
its origin is the repository); a worker that is away keeps its place (D157 waits). A path the model
guessed never wins over a copy found.

**Which clones of <remote>** is one cheap question to every computer: the home answers itself, a
worker by its `clones` op (`protocol/src/clones.ts`). It looks in the Ducter folder's projects and the
folders people keep code in (`~/dev`, `~/code`, `~/src`, `~/projects`, `~/work`, `~/repos`, `~/git`,
`~/github`, `~/Developer`, `~/workspace`, `~/Documents/GitHub`, `~/go/src/<host>/<owner>`, two levels
deep, and the home folder's top), reads only `.git/config`'s origin, and sends back only the copies
whose origin is the asked repository: the rest of the disk never leaves the computer. Answers are
kept 10 minutes; 再试一次 asks again.

**Pre-flight.** task_open resolves the repository from the place's `remote`, the to-do taken this turn,
or a GitHub address in the words, and checks the place before the task exists. A place it can't fix
returns an error the model can act on ("give the repository as remote, or ask"), never a task that
fails at start. D120's early open happens only for a place on the home that is that repository now.

**When it still can't start** (a folder removed between the check and the start): the runner asks
core why (`places.cantStart`), and the card says **没能开始：{computer} 上没有 {repo} 的代码 /
Couldn't start: {computer} has no copy of {repo}** with what fixes it: **在 {computer} 上做 / Do it
on {computer}** (another copy), **拉一份到 {computer} 上 / Clone it onto {computer}** (D472); with neither, **再试一次 / Try
again** re-resolves. 换谁来做 stays in the head's meta line. The living line says the same cause.
The clone, when it happens at open, is said by Ducter's code under the ack, once: **{repo} 的代码还
没在哪台电脑上，我先在 {computer} 上拉一份。**

**Every start failure has a card (D415).** hel, 2026-11-20: a hand-over's task failed on the MacBook
with git's own text (`fatal: Unable to create '…/.git/worktrees/通用设置/index.lock': File exists`)
and the card said only 没能开始 and a path. The runner now reads every start failure into a word
(`startProblem`): the place's three above, **busy** (another git kept the repository's lock the whole
time), **agent** (its agent didn't start: its program, a sign-in, a session), **away** (its computer
went away), **other**. Each has its line, a muted line under it (the agent's own words; what the fix
does), and its taps: **清掉旧的再试 / Clear it and try again** for a lock git left (removed only when
no git is running on that computer), **在 X 上做** when another computer has the copy, and **再试一次**,
which asks the computers again, fresh. The raw message stays in the task's own steps.

**The real reason, the real fix (D472).** hel, 2026-11-22: an Antigravity task opened in
/root/dev/mem on Hetzner Server, which had no such folder; the page said 没成 with 再试一次, each
attempt only 没能开始, and the author had to ask the partner why. The reason was known and hidden: an
On hand snapshot rebuilt the task's state without its `cant`. Now the snapshot keeps it, and one
source per client (`apps/web/src/cant.tsx`, `apps/desktop/internal/views/cant.go`) gives the page,
each attempt's step and D467's brief the same line and fixes, the real one first: a missing folder
offers **拉一份到 {computer} 上** (the repository known from the words, the to-do, or a project of
that name with an origin) and **选 {computer} 上的文件夹** (D455's sheet on that computer; the folder
chosen there is where it starts, `task_action start_in`); **not_installed**, **signed_out** and
**old** (that computer's Ducter) have their own words with 装 / 登录 / 更新 there; words that named
another computer offer **换到 {computer} 上做**; **other** names the agent and the computer, the first
line under it and **看看为什么** for a few lines more. Before the task exists, task_open's pre-flight
looks for a folder place's folder on its computer (4 s at most; offline goes ahead and waits) and
returns an error the partner turns into one line: clone it there, or which folder. One start again
runs at a time (a second tap while it starts is the same start; each client holds a tap for 2 s),
and an early open that failed before its brief keeps the brief for the start again.

**A worktree is made so it can't collide (D415).** Its branch names its to-do: `ducter/<issue
number>-<the issue's own words>` (several: their numbers, then the first one's words), never a
group's subject. A branch already there is used again only when it carries nothing (no commit past
its base, checked out nowhere: what a start that failed left); one with work on it, or checked out,
gets the next free `-2`, `-3` (the folder the same). A `git worktree add` that meets another git's
lock is tried again (four times, waits growing); a lock older than ten minutes with no git running
is one a dead git left and is cleared; a fresh one that stays is the card's busy. Ducter's own reads
of a worktree (the Mac's changes, the workbench) run with `GIT_OPTIONAL_LOCKS=0`, so a diff never
takes the index lock, and the Mac reads nothing while a task's place is still being made: hel's lock
was the Mac app's own changes pane reading the new worktree while git was filling it. Nothing else in
the person's repository is touched (no `worktree prune`, no other lock).

**Words to a task that never started start it (D415).** hel's 改进 Mem 常规设置页 failed yesterday on
a path the partner guessed; the author's reply today was taken as a resume of a session that never
existed (`Codex session directory does not exist`). Now a message (or 再试一次) to a task whose agent
never started asks the computers again (as 再试一次 does) and starts it there: its brief first, the
person's words after it as the latest message.

**Effort in words.** 「仔细」「认真」「好好做」/ "carefully", "thoroughly" open the task at high
effort (D387's highest level that isn't extreme; a model without it takes medium), and its brief
asks it to check its work before reporting; 「快速」「随便看看」/ "quick look" open it at low.
Only the person's words count.
