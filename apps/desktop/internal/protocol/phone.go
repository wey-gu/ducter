package protocol

// Phone calls (D189, D193; design/phone.md), as packages/protocol/src/phone.ts
// says them: a call Ducter places for the owner through a calling
// connection (Tuwa first), its Go card, a question from the line, the
// phone card in Settings › Accounts and the device sign-in.

// KindPhoneCall is one snapshot of a call; the latest per CallID wins.
const KindPhoneCall = "phone_call"

// Call states (CallState in phone.ts).
const (
	CallNeedsGo   = "needs_go"
	CallHeld      = "held"
	CallWaiting   = "waiting"
	CallCalling   = "calling"
	CallTalking   = "talking"
	CallAsking    = "question"
	CallDone      = "done"
	CallUncertain = "uncertain"
	CallAutomated = "automated" // D208: it got through, but only a machine answered
	CallNoAnswer  = "no_answer"
	CallFailed    = "failed"
	CallCancelled = "cancelled"
)

// CallLive reports whether a call is waiting for its hour or on the line.
func CallLive(state string) bool {
	switch state {
	case CallWaiting, CallCalling, CallTalking, CallAsking:
		return true
	}
	return false
}

// CallEnded reports whether a call is over (or never dialed).
func CallEnded(state string) bool {
	switch state {
	case CallDone, CallUncertain, CallAutomated, CallNoAnswer, CallFailed, CallCancelled, CallHeld:
		return true
	}
	return false
}

// CallPlan is everything the Go card shows (D189 (4)).
type CallPlan struct {
	To         string     `json:"to"`
	Name       string     `json:"name"`
	Goal       string     `json:"goal"`
	Say        []string   `json:"say"`
	Keep       string     `json:"keep,omitempty"`
	MustNot    []string   `json:"mustNot"`
	Voice      string     `json:"voice"` // ducter | owner
	From       string     `json:"from"`  // provider | self (D215) | own (D218)
	Provider   string     `json:"provider"`
	Minutes    float64    `json:"minutes"`
	CostUSD    float64    `json:"costUsd"`
	PerMinUSD  float64    `json:"perMinUsd"`
	CalleeZone string     `json:"calleeZone"`
	At         string     `json:"at,omitempty"`
	Wait       *CallWait  `json:"wait,omitempty"`       // D208: why it isn't now, when At is set
	CanNow     bool       `json:"canNow,omitempty"`     // D208: 现在就打 / Call now is offered
	Own        bool       `json:"own,omitempty"`        // D208: the owner's own number
	FromNumber string     `json:"fromNumber,omitempty"` // D218: the owner's number, when the call goes from their own phone
	FromPhone  string     `json:"fromPhone,omitempty"`  // D218: the phone it rings from ("Pixel 7")
	Summary    string     `json:"summary,omitempty"`
	Note       string     `json:"note,omitempty"`
	Sheet      *CallSheet `json:"sheet,omitempty"` // D215: a call sheet the owner calls themselves (From = self)
}

// CallSheet is what the owner needs to make a call themselves when no line
// Ducter has calls the number's country (D215): the first thing to say, the
// questions, what not to share, what to note down.
type CallSheet struct {
	Why  string   `json:"why"` // uncovered
	Open string   `json:"open"`
	Ask  []string `json:"ask"`
	Dont []string `json:"dont"`
	Note []string `json:"note"`
}

// CallWait says why a call waits (D208): callee (outside 9:00–20:00 where
// they are), late (outside 8:00–21:00 there: not even Call now), quiet (the
// owner's quiet hours). Their is their clock now, Then when it dials, both
// "HH:MM" in Zone.
type CallWait struct {
	Why   string `json:"why"`
	Zone  string `json:"zone"`
	Their string `json:"their"`
	Then  string `json:"then"`
}

