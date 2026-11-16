# 89. Calls from your own number, again: where the call station is when the home is a server

Date: 2026-11-16. Question (the author, after D218's card on their server home told them to plug
their phone into it and run `brew install android-platform-tools`): "我的手机不可能插在我的 vps 上，这个
设计不合理 … 充分研究推演验证之后再重新设计".
Follows [research/63](63-own-number-calls.md) (the D218 build: adb, the cable, the voice engine),
[research/60](60-phone-calls-china.md) (calls to +86 and the law), [research/22](22-phone-and-call.md),
[research/74](74-own-phone-use.md) (the accessibility service that became 用这台手机, D238).

Method. Read AOSP `main` (Telecom, the framework manifest, PermissionController's `roles.xml`,
the Bluetooth module) and developer.android.com on 2026-11-16; the macOS 26.2 SDK headers on this
Mac (Xcode, macOS 15.7.9 host) and Apple's documentation JSON; PipeWire's and BlueALSA's docs; the
D218 code in this repo. No phone, SIM, cable or Bluetooth pairing here: nothing was dialled and no
audio was moved. Tags: **VERIFIED** (I read the source, header or primary doc, with the link, on
2026-11-16), **DOCUMENTED** (a vendor, carrier or press page says so; not checked against source),
**INFERRED** (my reasoning). Every "it works" about a real Pixel Fold or a real Mac pairing is at
best INFERRED until §8's tests run.

## 1. What went wrong, exactly

- **The card assumes the home is the call station.** D218 (7): "the home only in this build". The
  card's phone step prints `own.phone.none` ("用 USB 线把安卓手机插到 %s 上") with `%s` = the home's
  name, and when adb is missing it shows a hard-coded `brew install android-platform-tools`
  (`apps/web/src/own-phone.tsx:196`; `brew install ffmpeg` at :220) whatever the home's OS
  [VERIFIED: code]. On a Linux VPS in a datacenter both are wrong: brew is a Mac tool, and no phone
  will ever be plugged into it.
- **再找一次 did nothing visible.** On a home with no adb, `scan()` sets `phones = []` and calls
  `changed()` (`packages/core/src/phone-own/index.ts:144-148`); the view is identical before and
  after, and the card shows no "looked at {time}" line, so a tap reads as a dead button [VERIFIED:
  code].
- **The deeper error is the model, not the copy.** A phone goes where its person goes. A call
  station has to be wherever the phone is, which for most people is the computer in front of them
  (a MacBook), sometimes nothing at all, and almost never the home. "Where" (D157) already says a
  task's computer is picked by what it needs; a call needs *a computer within cable or Bluetooth
  reach of the phone*, a need the home rarely meets [INFERRED].

## 2. Who, in this moment

| | The author (heavy developer) | Consumer: iPhone + Mac | Fresh user: a phone only |
|---|---|---|---|
| **Has** | Home = Linux VPS; a MacBook (worker and client) beside them; a Pixel Fold with the Ducter app paired over the network (D238 link); in mainland China, calls to +86 | One Mac (the home or a client), an iPhone on the same Apple Account | An Android phone or an iPhone, the Ducter app or web client |
| **Wants** | "给 4S 店打个电话问保养" in their own number, live, without tending the phone | The same, without buying parts | Help with a call they dread |
| **Before** | Told to plug the phone into a server | Nothing, or a parts list | Nothing |
| **After (the goal)** | The card already knows the call goes out on the Fold and the voice runs on the MacBook; at most one cable or one Bluetooth pairing, once | One switch on the Mac that Apple already offers | Zero setup: the partner prepares the call, the phone dials on one tap, the person talks with the sheet on screen |

