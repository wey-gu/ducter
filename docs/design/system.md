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
and no proxy header (`Forwarded`, `X-Forwarded-*`, `X-Real-IP`, `Via`, `CF-Connecting-IP`,
`Tailscale-User-Login`) is present. Local callers (the desktop on the same Mac, the CLI, the
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
- Limits: 10 wrong codes per caller address per 10 min (`X-Forwarded-For`'s first hop behind a
  proxy), then 429; 30 wrong codes in total voids every pending code.
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
and 配对码. The token goes to `<user config>/Ducter/connection.json` (0600, dir 0700); the
Keychain is a later upgrade. A refused upgrade from a non-loopback server brings the card back
with one line ("这台 Mac 已经和你的 Ducter 断开了"). `DUCTER_URL` + `DUCTER_TOKEN` still override.

**Harness logins on the server (research/29).** Doctor offers `claude auth login` (prints a URL,
waits for the pasted code; no browser on the server) and `codex login --device-auth` (enable
device login in ChatGPT first). `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token` goes in
`~/.ducter/env`; doctor shows it as "set, checked on first use" because `claude auth status`
can't tell a bad token from a good one. Relaying these flows into a client (Q17) is next.

**Demo / e2e without an AI login.** `DUCTER_SCRIPTED_MODEL=1` swaps every harness session for
OAR's scripted runtime. Its script still calls Ducter's real MCP tools over HTTP (`task_open`,
`report_to_main`) and every reply says it's a demo.

## Workers (design; enrollment only so far)

A worker is a machine that runs tasks for a main process elsewhere (a VPS next to a home Mac
main, or the reverse). Principle: **it dials out, never in.**

- **Join.** On the main: `ducter pair --worker` (a code whose device kind is `worker`). On the
  worker: `ducter worker --join <main address> --code <code> [--name vps-2]`. It pairs at
  `/pair`, keeps the token in `~/.ducter/worker.json` (0600), then holds one outbound WebSocket
  to `<main>/worker` with that token, reconnecting with backoff. A client token can't open
  `/worker`, and a worker token can't open `/ws`.
- **Hello.** The worker reports hostname, OS/arch, Ducter version, and which harnesses are
  installed and signed in (the doctor probes). The main keeps it in memory; `ducter devices`
  shows 醒着 / Awake while the socket is up and its last-seen time otherwise.
- **Placement (not built).** When `Place.device` names a worker, the runner forwards
  `openTask / send / interrupt / drop` over that socket. The worker runs the same runner code
  locally (worktrees, recipes, harness via OAR) against a thin core proxy that forwards
  `log.append` and `tasks.setState` back up. Task tools reach the main's `/mcp` with the role
  token the main minted for that task plus the worker's device token; the main's MCP gate
  already accepts exactly that pair. Device sleep or a dropped socket follows A3 (在等 after
  2 minutes, D52).
- **Built and verified (two Ubuntu VMs, research/29):** join with a worker code, `worker.json`
  0600, hello with harnesses, `ducter devices` → `awake`, `ducter service install --worker`
  (no listening port on the worker), reconnect after the main restarts. Revoking (from the
  CLI, another process) closes live device sockets within 10 s (close code 4401, clients and
  workers alike); a refused worker exits 3 and its unit has `RestartPreventExitStatus=3`, so
  it stops instead of retrying.
- **Why not tonight:** placement touches the runner and the core API that protocol v2 is
  reshaping; doing it on a moving base would mean two incompatible runners. Trigger: protocol
  v2 merged (`docs/todo.md`).

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
