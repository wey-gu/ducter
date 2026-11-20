# 161 · Nowledge Bridge in nmem 0.10.121: one identity inbox, notices, and still no way out of "unreconciled"

> 2026-11-19. Public. Follows research/134 (0.10.120), 137 (inbox pages, D367) and 139 (the stuck mailbox,
> D369). nmem-cli 0.10.121 (PyPI 2026-11-19 03:42 UTC) was installed into a scratch uv tool dir and compared
> with the 0.10.120 binary from research/137: every `bridge` subcommand's `--help`, the binary's strings, and
> argument parsing run with an empty `HOME` and an unreachable `NMEM_API_URL` (nothing reached Mem). The
> Claude Code plugin's Bridge change came from the public `nowledge-co/community` repo (commit for #1039,
> plugin 0.7.37). Nothing was run against the author's Mem. This Mac's own `nmem` already reports 0.10.121.
>
> Tags: **VERIFIED** run or read here · **DOCUMENTED** Nowledge's help, plugin README or skill ·
> **INFERRED** my reading.

## 1. The stuck mailbox (D369, B19): nothing new

| Fact | Tag |
|---|---|
| No `bridge` subcommand or flag reconciles, repairs or resets a mailbox. The only new verbs are `bridge notices {subscribe,unsubscribe,watch,status,reset}`, and `notices reset` forgets local notice attempts only (`--channel hooks\|os`). | VERIFIED (help diff) |
| `cloud_mailbox_own_source_unreconciled` and its text "Mailbox source authority requires reconciliation before browsing." are byte-identical in both binaries; no hint, `next` or argv accompanies it. The neighbouring `mailbox_source_lifecycle_unreconciled` ("reconciliation is pending") is unchanged too. | VERIFIED (strings) |
| No new Bridge HTTP route beyond `/agent-team/cloud/connections/metadata`; the read still goes through `/agent-team/cloud/mailbox/own`, the route whose codes are `cloud_mailbox_own_*`. | VERIFIED (strings), INFERRED (which route `inbox` calls) |
| Read-path refusals now carry `"outcome_unknown": false` (0.10.121's local refusal on `bridge --space-id x inbox`; 0.10.120 left the key out). Whether Mem's 409 still says `true` is unknown until a live read. | VERIFIED (local), INFERRED (the 409) |

So a fix, if any, is on Mem's server; only a live read-only inbox read tells (§6 step 1). B19's three asks stand,
the third possibly half met.

## 2. One inbox per identity (#10402, D334): shipped, but not as Ducter expected

| Fact | Tag |
|---|---|
| `bridge inbox` is now "List incoming identity mail across currently authorized Spaces". It has **no `--all-spaces`** (`unexpected argument`), and without `--agent-context` refuses with plain text `error: Select your approved Agent Context for the identity inbox`, even under `--json`. | VERIFIED |
| The plugin's skill: "A compatible identity inbox without Space selectors reads all currently authorized Spaces and labels each message with its Space. Follow returned message references and literal open/reply argument vectors; reply retains the original Space." Strings name `open_args` and `reply_args_prefix` on each entry, and new errors: "Select the original Agent Context to open or reply", "Identity inbox cursor no longer matches this Context or Space roster; restart the inbox". | DOCUMENTED, VERIFIED (strings) |
| `bridge contacts` without a Space selector now groups **one contact per identity** across Spaces; "Sending resolves that identity in the sender's current Space"; `--all-spaces` keeps the old per-Space view. A new card kind `identity_contact`. | DOCUMENTED (help), VERIFIED (strings) |
| Native session mail "remains separate from the identity inbox". `bridge session … inbox` still *receives and acknowledges* one page (`--limit`, `--after-sequence`); session help is unchanged. | DOCUMENTED (plugin README), VERIFIED (help diff) |

**Ducter's switch misses it.** `wideInboxIn()` (core `bridge-link.ts`) and `canWait()` (partner `bridge.ts`)
look for `--all-spaces` in `inbox --help`. On 0.10.121 Ducter stays "not wide": it keeps one context per Space,
each of which now reads the same identity mail (INFERRED: duplicates, and every message labelled with its
place's Space instead of the Space Mem names, so the Log's `space`, D338's "may not reach" and the reply's
context can be wrong). Per-Space contexts made by `agents context select` may not count as "approved" for the
identity inbox at all (INFERRED; the plain-text refusal above is what it would look like).

## 3. Long-poll (D335): Ducter's 25-second wait is refused

| Fact | Tag |
|---|---|
| `inbox --wait <1..=5>`: "Wait up to five seconds for an incoming change, without consuming mail". `--wait 25` → `bad_arguments`, "25 is not in 1..=5". | VERIFIED |
| `inbox --watch`: "Observe incoming changes continuously as JSON lines; never acknowledges mail". Both refuse Space selectors ("Use the identity inbox without Space selectors for --wait or --watch"). | DOCUMENTED, VERIFIED |
| Ducter's `canWait()` is true on 0.10.121 (not wide, help has `--wait`), `WAIT_S = 25`, so every long-poll fails at once and is retried every 10 minutes (`WAIT_RETRY_MS`); the minute check keeps mail flowing, so nothing is lost, only calls wasted. Live on any machine already on 0.10.121, this Mac included. | VERIFIED (code + parse), INFERRED (live effect) |

## 4. Paging and order (D367, B18)

No change visible: `inbox` keeps `--cursor`, the help still says nothing about order or an unread filter, and
the new cursor error says an identity cursor is bound to the Context and Space roster (restart on change).
D367's "every page, at most 25, stop on a failed page" still fits; a cursor error should restart from page one.
VERIFIED (help, strings), INFERRED (order unchanged; only a live read shows it).

## 5. Other changes

| Change | Ducter use | Tag |
|---|---|---|
| `--agent-context` forms (D369): unchanged, both `--x v` and `--x=v` parse; `send_args_prefix` still returned. | Nothing to do. | VERIFIED |
| `session prepare`: help unchanged; `preparation_incomplete` ("Registration confirmed; preparation is incomplete and readiness is unverified") already existed in 0.10.120. Session `status` gains `notices_configured`, `read_only`, `client_version`. | The trial can read `session status` (read-only, "without preparing, repairing proof, sending or receiving") before `prepare`. | VERIFIED |
| `bridge connections connect --device-label`, `connections list --include-activity` (advisory created/last-seen per device; "a stable private home correlation"). #10402's device-label ask. | Label each home and worker's connection with its device name; Settings may later say which device holds a connection. Never proof of reach (DOCUMENTED). | DOCUMENTED |
| `bridge notices`: approved Bridge setup writes local subscriptions; the Mem app (or `notices watch`, a foreground service) observes them, writes local caches for the plugin's UserPromptSubmit/PostToolUse/Stop hooks (no network inside the hooks) and sends OS notifications for idle sessions; "Identity mail produces one chooser notice by default". | Two effects: (a) tasks that carry Mem's plugin (D393) may be reminded of Bridge mail inside a task; (b) **the person may get a Mem OS notification for mail Ducter's partner already handles** — a second voice for one event (INFERRED; whether Ducter's connection writes a subscription is not shown). | DOCUMENTED, INFERRED |

