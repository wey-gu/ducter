# 194 · Gaps, round 2: the three first weeks after D435–D446, what is unproven, the next ten

Date: 2026-11-21, on main at `7eef0a5f` (0.1.7, D444–D446 merged). Follows research/184, whose top
ten were mostly built in one day. Read: `motivation.md`, research/184 (and its private names),
`design/decisions.md` D425–D446, `design/todo.md`, `design/scenarios.md`, research/185–192, and the
code at the seams named below (`apps/desktop/internal/views/float.go`, `packages/protocol/src/talk.ts`,
`packages/runner/src/tools.ts`, `packages/core/src/{fresh-look,doc-check,brain-hold,api-key}.ts`,
`packages/core/src/channels/hub.ts`, `packages/partner/eval/results/`). hel and the author's Mac were
**not** read; no outside product was re-read. Nothing here is new live evidence.

Tags: **VERIFIED** = read in docs, code or tests at this commit; **DOCUMENTED** = a provider's own
docs as cited in research/189; **INFERRED** = judgment. Stars: 好用 · 顺滑 · 赏心悦目 · 放心 · 惊喜.
B = breaks, Z = bores, S = falls short.

## 0. Where research/184's ten stand (VERIFIED, by Dn)

| 184 # | Now | Proof |
|---|---|---|
| 1 errand to the pay page | D436, D446 (5) | fixture shop in a real headless Chrome; no real site |
| 2 partner never quiet | D435, D446 (`BrainHold.ahead`) | fakes, fake clock |
| 3 one aha on a real life, measured | **not started** | — |
| 4 first answer with no plan | D440, D443 (1) | fakes; no real key, no bare Mac |
| 5 talk hands-free | D442, D446 (1) | fakes; never a real microphone |
| 6 a live-proof lane | **not started** | — |
| 7 a look before it goes out | D437, D443 (2) | haiku over 35 written cases |
| 8 documents with a bar | D439 | real local rendering, 31 seeded documents |
| 9 the partner beside the workbench | D438, D446 (4) | Mac test renderer, one native run |
| 10 the stores | **not started** (gated) | — |

