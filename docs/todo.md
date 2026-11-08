# Ducter TODO

Deferred work, grouped by area, each with its trigger where it has one. Calls that are the
user's go to `design/flows/OPEN-QUESTIONS.md`; the morning of 2026-11-09 answered all of them
(D54, D56–D66), and items below cite the decision they carry out.

**Closed overnight (2026-11-09), kept here for one review cycle:** tasks placed on a worker with
offline → 在等 · <device> 连不上 → resume (two VMs, scripted model) · phone web client with code
pairing and Web Push (`apps/web`) · Ducter.app + DMG · the partner memory slice on Nowledge Mem
(eval only) · the partner eval (`bun run eval:partner`) · art cutouts with true alpha
(`docs/art/assets/alpha/`, 22 assets, `docs/art/assets/tools/cut.swift`).

## Server mode and remote access (D54, `research/29`)

Built and verified in Ubuntu VMs: systemd user service, code pairing, token gate, Caddy and
SSH-tunnel paths, desktop connect card, worker enrollment, presence and task placement.

**Verify for real**
- [ ] One real-harness task on a worker (`claude auth login` / `codex login --device-auth` on
      the worker). Trigger: the user signs in on a worker.
- [ ] `scripts/caddy-setup.sh` on a real VPS + domain (ACME, renewal, WebSocket through Caddy
      with TLS). Trigger: the first real VPS install.
- [ ] Phone web on real phones: iOS Home Screen push (16.4+), and whether a token paired in
      Safari carries into the Home Screen app (if not, pair from the installed app);
      `PushManager.subscribe` on a real Android Chrome (the Chromium builds here have no push
      service). Trigger: the first phone install.

**Build next**
- [ ] **Local token (D57)** (`design/system.md` "Who counts as local"): a 0600 token in the
      data dir, presented automatically by the CLI, the desktop on that machine and the tasks'
      MCP config (beside the role token). Then every caller shows a token, loopback included;
      `DUCTER_LOCAL_TRUST` is retired, and an SSH-tunnel client connects once with a code.
      Until then, doctor warns when `who` / `/etc/passwd` shows other human users. Trigger:
      before recommending a shared host, or the first user on one.
- [ ] **Push never holds a decision past its default (D59):** coalescing (15 min) must let a
      decision out at once when its default would fire before the window ends
      (`packages/core/src/push.ts`, `tick`). Trigger: now; it is a correctness gap.
- [ ] **Relayed harness logins (D52 Q17):** spawn `claude auth login` / `codex login
      --device-auth` on the server, show URL + code in the client, pipe the pasted code back.
      Trigger: the browser setup page (A1-V) or a desktop "Your AI" row for remote Ducters.
- [ ] Desktop: a 断开 / Disconnect item and a visible "connected to <host>" line, so a remote
      connection is never invisible.
- [ ] A2-W confirm card ("vps-1 想加入 …" with Go / Not mine) in the Devices UI. Today a worker
      joins with a code typed on the worker, with no confirm step.
- [ ] Workers: a new task for an asleep worker waits instead of being refused; place by need
      ("needs Linux", a repo only the worker has); browser places on a worker; keep a session
      alive across a short socket blip instead of close + resume.
- [ ] Device key + passkey for the phone/web client (code pairing and the `/pair#c=…` page
      exist). Trigger: the Ducter Edge, or a second phone per user.
- [ ] Keychain for the desktop token (today a 0600 file under the user config dir).
- [ ] `ducter service` on macOS (launchd) for a Mac that serves others.

## Mac app and first run (`design/onboarding.md`)

- [ ] D56: Ducter keeps running when the window closes; Quit is the explicit stop. In
      progress in another workstream; then update `design/onboarding.md` "Lifetime" and the
      README's app section to the as-built behavior.
- [ ] Walk a really blocked Mac through the app (blocked, name and failed screens are verified
      headless only), and check an ad-hoc build's helper loses its quarantine flag after
      Open Anyway. Trigger: the first friend install.
