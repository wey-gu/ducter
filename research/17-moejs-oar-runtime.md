# 17 — moejs, and running OAR without a user-installed Node/Bun

Date: 2026-11-08. Questions: (1) have we looked at "moejs"? (2) is there now a way for the OAR-based runner
to not depend on Bun/Node?

Legend: **[V]** = verified this session from source or the GitHub API (path:line or URL). **[I]** = inferred,
judgment, or prior knowledge not re-checked today. Nothing was executed; all repos were read only.

Clones (read-only) under `<scratch>/repos/`:
- `moejs` = MoeForge/moejs @ `df42231` (2026-11-03)
- `oar-moe` = botiverse/oar @ `55c836c` (v0.95.1, 2026-11-08). This is newer than `oar-latest` (`2e235c8`).

**Short answer.** (1) No. Nothing under `research/` or `docs/` mentioned moejs before this note [V, grep].
moejs is a new **pure-Go JavaScript engine** (not QuickJS, not V8) built for plugin sandboxes, and egoist
already uses it in MyGo Music. (2) Yes, and the cheapest route is already supported by OAR's own source:
compile the runner with `bun build --compile` (or Node SEA). The user then installs no runtime, but a JS
runtime still ships inside the binary. "No JS runtime at all" means porting OAR's drivers to Go. moejs does
not change that, because it has no `child_process`, streams, net, http, or `os`, and OAR's core *is* process
control.

---

## 1. What "moejs" is

### Candidates found (`gh search repos moejs`, 2026-11-08) [V]
| Repo | What | Relevance |
|---|---|---|
| **MoeForge/moejs** | "A pure-Go JavaScript runtime built for running many small plugin sandboxes fast." Go, ★460, 13 forks, Apache-2.0 | **The one.** |
| egoist/mygo-music | MyGo music player; `go.mod` requires `github.com/MoeForge/moejs v0.1.0-alpha.11`; `internal/plugin/host.go` imports `moejs` + `moejs/webapi` | The MyGo connection: egoist uses moejs for third-party plugins |
| yxxbc/mygo-plugin | "Native plugin host for MyGo apps: moejs in-process, no WebView"; extracts MyGo Music's plugin host | Community; shows moejs is becoming MyGo's plugin engine |
| Calcium-Ion/dsh-ptc-moejs | DeepSeek Harness PTC runtime that runs model-written TS in moejs in a sidecar | Agent-adjacent use; claims 0.42 ms/call vs 110 ms for dsh's Node runtime (their benchmark) |
| Hoshino-Yumetsuki/moejs-wasm, Yachiiiiyo/moejs, luojiyin1987/lint-md-moejs | small experiments | none |

There is no egoist repo named moejs. egoist's link is as a **consumer** (mygo-music), not the author [V].

### MoeForge/moejs facts [V unless marked]
- **Author/activity:** created 2026-09-24; main contributor Calcium-Ion (15 of ~18 commits; this account also
  owns QuantumNous/new-api [I]). Last push 2026-11-03. Releases `v0.1.0-alpha.10` (10-24) and `alpha.11`
  (10-27). The module path moved from `github.com/Calcium-Ion/moejs` to `github.com/MoeForge/moejs` at alpha.11
  (`README.md` "Quick start"). The README says: "moejs is in alpha, and the API may change between releases."
- **Engine:** its own engine written in Go: `engine/`, `compiler/`, `bytecode/`, `syntax/`, about 157k
  non-test Go LOC. It is not a QuickJS or V8 binding. `go.mod` has only `testify` (tests) and yaml (indirect).
  It builds with `CGO_ENABLED=0`, so it is **cgo-free** (`README.md` "Pure Go").
- **Language:** ES modules + scripts, classes and private fields, async/await, generators, Proxy, BigInt,
  `structuredClone`, `TextEncoder/Decoder`. It passes 80,971 test262 tests with 0 failures and skips 14,268
  (README "JavaScript support"). Missing: `using`/`DisposableStack`, decorators, iterator helpers, import
  attributes and JSON modules, `FinalizationRegistry`, Temporal (`TODO.md`). It strips TypeScript types
  (`CompileTS`), but enums, parameter properties and namespaces with values are not supported.
