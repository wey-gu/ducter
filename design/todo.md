# Ducter TODO

Deferred work, grouped by area, each with its trigger where it has one. Calls that are the
user's go to `design/flows/OPEN-QUESTIONS.md`; the morning of 2026-11-09 answered all of them
(D54, D56–D66), and items below cite the decision they carry out.

**Closed overnight (2026-11-09), kept here for one review cycle:** tasks placed on a worker with
offline → 在等 · <device> 连不上 → resume (two VMs, scripted model) · phone web client with code
pairing and Web Push (`apps/web`) · Ducter.app + DMG · the partner memory slice on Nowledge Mem
(eval only) · the partner eval (`bun run eval:partner`) · art cutouts with true alpha
(`design/art/assets/alpha/`, 22 assets, `design/art/assets/tools/cut.swift`).

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

## Partner and tasks (`design/plan/v1-tonight.md` "Known gaps", `research/30`)

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

### What it thinks with, and who does the tasks (D89, D90)

- [x] **The partner runs on `Settings.brain`** (harnesses, D85) and a live session ends at the
      next message after a switch (ai-loadout): unit (fake runner) and end to end on OAR's
      scripted runtime (`packages/cli/test/brain-switch.test.ts`). A live Codex partner turn is
      still to walk.
- [ ] **Codex as what it thinks with** behind its config isolation (`-c` overrides, no user
      `AGENTS.md`) and a pass of `packages/partner/eval`; pi and DeepSeek Harness the same,
      each when it passes the eval.
- [ ] **The partner's prompt sees Your rules** (today core applies them in `fw_candidates`;
      the partner learns them only through `rule_list`). Trigger: a rule the partner ignores
      when it pins a harness itself.
- [ ] **Allowance on the tray is real** only where a harness reports it (`DeviceHarness.allowance`);
      probes for Claude Code (`get_usage`) and Codex (`account/rateLimits`) are not built.
- [ ] **Live handoff** between harnesses: verified with fake sessions only (runner test).
- [ ] **Human comprehension test** of the socket and tray (`design/ai-loadout.md` §6: ≥ 80% on
      key items, no boss or servant reads).
- [x] **Devices mark** is an icon-only badge on the coin (`BrainBadge`, tooltip and accessible
      name "{name} 想事情用"); the rebuilt Devices stage (`isles`) only has to keep calling it
      inside a token's coin box.
- [ ] **The phone's opened task** keeps its title as the headline; D90's "what it is doing
      now" headline is desktop-only so far.

## The quiet conversation (D104, `design/quiet-conversation.md`)

- [x] The ack says how long work usually takes and that it will say when it's clear (D120):
      persona rule 2, the partner eval's ack scenarios (`ack-*-estimate`, `ambiguous-zh`).
- [ ] Estimates grounded in the user's own history: today the partner has "took about N min"
      on recently finished tasks and what it was told; a per-project median of past task
      durations would ground more acks. Trigger: acks without a number feel vague in dogfood.
- [ ] Ack and go on harnesses that stream no tool-call input (the head never arrives): the task
      then opens when the call does, as before D120. Check Codex, pi and DeepSeek Harness live
      with `packages/partner/eval/latency.ts --harness …` once it takes that flag. Trigger: a
      partner on one of them.
- [ ] The waiting line on a real partner turn (opus), timed end to end: first step, each step,
      the ack. Verified so far on the demo's scripted partner and in unit tests. Trigger: a
      live run with a signed-in harness.
- [ ] The iOS shell (`apps/ios`) renders `apps/web`, so it should follow; check it in the
      Simulator. Trigger: the next iOS build.
- [ ] A ↗ line in the demo seed, to show what went out stays in view (the seed sends nothing
      out). Trigger: the next demo-seed change.

## Long-term memory (`design/memory.md`)

- [ ] **One live write** into a scratch Space, then archive it (the user's Mem is Cloud, so
      creating a Space is not a local op). Decided D63: a Space named `ducter-scratch`.
- [ ] Confirm `--source-msg` provenance lands in `metadata.source_message_id` on Cloud
      (documented by `nmem m add --help`, unverified live). Trigger: the first live write.
