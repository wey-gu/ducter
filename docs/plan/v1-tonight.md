# V1 Tonight: Build Plan and Where It Landed

> 2026-11-08 · D49. Honest scope: tonight produces a **working vertical slice** that the author
> can use daily. It is not the whole design. Everything cut is listed under "Not tonight".

## State of v1 (2026-11-09 08:00 SGT)

Every number below comes from a report in this repo (this file's sections further down,
`design/onboarding.md`, `research/29`, `research/30`, `packages/partner/eval/results/`). Live
timings are one run or a few, so they are indicative, not benchmarks. What waits on the user is
in `design/flows/OPEN-QUESTIONS.md` (answered on the morning of 2026-11-09: D54, D56–D67); per-scenario status is the
"Built" column of `design/scenarios.md`.

**What a user can do now**
- **On a Mac:** open `Ducter.app` from the DMG (or `scripts/install.sh` + `ducter up`). Ducter
  checks the Mac, shows only what blocks with a Run in Terminal fix, asks a name once (not when
  Mem holds the identity), and opens on starters about the user's own recent repos.
- **Talk and hand off work.** Quick answers in turn; bigger work becomes a task on Claude Code
  or Codex in its own worktree on `ducter/<slug>`. Silence while it works.
- **Decide.** A task's question arrives with a default as a living message and an On hand card:
  Go / Hold / Reply, or 都按默认 / Go on all defaults.
- **Get the result.** The partner's short outcome, with How I know, Sent out and Merge / Draft PR /
  See changes rendered from the typed report; Merge works by button.
- **Open a task** to read its transcript, diff and dossier and talk to it directly (steered into
  the running turn, or as the next turn); stop, drop with Undo, reopen, even after a restart.
- **Reminders** (`wait_until` timers that survive restarts) and **browser tasks** on the Mac in
  Ducter's own Chrome profile, with sign-ins typed by the user.
- **Memory:** with Nowledge Mem, the partner recalls and saves durable things, shown as one
  记下了 · <title> / Noted · <title> line.
- **On a server:** `install.sh --service` runs Ducter as a systemd user service; the Mac app
  connects with a pairing code over Caddy or an SSH tunnel; another machine joins as a worker
  and runs tasks placed on it; a phone pairs from the `ducter pair` link and gets the phone web
  client with notifications.

**Measured**

| What | Number | Source |
|---|---|---|
| Ack latency, user message → ack (sonnet) | **2.3 s** fresh session (zh), 3.5 s resumed after restart, 1.3 s warm (en); was 15.4 s / 7.2 s before the fixes | "How it went" below |
| First reply in Ducter.app | 2.5 s; open → "Ducter is up" ~4 s | `onboarding.md` app path |
| First five minutes, live (Mac, zh, Mem on) | ack 19 s, done 52 s, result 58 s; second run after merging main: ack 3 s, done 46 s, result 60 s | `onboarding.md` terminal path |
| Flaky-test task (Claude Code) | open → done report 23 s, result message 4 s later | below |
| Codex task | open → committed + done 37 s | below |
| Go forwarded to the task | 0.4 s | below |
| Parked Claude Code session resume | ~10 s | below |
| Restart mid-task | resumed by native session id 9 s after boot | below |
| Timer waiter | fired +1 ms, partner reminded 1.8 s later | below |
| Browser lookups | 25–50 s per task; input tokens 332k → 140k after the token diet | `onboarding.md` browser |
| Repo scan for starters | ~90 repos in under 0.2 s | `onboarding.md` |
| Partner eval, sonnet | baseline 18/33 (55%) → tuned **62/66 (94%)** over 2 runs; with memory scenarios **79/82 (96%)**, memory 16/16 | `research/30`, eval results |
| Partner eval, haiku floor | 14/17 (82%) | eval results |
| Eval cost | ≈$0.93 per 33-scenario sonnet run; noise about ±3 scenarios per run | `research/30` |
| Tests in the repo | about 241 `bun test` cases (core 66, cli 60, partner 53, runner 50, web 12) and 59 Go test functions in `apps/desktop` | counted from declarations on 2026-11-09, not a test run |

**Verified, and how**
- **Live on the author's Mac** (real Claude Code / Codex, sonnet): the whole slice below (message →
  ack → task → decision → Go / Hold / Reply → result), merge by button, steer / prompt / stop /
  drop / reopen, restart recovery, timers, partner `ask`, the terminal first run, Ducter.app from
  the DMG (⌘Q, ⌘W and `kill -9` all stop the backend), browser tasks with a user sign-in.
- **In Ubuntu VMs with the scripted model** (`research/29`): systemd service, linger, journald,
  restart / SIGKILL / reboot survival, pairing and the token gate behind Caddy (plain HTTP on a
  VM port), the SSH tunnel, the desktop over a tunnel, workers with offline → 在等 → resume, and
  headless harness logins up to the human step.