## 6. Plan

**(a) Change in Ducter now (all testable with the fake; no live Mem):**
1. *Wide by the help's words.* Treat "identity mail across currently authorized Spaces" (or `--watch`) in
   `inbox --help` as wide: one read, `inbox` with the approved context and no Space flag; the Space from each
   entry; drop per-Space contexts. Keep `--all-spaces` detection for any older build. Fake gains a 0.10.121
   shape (entries with `space`, `open_args`, `reply_args_prefix`).
2. *Open and reply by Mem's argv* when an entry carries `open_args`/`reply_args_prefix`; keep the context of
   the read. Body still through `--body-file -`.
3. *Long-poll:* `inbox --watch` as one supervised child per approved context when offered (restart with
   backoff; JSON lines only trigger the usual check); else `--wait` clamped to the range the help states
   (5 s); never 25 on a CLI that refuses it.
4. *Plain-text refusals* ("Select your approved Agent Context…", the identity-cursor error) mapped: the first
   to `not_configured`, the second to "restart from page one".
5. *Contacts:* try the grouped default first (one card per identity), fall back to `--all-spaces`.
6. *Connect with `--device-label`* (the device's name) when offered.
7. *Notices:* after connect, read `bridge notices status --json` (local only); if Mem is set to notify the
   person for Ducter's identity, say it in the decision proposal (§c asks how to turn that off per binding).
These go through the change loop as one decision (suggested D399; next free number at merge).

**(b) The live trial, with the author's go** (`NMEM_CLI_PATH` = nmem 0.10.121):
1. `nmem --agent-context <peer ctx> bridge inbox --json` once — *writes nothing* (0.10.120's help said a read
   "refreshes outgoing read status"; 0.10.121 no longer says so). If 409 `…unreconciled` persists, stop: still
   Mem's. Optionally `nmem bridge session --host claude-code --session-id <id> status --json` (read-only).
2. `bun run bridge:live -- --connected` — read-only preflight, writes nothing.
3. `bun run bridge:live -- --connected --real` — writes, all removed at the end: one throwaway identity
   `ducter-trial-<stamp>-<hex>` (`agents enroll`), its connection in Only me (`connections connect`, with a
   device label once (a)6 lands), a native-session binding for the peer (`bridge session … prepare`, which
   registers that session with Mem), and the S1–X1 messages between them (sends, opens marking read,
   replies). The peer's own mailbox keeps the trial's messages; they are not deleted.
4. `bun run bridge:live -- --cleanup` only after a crash.
If step 1 is still stuck, a fallback that measures Ducter's side alone: the peer as a second throwaway identity
instead of the author's native session (needs a small trial change; S2's "your terminal Claude" wording is then
not what is tested).

