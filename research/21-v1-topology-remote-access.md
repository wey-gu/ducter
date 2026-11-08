# 21 — V1 topology: CF Worker deploy target and reaching the main process from anywhere

Date: 2026-11-08. Inputs: `docs/roadmap.md` (D34), `docs/design/system.md` §Storage and topology,
`docs/principles.md` 15–19, `research/04` §3–4.

Legend: **[V]** verified in this session (URL or local command given). **[I]** inferred, my judgment, or
prior knowledge not re-checked today.

**Bottom line.**
1. **No full CF Worker/DO control-plane target in v1.** It needs a second storage backend, and DO SQLite
   cannot load the CJK tokenizer or vectors that `memory.md` needs. It also splits the main AI loop across
   a network boundary. The gain is small, because the main AI still needs an awake machine to think. It
   moves to v1.x behind the storage port, as the roadmap already allows.
2. **Ship one small, optional CF piece in v1: the Ducter Edge.** It is a Worker plus one relay DO,
   deployed to the user's own `*.workers.dev`. It serves the web client and pipes WebSockets between the
   phone and the main process, which dials out. That gives a stable HTTPS origin with no domain, for $0,
   in about 3 user steps, for a Mac behind NAT and a VPS alike. A stable origin is what makes PWA
   install, Web Push and passkeys work.
3. **The DeepAgent question.** Abacus.AI DeepAgent has no remote-access tunnel; it is cloud SaaS. The
   product that works like Mem's "Access Anywhere" is **DeepSeek Harness (dsh) Desktop**. Both wrap a
   Cloudflare quick or named tunnel. The Ducter Edge is more convenient than either free path: it has a
   stable URL without a domain or a paid plan.

---

## 1. Nowledge Mem "Access Anywhere"

Source: https://mem.nowledge.co/docs/remote-access and /docs/sync [V]. Local: `nmem 0.10.116` [V].

- **Mechanism [V].** A Cloudflare Tunnel from the local Mem server (`http://127.0.0.1:14242`) to the
  internet. Mem bundles its own `cloudflared` (also in the Docker image). Three link types:
  - *Temporary link*: a quick tunnel, random `*.trycloudflare.com`. "Changes every time Access Anywhere
    or Mem restarts"; the docs say it is for trials only. No account, no domain.
  - *Cloudflare account*: the user creates a named tunnel in Zero Trust, copies its token, adds a
    hostname route to `127.0.0.1:14242`, then pastes the URL and token into Mem. Needs a domain on
    Cloudflare DNS.
  - *Nowledge Link* (Plus/Max plan): "Mem creates the stable link for you" at `*.nowledge-mem.com`.
    The docs don't say how it is routed. It is probably a named tunnel on Nowledge's own zone [I].
- **Auth [V].** One API key for every remote request (`Authorization: Bearer`, or `X-NMEM-API-Key`).
  Localhost is exempt unless "Require API key on localhost" is on. Rotating the key kills the old key and
  any unused login link. `nmem key [--rotate] [--show-login] [--qr]` prints the key, a web-app login URL
  that embeds the key, and a terminal QR (`nmem key --help`) [V]. `nmem connect <link>` redeems a
  one-time `?nmem_connect=<token>` link on another machine [V].
- **Lifecycle [V].** `nmem remote-access status|start|stop`: "Show tunnel health, suspension and
  transport", "Start the tunnel after repairing the network; clears the failure breaker". These
  commands work only against a loopback URL; run here, status returned "requires a loopback server
  root URL". The tunnel reconnects on app restart until Stop. If UDP/QUIC is blocked, it falls back to
  HTTP/2 (`TUNNEL_TRANSPORT_PROTOCOL=http2`).
- **Clients [V].** Web app at `<url>/app` (enter the API key; "save to home screen"); iOS TestFlight
  and Android APK apps (alpha; URL + key); the CLI and other agents via `nmem config client set --url
  --api-key`.
- **Setup UX.** Desktop: Settings → Access Anywhere → (enable LAN, which mints the key) → pick a link
  type → Start → copy URL and key. Temporary link: about 3 clicks. Own domain: about 8 steps in the
  Cloudflare dashboard. Nowledge Link: about 2 clicks plus a subscription.
- **Lessons for Ducter [I].**
  - A bearer key per server is simple, but it is all-or-nothing and can't be revoked per device.
  - The free path gives an unstable URL, which breaks home-screen installs and push.
  - The convenient stable path costs money or a domain.

