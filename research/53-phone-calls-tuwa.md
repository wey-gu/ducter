# 53. Phone calls through Tuwa: what it does, the law around AI calls and cloned voices, and the alternatives

Date: 2026-11-11. Question (the author): "你能看看我们可以怎么通过 tuwa.ai 为 [Ducter] 带来电话功能，使得
agent/subagent 可以打电话做一些事情，注意我们需要录入学习主人的声音，当然也应该可以以 [Ducter] 的口吻去做各种事情".
D35 has had phone calls ("tuwa.ai-like") on the roadmap since the start; the effect ladder
(`design/flows/G-safety.md` Rule 3) lists "Phone call · reaches people · no way back · always an
intent"; the devices card already draws the 打电话 / Make calls ability (`ab_call`, state "later").

Method. No account, no sign-up, no call, nothing spent. Tuwa has no public SDK repository; what an
agent installs is published at `https://api.tuwa.ai/agent/install.md`. I downloaded it, its
`SKILL.md` and the bridge script `tuwa-mcp.mjs` (sha256 `e643bfdf…873a`, matching the published
checksum) into the session scratchpad and **read them; nothing was run**. I read the site's
JavaScript bundle (the site is a client-rendered page, so its copy and price tables live there), the
Privacy Policy and the Terms (`tuwa.ai/privacy-policy.md`, `tuwa.ai/terms-of-service.md`), and the
public OAuth metadata at `api.tuwa.ai/.well-known/*`. An unauthenticated `tools/list` on
`api.tuwa.ai/mcp` answers `401 invalid_token`, so the full remote tool list and its schemas were
**not** seen. Nowledge Mem holds no notes on Tuwa (`nmem m search "tuwa"`: nothing relevant).

Tags: **VERIFIED** = I observed it directly (a file, an HTTP answer). **DOCUMENTED** = the vendor or
a legal source says so; not tested. **INFERRED** = my reading; may be wrong.

---

## 1. What Tuwa is

- **Who.** tuwa.ai is operated by **chekusu Inc.** (Privacy Policy, Terms; governing law Delaware,
  with a Japanese-consumer carve-out for Tokyo courts) [DOCUMENTED]. Sign-in is a "Chekusu account"
  (SKILL.md) [DOCUMENTED]. A web search found no press or company profile for chekusu; it is a small,
  young company [INFERRED]. The Terms and Policy are dated 2026-03-20 / 2026-04-02 and still
  describe only the translation hotline (e.g. "5 free minutes … per calendar month"), while the
  current site and SKILL.md say "There are no monthly free minutes" and describe agent calls: **the
  legal pages lag the product** [VERIFIED: both texts read].