**(c) To the Mem team (Weizhen), if still blocked** — not posted:

> Weizhen 你好，Ducter 这边在接 Bridge，碰到一个读不了信箱的问题想请教：
> 一个原生 Claude Code 会话（`bridge session --host claude-code … prepare` 之后）的信箱，`nmem bridge inbox` 一直返回
> 409 `cloud_mailbox_own_source_unreconciled`（"Mailbox source authority requires reconciliation before
> browsing"，`retryable: false`）。同一个信箱几小时前还能正常读，中间只做过 open 旧消息和 reply 一条。
> 0.10.120 和 0.10.121 的 CLI 里都没有对应的处理命令。想确认三点：
> 1. 什么会让一个信箱进入这个状态？是服务端会自己理顺，还是需要用户/客户端做什么？
> 2. 如果需要操作，有没有（或计划有）一个命令，比如 `bridge … reconcile`？
> 3. 读操作被拒时能否返回 `outcome_unknown: false`（读不改变任何东西）？
> 另外两个小问题：0.10.121 的身份收件箱是否已经就是 #10402 的"一个身份一个收件箱"（我们打算以 help 文案识别）；
> 以及 Ducter 的连接如果写了 notices 订阅，Mem 桌面端会不会对同一封信再给用户发系统通知、能否按连接关掉。
> request id 和完整返回我们这边都留着，需要的话发你。谢谢！

## 8. The read-only live read (2026-11-19, D400)

