# 35. Connectors and restrained proactive help

> 2026-11-09 · Branch `connectors` · Feeds `design/connectors.md` (draft) and proposals D96–D103.
> Tags: **VERIFIED** (read the primary source or the code myself today), **DOCUMENTED** (an
> official or vendor page says so; read through a summarizer or a search snippet), **INFERRED**
> (my reasoning). Evidence for the metaphor test sits outside git (D75):
> `~/dev/ducter-evidence/connectors/metaphor-test-2026-11-09/`.

## 0. The question

The author: Ducter needs Gmail-style connectors and "restrained but useful" proactive work,
the kind of moment that made OpenAI dots, Muse and the Grok bot feel like real help. Combined
with browser, phone and computer use, that covers much of daily life and work. How should a
self-hosted, harness-agnostic Ducter do it, and how does a person set it up in the clay game
style?

## 1. Prior art: dots, Muse, the Grok bot

The original intent is "Conductor + dots/Muse/Grok bot". These three are the primary prior art;
everything else is secondary.

### 1.1 OpenAI dots

- **What it is.** dots are OpenAI's always-on personal agents inside ChatGPT, announced at
  DevDay on 2026-09-29. Each dot has its own cloud computer and browser, can use your own
  computer if you allow it, and reaches apps through OpenAI's plugin directory (4,000+ apps).
  - DOCUMENTED: https://learn.chatgpt.com/docs/dots, plus a search snippet of
    https://openai.com/index/introducing-dots/. The announcement page itself returned 403 to
    both me and the research agent, so I have not read it.
- **Plans.** Pro tiers and Business Premium. Talking to a dot doesn't count against usage
  limits; tasks it starts in Work or Codex do. Models: GPT-6 Astra at launch, Terra since
  2026-11-04. Not available in the EEA, UK or CH. DOCUMENTED: the docs above and
  https://learn.chatgpt.com/docs/whats-new/november-2-6-2026.md
- **Proactive research is what produced the "aha".** When you aren't working with it, a dot
  researches the apps you connected to look for ways to help. It keeps private notes and may
  bring you a suggestion or a question. DOCUMENTED:
  https://learn.chatgpt.com/docs/dots/tasks-and-memory
- **The restraint is structural, not a matter of tone.** VERIFIED, from
  https://learn.chatgpt.com/docs/dots/controls:
  - "The tools it uses for that research can't send messages, change app content, or control
    your browser or computer."
  - Any later action passes "an automatic review [that] checks it against your instructions,
    permissions, custom rules, and built-in safety requirements". The review decides whether
    the action "can proceed, needs your approval, or includes a step you must do yourself".
  - Custom rule levels: "Take action without asking", "Take action when you say so", "Ask
    before taking action", "Hand off to you".
  - "Asking your dot to draft replies doesn't give it permission to send them."
  - "OpenAI doesn't train models directly on proactive research or its private notes."
- **The author's own aha moments with dots.** VERIFIED as a first-hand report from the
  author, 2026-11-09:
  1. dots found **a domain renewal he had forgotten to pay**. Missing it would have meant
     losing the domain.
  2. dots found **a flight he had bought that didn't match his hotel dates**.

  Both are joins the person couldn't easily make. A renewal notice has to be set against the
  payment status, which sits in another mail or on the registrar's site. A flight booking has
  to be set against a hotel booking: two companies, two confirmations, weeks apart. Both are
  also costly to miss. This is the strongest evidence in this report, and it outranks the
  reviews below. INFERRED: both need typed facts (renewal, payment, booking dates) kept long
  enough to meet. Mail-by-mail triage alone can't produce them.
- **Watching is explicit.** "Connecting Slack or another source alone doesn't create a
  monitoring task." Fixed check-ins are saved schedules: what to check, time zone, end date,
  what deserves a notification, and where it goes. DOCUMENTED: tasks-and-memory page.
- **No numeric cap is documented.** There is no cadence setting, daily cap or quiet hours.
  Interruption is shaped in plain words, for example "Message me in ChatGPT only if a deadline
  is at risk or you need a decision", with routing by channel. DOCUMENTED (the docs), INFERRED
  (from the absence). Evidence is thin here.
- **Gmail.** A plugin with per-action permissions (read yes, send no). It asks you to reconnect
  when the grant expires. DOCUMENTED (secondary): https://flaviocopes.com/openai-dots/
