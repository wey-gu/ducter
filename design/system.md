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
  acks). Isolation cut a trivial turn from 12 s to 5 s (lead's experiment). Every harness has
  its own way to the same clean setup (D85, below).
- **Tasks: inherit by default** (runner option `isolateUserConfig`, default false). A task
  works in the user's repo the way the user codes there: their skills, hooks, `CLAUDE.md`
  and MCP servers are deliberate choices, and a power user expects a Ducter task to behave
  like their own Claude Code session. The cost (slower start, extra context) is off the
  user's attention path, since the ack comes from the partner. Turn it on for untrusted or
  shared-machine setups.

- **Task model:** the partner may pass a model per task. If it passes none, `DUCTER_TASK_MODEL`
  applies (Claude Code); if that is unset, the harness's own default applies.

### First-wave harnesses (D85, research/34)

One table (`packages/protocol/src/harnesses.ts`), one adapter (`packages/runner/src/oar.ts`
`adaptSpec`). What differs per harness:

| | Claude Code | Codex | pi | DeepSeek Harness |
|---|---|---|---|---|
| Partner (v1) | yes | yes | tasks only until it passes the partner eval | same |
| Clean setup | OAR `userConfiguration: "exclude"` | `-c` overrides: each user MCP server `enabled=false` by name, `features.{hooks,plugins,apps,memories,…}=false`, `notify=[]`; partner also drops goals, subagents, images, computer use | pi flags `--no-skills --no-context-files --no-prompt-templates --no-extensions --no-themes` on its RPC process | Ducter-owned `DSH_HOME` + `DSH_AGENTS_HOME` under `<dataDir>/harness/deepseek-harness` |
| Partner prompt | system prompt | `baseInstructions` | system prompt | `$DSH_HOME/AGENTS.md` (OAR refuses its system prompt) |
| Task brief | append | `developerInstructions` | append | first message, `<instructions>…</instructions>` |
| Ducter's MCP | HTTP + bearer | HTTP + bearer | HTTP + bearer | stdio bridge (`mcp-bridge.ts`), target in a 0600 file |
| Tool denial | built-ins | MCP tools only | none wired (pi's `--exclude-tools` unverified) | none (refused) |
| Runs as | `claude` | `codex app-server` | `node <OAR's bundled pi rpc-entry>` (Bun cannot host it), else the user's `pi` | `dsh --profile acp` |
| Signed in | `claude auth status`, or a `CLAUDE_CODE_OAUTH_TOKEN` in `<dataDir>/keys.env` | `codex login status` | a provider key in `~/.pi/agent`, the env or `keys.env` | a DeepSeek key in the env, `<dataDir>/keys.env`, or DSH's credential file |
| Keys it is given (D102) | `CLAUDE_CODE_OAUTH_TOKEN`, `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN` | `OPENAI_API_KEY`, `CODEX_API_KEY`, the `env_key` its `config.toml` names | its provider keys, not `DEEPSEEK_API_KEY` | `DEEPSEEK_API_KEY` |

- **The brain** is `Settings.brain = { harness, model? }` (default Claude Code + opus). The
  partner reads it at each session start; a session id never crosses harnesses (the prompt
  hash covers the harness; Claude Code keeps the prompt-only hash so upgrades still resume).
- **Tasks** take the partner's choice, else the top of `fw_candidates` (D89: rules, then the tier
  table) among the accounts `Settings.taskAccounts` leaves on. Its limit-left step needs a
  limit a harness reports; none does yet (D133).
- **One tool-name form:** an MCP tool is `mcp__<server>__<tool>` whatever the harness reports;
  reasoning a model writes into its reply (`…</think>`) is dropped before the Log.
- **Keys for API-key harnesses** live in `<dataDir>/keys.env` (0600, `KEY=value`; D102), never
  in the Log, a setting or a process environment, and go only to the harness the row above
  names (the Devices field is not built). Keys an older install left in `<dataDir>/env` move
  there on start.
- **A harness child's environment is an allowlist** (D102, `packages/runner/src/child-env.ts`),
  never Ducter's own environment inherited whole:
  - the basics: PATH, HOME, user, shell, locale (`LANG`, `LC_*`), terminal, temp folder, time
    zone, `XDG_*`, `GIT_*`, proxies, CA bundles, the SSH agent socket, common toolchain homes;
  - Ducter's non-secret `DUCTER_*` settings;
  - the harness's own non-secret settings: `CLAUDE_*`/`ANTHROPIC_*`, `CODEX_*`/`OPENAI_*`,
    `PI_*`, `DSH_*`;
  - the keys above, from Ducter's environment or `keys.env`; then what the session spec sets.
  - Any other name that looks like a key, token, secret or password is removed, whatever its
    prefix. The probes (installed, signed in, models) run with the same environment.
  - Built as an OAR env overlay (null removes), so OAR's own removals still apply.
  - Claude Code and Codex sign in from their own stored logins (Keychain or
    `~/.claude/.credentials.json`; `CODEX_HOME/auth.json`); the live task test passes on both.
  - A task no longer inherits tokens such as `GITHUB_TOKEN` from the shell Ducter started in.
- **Helpers Ducter runs itself get an allowlist too** (D102, `packages/protocol/src/tool-env.ts`):
  the basics (paths, user, locale, temp folder, proxies, CA bundles, `XDG_*`) plus the helper's own
  settings, and no other secret-shaped name.
  - nmem (memory and Bridge): `NMEM_*`, its own API key included.
  - git in the user's repo (worktrees, merge, push): `GIT_*` settings, the SSH agent, GnuPG.
  - gh (a draft PR): git's, plus `GH_*` and the user's own `GH_TOKEN` / `GITHUB_TOKEN`.
  - The doctor's probes: a harness sees what its session would (the list above), nmem and git
    their own, anything else the basics.
  - A check (D112) has its own, narrower list (`packages/protocol/src/checks-run.ts`).
  - Not yet scoped: the cua-driver spawns of the browser (`packages/runner/src/browser.ts`).
- **The partner's session is read-only** (principle 6, `SessionSpec.readOnly`; per harness in
  `design/conversation.md` "Executors"). Bypass stays (D16): nothing asks, the write and run tools
  are simply not there. Not narrowed yet: DeepSeek Harness.
