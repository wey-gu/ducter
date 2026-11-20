package voice

// D442: 放手说 / Talk hands-free. The port of packages/protocol/src/talk.ts:
// when a turn has ended, what is the voice's own echo and what is the person
// cutting in, what "好" / "先等等" answer on a card, which cards a voice may
// answer (never the floor), what of a reply is said, and the one reducer
// (TalkStep) the Mac drives with its own recognizer, voice and clock. Both
// pass packages/protocol/fixtures/talk.json.

import (
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"
)

const (
	TurnQuietMS = 1200    // a quiet gap this long ends the person's turn
	TurnTrailMS = 2400    // …after a filler or a joining word
	TalkIdleMS  = 60_000  // a minute with nothing heard ends the talk
	TalkThinkMS = 120_000 // two minutes with no reply end it too
	SpokenUnits = 60.0    // about fifteen seconds of speech (Weight)
)

func isHan(r rune) bool {
	return unicode.In(r, unicode.Han, unicode.Hiragana, unicode.Katakana, unicode.Hangul)
}

// Plain is heard words as they are compared: lower case, no punctuation, no
// spaces next to Han characters.
func Plain(s string) string {
	s = strings.ToLower(s)
	s = strings.NewReplacer("’", "", "'", "").Replace(s)
	var b strings.Builder
	for _, r := range s {
		if unicode.IsLetter(r) || unicode.IsNumber(r) {
			b.WriteRune(r)
		} else {
			b.WriteRune(' ')
		}
	}
	words := strings.Fields(b.String())
	var out strings.Builder
	for i, w := range words {
		if i > 0 {
			prev, _ := utf8.DecodeLastRuneInString(words[i-1])
			first, _ := utf8.DecodeRuneInString(w)
			if !isHan(prev) && !isHan(first) {
				out.WriteByte(' ')
			}
		}
		out.WriteString(w)
	}
	return out.String()
}

// Units are each Han (Kana, Hangul) character and each other word.
func Units(s string) []string {
	var out []string
	for _, w := range strings.Split(Plain(s), " ") {
		latin := ""
		for _, r := range w {
			if isHan(r) {
				if latin != "" {
					out = append(out, latin)
					latin = ""
				}
				out = append(out, string(r))
			} else {
				latin += string(r)
			}
		}
		if latin != "" {
			out = append(out, latin)
		}
	}
	return out
}

// Weight is how long words take to say: a Han character 1, another word 1.5.
func Weight(s string) float64 {
	n := 0.0
	for _, u := range Units(s) {
		r, _ := utf8.DecodeRuneInString(u)
		if isHan(r) {
			n++
		} else {
			n += 1.5
		}
	}
	return n
}

var (
	trailZh = regexp.MustCompile(`(嗯|呃|啊|那个|这个|然后|就是|还有|因为|所以|但是|而且|或者|和|跟|的|把|给|要|想)$`)
	trailEn = regexp.MustCompile(`\b(um|uh|er|and|but|so|or|because|the|a|an|to|with|of|for|then|like)$`)
)

// Trails says the words end where a person would carry on.
func Trails(heard string) bool {
	p := Plain(heard)
	return trailZh.MatchString(p) || trailEn.MatchString(p)
}

// QuietFor is how long a quiet gap must last before this turn is over (ms).
func QuietFor(heard string) int64 {
	if Trails(heard) {
		return TurnTrailMS
	}
	return TurnQuietMS
}

func joinUnits(u []string) string {
	for _, w := range u {
		r, _ := utf8.DecodeRuneInString(w)
		if isHan(r) {
			return strings.Join(u, "")
		}
	}
	return strings.Join(u, " ")
}

// AfterEcho is what was heard once the voice's own words are taken off its
// front: the longest front that appears, in order, in what is being said.
func AfterEcho(heard, saying string) string {
	h := Units(heard)
	if saying == "" {
		return joinUnits(h)
	}
	s := "\x01" + strings.Join(Units(saying), "\x01") + "\x01"
	cut := 0
	for n := len(h); n > 0; n-- {
		if strings.Contains(s, "\x01"+strings.Join(h[:n], "\x01")+"\x01") {
			cut = n
			break
		}
	}
	return joinUnits(h[cut:])
}

func set(words ...string) map[string]bool {
	m := make(map[string]bool, len(words))
	for _, w := range words {
		m[w] = true
	}
	return m
}

var stopWords = set("停", "停一下", "停下", "别说了", "不用说了", "好了好了", "stop", "quiet", "be quiet", "enough", "ok stop", "okay stop")

// HeardStop is "停" / "stop" on its own: the voice stops, nothing is sent.
func HeardStop(heard string) bool { return stopWords[Plain(heard)] }