// CallQuestion is a question from the line, waiting on the owner.
type CallQuestion struct {
	Text       string   `json:"text"`
	Choices    []string `json:"choices"`
	YesNo      bool     `json:"yesNo,omitempty"`
	AskedAt    string   `json:"askedAt"`
	DecisionID string   `json:"decisionId"`
}

// CallLine is one line of a transcript: them or the agent.
type CallLine struct {
	Who  string `json:"who"` // them | agent
	Text string `json:"text"`
}

// CallBody is one snapshot of a call (Bodies["phone_call"]); a CallView
// in On hand adds UpdatedAt.
type CallBody struct {
	CallID        string        `json:"callId"`
	ConnectionID  string        `json:"connectionId"`
	State         string        `json:"state"`
	Plan          CallPlan      `json:"plan"`
	TaskID        string        `json:"taskId,omitempty"`
	DecisionID    string        `json:"decisionId,omitempty"`
	Question      *CallQuestion `json:"question,omitempty"`
	ApprovedWords string        `json:"approvedWords,omitempty"`
	PlacedAt      string        `json:"placedAt,omitempty"`
	TalkingSince  string        `json:"talkingSince,omitempty"`
	EndedAt       string        `json:"endedAt,omitempty"`
	Outcome       string        `json:"outcome,omitempty"`
	Summary       string        `json:"summary,omitempty"`
	Agreed        []string      `json:"agreed,omitempty"`
	Transcript    []CallLine    `json:"transcript,omitempty"`
	DurationSec   *float64      `json:"durationSec,omitempty"`
	CostUSD       *float64      `json:"costUsd,omitempty"`
	Error         string        `json:"error,omitempty"`
	Reason        string        `json:"reason,omitempty"` // payment | balance | cap | provider | call_failed | lost | unreachable | signed_out | too_long
	Hint          string        `json:"hint,omitempty"`   // D208: screening (Google Voice's call screening answered)
	CallNow       bool          `json:"callNow,omitempty"`
	PayURL        string        `json:"payUrl,omitempty"`
	By            string        `json:"by,omitempty"` // owner | ducter
	UpdatedAt     string        `json:"updatedAt,omitempty"`
}

// CallAsk is a decision's call (decision.call): its Go card, or a
// question from the line.
type CallAsk struct {
	CallID  string    `json:"callId"`
	Kind    string    `json:"kind"` // go | question | sheet (D215)
	Plan    *CallPlan `json:"plan,omitempty"`
	Choices []string  `json:"choices,omitempty"`
	YesNo   bool      `json:"yesNo,omitempty"`
}

// PhoneView is the calling side of a connection (the phone card).
type PhoneView struct {
	Provider      string  `json:"provider"`
	CapUSD        float64 `json:"capUsd"`
	SpentTodayUSD float64 `json:"spentTodayUsd"`
	Calls         int     `json:"calls"`
	Voice         *struct {
		Enrolled bool `json:"enrolled"`
		On       bool `json:"on"`
	} `json:"voice,omitempty"`
	DoNotCall int `json:"doNotCall"`
	Rails     *struct {
		Cap      bool `json:"cap"`
		Sampling bool `json:"sampling"`
		Shared   bool `json:"shared"`
	} `json:"rails,omitempty"`
}

// SignInView is the device sign-in in progress (RFC 8628).
type SignInView struct {
	URL               string   `json:"url"`
	Name              string   `json:"name"`
	State             string   `json:"state"` // waiting | done | denied | expired | failed
	UserCode          string   `json:"userCode,omitempty"`
	VerifyURL         string   `json:"verifyUrl,omitempty"`
	VerifyURLComplete string   `json:"verifyUrlComplete,omitempty"`
	ExpiresAt         string   `json:"expiresAt,omitempty"`
	ID                string   `json:"id,omitempty"`
	Reconnect         bool     `json:"reconnect,omitempty"`
	QR                []string `json:"qr,omitempty"`
}

// TuwaMCP is the calling connection's address (Settings › Accounts' offer).
const TuwaMCP = "https://api.tuwa.ai/mcp"

