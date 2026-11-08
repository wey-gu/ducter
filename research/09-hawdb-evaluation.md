# 09 — HawDB as Ducter's persistence layer?

Date: 2026-11-08. Question: should Ducter's control plane (today: one SQLite-backed Durable Object per
persona, portable to Node/Bun + SQLite on a Linux box, see `04` §3) store its Log and registries in
**HawDB** (nowledge-co/hawdb), the engine the team built for Nowledge Mem?

Legend: **[V]** = verified by reading source/docs in this session (path:line). **[I]** = inferred / judgment.
Clone (read-only, nothing built or run), HEAD `e3e7ef4` (2026-11-07):
`<scratch>/repos/hawdb-latest`
(paths below are relative to that root).

**TL;DR.** HawDB is a strong **embedded Rust** engine (graph + Postgres-dialect SQL + BM25/vector projections +
strict-append logs + CoW branches) with a serious verification culture. It is pre-production, single-process, has
**no server, no network protocol, no replication, no Node/TS binding, and no persistent WASM**. Ducter's
control plane is TypeScript and must run on Cloudflare. So: **not the v1 control-plane store.** Keep SQLite
behind a storage port, design the Log schema so it maps 1:1 onto HawDB strict-append tables, and revisit for
the self-host target once a Node binding (or `hawdb serve`) exists. HawDB's natural home in Ducter is
*indirect*: it is Nowledge Mem's engine, and Mem already owns persona identity + memory (principle 15).

---

## 1. What HawDB is

