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

## 7. Implications for Ducter

1. 0.10.121 does not unblock the trial; Mem's server might. One read-only inbox read decides it.
2. #10402 shipped as the default `inbox`, not `--all-spaces`; Ducter's switch must read the help's words, or it
   double-reads and mislabels Spaces on any multi-Space identity.
3. D335's 25 s wait is refused; `--watch` is the real long-poll, `--wait` tops out at 5 s.
4. Mem now owns arrival notices for agent sessions; Ducter must not end up as a second voice for the same mail.

## Summary

nmem 0.10.121 adds no way out of `cloud_mailbox_own_source_unreconciled` (same code, same text, no reconcile
verb; local read refusals now say `outcome_unknown: false`). It does ship #10402's identity inbox: `bridge inbox`
with an approved context reads every authorized Space and labels each message, with `open_args` and
`reply_args_prefix`, but without the `--all-spaces` flag Ducter's switch waits for; contacts group one card per
identity. `inbox --wait` exists but only 1–5 s, so Ducter's 25 s long-poll is refused on this Mac's 0.10.121;
`inbox --watch` streams changes. New `bridge notices` lets the Mem app and plugin hooks remind sessions and the
person of mail. Proposed: detect the identity inbox by its help text, use Mem's open/reply argv, long-poll via
`--watch` (or `--wait 5`), label connections by device, check notices; rerun the trial after one read-only inbox
read shows the mailbox is clear; Weizhen's message drafted.
