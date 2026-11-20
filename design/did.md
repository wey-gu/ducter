# Done for you (替你做过的): the record of what Ducter did on the person's behalf

The calm place that lists, day by day, every outward action Ducter took for the person: what it
sent, paid, called, signed in to or filled, changed, deleted, and which accounts it looked at
(counts only). Decided in D300; it builds scenario G5 (`flows/G-safety.md`) and principle 18
("gate the effects": the record is what makes no per-call approvals acceptable). Words are the
glossary's (`product-model.md`); visuals are Pebble's (`ui.md`). The evidence is
`research/104-did-record.md`.

## The person first

- **The heavy developer** ends a day of eight tasks: "did anything merge, did anything touch an
  account, what did the routine send?" They open it from On hand's end or ask the partner, filter
  to **改动 / Changed**, and see the two merges and a folder task's files with **改回去 / Undo**.
- **The consumer** gave it their mail, a card and a phone: "what did it send in my name, what did
  it pay?" They see one card per action in plain words (付给 hotel-okura.jp USD 128.00), who asked,
  the Go they gave and when, and on which phone or computer. Most days the page says nothing was
  sent or paid; that is the point.
- **The fresh user** never looks for it. The first time they meet it, it is a quiet line at the
  end of On hand, under the morning note, or the partner's answer to "你今天替我发了什么？". The
  first page they see is usually the empty one: the clay character with its notebook, and one
  sentence that nothing went out today.

**Felt.** Before: "I gave it rope; what happened out there?" After: "Everything it did in my name
is in one short list, each with the Go I gave. Nothing I didn't allow." 放心 above all; 好用
(filters and a search, one tap to the task); 顺滑 (no setup; the page is just there); 赏心悦目
(day sections like a diary, drawn glyphs per kind, the clay character on the empty day); 惊喜
(the partner answers from the same list, and the empty day is reassuring, not blank).

**How it starts.** Nothing to set up and nothing to learn: every action already goes through
Ducter's gate and the Log (principle 1); this place only reads them.

## What counts

Only what left the task's own place or used something of the person's. The transcript (every
tool call) is not the record.

| Kind | What | Read from |
|---|---|---|
| 发出的 / Sent | D341: a comment on a GitHub issue for a bound task (`source_write` comment, with its Go or "allowed before" under the standing go); mail and messages sent through an account (connection writes that send), a message or post tapped in an app on a phone or a computer after its Go, a message to another agent (Nowledge Bridge) | `connection_call` (write, done), `decision.phone` / `decision.computer` (effect send, post) + its Go, `bridge_msg` out |
| 付款 / Paid | a saved card after Pay; a tap that pays or buys in an app after its Go | `decision.pay` + Go, the Autofill use `approved`; `decision.phone` / `decision.computer` (effect pay, buy) |
| 电话 / Calls | every call Ducter placed, from a line (Tuwa) or the person's own number, with how it ended | `phone_call` (the latest snapshot of each call that was placed) |
| 登录和填写 / Sign-ins and fills | a saved sign-in or private detail filled on a site, a key given to a task, a sign-in tap in an app | the Autofill uses (`filled`, `ok`, `given`); `decision.phone` / `decision.computer` (effect account) |
| 改动 / Changed | D341: a GitHub issue closed or an Obsidian line ticked for a bound task (`source_write` close, tick); a calendar change (add, move, answer), a merge, a draft PR, a folder task's files, a setting or an install in an app, any other write to an account | `connection_call` (write, done) with `decision.cal`; `job_status` (act merge / open_pr, done); `report.folder`; effects setting, install, confirm |
| 删除 / Deleted | a calendar event cancelled, anything deleted through an account or tapped in an app | `decision.cal` cancel; connection writes whose action deletes; effect delete |
| 看过的 / Looked at | each account it read from, counted per day and per task. **Never what it read** | `connection_call` (read, done) |

Not in it: the partner's own replies to the person, tasks' work inside their own place (a repo
branch before merge), anything that failed before it went out (a held card, a refused send), and
the values of anything saved (principle 18; `autofill.md`). A send whose answer never came back is
listed with **没确认送到 / Not confirmed**; a call no one answered with **没人接 / No answer**.

**Honest about coverage.** The record lists what went through Ducter's gate. An agent running
with its own approvals off could still run a command directly; the page says so once, at its end:
**这里记的是经过 Ducter 的事；任务在电脑上直接跑的命令不在这里。/ This lists what went through
Ducter; commands a task ran directly on its computer aren't here.** Commands seen in transcripts
are `todo.md`.

## One item

