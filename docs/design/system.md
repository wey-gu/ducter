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

### The user's own harness config: partner isolated, tasks inherit (2026-11-09)

`SessionSpec.isolateUserConfig` maps to OAR `userConfiguration: "exclude"` (Claude Code:
`--setting-sources project,local --strict-mcp-config`, `claudeMdExcludes` for the user's
`~/.claude/**` memory, auto-memory and claude.ai MCP servers off; login and session history
are kept). `--bare` is not usable: it drops OAuth / subscription login.

- **Partner: always isolated.** Its behavior is Ducter's persona and nothing else. Measured
  live: the author's global `~/.claude/CLAUDE.md` ("chat in Chinese") beat "reply in the
  user's language", user plugins' SessionStart hooks injected extra context, and user MCP
  servers pushed Ducter's tools behind ToolSearch, all on the ack's critical path (20 s
  acks). Isolation cut a trivial turn from 12 s to 5 s (lead's experiment). If Codex is ever
  the partner, the same needs `-c` overrides and no user `AGENTS.md` (not built).
- **Tasks: inherit by default** (runner option `isolateUserConfig`, default false). A task
  works in the user's repo the way the user codes there: their skills, hooks, `CLAUDE.md`
  and MCP servers are deliberate choices, and a power user expects a Ducter task to behave
  like their own Claude Code session. The cost (slower start, extra context) is off the
  user's attention path, since the ack comes from the partner. Turn it on for untrusted or
  shared-machine setups.

- **Task model:** the partner may pass a model per task. If it passes none, `DUCTER_TASK_MODEL`
  applies; if that is unset, the harness's own default applies.
- **Browser tasks: isolated** (W5-2, proposed): only the curated cua-driver tools, no user MCP
  servers (which would include a path to the user's real Chrome), measured 332k → 140k input
  tokens on one lookup.

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

  *As built (partner memory slice, `packages/partner/src/memory.ts`):* writes go through the
  user's own `nmem` CLI: `nmem m add --stdin --title … --source ducter --source-app ducter
  --source-msg "ducter;persona=<id>;log=<seq>[;task=<id>]"` (nmem keeps the last under
  `metadata.source_message_id`; the CLI has no general metadata flag). Ducter passes no
  `--agent-id` and no `--space`: nmem takes the identity from `NMEM_AGENT_ID` and the Space
  from `NMEM_SPACE` or its own default, so Ducter never enrolls an identity or picks a Space.
  Missing or unreachable Mem: the tools answer "not available" and the partner carries on.
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

### Who counts as local, and what that allows

- **Local** means: the TCP peer is loopback, the `Host` is loopback, and no proxy header is
  present (auth.ts `isLocalRequest`; full rule under "Server mode" below). It is a property of
  the connection, not of a person. Every process on the machine qualifies: the desktop, the CLI,
  an SSH tunnel's far end, each task's harness and anything it runs (D16 bypass), and every
  other account on the same host.
- **What a local caller can do without a token:** everything a paired device can. That covers
  `/ws` (read the whole conversation and every task, send messages, Go/Hold, merge, open a
  PR, drop), `/api/*` (push settings, decide), and `/devices/online`. Browser pages are held
  back: a local `/ws` upgrade or `/api` POST from a browser must come from this server's own
  origin. `/mcp` still needs its HMAC role token. But a process that can read
  `<dataDir>/mcp.secret` (0600, so the same account) can mint any role token, the partner's
  included.
- **Why that is acceptable on your own Mac:** under D16 a task already runs with your account's
  full power, so local trust adds nothing it couldn't do anyway. The data dir is 0700 and the
  Log, `devices.db`, `mcp.secret`, `push.json` and `env` are 0600, so other accounts can't
  read them.
- **Shared hosts (a VPS with other human users, a multi-user Linux box): the caveat.** Other
  accounts can't read your files, but they can connect to `127.0.0.1:7777` and are local: they
  can read and drive your Ducter. Mitigation today: `DUCTER_LOCAL_TRUST=off`, which makes
  every caller show a device token (pair the desktop and the CLI like any other device).
  Limit: with it off, the main's own tasks can't reach `/mcp`, because their config carries only
  the role token. So today it suits a main that places all of its tasks on workers.
  Recommended next step (todo): a 0600 local token in the data dir. The CLI, the desktop on
  that machine and the tasks' MCP config would present it, so `off` costs nothing and can
  become the default whenever other human users exist.

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
  - *As built (2026-11-09):* the phone client is `apps/web`, a Preact bundle served by the main
    process at `/app`, with Web Push from `packages/core/src/push.ts`. It shares the desktop's
    i18n keys and Pebble tokens. Departing from D20 for phone web is pending the user
    (`flows/OPEN-QUESTIONS.md` 1.3).
  - The client protocol comes first; the two UI codebases share only the protocol, the state
    model, and design tokens.

## Server mode and remote access, first slice (D54, research/29)

**Who and when.** Mostly the heavy developer who wants the partner awake while the Mac sleeps
(Q16). A consumer who has never touched a VPS is not expected to start here; they meet a VPS only
when the partner suggests one, and then the steps below are what they copy and paste.

**Running on a server**
- One static binary per arch (`bun build --compile`, `DUCTER_TARGET=bun-linux-arm64|x64`;
  `scripts/install.sh --linux DIR` makes copyable bundles).
- `ducter up --headless`: never opens a window; a failing doctor is printed (to journald) but
  doesn't block start, so the user can pair a device and sign in an AI afterwards.
- `ducter service install` (or `install.sh --service`): a systemd **user** unit
  (`~/.config/systemd/user/ducter.service`), `Restart=on-failure`, journald logs,
  `EnvironmentFile=-~/.ducter/env` (0600; where `CLAUDE_CODE_OAUTH_TOKEN` goes, never in the
  unit). It enables linger itself when polkit allows (Ubuntu 24.04: yes, without sudo) and
  prints the `sudo loginctl enable-linger` line when not. Then it pairs the first device.
- Binds **127.0.0.1 only** unless `--host` / `DUCTER_HOST` says otherwise. A public bind prints
  a warning: no TLS, paired devices only.

**Who is local.** A request is local when the TCP peer is loopback, the `Host` is loopback,
and no proxy header (`Forwarded`, any `X-Forwarded-*`, `X-Real-IP`, `True-Client-IP`,
`X-Client-IP`, `Via`, `CF-Connecting-IP`, `Tailscale-User-Login`) is present. Local callers (the desktop on the same Mac, the CLI, the
harnesses' MCP calls, an SSH tunnel's far end) need no token, as before. `DUCTER_LOCAL_TRUST=off`
turns this off. Caveat: a reverse proxy that sends neither a proxy header nor the public Host
(nginx's default `proxy_set_header Host $proxy_host`) would look local; the only proxy setup
Ducter writes is Caddy's, which adds `X-Forwarded-For`.

**Pairing**
- `ducter pair` mints a code: 8 characters from `ABCDEFGHJKMNPQRSTVWXYZ23456789` (≈ 39 bits),
  shown as `K7QM-4XPA`, valid 10 minutes, single use. It prints the address (`public-url`, else
  the SSH tunnel line built from `SSH_CONNECTION`), the code, a link `<address>/pair#c=<code>`
  (the code rides in the fragment, which browsers never send) and that link as a terminal QR.
  On a TTY it waits and says "<device> 连上了 / is connected".
- `POST /pair {code, name, platform}` → `{token, deviceId, personaName}`. Token:
  `dvc.<10-hex id>.<32 random bytes, base64url>`.
- Storage: `<dataDir>/devices.db` (SQLite, WAL, 0600), shared by the CLI and the running server,
  so pairing and revoking work whether or not the service is up. Only SHA-256 hashes of codes
  and token secrets are kept.
- Limits: 10 wrong codes per caller address per 10 min, then 429; 30 wrong codes in total voids
  every pending code. The address is the TCP peer, or, only when the peer is a proxy on this box
  (loopback), the last `X-Forwarded-For` hop (the one that proxy saw; earlier hops are the
  client's to invent). Device names and platforms lose control characters.
- `ducter devices` lists name, kind (client / worker), platform, last seen, id;
  `ducter devices disconnect <id|unique name>` revokes at once.
- Remote `/ws` needs `Authorization: Bearer <token>` (or `X-Ducter-Device`). With a token the
  browser-origin check is skipped: a header token can't ride along ambiently like a cookie.
  Remote `/mcp` needs `X-Ducter-Device` beside its HMAC role token. Remote `/health` answers
  `{ok:true}` only.

**Reaching it**
- *Own domain (default for everyone with one, and for CN users per Q18):*
  `scripts/caddy-setup.sh <domain>`: checks DNS, installs Caddy from its apt repo, adds a site
  block (`reverse_proxy 127.0.0.1:7777`), reloads, waits for `https://<domain>/health`, writes
  `~/.ducter/public-url`. Mainland-China servers need an ICP filing for 80/443.
- *No domain:* `ssh -N -L 7777:127.0.0.1:7777 user@server`, then the address is
  `http://127.0.0.1:7777`; no code is needed, SSH is the authentication.
- *Later (D39/D46):* the Ducter Edge on `workers.dev` for phone/web without a domain, and
  Tailscale as the community adapter. Both keep this pairing.

**Desktop.** First run gains a quiet "我的 Ducter 在另一台机器上 / My Ducter is on another
machine" that opens **连接到你的 Ducter / Connect to your Ducter**: address (or the whole link)
and 连接码. The token goes to `<user config>/Ducter/connection.json` (0600, dir 0700); the
Keychain is a later upgrade. A refused upgrade from a non-loopback server brings the card back
with one line ("这台 Mac 已经和你的 Ducter 断开了"). `DUCTER_URL` + `DUCTER_TOKEN` still override.
- **Whose paths.** The welcome carries `machine`: sha256 of the main's machine id (macOS
  IOPlatformUUID, Linux `/etc/machine-id`), 32 hex, never the raw id (`core/src/machine.ts`).
  The desktop computes the same hash; only when they match does it run `git diff` on a place's
  worktree or open `file://` evidence. Otherwise those paths are the server's, so it copies them
  instead of opening them. An SSH tunnel looks like loopback but names another machine. A main
  that sends no `machine` (older) falls back to "loopback address = this machine".

**Harness logins on the server (research/29).** Doctor offers `claude auth login` (prints a URL,
waits for the pasted code; no browser on the server) and `codex login --device-auth` (enable
device login in ChatGPT first). `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token` goes in
`~/.ducter/env`; doctor shows it as "set, checked on first use" because `claude auth status`
can't tell a bad token from a good one. Relaying these flows into a client (Q17) is next.

**Demo / e2e without an AI login.** `DUCTER_SCRIPTED_MODEL=1` swaps every harness session for
OAR's scripted runtime. Its script still calls Ducter's real MCP tools over HTTP (`task_open`,
`report_to_main`) and every reply says it's a demo.

## Workers (D54; built and verified in two VMs, research/29)

A worker is a machine that runs tasks for a main process elsewhere (a VPS next to a home Mac
main, or the reverse). Principle: **it dials out, never in.** All task state stays on the main;
the worker only holds the place (disk, checkouts, worktrees) and runs the harness.

- **Join.** On the main: `ducter pair --worker` (a code whose device kind is `worker`). On the
  worker: `ducter worker --join <main address> --code <code> [--name vps-2]`, then
  `ducter service install --worker` to keep it running (no listening port on the worker). It
  pairs at `/pair`, keeps the token in `~/.ducter/worker.json` (0600), and holds one outbound
  WebSocket to `<main>/worker`, reconnecting with backoff. A client token can't open `/worker`,
  a worker token can't open `/ws`.
- **Hello.** Hostname, OS/arch, Ducter version, and which harnesses are installed and signed in.
  `ducter devices` shows `awake` while the socket is up.
- **Placement.** `Place.device` (or `{kind:"none", device}` for a place-less task) names a
  paired worker; any other name, `local`, or none means this machine, as before.
  - The runner keeps one code path and swaps **PlaceOps** (`runner/src/remote.ts`): plan and
    provision the place, start the harness session, merge, open a PR. For a worker these go
    down the socket as requests (`core/src/workers.ts`: `WorkerLink`), and
    `runner/src/worker-host.ts` runs them on the worker with its own `~/.ducter` and harnesses
    (OAR). Session events stream back up as frames and land in the main's Log like local ones.
  - Steer, send, interrupt, close and merge go back down the same way.
  - The task's MCP config points at the main's loopback `/mcp`; the worker rewrites it to the
    main's address and adds its device token. The main's gate accepts a worker token only on
    `/mcp` (beside the task's HMAC role token) and `/worker`.
  - The worker's cwd is recorded in the task's `session started` event, so a restarted main
    resumes the right session on the right disk.
- **The worker drops mid-task** (focus-window-states invariant 1, D52): the session ends with an
  *offline* frame; the task's residency becomes `offline` at once (silent); after the grace
  (2 min, `DUCTER_OFFLINE_GRACE_MS`) a working task becomes `blocked` with reason
  `device:unreachable:<name>`, which clients show as **在等 · <name> 连不上 / Waiting ·
  Can't reach <name>**. A message to it, or a new task for that device, fails with
  "<name> is not connected" and the partner says so. When the worker says hello again, the
  runner resumes the native session by id on the worker and tells it to carry on. A worker
  process that loses its socket closes its sessions (nobody to report to); idle tasks just go
  `parked` when it's back.
- **Partner.** When workers exist, each turn carries one context line
  (`[devices] local (this machine, the default) · vps-2 (awake, linux, signed in: claude-code)`);
  without workers nothing changes. The `task_open` place `device` field says to use another
  device only when the user asks or the task needs what only it has. "在 vps-2 上跑…" works.
- **Revocation.** `ducter devices disconnect` (another process) closes live device sockets
  within 10 s (close 4401); a refused worker exits 3 and its unit has
  `RestartPreventExitStatus=3`.
- **Not yet:** browser places on a worker (refused with a plain message); the A2-W confirm card
  ("vps-1 想加入 … 好，加上 / 不是我的"); placing by need ("needs Linux") instead of by name;
  queueing a task for an asleep worker instead of refusing it; reattaching a session that
  survived a socket blip (today it's closed and resumed by id).

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
- **UI:** an opened task gets a **Screen** tab: live view, plus Take over / Give it back / Pause /
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
