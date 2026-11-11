# 59: 用手机 / Use a phone: Pinky again, and Ducter's own Android phone on a Mac

Asked (2026-11-12): the author: "请你看看把我们的 phone use 给做了，这样 ducter 就自带手机，可以做更多有意思的事情了，看看之前我让你调研的 pinky 是否适合，可以的话，我们先在 macOS 上支持一下，理论上我们可以让用户在里边比如 android 手机上装一些 app，登录账号，做很多方便的任务了".

Research/22's addendum read Pinky on 2026-11-08 (`db40371`) and recommended starting with it. This
note reads it again four days later, decides by evidence whether it fits as the gateway of a phone
Ducter owns, and measures the alternative on this Mac: an Android emulator Ducter installs into its
own folder and drives over adb itself.

Tags: VERIFIED (read in source at path:line, run here, or the GitHub API), DOCUMENTED (its own docs),
INFERRED. Pinky was read only and never run. Google's emulator, platform-tools and system image were
downloaded from dl.google.com into a scratch folder, checked against Google's own SHA-1s, and run
there (never `~/Library/Android`, `~/.android` or adb's port 5037).

Machine: MacBook Pro, Apple M-series (arm64), 16 cores, 128 GB RAM, macOS 15.7.9.

## 1. Pinky on 2026-11-11

Snapshot: `DIYgod/pinky` `4002b94` (2026-11-11 20:21 +0800, release `v2026.1111.19`), shallow
clone in the session scratchpad.

| | Now | Since research/22 |
|---|---|---|
| Maturity | README still says **pre-alpha** (VERIFIED `README.md:31`). 1,842 stars, 194 forks, 22 open issues, created 2026-11-06 (VERIFIED GitHub API). 109 releases in six days; 19 on 2026-11-11 alone (VERIFIED `CHANGELOG.md`). 405 `*_test.go`; acceptance 9 items checked, 28 not (VERIFIED `docs/ACCEPTANCE.md`) | 20 releases a day then; the pace held |
| Releases | Calendar versions; each release has darwin-arm64 zip (22.4 MB), dmg, Linux tar/deb, Windows, an `.mcpb`, a Homebrew cask and `SHA256SUMS` (VERIFIED GitHub API) | Pinnable by tag and checksum |
| MCP | 19 `phone_*` tools: connect, release, observe, tap, type, swipe, pinch, drag, key, launch, apps, batch, wait_for, files, app, logs, device, request_approval, handoff (VERIFIED `docs/mcp.md` §Tools) | 14 then |
| Auth | stdio through `pinkyctl mcp`, or Streamable HTTP on 127.0.0.1:7465 with a per-agent bearer token; remote agents (" (remote)" names) and `tailscale serve` (VERIFIED `docs/mcp.md:70-122`) | HTTP remote agents and Tailscale are new |
| First connection | **Every new agent waits for the person's Allow in Pinky's window** ("This is X's first connection, and the person must allow it in Pinky") (VERIFIED `internal/gateway/agent.go:877-935`). The only skip is `TrustNewAgents`, set only for `--fake` phones (VERIFIED `cmd/pinky/daemon.go:193`) | Unchanged |
| Approvals | Ask actions open a panel in Pinky's own client; "Only the client's `Decide` answers approvals. No tool can." Denied after 60 s (`--approval-timeout`). Default policy asks about payments only; the person can widen it (VERIFIED `docs/mcp.md` §Approvals) | Unchanged |
| Trusted / remote approval | `decide`, `hand_back`, `unlock` still need a `trusted` control client (the in-process UI) (VERIFIED `internal/api/control.go:160-166`). "Approve from a notification, a phone push or a chat app" is still **M4**, not built (VERIFIED `docs/DESIGN.md:99`). `internal/secret/presence_darwin.go` is Touch ID for unlocking a phone with its saved PIN, not a presence-proving control client (VERIFIED) | **No** remote or presence-proving approval landed |
| Emulators | "Start an iOS Simulator or an Android emulator from Add phone › Virtual phone … Only you can start one" (VERIFIED `CHANGELOG.md:282`). It finds the SDK's `emulator` and the AVDs Android Studio made (`ANDROID_AVD_HOME`, `ANDROID_USER_HOME`, …) (VERIFIED `internal/driver/android/avd.go:24-160`). It does not install an SDK or make an AVD | Virtual phones are new; still Android Studio's |
| Hidden display | A scrcpy virtual display on the phone, checked on the Android 16 and 17 emulators (always unlocked there) (VERIFIED `internal/driver/android/background.go:43-131`) | Emulators covered |
| Companion APK | Accessibility service, on only during a task; tree in ~70 ms, CJK typing by `ACTION_SET_TEXT`; falls back to `uiautomator dump` (DOCUMENTED `docs/DESIGN.md:431`) | Unchanged |
| Telemetry | Usage counts and crash reports **on by default, no first-run notice**; off with `DO_NOT_TRACK=1` or `PINKY_TELEMETRY_URL=-` (VERIFIED `docs/TELEMETRY.md:7-16`) | Unchanged |
| Updates | The app updates itself; `pinky daemon --no-update-check` turns the daemon's off (VERIFIED `cmd/pinky/daemon.go:33`) | Daemon switch confirmed |
| New, not needed here | "Ask Pinky" runs its own agent with the person's model key (VERIFIED `CHANGELOG.md:57`); phones away from home over Tailscale (`docs/away-from-home.md`) | |
| License | Apache-2.0 (VERIFIED `LICENSE`) | |

### Verdict: not fit as the gateway of Ducter's phone, now

1. **Its trust root is its own window.** A headless `pinky daemon` that Ducter runs could not let
   Ducter's tasks in at all: each agent's first connection waits for an Allow only Pinky's window
   can give (agent.go:877-935), and no switch skips it outside fake phones (daemon.go:193). Every
   Ask action then times out to Deny after 60 s. Ducter's people answer on their phone or in the Mac
   app, often with the home on a server; Pinky's approvals can't reach them (control.go:160-166;
   M4 not built). Running Pinky's desktop window beside Ducter's would put a second app, a second
   approval UI and a second "trusted" surface in front of the user: against D9's one conversation
   and D36 (顺滑, 放心).
2. **Churn.** 109 releases in six days, pre-alpha, auto-update on in the app. A pinned binary
   ages in days; an unpinned one is an unreviewed code path on the user's Mac.
3. **It doesn't make the phone.** Its emulators are Android Studio's AVDs, started by the person
   from its window. The part a fresh user needs (no Android Studio, no Java, a phone appears) is
   exactly what it leaves out.
4. **Telemetry on by default, no notice** (switchable, but a default Ducter would have to override
   on every run).

What it gets right, and Ducter takes as ideas (no code): the gate in code at the effect, not in the
prompt; commit verbs in several languages; banking, wallet and password apps out of reach;
credential fields refused; the screen re-checked before an approved tap; "take over" pausing the
agent; screen text marked as data. Pinky stays the best answer for **the user's own physical
phones and iPhones** (iOS 27 without WebDriverAgent, Tailscale away from home) once it has a way to
approve from outside its window: revisit at M4 or when a presence-proving control client lands.

Alternatives considered: android-use (Python MCP, safety by prompt; research/22) has the same
"someone else's gate" problem and is weaker on safety; **Ducter driving adb itself** is small (the
tool surface is ten tools), keeps the gate in Ducter's code and cards, and needs nothing but
Google's own packages. Chosen.

## 2. The phone without Android Studio

What a phone needs, as packages in Google's repository (VERIFIED `repository2-3.xml`,
`sys-img/google_apis_playstore/sys-img2-3.xml`, fetched 2026-11-12, stable channel):

