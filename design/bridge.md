# Bridge: Ducter and the Agents It Didn't Start

> Design note · 2026-11-09, updated 2026-11-11 · Principles 1, 7, 12, 14, 17, 18 · Decided: D105–D111 (outbound,
> the outgoing ledger, the result reply, names, copy, follow-through, the Mem asks), D162 (the live check and the
> real shapes), D163–D164 (beyond itself: X1–X3), D170 (X1, X2 and the Settings switch, built), D171 (the persona's Space), D205 (the persona connects itself with one tap); still open: J-Q1–3, J-Q8, J-Q14 ·
> Evidence: `research/31` (public), `research/37` (dogfood, §6 the live check), private `31` and `10`.
>
> Nowledge Bridge is Mem's agent mailbox. This note describes how Ducter uses it. All of it is in `main`:
> receive, ask and reply, the linked result reply (J2, D107), outbound messages through a card (J4, D105), the
> outgoing ledger and recovery (D106) and follow-through (S3, D110). It is proven with real models over a fake
> Bridge (research/37 §3, §3.2). It is on once the user connects the persona in Settings › 伙伴 (D205, with nmem
> 0.10.118+ on the home; "Connecting the persona" below), or forced with `DUCTER_BRIDGE=1`. It is not on by
> default until `bun run bridge:live -- --connected --real` passes (D170 (9), roadmap).

## Connecting the persona (D205)

Mem 0.10.118 (PR nowledge-co/mem#9996) lets the user's ordinary Mem login represent an existing identity it
holds, so the persona's context no longer needs a key or hand-made commands (D171's refusal).

- **Who and when.** The heavy multi-agent developer, in Settings › 伙伴 › 你的其他 AI, once Mem is connected on
  the home. A user without Mem never meets it; with an older Mem, one line says to update it on the home.
- **What Ducter finds by itself** (read-only): that the home's nmem has `bridge connections` (`--version`
  ≥ 0.10.118, else the subcommand's `--help`, cached per version); the one place with `kind: "personal"`
  ("Only me") among passive `bridge setup`'s candidates (no context, no Space, never `--enable`), by its exact
  id; the persona's identity (D141). None or two personal places: nothing is offered.
- **What one tap runs:** `nmem --json bridge connections connect --space-id <that id> --agent-id ducter --context
  ducter`, then passive `nmem --json --agent-context ducter bridge setup`; Bridge is on only when that says the
  same identity. The connection is kept in `<dataDir>/bridge-connection.json`; once per start, `bridge
  connections list` drops one revoked elsewhere. 断开 / Disconnect asks once, then `bridge connections revoke <id>`.
- **Mem says no:** each registered code is one plain line with the step the user takes in Mem
  (`role_authority_missing`, `role_custody_birth_missing`, `role_lifetime_inactive`, `role_attachment_mismatch`,
  and `role_control_denied`, `connection_revoked`, `binding_conflict`), plus 再试一次. Nothing else is tried: no
  other identity, place, key, `select-cloud` or `--enable`.
- **Two levels, both always in Settings › 伙伴:** 断开 ends it all (no checks, nothing sent, the tools gone).
  谁能找到 {name} › 谁都不行 keeps it connected but no other agent reaches the partner; what the user asks it to
  send on a card still goes, and its answer comes back (checks run only while one waits, at most 7 days).
- **No restart:** the partner's Bridge tools are listed only while it is on, and a change starts a fresh partner
  session at the next turn.

## Chosen scenarios (dogfood, 2026-11-09)

From 14 scored candidates (research/37 §2), four are chosen. The J-numbered details below still hold:
- **S1 = J1 + J2, "Ducter, take this one".** The result goes back by code. Proven live on Ducter's side.
- **S2 = J4, "ask the one who knows".** The user names an agent, the partner shows a card, Ducter sends on Go and
  reports the answer. Proven live on Ducter's side.
- **S3 · Follow-through on silence** (below, D110). Built; proven over the fake Bridge.
- **S7 · Across machines.** This is S1 from a laptop session to the persona's always-on home. Nothing new to
  build; it needs one live check.

Parked on 2026-11-09: J3 (teammates) until Team Bridge opens, J5 (consumer AIs) until remote-MCP delegation
ships. Re-scored on 2026-11-10 in "Beyond itself" below (draft D163): J3 becomes X3, with trust per sender; J5
stays parked as X5.

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
  - The partner finds it and shows one card: "发给你的 terminal-claude？「…」" with the button 发送 (a teammate's
    agent: "发给 reviewer · dev team？", D162). The default is to wait, and the card can't be undone.
  - On 发送, the quiet line "已发给 terminal-claude" appears.
  - The answer comes back at the other session's next turn boundary. Ducter picks it up at its next check, and
    the partner tells the user in one or two lines.
  - Zero setup on Ducter's side beyond the approved context (J-Q1).
- **Rules.**
  - Only the user starts a new conversation: `bridge_send` is refused in a turn woken by a peer.
  - Only a recipient that discovery returned can be chosen, never a typed or guessed one.
  - Ducter, not the model, sends after the Go, exactly once, even across a restart or a lost answer (D106).
  - The message carries what the user asked plus the background the recipient needs, in plain sentences:
    numbered or bulleted sub-questions are refused in code (D109). Never paths or private details the user didn't
    ask to share.

### S3 · Follow-through on silence (D110)

- **Who.** The same developer, two hours after S2's message, still unanswered, because the terminal session
  stopped.
- **Feel.**
  - *Before:* they'd have to remember they asked.
  - *After:* one line, once, when they're back: "你的 terminal-claude 还没回你 2 小时前问的「昨晚 CI 那个红是不是
    flaky？」，它可能停了。回了我马上告诉你。".
  - *Value:* 放心: someone holds the thread, and it doesn't nag.
- **Rules (built).**
  - Only messages the user confirmed on a card; at most one line each, never earlier than 2 h after it went out,
    nothing after 7 days.
  - Only while the user is around (they did something in the last 15 minutes), never in quiet hours, one line
    per moment.
  - Said by code before the partner answers the user's message; the partner's input carries it, so it isn't
    said twice.
  - Read and unread are separate facts: when the inbox reports ours as read, the line says "看过你…，还没回".
  - Bridge never wakes the other side, so the line never says it "reminded" anyone; it reports the silence, and
    the answer is reported when it comes (S2's path). No question: nothing for the user to decide.
- **Not built:** a time the user named ("今晚前告诉我"); `wait_until` already covers that.

## Beyond itself: what Bridge makes possible (D163–D164 decided 2026-11-10; built as D170)

> The author approved every proposed default ("go go go"). X1 and X2 are built on the partner, core, the Mac and
> the phone, and X3's Settings switch is built (D170); all of it sits behind `DUCTER_BRIDGE=1` until the live
> trial passes. "As built" and "The author's day" below say what the user sees and why X1 comes first.

**The idea in one line.** Ducter stops being only the place where the user talks to *its* agents. It becomes the
one place where **all** of the user's AI tools reach the user: they hand it work, they ask it for the user's call,
and it asks them. The partner stays the single attention point (principle 7): one conversation, one 等你 / Needs
you lane, silence when nothing matters. Nothing leaves without the user's Go, and each sender gets exactly the
trust the user gave it.

### What changed (evidence)

- The Cloud backend answers in every Space, and real cards come back, including another member's agents in team
  Spaces (research/37 §6, VERIFIED). Team Bridge is therefore *reachable*; its runtime acceptance on Mem's side is
  still pending (private/31, DOCUMENTED).
- The persona's identity exists; its mailbox does not yet (VERIFIED). It is one context and one `--enable` away,
  both the author's.
- Cards carry no member name (B11, VERIFIED): a teammate's agent can be shown only by its own name.
- Consumer AIs: remote-MCP delegated communication (#8956) has its foundation merged and its proposal approved,
  but it is not shipped (DOCUMENTED, Mem memory 2026-10-30). The account also holds Mem's hosted chat adapters (a
  Feishu/Slack bot) as Agent identities (VERIFIED, `agents list`); whether they can send to a persona's mailbox
  is unknown (INFERRED).

### Candidates, re-scored

Scores as in research/37 §2 (1–5; **V** value · **E** D36 emotional value · **T** trust and safety, 5 safest ·
**B** feasibility with Bridge as of today · **M** fit with one partner and attention only when it matters).
Users: **D** heavy multi-agent developer · **C** consumer personal-AI user · **F** fresh user.

| # | Scenario | Who | V | E | T | B | M | Σ |
|---|---|---|---|---|---|---|---|---|
| **X1** | **"有事问 Ducter": your other agents' questions for you come through the partner.** A terminal Claude Code or Codex that needs the user's call while they're away sends it to the partner; it lands as one decision card in the conversation and in 等你 / Needs you, and the user's answer goes back by code | D | 5 | 5 | 4 | 3 | 5 | **22** |
| **X2** | **"直接接": a standing go per sender.** After the user has said 好 twice to work from the same own agent, the partner offers once to take that agent's requests without asking, within limits (S1 with a learned rule, J-Q2) | D | 4 | 4 | 4 | 4 | 5 | **21** |
| **X3** | **A teammate's agent asks your partner (J3), with trust per sender.** Opt in per team; the partner answers only what is already shared there or what the user approves; a teammate can never open a task, and each sender has a daily quota | D | 5 | 4 | 3 | 3 | 4 | **19** |
| X4 | The partner suggests whom to ask ("这个你的 Codex 知道，问它？"): S2 without the user naming the agent | D | 3 | 4 | 4 | 4 | 3 | 18 |
| X5 | A consumer AI hands a request to the persona (J5): "让 Ducter 帮我订会议室" from Grok Bot or Muse | C | 4 | 5 | 3 | 1 | 4 | 17 |
| X6 | A chat app reaches the persona through Mem's hosted chat adapters (Slack/Feishu) | C, D | 4 | 4 | 3 | 2 | 3 | 16 |
| X7 | Hand work to the session that already has the context, as the task's body (S5) | D | 4 | 4 | 3 | 3 | 3 | 17 |
| X8 | A teammate's Ducter asks yours (S8): two always-on partners | D | 4 | 4 | 2 | 2 | 4 | 16 |
| X9 | Your other agents' "done" notes held quietly, mentioned only when asked | D | 3 | 3 | 4 | 3 | 3 | 16 |
| X10 | Fresh user's first meeting through a friend's agent (J6) | F | 2 | 4 | 4 | 3 | 5 | 18 |

Why the others wait:
- **X5, X6** are the consumer user's doorway and the most 惊喜, but nothing a consumer AI can use is shipped
  (#8956). They stay parked with a concrete trigger (todo). When it ships they take X1–X3's rules unchanged: a
  consumer AI is a sender like any other, with the trust its user gave it.
- **X4** risks the partner inventing errands: one more card the user didn't ask for. Revisit after X1 shows how
  often the user's other agents actually answer.
- **X7** puts an agent Ducter can't see inside a task's body; principle 14 and the Log want a body Ducter runs.
- **X8** needs X3 first, and two always-on partners trusting each other is the weakest trust story.
- **X9** turns the partner into a second inbox (research/37's S12); silence means success.
- **X10** stays J6: invisible until a second agent exists.

### X1 · "有事问 Ducter": your other agents ask *you* through the partner (top scenario)

- **Who.** The heavy multi-agent developer with four sessions open in a terminal. They leave for lunch. Today each
  session that needs a call (push now or wait for CI? keep the old API name?) stops at its prompt, and they find
  it an hour later.
- **Feel.**
  - *Before:* tethered to the terminal, or guilty about the stalled work.
  - *After:* the question finds them on the phone, in the conversation they already use, with the session's own
    suggestion. One tap, and the session goes on.
  - *Value:* 放心 (nothing waits on me without my knowing), 顺滑 (one place for every ask), 惊喜 the first time:
    "my terminal can reach me through Ducter".
- **How it starts (zero setup on Ducter's side).** The user says to the terminal session, in their own words:
  "我出门了，要我定的事发给 Ducter". The Mem plugin's bridge skill finds the persona in contacts (once the
  persona's mailbox is on) and sends the question with its background, its options and its suggestion. Nothing to
  learn in Ducter: the question simply arrives as a card from 你的 terminal-claude.
- **The consumer user** gets this the day a consumer AI can send (X5); the fresh user never sees it (J6).

**What the user sees.**
- *The conversation:* one quiet line, then the card, carrying the asking agent's coin (D146; a plain coin when
  the kind is unknown):
  - **你的 terminal-claude 问你 · <gist> / Your terminal-claude asks · <gist>**;
  - the question in the partner's words and the user's language, the options as buttons (at most three), plus
    **回复… / Reply…**;
  - the default caption **没回就让它先等着 / If you don't answer, it keeps waiting** (the safe default, below);
  - the asker's own suggestion marked **它建议 / It suggests** on that option, never pre-selected.
- *On hand:* the same card in **等你 / Needs you**, with the coin and **你的 terminal-claude · <where it works>**
  where a task card has its short title (the place comes from the agent's own description, when it gives one).
- *After the tap:* the quiet line **已回复 你的 terminal-claude / Replied to your terminal-claude** (J-Q5's string).
  The card leaves Needs you. Nothing else is said: silence means success.
- *Phone notification:* only as any decision would be, never in quiet hours (D3, D71).

**Mechanism over Bridge.**
- In: the same path as S1 (`inbox` → `open` → `bridge_msg{in}` origin `peer`).
- The partner judges it a question for the user, not a job, and calls `ask` with `forMessage: <id>` and the
  asker's options. The card remembers the message, as J2's cards already do.
- On the user's answer, **Ducter's code** replies to that message, never the model: the chosen option's words, or
  what the user typed, in a fixed frame in the asker's language: **"The user chose: «…»" / "用户选了：「…」"**.
  Logged as `bridge_msg{out, inReplyTo, decisionId}`; D106's ledger and recovery apply unchanged.
- The asker sees it at its next turn boundary. A session that stopped to wait isn't woken by Bridge; the skill
  lets it wait on a finite budget when the user asked it to, and "要我定的事发给 Ducter" is that ask (INFERRED;
  the live trial must show it).
- **Faster checks while a conversation is live** (amends J-Q3): every 60 s instead of 5 min for 30 minutes after
  any message from or to one of the user's own agents, then back to 5 min. One `inbox` call each; there is no
  push yet (B10).

**Safety.**
- *Who may ask:* in v1, only the user's own agents (same member, D108). A teammate's question goes through X3.
- *The default is always "wait".* When the decision's timer runs out, Ducter replies
  **"No answer from the user yet. Don't act on this; ask again later." / "用户还没回，先别按这个动，晚点再问。"**
  The asker's suggestion is shown, never taken on silence: a peer must not be able to decide what the user's
  silence means.
- *What crosses:* only the user's chosen option or typed words. Never the Log, other tasks, memories or files; the
  reply is redacted like every other.
- *Volume:* at most three open asks per sender in Needs you; a fourth folds into the third's card as
  **还有 <n> 件 / <n> more**. Every sender has the daily quota in the table below.
- *Not a work request:* a message that asks for work is S1 (a Go/Hold card that opens a task), never X1.

### X2 · "直接接": a standing go for one of your own agents

- **Who / feel.** The same developer, on the third "开个任务修 …？" from their terminal session this week.
  *Before:* the card feels like friction. *After:* the partner offers once to stop asking, and from then on the
  work just starts and the result comes back. 好用, and 放心 because the rule is visible and one tap undoes it.
- **How it starts.** After the user said 好 to requests from the same own agent twice within 14 days, the partner
  asks once, beside the next such request:
  **以后你的 terminal-claude 发来的活，直接接？ / Take work from your terminal-claude without asking from now on?**
  · **直接接 / Take it directly** · **还是先问我 / Keep asking me** (default). Declined: never offered again for
  that agent.
- **The rule** shows where D161's learned rules are (Settings › 伙伴): **你的 terminal-claude 发来的活直接接 · 你接过两次以后定的
  / Work from your terminal-claude starts without asking · set after you took it twice**, with **不再直接接 / Stop**.
- **Limits, in code:** the user's own agents only, never a teammate's; tasks in folders and on computers the user
  already uses (a new repo, a push to main or a message out still asks, as any task would, principle 18); at most
  5 a day per agent, then it asks again. The claim and the result go back exactly as in J2.
- **What the user sees:** no card. The task appears in 在做 / Working like any task, and its brief says who asked:
  **你的 terminal-claude 让我做的 / Your terminal-claude asked for this**.

### X3 · A teammate's agent asks your partner, with trust per sender (J3, re-scored)

- **Who / feel.** A teammate's reviewer agent needs "Weyl's call on the API rename". *Before:* a Slack ping that
  breaks focus. *After:* the partner answers what is already shared, and brings the user only the decision.
- **How it starts.** Off until the user opts in. Two steps, both the user's: in Settings › 伙伴, **谁能找到 {name} /
  Who can reach {name}** → **也包括同事的 / Teammates' too** (built, D170); and, for a team Space, one more context
  for the same identity there, approved by the user in Mem (Ducter never sets anything up). The per-team switch
  drafted as **让 <team> 里的 agent 也能找到 {name}** waits until a team context exists to switch; until then the
  one switch covers every Space the persona has a mailbox in, which today is only Only me (D171).
- **Trust, per sender, in code:**
  - a teammate's agent may ask questions. It can't open a task (a work request becomes a question to the user with
    the default **先不接 / Not now**), can't make the partner contact anyone (S2's rule), and gets D107's fixed
    outcome lines;
  - the partner answers only from what that Space already shares (Mem search scoped to it) or with the user's
    approved words; anything else is a decision card first (J3's v1 rule);
  - the daily quota below, then messages are held without waking the partner, with one line
    **<agent> 今天又发来 <n> 条，我先放着了 / <agent> sent <n> more today; I've set them aside**;
  - **不再听 <agent> 的 / Stop listening to <agent>**, said to the partner: that sender's messages are logged and
    never wake the partner from then on (listed, with **恢复 / Undo**, in Settings › 伙伴). A button on its
    cards is in `todo.md`.
- **Names.** Cards carry no member name (B11): a teammate's agent shows as **<agent> · <team>**
  (**reviewer · dev team**) until Mem returns names, never as an id (D162).

### Who may wake the partner (every sender)

| Sender | Wakes a turn | May open work | When the user is silent | Quota |
|---|---|---|---|---|
| The user's own agent | yes | after Go, or by X2's rule | it waits; a question gets "don't act yet" | 20 messages a day, 3 open asks |
| A teammate's agent (Settings: 也包括同事的) | yes, within quota | never | not now | 20 messages a day, 3 open asks |
| A teammate's agent (Settings: 只有你自己的, the default) | no; logged, never read again | never | | |
| Anyone else | can't: the persona has no mailbox outside the Spaces the user approved | | | |
| A sender the user stopped listening to | no; logged, never read again (the body is opened once by the check; a sender-only probe is B6) | | | |
| Settings: 谁都不行 | no check at all | | | |

Quota overflow never wakes the partner and never notifies: one quiet line a day per sender. An answer to a
message the user sent (S2) always comes through, whoever it is from.

### As built (D170): how it looks in Ducter

No new object, state or metaphor: the other agents appear as their AI coins (D146), as quiet lines, and as
decision cards; their rules live with the learned rules.

| Where | What the user sees |
|---|---|
| The conversation | a quiet line **你的 terminal-claude 发来请求 · <gist>** for work; for a question, the card itself: the coin and **你的 terminal-claude 问你 · ~/dev/ducter** above the partner's bubble, then **回复…** · its second option · its first (or suggested) option, **它建议「…」** and **没回就让它先等着。**; after the tap, **已回复 你的 terminal-claude** |
| On hand · 等你 | the same card beside Ducter's own tasks' asks, the coin and who where a task's title would be |
| Phone and lock screen | the same card; the notification is **小鸭 · 你的 terminal-claude 问你**, the question and the waiting line, no Go/Hold actions (its options are its own) |
| X2's offer | after two Go's: **以后你的 terminal-claude 发来的活，直接接？** · **直接接** · **还是先问我**; then its work shows up in 在做 / Working with no card, the brief starting **你的 terminal-claude 让我做的** |
| Settings › 伙伴 | **你的其他 AI**: **谁能找到小鸭** (只有你自己的 · 也包括同事的 · 谁都不行), the learned rules (**不再直接接**), the muted (**恢复**). Shown once another agent has written (J6) |
| Saying it | "不再听 X 的", "X 的活还是先问我" to the partner does the same (`peer_rule`) |
| Device islands | nothing: other agents aren't places, and a visitor on an island would be a new metaphor that tells nothing a coin doesn't |

**The first time, with zero setup in Ducter.** Once the persona's context exists (D171), the user tells any
terminal session "要我定的事发给 Ducter". The first question arrives as the card above; the Settings group appears
only then. Before that, nothing about other agents shows anywhere.

**Safety, in code** (tests in `packages/partner/test/bridge-out.test.ts`): nothing leaves without the user's tap
or a reply to a message already in the Log; a peer's turn can't send, ask a teammate's question as the user's, or
open a task unless X2's rule covers its sender; an outside question has no default and is answered "not yet" on
silence; 3 open asks and 20 messages a day per sender; what predates Bridge is never a request (B14).

### The author's day (research/37 §8)

Many long coding sessions run in parallel (Codex most of all), several are named coordinators, and the team talks
in Slack. The moments that need the author are the calls those sessions can't make alone, and they come daily.
That is X1, so X1 is the first live proof. Re-scored with this: **X6** (Mem's Slack adapter as a sender) rises to
B 3 (the adapter holds agent keys in seven Spaces; whether it can write to a persona is unknown), Σ 17: a probe
once the persona has a mailbox.

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
  - Unverified: the live round trip and the exact `inbox`/`open` JSON. The account's backend answers since
    2026-11-10 (research/37 §6).

### J2 · Ducter reports back to where the work came from

This is J1's second half, but it is worth naming because it closes the loop the user cares about.

- **Who.** The same developer, back in the terminal an hour later.
- **Feel.** The answer is waiting where they asked; nothing needs to be fetched. 惊喜.
- **How it starts.** Automatically: a task opened from a request ends, and the partner replies to that original
  request. The CLI's `reply` targets the original sender only.
- **Evidence.**
  - Built: `bridge_reply` exists, and the partner can use it.
  - Built on `bridge-spike` (D107): the task ↔ message link and a code fallback, so the reply is guaranteed
    rather than prompted.
  - The timing is honest only if copy never promises "they've seen it".

### J3 · A teammate's agent asks your partner (Mem Team)

> Re-scored on 2026-11-10 as X3 (draft D163, above): opt in per team, trust per sender, quotas. The text below is
> the 2026-11-09 reading, kept for its v1 rule.

- **Who.** The developer as a team member. A teammate's agent needs "Weyl's call on the API rename" or "is the
  HawDB bench done?".
- **Feel.**
  - *Before:* a Slack ping that breaks focus.
  - *After:* the partner answers what it can from the Log and asks the user only for the decision.
  - *Value:* the original intent, "needs your attention only when it truly matters".
- **How it starts.** The same way as J1, but the line names the teammate's agent and team ("reviewer · dev team
  发来请求"; cards carry no member name, D162).
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
- **Evidence.** Thin for this task-initiated case: a stopped session never wakes on send. The user-initiated
  case is built as S2 (D105); a task's question would reach the user first as its own card, then go out the same
  way.

### J5 · The persona reached from a consumer AI on the phone (Grok Bot, Muse)

> Still parked on 2026-11-10 (X5 above): #8956's foundation is merged, the delegation itself is not shipped.

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

User-facing copy: the decided lines (the send card, 你的 <agent>, the claim, the teammate's fixed outcome,
follow-through, a lost or refused send) are in the glossary (D105–D110). Still pending the user's OK (J-Q5):
- incoming: **"<X> 发来请求 · <gist>" / "Request from <X> · <gist>"**, one quiet line;
- outgoing: **"已回复 <X>" / "Replied to <X>"**, **"已发给 <X>" / "Sent to <X>"**.

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

Additions on `bridge-spike` (D105–D110):

```
J2  card asked in a request-only turn ── remembers the request
    Go → task_open (forMessage, or inferred from that Go) → Ducter replies "接了：「<title>」。做完把结果回你。"
         (requester's language, title quoted)                 Log: bridge_msg{out, inReplyTo, taskId}
    task report done/failed/blocked → input gets "[reply owed] … bridge_reply first, then tell the user once"
         turn ends with no reply → Ducter sends: your own agent ← the partner's message to the user;
                                                 a teammate's  ← "「<title>」：做完了 / 没做成"
J4  [user] "问问我终端里那个 Claude …"
    partner: bridge_contacts(query)  (read-only, one page) → bridge_send(contact, text)
         → Log: bridge_msg{out, state pending, contact, decisionId}
         → card "发给你的 <agent>？「gist」" · 发送 · default hold · not reversible   (nothing sent yet)
    user taps 发送 → Ducter sends it itself (no partner turn) → reply with in_reply_to = ours
         → rendered as "the answer to what the user asked" → partner tells the user
S3  confirmed, sent, no answer, ≥ 2 h, user active in the last 15 min, not quiet hours
         → one line before the partner's reply · Log: bridge_msg{out, state followed}

Every outgoing op (D106), logged before the CLI call:
    pending ─tap hold→ held
    pending ─tap go→ sending ─→ sent | failed (refused: say once) | unknown
    unknown / sending left by a crash ─next check (and 30 s after)→ bridge outbox → inspect → resume (same op)
         → sent | failed | still unknown ×3 → unconfirmed (say once; never resent)
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
  - It never calls `bridge setup --enable`, `bridge session prepare`, `agents enroll` or `keys create`. The one
    write it makes is D205's `bridge connections connect` (and `revoke`), on the user's own tap in Settings.
  - `contacts` (read-only) is called only when the user names an agent. `send` is called only by Ducter's
    code, after the user tapped 发送 on a card that names the recipient (D105).
  - Passive `bridge setup` (never `--enable`) is called once, to learn the user's own member (D108), unless
    `DUCTER_BRIDGE_MEMBER` names it.
  - The partner never passes `--space` or an agent id. Off unless the user connected the persona (D205) or both
    `DUCTER_BRIDGE=1` and `DUCTER_BRIDGE_CONTEXT` are set.
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
  - *Outgoing (D106):* every op is in the Log before its CLI call, once per state. An unknown outcome is recovered
    with `bridge outbox` → `inspect` → `resume` on the same operation, never a second send or reply. The same
    reply text to the same message goes once.
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

**Status 2026-11-11 (D205).** The path is now Mem's existing-role connection. Built and tested over the fake
nmem; never run against Mem (nmem 0.10.118 isn't public yet; the Cloud side is deployed). On the home, once
0.10.118 is installed:

```sh
nmem --version                                   # 0.10.118 or later
# In Ducter: Settings › 伙伴 › 你的其他 AI › 连上. Or by hand, the same command Ducter runs:
nmem bridge connections connect --space-id <Only me id> --agent-id ducter --context ducter
bun run bridge:live -- --connected               # dry: read-only preflight, prints what --real would run
bun run bridge:live -- --connected --real        # S1, S2, S3, X1; the peer is a native Claude Code session
# Undo: Settings › 断开, or nmem bridge connections revoke <connection id>
```

The status notes below are history (D171's path, superseded by D205).

**Status 2026-11-10, later (research/37 §8, D171).** The persona's mailbox belongs in **Only me** (the largest
and most-used Space, Mem's write default, one reader). Binding it was tried once, at the author's request:
`nmem agents context select-cloud --name ducter --agent-id ducter --space-id <Only me>` answered
`cloud_session_authority_unavailable` (403, not retryable, outcome unknown), and nothing was kept locally. Per
the Bridge skill nothing else was tried: no other identity or key, no test identity, no `--enable`, no message.
**What was set up: nothing, so nothing to undo.** Next, on Mem's side: authority for this connection to act as
`ducter` (B15). Then the same command, `nmem --agent-context ducter bridge setup` and `--enable`, and
`bun run bridge:live -- --real --context ducter --peer-context <the other side>`. Undo, once made:
`nmem agents context clear --name ducter` (the mailbox itself is Mem's to retire). The trial may use the real
persona's mailbox: Ducter's start mark (B14) keeps a later real Ducter from taking its messages as requests.

**Status 2026-11-10 (research/37 §6, VERIFIED, read-only).**
- The backend answers: discovery searches all 8 Spaces and returns real cards.
- The persona's identity `ducter` exists (D141) but has no mailbox, and no Agent Context exists.
- `bun run bridge:live -- --real` stops at its preflight and prints the steps below.

The Mem side is ready; what is left is the author's:
- the persona's context: `nmem agents context select-cloud --name ducter --agent-id ducter --space-id <the
  "Only me" Space>` (the personal Space, so nothing reaches a teammate), then `bridge setup` and `--enable` for it.
  The persona's own identity, never a new one and never the retained pilot identity that passive setup without a
  context reports (B12);
- the terminal side: an existing identity with its own standard Agent key (an earlier pilot identity already has a
  mailbox), as `terminal-test` in the same Space, with its own nmem config if needed (INFERRED).

After that, one command runs the whole trial (S1, S2, S3) against the real `nmem`, with real models on both sides:

```sh
bun run bridge:live -- --real            # contexts ducter and terminal-test
#   --peer-config-dir DIR    the terminal side's own NMEM_CLI_CONFIG_DIR, if it needs one
#   DUCTER_BRIDGE_MEMBER=…   your member id, if passive setup doesn't report it
```

It first runs a passive `bridge setup` for both contexts and stops unless both are ready; it never enables
anything. Every real `nmem` call's output is kept under `~/dev/ducter-evidence/bridge/raw-<time>/` (outside git).
It exits 0 only when every check passes: that is the gate for `DUCTER_BRIDGE`. Without `--real` it runs the same
scenarios plus a lost-send recovery (j6) over the fake Bridge. The manual commands, for reference:

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