| Aspect | Finding | Evidence |
|---|---|---|
| Language | Rust (pinned 1.97.1), ~1.23M lines `.rs`, ~10.4k `#[test]` fns | `README.md:6`, `rust-toolchain.toml`; counted [V] |
| Shape | **Embedded library**, "the library is the product". One directory, one writer lease, one process; second open fails | `README.md:8,14,47,188`, `README.md:345-351` [V] |
| Server | **None.** "Multi-process writers, distributed replication, and a standalone database server are outside this release"; SQL session does not "start a TCP listener" | `README.md:351`, `docs/SQL_SESSION.md:62-66` [V] |
| Storage engine | Own format: ordered immutable segments, demand-paged descriptor tree, CoW pages; WAL synced per commit by default (`SyncOnCheckpoint`, group commit optional); checkpoint writes immutable generation, `manifest.hawdb` is the only root pointer; recovery replays committed prefix, drops torn tail | `README.md:190`, `docs/STORAGE.md` (1393 lines) [V] |
| Graph | Parameterized **Cypher** subset (MATCH/OPTIONAL MATCH/WITH/UNWIND/MERGE/SET/DELETE, shortestPath ≤256 hops, trails) via a Cascades optimizer; SQL/PGQ (`GRAPH_TABLE`) binder | `README.md:167-182` [V] |
| Relational | **PostgreSQL-dialect SQL** subset, same snapshot/commit boundary as graph. No triggers, PL/pgSQL, `jsonb` ops, `tsvector`, `now()`, `ON CONFLICT DO UPDATE RETURNING` | `README.md:178-180`, `docs/SQL_SESSION.md:62-66` [V] |
| Append logs | `storage_mode='strict_append'` tables: one partition key + one order key; INSERT only; UPDATE/DELETE/INDEX/ALTER fail closed; reads = exact partition + ascending order key + optional exclusive lower bound + mandatory LIMIT; optional table-wide `generated_order='commit_sequence'` assigned contiguously at durable commit, never consumed by aborts | `docs/specs/QUERY_FIRST_PUBLIC_API_SPEC.md:23-83`, `README.md:80-97`; TLA+ `docs/tla/APPEND_MVCC_PROOF.md` [V] |
| Full-text | BM25 lexical projection (CJK bi/trigrams, identifier splitting), `CALL text_search($q, …)` in Cypher; a **rebuildable projection caught up from the graph**, reported with its own projection epoch vs commit epoch | `README.md:159,163`, `docs/ARCHITECTURE.md:1211-1240,1261-1294`, `crates/cypher/src/parser/frontend/procedures.rs:211` [V] |
| Vector | Raw vectors canonical; filter-aware DiskANN + RaBitQ projection; `VECTOR(n)` SQL columns, exact cosine/l2 | `README.md:160,165`, `docs/SQL_SESSION.md:68-71` [V] |
| Retrieval | `retrieve_knowledge`: search → metadata filter → authorized graph expand → rerank → top-k → hydrate from pinned snapshot; fail-closed budgets | `README.md:99-116`, `src/api/retrieval.rs:10` [V] |
| Branches | Copy-on-write branches (metadata + empty WAL), durable, request-keyed idempotent create, **no merge** | `README.md:131-151` [V] |
| Transactions | MVCC; read txn pins one published snapshot; serialized durable commit; staged snapshot visible only after WAL durable; concurrent writers in-process with semantic lock scopes | `README.md:11,188`, `docs/specs/EMBEDDED_RUNTIME_SPEC.md:265-266`, `QUERY_FIRST_PUBLIC_API_SPEC.md:106-164` [V] |
| Budgets | Every read must carry row + payload budgets; over-budget **fails** (no truncation) | `README.md:192,198-213` [V] |
| Changefeed | Internal commit-ordered **identity feed** (graph node ids, relational PKs, rebuild barriers) for maintaining search projections; bounded retention; Rust-only "registered consumer" protocol. Not a general CDC/subscription API for clients | `docs/specs/SEARCH_PROJECTION_CHANGEFEED_SPEC.md:1-50`, `docs/REGISTERED_CONSUMER_CATCH_UP.md:36-70` [V] |
| Replication | **Design only**: delta-state CRDT master/slaves spec, "no implemented surface in the HawDB crates yet"; derived state (FTS/vector) never shipped | `docs/specs/HAWDB_CRDT_REPLICATION_SPEC.md:3-50` [V] |
| SDKs | Rust crate (`hawdb = "0.28"`); Python (PyPI); **Go via purego, `CGO_ENABLED=0`**, JSON rows; C ABI (`hawdb_open/query/query_sql/close` + retained numeric cursors); MoonBit. **No Node/TS addon** ("does not … provide a Node addon") | `README.md:22-43,292-311`, `bindings/go/README.md:1-5`, `bindings/ffi/README.md:1-30`, `bindings/ffi/include/hawdb_ffi.h:343-361`, `docs/SQL_SESSION.md:66` [V] |
| Wire protocol | None (not PG/MySQL wire-compatible) | `README.md:351`, `SQL_SESSION.md:62-66` [V] |
| License | Apache-2.0 | `LICENSE`, `README.md:357-359` [V] |
| Maturity | Created 2026-07-14; ~2,670 commits; v0.24→v0.28 in 5 days (2026-11-01..06); 203 stars; contributors hawkingrei 2555, Icemap 66, others ≤8 (essentially one author). "HawDB has not entered production … development databases must then be recreated"; P0 production-release blockers still open; Mem integration "nightly" | GitHub API [V]; `docs/specs/POSTGRES_RELATIONAL_CONTENT_STORE_SPEC.md:42-47`, `TODO.md:15-40`, `README.md:14` [V] |
| Quality culture | TLA+ models in CI (storage publication, MVCC, append assignment, branches), differential fuzzing (SQL/Cypher multi-oracle "shiro"), crash-recovery + power-loss qualification, CI on ubuntu x86/arm, macOS, Windows | `README.md:281-290,321-325`, `docs/tla/*`, `.github/workflows/ci.yml:33,130-136` [V] |

### What is a "thread" in HawDB?
There is **no thread primitive in the engine** [V]. "Threads" are a Nowledge Mem schema on top of HawDB:
a graph `(:Thread)` anchor node with projected activity, and messages as canonical rows in the relational
Content Store table `thread_messages` (`docs/specs/MATERIALIZED_VIEWS_SPEC.md:276-292`,
`docs/specs/POSTGRES_RELATIONAL_CONTENT_STORE_SPEC.md:18-24`). There are also Nowledge-specific typed
wrappers (e.g. `Database::delete_knowledge_threads`, `docs/NOWLEDGE_REPLACEMENT_MATRIX.md:445-454`). The
"threads + relational + text + graph in one" pitch is therefore *one engine where a thread is rows + a graph
node + a search projection*, which is exactly the pattern Ducter would also use. It is not a built-in
conversation type with its own semantics.

## 2. Deployment targets

