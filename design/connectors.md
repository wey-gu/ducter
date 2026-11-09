# Connectors and Restrained Proactive Help (DRAFT)

> Draft 1 · 2026-11-09 · Branch `connectors` · Status: **drafted, nothing decided**. Proposals
> D89–D96 at the end wait for the author. Evidence: `research/34` (prior art, Google access,
> open-connector, metaphor test). Builds on principles 7, 15, 16, 17 and 18, D43, D61 (the
> effect ladder), D65/D81 (the devices world), routines (`product-model.md` §4) and
> `flows/D-decisions-attention.md` D3 (quiet hours).
> Prototype: https://claude.ai/artifact/BC1i6YEt8EKQ5VtMeCjEw8
> Tags: **[doc]** already decided elsewhere; **[I]** this draft's proposal.

## 1. User first

**Who, and how they feel.**

- **The heavy multi-agent developer (the author).**
  - Before: twenty open sessions, and an inbox they are scared of. Teammates wait on PRs while
    the bills arrive unseen.
  - After: the one partner they already talk to also says, once in the morning, "Lina's PR has
    waited two days; Cloudflare bills Friday". Nothing else.
  - Emotional value: 放心, the sense of someone minding the edges, and 惊喜, when it joins two
    things they couldn't have joined themselves.
- **The consumer personal-AI user** (Grok bot, Muse, dots).
  - Before: the closed products' magic, locked to one vendor and one model, with notes about
    them they can't see.
  - After: the same restrained reminders on their own Mac, with their own models, and every
    note readable and forgettable in Mem.
  - Emotional value: 好用 without lock-in, and 放心 because they can see where it lives.
- **The fresh user** who has never heard of a connector.
  - Before: nothing. They don't know an AI can watch for a bill.
  - After: they say "keep an eye on my mail", sign in once, and within a minute hear one
    useful thing from the last two weeks.
  - Emotional value: 惊喜 first, then 顺滑: they never meet the word "connector".

