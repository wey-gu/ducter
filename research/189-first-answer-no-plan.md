# 189 · A first answer with no plan: the fastest key by region, a local model, what pi runs on a key

Date: 2026-11-21. The question behind D440 (research/184 #4): a consumer or a fresh user who has no
AI subscription and no API key installs Ducter. How do they get the partner's first answer within
minutes, with nothing to learn? Four parts: (1) which providers give a key fastest, free or nearly,
outside mainland China; (2) the same inside it; (3) whether a small model on the Mac is a viable
first brain; (4) what Ducter's harnesses can run with only a key, and what was missing in the path.

Tags: VERIFIED = read in code or files here; DOCUMENTED = the provider's own docs or pricing pages,
read 2026-11-21; INFERRED = judgment or a third party. Public pages only: no account was made, no
key was created, no request was sent with a key. Provider names are fine to name; the pages move
often (model names change monthly), so the routes in code name pages, not limits.

## 1. Outside mainland China

| Provider | Free with no card | Needs | Key page | Free models with tools, limits | Training on free use | Tag |
|---|---|---|---|---|---|---|
| Google AI Studio (Gemini) | Yes | A Google account; some projects a phone check by QR (no number shared) | `aistudio.google.com/apikey` | Free tier: gemini-3.8-flash, 3.6-flash, 3.5-flash-lite, 3.1-flash-lite, 2.5-flash and -pro; **3.5 Flash and Gemini 4's larger models are not free**. Limits shown per project in AI Studio, no longer printed | Yes on unpaid services, humans may review; in the EEA, UK and Switzerland paid terms apply even to free quota | DOCUMENTED (aistudio.google.com/docs/{api-key,pricing,rate-limits,terms,verification}) |
| OpenRouter `:free` | Yes | Email, Google or GitHub | `openrouter.ai/settings/keys` | 20 RPM; 50 requests a day with under $10 of credit ever bought, 1 000 above. Free with tools today: gemma-4-31b-it, gemma-4-26b-a4b-it, nemotron-3-ultra, nemotron-3.5-super-vl and more | Per provider; separate switches for free and paid | DOCUMENTED (openrouter.ai/docs/api-reference/limits, live model list); key page INFERRED |
| Groq | Yes (long-standing; the page doesn't say "no card") | Email, Google or GitHub | `console.groq.com/keys` | gpt-oss-120b, gpt-oss-20b, qwen3.8-27b: 30 RPM, 1 000 a day, **8 000 tokens a minute**: too tight for the partner's ~20 tool schemas and history | Not kept by default | DOCUMENTED (console.groq.com/docs/rate-limits, your-data); free-plan reading INFERRED |
| Cerebras | **No**: a card for a $5 trial, 30 days | | | | | DOCUMENTED (inference-docs.cerebras.ai/support/rate-limits) |
| Mistral "Experiment" | Unconfirmed in 2026 (its help page is gone) | Phone | | | May train | INFERRED |
| NVIDIA build | About 1 000 credits, prototyping only | Email | a model page's Get API Key | 40 RPM | Unconfirmed | INFERRED |
| GitHub Models | **Shut down 2026-07-30** | | | | | DOCUMENTED (docs.github.com/en/github-models) |
| Hugging Face | **No free monthly credit** for free users | | | | | DOCUMENTED (huggingface.co/docs/inference-providers/pricing) |

Minutes (INFERRED): Gemini is about three clicks and a minute for someone already signed in to
Google, a minute more when the QR check shows; OpenRouter about the same with a Google or GitHub
sign-in.

Regions (DOCUMENTED): Gemini's list has no mainland China, Hong Kong, Macau or Russia, and has the
EU and the UK (aistudio.google.com/docs/available-regions). OpenAI's and Anthropic's lists leave out
the same four (developers.openai.com/api/docs/supported-countries; anthropic.com/supported-countries,
which since 2026-11-12 also excludes companies controlled from there). OpenRouter's and Groq's
lists weren't checked.

## 2. Mainland China

| Provider | Free offer | Real name first | Free with tools | Key page | Tag |
|---|---|---|---|---|---|
| Kimi (Moonshot; platform.moonshot.cn now lands on platform.kimi.com) | **¥15 voucher for 3 months, only for a mainland China mobile number** | Not stated | K-series models are pay-as-you-go; the voucher pays for them | console › API keys | DOCUMENTED (kimi.com/en-cn/help/kimi-api/api-free-trial; platform.kimi.com/docs/pricing/chat); page path INFERRED |
| DeepSeek | **No sign-up credit** on the pricing page | Likely for a top-up (third parties, 2026) | None free; deepseek-flash $0.15 / 1M in (off-peak), tools, 1M context: the cheapest strong one | `platform.deepseek.com/api_keys` | DOCUMENTED (api-docs.deepseek.com/quick_start/pricing); real name INFERRED |
| Zhipu (bigmodel.cn) | **Free models**: GLM-4.7-Flash (function calling, 200K), GLM-4.5-Flash and more | Third parties say yes | GLM-4.7-Flash, about 1 request at a time | `bigmodel.cn/usercenter/proj-mgmt/apikeys` | DOCUMENTED (docs.bigmodel.cn guide/models/free/glm-4.7-flash); concurrency INFERRED |
| SiliconFlow | Small free models (9B class); about ¥16 after real name | Yes in practice (ID and a face check) | Too weak for a 20-tool agent | `cloud.siliconflow.cn/account/ak` | DOCUMENTED (siliconflow.cn/pricing, its error codes); the rest INFERRED |
| Alibaba Model Studio | 1M tokens a model for 90 days | **Yes: no free quota before real name** | Qwen with tools | Model Studio console | DOCUMENTED (help.aliyun.com/zh/model-studio/new-free-quota) |
| MiniMax, Volcengine Ark | Unconfirmed credits | Yes (third parties) | | | INFERRED |

Verdict (INFERRED): every mainland platform needs a mainland mobile number, and most an ID check,
so none is three minutes for everyone. The least friction with something Ducter can think with
today: Kimi's ¥15 voucher (phone only, a provider pi already speaks), then a few yuan on DeepSeek
(cheapest strong tool caller). Zhipu's free GLM-4.7-Flash is the best free model, but see §4: pi
only speaks to Zhipu's coding endpoint, so it can't be offered without writing pi's own config.

## 3. A small model on the Mac

| | Size | Notes | Tag |
|---|---|---|---|
| Ollama for macOS 0.40.16 | 230 MB | measured with a HEAD request | DOCUMENTED (ollama.com/download/mac) |
| qwen3:4b / qwen3:8b | 2.5 GB / 5.2 GB | tool-tagged; 8 GB Macs only fit 3–4B | DOCUMENTED (ollama.com/library); RAM INFERRED |
| gemma4:e4b / gemma4:12b | 6.1–6.6 GB / 7.2–8 GB | tool-tagged at the family level | DOCUMENTED |
| gpt-oss:20b | 14 GB | "as little as 16 GB", slow there | DOCUMENTED / INFERRED |
| Speed | qwen3:8b Q4 roughly 12–55 tok/s on M1/M2 (one unsourced site; low confidence) | | INFERRED |
| Tool calling | no public BFCL row for 4B; a third party rates Qwen3-4B and Gemma 4 E4B in the high 80s on ~5 tools | with ~20 tools, long instructions and many turns, 3–8B models misroute and drop arguments | INFERRED |
| Apple Foundation Models | 4 096 tokens a session including tool schemas, "three to five tools" a request; the 32K cloud model needs macOS 27, an approved entitlement and a daily limit; not yet on mainland China Macs | can't hold the partner | DOCUMENTED (developer.apple.com/documentation/foundationmodels/…) |

Verdict (INFERRED): a first answer that needs a 230 MB app and a 2.5–5 GB model is ten minutes or
more on a home connection, and then answers worse than a free Gemini key: not the first route.
It belongs later, as a private or offline mode for someone who asks for it, labelled lighter. pi
can already use it through its own `models.json` (an OpenAI-compatible endpoint at
`localhost:11434/v1`, VERIFIED in pi-coding-agent 1.5.2 `docs/models.md`), but writing the
person's pi config is a change Ducter doesn't make silently.

## 4. What a key alone runs today (VERIFIED in code)

- **pi 1.5.2** reads a key per provider from its environment (`pi-ai` `env-api-keys.js`): Google,
  OpenRouter, Groq, Cerebras, Mistral, NVIDIA, DeepSeek, Moonshot (both sites), Z.ai and Zhipu's
  coding endpoint, MiniMax, Hugging Face and more. Its Zhipu provider is
  `open.bigmodel.cn/api/coding/paas/v4` (the coding plan's endpoint), so a free bigmodel key on
  GLM-4.7-Flash isn't one of its built-in routes.
- **Ducter's model for a Google key was `google/gemini-3.5-flash`**, which is not on the free tier
  (§1): a free key would have been said to work and then failed on the first message. Changed to
  `gemini-3.8-flash`, which is free and in pi's catalog.
- **An OpenRouter key started on pi's default OpenRouter model**, a paid one: a free account would
  fail on the first message. OpenRouter's own key read says `is_free_tier`; such a key now starts
  on `google/gemma-4-31b-it:free` (free, tools, in pi's catalog).
- **pi needs Node or its own binary.** A fresh Mac has neither, so D298 answered a good key with
  "install pi in Terminal" (pi's installer asks on a terminal). Ducter already puts agents in its
  own tools folder without a terminal or an administrator password (D363's install: Node's own
  build, checked, then pi's npm package); it wasn't used for a pasted key.
- **A message sent while nothing can think** went to Claude Code anyway; the turn failed, D435's
  hold caught it and said "Claude Code isn't working right now, no other AI can take over", about
  an agent the fresh user never had, and retried in ten minutes, not when the key arrived.
- **Core's "nothing to think with"** counted a key kept for a pi that can't run here as thinking,
  so the key card could vanish while nothing worked.

## Implications for Ducter

- Offer one way to a key under the key card, picked by where the home is (its own time zone, the
  key being used from its network): outside China Google Gemini (free, a Google account), then
  OpenRouter's free models; in mainland China Kimi's ¥15 voucher, then DeepSeek with a small
  top-up; where Gemini isn't offered (Hong Kong, Macau, Russia…), OpenRouter, then DeepSeek. The
  provider's own page, three steps, what it needs, and the honest note (Gemini's free tier may
  train on what is sent). Never make the account or the key.
- A free key must think on a free model: Gemini 3.8 Flash; OpenRouter's free tier on a free model.
- Put pi in place by itself when a good key needs it (D363's install), saying the key works at
  once and that it is setting up.
- A message before there is anything to think with is kept, said once in plain words, and answered
  first when a key or a sign-in arrives.
- Not now: a local model as the first route (download and quality), Zhipu's free model (needs
  pi's own config), Groq (8K tokens a minute), Apple's on-device model (4K context).

**Summary:** Outside China, a free Gemini key is a minute away and pi runs it, provided Ducter
picks a model on the free tier; OpenRouter's free models are the second. Inside, every platform
needs a mainland phone and most an ID check; Kimi's voucher and a few yuan of DeepSeek are the
shortest paths pi already speaks. A local model costs gigabytes and answers worse, so it waits.
What blocked a fresh user was in Ducter's own path: a paid model for free keys, pi needing a
terminal, and a message tried on an agent that wasn't there.