- **Perf (their benchmarks):** 6.9 µs per plugin call vs Sobek 14.3, modernc QuickJS 35.2, v8go 56.6. A new
  runtime costs 1.4 µs and about 81 KiB (README table). It is built for many short sandboxes, not long-lived
  Node programs.
- **Host APIs:**
  - `eventloop`: setTimeout/Interval/Immediate. `timers/promises` is not provided.
  - `webapi`: fetch, Headers/Request/Response, Web Streams, AbortController, EventTarget, URL, performance,
    TextEncoder/DecoderStream (`webapi/webapi.go:4,419-429`). No Blob, FormData, or **WebSocket**.
  - `node`: only **`node:fs`, `node:fs/promises`, `node:buffer`**, all confined to an `os.Root` sandbox
    (`node/modules.go:32-35,77-79`; `node/node.go:18`). It has no fs streams or file handles.
- **Node compat gaps relevant to OAR** (`TODO.md` "the other `node:` modules"):
  - no `child_process`, `stream`, `readline`, `net`, `http`, `os`, `path`, `events`, `util`, `crypto`,
    `worker_threads`, or `module`;
  - no `process` global; no `crypto.randomUUID` (grep of moejs Go sources finds none);
  - no CommonJS `require`;
  - no npm resolution: every `import` goes through a Go `Importer` the host writes (`docs/guide.md:478`).
  - dsh-ptc-moejs provides `node:path/util/timers` itself, as its own shims.
- **Embeddability in Go:** this is its main design goal. Host functions are plain Go funcs, which can return
  promises settled from goroutines (`docs/guide.md` "Asynchronous host functions"). It supports
  `Interrupt`, `MemoryLimit`, and per-runtime globals. In principle a Go host could expose spawn/pipes to JS.

---

## 2. What OAR actually needs at runtime (oar-moe @ 55c836c) [V]

### Declared support
- `packages/oar/package.json` and `packages/cli/package.json` set `"engines": { "node": ">=24.0.0" }`. Both are
  ESM, with tsconfig target ES2023 / module NodeNext (`tsconfig.base.json`).
- Portable entries: `@botiverse/oar/browser` (`src/browser.ts`: contracts, registry, session kernel,
  observe) and `./observe`. `src/observe/**` and `src/contracts/**` import **no `node:` module** (grep).
  They need only `globalThis.crypto.randomUUID` (`observe/turns.ts:189`, `shared/session-kernel.ts:117`).
- **Bun and Node SEA single-file hosts are explicitly anticipated in source:**
  - `shared/shell-environment.ts:99-107`: "A compiled host cannot evaluate -e". The code detects
    `Bun.isStandaloneExecutable` and `node:sea` `isSea()`, then returns `no_node_runtime`, unless the host
    supplies a subcommand that calls `writeShellEnvironmentCapture(marker)` (`contracts/shell-environment.ts:32`).
  - `runtimes/pi/rpc/launch.ts:10`: "A single-file host must provide command for Pi subprocess execution".
    By default Pi RPC runs `process.execPath` + the bundled `pi-coding-agent/rpc-entry` (`launch.ts:8,21`), so
    it reuses the host's Node.
  - `runtimes/cursor/native-environment.ts:10-11`: "A variable specifier preserves runtime package discovery
    when the host bundles OAR."
  - There is no Deno-specific code. Bun appears only in that detection.
- Correction to `research/04` L146: `sea-trial/` is OAR's **behavior test estate** (`sea-trial/README.md:1`),
  not Node SEA.

### Imports in non-test `packages/oar/src/**/*.ts` (counted occurrences)
`node:path` 62 · `node:os` 24 · `node:crypto` 24 · `node:fs` 23 · `@agentclientprotocol/sdk` 20 ·
`node:fs/promises` 17 · `@earendil-works/pi-coding-agent` 17 · `node:child_process` 10 · `node:timers/promises` 5 ·
`@earendil-works/pi-durable` 5 · `node:stream` 4 · `cross-spawn` 4 · `node:url` 3 · `node:string_decoder` 3 ·
`node:readline` 3 · `node:net` 3 · `which` 2 · `undici` 2 · `node:http` 2 · `pi-ai` 2 · `chord/context` 2 ·
`node:util`, `node:module`, `dotenv`, `strip-json-comments` 1 each.

