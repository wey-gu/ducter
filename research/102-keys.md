# 102 · Pasted API keys and the agents' own records (D298)

Date: 2026-11-17. Two questions behind D298: (1) what an API key from each provider a Ducter user
is likely to hold looks like, how it can be checked without spending, and which agent Ducter can
think with on it; (2) where Claude Code and Codex keep their own session records on a computer,
so the partner's first words can say something true about the person's recent work.

Tags: VERIFIED = read in code or files here; DOCUMENTED = a provider's docs or a widely used
secret scanner's rule set; INFERRED = judgment. No real key was used; no request was sent with
one. The person's own `~/.claude` and `~/.codex` were not read: the layouts in §4 are from the
agents' documented formats and Ducter's own fixtures.

## 1. Key shapes

| Provider | Shape | Tag | Source |
|---|---|---|---|
| Anthropic | `sk-ant-api03-` + 93 of `[A-Za-z0-9_-]` + `AA` | DOCUMENTED | gitleaks rule `anthropic-api-key` |
| Claude Code sign-in token | `sk-ant-oat01-…` (from `claude setup-token`) | DOCUMENTED | research/29; Ducter keeps it as `CLAUDE_CODE_OAUTH_TOKEN` |
| OpenAI | `sk-proj-` / `sk-svcacct-` / `sk-admin-` … with `T3BlbkFJ` in the middle; legacy `sk-` + 20 + `T3BlbkFJ` + 20 | DOCUMENTED | gitleaks rule `openai-api-key` |
| OpenRouter | `sk-or-v1-` + 64 hex | DOCUMENTED | trufflehog `openrouter` detector |
| DeepSeek | `sk-` + 32 of `[a-z0-9]` | DOCUMENTED | trufflehog `deepseek` detector |
| Alibaba Model Studio (DashScope, Qwen) | `sk-` + 32 hex, the same shape as DeepSeek's | INFERRED | keys seen in public examples; no detector found |
| Moonshot / Kimi | `sk-` + a longer mixed-case string (about 48) | INFERRED | the provider's docs give only the `sk-` prefix; China and international consoles issue separate keys, and a key used on the other site answers 401 (DOCUMENTED, platform.kimi.com docs) |
| Zhipu GLM / Z.ai | `<32 hex>.<16 letters and digits>` (an id and a secret) | INFERRED | the provider's docs describe an id.secret pair |
| Google Gemini | `AIza` + 35 | DOCUMENTED | gitleaks rule `gcp-api-key` |
| xAI | `xai-` + 80 | DOCUMENTED | trufflehog `xai` detector |
| Groq | `gsk_` + 52 | DOCUMENTED | trufflehog `groq` detector |

A plain `sk-` key is ambiguous (DeepSeek, Model Studio and Kimi all use it), so the shape only
orders the candidates; a check against each decides. INFERRED.

## 2. Checks that spend nothing

