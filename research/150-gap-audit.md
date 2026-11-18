# 150 · Gap audit, second round: what still stands between Ducter and "can't put it down"

Date: 2026-11-19, on main at `5c87792` (0.0.86). A read of what Ducter ships today
(`design/scenarios.md`, `design/roadmap.md`, `design/todo.md`, `design/decisions.md` D300–D380,
`docs/`) against `motivation.md`'s promise for the three users, and against what comparable
open-source and consumer personal-AI products did in the last days (their public repos and sites,
read only; the comparison notes are private and name them, this report does not). It follows
research/100, the first round, whose ten gaps are checked first.

Tags: **VERIFIED** = read in Ducter's docs or code at this commit; **DOCUMENTED** = an outside
product's own docs; **INFERRED** = judgment. The author's home (hel) was not reachable from this
machine for read-only evidence this time (ssh timed out at authentication), so nothing below is
read from the real Log.

## 1. The first round, closed or not

| research/100 gap | Now | Tag |
|---|---|---|
| 1 First words are an empty state | Closed: D298 first words from the home, offers from the person's own agents' records, Mem's line (D329) | VERIFIED |
| 2 No way in without a plan | Closed: a pasted key in Settings › Partner and Devices (D298, D307); pi without node still opens a Terminal installer (todo) | VERIFIED |
| 3 A usage limit stops a task | Closed in code (D297: continue at the reset, or hand to another agent); no real limit hit yet | VERIFIED (fakes) |
| 4 Earlier sessions don't come along | Closed: D299 also on this computer, D376 from a terminal, D377 on a computer for tasks | VERIFIED |
| 5 Answers are text only | First step closed: D303 table, chart, checklist, choices; **nothing a reply makes stays** (this report's #1) | VERIFIED |
| 6 No voice | First slice: D305 hold to talk and read aloud, never with a real microphone; a hands-free conversation is Later | VERIFIED (fakes) |
| 7 No chat window for China | Closed in code: D301 the person's own WeChat ClawBot, with a fake iLink | VERIFIED (fakes) |
| 8 No record of what Ducter did | Closed: D300 Done for you | VERIFIED |
| 9 Presence ends at the menu bar | Closed in code: D306 Lock Screen and notification shade, fake APNs | VERIFIED (fakes) |
| 10 Recent work unproven live | Narrowed: live walks research/108, 109, 110, 124, 127, 137, 140; still open for real accounts, real phones, real microphones | VERIFIED |

The first round was about the first hour and about parity. What is left is mostly about the
second week: whether Ducter becomes the thing a person opens every day because something of theirs
lives there, and whether the one promise only Ducter makes (it reads your life and tells you the
one thing in time) has met a real life.

## 2. How the second round was ranked

Each gap gets three numbers:
- **Value (V, 1–5):** to `motivation.md` and to the author's bar for this round: people can't put it
  down (爱不释手), it carries feeling (情绪价值), it is easy, smooth and graceful. A 5 is a promise in
  the motivation's "Imagine Ducter" list with nothing built for it, or the motivation's own story.
- **Effort (E, 1–5):** to close it on Ducter's side. **Gated** means only the author can close it
  (his accounts, devices, store keys); the builders' part is smaller.
- **Risk (R, 1–3):** of getting it wrong: a new object or word, the partner's behaviour, privacy,
  a new ping that breaks "silence means success".

Ranked by value first; within equal value, buildable before gated, then less effort, then less risk.

## 3. The ten

| # | Gap | V | E | R | Who feels it most |
|---|---|---|---|---|---|
| 1 | Nothing a reply makes stays, or stays current | 5 | 3 | 2 | the consumer; the heavy developer; the fresh user |
| 2 | The look-out-for-you engine has never met a real inbox | 5 | 2, gated | 2 | the consumer; the author |
| 3 | What needs you can't be put off to a time | 4 | 2 | 1 | the heavy developer; the consumer on the move |
| 4 | Recent surfaces haven't met real devices and accounts | 4 | 2, gated | 1 | every first install |
| 5 | The phone apps aren't in the stores | 4 | 2, gated | 1 | the fresh user and the consumer |
| 6 | A server home can't use the Mac's own sign-ins and apps | 4 | 4 | 2 | the heavy developer with a server home |
| 7 | No hands-free conversation | 4 | 4 | 3 | the consumer |
| 8 | A feature's first meeting is uneven | 3 | 2 | 2 | the fresh user |
| 9 | What it made is found only through its task | 3 | 3 | 2 | the consumer; the developer weeks later |
| 10 | Moving your Ducter between computers | 3 | 4 | 3 | the Mac-first user who outgrows the Mac |

### 1. Nothing a reply makes stays, or stays current

- **The moment.** The partner made a packing list for the trip on Saturday; on Tuesday the person
  wants it again. It is somewhere up the conversation. They tick two things on the phone in the
  taxi and the Mac shows them unticked. They say "add the charger" and get a whole new list under
  the old one, and now there are two. The heavy developer's "release checklist" and "the four PRs
  waiting for review" table go the same way: made once, scrolled away, remade.
- **Evidence.** `motivation.md` "You can make your own apps: small GUI apps built from code or
  generative UI" and its origin story; `roadmap.md` Later "Your own small apps … the first small
  step, tables, charts, lists and choices in a reply, is built: D303"; `todo.md` Rich answers
  "Ticks across devices: a list ticked on the phone shows unticked on the Mac"; `apps/web/src/rich.tsx`
  keeps ticks in `localStorage` per message, the Mac in its own local store (`views/rich.go`
  `a.Local.Ticks`); `flows/I-results.md` Rule 4's `app` kind "later". VERIFIED.
- **爱不释手 would look like.** One tap on a list, table or chart puts it at the top of the
  conversation, the way a chat app pins a message. It is the same on every device, ticks included.
  "Add the charger" changes that same list in place, and the strip at the top settles with the new
  line. Next week it is still there, still current, and the partner knows what is ticked when asked
  "what's left?". It is the first thing in Ducter that is *theirs* and lives on: the smallest true
  version of "your own small apps", with no app to learn.
- **Outside lesson (no names).** A chat app's pinned message, which a bot may edit in place, is
  already how people keep a living dashboard in a chat; open personal-AI apps draw rich blocks per
  message but keep none (INFERRED from their rules, private notes).

### 2. The look-out-for-you engine has never met a real inbox

- **The moment.** The first week after connecting Gmail: the motivation's own story (a domain
  about to lapse, a flight that didn't match the hotel).
- **Evidence.** `scenarios.md` K6–K16 "built with fakes" (days replayed 7/7 and 8/8 on
  synthetic mail); `todo.md` "D298 live: a real first install …"; no research report reads a real
  mailbox. VERIFIED.
- **爱不释手.** Within a week, one find the person would have missed, said once, with the next
  step a tap away. That one moment sells Ducter more than any surface.
- **Builders' part.** A replay kit that runs the detectors and the morning note over an exported
  mailbox (mbox) on the author's machine, offline from Ducter's Log, real model, nothing kept; the
  author runs it. Gated on his accounts.

### 3. What needs you can't be put off to a time

- **The moment.** 23:00, four asks waiting; the heavy developer wants them in the morning, not
  now and not never. Today Hold cancels the default and the task waits as Waiting with nothing
  bringing it back (`packages/core/src/decisions.ts`: hold → attention `blocked`; `flows/D-decisions-attention.md`
  Q3 "Cancel and wait; Reply can set a time"). A "明早再说" typed as a reply depends on the model
  reading it as a time. VERIFIED.
- **爱不释手.** **晚点再说 / Later** with three times (tonight, tomorrow morning, Monday); the
  card leaves, and comes back inside the next morning note, never as a ping of its own.
- **Outside lesson.** A task inbox with "done" and "later until …" became a daily habit in an open
  agent app in the last days (DOCUMENTED, private notes).

### 4. Recent surfaces haven't met real devices and accounts

- **Evidence.** D305 voice "never with a real microphone, recognizer or voice on any platform";
  D306 Lock Screen with a fake APNs; D301 WeChat with a fake iLink; D277 iMessage with fixture
  chat.db; D297 limits "no real limit hit yet". VERIFIED.
- **爱不释手.** Nothing; this is the floor. A first-friend install that hits a broken permission
  prompt loses that friend. Gated on devices and accounts; the walks so far (research/109, 110,
  124) found real defects every time.

### 5. The phone apps aren't in the stores

- **Evidence.** `roadmap.md` Next: the Android APK owes the release key, its secrets, Android
  developer verification, a real phone and a Chinese ROM; the iPhone app is a public TestFlight
  beta; `todo.md` "iOS 27 SDK before April 2027". VERIFIED.
- **爱不释手.** The fresh user finds Ducter in the store a friend named. Gated.

### 6. A server home can't use the Mac's own sign-ins and apps

- **Evidence.** `roadmap.md` Next "Browse and use apps on your Mac from a server-hosted Ducter …
  browser and computer use on that worker are still the home's only"; research/147: the author's
  trip tasks on hel needed a site signed in only in the MacBook's Chrome; D376 moves the task to
  the MacBook as a whole. VERIFIED.
- **爱不释手.** "Book it" works from the phone, while the Mac at home does the clicking in the
  person's own Chrome, behind the same Go.

### 7. No hands-free conversation

- **Evidence.** `roadmap.md` Later "Voice: … as a call"; `todo.md` Voice "A full spoken
  conversation … reusing D218's realtime loop". VERIFIED.
- **爱不释手.** Talking to the partner while cooking or driving, and it answering first while
  the work starts. High risk: cost, interruption, a cloud voice model on the person's key.

### 8. A feature's first meeting is uneven

- **Evidence.** Some features meet the person with one card (voice's first-use card, D305; the
  first words, D298); most say nothing the first time (On hand's folds, Past tasks' marks, Done for
  you). `AGENTS.md` asks every design to answer "how it starts". VERIFIED.
- **爱不释手.** The first time a person walks into a place on their own, one page with three small
  moving cards says what it is for and the one habit that makes it good; once per device; never at
  launch. **Outside lesson:** an open agent app made exactly this its rule for new features in the
  last days (DOCUMENTED, private notes). Risk: a page nobody asked for is a nag.

### 9. What it made is found only through its task

- **Evidence.** `scenarios.md` I3 "Documents live in 做好的", I4 "Finding a result weeks later",
  I5 "Sharing a result" all "—"; `product-model.md` §8 "The results view and the result anatomy are
  open"; Past tasks (D285) finds tasks, not the table inside a reply or a document across tasks.
  VERIFIED.
- **爱不释手.** "The comparison of the two Macs from last month" found by those words. #1 is the
  curated part of it (what the person chose to keep); this is the rest.

### 10. Moving your Ducter between computers

- **Evidence.** `roadmap.md` Next; `todo.md` "Move your Ducter to another computer (`ducter move`)".
  VERIFIED.
- **爱不释手.** Outgrowing the Mac without losing a single message or routine.

## 4. Not in the ten, and why

- **A second partner** stays a preview (D309): no one has asked for a second one yet.
- **The partner reached from another AI app** (J5) waits on Nowledge Mem's remote delegation.
- **The Bridge live rerun** is in progress (D367–D369); its gaps are Mem's.
- **A hosted model or account** would break "no hosted Ducter"; the pasted key is the
  self-hosted equivalent (research/100 §3, unchanged).

## 5. The first one to build

#1 fits one branch: the rich blocks (D303) already exist on both clients and in the partner's
words; what is missing is a place on the home for the ones the person keeps, ticks on the home,
and a way for the partner to change a kept block in place. It needs a new object and a new word
(a pinned block, **置顶 / Pin**, the word every chat app uses for the same act), so it goes
through the change loop as D381. #2, #4 and #5 are the author's steps; #3 is the next buildable one.

## Implications for Ducter

Build the pinned, living block now (D381): a tap pins a reply's table, chart or list at the top of
the conversation; ticks live on the home; the partner changes a pinned block in place when asked.
Next, Later for asks (#3). Hand the author a replay kit for a real inbox (#2) and the device and
store checklist (#4, #5). Keep the rest in `todo.md` with their triggers.

**Summary:** research/100's first-hour gaps are closed in code. What is left is the second week:
nothing the partner makes for you stays or stays current, the life-watching promise has never met
a real inbox, a held ask never comes back, and much of the newest work has met only fakes. The
first is the smallest true step toward "your own small apps" and is built as D381.
