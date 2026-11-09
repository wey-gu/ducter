---
name: ducter-deploy
description: Install, deploy, connect, upgrade or cleanly reinstall Ducter (a self-hosted personal AI) for a user, on a Mac or a Linux server/VPS (Hetzner, DigitalOcean, AWS…). Use when the user asks to set up, deploy, host, move, pair or reinstall Ducter, put it on a server or domain, connect their Mac or phone to it, or add a computer as a worker.
---

# Deploy Ducter

Ducter is a personal AI the user runs on their own computers. You install it, give it an address,
and connect the user's devices. Prefer `--json` outputs and exit codes over reading prose. Every
command below says how to check it worked; when one fails, its output names the next command:
run that instead of improvising.

## What runs where (read before any command)

```
   Mac app · phone (browser / iPhone app) · ducter CLI        <- clients
                    |  https://<domain>  (or an SSH tunnel)
             Caddy :443  (the edge: HTTPS, proxies to 127.0.0.1:7777)
                    |
   THE HOME: core = partner, the Log, tasks, ~/.ducter (data + keys)   <- exactly one per person
                    |  workers dial OUT to the home
   Workers: other computers that only do tasks (ducter worker <address> --code …)
```

1. **The home.** Exactly one per person: the core (conversation, the Log, tasks, settings, keys in
   `~/.ducter`) runs on ONE machine, the user's Mac or a server. Never run two homes on the same
   data, and never install a second home to "move" it: moving is a deliberate migration (history
   doesn't move yet; a new home starts fresh).
2. **Clients.** The Mac app (runs the home itself, or connects to a home elsewhere with a pair
   code), the phone (browser, or the iPhone app in TestFlight beta, through the public https
   address), and the `ducter` CLI (talks to the home on this machine; `--port` / `--data-dir`
   pick another).
3. **Workers.** Other computers that only DO tasks for the home: `ducter worker <address> --code
   <code>`. They keep no data of their own beyond task worktrees.
4. **AI agents (harnesses).** Claude Code / Codex (also pi, DeepSeek Harness) must be installed
   AND signed in on every machine that runs the partner or tasks: the home and each worker. On a
   headless server: `claude auth login` / `codex login --device-auth` (a link to open on any
   device), or a token in `~/.ducter/keys.env`.
5. **The edge.** Caddy (or a proxy the user already runs) terminates HTTPS on 443 and forwards to
   `127.0.0.1:7777`. Ducter never listens publicly; never open port 7777.
6. **Outside services.** OpenConnector/oo (accounts), Nowledge Mem (memory), push (APNs, Web Push)
   are outbound only. No inbound ports for them.

### Pick the topology

| Situation | Home | Commands |
|---|---|---|
| Mac only | the Mac | `curl -fsSL https://ducter.ai/install.sh \| sh` (app + CLI) |
| Server as home; Mac and phone as clients | server | server: one-liner `--service`, `ducter domain <name>`; Mac app: Settings › Connect to a Ducter on another computer (or first run: My Ducter is on another computer), address + code |
| Mac as home; server as a worker (a cloud computer) | Mac | Mac needs a public address first (`ducter domain` on the Mac with 80/443 forwarded, or a home on a server instead); server: `ducter worker <address> --code <code>` then `ducter service install --worker` |
| Server is the home AND does the tasks (one box) | server | same as "server as home"; tasks run on the home itself. No worker install on it |
| Server home + the Mac does tasks in local repos | server | server as home, then on the Mac: `ducter worker https://<domain> --code <code>` |

**Ask the user which topology when it isn't clear.** Then look before you change anything:

```sh
ducter version; ducter doctor --json      # what's installed, signed in, running (exit 0 = ready)
systemctl --user is-active ducter          # Linux: an existing service?
ls /Applications/Ducter.app ~/.ducter 2>/dev/null   # Mac: an existing app or home?
cat ~/.ducter/public-url 2>/dev/null       # an address already set up?
```

An existing home with data: don't reinstall over it or start a second one; ask.

## Mac

```sh
curl -fsSL https://ducter.ai/install.sh | sh     # Apple silicon; signed + notarized app, CLI at ~/.local/bin/ducter
```

Verify: the app opens; `ducter doctor --json` → `"ok": true`. If `ducter` isn't found in this
shell: `export PATH="$HOME/.local/bin:$PATH"` (the installer added it to the profile for new shells).

## Linux server (home)

The order matters: **DNS → firewall 80/443 → install `--service` → local health → `ducter domain`
→ sign in an AI agent → `ducter pair`.** Ask for the domain name first, so the A record
propagates while you install.

1. **Firewall** (cloud provider's firewall, and `ufw` if on): inbound TCP 22, 80, 443; UDP 443
   optional (HTTP/3). Never 7777.
2. **Install as a service** (x64 or arm64; as root is fine, data goes to `/root/.ducter`):
   ```sh
   curl -fsSL https://ducter.ai/install.sh | sh -s -- --service
   ```
   Verify: `curl -fsS http://127.0.0.1:7777/health` → `{"ok":true,…}`; `systemctl --user is-active ducter` → `active`;
   `loginctl show-user $USER -p Linger` → `Linger=yes` (the service survives logout and reboot; if
   not: `loginctl enable-linger $USER`). Not answering: `journalctl --user -u ducter -n 50 --no-pager`.
   As root it links `/usr/local/bin/ducter`; otherwise run the `export PATH=…` line it prints, or
   use `~/.local/bin/ducter`. Not root and `systemctl --user` fails: log in over SSH as that user
   (not `sudo su`). The end of the output shows the public IP and the next step.
3. **Sign in an AI agent on the server** (no browser): `claude auth login` or
   `codex login --device-auth`; send the user the link it prints, wait for the code. Or put
   `CLAUDE_CODE_OAUTH_TOKEN=…` (from `claude setup-token` on any machine) in `~/.ducter/keys.env`,
   then `chmod 600 ~/.ducter/keys.env`. Never print or log tokens. Verify: `ducter doctor --json`.
   One agent is enough. **Codex only is fine:** with Claude Code not signed in and Codex signed
   in, the partner thinks with Codex and Codex does the tasks, with no setting to change.
4. **DNS.** Ask the user for a name, e.g. `ducter.example.com`. They add an A record → the server's
   IPv4 (AAAA for IPv6). Cloudflare: "DNS only", not proxied. Check: `getent ahosts <name>`.
5. **Domain + HTTPS + pair code:**
   ```sh
   ducter domain ducter.example.com --json
   ```
   `ok: true` → `address`, `pair.code`, `pair.link` (give the user the link or the code and
   address; a code works once, 10 minutes). `ok: false` → `error` and `next` say what to do:
   - DNS missing/wrong: add exactly the record in `error`, wait a minute, rerun.
   - Port 80/443 held by nginx/another proxy: keep it; `ducter domain <name> --print` shows the
     site; forward `https://<name>` → `http://127.0.0.1:7777` with WebSocket upgrades and
     `X-Forwarded-For`, then `echo https://<name> > ~/.ducter/public-url` and `ducter pair --json`.
   - `httpStatus` 502/503/504: HTTPS and the certificate are fine; Ducter behind Caddy isn't
     answering: `systemctl --user status ducter`, `ducter doctor`, `systemctl --user restart ducter`, rerun.
   - `httpStatus` 0: no HTTPS yet: ports 80/443 closed in the cloud firewall, or DNS; `journalctl -u caddy -n 50`.
   - Not Debian/Ubuntu: install Caddy yourself, add the `--print` block to the Caddyfile.
   Rerunning is safe; `ducter domain --remove` undoes it (Caddy stays).
6. **Connect the user's devices.** `ducter pair --json` → `code`, `link`, `address`. **One code
   per device:** it works once, for 10 minutes; run `ducter pair --json` again for each next
   device (or the user picks Devices › Connect a phone or computer / 设备 › 连上手机或另一台电脑
   in the Mac app, also when it is connected to a server home). The code `ducter domain` printed
   is spent once the Mac uses it. Mac app: Settings › Connect to a Ducter on another computer (or "My Ducter is on
   another computer" on first run), paste the link. Phone: open the link, or the iPhone app
   (TestFlight: https://testflight.apple.com/join/Z4GvWt7t) with address + code. Verify:
   `ducter devices --json` lists it.
7. **Browsing the web (optional):** `ducter ability add browser` installs Ducter's own headless
   Chrome (Chrome for Testing, ~170 MB, into `~/.ducter/browser`) so tasks can browse. As root it
   installs Chrome's system libraries with apt-get itself; as a normal user it prints one
   `sudo apt-get install …` line: run it, then the same command again. Verify: it ends with
   "… can browse the web now (Chrome <version>)", and `ducter browser check` opens a page with
   it and says which Chrome answered. The user does the same with one tap in Devices
   › Browse the web. Sites that need a sign-in are signed into by the user, in the app's live
   view; never sign in for them. `ducter browser sites` lists them.

**Which layer is broken**, from any machine: `curl -sS -o /dev/null -w '%{http_code}' https://<name>/health`

| Code | Layer | Fix |
|---|---|---|
| 200 | all good | `ducter pair --json` |
| 502 / 503 / 504 | Caddy and TLS fine; Ducter down | `systemctl --user status ducter`; `ducter doctor`; `systemctl --user restart ducter`; `journalctl --user -u ducter -n 50 --no-pager` |
| 308 / 301 on `http://` | Caddy redirecting to HTTPS (normal) | use `https://` |
| 000 / TLS error | DNS, firewall 80/443, or no certificate yet | `getent ahosts <name>` = server IP; open 80/443; `journalctl -u caddy -n 50`; rerun `ducter domain` |

**No domain:** the Mac alone can use an SSH tunnel; `ducter pair --json` gives `tunnel`
(`ssh -N -L 7777:127.0.0.1:7777 user@ip`, run on the Mac, kept open); the address is then
`http://127.0.0.1:7777`. Phones need the domain. **Tailscale:** the tunnel works over the tailnet
IP too; a tailnet-only HTTPS proxy is the user's own setup (forward to 127.0.0.1:7777, then write
`public-url`). **IPv6-only server:** use an AAAA record; IPv4-only clients can't reach it.

## Add a worker

On the home: `ducter pair --json` → `command` (`ducter worker <address> --code <code>`). Run that
on the worker (install the CLI there first with the one-liner, without `--service`); on the
worker then `ducter service install --worker` to keep it running (a systemd unit on Linux, a
LaunchAgent on a Mac; a Mac with the Ducter app connected to the home can instead turn on "Let this
Mac do tasks" on its card). The worker needs its own
signed-in Claude Code/Codex. Verify on the home: `ducter devices --json` → the worker with
`"awake": true`. A server that is the home does tasks itself: no worker needed there.

## Upgrade

In place, from the release (0.0.4 and later):

```sh
ducter update --check --json   # {latest, devices:[{id, name, home, current, latest, available, how, notes}]}
ducter update --yes            # this machine: download, check the SHA-256, self-check, swap, restart, health-check
ducter update --all --yes      # the computers doing tasks for it first, then the home
ducter update --to 0.0.3 --yes # go back to a version (never done without --to)
ducter update --agents --check --json  # each AI agent: {device, harness, version, how, latest, available, standing}
ducter update --agents --yes          # update the AI agents that are behind, each at its safe point
```

It waits for merges and undos to finish and gives running tasks a moment; tasks resume after
the restart. If the new version doesn't answer `/health` within 60 s it puts `ducter.prev` back
and restarts again; the exit code is 1 and `--json` says `reason` and `rolledBack`. `how` tells
you what to do when it can't: `app` (a Mac: the app updates itself, Settings › Updates),
`source` (run from a checkout), `manual` (a Ducter before 0.0.4: run the one-liner once). Data
stays either way. Re-running the one-liner (with `--service` on a server) still works too.
Verify: `ducter version`.

## Clean reinstall (destroys this home's data; confirm with the user first)

```sh
ducter uninstall --all --dry-run --json   # show the user what goes and what stays
ducter uninstall --all --yes              # service/LaunchAgent, ~/.ducter, the ducter command, PATH lines, Ducter's Caddy site
curl -fsSL https://ducter.ai/install.sh | sh -s -- --service
ducter domain ducter.example.com          # if they used a domain
```

Kept: repos and `ducter/*` branches, agent sign-ins, Caddy itself, Nowledge Mem. Every device
must pair again.

## Moving the home from a Mac to a server

A fresh start (history doesn't move yet): server install → `ducter domain` → Mac app Settings ›
Connect to a Ducter on another computer → optionally `ducter worker https://<domain> --code …` on
the Mac so tasks can use its local repos. The Mac's own `~/.ducter` stays untouched.

## Never

- Answer **Go** on the user's behalf for anything irreversible, or paste pair codes, tokens or
  keys into chats, issues or logs.
- Open port 7777, run `ducter up --host 0.0.0.0` on a public machine, or edit other Caddy sites.
- Run a second home on the same data, or `uninstall --all` without the user's explicit yes.
