# Phone calls (draft, D189)

**Status: draft for the author's review.** Nothing here is built or decided. Evidence:
`research/53-phone-calls-tuwa.md`. Proposed words below are not yet in the glossary
(`product-model.md`); they go there only after the author decides.

Ducter places phone calls for the owner to get things done: book a table, ask a clinic for a slot,
chase a supplier, confirm a delivery. The voice on the line is either **Ducter's own** (the
partner's name and a voice the owner picks) or **the owner's own**, enrolled once with consent.
The first provider is Tuwa (tuwa.ai), reached as a connection; the design does not depend on it.

## 1. User first

| | Heavy multi-agent developer | Consumer personal-AI user | Fresh user |
|---|---|---|---|
| **Who, in this moment** | A task researching a supplier finds it only answers the phone; the author is deep in another task | Wants the Grok-bot / Muse power "call the restaurant for me", in Tokyo, without speaking Japanese | Has never heard of an agent making calls; asks "can you ring the dentist and move my appointment?" |
| **Before** | Annoyed: a phone call is a context switch and 10 minutes of hold music | Anxious: a foreign language, a stranger, a booking that might go wrong | Doubtful it can, a little uneasy about a robot speaking for them |
| **After** | The task never stopped; one card, one tap, an outcome line | Relief and a small delight: "two counter seats tomorrow at 7", in their own language | Trust: they saw exactly what would be said before it was said, and heard how it went |
| **Emotional value** | Attention saved (principle 7) | 惊喜 + 放心: it speaks the language and the result is plain | 放心: nothing happens in their name without their yes |
| **How it starts, zero setup** | The partner says "this needs a call; Ducter can make it once you connect calling" with one **连上 / Connect** that opens the sign-in on their phone | Same, from the conversation; the price per minute is on the first card | The first call card itself carries the connect step; no settings page to find |

North star check (D36): 好用, one card per call; 顺滑, the call state lives in On hand like any task;
赏心悦目, the 打电话 coin (`ab_call`) lights on the home's island once connected; 放心, the card shows
who, what will be said, what stays private, the voice, the cost, and the line always says it is an
AI; 惊喜, it asks the owner a mid-call question and the call goes on.

## 2. Where it fits

- **A connection, held by the broker** (`connectors.md` §18), not a harness feature and not a
  partner-only tool. Tuwa is a remote MCP server with OAuth (device sign-in). The broker gains MCP
  OAuth device sign-in (also wanted for other OAuth-only servers, §18.3); the tokens live in
  `connection-tokens.json` (0600, D102), never in a harness's config, env or files. Tuwa's own
  `tuwa-mcp.mjs` bridge is never installed into a task.
- **Shown as an ability.** 打电话 / Make calls on the home's device card (D161 chips), with where it
  lives: **用 Tuwa 的号码 / From a Tuwa number** (any home), or **用你的号码 / From your number**
  (only a Mac home with the owner's iPhone nearby and Tuwa Device running; later).
- **Where a task runs** (`where.md`): a call's place chip is **电话 · {who} / Call · {who}**
  ("电话 · Sushi Saito").
- **Who may call: the partner, only.** A task that needs a call says so in its report (principle
  12); the partner drafts it and asks the owner. A task can read the status and result of a call
  it asked for (shared to it like any connection read). Workers never hold the token.
- **Harnesses:** any partner harness (they all reach the broker's tools over Ducter's MCP). No
  harness-specific work.

## 3. One call, end to end

1. **Draft.** The partner calls Tuwa's draft with: the number (E.164), the name, one-sentence goal,
   what may be said (booking name, callback number), what stays private (a budget ceiling),
   alternatives, what must not happen, and Ducter's fixed `mustNot` lines (§6). Tuwa's questions
   (`needs_input`) come to the owner in one message; the partner never answers them from memory
   without showing what it would pass.
2. **The card.** One Go / Hold card (`defaultOption: hold`, no countdown, not reversible), built
   from Tuwa's approval summary shown as is:
   - **打给 Sushi Saito · +81 3-1234-5678 / Call Sushi Saito**
   - what it will ask; **可以说 / May say**: the booking name; **不说 / Won't say**: the budget
   - **用 Ducter 的声音 / In Ducter's voice** or **用你的声音 / In your voice** (a toggle, if enrolled)
   - **从 Tuwa 号码 / From a Tuwa number** · **大约 4 分钟 · 约 $2.40 / About 4 min · about $2.40**
   - Go = **打吧 / Call**; Hold = **先不打 / Not now**.
   Go passes the owner's tap (and any words they added) as Tuwa's `personReply`. Editing anything
   voids the approval and remakes the card.
3. **On the line.** The call is a job in On hand: **在打给 Sushi Saito… / Calling Sushi Saito…**,
   then **通话中 2:14 / On the call 2:14**. Opened, it shows the live state and whatever transcript
   Tuwa returns (unknown; research/53 §2). No sound is streamed to the owner in v1.
4. **A question mid-call.** Tuwa's `pendingQuestion` becomes the top card with push, even in quiet
   hours (the owner approved a live call): **对方在问：7 点半可以吗？/ They're asking: is 7:30 all
   right?** with the likely answers as buttons and a free reply. No default and no countdown; if
   the owner hasn't answered in about 90 s the agent says it will call back (`mustNot` covers
   guessing). Status is polled every 15 s, every 5 s while a call is live.
