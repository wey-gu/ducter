# V1 Tonight: Build Plan (~8 hours)

> 2026-11-08 · D49. Honest scope: tonight produces a **working vertical slice** that the author
> can use daily. It is not the whole design. Everything cut is listed under "Not tonight".

## The slice, end to end (definition of done)

1. Start the main process on the Mac: `ducter up`. The desktop client opens on the conversation.
2. The user types: "Fix the flaky test in ~/dev/foo, then tell me."
3. The partner answers in about 2 s with an ack that names the action. A status line appears.
4. A **task** opens: a worktree on branch `ducter/<slug>`, a Claude Code (or Codex) session
   started via OAR with the brief, plus the Ducter MCP tools.
5. The task works, streams normalized events into the Log, and calls `report_to_main` with a
   question that has a default.
6. The conversation shows the living message with **Go / Hold / Reply**; On hand shows the
   card under 等你 / Needs you.
7. The user taps Go. The task continues, reports done with evidence (test output, diff). The
   partner replies with the result.
8. Opening the task shows its transcript and diff, and the user can talk to it directly.
9. A browser task works through cua-driver with a persistent profile (stretch goal for
   tonight).

## Stack (from decisions)

- **Main process + runner:** TypeScript on Bun, with **OAR latest** behind `HarnessPort`.
  SQLite (`bun:sqlite`) for the Log, behind the append-log port.
- **Main AI:** Claude Code via OAR. Ducter's MCP tool server is injected; the system prompt is
  the Ducter persona; projection is simplified for tonight (below).
- **Client:** MyGo native UI (Go) on macOS, over one WebSocket protocol, using Pebble tokens.
  - Build from MyGo's own examples and packages: `ui/markdown`, `ui/richtext` (IME),
    `ui/editor` (diff view + git diff), `motion`, `svg`, virtual lists, plus the
    `examples/markdown-chat`, `terminal`, `code-editor`, and `timeline` examples.
  - an open-source agent app's desktop is a MyGo-native agent app and serves as a **design reference
    only**: it is GPL-3.0, so no code is copied.
  - Web via MyGo WASM comes later.
- **Repo:** private `wey-gu/ducter` (public once ready).
- **Wiring:** one Bun process (`bun run up`) holds core, runner, and partner in-process;
  remote runners come later.
  - The contract is `packages/protocol/src/index.ts` (wire) and `internal.ts` (module
    boundaries).
  - The main process listens on `127.0.0.1:7777`: `/ws` for clients, `/mcp` for Ducter tools
    (role-scoped tokens).
- **Memory:** Nowledge Mem via the `nmem` CLI: L1 identity read at start, Working Memory as a
  delta.

## Contract first (hour 0–1, lead agent)

Every workstream codes against these. They live in `packages/protocol`:

1. **Event schema (the Log):** `{seq, ts, persona, stream: "channel" | "task:<id>", origin, kind, body}`.
   Kinds:
   - channel: `user_msg`, `ai_msg`, `ack`, `job_status`, `living_msg` (supersedes), `decision`;
   - tasks: `task_open`, `task_state`, `task_event` (normalized OAR record), `report`;
   - effects: `intent`, `waiter`.
2. **Client WebSocket protocol:**
   - client → server: `subscribe(cursor)`, `send_message`, `decide(go | hold | reply, text?)`,
     `task_send(task, text)`;
   - server → client: `events(batch)`, `snapshot(on_hand)`.
3. **Ducter MCP tools.**
   - For the main AI: `task_open(brief, place, project, until?)`, `task_steer`, `log_search`,
     `log_read`, `wait_until`.
   - For tasks: `report_to_main(state, summary, questions[], evidence[])`, `log_search`,
     `log_read`.
4. **`HarnessPort`** over OAR: `start(spec) · resume · send · steer · interrupt · events() · usage()`.
5. **Attention states and residency states**, per `focus-window-states.md`.

## Workstreams (parallel, each in its own git worktree, merged by the lead)

