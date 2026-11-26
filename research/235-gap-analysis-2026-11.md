# 235 · Gap analysis, 2026-11: the open agent app, Raft's onboarding agent, and our own motivation

Date: 2026-11-26, on main at `89feb927` (0.1.84). Follows research/218 (round 4, 0.1.27) and the
author's standing ask: compare Ducter against the reference projects and against `motivation.md`,
find the high-priority things not yet built, and push the first one forward.

Read: `AGENTS.md`, `motivation.md`, `design/principles.md`, `design/roadmap.md`, `design/todo.md`
(headings and the open items cited), `design/scenarios.md` (the Built column of every row),
`design/decisions.md` D500–D587, `research/02`, `research/218`, and Ducter's code where a claim
rests on it. Outside, read only and never run: two fresh shallow clones in the session scratchpad,
**the open agent app** (a desktop and phone GUI over Claude Code, Codex and pi, with a hosted model;
the same product research/218 calls by that name; its name and commit are in
`research/private/235-gap-notes.md`) and **Raft** (`botiverse/raft-source`, the team workspace of
research/02 §2, at its 2026-11-23 head), whose onboarding agent is called Cindy.

Tags: **VERIFIED** = read in code or docs at the commit named; **DOCUMENTED** = the product's own
page or README; **INFERRED** = judgment.

## 0. Where research/218's ten stand (VERIFIED in `decisions.md` and code)

| 218 # | Now |
|---|---|
| 1 live checks on hel | **Still open.** `todo.md` has no "Seen live:" line under any check; the one live run since is the Bridge trial (D557, `roadmap.md`) |
| 2 the aha in its general form | **Built in shadow** (D502, `packages/core/src/proactive/cross.ts`); promotion waits on the author's labelled week |
| 3 the partner on every agent | Partly: D512, D536; Codex not re-run at the current persona (`packages/partner/eval/results/LATEST.json` is haiku) |
| 4 the errand live on one shop | Open (author) |
| 5 same model, another door | **Built with fakes** (D503, `core/src/routes.ts`); `roadmap.md` "Quota awareness" under Next is stale text |
| 6 `ducter move` | First slice only (D504: `--plan`, read only); receive, bundle, import, cut-over, rollback unbuilt |
| 7 server home uses the Mac's browser | Built with fakes (D505); `worker-browser` check unrun |
| 8 bare-Mac first hour | Open (author) |
| 9 real microphone | Open (author) |
| 10 accounts as places (art) | Open (author's art review) |

## 1. What the references do that Ducter doesn't (VERIFIED unless tagged)

**The open agent app** (shallow clone, 2026-11-26):
- **Reach.** macOS, Windows, Linux, iOS and Android builds; the installer downloads Claude Code,
  Codex, ripgrep and pi per platform (`README.md` "What's in this repo", `apps/*-bin`); a hosted
  model service for people with no plan (DOCUMENTED, README "Start with what you already have").
- **What the work used.** A per-model usage ledger on the executing computer: plain input, output,
  cache read and cache write per message, reconciled with the turn's count; a personal usage page by
  the device's local day; a running token count and rate on each session (`docs/token-usage-attribution.md`,
  `features/cc-agent/RunningTokenCount.tsx`, `RunningTokenRatePopover.tsx`).
- **Moving.** A migration assistant for a new computer (settings snapshot and transfer) and "copy a
  task to another computer" (`docs/product-rules/new-device-setup-migration.md`, `task-device-migration.md`).
- **Event wakes.** A scheduled task can be woken by a webhook ("the event is only a doorbell: its
  body never enters the task, its secret never enters the record"; per-sender event filters, a
  rotating address; `docs/product-rules/schedule-webhook-trigger.md`).
- **Chat apps.** Feishu, DingTalk, WeCom, Discord, Telegram and iMessage through BlueBubbles
  (`packages/lizi-im/src/*`).
- **Remote desktop from the phone**, with a privacy screen on the host (`docs/remote-desktop.md`).
- **Plugins.** An MCP Apps host (interactive HTML from any MCP server, `docs/mcp-apps.md`), a plugin
  market, progressive plugin discovery, and a local agent API other apps on the computer can call
  (`docs/local-agent-api.md`).
- **Subscription pools**: several accounts per provider with a shared assignment policy
  (`docs/product-rules/subscription-account-pools.md`). Ducter's D503 covers the same need.

**Raft's onboarding agent** (`packages/shared/src/cindyOnboardingContent.ts`, `packages/daemon/src/cindy.ts`):
an ordinary agent seeded with objectives, an FAQ, a playbook and a first memory, whose one proactive
return is a **Day-2 10:00 recap**: read what actually happened since the opener, post exactly one
short recap ("never invent progress"), and only offer a daily cadence if the owner says yes. A
hosted variant exists for people with no computer (`hostedCindyService.ts`).

