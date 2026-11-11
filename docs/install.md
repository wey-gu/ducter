---
title: Install
description: Install the Mac app or the ducter command, run Ducter on a Linux server that stays on, and connect your iPhone, iPad or Android phone.
order: 2
---

# Install

There are four ways to have Ducter, and you can mix them:

| | Best for | Status |
|---|---|---|
| [The Mac app](#the-mac-app) | Most people. One line in Terminal, or a download | Ready |
| [The `ducter` command](#the-ducter-command) | People who live in Terminal | Ready |
| [A Linux server](#a-linux-server-that-stays-on) | Keeping your partner working while your Mac sleeps | Ready |
| [Your phone or iPad](#your-phone-or-ipad) | Answering decisions and checking results on the go | iPhone and iPad: one app, in public beta (TestFlight). Android: the Ducter app from each GitHub release, or the phone's browser |

Whichever you choose, you need an AI agent, **Claude Code, Codex, pi or DeepSeek Harness**, installed and
signed in on the computer that does the work ([which agents](faq.md#which-ai-agents-does-it-work-with)).
With Claude Code or Codex, Ducter uses the plan you already have and never asks for an API key;
pi and DeepSeek Harness use your DeepSeek account.

## The Mac app

It runs on Macs with Apple silicon. Paste this into Terminal:

```sh
curl -fsSL https://ducter.ai/install.sh | sh
```

It downloads the latest release from GitHub, checks the download's checksum and that Apple
notarized it, puts **Ducter** in **Applications** (replacing an older copy), puts the
[`ducter` command](#the-ducter-command) in `~/.local/bin`, and opens it. It asks for your
password only if your account can't write to Applications.

### Or download it yourself

Download `Ducter-<version>-arm64.dmg` from the
[latest release on GitHub](https://github.com/wey-gu/ducter/releases/latest). It's signed and
notarized, so macOS asks only once whether to open an app from the Internet; choose **Open**.
Open the `.dmg`, drag **Ducter** onto **Applications**, and open it from there.

The app updates itself: when a new version is ready, the menu says so, and it installs the next
time you quit.

### Build it from the source instead

On a Mac with [Bun](https://bun.sh) and [Go](https://go.dev) installed:

```sh
git clone https://github.com/wey-gu/ducter && cd ducter
scripts/make-app.sh        # makes dist/Ducter.app and a .dmg
```

The `.dmg` can go to anyone with an Apple silicon Mac (AirDrop, a link, a USB stick). They
need no build tools. Without an Apple Developer ID the app isn't notarized, so macOS
needs one extra step the first time: see
[Ducter can't be opened](troubleshooting.md#ducter-not-opened).

What happens next is in [Getting started](getting-started.md). In short: Ducter checks your Mac,
shows the one thing to fix if anything blocks, and opens the conversation. It keeps working
when you close the window.

## The `ducter` command

The same line that installs the app puts `ducter` in `~/.local/bin`:

```sh
curl -fsSL https://ducter.ai/install.sh | sh
ducter doctor           # checks this computer; anything missing comes with the command that fixes it
ducter up               # starts your partner (on a Mac, the app opens too)
```

On a Mac, `ducter` comes with the app: the link points at the command inside **Ducter** in
Applications, so it updates with the app. On Linux the same line installs the `ducter` bundle
for your server's CPU. So that `ducter` works right away: as root, the installer also links
`/usr/local/bin/ducter`, which is on every `PATH`; otherwise, if `~/.local/bin` isn't on your
`PATH` yet, it adds it in your shell's profile (one block marked `# added by Ducter`) and prints
the line that does the same in the terminal you're in. A `ducter` you put there yourself is left
alone. To install the app without the
command, add `-s -- --no-cli` after `sh`.

Installed the app another way? After your partner's first reply it offers *"Use ducter in
Terminal too?"*, and **Yes** does the same.

From the source instead (needs Bun; Go too if you want the desktop window):

```sh
scripts/install.sh      # puts ducter (and the desktop app) in ~/.local/bin
```

To hand the command to a friend who doesn't build anything, run
`scripts/install.sh --bundle ~/Desktop/ducter-for-anna` and send them that folder. On their Mac
they type `sh ` in Terminal, drag `install.sh` from the folder into the window, press Return, and
run the one command it prints.

| Command | What it does |
|---|---|
| `ducter up` | Start Ducter and open the desktop window. Ctrl-C stops everything |
| `ducter open` | Open the desktop window again for a Ducter that's already running |
| `ducter status` | Your tasks and the decisions waiting for you |
| `ducter task "<what to do>"` | Start a task yourself, in the repo you're in. Your words go to it as they are. Add `--repo <folder>` for another repo (`--repo none` for no particular place), `--agent codex` to pick who does it, `--base <branch>` for where it starts |
| `ducter say "<words>"` | Say something to your partner and see its reply right here |
| `ducter tail` | Follow the conversation as it happens; `ducter tail <part of a task's title>` follows one task's steps. Ctrl-C stops |
| `ducter answer <part of the question> go` | Answer something waiting for you: `go`, `hold`, or your reply in quotes |
| `ducter open <part of a task's title>` | Show that task in the app (or, if the app isn't open, where it is) |
| `ducter doctor` | The check-up (see [Troubleshooting](troubleshooting.md)) |
| `ducter pair` | A code to connect your phone or another computer: one device, once, for 10 minutes. Run it again for the next device |
| `ducter domain <your domain>` | On a server: HTTPS at your domain, then a code to connect your devices from anywhere. `--remove` undoes it |
| `ducter devices` | The devices connected to your Ducter; `ducter devices disconnect <name>` removes one |
| `ducter devices rename <name> <new name>` | Give a device a name you'll recognize |
| `ducter connect <address> --code <code>` | Send this computer's `ducter` commands to a Ducter on a server (the code comes from `ducter pair` there) |
| `ducter disconnect` | Send them to this computer's own Ducter again |
| `ducter report` | Writes a diagnostics folder you can look through and attach to an issue. Nothing is uploaded |
| `ducter uninstall` | Removes Ducter from this computer; add `--dry-run` to see what it would remove first |
| `ducter version` | Which version you have |

Messages follow your system language. Set `DUCTER_LOCALE=zh` or `DUCTER_LOCALE=en` to choose.

**Which Ducter do they talk to?** `status`, `say`, `task`, `tail`, `answer`, `merge`, `undo`,
`open`, `pair` and `devices` talk to the Ducter you use: the one on this computer, or the one on
a server once you've connected to it (see [below](#using-the-command-line-with-a-ducter-on-a-server)).
Each one says where first: `→ this computer`, `→ hel.example.com`. `up`, `doctor`, `domain`,
`service`, `worker`, `report` and `uninstall` always act on this computer.

**Started on another port?** Add `--port 7790` (or set `DUCTER_PORT`) to every command, for
example `ducter status --port 7790`. A `--port` always means this computer.

### Using the command line with a Ducter on a server

When the Mac app connects to a Ducter on a server, `ducter` in Terminal follows it: the app
connects the command line too, as its own device, **CLI on <your Mac>**, which you can see and
disconnect on its own in `ducter devices`. Switch the app back to the Ducter on this Mac and the
command line comes back with it.

No app, or another computer? Get a code on the server and connect by hand:

```sh
ducter pair                                        # on the server: prints a code (and the connect line)
ducter connect https://hel.example.com --code K7QM-4XPA   # on your computer
ducter status                                      # → hel.example.com
ducter disconnect                                  # back to this computer's own Ducter
```

Just once, without switching: `--local` uses this computer's Ducter, `--home <address>` the one
at that address. A task you start with `ducter task` while connected to a server has no folder
unless you name one with `--repo`, and a folder on this Mac works only if this Mac does tasks for
that Ducter (`ducter worker`).

When something is off, the command says what to do: a server it can't reach (check that it's up;
`ducter doctor` on it), or one that no longer accepts this command line (it was disconnected
there: `ducter connect` again with a new code). `ducter doctor` shows which Ducter the command
line uses, and whether this `ducter` is the app's own (it updates with the app) or a separate
copy that won't.

## A Linux server that stays on

A Mac sleeps; a small server doesn't. Put Ducter on a Linux server you own and your partner
keeps working through the night, while your Mac and phone connect to it.

In short, in this order:

1. **DNS:** an A record for your name (say `ducter.example.com`) → the server's public IP.
2. **Firewall:** allow TCP 22, 80 and 443 in. Never 7777.
3. **Install:** `curl -fsSL https://ducter.ai/install.sh | sh -s -- --service`. It checks that
   Ducter answers on the server before it says what's next.
4. **Domain:** `ducter domain ducter.example.com`: HTTPS, then a code.
5. **Sign in an AI agent** on the server: `codex login --device-auth` or `claude auth login`.
6. **Connect** your Mac with the code, then your phone with a new one: each code works once, for
   10 minutes (`ducter pair` gives the next).

**1. On the server, install it as a service** (x64 or arm64 Linux):

```sh
curl -fsSL https://ducter.ai/install.sh | sh -s -- --service
ducter doctor
```

The same line without `-s -- --service` installs only the `ducter` command, in `~/.local/bin`.
You can also take the tarball for your server's CPU from the
[latest release](https://github.com/wey-gu/ducter/releases/latest) and run its `install.sh`, or
build the files from the source on your Mac with `scripts/install.sh --linux ducter-linux` and
copy the folder over.

Ducter now starts with the server and restarts if it ever crashes. It only listens on the
server itself (`127.0.0.1`), so nobody reaches it from outside until you choose how. The
install ends with this server's public IP address and the next step:

```
To use it from your phone and Mac anywhere:
point a domain at this server's public IP 203.0.113.7 (an A record), then run:
  ducter domain ducter.example.com
```

As `root` the data lives in `/root/.ducter`, and `ducter` works in the same shell right away.

`ducter doctor` also tells you how to sign in Claude Code or Codex on a server that has no
browser: `claude auth login` prints a link to open on any device and waits for the code, and
`codex login --device-auth` works the same way. One is enough. With only Codex signed in,
your partner thinks with Codex and Codex does the tasks; Claude Code is optional.

If you'd rather use a sign-in token or an API key (for example `CLAUDE_CODE_OAUTH_TOKEN` from
`claude setup-token`, or `DEEPSEEK_API_KEY` for DeepSeek Harness), put it in
`~/.ducter/keys.env`, one `NAME=value` per line, and make the file private:

```sh
chmod 600 ~/.ducter/keys.env
```

Ducter gives each key only to the AI agent that signs in with it. Your DeepSeek key reaches
DeepSeek Harness and nothing else. Other keys and tokens on the server, such as one in your
shell, aren't passed to tasks either. If an older Ducter had you put keys in `~/.ducter/env`,
Ducter moves them to `keys.env` the next time it starts.

**2. Give it your domain** (recommended; it's also how your phone reaches it):

1. At your domain's DNS provider, add an **A record** for a name such as
   `ducter.example.com`, pointing at the server's public IP (the install printed it). If your
   DNS is on Cloudflare, set the record to **DNS only**, not proxied.
2. In your cloud provider's firewall, allow inbound **TCP 80 and 443** (and 22 for SSH). Never
   open 7777. If `ufw` is on: `ufw allow 80,443/tcp`.
3. On the server:

   ```sh
   ducter domain ducter.example.com
   ```

It checks the name points at this server first (if not, it says exactly which record to add and
stops), checks nothing else holds ports 80 and 443, installs [Caddy](https://caddyserver.com)
(Debian and Ubuntu), adds Ducter's site to it, waits for the HTTPS certificate (up to a
minute), and ends with a code, a link and a QR code to connect your devices. Running it again
is safe. `ducter domain --remove` takes Ducter's site out of Caddy again.

Already run a web server such as nginx on 80 and 443? `ducter domain ducter.example.com --print`
shows what to forward to Ducter (`127.0.0.1:7777`, WebSocket upgrades included); after you've
set that up, put `https://ducter.example.com` in `~/.ducter/public-url` and run `ducter pair`.

**No domain?** Your Mac alone can reach it through an SSH tunnel. On the Mac (leave it
running):

```sh
ssh -N -L 7777:127.0.0.1:7777 root@203.0.113.7
```

The address is then `http://127.0.0.1:7777`. This works for your Mac, not your phone.

**3. Connect your Mac.** Open the Mac app and choose **My Ducter is on another computer**, then
**Connect to your Ducter**. Type the **Address** and **Code** that `ducter domain` (or
`ducter pair`) showed, or paste the whole link. Each code works once, for one device, for 10 minutes.
For your phone or another computer, get a new one: `ducter pair` on the computer Ducter lives on, or **Devices › Connect a phone or computer** in the Mac app (it works when the app is connected to a Ducter on a server, too).

Ducter's own messages on the server go to the system journal:
`journalctl --user -u ducter`.

**Which part isn't working?** Ask your domain from any computer:
`curl -sS -o /dev/null -w '%{http_code}\n' https://ducter.example.com/health`

| You get | What it means | What to do |
|---|---|---|
| `200` | Everything works | Connect with a code from `ducter pair` |
| `502`, `503` or `504` | HTTPS works, but Ducter behind it isn't answering | On the server: `systemctl --user status ducter`, then `ducter doctor`; `systemctl --user restart ducter` |
| `308` or `301` for `http://…` | Caddy is there and sends you to HTTPS: normal | Ask the `https://` address |
| `000`, or a certificate error | No HTTPS yet: the DNS record, ports 80 and 443, or the firewall | Check the A record points at the server and 80 and 443 are open, then `ducter domain ducter.example.com` again; Caddy's log: `journalctl -u caddy -n 50` |

### Already using Ducter on your Mac, and want it on a server

Start the server as a fresh Ducter: your conversation and tasks on the Mac stay on the Mac (moving
them over is on the roadmap).

1. Set up the server as above: install, `ducter domain`, sign in an AI agent.
2. On the Mac, open **Settings** and choose **Connect to a Ducter on another computer**. Paste
   the link from `ducter pair` (or type the address and the code). The app now uses the server.
   It asks once whether to stop the Ducter on this Mac; its data in `~/.ducter` stays either way.
   `ducter` in Terminal now talks to the server too.
3. Want tasks to use the repos on your Mac? In the app, turn on **Let this Mac do tasks for
   …** on your Mac's card in **Devices** (or in **Settings › Where it runs**).

To go back, **Settings › Use the Ducter on this Mac again**.

### Lend another computer

A second server or Mac can do tasks for your Ducter.

**A Mac with the Ducter app**, connected to your Ducter on a server: one tap. On the Mac's card
in **Devices** (or **Settings › Where it runs**), turn on **Let this Mac do tasks for …**. It
runs in the background, starts at login, and starts again if it stops; its log is `worker.log`
in Ducter's data folder. Turn it off to stop it and disconnect it there.

**Any other computer:** on the computer Ducter lives on, run
`ducter pair` (or choose **Connect a phone or computer** in the app). It prints one command for
the other computer; run it there:

```sh
ducter worker https://ducter.example.com --code K7QM-4XPA
```

It's the same one-time code a phone uses. Then `ducter service install --worker` keeps it
running: a systemd service on Linux, a background item on a Mac that starts at login
(`ducter service status --worker` and `ducter service uninstall --worker` on a Mac). Then just say where: *"run it on vps-2"*.
The computer shows up under its own name; rename it in the app, or with
`ducter devices rename vps-2 "Build box"`. If that computer drops off, its task waits and
carries on when it's back.

## Your phone or iPad

Your phone connects to the Ducter on your server through your own domain. On the server, run
`ducter pair` and scan the QR code it shows, or open the link. The phone opens Ducter in its
browser, connects, and asks whether to notify you when something needs you.

**iPhone and iPad app (public beta).** One app for both, in public beta through Apple's
TestFlight: [join the beta](https://testflight.apple.com/join/Z4GvWt7t), install TestFlight if
asked, then open Ducter and type the address and code from `ducter pair`. Beta builds can change
and expire after 90 days; TestFlight offers the next one.

**Android.** Download `Ducter-<version>-android.apk` from the
[latest release](https://github.com/wey-gu/ducter/releases/latest), allow your browser to install
apps when Android asks, then scan the code from `ducter pair` or paste its link. The app updates
itself from then on ([more](phone.md#the-android-app)). Or open the address in your phone's
browser; you can answer **Go** or **Hold** straight from the notification.

Everything about the phone and the iPad, including notifications and quiet hours, is on
[Your phone](phone.md).

## Updates

The Mac app looks for a new version when it opens and once a day, and gets it ready in the
background. If it couldn't look (no network, or GitHub didn't answer), it says **Couldn't check
this time** and looks again within the hour. When your server already knows of a newer version,
the app hears it from there and gets it right away. When one is ready, the Ducter menu says **Update 0.2.0 ready · restart to finish**.
It installs the next time you quit Ducter, or right away with **Restart Now**: the window says
**Putting the new version in, back in a moment**, closes, and Ducter opens again on the new
version with a quiet **Updated to 0.2.0**. Your tasks carry on.

### Updating a server, and the computers that do tasks for Ducter

Every device's card under **Your devices** shows its version. When it's the newest, the card says
so with when Ducter last looked (**Up to date · checked 3 h ago**) and a quiet **Check now**; Ducter
looks every hour, and again whenever you open the page. When a newer one is out, the list
says **Update available** by its name and the card says **Update to 0.0.4**, with a line or two of what's
new in your language and one **Update** button. Nothing pops up and nothing nags. On the phone it's the same,
under **Settings › Your devices**.

When you tap **Update**, the card says what it's doing: **Downloading… · Checking… · Waiting for
work to settle… · Restarting…** and then **Back, now on 0.0.4**. Ducter only takes files from its
official GitHub release, checks each one against the release's checksums, and tries the new
version before it switches. It waits until no merge or undo is running; tasks that are working
pause for the restart and carry on. If the new version doesn't come up within three minutes,
Ducter switches back to the one you had, and the card says **Didn't update; back on 0.0.3**; tap
it to see why.

From a terminal, on the computer Ducter lives on:

```sh
ducter update --check   # where every device stands (also from a Mac that does tasks for your server)
ducter update           # this computer (asks first; --yes doesn't)
ducter update --all     # the other computers first, then this one
```

A Mac updates with the app, as above. Its card has the same **Update** button, from your phone or
from another computer: the card says **Ducter on MacBook downloads and checks it, then restarts
once nothing is mid-way**, then shows each step, and the Mac's window says **Putting the new version
in, back in a moment** while it switches. Ducter has to be open on that Mac: if it's closed, or the
Mac is asleep, the card says so and nothing changes; open Ducter there and tap **Update** again. If
Ducter.app was installed by an administrator, the first update needs that Mac's password once, at
the Mac. The Mac you're on updates with this app: if the app is already up to date but the part
that does tasks for your server still runs the older version, its card says so with **Restart it**. A computer running a Ducter older than
0.0.4 can't be updated from here: run the install command on it once more.

**Update at night** (off by default, in **Settings**) updates everything during your quiet hours,
only when nothing is working.

## Remove Ducter

- **Mac app:** choose **Stop Ducter** in the menu, then drag Ducter from Applications to the
  Trash.
- **Server:** `ducter service uninstall` stops the service and keeps your data.
- **Everything, in one go:** `ducter uninstall --all`. It first lists exactly what it removes
  (Ducter in the background, `~/.ducter` with your conversation and tasks, its browser profiles,
  the `ducter` command it put in `~/.local/bin` and `/usr/local/bin`, the `PATH` lines it added to
  your shell profile, and on a server Ducter's site in Caddy) and what it keeps (your repos and
  their `ducter/*` branches, your Claude Code and Codex sign-ins, Nowledge Mem, cua-driver, Caddy
  itself), and
  asks you to type `remove`. A task's changes that were never committed are named before
  anything goes. It cannot be undone. Without `--all` it only stops Ducter in the background.