| Target | Verdict | Why |
|---|---|---|
| Small always-on Linux box | **Yes, as a library inside your process** [V/I] | `SharedHost` profile is for "a desktop or server process" (`EMBEDDED_RUNTIME_SPEC.md:21-36`). You must write the server yourself; HawDB ships no daemon (`README.md:317,351`). The Ducter control plane is TS, so this means a Rust host or a Node FFI shim (see §4). |
| Embedded in desktop app (MyGo, Go) | **Plausible** [V/I] | Go binding is purego/no-cgo (`bindings/go/README.md:3-5`), the same no-cgo philosophy as MyGo (`04` §2). Ships a native `.dylib/.so/.dll` beside the app. JSON row boundary. Untested with MyGo [I]. |
| Mobile (Expo) | **Not yet** [V/I] | `MobileEmbedded` profile exists in the spec (`EMBEDDED_RUNTIME_SPEC.md:40-60`) but no iOS/Android targets in CI or bindings (grep found none) and no RN/Expo module. |
| Cloudflare Workers / DO | **No** [V] | WASM build is in-memory only, "a toy/development capability"; `Database::open*` rejects persistent storage on wasm; the playground "runs on the user's device, not in Cloudflare Workers" (`docs/WASM.md:1-30`). A DO's storage is its own SQLite API, not a POSIX FS. |
| CF Containers / Sandbox | **Technically, not sensibly** [I] | Native Linux binary would run, but container disk is ephemeral (`04` §3); you would rebuild durability on R2 yourself. Defeats "compute sleeps, state doesn't". |
| Browser (web client cache) | **Toy only** [V] | Same in-memory WASM limits; no OPFS persistence. |
| Footprint | **Unknown/heavier than SQLite** [I] | No size ceiling published; `docs/COMPOSITION_BASELINE.md:4,97,120` explicitly declines a package-size budget. SQL and graph are unconditional (`COMPOSITION_BASELINE.md:12-13`). Defaults compile FTS, vector, analytics, Tokio (`README.md:236-246`). Expect tens of MB binary vs ~1.5 MB SQLite [I]. |
| Backup/restore | **Yes, Rust API** [V] | `Database::backup_to`, `restore_backup`, `scrub_storage` (`src/api/database_maintenance.rs:371-392`); backups validated/hashed (`docs/STORAGE.md:520-558`). Not exposed in the C ABI (function list in `hawdb_ffi.h` [V]). Single directory → also file-level snapshots after close [I]. |

## 3. Fit per Ducter need