- **Three products on one account** (site copy in the bundle) [DOCUMENTED]:
  1. **Hotline**: dial `+1 888 886 2968` (US toll-free), an AI operator asks who to call, then
     interprets both ways live, "under a second of delay", 16 languages.
  2. **Calls from your agent**: an AI agent (Grok Bot, Muse, Codex, Claude Code, any MCP host)
     drafts a call; the person approves in chat; Tuwa's own voice agent places and conducts the
     call and reports the result. Positioned as "bookings, inquiries, confirmations, follow-ups in
     Japanese, Chinese or English" (SKILL.md).
  3. **Your number and voice**: "Tuwa Device" for macOS (`downloads.tuwa.ai/device/tuwa-device-mac-latest.dmg`)
     dials from the person's own iPhone number ("On a Mac, keep your iPhone nearby and signed in
     to the same Apple Account … Confirm dialing on your device when prompted"), and can **answer
     incoming calls by rule** ("Weekdays after 7 pm · Agent answers", "No answer in 15 s · Agent
     picks up").
  Plus an iPhone app (TestFlight public beta) and **Friends**: followers call "an AI in your voice"
  that talks only about the updates you share.

## 2. How an agent drives a call

**Connection** [VERIFIED from the bridge source and OAuth metadata]:
- A remote MCP server at `https://api.tuwa.ai/mcp` (Streamable HTTP, `MCP-Protocol-Version
  2025-06-18`), protected by OAuth 2.1: `authorization_code` with PKCE S256, **device
  authorization** (`/oauth/device_authorization`), refresh tokens, dynamic client registration
  (`/oauth/register`), revocation; one scope, `tuwa.calls`; public clients (`token_endpoint_auth_methods_supported: none`).
- For hosts that only run local commands, `tuwa-mcp.mjs` (Node 18+, no dependencies, v0.1.0) runs
  the device sign-in (the person opens a link on their own device, checks a short code, signs in)
  and forwards tool calls; tokens in `~/.config/tuwa/credentials.json`, 0600. `TUWA_CLIENT_NAME` is
  shown on the sign-in page ("Muse", "Codex"…).

**The call flow** (SKILL.md, install.md) [DOCUMENTED; tool names seen, schemas not]:
1. `tuwa_call_draft {to (E.164), recipientName, goal, shareable[], privateGuidance, alternatives,
   mustNot, context[{…, source}], scheduledAt?}`. `shareable` = what the voice agent may say (the
   booking name, a callback number); `privateGuidance` = bottom lines it uses but never says (a
   budget ceiling).
2. If it returns `needs_input`, the agent asks the person Tuwa's `questions` and passes the answers
   with `tuwa_call_answer`, until `ready`. "Do not answer for the person."
3. `tuwa_call_request_approval` returns `confirm_in_chat` with a `summary`: who, what will be
   shared, what stays private, when, **which phone dials**.
4. The agent shows the summary as is; the person says yes or no; the agent passes
   `tuwa_confirm {confirmationId, decision, personReply}` with **the person's own words**. Tuwa dials
   only after an approve. Any change after the request voids it (`tuwa_call_revise`, ask again).
5. Payment gates come back as `payment_method_required` (a Stripe `setupUrl`) or
   `prepaid_balance_low` (nothing dialed).
6. The agent polls `tuwa_call_status` every 15–30 s. **Mid-call questions:** a `pendingQuestion`
   means the call is waiting on the person; the agent asks at once and returns exactly their answer
   with `tuwa_call_reply {token}`. Then `tuwa_call_result`, told "exactly as reported: `uncertain`
   means Tuwa could not confirm the result". `tuwa_call_cancel` withdraws a draft or hangs up.
- So the agent never speaks on the call itself: Tuwa's voice agent does (its providers include
  OpenAI and xAI, Policy §6). The agent's tools mid-call are: status polling, answering a pending
  question, cancelling. No webhook or push to the agent is documented; polling only [DOCUMENTED].
- **Results:** a summary "in your language" back in the agent's chat, plus an emailed summary; the
  app shows "both sides afterwards". Whether `tuwa_call_result` carries a full transcript or a
  recording link is **unknown** (not seen without an account).
- Other tools named: `tuwa_settings` (language, timezone, name, **the phone agent's name**, call
  rules, style, result backup channel, **pausing voice sampling**), `tuwa_voices`/`tuwa_voice_set`
  (voices with sample links), `tuwa_own_phone_get/set`, `tuwa_balance`, `tuwa_topup`,
  `tuwa_payment_setup`, `tuwa_spending_limit`, `tuwa_invite`, `tuwa_memory`, `tuwa_contacts`,
  `tuwa_connected_agents`, `tuwa_settings_request_change`, `tuwa_shared_ai` [DOCUMENTED].
