# 97. How Ducter's machines talk to each other: every path, every combination, and what to build

Date: 2026-11-16. Question (the author): "我们 tailscale 那些工作各种组合，场景考虑清楚了么，我们机器之间
的通信是怎么考虑的？" A full map of the paths between the home, the computers that do tasks for it,
the windows people use (the Mac app, the web, the iPhone and Android apps, the CLI) and the helpers
in between; the realistic combinations and what each person sees; ranked gaps and a proposed
design.

Tags: **VERIFIED** (read in this repo's code at `ed5708dd`, file:line given, or a test exists),
**DOCUMENTED** (a design note, a decision, or a vendor's own text), **INFERRED** (reasoned from the
code or the vendors' behaviour, not run). Nothing here was run against a real tailnet, a real
Cloudflare account or a real second network: the combinations are traced through the code. The
general lessons in §4 come from reading how other multi-device agent systems are built (sources
kept out of the repo, `research/private/`).

Words: **home** = the computer Ducter lives on (the main process: Log, partner, decisions, pairing);
**worker** = another computer that does tasks for it (D54, D83); **window** = any client (Mac app,
web page, iPhone/Android app, CLI); **reach method** = how a window or worker gets to the home from
another network (own domain, Tailscale, Cloudflare tunnel, SSH tunnel).

## 1. The map today

### 1.1 One shape: a star, everything dials the home

Every connection in Ducter starts at a window or a worker and ends at the home's one HTTP port
(127.0.0.1:7777 by default). There is no peer-to-peer path, no path between two workers, no
discovery, and no second address per home.

- The home binds **127.0.0.1 only** unless `DUCTER_HOST`/`--host` says otherwise
  (`packages/core/src/core.ts:698`, `packages/cli/src/main.ts:519`). VERIFIED. So on a Mac home,
  a phone on the same Wi-Fi cannot reach it without a reach method (INFERRED from the bind).
- A home has **one advertised address**: `DUCTER_PUBLIC_URL`, else `<dataDir>/public-url`
  (`packages/core/src/devices.ts:160-163`, `packages/cli/src/remote.ts:17-34`). VERIFIED. Each
  reach method writes that same file: `ducter domain` (`domain.ts:306`), `ducter tailscale`
  (`tailscale.ts:264`), the Cloudflare tunnel once its outside check passes (`anywhere.ts:123`).
  Pairing codes carry it.
- Each window and each worker **saves one address**: the Mac app's `connection.json` holds one
  `url` (`apps/desktop/internal/remote/remote.go:27`); the iPhone app one `base`, and a new base
  drops the token (`apps/ios/Ducter/Store.swift:38-43`); the web client keeps its device record in
  the page's own `localStorage` (`apps/web/src/conn.ts:16-37`), so a different address is a
  different origin with no record; a worker's `worker.json` holds one `url`
  (`packages/cli/src/worker.ts:31,130`). VERIFIED.

### 1.2 Every path

| # | From → to | Transport | Auth | Encryption | Sleep / network change / offline |
|---|---|---|---|---|---|
| P1 | Mac app → home on the same Mac | WebSocket `/ws` on loopback | none (local trust: loopback peer and Host, no proxy header; `auth.ts:296-306`) | none needed (loopback) | home quits with the app's agent; the app restarts it. VERIFIED |
| P2 | CLI → home on the same machine | HTTP + WS on loopback | local trust | — | — VERIFIED |
| P3 | Window → home elsewhere (Mac app, web, iPhone, Android) | WSS `/ws` + HTTPS `/api/*` to the one saved address | bearer device token `dvc.<id>.<secret>` (D54), stored as SHA-256 on the home | TLS to whatever terminates it (P8–P11); no app-layer encryption | web: reconnect by cursor with backoff, and at once on `visibilitychange`/`online` (`apps/web/src/conn.ts:153-207`); a dead home shows the last screen (D209). VERIFIED. Changing the address = pairing again (§1.1) |
| P4 | Worker → home | one outbound WS `/worker` to the saved address | worker device token (opens only `/worker` and `/mcp`, D83) | as P3 | ping every 30 s, but no pong deadline on the worker (`worker.ts:254`); reconnect backoff 1 s → 30 s (`worker.ts:243-296`); on any close the worker **ends its running sessions** (`worker.ts:273-275`), the home marks them offline, blocks after 2 min, resumes by session id on hello (system.md "Workers"). VERIFIED. The home's socket handler sets no WebSocket timeout of its own (`core.ts:1067-1072`), so Bun's defaults apply (idle timeout 120 s, server pings on; DOCUMENTED in Bun's `ServerWebSocket` options). A half-open socket after a Wi-Fi change is only noticed when TCP or the idle timeout gives up (INFERRED) |
| P5 | A task on a worker → home `/mcp` | HTTP per tool call to the worker's saved home address | HMAC role token + worker device token | as P3 | each call fails while the home is unreachable; the harness sees a tool error. DOCUMENTED (system.md "Placement"). Through a Cloudflare tunnel, every tool call's content passes Cloudflare in clear (INFERRED from P11) |
| P6 | Home → worker (ops: plan, start, steer, merge, browser CDP, phone, updates) | multiplexed frames down P4 | P4's | P4's | only while P4 is up; "a new task waits for its computer" (D157). VERIFIED (`core/src/workers.ts`) |
| P7 | Android phone lent to a task (用这台手机) → home | its own WS with the page's device token | device token | as P3 | quick retries ≤ 8 s, generations so the home tells old from new (`HandsetLinkTest.kt:20-24`). VERIFIED |
| P8 | Reach: own domain | Caddy on the home, `reverse_proxy 127.0.0.1:7777` | pairing | TLS ends on the home (Let's Encrypt) | needs a public IP and 80/443 open; mainland China needs an ICP filing. DOCUMENTED (system.md "Reaching it") |
| P9 | Reach: Tailscale (D265) | `tailscale serve --https=443` on the home → loopback | tailnet membership **and** pairing (served requests carry `Tailscale-User-Login`, so they are remote) | WireGuard between devices + TLS (ts.net certificate) ending in tailscaled on the home | every window and worker must run Tailscale in the same tailnet; when a direct path fails, Tailscale relays through its own DERP servers. DOCUMENTED (research/86). CLI only; no app path on a Mac home (todo.md "Tailscale") |
| P10 | Reach: Cloudflare tunnel (D228) | cloudflared on the home dials out to Cloudflare; windows reach `https://<host>` | pairing | TLS ends at Cloudflare's edge: **Cloudflare sees every frame in clear** (said on the card) | tunnel restarted every 30 s if lost, self-check every 2.5 min (system.md "Running"). Not yet run on a real account (todo.md) |
| P11 | Reach: SSH tunnel | `ssh -L 7777:127.0.0.1:7777` | SSH; the home sees loopback, so **no code** (local trust) | SSH | lives as long as the ssh process; a phone can't use it. DOCUMENTED |
| P12 | Home → iPhone (notification) | home → `ducter.ai/api/push` (Vercel) → APNs, or straight to APNs with the home's own key | relay handle; phone's 32-byte key | **end to end** AES-256-GCM, the relay and Apple see a neutral line (D159) | outbound only: works from any home with internet, whatever the reach method. DOCUMENTED; VERIFIED tests |
| P13 | Home → web / Android (notification) | Web Push to the browser's push service (FCM, Mozilla, Apple, Windows), UnifiedPush on Android (D181) | VAPID | RFC 8291 aes128gcm (`push.ts:5,73-87`) | outbound only. Endpoint allowlist `push.ts:149`. VERIFIED |
| P14 | Home → Nowledge Mem / Bridge | the home's `nmem` CLI to Mem (local or cloud) | the person's Mem sign-in | Mem's own | DOCUMENTED (`bridge-link.ts:1-27`) |
| P15 | Home ↔ AI providers, GitHub, Cloudflare API, update feeds | outbound HTTPS from whichever computer runs the agent | the agent's own sign-in, per computer (never copied, where.md §12) | TLS | DOCUMENTED |

What is **not** there (VERIFIED by search): a direct LAN path (mDNS/Bonjour or a LAN address in a
pairing code); a second address per home; any health probe of the address from the window's side
(todo.md "A status probe per address on Devices"); a device key or passkey (D40's target, todo.md);
the D57 local token (an SSH tunnel's far end and every local account are trusted); a worker that
says it is going to sleep (the home accepts `{t:"sleep"}`, `workers.ts:331`, but nothing sends
it); reattaching a session that survived a socket blip; moving the home to another computer.

### 1.3 Who carries the bytes, and who can read them

| Path | Who can read content | Who can tell it happened |
|---|---|---|
| Loopback, SSH | nobody else | — |
| Own domain (Caddy) | nobody else | the network sees the domain |
| Tailscale serve | nobody else (WireGuard end to end; DERP relays carry encrypted packets) | Tailscale's coordination server knows the devices; machine names are in Certificate Transparency logs (research/86 §3) |
| Cloudflare tunnel | **Cloudflare** (TLS ends at its edge) | Cloudflare |
| iPhone push | nobody (D159 encryption) | the relay, Apple: when, padded size, decision or not |
| Web Push | nobody (RFC 8291) | the push service |

## 2. Combinations and scenarios

Each row: does it work today, what breaks, what the person sees. "Works" means traced through
the code and the decisions; none of the cross-network rows has been run on real networks (see the header).

### 2.1 Where the home lives × how windows reach it

| # | Home | Reach | Phone at home Wi-Fi | Phone on cellular / abroad | Mac app elsewhere | Notifications |
|---|---|---|---|---|---|---|
| H1 | Mac at home, nothing set up | — | **no** (127.0.0.1 bind); the card offers 从外面连 | no | no | iPhone yes (outbound); Web Push yes |
| H2 | Mac at home | Cloudflare tunnel | yes, through Cloudflare (traffic leaves the house and comes back) | yes | yes | yes |
| H3 | Mac at home | Tailscale (`ducter tailscale` in a terminal; no app path) | yes if the phone runs Tailscale; direct path on the LAN | yes, with Tailscale on | yes, with Tailscale on | yes |
| H4 | Mac at home, lid closed / asleep | any | **nothing answers**: last screen, "can't reach" (principle 19) | same | same | none sent while asleep |
| H5 | VPS with a public IP | own domain | yes | yes | yes | yes |
| H6 | VPS, tailnet only (the author's hel, D265) | Tailscale | yes, Tailscale on | yes, Tailscale on | yes, Tailscale on | yes |
| H7 | Home server behind NAT (mini, NAS) | tunnel or Tailscale | as H2/H3 | as H2/H3 | as H2/H3 | yes |
| H8 | Any home | SSH tunnel only | **no** (a phone can't) | no | Mac/CLI only, while ssh runs; no code asked | iPhone yes |
| H9 | Mainland-China VPS | own domain | needs an ICP filing for 80/443 | — | — | iPhone via relay or own key: INFERRED to work (APNs is reachable in China; the relay is on Vercel, reachability from China varies); Web Push via FCM **no** from mainland (INFERRED: Google services are blocked) |
| H10 | Home abroad, phone in mainland China | Cloudflare tunnel | — | **unreliable** (free Cloudflare has no mainland points of presence; INFERRED) | — | iPhone yes; Android Web Push through FCM no |
| H11 | Home abroad, phone in mainland China | Tailscale | — | **unreliable**: login and DERP relays abroad, UDP often degraded (INFERRED) | — | as H10 |

### 2.2 Workers

A worker dials the one address it was given when it joined; it needs exactly what a phone needs.

| # | Home | Worker | Works? | What breaks / what the person sees |
|---|---|---|---|---|
| W1 | VPS (domain or tailnet) | the person's Mac, one tap in the app (D155) | yes, the common shape | the Mac sleeps: 睡着了 / 连不上 · {time}; running sessions end and resume by id on wake (no 我要睡了 signal is sent, so the home can't tell sleep from a dropped link: INFERRED from §1.2) |
| W2 | VPS, tailnet only | a cloud box not in the tailnet | **no** | `ducter worker` says it can't reach the address; nothing suggests joining the tailnet. INFERRED |
| W3 | Mac at home, nothing set up | a VPS | **no** | the worker can't reach 127.0.0.1 on another machine. `ducter pair` prints the SSH-tunnel line, which a worker can't use well |
| W4 | Mac at home + Cloudflare tunnel | a VPS or office machine | yes | every frame and every MCP call of every worker task goes through Cloudflare in clear; Mac sleeps → all workers idle |
| W5 | Mac at home | a Mac mini on the **same LAN**, no reach method | **no** | the obvious "two computers in one room" case has no path; it needs the tunnel or Tailscale even though they sit side by side |
| W6 | Mac app connected through an SSH tunnel | that Mac becomes a worker | fragile | the worker saves `http://127.0.0.1:7777` and works only while the ssh process runs; INFERRED |
| W7 | VPS | a laptop that moves Wi-Fi → café → tethering | yes, after a gap | the old socket can sit half-open until TCP or the 120 s idle timeout notices; sessions then end and resume by id. INFERRED |
| W8 | Any | a worker behind strict NAT, no tailnet | yes **if** the home has an address the worker can reach (it dials out) | the asymmetric case is fine; the reverse (home behind NAT, no reach method) is W3/W5 |
| W9 | Home in one country, worker in China | any | depends on the path from the worker to the home (as H10/H11); agent sign-ins and provider calls from that worker are the worker's own problem | INFERRED |

### 2.3 Switching, mixing and moving

| # | Situation | Today |
|---|---|---|
| S1 | Tailscale **and** a domain both set up | `public-url` holds the one written last; `ducter tailscale` overwrites a domain or tunnel address without asking (`tailscale.ts:264`), the tunnel refuses when another address exists (`own_address`, `anywhere.ts:263`). Devices keep whatever they paired with. A phone in the tailnet and a friend's laptop outside it can't be given different addresses: one home, one address. VERIFIED / INFERRED |
| S2 | Switching from a tunnel to Tailscale (or back) | each window and worker must pair again: the iPhone drops its token on a new base, the web client's record is per origin, the Mac app and workers hold one URL (§1.1). The old devices stay listed and work until the old path is turned off; then they show "can't reach" with nothing that says "your home moved to …". INFERRED from §1.1 |
| S3 | Tailscale on some devices, not others | the phone without Tailscale can't open the ts.net address; nothing tells it which other address would work (there is none). INFERRED |
| S4 | Same Mac app, two homes (a personal Mac home and a server home) | the Mac app holds one connection; switching is "connect to another Ducter", which forgets the first. A worker serves one home (`worker.json`). Two homes = two separate installs. VERIFIED (remote.go, worker.ts) |
| S5 | Moving the home (Mac → VPS) | not built (design/site-audit-2026-11.md "Moving your Ducter between computers"); tasks move, the home doesn't. Every device pairs again |
| S6 | The home's address changes underneath (new IP, a domain lapses) | domain: DNS follows the IP; a tunnel's hostname never changes (D228); ts.net names are stable while the machine keeps its name. If a domain lapses, every device is stranded. INFERRED |
| S7 | Shared Linux box with other accounts | other accounts are "local" and can drive Ducter (D57 not built). DOCUMENTED (system.md) |

### 2.4 Summary of the matrix

- **Works well:** a home that has one stable address everyone can reach (a VPS with a domain;
  a VPS in a tailnet where every device runs Tailscale), the Mac doing tasks for it, phones getting
  notifications from any home.
- **Breaks or surprises:** the Mac home with nothing set up (no phone, no worker, not even on the
  same Wi-Fi); two machines in the same room; mixed devices (some in a tailnet, some not); switching
  reach methods (everything pairs again, with no hint); a laptop worker changing networks (silent
  gap, running work restarts); China networks (Cloudflare and Tailscale unreliable, FCM blocked,
  domains need ICP); two homes; moving the home.

## 3. Ranked gaps

1. **One address per home, chosen by hand, saved once by every device.** The root of S1–S3, S5,
   W2, W6: a window can't try another path, can't learn a new one, and a change of method strands
   every device. (Severity: high; every multi-network person meets it.)
2. **No path inside one network.** H1, W5: a Mac home is unreachable from the phone on its own
   Wi-Fi and from the mini beside it. The cheapest, fastest, most private path is the one that
   doesn't exist.
3. **Liveness is guessed, not measured.** No pong deadline on the worker's socket, no sleep notice,
   running sessions killed on any blip (§1.2 P4). A laptop worker that changes networks loses its
   work's live session; the home can't say asleep from lost.
4. **No health per path on Devices.** The person can't see which way a device is connected, whether
   the address answers from outside, or why not (todo.md already names the trigger).
5. **Identity is a bearer token bound to an address.** Tokens are per (device, home), but the
   clients key them by address; a device has no key of its own (D40), so a new address cannot be
   proven to be the same home, and nothing can follow it safely.
6. **China.** No path that is known to work for a person in mainland China whose home is abroad,
   or for Web Push there.
7. **The tunnel carries worker traffic in clear through Cloudflare** (P5, W4), including MCP calls
   and frames from tasks; acceptable for windows (said on the card), surprising for workers.
8. **Local trust** (D57) still open: an SSH tunnel bypasses pairing; other accounts on a shared box
   are trusted.
9. **Two homes and moving the home** have no story.

## 4. General lessons from other multi-device agent systems

(Read in other projects' code; written here only as principles.)

1. **Pick the path per peer, continuously, from several.** Mature systems keep a *set* of ways
   to reach each peer (same network, a private overlay, a relay that always works), start on the one
   that is sure to connect, look for a better one in the background, move when it validates and
   fall back only after repeated misses (anti-flap). The application above never knows which path
   it is on. Ducter has one address, chosen by hand (§3 gap 1).
2. **Identity belongs to a key, never to an address.** Each device holds a long-lived key in the
   operating system's secure store; addresses are only hints. That is what lets a client follow a
   home that moved, or accept a LAN address it just discovered, without being fooled. Ducter's
   bearer token is tied, in every client, to the address it was paired at (§3 gap 5; D40's device
   key is the missing half).
3. **The pairing secret travels out of band and binds the joiner's key.** The QR or link carries a
   secret that the middle (relay, tunnel, proxy) never sees; the joiner proves it by signing its own
   key with it, and the home answers with its own. A short code shown on both sides is for human
   comparison only. Ducter already keeps the code in the link's fragment; it lacks the home's key in
   the link.
4. **Discovery reveals addresses, never trust.** LAN announcements (multicast or DNS-SD) are signed
   and replay-limited, sent on each interface so a VPN route can't swallow them, and only yield a
   candidate; the handshake still decides. Multicast is blocked on guest and isolated Wi-Fi, so it
   is an optimisation, never the only path.
5. **Say sleep out loud; give liveness a deadline.** A computer about to sleep closes its sockets
   with "going away" so peers mark it asleep at once instead of waiting for timeouts; a link with no
   answer to its ping within ~3 intervals is closed and redialled. Ducter's home understands a
   sleep notice no one sends, and its workers ping without a deadline (§1.2 P4).
6. **Bound a relayed queue by delay, not bytes.** Over a TCP relay, a deep queue only adds minutes
   of latency; dropping once the oldest pending write is ~1 s old keeps the link honest. Relevant to
   Ducter only if it ever relays frames itself.
7. **Fail fast to an offline peer, probe gently.** After an explicit "offline", calls fail locally
   and one real probe goes through per window (15 s, doubling to 2 min). Each machine reports its
   own reason (`offline`, `turned off`, `update required`, `unreachable`). Ducter's D157 waiting
   tasks already do the useful half.
8. **Encrypt end to end on every path, and say when a path is not.** A relay or tunnel carries
   ciphertext; an old peer that can't is shown as "not encrypted (old version)". Ducter's
   Cloudflare path decrypts at the edge, said for windows but not for workers (§3 gap 7).
9. **Treat China as its own region from the start.** Overlay VPN apps may be missing from the
   local app store and need an overseas account; a domain on a mainland server needs a filing (a
   short-lived IP certificate is the fallback); STUN and push differ by region, and separate push
   back ends per region are normal.
10. **Show the topology as facts.** One computer in the centre, each peer grouped by how it is
    connected (direct, relayed, offline, needs attention), the round-trip time on the line, motion
    only for real traffic. Ducter's islands already have the geometry; they lack the "how".

Not taken, on purpose: a home-grown UDP transport with its own congestion control (Ducter's
traffic is low-rate, star-shaped and already resumes by cursor; WebSocket over the best available
path is enough); a relay run by the project as the default (D228 rejected it for good reasons);
leaving machine choice wholly to the model (Ducter ranks, D157).

## 5. Proposed design

### 5.1 Who, what they feel, how it starts

- **The heavy developer** (the author: hel in a tailnet, a MacBook doing tasks, a mini at home, a
  phone abroad). Before: one address per home, a re-pair for every change, a laptop that drops its
  running sessions when it changes Wi-Fi, no idea which path anything uses. After: every way to
  reach the home is known to every device; each device takes the best one it can, moves without a
  sound, and Devices says how each one is connected and why one isn't (放心, 顺滑).
- **The consumer** with a Mac at home: before, the phone on the same Wi-Fi can't see Ducter at all
  until a Cloudflare domain exists. After: at home it just works (same network); 从外面连 is only
  for outside, offered when they first leave the house with a question (好用, 惊喜).
- **The fresh user:** never sees a network word. A computer in the same room joins with a code and
  is used directly; nothing to choose.

### 5.2 The design (five parts)

**A. A home has a key and an address book, not one address.**
- At first start the home makes a long-lived key pair (Ed25519), kept 0600 in the data folder (the
  same trust as `devices.db`). Its fingerprint goes into every pairing link (`/pair#c=<code>&k=<fp>`)
  and every welcome.
- The home keeps **ways to reach it**: each entry `{kind: lan|tailnet|domain|tunnel|ssh, url, who:
  everyone|tailnet devices|this network, checked: when, ok}`. Every reach method *adds* an entry
  instead of overwriting `public-url` (that file stays as "the address pairing links lead with").
  The LAN entry is added by the home itself; tailnet, domain and tunnel by `ducter tailscale`,
  `ducter domain`, `ducter anywhere`, or detected (a running tailnet is found, as `ducter pair`
  already does).
- The book is sent to every paired device in its welcome and whenever it changes, so devices learn
  new ways over the connection they already have. Removing a method only removes its entry once no
  device depends on it alone ("2 devices still reach it only this way").

**B. Every device keeps the book and picks its own path.**
- The Mac app, the iPhone and Android shells, the CLI and workers store the home's key and its book
  (not one URL). On start and on every network change (the OS's path monitor), they try the entries
  they can use in parallel, LAN first, then tailnet, domain, tunnel, staggered by ~250 ms
  (happy-eyeballs), and keep the first that proves it is the home (below). While on a worse path
  they re-probe the better ones every 30 s; they leave a working path only after two misses (no
  flapping). The client already resumes by cursor (`conn.ts`), so a switch is a reconnect nobody
  sees.
- **Proving it is the home:** the device sends a nonce; the home signs it with its key. A path that
  can't sign is not the home, whatever its address says. This is what makes a LAN address or a new
  tunnel safe to use without a new pairing.
- **The web page is the exception.** A browser's storage, push and service worker are bound to the
  page's origin (research/21 §3); a web client stays on the origin it was opened at, and the book
  only tells it "this address also works" with a link. Native shells (iPhone, Android, Mac app)
  move freely; the iPhone shell's WebView must then keep its device record outside the page's
  origin storage (in the Keychain, as the token already is).

**C. A path inside one network.**
- The home listens on its LAN addresses too (opt-out), **HTTPS with a certificate made from its own
  key**, and announces itself by DNS-SD (`_ducter._tcp`) with a signed record (fingerprint, port,
  time). Native clients and workers pin the key, so no CA is needed and the code still decides who
  gets in; browsers are never sent there (no trusted certificate). On guest or isolated Wi-Fi the
  announcement doesn't arrive and nothing breaks: the other entries still work.
- Who counts as local is unchanged: a LAN request is remote and needs a token (D54); this lands
  together with D57's local token so loopback stops being special.

**D. Liveness that is measured, and work that survives a blip.**
- Workers and clients close and redial when a ping goes unanswered for 45 s; the home does the same
  per device.
- A Mac that is about to sleep sends `{t:"sleep"}` and closes (the Mac app's worker helper hears the
  system's will-sleep), so its tasks say 睡着了 at once, not 连不上 after 2 min.
- A worker keeps its harness sessions for a grace (2 min) after its socket drops and reattaches
  them on reconnect (the todo "reattaching a session that survived a socket blip"); only after the
  grace does it close and leave the home to resume by id.

**E. Devices shows how, not only whether.**
- Each device's card and the islands' bridges say how it is connected, in plain words (same Wi-Fi,
  your Tailscale network, your domain, your Cloudflare tunnel) and whether that path is encrypted
  all the way; the home's card lists its ways to be reached with up / down / not checked, from the
  home's own outside checks (the tunnel already has one) and from what devices report. New words go
  through the glossary first (change loop); "path" and "relay" never reach the screen.
- When a device can't reach the home it says which ways it tried and the one thing that would fix
  it ("turn Tailscale on", "this phone isn't in your Tailscale network: use your domain instead").

### 5.3 China

- **Same network** works everywhere and is the first fix for a person whose home is a Mac in China.
- **A home in mainland China** with a domain needs a filing for 80/443; the honest fallback is a
  short-lived IP certificate on a public IP, or a tailnet where Tailscale is usable. Evidence is thin:
  none of this was run from China (INFERRED).
- **A home abroad, the phone in China:** Cloudflare's free network and Tailscale are both unreliable
  there (INFERRED, §2.1 H10–H11), and Tailscale's iPhone app is not offered in the mainland App Store
  (DOCUMENTED by another project's own notes; not checked here). The robust path is an entry in the
  book that the person controls and that is reachable from China, for example their own domain on a
  server in Hong Kong or Japan forwarding to the home; a Ducter-shaped version of that (the person's
  own tiny relay that only forwards end-to-end-encrypted frames) is the generalisation of D39's
  Ducter Edge, and waits for a person who needs it (todo).
- **Notifications:** iPhone through the relay keeps working; Android without Google services needs a
  UnifiedPush distributor that doesn't depend on FCM (D181 already allows one).

### 5.4 Two homes, moving the home

Both become possible once a home is a key plus a book: a client holds several homes (each its own
key, book and token) and switches between them; moving the home moves the key with the data, so
every device recognises the new address as the same home and follows it without pairing again.
Neither is proposed for now.

### 5.5 What to build first

1. **Liveness (D, small, no new concept):** the 45 s pong deadline on workers and clients, the
   Mac's sleep notice, and the worker's session grace. Fixes W1/W7 today.
2. **The home's key and address book, and devices that keep the book (A + B, without LAN):** the
   tailnet, the domain and the tunnel stop competing for `public-url`; switching methods stops
   meaning re-pairing; a phone outside the tailnet falls back to the domain by itself. Fixes S1–S3,
   W2, W6.
3. **Devices says how (E):** with the outside check per entry (the todo "status probe per address").
4. **The same-network path (C),** with D57's local token. Fixes H1 at home and W5.
5. **The Mac app's Tailscale chip** (todo, D265) on top of 2.
6. Later, each on its trigger: end-to-end frames for workers over a tunnel, the China path, two
   homes, moving the home.

## Implications for Ducter

1. The current design is coherent for **one home with one address everyone can reach**; it breaks at
   the edges people actually live in: mixed devices, switching methods, a laptop that moves, two
   machines in one room, China.
2. The fix is not another reach method but a change of shape: **a home is a key and a set of ways to
   reach it; every device picks its own way and proves it found the home.** Tailscale, a domain and a
   Cloudflare tunnel then coexist instead of overwriting one another.
3. Liveness needs a deadline and a sleep notice; running work should survive a short drop.
4. Devices should say how each device is connected and why one isn't, in the glossary's words.
5. Order: liveness → key + address book → health on Devices → same-network path → the Mac app's
   Tailscale chip → the rest on their triggers. Each needs its own Dn through the change loop; this
   note decides nothing.

## Summary

Ducter is a star: every window and worker dials the home's one HTTP port at the one address
saved when it paired. Loopback, an own domain (TLS on the home), Tailscale serve (WireGuard + ts.net
TLS) and a Cloudflare tunnel (TLS ends at Cloudflare) all lead to that port, and every request from
them is remote and needs a device token; notifications leave the home outbound and end-to-end
encrypted, so they work whatever the reach method. It works well for a server with one stable
address everyone can reach. It breaks or surprises when a Mac home has nothing set up (not even the
phone on the same Wi-Fi), when two machines sit in the same room, when some devices are in a tailnet
and some are not, when the reach method changes (every device pairs again), when a laptop worker
changes networks (a silent gap and restarted sessions), and in China. The proposal: a home key and
an address book sent to every device, each device racing the ways it can use and proving it found
the home, a same-network path for native clients and workers, measured liveness with a sleep
notice, and Devices that says how each device is connected. Build liveness first, then the key and
the book.
