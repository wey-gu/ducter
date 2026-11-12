# 67: A home with no public address, reached through a Cloudflare tunnel

**Question.** hel (Linux, public IP) is reachable through `ducter domain` (D143). A Mac at home, or
a Linux box behind NAT, is not. Can Ducter give such a home an address from outside with one
tap, for a person who knows nothing about tunnels, without weakening pairing (D54/D57)? Which
path, and how do paired devices keep finding the home when the address changes?

**Method.** Cloudflare's docs; the cloudflared GitHub releases API; and experiments on this Mac
with quick tunnels only (no account), against a scratch echo server (port 17877) and then a
scratch Ducter home (port 47911, its own data folder in the session scratchpad). Nothing was
measured against the author's accounts, `~/.ducter` or `:7777`. Date: 2026-11-12.

Tags: VERIFIED (measured here), DOCUMENTED (the vendor says so), INFERRED (reasoned, not measured).

## 1. The options

### (a) Quick tunnels (trycloudflare.com): no account

- `cloudflared tunnel --url http://127.0.0.1:<port>` asks api.trycloudflare.com for a tunnel and
  prints `https://<four-words>.trycloudflare.com` within ~3–5 s (VERIFIED, three runs: 3 s, 4 s, 5 s).
- No account, no domain (DOCUMENTED: "You do not need a Cloudflare account or domain" [1]).
- **The hostname changes each time the process starts** (DOCUMENTED [1]; VERIFIED: three starts,
  three names). "The URL stops working when you stop the cloudflared process" (DOCUMENTED [1]);
  the old name then answers **530** with Cloudflare's error page (VERIFIED).
- **Limits** (DOCUMENTED [1]): no uptime guarantee; 200 in-flight requests (then 429); **no
  Server-Sent Events**; "for testing and development". VERIFIED: an SSE stream sent one event a
  second and curl received **nothing** in 160 s (Cloudflare buffers it). Ducter uses no SSE
  (`grep event-stream` in core and the web client: none), so this doesn't bite.
- **WebSockets work** (VERIFIED): a socket opened in ~0.5–0.7 s, the subprotocol list
  (`["ducter.v1", "<token>"]`, how the phone sends its device token) arrived intact; a socket
  pinging every 5 s and an idle one both stayed open 260 s against a Bun origin (Bun pings by
  default). Cloudflare closes idle WebSockets after an unstated time and on its own restarts
  (DOCUMENTED [3]); Ducter's clients already reconnect by cursor.
- `--metrics 127.0.0.1:<p>` serves `/quicktunnel` → `{"hostname": …}` and `/ready` →
  `{"status":200,"readyConnections":1,…}` (VERIFIED). That is how Ducter reads the name without
  parsing logs, and how a restarted Ducter recognises the tunnel it left running.
- Quick tunnels run one connection (`ha-connections:1` in its settings line; VERIFIED).
- `--config <file>`: an empty file logs an error and goes on; a file with `no-autoupdate: true`
  is clean (VERIFIED). Ducter passes its own so a `~/.cloudflared/config.yml` the person keeps
  for their own tunnels never applies.
- **DNS lag and negative caching** (VERIFIED, and important for the UX): the name resolved at
  1.1.1.1 about **20 s** after cloudflared printed it. When this Mac's resolver was asked
  *before* that, it cached "no such name" and the address answered only after **80 s**; when it
  was first asked after 1.1.1.1 had it, the address answered at once (27 s from start). So Ducter
  must not touch the new name through the system resolver until public DNS has it: it asks
  DNS-over-HTTPS (`cloudflare-dns.com/dns-query`, JSON) and only then shows the address.
- Quick tunnels can now carry an email check (`--allowed-mail`), but "Email authentication
  requires an interactive browser session. It does not support non-interactive clients"
  (DOCUMENTED [1]): no use for the phone's WebSocket or the Mac app.

### (b) Named tunnels on the person's own Cloudflare account

- A stable hostname, any number of connections, no SSE limit (DOCUMENTED [4]).
- Needs a Cloudflare account **and a zone (a domain) on it**: `<uuid>.cfargotunnel.com` "only
  proxies traffic for DNS records in the same Cloudflare account" (DOCUMENTED [2]); it is a CNAME
  target, not a free public name. So there is no free stable hostname without a domain.
