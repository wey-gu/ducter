package voice

import "sync"

// Fake is a Recognizer for tests and the test renderer: it never touches a
// microphone. A test drives it with Hear, SetLevel and the fields.
type Fake struct {
	mu    sync.Mutex
	Avail Availability
	// AskTo is what Ask turns each Ask state into (Granted by default).
	AskTo string
	// Heard is what Stop's Final says (as if heard after the partials).
	Heard     string
	Listening bool
	Locale    string
	Starts    int
	h         Hearing
}

// NewFake is a fake that can listen, on the device, everything granted.
func NewFake() *Fake {
	return &Fake{Avail: Availability{OK: true, Where: WhereDevice, Mic: Granted, Speech: Granted}}
}

func (f *Fake) Can(string) Availability {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.Avail
}

func (f *Fake) Ask(_ string, done func(Availability)) {
	f.mu.Lock()
	to := f.AskTo
	if to == "" {
		to = Granted
	}
	if f.Avail.Mic == Ask {
		f.Avail.Mic = to
	}
	if f.Avail.Speech == Ask && f.Avail.Mic == Granted {
		f.Avail.Speech = to
	}
	if f.Avail.Mic == Denied {
		f.Avail.OK, f.Avail.Why = false, WhyMic
	} else if f.Avail.Speech == Denied {
		f.Avail.OK, f.Avail.Why = false, WhySpeech
	}
	a := f.Avail
	f.mu.Unlock()
	done(a)
}

func (f *Fake) Start(locale string, h Hearing) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.Listening, f.Locale, f.h = true, locale, h
	f.Starts++
	return nil
}

// Hear says partial words, as the recognizer does while listening.
func (f *Fake) Hear(text string) {
	f.mu.Lock()
	h := f.h
	f.Heard = text
	f.mu.Unlock()
	if h.Partial != nil {
		h.Partial(text)
	}
}

// SetLevel is the microphone's level now.
func (f *Fake) SetLevel(l float64) {
	f.mu.Lock()
	h := f.h
	f.mu.Unlock()
	if h.Level != nil {
		h.Level(l)
	}
}

func (f *Fake) Stop() {
	f.mu.Lock()
	h, heard, was := f.h, f.Heard, f.Listening
	f.Listening, f.h = false, Hearing{}
	f.mu.Unlock()
	if was && h.Final != nil {
		h.Final(heard)
	}
}

func (f *Fake) Cancel() {
	f.mu.Lock()
	f.Listening, f.h = false, Hearing{}
	f.mu.Unlock()
}

// FakeSpeaker is a Speaker for tests: it says nothing, and finishes when
// told (Finish). NoVoice lists locales it has no voice for.
type FakeSpeaker struct {
	mu       sync.Mutex
	NoVoice  map[string]bool
	Said     []string
	Locales  []string
	Speaking bool
	done     func()
}

func (s *FakeSpeaker) Speak(text, locale string, done func()) bool {
	s.mu.Lock()
	if s.NoVoice[locale] {
		s.mu.Unlock()
		return false
	}
	prev := s.done
	s.Said, s.Locales, s.Speaking, s.done = append(s.Said, text), append(s.Locales, locale), true, done
	s.mu.Unlock()
	if prev != nil {
		prev()
	}
	return true
}

// Finish ends what it is saying, as the voice does at the last word.
func (s *FakeSpeaker) Finish() {
	s.mu.Lock()
	d := s.done
	s.Speaking, s.done = false, nil
	s.mu.Unlock()
	if d != nil {
		d()
	}
}

func (s *FakeSpeaker) Stop() { s.Finish() }
