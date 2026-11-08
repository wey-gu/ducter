# 22: Phone use and phone calls as task places

Researched 2026-11-08 for the Later items "Phone use" and "Phone calls (tuwa.ai-like)"
(`design/roadmap.md`, D35). A task's place can be "a phone or call"
(`design/product-model.md` §3). The motivation asks for "phone use (virtually or
physically)", a "Phone Call (tuwa.ai-like) env", and landing in a task "like a ghost in a
phone call meeting" (`motivation.md:43`, `:72`).

**Sources.**
- Shallow clones, read-only and never executed, under
  `<scratch>/repos/`
  (written `R/` below):
  - `android-use` @ `0baab86` (2026-11-06);
  - `iPhone-use` @ `3ce9c08` (2026-10-22).
- tuwa.ai: its JS bundle's UI strings and its agent install guide
  (`https://api.tuwa.ai/agent/install.md`), downloaded as data and not executed.
- Vendor pricing and docs pages, fetched 2026-11-08.

**Labels.**
- **V**: verified in source (path:line) or on a page I fetched.
- **V-s**: from a search snippet only.
- **I**: my inference.

---

## 1. Phone use: android-use and iPhone-use

| | android-use (arcships) | iPhone-use (zhongerxin) |
|---|---|---|
| What it is | A local stdio MCP server, plus a CLI, live-screen web UI and skills. Built for Dim Agent, works with any MCP client (V `R/android-use/README.md:14-16`) | A stdio MCP server, plus skills and a live-screen widget. Built for Codex, WorkBuddy and Doubao Work (V `R/iPhone-use/README.en.md:7-9`) |
| How it controls the phone | ADB plus a pinned **uiautomator2** client with action replay disabled (V `src/android_use/backend.py:1,16`). It pushes `u2.jar` and runs it via `app_process`, with no APK install or root (V `backend.py:184-195`, `README.md:24`) | **Appium WebDriverAgent** (an XCTest runner) signed with the user's own Apple team, reached over a loopback-only USB forwarder (V `README.en.md:9,129-137,188`) |
| How it observes | The accessibility tree first, then screenshots. Optional local OCR (macOS only) and an opt-in vision locator ("Jev Box", TypeSafe's hosted model) for canvas or unlabeled targets (V `README.md:150,158-160`, `docs/guide.md:5`) | A compact accessibility tree, with a screenshot fallback the host model reads itself (`pixel_to_point`) (V `README.en.md:192`) |
| Decisions | The host agent decides. Optional **Jev** (TypeSafe API) picks among code-owned candidates, and a keyless "host decider" mode exists (V `README.md:127-135`). Jev is the same decision model as in `research/16` | The host agent only |
| Live view | `screenrecord` → H.264 → ffmpeg → frames in memory. Served on 127.0.0.1 with a random token and Host/Origin checks, never on the LAN (V `docs/architecture.md:16-17`, `docs/guide.md:287,293`). Also an MCP Apps embed (V `README.md:259`) | A widget with a frame and tap/drag indicators; clicking the preview taps the phone (V `README.en.md:182,249`) |
| Host | macOS, Linux or Windows wherever `adb` and `ffmpeg` run. Only macOS + Android 16 (Xiaomi 15 Ultra) is accepted end to end; Linux and Windows device runs are untested (V `docs/guide.md:61,76`) | **macOS with full Xcode** and an Apple dev team (V `README.en.md:114-123`) |
| Physical or virtual | Both: USB or already-paired wireless ADB, or an emulator. API 35 ARM64 emulator accepted (V `README.md:16`, `docs/guide.md:76,139`) | **Physical iPhone over USB only.** Setup filters out simulators (V `server/wda_setup.py:232`) |
| License, maturity | MIT; v0.7.0; 481 Python tests. Repo created 2026-11-06, 10 stars (V `LICENSE`, `README.md:316`, GitHub API) | MIT; plugin 0.3.16. Created 2026-10-06, about 4.9k stars and 494 forks (V `LICENSE`, `plugin.json:4`, GitHub API) |
| Remote use | Not provided. The preview URL is not a remote MCP endpoint, and a remote session needs the phone attached to *that* host (V `README.md:55,262`, `docs/guide.md:20`) | Rejects remote `WDA_URL` addresses (V `README.en.md:219`) |

**Shared safety design** (V for both):
- Passwords, PINs, OTPs and biometrics stay with the user.
- A pause/resume handoff blocks all reads and screenshots while the user takes over
  (`android-use/docs/guide.md:37,391-400`; `iPhone-use/README.en.md:182`,
  `skills/iphone-use/SKILL.md:26`).
- No automatic replay of uncertain actions; a shared per-device operation lock.
- The goal executor is told "Do not submit, purchase, delete or send anything unless the goal
  authorizes it" (`android-use/src/android_use/executor.py:20`).
- iPhone-use keeps typing and submitting separate (`README.en.md:182`).

**Caveats.**
- **iPhone-use sends analytics by default** to PostHog and GA4: tool calls, app IDs, errors
  (V `README.en.md:11`). Ducter must set `IPHONE_USE_ANALYTICS=0`.
- **Free Apple accounts' profiles expire after 7 days**, so WDA needs rebuilding (V
  `skills/iphone-use-setup/SKILL.md:59`). An unattended iPhone needs a paid team or a weekly
  re-sign.