- **install.md asks the installing agent to keep Friends updates in sync** ("keeping those updates
  current is your job … If sync is on, you add news … yourself"). That is the vendor's instruction to
  agents, i.e. third-party text; for Ducter it is a privacy question, not an instruction [INFERRED].

## 3. The owner's voice

- **Enrolment** [DOCUMENTED, SKILL.md]: when the person asks, the agent calls
  `tuwa_settings_request_change` with `use_personal_voice`; "their one yes agrees to use it and
  switches calls to it". With no voice yet it answers `no_personal_voice`; the agent offers
  `record_personal_voice` and hands the person a `recordingUrl`: "on that page they agree, read a
  short text aloud and submit. Never open it yourself." Consent and recording happen on Tuwa's page,
  by the person; the agent never handles audio. Older routes: an onboarding call, an audio upload
  endpoint (Policy §4.2).
- **How much audio, and how good:** "a short text" only; length, languages and quality are not
  stated. The site claims "Perfect, emotionally expressive voice cloning" [DOCUMENTED, marketing;
  unverified]. The clone is made by **Fish Audio**, whose processing location the Policy lists as
  **China** ("with data processing agreements in place"); the model is "private" and kept "until you
  request deletion" [DOCUMENTED].
- **Revoking:** deleting voice data needs the person's yes in chat (SKILL.md); the Policy says
  email `privacy@tuwa.ai`, then Tuwa asks Fish Audio to delete the model and deletes the training
  audio [DOCUMENTED]. Turning the personal voice off without deleting it appears to be a setting
  [INFERRED from `use_personal_voice`].
- **"Voice sampling"** is a setting that can be paused and whose consent needs the person's yes:
  Tuwa appears to sample the person's voice from calls to improve the clone [INFERRED; the
  Policy's "voice model training (with your consent)" fits].
- **Whose voice:** the Terms forbid cloning anyone else without that person's explicit consent and
  forbid using clones to impersonate (Terms §5.4, §6.3, §6.7). Yet the site's own showcase is
  "Sofía had her agent call the family in her **late grandfather's** voice". The vendor's marketing
  goes past its own Terms; Ducter should hold the stricter line (§7) [VERIFIED: both texts read].
- **Disclosure on the call:** the site's scripts open with "Grandma, I'm Azhe's AI assistant" and,
  for Friends, "I talk in her voice, but I'm not Mia herself" [DOCUMENTED]. The Policy says the other
  party "is informed that AI translation is being used", and in Japan a Japanese recording notice
  plays (§3.4) [DOCUMENTED]. Whether every agent call opens with an AI disclosure, in every
  language, is **not stated**.

## 4. Numbers, regions, price

**Price** (bundle tables) [VERIFIED as published; DOCUMENTED as what is billed]:

| | USD / min | JPY / min (tax incl.) | CNY / min (WeChat Pay, Alipay) |
|---|---|---|---|
| AI call (agent makes or answers) | $0.30 | ¥50 | CN¥2.0 |
| Live translation (hotline) | $0.40 | ¥65 | CN¥2.8 |

Surcharge when Tuwa dials from **its own line**, by destination (none on your own number, none into
the hotline):

| Zone | USD | Destinations |
|---|---|---|
| 1 | +$0.00 | US, CA, GB, FR/DE/MX/BR/AU landlines |
| 2 | +$0.10 | JP landlines and 050, KR, HK, SG, IN, MX/BR/AU mobiles |
| 3 | +$0.30 | JP mobiles (070/080/090), TW, TH, VN, FR mobiles |
| 4 | +$0.50 | PH, DE mobiles |

"Other countries and regions fall into a zone by what the line costs; a few with very high costs are
not available yet." **Mainland China is not in the published table** [VERIFIED]; whether a call to
a +86 number works is unknown. My expectation is that it is unavailable or unreliable: overseas
caller IDs reaching Chinese mobiles are routinely flagged or blocked [INFERRED]. CNY billing exists,
so Chinese payers are served; Chinese callees may not be.

Rules [DOCUMENTED]: billed from answer; unanswered, busy, failed calls free; rounded up to the
minute; **hold or queue time counts 1 minute per 10**; card charged at $10 owed or on the 1st;
**default spend cap $50/day**, raised only with the person's yes; lowering applies at once; length
and cost reported after each call. Example on the site: 4 minutes to a Japanese mobile from a Tuwa
number = ($0.30 + $0.30) × 4 = **$2.40**. A 3-minute call to a US restaurant ≈ $0.90; to a Tokyo
landline ≈ $1.20.

**Latency:** "under a second" is claimed for the translation hotline [DOCUMENTED, marketing]. Agent
calls are polled every 15–30 s, so what the owner sees lags the call by that much [INFERRED].

**Infrastructure** (Policy §6–7) [DOCUMENTED]: Twilio (telephony, SMS, recordings, US), Agora
(audio routing, recording, US/APAC), Fish Audio (voice, China), OpenAI (ASR/LLM/TTS), xAI (Grok
real-time voice), Stripe/Apple (payments), Cloudflare Workers KV (account data). Recordings "when
enabled" up to 30 days; call logs 24 h; voice models until deletion.

## 5. The law that shapes the design

Not legal advice; I am not a lawyer, and where a source is a law-firm summary rather than the text I
say so.

**United States**
- **AI voices are "artificial voice" under the TCPA.** FCC Declaratory Ruling FCC 24-17 (CG Docket
  23-362, 2024-02-08): calls using AI-generated voices fall under the TCPA's artificial/prerecorded
  voice rules; not a ban, the same consent rules apply [DOCUMENTED: Cooley, Orrick, Wiley summaries].
  Under 47 U.S.C. §227(b)(1)(A)(iii) an artificial-voice call **to a mobile** needs the called
  party's prior express consent (emergencies aside); §227(b)(1)(B) covers **residential** lines;
  business landlines are outside (b)(1)(B) [DOCUMENTED, statute; applying it here is INFERRED].
  Consequence: a one-off AI call to a restaurant's landline is the low-risk case; an AI call to a
  person's mobile (a contractor, a friend, Grandma) is the case the TCPA was written for, and
  "prior express consent" is the callee's, not the owner's. Whether a single, user-directed,
  conversational call is treated like a "robocall" in practice is unsettled [INFERRED].
- **Identify at the start.** 47 CFR §64.1200(b): every artificial-voice message must state at the
  beginning who is responsible for the call, and a callback number [DOCUMENTED: rule text copies].
  This argues for an opening line naming the owner, and for a callback number.
- **AI-call disclosure rule, proposed:** the FCC's 2024 NPRM (Federal Register 2024-09-10) would
  define "AI-generated call" and require disclosure at the start of each one. I found no final rule
  [DOCUMENTED that it was proposed; status uncertain].
- **California** AB 2905 (Stats. 2024 ch. 316, PUC §2874, from 2025-01-01): an automatic
  dialing-announcing device must say whether a prerecorded message uses an artificial voice
  [DOCUMENTED: legislative pages]. Whether a live conversational agent is such a device is unclear
  [INFERRED].
- **Recording:** all-party consent states (California and others) [DOCUMENTED, Tuwa Terms §4.3];
  the duty to inform falls on the user (Tuwa Terms §4.2).
- **Voice as likeness:** several states protect a person's voice against unauthorized AI use (e.g.
  Tennessee's ELVIS Act, 2024) [INFERRED from general knowledge; not checked in this pass]. Only the
  owner's own voice, with the owner's consent, avoids the question.

**European Union**
- **AI Act Article 50, applying from 2026-08-02:** (1) providers must design systems that interact
  with people so that the people are told they are dealing with an AI, unless obvious; (2) providers
  of synthetic-audio systems must mark output machine-readably (systems already on the market have
  until 2026-12-02); (4) deployers must disclose deep-fake audio, i.e. audio resembling a real person
  that would falsely appear authentic [DOCUMENTED: Sidley, Morgan Lewis, Travers Smith summaries; the
  Commission's guidelines are still settling]. A call in the owner's cloned voice without saying it
  is AI is the textbook case.

**China**
- **Deep Synthesis Provisions** (互联网信息服务深度合成管理规定, in force 2023-01-10): Art. 12, a
  service offering significant editing of 人声 (voice) must prompt the user to inform the person whose
  voice it is and obtain their **单独同意 / separate consent**; Art. 14, synthetic or imitated voice
  must carry a conspicuous label, for audio by a spoken notice or similar [DOCUMENTED: CAC text,
  chinalawtranslate].
- **AI-generated content labelling measures** (人工智能生成合成内容标识办法) and the mandatory national
  standard, from **2025-09-01**: explicit labels (including spoken prompts in audio) and implicit
  metadata labels; removing them is prohibited [DOCUMENTED: news.cn, thepaper].
- PIPL Art. 28–29: biometric data (a voiceprint) is sensitive personal information needing separate
  consent; Civil Code Art. 1023 protects the voice by analogy to portrait rights [DOCUMENTED, statute
  texts; not re-read in this pass].
- Telemarketing and AI outbound-calling rules (MIIT) target marketing; personal one-off calls are not
  their aim [INFERRED].

**Japan:** APPI governs the voice data and cross-border transfer; Tuwa plays a Japanese recording
notice. I found no Japanese law requiring an AI disclosure on a call [INFERRED; not searched deeply].

**Tuwa's own rules** [DOCUMENTED, Terms §6]: no impersonation, no deepfakes, no harassment or scams,
**no emergency calls** (911/110/119), no third-party voices without consent, no resale "without our
prior written consent" (Ducter does not resell: the owner holds their own Tuwa account [INFERRED]).

**What this adds up to, for any design** [INFERRED]: (a) always say it is an AI and for whom, in
both voices, at the start; (b) only the owner's own voice, with consent the owner gives on the
voice provider's page; (c) the owner approves each call (the effect is theirs, in their name);
(d) no calls to emergency numbers, no marketing, no calls a stranger's message asked for;
(e) careful with mobiles of private people in the US (consent is the callee's).

## 6. Alternatives

| Option | What it is | Fit for Ducter |
|---|---|---|
| **Tuwa** | Consumer service: the owner's account, approval in chat built in, owner's voice, own number via Mac + iPhone, JP/US/EN/ZH focus, $0.30/min + zone | Closest to the product Ducter wants; MCP + OAuth so it slots into the broker; young vendor, terms lag product, no transcript API seen, mainland China callees likely out |
| **Vapi / Retell / Bland** | Developer voice-agent platforms; ~$0.05–0.14/min platform fee, all-in ~$0.07–0.31/min with STT, LLM, TTS and carrier [DOCUMENTED: third-party comparisons, numbers disagree] | Ducter would own numbers, KYC, carrier compliance, disclosure, cloning consent; heavy for a self-deployed personal AI |
| **ElevenLabs Agents** | Agents + best-known voice cloning (Professional/Instant), SIP/Twilio | Same ownership burden; strongest voice quality; a key, not an account flow |
| **Twilio + OpenAI Realtime (SIP) / ConversationRelay** | Build it: carrier + speech-to-speech model | Most control and BYO; most work; Ducter becomes a telephony operator |
| **Telnyx Voice AI** | Carrier with built-in voice AI (~$0.05/min advertised) | Cheaper raw minutes; same burden |

Prices from comparison blogs (morphllm, techsy, telnyx.com) vary by source and month; verify on each
vendor's page before relying on them.

## 7. Implications for Ducter

1. **Tuwa fits as a connection, not as a harness feature.** It is a remote MCP server with OAuth;
   Ducter's broker (`design/connectors.md` §18) already holds tokens away from harnesses and gates
   writes with one Go card. What is missing is the broker's MCP OAuth sign-in (§18.3 says "later"):
   Tuwa's device flow (a link and a short code the owner opens on their phone) is the cheapest version
   of it and is also what other OAuth-only MCP servers need. Do **not** run `tuwa-mcp.mjs` inside
   tasks: its credentials file would sit in the task's reach, against D102.
2. **Tuwa's approval model and Ducter's effect gate agree.** Tuwa dials only after `tuwa_confirm`
   carries the person's own reply; Ducter's Go card is the person's own tap. Map one to the other: the
   card shows Tuwa's `summary` as is, and its Go is passed as `personReply`. Never auto-Go a call; the
   GQ4 "don't ask next time" offer must exclude calls.
3. **Mid-call questions are the one urgent thing.** `pendingQuestion` means someone is waiting on
   the line. It needs the highest rung of the ladder (push), a card that says the line is waiting,
   and a fallback when the owner doesn't answer (the agent says it will call back). Polling 15–30 s
   is acceptable for status; a pending question should be polled faster while a call is live.
4. **The owner's voice belongs to Tuwa's page, not Ducter.** Enrolment and consent happen where the
   voice is made (and stored, by Fish Audio in China). Ducter keeps only the fact "voice enrolled,
   on/off" and links to Tuwa for delete. Ducter must never upload audio it holds (voice messages,
   recordings) to make a clone, and must refuse any voice but the owner's, whatever Tuwa's marketing
   shows.
5. **Disclosure is non-negotiable, in both voices**, and its words are Ducter's to ask for (via
   `goal`/`mustNot` and the agent-name setting) since Tuwa's per-call opening line is not documented.
6. **Money stays the owner's act** (the floor): Tuwa's Stripe, WeChat Pay or Alipay pages; Ducter
   lowers Tuwa's daily cap at connect and shows an estimate on every card.
7. **Friends and voice sampling are off by Ducter's choice**: Ducter does not sync the owner's life to
   Tuwa Friends, whatever install.md asks of agents.
8. **Region honesty:** say plainly that calls to mainland China numbers likely don't work through
   Tuwa; US/JP/EU destinations do; own-number calls need a Mac with the owner's iPhone nearby (not a
   Linux server home).
