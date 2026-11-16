//go:build darwin

package voice

// The Mac's own speech engines (D305), reached through purego as the rest of
// the app reaches the system without cgo (media/pdf_darwin.go): the Speech
// framework's SFSpeechRecognizer fed from AVAudioEngine's input, asked to
// stay on this Mac whenever it can for the language, and
// AVSpeechSynthesizer for Read aloud. The sound is never written anywhere;
// only the words come back. Nothing here runs in tests (they use Fake).

import (
	"math"
	"sync"
	"time"
	"unsafe"

	"github.com/ebitengine/purego"
	"github.com/ebitengine/purego/objc"
)

var (
	loadOnce sync.Once
	loadErr  error
)

func load() error {
	loadOnce.Do(func() {
		for _, f := range []string{
			"/System/Library/Frameworks/Foundation.framework/Foundation",
			"/System/Library/Frameworks/AppKit.framework/AppKit",
			"/System/Library/Frameworks/AVFoundation.framework/AVFoundation",
			"/System/Library/Frameworks/Speech.framework/Speech",
		} {
			if _, err := purego.Dlopen(f, purego.RTLD_LAZY|purego.RTLD_GLOBAL); err != nil {
				loadErr = err
				return
			}
		}
	})
	return loadErr
}

func sel(n string) objc.SEL  { return objc.RegisterName(n) }
func cls(n string) objc.ID   { return objc.ID(objc.GetClass(n)) }
func nsstr(s string) objc.ID { return cls("NSString").Send(sel("stringWithUTF8String:"), s) }
func gostr(id objc.ID) string {
	if id == 0 {
		return ""
	}
	return objc.Send[string](id, sel("UTF8String"))
}
func pool() objc.ID { return cls("NSAutoreleasePool").Send(sel("new")) }

// audioType is AVMediaTypeAudio's value.
const audioType = "soun"

// bundled says whether the app has the usage descriptions macOS needs before
// it asks for the microphone or Speech Recognition; without them macOS ends
// the process, so outside the installed app voice says why instead.
func bundled() bool {
	b := cls("NSBundle").Send(sel("mainBundle"))
	for _, k := range []string{"NSMicrophoneUsageDescription", "NSSpeechRecognitionUsageDescription"} {
		if b == 0 || b.Send(sel("objectForInfoDictionaryKey:"), nsstr(k)) == 0 {
			return false
		}
	}
	return true
}

func micState() string {
	switch objc.Send[int](cls("AVCaptureDevice"), sel("authorizationStatusForMediaType:"), nsstr(audioType)) {
	case 3:
		return Granted
	case 0:
		return Ask
	}
	return Denied
}

func speechState() string {
	switch objc.Send[int](cls("SFSpeechRecognizer"), sel("authorizationStatus")) {
	case 3:
		return Granted
	case 0:
		return Ask
	}
	return Denied
}

// System is the Mac's recognizer.
type System struct {
	mu   sync.Mutex
	run  *listening
	pref []string
}

// NewSystem is the Mac's own recognizer.
func NewSystem() *System { return &System{} }

type listening struct {
	engine, req, task, rec, input objc.ID
	tap, handler                  objc.Block
	h                             Hearing
	last                          string
	stopping, done                bool
	levelAt                       time.Time
	mu                            sync.Mutex
}

func recognizer(locale string) objc.ID {
	loc := cls("NSLocale").Send(sel("localeWithLocaleIdentifier:"), nsstr(locale))
	return cls("SFSpeechRecognizer").Send(sel("alloc")).Send(sel("initWithLocale:"), loc)
}

func (s *System) Can(locale string) Availability {
	if load() != nil || !bundled() {
		return Availability{Why: WhyMac}
	}
	p := pool()
	defer p.Send(sel("drain"))
	a := Availability{Mic: micState(), Speech: speechState()}
	if cls("AVCaptureDevice").Send(sel("defaultDeviceWithMediaType:"), nsstr(audioType)) == 0 {
		a.Why = WhyNoMic
		return a
	}
	r := recognizer(locale)
	if r == 0 {
		a.Why = WhyLang
		return a
	}
	defer r.Send(sel("release"))
	a.Where = WhereApple
	if objc.Send[bool](r, sel("supportsOnDeviceRecognition")) {
		a.Where = WhereDevice
	} else if !objc.Send[bool](r, sel("isAvailable")) {
		a.Why = WhyNetwork
		return a
	}
	switch {
	case a.Mic == Denied:
		a.Why = WhyMic
	case a.Speech == Denied:
		a.Why = WhySpeech
	default:
		a.OK = true
	}
	return a
}

