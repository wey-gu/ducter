# Onboarding: First Run (scenarios A1, A2)

> Draft 0 · 2026-11-08 · D33 (v1 = heavy developer + personal AI), D36 (north star), D37 (cartoon).
> The remote-access steps wait on `research/21`.

## Scenario card

**Who**
- *Primary (v1):* a heavy multi-agent developer moving off conductor or herdr. Claude Code
  and/or Codex are already logged in, and dozens of repos sit under `~/dev`.
- *Secondary:* a curious person who has one AI subscription and has never heard the words
  "subagent" or "worktree".

**Feelings**

| Before | After the first 5 minutes |
|---|---|
| Heavy user: tired of babysitting 8 terminals, a little skeptical ("another tool to configure") | "It already knows my machine and my work, and it took something off my plate." (放心, 惊喜) |
| New user: curious, slightly intimidated | "I get it: I talk, it handles things, it only bothers me when it matters." (好用, 赏心悦目) |

**The bar**
- From launch to the first useful result: **under 3 minutes**, and **zero concepts to learn
  before talking**.
- Every setup step is **auto-detected first**. The user confirms rather than fills in.
- Nothing is asked before it is needed: no projects, rules, or extra devices.

## What ships today: the terminal path (2026-11-09)

The cartoon and the in-app checklist below are the target. Until they exist, the first run is a
terminal path plus the desktop's empty conversation. It holds itself to the same bar: detect
first, one obvious next step per screen, zh and en designed together (`LANG`, or
`DUCTER_LOCALE`). Walked live on a sample Mac with a bundle installed into a scratch prefix,
a fresh data folder, and port 7795.

**For each user**

| Who | What they need from the first five minutes | What the terminal path gives them |
|---|---|---|
| Heavy multi-agent dev (Claude Code + Codex + Mem signed in, ~90 repos) | No interrogation; proof it knows the machine | One line "This Mac is ready: Claude Code, Codex, Nowledge Mem, cua-driver"; no name question (Mem has the identity); starters about the three repos touched most recently |
| Consumer (Grok bot / Muse) with one AI plan | Nothing to learn; a name and a face | Ready line, then one question "What should I be called?" (Enter keeps Ducter); the desktop greets by that name; everyday starters if no repos |
| Never heard of a subagent | A next step they can't get wrong | A blocked Mac shows only what blocks ("✗ Claude Code: not installed" + one command), optional things folded into one dim line, and one closing line: run that, then `ducter up` again |

**Screens, in order** (copy keys in `packages/cli/src/i18n.ts` and `apps/desktop/internal/i18n`)

1. `install.sh` (from the bundle): "Ducter is installed", where (`~/.local/bin`), then **Next:**
   one command. If `~/.local/bin` isn't on `PATH`, the next step is the full path, and the
   `PATH` line comes after it as an option. *Verified* (zh and en).
2. First `ducter up`, doctor on a ready Mac: one line (`summary.ready`) and one dim line per
   missing optional thing. On a blocked Mac: only the blocking checks with their fix
   (`formatBlocked`), then `up.blocked`. The full table stays in `ducter doctor`. *Verified*
   (ready: real Mac; blocked: `PATH` stripped to the system folders).
3. The name, once, in a terminal only, and not when Mem is connected: `name.ask` → `name.set`.
   Stored in `<dataDir>/persona.json`; every later `up` sets `DUCTER_PERSONA_NAME` from it
   unless the env already does. A Chinese name sits flush in zh copy ("小鸭准备好了").
   *Verified* in a pty.
4. The banner (`up.ready`): Lives on (this Mac · data folder), Memory, Desktop, and **Other
   devices: "Connect your phone or another computer: ducter pair"** (D54 pairing). The ws
   address shows only when no desktop opened. Core's own `[ducter] …` lines go to
   `<dataDir>/ducter.log` (not with `--headless`, whose logs belong in the journal). Memory
   reads "Nowledge Mem (reading your identity…)" while core is still loading it. *Verified.*
   Pairing connects another Mac's desktop app or a phone: the `ducter pair` link opens the
   phone web client (`apps/web`) and pairs it (A2-P; headless browser only so far, not a real
   phone).
