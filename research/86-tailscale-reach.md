# 86. Reaching a server through Tailscale (`tailscale serve`)

**Question.** Many people run their servers only inside a Tailscale tailnet: no public IP in
use, no open ports, no domain. Ducter's server path assumed the public internet (an A record,
80/443 open, `ducter domain`), with an SSH tunnel as the only way around it. Can `tailscale
serve` be a first-class way for a phone and a Mac to reach a Ducter on such a server, and what
does Ducter have to check?

**Sources.** Tailscale's source, cloned read-only at `9ad2a96` (2026-11-15, `main`), and its
knowledge base. No `tailscale` command that changes state was run for this note; there was no
real tailnet run.

## 1. The commands

- **Serve in the background, HTTPS on 443, to a local port:**
  `tailscale serve --bg --https=443 http://127.0.0.1:7777`. `--bg` keeps it after the
  command exits and across restarts until turned off; `--https` is the default mode and 443 its
  default port. VERIFIED: `cmd/tailscale/cli/serve_v2.go` (flag `https`, "Expose an HTTPS
  server at the specified port (default mode)"; usage examples `tailscale serve --bg 3000`).
  DOCUMENTED: <https://tailscale.com/kb/1242/tailscale-serve> ("runs persistently in the
  background until you disable it").
- **Turn it off:** the original flags with `off` at the end, the target optional:
  `tailscale serve --https=443 off`. VERIFIED: `serve_v2.go` (`turnOff := … args[len(args)-1]
  == "off"`; "If there is "off", target is optional"). DOCUMENTED: kb/1242
  (`sudo tailscale serve --https=443 /home/alice/blog/index.html off`).
- **What is served now:** `tailscale serve status --json` prints the `ipn.ServeConfig`:
  `Web["<name>:443"].Handlers["/"].Proxy` holds the target (`http://127.0.0.1:7777`).
  VERIFIED: `ipn/serve.go` (`ServeConfig.Web map[HostPort]*WebServerConfig`,
  `WebServerConfig.Handlers`, `HTTPHandler.Proxy`).
- **This machine's name and whether it can get a certificate:** `tailscale status --json`:
  `BackendState` (`Running`, `NeedsLogin`, `Stopped`, …), `Self.DNSName`
  (`hel.tail1234.ts.net.`, trailing dot), `CertDomains` (names the control plane will help
  certify; empty when HTTPS Certificates is off), `CurrentTailnet.MagicDNSEnabled`. VERIFIED:
  `ipn/ipnstate/ipnstate.go`.

## 2. Permissions

A non-root user who isn't Tailscale's operator gets "access denied" from `serve`, and the CLI
appends: "Use 'sudo tailscale …'. To not require root, use 'sudo tailscale set
--operator=$USER' once." VERIFIED: `cmd/tailscale/cli/cli.go:169`. Serving a path or a Unix
socket needs root even for the operator (`serve_v2.go`); a proxy to a local port doesn't.
`tailscale status --json` needs no operator. INFERRED from the same code: reading status goes
through the read-only LocalAPI path.

## 3. HTTPS needs two switches in the admin console

HTTPS on a `ts.net` name needs **MagicDNS** and **HTTPS Certificates** on, on the DNS page of
the admin console (<https://login.tailscale.com/admin/dns>); the page warns that machine names
and the tailnet name are published in Certificate Transparency logs. DOCUMENTED:
<https://tailscale.com/kb/1153/enabling-https>. When they are off, `tailscale serve` for HTTPS
runs an interactive "enable the feature" flow: it prints a URL and, when the control plane says
so, **blocks until the feature is enabled** (`enableFeatureInteractive`, `serve_legacy.go`;
called from `serve_v2.go` for `serveTypeHTTPS`). VERIFIED. So a script must check
`CertDomains` first and say where to switch it on, rather than run `serve` and hang. The first
request to the name fetches the certificate; INFERRED (from `ipn/ipnlocal/cert.go` doing ACME on
demand): a few seconds on first use, then cached.

## 4. What Ducter sees from a served request

`tailscale serve` is a Go `httputil.ReverseProxy` inside tailscaled, connecting from loopback.
Per request it: keeps the incoming `Host` (`r.Out.Host = r.In.Host`, the ts.net name, for a
TCP target); sets `X-Forwarded-Host`, `X-Forwarded-Proto: https` and `X-Forwarded-For` (the
peer's tailnet IP) (`addProxyForwardedHeaders`); strips any incoming `Tailscale-User-*` and,
for a user's device (not a tagged node), sets `Tailscale-User-Login`, `Tailscale-User-Name`,
`Tailscale-User-Profile-Pic` (`addTailscaleIdentityHeaders`). VERIFIED:
`ipn/ipnlocal/serve.go:1006-1011, 1149-1190`.

Ducter's "who is local" rule (`packages/core/src/auth.ts` `isLocalRequest`, `design/system.md`)
needs a loopback peer **and** a loopback `Host` **and** no proxy header. A served request has a
loopback peer but fails the other two several times over (the ts.net `Host`, `X-Forwarded-*`,
and `tailscale-user-login`, already in `PROXY_HEADERS`), so it is remote and needs a paired
device. VERIFIED: a test in
`packages/core/test/auth.test.ts` with those headers. The pairing rate limit keys on the last
`X-Forwarded-For` hop from a loopback peer: the tailnet IP of the caller (VERIFIED by reading
`rateKey`). The web client's same-origin check compares `Origin`'s host with `Host`; since serve
keeps `Host`, a page at `https://<name>.ts.net` passes (VERIFIED by reading `web.ts`
`sameOrigin`). WebSocket upgrades: Go's ReverseProxy passes `Upgrade` through (DOCUMENTED in
Go's `net/http/httputil` since 1.12); no live run here.

## 5. Clients and push

- The Mac app's connect card (`apps/desktop/internal/remote/remote.go` `Parse`) takes any
  host, adds `https://` to a non-loopback one, and keeps the code from a pasted link. VERIFIED:
  two `ts.net` cases added to `remote_test.go`. The iPhone app's parser (`apps/ios/Ducter/
  Store.swift`) accepts any http(s) host (read, not run). The web client is served by the home
  itself, so its address is whatever it was opened at.
- The phone has to be in the same tailnet (the Tailscale app on, signed in to the same
  account or shared the machine). That is the one thing a user has to know.
- **Notifications still work.** iPhone pushes go out from the home to the notification relay
  (`https://ducter.ai/api/push`) and on to Apple; Web Push goes out from the home to the
  browser's push service (`design/system.md` "Notifications to the iPhone app";
  `packages/core/src/push-relay.ts`, `push.ts`). Both are outbound from the server, so a
  server with no inbound ports still notifies. INFERRED from the code paths; not run on a
  tailnet-only server.

## 6. Similar private networks

Funnel (`tailscale funnel`) makes the same name public; that is not what a "no public ports"
user wants and is left out. Headscale (a self-hosted control server) speaks the same client,
so `tailscale serve` works when its server issues certificates; INFERRED, not checked. Other
overlays (ZeroTier, NetBird, WireGuard by hand) have no built-in HTTPS proxy with certificates;
there the person saves `https://…` they set up themselves in `~/.ducter/public-url`, as with a
web server they already run.

## Implications for Ducter

1. A one-command path, `ducter tailscale`, like `ducter domain`: find the CLI (PATH, or
   `/Applications/Tailscale.app/Contents/MacOS/Tailscale`), read `status --json`, require
   `Running`, check `CertDomains` contains `Self.DNSName` before serving (else the admin
   console's DNS page), refuse a 443 that serves something else, `serve --bg --https=443
   http://127.0.0.1:<port>`, print `sudo tailscale set --operator=$USER` on access denied, wait
   for `/health`, save `https://<name>` to `public-url`, pair. `--remove` turns 443 off only
   when it is Ducter's and clears only a `ts.net` address.
2. A server cannot always open its own ts.net name (a host with `--accept-dns=false`); serve is
   on regardless, so that is a warning, not a failure. A 502 behind it is a failure.
3. No new trust: tailnet identity adds to pairing, never replaces it.
4. The server's "what's next" must not assume a public IP: lead with Tailscale when the
   machine is already in a tailnet, else list a domain and Tailscale side by side, then the SSH
   tunnel.

## Summary

`tailscale serve --bg --https=443 http://127.0.0.1:7777` gives a Ducter on a tailnet-only
server a stable HTTPS address that only the person's own devices can open, with no domain and
no open port. Its requests carry the ts.net `Host`, `X-Forwarded-For` and
`Tailscale-User-Login`, so Ducter already treats them as remote and still asks for a code. The
traps are the admin-console switches (MagicDNS, HTTPS Certificates) that would make `serve`
block, and the operator permission; both are checked and named before anything changes. Pushes
are outbound and keep working. Not checked: a live run on a real tailnet.
