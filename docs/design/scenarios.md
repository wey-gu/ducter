# Scenario Coverage

Tracks design completeness per scenario (catalog: `product-model.md` §6).
Columns: **Flow** (steps + branches), **States** (which task/routine states it touches),
**Copy** (zh + en i18n keys), **Motion**, **Proto** (canvas artboard). Values:
`—` not started · `draft` · `reviewed`.

| ID | Scenario | Flow | States | Copy | Motion | Proto | Notes |
|---|---|---|---|---|---|---|---|
| A1 | First run | draft | draft | draft | draft | — | `onboarding.md` (cartoon + live checklist). VPS path built terminal-first (D54): service install, doctor with headless logins, pairing code. Mac terminal path shipped and walked live 2026-11-09 (onboarding.md "What ships today") |
| A2 | Pair a device | draft | draft | draft | draft | — | Built (D54): code pairing (CLI + desktop "Connect to your Ducter" card, screenshots `apps/desktop/docs/connect*.png`), revoke, worker enrollment/presence. Phone/web QR + passkey and worker task placement pending |
| A3 | Device sleeps / wakes / offline mid-task | draft | draft | draft | draft | — | |
| A4 | Harness not logged in; quota runs out | draft | draft | draft | draft | — | Headless login commands verified to the human step (`research/29`); relay into a client pending |
| A5 | Second persona | draft | draft | draft | draft | — | |
| B1 | Quick answer in turn | draft | draft | draft | draft | draft | Core UI · Talk |
| B2 | Research, no place | draft | draft | draft | draft | — | |
| B3 | Code change in a repo | draft | draft | draft | draft | draft | Core UI · Workspace |
| B4 | Multi-repo change | draft | draft | draft | draft | — | |
| B5 | Browser work needing login | draft | draft | draft | draft | — | |
| B6 | Phone / call task | — | — | — | — | — | |
| B7 | `until` loop | draft | draft | draft | draft | — | |
| B8 | Waiter | draft | draft | draft | draft | draft | Core UI · On hand (Waiting lane) |
| B9 | Routine: one-off / recurring / monitor | draft | draft | draft | draft | draft | Core UI · On hand (weekly report) |
| C1 | First mention of a new repo / path | draft | draft | draft | draft | — | |
| C2 | Non-git folder (draft copy) | draft | draft | draft | draft | — | |
| C3 | Recipe setup / failure | draft | draft | draft | draft | — | |
| C4 | Busy lease / port clash | draft | draft | draft | draft | — | |
| C5 | PR, rebase, merge, archive | draft | draft | draft | draft | draft | Core UI (rebase decision) |
| C6 | Low disk | draft | draft | draft | draft | — | |
| D1 | Decision with default + countdown | draft | draft | draft | draft | draft | Core UI · all levels |
| D2 | Batch harvest after being away | draft | draft | draft | draft | draft | Core UI · living message |
| D3 | Quiet hours / escalation | draft | draft | draft | draft | draft | Core UI · attention forecast |
| D4 | Done with evidence / failed check | draft | draft | draft | draft | — | |
| D5 | Failure / stall | draft | draft | draft | draft | — | |
| E1 | Follow-up in conversation vs in task | draft | draft | draft | draft | — | |
| E2 | Add scope mid-way | draft | draft | draft | draft | — | |
| E3 | Switch model / handoff / move device | draft | draft | draft | draft | — | |
| E4 | Pause / cancel / reopen days later | draft | draft | draft | draft | — | |
| E5 | Merge / split tasks | draft | draft | draft | draft | — | open question |
| F1 | Rule created / edited / forgotten | — | — | — | — | — | |
| F2 | Recall from weeks ago | — | — | — | — | — | |
| F3 | Mem unavailable | — | — | — | — | — | |
| F4 | Switch / link personas | — | — | — | — | — | open question |
| G1 | Something is about to go outside (intent needing policy) | draft | draft | draft | draft | — | `flows/G-safety.md`; effect ladder in §0 |
| G2 | Undo windows, and what's honest after | draft | draft | draft | draft | — | |
| G3 | Credential request (+ secret pasted in chat) | draft | draft | draft | draft | — | |
| G4 | Browser never signs in, pays, or submits on its own | draft | draft | draft | draft | — | builds on B5 |
| G5 | What did Ducter do today (the record) | draft | draft | draft | draft | — | |
| G6 | Quiet hours and outside effects | draft | draft | draft | draft | — | effects; D3 covers notifications |
| G7 | Honest about where a task can reach | draft | draft | draft | draft | — | 可以碰 / May touch on tasks |
| H1 | Phone → desktop continuity | — | — | — | — | — | |
| H2 | Voice | — | — | — | — | — | |
| H3 | Act on lock-screen notification | — | — | — | — | — | |
| I1 | Finished work comes back (the result message) | draft | draft | draft | draft | — | `flows/I-results.md`; result anatomy in §0 |
| I2 | Evidence: what each chip opens | draft | draft | draft | draft | — | |
| I3 | Documents live in 成果 (Save to…) | draft | draft | draft | draft | — | D52 Q7 |
| I4 | Finding a result weeks later | draft | draft | draft | draft | — | ask first; list inside On hand |
| I5 | Sharing a result | draft | draft | draft | draft | — | links ship with Ducter Edge |

Flow docs: `docs/design/flows/*.md`. Open questions: `docs/design/flows/OPEN-QUESTIONS.md`. Flows canvas: https://claude.ai/artifact/LKuVp3knPDJ4EdoyWBGSWN