| Need (principle) | Fit | Reasoning |
|---|---|---|
| Append-only unbounded per-persona Log with seq cursors (1, 5) | **Excellent (semantics) / ok (shape)** | `strict_append` is *exactly* this: INSERT-only, gapless `commit_sequence` assigned at durable commit, cursor read = `WHERE partition=$p AND seq > $cursor ORDER BY seq LIMIT n` (`QUERY_FIRST…:39-83`). Caveat [V]: one partition key, **no secondary indexes**, reads must name the partition. So "events of window W" and "all persona events since cursor C" cannot both be served from one table; either partition by persona and keep a separate per-window index table, or dual-write. Also a txn with pending generated rows cannot read that table (`:69-70`). SQLite does this with one table + two indexes. |
| Typed, origin-tagged events (2) | ok | Plain columns + BYTEA/TEXT payload; no `jsonb` operators (`SQL_SESSION.md:62-64`), so payloads are opaque blobs, as in SQLite. |
| Frozen digests, cut points, byte-deterministic projections (2, 4) | **ok/good** | Pinned snapshot reads (`README.md:11`) and append-only digest rows give stable bytes. Determinism ultimately lives in Ducter's projection code, not the DB. CoW **branches** could model "re-cut experiments" but are not needed. |
| Focus Window registry, two state axes (8) | ok | Ordinary SQL table with PK; same as SQLite. Graph adds nothing here. |
| Waiters (time + predicate) (14) | ok | SQL table `waiters(due_at…)`; HawDB has no timers/alarms, the host schedules (same as SQLite on Linux; DO uses `setAlarm`). |
| Intents journal (16) | ok | Append table or PK table with idempotent `INSERT … ON CONFLICT DO NOTHING RETURNING` (`QUERY_FIRST…:16-21`). Missing `DO UPDATE RETURNING` is a small annoyance. |
| Device/machine registry | ok | Plain SQL. |
| Body-selection logs + outcomes (12) | ok/good | Append table; aggregations in SQL. Outcome history for ranking is simple GROUP BY. |
| Full-text search over Log | **Good engine, awkward path** | BM25 with CJK support is better than SQLite FTS5 out of the box for mixed CN/EN [I]. But the easy path (`CALL text_search`) indexes **graph nodes**; indexing relational/append rows needs the Rust-only registered-consumer + host mapper protocol (`REGISTERED_CONSUMER_CATCH_UP.md:36-70`). Search is an eventually-caught-up projection with its own epoch (`README.md:112`), not read-your-writes; acceptable for "find in Log". |
| Relations/graph (window ↔ PR/branch/artifact work keys, persona ↔ identity, provenance) (9) | **Excellent, but small** | Native Cypher, shortestPath, provenance traversals. However Ducter's graph is shallow (1-2 hops: "find window by work key", "what produced this artifact"), which SQLite join tables handle trivially. The graph win matters for *memory*, which lives in Mem (15). |
| Sync to clients with incremental cursors | **ok (via append cursors) / poor (as CDC)** | Clients sync by polling/streaming `seq > cursor` from the append table, same as SQLite. The changefeed is internal and Rust-only (`SEARCH_PROJECTION_CHANGEFEED_SPEC.md:1-10`); no subscription, no replication (`HAWDB_CRDT_REPLICATION_SPEC.md:3-10`). The control plane pushes over WS either way. |
| Artifacts/blobs | n/a | Out of scope by design ("External artifact and blob files remain outside this contract", `POSTGRES_RELATIONAL_CONTENT_STORE_SPEC.md:35`). R2/S3 as planned. |
| Small always-on control plane (17) | ok on Linux, **poor on CF** | See §2. |
| Laptops | ok (Rust/Go), poor (TS) | No Node addon. |
| Single-user v1, free self-deploy | good | Apache-2.0, embedded, no service to pay for. |
| Multi-writer / HA later | poor | One process per directory; replication is a design doc. |

## 4. Honest comparison

| | SQLite (DO / Node-Bun) — current plan | HawDB | Postgres |
|---|---|---|---|
| CF free tier path | **Native** (DO SQLite) | **Lost** | No (needs Hyperdrive + external PG) |
| TS control plane | `ctx.storage.sql`, `bun:sqlite`, `better-sqlite3` | C ABI via `bun:ffi`/koffi with JSON rows, or a Rust sidecar; no Node addon [V] | Mature drivers |
| Same SQL on both targets | Yes (`04` §3) | No: second dialect + strict-append rules | No |
| Append log + cursors | Table + index; app enforces append-only | **Engine-enforced** append-only, gapless commit sequence, TLA+-checked | Table + sequence/identity |
| FTS | FTS5 (weak CJK unless custom tokenizer) | BM25 + CJK n-grams, but graph-projection path | tsvector (weak CJK), pg_trgm |
| Graph | Join tables / recursive CTE | Cypher, shortestPath, PGQ | Recursive CTE, AGE ext |
| Vector | sqlite-vec ext | Built-in DiskANN/RaBitQ | pgvector |
| Branches | No (file copy) | CoW branches | No |
| Ops footprint | ~1.5 MB, decades of hardening | Tens of MB [I], pre-production, weekly breaking minors | A server to run |
| Maturity | Total | Pre-1.0, one main author, format may break (`…CONTENT_STORE_SPEC.md:42-47`) | Total |
| Team leverage | none | **High**: same team, can push features upstream | none |

**What HawDB wins:** an engine-enforced append-only log with commit-assigned sequence; real graph queries;
far better CJK lexical search; vector built in; branches; one consistent snapshot across rows+graph+search;
team ownership (features can be requested directly). **What it costs:** the Cloudflare/DO path (principle 17's
"free, always reachable" deploy), one storage dialect for both targets, a TS-native binding, operational
maturity, and a small footprint. Ducter's control-plane workload (append + PK lookups + a waiter scan + tiny
graph) is squarely SQLite's sweet spot; HawDB's differentiators (retrieval pipeline, vector, deep graph,
branches) mostly serve *memory*, which principle 15 already places in Nowledge Mem.