- [ ] The partner's real first words: the greeting is the client's empty state today, not a
      Log message, and the partner doesn't read `firstrun.json` ("I found 14 repos …").
- [ ] Rename the partner from the desktop (today the name is asked once, in the terminal or
      the app).

## Partner and tasks (`docs/plan/v1-tonight.md` "Known gaps", `research/30`)

- [ ] Two results landing together still mention branches and guess at merge conflicts (eval
      `settle` 0/2). Settlement batching in code, not prose.
- [ ] Greetings sometimes give two examples (eval `first_words` 3/4).
- [ ] Re-verify live that a task never phrases Hold as "no" (brief changed, not re-run).
- [ ] Parked Claude Code sessions take ~10 s to resume; nothing prewarms tasks.
- [ ] Tasks can write outside their place (one used `/tmp/flk`); no sandbox on the Mac.
- [ ] Branch slugs from Chinese titles keep only the ASCII words (`ducter/foo-…`).
- [ ] The honesty guard is a regex over zh/en wording; it can miss paraphrases.
- [ ] Measure partner latency on opus (live runs used sonnet only).

- [ ] **Reversible asks carry a default (D67):** the ask tool and persona give every
      how-to-do-the-work choice a default and a time (10 min); only effect-ladder asks wait
      with no default. Re-run the eval's ask scenarios after.
- [ ] **Long paths in bubbles (D67):** middle-ellipsis with tap to expand, desktop and phone.

## Long-term memory (`design/memory.md`)

- [ ] **One live write** into a scratch Space, then archive it (the user's Mem is Cloud, so
      creating a Space is not a local op). Decided D63: a Space named `ducter-scratch`.
- [ ] Confirm `--source-msg` provenance lands in `metadata.source_message_id` on Cloud
      (documented by `nmem m add --help`, unverified live). Trigger: the first live write.
- [ ] Outbox with idempotency keys when Mem is down (research/private/10 §"Mem down ≠ Ducter
      down"). Today a save while Mem is down is dropped and nothing is shown.
- [ ] Search before writing, to supersede instead of duplicating (`nmem m supersede`).
- [ ] Undo on the Noted line (archive the memory, never delete).
- [ ] Automatic pre-turn recall behind a precision gate, and logging recalls in the Log.
- [ ] Tasks (windows) as the same identity: set `NMEM_AGENT_ID` in task environments.

## Browser places (W5)

`packages/runner/src/browser.ts` attaches cua-driver directly (D47). Verified live on 0.44.0
(`design/onboarding.md`, "The browser, first time").

- [ ] **env-gate MCP proxy:** untrusted-content framing, domain policy, submit/pay as intents
      (today the rule lives only in the task brief). First slice done: 10 allowed cua tools,
      Claude built-ins Bash/Read/Write/ToolSearch, no user Claude config (W5-2; HN lookup 332k →
      140k input tokens).
- [ ] **Hostile pages and the Log.** Task tokens can `log_search` / `log_read` the whole Log on
      purpose (progressive pull). A page that talks a browser task into searching the Log and
      putting what it finds into a form or URL could leak conversations. Scope browser tasks'
      log tools to their own stream (plus what the brief carries); code tasks stay as they are.
      Trigger: the env-gate proxy work, or the first browser task that posts or submits on its
      own. Decided with W5-2 (D62).
- [ ] Sign-in handoff: the driver ends an idle browser session after 300 s (SIGKILL; verified
      live), so a slow sign-in while the task waits on needs_input loses the window. The
      env-gate proxy can keep the session alive while the task waits.
- [ ] Cookie durability depends on Ducter's clean quit (CDP `Browser.close` on
      done/failed/drop). A crash, or a task that calls `end_session` anyway, can still lose
      sign-ins from the last ~30 s.
- [ ] Profile exclusivity in the runner: a second browser task for the same persona waits
      (today the driver refuses and the task reports blocked).
- [ ] Supervise Ducter's cua-driver daemon: if it dies mid-task, `mcp --socket` relaunches it
      without `CUA_DRIVER_BROWSER_PROFILE_ROOT`, so the profile would land in the driver's
      default root. Ducter also leaves its daemon running after it exits.
