# 183 · Nowledge Mem and Bridge in nmem 0.10.121 (the app's Rust CLI): what Ducter doesn't use yet

> 2026-11-20 · Feeds D433 · Read only: `nmem --version`, `nmem --help`, `nmem bridge --help` and every
> subcommand's `--help`, and `strings` over the binary. Nothing was sent, registered, connected or written to the
> real Mem or Bridge; `~/.nowledge-mem` was not touched. Builds on research/161 (the 0.10.121 Bridge read from
> the PyPI copy and the live trials), research/66 §10 (which plugins carry Bridge), research/138 (`t search`).

## 0. What is installed

| Fact | Tag |
|---|---|
| `nmem 0.10.121` on the author's Mac is the Nowledge Mem app's own copy: `~/.local/share/nowledge-mem/bin/nmem-wrapper` execs `/Applications/Nowledge Mem.app/Contents/Resources/_up_/rust-backend/nmem` (43.8 MB, 2026-11-19), whose help opens "Nowledge Mem CLI (Rust). Talks to the Mem REST backend." The app is 0.10.121 too (Info.plist). | VERIFIED |
| Beside it in the bundle: `nmem-server`, `nmem-tui`, `nmem-hawdb-operator`, `nmem-legacy-graph-reader`, `browse-now`, `cloudflared`. | VERIFIED |
| The Rust CLI's verbs match research/161's PyPI 0.10.121 for Bridge; the CLI as a whole is wider than what Ducter calls (below). Stale-snapshot note: research/161 read the PyPI copy; this read is the app's Rust binary of the same version. | VERIFIED |

## 1. What Ducter calls today (grep of `packages/{core,partner,runner,protocol}/src`)

`m search/add/supersede/archive/show/forget/update`, `t search`, `t save --from` (D417), `context` (D417, the
persona), `working-memory read` (D368), `agents show/enroll/set/context show/select`, `plugins inspect` (D169),
`doctor` (D375), `status`, `connect` (D225/D366), `bridge setup`, `bridge connections connect/list/revoke`,
`bridge notices status`, `bridge contacts [--all-spaces]`, `bridge inbox [--watch|--wait]`, `bridge open`,
`bridge reply`, `bridge send`, `bridge outbox`, `bridge inspect`, `bridge resume`.

## 2. Capabilities Ducter doesn't use, and what each could give the person