| Package | Version | macOS arm64 zip | SHA-1 | License |
|---|---|---|---|---|
| platform-tools | 37.0.1 | 16,110,554 B | `6ae73f4d…` | android-sdk-license |
| emulator | 37.2.13 (build 16740729) | 416,113,219 B | `6c5e61b8…` | android-sdk-license |
| system-images;android-36;google_apis_playstore;arm64-v8a | r07 | 1,886,527,965 B | `5b91ef80…` | android-sdk-arm-dbt-license |

Total download **2.32 GB** (VERIFIED). Each zip is fetched over HTTPS and checked against these
checksums (all three matched here). No `sdkmanager` and no Java: the zips unpack straight into the
SDK layout (`platform-tools/`, `emulator/`, `system-images/android-36/google_apis_playstore/arm64-v8a/`)
and the AVD is two small files Ducter writes (`ducter.ini`, `ducter.avd/config.ini`): 720×1600 at
320 dpi, 3 GB RAM, 2 cores, 6 GB data partition, Play Store on, quick boot on (VERIFIED: the
emulator booted from exactly these). The licenses' texts are in the same XML files; the install
sheet shows them and records the SHA-256 of the text the person agreed to.

The tools run with `ANDROID_SDK_ROOT`, `ANDROID_USER_HOME`, `ANDROID_EMULATOR_HOME` and
`ANDROID_AVD_HOME` inside `<dataDir>/phone`, and adb on its own server port (`ANDROID_ADB_SERVER_PORT=5137`)
so the user's adb on 5037 and `~/.android` are never touched (VERIFIED: the user's
`~/Library/Android/sdk` was left as it was). `-no-metrics` keeps the emulator from asking to send
usage data.

