# 124: 0.0.67–0.0.70 walked live (first words, a steered task, the locator, Settings)

What 0.0.67–0.0.70 added had run only on fakes: D327's look start, D329's Mem line, D325/D328's
steer receipt and held words, D325's locator list, D332's Agent messaging page, D336's Passwords
& cards, D337's own-number row and one update check on a Mac. This walk ran them on real agents,
in a scratch home, the way research/108 did the first hour.

Tags: **VERIFIED** (run here and seen), **FAILED** (run here, wrong), **INFERRED** (from code or
one run only), **NOT RUN**.

## Setup

| | |
|---|---|
| Date | 2026-11-17, 21:35–22:00 (Asia/Shanghai) |
| Build | main at 0.0.70 (`ef4e4e44`), `bun run packages/core/src/main.ts` from the worktree (local Bun 1.3.1) |
| Homes | Home A: memory on, records reading on, `DUCTER_LOCALE` unset. Home B: `DUCTER_MEMORY=off`, `DUCTER_LOCALE=zh`. Both `DUCTER_PORT=7998`, a data folder under the session scratchpad, `DUCTER_PUSH_RELAY=off`, `DUCTER_BROWSER=0`, `DUCTER_IMESSAGE=off`; never `~/.ducter` or :7777 |
| Models | Partner and tasks on Claude Code haiku (`DUCTER_PARTNER_MODEL=haiku`, `DUCTER_TASK_MODEL=haiku`); Codex not used |
| Mem guard | `NMEM_CLI_PATH` pointed at a shim that logged every call, passed only read-only ones to the real `nmem` 0.10.119 (`--version`, `status`, `--help`, `bridge setup`, `bridge connections list`, `agents show`, `agents context show`) and refused everything else. Nothing was written to the real Mem (the shim's log shows each refused call) |
| Web | headless Chrome on CDP port 9666, a scratch profile, 1400×900, zh and en |
| Mac | `scripts/make-app.sh` with `DUCTER_BUNDLE_ID=co.nowledge.ducter.walk0070` into the scratchpad, opened with `open -n --env HOME=<scratch> --env DUCTER_URL=ws://127.0.0.1:7998/ws --env DUCTER_UPDATE_FEED=http://127.0.0.1:9/feed …`, driven with cua-driver 0.44. No permission prompt appeared |
| Task place | a plain folder (`proj/calc`: `sum.ts` whose loop starts at 1, a test expecting 6) |

Shots: `.shots/live-0070/` (the ones holding the author's own session titles stayed in the
scratchpad and were deleted).

## Findings, ranked

### F1. The partner doesn't know what the person said straight to a task, and offered to delete their files (FAILED; not fixed, a design call)

Live, Home B. The person typed four requests in the opened task's own composer: a fib module, a
README (held, then sent at the turn's end), `sleep 90; echo ok`, a NOTES.md. Each ran and reported.
The partner then said, in the conversation, 「这条是任务里一个后台命令跑完了……你要是没让它跑过这个，回我一声」, then
「它已经自己加了 README、NOTES 和一个后台命令，都不是你要的。我让它之后只做你说的事。」, steered the task with
「请停止再添加任何你自己决定要做的东西……」, and raised a card **要把它自己加的 README.md 和 NOTES.md 删掉吗？删了就找不回来了。**
with **好，删掉** as its default. Later: 「它提到一条英文翻译的请求，但我这边没有这条记录」. **VERIFIED** (the Log holds
the person's words as `task_event {role: user, from: user}`; the partner's message and its
steer follow them).

Cause, **INFERRED** from the code: the partner reads a task's reports, not the person's own words
in it (`packages/partner/src/partner.ts` handles `task_event` only to log memory reads). So every
direct request looks like the task's own idea. Haiku then judged it; a stronger model may guess
better, but it still can't know.

Who it hurts: the developer who steers tasks directly (D325 made that the main path); the
consumer who reads "not what you asked" about what they asked. Against 放心: the partner
contradicts the person and offers an irreversible delete.

Recommendation (a decision, not made here): the partner's view of a task's report carries the
person's own words sent to that task since its last report, each marked as theirs, cut to a few
lines (`[you, in the task] …`). Tradeoff: a few hundred tokens per report on a task the person
talks to. Alternative: tell the partner in its persona that the person may talk to a task directly
and never call a change unrequested without reading the task (cheaper, still guessing). Needs a
persona/partner-tool eval (D175) either way.

### F2. A scratch home connects itself to the real Mem when nothing else holds the connection (INFERRED live; not fixed, reported as asked)

Home A, the real Mem signed in (Cloud, one personal place), the person's Claude Code, Codex and pi
records present. Observed: `bridge.state: "elsewhere"` (the author's own home holds the
connection), so D332 (3) did not connect, and the pane offered **Receive here instead**. **VERIFIED**:
no `connect` was attempted in that state, opening the page asked nothing.

Then the shim answered `bridge connections list` with an empty list (as Mem would for someone whose
real home had never connected), and the home was restarted. Within 15 s it ran
`nmem bridge connections connect --space-id personal-… --agent-id ducter --context ducter-on-siwei-s-macbook-pro-…`
on its own. The shim refused it, so nothing reached Mem. **VERIFIED** that the code makes the call;
**INFERRED** that the real Mem would have taken it.

So a home with its own `--data-dir` (a scratch run, a second instance, a test of the app) takes
the person's Mem connection without a tap, and a later scratch run on the same Mac shows the real
home as "another computer" (see F6). D332 (3) assumed one home per Mem identity.

Recommendation: connect unasked only for the home at the default data folder (or the one the
app's LaunchAgent runs); a home with its own data folder connects only when the switch is
flipped or **Receive here instead** is tapped. Alternative: skip unasked connecting whenever
`DUCTER_DATA_DIR` is set. Either changes D332 (3), so it needs a Dn.

### F3. 在检查… never ended on the Mac's Updates and about (FAILED, fixed)

Mac app, Settings › 更新和关于, **检查更新**: the line turned to 「刚看过，已经是最新的」 (the home answered) but the
button stayed **在检查…** for good (watched 45 s; the app's own feed had already failed at once).
D337 (2)'s one button sets the Devices card's `checking` flag, which only the Devices card's
`drainDeviceResults` clears, and that card isn't drawn on this page. Fix: the page drains the
results too (`settings_update.go`); `TestD337OneCheck` now sends the home's `update_result` and
fails without the fix. The rest of D337 (2) held: one check line, one button, and the app's failed
feed read (after the home's answer) stood with 「GitHub 没应答，一小时内再试。12 分钟前检查过」. **VERIFIED**.

### F4. A small model's report leaked its tool-call markup (FAILED, fixed)

Two of eleven reports from Claude Code haiku had a summary ending
`…没有改动任何代码或测试。</summary>\n<parameter name="evidence">[{…}]` and no evidence. The opened
task's report showed the raw markup as its body, the locator list ended rows with `</summary>`, and
the evidence was lost. Fix: `unleakReport` (runner `tools.ts`) ends the summary at the leak and
takes a leaked `evidence`, `questions` or `remember` that is valid JSON when the call didn't pass it
properly. `packages/runner/test/report-leak.test.ts`. Reports already in the Log keep it.

### F5. Three agents read "Claude Code and Codex and pi" (FAILED, fixed)

First words, both languages: **Pick up what I was doing in Claude Code and Codex and pi lately**,
**接着我最近在 Claude Code 和 Codex 和 pi 里做的事**. The names now form a list (**Claude Code, Codex
and pi**, **Claude Code、Codex 和 pi**; two stay "A and B"), in the look start, the looked line and
the forgotten line; forgetting still finds words said the old way. `namesOf` in
`first-words.ts`, `packages/core/test/names-list.test.ts`.

### F6. A failed connect showed raw JSON (FAILED, fixed)

After the refused connect (F2), the pane said `Couldn't connect: {"error":"blocked by scratch walk"}`.
The real `nmem --json` answers failures as `{"error": "not_found", …}` (checked read-only with
`agents show` of a missing id), which would show the same way. `detailIn` now takes `message`,
`error.message` or `error` before the raw text (`bridge-link.ts`, `packages/core/test/bridge-detail.test.ts`).
Not fixed: in the "elsewhere" state the row says **on another computer** when the other home is the
same Mac (only a second home on one Mac reaches it: F2).

### F7. A task's wait reason came out in both languages (FAILED, fixed for tasks)

The task armed `wait_for` with reason 「后台的 sleep 90; echo ok 跑完 / the background sleep 90; echo ok
finishing」, shown on the task's wait line and On hand. The tool's description gives each example as
「中文 / English」 and haiku copied the pair. The task's `wait_for` now says "in ONE language" with an
English example and its Chinese reading in prose (`work.ts`). The partner's `wait_for` shares the
old wording: not changed here, since a partner-tool description change needs D175's eval; listed
for the next partner change.

### F8. Smaller things seen (not fixed)

- The wait line overflowed the 544-px task pane by 7 px (a horizontal scrollbar under it); the
  `.when` "21:49 回来…" was cut. The waiter ended before the cause was found. **VERIFIED** once, cause unknown.
- After **Stop**, held words keep the head **这一轮做完再说 / After this turn** while nothing runs;
  "this turn" no longer exists. A word for the idle case would read better (a copy call).
- A locator jump (Return on a row) lands with the row's first line under the top edge.
- Every report in the conversation ends 「改动随时能撤回，留到 11 月 24 日。」 (five times in ten minutes).
- With `DUCTER_MEMORY=off` the Agent messaging page says 「先在『记忆』里打开」 and its button opens a
  Memory page with no switch (the env pins it off). Only reachable by that env.
- The task's mid-turn voice was English in a Chinese task ("I'll write the test first…"); its
  reports were Chinese.

**Later (D348, 2026-11-18):** the first five are fixed against the demo cores, not yet re-walked live.
The overflow's cause was found: `.step .sum:first-of-type` shrinks at 0.35, and a lone shrinking item
with a factor below 1 absorbs only that share of the overflow (**VERIFIED** in Chrome: a long reason ran
163 px past the pane before, 0 after).

## What held

| Check | Result |
|---|---|
| First screen, memory on (D329 (1)) | **VERIFIED**: 「Good evening, I'm Ducter. I'm on your Nowledge Mem too: …」, starts: the look start, **What do you remember about me?**, one everyday example. Mem was only read (`status`) |
| **What do you remember about me?** | **VERIFIED**: fills the composer and focuses it; nothing sent (not sent here, to keep the real Mem unread) |
| First screen, memory off, zh | **VERIFIED**: no Mem line; the look start and two everyday examples |
| The look start (D327 (1)) | **VERIFIED**: 359 ms from tap to answer (zh), no clay face over it, the start gone after; three offers from the person's real records, each with **怎么知道的 / How I know** (agent's records, `~/dev/…`, minutes ago, on the computer) and **Leave this folder out**; the scope line; **Stop looking** → 「Fine: I won't look at those records again, and I've forgotten what I saw.」 with **Look again** |
| Redaction (D327 (3)) | **VERIFIED**: the reader's titles and first/last words over 167 real sessions held no key-shaped string (sk-, ghp_, github_pat_, xox*, AKIA, AIza, nmem_*, JWT); 8 fields carried the hidden mark |
| A real task | **VERIFIED**: opened from the conversation in about 10 s, fixed the test, three cases, reported in 39 s |
| Steer mid-turn, **它看到了** (D325 (4), D328) | **VERIFIED**: steered at 13:45:51.003; the agent's two already-chosen tool calls ran; `raw.read` at 52.282; the next words acted on it ("The user wants fib(20) = 6765 added…"). The bubble showed 它做到下一步就会看到, then ✓ 它看到了 |
| ⌥Return holds (D325 (5)) | **VERIFIED**: chips under **这一轮做完再说** with a count; held words became the next turn when the turn completed |
| Edit, take back, Stop | **VERIFIED**: a click edits in place (focused, **改好了**), × drops one, the others keep their order; after **暂停**, 「中断了」 and both remaining chips stay held |
| Say it now while idle | **VERIFIED**: starts the turn; every held line goes, in order |
| The locator (D325, D328) | **VERIFIED**: wide only (after 铺满), named **这件事的经过**; lists the brief, each said turn, each report's first line, with times; ↑↓ moves, Return jumps |
| Agent messaging (D332) | **VERIFIED** states: elsewhere (en: **Receive here instead**, switch on), failed (after the refused connect: one row with **Try again**), memory off (zh: one row, **去「记忆」**; Mac the same). Shown in the list (own agents present) |
| Passwords & cards (D336) | **VERIFIED** zh and en: the name, the list line, 银行卡 / 添加银行卡, Keys, 使用记录, locked on the computer |
| Accounts own-number row (D337 (1)) | **VERIFIED** zh and en: one row, **用你的安卓手机和 SIM 卡打，对方看到的是你的号码。**, **设置** |
| Updates (web) | **VERIFIED**: 你的设备 says 「10 分钟前看过，已经是最新的」 with one **检查更新** |
| Mac first screen | **VERIFIED**: the same conversation over the socket, zh |

NOT RUN: Codex (not needed for a steer: research/116 covered its echo), the Mac locator, a real
write to Mem, sending **What do you remember about me?**.

## Cleanup

Both homes, Chrome and the Mac app stopped by PID; the two `~/.claude/projects/*` folders the
partner and the task made deleted; no Codex session was made. The scratch app, homes and shim
stay in the session scratchpad only.

## Spend

Tasks: 13 Claude Code haiku turns, 2.33M input tokens of which 2.27M cached, 16.6K output; the
partner: about 10 short haiku turns. All on the person's Claude plan; no API key, no money beyond
the plan.

## Implications for Ducter

- The person now talks to tasks directly (D325), and the partner must know it: F1 is the one
  behaviour gap this walk found, and it led to an offer to delete the person's own files.
- D332 (3)'s unasked connect needs a "which home" rule before more people run a second home on
  one Mac (F2).
- Fakes again missed the order real things arrive in: the Settings page and the Devices card share
  a flag that only one of them clears (F3); a small model's tool call can leak into a string (F4).

## Summary

The 0.0.67–0.0.70 features work live on Claude Code haiku: the look start answers in 0.36 s with
keys hidden, the steer's 它看到了 lands at the right step, held words edit, drop, survive Stop and
go in order, the locator lists and jumps, and the Settings panes read right in both languages.
Fixed with tests: the Mac's 在检查… that never ended (F3), leaked report markup (F4), "A and B and C"
(F5), raw JSON on a failed connect (F6), a task's two-language wait reason (F7). Not fixed, for the
author: the partner can't see the person's words to a task and called them unrequested (F1), and
a scratch home connects itself to the real Mem when nothing else holds the connection (F2).
