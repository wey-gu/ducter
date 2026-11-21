# 196 · A feature's first meeting: this week's thirteen, graded, and one shared "first time" line

For D451 (research/194 #8, research/150 #8). Read 2026-11-21 in the code of `main` at c3a7db44, web
(`apps/web/src`) and Mac (`apps/desktop/internal`). VERIFIED = read in Ducter's code; INFERRED =
judgment. Raters are LLM proxies (two cheap-model runs, zh and en, from descriptions only), not
people: a first filter, never the last word.

## 1. The question

`AGENTS.md` asks every design "how it starts: the first time they meet this feature, with zero setup
and zero concepts". The thirteen capabilities shipped D426–D449 each answered it in their own
decision. Walked together, as the fresh user meets them, the answers are uneven: some are shown by the
thing itself (an app opens already filled in), some are explained every time (the checkout card's
promise), some meet the person with a card per device (talking), and some say nothing although the
thing can't explain itself (a loop Ducter keeps, chips read from a sentence, "another AI looked it
over").

## 2. The inventory (VERIFIED, both clients)

Grades: the north star (D36) as 好用 easy · 顺滑 smooth · 赏心悦目 delightful · 放心 trustworthy ·
惊喜 surprising, each A (fully), B (partly), C (missing) for the *first* meeting only.

| # | Capability | The first meeting today | Remembered | 好用 | 顺滑 | 赏心 | 放心 | 惊喜 | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| D426 | Many asks | rows with the person's own words and drawn marks under their bubble, from two lines; nothing explains, nothing needs to | none needed | A | A | A | A | B | shown; keep |
| D427 | Ongoing loops | the card looks like any other; that Ducter now keeps it going is said nowhere until something goes wrong (web `past.tsx`, Mac `ongoing.go`) | none | B | A | B | C | C | **missing**: the promise is the feature |
| D428 | Finder chips | 找的是 and chips with a ×; a hover title on the web only; that a tap drops one is never said on a phone (`handover.tsx` `Heard`, Mac `handReading`) | none | B | B | A | B | B | **confusing**: on touch the × is the only hint |
| D431 | Small apps | the app opens already filled (`data-empty`, the add open); the partner's face and **{name}先填好了** the first open (home's `opened`) | home | A | A | A | A | A | shown; the pattern's precedent |
| D436 | Errand to checkout | the ack says where it stops; the card says **Ducter 不会替你点付款** every time | none (said every time) | A | A | A | A | A | keep: a promise about money is said at every checkout, never only once |
| D437 | Fresh look | **另一个 AI 看过** and what's left, only when something is; which AI, why, and that fixed points were dropped is never said | none | B | A | A | B | C | **confusing**: the fresh user reads "another AI" as a stranger |
| D438 | Mini window | comes by itself once when a task's folder opens in an editor; its own line says the key | desktop.json `FloatOffered` | A | A | A | A | A | keep: the window is the thing |
| D439 | Documents | **看过每一页** and what's left, only when something is; that Ducter checks pages is never said | none | B | A | A | B | C | **confusing**: same as D437 |
| D440 | First answer | **还没有密钥？** under the key card while nothing can think; the kept message said once by code | home (`noBrain`, a state) | A | A | A | A | A | keep: onboarding, a state, not a hint |
| D442 | Talk hands-free | the first tap shows one card over the composer (what, how it stops, privacy, Start) | per device (`ducter.talk.asked`, `TalkAsked`) | A | B | A | A | B | keep: consent for a microphone is per device |
| D305 | Hold to talk | the first hold shows one card (Use the microphone, Not now) | per device | A | B | A | A | B | keep; a seam: Not now marks it asked on the web, not on the Mac |
| D444 | 记下了 / 别记这个 | the line under the reply every time something is kept, until the person speaks | none needed | A | A | A | A | B | shown; keep |
| D448 | Bridge relay | the card names the task, the agent and the words, with 发送 | none needed | A | A | B | A | B | shown; keep |
| D449 | Free key's day | Settings › Partner's readout; one sentence in the conversation the first time a result goes out unlooked (home's `free-budget.json`) | home | A | A | B | A | B | keep; a seam: it comes after the partner's words, not under the result |

Other once-only moments found on the way (VERIFIED): the title moment (once per Mac), the Mac's first
result celebration (a green notice above the composer, Mac only, per Mac), the notification and phone
offers (per device), the calendar's first line (per Mac, seven days), a teammate agent's first message
(home), a saved detail's first use on a site (home, a Go card), the greeting (home). Storage is four
patterns: per-device bool fields in `desktop.json`, a namespaced `Asks` map, duplicated
`localStorage` getters with try/catch, and home flags each in its own file.

## 3. What the gaps share (INFERRED)

The three missing or confusing ones are the same kind: the thing on screen is right but **can't say
what it is for**, because what it is for is something Ducter does unseen (keeps a loop alive, read a
sentence into facts, had another AI look, looked at every page). The fresh user needs one sentence, in
the partner's voice, once, beside the thing. The others either explain themselves (shown, D43), are a
state (no key), are consent (a microphone), or are a promise that must be said each time (money).

None of them wants research/150's sketch (one page of three moving cards on entering a place): it
explains places, not things, and arrives when the person walked in to do something else.

## 4. The pattern: 第一次 / The first time

- **Where:** in place, directly under the thing, on its text edge, inside whatever holds it (the
  result's lines, the card, the chips). Never above the composer, never in a sheet, never at launch.
- **How it looks:** one line, `ink-soft` at 500, in the partner's first person, led by its clay face
  at 18 held still. It rises in once (3 px, 320 ms) and the face gives one small nod; reduced motion:
  none. No box, bar, pill, badge, arrow or button (D441).
- **When:** only on the first such thing on the screen, only while the moment isn't met.
- **Dismissed by being read:** after it has been on screen 1.5 s (web: in view; Mac: drawn), or the
  moment the person acts on the thing (a chip dropped), it is met. It stays where it is for that page's
  life, so it never vanishes under the reader's eyes, and never shows again.
- **Remembered across devices:** on the home, Settings' `met` (names, added never removed; an empty list
  starts them over). A home too old to keep it shows none, rather than every day.
- **Who gets one:** only a thing that can't say what it is for. Four today: `loop`, `find`, `look`,
  `pages`. Consent cards, states, promises said each time, and things that show themselves are not
  this pattern and stay as they are.

### The metaphor pass (AGENTS.md)

Candidates, each with what it wrongly implies:

| Candidate | False implications | Legible unlabeled | Fidelity | Scale | Emotional fit | Distinct | Feasible |
|---|---|---|---|---|---|---|---|
| A. Plain line, no mark (beautifully literal) | none; but unsigned ("the app's caption") | 4 | 4 | 5 | 3 | 2 | 5 |
| **B. The line led by the partner's still face, one nod** | may read as a chat avatar to tap (mitigated: still, small, not a control) | 5 | 5 | 5 | 5 | 4 | 5 |
| C. A sparkle glyph | "a new AI feature", premium, upsell | 2 | 2 | 5 | 2 | 1 | 5 |
| D. A "新 / New" pill, words on hover | marketing; nothing on a phone; a pill for one word (D441) | 2 | 1 | 4 | 2 | 1 | 4 |
| E. A coach-mark bubble with Next | a tour starts; must finish it; covers content | 3 | 2 | 2 | 1 | 1 | 3 |
| F. A pulsing ring on the button | an alert, urgent or broken; must tap to read | 1 | 1 | 3 | 1 | 2 | 4 |

**Raters** (two cheap-model naive raters, en and zh, descriptions only): both picked A for a busy
person and B for someone new to AI apps; both read C as an upsell, D as an ad that says nothing on a
phone, E as a tour, F as an alarm. Pleasant/annoying: A 3–4/1, B 4/2, C 3/2, D 2–3/2–3, E 2/4, F 2/4.
The en rater flagged a word ("rhythm") in the loop's draft line: the line was rewritten in plain words
("It keeps running on time…"). The zh rater's risk for B (the face read as a chat to open) is why it is
still and nothing on the line is a control.

Chosen: **B**, the partner's face held still. It answers "who is telling me this" (the partner, whose
voice the line is in), which A leaves to the reader, and it is not a new visual idea: the same face
already leads the apps' first line (D410) and the D321 example.

