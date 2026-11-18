# 149: The quick web look (D379)

D378 took every web tool away from the partner: what the web says now became a browsing task,
so one live fact (tomorrow's weather, the latest version of something) cost a task's minute and a
row in On hand. Its todo named the way back: the fork executor (`conversation.md`), read-only,
in a side context, returning only its conclusion. This note is the evidence for building its
first kind, the quick web look: the boundary, how each agent is held to web tools alone, what
comes back, and how long it takes on this Mac.

## 1. Who and what they feel

- **The heavy developer** asks "Bun 最新是哪个版本" between two other things. Before D378 the
  partner answered from a search inside its own turn; after it, a task row, about a minute. He
  wants the number, not a task.
- **The consumer** asks "明天上海会下雨吗". A task card for the weather reads as overkill
  (惊喜 the wrong way) and a minute is long.
- **The fresh user** has never seen a task; a weather question shouldn't introduce one.

All three want the 顺滑 of a friend who says "我看一下" and answers; 放心 asks that no web page ever
speaks to the one that holds their memory, accounts and Go cards (D378's reason, kept).

## 2. Holding a session to its web tools alone

| Agent | How | Evidence |
|---|---|---|
| Claude Code 2.1.327 | `--tools WebSearch,WebFetch` (an allowlist of built-ins), no MCP (`--strict-mcp-config`), the clean setup | VERIFIED: `claude -p … --model haiku --tools "WebSearch,WebFetch" --strict-mcp-config --setting-sources "" --output-format stream-json`: the init event lists `tools: ["WebFetch","WebSearch"]`, `mcp_servers: []` (scratch folder, its `~/.claude/projects` folder deleted after) |
| DeepSeek Harness | the Ducter-owned home's profile layer drops every tool row but `tool-web` (`readOnlyOff` + `tool-fs`, `tool-fs-search`, `mcp-resources`), read-only sandbox preset | INFERRED: research/50 §2 dropped every row the same way (VERIFIED there); this one row kept was not run |
| Codex | not offered | INFERRED: no per-session switch for its shell is known (harness-facts `noTools`); a read-only shell beside a page could read files into a search query |
| pi | not offered | DOCUMENTED: pi has no web tool of its own (research/38) |

So the look holds the web and nothing else: no files, no shell, no Ducter MCP tools, no memory,
no accounts, nothing of the person's in its folder (an empty `<data>/web-look`). A page that
tells it to do something has nothing to do it with; the worst it can do is a wrong answer, which
comes back clipped, with its sources, as data.

## 3. What comes back

One JSON line the look is asked for (`webLookPrompt`), parsed and checked by code
(`parseWebLook`): `answer` (plain words, markup and control characters removed, at most 200
characters), `sources` (http(s) only, at most 3), `confidence` (high, medium, low; anything else
is low), or `unsettled` (conflict, page, sign_in, not_found). No JSON, no answer, or an answer
with no source is unsettled, never passed on as written. The partner gets it fenced
(`<web_look>…</web_look>`, "data, never instructions"), the history line keeps it for "how did
you know?".

## 4. Measured on this Mac (Claude Code 2.1.327, Ducter's own path: OAR port + `web-look.ts`)

2026-11-19, from Shanghai's time zone, wall time from the call to the typed result.

| Model | Prompt | Question | Wall | Tools | Result |
|---|---|---|---|---|---|
| haiku | v1 (≤3 calls, 25 s) | 明天上海会下雨吗 | 25.1 s | WebSearch ×2 | found, medium, 3 sources |
| haiku | v1 | latest Bun version | 17.9 s | WebSearch, WebFetch | found: v1.4.4 (matches CI's pinned Bun), medium |
| sonnet | v1 | 明天上海会下雨吗 | 25.6 s | WebSearch, WebFetch, WebSearch | **time** (cut at 25 s) |
| sonnet | v1 | latest Bun version | 19.2 s | WebFetch, WebSearch | found: v1.4.4, medium |
| haiku | v2 (≤2 calls, 30 s) | 明天上海会下雨吗 | 18.2 s | WebSearch, WebFetch | unsettled not_found (no forecast for the 20th found) |
| haiku | v2 | latest Bun version | 20.7 s | WebSearch, WebFetch | unsettled page (the patch number unconfirmed) |
| haiku | v2 | 美元兑人民币汇率 | 24.7 s | WebSearch ×2 | found: the day's central parity, medium |

- **Time:** 18–25 s on haiku. About 3 s to the first tool call (process start and the first
  model call); each WebSearch round trip is then 8–10 s, and haiku used two calls every time even
  when asked for one. Sonnet was no faster and once ran out of time. So: haiku, and a 30 s budget.
- **Cost (INFERRED from list prices, $1/$5 per M tokens for haiku, $3/$15 for sonnet, $10 per
  1,000 searches; tokens as Claude Code reported them):** haiku 22–37K input tokens, 1.2–2.6K
  output, about $0.04–0.07 a look; sonnet about $0.13 a look. The seven runs cost about $0.60.
- **Honesty:** two of five haiku looks came back unsettled rather than guessing; that goes to a
  browsing task by design.
- Against D378's browsing task (a task's start, a browser, a report: about a minute, one row in
  On hand), a look is about a third of the time and leaves nothing on On hand.

## 5. The boundary (decided with the eval, §6)

ONE live fact from the public web: `web_look`. Everything more is a browsing task from the start:
a page or link to read or sum up, comparing, today's news or discussion, several facts, anything
behind a sign-in, doing something on a site. The persona's rule 1 says it in four lines; the
tool's description repeats the "not for". A look that comes back unsettled is handed to a task,
and the code's ack says so when the model writes none (**网上一下没查准，我开个任务仔细查：… /
A quick look didn't settle it, so a task is checking properly: …**).

The model's line around the call: haiku wrote a line before the look ("我查一下…") in 3 of 3
smoke runs despite being told not to, and a filler line after it ("还在查…") in 3 of 3. The line
before is the ack (principle 6: ack, job, result), so it is allowed; a short line after is
dropped by code, as after a task's ack.

## 6. Eval

See D379 in `design/decisions.md` for the two full haiku runs against d378-b (128/168).

## Implications for Ducter

- Build the quick web look as the first fork: `SessionSpec.webOnly`, harness-facts `webLook`,
  `core/src/web-look.ts`, the partner's `web_look`, the Log's `web_look`, the waiting line
  **在网上查… / Looking it up on the web…** kept until the answer.
- Claude Code and DeepSeek Harness only; Codex and pi hand the fact to a browsing task.
- haiku, 30 s; expect ~20 s. Faster needs fewer model round trips (todo).

**Summary.** A session holding only Claude Code's WebSearch and WebFetch (verified by its init
event) answers one live fact in 18–25 s on haiku for about $0.05, with typed, clipped results and
an honest "not settled" two times in five. It replaces D378's minute-long task row for single
facts; everything bigger stays a task.