- Two setups: `cloudflared tunnel login` (a browser sign-in, then `tunnel create`, `route dns`),
  or the dashboard (Zero Trust › Networks › Tunnels: create, add a public hostname pointing at
  `http://localhost:7777`, copy the token) and `cloudflared tunnel run --token <T>` (DOCUMENTED
  [4]). The token form needs no files and no login on the home: the right shape for an advanced,
  CLI-only option. Not measured (it needs an account; out of bounds for this report).

### (c) A Ducter-operated hostname (`<name>.ducter.ai` through the project's account)

- Stable and zero-setup for the person, but: (1) TLS ends at Cloudflare under **the project's**
  account, so the project's admins could put a Worker or logging on that zone in front of every
  home: a real trust cost for a self-hosted, open-source tool (INFERRED); (2) free hostnames under
  ducter.ai invite phishing and abuse, and the domain's reputation pays (INFERRED); (3) the
  project would run a tunnel-issuing service with quotas and support (INFERRED; Cloudflare's
  per-account tunnel limits not checked). Not now; recorded in `design/todo.md` with a trigger.

### (d) Alternatives, briefly

- **Tailscale Funnel**: needs a tailnet with MagicDNS and HTTPS, a policy attribute, Tailscale
  ≥ 1.38.3, ports 443/8443/10000 only, a `*.ts.net` name, bandwidth limits you can't set, and on
  macOS the open-source variant of the app (DOCUMENTED [5]). Stable and private-by-design, but
  an account and a VPN client first: the roadmap's community path (D46), not the default.
