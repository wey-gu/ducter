# 60. Phone calls to mainland China (+86): the reference repo, the law, the ways to reach a Chinese phone, and what Ducter can do lightly

Date: 2026-11-12. Question (the author): "我发现 tuwa 不支持中国大陆，我们用户现在全球只差这个不支持，
你可以帮我研究一下，是否能做到轻盈的支持呢，我看到一些可能有帮助的，比如
https://github.com/ustczz/openclaw-ai-calls-china-phone 给你做参考别受它限制，如果需要，看看我们是否可能做一个
tuwa like 的服务，我不懂中国的情况不知道是否合规".

Context. Ducter calls through Tuwa (research/53, D189, D193, D208). Tuwa's schema lists 20 countries
its numbers can call, and mainland China is not one of them, so Ducter drafts no call to +86 (D193 (6)).
D189 (11) left "calls from the owner's own number" out of v1. Phone use (an Android phone driven by
Ducter over adb, research/22 §1) is being built.

Method. No account, no sign-up, no call, nothing spent, no third-party code run. I cloned the
reference repo (`git clone --depth 1`, commit `317697c`, 2026-11-04) into the session scratchpad and
read it. I read Chinese primary texts on official sites (cac.gov.cn, gov.cn) where they loaded,
Chinese news and law-firm summaries where they did not, and vendors' own documentation. Several
government pages (MIIT, secrss, chinalawtranslate) refused or reset the connection. Where I relied on
a news report of a rule instead of its text, I say so. **This is not legal advice. §6 lists what a PRC
lawyer must confirm.**