- **Known gaps:** Codex's global `AGENTS.md` and `personality` are not left out (unverified);
  Codex lists the partner's sessions in the user's own history; pi's model list does not test
  its keys; in its owned home DeepSeek Harness sees only the DeepSeek key, not the user's other
  provider routes.
- **Browser tasks: a clean setup** (W5-2, D62): only the curated cua-driver tools and no user
  MCP servers, measured 332k → 140k input tokens on one lookup. Their `log_search` / `log_read`
  are scoped to their own task (D62; built in `packages/core/src/tools.ts`). Reaching the user's own Chrome is
  allowed since D126; the harness's own browser tools are in "Screen places" below.
- **Codex tasks keep Codex's own Computer Use and browser use** (D130): `cua_repl` (a bundled
  plugin) reaches any app, including the user's signed-in Chrome. Under a clean setup a task
  (`keepNativeTools`) keeps plugins on, turns off by id every plugin the user enabled except
  `browser`, `chrome`, `unified-computer-use` and `computer-use` (`@openai-bundled`), and keeps
  the desktop app's `node_repl` server; the partner's clean setup still sets
  `features.plugins=false`, the only switch that removes `cua_repl` (research/38). Plugin ids go
  in bare (`-c plugins.chatcut@chatcut-inc.enabled=false`); a quoted id is not matched. Every
  Codex task outside a browser place gets the Computer Use rules in its brief
  (`codexComputerBrief`) and the tripwire below, armed once it reaches for Chrome.

## Waits (principle 16)

Waiters live in a table, multiplexed onto one alarm per Durable Object. Handlers are
idempotent because alarms can fire twice. Predicates are polls, webhooks, or timers.
Semantic predicates run on the cheapest capable model, and only when their observed input
changes.

## Identity and Mem boundary (principle 17)

- **Persona and windows (D141).** A persona is one Mem AI Identity, bound once and kept in
  `persona.json` (`mem {agentId, space?, owned, label?}`): the user's own `NMEM_AGENT_ID` (with
  their `NMEM_SPACE`) when Ducter runs with one, adopted and never edited; else `ducter`,
  adopted if it exists, else enrolled with the partner's name and source app `ducter`, no Space
  of its own. A key that may not enroll (a Cloud team member's) binds the id without a profile:
  Mem records the id on writes either way. Its windows run as that same identity: the session
  spec sets `NMEM_AGENT_ID` (and `NMEM_SPACE` when bound) explicitly, and no other NMEM_*
  reaches them. A rename keeps the id and, for an identity Ducter enrolled, updates its name.
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
  `metadata.source_message_id`; the CLI has no general metadata flag) `--agent-id <persona's
  identity>` and `--space` only when the binding has one; search passes the same `--space`, and
  the L1 bundle is read with `--agent-id`. Verified live (D141 (6)): the stored record carries
  `metadata.agent_id`, `metadata.source_app = ducter` and `metadata.source_message_id`. Missing
  or unreachable Mem: the tools answer "not available" and the partner carries on.