Plus Mem/Bridge (D433, D444), Settings (D432, D445), polish (D441, D443, D446). research/184 §4 said
"no Settings polish pass before #1–#3"; D445 was one. The two unstarted items that need no new
surface (#3, #6) are the ones that would turn today's builds into evidence.

## 1. Three first weeks, re-walked (seams first)

### 1.1 The heavy multi-agent developer

| Day | What happens now | Where it falls short | Star | Tag |
|---|---|---|---|---|
| 1 | Codes in the editor; the mini window comes once (D438), shows the waiting line, the partner's newest words, or the oldest question | **The mini window drops what a fresh look left.** `floatSay` shows `ds[0].Question` and the reply's text clipped to two lines; the 另一个 AI 看过 lines live in `results.go`, `task.go`, `conversation.go`, `quiet.go`, not `float.go`. A Go whose draft another AI flagged reads as a plain question there, and can't be answered there anyway (todo "Answering a question from it") | S 放心 | VERIFIED |
| 1–3 | A code task's done report: doc check (if files), then the mechanical evidence check, then the fresh look | **Two holds in a row for a made file.** `tools.ts` runs `docCheck` (bounces once) and then `freshLook.take` on the next report; a PDF made in a task folder can earn a doc bounce, then a look bounce (up to 20 min each). No test covers both on one task | S 顺滑 | VERIFIED (order) / INFERRED (how often) |
| 2–3 | The review loop every 45 min (D427, D429) | Rebuilt twice; "see it on hel after the upgrade" still open; condition loops never seen live | S 放心 | VERIFIED (todo) |
| 3–5 | Claude Code runs out; Codex answers (D435) | Proven on fakes only. A restart while the fallback answers starts it fresh (todo). **No partner eval on Codex since 11-10** (`results/`: last non-haiku run `2026-11-10-codex-…-smoke`), so the fallback partner has not been measured on the persona and tools added since | S 放心 | VERIFIED |
| 5 | "把购物车里那三样买了" from the phone (D436) | Fixture shop only; a worker Mac's Ducter browser over a real socket untested; on haiku the relay once ended on "要付款吗？" and the ack doesn't always say it stops at payment | S 惊喜 | VERIFIED |
| 7 | Terminal agents reach the partner through Bridge (D433, D444) | Every Mem shape D444 reads is INFERRED from help and strings (nmem 0.10.121); the last live trial (11-20) failed every scenario and was not rerun | B 放心 | VERIFIED |

Week verdict (INFERRED): the features are where he works now, but they don't yet speak to each other
in the small window he'll actually look at, and the trust half (limits, loops, Bridge) is still
fakes.

### 1.2 The consumer personal-AI user

| Day | What happens now | Where it falls short | Star | Tag |
|---|---|---|---|---|
| 0 | No plan: 还没有密钥？ offers Kimi in mainland China, OpenRouter free where Gemini's free tier isn't, else Gemini free (D440) | Never walked with a real key or a bare Mac's pi install. A wrong step here is the whole product failing silently | S 好用 | VERIFIED |
| 1 | Asks for a PDF, "帮我订周五的高铁", a find | **One free key carries everything.** Nothing in `fresh-look.ts`, `doc-check.ts` or `brain-hold.ts` knows a key is free-tier (only `api-key.ts` reads `is_free_tier`). OpenRouter's free models allow 50 requests a day under $10 ever bought (DOCUMENTED, research/189); the partner's turns, every task's turns, a fresh look per result and a doc check share it. When it runs out, D435 finds nobody to fall back to and says "back in 1 h" for a cap that resets at day's end | B 放心 | VERIFIED (no free-tier code) / DOCUMENTED (cap) / INFERRED (when it bites) |
| 1 | The partner on a free model (gemma-4-31b free, Gemini 3.8 Flash free, Kimi) | **The partner eval has never run on any model a key-only user gets** (pi runs: one, DeepSeek Flash, 11-10). research/189 itself warns small models misroute with ~20 tools. The errand ack, the "stops at payment" promise, 别记这个, "你都记得我些什么" are measured on haiku only | B 好用 | VERIFIED / INFERRED |
| 2–6 | Morning finds (K6–K19) | Still no report of a find taken on a real life (research/184 #3 not started). The motivation's whole pull rests here | S 惊喜 | VERIFIED |
| 3 | Talks while cooking (D442), a checkout card arrives | Handled by design: `talkFloor` returns "pay" for `checkout`, said **这个要你在屏幕上点一下。**, "好" never a Go; 去看看 ends the talk. Never with a real microphone or a real echo | S 顺滑 | VERIFIED (code) |
| 3 | The same card while they live in WeChat or Telegram | `cardPolicy` → "never": the chat app says to open Ducter with a link; the live view must be the phone app or web. Correct for the floor; the consumer who only ever used the chat app meets the app for the first time at the pay step | S 顺滑 | VERIFIED / INFERRED |
| 4 | "你都记得我些什么？" (D444) | Fails open if Mem's shapes differ; INFERRED shapes, no live read | S 惊喜 | VERIFIED |

Week verdict (INFERRED): day 0 now has a door, but behind it the consumer runs on a model and a quota
nothing was measured on; one heavy day can spend a free key before lunch and the partner would say
the wrong return time.

### 1.3 The fresh user

| Day | What happens now | Where it falls short | Star | Tag |
|---|---|---|---|---|
| 0 | Kept first message, answered first once a key works (D440) | Good design; unwalked | — | VERIFIED |
| 0 | Taps the mic before any key | Talk starts (D442); nothing can think, so the kept-message line is said. Whether the talk then waits its quiet minute and ends with 我先不听了 is not in `talk.json`'s 13 talks | S 顺滑 | INFERRED |
| 1–3 | Features meet them unevenly: the mini window and talk each have a first card; On hand's folds, Past tasks, Done for you, 记下了 still silent | research/150 #8's "first meeting" still only a todo line (`todo.md` "#8 A feature's first meeting") | S 好用 | VERIFIED |
| any | The floor holds in code: pay presses refused (D436 (4), D446 (5)), never by voice, never from a chat app | Strong | — | VERIFIED |
| 7 | Phone | iPhone TestFlight, Android without a release key; no store page to land on | B 好用 | VERIFIED (roadmap) |

Week verdict (INFERRED): safe and kind in words, but the supply problem moved rather than
closed: from "no plan" to "a free tier nothing is paced for".

## 2. Built but unproven: the owed live checks of D425–D446, ranked by risk

Risk = how likely the fake differs from the real thing × what breaks if it does (the floor, the only
door, daily trust, polish). All owed items below are VERIFIED as open in `todo.md` or the Dn.

| Rank | Owed | From | Why it carries risk | Needs |
|---|---|---|---|---|
| 1 | Errand on one real site: the gate's pay words on real checkouts, the card's host and total, the live view paying on a phone (wallet, QR, 3-D Secure, a bank app leaving the view), a worker's browser over a real socket | D436, D446 (5) | The floor is money. The gate is a word list plus names; a nameless pay control in another site's frame still passes (todo says so). And it is the motivation's "wow" | the author's signed-in browser, one real shop |
| 2 | The partner eval on Codex and on pi with each D440 route's model (Gemini 3.8 Flash free, gemma-4-31b free, Kimi) | D435, D440 | The fallback and the key-only user's partner were never measured on the persona and tools since D177; a misrouted tool here is silent | Codex here (subscription); the free keys need a person's account |
| 3 | A real walk of D440: bare Mac, pi put in place by D363's install, a real free key, first message answered | D440 | The only door for two of three users; Node and pi install paths differ on real Macs | a throwaway account the author makes |
| 4 | A real limit hit of the partner's own agent; how pi/OpenRouter's 429 and daily cap reach OAR's `quota` / `rate_limited` | D435, D297 | Silence at the busiest hour; for free keys, a wrong reset time | a real 5-hour window; a free key run to its cap |
| 5 | Loops live on hel: a round reported done stays on 等下一次; condition loops; the move to an awake computer | D427, D429 | Rebuilt twice in two days; the author's daily loop | the next release on hel |
| 6 | Mem shapes read live: `bridge contacts`, `resources get --json`, `KnowledgeReference`s, `--include-activity` fields | D433, D444 | All INFERRED; the last live trial failed every scenario. Fails open (empty, not wrong), which is why it's not higher | Mem on the author's Mac or hel, read only |
| 7 | Talk with a real microphone: the 1.2/2.4 s gaps, the echo guard on speakers, Safari and the iPhone shell recognizing while speaking | D442 | If Safari stops the recognizer while speaking, barge-in is gone on iPhone; a talk that hears itself answers itself | the devices |
| 8 | Fresh look's real measure: noise and misses on the author's tasks | D437 | 36/36 is an upper bound on findable cases; a noisy look adds up to 20 min to every code result and spends a paid agent | a week on hel |
| 9 | Documents' real measure; Poppler absent on the home (8 of 13 PDF defects unseen without it) | D439 | Fails open, so a missed defect reaches the person "checked" | the author's own asks |
| 10 | Several things in one message live; the finder on real sentences | D426, D430, D428 | Haiku evals only; D428 was "根本用不起来" two days before | hel |
| 11 | Mini window natively over full-screen apps, other Spaces, Stage Manager | D438 | A panel that takes the keyboard breaks 顺滑 for the one user who wants it | a signed build |
| 12 | The alive line on the iOS Simulator and a phone's frame rate; a live turn timed against 1.4 s dwell | D425 | Polish; worst case a janky loop | the next iOS build |
| 13 | Raters for D426/D430/D434 words, the errand's words, the fallback line, 换回来 | D426–D446 | Words are the product, but LLM proxies have read some | people |
| 14 | D445's package-manager line on a real Fedora/Arch home; D431's walk in the real Mac web view and a phone | D445, D431 | Low | a VM; the built app |

Thin evidence, plainly: ranks 1–4 are judged from the code and the todo, not from any failure seen;
the free-tier cap is the provider's documented number, not a measured run.

## 3. The next ten, ranked

Score as research/184: impact (1–5) × reach (users, 1–3) × cost (3 = a branch with fakes, 2 = a real
device or account, 1 = gated on others). Ordered by score, then by the motivation's weight.
**★ = start now, needs nothing from the author.**

| # | What | I | R | C | Score | Size | Fakes now |
|---|---|---|---|---|---|---|---|
| **1 ★** | A free key paced, and its limit said truly | 4 | 2 | 3 | 24 | S–M | yes |
| **2 ★** | The partner eval on the partners people actually get | 4 | 3 | 2 | 24 | S | half (Codex now; free keys later) |
| **3 ★** | The seams closed: one hold per result, the mini window says what's left | 3 | 2 | 3 | 18 | S | yes |
| 4 | The errand's live proof on one real site | 5 | 3 | 2 | 30 | M | no |
| 5 | The live-proof lane, weekly (184 #6) | 4 | 3 | 2 | 24 | M | no |
| 6 | One aha on a real life, measured (184 #3) | 5 | 2 | 2 | 20 | M | no |
| 7 | A real D440 walk on a bare Mac | 5 | 2 | 2 | 20 | S | no |
| 8 | A feature's first meeting (research/150 #8) | 3 | 2 | 3 | 18 | M | yes |
| 9 | The talk with a real microphone, then decide Safari's barge-in | 3 | 2 | 2 | 12 | M | no |
| 10 | The stores (184 #10) | 4 | 2 | 1 | 8 | S, gated | no |

#4–#7 score as high or higher but each waits on the author (a signed-in shop, hel, a throwaway
account), so the three ★ go first and make #4–#7 cheaper when the author is back.

### 1 ★ A free key paced, and its limit said truly
- **Who:** the consumer and the fresh user on D440's free routes. **Feel:** before (INFERRED), a busy
  morning spends the key and the partner says "back in 1 h" for a cap that resets tomorrow; after,
  放心: it spends what it has on the person's own asks first and says the real time.
- **Sketch.** Keep `free: true` from `api-key.ts` on the account (D288's book). On a free key: no
  fresh look (or only for an outward Go), the doc check by code only, at most one task at a time; the
  limit read as the provider's (OpenRouter's daily count, Gemini's per-minute) so D435's hold says
  the true reset; one line the first time the day's cap nears (**今天免费额度快用完了…**) with the
  paid way one tap away. Needs a Dn and a short research note on each free route's real 429 body.
- **Size** S–M. **Fakes:** yes (a fake pi harness returning the provider's 429 shapes).

### 2 ★ The partner eval on the partners people actually get
- **Who:** all three: the developer's fallback (Codex), the key-only consumer's and fresh user's (pi
  on a free model). **Feel:** 放心 that the partner they meet behaves as haiku does.
- **Sketch.** Run `bun run eval:partner --harness codex` now (the harness flag exists; last run 11-10)
  and record per-category deltas against haiku; add a model per D440 route the moment a key exists.
  Where a small model fails a floor scenario (errand ack, 别记这个, a Go), that is a routing or
  persona fix, not a model complaint. **Size** S (a run and a table). **Fakes:** n/a; Codex is
  author-free if signed in here (subscription spend, not money), the free models need a key.

### 3 ★ The seams closed
- **Who:** the developer (mini window, code results) and anyone making a document. **Feel:** 顺滑 one
  round, not two; 放心 the small window never hides a warning the big one shows.
- **Sketch.** (a) A result gets at most one held round: when the doc check bounced, the fresh look
  rides on the fixed report's check instead of a second bounce (`tools.ts`), with a test for a PDF
  task with a folder diff. (b) The mini window's ask line carries the look's first left item in the
  needs-you ink, as `quiet.go` does for the menu bar extra. (c) A talk begun with nothing to think
  with: a fixture in `talk.json` (kept line said, then end). (d) A partner-held line in the mini
  window's header state, as the conversation's header. **Size** S. **Fakes:** yes.

### 4 The errand's live proof on one real site
- **Who:** all three. **Sketch** as `todo.md`: read-only to the pay page on the author's signed-in
  browser, the gate's words read against five real checkouts, a phone paying in the live view.
  **Needs** the author once.

### 5 The live-proof lane
- **Who:** everyone, as the 放心 floor. **Sketch:** §2's table as a dated weekly run on hel and the
  author's Mac (rows 1–9 first); a regression becomes a todo line. **Needs** devices and hel.

### 6 One aha on a real life, measured
- **Who:** the consumer and the author. **Sketch** as research/184 #3: `ducter proactive replay
  --days 7` on hel read only plus finds said / taken / 有用 / silenced from the Log; a find whose next
  step is a visit hands to D436. **Needs** hel reachable (read only).

### 7 A real D440 walk
- **Who:** the consumer and the fresh user. **Sketch:** a bare macOS VM, a real free key per route,
  pi put in place, the kept message answered; timed. **Needs** a throwaway account the author makes.

### 8 A feature's first meeting
- **Who:** the fresh user. **Sketch:** research/150 #8: one page of three small moving cards, the
  first time their own step meets On hand's folds, Past tasks, Done for you, 记下了; once per device.
  Needs the metaphor pass (AGENTS.md) and a Dn. **Fakes:** yes. Size M.

### 9 The talk with a real microphone
- **Who:** the consumer. **Sketch:** `todo.md`'s live check; if Safari stops recognizing while
  speaking, say so and listen after the voice on iPhone. **Needs** devices.

### 10 The stores
- **Who:** the fresh user and the consumer. Android release key, iPhone out of TestFlight. Gated on
  accounts and review; without it every day-0 gain above reaches Mac owners only.

## 4. What not to do next (INFERRED)

- A third Settings round or another polish pass: nearly every one of D425–D446 says fakes only, and
  the risk now sits in §2, not in panes.
- More surface for the free tier (a usage page, a plan chooser) before #1's pacing: the fix is that
  Ducter spends less and says the truth, not that the person manages a quota.

## Implications for Ducter

Start three now with nothing from the author: pace a free key and say its real limit (the
key-only users' week breaks there, by documented caps); run the partner eval on Codex and record it,
then on each free route once a key exists (the partners people actually get were last measured on
11-10); and close the seams found here (two holds on one document result, the mini window hiding
what another AI left, a talk with nothing to think with). Then, with the author: the errand on one
real site, a weekly live-proof lane, the finds measured on his real life, a bare-Mac walk of D440.

**Summary:** research/184's ten are mostly built, with good design and honest floors (pay never by
voice, never from a chat app, refused in code). What remains is that almost all of it is proven on
fakes, and two seams nobody owned: a free key that one busy day can spend with the partner then
saying the wrong return time, and a partner eval that has only ever measured haiku while the
fallback and key-only users talk to Codex or a free small model. Smaller seams: a document result
can be held twice; the mini window drops what another AI flagged. The finds on a real life (the
motivation's aha) and the live-proof lane are still not started and are the next evidence that
matters.