Tags: **VERIFIED** = I saw it directly (a file, a page's text). **DOCUMENTED** = a vendor, an official
text or a reputable report says so; not tested. **INFERRED** = my reading; may be wrong.

---

## 1. The reference repo: `ustczz/openclaw-ai-calls-china-phone` ("ClawCall")

**What it is.** An OpenClaw skill (`SKILL.md`, shell wrappers, and a Python client
`scripts/stepone_client.py`, MIT-0), published to ClawHub as `@ustczz/ai-calls-china-phone` v1.0.17.
It places **no call itself**. It is a thin client for **StepOne AI's (基智科技) hosted China phone
API** (`open-skill-api.steponeai.com`, `X-API-Key`) [VERIFIED: `references/api.md`, the client].
The README opens with StepOne's product links and a WeChat QR for business contact [VERIFIED].
StepOne describes itself as an "智能拓客" (AI sales-prospecting) company for businesses. Third-party
records say it was founded in 2020 in Shanghai and acquired by 彩讯科技 in 2026-03 for CN¥364m
[DOCUMENTED: pitchhub.36kr.com; not checked against filings]. So the repo is a marketing channel for
an enterprise outbound-calling vendor that now has a consumer-shaped door [INFERRED].

**How the call is placed.** On StepOne's side, over its own carrier lines; the repo can't show which
carrier or number type [VERIFIED: nothing in the repo names them]. The client:
- calls **one number per request**, and only a mainland **mobile** number: `^1[3-9][0-9]{9}$`, `+86`
  normalised to 11 digits [VERIFIED: `CHINA_MOBILE_RE`]. Landlines (a restaurant's `010-…`) are refused
  by the client. Whether the server takes them is unknown.
- refuses to dial without `--confirm`, which the skill tells the agent to add only after the person
  approves that one call [VERIFIED: `SKILL.md` "必须遵守" 1–2].
- **prepends fixed safety rules to every task** [VERIFIED: `CALL_SAFETY_RULES`]: "开场明确说明自己是 AI
  助手，并说明受谁委托及本次来电目的", ask for no passwords, codes or card numbers, hang up at once when
  asked, and hang up when the task is done.
- sends an `Idempotency-Key` and never retries the POST. When the result is unclear it reads the call
  log before anything else, the same rule as D208 (8) [VERIFIED].
- treats transcripts and server replies as untrusted data and strips "instruction-type fields" from
  JSON before printing [VERIFIED].

**The key compliance device: a callee whitelist for individuals.** "个人账号只能拨打注册手机号和已验证的白名单号码
（最多 20 个）……（企业认证账号不受限）". Adding a number sends a real SMS code to that number's owner, who
must tell you the code [VERIFIED: README, `references/api.md`]. So an individual's account can call
only people who agreed by SMS first. **That rules out the main errand: calling a restaurant or a
clinic you have never called before.** Calling anyone needs StepOne's **enterprise verification**
[VERIFIED: the docs say so; what the verification asks for is not shown].

**The AI voice loop.** Hosted by StepOne: `model_engine` (e.g. `stepone-mini`), `voice_id`, speed,
volume, emotion, interruptions on or off, an `end_call` tool, and live transcript over SSE
(`stream_chat_history`) [VERIFIED: api.md]. ASR, TTS, the LLM and latency are not disclosed
[VERIFIED: absent]. New users get 5 trial calls, and the price is shown only in the console
[DOCUMENTED: SKILL.md; the console didn't load for me].

**What it asks of the user.** Sign up at `open-skill.steponeai.com` (the sign-up requirements weren't
visible), create an API key, put it in an environment variable, and run `doctor` [VERIFIED].

**Legal posture as stated.** One number at a time, confirmation each time, no bulk marketing,
harassment, impersonation or emergency numbers, AI disclosure at the opening, notice when recording,
and a citation of 消费者权益保护法实施条例 Art. 24 [VERIFIED: `docs/openclaw-ai-outbound-guide.md`]. It
cites no licence, filing or 备案 number [VERIFIED: absent].

**What Ducter takes from it.** (1) Ducter's rails already match theirs: one number, approval each
time, AI disclosure first, the read-before-retry rule. (2) The SMS whitelist shows **how a compliant
China provider treats an individual caller: only people who have agreed.** (3) Mobile only. (4) It is
a *provider*, so it could sit behind Ducter's `phone-provider.ts` interface like Tuwa, but only an
enterprise account makes it useful for errands [INFERRED].

---

## 2. Regulation

### 2.1 Outbound calls, harassment and number management

- **消费者权益保护法实施条例** (State Council, in force 2024-07-01), **Art. 24**: "未经消费者同意，经营者不得向消费者
  发送商业性信息或者拨打商业性电话。" Consent must come with an easy way to withdraw it. Penalties follow
  消保法 Art. 56 (Art. 50, last paragraph) [VERIFIED: gov.cn text]. Art. 56 allows fines of 1–10 times
  the illegal gains, or up to CN¥500,000 when there are none [DOCUMENTED: the statute; I didn't load
  it]. **This binds a 经营者 calling a 消费者. It doesn't reach a person who calls a shop to book a table**
  [INFERRED: a plain reading].
- **工信部《关于加强呼叫中心业务管理的通知》** (2020-06-18) [DOCUMENTED: 每日经济新闻 2020-06-20; the
  document number wasn't confirmed]:
  - call-centre licensees may not offer marketing outbound calls ("不允许提供商业营销类电话呼出服务");
  - their access numbers (the 95/96 numbers) are in principle **inbound only** ("原则上……只开通呼入功能");
  - each number's carrier, use, and inbound/outbound status must be filed, and numbers may not be
    sublet;
  - carriers may not connect firms that place marketing calls;
  - violators go on credit blacklists.
- **十三部门《综合整治骚扰电话专项行动方案》** (工信部联信管〔2018〕138号) targeted three things: marketing
  calls, malicious harassment, and fraud calls. Its measures covered voice-line and number
  management and regulating marketing outbound calls [DOCUMENTED: news summaries].
- **工信部 号码保护服务 pilot** (2025-07): masked "middle numbers" (中间号) move to a dedicated 700 range,
  subletting is banned, and marketing calls are controlled [DOCUMENTED: 新华网 2025-07-04].
- **What is enforced in practice.** In 2025-10 a China Telecom branch was fined CN¥1m for passing false
  caller IDs that carried marketing calls; its call-centre partner was fined CN¥500k [DOCUMENTED: c114
  2025-10-16]. Carriers' fraud models apply **保护性停机** (protective suspension) to SIMs that behave
  abnormally, and some users have sued over it [DOCUMENTED: news, 2025-12].
- **Unverified.** Secondary blogs claim a 2025 MIIT call-centre notice that requires 30-day recording
  retention and "AI robots on carrier whitelist lines". I couldn't find its text, so don't rely on it.
  The 2020 draft **《通信短信息和语音呼叫服务管理规定》** was never final under that name. The revised
  **《通信短信息服务管理规定》** (工信部令第74号, in force 2026-05-01) requires explicit opt-in for
  commercial SMS [DOCUMENTED: 中新网 2026-05-22]. Whether it also covers voice calls is unconfirmed.
- **Media and expert view.** "边界判断的核心在于用户是否事先明确同意", and pure cold commercial sales "应该严格
  限制" [DOCUMENTED: 中国之声 via 中新网 2026-07-28, 谢永江 of BUPT]. The 2025 CCTV 3·15 gala exposed AI
  robo-marketing chains, and the lines involved were shut down [DOCUMENTED].

### 2.2 Anti-fraud law: the rule that decides which hardware is allowed

**反电信网络诈骗法** (in force 2022-12-01) [DOCUMENTED: the text as reprinted by 12371.cn]:
- **Art. 9–11:** SIM cards are real-name; carriers may restrict or suspend a card whose use looks
  abnormal until it is re-verified.
- **Art. 13:** international gateways must show callers the true originating country or region, and
  carriers must block false or irregular caller IDs. This is the legal basis of 境外来电提醒.
- **Art. 14:** "任何单位和个人不得非法制造、买卖、提供或者使用" (1) "电话卡批量插入设备" and (2) "具有改变主叫号码、
  虚拟拨号、**互联网电话违规接入公用电信网络**等功能的设备、软件".
- **Art. 42:** penalties for Art. 14 are a fine of 1–10 times the illegal gains, **up to CN¥500,000 when
  there are none**, and, in serious cases, up to 15 days' detention.

Customs and police name **GoIP** gateways under Art. 14 [DOCUMENTED: a customs notice reported by IT之家].
A SIM gateway that turns an internet (SIP) call into a mobile call is exactly "互联网电话……接入公用电信网络"
equipment [INFERRED, and strongly]. **Ducter must never use or recommend a GSM/LTE voice gateway
(GoIP, Dinstar, Yeastar's SIM modules) with a Chinese SIM.**

### 2.3 AI-specific rules

- **互联网信息服务深度合成管理规定** (CAC, in force 2023-01-10) [VERIFIED: cac.gov.cn text]:
  - Art. 2 covers deep-synthesis *internet information services* in mainland China.
  - Art. 9 requires real-name users.
  - Art. 14: editing a face or a **voice** (人声) needs the edited person's **单独同意** (separate consent).
  - Art. 17: providers must **显著标识** "智能对话……模拟自然人" and "合成人声、仿声" where the public may be misled.
  - Art. 19: providers with 舆论属性 or 社会动员能力 must file under the algorithm-filing rules.
  - Art. 22: penalties come from other laws.
- **人工智能生成合成内容标识办法** (CAC, MIIT, MPS and NRTA, in force **2025-09-01**) [VERIFIED: cac.gov.cn text]:
  - Art. 4(2), for audio: "在音频的**起始**、末尾或者中间适当位置添加**语音提示**或者音频节奏提示等标识".
  - Art. 10: users who publish AI content must declare it; no one may remove or hide the label.
  - Art. 13: enforcement is by CAC, MIIT, MPS and NRTA under their existing powers.
  - A spoken "this is an AI assistant" at the start of a call **is the explicit label the measure names**.
    Ducter's opening line (D189 (7)) already does this [INFERRED].
- **生成式人工智能服务管理暂行办法** (in force 2023-08-15) [VERIFIED: cac.gov.cn text]:
  - Art. 2 covers generative AI services offered "向中华人民共和国境内公众", and does **not** apply to
    organisations that develop or use it without offering it to the domestic public.
  - Art. 17: safety assessment and algorithm filing apply only to services with 舆论属性 or 社会动员能力.
  - Art. 20: an overseas service offered into China that doesn't comply may be technically blocked.
  - **Inferred consequences.** A user running their own Ducter isn't "providing a service to the
    public". Ducter's maker shipping open-source software isn't either. A maker-run calling service for
    the Chinese public would be, and would need 生成式AI 备案 (748 services were filed by 2025-12-31,
    per IT之家) or would have to run on a model already filed.
- **人工智能拟人化互动服务管理暂行办法** (in force 2026-07-15) covers *continuous emotional-companionship*
  services. It explicitly excludes customer service and work assistants [DOCUMENTED: 中伦's summary of
  Art. 2]. An errand call is not companionship, so it likely doesn't apply [INFERRED].

### 2.4 Personal information

- **个人信息保护法** [DOCUMENTED: statute; npc.gov.cn didn't load for me]:
  - **Art. 72: "自然人因个人或者家庭事务处理个人信息的，不适用本法。"** A person whose own self-hosted Ducter
    calls a clinic for them is very likely within this household exemption [INFERRED].
  - Ducter's maker running the service would be a 个人信息处理者 for the callee's voice and words. It
    would need notice (Art. 17) and a lawful basis (Art. 13). Recording and transcribing a stranger
    is the hard part. "This call is handled by an AI and transcribed" at the opening is the honest
    minimum [INFERRED].
  - A voiceprint used to *identify* someone is sensitive biometric data (Art. 28). A transcript is not.
    Ducter keeps no recordings in v1 (D189 (9)).
- **Cross-border: 促进和规范数据跨境流动规定** (CAC Order No. 16, in force 2024-03-22) [VERIFIED: cac.gov.cn
  text]. Art. 5 exempts two cases from assessment, standard contract and certification:
  - transfers "为订立、履行个人作为一方当事人的合同……机票酒店预订……确需" (needed to make or perform a contract
    an individual is party to, such as booking a flight or hotel);
  - transfers by a non-CIIO of personal information on fewer than 100,000 people in a year, sensitive
    data excluded.

  Sending a call's transcript to an overseas LLM is **not a filing problem for an individual or a
  small operator**, but it still needs notice and a lawful basis [INFERRED].
- **Recording without notice.** No PRC statute makes one-party recording itself unlawful. Courts admit
  such recordings unless they seriously infringe others' rights [DOCUMENTED: general understanding of
  the 民事诉讼 evidence rules; I didn't load the rule]. Ducter doesn't record (D189 (9)), so this matters
  only if that changes.

### 2.5 Is an individual calling for themselves treated differently?

Yes, in every rule above that has a subject:
- **Consent for calls** binds 经营者 calling 消费者 (Art. 24).
- **Call-centre licensing and number rules** bind licensees and carriers.
- **Labelling and generative-AI filing** bind *service providers* that serve the public. The user's
  own duty is not to strip the label (Art. 10).
- **PIPL** excludes personal and household processing (Art. 72).

The rule with **no individual carve-out** is the anti-fraud law's device ban (Art. 14, "任何单位和个人").
The carriers' fraud models also judge a SIM by its behaviour, not its purpose [DOCUMENTED / INFERRED].

### 2.6 The legal bottom line per scenario

| Scenario | Bottom line | Strength |
|---|---|---|
| **(a) An individual's own AI calls a business** (booking, clinic, delivery) with the individual's own number, says it is an AI acting for them, at a normal hour, one call | **Lawful in all likelihood.** It isn't a 商业性电话; the opening line meets the audio-labelling rule; the household exemption covers PI. Risks are practical (the callee hangs up, the carrier flags an odd pattern), not legal | INFERRED from primary texts; no regulator has spoken to this case. Alibaba's 千问 App already runs AI restaurant-booking calls for consumers (财联社 2026-01-26), which shows the activity is tolerated, though that is Alibaba, licensed and on its own lines |
| **(b) The AI calls an individual** (a friend, a landlord, a tradesperson's mobile) | Lawful for **non-commercial** personal calls with disclosure. **Marketing or cold commercial calls to individuals without prior consent: unlawful** (Art. 24) and the exact target of 骚扰电话 enforcement. Voice cloning of anyone but the owner needs that person's separate consent (Art. 14) and stays banned in Ducter (D189 (6)) | DOCUMENTED (Art. 24, Art. 14); INFERRED for the personal case |
| **(c) Ducter's maker runs a calling service for users** | **Not lightly possible.** See §4 C: a Chinese entity, lines bought under enterprise qualification with scripts filed (话术报备) and SIP tagging (SIP 打标), possibly a licence, generative-AI and deep-synthesis filing, PI-processor duties, and liability for every user's call. Licensed firms do run it (StepOne, Alibaba's 千问), and even they lock individuals to SMS-verified callees | DOCUMENTED (vendor rules) + INFERRED (licence mapping), **needs a lawyer** |

---

## 3. Ways to place a call to +86

### 3.1 China cloud voice products (enterprise only)

| Provider | Live two-way AI? | Who may use it | Price | Evidence |
|---|---|---|---|---|
| **阿里云 语音服务 (VMS)** | **No.** "目前不支持 Agent 呼叫电话并进行双方实时双工通信，也暂不支持 SIP 协议对接"; only fixed verification-code or notification templates to specified numbers | Enterprise qualification, separate from account real-name and required by the carriers; **"个人用户（含学生毕业设计等场景）不支持使用语音服务及智能外呼机器人"**; 个体工商户 and sole-proprietor firms refused; scripts filed and reviewed within 1 working day; a mismatch with the filed use suspends the service; dedicated numbers take 2–10 days, are locked for 3 months, and resources are short | Template notices billed per minute | VERIFIED (FAQ page text); eligibility lines DOCUMENTED (help.aliyun.com search excerpts) |
| **阿里云 智能媒体服务 IMS · AI实时互动** | **Yes.** ASR → LLM → TTS agents calling mobiles "通过运营商线路", inbound too; "AI电话呼入、电话呼出因合规风险，目前尚未默认开放" | VMS enterprise qualification + filed script + a dedicated real number bound to a virtual number + **SIP 打标 by sales** ("未完成SIP打标评估，对应号码无法在该场景使用") + sales review | List prices per 1,000 min: agent ¥32.8, ASR ¥58, TTS ¥7.2, carrier ¥110 (so **~¥0.21/min**) + number ¥35/month; their example: 1,000 min ≈ ¥243 | VERIFIED (help.aliyun.com page text) |
| **华为云 语音通话** | Notification, call-back, verification code | The service agreement allows calls only to internal staff or registered users who agreed; bans calling those who haven't agreed and calling at rest hours; restricted industries include "面向个人用户的网络电话业务" | n/a | DOCUMENTED (search excerpt of the agreement) |
| **腾讯云 语音消息 VMS** | Notification and verification code | Enterprise (inferred, same carrier rules) | n/a | DOCUMENTED (product page); eligibility INFERRED |
| **容联云, carriers' 新通话** | 容联 sells enterprise AI outbound. China Mobile's 新通话 (2026-06) puts AI features in the native dialer, and ZTE demoed in-call agents, but **no consumer "AI calls for you" product was found** | Enterprise | n/a | DOCUMENTED (news); not checked in depth |
| **StepOne ClawCall** (§1) | Yes, live, with transcript | Individuals: only themselves and up to 20 SMS-verified numbers; enterprise-verified: anyone | Console only; 5 free calls | VERIFIED (repo) |

**Pattern.** Every China path that dials strangers needs a **verified enterprise, a filed use, and
carrier tagging of the line** [VERIFIED across Aliyun; consistent elsewhere]. A personal user can't
open one.

### 3.2 Overseas carriers calling +86

- **Twilio:** "Outbound calls to Mainland China are not supported." [VERIFIED: twilio.com/en-us/guidelines/cn/voice].
  Twilio's support notice dates this to 2023-11-30, because of "strict traffic profile monitoring" by
  local operators [DOCUMENTED].
- **Amazon Connect** (2026-05-15 blog): calls only from pre-approved numbers, after a support request
  with the exact number list and the use case; no toll-free or UIFN caller IDs (UIFN is blocked);
  about ≤5 calls/min per caller ID; caller ID must be 100% compliant; non-compliance "can lead to lost
  calling capability" [VERIFIED: aws.amazon.com page text].
- **Vonage:** termination is possible but heavily filtered, and blocked calls come without warning;
  only a Vonage number as caller ID; no short calls or marketing [DOCUMENTED]. **Plivo:** use cases
  evaluated case by case [DOCUMENTED, old page]. **Telnyx:** no clear statement found.
- **On the callee's side.** Art. 13 means the callee's phone shows the true foreign origin, and since
  2025-03 the carriers show **境外来电提醒** [DOCUMENTED: MIIT via 新京报 2026-06]. MIIT also promotes
  switching foreign calls off for people with no overseas contacts, and 5.87 亿人次 have used that
  service [DOCUMENTED]. **A foreign number calling a Beijing restaurant is the profile of a fraud call:
  it is labelled, often blocked, and usually not answered** [INFERRED, and strongly]. This is why Tuwa
  leaves China out (research/53 §4).
- **Verdict:** blocked, unreliable or both, whatever the paperwork. Not a path [INFERRED].

### 3.3 The user's own phone and SIM

Ducter would drive a real Android phone with a Chinese SIM in the user's name. It places an ordinary
call from the user's own number, and the AI's voice is bridged in and out.

**Dialing and hanging up over adb** works without root:
- `am start -a android.intent.action.CALL -d tel:…` to dial;
- `input keyevent KEYCODE_ENDCALL` to hang up;
- `dumpsys telephony.registry` for the call state.

This is standard adb and fits android-use and phone use (research/22 §1) [INFERRED: well-known adb
behaviour, not tried here].

**Getting audio in and out is the hard part:**

| Route | Works? | Quality | Notes |
|---|---|---|---|
| An app on the phone captures or injects call audio | **No** (no root) | — | `AudioSource.VOICE_CALL` needs `CAPTURE_AUDIO_OUTPUT`, "reserved for use by system components and is not available to third-party applications" [DOCUMENTED: developer.android.com]. Injecting into the uplink has no public API [INFERRED]. Accessibility-service capture tricks are unverified and against Play policy |
| **Wired headset bridge**: a USB-C-to-3.5 mm adapter (or the jack) + a TRRS splitter + a USB sound card on the home computer; the phone thinks a headset is plugged in | **Yes** [INFERRED: Android routes call audio to a wired headset with a mic by default; the classic "phone patch"] | Narrowband or wideband call audio, no acoustic echo, ~10 ms added | ~¥50–100 of parts; the phone must sit next to the home computer; Ducter runs ASR → LLM → TTS or a realtime speech model on the computer |
| **Bluetooth HFP**: a computer pairs with the phone as a hands-free "car kit" | **Yes on Linux** (oFono or BlueALSA in the HFP-HF role; PipeWire's native HF role is shaky) [DOCUMENTED: BlueALSA wiki, PulseAudio commits]. **Not on macOS**: no public API for the HF role [INFERRED] | SCO audio, 8 kHz (CVSD) or 16 kHz (mSBC) | Wireless; a Raspberry Pi could be a "Ducter car kit"; more moving parts |
| Speakerphone + a speaker and mic beside the phone | Technically yes | Poor: echo, room noise, the callee hears a room | Demo only |
| VoLTE or Wi-Fi calling as SIP from the handset | **No**: the IMS credentials stay in the SIM and the modem, and no user API exists [INFERRED] | — | — |
| **A GSM/LTE voice gateway** (GoIP, Dinstar, Yeastar) with a Chinese SIM | Technically yes | Good | **Banned in practice:** 反诈法 Art. 14 ("互联网电话违规接入公用电信网络", batch SIM equipment), up to CN¥500k; carriers detect static-IMEI, high-volume SIM boxes and suspend the card. **Never** |

**Legal posture of the own-phone route.** The user calls with their own real-name number, as
themselves, through an AI that says what it is. That is the posture of scenario (a)/(b) above
[INFERRED]. Two residual risks:
1. **The Art. 14 reading.** A phone wired to a computer whose voice comes from an AI is not a "device
   that connects internet telephony to the PSTN" in the ordinary sense. But if the phone sat in one
   place and was driven *remotely* (the home on a VPS, audio streamed over the internet to the phone),
   its function would come close to a one-port SIM gateway. Keep the bridge **local** (the phone
   plugged into the user's own home computer), one call at a time, at the volume of a person's own
   errands [INFERRED; **lawyer**].
2. **Carrier fraud models.** A SIM that never moves, makes only outbound calls, and makes many short
   calls to strangers can be suspended (保护性停机). A few errand calls a week from the owner's
   everyday SIM are ordinary. A dedicated spare SIM that only makes Ducter's calls is the riskier
   profile [INFERRED].

**What a Mac home can do.** The wired bridge works with any USB sound card on macOS, and the BT-HFP
route needs Linux. A spare Android phone (a cheap one is enough) on the home's desk is the only
hardware [INFERRED].

---

## 4. Options for Ducter, ranked

Criteria: lightness (code and moving parts), legality, call quality, cost, setup for the user, risk
to the user, and risk to Ducter's maker.

| # | Option | Light | Legal | Quality | Cost | Setup | Risk (user / maker) |
|---|---|---|---|---|---|---|---|
| **D** | **Don't place live AI calls to +86. Offer a call sheet** (who, what to say in Chinese, what not to say, the questions to ask) **and one tap to dial on the owner's phone** (a `tel:` link; on a paired Android, phone use can dial). Afterwards the owner tells the partner what happened, or speaks it | ★★★ | ★★★ | Human | ¥0 | None | None / none |
| **A** | **BYO phone: "your phone makes the call".** The owner's Android with their own Chinese SIM, plugged into the home by the wired headset bridge; Ducter dials over adb, runs the voice loop on the home, says the AI line first, and keeps every D189/D193/D208 rail | ★★ | ★★☆ (lawful posture, lawyer to confirm Art. 14) | Good (wired) | Parts ~¥100; ASR/TTS/LLM ~¥0.1–0.3/min on a Chinese model [INFERRED from Aliyun list prices] | A spare Android, a cable, adb pairing (phone use already pairs) | Carrier flag on odd patterns (low at errand volume) / low: the maker ships software, the owner calls |
| **B** | **A China calling connection under the user's own enterprise account**: StepOne ClawCall (enterprise-verified), or Aliyun IMS AI实时互动, behind `phone-provider.ts` like Tuwa | ★★ (an adapter, no hardware) | ★★★ for the user's business; the provider holds the lines | Provider's | ~¥0.2/min + number (Aliyun) | Enterprise verification, script filing, SIP tagging (weeks) | Their filed use must match / low |
| **B′** | **The same with a personal ClawCall account** | ★★★ | ★★★ | Provider's | Unknown | Sign-up + **SMS-verify each callee** | Useless for errands (only pre-agreed callees, mobiles only) |
| **E** | **Phone use drives a licensed consumer app** that already makes AI booking calls (Alibaba's 千问 App: restaurant booking calls in business hours, 2026-01) on the owner's Android | ★★ | ★★★ (Alibaba carries it) | Theirs | Free (theirs) | Their app, signed in | Fragile UI automation, narrow (restaurants), an unknown feature set [DOCUMENTED existence only]; Ducter's rails can't reach inside it |
| **C** | **Ducter's maker runs a Tuwa-like China service** | ☆ | ★☆ until licensed | Good | High | None for users | High / **high**: a PRC entity (a WFOE or a partner), lines bought under enterprise qualification with filed scripts and SIP tagging; B24 call-centre licensing is defined for calls "受企事业等相关单位委托" (on behalf of enterprises), and a PSTN voice service for individuals edges toward A15 IP telephony (basic telecom, closed to private and foreign firms) [VERIFIED: the catalogue definitions via elawcn; the mapping INFERRED]; ICP (B25) for the web service; generative-AI and deep-synthesis filing; PI-processor duties for callees; and every user's bad call is the maker's. Months, a lawyer, likely a domestic partner |
| **F** | Overseas carriers (Vonage, Plivo, AWS Connect) or Tuwa adding a +86 route | ★★ | ★★ | **Poor**: 境外来电提醒, blocking, unanswered | Per-minute | Account | Calls don't land; reads as fraud |
| **G** | A SIM gateway (GoIP etc.) | ★★ | **✗** (反诈法 Art. 14) | Good | Low | Hardware | **Fines up to ¥500k, SIM suspension. Never** |

### Recommendation

**Now: D, everywhere and by default.** When the number is +86, the partner says plainly that Ducter
can't place live calls to mainland China. It prepares the call sheet in Chinese and offers **自己打 /
Call it yourself** (a `tel:` link; with a paired Android, phone use dials it). Afterwards it asks how it
went in one line. This is light, lawful, and honest about the gap, and it costs nothing. It replaces
today's dead end (D193 (6), "drafts nothing and says so") with something useful.

**Next, as the real live path: A, "用你自己的手机打 / Your phone makes the call".** It is also D189 (11)'s
deferred "calls from the owner's own number", reached through Android instead of Tuwa Device + iPhone,
and it works for every country, not just China. Build it as an experiment on the author's spare
Android with the wired bridge first:
- one call at a time;
- the AI line first: "您好，我是{partner}，{owner}的 AI 助理，替 TA 打来……";
- the phone plugged into the home itself, never driven over the internet from elsewhere;
- the owner's everyday SIM, not a dedicated calling SIM;
- every D189/D193/D208 rail: Go each time, a do-not-call list, hours, no marketing, no voice but the
  owner's own.

Before it ships: a PRC lawyer on the Art. 14 reading and the disclosure wording (§6), and a voice loop
on a model reachable and lawful from mainland China.

**Offer B as a connection, not a feature,** for owners who run a business and already have a verified
account (ClawCall enterprise or Aliyun IMS). It is a provider adapter, and the provider carries the
lines and the filings.

**Not C** until Ducter has a Chinese entity, a partner with lines, and counsel; and only if demand from
mainland users justifies it. **Never F or G** for China.

**What would make a fuller path possible later:**
1. Tuwa or another licensed partner adding +86 through a domestic licensee (ask Tuwa, whose voice
   provider is already in China, research/53).
2. A domestic partner (StepOne, 容联, Aliyun) offering a personal tier without the SMS whitelist,
   for errands to businesses.
3. Android's or a Chinese OEM's own "AI calls for you" with an API (Gemini's Call for Me is US-only,
   2026-09).
4. A regulator's statement on individuals' AI agents calling businesses.

---

## 5. Notes for building A (inferred; not designed here)

- **The voice loop on the home:** streaming ASR → LLM → streaming TTS, aiming under ~1 s turn
  latency. For mainland users the models must be reachable there: Chinese realtime speech models or
  ASR/TTS from Aliyun or Volcano Engine. Anthropic and OpenAI APIs aren't officially offered in
  mainland China [INFERRED; check each provider's supported-regions list].
- **One provider interface:** Ducter's `phone-provider.ts` gains an "own phone" provider whose draft
  and confirm are local. The same Go card, outcome words and Log snapshots apply (D193 (4), D208 (6)).
- **The phone is busy during a call:** the owner should know the phone is in use, and an incoming call
  must not be answered by the AI (inbound stays out of scope, D189 (11)).
- **Carrier hygiene:** caller ID shown (no hiding), no more than a few calls a day, never repeated
  redials of the same number.

---

## 6. What needs a PRC lawyer

1. Whether a phone wired to a local computer that produces an AI voice falls under 反电信网络诈骗法 Art. 14(2)
   ("互联网电话违规接入公用电信网络"), and whether it matters if the home is local or remote.
2. Whether an individual's personal AI calling a business on their behalf is clearly outside 消保法实施条例
   Art. 24 and the 骚扰电话 rules (it should be), and whether anything requires prior consent from a
   business line.
3. The exact disclosure wording that meets the audio label of 标识办法 Art. 4(2) and the national
   standard GB 45438-2025, and whether a notice about transcription is needed for the callee.
4. Whether Ducter's maker, shipping open-source software that a person runs for themselves, is a 深度合成
   "技术支持者" with duties of its own.
5. For C only: the licence map (B24, B25, A15 resale through a licensee), the foreign-ownership limits
   on each, and filing for generative AI and deep synthesis.

---

## Implications for Ducter

- **Keep D193 (6)'s rule, but replace the dead end:** for +86 the partner offers a Chinese call sheet
  and one tap to dial yourself (option D). It needs a small persona and tool change, then the partner
  eval (D175).
- **Promote "calls from your own phone" (D189 (11)) from "not in v1" to the next phone milestone,** via
  Android + a wired bridge + adb (option A), with the rails unchanged and the bridge kept local. This
  is the only route that is light, live, in the owner's own name, and plausibly lawful for China.
  It also helps every other country.
- **Name option B in `design/phone.md`** as a later calling connection for owners with an enterprise
  account (ClawCall enterprise, Aliyun IMS).
- **Write into the rails: never a SIM gateway, never an overseas route to +86, never marketing.**
- **Don't build a China calling service (C)** without a PRC entity, a licensed partner and counsel.
- **Already compliant:** Ducter's spoken AI line at the opening is the "语音提示" label 标识办法 Art. 4(2)
  asks for, and the owner-voice-only rule matches 深度合成 Art. 14.
- A decision (Dn) is needed for D-now and A-next; this report only proposes them.

## Summary

The reference repo is a client for StepOne AI's hosted China calling API. Its individual accounts can
call only the user's own number and SMS-verified callees; calling anyone, including restaurants and
clinics, needs an enterprise account. The repo also takes only mobile numbers.

Every China cloud path to strangers needs a verified enterprise, a filed use and carrier line tagging
(Aliyun: personal users refused). Aliyun's IMS AI实时互动 does live LLM calls at about ¥0.21/min, but
only after sales review. Overseas carriers can't land calls: Twilio refuses +86, and AWS needs
pre-approval. Chinese phones label foreign calls, and their owners often block them. A SIM gateway is
banned by 反诈法 Art. 14 (fines up to ¥500k).

The law mostly binds businesses and service providers. An individual's own AI calling a business for
them, from their own number, saying it is an AI, at a normal hour, is lawful in all likelihood. That
rests on reading the texts: 消保法实施条例 Art. 24 governs commercial calls, the 标识办法 audio label
is met by the opening line, and PIPL Art. 72 exempts household use. Cold commercial calls to
individuals are not lawful. Ducter's maker running a China service would need an entity, lines,
filings and counsel.

Recommendation: now, a call sheet with one tap to dial yourself for +86. Next, "your own phone makes
the call": the owner's Android with their own SIM, wired to the home, the AI line first. Later, an
enterprise-account connection for businesses. A PRC lawyer should confirm the Art. 14 reading and the
disclosure wording before A ships.

## Sources

- Reference repo: https://github.com/ustczz/openclaw-ai-calls-china-phone (commit `317697c`): `README.md`, `SKILL.md`, `references/api.md`, `scripts/stepone_client.py`, `docs/openclaw-ai-outbound-guide.md`; StepOne profile https://pitchhub.36kr.com/project/2060978494044039
- 消费者权益保护法实施条例: https://www.gov.cn/zhengce/content/202403/content_6940158.htm
- 呼叫中心通知 (2020): https://www.nbd.com.cn/articles/2020-06-20/1448473.html ; 号码保护试点: https://www.news.cn/tech/20250704/dbaaab89cca7468a89d9da8502f3c7a6/c.html ; 通信短信息服务管理规定 (2026): https://www.chinanews.com.cn/sh/2026/05-22/10626243.shtml ; AI 外呼 compliance: https://www.chinanews.com.cn/sh/2026/07-28/10667604.shtml ; Liaoning fines: https://m.c114.com.cn/w96-1298754.html
- 反电信网络诈骗法: https://www.12371.cn/2022/09/03/ARTI1662166400932862.shtml ; GoIP customs notice: https://www.ithome.com/0/779/115.htm
- 深度合成管理规定: https://www.cac.gov.cn/2022-12/11/c_1672221949354811.htm ; 标识办法: https://www.cac.gov.cn/2025-03/14/c_1743654684782215.htm ; 生成式AI暂行办法: https://www.cac.gov.cn/2023-07/13/c_1690898327029107.htm ; 拟人化互动服务办法 (中伦): https://www.zhonglun.com/research/articles/56698.html
- 促进和规范数据跨境流动规定: https://www.cac.gov.cn/2024-03/22/c_1712776611775634.htm
- 电信业务分类目录 (B24/B25/A15): https://www.elawcn.com/telecommunication/2019/1130/498.html
- Aliyun: https://help.aliyun.com/zh/vms/support/voice-service-uses-the-faq , https://help.aliyun.com/zh/ims/user-guide/how-to-make-smart-phone-call , https://help.aliyun.com/document_detail/268810.html ; Huawei: https://www.huaweicloud.com/product/voice.html
- Twilio: https://www.twilio.com/en-us/guidelines/cn/voice ; AWS: https://aws.amazon.com/blogs/contact-center/amazon-connect-china-calling-compliance-best-practices/ ; Vonage: https://api.support.vonage.com/hc/en-us/articles/204017403-China-Voice-Features-and-Restrictions
- 境外来电提醒 / MIIT: https://www.bjnews.com.cn/detail/1781269574129787.html ; 千问 AI 订座电话: https://www.cls.cn/detail/2269320 ; China Mobile 新通话: https://en.antaranews.com/news/424589/from-china-mobiles-call-upgrade-to-the-commercial-launch-of-calling-ai-by-leading-operators
- Android: https://developer.android.com/media/platform/sharing-audio-input ; BlueALSA HFP: https://github.com/arkq/bluez-alsa/wiki/Using-BlueALSA-with-HFP-and-HSP-Devices