**How it starts.** Zero concepts. The person either says it ("帮我盯着邮箱 / keep an eye on my
inbox") or taps Gmail under 还能让它看的 / It can also read on Devices. Both lead to the same
sign-in and the same first find (§6).

**North star check (D36).**

| | How this design meets it |
|---|---|
| 好用 | One sentence starts it |
| 顺滑 | Google sign-in in the browser, and one "how often" question with a default |
| 赏心悦目 | A clay mailbox drops onto the Mac's island |
| 放心 | Reads and drafts only; everything else waits for Go; the honest line about the AI account; "Left out" makes silence trustworthy |
| 惊喜 | The first find within a minute, and joins across sources |

## 2. Where connectors live

- **On the computer Ducter lives on (the main), inside the control plane** [I]. Not on each
  device, and never inside a harness. Reasons:
  - The watchers must run while every worker sleeps (principle 19: compute sleeps, state
    doesn't).
  - The main is where the Log, the waiters and the intents already are.
  - A token has one home, so signing out has one meaning.
- **Shown that way on Devices.** The mailbox stands on the main's island (D81 devices world;
  the prototype). If Ducter lives on a VPS, the mailboxes stand on the VPS's island, and the
  sign-in is done from the person's laptop browser through the same loopback dance over the
  pairing connection (§7.3).
- **Workers never hold provider tokens.** A task running on a worker reaches a connector
  through the main's tool server, over the runner's existing outbound socket [I].

## 3. Architectures compared

| | A. Harness-native MCP | B. Ducter broker (recommended) | C. Hosted connector gateway |
|---|---|---|---|
| Shape | Put vendor or community MCP servers, with their tokens, into each session's OAR `mcpServers` | Connectors live in the main's control plane behind a `ConnectorPort`; harnesses see only Ducter's tool server, which proxies scoped calls | Composio, Pipedream or OOMOL Hosted hold the OAuth apps and tokens; Ducter calls their API |
| Credentials | In harness config or env, readable by the model's tools | Keychain/libsecret on the main; never in a harness, its env, args or files (principle 18) | On the vendor's servers |
| Google verification | Each user still brings a client | Each user brings a client, guided | Solved by the vendor's verified app |
| Mail leaves the machine | Only to the model provider | Only to the model provider | To the vendor, and to the model provider |
| Gating "send" | None; the harness calls `send_email` | Intent through the effect ladder (D61) | Vendor permissions only |
| Audit | Whatever the harness logs | Every call is a Log event; reads are summarized, writes appear in Sent out | Vendor logs |
| Proactive watchers | Need a running harness session, so tokens burn while idle | Waiters in code (principle 16); a model only when input changes | Vendor triggers (webhooks to a public URL) |
| Partner isolation | Conflicts with the isolated partner config | Fits: the fixed Ducter tool server is already in every harness | Fits |
| Vendor-neutral | Yes | Yes | No |
| Cost to build | Lowest | Medium (port, gate, triage) | Low, plus a monthly bill |

**Recommendation: B, with C as an opt-in per account later.** B is the only option that keeps
principle 18 (scope the credentials, gate the effects) and principle 16 (waits are code), keeps
Ducter vendor-neutral, and lets proactive work cost almost nothing while idle.

**The alternative worth keeping: A, as "use my own MCP servers"** for power users. Ducter
attaches a user's existing server to the *broker* rather than to the harness, so the gate and
the audit still apply (§4.3). Plain A, with the harness holding the token, stays possible only
for tasks that inherit the user's own config (`system.md`), and it is labeled as the user's own
setup.

## 4. The broker

### 4.1 Pieces

```
            the main (Ducter lives here)
 ┌───────────────────────────────────────────────────────────┐
 │ ConnectorPort ── adapters: open-connector (embedded)       │
 │      │                     user MCP servers (proxied)      │
 │      │                     IMAP / JMAP / Mail.app (later)  │
 │      ├── token store (Keychain / libsecret; key for OC)    │
 │      ├── watchers = waiters (poll + checkpoint)            │
 │      ├── triage (rules → cheap model → partner)            │
 │      └── gate (reads recorded; writes → intents)           │
 │ Ducter tool server (/mcp, HMAC role token per session)     │
 └────────────┬───────────────────────────────┬──────────────┘
        partner session                 task sessions (main or worker)
```

- **`ConnectorPort`** [I]. It has a few calls: `accounts()`, `search(account, query)`,
  `read(account, ref)`, `draft(account, …)`, `act(account, action, input)`, and
  `watch(account, trigger, checkpoint)`.
  - Every adapter declares its actions as **read**, **draft**, or **effect** (reaches people,
    can't be taken back, or spends; the D61 ladder).
- **Engine: open-connector's headless runtime, embedded** (research/34 §4) [I].
  - Pinned, with a selected-provider build: Gmail, Google Calendar, Drive, GitHub, Slack,
    Notion, Outlook.
  - Ducter supplies its encryption key from the Keychain.
  - Its MCP endpoint, Marketplace and OOMOL Hosted stay off.
  - It is replaceable behind the port. The fallback is the v1.9.4 Apache fork point, or our
    own Gmail adapter, which is about 6 calls.
- **User MCP servers** (§4.3).

### 4.2 Reaching the partner and tasks through the adapter

- **The Ducter tool server stays small and fixed** (principle 15) [doc]. It gains four tools,
  not one per action [I]:
  - `accounts_list`;
  - `account_search`;
  - `account_read`;
  - `account_act`: draft, or ask for an effect.

  Action discovery happens inside `account_search`'s results. That keeps the tool list under
  20 and the cache prefix stable (research/08: tool-selection accuracy falls as lists grow).
- **Scoping per session** [I]. The role token the runner already mints per session carries a
  grant:
  - **Partner:** all accounts, read and draft.
  - **A task:** only the accounts in its 可以碰 / May touch (D61 GQ12). For example, "Gmail ·
    read" for a "summarize the school's emails" task; nothing for a code task, unless the
    brief needs a PR.
  - **A browser task** (D62 isolation): no account tools unless the brief names one.
- **Grant enforcement lives in the broker, not in the model.** A call outside the grant
  returns a plain "not allowed for this task", and the partner can widen May touch with a Go.
- **Effects** go through the gate as intents [doc principle 18, D61]:
  - Send mail and post to Slack: ask, no countdown, 30 s Undo (GQ3).
  - Add a calendar event: ask, with a countdown if it's only on the user's own calendar [I].
  - Comment on a PR: ask, no countdown (GQ10).
  - Pay: never (the floor).
- **Background work (watchers, triage) holds a read-only grant, structurally** [I, after dots
  and Grok]:
  - It may draft.
  - It can't act, and no rule loosens that.
  - An action it suggests becomes a decision in the living message, and Go runs it under the
    partner's grant.
- **Audit in the Log** [I]:
  - Each read is a Log event (account, query or ref, result count; the bodies are blobs,
    principle 1), folded out of the partner's tail like any bulky read (principle 5).
  - Writes appear in 发出去的 / Sent out and 今天发出去的 / Sent out today (D61).
- **Untrusted data** [doc, routines safety]. Mail bodies are wrapped as untrusted data before
  any model sees them, and a request found inside a mail can never become an effect without a
  person (the GQ5 floor: "untrusted-requested effects").

### 4.3 The user's own MCP servers and connectors

- **A power user's existing servers** (GitHub remote MCP, Linear, Notion) can be attached as
  accounts. The broker connects as the MCP client (OAuth 2.1 per the MCP authorization spec,
  with a Client ID Metadata Document for Ducter), stores the token, and re-exposes the tools
  through the same four tools and the same gate [I].
- **Read-only server variants** (GitHub `/readonly`, Linear `/readonly`) back the watchers.
- **The user's Claude.ai or ChatGPT connectors can't be borrowed.** They live inside those
  vendors' sessions, and principle 17 rules out proxying a subscription. A *task* that
  inherits the user's Claude config may still use them, as the user's own setup, unmediated
  and labeled [doc system.md].

### 4.4 The browser as a connector (上网)

- **Zero-setup fallback** [I]. For services with no API, or for a person who won't make a
  Google client, a task can sign in by takeover in the Ducter browser (D48) and read there.
- It is slower, costs more tokens and breaks more often (CAPTCHAs on VPS IPs, research/23).
  So it is offered per task ("look in my school's parent portal"), not as a watcher.
- A watcher over a browser profile is a v2 question.

## 5. Proactive work, cheaply

### 5.1 The cascade

| Stage | Runs | Cost | Passes on |
|---|---|---|---|
| 0. Watch | A waiter polls `history.list` (Gmail, every 2 min), `syncToken` (Calendar, 5 min), GitHub notifications (5 min) | No model; a few quota units | New items since the checkpoint |
| 1. Rules | Code: drop `List-Unsubscribe`/bulk, Gmail's Promotions/Updates categories, the user's own sends, items already read on another device, senders the user muted | No model | Maybe 10–25% of mail (INFERRED) |
| 2. Triage | The cheapest capable model over **batches** (≤ 20 items, headers + 2 KB snippet), run only when stage 1 produced something: "worth telling? kind? deadline? who's waiting?" | ~5–15 small calls a day for a typical inbox (INFERRED) | Candidates with a kind, deadline and confidence |
| 3. Judge | The partner (a fork, principle 6), with Mem recall of "what matters to this person" and the calendar for joins | A few calls a day | Items that clear the attention bar |
| 4. Deliver | The living message (principle 7) | No model; rendered from typed reports | |

- **The attention bar** [I]. Tell the person only if all three hold:
  1. **They likely don't know it yet.** Not "a receipt you can read from the subject"; Zapier's
     noise class.
  2. **It is timely.** A deadline, money moving, someone waiting, or a conflict.
  3. **There is something to do or decide**, or it joins two sources (the aha class).

  Everything else becomes the "没说的 / Left out" line.
- **Batching** [I, extends principle 7].
  - Finds go into the one living message.
  - Proactive items never push on their own, except under the "only urgent" kind (§5.2) or
    when the item is a decision whose deadline is today.
  - The default delivery is one morning message at the end of quiet hours, plus fold-ins
    while the person is already in the app.
- **The daily cap**, default **3** [I; no product publishes one]. The tray has 3 slots. A
  fourth find waits for tomorrow if it's still timely, otherwise it goes into Left out.
- **Quiet hours** [doc D3]. Finds are held. Only a kind the person explicitly allowed ("夜里
  航班改了也叫我 / wake me for flight changes") may push at night.
- **Learning** [I].
  - **有用 / Useful** and **这类别再说 / Don't tell me this kind** sit under each item. The
    second is the existing "don't tell me about this kind of thing" ledger constraint, now with
    a button.
  - Go, Hold and ignored items are logged per kind and per sender.
  - After 3 ignored items of a kind in 14 days the bar for that kind rises.
  - After 3 unread morning messages in a row, the watcher pauses and asks "还要吗？ / Keep
    this?". This is the routine rule, reused.
- **Budget** [doc routines]. Each watcher is a system routine with a monthly cap shown on its
  mailbox. Grok's warning ("a Slack trigger on a busy channel can use a week of usage in a
  day") is why Slack watches only mentions and DMs by default.

### 5.2 How proactive it may be

On Partner → 什么时候找你 / When it comes to you, a new group (D71's page) [I]:

| Option | Means |
|---|---|
| **只说急的 / Only urgent things** | Only things that can't wait a day |
| **每天最多 3 件 / At most 3 a day** (default) | Batched into the morning message |
| **有用就说 / Whenever it's useful** | No cap, still batched |
| **不用主动找我 / Don't come to me** | Watchers off; it reads only when asked |

- **Per account, the mailbox's card shows what it watches** ("每 2 分钟看一眼新邮件 · 今天看了
  214 封，有 1 件值得说"), with **Sign out**.
- **Watching is opt-in at sign-in, with a default** [I]. dots says connecting alone must not
  create monitoring. Ducter asks once, at sign-in: "以后每天最多给你 3 件，早上 8 点一起说，可以吗？
  / At most 3 a day, all at 8 in the morning?" Go is the default, and the answer is a Rule.

### 5.3 Memory: "what matters to this person"

- **Recall.** Stage 3 recalls from Mem (principle 17): people the person answers quickly,
  projects, money they care about, and past 有用 / Don't-tell signals.
- **Writes.** The partner writes back only distilled, durable things ("Lina is on the mem
  team; Wei reviews her PRs"), with the usual 记下了 / Noted line and provenance.
- **Never the mail itself** [I].
- **Signing out** stops the reading. What was noted stays in 记得什么 / What it remembers, where
  it can be forgotten. The card says so (the proxy test's top worry).

### 5.4 Composing with the abilities

A proactive find may propose a task that uses an ability on a device. It is always a decision
with Go, never a background action [I].

| Find | Proposed task | Ability (device) | Gate |
|---|---|---|---|
| Flight changed | Look up rebook options on the airline's site | 上网 (the Mac) | Choosing a seat or paying: the person, by takeover |
| School form attached | Fill the PDF from what it knows, leave it as a draft | (none) or 用电脑 | Sending the form: Go |
| Restaurant clash | Call to move the booking | 打电话 (later) | The call itself: Go; the person can listen in |
| Insurance claim | Fill the portal's form from the email's PDF | 用电脑 / 上网 | Submit: Go with the filled form shown (D61) |
| Parcel needs an answer | Reply from the courier's SMS link | 用手机 (later) | Tap-to-send: Go |

## 6. The first time

1. The person says "帮我盯着邮箱，有要紧的告诉我" or taps Gmail → **登录 / Sign in** on Devices.
2. Ducter: "要看你的 Gmail，需要你在 Google 那边点一次同意。我先带你建一个只给你自己用的 Google
   钥匙，大概 3 分钟。/ To read your Gmail, Google needs you to agree once. I'll walk you through
   making a Google key that only you use. About 3 minutes."
3. The guided client setup (§7.2) runs, then Google's consent page opens in the person's
   browser. Ducter never sees the password.
4. A Gmail mailbox drops onto the island (the equip snap, D65). Ducter backfills **the last 14
   days** through the cascade and speaks within a minute: "看了 386 封。有一件你可能想知道：…
   / I read 386 emails. One thing you may want to know: …". If nothing clears the bar: "看了
   386 封，没有要你操心的。/ I read 386 emails; nothing needs you."
5. It asks the "how often" question once (§5.2).

## 7. What the person must set up

### 7.1 Per account type

| Account | What the person does | Time (INFERRED) |
|---|---|---|
| Gmail, Google Calendar, Drive | Make their own Google Cloud OAuth client once (§7.2); then sign in | 3–8 min the first time; 20 s for each later Google account |
| GitHub | Sign in through GitHub (a Ducter GitHub OAuth app, or the user's own; GitHub has no restricted-scope audit) or paste a token | 30 s |
| Slack | Sign in; a workspace admin may need to approve | 30 s to days |
| Notion, Linear | Sign in through their remote MCP OAuth | 30 s |
| Outlook | Sign in (a Ducter publisher-verified Microsoft app is feasible: free, no audit, research/34) | 30 s |
| Fastmail | Paste an API token | 30 s |

### 7.2 The guided Google client

Ducter can't ship one shared Google client: Gmail read and draft are restricted scopes, which
need verification and a yearly CASA assessment, and a shared unverified client is capped at
100 users for life. Each person therefore brings their own client, guided step by step [I]:

1. Open console.cloud.google.com and create a project ("Ducter for Wei"). If `gcloud` is
   present, Ducter does steps 1–3 itself.
2. Enable the Gmail, Calendar and Drive APIs.
3. Set up the OAuth consent screen: External, app name, the person's own email.
4. **Publish the app** (In production). Never leave it in Testing: Google drops the grant every
   7 days.
5. Create credentials: OAuth client ID, type **Desktop app**. Paste the client ID and secret
   into Ducter. The secret isn't secret for desktop clients.
6. Sign in. Google shows "Google hasn't verified this app". Ducter shows a picture of that
   screen beforehand, with the line "这是你自己建的钥匙，所以 Google 没审过它 / This is the key you
   just made, so Google hasn't reviewed it". The person clicks Advanced → Go to….

Scopes: `gmail.readonly` and `gmail.compose` (drafts, and sending a draft after Go),
`calendar.events`, `drive.readonly` [I]. Requested incrementally: Drive only when first needed.

### 7.3 For the maintainer (the author), before any of this ships

- A Google Cloud project to test the guided flow against, with the author's own client. Not a
  shared one.
- A decision on whether Ducter ever runs a verified shared Google client. That needs a legal
  entity, a domain, a privacy policy, verification and yearly CASA. This draft defers it.
- A GitHub OAuth app for Ducter, and later a Microsoft publisher-verified app (free).
- The loopback redirect when Ducter lives on a VPS: the consent runs in the laptop's browser
  and the code is relayed over the paired connection. Still to verify, like research/29's
  headless logins.

## 8. Scenarios

Scores 1–5: **U** usefulness, **R** restraint (low noise risk), **T** trust (low harm if
wrong), **F** feasibility in v1.x.

| # | Scenario | Who | Sources | U | R | T | F | Σ |
|---|---|---|---|---|---|---|---|---|
| 1 | A bill due Friday found in mail, with the amount and card; Go sets a reminder | all | Gmail | 5 | 5 | 5 | 5 | 20 |
| 2 | A teammate's PR has waited on you two days; Go asks a task to pre-read it | dev | GitHub | 5 | 5 | 5 | 5 | 20 |
| 3 | A calendar invite clashes with a flight or event found in mail (the join) | all | Gmail + Calendar | 5 | 4 | 5 | 4 | 18 |
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
- **Why these.** They have the highest scores, they cover all three users, and they show both
  aha classes: a timely single source and a join. #5 also brings in an ability.
- **Close calls.**
  - #8 (passport) is strong but rare.
  - #10 (CI) is often already pushed by GitHub, so the bar must check "would they already
    know".
  - #6 (unanswered) is the most useful and the noisiest. It belongs in v1.x+1, after the
    feedback loop has data.

**The words (glossary words; Go labels per D73).** All amounts, names and repos are examples.

1. **Bill**
   - zh: "Cloudflare 的账单 $25.00 周五（11/13）会自动扣款，卡是尾号 4417。跟上个月一样多。要我在周四上午提醒你看一眼吗？"
     · 好，周四提醒我 · 先等等 · 回复… · 怎么知道的: 11/09 06:12 的邮件《Your invoice is ready》
   - en: "Cloudflare will charge $25.00 on Friday (11/13) to the card ending 4417. Same as last month. Want a reminder on Thursday morning to take a look?"
     · Remind me Thursday · Hold · Reply… · How I know: email "Your invoice is ready", 11/09 06:12
2. **PR waiting**
   - zh: "Lina 的 PR（nowledge-co/mem #2141）等你 review 两天了，她今天上午又问了一次。改了 4 个文件，测试都过了。我可以先读一遍，把要注意的地方写给你。"
     · 好，先帮我读一遍 · 先等等
   - en: "Lina's PR (nowledge-co/mem #2141) has waited two days for your review, and she asked again this morning. 4 files changed, tests pass. I can read it first and write up what to look at."
     · Read it first · Hold
3. **Clash (join)**
   - zh: "周三 10:00 的 HawDB 周会，跟你邮件里那班 CA929（09:20 起飞）撞了。要我给组织的人写个草稿，说你那天来不了吗？"
     · 好，写个草稿 · 先等等 · 怎么知道的: 日历邀请 · 11/02 的订票确认
   - en: "Wednesday's 10:00 HawDB sync clashes with your flight CA929 (departs 09:20) from your email. Want me to draft a note to the organizer saying you can't make it?"
     · Draft a note · Hold
   - The draft is only a draft. Sending it is its own Go, with 30 s Undo.
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
- zh: "早。昨晚到现在看了 214 封信、3 个日历和 GitHub，有 2 件值得你知道，其余都不用管。"
  The last line: "没说的：12 封通知和收据你看标题就知道了；1 封像是推销，没理它。"
- en: "Morning. Since last night I read 214 emails, 3 calendars and GitHub. Two things are worth knowing; the rest can wait." The last line: "Left out: 12 notifications and receipts you can read from the subject line; 1 that looked like a sales pitch."

## 9. Game-like settings (D43)

- **The metaphor: mailboxes on the Mac's island, and a 3-slot tray on its shore** (research/34
  §5) [I].
- **Literal labels always state the thing:**
  - "Gmail · wei@example.com · 登录在这台 Mac 上 / Signed in on This Mac";
  - the three can-lines;
  - the honest line;
  - the watch line;
  - Sign out.
- **Rules** (prototype panel):
  - No flags on the mailboxes.
  - The lid lifts a little when Ducter looks.
  - A note drops into the tray only for an item that cleared the bar.
  - Tray slots equal the cap.
  - Quiet hours shows as a small moon sign by the tray.
  - Still mode stops all of it, and every state still reads.
- **Equip.** "Sign in" is the equip; a mailbox drops onto the island with the D65 snap.
  - The result line is "Ducter 现在能看你的 Gmail 了 / Ducter can now read your Gmail".
  - Never 授权 / authorize, 接入, or "connector" in UI.
  - 连上 / Connect stays reserved for devices (D54).
- **Owed:** the human comprehension test (with the D65 test), and art for the mailboxes (the
  prototype draws them in SVG).

## 10. Proposals for the author (D89–D96)

Each carries a default; "按建议" takes them all.

| # | Proposal | Default | Main alternative |
|---|---|---|---|
| D89 | **Where connectors live.** On the computer Ducter lives on, in the control plane, behind a `ConnectorPort`; harnesses never hold provider credentials (B over A and C) | Yes | C (hosted gateway) as a per-account opt-in later |
| D90 | **How they reach sessions.** Four fixed tools on the Ducter tool server; a per-session grant from 可以碰 / May touch; reads logged; writes are intents on the D61 ladder; background work is structurally read-only and may only draft | Yes | One tool per action (simpler, but grows the tool list and breaks the cache prefix) |
| D91 | **Engine.** Embed open-connector's headless runtime, pinned, selected providers, Hosted/Marketplace/its MCP off, behind the port; user MCP servers attach to the broker as accounts | Adopt partially | Our own Gmail/Calendar/GitHub adapters only (smaller and slower to grow, no license risk) |
| D92 | **Google access.** A guided bring-your-own Desktop client, published unverified-in-production, PKCE + loopback; scopes `gmail.readonly` + `gmail.compose` + `calendar.events` + `drive.readonly` (incremental); polling, no Pub/Sub; tokens in Keychain/libsecret | Yes | A Ducter-verified shared client (needs an entity, CASA, yearly cost); revisit at a hosted offering |
| D93 | **The proactive policy.** Cascade (watch → rules → cheap triage → partner); the three-part attention bar; at most **3 a day**, batched into the morning message; held in quiet hours; 有用 / 这类别再说 under each item; a "没说的 / Left out" line; auto-pause after 3 unread mornings | Yes, cap 3 | Cap 5, or no cap with a confidence bar only (dots' approach; noisier in reviews) |
| D94 | **Watching is asked for once at sign-in**, Go by default, and becomes a Rule; connecting alone never watches silently | Yes | Watch by default with no question (one less step, less 放心) |
| D95 | **The honest line** on every account: "为了看懂一封信，它会把这封信给你的 AI 账号（{account}）看。别人拿不到。/ To understand a message, it shows it to your AI account ({account}). No one else gets it." | Yes | Put it only in docs (higher felt safety, less true) |
| D96 | **Settings look.** Mailboxes on the main's island + the 3-slot tray; words 还能让它看的 / It can also read, 登录 / Sign in, 今天带给你的 / What it brings you today, the Partner group 它自己发现的事 / Things it notices with four options; pending a human test | Yes | Literal cards (A) if the human test finds "the mailbox means Ducter receives my mail" |

Also for the author, without a number yet: the top-5 scenario set (§8); the 14-day backfill on
first sign-in (§6); whether a Slack watch defaults to mentions and DMs only (§5.1).

## 11. Open

- The triage eval: a labeled set from the author's real inbox (private, outside git) measuring
  false alarms and misses per kind, like `research/15` for the digest. It must exist before
  the cap is tuned.
- Linux main without a desktop: the consent relay (§7.3).
- Several Google accounts (personal and work) on one mailbox or two: two mailboxes, probably.
- Personas: accounts belong to the user, and each persona needs a link to read them
  (product-model §5). Default: the first persona only.
- A watcher over a browser profile (§4.4).
