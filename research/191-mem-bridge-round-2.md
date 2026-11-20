# 191 · Nowledge Mem and Bridge, round 2: what nmem offers now, what Ducter took, what Mem is asked

> 2026-11-21 · Feeds D444 · Read only: `nmem --version`, `nmem --help` and the `--help` of `bridge` (every
> subcommand), `bridge session` (status, prepare, send), `bridge notices`, `feed`, `feed inbox`, `feed reviews`,
> `resources get`, `memories` (add, list, forget, identity), `threads`, `mailbox` (cloud, session, readback,
> probe, read-reference, inbox), `collab` (create), `artifacts`, `labs`; and `strings` over the binary for the
> message-reference shapes. Nothing was sent, registered, connected, prepared, subscribed or written to the real
> Mem or Bridge; `~/.nowledge-mem` was not touched. Builds on research/183 (the same version, read a day earlier)
> and research/161.

## 0. What is installed

| Fact | Tag |
|---|---|
| Still `nmem 0.10.121`: the Mem app's own Rust CLI (`/Applications/Nowledge Mem.app/…/rust-backend/nmem`, 43.8 MB, built 2026-11-19), reached through `~/.local/share/nowledge-mem/bin/nmem-wrapper`; the app's Info.plist says 0.10.121 too. Nothing newer than research/183's read. | VERIFIED |
| Stale-snapshot note: the verbs research/183 listed are unchanged; this read went one level deeper (the `mailbox` and `collab` groups and the reference shapes), which research/183 did not cover. | VERIFIED |

## 1. New to Ducter in the same binary (not new in Mem)

| # | Capability | What the help or binary says | Tag | Worth to the person |
|---|---|---|---|---|
| 1 | `bridge contacts` with no Space selector | "Without a Space selector, group one contact per identity across authorized Spaces. Sending resolves that identity in the sender's current Space." Cards carry `mailbox_available` (research/161) | help VERIFIED; card fields INFERRED (161) | **Does Mem itself list my agent's mailbox as open?** A plainer proof of reach than "its plugin is in" |
| 2 | Typed message references | `--reference`: "A complete typed KnowledgeReference JSON value. Repeat as needed; never copies content"; the binary's struct is `KnowledgeReference { uri, purpose, origin }`; `mailbox read-reference --reference-file`: "Read one needed Memory or Source reference without claiming or acknowledging mail" | flag VERIFIED; fields INFERRED (strings) | **A handoff that carries a file or a memory**, not only words |
| 3 | `resources get <nowledgemem://…>` | "Resolve one stable Nowledge resource URI and print its body"; `--frontmatter`, `--space`, `--agent-id` | VERIFIED (help); output shape unknown | The partner can read what another agent pointed at, read only |
| 4 | `--shared-document` on `bridge send/reply` | "Attach a complete collaboration DocumentRef JSON as an inert message card" (`collab` documents: `--kind plan|notes`, `--title`) | VERIFIED (binary strings); DocumentRef fields INFERRED | A plan handed over; reading it needs `collab join`, which writes a local replica (not read only) |
| 5 | Delivery state of a sent message | `mailbox session readback`: "Inspect recipient state using the original send operation"; `mailbox cloud`: "Query current delivery states for one saved original send; never resend" | VERIFIED (help) | **已读 / Read** at last, but only on the `mailbox` path (a native session's or a Cloud Agent's own send), not on the `bridge` verbs Ducter sends with |
| 6 | `mailbox probe --native-session` | "Inspect pending mail without registering, receiving or acknowledging it" (`--host codex|claude-code --session-id`) | VERIFIED (help) | Whether a native session has mail, without touching it |
| 7 | `feed inbox` / `feed reviews` | "Show the bounded Feed inbox without opening the app"; "unresolved Memory reviews, newest first"; `feed --days N --type` | VERIFIED (help); shapes unknown | What Mem saved or wants reviewed; overlaps D321's glance |
| 8 | `memories identity` | people as grounded identities (`profiles`, `show`, `correct`); `draft-cards`/`save-card` behind Mem's Labs flag | VERIFIED (help) | A "people" group on the Memory page, later (research/183 already: Labs, per Space) |
| 9 | `bridge session send --to <public native-session contact>` | the sender must itself be a native session (`--host`, `--session-id`) | VERIFIED (help) | "Ask *that* terminal session": needs Ducter to be a prepared native session, which D333 keeps it from |

## 2. What D444 takes, and why these

Picked by the person's value, needing no change from Mem:

