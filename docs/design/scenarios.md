# Scenario Coverage

Tracks design completeness per scenario (catalog: `product-model.md` §6).
Columns: **Flow** (steps + branches), **States** (which task/routine states it touches),
**Copy** (zh + en i18n keys), **Motion**, **Proto** (canvas artboard). Values:
`—` not started · `draft` · `reviewed`.

**Built 2026-11-09** says what runs after the overnight build, and how it was checked:
**live** = on the author's Mac against a real harness and model (one or a few samples) ·
**VM** = in Ubuntu VMs with OAR's scripted model (`research/29`) · **headless** = the desktop's
headless renderer or a headless browser at 390×844, on a mock or demo core · **eval** = the
partner eval (real model, fake tasks and Mem; `research/30`) · **unit** = unit tests only ·
`—` = not built. Design columns are unchanged: nothing was reviewed by the user overnight.

| ID | Scenario | Flow | States | Copy | Motion | Proto | Built 2026-11-09 | Notes |
|---|---|---|---|---|---|---|---|---|
| A1 | First run | draft | draft | draft | draft | — | live: Mac terminal path and Ducter.app; VM: VPS service + doctor (scripted model) | `onboarding.md` (cartoon + live checklist). VPS path built terminal-first (D54): service install, doctor with headless logins, pairing code. Mac terminal path shipped and walked live 2026-11-09 (onboarding.md "What ships today") |
| A2 | Pair a device | draft | draft | draft | draft | — | VM: code pairing via Caddy and SSH tunnel, desktop connect, workers (scripted model); headless: phone pairing page | Built (D54): code pairing (CLI + desktop "Connect to your Ducter" card, screenshots `apps/desktop/docs/connect*.png`), revoke, workers (join, presence, task placement). Phone web pairing built (the `ducter pair` link or QR opens `/pair#c=…`; token in the browser). Passkey/device key and the A2-W confirm card pending |
| A3 | Device sleeps / wakes / offline mid-task | draft | draft | draft | draft | — | VM: worker drops → 在等 · <device> 连不上 → resume (scripted model); Mac sleep — | Built for workers (D54): offline at once, 在等 · <device> 连不上 after 2 min, resume by session id on return (`apps/desktop/docs/remote-device-unreachable.png`) |
| A4 | Harness not logged in; quota runs out | draft | draft | draft | draft | — | live: doctor's blocked screen (PATH stripped); VM: headless login commands to the human step; quota — | Headless login commands verified to the human step (`research/29`); relay into a client pending |
| A5 | Second persona | draft | draft | draft | draft | — | — | |
| B1 | Quick answer in turn | draft | draft | draft | draft | draft | live + eval | Core UI · Talk |
| B2 | Research, no place | draft | draft | draft | draft | — | — | |
| B3 | Code change in a repo | draft | draft | draft | draft | draft | live: Claude Code and Codex tasks in a worktree, result with evidence | Core UI · Workspace |
| B4 | Multi-repo change | draft | draft | draft | draft | — | — | |
| B5 | Browser work needing login | draft | draft | draft | draft | — | live: host-Mac browser via cua-driver 0.44, sign-in by the user in Ducter's browser | |
| B6 | Phone / call task | — | — | — | — | — | — | |
| B7 | `until` loop | draft | draft | draft | draft | — | — (only the timer waiter exists) | |
| B8 | Waiter | draft | draft | draft | draft | draft | live: `wait_until` timer, survives restart | Core UI · On hand (Waiting lane) |
| B9 | Routine: one-off / recurring / monitor | draft | draft | draft | draft | draft | — | Core UI · On hand (weekly report) |
| C1 | First mention of a new repo / path | draft | draft | draft | draft | — | — | |
| C2 | Non-git folder (draft copy) | draft | draft | draft | draft | — | — | |
| C3 | Recipe setup / failure | draft | draft | draft | draft | — | — | |
| C4 | Busy lease / port clash | draft | draft | draft | draft | — | — | |
| C5 | PR, rebase, merge, archive | draft | draft | draft | draft | draft | live: merge by button; draft PR: unit (fake `gh`), refused live with no `origin` | Core UI (rebase decision) |
| C6 | Low disk | draft | draft | draft | draft | — | — | |
| D1 | Decision with default + countdown | draft | draft | draft | draft | draft | live: Go / Hold / Reply; countdown firing not walked live | Core UI · all levels |
| D2 | Batch harvest after being away | draft | draft | draft | draft | draft | live: living message, freeze on read | Core UI · living message |
| D3 | Quiet hours / escalation | draft | draft | draft | draft | draft | unit: push hold, coalescing, quiet hours; no real phone push yet | Core UI · attention forecast |
| D4 | Done with evidence / failed check | draft | draft | draft | draft | — | live: done with evidence; Done · checking and 检查没过 — | |
| D5 | Failure / stall | draft | draft | draft | draft | — | live: interrupt; eval: failure wording; stall/breaker — | |
| E1 | Follow-up in conversation vs in task | draft | draft | draft | draft | — | live: `task_send` steered / prompted; eval: follow-ups reach the right task | |
| E2 | Add scope mid-way | draft | draft | draft | draft | — | live: steer into a running turn | |
| E3 | Switch model / handoff / move device | draft | draft | draft | draft | — | — | |
| E4 | Pause / cancel / reopen days later | draft | draft | draft | draft | — | live: stop, drop, reopen, restart mid-task | |
| E5 | Merge / split tasks | draft | draft | draft | draft | — | — | open question |
| F1 | Rule created / edited / forgotten | — | — | — | — | — | — | |
| F2 | Recall from weeks ago | draft | — | draft | — | — | eval with a fake Mem (no live write) | First slice built: `memory_search` (one per turn, never pasted) and `memory_add` (durable things only) on Nowledge Mem; app line 记下了 · <title> / Noted · <title> (`memory.noted`); eval category `memory` with a fake Mem. Copy accepted (D66) |
| F3 | Mem unavailable | draft | — | — | — | — | eval with a fake Mem | Built: tools say so, the partner asks like a colleague who forgot, never mentions memory (eval `mem-down-zh`). No write outbox yet (todo) |
| F4 | Switch / link personas | — | — | — | — | — | — | open question |
| G1 | Something is about to go outside (intent needing policy) | draft | draft | draft | draft | — | eval: asks before push / post / pay; draft PR as an outside-effect action | `flows/G-safety.md`; effect ladder in §0 |
| G2 | Undo windows, and what's honest after | draft | draft | draft | draft | — | built: Undo after Drop (`undrop` action); send undo — | |
| G3 | Credential request (+ secret pasted in chat) | draft | draft | draft | draft | — | eval: key redacted from briefs; headless: the composer holds a pasted key | |
| G4 | Browser never signs in, pays, or submits on its own | draft | draft | draft | draft | — | live: the user signs in, the task never types it | builds on B5 |
| G5 | What did Ducter do today (the record) | draft | draft | draft | draft | — | — | |
| G6 | Quiet hours and outside effects | draft | draft | draft | draft | — | — | effects; D3 covers notifications |
| G7 | Honest about where a task can reach | draft | draft | draft | draft | — | — | 可以碰 / May touch on tasks |
| H1 | Phone → desktop continuity | — | — | — | — | — | headless: phone and desktop read the same Log | |
| H2 | Voice | — | — | — | — | — | — | |
| H3 | Act on lock-screen notification | — | — | — | — | — | unit: Android Go / Hold push actions; no real device | |
| I1 | Finished work comes back (the result message) | draft | draft | draft | draft | — | live: desktop result (How I know, Sent out, Merge / Draft PR / See changes); headless: phone, from a real sonnet run | `flows/I-results.md`; result anatomy in §0 |
| I2 | Evidence: what each chip opens | draft | draft | draft | draft | — | live: commit and test chips; typed kinds (IQ11) — | |
| I3 | Documents live in 做好的 (Save to…) | draft | draft | draft | draft | — | — | D52 Q7 |
| I4 | Finding a result weeks later | draft | draft | draft | draft | — | — | ask first; list inside On hand |
| I5 | Sharing a result | draft | draft | draft | draft | — | — | links ship with Ducter Edge |
| J1 | Another agent asks the partner to take work (Nowledge Bridge) | draft | — | draft | — | — | unit (stub nmem): request logged once, framed untrusted, task only after Go, reply to the original; live round trip — | `bridge.md`; behind `DUCTER_BRIDGE=1`, branch `bridge-practice` |
| J2 | The result goes back to the agent that asked | draft | — | — | — | — | unit: `bridge_reply`; task ↔ request link — | J-Q7 |
| J3 | A teammate's agent asks (Mem Team) | draft | — | — | — | — | — | Team Bridge gated on Mem's side |
| J4 | A task asks a session that holds the context | draft | — | — | — | — | — | needs outbound send (J-Q4) |
| J5 | The persona reached from a consumer AI | — | — | — | — | — | — | waits on Mem remote-MCP delegation |
| J6 | Fresh user: Bridge invisible until a second agent exists | draft | — | — | — | — | — | |

Flow docs: `docs/design/flows/*.md`. Open questions: `docs/design/flows/OPEN-QUESTIONS.md` (none waiting after D67). Flows canvas: https://claude.ai/artifact/LKuVp3knPDJ4EdoyWBGSWN
