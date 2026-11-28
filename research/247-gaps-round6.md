# 247 · Gap analysis, round 6: what 0.1.99–0.1.102 settled, the aha without a judge, and the lines that still lie

Date: 2026-11-29, on `dsh-gaps6` at `712a9c3ba` (the 0.1.102 release candidate; 0.1.99, 0.1.100 and
0.1.101 shipped). Follows research/235 (round 4, 0.1.84) and research/243 (round 5, 0.1.98). The
author's standing ask, in their words: 「参考 cindy 等项目仔细对比我们的 motivation，野心，哪里有高优先级
还没做的事情」 — compare Ducter against the reference projects and `motivation.md`, and find the
high-priority things not yet built. This round the author's standing areas are Nowledge Bridge's
progress, the depth and feel of the Nowledge Mem integration, and every Settings pane's flow and look,
plus research/245's Tasks for builders (phases 1–5 built) and research/244's conversation attention
load (rules 1–10 built).

Read: `AGENTS.md`, `motivation.md`, research/235 and 243 and their private notes, research/244,
245 and 246, `design/decisions.md` D638–D662 (each entry's heading and first lines), `design/todo.md`
(the live-check, Mem, Bridge, Settings and proactive items), `design/roadmap.md`, `design/settings.md`
(the "Not done" sections), `design/memory.md`, `design/bridge.md`, `design/on-hand.md`,
`design/standing-work.md`, `design/conversation.md`, and the code named below. Nowledge Mem: the
installed **nmem 0.10.125**, `nmem --help` and per-verb `--help` only; `nmem-cli` on PyPI is still
0.10.125 (2026-11-27), so there is no newer command line to read this round. Nothing was sent,
registered, connected or written, and no call reached Mem's backend. Settings, Tasks and the
conversation were read in code by read-only sub-audits and spot-checked by hand; no app run and no
screenshots. Outside repos, cloned fresh with `--depth 1` into `/tmp/claude-gaps6` and read only,
never run: **Raft** (`botiverse/raft-source`, unchanged at `da842d0`, 2026-11-23) and **the open
agent app** (research/235's name for it, at `49cf5159`, 2026-11-28; its name and commit are in
`research/private/247-gap-notes.md`).

Tags: **VERIFIED** = read in code, help text or a doc at the commit or version named;
**DOCUMENTED** = a product's own page, README, tracker or package index; **INFERRED** = judgment.

## 0. Where research/243's eight stand (VERIFIED in `decisions.md`)

| 243 # | Now |
|---|---|
| 1 a correction that sticks | **Built** (D652): 改 and 忘掉 wait for `mem_done`; a correction supersedes the named id whoever wrote it; the eval ran two new scenarios. One part never fires: `memory_feedback` is sent only when nmem has an `m feedback` verb, and 0.10.125 has none, so the intent is logged `sent:false` (`design/todo.md`, trigger). The **spoken** take-back still acts before Mem answers (todo 1116) — #4 below |
| 2 proof: the owed live checks | **Still open.** `todo.md`'s only "Seen live:" string is the template's example (line 7); `roadmap.md` says "none has run for real yet" (line 75). The release's own eval is also not settled: `LATEST.json` in this worktree names the 0.1.101 run, D660 says its full run and `LATEST.json` are left to the lead, and D651's LATEST does not match the branch (todo 3876) |
| 3 Mem's state is never a dead end | **Built** (D646): one table for Overview, Memory and Agent messaging; every known refusal has a line and at most one action. Left: `no_space` has no Space picker (todo 1027), and an **unregistered** Mem code still reaches the screen raw (#4) |
| 4 a consequential change says what it did | **Built** (D643): the word waits for the home's answer; two confirms; a removal says what stays. A person's comprehension pass and the author's review are still owed (`settings.md`) |
| 5 DingTalk and WeCom | **Open.** `packages/core/src/channels/` has `telegram`, `slack`, `feishu`, `wechat`; no DingTalk or WeCom adapter. D622 built Feishu / Lark only |
| 6 reach and the bare-Mac first hour | **Open.** No Windows or Linux desktop app; the Android app is built but unreleased; the bare-Mac check has not run (`roadmap.md` "Next") |
| 7 a task's question that is never answered | **Built** (D656): the wait is the outgoing op, the card says 在等{who}回话, one line after S3's windows, and the answer goes into the task. `bridge follow` is used behind its `--help` check; its JSON shape is still **INFERRED** (todo 1059), and one real answer has not been read. T1 passed 9/9 on the real Bridge on 2026-11-25 |
| 8 People you deal with | **Open by design.** Mem's people graph is a Labs feature per Space; `design/memory.md` says a people group would be invented. Trigger in `todo.md` |

Close behind from 243, still as it was: named native windows (B3; 0.10.125's `bridge session` takes
`--host` and `--session-id`, no name), Mem's upkeep (`feed catchup`/`rules review` unused; the page
points to Mem), a memory's history (`graph evolves` unused), and `check_claims` (MCP-only).

## 1. What 0.1.99–0.1.102 settled (VERIFIED in `decisions.md`)

The release is best read as one claim: **the app should say only what is true, and the person should
be able to act on it at once.** Each entry is a place that claim did not hold.

