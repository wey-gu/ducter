# 04 — Stack evaluation for Ducter

Date: 2026-11-08. Scope: harness layer (OAR), desktop/mobile UI (MyGo, Expo, alternatives), control plane
(Cloudflare DO vs own Linux box), machine enrollment, Nowledge Mem Bridge as message fabric.

Legend: **[V]** = verified from source/docs/API read in this session (path or URL given). **[I]** = inferred / my judgment / prior knowledge not re-checked today.

Repos cloned (read-only, nothing executed) under
`<scratch> reference app,mygo}`.

---

## 1. botiverse/oar — Open Agent Runtime

### What it is [V]
- "A provider-independent programming interface for coding-agent runtimes" — a **TypeScript library + CLI**
  (`@botiverse/oar` v0.95.0, `@botiverse/oar-cli`), ESM-only, **Node >= 24**; a portable browser entry
  (`@botiverse/oar/browser`) needs Web Crypto. (`oar/README.md`, `packages/oar/package.json`)
- One `Runtime`/`Session` API over 12 harnesses: Claude Code, Codex, Pi (+ Pi Durable), Cursor, Grok Build,
  Kimi, OpenCode, Qwen, Qoder, CodeBuddy, Antigravity, DeepSeek Harness (`packages/oar/src/runtimes/*`).
- It drives each runtime through the **vendor's own interface**, never a third-party adapter
  (`docs/design/motivation.md`): Codex = one `codex app-server` per session (JSON-RPC)
  (`docs/runtimes/codex.md`), Claude = `claude -p` stream-json, Pi = `pi --mode rpc` subprocess,
  OpenCode/Kimi/etc. = vendor ACP servers.
- Session surface: `prompt`, `steer`, `queue`, `withdraw`, `abort`, `deliver(..., {when:"interrupt"})`,
  `compact`, `dispose`, `resume: session.id`; every control returns typed accept/reject codes
  (`busy`, `no_active_turn`, `unsupported`, `runtime_exited`, ...). (`docs/design/roadmap.md`)
- **Record stream**: one ordered, lossless, attributed stream (`seq`, `agentPath` for subagents),
  `rawEvents()` keeps native payloads verbatim; `@botiverse/oar/observe` folds records into UI read models
  (status, conversation, usage, tasks, tool activity) — works in a browser (`docs/spec/record-stream.md`,
  `packages/oar/src/observe/*`).
