# Phone calls (D189, D193, D208)

**Status: settled and built (2026-11-11); the author's first real calls the same day changed the
hours and the outcomes (D208).** The author: "第一性原理 做决定", D189's defaults taken; what changed
on reflection is in D193, what the first real test changed in D208. Evidence:
`research/53-phone-calls-tuwa.md` (§8: Tuwa's real tool list, read with the author's account).
Words: the glossary in `product-model.md` §1 ("a phone call").

Ducter places phone calls for the owner to get things done: book a table, ask a clinic for a slot,
chase a supplier, confirm a delivery. The voice on the line is **Ducter's own** (the partner's name,
a Tuwa voice) or **the owner's own**, enrolled on Tuwa's page. The first provider is Tuwa (tuwa.ai),
reached as a connection; the design names "a calling connection" so another provider can take the
same card later.

## 1. User first

| | Heavy multi-agent developer | Consumer personal-AI user | Fresh user |
|---|---|---|---|
| **Who, in this moment** | A task researching a supplier finds it only answers the phone; the author is deep in another task | Wants "call the restaurant for me", in Tokyo, without speaking Japanese | Has never heard of an agent making calls; asks "can you ring the dentist and move my appointment?" |
| **Before** | Annoyed: a call is a context switch and 10 minutes of hold music | Anxious: a foreign language, a stranger, a booking that might go wrong | Doubtful it can, a little uneasy about a robot speaking for them |
| **After** | The task never stopped; one card, one tap, an outcome line | Relief and a small delight: "two counter seats tomorrow at 7:30", in their own language | Trust: they saw exactly what would be said before it was said, and heard how it went |
| **Emotional value** | Attention saved (principle 7) | 惊喜 + 放心 | 放心: nothing happens in their name without their yes |
| **How it starts, zero setup** | Settings › Accounts › **打电话 / Make calls** › **连上 Tuwa / Connect Tuwa**: a code and a QR, approved on the phone; or **+ 打电话** on the home's card in 你的设备 (D199), which opens the same place and starts the same sign-in | The same, from the phone: the sign-in page opens on the same phone | Asking for a call before connecting: the partner says in one line where to connect; browsing the home's card, the 打电话 chip shows the ability exists |

North star (D36): 好用, one card per call; 顺滑, the call lives in On hand like a task; 赏心悦目, the
clay phone (`ab_call`, grey `ab_call_locked` until connected); 放心, the card shows who, what will
be said, what stays private, the voice, the cost, when, and the line always says it is an AI;
惊喜, a question from the line reaches the owner mid-call and the call goes on.

## 2. Where it fits

- **A connection, held by the broker** (`connectors.md` §18). Tuwa is a remote MCP server with OAuth.
  The broker signs in by device code (§18.3, generic); tokens in `connection-tokens.json` (0600,
  D102), never in a harness. Tuwa's own `tuwa-mcp.mjs` is never installed into a task.
- **Recognised by its tools** (`packages/core/src/phone-provider.ts`): Tuwa's call flow and its
  settings tools are reserved to Ducter's flow (`packages/core/src/phone.ts`); `connection_call`
  refuses them, so no model can dial or change Tuwa around the card.
- **Who calls: the partner, only**, with one tool, `phone_call` (draft / answer / cancel / block).
  A task that needs a call says so in its report; the partner drafts it (`taskId` set) and
  task_sends the task the outcome. Workers never hold the token.

## 3. One call, end to end (as built)

1. **Draft.** The partner passes the number (country code), who, one goal, what may be said, what
   stays private. Core refuses emergency and short numbers, numbers on the do-not-call list,
   countries Tuwa doesn't call, a draft that would pass the daily cap, and the owner's voice when it
   isn't set up. It adds Ducter's own rules (the opening line, never claim to be the owner, no
   guessing an answer, 15 minutes, no marketing or payment details, "don't call again" respected),
   `dialer: tuwa`, and `scheduledAt` when now isn't an allowed hour and the owner can't say Call now
   (§6). Tuwa's `needs_input` questions come back to the partner, who asks the owner and drafts
   again with their words.
2. **The card** (a `decision` with `call`, `defaultOption: hold`, no countdown): **打给 {name}？ / Call
   {name}?**, then 号码 / Number · 要办的事 / What for · 可以说 / May say · 不说 / Won't say · 声音 /
   Voice · 从 / From (a Tuwa number) · 大约 / About (n min · about $) · 什么时候 / When, and **不能做 /
   Won't do** when the owner gave don'ts; the opening line; **Tuwa 的原话（英文） / Tuwa's own wording**
   behind a fold (label / value lines, the labels in the owner's words, the values as Tuwa wrote
   them). **打过去 / Call** · **先不打 / Not now** · Reply… (a change: the partner drafts again; the
   old card is withdrawn). When it waits (D208): under When, why in plain words (**对方那边现在
   20:03，我排到了对方的 9:00。**), Go reads **到点再打 / Call then**, and **现在就打 / Call now** sits
   beside the reason when only the callee's courtesy hours moved a call the owner just asked for.
3. **Go.** Ducter confirms with Tuwa (`tuwa_confirm`, the owner's button words, plus any words they
   added, as `personReply`). Tuwa dials at once or at `scheduledAt`; a Go given after that hour
   waits in Ducter for the next allowed one.
4. **On the line.** On hand, working lane: **在打给 X… / Calling X…**, **通话中 · X 2:14 / On the call ·
   X 2:14** with **挂断 / Hang up**; a waiting one **9:00 打给 X / Calls X at 9:00** with **不打了 /
   Cancel call**. Status is polled every 15 s, 5 s while someone is on the line.
