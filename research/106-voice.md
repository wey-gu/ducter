# 106 · Voice on each platform: what listens, what speaks, and where the sound goes

Date: 2026-11-17. Question (`research/100` item 6, scenario H2): Ducter has no voice. For a first
slice (hold to talk in the composer, read a message aloud), which speech engines does each client
platform already have, which of them run on the device and which send the sound to a server, what
permissions they need, and what can the privacy line honestly say?

Method: platform documentation (Apple, Android, MDN, Chromium's blink-dev), read 2026-11-17, and
the shells' own code. Nothing was run against a real microphone or speaker; every claim below is
tagged. No outside product is compared.

## 1. The Mac (the native app, Go through purego)

| Claim | Tag | Source |
|---|---|---|
| `SFSpeechRecognizer` (Speech framework) exists on macOS 10.15+, one recognizer per locale; `supportedLocales()` lists them. | DOCUMENTED | developer.apple.com/documentation/speech/sfspeechrecognizer |
| `supportsOnDeviceRecognition` says whether that locale can be recognized on the device; setting the request's `requiresOnDeviceRecognition = true` keeps the audio on the device (the request fails rather than go to Apple's servers). | DOCUMENTED | developer.apple.com/documentation/speech/sfspeechrecognitionrequest/requiresondevicerecognition |
| Without it, recognition may go to Apple's servers, and Apple documents per-device and per-app limits on server recognition. | DOCUMENTED | Speech framework overview, "Asking permission to use speech recognition" |
| Two permissions: Speech Recognition (`requestAuthorization`, Info.plist `NSSpeechRecognitionUsageDescription`) and the microphone (`AVCaptureDevice requestAccess(for: .audio)`, `NSMicrophoneUsageDescription`). Asking without the usage description ends the process. | DOCUMENTED | developer.apple.com, "Requesting authorization for media capture on macOS"; Info.plist keys |
| `AVAudioEngine`'s input node with `installTap(onBus:bufferSize:format:block:)` gives the PCM buffers both the recognizer and a level meter read. | DOCUMENTED | developer.apple.com/documentation/avfaudio/avaudionode/installtap |
| `AVSpeechSynthesizer` with `AVSpeechSynthesisVoice(language:)` speaks with the system's voices on the device; nil means no voice for that language. | DOCUMENTED | developer.apple.com/documentation/avfaudio/avspeechsynthesizer |
| purego's `objc` package can make Objective-C blocks (`objc.NewBlock`), so the completion handlers above are reachable without cgo. | VERIFIED | `github.com/ebitengine/purego@v0.11.1/objc/objc_block_darwin.go` (read) |
| The Fn (Globe) key has no key code in MyGo's events (`KeyCodeForMac(0x3F) == CodeUnknown`); an `NSEvent` local monitor for flags-changed events sees it (keyCode 63) while the app is in front, without Input Monitoring. macOS may also start its own dictation or the emoji picker on Fn, by the person's Keyboard setting. | VERIFIED (MyGo) / DOCUMENTED (NSEvent) / INFERRED (the conflict) | `mygo@v0.8.3/internal/platform/keycode_test.go`; NSEvent `addLocalMonitorForEvents(matching:handler:)` |

## 2. The iPhone app (WKWebView shell)

| Claim | Tag | Source |
|---|---|---|
| The same `SFSpeechRecognizer` (iOS 10+), `supportsOnDeviceRecognition` and `requiresOnDeviceRecognition` (iOS 13+); the same two permissions and usage strings. | DOCUMENTED | as §1 |
| `AVAudioSession` must be set to a record category while listening and deactivated after, or playback elsewhere stays ducked. | DOCUMENTED | developer.apple.com/documentation/avfaudio/avaudiosession |
| Safari has `webkitSpeechRecognition`, but whether a WKWebView page gets a working one is not documented; the shell therefore does it natively over the bridge. | INFERRED | MDN compatibility table; no WebKit statement for WKWebView |

## 3. The Android app (WebView shell)