- **(1) Contacts grouped per identity back 能找到{name}的.** One `bridge contacts` (no query, no Space selector)
  when the pane was looked at and the last read is over 30 minutes old, in the background (31 to 40 s,
  research/161 §9), never per view. The person's own cards, by tool; `mailbox_available: false` (or
  `unavailable`) reads as closed. A tool Mem lists as open is "can reach" even before Mem's plugin check says so;
  one listed closed says so: **能找到{name}，但它在 Nowledge Mem 的信箱没开，{name}找不到它**.
- **(2)+(3)+(4) A handoff that carries something.** An incoming message's `nowledgemem://` addresses (in its words
  or among its typed references) are resolved once, read only (`resources get`, at most two, 10 s each); the
  partner sees Mem's title and first 600 characters as data under the message; the line shows the title in place
  of the address, or **附了「…」**. A shared plan's card is named only (`collab join` would write a replica).
- **Mem in the person's day** (not a new capability; the gap was Ducter's own): the 记下了 line was folded inside
  Details; now it shows once under the reply with **别记这个**; saying 别记这个 takes it back at once; "你都记得我些
  什么？" is answered from what Mem knows about the person (`m list --unit-type`, D321's rule), warm and short.

Not taken, each with why: **(5) 已读** (only on the `mailbox` path; Ducter sends with `bridge send/reply`, whose
outbox carries no recipient state: asked of Mem, §asks 1); **(6)/(9) native sessions** (Ducter would have to be a
prepared native session, D333; and a session's agent is named "Bridge agent", D418: asked, §asks 3); **(7) feed**
(D321's glance already says what is new; a second source of "this week" would disagree with it); **(8) people**
(Labs, per Space); **`collab`** (writes a local replica; a read-only `collab read` of a document one was handed
would let the partner read a shared plan: asked, §asks 4).

## asks

For Mem (for Weizhen; a draft, not sent). Research/183 §4's four, updated, and D418's six, merged:

1. **Read receipts on the `bridge` path.** `mailbox session readback` and `mailbox cloud original` return delivery
   states; `bridge outbox`/`inspect` (what a client that sent with `bridge send/reply` holds) return only
   `{operation, phase}`. The same `read_recipients` / `delivered` there would let Ducter say **已读** honestly.
2. **`connections list --include-activity`**: is `last_seen_at_ms` the field, at the connection's top level, and
   does `activity_available: false` mean never seen or not shared? (183 §4.1, still open.)
3. **A native session's own name.** Cards and senders of a native session say "Bridge agent"; its host and a
   session title on the card would let a person say "问问我终端里那个 Claude" and be understood (D418 §6).
4. **A read-only look at a shared document one was handed**, without `collab join` writing a replica: the
   partner could then read the plan an agent attached, as it now reads a `nowledgemem://` resource.
5. **`resources get --json`'s shape**: title and body field names (Ducter reads `title`, `frontmatter.title`,
   `body`, `content`, `text` tolerantly), and whether a `KnowledgeReference` inside a received message is under
   `references` on `bridge open`'s answer.
6. **`bridge contacts` (grouped) speed**: 31 to 40 s on a wide identity; a first page in seconds, or a
   `--mine` filter for the person's own agents, would let the reach rows be fresh when the pane opens.
7. **Bridge in the Antigravity and pi plugins** (and Cursor's): the same `bridge` skill as Claude Code's (183 §4.3).
8. **A thread link**: `nowledgemem://` for a thread id, so 在 Nowledge Mem 里打开 opens the conversation (183 §4.4).
9. From D418, still open: a reply's refusal with `error_code` and `outcome_unknown: false`; `reply_to` and a body
   hash on each outbox op; the identity inbox's 45 to 52 s first page; `sent_at` on an open message; the personal
   Space's paging gap.

## Implications for Ducter

1. Read Mem's contact list only when the person looks, and say only what it changes (a mailbox open or closed).
2. Resolve a handed-over reference once, read only, and keep only its title for the line; its words are data.
3. A memory's moment is when it is kept: show it then, once, with the way to take it back, in words as well as a tap.
4. "What do you know about me" is a question about the person, not a search for "me": answer from what Mem holds
   about them, by D321's rule, in a few warm lines.
5. Leave 已读, native sessions, `collab` and `feed` until Mem answers §asks.

## Summary

The installed nmem is still 0.10.121; nothing in it is newer than research/183's read, but a deeper read found the
`mailbox` group's delivery readback, typed `KnowledgeReference`s, `resources get` and shared-document cards. D444
adopts the grouped contact list for the reach rows (read when looked at, at most every 30 minutes), resolves what a
handoff hands over (read only, named by title), and makes Mem visible in the person's day (the kept line once, 别记
这个 by word or tap, "你都记得我些什么？" from Mem). Shapes behind contacts' mailbox fields, references and
`resources get` are INFERRED from help and strings; a live read-only check is owed. Nine asks for Mem are drafted.