- **Headless only:** the desktop's mock screens and taste review, the app's blocked / name /
  failed screens, the phone web client at 390×844 (one shot from a real sonnet run).
- **Eval only (real model, fake tasks and Mem):** partner wording, safety asks, memory recall and
  saves.
- **Unit tests only:** Web Push (hold, coalescing, quiet hours, payload size), draft PR with a
  fake `gh`.

**Not verified yet**
- A real `git push` + `gh pr create`; a real-harness task on a worker; Caddy with TLS on a real
  VPS and domain; push on a real iPhone or Android; a live write into Nowledge Mem; a truly
  blocked Mac walked through the app; opus as the partner.

**Known gaps** (details and triggers in `docs/todo.md`)
- Two results that land together still mention branches (eval `settle` 0/2).
- Parked-session resume costs ~10 s; tasks can write outside their place (no sandbox on the Mac).
- Loopback is token-free, so a shared host's other accounts count as local.
- Browser: no env-gate proxy yet (the rules live in the brief), idle sessions close after 300 s,
  sidecars aren't restarted after recovery.
- The digest, re-cut and folds, routines, `until` loops, the Ducter Edge, passkeys, the
  onboarding cartoon and the capability map are not built.
- Ducter stops when the app's window closes; D56 (keep running) is being built.

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
  *(Workers and phone web landed overnight; the Edge did not.)*
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
- Partner prose drift: now measured, see "Partner eval" below. Still open: two results that
  land together mention branches and guess at merge conflicts; greetings sometimes give two
  examples.
- A task phrased its question as "Go = add the test, Hold = don't"; the brief now says Hold
  means pause, never "no". Not re-verified live.
- Parked-session resume costs ~10 s on Claude Code; nothing prewarms tasks.
- Browser sidecars are not restarted when a browser task is recovered after a restart.
- Tasks write outside their place when they choose to (one used `/tmp/flk`); no sandbox.
- Branch slugs from Chinese titles keep only the ASCII words (`ducter/foo-…`).
- The honesty guard is a regex over zh/en wording; it can miss paraphrases.
- Live runs used sonnet only; opus partner latency not measured.

## Partner eval (2026-11-09)

`bun run eval:partner [--model haiku] [--floor] [--only ids] [--repeat n]`: 33 zh/en
scenarios through the real partner and core, with a real model on the same Claude Code
harness and a fake task runner. Deterministic checks first, then a haiku judge; the table
goes to `packages/partner/eval/results/<date>-<model>-<label>.md`. ≈$0.93 per sonnet run.
Details: `research/30-partner-eval.md`.

| | Pass |
|---|---|
| Baseline persona, sonnet | 18/33 (55%) |
| Tuned, sonnet, 2 runs | 62/66 (94%) |
| Tuned, haiku floor subset | 14/17 (82%) |

What changed:
- **Result prose is the outcome only**, plus left out and unverified. The desktop already
  renders How I know, Sent out (then "Outside") and Merge under the message from the typed report, so the old
  persona's demand for those rows in prose produced the commit/branch/"合回 main？" talk.
- **Persona:** one-example first words; hand-offs named as actions; nothing after `ask`; no
  default in its question; never name buttons; nothing on needs_input; ask before outside
  effects (never pay); stop, secrets, button actions. 2,028 → 2,695 tokens.
- **Code guards**, each with a test: a 1.5 s settle window for report-only turns; the
  language hint on report-only turns; secret redaction in briefs and task_send; short lines
  dropped after an ask and in needs_input-only turns; defaults stripped from ask questions;
  button merges name the base branch.

Round 2 (after Review 2): 48 scenarios, 90/96 over 2 runs (94%). Follow-ups continue a task
only on its unmerged change; otherwise a new task, and `task_retitle` when a follow-up widens it.
Waiters tied to an ask are cancelled when it is answered. One-time instructions never go to
memory. `DUCTER_MEMORY=off` means no identity read, and the banner and doctor say so.
Round 3: 93/96 (97%) over 2 runs. Two results landing together now make one outcome-only
message (a `[results]` hint plus a clause filter). The greeting gives one example. Hand-off
acks name the new scope. One ask card per turn.

## Not tonight (next sessions)

Frozen digest + recall index · expire-aware re-cut and folds · Ducter Edge · routines with
proposal cards · body selection ranking · the Isles/metaphor · onboarding cartoon · credentials
vault (`research/25`) · multi-persona UI · computer use (macOS VMs).

Pulled in overnight after all (see "State of v1" above): multiple devices (server mode, code
pairing, workers; D54), phone web with Web Push, Ducter.app, and the long-term memory slice.
