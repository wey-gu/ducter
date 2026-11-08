#!/bin/sh
# Puts Caddy in front of Ducter so your devices reach it at https://<your domain>,
# with certificates Caddy gets and renews by itself (Let's Encrypt / ZeroSSL).
#
#   sh scripts/caddy-setup.sh ducter.example.com          # Ducter on 127.0.0.1:7777
#   sh scripts/caddy-setup.sh ducter.example.com 7790     # another port
#   sh scripts/caddy-setup.sh ducter.example.com --print  # only show the Caddyfile block
#
# Before you run it:
#   1. Point a DNS A (and AAAA, if you have IPv6) record for the domain at this server.
#   2. Allow inbound TCP 80 and 443 (cloud firewall / security group, and ufw if you use it).
#   3. Mainland China servers: the domain needs an ICP filing before 80/443 will serve.
#      Hong Kong / Singapore / overseas servers don't (research/21, D52 Q18).
#
# What it touches: installs the `caddy` package (Debian/Ubuntu, official apt repo) if missing,
# adds one site block to /etc/caddy/Caddyfile, reloads Caddy, and writes ~/.ducter/public-url so
# `ducter pair` shows https://<domain>. Ducter itself keeps listening on 127.0.0.1 only; every
# request through Caddy is treated as remote and needs a paired device (D54).
set -eu

DOMAIN="${1:-}"
PORT=7777
PRINT=0
shift || true
for a in "$@"; do
  case "$a" in
    --print) PRINT=1 ;;
    [0-9]*) PORT="$a" ;;
    *) echo "unknown option: $a" >&2; exit 2 ;;
  esac
done
if [ -z "$DOMAIN" ] || [ "${DOMAIN#-}" != "$DOMAIN" ]; then
  sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
fi

BLOCK="# ducter: written by scripts/caddy-setup.sh
$DOMAIN {
	encode zstd gzip
	# WebSocket upgrades pass through as-is. Caddy adds X-Forwarded-For, which is how Ducter
	# knows a request came from outside even though Caddy connects from 127.0.0.1.
	reverse_proxy 127.0.0.1:$PORT
}"

if [ "$PRINT" = 1 ]; then
  printf '%s\n' "$BLOCK"
  exit 0
fi

say() { printf '%s\n' "$*"; }
step() { printf '\n==> %s\n' "$*"; }

step "Checking DNS for $DOMAIN"
RESOLVED="$(getent ahosts "$DOMAIN" 2>/dev/null | awk '{print $1}' | sort -u | tr '\n' ' ')"
if [ -z "$RESOLVED" ]; then
  say "$DOMAIN doesn't resolve yet. Add the DNS record, wait a minute, and run this again."
  exit 1
fi
say "$DOMAIN → $RESOLVED"

if ! command -v caddy >/dev/null 2>&1; then
  step "Installing Caddy (official apt repository)"
  if ! command -v apt-get >/dev/null 2>&1; then
    say "This script installs Caddy on Debian/Ubuntu. Elsewhere, install it from https://caddyserver.com/docs/install"
    say "and add this block to your Caddyfile:"
    printf '\n%s\n' "$BLOCK"
    exit 1
  fi
  sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl gnupg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo apt-get update
  sudo apt-get install -y caddy
fi

step "Adding $DOMAIN to /etc/caddy/Caddyfile"
CF=/etc/caddy/Caddyfile
if sudo grep -q "^$DOMAIN {" "$CF" 2>/dev/null; then
  say "Already there; leaving it as is."
else
  # The Debian package ships a :80 demo site; it would hold port 80 that ACME needs on this host.
  if sudo grep -q '^:80 {' "$CF" 2>/dev/null; then
    sudo cp "$CF" "$CF.before-ducter"
    say "Moved the package's demo site aside (backup: $CF.before-ducter)."
    printf '%s\n' "$BLOCK" | sudo tee "$CF" >/dev/null
  else
    printf '\n%s\n' "$BLOCK" | sudo tee -a "$CF" >/dev/null
  fi
fi
sudo caddy validate --config "$CF" --adapter caddyfile >/dev/null
sudo systemctl reload caddy || sudo systemctl restart caddy

step "Waiting for https://$DOMAIN (certificate issuance takes up to a minute)"
ok=0
for _ in $(seq 1 30); do
  if curl -fsS --max-time 5 "https://$DOMAIN/health" >/dev/null 2>&1; then ok=1; break; fi
  sleep 3
done
if [ "$ok" = 0 ]; then
  say "Not answering yet. Check: sudo journalctl -u caddy -n 50 (ports 80/443 open? DNS pointing here?)"
  exit 1
fi

DATA="${DUCTER_DATA_DIR:-$HOME/.ducter}"
mkdir -p "$DATA"
printf 'https://%s\n' "$DOMAIN" > "$DATA/public-url"
step "Done"
say "Ducter answers at https://$DOMAIN. Connect a device with:"
say "  ducter pair"