### Deployment shapes

**A. Recommended for v1: SQLite everywhere, HawDB-shaped port.**
`LogStore`/`RegistryStore`/`WaiterStore` port with the Log modeled as strict-append semantics (partition =
persona, generated `seq`, cursor reads with mandatory LIMIT, no UPDATE/DELETE on log tables, per-window
index table). Implementations: DO SQLite (CF) and `bun:sqlite` (Linux). FTS5 over a `log_text` table. Memory and
cross-thread knowledge go to Nowledge Mem (which itself runs on HawDB). Zero new risk; the schema stays
liftable to HawDB later.

**B. Self-host "pro" target: HawDB behind the same port on the Linux box.**
CF path keeps DO SQLite. On a user's box, the control plane links HawDB through either (1) a small Rust
sidecar ("ducter-store") exposing the port over a local Unix socket/JSON-RPC, or (2) the C ABI from Bun via
`bun:ffi`. Wins: CJK FTS, provenance graph, maybe vector recall over the Log. Costs: two backends to test
forever, no shared SQL, conformance suite required. Only worth it once a concrete feature needs it (e.g.
semantic search over years of Log).

**C. "HawDB everywhere" (not viable today).**
Requires a persistent WASM/DO-compatible storage adapter (or dropping CF as a target), a Node binding, and
mobile builds. Would also tie Ducter's release cadence to a pre-production engine. Revisit only if upstream
ships the items in §5 and Ducter decides to give up the CF free path.

A related shape worth considering instead of B: **co-host with Mem.** If the user's box already runs Nowledge
Mem (on HawDB), Ducter can push Log text/digests into Mem as Threads (Mem's own thread model) and get CJK
FTS + graph + vector "for free" via Mem's APIs, while the Log of record stays in SQLite. That uses HawDB where
it is strongest without making it Ducter's dependency [I].

## 5. Gaps, risks, and what would make it a clear yes

Risks [V unless noted]:
1. **Pre-production format**: greenfield schema may be broken destructively (`…CONTENT_STORE_SPEC.md:42-47`);
   P0 release blockers open (`TODO.md:15-40`); 5 minor releases in 5 days.
2. **Bus factor**: ~95% of commits from one author (GitHub contributors API).
3. **No TS story**: no Node addon (`SQL_SESSION.md:66`); C ABI exposes only open/query/query_sql/close plus
   numeric cursors, no backup/branch/consumer typed APIs (`hawdb_ffi.h`).
4. **No CF path**: WASM in-memory only (`WASM.md:1-30`).
5. **Strict-append ergonomics**: single partition key, no secondary index, cannot read own pending generated rows.
6. **FTS on rows** requires Rust-side registered consumer + mapper.
7. **Scope statement**: "Multi-process writers, distributed replication, cloud-primary execution … are not
   implied backlog items" (`TODO.md:8-13`), and the team itself keeps PostgreSQL as Nowledge Cloud's canonical
   store (`docs/ARCHITECTURE.md:1206-1208`). Ducter's CF control plane is "cloud-primary execution".

Upstream features that would flip this to yes (ordered by value to Ducter):
1. **Node/Bun binding** (napi-rs) with transactions, typed params, streaming cursors, backup.
2. **Declarative FTS on SQL/append tables** (`CREATE SEARCH INDEX ON log(text)`), no host mapper.
3. **Secondary index or multi-key reads on strict-append** (by persona and by window), or a covering
   "append + index" table mode.
4. **Public changefeed/subscription** (`SUBSCRIBE FROM epoch`) usable for client sync, with resumable cursors.
5. **Persistent WASM storage adapter** pluggable onto a KV/SQL page store (DO SQLite or OPFS), or an official
   `hawdb serve` binary that runs in a CF Container with R2-backed checkpoints.
6. **Stability promise**: 1.0 file-format compatibility and a published footprint budget.
7. Mobile targets (iOS/Android) + an Expo module, if local-first mobile cache ever matters.

With (1)-(4) HawDB becomes a better self-host store than SQLite for Ducter; with (5) it could be the single
backend. Until then: SQLite behind a HawDB-shaped port, Mem (on HawDB) for memory.
