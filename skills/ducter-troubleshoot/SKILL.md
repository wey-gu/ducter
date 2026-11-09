---
name: ducter-troubleshoot
description: Diagnose and fix a Ducter install (the user's self-hosted personal AI) on a Mac or a Linux server - it won't start, a device can't connect, the domain or HTTPS doesn't work, an AI agent isn't signed in, tasks don't run on a worker. Use when Ducter misbehaves or the user asks why something in Ducter isn't working.
---

# Troubleshoot Ducter

Start with facts, change one thing, check again. Read-only first: nothing below deletes data
except where it says so, and that needs the user's yes.

## 1. The check-up

```sh
ducter version
ducter doctor --json      # {"ok", "harnessReady", "checks":[{id, status: ok|missing|warn, fix}]}
```

Every check that isn't `ok` carries a `fix`: the one command to run. Run it, then `ducter doctor`
again. Exit 0 means everything required is ready.

## 2. Is it running?

```sh
curl -fsS http://127.0.0.1:7777/health    # {"ok":true,…} = the home answers on this machine
ducter status --json                      # tasks and decisions; fails when it isn't running
```

## 3. Logs

| Ducter runs as | Log |
|---|---|
| The Mac app | `~/.ducter/app.log` |
| `ducter up` in a terminal | `~/.ducter/ducter.log` |
| A Linux service | `journalctl --user -u ducter -n 100 --no-pager` (status: `ducter service status`) |
| Caddy (the domain) | `journalctl -u caddy -n 50 --no-pager` |

`ducter report --json` writes a diagnostics folder (secrets removed, nothing uploaded; the
conversation only with `--include-conversation`). Point the user at it for an issue; don't
upload it yourself.

## Common failures

| Symptom | Fix |
|---|---|
| `ducter: command not found` | `export PATH="$HOME/.local/bin:$PATH"` for this shell (new shells have it), or `~/.local/bin/ducter` |
| Port 7777 in use | Another Ducter or program: `ducter status` / `lsof -i :7777`; or `ducter up --port 7790` and add `--port 7790` to every command |
| `systemctl --user` unreachable | Log in over SSH as that user (not `sudo su`), then `ducter service install` |
| Service stops at logout | `sudo loginctl enable-linger $USER` (doctor shows it) |
| Agent not signed in on a server | `claude auth login` or `codex login --device-auth` (a link to open anywhere); or `CLAUDE_CODE_OAUTH_TOKEN=…` in `~/.ducter/keys.env`, `chmod 600` |
| `ducter domain` stops at DNS | Add/fix exactly the record it names (A → the server's public IP; Cloudflare: DNS only), wait, rerun |
| `ducter domain`: port 80/443 taken | Another web server: forward through it (`ducter domain <name> --print`), or stop it if the user agrees |
| `https://<domain>/health` gives 502/503/504 | HTTPS is fine; Ducter behind Caddy is down: `systemctl --user status ducter`, `ducter doctor`, `systemctl --user restart ducter` |
| `https://<domain>/health` gives 000 or a TLS error | No certificate yet: DNS record, cloud firewall TCP 80/443 (`ufw allow 80,443/tcp`), then `journalctl -u caddy -n 50` |
| Only Codex on the server | Fine: the partner and the tasks use Codex when Claude Code isn't signed in |
| Phone: "That code is wrong or has expired" | Codes work once, 10 minutes: `ducter pair --json` for a new one |
| "Can't reach" the address | SSH tunnel still open? Domain: `curl -fsS https://<domain>/health`; server: `ducter service status` |
| A worker shows not awake | On the worker: `ducter service status` (or rerun `ducter worker <address> --code <new code>`); its own agent must be signed in (`ducter doctor` there) |
| Mac app: "Ducter" Not Opened | An unsigned build: System Settings › Privacy & Security › Open Anyway |
| Ducter is resting | The user chose Stop Ducter: Wake Ducter in the app or menu |

## Last resorts (ask first)

- Restart: `systemctl --user restart ducter` (server) or quit and reopen the Mac app.
- Start over: `ducter uninstall --all --dry-run` shows what goes; `ducter uninstall --all --yes`
  erases this home's conversation, tasks and settings for good. Then reinstall (ducter-deploy).
