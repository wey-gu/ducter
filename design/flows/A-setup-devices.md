# Flows A: Setup and Devices (A1–A5)

> Draft 1 · 2026-11-08 · Group A of `design/scenarios.md`. Builds on `onboarding.md`,
> `system.md`, `focus-window.md`, `focus-window-states.md`, `research/21` (remote access),
> `research/27` (ability naming; the noun was dropped in D66), and the concept-art verdicts (`design/art/concepts/README.md`).
> Artboards: `A*.dc.html` in the flows prototype project (list at the end).
>
> **Status: drafted, not reviewed.** Words marked **[gap]** are not yet in the glossary
> (`product-model.md` §1) and must go through the change loop before they ship. They are
> collected in §6.

## 0. Smoothness rules this group is held to

1. **Detect first, then confirm.** The user never types something Ducter could have found:
   hostnames, repos, logged-in harnesses, Mem, Tailscale, time zone, language.
2. **Zero concepts before talking.** First run ends in the conversation, not in settings. No
   project, rule, device, or ability is asked for before a task needs it.
3. **No dead ends.** Every failure screen has a working next step and a way back. "Skip for now"
   is always allowed except for the one hard requirement: some AI the partner can think with.
4. **Problems show where they live.** A sleeping device shows on its own card and on the tasks
   it holds, in plain words, never as a generic error toast.
5. **Silence when nothing is needed.** Short sleeps, brief reconnects, and quota waits with a
   near reset never produce a message or push. They only update a reason line.
6. **No silent fallback** (principle 14). Anything that changes *who* does the work (model,
   harness, device) is said in one line with a default.

---

## A1 · First run

### Scenario card

| | |
|---|---|
| **Who** | *Primary:* heavy developer on a Mac, Claude Code and/or Codex signed in, dozens of repos under `~/dev`. *Secondary:* consumer personal-AI user (Grok bot / Muse) with one AI subscription. *Also:* fresh user who has never heard "subagent". VPS path: mostly the heavy developer who wants Ducter always awake. |
| **Before** | Heavy dev: skeptical, "another tool to configure". Consumer: curious, a little afraid of terminals. Fresh: intimidated. |
| **After (≤ 3 min)** | "It already knows my machine and my work, and it took something off my plate." (放心, 惊喜) / "I just talk to it." (好用) |
| **Emotional value** | Being *recognized* (it found my repos, my logins) instead of *interrogated*. |
| **How it starts** | Mac: download, drag to Applications, open. VPS: paste one line into an SSH session. |

### Flow A1-M: Mac desktop app

1. **Launch.** The app starts the main process and a local worker in the background. The cartoon
   starts at once (detection runs underneath it, so it costs no waiting).
   - *Skip* (top-right, always visible) jumps to step 3 with detection already done or in flight.
2. **Cartoon, scenes 1–7** (`onboarding.md`). While it plays, Ducter detects:
   - this device: model name, OS, free disk;
   - repos: git checkouts under `~/dev`, `~/code`, `~/src`, `~/Projects`, `~/work`, `~` depth 2;
   - harnesses: `claude`, `codex`, `pi` binaries and their login state;
   - Nowledge Mem: local server on `127.0.0.1:14242`, or `nmem` config;
   - Tailscale (`tailscale status`), language, time zone.
3. **Scene 8 becomes the live setup screen** (artboard `ASetupChecklist`). Pebbles settle into
   three rows; each row's result pops in as its check finishes.
   1. **This device** · "MacBook Pro · 在 ~/dev 找到 14 个代码库".
      - Fails only if the runner can't start (corrupt install) → "重新打开 Ducter" + "看日志".
      - 0 repos found → row still ✓: "没找到代码库，也没关系" (consumer users).
      - macOS folder access: Ducter does **not** ask for Documents/Desktop access up front. It
        asks the first time a task needs a protected folder (C-group).
   2. **Your AI** (required, at least one).
      - Each detected harness shows ✓ with its account plan if readable ("Claude Code · Max").
      - A detected but signed-out harness shows **连上 / Connect** → its official login in a
        sheet (A4 flow H-1). Optional if another one is ✓.
      - None installed → three choices, in this order:
        1. **装上 Claude Code / Install Claude Code** (Ducter runs the official installer, then
           login);
        2. same for Codex;
        3. **用 API key / Use an API key** (paste; validated live; stored in the vault).
      - The *Start talking* button stays disabled with the reason "先连上一个 AI" until one
        row is ✓. This is the only blocking step in A1.
   3. **Your memory (optional)** · Mem detected → **连上 / Connect** (default highlighted) or
      "先不用 / Not now". Not detected → row reads "以后也可以加 / You can add this later",
      collapsed, no button pressure.
4. **Name and look (inline, optional).** Below the rows: the partner's face, name field
   prefilled "Ducter", 4 face colors. Editing is optional; it never gets its own screen.
5. **Start talking** (`setup.start`). The checklist folds into the conversation; the partner's
   face slides to the header. Total taps for the common heavy-dev case: **1**.
6. **First words** (`onboarding.md` step 4), drawn from what was detected:
   - Mem connected: opens with context and one concrete offer.
   - No Mem, repos found: "我找到 14 个代码库，这周最常动的是 hawdb。要我先熟悉一下，告诉你有哪些
     没收尾的事吗？" + two more starter chips.
   - No repos (consumer): three everyday starters ("帮我整理这周的待办", "查一下…",
     "每天早上给我一份简报").
7. **First task lands** as a card; its chip flies to the On hand button once with "我把事情放在这儿".
8. **Later, only when needed** → A2 (phone, more devices).

**Failure and branch paths**
- *Detection still running when the cartoon ends:* rows show a small working pebble; the user can
  already press Start talking if Your AI is ✓.
