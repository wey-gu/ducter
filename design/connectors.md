# Connectors and Restrained Proactive Help (DRAFT)

> Draft 4 · 2026-11-10 · Status: **D96, D122, D158 decided and built** (the broker, the oo one
> tap, OOMOL Hosted with a key; Part B). **Proactive work is redone from first principles as
> draft D165**, and the accounts card as **draft D166**: designed and prototyped, **not decided,
> not built**. D165 supersedes the proposals D97–D101 that Draft 3 carried (moved to the
> decisions log's Superseded section). Evidence: `research/35` (dots, Muse, the Grok bot,
> Google access, open-connector, the mailbox metaphor test), `research/46` (Gmail's nudges,
> Microsoft's Briefing email, Apple's interruption levels). Builds on principles 6, 7, 15–18,
> D43, D61, D104, D114 (routines), D59 (quiet hours), D159 (push), D161 (the character sheet).
> Prototype: `design/prototypes/accounts.html` (open from the repo; shots in `.shots/accounts/`,
> outside git, D75).
>
> Labels in Part A: **VERIFIED** read in code this session · **DOCUMENTED** a doc says so ·
> **INFERRED** judgment.

**Part A** is the design: what the author asked ("基于这个的设计我们做到什么程度？精心设计各种
proactive 机制和第一性原理思考的应该有的东西了么？"), answered honestly, then redone.
**Part B** is the broker as built (unchanged mechanisms, kept for reference).

# Part A. Proactive help, from first principles

## 1. Where we are, honestly (VERIFIED 2026-11-10, this branch at `5ea4537`)

The broker is real and safe. **Nothing proactive exists.** After the author added oo, Ducter
reads his accounts only when he asks; it never looks on its own, never says anything first, and
the card that shows the accounts is a settings row.

| Mechanism (Draft 3 name) | Designed | Decided | Built | Tested | Live |
|---|---|---|---|---|---|
| Read on request, writes behind Go, every call logged (D96/D122) | yes | yes | yes: `packages/core/src/connections.ts` (`policyAllows` :319, `allowedFor` :436), `oo-link.ts` | yes: `packages/core/test/{connections,oo-link}.test.ts`, `packages/partner/test/connections.test.ts` | yes: live trials 2026-11-09 (Part B §22) |
| Harness children can't reach oo around the gate (D122 (6)) | yes | yes | yes: `packages/runner/src/oar.ts` (`OO_CONFIG_DIR` to `<dataDir>/oo-signed-out`) | yes | yes (found in the live trial) |
| **The cascade** watch → rules → cheap triage → partner (D97) | prose (§5.1 of Draft 3) | no | **no**: no triage, no stage-1 rules, no partner judge over finds anywhere in `packages/` (`grep triage` → 0) | no | no |
| Watching a connection | prose | no | **partly**: an *event wait* or a routine's condition can read OpenConnector Provider Triggers (`connections.ts:811 readTrigger`, `waiters.ts` `event`), only when the user asked for a wait or a routine. **oo can't be watched at all**: `OO_NOT_WATCHABLE` (`connections.ts:383`, refused at :807) | waiters: `waiters.test.ts`, `work-over-time.test.ts` (fake triggers) | never against a live OpenConnector |
| The attention bar (three tests) | prose | no | no | no | no |
| At most 3 a day, batched into a morning message | prose | no | **no** for finds. What exists: the push coalescer sends **早上好。{n} 件等你。** for *decisions* left waiting over quiet hours (`push.ts:283`, `deliver` :486) | `push.test.ts` :267 | yes (decisions only) |
| Quiet hours | yes (D59) | yes | yes: `push.ts:135` (23:00–08:00 default), `inQuiet` :254; hold everything, release one push at the end | yes | yes |
| Per-kind exception at night ("wake me for flight changes") | prose | no | no | no | no |
| Opt-in watching at sign-in, one question with a default | prose | no | **no**: adding sends `connection_result` and a toast; the partner says nothing (`ws.ts:544–553`) | — | no |
| First find within a minute, 14/60-day look-back (D101) | prose | no | no | no | no |
| 有用 / 这类别再说 under each item; per-kind learning | prose | no | no (the ledger constraint "don't tell me about this kind" is principle-7 prose, not code) | no | no |
| Pause after 3 unread | prose | for routines (D114) | **for routines only**: `routines.ts:27 UNREAD_TO_PAUSE`, "还要吗？" :240 | `work-over-time.test.ts` | yes (routines) |
| Per-watcher budget | prose | for routines (D114) | **for routines only**: `routines.ts:28 DEFAULT_MONTH_TOKENS = 2_000_000` | yes | yes (routines) |
| Finds composed into Go-gated tasks with abilities | prose (§5.4 table) | no | the pieces exist (decisions D61, `task_open`, 上网), nothing proposes them from a find | no | no |
| Mem "what matters to this person" | prose | no | no recall or write tied to connections | no | no |
| Trip-and-renewal ledger (typed facts for joins) | prose | no | no | no | no |
| Watcher text never holds a body | — | — | yes: `connections.ts:388` (subject, sender, snippet) | yes | — |
| Rules per connection (`policy.allow/deny`) | yes | yes (D96) | yes, **no UI** | yes | — |
| Mailboxes on the island, a 3-slot tray (D100) | prototype | no | the small mailbox only: `partner.go` `drawMailbox`; `HomeMailboxes()` has no caller | — | — |

**What the author sees after adding oo** (`.shots/accounts/current/`, a scratch core with a fake
`oo`: two Gmail accounts, Discord, Google Calendar, GitHub; no real credentials):

- **Mac, Settings › 账号** (`mac/oo-added-zh.png`): one row, a 30-pt mailbox, **oo 里的账号**,
  **Gmail (2) · Slack · Discord bot**, **经过 oo · 邮件和登录经过 OOMOL 的服务器**, a text
  **移除**; under it **加一个** as the page's only primary button, and the honest line.
- **Phone, the same page** (`phone-3-added-zh.png`): the same row in a sheet; the source line
  wraps "服务 / 器"; the toast said **加上了 oo，现在能看：Gmail、Discord、Google Calendar、
  GitHub**: the record name "oo", not what the row calls it.
- **The conversation after adding** (`phone-4-conversation-after-zh.png`): unchanged. The first
  screen's starters ("这周没回的邮件，挑要紧的说说") are the only hint that the accounts matter.

Why it reads as "缺乏设计": it is a list row describing a connection, with no hero, nothing
about what Ducter *will do* with the accounts, no state ("is it looking?"), and a primary
button that invites adding *another* one. And there is no moment: adding accounts is the most
trust-heavy thing a person does in Ducter, and the partner stays silent.

**Bugs fixed in this pass** (product code, small): (1) **移除 / Remove** removed a connection on
one tap with no confirm, on the Mac and the phone; it now asks in its row first (**移除 oo 里的
账号？Ducter 就看不到这些账号了。** · 算了 · 移除), the shared destructive pattern (D148, D161).
(2) The added line named the oo kind by its record name ("加上了 oo"); it now says **加上了 oo
里的账号，…**. Tests: `apps/desktop/internal/views/oo_connect_test.go`
`TestAccountRemoveAsksFirst`.

## 2. User first

| | Heavy multi-agent developer (the author) | Consumer personal-AI user | Fresh user |
|---|---|---|---|
| **Who** | Two Gmail accounts, a work calendar, Discord, GitHub with PRs waiting; twenty sessions open; an inbox he avoids | One Gmail, one calendar; used dots or Muse and liked the "aha" | Has never connected an account to an AI |
| **Before** | Teammates wait on PRs; a renewal or a flight mismatch slips through because the two halves sit weeks apart | Loved the magic, disliked the lock-in and the opaque notes | Doesn't know an AI can watch for a bill, and is wary of letting it read mail |
| **After** | One short note in the morning, at most three things, each with a next step he can tap; otherwise silence he can trust | The same, on his own Mac and models, every note readable and forgettable | Within a minute of adding an account, one useful thing (or "nothing needs you") and the feeling that it is careful |
| **Feels** | 放心: someone minds the edges. 惊喜: it joined two things he couldn't | 好用 without lock-in; 放心: he can see what it read | 惊喜 first, then 放心: it asked before it watched, and said what it won't do |
| **How it starts** | He adds oo (one tap); the partner offers a first look right there | Same | Same, or he says "帮我盯着邮箱" and is led to the one tap |

## 3. First principles

**The job.** Motivation.md: a partner that *reports to you and needs your attention only when it
truly matters*. Reading is cheap and private; **saying something costs the person's
attention**, and every false alarm spends trust that silence depends on. So the design is about
when to *speak*, not when to *look*. Ducter may look often; it speaks rarely, in one place, with
evidence and a next step.

**When a find is worth the person's attention** (all four, each judged by the partner; the
first three are Draft 3's bar, the fourth is new):

1. **They likely don't know it yet.** A receipt whose subject says it all fails. So does a CI
   failure GitHub already pushed to them.
2. **Missing it costs something, soon.** A deadline, money, someone waiting on them, a plan
   that no longer fits.
3. **There is something to do or decide**, or it **joins two things** they couldn't easily join
   (the aha class).
4. **It can show how it knows.** Every find carries 怎么知道的 / How I know: the mails, events or
   threads, with dates. A find it can't ground is not said (Apple's summary lesson, research/35).

