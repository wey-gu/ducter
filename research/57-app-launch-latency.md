# 56: Perceived latency of the phone, iPad and Android apps (2026-11-11)

The author, on the iPad app with the home on a remote server: "第二栏的全屏点击之后好几秒才全屏" (the
side pane's full screen takes several seconds) and "app 每次一打开的时候数据加载都过几秒，闪烁一下没有数据的界面"
(every open shows an empty screen for seconds before the data). And: is a pure web client good
enough engineering, or does it only look like it works? Measured, fixed, measured again. Feeds D209.

## 1. Setup

- **Home:** a scratch Ducter (its own data dir and port) seeded with a long conversation (160 asks and
  answers, the author's real commit subjects as the work talked about, a third with lists and code)
  and seven tasks in every lane. `.shots/latency/seed.ts`.
- **Distance:** a TCP proxy delaying every chunk 100 ms each way (200 ms RTT, a server abroad), and
  holding a new connection's first bytes 2 RTT for the TCP and TLS 1.3 handshakes the local proxy
  doesn't pay. `.shots/latency/lag.ts`. No bandwidth cap (the 0.4 MB bundle would cost more on a
  slow link than shown here).
- **WebKit:** Playwright's WebKit build (the engine of WKWebView) at an iPad 13" across (1376×1032)
  and an iPhone 17 Pro (402×874), with marks injected before the page runs (first frame of the app,
  the conversation's first bubble, the socket's open and its frames). Cold: an empty profile. Warm: the
  same browser opening the page again (its cache and storage kept; its HTTP connection reused, which an
  app relaunch doesn't get, so the "before" warm numbers are optimistic by about 2 RTT).
  `.shots/latency/measure.ts`. VERIFIED.
- **The app:** the iOS app (Debug) in the iPad Pro 13" (M5) simulator, iOS 26.3, paired to the same home
  through the proxy; each relaunch screen-recorded and read frame by frame at 30 fps.
  `.shots/latency/simrun.sh`, `frames.py`. VERIFIED.
- **Not run:** a real iPad against hel; the iPhone simulator (the iPhone size ran in WebKit only); the
  Android emulator (unit tests and a debug build only).

## 2. The full-screen toggle: 4 seconds, all of it a timeout

| | tap → new layout in the DOM | → painted | → morph done |
|---|---|---|---|
| before | 4014–4098 ms | 4029–4133 ms | same |
| after | 7–35 ms | 19–57 ms | 343–413 ms (the 320 ms morph) |

**Root cause (VERIFIED):** D184's morph runs the route change inside `document.startViewTransition` and
returned a promise that waited for two `requestAnimationFrame`s, so the new state would be rendered.
WebKit holds rendering while the update callback runs, so those frames never come; WebKit gives up after
its 4 s timeout ("View transition update callback timed out") and only then lays out the new page. In
Chromium the frames do come, which is why D184's headless-Chromium checks never saw it. **Fix:** Preact
renders in a microtask; the callback waits for a timer (`setTimeout 0`), which runs after it.

## 3. Opening the app

What blocked the first meaningful frame (VERIFIED, from the marks): the page (1 RTT + handshakes) →
its code and styles, revalidated every time (`no-cache`, 1 RTT, 304) → `GET /api/me` awaited before
anything rendered (1 RTT) → only then the socket (handshakes + upgrade) → hello → welcome and the replay
(1 RTT). Five round trips in series and two handshakes, and the page had nothing of its own to show
until the last one: it drew the header, an empty conversation and "Nothing on hand" first.

| WebKit, 200 ms RTT (ms from navigation) | before cold | before warm | after warm |
|---|---|---|---|
| page received | 606 | 205–277 | 206 |
| code and styles received | 1222 | 410–518 | 206 (cache, no request) |
| /api/me answered | 1451 | 628–789 | 464–471 (in parallel) |
| socket opened | 2057 | 1235–1454 | 824–830 |
| first frame of the app | 1464 | 635–853 | 260–265 |
| **conversation visible** | **2318** | **1487–1722** | **260–265** (the first frame) |
| caught up with the home (on_hand) | 2322 | 1489–1725 | 1032–1039 |
| empty screen shown for | 854 | 850–870 | 0 |

The cold numbers after are unchanged (2331–2335 ms): a first ever open has nothing kept.

**iPad simulator, the app relaunched** (ms after the launch animation ends):

| | before | after (3 runs) |
|---|---|---|
| the app's own loading screen | to 2400 | to ~1200 |
| the page with an empty conversation and "Nothing on hand" | 2400–3500 | never |
| **the conversation and On hand** | **3500** | **~1230–1330** |

What remains before the first frame in the app is the web view's content process starting, the page
read from the cache and the 0.4 MB bundle parsed; the home is not waited on at all. One more thing
showed only once the page painted earlier: a page opened from the cache was laid out before WebKit had
handed it the safe-area insets, so its first frame sat under the status bar and jumped (`.shots/latency/
ipad-sim-inset-jump.png`). The app now uncovers the page once its `env(safe-area-inset-top)` matches the
view's, and keeps the web view laid out (under the loading screen, not hidden) while it loads.

## 4. What changed (D209)

1. **The last screen, kept on the device** (`apps/web/src/glance.ts`): the channel's newest 400 events,
   On hand, the empty conversation's words and who the device is, in localStorage (read synchronously, so
   the first frame has them), saved a moment after each change and at once when the page hides; at most
   1.5 MB, the newer half kept when the quota says no. The page paints from it, then says hello **with the
   cursor it holds**, and the home sends only what's newer (the reconnect path that already existed). A
   replay as long as the home sends at once (5000) means the glance is too old: the page starts over from a
   fresh hello. A revoked device or a Log that started over forgets it; another pairing never reads it.
2. **Nothing waits on `/api/me`:** a paired device starts the socket and paints at once; who it is
   arrives alongside (a 401 still goes to pairing, and now also forgets the glance).
3. **Code and styles named by content** (`app.js?v=<hash>`, `immutable`): a launch never revalidates
   them. A name from before an update gets today's file without being kept under the old name.
4. **The apps open the page from their cache** (`returnCacheDataElseLoad` on iOS,
   `LOAD_CACHE_ELSE_NETWORK` for the first load on Android), but only for a home whose page names its code
   by content; once caught up the page asks for the page again in the background and reloads if it names
   other code (the same once-per-version, nothing-lost rule as D200's stale reload). The page tells the app
   whether the home answered (`reach`), so the can't-reach screen still comes up.
5. **Messages turned into HTML once** (a memo by text), not on every frame from the home.

## 5. Bundle in the app, or a service worker?

- **A service worker** cannot help the apps: WKWebView only runs service workers for App-Bound Domains
  listed in the app's Info.plist (at most 10, fixed at build time), and a home is any address the user
  chose. DOCUMENTED (WebKit, App-Bound Domains, iOS 14). In Playwright's WebKit a service-worker-
  controlled page also closed itself on reload, so the measurements block workers (as the app has none).
- **Shipping the bundle inside the app** would change the page's origin (a custom scheme or a file URL),
  so its storage, CSP `connect-src 'self'`, cookies and the pairing would all have to be rebuilt around a
  cross-origin page; the app and the home would also have to agree on a bundle the home didn't serve
  (D200 handles the reverse). It buys only the very first open after install. INFERRED.
- **The cache-first page with content-named assets** gets the same result from the second open on, keeps
  one origin and one source of the page (the home's), and needs no build output in git (D75).

## 6. Native rewrite or a well-engineered hybrid?

Both complaints were engineering faults inside the hybrid, not limits of it: a WebKit-only 4 s timeout,
and a boot that waited on five round trips with nothing of its own to show. With them fixed, the page's
own first frame is ~55 ms after its HTML in WebKit on this Mac, and the app's remaining ~1.2 s is the web
content process starting and the bundle being parsed (not measured on a real iPad; INFERRED from the
simulator and the WebKit marks). What a native rewrite would buy: no web content process to start
(perhaps 0.5–1 s off a cold open, INFERRED), native list scrolling and text selection, and system controls
without imitation. What it would cost: three clients that already exist and change daily (iPhone/iPad,
Android, the Mac's Go) becoming four or five implementations of every view, against D178's reasoning.

**Recommendation:** keep the hybrid and hold it to a measured bar: the conversation visible in the first
frame on open, a layout change painted within 100 ms, every interaction under 100 ms to its first visible
response. Next, if a real device shows the ~1.2 s: start the web view at app launch rather than on the
first screen, split the bundle so the conversation's code parses first, and virtualize the transcript
past a few hundred messages. Revisit native if, after those, a measured interaction on a real device
still misses the bar.

## Implications for Ducter

- D209: the page opens on its last screen, the socket and who-am-I run in parallel, assets are
  content-named, the apps open the page from cache and check it in the background, the view-transition
  callback never waits on a frame.
- Any future wait inside a view transition must be a timer or a promise from the code, never a frame.
- Headless Chromium checks miss WebKit-only behaviour; layout changes on the iPad are checked in WebKit.

**Summary.** Full screen took 4.0–4.1 s because the morph waited for a frame WebKit never gives inside a
view transition; now 20–60 ms to paint, 0.35–0.41 s with the morph. Opening showed an empty screen for
~0.85 s (WebKit) / ~1.1 s (iPad simulator) after up to 1.7 s / 3.5 s; now the conversation is the first
frame (0.26 s in WebKit with a 200 ms RTT home; ~1.3 s in the simulator, all of it local). The hybrid
stays; native is revisited only against a measured bar on a real device.