- **ngrok**: an account and an authtoken for any tunnel; a free static domain per account
  (DOCUMENTED, ngrok's pricing pages; not re-fetched here). Same shape as (b) with another vendor.

## 2. Getting cloudflared (VERIFIED from the GitHub releases API, 2026-11-12)

- Releases: 2026.10.7 (2026-10-30), .6, .5 (2026-10-27) … Ducter pins **2026.10.5** (older than
  two weeks). Assets per platform: `cloudflared-darwin-arm64.tgz` (19.8 MB), `-darwin-amd64.tgz`,
  `cloudflared-linux-amd64` (40.3 MB, a bare binary), `-linux-arm64` (37.7 MB); also .deb/.rpm.
- Checksums: the API's `digest` is the SHA-256 of each asset; the release notes list, for the
  darwin `.tgz`, the SHA-256 **of the binary inside** (VERIFIED: the tgz hashed to the API digest,
  the extracted binary to the notes' value; cloudflared logs its own checksum at start, equal to
  the notes'). Ducter pins both and checks both.
- The macOS binary is signed with the hardened runtime (`codesign -dv`: `flags=0x10000(runtime)`);
  downloaded with `fetch`/curl it carries no quarantine flag and runs without a prompt (VERIFIED).
- Homebrew has `cloudflared` (2026.10.3 on this Mac); Ducter uses one on PATH if present.
- Live, a scratch home with no cloudflared on PATH: one `ducter anywhere on` downloaded,
  checked, unpacked and started it, and had a reachable address in **34.6 s** end to end
  (VERIFIED).

## 3. Running it so the address survives Ducter

- A quick tunnel's name lives as long as the process. Ducter restarts on every update (D148), so
  a tunnel run *inside* Ducter would change address on every update (INFERRED from 1a).
- Ducter therefore starts cloudflared **detached** (its own process group; the Mac app's
  supervisor signals only Ducter's pid) and, on a Linux home under systemd, as its **own
  transient user unit** (`systemd-run --user --unit ducter-anywhere-<port> --collect`), because a
  restart of `ducter.service` kills its whole cgroup (systemd's default KillMode). A starting
  Ducter adopts it when the process is alive, is a cloudflared (`ps -o comm=`, so a reused pid
  after a reboot is never taken), and `/quicktunnel` still names the saved address.
- VERIFIED on the scratch home: Ducter stopped and started → "kept the tunnel from before",
  same address, the phone reconnected by itself. cloudflared killed (a reboot) and Ducter
  started → a new address in 11–16 s, the sealed note left at the relay.
- VERIFIED on a Linux VM home (Ubuntu 24.04, systemd 255, `bun run e2e:linux` step 8): the home
  downloaded and checked linux-arm64 cloudflared, the Mac reached it through Cloudflare with its
  device token (`/api/me` without one: 401), and `systemctl --user restart ducter` kept the
  address, the tunnel's unit `ducter-anywhere-47777` still active.
- Not verified here: whether a quick tunnel keeps its name across a long sleep or network change
  (cloudflared reconnects its connection to the edge by itself; that the name survives is
  INFERRED). Ducter checks itself every ~2.5 min while Cloudflare is connected (`/ready`):
  three failed self-checks through the public address start a fresh tunnel.

## 4. Security: the tunnel only carries what pairing guards

VERIFIED by echoing the headers a request through a quick tunnel brings to the origin:
peer `127.0.0.1`; `host: <name>.trycloudflare.com`; `cf-connecting-ip`, `x-forwarded-for`,
`x-forwarded-proto: https`, `cdn-loop`, `cf-ray`, `cf-ipcountry`, `cf-visitor`, `cf-warp-tag-id`.
Ducter's `isLocalRequest` (auth.ts) counts a request as local only if the peer **and** the Host
are loopback **and** no proxy header is present; here the Host is not loopback and
`cf-connecting-ip`/`x-forwarded-for` are proxy headers, so every request through the tunnel is
remote and needs a device token (unit-tested with these exact headers). On the live home: `/api/me`
401, `/ws` without a token refused, `/app` and `/pair` (public pages) 200, `/health` the bare
`{ok:true}` it gives outsiders. Pairing codes are rate limited per caller (the last
`x-forwarded-for` hop from a loopback proxy). Cloudflare sees the traffic in clear (TLS ends at its
edge), as with any Cloudflare-proxied site: said in the detail, never hidden.

## 5. Following a moving address

Measured on the scratch home with the phone client in Safari on the iOS Simulator (iPhone 17,
iOS 26.3), and the address relay (`apps/site/api/addr`) run locally behind its own quick tunnel
(a page on https can't call `http://127.0.0.1`: mixed content, VERIFIED: no request arrived):

- Paired over the tunnel by the QR link; the device showed `connected: true` (WebSocket through
  the tunnel).
- Home restarted, tunnel kept: same address; the phone reconnected on its own.
- "Reboot" (cloudflared killed, Ducter started): new address 16 s later; the open page asked the
  relay, checked `/.well-known/ducter-anywhere` at the new address, and moved there with its
  pairing in the fragment; **connected again 29 s after the restart, untouched**, same device id.
- The old address reopened later (a bookmark, a home-screen icon): Cloudflare's 530 → the
  service worker asked the relay and redirected to the new address, still paired (VERIFIED).
- Found and fixed on the way: the page asked the relay once, before the home had left its note;
  it now asks again every 20 s while away. A restarted home with a changed relay re-leaves its
  note.

## Implications for Ducter

1. Default: **a quick tunnel, one tap, no account**; the honest caveat is one line ("the address
   changes when this computer restarts; your devices follow on their own").
2. cloudflared lives beside Ducter (detached, or its own systemd user unit) and is adopted by
   address, so updates don't move the address; only a reboot or a lost tunnel does.
3. Paired devices follow through a **sealed note at an address relay** run with the push relay
   (D159's pattern: a random id, AES-GCM under a key only the home and its devices hold; the relay
   can neither read nor forge an address).
4. Never touch the new name through the system resolver before public DNS has it (DoH first).
5. Stable addresses stay available: the person's own domain (D143) or their own named tunnel
   (`--token`, `--address`), both shown as already on.
6. A Ducter-run hostname (c) is deferred: it trades the project's trust and abuse exposure for a
   stability the relay already mostly gives.

## Summary

Quick tunnels give a no-account HTTPS address in seconds; WebSockets work, SSE doesn't (unused),
and the name dies with the process. Running cloudflared beside Ducter keeps the name across
updates; a sealed note at a tiny relay lets the phone, the apps and the Mac app follow it across
reboots without pairing again (measured: 29 s, no touch). Requests through the tunnel are remote
by Ducter's own rule, so pairing still guards everything.

## Sources

1. Cloudflare, "Quick Tunnels (TryCloudflare)", developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/ (fetched 2026-11-12).
2. Cloudflare, "DNS records" for tunnels, …/cloudflare-tunnel/routing-to-tunnel/dns/ (fetched 2026-11-12).
3. Cloudflare, "WebSockets", developers.cloudflare.com/network/websockets/ (fetched 2026-11-12).
4. Cloudflare, "Create a tunnel (dashboard / API)", …/cloudflare-tunnel/get-started/ (DOCUMENTED from the same doc set; not re-measured).
5. Tailscale, "Tailscale Funnel", tailscale.com/kb/1223/funnel (fetched 2026-11-12).
6. GitHub API, `repos/cloudflare/cloudflared/releases` and `releases/tags/2026.10.5` (2026-11-12).