| Claim | Tag | Source |
|---|---|---|
| `SpeechRecognizer` talks to the phone's chosen recognition service (on most phones Google's); `RecognizerIntent.EXTRA_PREFER_OFFLINE` asks it to stay offline when it can. | DOCUMENTED | developer.android.com/reference/android/speech/SpeechRecognizer; RecognizerIntent |
| API 31+: `SpeechRecognizer.isOnDeviceRecognitionAvailable` and `createOnDeviceSpeechRecognizer` run recognition on the device. | DOCUMENTED | same |
| `RECORD_AUDIO` is a runtime permission; Android 11+ needs a `<queries>` entry for `android.speech.RecognitionService` to see the service. | DOCUMENTED | developer.android.com, package visibility |
| `onRmsChanged(rmsdB)` gives a level, in an undocumented scale (observed elsewhere as about −2 to 10). The shell maps it with `(rmsdB + 2) / 12`. | INFERRED | the reference documents only "the new RMS dB value" |
| Which company runs the default service is read from `Settings.Secure` `voice_recognition_service` (a Google package → "Google"). | INFERRED | not a documented API contract |
| `TextToSpeech` with `setLanguage`; `LANG_MISSING_DATA` / `LANG_NOT_SUPPORTED` mean no voice. Most engines' voices are on the device; some engines can use network voices. | DOCUMENTED / INFERRED (network voices) | developer.android.com/reference/android/speech/tts/TextToSpeech |
| A WebView page's `webkitSpeechRecognition` is not usable in Android WebView. | DOCUMENTED | MDN compatibility table (WebView Android: no) |

## 4. A browser (the web client, wide and phone)

| Claim | Tag | Source |
|---|---|---|
| Chrome and Edge implement `SpeechRecognition` (prefixed `webkitSpeechRecognition`); by default the audio goes to the browser maker's service (Chrome: Google's servers). Firefox has none. | DOCUMENTED | MDN "Using the Web Speech API"; Microsoft Edge docs "speech recognition api" |
| On-device recognition in Chrome: `SpeechRecognition.available({langs, processLocally: true})` returns `available` when the language pack is on the device, and `processLocally = true` on the instance keeps it there; `install()` fetches a pack. Shipped through blink-dev "Intent to Ship: On-device Web Speech API"; reported unreliable in at least one Chromium-based browser (available says "downloading", nothing downloads) and disabled on ChromeOS. | DOCUMENTED | MDN `SpeechRecognition/available_static`, `processLocally`; blink-dev intent; Brave issue 55414; chrome-ai-dev-preview thread |
| Safari's recognizer is Apple's (Siri's), which may run on the device or on Apple's servers; the page can't tell which. | INFERRED | WebKit has not documented it |
| The microphone needs a secure context (https or localhost); a home reached over plain http on a LAN can't listen. | DOCUMENTED | MDN `getUserMedia` |
| `speechSynthesis` speaks with the system's voices; each `SpeechSynthesisVoice` says `localService` (on the device) or not (Chrome's "Google …" voices are network voices). Chrome stops a single long utterance after about 15 s. | DOCUMENTED / INFERRED (the 15 s cut, widely reported, not documented) | MDN `SpeechSynthesisVoice.localService` |
| A page can't open the browser's site settings; it can only say where they are. | INFERRED | no web API for it |

## 5. What Ducter already has

- D218's realtime voice loop (`phone.md` §10) is a cloud speech model (OpenAI Realtime or Qwen) with
  the person's own API key, built for phone calls through their Android phone. It costs per minute
  and sends the sound to that provider. For dictation and reading aloud, the platform engines are
  free, need no key, and run on the device where they can; the realtime loop stays for calls and a
  later full spoken conversation.
- The shells already have request/response bridges (iOS `WKScriptMessageHandlerWithReply`, Android
  `WebMessageListener`) and a way to push into the page (`evaluateJavaScript`), so voice needs no
  new channel.

## Implications for Ducter

1. Use each platform's own engines: Speech framework + AVSpeechSynthesizer on the Mac and the
   iPhone, SpeechRecognizer + TextToSpeech on Android, the Web Speech API in a browser. No cloud
   account, no key, nothing installed.
2. Prefer the device: `requiresOnDeviceRecognition` where Apple supports the language, Android's
   on-device recognizer on API 31+, Chrome's `processLocally` when its pack is installed, voices
   with `localService` first.
3. Say where the sound goes from what the engine reports, in one plain line: on this device, Apple's,
   Google's, this browser's (Chrome's is Google's), or the phone's service. Never claim "on device"
   when the engine can't promise it.
4. Explain first, then let the OS ask: the page's one line, then the system prompt; denied leads to
   the system's own setting where an app can open it, words where a browser can't.
5. On the Mac, a key to hold works only while Ducter is in front (a local monitor); Fn may clash
   with macOS's own dictation, so right Option is the default and Fn a choice with a line.

## Summary

Every client already has a speech recognizer and a voice. Apple and Android can keep recognition on
the device for many languages and say so; Chrome now can too when a language pack is installed;
otherwise the sound goes to Apple's, Google's or the browser maker's service, which the privacy line
says plainly. Two permissions on Apple platforms, one on Android, one prompt in a browser over https.
D218's realtime loop is a paid cloud model and stays for calls.