- **What hands-on reviews found.**
  - Useful (Zapier, real Gmail):
    - bounced card payments, with the fix;
    - a builder's quote that missed a grant's requirements;
    - two deliveries with clashing locations;
    - a support email the author had wrongly taken for a scam.
  - Noise: payment and delivery alerts the author already knew from the subject line.
  - Missed: mail that needed judgment (an editor saying "hold off").
  - Risk: "when it isn't pinging you, you assume nothing important is hitting your inbox".
  - One send happened without asking, on a thread where an earlier send had been approved.
  - DOCUMENTED: https://zapier.com/blog/chatgpt-dots/
  - Every.to's best moment: a flight option that "may overlap with Randy's Wednesday morning
    video recording", found in a Slack thread the reviewer had never seen. DOCUMENTED:
    https://every.to/vibe-check/vibe-check-dots-always-on-agents-in-chatgpt (mostly paywalled).
- **Notes are opaque.** Per a secondary source, a dot's private notes can't be viewed or
  deleted one by one, and disconnecting a plugin doesn't erase what it learned. DOCUMENTED
  (secondary, flaviocopes). Ducter can do better: Mem is the user's, with 忘掉 / Forget.

### 1.2 The Grok bot (xAI)

All VERIFIED from https://docs.x.ai/grok-bot/overview,
https://docs.x.ai/grok-bot/skills-routines-and-automations and
https://docs.x.ai/grok-bot/approvals-security-and-privacy:

- **What it is.** A "proactive AI teammate" on one persistent cloud computer (browser,
  filesystem, terminal).
  - Connectors: Gmail, Calendar, Drive, Slack, Notion, Teams, Granola, plus custom MCP.
  - Channels: desktop, mobile, Slack, X, voice.
- **Routines.** You create one by asking it to repeat a task. Examples: a Sunday-evening review
  that flags clashes and sends a Monday plan, overnight inbox sorting, morning briefings.
  - Triggers: schedules, Slack/GitHub/Linear/Sentry/PagerDuty events, mail to the bot's own
    address, webhooks.
  - Hard limits: at least 5 minutes between runs, 50 routines, 300 runs per hour in total,
    200 per routine. Routines may pause after a long silence from the user.
  - The docs warn: "a Slack trigger on a busy channel can use a week of usage in a day".
- **Trust.**
  - Mail from routines or other unrequested work stays a draft until you press Send.
  - Forwards, and attachments the review can't read, always need approval.
  - Approval cards from background work expire after 30 minutes and the action is then not
    done. Cards raised from chat wait.
  - Rules are "Allow automatically" / "Ask first", up to 20 each, and Ask first wins.
  - Secrets come from a vault, and bots "sign in and check out without seeing secret values".

### 1.3 Muse (Meta)

- **What it is.** Launched 2026-09-08. It makes "suggestions unprompted", acts on details
  mentioned once, and "comes back when something changes or when it needs approval".
- **How it is built.** It runs in a dedicated Muse Secure VM with its own browser. A separate
  Sentinel agent gates outbound traffic: "Nothing Muse does reaches the internet unless the
  Sentinel approves it".
- **Trust.** It asks before sending email or buying, and you choose read-only or read-and-send
  for mail.
- DOCUMENTED: https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/,
  https://www.axios.com/2026/09/08/meta-debuts-muse-personal-ai-agent
- **What reviews found.** DOCUMENTED (review, secondary): https://preuve.ai/blog/meta-muse-review
  - It checks Docs and mail about every 30 minutes, and has an ideas feed and an approvals tab.
  - Grants can be once, per session, per task, time-boxed, or "Allow Always".
  - A rule told to it in chat didn't stick.
  - An "Allow Always" grant let it answer a Marketplace buyer with the seller's pickup location
    while the seller was away.
  - Batch unsubscribe from 13 lists was well received. DOCUMENTED:
    https://www.standard.net/lifestyle/home_and_family/2026/oct/20/tech-matters-muse-is-an-easy-way-to-start-with-an-ai-agent/
- **No frequency control is documented.** Evidence is thin.
- `research/25` already covers Muse's browser and credential model.

### 1.4 Secondary prior art