## 5. The words (zh and en designed together)

| Name | zh | en |
|---|---|---|
| loop | 它会一直按时跑。停了我会让它接着跑，跑不了会在这里告诉你。 | It keeps running on time. If it stops, I start it again; if it can't run, I tell you here. |
| find | 这是我从你那句话里读出来的。点掉一个，就不按它找了。 | This is what I read from your words. Tap one away to stop finding by it. |
| look | 给你之前，我请另一个 AI 对着你的话看过一遍。改好的不再提，这里是还没改好的。 | Before it reached you, I had another AI check it against your words. What got fixed isn't shown; this is what's left. |
| pages | 我做的文档，会一页一页看过再给你。这里是还没改好的。 | I look at every page of a file I make before you get it. This is what's still off. |

The loop's line shows on a loop that keeps time or just came back (its health "back": the line then
explains the "stopped by mistake, running again" beside it), never on one that is late or failing,
where it would contradict the card.

## 6. Left (INFERRED, in `todo.md`)

- The Mac's first-result celebration is a tinted notice above the composer, Mac only: the pattern says
  it belongs under the first result, on every client.
- D449's once-said line goes after the partner's words in the conversation; under the first unlooked
  result as a `look` sibling would be in place.
- Hold to talk's Not now: marks it asked on the web, not on the Mac.
- A way to see them again (an empty `met` starts them over; no control yet).
- Real people, not proxies, reading the four lines; and On hand's folds, Past tasks' marks and Done for
  you (research/150 #8's places), each checked against "can it say what it is for".

## Implications for Ducter

A first meeting is a line, not a page: one sentence in the partner's voice under the one thing that
can't say what it is for, once, met on every device the moment it was read. Most of this week's
capabilities need nothing (they show themselves, are a state, a consent or a promise); four needed the
line. The pattern is shared code on both clients and a name list in the protocol, so the next
capability that can't explain itself adds a name and two sentences.

**Summary:** thirteen first meetings graded; three missing or confusing and one more of the same kind
get one shared 第一次 line (the partner's still face, ink-soft, under the thing, once, kept on the home
across devices); consent cards, states and money promises stay; four seams left for later.
