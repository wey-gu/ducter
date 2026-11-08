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
- **Client:** MyGo native UI (Go) talking to the main process over one WebSocket protocol,
  using Pebble tokens. *Decision pending: web via the same MyGo UI compiled to WASM, or a thin
  web client later.*
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

## Not tonight (next sessions)

Frozen digest + recall index · expire-aware re-cut and folds · multiple devices + Ducter Edge +
phone web · routines with proposal cards · body selection ranking · the Isles/metaphor ·
onboarding cartoon · credentials vault (`research/25`) · multi-persona UI · computer use
(macOS VMs).