- [ ] Browser sidecars are not restarted when a browser task is recovered after a restart.
- [ ] Snapshots carry no link targets (href); tasks fall back to page URLs or fetching public
      HTML. Ask cua for hrefs in `semantic_v2`, or read them through the env-gate.
- [ ] Browser identity (W5-1, D62): built. Still needed: the client
      renders the status line with a Show action; someone checks the Dock tile with the Dock
      visible; in a `bun build --compile` binary the avatar file is not bundled, so there is no
      Dock tile.
- [ ] Find what triggers macOS's "CuaDriver was prevented from modifying apps" notification.

## Art assets: production export

- [ ] Export WebP at 1×/2×/3× per the size each asset is used at in the clients. Commit only
      final exports from here on (D64).
- [ ] Re-cut any regenerated asset with the same tool, and check it on a dark tile.

## Storage: adopt HawDB (after the Bun/Node binding)

v1 stores the Log on SQLite behind an append-log port (principle 19). The port is shaped like
HawDB `strict_append`: partition, gapless commit sequence, cursor reads. Once the items below
land in HawDB, the self-hosted control plane moves to HawDB. Cloudflare keeps Durable Object
SQLite until HawDB has persistent WASM. See `research/09-hawdb-evaluation.md`.

- [ ] HawDB Bun/Node binding (blocking; owned by our team)
- [ ] Declarative FTS index on SQL / append tables
- [ ] Multi-key reads on append tables (per-window and per-persona-since-cursor without a dual
      write)
- [ ] Public, resumable change-feed subscription (client sync)
- [ ] Later: persistent WASM storage or `hawdb serve`; 1.0 format stability

## Runtime: no JS runtime at all (later)

The runner ships today as one compiled binary (`bun build --compile`; Node SEA is the CI
fallback). A runner with no JS runtime at all means porting OAR's drivers to Go behind
`HarnessPort`: Claude + Codex + shared core is ~10–12k LOC, about 6–10 engineer-weeks. Do it
Codex first, once OAR is near 1.0. See `research/17`.

- [ ] Spike: run `@botiverse/oar/observe` (no `node:` imports) inside the MyGo client on
      moejs, with a `randomUUID` shim, for client-side read models
- [ ] Evaluate moejs as the client plugin host (cf. MyGo Music / mygo-plugin)

## Release and CI (`docs/release.md`)

- [ ] First tagged release end to end (notarized DMG, Linux tarballs, TestFlight). Trigger: the
      author's checklist at the top of `docs/release.md` is done.
- [ ] One Bun for everything: the committed web bundle is built with 1.3.1, the compiled CLI
      with 1.4.4 (they minify differently). Trigger: upgrading Bun on the author's Mac.
- [ ] Intel Mac DMG (a `macos-15-intel` job). Trigger: someone asks for Intel.
- [ ] Linux CI test runs (`bun test`, `go test` on ubuntu) were only compiled/planned on a Mac;
      if the first runs fail for platform reasons, move that job to `macos-15`.

## First run without a terminal (D69, `design/onboarding.md` "No terminal, start to finish")

- [ ] A task that needs the web before 上网 is set up: open the three steps from the
      conversation, not only from the devices screen. Trigger: core gives the refusal a
      structured reason the client can act on.
- [ ] See macOS's "Background Items Added" notice for Ducter's own agent and quote its zh title
      exactly. Trigger: the first signed build installed on a Mac in Chinese.
- [ ] Walk a real Claude Code sign-in and a Codex sign-in from the app to the end. Trigger: a
      throwaway account, or a fresh Mac user.
- [ ] Nowledge Mem installed but not running: say so in one line with a way to open it.
      Trigger: Mem exposes how to start it from outside.
- [ ] Moving the app out of the disk image (offer "Move to Applications" when run from
      `/Volumes` or a translocated copy). Trigger: the first friend who opens it from the DMG.
