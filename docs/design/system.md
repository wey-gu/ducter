# System: Adapter, Identity, Safety, Storage

> Design note for principles 15–19 · Evidence: `research/03`, `04`, `05`, `07`, `08`, `09`,
> private `10`.

## Adapter over OAR (principle 15)

- The runner is TypeScript on the **latest** OAR, behind Ducter's own narrow `HarnessPort`.
  Each Ducter release locks one verified OAR version and upgrades continuously.
- **The runner ships as one compiled binary** via `bun build --compile` with **Bun pinned to
  1.4.4** (1.3.1 lacks `getSystemErrorMap`). It builds in about 0.5 s, comes out at
  103 MB / 44 MB gzipped, and cross-compiles to Linux from a Mac. Node SEA (official
  nodejs.org binary, `codesign --sign -` on macOS) is the CI fallback, since OAR is tested on
  Node. A live Claude Code turn ran from the binary with no node or bun on PATH [18].
  Ducter-side requirements:
  - a `shell-env-capture` subcommand that must not call `process.exit`, whose output is
    **never logged** because it contains secrets;
  - setting `SHELL` and `USER` when the environment is stripped;
  - pi as a subprocess, or with the captured env copied into the runner's env;
  - Cursor deferred.

  Still untested: Linux and Windows runs, the MCP tool server inside the binary, and OAR's
  suites against the binary.
- **Declared capabilities**: prompt override, history synthesis, fork / fork-at-message,
  read-fold support, mid-run injection, cache telemetry, TTL, **cache scope** (prefix vs.
  thread), and config isolation.
- **The Ducter tool server** goes into every harness. It is small (well under 20 tools) and
  fixed at session start.
- **Practices to adopt from Raft:**
  - pure-function recycle decisions;
  - an outbox with sequence numbers for lifecycle frames;
  - a hold-before-send check so the model never acts on stale context;
  - a circuit breaker on repeated identical errors;
  - auth errors go to the user; quota errors back off;
  - known-bad CLI versions are blocked;
  - tests use fake runtimes that fail on forbidden calls, a fake clock, and snapshots of every
    prompt string.

- **Task model:** the partner may pass a model per task. If it passes none, `DUCTER_TASK_MODEL`
  applies; if that is unset, the harness's own default applies.

## Waits (principle 16)

Waiters live in a table, multiplexed onto one alarm per Durable Object. Handlers are
idempotent because alarms can fire twice. Predicates are polls, webhooks, or timers.
Semantic predicates run on the cheapest capable model, and only when their observed input
changes.

## Identity and Mem boundary (principle 17)

- **Persona and windows.** A persona is one Mem AI Identity. Its windows run as that same
  identity, selected by setting `NMEM_AGENT_ID` in the window's environment.
- **L1** is built from the identity's stable sections (read without Working Memory) and
  hashed by Ducter. Changes are adopted only at cut points. Working Memory enters as an L4
  delta.
- **Writes to Mem.** Ducter writes only its own persona, via compare-and-swap, and user edits
  win. It also writes distilled memories and, if the user opts in, finished window
  transcripts. It never mirrors the channel and never creates Spaces without opt-in.
- **Provenance on every Mem write.** It records *who*, *through what*, and *from where*:
  - who: the persona's AI Identity (`agent_id`), set wherever Mem accepts it;
  - through what: `source_app = ducter`;
  - from where: the window ID and the Log pointer, in Mem's source/link metadata where
    supported, never mixed into the memory text.

  So every memory traces back to the exact Log events, and windows are never separate authors.
- **Everything else is read-only**: the user's skills, global rules, Working Memory, Spaces.
- **Subscriptions** are used only through the user's own unmodified official binary, for
  themselves. There is no proxying and no impersonation, which is why Ducter is
  self-deployed. Example: pi's Anthropic "stealth" login is out.
- **Skills, plugins, and harness config** are owned and maintained by the user in each
  harness's native place, and windows inherit them by default. Ducter keeps no skill
  registry.
- **Config isolation.** The main AI isolates harness config where the harness allows it.
  OAR's `userConfiguration: "exclude"` works only on Claude and Cursor.

## Safety (principle 18)

- **No per-call approvals.** Harnesses run with approvals off.
- **Scope what a window holds.** Credentials are issued per environment through a proxy and
  never enter model env, args, or files.