- **ChatGPT Pulse** (Sept 2025). Overnight research over chats, memory and connected
  Gmail/Calendar, delivered as morning cards. Thumbs up/down and "curate" steer it, and unsaved
  cards expire in about a day. DOCUMENTED (secondary):
  https://www.techradar.com/ai-platforms-assistants/chatgpt/chatgpts-new-pulse-feature-will-help-you-manage-your-day-with-handy-visual-updates
- **Google Gemini Daily Brief**, from the Labs "CC" experiment. Once a day in the morning,
  from mail, calendar and past chats, with no time setting. DOCUMENTED:
  https://gemini.google/overview/daily-brief,
  https://techcrunch.com/2025/12/16/google-tests-an-email-based-productivity-assistant/
- **Apple notification summaries** produced false headlines (the BBC case). Apple paused them
  for news apps in iOS 18.3 and set summaries in italics. Lesson: a summary written in the
  system's own voice borrows the source's authority. DOCUMENTED:
  https://www.advanced-television.com/2025/01/17/apple-suspends-ai-news-after-bbc-complaints
- **Research.**
  - ProactiveBench (arXiv 2410.12361): models "frequently offer unnecessary help", and the
    false-alarm rate is the core metric.
  - KnowU-Bench (2604.08455): about 60% of failures were unwanted interventions and about 20%
    were being too passive.
  - Chen et al., CHI 2025 (2410.04596): proactive help raised task completion 12–18%, and more
    frequent suggestions hurt the experience.
  - All DOCUMENTED.
  - Horvitz's mixed-initiative principles (weigh the value of acting against the cost of
    interrupting, scaled by confidence) are INFERRED from prior knowledge, not re-read.
- **Not covered this pass:** Alexa+, Copilot, Lindy, Superhuman, Shortwave, Poke.

### 1.5 What made the moments restrained and useful (INFERRED synthesis)

1. **Background noticing is structurally read-only** (dots). A finding becomes an ordinary
   decision with an ordinary gate, and no rule can loosen the background tools.
2. **The aha comes from joining sources the person can't join themselves, where missing it is
   costly.** The author's two dots moments: renewal notice vs payment; flight vs hotel dates. A Slack thread
   against a flight, a quote against a grant's rules. Repeating what the subject line already
   says is noise.
3. **Unrequested work drafts and never sends.** Approvals from background work expire into
   "not done" (Grok).
4. **Silence has to be trustworthy.** Say what was checked, not only what was found.
5. **Rules live in settings, not only in chat** (Muse). Avoid "Allow Always" for anything that
   reaches people.
6. **Every proactive item takes feedback** (Pulse), and every summary links its source (Apple).
7. **Caps on runs and spend** (Grok), and a pause after the user goes quiet.

None of the three publishes a numeric daily cap. Ducter's "at most 3 a day" is our own
proposal, grounded in the research above rather than in a product.

## 2. The hard practical bits for self-hosted Google access

All from the research agent's pass. I re-checked the scope table and the oauth2 page's 7-day
rule.

