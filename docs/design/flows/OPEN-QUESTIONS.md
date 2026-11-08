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

## Groups I (Results) and G (Safety), 2026-11-09 · drafted, not decided

Full tables with reasons: `I-results.md` (IQ1–IQ11) and `G-safety.md` (GQ1–GQ13). Defaults
in bold; "按建议" takes all.

- **IQ1** Result message appears **at verified Done**; if the user is watching and checks take
  > 10 s, at Done · checking with chips that fill as checks pass.
- **IQ2** Always show the **对外 / Outside** line for tasks with a place, **including "没有"**.
- **IQ3** The Results list lives **inside On hand** (from the Done lane header); asking is the
  primary path. No fourth zoom level.
- **IQ4** Save to… a repo **writes, never commits**; offers a draft PR separately (default Hold).
- **IQ5** **Diff snapshot at Done**, 5 MB cap per task.
- **IQ6** Share links: **7 days, revocable, with Ducter Edge** (not tonight).
- **IQ7** **Pre-share check on** (secrets, home paths, private hosts, Mem private memories).
- **IQ8** **Keep results until deleted** (10 s Undo).
- **IQ9** Save to Mem **only on tap**, into the named space, with provenance.
- **IQ10** Promote **"words freeze, chips live"** to `conversation.md` after review.
- **IQ11** New evidence kinds and a `result` Log event as **one protocol change** after tonight.
- **GQ1** Adopt the **effect ladder** (`G-safety.md` §0 Rule 3) as v1 policy.
- **GQ2** People-facing sends **wait until quiet end + 30 min** unless Go'd in the moment.
- **GQ3** **30 s** undo window for emails and posts, held on the control plane.
- **GQ4** Offer "don't ask next time" **after 3 identical Go's in 14 days**, never for the floor.
- **GQ5** Floor: **payments, passwords, untrusted-requested effects, no-default decisions**.
- **GQ6** **Redact** a secret that reached the Log (superseding event + blob delete) and advise
  rotation: a narrow exception to "never delete".
- **GQ7** Until the gate covers harness commands, list **"Seen in transcripts"** effects.
- **GQ8** **沙盒 / Sandbox** + its plain meaning; comprehension proxy before final.
- **GQ9** On hand record line **always shown, muted** ("今天对外：没有").
- **GQ10** PR comments / ready / request review: **ask, no countdown**.
- **GQ11** Sending-row slide: **motion, not metaphor**; check in prototype review.
- **GQ12** **可以碰 / May touch** on every task, not only routines.
- **GQ13** Write a short **`research/29`** on approval fatigue and undo-send before review.
- **Glossary batch:** see the "Proposed glossary additions" tables in both files (对外 /
  Outside is the anchor word for both groups).

## Browser places (W5), 2026-11-09 · drafted, not decided

- **W5-1** Ducter browser identity: **Dock tile = clay avatar, window parked bottom-right at
  ~60% size behind the user's work, status line "Looking at <site> in Ducter's browser" with
  Show.** Alternative: minimise while working. Built on by default so it can be seen;
  details in `system.md` "Proposed: the Ducter browser's identity".
- **W5-2** Browser tasks run **without the user's own Claude config** (no user MCP servers,
  skills, or CLAUDE.md). This cuts tokens by more than half and keeps the user's real Chrome
  out of reach. It departs from "windows inherit skills by default" for this place kind only.

