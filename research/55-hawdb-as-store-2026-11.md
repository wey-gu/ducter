# 55 — HawDB as Ducter's store, again (2026-11-11): fit, fork/BM25, gap list, migration

Date: 2026-11-11. Question: now that HawDB has a Bun binding, can Ducter's home move its storage
from `bun:sqlite` to HawDB (principle 19, D19, `design/todo.md` "Storage: adopt HawDB")? What
exactly is still missing, where would it go in HawDB, and how should Ducter use HawDB's
branches and BM25? This report follows `09-hawdb-evaluation.md` (2026-11-08) and says what
changed since. Evaluation only: no HawDB code was built, run or changed.

Sources and tags:
- HawDB: fresh clone `git clone --depth 50 https://github.com/nowledge-co/hawdb`, HEAD
  `1141d6a` (2026-11-11), version 0.30.0 (`Cargo.toml:3`), read only, nothing built or run.
  Paths below are relative to that root. Issues and PRs read with `gh` on 2026-11-11.
- Ducter: this repo at `82c764b5`.
- **VERIFIED**: read in source or tests (path:line), or counted read-only. **DOCUMENTED**: a doc,
  README, issue or PR says so and the code wasn't checked. **INFERRED**: my judgment.

**TL;DR.** Since report 09 three of its four blockers have moved, though not all the way. The
Bun binding exists (#1645, merged 2026-11-11). Multi-key reads don't need strict-append any
more: ordinary SQL row tables now stream composite primary-key ranges and ordered secondary
indexes with an early `LIMIT` stop. And a change feed is not something Ducter needs: Ducter
is the only writer and fans its events out itself. What still blocks the switch: (1) BM25 /
full-text search over SQL rows can't be reached from the C ABI (it needs a host-owned Rust
`SearchIndex`), so `log_search` and recall would have no engine; (2) the on-disk format still
breaks without migration (row-page v2, 2026-11-09), which rules out HawDB holding the only copy
of a user's Log; (3) Ducter's exact workload, steady inserts on one long-lived handle, has an
open intermittent failure (#1618). The C ABI also lacks transactions, durability options and
backup, all small additions. Branches are reachable through SQL today, but they are the wrong
grain for forking a task or branching the conversation: they are database-wide and never
merge. Use them later for replay sandboxes. **Adopt BM25 first.**

---

## 1. What changed since report 09 (2026-11-08, HEAD `e3e7ef4`, v0.28)

| Item | Then (09) | Now | Tag |
|---|---|---|---|
| TS binding | "No Node/TS addon" | `bindings/bun` (TypeScript over `bun:ffi`, 723 lines): `loadHawDB(path)`, `open`, `openInMemory`, `query` (Cypher), `querySQL`, `exec`, `close`, `version`. Issue #1643, PR #1645 merged 2026-11-11. CI runs it on ubuntu-24.04 and macos-latest with Bun 1.4.3 | VERIFIED `bindings/bun/src/native.ts:23-56`, `bindings/bun/src/index.ts:136-391`, `.github/workflows/native-bindings.yml:120-166` |
| C ABI surface | open/query/query_sql/close + retained numeric | Unchanged: `hawdb_open`, `hawdb_open_in_memory`, `hawdb_close`, `hawdb_query`, `hawdb_query_sql`, `hawdb_buffer_free`, `hawdb_version`, `hawdb_boundary_profile_snapshot`, and the experimental `hawdb_retained_*` exports. No transaction, backup, search or option symbols | VERIFIED `bindings/ffi/include/hawdb_ffi.h` (symbol list) |
| Branches | CoW branches, Rust API | Lifecycle is now SQL: `CREATE BRANCH … FROM … AT REVISION $ REQUEST KEY $`, `USE BRANCH`, `SHOW CURRENT BRANCH`, `SHOW BRANCHES`, `DROP BRANCH ID $ AT REVISION $`. Selection belongs to the mutable `Database` context, which is what the C ABI's SQL path calls | VERIFIED `README.md` "Branches for agents", `tests/branch_project_open.rs:233-288`, `bindings/ffi/src/lib.rs:612-621`; DOCUMENTED `docs/specs/BRANCHING_STORAGE_SPEC.md:225-320` |
| Relational reads | strict-append only by partition | Composite primary-key prefix range seek (#1583, 2026-11-05). Ordered secondary-index projection with early `LIMIT`, keyset continuation, reverse traversal for `DESC` | VERIFIED PR #1583 body; DOCUMENTED `docs/specs/POSTGRES_RELATIONAL_CONTENT_STORE_SPEC.md:400-445` |
| SQL types | no `now()` | `TIMESTAMP`/`TIMESTAMPTZ` (#1591), `CURRENT_TIMESTAMP`/`now()` (#1594), keyless tables (#1474). `docs/SQL_SESSION.md:64` still says `now()` is unsupported, so that page is stale | DOCUMENTED PR titles (`git log`) |
| Format | "may break destructively" | It did: row-page format v2 (#1602, `feat(storage)!`, 2026-11-09) refuses v1 with "recreate the development database". HawDB's AGENTS.md: no compatibility migrations for development formats | VERIFIED PR #1602 body, `AGENTS.md:20` |
| Long-lived writes | not examined | #1438 (commits failed after about 300 writes on one handle) was fixed by #1461/#1481/#1518, but #1618 (steady inserts fail intermittently when automatic checkpoints exhaust their retries) is still OPEN, opened 2026-11-08 | VERIFIED `gh issue view 1438/1618` |
| Full-text | BM25 over graph projection; rows need a Rust consumer | Same. `CALL text_search` fails without a host-attached text projection; #1471 reports exactly this for Python | VERIFIED `crates/executor/src/external.rs:161`, `src/embedded.rs:682-693`, `src/api/search_projection_catch_up.rs:30-190`; issue #1471 |
| Change feed | internal, Rust-only | Same | DOCUMENTED `docs/specs/SEARCH_PROJECTION_CHANGEFEED_SPEC.md` |
| WASM | in-memory toy | Same | DOCUMENTED `docs/WASM.md:1-30` |
| Release pace | v0.24→0.28 in 5 days | 0.28 (11-06), 0.29 (11-09), 0.30 (11-11) | VERIFIED `git log` |

## 2. What Ducter stores and how it reads it

The store behind principle 19 is one `bun:sqlite` file, `<dataDir>/ducter.db`, opened by
`openLog` (`packages/core/src/log.ts:53`). The port is `LogStore` plus `SpineStore`
(`packages/protocol/src/internal.ts:21-58`). VERIFIED.

- `events(seq INTEGER PRIMARY KEY, ts, persona, stream, origin, kind, body TEXT JSON,
  supersedes)`, indexes `events_stream(stream, seq)` and `events_kind(kind, seq)`.
- Two FTS5 tables: `events_fts` (trigram, exact substrings) and `events_bg` (unicode61 over
  code-made CJK bigrams, BM25).
- Spine (`packages/core/src/spine.ts:9-40`): `spine` (frozen digests; triggers refuse UPDATE and
  DELETE), `spine_attempts`, `spine_recall`.
- WAL mode, `synchronous = NORMAL`, file mode 0600 (`log.ts:57-67`).

Each append runs in one transaction: `seq = MAX(seq)+1`, then the event row and both FTS rows
(`log.ts:142-151`). Listeners are dispatched in-process, in seq order (`log.ts:108-128`).

**Everything else is a projection of the Log rebuilt at boot**, not a table: the task registry
(`registry.ts:165`), waiters (`waiters.ts:302`), routines (`routines.ts:379`), decisions
(`decisions.ts:189`), the living message (`living.ts:55`), until (`until.ts:165`), phone
(`phone.ts:226`) and the runner's open tasks (`runner/src/runner.ts:921`). VERIFIED. Outside
the Log:
- `devices.db`: SQLite, shared by the CLI and the server (`auth.ts:112`, `design/system.md:336`).
- JSON files: settings, persona, projects, connections, push.
- The encrypted autofill file `saved/<persona>.enc` (`saved/store.ts:1-6`).
- The media store being added: content-addressed blobs on disk.

None of these belongs in HawDB: blobs are out of HawDB's scope by contract
(`POSTGRES_RELATIONAL_CONTENT_STORE_SPEC.md:35`, DOCUMENTED), and the autofill file is encrypted
on purpose. The only candidate is `ducter.db`. INFERRED.

**Volume.** The author's own home has 105 events across 3 stream families after about 4
hours (2026-11-09). `task_event` makes up 54 of them, the average body is about 650 B, the file
is 832 KB. VERIFIED by a read-only `sqlite3` count. A heavy user running about 20 tasks a day at
200–2,000 events per task would write 4k–40k events a day: roughly 1–15M rows and 1–10 GB a
year, with one writer, bursty during tasks and idle otherwise. INFERRED.

## 3. Access patterns → HawDB, reachable from Bun today?

Shapes are VERIFIED from the call sites cited; volumes are INFERRED from §2. "Bun today" means
`bindings/bun` over the current C ABI.

| # | Ducter access (call site) | Shape · volume | HawDB feature that serves it | Bun today? |
|---|---|---|---|---|
| A1 | `append` (`log.ts:155`) | 1 row, global gapless `seq`, synchronous, then in-process dispatch · up to tens/s in bursts | Ordinary row table `events(seq BIGINT PRIMARY KEY …)`, one `INSERT` per call (one statement = one commit). Ducter assigns `seq = head+1` itself, which is safe because the directory has one writer lease (`README.md` "Durability"). Alternative: strict-append with `generated_order='commit_sequence'`, but its assigned values come back only in the Rust typed result and `INSERT … RETURNING` fails closed (`QUERY_FIRST_PUBLIC_API_SPEC.md:52-75`), so Ducter can't learn its seq over the C ABI | **yes** (row table). Strict-append generated seq: **Rust-only** |
| A2 | Durability per append | today WAL + `synchronous=NORMAL` | Default `SyncOnEveryWrite`. `SyncOnCheckpoint` and group commit exist (`src/embedded.rs:161`), but `hawdb_open` parses only `read_only` (`bindings/ffi/src/lib.rs:454-476`) | default only; choice: **missing** |
| A3 | Stream cursor read, forward: `read({stream, fromSeq, limit})`. WS replay (`ws.ts:316`), partner inflight (`partner.ts:303`), task history (`tools.ts:63`), decisions (`decisions.ts:215`) | `WHERE stream=? AND seq>=? ORDER BY seq LIMIT n` · ≤2,000 rows (50,000 in `runner.ts:935`) | Secondary index `(stream, seq)`, ordered index projection with early stop (`CONTENT_STORE_SPEC.md:426-433`), or PK `(stream, seq)` prefix range (#1583) | **yes** (INFERRED that the planner picks it for this exact text; check with `EXPLAIN` in the conformance suite) |
| A4 | Latest N of a stream: `read({stream, limit})` / `beforeSeq`. Channel window (`partner.ts:1005`), history pages (`ws.ts:833`), last user message (`partner.ts:955`) | `ORDER BY seq DESC LIMIT n`, reversed · 1–2,000 | Same index traversed in reverse (`CONTENT_STORE_SPEC.md:440-443`); Ducter reverses the rows in TS (no general subquery layer, `SQL_SELECT_SUPPORT.md:58`) | **yes** |
| A5 | Kinds filter inside a stream: `read({stream:"channel", kinds:[…], limit})`, about 25 call sites (proactive, settings, phone, closing, connections, partner) | `stream=? AND kind IN (…) ORDER BY seq DESC LIMIT n` · ≤5,000 | Index `(stream, kind, seq)` per kind, merged in TS; `IN` is supported (`SQL_SELECT_SUPPORT.md:48`), but whether `IN` keeps the ordered path is unproven | **yes** (one query per kind is safe) |
| A6 | Boot projections: `read({fromSeq:0, limit:MAX, kinds})` across all streams (registry, waiters, routines, decisions, living, until, phone, runner) | 8–10 scans at boot, by kind, every stream, seq order · grows with the Log | Index `(kind, seq)`, one query per kind, paged under the 64 MiB default payload budget (`src/api/config.rs:139-140`; over budget fails rather than truncates, `README.md` "Result budget errors") | **yes**, with paging |
| A7 | `search(query, {stream, beforeSeq, limit})`: `log_search` (`tools.ts:60,101`), automatic recall (`partner/src/spine/recall.ts:57`) | Exact trigram list plus BM25 over CJK bigrams, fused with recency (`log.ts:186-240`) · top 8–50 | HawDB BM25 with CJK n-grams exists, but only as a host-attached projection (`src/embedded.rs:682`) caught up by Rust (`catch_up_search_projection_with_relational`, `search_projection_catch_up.rs:68`). Without it `CALL text_search` fails (`external.rs:161`, #1471). `CREATE FULLTEXT INDEX ON :Label(prop)` gives an n-gram `CONTAINS` seek on graph nodes only, not BM25 (`EMBEDDED_DEVELOPMENT_PLAN.md:977-980`) | **missing** (Rust-only) |
| A8 | `head()`, and `MAX(seq)` at open | 1 aggregate at boot | `SELECT MAX(seq)` over the PK | **yes** |
| A9 | `subscribe` (about 20 listeners) | in-process fan-out after commit | Not a database feature: Ducter is the only writer and dispatches after its own commit. Client sync is A3 over WS. No change feed needed | n/a |
| A10 | Spine `freeze` / `list` / `attempts` / `recalled` | append-only, ≤ hundreds of rows | Row tables. "Frozen" moves from SQLite triggers (HawDB has none, `SQL_SESSION.md:63`) into the port, which has no update path | **yes** (enforcement moves to the port) |
| A11 | Append + spine digest atomically, migrations, import batches | multi-statement atomic | `HawDBEmbedded::begin_transaction` / `transaction_query_sql_with_params` / `commit_transaction` (`src/embedded.rs:699-795`). SQL `BEGIN`/`COMMIT` is rejected as `HawUnsupportedStatement` (`crates/sql/src/parser/full/grammar.rs:617-621`) | **Rust-only** |
| A12 | `ducter report` reads `ducter.db` read-only while the server runs (`cli/src/report.ts:51`) | cross-process reader | One writer lease per directory; a second open "fails immediately" (`README.md` "Durability"). Whether a read-only open from another process is admitted is unverified | **missing / unverified**; Ducter can route through the server |
| A13 | Backup, user export, rollback point | rare | `backup_to`, `restore_backup`, `scrub_storage` (`src/api/database_maintenance.rs:371-392`); Cypher `CHECKPOINT` statement (`src/api/query_runtime.rs:534`) | checkpoint **yes** (INFERRED, it is a statement); backup: **Rust-only** |
| A14 | Fork / sandbox (see §4) | rare | SQL branch lifecycle | **yes** (INFERRED: same `Database::query_sql` entrypoint as the Rust tests; no Bun test covers it) |
| A15 | Blobs (media store), autofill, JSON settings, `devices.db` | files | Out of scope, and they stay files | n/a |

Parameters are positional JSON (`$1…`); `BIGINT` returns as `number` while safe and as
`bigint` beyond (`bindings/bun/README.md` "Values"). Every call is synchronous and blocks Bun's
event loop, and one handle serializes its calls (`bindings/bun/README.md` "API and ownership";
`bindings/ffi/README.md` "The handle is thread-safe"). Ducter's core is already synchronous,
so appends (about 0.3 ms before fsync for single-row commits in HawDB's own benchmark,
`ROW_PAGE_MONOTONIC_APPEND_BENCHMARK.md:50-56`) fit the main thread. Only boot scans and large
searches would be worth a Bun Worker. INFERRED.

## 4. Session fork / branching and BM25: where they add product value

### What HawDB has (precisely)

- **Branches** (`README.md` "Branches for agents"; `BRANCHING_STORAGE_SPEC.md`). DOCUMENTED,
  with the SQL path VERIFIED in `tests/branch_project_open.rs`.
  - A branch is a copy-on-write copy of the whole database: graph, SQL tables and strict-append
    tables. Creation cost doesn't grow with the data.
  - Branches are durable until dropped, idempotent by request key, and can themselves be
    branched.
  - `AT REVISION` must be the source's current committed epoch: "Reject stale revisions; do
    not silently fork an older sealed head" (spec 495-496), so there is no point-in-time fork.
  - **No merge, no promotion** (spec 93-97).
  - Selection is per mutable handle, and `USE BRANCH` is refused inside a transaction and on
    `ConcurrentDatabase`.
  - Open issues #774 (track, P0) and #775 (SQL lifecycle and session selection) are still
    OPEN, though the SQL forms exist and are tested.
  - Reachable from Bun: yes, as SQL text through `querySQL` (INFERRED, untested in Bun).
- **BM25.** The lexical projection is "rebuildable full-text index, caught up from the graph",
  with CJK n-grams, identifier splitting, and its own projection epoch next to the commit epoch.
  `retrieve_knowledge` adds rerank with a `ScoringSpec` that includes timestamp decay. DOCUMENTED
  `README.md` "Context, in one pipeline". Reachable from Bun: no (§3 A7).
- **"Session storage optimizations".** I found no HawDB feature under that name. The closest
  shipped work for message- and session-shaped storage:
  - The RowPage monotonic-append fast path: opt-in `DatabaseConfig::relational_monotonic_append_fast_path`,
    default false. Multi-row `INSERT` batches ascending within a primary-key prefix run
    18.9× faster for 8 rows and 28.4× for 32; single rows are unchanged
    (`ROW_PAGE_MONOTONIC_APPEND_BENCHMARK.md:9-56`, `src/api/config.rs:97,251`). Rust config
    only, not in `hawdb_open`.
  - Strict-append preparation cut (#1215).
  - Primary-key prefix range seek (#1583).
  - Packed row-page v2 (#1602, about 20× less checkpoint I/O for narrow rows per its PR).
  - Live-overlay draining on long-lived handles (#1461/#1481/#1518; #1618 still open).
  - Synchronous SQL materialized views for Thread activity (count, first/last), #1253/#1257.

  VERIFIED via PR/issue bodies. If the author meant something else, it is not in the public
  repo or its issues.

### Where Ducter's forking actually lives

A Ducter task is three things, and a "fork" must fork all three together.
1. The harness session. Claude Code `--resume <sid> --resume-session-at <uuid> --fork-session`
   is measured; Codex ephemeral threads can't fork; pi has `/tree` (`design/context.md:109-123`).
2. The work: a git branch, or the folder copy (D125, D142).
3. Ducter's own record: the task's stream in the Log.

Fork rules today: "Fork only window→window, on the same harness. The main AI's channel is never
forked into a long job" (`design/focus-window.md:40-41`). Forks are not built (`context.md:101`,
no `fork` in `packages/runner/src`). VERIFIED.

| Scenario (who, what they feel) | Right mechanism | Why not a HawDB branch |
|---|---|---|
| **试另一种做法 / Try another way.** A developer or consumer user looks at a done task and wants a second approach side by side, without losing the first | A sibling task: new stream `task:<child>`, with `task_open` carrying `forkOf {taskId, atSeq}`. The child's history is the parent's stream `seq ≤ atSeq` (A3/A4 reads) plus its own. The harness session forks at the matching checkpoint; the git branch starts off the same base. Both appear in 手头的事 / On hand, the user keeps one, and the other's branch is cleaned up at archive | Both forks must be live on the same database at once (On hand shows both, the partner reads both), and the kept one must stay with no copy-back. Branches isolate the whole database and never merge (spec 93-97). The fork is one lineage pointer in an append-only Log; the Log is already shaped for it. INFERRED |
| **Branch the conversation.** Edit an earlier message and regenerate | Don't build it. The conversation is a messaging app (one thread, silence means success); "what if" belongs in a task. Inside the partner, folds use the *harness's* fork (read-fold, `context.md:105-113`), not storage | Same grain problem, and a second timeline is a concept the fresh user must learn first. INFERRED |
| **Undo a task's changes** | Files: the git branch or the folder copy (D142). Ducter state (a routine made, a setting changed) is undone by a compensating Log event | The effects live outside the database. INFERRED |
| **Replay sandbox (builders).** Re-run the digest writer, the partner eval or a new recall gate against a real Log; "a real-channel replay" is still owed (`AGENTS.md` build state, memory digest) | `CREATE BRANCH … REQUEST KEY`, `USE BRANCH`, replay, compare, `DROP BRANCH`. O(1) whatever the Log size, and the live home keeps writing `main` | This is what branches are for ("explore a plan… while the user… keep[s] reading `main`", README). At 1–10 GB a file copy is slow and doubles disk; a branch costs metadata. INFERRED |
| **Rollback point before a risky Ducter migration** | A branch before the migration. Recovering means selecting it on every open, because promotion doesn't exist; until then a `backup_to` copy is simpler | Needs promotion ("reset main to branch") or a C ABI backup. INFERRED |

**BM25 is where HawDB gives the user something directly.** Ducter's recall serves "像上次那样",
"we decided…" and `log_search` (`design/memory.md:42-131`). Today it is two FTS5 indexes
written in the append transaction, plus code-made bigrams and reciprocal-rank fusion with a
recency list (`log.ts:186-240`). With HawDB:
- one engine-maintained BM25 index with CJK n-grams replaces both tables and the bigram code;
- the recency list becomes `ScoringSpec` timestamp decay;
- the "exact" list can stay as an n-gram `CONTAINS` predicate if HawDB extends it to SQL rows;
- vectors (`VECTOR(n)` with exact distance today, DiskANN on graph projections) can be fused
  later in the same request, without a second store.

HawDB's projection is caught up after commit, not read-your-writes. That's acceptable:
automatic recall searches *outside* the window, and `log_search` for a just-written event is
rare. INFERRED.

**Recommendation.** Adopt BM25 first, and only through a declarative SQL path (gap 1); it is
user-visible. Use branches second, as a builder-only replay sandbox. Model task fork in the Log
(`forkOf`) whatever the storage engine, and don't build conversation branching. "Try another
way" is a new scenario: it goes through the change loop before any build, and this report
decides nothing about it.

## 5. Gap list, ordered by what blocks Ducter's switch

Separately: **#1319 (publish prebuilt native libraries)** is OPEN and another agent is doing
it. Ducter's release CI needs those artifacts (darwin-arm64, linux-x64, linux-arm64) rather
than building Rust. This report does not duplicate that work.

| # | Gap: what exactly is missing | Where it would go in HawDB | Size (INFERRED) | Existing issue |
|---|---|---|---|---|
| 1 | **Full-text (BM25, CJK) over SQL rows, from SQL.** For example `CREATE SEARCH INDEX events_text ON events (text) WITH (analyzer = 'cjk')`, plus a SQL table function `text_search('events_text', $q, $k)` returning `(pk, score)` that can be joined or filtered by `stream`/`seq`, maintained by the engine (catch-up owned by the engine, not a host mapper). The projection state stays persistent under the database directory, so `hawdb_open` needs no host `SearchIndex` | `crates/sql` + `crates/ddl` (DDL and table function); `crates/search` (relational source documents); `src/api/search_projection_catch_up.rs` (engine-owned catch-up of `catch_up_search_projection_with_relational`); `src/embedded.rs` (persistent projection on open). No new C symbol if it's all SQL; nothing to add in Bun | L: 2–4 weeks | None exact; #1471 is the same hole in Python (graph-only `text_search` unusable without a host projection) |
| 2 | **Format stability or an upgrade path.** Development formats break without migration (#1602, `AGENTS.md:20`). Ducter needs either a format promise, or a supported "export with old, import with new" path (`hawdb_export`/`import` or a CLI), so a Ducter update never strands a user's Log | Storage format policy (`docs/STORAGE.md` "Reader compatibility refusals"), release policy; optionally an in-place upgrader in `crates/storage` | Policy S; upgrader M | None found (TODO.md P0 "production release blockers" covers qualification, not compatibility) |
| 3 | **Steady inserts on one long-lived handle must never fail.** #1618: intermittent failure when automatic checkpoints exhaust retries. This is exactly the home's workload | `crates/storage` relational live overlay; `src/api/automatic_checkpoint.rs` | S–M | **#1618** (OPEN) |
| 4 | **Open options in the C ABI:** durability (`sync_on_every_write` / `sync_on_checkpoint`, group commit), read row/payload budgets, `relational_monotonic_append_fast_path`, deployment profile | `bindings/ffi/src/lib.rs:454-476` (`options_json`); header comment; Bun `OpenOptions` (`bindings/bun/src/index.ts:46`) | S (about a day) | None |
| 5 | **Transactions in the C ABI:** `hawdb_begin`, `hawdb_commit`, `hawdb_rollback` (or SQL `BEGIN`/`COMMIT` on the handle), wrapping `HawDBEmbedded::begin_transaction` / `transaction_query_sql_with_params` / `commit_transaction` (`src/embedded.rs:699-795`); Bun `db.transaction(fn)` | `bindings/ffi/src/lib.rs`; `bindings/bun/src/{native,index}.ts` | S (2–3 days with tests) | None |
| 6 | **Maintenance in the C ABI:** `hawdb_backup(db, path)`, `hawdb_restore`, `hawdb_scrub`, wrapping `database_maintenance.rs:371-392`; returns a JSON report | `bindings/ffi`, `bindings/bun` | S | None (the #1438 thread notes Python lacks `checkpoint`) |
| 7 | **Bun coverage of what Ducter relies on:** tests through the Bun adapter for branch SQL, ordered `(stream, seq)` reads with `EXPLAIN`, reopen after many single-row commits, payload-budget errors; a published npm package (`@nowledge/hawdb-bun` exists in-tree only) | `bindings/bun/tests`; release workflow (with #1319) | S | #1643 (closed; first delivery excluded npm) |
| 8 | **Cross-process read-only open** while a writer holds the lease (for `ducter report`), or documentation that it is refused | `crates/storage` lease; README | S to document | None; Ducter can route through the server instead |
| 9 | Later: branch **promotion** ("reset main to branch X") and point-in-time `AT REVISION` | `BRANCHING_STORAGE_SPEC.md` P1 | M | #774 (track) |
| 10 | Later: ANN vector index on SQL `VECTOR(n)` columns (semantic recall over the Log) | `crates/optimizer-vector`, SQL `CREATE INDEX … USING diskann` | M–L | #1471 |

**No longer blockers (downgraded from `design/todo.md`):**
- Multi-key reads on append tables: use a row table with secondary indexes (§3 A3–A6).
- A public resumable change feed: Ducter is the only writer (A9).
- Persistent WASM: the Cloudflare Durable Object path is designed but not built; no
  `DurableObject` exists in `packages/`, VERIFIED by grep.
- `INSERT RETURNING` for generated commit sequences: not needed with Ducter-assigned seq.

What Ducter gives up by leaving strict-append: engine-enforced append-only. The port has no
update or delete path, so this matches today's SQLite (except the spine triggers). INFERRED.

## 6. Migration plan (once gaps 1–3 are closed; 4–6 make it cleaner)

**The port implementation.** Write `packages/core/src/log-hawdb.ts` implementing
`LogStore & { spine: SpineStore; close() }`, chosen by `<dataDir>/store.json`
(`{engine, hawdbVersion, migratedAtSeq}`). The SQLite `log.ts` stays as the second
implementation.

Schema:
```sql
CREATE TABLE events (seq BIGINT PRIMARY KEY, ts TEXT NOT NULL, persona TEXT NOT NULL,
  stream TEXT NOT NULL, origin TEXT NOT NULL, kind TEXT NOT NULL, body TEXT NOT NULL,
  supersedes BIGINT);
CREATE INDEX events_stream ON events (stream, seq);
CREATE INDEX events_stream_kind ON events (stream, kind, seq);
CREATE INDEX events_kind ON events (kind, seq);
CREATE TABLE spine (id TEXT PRIMARY KEY, kind TEXT NOT NULL, from_seq BIGINT NOT NULL,
  to_seq BIGINT NOT NULL, created TEXT NOT NULL, body TEXT NOT NULL);
CREATE TABLE spine_attempts (...);  -- keyless (#1474) or a Ducter-assigned id
CREATE TABLE spine_recall (...);
CREATE SEARCH INDEX events_text ON events (...);  -- gap 1; text = textOf(body)
```

- **append**: one `INSERT` with `seq = head+1`; the PK rejects a duplicate, and on any error
  Ducter re-reads `MAX(seq)`.
- **read**: A3–A6 as single statements; kinds become one statement per kind, merged by seq;
  reads are paged under the payload budget.
- **search**: the gap-1 table function, filtered by stream/beforeSeq, fused with recency
  (or with `ScoringSpec` decay if it is exposed).
- **Library loading**: open the handle once at boot; long boot scans may move to a Worker
  holding its own handle (read-only, if gap 8 allows it).

**Conformance before switching.** Run the existing Log, spine, registry, waiter, routine and
recall tests against both implementations (one parameterized suite). Then run `packages/soak`
on HawDB, and the partner eval's memory category (recall quality is the user-visible risk).
Add a check that boot-scan payloads stay under the budget at 10M synthetic rows.

**One-time import.** Command `ducter store migrate --to hawdb`. It runs with the server stopped,
or at boot behind a "moving your history" state.
1. Open `ducter.db` read-only.
2. Stream `events` in seq order in multi-row `INSERT` batches of about 256 rows (enable the
   monotonic fast path if gap 4 exposes it; use a transaction per batch if gap 5 lands).
3. Copy the spine tables.
4. Let the search index catch up.

**Verification.** Compare SQLite and HawDB on:
- row counts, `MAX(seq)`, gaplessness (`count = max`);
- per-stream and per-kind counts;
- a SHA-256 over the canonical serialization `(seq, ts, persona, stream, origin, kind, body,
  supersedes)` in seq order;
- the spine `id` set;
- the search top-10 overlap for queries replayed from `spine_recall` (the threshold is a
  judgment call; report it, don't hide it).

Only after a match does Ducter write `store.json` with `engine: "hawdb"`.

**Rollout and rollback.**
- Release N: SQLite stays primary and HawDB is a shadow, written after each SQLite commit and
  compared at boot (count + head + rolling hash). Mismatches are logged, never shown. HawDB
  qualifies itself against Mem the same way (`docs/EXTERNAL_SHADOW_PROTOCOL.md`).
- Release N+1: flip the primary.
- `ducter.db` is kept read-only for 30 days. Rollback is `ducter store migrate --to sqlite`:
  it copies the events with `seq > migratedAtSeq` from HawDB back into SQLite and flips
  `store.json`.
- If a HawDB format refusal ever appears (`unsupported_storage_format`), Ducter falls back to
  SQLite automatically and says so once in plain words. It never loses the Log.
- Until gap 2 is closed, SQLite is not deleted.

**The single-binary distribution.**
- Today `ducter` is one `bun build --compile` file of 32 MB (`packages/cli/dist/Ducter`,
  VERIFIED; `packages/cli/build.sh`). HawDB adds `libhawdb_ffi.{dylib,so}`; HawDB's own
  composition baseline measures a minimal host at about 22 MB (9.7 MB packaged) on macOS arm64
  (`docs/COMPOSITION_BASELINE.md:108-115`, DOCUMENTED), so the bundle grows by roughly 70%
  (INFERRED).
- The library ships beside the binary: `Ducter.app/Contents/Frameworks/` in the DMG, and
  `lib/` inside the Linux tarballs (`ducter-X-linux-{arm64,x64}.tar.gz`). Ducter resolves it
  from `dirname(process.execPath)`, because the adapter requires an explicit path and reads no
  environment variable (`bindings/bun/README.md`).
- Whether `bun:ffi` can `dlopen` a library embedded inside a compiled binary is unverified, so
  ship the file beside it (INFERRED).
- macOS: sign the dylib with Ducter's Team ID under hardened runtime and notarize it with the
  app (INFERRED).
- Updates: the updater must replace binary and library together, and the version is pinned per
  Ducter release (`library.version()` is checked at boot against `store.json`).
- Platforms: Bun CI covers macOS arm64 and Linux x64. Linux arm64 is in core CI
  (`ci.yml:131`) but not the Bun job (VERIFIED `native-bindings.yml:125`). The Ducter Linux
  arm64 build needs #1319's artifact plus its own smoke test.
- Worker machines and the phone are unaffected: only the home holds the Log.

## Implications for Ducter

1. **Don't switch yet. The blockers are now precise and small in number:**
   1. full-text search over SQL rows from SQL (gap 1);
   2. format stability (gap 2);
   3. #1618 (gap 3).

   C ABI options, transactions and backup (gaps 4–6) are a few days each. File gaps 1, 2, 4,
   5 and 6 as HawDB issues; #1618 and #1319 exist.
2. **Rewrite the `design/todo.md` blocker list** when the change loop next touches storage.
   Drop "multi-key reads on append tables" and "public change feed" (not needed); mark the
   Bun binding as landed; add "full-text over SQL rows from SQL", "format stability", "#1618"
   and "C ABI options, transactions, backup". Principle 19's "HawDB-shaped port" holds, but the
   shape is a row table with secondary indexes, not strict-append.
3. **Task fork goes in the Log** (`forkOf {taskId, atSeq}` on `task_open`), engine-independent.
   It is a candidate scenario ("Try another way") for the change loop, not a storage feature.
   Conversation branching is not recommended.
4. **BM25 first, branches second.** BM25 serves recall, which users notice. Branches are a
   builder tool for replaying the digest and eval against a real Log.
5. **The distribution grows by one signed native library**, beside the binary, in both the
   DMG and the Linux tarballs, updated together.

## Summary

- HawDB 0.30 now has a Bun binding over a C ABI that is still minimal: Cypher, SQL, open,
  close.
- Ducter's Log maps onto an ordinary HawDB row table with secondary indexes, and every
  read pattern is reachable from Bun today. Search is the exception: BM25 needs a Rust-side
  projection.
- Two more things block a switch: an on-disk format that breaks without migration, and an
  open steady-insert failure (#1618). Durability options, transactions and backup are small
  C ABI additions.
- Branches are reachable through SQL, but they are database-wide and never merge. They fit a
  builder's replay sandbox, not "try another way" or a branched conversation; those belong in
  the Log as a lineage pointer.
- Order of work: declarative BM25 on SQL rows, then format stability and #1618, then the
  small C ABI gaps.
- Migration path: a shadow release, then a verified import with a hash match, SQLite kept for
  rollback, and the native library shipped beside the binary.