9. **Keep it vendor-neutral** (principle 17): the design names "a calling connection" with Tuwa as
   the first one; a self-built Twilio/Realtime path can slot in later behind the same card.

## 8. With an account (added 2026-11-11, for D193)

The author signed up and approved a device login; the coordinator holds the token. Read-only checks
only: no draft, approval, confirm or settings change was made.

- **OAuth** [VERIFIED]: dynamic registration with only the device grant answers
  `invalid_redirect_uri` (it wants `redirect_uris`); `device_authorization` accepts an empty
  `client_id` with `scope=tuwa.calls` and `resource=https://api.tuwa.ai/mcp` and answers
  `verification_uri` `…/oauth/device`, `verification_uri_complete` `…?user_code=XXXX-XXXX`,
  `expires_in` 900, `interval` 5. Access tokens last 3600 s, with a refresh token.
- **Cloudflare** in front refuses some default user agents with a 403, error 1010
  (`browser_signature_banned`) [VERIFIED]: a client must send its own User-Agent.
- **The tool list** (28 tools, with input schemas) [VERIFIED]: every call tool takes `taskId`;
  `tuwa_call_draft` takes `to, goal, successCriteria, shareable[], privateGuidance, alternatives[],
  mustNot[], talkAbout[], avoid[], voice (built_in | personal), remember[], context[{fact, source}],
  recipientName, country, scheduledAt (ISO with offset), dialer (tuwa | my_phone | desktop_app),
  fromNumber, desktop, mode (agent | live_translate)`; `tuwa_call_answer` takes `answers[{question,
  answer, confirmedByPerson}]`; `tuwa_call_reply` takes `taskId, token (Q + 5), decision (accept |
  decline | text), text`; `tuwa_call_status` reports `draft, awaiting_confirmation, scheduled,
  executing, succeeded, partial, failed, canceled, uncertain`; `tuwa_call_result` gives `outcome,
  outcomeSummary`, duration, open loops, and for calls placed from this agent the voice agent's
  summary and the transcript when available; `tuwa_spending_limit` takes `dailyLimitCents`
  (default 5000); `tuwa_settings` takes `agentName, displayName, voiceSampling (paused | on),
  tuwaInboundRecords, translationVoice…`; `tuwa_settings_request_change` takes `change
  (use_personal_voice | record_personal_voice | voice_sampling_consent | delete_voice_data |
  delete_account)`; `tuwa_confirm` takes `confirmationId, decision (approve | decline), personReply`.
