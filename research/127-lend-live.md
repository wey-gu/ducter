# 127: Lend a computer, live (D347 on two Ubuntu VMs and a scratch home)

D347 was built and tested on fakes only (a fake home, a fake systemctl, a fake curl). This run
pasted the real line, from the real `https://ducter.ai/install.sh` and the real 0.0.76 release,
into two fresh Ubuntu VMs lent to a scratch home on this Mac, as a normal user and as root.

Tags: **VERIFIED** (run here and seen), **FAILED** (run here, wrong), **INFERRED** (from code or
one run only), **NOT RUN**.

## Setup

| | |
|---|---|
| Date | 2026-11-18, 10:35–10:54 (Asia/Shanghai) |
| Home | main at 0.0.76 (`f530eead`) from a worktree, `ducter up --headless` with `DUCTER_HOST=0.0.0.0`, `DUCTER_PORT=7801`, a data folder under the session scratchpad, `DUCTER_MEMORY=off`, `NMEM_CLI_PATH` at a shim that refused every call, `DUCTER_PUSH_RELAY=off`, `DUCTER_BROWSER=0`, `DUCTER_IMESSAGE=off`; never `~/.ducter`, :7777, hel or the author's machines. Restarted twice from the same folder to pick up the fixes below |
| Network | the Mac on a home LAN (a private 10.x address); the VMs reach it through colima's NAT. No proxy was needed |
| VMs | colima 0.10.3, `--vm-type vz`, Ubuntu 24.04.4 LTS aarch64, profiles `ducter-lend-check` (normal user, systemd user manager with linger already on in colima's image) and `ducter-lend-check-root` (the line under `sudo -i`). Both deleted afterwards |
| Client | a 20-line WebSocket client sending the web app's own frames (`hello`, `lend_code`, `rename_device`, `task_new`, `devices`); `ducter say` / `tail` / `status` against the scratch home |
| Models | none for the lend itself. One task ran on the home's Claude Code opus by mistake (F1); two partner turns on haiku |

## What a real person would do to get here

A Mac home started by the app listens only on 127.0.0.1, so its Lend a computer card has no
address and asks for From outside first. **VERIFIED** on a second scratch home on the default bind:
the `lend` frame came back with a code and no `address`, `line` or `check`. The only way a Mac home
offers a same-network line is to listen on the network, which the app has no switch for (D347's
known limit; `todo.md`). This run used the terminal's `ducter up --headless --host 0.0.0.0`
(`DUCTER_HOST`), which a person would have to know about; the home said so in one line
(`listening on 0.0.0.0:7801 without TLS …`). A home on a server with an address (hel's case) needs
none of this: its `lend` frame carries the public address (INFERRED from `lend.ts`; the
`publicAddress` branch was not run live).

## Steps

| # | Step | Result | Timing |
|---|---|---|---|
| 1 | Home reachable from the VM | **VERIFIED**: `curl http://<LAN IP>:7801/health` from the VM answered `{"ok":true}` (so did `host.lima.internal`) | VM start 23 s |
| 2 | The line, as the app gets it | **VERIFIED**: `{t:"lend_code"}` after `hello` answered `state: waiting`, the code (10 min), `address: http://<LAN IP>:7801`, `sameNetwork: true`, the check and the line `curl -fsSL https://ducter.ai/install.sh \| sh -s -- worker http://<LAN IP>:7801 --code XXXX-XXXX`. Before `hello` it answers `send hello first` (any client sends hello first) | 0.1 s |
| 3 | Normal user: install, join, service | **VERIFIED**: reach check, download of 0.0.76 linux-arm64, checksum, install to `~/.local/bin`, `~/.bashrc` PATH block, join, `~/.config/systemd/user/ducter.service` (Description `Ducter (worker)`, `ExecStart … ducter worker`, `RestartPreventExitStatus=3`, `WantedBy=default.target`), enabled and active, journal `● Connected to …`. `worker.json` 0600 with the home's key fingerprint | paste to exit 13.0 s |
| 4 | The home's frames | **VERIFIED**: every client heard `lend` `joined` (device id, name) then `here` 0.34 s later; the devices frame went `unreachable` → `awake` in the same 0.3 s | paste to `here` 11.2 s |
| 5 | The device in Your devices | **VERIFIED**: `colima-ducter-lend-check`, kind `server`, platform `linux-arm64`, version 0.0.76, agents Claude Code, Codex, pi and DeepSeek all not installed (as expected), abilities `web: off`, `computer: later`, `phone: later` |  |
| 6 | Rename | **VERIFIED**: `rename_device` → `Lab box`, pushed to the other client at once; kept across the worker's restart and a reboot of the VM (the worker still says its old name in its hello and in its own messages; the home keeps the person's) |  |
| 7 | The same line again | **VERIFIED**: `Ducter 0.0.76 is already installed.` · `colima-ducter-lend-check is already doing tasks for the Ducter at …` · the service written again and active; no `/pair` call, one device on the home | 4.1 s |
| 8 | A reboot of the VM | **VERIFIED**: the device went `unreachable` and was `awake` again 4.9 s later, with no login | |
| 9 | Root, fresh VM | **VERIFIED**: install to `/root/.local/bin` (and `/usr/local/bin/ducter` linked to it), join, `/etc/systemd/system/ducter.service` with `WantedBy=multi-user.target`, no user unit, enabled and active, `joined` then `here` 0.76 s apart | paste to `here` ~2.5 s (already installed) |
| 10 | Expired code | **VERIFIED** (a code minted at 10:38:13, run at 10:48:26, no code minted in between): `That code has expired (each one lasts 10 minutes). Get a new one where you lent this computer, then run the line again.`, exit 1, nothing joined | |
| 11 | A used code on a new computer | **FAILED, fixed** (F3): `That code is wrong or has expired. On the computer Ducter lives on, run: ducter pair` | |
| 12 | Home unreachable | **VERIFIED** (an iptables reject in the VM): `Ducter install: this computer can't reach http://…:7801. It only needs to reach that address (outbound; nothing comes in). Check: curl -sS -m 10 http://…:7801/health`, exit 1, nothing installed | |
| 13 | No curl | **NOT RUN**: `curl … \| sh` without curl fails in the person's own shell (`curl: command not found`) before the script starts; the card's row covers it | |
| 14 | A task on it | **FAILED, fixed** (F1): with no agent signed in on the VM, `task_new` with `place: {kind: none, device: <the VM>}` opened the task on the home, on Claude Code opus, and answered with the Mac's `uname`. After the fix: `ok: false`, `reason: no_agent`, `Lab box can't take this task: no AI agent is signed in there yet. No task was opened.` A task actually running on the lent VM is **NOT RUN**: it needs an agent signed in there (no model was used for the VMs); the e2e rig covers tasks on a worker with the scripted model | |
| 15 | "Run it on Lab box" to the partner | en, haiku: **FAILED, half fixed** (F2). zh, haiku, after the fixes: **VERIFIED**: 「Lab box 上还没有登录 AI，所以现在没法在那边跑。你在那台机器的终端里登录 Claude 或 Codex 之后再叫我就行。要是等不及，我可以先在这台 Mac 上跑。」 | 3.1 s |

## Findings

### F1. A computer you name with no agent on it: the task ran on the home instead, silently (FAILED; fixed, D353 (1))

`chooseBody` holds a named computer only through its usable rows (`named`); a lent server with no
agent signed in has none, so the ranking fell through to the home. The card's reason said
`agent_here` on the Mac, which reads as an explanation but was never asked. where.md §4.4 says the
person's pick never moves silently; that held for a pinned agent, not for a pinned computer. Now a
pinned computer that exists here and has no usable row opens nothing and gives the partner one
line (with each agent's reason when some are signed in but blocked); an asleep or unreachable one
still waits there, and a name that is no computer keeps the ranking. Live, this one mistaken
task ran `uname -a` on the author's Mac on Claude Code opus (read-only, about 20 s, in the scratch
home's own folder); its `~/.claude/projects` folder was deleted.

### F2. The partner's "On it: running uname on the Lab box now", then nothing (FAILED; the status line fixed, the silence not)

In English, haiku acked before calling `task_open`; the refusal came back to it, and it ended
its turn without a word. The person saw the ack, then the failed status line, which printed the
partner's instruction as it was: `… No task was opened. Tell the user in one line: sign in an AI
agent on Lab box …`. The status line now leaves the instruction out (`forPerson`, as `newtask.ts`
already did for the New task card), so the person reads `Run uname -a on Lab box: Lab box can't
take this task: no AI agent is signed in there yet. No task was opened.` The ack that promised a
run is the partner's own words, and one run is thin: not changed here (a persona change needs the
eval, D175). In Chinese the next run answered right with no ack.

### F3. The lend line with a used code pointed at `ducter pair` (FAILED; fixed, D353 (3))

`/pair` answers `invalid` for a used code (the row is deleted on first use), so a second
computer pasting the same line, or a paste after the card made a new code, got the terminal
path's words. With `--service` (only the lend line passes it) it now says: **That code was already
used, or isn't right. In Lend a computer, choose New code, then paste the new line here.** /
**这个码已经用过了，或者不对。在「借一台电脑来干活」里点「换一个新码」，再把新的那一行粘贴到这里。**
An expired code reads `expired` only until the home mints another code (`createCode` sweeps
expired rows first); after that it reads as used. Both words now lead back to New code.

### F4. The install printed a home's next steps on a computer about to be a worker (FAILED; fixed, D353 (2))

The bundle's own `install.sh` ended with `Next: ducter service install (keeps it running …; then
ducter tailscale or ducter domain <your domain> to reach it from your phone and Mac)` and `The
first start checks this machine …`, then the worker's lines followed. Now ducter.ai/install.sh's
worker mode runs the bundle with `DUCTER_INSTALL_FOR=worker`, and the bundle stops after
`Ducter is installed` and its PATH lines. Older bundles ignore the variable, so the line keeps
working against 0.0.76; the quieter output arrives with the next release's bundle. Checked by
`scripts/install-sh.test.ts` (the bundle run for real in a temp prefix), not yet live.

### F5. The Mac app's sheet sat at 正在拿一个码… forever (FAILED on the author's Mac against hel; fixed, D353 (5))

Reported by the author during this run (Mac app 0.0.76, home hel 0.0.76 on its domain). Root
cause, **VERIFIED**: the Mac's `DecodeServerFrame` (`apps/desktop/internal/protocol/protocol.go`)
lists every frame type it accepts, and `lend` was not in it, so the client logged and skipped
each one. The author's own `~/Library/Logs/co.nowledge.ducter/app.log` (read only) has
`ducter: bad frame: unknown server frame "lend"` at 10:53:18 and 10:53:59. The home was fine:
it answered (a new core test has a paired app window from outside, as the Mac reaches hel, get
the waiting frame with the domain's line, no error). `TestEveryServerFrameDecodes` exists to
catch exactly this, but it read only `{ t: "…" }` literals in the `ServerFrame` union, and the
lend frame is a named member (`| LendFrame`). The web was never affected (it reads every frame).
The Go views test passed because it handed the store an already-built frame, never JSON.

Fixed: `lend` decodes; the union test reads named members from their definitions (that turned
up seven more the Mac drops, all frames only the web or the Android app asks for, now listed as
such in the test); the views test decodes the frame off the wire. And the sheet never waits
without end, on either client: no code within 8 s says **hel didn't answer, so there's no code
yet.** / **hel 没有回应，没拿到码。**, an error frame for `lend_code` says **hel couldn't make a
code.** / **hel 没能给出一个码。**, each with **Try again** / **再试一次**; a code that comes late
still lands. Not yet checked in the built app against hel (needs a release).

### Smaller things seen (not changed)

- After `here`, the terminal's last lines are the service's (`● active`, `Logs: journalctl --user -u ducter -f`); nothing says to look back at Ducter. The card is waiting there, so this is probably fine.
- The rerun prints `Joining …` before `… is already doing tasks for …`.
- As root, `/usr/local/bin/ducter` links into `/root/.local/bin`, which other users can't reach. Harmless (they get no `ducter`), and a root worker is a system service anyway.
- The worker's own name in `worker.json` stays the hostname after a rename at the home; only the worker's own terminal lines show it.

## What a person on a LAN with hel (public) would see

INFERRED from this run and `lend.ts`: the card offers hel's public address (`https://<domain>`),
no same-network note. On the LAN box the line does the same steps as steps 3–8 above (the reach
check is an outbound HTTPS request to hel; nothing comes in), and the card goes from
waiting to joined to here within about a second of the service starting. The one thing they must
do next is sign an agent in on that box (Claude Code or Codex in its terminal); until then a task
named for it gets one line saying so (F1's fix), and the card said it already
(「那台电脑上还没有登录 AI agent。登录一个，任务才能在那儿跑。」).

## Cleanup

Both colima profiles deleted; both scratch homes stopped by PID (their partner `claude`
processes ended with them); the scratch folders and the two `~/.claude/projects` folders the
homes made removed. `~/.ducter`, :7777, hel and the author's machines were not touched by this run
(`~/.ducter/updates/app.json` and `desktop.json` changed during it, from the author's own Ducter
app, whose data folder that is).

## Implications for Ducter

- The lend path works end to end on real Ubuntu, user and root: about 11 s from paste to here
  on a first install, 4 s on a rerun, idempotent, surviving a reboot.
- A named computer must never quietly become another (D353); the same holds for any future way of
  naming one.
- Partner-facing refusal lines need a person-facing form wherever they surface (the status
  line was the second place after the New task card).
- A Mac home still can't offer a LAN line without the terminal; the todo stands.

**Summary:** D347's line installs, joins, runs as a user or system service, reports
`joined` → `here` within a second, renames, reruns without spending a code, survives a reboot, and
names an expired code and an unreachable home correctly. Five faults were found and fixed
(D353): a task named for a computer with no agent ran on the home; the status line showed the
partner's instruction; a used code pointed to `ducter pair`; the install printed a home's next
steps; and the Mac app dropped every lend frame (its sheet waited forever on the author's Mac at hel), now decoded, with an 8 s limit and Try again on both clients. Left open: one haiku turn acked a run and then said nothing after the refusal. A task
actually running on the lent VM was not run (no agent there).
