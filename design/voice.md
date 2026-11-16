# Voice: hold to talk, read aloud (D305)

The first voice slice. The person holds the mic and speaks; their words land in the composer,
or go at once when they slide up. A partner's message can be read aloud in its own language.
Both use the platform's own speech engines: nothing new is installed, no key is needed, and
Ducter's home never hears the sound. A full spoken conversation (a call with the partner) is
later (`todo.md`); D218's realtime voice loop is for phone calls and stays there.

Evidence: `research/106-voice.md` (what each platform's recognizer and voice do, and where).

## Who and how it feels

- **The consumer** used to WeChat's 按住说话 and to Siri: hold, talk, let go. Before: a long
  thought typed on a phone with one thumb. After: said in ten seconds, read back before it goes.
- **The heavy developer** at the Mac, hands on the keyboard: hold a key (Fn or right Option),
  talk a paragraph of context, let go, edit, send. Before: typing the same brief again.
- **The fresh user**: a mic mark where every messaging app has one. The first hold explains in
  one line why it needs the microphone and where the sound goes; then the OS asks.

好用: one gesture, nothing to set up. 顺滑: words appear as they are heard. 赏心悦目: the clay
partner leans in to listen, a calm meter breathes with the voice. 放心: listens only while held;
a plain line says whether the sound stays on the device. 惊喜: replies can be read back while
the person is talking by voice.

## Hold to talk

**Where:** the conversation's composer on every client (the Mac app, the web wide and phone,
the iPhone and Android apps through the same page). Not in an opened task's composer in this
slice (`todo.md`).

**The mark:** a drawn microphone, a quiet round icon button just before Send. Its tooltip and
accessible name: 按住说话 / Hold to talk (the Mac with a key: 按住 {key} 说话 / Hold {key} to talk).

**The gesture** (`packages/protocol/src/voice.ts`, `holdIntent`):

| Doing | Letting go does | The line over the composer |
|---|---|---|
| holding, not slid | the words go into the composer, after what is typed (`joinHeard`), not sent | 松开，放进输入框 / Let go to put it in the box |
| slid up ≥ 56 pt | sends at once (the words, plus anything typed) | 松开，直接发出去 / Let go to send it now |
| slid left ≥ 72 pt | drops what was heard | 松开，这段不要了 / Let go to drop it |
| a tap (< 250 ms) | nothing; a hint 要按住说，松开就好。/ Hold it while you talk, then let go. | |
| Esc while holding | drops it | |

Sliding back under a line disarms it; nothing is decided until the press ends. The two cues
上滑发送 / Slide up to send and 左滑取消 / Slide left to cancel sit at the strip's ends as their
own small elements (D291), each brightening when armed.

**The Mac's key:** Settings › 外观和声音 / Look and sound › 语音 / Voice › 按住说话的键 / Key to hold:
**Fn** · **右边的 Option / Right Option** (the default: nothing else in macOS uses it alone) ·
**不用键 / None**. Holding it while the window is in front listens; letting go puts the words in
the box; Esc drops them. Fn carries one line: if macOS's own dictation also starts on Fn, set
"Press Fn key to" to Do Nothing. Only while Ducter is the front window: no global key, no
Input Monitoring permission.

**Language:** the conversation's language (D292 `convLang`), else the interface's, as a full
locale (`speechLocale`: a preferred locale of the same language wins, else its usual region).

**While listening:** a strip rises over the composer (the composer stays, its words visible):
the partner's clay face at 40 pt in the listening pose (tilted toward the mic, leaning in, eyes
open), a five-bar level meter from the mic level (`meterBars`, `smoothLevel`: up quickly, down
slowly), the words heard so far in the ink, and the line from the table. Under Reduce Motion
the face holds its pose without moving and the meter is one dot whose opacity follows the level.
The strip comes in over 180 ms (ease out) and goes over 140 ms; at once under Reduce Motion.

**Nothing heard:** 没听清，再说一次？/ Didn't catch that. Try again? for 2.4 s in the strip's place.

## First use, permission, and unavailable

**First hold** (per device; the web in `localStorage`, the Mac in `desktop.json`): a small card
over the composer, in place of listening:

