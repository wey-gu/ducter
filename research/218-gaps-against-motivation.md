# 218 · Gaps against the motivation, round 4: every promise and every north-star quality, then the next ten

Date: 2026-11-24, on main at `cbc83e24` (0.1.27). Follows research/184, research/194 and
research/201. The author's standing ask: 「参考 … 等项目仔细对比我们的 motivation，野心，哪里有高优先级还没做的事情」.

Read: `motivation.md`, `AGENTS.md` (its Build state), `design/principles.md`, `design/roadmap.md`,
`design/scenarios.md`, `design/todo.md`, `design/decisions.md` D454–D500, `design/build-and-run.md`
"Live checks", the partner eval results (`packages/partner/eval/results/`), and Ducter's code where a
claim below rests on it. Outside, read only and never run: a fresh shallow clone of the open agent app
(its commits since research/201's snapshot) and the three consumer agents' public coverage on the web
this day. The earlier private notes (research/98, 184, 201) were reread. Product names and commit
references are only in `research/private/218-gaps-notes.md` (gitignored). The author's home (hel) and
Mac were **not** read for this report.

Tags: **VERIFIED** = read in Ducter's code, docs or eval results at this commit, or in the open agent
app's repo at its head; **DOCUMENTED** = a product's own page or launch press; **INFERRED** = judgment.
Kinds, as before: "the open agent app" (a desktop and phone GUI over Claude Code, Codex and pi, with a
hosted model and a cloud account); "the inbox-reading consumer agent", "the spaces consumer agent",
"the bot-style agent app" (the consumer products the motivation names).

## 0. Where research/201's ten stand (VERIFIED)

| 201 # | Now | Proof |
|---|---|---|
| ★1 the partner at the bar on Codex | **done for its day**: D462, Codex 189/241 (78 %) against 167/241 | `results/2026-11-22-codex-gpt-6-luna-d462-codex.md`. Since then the persona changed through D477–D499 and the eval grew to 281 scenarios; Codex has not been run again (haiku latest 233/281, `LATEST.json`) |
| ★3 the proof kit | **built, never run**: D463, `ducter check list / run / report`, 11 checks | `packages/cli/src/live-check/`; `design/build-and-run.md` §"Live checks"; `design/todo.md` has **zero** "Seen live:" lines |
| ★4 the aha counted | **built, never read live**: D464, `ducter proactive week` | `packages/core/src/proactive/week.ts`; no week cited anywhere in `research/` |
| 2 errand live, 5 bare-Mac walk, 6 a live offers week, 7 a free model, 8 Mem live, 9 a real mic | 8 **partly** (D461 read Mem's shapes live, read only); the rest not started | research/200; `todo.md` |
| 10 same model, another door | **not started** | `roadmap.md` "Quota awareness" still under Next |

Since 201 the work went to the partner's own mind and the surfaces: the true world and its facts
(D477, D478), self-repair (D473), memory about the person in every session (D487), grounded memory
writes and kept promises (D490), the voice spec (D491), On hand twice (D467, D471, D498), Settings four
times (D468, D469, D475, D500), several partners out of preview (D486, D497), Bridge helpers (D494),
waits that can come true (D483, D496), answered-for-you (D499). Most say "fakes and demo cores only";
the hel-originated ones (D472, D479, D483, D494, D496, D499) were diagnosed from hel's real Log, which
is live evidence of a failure, not of the fix.

## 1. The motivation, promise by promise

| Promise (`motivation.md`) | Ducter today (VERIFIED) | The references do (concepts) | Gap |
|---|---|---|---|
| **A replacement for the lost multi-agent workbench**, within weeks | Tasks on Claude Code, Codex, pi, DeepSeek Harness and Antigravity (`roadmap.md`, D479); the opened task's workbench (`workbench.md`, D214), ⌘K and every task open (D391, D456), On hand as one ledger (D471, D498), merge by button (C5) | The open agent app ships the agents in the installer, imports sessions from ~10 tools, and in the last three days built three ways to pick between accounts of the same model and has scheduled work fall over between them (VERIFIED, its repo) | **Level or ahead on attention and depth; behind on pooling subscriptions** (several accounts of one model, a reserve for the partner, most-left first: `roadmap.md` Next, unbuilt) |
| **Attention: ask only when it truly matters** | Typed reports, decisions with defaults and timers, living message, silence as success (principles 7, 12); answered-for-you (D499), standing go's (D413, D495), the voice spec (D491), self-repair ladder (D473) | Converging on the same: tasks report back by default, rules per action, an automatic review before account-touching steps (research/201 §1) | **Ahead in design**; the live rate of asks a day is unmeasured (no check counts asks per day; `offers-week` counts offers only) |
| **Look out for you: the aha** (the renewal, the flight that didn't match the hotel) | A watched-accounts engine (`packages/core/src/proactive/`, 6.6k lines): a typed fact ledger, offers not interruptions (D453), wider sources (D458), a weekly count (D464). Ran on hel 11-09→11-21: 17 finds, 2 taken up (research/197). **The cross-source finds are hand-written detectors**: `detect.ts` `mismatches()` catches one shape (a flight landing after 18:00 whose night no hotel covers, with a hotel starting the next day); a renewal is a `renewal` fact with a due date | The inbox-reading agent researches in the background with read-only tools and judges per item (DOCUMENTED); the spaces agent keeps a topic page current from connected apps (DOCUMENTED) | **The motivation's two stories are covered only in their exact shapes.** A flight on the wrong day, a hotel in the wrong city, a renewal the card on file can't pay, a passport that expires before the trip: none has a detector, and principle 21 says detectors shouldn't decide meaning at all. `todo.md` "Proactive judged per item" is open, waiting on a labelled week |
| **The next step is real work** (browser, computer, phone) | Errand to the checkout (D436) on a fixture shop in headless Chrome (G8); computer use (D235), phone use (D217, D238), Autofill (D191, one real errand 11-11); phone calls against a fake provider only (B6) | The inbox-reading agent ships its own cloud computer and browser; the open agent app has remote desktop from the phone and a privacy screen (DOCUMENTED / VERIFIED) | **Unproven on a real shop**; calls never placed live |
| **Reading and drafting are fine; outward waits for you** | The D61 floor in code; drafts held with a 30 s undo after Send (`SEND_UNDO_MS`, `protocol/src/proactive.ts`); Done for you, day by day (D300) | Same floor (research/201 §1.2) | **Level.** (`scenarios.md` G2 still says "send undo —": stale, see §5) |
| **Connecting an account is a small delightful act; see where accounts live** | One tap through `oo` or OpenConnector/MCP (`roadmap.md`); the accounts card (D166) built; its clay mailbox art and app tiles owed ("Trigger: met", `todo.md` §Your accounts) | The open agent app: a setup card in place, the pending call continues when ready; a plugin can ask the app to draw a form (VERIFIED) | **The art the motivation names is owed**; a missing account mid-task is not resumed in place (INFERRED from `todo.md`) |
| **Runs anywhere; use what you have** (Macs, Linux, edge) | Mac home, Linux server (systemd, Tailscale, own Cloudflare tunnel D228), workers (D155) | The open agent app: "your computer becomes your server", copy a task to another computer, a migration assistant (VERIFIED) | **`ducter move` unbuilt** (`todo.md` 907, the author's own Mac → server case of 11-10, `roadmap.md` Next); a server home can't yet use the Mac's browser and sign-ins as its own (D155 half, `worker-browser` check unrun) |
| **No lock-in: any subscription, harness, model** | Partner on Claude Code, Codex, pi or DeepSeek Harness (`core/src/brain.ts` `effectiveBrain`); free key route (D440, D449) | — | **Proven on Claude (haiku) only.** Codex last measured before D477–D499; pi and DeepSeek Harness last 2026-11-10 on a 15 k-char persona (`results/2026-11-10-*`), now 31 k; no free model ever |
| **The adapter: an endless session, threads that fold, expire-aware resume, answer first** | Digest, window, recall (D123); Slack-thread projection; answer first (B1); principle 4's resume is "a heuristic (55 min, 120K); the cost model is not" | Keep-warm for subscription caches; a record of what the session saw (research/210) | The cost model and a **long-conversation replay on real models** are owed (`roadmap.md` Real-world checks) |
| **Long loops and waits in code or plain words** | `until`, `wait_until`, routines, rounds (B7–B9, D427, D483, D496) | Goal mode; usage-limit auto-continue (VERIFIED) | **Level in design**; `loops` and `limit-hit` checks unrun |
| **Plugins and apps wired into every harness** | The person's skills and MCP inherited (principle 17); Mem plugin per agent (K7, D466) | ~30 official plugins, a market, MCP Apps host (VERIFIED) | Breadth behind, deliberately (research/201 §4) |
| **An interface nothing like a "powerful AI" tool** | Clay partner, messaging-style thread, three zoom levels, rich answers (D303), several partners each its own clay (D497) | Polish at high velocity (410 commits in three days, VERIFIED) | **Ahead in character**; reviewed by the author piecemeal, the Build state's "prototypes reviewed" still open |
| **Your own apps, as if by magic** | Small apps from one sentence (D405), the home of apps (D410), routine-filled apps (D407) | The spaces agent's topic pages kept current from apps (DOCUMENTED) | **Level in design, unproven live** |
| **Floating window for heavy users** | The mini window (D438) | — | Level |
| **Everywhere: web, native phone, desktop; setup with no concepts** | Mac app (signed), web, iPhone on TestFlight, Android APK without a release key; D440's first answer with no plan unwalked on a bare Mac | Mac, Windows, Linux, iOS and Android in stores; a hosted model with free credit (VERIFIED) | **Behind on reach**: no store app, no Windows, the fresh user's door unwalked |
| **Memory and identity decoupled (Mem)** | Mem across tools, the person's core memory in every session (D487), grounded writes (D490), Mem's review queue on the Memory page (D465) | Per-product memory with a nightly tidy (VERIFIED) | **Ahead**; Bridge live trial still incomplete (`roadmap.md`) |
| **A person can have more than one partner** | Out of preview (D486, D497) | Companions with a main computer (VERIFIED) | Level |

## 2. The north star (D36), quality by quality

| Quality | Where Ducter is strong (VERIFIED) | Where it is thin | Felt by whom |
|---|---|---|---|
| **好用 easy** | One partner, plain words, glossary-checked copy; a feature's first meeting in one line (D451) | The first hour for a fresh user is unwalked on a bare Mac (`first-answer` check unrun); no store app | Fresh user |
| **顺滑 smooth** | Answers first, work in parallel; self-repair (D473); waits that can come true (D483) | A limit is still a wait or a hand-over to another agent, never the same model through another account; Codex not re-measured since the persona changed | Heavy developer; consumer on a ChatGPT plan |
| **赏心悦目 delightful to look at** | Clay character, On hand and Settings redone by hand at the author's bar (D498, D500) | The account mailboxes and app tiles the motivation asks for (D166 art) | Consumer |
| **放心 trustworthy** | The D61 floor in code, undo on sends, Done for you, credentials by reference, a second look before results go out (D437) | **Every one of the 11 owed live checks is unrun**: the floor is proven on fakes and on a fixture shop | All three |
| **惊喜 pleasantly surprising** | Offers from accounts, tasks, Mem and the conversation (D453, D458) | Hand-written detectors catch the motivation's stories only in one shape each; the offers funnel since D453 has never been read live | Consumer, the author |

## 3. What the references did since research/201 (concepts; INFERRED where noted)

- **The open agent app (VERIFIED, 410 non-merge commits since 11-22 00:00 +0800):** three account
  pickers for one model (use up then switch, most left first, by weight) with weekday exceptions, and
  scheduled work that falls over between them; several accounts per engine provider; each engine's
  quota in the menu bar, widgets and model pickers; a plugin may ask the app to draw a form and gets the
  values back; automations a companion set up send their results back to the chat; agents and
  companions may snooze and wake tasks; a quiet companion's memory and skills reviewed; a mail card
  that reads, edits and sends a draft with a 10 s cancellable countdown (rules dated 10-18 to 10-28);
  a cloud host for members.
- **The consumer agents (DOCUMENTED):** no launch or update found after 11-06 (searches on this day);
  research/201 §1.2 stands.
- **Read (INFERRED):** the open agent app keeps converging on Ducter's model (results back to the
  conversation, agents that manage tasks), and keeps pulling ahead on the heavy user's subscription
  economics and on reach. Nobody open reads the person's accounts for them. The gap that matters
  most is still proof, then the motivation's own aha in its general form.

## 4. The next ten, ranked

Score as in research/201: impact (1–5) × reach (users, 1–3) × cost (3 = a branch with fakes or a
read-only run the lead can do, 2 = a real device or account of the author's, 1 = gated on others).
**FP** = can be decided from first principles; **Author** = needs the author's decision or presence.

| # | What | I | R | C | Score | Size | Call |
|---|---|---|---|---|---|---|---|
| 1 | The automatic live checks, run on hel | 4 | 3 | 3 | 36 | S | FP |
| 2 | The aha in its general form: cross-source finds judged by the model | 5 | 2 | 3 | 30 | M | FP (shadow); Author (labelled week) |
| 3 | The partner measured on every agent people have, every release | 4 | 3 | 3 | 36 | S–M | FP |
| 4 | The errand's live proof on one real shop | 5 | 3 | 2 | 30 | M | Author (once) |
| 5 | Same model, another door: a quiet pool and a reserve for the partner | 4 | 1 | 3 | 12 | M | FP |
| 6 | `ducter move`: the home moves between computers | 4 | 2 | 2 | 16 | L | FP design; Author for the run |
| 7 | A server home uses the Mac's browser and sign-ins | 4 | 2 | 2 | 16 | M–L | FP |
| 8 | A first hour walked on a bare Mac, and the stores | 5 | 2 | 1 | 10 | M | Author |
| 9 | Talk on a real microphone | 3 | 2 | 2 | 12 | S | Author |
| 10 | Accounts as places: the mailbox art and a setup that resumes in place | 3 | 2 | 2 | 12 | M | FP (flow); Author (art review) |

#3 is ranked under #1 and #2 because the release-gate half depends on nothing, but its meaning
depends on the persona settling; #5 is ranked above its score because it is the motivation's first
reason ("orchestrate subscriptions and models … side by side") and the reference just built it.

### 1 · The automatic live checks, run on hel (FP, S)
- **Who:** all three, through the author's evidence. **Feel:** 放心 by proof, not by fakes. Before,
  11 checks exist and none ran (`todo.md` has no "Seen live:" line); after, five rows close without
  the author lifting a finger.
- **Depends on:** read access to hel (the lead already reads its Log, research/205, 217). No Mem
  writes: `mem-shapes` uses nmem's read verbs only.
- **First slice.** On hel, run the five checks that need no person (`loops`, `limit-hit`,
  `offers-week`, `mem-shapes`, `add-folder`; `build-and-run.md` §"Live checks"), each read only by
  construction. Paste `ducter check report`'s lines under their items in `todo.md`, and treat any
  `fail` as the next day's first fix. `offers-week` gives research/197's funnel again after
  D453/D458: offers a morning, taken up, by kind. If a check refuses on hel (a path, a version), the
  check is the bug: fix it so the author's later run works. Repeat every release on hel (add it to
  the release runbook as a line, not a gate).

### 2 · The aha in its general form (FP for the shadow; Author for the labelled week, M)
- **Who:** the consumer and the author (the motivation's two stories); the fresh user later.
  **Feel:** 惊喜, the "how did it know" moment, for the shapes nobody wrote a detector for.
- **Why now.** `detect.ts` holds one hand-written test per story (`mismatches()`: a flight landing
  after 18:00 and a hotel starting the next day). Principle 21 says meaning is the model's and code
  guards invariants. The ledger already holds typed facts (165 on hel by 11-21: bookings, renewals,
  payments, changes, research/197 §2), so the model can be asked the general question cheaply:
  *which of these facts contradict or endanger each other, and what would the person lose?*
- **First slice.** A `coherence` pass beside the detectors, in shadow: once a day, the cheap model
  sees the ledger's open facts (type, dates, places, names, amounts; never bodies) and returns
  structured pairs `{facts, conflict, costIfMissed, by}`; code dedups against the detectors' keys,
  applies the existing caps and bars, and records each as a `shadow` find in the Log with no message.
  An eval of 20 fixtures: the motivation's two stories, their variants (wrong day, wrong city, two
  bookings for one night, a renewal whose card expired, a passport against a trip), and 10 innocent
  ledgers. After a week, `proactive week` compares shadow against said finds by kind; the author's
  labelled week (already the trigger in `todo.md`) decides whether shadow becomes said and which
  detectors retire. **Depends on:** nothing upstream; the labelled week is the author's.

### 3 · The partner measured on every agent people have (FP, S–M)
- **Who:** the consumer on a ChatGPT plan (D298), the developer on fallback (D435), the person with
  only a free key (D440). **Feel:** 顺滑, the same partner whatever it runs on.
- **First slice.** Run `eval:partner` once on Codex at the current persona (281 scenarios), and a
  smoke subset on pi and DeepSeek Harness (their last runs were 2026-11-10 on half today's persona).
  Then make the release note carry the newest Codex and haiku lines side by side (the results files
  exist; only the habit is missing), and keep D462's rule: where Codex misses a promise, code says
  it. A free model waits on #8's key. **Depends on:** Codex signed in here (it was for D462).

### 4 · The errand's live proof on one real shop (Author, once; M)
- Unchanged from research/201 #2 and `todo.md` §"An errand to the checkout". The kit is ready
  (`errand-checkout`, `pay-words`). **First slice:** the author's next real purchase on the phone
  through the live view, read-only up to the pay page; `pay-words` over five saved checkout pages
  first, which needs no purchase and can run on pages the author saves in five minutes.

### 5 · Same model, another door (FP, M)
- **Who:** the heavy developer with two Claude accounts, or Claude by plan and by key, or a worker
  signed in elsewhere. **Feel:** 顺滑, a limit becomes a non-event; the partner never starves
  because tasks spent its quota.
- **First slice.** When a task or the partner hits a limit and the same model is reachable another
  way (another account of the same agent, the same agent on another computer, a key), take it, the one
  whose reset comes soonest first, said once in the task's line; a reserve: tasks stop at 85 % of the
  account the partner thinks with when another door exists. No groups to configure, no pickers
  (the reference's automatic group is the right default; its weights and weekday rules are not).
  Fakes: the existing `agent-limits.ts` and `account-usage.ts` shapes. **Depends on:** how each
  agent signs in a second account on one computer (a research note first: Claude Code's
  `CLAUDE_CONFIG_DIR`, Codex's `CODEX_HOME`, INFERRED).

### 6 · `ducter move` (FP design; Author for the run; L)
- **Who:** the Mac-first user who outgrows the laptop; the author's own Mac → server case (the
  motivation's "my cloud environment had to move within days"). **Feel:** 放心, nothing lost, and
  惊喜 that it was one code.
- **First slice.** The design note and Dn first (what moves: Log, persona, settings, rules,
  routines, connections, Mem binding; what doesn't: agent sign-ins), then the read half alone:
  `ducter move --plan` on the old home prints what would move, its size and what must be redone on
  the new one, with a verified count. The copy itself comes second. **Depends on:** nothing upstream.

### 7 · A server home uses the Mac's browser and sign-ins (FP, M–L)
- **Who:** the author (hel the home, the MacBook a worker) and every server-mode user. **Feel:**
  好用, "book it in my Chrome" works wherever the home lives.
- **First slice.** `roadmap.md` Next says "research first": the worker's browser places (D376's move
  continued from hel into the Mac's Chrome) made the default placement for a task that needs a
  sign-in only the Mac has, with the `worker-browser` check as its proof. **Depends on:** #1's
  `add-folder` result (a worker awake and reachable).

### 8 · A first hour on a bare Mac, and the stores (Author; M)
- **Who:** the fresh user and the consumer: their only door. **Feel:** 好用 from the first minute.
- **First slice.** The `first-answer` check on a throwaway macOS account with a free key (timed),
  then the stores' gates in order: the iPhone app out of TestFlight review, Android's release key.
  Each needs the author's accounts and money. Nothing else here can be decided without him.

### 9 · Talk on a real microphone (Author; S)
- `talk-mic` per platform: the gaps, the echo guard, talking over it, a card by voice. Two consumer
  agents ship voice and video; Ducter's is designed and fixture-tested only (H2b). Twenty minutes of
  the author's time a platform.

### 10 · Accounts as places (FP flow; Author art review; M)
- **Who:** the consumer and the fresh user. **Feel:** 赏心悦目 and 放心: you see where your mail
  lives and what Ducter may do there, as the motivation asks.
- **First slice.** The D166 mailbox art per source colour (closed, lid up, grey) through the art
  pipeline and D65's comprehension test, and one flow: a task that finds an account missing shows the
  connect step in place and continues the same step when it is ready, without a new turn. **Depends
  on:** art time; the author reviews the art.

**Also seen, not ranked:** principle 4's cost model and a long-conversation replay on real models
(`roadmap.md`); phone calls placed live (B6); iOS Live Activities behind a flag until a real iPhone
checks them (D306); an asks-a-day count beside `offers-week`, so "only when it truly matters" has a
number too (S, FP; folds into #1 if cheap).

## 5. Stale text found while checking (VERIFIED)

- `scenarios.md` G2 says "send undo —", but drafts sent from a find wait `SEND_UNDO_MS` (30 s) with
  撤回 / Undo (`packages/protocol/src/proactive.ts`). Fix in the next change loop that touches G2.
- `AGENTS.md` Build state: "Connectors: live checks per roadmap" and "Nowledge Bridge: the live
  trial" remain open; research/197 shows the accounts engine ran live on hel, so the first is half
  true, and the item should name what is still owed (a labelled week, a Go end to end).

## 6. What not to do next (INFERRED)

- Not another polish round before #1: four Settings rounds and three On hand rounds since
  research/201, against zero live checks.
- Not the reference's breadth (Windows, a plugin market, nested model groups) and never its hosted
  model or cloud account: they contradict "no hosted Ducter".

**Thin evidence, plainly.** hel was not read for this report, so §1's live column rests on
research/197 (11-21) and the hel-originated Dn entries. The reference's commit count measures
activity, not quality; several of its features are rules dated by its owner, not checked here. The
consumer agents are known from coverage only. The proposed 85 % reserve in #5 is a guess to be set by
`limit-hit`'s real numbers.

## Implications for Ducter

Proof is still the gap, and half of it needs no one: run the five automatic checks on hel now and
every release. Then take the motivation's own aha past its two hand-written shapes, in shadow, with a
model asked which facts endanger each other, as principle 21 already demands. Keep the partner
measured on Codex, pi and DeepSeek Harness as the persona changes. With the author: one real
errand, a bare-Mac hour, the stores, a microphone. For the heavy developer, the motivation's first
reason is still half open: several accounts of one model as one quiet pool, and a home that moves.

**Summary:** since research/201, Ducter closed the Codex gap (78 %) and built the proof kit and the
offer counter, then spent three days on the partner's mind and on surfaces; none of the 11 live checks
has run. Against the motivation, Ducter leads on attention design, memory and character, is level on
apps, loops and several partners, and is behind on proof, on the general aha (detectors catch the
motivation's stories in one shape each), on pooling subscriptions, on moving the home, and on reach.
The ranked ten start with what needs no one: the automatic checks on hel, the aha judged by the model
in shadow, and the partner re-measured on every agent.
