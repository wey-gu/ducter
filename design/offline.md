# Through a drop: the web and phone client stays useful (D543)

The phone and the browser reach the home over the network, and a phone's network drops: a lift, a
train, a café's Wi-Fi, a switch from Wi-Fi to cellular, a home that restarts. The author's word
(2026-11-24): "on a weak network a short drop makes the whole UI suddenly unusable (什么都干不了)".
This note says what the client does through a drop, why, and what it deliberately doesn't do. The
link's own words and the pairing rule are D520/D532 (`system.md` "the link to the home"); this
note is the rest of the client: reading, writing, opening, coming back.

## Who is in this moment

- **The heavy developer** checks a task on the phone between stations: the conversation must stay
  readable, the opened task too, and a "merge it" typed in a tunnel must land once, not twice.
- **The consumer** types to the partner as they would in a messaging app. They expect the app's
  promise: what you sent shows at once, with a small clock until it goes. Nothing else.
- **The fresh user** doesn't know there is a home, a socket or a token. A blank page, a full-screen
  "can't reach" over what they were reading, or a lost message is the app being broken.

What they should feel: nothing, for a short drop (silence means success); for a long one, one
honest line and the certainty that nothing is lost (放心).

## What was measured (headless Chrome at 390, a demo home behind a link made bad on purpose)

Before D543, on main (0.1.47), with a paired page behind a proxy that resets, blackholes (a socket
that looks open but is dead: a phone that moved networks), stalls (TCP retrying) or flaps:

| Case | Before | After (D543) |
|---|---|---|
| 5 s drop, idle | no overlay, composer usable; the header said 正在重新连上… at once, back 3.4 s after the link returned | the same, but nothing said for the first 2.5 s (the line at 2.8 s) |
| 10 s half-open, a message sent at 1 s | the page said all is well for 45 s, the message pending; delivered at 46.5 s | the socket let go 4 s after the send; delivered at 15.2 s, 4.7 s after the link returned (a dial made into the dead network waits out `WELCOME_WAIT_MS`) |
| 10 s stall, a message sent | delivered when the link moved again | the same |
| a message sent while down, then the page reloaded while down | the browser's own error page; the message lost | the kept page from the shell in 0.3 s, the message shown pending again, delivered once when back |
| 1 s down / 1 s up, ten times | 20 dials; the header flicked ten times | 20 dials (each reset is one); the header never changed |
| a reload on slow 3G with the last screen kept | the conversation in about 1 s | the same (1.3 s) |
| a card's Go tapped while down, then a reload | the Go lost; the card asked again | the Go kept and applied when back (3 待你处理 to 2, the task started) |
| a task's draft, and the opened task, after a reload while down | the draft lost (memory only); the task empty until the home answered (by the code) | the draft kept; the task's steps read from its kept window |
| the iPhone app's cold start from its cache, home unreachable | `reach: false` at 0.8 s: the app's full-screen can't-reach screen over a readable page | no `reach: false`; the kept screen stays, the line from 2.9 s |
| the app back to the front on a half-open socket | 56 s before it dialled again | 4.6 s |
| index.html's static boot ground at two panes | stays in `#app` beside the app whenever the first draw isn't the one D535 covered | removed on the first draw, whichever it is (a Preact probe: rendering two panes into a root holding the static `<main>` leaves `DIV.panes` and `MAIN.boot-wait static` side by side; a phone's tree reuses the `<main>` as its own) |

Measured with `.shots/offline/tools/` (`flaky.ts`, the bad link; `measure.ts`, the scenarios);
the raw results are in `.shots/offline/measure/`.

So the drop itself was mostly handled (D209, D293, D532); what made it feel "什么都干不了" was the
edges: the app's can't-reach screen over a readable page, a half-open socket believed for 45 s,
writes that lived only in memory, the browser with no shell, a line that flickered.

## The rules (what is built)

1. **Never blank on a drop.** The screen the person was on stays, readable, scrollable, every
   cached task openable. Nothing modal appears for a drop: the link is said in the header's line
   and, from 30 s, D532's one notice above the composer.
2. **A short drop says nothing.** Under `LINK_QUIET_MS` (2.5 s) the line keeps its counts and the
   partner doesn't nap; from 2.5 s **正在重新连上 {home}… / Reconnecting to {home}…**; from 30 s the
   notice. A flapping link no longer flickers.
3. **The page decides whether the app's can't-reach screen shows.** A page that shows a kept screen
   never tells the iPhone or Android app `reach: false`; only a page with nothing to show does. The
   shells are unchanged.
4. **Writes go to an outbox on the device** (`apps/web/src/outbox.ts`, IndexedDB). A message to the
   partner, a message to a task, and a card's answer are written down the moment they are sent,
   shown at once (the message with its pending look, and with the link down one quiet line under
   it, **连上就发出去 / Sends when it's back**, a clock, never an error), and sent after every
   welcome with their clientId. The home dedupes a message by clientId and answers a closed card
   with how it closed (D481), so a copy that did arrive is never applied twice. An echo, a task's
   `sent`, or a card's resolution takes it out. A reload, a cold start, the phone letting the page
   go: it is shown again and sent.
5. **Only what is safe late waits.** A pay card's Go carries the card's security code and a key
   card's answer carries the key: neither is ever written down; with the link down they, a Go that
   deletes something (D340) and a **现在就打 / Call now** ask again with one toast, **还没连上 {home}。
   这一步不能晚点再发，连上后再点一次。/ Not connected to {home} yet. This one can't be sent later: tap
   it again once it's back.** A kept answer older than 30 minutes is not sent: its card opens again
   (**断开得太久，刚才的回答没有替你发出去。再看一眼那张卡片。**). A card shown as answered whose answer
   isn't kept opens again on the next welcome; the replay closes it if the home did get it.
6. **Drafts survive** per partner (the default's keeps its old key) and per task, in localStorage.
7. **A durable cache to read from.** The last screen (D209's glance) is now kept per partner, so a
   switch to another partner with the link down shows its conversation. The tasks opened lately (12,
   their newest 300 events and their session index) are kept in IndexedDB (`taskwin.ts`) and read
   at once on opening; they are marked stale, so the home's own history replaces them the moment it
   answers (D284, D320). The hello carries the cursor it holds, so only what is newer comes.
8. **An app shell for the browser** (`sw.ts`): the page network-first with a 3 s wait, then the
   kept page; its code and styles, named by content (`app.js?v=…`), cache-first; every version the
   newest page no longer names dropped. `/api/` and `/ws` are never touched. The kept page keeps
   the home's own headers (its CSP). The worker is registered only outside the iPhone and Android
   apps, whose own cache is the shell (D209); push and its notification Go/Hold are unchanged.
9. **Reconnect** as D532 (backoff to 5 s, 15 s after a minute, ±20% jitter; at once on `online`,
   `visibilitychange`, `ducterresume`), plus the window's `focus`. **A socket proves itself**: on
   coming back, on the network coming back, and whenever a message or answer is written, an open
   socket gets a ping and `PROBE_MS` (4 s) to say anything; silent, it is let go at once (not
   `close()` and wait: on a half-open socket the closing handshake never comes, and Chrome held it
   for up to a minute) and dialled again, and the outbox goes on the new one. A dial that hasn't
   heard its welcome in `WELCOME_WAIT_MS` (8 s) is let go the same way. The steady 15 s ping and
   45 s limit stay for an idle page.
10. **A network error is never "unpaired"** (D520, D532, unchanged): only the home's signed word.
11. **The first draw empties what Preact didn't make.** Every draw into `#app` goes through
    `paint()` (main.tsx); the first one, whichever it is, removes index.html's static boot ground,
    and `#app > .boot-wait.static:not(:only-child)` hides it in CSS whatever draws.

## What was not adopted, and why

- **Everything in IndexedDB, the glance too.** The glance stays in localStorage because it reads
  synchronously: the first frame already holds the conversation (D209). The outbox and task windows
  are IndexedDB (async, larger, the service worker can read it); the page waits at most 500 ms for
  the outbox before its first paint.
- **Background Sync.** Safari and WebKit don't have it, and the iPhone app is WebKit; the outbox
  drains on the next welcome instead, which every platform has.
- **A service worker in the iPhone and Android apps.** WKWebView's service workers need App-Bound
  Domains and conflict with the shells' own cache-first load (D209); the apps already open from
  their cache.
- **Caching `/api/` (media, `/api/me`).** A picture's bytes need the device token and change per
  device; a picture not yet seen is not shown offline (a broken-image box, `todo.md`).
- **Optimistic local state for everything** (a rename, a setting, starting a task offline). A new
  task starts on the home, which picks where it runs; doing it late without the person watching is
  the wrong default. These say they need the link (`newtask.err.conn`), as before.
- **A persisted Connection outbox for task actions** (merge, open a PR). They are not safe late: a
  merge half an hour later is not what was asked. They stay in memory for the current page only,
  as before (D209's in-doubt settling).
- **A shorter steady heartbeat.** Pinging every 3 s would find a half-open socket sooner when idle,
  at the battery's cost; the probe on every write and every return finds it when it matters.
- **The brief's wording 连不上你的 Ducter，在重连….** The link's words are the Mac's (D520) and the
  glossary's; the client keeps **正在重新连上 {home}…** so every surface says one thing.

## Open

- Pictures picked while the link is down still need the link to go up (D206's upload); their words
  wait with them in memory, not in the outbox, until they have.
- A task window is kept only for tasks opened on this device; On hand's other tasks read their card.
- Not yet on a real phone on a real train; the iPhone and Android checks here simulate the shell's
  bridge in headless Chrome.