// IsBargeIn says the person is cutting in while the partner speaks.
func IsBargeIn(heard, saying string, asking bool) bool {
	rest := AfterEcho(heard, saying)
	if rest == "" {
		return false
	}
	if HeardStop(rest) || (asking && HeardAnswer(rest) != "") {
		return true
	}
	return len(Units(rest)) >= 2
}

var (
	goWords = set("好", "好的", "好啊", "好呀", "好吧", "行", "行啊", "行吧", "可以", "可以的", "可以啊", "对", "对的", "嗯好", "没问题", "去吧", "去做吧", "做吧", "发吧", "弄吧", "确定", "同意", "就这么办", "照做",
		"ok", "okay", "yes", "yeah", "yep", "yup", "sure", "go", "go ahead", "do it", "sounds good", "alright", "all right", "fine", "ok go", "yes please", "please do")
	holdWords = set("先等等", "等等", "等一下", "等一等", "等会", "等会儿", "先别", "别", "不要", "不用", "不行", "先不要", "先不用", "先不", "算了", "不", "不了", "再说", "先放着", "先不动",
		"wait", "hold on", "hold", "not now", "no", "nope", "dont", "not yet", "later", "hang on", "no thanks", "wait a moment", "wait a second")
	endWords = set("就这样", "就这样吧", "先这样", "先这样吧", "好了就这样", "就这些", "不说了", "先不说了", "结束", "挂了", "拜拜", "再见", "没事了", "别听了", "不聊了",
		"thats all", "thats it", "bye", "goodbye", "bye bye", "stop listening", "end", "were done", "im done", "thats all for now", "talk later", "end talk")
	leadRe = regexp.MustCompile(`^(嗯|呃|那|那就|um|uh|well|oh)\s*`)
	tailRe = regexp.MustCompile(`\s*(吧|啊|呀|哈|呢|please|then|thanks)$`)
)

func trimTalk(p string) string {
	return strings.TrimSpace(tailRe.ReplaceAllString(leadRe.ReplaceAllString(p, ""), ""))
}

// HeardAnswer is what a few words answer to a card: "go", "hold" or "".
func HeardAnswer(heard string) string {
	p := Plain(heard)
	for i := 0; i < 3; i++ {
		if goWords[p] {
			return "go"
		}
		if holdWords[p] {
			return "hold"
		}
		q := trimTalk(p)
		if q == p {
			break
		}
		p = q
	}
	return ""
}

// HeardEnd is the person saying they're done talking, as the whole turn.
func HeardEnd(heard string) bool {
	p := Plain(heard)
	return endWords[p] || endWords[trimTalk(p)]
}

// SayAfter joins two things said: no space after a Han sentence.
func SayAfter(a, b string) string {
	if a == "" {
		return b
	}
	if b == "" {
		return a
	}
	last, _ := utf8.DecodeLastRuneInString(a)
	if isHan(last) || strings.ContainsRune("。！？，：；）」』", last) {
		return a + b
	}
	return a + " " + b
}

// TalkShown is the big line over a talk's card: what is being said, unless
// the card already shows it (D446): its question (with the hint or floor line
// said after it), or on a floor card the floor line said again after a "好".
// Empty means the line shows only who speaks. See talkShown in
// packages/protocol/src/talk.ts; both pass the fixture's "shown".
func TalkShown(saying, question string, floorCard bool, floor string) string {
	if question == "" && !floorCard {
		return saying
	}
	if question != "" && strings.HasPrefix(saying, question) {
		return ""
	}
	if floorCard && floor != "" && Plain(saying) == Plain(floor) {
		return ""
	}
	return saying
}

// SpokenReply is what of a partner's message is said in a talk: whole
// sentences up to about fifteen seconds, the first always whole; cut short,
// more follows.
func SpokenReply(text, more string) string {
	s := Speakable(text)
	if s == "" {
		return ""
	}
	parts := splitSentences(s)
	var out strings.Builder
	n := 0.0
	for i, p := range parts {
		u := Weight(p)
		if i > 0 && n+u > SpokenUnits {
			return SayAfter(strings.TrimSpace(out.String()), more)
		}
		out.WriteString(p)
		n += u
	}
	return strings.TrimSpace(out.String())
}

// splitSentences cuts after 。！？!? and after a "." that ends a sentence
// (followed by a space or the end), never inside "12.5".
func splitSentences(s string) []string {
	var parts []string
	rs := []rune(s)
	start := 0
	for i := 0; i < len(rs); i++ {
		r := rs[i]
		end := false
		if strings.ContainsRune("。！？!?", r) {
			for i+1 < len(rs) && strings.ContainsRune("。！？!?", rs[i+1]) {
				i++
			}
			end = true
		} else if r == '.' && (i+1 == len(rs) || unicode.IsSpace(rs[i+1])) {
			end = true
		}
		if end {
			for i+1 < len(rs) && unicode.IsSpace(rs[i+1]) {
				i++
			}
			parts = append(parts, string(rs[start:i+1]))
			start = i + 1
		}
	}
	if start < len(rs) {
		parts = append(parts, string(rs[start:]))
	}
	return parts
}

