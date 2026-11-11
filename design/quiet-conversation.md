# The Quiet Conversation

> Design note for D104, D129 · Principles 6, 7 · Evidence: `research/36` · Prototype:
> https://claude.ai/artifact/8ZaW9XS7a7NEBX1ATD4Khr · Screens:
> `~/dev/ducter-evidence/quiet-conversation/`, `.shots/conv-bubbles/` (D75)

The author: "我希望默认用户能看到总 main ai 简洁的文字，减少各种其他的信息干扰……让人感觉你就是一个
partner，在一个沟通工具里说话，当然中间的各种加载反馈体验要做足". The conversation is a messaging
app with one partner. It shows only what a person would say. Everything a machine would print
(task lines, proof, files, statuses, tool calls, memory operations) is one tap away, never
default chrome. Silence is never mistaken for being stuck.

## Who is in this moment

| Who | Before | After | First time |
|---|---|---|---|
| Heavy multi-agent developer | A screen of buttons, orange cards and status rows to scan before finding what the partner said | A report from a colleague: Details when they want to check, ⌘2 On hand, the opened task for every step; **对话里的细节 / Details in the conversation: 展开 / Shown** keeps proof open | Nothing changes in how they work; the setting is in Settings |
| Consumer who uses Grok bot, dots or Muse | cargo, branches and ↗ git push say "not for me" | Reads like messaging; an ask is one sentence and one small row | Nothing to learn |
| Fresh user | After sending, only two header words change: it looks stuck | The clay partner moves where the reply will land the instant they send, "在想…", then a reply in about 2 s | The words 看细节 / Details say there is more behind a message |

North star (D36): 好用 one question at a time, one next step · 顺滑 no scanning · 赏心悦目 paper and
words, no slabs · 放心 what went out always shows, every default says when it acts, every detail is
one tap away · 惊喜 the partner visibly working the moment you send.

## What the conversation shows

1. **Words, in bubbles (D129).** Two voices as a messaging app: the partner's in soft bubbles
   (`partner-bubble`, white on the paper; tail bottom-left), the user's in the accent
   (`user-bubble` `#FF8A3D` with ink; tail bottom-right). One body size for both, 16, Latin 1.5,
   zh 1.7–1.75 (D78); a bubble is at most ~38em wide. A run from one voice stacks 4 apart, the
   tail side's top corner tucked in (`bubble-join`); other things one voice says sit 12 apart;
   16 where the turn passes. What sits under a bubble is set in to its text.
