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
- [ ] **Move your Ducter to another computer (`ducter move`)**: a Mac-first user moves the home to a server: one-time move code from the new (empty) home; moves the Log, persona, settings, rules, routines, connections and the Mem binding over HTTPS with a verified count; not harness sign-ins (re-sign on the server, guided); running tasks parked first; the old machine becomes a worker for its local repos, its app connects to the new home; old data kept 30 days with a one-tap move back. Trigger: the author's Mac → Hetzner case (2026-11-10); design first, then v0.0.4.
- [x] **Phone opened task overflows horizontally**: not the layout. The shot was taken with headless Chrome's `--window-size=390,…`, which lays out at its minimum window width (~500 px) and crops to 390. With device emulation at 390 px (CDP `Emulation.setDeviceMetricsOverride`) the folder task and a long zh title + long brief with unbreakable paths and URLs wrap, and `scrollWidth` is 390. Take phone shots with device emulation, never `--window-size`.
- [x] **Folder result shows a stray proof line**: a folder task's proof line no longer counts the changes (desktop and web); D142's sentence says them.
- [ ] **Updating in place (D148) on a real systemd box:** a 0.0.4 → 0.0.5 update of a VPS home
      and of a Linux worker from the card and with `ducter update --all`, including one forced
      rollback (a release whose binary fails `/health`) and the helper surviving `systemctl
      restart`. All steps are tested with fakes only. Trigger: the 0.0.5 release.
      **D172:** two consecutive home updates of the systemd user service now run in a VM like hel
      (`bun run e2e:linux`); still open there: a Linux worker's update, a forced rollback, x64
      (the rig is arm64 on Apple silicon), and a real network hop with TLS and a non-loopback
      peer at the auth gate (lima forwards the VM's port to this Mac's loopback).
- [ ] **Updating the AI agents (D156) for real:** an npm Codex and a native Claude Code on a
      server updated from the card and with `ducter update --agents --yes`, one forced rollback
      (a pinned npm version that fails `--version`), a worker's agent over its socket, and a
      night round inside the verified range. Only fakes so far; no real install was run. Also
      open: the partner holding a new turn while its own agent updates (only waited for today),
      a Codex app copy seen on a real Mac. Trigger: the next Codex or Claude Code release.
- [ ] **A Mac updated from the phone (D187) for real:** the author's MacBook (a worker of hel)
  from 0.0.14 to the next release, tapped on the phone: steps on the card, the putting-in screen
  on the Mac, 回来了 on the card; then once with the app closed (没开着). Also the night-time
  auto-update for Macs whose Ducter asks its app (today D148 (10) skips them; the restart would
  happen while the person may be at the Mac). Trigger: the first release that carries D187.
- [ ] **Updating in place, the rest of D148:** the partner's one line for a security release
      (nothing tells the partner yet); archive sweeps inside the runner's critical section;
      renaming from the island's tag (the card's name does it). Trigger: after the first real
      update round.
- [ ] One real-harness task on a worker (`claude auth login` / `codex login --device-auth` on
      the worker). Trigger: the user signs in on a worker.
- [ ] `ducter domain` on a real VPS + domain as root (DNS check, apt Caddy, ACME, renewal, WebSocket through Caddy
      with TLS). Trigger: the first real VPS install.
- [ ] **Opening fast (D209) on real devices:** time a relaunch of the iPad app against hel (the
      conversation in the first frame, no empty page; full screen painted within 100 ms), the iPhone
      simulator, and the Android app in the emulator (cache-first load, `reach` bringing up
      can't-reach, the stale-page reload). If the ~1.2 s before the first frame holds on a real device:
      start the web view at app launch, split the bundle so the conversation parses first, virtualize a
      long transcript. The notifications ask still appears ~0.4 s after the first frame (the app's
      push state is asked after it). Trigger: the next TestFlight build.
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

- [x] D56: Ducter keeps running when the window closes; Quit is the explicit stop. Built as a
      per-user LaunchAgent (`apps/desktop/internal/local/agent.go`); `design/onboarding.md`
      "Lifetime" describes it.
- [ ] Walk a really blocked Mac through the app (blocked, name and failed screens are verified
      headless only), and check an ad-hoc build's helper loses its quarantine flag after
      Open Anyway. Trigger: the first friend install.
- [ ] The partner's real first words: the greeting is the client's empty state today, not a
      Log message, and the partner knows no repos at first run (D204: no scan, no `firstrun.json`).
- [ ] Rename the partner from the desktop (today the name is asked once, in the terminal or
      the app).

## Partner and tasks (`design/plan/v1-tonight.md` "Known gaps", `research/30`)

- [ ] **The persona's one stale button word (D212)**: rule 15 says On hand keeps a missed wait
      "with 接着等 / Keep waiting"; the button is 继续等 now. Not changed alone because a persona
      change needs a fresh eval (D175). Trigger: the next persona change, in the same run.
- [ ] **The zh pass, round two (D212)**: the agent's English step titles inside zh chrome (D211's
      recommendation), and an audit of the CLI's long help lines with a native reader. Trigger:
      the author's review of D212.