// TalkCard is what TalkFloor reads of a decision: its words and which of the
// kinds it is (the protocol's fields, true when present).
type TalkCard struct {
	Question, GoLabel string
	Pay, Checkout     bool
	Key, SignIn, Fill bool
	Asker, Sender     bool
	Trust             bool
	Draft, Handset    bool
	Phone, Computer   bool
	Call              bool
}

// The words D340 reads a deleting Go from (packages/protocol/src/destructive.ts).
var destructiveRes = []*regexp.Regexp{
	regexp.MustCompile(`(?i)\b(delete|deleting|deleted|erase|wipe|discard|destroy|purge|remove|removing|uninstall|rm\s+-rf?)\b`),
	regexp.MustCompile(`(?i)(can'?t|cannot) be (undone|recovered|restored)|\bfor good\b|\bpermanently\b`),
	regexp.MustCompile(`删|清空|清除|清掉|抹掉|丢掉|丢弃|扔掉|卸载|销毁|找不回|无法恢复|不能恢复|恢复不了|撤不回`),
}

// Destructive says a card's words say its Go removes something.
func Destructive(texts ...string) bool {
	all := strings.Join(texts, "\n")
	for _, re := range destructiveRes {
		if re.MatchString(all) {
			return true
		}
	}
	return false
}

// TalkFloor is why a card can't be answered by voice ("" when it can):
// "pay", "secret", "untrusted", "delete" or "look".
func TalkFloor(d TalkCard) string {
	switch {
	case d.Pay || d.Checkout:
		return "pay"
	case d.Key || d.SignIn || d.Fill:
		return "secret"
	case d.Asker || d.Sender || d.Trust:
		return "untrusted"
	case Destructive(d.Question, d.GoLabel):
		return "delete"
	case d.Draft || d.Handset || d.Phone || d.Computer || d.Call:
		return "look"
	}
	return ""
}

// ---------- the reducer ----------

// TalkWords are the lines a talk says of its own (talk.say.*).
type TalkWords struct {
	Hint, Floor, More, Went, Held, Bye string
}

type TalkSay struct {
	Text string `json:"text"`
	Ask  string `json:"ask,omitempty"`
}

// TalkState is one talk: see packages/protocol/src/talk.ts.
type TalkState struct {
	Phase      string // "listen", "think", "speak", "ended"
	Heard      string
	ChangedAt  int64
	QuietSince int64
	Waiting    bool
	Saying     *TalkSay
	Queue      []TalkSay
	Asking     string
	Floored    string
	Hinted     bool
	Echo       string
	Closing    bool
	EndedBy    string // "said", "quiet", "tap"
}

// TalkEvent is what happened: K is "heard", "tick", "spoken", "reply",
// "ask", "answered" or "end".
type TalkEvent struct {
	K        string `json:"k"`
	Text     string `json:"text,omitempty"`
	At       int64  `json:"at"`
	ID       string `json:"id,omitempty"`
	Question string `json:"question,omitempty"`
	Floor    string `json:"floor,omitempty"`
}

// TalkEffect is what the client does: Do is "send", "decide", "speak",
// "hush", "relisten" or "end".
type TalkEffect struct {
	Do     string `json:"do"`
	Text   string `json:"text,omitempty"`
	ID     string `json:"id,omitempty"`
	Option string `json:"option,omitempty"`
	By     string `json:"by,omitempty"`
}

func TalkStart(at int64) TalkState {
	return TalkState{Phase: "listen", ChangedAt: at, QuietSince: at}
}