## 3. Driving it

| Step | How | Measured (median) |
|---|---|---|
| Screen as a picture | `adb exec-out screencap -j` (JPEG encoded on the device; undocumented in `-h` but present on Android 16) | **83 ms**, 385 KB at 720×1600 (idle) |
| … as PNG | `screencap -p` | 1.7 s, 1.4 MB |
| … raw | `screencap` | 0.7 s, 10 MB |
| Screen as text | `adb exec-out uiautomator dump /dev/tty` | **1.9 s** (3.0 s under load) |
| Tap | `input tap x y` | 80–170 ms |
| Type | `input text` (ASCII only; `%s` for spaces) | per call ~0.1 s |
| Launch | `monkey -p <pkg> -c LAUNCHER 1` | ~1 s |

Catches (VERIFIED):
- `uiautomator dump` refuses some screens with "could not get idle state" (Settings › About
  emulated device, every try), even with the three animation scales at 0. The tool then answers
  with a picture of the screen instead (the model reads it).
- `input text` types ASCII only. Chinese and other scripts need either the user (the phone's own
  Gboard in the live view) or an input path of Ducter's own (an IME or an accessibility service in
  a small companion APK, like Pinky's `ACTION_SET_TEXT`): next phase.
- A tappable row in Android's settings has no words of its own; its words are its children's. The
  reader names such a row by the words inside it ("Network & internet · Mobile, Wi‑Fi, hotspot").

## 4. The live view

