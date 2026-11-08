> **Caveat (2026-11-08, from user):** Raft is *source-available*, not open source, and the `raft-source` snapshot read here is older than current Raft. Findings about how Raft uses OAR (e.g. "OAR only for usage/models", pinned 0.68.1) describe that old snapshot only. Ducter tracks the latest OAR.

# 05 — How Raft uses OAR, and what Ducter's runner should copy

Date: 2026-11-08. Sources: shallow clones (read only, nothing executed) under
`<scratch>/repos/`:
`raft-source` (release mirror, one commit `db5e399` "Release v1.21.23-source.1", 2026-10-19, so it has no
history to answer "why" questions) and `oar` (`2e235c8`, 2026-11-07, `@botiverse/oar` 0.95.0).
Path prefixes: **D/** = `raft-source/packages/daemon/src/`, **S/** = `raft-source/packages/`, **O/** = `oar/`.
**V** = verified in source. **I** = inferred.

## 0. Headline: Raft does not run its agents through OAR

- (V) Raft pins `"@botiverse/oar": "0.68.1"` in both `S/daemon/package.json:52` and
  `S/server/package.json:82`. OAR is at 0.95.0 (`O/packages/oar/package.json:3`), 27 minors later.
- (V) In the whole daemon, OAR values are imported in exactly one place, `D/oarLoader.ts:15-21`. It says
  so itself: "The daemon uses OAR for account-usage reads and the opencode model listing"
  (`D/oarLoader.ts:8-11`). It has two callers: `D/runtimeAccountUsage/collector.ts:107` and
  `D/drivers/opencode.ts:689`. The other OAR uses are type imports or the server-side config forms
  (`S/server/src/services/runtimeFormFromOar.ts`, `runtimeFormV2Registry.ts:1338`). Raft's shared tool-kind
  vocabulary is also aligned with OAR's `ToolActionKind` (`S/shared/src/activityTurnSummary.ts:18-19`).
- (V) Sessions, steering, events, resume and recovery all go through Raft's **own** drivers:
  `D/drivers/{claude,codex,cursor,gemini,grok,kimi,kimi-sdk,opencode,pi,copilot}.ts`, about 57k lines
  including `D/agentProcessManager.ts`, which alone is 11,367 lines. Claude runs as hand-built
  `claude --output-format stream-json ...` (`D/drivers/claudeLaunch.ts:96-131`). Codex runs through
  hand-written app-server JSON-RPC (`D/drivers/codex.ts:904-930`).
- (I, from OAR's docs) Raft is now moving onto OAR. OAR's decision log of 2026-11-06 says
  "`recordStderr`/`oomScoreAdj`: Raft asked for both **to move Codex onto OAR**"
  (`O/docs/design/decisions.md:74-76`). It also records that Raft asked for bounded retention
  (`retainedBytes`, `decisions.md:101-104`) and for `exitCode` to be parsed from Claude text, which OAR
  refused (`decisions.md:434-445`). OAR imported a regression "transferred from Raft's runtimeSession test"
  (`O/tests/process.test.ts:28`). Config forms started in Raft and moved into OAR
  (`O/docs/spec/config-form.md:9-12, 483-561`). The OAR team coordinates inside Raft
  (`O/docs/design/roadmap.md:131`).

**So the premise "study how Raft uses OAR as its harness layer" is mostly false for the code that exists
today.** What Raft offers Ducter is (a) a narrow, well-isolated example of consuming OAR for
non-session reads, and (b) a large body of runner policy (wake, recycle, recovery, version fencing) that
sits *above* any harness layer. Ducter should put that policy on top of OAR's `Session` instead of
rebuilding Raft's drivers.

## 1. Integration shape and seams

| OAR surface | Raft uses it? | Evidence |
|---|---|---|
| `Runtime.session` create/resume, `prompt/steer/queue/abort/deliver` | **No.** Own `RuntimeDriver`/`RuntimeSession` | `D/drivers/types.ts:475-653`, `:400-470` |
| record stream / `events()` / `rawEvents()` / `seq` | **No.** Own `ParsedEvent` union plus per-driver normalizers | `D/drivers/types.ts:98-238`, `D/drivers/*EventNormalizer.ts` |
| `@botiverse/oar/observe` | Only the `ToolActionKind` vocabulary | `S/shared/src/activityTurnSummary.ts:18` |
| capability facts (absent members) | **No.** Own descriptor (lifecycle, input modes, busyDelivery, postTurn) | `D/drivers/types.ts:14-39, 382-398` |
| `installation()` + `accountUsage()` | **Yes** | `D/runtimeAccountUsage/collector.ts:118-148` |
| `listModels` | **Yes** (OpenCode only) | `D/drivers/opencode.ts:683-710`, `D/runtimeModels/oarListModels.ts:11-53` |
| `@botiverse/oar/forms` | **Yes** (Grok form, with host narrowing) | `S/server/src/services/runtimeFormFromOar.ts:1-40` |
| install / login / orient / `serveMcpTools` / agents | **No** | no imports (grep) |

How the seams are built (V):
- **One lazy-loading module.** `loadOarRuntime(id)` imports `@botiverse/oar/runtimes/<id>`, never the
  root entry, because "the root loads every runtime OAR supports (~49 MB of heap), while each runtime
  entry is 1-2.4 MB". A failed load is retried instead of cached (`D/oarLoader.ts:4-34`). The rule is
  "Import OAR's values only through this module; type imports are free."
- **An anti-corruption projection.** `oarAdapter.ts` maps OAR's `AccountUsageSnapshot` onto Raft's own
  wire schema. The collector keeps `unsupported` (structurally can't read) apart from `error` (tried and
  failed): "Collapsing these would make 'we never could' and 'it broke just now' look identical"
  (`collector.ts:84-96`). A thrown read "must never be rendered as zero usage" (`collector.ts:146-148`).
- **Injectable deps for tests.** `OarUsageReadDeps.runtime` (`collector.ts:12-15`). Tests build fake
  runtimes with OAR's own `defineRuntime`, whose `session` throws "session must not be started by an
  account-usage read" (`collector.test.ts:25-37`).
- **Narrowing, never widening, OAR forms.** Raft may offer fewer model modes, or make a field required,
  but refuses at load time to widen OAR's form or swap its hint (`runtimeFormFromOar.ts:23-40`). A
  fixture-equality test keeps the served form byte-identical (`S/runtime-form/fixtures/*.form.json`).
- (V) Raft's real harness port is `RuntimeDriver` (spawn/createSession, `parseLine`, `encodeStdinMessage`,
  `probe`, `launchVersionPolicy`, `detectModels`, `buildSystemPrompt`) plus `RuntimeSession`
  (`start`, `send({mode:"idle"|"busy"})`, `stop`, `isAlive`, `on("runtime_event")`) (`D/drivers/types.ts:400-653`).
  The send result is `{ok:true, acceptedAs:"prompt"|"steer"|"notification"|"request"}` or
  `{ok:false, reason:"unsupported"|"busy_rejected"|"closed"|"runtime_error"}` (`types.ts:376-381`). That is
  the same idea as OAR's `SteerOrQueueResult`/`ControlOutcome`.

## 2. Process model

- (V) **One runtime process per agent, persistent by default.** Claude, Codex, Grok, Kimi-SDK and Pi
  declare `{kind:"persistent", stdin:"direct", inFlightWake:"steer"}`. Cursor and Gemini are
  `per_turn / spawn_new`. OpenCode is `per_turn, defer_until_concrete_message, terminate_on_turn_end,
  coalesce_into_pending` (lifecycle blocks in `D/drivers/{claude:36,codex:877,cursor:136,gemini:280,
  grok:398,kimi-sdk:1328,opencode:899,pi:2379}.ts`).
- (V) **Wake mapping.** An incoming message to an idle process becomes a new turn. A message to a busy
  process becomes, under `busyDeliveryMode:"direct"`, a *content-free* `[Raft inbox notice: ...]`, and the
  agent pulls the bodies with `raft message read/check` (`D/agentRuntimeInput.ts:206-225`, semantics at
  `types.ts:540-547`). Concrete messages are delivered verbatim ("New message received: ...",
  `agentRuntimeInput.ts:186-204`). Catching up after being offline uses an unread *summary* and asks the
  agent to read and stop (`:353-372`). An empty resume says "Nothing to do — just stop" (`:366-372`).
- (V) **Every agent-visible string is a registered "AX surface".** Each one is written as
  `axSurface(description, fn, {examples})`, and a manifest is generated from those call sites
  (`D/agentRuntimeInput.ts:47-60`). So every prompt fragment the model can see is enumerable, has
  examples, and can be reviewed.
- (V) **Standing prompt vs. per-turn input** are separate fields (`SpawnContext.standingPrompt` /
  `.prompt`, `types.ts:244-256`). Claude gets the standing prompt via `--append-system-prompt-file`, and
  Codex via `developerInstructions` (`codex.ts:904-918`). Resumed sessions keep their *old* standing prompt
  (Codex ≥0.105, Claude 2.1.288). So Raft hashes the prompt per session and, on a mismatch, prepends the
  full new prompt to the first input. The hash ignores per-release volatile fields so that a release
  does not trigger a fleet-wide injection (`D/standingPromptRefresh.ts:1-26`).
- (V) **Idle recycle: resume vs. fresh** (`D/wakeSessionRecycle.ts`, RFC 070). This is a pure function
  `decideWakeRecycle` (`:216-240`). It recycles only if all of these hold: the server flag is on, the
  runtime is in the enabled set, a prior session exists, there is no explicit resume prompt and no
  pending profile migration, *and* the facts **positively** show idle > 60 min (the "1h prompt-cache TTL
  measured across the fleet") *and* the last context is > 128k tokens (`:35-40, 216-240`). Unknown facts
  always mean resume ("Unknown facts always mean resume", `:213`). The facts come from a bounded 512 KB
  tail read of Claude's own JSONL transcript (`input + cache_read + cache_creation` of the last assistant
  usage), so the decision survives daemon restarts (`:120-185`). Other runtimes return null facts, which
  means they always resume (`:197-206`). A 10-minute **cold-idle sweep** stops idle processes that meet
  the same test, so that the next wake goes through the recycle path. It also counts sidecar (subagent)
  mtimes as activity and skips sessions with any outstanding background tasks, because "Observed live:
  the sweep killed a runtime whose Explore subagent was mid-flight" (`:420-500`).
- (V) **Seeding a fresh session.** The briefing is *intentionally empty* (`buildRecycleBriefing` returns
  `""`, `:271-279`). The v1 text ("your session was retired… consult MEMORY.md first") made 13/13 canary
  sessions open with state-rebuilding rituals (`:257-270`). The fresh input instead stacks XML-delimited
  ambient blocks: the head of MEMORY.md (`startupMemoryBlock`), then a **constructed panel** of up to 8k
  tokens (open loops, objects in play re-read live from disk, last 12 actions, last 25 messages), then
  the ordinary wake prompt last (`:548-592`; `D/wakeBriefingPanel.ts:7-58`). The panel uses the transcript
  "as the ACTION LOG … never replayed verbatim", re-reads files from the world, and drops objects older
  than 2 h because "a 10k panel concentrates it, so an old note's 'Next step:' line gains salience it never
  had". It never injects paths matching `secret|credential|password|token|.key|.pem`
  (`wakeBriefingPanel.ts:44-48`). The bar it is measured against is "behavioral equivalence with real
  full-context continuations" (1,301 samples: about 8% ritual, about 8% redo; `:15-21`).

## 3. Event handling

- (V) **No lossless record store.** Each driver parses native stdout into Raft's `ParsedEvent` union
  (text/thinking/tool_call/tool_output/compaction/turn_end/error with `providerLimit`/telemetry/
  `internal_progress`/`runtime_recovery`…, `types.ts:98-238`). The native transcript (e.g. the Claude JSONL)
  stays the only full record, read later through `sessionTranscriptReader.ts` (with redaction).
- (V) **Facts shipped to the server** go through an `ActivitySink` that stamps each with a per-agent
  monotonic `clientSeq` that is "never-reset-on-respawn" and a `producerFactId`, so the server can dedupe
  out-of-order ingest. Heartbeats re-assert busy state (`D/activity/activitySink.ts:100-140`). A "V2 sink
  (numbered log with ack and resume)" is planned but not built (`D/activity/README.md`).
- (V) The server persists `agent_activity_events` (trajectory entries for UI hydration, with an optional
  semantic `dedupe_key`) and `agent_activity_summary_v2` (one upserted row per turn, keyed by `turn_key`, no
  bodies) (`S/server/src/db/schema.ts:5676-5735`).
- (V) **Critical lifecycle frames** (`runtime:outcome`, `process_spawned/exited`, `start:outcome`) use a
  write-ahead outbox: one file per agent, temp→fsync→rename→fsync(dir), identity
  `(daemonInstanceId, clientSeq)`, stop-and-wait with one in-flight frame, retransmit with the same
  identity at 5 s→5 min, bounded at 128 entries with explicit *gap markers* on overflow
  (`D/runtimeOutcomeOutbox.ts:1-35`).
- (V) **Backpressure/coalescing.** A busy runtime gets one batched inbox notice instead of N messages.
  Per-turn runtimes `coalesce_into_pending` (OpenCode). Telemetry and `internal_progress` events are
  marked as never driving activity or readiness (`types.ts:83-95`). The telemetry buffer is in-memory,
  limited to 3 qps, and requeues on 429 (`S/raft-event-buffer/README.md`).
- (V) **Freshness hold on agent side effects.** Before an agent's `send`/`task_claim` goes out, the daemon
  checks `seenUpToSeq` against the messages the model has actually seen. If newer messages exist, it holds
  the send and shows the agent up to 3 of them (`D/agentInboxStateMachine.ts:85-125`;
  `D/agentVisibleDeliveryLedger.ts:1-6`). This is a strong guard against stale replies.

## 4. Permissions, sandboxing, tool injection

- (V) **Everything runs fully unattended, with no sandbox.** Claude gets
  `--allow-dangerously-skip-permissions --dangerously-skip-permissions --permission-mode bypassPermissions`
  (`claudeLaunch.ts:101-106`). Codex gets `approvalPolicy:"never", sandbox:"danger-full-access"`
  (`codex.ts:911-914`). Gemini and Kimi get `--yolo` (`gemini.ts:64`, `kimi.ts:120`). OpenCode gets
  `--dangerously-skip-permissions` (`opencode.ts:470`). So OAR's auto-decline of approval prompts never
  comes up, because no prompt is ever raised.
- (V) **Native features that compete with the platform are removed.** Claude runs with
  `--disallowed-tools EnterPlanMode,ExitPlanMode,ScheduleWakeup,CronCreate,CronList,CronDelete`
  (`claudeLaunch.ts:13-20`). The platform owns waits and wakes, as in Ducter P9.
- (V) **Tool injection.** Chat goes through a bundled `raft`/`slock` CLI (`communication.chat:"slock_cli"`,
  `types.ts:27-30`; `SpawnContext.slockCliPath`). Managed MCP is served by a loopback HTTP MCP proxy
  (`D/managedMcpRuntimeProxy.ts`, `127.0.0.1`) and passed as `--mcp-config` (`claudeLaunch.ts:127-145`).
- (V) **Credential isolation, not a sandbox.** The per-agent `sk_agent_*` key "MUST NOT be present in the
  spawned runtime env, workspace files, or CLI args". Short-lived CLI calls reach a launch-scoped local
  proxy instead (`S/shared/src/index.ts:1896-1921`; `D/agentCredentialProxy.ts`). Custom-provider launches
  strip host `ANTHROPIC_*`/OAuth env (`D/drivers/claudeProviderIsolation.ts:12-25`) and add
  `--setting-sources project,local` (`claudeLaunch.ts:118-120`).
- (I) Default Claude launches do not limit setting sources, so the user's `~/.claude` hooks, plugins
  and MCP servers leak into agent sessions. OAR now has `userConfiguration:"exclude"` for this
  (`O/docs/design/roadmap.md`, shipped list).
- (V) Raft's Kimi token refresh *writes* the client's credential file (behind a flag, off by default,
  `collector.ts:16-30`). That goes past OAR's "never handles the tokens" line.

## 5. Failure and recovery

- (V) **Resume failure falls back to a fresh session.** The session contract is `resume_or_fresh`
  (`types.ts:32-39`). Typed `runtime_recovery` events mark when a fallback happened: Codex
  missing_rollout / thread_writer_busy / archived, Grok missing_session → `fallback_fresh_thread`
  (`types.ts:205-212`).
- (V) **Spawn failures** use exponential backoff from 1 s to 30 s with at most 5 attempts, plus
  retry-once and non-retryable classes (`D/agentProcessManager.ts:62-63, 665-672`;
  `D/spawnFailureClassification.ts`). No-process state has explicit invariants, e.g. "cooldown is wakeable
  only with restart-safe idle config" and "terminal excludes auto-restart" (`D/agentNoProcessResidency.ts:1-26`).
- (V) **Stale launches are fenced.** `assertLaunchCurrent()` runs right before `spawn()` so that "no
  process is created for a stale launch", and `launchSignal` aborts superseded attempts
  (`types.ts:279-300`).
- (V) **Errors are classified into delivery backoff.** RateLimit / ProviderServer / Connection / Stream
  errors become recoverable backoff reasons, while auth errors and other user-action errors terminate the
  process with `stop_source: runtime_auth_error` (`D/runtimeErrorDeliveryPolicy.ts:38-84`;
  `agentProcessManager.ts:10277-10290`). If the same error fingerprint repeats, a **fingerprint fence**
  stops the runtime with "Restart after the runtime/tooling issue is fixed". Any real progress (text, tool,
  turn_end) resets the fence (`runtimeErrorDeliveryPolicy.ts:14-35`).
- (V) **Quota.** The Claude normalizer maps `billing_error` and rate-limit events to
  `providerLimit:{kind:"quota_exhausted"|"transient_rate_limit", resetsAt?}`, and `resetsAt` is "never
  inferred" (`claudeEventNormalizer.ts:90-100`, `types.ts:131-138`). Separately, OAR account-usage
  snapshots feed a server `usageLimitAttentionService` that raises or resolves a "limit reached" attention
  incident (`S/server/src/services/usageLimitAttentionService.ts:20-40`). (I) Raft does not switch
  harness or model when a quota runs out. It only backs off and shows the limit.
- (V) **Version drift.** Each driver has a `launchVersionPolicy` made of `knownBadVersions` (block) and
  `testedGoodVersion` (warn if below) (`types.ts:340-348`; `D/runtimeLaunchVersion.ts`; Claude blocks
  `2.1.59`, `claude.ts:70`). `runtimeCliVersionTracker.ts` records the last detected CLI version per
  runtime across restarts and keeps a downgrade notice. The trigger was a service PATH that picked up
  Codex 0.151 instead of 0.163 "and every Codex turn then failed with nothing pointing at the cause" (`:1-14`).

## 6. Harness and model selection

- (V) Selection is **per agent, static.** `AgentConfig.{runtime, model, reasoningEffort, runtimeConfig,
  envVars, sessionId}` (`S/shared/src/index.ts:1881-1893`), edited through per-runtime forms
  (`S/runtime-form/fixtures/*`). Bulk model changes go through a UI dialog
  (`S/web/src/components/machine/BulkChangeModelDialog.tsx`). Changing the runtime or profile is a
  "runtime-profile control" or migration that starts a new conversation (`agentRuntimeInput.ts:419-470`).
  (I) There is no per-task routing.
- (V) Models are detected with `detectModels()`, which returns a "closed terminal source outcome" and
  "must never turn a missing config, empty catalog, or read failure into selectable bundled models"
  (`types.ts:642-650`). `detectedModelsVerifiedAs: "launchable"|"suggestion_only"` (`types.ts:41`).

## 7. Version pinning and tests

- (V) Raft pins exact versions: OAR `0.68.1`, `@earendil-works/pi-*` `1.3.0`, a Botiverse fork
  `kimi-code-sdk 0.34.0-botiverse.0` (`S/daemon/package.json:51-56`). A **release preflight receipt** records
  the registry version next to the pinned one and a `hold`/`take` decision with a reason
  (`S/daemon/runtime-sdk-release-preflight.json`; `S/daemon/scripts/release-runtime-sdk-preflight.mjs`).
  (I) The 0.68→0.95 gap shows the cost: Raft only takes OAR for low-churn reads and has not followed
  its session API.
- (V) Test patterns worth copying:
  - OAR `defineRuntime` fakes with tripwires on members that must not be called (`collector.test.ts:25-37, 87`).
  - `FakeClock`, `deterministicTracer`, `traceRows`, and `drydock` event probes (`waitFor(predicate,label)`
    with timeouts) for child-process tests (`D/testing/*`).
  - Per-concern `AgentProcessManager.*.test.ts` suites (wakeRecycle, residency, spawnFailCooldown, teardown,
    serverWake) built on hand-written `RuntimeDriver` stubs (`agentProcessManager.claude.test.ts:69-80`).
  - Type-level proofs (`*.typeproof.ts`) and a contract test for the state machine
    (`apmStateMachine.contract.test.ts`).
  - Prompt snapshots (`D/drivers/__snapshots__/systemPrompt`, `agentRuntimeInput.snapshot.test.ts`) and
    the generated AX-surface manifest.
  - Form fixtures pinned byte-for-byte across the move to OAR.
  - On the OAR side, which Ducter gets for free: mock/aimock/vendor/live layers and dated runtime
    version checks (`O/experiments/runtime-version-checks/2026-11-05.md`).

## 8. Conflicts with Ducter's principles / where Ducter should do better

1. **The Log is not the truth in Raft** (P1). The native harness transcript is the only full record, and the
   recycle panel is *scraped* from Claude's JSONL with regexes (`wakeBriefingPanel.ts:50-56`, `FAIL_RE`,
   `MUTATING_RE`). Ducter should store OAR records in its own Log and build projections from that, not
   from vendor files.
2. **A re-cut is a heuristic panel, not a deterministic projection** (P2, P4). Raft's panel re-reads live
   files and wall-clock data, so two rebuilds differ byte for byte, and only Claude has facts at all.
   Ducter: build from frozen digests/cut points, and get warmth facts from OAR `usage()`/`contextUsage()`
   (the same for every runtime) instead of tailing transcripts.
3. **Peers, no main AI** (P3, P5). Raft's agents are all equal and pull their inbox. Ducter's main AI is the
   only writer to its channel, and Focus Windows report through `report_to_main`.
4. **No approval gate** (P11). Running everything with bypassPermissions/danger-full-access is fine for
   a sandboxed worker, but Ducter wants recorded *intents* before external side effects. Gate that at the
   Ducter MCP/tool layer, not in harness prompts. Raft's freshness hold is the nearest working analogue.
5. **Leaks user configuration** (I, §4). Use OAR `userConfiguration:"exclude"` and a fixed per-persona cwd
   (P8 pinning).
6. **Monolith risk.** The 11k-line process manager comes from writing per-harness transport by hand.
   OAR exists to absorb exactly that, and Raft itself is now moving its drivers onto it.
7. **Writing credentials** (Kimi refresh) goes against P10. Ducter must never touch harness tokens.

## Runner best practices for Ducter

1. **Make OAR's `Session` the only harness transport.** Don't write drivers. Keep a thin Ducter port
   (`start/resume/fork/steer/interrupt/events/usage`, P8) implemented once over OAR. Use
   `steerOrQueue`/`deliver` and keep their outcomes (`steered|queued|rejected`) as the sender's receipt (P7).
2. **Import OAR through one module**, per runtime (`@botiverse/oar/runtimes/<id>`), never the root
   entry (about 49 MB). Retry failed loads instead of caching them. Type imports are free (`D/oarLoader.ts`).
3. **Put an anti-corruption projection at every OAR boundary.** Map OAR facts onto Ducter's own wire
   types, and keep "unsupported" separate from "error". A failed read must never look like zero or empty.
4. **Pin OAR exactly and upgrade on purpose.** Keep a preflight receipt (pinned vs registry, hold/take,
   reason), and re-run OAR's dated runtime checks plus Ducter's contract suite before each bump. Plan for
   a version bump every week or two, because Raft fell 27 minors behind.
5. **Store OAR records verbatim in the Log, with `(runnerInstanceId, seq)` identity.** Stream them to the
   control plane through a write-ahead, ack-and-retransmit outbox (copy `runtimeOutcomeOutbox`: fsync-rename,
   stable identity across restarts, explicit gap markers instead of silent drops). Set `retainedBytes` so
   long sessions stay bounded in memory.
6. **Separate signal classes.** Content and lifecycle events drive state. Telemetry and progress pings
   only refresh liveness. Diagnostics never satisfy readiness. Raft's `ParsedEvent` comments are the
   spec to follow.
7. **Expire-aware recycle as a pure function with positive evidence only.** Unknown means resume.
   Thresholds: 60 min idle (the Claude subscription TTL, measured) and a context size gate. Reconsider
   per adapter, since Codex warmth comes from thread affinity. Count background tasks and subagent
   activity as liveness before stopping anything, and run a periodic cold-idle sweep so long-lived idle
   processes also get re-cut.
8. **Seed re-cuts with an empty briefing.** Ambient, self-labelled blocks go above and the real message
   goes last, with no recap and no "you were reset". Within any rebuilt context, exclude secret-looking
   paths, and age out stale "next step" notes, because they gain salience they never had.
9. **Register every model-visible string.** Use something like `axSurface(description, fn, examples)`
   with a generated manifest and snapshot tests, so prompt drift is reviewable and the L0–L4 bytes are
   testable.
10. **Hash the standing prompt per session, excluding volatile fields.** When it changes on resume,
    deliver it as an L4 delta. Don't silently keep a stale L1, and don't re-inject on every release.
11. **Disable native features that compete with Ducter.** Plan mode, native cron/wakeup and anything
    else that duplicates the control plane's waits (P9). Inject the same Ducter MCP server into every
    harness through OAR `serveMcpTools`, on loopback with a launch-scoped token. The model must never see
    a Ducter credential (env, args and files all clean).
12. **Permissions: let the harness run unattended inside a boundary, and gate side effects at Ducter's
    tools.** Use bypass/never-approve only inside a worktree or sandbox Ducter controls. Put Ducter's
    policy gate on recorded intents (P11). Add a Raft-style freshness hold: refuse an outbound message
    or claim when the model hasn't seen events newer than `seenUpToSeq`, and show it the delta.
13. **Typed recovery ladder.** Try `resume`, then fresh with a recorded `runtime_recovery` reason. Use
    exponential spawn backoff with retry-once and non-retryable classes. Add an error-fingerprint fence
    that real progress resets. Map auth errors to a `needs-you` state, not a retry loop. Map quota to a
    backoff with `resetsAt` only when reported, and feed it to the attention policy (P6) and to body
    selection (P10).
14. **Fence stale launches.** Use an abort signal plus a "still current?" assertion immediately before
    the process or session comes into existence.
15. **Harness version fencing.** Keep `knownBadVersions` (block) and `testedGoodVersion` (warn) per adapter,
    plus a persisted last-seen CLI version per machine that surfaces downgrades (the PATH-drift bug).
    Prefer OAR `orient`/`usability` floors where they exist.
16. **Test like Raft.** Use OAR `defineRuntime` fakes with tripwires, a fake clock, deterministic trace
    rows, event probes with `waitFor`, per-concern suites for the runner state machine, and byte-level
    prompt and projection snapshots. Add Ducter's own determinism test: same Log → identical projection bytes.