Every item is a card: a drawn glyph on a clay pebble whose tint says the kind and whose shape says what exactly it was (D314: a mail, a message, a post; a calendar event, a merge, a draft PR, a folder's files, a setting, an install; a detail; an event cancelled), one table for both clients (`packages/protocol/src/did-glyphs.ts`), the line, and its facts, each
its own element (D291: never joined with " · "):

1. **What**, in plain words from a table by kind and sub-kind (below), with the thing's own words
   under it when it has them (the card's sentence, an event's title, a message's start, at most
   140 characters).
2. **Who asked**: **你让它做的 / You asked** (in the conversation, or the person's own tap),
   **任务「{title}」/ Task "{title}"**, **例行「{name}」/ Routine "{name}"**.
3. **The Go**: **你点了好 {time} / You said Go at {time}**, **没人回，按默认做了 / No answer; went by
   the default**, **之前允许过 / Allowed before**. Nothing when it needed none (a read, a task's own
   folder).
4. **Where**: **在 {device} 上 / On {device}**, **Ducter 的手机 / Ducter's phone**, **用 {line} 的号码 /
   From a {line} number**, **用你自己的号码 / From your own number**, **通过 {account} / Through
   {account}** (an account's own interface, from the home).
5. **The task**: **打开任务 / Open the task**; **看结果 / See it** when the action gave a page (the
   event, the PR).
6. **Undo, only where one truly exists**: a folder task's changes while their copy is kept
   (**改回去 / Undo**, D142, until **{date} 前可以改回去 / Can be undone until {date}**). Nothing
   else offers Undo: a sent message, a payment, a call or a merge cannot be taken back, and the
   page does not pretend.

### The words per kind

| Kind · sub | zh | en |
|---|---|---|
| sent · mail | 发邮件给 {to} | Mailed {to} |
| sent · message | 发消息给 {to} (no one named: 发了一条消息) | Messaged {to} (Sent a message) |
| sent · agent | 发给 {to} | Sent to {to} |
| sent · post | 发了一条帖子 | Posted |
| paid · card | 付给 {to} | Paid {to} |
| paid · buy | 在{via}里付了款 | Paid in {via} |
| called · call | 打给 {to} | Called {to} |
| filled · signin | 登录了 {to} | Signed in to {to} |
| filled · detail | 在 {to} 填了保存的信息 | Filled a saved detail on {to} |
| filled · key | 把密钥 {to} 给了任务 | Gave a task the key {to} |
| filled · account | 在{via}里登录 | Signed in in {via} |
| changed · calendar | 加了日程 · 改了日程时间 · 回复了邀请 | Added an event · Moved an event · Answered an invitation |
| changed · merge | 合并了 {to} | Merged {to} |
| changed · pr | 开了草稿 PR | Opened a draft PR |
| changed · files | 改了 {n} 个文件 | Changed {n} files |
| changed · setting | 在{via}里改了设置 | Changed a setting in {via} |
| changed · install | 在{via}里装了东西 | Installed something in {via} |
| changed · write | 在{via}里改了东西 | Changed something in {via} |
| deleted · calendar | 取消了日程 | Cancelled an event |
| deleted · item | 在{via}里删了东西 | Deleted something in {via} |
| read · account | 看了 {via} | Looked at {via} |

A read's facts are its count (**{n} 次 / {n} times**) and who asked; never what it read.
The amount of a payment is its own element next to the line.

## The place

**替你做过的 / Done for you**: on the Mac a whole-window place (like Past tasks); on the web a
sheet, a centred panel when wide, the whole screen on a phone. Not a Settings pane.

| From | How |
|---|---|
| On hand | Its last lines: **替你做过的 ›** next to **做过的事 ›** |
| The morning note | Under the partner's morning note (finds rung `morning`), one quiet line **替你做过的 ›** |
| The Mac's menu | **替你做过的… / Done for You…** (⌘⇧Y) in the same menu as Past Tasks |
| The partner | "你今天替我发了什么？" answered from the same list (the `did_list` tool), in one or two lines |

The top: the title; one large field **找一条：发给谁、付给谁、哪个任务… / Find one: who it went to,
who was paid, which task…** (searches as you type); one row of filters on a sunk track (the chosen
one the knob, D270): **全部 / All · 发出的 / Sent · 付款 / Paid · 电话 / Calls · 登录和填写 /
Sign-ins and fills · 改动 / Changed · 删除 / Deleted · 看过的 / Looked at**, each with its count
for the range when there is one.

Then the days, newest first: **今天 / Today · 昨天 / Yesterday · {weekday, date}**. Each day's
header has its counts as separate small facts (**发了 {n} / {n} sent · 付了 {n} 笔 / {n} paid ·
打了 {n} 个 / {n} calls**), then its cards. A day with reads only says so under its header. The
last seven days come first; **更早的 / Earlier** adds seven more.

**The empty day.** Today with nothing sent, paid or called: the clay character with its notebook
(`idle`), **今天没有替你发出、付过或打过什么。/ Nothing sent, paid or called for you today.**, and
under it what did happen, as facts: **看了 {n} 个账户 / Looked at {n} accounts**, **改了 {n} 处 /
{n} changes**, or **其他也没有 / Nothing else either**. A filter or words with no match: **没有找到 /
Nothing found** and **全部 / All** to clear.

Esc clears the field, then goes back to where it came from.

## The partner

`did_list` (partner role, read-only): items in a range (`today` by default, `yesterday`, `week`,
or ISO times), optionally one kind. It returns the same items the page shows, in compact form, and
the counts. The partner answers in one or two lines and offers the page; it never reads out a
read's content (there is none to read) and never invents an item the list doesn't have. A day
with nothing outward is said plainly: 今天没替你发过或付过什么。

## Protocol

`packages/protocol/src/did.ts`: `{ t: "did", id?, query: { since?, before?, kinds?, q?, limit? } }`
answered with `{ t: "did_result", id?, items, counts, since, before, more? }`. Items are derived on
the home from the Log and the Autofill uses at read time (`packages/core/src/did.ts`); nothing new
is stored. Undo is the existing `task_action` `undo`.