- **Gate the effects.** High-stakes external effects that Ducter mediates (pushes, PRs,
  messages, calls, spending) are logged as intents before they run. A user policy decides
  which need approval and defaults to mostly auto-approve. A resumed worker checks the world
  against its intents before repeating anything.
- **Isolation is only as strong as the environment.** A sandbox is strong; the user's Mac is
  not, and Ducter says so.

## Storage and topology (principle 19)

- **Storage port** shaped like an append log: a partition, a gapless commit sequence, cursor
  reads.
  - v1 runs on SQLite: one SQLite Durable Object per persona, or `bun:sqlite` on a Linux box (the runner
    is a Bun binary).
  - Indexes: FTS5 with a CJK tokenizer, plus vectors (`memory.md`).
  - Moving to HawDB is in `docs/todo.md`.
- **Topology**
  - The control plane (Worker + Durable Object, or a Linux box) holds the Log, waiters,
    registry, intents, and the push fan-out.
  - Runners on Macs or Linux boxes dial out only, over one WebSocket.
  - Blobs go to R2 or S3.
- **Enrollment.** A one-line installer served by the user's own Worker. The runner generates
  its key and shows a code and a QR; the user approves it from phone or web.
- **Clients**
  - Desktop and web: MyGo native UI (Go, GPU-drawn, also WASM).
  - Mobile: Expo.
  - The client protocol comes first; the two UI codebases share only the protocol, the state
    model, and design tokens.

## Hooks v1 must leave open for phone and call (research/22)

Phone and call tasks are on the roadmap, not in v1. These seams keep them from forcing a
redesign later:

- **Environment port** in the runner, beside `HarnessPort`: worktree, folder, and browser
  now; phone (ADB / WebDriverAgent MCP) and call later.
- **Place** as a typed union carrying an `isolation` field (for honest isolation claims,
  principle 18).
- **Per-task MCP sidecars:** each environment can attach its own MCP server to the task's
  harness.
- **Media relay** over the runner's outbound socket, for screen mirroring and live call audio.
- **General intent schema** with a `human_reply` field: tap-to-send, pay, and submit become
  intents. Payments always need a human.
- **Takeover state:** the human takes control of a live environment (phone screen, call),
  then hands it back.
- **Environments hosted on the control plane** (a call needs no runner).

## Screen places: browser and computer use (research/23; confirmed D47, D48)

- **One family, built on cua:** a *browser* place is a *computer* place running a
  Ducter-owned Chromium profile. Both are driven by **cua-driver** (MIT; MCP over stdio + CLI;
  reads the accessibility tree first; typed Chromium tools). That gives one sidecar, one live
  stream, one takeover model, and one isolation story.
- **Sandboxes:**
  - Linux containers under gVisor (default for browser);
  - macOS VMs under Lume (≤2 per Mac, ~50 GB each);
  - QEMU/Firecracker VMs.

  Checkpoints and forks are available. The in-sandbox daemon **spacesd** (MCP, live H.264/Opus
  video, separate human and agent cursors) is **FSL-1.1-MIT**: fine for self-deployed Ducter,
  but it would block a future hosted offering.
- **Default browser profile:** one persistent profile per persona per device, in a long-lived
  Linux sandbox.
  - Logins happen through takeover, so passwords never reach the model.
  - The profile is an exclusive resource: a second browser task for the same persona waits.
  - Attaching to the user's **real Chrome is off in v1**. It becomes a v1.x per-task opt-in
    with a red "no isolation" chip.
- **env-gate:** a runner-side MCP proxy in front of spacesd. It:
  - keeps the tool list to about 12;
  - wraps page text as untrusted data;
  - applies a domain policy;
  - turns submit and pay actions into intents (payments always need a human);
  - blocks the agent during takeover.

  Video is relayed over the runner's outbound socket.
- **UI:** an opened task gets a **Screen** tab: live view, plus Take over / Hand back / Pause /
  Snapshot.
- **Fallback backend:** agent-browser (Vercel, Apache-2.0) behind the same `EnvironmentPort`.
- **No validation spike (D47):** integrate cua-driver directly and fix issues as they appear.
- **Credentials (D48):** Ducter keeps logged-in persistent profiles and a credential vault per
  persona, so it can work on the user's accounts over time (e.g. running social accounts).
  Details follow `research/25`.
