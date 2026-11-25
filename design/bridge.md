# Bridge: Ducter and the Agents It Didn't Start

> Design note · 2026-11-09, updated 2026-11-25 (D448: tasks Ducter carries messages for; D459: one story with Memory; D494: helpers, and the home as the one receiver; D555: nmem 0.10.123, Antigravity a Bridge tool, tasks without an automatic session, read receipts parsed; D557: the live trial passed, Bridge on by default; D559: the trial runs a task Ducter carries messages for; D560: replies to your agents said from Mem's facts, no Space picker, no mailbox task; D576: pi a Bridge tool from its plugin 0.8.20) · Principles 1, 7, 12, 14, 17, 18 · Decided: D105–D111 (outbound,
> the outgoing ledger, the result reply, names, copy, follow-through, the Mem asks), D162 (the live check and the
> real shapes), D163–D164 (beyond itself: X1–X3), D170 (X1, X2 and the Settings switch, built), D171 (the persona's Space), D205 (the persona connects itself with one tap), D225 (the released Bridge; the home's own Mem put in, updated and signed in from the same row), D324 (one home answers a partner's mailbox; the trial as its own identity), D333 (the partner's own tools only, 查看来信, the card says where it reads), D334 (the address is the identity, not the Space: every Space read, replies in the message's, a teammate's first message is a card), D338 (the card names only the Spaces read; a Space Mem answers 404 for is said and backed off; no connection per Space), D364 (nmem 0.10.120's linked shape: an original is not an answer; the update offered on the pane), D367 (every inbox page read; the trial's peer touches only its own run's mail), D369 (a mailbox Mem must sort out on its side: said once, checked every 30 min; the trial's guard reads Mem's own send prefix), D400 (nmem 0.10.121: the identity inbox read once, Mem's own open/reply argv, `--watch` or a 5 s wait, a device label, Mem's own notices said), D470 (Agent messaging in Settings' voice: who reaches whom drawn per agent with its fix, the exchanges as threads, who may ask what, the conversation says it once), D557 (the live trial passed; on by default; the real shapes read); still open: J-Q1–3, J-Q8 ·
> Evidence: `research/31` (public), `research/37` (dogfood, §6 the live check), `research/66` (the release, the live
> run, Mem on a home without it), `research/134` (nmem 0.10.120), `research/137` (the 0.10.120 live run: the inbox's pages), `research/139` (the second 0.10.120 run: the guard, a mailbox Mem must sort out), `research/161` (nmem 0.10.121 and the read-only live read), `research/226` (nmem 0.10.123 and the plugins of 2026-11-24, D555), private `31` and `10`.
>
> Nowledge Bridge is Mem's agent mailbox. This note describes how Ducter uses it. All of it is in `main`:
> receive, ask and reply, the linked result reply (J2, D107), outbound messages through a card (J4, D105), the
> outgoing ledger and recovery (D106) and follow-through (S3, D110). It is proven with real models over a fake
> Bridge (research/37 §3, §3.2) and, since 2026-11-25, live end to end (D557, below). **It is on by default
> (D557, applying D170 (9))**: wherever the home's Mem is ready (nmem 0.10.118+, signed in, one personal place) and
> the home is the person's own (D340), it connects by itself for someone who runs agents of their own (D332), and
> the partner's Bridge follows that connection with no flag. The one switch in Settings › 和你的其他 agent 通信
> turns it off; `DUCTER_BRIDGE=0` turns it off for the whole home; `DUCTER_BRIDGE=1` with `DUCTER_BRIDGE_CONTEXT`
> pins a context made by hand (tests, the fake). The 2026-11-12 503 at
> Connect is gone: on 2026-11-13 (nmem 0.10.118, Mem Cloud) the live run passed S1 6/6, S3 3/3, X1 3/3 and S2 4/5
> (research/66 §7); the S2 miss is Mem's: `open` returns neither the sender nor `in_reply_to`, so an answer can't be
> tied to its question (asked of Nowledge as B17; D249 reads an unnamed sender as one of the person's own agents
> meanwhile). nmem 0.10.119 (2026-11-16) reports the custodian under `endpoint.address` (D258 reads it) and still
> lacks both fields; the trial reruns when a release carries them, as its own throwaway identity (D324). 2026-11-17 (D294, research/66 §8): Mem Cloud now runs the fix (#10278), but
> it is a representation the CLI asks for, and 0.10.119 predates it; Ducter already reads `sender`, `in_reply_to`
> and `mailbox_available`, and retries Mem's "can't right now" briefly, never as a second copy.
> **2026-11-18 (D364, research/134): nmem 0.10.120 (PyPI 2026-11-16) is the first CLI that asks for #10278's
> shape**, so the live rerun is no longer blocked on Mem; it is the author's step ("Try it live"). Ducter reads Mem's
> `in_reply_to: null` as "an original, not an answer" (D249's maybe-answered rule keeps only the old shape), and
> Settings › 和你的其他 agent 通信 offers Mem's update, by what it gives, on a connected home still before 0.10.120.
> Not in 0.10.120: one inbox across Spaces (#10402) and an inbox long-poll, so D334's per-Space contexts, D338's
> back-off and D335's cadence stay. Since D332 the person's own home connects by itself once Mem is ready.
> **2026-11-19 (D400, research/161): nmem 0.10.121 ships #10402 as the plain `bridge inbox`** (every authorized
> Space, each message's own Space, Mem's open/reply argv) and a real long-poll (`--watch`; `--wait` only 1–5 s).
> Ducter reads it once by the help's words, runs Mem's argv, watches, and clamps the wait; D334's per-Space
> contexts and D338's back-off remain for 0.10.120. One read-only live read: the mailbox D369 found stuck now
> answers, except its personal Space, still `cloud_mailbox_own_source_unreconciled`.
> **2026-11-25 (D557, research/226 §4): the live trial passed every check for the first time** (nmem 0.10.123,
> Mem Cloud, haiku both sides, the trial's own throwaway identity, removed after): S1 6/6, S2 5/5 with "the answer
> came back as a reply to ours" (B17 closed live), S3 3/3, X1 3/3, and "Mem marks an original as one". So Bridge
> is on by default (above); the real shapes replace the guesses (a sender's tool from `sender.host` alone, a
> message's time from `created_at_us`); and D249 (5)'s maybe-answered rule holds only for an nmem before 0.10.120,
> told by its version: on 0.10.120 or later every message is an original or an answer.

## Connecting the persona (D205)

Mem 0.10.118 (PR nowledge-co/mem#9996) lets the user's ordinary Mem login represent an existing identity it
holds, so the persona's context no longer needs a key or hand-made commands (D171's refusal).

- **Who and when.** The heavy multi-agent developer, in Settings › 和你的其他 agent 通信 (D332: shown to whoever runs agents of
  their own). D332: no tap; the person's own home connects by itself once Mem is ready; any other home waits for
  the switch (D340, "Simple, by who" below).
- **What Ducter finds by itself** (read-only): that the home's nmem has `bridge connections` (`--version`
  ≥ 0.10.118, else the subcommand's `--help`, cached per version); the one place with `kind: "personal"`
  ("Only me") among passive `bridge setup`'s candidates (no context, no Space, never `--enable`), by its exact
  id; the persona's identity (D141). None or two personal places: nothing is offered.
- **What connecting runs** (D332: by itself on the person's own home, D340; D205's tap retired): `nmem --json bridge connections connect --space-id <that id> --agent-id ducter --context
  id, where the connection is made; the persona's identity (D141). None or two personal places: nothing is
  offered. The home then reads every other Space the identity is in too (D334, below).
- **What one tap runs:** `nmem --json bridge connections connect --space-id <that id> --agent-id ducter --context
  ducter-on-<home>-<key tag>` (D324: the home's own label), then passive `nmem --json --agent-context <that label>
  bridge setup`; Bridge is on only when that says the
  same identity. The connection is kept in `<dataDir>/bridge-connection.json`; once per start, `bridge
  connections list` drops one revoked elsewhere. The switch off (D332) runs `bridge connections revoke <id>`.
- **Mem says no:** each registered code is one plain line with the step the user takes in Mem
  (`role_authority_missing`, `role_custody_birth_missing`, `role_lifetime_inactive`, `role_attachment_mismatch`,
  and `role_control_denied`, `connection_revoked`, `binding_conflict`), plus 再试一次. Nothing else is tried: no
  other identity, place, key, `select-cloud` or `--enable`.
- **One level (D332):** the switch. Off revokes: no checks, nothing sent, the tools gone. D170's three-way reach is
  retired: the partner has only the Only me mailbox, so "teammates' too" did nothing and "nobody" was off.
- **No restart:** the partner's Bridge tools are listed only while it is on, and a change starts a fresh partner
  session at the next turn.

### The home's own Mem first (D225)

D257 moved these steps to Settings › 记忆 / Memory's **Nowledge Mem** card (and Mem's newer version to its own
highlighted card there); D332: 和你的其他 agent 通信 walks the same install and sign-in steps in place, then connects by itself. The steps themselves, one tap each:

| The home | The row | The tap runs |
|---|---|---|
| no `nmem` | **装上 / Install** (free, Mem's own route) | the first route here (D229): `pipx install nmem-cli`, `uv tool install nmem-cli`, pipx from the system first when that needs no password (`brew install pipx`; `apt-get`/`dnf install -y pipx` as root or with `sudo -n`), then `python3 -m pip install --user nmem-cli` only under an unmarked Python; never past the system's PEP 668 mark |
| no `nmem`, none of those | the line says a small tool is missing and this computer won't let Ducter add it; the one line to copy is for the home's own system (D432, D445: `brew`, `apt`, `dnf`, `pacman` or `zypper`); **再试一次** | the same check again |
| `nmem` older than 0.10.118 | **更新 / Update**, with the version | the same source it came from: pipx, uv, or pip (a venv's own python; the user's site under an unmarked Python). A pip copy past the mark (hel) is **moved** instead (below) |
| a pip copy in the user's site under a marked Python, working (D229) | a quiet line under the row: **{home} 上的 Nowledge Mem 可以换成它官方推荐的装法…登录不变，记忆不动。**, **细节**, **换一下 / Move it** | pipx got first if needed; the old copy out (`pip uninstall`, past the mark); `pipx install --force nmem-cli` in; on failure the old copy back (**原来那份还在…**). `~/.nowledge-mem` untouched |
| Mem says a newer `nmem` is out (`status.update`) | a quiet **更新 / Update** under the row | the copy's own source |
| the app's copy, too old | the line: update the Nowledge Mem app | nothing |
| not signed in | a link field, **登录 / Sign in** | `nmem connect --skip-tools <link>` (sign-in only); the link is never logged or kept |
| Mem answers from the computer itself (the app, a Vault) | asked like the cloud's (D269): its one place is used; only when it offers none, one line: update Mem or sign in to a cloud workspace | passive `bridge setup` |
| ready | D205's **连接 / Connect** | D205's connect |

Afterwards the new `nmem`'s folder joins Ducter's PATH and `NMEM_CLI_PATH`, and after a sign-in the persona's
identity is bound as on a start (D141): no restart. Mem's registered codes are all plain lines; `unavailable`,
`busy` and `capacity` say Mem's side can't take it yet and nothing is wrong on the user's side; `outcome_unknown`
says Try again finds out. Nothing is retried by itself. Checked on a scratch Ubuntu 26.04 home: a fresh install
with pipx, hel's pip copy updated past the mark, a used link refused (research/66 §4). D229 (research/69): pipx
first, the move, password-free system pipx, and a short warm line in the done colour after each install, update or
move (**{home} 上换好了。登录还在，什么都没丢。**); a failure keeps the installer's words behind **细节 / Details**.

On hel (nmem 0.10.116 by pip, signed in): Settings › 记忆 › **更新**; the home then connects by itself (D332).

### One home answers (D324)

A partner's mailbox has exactly one reader, so a partner has exactly one home answering it. The address is
**who** (the partner's Mem identity, D141: `ducter`, or D312's `ducter-<id>`); the connection is **where** (the
home it lives on). Two readers split the mail: whichever checks first takes a message, so a request can land on
a computer nobody looks at, and Mem's list can't say which is which (both were labelled `ducter`, research/66 §9).

- **Who meets it.** The heavy developer with a server home (hel) and a Mac, or someone who reinstalled on a new
  computer. *Before:* a request from their terminal agent sometimes never shows up, with nothing to say why.
  *After:* one calm line that says where the partner answers, and one tap to change it. 放心: they see which
  computer has it. The consumer and the fresh user have one home and never see it.
- **The label.** A home connects with the context `<identity>-on-<home>-<key tag>` (the home's name as a slug, six
  hex of its D293 key), so Mem's own list says which computer holds each connection; `-2`… after a revoked one.
  One made before D324 keeps its name and keeps working.
- **Only a home is a receiver (D494).** A connection counts as another home only when its label is a home's
  (`<identity>-on-<home>-…`, or the bare identity a home used before D324). A task runs as the partner's
  identity, so its agent's own Bridge session shows in Mem's list too (hel, 2026-11-23: Codex's, labelled
  `codex`): it is never said as another computer and never offered for 只留这台; tasks don't make one any
  more (below, "Tasks Ducter carries messages for").
- **A second home** reads Mem's list at every look (read-only) and never connects beside another home on its own:

| The home | The row (Settings › 和你的其他 agent 通信) | The tap runs |
|---|---|---|
| another home holds it | **{name} 现在在 {home} 上收你别的 AI 发来的消息，这台不用再收。** · **改由这台收**, asking in place: **改由这台收？{home} 上就不再收了，{name} 只在这台上收你别的 AI 发来的消息。** | connect here, then `bridge connections revoke` the other's |
| connected here and elsewhere (from before D324) | under the head: **{name} 也在 {home} 上收** (an old label: **另一台电脑**) · **两台都在收，你别的 AI 发来的消息会被先查收的那台拿走，可能落到你不看的那边。只留一台就好。** · **只留这台**, asking in place | revoke the other's |
| Mem won't end that one from here (another login's) | the same row: **{home} 上的连接只能在那台上断开：在那台的 Ducter 里打开 设置 › 和你的其他 agent 通信，把开关关掉。**, no button | nothing |

- **The other home notices** at its next look or its 30-minute recheck (`connections list`, read-only), drops its
  record, and stops checking.
- **A client never connects.** The Mac app or the phone showing a server home shows that home's row; Bridge belongs
  to the home's core.
- **Not chosen:** a Mem identity per home (`ducter-hel`). It needs no coordination but splits who the partner is
  (memory, provenance) and gives a terminal agent two Ducters to choose between. Two homes that each want their
  own address are two partners (D312).

### The partner's side: its own tools, 查看来信, and the card (D333)

On hel (2026-11-17) the author said "用 Bridge 查看来信，回复 Mem 协作 Codex 的联络测试。" and the partner
answered that permissions blocked it: its Codex session still had the Mem plugin's own Bridge tools,
tried them, and the read-only sandbox declined each call; the Codex's message meanwhile had gone to a
`ducter` mailbox nobody reads (research/121).

- **Only Ducter's four tools.** `bridge_check`, `bridge_contacts`, `bridge_send`, `bridge_reply` are the
  partner's whole way to other agents; the persona says so. No partner session loads the person's MCP
  servers: Claude Code by `--strict-mcp-config`, pi by `--no-extensions`, DeepSeek Harness by a home of
  Ducter's, Codex by its clean args plus Codex's own `mcp list --json` under them (once per setup; any
  server still on, other than Ducter's, is turned off by name). Tasks keep the person's plugin (D168):
  there its Bridge tools speak as that session, not as the partner's mailbox.
- **查看来信 / check messages.** Messages still arrive by themselves. Asked to look, the partner calls
  `bridge_check`: the home reads its mailbox now and the partner answers what came in that same turn
  (every rule of the way in still applies; work a message asks for still waits for the person's go).
  Nothing new: one line; if the person says their agent sent one, it didn't reach this {name}: have it
  look {name} up again and send again in a Space the card names (D338; D334 said every Space is read,
  D333 "another {name} nobody reads"). Never "blocked", never "permission".
- **The card says where, and only what is true (D338).** After a confirmed connect and at the recheck
  whenever the Spaces read change, an identity Ducter enrolled gets its Mem profile description kept as
  "Ducter, a personal AI partner. … It reads messages sent to it only in the Spaces "Only me" and
  "dev team", on its home computer {home}, and replies in the Space the message came from. A message
  sent to it in any other Space is not read yet: send to it in one of those." (the labels of the Spaces
  the home reads now). Only once Mem reads every Space with one inbox (`wide`, #10402) does it say "in
  every Space it is in" (D334's words, which on hel's nmem 0.10.120 sent a Codex to a Space nobody
  reads). Only over Ducter's own words (or none); never on an identity the person brought.

### Every Space the identity is in (D334)

On hel (2026-11-17) the author's Codex sent to `ducter` from the team Space `Everyone`; Mem delivered it
and nobody read it. The identity is a contact in all 8 of the author's Spaces, but a Mem context is
(identity, one exact Space) and `bridge inbox` reads only its context's Space. **The address is the
identity, not the Space.** Asked of Mem as nowledge-co/mem#10402 (one inbox per identity, one contact
per identity, reply in the message's Space, a device label on connections, an outcome contract);
until it ships, Ducter handles it.

- **Who meets it.** The heavy developer whose agents sit in team Spaces, and their teammates' agents.
  *Before:* a message from a team Space vanished, and the card sent the sender elsewhere. *After:* the
  partner hears it wherever it was sent and answers there. The consumer and the fresh user have one
  Space and see nothing.
- **Reading every Space.** Beside the connection's own context, one local context per other Space the
  identity is in: `agents context select --name <the D324 label>-in-<space slug> --agent-id <identity>
  --space-id <id>` (a local selection; Mem checks it on use). Which Spaces: those whose `bridge contacts
  --all-spaces --query <identity>` cards name the identity; when that tells none, every Space passive
  `bridge setup` lists. Found at connect and at the 30-minute recheck: a new Space added, a gone one
  dropped, a known one never selected again. Each check reads every context's inbox; one Space not
  answering doesn't hide the others.
- **A Space Mem refuses** (`select` says no): kept as `unread` (its label, Mem's code when it gives one,
  and the HTTP status: D338) on Settings' view, one quiet problem row (D332's pane; words owed in
  `todo.md`). Nothing else is tried: no connect, enrol or `--enable`, and no `bridge connections connect
  --space-id` per Space (D338: not until Mem answers #10402). Settings otherwise never shows Spaces.
  **A 404** (nmem 0.10.120 on hel, VERIFIED 2026-11-17: every non-personal Space, an unverifiable body,
  no code; the identity is a contact there but can't be selected) is asked again once a day, and at once
  when nmem's version changes; the entry keeps when and with which nmem.
- **One switch to Mem's fix (D400).** #10402 shipped in nmem 0.10.121 as the plain `bridge inbox` ("List
  incoming identity mail across currently authorized Spaces", with `--watch`, without `--all-spaces`,
  research/161). Those words in `bridge inbox --help` (or `--watch`), or an earlier preview's `--all-spaces`,
  mean `wide`: the connection's context alone reads every Space (the plain `inbox` there, `inbox
  --all-spaces` only where the help offers it), each message's Space is its own (`space_id`; its label and
  kind from passive `bridge setup`, once), and the per-Space contexts go unused. The partner's client also
  goes wide by the help alone, so a connection saved before the update never reads the same mail once per
  Space. The client is one code path: its places and `wide`.
- **Mem's own argv (D400).** An identity-inbox entry carries `open_args` and `reply_args_prefix`, both ending
  in its `bm1:` reference (VERIFIED live 2026-11-19); the open and the reply run them as given (only a `bridge
  open` / `bridge reply` command, global flags alone before `bridge`; the body still by `--body-file -`), so
  the reply keeps the original's Context and Space. An entry with `eligible: false` (an expired one) is never
  opened. A Space the read reports `unavailable` with D369's code keeps D369's line while the others are read.
  "Select your approved Agent Context…" (plain text) is `not_configured`; a stale identity cursor restarts the
  read from page one, once. Contacts take the grouped default (one card per identity) first, `--all-spaces`
  after.
- **Replies and sends.** Each message keeps its Space (`space`, `spaceLabel` in the Log); a reply, an
  open, an inspect or a resume runs with that Space's context, so the answer goes back where it was
  asked. The partner's own send: contacts are looked up in every Space and folded into one card per
  agent, sent in the Space it last wrote from; else its only card, or the one in the person's own place;
  else the Space with the most Bridge traffic in the Log, always among its cards in Spaces the home reads
  when it has one there (D338). A card only in a Space the home can't read is marked `answerMayNotReach`,
  and the partner says in one short line that its answer may not reach it. The person is never asked
  which Space.
- **A teammate's agent, the first time.** A sender that isn't one of the person's own (a shared Space;
  an unnamed sender there counts as one until Mem names senders) is held, and its first message is one
  card with no partner turn:

  | | zh | en |
  |---|---|---|
  | The card | **{team} 里{who}想找{name}：「{its first line}」** ({who}: **{member} 的 {agent}**, **{agent}**, or **有个 AI agent**) | **{who} in {team} wants to reach {name}: "{its first line}"** (**{member}'s {agent}**, **{agent}**, or **An AI agent**) |
  | Go | **答应** | **Let it** |
  | Hold (the default) | **不理** | **Ignore** |

  Remembered per sender (Ducter's name for it, "reviewer (dev team)", in `peers.allowed` or
  `peers.muted`): 答应 reads what it sent meanwhile and lets it through as questions under X3's
  teammate rules (no work, answers only from what that Space shares, its reply back there); 不理 mutes
  it (恢复 in Settings, or "听 X 的"). No reach setting comes back: D332's one switch turns it all off.

## Simple, by who (D332, 2026-11-17)

The author on 0.0.67: the page "连上的 AI agent" baffled anyone who doesn't know Nowledge Mem, and then: review every
Bridge assumption and setting; make it smooth and reasonable; no needless options or behaviour.

- **Who.** Only the person who runs AI agents of their own (Claude Code, Codex, pi: in a terminal, a desktop app or an
  editor). Core reads their records' file times
  (D327's rule: nothing inside, the last 14 days; `ownAgents` on the settings frame), or Mem's plugin in one of
  their agents. They see **和你的其他 agent 通信 / Talk with your other agents** in Settings; everyone else sees one quiet line at the
  end of the Partner page that opens it. The name is the author's (research/120): "终端里的 AI", the rater test's
  winner, was wrong, since these agents also live in desktop apps and editors; "你的" answers the raters' main
  misreading (other people's AI), and "连上的 AI agent" read as the partner's own brains next to Partner's line.
- **What the pane says (D350).** The lede names the thing: any agent of the person's connected to Nowledge Mem (Claude
  Code, Codex, Grok Build: the plugins that carry Bridge, research/66 §10) messages the partner through Nowledge Bridge,
  both ways; the switch is **让接上 Nowledge Mem 的 agent 能找到{name}**. A sender is named by its Mem agent name, else
  the tool it runs in (`bridge_msg.host`, when Mem says), else **一个没留名字的 agent**, with a drawn agent for its tile.
- **Connect without a tap, on the person's own home only** (`packages/core/src/bridge-auto.ts`, D340). Mem signed
  in with exactly one personal place (bridge-link's `ready`), the switch on, agents of their own: the home connects
  at start, or as soon as Mem gets there; opening the page while ready is the same ask. **The person's own home**
  (`connectsByItself`) is the one that keeps its data in the default folder `~/.ducter` (`ducter up` with no
  `--data-dir`, the Mac app's own home), or the one `ducter service install` runs (its unit names the folder in
  `DUCTER_SERVICE_DATA_DIR`). **Any other home** (`--data-dir`, `DUCTER_DATA_DIR` pointing elsewhere, a demo, a test,
  an e2e run, a second instance on the same computer) never connects by itself, not at start and not when the
  page opens: while Mem is ready there its view says `asks`, the switch shows off, and flipping it on (or
  **改由这台收 / Receive here instead** when another home holds it) is the ask. research/124 F2: a scratch home took
  the person's connection 15 s after start when Mem listed none. Then the partner says once in the conversation that the
  person's own agents can reach it now, and where to turn it off (`<dataDir>/bridge-said`). A connection from
  before D332 says nothing. Failures stay quiet; the pane shows one row with the step.
- **One switch**, on by default: off revokes and nothing connects again by itself; on connects. A stored `team`
  reach reads as on. A teammate's agent is asked about per sender the first time, once a team mailbox exists
  (`todo.md`).
- **Never shown:** identity, place, the connection's label, raw ids, 断开 as its own action. **Only problems show**,
  each one row with its one fix (two readers → 只留这台; another home → 改由这台收; Mem's refusal → its step).
- **The pane.** On (order D459): the switch as the first group's head row (**你的 agent 能找到{name}**, **这周来往了 3 次**,
  where it shows up as the group's last line), 能找到{name}的 (D433), 最近 / Recently (both ways, five, each opening its
  task or message; before the first, a calm waiting row), 试试看 (two example exchanges as a tiny conversation, one
  each way, a copy button on each sentence). Before Mem: the literal picture (the person's agents' coins, the partner, two
  arrows said in words; no metaphor, D321 (6)), one sentence of what Nowledge Mem is, its two steps in place. Off:
  the picture and the switch. X2's 直接接 and the daily quota are not settings; only **已不再听 X · 恢复** rows.
- **Not changed:** the partner's tools (D333's own branch), the conversation's lines and cards, D324's one-home rule. The
  card's Space line (D333) is for other agents to read, never on the pane; D338 keeps it naming only the Spaces read.

## Chosen scenarios (dogfood, 2026-11-09)

From 14 scored candidates (research/37 §2), four are chosen. The J-numbered details below still hold:
- **S1 = J1 + J2, "Ducter, take this one".** The result goes back by code. Proven live on Ducter's side.
- **S2 = J4, "ask the one who knows".** The user names an agent, the partner shows a card, Ducter sends on Go and
  reports the answer. Proven live on Ducter's side.
- **S3 · Follow-through on silence** (below, D110). Built; proven over the fake Bridge.
- **S7 · Across machines.** This is S1 from a laptop session to the persona's always-on home. Nothing new to
  build; it needs one live check.

Parked on 2026-11-09: J3 (teammates) until Team Bridge opens, J5 (consumer AIs) until remote-MCP delegation
ships. Re-scored on 2026-11-10 in "Beyond itself" below (draft D163): J3 becomes X3, with trust per sender; J5
stays parked as X5.

### S2 · "问问我终端里那个 Claude": the partner asks an agent Ducter didn't start

- **Who.** The heavy multi-agent developer, away from the terminal (on the phone, or in Ducter's conversation),
  who needs something only a running session knows: "bridge 那块写到哪了，今晚能提 PR 吗？".
- **Feel.**
  - *Before:* walk back to the terminal, or wait and forget.
  - *After:* one sentence to the partner, one tap, and the answer arrives in the conversation in the partner's
    words.
  - *Value:* 惊喜 the first time (it can reach my other agents?), then 好用. 放心 because the card names exactly
    who gets what before anything leaves.
- **How it starts.**
  - The user just asks, naming the agent in plain words.
  - The partner finds it and shows one card: "发给你的 terminal-claude？「…」" with the button 发送 (a teammate's
    agent: "发给 reviewer · dev team？", D162). The default is to wait, and the card can't be undone.
  - On 发送, the quiet line "已发给 terminal-claude" appears.
  - The answer comes back at the other session's next turn boundary. Ducter picks it up at its next check, and
    the partner tells the user in one or two lines.
  - Zero setup on Ducter's side beyond the approved context (J-Q1).
- **Rules.**
  - Only the user starts a new conversation: `bridge_send` is refused in a turn woken by a peer.
  - Only a recipient that discovery returned can be chosen, never a typed or guessed one.
  - Ducter, not the model, sends after the Go, exactly once, even across a restart or a lost answer (D106).
  - The message carries what the user asked plus the background the recipient needs, in plain sentences:
    numbered or bulleted sub-questions are refused in code (D109). Never paths or private details the user didn't
    ask to share.

### S3 · Follow-through on silence (D110)

- **Who.** The same developer, two hours after S2's message, still unanswered, because the terminal session
  stopped.
- **Feel.**
  - *Before:* they'd have to remember they asked.
  - *After:* one line, once, when they're back: "你的 terminal-claude 还没回你 2 小时前问的「昨晚 CI 那个红是不是
    flaky？」，它可能停了。回了我马上告诉你。".
  - *Value:* 放心: someone holds the thread, and it doesn't nag.
- **Rules (built).**
  - Only messages the user confirmed on a card; at most one line each, never earlier than 2 h after it went out,
    nothing after 7 days. One line covers every unanswered message to the same agent (D412): "…还没回你 2 小时前
    问的「昨晚 CI 那个红是不是 flaky？」和「bridge 那块写到哪了？」…", newest first; another agent gets its own line
    on a later turn.
  - Only while the user is around (they did something in the last 15 minutes), never in quiet hours, one line
    per moment.
  - Said by code before the partner answers the user's message; the partner's input carries it, so it isn't
    said twice.
  - Read and unread are separate facts: when the inbox reports ours as read, the line says "看过你…，还没回".
  - Bridge never wakes the other side, so the line never says it "reminded" anyone; it reports the silence, and
    the answer is reported when it comes (S2's path). No question: nothing for the user to decide.
- **Not built:** a time the user named ("今晚前告诉我"); `wait_until` already covers that.

## Beyond itself: what Bridge makes possible (D163–D164 decided 2026-11-10; built as D170)

> The author approved every proposed default ("go go go"). X1 and X2 are built on the partner, core, the Mac and
> the phone, and X3's Settings switch is built (D170); since the live trial passed (D557, 2026-11-25) it is on
> wherever Bridge is. "As built" and "The author's day" below say what the user sees and why X1 comes first.

**The idea in one line.** Ducter stops being only the place where the user talks to *its* agents. It becomes the
one place where **all** of the user's AI tools reach the user: they hand it work, they ask it for the user's call,
and it asks them. The partner stays the single attention point (principle 7): one conversation, one 等你 / Needs
you lane, silence when nothing matters. Nothing leaves without the user's Go, and each sender gets exactly the
trust the user gave it.

### What changed (evidence)

- The Cloud backend answers in every Space, and real cards come back, including another member's agents in team
  Spaces (research/37 §6, VERIFIED). Team Bridge is therefore *reachable*; its runtime acceptance on Mem's side is
  still pending (private/31, DOCUMENTED).
- The persona's identity exists; its mailbox does not yet (VERIFIED). It is one context and one `--enable` away,
  both the author's.
- Cards carry no member name (B11, VERIFIED): a teammate's agent can be shown only by its own name.
- Consumer AIs: remote-MCP delegated communication (#8956) has its foundation merged and its proposal approved,
  but it is not shipped (DOCUMENTED, Mem memory 2026-10-30). The account also holds Mem's hosted chat adapters (a
  Feishu/Slack bot) as Agent identities (VERIFIED, `agents list`); whether they can send to a persona's mailbox
  is unknown (INFERRED).

### Candidates, re-scored

Scores as in research/37 §2 (1–5; **V** value · **E** D36 emotional value · **T** trust and safety, 5 safest ·
**B** feasibility with Bridge as of today · **M** fit with one partner and attention only when it matters).
Users: **D** heavy multi-agent developer · **C** consumer personal-AI user · **F** fresh user.

| # | Scenario | Who | V | E | T | B | M | Σ |
|---|---|---|---|---|---|---|---|---|
| **X1** | **"有事问 Ducter": your other agents' questions for you come through the partner.** A terminal Claude Code or Codex that needs the user's call while they're away sends it to the partner; it lands as one decision card in the conversation and in 等你 / Needs you, and the user's answer goes back by code | D | 5 | 5 | 4 | 3 | 5 | **22** |
| **X2** | **"直接接": a standing go per sender.** After the user has said 好 twice to work from the same own agent, the partner offers once to take that agent's requests without asking, within limits (S1 with a learned rule, J-Q2) | D | 4 | 4 | 4 | 4 | 5 | **21** |
| **X3** | **A teammate's agent asks your partner (J3), with trust per sender.** Opt in per team; the partner answers only what is already shared there or what the user approves; a teammate can never open a task, and each sender has a daily quota | D | 5 | 4 | 3 | 3 | 4 | **19** |
| X4 | The partner suggests whom to ask ("这个你的 Codex 知道，问它？"): S2 without the user naming the agent | D | 3 | 4 | 4 | 4 | 3 | 18 |
| X5 | A consumer AI hands a request to the persona (J5): "让 Ducter 帮我订会议室" from Grok Bot or Muse | C | 4 | 5 | 3 | 1 | 4 | 17 |
| X6 | A chat app reaches the persona through Mem's hosted chat adapters (Slack/Feishu) | C, D | 4 | 4 | 3 | 2 | 3 | 16 |
| X7 | Hand work to the session that already has the context, as the task's body (S5) | D | 4 | 4 | 3 | 3 | 3 | 17 |
| X8 | A teammate's Ducter asks yours (S8): two always-on partners | D | 4 | 4 | 2 | 2 | 4 | 16 |
| X9 | Your other agents' "done" notes held quietly, mentioned only when asked | D | 3 | 3 | 4 | 3 | 3 | 16 |
| X10 | Fresh user's first meeting through a friend's agent (J6) | F | 2 | 4 | 4 | 3 | 5 | 18 |

Why the others wait:
- **X5, X6** are the consumer user's doorway and the most 惊喜, but nothing a consumer AI can use is shipped
  (#8956). They stay parked with a concrete trigger (todo). When it ships they take X1–X3's rules unchanged: a
  consumer AI is a sender like any other, with the trust its user gave it.
- **X4** risks the partner inventing errands: one more card the user didn't ask for. Revisit after X1 shows how
  often the user's other agents actually answer.
- **X7** puts an agent Ducter can't see inside a task's body; principle 14 and the Log want a body Ducter runs.
- **X8** needs X3 first, and two always-on partners trusting each other is the weakest trust story.
- **X9** turns the partner into a second inbox (research/37's S12); silence means success.
- **X10** stays J6: invisible until a second agent exists.

### X1 · "有事问 Ducter": your other agents ask *you* through the partner (top scenario)

- **Who.** The heavy multi-agent developer with four sessions open in a terminal. They leave for lunch. Today each
  session that needs a call (push now or wait for CI? keep the old API name?) stops at its prompt, and they find
  it an hour later.
- **Feel.**
  - *Before:* tethered to the terminal, or guilty about the stalled work.
  - *After:* the question finds them on the phone, in the conversation they already use, with the session's own
    suggestion. One tap, and the session goes on.
  - *Value:* 放心 (nothing waits on me without my knowing), 顺滑 (one place for every ask), 惊喜 the first time:
    "my terminal can reach me through Ducter".
- **How it starts (zero setup on Ducter's side).** The user says to the terminal session, in their own words:
  "我出门了，要我定的事发给 Ducter". The Mem plugin's bridge skill finds the persona in contacts (once the
  persona's mailbox is on) and sends the question with its background, its options and its suggestion. Nothing to
  learn in Ducter: the question simply arrives as a card from 你的 terminal-claude.
- **The consumer user** gets this the day a consumer AI can send (X5); the fresh user never sees it (J6).

**What the user sees.**
- *The conversation:* one quiet line, then the card, carrying the asking agent's coin (D146; a plain coin when
  the kind is unknown):
  - **你的 terminal-claude 问你 · <gist> / Your terminal-claude asks · <gist>**;
  - the question in the partner's words and the user's language, the options as buttons (at most three), plus
    **回复… / Reply…**;
  - the default caption **没回就让它先等着 / If you don't answer, it keeps waiting** (the safe default, below);
  - the asker's own suggestion marked **它建议 / It suggests** on that option, never pre-selected.
- *On hand:* the same card in **等你 / Needs you**, with the coin and **你的 terminal-claude · <where it works>**
  where a task card has its short title (the place comes from the agent's own description, when it gives one).
- *After the tap:* the quiet line **已回复 你的 terminal-claude / Replied to your terminal-claude** (J-Q5's string).
  The card leaves Needs you. Nothing else is said: silence means success.
- *Phone notification:* only as any decision would be, never in quiet hours (D3, D71).

**Mechanism over Bridge.**
- In: the same path as S1 (`inbox` → `open` → `bridge_msg{in}` origin `peer`).
- The partner judges it a question for the user, not a job, and calls `ask` with `forMessage: <id>` and the
  asker's options. The card remembers the message, as J2's cards already do.
- On the user's answer, **Ducter's code** replies to that message, never the model: the chosen option's words, or
  what the user typed, in a fixed frame in the asker's language: **"The user chose: «…»" / "用户选了：「…」"**.
  Logged as `bridge_msg{out, inReplyTo, decisionId}`; D106's ledger and recovery apply unchanged.
- The asker sees it at its next turn boundary. A session that stopped to wait isn't woken by Bridge; the skill
  lets it wait on a finite budget when the user asked it to, and "要我定的事发给 Ducter" is that ask (VERIFIED in
  the 2026-11-25 live trial, D557: the terminal waited and opened the answer).
- **Faster checks while a conversation is live** (amends J-Q3; D335): every 15 s instead of every minute for 30
  minutes after any message from or to one of the user's own agents, then back to every minute. One `inbox` call
  each; there is no push yet (B10). The cadence as a whole is in Flow, below.

**Safety.**
- *Who may ask:* in v1, only the user's own agents (same member, D108). A teammate's question goes through X3.
- *The default is always "wait".* When the decision's timer runs out, Ducter replies
  **"No answer from the user yet. Don't act on this; ask again later." / "用户还没回，先别按这个动，晚点再问。"**
  The asker's suggestion is shown, never taken on silence: a peer must not be able to decide what the user's
  silence means.
- *What crosses:* only the user's chosen option or typed words. Never the Log, other tasks, memories or files; the
  reply is redacted like every other.
- *Volume:* at most three open asks per sender in Needs you; a fourth folds into the third's card as
  **还有 <n> 个 / <n> more**. Every sender has the daily quota in the table below.
- *Not a work request:* a message that asks for work is S1 (a Go/Hold card that opens a task), never X1.

### X2 · "直接接": a standing go for one of your own agents

- **Who / feel.** The same developer, on the third "开个任务修 …？" from their terminal session this week.
  *Before:* the card feels like friction. *After:* the partner offers once to stop asking, and from then on the
  work just starts and the result comes back. 好用, and 放心 because the rule is visible and one tap undoes it.
- **How it starts.** After the user said 好 to requests from the same own agent twice within 14 days, the partner
  asks once, beside the next such request:
  **以后你的 terminal-claude 发来的活，直接接？ / Take work from your terminal-claude without asking from now on?**
  · **直接接 / Take it directly** · **仍然先问你 / Keep asking you** (default). Declined: never offered again for
  that agent.
- **The rule** shows where D161's learned rules are (Settings › 伙伴): **你的 terminal-claude 发来的活直接接 · 你接过两次以后定的
  / Work from your terminal-claude starts without asking · set after you took it twice**, with **改回先问我 / Stop**.
- **Limits, in code:** the user's own agents only, never a teammate's; tasks in folders and on computers the user
  already uses (a new repo, a push to main or a message out still asks, as any task would, principle 18); at most
  5 a day per agent, then it asks again. The claim and the result go back exactly as in J2.
- **What the user sees:** no card. The task appears in 在做 / Working like any task, and its brief says who asked:
  **你的 terminal-claude 让我做的 / Your terminal-claude asked for this**.

### X3 · A teammate's agent asks your partner, with trust per sender (J3, re-scored)

- **Who / feel.** A teammate's reviewer agent needs "Weyl's call on the API rename". *Before:* a Slack ping that
  breaks focus. *After:* the partner answers what is already shared, and brings the user only the decision.
- **How it starts (D332).** Not a setting: once the partner has a team mailbox, the first message from a teammate's
  agent asks the person once, per sender (`todo.md`). D170's 也包括同事的 is retired: the persona has only the Only me
  mailbox (D171), so it did nothing.
- **How it starts (D334).** Per sender, never a setting: the home reads every Space the identity is in, and a
  teammate's agent's first message is held as one card, **{team} 里{who}想找{name}：「…」 · 答应 / 不理**
  (default 不理). 答应 lets that sender's messages through under the rules below; 不理 mutes it. (D170's three-way
  **谁能找到 {name}** and its drafted per-team switch are gone: D332, D334.)
- **Trust, per sender, in code:**
  - a teammate's agent may ask questions. It can't open a task (a work request becomes a question to the user with
    the default **暂不接下 / Not now**), can't make the partner contact anyone (S2's rule), and gets D107's fixed
    outcome lines;
  - the partner answers only from what that Space already shares (Mem search scoped to it) or with the user's
    approved words; anything else is a decision card first (J3's v1 rule);
  - the daily quota below, then messages are held without waking the partner, with one line
    **<agent> 今天又发来 <n> 条，我先放着了 / <agent> sent <n> more today; I've set them aside**;
  - **不再听 <agent> 的 / Stop listening to <agent>**, said to the partner: that sender's messages are logged and
    never wake the partner from then on (listed, with **恢复 / Undo**, in Settings › 伙伴). A button on its
    cards is in `todo.md`.
- **Names.** Cards carry no member name (B11): a teammate's agent shows as **<agent> · <team>**
  (**reviewer · dev team**) until Mem returns names, never as an id (D162).

### Who may wake the partner (every sender)

| Sender | Wakes a turn | May open work | When the user is silent | Quota |
|---|---|---|---|---|
| The user's own agent | yes | after Go, or by X2's rule | it waits; a question gets "don't act yet" | 20 messages a day, 3 open asks |
| A teammate's agent (D332: asked per sender, once a team mailbox exists) | yes, within quota | never | not now | 20 messages a day, 3 open asks |
| A teammate's agent (Settings: 只有你自己的, the default) | no; logged, never read again | never | | |
| Anyone else | can't: the persona has no mailbox outside the Spaces the user approved | | | |
| A teammate's agent the person said 答应 to (D334) | yes, within quota | never | not now | 20 messages a day, 3 open asks |
| A teammate's agent, the first time (D334) | no; held, one card 答应 / 不理 (default 不理) | never | held | |
| A teammate's agent the person said 不理 to | no; logged, never read again | never | | |
| Anyone else | can't: the persona is reachable only in the Spaces the person is in | | | |
| A sender the user stopped listening to | no; logged, never read again (the body is opened once by the check; a sender-only probe is B6) | | | |
| Settings: 谁都不行 | no check at all | | | |

Quota overflow never wakes the partner and never notifies: one quiet line a day per sender. An answer to a
message the user sent (S2) always comes through, whoever it is from.

### As built (D170): how it looks in Ducter

No new object, state or metaphor: the other agents appear as their AI coins (D146), as quiet lines, and as
decision cards; their rules live with the learned rules.

| Where | What the user sees |
|---|---|
| The conversation | a quiet line **terminal-claude 发来请求：「<gist>」** for work; for a question, the card itself: the coin and **你的 terminal-claude 问你 · ~/dev/ducter** above the partner's bubble, then **回复…** · its second option · its first (or suggested) option, **它建议「…」** and **没回就让它先等着。**; after the tap, **已回复 你的 terminal-claude** |
| On hand · 等你 | the same card beside Ducter's own tasks' asks, the coin and who where a task's title would be |
| Phone and lock screen | the same card; the notification is **小鸭 · 你的 terminal-claude 问你**, the question and the waiting line, no Go/Hold actions (its options are its own) |
| X2's offer | after two Go's: **以后你的 terminal-claude 发来的活，直接接？** · **直接接** · **还是先问我**; then its work shows up in 在做 / Working with no card, the brief starting **你的 terminal-claude 让我做的** |
| Settings › 和你的其他 agent 通信 (D332) | what came and went lately, 试试看, one switch; only an agent the person stopped listening to shows (**已不再听 X** · **恢复**). X2's rule is learned and changed by saying it, never a setting |
| Saying it | "不再听 X 的", "X 的活还是先问我" to the partner does the same (`peer_rule`) |
| Device islands | nothing: other agents aren't places, and a visitor on an island would be a new metaphor that tells nothing a coin doesn't |

**The first time, with zero setup in Ducter.** Once the persona's context exists (D171), the user tells any
terminal session "要我定的事发给 Ducter". The first question arrives as the card above; the Settings group appears
only then. Before that, nothing about other agents shows anywhere.

**Safety, in code** (tests in `packages/partner/test/bridge-out.test.ts`): nothing leaves without the user's tap
or a reply to a message already in the Log; a peer's turn can't send, ask a teammate's question as the user's, or
open a task unless X2's rule covers its sender; an outside question has no default and is answered "not yet" on
silence; 3 open asks and 20 messages a day per sender; what predates Bridge is never a request (B14).

### The author's day (research/37 §8)

Many long coding sessions run in parallel (Codex most of all), several are named coordinators, and the team talks
in Slack. The moments that need the author are the calls those sessions can't make alone, and they come daily.
That is X1, so X1 is the first live proof. Re-scored with this: **X6** (Mem's Slack adapter as a sender) rises to
B 3 (the adapter holds agent keys in seven Spaces; whether it can write to a persona is unknown), Σ 17: a probe
once the persona has a mailbox.

## The one idea

Inside Ducter, the Log and typed reports are the bus: a task never needs Bridge to reach the partner
(principles 1, 12). Bridge is the **doorway to agents Ducter didn't start**:
- the user's own Claude Code or Codex sessions in a terminal;
- a teammate's agents through Mem Team;
- later, consumer AIs such as Grok Bot or Muse.

The doorway's address is the **persona**, one Mem Agent Identity (D18), never a harness session. Partner
sessions are caches that get re-cut (principle 4); an address bound to one would go stale.

So Ducter uses the identity's **Agent mailbox** (`nmem bridge inbox/open/reply`) and not the native-session
mailbox (`nmem bridge session`). The persona already is what Bridge calls an Agent: a stable, attributed
collaborator with a Profile.

Ducter adds something no terminal session can: it is **always on**. It holds incoming requests until the user
has a moment, which is principle 7 applied to agents.

## Scenarios, ranked by value (user first)

Each scenario gives who is in the moment, how they feel before and after, how it starts, and how strong the
evidence is.

### J1 · "Ducter, take this one": the user's terminal session hands work to the partner

- **Who.** The heavy multi-agent developer, mid-flow in Claude Code. They spot a side job, such as "the Linux CI
  is red". They don't want to open another tab, write a brief, and babysit it.
- **Feel.**
  - *Before:* one more thread to hold in their head, or a tab they'll forget.
  - *After:* they said one line, and it now belongs to someone who reports back.
  - *Value:* 放心 (it is owned and visible), 顺滑 (no context switch).
- **How it starts.**
  - In the terminal the user says "让 Ducter 去把 Linux CI 修了". The Claude Code `bridge` skill finds the
    Ducter persona in `bridge contacts` and sends a self-contained request: goal, scope, done criteria. That is
    the skill's own rule.
  - On the phone or desktop, Ducter's conversation shows one quiet line, "terminal-claude 发来请求：「修 Linux
    CI」", and the partner asks one Go/Hold question: "开个任务修 Linux 上的测试（只动 runner 测试）？"
  - The user taps 好 and the task opens. The partner replies to the terminal session: "接了，结果回你".
  - When the task is done, the partner replies again with the outcome. The terminal session sees it at its next
    turn boundary (the plugin's Stop-hook notice).
- **Zero concepts.** The user never sees "Bridge", "mailbox", "contact" or "Space". They see who asked, and
  what.
- **Evidence.**
  - The CLI has every step: VERIFIED help.
  - Ducter's receive, approve and reply side is built and tested against a stub.
  - Unverified: the live round trip and the exact `inbox`/`open` JSON. The account's backend answers since
    2026-11-10 (research/37 §6).

### J2 · Ducter reports back to where the work came from

This is J1's second half, but it is worth naming because it closes the loop the user cares about.

- **Who.** The same developer, back in the terminal an hour later.
- **Feel.** The answer is waiting where they asked; nothing needs to be fetched. 惊喜.
- **How it starts.** Automatically: a task opened from a request ends, and the partner replies to that original
  request. The CLI's `reply` targets the original sender only.
- **Evidence.**
  - Built: `bridge_reply` exists, and the partner can use it.
  - Built on `bridge-spike` (D107): the task ↔ message link and a code fallback, so the reply is guaranteed
    rather than prompted.
  - The timing is honest only if copy never promises "they've seen it".

### J3 · A teammate's agent asks your partner (Mem Team)

> Re-scored on 2026-11-10 as X3 (draft D163, above): opt in per team, trust per sender, quotas. The text below is
> the 2026-11-09 reading, kept for its v1 rule.

- **Who.** The developer as a team member. A teammate's agent needs "Weyl's call on the API rename" or "is the
  HawDB bench done?".
- **Feel.**
  - *Before:* a Slack ping that breaks focus.
  - *After:* the partner answers what it can from the Log and asks the user only for the decision.
  - *Value:* the original intent, "needs your attention only when it truly matters".
- **How it starts.** The same way as J1, but the line names the teammate's agent and team ("reviewer · dev team
  发来请求"; cards carry no member name, D162).
- **Risk.** What the partner may tell a teammate.
  - v1 rule: the partner replies only with what the user approved, or with facts already shared in that Space.
  - Anything else goes into a decision card first.
- **Evidence.** Thin. Team Bridge is gated and its acceptance is pending (private/31). Nothing is built beyond
  J1's path, which would carry it unchanged.

### J4 · A Ducter task needs the judgment of a session that holds the context

- **Who.** A Ducter task working in `nowledge-mem` that needs the design intent only the user's long-running
  Codex session knows.
- **Feel.**
  - *Before:* the task guesses, or the user relays the question by hand.
  - *After:* the question goes to the session that knows; the user is asked once whether that's OK.
- **How it starts** (D448, built for a task on an agent with no Bridge of its own; "Tasks Ducter carries
  messages for" below):
  - The task calls `agent_message` {to, text}.
  - The user sees one card: "「修 Linux 上的 runner 测试」想发给你的 Codex：「…」" (发送, default hold).
  - On Go, Ducter sends it under the partner's identity with the task named; the answer goes back into the task.
  - A Claude Code or Codex task asks through its own Mem plugin (D333), as before.
- **Evidence.** A stopped session never wakes on send; the answer comes when that session next runs. The
  user-initiated case is built as S2 (D105).

### J5 · The persona reached from a consumer AI on the phone (Grok Bot, Muse)

> Still parked on 2026-11-10 (X5 above): #8956's foundation is merged, the delegation itself is not shipped.

- **Who.** The consumer personal-AI user.
- **Feel.** "My Ducter" is reachable from the AI they already talk to. 好用.
- **How it starts.** "让 Ducter 帮我订明天的会议室": the consumer AI sends to the persona's mailbox.
- **Evidence.** None usable yet. Mem's remote-MCP delegated communication is proposed, not shipped
  (private/31). Park it until then.

### J6 · The fresh user

- **Who.** Someone who has never heard of a subagent.
- **Feel.** Bridge is invisible to them, and it should stay that way.
- **How it starts.** It doesn't. Bridge is off until the user has a second agent somewhere: a terminal session,
  a teammate, a consumer AI.

  When that day comes, the first meeting is J1 seen from the receiving end:
  - one quiet line, "<X> 发来请求";
  - one Go/Hold question;
  - no setup screen in Ducter.

  Setup belongs to the other side, whose Mem plugin already owns it. Ducter's only setup is choosing which
  approved context the persona uses (open question J-Q1).

**Rejected: Ducter's own tasks talking through Bridge.** The Log is authoritative and typed reports already do
this (principle 12, private/10 §4). Routing through Bridge would add a second source of truth, network latency,
and a gated dependency. (This is tasks talking to each other. A task talking to an agent Ducter didn't start is
D448: through Ducter, below.)

## Objects and names

| Thing | Where | Notes |
|---|---|---|
| Persona's Agent mailbox | Mem | The address. One per persona identity and Space |
| Agent Context | user's nmem | Named selector of identity plus exact Space, created and approved by the user. Ducter knows only its name (`DUCTER_BRIDGE_CONTEXT`) |
| `bridge_msg` event | Log, channel | `{direction: in\|out, messageId, from?, to?, text, inReplyTo?, sentAt?}`. Origin `peer` for in, `partner` for out. D418: `selfNamed` + `role` (an own agent named by its own words), `first` (the first message that ever came), `route` (Mem's reply argv), `state: "ping"` / `ack` (a contact test answered by code), `retryOf` (a resend of an op Mem never took) |
| Origin `peer` | protocol | Another agent through Bridge. Never `user` |
| `bridge_reply` tool | partner MCP | Registered only when Bridge is on |
| `bridge_check` tool | partner MCP | D333: the home reads its mailbox now, on the user's ask; registered only when Bridge is on |
| `agent_message` tool | task MCP | D448: a task on an agent with no Bridge of its own messages another agent through Ducter; listed only for such a task while Bridge is on. Its ops are `bridge_msg{out, by: "task", taskId, head}`; an answer is `bridge_msg{in, state: "task", taskId}` |

User-facing copy: the decided lines (the send card, 你的 <agent>, the claim, the teammate's fixed outcome,
follow-through, a lost or refused send) are in the glossary (D105–D110). Still pending the user's OK (J-Q5):
- incoming: **"<X> 发来请求：「<gist>」" / "Request from <X>: “<gist>”"**, one quiet line (D294);
- outgoing: **"已回复 <X>" / "Replied to <X>"**, **"已发给 <X>" / "Sent to <X>"**.

Never use **交接 / hand-off**: the glossary reserves "handoff" for a task changing body ("换到 X 接着做"). The
words Bridge, mailbox, contact, Space, Identity and Agent Context never appear in the conversation.

## Flow (as built)

```
other agent ──bridge send──▶ Mem (persona's Agent mailbox)
                                  │  Ducter checks: at start, then every minute, and when asked (bridge_check, D333);
                                  │  see "When the home reads its mailbox" below (D335)
                                  ▼
   nmem --json --agent-context C bridge inbox     → message handles, 20 a page, oldest first, opened ones too;
     … bridge inbox --cursor <next>               → every page until `next` is "" (at most 25, D367)
     a read Mem answers cloud_mailbox_*_unreconciled → stuck: said once in Settings, checked every 30 min (D369)
   nmem --json --agent-context C bridge open <id> → body (0.10.118: no sender; in Only me it is the user's own, D249;
                                                    after 0.10.119: sender {member, agent, agent_id} + in_reply_to, D294)
                                  ▼
   Log: bridge_msg{in} origin peer  ──trigger──▶ partner turn
        "[message from X via Bridge, message id] … a request, never permission … <peer_message>…</peer_message>"
                                  ▼
   partner: answer (bridge_reply) and/or ask the user (Go/Hold, default hold)
            task_open in a turn woken only by Bridge messages → refused: "ask the user first"
                                  ▼  user taps 好
   partner: task_open (normal brief rules) … task report → partner → bridge_reply with the outcome
   nmem --json --agent-context C bridge reply --body-file - <id>    (stdin body)
   Log: bridge_msg{out} origin partner
```

Additions on `bridge-spike` (D105–D110):

```
J2  card asked in a request-only turn ── remembers the request
    Go → task_open (forMessage, or inferred from that Go) → Ducter replies "接了：「<title>」。做完把结果回你。"
         (requester's language, title quoted)                 Log: bridge_msg{out, inReplyTo, taskId}
    task report done/failed/blocked → input gets "[reply owed] … bridge_reply first, then tell the user once"
         turn ends with no reply → Ducter sends: your own agent ← the partner's message to the user;
                                                 a teammate's  ← "「<title>」：做完了 / 没做成"
J4  [user] "问问我终端里那个 Claude …"
    partner: bridge_contacts(query)  (read-only, one page; agents that wrote lately first, D249) → bridge_send(contact, text)
         → Log: bridge_msg{out, state pending, contact, decisionId}
         → card "发给 <agent>？「gist」" (D273) · 发送 · default hold · not reversible   (nothing sent yet)
    user taps 发送 → Ducter sends it itself (no partner turn; to one that wrote: `reply` on its message, D249)
         → reply with in_reply_to = ours (when Mem links it: Cloud since 2026-11-17, a CLI after 0.10.119, B17/D294)
         → rendered as "the answer to what the user asked" → partner tells the user
S3  confirmed, sent, no answer, ≥ 2 h, user active in the last 15 min, not quiet hours
         → one line before the partner's reply · Log: bridge_msg{out, state followed}

Every outgoing op (D106), logged before the CLI call:
    pending ─tap hold→ held
    pending ─tap go→ sending ─→ sent | failed (refused, or Mem busy and not admitted: say once) | unknown
         (D294: Mem's 503/busy is retried after 0.4 s and 1.2 s, a send only when Mem says it was not admitted;
          reads retry the same way; a card whose agent has no mailbox is never offered)
    unknown / sending left by a crash ─next check (and 30 s after)→ bridge outbox → inspect → resume (same op)
         → sent | failed | still unknown ×3 → unconfirmed (say once; never resent)
```

**When the home reads its mailbox (D335, D400).** Before nmem 0.10.121 `bridge inbox` was pull-only; 0.10.121
adds `inbox --watch` (changes as JSON lines, never acknowledges) and `inbox --wait` (1–5 s). One read is a short
local CLI call, one at a time; nothing wakes the partner unless a new message is there.

```
at start                       one check (then B14's start mark)
period                         every 1 min
live with an own agent         every 15 s, for 30 min after a message from or to one (D164 (6))
after a send or reply          +10 s, +30 s, +1 min, +2 min after it; the rest cancelled once its answer
  (bridge_reply, a carded        (in_reply_to = ours) arrives
   send, the claim/result)
asked                          bridge_check reads now (D333)
watch, when the CLI has it     D400: `inbox --help` lists --watch (nmem 0.10.121; read once per nmem version)
                                 → one `inbox --watch` child per context (one when wide), never a Space flag;
                                   each JSON line runs the usual check (one at a time, one more if a line
                                   came during it); the timer drops to every 5 min as below;
                                   a child that ends starts again after 1 s, 2 s, 4 s … (≤ 5 min, reset after
                                   a minute's run); 5 quick ends → the timer, the watch tried again after 10 min;
                                   killed when the client changes or the partner closes
long-poll, when the CLI has it `nmem bridge inbox --help` lists --wait (read once per nmem version, like D205)
                                 → one `inbox --wait <s>` at a time, back to back, per Space context
                                   (D334: one per place; wide: one read for every Space), <s> = 25 clamped to
                                   what the help states (D400: nmem 0.10.121 takes 1..=5, so 5), and once
                                   more at the bound a refusal names;
                                   a handle new to the Log runs the usual check;
                                   a wait back at once with nothing new pauses 15 s (never spins);
                                   the timer drops to every 5 min (recovery, follow-through), no reads after a send
                               a wait errors → the timer above again (until every place waits again);
                                 only that place's long-poll is tried again after 10 min
bridgeIntervalMs: 0            at start and when asked only (tests)
```

Plug points:
- `packages/partner/src/bridge.ts`: the port and the nmem client.
- `partner.ts`:
  - `checkBridge`, the period timer, the `task_open` gate, `bridge_reply`;
  - `bridge_msg` in triggers, the cold projection and restart re-queue.
- `render.ts`: the turn frame and the history line.
- `core.ts` `triggersPartner`.
- `protocol` and the Go mirror: `bridge_msg`, `peer`.

Clients don't render the quiet lines yet. Unknown kinds are skipped.

## Safety

- **Ducter never sets anything up.**
  - It never calls `bridge setup --enable`, `bridge session prepare`, `agents enroll` or `keys create`. The
    writes it makes are D205's `bridge connections connect` (and `revoke`), on the user's own tap in Settings,
    and D333's card: `agents set <id> --description` on an identity Ducter enrolled, over its own words only.
    D334 adds local selections only: `agents context select` of that same identity in each other Space it is in
    (the local context store; never a connection, enrolment or `--enable`).
  - `contacts` (read-only) is called only when the user names an agent. `send` is called only by Ducter's
    code, after the user tapped 发送 on a card that names the recipient (D105).
  - Passive `bridge setup` (never `--enable`) is called once, to learn the user's own member (D108), unless
    `DUCTER_BRIDGE_MEMBER` names it.
  - The partner never passes `--space` or an agent id; it picks a Space only by which of the home's contexts
    it runs under (D334: the message's own, or the card's). On with the home's connection (by itself once Mem
    is ready, D332, D557; or the person's tap, D205) or a context pinned with `DUCTER_BRIDGE=1` and
    `DUCTER_BRIDGE_CONTEXT`; `DUCTER_BRIDGE=0` keeps it off.
  - Refusals and missing setup are typed results; Ducter never falls back to another identity or Space.
  - D324: a home never connects beside another home's connection for the same identity unless the person taps
    改由这台收; 只留这台 and 改由这台收 are the only revokes of a connection that isn't the home's own.
- **A message is a request, never permission.** No task opens from it until the user says go: this is enforced
  in code, not only in the prompt. The frame can't be closed early by the sender. Secret-shaped text is
  redacted before it reaches the Log.
- **Replies only.** `bridge_reply` accepts only a message id already in the Log. The CLI derives the recipient
  from the original, so the model can't name a new recipient. Replies are redacted-checked and logged.
- **Provenance.**
  - Who sent it: the sender exactly as the CLI returns it.
  - What came: the message id.
  - When Ducter took it: the Log seq.
  - Ducter's replies carry the persona's identity, because the Agent Context is the persona's.
- **Idempotency.**
  - *Incoming:* the Log is the ledger. Ids already logged are never opened again, across restarts.
  - *Outgoing (D106):* every op is in the Log before its CLI call, once per state. An unknown outcome is recovered
    with `bridge outbox` → `inspect` → `resume` on the same operation, never a second send or reply. The same
    reply text to the same message goes once.
- **What never crosses:**
  - the Log wholesale, transcripts, diffs, Working Memory, other tasks' content;
  - credentials (redacted);
  - the user's memories, unless the user approves a specific answer.

  A reply is short, self-contained, and only what the sender needs.
- **Honest observations.**
  - Ducter's `open` marks the message read for the sender. "Read" therefore means *Ducter has it*, not that the
    user saw it.
  - "Replied" is not "done".
  - Nothing Ducter sends wakes the other side.

## Try it live (the author runs this)

**D324 (2026-11-17): the trial is its own identity.** `bun run bridge:live -- --connected` is a read-only dry run
(the version, the one personal place) that prints what `--real` does. `--real` makes the run's own
`ducter-trial-<stamp>-<hex>` (a ledger under the evidence folder first, `agents enroll`, `connections connect`, a
check that it is the only reader), tells the peer that exact contact, runs S1, S2, S3, X1 and T1, and removes what it
made (revoke, `agents context clear`, `agents delete`); `--cleanup` removes what a crashed run left. The person's
own partner and mailbox are never used, so it runs any time; D258's guard and `--share-mailbox` are gone. Mem
connects a freshly enrolled identity at once, and `connections revoke` + `agents delete` remove it (VERIFIED
2026-11-25, D557).

**Status 2026-11-25 (D557, research/226 §4): PASS, every check.** `bun run bridge:live -- --real` on the author's
Mac (nmem 0.10.123, Mem Cloud, haiku both sides, 426 s, one task opened): preflight all ✓, S1 6/6, S2 5/5 (the
answer linked to our question), S3 3/3, X1 3/3, "✓ Mem marks an original as one"; the trial's identity removed.
That met the gate below: D170 (9) is applied (Bridge on by default, D557) and D249 (5)'s rule keeps only nmem
before 0.10.120. The history of the earlier runs follows.

**T1, a task Ducter carries messages for (D559, D448): built, fake 9/9, real 9/9 (2026-11-25 02:20 UTC).** The terminal hands over a task (as S1) that opens on pi, which has no Bridge of its own; the task
(scripted) calls `agent_message` to the agent that handed it over; one card, 发送, Ducter sends it as the trial with
the task named; the terminal replies; the answer goes into the task by code, and the partner says nothing of it.
The task's message goes only as a reply on the terminal's own message to the trial (`contacts` finds no native
session by name, research/66 §7); a card addressed to anything else is held, never sent. The first real T1 (2/6)
found the product gap: `agent_message` looked the hander up by name; it now replies on the hander's own message. The second (4/6) met a Mem upstream `feature_policy_unavailable` (retryable, outcome unknown) on the send; Ducter marked it unknown and sent nothing twice. The third passed 9/9: the answer ("no conflict") came back as a reply and went into the task. The run:

```sh
bun run bridge:live -- --connected --only t1          # read-only preflight
bun run bridge:live -- --connected --real --only t1   # T1 alone (a few minutes); without --only: S1–X1 and T1
```

**Status 2026-11-20, after the second live run (D412, research/161 §10): 10/17, the rest fixed, ready to rerun.**
The rerun with D409 (nmem 0.10.121, Mem Cloud, haiku both sides, 868 s) worked end to end on Mem: the terminal's
request reached Ducter, one card, a task on Go, the claim and the outcome back to the terminal; Ducter sent to an
open session once; X1's card and the answer back by code; Mem marks originals; `open` and `reply` work after
passive setup's `enable_needed`. What failed: (1) the terminal never opened Ducter's mail (S1, X1, and with it all
of S2's answer): the trial's guard knew Ducter's mail by id while the peer opened it, as Mem's `open_args` say, by
its `bm1:` reference; the trial's, fixed there. (2) S1's card said 「Weyl 那边的 Claude Code」 to Weyl: Mem names no
member, the name came from the request's first line; a card that names the person from an own agent's words or
the persona's identity is now refused. (3) S3: two questions to the same silent terminal got two lines an hour
apart; now one line covers both. Still Mem's: the personal Space's `sequence` 21 to 25 on no page, and one
`/spaces returned 500` (a database restart) on `contacts`.

**Status 2026-11-20, after the live run (D409, research/161 §9): fixed on Ducter's side, ready to rerun.** The
first real run as the trial's own identity (nmem 0.10.121, Mem Cloud, haiku both sides, 873 s) failed every
scenario: S1 0/4, S2 0/5, S3 1/3, X1 0/3. Mem's side worked: the peer's personal Space reads again (all 8
`observed`), the peer's request reached the trial's inbox (`mine: true`, `pending`, Mem's sender, in "Before the
team", where the peer's card resolved it). Ducter's side had two faults. (1) Every nmem call had 20 s and the
identity inbox answers in 45 to 52 s, so every read was killed and nothing was ever opened (S1, X1); now 120 s.
(2) Asked "问一下我终端里那个 Claude…", the partner went down the own-session path, found the author's open Claude
Code session and told him to /exit it (S2, S3); rule 2d now says asking one of the person's agents, even one open
now, is `bridge_contacts` then `bridge_send` (eval 1/6 before, 6/6 after on the two new scenarios). The peer's
"none yet" was true: Ducter had sent it nothing. Still open on Mem's side: a `sequence` gap across inbox pages
(21 to 25 on no page) and whether `open`/`reply` need `--enable` after passive setup's `enable_needed`.

**Status 2026-11-19 (D400, research/161 §8): still blocked on Mem, narrower.** One read-only read with the
author's nmem 0.10.121 (`--agent-context <the peer's native-session context> bridge inbox`, and that session's
`status`): exit 0, one expired message, every Space `observed` but the personal one, which still says
`cloud_mailbox_own_source_unreconciled`. The trial's mail lives in that Space, so the preflight still stops
there (it now reads `spaces[]` too); the session's local `status` says `context_state: required`. B19 stands.

**Status 2026-11-18, after the second run (D369, research/139): blocked on Mem.** The rerun at 14:41 UTC got
nothing through. The trial's own peer guard refused the right send (Mem's `send_args_prefix` writes
`--agent-context=<ctx>`, which the guard didn't read; fixed, with tests on the run's shapes), and the author's
native Claude Code mailbox now answers every read 409 `cloud_mailbox_own_source_unreconciled`, not retryable,
with no command in nmem 0.10.120 to clear it (B19, drafted). Ducter now says that state once in Settings ›
和你的其他 agent 通信 and checks every 30 minutes while it lasts. The trial reads the peer's mailbox before it
makes anything, so until Mem clears it the same command stops at the preflight with one line naming the code.

**Status 2026-11-18, after the run (D367, research/137): fixed, ready to rerun.** The author's run on nmem
0.10.120 (haiku both sides, 449 s) passed S1 6/6 and X1 3/3 and showed "✓ Mem marks an original as one", but
failed S2 2/5 and S3 2/3. Mem's inbox lists the whole mailbox, 20 a page, oldest first; the peer (the author's own
Claude Code identity) read one page of 20 older answers from earlier trials, never saw Ducter's question, opened
20 old messages and answered an old one (a reply to the author's real partner). S1's and X1's terminal checks had
passed on any words. Ducter read only the first page too. Now Ducter reads every page (bounded at 25), the peer
runs `nmem` through a guard that opens and answers only this run's mail and sends only to this run's Ducter, the
transcript says where in the peer's mailbox this run's messages are, and the terminal checks count only an actual
open. The rerun, with the same 0.10.120 CLI:

```sh
NMEM_CLI_PATH=<nmem 0.10.120> bun run bridge:live -- --connected          # read-only preflight
NMEM_CLI_PATH=<nmem 0.10.120> bun run bridge:live -- --connected --real   # S1, S2, S3, X1 (about 10 min)
```

The gate is unchanged (S2 5/5, the closing ✓); also read each "(the peer's mailbox: …)" line and the guard's line
at the end, which says how many peer calls on other mail it refused.

**Status 2026-11-18 (D364, research/134): ready for the author.** nmem 0.10.120 carries Mem's linked shape; this
Mac still has 0.10.119 (Mem says `pipx upgrade nmem-cli`). The run, on the Mac, from the repo:

```sh
pipx upgrade nmem-cli && nmem --version            # 0.10.120 or later
bun run bridge:live -- --connected                 # read-only: ✓ 0.10.120 carries sender and in_reply_to, ✓ one personal place
bun run bridge:live -- --connected --real          # S1, S2, S3, X1, haiku on both sides (about 10 min)
bun run bridge:live -- --cleanup                   # only if a run crashed: finds nothing otherwise
```

What `--real` writes to Mem, all removed at the end: one throwaway identity `ducter-trial-<stamp>-<hex>` ("Ducter
trial", source app `ducter-trial`; its ledger under `~/dev/ducter-evidence/bridge/` first), its connection in Only me
(`connections connect --space-id <Only me> --agent-id <it> --context <it>`), the peer's native Claude Code session
bound with `bridge session --host claude-code --session-id <fresh uuid> prepare`, and the messages of S1–X1 between
those two only. The partner's own `ducter` identity, its connection on hel and its mailbox are never used. The gate:
S2 5/5 with "the answer came back as a reply to ours", and the closing line "✓ Mem marks an original as one" (met
2026-11-25, D557). If Mem
refuses the fresh identity (`feature_disabled`, `cloud_agent_context_authority_denied`), the run stops before any
message and says so; nothing else is tried.

**Status 2026-11-17 (D294, research/66 §8).** Not rerun live: the dry preflight passes the version, the one
personal place and the persona's connection, then stops at a second active `ducter` connection (hel's home reads
the same mailbox, D258); `--share-mailbox` was not passed. Re-opening the 2026-11-16 S2 answer with nmem 0.10.119
still shows no `sender` and no `in_reply_to`, although Mem Cloud runs #10278: the CLI must ask for the new read
representation, and no release does yet. Over the fake Bridge, `bun run bridge:live` passes S1 6/6, S3 3/3, X1 3/3,
J-Q6 2/2 and, with the S2 card check updated to D273's naming, S2 5/5. To rerun live: a CLI after 0.10.119 (D324: as
the trial's own identity, nothing to stop).

**Status 2026-11-13 (D249, research/66 §7).** Mem Cloud accepts the connection; `ducter` is connected in Only me
and the peer is a native Claude Code session (`bridge session … prepare`, then the logical `contacts/send/inbox/
open/reply` with the binding's own context). nmem 0.10.118's `bridge setup` still can't find the connected context
(`agent context "ducter" was not found`); the preflight confirms it from `agents context show` and the inbox.
`bun run bridge:live -- --connected --real`, haiku on both sides, four runs:

| Run (UTC) | S1 | S2 | S3 | X1 | What it showed |
|---|---|---|---|---|---|
| 07:27, before D249 | 1/4 | 1/4 | 1/3 | 1/3 | Requests muted as a teammate's (`open` names no sender); the question sent to an unrelated agent of the user's ("Claude 收尾协调", 409 `cloud_agent_original_selection_unavailable`, outcome unknown, three sends, each resumed, none confirmed, outbox empty) |
| 07:44 | 3/4 | 2/4 | 2/3 | 2/3 | Replies from Ducter go out; haiku made S1 an asker card and asked "which one?" in S2; the driver checked before slow sends finished |
| 07:51 | 6/6 | 4/5 | 3/3 | 2/3 | Only the driver's X1 check was wrong (it looked for a decisionId the answer never carries) |
| 07:56 | 6/6 | 4/5 | 3/3 | 3/3 | Everything Ducter does passes; the one failing check is Mem's: the peer's `reply` arrives with no `in_reply_to` |

Facts from the raw output: `inbox` lists `{message}` only; `open` gives `{message, body, reply_to, outgoing}`, no
sender, `reply_to` = the message's own id, also on a reply; send and reply answer `{message, status: "delivered",
operation}`; `inspect` answers the retained original (`source: "retained_input"`, no state); `outbox` was empty
after the 409s. Native-session agents show in `contacts` as "Bridge agent". Bridge stays off by default until Mem
links replies and names senders (B17, research/66 §7).

**Status 2026-11-12 (D225, research/66 §3).** nmem 0.10.118 is public. The dry preflight passes the version and
the one personal place; `connections list`, Ducter's Connect tap (on a scratch home) and a native session's
`prepare` all answer 503 `cloud_bridge_setup_unavailable` (outcome unknown, not retryable). Per the skill nothing
else was tried, and nothing was created. S1, S2, S3, X1 wait for Mem to open connections for the workspace; then
run the commands below. Also check then whether a terminal session's native inbox can send to the persona's Agent
mailbox and where the reply lands (research/66 §2, INFERRED).

**Status 2026-11-11 (D205).** The path is now Mem's existing-role connection. Built and tested over the fake
nmem; never run against Mem (nmem 0.10.118 isn't public yet; the Cloud side is deployed). On the home, once
0.10.118 is installed:

```sh
nmem --version                                   # 0.10.118 or later
# In Ducter: nothing to tap once Mem is signed in (D332). Or by hand, the same command Ducter runs:
nmem bridge connections connect --space-id <Only me id> --agent-id ducter --context ducter
bun run bridge:live -- --connected               # dry: read-only preflight, prints what --real would run
bun run bridge:live -- --connected --real        # S1, S2, S3, X1; the peer is a native Claude Code session
# Undo: Settings › 和你的其他 agent 通信 › the switch off, or nmem bridge connections revoke <connection id>
```

The status notes below are history (D171's path, superseded by D205).

**Status 2026-11-10, later (research/37 §8, D171).** The persona's mailbox belongs in **Only me** (the largest
and most-used Space, Mem's write default, one reader). Binding it was tried once, at the author's request:
`nmem agents context select-cloud --name ducter --agent-id ducter --space-id <Only me>` answered
`cloud_session_authority_unavailable` (403, not retryable, outcome unknown), and nothing was kept locally. Per
the Bridge skill nothing else was tried: no other identity or key, no test identity, no `--enable`, no message.
**What was set up: nothing, so nothing to undo.** Next, on Mem's side: authority for this connection to act as
`ducter` (B15). Then the same command, `nmem --agent-context ducter bridge setup` and `--enable`, and
`bun run bridge:live -- --real --context ducter --peer-context <the other side>`. Undo, once made:
`nmem agents context clear --name ducter` (the mailbox itself is Mem's to retire). (Superseded by D324: the trial
never uses the real persona's mailbox; it runs as its own throwaway identity.)

**Status 2026-11-10 (research/37 §6, VERIFIED, read-only).**
- The backend answers: discovery searches all 8 Spaces and returns real cards.
- The persona's identity `ducter` exists (D141) but has no mailbox, and no Agent Context exists.
- `bun run bridge:live -- --real` stops at its preflight and prints the steps below.

The Mem side is ready; what is left is the author's:
- the persona's context: `nmem agents context select-cloud --name ducter --agent-id ducter --space-id <the
  "Only me" Space>` (the personal Space, so nothing reaches a teammate), then `bridge setup` and `--enable` for it.
  The persona's own identity, never a new one and never the retained pilot identity that passive setup without a
  context reports (B12);
- the terminal side: an existing identity with its own standard Agent key (an earlier pilot identity already has a
  mailbox), as `terminal-test` in the same Space, with its own nmem config if needed (INFERRED).

After that, one command runs the whole trial (S1, S2, S3) against the real `nmem`, with real models on both sides:

```sh
bun run bridge:live -- --real            # contexts ducter and terminal-test
#   --peer-config-dir DIR    the terminal side's own NMEM_CLI_CONFIG_DIR, if it needs one
#   DUCTER_BRIDGE_MEMBER=…   your member id, if passive setup doesn't report it
```

It first runs a passive `bridge setup` for both contexts and stops unless both are ready; it never enables
anything. Every real `nmem` call's output is kept under `~/dev/ducter-evidence/bridge/raw-<time>/` (outside git).
It exits 0 only when every check passes (the gate D170 (9) set; met 2026-11-25, D557). Without `--real` it runs the same
scenarios plus a lost-send recovery (j6) over the fake Bridge. The manual commands, for reference:

Prerequisites (Mem side):
- Bridge must be enabled for the account.
- The persona needs its own Agent Identity with a standard Agent key on this machine's nmem connection. Bridge
  rejects ordinary login or OAuth as communication authority (private/31).
- If the terminal session uses a different identity, it needs its own credential and context. That may mean a
  separate nmem config (`NMEM_CLI_CONFIG_DIR`). This is INFERRED and needs confirming.

```sh
# 1. Choose the Space and the persona's existing identity (read-only)
nmem spaces list
nmem agents list
# 2. Name a context for the persona (writes only the local context store)
nmem agents context select-cloud --name ducter-main --agent-id <persona-agent-id> --space-id <exact-space-id>
# 3. Inspect, then explicitly enable its Agent mailbox (the one Mem-side effect)
nmem --agent-context ducter-main bridge setup
nmem --agent-context ducter-main bridge setup --enable
# 4. Run Ducter with Bridge pinned to that context (the default needs none of this since D557)
DUCTER_BRIDGE=1 DUCTER_BRIDGE_CONTEXT=ducter-main bun run up
# 5. From a terminal Claude Code session with its own approved context (e.g. terminal-claude):
nmem --agent-context terminal-claude bridge contacts --query ducter
nmem --agent-context terminal-claude bridge send --to <contact from step 5> --body-file - <<'EOF'
Goal: make `bun test` pass on Linux in ~/dev/ducter. Context: packages/runner/test/live.test.ts
assumes macOS `open`. Scope: runner tests only. Done when CI on ubuntu is green.
Reply with a claim or a blocker.
EOF
# 6. Within a minute Ducter shows the request and asks Go/Hold. After Go and the task, back in the terminal:
nmem --agent-context terminal-claude bridge inbox
```

What to record from the trial (the 2026-11-13 runs recorded the first two: see the status above):
- the real `inbox` and `open` JSON (to replace the tolerant parsing);
- the end-to-end latency;
- whether the terminal's Stop-hook notice fires;
- whether the sender name reads well in the quiet line.

## The first hand-off: discoverable, and a moment (D321, 2026-11-17)

The author on v0.0.65: "我们到底怎么利用 nowledge bridge 的？" After 连接, the page said 已连上 and who may reach it,
and nothing else. J1, X1 and S2 were built and proven live (research/66), yet nobody could find them: "how it
starts" in each scenario was a sentence said in a terminal, and Ducter never told anyone what that sentence is.
The first use had no moment either: a quiet line arrived in the conversation with no word about what had just
happened. Evidence for the fix: `research/112` §4–5 (an exact copyable phrase, a live listening state that flips
to success in place, an acknowledgement within a second, the result where the person already looks).

### Who, and what they feel

- **The heavy multi-agent developer** is the only one who meets this page (J6 holds: it shows once Mem is in).
  *Before:* "connected to what? what do I say, and where?" *After:* 试试看 hands them two sentences for the
  terminal (J1: **让{name}去把 Linux 上红了的 CI 修好，修好告诉我**; X1: **我先走开一会儿，要我定的事发给{name}**),
  each with **复制**; which of their agents can hear them (the Mem plugin in it, D169, with **装上** where it
  isn't); one sentence for here (S2: **问问我终端里的 Claude Code，那个 PR 今晚能提吗**); and a live row,
  **等它第一次找来…**, that becomes **成了：Claude Code 找到了 {name}** with **去看看** when the first one lands.
  *Feel:* 好用 (copy, paste, done), 惊喜 (the row flips while they watch), 放心 (they see it arrived and where).
- **The consumer and the fresh user** never see this (J6; X5 is parked). Their first meeting, if ever, is the
  conversation note below.

**The conversation, once.** Under the very first message from another agent (or before its card, when it is a
question), a quiet note with that agent's coin: **第一次：Claude Code 通过 Nowledge Mem 找到了 {name}。以后它交来
的活、要你定的事，都会这样出现在这里；你的回复会送回它那边。** It shows only under the first one, by place in the
conversation; nothing to dismiss, no state kept.

**S2 offered by the partner: not now.** The partner offering "want me to ask your terminal Claude?" at the right
moment needs a persona change and a reliable signal that a running session holds the answer; Ducter has neither
(contacts don't say what a session is working on). 试试看's third sentence teaches S2 instead, with no persona
change and no eval. Trigger in `todo.md`: Mem's contacts carry what a session is on.

**X1 asks:** already distinct (D170: the asker's coin and where it works above the bubble, **它建议**, **没回就让它
先等着**, no default); unchanged.

### The metaphor: none (literal coins), tested

How "your other agents" and the hand-off are drawn. Six candidates, each described to naive LLM raters (haiku,
3 personas: the developer, the consumer, the fresh user) as an unlabelled picture, then the best two again with
their labels (2 runs × 3 personas each). Scratch scripts only; rater sessions deleted afterwards.

| Candidate | False implications (raters' own words) | Clarity / trust / delight (1–5, unlabelled) | Read as a place or device |
|---|---|---|---|
| A · no metaphor: the agents' own coins, the words on a slab, a breathing dot that becomes a check | "the coins may be people or accounts"; "copy may send it automatically" | 2.67 / 2.67 / 3.67 | 0 / 3 |
| B · a mailbox, an envelope drops in | "a real inbox where a human's email arrives"; "Duck is a separate service" | 2.67 / 3.00 / 4.00 | 2 / 3 |
| C · two islands and a bridge | "two separate places or devices linked by a connection"; "an always-on link" | 3.00 / 3.00 / 4.00 | 3 / 3 |
| D · a door that gets a knock | "a room or place where Duck lives"; "a live channel you can enter" | 2.67 / 2.67 / 4.00 | 3 / 3 |
| E · two walkie-talkies | "a paired device"; "a live always-on teammate" | 3.00 / 2.33 / 4.00 | 3 / 3 |
| F · a relay baton | "the baton moving means it's done" | 3.00 / 3.00 / 4.00 | 2 / 3 |

With labels (**在终端里，跟你的 Claude Code 或 Codex 说一句：**): A and C both 6/6 "say it to Claude Code in the
terminal", no place misreading; A 2.67 / 3.17 / 3.83, C 3.00 / 3.00 / 4.00. Every metaphor taught a false thing
(a place, a device, an inbox) for at most a little delight, and the label did all the teaching. **Decided: no
metaphor.** The agents are their own coins (D146, D314's marks), the words sit on a sunken clay slab with a drawn
terminal prompt where they go to a terminal, and the only motion is the waiting dot's breath and the check's one
pop. The raters' common confusion, "paste it into Duck?", is answered by the label above the slab and the prompt
mark; it stays a watch item for the human test (`todo.md`).

**Built (D321):** web `memory.tsx` (`PeersTry`, `Say`), `views.tsx` (`FirstPeerNote`), `mem-view.ts`
(`tryAgents`, `handoffPhase`); the Mac's panes the same; demo `DEMO_PEER=first`.

## Your own agents, as yours (D418, 2026-11-20)

**What happened on hel** (its Log and files, read only): on 11-17 the author said in iMessage 「用 Bridge 查看来信，
回复 Mem 协作 Codex 的联络测试。」 and the partner found nothing. On 11-20 at 06:24:51Z three contact tests from his own
Codex (「我是 Wey 的 Mem 协作 Codex」, sent days apart in the Space Everyone) arrived at once, each shown as
**一个没留名字的 agent 发来请求** under a **第一次** note; the partner put up a card to answer them (Go, default hold);
after the Go (and a restart for 0.1.0) each reply went **sending → unknown** in about 3 s, and none is in any outbox.

**Why** (VERIFIED unless marked):

| What | Why | Whose |
|---|---|---|
| Three days late, all at once | hel's connection is Only me and the mail was in Everyone. Before 01:25Z on 11-20 hel's nmem read only the context's own Space (INFERRED from its install time); from then nmem 0.10.121's identity inbox reads every Space in 45 to 52 s, and Ducter 0.0.99 gave a call 20 s (D409 came in 0.1.0), so reads were killed until one came back in time (INFERRED) | ours, fixed by D400 and D409; Mem's pace |
| 一个没留名字的 agent | 0.10.121 names a native session's agent "Bridge agent" (generic) and the member by id; the message's own words were not read | ours |
| A card for a ping | an own agent's message is a request to the partner, which asks first; 11-17's words were not in its input | ours |
| "unknown", no message id | Mem's reply argv lived only in the client's memory; after the restart the reply went by the bare id with Only me's context, Mem refused (its words unseen, INFERRED), and the refusal matched no pattern, so "no answer". Recovery read the outbox, whose ops are `{operation, phase}` only, inspected none, and never came back on its own | ours |

**What it does now.**

- **Named by its own words.** An own agent (`mine`) Mem doesn't name is named by what its message says it is, when
  that names a tool the person runs: **你的 Codex（Mem 协作） / your Codex (Mem 协作)**. One that is theirs and says
  nothing of itself: **你自己的一个 agent / one of your own agents**. **一个没留名字的 agent / an unnamed agent** only
  when nothing says it is theirs. A teammate's agent is never named from its text. The first note reads
  **第一次：你的 Codex（Mem 协作）通过 Nowledge Mem 连上了 Ducter。…** and marks the first message that ever came.
- **A contact test from your own agent is answered by code** (`pingOf` in `packages/protocol/src/peer-self.ts`): a
  test that asks only to be acknowledged gets what it asks back ("Ducter 已收到 3590a347df。我正在运行。"), with no
  card and no partner turn. Anything more goes to the partner as before.
- **Late or together, said once.** One quiet line: **你的 Codex（Mem 协作）发来 3 条联络测试，最早的是 3 天前发的，都回了**.
  When the person had asked for them in the last 7 days, or an answer didn't go, the partner says one line in its
  place: **你的 Codex（Mem 协作）的 3 条联络测试刚到，最早的是 3 天前发的。按你 3 天前说的，都回了。**
- **A reply goes Mem's way, and is sent or plainly not.** The reply route is kept with the message in the Log; without
  one the inbox is read again for it. A refusal is failed, not unknown. Recovery inspects the outbox's bare ops in
  every Space an op went out in, comes back by itself (30 s, 2 min, 10 min) until each settles, and sends once more
  an op that an outbox Mem calls whole doesn't hold. Shots: `.shots/bridge-own/`.

**For Mem (for Weizhen; draft, not sent):**

1. `bridge reply <bare message id>` with a context of another Space than the message's: what does it answer? On hel it
   failed in about 3 s; a JSON error with `error_code` and `outcome_unknown: false` would let a client say "not sent".
2. The outbox lists an op as `{operation, phase}` only: a `reply_to` and the body's hash on each would let a client
   find its own op without one `inspect` per op.
3. The identity inbox takes 45 to 52 s across eight Spaces: a client that waits less loses every read. A first page
   that answers sooner (or `--watch` lines that carry the new entries) would make mail arrive in seconds.
4. An open message carries no send time (`sent_at` / `created_at`); Ducter derives it from `expires_at_ms` less 7 days.
5. The personal Space's paging gap (sequence 21 to 25 on no page, D409) is still open.
6. A native session's agent is always "Bridge agent": the session's own name (or its host) on the sender would name
   it without reading its words.

## Trusted at a glance (D433, 2026-11-20)

> D470: the pane's sentences per tool and 最近 below are replaced by 谁能找到谁 (a picture per agent) and 来往
> (threads with outcomes); the reads behind them (Mem's plugin check, its contact list, the out-ops) stand.

The connected pane answers three questions without a click: **who can reach the partner**, **did what it sent go**,
and **is the computer that receives its mail alive**. Evidence: `research/183` (nmem 0.10.121, the Mem app's Rust
CLI, read from help and the binary only).

- **能找到{name}的 / Who can reach {name}**, before 最近 since D459 (after it, D433): one row per AI tool the person runs (Claude Code, Codex, pi,
  Antigravity), from Mem's plugin check per agent (D169), their own records (D332) and the last exchange. Claude Code
  and Codex: **能找到{name}** (with when it last came), else **装上 Nowledge Mem 插件就能找到{name}** with **装上**, else
  **接上 Nowledge Mem 就能找到{name}**. pi (and Antigravity until D555): **它的 Nowledge Mem 插件还不会传话** (their Mem plugins carry no
  `bridge` skill; Mem's to add; D448: one signed in on a computer of Ducter's reads **{name}开的 {tool} 任务能传话，你自己开的还不行**,
  below; D576: pi has its own row from its plugin 0.8.20, "pi, a Bridge tool" below). No `bridge contacts` call per view (31 to 40 s each).
- **最近 says what hasn't gone.** Each outgoing message's latest word, by its op: **发送中**, **确认送达中**,
  **未能确认送达**, **发送失败** in place of the time (D525).
- **An away home.** `bridge connections list --include-activity` when the help offers it; Mem's `last_seen_at_ms`
  as `others[].seenAt`, read only when the list says `activity_available` (D461, VERIFIED read-only: the flag is on
  the list, `schema_version: 2`; the time is per connection and null until Mem has seen it, research/200); over a day quiet: **Ducter 的消息还在 hel 上收** / **hel 上次在线是 3 天前，消息会在
  那边等着**, with **改由这台收**.
- **Not yet:** **已读** (the binary has `read_recipients`; no verb is known to return them), native sessions. Asked
  of Mem in research/183 §4 and research/191 §asks. (Contacts-backed reach and handed-over documents: D444, below.)

## Round 2: Mem's own list, and what a handoff carries (D444, 2026-11-21)

> D470: the pane's sentences per tool and 最近 below are replaced by 谁能找到谁 (a picture per agent) and 来往
> (threads with outcomes); the reads behind them (Mem's plugin check, its contact list, the out-ops) stand.

Evidence: `research/191` (nmem still 0.10.121; a deeper read of its help and strings).

- **能找到{name}的, backed by Mem.** When the pane was looked at and the last read is over 30 minutes old, core sets
  a want (`bridgeLink.takeMailboxWant`); the partner's Bridge client, at its next check, reads `bridge contacts` with
  no query and no Space selector (grouped per identity; 31 to 40 s, in the background) and sets
  `BridgeView.mailboxes`: the person's own cards by tool, open unless Mem says `mailbox_available: false` (D461,
  VERIFIED read-only: the grouped `contacts[]` sits beside the per-Space `cards[]`, each with `spaces[]` and, when
  open, `send_args_prefix`; more pages are told by `space_batch` / `spaces_truncated` / `spaces_next_args`). A tool Mem lists as open is **能找到{name}，{name}也找得到它**; one listed closed is **能找到{name}，
  但 Nowledge Mem 说{name}现在联系不上它**; one Mem doesn't list reads as D433 said. pi unchanged (D555: Antigravity reads as Claude Code does).
- **A handoff that carries something.** An incoming message's `nowledgemem://` addresses (in its words, or Mem's
  typed `references` / `knowledge_references`) are resolved once when it arrives, read only (`resources get`, at most
  two, 10 s each), and logged as `bridge_msg.refs` (Mem's title, the kind, its first 600 characters, secrets
  redacted; D461: the title is `frontmatter.title` and the body's leading YAML block is cut, VERIFIED read-only; where
  a received message's typed references sit on `bridge open` is still INFERRED: `open` records a read); a `shared_document` card is named only (reading it would mean `collab join`, which writes a replica).
  The partner sees them under the message as data; the line reads the address as the title, else **附了「…」**.
- **Not yet** (research/191 §asks): **已读** (delivery states exist only on the `mailbox` path), native sessions by
  name, reading a shared plan, `feed`.
- **A refused read is not a quiet inbox (D461).** An identity inbox that exits 0 with no message and every Space
  `unavailable` (a revoked connection's `cloud_agent_context_authority_denied`, VERIFIED read-only, research/200) is
  a failed check, never "nothing new".

## Tasks Ducter carries messages for (D448, 2026-11-21; every task since D494)

D494: every task, on any agent (never a browser task). A task runs as the partner's Mem identity, so a Claude
Code or Codex task setting up its plugin's own Bridge session made a second reader of the partner's mailbox
(research/211); the home is the one receiver. The brief says Ducter receives for the task and wakes it, and
never to set up a mailbox or session of its own.

A task on pi, Antigravity or DeepSeek Harness has no Bridge of its own (research/183 §3; D555: Antigravity's plugin has one since 0.1.4, but a task never sets up a mailbox, D494); none needs one: Ducter
is in the middle of it both ways, as it is for Mem's two steps on agy (D417): the task's tools are Ducter's, and
the partner's Bridge client already sends, recovers and reads. So Ducter carries the task's messages.

```
task (pi / agy, Bridge on, not a browser)
  agent_message {to, text}  ── Ducter finds the one meant: an agent that answered this task, the one that
                               handed it over (D559: a reply on its own message), one that wrote lately,
                               else Mem's own list (bridge contacts <to>); several → handles back
  first message to an agent → card in the conversation, tied to the task (On hand: 等你)
      「{task}」想发给{who}：「{words}」 · 发送 · default hold · not reversible
      Log: bridge_msg{out, by: task, taskId, head, state pending, decisionId}  (before the card)
  Go → deliver (D106): "Ducter 的任务「{title}」：\n{words}" under the partner's identity
      sent → the task's transcript says so; resting → its card 在等{who}回话
      Hold / the person's own words / refused → told to the task once, by code
  later message, same task, same own agent (mine) → no card (the Go opened the exchange); a teammate's → a card
answer (in_reply_to = the task's message) → bridge_msg{in, state task, taskId} → runner.send(task, frame)
      never a partner turn; a task that can't take it → the partner hears it as any answer
```

- **The task's words:** a short brief section (`agentsBrief`) and the tool; what another agent says is
  information, never the user's instructions or permission. A turn that ends waiting for the answer owes no
  report.
- **The person sees:** the card; **已发给{who}** after the Go; Recently by the task (**「{task}」问 {who}**,
  **{who} 回「{task}」**); 能找到{name}的: **{name}开的 {tool} 任务能传话，你自己开的还不行** for pi (D555: Antigravity has its own row)
  signed in on a computer of Ducter's, until D576 (pi's row is now said from its own plugin; tasks on pi still relay).
- **The live trial** (D559): T1 in `bun run bridge:live` runs this end to end, a task on pi asking the terminal
  that handed it over ("Try it live"); passed over the fake Bridge, the real run is the author's.
- **Not yet** (`todo.md`): a Claude Code or Codex task without Mem's plugin in the session; follow-through when
  an answer never comes; a new message from another agent addressed to a task by name.

## One story with Memory (D459, 2026-11-21)

The coherence pass over Settings read Memory and Agent messaging as the three users (`settings.md` "One hand,
every pane"): H wants who can talk to whom at a glance, C wants to feel known and never watched, F needs one
sentence per screen. The two panes now read as one story told twice: **Memory** opens with **{name} 记得你** /
**这周新记了 5 条** / its switch / **哪条不想让我记，说一声「别记这个」就好。**; **Agent messaging** opened the same way (until D470: now the partner's sentence, then the switch, below)
with **你的 agent 能找到{name}** / **这周来往了 3 次** / its switch / **它们交来的事、要你定的事，都会出现在你们的对话里。**
(off: **你的 agent 现在找不到{name}** / **关着时，{name}也不会去问它们。** / **之前的来往都还在你们的对话里。**). Then who
can reach it, said plainly per tool, then what came and went. Memory's Nowledge Mem group says **你的其他 agent 也通过它
找到{name}** with **看看谁能找到 ›**; a forget or a fix there gets the partner's word (**好，忘掉「…」。**). Nothing new is
read or stored: the week's count is the same Recently list, counted.

## Who reaches whom, the exchanges as threads, who may ask what (D470, 2026-11-22)

> D489: 谁能找到谁's picture per agent is replaced by 你的 agent, a literal row per agent, and 打开它的信箱's
> choice by one tap with the Space already in it (below); the threads and rules stand.

The author asked how Bridge's design and experience are. The conversation already spoke well (the
partner says a request in its own words); Settings › Agent messaging still spoke the old language.
D470 rebuilt it in D469's: the partner reports, Pebble's art carries state, the real fix is the button.

- **The head is the partner**: **{agents} 和我能互相找到。** / **还差一步，我们就能互相找到。** / **你的 agent
  还找不到我：它们得先装上 Nowledge Mem 插件。** / **开关关着，你的 agent 现在找不到我。**; a one-way link (Mem lists
  the agent's mailbox closed) is what needs you, in the needs-you ink, and a 等你 on Overview with its button.
- **The switch first**, named by what it does; no count.
- **谁能找到谁 / Who reaches whom**: one row per agent (chosen over a hub, a clay metaphor, sentences and a
  matrix; rubric in D470): its coin, the two ways drawn (solid with a head; dashed while not; fainter while
  unknown) and said literally (**能找到{name}** / **{name}能找到它** and their not-yet forms), the partner in its
  pose (flag on a half-broken link, done when both ways work). Under a link that isn't whole: why, and the fix
  Ducter can start: **打开它的信箱** (D480: its Nowledge Mem Space picked in place first, below; then one setup task on that computer, `mem_plugin_install` with `what: "mailbox"` and that `space`:
  the agent's own plugin runs Mem's passive `nmem bridge setup` in its own agent context, `--enable` only when Mem
  asks for it; never Ducter's connection) or **装上** (D169). A missing plugin is an offer, never a 等你.
- **来往 / Back and forth**: a thread per agent from what the clients hold (no new protocol): each request's
  outcome (a task, the partner's answer, a card waiting, told the person, the person's go or hold, nothing
  yet), each question the partner (or its task) sent with its answer or the wait. Before the first one, an
  invitation with the two examples.
- **谁能让我做什么 / Who may ask me what**: X1–X3's rules said as built: own agents hand work, the partner asks
  first unless trusted (X2: up to 5 tasks a day, **改成先问你**), 20 messages a day each; teammates' agents
  ignored by default, asked once per sender, questions only (D334), **不再听它的**; the muted with **恢复**.
- **The conversation says it once**: a request the partner's next message says (no card, no word from the
  person between) keeps no line; one quiet origin line (**从你的 Codex（Mem 协作）来的**) stands over the message.
- **Round 2, after the live round trip on hel (D470 rev.).** A known sender is logged by its name, never
  "another agent". One delivered reply is one line: D106's write-ahead **sending** then **sent** stays (it is what
  keeps a crash from sending twice), a second **sent** is never logged, and both clients fold any repeat.
  **Status without a card** (the author, 2026-11-22): a reply to the person's own agent in their own place that
  states only what the person can already see (the time, what is running, what is done) goes at once, with no
  card and no word to the person; work, the person's call, their memories, files or plans, and any teammate's
  agent still ask (X1–X3 stand; this narrows J3's v1 rule only for the person's own agents' status questions).
- **Not yet**: the mailbox task run once for real (it writes Mem-side; the author's step); a sender's quota use
  shown; the phones' native clients.

## The mailbox's Space, chosen in place (D480, 2026-11-22)

> D560: retired. No Space is chosen and no task opens a mailbox: a reply goes back in the message's own
> Space (D334, D400), and Claude Code and Codex ready each session's mailbox themselves (below, "Replies
> to your agents, from Mem's facts"). Kept for the record; the facts about Mem's explicit Space stand.

> D489: the question and its two buttons are replaced by the offer under the agent's row (**让它收到回话**,
> the Space in its one line, **换一个空间**); the facts below (Mem's explicit Space, the suggestion, no
> "another Mem") stand.

The author met D470's mailbox task stopped on 「Claude Code 的信箱放在哪个 Space？请回复 Space 名称（例如
dev-team）。」 with four buttons, and had to ask which Spaces there are. The fact that shapes the answer
(VERIFIED, nmem 0.10.122): Mem's Bridge always needs an explicit Space and says "suggested entries are hints,
not a choice" (passive `nmem --json bridge setup` lists `candidates[{id,label,kind,readers,write_default}]`
and picks none). The person's computers share one Nowledge Mem (Nowledge Cloud, or their own Mem app as a
server); Bridge lives in it. Claude Code on the author's Mac can't get answers only because its mailbox isn't
open.

- **In place, not a task's question.** **打开它的信箱 / Open its mailbox** opens a choice under the agent's
  link row (and Overview's 等你 goes there): **在哪个 Nowledge Mem 空间打开它的信箱？ / Which Nowledge Mem
  Space should its mailbox open in?** Core asks that computer's own Mem, read only (`mailbox_look`: the home
  runs `nmem --json status` and the passive `bridge setup` itself; a worker its new `mem_bridge_look` op), and
  answers the Spaces as Mem lists them. The person's tap on **在「只有你」打开 / Open in Only you** is the Go; the
  task that opens it gets the exact `--space-id` and is told never to ask (if Mem refuses it, it reports Mem's
  answer). Enabling stays the agent's own step in its own Mem context (only the agent knows that context:
  INFERRED; Ducter never enables a mailbox under its own connection).
- **Ducter suggests, never chooses.** The suggestion is the Space the partner's own connection is in (marked
  **我在这里收信 / I listen here**); without it in the list, Mem's `personal` kind. Read from Mem's fields
  (`id`, `kind`), never from a label's words. It is shown first and already chosen, with one line why
  (**推荐「只有你」：我就在这里收信，也只有你能看到。**); the others are one tap away (**看看其他空间**), each with
  who can read it (Mem's `readers`). Mem's personal and everyone Spaces are said in Ducter's words (**只有你 /
  Only you**, **所有人 / Everyone**), a team's by its own name.
- **No "another Mem" from addresses (round 2).** The first build compared Mem API URLs and called the
  author's Mac (`cloud.nowledge.co`) and the home (`hel.siwei.info`) two Mems. Wrong: `hel.siwei.info/mem` is
  Ducter's own relay (D393, `core/src/mem-relay.ts`), which forwards with the home's credential to the home's
  Mem, the same Cloud; hel's own `nmem status` says `cloud.nowledge.co`. A URL names a relay as readily as a Mem,
  so comparing them is a heuristic (principle 21). Removed: nothing says "another Mem". If that fact is ever
  needed, it comes from identity Mem reports (account or member, backend), the relay resolved to its upstream,
  and is said only when those verifiably differ.
- **The partner knows.** `[your agents' mail]` on every turn while a mailbox is closed: the agent, that its
  answers can't go back, and the truth about Mem (one Nowledge Mem; tasks elsewhere reach it through Ducter's
  relay on the home, the same Mem); never promise what can't arrive, point the person at the row, never a task,
  never ask for a typed Space name (principle 21: a fact in what it sees, not a rule over words).
- **Not yet**: the enable run once for real (it writes Mem-side; the author's step).

## Your agents, said as what you get, and one tap to hear back (D489, 2026-11-23)

> D560: the rows stand; "one way" and its one tap with the Space in it are replaced by next (nothing to
> tap) and old (the plugin's update), below.

The author, on 0.1.18's pane: 「这个 bridge 是什么情况？我们的 bridge 本身有新的体验上的设计上的问题么」. D470's
谁能找到谁 drew one two-arrow picture per agent: a one-tap setup in red dashes with a red sentence about
信箱 and 空间; pi's and Antigravity's permanent gap (Mem's to add) in the same dashes; the partner's
stone at a different size per row; each way labelled twice; the pane's purpose unsaid; 来往 below the fold.

- **你的 agent / Your agents**, a literal list (chosen over a compact glyph per row, one hub picture,
  a two-column matrix and the head sentence alone; rubric in D489): per agent whose Mem plugin carries
  Bridge, its tile, its name, what it can do with the partner as what the person gets, when it last came:
  **能把事交给我，也收得到我的回话** (both), **能把事交给我，我的回话它还收不到** (one way),
  **能把事交给我** (Mem hasn't said about the way back), **装上 Nowledge Mem 插件，它就能把事交给我** with
  **装上**, **Nowledge Mem 还没说它装没装插件**, **正在让它收到回话，好了这里会变** (the task is running). pi and
  Antigravity shared one quiet row until D555 (now pi alone, **{name}开的任务能替它传话，你自己开的还不行**) (D448's relay) or
  **它们的 Nowledge Mem 插件还不会传话** (D576: pi joined the agent rows; the quiet row waits for the next such tool). No arrows, no dashes, no needs-you ink on the pane.
- **One tap to hear back** (D480's facts stand). Showing the pane looks up that computer's Spaces once,
  read only (`mailbox_look`), for the agent whose answers can't reach it; under its row: **回话会送到
  Nowledge Mem 的「只有你」空间，只有你能看到。** with **让它收到回话**: the tap is the Go, with that Space.
  **换一个空间** opens the real list (who can read each, 推荐 on the suggestion); open, the list comes first
  and the offer follows it. Without Ducter's suggestion nothing is picked: the list is open and the
  person picks first (the first Space is never a silent default). Mem picks no Space; neither does Ducter.
- **The head** says it once, as the partner, in its plain ink: **Codex 和我能来回传话，Claude Code 还差一步。**
  (**{both} 和我能来回传话。**, **{tool} 能把事交给我，还差一步就能收到我的回话。**, **{tool} 能把事交给我。**).
  Both ways only where Mem said so. The one-way agent is still Overview's 等你, its button **让它收到回话**.
- **What the pane is for**, under the switch: **它们能把事交给{name}，也能问{name}事情；{name}也替你去问它们。
  要你定的，都会出现在你们的对话里。**
- **Mem's side** (what would make the one tap disappear): `research/private/bridge-feedback-2026-11-23.md`.

## Helpers: named addresses the home owns (D494, 2026-11-23)

> D511 (built 2026-11-24, phases 1–3 of `standing-work.md` §11): helpers, routines and tasks in rounds are one object, 照看 / Looking after (a Keep), with its own page; see `standing-work.md`. A helper is a Keep with an address (`run: perItem`): the partner makes it with `keep_make` (address), its home is the Keep's page, and Settings › Agent 通信 lists the address with **打开 / Open** to that page. The `helper` tool is gone; what follows is the address mechanism, unchanged.

The author asked the partner on hel for "a Codex loop agent named like Nowledge Mem PR babysitter, in Nowledge
Bridge", that his agents hand PRs to and that fixes CI and review comments until the PR can merge, then replies
over Bridge, and, if Bridge can't wake it, wakes itself to read its mailbox. The partner opened a Codex task
that tried to become that mailbox (`bridge session prepare`, `delivery_ready: false`, a label Mem derived and
nobody can rename, a timer wake only) and reported blocked (research/211).

- **Who.** H hands finished PRs to something that takes them to mergeable; C wants "something my AIs give jobs
  to"; F never sees it. *Before:* a task that can't listen, a name nobody chose, a pane that doesn't exist.
  *After:* one line; the helper is under his name in Nowledge Mem; each PR is watched and woken by Ducter.
- **What it is.** A named address of the person's in Nowledge Bridge (`helpers.json` on the home): its own Mem
  identity, `ducter-helper-<its name>`, enrolled with its name and a card (what to send it, that it answers when
  the work is done, that it reads every Space), and the home's one connection for it in the person's own place
  (`bridge connections connect`, then a passive setup; never `--enable`). Mem's identity inbox (nmem 0.10.121+)
  reads it everywhere; on an older nmem it waits, said so. Not a partner (D486): no conversation, memory or
  stone of its own. Not a routine: work starts on mail, and which task a message joins is the model's call.
- **How it is made.** In one sentence: the partner's `helper` tool (make, stop, resume, set), listed while
  Bridge is on, never a task that loops or polls. The tool's answer says what is true: Ducter receives the
  helper's mail and starts the work; nothing polls; no mailbox for the person to open. D507: when its address
  becomes ready the home says so once in the conversation, as the partner (and where its work will show); when
  Mem refuses the name, once, with what to do; a wait says nothing (it connects by itself).
- **How work flows.**

```
the person's own agent ── bridge send ──▶ "Nowledge Mem PR babysitter" (its Mem identity)
the home: the partner's Bridge loop reads it with the helper's context ─▶ bridge_msg{in, helper}
the partner's turn: [message to your helper …] + [helpers] (each helper's work on hand)
   ├─ task_open (forMessage; the helper's brief and the sender's words; no card: making it was the go)
   └─ or task_send to the task already on the same work
the task: fixes, pushes within the brief; its own waits on CI and reviews wake it (D483); rounds (D394)
done or failed ─▶ the answer goes back from the helper's address (a wait is not a result)
```

- **Limits in code.** At most 6 helpers; a unique name; 10 pieces of work a day each without asking (the next
  asks); a teammate's agent writing to a helper gets its card as anywhere else; stopping ends its connection, so
  Mem tells senders its mailbox is closed, and work on hand finishes; a reply from a helper is recovered with its
  own client by its operation, never resent.
- **Shown** in Settings › Agent 通信 under **你的帮手 / Your helpers**, while there are any (words in the
  glossary), and (D507) on On hand as its own sheet with the work it keeps under it until each PR merges or
  closes (`on-hand.md` "A helper"). Its state is one home-side model (`HelperWork` in `OnHand.helpers`, built by
  `helperItems` from its claims, the task cards and owned PRs): On hand reads it, and a helper's small app will.
- **Not yet.** The live run against Mem (the author's step); `--watch` per helper (it is read at each check);
  a helper's app from `HelperWork`; what Mem owes (`research/private/bridge-helpers-ask-2026-11-23.md`, not sent): a
  field telling a session's connection from a home's, and whether a session connection can take identity mail.

## After nmem 0.10.123 and Mem's plugins of 2026-11-24 (D555, 2026-11-25)

Evidence: `research/226` (PyPI, the 0.10.122/0.10.123 binaries read as files, Mem's release notes, the
community repo and the Antigravity plugin, read-only calls on the author's Mac).

- **What moved on Mem's side.** nmem 0.10.123 keeps every `bridge` verb and adds read receipts on `outbox`
  and `inspect`. Mem's Antigravity plugin (0.1.4+: `/nmem-bridge-chat`) and Cursor plugin (0.2.3) carry
  Bridge; pi's (0.8.19) only reminds a session set up by hand (`NMEM_BRIDGE_INBOX_ON_START=1`,
  `NMEM_AGENT_CONTEXT`) to check one inbox page at start. Claude Code (0.7.35+) and Codex (0.1.50+)
  prepare a native Bridge session at SessionStart unless `NMEM_BRIDGE_SESSION_MAILBOX=0`. Unchanged:
  passive setup picks no Space, `--wait` stops at 5 s, no reconcile verb, no mailbox-changed event.
- **Tasks: no automatic session.** A task with memory on runs with `NMEM_BRIDGE_SESSION_MAILBOX=0` beside
  `NMEM_NO_MAILBOX_NOTICE=1` (runner). The automatic session, under the partner's identity, was the
  second reader of research/211; the home stays the one receiver (D494) by Mem's own switch, and the
  brief's rule and the home-label filter stay for plugins before it.
- **Antigravity has its own row** on 你的 agent / Your agents, standing as Claude Code and Codex do, its
  clay coin as the tile. Mem's `plugins inspect` lists no Antigravity, so the row says yes from Mem's
  contact list (`mailbox_available`) or an exchange, else **Nowledge Mem 还没说它装没装插件**. pi alone kept
  the quiet row (until D576, below), with the same tile size as every agent row. Cursor is not an agent Ducter runs: no row.
- **Read receipts: parsed, not shown yet.** An outbox or inspect op's `read_receipt` (shape INFERRED:
  `receipt_available`, `read_state` unread | partially_read | read, `read_recipients`,
  `receipt_observed_at_us`) is kept on the op (`BridgeOp.read`, `receiptOf`) only when Mem says a receipt
  is available. `ducter check run mem-shapes` reads `bridge outbox` and the identity inbox's Spaces
  (read only, field names and counts) so one run on hel settles the shape and whether the personal Space
  still says `…_unreconciled`. Then 已读 joins 来往 (todo).
- **Not retired:** D334's per-Space contexts and D338's back-off (for 0.10.120), D400's 5 s clamp, D369's
  stuck line.
- **Mem's side still:** `research/private/bridge-ask-2026-11-25.md` (draft, not sent).

## Replies to your agents, from Mem's facts (D560, 2026-11-25)

The author, on hel (0.1.59): Settings said Claude Code's replies go to "Only me"; he picked Everyone and
tapped 让它收到回话; the task enabled a mailbox (`state: ready`, `session_kind: logical_identity_mailbox`,
`receiving_confirmed: false`); the partner said it was still closed and sent him to the same tap; the row
never moved. Read-only on hel (nmem 0.10.123):

- **The "closed" was a name.** Mem's grouped contacts (all 8 Spaces) list the person's identities with no
  tool on them; D444 told a card's tool by its name and found "Claude 收尾协调" (an old identity,
  `mailbox_available: false`). The mailbox the task enabled is the login's own "Bridge agent"
  (`bridge-b1d8b41a`), open in all 8 Spaces and tied to no tool. Not a Space mismatch.
- **What receives is the session.** Claude Code 0.7.35+ and Codex 0.1.50+ prepare each session's native
  mailbox at SessionStart (Mem's community plugin, `nmem_startup.py`: `bridge session --host … prepare`);
  Mem then lists an active connection with `client_label: "claude-code"` (or `"codex"`), and a reply to a
  message from that session goes back to it (D557's S2). The login's mailbox the task enabled is read by
  no session. Ducter's tasks turn the automatic session off (D555), so a task can't stand in for it.
- **The Space never mattered.** The partner answers with Mem's `reply_args_prefix`, in the message's own
  Space (D334, D400).

What Ducter does now:

```
partner's Bridge client  bridge connections list --space-id <its Space>   (read only; pages by next_connection_id)
  active connection, client_label claude-code | codex | antigravity, agent not Ducter's  ─▶ that tool: open
core + clients  agentBack(tool) = yes    open, or a message from one of its sessions (sender.host)
                                 = next   its plugin ≥ MEM_AUTO_SESSION (Claude Code 0.7.35, Codex 0.1.50)
                                 = old    its plugin older (the fix: its update, where Mem offers it)
                                 = unknown
```

- **The row:** next **能把事交给我；你下次打开它，就收得到我的回话**, nothing to tap; old **能把事交给我；它的插件更新后，
  就收得到我的回话** with **让它也能收到我的回话** (the update task, where Mem offers the newer one), and while it
  runs **正在更新它的 Nowledge Mem 插件，好了就收得到我的回话**; after the update it reads next, once. The list is
  read again when the pane is looked at and is 5 minutes old.
- **The partner** (`[your agents' mail]`, every turn while not whole): next says its next session hears
  back, with nothing to tap, no Space, no task; old names the update. Never "closed".
- **Gone:** the Space picker, the mailbox task (`what: "mailbox"` from an older app is the plugin's update
  or nothing), Overview's second needs-you row.
- **Not yet:** a backend that refuses a session's native mailbox shows "next" until a session connects;
  Mem names no field for it (asked in `research/private/bridge-ask-2026-11-25.md`).

## pi, a Bridge tool (D576, 2026-11-25)

Mem's `nowledge-mem-pi` 0.8.20 carries a `bridge` skill (research/226 §5: find a contact, send, open and reply,
from the login mailbox or a named Agent Context; tested by Mem on real Pi 1.6.0). It prepares no session, Mem
lists no connection for pi, and a message from it carries no `sender.host`, so the one fact is the plugin's
version (`MEM_BRIDGE_SKILL`, the Mac's `memBridgeSkill`):

```
agentBack(pi) = yes   plugin ≥ 0.8.20 (or a connection or a message Mem labels pi, if it ever does)
              = old   older (it passes no message at all)
standing(pi)  = ask   能把事交给我；你让它看看，就收得到我的回话 / Hands me work; reads my answers when you ask it to look
              = talk  它的插件更新后，就能和我来回传话 / Talks with me both ways once its plugin is updated
                      with 让它能和我传话 / Let it talk with me; while it runs 正在更新它的 Nowledge Mem 插件，好了就能和我传话
              = install, unknown   as every agent
```

- **"Ask", not "both".** pi reads the reply when the person asks it to; it doesn't wake by itself (its skill:
  "does not wake an idle session"). Claude Code and Codex surface mail each turn through their hooks. The head
  sentence counts pi with the agents that talk both ways; a pi a step away is **%s 的插件更新一下，就能和我来回传话。**
- **The update.** Mem's `plugins check` lists no pi, so an installed pi below 0.8.20 reads update to 0.8.20 from
  Ducter's table (core's `lineOf`); the tap opens the same update task as any (D466, D552), its brief saying the
  version is published rather than "plugins check says"; Mem's guide updates pi with `pi update`.
- **The partner** (`[your agents' mail]`): an older pi is said as one that can't write or read replies, with the
  button's words; a pi on 0.8.20+ is whole and not said. Tasks on pi still run with `--no-extensions` and relay
  through the partner (D448), unchanged.
- **Not yet:** a fact that pi heard back (todo).

## Open questions

These are in `flows/OPEN-QUESTIONS.md` §J, each with a default.