- Jev and Box send UI text and (opt-in) screenshots to TypeSafe (V `README.md:150`). Keep it
  off by default under principle 18.
- Both need the phone **unlocked**; a lock pauses everything (V). (I) An unattended phone
  means "keep awake + no lock" on a dedicated device, never the user's daily phone.

**How a harness drives them.** Both expose stdio MCP (`.mcp.json` in each repo), with CLIs
as a fallback (`android-use` script, `scripts/phone.py`). (I) Ducter's runner launches the
MCP server as a sidecar on the device that has the phone attached, and adds it to the
task's harness config. The task's harness (Claude Code or Codex) does the reasoning. These
are ~20-tool servers; `research/08` warns that tool count costs accuracy, so attach them
only to phone tasks.

## 2. Phone-call agents

**tuwa.ai** (V, from bundle strings and `install.md`):
- **What it does.** "Call anyone. Speak your language." Your agent (Grok Bot, Muse, Codex,
  Claude) places or answers real calls with Tuwa's voice agent. There is also live two-way
  translation across 16 languages and voice cloning.
- **How an agent drives it.**
  - Remote MCP at `https://api.tuwa.ai/mcp` (OAuth with a Chekusu account), or a local
    `tuwa-mcp.mjs` stdio/CLI.
  - Tools: `tuwa_call_draft` (to, goal, `shareable` facts) → `tuwa_call_request_approval` →
    `tuwa_confirm` (carrying the **person's own reply**) → `tuwa_call_status` /
    `tuwa_call_result`.
  - "The person approves every call… Never approve for them."
- **Your own number.** The macOS "Tuwa Device" app connects your phone, so calls use your
  own number and cloned voice. It can also answer by rule: "No answer in 15 s · Agent picks
  up", "Weekdays after 7 pm · Agent answers".
- **Price.**
  - $0.30/min for AI calls; $0.40/min for live translation.
  - Destination surcharges of +$0–0.50 when calling from a Tuwa number.
  - Billed per started minute, from answer only.
  - Hold time counts 1 minute per 10. Spending is capped at $50/day by default.
- **Results.** A summary goes to email and back to the agent's chat. The "Friends" feature
  lets others call an AI in your voice.
- (I) Tuwa is the closest match to the roadmap's shape: draft → human approval → call →
  result. But it is a hosted service, not self-hostable, and Ducter can't see its audio.

**Building blocks for a self-hosted user:**

| Option | Model | Cost (fetched 2026-11-08) | Ghost hooks |
|---|---|---|---|
| Vapi | Hosted orchestration; bring your own STT/LLM/TTS | $0.05/min hosting + providers at cost. Estimator: $0.08–0.13/min all-in; Twilio leg $0.008–0.014 (V vapi.ai/pricing) | **`monitor.listenUrl`** (wss live audio + transcript) and **`controlUrl`**: `say`, `add-message`, `control` mute-assistant/mute-customer, `transfer`, `handoff`, `end-call` (V docs.vapi.ai/calls/call-features). Control auth is off by default (V-s): turn it on |
| Retell | Hosted | $0.07–0.31/min; example $0.11. BYO SIP has no telephony fee; a number is $2/mo. GPT Realtime via Retell is $0.38/min (V retellai.com/pricing) | Transfer (I) |
| Bland | Hosted, all-in | $0.14/min talk (Start); BYO telephony (V bland.ai/pricing) | Transfer (I) |
| OpenAI Realtime + SIP | Point a SIP trunk at `sip:$PROJECT_ID@sip.api.openai.com`. Webhook `realtime.call.incoming`, then `/v1/realtime/calls/{id}/accept`, `reject`, `refer` (V-s developers.openai.com/api/docs/guides/realtime-sip) | Model tokens + trunk. Docs name a newer `live.transport.incoming` event, so check before coding (V-s) | Sideband session to steer; `refer` to hand the call to the user (V-s / I) |
| LiveKit SIP (+ Agents) | Inbound/outbound trunks put calls into rooms as SIP participants. Tested with Twilio, Telnyx, Plivo and others. Self-hosting needs the separate SIP service (V docs.livekit.io/sip) | Self-host compute + trunk | **Best ghost fit**: the user joins the room as a participant. Warm ("agent-assisted") and cold (REFER) transfer, DTMF (V) |
| Phone number | Twilio US: $1.15/mo number, $0.014/min out, $0.0085/min in, recording $0.0025/min (V twilio.com/en-us/voice/pricing/us). Telnyx leg $0.0055/min (V vapi pricing) | | |

- **Latency.** Tuwa claims "under a second" for translation (V). (I) Expect 0.5–1.2 s
  voice-to-voice on speech-to-speech models, and more on STT→LLM→TTS chains. Either way,
  Ducter's main AI loop (seconds per turn) **cannot be the talker**. A realtime voice model
  talks; Ducter supplies the brief and the facts it may share, and reads the transcript
  (`design/conversation.md`'s allow-listed talker).
- **Your own number vs. a provider number.** (I) A provider DID (Twilio or Telnyx) is
  simple and self-hostable, but the callee sees an unknown number. "From my number" needs
  either the phone itself (Tuwa Device, or an Android phone with an audio bridge) or
  carrier call forwarding to the DID for inbound. (I) android-use can dial with the dialer
  app, but ADB can't capture or inject in-call audio without root. So **phone use and phone
  calls are separate environments**.

**Legal and consent** (not legal advice):
- **US TCPA.** The FCC's 2024-02-08 Declaratory Ruling treats AI-generated voices as
  "artificial" under the TCPA, so the prior-consent, identification and opt-out rules apply
  (V-s: orrick.com, akingump.com). The rules target robocalls and telemarketing.
  (I) One-off calls for the user to a business ("book a table") are lower risk. Bulk or
  marketing calls are out of scope.
- **California AB 2905** (Pub. Util. Code §2874, effective 2025-01-01) covers AI
  "artificial voice" in automatic dialing (V-s; vendor summaries conflict).
- **Recording.** Penal Code §632 and about a dozen other US states require **all-party
  consent** to record (I, well known; check per state). EU **AI Act Art. 50(1)** requires
  telling people they are talking to an AI system, from 2026-08-02 (I, check).
- **Ducter defaults.** The agent says it is an AI assistant calling for <user> in its first
  sentence. It announces recording before recording; with no disclosure, only a transcript
  is kept. No cloned voice of the user without their explicit, revocable opt-in, and never
  someone else's voice. Tuwa's "late grandfather's voice" feature is a line Ducter should
  not cross (V that Tuwa offers it).

## 3. Fit in Ducter

**Places and environments.**
- **Phone place** = `{device: <runner host>, phone: <serial/UDID>, kind: android|ios,
  physical|emulator}`.
- The worker hosting it is the Mac or Linux runner the phone plugs into:
  - Android: any runner with `adb`, or an emulator on a Linux VPS (KVM) or a Mac (I).
  - iOS: only a Mac runner with Xcode.
- The runner's discovery reports attached phones the way it reports checkouts
  (product-model §3, "A runner discovers the checkouts on its device").
- One task holds a phone at a time; the tools' own per-device lock backs this up.
- **Call place** = `{line: <DID or own-number bridge>, provider, direction}`. It needs
  **no runner**: the control plane, or a small always-on voice service, holds the SIP/WebRTC
  leg, so a call doesn't depend on a sleeping Mac (principle 19).
  - The talker is a realtime model given the task's brief.
  - The task window is a normal harness session that watches the transcript stream and
    steers.

**Intents and policy** (principle 18, `system.md` Safety):
- **Every call is an intent.** The intent card shows:
  - who it will call (number + resolved name);
  - its goal;
  - the facts it is **allowed to share** (Tuwa's `shareable` is the right shape);
  - money limits;
  - recording yes/no.
- Default policy: **ask** for any call to a new number; auto-approve only allow-listed
  contacts and routines. Inbound auto-answer is a Routine with a rule (time window, rings,
  caller list).
- **Phone actions gate at the effect.**
  - Read, navigate and draft run freely.
  - send / submit / pay / delete / install / change settings become intents.
  - The tools already separate typing from submitting. (I) Ducter recognizes effect taps
    via a small "commit verb" classifier on the target label (Send, Pay, Order, 确认, 支付)
    plus app class (banking, wallet, store). An effect it can't classify confidently becomes
    a decision, never a silent tap.
- **Credentials.**
  - Passwords, OTPs and Face ID never enter the model. The task enters `needs-you` with the
    tools' pause, and the user takes over on the phone or in the mirror.
  - 2FA SMS read from the phone is an effect on another account: off by default.
  - Payments always need a human confirmation, whatever the policy says (I: a hard floor,
    like Tuwa's $50/day cap).
- **Honesty about isolation.** The user's daily phone is *weak* isolation (every app and
  account is reachable). A dedicated phone or an emulator with only the needed accounts is
  stronger. The place chip shows which.

**What opening a task looks like** (`ui.md` §3, three columns):
- **Phone task.** The middle tab is a **Screen** tab: the live mirror (the tools' H.264 or
  WDA stream, relayed by the runner over its outbound WebSocket, never the raw 127.0.0.1
  URL).
  - Tap-through is allowed only after **Take over**, which pauses the agent.
  - The dossier lists pending intents ("Will tap *Pay ¥22.9* in Meituan").
- **Call task.** The middle tab is a **Call** tab: a live two-sided transcript plus an
  audio meter. Ghost controls, in increasing order of intrusion:
  1. **Listen**: stream the audio, silently.
  2. **Whisper**: typed or spoken guidance to the agent only (Vapi `add-message`, a LiveKit
     data message).
  3. **Say**: the agent speaks a line now.
  4. **Take over**: mute the agent and bridge the user's mic, or warm-transfer to the
     user's phone.
  5. **Hang up**.

  After the call: a summary, outcomes as typed report fields (booked: yes/no, time,
  reference), and the transcript. Audio is stored only if consent was announced.
- **Mobile web.** Listen and Take over are one tap from the push ("Agent is on hold with
  your bank, 12 min"). This is the "ghost" landing.

**Rough phased plan.**

| Phase | Scope | Exit |
|---|---|---|
| P0 (in v1, architecture only) | The seams below; no phone features | Nothing blocks P1–P3 |
| P1: call via a hosted provider | A `call` environment backed by Vapi or Tuwa's MCP (Tuwa for "my number" users). Intent card + policy. Transcript tab. Listen/Whisper/Hang up | 10 real errands (booking, hold queue) with zero un-approved dials |
| P2: Android phone place | android-use as a runner sidecar; Screen tab relay; Take over; effect-tap intents; emulator profile on a Linux runner | Price-compare and read-only tasks unattended; every pay/send gated |
| P3: self-hosted calls + ghost takeover | LiveKit SIP (or OpenAI SIP) + Twilio/Telnyx DID; warm transfer to the user; inbound routines | Takeover works from mobile web in < 3 s (I target) |
| P4: iPhone place | iPhone-use on a Mac runner with a paid Apple team; analytics off | A weekly re-sign is automated or flagged |

## 4. Needed in v1 so this isn't blocked later

1. **An environment interface in the runner**, beside `HarnessPort` (`system.md`):
   - `discover() → resources[]` (checkouts, browser profiles, phones);
   - `attach(task) → {mcpServers, env, lease}`;
   - `streams() → [{kind: screen|audio|transcript, open()}]`;
   - `pause/resume/takeover`;
   - `release()`.

   Repos and worktrees should be the first implementation, not a special case.
2. **Place as a typed union** in the schema: `none | folder | repos | browser | phone |
   call`, with an `isolation` field. Make sure `fw_candidates` filters on
   `environment needs` (`focus-window.md:61`) for resource kinds beyond repos.
3. **Per-task MCP sidecars**: the runner can add task-scoped MCP servers to a harness's
   config at session start, since the tool set is fixed per session (`system.md` "fixed at
   session start").
4. **A media relay over the outbound runner channel**: the WebSocket carries binary frames
   with backpressure, plus a lease that stops capture when no one is watching (android-use
   already does a 5 s viewer lease, V `docs/guide.md:293`). Don't assume the client can
   reach the device.
5. **Intent schema generality**: `kind` (push, send, pay, call, tap-effect), `target`,
   `shareable_facts`, `money_cap`, `recording`, and a `human_reply` field that must quote
   the user's own words for `requires_human` kinds (Tuwa's pattern).
6. **A takeover state in the window state machine**: `needs-you(takeover)`, distinct from a
   decision. While in it, the agent is fenced from reads (the tools' pause semantics).
7. **Control-plane-hosted environments**: a call needs no runner. Let an environment live
   on the main process, so "place without device" is valid.

## Addendum: DIYgod/pinky

Researched 2026-11-08. Shallow clone `R/pinky` @ `db40371` (2026-11-08), read-only, never
run. Labels as above (V = verified at path:line or via the GitHub API; I = inference).

**What it is.** A desktop app plus headless gateway (one Go binary, no cgo) that lets any
MCP agent drive a real iPhone or Android phone. A person watches a live mirror, approves
risky steps, takes over, and reviews a recorded history (V `README.md:8`, `:328-344`).
Pinky ships no model: the agent does the thinking (V `README.md:206`).

| | Pinky |
|---|---|
| Android control | adb (it bundles its own) plus a bundled **scrcpy server**. An optional Kotlin **companion** accessibility service reads the tree in about 70 ms instead of 2 s and types CJK. It is on only during a task, because banking apps refuse to run next to it. The fallback is `uiautomator dump` (V `README.md:159`, `:241-245`; `docs/DESIGN.md:423`). On Android 13+ the agent works on a **hidden second display**, so the phone can stay locked (V `README.md:22`) |
| iOS control | iOS 27+: Xcode's Device Hub protocol over go-ios, with nothing installed on the phone. iOS 17.4-26: Appium **WebDriverAgent**, which a free Apple ID must re-sign every 7 days. Without WDA it can only watch, read (OCR) and launch apps (V `README.md:163-170`, `go.mod` `danielpaulus/go-ios`). **Only iOS 27 has been tested on a real phone** (V `README.md:111`, `:130`) |
| Observation | An accessibility tree with element refs. Text an app draws without describing it is read by OCR on macOS and Windows (V `README.md:159`) |
| Host | macOS 12+, Windows 10/11 and Linux (glibc 2.29, GTK 3). `pinky daemon` runs a headless gateway "for a Mac mini, a NAS, a Linux box or CI" (V `README.md:41-46`; `docs/DESIGN.md:379`, `:384`). iPhones are untested on Windows and Linux (V `README.md:296`, `:304`) |
| Physical / virtual | Physical phones over USB, Wi-Fi or Tailscale, plus **Android emulators** (most acceptance checks ran on Android 10/16/17 emulators) and iOS Simulators (V `README.md:6`, `:177-181`; `docs/ACCEPTANCE.md:43`, `:54`; `internal/driver/ios/wda_device.go:28`) |
| Harness interface | **MCP** with 14 `phone_*` tools. Two transports: (1) stdio via `pinkyctl mcp`, a shim to a user-only Unix socket; (2) Streamable HTTP on 127.0.0.1:7465 with a per-agent bearer token, plus Origin and DNS-rebinding checks. The CLI is `devices`, `needs`, `token` and `daemon`. A SKILL.md is installed for the agent (V `docs/mcp.md:3`, `:70-85`; `cmd/pinky/main.go:37-65`; `README.md:134`) |
| Human takeover | Clicking the mirror pauses the agent, and on Android so does touching the phone. `phone_handoff(reason)` shows a "Needs you" card and blocks until hand-back (15 min timeout). PINs live in the OS keychain and unlocks need Touch ID or Windows Hello; agents never see them. Typing into password and OTP fields is refused, and OTPs in notifications are masked (V `README.md:13`, `:23`, `:220`; `docs/mcp.md:292`) |
| Approvals | **Enforced in the gateway**, not by prompt. Ask-actions return `approval_pending`. The Allow/Deny decision is made only in the client, and is denied after 60 s. On Allow, Pinky checks the screen again and returns `stale` if it changed. Banking, wallet and password apps are invisible by default. Commit buttons are detected in 10 languages (V `README.md:18-19`, `:213`; `docs/mcp.md:296-306`) |
| License | Apache-2.0 (V `LICENSE`, `README.md:363`) |
| Maturity | **Pre-alpha** (V `README.md:31`). The repo was created 2026-11-06 and has 535 stars and 35 forks (V GitHub API). Releases use calendar versions, with 20 releases on 2026-11-08 alone (V `CHANGELOG.md:5`). The repo has 237 `*_test.go` files, and 9 of 34 acceptance items are checked (V `docs/ACCEPTANCE.md`) |
| Telemetry | Anonymous counters (daily, keyed by a random install id) and crash reports go to `pinky-telemetry.rss3.workers.dev`. Both are **on by default, with no first-run notice**. Turn them off with `DO_NOT_TRACK=1` or `PINKY_TELEMETRY_URL=-`. Screens, typed text and app names are never sent (V `docs/TELEMETRY.md:10-14`; `internal/telemetry/telemetry.go:43`). **Auto-update is also on by default** (V `docs/notes/updates.md:35`) |

**Ducter-relevant catches.**
- **Approvals cannot be relayed into Ducter's UI.**
  - The control socket's `decide`, `hand_back` and `unlock` require a `trusted` client. That means the in-process UI, or one that proves user presence (V `internal/api/control.go:145-150`, `:193-203`; `docs/DESIGN.md:363`, `:412`).
  - `pinky decide` from the CLI works only with fake phones (V `cmd/pinky/devices.go:144-145`).
  - Approving from a notification or remote console is on the M4 roadmap and not built (V `docs/DESIGN.md:59`, `:99`).
  - Listing pending needs is untrusted (V `control.go:158`). So Ducter can *show* "waiting on Pinky", but the person must click in Pinky's window.
  - Headless `pinky daemon` with nobody at a window therefore means every Ask times out to Deny. (I) That is safe, but it can't be approved from mobile web yet.
- **The same-user shell bypass is admitted.** An agent with shell access as the user can call adb directly. Pinky's advice is to sandbox the agent, or to run the phone on another host and use HTTP MCP (V `README.md:259`). This matches Ducter's runner-sidecar model.
- **Pin versions.** Auto-update (and auto-updating the companion APK) on a runner is an unreviewed code path. (I) Disable it, and upgrade deliberately.

**Versus the two already covered.**
- **Scope.** android-use and iPhone-use each cover one OS and are Python MCP servers. Pinky covers both OSes and all three host OSes in one binary.
- **iOS.** On iOS 27, Pinky needs no WDA, so there is no 7-day re-sign. That removes iPhone-use's biggest operational cost.
- **Safety.** Pinky is the only one whose effect-gating is *outside the agent*: android-use and iPhone-use rely on instructions to the agent (V `docs/DESIGN.md:27`, `:619`). It already implements most of Ducter's §3 "gate at the effect" design: the commit-verb classifier, the app-class block list, credential fields and the `stale` re-check.
- **Background display.** Pinky's second-display mode on Android 13+ is unique among the three. It makes "the phone stays yours" real.
- **Where android-use is stronger.**
  - A longer-tested goal executor.
  - The optional Jev decider.
  - A Linux-emulator story that is documented end to end.
- **Where Pinky is weaker.**
  - It is 2 days old and churns many releases a day.
  - Its approval UI is Pinky's, not Ducter's.
  - iOS below 27 and non-macOS iPhones are untested.
  - Telemetry and auto-update default on, like iPhone-use's analytics.

**Updated recommendation.**
- **Start P2 with Pinky** as the phone-place sidecar for both Android and iPhone, replacing the planned android-use (P2) + iPhone-use (P4) split. One `environment` adapter, one MCP surface (HTTP + bearer token from `pinkyctl token`, which suits the runner's per-task MCP injection in §4.3), and gateway-enforced approvals as a hard floor under Ducter's own intents.
- **Run it as follows:**
  - pin a release;
  - set `DO_NOT_TRACK=1` and turn auto-update off;
  - use a dedicated phone or an emulator;
  - run `pinky daemon` on the runner host;
  - keep the agent sandboxed away from adb.
- **Accept the UX seam for now.** (I) Ducter shows a `needs-you(pinky)` state from `needs`, plus a "Open Pinky" deep link. Ducter's own intent cards apply first. Track Pinky's M4 remote-approval work, or upstream a presence-proving client, before promising mobile-web approval.
- **Keep android-use as the fallback** if Pinky's churn bites, or for a Linux emulator farm that has nobody at a window. Drop iPhone-use from the plan unless iOS < 27 support is needed and Pinky's WDA path is still untested on real phones.