- [ ] Outbox with idempotency keys when Mem is down (research/private/10 §"Mem down ≠ Ducter
      down"). Today a save while Mem is down is dropped and nothing is shown.
- [ ] Search before writing, to supersede instead of duplicating (`nmem m supersede`).
- [ ] Undo on the Noted line (archive the memory, never delete).
- [ ] Tasks (windows) as the same identity: set `NMEM_AGENT_ID` in task environments.

## The conversation's own memory: digest, window, recall (`design/memory.md`, D123)

- [ ] **Turn automatic pre-turn recall on** (built, gated, logged in `spine_recall`; off by
      default). Trigger: its admitted-hit precision measured on a real channel replay clears
      0.8 (the eval's corpus gave 5/8, below the bar).
- [ ] **A real-channel corpus for the eval**: a replay of the author's own channel (zh + en),
      ~100K tokens or more, at production budgets, so digests compress 20–50× (today's corpus is
      ~2K tokens at budgets scaled 50× down: it checks what is kept, not compression). Also
      LongMemEval_S / LoCoMo for an outside calibration. Trigger: before tuning `T_hi`, `T_lo`,
      the epoch size, or the recall gate.
- [ ] Vectors next to FTS5 (Qwen3-Embedding-0.6B or bge-m3 in sqlite-vec), fused by rank.
      Trigger: lexical misses on paraphrased questions in the real-channel eval.
- [ ] Index digest TOC rows as coarse search nodes (RAPTOR-style), so `log_search` can hit a
      topic as well as a line.
- [ ] The main AI marks a topic finished (a tool, or a marker in its reply). Today only a merge
      or PR by button counts as a finished topic.
- [ ] Writer: a cache-aligned side call on the warm main session instead of a fresh session
      (research/14 §6.3), and a self-critique pass before the audit. Trigger: the writer's
      cost or its rewrite rate in real use.
- [ ] Roll-up loss over months (level-2 epochs are not built; stop at level 1 until measured).
- [ ] Re-cut by expected cost with P(warm) (principle 4): today a warm session re-cuts on one
      threshold (estimated context past 120K, and a digest exists).
- [ ] Read-fold and late fold (principle 5) are still not built.
- [ ] Meter the digest writer's cost (the eval records answer cost only).

## Your accounts and your other AI agents (promised as "coming soon" on the site)

The site, README and `docs/faq.md` say these are coming. Each needs the change loop (a design
note and a `Dn`) before it is built.
- [ ] **Accounts through OpenConnector** (https://github.com/oomol-lab/open-connector): Gmail,
      Google Calendar and others, with the runtime self-hosted where Ducter runs so provider
      credentials never reach a harness. Reads pass; any write that sends goes through the
      partner's Go like every other outbound. Needs a research report first (its credential
      boundary, action allow/block policy, MCP surface, license: modified Apache 2.0 that
      bars offering it as a hosted service, which embedding in Ducter is not). Trigger: the
      first user scenario that needs mail or calendar.
- [ ] **oo's own read/write hint and action list** (D122, `connectors.md` §4.4). oo has no "list
      actions" and `connector schema` carries no read/write; OOMOL has both (its generated
      `oo-gmail` skill tags `[write]` / `[destructive]`). Ask OOMOL to expose them, then use
      them over the verb rule (keep the rule as the fallback). Trigger: the next oo release, or
      a conversation with OOMOL.
- [ ] **A task loaded the user's own Claude skills** (`oo-gmail`) although the clean setup sets
      `userConfiguration: "exclude"`. oo is now signed out for every session (D122 (6)), but
      other user skills that act on accounts are still reachable. Check what OAR's exclude
      covers for skills and close it. Trigger: the next harness change.
- [ ] **Connections in the CLI** (`ducter accounts`, the oo tap and the address form) for a
      server with no app attached. Trigger: the first headless user who wants mail.
- [ ] **Partner eval cases for accounts**: share with a task in the same turn; a Go label in one
      language (the live trial got "存为草稿 / Save as draft", against D109); read message bodies
      before flagging, not only snippets. Trigger: the next eval round.
- [ ] **Nowledge Bridge live** (`design/bridge.md`): the live J1 round trip, then outbound
      (J4). Trigger: the account is enabled for Bridge.

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
- [ ] **Native browser by default (D126).** The switch is built (`DUCTER_BROWSER_DRIVER=native`);
      the default stays cua-driver until a native path passes (research/38). Claude Code: check
      that Claude in Chrome is connected at task open (one `tabs_context_mcp` call, or a status
      read if Claude Code exposes one) and fall back to cua-driver when it is not, then a live
      HN lookup and a sign-in handoff pass. Codex: its Browser / Chrome surfaces answering under
      `codex app-server` without the ChatGPT app; desktop Computer Use alone types into the
      user's front tab and should not carry browser places. Then flip `DEFAULT_BROWSER_DRIVER`,
      and let Your devices and abilities and the 上网 setup treat a ready native driver as
      enough (they require cua-driver today).
- [ ] Tell the partner that a Codex task (any place) carries the user's Codex Computer Use and
      can drive any app and the user's own Chrome (research/38), so it briefs Go rules on
      repo tasks that touch the web too.

## Devices stage: the Isles (D81)

- [ ] Human comprehension test of the Isles scene (owed since D65; research/33 used LLM proxy
      raters only). Pass bar: 80% on where Ducter lives, what a bridge means, work running, can't
      reach, and where a new device goes. Trigger: before v1 is called done.
- [ ] Reduced motion checked on the native window with the system setting on (verified in the
      headless renderer only; this machine's setting was left alone). Trigger: the next design QA.
- [ ] "Shared by N devices" from the AI agent itself, per account (D82). Trigger: an AI agent
      reports its account or allowance.
- [ ] One small mark on the AI agent Ducter thinks with (a separate proposal); the token has
      room for it. Trigger: that proposal is decided.

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

## Release and CI (`design/release/README.md`)

- [ ] First tagged release end to end (notarized DMG, Linux tarballs, TestFlight). Trigger: the
      author's checklist at the top of `design/release/README.md` is done.
- [x] One Bun for everything: 1.4.4 for CI, the web bundle and the CLI (build:web fetches it
      with npx when the Mac has another).
- [ ] Intel Mac DMG (a `macos-15-intel` job). Trigger: someone asks for Intel.
- [ ] CI on GitHub: the first run (2026-11-09) failed on machine-dependent tests only (git
      identity, installed harnesses), now fixed and reproduced on the Mac with a clean env
      (`design/release/README.md`, "Tests are hermetic"). The second found the Go job can't run
      on Linux (the views' text measures differently; plutil is macOS-only), so it runs on
      macos-15. Close once a GitHub run is green.

## App lifecycle (D72)

- [ ] **Settings rows** for updates (the status line, 退出时自动更新, 现在检查) and for 彻底移除
      Ducter (the page with Removes / Keeps, the two options, the typed confirmation), on the API
      in `apps/desktop/internal/update` and `internal/local/lifecycle.go`. Trigger: the Settings
      window lands (branch `ia`).
- [ ] **Reset partner** (clear the conversation, keep devices and settings). Not built: the Log
      holds the conversation and every task in one append-only file (principle 1), so it can't
      be cut out safely. Proposal: a `conversation_reset` event that the projection and memory
      window start after, so tasks, decisions and resume keep their history. Trigger: the user
      asks for it; it goes through the change loop (`design/context.md`).
- [ ] Rollback in the UI (`RollBackOnQuit` exists). Trigger: a bad release reaches someone.
- [ ] A pre-release channel (the updater only reads `releases/latest`). Trigger: the first beta
      testers.
- [ ] First real update from GitHub (both checks against a notarized release, Gatekeeper on).
      Trigger: the second tagged release after the repo is public.

## First run without a terminal (D70, `design/onboarding.md` "No terminal, start to finish")

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
- [ ] Remove Ducter from a copy run off the disk image: the plan's last step moves Ducter.app
      to the Trash, which a read-only `/Volumes` copy can't do (and the installed copy, if any,
      stays). Say so in the plan and leave the app alone. Trigger: with the "Move to
      Applications" offer above, or the first report of it.

## Partner and Settings (D71)

- [ ] A theme choice in Settings › Look. Trigger: a second theme (Pebble dark first) works on
      the desktop and the phone alike.
- [ ] Walk Forget against a live Nowledge Mem (`nmem m forget --force` on a line with a memory
      id) and check recall no longer returns it. Trigger: a scratch Mem space for tests.
- [ ] Screenshot the menu bar extra's open menu natively. On the test Mac it sat in the menu
      bar's overflow, so only its contents are covered by unit tests. Trigger: a Mac with room in
      the menu bar.
- [ ] Sign in, install and sign out from a Devices account card in the real Ducter.app (the
      card's sheet reuses the first run's jobs). Trigger: the same throwaway account as above.
- [ ] Rules (F1) on the Partner page: let "On its own, or asks you first" be changed, not only
      read. Trigger: F1 has a flow and a decision.
- [ ] The partner's name in its live session: a rename reaches new sessions (the identity is
      rewritten); the session already open keeps the old name until it restarts. Trigger: a
      user notices.

## First-wave harnesses (D85, `research/34`)

- [ ] The full partner eval (all scenarios, 2 runs) on pi and on DeepSeek Harness; flip
      `HARNESSES[id].partner` when one holds the Claude Code floor. Trigger: the author asks for
      a non-plan brain, or a cheaper partner.
- [ ] The full partner eval on Codex at its workhorse model (gpt-6.1-sol) before Codex is
      offered as the brain. Trigger: the ai-loadout UI lands.
- [ ] Verify Codex leaves out a non-empty global `~/.codex/AGENTS.md` and the user's
      `personality` (this Mac's AGENTS.md is empty). Trigger: a scratch `CODEX_HOME` copy with
      a test AGENTS.md, or a user with one.
- [ ] The Devices key field for API-key accounts: masked input, writes `<dataDir>/keys.env`
      (0600, D102), never echoed or logged; "需要一个 DeepSeek 密钥 / Needs a DeepSeek key".
      Trigger: the ai-loadout Devices work.
- [x] Pass pi's provider keys from Ducter's key file too (D102: `HARNESS_KEYS.pi`, from the
      env or `keys.env`, never the DeepSeek key).
- [ ] A way for the user to give tasks a named env token on purpose (e.g. `GITHUB_TOKEN` for
      `gh`), now that a harness child's environment is an allowlist (D102). Trigger: a task
      fails because a tool it runs relied on a token from Ducter's shell.
- [ ] pi's in-process fallback (no `node` and no `pi` on PATH) runs inside Ducter's process and
      reads its environment directly; the allowlist covers only pi's bash tool there. Ducter's
      own keys are scrubbed from that environment, a shell key is not. Trigger: a machine
      without node that runs pi tasks.
- [ ] Label the partner's Codex sessions (`SessionOptions.name`) so they read as Ducter's in the
      user's Codex history. Trigger: a user asks what they are.
- [ ] Qwen Code, Qoder, Grok as the next harnesses (cheapest per research/34). Trigger: a user
      asks.

## Before the repo goes public

- **Rewrite history once (D75 and the motivation scrub).** After every branch is merged:
  `git filter-repo` with the text replacements (motivation wording, personal paths, fake eval
  keys) and `--invert-paths` for the evidence paths: `apps/desktop/docs/`, `design/screens/`,
  `docs/design/screens/`, `docs/images/`, `apps/ios/screens/`, `apps/desktop/desktop`, the raw
  and normalized generations and the concept explorations (keep the two `r2` reference images
  named in `design/art/assets/batch.json`). Then run `bun scripts/check-binaries.ts` on every
  remaining commit's tree, force-push, and set the description and topics. Trigger: the last
  open branch merged.


## Nowledge Bridge (D105–D111, `design/bridge.md`)

- [ ] Run `bun run bridge:live -- --real` and record the result in research/37. Trigger: the author says the
      account and both contexts are ready (J-Q14 steps 1–4).
- [ ] Replace the tolerant JSON parsing (`inbox`, `open`, `outbox`, `inspect`, send/reply results, the member in
      passive `setup`) with the real shapes from that run's `raw-<time>/` folder. Trigger: the live run.
- [ ] Turn `DUCTER_BRIDGE` on by default behind a Partner-page toggle (J-Q1). Trigger: the live run passes.
- [ ] Clients render the quiet lines (发来请求 / 已发给 / 回复了 / 已回复). Trigger: J-Q5 answered.
- [ ] Follow-through by a time the user named ("今晚前告诉我"). Trigger: a user asks for it; `wait_until`
      covers it today.

### Work over time (D112–D115)

- [ ] A round of the waiting pose with real people, children included (LLM proxies: 5/10 for
      the pose alone; the words carry it). Trigger: before calling v1 done.
- [x] The moment a wait comes true: the bubble pops and the card springs from Waiting to Working
      (desktop and phone; reduced motion: a fade).
- [ ] Live: an OpenConnector Gmail trigger watch, a real judge model on a wait, a check on a
      worker device, a routine's real run and its per-run cap. Trigger: an OpenConnector account
      on the test Mac.
- [ ] Routines on another device, waking a sleeping one, the cloud fallback (D29). Trigger: a
      routine missed because its device slept.
- [ ] Editing a routine by saying it ("改成 8:30") as a diff card (research/20 §7.3).
- [ ] The partner eval: scenarios for "PR 过了告诉我", "一直修到 CI 绿", "每周一给我周报".


## A result in words (D124)

- [ ] Evidence carries pass or fail per check (`EvidenceRef.ok`, set by the task in
      `report_to_main`), so a reproduction is told by its result, not by its label. Trigger: a
      reproduction whose label the heuristic misses, or a passing run it calls one.
- [ ] A failed Open draft PR is client state only; a second client (or a reload) offers it again
      until the place says it has no remote (the protocol field). Trigger: that field lands.
- [ ] The partner says when it is putting a result into words (an `activity` for report turns), so
      the waiting line needs no 2-minute guess. Trigger: a partner slower than 2 minutes.
