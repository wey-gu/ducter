# 200. Mem and Bridge shapes, checked live and read-only (D461)

Date: 2026-11-22. Follows research/183 (D433), research/191 (D444) and research/199 (D458). Question:
several Mem and Bridge features were built against shapes INFERRED from `nmem` help text and the
binary's strings. Do the real answers have those fields, where, and do D458's Mem queries for 记得的 /
Remembered offers return anything usable?

**Method.** The installed `nmem 0.10.121` on the author's Mac, against the author's real Mem (a team
server, 13 Spaces, 14 Agents). Strictly read-only: every command's `--help` was read first, and only
commands that list, search, show or resolve were run (`status`, `spaces list`, `agents list`,
`agents context show`, `bridge connections list [--include-activity]`, `bridge contacts`,
`bridge inbox`, `bridge outbox`, passive `bridge setup`, `memories list/search`, `threads list/search`,
`working-memory read`, `artifacts list`, `resources get`). Never `bridge open` (its help: "record this
recipient's first read", a write), `send`, `reply`, `connect`, `register`, `collab join`, `m add` or
any acknowledge. Every answer was saved to the session scratchpad and printed only as its *shape*
(field names, types, string lengths and enum values); no id, name, email or text reached this
report or the repo. Ducter's own parsers were then run over the saved answers, printing counts
only. `~/.ducter`, Ducter's server, the other home (hel) and Mem's config were not touched.

## 1. `bridge connections list --include-activity` (D433)

| | Inferred (research/183) | Live (VERIFIED) |
|---|---|---|
| Presentation | "version two" | `schema_version: 2` with the flag, `1` without |
| `activity_available` | on each connection (or under `activity`) | **once, at the top of the answer** (`true`), beside `outcome_unknown` and `metadata_available` (booleans) |
| Per connection | `last_seen_at_ms`, `created_at_ms`, `home_id`, `device_label` | exactly those, flat on the connection (no `activity` object), beside v1's `connection_id`, `agent_id`, `identity_birth`, `client_label`, `state` |
| `last_seen_at_ms` | a number | **`null` on both of the partner's connections** (one active, one revoked) even with `activity_available: true`; `home_id` and `device_label` also `null` |

Ducter's `seenAtOf` read the flag only per connection; it now also takes the list's flag. With
`null` it says nothing (as designed: never a guess). **Still unverifiable:** a real number in
`last_seen_at_ms`; when Mem fills it (the active connection's computer is the other home, which was
not read) is unknown.

## 2. `bridge contacts` with no Space selector (D444)

Live answer (VERIFIED): **both** the per-Space `cards[]` (85) and the grouped `contacts[]` (11, one
per identity), plus `spaces[]` (per Space: `status: "searched"`, `next_cursor`, `next_args`,
`space {id, label, kind}`), `coverage_scope: "current_space_batch"`, `space_batch {offset, count,
total}`, `spaces_cursor`, `spaces_next_args`, `spaces_truncated` (boolean) and `next` (a sentence
telling an agent how to send, not a cursor).

| Field on a grouped contact | Inferred | Live |
|---|---|---|
| handle | `contact` | `contact` (`bi1:…`, 370–430 chars) |
| member | `member` object or "Member <id>" | `member: "Member <uuid>"` (string) and `member_id` |
| agent | `agent` object | `agent` (string, the agent's name) and `agent_id` |
| `mailbox_available` | boolean | boolean, on every contact (8 true, 3 false) |
| `unavailable` | present | **absent** |
| `retry_args` | present | **absent**; `send_args_prefix` (array) present exactly when the mailbox is available |
| Space | `space` | **`spaces[]`** (the identity's Spaces; empty for a closed mailbox); per-Space cards keep `space` |
| tool | — | no `host`, `source_app` or tool field; only the agent's name and `description` |

Ducter's parsers over the live answer: `contactsOf` reads `contacts[]` first (8 sendable, 5 the
person's own, labels readable; three "Bridge agent" cards with id-only members read as "another
agent", D294's intent). `mailboxesOf` gives `codex: open`, `claude-code: closed`, which matches Mem
(the person's own Claude Code card says `mailbox_available: false`). Five of the person's own cards
name no tool in their agent name, so the pane can't place them (a name-only tool guess, as built).
`more` missed `spaces_next_args`, `spaces_truncated` and `space_batch` (it looked for `next_args`
and cursors only); fixed (`contactsMore`). The answer took about 30 s (research/161's 31–40 s).

## 3. `resources get nowledgemem://… --json` (D444)

Resolved one memory, one thread and one source, read-only (VERIFIED):
`{requested_uri, canonical_uri, kind, path, mime_type: "text/markdown", body, frontmatter}`.
`frontmatter.title` holds the title for all three (`type` = memory / thread / source; a memory adds
`unit_type`, `importance`, `confidence`, `claim_status`, `trust_warnings`; a thread `thread_id`,
`message_count`, `body_includes_messages`; a source `source_type`, `chunk_count`). **`body` begins
with the same frontmatter as a YAML block** (`---` … `---`), the plain answer too. Ducter's
`resourceOf` found the title but would have handed the partner the YAML block (ids, Space ids,
scores) as the first 600 characters of "what was handed over"; fixed (`withoutFrontmatter`).

URI kinds (VERIFIED by Mem's refusals: "unsupported Nowledge resource kind: sources", "…: library"):
singular `memory`, `thread`, `source`; the binary's resolver also names `collaboration`
(a lowercase UUID), `working-memory` (`today`, `current` or a date) and `context` (`/bundle…`).
`refKind` now reads `collaboration` as a plan.

## 4. The identity inbox and `bridge open` (D444, D400)

The partner's local context on this Mac exists but has no live connection (`agents context show`:
"no live representing connection"; the partner answers on the other home). `bridge inbox` with it
exits **0** with `messages: []` and every one of the 8 Spaces `{space_id, status: "unavailable",
error_code: "cloud_agent_context_authority_denied"}`, `incomplete: true`, `outcome_unknown: false`,
`identity` (VERIFIED). Ducter's check counted that as an answered, empty inbox; now a read where
every Space refused is no read (`inboxRefused`), so a home whose connection was revoked never shows
"nothing new" as if it were reading. `bridge outbox` with the same context: exit 1,
`{error_code, detail, retryable: false, outcome_unknown, request_id, http_status}` plus a plain
warning on stderr, which `mailboxError` already reads.

**Still unverifiable here:** where `KnowledgeReference`s sit on `bridge open` (the only read that
returns a received body is `open`, which records a read: a write; and this Mac's context can't read
the mailbox). `refsIn` keeps reading `references` / `knowledge_references` on the message and its
`message` object, plus `nowledgemem://` URIs in the words (INFERRED, research/191).

## 5. D458's Mem offers against the real Mem (dry run)

`memLeads` was run with the real `createNmemClient` (no identity: the default Space), the real
Working Memory focus (5 areas), no tasks, talk or issues, and three synthetic events (a flight, a
hotel check-in, a team meeting in 1–2 days: the real calendar lives in Ducter's home, not read).
Counts only.

| Read | Before (D458 as built) | Live result | After (D461) |
|---|---|---|---|
| preference × event (3 reads, 4 hits each) | 4 `pref_event` leads | **3 of 4 false**: a decision and a preference about other things passed because they shared the query's own word "preference" (`overlap(text, ASK_FOR)`) or one word of the meeting's name | the memory must name the event's own kind (seat, 航班, hotel, 会议 …), or be Mem's `preference` sharing a word with the event: **1 lead** (the flight one) |
| decision with a condition | one mixed query `等 之后再 决定 decision once after` + the focus | 10 hits of every kind, **0 with a condition** | `--unit-type decision` with the condition's short words (`once`, `以后再`) and the focus: 21 decisions, 1–4 with a condition (4 of 20 at n=10); no lead in the dry run because no task or issue was given to meet one |
| conversations left open | the focus, then `下次继续 TODO next time continue`, 3 a read, sharing the 6-read budget | the five-word query: **0 threads** (Mem's thread search is full text and wants every word); one word returns threads ranked by match, not date: the top 3 were 42–297 days old, **0 inside the 2–21-day window**; the second query never ran (budget spent) | two one-word scans (`下次`, `next time`), 20 deep, their own budget of 2: 40 threads, 39 from named tools, 20 with an open tail; **3 `thread_open` leads**, the recent ones |
| where it came from | `toolName` title-cased any `source` | live sources include `thread_distillation`, `knowledge_agent`, `agent`, `ai-now`, `im_connector`, `mcp`, `codex-smoke`, `raft`, `openai`: the origin line read "从 Ai Now … 记下的", "从 Codex Smoke …" | only an AI tool the person knows by name (protocol's `AI_TOOLS`), else the person's own line |

Memory search's answer (VERIFIED): `{query, total, search_mode: "fast_bm25_vector", memories[]}`,
each `{id, title, content, score, importance, unit_type, source, created_at, space_id, labels,
label_ids}`: what `compactHit` reads. `--unit-type` filters as its help says (all 21 were decisions).
Thread search: `{query, total, threads[]}`, each `{id, thread_id, title, message_count, matches,
source, space_id, last_activity, matched_messages[{role, snippet, message_index, message_id,
timestamp}]}`: what `compactThreads` reads. Working Memory: `{exists, content, parsed {focus_areas
[{name, description, memoryId}], flags, briefing, awaiting_rulings…}, date, space_id, updated_at,
epoch}`.

Usable? **Partly (INFERRED from counts, the content was not read).** Conversations left open now
produce leads from the real Mem every morning; preference × event produces one only when Mem holds
a preference about that kind of thing (this Mem has one seat-related memory, as a `fact`); a
condition met needs a done task or a closed issue the dry run didn't have. Most of this Mem's
memories are 2–10 months old and saved by coding tools, so Remembered will be dominated by
conversations, not preferences, for a developer like the author.

## 6. Other shapes seen on the way (VERIFIED)

- `status`: `{status, version, server_version, cli_version, restart_required, api_url, mode, backend,
  database, update {current, latest, update_available, command}, …}`.
- `agents list`: `{agentProfiles[{id, displayName, role, description, instructions, defaultSpaceId,
  sourceApp, hostAgentId, origin: minted|claimed, custodianMemberId, ownerMemberId,
  identityReference, canEdit, defaultSpaceRef?, tags}]}`; the partner's identity has
  `sourceApp: "ducter"`, as D333 expects.
- Passive `bridge setup` with no context: exit 0, `{state: "selection_needed", detail, next,
  candidates[{id, label, kind, readers, write_default}], note}`.

## Implications for Ducter

1. Read the list-level `activity_available`; keep `last_seen_at_ms` advisory: it is null today.
2. Mem's resource bodies carry their frontmatter: strip it before the partner reads one.
3. An inbox that answered with every Space refused is not an empty inbox.
4. Page the grouped contacts by `space_batch` / `spaces_truncated` / `spaces_next_args`.
5. For offers, ask Mem the way its search works: decisions by `--unit-type`, threads one cue word at a
   time and deep, with relevance checked on the memory's own words, never the query's.
6. A `source` is a tool's name only when it is a known AI tool.
7. Still owed: `KnowledgeReference`s on `bridge open` (needs a received message read by its home;
   `open` writes a read receipt) and a live `last_seen_at_ms` number.

**Summary.** Nine shapes checked live and read-only. Five matched what Ducter read; four did not:
the activity flag sits on the list, the grouped contacts page differently, a resource's body
begins with YAML, and an all-refused inbox exits 0. D458's Mem queries found three false preference
leads and no conversation at all; with Mem asked the way it searches, the dry run gives one
preference lead and three conversation leads, origin lines name only real tools.