| # | Workstream | Owns | Output by ~hour 5 |
|---|---|---|---|
| W1 | Control plane | `packages/core` | Log store with cursors, event bus, WS server, task registry and state machine (attention + residency), living-message renderer from reports, On hand snapshot |
| W2 | Runner and tasks | `packages/runner` | OAR integration, worktree create/archive, recipes (minimal), session start with brief + MCP config, event normalization into the Log, steer/queue, `report_to_main` plumbing, `bun build --compile` binary |
| W3 | Main AI | `packages/partner` | Persona prompt, simplified projection (L0 tools, L1 identity from Mem, L2 last N channel events + one rolling digest, L4 deltas), the ack → job → result protocol, the Ducter MCP server, decision handling |
| W4 | Client | `apps/desktop` (Go, MyGo) | Pebble tokens; conversation view (cocoa user bubbles, bubble-less partner, living message with Go/Hold/Reply); On hand board (4 lanes); opened task (transcript + diff + direct composer); WS client |
| W5 | Browser (stretch) | `packages/runner/env-browser` | cua-driver as a per-task MCP sidecar, persistent profile per persona, Screen view later |

**Hours**
- **0–1:** contract and repo scaffold (lead).
- **1–5:** W1–W4 in parallel, W5 started.
- **5–7:** integration, then the end-to-end slice above.
- **7–8:** polish, dogfood on a real repo, docs, and a decision-log entry.

## Simplifications for tonight (each is a known gap)

- **Projection:** no frozen digests, no re-cut, no folds. Resume when warm; start a fresh
  session from the last N events plus a rolling summary when cold.
- **One persona, one device** (the Mac). Remote workers, the Edge, and phone web come next.
- **Routines and `until`:** only a timer `wait_until`. No proposal card yet.
- **Onboarding:** a plain first-run checklist (detect the harness login and Mem), no cartoon
  yet.
- **Theme:** Pebble only. i18n keys are in from the start, with zh and en strings.

## How it went: backend, against real harnesses (2026-11-09, workstream B)

Setup: `DUCTER_PORT=7781 DUCTER_PARTNER_MODEL=sonnet DUCTER_TASK_MODEL=sonnet bun run up`
on a scratch data dir, a throwaway Bun repo `foo` with a deliberately flaky TTL test, and a
small Bun WS script as the client. Partner and tasks on Claude Code (sonnet); one task on
Codex. Times below are from the Log's own timestamps (`ts`), one run each, so treat them as
indicative, not benchmarks.

**Verified end to end (live)**
- Message → ack → `task_open` (worktree on `ducter/<slug>`, based on the repo's HEAD branch) →
  task works and streams `task_event`s → `report_to_main` → partner relays the result. Flaky
  test fix: open → done report in 23 s, result message 4 s later, commit as evidence.
- Task question with a default → `decision` + living message + card `needs_you` with
  `pendingDecision` → **Go** (forwarded in 0.4 s, task commits, done) · **Hold** (card goes to
  Waiting, nothing forwarded) · **Reply** by `task_send` straight to the task (the open
  decision resolves as `reply`, no second forward).
- `task_send`: `steered` into a running turn; `prompted` on an idle or parked task (a parked
  Claude Code session takes **~10 s** to resume; the text is logged at once). `{t:"sent"}`
  frames arrive.
- `task_history`, `interrupt` (turn aborted; the card now shows Waiting), `drop`.
- Restart mid-task (SIGTERM while a task ran a shell loop): the runner rebuilt every task
  from the Log, resumed the mid-turn one by its native session id 9 s after boot, and the
  task noticed its loop had been killed, re-ran it, and reported. Waiting tasks stay parked
  until the next message; drop/reopen work on tasks from before the restart.
- `wait_until`: `waiter` armed → fired on time (+1 ms) → partner reminded 1.8 s later. Armed
  waiters survive restarts (rebuilt from the Log); task-bound ones cancel when the task ends.
- Partner `ask` (decision without a task) → Go → partner opened the task 1.6 s later.
- Codex: one task (JSDoc on `Cache`), open → committed + done in 37 s, with checkpoints.
- `task_action merge` merged a task branch into `main` in the user's checkout (merge commit
  as `ref`); `open_pr` refused with a plain reason (no `origin` remote). Every task action is
  acked with `action_result`. A real push + `gh pr create` was not run live (fake `gh` in tests).
