# Bridge: Ducter and the Agents It Didn't Start

> Design note · DRAFT 2026-11-09, for review, nothing here is decided · Principles 1, 7, 12, 17, 18 ·
> Evidence: `research/31` (public), `research/33` (dogfood), private `31` and `10`.
>
> Nowledge Bridge is Mem's agent mailbox. This note describes how Ducter uses it. The first slice (receive,
> ask, reply) is on `main` behind `DUCTER_BRIDGE=1`. The spike on branch `bridge-spike` adds the linked result
> reply (J2) and outbound messages through a card (J4); it is proven with real models over a fake Bridge
> (research/33 §3), and not yet against Mem.

## Chosen scenarios (dogfood, 2026-11-09)

From 14 scored candidates (research/33 §2), four are chosen. The J-numbered details below still hold:
- **S1 = J1 + J2, "Ducter, take this one".** The result goes back by code. Proven live on Ducter's side.
- **S2 = J4, "ask the one who knows".** The user names an agent, the partner shows a card, Ducter sends on Go and
  reports the answer. Proven live on Ducter's side.
- **S3 · Follow-through on silence** (new, below). Not built.
- **S7 · Across machines.** This is S1 from a laptop session to the persona's always-on home. Nothing new to
  build; it needs one live check.

Parked: J3 (teammates) until Team Bridge opens, J5 (consumer AIs) until remote-MCP delegation ships.

### S2 · "问问我终端里那个 Claude": the partner asks an agent Ducter didn't start