- *Harness binary present but blocked* (known-bad CLI version, `system.md`): row shows
  "Claude Code 2.x.y 有已知问题 · 更新" with **更新 / Update** (runs the harness's own updater).
- *Offline at first launch:* everything local still detects; Your AI row says "连不上网，登录要
  等联网 / No internet; sign-in needs a connection". Start talking stays disabled only if no harness
  is already signed in (signed-in harnesses work once online).
- *User quits mid-setup:* next launch resumes at the checklist, cartoon not replayed.
- *Way back:* Settings → "再看一遍动画 / Replay the intro"; Devices page holds everything the
  checklist set.

### Flow A1-V: VPS one-line install

> *Built so far (D54, 2026-11-09), terminal-first:* `sh install.sh --service` (systemd user
> service, linger, journald) → `ducter pair` prints a code, the address or an SSH tunnel line, a
> link and a QR → the Mac app's **连接到你的 Ducter** card. The temporary browser link, the
> quick tunnel and the relayed logins below are not built; `research/29` has the exact
> headless login commands they will relay.

The VPS case has two problems the Mac doesn't: there is no screen, and the AI logins are usually
missing. The design moves every interactive step into the user's own browser.

1. User SSHes in and pastes:
   `curl -fsSL https://get.ducter.dev | sh` (from the public release, signed; the Worker-served
   installer in `system.md` is for *additional* devices).
2. Installer: installs the binary, a systemd unit, starts the main process and a local worker,
   detects harnesses and repos, then opens a **temporary setup link** through a quick tunnel and
   prints (artboard copy in `setup.vps.*`):
   ```
   Ducter 在运行了 · Ducter is running on vps-1
   用浏览器打开这个链接完成设置（15 分钟内有效）：
   Open this link in a browser to finish setup (valid 15 min):
     https://<random>.trycloudflare.com/setup#c=K7QM-4XPA
   [QR]
   ```
   - The link carries a one-time code; anyone without it gets a blank page.
   - `--domain d.example.com` skips the tunnel and serves setup over its own HTTPS.
   - Quick tunnel blocked (CN, firewall): the installer prints an `ssh -L 7420:localhost:7420`
     command and `http://localhost:7420/setup#c=…` instead.
3. **Browser (laptop or phone): the cartoon, then the same checklist** with VPS-specific rows:
   1. **This device** · "vps-1 · Ubuntu 24.04 · 4 核 8 GB".
   2. **Your AI.** Usually signed out on a fresh VPS. **Connect** runs the harness's headless
      login on the VPS and relays it here:
      - Claude Code: "打开登录页" opens the official page in a new tab; the user pastes the code
        back into Ducter's sheet; Ducter feeds it to the CLI.
      - Codex: device-code login; the sheet shows the code big with **复制**.
      - Escape hatch: "我的 AI 在 Mac 上 / My AI is on my Mac" → pair the Mac as a worker
        (A2-W) and let the partner think there.
   3. **Your memory (optional).**
   4. **Reach from anywhere** (VPS only, because the temporary link is about to expire). One
      button: **登录 Cloudflare / Sign in to Cloudflare** (OAuth in this same browser; free
      account, no card, no domain). Ducter deploys the Edge and claims
      `ducter-<name>.workers.dev`. Alternatives (collapsed): own domain, Tailscale (shown first
      if detected on the VPS).
4. On success the browser **moves to the stable address** and immediately registers this browser
   as the first paired device (passkey prompt, A2-P step 4). The temporary tunnel shuts down.
5. Start talking, first words, first task: as A1-M 5–8.

**Failure paths (VPS)**
- Link expired → `ducter setup` prints a fresh one. The terminal says so on expiry.
- Cloudflare sign-in fails or is refused → keep the temporary link alive for 15 more minutes and
  offer own domain / Tailscale / "先在这台电脑上用 (ssh 隧道) / Use it over SSH for now".
- `workers.dev` unreachable from the user's network (detected by a probe from the browser) →
  explain in one line and offer own domain or Tailscale. Never ship an unstable URL as the
  default (research/21 §5.5).
- Harness login can't be relayed (new CLI flow) → show the exact command to run in their SSH
  session, and watch for success.

### States touched
- No tasks yet. Device: `online` (this device). Abilities: Remote access added (VPS).
- Partner face: idle blink during checklist; nods when each row turns ✓; raises brows on a ✗ row.

### Copy

| Key | zh | en |
|---|---|---|
| `setup.title` | 开始前只需要三样 | Three things and we're ready |
| `setup.row.device` | 这台设备 | This device |
| `setup.row.device.found` | {device} · 在 {path} 找到 {n} 个代码库 | {device} · {n} repos found in {path} |
| `setup.row.device.none` | {device} · 没找到代码库，也没关系 | {device} · no repos found, and that's fine |
| `setup.row.ai` | 你的 AI | Your AI |
| `setup.row.ai.ok` | {harness} · 已登录 | {harness} · signed in |
| `setup.row.ai.signed_out` | {harness} · 还没登录 | {harness} · not signed in |
| `setup.row.ai.connect` | 连上 | Connect |
| `setup.row.ai.install` | 装上 {harness} | Install {harness} |
| `setup.row.ai.api_key` | 用 API key | Use an API key |
| `setup.row.ai.required` | 先连上一个 AI | Connect one AI first |
| `setup.row.memory` | 你的记忆（可选） | Your memory (optional) |
| `setup.row.memory.found` | 找到了 Nowledge Mem | Found Nowledge Mem |
| `setup.row.memory.later` | 以后也可以加 | You can add this later |
| `setup.skip` | 先不用 | Not now |
| `setup.name.label` | 给它起个名字 | Give it a name |
| `setup.start` | 开始聊 | Start talking |
| `setup.offline` | 连不上网，登录要等联网 | No internet; sign-in needs a connection |
| `setup.harness.update` | {harness} {version} 有已知问题 · 更新 | {harness} {version} has a known issue · Update |
| `setup.intro.replay` | 再看一遍动画 | Replay the intro |
| `setup.vps.running` | Ducter 在 {device} 上运行了 | Ducter is running on {device} |
| `setup.vps.open_link` | 用浏览器打开这个链接完成设置（{min} 分钟内有效） | Open this link in a browser to finish setup (valid {min} min) |
| `setup.vps.ai_on_mac` | 我的 AI 在 Mac 上 | My AI is on my Mac |
| `setup.remote.title` | 在哪儿都能打开 | Reach from anywhere |
| `setup.remote.cf` | 登录 Cloudflare | Sign in to Cloudflare |
| `setup.remote.cf.note` | 免费，不用绑卡，不用域名 | Free. No card, no domain |
| `setup.remote.other` | 用自己的域名 · 用 Tailscale | Use my own domain · Use Tailscale |
| `onboard.first.repos` | 我找到 {n} 个代码库，这周最常动的是 {repo}。要我先熟悉一下，告诉你有哪些没收尾的事吗？ | I found {n} repos. The most active this week is {repo}. Want me to get familiar with it and tell you what's open? |
| `onboard.onhand.hint` | 我把事情放在这儿 | I keep things here |

### Motion
- Cartoon scene 8 → checklist: the three pebbles drop into their rows with the Pebble bouncy
  spring (stagger 80 ms). Each detection result **types in** (not fades) when its check returns,
  so the speed of detection is felt.
- A row turning ✓: its pebble turns mint and does one small hop; the face nods once.
- Start talking: the checklist card shrinks upward into the header face (the "cartoon becomes the
  product" moment continues: the product becomes the conversation).
- VPS: the move from the temporary to the stable address is a full-page cross-fade with the
  face staying in place, so it feels like one continuous place.
- Reduced motion: cross-fades only; no hops.

### Edge cases
- Two Ducter installs on the same Mac (old + new): the second launch detects the running main
  process and offers "打开已经在运行的 Ducter".
- User has Ducter on a VPS already and installs the Mac app → see A2-J (join), not a second main.
- Main AI body: the partner itself needs a harness. If the only harness is Codex, the partner
  thinks on Codex. Said nowhere unless asked.
- API-key path: show spend once in the first-words message ("用你的 API key，按量计费").
- Corporate Mac with MDM blocking the runner's network: detected as Your AI ✓ but probes fail →
  the row explains and offers "看日志".

### Open questions
1. Detect Mem *and* offer to create a Mem account in-flow for consumers, or only detect?
   *Proposed:* only detect in v1.
2. Is "Reach from anywhere" on the Mac first run (not just VPS)? *Proposed:* no; offered after the
   first task (A2-P trigger). VPS needs it because its temporary link expires.
3. Does `get.ducter.dev` exist (a project-owned domain), or do we use GitHub release URLs?
4. The quick-tunnel setup link: acceptable to rely on trycloudflare for 15 minutes, given
   research/21 calls it trials-only? *Proposed:* yes, it's never the stable origin.

---

## A2 · Pair a device

Three different things, one mental model: **"add a device" = it shows up on your Devices page
with what it can do.**

| Kind | Example | What it becomes |
|---|---|---|
| **A2-P** phone (web/PWA) | iPhone, Android | a client: talk, decide, get pushes |
| **A2-W** worker | another Mac, a VPS, a home Linux box | a place tasks run (its repos, its harnesses) |
| **A2-J** another desktop | second Mac with the app | client **and**, by default, a worker |

### Scenario card

| | |
|---|---|
| **Who** | P: everyone; it's how the partner reaches you away from the desk. W: heavy dev (VPS, build box). J: heavy dev with two Macs. |
| **Before** | "Pairing" usually means accounts, tokens, port forwarding. Mild dread. |
| **After** | "I scanned once and my phone just works; it even pings me." (顺滑, 惊喜) "The VPS showed up with its repos already listed." (放心) |
| **How it starts** | P: the partner offers once, the first time it would want to reach you away from the desk (see trigger). W: the user says "我还有台 VPS" or a task needs Linux. J: installing the app on a second Mac. |

### Flow A2-P: the phone

**Trigger** (first time, no settings visit needed):
- After the first task finishes, or the first time a decision waits > 10 min while the desktop
  is idle, the partner says once: "要我在手机上也能找到你吗？扫一下就行。/ Want me to reach you on
  your phone too? One scan." with **好 / Go** · "以后再说 / Later".
- Always available: Devices → **加一个设备 / Add a device** → Phone.

1. **Remote access ready?** If the Edge isn't set up yet, this *is* adding the **在哪儿都能用** ability
   (an ability) to the home device. One card, in place:
   - **登录 Cloudflare** → browser OAuth → back in the app: three ticks animate (deploy the
     Edge · claim `ducter-you.workers.dev` · check it from outside). ≈ 20 s.
   - Tailscale detected → it's offered as a second chip "用 Tailscale（只在你的设备之间）".
   - Failure: OAuth cancelled → card stays with the button; deploy fails → one retry + "用自己的
     域名"; probe fails (network blocks workers.dev) → own-domain / Tailscale with the reason.
2. **QR sheet on the desktop** (artboard `APairPhone`): big QR, the 8-character code under it,
   a 10-minute countdown ring, live status "等手机扫码…".
3. **Phone camera → link** opens `https://ducter-you.workers.dev/pair#c=…`:
   - The page shows the partner's face and name and the desktop's name: "把这部手机连到 Ducter？
     来自 MacBook Pro". (Same face = recognition = trust.)
   - **连上这部手机 / Connect this phone**.
4. **Passkey**: the OS sheet (Face ID / fingerprint) creates the passkey; the page makes the
   device key. Desktop status flips to "iPhone 连上了" and the QR card collapses with a bounce.
5. **iOS only, not standalone** (detected): "装到主屏幕，我才能给你发通知 / Add to Home Screen so
   I can notify you" with a 2-frame picture: Share icon → "添加到主屏幕". "先不用" allowed.
   - When opened from the Home Screen (standalone detected), it lands on step 6 directly.
   - iOS < 16.4: skip step 5–6, say "这台 iPhone 收不到通知，打开时能看到一切".
6. **Turn on notifications** (button = user gesture): system prompt → on success, a real test
   push arrives within 2 s: "我是 Ducter，以后有事这样找你。/ It's Ducter. This is how I'll reach
   you." Tapping it opens the conversation.
   - Denied → "好的，不推送。随时可以在设置里打开" (shows how, per OS).
7. **Done → the conversation on the phone**, same Log, same living message.

**Fallbacks**
- Camera can't scan → on the phone, type the address shown under the QR and the 8-char code.
- Code expired → desktop sheet refreshes the code automatically while open; the phone page says
  "这个码过期了，在电脑上刷新一下".
- Scanned by the wrong phone → the desktop shows each newly connected device with **断开 /
  Disconnect** for 30 s in the same sheet, and forever on the Devices page.
- Phone later clears Safari data (device key gone) → passkey re-enrolls it ("用 Face ID 重新连上").
- Lost phone → Devices → that phone → **断开**; or from another device, "全部断开".

### Flow A2-W: a worker (VPS or another Mac/Linux box)

1. **Start**, either:
   - in conversation: "我还有台 VPS" → partner replies with an **add-device card** (one-liner +
     copy button), no page visit; or
   - Devices → Add a device → Mac / Linux.
2. The card shows a command with a one-time token baked in (valid 30 min):
   `curl -fsSL https://ducter-you.workers.dev/i/7Q2M-K4XP | sh`
   - Mac target: also a download button for the app ("或者在那台 Mac 上装 Ducter 应用" → A2-J).
3. User pastes it on the target. The installer installs the runner, dials out to the Edge, and
   reports what it found.
4. **The card updates live in place**: "vps-1 想加入 · Ubuntu 24.04 · Claude Code 已登录 · 6 个代码库"
   with **好，加上 / Go, add it** · **不是我的 / Not mine**. The token proves it came from the
   user's own copy, but the user still confirms the hostname (a leaked one-liner can't silently
   enroll a stranger's box).
5. On Go, the device joins the Devices page; the partner says one line about what it can now do:
   "vps-1 加上了。它有 hawdb 和 ducter-edge，Linux 的活可以交给它。"
6. If a task was waiting for it (e.g. "needs Linux"), that task starts right away.

**Branches**
- No harness signed in on the target → the card says "vps-1 还没有 AI 可用" with Connect (relayed
  login, A4 H-1). The device is still added; tasks needing a harness won't be placed there.
- Runner installed without a token (manual install) → it prints a code + QR; the user approves it
  from any paired client (`system.md`).
- Target can't reach the Edge (egress firewall) → installer prints the reason and the hosts to
  allow; the card shows "还在等 vps-1…" then, after 2 min, the same help.
- Same hostname as an existing device → "要替换原来的 vps-1，还是作为新设备？" (replace keeps its
  history and tasks).

### Flow A2-J: another desktop (second Mac)

1. Fresh app launch on Mac #2. Before the cartoon, Ducter looks for an existing Ducter: mDNS on
   the LAN, and a "Ducter is on another device" deep link if the user came from one.
   - Found on LAN: "在这个网络上找到了你的 Ducter（MacBook Pro）。连上它？/ Found your Ducter on this
     network (MacBook Pro). Join it?" **连上 / Join** · "新建一个 / Start a new one".
   - Not found: the cartoon plays, and the checklist's first row has a quiet link "我已经有 Ducter
     了 / I already have Ducter" → scan a QR shown on the existing client or enter its code.
2. Join = pair as a client (passkey/Touch ID) **and** offer "也让这台 Mac 干活 / Let this Mac do
   work too" (on by default, shows what it found: repos, harnesses). Off = client only.
3. Lands in the same conversation. No cartoon replay; the partner says "这台也连上了".

### States touched
- Device states (proposed, see §6): `online` · `asleep` · `unreachable` · `removed`; plus
  `joining` (shown on the add card only).
- Ability: 在哪儿都能用 added to the home device; push enabled per client.
- Tasks: a task `queued` with reason "needs a Linux device" moves to `working` when A2-W completes.

### Copy

| Key | zh | en |
|---|---|---|
| `pair.offer.phone` | 要我在手机上也能找到你吗？扫一下就行。 | Want me to reach you on your phone too? One scan. |
| `pair.later` | 以后再说 | Later |
| `devices.add` | 加一个设备 | Add a device |
| `devices.add.phone` | 手机 | Phone |
| `devices.add.mac` | Mac | Mac |
| `devices.add.linux` | Linux 服务器 | Linux server |
| `ability.remote.name` | 在哪儿都能用 | Reach from anywhere |
| `ability.remote.added` | {device} 现在在哪儿都能打开了 | {device} can now be opened from anywhere |
| `ability.remote.step.deploy` | 搭好中转 | Setting up the relay |
| `ability.remote.step.address` | 拿到地址 {host} | Got the address {host} |
| `ability.remote.step.check` | 从外面试一下 | Checking from outside |
| `ability.remote.blocked` | 你的网络打不开 workers.dev，换个方式 | Your network blocks workers.dev; try another way |
| `pair.qr.title` | 用手机相机扫一下 | Scan with your phone's camera |
| `pair.qr.code` | 扫不了？在手机上打开 {host}，输入 {code} | Can't scan? Open {host} on your phone and enter {code} |
| `pair.qr.waiting` | 等手机扫码… | Waiting for your phone… |
| `pair.qr.expired` | 这个码过期了，在电脑上刷新一下 | This code expired. Refresh it on your computer |
| `pair.phone.ask` | 把这部手机连到 {name}？ | Connect this phone to {name}? |
| `pair.phone.from` | 来自 {device} | From {device} |
| `pair.phone.connect` | 连上这部手机 | Connect this phone |
| `pair.phone.not_me` | 不是我扫的 | I didn't scan this |
| `pair.qr.once` | 这个码 {min} 分钟内有效，只能用一次 | This code works once, for {min} minutes |
| `pair.connected` | {device} 连上了 | {device} is connected |
| `pair.disconnect` | 断开 | Disconnect |
| `pair.disconnect_all` | 全部断开 | Disconnect all |
| `pair.ios.home` | 装到主屏幕，我才能给你发通知 | Add to Home Screen so I can notify you |
| `pair.ios.home.how` | 点分享，再点"添加到主屏幕" | Tap Share, then "Add to Home Screen" |
| `pair.ios.too_old` | 这台 iPhone 收不到通知，打开时能看到一切 | This iPhone can't get notifications, but everything is here when you open it |
| `pair.push.enable` | 打开通知 | Turn on notifications |
| `pair.push.test` | 我是 {name}，以后有事这样找你。 | It's {name}. This is how I'll reach you. |
| `pair.push.denied` | 好的，不推送。随时可以在设置里打开 | OK, no notifications. You can turn them on in Settings anytime |
| `pair.reenroll` | 用 Face ID 重新连上 | Reconnect with Face ID |
| `pair.worker.cmd` | 在那台机器上运行这一行 | Run this line on that machine |
| `pair.worker.wants` | {device} 想加入 · {os} · {harness} · {n} 个代码库 | {device} wants to join · {os} · {harness} · {n} repos |
| `pair.worker.add` | 好，加上 | Go, add it |
| `pair.worker.not_mine` | 不是我的 | Not mine |
| `pair.worker.added` | {device} 加上了。{summary} | {device} is added. {summary} |
| `pair.worker.no_ai` | {device} 还没有 AI 可用 | {device} has no AI signed in yet |
| `pair.worker.waiting` | 还在等 {device}… | Still waiting for {device}… |
| `pair.join.found` | 在这个网络上找到了你的 {name}（{device}）。连上它？ | Found your {name} on this network ({device}). Join it? |
| `pair.join.join` | 连上 | Join |
| `pair.join.new` | 新建一个 | Start a new one |
| `pair.join.have` | 我已经有 Ducter 了 | I already have Ducter |
| `pair.join.work_too` | 也让这台 Mac 干活 | Let this Mac do work too |

### Motion
- QR sheet: the QR draws in as pebbles snapping into a grid (300 ms), then holds still (a moving
  QR is hard to scan). The countdown ring drains calmly.
- Phone connects: on the desktop the QR card **flips** to show a small phone toy with the
  partner's face on its screen, which bounces once; on the phone the face does the same bounce at
  the same moment. Two screens, one beat: that synchronicity is the 惊喜.
- Adding an ability (在哪儿都能用): the equip snap from `ui.md` (lift → slot → magnetic pull → tock
  → bounce). The chime fires only after the outside check passes.
- Worker joins: its device toy slides onto the Devices table from the edge; repos appear as
  small labels dropping onto it.
- Reduced motion: flip and slide become cross-fades; no sound.

### Edge cases
- The phone is the *first* client (VPS install done from a phone browser): A1-V step 4 already
  paired it; step 5–6 still run.
- Android: no Home Screen step; push works in the tab. Offer "装到主屏幕" as optional.
- iPad: same as iOS.
- Passkey RP ID is the stable hostname: moving from workers.dev to a custom domain needs every
  phone to re-enroll (research/21 open Q4). Ducter does it as one step per phone with a push link.
- User pairs while the home Mac is on battery and lid-closing soon: no special handling, A3 covers.
- Corporate phone with camera QR scanning disabled: the typed-code fallback.
- Two people in the household scanning: everyone who scans is *the user*; Ducter is single-user.
  The "Not mine / Disconnect" window protects against accidents, not adversaries.

### Open questions
1. **CN users**: workers.dev is likely blocked. Is the default for zh-CN locales "own domain"
   (needs a domain on Cloudflare) or Tailscale? *Proposed:* probe first, then offer own domain
   with Tailscale as the alternative; research needed on a CN-friendly relay.
2. Is a *wrong-scan* window of 30 s enough, or should a phone connection always need a tap on the
   desktop ("好，连上")? *Proposed:* no extra tap; the one-time code is the consent.
3. A2-J: should a joining Mac default to "also do work"? *Proposed:* yes, with its repos shown;
   privacy-minded users switch it off in the same card.
4. Device names: auto from hostname (`annas-mbp`) or the marketing name ("MacBook Pro")?
   *Proposed:* marketing name + disambiguating suffix only when two clash; editable.

---

## A3 · A device sleeps, wakes, or goes offline mid-task

### Scenario card

| | |
|---|---|
| **Who** | Heavy dev: closes the MacBook lid and walks to dinner while 3 tasks run on it. Consumer: home Mac is the only device; they check from the phone on the train. |
| **Before** | Today (conductor/herdr): you come back to dead terminals and don't know what survived. Anxiety, "did I lose the work?" |
| **After** | "It told me plainly the Mac is asleep, kept everything, and carried on by itself when I opened the lid." (放心). Or: "It moved the work to the VPS with one tap." (惊喜) |
| **How it starts** | The first time a task is running when its device sleeps. No setup; the explanation is the card itself. |

### Two very different cases

| | **Worker asleep** (main process elsewhere, e.g. on a VPS) | **Home asleep** (the device running the main process) |
|---|---|---|
| Partner reachable? | Yes. It talks, decides, can move work | No. The Edge answers for it |
| Example | MacBook (worker) lid closed; partner on vps-1 | Mac-only user closes the lid |

### Flow A3-a: worker device sleeps (partner still awake)

1. **Before sleep.** While a task is `working` on a Mac on AC power, the runner holds a power
   assertion so *idle* sleep doesn't stop work. Lid-close and battery sleep still happen.
   - First time only, if a task is running on battery: partner says once "MacBook 用电池时合上盖子
     会睡着，活会停下来。插上电它会一直醒着干活。" (No setting; just honesty.)
2. **Going to sleep.** The runner receives the OS will-sleep notice (≈ 1–2 s warning), writes a
   checkpoint if one is cheap, and tells the control plane "asleep, by lid". So Ducter knows the
   difference between *asleep* (expected) and *unreachable* (unexpected).
3. **0–2 minutes:** nothing visible. Residency `offline` only in the power view.
4. **After 2 minutes:** each task on that device shows **在等 · MacBook 睡着了 / Waiting · MacBook
   is asleep** (dashed waiting style), in its chip, card, and open view. No message, no push.
   - Its ETA in the living message is revised in place: "英译停在第 14 条，MacBook 醒了就接着写。"
5. **When it matters** (only if any is true): the user asks about the task; the task had a stated
   deadline or ETA the user is relying on; or it has been asleep > 30 min with the user active
   elsewhere. The partner then offers **one decision per device**, not per task (artboard
   `ATaskAsleep`):
   - "MacBook 睡着了，上面有 2 件事停着。/ MacBook is asleep with 2 tasks paused."
   - **好，换到 vps-1 接着做 / Go, continue on vps-1** — shown only if vps-1 has the repo (or can
     clone it) and the task's branch was pushed at its last checkpoint. That's a handoff
     (principle 13); the card says what is lost ("最后 4 分钟没保存的改动会留在 MacBook 上").
   - **叫醒它 / Wake it** — shown only when it can actually work: another awake device on the same
     LAN can send Wake-on-LAN, or the device is a cloud VM with a start API.
   - **先等等 / Hold** (default): wait until it wakes. No countdown, because waiting is free and
     reversible.
   - **回复… / Reply…**.
6. **Wake.** Runner reconnects, reconciles with the harness's own state (`focus-window-states.md`),
   and resumes. Tasks go back to **在做 / Working** silently. The living message revises
   ("接着写了，第 15 条"). **No push**, ever, for a wake by itself.
   - Harness session died during sleep (API connection dropped mid-turn) → resume by session ref;
     if rejected, start a new session in the same task from brief + checkpoint. Invisible to the
     user unless it fails.
   - A decision answered while asleep (e.g. "好" on the phone): the answer is in the Log and
     applied on wake; its button showed "好 · 醒了就做 / Go · will do on wake".
7. **Moved instead:** the old task becomes superseded and points to its successor; the new card
   carries the same title with a "从 MacBook 接过来 / Picked up from MacBook" line. When MacBook
   wakes, its runner sees the superseded task and stops it (archive commits its leftovers to
   the branch, never merges them silently).

### Flow A3-b: the home device sleeps (partner asleep too)

1. Mac-only user closes the lid. Main process sleeps; the Edge sees the socket drop.
2. **Phone opens Ducter:** the Edge serves the cached web client and the last synced Log, and
   shows a calm banner, with the partner's face sleeping: "MacBook 睡着了，我也跟着睡了。你说的话
   我醒来就看。/ MacBook is asleep, so I'm resting too. I'll read what you say when it wakes."
   - Conversation and On hand are **readable** (cached). Decisions can be answered: the Edge
     queues them; buttons read "好 · 醒了就做".
   - Composer still works; messages are queued in the Edge and marked "醒来就看 / read on wake".
   - **叫醒它** appears only if a LAN wake path exists (another paired device at home awake).
3. **Push:** when the home device is asleep, *nothing* can push (Web Push is sent from the main
   process). The banner is honest about it: "睡着时我没法给你发通知".
4. **First time only**, the partner suggests the fix that removes this whole case, at a calm
   moment after wake: "想让我一直在线？可以把我搬到一台不睡的机器上（比如 VPS），这台 Mac 照样
   干活。" → moves the main process (later flow; not v1-blocking).

### Flow A3-c: unexpected offline (no sleep notice)

1. Heartbeat lost with no will-sleep notice → device shows **连不上 / Can't reach** after 2 min
   (not "asleep"; the words never claim what Ducter doesn't know).
2. Tasks: **在等 · 连不上 MacBook / Waiting · can't reach MacBook**.
3. After 30 min while tasks were working (state machine invariant 1): the partner gets notified
   and offers the same one-decision-per-device card as A3-a step 5, worded "连不上 MacBook 30 分钟了".
4. Back online → reconcile; if the harness kept working through a network blip (it can, offline
   from us but online to its API), its events stream in and the timeline fills; the card never
   showed a gap as a failure.
5. Unreachable > 24 h → Devices page shows the device with "最后在线 昨天 21:40" and offers
   **断开 / Disconnect**; tasks stay waiting until moved or dropped. Never auto-dropped.

### States touched
- **Device** (proposed): `online` → `asleep` (told) / `unreachable` (not told) → `online`.
- **Task attention:** `working` → **`blocked` with waiter `device_back(device)`** → `working`.
  ⚠ This is a change to `focus-window-states.md`, where offline today changes residency only.
  Reason: showing "在做 / Working" for work that is not happening is dishonest (放心). See §6.
- **Residency:** `hot`/`warm` → `offline` → previous. Handoff path: old task `superseded`, new
  task `queued` → `provisioning` → `working` on the other device.
- Routines due while asleep: coalesce per `product-model.md` §4 (another device → wake → one late
  run → record skip).

### Copy

| Key | zh | en |
|---|---|---|
| `device.state.online` | 醒着 | Awake |
| `device.state.asleep` | 睡着了 | Asleep |
| `device.state.unreachable` | 连不上 | Can't reach |
| `device.last_seen` | 最后在线 {time} | Last seen {time} |
| `task.wait.device_asleep` | 在等 · {device} 睡着了 | Waiting · {device} is asleep |
| `task.wait.device_unreachable` | 在等 · 连不上 {device} | Waiting · can't reach {device} |
| `device.battery.note` | {device} 用电池时合上盖子会睡着，活会停下来。插上电它会一直醒着干活。 | {device} sleeps when its lid closes on battery, and work pauses. Plugged in, it stays awake to work. |
| `device.asleep.decision` | {device} 睡着了，上面有 {n} 件事停着。 | {device} is asleep with {n} tasks paused. |
| `device.unreachable.decision` | 连不上 {device} {duration} 了，上面有 {n} 件事停着。 | Can't reach {device} for {duration}; {n} tasks are paused. |
| `device.move` | 好，换到 {device} 接着做 | Go, continue on {device} |
| `device.move.loss` | 最后 {min} 分钟没保存的改动会留在 {device} 上 | The last {min} minutes of unsaved changes stay on {device} |
| `device.wake` | 叫醒它 | Wake it |
| `device.waking` | 正在叫醒 {device}… | Waking {device}… |
| `device.wake.failed` | 没叫醒。它可能没插电，或者不在家里的网络上 | It didn't wake. It may be unplugged or off the home network |
| `device.asleep.default_note` | 不回的话就等它醒，什么都不会丢 | If you don't answer, I'll wait for it to wake. Nothing is lost |
| `decision.go.on_wake` | 好 · 醒了就做 | Go · will do on wake |
| `task.moved.from` | 从 {device} 接过来 | Picked up from {device} |
| `home.asleep.banner` | {device} 睡着了，我也跟着睡了。你说的话我醒来就看。 | {device} is asleep, so I'm resting too. I'll read what you say when it wakes. |
| `home.asleep.no_push` | 睡着时我没法给你发通知 | I can't send notifications while asleep |
| `home.asleep.queued` | 醒来就看 | Read on wake |
| `home.always_on.offer` | 想让我一直在线？可以把我搬到一台不睡的机器上（比如 VPS），这台 Mac 照样干活。 | Want me always on? I can move to a machine that never sleeps (like a VPS), and this Mac keeps working too. |

### Motion
- Asleep: the device toy (Devices page, and the device chip on a card) gets a **blanket** and a
  slow "z" (the `board_book` verdict). The label always says "睡着了"; the picture never stands
  alone (pitfall: sleep reads as "broken").
- Task pebble on a sleeping device: color shifts to waiting yellow with a dashed outline, and
  breathes very slowly (4 s period), the only motion; never shakes.
- Wake: blanket slides off, the device blinks twice, task pebbles hop once back to working blue.
- Move to another device: the pebble **skips** in an arc from the sleeping device to the target
  (≈ 600 ms), lands with a small bounce; the old card dims to superseded behind it. *Draft D157
  (`design/where.md` §9): the Isles' parcel travels home and out again instead.*
- Home asleep (A3-b): the header face closes its eyes; no animation loop at all (it's resting).
- Reduced motion: state changes by color and label only.

### Edge cases
- Device sleeps while a task holds a write lease → the lease stays with the sleeping task; a
  second task wanting the same files keeps "在等 · 被占用". Moving the task moves the lease.
- Device sleeps mid-`push` intent → on wake, the worker checks the world against the intent
  before repeating (system.md); never a double push.
- Sleep during an `until` loop → the iteration strip shows a gap marker "睡着了 40 分钟", not a
  failed iteration.
- Device asleep while a task wants to **start** there → body selection prefers an awake device;
  if only the sleeping one qualifies, the task is `queued` with "在等 · MacBook 睡着了" (same copy).
- Daylight / overnight: during the user's quiet hours, the decision in A3-a step 5 is never
  pushed; it waits in On hand.
- Clamshell mode (lid closed, external display + power) → stays awake; no special case.
- Many devices asleep at once (power cut) → one combined line, not one per device.

### Open questions
1. **State-machine change:** device offline → task attention `blocked` (waiter: device back),
   after the 2-min grace. *Proposed:* yes; it's the honest reading. Needs a decision + update to
   `focus-window-states.md` invariant 1.
2. Grace before showing "asleep": 2 min? *Proposed:* 2 min, immediately if the runner sent a
   will-sleep notice and the user is looking at that task.
3. Keep the Mac awake on AC while tasks run (power assertion) by default? *Proposed:* yes, shown
   once; a toggle on the device page.
4. Wake-on-LAN: worth building in v1 (needs another awake device on the LAN)? *Proposed:* v1.x.
   v1 shows Wake only for cloud VMs with an API (also v1.x), so v1 effectively shows Move / Hold.
5. A3-b: should the Edge itself be able to send a push ("your Mac has been asleep 2 h and a
   decision is waiting")? It can't know new decisions, but it knows ones synced before sleep.
   *Proposed:* later; research/21 lists an "offline alarm" as optional.

---

## A4 · A harness isn't logged in; quota runs out mid-task

### Scenario card

| | |
|---|---|
| **Who** | Heavy dev on Claude Max + Codex, running 5 tasks in parallel, hits the 5-hour limit. Consumer with one Plus subscription runs out in the evening. Anyone whose Claude login expired on the VPS. |
| **Before** | Today: a terminal says "rate limited", the session stalls, the user finds out an hour later. Frustration, sense of waste. |
| **After** | "It noticed, waited when that made sense, and asked me once with a good default when it didn't." (放心, 好用) |
| **How it starts** | The first time a limit or sign-out hits. The card is the explanation. |

### The rule (from `focus-window.md`, made visible)

Ladder, top to bottom, stopping at the first that fits:
1. **Wait** if the reset is soon (≤ 30 min, or before any ETA the user was given). **Silent.**
2. **Switch model** within the same harness (e.g. Opus → Sonnet). **Asked once, with a default.**
3. **Hand off** to another harness (Claude Code → Codex) from the latest checkpoint. **Asked.**

Silence is allowed only for step 1, because it changes nothing about *who* does the work.

### Flow Q: quota runs out mid-task

1. The harness reports a limit (Claude `rate_limit_event`, Codex `account/rateLimits/*`) with a
   reset time; Ducter's ledger estimates when the harness doesn't say.
2. Ducter groups **every task** hitting the same subscription into one event.
3. **Reset ≤ 30 min (or before the ETA):** each task shows **在等 · Claude 额度 21:40 恢复 /
   Waiting · Claude quota back at 21:40**. No message. On reset, tasks resume; the living message
   updates timings only if they slipped.
4. **Reset later:** one decision in the conversation (artboard `AQuotaDecision`):
   - "Opus 的额度用完了，22:50 才恢复。手上 3 件事停着。/ Opus's quota is used up until 22:50.
     3 tasks are paused." The limit is named at the level it applies: a model (Opus weekly
     limit) or the whole subscription (5-hour window). A whole-subscription limit skips rung 2.
   - **好，换成 Sonnet 接着做 / Go, continue on Sonnet** — default, with a 10-min countdown,
     reversible (switching back at reset is one tap; the card offers it at reset).
     Shown only if the other model has quota; otherwise the default becomes the next rung.
   - **先等等 / Hold** — "等到 22:50".
   - **交给 Codex / Let Codex continue** — one chip; shown only if Codex is signed in on that device.
   - **回复… / Reply…** — e.g. "只让 CI 那个换，其他等".
   - Per-task override: "分别处理 / Choose per task" expands the three tasks with a picker each.
5. **After the choice:** cards subtitle shows the new body and why: "Sonnet · Claude 额度用完，你
   说的". At reset, a quiet line: "Claude 额度回来了。要切回 Opus 吗？" with default **先等等**
   (don't disrupt a task mid-flow; new tasks use Opus again automatically).
6. **Main AI's own quota:** the partner keeps a reserve per subscription. If even that runs out,
   the partner answers from another signed-in body and says once "我先用 Codex 跟你说话，Claude
   22:50 恢复". If *no* body has quota → a banner, not a crash: "我的 AI 都用完了额度，最早 22:50
   恢复。你的话我会记着。" The composer stays open; messages queue.
7. **A rule that can't be honored** ("backend refactors on Codex", Codex out) → the one-liner from
   `focus-window.md`, as the same decision shape.

### Flow H: harness not signed in

**H-1: at first run / adding a device.** Covered in A1 and A2: a **Connect** button that runs the
official login (local: opens the browser; remote device: relayed URL + paste-back code or device
code).

**H-2: at task start.** Body selection filters out signed-out harnesses, so usually the user never
sees it. Visible only when:
- a pin or rule demands that harness → one line with a default: "你的规则是用 Codex，但 vps-1 上的
  Codex 没登录。用 Claude Code 做这件，还是先登录？" **好，用 Claude Code** · **去登录** · Reply.
- nothing else qualifies → the task is `queued` with "在等 · vps-1 上的 Claude Code 没登录" and a
  **登录** action on the card.

**H-3: sign-in expires mid-task** (auth error; Raft rule: auth errors go to the user).
1. Task → **等你 / Needs you**: "vps-1 上的 Claude Code 登录过期了。/ Claude Code on vps-1 is
   signed out."
2. **好，重新登录 / Go, sign in again** (opens the relayed login sheet) · **先等等** (default: the
   task waits, nothing lost) · **交给 Codex** (if available) · Reply.
3. After sign-in succeeds: the sheet closes itself, the task resumes, the card returns to working,
   and every other task blocked on the same login resumes with it.

### States touched
- Quota wait: `working` → `blocked` (waiter: quota reset) → `working`. Card: 在等 + reason.
- Quota decision: `working` → `blocked` → (`needs-you` only when the decision isn't auto-taken;
  the decision lives on the living message) → `working` on new body, or `superseded` → new task
  for a harness handoff.
- Sign-out mid-task: `working` → `needs-you` → `working`. Residency parks while waiting.
- Device: unchanged; harness login state is per device × harness (Devices page shows
  "Claude Code · 已登录 / 登录过期").

### Copy

| Key | zh | en |
|---|---|---|
| `task.wait.quota` | 在等 · {harness} 额度 {time} 恢复 | Waiting · {harness} quota back at {time} |
| `quota.out.decision` | {limit} 的额度用完了，{time} 才恢复。手上 {n} 件事停着。 | {limit}'s quota is used up until {time}. {n} tasks are paused. |
| `quota.other_ok` | {model} 的额度还剩不少 | {model} still has plenty of quota |
| `quota.switch_model` | 好，换成 {model} 接着做 | Go, continue on {model} |
| `quota.hold_until` | 等到 {time} | Wait until {time} |
| `quota.handoff` | 交给 {harness} | Let {harness} continue |
| `quota.per_task` | 分别处理 | Choose per task |
| `quota.default_note` | 不回的话 {time} 换成 {model} · 可以换回来 | If you don't answer, I'll switch to {model} at {time}. You can switch back |
| `quota.subtitle` | {model} · {harness} 额度用完，你说的 | {model} · {harness} quota ran out, your call |
| `quota.back` | {harness} 额度回来了。要切回 {model} 吗？ | {harness} quota is back. Switch back to {model}? |
| `quota.main.fallback` | 我先用 {harness} 跟你说话，{other} {time} 恢复 | I'm talking to you on {harness} for now; {other} is back at {time} |
| `quota.main.none` | 我的 AI 都用完了额度，最早 {time} 恢复。你的话我会记着。 | All my AI is out of quota until {time}. I'll keep what you say. |
| `harness.signed_out` | {device} 上的 {harness} 登录过期了。 | {harness} on {device} is signed out. |
| `harness.sign_in` | 好，重新登录 | Go, sign in again |
| `harness.sign_in.short` | 登录 | Sign in |
| `harness.sign_in.browser` | 在浏览器里完成登录 | Finish signing in in your browser |
| `harness.sign_in.paste` | 把登录页给你的码贴在这儿 | Paste the code from the sign-in page here |
| `harness.sign_in.device_code` | 在 {url} 输入这个码 | Enter this code at {url} |
| `harness.sign_in.done` | {harness} 登录好了 | {harness} is signed in |
| `task.wait.signed_out` | 在等 · {device} 上的 {harness} 没登录 | Waiting · {harness} on {device} isn't signed in |
| `rule.cant_honor.harness` | 你的规则是用 {harness}，但 {reason}。用 {other} 做这件，还是 {alt}？ | Your rule says {harness}, but {reason}. Use {other} for this one, or {alt}? |

### Motion
- Quota wait: a small **hourglass-free** treatment: the waiting pebble shows a thin ring that
  fills toward the reset time (like a clock hand), on the card only.
- Decision card arrives with the standard needs-you entrance (face raises brows; card rises 8 px).
- Choosing "换成 Sonnet": the model chip on each affected card **flips** to the new name in a
  quick stagger (60 ms apart), so the user sees all 3 changed by one tap.
- Handoff to Codex: the pebble skips from the "Claude Code" label to "Codex" (same device), same
  skip motion as A3's device move: one motion vocabulary for "someone else carries on".
- Sign-in success: sheet closes with press-and-settle; the blocked pebbles hop back to blue
  together.

### Edge cases
- Weekly limit (reset in days, not hours) → step 4 never offers "Wait" as the default; it says
  "下周二才恢复".
- Both harnesses out → only Hold and Reply; the card lists the earliest reset.
- API-key user with a spend cap → "这个月的上限 $50 到了" with **提高上限** · Hold. Raising it is a
  decision, never a default.
- Model switch mid-turn: the switch happens at the next turn boundary (a checkpoint), never mid-
  tool-call.
- A routine run hitting quota → it waits within its own budget window; it never asks in quiet
  hours; a missed run is reported in its next result.
- Sign-in on a remote device requires a browser on the device the user is holding: on the phone,
  the relayed URL opens in the phone's browser; that's fine for OAuth-by-link flows.
- Quota estimate wrong (Ducter's ledger guessed) → the wait reason says "大约 22:50" ("about"),
  never a precise time it doesn't know.

### Open questions
1. Wait threshold: fixed 30 min, or relative to the task's expected duration and the user's ETA?
   *Proposed:* ≤ 30 min OR before the promised ETA, whichever is larger.
2. Should "switch model" default automatically for **low-stakes** tasks (translation, research)
   with no ask at all, via a shipped default rule? *Proposed:* no in v1; ask once, then offer
   "以后这种情况直接换？" to create a Rule (learned suggestion).
3. Codex device-code login on a VPS and Claude Code's paste-back flow: verify both can be relayed
   through a pty (INFERRED, needs a spike).
4. Is "额度 / quota" the right shown word? Alternatives: 用量 / usage limit. See §6.

---

## A5 · Creating a second persona

### Scenario card

| | |
|---|---|
| **Who** | Consumer: "a separate one for family stuff, I don't want work in it." Heavy dev: a research partner with a different voice and model, kept out of the coding Log. |
| **Before** | Worry it'll be a whole second setup; worry they'll leak into each other. |
| **After** | "A name and one sentence and she was there, with her own face. And she knows nothing about my work unless I say so." (惊喜, 放心) |
| **How it starts** | In conversation ("I want a separate assistant for…") or the header's face menu → **新伙伴 / New partner**. Never during first run. |

### Flow

1. **Trigger.**
   - In conversation: "我想要个单独管家里事的" → the current partner replies with a **new-partner
     card** inline, prefilled from what was said (name suggestion empty, sentence "帮我管家里的
     事：账单、孩子的学校、看病预约").
   - Or: tap the header face → menu lists partners + **新伙伴**.
2. **New-partner sheet** (artboard `ANewPartner`): exactly two fields and one picker.
   - **名字 / Name** (required; suggestions as chips: three short names).
   - **一句话说说它管什么 / In one sentence, what is it for?** (prefilled if from conversation).
   - **Face color** (4–6 swatches, one not used by existing partners preselected).
   - A plain "它会有 / It gets" box, literal: its own conversation · its own memory · your devices
     and AI (shared) · it can't see {Ducter}'s chats unless you link them.
3. **Preview (live, as they type):** the face renders in the chosen color with the name; after
   the sentence, Mem's birth draft produces 2–3 lines "我是谁 / Who I am" in its voice. Editable
   inline; "看全部" opens the full identity draft for power users.
   - Mem not connected → the draft is generated by the main AI and stored by Ducter locally; one
     line says "连上 Mem 后它会记得更多" (open question 1).
4. **好，叫醒 {name} / Go, bring {name} in.** The face pops out of the paper (same as cartoon scene
   1, shortened), the app switches to the new conversation, and the new partner speaks first,
   from its sentence: "我是小满。账单、学校、预约这些交给我。先说一件这周要办的？"
5. **Switching.** Header face → menu of faces (each with its unread/needs-you count). On phone:
   swipe on the header face. On hand already shows every partner's cards with their faces;
   a **伙伴** filter appears only once there are two.
6. **Way back.** Partner menu → {name} → 设置: rename, color, "暂停 / Pause" (keeps everything,
   stops routines), "删掉 / Delete" (asks; shows how many tasks are open and offers to hand them
   to another partner or drop them; memory in Mem is kept unless the user also deletes it there).

### States touched
- New persona: no tasks; routines none; rules none (inherits user rules; persona rules created
  later in its own conversation).
- On hand: grouping by persona becomes available; attention forecast aggregates both.
- Quota: shared subscriptions; the main-AI reserve is per subscription, shared by both partners'
  main turns (`product-model.md` §5). No per-partner quota UI in v1.
- Notifications: pushes carry the partner's face and name ("小满：…").

### Copy

| Key | zh | en |
|---|---|---|
| `partner.new` | 新伙伴 | New partner |
| `partner.new.name` | 名字 | Name |
| `partner.new.sentence` | 一句话说说它管什么 | In one sentence, what is it for? |
| `partner.new.color` | 脸的颜色 | Face color |
| `partner.new.gets` | 它会有 | It gets |
| `partner.new.gets.conversation` | 自己的对话 | Its own conversation |
| `partner.new.gets.memory` | 自己的记忆 | Its own memory |
| `partner.new.gets.shared` | 你的设备和 AI（共用） | Your devices and AI (shared) |
| `partner.new.gets.isolated` | 看不到 {other} 的对话，除非你让它们互通 | Can't see {other}'s conversation unless you link them |
| `partner.new.who` | 我是谁 | Who I am |
| `partner.new.see_all` | 看全部 | See all |
| `partner.new.go` | 好，叫 {name} 来 | Go, bring {name} in |
| `partner.new.no_mem` | 连上 Mem 后它会记得更多 | With Mem connected, it will remember more |
| `partner.switch` | 换个伙伴 | Switch partner |
| `partner.pause` | 暂停 | Pause |
| `partner.delete` | 删掉 | Delete |
| `partner.delete.open_tasks` | {name} 手头还有 {n} 件事。交给 {other}，还是放下？ | {name} has {n} tasks open. Hand them to {other}, or drop them? |
| `onhand.filter.partner` | 伙伴 | Partner |

### Motion
- Typing the name: the preview face's mouth moves subtly with each keystroke (it "tries out" the
  name). Picking a color: the face re-tints with a soft squash.
- Go: the face hops out of the card into the header; the old partner's face slides left into
  the switcher with a small wave. The conversation pane cross-fades (two conversations, never
  mixed visually).
- Switching partners later: faces swap with a horizontal slide; accent color of the whole UI
  shifts over 250 ms (if the partner has its own accent).
- Reduced motion: cross-fade; no hops or waves.

### Edge cases
- Same name as an existing partner → allowed, but the color must differ; the sheet says so.
- Name that is a real person's name (e.g. the user's spouse) → allowed; no special handling.
- The new partner asks about something only the first knows → it says it doesn't know and offers
  "要我问问 Ducter 吗？" which, once, offers linking (F-group).
- A task created in partner A's conversation about something in B's area → stays with A;
  no automatic routing between partners in v1.
- Theme per partner (optional): only accent and face in v1; full theme later.
- Phone push from two partners at once → separate notifications, each with its face.

### Open questions
1. Mem not connected: does a persona without Mem exist (local identity in Ducter), or is Mem
   required for a second persona? *Proposed:* allow it; Ducter stores a minimal identity and
   offers migration to Mem later.
2. Should the new partner inherit the user's global rules automatically? (`product-model.md` says
   rules belong to user/persona/project.) *Proposed:* yes for user rules; show "沿用你的 3 条规则"
   as a line in the "It gets" box.
3. Should a new partner pick its own default model (e.g. the research one prefers a different
   model)? *Proposed:* not in the sheet; it can be said in its conversation as a persona rule.
4. Delete semantics for Mem identity (delete in Ducter only, or also in Mem)? *Proposed:* Ducter
   only, with a link to Mem.

---

## 6. Glossary gaps and state changes to run through the change loop

*Status 2026-11-09:* the device states, 额度, 叫醒, 连上 / 断开, 在哪儿都能用 and 换到 X 接着做 are in the
glossary (D51, D54), and the device-offline rule is D52 Q1. Still open: 登录 · 登录过期 and 新伙伴
(reviewed in `../glossary-review-2026-11-09.md`, D66).

| Proposed (zh / en) | Used for | Notes |
|---|---|---|
| 醒着 · 睡着了 · 连不上 / Awake · Asleep · Can't reach | device states | "Asleep" only when the OS told us; "Can't reach" otherwise |
| 额度 / quota | subscription limit | alternative 用量上限 / usage limit |
| 登录 · 登录过期 / Sign in · signed out | harness login | |
| 连上 / Connect (pair), 断开 / Disconnect | pairing, revoking | avoids "pair/配对" jargon |
| 在哪儿都能用 / Reach from anywhere | the remote-access ability | In the glossary (D51, reworded D66) |
| 换到 {device} 接着做 / Continue on {device}; 交给 {harness} / Let {harness} continue | handoff | glossary has no shown word for handoff; these are action phrases |
| 叫醒 / Wake | wake a device | |
| 新伙伴 / New partner | persona creation | uses the glossary category word 伙伴 / Partner |
| Device states `online/asleep/unreachable/removed` | product-model §2 Device | new states |
| Task attention `blocked` on device offline (after 2 min) | A3 | changes `focus-window-states.md` invariant 1 |

## 7. Artboards (flows prototype project)

| File | Size | Shows |
|---|---|---|
| `ASetupChecklist.dc.html` | desktop 1440×900 | A1: live checklist right after the cartoon (Claude Code ✓, Codex not signed in, Mem found) |
| `APairPhone.dc.html` | desktop 1440×900 | A2-P: QR sheet on the desktop, with the phone's confirmation screen beside it |
| `ATaskAsleep.dc.html` | phone 390×844 | A3-a: on the phone, MacBook asleep with 2 tasks paused; Move / Hold |
| `AQuotaDecision.dc.html` | desktop 1440×900 | A4: Claude quota out, 3 tasks paused, switch-model default with countdown |
| `ANewPartner.dc.html` | phone 390×844 | A5: new-partner sheet with live face preview and "It gets" box |