- Also: install/update/login via vendor tools ("OAR never handles the tokens"), account usage/quota,
  model catalogs, inventories (skills/MCP/commands), config forms as data, `serveMcpTools` (host tools
  into any runtime), `@botiverse/oar/agents` + `oar mcp` (subagents on any runtime), placement
  (isolated vs shared runtime processes, gated by evidence; "No native runtime is admitted to shared
  placement today"). (`docs/design/system.md`, `roadmap.md`)
- Explicit ownership split: "**The host owns scheduling, policy, persistence, multi-controller
  arbitration, and human presentation.**" Non-goal: "being a storage/replay system". (`system.md`, `motivation.md`)

### Maturity [V] (GitHub API, 2026-11-08)
- Created 2026-08-05; **~911 commits**; 497 stars, 15 forks; releases v0.93→v0.95 all on 2026-11-07
  (very fast cadence, pre-1.0, API still moving). Apache-2.0.
- Contributors: xxchan 381, stamp-build[bot] 249, Huaihuai 31, TennyZhuang 7, ... (small core team).
- Unusually heavy evidence culture: `experiments/` has hundreds of dated probe reports per runtime version;
  vendor tests, aimock suites, "sea-trial" behavior suite, Windows CI. Docs pin runtime versions
  (e.g. Claude 2.1.319 last passed). Blog post is still "DRAFT, prepared ahead of the design freeze".

### Gaps relative to Ducter [V unless marked]
1. **No remote/network transport yet.** Roadmap item 6 "Extend control across placement": remote = a future
   `oar serve` on the agent host + thin client; "the transport binding ... has no draft yet". Today OAR is
   in-process in the host that spawns the runtimes. (`docs/design/roadmap.md` §6)
2. **No human approval flow.** Server requests (permission prompts) are recorded then auto-answered with the
   native refusal; "Deferred: `Session.answer` and a human approval flow" (`docs/design/decisions.md` ~L176-197,
   `docs/runtimes/codex.md` L70). Ducter must run harnesses in non-interactive permission modes (sandbox /
   acceptEdits / allowlists) or wait for/contribute `Session.answer`.
3. **No persistence/control plane.** Storage, scheduling, waiters, multi-client arbitration are host-owned.
4. Live `configure` (model/effort change without restart) not shipped — switch by dispose+resume.
5. Node 24 only for the subprocess runtimes [V]; cannot run Claude Code/Codex inside a CF Worker (no
   subprocesses) [I] — only inside a Container/Sandbox or on a runner box.

### Verdict
- **Harness layer: yes, strong fit** [I]. It is exactly the "N harnesses behind one evented session API" layer
  Ducter needs inside each runner, with resume, steer/queue, subagent attribution and browser-side folds.
  Its record stream is a good candidate for the Focus Window event payload (store OAR records verbatim in the
  persona log; rebuild UI with `observe`).
- **Control plane / communication layer: no.** OAR deliberately stops at the process boundary. Ducter builds:
  runner daemon (hosts OAR sessions) ⇄ outbound WS ⇄ control plane. Design the wire so it can later be
  replaced by `oar serve` if that ships (carry `seq` cursors, capability facts, native reachability).
- Risk: pre-1.0 velocity (3 releases/day); pin exact versions; wrap behind a thin internal `HarnessPort`.

---

## 2. an open-source agent app and egoist/mygo

### Correction [V]
`an open-source agent app` is **not** a fork of `an older Go webview library` (GitHub `fork:false`). an older Go webview library (2018, MIT, 8.2k stars,
last push 2024-08) is the old "Go + system Chrome via DevTools protocol" library. an open-source agent app is an unrelated
**product**; egoist/mygo is the desktop framework it is built on.

### an open-source agent app — "Telegram but single person, with agents, E2E encrypted" [V]
(`the reference app/README.md`, `ARCHITECTURE.md`, `docs/architecture/*.md`)
- Created 2026-09-18, ~481 commits, 363 stars, **GPL-3.0**, essentially single author (egoist 444 commits).
  Shipping: `mobile-v1.0.11`, `desktop-v0.1.21` (2026-10-28).
- **This is the closest prior art to Ducter itself.** Three processes:
  - Desktop app (Go, MyGo native UI) speaks only to a local **Rust CLI** over `ws://127.0.0.1:4862/ws`
    (JSON `{id,method,params}` / `{event,data}`, rejects any request with an `Origin` header).
  - Rust CLI = identity keys, agent loop (after pi-agent-core), provider creds, relay sync; runs as a
    service (`the reference app service`), signed self-updates.
  - **Relay**: Rust/axum, SQLite (single writer, WAL) or Postgres, Docker image, "zero-knowledge" store-and-
    forward of signed/encrypted blobs, APNs/FCM push endpoint. Self-hostable via `RELAY_URL`.
- Domain: Identity 1-* Device; desktop Devices are **Runners**, phones are never Runners; Bot runs on one
  Runner; Jobs, Handoffs (durable delegated requests with attempts), Routines (cron, missed-run policy),
  durable Tasks, Review queue, Secrets sealed to a Runner. Very close to Ducter's persona/FocusWindow/waiter model.
- **Coding agents** on a Runner: Claude Code via `claude -p` stream-json with `--permission-prompt-tool stdio`
  (so it *does* surface approvals to the user), Codex via `codex app-server`, OpenCode/fx via ACP, pi via
  `pi --mode rpc` (`docs/architecture/coding-agents.md` L21-25). Hand-rolled, not OAR.
- **Pairing UX** (`docs/architecture/identity.md` "Pairing a Device"): paired Device shows
  `app://pair?relay=…&id=<identity pk>&ek=<ephemeral pk>&n=<nonce>` as QR/string (10-min validity);
  new device posts a request sealed to `ek` into a relay mailbox; existing device attests it and replies with
  the account DEK encrypted to the new device's reply key. Phone scans QR. Modeled on Happy's security model.
- **Phone app**: Expo (React Native, expo-router) + the Rust device core via UniFFI as an Expo native module.
- Usefulness for Ducter: excellent design reference (pairing, relay trust, runner/device split, routines,
  handoffs). **Do not copy code** unless Ducter is GPL-3.0-compatible.

### egoist/mygo — "Desktop apps in Go, with native UI or a web frontend" [V]
(`mygo/README.md`, `docs/architecture.md`, GitHub API)
- Created 2026-09-26 (~6 weeks old), **~1,239 commits**, 5.3k stars, 322 forks, v0.8.3 (2026-11-07),
  **MIT**. Dominantly one author (egoist 833 commits; "claude" 91 commits as co-author).
- Two window kinds, mixable: (a) **system webview** — WKWebView (macOS), WebKitGTK 4.1 (Linux), WebView2
  (Windows); no bundled engine; typed IPC with a generated TS client (`mygo.Bind`, channels, events);
  (b) **native UI** in Go (`ui` package), GPU-drawn (Metal/D3D11/OpenGL/CPU), flexbox/grid, IME, a11y,
  virtual lists, offscreen tester; also compiles to WASM/WebGL2 for browsers.
- **Pure Go, no cgo** (purego dlopen trampolines) → cross-compile all desktop OSes from one machine;
  hello-world ~7 MB binary, ~35 MB RSS on macOS, 0% idle CPU.
- Ships: tray, menus, notifications, deep links, global shortcuts, signed auto-updates with deltas,
  .app/.dmg, Windows installer, .deb, PKGBUILD, notarization.
- **No mobile target** (no iOS/Android in docs) [V by grep]. It is *not* "system Chrome + Go" (that was
  an older Go webview library); it is OS webview or its own renderer.

### Is "MyGo + Expo" sensible? [I]
It is literally the reference app's stack (MyGo desktop + Expo phone), so it is proven to work for one shipping app — but
note the reference app uses **two UI codebases** (Go native UI desktop, React Native phone). For Ducter there are two shapes:
- **(A) the reference app shape**: MyGo native-UI desktop + Expo mobile + separate web. 3 UIs. Best feel, most work. No.
- **(B) Shared React UI**: one Expo app (expo-router) targeting iOS/Android/**web** (react-native-web); the
  desktop is a **MyGo webview window loading the Expo web export**, with the Go host providing tray,
  notifications, deep links, auto-update and — importantly — **embedding/launching the runner daemon** (as the reference app's
  app launches its CLI). One UI codebase, ~10 MB desktop binary. Recommended if MyGo is chosen.
- Caveats: MyGo is 6 weeks old with a bus factor ~1; WebKitGTK on Linux is the weakest webview (rendering and
  perf quirks); Go host means the runner daemon (Node, for OAR) is a separate process anyway.
- Expo DOM components (`'use dom'`) let web-React components render in a WebView on native and as-is on web;
  limits: SPA only, no children/native views inside, async-only function props, slower startup
  (https://docs.expo.dev/guides/dom-components/) [V]. Useful for reusing a rich web transcript/markdown/diff
  view on mobile; Expo's docs don't cover desktop targets [V].

### Alternatives (brief) [I unless marked]
| Option | Web | Desktop | Mobile | Notes |
|---|---|---|---|---|
| **Expo + RN-web, desktop via MyGo webview** | yes | MyGo | Expo | one React UI; small binary; MyGo young |
| **Expo + RN-web, desktop via Tauri v2** | yes | Tauri | (Expo) | Tauri v2 stable since 2024, now 2.11.x (mid-2026 report); OS webview like MyGo; Rust host; mature plugins/updater; MIT/Apache |
| **Tauri v2 for everything** | separate | yes | yes (iOS/Android) | mobile is newer and less ergonomic than desktop (secondary sources); web-UI-in-webview on phones feels less native than RN; no push/background story as good as Expo's |
| **Electron** | separate | yes | no | most mature; ~100+ MB, bundled Chromium; Node in main process can host OAR in-process (attractive!) |
| **Wails v2/v3** | separate | yes | no (v3 alpha has none stable) | Go + OS webview; older/more users than MyGo, less polish |
| **Expo only (+ react-native-macos/windows)** | yes | RN-desktop | yes | Microsoft-maintained RN desktop forks; extra native work; no Linux |

Electron deserves a note: OAR is Node 24, so an Electron (or Node-sidecar) desktop could host the runner
daemon in-process. With MyGo/Tauri, ship the runner as a separate Node SEA/binary (correction: `sea-trial` is OAR's behavior test suite, not Node SEA support; see research/17) [I].

---

## 3. Cloudflare as control plane + light compute

### Facts [V]
Durable Objects pricing (https://developers.cloudflare.com/durable-objects/platform/pricing/):
- Free: 100k requests/day, 13,000 GB-s/day, SQLite rows read 5M/day, rows written 100k/day, 5 GB total.
  Exceeding a free limit → "further operations of that type will fail with an error"; resets 00:00 UTC.
- Paid ($5/mo Workers Paid): 1M req/mo then $0.15/M; 400k GB-s/mo then $12.50/M GB-s (billed at 128 MB per
  DO regardless of use); rows read 25B/mo, rows written 50M/mo then $1.00/M; 5 GB-month then $0.20/GB-mo.
- WebSocket: connect = 1 request; incoming messages billed **20:1**; outgoing messages and pings free.
- Alarms: each invocation is a request; each `setAlarm()` = 1 row written.
Limits (https://developers.cloudflare.com/durable-objects/platform/limits/):
- Free plan: **only SQLite-backed DOs**, 100 classes, 5 GB/account (FAQ: 1 GB per DO on Free); Paid: 10 GB per
  DO, unlimited account storage, 500 classes; CPU 30 s/request default, up to 5 min; WS message 32 MiB.
Alarms (https://developers.cloudflare.com/durable-objects/api/alarms/):
- **One alarm per DO at a time** (`setAlarm` overrides); at-least-once; retries with exponential backoff from
  2 s, up to 6 retries, only on thrown exceptions; 15-min wall time per handler.
WebSocket hibernation (https://developers.cloudflare.com/durable-objects/best-practices/websockets/):
- `acceptWebSocket()` lets the DO hibernate with sockets open; duration charges stop while hibernating;
  `serializeAttachment` survives (16 KiB max); runtime auto-answers pings. **Outbound WS from a DO does not
  hibernate** (and blocks eviction up to 15 min). "Thousands of clients per instance."
Containers (https://developers.cloudflare.com/containers/pricing/): **Workers Paid only**; included per month
25 GiB-h memory, 375 vCPU-min, 200 GB-h disk; instance types lite (1/16 vCPU, 256 MiB) … standard-4 (4 vCPU,
12 GiB); billed per 10 ms while running; each container also uses a DO. Egress 1 TB/mo included NA/EU.
Sandbox (https://developers.cloudflare.com/sandbox/): `@cloudflare/sandbox`, microVM per instance started by a DO;
exec/stream/terminal, background processes, files + R2 mount, preview URLs, credential-keeping in the Worker,
snapshots; Workers Paid; has an explicit **"Coding agents" guide for Claude Code / Codex** per-task sandboxes.

### Fit assessment [I]
- **One DO per persona = natural fit.** Single-threaded actor with transactional SQLite = the event log
  (append-only `events(seq, channel/thread, focus_window, kind, payload)`), FW registry, device registry,
  waiter table. Strong consistency per persona without any DB ops. Clients and runners connect **inbound** to
  the DO via hibernatable WebSockets → idle personas cost ~0 duration.
- **Waiters/timers**: one alarm per DO → keep `waiters(id, due_at, ...)` in SQLite, always `setAlarm(min(due_at))`;
  handler drains due rows idempotently (at-least-once!), catches errors, re-arms. Standard pattern.
- **Large blobs** (attachments, transcripts, OAR raw records if large) → R2 (free tier exists [I]: 10 GB) with
  DO storing pointers. Keep DO rows small (16 KiB attachment / row-write billing).
- **Cost, single user**: free plan likely suffices for the control plane (100k req/day; a busy day of
  streaming tokens could blow through it if every delta is a WS message *into* the DO — 20:1 helps, but
  runners should **batch/coalesce deltas** (e.g., 250 ms frames) and the DO should not persist every delta,
  only turn-level records). 100k rows written/day is the tighter free limit → coalesce. Paid $5/mo removes the
  worry and unlocks Containers.
- **Credential vault**: DO SQLite encrypted at rest by CF, but CF can read it. Prefer client-side encryption
  (the reference app/Happy model: keys on devices, DO stores ciphertext; runners decrypt). [I]
- **CF Containers/Sandbox as "lightweight runner"**: good for ephemeral, per-task Focus Windows (clone repo,
  run Claude Code headless, push PR) when no user machine is awake. Not great as an always-on personal box:
  billed while running, ephemeral disk unless snapshot/R2, harness login state (Claude subscription OAuth)
  must be injected per instance → API keys more practical there. Needs $5 plan.
- **Self-deploy friction**: needs a Cloudflare account + `wrangler deploy` (or a "Deploy to Cloudflare"
  button). Free tier works without a card for DO SQLite [V: free plan allows SQLite DOs]. Users must trust CF
  (vendor lock-in; workerd is open-source, so local dev/`wrangler dev` works offline [I]).

### Alternative: control plane on the user's own always-on Linux box [I]
- Same code if written against an actor/SQLite abstraction: run on **workerd** (open source) or Node/Bun with
  `better-sqlite3`/`bun:sqlite`, one SQLite file per persona, an in-process timer wheel backed by the waiters
  table, WebSocket server. Cost $0; full data custody; can also be a runner.
- Problems: reachability from phones (needs Tailscale / CF Tunnel / public IP + TLS), uptime/backups are the
  user's job, mobile push still needs APNs/FCM relay (Expo push service is free [I]).
- Many target users don't have an always-on Linux box; Macs sleep.

### What runs where (proposed)
| Component | Default (hosted-by-user on CF) | Self-host alt |
|---|---|---|
| Persona control plane (event log, FW registry, waiters, device registry, ciphertext vault) | Worker + **1 SQLite DO per persona** | Node/Bun or workerd + SQLite on Linux box |
| Blob store | R2 | local disk / S3-compatible (MinIO) |
| Client gateway / auth / push fan-out | same Worker | same process |
| Runner daemon (OAR + harness processes, git worktrees) | user's Macs/Linux (outbound WS to DO) | same |
| Ephemeral cloud runner | CF Sandbox/Container (paid) | Docker on the Linux box |
| Memory / identity / cross-agent mailboxes | Nowledge Mem (Cloud or the user's Mem server) | same |
| Clients | Expo (iOS/Android/web), desktop shell | same |

Keep the control plane runtime-agnostic: a `PersonaActor` interface implemented by `DurableObject` and by a
Node class; storage = SQL strings that run on both DO SQLite and libSQL/SQLite [I].

---

## 4. Machine enrollment UX

Patterns [I, from product knowledge; the reference app details V]:
- **Tailscale**: `curl -fsSL https://tailscale.com/install.sh | sh && tailscale up` → prints login URL;
  browser SSO approves the node; auth keys for headless. Gives a mesh network, but Ducter would then depend on
  Tailscale accounts and still need its own app protocol.
- **Cloudflare Tunnel**: `cloudflared tunnel login` + config; outbound-only; exposes inbound services.
  Great for exposing a self-hosted control plane, overkill for runners.
- **Device-code flow** (`gh auth login`, `claude` login): CLI shows code + URL; approve on any logged-in client.
- **QR / pairing string** (the reference app, Happy, WhatsApp Web): existing device shows QR containing relay URL +
  ephemeral pubkey + nonce; new device scans; E2E key exchange via a mailbox. (`the reference app/docs/architecture/identity.md`)
- **Outbound-only WebSocket**: runner dials the control plane, no inbound ports, NAT/sleep-friendly; reconnect
  with backoff and resume from last acked `seq`.

### Recommendation
**One-liner install + device-code/QR pairing + outbound-only WSS to the persona DO.**
1. `curl -fsSL https://<your-ducter>/install.sh | sh` (or `npx ducter@x.y.z runner`) installs the runner as a
   launchd/systemd user service. The install URL is served by the user's own Worker, so the control-plane URL is
   baked in — zero config.
2. Runner generates an Ed25519 machine key, calls `POST /enroll` → gets a short code + `ducter://pair?…` URL,
   prints both and a **terminal QR**.
3. User approves on phone/web (scan QR or type code); the client signs an attestation of the machine pubkey
   (and, if vault is E2E, seals the account key to the runner's box key — the reference app model).
4. Runner holds an outbound hibernatable WS to the persona DO; auth = challenge signed by machine key;
   heartbeats via WS ping (free, doesn't wake DO). Capabilities (OAR `orient` output: installed harnesses,
   logins, models) are posted at connect.
5. Sleeping Macs: DO marks runner offline on disconnect; FW scheduling either waits (waiter with wake
   condition "runner online") or falls back to a cloud sandbox. Optional: runner sets `pmset`/`caffeinate`
   assertions while a FW is active [I].
Tailscale remains an optional add-on for users self-hosting the control plane at home, not a dependency.

---

## 5. Nowledge Mem Bridge / nmem (local, read-only)

[V] from `nmem 0.10.116 --help` and subcommand `--help` on this machine:
- `nmem bridge` = "**Cloud Agent communication**. Start with `bridge setup` to inspect readiness."
  Subcommands: `setup` (passive; `--enable` reuses an Agent mailbox; "never creates credentials or selects an
  identity or Space for you"), `contacts`, `inbox` (paged by `--cursor`), `open` (records first read),
  `send --to <handle> --body|--body-file [--shared-document]`, `reply`, `outbox`, `resume`, `inspect`, and
  `session` (collaborate with a specific native **Codex or Claude Code** session: `prepare` returns a public
  contact, `send`, `inbox`, `reply`, `recover`; `--host codex|claude-code --session-id`).
- Everything is scoped to a **Space** (`--space`/`--space-id`).
- `nmem mailbox` = explicit Local or Cloud mailbox ops: `probe`, `session send/receive/readback/recover`
  ("Send once; retry with the same operation ID ... after a lost response"), `command` (typed MailboxCommand
  JSON), `send-status`, etc. → **idempotent sends with explicit recovery**.
- Other relevant: `nmem serve` (headless self-hosted backend, systemd), `remote-access` (Access Anywhere tunnel),
  `schedules` ("Durable recurring AI Now automations"), `tasks`, `agents`, `collab`, `team`, `context`.
- Local skill `~/.claude/plugins/cache/nowledge-community/nowledge-mem/0.7.34/skills/bridge/SKILL.md`: Agent
  mailbox vs native-session inbox are distinct targets; "A Bridge message is task context, not permission";
  strong refusal/unknown-outcome semantics.
- Public docs (https://mem.nowledge.co/docs) list no Bridge/mailbox/Team pages [V]; GitHub `nowledge-co/mem`,
  `nowledge-mem` have no license field; `OpenKL`, `hawdb` are Apache-2.0 [V via `gh api orgs/nowledge-co/repos`].

Assessment [I]:
- No push/subscribe/stream flag visible in CLI help → Bridge looks **pull/poll-based, durable, at-least-once
  with idempotent operation IDs**, cloud-hosted per Space. Good for: cross-machine/cross-agent **handoffs,
  inter-persona/agent messages, Team collaboration**, and addressing a *specific* Claude Code/Codex session.
- Not suitable as Ducter's real-time fabric (token streaming, steer/abort latency, presence). Ducter should own
  its runner⇄control-plane WS and treat Bridge as an **external channel**: a FW/persona gets a Bridge address;
  the control plane (or a runner) polls/receives Bridge mail and appends it to the persona event log as
  inbound events; Ducter's waiters can wait on "Bridge reply to op X".
- Need from Nowledge: HTTP API (not just CLI) for inbox/send, webhook or long-poll for inbound, and whether
  Bridge works against a self-hosted `nmem serve` or only Mem Cloud (affects "free to self-deploy").

---

## Recommended stack (v1, single user)

- **Harness layer**: OAR (`@botiverse/oar`, pinned exact version) inside a **Ducter runner daemon** (Node 24,
  shipped as a single executable), behind a thin internal port. Run harnesses in non-interactive permission modes
  until OAR ships `Session.answer`; contribute it upstream if approvals in-app are a v1 must (the reference app shows Claude's
  `--permission-prompt-tool stdio` route works).
- **Control plane**: Cloudflare Worker + **one SQLite Durable Object per persona** (event log, FW registry,
  device registry, waiters table multiplexed onto the single alarm, ciphertext credential vault) + R2 for blobs.
  Free plan for core; $5 Paid optional for headroom + Sandbox. Code written against a portable actor+SQLite
  interface so the same control plane runs as **Node/Bun + SQLite on a user's Linux box** (second deploy target).
- **Light compute**: Cloudflare Sandbox SDK per-task Focus Windows (paid, optional); Docker on Linux box for the
  self-host path.
- **Comms**: runner and clients connect **outbound** over hibernatable WSS to the persona DO; seq-cursor resume;
  coalesced deltas. Nowledge Bridge as an external durable mailbox channel, not the transport.
- **Enrollment**: one-liner installer served by the user's own Worker + device-code/terminal-QR pairing + machine
  Ed25519 key; optional E2E key sealing à la the reference app/Happy.
- **Clients**: **Expo** (expo-router) for iOS/Android/**web** from one React codebase (DOM components for heavy
  web views like transcripts/diffs). Desktop: thin shell loading the web build + tray/notifications + embedded
  runner. Shell choice: **Tauri v2** as the safer default (mature, MIT/Apache, Rust host); **MyGo** acceptable and
  smaller if the team is comfortable betting on a 6-week-old single-maintainer project (the reference app proves it in
  production). Do not build a separate native-UI desktop in v1.
- **License hygiene**: the reference app is GPL-3.0 → design reference only. OAR Apache-2.0, MyGo MIT, Tauri MIT/Apache — fine.

## Open questions
1. Does Ducter need in-app permission approvals in v1? If yes: contribute `Session.answer` to OAR or bypass OAR for
   Claude (stream-json + `--permission-prompt-tool stdio`).
2. Is the OAR team planning `oar serve` soon (roadmap §6)? Aligning Ducter's runner wire protocol with it could
   save a rewrite.
3. Credential vault trust model: CF-readable (simple) vs E2E device-held keys (the reference app/Happy; harder recovery)?
4. Claude/Codex subscription logins on cloud sandboxes: allowed by ToS and technically portable? Otherwise cloud FWs
   are API-key only.
5. Nowledge Bridge: HTTP API, push/webhook/long-poll, self-hosted `nmem serve` support, rate limits, pricing for
   non-Team users? Does Bridge "native session" addressing map onto Focus Windows directly?
6. Free-plan budget under real use: measure WS messages and rows written per FW-hour with delta coalescing before
   promising "free".
7. Desktop shell: Tauri v2 vs MyGo — prototype both loading the Expo web export on WebKitGTK (Linux) to compare.
8. Sleeping Macs: acceptable to defer FWs until wake, or require cloud fallback by default?
9. Should a runner be allowed to *be* the control plane (always-on Linux box) with phones reaching it through
   CF Tunnel/Tailscale, or must every deploy have a public CF endpoint?

## Sources
- https://github.com/botiverse/oar (README, docs/design/{motivation,system,roadmap,decisions}.md, docs/runtimes/{claude,codex}.md)
- an open-source agent app (README, ARCHITECTURE.md, docs/architecture/{identity,coding-agents,desktop-app,phone-app,relay,protocols}.md)
- https://github.com/egoist/mygo (README, docs/architecture.md), an older Go webview library
- https://developers.cloudflare.com/durable-objects/platform/pricing/ , /platform/limits/ , /api/alarms/ , /best-practices/websockets/
- https://developers.cloudflare.com/containers/pricing/ , https://developers.cloudflare.com/sandbox/
- https://docs.expo.dev/guides/dom-components/
- https://www.mayhemcode.com/2026/07/build-mobile-and-desktop-apps-from-one.html (Tauri 2.11.x, secondary)
- https://mem.nowledge.co/docs ; local `nmem --help`, `nmem bridge --help`, `nmem mailbox --help`