Where the hard ones live:
- **child_process / cross-spawn:** `spawn`, `execFile`, and `execFileSync`. Used for the process table, tree
  kill, and signals in `shared/executable/*` (about 2.1k LOC), and in `shared/login.ts` and
  `shared/acp/terminal.ts`. This is the core of every subprocess driver.
- **stream / readline / string_decoder:** stdio framing in `shared/acp/process.ts`, `executable/process.ts`,
  `pi/rpc/*`, and `dsh/bridge.ts`.
- **net / http:**
  - `mcp/http.ts` and `mcp/serve-tools.ts` (`createServer`) are the HTTP MCP server for host tools. Ducter's
    tool server depends on this.
  - The `net.Socket` users are `pi/rpc/extension.ts` and `executable/process-table-command.ts`.
- **crypto:** mostly `randomUUID`, plus `createHash`, `randomBytes`, and `timingSafeEqual`.
- **`process.*`:** platform 68, env 56, cwd 24, pid, kill, arch, stdout, emitWarning.
- **`import.meta.resolve` / `createRequire`:** the Pi and Cursor SDK discovery paths.
- **Not used:** `worker_threads`, PTY libraries (node-pty), sqlite, `bun:*`, and Deno APIs (grep). The one
  "sqlite" hit is a comment about Codex's own DB (`runtimes/codex/session.ts:285`).

### Native or Node-only payloads
- `@cursor/sdk` (optional peer): "a large bundle with a native companion package per platform" (ripgrep +
  tree-sitter vendor) (`runtimes/cursor/sdk.ts:158`).
- Pi in-process mode runs `@earendil-works/pi-coding-agent` *inside the host JS runtime* (`runtimes/pi/index.ts:30-64`),
  which is a Node program. Pi also ships `bun build --compile` binaries (`pi-mono/scripts/build-binaries.sh:133`),
  so `execution: "subprocess", command: "pi"` avoids that.
- Claude (`runtimes/claude`) and Codex (`runtimes/codex`) import neither pi nor cursor (grep). They spawn the
  user's installed `claude` / `codex app-server`. Per-runtime subpath exports (`"./runtimes/*"`) let a host
  load only those.

### Size and churn
- Non-test TS LOC (`packages/oar/src`): total **38.8k**.
  - shared 10.2k (executable 2.1k, acp + stream-json 4.3k), observe 4.1k
  - codex 3.6k, pi 3.1k, claude 2.8k, cursor 1.7k, kimi 1.2k, dsh 1.1k, grok 1.0k
  - qwen 0.7k, qoder 0.7k, opencode 0.7k, codebuddy 0.5k, pi-durable 0.5k, antigravity 0.4k
- Churn: **≥100 commits since 2026-11-01** (API page cap hit) [V]. Releases v0.93 to v0.95.1 in two days.

---

## 3. Feasibility matrix: OAR without a user-installed Node/Bun