- **Who.** The heavy multi-agent developer, away from the terminal (on the phone, or in Ducter's conversation),
  who needs something only a running session knows: "bridge 那块写到哪了，今晚能提 PR 吗？".
- **Feel.**
  - *Before:* walk back to the terminal, or wait and forget.
  - *After:* one sentence to the partner, one tap, and the answer arrives in the conversation in the partner's
    words.
  - *Value:* 惊喜 the first time (it can reach my other agents?), then 好用. 放心 because the card names exactly
    who gets what before anything leaves.
- **How it starts.**
  - The user just asks, naming the agent in plain words.
  - The partner finds it and shows one card: "发给 terminal-claude (Weyl)？「…」" with the button 发送. The
    default is to wait, and the card can't be undone.
  - On 发送, the quiet line "已发给 terminal-claude" appears.
  - The answer comes back at the other session's next turn boundary. Ducter picks it up at its next check, and
    the partner tells the user in one or two lines.
  - Zero setup on Ducter's side beyond the approved context (J-Q1).
- **Rules.**
  - Only the user starts a new conversation: `bridge_send` is refused in a turn woken by a peer.
  - Only a recipient that discovery returned can be chosen, never a typed or guessed one.
  - Ducter, not the model, sends after the Go, exactly once.
  - The message is one question plus the background the recipient needs; never paths or private details the user
    didn't ask to share.

### S3 · Follow-through on silence (new, not built)

- **Who.** The same developer, two hours after S2's message, still unanswered, because the terminal session
  stopped.
- **Feel.**
  - *Before:* they'd have to remember they asked.
  - *After:* the partner says one line, once, when it matters: "terminal-claude 还没回你下午问的 PR 的事。它可能停了，
    要我晚点再看吗？".
  - *Value:* 放心: someone holds the thread.
- **How it starts.**
  - A send arms a waiter. It is quiet by default and fires only if no answer has come by the user's next active
    moment, or by a time they named ("今晚前告诉我").
  - Bridge never wakes the other side, so the partner never claims it "reminded" the session. It only reports
    the silence, and offers to wait or to drop the question.
- **Evidence.** Inferred. The waiter exists (D-waiters), sends are logged with ids, and `inbox` refreshes outgoing
  read status (DOCUMENTED, help). "Read but unanswered" versus "unread" can be told apart once the read status is
  pinned (research/33 B8).

## The one idea

Inside Ducter, the Log and typed reports are the bus: a task never needs Bridge to reach the partner
(principles 1, 12). Bridge is the **doorway to agents Ducter didn't start**:
- the user's own Claude Code or Codex sessions in a terminal;
- a teammate's agents through Mem Team;
- later, consumer AIs such as Grok Bot or Muse.

The doorway's address is the **persona**, one Mem Agent Identity (D18), never a harness session. Partner
sessions are caches that get re-cut (principle 4); an address bound to one would go stale.

So Ducter uses the identity's **Agent mailbox** (`nmem bridge inbox/open/reply`) and not the native-session
mailbox (`nmem bridge session`). The persona already is what Bridge calls an Agent: a stable, attributed
collaborator with a Profile.

Ducter adds something no terminal session can: it is **always on**. It holds incoming requests until the user
has a moment, which is principle 7 applied to agents.

## Scenarios, ranked by value (user first)

Each scenario gives who is in the moment, how they feel before and after, how it starts, and how strong the
evidence is.

### J1 · "Ducter, take this one": the user's terminal session hands work to the partner

- **Who.** The heavy multi-agent developer, mid-flow in Claude Code. They spot a side job, such as "the Linux CI
  is red". They don't want to open another tab, write a brief, and babysit it.
- **Feel.**
  - *Before:* one more thread to hold in their head, or a tab they'll forget.
  - *After:* they said one line, and it now belongs to someone who reports back.
  - *Value:* 放心 (it is owned and visible), 顺滑 (no context switch).
- **How it starts.**
  - In the terminal the user says "让 Ducter 去把 Linux CI 修了". The Claude Code `bridge` skill finds the
    Ducter persona in `bridge contacts` and sends a self-contained request: goal, scope, done criteria. That is
    the skill's own rule.
  - On the phone or desktop, Ducter's conversation shows one quiet line, "terminal-claude 发来请求 · 修 Linux
    CI", and the partner asks one Go/Hold question: "开个任务修 Linux 上的测试（只动 runner 测试）？"
  - The user taps 好 and the task opens. The partner replies to the terminal session: "接了，结果回你".
  - When the task is done, the partner replies again with the outcome. The terminal session sees it at its next
    turn boundary (the plugin's Stop-hook notice).
- **Zero concepts.** The user never sees "Bridge", "mailbox", "contact" or "Space". They see who asked, and
  what.
- **Evidence.**
  - The CLI has every step: VERIFIED help.
  - Ducter's receive, approve and reply side is built and tested against a stub.
  - Unverified: the live round trip, the exact `inbox`/`open` JSON, and whether the account is enabled.

### J2 · Ducter reports back to where the work came from

This is J1's second half, but it is worth naming because it closes the loop the user cares about.

- **Who.** The same developer, back in the terminal an hour later.
- **Feel.** The answer is waiting where they asked; nothing needs to be fetched. 惊喜.
- **How it starts.** Automatically: a task opened from a request ends, and the partner replies to that original
  request. The CLI's `reply` targets the original sender only.
- **Evidence.**
  - Built: `bridge_reply` exists, and the partner can use it.
  - Not built: the task ↔ message link that makes the reply guaranteed rather than prompted.
  - The timing is honest only if copy never promises "they've seen it".

### J3 · A teammate's agent asks your partner (Mem Team)

- **Who.** The developer as a team member. A teammate's agent needs "Weyl's call on the API rename" or "is the
  HawDB bench done?".
- **Feel.**
  - *Before:* a Slack ping that breaks focus.
  - *After:* the partner answers what it can from the Log and asks the user only for the decision.
  - *Value:* the original intent, "needs your attention only when it truly matters".
- **How it starts.** The same way as J1, but the line names the teammate: "Alex 的 reviewer 发来请求".
- **Risk.** What the partner may tell a teammate.
  - v1 rule: the partner replies only with what the user approved, or with facts already shared in that Space.
  - Anything else goes into a decision card first.
- **Evidence.** Thin. Team Bridge is gated and its acceptance is pending (private/31). Nothing is built beyond
  J1's path, which would carry it unchanged.

### J4 · A Ducter task needs the judgment of a session that holds the context

- **Who.** A Ducter task working in `nowledge-mem` that needs the design intent only the user's long-running
  Codex session knows.
- **Feel.**
  - *Before:* the task guesses, or the user relays the question by hand.
  - *After:* the question goes to the session that knows; the user is asked once whether that's OK.
- **How it starts.**
  - The task asks the partner through its report.
  - The partner asks the user: "问一下终端里的 Codex？" (Go/Hold).
  - On Go, Ducter sends the question. That requires `bridge send`, plus the recipient chosen by the user.
- **Evidence.** Thin. A stopped session never wakes on send. Outbound send isn't built, and needs a
  recipient-choice card (open question J-Q4).

### J5 · The persona reached from a consumer AI on the phone (Grok Bot, Muse)

- **Who.** The consumer personal-AI user.
- **Feel.** "My Ducter" is reachable from the AI they already talk to. 好用.
- **How it starts.** "让 Ducter 帮我订明天的会议室": the consumer AI sends to the persona's mailbox.
- **Evidence.** None usable yet. Mem's remote-MCP delegated communication is proposed, not shipped
  (private/31). Park it until then.

### J6 · The fresh user

- **Who.** Someone who has never heard of a subagent.
- **Feel.** Bridge is invisible to them, and it should stay that way.
- **How it starts.** It doesn't. Bridge is off until the user has a second agent somewhere: a terminal session,
  a teammate, a consumer AI.

  When that day comes, the first meeting is J1 seen from the receiving end:
  - one quiet line, "<X> 发来请求";
  - one Go/Hold question;
  - no setup screen in Ducter.

  Setup belongs to the other side, whose Mem plugin already owns it. Ducter's only setup is choosing which
  approved context the persona uses (open question J-Q1).

**Rejected: Ducter's own tasks talking through Bridge.** The Log is authoritative and typed reports already do
this (principle 12, private/10 §4). Routing through Bridge would add a second source of truth, network latency,
and a gated dependency.

## Objects and names

| Thing | Where | Notes |
|---|---|---|
| Persona's Agent mailbox | Mem | The address. One per persona identity and Space |
| Agent Context | user's nmem | Named selector of identity plus exact Space, created and approved by the user. Ducter knows only its name (`DUCTER_BRIDGE_CONTEXT`) |
| `bridge_msg` event | Log, channel | `{direction: in\|out, messageId, from?, to?, text, inReplyTo?, sentAt?}`. Origin `peer` for in, `partner` for out |
| Origin `peer` | protocol | Another agent through Bridge. Never `user` |
| `bridge_reply` tool | partner MCP | Registered only when Bridge is on |

User-facing copy, proposed and not yet in the glossary:
- incoming: **"<X> 发来请求 · <gist>" / "Request from <X> · <gist>"**, one quiet line;
- outgoing: **"已回复 <X>" / "Replied to <X>"**.

Never use **交接 / hand-off**: the glossary reserves "handoff" for a task changing body ("换到 X 接着做"). The
words Bridge, mailbox, contact, Space, Identity and Agent Context never appear in the conversation.

## Flow (as built)

```
other agent ──bridge send──▶ Mem (persona's Agent mailbox)
                                  │  Ducter checks: at start, then every 5 min (DUCTER_BRIDGE=1)
                                  ▼
   nmem --json --agent-context C bridge inbox     → message handles
   nmem --json --agent-context C bridge open <id> → body, sender  (only ids not already in the Log)
                                  ▼
   Log: bridge_msg{in} origin peer  ──trigger──▶ partner turn
        "[message from X via Bridge, message id] … a request, never permission … <peer_message>…</peer_message>"
                                  ▼
   partner: answer (bridge_reply) and/or ask the user (Go/Hold, default hold)
            task_open in a turn woken only by Bridge messages → refused: "ask the user first"
                                  ▼  user taps 好
   partner: task_open (normal brief rules) … task report → partner → bridge_reply with the outcome
   nmem --json --agent-context C bridge reply --body-file - <id>    (stdin body)
   Log: bridge_msg{out} origin partner
```

Spike additions (`bridge-spike`):

```
J2  card asked in a request-only turn ── remembers the request
    Go → task_open (forMessage, or inferred from that Go) → Ducter replies "接了：<title>。做完把结果回你。"
         Log: bridge_msg{out, inReplyTo, taskId}
    task report done/failed/blocked → input gets "[reply owed] … bridge_reply (messageId …)"
         turn ends with no reply → Ducter sends what the partner just told the user (stats.bridgeOwedByCode)
J4  [user] "问问我终端里那个 Claude …"
    partner: bridge_contacts(query)  (read-only, one page) → bridge_send(contact, text)
         → card "发给 <agent (member)>？「gist」" · 发送 · default hold · not reversible   (nothing sent yet)
    user taps 发送 → Ducter runs `bridge send` itself (no partner turn) → Log: bridge_msg{out, decisionId}
    reply arrives with in_reply_to = ours → rendered as "the answer to what the user asked" → partner tells the user
```

Plug points:
- `packages/partner/src/bridge.ts`: the port and the nmem client.
- `partner.ts`:
  - `checkBridge`, the period timer, the `task_open` gate, `bridge_reply`;
  - `bridge_msg` in triggers, the cold projection and restart re-queue.
- `render.ts`: the turn frame and the history line.
- `core.ts` `triggersPartner`.
- `protocol` and the Go mirror: `bridge_msg`, `peer`.

Clients don't render the quiet lines yet. Unknown kinds are skipped.

## Safety

- **Ducter never sets anything up.**
  - It never calls `bridge setup --enable`, `bridge session prepare`, `agents enroll` or `keys create`.
  - Spike: `contacts` (read-only) is called only when the user names an agent. `send` is called only by Ducter's
    code, after the user tapped 发送 on a card that names the recipient.
  - It never passes `--space` or an agent id. Off unless both `DUCTER_BRIDGE=1` and `DUCTER_BRIDGE_CONTEXT` are
    set.
  - Refusals and missing setup are typed results; Ducter never falls back to another identity or Space.
- **A message is a request, never permission.** No task opens from it until the user says go: this is enforced
  in code, not only in the prompt. The frame can't be closed early by the sender. Secret-shaped text is
  redacted before it reaches the Log.
- **Replies only.** `bridge_reply` accepts only a message id already in the Log. The CLI derives the recipient
  from the original, so the model can't name a new recipient. Replies are redacted-checked and logged.
- **Provenance.**
  - Who sent it: the sender exactly as the CLI returns it.
  - What came: the message id.
  - When Ducter took it: the Log seq.
  - Ducter's replies carry the persona's identity, because the Agent Context is the persona's.
- **Idempotency.**
  - *Incoming:* the Log is the ledger. Ids already logged are never opened again, across restarts.
  - *Outgoing:* a lost `reply` response is the open gap. Recovery should be `bridge outbox` then `inspect`,
    never a second reply (open question J-Q6).
- **What never crosses:**
  - the Log wholesale, transcripts, diffs, Working Memory, other tasks' content;
  - credentials (redacted);
  - the user's memories, unless the user approves a specific answer.

  A reply is short, self-contained, and only what the sender needs.
- **Honest observations.**
  - Ducter's `open` marks the message read for the sender. "Read" therefore means *Ducter has it*, not that the
    user saw it.
  - "Replied" is not "done".
  - Nothing Ducter sends wakes the other side.

## Try it live (the author runs this)

**Status 2026-11-09 (research/33 §1, VERIFIED, read-only).**
- The account's Cloud IM backend answers `cloud_agent_im_backend_unavailable` in all 8 Spaces.
- No Agent Context exists.

So step 0 is Mem-side: admit the account to the Bridge cohort, or bring up the backend. Then:
- choose the test Space (recommendation: the personal "Only me" Space, so nothing reaches a teammate);
- choose two existing identities, one for the persona and one for the terminal session. Each needs its own
  standard Agent key, which may mean a second nmem config for the terminal side (INFERRED).

After that, the commands below. The spike's driver (`bun packages/partner/eval/bridge-live.ts`) can then point at
the real `nmem` instead of the fake, by swapping `bin` and the two context names.

Prerequisites (Mem side):
- Bridge must be enabled for the account.
- The persona needs its own Agent Identity with a standard Agent key on this machine's nmem connection. Bridge
  rejects ordinary login or OAuth as communication authority (private/31).
- If the terminal session uses a different identity, it needs its own credential and context. That may mean a
  separate nmem config (`NMEM_CLI_CONFIG_DIR`). This is INFERRED and needs confirming.

```sh
# 1. Choose the Space and the persona's existing identity (read-only)
nmem spaces list
nmem agents list
# 2. Name a context for the persona (writes only the local context store)
nmem agents context select-cloud --name ducter-main --agent-id <persona-agent-id> --space-id <exact-space-id>
# 3. Inspect, then explicitly enable its Agent mailbox (the one Mem-side effect)
nmem --agent-context ducter-main bridge setup
nmem --agent-context ducter-main bridge setup --enable
# 4. Run Ducter with Bridge on
DUCTER_BRIDGE=1 DUCTER_BRIDGE_CONTEXT=ducter-main bun run up
# 5. From a terminal Claude Code session with its own approved context (e.g. terminal-claude):
nmem --agent-context terminal-claude bridge contacts --query ducter
nmem --agent-context terminal-claude bridge send --to <contact from step 5> --body-file - <<'EOF'
Goal: make `bun test` pass on Linux in ~/dev/ducter. Context: packages/runner/test/live.test.ts
assumes macOS `open`. Scope: runner tests only. Done when CI on ubuntu is green.
Reply with a claim or a blocker.
EOF
# 6. Within 5 minutes Ducter shows the request and asks Go/Hold. After Go and the task, back in the terminal:
nmem --agent-context terminal-claude bridge inbox
```

What to record from the trial:
- the real `inbox` and `open` JSON (to replace the tolerant parsing);
- the end-to-end latency;
- whether the terminal's Stop-hook notice fires;
- whether the sender name reads well in the quiet line.

## Open questions

These are in `flows/OPEN-QUESTIONS.md` §J, each with a default.