- **Bridge (DRAFT, `bridge.md`).** Agents Ducter didn't start reach the persona through its Mem
  Agent mailbox, never a harness session. Ducter only reads that inbox and replies to messages
  already in the Log, under a named Agent Context the user approved. It never runs setup, enrolls an
  identity, or picks a Space.
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
- **Gate the effects.** High-stakes external effects that Ducter mediates (messages, posts,
  calls, spending) are logged as intents before they run. A task's own `git push` and pull
  request are not gated (D132): a task may push its branch and open a PR itself, and what went
  out is recorded where Ducter sees it (the report, the transcript, Sent out). A user policy decides
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
  Log, `devices.db`, `mcp.secret`, `push.json`, `env` and `keys.env` are 0600, so other accounts can't
  read them.
- **Shared hosts (a VPS with other human users, a multi-user Linux box): the caveat.** Other
  accounts can't read your files, but they can connect to `127.0.0.1:7777` and are local: they
  can read and drive your Ducter. Mitigation today: `DUCTER_LOCAL_TRUST=off`, which makes
  every caller show a device token (pair the desktop and the CLI like any other device).
  Limit: with it off, the main's own tasks can't reach `/mcp`, because their config carries only
  the role token. So today it suits a main that places all of its tasks on workers.
  **Decided (D57):** a 0600 local token in the data dir, presented automatically by the CLI,
  the desktop on that machine and the tasks' MCP config. Once it exists, every caller shows a
  token, loopback included, `DUCTER_LOCAL_TRUST` is retired, and an SSH-tunnel client connects
  once with a code like any other device. Until then Ducter is not recommended on a shared
  host.

## Storage and topology (principle 19)

- **Storage port** shaped like an append log: a partition, a gapless commit sequence, cursor
  reads.
  - v1 runs on SQLite: one SQLite Durable Object per persona, or `bun:sqlite` on a Linux box (the runner
    is a Bun binary).
  - Indexes: FTS5 with a CJK tokenizer, plus vectors (`memory.md`).
  - Moving to HawDB is in `design/todo.md`.
- **Topology**
  - The control plane (Worker + Durable Object, or a Linux box) holds the Log, waiters,
    registry, intents, and the push fan-out.
  - Runners on Macs or Linux boxes dial out only, over one WebSocket.
  - Blobs go to R2 or S3.
- **Enrollment.** A one-line installer served by the user's own Worker. The runner generates
  its key and shows a code and a QR; the user approves it from phone or web.
- **Clients**
  - Desktop: MyGo native UI (Go, GPU-drawn).
  - Web (D58): `apps/web`, a Preact bundle served by the main process at `/app`, phone first,
    with Web Push from `packages/core/src/push.ts`. It shares the desktop's i18n keys and Pebble
    tokens. A MyGo WASM web client is not planned.
  - iPhone (D131): a native SwiftUI shell (`apps/ios`) around the same phone client, with APNs
    and Go / Hold / Reply on a decision's notification; TestFlight public beta
    (`design/release/ios.md`). Expo is not planned.
  - **Notifications to the iPhone app (D159, research/45).** APNs takes pushes only under the
    app publisher's key, so a home reaches the public app through the **notification relay**:
    one Vercel Node function next to the website (`apps/site/api/push/[op].ts`,
    `https://ducter.ai/api/push`), holding the APNs key; runbook `design/release/push-relay.md`.
    - *Flow:* the app registers its device token with the relay and gets an opaque handle (the
      token encrypted under the relay's own key; the relay keeps no token list). It sends the
      home the token, the handle and the phone's 32-byte key over the paired API
      (`POST /api/push/subscribe {apns: {token, env, topic, relay, key}}`). The home encrypts
      each notification for the phone (`packages/core/src/push-relay.ts`: AES-256-GCM, AAD
      `ducter-push-v1`, padded to 256-byte steps, collapse id = HMAC of the item) and posts
      `{handle, d, collapse, category}` to the relay; the relay sends Apple a neutral `loc-key`
      alert with `mutable-content: 1` and `d`. The extension `DucterNotify` (shared keychain group
      `<team>.<bundle id>.shared`, `apps/ios/Shared/PushCrypto.swift`) puts the words back.
    - *What the relay learns:* the device token (inside the handle), when a push goes and its
      padded size, whether it is a decision (the category), and the caller's address (kept only as
      a keyed hash in a rate counter). Store: Upstash Redis via REST, revoked handle ids (400 days)
      and counters (1 h / 1 day).
    - *Ways out of a home:* its own APNs key if `apns.json` is set (straight to Apple, encrypted
      the same way; the relay when Apple answers 403), else the relay (`DUCTER_PUSH_RELAY`,
      default `https://ducter.ai/api/push`, `off` to turn it off). Disconnecting a device, turning
      notifications off or connecting the app elsewhere revokes the handle.
    - *Tests:* `apps/site/test/push-relay.test.ts` (fake APNs), `packages/core/test/push-relay.test.ts`
      (fake relay, through core), and one vector both sides open
      (`packages/core/test/fixtures/push-vector.json`, `apps/ios/scripts/check-push-vector.sh`).
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
  `EnvironmentFile=-~/.ducter/env` (0600; non-secret settings only). Keys, such as
  `CLAUDE_CODE_OAUTH_TOKEN`, go in `~/.ducter/keys.env` (0600), which the unit never loads
  (D102); `service install` moves any key it finds in `env` there first. It enables linger itself when polkit allows (Ubuntu 24.04: yes, without sudo) and
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
`~/.ducter/keys.env` (D102: passed to Claude Code only); doctor shows it as "set, checked on
first use" because `claude auth status` can't tell a bad token from a good one. Relaying these flows into a client (Q17) is next.