Run once, with the author's `/usr/local/bin/nmem` 0.10.121, after (a) was built; nothing opened, acknowledged,
replied, sent, prepared, enrolled or reconciled. The peer is the native Claude Code session the 2026-11-18 trial
bound (its context from that run's recorded `session prepare`). Outputs kept outside git; ids not repeated here.

| Fact | Tag |
|---|---|
| `bridge session --host claude-code --session-id <that session> status --json`: exit 0, `state: "diagnostic"`, `read_only: true`, `client_version: "0.10.121"`, `context_state: "required"`, `backend_state` / `proof_state: "not_checked"`, `delivery_ready: null`. | VERIFIED |
| `--agent-context <peer ctx> bridge inbox --json`: **exit 0** (no longer the 409). Top level: `messages`, `spaces`, `next: null`, `incomplete: true`, `coverage_scope: "current_space_batch"`, `outcome_unknown: false`, `identity` (the session's agent id). | VERIFIED |
| `spaces[]`: 8 Spaces, each `{space_id, status, next_cursor, outgoing}`; 7 `observed`, the personal one `{status: "unavailable", error_code: "cloud_mailbox_own_source_unreconciled"}`. So the stuck state persists for that one Space; the identity inbox reads around it. | VERIFIED |
| One entry: `message` (a uuid), `mine: null`, `state: "expired"`, `eligible: false`, `expires_at_ms`, `sequence`, `space_id` (an id only, no label), `reference` (`bm1:…`), `open_args` and `reply_args_prefix` = `nmem --api-url=<Mem> --agent-context=<ctx> bridge open|reply <reference>`. No sender on the entry. | VERIFIED |
| Per-Space `next_cursor` beside a top-level `next: null`: how a long multi-Space inbox pages on is not shown by one short read. | INFERRED (open) |

What changed in D400 because of it: Mem's argv already ends in the reference (Ducter adds nothing after it), an
entry with `eligible: false` is never opened, a Space `unavailable` with D369's code keeps D369's line while the
rest are read, labels come from passive `setup`, and the trial's preflight stops on that Space (its mail lives
there). The fake answers in this shape at 0.10.121.

## 9. The live trial (2026-11-20, D409)

`bun run bridge:live -- --connected --real`, run by the coordinator with the author's go: nmem 0.10.121 against
Mem Cloud, haiku on both sides, the trial's own identity connected in Only me, the peer a native Claude Code
session bound by `session prepare`; 873 s. Transcript and every call's raw output are outside git
(`~/dev/ducter-evidence/bridge/live-2026-11-20T01-30-55-761Z-trial-haiku.md`, `raw-…/`); ids are not repeated
here. **Result: FAIL, S1 0/4, S2 0/5, S3 1/3, X1 0/3.**

**What Mem did** (every fact read in the raw output):

| Fact | Tag |
|---|---|
| The peer's personal Space now reads: all 8 Spaces `observed`, no `cloud_mailbox_own_source_unreconciled` (§8's stuck Space is clear). | VERIFIED |
| Call times (argv written at start, answer at end): the trial's identity inbox **45, 52, 52 and 48 s**; the peer's first page 41 to 50 s, its second 7 to 15 s; `contacts --query` 31 to 40 s; `send` 9 to 15 s; passive `setup` 2 s; `connections connect` 4 s. | VERIFIED |
| Passive `setup` with the trial's connected context: `state: "enable_needed"`, the identity under `endpoint.address` ("Enable explicitly to reuse its mailbox; no credential will be created"). Its inbox read works all the same (the next row). Whether `open` and `reply` need `--enable` is not shown: none ran. | VERIFIED, open |
| The peer's message to the trial was in the trial's inbox at the first check after it: one entry, `mine: true`, `state: "pending"`, `eligible: true`, `expires_at_ms` (7 days after the send), `sequence: 1`, `sender {actor_id, member: "Member <id>", agent: "Bridge agent", agent_id}`, `in_reply_to: null`, `space_id: "default"`, `reference` and Mem's `open_args` / `reply_args_prefix`. | VERIFIED |
| It is in **"Before the team"** (`default`), not Only me where the trial is connected: plain `contacts` answers both `cards[]` (one per Space, `bc1:` handles, each with its `space` and the grouped `identity_contact`) and `contacts[]` (one per identity, a `bi1:` handle, `spaces[]`, `send_args_prefix`), and the peer took the first per-Space card. | VERIFIED |
| Our sent mail's read status is no longer at the top: each `spaces[]` entry carries its own `outgoing` (`{message, status, read_recipients, recipients}`). | VERIFIED |
| Paging: the top-level `next` is a `bip1:` cursor (the Space roster and the Spaces still pending); each Space has its own `next_cursor`; a later page lists only the Spaces with more, and `incomplete` is true until the last page. | VERIFIED |
| The peer's mailbox (26 older entries from the person's own partner, `ducter`, all `state: "pending"`, plus one expired): page 1 shows the personal Space's `sequence` 1 to 20, page 2 shows 26 and 27; **21 to 25 are on no page**, the same on three reads. Hidden by design (acknowledged, archived) or lost at the page boundary is not shown. | VERIFIED (the gap), open (why) |
| The peer's first two sends failed on its own argv (an inline body Mem couldn't confirm; a `--resolved-space-id` it took from an old hint); the third went (`delivered`, `queued`). | VERIFIED |

**Why each scenario failed:**

1. **Ducter never saw its mail (S1, X1).** Its client gave every nmem call 20 s; the identity inbox takes about
   50 s, so every read was killed. The start mark (B14) read at startup was killed, so each later check tried the
   mark again and that read was killed too: the raw output has exactly one `inbox` per check and never an `open`
   or a `setup` for the member. Nothing in the inbox's shape, Space, paging or `enable_needed` was the cause;
   the entry parses as the person's own agent's request (`mine`, its Space, Mem's argv). VERIFIED (raw output,
   and the fake replays it: `packages/partner/test/bridge-live-replay.test.ts`).
