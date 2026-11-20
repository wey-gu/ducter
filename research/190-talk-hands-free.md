# 190 · Talk hands-free: listening turn by turn on each platform's own speech

Date: 2026-11-21. Question (`research/184` #5): the person talks to the partner like a call while
cooking, driving or walking, without holding anything. What does each platform's own speech give
for a continuous, turn-by-turn talk (end of a turn, talking over the voice, how long a session
lasts), what must Ducter add itself, and should the talk use a realtime speech model instead?

Method: the platform documentation already read for `research/106` (Apple, Android, MDN, Chromium),
re-read for continuous use; Ducter's own code (`voice-engine.ts`, `internal/voice`, D218's realtime
loop). Nothing was run against a real microphone, recognizer or voice; every claim is tagged. No
outside product is compared.

## 1. What a recognizer gives for a continuous talk

| Claim | Tag | Source |
|---|---|---|
| Web Speech `SpeechRecognition` with `continuous = true` and `interimResults = true` keeps a session open and sends partial and final results; a session still ends on its own (silence, a time limit, the network), and `onend` fires. | DOCUMENTED | MDN `SpeechRecognition.continuous`, `end` event |
| Chrome's server recognizer ends a continuous session after about a minute of silence and at a few minutes in any case; the exact numbers are not documented. | INFERRED | widely reported; not in MDN or the spec |
| `SFSpeechAudioBufferRecognitionRequest` has a limit of about one minute of audio per request (Apple's documentation for server recognition); on-device requests are not documented to have it. A talk restarts the request per turn, which keeps every request short either way. | DOCUMENTED / INFERRED (on-device) | developer.apple.com, Speech framework, "Recognizing speech in live audio" |
| Android's `SpeechRecognizer` ends a session by its own end-of-speech detection (`onEndOfSpeech`, then `onResults`); `EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS` is documented as a hint that recognizers may ignore. | DOCUMENTED | developer.android.com RecognizerIntent |
| No platform recognizer exposes a "the person has finished their turn" signal a page or the Mac app can rely on across languages: Apple's `isFinal` comes on stop, Web Speech's `isFinal` marks a phrase, not a turn. | DOCUMENTED (the APIs) / INFERRED (the conclusion) | as above |

**So Ducter ends a turn itself**: a quiet gap after the last change in the words heard. 1.2 s ends a
turn; 2.4 s when the words end on a filler or a joining word (嗯, 然后, 还有, "and", "so", "um"),
where a person is mid-thought. INFERRED values, to be tuned on a real microphone (`todo.md`).

## 2. Talking over the voice (barge-in)

| Claim | Tag | Source |
|---|---|---|
| `getUserMedia({audio: {echoCancellation: true}})` cancels the page's own playback in that stream; whether it applies to `SpeechRecognition`'s own capture is not specified. | DOCUMENTED / INFERRED | MDN `MediaTrackConstraints.echoCancellation` |
| `AVAudioEngine`'s input node has `setVoiceProcessingEnabled(_:)` (echo cancellation for playback through the same engine); `AVSpeechSynthesizer` plays outside that engine by default. | DOCUMENTED / INFERRED (the effect on the synthesizer) | developer.apple.com AVAudioInputNode |
| A recognizer listening while the speaker plays hears the voice's own words, slightly misheard. | INFERRED | physics; no platform promises to remove it |

**So Ducter guards in words, not only in audio**: what is heard while the partner speaks has the
voice's own words taken off its front (`afterEcho`: the longest front of the heard units that appears,
in order, in what is being said); what is left must be two units or more (a Han character or a
word each), a stop word ("停", "stop"), or, while a card is asked, an answer to it, before the voice
stops. The rest of that session is read past the same echo; the recognizer restarts after each thing
said, so the echo never builds up. On a phone held close or with earphones the echo is small; on a
laptop's speakers it is the main risk (live check owed).

## 3. Realtime speech model vs. the platform's own speech

| | Platform recognizer + voice + the partner (chosen) | A realtime speech model (D218's loop) |
|---|---|---|
| Who answers | The partner, with its tools, tasks, memory and cards | A second brain that would need the partner's tools wired in, or would relay to it |
| Cost, key | None; works with any partner engine | Per minute, the person's own key; not open to individuals in mainland China (research/60) |
| Where the sound goes | On the device where the platform can (D305's privacy line) | To the model's provider |
| Latency per turn | gap (1.2 s) + the partner's turn (2–8 s, INFERRED from D120's ack timing) + the first words of the voice | about a second (DOCUMENTED by providers) |
| Voice quality | The system's voices | Natural |

The motivation's partner is the one the person talks to; a faster but different brain on the call
would break that, and the cost and region rules break it for the consumer in China. The platform
path is chosen; a realtime model on the person's own key stays a later option (`todo.md`).

## 4. The spoken form

The partner already writes like a friend texting (persona: short, plain, one idea per message, no
lists unless the content is a list). A spoken form made by code from that is enough for the first
slice: its words as read (`speakable`), whole sentences up to about fifteen seconds (Han characters
weigh 1, other words 1.5, 60 in all), the first sentence always whole, and "其余的写在屏幕上了。 /
The rest is on the screen." when cut. No persona or tool description changes, so no partner eval is
needed (D175). A partner that knows it is heard (a channel note asking for a spoken answer) is the
alternative if real talks show written answers read badly; that would need the eval twice.

## 5. Cards by voice and the floor

A card that waits for a Go is asked aloud ("要把这个分支合进 main 吗？说「好」，或者「先等等」。"; the
hint only on the first card of a talk) and answered by a few words, matched whole after fillers come
off ("好", "可以啊", "OK", "go ahead"; "先等等", "算了吧", "not now"). Anything else said is a message,
and the card stays. Never by voice: paying (Pay, checkout), passwords, keys and sign-ins, a Go that
deletes (D340's words), what one of the person's agents or a stranger asked (D170, D334), and what
must be seen to be decided (a written draft, a tap on a phone or in the person's apps, a phone
call's Go, the person's own phone lent). Those are said with "这个要你在屏幕上点一下。", and "好" to
them gets that line again, never a Go.

## Implications for Ducter

1. Talk hands-free on the engines hold to talk already uses (D305), on every client; no new engine,
   key or permission.
2. Ducter ends turns itself (a quiet gap, longer after a filler) and guards barge-in by words.
3. One shared reducer (`talkStep`) with a fixture both the web and the Mac pass, so the turn-taking
   is the same everywhere and testable with scripted fakes.
4. The spoken form is made by code; no persona change.
5. The floor stays a tap; the talk says so.
6. Owed live: the quiet gaps, the echo guard on a laptop's speakers and with earphones, Safari's and
   the iPhone shell's behaviour while recognizing and speaking at once, a screen that stays on.

## Summary

No platform recognizer says when a person has finished a turn, and none promises to remove the
voice's own echo from what it hears, so Ducter adds both in code: a 1.2 s quiet gap (2.4 s after a
filler) ends a turn, and what is heard while the partner speaks has the voice's own words taken off
before it can cut in. The platform's own speech keeps the partner as the one who answers, costs
nothing, works in mainland China and keeps the sound on the device where it can; a realtime model
would be faster but a different brain on a paid key. The spoken form is the written answer cut to
about fifteen seconds; cards are asked aloud and answered by "好" / "先等等", never the floor.