North star: 好用 (the card never asks for an impossible step), 顺滑 (the home never pretends to be the
station), 赏心悦目 (one drawn link, phone ↔ the computer next to it), 放心 (the voice stays beside the
person; the law's reading kept), 惊喜 (it noticed the Fold and the MacBook were already together).

## 3. First principles

1. **The AI's audio must enter and leave the cellular call somewhere.** The only places are the
   phone's own audio endpoints: earpiece/mic (acoustic), a wired or USB headset, a Bluetooth
   hands-free unit, or the OS's own relay (Apple Continuity, Microsoft Phone Link). A third-party
   Android app has no software path into call audio (§4.A). So *something physical* (a cable, a
   radio link, an OS relay) has to be next to the phone.
2. **Therefore the station is defined by a link, not by a role.** "The computer the phone is linked
   to right now" — by cable, by Bluetooth, or by Continuity — is the station. The home is the
   station only if it has such a link, which a datacenter server never does.
3. **Control and audio can live in different places.** Dialling, hanging up and reading call state
   can come from the Ducter app on the phone (it already holds a network link to the home, D238);
   only *audio* needs the station. That removes adb, USB debugging and Developer options from the
   setup altogether (§4.A).
4. **The law agrees with physics.** research/60 §3.3 reads 反诈法 Art. 14 as: keep the bridge local,
   one call at a time, at a person's volume; never a SIM phone sitting somewhere driven over the
   internet. A cable or Bluetooth link makes "local" true by construction (≤ 2 m / ≈ 10 m)
   [INFERRED; still a lawyer question, research/60 §6].

## 4. The routes

### A. Android, no root: what the Ducter app itself can do

| Capability | API | Permission and how it's granted | Status |
|---|---|---|---|
| **Dial** from the SIM, no dialer confirmation | `TelecomManager.placeCall(tel:…)` or `ACTION_CALL` | `CALL_PHONE`, protection **dangerous** (runtime prompt), flagged `costsMoney`; MMI call-forwarding codes are bounced to the dialer for non-dialer apps | VERIFIED: AOSP `core/res/AndroidManifest.xml`, `TelecomManager.java` (placeCall javadoc) |
| **Call state** (idle / ringing / off-hook) | `TelephonyCallback.CallStateListener` | `READ_PHONE_STATE`, dangerous | VERIFIED: manifest. **Gap:** off-hook starts at dialling; *answered* is not visible. `READ_PRECISE_PHONE_STATE` (alerting, active) is `signature\|privileged` | VERIFIED: manifest |
| **Hang up** | `TelecomManager.endCall()` | `ANSWER_PHONE_CALLS`, dangerous\|runtime; the method is `@Deprecated` ("companion apps for wearable devices should use the InCallService API") but still present in `main` | VERIFIED: `TelecomManager.java`. Whether it still ends a call for an app targeting API 35/36 on Android 16: test (§8 P3) |
| **Keypad digits** mid-call | `Call.playDtmfTone` only inside an `InCallService` | See next rows. Without one: post-dial digits in the dialled string (`,` pause, `;` wait) for menus known in advance, or the D238 accessibility service tapping the dialer's keypad | INFERRED; test P4 |
| **Full call objects** as a non-UI `InCallService` | Telecom binds non-UI in-call services only with `CONTROL_INCALL_EXPERIENCE` (`signature\|privileged\|role`) or the `MANAGE_ONGOING_CALLS` app-op | VERIFIED: `InCallController.java` (`getInCallServiceType`) |
| **`MANAGE_ONGOING_CALLS`** | `signature\|appop`; `roles.xml` grants the app-op only to holders of `COMPANION_DEVICE_WATCH` and `COMPANION_DEVICE_GLASSES` (CompanionDeviceManager association with a watch/glasses profile, user-approved) | VERIFIED: manifest, `roles.xml`. Claiming a watch profile for a Mac is a misuse of the role [INFERRED]; not recommended |
| `CALL_COMPANION_APP` | Protection **normal**, but Telecom's `getCallCompanionApps()` returns only test overrides in `main` | VERIFIED: `RoleManagerAdapterImpl.java`. Dead end |
| Default dialer (`ROLE_DIALER`) | Full in-call API incl. audio route; must ship complete incoming and ongoing call UI | VERIFIED: developer.android.com InCallService. Replacing the person's dialer is far too much to ask [INFERRED] |
| **Call audio capture** | `AudioSource.VOICE_CALL` / `VOICE_UPLINK` / `VOICE_DOWNLINK` need `CAPTURE_AUDIO_OUTPUT` = `signature\|privileged\|role`, "Not for use by third-party applications" | VERIFIED: manifest; developer.android.com "Sharing audio input" says only a *pre-installed* app with that permission can capture the call |
| Accessibility "capture" | During a call an accessibility service may capture the **mic** (the person's side only), never the far end | VERIFIED: "Sharing audio input". Google Play has forbidden accessibility for "remote call audio recording" since 2022-05-11 [DOCUMENTED: press coverage of the policy]. Ducter's APK is sideloaded (design/android.md), but the capability is useless anyway |
| **Call audio injection** | No public API puts app audio into the uplink | INFERRED (no such API in `AudioManager`/Telecom); speakerphone + app playback is removed by the phone's own echo canceller, whose reference is what the phone plays [INFERRED] |
| Audio route | `setAudioRoute` deprecated in API 34 for `requestCallEndpointChange`, both InCallService-only | VERIFIED: InCallService reference. But see B: Telecom routes to a wired/USB headset on its own |
| Call Redirection / Call Screening roles | Exclusive roles; redirection rewrites an outgoing number, screening sees incoming calls; neither carries audio | VERIFIED: `roles.xml` (exclusive), INFERRED for "no audio" from the service APIs |
| Pixel's Call Screen, Hold for Me, Direct My Call, Call Assist, Gemini/Search "Ask for Me" | Google's own features. Ask for Me calls businesses from Google's side (US Search, launched in Labs 2025-01), not from the person's number; none exposes an API to other apps | DOCUMENTED (TechCrunch 2025-01-30, Google's Labs post via 9to5Google); "no API" INFERRED from the absence of any developer surface |

**Verdict A.** The Ducter app can *dial, hear the state roughly, and hang up* from the person's
SIM with three runtime permissions and no adb. It can never carry the AI's voice. Android-only
live AI on the person's own number is impossible without root [VERIFIED by permission levels].

### B. A cable to the computer next to the phone

- **Telecom routes a call to a USB audio device as it would to a wired headset, at once.**
  `AudioRoute.java` maps `TYPE_WIRED_HEADSET`, `TYPE_USB_HEADSET`, `TYPE_USB_DEVICE` and
  `TYPE_USB_ACCESSORY` all to `TYPE_WIRED`; `CallAudioRouteController.handleWiredHeadsetConnected()`
  calls `routeTo(…, wiredHeadsetRoute)` [VERIFIED: AOSP Telecom `main`]. AOSP lists telephony among
  USB host-mode audio uses and says routing is automatic by audio policy [VERIFIED:
  source.android.com/docs/core/audio/usb]. Whether the Pixel Fold's vendor audio HAL actually
  opens the USB path for the voice call: Google's help says all Pixels work with USB-C audio
  accessories that support digital audio, and warns some accessories can't take calls [DOCUMENTED:
  support.google.com/pixelphone/answer/7539047, /9140284]; forum reports of USB-C call dropouts
  exist [DOCUMENTED, anecdotal]. **Test P5.**
- **The chain** (D218's parts, re-read): Google's USB-C to 3.5 mm adapter (a USB audio-class DAC,
  so the Fold sees `TYPE_USB_HEADSET`) → CTIA TRRS splitter → a USB sound card on the MacBook, with
  a −20…−30 dB pad into the phone's mic. ~¥100. Cheaper and digital: none — the Mac can't be a USB
  *device* to the phone [INFERRED: Macs are USB hosts]. A Linux board in USB gadget mode (UAC2) can
  pose as a USB headset and lands on the same `TYPE_USB_DEVICE → wired` route [INFERRED; later].
- **Charging.** The Fold's one port is taken. "Audio + PD pass-through" adapters exist; whether the
  Fold accepts audio and power on one hub is device-specific [INFERRED; test P7]. A full battery
  covers several 15-minute calls, so v1 can live without it.
- **Echo and levels.** No acoustic echo (no speaker near a mic). The phone's uplink processing
  (noise suppression, AGC) runs on the injected voice; TTS is clean speech and should pass, but
  "AI voice sounds pumped" is a real risk [INFERRED; P5]. Far-end echo of the AI's own voice through
  the splitter's crosstalk is the other one, handled by the realtime model's input being gated while
  it speaks, or barge-in tuning [INFERRED].
- **The cable can be verified without a call.** With the headset attached, the Ducter app may record
  `MIC` (`RECORD_AUDIO`, runtime) — that is the headset mic, i.e. the Mac's output; the Mac plays a
  short coded chirp, the phone hears its code, and the reverse for the other leg. This proves the
  cable and *pairs this phone with this computer* with no SIM, no minutes, no adb [INFERRED; P6].
- **Who runs the voice loop:** the station (it holds the audio). The home sends the approved plan
  and receives the transcript and outcome; audio never goes to the home.

### C. Bluetooth hands-free: the computer is the "car"

- **Android side.** Android is the audio gateway (AG); any HF unit that pairs gets calls routed to
  it, and the person sees "Phone calls" on the pairing [INFERRED: standard behaviour]. A second
  Android phone can't be the HF unit: `BluetoothHeadsetClient` is `@SystemApi @hide` [VERIFIED: AOSP
  Bluetooth module], used by Android Automotive.
- **HFP itself** gives everything Ducter needs *over the air*, independent of the Ducter app: `ATD`
  to dial, `AT+CHUP` to hang up, `AT+VTS` for keypad digits, `+CIEV` call/callsetup indicators that
  *do* say alerting vs active (answered), `AT+CNUM` for the subscriber number; audio over SCO with
  CVSD (8 kHz), mSBC (16 kHz, HFP 1.6+) or LC3-SWB (32 kHz, HFP 1.9) [DOCUMENTED: Bluetooth SIG HFP
  spec; not re-read today]. It fills Android's gaps in §4.A (answer time, digits) for free.
- **macOS.** `IOBluetoothHandsFreeDevice` is still in the macOS 26.2 SDK: "Create a new
  IOBluetoothHandsFreeDevice to act as a hands free device … This will register a listener for
  incoming connections", with `dialNumber:`, `endCall`, `sendDTMF:`, `currentCallList`,
  `subscriberNumber`, `transferAudioToComputer`, `connectSCO`, codec IDs CVSD / mSBC / AAC-ELD,
  `API_AVAILABLE(macos(10.7))`, no deprecation mark, header © 2010, 2023 [VERIFIED: SDK headers on
  this Mac; developer.apple.com doc JSON]. How SCO audio surfaces is undocumented: the header imports
  CoreAudio and exposes a per-address "hands free device driver ID", which suggests a CoreAudio
  device per paired phone [INFERRED]. Developer reports are thin and discouraging (an unanswered
  2025-06 forum thread misusing it with a speaker; a 2018 bluetooth-dev thread titled "what is wrong
  with IOBluetoothHandsFreeDevice?"; Sonoma+ gates IOBluetooth behind a Bluetooth TCC prompt)
  [DOCUMENTED: developer.apple.com/forums/thread/786421, lists.apple.com bluetooth-dev 2018-01].
  research/60 said "not on macOS"; the API says *maybe*. **A one-day spike decides it (§8 B1–B6).**
  If it works, Android + Mac becomes zero-hardware.
- **Linux.** PipeWire's bluez5 lists `hfp_hf` among enabled roles by default, backends `native`,
  `ofono`, `hsphfpd` [VERIFIED: docs.pipewire.org pipewire-props(7)]. BlueALSA's own HF role does
  only the service-level connection and audio; call control needs oFono (`-p hfp-ofono`), CVSD and
  mSBC since 4.1.0 [VERIFIED: BlueALSA wiki]. Proven, but a desktop-Linux station is rare among
  Ducter's people.
- **A Raspberry Pi "car kit"** (Pi + PipeWire/oFono + a Ducter worker) works only while the phone is
  within ~10 m. Fine for a desk at home. **Not for a +86 SIM when the person is away**: a SIM phone
  left by a headless box that a server drives is the remote-gateway pattern research/60 warns about
  [INFERRED].

### D. iPhone owners: Apple's own relay

- **Calls from iPhone** on a Mac: same Apple Account, both on the same Wi-Fi, iPhone › Phone ›
  Calls on Other Devices on; with the carrier's Wi-Fi Calling for other devices, also when the iPhone
  is away [DOCUMENTED: support.apple.com HT209456]. The call is placed by the iPhone on its SIM; the
  Mac is the speaker and mic. macOS 26 adds a Phone app; its menu picks the microphone and output
  [DOCUMENTED, press only: AppleInsider 2025-06].
- **Starting it from Ducter:** opening a `tel:` URL on the Mac hands it to FaceTime/Phone, which
  asks the person to confirm [INFERRED; test M1]. One click per call is acceptable (it is the Go the
  person already gave) or Ducter's computer use (D235) clicks it [INFERRED].
- **Audio:** the far end can be captured *without a driver* by a Core Audio process tap on the
  Phone/FaceTime process (`AudioHardwareCreateProcessTap`, macOS 14.2+; it can also mute the
  process's own output; the first use prompts for system audio recording permission)
  [VERIFIED: developer.apple.com Core Audio taps doc]. The AI's voice must reach the call as a
  *microphone*: that needs a virtual input device (an AudioServerPlugIn driver, installed once with
  an admin password, e.g. the open-source BlackHole or Ducter's own) selected as the call's mic
  [INFERRED; test M2].
- **Apple's terms:** no entitlement is needed to open `tel:` or to offer an audio device; a process
  tap needs only its usage string [VERIFIED for the tap; INFERRED for the rest]. It is the person's
  own iPhone and Apple's own relay; nothing Apple forbids for personal use that I found [INFERRED].
- **China:** relay over the home Wi-Fi works with any carrier; "away from the iPhone" needs carrier
  VoWiFi, which China Telecom has only piloted (2023 pilots; cross-carrier VoWiFi test 2025)
  [DOCUMENTED: IT之家, 澎湃]. So for +86: iPhone and Mac on the same network — local, as the law
  wants [INFERRED].
- **Windows, for completeness:** Phone Link places Android/iPhone calls over Bluetooth HFP with the
  PC as the hands-free unit, audio on the PC's devices, so a virtual cable works there too
  [INFERRED; not read today]. Ducter has no Windows app.

### E. Carrier and cloud ways to "be" the person's number

| Option | Own number? | China (+86) | Verdict |
|---|---|---|---|
| Port the number to a VoIP provider | Yes | **No**: 携号转网 is between the licensed mobile operators only; individuals get no SIP termination (research/60 §3.1) | Abroad only, and it ends their mobile service; never suggest |
| Same number on a second SIM ("MultiSIM") | Yes, outgoing shows the number | No equivalent for phones; 一号双终端 is for watches (Unicom eSIM, ¥10/month) [DOCUMENTED: IT之家 2026-02] | Germany's Telekom MultiSIM gives several SIMs one number [DOCUMENTED: telekom.de business page] — a spare phone at home could then be a station, but the remote-SIM risk returns; niche |
| eSIM watch / tablet with the same number | Yes | Watches only | A watch has no audio path for Ducter; no |
| VoWiFi / VoLTE as SIP from the handset | — | — | Keys stay in the SIM/modem (research/60) [INFERRED]; no |
| GSM/LTE voice gateway (GoIP etc.) | Yes | **Banned** (Art. 14; up to CN¥500k) | **Never** |
| Google Voice / a second number | No (another number) | — | Already covered by Tuwa (D189) |

### F. No live AI on the line: the partner prepares, the person calls

- **Dial for them:** the Ducter app opens the dialer with the number filled (`ACTION_DIAL`, no
  permission) or dials on their tap (`CALL_PHONE`); on iPhone a `tel:` link [VERIFIED for the Android
  permissions; INFERRED for iOS's confirm sheet].
- **The sheet on screen during the call:** the D238 accessibility overlay already draws over every
  app; a slim card over the in-call screen with "what to ask, what not to say, the reference
  number" is a small extension [INFERRED]. Works phone-only, iPhone excepted (no overlays; the sheet
  sits in a notification / Live Activity instead) [INFERRED].
- **Notes after:** the person tells the partner what happened in one line, or dictates.
- **Listening live for notes** (speakerphone + the Mac's mic transcribing): technically trivial; law:
  - China: no statute makes one-party recording unlawful; courts admit it unless it seriously
    infringes rights (research/60 §2.4); PIPL Art. 72 excludes a natural person's processing for
    personal or family affairs [DOCUMENTED: statute; not re-read today].
  - US: federal one-party consent (18 U.S.C. §2511(2)(d)); about a dozen all-party states (e.g.
    California Penal Code §632) [DOCUMENTED; not re-read today].
  - EU: GDPR's household exemption, but national criminal law bites (Germany StGB §201 forbids
    recording the non-public spoken word without consent) [DOCUMENTED; not re-read today].
  - So: transcript only, no audio kept (D189 (9)), and the person says "我这边有 AI 帮我记一下" /
    "my assistant is taking notes" at the start; Ducter shows that line [INFERRED].

## 5. Ranking

| # | Route | Who it serves | Live AI on own number | Hardware | Verification | Legal (+86) |
|---|---|---|---|---|---|---|
| 1 | **F. Prepare + one-tap dial** | Everyone, phone-only first | No (the person speaks) | None | APIs VERIFIED; overlay INFERRED | Clean |
| 2 | **B. Cable to the computer beside the phone, control from the Ducter app** | Android + any Mac/Linux computer | Yes | ~¥100 cable set | Routing VERIFIED in AOSP; Pixel Fold call over USB audio, levels, endCall: **untested** | Local by construction; the research/60 lawyer question remains |
| 3 | **C-mac. Bluetooth, Mac as HF unit** | Android + Mac | Yes | None | API present in 26.2 SDK VERIFIED; works with an Android phone: **unknown** (spike) | Local (≈10 m) |
| 4 | **D. Continuity on the Mac** | iPhone + Mac | Yes | A virtual mic driver (software) | Relay DOCUMENTED; tap VERIFIED; mic injection and call start: **untested** | Local on one Wi-Fi |
| 5 | C-linux / Pi car kit | Developers with Linux | Yes | A Pi (~¥400) | Stack DOCUMENTED | Not for +86 when the person is away |
| 6 | E. Carrier options | Few, abroad | Partly | Varies | DOCUMENTED | Mostly impossible or banned for +86 |
| ✕ | Android app alone, accessibility tricks, SIM gateways | — | No / banned | — | VERIFIED impossible / banned | — |

If B1 succeeds, swap 2 and 3 for Android + Mac: no cable beats a cable.

## 6. The design (proposed)

### 6.1 The call station: picked by a link, never assumed

- **A station is a computer that has an audio link to the phone now:** a cable it verified with the
  chirp (B), a connected HFP session (C), or Calls from iPhone on (D). Each Ducter computer reports
  `callLink: { phone, kind: cable | bluetooth | continuity, checkedAt }`; the Ducter app on an
  Android phone reports `dial: granted | missing` (CALL_PHONE, READ_PHONE_STATE, ANSWER_PHONE_CALLS).
- **The home is just another candidate.** A home with no display, no Bluetooth and no USB sound
  card (a VPS) is never named on the card; the card lists only computers that could become one: Macs
  and Linux desktops with the Ducter app (D157's Devices already knows them).
- **Picking per call:** a station whose link is live → else one that had a link and is awake (the
  card says "把 Pixel Fold 连上 MacBook" before Go) → else route F's one-tap dial, offered on the same
  Go card ("你来打，我把要说的放在屏幕上"). Never a silent fallback to Tuwa for an own-number request.
- **Who does what:** the Ducter app dials and hangs up (B) or the station does over HFP (C) /
  Continuity (D); the station runs the realtime voice loop (OpenAI default, Qwen for +86 —
  research/63 §2) and streams state and transcript to the home; the home holds the Go, the rails, the
  Log and the outcome. Audio never leaves the station except to the voice model (as in D218).
- **adb leaves the user path.** Kept only as a developer fallback on a station the phone is plugged
  into (D218's wrapper), never on the card's first screen.
- **Rails for +86 (research/60):** an own-number call runs only while the station is linked to the
  phone *and* the station is a computer the person uses (a client or worker with the Ducter app, not
  a headless box); one call at a time, 10 a day, nothing recorded, caller ID never hidden (D218 (5)).

### 6.2 The setup card, per person (zero setup first)

Copy here is a sketch for the change loop; any new user-facing word ("通话电脑"?) goes through the
glossary first. A literal sentence avoids a new noun: **电话从你的 {phone} 打出，声音走 {computer}。**

**The author (VPS home, MacBook, Pixel Fold with the app, China).**
0. Without doing anything: the Go card already offers **你来打 / You call** (F) for any own-number
   call.
1. **手机 / Phone** — ticked: "Pixel Fold（Ducter app 已连上）". Next: **在手机上允许 Ducter 打电话** —
   one tap sends the three runtime prompts to the phone (the same "open on the phone" move as D247).
2. **声音走哪台电脑 / Which computer carries the voice** — preselected **MacBook** (the only computer
   that can; hel is not listed). Two ways, the likelier first:
   - **蓝牙 / Bluetooth** (if the spike passes): "在 MacBook 的蓝牙里连上 Pixel Fold，手机上打开「通话」" —
     ticks itself when the HFP session comes up.
   - **一根线 / A cable**: the parts list (Google's USB-C headset adapter, splitter, USB sound card,
     pad) and the drawing; ticks itself when the chirp passes both ways.
3. **实时语音 / Live voice** — Qwen preselected for +86 (OpenAI not offered in China).
4. **试打一通 / Test call** — as D218, from the Fold through the MacBook.
- Every **再找一次** shows the time it looked and what it saw ("12:03 找过：MacBook 上没有声卡").

**The consumer with iPhone + Mac.**
0. **你来打** works at once (a `tel:` link on whichever device they're on).
1. **用 iPhone 的号码打 / Use your iPhone's number**: Ducter on the Mac checks Calls from iPhone; if
   off, shows the two switches (iPhone › Phone › Calls on Other Devices; the Mac's Phone settings).
2. **让 Ducter 的声音进电话 / Let Ducter's voice into the call**: install the virtual mic (one admin
   password), allow system audio recording once.
3. Live voice, test call.

**The fresh user with only a phone.**
- Only route F. The partner prepares the sheet and the number; **打过去** dials; the sheet floats
  over the call (Android) or sits in a notification (iPhone); afterwards "怎么样？" in one line.
- One sentence says what more is possible, without a parts list: **想让我替你说话，需要一台电脑放在手机
  旁边。** with **看看怎么弄** behind a fold. The card for live calls doesn't appear until a computer
  exists.

### 6.3 Cost

| | Author | iPhone + Mac | Phone only |
|---|---|---|---|
| Hardware | ¥0 (Bluetooth, if it works) or ~¥100 cable set | ¥0 | ¥0 |
| Voice | OpenAI ~$0.10–0.25 per talking minute; Qwen to measure (research/63) | same | none |
| Airtime | their plan | their plan | their plan |

## 7. What to build first

1. **Fix today's card (hours):** never name a server home as the place to plug a phone; OS-correct
   commands (no brew on Linux; on a Mac, Ducter's own SDK as D217 already downloads); 再找一次 says
   when it looked and what it saw. Hide the live-call card on homes that can't be stations and offer
   F instead.
2. **Route F everywhere (a day):** the Go card's **你来打** with one-tap dial from the Ducter app and
   the sheet over the call. Ships value to all three people now, no hardware, no law question.
3. **The Bluetooth spike on the author's MacBook and Fold (a day, §8 B1–B6).** It decides whether
   Android + Mac needs any hardware.
4. **Move control into the Ducter app** (dial, state, hang up; HFP when available) and **the voice
   loop onto the station** (D218 (7)'s worker step), with the station picked by link (§6.1).
5. **The cable route on a Mac station** with the chirp check (P5, P6).
6. **Continuity for iPhone** after that (needs a driver and its own tests, M1–M4).
7. Linux/Pi station: when someone asks.

## 8. Real-device tests to run

**On the Pixel Fold (Android 16), with the Ducter app:**
- P1. `placeCall` with `CALL_PHONE` to a +86 mobile and to an E.164 foreign number: dials without the
  dialer's confirm; time to ringing.
- P2. `TelephonyCallback` states for an outgoing call (expect off-hook at dial, nothing at answer);
  whether the D238 accessibility service can read the Pixel Phone app's in-call timer as "answered".
- P3. `endCall()` with `ANSWER_PHONE_CALLS`, app targeting API 35/36: does it hang up?
- P4. Keypad digits: post-dial `,`/`;` through `placeCall`; accessibility taps on the dialer keypad.
- P5. Google USB-C adapter + splitter + USB sound card on the MacBook: the call routes to it at once
  (`AudioDeviceInfo.TYPE_USB_HEADSET`); both directions audible; pad value; does uplink processing
  distort TTS; crosstalk echo; 15 minutes without a dropout.
- P6. The chirp handshake with no call: the app records the headset mic and hears the Mac's code;
  the Mac hears the app's tone.
- P7. A PD pass-through audio adapter: charges and carries call audio at once?

**Bluetooth, MacBook (macOS 15.x and 26) + Pixel Fold:**
- B1. Pair from the Fold: does it offer "Phone calls" for the Mac (needs an HF SDP record, UUID
  0x111E, which `IOBluetoothHandsFreeDevice` should publish)?
- B2. A 100-line Swift probe: `initWithDevice:delegate:`, `connect`, service-level connection up.
- B3. `dialNumber:` places a call on the Fold; `+CIEV` callbacks show alerting then active.
- B4. SCO up: does a CoreAudio input/output device appear; can AVAudioEngine/ffmpeg read and write
  it; which codec (CVSD/mSBC) negotiated.
- B5. `sendDTMF:` reaches a phone menu; `endCall` hangs up.
- B6. TCC: which prompts appear (Bluetooth; microphone) in the signed Ducter app.

**On a Mac with an iPhone (Continuity):**
- M1. `open tel:+…` from the app: which app, what confirm, can computer use press it.
- M2. Select a virtual input (BlackHole) as the call's mic; the far end hears injected audio.
- M3. A process tap on the Phone/FaceTime process captures the far end; mute it locally.
- M4. Detect answered / ended (window, AX tree, or audio) and hang up via AX.

## 9. Legal posture per route (with research/60)

- **B, C (a computer the person uses, within cable/BT reach), D (same Wi-Fi):** the person's own
  real-name SIM, their own handset with them, one call at a time, an AI that says what it is. The
  bridge is local by construction. Residual: research/60 §6's lawyer questions (Art. 14's reading;
  disclosure wording) before offering to mainland users at large.
- **Pi car kit / spare phone left at home, person away:** close to a remote SIM gateway; not for a
  +86 SIM.
- **E:** SIM gateways never; porting impossible for +86.
- **F:** no AI on the line; live notes only with the person's spoken notice and no audio kept.

## Implications for Ducter

- Retire "the home is the call station" (D218 (7)): a station is whichever computer has a live audio
  link to the phone; the home is a candidate only if it has one, and a server never does.
- Control moves to the Ducter Android app (CALL_PHONE, READ_PHONE_STATE, ANSWER_PHONE_CALLS), so adb,
  USB debugging and Developer options leave the user path; audio stays at the station; the voice loop
  runs there and reports to the home.
- Add route F (the person calls, the partner prepares, one tap, the sheet over the call) as the
  zero-setup baseline and as the Go card's alternative whenever no station is linked.
- Bluetooth on the Mac is the potential zero-hardware route for Android; spike it before building
  more cable UI. Continuity is the iPhone route, later.
- Fix the card now: no Mac commands on Linux, no "plug into {server}", a visible result for 再找一次.
- Needs a Dn (supersedes D218 (1), (2) "Phone" step, (7)), glossary words for the station sentence,
  and updates to `design/phone.md` §10, `design/where.md` (a call's need), `docs/calls.md`.

## Summary

The AI's voice can enter a cellular call only through a physical link at the phone: a cable, a
Bluetooth hands-free link, or Apple's own relay. A third-party Android app can dial, see a rough
call state and hang up (VERIFIED permission levels), but can never touch call audio
(`CAPTURE_AUDIO_OUTPUT` is `signature|privileged|role`). So the call station must be the computer
beside the phone (the author's MacBook), never a server home. Ranked: (1) the person calls with the
partner's sheet, zero setup; (2) a cable from the phone to the computer beside it, with control from
the Ducter app and AOSP routing USB headsets to calls (VERIFIED in source; untested on the Fold);
(3) the Mac as a Bluetooth hands-free unit (`IOBluetoothHandsFreeDevice` still in the macOS 26.2
SDK; works with Android: unknown, a one-day spike); (4) Continuity for iPhone + Mac (process taps
VERIFIED; mic injection untested). Carrier routes are mostly impossible or banned for +86. Build
first: fix the card, ship route F, run the Bluetooth spike, then move control into the app and the
voice loop onto the station.

## Sources (read 2026-11-16 unless marked)

- AOSP `main`: `frameworks/base/core/res/AndroidManifest.xml` (CALL_PHONE, READ_PHONE_STATE,
  READ_PRECISE_PHONE_STATE, ANSWER_PHONE_CALLS, CALL_COMPANION_APP, MANAGE_ONGOING_CALLS,
  CONTROL_INCALL_EXPERIENCE, CAPTURE_AUDIO_OUTPUT, MODIFY_AUDIO_ROUTING):
  https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/core/res/AndroidManifest.xml
- Telecom: `InCallController.java`, `RoleManagerAdapterImpl.java`, `CallAudioRouteController.java`,
  `AudioRoute.java`: https://android.googlesource.com/platform/packages/services/Telecomm/+/refs/heads/main/src/com/android/server/telecom/
- `TelecomManager.java` (placeCall, endCall): https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/telecomm/java/android/telecom/TelecomManager.java
- PermissionController `roles.xml`: https://android.googlesource.com/platform/packages/modules/Permission/+/refs/heads/main/PermissionController/res/xml/roles.xml
- `BluetoothHeadsetClient.java` (@SystemApi): https://android.googlesource.com/platform/packages/modules/Bluetooth/+/refs/heads/main/framework/java/android/bluetooth/BluetoothHeadsetClient.java
- InCallService reference: https://developer.android.com/reference/android/telecom/InCallService
- Sharing audio input: https://developer.android.com/media/platform/sharing-audio-input
- USB digital audio: https://source.android.com/docs/core/audio/usb
- Pixel help, USB-C audio: https://support.google.com/pixelphone/answer/7539047 ; https://support.google.com/pixelphone/answer/9140284
- Play policy on accessibility call recording (2022-05-11), press: https://9to5google.com/2022/04/21/google-will-block-all-third-party-call-recording-apps-on-play-store-from-may-11/
- Google "Ask for Me": https://techcrunch.com/2025/01/30/googles-ask-for-me-feature-calls-businesses-on-your-behalf-to-inquire-about-services-pricing/
- macOS 26.2 SDK, `IOBluetooth.framework/Headers/objc/IOBluetoothHandsFree*.h` (local Xcode);
  https://developer.apple.com/documentation/iobluetooth/iobluetoothhandsfreedevice
- Apple forums thread 786421 (2025-06): https://developer.apple.com/forums/thread/786421 ; bluetooth-dev 2018-01 (title only; the page returned 502): https://lists.apple.com/archives/bluetooth-dev/2018/Jan/msg00000.html
- Core Audio taps: https://developer.apple.com/documentation/coreaudio/capturing-system-audio-with-core-audio-taps ; `AudioHardwareCreateProcessTap` (macOS 14.2)
- Calls on Mac via iPhone: https://support.apple.com/en-us/HT209456 ; macOS 26 Phone app (press): https://appleinsider.com/articles/25/06/09/macos-26-tahoe-phone-app-greatly-improves-taking-calls-on-your-mac
- PipeWire bluez5 roles: https://docs.pipewire.org/page_man_pipewire-props_7.html
- BlueALSA HFP/HSP: https://github.com/arkq/bluez-alsa/wiki/Using-BlueALSA-with-HFP-and-HSP-Devices
- Bluetooth SIG, Hands-Free Profile 1.9 (not re-read): https://www.bluetooth.com/specifications/specs/hands-free-profile-1-9/
- China Telecom VoWiFi (press): https://www.ithome.com/0/890/657.htm ; https://www.thepaper.cn/newsDetail_forward_28237949
- China Unicom 一号双终端 (press): https://www.ithome.com/0/919/287.htm
- Telekom MultiSIM: https://geschaeftskunden.telekom.de/business/en/produkte/mobilfunk/tarife-optionen/zusatzkarten/multisim
- This repo: `apps/web/src/own-phone.tsx`, `apps/web/src/i18n-phone.ts`, `packages/core/src/phone-own/index.ts`, `design/decisions.md` D189, D193, D208, D218, D238