2. **The partner told the person to /exit their terminal (S2, S3).** For "问一下我终端里那个 Claude…" haiku looked
   in the person's own records (`own_session_find`, on the author's Mac), found a Claude Code session open in
   ~/dev/ducter, tried to carry it on (`own_session_continue`, refused: still open) and relayed D376's refusal.
   It never called `bridge_contacts` (no `contacts` with the trial's context in the raw output). The persona's
   rule 2d named own sessions for "接着我终端里那个 Claude 在做的" and nothing for asking one. The eval reproduces
   it once the conversation and records look like the run's (1 of 6 before the change, 6 of 6 after). VERIFIED.
3. **The peer never reached the newest mail (all).** The harness counted right: "this run's on none yet" is true,
   because Ducter sent nothing (1 and 2). The peer paged to the end each time (two pages). The gap in
   `sequence` above is Mem's to explain; it did not hide anything of this run. VERIFIED (harness), open (gap).

What changed in D409: a 120 s limit per call, our sent mail's read status from `spaces[].outgoing` (and kept
across pages), the trial's start mark read before the terminal's first turn and its tee killing the real nmem
when a call is given up; rule 2d says asking one of the person's agents, even one open now, is
`bridge_contacts` then `bridge_send`, and both own-session tools say so for an open session while Bridge is on.

## 10. The second live trial (2026-11-20 02:58 UTC, D411)

The same command with D409 merged, run by the coordinator: nmem 0.10.121, Mem Cloud, haiku both sides, the
trial's own identity in Only me, the native Claude Code peer; 868 s. Transcript and raw output outside git
(`~/dev/ducter-evidence/bridge/live-2026-11-20T02-58-35-651Z-trial-haiku.md`, `raw-…/`, 50 calls). **Result:
FAIL, 10/17 (S1 4/6, S2 2/5, S3 2/3, X1 2/3), against §9's 1/15.**

**What now works** (VERIFIED, raw output): the identity inbox read finishes inside the 120 s limit (39, 45 and
44 s); the terminal's request is opened (`open` 12 s) and the partner asks with one card; Go opens one task, and
the claim (`reply` 13 s) and the result (7 s) go back, each linked (`in_reply_to` the request) and on page 1 of
the peer's mailbox; for "问一下我终端里那个 Claude…" one send card and one send (D409's rule 2d held); X1's question
is opened, carded with the agent as asker, and the answer goes back by code; Mem marks originals
(`in_reply_to: null`).

**What Mem did:**

| Fact | Tag |
|---|---|
| `open` and `reply` work for a connection passive setup reports as `enable_needed`: no `--enable`, 4 to 13 s each (§9's open question). | VERIFIED |
| Ducter's mail in the peer's inbox: `mine: true` (same member: the person owns both identities), `state: "pending"`, `eligible: true`, `sender.agent_id` the trial's, `in_reply_to` the message it answers, `space_id: "default"`, a `bm1:` `reference` and `open_args` / `reply_args_prefix` that carry it. | VERIFIED |
| The personal Space's `sequence` 21 to 25 are on no page again (page 1: 1 to 20, page 2: 26 and 27; page 1 also carries the other Spaces' entries, so it holds 23 to 26 messages). | VERIFIED (the gap), open (why) |
| One `contacts --query` (and its `--all-spaces` retry) answered `/spaces returned 500: … terminating connection due to administrator command`: a database restart on Mem's side. Ducter fell back to the sender that wrote (its request), and the send went once. | VERIFIED (the error), INFERRED (transient) |

**Why each check failed:**

1. **The terminal never opened Ducter's mail (S1 ✗, X1 ✗; S2's three ✗ follow).** The trial's. The peer read
   both pages, found Ducter's entries by `sender.agent_id`, and opened the way Mem's own `open_args` say: by the
   `bm1:` reference. The trial's guard (D367) allows only the message ids Ducter's sends returned (`message`), so
   it refused every open: 5 refusals, and no peer `open` in the raw output. With nothing opened the peer never
   answered S2's question, so Ducter had no answer to link or tell. The peer also read `mine: true` as "copies of
   my own mail". VERIFIED (raw output: the entries, the allow list's ids, no peer `open`); the refusal text itself
   is in the transcript, the guard's log went with the scratch directory. Fixed: the guard and the "did it open"
   check take the message id out of a `bm1:` reference and accept `--agent-context=<ctx>`; the peer is told what
   `mine` means. Not Mem's: the reference is documented as the thing to open by.