- [ ] **The opened task, after D210** (`research/58`): (1) a step under way: Ducter's Log has a
      tool call only once it is done, so the foot names the latest finished step; a "running"
      line needs the runner to log a tool's start (OAR's item started events). Trigger: a live
      run where the foot lags a long command. (2) The agent's words appear whole, not streamed;
      streaming needs text deltas in the Log. Trigger: the same. (3) The Mac draws the whole
      window of turns each frame (7 ms with 423 events in the test renderer); if a real long
      task stutters, move the transcript into `ui.List` (Lorca's chat does). (4) Check the
      foot, Esc twice and Jump to latest on a real iPad and a real long run with the author.

- [ ] **The eval's new gaps on haiku** (research/48 addendum, `eval/results/2026-11-10-haiku-d175.md`):
      (1) it says a rule is kept without calling `rule_save` / `notice_rule` (an honesty gap: a
      code check could refuse "已存在「你的规则」" prose with no rule saved this turn); (2) it answers a
      web look-up (HN today, a latest version) from memory instead of opening a browsing task;
      (3) `needs.long` and a named agent's `harness` are left out. Persona change, then a fresh
      eval (D175 (4)); check sonnet too. Trigger: the next persona change.

- [ ] **A two-tier partner tool list** (D175 (5), research/48 §3): the core tools always, routines,
      rules and connections loaded when used. Not now: the 24 tools are ~7K tokens. Trigger: the
      partner's list passes 30 tools or 32K JSON chars (`tool-budget.test.ts` G2 forces it).

- [x] **New task: attachments (D128).** Done by D206 for pictures (drop, paste or 加图片 on the
      What row; they go to the task with the words). Files follow phase 2 below.
- [ ] **Projects: rename and remove (D186).** Defaults: click the name in By project to rename
      (the `cardName` control; every task carrying it follows); remove from the group's ⋯, its
      tasks untouched. Trigger: the first time a folder's name isn't the name the author wants.
- [x] **Projects: add a folder on the server itself, or from the phone (D186).** Done by D203:
      找一个文件夹… on any computer of the home, from any client.
- [ ] **New task: "every time something happens" (D185).** The card's 等某件事发生 is one-shot;
      a repeating condition still goes through the partner (its check is compiled by a model).
      Trigger: the first time the author wants a watcher without saying it.
- [ ] **New task: By project on the phone (D128).** The phone's On hand stays by state.
      Trigger: someone works several repos from the phone.

- [ ] Two results landing together still mention branches and guess at merge conflicts (eval
      `settle` 0/2). Settlement batching in code, not prose.
- [ ] Greetings sometimes give two examples (eval `first_words` 3/4).
- [ ] Re-verify live that a task never phrases Hold as "no" (brief changed, not re-run).
- [ ] Parked Claude Code sessions take ~10 s to resume; nothing prewarms tasks.
- [ ] **Archive horizon for dropped and failed-to-start tasks.** The sweep archives only `done`,
      `done?` and `failed` tasks idle 14 days; a dropped task keeps its worktree for Undo.
      Trigger: worktrees of dropped tasks pile up on disk.
- [ ] **A resume rejected after it started** (the harness accepts the id, then its stream
      errors) still parks the task; only a refusal at start falls back to a new session.
- [ ] Tasks can write outside their place (one used `/tmp/flk`); no sandbox on the Mac.
- [ ] **D198 on the phone and web:** the opened task shows no working-copy path there (the Mac
      app does; there is nothing to open it with). Trigger: someone wants to copy it from the phone.
- [ ] **D201: Rex can't be opened at a folder on macOS yet**, so 打开 leaves it out until its
      Info.plist claims folders. Its bundle id (`com.superlogical.rex`) is inferred; check it on an
      installed copy. Warp's URI is documented, not run here. (con ships it from 0.1.0-beta.177,
      nowledge-co/con-terminal#557: its Info.plist claims `public.folder`, so Ducter lists it with no
      change; seen in the release's plist, not yet on an updated copy.) Trigger: Rex ships folder
      opening, or someone with Warp tries it.
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
      `AGENTS.md`) and a pass of `packages/partner/eval`. pi and DeepSeek Harness: done (D177,
      research/50 §5).
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
- [ ] Consumer voice on a cheap model (D129): haiku still names the leftover items ("证书、描述
      文件…"), writes a third sentence in a relayed question, and sonnet once said "点 Go". Try a
      code guard (drop a relay clause naming Go / Hold, as D109 refuses wrong-language asks) and
      more voice scenarios (en result, a relay with a default). Trigger: the next partner eval
      round, or a dogfood message with jargon.
- [ ] The partner relays a task's question with its own Go words: today the button says the
      task's default ("好，Continue" when the task gave none). Let the relay carry a goLabel.
      Trigger: a relayed question whose button reads wrong in dogfood.
- [ ] A push for a task's question goes out with the task's wording, before the partner has said
      it (D129 holds only the conversation). Hold the push for the relay, up to the same 60 s.
      Trigger: push dogfood.
- [ ] Mac dark through the **Midnight** theme (D134, roadmap): the phone has Pebble dark, the
      Mac app has one light token set. Trigger: the roadmap slot for themes.

## Long-term memory (`design/memory.md`)

- [ ] **Ask Mem for orchestrator attribution on plugin writes** (D175 (6), principle 17): a task's
      plugin capture records the persona and its agent's `source_app`, but nothing says Ducter
      ran it or which task. Ask for an env the plugin passes through (e.g. `NMEM_ORCHESTRATOR`
      with a task id / Log pointer). Trigger: the next Mem sync.

- [ ] **Measure the Mem plugin's Context Bundle per agent** (research/48 M2): one scratch task per
      harness with the plugin present, on a real persona, at the task window; read the first
      turn's input tokens with and without the plugin; record it as `memPlugin.contextCost` in
      harness-facts and add its ceiling to `prompt-budget.test.ts`. If it is large, ask Mem for a
      size knob. It re-enters after each compaction (SessionStart "compact"). Trigger: before the
      first tagged release.
- [ ] **Codex: does memory off hold?** (research/48 M3) The setup guide adds "its hooks script"
      beside `codex plugin add`; if it lands in the user's own hooks, `plugins.<id>.enabled=false`
      leaves its SessionStart hook running. Check on a scratch `CODEX_HOME`; if so, also turn the
      user's hooks off in memory-off tasks (`features.hooks=false`), and say so. Trigger: same.
- [ ] **DeepSeek Harness memory off** (D174 (7)) runs under a Ducter-owned home: verify the login
      and the profile bundle's absence on a real install. DSH 0.2.2-rc.1 now runs live (D177): the
      login holds in an owned home (the key from the env); the bundle's absence needs Mem's DSH
      bundle installed in a user home to compare. Trigger: a user with Mem on DSH.

- [x] **One live write**, read back, then removed (D63, D141 (6), 2026-11-09): identity,
      `source_app` and `metadata.source_message_id` verified on Cloud. The key may not create
      Spaces, so it went to the Personal zone, not a `ducter-scratch` Space.
- [ ] Re-run `mem-live.ts --real` with a key that may create Spaces and Agent profiles, to check
      the `ducter-scratch` Space and the rename (`nmem agents set`) live. Trigger: an owner key
      or a local Mem.
- [x] The Bridge's named Agent Context names the persona's identity (D141 (7)): D205's connect names it
      (`--agent-id`) and the passive setup afterwards must say the same identity, or Bridge stays off.
- [ ] Outbox with idempotency keys when Mem is down (research/private/10 §"Mem down ≠ Ducter
      down"). Today a save while Mem is down is dropped and nothing is shown.
- [ ] Search before writing, to supersede instead of duplicating (`nmem m supersede`).
- [ ] Undo on the Noted line (archive the memory, never delete).
- [x] Tasks (windows) as the same identity: `NMEM_AGENT_ID` in the task's session spec (D141).
- [x] Nowledge Mem in tasks (D168, built with fakes): the plugin stays on as the persona, Ducter
      fills in where it isn't, `remember` proposals, the plugin off in the task with memory off.
- [ ] Live: a Claude Code task and a Codex task on a computer with the plugin: its SessionStart
      Context Bundle loads in the task under the persona's identity (`NMEM_AGENT_ID`), its
      captured thread lands as the persona with the task's native session id, and no mailbox
      notice shows. Trigger: before calling D168 done.
- [ ] Live: memory off really keeps the plugin out (Claude Code `--settings enabledPlugins` is
      INFERRED; Codex's per-id switch is VERIFIED for other plugins, research/38), and the
      Codex plugin's hooks from its `install_hooks.py` don't still run. Trigger: same.
- [ ] Does Mem distill a captured thread into memories by itself? If so, a task's `remember`
      and the partner's `memory_add` could duplicate it: ask Mem's team, then dedupe or drop
      `remember` where the plugin captures. Trigger: the first live run above.
- [ ] A recall relevance floor and a better query than title + brief, measured on a real
      channel replay with tasks. Trigger: the replay in "The conversation's own memory".
- [ ] Live: 装上 on a real worker with a fresh Claude Code, through Mem's SKILL.md to a passing
      `nmem --json plugins inspect --host claude-code`; and the connect-link ask when Mem isn't
      connected there (D169). Trigger: before the first tagged release.
- [ ] 有新版 / update: Mem's check names no newer plugin version today; when it does, the line
      shows it (built, untested against a real answer). Trigger: nmem adds it.

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
      threshold (the harness's context count past 120K, digest or not; `context.md`).
- [x] The partner's harness compactor bounded above the re-cut (Claude Code window + no idle or
      precomputed compaction; Codex token limit), the context size taken from the harness's own
      count and kept across a resume, and a re-cut with no digest (research/11 §7.3.7).
- [x] Bound pi's and DeepSeek Harness's own compactors for the partner (D177): DeepSeek Harness
      by its owned home's `compaction-basic.thresholdRatio` + `retainTokens` (live); pi by Ducter's
      re-cut at 120K (pi's own point is the window minus 16K).
- [ ] pi's own compactor as a second bound under the re-cut: an extension on
      `session_before_compact` that cancels in a partner session. Trigger: a pi model with a
      window under ~140K offered as the brain.
- [ ] D135 small windows on pi and DeepSeek Harness: pi has no per-session window or
      compaction flag (settings.json `compaction.reserveTokens` only; a project `.pi/settings.json`
      or an extension on `session_before_compact` could carry the save/re-inject). DeepSeek
      Harness tasks in a Ducter-owned home (memory off) get the compaction point (D177); a task in
      the user's own home keeps the user's. Trigger: a task on either runs long.
- [ ] D135 periodic re-verify of `design/harnesses.md`: `bun scripts/probe-harnesses.ts --strict`
      on each harness update (and in CI on a machine with them installed); widen `verified` only
      after the live checks behind each fact are re-run. Trigger: `ducter doctor`'s warning, or
      any probe drift.
- [ ] D135 live checks owed: a task that actually reaches 160K on Claude Code and on Codex
      (the save ask lands mid-turn, the PreCompact note shows in the summary, the brief comes
      back, Details counts it); OAR's mid-turn `usage` events carrying a fresh context reading
      (INFERRED; tests use fakes). Trigger: the next token budget for a long live run.
- [ ] A long-running live check that the harness never compacts the partner: count
      `partner_session` `harness_compacted` events in real use. Trigger: the first one seen.
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
- [ ] **Proactive help (D165) and the accounts card (D166): the live trial**, `connectors.md`
      §1.1. Steps 1–9 are built and tested on fakes (2026-11-10). Owed: (10) a live trial on the
      author's oo with a scratch home (which action ids oo answers for calendar, GitHub and chat;
      a real morning; a Go task end to end); a live triage run on a private labeled set from the
      author's inbox (outside git, like research/15), scored with
      `packages/partner/eval/proactive/` to tune the cap and the per-kind bars; iOS's
      time-sensitive category for "now". Trigger: the author's go for a live trial.
- [ ] **Mailbox and app-tile art** (D166): a clay mailbox per source colour at 640 (closed, lid
      up, grey) and the app tiles' clay base; marks per each brand's guidelines (D146's rule).
      Then the human comprehension test (with D65's). Trigger: met (D166 decided 2026-11-10).
- [ ] **oo's own read/write hint and action list** (D122, `connectors.md` §18.4). oo has no "list
      actions" and `connector schema` carries no read/write; OOMOL has both (its generated
      `oo-gmail` skill tags `[write]` / `[destructive]`). Ask OOMOL to expose them, then use
      them over the verb rule (keep the rule as the fallback). Trigger: the next oo release, or
      a conversation with OOMOL.
- [x] **OOMOL Hosted with a real key** (D158, research/44 §6). Done 2026-11-10 (D180): the
      console key works as Bearer at `/v1/mcp`; the tool list had been renamed (`connector_*`),
      so the catalog is now inferred from what its tools take; `/v1/apps` gives `id`, `alias`,
      `accountLabel`; search, read/write and a read on each Gmail account checked live.
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

## Pictures and files, phases 2 and 3 (D206, `design/media.md`)

- [ ] **Phase 2: files and PDFs from the user.** The same tray, a file card in the message, the
      file handed to a task as a path in its place (an agent reads it there; a PDF to a model that
      takes documents through OAR when it does). Trigger: the first time the user wants to send a
      PDF or a log file.
- [ ] **Phase 2: a share sheet into Ducter.** An iOS share extension and an Android share intent
      that open the conversation with the picture (or file) in the tray. Trigger: phase 2 files,
      or the first time a picture has to be saved first to be sent.
- [ ] **Phase 3: video.** Send and view; the model sees ~6 frames taken on the sending device.
      Trigger: the first screen recording a task should look at.
- [ ] **Phase 3: reply to a message** (quote one message or picture), and **link previews**.
      Trigger: two conversations a week where "that one" is ambiguous / a pasted link reads as noise.
- [ ] **A routine's pictures.** A New task scheduled for later keeps its words only. Trigger: the
      first scheduled task that needs a picture.
- [ ] **Media housekeeping.** The store keeps everything; a sweep of pictures no event references
      for 90 days. Trigger: the media folder passes 2 GB on any home.
- [ ] **Mac viewer: pinch and grow-from-tile.** The Mac opens with a scale and fade and zooms by
      double-click only; HEIC from Finder is skipped (Go reads none). Trigger: the author's review.

## Folders that aren't repos (D142)

- [ ] **Live run with a model** (owed: skipped for the token budget). A scratch Ducter, a cheap
      model, a scratch folder of fake invoices sorted into month folders, then Undo from the app
      and from `ducter undo`. The flow is proven with temp folders and a scripted harness
      (`packages/runner/demo-folder.ts`). Trigger: the next budget window.
- [ ] **Claude Code: keep writes inside the folder.** Under bypass nothing holds it there; try
      Claude Code's own sandbox (`--settings` with `sandbox.enabled`) for Bash and check it in a
      live run (the experiment was not allowed this session). Trigger: a report of a task writing
      outside its folder, or the live run above.
- [ ] **More than 10 deletes at once, after the fact.** Today asked in the brief only. Detect it
      at the turn end against the copy and offer the deleted files back in one card. Trigger: a
      task deletes many files without asking.
- [ ] **The proof line under a folder result** still counts `file` evidence ("改了 1 个文件") next
      to the Changes sentence; show the folder's own count there. Trigger: next pass on results.
- [ ] **Linux check:** reflink on btrfs/xfs and the network/external mount detection were
      written from the mount table, not run on Linux. Trigger: the first Linux server user.

## Autofill (D191, `design/autofill.md`)

- [ ] **The author's review of D191** (draft): the three stores, never storing the security code,
      no reveal, OK per site, the Pay card. Trigger: the author's next session.
- [x] **A real errand, once** (2026-11-11, a scratch home; shots `.shots/autofill-live/`): a saved
      sign-in on practicetestautomation.com, a home address into httpbin.org's form, and Stripe's
      test-mode Checkout paid with the test Visa after the Pay card, each after its card was answered
      over the client protocol. No secret in the Log, the transcripts or any tool answer. Fixed on the
      way: a one-computer home refused browser places; the sidecar chose before the brief was logged
      (a saved handle didn't get Ducter's browser); two OK cards for one sign-in; fills into a
      re-rendered field; Stripe's 0x0 payment-method buttons; no way to choose a select.
- [ ] **Card fields in a cross-origin iframe** (Stripe Elements, the embedded Checkout on a merchant's
      page): the reader doesn't enter iframes, so the task can't see or fill them, and the Pay card's
      merchant would have to be the top page's host while the fill goes into the frame. Trigger: the
      first real checkout that embeds its card form.
- [ ] **Say the result of a payment the page shows only as an icon** (Stripe's green check): read the
      button's state or aria, or a screenshot to the user. Trigger: a task reports "not sure" after Go.
- [ ] **Screenshots of a page that echoes a filled value** show it in clear (httpbin's echo of the
      address): the dots only cover filled fields. Keep screenshots from the model, or mask echoed
      values before saving. Trigger: the review of D191.
- [ ] **A model's own payment question beside the Pay card** (sonnet asked with `report_to_main` in the
      same turn; its done was held until that was answered too). Trigger: it happens again in the eval.
- [ ] **A card's postcode isn't scrubbed** from reads (only values of 6+ characters are, and postcodes
      aren't listed). Trigger: the review of D191.
- [ ] **Clay art for Autofill** through the metaphor process (it borrows the 上网 clay today).
      Trigger: the review of the Settings shots.
- [ ] **Face ID / Touch ID on the Pay card** (the iPhone shell's existing unlock; LocalAuthentication
      in the Mac app). Trigger: the first real payment.
- [ ] **The live view's "fill from saved"** plugs into `FillSeam` (`packages/core/src/saved/fill.ts`)
      when the takeover work lands; the owner taps a field, then a saved thing.
- [ ] **1Password / Bitwarden by reference** (research/54 §5: 1Password's agent programme is
      partner-only; Bitwarden Agent Access SDK is alpha). Trigger: a public path for self-hosted agents.
- [ ] **Single-use cards** (Stripe Link agent wallet via `link-cli --output-file`, Privacy.com) behind
      the same Pay card, US/Canada. Trigger: a user outside the owner's-card path asks.
- [ ] **Codes from a connected mailbox** with per-account consent and a Muse-like filter. Trigger: 3-D
      Secure by SMS/email shows up as the common blocker.
- [ ] **Filling on a worker's browser** sends the value over the worker socket (the owner's own
      computer); say it on the Autofill page, or fill on the home only. Trigger: the review.

## Browser places (W5)

`packages/runner/src/browser.ts` attaches cua-driver directly (D47). Verified live on 0.44.0
(`design/onboarding.md`, "The browser, first time").

- [ ] **env-gate MCP proxy:** untrusted-content framing, domain policy, submit/pay as intents
      (today the rule lives only in the task brief). First slice done: 10 allowed cua tools,
      Claude built-ins Bash/Read/Write/ToolSearch, no user Claude config (W5-2; HN lookup 332k →
      140k input tokens).
- [x] **Hostile pages and the Log.** A browser task's `log_search` / `log_read` reach only its
      own stream (D62); other tasks reach their own stream, their person's conversation and
      that person's other tasks, never another person's (`packages/core/src/tools.ts`,
      `packages/core/test/log-reach.test.ts`).
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
- [ ] **Server browser, real-server checks (D151).** Built and tested on a Mac with Chrome for
      Testing 157 (`DUCTER_TEST_CHROME`): tools, blind, live view, sign-out, persistence. Still
      to run on Hetzner Ubuntu 24.04: the install as root and as a user (the t64 names, the
      `sudo` line), `--no-sandbox` as root, a live view from the phone through `ducter domain`'s
      HTTPS, a real sign-in with 2FA, and how often a datacenter IP meets CAPTCHAs or "this
      browser may not be secure". Trigger: v0.0.4 on the author's server.
- [ ] **Server browser, later (D151):** Xvfb + headed Chrome when a site refuses headless;
      a pending live view that survives a socket reconnect; a Codex Computer Use brief that
      isn't appended on Linux for non-browser places; Chrome updates (re-run the install when
      CfT Stable moves); browser places on a worker. Trigger: the first such report.
- [ ] **Native browser, live checks (D130).** Native is the default and unit-tested with fakes;
      what is still unseen live: (1) a Claude in Chrome run with the extension connected to
      Claude Code (HN lookup, then a sign-in handoff), and the in-place move to cua-driver on a
      real "not connected"; (2) Codex's browser tools with Ducter started under the desktop app
      (access host passed through), in the in-app browser only; (3) whether a socket-only Claude
      in Chrome connection shows in `list_connected_browsers`. Computer Use stays out of live
      tests (rule).
- [ ] **Restrict Codex Computer Use to the browser surface when the access host is there.**
      `-c plugins.unified-computer-use@openai-bundled.mcp_servers.cua_repl.env.CUA_REPL_ENABLED_SURFACES="browser"`
      would make app-level keystrokes impossible in a browser place; the `mcp_servers.<name>.enabled`
      path is verified, the `env` one is not (it might replace the server's whole env and break
      it). Trigger: the first live run of (2) above.
- [ ] **A clean setup for DeepSeek Harness browser tasks.** Owned homes are per setup now
      (`<dataDir>/harness/dsh/<hash>`, D177), so a browser task no longer overwrites the partner's;
      set the clean setup in runner `withBrowser`. Trigger: the first DeepSeek Harness browser task.

## The device card as a character sheet (D161, `design/ui-devices-card.md`)

Built 2026-11-10 on both clients (§12). Still open:

- [ ] **Learned rules on Settings › 伙伴** with **你换过两次以后定的** and **不要这条** (D161 (9)).
      Trigger: the first rule the partner learns from two switches.
- [ ] **Owed design:** a dedicated small clay object for 替 {home} 做事 (today the home's own
      clay); Pebble dark on the phone's sheet; a device with five or more agents (the tray wraps
      today); the comprehension check of the chips with naive raters (LLM proxies first).
      Trigger: the next design pass on Devices.
- [ ] **The phone's chips for another computer**: 上网 and 用电脑 toggle from the phone, but 在哪儿都能用
      (a pairing code) and 替 {home} 做事 (a LaunchAgent on that Mac) only explain themselves there.
      Trigger: pairing from the phone.
- [ ] **A phone's 通知 chip on the Mac's card** needs the home to know each phone's notification
      state. Trigger: the protocol carries it.
- [ ] **The shared-controls guard on the rest of the phone client** (`views.tsx` still has its own
      `qlink` and form buttons): move them into `controls.tsx` and widen `test/controls.test.ts`.
      Trigger: the next settings or task-page change on the phone.

## Where a task runs (draft D157, `design/where.md`)
## Where a task runs (D157, `design/where.md`)

D157 was decided 2026-11-10; the build runs in `where.md` §13's order (step 1 unblocks the Mac worker).

Built 2026-11-10 (`where.md` §16): browser places on a worker (native, cua-driver, Ducter's own
browser driven over the worker socket, the live view through it); 上网 and `alwaysOn` per
computer; the one ranking with needs and one reason; a task waiting for its computer and the ask;
the where line on both clients; Switch who does it with the island strip and the move; New task's
computer part; 我要合电脑了; the parcel's Lands / Waits / Moves. Still open:

- [ ] **Live check on hel + the MacBook** (the build is tested with fakes only): a browser task on
      the MacBook in the user's Chrome, Ducter's own browser on a Linux worker with a real sign-in
      through the live view, a move of a repo task with a real push. Trigger: the author's next run
      with the Mac switched on.
- [ ] **Partner eval scenarios W1–W6** (zh/en) for `task_open needs` and the ack naming where only
      when it waits or uses the user's Chrome. Trigger: the next partner eval run.
- [ ] **The Mac's own sleep notice as the closing trigger** (NSWorkspace willSleep): the worker is
      the `ducter worker` process, the app has no sleep observer, and nothing sends `{t:"sleep"}`
      today, so "asleep" is never reported (a lid close reads as 连不上). Trigger: the first real
      lid close with work on the Mac; build a willSleep observer in the app that tells its worker.
- [ ] **`alwaysOn` for a Mac on power** (a power assertion while plugged in, A3): today a laptop
      always counts as sleeping. Trigger: a plugged-in laptop used as the always-on computer.
- [ ] **A repo on two computers** gets New task's computer part too (`where.md` §6.3; today only
      No folder has it), and continuity (its worktree or uncommitted changes) as a ranking step
      with a real signal. Trigger: the first repo cloned on both hel and the Mac.
- [ ] **A worker's Signed-in sites** in Settings (the ranking already reads them from the home's
      `@<device>:<profile>.sites.json`). Trigger: the first sign-in through a worker's live view.