**Demo / e2e without an AI login.** `DUCTER_SCRIPTED_MODEL=1` swaps every harness session for
OAR's scripted runtime. Its script still calls Ducter's real MCP tools over HTTP (`task_open`,
`report_to_main`) and every reply says it's a demo.

## Workers (D54; built and verified in two VMs, research/29)

A worker is a machine that runs tasks for a main process elsewhere (a VPS next to a home Mac
main, or the reverse). Principle: **it dials out, never in.** All task state stays on the main;
the worker only holds the place (disk, checkouts, worktrees) and runs the harness.

- **Join (D83).** One code for every kind of device: `ducter pair`, or the app's 连上手机或另一台
  电脑 / Connect a phone or computer, mints a code with no kind (`pair_codes.kind = "any"`). The
  device says what it joins as when it redeems the code at `/pair`: `role: "worker"` from
  `ducter worker <main address> --code <code> [--name vps-2]`; no role (the web, iOS and desktop
  clients) is an app (`client`). Any other role value is an app. One-time use, the 10-minute
  expiry and the lockouts don't change. A worker gets strictly less than an app (`/worker` and
  `/mcp` only), so letting the code holder choose grants nothing new. `ducter pair` and the
  app's code card print both ways to use the code. `ducter pair --worker` (a code fixed to
  `worker`, for older workers that send no role) and `--join <address>` stay as hidden aliases.
  Then `ducter service install --worker` keeps it running (no listening port on the worker): a
  systemd user unit on Linux, a LaunchAgent `co.nowledge.ducter.worker` on a Mac (D155: RunAtLoad,
  KeepAlive on an unclean exit, `<dataDir>/worker.log`; a worker the main refused exits 0 under
  launchd, `DUCTER_SUPERVISOR=launchd`, so it isn't restarted). It
  keeps the token in `~/.ducter/worker.json` (0600) and holds one outbound WebSocket to
  `<main>/worker`, reconnecting with backoff. A client token can't open `/worker` (403, which
  `ducter worker` reports as "joined as an app" and stops), a worker token can't open `/ws`.