- 用说的，不用打字 / Talk instead of typing
- 只在你按住的时候听，松开就停。/ It listens only while you hold, and stops when you let go.
- the privacy line for this platform (below)
- **用麦克风 / Use the microphone** (then the OS's own prompt) · **先不用 / Not now**

**The privacy line** says where the sound goes, from what the engine reports:

| Where | Line |
|---|---|
| on this device | 转成文字是在这台设备上做的，声音不离开它。/ Your words become text on this device. The sound never leaves it. |
| Apple's servers | 声音会交给 Apple 的语音识别转成文字，Ducter 不留声音。/ The sound goes to Apple's speech recognition to become text. Ducter keeps none of it. |
| Google's servers | …Google 的… / …Google's… |
| a browser's service | 声音会交给这个浏览器的语音识别转成文字（Chrome 用的是 Google 的），Ducter 不留声音。 |
| an Android phone's service, not known | 声音会交给这台手机的语音识别服务转成文字，Ducter 不留声音。 |

Apple's recognizer is asked to stay on the device whenever it can for the language
(`requiresOnDeviceRecognition` when `supportsOnDeviceRecognition`); Android's on-device recognizer
is used when the phone has one for the language (API 31+), else the phone's service with offline
preferred.

**Denied:** Ducter 现在不能用麦克风。/ Ducter can't use the microphone right now. (or …语音识别
/ Speech Recognition) with **去设置里打开 / Open Settings**: the iPhone app opens its own page in
Settings; Android opens the app's details; the Mac opens Privacy & Security › Microphone (or
Speech Recognition); a browser says 在地址栏旁边的网站设置里允许麦克风，再按住试一次。

**Unavailable:** the mic mark stays (so it can explain), dimmed; a hold says 这里还不能用语音 /
Voice isn't available here and the reason (`voice.why.*`): a browser without speech recognition
(Firefox), a language the recognizer doesn't know (named by its autonym), no microphone, a page
not over https, the service unreachable, an app too old for voice (the page asks the app; no
`voice` in `ducterNative`), the microphone in use, the Mac app not run as the installed app.

## Read aloud

- **朗读 / Read aloud** in a partner message's menu (D254's: its time, Reply, Copy, **朗读**,
  Copy link, Select text), and on a wide screen a quiet speaker mark beside the hover actions.
  While it reads: **停止朗读 / Stop reading**, and the message's bubble carries a small meter.
  Starting another stops the first.
- **What is read:** `speakable(text)`: the words as a person reads them; rich blocks (D303) are
  already plain text; code blocks are skipped; a link reads its words, never the address.
- **Language:** the message's own (`readLang`: detected, else the conversation's, else the
  interface's), the platform voice for `speechLocale` of it; on-device voices first (the web
  picks `localService` voices). No voice for it: 这台设备没有{language}的朗读声音。
- **用语音说的时候，把回复念出来 / Read replies aloud when I talk by voice** (off by default;
  Settings › 外观和声音 › 语音 on the Mac, Settings › 这台手机 / This phone on the web and in the
  apps): after a message sent by voice (slid up, or a draft whose words came by voice,
  sent with Send), the partner's next reply in this conversation is read aloud on this device only.
  Typing anything stops it. Never for a push, never on another device.

## The app bridge (the iPhone and Android shells)

The page asks; the app answers and pushes events. `ducterNative.voice = 1` says the shell can.

| Page → app (`nativeCall`) | Answer |
|---|---|
| `{t:"voice.can", lang}` | `{ok, where, why?, mic, speech}`; `where` is `device`/`apple`/`google`/`service`; `mic`/`speech` are `granted`/`denied`/`ask`; never prompts |
| `{t:"voice.start", id, lang}` | `{ok:true, where}` or `{ok:false, why}`; asks the OS for what is still `ask` first |
| `{t:"voice.stop", id}` | stops listening; a `final` then `end` follow |
| `{t:"voice.cancel", id}` | stops; only `end` follows |
| `{t:"voice.settings", which?}` | opens the app's page in the system's Settings |
| `{t:"speak", id, text, lang}` | `{ok:true}` or `{ok:false, why:"voice"}` |
| `{t:"speak.stop"}` | stops; `spoken` follows |

App → page: `window.ducterVoice?.(e)` with `e` one of `{id, kind:"level", level}` (0–1, at most
20 a second: `(dB + 50) / 40` clamped), `{id, kind:"partial", text}`, `{id, kind:"final", text}`,
`{id, kind:"error", why}`, `{id, kind:"end"}`, `{id, kind:"spoken"}`.

## The Mac

The Mac app draws its own composer (`views/composer` in `conversation.go`) and reaches the
system through purego, as it does for PDFs: `internal/voice` holds the Go port of
`voice.ts` (passes `fixtures/voice.json`), a `Recognizer` (Speech framework's
`SFSpeechRecognizer` over `AVAudioEngine`'s input tap) and a `Speaker` (`AVSpeechSynthesizer`),
each with a fake for tests. The bundle's Info.plist carries `NSSpeechRecognitionUsageDescription`
beside the microphone's; run outside the bundle, the app says 装好的 Ducter 应用才能用麦克风。
rather than let macOS end it.

## Never

- Never listens without a press held; never a wake word; never records or keeps the sound;
  the home never receives audio, only the words the person chose to send.
- Never reads a task's transcript, a card or a block's markup aloud; never reads aloud on its own
  except the reply to a message the person just sent by voice, with the setting on.
- Never "dictation", "ASR", "TTS", "transcribe" on screen.
