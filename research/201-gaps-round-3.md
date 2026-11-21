# 201 · Gaps, round 3: after 0.1.9 (D447–D459), the references refreshed, the next ten

Date: 2026-11-21, on main at `1b95e589` (0.1.9). Follows research/184 and research/194. Read:
`motivation.md`, research/184, research/194 (and their private names), `design/decisions.md`
D446–D459, `design/todo.md`, research/195–199, and the partner eval results in
`packages/partner/eval/results/`. Outside: a fresh read-only clone of the open agent app (its docs
and commit log since research/184's snapshot, never run) and the three consumer agents' own public
pages and press, read on the web this day. Names only in `private/201-gaps-named.md`. hel and the
author's Mac were **not** read; nothing below is new live evidence of Ducter in use.

Tags: **VERIFIED** = read in Ducter's code, docs or eval results at this commit, or in the open
agent app's repo at its head; **DOCUMENTED** = a product's own public page or launch press;
**INFERRED** = judgment. Kinds as before: "the open agent app" (desktop + phone GUI over Claude Code,
Codex and pi); "the inbox-reading consumer agent", "the spaces consumer agent", "the bot-style agent
app" (the three consumer products the motivation names).

## 0. Where research/194's ten stand (VERIFIED, by Dn)

| 194 # | Now | Proof |
|---|---|---|
| ★1 a free key paced, its reset said truly | D449 | fakes (the providers' own 429 bodies, a fake clock); no real key |
| ★2 the partner eval on the partners people get | **half**: Codex run once (§2.1); no free model | `results/2026-11-21-codex-gpt-6-luna-codex-d453.md` |
| ★3 the seams closed | D450 | fakes |
| 8 a feature's first meeting | D451 | fakes, demo cores |
| 4 errand live, 5 live-proof lane, 7 a bare-Mac walk, 9 talk on a real mic, 10 stores | **not started** (each waits on the author) | — |
| 6 one aha on a real life, measured | **re-based**: hel read once (research/197: 17 finds, 2 taken up), then D453 (offers) and D458 (wider leads) rebuilt the funnel; the new funnel is unmeasured live | offers eval on haiku only |

Also shipped since: D447 and D452 (iOS Simulator pass, text size), D448 (pi/Antigravity tasks talk
to other agents through Ducter), D454 (finished cards removable, finder honest), D455 (a folder on
any computer), D456–D457 (⌘K forgives, a compact opened task), D459 (Settings › Memory and Agent
messaging as one story). Every one says "fakes and demo cores only".

## 1. The references, refreshed

### 1.1 The open agent app since research/184's snapshot (VERIFIED in its repo)

236 commits in ~24 hours (155 not merges, 15 authors; 719 files, +41.7k lines), against Ducter's 42
non-merge commits in the same window. Almost all are reliability fixes (sign-in recovery, push
registration, a phone-to-computer network layer, MCP session teardown). The product moves:

| What changed | Its rule | Relevance to Ducter |
|---|---|---|
| **Model groups, widened** | The same model reachable two ways (two accounts, two providers, another computer, a shared one) forms an **automatic group** with no setup; picks "the source whose quota expires soonest first"; planned: most-left-first, by weight, **fastest by measured first-token time and speed**, per-folder and per-weekday exceptions, groups of groups, synced across devices; a task opened through a group **falls over by default** when it hits a limit. Most of it is marked "to build", decided by their owner that day | Ducter: a task waits for its reset or is handed to another agent (D297); the partner falls back to another agent (D435). No "same model, another door" and no measured speed. Heavy user only |
| **Tasks report back by default** | Their partner's hand-off template v8: a task opened from the partner sends its result back to that conversation, at once when stuck, failed or needing a decision; the partner checks it against the ask and asks the task to fill gaps. Reason given: results "stopped inside the task and were forgotten" | Ducter's design from day one (a task reports to the partner; D4's evidence check; D437's look). **Ducter ahead**, and the reference converging on it is evidence for it |
| **The partner can use any installed plugin engine's model** | — | Level (Ducter's partner runs on any signed-in agent, D435) |
| **The inbox: done opens the next one** | Finishing the open task moves to the next pending item in display order | Ducter: D454's Remove, D456's ‹ 3 / 9 › and ⌃1–9. Level |
| **Unreachable said as unreachable** | "Can't reach OpenAI" instead of "model list not updated"; the last confirmed models kept through a network blip | Ducter's key check says it (`protocol/src/api-keys.ts`); a mid-day blip for a signed-in agent not checked here. INFERRED level |
| **Memory search benchmarked** | Precision@5 63.5% → 87.0% on synthetic queries over their own docs | Ducter leans on Mem; no comparable retrieval measure of its own. Out of scope (Mem's) |
| Polish: phone wallpapers, the island's default face, the in-window handoff sheet on more iPhones | — | Cosmetic; no gap |

Unchanged and still ahead of Ducter in reach: macOS, Windows, Linux, iOS and Android clients, a
public download page, a free client (research/184 R1–R9 stand).

### 1.2 The three consumer agents (DOCUMENTED, public pages and press, 2026-09 to 11-21)

| | The inbox-reading agent | The spaces agent | The bot-style agent app |
|---|---|---|---|
| Proactive | "Proactive research" in the background with **read-only** tools: can't send, change app content or drive a computer | A space's connected apps update it in the background (dates, prices) "without you having to ask" | "Offers to take on work it notices it can handle"; flags a signed-out account and offers to reconnect; does nothing until yes |
| Control | Rules per action: allow, ask first, block; an automatic review of actions that touch accounts or share; some tasks "always stay with you" | — | Asks before risky actions; notifications per bot; turning off check-ins means contacting support |
| Where it works | Its own cloud computer and browser; may use your laptop; saved passwords used without the model seeing them | Phone, web, Mac app | Its own computers, 24/7; Mac, Windows, Linux, iOS |
| Voice | A voice call | Real-time voice and video (from 11-05) | — |
| Reach | Top paid plans only, eligible markets | Two countries; ~10 M users claimed in under two months | Beta; priced around a top plan (sources disagree) |

What this says (INFERRED): the category has converged on **Ducter's floor** (read-only watching,
offers not actions, rules per action, a review before account-touching steps, credentials by
reference). Ducter is not behind on design; it is behind on **proof** and **reach**. And all three
sit behind an expensive plan or a few countries, so a free key on one's own Mac (D440, D449) is a
real difference for the consumer outside them, not a consolation.

## 2. Ahead, level, behind (by capability and by feel)

### 2.1 New evidence: the partner on Codex (VERIFIED)

The one ★2 run: Codex (gpt-6-luna) **167/241 (69%)** against haiku's **190/241 and 187/241** (D458, same
29.7k-char persona). Where it parts:

| Category | haiku (d458-a) | Codex | Read |
|---|---|---|---|
| errand | 4/4 | **1/4** | at the checkout it asked "要现在付 73 元吗？" and dropped the train and time; an ack twice as long |
| apps | 16/16 | **9/16** | |
| rich (tables, comparisons) | 9/10 | **3/10** | |
| groups / many asks | 2/2, — | **0/2**, 4/5 | three steps not split into a group |
| to-dos | 6/13 | 4/13 | said it *would* post a comment to the issue, with no card (code still holds it behind a Go) |
| bridge | 8/10 | 6/10 | |
| safety | 4/8 | **6/8** | Codex better |
| memory | 17/20 | **19/20** | Codex better |

So the partner a ChatGPT-plan consumer talks to every day (D298), and the developer's fallback
(D435), is measurably worse exactly at the motivation's "wow" (errands, apps) and says things it
won't do. The floor holds in code (pay presses refused, write-backs a card); the **words** don't.

### 2.2 By user

| Capability | Heavy developer | Consumer | Fresh user | Tag |
|---|---|---|---|---|
| Watching accounts, offers not pings (D453, D458) | **ahead**: no open product reads the person's accounts; the consumer agents do, behind a top plan | **ahead in design**, unproven live | ahead in design | VERIFIED / DOCUMENTED |
| Tasks report back, a look before it goes out (D4, D437, D439) | **ahead** (the reference just adopted the first) | ahead | ahead | VERIFIED |
| Errand to the checkout (D436) | level in design (the reference's in-window handoff) | behind in proof: fixture shop only; the inbox-reading agent ships its own browser | same | VERIFIED / DOCUMENTED |
| The partner on the agent people actually have | level on Claude | **behind on Codex** (§2.1); unmeasured on free models | unmeasured on free models | VERIFIED |
| Several subscriptions as one pool | **behind** (no same-model fail-over, no measured speed) | — | — | VERIFIED |
| Voice | level in design (D442) | **behind in proof**: two consumer agents ship real-time voice; Ducter never heard a real mic | same | DOCUMENTED / VERIFIED |
| Own small apps (D405–D431) | level | level; the spaces agent's update from connected apps is close to Ducter's routine-filled apps (D407, D410) | level | DOCUMENTED / INFERRED |
| Day 0 cost and region | level | **ahead** (free key, mainland routes) | ahead in design, **unwalked** (D440) | VERIFIED / DOCUMENTED |
| Platforms, stores | behind (no Windows; iPhone TestFlight; Android no release key) | behind | **behind** | VERIFIED |
| Find, open, continue any task (D391, D456) | level-to-ahead | — | — | VERIFIED |

Feel, per the north star (INFERRED): 赏心悦目 and 好用 are where Ducter leads (character, plain words,
one partner); 放心 is designed but proven on fakes; 惊喜 rests on offers nobody has yet taken up live;
顺滑 holds on Claude and slips on Codex.

## 3. The next ten, ranked

Score as before: impact (1–5) × reach (users, 1–3) × cost (3 = a branch with fakes, 2 = a real
device or account, 1 = gated on others). **★ = needs nothing from the author.**

| # | What | I | R | C | Score | Size | Fakes now |
|---|---|---|---|---|---|---|---|
| **1 ★** | The partner held to the bar on Codex | 4 | 3 | 3 | 36 | M | yes (Codex signed in here) |
| 2 | The errand's live proof on one real site | 5 | 3 | 2 | 30 | M | no |
| **3 ★** | The proof kit: every owed live check one read-only command | 3 | 3 | 3 | 27 | M | yes |
| **4 ★** | The aha counted by Ducter itself | 4 | 2 | 3 | 24 | S | yes |
| 5 | A real D440 walk on a bare Mac | 5 | 2 | 2 | 20 | S | no |
| 6 | A live week of offers on hel (D453 + D458) | 5 | 2 | 2 | 20 | S | no (after #4) |
| 7 | The partner on a free model, then a lighter tool set if needed | 4 | 2 | 2 | 16 | M | no (a free key) |
| 8 | Mem and Bridge read live (D444, D448, D458's Mem leads) | 3 | 2 | 2 | 12 | S | no |
| 9 | Talk on a real microphone | 3 | 2 | 2 | 12 | M | no |
| 10 | Same model, another door (a quiet pool) | 3 | 1 | 3 | 9 | M | yes |

The stores stay gated (184 #10, score 8): without them every day-0 gain still reaches Mac owners only.

### 1 ★ The partner held to the bar on Codex
- **Who:** the consumer on a ChatGPT plan (their everyday partner); the developer when Claude runs
  out (D435). **Feel:** before, the same ask that delights on Claude gets a checkout question it
  must never ask and a promise to post it won't keep; after, 放心 the partner is the partner on any
  agent.
- **Sketch.** Per category in §2.1: where the words carry a promise (the checkout line, "stops at
  payment", a write-back), let code say them, as D449 did for limits; where the model misroutes
  (groups, rich, apps), a per-harness note in the adapter, not a fork of the persona. Then re-run
  Codex twice and haiku twice (D175), target Codex ≥ 85% of haiku per category. **Size** M.
  **Needs:** Codex's subscription here, already used for the 11-21 run.

### 2 The errand's live proof on one real site
As research/194 #4 and `todo.md`: read-only to the pay page, the gate's words on five real
checkouts, a phone paying in the live view. The consumer agents now ship their own browsers
(DOCUMENTED), so this is the gap a consumer would notice first. **Needs** the author once.

### 3 ★ The proof kit
- **Who:** all three, through the author's time. **Feel:** 放心, by evidence, not by fakes.
- **Sketch.** Every owed check in `todo.md` that needs a device or account (the errand, the free
  key's real 429, the bare-Mac walk, a real limit hit, loops on hel, Mem shapes, the mic) becomes one
  command that refuses to write outward, runs read-only, and drops a dated result file the research
  folder can cite. The author's 30 minutes then closes five rows, not one. Built and tested now
  against the same fakes; the runs wait on him. **Size** M.

### 4 ★ The aha counted by Ducter itself
- **Who:** the author first; every person later (their own weights, D453). **Feel:** 惊喜 is the
  motivation's pull and is unmeasured since the funnel changed; after, it has a number each week.
- **Sketch.** `ducter proactive week` (today only `replay` exists, `cli/src/proactive-cmd.ts`):
  from the Log, offers shown, opened, Go, 有用, faded, by kind and by source (accounts, tasks, Mem,
  the conversation), with the one taken up quoted by its title. Read-only, no new surface for the
  person; the research report cites it. **Size** S. **Fakes:** Log fixtures.
- **Built 2026-11-22 (D464):** `ducter proactive week [--weeks N] [--json]`, with `find_opened`
  added to the Log; checked on fake Logs only. The live week is #6.

### 5–9 (need the author)
- **5 bare-Mac walk of D440**: a throwaway account and a free key per route, timed. Two of three
  users' only door.
- **6 a live offers week**: #4's readout over a week on hel; the 1-in-20 bar (D453) checked against
  the real number.
- **7 the partner on a free model**: one free OpenRouter or Gemini key; if a free model misroutes
  like Codex, fewer tools for it (research/189's warning), decided by the eval, not by guess.
- **8 Mem and Bridge live**: every Mem shape D444 and D458 read is inferred from help text; the last
  live Bridge trial failed. Fails open, hence not higher.
- **9 a real microphone**: two consumer agents now ship real-time voice; Ducter's hands-free talk is
  designed and fixture-tested only.

### 10 Same model, another door
- **Who:** the heavy developer with two Claude accounts, or Claude by plan and by key, or a worker
  signed in elsewhere. **Feel:** 顺滑; a limit becomes a non-event. **Sketch.** When a task or the
  partner hits a limit and the same model is reachable another way, take it, the one whose reset
  comes soonest first, said once; no group to configure (the reference's automatic group is the
  right default; its four pickers and nested groups are not). **Fakes:** yes. Low reach, hence last.

## 4. What not to do next (INFERRED)

- Not the reference's breadth (Windows, wallpapers, nested model groups): one team ships 155 commits
  a day there; Ducter wins on attention and the partner, not on surface.
- Not another polish round before #1: the cheapest improvement for the most people is the partner
  on Codex saying only what it will do.

**Thin evidence, plainly.** The Codex result is one run (haiku's two runs differ by 3 points); the
consumer agents are known from their own pages and launch press, never used here; the open agent
app's "to build" rules are intentions; its commit count measures activity, not quality. No hel read.

## Implications for Ducter

Start three now with nothing from the author: bring the partner on Codex to the bar (69% against
79% on haiku, worst on errands, apps and rich answers; let code say the promises); build the proof
kit so the author's next half hour closes five owed checks; and let Ducter count its own offers
weekly. Then with the author: the errand on one real site, a bare-Mac walk, a live offers week, a
free model's eval.

**Summary:** 0.1.9 closed research/194's three ★ items but one: the Codex partner was measured
and found weaker exactly where the motivation's "wow" lives. The references converged on Ducter's
floor (read-only watching, offers, rules, credentials by reference, tasks reporting back); Ducter
leads on design and is behind on proof, platforms and, for the heavy user, pooling several
subscriptions. Proof is the next gap, not features.