- [ ] **A task waiting for its computer across a home restart** is recovered as parked, not as
      waiting. Trigger: the first restart with such a task.
- [ ] **Evidence screenshots of Ducter's own browser on a worker** are saved on the home, where the
      task on the worker can't read them. Trigger: a task that needs to look at its own screenshot.
- [ ] **Comprehension check** of Lands and Moves with D81's owed human test of the stage.
- [ ] **D202: Claude Code's pinned model versions** (claude-opus-4-8, claude-sonnet-4-6, …) in New
      task's Model row (today its named models only: opus, fable, sonnet, haiku), behind a **更多 /
      More**. Trigger: the first time the user wants an older model for a task.
- [ ] **D202: live check** of Model and Effort on hel + the Mac (a worker on this build answers
      `models`; an older one leaves the card on the tier table), and Claude Code's `get_settings`
      read-back refusing an effort its settings clamp (the task then fails to start, with OAR's
      line). Trigger: the author's next run with the Mac switched on.
- [ ] **D202: the switch sheet (换谁来做) picks a model and effort** the same way (today it keeps
      its rows per model and drops the effort on a switch). Trigger: the first ask to switch to a
      deeper effort mid-task.
- [ ] **D203, D204: live check** on hel + the Mac (a worker on this build answers `repos`, `browse`
      and `clone`; an older one shows "needs an update" on both cards), and a real clone from the
      phone onto the Mac (a private GitHub repo over https with the Mac's keychain, and over ssh with
      its agent): only faked git so far. Trigger: the author's next run with the Mac switched on.