func (s *System) Ask(locale string, done func(Availability)) {
	if s.Can(locale).Why == WhyMac {
		done(Availability{Why: WhyMac})
		return
	}
	speech := func() {
		if speechState() != Ask {
			done(s.Can(locale))
			return
		}
		b := objc.NewBlock(func(_ objc.Block, _ int) {
			done(s.Can(locale))
		})
		cls("SFSpeechRecognizer").Send(sel("requestAuthorization:"), b)
		b.Release()
	}
	if micState() != Ask {
		speech()
		return
	}
	b := objc.NewBlock(func(_ objc.Block, granted bool) {
		if granted {
			speech()
		} else {
			done(s.Can(locale))
		}
	})
	cls("AVCaptureDevice").Send(sel("requestAccessForMediaType:completionHandler:"), nsstr(audioType), b)
	b.Release()
}

func (s *System) Start(locale string, h Hearing) error {
	if a := s.Can(locale); !a.OK {
		return whyError(a.Why)
	}
	s.Cancel()
	p := pool()
	defer p.Send(sel("drain"))
	l := &listening{h: h}
	l.rec = recognizer(locale)
	if l.rec == 0 {
		return whyError(WhyLang)
	}
	l.req = cls("SFSpeechAudioBufferRecognitionRequest").Send(sel("new"))
	l.req.Send(sel("setShouldReportPartialResults:"), true)
	if objc.Send[bool](l.rec, sel("supportsOnDeviceRecognition")) {
		l.req.Send(sel("setRequiresOnDeviceRecognition:"), true)
	}
	if objc.Send[bool](l.req, sel("respondsToSelector:"), sel("setAddsPunctuation:")) {
		l.req.Send(sel("setAddsPunctuation:"), true)
	}
	l.engine = cls("AVAudioEngine").Send(sel("new"))
	l.input = l.engine.Send(sel("inputNode"))
	format := l.input.Send(sel("outputFormatForBus:"), uint(0))
	l.tap = objc.NewBlock(func(_ objc.Block, buf objc.ID, _ objc.ID) {
		p := pool()
		defer p.Send(sel("drain"))
		l.req.Send(sel("appendAudioPCMBuffer:"), buf)
		l.level(buf)
	})
	l.input.Send(sel("installTapOnBus:bufferSize:format:block:"), uint(0), uint32(1024), format, l.tap)
	l.engine.Send(sel("prepare"))
	if !objc.Send[bool](l.engine, sel("startAndReturnError:"), uintptr(0)) {
		l.teardown()
		return whyError(WhyBusy)
	}
	l.handler = objc.NewBlock(func(_ objc.Block, result objc.ID, err objc.ID) {
		l.result(result, err)
	})
	l.task = l.rec.Send(sel("recognitionTaskWithRequest:resultHandler:"), l.req, l.handler)
	s.mu.Lock()
	s.run = l
	s.mu.Unlock()
	return nil
}

func (l *listening) level(buf objc.ID) {
	n := int(objc.Send[uint32](buf, sel("frameLength")))
	chans := objc.Send[unsafe.Pointer](buf, sel("floatChannelData"))
	if n == 0 || chans == nil || l.h.Level == nil {
		return
	}
	now := time.Now()
	l.mu.Lock()
	if now.Sub(l.levelAt) < 50*time.Millisecond || l.done {
		l.mu.Unlock()
		return
	}
	l.levelAt = now
	l.mu.Unlock()
	samples := unsafe.Slice((*float32)(*(*unsafe.Pointer)(chans)), n)
	var sum float64
	for _, v := range samples {
		sum += float64(v) * float64(v)
	}
	rms := math.Sqrt(sum / float64(n))
	db := -100.0
	if rms > 0 {
		db = 20 * math.Log10(rms)
	}
	l.h.Level(LevelOfDB(db))
}

func (l *listening) result(result, err objc.ID) {
	l.mu.Lock()
	if l.done {
		l.mu.Unlock()
		return
	}
	final := false
	if result != 0 {
		l.last = gostr(result.Send(sel("bestTranscription")).Send(sel("formattedString")))
		final = objc.Send[bool](result, sel("isFinal"))
	}
	stopping, text := l.stopping, l.last
	if final || err != 0 {
		l.done = true
	}
	l.mu.Unlock()
	switch {
	case final || (err != 0 && (stopping || text != "")):
		l.teardown()
		if l.h.Final != nil {
			l.h.Final(text)
		}
	case err != 0:
		l.teardown()
		if l.h.Error != nil {
			l.h.Error(WhyError)
		}
	case l.h.Partial != nil:
		l.h.Partial(text)
	}
}