**What it may do on its own:** read; extract typed facts; keep a small ledger of them; prepare
(a draft kept inside Ducter, a looked-up page, a summary); decide whether to speak.

**What it must never do** (structural, enforced by the broker, not by prompts):

- **Never send, reply, accept, decline, pay, delete, archive, label or move anything** on its
  own. Background work runs with a read-only caller (built: writes outside the Go path are
  refused). A draft lives in Ducter until Go; putting it in the mailbox is itself a write.
- **Never change what the person sees in their own apps.** No "mark as read", no snooze, no
  label: reading through the API must leave the inbox exactly as it was.
- **Never act on what mail says.** Mail is other people's words (D96 prompt rule); an
  instruction inside a mail is data.
- **Never keep the mail.** Only typed facts with pointers (§9); Mem gets only distilled,
  durable things, with 记下了.
- **Never invent urgency or nag.** No counts of unread mail, no streaks, no "you still haven't…"
  twice. A find said once and ignored is not said again unless something changed.
- **Never wake the person** except for a kind they asked to be woken for.
- **Never watch without asking.** Connecting is not consent to watch (dots, research/35); the
  first add asks once, with a default.

## 4. What it notices: seven kinds

Each find is typed (stage 2 extracts, stage 3 judges). The kind is what the person reacts to
("这类不用告诉我"), so each kind has a plain name.

| Kind (zh / en) | What it is | Sources | When it is said | Next step it offers | On by default |
|---|---|---|---|---|---|
| **两件事对不上 / Two things don't match** (the aha) | Two facts that contradict or leave a gap: a flight lands the night before the hotel starts; a renewal notice with no payment after it and the card expired; an invoice with no matching bank mail; a meeting during a flight | mail + calendar, joined through the ledger (§9) over 60 days | the morning note; **now** only if it costs something today | a 上网 task that looks it up (Go), never the change itself | yes |
| **在等你回 / Waiting on you** | A real person asked you something (a question, a request, a review) and you haven't answered in 2 working days, or they asked again | mail, GitHub review requests, Discord DMs and @-mentions | the morning note | read it first and write up what matters (a task, Go); a draft reply kept in Ducter (Go to save or send) | yes, people only (no lists, no bulk, no noreply) |
| **你在等别人回 / You're waiting on someone** | You asked a question or made a request, and nobody answered in 3 working days, and it mattered (a deadline, money, a person who matters, Mem) | your sent mail | the morning note | a short follow-up draft (Go) | yes |
| **你答应过的 / Something you promised** | A commitment in your own sent mail or messages ("我周五前发给你") with nothing showing it was kept | sent mail (14 days, research/46) | the morning of the due day | find the related draft or files; a draft reply (Go) | yes |
| **快到期 · 要花钱 / Deadlines and money** | A renewal, a price going up, a trial ending, a bill or a form due | mail (+ Mem: the last price) | the morning note, a few days ahead; **now** the day before if unpaid | open the renewal page in Ducter's browser (Go); paying is the person's | yes |
| **计划变了 / A plan changed** | A flight changed or was cancelled; a meeting moved into a clash | mail, calendar | **now** if it affects today or tomorrow, else the morning note | look up options (Go) | yes |
| **开会前 / Before a meeting** | 10 minutes before a meeting with people you have something open with: their last thread, the open item, what you promised them | calendar + the other kinds | in the conversation 10 min before; a silent notification if you aren't in Ducter | — (it is the prep) | yes, only with something open; never for a meeting with nothing open |

Kinds left out on purpose: newsletters, receipts, shipping updates that say it all in the
subject, "you have N unread", social notifications, anything GitHub or the calendar already
pushes. They go to the **没说的 / Left out** count.

## 5. When it speaks: one ladder, one switch

The existing escalation (principle 7: badge → message → push → call) with proactive rungs:

| Rung | What reaches the person | Which finds |
|---|---|---|
| **Left out** | One line at the end of the morning note: "没说的：12 封通知和收据，看标题就知道；1 封像推销。" | everything below the bar |
| **The morning note** | One message in the conversation at the end of quiet hours; one **silent** notification (Apple's passive level; research/46) | up to the daily cap |
| **Fold-in** | While the person is in Ducter, a find that is timely today joins the open living message (principle 7, revised in place, never re-notifies) | today's finds after the morning |
| **Now** | A notification that may come through (time-sensitive, which the phone lets them turn off per app) | only "costs something today and needs you": a flight changed today, a domain that lapses tomorrow unpaid. Counts within the cap |
| **Before a meeting** | A line in the conversation; silent notification when away | 开会前 only |

**Quiet hours** (D59, built) hold everything. The only way through at night is a **per-kind
exception the person said** ("航班改了，夜里也叫我"), kept as a Rule in 你的规则 (D89's list,
"不要这条" removes it). Ducter never proposes one.

**The proactive switch: one chip row** (single choice), on Settings › 账号 above the cards and
mirrored in Settings › 通知 (什么时候找你):

| Chip (zh / en) | Means |
|---|---|
| **只说急的 / Only urgent** | Only the "Now" rung; no morning note |
| **每天最多 3 件 / Up to 3 a day** (default) | Morning note with ≤ 3, plus "Now" within the 3 |
| **有用就说 / Whenever useful** | No cap; still batched into the note and fold-ins |
| **不用主动找我 / Only when I ask** | Nothing proactive; it reads only when asked. Watching stops (no cost) |

Why a cap of 3 and not a confidence bar alone: the research says false alarms are the main
failure (ProactiveBench, KnowU-Bench, research/35), and no product publishes a cap; 3 fits one
phone screen with a next step each. INFERRED, to be tuned by the triage eval (§12).

## 6. The morning note

- **When:** at the end of quiet hours (08:00 by default), in the person's zone. If they open
  Ducter earlier, it is assembled then. Never at a fixed time that could wake them.
- **What:** one partner message, the partner's own voice, first person, plain, dates and
  amounts exact, no exclamation marks:
  1. one opening line with what it looked at, so silence is trustworthy: **早。昨晚到现在看了 214
     封信、今天的 5 个会和 GitHub，有 2 件值得你知道。**
  2. up to 3 finds, each **≤ 2 sentences** (zh ≤ ~60 characters; How I know and the two learning buttons share one row), most costly first, each with
     its one next step as a Go button (D73 labels), **先等等 / Hold**, and **怎么知道的** folded;
  3. one **没说的** line (§5).
- **Length:** the whole note fits one phone screen at 390 × 844 without scrolling.
- **Silent days:** when nothing clears the bar there is **no message and no notification**. The
  conversation's header line (where **手头没事，随时说** sits today) says **早上看过了，没有要你操心的
  / Looked this morning — nothing needs you** until the person next writes. Trust without noise.
- **On the lock screen:** the notification's title is the partner's name, its body the opening
  line ("有 2 件值得你知道：ducter.dev 11/16 到期还没续费；11/21 那晚还没订到住处"). It goes
  through D159's encrypted path; previews follow the phone's own "显示预览" setting (no new
  Ducter setting). Tapping opens the note.
- **Held over:** a find not acted on stays as a decision on 手头的事 until its date passes, then
  quietly becomes **过了 / Passed** (never "done" on its own); it is not said again unless
  something changed.

## 7. Following through: a find becomes a task only on Go

Every find offers at most one next step, as a decision (D61's effect ladder):

| Step | Effect | Default | After Go |
|---|---|---|---|
| Look it up (the hotel's site, the registrar, rebook options) | reads the web | **Go** label names it; default **Hold** (background-raised asks never auto-run) | a task with 上网 on the device that has it (D157), reports back in the conversation |
| Read it first (a PR, a long thread) | reads | Hold | a task; its report is the write-up |
| A draft (reply, follow-up, a form) | writes nothing outside Ducter | Hold | the draft is shown whole in the conversation; a second Go **存成草稿 / Save as draft** or **发出去 / Send** writes once (D96) |
| Pay, accept, change a booking | the person's own | — | Ducter opens the page and stops (takeover, D48) |

Asks raised by background work **expire into Passed** with the find's date (the Grok bot's
30-minute expiry is too short for a morning note; the find's own deadline is the honest limit).

## 8. Learning from reactions

- Under each find, two quiet text buttons: **有用 / Useful** and **这类不用告诉我 / Don't tell
  me this kind**. The second becomes a Rule in **你的规则** worded in the kind and the sender
  ("Cloudflare 的续费提醒不用告诉我"), removable with **不要这条**. One tap, said back once:
  **好，这类以后不说了。** No settings page for kinds.
- Implicit signals, per kind and per sender: Go and 有用 raise; Hold, ignored and "这类不用告诉我"
  lower. Three ignored finds of a kind in 14 days raise that kind's bar (it needs a higher
  cost-if-missed to be said).
- **3 unread morning notes in a row** → the notes pause and the next time the person writes,
  one line asks **早上那条还要吗？/ Keep the morning note?** with **要 / Keep** (default) and
  **不用了** (= the chip **只说急的**). The routine rule (D114), reused.
- People: who the person answers fast, who reviews whose PRs, what money they watch, goes to Mem
  as distilled facts only when the partner is sure (§9).

## 9. Privacy

- **Mail itself is never kept.** The broker logs action, read/write and a ≤ 200-character
  summary (built). Triage sees headers and a 2 KB snippet in a batch; the full body is read only
  by the stage-3 judge or a task the person approved, and is never written down.
- **The findings ledger** (`<dataDir>/findings.json`, 0600, on the home): typed facts only, each
  with a pointer (message id, event id) and the date it stops mattering: bookings (kind, place,
  dates), renewals (what, expiry, amount), payments, commitments (to whom, what, by when),
  waits (thread, since). Facts expire 30 days after their date. Removing an account drops its
  facts. This is how two mails weeks apart can meet without re-reading the inbox.
- **Mem** gets only durable gists the partner is confident about ("Lina 在 mem 组，PR 常找你
  review"), with the usual **记下了 / Noted** line and provenance, under the existing **记住事情**
  switch. Never a quote from a mail.
- **Per account:** each app in the card has **自己留意 / Watch on its own** (on by default for
  mail, calendar, GitHub; Discord and Slack watch only @-mentions and DMs). Off, it is read only
  when asked. **不让 Ducter 看这个 / Don't let Ducter read this one** excludes an account
  entirely (the existing `policy.deny`, now with a control).
- **Reading is logged and visible:** the card's status line says what it read today, and **看了
  哪些 / What it read** opens today's reads (the `connection_call` summaries) in place.
- **The honest line** stays on every card: where mail passes (OOMOL's servers, or your own
  machine) and **它读到的内容会给你的 AI 账号看，别人拿不到。**
- **Personas:** accounts are the person's; only the first persona watches them by default
  (product-model §5).

## 10. Cost: the cascade, with oo

| Stage | Runs | Cost |
|---|---|---|
| 0. Look | **oo:** a model-free scheduled read through the broker (`gmail.search_threads` newer than the last look, every 10 min; calendar every 15 min; GitHub notifications every 10 min; Discord mentions and DMs every 10 min), because oo has no triggers (`OO_NOT_WATCHABLE`). **OpenConnector:** Provider Triggers with a checkpoint (built for waits). | no model; oo or OpenConnector calls |
| 1. Rules | code: drop bulk (`List-Unsubscribe`, Promotions/Updates), the person's own sends (kept for the waits/commitments ledger only), already-read-elsewhere, muted senders and kinds | none |
| 2. Triage | the cheapest capable model over batches (≤ 20 items, headers + snippet), only when stage 1 passed something: kind, typed facts, who's waiting, confidence | ~5–15 small calls a day for a typical inbox (INFERRED) |
| 3. Judge | the partner in a fork (principle 6) with Mem recall and the ledger, once before the morning note and on a "Now" candidate | a few calls a day |
| 4. Say | the morning note, fold-ins, "Now", rendered from typed finds | none |

**Budget:** each source has a monthly model budget (the routine mechanism, D114; default 2M
cheap-model tokens), shown in the card's detail as **这个月用了 3%**. At the budget it drops to
**只说急的** for the rest of the month and says so once. "Only when I ask" costs nothing.

## 11. The first account: one moment, one question

1. The person taps **用这些账号** (oo) or **检查并加上** (a key). The card lands (§12), and
   **the partner speaks in the conversation**, not a toast:
   **已经能看你的 Gmail、日历、Discord 和 GitHub 了。要不要我现在看一眼过去 3 天，有没有在等你回的？**
   · **好，看一眼 / Take a look** (the default) · **先不用 / Not now**.
2. Go: a read-only look (stages 1–3 over 3 days), said within about a minute:
   **看了 3 天的 386 封信。有 1 件：Lina 周一问你 #2141 什么时候能 review，今天又问了一次。**
   (with its next step), or **看了 3 天的 386 封信，没有在等你回的。** Meanwhile, silently, the
   60-day backfill fills the ledger with bookings, renewals and commitments (no message).
3. Right under the answer, the one question, with a default:
   **以后我自己留意着：每天早上把值得说的放在一条里，最多 3 件；急的随时说。这样行吗？**
   · **好 / Sounds good** (= 每天最多 3 件) · **只说急的** · **不用主动找我**.
   The answer is the chip row's value; the partner says nothing more about it.
4. If the person says nothing, nothing watches: the chip stays **不用主动找我** until they answer
   (connecting is not consent to watch).

Saying it works too: "帮我盯着邮箱，有要紧的告诉我" with no account leads to the one tap (oo
signed in) or the add form, then the same three steps.

## 12. The accounts card (draft D166): a character sheet for a source

D161's language, for where accounts come from. One card per source: **oo**, **OOMOL** (Hosted),
an **OpenConnector** of your own, or **another MCP server**. Nothing new to learn: the
mailbox (research/35 §5's unlabeled winner, 5/5), app tiles, chips and the in-place detail are
existing parts; the app tile is literal (an app's rounded square), not a metaphor.

1. **Who:** the source's clay mailbox at 120 (phone 104) on the sunken oval, its colour saying
   where it runs (OOMOL's accent orange for oo and Hosted, the working blue for your own
   OpenConnector, muted for another server). The lid lifts a little while it looks; asleep (only
   when asked) it is still; signed out or refused, grey in mist. Its name under it: **oo 里的账号
   / Accounts in oo**, **OOMOL**, the name you gave your OpenConnector, the server's name.
2. **How it is: one status line** (D161 (2), muted ink; exceptions in their ink):
   - watching: **今天看了 214 封信 · 有 1 件值得说 / Read 214 emails today · 1 worth telling**
     (nothing worth it: **今天看了 214 封信 · 都不用你操心**);
   - only when asked: **你问起来才去看 / Reads only when you ask**;
   - signed out of oo: **oo 退出登录了 · 在终端里运行 oo login** (failed ink);
   - refused key: **钥匙失效了 · 换一把** with **去拿钥匙** (failed ink, D158);
   - nothing connected there: **OOMOL 里还没连账号 · 去连一个** (D158).
3. **What it can read: a tray of app tiles.** Each connected account as a small clay tile
   (rounded square, 48; phone 52) with the app's printed mark (official marks where their
   guidelines allow, as D146), the label under it (**Gmail · work**, **日历**, **GitHub**). A
   tile not watched sits flat and a little faded; a tile oo or OOMOL can't reach is grey. A
   dashed tile at the end, **在 oo 里再连一个 / Connect another in oo**, opens oo's or OOMOL's
   page (accounts are connected there, not in Ducter).
4. **Tap a tile → its detail in place** (never a floating layer): **Gmail · wey@nowledge.co**;
   **会看：新邮件的发件人、标题和开头几行；要细看才读全文**; **先问你：发信、回复、存草稿、改标签、
   删除**; **最后看过 2 分钟前**; the **自己留意 / Watch on its own** switch (Discord: **只看 @你
   和私信**); **这个月用了 3%** when watching; at the foot, quiet: **不让 Ducter 看这个** (and for
   oo: **要退出登录，去 oo 里**).
5. **The proactive chips** (§5) sit once above the cards, titled **自己发现了事，怎么告诉你 / When
   it notices something**; with a single source the page reads as one sheet.
6. **One connection line:** **经过 oo · 邮件会经过 OOMOL 的服务器 / Through oo · your mail
   passes through OOMOL's servers** with one ⋯ that opens, in place, **看了哪些 / What it read**
   (today's reads, one line each) and the honest line about the AI account.
7. **Foot:** one destructive text button, **不用 oo 里的账号了 / Stop using the accounts in oo**,
   confirmed inline: **不用了以后它就看不到这些账号；记下的事还在「记得什么」里，可以忘掉。** ·
   **算了** · **不用了**.
8. **Default text: five lines** (name, status, tile labels, the connection line, the foot).
   Everything else is one tap away.
9. **Phone:** the same sheet in one column; tiles wrap four to a row; the detail opens in place.
10. **Add one:** **加一个 / Add one** steps back to a quiet text button under the cards (adding
    a second source is rare; the primary button no longer invites it).
11. **Motion** (ui.md tokens; reduced motion: none): the card lands with the mailbox's equip
    snap (D65) on the first add; the lid lifts 3 pt for 600 ms when a look runs (at most once a
    minute on screen); tiles enter one by one (40 ms stagger, 220 ms enter); chip squish (D161).

### 12.1 Prototype review (2026-11-10, against D36)

Shots in `.shots/accounts/` (headless Chromium, 1340 wide, still, zh and en): `01-before-after`,
`02`–`04` the first account, `05-morning` (lock screen, the note, a quiet day), `06`–`07` the
aha find, its task and the new rule, `08-kinds`, `09-mac-page` (four sources, Gmail's detail and
看了哪些 open), `10-mac-stop`, `11-phone`; today's real views in `current/` (Mac headless from
the desktop's own renderer, phone from a scratch core with a fake oo).

- **好用:** the one decision a person makes (how it tells them) is one chip row with a default;
  everything about an app is one tap on its tile. The first add asks two things in a row
  (look now? then the cadence); each has a default, but it is two taps, not one. Acceptable,
  because the first answer is the reward that makes the second question make sense.
- **顺滑:** the first add flows from the tap into the conversation without leaving it; the
  aha find goes find → Go → task line → result in one column. The morning note with three
  finds fits one phone screen only after folding How I know and the two learning buttons onto
  one row and keeping each find to two short sentences (first draft overflowed by a third of a
  screen); the build must hold that budget (zh ≤ ~60 characters a find).
- **赏心悦目:** the mailbox hero gives each source a character, and the four colours read as
  four places at a glance; the app tiles read as apps, unlike research/35's round tokens (read
  as letters). The drawn mailbox and glyphs are stand-ins; real clay art and marks are owed
  (`todo.md`). The English connection line wraps on the phone ("…OOMOL's servers"); the build
  needs a shorter en form.
- **放心:** the status line says what it read today; 看了哪些 shows each read; every next step
  waits for Go; "这类不用告诉我" lands in 你的规则 where it can be undone; a quiet day says it
  looked. Not shown and owed: what a person sees in Mem after a find (记下了).
- **惊喜:** the first look answers within a minute with a real person waiting; the flight/hotel
  join and the task that comes back with the price are the moments the author named. Owed: the
  mailbox lid lifting on a real look, and the equip snap on the first add, at full motion.

## 13. Words (zh / en; D78 spacing; ★ new keys)

| Key | zh | en |
|---|---|---|
| ★ `proactive.title` | 自己发现了事，怎么告诉你 | When it notices something |
| ★ `proactive.urgent` · `.three` · `.useful` · `.off` | 只说急的 · 每天最多 3 件 · 有用就说 · 不用主动找我 | Only urgent · Up to 3 a day · Whenever useful · Only when I ask |
| ★ `note.open` | 早。昨晚到现在看了 {n} 封信{、extra}，有 {k} 件值得你知道。 | Morning. Since last night I read {n} emails{, extra}; {k} worth knowing. |
| ★ `note.left_out` | 没说的：{list} | Left out: {list} |
| ★ `header.quiet_day` | 早上看过了，没有要你操心的 | Looked this morning — nothing needs you |
| ★ `find.useful` · `find.mute` | 有用 · 这类不用告诉我 | Useful · Don't tell me this kind |
| ★ `find.muted` | 好，这类以后不说了。 | OK, I won't mention this kind again. |
| ★ `find.passed` | 过了 | Passed |
| ★ `kind.*` | 两件事对不上 · 在等你回 · 你在等别人回 · 你答应过的 · 快到期 · 要花钱 · 计划变了 · 开会前 | Two things don't match · Waiting on you · You're waiting on someone · Something you promised · Deadlines and money · A plan changed · Before a meeting |
| ★ `first.offer` | 已经能看你的 {apps} 了。要不要我现在看一眼过去 3 天，有没有在等你回的？ | I can read your {apps} now. Want me to look through the last 3 days for anything waiting on you? |
| ★ `first.go` · `first.no` | 好，看一眼 · 先不用 | Take a look · Not now |
| ★ `first.ask` | 以后我自己留意着：每天早上把值得说的放在一条里，最多 3 件；急的随时说。这样行吗？ | From now on I'll keep an eye out: one note each morning with up to 3 things, and anything urgent right away. OK? |
| ★ `note.pause` | 早上那条还要吗？ | Keep the morning note? |
| ★ `card.status.read` | 今天看了 {n} 封信 · 有 {k} 件值得说 | Read {n} emails today · {k} worth telling |
| ★ `card.status.calm` | 今天看了 {n} 封信 · 都不用你操心 | Read {n} emails today · nothing needs you |
| ★ `card.status.asked` | 你问起来才去看 | Reads only when you ask |
| ★ `card.oo_out` | oo 退出登录了 · 在终端里运行 oo login | oo is signed out · run oo login in a terminal |
| ★ `tile.reads` · `tile.asks` | 会看：{what} · 先问你：{what} | Reads: {what} · Asks you first: {what} |
| ★ `tile.watch` · `tile.mentions` | 自己留意 · 只看 @你 和私信 | Watch on its own · Only @-mentions and DMs |
| ★ `tile.exclude` · `tile.signout_oo` | 不让 Ducter 看这个 · 要退出登录，去 oo 里 | Don't let Ducter read this one · Sign out in oo |
| ★ `tile.more.oo` | 在 oo 里再连一个 | Connect another in oo |
| ★ `card.read_list` | 看了哪些 | What it read |
| ★ `card.stop` · `card.stop.ask` | 不用 {name} 了 · 不用了以后它就看不到这些账号；记下的事还在「记得什么」里，可以忘掉。 | Stop using {name} · Once stopped, it can't read these accounts. What it noted stays in What it remembers, where you can forget it. |
| ★ `card.budget` | 这个月用了 {p}% | {p}% of this month's budget used |
| `acct.remove.ask` (built) | 移除 {name}？Ducter 就看不到这些账号了。 | Remove {name}? Ducter won't read these accounts anymore. |

Retired by D166 when built: the row's **{apps} (2) · …** line and the source line as a second
line (the tray and the connection line say them), **加一个** as the page's primary button.

## 14. Build steps (for `todo.md`; each a small PR with tests)

1. **Watch for oo** — a system watcher per source on the routine engine (D114: budget, unread
   pause, review): model-free scheduled reads, checkpoints by newest id/time in the waiter table.
2. **Stage 1 rules + the findings ledger** (`findings.ts`, 0600, expiry, drop on remove).
3. **Stage 2 triage** on the cheap model, typed output per kind; **the triage eval** first: a
   labeled set from the author's real inbox, private, outside git (like research/15), false
   alarms and misses per kind.
4. **Stage 3 judge + the morning note** as a typed `finds` report rendered by the core (like
   the living message), the silent-day header line, the passive notification (D159 path).
5. **The first-account moment** (§11) and the chip row (settings: `proactive`).
6. **Reactions:** 有用 / 这类不用告诉我 → rules; per-kind bars; the 3-unread pause.
7. **Follow-through:** each find's one next step as a decision; drafts kept in Ducter.
8. **The card** (D166) on Mac and phone; `policy.deny` control; 看了哪些.
9. **Meeting prep** and **Now** (time-sensitive) last, after the eval shows the bar holds.
10. Live trial on the author's oo with a scratch home, like the 2026-11-09 one.

## 15. The author's calls (each with a proposed default; "按建议" takes them all)

1. **Seven kinds**, all on by default except as noted (Discord/Slack: mentions and DMs only).
   **Default: yes.** Alternative: start with three (two things don't match, deadlines and
   money, waiting on you) and add the rest after the eval.
2. **Cap 3, one morning note, silent on nothing days** (the header line instead of a
   message). **Default: yes.** Alternative: a one-line "nothing today" message every morning.
3. **"Now" only for "costs something today and needs you"**, time-sensitive, inside the cap;
   night only by a per-kind rule the person said. **Default: yes.**
4. **Watching starts only after the one question** (no answer = only when asked). **Default:
   yes.** Alternative: start watching at the default and say so (faster aha, weaker consent).
5. **The first look: 3 days for "waiting on you", plus a silent 60-day ledger backfill.**
   **Default: yes** (replaces D101's 14/60).
6. **oo is watched by model-free polling** every 10 min (15 for calendars). **Default: yes.**
   Alternative: wait for oo to grow triggers (then nothing proactive for oo users).
7. **The card** as §12: mailbox hero, app tiles, chips above the cards, one destructive.
   **Default: yes**; the human comprehension test of tiles and mailbox still owed.
8. **Meeting prep 10 min before, only with something open.** **Default: yes.**

**Still open** (carried from Draft 3): the triage eval set (build step 3); a Linux home without
a desktop for self-hosted Google consent; several personas reading the same accounts (default:
the first persona only); a watcher over a browser profile (v2); the human comprehension test of
the mailbox and the app tiles (with D65's).

# Part B. The broker and the setup, as built

Unchanged mechanisms (D96, D122, D158), kept for reference. Proactive words in this part
(watchers, the cascade) now mean Part A's.

## 16. Where connections live

- **Ducter doesn't hold provider accounts. The user's OpenConnector does** (D96). It is either
  OOMOL Hosted or their own self-hosted OpenConnector. Ducter attaches to its MCP endpoint
  through Ducter's own broker in the control plane on the computer Ducter lives on:
  - OOMOL Hosted: `https://connector.oomol.com/v1/mcp` with `Authorization: Bearer <API key>`,
    the key made at `console.oomol.com/api-key` (D158, research/44);
  - self-hosted: `<base>/mcp` with a Bearer runtime token from its Access page.

  Any other MCP server attaches the same way.
- **Or the user's oo does** (D122). With OOMOL's `oo` CLI signed in, Ducter reads the accounts
  connected there by running oo itself (§18.4). There is no token at all on Ducter's side for
  this kind: oo's sign-in stays in oo.
- **The token lives only in Ducter.** It is kept in `<dataDir>/connection-tokens.json` (0600).
  It never appears in a harness's config, env, args or files, never in the Log, and never in
  a client frame.
  - The one rule for every secret (D102): a 0600 file in the data folder, read only by the code
    that uses it. `keys.env` holds the keys a harness itself needs (each passed only to that
    harness), and the token file holds what only the broker needs. Nothing loads either into a
    process environment, and every harness child's environment is an allowlist that strips
    any other key or token, so the token can't leak through one either.
  - macOS Keychain is a later option for both.
- **Shown in Settings › 账号 / Accounts** (D150), one card per source (draft D166, §12); the
  devices stage may later stand the mailboxes on the home's island through `homeMailboxes()`
  (web) / `HomeMailboxes()` (desktop), not called yet.
- **Workers never hold a token.** A task on a worker reaches a connection through the main's
  tool server.

## 17. Architectures compared

| | A. Harness-native MCP | B. Ducter embeds a connector engine | C. **The user's OpenConnector behind Ducter's broker (D96)** |
|---|---|---|---|
| Shape | Vendor or community MCP servers, with their tokens, in each session's `mcpServers` | open-connector's headless runtime inside the control plane; Ducter runs the OAuth flows | The user runs (or rents) OpenConnector; Ducter is an MCP client to it, behind its own broker |
| Provider OAuth | Each server's own | Ducter's problem: every self-hosting user brings a Google client | OpenConnector's problem: OOMOL Hosted has verified apps; self-hosted users bring their own, in OpenConnector's console |
| Credentials in Ducter | Inside harness config | All provider tokens | One runtime token (scoped on OpenConnector's side) |
| Mail leaves the machine | To the model provider | To the model provider | Hosted: to OOMOL and the model provider. Self-hosted: to the model provider only |
| Gating "send" | None | Ducter's gate | Ducter's gate, plus OpenConnector's own action policy |
| Cost to build and keep | Lowest | High (the engine churns several times a day; a re-license risk) | Low: one MCP client and a gate |
| The author's daily tool | No | No | Yes: the author already uses OpenConnector through `oo` |

**Decided: C** (D96, "同意，我们这里内聚一点"). Ducter stays cohesive: a partner and a gate,
not a connector platform. B remains possible if OpenConnector ever goes away, because the
broker speaks only MCP.

## 18. The broker (as built, 2026-11-09)

`packages/core/src/connections.ts`, `connection-tools.ts`; partner tools in
`packages/partner/src/partner.ts`.

### 18.1 Pieces

- **Store.**
  - `<dataDir>/connections.json` (0600) holds the address, name, source and how it was added.
    The source is `oomol` (the host is under oomol.com), `self` (an OpenConnector anywhere else),
    `mcp` (any other MCP server) or `oo` (the user's oo CLI, D122: no address and no token; the
    record's address is `oo:`).
  - Tokens are kept apart in `connection-tokens.json` (0600).
  - Removing a connection drops its token.
- **Adding one.**
  - The address is normalized. Any form of `connector.oomol.com` (bare, `/mcp`, `/v1`,
    `/v1/mcp`) is `https://connector.oomol.com/v1/mcp` (D158; a record saved at `/mcp` moves on
    load); `/mcp` is appended to any other OpenConnector base. Plain http is allowed only for
    this machine or the local network, and an address with credentials, a query or a fragment
    is refused. A pasted key loses its spaces and line breaks.
  - OOMOL Hosted with no key is refused before anything is sent (`no_key`).
  - Then the broker checks it. It connects, lists the tools, and recognises OpenConnector by
    `search_actions`, `get_action_guide` and `execute_action`; anything at OOMOL Hosted's
    address is `oomol` whatever its list.
  - The answer comes from the HTTP status the MCP SDK keeps in its error's `code` (its message
    may hold only the server's text, like OOMOL's `token not found`): 401/403 `unauthorized`,
    5xx `unreachable` (as are network failures), any other 4xx or a non-MCP answer `not_mcp`.
    Also `bad_url`, `duplicate`, `no_key`.
  - **What it can read** (D158): for an OpenConnector, `GET <base>/v1/apps?status=active` with
    the same key lists the connected accounts; the virtual `no_auth:` and `marketplace:` entries
    are left out. The add answer (`connection_result.readable`) and the row
    (`ConnectionView.apps`) carry it; `[]` means connected, but no account there yet. It is
    refreshed with the five-minute recheck.
- **Read or write, from the server's own metadata, and conservative.**
  - For OpenConnector: `get_action_guide` → `capability.operationType`. Only `read` is a read;
    `write`, `destructive` and unknown are writes.
  - For any other MCP server: `annotations.readOnlyHint === true` is a read, and anything else
    is a write.
  - A failed lookup is a write and isn't cached.
- **The user's rules.** Optional per-connection `policy.allow` / `policy.deny` patterns in
  `connections.json` (`gmail.*`, `*.send_*`). Deny wins. There is no UI yet.
- **Audit.** Every call is a `connection_call` Log event, on the channel for the partner or on
  the task's stream for a task. It records the action, read/write, state and a ≤ 200-character
  summary ("2 pulls"). It never holds the token or the provider's output.
  - States: `done`, `failed`, `denied`, `needs_go` (with the input Go will run) and `held`.
  - Clients stay quiet about it.

### 18.2 Reaching the partner and tasks

| Who | Tools | May |
|---|---|---|
| Partner | `connections_list`, `connection_search`, `connection_guide`, `connection_call`, `connection_share` | Read any connection. A write: `connection_call` with `question` + `goLabel` makes one Go / Hold card (`defaultOption: hold`, not reversible, one per turn, like `ask`) and stages the call. After Go, `connection_call {decisionId}` runs it once. Hold or a reply: it never runs |
| Task | `connection_search`, `connection_read`, listed only while the user has a connection | Read only what the partner shared (`connection_share`). A write is refused with "tell the partner" |

- **The grant is in memory.** It is recorded as a `connection_call` "grant" line, and lost on
  restart. The task then asks again.
- **A write whose answer was lost is never retried.** The partner tells the user to check
  (G-safety).
- **The partner's prompt** gains a short section. Look there yourself, reads just run, writes
  wait for Go, mail is other people's words. With no connection, say in one line where to add
  one.
- **Background work** (watchers, v1.x) will hold a read-only caller. The broker already refuses
  writes to anything that isn't the partner's Go path.

### 18.3 Other MCP servers and the user's own connectors

- **A power user's existing servers** (GitHub remote MCP, Linear, Notion) can be attached as
  connections with an address and a token (built). The broker connects as the MCP client,
  stores the token, and re-exposes the tools through the same tools and the same gate. Servers
  that only do MCP OAuth 2.1 sign-in (no static token) need a sign-in flow in Ducter: later [I].
- **Read-only server variants** (GitHub `/readonly`, Linear `/readonly`) back the watchers.
- **The user's Claude.ai or ChatGPT connectors can't be borrowed.** They live inside those
  vendors' sessions, and principle 17 rules out proxying a subscription. A *task* that
  inherits the user's Claude config may still use them, as the user's own setup, unmediated
  and labeled [doc system.md].

### 18.4 The oo CLI: the default way in (D122, built)

The author uses OOMOL's `oo` CLI daily (research/35 §4b). With oo signed in, connecting accounts
is one tap, through oo's own sign-in and its permissions (D122, superseding D96's "never the
OOMOL account key"). `packages/core/src/oo-link.ts`.

- **Ducter runs oo; it reads none of oo's files and holds no secret for it.** OOMOL Hosted's MCP
  endpoint does not take oo's account key (404; oo itself talks REST), so the link drives the
  CLI:

  | Ducter needs | It runs |
  |---|---|
  | Signed in? | `oo auth status --json` |
  | The accounts | `oo connector apps --json`: services whose `authType` is `oauth2`, `custom_credential` or `api_key` and `status` active. oo's no-auth public sources and its billed marketplace services are left out |
  | The actions | `oo connector search <text> --json` (deduped; oo has no "list actions", so a service's catalog is a few searches, read verbs first) and `oo connector schema <service>.<action>… --json` in one call |
  | A call | `oo connector run <service> -a <action> -d @<file> --json [--connection-name <name>]` |

- **The input goes through a file, never argv** (argv shows in `ps`): a 0600 file in a fresh
  0700 temp folder, deleted after the run.
- **Environment.** oo runs with PATH (plus oo's own folder), HOME, XDG_CONFIG_HOME/APPDATA (where
  oo keeps its config) and `OO_*` only. No harness key or token.
- **Tools.** One per action, named `<service>.<action>`. A service with several accounts gets an
  optional `connection` input listing their names (and labels); without it, oo's default runs.
  The partner sees each service and its accounts in `connections_list`; it passes an account as
  `account`. An unknown account is refused before oo runs.
- **Read or write, from the action's name** (`ooOp`), because oo gives no hint. A read only when
  the name starts with fetch, list, get, search, read, query, find, lookup, count, describe,
  retrieve, view or show and no later word changes anything (send, reply, create, add, modify,
  update, delete, trash, archive, move, mark, batch, download, upload, watch, `and`, `or`, …).
  Everything else, unknown included, is a write and goes through the Go card (§18.2). Examples:
  `gmail.fetch_emails`, `gmail.get_draft` read; `gmail.create_email_draft`,
  `gmail.download_attachment` (it uploads to oo's file transit), `gmail.settings_get_imap`
  (not a verb first) and `gmail.get_or_create_label` are writes.
- **Errors.** oo missing or too slow (60 s for a run, 20 s for a listing; the process is killed)
  → `unreachable`; "You must log in" and the like → `unauthorized`; the action's own error
  ("input payload is invalid") comes back to the model as an error result so it can fix the input.
- **Cadence.** The account list is cached for the recheck cadence (5 min); a service's catalog
  for an hour, warmed in the background right after the tap.
- **Detection.** The Settings frame says `account` (signed in, from `oo auth status`; before
  oo answers, a guess from `auth.toml`'s size, never its contents) and `apps` (each service, its
  accounts' labels) once oo has listed them.
- **Not signed in.** The tap answers `oo_signed_out` ("run `oo login`"). An oo that isn't signed
  in but has a self-hosted OpenConnector (`OO_CONNECTOR_URL`, or `[self_hosted]` in its
  `connector.toml`) still gets the older tap that reads that address and token, only on the tap.
- **Sessions can't go around the gate.** A harness can run `oo` itself: Claude Code's own skills
  (the user's `oo-gmail`) or a Bash line. So every harness child gets `OO_CONFIG_DIR` pointing at
  an empty 0700 folder (`<dataDir>/oo-signed-out`), where oo is signed out; only the broker's
  link runs oo with the user's sign-in (`packages/runner/src/oar.ts`, D122 (6)).
- **Narrower access** is now oo's job: OOMOL's own console sets which actions a member may run
  (permission groups). Ducter's per-connection `policy` rules (§18.1) apply on top.

### 18.5 Watching (partly built: event waits on a self-hosted OpenConnector only; never run against a live one)

OpenConnector's Provider Triggers HTTP API carries the watchers (research/35 §4):
- `POST <base>/v1/providers/<service>/triggers/<triggerId>/execute` with
  `{operation: "read", config, checkpoint}`.
  - The first read takes `checkpoint: null`. Later reads pass back the returned checkpoint
    (built, `readTrigger` in `packages/core/src/connections.ts`).
  - `hasMore` should drain the next page. **Not built:** one read per look, so a burst larger
    than a page waits for the next look.
  - The checkpoint lives in Ducter's waiter table (principle 16), never in a model.
- A **trigger-scoped runtime token** (`allowedTriggers: ["gmail.on_message_received"]`,
  `blockedActions: ["*"]`) should be the watcher's own credential: it can read new-mail events
  and run nothing. **Not built:** the watch uses the connection's own token.
- **oo accounts can't be watched (as built).** oo (D122) reaches accounts through its CLI, and oo
  1.9 has no triggers (`oo connector` is search / schema / run / proxy / apps). `wait_for` and
  `routine_propose` refuse an event on an oo account before any wait is set, and say what to do
  instead: a check that looks every few minutes, or a routine on a schedule that reads it. A read
  of one (an older wait) gets the same answer and never posts to `oo:`. Revisit when oo grows
  triggers.
- Webhook triggers (`reconcile`) need a public URL. They are for later.
- What a watcher finds goes through the cascade in §10. The watcher's caller is read-only by
  construction.

### 18.6 The browser as a connector (上网)

- **Zero-setup fallback** [I]. For services with no API, or for a person who won't make a
  Google client, a task can sign in by takeover in the Ducter browser (D48) and read there.
- It is slower, costs more tokens and breaks more often (CAPTCHAs on VPS IPs, research/23).
  So it is offered per task ("look in my school's parent portal"), not as a watcher.
- A watcher over a browser profile is a v2 question.

## 19. What the person must set up

| Path | What they do | Where their mail passes |
|---|---|---|
| **The accounts in oo** (D122; the default when oo is signed in) | Nothing: they already connected Gmail and the rest in oo. One tap on **用这些账号 / Use these accounts** | OOMOL's servers, and the AI account |
| **OOMOL Hosted** (default in the form) | Sign in at OOMOL, connect Gmail, Discord and the rest at `console.oomol.com/app-connections` (OOMOL's verified Google apps), make a key at `console.oomol.com/api-key`, paste it (no address to type; D158) | OOMOL's servers, and the AI account |
| **Self-hosted OpenConnector** | Run OpenConnector (Docker or its single binary), register their own Google OAuth client in its console (research/35 §2: publish it *In production, unverified*, never Testing, which drops grants every 7 days), connect, make a token for Ducter on `/access`, paste address and token. Or tap the oo one-tap | Their own machine, and the AI account |
| **Another MCP server** | Paste its address (and token) | Whatever that server does |

The honest line on the form says this, per choice: "OOMOL 托管：…你的邮件和登录凭据会经过 OOMOL
的服务器 / Hosted by OOMOL: … your mail and sign-ins pass through OOMOL's servers" ·
"自己部署的：邮件和登录凭据留在你自己的机器上。代价：Gmail 这类账号要你自己在 Google 那边建一个应用 /
Self-hosted: … stays on your own machine. The cost: … your own app with Google."

**For the maintainer:** nothing Google-side for Ducter itself (D96 removes the shared-client
question). A live test against a self-hosted OpenConnector is still owed (§22).

## 20. The Accounts page as built (D122, D158)

- **The oo offer (D122).** With oo signed in, the card leads with a sunken panel: a
  mailbox, **你在 oo 里的账号 / Your accounts in oo**, "不用配钥匙：Ducter 通过 oo 去看，登录留在 oo
  里。/ No key to set up: Ducter reads through oo, and oo's sign-in stays in oo.", a white list of
  each service and its accounts' labels, the honest line "你的邮件和登录凭据会经过 OOMOL 的服务器。/
  Your mail and sign-ins pass through OOMOL's servers.", and the one primary button **用这些账号 /
  Use these accounts**. Before oo answers: "正在看 oo 里有哪些账号… / Looking at what's in oo…";
  with none: "oo 里还没有账号… / No accounts in oo yet…". The form below steps back to a quiet
  link, **用地址和钥匙加一个 / Add one with an address and key**. Added, the row reads **oo 里的账号
  / Accounts in oo**, "Gmail (2) · Slack · …", "经过 oo · 邮件和登录经过 OOMOL 的服务器 / Through oo ·
  your mail and sign-ins pass through OOMOL's servers". Screenshots: `.shots/oo-connect/`.
- **Equip.** In Settings › 账号 / Accounts, **加一个 / Add one** → where (OOMOL 托管 /
  Hosted by OOMOL · 自己部署的 / Self-hosted · 其他服务 / Something else) → **检查并加上 / Check
  and add** (Return checks too).
  - **Hosted by OOMOL (D158)** has no address field. Three plain steps, each with its page:
    1. **在 OOMOL 登录，把 Gmail、Discord 这些账号连上。** · **去 OOMOL 连账号 / Connect
       accounts in OOMOL** (`console.oomol.com/app-connections`);
    2. **在 OOMOL 控制台新建一把钥匙。** · **去拿钥匙 / Get a key** (a button,
       `console.oomol.com/api-key`);
    3. **把钥匙粘贴到下面，再点“检查并加上”。**

    Then 钥匙 / Key, masked, with **显示 / Show**. Checked empty, the field says **先把钥匙填上。**
    in the failed ink and nothing is sent.
  - Self-hosted and Something else: 地址 / Address, 钥匙 / Key; their setup steps
    (OpenConnector's Access page, Create Token, an MCP server's token) sit behind a quiet **怎么连
    / How to connect** fold.
  - **The answer, in its own look (D158).** Added: **加上了 OOMOL，现在能看：Gmail、Discord** (done
    look); added with nothing connected there: **加上了 OOMOL，不过那里还没有能看的账号。** (info
    look) and on the row **连上了，但 OOMOL 里还没连任何账号。** · **去 OOMOL 连账号**; when it
    didn't say: "Ducter 现在能看 {name} 里的账号了". A refusal shows in the open form as an alert
    (failed tokens, **!**): **钥匙不对或已失效，换一把新的。** (with **去拿钥匙** for OOMOL) ·
    **连不上这个地址。看看网络，过一会儿再试。** · **这个地址上没有 Ducter 能用的账号服务，看看地址对不对。**
    Never in the done look. On the phone the same, in the card; the toast carries only an add.
  - 连上 / connect for an account here is OOMOL's own word for what the person does in OOMOL's
    console (D158); Ducter's own action stays 加上 / add.
  - 钥匙 / Key is OpenConnector's own word on its Access page. It is proposed for the
    glossary, as the one place a person handles one.
  - Never 授权 / authorize, 接入, or "connector" in UI.
  - 连上 / Connect stays reserved for devices (D54).
- **Owed:** the human comprehension test (with the D65 test), and art for the mailboxes (the
  prototype draws them in SVG).

## 21. Scenarios

Scores 1–5: **U** usefulness, **R** restraint (low noise risk), **T** trust (low harm if
wrong), **F** feasibility in v1.x.

The two lead scenarios are the author's own dots moments (first-hand report, 2026-11-09;
research/35 §1.1). Both are aha for the same two reasons:
- **Missing it costs a lot**: a lost domain, or a night with no room in another country.
- **It is a join the person can't easily make themselves.** The renewal notice and the payment
  status live in different mails (or on the registrar's site). The flight and the hotel live
  in two confirmations, weeks apart, from two companies.

| # | Scenario | Who | Sources it needs | U | R | T | F | Σ |
|---|---|---|---|---|---|---|---|---|
| 1 | **A domain renewal you forgot to pay**: the registrar's renewal notice, with no payment receipt after it, and the expiry close (absorbs "a bill due Friday") | all | Gmail (notices, receipts); optionally the registrar's site via 上网 to confirm the status | 5 | 5 | 5 | 4 | 19 |
| 2 | **A flight that doesn't match the hotel**: the booked flight lands on 11/21, but the hotel starts on 11/22 (absorbs "a clash across sources") | all | Gmail (both confirmations); Calendar if the trip is there | 5 | 5 | 5 | 4 | 19 |
| 3 | A teammate's PR has waited on you two days; Go asks a task to pre-read it | dev | GitHub | 5 | 5 | 5 | 5 | 20 |
| 4 | A renewal price went up, or a free trial ends tomorrow | all | Gmail (+ Mem: last price) | 4 | 5 | 5 | 4 | 18 |
| 5 | A flight changed; Go looks up rebook options in the browser | consumer, dev | Gmail + 上网 | 5 | 4 | 4 | 3 | 16 |
| 6 | Someone real asked you a question 3 days ago and you never answered | all | Gmail | 5 | 3 | 4 | 4 | 16 |
| 7 | The kid's school form is attached, due Thursday; Go fills a draft copy | consumer | Gmail + PDF | 5 | 4 | 4 | 3 | 16 |
| 8 | Passport expires before a booked trip | consumer | Gmail + Mem | 5 | 5 | 4 | 3 | 17 |
| 9 | A doctor's appointment tomorrow needs fasting or a form | consumer | Calendar + Gmail | 4 | 4 | 4 | 4 | 16 |
| 10 | CI on main broke after your merge, and nobody owns it | dev | GitHub | 4 | 3 | 5 | 5 | 17 |
| 11 | A decision is waiting on you in a Slack thread you were mentioned in | dev | Slack | 4 | 3 | 4 | 3 | 14 |
| 12 | A "new sign-in" security email: real Google alert, or phishing? | all | Gmail | 4 | 4 | 3 | 4 | 15 |
| 13 | Monthly expense receipts gathered into a draft report (a routine the user asked for) | dev, consumer | Gmail + Drive | 3 | 5 | 4 | 4 | 16 |
| 14 | A weekly "unsubscribe from these 9?" (batched, one Go) | consumer | Gmail | 3 | 5 | 4 | 4 | 16 |
| 15 | A restaurant booking clashes with a new meeting; Go calls to move it | consumer | Calendar + 打电话 | 4 | 3 | 3 | 2 | 12 |
| 16 | An insurance claim form on a portal filled from the email's PDF | consumer | Gmail + 用电脑 | 4 | 4 | 3 | 2 | 13 |
| 17 | A parcel is held and needs an answer by SMS link | consumer | Gmail + 用手机 | 3 | 4 | 3 | 2 | 12 |
| 18 | A meeting moved and you'd be late given your previous one | all | Calendar | 3 | 3 | 5 | 4 | 15 |

**Top 5 for v1.x: #1, #2, #3, #4, #5.**
- **Why these.** #1 and #2 are the moments that actually made a user say "aha", and the
  design is tuned to them first. #3–#5 cover the developer, money and an ability.
- **What #1 and #2 ask of the mechanism.**
  - **Stage 2 extracts typed facts**, not summaries: a renewal (what, expiry, amount), a
    payment (what, when), a booking (kind, place, dates).
  - **Stage 3 joins them.** "A renewal with no payment after it and an expiry within 14 days";
    "a stay that doesn't cover each night between a flight's arrival and the next departure".
  - **The facts live in a small, structured trip-and-renewal ledger on the main.** Two mails
    weeks apart can then meet without re-reading the inbox. Retention follows the Log. It is
    not Mem: Mem gets only the durable gist, if anything.
  - **The 14-day backfill on first sign-in (§11) should reach 60 days for bookings and
    renewals.** Both of the author's moments came from mail older than two weeks (INFERRED,
    from how bookings work).
- **Close calls.**
  - #8 (passport) is strong but rare.
  - #10 (CI) is often already pushed by GitHub, so the bar must check "would they already
    know".
  - #6 (unanswered) is the most useful and the noisiest. It belongs in v1.x+1, after the
    feedback loop has data.

**The words (glossary words; Go labels per D73).** All domains, amounts, names and repos are
examples.

1. **Domain renewal not paid**
   - zh: "ducter.dev 11/16 就到期了。Cloudflare 10/17 发过续费通知（$10.44），之后我没看到付款收据，自动续费的卡也在 10 月过期了。过期以后别人可能抢注。要我在 Ducter 的浏览器里打开续费页吗？付款留给你。"
     · 好，打开续费页 · 先等等 · 回复… · 怎么知道的: 10/17 的邮件《Your domain renews soon》 · 10/02 的邮件《Card expiring》 · 之后没有收据
   - en: "ducter.dev expires on 11/16. Cloudflare sent a renewal notice on 10/17 ($10.44), I haven't seen a payment receipt since, and the auto-renew card expired in October. Once it lapses, someone else can register it. Want me to open the renewal page in Ducter's browser? Paying stays with you."
     · Open the renewal page · Hold · Reply… · How I know: email "Your domain renews soon", 10/17 · email "Card expiring", 10/02 · no receipt after
   - If the registrar's site is signed in on Ducter's browser, a 上网 task confirms the status first ("still unpaid"). Otherwise the item says "从邮件看 / from your mail".
2. **Flight vs hotel**
   - zh: "你 11/21 的 CA929 晚上 21:40 到成田，可是新宿那家酒店订的是 11/22 入住。11/21 那晚还没有地方住。要我看看这家酒店能不能提前一晚吗？"
     · 好，看看能不能提前 · 先等等 · 回复… · 怎么知道的: 11/02 的订票确认 · 10/28 的酒店确认
   - en: "Your CA929 on 11/21 lands at Narita at 21:40, but the Shinjuku hotel is booked from 11/22. You have nowhere to stay the night of 11/21. Want me to check whether the hotel can add that night?"
     · Check for that night · Hold · Reply… · How I know: flight confirmation, 11/02 · hotel confirmation, 10/28
   - Go starts a 上网 task that looks and reports. Changing the booking or paying is the person's own step.
3. **PR waiting**
   - zh: "Lina 的 PR（nowledge-co/mem #2141）等你 review 两天了，她今天上午又问了一次。改了 4 个文件，测试都过了。我可以先读一遍，把要注意的地方写给你。"
     · 好，先帮我读一遍 · 先等等
   - en: "Lina's PR (nowledge-co/mem #2141) has waited two days for your review, and she asked again this morning. 4 files changed, tests pass. I can read it first and write up what to look at."
     · Read it first · Hold
4. **Price up**
   - zh: "1Password 下个月续费从 $35.88 涨到 $47.88，11/20 扣款。要我把取消或换方案的入口找出来吗？"
     · 好，找出来 · 先等等
   - en: "1Password renews on 11/20 at $47.88, up from $35.88. Want me to find where to cancel or switch plans?"
     · Find it · Hold
5. **Flight changed**
   - zh: "你 11/21 的 CA929 改到 14:05 起飞了，比原来晚 4 小时 45 分，你那天 18:00 在东京的晚饭会赶不上。要我在 Ducter 的浏览器里看看能改签哪些航班吗？选座和付钱都留给你。"
     · 好，看看能改哪些 · 先等等
   - en: "Your 11/21 CA929 now departs at 14:05, 4 h 45 min later, so you'd miss your 18:00 dinner in Tokyo. Want me to look up the flights you could switch to, in Ducter's browser? Picking a seat and paying stay with you."
     · Look up options · Hold

**Morning message frame.**
- zh: "早。昨晚到现在看了 214 封信、3 个日历和 GitHub，有 2 件值得你知道，其余都不用管。"（the two: #1 and #2）
  The last line: "没说的：12 封通知和收据你看标题就知道了；1 封像是推销，没理它。"
- en: "Morning. Since last night I read 214 emails, 3 calendars and GitHub. Two things are worth knowing; the rest can wait." The last line: "Left out: 12 notifications and receipts you can read from the subject line; 1 that looked like a sales pitch."

## 22. Verified so far (2026-11-09)

- **Unit and integration tests against a fake OpenConnector and a plain MCP server**, over real
  Streamable HTTP (`packages/core/test/fake-mcp.ts`, `connections.test.ts`, the
  `server.test.ts` end-to-end case, `packages/partner/test/connections.test.ts`):
  - add and remove;
  - a wrong token is refused;
  - the 0600 files;
  - the token is in no frame and no Log event;
  - a read runs and is logged with a summary only;
  - a write is refused outside Go, runs once after Go, and never after Hold;
  - task grants, with writes refused;
  - the user's rules;
  - oo's `connector.toml` and env precedence.
- **Live end to end** (evidence in `~/dev/ducter-evidence/connectors/live-2026-11-09/`). The
  setup:
  - OpenConnector's official v1.9.9 release binary (SHA256 checked), bound to 127.0.0.1 only,
    with its own scratch data.
  - GitHub stored there as an API-key connection.
  - A Ducter runtime token made on its admin API, limited to the 81 GitHub actions whose
    `operationType` is `read`.
  - A scratch Ducter on 127.0.0.1, with the partner on Claude Code haiku and memory off. The
    connection was added with the same `connection_add` frame the Settings page sends.

  Results:
  - **Added as self-hosted, state ok.** A wrong token earlier in tests was refused.
  - **Read.** "我在 GitHub 上有哪些打开的、等我 review 或者我自己开的 PR？" The partner searched,
    called `github.search_issues_and_pull_requests` four times, and answered with real PRs
    (8 waiting on review, 114 open). Eight `connection_call` lines were logged, each with a
    summary only ("50 items").
  - **Write.** "在 wey-gu/ducter 的 issue #1 下面帮我评论一句…". The broker classified
    `github.create_issue_comment` as a write from OpenConnector's own metadata, even though
    the token's policy denied it. The partner made one Go / Hold card ("在 wey-gu/ducter 的
    issue #1 下发一条评论…", Go label 发出评论, default Hold) and logged one `needs_go` line.
    **Go was never pressed.** OpenConnector's run log shows only the four reads.
  - **Secrets.** Neither the runtime token nor the GitHub token appears in the Log, a client
    frame or the Ducter log. The only file holding a token is `connection-tokens.json`, mode
    600.
  - **Cleanup.** Both servers were stopped, the scratch data deleted, and the
    `~/.claude/projects` folder the partner created removed. Nothing of the author's was
    revoked or written.
- **Not done live:** the desktop app's form, and pressing Go on a real write (by design). The
  partner's Q1 answer said it "only fetched details for a few"; tightening that prompt is a
  later polish.
- **OOMOL Hosted** (D158, research/44; probed without the author's credentials):
  - The MCP endpoint is `https://connector.oomol.com/v1/mcp` (OOMOL's own dsh-oomol and
    connector-sdk). Without a key it answers `401` with
    `WWW-Authenticate: Bearer resource_metadata=…/.well-known/oauth-protected-resource/v1/mcp`.
  - `/mcp`, which Ducter first used, is not an endpoint: OOMOL's gateway answers every path with
    `401 token not found` (a made-up Bearer: `invalid token`), so without a key it looked alive.
    The MCP SDK keeps that 401 in its error's `code`, not its message, so the broker read it as
    `not_mcp`. Both are fixed (§18.1).
  - The key is an API key from `console.oomol.com/api-key`, sent as Bearer. Connected accounts
    come from `GET /v1/apps?status=active`.
  - Tests: `packages/core/test/connections.test.ts` "OOMOL Hosted (D158)" runs the real HTTP
    linker against a look-alike (`fake-mcp.ts` with `path: "/v1/mcp"`, `plain401`, `apps`) for
    no key, a wrong key, the right key pasted with spaces, connected-but-empty, a missing path,
    and the `/mcp` record moving; `apps/desktop/internal/views/oomol_hosted_test.go` for the form
    and every answer's look. `apps/web/demo-oomol.ts` serves the same look-alike for the phone.
    Screenshots: `.shots/oomol/` (Mac and phone, zh and en, each outcome).
  - **To confirm with a real key:** the author makes a key at `console.oomol.com/api-key` and
    adds Hosted by OOMOL; the toast should list what is connected there. Not verified without a
    key: the hosted tool list and the key's acceptance as Bearer (DOCUMENTED by OOMOL). Since
    D122 the simpler path for an oo user is still the oo tap (live-tested below).
- **The oo link (D122), unit and integration** (`packages/core/test/oo-link.test.ts`, a fake
  `oo` binary on a temp PATH, `fake-oo.ts`): the tools list only services with an account (no
  public or billed ones), the `connection` choice when a service has several, the input through a
  0600 file that is gone after the run and never in argv, no harness key in oo's environment,
  an unknown account refused before oo runs, signed out → `unauthorized`, oo missing or slow →
  `unreachable` (the process is killed), the read/write verb table (16 reads, 28 writes), and
  the tap through the broker: no token stored, reads logged with a summary only, a write staged
  and run once only after Go, a task reading only when shared. Desktop: `oo_connect_test.go`.
- **The oo link, live on the author's oo 1.9.1** (OOMOL Hosted, 2026-11-09). A scratch Ducter
  (own data folder and port, partner on Claude Code haiku, memory off); its PATH left out the
  folder oo lives in, so no harness child could run oo (Ducter found oo there by itself).
  - **Detect and tap.** The first frame said signed in from the file guess; oo's answer a
    moment later listed 5 services with an account (Gmail with 2). The tap (`connection_oo`)
    added the connection in about 1 s, source `oo`, state ok; no token-shaped string in any
    frame, and `connection-tokens.json` held nothing for it.
  - **"最近几天邮件里有没有需要我留意的事？"** The partner searched, then ran
    `gmail.search_threads` on both Gmail accounts (the second by `--connection-name`), 30
    threads each, and answered in 23 s with 5 items, each traceable to mail it had read
    (checked by hand, not recorded here). Logged: 3 `connection_call` reads, summaries only.
  - **A write.** Asked to reply to one sender, it read the thread, found
    `gmail.create_email_draft`, which the verb rule classed as a write, and made one Go / Hold
    card (default Hold, not reversible) with one `needs_go` line. **Go was never pressed;
    nothing was drafted or sent.**
  - **A task.** Asked for a table of the week's travel and event mail (haiku, no repo), the
    partner opened the task but didn't share the accounts. The task got "no connections", then
    loaded the user's own `oo-gmail` Claude skill and ran `oo` from Bash: "command not found"
    only because of the trial's PATH. It stopped and reported blocked. This is why D122 (6)
    now signs oo out for every harness child, why a task with nothing shared is told to ask
    the partner, and why the prompt shares in the same turn. Once told, the partner shared
    (one `grant` line) and the task read through the broker: 15 reads (4 thread searches, 7
    thread fetches, 4 message reads), each a `connection_call` on the task's stream, and
    reported done. The partner made the other 6.
  - **What oo itself ran** (its own debug logs, counted by command only): 64 invocations, 21
    `connector run`, all of them `search_threads`, `fetch_message_by_thread_id` or
    `get_message`; no other action. The rest: 32 searches (mostly the catalog warming), 7
    schema calls, 2 app lists, 2 status checks.
  - **Cleanup.** The scratch data folder and the two `~/.claude/projects` folders the trial
    created were deleted; no temp input file was left behind.
  - **Seen, for later:** the card's Go label came out bilingual ("存为草稿 / Save as draft"),
    against D109's one language; the partner's first answer read only search snippets.