- [ ] **D204: the Ducter folder in Settings** (a field beside where it lives; today only
      `DUCTER_FOLDER`). Trigger: the first person who wants it somewhere else and doesn't use a shell.
- [ ] **D204: clone progress** (git's own percentage in the field, from `--progress` on stderr,
      relayed by the worker). Today: a spinner and "a big repository takes a few minutes".
      Trigger: a clone that someone abandons because it looked stuck.
- [ ] **D204: plain folders in `~/ducter/projects`** (not git repos) are not listed; list them as
      folder places. Trigger: the first person who puts one there and expects it.

## Wide screens: the whole screen (D184)

- [ ] **Run it in the iPad simulator and on a real fold**: the arrows, ⌘2 from the iPad's menu
      (twice), Esc on a hardware keyboard, the morph on WebKit (iPadOS 18+ has view transitions),
      and the book fold on the emulator's Pixel 9 Pro Fold (841 × 701). Trigger: the next iPad or
      Android build.
- [ ] **The opened task's own parts, web vs Mac**: the whole-screen task uses the web's task page
      (D152) under the Mac's crumbs; its head (meta line wrapping, the outcome block) still differs
      from the Mac's in places. Converge part by part. Trigger: the next change to either task page.
- [ ] **A tabletop's whole screen**: today neither level takes it on a tabletop. If wanted: Needs
      you above the fold, the other lanes below. Trigger: someone uses a fold that way.

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

