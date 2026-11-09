# Open Questions: Consolidated

Calls that are the user's, each with the lead's recommendation and a default. Once the user
answers, the answer goes to `design/decisions.md` and is propagated per AGENTS.md; the answered
item leaves this page and only a pointer stays below.

Canvas: https://claude.ai/artifact/LKuVp3knPDJ4EdoyWBGSWN

## Waiting for you

### J. Nowledge Bridge (2026-11-09 evening, draft; `../bridge.md`, `research/31`, `research/37`)

J-Q4, J-Q6, J-Q7 and J-Q9 to J-Q13 are answered (D105–D111, below). What is still open:

**J-Q1. Adopt Bridge as Ducter's doorway to agents it didn't start, addressed to the persona.**
- *Recommendation:* yes, through the persona identity's Agent mailbox, never a native session (partner
  sessions are caches).
  - Ducter's own tasks keep the Log and typed reports.
  - Ducter uses a named Agent Context the user approved in nmem.
- *Default:* accept. Bridge stays off unless `DUCTER_BRIDGE=1` and `DUCTER_BRIDGE_CONTEXT` are set; a settings
  toggle comes later.

**J-Q2. Who may make Ducter act.**
- *Recommendation:* v1 asks the user before any task that comes from another agent (Go/Hold, default hold,
  enforced in code).
  - Later, the user may state a rule in plain words, e.g. "我自己终端里的请求直接接". Ducter confirms it (D-style
    rule, principle 14).
- *Default:* always ask in v1. The partner may still answer questions with `bridge_reply` without asking.

**J-Q3. When Ducter checks for requests.**
- *Recommendation:* at start, then every 5 minutes while running; no push until Mem offers one.
  - Ducter's always-on control plane is the host here, so this is not a session kept alive by polling.
- *Default:* 5 min (`bridgeIntervalMs`). Ask Mem for a hint/push into an always-on host (private/31 §7).

**J-Q5. Copy.**
- *Recommendation:*
  - incoming: "<X> 发来请求 · <gist>" / "Request from <X> · <gist>", one quiet line;
  - outgoing: "已回复 <X>" / "Replied to <X>".
  - Never 交接 / hand-off, which the glossary reserves for a task changing body. Bridge words never appear in
    the conversation.
- *Default:* these strings, added to the glossary as "pending user OK".

**J-Q8. Work agreement.**
- *Background:* Mem's Bridge guidance suggests a Memory that the receiver confirms. Ducter forbids writing task
  plumbing to Mem.
- *Recommendation:* the user's Go plus a reply carrying the claim ("接了 · <scope>") is the agreement. It is
  recorded in Ducter's Log, and no Memory is written.
- *Default:* accept; revisit for Team (J3).