| D | What changed for the person |
|---|---|
| D638 | Go on a hand-over answers at once; the slow reads finish behind it; a late failure is a card and a toast, never a frozen sheet |
| D639 | The site's phone shot ends on whitespace; the chat apps become a fifth card beside the devices |
| D640 | A question that comes with files shows them on the card, before the answer |
| D641, D648 | The first card: transparent tab icon, README, a 2x full-colour GitHub preview; the GitHub upload still waits for the author |
| D642 | A calendar card is a calendar entry; every Go card says what kind of thing it is |
| D643 | A consequential Settings change says what will now happen, after the home answers |
| D644 | Settings, pane by pane on the web/phone: 44-point targets at 320, choices on one line, details apart |
| D645 | Tasks tell the truth, phase 1: GitHub reads where `gh` is, 在做 only while a turn runs, one hand-off key per `repo#n` |
| D646 | Mem's state is never a dead end: one table of states, one way through each |
| D647 | A fixed comment names that item's merged PR; no question about what was just answered; Ducter's own traffic is not conversation |
| D649 | In a chat app, asking for a partner switches to it; the thread stays; names show when there are several |
| D650 | A Keep says when it ends, how many rounds it has run, how long; it ends by itself, asks once after six quiet rounds, and stop ends it |
| D651, D655 | Bring past conversations in: one `ducter-import/1` format, one consent card, Lody read in tree, read-only past tasks |
| D652 | A correction that sticks: Mem answers first, and the wrong memory is retired whoever wrote it |
| D653, D660 | One living card per subject; the partner speaks only for a needs-you, a failure, or the final result; every line names its subject, a question stands alone, offers wait for a quiet gap |
| D654 | One project per repository, derived once in core; rename, merge, hide, pin; machines and worktrees are attributes |
| D656 | A task's unanswered Bridge question is held and said once, naming the task and who it waits on |
| D657–D659 | Every staged connection write runs itself on Go, wakes the partner with its outcome, and cannot be staged twice |
| D661, D662 | One state derived once (`truthOf`); one PR one holder; the row's own gist; 列表 / List for builders with keys, multi-select, bulk with Undo, and saved views |

D175's evals: D652 and D654 ran theirs; D660's full run and `LATEST.json` are left to the lead; D651
turn 2 restored the persona and two tool texts, so its fingerprint still waits for the lead's one full
eval per release (todo 3876).
The release's **product** work is far ahead of its **proof** work. That is why #3 below is not a
research footnote.

## 2. Nowledge Mem and Bridge: no new CLI, and the two holes left in Ducter

### 2.1 What is new on Mem's side

Nothing in the command line. `nmem-cli` 0.10.125 (2026-11-27) is still the newest on PyPI; its
`bridge` verbs are the ones research/243 read (`setup`, `connections`, `contacts`, `contact-status`,
`inbox`, `open`, `send`, `reply`, `outbox`, `resume`, `inspect`, `follow`, `session`, `notices`), with
`session` still keyed by `--host` and `--session-id`, never a name. So the three Mem-side moves 243
watched — named windows, cross-Space find, Bridge for every workspace — are still not reachable from
the CLI Ducter ships against. The only buildable Bridge adoption from 243, `bridge follow`, is built
(D656) and used behind its own help check.

### 2.2 What Ducter now uses, and what it still doesn't

| # | Capability (nmem 0.10.125 / Mem's tools) | Now | Evidence |
|---|---|---|---|
| M1 | `memory_feedback` | **Partly**: Ducter records the intent and sends it only if `m --help` lists `feedback`; 0.10.125 has none | `packages/partner/src/memory.ts` `feedback`; `packages/core/src/settings.ts` `memory_feedback` |
| M2 | `check_claims` | **Unused**; no CLI verb | MCP description only (243 §1.2) |
| M3 | a memory's history (`graph evolves`, `memories evolves`) | **Unused**; the row shows title, source and age only | `apps/web/src/memory.tsx` `MemRow` |
| M4 | people (`memories identity`) | **Unused, deliberate**: Labs per Space | `design/memory.md` "People and projects are not groups yet" |
| M5 | upkeep (`feed catchup`, `rules review`) | **Partly**: Ducter reads contradictions, the review total and rules; never starts a catch-up or asks for rule drafts | `packages/core/src/mem-check.ts` |
| M6 | skills (`skills match`, `report_skill_outcome`) | **Unused, deliberate**: `skills match` answered 404 on Cloud | `design/todo.md` trigger |
| M7 | `identity_birth_draft` | **Unused, deliberate**: "Mem's birth-draft flow is later" | `design/product-model.md` |
| M8 | `working-memory edit/patch` | **Unused, deliberate**: read only (D368) | `packages/core/src/working-memory.ts` |
| B1 | `bridge follow <operation>` | **Used**, one scan, no `--wait`, no `--cursor`; the JSON shape is INFERRED | `packages/partner/src/bridge.ts`, `design/todo.md` 1059 |
| B2 | `--return-host` | **Unused, deliberate** (the home is the one receiver, D494) | `design/bridge.md` |
| B3 | named native sessions | **Gated**: no name option in the CLI; Ducter runs no `bridge session` | `nmem bridge session --help` |
| B4 | shared documents / `collab` | **Partly**: a `shared_document` ref is read and named; never opened | `packages/partner/src/bridge.ts`; `design/bridge.md` |
| B5 | cross-workspace Bridge | **Partly**: refusal codes are mapped; a new per-workspace policy code has no entry | `packages/core/src/bridge-link.ts` |
| B6 | `nmem mcp` (stdio) | **Unused**: not in 0.10.125; tasks reach Mem through the relay | `packages/core/src/mem-relay.ts` |

### 2.3 The two holes Ducter can fix without Mem

1. **A new refusal code reaches the person raw.** D646's table covers every known `bridge.refused.*`.
   Any code Mem adds later, and the stuck-mailbox row, still fall through to a string built as
   `Nowledge Mem: ${code}` (`packages/core/src/bridge-link.ts`), and the web prints it as the line
   (`apps/web/src/memory.tsx` `failedWhy`; the stuck row prints `(%s)`). The first screen for the
   people Mem is about to let into Bridge is therefore a code, not a sentence.
