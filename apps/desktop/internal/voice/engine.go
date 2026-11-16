package voice

// Where a recognizer turns the sound into words, said in the privacy line.
const (
	WhereDevice = "device" // on this Mac
	WhereApple  = "apple"  // Apple's speech recognition servers
)

// A permission's state, as macOS keeps it.
const (
	Granted = "granted"
	Denied  = "denied"
	Ask     = "ask" // not asked yet: the OS asks on first use
)

// Why voice isn't available here (the words: voice.why.<Why>); "mic" and
// "speech" are the denied states (voice.denied.mic / .speech).
const (
	WhyMac     = "mac"     // not run as the installed app: no usage descriptions
	WhyLang    = "lang"    // the recognizer doesn't know the language
	WhyNoMic   = "nomic"   // no microphone
	WhyNetwork = "network" // the service can't be reached
	WhyBusy    = "busy"    // another app has the microphone
	WhyError   = "error"   // anything else
	WhyMic     = "mic"     // the microphone was refused
	WhySpeech  = "speech"  // Speech Recognition was refused
)

// Availability is what the recognizer can do for a locale now, without
// asking anything.
type Availability struct {
	OK          bool
	Where       string // WhereDevice or WhereApple
	Why         string // when !OK
	Mic, Speech string // Granted, Denied or Ask
}

// Hearing receives what is heard. Each may be called from any goroutine.
type Hearing struct {
	Partial func(text string) // the words so far
	Final   func(text string) // the words once listening stopped (maybe "")
	Level   func(level float64)
	Error   func(why string) // listening ended without words
}

// Recognizer turns the person's speech into words (Speech framework on the
// Mac; a fake in tests). It listens only between Start and Stop or Cancel.
type Recognizer interface {
	Can(locale string) Availability
	// Ask asks macOS for whatever is still Ask (the microphone, then
	// Speech Recognition) and says the result; it never listens.
	Ask(locale string, done func(Availability))
	Start(locale string, h Hearing) error
	// Stop ends listening; Final follows.
	Stop()
	// Cancel ends listening; nothing follows.
	Cancel()
}

// Speaker says words aloud with the system's own voice.
type Speaker interface {
	// Speak says text in locale; false when there is no voice for it.
	// done is called once it has finished or was stopped.
	Speak(text, locale string, done func()) bool
	Stop()
}

// SettingsURL is where macOS keeps the switch for a refused permission.
func SettingsURL(why string) string {
	if why == WhySpeech {
		return "x-apple.systempreferences:com.apple.preference.security?Privacy_SpeechRecognition"
	}
	return "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"
}

type whyError string

func (w whyError) Error() string { return string(w) }

// Why is the reason an error from Start carries.
func Why(err error) string {
	if w, ok := err.(whyError); ok {
		return string(w)
	}
	return WhyError
}