**What Ducter has that neither does (VERIFIED, for balance):** one partner that owns the person's
attention (typed reports, decisions with defaults, the living message); reading the person's
accounts for offers (proactive engine, 6.9k lines); Nowledge Mem as one memory across tools;
expire-aware resume of the partner; the D61 floor in code; errands to the checkout; small apps.

## 2. The top ten gaps, ranked

Score as in research/201 and 218: impact (1–5) × reach (which of the three users, 1–3) × cost
(3 = a branch with fakes the lead can do, 2 = needs one of the author's devices or accounts, 1 =
gated on others or on a person's judgment). Size: S ≤ a day, M ≤ three days, L more.

| # | Gap | Hurts | Evidence | I | R | C | Score | Size |
|---|---|---|---|---|---|---|---|---|
| 1 | **Proof: the owed live checks still unrun** (all but the Bridge trial) | all three, through trust (放心) | VERIFIED: `todo.md` no "Seen live:" line; `build-and-run.md` "Live checks" | 4 | 3 | 2 | 24 | S |
| 2 | **What the work used: no ledger of tokens by task, agent and day** | heavy developer (one plan under thirty tasks and a 300-round loop), consumer on a paid key (按用量付费 with no record of what was spent) | VERIFIED: per-task totals only (`protocol/src/context-meter.ts` `total`), limits only (`core/src/account-usage.ts`); no aggregate anywhere (grep); the open agent app keeps one (§1) | 4 | 2 | 3 | 24 | S–M |
| 3 | **An event doorbell for standing work** (a URL a CI job, a script or a phone shortcut can ring to wake a Keep) | heavy developer; consumer through Shortcuts (INFERRED) | VERIFIED: no inbound wake in `core/src` (grep "webhook": none); Keeps wake by time, arrival or a watched change (`standing-work.md`); the open agent app's doorbell rule (§1) | 3 | 2 | 3 | 18 | S–M |
| 4 | **`ducter move` beyond the plan** (bundle, receive, import, cut-over, rollback) | heavy developer (the motivation's "my cloud environment had to move within days") | VERIFIED: D504, `design/move.md` §5; the open agent app's migration assistant (§1) | 4 | 1 | 3 | 12 | L |
| 5 | **Chat apps Chinese workplaces use**: Feishu, DingTalk, WeCom | consumer and developer in China | VERIFIED: Ducter has Telegram, Slack, WeChat ClawBot, iMessage (`channels.md`); the open agent app has all three (§1) | 3 | 2 | 2 | 12 | M each |
| 6 | **Reach: no store apps, no Windows or Linux desktop** | fresh user, consumer | VERIFIED: `roadmap.md` (TestFlight beta, Android without a release key); the open agent app ships five platforms (DOCUMENTED) | 5 | 2 | 1 | 10 | L |
| 7 | **The fresh user's first hour, unwalked on a bare Mac** | fresh user | VERIFIED: A1 row "not yet with a real key or a bare Mac"; the open agent app bundles the agents and a hosted model (DOCUMENTED) | 5 | 1 | 2 | 10 | M |
| 8 | **Plugin breadth**: an MCP Apps host, a way to find skills | consumer | VERIFIED: the person's MCP and skills are inherited (principle 17), no host for MCP Apps (grep: none) | 2 | 2 | 2 | 8 | M–L |
| 9 | **Taking the screen from the phone** (remote desktop with a privacy screen) | heavy developer away from the desk | VERIFIED: Ducter's computer use is for tasks (D235), nothing lets the person drive; the open agent app has it (§1) | 3 | 1 | 2 | 6 | L |
| 10 | **A second-day return after the first run** (one honest recap of what was set up, the cadence offered once) | fresh user | VERIFIED in Raft (§1); Ducter's first words (D298, D327) and the morning note (K7) exist; whether the morning note says "here is what we set up yesterday" is INFERRED not | 2 | 1 | 3 | 6 | S |

### Why each ranks where it does

1. **Proof first, still.** Every scenario row since 218 says "fakes only". The kit exists (D463) and
   five checks need no person. Its cost is the author's server (hel), which this branch must not
   touch, so it is not the one built here.
2. **What the work used** is the cheapest gap with the widest felt value. The heavy developer's
   motivation is attention *and* subscription economics: when a weekly limit runs out (D297 says so
   well), nothing says *which work* spent it, so the person can't tell the 300-round review loop from
   the one big refactor. The consumer on a paid key (D440) is told "每次用都花钱" and never shown how
   much. The data is already in the Log (every turn end carries its usage; `runner.ts` logs it), so
   the first slice is a fold over the Log with no new store, model call or setting.
3. **A doorbell** is small and fits D511's Keep (a wake by a ring beside time, arrival and a watched
   change), but it needs the partner's tool (an eval) and a reachable address (D228, D265 give one).
4. **Move** answers the motivation's first reason directly and has a design (D504); it ranks under
   the doorbell only on cost: L, with the most risk (credentials, the Mem handover, cut-over). Its
   bundle-and-receive slice deserves its own day.
5. **Feishu / DingTalk / WeCom** matter to the author's own market (the docs and chat are in
   Chinese), but each needs a real tenant for the live check.
