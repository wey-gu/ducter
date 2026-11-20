# 184 · Gaps against the motivation: three first weeks, what the references do, the next ten

Date: 2026-11-21, on main at `294515b6` (D433 merged). Follows the three gap audits (research/100,
research/150, research/162). Read: `motivation.md`, `design/principles.md`, `design/roadmap.md`,
`design/todo.md`, `design/scenarios.md`, `design/decisions.md` D388–D434, research/150–183, and
the private reference notes (98, 150, 154, 162, 173 and a fresh read-only clone of one open agent
app at its 2026-11-21 head; names only in `research/private/184-gaps-named.md`). The author's home
(hel) was **not** read this round, so nothing below is new live evidence from his week; where a
claim leans on hel it cites the report that read it.

Tags: **VERIFIED** = read in Ducter's docs, code or tests at this commit, or in a cited report that
read hel's Log; **DOCUMENTED** = an outside product's own docs or the author's account of a product;
**INFERRED** = judgment. Reference products are named only by kind: "an open agent app" (a
desktop + phone GUI over Claude Code, Codex and pi, with a cloud account), "a consumer personal
AI" (the inbox-reading kind and the spaces kind the motivation names), "a team-chat agent app".

## 0. What changed since the third audit (VERIFIED)

research/162's eight gaps, now: #1 a spoken preference binds at once (D401, built); #3 finds worth
a tap, a reply already written (D403, built, replayed on hel's mail 4/4 worth saying, research/164);
#4 a connected account that can't be read says so (D402); #5 own small apps (D405, D407, D410,
D422, D431). **Still open:** #2 the errand to the pay page in the person's own signed-in browser
(no Dn; no `去付款` / Go to payment anywhere in `design/`), #6 a real limit hit (todo "Usage
limits"), #7 the stores (roadmap Next), #8 hands-free voice and sitting in on a call (docs
`voice.md`, `calls.md` "Coming soon").

The shape of the last 40 decisions (D395–D434, VERIFIED by their own headings): ten are polish
passes on Settings, Devices and words (D398, D399, D404, D406, D408, D420, D421, D424, D432, D434),
six are Bridge and Mem (D400, D409, D412, D417, D418, D433), seven are small apps and loops (D405,
D407, D410, D422, D427, D429, D431). Nearly all say "checked with fakes"; the live Bridge trial failed every
scenario on 11-20 (D409) and the fixes after it were not rerun live (D412).

## 1. Three first weeks, as built today

The north star: 好用 easy · 顺滑 smooth · 赏心悦目 delightful to look at · 放心 trustworthy ·
惊喜 pleasantly surprising. Each row is where the week breaks (B), bores (Z) or falls short (S).

### 1.1 The heavy multi-agent developer (the author's shape)

| Day | What happens today | Where it falls short | Star | Tag |
|---|---|---|---|---|
| 0 | One-line install on a server or the Mac app; workers join with one pasted line (D347); agents installed and signed in from the card (D363); Mem connected once at the home and carried to every task (D393) | Smooth; nothing to add | — | VERIFIED (research/127 live in VMs) |
| 1 | Hands over GitHub to-dos (D385, D428 finder), tasks on Codex / Claude Code / DeepSeek / Antigravity, On hand, the workbench (D214), ⌘K (D391) | The finder was "根本用不起来" two days ago (D428 rebuilt it, fakes only). A floating partner window for the workbench mode (motivation "keep the partner in a floating window") exists nowhere in `design/` | S 好用 | VERIFIED |
| 2–3 | A review loop every 45 min (D394, D427, D429), the review board (D407), posting without asking where he said so (D413) | The loop's reliability was rebuilt twice in two days (round 185 stopped it, research/177); fixes are fake-clock only | S 放心 | VERIFIED |
| 3–5 | Many tasks overnight; one Claude Code or Codex window runs out | A task waits and resumes (D297), fakes only. **The partner's own harness running out has no plan** (`todo.md` "Usage limits": "the partner is not a task: no wait today"); the partner's fallback picks by sign-in, not by limit (`core/test/loadout.test.ts`). INFERRED: the one window he talks to can go quiet exactly when the most is running | B 放心 | VERIFIED / INFERRED |
| 5 | "订这个酒店，我来付款" from the phone while the server home works | research/162 #2: four tasks for one trip, the browser lost, he booked it himself. Still the open gap | B 惊喜 | VERIFIED (hel, research/162) |
| 7 | His terminal Claude Code asks the partner (Bridge) | The live trial failed every scenario on 11-20 (D409); gated on Mem's releases | B 放心 | VERIFIED |