- [ ] **The E2E rig in CI (D172, `scripts/e2e/linux.ts`).** It runs on a Mac with colima today.
      Next: a forced-rollback release (a binary that fails `/health`) in the same run; the Mac
      app's own update (a signed DMG through `DUCTER_UPDATE_FEED`); the phone client in a
      headless browser against the same VM; an x64 VM (qemu) for the x64 tarball. Trigger: the
      next release that touches update or the live view.

- [ ] **The notification relay live (D159, `design/release/push-relay.md`).** Built and tested
      with a fake APNs and a fake relay only; nothing is deployed. Open: the APNs key and the
      relay's environment in Vercel; `GET https://ducter.ai/api/push/health` says `ok: true,
      store: "kv"` (confirms Vercel builds `apps/site/api/` next to the Astro preset); the first
      tagged release signs `DucterNotify` (`co.nowledge.ducter.ios.notify`) through CI; on a real
      iPhone a decision arrives with its words and Go / Hold / Reply, and "Ducter needs you" shows
      when the key is missing. Trigger: the author's steps in `push-relay.md`.
- [ ] **Relay hardening, later (D159):** App Attest on register so only the genuine app can get
      a handle; rotating the handle encryption key with a key id; a per-home budget once homes
      identify themselves to the relay. Trigger: abuse seen in the relay's 429s, or the App Store
      release.
- [ ] **Notifications in the Android app (D181 (4)), without Google as a requirement:**
      UnifiedPush. The app registers with a distributor (ntfy, or an embedded FCM distributor
      only where Play services exist), gets an endpoint, makes the p256dh/auth keys, and hands the
      page a standard Web Push subscription; the home's existing Web Push sender serves it once
      `isPushEndpoint` accepts endpoints the paired app vouches for (keep the SSRF guard: https,
      no private addresses, per-device). The app shows the notification with Go / Hold from the
      decrypted payload (the shape `sw.ts` uses). Was: an FCM relay in the push function (D159's
      shape), which would make Play services and a Firebase project a requirement. Trigger: the
      Android app in users' hands (0.0.10) and the first ask for notifications.
- [ ] **Android app, before it ships (D181):** the release keystore, its four secrets and the
      `ANDROID_CERT_SHA256` variable (`design/release/android.md`); Android developer verification
      of `co.nowledge.ducter.android`; install and update on a real phone and on a Chinese ROM
      (Xiaomi asks on every update); one update between two release-key builds; the QR scanner
      with a real camera. Trigger: tagging 0.0.10.
- [ ] **Android app, later:** a share target (send a link or text to the partner); the page's
      Settings showing this app's version with Check now (the bridge has `update.check`); a
      download link on the website once the first APK is out. Trigger: the author's ask.

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
- [ ] D160 on a real Mac: Restart Now from 0.0.6 to the next release shows the putting-in
      screen, no white window, and opens with Updated to; the relaunch skips the LaunchAgent
      restart and connects to the new helper. Verified so far on a scratch signed bundle with no
      LaunchAgent (DUCTER_URL to the mock server). Trigger: the next tagged release.

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

- [x] The full partner eval on pi and on DeepSeek Harness, flipped `partner` (D177: DSH 68/74,
      pi 62/74, Claude Code + haiku 52/74 on the same persona; research/50 §5).
- [ ] A second full run of each (variance), and DeepSeek V4 Pro on both. Trigger: before 0.0.9 ships.
- [ ] pi's cache reads were 73% of input in the eval against DSH's 96% on the same model: find the
      part of pi's request that varies early. Trigger: pi as the brain on a busy day.
- [ ] Owned DSH homes are one per setup (`<dataDir>/harness/dsh/<hash>`): each persona edit leaves
      the old home and its sessions. Remove homes untouched for 30 days. Trigger: ten of them.
- [ ] One DeepSeek key for pi and DeepSeek Harness (D102 gives it to DSH only; pi on DeepSeek signs
      in with its own `/login`). The author's call (D177, default no).
- [ ] Why Bun 1.3.1 SIGKILLs a host after a few pi RPC sessions (research/50 §4; 1.4.4 doesn't).
      Trigger: a Bun older than the pin anywhere Ducter runs.
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


## Nowledge Bridge (D105–D111, D162–D164, D170–D171, D205, `design/bridge.md`)

- [ ] Connect the persona in Only me (D205): on the home, Settings › 伙伴 › 你的其他 AI › 连上 (it runs
      `nmem bridge connections connect --space-id <Only me> --agent-id ducter --context ducter`). Built and tested
      over the fake; never run against Mem. Trigger: nmem 0.10.118 public and installed on the home (hel).
- [ ] Run `bun run bridge:live -- --connected` (dry), then `-- --connected --real` and record it in research/37:
      S1, S2, S3 and an X1 round trip with a native Claude Code session as the other side. Check that the native
      binding's own context works for logical `contacts/send/inbox/reply` (INFERRED) and replace the fake's
      `connections`/`session prepare` shapes with the raw ones. Trigger: the connection above.
- [x] A start mark for the persona's mailbox (B14, D170): what was in the inbox at the first check is never a
      request.
- [x] X1 · "有事问 Ducter" (D164, D170): the asker card on both clients, the reply by code, "not yet" after 30 min,
      60 s checks while live, 3 open asks per agent, the lock-screen copy.
- [x] X2 · "直接接" (D163, D170): the offer after two Go's, the rule in Settings › 伙伴, 5 a day.
- [x] Settings › 伙伴 › 你的其他 AI (D170): who can reach the partner, the learned rules, the muted.
- [ ] X3 · a team's agents: a per-team switch once a team context exists, Space-scoped answers (Mem search in that
      Space only), and the eval scenario for a teammate's question. Trigger: a team context and Mem's Team Bridge
      accepted.
- [ ] **不再听 <agent> 的** as a button on its cards and quiet lines (today: said to the partner, undone in
      Settings). Trigger: the first user who mutes one.
- [ ] Muted and over-quota senders are logged after `open` reads them; a sender-only probe would leave them unread
      (B6). Trigger: Mem ships `bridge inbox --peek` or a sender in `inbox`.
- [ ] The partner eval: `bridge-ask-you-zh/en` (a question from the user's own agent becomes an asker card, no
      prose, no bridge_reply) and `bridge-trusted-zh` (a trusted agent's work opens with no card). Trigger: before
      Bridge is on by default.
- [ ] X5 · consumer AIs (J5): take X1–X3's rules unchanged. Trigger: Mem's remote-MCP delegation (#8956) ships.
- [ ] X6 · probe Mem's Slack adapter as a sender to the persona (research/37 §8). Trigger: the persona has a
      mailbox.
- [ ] File B11–B13 and B15 with the Nowledge team (research/37 §6, §8; the text is ready). Trigger: the author's go
      (D111's channel was not reachable from the session that found them).
- [ ] Replace the tolerant JSON parsing (`inbox`, `open`, `outbox`, `inspect`, send/reply results) with the real
      shapes from the live run's `raw-<time>/` folder. Trigger: the live run.
- [ ] Turn Bridge on by default by D170 (9)'s criteria (the first is met by D205: Ducter finds the persona's
      context itself; 断开 and 谁都不行 are the offs). Trigger: the live run passes.
- [x] Clients render the quiet lines (发来请求 / 已发给 / 已回复, and a sender set aside) (D170).
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
- [ ] D152: the agent's words show in its own language (often English for a zh reader). A small
      **翻译 / Translate** under a message, by the partner's cheap model, kept per message.
      Trigger: the author asks for it, or a zh user's task runs on an English-speaking agent.
- [ ] D152's summarizer and probe list (command -v, which, test, ls, grep) and the harness
      description fields (Claude Code `description`, Codex `justification`) were checked on
      fixtures shaped like the author's run, not a live Codex 0.167 / Claude Code session; check
      both, and whether Codex's exec events carry a reason field. Trigger: the next live dogfood run.
- [ ] D152 hides keys by pattern; a key with no known head and no telling field name (a bare
      32-character hex in prose) still shows. Consider hiding values the user marked as keys in
      Settings or the brief's own words ("this token: …"). Trigger: a reported leak.
- [ ] D152: a needs-you task with no visible ask was seen in the author's run; the clients now
      say **Over to you**, but the cause in core (which path set needs_you without a decision)
      wasn't reproduced. Trigger: the next time it happens, read the task's Log.
- [ ] D127's step table was built from the shapes the author's App Store Connect run showed and
      from OAR's per-runtime tool names; check it against a live Codex computer-use run and a pi
      run, and add what reads as **使用 / Used {tool}**. Trigger: the next live dogfood run.
- [ ] Older Logs have no thinking headings (`task_event.thinking` is new); a session resumed
      across the change shows Thinking lines only from then on. Trigger: none needed.
- [ ] D138: the browser's cua-driver spawns (`packages/runner/src/browser.ts`) still inherit the
      whole environment; give them `toolEnv` plus the display/session-bus names. Trigger: the
      next change to browser.ts.
- [ ] D139: DeepSeek Harness's partner session is not read-only (no per-session tool denial in
      OAR; its read-only permission mode unverified). Trigger: dsh installed for a check.

- **Chinese product name.** 「搭子」 is on hold: Baidu's AI office agent 百度搭子 (March 2026) is in
  Ducter's category (`research/41-zh-name.md`). Decide between "Ducter 搭子" and another name after a
  manual CNIPA search (classes 9, 42, 35, 38); the full zh pass is ready on branch
  `worktree-agent-a55f33cfcf026e6c1` (commit 702fa74). Trigger: the author picks a name.
- **A Mac doing tasks for a server, live (D155).** Turn on "Let this Mac do tasks for hel" in a
  signed Ducter.app against a real server: the LaunchAgent loads, survives logout/login and a
  crash, the Mac appears on hel with its agents and repos, a task runs there, and off revokes it.
  Trigger: the next release candidate.

## Harness engineering (research/48, 2026-11-10)

- [ ] **Live re-verify Claude Code 2.1.322 and pi 1.5.1** (D135 checks: compaction point with
      `--debug-file`, window knob, 1M switch) on a scratch login with haiku; widen `verified` only
      if they pass. The 2.1.322 binary's compaction code changed shape (INFERRED). Trigger: now.
- [ ] **The partner eval after D157**: add W1–W6 (needs / where), `rule_save`, connections and
      browser-place scenarios; run haiku and sonnet once. Trigger: before the next persona change.
- [ ] **One secret detector for the brief** (research/48 F7, decision §4.1). Trigger: the author's call.
- [ ] **Tool-less one-shot sessions** (`--tools ""` for the judge and the digest writer), after one
      measured call shows the saving (F8). Trigger: the next change to judge.ts or writer.ts.
- [ ] **Prompt-cache hit rate**: read `cache_read` vs `cache_creation` from a day of the partner's
      sessions (OAR usage) to replace principle 4's heuristic. Trigger: the cost-model work.
- [ ] **Before merging D165/D166 and D168/D169**: their highs in research/48 §2 (P1, P2, M1, M2).

## Phone calls (D189, D193; `phone.md`)

- [ ] **The first real call, with the author** (trigger: the token imported on the home): read-only
  first (`tuwa_balance`, `tuwa_voices`, `tuwa_calls_list`), then one cheap call to a number the
  author owns; check every answer field `phone.md` §9 lists and fix the readers in
  `phone-provider.ts`.
- [ ] **Keep a call in Mem on tap** from its result (IQ9), and the GQ4 revisit trigger (the same
  number and goal approved 3 times in 14 days).
- [ ] **The partner's 连上 / Connect from the conversation**: today it says in one line where to
  connect; a card that opens the sign-in in place.
- [ ] **Inbound and the owner's own number** (Tuwa Device on a Mac home with the iPhone nearby),
  live listening, Ducter calling the owner as the top escalation rung.
- [ ] **A second calling provider** behind the same card (Twilio + a real-time model) if Tuwa's
  reach or terms stop fitting.

## Watching Ducter's browser and taking turns (D190)

- [ ] **On the author's devices:** watch a task on hel from the iPhone over the internet (`ducter domain`), take a turn, sign in with a real two-step code, hand it back; the same on an iPad, an Android foldable and the Mac app. Trigger: the next release with D190.
- [ ] **The Mac app reopens a live view after a reconnect** (the web client does), and draws the click ring. Trigger: a reconnect seen on the Mac with a view open.
- [ ] **The quality steps on a real phone link:** read `live.stats` on a real 4G/5G phone; tune `SLOW_MS`/`FAST_MS` and the tiers. Trigger: the first real-device session.

## Ducter's data folder and the opened task (D207)

- [ ] **A place-less task's scratch folder outside the data folder** (`<Ducter folder>/scratch/<taskId>`): today it is `<dataDir>/scratch/<taskId>`, Ducter-made and empty, the one way into the data folder. Trigger: a task seen reaching up out of its scratch into the data folder, or the Ducter folder gaining a third kind of thing.