| Provider | Request | Says | Tag |
|---|---|---|---|
| DeepSeek | `GET https://api.deepseek.com/user/balance` (Bearer) | `is_available` false: no balance | DOCUMENTED (DeepSeek API docs; trufflehog uses the same call) |
| Kimi (China) | `GET https://api.moonshot.cn/v1/users/me/balance` | `data.available_balance` ≤ 0: can't call | DOCUMENTED (platform.kimi.com/docs/api/balance) |
| Kimi (international) | `GET https://api.moonshot.ai/v1/users/me/balance` | same | DOCUMENTED (platform.kimi.ai/docs/api/balance) |
| OpenRouter | `GET https://openrouter.ai/api/v1/key` | `data.limit_remaining` ≤ 0 | DOCUMENTED (trufflehog's check) |
| OpenAI | `GET https://api.openai.com/v1/models` | 401 wrong; 429 quota | DOCUMENTED |
| Anthropic | `GET https://api.anthropic.com/v1/models` (`x-api-key`, `anthropic-version`) | 401 wrong | DOCUMENTED |
| Google | `GET …/v1beta/models?key=` | 400 "API key not valid" | DOCUMENTED |
| xAI | `GET https://api.x.ai/v1/api-key` | 401 wrong | DOCUMENTED (trufflehog) |
| Groq | `GET https://api.groq.com/openai/v1/models` | 401 wrong | DOCUMENTED (trufflehog) |
| Model Studio | `GET https://dashscope.aliyuncs.com/compatible-mode/v1/models` | 401 wrong | INFERRED (OpenAI-compatible route) |
| Zhipu / Z.ai | `GET …/api/paas/v4/models` | 401 wrong; a 404 means the route moved, so the key is kept unchecked | INFERRED |

A model call through pi would also check a key, but it spends tokens, takes seconds, needs pi to
run here already, and its error doesn't separate "wrong key" from "no balance" cleanly. A
read of the account does all four better. INFERRED.

From mainland China, the providers abroad (OpenAI, Anthropic, Google, OpenRouter, xAI, Groq)
usually can't be reached without a proxy; DeepSeek, Kimi's China site, Model Studio and Zhipu can.
A request that fails at the network to a provider abroad is said as "needs a proxy here"; to one
in China, as "no network". INFERRED.

## 3. Which agent thinks with it

pi 1.5.0, inside Ducter from a checkout, reads these keys from its environment (VERIFIED,
`@earendil-works/pi-ai` `env-api-keys.js`): `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`,
`OPENROUTER_API_KEY`, `DEEPSEEK_API_KEY`, `MOONSHOT_API_KEY` (both `moonshotai` at
api.moonshot.ai and `moonshotai-cn` at api.moonshot.cn), `ZAI_API_KEY` (api.z.ai coding
endpoint), `ZAI_CODING_CN_API_KEY` (open.bigmodel.cn coding endpoint), `GEMINI_API_KEY`,
`XAI_API_KEY`, `GROQ_API_KEY`. Its defaults per provider are in `model-resolver.js`
(`defaultModelPerProvider`, VERIFIED). It has no plain Model Studio provider (only Qwen's
token-plan endpoints), so a Model Studio key is recognised and checked but not thought with yet.

Because Moonshot's two sites share one variable, the partner's model names the site
(`moonshotai-cn/kimi-k2.6`), else pi would try the other one. INFERRED from the catalog.

pi needs `node` (22.19 or newer) or its own `pi` command to run (VERIFIED, `runner/src/oar.ts`;
the single binary has no node_modules). pi's own installer `curl -fsSL https://pi.dev/install.sh
| sh` installs Node itself when there is none, but asks on a terminal first (VERIFIED, read
2026-11-17), so Ducter opens it in Terminal rather than running it silently.

DeepSeek Harness reads `DEEPSEEK_API_KEY` too and passed the partner eval above pi (D177); it is
preferred when installed.

## 4. The agents' own records

| Agent | Where | What a session file holds | Tag |
|---|---|---|---|
| Claude Code | `$CLAUDE_CONFIG_DIR` or `~/.claude`, then `projects/<cwd with non-alphanumerics as ->/<session id>.jsonl` | one JSON object a line: `type` (user, assistant, summary, custom-title, system), `cwd`, `sessionId`, `message` `{role, content}`; `isMeta` on the agent's own lines; a `summary` line names the session | DOCUMENTED (Claude Code's data-usage docs; Ducter's eval cleans these folders: `packages/partner/eval/run.ts`) |
| Codex | `$CODEX_HOME` or `~/.codex`, then `sessions/YYYY/MM/DD/rollout-<time>-<id>.jsonl`; thread names in `session_index.jsonl` | first line `session_meta` with `payload.cwd` and `payload.id`; the person's words as `event_msg` `user_message`, or a `response_item` user message (the first ones are the environment block) | DOCUMENTED (Codex's docs and rollout format) |

Ducter's own partner and tasks run these agents too, so their sessions land in the same folders:
they are told apart by folder (the data folder, the Ducter folder). INFERRED.

## Implications for Ducter

- Recognise by shape, decide by a check that spends nothing; keep the key in `keys.env` under the
  variable its agent reads; think with DeepSeek Harness, else pi; say a Model Studio key is right
  but not usable yet.
- Give pi the DeepSeek key too (D102 granted it to DeepSeek Harness only).
- A computer without node gets pi's own installer in Terminal, with the key already kept.
- The first words can read the agents' own records (folder, title, first words, time) cheaply and
  locally; they are what the person already chose to keep, not a guess at where code lives.

**Summary:** Distinct prefixes name Anthropic, OpenAI, OpenRouter, Google, xAI and Groq; DeepSeek,
Model Studio and Kimi share `sk-` and are told apart by a free account read. pi 1.5 runs every
one of them except Model Studio. Claude Code and Codex keep each session's folder, title and
first words in plain JSON lines under the person's home, which a bounded local read can turn into
"yesterday you were on X in hawdb".
