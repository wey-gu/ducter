# 243 · Gap analysis, round 5: Nowledge Mem and Bridge after 0.10.125, memory as felt, and Settings

Date: 2026-11-27, on `dsh-handgo` at `ddb2cf238` (0.1.98). Follows research/235 (round 4, 0.1.84) and the
author's standing ask: compare Ducter against the reference projects and `motivation.md`, and find the
high-priority things not yet built. This round the author named three areas: Nowledge Bridge's new progress,
the depth of the Nowledge Mem integration and how it feels, and the Settings panes' flow and look.

Read: `AGENTS.md`, `motivation.md`, research/235 and its private notes, `design/decisions.md` D588–D637 (each
entry's heading and first lines), `design/bridge.md`, `design/handoff.md`, `design/memory.md`,
`design/settings.md`, `design/todo.md` (the Mem and Bridge items), and the code named below. Nowledge Mem:
`nmem --help` and per-verb `--help` of the installed **nmem 0.10.125** (help only; nothing was sent, registered,
connected or written, and no call reached Mem's backend), the Mem MCP tools' own descriptions as this session
lists them (read, never called), Mem's public docs index (mem.nowledge.co/docs), and Mem's issue tracker
(read only; Mem is closed source, so only concepts and interfaces are described here; issue numbers are in
`research/private/243-gap-notes.md`). Outside repos, cloned fresh with `--depth 1` into the session scratchpad
and read only, never run: Raft (`botiverse/raft-source`, unchanged since research/235's commit), **the open
agent app** (research/235's name for it, at a newer head) and **its official plugin catalogue** (public);
commits in the private notes. Settings was read from code by a read-only sub-audit and spot-checked by hand;
no screenshots (another worker does visual polish).

Tags: **VERIFIED** = read in code, help text or a doc at the commit or version named; **DOCUMENTED** = a
product's own page, README or tracker; **INFERRED** = judgment.

## 0. Where research/235's ten stand (VERIFIED in `decisions.md`)

| 235 # | Now |
|---|---|
| 1 proof: the owed live checks | **Still open.** `todo.md` has one "Seen live:" string, and it is the template's example (line 7) |
| 2 what the work used | **Built** (D588 CLI, D591 Overview tray, the limit card's line, the partner's `usage` tool) |
| 3 a doorbell for standing work | **Built with fakes** (D620) |
| 4 `ducter move` beyond the plan | **Built with fakes** (D621 encrypted bundle and receive, D627 freeze and send over one connection); never tried between two real computers |
| 5 Feishu / DingTalk / WeCom | Feishu / Lark **built with fakes** (D622); DingTalk and WeCom open |
| 6 reach (store apps, Windows, Linux desktop) | Open (accounts, signing) |
| 7 the bare-Mac first hour | Open (author) |
| 8 plugin breadth (an MCP Apps host) | Open |
| 9 the screen from the phone | Open |
| 10 the second-day recap | **Built** (D623, its eval scenarios in the 2026-11-27 run) |

Also shipped since 235 and relevant here: D590 (Mem out of reach is never "I forgot"), D595 and D619 (Bridge
after 0.10.124; read states beside a sent message), D604 (a helper's Spaces), D609/D614/D616/D628/D633 (a
hand-off as a record that settles by itself), D617 (what a task was given from memory, with 这条不对), D618
and D626 (Settings passes), D597 (Mem plugin updates by command).

## 1. Nowledge Mem and Bridge: what is new, and what Ducter doesn't use

### 1.1 Ducter's current use (VERIFIED, `grep` over `packages/{core,partner,runner}/src`)

Ducter calls: `m search/list/show/add/update/supersede/archive/forget`, `t search`, `t save` (runner, D417),
`working-memory read`, `context --no-ensure`, `rules list/upsert`, `feed --type flag_contradiction`,
`feed reviews`, `feed resolve`, `artifacts list/add/update/folders/history` (D566), `agents enroll/set/show/
context`, `resources get`, `connect --skip-tools`, `doctor`, `plugins inspect/check`, and Bridge's `setup`,
`connections`, `contacts`, `inbox`, `open`, `send`, `reply`, `outbox`, `inspect`, `resume`, `notices status`.
The task relay (`core/src/mem-relay.ts`) passes Mem's data paths for tasks elsewhere but calls none itself.

### 1.2 What 0.10.125 and Mem's tools offer that Ducter doesn't use

| # | Capability | Evidence | Ducter today | The person's moment it would serve |
|---|---|---|---|---|
| B1 | **`bridge follow <operation>`**: "Follow one original in its exact Space without opening or acknowledging mail", `--wait` ≤ 30 s, `--max-pages`, a cursor, `--repair-return-route` | VERIFIED (help, 0.10.125); not in research/237's verb list, so new since 0.10.124 (INFERRED) | Replies are found by scanning the whole identity inbox (first page ≈5 s, `incomplete: true`, research/237 #6) | A Ducter task asked the person's Codex a question and waits for that one answer; today the answer rides a full inbox scan and a task-side "never answered" is not built (`bridge.md` "Not yet") |
| B2 | **`--return-host claude-code|codex`** on every verb: "Return correlated Bridge replies to the invoking integration's native session" | VERIFIED (help) | Not used; D494 keeps the home as the one receiver | Little for Ducter while the home receives for every task (D494 stands); noted so nobody adopts it by accident |
| B3 | **Named native sessions**: give a Codex or Claude Code window a name, find it by name in a Space and, opt-in, across the caller's Spaces; send to that exact window; rename, restart, expiry and a namesake never take over its mail | DOCUMENTED (Mem tracker: named sessions implemented server-side and in CI; cross-Space find closed 2026-11-27). VERIFIED: 0.10.125's `bridge session … prepare` has **no name option** | The partner reaches "your Codex" (an agent identity) or a helper (D494, Ducter's own named address); never "that window" | 「问问我终端里叫 review 的那个 Claude」: the heavy developer with three Claude Code windows open wants the one that holds the context (`bridge.md` J4, S2). Gated on a CLI that exposes names |
| B4 | **Shared documents and `collab`**: `send/reply --shared-document`; `collab create/join/read/edit/sync` (a plan or note with a local replica) | VERIFIED (help, unchanged since research/183 #7–8); the MCP `bridge_im` carries a `shared_document` ref with scope and generation | A hand-off's item is `pr|issue|task|text` (`handoff.md` §3) | Handing a plan, not a paragraph, to a helper or a teammate's agent, both editing one copy. Shape unread, research/183's verdict stands |
| B5 | **Cross-workspace Bridge**: Mem's owner asked (2026-11-27) for Bridge in every Personal and Team workspace, existing and future; `cloud_bridge_setup_policy_invalid` seen on 0.10.124 and 0.10.125 | DOCUMENTED (Mem tracker, open) | Ducter already reads Mem's refusal codes (`bridge.refused.*`) | The consumer and the fresh user, whose account was never in the pilot, will soon meet Bridge at all; the Agent messaging pane's first-time words must be ready for people who never asked for it (see §3) |
| B6 | **`nmem mcp` (stdio)** so plugins follow Mem when it moves to Cloud instead of a fixed `127.0.0.1:14242/mcp` | DOCUMENTED (merged upstream); VERIFIED not in 0.10.125 (`nmem mcp` unrecognized) | Tasks elsewhere reach Mem through the relay's CLI paths (D393); Codex's plugin isn't carried elsewhere | Later: when Mem's plugins switch to stdio, the relay's `NMEM_API_URL` covers their MCP too; re-check D393's "Codex's plugin" item then |
| M1 | **`memory_feedback`** (helpful / not helpful, with a note) | VERIFIED: an MCP tool; **no CLI verb** (`nmem m --help` lists none) | 这条不对 (D617) and the Memory page's 改 / 忘掉 never tell Mem a recall was wrong | The person says a memory is wrong; Mem keeps ranking it first for every other tool |
| M2 | **`check_claims`**: "neutral draft diffs" of a text against memories, with `review_required` | VERIFIED (MCP description only); no CLI verb found | Not used | A task's report contradicts what the person said last week ("the weekly report goes to the product group"); INFERRED value, unmeasured |
| M3 | **History of a memory**: `graph evolves`, `memories evolves`, `memory_evolves_revise` (keep one, keep both linked, unrelated; dry run then `plan_id`) | VERIFIED (help, MCP description) | D465 settles Mem's contradiction reviews; the history behind a memory is never shown | "Why does it think this?": what this memory replaced and when |
| M4 | **People**: `memories identity` (profiles, evidence, a human `correct` with reviewed tokens; `draft-cards`/`save-card` are a Labs feature) | VERIFIED (help) | `memory.md`: "People and projects are not groups yet" (trigger in `todo.md`) | 「上次跟我聊合同的那个王律师叫什么」; the open agent app's plugin catalogue now has a contacts plugin that builds person profiles from mail, calendar and chat (DOCUMENTED) |
| M5 | **Mem's upkeep**: `feed catchup --horizon today|3|7|off` (Memory Health catch-up); `rules review` (ask Mem for draft rules) | VERIFIED (help) | Neither; D465 shows Mem's contradictions and learned rules only | The developer whose Mem has tens of thousands of unresolved feed events (research/202 §3) never learns Mem is behind. The open agent app moved memory tidying to one weekly pass with a frequency choice and 立即整理 in Settings › Memory (DOCUMENTED) |
| M6 | **Skills**: `skills match <task>`, `report_skill_outcome`, `find_skills`, `skills sharpen/refine/eval` | VERIFIED (help); whether `match` still answers 404 on Cloud is **not verified** (no backend call this round; 404 on 0.10.122, research/202) | `todo.md`: "`skills match` in a task's brief", trigger: it answers | A task starts with the person's own proven way of doing it, and tells Mem how it went |
| M7 | **`identity_birth_draft`**: "Draft a grounded AI identity without saving it" from self, a member or a Space | VERIFIED (MCP description); no CLI verb found | `product-model.md`: "Mem's birth-draft flow is later" | A second partner, or the first meeting of a person who already has Mem: a partner whose card is drafted from what Mem knows (motivation: "its identity … maintained by the system itself") |
| M8 | **`working-memory edit/patch`** | VERIFIED (help) | Read only (D368) | The person corrects today's focus ("这周不弄 release 了"); low reach |

Public docs: mem.nowledge.co/docs has no Bridge, changelog or identity page (DOCUMENTED absence, read
2026-11-27); the only public setup source remains `SKILL.md`.

### 1.3 Verdict on Bridge (INFERRED)

Bridge's real progress this week is on Mem's side: named windows, a cross-Space find, Bridge for every
workspace. None is usable from the CLI Ducter ships against except `bridge follow`. Ducter's model already
matches where Mem is going (helpers are named addresses the home owns; hand-offs are records). The one
cheap adoption is B1 (follow one message's replies exactly). B3 is the one with the largest felt value and
should be adopted the day a CLI exposes the name; B5 means the Agent messaging pane will soon be met by
people who never asked for it, which is why its dead ends (§3) rank high.

## 2. Memory as the person feels it

What already holds (VERIFIED, `memory.md` and code): the inventory on Settings › 记忆 by kind, search, 改 and
忘掉; the Noted line with 别记这个; Mem's questions answered on the page (D465, D569); rules on with a turn-off;
Mem out of reach said as out of reach (D590); what a task was given, with 这条不对 (D617); Working Memory and
past conversations in the partner's context (D368); the morning note reading the focus (D444, D458).

The gaps, as moments:

- **A correction doesn't stick.** (VERIFIED) 这条不对 sends the partner a message naming the memory
  (`apps/web/src/app.ts` `correctMemory`); the partner's only write is `memory_add`, which supersedes an
  earlier memory only when it is the partner's own (`packages/partner/src/memory.ts` `sameAs`: skips any hit
  whose `source !== "ducter"`). A wrong memory written by Codex, Claude Code or Mem's own distiller stays live
  and keeps reaching every task and tool; a right one sits beside it. Mem is never told the recall was wrong
  (M1). And on the Memory page, 改 and 忘掉 say 「好，改成…」/「好，忘掉…」 **before** Mem answers
  (`apps/web/src/memory.tsx` `MemRow`, `say(...)` inside `save`), while core, on a refusal, only resends the
  frame (`packages/core/src/ws.ts` `mem_forget`/`mem_fix`): the row quietly comes back under a confirmation
  that never happened. That is the one place memory can lie to the person.
- **Mem's state is a dead end in places** (§3, Memory and Agent messaging).
- **People are not a thing** (M4), where the open agent app now sells exactly that.
- **Mem's own upkeep is invisible** (M5).
- `todo.md` leftovers still open: 「你都记得我些什么？」 leading to the list; one fix at Memory's head while
  signed out; a contradiction the partner itself meets; one live answer per kind on the author's Mem.
- **A principle drift, noted:** `core/src/mem-takeback.ts` (D444) still hears 别记这个 by a phrase list, against
  "model judges, code guards" (the author's rule); `todo.md` already lists it among regexes to retire.

## 3. Settings, pane by pane (from code; VERIFIED unless tagged)

Panes (`design/settings.md`; web `SettingsPage` in `apps/web/src/app.ts`): Overview, 伙伴 Partner, 通知
Notifications, 账号 Accounts, 聊天软件 Chat apps, 密码和银行卡 Passwords & cards, 外观和声音 / This phone,
在哪儿运行 Where it runs (with the Ducter folder, D611), 更新和关于 Updates and about, 记忆 Memory, Agent 通信
Agent messaging, 待办来源 To-do sources. On the web, Where it runs and Updates live inside the devices page;
the Mac has them as panes.

| Pane | Meets its walkthrough? |
|---|---|
| Notifications | Yes. `settings.md`'s "Not done" line about the web's browser time fields is stale: the web uses selects now (`views.tsx` `NotifySettings`). The four 发现了就说 choices still stack on a phone (admitted) |
| Accounts, Chat apps, Passwords & cards, This phone | Spot-checked only: removals ask first (`autofill.tsx`); the only English in zh is the apps' own button names quoted in setup steps. No verdict |
| Partner | Mostly; removing a rule has no confirm (`partner-story.tsx`) |
| Where it runs / Updates (web) | Smaller gap: the folder row has no picker and no Finder action (scoped to the Mac by design, INFERRED acceptable); 改成 ~/Ducter moves at once without asking (`folder-row.tsx`) |
| Memory, Agent messaging, Overview, To-do sources | **No**: below |

**The weakest four**, with concrete faults:

1. **Agent 通信 / Agent messaging** (`apps/web/src/memory.tsx` `PeersPage`, `PeersProblem`; Mac `peers_pane.go`)
   - `bridge.md`'s "identity never shown" rule is broken: the refusal lines put the identity's name into the
     sentence and send the person to "Mem 工作区的管理员" (`i18n.ts` `bridge.refused.authority_missing`,
     `custody_birth_missing`, `attachment_mismatch`, `control_denied`, `conflict`).
   - Dead ends with no action: `bridge.no_space` 「…只有你能看到的地方（Only me），所以没连。」 (English in zh,
     and nothing to do); `local_mem`; `mem_closed` when the home can't open the app.
   - Trust changes say nothing back: 改成先问你, 不再听它的 and 恢复 get no said line (only the main switch does).
   - Problems are a bold sentence glued to a newline, not a title and a line (the leftover D459/D589 admit).
   - Two daily caps in two units side by side (「每个一天最多 %d 条」 beside 「一天最多开 %d 个任务」); a
     missing task title renders 「我开了任务「…」」.
2. **记忆 / Memory, Mem's state** (`memory.tsx`, `mem-view.ts`, `i18n-memory.ts`)
   - The false confirmation of 改 and 忘掉 (§2).
   - Mem too old with no way to update it here: 「Nowledge Mem 的命令行太旧，说不出它好不好」 in the failed
     ink with no action; 命令行 is jargon. Out of reach: only 再看一次, no hint of why.
   - Signed out: the copy says 「设置 › Connectors 里重新生成连接提示」 while the first sign-in calls the same
     button 「生成连接链接并复制提示」 with "Any AI agent" in English: two names for one thing.
   - Signed out or out of reach with no glance cached: the head falls back to 「我还不太了解你 / 还没记下什么」
     (INFERRED from the fallback order): exactly the "I forgot you" feeling D590 removed from the conversation.
   - Copy that overclaims or contradicts: 「Nowledge Mem 是一个免费的记忆工具，跑在你自己的电脑上」 beside a
     Cloud option and an account step; Overview's 「你说过的都在 Nowledge Mem 里」.
3. **Overview** (`settings-home.tsx`)
   - Mem closed reads 「还没连上 Nowledge Mem」 (`homeMem` falls to `home.mem.none`): Mem is set up, only closed.
   - Mem too old and every Agent messaging problem are never a need on Overview, while their panes show the
     failed ink: the summary is calm while a pane is red.
4. **待办来源 / To-do sources** (`todos.tsx`)
   - 新的来了 → take (it starts tasks by itself) and 做完以后 changes get no partner word, though D296 gives a
     consequential change one; 移除 asks first but says nothing after and not what happens to tasks already
     tied to that source.
   - Errors are the raw `v.error` (INFERRED: often gh's English); the head 「可以加上」 reads mid-thought; Jira's
     「即将推出」 is a row with nothing to do.

## 4. The references, this round

- **Raft**: unchanged since research/235's commit; its onboarding agent's Day-2 recap is built in Ducter (D623).
- **The open agent app** (newer head): new product rules since 235 that Ducter lacks or matches:
  usage-limit auto-continue (Ducter has it, D297), lock-screen answers (Ducter has Go, Hold and Reply on iOS,
  `apps/ios/Ducter/Push.swift`), a task inbox (Ducter's 待你处理), goal mode (D511's judged goal), plugin event
  triggers (D620), subscription sharing with other users (not in Ducter; terms risk, not ranked), and **a weekly
  memory tidy with a frequency and 立即整理 in Settings › Memory** (M5's moment).
- **Its plugin catalogue** (public): mail over IMAP for 163, QQ, iCloud, Yahoo and Outlook; GitHub, GitLab,
  Gitea; Notion; Google's four; ntfy; a terminal-workspace plugin (tmux); a decision gate that picks a model
  per task; **a contacts plugin that remembers everyone the person dealt with** (M4's moment). Ducter covers
  most through oo/OpenConnector and the partner; the people memory is the one that is a different idea.

## 5. The top eight, ranked

Score as in research/201, 218 and 235: impact (1–5) × reach (which of the three users, 1–3) × cost (3 = a
branch with fakes, 2 = needs one of the author's devices or accounts, 1 = gated on others or a person's
judgment). Size: S ≤ a day, M ≤ three days, L more.

| # | Gap | Hurts | Evidence | I | R | C | Score | Size |
|---|---|---|---|---|---|---|---|---|
| 1 | **A correction that sticks**: 这条不对 and 改/忘掉 change the memory everyone reads, and never say done before Mem did | the heavy developer and the consumer with Mem (a wrong preference followed by every task) | §2, VERIFIED | 4 | 2 | 3 | 24 | S–M |
| 2 | **Proof: the owed live checks** (unchanged from 235 #1) | all three, through trust | §0, VERIFIED | 4 | 3 | 2 | 24 | S |
| 3 | **Mem's state is never a dead end** on Memory, Agent messaging and Overview | consumer and fresh user meeting Bridge as Mem opens it to every workspace (B5); the developer whose Mem is old or closed | §3 1–3, VERIFIED | 3 | 2 | 3 | 18 | S–M |
| 4 | **A consequential change says what it did** (To-do sources take/remove, Agent messaging trust and mute, a Partner rule's removal, the folder move) | consumer and developer | §3 4 and table, VERIFIED | 2 | 2 | 3 | 12 | S |
| 5 | **DingTalk and WeCom** (235 #5's rest) | consumer and developer in China | D622 pattern, VERIFIED | 3 | 2 | 2 | 12 | M each |
| 6 | **Reach and the bare-Mac first hour** (235 #6, #7) | fresh user | §0 | 5 | 1 | 2 | 10 | L |
| 7 | **A task's question that's never answered is held and said**, reading replies by `bridge follow` where nmem has it | heavy developer whose tasks ask other agents | B1; `bridge.md` "Not yet", VERIFIED | 3 | 1 | 3 | 9 | M |
| 8 | **People you deal with** as a kind of memory (Mem's identity graph; the reference's contacts plugin) | consumer, developer | M4, VERIFIED help; Labs-gated | 3 | 2 | 1 | 6 | L |

Close behind, not ranked: Mem's upkeep said and started from Memory (M5; 2×1×3 = 6, S); `skills match` in a
task's brief (M6; unverified on Cloud); named windows (B3; 4×1×1, gated on the CLI); a memory's history (M3).

Why #1 ranks over the rest: memory is the one surface whose whole value is trust, and §2 found the two places
it can mislead: a wrong memory from another tool that no correction removes, and a page that says it changed
something it didn't. Both are code-only fixes over a fake nmem. #2 stays where 235 put it, but it needs the
author's server, so it has no brief here. Briefs follow for #1, #3, #4 and #7: the four that a code agent with
fakes can build without the author's devices, and the ones inside the three areas the author named (#5, the
next chat app, follows D622's own brief and needs a tenant for its live check).

## 6. Briefs

### Brief A (#1): a correction that sticks

- **Who.** The heavy developer whose Codex once saved "deploy on Fridays is fine" and whose tasks keep
  acting on it; the consumer whose distilled preference is wrong ("prefers window seats"). The fresh user never
  meets it (no Mem).
- **Felt before.** 不放心: they tapped 这条不对 or 改, heard 好, and the next task still knew the old thing; or the
  page said 好，忘掉 while Mem refused.
- **Felt after.** 放心: what they corrected is what every tool reads next; when Mem didn't take it, the page says
  so in the partner's word and offers the one way through.
- **Rules to build.**
  1. **Said after Mem answers.** The Memory page's 改 and 忘掉 show the said line only on the core's success
     answer (a new `mem_done {id, op, ok, why?}` frame, or the existing settings frame carrying the result);
     a refusal shows one line in the failed ink, D590's words for why (signed out, out of reach, refused), and
     the row as it was. Web `memory.tsx` and Mac `memory_pane.go` together.
  2. **The wrong one is retired, whoever wrote it.** When the person corrects a memory by id (这条不对 →
     the partner, or 改 on the page), the replacement supersedes **that id** (`m supersede <old> <new>`), not only
     the partner's own earlier memory. 忘掉 stays archive (never delete). The partner's tool gains no new tool:
     `memory_add` takes an optional `replaces: <id>` that code honours only when that id was named by the
     person's own tap in this turn (code guards; the model words). This changes a partner tool's schema, so a
     D175 eval is owed, with two scenarios (zh, en): a Codex-written wrong preference corrected from a task's
     带进来 line, and a refusal.
  3. **Mem hears it was wrong, when it can.** If the nmem in use has a feedback verb, send not-helpful with the
     person's words as the note; today it has none (M1 is MCP-only), so the branch records the intent in the
     Log and leaves a `todo.md` item with the trigger "nmem gains `m feedback`" and an ask for Mem in
     `research/private/`. Never call Mem's MCP or REST directly from core.
- **Files.** `apps/web/src/memory.tsx`, `apps/web/src/app.ts` (`correctMemory`), `apps/web/src/i18n-memory.ts`;
  `packages/core/src/ws.ts` (`mem_forget`/`mem_fix`), `packages/core/src/settings*` (forgetMem/fixMem results);
  `packages/partner/src/memory.ts` (`add` with `replaces`), the partner's tool schema; `packages/protocol`
  (the frame); Mac `apps/desktop/internal/views/memory_pane.go`; `design/memory.md`, `docs/settings.md`.
- **Tests.** Core: a refused fix answers `ok: false` with why, and no glance change; web: no said line before
  the answer, the failed line after a refusal (`apps/web/test/`); partner: `replaces` honoured only for an id
  named this turn, ignored otherwise; the fake nmem records `m supersede <codex-id> <new>`; Mac view test for
  the failed line at 1150 in zh and en; the D175 eval with the two new scenarios; shots per the UI bar.
- **Done.** A memory written by another tool and corrected from a task's line is superseded in the fake Mem;
  the page never says 好 for a refused change; the eval's Regressions read; shots reviewed by the lead.

### Brief B (#3): Mem's state is never a dead end

- **Who.** The consumer whose workspace Mem just opened Bridge to (B5) and who meets Agent messaging for the
  first time; the developer whose Mem app is closed or whose nmem is old; the fresh user, who should see
  nothing alarming.
- **Felt before.** 不放心 and 找不到: a red sentence naming an identity, a workspace admin, "Only me", or 命令行太旧
  with no button; Overview calm while the pane is red, or saying 还没连上 when Mem is only closed.
- **Felt after.** 好用: every state has exactly one way through or says plainly that nothing is needed; the
  same state is said the same on Overview and the pane.
- **Rules to build.**
  1. One table of Mem states → (Overview line, pane line, the one action) in `mem-view.ts`, used by Overview,
     Memory and Agent messaging on both clients: signed out → the sign-in field (one name for the button,
     zh without English); closed → 「Nowledge Mem 没开着」 with 打开 (the Mac) or the computer it lives on;
     out of reach → 再看一次 plus the one reason the home knows; too old → 更新 when the home can run it
     (D225's path), else which computer to update it on; never 命令行.
  2. The Bridge refusals say what the person can do in their own words; the identity's name and "workspace
     admin" move behind 详情 (`bridge.md` "Simple, by who"); `no_space` offers the Space choice in place
     (D480's control) instead of stopping; `local_mem` and `mem_closed` get rule 1's lines.
  3. Overview's needs include Mem too old and any Agent messaging problem that stops the partner hearing from
     the person's agents; Mem closed is never 还没连上.
  4. With Mem out of reach and nothing cached, the Memory head says Mem is out of reach (D590's line), never
     「我还不太了解你」.
  5. Problems render as a title and a line (the shared pieces), not a bold sentence with a newline.
- **Files.** `apps/web/src/{mem-view.ts,memory.tsx,settings-home.tsx,i18n.ts,i18n-memory.ts,i18n-settings.ts}`;
  Mac `apps/desktop/internal/views/{memory_pane.go,peers_pane.go,settings_home.go}` and `internal/i18n`;
  `design/settings.md`, `design/memory.md`, `design/bridge.md` (the state table), `docs/settings.md`.
- **Tests.** A table-driven web test over every state (signed out, closed, out of reach, old with and without
  a way to update, each `bridge.refused.*`, `no_space`, `local_mem`) asserting one action or none and no
  identity name outside 详情; an i18n test that no zh string in these files carries Latin words other than
  product names; Overview's needs for the same states; Mac view tests at 1150 and 1400; geometry at 390 and
  1000; shots per the UI bar.
- **Done.** Every Mem state on the three panes has its line and at most one action, the same on both clients;
  the lead has reviewed the shots.

### Brief C (#4): a consequential change says what it did

- **Who.** The consumer who switched 新的来了 to take and didn't know tasks would now start by themselves; the
  developer who muted a teammate's agent; anyone who removed a To-do source with tasks tied to it.
- **Felt before.** 不放心: a change that will act on its own, with no word; a removal that doesn't say what
  happens to what's already there.
- **Felt after.** 顺滑 and 放心: one partner word after each consequential change, as D296 promises, and a
  removal that says what stays.
- **Rules to build.**
  1. D296's said line (`say` / `Said`, `saidLine`) after: To-do sources' 新的来了 and 做完以后; Agent
     messaging's 改成先问你, 不再听它的 and 恢复; a Partner rule removed; the Ducter folder moved. The words are
     what will now happen ("新来的待办我会直接开任务做"), never a confirmation of the tap.
  2. A rule's removal and 改成 ~/Ducter ask in place first (D289's confirm), like every other removal.
  3. To-do sources' 移除 says, before and after, what happens to tasks already tied to that source (they stay,
     unlinked, or whatever `task-sources.md` holds; read it, don't invent).
  4. To-do sources' errors are a sentence in the person's language with the source's own text behind 详情;
     the head reads whole (not 「可以加上」 alone); Jira's 即将推出 is a line, not a row.
- **Files.** `apps/web/src/{todos.tsx,memory.tsx (PeersPage),partner-story.tsx,folder-row.tsx,i18n*.ts}`; the
  Mac's matching views; `design/settings.md` (and the stale quiet-hours line in its "Not done"), `docs/`.
- **Tests.** Web: each change shows its said line once and only after the home's answer; the two new confirms;
  the removal's words; Mac view tests; shots.
- **Done.** Every change listed has its word on both clients; no consequential change is silent.

### Brief D (#7): a task's question that's never answered is held and said

- **Who.** The heavy developer whose task on pi asked the terminal Claude Code that handed it over a question
  (D448, D559) and whose terminal then stopped.
- **Felt before.** The task waits forever, or ends without the answer, and nobody says so; the partner's own
  follow-through (S3, D110) covers only the partner's messages.
- **Felt after.** 放心: the task's card says 「在等{who}回话」 while it waits; after the same windows S3 uses (2 h,
  only while the person is around, never in quiet hours, at most once), one line says the question is still
  unanswered and the task's choice (go on without it, or keep waiting); the answer is delivered when it comes.
- **Rules to build.**
  1. A task's sent `bridge_msg` (by: task) joins S3's follow-through with the same rules and the task's name in
     the line; one line covers a task's unanswered messages to the same agent.
  2. The task's wait is a wait record that settles when the answer arrives or the task ends (D633's one path,
     `holdings.ts`), never a timer that re-arms.
  3. **Reading the answer.** Keep the inbox path. Add `bridge follow <operation>` behind a capability check
     (nmem's help lists it) for messages a task sent, polled on the task's wait only; adopt its JSON only after
     the lead reads one real answer read-only and writes its fields into research (this branch's fake follows
     only the documented flags and falls back to the inbox when the shape differs).
- **Files.** `packages/partner/src/{bridge.ts,bridge-out.ts,bridge-relay.ts}`, `packages/core/src/{holdings.ts,
  keeps.ts or waits}`, the fake nmem, `design/bridge.md` ("Tasks Ducter carries messages for": move the item
  from Not yet), `todo.md`.
- **Tests.** Over the fake Bridge and a fake clock: a task's unanswered message yields one line after 2 h only
  while the person is around, none in quiet hours, none after the answer, none after the task ended; follow
  used when advertised, inbox otherwise; D559's live-trial script gains the case. If the partner's words or a
  tool change, the D175 eval.
- **Done.** S3's behaviour holds for a task's messages with fakes; the follow shape is either read and adopted
  or left behind its check with a `todo.md` trigger.

## Implications for Ducter

1. Memory's trust is broken in exactly two code paths (a correction that doesn't retire another tool's memory,
   and a page that says done before Mem did); fix them before adding any new memory surface.
2. Bridge's progress is on Mem's side and mostly not in the CLI yet; Ducter's helpers and hand-off records
   already match its direction. Adopt `bridge follow` behind a check now, named windows when the CLI has the
   name, and get Agent messaging's first-time and refusal states ready for people Mem is about to let in.
3. Ask Mem for a CLI verb for memory feedback (and for `check_claims` and the identity birth draft, if they are
   meant for apps): the feedback loop is MCP-only today.
4. Settings' remaining weakness is concentrated in the Mem-facing panes and in consequential changes that
   say nothing; the general panes have converged after D582–D626.
5. Proof is still the first thing the author's server should run; nothing here replaces it.
6. People as a kind of memory is the reference's newest idea worth matching; wait for Mem's identity graph to
   leave Labs rather than building a second store.
7. `settings.md`'s "Not done" line about the web's quiet-hours fields is stale; `mem-takeback.ts`'s phrase
   list is on the retire list against the "model judges, code guards" rule.

**Summary.** Since research/235, eight of its ten are built or built with fakes (the spend count, the doorbell,
the move, Feishu, the Day-2 recap); proof, reach and the bare Mac remain the author's. nmem 0.10.125 adds
`bridge follow` and a reply-routing flag; Mem's bigger Bridge news (named windows, cross-Space find, Bridge for
every workspace) is not in the CLI yet. The highest-priority unbuilt thing is a memory correction that sticks:
today a wrong memory from another tool survives 这条不对, and the Memory page confirms changes Mem refused.
Next are Mem's states as dead ends on Memory, Agent messaging and Overview, consequential Settings changes
that say nothing, and a task's unanswered question. Four briefs are written for those.
