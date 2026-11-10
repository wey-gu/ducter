# Connectors and Restrained Proactive Help (DRAFT)

> Draft 3 · 2026-11-09 · Branch `oo-connect` · Status: **D96 decided** (connections come from
> the user's OpenConnector through Ducter's broker); **D122 decided** (with oo signed in, the
> default way in is oo itself, §4.4); **D158 decided** (OOMOL Hosted at its real `/v1/mcp` with a
> console key, honest answers, research/44); **the broker is built** (§4, as built);
> everything about proactive work (cadence, cap, look-back, watching) is still a proposal,
> D97–D101 at the end. Evidence: `research/35` (prior art, Google access,
> open-connector, metaphor test). Builds on principles 7, 15, 16, 17 and 18, D43, D61 (the
> effect ladder), D65/D81 (the devices world), routines (`product-model.md` §4) and
> `flows/D-decisions-attention.md` D3 (quiet hours).
> Prototype: https://claude.ai/artifact/CB1xnATLKnQra2DLKeh7Rq
> Tags: **[doc]** already decided elsewhere; **[I]** this draft's proposal.

## 1. User first

**Who, and how they feel.**

- **The heavy multi-agent developer (the author).**
  - Before: twenty open sessions, and an inbox they are scared of. Teammates wait on PRs while
    the bills arrive unseen.
  - After: the one partner they already talk to also says, once in the morning, "ducter.dev lapses
    in a week and the renewal isn't paid; your flight lands a night before the hotel starts". Nothing else.
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

## 2. Where connections live

- **Ducter doesn't hold provider accounts. The user's OpenConnector does** (D96). It is either
  OOMOL Hosted or their own self-hosted OpenConnector. Ducter attaches to its MCP endpoint
  through Ducter's own broker in the control plane on the computer Ducter lives on:
  - OOMOL Hosted: `https://connector.oomol.com/v1/mcp` with `Authorization: Bearer <API key>`,
    the key made at `console.oomol.com/api-key` (D158, research/44);
  - self-hosted: `<base>/mcp` with a Bearer runtime token from its Access page.

  Any other MCP server attaches the same way.
- **Or the user's oo does** (D122). With OOMOL's `oo` CLI signed in, Ducter reads the accounts
  connected there by running oo itself (§4.4). There is no token at all on Ducter's side for
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
- **Shown on Devices as mailboxes on the main's island** (the prototype; the Isles stage is
  being rebuilt on `isles`). For now the list lives on Partner → 它能看的账号 / Accounts it can
  read. The stage calls `homeMailboxes()` (web) or `HomeMailboxes()` (desktop) later.
- **Workers never hold a token.** A task on a worker reaches a connection through the main's
  tool server.

## 3. Architectures compared

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

## 4. The broker (as built, 2026-11-09)

`packages/core/src/connections.ts`, `connection-tools.ts`; partner tools in
`packages/partner/src/partner.ts`.

### 4.1 Pieces

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

### 4.2 Reaching the partner and tasks

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

### 4.3 Other MCP servers and the user's own connectors

- **A power user's existing servers** (GitHub remote MCP, Linear, Notion) can be attached as
  connections with an address and a token (built). The broker connects as the MCP client,
  stores the token, and re-exposes the tools through the same tools and the same gate. Servers
  that only do MCP OAuth 2.1 sign-in (no static token) need a sign-in flow in Ducter: later [I].
- **Read-only server variants** (GitHub `/readonly`, Linear `/readonly`) back the watchers.
- **The user's Claude.ai or ChatGPT connectors can't be borrowed.** They live inside those
  vendors' sessions, and principle 17 rules out proxying a subscription. A *task* that
  inherits the user's Claude config may still use them, as the user's own setup, unmediated
  and labeled [doc system.md].

### 4.4 The oo CLI: the default way in (D122, built)

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
  Everything else, unknown included, is a write and goes through the Go card (§4.2). Examples:
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
  (permission groups). Ducter's per-connection `policy` rules (§4.1) apply on top.

### 4.5 Watching (partly built: event waits on a self-hosted OpenConnector only; never run against a live one)

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
- What a watcher finds goes through the cascade in §5. The watcher's caller is read-only by
  construction.

### 4.6 The browser as a connector (上网)

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
| Flight lands before the hotel starts | Ask the hotel's site about the missing night | 上网 (the Mac) | Changing the booking or paying: the person |
| Domain renewal unpaid | Open the registrar's renewal page, confirm the status | 上网 (the Mac) | Paying: the person, by takeover (the floor) |
| Flight changed | Look up rebook options on the airline's site | 上网 (the Mac) | Choosing a seat or paying: the person, by takeover |
| School form attached | Fill the PDF from what it knows, leave it as a draft | (none) or 用电脑 | Sending the form: Go |
| Restaurant clash | Call to move the booking | 打电话 (later) | The call itself: Go; the person can listen in |
| Insurance claim | Fill the portal's form from the email's PDF | 用电脑 / 上网 | Submit: Go with the filled form shown (D61) |
| Parcel needs an answer | Reply from the courier's SMS link | 用手机 (later) | Tap-to-send: Go |

## 6. The first time

1. The person says "帮我盯着邮箱，有要紧的告诉我", or opens Partner → 它能看的账号 / Accounts it
   can read.
