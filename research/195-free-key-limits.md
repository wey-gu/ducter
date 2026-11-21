# 195 · A free key's day: each free route's cap, its 429, and when it comes back

For D449 (research/194 ★1). Read 2026-11-21 from public pages and public issue threads; no account
was made, no key created, no request sent with a key. VERIFIED = read in Ducter's own code;
DOCUMENTED = the provider's own page; INFERRED = public reports or judgment. Pages move often: the
code names shapes it reads, never a model list.

## 1. Ducter before D449 (VERIFIED)

- Only `packages/core/src/api-key.ts` knew a key is free: OpenRouter's `/api/v1/key` read
  `data.is_free_tier` picked a free model, and the fact was dropped there. Nothing in
  `brain-hold.ts`, `fresh-look.ts`, `doc-check.ts`, the runner or Settings read it.
- pi on a free key: a turn that failed on the provider's 429 reached D297's `limitHit` with
  OAR's failure class; pi's limit had no reset (`source: "none"`, `limit-hit.ts` header), so the
  partner's hold (D435) waited `UNKNOWN_RETRY_MS` = 1 h and said **…我隔一会儿试一次** for a cap that
  comes back at the provider's day boundary, and a task's D297 wait retried every hour up to a day.
- The runner kept a failed turn's `reason` only when OAR classed it `quota`/`rate_limited`, cut
  at 300 characters: a provider's body classed otherwise never reached a reader.
- Every look and check ran on whatever was signed in: on a key-only home that is pi on the same
  free key. A done code result: up to two extra model calls (the look, the check of the fix) and a
  task round in between; a document: a bounce round (several task calls).

## 2. The routes

| Route | Cap | Day boundary | The 429 as it comes back | Tag |
|---|---|---|---|---|
| OpenRouter `:free` models, under $10 of credit ever bought | 50 requests a day, 20 a minute (1 000 a day above $10) | Not stated on the page; the 429 carries `X-RateLimit-Reset` (ms since the epoch) | `{"error":{"message":"Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day","code":429,"metadata":{"headers":{"X-RateLimit-Limit":"50","X-RateLimit-Remaining":"0","X-RateLimit-Reset":"<ms>"}}}}`; per minute `free-models-per-min` | Cap DOCUMENTED (openrouter.ai/docs/api-reference/limits); body shape INFERRED (public issue threads quoting it); UTC midnight when no header INFERRED |
| Gemini API free tier (AI Studio key, no billing on the project) | Per project and model, shown in AI Studio, no longer printed; per minute, per day, tokens a minute | "Requests per day reset at midnight Pacific time" | `{"error":{"code":429,"status":"RESOURCE_EXHAUSTED","message":"You exceeded your current quota… Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: N, model: …","details":[QuotaFailure{quotaId:"GenerateRequestsPerDayPerProjectPerModel-FreeTier"}, RetryInfo{retryDelay:"37s"}]}}`; the minute's quotaId says `PerMinute`, and the message ends "Please retry in 37.5s." | Reset and per-project limits DOCUMENTED (ai.google.dev/gemini-api/docs/rate-limits); body shape INFERRED (public issue threads) |
| Kimi voucher, DeepSeek top-up | Credit, not a daily cap: runs out once | — | A balance error (D298 reads it as no balance) | DOCUMENTED (research/189) |

What pi passes through (INFERRED): pi's provider adapters put the provider's error message in the
failed turn's reason; whether the `metadata.headers` part survives depends on the adapter, so the
reader takes the headers when present and the provider's documented day when not.

Can a Gemini key say it is on the free tier without spending? The model list (D298's check) is the
same for both. A project without billing is on the free tier (DOCUMENTED, ai.google.dev pricing);
a key pasted in a fresh Ducter almost always came from **还没有密钥？**'s Gemini route (INFERRED).
So a Gemini key is paced as free; a paid one pays for that only with no look on code results.

## 3. A busy free morning, counted (INFERRED from the shapes above and Ducter's own turns)

One partner reply is one request plus one per tool call (memory_search, task_open…): 2–4. A small
task is 10–30 (each tool call is a request). D437's look on a code result: 1, its check after a
fix: 1, plus the fix round: 5–10 task calls. D439's bounce: 5–15. On OpenRouter's 50 a day, two
tasks with a look each and a dozen messages spend the day before lunch; the looks and bounces are
a third of it and the person never asked for them.

## Implications for Ducter

- Keep "free" from the key check on the home (a small file, no key, no words) and count the day:
  one request per turn plus one per finished tool call, set right whenever the provider says
  what is left.
- Read the provider's own 429 from the failed turn's words, whatever OAR called it: OpenRouter's
  free-models-per-day with its `X-RateLimit-Reset`, else UTC midnight; Gemini's `PerDay` quota at
  midnight Pacific, its minute at `retryDelay`. That reset feeds D435's hold and D297's waits.
- Say it with the provider's name, its time and the paid way (**充 $10 就能多很多**), never "pi",
  never an hour.
- On a free key, nothing the person didn't ask for spends it: no look on a code result (an outward
  Go's look stays until the day runs low), no doc bounce (the pages are still checked by code), a
  frugal task brief. Say once that the look is off.
- Settings › Partner reads the day: **今天还剩约 12 次**, only on a free key.

**Summary:** OpenRouter's free models cap at 50 a day and say when they come back in their own
429; Gemini's free tier caps per project and comes back at midnight Pacific. Ducter knew neither:
it spent the one key on its own extra looks and said "in an hour". D449 keeps the fact, counts the
day, reads the provider's word and spends the key on the person first.