| Option | User installs a runtime? | JS runtime inside? | What breaks | Effort | Risk | Footprint | Upkeep vs daily OAR |
|---|---|---|---|---|---|---|---|
| **(c1) `bun build --compile` runner** | no | yes (Bun) | Shell-env capture needs a host subcommand (`shell-environment.ts:99-107`). Pi needs `command` (use the pi binary). Cursor native companion not embedded (skip Cursor or ship it alongside). Bun vs Node 24 semantics are not what OAR's CI targets [I]. | **days** | medium: OAR tests on Node, not Bun [I] | ~60-100 MB binary [I] | low: rebuild per OAR pin |
| **(c2) Node SEA runner** | no | yes (Node 24) | Same three items; SEA needs a bundled single entry (esbuild/rolldown) + postject [I]. Exactly OAR's `engines` target. | days to 1 week | **low** (same engine as OAR's CI) | ~90-120 MB [I] | low |
| **(c3) `deno compile`** | no | yes (Deno) | `node:` compat is broad but not OAR-tested. `import.meta.resolve` and npm layout differ [I]. No source accommodation in OAR. | 1-2 wks | medium-high | ~80-100 MB [I] | medium |
| **(a) moejs inside the Go/MyGo process** | no | yes (moejs, Go) | Everything in §2's hard list. You must write Go-backed shims for child_process (spawn, stdio pipes, signals, `ChildProcess` EventEmitter), stream/readline/string_decoder (or bundle `readable-stream`/`events` polyfills), os, path, crypto, `process`, net.Socket, and http.createServer. You also need an npm `Importer`, and must pre-bundle OAR to ESM. Alpha engine with an API in flux; module path already changed once. | **4-8 wks** to a Claude+Codex subset, then a long tail [I] | **high**: OAR's subtlest code (process trees, cancellation, Windows) runs on a shim nobody else tests | smallest (+ few MB) [I] | **high**: every OAR release can touch a new Node API |
| **(b1) goja/Sobek + goja_nodejs** | no | yes (Go) | goja_nodejs gives require, console, buffer, url, process (partial) [I]. Same shim gap as (a). Slower than moejs per their bench. goja ★7.2k, active (pushed 2026-11-07); Sobek is the Grafana/k6 fork [V API]. | 4-8 wks | high | small | high |
| **(b2) QuickJS via wazero (fastschema/qjs) or modernc** | no | yes | Same shim gap. WASM boundary makes async host I/O awkward [I]. fastschema/qjs last push 2025-12 [V API]. | 6-10 wks | high | small-medium | high |
| **(b3) v8go (cgo)** | no | yes (V8) | Breaks MyGo's cgo-free cross-compile (`research/04` L113). rogchap/v8go last push 2024-08. Only the tommie fork is active [V API]. Still no Node APIs. | 6-10 wks | high | +30-50 MB [I] | high |
| **(d) Port the drivers Ducter uses to Go** | no | **none** | Lose OAR's evidence estate (experiments, aimock, sea-trial) and its 12-runtime breadth. Must re-derive vendor quirks. | Claude + Codex + shared core: ~3.6k + 2.8k + about 4-6k of shared ≈ **10-12k TS LOC → ~10-15k Go**; **6-10 wks** for one engineer [I]. Pi RPC +2-3 wks. | medium (protocols are documented by OAR's docs/experiments) | smallest | **highest**: a fork that falls behind a project committing 100+/week |

Notes:
- (a) and (b) are the same problem. The engine is the easy part. The real work is a **Node-API emulation layer
  for process I/O**, and moejs only reaches parity there for fs and buffer. moejs is better than goja on speed
  and memory, but OAR is one long-lived program per runner, so per-call µs and per-runtime KiB do not matter.
- Running OAR in the MyGo client process also conflicts with the topology in `design/system.md`. Runners
  are separate dial-out daemons on Macs and Linux boxes, and the client is GPU UI + WASM. A Go-embedded OAR
  would have to run headless on Linux boxes anyway, so one shared runner binary is better than an in-client
  engine.
- The harness CLIs themselves set a floor: Claude Code is a native installer binary or an npm (Node) package
  [I], Codex is Rust, and pi is a bun-compiled binary or npm. Ducter can avoid *its own* Node dependency, but a
  user who installed `claude` via npm already has Node. That is their choice, not Ducter's.

### Where moejs *does* fit Ducter [I, not run]
- **`@botiverse/oar/observe` in the Go client.** It has no `node:` imports [V] and needs only a `randomUUID`
  shim (one Go `NativeFunc`). The MyGo client could fold OAR record streams into read models with OAR's own
  folds, with no Go reimplementation and no WebView. That would keep the client and runner semantics
  identical. Pre-bundle observe to ESM and serve it through the `Importer`. Worth a spike.
- **User/persona plugins in the client** (the MyGo Music model: `mygo-plugin`): sandboxed, memory-limited,
  interruptible.
