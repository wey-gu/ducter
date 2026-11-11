# 63. Calls from the owner's own phone and SIM: the voice engine, adb, the cable, and what was checked

Date: 2026-11-12. Question (the author): "做一下 物理手机+ sim 卡方式，用它打电话，这个适用于全世界的场景".
Context: Tuwa (research/53, D189, D193, D208) can't call mainland China and calls from its own
numbers. Research 60 (phone calls to mainland China, on its own branch when this was written)
ranked "your phone makes the call" (its option A) as the live path for China and a useful one
everywhere: an Android phone with the owner's SIM, a wired headset cable to a computer, adb to dial,
a voice model on the computer. This report settles what option A left open: which voice engine,
what adb can and can't read, what the cable is, and what could be checked here without a phone.

Method. No real phone, SIM, sound card or key; no call placed, nothing spent. An Android 16
emulator (`google_apis_playstore`, arm64, its fake modem) in a scratch SDK in the session
scratchpad; ffmpeg 9.0.2 on this Mac; vendors' public docs. Tags: **VERIFIED** (seen here),
**DOCUMENTED** (a vendor or official page says so), **INFERRED** (my reading).

## 1. Who and why

- **The heavy developer** abroad (the author, often in Japan) wants calls to China, and calls in
  their own name to people who would never pick up an unknown number.
- **The consumer user** in mainland China has no AI calling service open to individuals (research
  60: every cloud path needs a verified enterprise); their own phone is the only lawful live route.
- **The fresh user** sees one card with five steps that tick themselves off, and a parts list.

## 2. The voice engine

A call needs hearing, deciding and speaking in under a second, interruptions (the callee talks
over the agent), tool calls (ask the owner, press digits, end), and voicemail sense.

