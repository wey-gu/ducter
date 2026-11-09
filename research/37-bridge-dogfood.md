# 37 · Bridge dogfood: scenarios, a two-model spike, and rough edges

> 2026-11-09. Public. Follows `31-bridge-in-ducter.md` (and private `31`). Built from:
> - the author's real `nmem 0.10.116` connection, **read-only and passive commands only** (no context created,
>   no `--enable`, no send, nothing written to Mem or the local context store);
> - the `nowledge-mem` Claude Code plugin 0.7.34 `bridge` skill;
> - a spike on branch `bridge-spike` run end to end with real models on both sides of a **fake** Bridge CLI.
>
> Evidence (transcripts, raw CLI JSON) is in `~/dev/ducter-evidence/bridge/`, outside git. Identity references
> and Space ids from the author's account are not reproduced here.
>
> Tags:
> - **VERIFIED**: observed in this session (CLI output, a test, a live run).
> - **DOCUMENTED**: stated in CLI help or the skill.
> - **INFERRED**: my reading.

## 1. Bridge on the author's account today

| Observation | Tag |
|---|---|
| `nmem bridge setup` with no context answers `state: selection_needed` and lists 8 Spaces (1 personal, 1 commons, 1 default, 5 team). It says nothing about whether Bridge itself is on for the account. | VERIFIED |
| No named Agent Context exists for any obvious name (`ducter`, `ducter-main`, `terminal-claude`, `codex`, `test`, …). There is no command to list contexts: `agents context list` is "unrecognized subcommand". | VERIFIED |
| `bridge contacts --query ducter --all-spaces` (read-only; the CLI's own suggested next step) **exits 0** with `cards: []` and every one of the 8 Spaces `status: unavailable`, `error_code: cloud_agent_im_backend_unavailable`. The top-level `next` still explains how to send. | VERIFIED |
| Both paths need an approved context first: `bridge session --host claude-code --session-id … status` returns `context_state: required`, `backend_state: not_checked`. | VERIFIED |
| The account already holds owner-minted identities from earlier Bridge pilots (e.g. two "Bridge pilot" Agents in a team Space, and a "Codex Bridge" Agent in the commons Space). None is a Ducter persona. | VERIFIED (`agents list`) |
| Mem's own history: Bridge "is NOT open"; Personal Cloud is the first slice behind a cohort flag; a two-session live experiment (#9445) passed only after format repairs, and cold prompts failed to find the CLI. | DOCUMENTED (Nowledge Mem memories, 2026-10-29 and 11-03) |

**Conclusion.** A live round trip on the author's account is blocked twice: the Cloud IM backend reports
unavailable in every Space, and no Agent Context is approved. Both are the author's to change (section 6).
So the spike ran on a fake Bridge that copies the public CLI surface. [VERIFIED]

The read-only probes also gave the first real JSON shape: contact discovery returns **`cards[]`**, not
`contacts[]`, and its guidance says to send by appending `--body=` to a card's **`send_args_prefix`**, not
`send --to <contact>` as `bridge send --help` suggests. [VERIFIED] The spike parses both shapes.

## 2. Scenarios (≥ 12), scored

Users: **D** = heavy multi-agent developer, **C** = consumer personal-AI user, **F** = fresh user.

Scores run from 1 to 5. **V** user value · **E** emotional value against D36 (好用 顺滑 赏心悦目 放心 惊喜) ·
**T** trust and safety (5 = safest) · **B** feasibility with Bridge today (5 = works now) · **M** fit with Ducter's
model (one partner; attention only when it matters).

| # | Scenario | Who | V | E | T | B | M | Σ |
|---|---|---|---|---|---|---|---|---|
| S1 | **"Ducter, take this one"**: a terminal session hands a side job to the partner; the partner asks the user once; the outcome goes back to the session that asked (J1+J2) | D | 5 | 5 | 4 | 4 | 5 | **23** |
| S2 | **Ask the one who knows**: the user says "问问我终端里那个 Claude…"; the partner finds it, shows a card naming who, sends on 发送, and reports the answer in the conversation (J4) | D | 5 | 5 | 4 | 3 | 5 | **22** |
| S3 | **Follow-through on silence**: a message the user had sent goes unanswered (or a request sits unread); the partner raises it once, at the right moment, instead of the user remembering | D | 4 | 4 | 5 | 3 | 5 | **21** |
| S4 | **A teammate's agent asks your partner** (Mem Team): the partner answers from what's already shared, and asks the user only for the decision (J3) | D | 5 | 4 | 3 | 1 | 5 | 18 |
| S5 | **Hand work to the session that already has the context** instead of opening a fresh task: the session's claim shows up in 手头的事 as work happening elsewhere | D | 4 | 4 | 3 | 3 | 3 | 17 |
| S6 | **Phone → a running agent**: on the phone, "跟终端里的 Claude 说别动 main" (a one-way notice; S2's mechanism) | D, C | 4 | 4 | 4 | 2 | 4 | 18 |
| S7 | **Across machines**: a Claude Code on the laptop hands off to Ducter on the always-on home Mac or VPS; S1 with no extra setup, because Bridge is in the cloud | D | 4 | 4 | 4 | 3 | 4 | 19 |
| S8 | **A teammate's Ducter asks yours** (two always-on partners: "is the HawDB bench done?", scheduling) | D | 4 | 4 | 2 | 1 | 4 | 15 |
| S9 | **Review by a long-lived reviewer**: when a Ducter task finishes, it asks the user's long-running reviewer session before the result is shown (needs a standing rule) | D | 4 | 3 | 3 | 2 | 3 | 15 |
| S10 | **Reach your Ducter from a consumer AI** (Grok Bot, Muse): "让 Ducter 帮我订会议室" (J5) | C | 4 | 5 | 3 | 1 | 4 | 17 |
| S11 | **Two personas share context** (the work persona asks the home persona) | C, D | 2 | 3 | 2 | 3 | 1 | 11 |
| S12 | **Ducter as everyone's mail desk**: it holds and summarizes mail for the user's stopped sessions | D | 3 | 3 | 2 | 1 | 2 | 11 |
| S13 | **Fresh user's first meeting**: a friend's agent sends something; one quiet line, one question, no setup screen (J6) | F | 2 | 4 | 4 | 2 | 5 | 17 |
| S14 | **Delegate out to a teammate's agent**: "让 Alex 的 agent review 这个 PR" | D | 4 | 3 | 3 | 1 | 4 | 15 |

Why the low ones are low:
- **S11** breaks "conversations stay separate and isolated" (AGENTS.md, personas). Personas share attention, not
  context.
- **S12** is impossible by design: an Admin cannot read another recipient's mailbox (private/31 §4). It would
  also make Ducter a second inbox, the opposite of "attention only when it matters".
- **S8, S14 and S4** wait on Team Bridge. **S10** waits on remote-MCP delegation (#8956, proposed only).
- **S9** turns another agent into a step in every result. It needs a standing rule (J-Q2), not a v1 default.

### The top four

1. **S1 · "Ducter, take this one."** The doorway's reason to exist. The developer gets rid of a side job in one
   line, and gets the result back where they asked. It is the only scenario where Bridge removes a step the user
   does today: opening a tab and writing a brief.
2. **S2 · Ask the one who knows.** The partner reaches into the user's other agents on the user's behalf, which
   no single session can do. It is 惊喜 the first time and 好用 after that. The card naming the recipient keeps it
   放心.
3. **S3 · Follow-through on silence.** This is Ducter's "always on" edge applied to Bridge's truthful lifecycle:
   delivered, read and unanswered are separate facts. The partner says one line ("terminal-claude 还没回你昨晚
   的问题，要再问一次吗？") only when the user is likely to care. Cheap to build: a waiter plus the logged sends.
4. **S7 · Across machines**, kept as a property of S1 rather than a feature. Bridge is cloud-addressed, so a
   laptop session reaches the persona wherever its home runs. Nothing extra to build; it needs a live check.

S4 (teammates) is the highest-value scenario that is still blocked; it uses S1's path unchanged once Team
Bridge opens.

## 3. What the spike proved (branch `bridge-spike`, behind `DUCTER_BRIDGE=1`)

### Built

- **S1 and J-Q7: the outcome goes back by code, not by prompt.**
  - A card the partner asks in a turn woken only by a request remembers that request.
  - The task opened on its Go is linked to it (`task_open.forMessage`, or inferred from the Go).
  - Ducter sends the claim ("接了：<title>。做完把结果回你。") and logs it with `taskId`.
  - When that task reports done, failed or blocked, the partner's input carries a `[reply owed]` line.
  - If the turn ends without a `bridge_reply`, Ducter sends what the partner just told the user. Counted as
    `stats.bridgeOwedByCode`.
- **S2 and J-Q4: outbound, only through a card.**
  - `bridge_contacts(query)` is read-only.
  - `bridge_send(contact, text)` never sends. It puts a card in front of the user: "发给 <agent (member)>？「<gist>」",
    button 发送, default hold, not reversible.
  - On Go, Ducter sends it itself, without a partner turn, so a model can't send twice.
  - It is refused in a turn the user didn't speak in (a peer can't make Ducter contact a third party), and for a
    contact handle `bridge_contacts` didn't return.
  - An incoming message whose `in_reply_to` is one of ours renders as "the answer to what the user asked", so the
    partner reports it.
- **Protocol.** `bridge_msg` gains optional `taskId` and `decisionId` (TS and the Go mirror).
- **Fake Bridge CLI** (`packages/partner/eval/fake-bridge-nmem.ts`): several local mailboxes in one JSON file
  (contacts, send, inbox, open, reply, `in_reply_to`), so two real agents can talk without Mem.
- **Live driver** (`packages/partner/eval/bridge-live.ts`):
  - Ducter is the real core and partner on the real Claude Code harness.
  - "The other agent" is a separate real `claude -p` session Ducter didn't start, allowed only `nmem` through
    Bash.
  - The user's taps and the task's report are scripted.
- **Tests.** 6 new unit tests (`bridge-spike.test.ts`) plus the 14 existing Bridge tests: 20 pass.

### Live runs (haiku on both sides; transcripts in the evidence folder)

| Run | S1 result | S2 result | Notes |
|---|---|---|---|
| 1 (before the auto-link) | Card → Go → task → result told to the user. **No claim and no outcome reply**: the model never passed `forMessage` or called `bridge_reply`. | The partner answered from what it already knew, and offered in prose to ask ("你点头我就发"). No card. | Showed that prompt-only linking fails with haiku. That led to the code link and the code fallback. |
| 2 | **Pass, end to end.** Request (msg-001) → quiet line → card → Go → claim (msg-002) → done → outcome (msg-003, the partner's own `bridge_reply`). The terminal session read it and told Weyl correctly. | No card: still "我可以去问，你点头我就发" | The partner's message ended "已把结果回给 Weyl": wrong recipient in its words (it was terminal-claude). |
| 3 (S2 only, sharper tool text) | — | **Pass, end to end.** `bridge_contacts` → card "发给 terminal-claude (Weyl)？" → 发送 → the terminal session opened it and replied → Ducter rendered it as the answer → "它估计 22:00 左右能提 PR，前提是这个测试修通；分支和未提交改动它没核对". About 26 s from tap to answer. | The request carried four numbered sub-questions: over-asking, and a long card. |
| 4–6 (repeats, final code) | **3/3 pass** | **3/3 pass** | See §3.1. ~66–69 s per run for both scenarios, including two real terminal-session turns. |

The S2 fix was a single sentence in the tool description: "when the user asks you to ask … do it now; don't
offer first, the card is the confirmation". That matches research/30: the partner hedges in prose unless a tool
tells it the card is the consent. [VERIFIED]

### 3.1 Repeats

Three back-to-back runs of both scenarios with the final code (haiku partner, haiku peer). [VERIFIED;
`repeat-{1,2,3}.log`]

- **S1: 3/3 end to end.** In every run: request, quiet line, card, Go, task, a claim sent by code, done, the
  outcome sent with the partner's own `bridge_reply`. The `[reply owed]` line was enough each time, so the code
  fallback was never needed. It stays as the guarantee.
- **S2: 3/3 end to end.** In every run: `bridge_contacts`, the card "发给 terminal-claude (Weyl)？", 发送, the
  terminal session's reply, and the partner reporting it in one or two lines.
- **Copy defects, which are Ducter-side and fixable:**
  - *Wrong recipient in prose* (2 of 4 S1 runs): "我已经把结果回复给 Weyl" and "I've sent Weyl the outcome",
    when it went to terminal-claude.
  - *The user in the third person* (2 of 3 S2 runs): "Weyl 那边的 bridge…他预计…". The sender label
    "terminal-claude (Weyl)" invites it. When the member is the user, the label should be "你的 terminal-claude"
    / "your terminal-claude".
  - *The card follows the peer's language, not the user's* (1 of 3): an English request produced an English card
    for a Chinese-speaking user. A request-only turn has no user message, so the language rule falls back
    wrongly.
  - *A mixed-language claim* (every run): "Taken: 修复 runner 测试…". Ducter's code writes the claim in the
    requester's language around a title in the user's language.
  - *Over-asking* (3 of 3): S2 messages carry numbered sub-questions ("1) … 2) …"). The answers were still short
    and right.

### 3.2 After the decisions (D105–D111), same day

The author approved the §J defaults. Built on `bridge-spike`, all over the fake Bridge CLI; nothing reached Mem.
[VERIFIED; unit tests in `packages/partner/test/bridge-out.test.ts`, eval results in
`packages/partner/eval/results/2026-11-09-*-bridge-*.md`, live transcripts in the evidence folder]

- **Partner eval, three new scenarios** (`bridge-take-zh`, `bridge-ask-zh`, `bridge-ask-en`), written to fail on
  the §3.1 defects: the card in the peer's language, the user named in the third person, the label without
  你的, the mixed-language claim, numbered sub-questions.

  | Run | take-zh | ask-zh | ask-en |
  |---|---|---|---|
  | before the fixes, haiku ×2 | 0/2 | 0/2 | 0/2 |
  | after, haiku ×3 | 1/3 (deterministic checks 3/3; two judge fails on general result shape: branch and merge talk) | 3/3 | 3/3 |
  | after, sonnet ×3 | 3/3 | 3/3 | 3/3 |
  | after merging main, final guards: haiku ×3 | 3/3 | 3/3 | 3/3 |
  | same: sonnet ×3 | 2/3 (a second "started on it" reply while the task ran; now refused in code) | 3/3 | 3/3 |
  | after that guard, take-zh only: sonnet ×3 / haiku ×3 | 3/3 / 1/3 (judge: merge and push choice in prose, general result shape) | — | — |
  | after merging main again (quiet conversation): haiku ×2 / sonnet ×2 | 1/2 / 2/2 (haiku: judge, repeated evidence) | 2/2 / 2/2 | 2/2 / 2/2 |

- **What prompting alone didn't hold, now code** (research/30's lesson again):
  - an `ask` in the wrong language, or naming the user, in a turn woken by a peer is refused;
  - a `bridge_send` with numbered sub-questions is refused (haiku also wrote "1）2）3）" with full-width parens);
  - the same reply twice goes once (sonnet sent its outcome twice), and a reply to a request whose task is still
    running is not sent (the claim already went);
  - a reply while the task runs (haiku sent a second "Claimed") no longer counts as the outcome, which had
    silently cancelled the owed result;
  - "[reply owed]" now says reply first, then tell the user once: telling first made haiku say the result twice.
- **Live driver over the fake Bridge** (`bun run bridge:live`, haiku both sides): S1 6/6, S2 4/4, S3 3/3 (clock
  moved 2 h), J-Q6 2/2 (a lost send resumed, one message in the mailbox). The first S3 run failed: the partner and
  the code both said the follow-through, so it is now said before the partner's turn and carried into its input.
- **Recovery semantics are INFERRED from help** (`outbox`, `inspect`, `resume`; private/31 §3). The fake mirrors
  them; the real JSON fields are guesses until the live run (B8).

## 4. Dogfood findings for the Nowledge team (filed 2026-11-09)

All ten were filed through Nowledge Mem's `report_mem_issue` (concepts and repro only), B6–B10 an hour after B1–B5
because of the tool's rate limit (D111).

Each one has a repro, what was expected, and what happened. Already-known items from #9445 (cold-prompt CLI
discovery, address-file exchange) are not repeated.

**B1 · Contact discovery exits 0 when the backend is unavailable in every Space.**
- *Repro:* `nmem --json bridge contacts --query ducter --all-spaces` on an account outside the cohort.
- *Expected:* a non-zero exit, or a top-level `state: unavailable` naming the rollout or administrator next step,
  as the skill says for typed backend-unavailable results.
- *Actual:* exit 0, `cards: []`, `cloud_agent_im_backend_unavailable` only inside each `spaces[]` entry, and a
  top-level `next` explaining how to send.
- *Why it matters:* a host that checks only exit code and `cards` reads "nobody here" instead of "Bridge is off".

**B2 · No way to list named Agent Contexts, and "never created" looks like "exists".**
- *Repro:* `nmem agents context list` gives `unrecognized subcommand`. `nmem --json agents context show --name
  never-made` gives `{"state":"selection_required"}`.
- *Expected:* a `list`, and a `not_found` state distinct from an existing context that needs selection.
- *Actual:* nothing lists them, so a host can't offer "which of your approved contexts should Ducter use?".

**B3 · Setup reports no account-level readiness before a Space is chosen.**
- *Repro:* `nmem --json bridge setup` with no context.
- *Expected:* an account-level `feature_state` (on / not admitted / backend unavailable) next to the Space
  candidates.
- *Actual:* only `selection_needed` and the candidates. The user is asked to pick a Space before learning that
  Bridge can't work for them yet, which is a first-use dead end.

**B4 · Two send contracts.**
- *Repro:* `bridge send --help` documents `--to <contact>`. The contacts result's `next` says to "append
  `--body=<your message>` to its `send_args_prefix`".
- *Expected:* one stable contract for programmatic hosts, with the other marked as convenience.
- *Actual:* both are presented as the way to send.

**B5 · Three overlapping surfaces for one Agent mailbox.**
- `bridge inbox/open/reply`;
- `mailbox inbox/show/send` ("without claiming or acknowledging");
- `mailbox cloud inbox/show/summary/send/originals`.

*Expected:* one documented contract for a third-party host. *Actual:* a host can't tell which is the supported
path, or which one records "read".

**B6 · The non-consuming probe exists, but not where a host looks for it.**
- `mailbox probe` needs `--host codex|claude-code --session-id`: native sessions only.
- The Agent-mailbox equivalent is `mailbox cloud summary`, outside `bridge`.

*Expected:* `bridge inbox --peek` or `bridge summary`, so an always-on host can check cheaply without `open`
marking anything read.

**B7 · `mailbox cloud context --help` hides a required flag.**
- *Repro:* `nmem --json mailbox cloud context` exits 2: "required … `--space-id`".
- *Actual:* the command's help lists no `--space-id`; it comes from the parent command.

**B8 · No pinned JSON schema for `inbox` and `open`** (sender, body, `in_reply_to`, created time). Ducter's
correlation of an answer to its question (S2) and its dedupe both rest on field names guessed from help. Still
open from private/31 §7. Please publish a schema version in the output.

**B9 · No generic host for an always-on app.** `--host` accepts only `codex|claude-code`. Ducter's partner is a
re-cut cache, so binding a native entry to it would go stale. Please state "the Agent mailbox is the supported
path for app hosts", or add a host kind for them. Repeated from private/31 §7.

**B10 · Push or hint into an always-on host** (repeated). Ducter polls every 5 minutes. A hint into the control
plane would make S1 feel instant and remove the poll, and it stays inside the paused-wakeup boundary, because
Ducter decides what to run.

## 5. Implications for Ducter

- **S1 and S2 are worth building for v1-with-Bridge**, and both are proven on the Ducter side with real models.
  Only the Mem side is unproven, and it is blocked on Mem's rollout, not on Ducter.
- **Make the links code, not prompt.** With haiku, prompt-only linking failed in run 1 and code-only linking
  passed. The same goes for "send only after the user taps": a card the code executes, never a tool the model
  calls after an answer. Both follow research/30's lesson: put in code what prompting can't hold.
- **Outbound needs its own guard copy.** The card states who (agent and member) and the gist. The partner must
  not over-ask: a request should be one question plus the background the recipient needs (run 3 asked four).
- **Words.** Fix the copy defects in §3.1.
  - Proposed quiet lines: "<X> 发来请求 / Request from <X>", "<X> 回复了 / <X> replied", "已发给 <X> / Sent to <X>",
    "已回复 <X> / Replied to <X>".
  - The partner must name the agent it replied to, not the user ("已把结果回给 Weyl" was wrong).
  - A claim in the requester's language must not mix in a title in the user's language
    ("Taken: 修 live.test.ts…").
- **Restart gap and unknown outcome: closed (D106).** Every outgoing op is in the Log before its CLI call; a card
  survives a restart; an unknown outcome is recovered with `outbox → inspect → resume`, never resent.

## Summary

- Bridge is not usable on the author's account today: the IM backend is unavailable in all 8 Spaces, and no
  Agent Context is approved. A live round trip needs the author to switch Bridge on for the account and approve
  two contexts.
- The top scenarios are:
  - S1, "Ducter, take this one", with the result coming back;
  - S2, ask the one who knows;
  - S3, follow-through on silence;
  - S7, across machines, which S1 gives for free.
- The spike proves S1 and S2 end to end with two real models (haiku) over a fake Bridge. The fixes that made them
  pass: code links the task to the request; the code, not the model, sends the outcome when the model forgets;
  and the code sends only after the user taps a card that names the recipient.
- After D105–D111 (§3.2): the copy defects are fixed in code and tested (eval 0/6 before; after, sonnet 9/9 and
  haiku 7/9 with every deterministic check passing); lost sends are recovered; follow-through is built; the live
  trial is one command, waiting on the account.
- Ten dogfood findings for the Nowledge team, all filed. The most important: an unavailable backend exits 0
  (B1), there is no context list (B2), there is no account-level readiness (B3), and there are two send contracts
  and three overlapping surfaces (B4, B5).