- Small Ducter-side scripts (predicates, waiters' cheap transforms) if wanted.

---

## 4. Recommendation

**Now (v1): ship the runner as a single compiled binary. Prefer Node SEA; Bun `--compile` is acceptable.**
- This already meets "the user installs no Bun/Node": the one-line installer drops one `ducter-runner` file.
  OAR's source explicitly handles both single-file host kinds [V]. The Ducter-side work is small:
  1. add a `ducter-runner shell-env-capture` subcommand that calls `writeShellEnvironmentCapture(marker)`,
     and pass it as the capture command;
  2. configure Pi with `execution: "subprocess", command: <pi binary>`;
  3. load only `runtimes/claude`, `runtimes/codex`, `runtimes/pi` subpaths; leave Cursor out until its native
     companion is shipped next to the binary;
  4. add a CI job that runs OAR's `sea-trial` mock and aimock suites *against the compiled binary* on each OAR
     pin bump.
- Prefer **Node SEA**, because it matches OAR's `engines: node >=24` and CI. Bun gives faster builds,
  easier cross-target, and smaller binaries, but OAR is not tested on it [I]. Pick one after a 1-day spike
  that runs sea-trial on both.
- Note that `system.md` §Storage mentions `bun:sqlite` for the Linux-box control plane. If the runner is Node
  SEA, use `node:sqlite` (Node 24) or keep the control plane as a separate binary. Do not mix in by accident.

**Later: "no JS runtime at all" only if it pays for itself.**
- Keep `HarnessPort` narrow (already the design), so a Go implementation can replace OAR one runtime at a time.
- Trigger to port: OAR's churn stabilizes (1.0 / design freeze, which their blog draft mentions), *and* binary
  size or startup actually hurts. Then port Codex app-server first (JSON-RPC, cleanest protocol), then Claude
  stream-json. Keep OAR as the oracle: replay OAR fixtures (`tests/replay/`) against the Go driver.
- Do not run OAR on moejs/goja. It is the most expensive option, it tracks a fast-moving target, and it ends up
  with a JS runtime in the binary anyway.

**Watch:**
- moejs adding `node:child_process` and streams. Nothing in `TODO.md` plans them; it lists only "the other
  `node:` modules" as unimplemented.
- OAR's roadmap item 6, `oar serve` (`research/04` §1). A remote transport would let the runner stay a black
  box regardless of the language.

**Honest framing for the user:**
- *"No runtime dependency for the user"*: achievable now, for days of work (compiled single binary).
- *"No JS runtime anywhere in Ducter"*: only by porting the drivers to Go, ~6-10 engineer-weeks plus ongoing
  divergence from OAR.
- moejs does not change that. Its best use for Ducter is in the client (observe folds, plugins), not as
  OAR's host.

## Sources
- https://github.com/MoeForge/moejs: `README.md`, `TODO.md`, `docs/guide.md` (§Node.js modules L1414-1618,
  §Event loop L1000-1031, Importer L478), `node/modules.go:32-79`, `webapi/webapi.go:4,419-429`, `go.mod`
- https://github.com/egoist/mygo-music (`go.mod`, `internal/plugin/host.go:26`), https://github.com/yxxbc/mygo-plugin,
  https://github.com/Calcium-Ion/dsh-ptc-moejs (README)
- https://github.com/botiverse/oar @ 55c836c: `packages/oar/package.json`, `packages/cli/package.json`,
  `src/shared/shell-environment.ts:99-109`, `src/contracts/shell-environment.ts:21,32`, `src/runtimes/pi/rpc/launch.ts:8-21`,
  `src/runtimes/pi/index.ts:30-64`, `src/runtimes/cursor/{sdk.ts:158,native-environment.ts:1-25}`, `src/browser.ts`,
  `src/observe/turns.ts:189`, `src/shared/session-kernel.ts:117`, `sea-trial/README.md`
- `pi-mono/scripts/build-binaries.sh:133`, `pi-mono/packages/coding-agent/package.json:35` (pi ships bun-compiled binaries)
- GitHub API (2026-11-08): repo metadata for dop251/goja, dop251/goja_nodejs, grafana/sobek, rogchap/v8go, tommie/v8go,
  fastschema/qjs, buke/quickjs-go; commit counts for botiverse/oar and MoeForge/moejs