## 2. "DeepAgent"

- **Abacus.AI DeepAgent** has been renamed "Abacus AI Agent" (https://abacus.ai/help/chatllm-ai-super-assistant/deepagent,
  via search). It is a cloud agent at `deepagent.abacus.ai`. Abacus AI Desktop
  (https://desktop.abacus.ai/desktop_faq) has a Terminal/CLI, a Code Editor, Chat, CoWork ("secure,
  isolated environment on your machine") and a meeting Listener. **Neither the FAQ nor the Platform
  Updates page mentions remote access, a tunnel, or phone control** [V, read first 100k of 108k chars
  of https://abacus.ai/help/platform-updates]. Mobile access means the ChatLLM mobile app and voice agents
  talking to the *cloud* agent. It is "accessible anywhere" because it is SaaS, which a self-deployed
  product can't copy. **Not comparable to Mem.**
- **DeepSeek Harness (dsh) Desktop: the likely intended product.** It has "Mobile remote access"
  (https://dshtauri.mintlify.app/en/guides/mobile-remote-access) [V]:
  - Share → *LAN* or *Public tunnel*. Quick mode gives a random domain with no account. Named mode
    takes a tunnel token, a public hostname and a Cloudflare route. Same split as Mem.
  - Sharing turns on auth. A **temporary pairing code lasts 5 minutes and rotates after each use**;
    "paired devices keep their authorization long-term". There is an optional permanent access code
    and a "Revoke paired access" action that clears all grants and sessions.
  - Warnings: "Remote access is not read-only"; "never expose an unauthenticated service"; the computer
    must stay awake. Phone side: a QR or link in any browser, or DSH Mobile (APK/TestFlight). The docs
    don't mention a PWA or push.
  - Community plugins do the same with a cloudflared quick tunnel plus a token in the QR code
    (https://github.com/Raiyan007-gb/dsh-remote-tunnel-easy, `dsh-phone-remote`) [V via search].
- **Verdict.** dsh works like Mem (a Cloudflare tunnel), with a better auth model: per-device pairing
  that can be revoked. That auth model is worth copying. Neither has a free, stable, no-domain path.
  (LangChain `deepagents` is a library with no remote-access feature [I, not checked].)

## 3. Survey: reaching a self-hosted web UI + WebSocket from a phone

The constraint that decides most of this: **Web Push, the service worker, the PWA install and passkeys
are all bound to the page's origin** (passkeys use RP ID = hostname) [I, standard Web platform
behaviour]. If the URL changes, the user reinstalls the PWA, re-subscribes to push and re-enrolls
passkeys. **So a stable HTTPS hostname is a hard requirement.** Push *delivery* doesn't need the origin
to be reachable: the main process POSTs to Apple's or Google's push endpoint, outbound [I].

| Option | Steps (user) | Domain? | Auth | Cost | Mac behind NAT | Phone browser | Stable origin / push | Notes |
|---|---|---|---|---|---|---|---|---|
| **CF quick tunnel** | 1 (auto) | no | none; Ducter must add its own | $0 | yes, outbound | any | **no**: random URL per restart | 200 in-flight requests, **no SSE**, "no uptime guarantee" [V trycloudflare docs]; WS works [I]. Good for a 1-minute demo only. |
| **CF named tunnel** | ~6–8 (dashboard), ~3 if Ducter drives the CF API with a token | **yes** (zone on CF, about $10/yr) | Ducter auth; optional CF Access (free under 50 users, email OTP / GitHub / Google [V cloudflare.com/products/cloudflare-access via search]) | $0 + domain | yes | any | yes | WS supported [I]. CF Access in front breaks non-browser clients unless they carry service tokens [V policies doc]. |
| **Tailscale tailnet + `serve`** | ~5 (install on main and phone, log in both, `tailscale serve`) | no (`*.ts.net`) | WireGuard identity; only tailnet devices reach it | $0 personal | yes (DERP fallback) | **needs the Tailscale app as a VPN on the phone** | yes (ts.net HTTPS cert) | Most secure. VPN-on-phone friction, and it conflicts with other VPNs. Push works (delivery bypasses the tailnet) [I]. |
| **Tailscale Funnel** | ~4 + policy-file edit | no (`*.ts.net`) | **public**: Ducter must authenticate | $0, "non-configurable bandwidth limits" | yes | any | yes | Ports 443/8443/10000, TLS only, needs MagicDNS + HTTPS + `funnel` node attribute [V kb/1223]. |
| **ngrok** | ~3 | no (1 free dev domain) | Ducter, or ngrok OAuth (3 MAU free) | free: 1 GB/mo, 20k req/mo, **interstitial page on HTML**; $10/mo Hobbyist removes it [V ngrok.com/pricing] | yes | interstitial breaks PWA UX on free | yes (dev domain) | Free caps are too tight for streaming. |
| **zrok (NetFoundry)** | ~3 | no | zrok private shares or Ducter | hosted free tier, about 5 GB/day, interstitial until a card is added [V netfoundry docs via search] | yes | any | reserved share = stable | OpenZiti underneath; can be self-hosted. |
| **Pinggy** | 1 (ssh) | no | Ducter | free tunnels die at **60 min** with a new domain [V via search] | yes | any | no on free | Dev-only. |
| **bore** | 1 | no | none | $0 (self-host the server) | yes | **TCP only, no TLS** [I] | no | Unsuitable. |
| **frp** | ~6 (rent a VPS, run frps, TLS, DNS) | effectively yes | Ducter | VPS cost | yes | any | yes | Makes sense only if a VPS exists, and then the VPS should *be* the main process. |
| **VPS public IP + Caddy** | ~3 | yes (or sslip.io-style, rate-limit risk [I]) | Ducter | $0 extra | n/a | any | yes | Direct and lowest latency. |
| **Ducter Edge** (own `workers.dev` Worker + relay DO) | **~3** (CF account, `wrangler login` OAuth, Ducter deploys) | **no** | Ducter device keys + passkeys; the relay only checks a relay token | **$0** on the free plan (§4.3) | yes, outbound WSS | any | **yes**, `ducter.<sub>.workers.dev` | Design follows the reference app's relay (research/04 §2). `workers.dev` is unreliable from mainland China [I]; fall back to a named tunnel or Tailscale there. |
| **Ducter-hosted relay** (like Nowledge Link) | 1–2 | no | E2E needed (operator sees traffic) | Ducter pays | yes | any | yes | Most convenient, but the project would run infrastructure, and users would trust it with traffic; it serves the JS, so it could serve different JS. Later, maybe paid. |

Latency [I]: tunnels and the relay add one edge hop, about 10–60 ms per frame. That is negligible
against LLM turn latency (seconds). Tailscale direct is about LAN RTT; through DERP it is similar to a
relay.

Reliability [I]: CF named tunnels and Tailscale are production-grade. Quick tunnels, Pinggy free and
ngrok free are not. In every option the Mac must be awake (principle 19: compute sleeps, so the web
client shows "main process offline").

## 4. CF Worker / Durable Object as a v1 deploy target

### 4.1 What could run where
Fixed by architecture: the main AI's *thinking* is a harness turn (Claude Code/Codex via OAR, with
subprocesses), which can't run in a Worker (research/04 §1 gap 5). So the "full CF" split would be:

| Component | Full-CF variant | Main-process variant (D34 default) |
|---|---|---|
| Log, waiters, registry, intents, push fan-out | DO SQLite per persona | `bun:sqlite` in the main process |
| Main AI loop (projection, digest, recall, turn) | **split**: control logic in the DO, harness turn on a runner | one process |
| Main AI harness | a runner (Mac/VPS) | same machine |
| Web client + relay | Worker static assets + DO | main process (+ optional Edge) |

### 4.2 Does the split break principles? [I]
- **Turn latency.** It adds 1–2 WAN round trips per turn: DO → runner prompt, then runner → DO records.
  That is about 50–150 ms against multi-second turns. Not a blocker.
- **Cache warmth (principles 3, 15).** Unaffected. The harness session lives on the runner either way,
  and the prefix is built from the same L1–L4 bytes.
- **Principle 19 favours full CF.** Waiters fire and push goes out while the Mac sleeps. **But the value
  is thin:** a fired waiter whose handler needs the main AI still has to wait for a runner. The only gain
  is a "Mac is asleep, N things waiting" push and deterministic (non-semantic) waiter actions.
- **Real costs.**
  1. Two storage backends from day one. The port design allows it, but each needs its own tests and
     migrations.
  2. DO SQLite supports only FTS5, JSON and math "a subset of SQLite extensions"
     [V https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/]. It has no loadable
     **CJK tokenizer** and **no vectors**, so recall needs Vectorize plus a different tokenizer path. That
     is a third difference.
  3. The main AI's projection and recall reads cross the network, or run in the DO under CPU limits.
     The free plan allows 10 ms CPU per Worker request [V workers/platform/limits]; DO default is 30 s.
  4. Worker-to-runner arbitration and offline handling.
  5. Self-deploy friction for the full target: a `wrangler` deploy, plus R2 for blobs.

  Estimate: +2–4 weeks on v1 and a permanent double-implementation tax [I].
- **Cost.** Free plan feasible for one user if deltas are coalesced (research/04 §3: 100k req/day, 100k
  rows written/day is the tight one). $5/mo Paid removes the worry.

### 4.3 The minimal CF piece: Ducter Edge (relay + static client), recommended for v1
- **Worker** on `ducter.<sub>.workers.dev`. It serves the web client as Workers Static Assets (static
  requests are free and don't count against Worker requests [I, per Static Assets billing docs]),
  `manifest.webmanifest` and the service worker.
- **One relay DO per installation.** The main process dials **in** to it over WSS: outbound from the
  Mac/VPS, inbound to the DO, so `acceptWebSocket()` hibernation applies. Phones dial in too. The DO pipes
  frames by device ID. It stores nothing but routing state and a few-KB attachment per socket. Optional
  DO alarm: if the main process has been gone for more than N minutes, send a single "Ducter is offline"
  Web Push.
- **Free-plan budget [I, from research/04 §3 pricing].** A WS connect is 1 request; incoming messages
  bill at 20:1. A heavy day of ~100k relayed frames (250 ms coalescing) is about 5k request-units, far
  under 100k/day. Duration: 13,000 GB-s/day ≈ 28 DO-hours awake at 128 MB, and hibernation means only
  frame handling counts.
- **Size.** About 300–600 LOC TS plus one `ducter edge deploy` command (uses `wrangler` OAuth or an API
  token). Zero coupling to the storage port. It is **also the seed of the v1.x full-CF target**: the same
  Worker later gains a persona DO.
- **Trust.** It runs on the user's own CF account, so the relay operator is the user. Device auth is
  end-to-end between the phone's key and the main process, so the relay can't impersonate a device. The
  Edge serves the JS, so E2E payload encryption adds little and is deferred.

## 5. Recommended v1 remote-access design

### 5.1 Default paths
- **(a) Main process on a VPS with a public IP.**
  - Default: **Ducter Edge**, same as the Mac path. One code path, no domain, no open inbound port, and
    it survives moving from the VPS to a Mac.
  - Option: `ducter serve --domain d.example.com` with built-in ACME (Caddy-style) for users with a
    domain. Lowest latency.
  - Option: a CF named tunnel when the domain is already on CF.
- **(b) Main process on a Mac at home.**
  - Default: **Ducter Edge** (outbound WSS; NAT and sleep friendly; reconnect resumes from the `seq`
    cursor).
  - Privacy-max alternative: **Tailscale `serve`** (tailnet-only, ts.net HTTPS). Ducter detects
    `tailscale status` and offers it.
  - Fallback where workers.dev is blocked: a named tunnel with the user's domain.
  - Quick tunnel only as a "try it in 30 s" preview, labelled unstable (no PWA, no push).
- **LAN** is always on (`http://<mac>.local`) for the desktop client. The phone uses the stable origin
  even at home, so its install, push and passkey stay valid.

### 5.2 Pairing and auth (copy the dsh/the reference app model, not Mem's single key)
1. The main process holds an Ed25519 **installation key**. The Edge knows the installation's public key
   and a relay token.
2. On desktop or in the terminal: `ducter pair` shows a QR code and an 8-character code. The QR encodes
   `https://<origin>/pair#c=<one-time code>&k=<install pk fingerprint>`; the code is valid 5–10 min and
   single-use, like dsh's 5-min rotating code.
3. The phone opens the link. The web client creates a **non-extractable WebCrypto P-256 device key**
   (IndexedDB) and registers a **passkey** (WebAuthn, RP ID = the stable hostname). The main process
   records the device after verifying the code.
4. Each WS session: the main process sends a challenge, and the device signs it with its device key.
   The passkey is needed only for step-up actions (approve a high-stakes intent per principle 18, add a
   device, rotate keys) and to re-enroll if IndexedDB is wiped. With biometrics on iOS and Android, this
   gives "no password, ever" [I].
5. A device list with per-device revoke, plus "revoke all" (dsh has this; Mem's single key doesn't).
   Runner enrollment stays as in `system.md` (machine key + code/QR approval) and travels over the
   same Edge.

### 5.3 Push to the phone web client
- The main process holds **VAPID** keys and sends standard Web Push directly to the push endpoint,
  outbound. The Edge is not involved, except for the optional offline alarm.
- **iOS** (WebKit, https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/ [V]):
  - iOS/iPadOS **16.4+**, and **the app must be added to the Home Screen**;
  - the manifest's `display` must be `standalone` or `fullscreen`;
  - the permission request must come from a user gesture;
  - delivery goes via APNs, with **no Apple Developer account needed**;
  - allow `*.push.apple.com`.
  So onboarding needs an explicit "Add to Home Screen → Enable notifications" step on iOS. Android
  Chrome can push from a plain tab [I].
- iOS kills sockets of a backgrounded PWA [I]. Push is the only background channel, so the client must
  resume from its `seq` cursor on foreground. Use WS, not SSE (quick tunnels also lack SSE [V]).

### 5.4 Onboarding step count (Mac, Edge default)
1. Install Ducter (desktop app or one-liner).
2. "Access anywhere" → **Sign in to Cloudflare** (OAuth in the browser; create a free account if
   needed, no card or domain). Ducter deploys the Edge and claims a workers.dev subdomain via the API.
3. Scan the QR with the phone → passkey prompt (Face ID).
4. iOS only: Share → Add to Home Screen → open → "Enable notifications".

That is 3 steps (4 on iOS), compared with Mem's ~8 for a stable free link and dsh's ~8 for a named
tunnel. Tailscale path: install Tailscale on Mac and phone, log in to both, toggle in Ducter, scan the
QR. About 5 steps, plus the VPN stays on.

### 5.5 Decisions to record
- D34 addendum: **no full-CF target in v1. Ducter Edge (relay + static web client on the user's own
  workers.dev) is the default remote path. Tailscale serve, a named tunnel and direct HTTPS are the
  alternatives.** The full-CF control plane is v1.x, growing out of the Edge Worker.
- The stable origin is a product invariant. Never default to a URL that changes.
- Revisit a Ducter-hosted relay (the zero-account path, like Nowledge Link) after v1, only with E2E
  and a funding model.

## Open questions
1. Measure the Edge's request-units and DO-seconds per active hour (staging) before promising "free".
2. Can `wrangler` OAuth be driven headlessly from a VPS (device-code style), or is an API token
   needed there? [I: token]
3. Is WebSocket upgrade through Workers VPC / tunnel bindings supported? If yes, the Edge could proxy
   HTTP to a named tunnel without the main process's own WS client. No official doc found [V: absent in
   search].
4. Passkey RP-ID migration when a user later moves from workers.dev to their own domain: re-enroll via
   the device key (acceptable).

## Sources
- https://mem.nowledge.co/docs/remote-access , https://mem.nowledge.co/docs/sync ; local `nmem remote-access --help`, `nmem key --help`, `nmem connect --help` (0.10.116)
- https://dshtauri.mintlify.app/en/guides/mobile-remote-access ; https://github.com/Raiyan007-gb/dsh-remote-tunnel-easy
- https://desktop.abacus.ai/desktop_faq ; https://abacus.ai/help/platform-updates ; https://abacus.ai/help/chatllm-ai-super-assistant/deepagent
- https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/
- https://developers.cloudflare.com/cloudflare-one/access-controls/policies/ ; https://www.cloudflare.com/products/cloudflare-access
- https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/ ; https://developers.cloudflare.com/workers/platform/limits/ ; https://developers.cloudflare.com/workers-vpc
- https://tailscale.com/kb/1223/funnel ; https://ngrok.com/pricing ; https://netfoundry.io/docs/zrok/myzrok/limits ; https://pinggy.io/blog/best_cloudflare_tunnel_alternatives/
- https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- research/04 §2 (the reference app relay and pairing), §3 (DO pricing, hibernation)
