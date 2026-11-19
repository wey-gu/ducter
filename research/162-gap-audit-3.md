# 162 · Gap audit, third round: the motivation's promises after 0.0.89–0.0.93, read against the author's own week

Date: 2026-11-19, on main at `04249066` (0.0.93). Follows research/100 and research/150. This round
does what research/150 could not: it reads the author's real home (hel) read-only
(`file:/root/.ducter/ducter.db?mode=ro`, plus file listings and key names of `~/.ducter/*.json`,
never values), so every gap below starts from something that happened to him in the last three days
(2026-11-16 to 2026-11-19 11:05 UTC). Outside products were re-read from their public repos and
sites (read only, a fresh `git clone --depth 1` of the open-source one at its 2026-11-19 19:01 +0800
head); the comparison notes and names are private (`research/private/162-refs.md`), this report says
only "an open agent app" or "a consumer personal AI".

Tags: **VERIFIED** = read in Ducter's code or docs at this commit, or in hel's Log; **DOCUMENTED** =
an outside product's own docs; **INFERRED** = judgment.

## 0. What hel is and what the author did there (VERIFIED, hel's Log)

- hel runs **0.0.92** (`ducter --version`: `0.0.92 (e35b80f, bun 1.4.4, linux-x64)`), auto-update
  on. So D381–D394 are on hel; **D388, D391, D395, D396 and D398 (0.0.93) are not yet**.
- The Log: 28,438 events since 2026-11-09. In the three days: 38 messages from the author (20 from
  the Mac app, 16 from the phone, 2 through iMessage), 95 partner messages, 15 tasks opened, 29
  decisions he answered, 4,986 account reads by the watch.
- **What he did with Ducter, by volume:** a review routine over the nowledge-co org (`swj3zc4w`,
  10,298 of the three days' events); phone use on his own Pixel Fold, tested five times (11-16,
  11-17); a weekend trip to Beijing (four tasks, 11-18); GitHub to-dos handed over (three, 11-18 and
  11-19); one domain lookup (11-19); one Mem issue hand-off that failed at once (11-19).