2. **One quiet row under a message** that has something behind it, 13pt text buttons on the
   paper: **合进 main / Merge into main** (ink, 700) when it is the task's next step, then
   **看细节 / Details ›**. Details opens in place, set in from a hairline: the line of proof (✓
   and words, "改了 2 个文件 ›", the task's title as a link), **开草稿 PR / Open draft PR**, and
   the message's **记下了 / Noted** lines with **忘掉 / Forget**. A task still under way shows its
   status line there. The row's label becomes **收起 / Hide** while open.
3. **What went out** (↗ and the literal action) is the one detail never folded: it shows above
   the row whenever something left the machine (D73's rule, kept for trust).
4. **The living message has no card.** When the user was away, a small centered time line
   **你不在的时候 · 10:40 / While you were away · 10:40**. Then, in this order:
   - a task that didn't work, as one sentence: "{title}没做成：{text}" / "{title} didn't
     work: {text}" (a finished one: "{title}做完了：…" / "{title} is done: …"), with Details.
     For the first 2 minutes after its final report this line is the waiting presence
     (**在看它做完的结果… / Looking over what it came back with…**) until the partner's own
     message replaces it; the sentence is the fallback when the partner is late (D124). The
     action row shows once per task, under the newest message about it;
   - the asks (D129): the question in the partner's bubble, then **one compact tray** under it,
     a white card on a 3pt clay base: **回复… · 先等等** as quiet text, then Go last and named
     by the action (**好，rebase**, 36pt, D76); under the tray the default as one small grey
     line (**10 分钟后你没回，我就 rebase，之后还能改回来。** · can't be undone: **你说好，我再做。
     / I'll do it once you say so.**) with Details. Only the ask whose default comes soonest
     carries the tray; the others gather in one line, **还有 1 件等你定 › / 1 more waiting on
     you ›** and **都按默认 · 2 / Go on all defaults · 2**. Opening the line shows them all. An
     answered ask keeps its question and the tray becomes one tiny line on the user's side in
     their own words: **你说：好，rebase / You said: Rebase** (by default: **你没回，我照原计划做了
     / No answer, so I went ahead**).
   - **a task's question, in the partner's words (D129).** The partner says it in one short
     message (`ai_msg` with `decisionId`); it shows as that ask's question and the task's own
     wording moves to Details (**它的原话：… / In its words: …**). Until the words come (up to
     60 s, while connected) the place shows the waiting presence, **在看它想问你什么… / Reading
     what it's asking…**; past that, or offline, the task's wording stands in.
   - Work under way and waits are not said: the header line ("2 件等你 · 在做 1 件") and On hand
     carry them. The count of asks shows only in the header.
5. **Time lines** like a messaging app: before the first message and wherever 15 minutes passed.
   **Pictures (D206):** the user's stand above their words; what a task showed stands under the
   partner's words about it, a file as one line on a card. They are the message, not machine
   output, so they are never folded into Details (`media.md`).
6. **The waiting line** (below).

Nothing is deleted: On hand, the opened task (D74) and the menu bar extra are unchanged, and
every removed line is in Details, On hand or the task.

## While it's busy: the waiting line

While the user waits on a reply, the partner's own place in the conversation shows the clay
partner (its working face, breathing, D77) and one plain line, updated in place and gone when
the reply lands. It shows the moment the message is sent (the client's own state, 0 ms; web
measured 2–4 ms), so the first feedback never waits on the server.

| Step (protocol) | zh | en | From the partner's |
|---|---|---|---|
| thinking | 在想… | Thinking… | turn start, before any tool |
| recalling | 在翻之前聊过的… | Looking back at what we said… | log_search, log_read, memory_search |
| checking_task | 在看做到哪了… | Checking on that task… | task_read |
| opening_task | 在安排一件事去做… | Setting up a task… | task_open |
| messaging_task | 在把你的话带过去… | Passing it on… | task_send |
| planning | 在想怎么安排… | Working out the timing… | wait_until, ask |
| looking | 在查… | Looking into it… | any other tool |

Housekeeping (ToolSearch, memory_add, task_retitle) keeps the current step. Tool names never
reach a client. One step past 15 s adds **比平时久一点，还在处理 / Taking a bit longer than usual**;
past 45 s, **还在处理。你可以先忙别的，好了告诉你 / Still on it. Carry on with something else; I'll
say when it's ready**. The clock is per step, on the client's own clock.

**Mechanics.** A new unlogged server frame `{t:"activity", activity: {step, since, stepSince} |
null}` (presence, not history): the partner sets it only for a turn that answers the user,
core sends it after any buffered events and once after each welcome, `null` ends the turn. A
turn that ends without a word (the partner asked instead) ends the waiting line too. An older
client ignores the frame.

**Long work: ack and go (D120).** The ack is one sentence that replaces the waiting line the
moment it lands: what the partner is starting, that it will say when it's clear, and how long it
usually takes only when something grounds it ("好，我去查 CI 为什么挂了，一般十来分钟，查清楚了告诉你" /
"On it: checking why CI failed, usually about 10 min; I'll tell you when it's clear"). The partner
sends `activity: null` with the ack, so no step flashes after it. The task starts with the
sentence, not after the brief: its card (so the header's **在做 1 件**) and its session open from
the streamed title and place of the `task_open` call while the partner is still writing the
brief, which becomes the session's first turn. Then silence until the result, which arrives as a
message (and a notification when away). Measured live, warm session, one run each: sonnet ack
1.2 s and task session spawn 1.8 s after Send; opus 2.3 s and 3.0 s (before D120: spawn 4.7–5.1 s
and 7.5 s, after the whole brief). `bun packages/partner/eval/latency.ts --model opus` repeats it.

## Settings

**对话里的细节 / Details in the conversation**: **收起 / Folded** (default) or **展开 / Shown**,
per client (the Mac's Settings, the phone's Settings sheet). Shown opens every message's Details
by default, opens all asks, and lists work under way and waits in the living message.

## What it replaces

D73 (2) and (3) in the conversation: the proof line, Merge / Open draft PR as clay buttons under
every result, the living message as a card with a heading, the section count, an orange card
and countdown bar per ask, the asker's title above each ask, and the status rows. D73 (1) and
(4) stand; On hand and the opened task keep their cards and buttons.
