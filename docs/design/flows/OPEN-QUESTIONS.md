# Flow Open Questions: Consolidated (2026-11-09)

Each item has the lead's recommendation. Once the user answers, record it in
`docs/decisions.md` and propagate per AGENTS.md.

Canvas: https://claude.ai/artifact/LKuVp3knPDJ4EdoyWBGSWN

## Glossary additions (proposed as one batch)

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

## Semantics (recommendation in bold)

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
