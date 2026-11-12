# Open Questions: Consolidated

Calls that are the user's, each with the lead's recommendation and a default. Once the user
answers, the answer goes to `design/decisions.md` and is propagated per AGENTS.md; the answered
item leaves this page and only a pointer stays below.

Canvas: https://claude.ai/artifact/LKuVp3knPDJ4EdoyWBGSWN

## Waiting for you

### J. Nowledge Bridge (2026-11-09 evening, draft; `../bridge.md`, `research/31`, `research/37`)

J-Q2 to J-Q7, J-Q9 to J-Q13 and J-Q15 are answered (D105–D111, D163, D164, D170, below). What is still open:

**J-Q1. Adopt Bridge as Ducter's doorway to agents it didn't start, addressed to the persona.**
- *Recommendation:* yes, through the persona identity's Agent mailbox, never a native session (partner
  sessions are caches).
  - Ducter's own tasks keep the Log and typed reports.
  - Ducter uses a named Agent Context the user approved in nmem.
- *Default:* accept. Bridge stays off unless `DUCTER_BRIDGE=1` and `DUCTER_BRIDGE_CONTEXT` are set; a settings
  toggle comes later.

**J-Q8. Work agreement.**
- *Background:* Mem's Bridge guidance suggests a Memory that the receiver confirms. Ducter forbids writing task
  plumbing to Mem.
- *Recommendation:* the user's Go plus a reply carrying the claim ("接了 · <scope>") is the agreement. It is
  recorded in Ducter's Log, and no Memory is written.
- *Default:* accept; revisit for Team (J3).

**J-Q14. The live trial (needs Mem, then you).**
- *Status (2026-11-10, research/37 §8, D171):* the persona's mailbox goes in Only me. Binding it was refused by Mem
  (`cloud_session_authority_unavailable`, B15); nothing was kept, enabled or sent.
- *Steps:* Mem grants this connection authority to act as `ducter`; `nmem agents context select-cloud --name ducter
  --agent-id ducter --space-id <Only me>`; `nmem --agent-context ducter bridge setup`, then `--enable`; an identity
  with its own key for the other side (a dedicated test identity); `bun run bridge:live -- --real --context ducter
  --peer-context <it>`.
- *Default:* I run the trial when the binding exists. `DUCTER_BRIDGE` stays off by default until it passes
  (D170 (9) has the criteria).

## Answered on 2026-11-10 (Bridge, the author's "go go go")

J-Q2 → D163 X2 (a learned rule, offered after two Go's) · J-Q3 → D164 (6) · J-Q5 → D170 (4) · J-Q15 → D163, D164,
built as D170.

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
| Remote access ability | 远程打开 / Reach from outside |
| Handoff to another body or device | 换到 X 接着做 / Continue on X |
| Pause | 先停 / Pause (shown as a waiting reason, not a new state) |
| Recipe | 准备方法 / Setup steps |
| Changes in a non-git folder (D142; was 草稿副本 / Draft copy, D27) | 改回去 / Undo all changes · 就这样 / Keep the changes |
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