5. **A question from the line** (`pendingQuestion`): a `decision` with `call.kind = question`, first in
   Needs you, pushed at once even in quiet hours: **对方在问 / They're asking**, the question, **可以 /
   不行 (Yes / No)** for a yes/no question or Tuwa's choices, and **或者直接告诉我怎么说 / Or tell me
   what to say**. Foot: **电话那头在等；90 秒没回，就说回头再打。** After 90 s Ducter sends the fixed
   call-back line. An answer said in the conversation goes through `phone_call do=answer`.
6. **After.** Done today: **打完了 · X / Called X** with the outcome line as reported, **没能确认 · X /
   Couldn't confirm · X**, **转到了自动语音 · X / Got an automated message · X** (it connected, but
   voicemail, a screening service or "not available" answered; D208), **没人接 · X / No answer · X**,
   **没打通 · X / Didn't connect · X** (dialed; the line failed, with Tuwa's words or "Tuwa 没说原因"),
   **没打出去 · X / Didn't go through · X** (never placed: a card to save, no minutes, today's limit,
   sign in again, Tuwa refused it with its words, or not sure it went out; with **去 Tuwa 的付款页 /
   Open Tuwa's payment page** when Tuwa gave one). Google Voice's call screening is said with its
   fix (answer and press 1, or turn off Screen calls). Tapped: summary, what was agreed, **说了什么 /
   What was said** (the transcript, when Tuwa gives one), length and cost. The partner says the
   outcome once, from the same facts; never "refused" unless it was.

## 4. When Ducter must ask

Every call, always. GQ4's "don't ask next time" never applies; no Rule can make a call run unasked.
A call is drafted only from the user's own words or a task's report, never from what a mail or a page
says. Money is the owner's act on Tuwa's own pages. Revisit trigger (todo): the same number and goal
approved 3 times in 14 days.

## 5. The two voices

- **Ducter's voice (default).** Tuwa's phone agent is named after the partner at connect. The line
  opens: "this is {partner}, {owner}'s AI assistant, calling for {owner}".
- **The owner's voice.** Phone card › 你的声音 / Your voice › **去 Tuwa 录 / Record on Tuwa** opens Tuwa's
  recording page; the owner agrees and reads aloud there. **我录好了 / I've recorded it** reads it back.
  **用我的声音打 / Call in my voice** and **删除我的声音 / Delete my voice** pass Tuwa's confirmation with
  the owner's tap. The opening still says it is an AI speaking in the owner's voice.
- **Only the owner's voice, ever.** Consent wording on the card: the voice is stored by Tuwa's voice
  provider, in China; only ever your own voice, never anyone else's.

## 6. Safety rails (as built)

| Rail | Where |
|---|---|
| Ask every call | the card; `decisions.ts` resolves, `phone.ts` confirms only on Go |
| Disclosure | Ducter's context and `mustNot` on every draft |
| The owner's quiet hours | `nextAllowed`: only for a call nobody just asked for (a task's call, a time Ducter picks); a call the owner asks for while here may start now (D208) |
| The callee's 9:00–20:00 (a courtesy) | the card says why and offers **现在就打 / Call now** for a call the owner just asked for; then Ducter holds the hour (no `scheduledAt`), else `scheduledAt` (D208) |
| 8:00–21:00 where they are (never crossed) | `nextAllowed` with `courtesy: false`; Call now can't pass it; none of these for the owner's own number (they said so, or their saved phone) |
| The callee's zone | where they are now when the partner knows it; a +1 number's area code (`nanp.ts`); else every zone of the country |
| A confirm that errored | the call's status read first: placed → go on, waiting for its yes → asked again, unreadable → failed as lost (never a second yes) |
| Daily cap $10 | Ducter's ledger before drafting and before dialing; Tuwa's `dailyLimitCents` set at connect; changeable on the phone card |
| 15 minutes | asked of the agent; Ducter hangs up at 17 on the line, 20 from dialing |
| Do-not-call list | `phone_call do=block`; checked before drafting |
| Never | emergency numbers, countries Tuwa doesn't call, another person's voice, marketing, Friends sync (off at connect), voice sampling (paused at connect) |

## 7. Not in v1

Inbound calls; calls from the owner's own number; listening live; recordings; another provider;
Ducter calling the owner as the top escalation rung; keeping a call in Mem from its result.

## 8. Built

Core: `packages/core/src/{mcp-oauth,phone,phone-provider}.ts`, the broker (`connections.ts`), the
pusher (`push.ts`), frames (`ws.ts`). Partner: `phone_call` (`partner.ts`), persona §Phone calls,
`[call ended]` lines (`render.ts`). Clients: `apps/web/src/phone.tsx` (phone, iPad, Android) and
`apps/desktop/internal/views/phone.go` (Mac). Tests: `packages/core/test/phone.test.ts` against a fake
Tuwa over real HTTP (`fake-tuwa.ts`, its real tool schemas), the partner eval's `calls` scenarios,
`apps/desktop/internal/views/phone_test.go`. Shots: `.shots/phone/` (desktop and web, zh/en).

## 9. To check with a real account (the answers were mostly never seen)

The tool names and input schemas are Tuwa's own; what comes back is read by likely field names. The
author's first real call (2026-11-11, D208) showed a connected call to a Google Voice number whose
screening answered, reported with an outcome summary in English; its exact field values were not
kept in the repo, so the outcome is read from the words (`outcomeOf`). Check:
`tuwa_call_draft`'s id field (`taskId`), `tuwa_call_request_approval`'s `confirmationId` and `summary`,
`tuwa_confirm`'s answer, `tuwa_call_status`'s status words and `pendingQuestion` (its token, a yes/no
marker, its choices), `tuwa_call_result`'s `outcome` / `outcomeSummary` / transcript / duration / cost,
`tuwa_settings`'s personal-voice field, and that `scheduledAt` with `+00:00` holds the call.