- **Where Tuwa's numbers call** (the `to` description) [VERIFIED]: US, Canada, Japan, South Korea,
  UK, Germany, France, India, Brazil, Australia, New Zealand, Thailand, Philippines, Singapore,
  Malaysia, UAE, Nepal, Hong Kong, Macau, Taiwan; never premium-rate numbers. Mainland China is not
  there: §4's "likely unavailable" is now a fact.
- **Still unseen** [INFERRED]: the shape of each tool's answer (field names of the draft id, the
  approval summary, a pending question's yes/no marker and choices, the result's cost and
  transcript). Ducter reads them by likely names; `design/phone.md` §9 lists what to check.

## Summary

Tuwa (chekusu Inc.) already offers what the author asked for, as a consumer service with an agent
interface: an MCP server with OAuth device sign-in through which any agent drafts a call, gets the
person's yes in chat, lets Tuwa's own voice agent call (in a Tuwa voice or the owner's cloned voice,
from a Tuwa number or the owner's own iPhone number via a Mac), relays mid-call questions, and reads
back a result. $0.30/min plus a destination surcharge from Tuwa's line ($0 US/UK landlines to +$0.50),
CN¥2.0/min via WeChat/Alipay, $50/day default cap. Voice enrolment is a short read-aloud on Tuwa's
page, cloned by Fish Audio (China). Unknowns: the full tool schemas, whether results include
transcripts or recordings, the exact disclosure line, clone quality, and mainland China reach
(likely none). The law converges on: say it is an AI at the start (FCC §64.1200(b), EU AI Act
Art. 50, China's deep synthesis and labelling rules), only clone a voice with that person's separate
consent, be careful with US mobile and residential numbers, and never impersonate. Ducter should
take Tuwa as a broker connection behind its existing Go gate, the partner as the only caller,
disclosure in both voices, the owner's voice enrolled on Tuwa's page, and money and Friends left to
the owner.

## Sources

- Tuwa: `https://tuwa.ai` (site bundle `assets/index-DQuYJ7rY.js`), `https://api.tuwa.ai/agent/install.md`,
  `https://api.tuwa.ai/agent/install/SKILL.md`, `https://api.tuwa.ai/agent/install/tuwa-mcp.mjs`,
  `https://tuwa.ai/privacy-policy.md`, `https://tuwa.ai/terms-of-service.md`,
  `https://api.tuwa.ai/.well-known/oauth-authorization-server`, `…/oauth-protected-resource`
  (all fetched 2026-11-11).
- Directory listing: https://navtools.ai/tool/tuwa-ai
- FCC 24-17: https://www.cooley.com/news/insight/2024/2024-02-15-fcc-ai-generated-robocalls-illegal-under-the-tcpa ,
  https://www.orrick.com/insights/2024/02/Did-the-FCC-Really-Ban-AI-Generated-Voice-Calls-No-But-Restrictions-Apply ,
  https://wiley.law/alert-FCC-Extends-Regulatory-Reach-Over-AI-Announces-TCPA-Restrictions-Cover-AI-Generated-Voices-in-Outbound-Calls
- FCC NPRM: https://www.federalregister.gov/documents/2024/09/10/2024-19028/implications-of-artificial-intelligence-technologies-on-protecting-consumers-from-unwanted-robocalls
- 47 CFR 64.1200: https://web.mit.edu/bjaspan/www/tcpa/47cfr64.1200.html (copy; check eCFR for current text)
- California AB 2905: https://law.justia.com/codes/california/code-puc/division-1/part-2/chapter-10/article-1/section-2874 ,
  https://legiscan.com/CA/text/AB2905/id/2981302
- EU AI Act Art. 50: https://datamatters.sidley.com/2026/06/24/eu-ai-act-transparency-obligations-preparing-for-compliance-by-2-august-2026/ ,
  https://www.morganlewis.com/blogs/sourcingatmorganlewis/2026/08/eu-ai-acts-transparency-rules-what-went-into-effect-on-2-august ,
  https://www.traverssmith.com/knowledge/knowledge-container/is-it-a-bot-eu-ai-act-transparency-rules-take-effect-2-august-2026/
- China: https://www.cac.gov.cn/2022-12/11/c_1672221949354811.htm , https://www.chinalawtranslate.com/deep-synthesis/ ,
  https://www.news.cn/digital/20250902/d08b592223954340af8c02ac3d7161e1/c.html
- Alternatives (prices vary): https://www.morphllm.com/comparisons/vapi-vs-retell-vs-bland-vs-synthflow ,
  https://techsy.io/en/blog/ai-voice-agent-pricing , https://telnyx.com/pricing/voice-ai