5. The empty conversation, on the Mac and the phone (D149): the partner says hello in its own
   name by the time of day ("早上好呀，我是小鸭。", returning: "早上好呀，小鸭在呢。"), one
   line of what it can do for this person, and 3–4 starters. The line and the starters are
   worked out on the home (`packages/core/src/first-screen.ts`) from names and metadata it
   already has: the connected accounts (mail, calendar, other apps), a 记下了 / Noted line
   from the last three weeks, a task still going, a folder used before, the computers it can
   use, and, only after two tasks in repos, one code starter by project name (never a path,
   always last). A brand-new person gets everyday examples: an email, a trip, a folder, a
   reminder. They rotate by the person's day. Nothing says how they were made. Someone
   returning to an empty conversation sees one timely line instead of the "can do" line,
   when there is one (something waits for them, a wait didn't come true, a result from the
   last day), with 去看看 / Take a look. The partner waves once when the screen appears and
   leans toward the composer while there are words in it (still under reduced motion). A
   starter fills the composer; it never sends. Where Ducter lives is the header's 设备 /
   Devices, not a second link here. *Verified* (unit tests; headless renderer and headless
   Chrome at 390 pt: `.shots/first-screen/`). The repo scan in `firstrun.json` no longer
   feeds the starters (a home on a server would name the wrong machine's repos), and since D204
   there is no scan at all: `ducter up` writes no repo hints. New task's first folder list says
   **还没有文件夹。/ No folders yet.** and offers the ways to get one (this Mac's picker, 找一个文件夹…,
   从 Git 地址加…), never a guess at where the user keeps code.
6. The first result: the first task ever to come back done (live, not a replay, and no other
   finished task in the Log) shows one line with the clay *done* character above the
   composer for 14 s or until Got it, and the header's character shows *done*. Remembered in
   `<dataDir>/desktop.json`, so it happens once per Mac. Reduced motion: no rise-in.
   *Verified* (headless + live, below).

**Live run** (2026-11-09, zh, Mem connected, partner and task on the default models; one sample).
The real `ducter up` from the bundle, the desktop's headless renderer as the client
(`TestLiveFirstFiveMinutes`), and the message 看看 <scratch>/demo/calc 最近有哪些测试没过，修好了告诉我
(a three-test Python repo with an off-by-0.5 bug):

| t | What appeared |
|---|---|
| 0 s | The greeting and three starters about ~/dev/ducter, ~/dev/website, ~/dev/notes (91 repos found) |
| 19 s | The ack: 我去看看 calc 里最近哪些测试没过，并把它们修好。 Then a second partner message restating the plan (redundant; see the report's persona text) |
| 52 s | Task done; the first-result line and the done character |
| 58 s | The partner's result: which 2 of 3 failed and why (`+ 0.5` on line 9), the fix, `python3 -m unittest` 3/3 after, "not committed, on ducter/calc", with Merge / Draft PR / See changes |

Screenshots: `.shots/desktop/firstrun-live-{empty,ack,first-result,result-message}.png`.
A second run after merging main (VPS pairing, protocol v2): ack 3 s, done 46 s, result 60 s.
Ctrl-C exits 0 and quickly, also with a task running and the signal sent to the whole process
group as a terminal does (partner 0 ms, runner ≤ 1 s, now logged). An earlier "exit 1" came
from the test harness signalling its own wrapper shell, not from Ducter.

**Not yet**

- The greeting is the client's empty state in the partner's voice, not a message from the
  partner; it isn't in the Log, so the partner doesn't know it "said" it. Proposed persona text
  for the partner's real first words is in the first-run report (packages/partner is owned
  elsewhere right now).
- The partner doesn't know the user's repos at first run (D204: no scan; `firstrun.json` is gone),
  so "I found 14 repos; the most active is …" (the target in A1 step 6) is neither shown nor said.
- ~~There is no rename in the desktop yet~~: the partner is renamed in place on Partner (D71).
- ~~A double-clickable app doesn't exist~~: see the app path below.

## What ships today: the app path (2026-11-09)

`scripts/make-app.sh` builds `Ducter.app` (desktop binary in `Contents/MacOS`, the `ducter` CLI
in `Contents/Helpers`, `AppIcon.icns` drawn by `apps/desktop/cmd/appicon` from the clay
character) and a `.dmg` with an Applications shortcut. Bundle id `co.nowledge.ducter` (helper
`co.nowledge.ducter.cli`), following `co.nowledge.con` and `co.nowledge.mem.desktop`. With the
Nowledge Labs Developer ID in the keychain, both the app and the `.dmg` are signed (hardened
runtime, timestamp), notarized, and stapled, so a friend's first open is the ordinary "downloaded
from the Internet" prompt with Open, and no System Settings detour. The helper's only
entitlement is `com.apple.security.cs.allow-jit` (`scripts/macos/ducter-cli.entitlements`:
without it Bun's JIT dies under the hardened runtime). Without an identity the script falls back
to ad-hoc signing and the README's Open Anyway steps.

**Lifetime (D56: Ducter keeps running when the window closes).** The window is a view;
Ducter is the one doing the work, so neither closing the window nor ⌘Q stops it.
- *Closing the window* (⌘W, the red button) hides it. The Dock icon, or opening the app again,
  shows it as it was (MyGo: `Window.OnClose` prevented + `Hide`, `App.OnActivate` → `Show`).
- *Ducter itself* runs as a per-user LaunchAgent, `~/Library/LaunchAgents/co.nowledge.ducter.agent.plist` (`<bundle-id>.agent`)
  (`ducter up --no-desktop`, `RunAtLoad`, `KeepAlive` on a crash only, logs to
  `<dataDir>/app.log`, the app's `PATH` and `DUCTER_*` in its environment,
  `AssociatedBundleIdentifiers` so Login Items shows it as Ducter). The app writes and loads it
  on first run, says so in one line on the "Waking Ducter up…" card ("From now on Ducter keeps
  working when you close the window; to stop it, choose Stop Ducter in the menu"), and attaches
  to it on every later launch. A moved app rewrites and reloads it.
- *⌘Q* quits the window app only. *Why:* people press ⌘Q out of habit to tidy up; a partner
  that loses its tasks to a reflex is not 放心. Stopping the work is a different intent, so it
  gets its own, explicit place.
- *Stop Ducter / 让 Ducter 歇着* (app menu, subtitle "Stops every task until you wake it"):
  unloads the agent and removes the plist, so it stays off, at login too. The window shows
  "Ducter is resting" with **Wake Ducter**; the menu item turns into Wake Ducter.
- *The Dock badge* counts what waits for the person (the header's "needs you": tasks waiting
  plus open partner decisions), nothing else. No menu-bar extra.
- *Fallback:* run from the disk image or a translocated copy (paths that go away), Ducter is the
  app's child instead (`DUCTER_PARENT_PID`) and stops with the app.
- A Ducter already running (from `ducter up` in a terminal) is attached to and left alone.
- *Note:* macOS may post "Background Items Added" when the plist is loaded; with an ad-hoc
  signature it names the item after the binary. Not seen in our run (not looked for).

**Screens** (copy keys `setup.*`, `cli.*` in `apps/desktop/internal/i18n`; views in
`apps/desktop/internal/views/setup.go`; headless shots `.shots/desktop/app-*.png`)

1. Checking this Mac (napping character). The app first fixes its `PATH` (login shell's
   `PATH` + `~/.local/bin`, Homebrew, Bun …), since Finder starts apps with the system folders
   only, then runs `ducter doctor --json` with `DUCTER_LOCALE` set to the window's language.
2. Blocked: only what blocks. A check doctor marks with an `action` (D70) gets its **own button
   that runs the official fix inside the app** (see "No terminal, start to finish" below);
   anything else keeps Copy and **Run in Terminal** (a `.command` file opened with
   `open -a Terminal`: no Automation permission prompt). URL fixes get "Open the page". With
   no AI tool signed in, the other one is offered quietly under the first ("或者用 / OR").
   Optional misses fold into one line. Re-checks on return to the window, every 10 s, and every
   3 s while a sign-in waits in the browser.
   - **All set / 好了** (the done character, ~1.6 s) when the person fixed something, then on.
3. The name, once, skippable, written to `persona.json` as the CLI does; skipped when Nowledge
   Mem is healthy or `DUCTER_PERSONA_NAME` is set.
4. Waking {name} up… then the conversation. Its first screen comes from the home (D149); the app
   shows everyday starters until those words arrive.
5. Failed / stopped: the last lines of `app.log`, its path, Try again.
6. After the partner's first reply, once: "Use ducter in Terminal too?" → symlink
   `~/.local/bin/ducter` → the app's CLI. Never replaces a real file; not offered from a disk
   image or a translocated copy; prints the `PATH` line if `~/.local/bin` isn't on it.

**Verified live** on macOS 15.7 (the DMG built, mounted, the app copied to a scratch folder,
launched with `open`, `dev.env` pointing at a scratch data folder and port 7798, sonnet):
doctor + `up` took ~4 s from open to "Ducter is up"; repo starters showed on the first launch;
a message got its reply in 2.5 s; (before D56) ⌘Q, ⌘W and `kill -9` each stopped the child
backend. **Keep-running, live** (scripted model, port 7870, scratch data folder): first launch loaded
the LaunchAgent (`state = running`, parent pid 1); a 90 s task was started, the window closed
with ⌘W (app alive, window off screen), the task finished while hidden, `open` (the same
reopen event as a Dock click) brought the window back showing that result; a partner decision
set the Dock badge to "1" (`lsappinfo` StatusLabel); ⌘Q quit the app while the same Ducter
process kept listening; a relaunch attached to it; Stop Ducter (menu) removed the plist and
freed the port, the card read "Ducter is resting"; Wake Ducter reloaded the agent and the
window came back with its history. Clicking the Dock icon itself was not driven (the Dock's
accessibility tree was empty to the driver). Under the hardened runtime: the helper re-signed
ad hoc with `--options runtime` and `ducter-cli.entitlements` (allow-jit), the app with
`--options runtime`, label `co.nowledge.ducter.agent`; launchd ran it (`state = running`), a
task ran to done, ⌘Q left it listening. The Developer ID–signed, notarized build itself was not
run as a LaunchAgent here (its signature differs only in the identity). The Gatekeeper dialog for a
quarantined copy ("“Ducter” Not Opened", Done / Move to Trash) and the "Open Anyway" button in
Privacy & Security were seen; pressing Open Anyway was not (it needs the owner's password).
**Headless only:** the blocked, name, failed screens and the CLI offer (a fake backend in
`setup_test.go`); a real blocked Mac was not walked. **Not verified:** a helper binary still
carrying quarantine after Open Anyway (the app clears the flag on its own helper, best effort).

**Signed build, verified 2026-11-09** (D55): Apple accepted both submissions; on a copy of the
DMG with a Safari quarantine flag, `spctl -a -t open --context context:primary-signature` says
*accepted, source=Notarized Developer ID*, and so does `spctl -a -vv` on the app in the mounted
image and on a copy of it (`syspolicy_check distribution`: ready for distribution). The copied
app, launched with a scratch `dev.env`, ran doctor and `ducter up` under the hardened runtime
and served in ~5 s; quitting stopped the helper. The first-open "downloaded from the Internet"
dialog itself was not clicked through (it needs a person).

## The title moment (D87, 2026-11-09)

The macOS app's first launch opens on a few seconds of title before the setup card. Code:
`apps/desktop/internal/views/title.go`; art `apps/desktop/internal/theme/art/title` (made by
`tools/art/`), sound `apps/desktop/internal/theme/sound` (made by `tools/sound/`, sources in
`tools/sound/SOURCES.md`). Prototype (the same renderer in a canvas, three art directions and the
sound variants side by side): https://claude.ai/artifact/BC1i6YEt8EKQ5VtMeCjEw8

**Who, and what they feel.** All three users meet it once, before anything is asked of them.
Before: a download, a new app, a little wariness. After: the sense of being greeted by someone who
was already there, waiting (放心, 惊喜, 赏心悦目). It starts with zero setup: it *is* the first
thing; nothing to learn, any key goes on.

| t | Picture | Sound |
|---|---|---|
| 0–0.3 s | Night, nearly black | silence |
| 0.3–3.7 s | Light rises from under the clouds at the left; the sky, the far islands, Ducter's island appear in layers; the view pushes in 3% over 9 s with parallax and rises slightly; Ducter sleeps, breathing (4.4 s); motes drift into the light | the swell |
| 3.5 s | Eyes open: half, a beat, wide; a small look up; a breath of light around it | the tone at 3.55 s, the chord resolves |
| 4.3–6.2 s | The clay logotype lit from the left, then a light passes over it | the tone blooms in the room |
| 6.6 s | 按任意键开始 / PRESS ANY KEY, small and letter-spaced, then breathing 60–100% | the tail fades to silence |
| key or click | Before 6.6 s: 0.3 s; after: 0.7 s, the dawn floods the window into the paper, then the setup card (Ducter awake) | fades 0.3 / 0.5 s |

**Sound.** Six candidates (`tools/sound/build.sh`; levels by ffmpeg ebur128, all about −20 LUFS,
true peak −4.5 to −9.6 dBTP, the tone's onset within 7 ms of 3.55 s): A felt piano + strings
(IV(add9) → V(sus4) → I, the major third arriving with the eyes; the first pick),
B glass + breath pad, C bowed vibraphone + low organ (a real 4–3 suspension on the beat; **the
author's pick after hearing them in the app, shipped since 2026-11-09**), and the
endings of Chopin's Nocturne Op. 27 No. 2, Schubert's Sonata D 664/II and Chopin's Prelude
Op. 28 No. 13 in Musopen's CC0 / public-domain recordings, cut so the final chord lands on the
beat. All six are in the prototype's sound picker; only A is in git, the others stay in the
evidence folder. The art direction picked is A, dawn on the island.

**Rules.** Once per Mac (`desktop.json` `titleSeenAt`, written when it is left); Settings › Look and sound
has 再看一次开场 / Replay the intro and the intro's Sound switch with 听一下 / Play (D150). Not shown when macOS opened the app at
login (`WasOpenedAtLogin`, asked once the app has launched); it waits for a real open. Its clock
starts when the window is active, and only then does the sound start. ⌘ shortcuts pass through
(⌘Q quits). The first check of this Mac (doctor) runs underneath, so the setup card is usually
ready when the title ends.

**Verified** (2026-11-09, macOS 15.7, the desktop binary on a scratch `HOME` and data folder,
driven with cua-driver): the title shows on a fresh data folder and not on the next launch; Space
leaves it and writes `titleSeenAt`; `--mygo-opened-at-login` shows no title and leaves
`titleSeenAt` unset; while it plays, coreaudiod holds an audio-out assertion for the app's process
(BuiltInSpeakerDevice), so the sound reaches the output; CPU about 10–20% of one core during the
moment, about 4% once it only breathes (30 fps). Headless (`go test ./internal/views -run Title`):
skip and leave timing, the sound's start and fades, silence under reduced motion and with sounds
off, waiting for an active window; frames with `DUCTER_TITLE_SHOTS=1`. Evidence:
`~/dev/ducter-evidence/title/`. **Not verified:** that it sounds right (nobody listened; levels
were checked by numbers), a real Retina full-screen window, the signed bundle.

## No terminal, start to finish (D70, 2026-11-09)

From double-clicking the disk image to the first result, a person who has never opened
Terminal doesn't need to. Code: `apps/desktop/internal/views/onboard.go` (fix rows, All set,
the background line), `websetup.go` (上网), `asks.go` (notifications, phone, Mem),
`internal/local/jobs.go` (background fixes), `cua.go`, `macos.go` + `btm_darwin.go`; copy in
`apps/desktop/internal/i18n/onboard.go`; doctor's `action` in `packages/cli/src/doctor.ts`.

**Who, and what they feel.** The fresh user (never heard of a subagent) meets a button, not a
command. The heavy developer still gets "在终端里做 / Do it in Terminal" whenever something
fails, and on a ready Mac sees none of this.

**The screen** (redone after the author's review: "设计排版有问题…那个闪烁的灯一般认为是 ai slop"):
- The clay character carries the mood: *needs you* while waiting for a choice, *working* while
  something installs or a sign-in waits in the browser, *done* on All set. Nothing else blinks,
  pulses or glows; no colored dots, no status pills.
- "Ducter 用你已有的 AI 订阅干活。选一个，装好、登录就行 / Pick one, install it and sign in", then one
  flat list on one left edge, one row per option (Claude Code, Codex), hairlines between rows,
  the same row height. Each row: the tool's name, **one** status line in plain words, the action
  at the row's right (安装 / 登录; the first row's is primary). Working replaces the status line
  in place ("正在安装 · 已经 10 秒 / Installing · 10s so far", "在浏览器里登录，好了会自动继续")
  and the action becomes the text button 取消 / Cancel. A failure replaces it with the reason in
  words; the action becomes 再试一次 / Try again, with "在终端里做" under it.
- Signing in adds two quiet text buttons on the same left edge: "浏览器没打开？" (the page
  again) and "网页给了你一串代码？" (a field that hands the code to the command).
- No "Check again" (checks are automatic) and no optional line here: the footer is one quiet
  "好了会自己继续 / This continues by itself". Nowledge Mem is offered later (below).
- The same rule holds for 上网's steps: one flat list, a check for a done step, a number for the
  others, the open step's status line and its action at the right; the drawn System Settings row
  is static.

**The AI tool** (one button per row; the command is doctor's `fix`, so the app and `ducter
doctor` never disagree):

| Row | What the button runs | Verified |
|---|---|---|
| Claude Code, not installed | `curl -fsSL https://claude.ai/install.sh \| bash` (native installer; everything under `$HOME`, refuses sudo) | **Verified** twice into a scratch `HOME`: no TTY, exit 0, `~/.local/bin/claude` 2.1.319, `auth status` → `loggedIn:false`; once from the app itself (button → 4 min on this network → the row turned into 登录 Claude by itself) |
| Claude Code, signed out | `claude auth login` | **Verified** up to the browser: from the app it opened the browser with the `localhost:<port>/callback` redirect (automatic finish), and printed the manual-code URL as an OSC-8 link, which the row offers as "浏览器没打开？". A page that shows a code instead of returning: "网页给了你一串代码？" opens a field that writes it to the command's stdin. **Not verified:** a completed real sign-in (it would sign a scratch home into the author's account); the finish was walked with a stand-in `claude` |
| Codex, not installed | `curl -fsSL https://chatgpt.com/codex/install.sh \| sh` (the README's standalone installer; no Homebrew needed), run with `CODEX_NON_INTERACTIVE=1` | **Verified** into a scratch `HOME`: exit 0, `codex-cli 0.167.0`, `Not logged in`. It adds a `PATH` block to `~/.zprofile` (its own behavior) |
| Codex, signed out | `codex login` (local server on :1455, browser) | Printed URL **verified**; it opens the browser with `open` (it ignores `BROWSER`), so the app path was not walked to the end |

Failure says what went wrong in words and the one thing to do: no network ("连不上网…连上网以后再
试一次", from curl's own messages), a folder it can't write, a sign-in that didn't finish, or the
installer's last three lines; **Try again** and **Do it in Terminal**. Cancel stops the whole
`curl | bash` process group (**verified**: no installer process left). Offline the doctor still
answers, so the screen shows; only the install itself fails, with that line.

**上网 / Browse the web: three steps, only when it's picked.** Never upfront: the tile reads
"三小步就能装上 / Three small steps" and nothing happens until the person picks it on the devices
screen. Then a sheet over the stage (as the connect code), one step open at a time, each turning
green by itself (`cua-driver permissions status --json` every 1.5 s; it never prompts):

1. 装上浏览器驱动: cua-driver's canonical installer (`cua.ai/driver/install.sh`, the one
   `cua-driver update --apply` runs; CuaDriver.app into /Applications, sudo-free when it's
   writable), with `--no-connect --no-test --no-modify-path`; an old driver gets 更新 →
   `cua-driver update --apply`. **Not run here**: it would replace the author's
   /Applications/CuaDriver.app; read line by line instead (flags, /Applications, no TTY skips
   its own guide). Walked with a stand-in driver.
2. 允许它用鼠标和键盘: the literal pane name "辅助功能 / Accessibility", a small drawn picture of
   the CuaDriver row with its switch on, **前往设置 / Take me there** (runs `cua-driver
   permissions grant`, its own guide), and "只打开系统设置 / Just open System Settings".
3. 允许它看到屏幕: "录屏与系统录音 / Screen & System Audio Recording", same shape.

When all three are green, Ducter's window comes back to the front by itself, the guide is
stopped, and 上网 lands in its slot. Core looks at cua-driver again when the add arrives instead
of answering from its one-minute probe cache (`packages/core/src/devices.ts`). **Verified
natively** with a stand-in driver (zh and en): steps advanced by themselves, "只打开系统设置"
opened Screen & System Audio Recording, Ducter came back to the front when the second switch
turned on, core re-probed and 上网 went from "not yet" to "added". **Not verified:** a first
real grant, and the "CuaDriver was prevented from modifying apps" notice (cause still unknown).

**macOS asks, one at a time** (none at launch; each has 稍后 / Later: away for 3 days, asked once
more, then never; answers in `desktop.json` `asks`):

| Moment | When | What the card says and does | Verified |
|---|---|---|---|
| Background item | The first start of the LaunchAgent | A line under "马上就好" before macOS posts its own notice ("Background Items Added"), naming System Settings › General › Login Items & Extensions | Line: headless. The notice: **not seen** (a scratch `HOME`'s plist isn't tracked by macOS; registering a test item in the real `~/Library/LaunchAgents` was refused by the session's permission guard). en title from the BTM agent binary; zh wording deliberately doesn't quote it |
| Background turned off | `SMAppService statusForLegacyURL:` says *requires approval* (Login Items › 允许在后台 off) | Ducter runs as the app's child instead of failing; a card "现在关掉窗口，Ducter 就会停下" + **打开登录项** (`x-apple.systempreferences:com.apple.LoginItems-Settings.extension`); it notices the switch by itself and moves to the background once nothing is running | Status call **verified** on this Mac's own agents (running ones *enabled*, unloaded ones *requires approval*); the card headless; a real toggle not walked |
| Notifications | After the first result's line is put away | "有事要你拿主意时，用通知告诉你？" → 好 shows one notification right away, which is when macOS asks; denied → **打开通知设置** (System Settings › Notifications; the `?id=` doesn't scroll to the app's row on macOS 15, so the copy names the path) | Card and denied path: headless. Sending on "needs you" while the window isn't focused: built, **not seen** (needs a signed bundle) |
| Phone | On a later result | "在手机上也能找到我" → the connect code's QR in the card; no outside address → says so plainly | Headless (QR and no-address) |
| Nowledge Mem | Never in the conversation (D169: Ducter is whole without Mem; the one mention is Settings › 记得什么) | The empty conversation's line "想让 Ducter 记得更久？装上 Nowledge Mem" is removed; `TestOnboardNoMemLineInTheEmptyConversation` keeps it out | Headless |

Every System Settings link was opened on macOS 15.7 and landed on the named pane (**verified**:
Accessibility, Screen & System Audio Recording, Login Items & Extensions, Notifications).

**Screenshots.** Native (a scratch `HOME`, the real app bundle, cua-driver), after the redesign:
`.shots/desktop/onboard-native-{fresh,installing,signin,web-driver,web-accessibility,
web-screen,web-ready}-{zh,en}.png` (zh also web-waiting); before it:
`onboard-native-before-*.png`; other native states from the first pass (canceled, allset,
name, conversation, devices, signin-ready) are the earlier styling of the same flow. Headless, every state in both languages:
`onboard-{ai-fresh,ai-installing,ai-offline,ai-signin,ready,background-note,background-off,
web-driver,web-installing,web-accessibility,web-screen,web-ready,ask-notify,ask-notify-denied,
ask-phone,ask-phone-noaddress,ask-phone-qr,mem-line}-{zh,en}.png`
(`DUCTER_SHOTS=1 go test ./internal/views -run Onboard`).

**Not yet**
- A task that needs the browser before 上网 is set up: the partner explains; the card doesn't
  open from the conversation (no structured signal yet).
- The disk image's first open (Gatekeeper) and moving the app out of the disk image are not
  designed in-app: the app can't speak before macOS lets it open.
- Codex sign-in from the app opens the real browser, so it was not walked here.

## The cartoon (≈ 25 s, skippable, replayable from Settings)

Pebble style: cream paper, chunky shapes, press shadows, bouncy motion. No brand logos. No
text walls, just one short line per scene (zh + en).

| # | Picture | Line (zh / en) | Concept taught |
|---|---|---|---|
| 1 | A pebble pops out of the paper, blinks twice, waves | 你好，我是 Ducter。 / Hi, I'm Ducter. | Your partner has a name and a face |
| 2 | A speech bubble from off-screen; Ducter listens, nods | 你只管说。 / Just tell me. | The conversation is the whole interface |
| 3 | Ducter flicks small pebbles onto a laptop and a little server box, which light up | 我把事情分出去做。 / I hand things out. | Tasks run on your devices |
| 4 | *(to redo once the metaphor is chosen; `research/24`: a battery reads as device power and must not be used. Likely an AI-plan block with cords to each device)* | 用的是你自己的 AI。 / Powered by your own AI plan. | Subscriptions stay yours |
| 5 | The pebbles work quietly. One turns orange, raises a tiny hand, and Ducter carries it to you | 只有需要你时，我才来找你。 / I only come to you when it matters. | Attention; silence means success |
| 6 | You tap **好 / Go**. The pebble bounces, turns mint green, and returns holding a tiny receipt | 做完了，还会告诉你我怎么确认的。 / Done, and how I checked. | Decisions with defaults; done = evidence |
| 7 | All the pebbles roll into a tray labelled **手头的事 / On hand** | 想看全部，随时打开。 / See everything, anytime. | The overview exists, optionally |
| 8 | The tray slides aside and a checklist assembles from the pebbles | 开始前只需要三样。 / Three things and we're ready. | *Becomes the real setup screen* |

**The signature moment:** scene 8's last frame *is* the live setup screen, the **Isles** map (`ui.md`). The cartoon doesn't
end; it turns into the product. Pebbles settle into the three checklist rows, and each
row's detection result animates in.

## First-run flow

1. **Install**
   - *Mac:* the desktop app holds the main process and a local worker. One download, one
     launch.
   - *VPS:* a one-line installer starts the main process and prints a QR code / link that
     opens the client and pairs it. *Built so far (D54), terminal-first:*
     `sh install.sh --service` → systemd user service → a pairing code, link and QR in the
     terminal; the Mac app's first run has "我的 Ducter 在另一台机器上 / My Ducter is on another
     machine" → **连接到你的 Ducter / Connect to your Ducter** (address + 连接码). The browser
     setup page with relayed AI logins (Q17) is next; the exact login commands it relays are in
     `research/29`.
2. **Cartoon**, then the **live checklist**, auto-detected:
   1. **This device**: ✓ ("MacBook Pro"; D204: no repo count, Ducter doesn't scan for repos).
   2. **Your AI**: lists the logged-in harnesses (Claude Code ✓, Codex ✓/✗). A missing one
      gets a **Connect** button that runs its official login in a sheet. At least one is
      required. An API key is the fallback path.
   3. **Your memory (optional)**: Nowledge Mem detected → "connect" / "skip for now".
3. **Name and look (optional, 10 s):** "Ducter" is prefilled, with 4 face colors. Skipping
   is fine.
4. **First words from the partner.** It must deliver value immediately:
   - *Mem connected:* it opens with context. "I see you're in the middle of HawDB CI
     concurrency. Want me to look at #1592 first?"
   - *No Mem:* it offers three concrete starters drawn from what it detected. Example:
     "I found 14 repos. The most active this week is hawdb. Want me to get familiar with it
     and tell you what's open?"
5. **The first task runs.** When it lands as a card, the chip animates into the On hand
   button once, with the line "I keep things here."
6. **Later, only when needed:**
   - pairing another device (when a task needs it, or the user says "I also have a VPS");
   - the phone web link ("find me on your phone" QR);
   - rules, created from conversation;
   - routines;
   - the browser, the first time a task needs the web (below).

## The browser, first time (live on a sample Mac, 2026-11-09)

These are the setup moments a browser task hits on a Mac. They should become one checklist row
("Browser: ✓ ready / Set up"), shown only when the first web task needs it. Design pending.
Setup: cua-driver 0.44.0, Chrome 157, macOS 15, partner and task on Sonnet.

**Before the first web task**

1. **cua-driver must be new enough.** The typed browser tools (`browser_prepare`,
   `get_browser_state`) arrived in cua-driver-rs 2026-07. 0.6.8 has only the legacy `page`
   tool. The fix is `cua-driver update --apply`; it installs into `/Applications`, so the user
   approves it. *Verified:* with 0.6.8, Ducter refuses the task and the partner explains the
   fix in plain words, instead of opening a task that cannot work.
2. **macOS privacy grants belong to CuaDriver**, not to Ducter or the terminal: Accessibility
   and Screen Recording for `com.trycua.driver`. For a fresh user, `cua-driver permissions
   grant` opens the dialog and they click Allow for both in System Settings → Privacy &
   Security. *Verified:* the 0.6.8 → 0.44.0 update kept both grants (same team ID), and the
   browser tasks raised no prompt. *Not seen:* the first-time prompt sequence, because the
   grants already existed.
3. **A vendor-signed Google Chrome (or Edge) in `/Applications` is required.** *Inferred*
   from cua-driver docs; the author has Chrome, so nothing appeared.

**While a browser task runs (what the user sees)**

4. **A second Chrome window appears.** It is a separate Chrome on Ducter's own profile
   (`<dataDir>/browser-profiles/<persona>`), not the user's Chrome. *Verified* from the
   process args and the window list.
   - It opens at 1200×900 top left, then Ducter parks it bottom-right at about 60% size
     (907×661 on a 1512×982 display), behind the user's work. *Verified* on a desktop
     capture.
   - Ducter sets the clay avatar as its Dock tile; Chrome accepted the call. *Not seen*: the
     Dock was hidden on a sample Mac. Without this, it is an identical second Chrome
     icon.
5. **Focus.** Left alone, the new Chrome makes itself the frontmost app for the whole task,
   so the user's typing goes into Ducter's browser (*verified*: about 29 s in front). Ducter
   now hands focus back within half a second (*verified*).
6. **The window goes away on its own** when the task reports done, 20–40 s after it
   appeared. *Verified.*
7. **Sign-ins persist across tasks.** *Verified* with a cookie: one task set it, the next
   task saw it. This depends on Ducter quitting the browser cleanly; cua-driver's own
   `end_session` kills Chrome and lost a cookie set seconds earlier (*verified*).
8. **Signing in for a task** (*verified* on the-internet.herokuapp.com with its public demo
   login):
   1. The task opens the login page and asks: "Please type the username and password
      yourself in the Ducter browser window on this Mac and click Login, then tap Go."
   2. The user types in that window; the model never sees the password.
   3. After Go, the task reads the signed-in page and reports.

   Two traps came up and are fixed in the brief:
   - Go means "take the default". When the default was "skip this step", Go skipped the
     sign-in, and the partner still told the user the task was reading the page. Now the
     default is "check that you are signed in and carry on".
   - The driver closes an idle browser after 300 s (*verified*: the window vanished at 5:00
     while the task waited). A sign-in finished well before that was kept on disk. A slow
     sign-in (2FA, a long form) can lose the window. This is open in `todo.md`.
9. **"CuaDriver was prevented from modifying apps on your Mac"** (a macOS Privacy & Security
   notification) appeared during the session. *Cause not identified*; browser tasks worked
   regardless. It needs a look before onboarding copy is written.

**Latency and cost (one sample each):**
- Lookup tasks took 25–50 s from task start to report.
- The partner's first line took 5–31 s; the 31 s case was a cold start.
- An HN lookup used 332k input tokens before the token diet and 140k after (mostly cache
  reads). D239 gave back Claude Code's own built-ins (less Agent and Workflow), about 5.5K
  tokens a request (research/75); not re-measured live.

## Ideas to decide (heavy-user delight)

- ~~Adopt running sessions~~: not in v1 (D45). Users start fresh and grow into it.
- **Conductor import:** read its workspaces/worktrees, if any are left on disk.

## Open

- Remote-access step: Ducter Edge on `workers.dev` (`research/21`). It is about 3 steps, 4 on iOS (Home Screen install for push). CN users default to their own domain (Q18): `scripts/caddy-setup.sh` + code pairing (D54).
- Whether the cartoon is pre-rendered (Lottie/Rive) or native MyGo animation. Native keeps
  the "cartoon becomes the UI" transition seamless.