- **What failed for him:**
  1. **The trip booking.** He asked it to book flights and hotel up to payment ("可以帮我订好机票和酒店，
     我可以自己接着做付款的步骤", 14:51). The booking task was sent to Claude Code on the MacBook
     (`3e8g6tet`) although at 14:29 he had said "订酒店等生活相关的工作别用 claude code"; the task
     refused and waited. The rule "查机票和酒店 → Codex" was written only at 14:53:45, a second after a
     Go card, 24 minutes after he said it. Then the task lost the browser ("浏览器连接不可用"), the
     partner asked him four times to screenshot or type the Ctrip page back ("我现在连不上你打开的携程页面。
     能…截个图发我吗？"), he asked "你不要每次都开新的 focus window/session", and at 15:59: "FYI 我自己定了".
     Four tasks for one trip; none reached a pay page.
  2. **A hand-off that never started:** "10559 帮我用 codex astra 仔细做一下" opened on a guessed
     `/root/dev/mem` that is not a repo; his next words "什么鬼为什么没做成？…我们 ducter 设计的问题么？"
     (fixed in D395, 0.0.93, not on hel).
  3. **Phone use with a locked phone** (11-17): borrowing pauses on lock and asks again on unlock, by
     design (D331); one task had no phone tools at all (`phone_look` TypeError, fixed in D316). With the phone unlocked it worked: the Beijing weather on his Pixel Fold, done with
     evidence (`rq7a68wa`).
  4. **The review routine said "nothing new" 59 times** (research/158). After 0.0.92 (D394) reached
     hel at ~08:14 UTC 11-19, reports fell to one or two an hour, one drafted review came as one card
     (09:50) and was posted on his Go (10:36). First live evidence that D394 works.
  5. **Discord was never watched:** the watch called `discord.list_mentions`,
     `discord.search_messages` and `discord.list_direct_messages` 684 times on 11-16 and 11-17, every
     one "unknown action" from oo (`packages/core/src/proactive/watch.ts:95` builds the three names
     for every chat service). Nothing told him.
- **What he never touched** (no events, no files): 置顶 / Pin (no `pins.json`), 晚点再问我 / Ask me
  later (the six finds of 11-17 were all Held, none put off), voice, the WeChat channel (configured,
  zero messages), Telegram, Slack, a second partner. Hand-over sheet: once (three to-dos, Go).
- **The look-out-for-you engine, live:** 13 finds since 11-12, every one `waiting_on_you`, **every
  one Held, none acted on** (two of them cold pitches that 0.0.93 now drops); three morning notes
  (0, 5 and 2 finds; "没说的：695 封通知和收据…"). The Saturday trip's date conflict (his calendar said
  Friday 11-20, he said Saturday) was noticed by the hotel task, not by the watch.

## 1. The motivation, promise by promise

Status: **live** = built and seen working on the author's own machines; **built** = built, checked
only with fakes, demos or a scratch home; **partial** = some of the promise built; **missing**.

| Promise (`motivation.md`) | Status | Evidence |
|---|---|---|
| Replace the conductor-style workbench: Codex, Claude Code (and Cursor) side by side, a GUI per conversation, durable sessions, mobile clients, a cloud environment | **live** except Cursor | hel is a server home with the MacBook and haswell doing tasks; a task moved to haswell on his word and built there (11-19 00:27, `job_status`); workbench D214; Cursor is roadmap Later (missing) |
| Take over orchestration, ask only when really needed | **partial, now live-improving** | On hand, defaults, waits (323 waiter events); the review routine's 59 empty reports (research/158) fixed by D394, first good hours on hel 11-19 |
| Dots-style aha from reading Gmail, before you knew | **built, live but not yet worth a tap** | K6–K18; 887 Gmail reads in three days; 13 finds, 0 acted; D388 (the coming-plan aha, 5/5 on the rebuilt week) not on hel |
| Model-agnostic, vendor-neutral; identity in Mem | **live / built** | Codex and Claude Code both used on hel; partner model switch D390 (built); Mem carried to tasks D393 (fakes plus one real Claude Code against a fake Mem) |
| One partner with a persona, renamable; more than one partner | **live / preview** | persona.json on hel; second partner D309 preview, unused |
| Runs anywhere: cloud or own machines | **live** | hel + MacBook + haswell, `device_update` 0.0.91 → 0.0.92 on all three |
| Work handed to a task; the partner chooses harness and model carefully | **partial** | D157 places, rules (`rules.json` has one); but a spoken preference took 24 min and a Go to become a rule and the next task broke it; a guessed repo path (D395 fix, not live) |
| Zoom into any task, take control in a real GUI | **built** | workbench D214, ⌘K Find anything D391 (0.0.93, not live) |
| Act in the world: browser | **live** for public pages; **partial** for the person's own signed-in browser | the domain lookup in hel's browser, done with RDAP and the registrar (11-19); the Ctrip session on the MacBook lost mid-task (11-18) |
| Act in the world: computer use | **built** | D235; `computer-use.md` §9: never a real task in a real app on his Mac |
| Act in the world: phone use (physical, virtual) | **live** (own phone, unlocked) / **built** (Ducter's own phone) | `rq7a68wa` done on his Pixel Fold; lock pauses by design (D331) |
| Act in the world: phone calls | **partial** | Tuwa connected; one test call 11-11, final state `uncertain`; B6 checked against a fake Tuwa |
| Credentials kept securely | **built** | Autofill D191 (fakes); sign-in by the person in the window (G4 live, 11-18 Ctrip login) |
| Watches accounts quietly and cheaply; a handful a day, batched, held overnight | **live** | morning notes on hel; 245 notices skipped today; one silent hole: Discord never read (684 unknown actions) |
| Each find with what, how it knows, a one-tap next step | **partial** | "how" lines present; the next step is "拟个回复", which opens work instead of showing a ready draft; none taken |
| Reading and drafting fine; outward waits for you | **live** | the review posted only after Go (11-19 10:36); GitHub comment trust offered and taken (11-19 00:18) |
| The next step as real everyday work (add the hotel night, open the renewal page so I only pay, fill the school form, move a booking) | **partial, failed in his one real try** | the trip, §0 (1) |
| Connecting an account is a small delightful act; see where accounts live | **live** | OOMOL, Tuwa connected; Accounts as character sheets (K9) |
| No lock-in | **live** | harness/model per task, rules by kind |
| The partner's loop is an off-the-shelf harness with Ducter's adapter (endless session, Slack-thread context, cache restart, answer first, long loops and waits, plugins wired) | **live** | ten days of one conversation on hel; digest `spine`; ack-then-work (D120); waits; Mem's plugin carried (D393) |
| An interface nothing like a "powerful AI" tool; sit in on a phone call; generative UI | **partial** | messaging-style conversation live; listening in on a call: not found; generative UI: rich blocks D303 only |
| Your own small apps (code or generative UI, agentic inside) | **missing** beyond pins | D303 blocks, D381 pins (never used on hel); roadmap Later |
| A conductor-style view for heavy users; the partner in a floating window | **partial** | On hand + opened task; a floating partner window: not found in decisions or todo (INFERRED missing) |
| Everywhere: web, native mobile, desktop; adding a machine extremely smooth | **partial** | Mac app (signed), web, iPhone TestFlight public beta, Android APK without release key or store; adding the MacBook and haswell worked for him |
| Use what you have: Macs, Linux servers, Mem, Cloudflare Workers and R2 | **partial** | Macs, Linux, Mem live; Cloudflare tunnel `ducter anywhere` built; R2 only named in `context.md`/`system.md` |

## 2. How this round was ranked

Each gap scores **pain** (did the author feel it this week, 1–5), **breadth** (how many of the three
users meet it: heavy developer, consumer personal-AI user, fresh user; 1–3) and **feasibility now**
(1–3: 3 = a branch, no one else needed; 1 = gated on accounts, devices, a store or Mem's team).
Rank = pain × breadth × feasibility, ties broken by the motivation's weight.

## 3. The eight

| # | Gap | Pain | Breadth | Feasible | Score | Size | Depends on |
|---|---|---|---|---|---|---|---|
| 1 | What he says about how to work doesn't take hold at once, and the first try starts wrong | 5 | 3 | 3 | 45 | S–M | none (D395 already built; deploy) |
| 2 | An errand never reaches the last step in his own signed-in browser | 5 | 3 | 2 | 30 | L | his MacBook and a real site; Claude in Chrome / Codex Computer Use connected |
| 3 | The finds aren't worth a tap yet | 4 | 2 | 3 | 24 | M | hel on 0.0.93; his real mail (read only) |
| 4 | A connected account that silently reads nothing | 3 | 2 | 3 | 18 | S | oo's action catalog |
| 5 | Nothing he makes with it stays as his own small app | 2 | 3 | 2 | 12 | L | none |
| 6 | Limits and quota: built on fakes, never met a real limit | 2 | 2 | 2 | 8 | M | a real limit hit on his accounts |
| 7 | The phone apps aren't in the stores | 1 | 3 | 1 | 3 | S builders, gated | Android release key and verification; App Store review |
| 8 | No hands-free conversation, no sitting in on a call | 1 | 2 | 1 | 2 | L | a real microphone, a phone number, cost |

### 1. What he says about how to work doesn't take hold at once, and the first try starts wrong

- **Evidence (VERIFIED, hel).** 14:29 "订酒店等生活相关的工作别用 claude code"; 14:52 the booking task
  opened on Claude Code (opus) on the MacBook, whose agent refused and waited (`3e8g6tet` report
  14:52); the rule `查机票和酒店 → Codex` was written at 14:53:45 after a Go card "以后查机票和酒店，默认用
  Codex 吗？". 15:17 "你不要每次都开新的 focus window/session" after four tasks for one trip. 11-19
  05:19 "10559 帮我用 codex astra 仔细做一下" opened on a guessed path and failed at once; "什么鬼".
  The auto-memory rule "spoken preferences become rules at once" (Continuity first) was not met.
- **The moment.** He says a preference or a target once, in passing, and expects the very next
  thing to honour it. Every user meets this; the fresh user meets it as "it didn't listen".
- **Done looks like.** A preference said in the conversation is applied to the task it is about to
  open in the same turn (and recorded as a rule, with the card only as a confirmation after, never
  as the gate); a follow-up on the same errand continues the same task (D373/D391) unless he asks
  otherwise; a hand-off checks the repo and the computer before the task exists (D395, deploy and
  watch one real take on hel). An eval scenario replays 14:29 → 14:52 exactly.
- **Size.** S–M (partner persona and `task_open` path; eval run per D175). **Depends on** nothing
  outside.

### 2. An errand never reaches the last step in his own signed-in browser

- **Evidence (VERIFIED, hel).** `b2m7yz6m` on the MacBook: "Claude-in-Chrome not connected; Ducter
  browser refused existing-profile attach", fell back to an isolated Chromium not signed in, then
  his Chrome after he logged in; it compared the two hotels (477 vs 440 yuan). `3e8g6tet`: "目前无法安全锁
  定现有携程标签：浏览器连接不可用"; the partner asked him for screenshots four times; he booked himself.
  `computer-use.md` §9 "Watching it live … a worker Mac the person isn't sitting at" is Next;
  roadmap Next "browser and computer use on that worker are still the home's only". The motivation's
  own examples ("opening the renewal page so I only have to pay … moving a booking") are this.
- **The moment.** Evening, on the phone: "就订这个，我来付款". The consumer's whole reason to try
  Ducter; the heavy developer's errands; the fresh user's first "wow".
- **Outside lesson (DOCUMENTED, private notes).** An open agent app hands a sign-in or a secret to
  the owner *in the window itself*: a bar over the page's field, "open the sign-in window" on the
  computer, "open remote desktop" (a single-window live picture) on the phone; the agent never sees
  the value and carries on in the same window. It also covers the computer with a privacy screen so
  the agent can keep using it while the owner is away.
- **Done looks like.** One task for the whole errand, on the computer where the site is signed in,
  in one window it opened and keeps; the browser connection checked before it starts (D130's probe)
  and re-attached, never "connection unavailable" mid-errand; when it needs him (sign in, choose a
  seat), the card opens that very window live on his phone or Mac (the D190 live view, extended to a
  worker Mac's own Chrome); it stops on the pay page with a card **去付款 / Go to payment** that opens
  that page where he is. Proven on one real site end to end.
- **Size.** L. **Depends on** his MacBook with Claude in Chrome connected or Codex Computer Use, a
  real booking site (reads and a final page only; he pays).

### 3. The finds aren't worth a tap yet

- **Evidence (VERIFIED, hel).** 13 finds since 11-12, all "X 天前问你…，还没回", all Held; the go label
  "拟个回复" opens a task to draft rather than showing the draft; the Saturday trip conflict was found
  by a task, not by the watch. D388 (research/154: the coming plan, sources side by side, the
  question answered once; rebuilt week 2/5 → 5/5) and the cold-pitch filter are in 0.0.93, not on hel.
- **The moment.** The consumer and the author both, every morning: one find he would have missed,
  with the next step already done to the point of a tap.
- **Outside lesson (DOCUMENTED, private notes).** An open agent app's mail card shows the drafted
  reply in place, editable, and sends it behind a short countdown that can be undone; one card per
  mail, only the latest version shown.
- **Done looks like.** On hel, three days after 0.0.93: at least one find taken (Go) or found useful,
  the trip-like plan conflict said by the watch; a reply find carries its draft already written (a
  read, not a send) so Go means "send this", behind the same outward Go.
- **Size.** M. **Depends on** hel updating to 0.0.93 (auto), his real mail (read only).

### 4. A connected account that silently reads nothing

- **Evidence (VERIFIED).** 684 failed watch calls on 11-16 and 11-17, every one "unknown action:
  discord.*"; `watch.ts:95` builds `list_mentions`, `search_messages`, `list_direct_messages` for every
  chat service. No line anywhere told him; the morning note counted only what was read.
- **The moment.** "放心": he connects Discord expecting it to be watched; it isn't, and he trusts the
  silence. Silence-means-success only holds if a broken watch is never silent.
- **Done looks like.** The watch takes action names from oo's own catalog per connection (or a
  checked table), stops calling what doesn't exist after the first refusal, and Accounts says once,
  on that account's tile, "Discord: 还读不了私信和提及" in words; the morning note's "what I looked at"
  never counts an account it couldn't read.
- **Size.** S. **Depends on** oo's action list for Discord.

### 5. Nothing he makes with it stays as his own small app

- **Evidence.** Motivation "You can make your own apps"; roadmap Later; pins (D381) never used on hel
  (no `pins.json`); research/150 #1. A consumer personal AI keeps "Spaces" the assistant builds
  (DOCUMENTED, the author's account); an open agent app hosts other people's MCP apps, not ones it
  makes for you (DOCUMENTED).
- **The moment.** The trip's cost summary, the review queue, the packing list: made once, wanted again,
  live.
- **Done looks like.** A pinned block that the partner keeps current is used on hel for a week; then a
  first "page it built for you" (a small HTML page in Made for you, D383, with live data from a
  routine). Not before #1–#3.
- **Size.** L.

### 6. Limits and quota: built on fakes, never met a real limit

- **Evidence.** D297 (continue at the reset, or hand to the other agent) and roadmap Next "Quota
  awareness" built with fakes; `todo.md` "Prove it on a real limit hit … The partner's own harness
  hitting its limit (the partner is not a task: no wait today)". An open agent app pools several
  subscription accounts and auto-continues at the reset (DOCUMENTED). No limit event on hel this week.
- **The moment.** The heavy developer's review routine and nightly builds hitting the five-hour window.
- **Done looks like.** One real limit hit on hel watched end to end (the task waits and resumes or
  moves); the partner's own limit has a plan.
- **Size.** M. **Depends on** a real limit.

### 7. The phone apps aren't in the stores

- Unchanged from research/150 #5 (VERIFIED: roadmap Next). Low pain for the author (TestFlight and the
  APK work for him), but the first wall for every fresh user. Gated: Android release key, developer
  verification, App Store review.

### 8. No hands-free conversation, no sitting in on a call

- Unchanged from research/150 #7; plus the one live call (11-11) ended `uncertain`. An open agent app
  ships a voice call mode with barge-in (DOCUMENTED). Gated on a real microphone and a number; cost.

## 4. Five live checks for today (read only, or cheap; nothing written to his accounts)

1. **D394 on hel, the next 24 hours** (already started here): from the Log, rounds per hour of
   `swj3zc4w`, waiter arms per round (must be one), quiet rounds with no partner message, drafts asked
   once per round. Today so far: reports 3–7/h before 08:14 UTC, 1–2/h after; one draft card 09:50,
   posted on Go 10:36. SQL only.
2. **D388 after hel reaches 0.0.93:** `ssh hel ducter proactive replay --days 3` (nothing sent or
   changed; one model run): does it say the AGI Bar Friday/Saturday conflict and the provider's 95%
   quota mail, with sources, and drop the cold pitches? Compare with research/154's week.
3. **The MacBook's own browser for #2:** on the MacBook, D130's probe without a model
   (`claude --claude-in-chrome-mcp` → `list_connected_browsers`, ~2 s) and `ducter browser check
   --json` (Ducter's browser, example.com in its own tab); plus `ducter devices --json` on hel for each
   computer's 上网 / 用电脑 abilities. Says whether 11-18's loss was a connection never made or one lost.
4. **Discord's real actions for #4:** on hel, list the oo Discord connection's actions (a catalog
   read, no message read or sent) and compare with `watch.ts:95`; then the Log for any other
   service's "unknown action" since 11-10.
5. **D395 on hel after 0.0.93:** the next real to-do he hands over, read from the Log: the `clones`
   answer from the MacBook and haswell, the computer chosen, and no `cant_start`. If none comes in a
   day, ask the partner on hel (a read, no task) "nowledge-co/mem 在哪台电脑上有？" and read its answer.

## Implications for Ducter

Build #1 now: a spoken preference binds the next task in the same turn, and one errand stays one
task; it is small, all three users meet it, and the author hit it twice in two days. Then #2, the
errand that stops at the pay page in his own signed-in browser, which is the motivation's own story
and his one real try of it failed; design it with the in-window handoff and a worker Mac's live
view. Deploy-and-measure #3 on hel with 0.0.93 and add ready drafts to reply finds. Fix #4 in a day.
Keep #5–#8 in `todo.md` with their triggers. Run the five checks before calling 0.0.89–0.0.93 verified.

**Summary:** the author's real week on hel shows Ducter working as a conductor (server home, workers,
task moves, a routine that now behaves) and as a phone-and-browser helper for public pages, but the
promises that make a personal AI feel like a partner failed when he leaned on them: a preference he
said was ignored by the next task, a trip errand lost the browser and he booked it himself, every one
of 13 finds was held, and Discord was never read without a word. Ranked by his pain, breadth and
feasibility: preferences that bind at once, an errand to the pay page in his own browser, finds worth
a tap, an honest watch; then own small apps, real limits, the stores and voice.