Week verdict (INFERRED): the conductor half is real and live; what stops him is trust under load
(limits, loops, Bridge) and the one errand that would make him say "wow".

### 1.2 The consumer personal-AI user

| Day | What happens today | Where it falls short | Star | Tag |
|---|---|---|---|---|
| 0 | Needs a Mac, the Mac app, and a Claude or ChatGPT plan, or a pasted DeepSeek / Kimi / OpenAI key (D298, D307). The iPhone app is a TestFlight beta; Android an APK without a release key; no Windows | Every reference consumer AI is one store install with a model included. A key is a purchase on another site before the first word | B 好用 | VERIFIED (roadmap, docs/faq) |
| 1 | Connects Gmail and the calendar through oo (one tap if oo is signed in, else three steps, D158); the 3-day look (K6) | INFERRED, not checked against oo's catalog: mail outside Google's (QQ, 163, iCloud) may have no path but an MCP address, which a mainland user meets first | S 好用 | INFERRED |
| 2–6 | The morning note, at most three finds (K7, D388, D403) | On hel, 13 finds from 11-12 to 11-19, **none taken**; D388 and D403 improved replays (5/5, 4/4) but no report shows a find taken on a real life since. The motivation's whole pull rests here | S 惊喜 | VERIFIED (research/162, 164) |
| 3 | "帮我问问酒店能不能加一晚" | The next step stops at a task with a report; the in-window sign-in, the page held for "you pay" are the open gap #2 | B 惊喜 | VERIFIED |
| 4 | Talks while cooking | Hold to talk only (D305), never with a real microphone; no hands-free call | S 顺滑 | VERIFIED |
| 5 | A small app from one sentence (D405–D431), pinned lists (D381) | Good, and fresh; apps can't be shared and need the connection (docs `apps.md`) | — | VERIFIED |
| 7 | WeChat / Telegram / iMessage windows on the one conversation (D276, D277, D301) | Built with fakes; WeChat on hel configured with zero messages (research/162) | S 放心 | VERIFIED |

Week verdict (INFERRED): a consumer who gets past day 0 meets the best design in the category; most
won't get past day 0, and the one moment that would keep them (an aha that was worth it) has not
yet been seen on a real inbox.

### 1.3 The fresh user who has never heard of a subagent

