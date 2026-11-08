# Scenario Coverage

Tracks design completeness per scenario (catalog: `product-model.md` §6).
Columns: **Flow** (steps + branches), **States** (which task/routine states it touches),
**Copy** (zh + en i18n keys), **Motion**, **Proto** (canvas artboard). Values:
`—` not started · `draft` · `reviewed`.

| ID | Scenario | Flow | States | Copy | Motion | Proto | Notes |
|---|---|---|---|---|---|---|---|
| A1 | First run | draft | draft | draft | draft | — | `onboarding.md` (cartoon + live checklist). VPS path built terminal-first (D54): service install, doctor with headless logins, pairing code |
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
| G1 | Intent needing policy | — | — | — | — | — | |
| G2 | Credential request | — | — | — | — | — | |
| H1 | Phone → desktop continuity | — | — | — | — | — | |
| H2 | Voice | — | — | — | — | — | |
| H3 | Act on lock-screen notification | — | — | — | — | — | |
| I1 | Results: where they live, sharing | — | — | — | — | — | open question |

Flow docs: `docs/design/flows/*.md`. Open questions: `docs/design/flows/OPEN-QUESTIONS.md`. Flows canvas: https://claude.ai/artifact/LKuVp3knPDJ4EdoyWBGSWN