| Option | Turn latency | Cost / talking minute | China | Tools, barge-in | Verdict |
|---|---|---|---|---|---|
| **OpenAI Realtime, `gpt-realtime-2.1`** (speech to speech, WebSocket) | One model, no hops; semantic VAD with `interrupt_response` [DOCUMENTED: Realtime guide] | Audio $32 in / $0.40 cached / $64 out per 1M tokens; user audio 600 tokens/min, assistant 1,200/min [DOCUMENTED: pricing page, voice-latency-cost guide] → roughly $0.10–0.25 a minute with history re-read each turn [INFERRED] | Not offered in mainland China [INFERRED: OpenAI's supported regions] | Function calling, `conversation.item.truncate` on barge-in [DOCUMENTED] | **Default** |
| `gpt-realtime-2.1-mini` | Same | Audio $10 / $0.30 / $20 → ~$0.03–0.08 a minute [INFERRED] | No | "May follow instructions and call functions less reliably" [DOCUMENTED] | Cheaper option later; a call in someone's name wants the steadier model |
| **Qwen-Omni-Realtime** (Alibaba Model Studio, DashScope) | One model; `server_vad` [DOCUMENTED] | Not read; ~$0.05 a minute assumed for the card [INFERRED, to check] | **Yes** (Beijing region) [DOCUMENTED] | Same event names as OpenAI's beta shape (`session.update`, `input_audio_buffer.append`, `response.audio.delta`); function calling referenced [DOCUMENTED]; input PCM 16 kHz | **For mainland China** |
| ASR → LLM → TTS (e.g. Whisper + Claude + a TTS) | 3 hops, ~1.5–2.5 s a turn [INFERRED] | Varies | Depends on each | Barge-in and turn-taking built by hand | Not now: slower, more parts |
| Gemini Live | One model | Not checked | No | Yes | Not chosen: one OpenAI-shaped protocol serves two engines |

The owner's Claude and ChatGPT subscriptions don't include a real-time voice API: the card says so
and asks for a key [INFERRED from each plan's terms: subscriptions are app access, not API].

## 3. adb on the phone (the emulator, VERIFIED unless said)

- `adb shell am start -a android.intent.action.CALL -d tel:<number>` dials from the shell user, no
  root. On the emulator a number written with `+` was dropped at once (`DisconnectCause REMOTE`,
  cause 2), the national form went through; a real phone takes E.164 [INFERRED: standard dialer
  behaviour].
- `dumpsys telephony.registry` prints `mCallState=<0|1|2>` and `mPreciseCallState=Ringing call
  state: r, Foreground call state: f, …`. Seen: idle `0`/`-1`, dialing `3`, active `1`,
  disconnected `7` (kept until the next call). Seen on the emulator: idle → dialing (after ~1–12 s
  of dialer start-up) → active (the fake modem answers by itself).
- `input keyevent KEYCODE_ENDCALL` hangs up: active → idle, seen.
- An incoming fake call (`adb emu gsm call`) showed `mCallState=2` with foreground `3` on this image,
  not ringing `5`: the emulator's modem is an imperfect model. Ducter treats any non-idle state as
  "the phone is busy" and never answers.
- `getprop gsm.sim.state` → `READY`; `gsm.operator.alpha` → `T-Mobile`. The phone's own number is
  not readable without privileged APIs [INFERRED]; Ducter uses the number in Your details, or one
  typed on the card.
- **Not checked:** keypad digits mid-call through `input keyevent KEYCODE_<digit>` (no DTMF trace on
  the emulator; whether the in-call screen takes them without the dialpad open varies by dialer)
  [INFERRED; check on a real phone]; ALERTING (`4`) on real networks before the callee answers
  [INFERRED from AOSP]; `dumpsys audio` naming a wired or USB headset (`DEVICE_IN_WIRED_HEADSET`,
  `headset(4)`) — the emulator has none; its dump shows only `speaker(2)`.

## 4. The cable

The phone must believe a headset with a microphone is plugged in, so it routes the call there
[INFERRED: Android routes call audio to a wired headset by default]. Parts (about ¥100 / $15):
a USB-C to 3.5 mm headset adapter (if no jack), a CTIA TRRS splitter, a USB sound card with mic and
headphone sockets, and an attenuating cable (about −25 dB): line level from a computer is far louder
than a mic, and the pad's load helps the phone detect a microphone [INFERRED]. Bluetooth HFP works
from Linux (BlueALSA/oFono), not from a Mac (research 60) — left for later.

On the computer, ffmpeg reaches the sound card: `-f avfoundation -i ":<name>"` in, `-f
audiotoolbox -audio_device_index <n>` out on a Mac (both listed here, VERIFIED), PulseAudio on
Linux. A capture through the BlackHole loopback driver read all zeros: macOS hands a process
without microphone permission silence [INFERRED], so the home asks for the microphone once
(`NSMicrophoneUsageDescription`, and the `device.audio-input` entitlement on the helper).

## 5. What runs where

The call runs on the computer the phone is plugged into (D157's "where"). Built for the home; a
worker computer next to the phone is a later step (the worker would run adb, ffmpeg and the voice
loop and stream state to the home). The phone is never driven from far away: research 60 §3.3's
reading of 反诈法 Art. 14 (keep the bridge local, one call at a time, at a person's volume).

## 6. To check with real hardware and a key

1. The precise call states on a real network (alerting before answer, active on answer).
2. Keypad digits mid-call through `input keyevent`; if not, a dialpad tap or a `tel:` with `,`
   pauses for menus known in advance.
3. `dumpsys audio`'s headset words on two phones (Pixel, a Xiaomi or Huawei).
4. Levels through the cable: the attenuator's value; whether the far end hears an echo of itself.
5. The GA session shape against the real `gpt-realtime-2.1` (`audio.input.transcription` model
   name, usage fields) and Qwen-Omni-Realtime's exact session fields, tools and price.
6. Microphone permission in the signed Mac app when ffmpeg is the capturing child.

## Implications for Ducter

- A second `CallProvider`, local: the owner's phone over adb (dial, hang up, call state, keypad,
  SIM and headset facts only), the cable through ffmpeg, the voice through one Realtime-shaped client
  with two engines (OpenAI default, Qwen for mainland China). Same Go card, rails and outcomes.
- Setup is a checklist the home reads itself, ending in an AI-free test call.
- One call at a time, never over the owner's own call, 10 a day, nothing recorded.

## Summary

The owner's Android phone and SIM can place Ducter's calls anywhere the SIM can call, including
mainland China, with a ~$15 cable to the home computer, adb, ffmpeg and a real-time voice key.
OpenAI's `gpt-realtime-2.1` is the default engine (one model, sub-second turns, tools, barge-in,
~$0.10–0.25 a talking minute); Qwen-Omni-Realtime speaks the same protocol for mainland China. The
emulator confirmed dialing, the call-state lines and hanging up over adb; the cable, keypad digits,
real-network states and both engines are checked only with fakes so far (§6).

## Sources

- OpenAI pricing: https://developers.openai.com/api/docs/pricing ; voice latency and cost: https://developers.openai.com/api/docs/guides/voice-latency-cost ; realtime conversations: https://developers.openai.com/api/docs/guides/realtime-conversations
- Alibaba Model Studio, Qwen-Omni-Realtime: https://www.alibabacloud.com/help/en/model-studio/omni-realtime-websocket-access ; client events: https://help.aliyun.com/zh/model-studio/client-events
- Android: https://developer.android.com/reference/android/telephony/PreciseCallState
