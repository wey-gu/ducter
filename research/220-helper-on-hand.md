# 220 · A helper on On hand, and what hel's babysitter really was (D507)

2026-11-24. The author made "Nowledge Mem PR Babysitter" on hel (0.1.30, D494) and asked: 「我设置了 babysitter
但在任务里看不到，这正常吗？」 Two questions: what state the helper was really in, and where a helper should
live on 手头的事 / On hand. Rendered shots, the raters' totals and the demo are in `.shots/d507/` (not in git, D75).

## 1. hel, read only (VERIFIED, 2026-11-24 00:54 UTC)

Read with a throwaway script over `ducter.db?mode=ro` and the home's files, deleted after; nothing written, no
Mem call (a passive `bridge setup` with the helper's context was not run: the session refused it, so Mem's own
view of the identity is not checked here).

- `helpers.json`: one helper, `state: on`, `mem: ready`, made `00:47:19Z`; the home holds its connection
  (`ducter-helper-nowledge-mem-pr-babysitter-on-hetzner-server-784f33`, the personal Space). The file's mtime
  is 00:47, so the address was ready within a minute of the partner's reply at 00:47:24 (「…Bridge 地址正在
  生成…」). No `detail`: no wait and no refusal (no `cloud_bridge_setup_busy`).
- The Log: no `bridge_msg` since 2026-11-23 20:00 at all, none with a `helper`; no task opened for it.
- So "not in tasks" was true and expected: no agent had handed it anything, and D494 showed a helper only in
  Settings › Agent 通信. The partner's "being made" was never followed by "it's ready": nothing said it.

## 2. Who, felt, first time

- **Who.** H, the author: his agents bring PRs to a stage and hand them on; he wants to see at a glance that the
  babysitter is listening, what it holds, and the one PR that needs him. C, a consumer who asked for "something
  that keeps an eye on my PRs": wants to see it exists and is doing it. F never meets it until they ask.
- **Felt before.** 不放心: made it, heard "the address is being made", then nothing; On hand doesn't show it;
  once work comes, each PR would scatter into 在做, 在等 and 今天做完 among his own tasks, and a PR "done"
  (mergeable, not merged) would fall into 今天做完 as if finished.
- **After.** 放心 and 好用: the partner says once that it's ready and where its work will show; On hand has the
  helper as one standing thing: nothing handed over yet; n on hand; 1 waiting for you. Its PRs sit under it until
  they merge or close.
- **First time.** The partner's ready line, then the helper on On hand at once with 还没有活交过来 and how his
  agents find it; nothing to learn.

## 3. Where it stands on the board

A helper is not a task, a group or a routine; it is a standing teammate with work. Options weighed:
(a) a row in 一直在跑的 / Ongoing (the D498 section): bolts a who into a when, and its tasks still scatter;
(b) its own sheet, placed like a D360 group: at the head of 等你 when something on it waits for the person,
else in its own place **你的帮手 / Your helpers** after the waits; its tasks nested under its head on the same
sheet, set in by the mark's width; (c) a separate tab: one more place to look. (b) taken: attention still leads
(what waits for him surfaces at the top), and its work never scatters.

A task stays with the helper until it ends and, if it finished, while the PR it owns (D483's owned PR) is still
open: a merge or a close lets it go (to 今天做完 with the helper's name, then Past tasks). Dropped lets go at once.

## 4. The mark: the metaphor process

Seven candidates, with "no metaphor" among them.

| Candidate | Maps | False implications |
|---|---|---|
| A. Its first letter on the sunken pebble (no metaphor; Settings' own tile) | an identity, the same in both places | an avatar to chat with; says nothing of state |
| B. A desk tray, slips per piece of work | work handed over, how much is held | a backlog the person must clear; paperwork |
| C. A mailbox with a flag | mail arrives for it | a mailbox the person reads (D494 rules it out); its flag is On hand's needs-you flag |
| D. A head-and-shoulders silhouette | a teammate | a human, or a partner to talk to (D486: it isn't) |
| E. A dock, a boat per piece; a boat sails at a merge | work moored until it leaves | a boat leaving reads as work lost |
| F. A nest of pebbles | things kept safe | something living to tend; hatching |
| G. A lighthouse | watching | alarms, surveillance, broadcasting |

Rubric (legible without the label, mapping fidelity, the three states, calm and trustworthy, distinct from On
hand's other marks), three LLM-proxy raters (haiku: a naive reader, one who never used an agent, a heavy agent
developer), blind read first, then the truth (INFERRED: LLM proxies, not people).

| Candidate | Mean of 25 | Blind read (3 of 3 unless said) |
|---|---|---|
| B tray | 18.3 | "an in-tray of handed-over work"; worry: "a backlog I must clear" |
| E dock | 17.3 | "work moored until it sails"; worry: "leaving reads as lost" |
| A letter | 15.7 | "the name's initial, an avatar"; states score 1 of 5 for all |
| F nest | 14.3 | "a collection"; worry: "living, to tend" |
| G lighthouse | 13.7 | "a watcher"; worry: "alarms" |
| C mailbox | 12.3 | "mail I must read"; the flag collides with needs-you |
| D person | 12.0 | "a human, a contact" |

Every rater said no mark carries "needs you" on its own: the words and the sheet's ledge must. The tray won on
the raters' totals, but its one shared false implication ("a pile the person must clear") is the opposite of a
helper (its work is not the person's), and its count repeats the rows nested under it. The literal letter lost
only on "shows the states", which the head's words and the ledge carry anyway.

**Shipped:** the literal mark (its letter on the sunken pebble, the same as Settings: one identity in both
places), state in words and the ledge. **Owed:** the tray drawn as clay art, rendered beside the letter and the
dock, and rated again with rendered images and people (the author first) before it replaces the letter.

## 5. One model of a helper's state

A helper's state (its PRs, where each stands, what waits for the person) is built once on the home:
`helperItems` (core/src/helpers.ts) over the helper's tasks (from its claims in the Log), each task's card, and
owned.ts's PRs; `HelperWork` (protocol/helpers.ts) carries it in `OnHand.helpers`. On hand's sheet reads it on the
web and the Mac. A helper's small app (D405/D407) is the next reader: the home writes its key from the same
model, as `review-board.ts` writes `board` from `review_report`. Not built here.

## Implications for Ducter

- A helper's address readiness must be said: the partner's reply promised it; the home now says it once (ready,
  or Mem refused with what to do), never on a wait that comes back by itself.
- A helper is its own sheet on On hand, placed by attention like a group, its work nested until the merge.
- Keep the literal mark until a drawn tray beats it with rendered images and people.
- A helper's app reads `HelperWork`; nothing else should re-derive a helper's state.

**Summary.** hel's babysitter was healthy (ready within a minute, connected, no error) and simply had no work;
D494 showed it only in Settings and never said it was ready. D507 says ready once, and gives the helper its own
sheet on On hand from one home-side model, with the literal mark (raters preferred a tray; owed as art).