Options: scrcpy (H.264 at 30 fps; needs a decoder in every client: WebCodecs on the web, a
VideoToolbox path in the Mac app) or pictures. `screencap -j` at 83 ms gives 6 frames a second
with room to spare, already JPEG, so the D190 pipeline (one frame in flight until acked, nothing
sent while the screen doesn't change) carries it unchanged, and every client already paints JPEG
frames. Chosen for phase 1; scrcpy when a game or video needs it.

## 5. Measurements on this Mac

| | |
|---|---|
| Download | 2.32 GB; 135 s here (≈17 MB/s); the whole install from the sheet (download, check, unpack, phone) 3 min 25 s |
| Disk after install | 3.5 GB (`phone/sdk`), zips removed |
| Disk once the phone has run | + 3.0 GB its storage after the first start (Play services update themselves) + 3.0 GB the quick-boot snapshot: **≈ 9.6 GB** |
| First start of a new phone | 53 s (first scratch phone), 74 s (the phone the product made) |
| Cold start | 17 s |
| Start from the snapshot | **6 s** (about 12 s from tapping Open the phone to Android ready, adb included) |
| Stop (saves the snapshot) | 3.3–4.7 s |
| Memory | qemu RSS 5.1–5.5 GB with 3 GB for Android (2 GB swapped hard: Play services need 3 GB) |
| CPU idle | 2.6–11 % of one core once settled; 200–465 % for ~10 min after the first start (Play services) |
| CPU while driven | see §6 |

## 6. End to end through Ducter

A scratch home (its own data dir in the session scratchpad, port 8917, Mem off, push off), the
partner and tasks on Claude Code (VERIFIED, 2026-11-12):

| Step | What happened |
|---|---|
| Install from the sheet (web client) | licenses shown and agreed; 2.32 GB downloaded, checked and unpacked; 3 min 25 s from tap to "on" |
| Open the phone | first start of the new phone 74 s ("starting" line meanwhile), then live frames of the real home screen (web phone width and the Mac app) |
| "用你的手机打开设置，看看这台安卓手机是什么版本，截个图给我" | the partner opened one task with `needs.phone`; the task: open Settings, look, swipe twice, tap "About emulated device", read, screenshot, tap "Android version", screenshot, report "Android 16 …" with both pictures: **1 min 41 s**, 13 tool calls, no error |
| "用你的手机，在信息里给 5551234 发一条短信：周六见" | (before rule 9 was changed the partner asked first; afterwards, in the eval, it doesn't). The task opened Messages and the conversation; `phone_type` refused Chinese (before the clipboard path existed) and asked the user on a card; the user's turn in the live view, **好了**; then the task asked `phone_ask_go` for "Send SMS" before tapping, **点吧**, one tap, the message on screen, a screenshot. The emulator's simulated modem delivers nowhere |
| Chinese through the clipboard | `setClipboard` over the emulator's gRPC (token from its discovery file) 9 ms, `KEYCODE_PASTE`; Android shows its own "pasted from your clipboard" toast; the Mac's clipboard unchanged |
| CPU while driven | qemu at 7–25 % of one core typically, peaks 100–148 % during a screen change (sampled every 3 s for 2 min) |

The Play Store opens to Google's sign-in on this image; no account was signed in.

## Implications for Ducter

- Ducter's phone is Ducter's own, like its own browser (D151): an emulator it installs, starts and
  stops, driven by tools on Ducter's MCP. The gate, the blind rule and the decision cards are
  Ducter's code, not a third party's window.
- The install is one sheet: 2.3 GB to download, about 10 GB on disk once used, Google's two
  licenses shown and agreed to there. Apple Silicon Macs in phase 1.
- Start on demand, stop when nobody needs it (five minutes), quick boot from a snapshot (6 s vs
  17 s cold, at 3 GB of disk).
- The live view reuses D190's design and stream as is.
- Next: Chinese text (a companion IME or accessibility service), a worker Mac's phone, physical
  phones and iPhones (Pinky, once it can be approved from outside its window), Autofill on the phone.

**Summary.** Pinky moved fast (19 tools, remote agents, virtual phones) but its approvals and even
an agent's first connection still need its own window, it makes no phone, and it ships 15+ releases
a day: not fit as the gateway of Ducter's phone. Ducter installs Google's emulator, platform-tools
and an Android 16 Google Play image (2.32 GB, checksummed, no Java) into its own folder, makes the
phone itself, and drives it over adb on its own port with ten tools whose gate is Ducter's cards;
JPEG screenshots at 83 ms make D190's live view work unchanged. Measured: 6 s start from snapshot,
~5 GB RAM, ~10 GB disk once used.