2. **The card named the person to himself (S1 ✗).** Ducter's. 「你的另一个 AI（Weyl 那边的 Claude Code）请你帮忙…」:
   the request's first line is "Task (from Weyl, via Claude Code in ~/dev/ducter)", Mem's sender names no member
   ("Member <id>"), so D108's check had nothing to compare and haiku kept the name despite the framing's "never
   by the user's name". VERIFIED. Fixed: names an own agent's first line attributes the request to, and the
   persona identity's, refuse the card ("write 你 / you").
3. **Said again an hour later (S3 ✗).** Ducter's. S2's and S3's questions both went to the silent terminal; D110
   said one line per message, one per moment, so S2's came at 2 h 5 min and S3's an hour later. VERIFIED
   (transcript). Fixed: one line per agent, covering each of its unanswered messages.

**Owed to Mem (draft, not sent):** the `sequence` gap (third time); and, as a suggestion, that `mine` reads as
"I sent it" to an agent: a field or doc line saying it means "the same member" would have saved the peer's
misreading.

## 7. Implications for Ducter

1. 0.10.121 does not unblock the trial; Mem's server might. One read-only inbox read decides it.
2. #10402 shipped as the default `inbox`, not `--all-spaces`; Ducter's switch must read the help's words, or it
   double-reads and mislabels Spaces on any multi-Space identity.
3. D335's 25 s wait is refused; `--watch` is the real long-poll, `--wait` tops out at 5 s.
4. Mem now owns arrival notices for agent sessions; Ducter must not end up as a second voice for the same mail.
5. (§9) The identity inbox is slow: about 50 s per read with eight Spaces. A client limit has to be sized to Mem's
   measured pace, not to a guess, and a check must survive one that long.
6. (§9) Asking a session that is open now is Bridge's job; carrying one on is the own-session path's, only once
   it is closed. The persona has to say which, in the person's words for each.
7. (§10) Mem's argv names a message by its `bm1:` reference; anything that tracks "which messages are ours" by id
   (the trial's guard) has to map the reference, or a real session following Mem's argv is locked out.
8. (§10) Mem names no member, so the person's name reaches Ducter only in their own agents' words; the card check
   has to look there.

## Summary

nmem 0.10.121 adds no way out of `cloud_mailbox_own_source_unreconciled` (same code, same text, no reconcile
verb; local read refusals now say `outcome_unknown: false`). It does ship #10402's identity inbox: `bridge inbox`
with an approved context reads every authorized Space and labels each message, with `open_args` and
`reply_args_prefix`, but without the `--all-spaces` flag Ducter's switch waits for; contacts group one card per
identity. `inbox --wait` exists but only 1–5 s, so Ducter's 25 s long-poll is refused on this Mac's 0.10.121;
`inbox --watch` streams changes. New `bridge notices` lets the Mem app and plugin hooks remind sessions and the
person of mail. Proposed: detect the identity inbox by its help text, use Mem's open/reply argv, long-poll via
`--watch` (or `--wait 5`), label connections by device, check notices; rerun the trial after one read-only inbox
read shows the mailbox is clear; Weizhen's message drafted. The live trial of 2026-11-20 (§9) failed every scenario for two reasons on
Ducter's side: a 20 s limit on calls the identity inbox answers in about 50 s, and a persona that sent "ask my
terminal Claude" down the own-session path, which refuses an open session; both fixed (D409). Mem's side: a
`sequence` gap across pages to explain, and whether `open`/`reply` need `--enable` after `enable_needed`. The rerun
(§10) scored 10/17: Mem's whole round trip works (and `open`/`reply` need no `--enable`); what failed was the
trial's guard refusing the peer's opens by Mem's `bm1:` reference, a card that named the person from the
request's own words, and a second follow-through line about the same silent agent (all fixed, D411); the
`sequence` gap is still Mem's.