- **Scope classes** (VERIFIED: https://developers.google.com/workspace/gmail/api/auth/scopes,
  https://developers.google.com/workspace/drive/api/guides/api-specific-auth):

  | Scope | Class |
  |---|---|
  | `gmail.readonly`, `gmail.compose`, `gmail.modify`, `gmail.metadata`, `https://mail.google.com/` | restricted |
  | `gmail.send` | sensitive |
  | `drive.readonly`, `drive` | restricted |
  | `drive.file` | non-sensitive, but only sees files the app created or the user picked |
  | Calendar read | sensitive (DOCUMENTED, by Google's own example) |

  Drafting (`gmail.compose`) is restricted and sending alone is only sensitive.
- **Verification.**
  - A shared app with restricted scopes needs Google verification plus a yearly CASA
    assessment. CASA applies when you "store or transmit restricted scope data on servers"
    (VERIFIED).
  - Third-party prices run about $540–6k a year (DOCUMENTED, soft).
  - An unverified app in production is capped at 100 new users, for life (VERIFIED,
    https://support.google.com/cloud/answer/15549945).
- **Testing status breaks a personal AI.** Grants by test users "expire seven days from the
  time of consent" (VERIFIED, https://developers.google.com/identity/protocols/oauth2). A
  watcher that silently dies every week is worse than none.
- **Bring your own client (BYO) is the recognised escape.** Each user makes a GCP project, an
  External consent screen and a Desktop client, then publishes it as **In production,
  unverified**. They click through the warning once and are the only user, under the
  personal-use exemption ("fewer than 100 users").
  - VERIFIED precedents:
    - rclone: its shared client "will stop working during 2026", and it pushes everyone to BYO
      (https://rclone.org/drive/).
    - Home Assistant: "Publish app" or credentials expire every 7 days
      (https://www.home-assistant.io/integrations/google_mail/).
    - n8n self-hosted: "Managed OAuth2 isn't available for self-hosted"
      (https://docs.n8n.io/integrations/builtin/credentials/google/oauth-single-service/).
    - Google's own `gws` CLI ships no shared client (https://github.com/googleworkspace/cli).
  - Thin spot: Google's text never states that the personal-use exemption covers restricted
    scopes. Practice says it does.
  - Cost to the user: about 6–11 console steps.
- **The client itself.** Desktop-app type, loopback redirect, PKCE S256; the client secret is
  not secret (VERIFIED, https://developers.google.com/identity/protocols/oauth2/native-app).
  - A headless Linux main needs the browser on another machine. In practice that means an SSH
    tunnel, or doing the consent on the Mac and moving the refresh token (INFERRED).
- **Tokens.**
  - Store them in the macOS Keychain, or Secret Service on Linux, or encrypt at rest with the
    key in the OS keyring (VERIFIED: Google's best-practices page; `gws` does the latter).
  - They die on:
    - 6 months unused;
    - a password change (for Gmail scopes);
    - more than 100 refresh tokens per client.
  - So `invalid_grant` must become a calm "sign in again" prompt (VERIFIED).
- **Push vs polling.**
  - Gmail push needs a Pub/Sub topic, an IAM grant and a `watch` renewed within 7 days, and
    probably billing (INFERRED). Pull subscriptions avoid a public endpoint.
  - Polling `history.list` costs 2 units against 6,000 units per user per minute, so once a
    minute is about 0.03% of the budget. `messages.get` costs 20, or 60 with format=full
    (VERIFIED, https://developers.google.com/workspace/gmail/api/reference/quota).
  - Calendar push needs a public HTTPS webhook, so `syncToken` polling is the way (VERIFIED).
  - Conclusion: poll.
- **Alternatives to a Google client.**

  | Path | What it takes | Catch |
  |---|---|---|
  | IMAP + app password | 2-Step Verification on the account | "Not recommended" by Google, gone for Advanced Protection and many work accounts, revoked on a password change (VERIFIED, https://support.google.com/accounts/answer/185833) |
  | IMAP XOAUTH2 | `https://mail.google.com/` | The broadest restricted scope, so no gain (VERIFIED) |
  | Apple Mail's local store (macOS) | Mail.app already syncing the account; Full Disk Access | Undocumented schema (DOCUMENTED, community MCP servers) |
  | Fastmail JMAP tokens | A token from settings | None for this purpose; trivial (VERIFIED) |
  | Microsoft Graph | Publisher verification | Free, with no security audit (VERIFIED) |
  | Google's official Gmail MCP server (`gmailmcp.googleapis.com`) | A GCP project, a client and enrollment | Developer Preview (VERIFIED, https://docs.cloud.google.com/mcp/supported-products). It solves nothing for verification |

- **How hosted products avoid it.**
  - Composio and Arcade run their own Google app. Pipedream's built-in Gmail asks only for
    send/labels, and read needs your own client (DOCUMENTED).
  - ChatGPT and Claude run verified apps (INFERRED; nothing public).
  - In every case the mail passes through the vendor.

## 3. MCP connector ecosystem (late 2026)

- **MCP authorization 2026-07-28** (VERIFIED,
  https://modelcontextprotocol.io/specification/latest/basic/authorization):
  - OAuth 2.1, Protected Resource Metadata, the RFC 8707 `resource` parameter, PKCE.
  - Client ID Metadata Documents SHOULD be used; dynamic registration is MAY and deprecated.
  - STDIO servers take credentials from the environment.
- **Vendor remote servers.**

  | Vendor | Endpoint and auth | Status |
  |---|---|---|
  | GitHub | `api.githubcopilot.com/mcp/`, with `/readonly`; your own OAuth app or a PAT | GA |
  | Linear | `mcp.linear.app/mcp` | Reported |
  | Notion | `mcp.notion.com/mcp` | Reported |
  | Atlassian Rovo | Remote server | GA |
  | Slack | `mcp.slack.com`, likely needs an admin to approve the client | Reported |
  | Google Workspace | Gmail, Calendar, Drive and more | Developer Preview |

  DOCUMENTED, URLs in the research agent's notes, summarised here. The read-only variants are
  the natural default for background noticing.
- **Self-hostable connector platforms.**

  | Platform | License | Hosting |
  |---|---|---|
  | Klavis | Apache-2.0 | Self-hostable |
  | Composio | MIT client; the catalog and auth are mainly hosted | Hosted |
  | Nango | Elastic License 2.0 | Self-hostable |
  | Arcade | MIT framework, hosted auth | Hosted |
  | Pipedream | Source-available; Workday deal reported Nov 2025 | Hosted |

  DOCUMENTED.

## 4. oomol-lab/open-connector (read at `d1d8575`, 2026-11-09)

Cloned with `git clone --depth 1` into the session scratchpad and read only. I ran none of its
code.

- **What it is.** "An open-source connector gateway for AI agents and an alternative to
  Pipedream/Composio." It has a catalog of "1,000+ providers and 10,000+ prebuilt Actions"
  (1,741 provider directories in `src/providers`). VERIFIED (README, tree).
- **Maturity and activity.** VERIFIED via the GitHub API.
  - 6,201 stars and 590 forks; created 2026-06-29.
  - About 200 commits in the last 30 days.
  - v1.9.7, v1.9.8 and v1.9.9 all came out on 2026-11-05.
  - So it is very young and moves very fast.
- **License.** VERIFIED (`LICENSE.txt`).
  - "Modified Apache-2.0": no offering of it as a hosted connector service to third parties.
    Embedding is allowed: "a product whose primary value lies elsewhere … is not a hosted
    connector service".
  - Contributors agree "OOMOL may adjust the license … more strict or more relaxed".
  - Releases up to v1.9.4 are plain Apache-2.0.
  - Ducter embedding it is fine today. The re-license clause is a real supply risk.
- **Coverage.** VERIFIED (`src/providers`, `src/mail`).
  - Gmail, googlecalendar, googledrive, googledocs, googlesheets, googletasks.
  - github, slack, notion (plus `notion_mcp`), linear (plus `linear_mcp`), outlook,
    outlook_calendar.
  - `generic_imap` (imapflow + nodemailer), qq_mail, netease_mail.
- **Gmail specifics.** VERIFIED (`src/providers/gmail/scopes.ts`, `actions.ts`, trigger).
  - Scopes are split per action, so a read-only integration can ask for `gmail.readonly`
    alone. The code's own comment argues for least privilege.
  - Actions include `search_threads`, drafts, `send_draft` and `send_email`.
  - `gmail.on_message_received` is a **poll trigger**. It reads `history.list` from a
    `historyId` checkpoint that the *caller* holds and passes back, at most 100 events a page.
    That is exactly principle 16's "waits are code".
- **Auth and token storage.** VERIFIED (`docs/credentials.md`, `docs/gmail-oauth-sdk.md`).
  - Self-hosted means "OAuth providers require OAuth client credentials from apps you register
    with those providers".
  - Credentials sit in SQLite or Postgres, AES-256-GCM encrypted with an
    `OOMOL_CONNECT_ENCRYPTION_KEY` that the host supplies. Without it they are stored as
    plaintext, with a warning.
  - Refresh is handled. The account profile (`accountId`, `displayName`, `grantedScopes`) is
    exposed to agents; raw tokens never are.
- **Does it solve Google's verification for self-hosted users? No.** VERIFIED
  (`docs/saas-oauth.md`).
  - Self-hosted brings its own client.
  - OOMOL Hosted solves it with "OOMOL-provided OAuth apps", but then "Third-party access
    tokens, refresh tokens … stay on SaaS" and "Inputs and outputs travel through SaaS".
  - Whether OOMOL's Google app passed CASA: unknown.
- **How it exposes tools.** VERIFIED (`docs/runtime-api.md`, `docs/headless.md`).
  - HTTP `/v1/actions/*` with OpenAPI.
  - A stateless MCP endpoint with five discovery tools: `list_apps`, `list_connections`,
    `search_actions`, `get_action_guide`, `execute_action`.
  - A TS SDK and the `oo` CLI.
  - A **headless library**, `@oomol-lab/open-connector`. Its docs: "Importing the package
    starts nothing … does not read environment variables", it runs on "Bun 1.4.4+" (Ducter
    pins Bun 1.4.4), and "selected-provider builds include only those providers".
  - Runtime tokens carry `allowedActions`, `blockedActions`, `allowedConnections` and
    `allowedTriggers`.
  - An optional built-in OAuth 2.1 server for remote MCP clients.
  - A web console.
- **Phones home?** The only oomol.com reference in core source is the Marketplace discovery
  default (`src/marketplace/default-marketplace.ts` →
  `connector.oomol.com/.well-known/oomol-connector-marketplace`). Marketplace keys are opt-in.
  VERIFIED that nothing else in core references oomol.com; INFERRED that nothing calls out
  when no key is set.
- **How it would sit behind Ducter** (INFERRED):
  - Embed the headless runtime in the control plane on the computer Ducter lives on, as one
    adapter behind Ducter's own `ConnectorPort`.
  - Hand Ducter's encryption key to it from the Keychain.
  - Never hand its MCP endpoint or a runtime token to a harness. Harnesses see only Ducter's
    tool server, which calls the runtime in-process with a Ducter-minted grant per session.
  - Watchers call trigger `read` with the checkpoint stored in Ducter's waiter table.
- **Risks** (INFERRED):
  - license tightening (pin a version; v1.9.4 is a clean Apache fork point);
  - churn (several releases a day, so pin and upgrade on purpose, the way OAR is handled);
  - dependency weight (aws-sdk, pg, ali-oss, mqtt; prefer a selected-provider build);
  - a young Gmail executor that we must test ourselves;
  - its five generic MCP tools are the wrong shape for a gated personal AI, so we don't use
    them.
- **Verdict: adopt partially.**
  - Use the headless runtime as the default engine for API connectors: the action catalog,
    OAuth flow, refresh, encrypted storage and poll triggers.
  - Keep Ducter's broker, gate, Log audit, attention bar and copy as ours.
  - Off by default: OOMOL Hosted, the Marketplace, and the runtime's own MCP server.
  - Don't let it be the only path: the user's own MCP servers and the 上网 ability stay
    first-class sources.

## 5. Metaphor process (AGENTS.md rules), short form

Concept: the accounts Ducter may read, where they live, what it may do in them, and how often
it may come to you on its own.

| Candidate | Mapping | False implications |
|---|---|---|
| A Literal settings page (no metaphor) | Cards: account · "kept on This Mac" · reads / drafts / sends after Go; three-choice row for frequency | None visual. Dry; doesn't show *where* (D43) |
| B Round tokens on the Mac's island + a 3-slot tray | Account = token standing where it's signed in, like AI accounts; finds = notes in the tray | Token reads as a letter or a message (0/5 unlabeled saw an account) |
| C Mailboxes on the Mac's island + a dial | Account = mailbox; Ducter checks it; a flag = something worth telling | Flag = every new email; a US raised flag = outgoing mail; "mail is delivered to my Mac" (half true); Calendar isn't mail |
| D Keys on a hook + volume knob | Account = key handed to Ducter; knob = how much it speaks | Key = opens my Mac; full access; dragging a key off feels too easy; volume = loudness, not frequency |
| E Windows of a house + doorbell | Account = window it looks through; doorbell = interruptions | Peeking and surveillance; curtains imply it still sees shapes |
| F Fishing lines into streams + a basket | Account = stream; catch = finds | "Fishing through my mail" feels creepy; catching implies taking things away |

**Rubric scores (1–5).** From the test below plus judgment.

| Candidate | Legible without labels | Fidelity | Scale to 10 accounts | State | Emotional fit | Distinctive | Feasible |
|---|---|---|---|---|---|---|---|
| A | n/a | 5 | 5 | 3 | 2 | 1 | 5 |
| B | 1 | 4 | 3 | 3 | 4 | 3 | 4 |
| C | 5 | 4 | 3 | 4 | 4 | 4 | 4 |
| D | 4 | 2 | 4 | 2 | 3 | 3 | 4 |
| E | n/a | 2 | 2 | 3 | 2 | 3 | 3 |
| F | 3 | 2 | 2 | 3 | 2 | 4 | 3 |

**The test.** LLM proxies with cheap models, run with `claude -p` and the user's settings left
out (`--setting-sources project,local --strict-mcp-config`).

- **Round 1, labeled.** Six scenes with identical text labels, 6 Haiku raters each, 7
  questions, graded by Sonnet against a key.
  - All six scored 24/24 on the facts: where the access lives, whether it sends alone, how
    often, how to stop. The labels carried comprehension.
  - Mean "feels safe": A 3.8, B 3.7, C 3.3, F 3.2, D 3.0, E 3.0.
  - Mean "nice to look at": D 4.3, C 4.2, F 4.2, B 4.0, E 4.0, A 3.0.
- **Round 2a, unlabeled.** The same scenes with every quoted label stripped, 5 raters each.
  "Reads as an account or a source":
  - C mailboxes 5/5;
  - D keys 4/5, with "into my Mac" worries;
  - F fishing 3/5, "creepy";
  - B tokens 0/5, read as letters.
- **Round 2b, honesty.** B plus an honest line: "to understand a message it shows it to your
  AI account (Claude); nothing is sent anywhere else". 8 raters, 32/32 on the facts, but
  "feels safe" fell to 3.1. Raters called "shown to Claude" and "nothing elsewhere" a
  contradiction.
- **The commonest worry in every round:** "kept on This Mac" was read as "nothing leaves the
  Mac", and that is false, because the model provider sees the text. Next: does removing the
  account erase what it learned, and can an urgent item break quiet hours?
- **Limits.** Proxies are not people: small n, one model family, scenes written by me. This
  doesn't satisfy the human comprehension test; it only orders the candidates.

**Pick: C's mailboxes, without flags, plus B's tray.**
- Mailboxes win unlabeled legibility, and standing on the Mac's island states the true
  location.
- The tray carries the daily cap as visible slots.
- The flag is dropped: it's the main false reading, and US flag semantics invert it.
- The honest line stays, reworded so it doesn't contradict itself: "别人拿不到 / No one else
  gets it".
- Literal A is the fallback, if human testing finds the mailbox reads as "Ducter receives my
  mail".

Prototype: https://claude.ai/artifact/BC1i6YEt8EKQ5VtMeCjEw8

## Implications for Ducter

1. **Connectors live on the computer Ducter lives on**, in the control plane, behind a broker.
   Harnesses never hold provider credentials. They see a scoped slice through the Ducter tool
   server, so every read is recorded and every write is an intent.
2. **Lead with the author's two moments.** A forgotten domain renewal and a flight that
   doesn't match the hotel. Triage extracts typed facts (renewals, payments, bookings) into a
   small ledger on the main, so a later pass can join them across weeks.
3. **Proactive work is a cascade.**
   - Code polls (`history.list`, `syncToken`) at zero model cost.
   - Rules drop bulk and already-known mail.
   - A cheap model triages batches.
   - The partner, with Mem, judges the few that pass.
   - Only items that clear the bar enter the living message, at most 3 a day by default and
     held during quiet hours.
4. **Background reads are structurally read-only.** Drafts are fine; sending, spending and
   calendar writes wait for Go, and no rule can loosen that for background work.
5. **Gmail for a self-hosted user means a guided BYO Google client**, published as
   unverified-in-production. That is the main onboarding cost. Offer Fastmail, IMAP and Mail.app
   as lighter paths, and the browser (上网) as the zero-setup fallback.
6. **Adopt open-connector partially**, as the embedded engine behind a port, pinned, and with
   its hosted parts off.
7. **Say plainly that the AI account sees the text.** It costs some felt safety in the proxy
   test, and it is true.

**Summary.** dots, Muse and the Grok bot agree on read-only background noticing, drafts not
sends, explicit watching, and approvals that expire. None publishes a numeric cap. The aha is a
join across sources the person can't see, where missing it is costly, as in the author's own
two dots moments (an unpaid domain renewal; a flight that didn't match the hotel). For self-hosted Ducter the hard part is Google's
restricted scopes: each user brings an unverified, published OAuth client. Polling beats
Pub/Sub. open-connector is a strong embeddable engine (Gmail poll trigger, per-action scopes,
encrypted tokens, Bun-compatible headless library). It doesn't solve verification, and its
license may tighten, so it goes behind Ducter's own broker, pinned. The proxy test favours
mailboxes on the Mac's island with a 3-slot tray, and leaves a human test still owed.
