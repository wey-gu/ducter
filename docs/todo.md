# Ducter TODO

## Server mode and remote access: after the first slice (D54)

Built and verified in a local Ubuntu VM (`research/29`): systemd user service, code pairing,
token gate, Caddy and SSH-tunnel paths, desktop connect card, worker enrollment/presence.

- [x] Place tasks on a worker (`design/system.md` Workers), with offline → 在等 · <device>
      连不上 → resume by session id. Verified in two VMs with the scripted runtime.
- [ ] One real-harness task on a worker (needs a Claude Code or Codex login on the worker:
      `claude auth login` / `codex login --device-auth` there). Trigger: the user signs in.
- [ ] Workers: a new task for an asleep worker waits instead of being refused; place by need
      ("needs Linux", a repo only the worker has); browser places on a worker; keep a session
      alive across a short socket blip instead of close + resume.
- [ ] **Relayed harness logins (Q17):** spawn `claude auth login` / `codex login --device-auth`
      on the server, show URL + code in the client, pipe the pasted code back. Trigger: the
      browser setup page (A1-V) or a desktop "Your AI" row for remote Ducters.
- [ ] **Verify `scripts/caddy-setup.sh` on a real VPS + domain** (ACME, renewal, WebSocket
      through Caddy with TLS). Trigger: first real VPS install.
- [ ] Keychain for the desktop token (today a 0600 file under the user config dir).
- [ ] Device key + passkey and the phone/web pairing page `/pair#c=…` (today it answers with a
      one-line text). Trigger: the web client.
- [ ] `ducter service` on macOS (launchd) for a Mac that serves others.
- [ ] Shared Linux hosts: loopback is token-free, so other local users could connect. Offer
      `DUCTER_LOCAL_TRUST=off` in doctor when `who`/`/etc/passwd` shows other human users.
- [ ] Desktop: a "Disconnect from this Ducter / 断开" item and a visible "connected to
      <host>" line, so a remote connection is never invisible.
- [ ] Worker as a client of the same main in the Devices UI (A2-W card: "vps-1 想加入 …" with
      Go / Not mine). Today the worker joins with a code typed on the worker, no confirm step.

## Long-term memory: after the first slice (`design/memory.md`)

- [ ] **One live write** into a dedicated scratch Space, then archive it. Not done: the
      user's Mem is Cloud, so creating a Space is not a local op. Trigger: the user OKs a
      scratch Space (or a local Mem).
- [ ] Confirm `--source-msg` provenance lands in `metadata.source_message_id` on Cloud
      (documented by `nmem m add --help`, unverified live). Trigger: the first live write.
- [ ] Outbox with idempotency keys when Mem is down (research/private/10 §"Mem down ≠ Ducter
      down"). Today a save while Mem is down is dropped and nothing is shown.
- [ ] Search before writing, to supersede instead of duplicating (`nmem m supersede`).
- [ ] Undo on the Noted line (archive the memory, never delete). Trigger: user review of the line.
- [ ] Automatic pre-turn recall behind a precision gate, and logging recalls in the Log.
- [ ] Tasks (windows) as the same identity: set `NMEM_AGENT_ID` in task environments.
- [ ] Copy review: 记下了 · <title> / Noted · <title> (glossary row pending user OK).

## Storage: adopt HawDB (after Bun/Node binding)

v1 stores the Log on SQLite behind an append-log port (principle 17). The port is shaped like
HawDB `strict_append`: partition, gapless commit sequence, cursor reads. Once the items below
land in HawDB, the self-hosted control plane moves to HawDB. Cloudflare keeps Durable Object
SQLite until HawDB has persistent WASM. See `research/09-hawdb-evaluation.md`.

- [ ] HawDB Bun/Node binding (blocking; owned by our team)
- [ ] Declarative FTS index on SQL / append tables
- [ ] Multi-key reads on append tables (per-window and per-persona-since-cursor without a dual write)
- [ ] Public, resumable change-feed subscription (client sync)
- [ ] Later: persistent WASM storage or `hawdb serve`; 1.0 format stability

## Runtime: no JS runtime at all (later)

The runner ships today as a compiled single binary (Node SEA). A runner with no JS runtime
at all means porting OAR's drivers to Go behind `HarnessPort`: Claude + Codex + shared core
is ~10–12k LOC, about 6–10 engineer-weeks. Do it Codex first, once OAR is near 1.0. See
`research/17`.

- [ ] Spike: run `@botiverse/oar/observe` (no `node:` imports) inside the MyGo client on
      moejs, with a `randomUUID` shim, for client-side read models
- [ ] Evaluate moejs as the client plugin host (cf. MyGo Music / mygo-plugin)

## Art assets: production export

Done: `docs/art/assets/alpha/` holds true-alpha cutouts of all 22 assets, made locally with
macOS Vision foreground segmentation (`docs/art/assets/tools/cut.swift`). Cream objects cut
cleanly. `ab_web` needed its enclosed window interior refilled from the raw image.
- [ ] Export WebP at 1×/2×/3× per the size each asset is used at in the native client
- [ ] Re-cut any regenerated asset with the same tool, and check it on a dark tile

## Browser places: gaps left by the v1 slice (W5)

`packages/runner/src/browser.ts` attaches cua-driver directly (D47). Verified live on 0.44.0
(see `design/onboarding.md`, "The browser, first time"). Still open:

- [ ] env-gate MCP proxy: untrusted-content framing, domain policy, submit/pay as intents (today the rule lives only in the task brief). First slice done: 10 allowed cua tools, Claude built-ins Bash/Read/Write/ToolSearch, no user Claude config (HN lookup 332k → 140k input tokens).
- [ ] Sign-in handoff: the driver ends an idle browser session after 300 s (SIGKILL; verified live), so a slow sign-in while the task waits on needs_input loses the window. Fix with the env-gate proxy, which can keep the session alive while the task waits on the user.
- [ ] Cookie durability depends on Ducter's clean quit (CDP `Browser.close` on done/failed/drop). A crash, or a task that calls `end_session` anyway, can still lose sign-ins from the last ~30 s.
- [ ] Profile exclusivity in the runner: a second browser task for the same persona waits (today the driver refuses and the task reports blocked)
- [ ] If Ducter's cua-driver daemon dies mid-task, `mcp --socket` relaunches it without `CUA_DRIVER_BROWSER_PROFILE_ROOT`, so the profile would land in the driver's default root; supervise the daemon instead. Ducter also leaves its daemon running after it exits.
- [ ] Snapshots carry no link targets (href); tasks fall back to page URLs or fetching public HTML. Ask cua for hrefs in `semantic_v2`, or read them through the env-gate.
- [ ] Browser identity (OPEN-QUESTIONS W5-1): built as a draft (Dock tile, parked window, "Looking at <host>" task_event). Still needed: the client renders the status line with a Show action, and someone checks the Dock tile with the Dock visible. In a `bun build --compile` binary the avatar file is not bundled, so there is no Dock tile.
- [ ] Find what triggers macOS's "CuaDriver was prevented from modifying apps" notification.