- WS replay: `hello` without cursor = last 200 channel events, with cursor = channel since;
  live `task_event`/`task_state` for every task; a read freezes the living message (the next
  update appends instead of superseding).

**Ack latency (user message → `ack` event)**

| Build | Session | Ack |
|---|---|---|
| Before fixes | fresh, first message after boot | 15.4 s |
| Before fixes | warm | 7.2 s |
| + ack on `tool_call_started` | warm, after restart (resume on demand) | 15.1 s |
| + prewarm at boot, partner config isolated | warm, English | 1.3 s |
| + same, model wrote no line first (generated ack waited for the brief) | warm | 5.2 s |
| + ack from the streamed title, ToolSearch off | fresh session, Chinese | **2.3 s** |
| same | resumed after restart | 3.5 s |

Where the time went: holding the ack line until the whole `task_open` brief was written
(~5 s), a cold Claude Code start + MCP handshake on the first message (~5–7 s), ToolSearch
round trips because Ducter's MCP tools were deferred (~3 s), and the user's global
`~/.claude` config (CLAUDE.md, plugin hooks, MCP servers) loaded into the partner.

**Bugs found live and fixed (each with a fake-harness regression test)**
- Partner called `task_send` with `message` instead of `text`; the task got an empty steer.
  Required tool args are now checked against each schema before any handler runs.
- Partner re-forwarded a Go that core had already delivered.
- Hold was forwarded as a "pause" turn, which flipped the card back to working.
- Replies in Chinese to English messages (the user's global CLAUDE.md and Mem preference won).
- Ack latency (above): early ack on `tool_call_started` and on the streamed title, prewarm,
  partner isolated via OAR `userConfiguration: "exclude"`, `ENABLE_TOOL_SEARCH=false`.
- A second "On it" ack when stream events lagged the MCP call.
- Text sent to a parked task appeared in the transcript only after the ~10 s resume.
- An interrupted task stayed "working".
- Plus the desktop- and lead-reported ones: drop/reopen after restart, reopen with no session,
  a decision left open after a direct reply, internal words in `task_state.reason`, a
  trailing-slash Origin, "On it: undefined" when `title` was missing, boot waiting ~6 s on
  `nmem`, an invented "pick Go" with no decision (honesty guard now queues a correction turn).

**Known gaps (not fixed tonight)**
- Partner prose still drifts from the persona: it sometimes adds "Task opened." (now dropped
  mechanically when short), repeats a task's question, or puts branches and commit-policy talk
  in results. Needs prompt evals, not more rules.
- A task phrased its question as "Go = add the test, Hold = don't"; the brief now says Hold
  means pause, never "no". Not re-verified live.
- Parked-session resume costs ~10 s on Claude Code; nothing prewarms tasks.
- Browser sidecars are not restarted when a browser task is recovered after a restart.
- Tasks write outside their place when they choose to (one used `/tmp/flk`); no sandbox.
- Branch slugs from Chinese titles keep only the ASCII words (`ducter/foo-…`).
- The honesty guard is a regex over zh/en wording; it can miss paraphrases.
- Live runs used sonnet only; opus partner latency not measured.

## Not tonight (next sessions)

Frozen digest + recall index · expire-aware re-cut and folds · multiple devices + Ducter Edge +
phone web · routines with proposal cards · body selection ranking · the Isles/metaphor ·
onboarding cartoon · credentials vault (`research/25`) · multi-persona UI · computer use
(macOS VMs).
