# 137: Working Memory and threads in the partner's recall (D368)

Two gaps from a Mem experience audit: **G2**, Nowledge Mem's Working Memory (the person's daily focus
surface) never reached the partner, though `design/system.md` said it enters as an L4 delta; **G3**, the
partner's recall reads memories but not threads (past conversations), so "how did I fix this in Codex last
week" finds nothing (research/69 K6). This note records the CLI interface the build relies on. Read-only
calls on the author's machine, nmem 0.10.119, Cloud backend, 2026-11-18. Shapes only: no content, ids or
keys are copied here.

## 1. Working Memory over the CLI

- **F1 (VERIFIED).** `nmem working-memory` has `read` (the default), `edit`, `patch` and `history`.
  `read` takes `--date YYYY-MM-DD`, `--space <name>` and `--space-id <id>`. Ducter uses only `read`.
- **F2 (VERIFIED).** `nmem --json working-memory read` answers one object: `exists` (bool), `content`
  (the Markdown, ~1.7K chars here, headed `# Working Memory -- <date>` with `## Focus Areas` and
  `## Briefing`), `parsed` {`focus_areas`: [{`name`, `description`, `memoryId`}], `flags`: [],
  `briefing` (string), `awaiting_rulings`: [], `awaiting_rulings_more` (int)}, `date`, `space_id`,
  `updated_at`, `epoch` (int), `skill_handover` (null). On the author's day: one focus area (a 7-char
  name, a 361-char description), a 227-char briefing, no flags or rulings.
- **F3 (INFERRED).** The shape of an `awaiting_rulings` or `flags` item: both were empty, and
  `history` returned 404 on this backend, so no older day could be read. Ducter takes a string, or an
  object's `title` / `question` / `summary` / `text` / `name` / `description`, and drops anything else.
- **F4 (DOCUMENTED, Mem's own plugin skill `read-working-memory`).** Agents read it once near a session's
  start and reuse it; refresh only when the session changed materially or the user asks. That matches an
  L4 line given once per session and again when it changes.
- **F5 (VERIFIED).** One read takes about as long as a memory search (seconds, Cloud). It is not on a
  turn's path: Ducter reads it in the background at most every 30 minutes and on start.

## 2. Thread search over the CLI

- **F6 (VERIFIED).** `nmem threads search <query…> [-n N] [--source S] [--space S] [--space-id ID]`,
  full-text. `--json` answers {`query`, `total`, `threads`: [{`id`, `title`, `message_count`, `matches`,
  `source`, `space_id`, `thread_id`, `last_activity`, `matched_messages`: [{`role`, `snippet` (~360
  chars), `message_index`, `message_id`, `timestamp`}]}]}, three matched messages per thread.
- **F7 (VERIFIED).** `source` is the tool (`claude-code`, `codex` on this machine). Roles include
  `user`, `assistant` and `developer` (Codex's system prompt). Threads are large (1.5K–51K messages), so
  only the matched snippets are usable; the whole thread never is.
- **F8 (VERIFIED).** `-n 3` took ~3.5 s wall time, about a memory search's: run beside it, it adds no
  latency to a recall.
- **F9 (INFERRED).** Where plugins save threads relative to an identity's lane (D229) was not checked;
  Ducter reads the chosen Space, else Mem's default, once.

## Implications for Ducter

1. Working Memory is the person's own notes kept by another app: one line per field, clipped, angle
   brackets and newlines stripped, fenced as data; given once per session and again when its words
   change; never older than 3 days; never said as read (proactive restraint).
2. The morning note can use its focus names cheaply: a tie-breaker for the bar's model and for which
   finds take the day's places, never a reason to keep a find that fails the four tests.
3. Thread search belongs inside `memory_search` (no new tool, no new parameter): run in parallel only when
   the person's words point at another tool or "how did I…", ≤ 3 threads, ≤ 2 of
   the person's and the tool's own lines each, 240 chars, secrets redacted, Ducter's own windows skipped.

**Summary.** Working Memory and thread search are both one read-only CLI call with a stable JSON shape.
Working Memory enters the partner as a fenced L4 line and ranks the morning's finds; threads come back
beside memories in the same `memory_search` call, bounded, only when the conversation points at them.