2. **The app link goes to the website.** 去 Nowledge Mem 看 opens `mem.nowledge.co`
   (`apps/web/src/memory.tsx` `MEM_SITE`), even when Mem lives on this computer; `memWhere` already
   knows `local` and `server`, and `openMem()` already opens the local app for the closed state. The
   one place the count is drawn sends the person away from the thing it counts.

Verdict (INFERRED): Bridge's real progress this week is Ducter's own (D646, D652, D656); Mem's side
has no new CLI. The next Bridge adoption is not a build — it is one read-only real `bridge follow`
answer, and a message to Mem for a feedback verb. Neither is in this report's four briefs.

## 3. Memory as the person feels it

What already holds (VERIFIED): the inventory by kind with search, 改 and 忘掉; the correction that
waits for Mem and retires the wrong id (D652); Mem's states with one way through each (D646); Mem's
questions answered on the page (D465, D569); what a task was given, with 这条不对 (D617); the
morning note reading the focus (D444, D458); the week's check and the tools' counts. This is a deep
integration now, not a list.

The gaps, as moments:

- **A spoken 别记这个 that Mem refuses says nothing, and the partner is told it worked.** (VERIFIED)
  `mem-takeback.ts` sets `heardFrom` at once and fires `void o.undo(seq)`; `settings.undo` returns
  false on a Mem refusal, but only the tap's `memory_undo` frame sends `undid.ok:false`
  (`packages/core/src/ws.ts`), so the Noted line stays 记下了 and the failed line is never drawn for
  the spoken seq (`apps/desktop/internal/views/quiet.go` draws `UndoFailed` only from the tap). The
  partner's next turn already has the memory as taken back (todo 1116). This is the same class of
  lie D652 removed from 改/忘掉 — the app and the partner disagree with Mem, and the person is not told — on
  the one path a person uses in conversation.
- **A memory has no past.** (VERIFIED) 改 swaps the words and returns a new id; the row never says
  what it replaced, who wrote it before, or whether Mem kept both. `graph evolves` is unused. The
  person's "why does it think this" has no answer on the page.
- **People are not a thing** (M4), where the open agent app's catalogue now sells exactly that. Mem's
  graph is Labs; building a second store would be worse. Wait.
- **Mem's own upkeep is still Mem's** (M5). Deliberate (D465/D569, `design/memory.md`): the page says "还有些整理建议…在
  Nowledge Mem 里看", never a count. Defensible, but it means the person who never opens Mem never
  learns it is behind. The open agent app moved this to one weekly pass with a frequency and 立即整理.
- **A principle drift, unchanged:** `mem-takeback.ts` is still a phrase list (`readTakeBack`'s regex)
  against "model judges, code guards"; `todo.md` already lists it among regexes to retire.

Verdict (INFERRED): the depth is there; the remaining depth is either Mem's own (people, skills, a
feedback verb) or one honest failure path and one history row. The failure path is #4 below; the
history is not worth a brief until the failure is fixed.

## 4. Settings, pane by pane (from code; VERIFIED unless tagged)

D644, D646 and D643 did what 243 asked. The "Not done" sections in `design/settings.md` are now mostly
stale: the web's memory kind is titled above its card, Agent messaging's problems are a title and a
line, the notification choices are one select at a phone, This phone has a lede, the device list has
hairlines, the Partner peers line has a chevron, a To-do source's 移除 is on the last line, and the
connection-added notice is a said line. What is still true is smaller and sharper.

**The two high faults:**

1. **账号 / Accounts (web): a calling connection that cannot be reached still says it can call.**
   `apps/web/src/phone.tsx` `PhoneCard` sets `out = c.state === "unauthorized"`; a connection whose
   state is `unreachable` falls into the ready branch and shows **能打电话了** with today's count.
   The Mac's `sourceDown` (`apps/desktop/internal/views/accounts.go`, used by `phone.go`) already
   covers `unreachable|unauthorized` and says **现在连不上 Tuwa** in the failed ink. One pane, one
   wrong state word, and the person taps a call that cannot go.
2. **概览 and 聊天软件 (Mac): Feishu / Lark is missing.** `apps/desktop/internal/views/settings_home.go`
   has two per-kind switches (`chatsSay`, `homeReach`) that name only WeChat, Telegram and Slack.
   After a person links Feishu / Lark — D622's fourth app, and the web names it — Overview's
   **也能找我** omits it and the Chat apps head says the generic line. The pane and Overview disagree
   about a link the person just made.

**The smaller leftovers (still true):** the web's Import removal is a toast, not a word under the
sources (`imports.tsx`); a source that is signed out or unauthorized has no 再试一次, only the ⋯ menu;
the web's Memory and Agent messaging draw a blank pane while the settings frame is on its way
(`memory.tsx` returns null; the Mac has `paneWait`); **用地址和密钥添加** and **怎么连** are well
under 44 at 390 (`.qlink` has no 44 box); the Mac's Import head says the pane's purpose where the
state is known (`settings_home.go` passes `lede`; `importsSay` is dead code). The author's review and
a comprehension pass on the said lines are still owed.

## 5. Tasks for builders, after phases 1–5