// ConnectionSignInCancel stops waiting for a device sign-in.
type ConnectionSignInCancel struct {
	T string `json:"t"` // "connection_signin_cancel"
}

// ConnectionReauth signs in again to a connection that was signed out.
type ConnectionReauth struct {
	T  string `json:"t"` // "connection_reauth"
	ID string `json:"id"`
}

// PhoneVoice is the owner's own voice on the provider: record | on | off | delete | refresh.
type PhoneVoice struct {
	T      string `json:"t"` // "phone_voice"
	Action string `json:"action"`
}

// CallCancel hangs up a live call, or withdraws one waiting for its hour.
type CallCancel struct {
	T      string `json:"t"` // "call_cancel"
	CallID string `json:"callId"`
}

// CallNow is 现在就打 / Call now on a Go card that waits for the callee's
// courtesy hours (D208): the Go, now.
type CallNow struct {
	T      string `json:"t"` // "call_now"
	CallID string `json:"callId"`
}

// PhoneCap sets Ducter's daily cap for calls (and the provider's own).
type PhoneCap struct {
	T   string  `json:"t"` // "phone_cap"
	USD float64 `json:"usd"`
}

// OwnPhone is the provider an own-number call carries (D218).
const OwnPhone = "own"

// OwnPhoneView is the own-number card (D218, 用你自己的号码打 / Call from
// your own number): the phone, its SIM, the cable, the live voice, the test
// call, each a fact the home read. The voice key is only Key: true.
type OwnPhoneView struct {
	Where string `json:"where"`
	ADB   bool   `json:"adb"`
	Phone *struct {
		Serial  string `json:"serial"`
		Model   string `json:"model"`
		State   string `json:"state"` // ready | unauthorized | offline
		Android string `json:"android,omitempty"`
	} `json:"phone,omitempty"`
	SIM *struct {
		State   string `json:"state"` // ready | absent | locked | unknown
		Carrier string `json:"carrier,omitempty"`
	} `json:"sim,omitempty"`
	Number  string `json:"number,omitempty"`
	Headset string `json:"headset"` // yes | no | unknown
	Audio   struct {
		Inputs  []string `json:"inputs"`
		Outputs []string `json:"outputs"`
		Input   string   `json:"input,omitempty"`
		Output  string   `json:"output,omitempty"`
		Tool    bool     `json:"tool"`
	} `json:"audio"`
	Voice struct {
		Engine    string  `json:"engine"` // openai | qwen
		Key       bool    `json:"key"`
		Model     string  `json:"model"`
		PerMinUSD float64 `json:"perMinUsd"`
	} `json:"voice"`
	Test struct {
		State     string `json:"state"` // never | calling | playing | asking | passed | failed
		To        string `json:"to,omitempty"`
		At        string `json:"at,omitempty"`
		HeardLine *bool  `json:"heardLine,omitempty"`
		Detail    string `json:"detail,omitempty"`
	} `json:"test"`
	Ready  bool `json:"ready"`
	Prefer bool `json:"prefer"`
	Live   *struct {
		CallID string `json:"callId"`
		Name   string `json:"name"`
	} `json:"live,omitempty"`
	Busy   bool `json:"busy,omitempty"`
	Today  int  `json:"today"`
	PerDay int  `json:"perDay"`
}

// OwnPhoneAct is one step on the own-number card (client frame own_phone).
type OwnPhoneAct struct {
	T      string `json:"t"`      // "own_phone"
	Action string `json:"action"` // scan | audio | number | key | key_remove | test | heard | prefer | forget
	Input  string `json:"input,omitempty"`
	Output string `json:"output,omitempty"`
	Number string `json:"number,omitempty"`
	Engine string `json:"engine,omitempty"`
	Key    string `json:"key,omitempty"`
	To     string `json:"to,omitempty"`
	Heard  *bool  `json:"heard,omitempty"`
	On     *bool  `json:"on,omitempty"`
}
