# Scenario Coverage

Tracks design completeness per scenario (catalog: `product-model.md` §6).
Columns: **Flow** (steps + branches), **States** (which task/routine states it touches),
**Copy** (zh + en i18n keys), **Motion**, **Proto** (canvas artboard). Values:
`—` not started · `draft` · `reviewed`.

| ID | Scenario | Flow | States | Copy | Motion | Proto | Notes |
|---|---|---|---|---|---|---|---|
| A1 | First run | draft | — | draft | draft | — | `onboarding.md` (cartoon + live checklist) |
| A2 | Pair a device | draft | — | — | — | — | waits on research/21 |
| A3 | Device sleeps / wakes / offline mid-task | — | — | — | — | — | |
| A4 | Harness not logged in; quota runs out | — | — | — | — | — | |
| A5 | Second persona | — | — | — | — | — | |
| B1 | Quick answer in turn | — | — | — | — | draft | Core UI · Talk |
| B2 | Research, no place | — | — | — | — | — | |
| B3 | Code change in a repo | — | — | — | — | draft | Core UI · Workspace |
| B4 | Multi-repo change | — | — | — | — | — | |
| B5 | Browser work needing login | — | — | — | — | — | |
| B6 | Phone / call task | — | — | — | — | — | |
| B7 | `until` loop | — | — | — | — | — | |
| B8 | Waiter | — | — | — | — | draft | Core UI · On hand (Waiting lane) |
| B9 | Routine: one-off / recurring / monitor | — | — | — | — | draft | Core UI · On hand (weekly report) |
| C1 | First mention of a new repo / path | — | — | — | — | — | |
| C2 | Non-git folder (draft copy) | — | — | — | — | — | |
| C3 | Recipe setup / failure | — | — | — | — | — | |
| C4 | Busy lease / port clash | — | — | — | — | — | |
| C5 | PR, rebase, merge, archive | — | — | — | — | draft | Core UI (rebase decision) |
| C6 | Low disk | — | — | — | — | — | |
| D1 | Decision with default + countdown | — | — | — | — | draft | Core UI · all levels |
| D2 | Batch harvest after being away | — | — | — | — | draft | Core UI · living message |
| D3 | Quiet hours / escalation | — | — | — | — | draft | Core UI · attention forecast |
| D4 | Done with evidence / failed check | — | — | — | — | — | |
| D5 | Failure / stall | — | — | — | — | — | |
| E1 | Follow-up in conversation vs in task | — | — | — | — | — | |
| E2 | Add scope mid-way | — | — | — | — | — | |
| E3 | Switch model / handoff / move device | — | — | — | — | — | |
| E4 | Pause / cancel / reopen days later | — | — | — | — | — | |
| E5 | Merge / split tasks | — | — | — | — | — | open question |
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

Note: the existing Core UI canvas still uses retired vocabulary (奏章台, 准/驳). It must be
updated to the glossary before any of its artboards counts as reviewed.