research/245's redesign is built: phases 1–5 map to D645, D650, D654, D661 and D662. Of its 14 bugs,
**B1–B13 are fixed** in code (B1 at `work.ts`'s `githubLookRepo`, B3's template gone from
`task-sources/index.ts`, B12's uncached budget in `routines.ts`); **B14 is still open**: the Chinese group title is `"{title} 等 {n} 个"`
(`packages/core/src/task-sources/handover.ts:62`), where English already says "and {n} more".

Five real leftovers remain, all small; four are in the List:

1. **Saved views are unreachable on a one-project board, and cannot be removed.** The web's
   `BoardViews` sits inside `LensColumn`, which returns null unless there are two or more project
   groups (`apps/web/src/onhand.tsx` `lensOn`; the Mac's `viewRows` is inside `projectColumn`), while
   Save-as-view is still offered in the List's head. A builder with one repository can save a view
   and never see it. Core's `views.remove` exists, the wire takes `remove:true`, and the clients'
   `viewSave(view, remove)` has no caller (`apps/web/src/app.ts`): at 40 views the error says
   "Remove one first" with no way to do it.
2. **The List row drops the other holders.** The overview draws `card.holders` as 作者 / 复审 /
   交给; the web List row and the Mac `tableLine` draw only state, title, project, computer, agent,
   age, step, PR, CI. The one row that holds a PR loses who wrote, reviewed or handed it.
3. **A batch answer hides pending and skipped work.** Core returns `done`, `skipped` and `pending`
   (`packages/core/src/bulk.ts`); the toast says only `done` (`apps/web/src/app.ts`), and the Move /
   Reassign ask never names the finished tasks it skips. Ending eight working tasks says "结束了 0 个"
   with no reason.
4. **The phone's List has no bulk.** Selection is refused outside the full room
   (`apps/web/src/onhand.tsx` `pickClick`), and the selection bar appears only after a selection, so
   the phone gets the List's density and none of its actions.
5. **A second Keep can still be minted on one PR.** B6 skips a loop whose task is another holder's
   item, but `keep_make` never looks up an existing Keep by `repo#n` (`packages/core/src/keeps.ts`),
   so the original double-round symptom is still possible.

The live run on hel (the project column, a rename from the Mac seen on the web) and the author's
review are still owed (todo 3874). Verdict (INFERRED): the design is done; what remains is a polish
branch, not another redesign. It has no brief below because the four gaps above it are larger, not
because it is finished.

## 6. The conversation's attention load, after rules 1–10

All ten of research/244's rules are built: D647 (rules 2, 3, 9), D653 (1, 8), D660 (4, 5, 6, 7, 10).
The measured day was 67 lines; its fixes were tested against fixtures of that day, not against a
second real one. The remaining gaps are narrower but not zero:

1. **A group review's record is written before the comments are posted.** `reviewSend`
   (`packages/core/src/task-sources/handover.ts`) logs the `decision` with 「在…下留了言」 and resolves
   it, then writes each comment; a failed write leaves the permanent record claiming a comment that
   did not go out. The client does say `ho.review.failed` afterwards, but the card in the scroll is
   wrong. This is exactly rule 10's "a claim waits for the call that makes it".
2. **Information-only lines still become `ai_msg`.** D653 made the partner speak for needs-you,
   failure and the final result; these producers still append a line of their own: the merged-PR
   summary (`packages/core/src/holdings.ts`), a routine's first-run cost (`routines.ts`), the first-use
   "PR opened" (`core.ts`), a loop revived after a restart (`loops.ts`), a backed-off wait
   (`work.ts`), and "commented then started" (`handover.ts`). The merged summary can re-say a merge
   the subject card already reported; the same-words filter compares exact text only.
3. **The origin line still ignores `replyTo`.** Local traffic is hidden (D647), but for agents Ducter
   did not start the origin attaches to the next partner message whatever it answers
   (`apps/web/src/mem-view.ts` `spokenPeers`; the Mac's `peers_d470.go`): research/244's E6 mismatch
   remains.
4. **Rule 5 is structural only.** `keepsPoints` checks numbered points and `#refs`
   (`packages/protocol/src/ask-words.ts`); a one-point question whose object is words can be replaced
   by any partner sentence, and "what each answer does" and the default are never checked.
5. **Rule 10's window is 30 minutes of exact text** (`packages/partner/src/partner.ts`), not the
   subject's life; a late `needs_input` after a `done` is not blocked by D653's `shouldWake` (which
   blocks progress and done, not a question).

The largest of these is #1; #2 is the one the author still feels as "the conversation is busy". They
are Brief A. The proof gap — a second real day — is #3 in the ranking and has no brief because it
needs the author's home, not a branch.

## 7. The aha, and the missing judge

The motivation's two stories — a domain renewal noticed days before it lapsed, a flight that did not
match the hotel dates — are the product's defining promise, and the engine built for them is real.
The detectors (`packages/core/src/proactive/detect.ts`) cover the shapes: a renewal, a cancelled
or changed plan, a flight/hotel mismatch, a promise due, someone waiting on the person, a meeting, a
service outage, a shutdown, a security alert, a failing job. The
general form — a fact from one source meeting a fact from another, with no hand-written shape — is
D502's shadow: `packages/core/src/proactive/cross.ts` runs one cheap tool-less model pass over the
ledger's open facts after the morning note, once a day, and logs `shadow_finds` on the partner
stream; it never says anything (VERIFIED: the daily `crossNow` in `engine.ts`, the comment at the top
of `cross.ts`).

The author can see it: `ducter proactive cross` runs one pass now and prints each finding with its
facts and which detectors also have it; `ducter proactive week` prints a week's shadow block with
runs, findings, both/only counts and quoted finds (VERIFIED, `packages/cli/src/proactive-cmd.ts`).
What is missing is the **verdict**. There is no label store, no `ducter proactive review`, no card
that asks 应该早说 / 不该说; the promotion rule in `todo.md` (2097) says the author labels each shadow
finding and each detector join of a week, and promotes only when shadow plus detectors find more of
what mattered than the detectors alone at no lower precision. That is a step only the person can
take, and the product gives them no place to take it. The eval's 21 ledgers were written with the
prompt (todo 2097), so even the evaluator cannot answer for a real week.

The moment: H opens the morning note on the week's quiet day and sees one quiet card, **这周我注意到 7 件没敢说的事**, each with
its two facts and what it would have said; two taps per find; the verdicts decide next week. C meets
the promoted find later, as one line with Go. Felt before: 惊喜 missing — the shadow is a CLI count
and the product never surprises. After: 惊喜 earned, and the person's own judgment is the gate, not
the model's confidence.

Verdict (INFERRED): the model and the facts are ready; the missing piece is a review surface and a
label store, and the promotion gate in code. That is Brief B.

## 8. The references, this round

**Naming first.** The open agent app's claims below are DOCUMENTED in its own docs and commits, read
only; Raft's are VERIFIED in its source. The author's "cindy" appears in the research only as **Raft's
onboarding agent** (research/235 line 14: "whose onboarding agent is called Cindy"; research/02 §2).
The other reference 235 and 243 read — an open agent app — is kept unnamed in git by their own rule; its name and commit
are in `research/private/235-gap-notes.md` and `research/private/247-gap-notes.md`. If by cindy the
author means that app (the private notes name it), it is the second reference below; the public repo
names no such project, and this report does not guess. Both were read.

**Raft** (`botiverse/raft-source`, `da842d0`, unchanged since 235 and 243; read only): its onboarding
agent's one proactive return, the Day-2 10:00 recap, is built in Ducter (D623); its "a task that waits
on someone stays in_progress, assigned to them" is D661's `waitsFor`; its "no privileged
main AI" is a deliberate difference (Ducter is one partner, not a peer mesh). Nothing new this week.

**The open agent app** (`49cf5159`, 2026-11-28; read only, never run). Its week is UI and operations,
not a new core:

- **Task inbox:** the partner's main conversation leaves the inbox for a top partner section; the
  inbox is tasks only (task-inbox doc, 2026-11-28). Ducter already keeps the conversation and
  待你处理 apart; nothing to take.
- **Archive + automations:** archiving one task offers an opt-in "delete its linked user automations",
  after the archive write succeeds (`a2a9089f`). Ducter's Keep stops with an ended task on the bulk
  path (D662); a single task's archive is not Ducter's model. No gap.
- **QR sign-in:** a signed-in computer shows a code, the phone scans, the computer approves
  (`ce34fdce`). Ducter's pairing code is the same job (D54). Parity, not a gap.
- **Remote desktop:** Linux X11 and GNOME Wayland clipboard sync and paste (`eba1cb3d`), on top of a
  mature screen/input/privacy-screen stack (`docs/remote-desktop.md`, `docs/product-rules/privacy-screen.md`).
  Ducter has live views of its own phone and browser, and the workbench, but no remote desktop of a
  Mac. This is 235 #9, still open; #10 below.
- **Plugin engines:** ACP plugin engines, per-machine tool cards, user system prompts
  (`2be3d43e`, `4c076964`). Ducter's agents are OAR runtimes; research/246 §2 says keep it so. No gap.
- **Sidebar display settings, model/provider groups, region and editions** (500a8597, model-groups,
  region-and-editions): UI and commercial packaging; model/provider groups' auto-routing is D503's
  ground. Not applicable.
- **Task tags, shared task mode, mail card, document workshop, voice mode:** Ducter covers the same
  moments with projects, hand-offs/group review, D206's media and D439's documents, D305's voice.
  Tags are the one idea with no Ducter equivalent; low, not ranked.

**What Ducter has that neither does (for balance):** one partner that owns the person's attention
(typed reports, decisions with defaults, the living card), Nowledge Mem as one memory across tools, a
task model with hand-offs and Keeps, phones (its own and the person's), and small apps. The references
now lead on **reach** (Windows/Linux, stores) and **remote desktop**, not on the core (INFERRED).

## 9. The top gaps, ranked

Score as in research/201, 218, 235 and 243: impact (1–5) × reach (which of the three users, 1–3) ×
cost (3 = a branch with fakes, 2 = needs one of the author's devices or accounts, 1 = gated on others
or a person's judgment). Size: S ≤ a day, M ≤ three days, L more.

| # | Gap | Who it serves, before → after | Evidence | I | R | C | Score | Size |
|---|---|---|---|---|---|---|---|---|
| 1 | **A claim waits for its call, and information stays in the card** | H: a group-review record says comments went out that didn't; C: the same merge is said twice and a duplicate line interrupts. 不放心 → 放心 | §6 1–2, VERIFIED | 4 | 3 | 3 | 36 | M |
| 2 | **The aha has no judge** | H and C: the motivation's defining moment (Dots' renewal, the flight vs the hotel) is a CLI shadow and a weekly count; no way to say 应该早说 / 不该说; promotion waits on a labelled week nobody can make. 惊喜 missing → 惊喜 earned | §7; D502; todo 2097, VERIFIED | 5 | 2 | 3 | 30 | M |
| 3 | **Proof: the live checks, a second real day, and the release's own eval** | all three, through trust: the release says the conversation is quieter and the tasks truer, and no real day or check has run. 不放心 → 放心 | §0, §6, VERIFIED | 4 | 3 | 2 | 24 | S |
| 4 | **Mem's no reaches the person** (spoken take-back, raw codes, the website link) | C and H with Mem: 别记这个 says 不记了 while Mem refused; a new refusal code is the first screen; 去 Nowledge Mem 看 leaves the app. 被骗/看不懂 → 放心 | §2.3, §3, VERIFIED | 4 | 2 | 3 | 24 | S–M |
| 5 | **A connection says what is true** (web Tuwa "ready" when unreachable; Mac Feishu/Lark missing) | C tapping a call; the person who just linked Feishu/Lark. 不放心 → 放心 | §4 1–2, VERIFIED | 4 | 2 | 3 | 24 | S |
| 6 | **The List stands on its own** (views unreachable/undeletable, holders dropped, batch answer hides skips, phone has no bulk, B14, Keep merge) | H with 20–100 tasks: a saved view can vanish, one PR loses its authors, "ended 0" is silent. 吃力 → 好用 | §5, VERIFIED | 3 | 2 | 3 | 18 | S–M |
| 7 | **DingTalk and WeCom** (243 #5's rest) | C and H in China: their work chat is not reachable. 不顺 → 好用 | §0; `channels/` has no adapter | 3 | 2 | 2 | 12 | M each |
| 8 | **Settings' smaller leftovers** (import toast/retry/head, blank panes, 44pt links) | C and F: a removal that floats over the page, a fault with no retry, a control a thumb misses. 别扭 → 顺滑 | §4, VERIFIED | 2 | 2 | 3 | 12 | S |
| 9 | **Reach** (Windows/Linux desktop, the stores, the bare Mac) | F: the first hour on a machine Ducter doesn't ship for. 找不到 → 好用 | §0; `roadmap.md` | 5 | 1 | 2 | 10 | L |
| 10 | **The screen from the phone** (remote desktop, now with Linux clipboard) | H: checking what a Mac task is doing from a phone. 够不着 → 放心 | §8; 235 #9 | 5 | 1 | 2 | 10 | L |
| 11 | **People you deal with** (M4) | C and H: 「上次那个王律师叫什么」. 找不到 → 惊喜 | §3; Mem Labs | 3 | 2 | 1 | 6 | L |
| 12 | **The partner's identity, maintained by the system** (M7 birth draft) | C and F: a partner whose card grows from what Mem knows. 新鲜感 → 被认识 | `motivation.md`; `product-model.md` "later" | 3 | 2 | 1 | 6 | M |

Close behind, not ranked: the GitHub description and social preview are built but not uploaded
(D641/D648 — the author's ten minutes); the `bridge follow` shape is still unread and `check_claims`
unused (M2, unmeasured); a per-window usage line (todo); the draft across devices; and the partner's
eval on Codex (235 #3 still only haiku).

**Why #1 over #2.** #1 is a lie in the permanent record plus a duplicate that costs attention; it is
code-only, continues D647/D660, and can be proved on a fixture of hel's day. #2 is the larger
ambition, but its first step is a review surface and a label store, and it cannot be promoted until
the person has used it for a week. Trust first, then surprise.

**Why #3 has no brief.** It needs the author's home and server (the live checks, a real day, the
release's full eval), not a branch. It stays where 235 and 243 put it, and it is the first thing the
author should run after this release.

## 10. Briefs

### Brief A (#1): a claim waits for its call, and information stays in the card

- **Who.** The heavy developer whose group review posted some comments and failed on others; the
  consumer whose merged-PR summary re-says a merge the card already showed; anyone who saw
  「已回复你」 over a message that answered the person, not the agent.
- **Felt before.** 不放心 and 累: a card in the scroll says comments went out that did not, and the
  same result arrives twice.
- **Felt after.** 放心 and 顺滑: the record names only what went out, the failures are named with the
  one way to retry, and one piece of work is said once, in its card.
- **Rules to build.**
  1. **Write first, then record.** `reviewSend`
     (`packages/core/src/task-sources/handover.ts`) posts every item, then logs one `decision` whose
     `record` names only the items whose comment really went out and whose `src.items` keeps the exact
     text for each; the failed items are a `failed` list, said in one line with **再试一次 / Try
     again**, not hidden behind a toast. A total failure logs no record, only the failed line. The
     decision is resolved after the writes, never before.
  2. **Information folds into the subject card.** Add `info` to `SubjectCard`
     (`packages/protocol/src/subject.ts`) and route the remaining information-only producers through
     it: the merged-PR summary (`packages/core/src/holdings.ts`), a routine's first-run cost
     (`routines.ts`), the first-use "PR opened" (`core.ts`), a loop revived after a restart
     (`loops.ts`), a backed-off wait (`work.ts`), and "commented then started" (`handover.ts`). The
     merged summary names each PR and rides the card of each holder it names, so it can never re-say
     a merge; the card's newest line is the one the row shows. No new `ai_msg` for any of these.
  3. **A line's origin follows its `replyTo`.** `spokenPeers` (web `apps/web/src/mem-view.ts`; Mac
     `views/peers_d470.go`) attaches 从{who}来的 only to the message whose `replyTo` is that request;
     a later message for the person carries no origin. Keep the local-traffic rule unchanged.
  4. **A question keeps its object.** Extend `keepsPoints` (`packages/protocol/src/ask-words.ts`): if
     the card's question has an object in words (the task's title, the to-do's title, a `#ref`), the
     partner's words must name that object or the card keeps its own question; a one-point question
     is covered by the same check, not only the numbered ones.
- **Files.** `packages/core/src/{task-sources/handover,holdings,routines,core,loops,work,subjects}.ts`;
  `packages/protocol/src/{subject,ask-words,index}.ts`; `packages/partner/src/{render,partner}.ts`;
  `apps/web/src/{store,subjects,mem-view}.tsx`; `apps/desktop/internal/{store,views/{subjectcard,peers_d470}.go}`;
  the fakes; `design/{conversation,task-sources,subject}.md`; `docs/getting-started.md`.
- **Tests.** A fixture of hel's day: a group review of three items with one failed write → the record
  names two, the failed line names one, and a total failure leaves no record; a merged PR the card
  already reported → no new `ai_msg`; a routine's first run and a revived loop → a card `info`, not a
  line; a message answering the person → no origin line; a one-point question whose object is dropped
  → the card keeps its question. A second, unlike shape (Obsidian on one Mac). Web and Mac view tests,
  zh/en; a D175 eval only if a persona or partner-tool text changes (none of these rules should; the
  lead checks `tool-budget`).
- **Done.** No record claims a write that failed; the six producers create no information-only
  `ai_msg` in the fixture; no origin line mislabels; the D175 run's Regressions are read; shots per
  the UI bar.

### Brief B (#2): the shadow gets a verdict

- **Who.** The author, who can already read `ducter proactive cross` and `ducter proactive week` but
  cannot say which findings were right; the consumer, who will meet the promoted find one morning.
- **Felt before.** 惊喜 missing: the product's defining moment is a shadow pass and a count, and the
  promotion waits on a labelled week nobody has a place to make.
- **Felt after.** 惊喜 earned: once a week, one quiet card says what Ducter noticed and did not say,
  the person answers 应该早说 / 不该说, and the verdicts decide what Ducter may say next time.
- **Rules to build.**
  1. **A review, not a message.** A `shadow_review` card offered once a week by the morning note — and the
     same list in `ducter proactive week`; one place, D296's grammar, not a second Settings pane —
     lists each `shadow_finds` entry with its words, its facts (the two sources, the day, what it
     joined), and what it would have said. Two labels:
     **应该早说 / Should have said it** and **不该说 / Shouldn't have said it**, plus **这类以后都别标 /
     Stop asking about this kind** (a rule). It is a default-hold, fading card, never needs-you, never
     a notification, and nothing is sent.
  2. **The verdicts are kept, once.** A `shadow_label` frame and a `shadow_labels` Log event
     `{runId, findingId, verdict, at}`; the CLI gains `ducter proactive review [--week]` to print the
     same list and `--label id=yes|no` to write the same store; `ducter proactive week` reads the
     labels.
  3. **The gate is code.** A `promoteShadow` function reads the labels and offers a `shadow_only`
     finding as a real find only when, on the labelled set, shadow plus detectors find more of what
     mattered than the detectors alone and shadow's precision is at least theirs; a retired detector
     needs two labelled weeks. The model never decides the gate; a test pins both answers on a
     fixture of the 21 written ledgers plus a second, unlike one, with hand-written labels.
  4. **Nothing changes before the gate.** `said` finds keep the detectors; no shadow find becomes an
     `ai_msg`, a need or a task; the card's own labels are the only new surface.
- **Files.** `packages/core/src/proactive/{cross,week,engine}.ts` and a new `shadow-review.ts`;
  `packages/cli/src/proactive-cmd.ts`; `packages/protocol/src/index.ts` (the card and the frame);
  `packages/core/src/{core,ws}.ts`; the morning note's view (`apps/web/src/views.tsx`,
  `apps/desktop/internal/views`); `design/{connectors,decisions}.md`; `docs/`.
- **Tests.** `shadow-review.test.ts`: a week of six findings → the card lists six, two labels land in
  the Log, the same label twice is one; the gate promotes on a fixture where shadow finds two more of
  what mattered at equal precision, refuses when precision is lower, refuses with no labels; the CLI
  and the card read the same store; no `ai_msg` or task is created. A D175 eval if the card is the
  partner's words (it is code's words, so likely not).
- **Done.** The author can label a real week in the product or the CLI; the gate's decision is
  reproducible from the Log; no shadow finding is said before the gate passes; `ducter proactive week` shows
  the labels and the counts.

### Brief C (#4): Mem's no reaches the person

- **Who.** The consumer who says 别记这个 and believes it; the developer whose workspace Mem just
  opened Bridge to and meets a raw code; the person who taps 去 Nowledge Mem 看 and lands on the
  website.
- **Felt before.** 被骗 and 看不懂: the partner says 不记了 while the Noted line still says 记下了 and
  Mem still has it; the first Bridge screen is
  `Nowledge Mem: policy_invalid`; the count opens a marketing page.
- **Felt after.** 放心: the intent is still taken back at once, but a refusal is said in the partner's
  words and reaches the partner; no code is ever the line; the app opens where Mem lives.
- **Rules to build.**
  1. **The spoken take-back keeps its speed and gains its truth.** `takeBackAtOnce`
     (`packages/core/src/mem-takeback.ts`) still sets `heardFrom` at once and calls `settings.undo`,
     but a failed `undo` records `memory.undo.failed` for that seq and draws it in the failed ink on
     the Noted line (`memory.undo.failed` exists; wire it to the spoken seq, not only the tap); the
     partner's next turn gets one fact, `[the memory was not taken back]`, so it stops saying 不记了;
     the Log's `memory_feedback` carries `sent:false, failed:true`. A successful take-back is
     unchanged (immediate, no wait).
  2. **No Mem code in a line.** `bridge-link.ts` carries the code as its own `BridgeView.code`, never
     `detail: Nowledge Mem: ${code}`; add the `cloud_bridge_setup_policy_invalid` family to
     `REFUSALS` with one line (「这个 Nowledge Mem 工作区还没让这台电脑收发消息」) and at most one
     action; the stuck-mailbox row drops `(%s)` and puts the code behind 详情. A test asserts no pane
     line in either language contains `cloud_bridge_setup_`, `policy_invalid`, or `(%s)`.
  3. **The app link opens the app.** `memWhere` (`apps/web/src/memory.tsx`) already knows `local`,
     `server` and `cloud`; 去 Nowledge Mem 看 uses `openMem()` when Mem is local, names the computer
     when it is a server, and the site only for `cloud`. The Mac does the same.
- **Files.** `packages/core/src/{mem-takeback,settings,bridge-link,ws}.ts`;
  `packages/protocol/src/index.ts`; `packages/partner/src/{partner,render}.ts` (the fact; D175 if the
  persona line changes); `apps/web/src/{memory,views,i18n,i18n-memory}.tsx`; Mac
  `views/{quiet,peers,memory_pane}.go` and `i18n`; `design/{memory,bridge}.md`; `docs/settings.md`.
- **Tests.** Fake nmem refuses a spoken undo → the Noted line is failed, the partner's next turn has
  the fact, no 不记了; a success → the immediate line, no failed ink; an unknown Bridge code → the
  generic line, code behind 详情; `policy_invalid` → the new line; local Mem → the app, cloud → the
  site; zh/en contain no Mem code in the line; a D175 eval if the partner's fact is persona text.
- **Done.** No Mem failure is silent; no code is a line; the app link opens the app; the D175
  Regressions are read.

### Brief D (#5): a connection says what is true

- **Who.** The consumer tapping a call from a phone; the person who just linked Feishu / Lark and
  looks at Overview or the Chat apps head; the person removing an Import source.
- **Felt before.** 不放心: **能打电话了** while Tuwa is unreachable; **也能找我** omits the app they just
  linked; a removal floats over the page as a toast.
- **Felt after.** 放心 and 顺滑: a connection that cannot work says so with its fix, every linked app is
  named, and a change says its word where it happened.
- **Rules to build.**
  1. **One readiness table for calls.** Web `PhoneCard` (`apps/web/src/phone.tsx`) treats every
     not-ready `ConnectionView.state` (`unauthorized`, `unreachable`, and any future one) as not
     ready: the Mac's `sourceDown` (`accounts.go`) already covers both; **现在连不上 Tuwa / Can't reach
     Tuwa right now** in the failed ink with **再试一次** for unreachable and **重新登录** for
     unauthorized; today's count only when ready. One action, never a ready state with no call.
  2. **One table of chat apps.** `settings_home.go`'s `chatsSay` and `homeReach` read a shared
     kind→name table (`wechat`, `telegram`, `slack`, `feishu`), the same as the web's
     `channels.tsx`; Feishu / Lark is named in the Chat apps head and in Overview's **也能找我**.
     No per-kind switch can drift again.
  3. **Import says it where it happened.** The web's removal is a quiet line under the sources (D296,
     no toast); any non-ready source (`needs_signin`, `unauthorized`, `missing`) has **再试一次**,
     not only `failed`; the Mac's Import head is the state (`importsSay`), not the purpose. The two
     touch controls under 44 at 390 (`.qlink` **用地址和密钥添加**, **怎么连**; the device rename)
     get their 44 box.
  4. **Tests over the tables, not one happy path.** A table-driven web test over every
     `ConnectionView.state` and every linked chat kind; the Mac's matching view test; a table for
     the import states; a 390 geometry test for the two links; shots per the UI bar.
- **Files.** `apps/web/src/{phone,accounts,channels,imports,views}.tsx` and `app.css`;
  `apps/desktop/internal/views/{phone,accounts,settings_home,imports}.go`; both i18n tables;
  `design/{settings,channels}.md`; `docs/settings.md`.
- **Tests.** The state table above; a fake connection that is unreachable shows the failed line and
  no today count; Feishu linked shows in both places; a signed-out import source has 再试一次; a
  removal is a line, not a toast; the 44 boxes at 390; shots.
- **Done.** No pane says ready when it can't; every linked app is named in both places; a removal or
  a fault says its word where it happened; the lead has reviewed the shots.

## Implications for Ducter

1. The release settled the truth of the work: one state, one card, one holder, one project, one
   word after a change. The next lies are smaller and more dangerous because they are in the
   permanent record: a group review that says it commented, a spoken take-back that says it forgot,
   a connection that says it can call. Fix those before adding a surface.
2. The three areas the author named have converged: Settings is two wrong-state bugs and a handful of
   polish items; Mem is deep and the rest is Mem's own (a feedback verb, the identity graph, skills);
   Bridge has no new CLI and Ducter's own half is built. The work left in them is small and exact,
   not a redesign.
3. The aha is the one big thing still unbuilt, and its block is not the model: it is that the person
   has no place to judge what the shadow noticed. A review card plus a label store plus a code gate
   would turn the motivation's defining promise into a loop the person can run in a week. Do not say
   a shadow find before the gate passes.
4. Proof is still the first thing the author's home should run: the live checks, a second real day of
   the conversation, and the release's own full eval. The code has never been the bottleneck.
5. The List's leftovers are real but small; a builder with one repository can save a view and never
   find it, which is worse than not having views. Either draw views where the List is, or stop
   offering Save until they are reachable.
6. Reach and remote desktop are where the references now lead; they are the price of the consumer and
   the phone-heavy developer, not of the core.
7. People and the partner's own identity are the right next depth on Mem, but both wait on Mem's graph
   leaving Labs; building a second store now would be the wrong kind of ambition.

**Summary.** Since research/243, Ducter shipped 0.1.99–0.1.101 and has 0.1.102 in its release eval:
the hand-over answers at once, Settings and Mem's states tell the truth, tasks and Keeps derive one
state, one project per repository, the List for builders, imports from another app, a correction that
sticks, and all ten of research/244's conversation rules. Round 5's eight are four built and four open
(the live checks, DingTalk/WeCom, reach and the bare Mac, people). nmem is still 0.10.125, so Bridge's
next move is one real `follow` read and a message to Mem, not a branch. The highest-priority unbuilt
things are the two lies left in the record (Brief A, and the spoken take-back in Brief C), the raw
Mem codes and the app link (Brief C), the aha without a judge (Brief B), and the two Settings
connections that say the wrong thing (Brief D). The rest is proof, reach, and the List's small leftovers.