| Day | What happens today | Where it falls short | Star | Tag |
|---|---|---|---|---|
| 0 | A friend says "try Ducter"; ducter.ai's line is for builders (D414) | Correct positioning, but nothing on the site meets them; no store listing to land on | S 好用 | VERIFIED |
| 0 | First words come from the home, offers from their own agents' records (D298) | A fresh user has no agent records, so the offers are empty; no "here is what I can do for you" made from their own day. INFERRED | S 惊喜 | VERIFIED (D298) / INFERRED |
| 1–3 | Features meet them unevenly: some with a first-use card (voice), most silent (On hand's folds, Past tasks, Done for you) | research/150 #8, no Dn since (VERIFIED by grep) | S 好用 | VERIFIED |
| any | Words are plain, Go waits for anything outward, Done for you records it (D300) | Strong. The floor holds | — | VERIFIED |

Week verdict (INFERRED): the fresh user is designed for in words and safety, but not in supply:
Ducter assumes an engine they don't have.

## 2. What the references do that delights or retains, that Ducter doesn't

| # | What | Why it retains | Ducter today | Tag |
|---|---|---|---|---|
| R1 | An open agent app ships the agents and a hosted model with free credit; detects any plan; recognises any pasted address + key; offers local models | Zero to first answer in a minute, for anyone | Own plan or a pasted key; no hosted Ducter by decision; no local model path | VERIFIED (their repo docs, research/98) |
| R2 | The same app's **input handoff**: a sign-in or a value is handed to the owner in the very window the agent is driving (a bar over the field on the computer, a single-window live picture on the phone), then the agent carries on | Errands finish instead of stalling | D190 live view and the person's own turn exist; not for a worker Mac's own Chrome, not as one errand to the pay page | VERIFIED (their docs, research/162 private) |
| R3 | The same app's **privacy screen** (the AI keeps using the computer while it shows a cover) and **remote desktop from the phone** | The laptop at home becomes the hands of the phone | None | VERIFIED (their docs) |
| R4 | Usage limit → "continues automatically at X · Cancel"; several subscription accounts pooled | Heavy users stop babysitting windows | Built for tasks (D297), fakes; partner none; no pools | VERIFIED |
| R5 | Voice conversation with the companion: a call bar that survives navigation, barge-in, sentence-by-sentence speech, voice answers to question cards | Talking while doing something else | Hold to talk (D305) | VERIFIED (their docs) |
| R6 | A document workshop: PDF, Word, PPT and Excel made from an HTML draft under a quality contract, built in, no plugin | "Make me the deck / the visa PDF" returns something you'd send | Tasks may make files; the viewer shows them (D239); no quality contract for deliverables | VERIFIED (their docs, 2026-11-21 head) |
| R7 | `/review`: on-demand review of any deliverable (code, document, visual), measured by "how many later must-fix comments it caught first" and by noise | A second look before others see it | Done is checked against evidence (D4); the review loop reviews others' PRs; no review of one's own result before it goes out | VERIFIED (their docs) |
| R8 | Copy a task to another computer; open a session from another device; use a provider configured on another computer | Work follows the person | Continue on another computer (D376); `ducter move` for the whole home is todo | VERIFIED |
| R9 | An island / Live Activities / widgets showing what agents are doing | Silence-means-success made visible | Lock Screen and shade (D306), fakes | VERIFIED |
| R10 | A consumer personal AI reads the inbox and says the one thing before you knew (a lapsing domain, a flight that doesn't match the hotel) | The aha that makes it indispensable | Designed and replayed (K6–K19), not yet worth a tap on a real life | DOCUMENTED (the author's account) |
| R11 | A consumer personal AI keeps "spaces", small apps it made | Something of yours lives there | Built (D405–D431) | DOCUMENTED |
| R12 | A team-chat agent app splits one message into tasks under the message | One ask, many hands, one place | Built (D426, D430) | VERIFIED (research/173) |

Where Ducter is ahead and should stay ahead (VERIFIED in research/98, still true): the reading of
the person's accounts with restraint (no reference open product does it), cross-tool memory
through Mem, the sessionless partner, outward effects behind Go, real phones and calls.

**Thin evidence, said plainly:** the consumer products (R10, R11) are known only from the author's
account and screenshots, never from their source; the open agent app's docs say what it intends,
and its live quality was never measured here. A shallow clone dates every file to the head, so
"new since 11-19" is judged by comparison with the earlier private notes, not by history.

## 3. The next ten, ranked

Score = **impact on the motivation** (1–5) × **reach** (how many of the three users, 1–3) ×
**cost** (3 = a branch with fakes, 2 = needs a real device or account, 1 = gated on others).

| # | What | Impact | Reach | Cost | Score | Size |
|---|---|---|---|---|---|---|
| **1** | **The errand that ends on the pay page** | 5 | 3 | 2 | 30 | L |
| **2** | **The partner never goes quiet when its agent runs out** | 4 | 3 | 3 | 36 | S–M |
| **3** | **One aha on a real life, measured** | 5 | 2 | 2 | 20 | M |
| 4 | A first answer with no plan (the fresh and consumer day 0) | 5 | 2 | 2 | 20 | M |
| 5 | Talk as a call, hands-free | 4 | 2 | 2 | 16 | L |
| 6 | A live-proof lane: what "fakes only" owes, run weekly | 3 | 3 | 2 | 18 | M |
| 7 | A look over its own result before it goes out | 3 | 2 | 3 | 18 | M |
| 8 | Things you'd send: documents with a quality bar | 3 | 2 | 3 | 18 | M |
| 9 | The partner beside the workbench (a floating window) | 2 | 1 | 3 | 6 | S–M |
| 10 | The stores | 4 | 2 | 1 | 8 | S, gated |

Ordered by the motivation's weight within near scores, not by score alone: #1 and #3 are the
motivation's own stories and the only things only Ducter promises; #2 scores highest and is
cheapest, so it starts at once.

### 1. The errand that ends on the pay page (start today)
- **For** all three; the consumer's reason to come. **Feel:** before, "FYI 我自己定了"; after, "it
  got me to the last tap", 惊喜 and 放心 at once.
- **Sketch.** One errand is one task on the computer where the site is signed in (D157 already knows
  where; research/147), in one browser window it opens and keeps. Its connection is probed before
  it starts and re-attached, never "unavailable" mid-errand. When it needs the person (a sign-in, a
  seat, a code) the card opens that same window live wherever they are (D190's live view, extended
  to a worker Mac's own Chrome), they act, the task carries on. It stops on the pay page with one
  card, **去付款 / Go to payment**, that opens that page where the person is; Ducter never pays
  without the Pay card (D191). Needs the metaphor-free literal design pass and a Dn.
- **Depends on** the author's MacBook with the agent's browser connected; one real site, read and
  final page only. **Fakes now:** yes for the flow (a local fixture shop on a scratch home with
  Chrome for Testing, the worker socket); the real-site proof is owed.

### 2. The partner never goes quiet when its agent runs out (start today)
- **For** the heavy developer first (five-hour windows), the consumer on one plan. **Feel:** before
  (INFERRED), silence at the busiest moment; after, the partner answers on another signed-in agent
  and says once, plainly, what happened, 放心.
- **Sketch.** When the partner's own turn fails on a limit, the next turn runs on the next signed-in
  agent that can be the partner (the fallback list already exists for sign-in), from the same Log
  projection (principle 4's re-cut, never "I was reset"); the person sees one line ("Claude Code 到
  额度了，我先用 Codex 接着，3:12 后换回来"), switched back at the reset unless they chose. With no
  other agent: the conversation says when it comes back, and a message sent meanwhile is answered
  then, in order. Persona unchanged, so no eval unless a tool changes (D175).
- **Depends on** nothing outside. **Fakes now:** yes (a fake harness that returns the limit shape
  recorded per agent in D297). Live proof rides on #6.

### 3. One aha on a real life, measured (start today)
- **For** the consumer and the author. **Feel:** the motivation's domain-renewal moment, the thing
  that makes Ducter impossible to put down.
- **Sketch.** Not new detectors: a weekly read-only measure on hel (the replay kit `ducter proactive
  replay --days 7`, nothing sent) plus the Log's real outcomes: finds said, taken, marked 有用,
  silenced, and the misses the author names. A short ledger in research each week. Where a find's
  next step is a visit (a renewal page, a booking), it hands to #1 so Go ends at "you only pay".
  Without one taken find in two weeks, the right next move is to change what is said, not to add
  surface.
- **Depends on** the author's mail and calendar (read only) and hel reachable. **Fakes now:** the
  measure needs real data; the hand-off to #1 does not.

### 4. A first answer with no plan
- **For** the fresh user and the consumer. **Feel:** "it just talked to me" in the first minute.
- **Sketch.** Ducter can't host a model (roadmap, by decision). The self-hosted equivalent: on the
  first screen with no signed-in agent, one sheet that gets a working key in under three minutes
  (the cheapest provider that sells to the person's region, opened in a browser, the key read back
  and checked, D298's check), and a local model offered where the Mac can run one. First words that
  show what it can do from their own day when there are no agent records (one connected account's
  look, K6). A feature's first meeting as one page of three moving cards, triggered by their own
  step, once per device (research/150 #8).
- **Depends on** a provider whose sign-up is fast in each region (research needed). **Fakes now:**
  mostly; the sign-up walk needs a throwaway account.

### 5. Talk as a call, hands-free
- **For** the consumer. **Feel:** driving or cooking, it answers first while the work starts.
- **Sketch.** D218's realtime loop reused for the person instead of a callee: a call bar that
  survives moving around the app, barge-in, Go / Hold answered by voice, work handed to tasks as
  today; cost said before the first call. **Depends on** a real microphone and a realtime model on
  the person's key. **Fakes now:** the loop and UI yes; quality no. Size L.

### 6. A live-proof lane
- **For** everyone, as the 放心 floor. **Sketch.** A weekly scripted run of what the last 40
  decisions owe live: the long-conversation replay on real cheap models (roadmap Next), one real
  limit hit (`todo.md` Usage limits), the Bridge rerun after D412, real APNs on the Lock Screen, a
  real WeChat message, a real microphone; results as a dated table in research, regressions as
  todo lines. **Depends on** devices and the Mem team for Bridge. **Fakes now:** no, by definition.

### 7. A look over its own result before it goes out
- **For** the heavy developer, then anyone sending a document. **Sketch.** Before a task's result
  is reported done (or before a PR or a reply goes out behind Go), a clean-context check by another
  agent reads the result against the brief and says only what must change; measured by later
  must-fix comments it caught and by its noise, never by count. Fits principle 12's typed report as
  evidence. **Depends on** nothing. **Fakes now:** yes; quality needs real runs.

### 8. Things you'd send: documents with a quality bar
- **For** the consumer and the fresh user ("把签证材料整理成一个 PDF"). **Sketch.** A small,
  fixed deliverable path in every task (an HTML draft, then PDF / Word / slides) with a written
  quality bar (cover, hierarchy, margins, fonts that carry Chinese), found in Made for you (D383)
  and opened in the viewer (D239). **Depends on** nothing. **Fakes now:** yes.

### 9. The partner beside the workbench
- **For** the heavy developer only (motivation: "an optional mode most people won't use").
  **Sketch.** On the Mac, the conversation as a small always-on-top window that follows the
  opened task, the same messages and cards. **Fakes now:** yes. Low reach, low cost.

### 10. The stores
- **For** the fresh user and the consumer. Android release key and verification; the iPhone app
  out of TestFlight (roadmap Next, Build state). Builders' part is small; gated on accounts and
  review. Without it #4 helps only Mac owners.

## 4. What not to do next (INFERRED)

- Another Settings or Devices polish pass before #1–#3: ten of the last forty decisions were polish,
  and the author's open complaints are about errands, finds and trust, not panes.
- A hosted model or a cloud account (contradicts "no hosted Ducter"), shared multi-person tasks, a
  plugin market: the references do these; Ducter's promise is personal and self-hosted.

## Implications for Ducter

Start three today: the partner that answers on another agent when its own runs out (small, all
users, fakes now); the errand that ends on the pay page, designed through the change loop and built
on a fixture shop first; and a weekly read-only measure of the finds on the author's real life,
because no report yet shows one taken. Then a first answer with no plan, and a weekly live-proof
lane for what has been built on fakes. Keep voice-as-a-call, reviews of its own results,
deliverables with a quality bar, the floating partner and the stores in `todo.md` with their
triggers.

**Summary:** since the third audit, Ducter closed preferences that bind, finds with replies
written, honest accounts and its own small apps; the conductor half is live for the author. What
still stands between it and the motivation is the moment it was built for (an errand finished to
the last tap in the person's own browser, an aha worth the tap on a real inbox), trust under load
(the partner has no plan when its own agent runs out; most of the last forty decisions are fakes
only; the live Bridge trial failed), and day 0 for anyone without a plan or a Mac. The references
win on supply (agents and a model included), in-window handoff, voice calls, deliverables and
review; Ducter leads on watching your life with restraint, cross-tool memory and attention design,
and should spend the next week proving that lead live rather than polishing panes.