2. With no connection, Ducter says one line: "先在你的 OpenConnector 里连上 Gmail，再把它加到伙伴页的
   “它能看的账号”里。/ Connect Gmail in your OpenConnector first, then add it under Accounts it
   can read on the Partner page." **If oo is signed in, the page leads with the oo offer
   instead** (D122): the services and accounts in oo, where mail passes, and one tap on 用这些账号
   / Use these accounts. Then step 3 is skipped.
3. In OpenConnector the person connects Gmail: Google's consent page, Allow. Then they make a
   token for Ducter, and Ducter checks and saves it. Ducter never sees the Google password.
4. A Gmail mailbox drops onto the island (the equip snap, D65). Ducter backfills **the last 14
   days** (60 for bookings and renewals) through the cascade and speaks within a minute: "看了 386 封。有一件你可能想知道：…
   / I read 386 emails. One thing you may want to know: …". If nothing clears the bar: "看了
   386 封，没有要你操心的。/ I read 386 emails; nothing needs you."
5. It asks the "how often" question once (§5.2).

## 7. What the person must set up

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
question). A live test against a self-hosted OpenConnector is still owed (§12).

## 8. Scenarios

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
  - **The 14-day backfill on first sign-in (§6) should reach 60 days for bookings and
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

## 9. Game-like settings (D43)

- **The metaphor: mailboxes on the Mac's island, and a 3-slot tray on its shore** (research/35
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
- **The oo offer, as built (D122).** With oo signed in, the card leads with a sunken panel: a
  mailbox, **你在 oo 里的账号 / Your accounts in oo**, "不用配钥匙：Ducter 通过 oo 去看，登录留在 oo
  里。/ No key to set up: Ducter reads through oo, and oo's sign-in stays in oo.", a white list of
  each service and its accounts' labels, the honest line "你的邮件和登录凭据会经过 OOMOL 的服务器。/
  Your mail and sign-ins pass through OOMOL's servers.", and the one primary button **用这些账号 /
  Use these accounts**. Before oo answers: "正在看 oo 里有哪些账号… / Looking at what's in oo…";
  with none: "oo 里还没有账号… / No accounts in oo yet…". The form below steps back to a quiet
  link, **用地址和钥匙加一个 / Add one with an address and key**. Added, the row reads **oo 里的账号
  / Accounts in oo**, "Gmail (2) · Slack · …", "经过 oo · 邮件和登录经过 OOMOL 的服务器 / Through oo ·
  your mail and sign-ins pass through OOMOL's servers". Screenshots: `.shots/oo-connect/`.
- **Equip, as built.** In Settings › 账号 / Accounts, **加一个 / Add one** → where (OOMOL 托管 /
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

## 10. Decided, and proposals for the author

**Decided: D122** (with oo signed in, the default way in is oo itself, §4.4).

**Decided: D96.** Connections come from the user's OpenConnector (OOMOL Hosted or
self-hosted) or another MCP server, through Ducter's broker. Ducter holds only the runtime
token, in a 0600 file. Reads are allowed and logged; anything that sends or changes becomes a
Go card and runs once after Go; background work is read-only or draft-only. Ducter doesn't
embed OpenConnector or run provider OAuth. This replaces the earlier proposals for where
connectors live, how they reach sessions, the engine, and Google access.

**Still proposals** (each with a default; "按建议" takes them all):

| # | Proposal | Default | Main alternative |
|---|---|---|---|
| D97 | **The proactive policy.** Cascade (watch → rules → cheap triage → partner); the three-part attention bar; at most **3 a day**, batched into the morning message; held in quiet hours; 有用 / 这类别再说 under each item; a "没说的 / Left out" line; auto-pause after 3 unread mornings | Yes, cap 3 | Cap 5, or no cap with a confidence bar only (dots' approach; noisier in reviews) |
| D98 | **Watching through OpenConnector's Provider Triggers** (§4.5): poll `read` with a checkpoint in Ducter's waiter table, with a trigger-scoped token; asked once at sign-up, Go by default, as a Rule; never watching silently | Yes | Ducter polls through MCP reads (no extra token; costs model-free calls but no checkpoint semantics) |
| D99 | **The honest lines**: where mail passes (hosted vs self-hosted) on every connection, plus "它读到的内容会给你的 AI 账号看，别人拿不到 / What it reads is shown to your AI account. No one else gets it." | Yes | Only in docs |
| D100 | **The look and words**: mailboxes on the main's island + the 3-slot tray (stage on `isles`); 它能看的账号 / Accounts it can read on Partner for now; 钥匙 / Key; the Partner group 它自己发现的事 / Things it notices; pending a human test | Yes | Literal cards (A) if the human test finds "the mailbox means Ducter receives my mail" |
| D101 | **The look-back on first connection**: 14 days, 60 for bookings and renewals; the trip-and-renewal ledger (§8) | Yes | 14 days for everything |

## 11. Open

- The triage eval: a labeled set from the author's real inbox (private, outside git) measuring
  false alarms and misses per kind, like `research/15` for the digest. It must exist before
  the cap is tuned.
- Linux main without a desktop: the consent relay (§7.3).
- Several Google accounts (personal and work) on one mailbox or two: two mailboxes, probably.
- Personas: accounts belong to the user, and each persona needs a link to read them
  (product-model §5). Default: the first persona only.
- A watcher over a browser profile (§4.4).

## 12. Verified so far (2026-11-09)

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
    `not_mcp`. Both are fixed (§4.1).
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
