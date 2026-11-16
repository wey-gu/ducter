//go:build !darwin

package voice

// Off the Mac there is no system recognizer or voice here: voice says why.

type none struct{}

// NewSystem is a recognizer that is never available.
func NewSystem() Recognizer { return none{} }

func (none) Can(string) Availability               { return Availability{Why: WhyMac} }
func (none) Ask(_ string, done func(Availability)) { done(Availability{Why: WhyMac}) }
func (none) Start(string, Hearing) error           { return whyError(WhyMac) }
func (none) Stop()                                 {}
func (none) Cancel()                               {}

type mute struct{}

// NewSpeaker is a voice that never speaks.
func NewSpeaker() Speaker { return mute{} }

func (mute) Speak(string, string, func()) bool { return false }
func (mute) Stop()                             {}

// WatchFn does nothing off the Mac.
func WatchFn(func(bool)) func() { return func() {} }