6. **Reach** is the biggest felt gap for the fresh user but is gated on store accounts and signing.
7. **The bare Mac** is one walk by the author; the code paths exist (D440).
8–10. Valuable, lower reach or high cost; #10 is cheap and could ride with the morning note.

**Closed since 218, not ranked:** several accounts of one model (D503), the aha's general form in
shadow (D502), a server home using the Mac's sign-ins (D505, fakes).

## 3. Built here: #2, the first slice (D588)

`ducter usage [--days 7] [--json]`, read only, counted from the home's Log: the days' tokens in all
(input with its cached part, output), by AI agent and model, by who started the work (the person or
the partner), the tasks that used most, and day by day. It is the D504 pattern (a read-only CLI
first slice) and the D473 pattern (`ducter repairs`: one socket frame, one pure fold in core). What
it does not do yet, said in its own output: the partner's own turns and Ducter's own looks (judges,
second looks, the proactive reads) are not in task streams and are not counted; money is not
priced. The next slices (a line in Settings › Overview and on the limit card, the partner able to
answer "what ate my week", then the partner's own turns) are in `todo.md`.

## 4. Built here: #5, Feishu / Lark (D622)

The branch takes gap #5's first app: Feishu in China and Lark abroad as one card, the person's own
**企业自建应用 / Custom App**, with events over the open platform's **long connection** (a
WebSocket) and no public address. The official open API only: `tenant_access_token`,
`bot/v3/info`, `POST /callback/ws/endpoint`, `im/v1/messages` send/reply, `PUT /im/v1/messages/:id`
edit, and the protobuf `Frame` (seq 1, log 2, service 3, method 4, headers 5, payload 8) with a
`{"code":200}` ack inside 3 s and a ping every `ClientConfig.PingInterval`.
Sources: [sending a message](https://open.feishu.cn/document/server-docs/im-v1/message/create.md?lang=zh-CN),
[editing a message](https://open.larksuite.com/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/message/update.md),
[the bot's info](https://open.feishu.cn/document/client-docs/bot-v3/obtain-bot-info.md?lang=zh-CN),
[opening a bot chat](https://open.feishu.cn/document/common-capabilities/applink-protocol/supported-protocol/open-a-bot)
(DOCUMENTED), and the long-connection codec as the Go/Rust SDKs write it (VERIFIED in their source:
the `Frame` fields, the ack, the split-packet headers; the endpoint body's `AppID`/`AppSecret`
spelling is the one still inferred from the SDKs). The app asks for
`im:message.p2p_msg:readonly`, `im:message:send_as_bot` and `im:message:update`, and the event
`im.message.receive_v1`; only a direct chat is the person's window. No buttons, files, groups or
threads in this slice; they are in `todo.md` with the live check on a real tenant (the branch has
no tenant and never calls one). Built and checked against a fake open platform and long connection
only (`packages/core/test/fake-feishu.ts` and `channels-feishu.test.ts`); zero live calls.

## Implications for Ducter

1. Proof (#1) stays the first thing the author's server should run; nothing here replaces it.
2. Spend is a trust surface: the partner already says when a limit ran out; it should be able to
   say what spent it. Count from the Log, never from a second store, so the numbers can be rebuilt.
3. Keep the reference app's "the event is only a doorbell" rule if the doorbell (#3) is built: a ring
   wakes a Keep with its name and time, never with a body the model would read as instructions.
4. Move (#4) is the motivation's own first reason; schedule its bundle-and-receive slice next after
   the spend line reaches the clients.
5. `roadmap.md`'s "Quota awareness" under Next is stale after D503 and should move to Works today
   with "fakes only" (done in this change).
6. Gap #5's first app is built with fakes (D622): Feishu / Lark is one card over both open
   platforms, a direct-message window with the same pairing and stranger rules; the live tenant
   check and the group/files/buttons slices stay in `todo.md`. DingTalk and WeCom are still open.

**Summary.** Since research/218 most of its list closed in code (D502, D503, D505) or stays the
author's (live checks, the errand, the bare Mac, the mic). Against the open agent app the clearest
buildable gap is that nobody can see what the work used; Ducter has every turn's tokens in its Log
and never adds them up. D588 adds them up in `ducter usage`. Gap #5's first app, Feishu / Lark, is
built here with fakes (D622).