func (l *listening) teardown() {
	if l.engine != 0 {
		l.engine.Send(sel("stop"))
		l.input.Send(sel("removeTapOnBus:"), uint(0))
	}
}

func (s *System) Stop() {
	s.mu.Lock()
	l := s.run
	s.run = nil
	s.mu.Unlock()
	if l == nil {
		return
	}
	l.mu.Lock()
	l.stopping = true
	l.mu.Unlock()
	l.teardown()
	l.req.Send(sel("endAudio"))
	// The last words come in the task's final result; if it doesn't come,
	// what was heard so far stands.
	go func() {
		time.Sleep(2 * time.Second)
		l.mu.Lock()
		if l.done {
			l.mu.Unlock()
			return
		}
		l.done = true
		text := l.last
		l.mu.Unlock()
		l.task.Send(sel("cancel"))
		if l.h.Final != nil {
			l.h.Final(text)
		}
	}()
}

func (s *System) Cancel() {
	s.mu.Lock()
	l := s.run
	s.run = nil
	s.mu.Unlock()
	if l == nil {
		return
	}
	l.mu.Lock()
	l.done = true
	l.mu.Unlock()
	l.teardown()
	if l.task != 0 {
		l.task.Send(sel("cancel"))
	}
}

// SystemSpeaker is the Mac's own voice.
type SystemSpeaker struct {
	mu    sync.Mutex
	synth objc.ID
	gen   int
	done  func()
}

// NewSpeaker is the Mac's own voice.
func NewSpeaker() *SystemSpeaker { return &SystemSpeaker{} }

func (s *SystemSpeaker) Speak(text, locale string, done func()) bool {
	if load() != nil {
		return false
	}
	p := pool()
	defer p.Send(sel("drain"))
	v := cls("AVSpeechSynthesisVoice").Send(sel("voiceWithLanguage:"), nsstr(locale))
	if v == 0 {
		return false
	}
	s.Stop()
	s.mu.Lock()
	if s.synth == 0 {
		s.synth = cls("AVSpeechSynthesizer").Send(sel("new"))
	}
	s.gen++
	gen, synth := s.gen, s.synth
	s.done = done
	s.mu.Unlock()
	u := cls("AVSpeechUtterance").Send(sel("speechUtteranceWithString:"), nsstr(text))
	u.Send(sel("setVoice:"), v)
	synth.Send(sel("speakUtterance:"), u)
	go func() {
		time.Sleep(400 * time.Millisecond)
		for {
			time.Sleep(150 * time.Millisecond)
			s.mu.Lock()
			if s.gen != gen {
				s.mu.Unlock()
				return
			}
			speaking := objc.Send[bool](synth, sel("isSpeaking"))
			if speaking {
				s.mu.Unlock()
				continue
			}
			d := s.done
			s.done = nil
			s.mu.Unlock()
			if d != nil {
				d()
			}
			return
		}
	}()
	return true
}

func (s *SystemSpeaker) Stop() {
	s.mu.Lock()
	d := s.done
	s.done = nil
	s.gen++
	synth := s.synth
	s.mu.Unlock()
	if synth != 0 {
		synth.Send(sel("stopSpeakingAtBoundary:"), 0)
	}
	if d != nil {
		d()
	}
}

// WatchFn calls change when Fn (the Globe key) goes down or up while a
// window of this app is in front: an NSEvent local monitor of the
// modifier flags (keyCode 63). No Input Monitoring permission: it sees only
// what macOS already sends this app. Call it on the main thread.
func WatchFn(change func(down bool)) (stop func()) {
	if load() != nil {
		return func() {}
	}
	b := objc.NewBlock(func(_ objc.Block, ev objc.ID) objc.ID {
		if ev != 0 && objc.Send[uint16](ev, sel("keyCode")) == 63 {
			change(objc.Send[uint](ev, sel("modifierFlags"))&(1<<23) != 0)
		}
		return ev
	})
	mon := cls("NSEvent").Send(sel("addLocalMonitorForEventsMatchingMask:handler:"), uint64(1<<12), b)
	if mon != 0 {
		mon.Send(sel("retain"))
	}
	return func() {
		if mon != 0 {
			cls("NSEvent").Send(sel("removeMonitor:"), mon)
			mon.Send(sel("release"))
		}
		b.Release()
	}
}