- **The Mac app's one tap (D155).** With the app connected to a home elsewhere, **让这台 Mac 也替
  {home} 做事 / Let this Mac do tasks for {home}** (this Mac's card, Settings › 在哪儿运行) asks the
  home for a code over the app's authenticated socket (`pair_code`, as for the CLI in D147),
  redeems it with `role: "worker"` and `computer: <host>`, writes `<dataDir>/worker.json` (0600,
  the file `ducter worker` reads) and loads the LaunchAgent above with the bundled helper
  (`apps/desktop/internal/local/worker.go`). Off: the LaunchAgent is booted out and removed,
  `worker.json` goes, and the app sends `disconnect_device` for the worker. The token never
  enters the plist. Only from a settled Ducter.app (not the disk image).
- **One computer, one card (D155).** `/pair` takes `form` (`"cli"` for the command line,
  `"app"`) and `computer` (the host it runs on), kept in `devices.db` (`form`, `computer`
  columns) and sent as `reach.clients[].form/computer` and `devices[].computer`. A CLI paired
  before D155 is known by its name `CLI on <host>`. Clients fold: a CLI into the worker or app
  window on its computer, an app window into a worker on its computer; each folded device keeps
  its own token and its own 断开 (a quiet line in the computer's card). A lone CLI shows as a
  computer named after its host.
- **Name (D84).** A worker is known by its paired name (the machine's hostname unless `--name`),
  never by what its hello says. The person can rename it: `rename_device` from the app (改名字 on
  its card) or `ducter devices rename <id|name> <new name>`. Renamed names stay unique among live
  devices and can't be this machine's host name or `local`. D155: a default name another live
  device of the same kind already has gets ` · 2`, ` · 3`… at pairing (an app window and a worker
  on one computer may share their computer's name). Phones and windows rename the same way, and
  so does the home: its name is a display name in `<dataDir>/device-name`, while it still
  answers to its host name and `local`. Former names are kept
  (`former_names` in `devices.db`), so a task placed by the old name still finds its worker; a
  rename from the CLI reaches the running main on its next device sweep (10 s).
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

## Updating in place (D148, built 2026-11-10)

**Who and when.** The heavy developer with a VPS home and a worker or two, and anyone the
partner once helped onto a server: a new version is out and they want it everywhere, with one
tap, without SSH. A Mac home keeps the app's own updater (D72); this section is everything else.

**Knowing** (`core/src/release.ts`, `protocol/src/version.ts`). The version is
`packages/cli/package.json`'s (the release tag must equal it). `/health` says `version` beside
`build` (local callers only). A worker's hello says `version` and `how`. The home reads
`api.github.com/repos/wey-gu/ducter/releases/latest`, else the `github.com/…/releases/latest`
redirect (version only), at most every 6 h (`<dataDir>/updates/latest.json`); a failure is
silent and keeps the last answer; `DUCTER_UPDATE_CHECK=off` never asks; drafts and pre-releases
never count; tests never touch the network (`NODE_ENV=test` without a feed turns it off).
Every `DeviceView` carries `update {current, latest, available, notes, security, how, phase…}`.

**How a device updates (`how`).** `self`: a compiled Linux `ducter`. `app`: a Mac whose ducter is
inside Ducter.app (the app's updater does it; on that Mac the card's button calls
`App.updateThisMac`: restart into a ready copy, else Settings' update card). `source`: from a
checkout. `manual`: a worker that sent no `how` (before 0.0.4).

**The staged update** (`core/src/update.ts`, one path for the home, a worker and the CLI):

| Step | What is checked |
|---|---|
| precheck | `to` is a version; not the same; older only with `--to` (`downgrade`) |
| disk | ≥ 300 MB free in `<dataDir>/updates/<v>/`, and ≥ 3× the download once its size is known |
| download | `SHA256SUMS.txt`, then `ducter-<v>-linux-<arch>.tar.gz`, from `github.com/wey-gu/ducter/releases/download/v<v>/`, HTTPS, redirects only to GitHub hosts |
| verify | the SHA-256 equals the listed sum, else the folder is removed (`checksum`) |
| self-check | unpack; `<new> --version` names `<v>`; `<new> doctor --json` in a scratch data folder prints `checks` (`selfcheck`) |
| safe point | no merge, undo or keep running (the runner's critical section; new ones are held with a plain line), ≤ 15 min (`busy`); turns in flight get ≤ 2 min, then the restart's recovery resumes them |
| swap | the running binary hard-linked to `ducter.prev`, the new one renamed over `ducter` (same folder, atomic) |
| restart | `systemd-run --user --collect` runs `ducter.prev update --finish <dataDir>/updates/plan.json` in its own unit (so `systemctl --user restart ducter`, which kills the service's cgroup, can't kill it) |
| health | the home: `/health` names `<v>` within 60 s; a worker: it reached its main and wrote `updates/alive.json` with `<v>` |
| rollback | not healthy: `ducter` → `ducter.failed`, `ducter.prev` → `ducter`, restart again; `result.json` says `health` and `rolledBack` |

Without systemd it swaps and says to restart. Each step is a `device_update` event on the
`devices` stream; the restarted home logs the helper's `result.json` once (`reported`), and a
restarted worker says it in its hello. The card shows 回来了 30 min, a failure 24 h.

**Workers.** The home sends `update {to, explicit}` down the worker's socket; the worker answers
at once and reports `{t:"update", phase…}` frames up whichever socket is current
(`cli/src/update.ts` `createWorkerUpdater`); its safe point is the worker host's critical ops
(merge, archive, folder undo/keep) and turning sessions.

**CLI.** `ducter update [--check] [--all] [--json] [--yes] [--to <v>]`. With a Ducter answering
on this machine it goes through it (`device_update` frames, its safe point, its Log); without
one (a worker machine) it runs the staged update itself, restarting the service when
`systemctl --user is-active ducter` says so. `--all`: workers first, then the home.

**At night** (`settings.autoUpdate`, off by default): every 10 min, inside quiet hours, nothing
working and nothing critical: behind workers first, then the home.

**Simulated, not yet run on a real systemd box:** every step above runs in tests with fakes (fake
fetch, a fixture tarball, fake systemctl and `/health`, a fake worker socket); the end-to-end on
Linux waits for the 0.0.4 release.

## Updating the AI agents (D156, draft, built 2026-11-10)

**Who and when.** The same VPS owner, a week later: Codex shipped a new version, a task on the
server still runs the old one, and they don't want to SSH in to run npm. Or a fresh user who
never knew there was a version at all: their card says so quietly, and at night it is taken
care of, but only to versions Ducter has checked.

**Knowing** (`core/src/harness-probe.ts`, `core/src/agents.ts`). Each installed agent that answers
its own `--version` gets `version` and `how`, from where its binary really lives (`agentHow`, the
marks are harness-facts `channels`, research/42):

| `how` | Real path | Latest from | Update | Pins (rolls back) |
|---|---|---|---|---|
| `npm` | `…/lib/node_modules/<pkg>/` | `registry.npmjs.org/<pkg>/latest` | `<prefix>/bin/npm --prefix <prefix> install -g <pkg>@<v>` | yes |
| `brew` | `…/Caskroom/<token>/` | `formulae.brew.sh/api/cask/<token>.json` | `brew upgrade --cask <token>` | no |
| `installer` | Claude Code `…/claude/versions/`; Codex `…/packages/standalone/`; pi: `managed-install.json` above it | the installer's pointer (`downloads.claude.ai/claude-code-releases/latest`, npm for Codex, `pi.dev/api/latest-version`) | newest: `claude update` · `codex update` · `pi update --self`; any other version: `claude install <v>` · `install.sh --release <v>` | Claude Code, Codex yes; pi no |
| `app` | inside `Codex.app`, `Claude.app`, `Application Support/Claude/claude-code/` | none | never (updates with the app) | n/a |
| `ducter` | pi inside Ducter (a checkout) | none | with Ducter | n/a |
| `unknown` | anything else (pnpm, yarn, bun globals) | none | never | n/a |

The home reads each channel once per 6 h (`<dataDir>/updates/agents-latest.json`), silent when
offline, never with `DUCTER_UPDATE_CHECK=off` or in tests without a fetch seam. Workers say
`version` and `how` in their hello; the home reads their channels. Each agent in the devices
frame carries `latest`, `available` (newer and updatable), `standing` (installed vs the verified
range) and `latestVerified`.

**The update** (`updateAgent`, one path for the home, a worker and the CLI): detect the copy
fresh → **safe point**: no task turn on that agent on that device and, on the home, no partner
turn on it (≤ 30 min, `busy`) → hold new task sessions on it on the home (`runner.holdHarness`,
≤ 15 min) → run the plan (≤ 10 min) → read the version back. Not answering: put the old version
back where the channel pins (`version`, `rolledBack`). Unchanged: `unchanged` (or `failed` with
the updater's last line). Signed in before and not after: back where it pins (`signed_out`).
Every phase (`waiting`, `updating`, `checking`, `done`, `failed`) is an `agent_update` event on
the `devices` stream; the card shows done 30 min, a failure 24 h.

**Workers.** `agent_update {harness, to, latest}` down the worker's socket; the worker answers at
once, runs the same update with its host's `turningOn(harness)` as the safe point, sends
`{t:"agent_update", phase…}` frames, then `{t:"agents", harnesses}` so the home sees the new
version.

**Night.** With `settings.autoUpdate` on, inside quiet hours: one agent per 10-minute look, on an
awake device, signed in, nothing on it working, to `nightTarget`: the channel's latest when it is
inside harness-facts' verified range, else (a pinning channel) the newest verified version not
past the latest. Nothing outside the range is installed without a tap.

**CLI.** `ducter update --agents [--check] [--json] [--yes] [--all]` (`cli/src/update-agents.ts`):
through the running Ducter when there is one (`agent_update` frames), else detect, read and run
the updaters in-process.

**Simulated vs verified.** Facts per channel were read on a Mac (research/42, read-only); the
probe script reads every channel live. Every update path runs in tests with a fake registry and
a fake npm/brew/claude (`core/test/agents.test.ts`, `cli/test/update.test.ts`); no real
install was run. Todo: a real npm and native round on a server.

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
  - A task may also use the user's **own Chrome** (D126), through the harness's own browser
    tools (below).
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

- **Which driver (D126, D130):** the harness's own tools by default, cua-driver as the fallback.
  `DEFAULT_BROWSER_DRIVER = native`; `DUCTER_BROWSER_DRIVER=cua` forces cua-driver. pi and
  DeepSeek Harness always get cua-driver. No sidecar and no Ducter browser on a native path;
  Ducter never closes the user's Chrome (the brief says to close what it opened). The probes
  live in `packages/protocol/src/native-browser.ts`, shared with Your devices and abilities.
  - **Claude Code:** Claude in Chrome (`--chrome`, with the clean setup and the four built-ins
    kept) when it is connected at task open: a live bridge socket
    `/tmp/claude-mcp-browser-bridge-<user>/<pid>.sock` (Chrome started Claude Code's host), else
    one read-only `list_connected_browsers` call to `claude --claude-in-chrome-mcp` (no model,
    ~2 s, minimal env, cached 30 s). Not connected: cua-driver. If a call still answers "Browser
    extension is not connected", the runner moves that task to cua-driver in place: the old
    session closes, the spec swaps the native brief and flags for cua-driver's, the session
    resumes by id with a turn saying so, and a system line reads "Claude in Chrome isn't
    connected; switched to Ducter's own browser".
  - **Codex, browser tools:** when the desktop app's browser access host reaches Ducter (its env
    carries `BROWSER_USE_ACCESS_PIPE_PATH`, `_EXECUTOR_ID`, `_VERIFYING_IDENTITY` and the pipe
    exists, i.e. Ducter was started under the app), they pass through to Codex (child-env) and
    the brief says `cua.createBrowserTab("iab", …)` (its own profile) or `("chrome", …,
    { sessionName })` for sign-ins, tab-scoped. Ducter never reads these values from another
    process.
  - **Codex, Computer Use:** otherwise. It drives Chrome as an app and types into the front
    window, so the brief says: open a window first from the shell (`open -na "Google Chrome"
    --args --new-window "<url>"`, never ⌘T in the user's window), check the focused window by URL
    or title before every batch of keys, never type into a page it didn't open, close its window
    when done.
  - **Codex's setup:** both run under the clean setup that keeps only the four browser /
    computer-use plugins and `node_repl` (spec `userConfiguration: "exclude"` on Codex); verified,
    only `cua_repl` and `node_repl` carry tools.
  - **The tripwire (code):** Claude in Chrome and Codex's browser tools act by tab id, so they
    can't type into the user's tab. For Codex Computer Use the runner watches each finished
    `cua_repl` call; keys (`typeText`, `pressKey`, … but not ⌘N) before any window-opening step
    trip it once: a system line, and a steer telling the task to stop and open its own window. It
    runs after the call, so it limits damage rather than preventing the first keystroke.
- **Every session start rebuilds the browser (runner `prepareSpec`):** opening, recovery after a
  restart, reopen, resuming a parked task and a switch of who does it all start from the task's
  spec without browser parts (`base`) and add the browser for the harness doing it now
  (`withBrowser`): the brief with its Go and own-window rules, the cua-driver sidecar, and per
  harness the setup that leaves the user's own config out: Claude Code its four built-ins,
  denials and `exclude`; Codex the clean setup that keeps its own browser and Computer Use
  plugins (on either driver); pi its clean flags. DeepSeek Harness keeps its own setup for now
  (its Ducter-owned home holds the partner's instructions). Before this, a recovered or reopened
  browser task resumed with none of it.
- **Driver (cua):** Ducter starts its own cua-driver daemon per data dir on a private socket, via
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
  it in the user's language. A native driver adds `own: true`, and the app says 在你的 Chrome
  里看 {host} / Looking at {host} in your Chrome instead of Ducter's browser.
- **Known limit:** the driver closes an idle browser after 300 s. A task waiting on the user
  loses its window, but sign-ins finished more than ~30 s earlier are kept and the task
  reopens it.

### On a server: Ducter's own browser (D151, research/39; built 2026-11-10, `packages/core/src/browser/`)

A headless Linux server has no desktop for cua-driver and neither harness brings a browser there,
so the main process holds one.

- **Runtime (`chrome.ts`, `host.ts`):** Chrome for Testing Stable (`chrome`, linux64 /
  linux-arm64; macOS builds for tests), installed into `<dataDir>/browser/<version>`,
  recorded in `installed.json`; else `DUCTER_CHROME`, else a non-snap system Chrome or Chromium.
  Started `--headless=new`, DevTools on 127.0.0.1 port 0 (read from `DevToolsActivePort`),
  `--user-data-dir=<dataDir>/browser-profiles/<persona>`, `--password-store=basic`, the plain
  Chrome user agent, `--no-sandbox` only as root. Chrome's stderr goes to
  `<profile>.log`. CDP over Ducter's own small WebSocket client (`ws-client.ts`): Bun 1.3's
  client negotiated permessage-deflate with Chrome and then failed inflating its frames.
  One browser per profile, started on demand, quit with `Browser.close` when no task and no
  live view uses it (at once on release, else after 5 idle minutes, and on shutdown). A Chrome
  from a crashed Ducter still holding the profile is found by its `SingletonLock` pid and quit.
- **Install (`installChrome`):** the CfT JSON index, the zip, `unzip` or `python3 -m zipfile`
  (then chmod), `ldd` for missing libraries, the zip's `deb.deps` mapped to apt names (`t64`
  when apt has it), `fonts-liberation` and `fonts-noto-cjk`; installed with apt-get as root,
  else returned as the one `sudo apt-get install …` line. Then one headless start that must
  answer CDP. Devices drives it (`setAbility web on`), and so does `ducter ability add browser`.
- **Tools (`tools.ts`):** `browser_open, _read, _click, _type, _press, _scroll, _back, _tabs,
  _screenshot, _ask_sign_in` on Ducter's MCP, `registerWhen` only for tasks the runner attached
  (`DucterBrowserPort.attach` in the sidecar's `ready`, `release` on done). Each task works in
  tabs of its own (pages its tabs open join them). Reads come from an in-page walker
  (`reader.ts`) that numbers what can be acted on and never returns a password or
  one-time-code field's value; typing into those is refused; only http(s) URLs open; reads are
  labelled as the page's own text. Downloads go to the task's scratch folder.
- **Runner (`browser.ts`):** on Linux (or `DUCTER_BROWSER_DRIVER=ducter`) a browser place's
  sidecar is the `ducter` driver: no stdio MCP, `ducterBrowserBrief`, the clean per-harness
  setup as for other browser places, no Codex Computer Use rules. Not ready: the task can't
  open, with the words to fix it.
- **Live view (`live.ts`):** `live_open {decisionId}` from a pending sign-in card →
  `setLive(profile)` (blind) → a second CDP session on the task's tab →
  `Emulation.setDeviceMetricsOverride` at the viewer's size and ratio (≤ 2) →
  `Page.startScreencast` JPEG q60. CDP frames are acked at once; the client gets the newest
  one only after acking the last (3 s timeout), at most 8 a second. `live_input` maps fractions
  to CSS pixels (`Input.dispatchMouseEvent`, `mouseWheel`, `insertText`, key events), only from
  the socket that opened the view; a second window takes it over. `live_close done` → blind off,
  the site remembered in `<profile>.sites.json`, the card resolved with Go (the forward says the
  user signed in themselves). A dropped socket closes its views. Nothing is logged.
- **Sites (`sites.ts`):** the remembered sites with their cookie counts (`Storage.getCookies`),
  sign-out by `Network.deleteCookies` + `Storage.clearDataForOrigin`, clear all by
  `Storage.clearCookies`.
- **Which browser, and the check (D154, `check.ts`):** `host.about(profile)` is
  `{device, name, version, profile}`: the machine as Devices names it, "Chrome for Testing"
  (Ducter's install), "Chrome" (`DUCTER_CHROME`) or "system Chrome", the version CDP's
  `Browser.getVersion` answered at start (else `installed.json`'s). `browser_open`'s result
  starts with it ("Browser: Ducter's own browser on hel (Chrome for Testing 157.0.8103.38,
  profile "ducter"), headless on that machine; not the user's own Chrome"), so a task and the
  partner can say which browser they used. `checkBrowser` starts the persona's profile, opens
  `https://example.com/` in a tab of its own, reads the title, closes the tab, and quits the
  browser when it started it and nothing else holds it; `{ok, reason?, message?, browser, url,
  title, ms}`. Three doors: `browser_check` on the client socket (`ducter browser check
  [--json]`), the partner's `browser_check` tool (registered on Linux or with
  `DUCTER_BROWSER_DRIVER=ducter`; the persona's rule 16 prefers it to a task), and
  **试一下 / Try it** on the 上网 block: `live_open {try: true}` → `live.tryIt`, the same live
  view on example.com in a tab of its own (decisionId `"try"`, no card), blind while open like
  any view, its tab closed with it, nothing answered or remembered. The open frame carries
  `browser` for the view's top line.
- **Not built:** Xvfb for sites that refuse headless; a vault that fills passwords, TOTP,
  session probes, per-site rate limits (research/25 §3); browser places on a worker.

### The Ducter browser's identity (D62)

The problem: the Ducter browser is a second, identical Google Chrome (same Dock icon, same
window chrome), so a user cannot tell it from their own. It uses Ducter's own
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
Preferences).

## Connections: the user's OpenConnector or other MCP servers (D96, `connectors.md`)

- **Where they live.** In the control plane on the main (`packages/core/src/connections.ts`).
  - Ducter is an MCP client to the user's OpenConnector (OOMOL Hosted or self-hosted) or to
    any other MCP server.
  - Provider OAuth is OpenConnector's job.
- **The token.** It lives in `<dataDir>/connection-tokens.json` (0600). It never appears in
  harness config, env or args, the Log, or a client frame.
  - The rule for every secret (D102): a 0600 file in the data folder, read by the code that
    uses it. Harness keys are in `keys.env`; the token is in its own file, for the broker only.
- **The gate.** Read vs write comes from the server's own metadata, and unknown counts as a
  write.
  - Reads run and are logged as `connection_call`.
  - A write is a partner-made Go card and runs once after Go.
  - Tasks read only what the partner shared (`connection_share`), never write, and see the
    tools only while a connection exists.

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
