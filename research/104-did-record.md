# 104: Where Ducter's outward actions are recorded today (for "Done for you", D300)

Question: can a record of everything Ducter did on the person's behalf (G5, research/100 item 8)
be read from what Ducter already keeps, or does it need a new store? Method: read the code that
appends each action (packages/core, packages/protocol, 2026-11-17, branch at D295 + D291/D299),
then build the derivation (`packages/core/src/did.ts`) and test it against a seeded day with
fakes (`packages/core/test/did.test.ts`). No live accounts were used.

## Inventory

| Action | Where it is kept | Who asked | The Go | Where | Tag |
|---|---|---|---|---|---|
| A connection write (mail send, Slack post, Notion delete, any write) | `connection_call` op `write`, state `done` (needs_go, held, failed, denied are separate events of the same callId) | `taskId`, absent = the partner (the person, in the conversation) | `decisionId` → `decision_resolved` | the home (the account's own API), `connection` names it | VERIFIED (connections.ts:746) |
| A connection read | `connection_call` op `read`, state `done`; `summary` ≤ 200 chars of the provider's own words | as above | none (reads are not gated, principle 18) | the home | VERIFIED |
| A calendar change | the `decision` with `cal` (kind create / move / respond / cancel, title, calendar) and its `connection_call` write with that `decisionId`, `link` to the event | as above | the decision | the home | VERIFIED (calendar.ts, D222) |
| A payment with a saved card | `decision.pay` (site read by code, amount, currency, card label, last four) + `decision_resolved` go; Autofill's use `approved` | `decision.taskId` | the decision | Ducter's browser on the task's computer | VERIFIED (saved/fill.ts:191) |
| A saved sign-in or detail filled | **not in the Log**: Autofill's `uses` (vault, last USES_KEPT), `filled` per run, `ok` for a first use's OK | `taskId` in the use | `ok` use, or nothing (allowed earlier) | Ducter's browser | VERIFIED (saved/store.ts:516) |
| A key given to a task | Autofill's use `given` / `refused` (handle `key:ENV`, never the value) | `taskId` | the key card | the task's computer | VERIFIED (saved/store.ts:404) |
| A tap on Ducter's phone / the person's phone that commits | `decision.phone` kind go (app, its name, the button, `effect` from android/gate.ts, `on` = the person's phone) + its resolution | `decision.taskId` | the decision | Ducter's phone or the named phone | VERIFIED |
| An action in the person's Mac apps that commits | `decision.computer` kind go (app, button, `effect`) + its resolution | as above | the decision | the task's computer | VERIFIED |
| A phone call | `phone_call` snapshots per callId (the latest wins): `placedAt`, state, plan (to, name, goal, `from` provider / own / self), outcome | `taskId` | `decisionId` | the line's provider, or the person's own number | VERIFIED (phone.ts:319) |
| A message to another agent (Bridge) | `bridge_msg` direction `out`, one event per state of one `opId` (pending, held, sending, sent, failed, unknown, unconfirmed, followed) | `taskId` | `decisionId` when a card asked; none when the person had trusted it | the home | VERIFIED (D106) |
| Merge / draft PR | `job_status` with `act` merge / open_pr, state done (the person's own tap) | the person | the tap itself | the task's computer | VERIFIED |
| A folder task's files | `report.folder` (added, changed, removed, moved, renamed, undo state and `undoUntil`); the fresher state from `changes.folder()` | `taskId` | none (the task's own place) | the task's computer | VERIFIED (D142) |
| Chat-app sends (Telegram, Slack, iMessage) | the partner's own replies to the person, not actions toward others | — | — | — | VERIFIED (channels.md, imessage.md): not on behalf |
| Commands a harness ran itself (git push with approvals off) | only in transcripts (`task_event` tool calls), no typed effect | — | — | — | VERIFIED: not covered |

## Findings

1. **No new store is needed.** Every gated action already leaves typed events; the record is a
   read-time projection (principle 1). One exception: Autofill's uses live in the vault, not the
   Log, and are capped; the record reads them there.
2. **Effects have a word already.** The phone and computer gates classify a button by effect
   (`pay, buy, send, post, delete, install, call, account, confirm, setting, record`), so their
   actions map to the record's kinds without a model.
3. **Connection writes are named only by their action id** (`gmail.send_message`,
   `notion.delete_page`). The kind is read from the name (send / reply / post / delete / trash);
   anything else is "changed". INFERRED: good for the actions seen in oo and OpenConnector today;
   an unusual name falls to the honest "changed something in {account}".
4. **Undo exists in one place:** a folder task's copy (D142) until `undoUntil`. Mail, payments,
   calls, merges and messages cannot be taken back; the record does not offer an Undo for them.
5. **Coverage gap:** a command a harness runs directly (approvals off) has no typed event. The
   page says so once; reading transcripts for outside-looking commands is left for later.
6. **Times:** a reads row is per local day of the home's clock; clients group items by their own
   local day. A home and a phone in different zones may disagree near midnight (INFERRED; rare).

## Implications for Ducter

- Build the record as a pure derivation over the Log and Autofill's uses (`did.ts`), answered
  over the client protocol (`did` → `did_result`) and to the partner (`did_list`).
- Reads are counts per account per task per day, never their content.
- Undo only for folder tasks; everything else says plainly what it was.
- Later (todo): outside-looking commands from transcripts; Autofill's uses in the Log so they are
  never capped.

**Summary.** Everything the record needs is already logged, except Autofill's uses (kept in the
vault) and commands a harness ran on its own. D300 reads, never stores.