| # | Capability | What the help or binary says | Tag | Worth to the person | Ducter |
|---|---|---|---|---|---|
| 1 | `bridge connections list --include-activity` | "Include advisory device activity in the version two JSON presentation"; struct fields beside it in the binary: `created_at_ms`, `last_seen_at_ms`, `home_id`, `device_label`, `activity_available` | help VERIFIED; field names INFERRED (binary strings, no live answer read) | **Is the computer that receives my partner's mail alive?** Today another home answering reads the same whether it ran a minute ago or is off for three days | **Adopted (D433):** asked when the list's help offers it (once per version), read tolerantly (`last_seen_at_ms` on the connection or under `activity`, only with `activity_available` not false), never guessed; another home quiet over a day says so on the pane |
| 2 | Read receipts on sent mail | `bridge open` "records this recipient's first read"; the binary carries `CloudImMessageState { created_at_us, … }`, `CloudImRecipientRead { recipient_actor_id, read_at_us }` and `delivered`, `read_recipients`, `recipients` | `open` VERIFIED (help); the state's fields INFERRED; which verb returns them (outbox? inspect? a message read?) unknown | **Did the agent I asked read it?** The step after D418's "sent or plainly not" | **Not adopted:** no verb is known to return it. Ask Mem (§4). Meanwhile D433 shows each outgoing message's own state (sending, being checked, not confirmed, didn't go) on Recently |
| 3 | `t search` returns `thread_id` (research/138) | each thread hit carries `thread_id`, `source`, `last_activity` | VERIFIED (research/138) | **Where did that answer come from?** D368 lets the partner use a past Codex conversation but no line says so (D304's 想起了 is for memories only) | **Adopted (D433):** a conversation gets a ref (`c1`), the reply may name it, the line says 想起了你 11 月 12 日和 Codex 聊的 |
| 4 | `bridge contacts` (no Space selector) | one contact per identity across Spaces; card fields include `member`, `agent`, `mailbox_available`, `unavailable`, `retry_args` | help VERIFIED; fields INFERRED | **Which of my agents can reach my partner now?** | **Partly:** the pane's new 能找到{name}的 reads the person's own agents from what Ducter already knows (Mem's plugin check per agent, their records, the last exchange), never a contacts call per page view (31 to 40 s each, research/161 §9). A contacts-backed "mailbox available" per agent is owed (todo) |
| 5 | `bridge session --host codex|claude-code --session-id … status/prepare/send/inbox/reply/recover` | collaborate with one native session; only two hosts | VERIFIED (help) | Ask *that* terminal session, not any Codex | Not adopted (unchanged since D333: Ducter never prepares a session; the person's plugin does). Bridge in a Ducter task's own session is a later step (todo) |
| 6 | `bridge notices subscribe/watch/unsubscribe/reset/status` | Mem's own arrival notices for host sessions | VERIFIED (help) | Mem tells the person's sessions about mail | D400 reads `status` only; unchanged |
| 7 | `bridge send/reply --shared-document <…>` | a shared document with the message | VERIFIED (flag); shape unknown | Hand over a plan, not only text | Not adopted (no shape; `collab` below) |
| 8 | `collab status/create/join/read/edit/sync/pending/notice/remove` | "Shared plans and notes with a durable, explicitly selected local replica" | VERIFIED (help) | A plan the partner and the person's Codex edit together | Not adopted (todo with its trigger) |
| 9 | `ask [--ephemeral] <question>` | "Ask a grounded question across Memories, conversations, artifacts, and graph" | VERIFIED (help) | One grounded answer instead of search + reasoning | Not adopted: the partner already reasons over `memory_search`; `ask` writes to Mem's Timeline unless `--ephemeral`, and a second answerer would fight the partner's voice |
| 10 | `feed [inbox|reviews|…] --days N` | "what was saved, learned, or ingested" | VERIFIED (help) | The Memory page's "this week" from Mem itself, every tool included | Not adopted; D321's glance reads `m list`. Candidate for the page (todo) |
| 11 | `resources get nowledgemem://…` | "Resolve stable nowledgemem:// references from handoffs and agent output" | VERIFIED (help) | A link in another agent's message the partner can open | Not adopted (todo: when a Bridge message carries one) |
| 12 | `tasks`, `schedules` | Mem's own in-flight and recurring AI Now work | VERIFIED (help) | Two schedulers the person may confuse | Not adopted (none of Ducter's business yet) |
| 13 | `threads capture`, `capture-status` | "Durably enqueue automatic session capture and return immediately" | VERIFIED (help) | D417's per-turn `t save` without a 3 s wait | Not adopted (D417 stands; a cheaper save is a later swap) |
| 14 | `fs recall` | semantic memory search returning FS paths | VERIFIED (help) | none over `m search` here | Not adopted |

## 3. Which agents can reach the partner (re-checked)

| Fact | Tag |
|---|---|
| Mem's plugins that carry the `bridge` skill: Claude Code, Codex, Grok Build; Cursor's has none. | VERIFIED 2026-11-18 (research/66 §10); not re-read today |
| `bridge session --host` takes only `codex` and `claude-code`. | VERIFIED (help) |
| Mem's Antigravity plugin 0.1.3 has ten skills (search, distill, thread save, handoff, working memory, status, skill load/manage/propose, FS explore): no `bridge`. | VERIFIED (research/172) |
| pi: Mem's `nowledge-mem-pi` is a memory plugin; no Bridge skill is known. | INFERRED (research/66 §10 lists none) |
| Any agent with nmem and an approved agent context can run the logical verbs by hand. | VERIFIED (research/66 §10) |

So the pane says, per tool the person runs: Claude Code and Codex **能找到{name}** (or one tap to put Mem's plugin
in); pi and Antigravity **它的 Nowledge Mem 插件还不会传话** (Mem's to add, not the person's to fix).

## 4. For Mem (for Weizhen; draft, not sent)

1. `connections list --include-activity`: is `last_seen_at_ms` the field, at the connection's top level, and
   what does `activity_available: false` mean (never seen, or not shared)?
2. Read receipts: which verb returns a sent message's `read_recipients` / `delivered`? A sender's
   `outbox`/`inspect` carrying them would let Ducter say **已读** honestly.
3. Bridge in the Antigravity and pi plugins (and Cursor's): the same `bridge` skill as Claude Code's.
4. A thread link: `nowledgemem://` for a thread id, so **在 Nowledge Mem 里打开** opens the conversation, not Mem's home.

## Implications for Ducter

1. Read `--include-activity` behind the help's word; show only when Mem says, and only what it changes (an away home).
2. Say every outgoing message's state where the person looks for it (Recently), not only the ones that went.
3. Name the past conversation an answer leaned on, like a memory; the conversation stays the tool's (no forget).
4. List the person's agents by whether they can reach the partner, honest that two plugins can't yet.
5. Ask Mem for the four items in §4; leave `ask`, `feed`, `collab`, `resources` and native sessions in `todo.md`
   with their triggers.

## Summary

The installed nmem is the Mem app's Rust CLI 0.10.121. Against research/161, nothing in Bridge's verbs is new; what
is new to Ducter is what it never adopted: device activity on connections (`--include-activity`), read-receipt
fields in the binary (no verb known to return them), `thread_id` on thread hits for a source line, grouped contacts,
native sessions, notices, shared documents, `collab`, `ask`, `feed`, `resources`. D433 adopts activity (an away
home said plainly), the outgoing state on Recently, a 想起了 line for a past conversation, and 能找到{name}的 (which
of the person's agents can reach the partner, with pi and Antigravity honestly "can't pass messages yet"). Field
names behind activity and receipts are INFERRED from strings; a live read-only check is owed.