**J-Q14. The live trial (needs you, on Mem's side).**
- *Status:* the Cloud IM backend reported unavailable in all 8 Spaces, and no Agent Context existed (research/37
  §1, read-only). You are setting this up (steps 1–4).
- *Steps:*
  1. admit the account to the Bridge cohort, or bring the backend up;
  2. use the personal "Only me" Space;
  3. use two existing identities, one for the persona and one for the terminal session;
  4. run `agents context select-cloud` for each (`ducter-test`, `terminal-test`), then
     `bridge setup --enable` for each;
  5. `bun run bridge:live -- --real` (add `--peer-config-dir DIR` if the terminal side needs its own nmem config,
     and `DUCTER_BRIDGE_MEMBER=<your member id>` if passive setup doesn't report your member).
- *Default:* I run step 5 when you say it's ready. `DUCTER_BRIDGE` stays off by default until it passes.

## Answered on 2026-11-09 (Bridge, the author's "按建议 go")

J-Q4 → D105 · J-Q6 → D106 · J-Q7, J-Q12 → D107 · J-Q11 → D108 · J-Q13 → D109 · J-Q10 → D110 · J-Q9 → D111.

## Answered on 2026-11-09 morning

The author: "关闭窗口在后台会比较自然一些；词汇表你要仔细反思…；那些建议你自己第一性原理反思好按照建议吧".
Each recommendation was re-checked from first principles before recording; the full text,
including what the check changed, is in `design/decisions.md`.

| Item (overnight list) | Decision | As recommended? |
|---|---|---|
| 1.1 Server mode + code pairing | D54 accepted | yes |
| 1.2 Local trust on a shared VPS | D57 | changed: a local token, then no loopback exception at all |
| 1.3 Phone client is Preact, not MyGo WASM | D58 | changed: MyGo WASM web dropped from the plan, not kept for later |
| 2.1 Ducter.app lifecycle | D56 | changed by the author: Ducter keeps running when the window closes |
| 3.1 Push defaults | D59 | yes, plus: coalescing never holds a decision past its default |
| 4.1 Result-shape rule | D60 | yes (now in `conversation.md`) |
| 4.2 IQ1–IQ11, GQ1–GQ13 | D61 | yes, except GQ8: no 沙盒 noun, state the property |
| 5.1 W5-1 browser identity, 5.2 W5-2 isolation | D62 | yes |
| 6.1 One live Mem write | D63 | yes |
| 7.1 Art in plain git | D64 | yes |
| 8 Carried over: capability map | D65 | yes (human test still needed) |
| 8 Carried over: 本事 naming, Noted line; 9 glossary batch | D66 | reviewed word by word: `../glossary-review-2026-11-09.md` |
| Experience review 2: follow-ups, reversible asks, long paths | D67 | yes |

## Glossary additions (decided as D51, 2026-11-08)

*Several of these words were replaced by D66 (2026-11-09); the glossary in `product-model.md`
§1 is current, this table is the record of D51.*

| Concept | zh / en |
|---|---|
| Take over / Hand back (screen) | 接手 / Take over · 交还 / Hand back |
| Screen tab | 画面 / Screen |
| Loop iteration | 第 n 轮 / Round n |
| Routine review date | 复查 / Review on |
| Routine effect scope | 可以碰 / May touch |
| Checkpoint | 存档 / Checkpoint |
| Device states | 醒着 / Awake · 睡着了 / Asleep · 连不上 / Can't reach |
| Quota | 额度 / Allowance |
| Wake a device | 叫醒 / Wake |
| Remote access ability | 远程打开 / Reach from anywhere |
| Handoff to another body or device | 换到 X 接着做 / Continue on X |
| Pause | 先停 / Pause (shown as a waiting reason, not a new state) |
| Recipe | 准备方法 / Setup steps |
| Draft copy (non-git) | 草稿副本 / Draft copy |
| Default applied | 按默认做了 / Went with the default |
| Stopped / Undo / Try again | 停下了 / Stopped · 撤销 / Undo · 再试一次 / Try again |
| Batch defaults | 都按默认 / Go on all defaults |
| Quiet hours | 安静时段 / Quiet hours |
| Verification failed | 核对没过 / Check didn't pass |

## Semantics (decided as D52, 2026-11-08; the bold recommendation was taken)

1. **A device sleeps:** after a 2-minute grace, its tasks show 在等 · 设备睡着了. **Yes.**
   This changes invariant 1 in `focus-window-states.md`: residency may set attention
   `blocked`, with the reason shown.
2. **Model switch within the same harness:** **a switch at a cut inside the same task**, not
   a handoff.
3. **Pause:** **a waiting reason, not a new state.** The file lease is released after 2 h.
4. **Drop:** **10 s Undo.** After that, reopening creates a new task linked to the old one.
5. **Merge / split:** **cheap version first.** Drop B and tell A about it; splitting opens a
   new task with a brief.
6. **Draft PR:** **auto-opens after the countdown on personal repos; org repos wait for Go.**
7. **Where research documents live:** **in 成果 / Results on the control plane**, with an
   optional "write it into a place".
8. **A routine with 3 unread reports:** **auto-pause and ask "还要吗？"**, per the product
   model.
9. **A waiter without a task:** **a compact row on On hand**, not a full card.
10. **Multi-repo in v1:** **one device**; missing repos are cloned there.
11. **iOS web push:** **tap-to-open only** (verify that it has no action buttons). Action
    buttons only on Android until the native app.
12. **Quiet hours:** **nothing breaks through** unless the user set a deadline and said "even
    at night". In v1 the escalation ladder stops at push.
13. **Default fires while the user is typing:** **one 2-minute grace.**
14. **Thresholds:** **circuit breaker after 3 identical errors; stall after 20 min with no
    events; no auto-retry** unless a rule says so.
15. **Second partner without Mem:** **allow it**, with a minimal identity stored by Ducter
    that migrates to Mem later.
16. **Home Mac asleep means the partner is unreachable:** **show a tip suggesting the main
    process run on a VPS.** Wake-on-LAN comes in v1.x.
17. **VPS install:** **finish setup in the browser via a temporary 15-minute link.** Needs a
    spike for relaying Claude Code and Codex logins.
18. **CN users' remote access default:** **their own domain.** Tailscale stays a community
    contribution.