// TalkStep is one step of a talk: the state after e and what to do, in order.
func TalkStep(st TalkState, e TalkEvent, w TalkWords) (TalkState, []TalkEffect) {
	s := st
	s.Queue = append([]TalkSay(nil), st.Queue...)
	var fx []TalkEffect
	if s.Phase == "ended" {
		return s, fx
	}
	rest := func() string {
		if s.Waiting {
			return "think"
		}
		return "listen"
	}
	next := func(at int64) {
		if len(s.Queue) > 0 {
			n := s.Queue[0]
			s.Queue = s.Queue[1:]
			s.Saying = &n
			s.Phase = "speak"
			if n.Ask != "" {
				s.Asking = n.Ask
			}
			fx = append(fx, TalkEffect{Do: "speak", Text: n.Text})
			return
		}
		s.Saying = nil
		s.Phase = rest()
		s.QuietSince = at
	}
	say := func(text string, at int64, ask string) {
		if text == "" {
			return
		}
		s.Queue = append(s.Queue, TalkSay{Text: text, Ask: ask})
		if s.Saying == nil && s.Heard == "" {
			next(at)
		}
	}
	end := func(by string) {
		if s.Saying != nil {
			fx = append(fx, TalkEffect{Do: "hush"})
		}
		s.Phase, s.EndedBy, s.Saying, s.Queue = "ended", by, nil, nil
		fx = append(fx, TalkEffect{Do: "end", By: by})
	}

	switch e.K {
	case "heard":
		if s.Saying != nil {
			if !IsBargeIn(e.Text, s.Saying.Text, s.Saying.Ask != "") {
				return st, fx
			}
			cut := AfterEcho(e.Text, s.Saying.Text)
			echo := s.Saying.Text
			fx = append(fx, TalkEffect{Do: "hush"})
			var asks []TalkSay
			for _, q := range s.Queue {
				if q.Ask != "" {
					asks = append(asks, q)
				}
			}
			s.Queue = asks
			s.Saying, s.Closing = nil, false
			s.Phase = rest()
			if HeardStop(cut) {
				s.Heard, s.QuietSince = "", e.At
				fx = append(fx, TalkEffect{Do: "relisten"})
			} else {
				s.Heard, s.Echo, s.ChangedAt = cut, echo, e.At
			}
			return s, fx
		}
		t := strings.TrimSpace(e.Text)
		if s.Echo != "" {
			t = AfterEcho(e.Text, s.Echo)
		}
		if t != s.Heard {
			s.Heard, s.ChangedAt, s.QuietSince = t, e.At, e.At
		}
		return s, fx
	case "tick":
		if s.Saying != nil {
			return st, fx
		}
		if s.Heard != "" {
			if e.At-s.ChangedAt < QuietFor(s.Heard) {
				return st, fx
			}
			text := s.Heard
			s.Heard, s.Echo, s.QuietSince = "", "", e.At
			fx = append(fx, TalkEffect{Do: "relisten"})
			if HeardEnd(text) {
				end("said")
				return s, fx
			}
			if HeardStop(text) {
				next(e.At)
				return s, fx
			}
			if s.Floored != "" && HeardAnswer(text) != "" {
				s.Floored = ""
				say(w.Floor, e.At, "")
				return s, fx
			}
			s.Floored = ""
			if s.Asking != "" {
				id := s.Asking
				a := HeardAnswer(text)
				s.Asking = ""
				if a != "" {
					fx = append(fx, TalkEffect{Do: "decide", ID: id, Option: a})
					line := w.Held
					if a == "go" {
						line = w.Went
					}
					say(line, e.At, "")
					if s.Saying == nil {
						next(e.At)
					}
					return s, fx
				}
			}
			fx = append(fx, TalkEffect{Do: "send", Text: text})
			s.Waiting = true
			next(e.At)
			return s, fx
		}
		if len(s.Queue) > 0 {
			next(e.At)
			return s, fx
		}
		limit := int64(TalkIdleMS)
		if s.Phase == "think" {
			limit = TalkThinkMS
		}
		if !s.Closing && e.At-s.QuietSince >= limit {
			s.Closing = true
			say(w.Bye, e.At, "")
			return s, fx
		}
		return st, fx
	case "spoken":
		if s.Saying == nil {
			return st, fx
		}
		if s.Closing && len(s.Queue) == 0 {
			s.Saying = nil
			end("quiet")
			return s, fx
		}
		fx = append(fx, TalkEffect{Do: "relisten"})
		s.Saying = nil
		next(e.At)
		return s, fx
	case "reply":
		s.Waiting, s.Closing = false, false
		if s.Phase == "think" {
			s.Phase = "listen"
		}
		say(SpokenReply(e.Text, w.More), e.At, "")
		return s, fx
	case "ask":
		s.Closing = false
		if e.Floor != "" {
			s.Floored = e.ID
			say(SayAfter(e.Question, w.Floor), e.At, "")
		} else {
			q := e.Question
			if !s.Hinted {
				q = SayAfter(q, w.Hint)
			}
			say(q, e.At, e.ID)
			s.Hinted = true
		}
		return s, fx
	case "answered":
		if s.Asking == e.ID {
			s.Asking = ""
		}
		if s.Floored == e.ID {
			s.Floored = ""
		}
		var keep []TalkSay
		for _, q := range s.Queue {
			if q.Ask != e.ID {
				keep = append(keep, q)
			}
		}
		s.Queue = keep
		if s.Saying != nil && s.Saying.Ask == e.ID {
			fx = append(fx, TalkEffect{Do: "hush"})
			s.Saying = nil
			next(e.At)
		}
		return s, fx
	case "end":
		end("tap")
		return s, fx
	}
	return st, fx
}