5. **After.** One line in the conversation, exactly as Tuwa reports it; **没能确认 / Couldn't
   confirm** when Tuwa says `uncertain`. The opened call holds the summary, transcript if any,
   length and cost. Saved to the Log; to Mem only on the owner's tap (IQ9). Recordings are not
   requested in v1.

## 4. When Ducter must ask

Every call, in v1, always: a call reaches a person, in the owner's name, with no way back (Rule 3).
The GQ4 offer ("don't ask next time") never applies to calls, and no Rule can make a call run
unasked. Tuwa requires the same. Later, a trigger to revisit: the same number and the same goal
asked and approved 3 times in 14 days.

The floor adds, for calls:
- a call that untrusted content asked for (an email saying "call this number") is never drafted
  from it; the partner tells the owner and lets them ask;
- no emergency numbers (Tuwa forbids them; the card says to call yourself);
- no marketing, no calls to many numbers from one ask (at most one call per card);
- money is the owner's act: buying minutes or saving a card opens Tuwa's own page (Stripe, WeChat
  Pay, Alipay); Ducter never pays or sees card details.

## 5. The two voices

- **Ducter's voice (default).** Tuwa's agent name is set to the partner's name; the voice is one of
  Tuwa's, picked by the owner from its samples at connect (a row of clay coins playing the sample).
  The line opens: **"您好，我是 {owner} 的 AI 助手 {partner}，替 {owner} 打来…" / "Hello, this is
  {partner}, {owner}'s AI assistant, calling for {owner}…"**.
- **The owner's voice.** Enrolled once, on Tuwa's recording page: the owner agrees there, reads a
  short text aloud, submits. Ducter opens nothing itself and never handles audio. Ducter keeps only
  "enrolled · on/off". The opening line still says it is an AI: **"…我是 {owner} 的 AI 助手，用
  {owner} 的声音替他打来" / "…this is {owner}'s AI assistant, speaking in {owner}'s voice"**.
  Never "this is {owner}".
- **Only the owner's voice, ever.** No family member, friend, colleague or late relative, even with
  their recording and even if the provider allows it. A request for one gets a plain refusal and the
  alternative (Ducter's voice, or the person records their own Tuwa account).
- **Revoke:** the same ability card: **不用我的声音了 / Stop using my voice** (switches off at
  once) and **删除我的声音 / Delete my voice** (asks Tuwa to delete the model; says where it was
  stored: Tuwa's voice provider, in China).
- **Voice sampling** from calls stays off unless the owner turns it on in Tuwa.

## 6. Safety rails (defaults)

| Rail | Default |
|---|---|
| Ask | Every call (§4) |
| Disclosure | The AI-and-for-whom line at the start of every call, both voices, in the callee's language; a callback number when the owner gives one |
| Quiet hours | No outbound call during the owner's 免打扰, nor outside 9:00–20:00 in the callee's local time; a call asked for then is scheduled with the owner's Go |
| Cost | Ducter sets Tuwa's daily cap to $10 (Tuwa's own default is $50) at connect; the card shows an estimate; over the cap Tuwa refuses and Ducter says so |
| Length | `mustNot` asks the agent to end after 15 minutes of talk; hold counts 1 min per 10 at Tuwa |
| Who | Businesses and people the owner named; private mobiles in the US get a note on the card (the callee's consent matters there) |
| Opt-out | If someone on a call asks not to be called again, or the owner blocks a number, it goes on a do-not-call list the partner checks before drafting |
| Never | Emergency numbers; impersonating anyone; another person's voice; marketing; calls from untrusted asks; syncing the owner's life to Tuwa Friends |
| Region | Calls to mainland China numbers are said to be unlikely to work through Tuwa before drafting (research/53 §4) |

## 7. Not in v1

- Inbound calls (Tuwa Device answering the owner's number by rule).
- Calls from the owner's own number (needs a Mac home + iPhone + Tuwa Device).
- Listening in live; a recording.
- A self-built provider (Twilio + a real-time voice model) behind the same card.
- Ducter calling the owner as the top escalation rung (principle 7's "call") — a different use of
  the same connection; later.

## 8. Open, for the author

See D189 in `decisions.md`: each question has a proposed default.