- **Risks:**
  - cua deprecates fast (Cloud, agent, and computer-server retired in 2026), so pin exact
    versions;
  - VPS datacenter IPs draw CAPTCHAs, so prefer running browser places on a home Mac;
  - prompt injection is contained, not solved;
  - each live sandbox needs about 1–2 GB RAM.

### v1 slice on the host Mac (built 2026-11-09, `packages/runner/src/browser.ts`)

What runs today, before sandboxes and spacesd:

- **Driver:** Ducter starts its own cua-driver daemon per data dir on a private socket, via
  LaunchServices so that macOS grants stay with CuaDriver. The daemon gets
  `CUA_DRIVER_BROWSER_PROFILE_ROOT=<dataDir>/browser-profiles`. The task's harness runs
  `cua-driver mcp --socket <it>`. The profile is `isolated_named` `<persona>`. Gate:
  `DUCTER_BROWSER` (0 / 1 / unset = auto).
- **env-gate, first slice (no proxy yet):** a browser task sees 10 cua-driver tools.
  Everything else the driver offers, including `page` and `end_session`, is denied.
  - Claude built-ins are limited to `Bash, Read, Write, ToolSearch`.
  - The user's own Claude config is left out (`userConfiguration: exclude`): no user MCP
    servers (so no path to the real Chrome), skills, or CLAUDE.md.
  - Live, the same HN lookup went from 332k to 140k input tokens.
- **Focus:** a freshly launched Ducter Chrome makes itself frontmost. Ducter hands focus back
  to the user's app (only within 5 s of launch).
- **Clean quit:** cua-driver ends its browsers with SIGKILL, which loses recent cookies. Ducter
  quits the browser itself (CDP `Browser.close`) when a task is done, failed, or dropped.
- **Status line:** when a task navigates to a new site, the runner logs a `task_event`
  `{role:"system", text:"Looking at <host>", raw.browser:{host, url}}`. The client renders
  it in the user's language.
- **Known limit:** the driver closes an idle browser after 300 s. A task waiting on the user
  loses its window, but sign-ins finished more than ~30 s earlier are kept and the task
  reopens it.

### Proposed: the Ducter browser's identity (DRAFT, for review; not a decision)

The problem: the Ducter browser is a second, identical Google Chrome (same Dock icon, same
window chrome), so a user cannot tell it from their own. The proposal uses Ducter's own
DevTools side channel (browser-level chores only, never page content). It is built and on
by default in the slice, so it can be reviewed live:

- **Dock tile:** the clay avatar (`ducter_working`) replaces the Chrome icon on the second
  Dock tile (`Browser.setDockTile`).
- **Parked window:** about 60% of the screen, bottom-right of the available area, behind the
  user's work (`Browser.setWindowBounds`).
- **Status line:** "在 Ducter 的浏览器里看 github.com / Looking at github.com in Ducter's
  browser", with a **Show** action that brings the window forward.

Alternatives considered: minimise the window (hides the agent, and screenshots of a
minimised window may fail), or a Chrome theme colour (needs edits to the profile's
Preferences). Open question: `flows/OPEN-QUESTIONS.md` (W5-1).

## Credentials and logged-in profiles (D48, research/25)

The model follows the Muse pattern: the *session* (a persistent profile) is kept separate from
the *secret* (a vault). The model never sees passwords or one-time codes.

- **Encryption:** the profile root (`CUA_DRIVER_BROWSER_PROFILE_ROOT`) lives on an encrypted
  volume per persona per device. Chromium on Linux encrypts cookies with a fixed key, so the
  volume must do the encryption.
- **Vault (`credd`):** one per persona per device. Sources: a local store, 1Password, or
  Bitwarden.
- **`site_login`:** a gate-side tool that verifies the site, pauses the agent, fills the form,
  and scrubs secrets from the output.
- **2FA:** a push to the phone (take over, or tap "I approved it"). TOTP is opt-in. For
  passkeys, sign in once by takeover and reuse the session.
- **Login health:** checked per site, with re-login prompts. A "Logged-in sites" view per
  profile lets the user sign out of any site.
- **Per-site policy:** draft-first for posting, rate limits with jitter, and a stop after two
  consecutive write errors. A Grok-bot user's X account was frozen after its scheduled retries.
- **Audit log** of every fill and every write.
- **Open before building the fill:**
  1. whether cua-driver's `browser_type` echoes typed text back in its result;
  2. whether the encrypted volume survives a gVisor sandbox restart.
