package imessage

import (
	"context"
	"encoding/json"
	"errors"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// ---------- fakes ----------

type fakeStore struct {
	mu   sync.Mutex
	rows []Row
	err  error
	next int64
}

func (s *fakeStore) add(r Row) Row {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.next++
	r.RowID = s.next
	if r.GUID == "" {
		r.GUID = "g" + string(rune('a'+s.next%26)) + time.Duration(s.next).String()
	}
	if r.Chat == "" {
		r.Chat = r.Handle
	}
	s.rows = append(s.rows, r)
	return r
}

func (s *fakeStore) MaxRowID(context.Context) (int64, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.next, s.err
}

func (s *fakeStore) Since(_ context.Context, after int64, limit int) ([]Row, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.err != nil {
		return nil, s.err
	}
	var out []Row
	for _, r := range s.rows {
		if r.RowID > after && len(out) < limit {
			out = append(out, r)
		}
	}
	return out, nil
}

func (s *fakeStore) Stamp() string { return "" }

type sentMsg struct{ to, text string }

type fakeSender struct {
	mu    sync.Mutex
	sent  []sentMsg
	err   error
	probe error
	store *fakeStore // echoes each send into chat.db, as Messages does
}

func (f *fakeSender) Send(_ context.Context, to, text string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.err != nil {
		return f.err
	}
	f.sent = append(f.sent, sentMsg{to, text})
	if f.store != nil {
		f.store.add(Row{Text: text, FromMe: true, Handle: to})
	}
	return nil
}

func (f *fakeSender) Probe(context.Context) error { return f.probe }

func (f *fakeSender) texts() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	var out []string
	for _, s := range f.sent {
		out = append(out, s.text)
	}
	return out
}

type relayed struct {
	text, clientID string
	media          []string
}

type rig struct {
	b       *Bridge
	store   *fakeStore
	sender  *fakeSender
	now     time.Time
	relays  []relayed
	decides [][2]string
	reports []string
	fore    bool
	offline bool
	quiet   *protocol.QuietHours
	path    string
	seq     int64
}

const person = "+8613800000000"

func newRig(t *testing.T) *rig {
	t.Helper()
	r := &rig{store: &fakeStore{}, now: time.Date(2026, 11, 16, 4, 0, 0, 0, time.UTC)} // 12:00 in Shanghai
	r.sender = &fakeSender{store: r.store}
	r.path = filepath.Join(t.TempDir(), "imessage.json")
	r.open()
	return r
}

func (r *rig) open() {
	r.b = New(Options{
		Store:     r.store,
		Sender:    r.sender,
		StatePath: r.path,
		Now:       func() time.Time { return r.now },
		Relay: func(text, id string, media []string) error {
			if r.offline {
				return errors.New("offline")
			}
			r.relays = append(r.relays, relayed{text, id, media})
			return nil
		},
		Decide:     func(id, o string) error { r.decides = append(r.decides, [2]string{id, o}); return nil },
		Report:     func(s protocol.ChannelStatus) { r.reports = append(r.reports, s.State) },
		Upload:     func(path, mime string) (string, error) { return "m-" + filepath.Base(path), nil },
		Name:       func() string { return "小鸭" },
		Lang:       func() string { return "zh" },
		Quiet:      func() *protocol.QuietHours { return r.quiet },
		Foreground: func() bool { return r.fore },
	})
}

// step reads chat.db once and sends what waits.
func (r *rig) step() {
	r.b.Step(context.Background())
	r.b.Flush(context.Background())
	r.b.Step(context.Background()) // our own sends come back from chat.db
	r.b.Flush(context.Background())
}

func (r *rig) text(from, text string) Row {
	return r.store.add(Row{Text: text, Handle: from, Date: r.now})
}

// link pairs the person's phone in a mode.
func (r *rig) link(t *testing.T, mode Mode) {
	t.Helper()
	if err := r.b.Enable(context.Background(), mode); err != nil {
		t.Fatal(err)
	}
	r.text(person, r.b.Status().Code)
	r.step()
	if st := r.b.Status(); st.State != StateOn || st.Handle != person {
		t.Fatalf("not linked: %+v", st)
	}
	r.sender.sent = nil
}

func (r *rig) event(kind string, body any, ago time.Duration) int64 {
	r.seq++
	raw, _ := json.Marshal(body)
	r.b.Observe(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{{
		Seq: r.seq, TS: r.now.Add(-ago).Format(time.RFC3339Nano), Stream: "channel", Kind: kind, Body: raw,
	}}})
	r.b.Flush(context.Background())
	return r.seq
}

// ---------- pairing and strangers ----------

func TestPairingLinksOnlyTheSenderOfTheCode(t *testing.T) {
	r := newRig(t)
	r.text(person, "以前的消息") // in Messages before linking: never read
	if err := r.b.Enable(context.Background(), ModePartner); err != nil {
		t.Fatal(err)
	}
	st := r.b.Status()
	if st.State != StatePairing || len(st.Code) != 6 || !st.CodeUntil.After(r.now) {
		t.Fatalf("pairing: %+v", st)
	}
	r.text("stranger@icloud.com", "hello?")
	r.text("stranger@icloud.com", "000000")
	r.store.add(Row{Text: "code " + st.Code, FromMe: true, Handle: "friend@icloud.com", Date: r.now}) // sent to a friend by mistake
	r.step()
	if r.b.Status().State != StatePairing || len(r.sender.sent) != 0 || len(r.relays) != 0 {
		t.Fatalf("a stranger or a sent code linked or got an answer: %+v %v %v", r.b.Status(), r.sender.sent, r.relays)
	}
	r.text(person, "我的码是 "+st.Code)
	r.step()
	st = r.b.Status()
	if st.State != StateOn || st.Handle != person || st.Code != "" {
		t.Fatalf("not linked: %+v", st)
	}
	if got := r.sender.texts(); len(got) != 1 || got[0] != say("zh", "linked") || r.sender.sent[0].to != person {
		t.Errorf("confirmation: %v", r.sender.sent)
	}
	if len(r.relays) != 0 {
		t.Errorf("the code went to the conversation: %v", r.relays)
	}
	if r.reports[len(r.reports)-1] != "on" {
		t.Errorf("home told %v", r.reports)
	}
}

func TestACodeExpires(t *testing.T) {
	r := newRig(t)
	_ = r.b.Enable(context.Background(), ModePartner)
	code := r.b.Status().Code
	r.now = r.now.Add(11 * time.Minute)
	r.text(person, code)
	r.step()
	if st := r.b.Status(); st.State != StateOff || st.Handle != "" {
		t.Errorf("an old code linked: %+v", st)
	}
}

func TestStrangersGetSilence(t *testing.T) {
	r := newRig(t)
	r.link(t, ModePartner)
	r.text("stranger@icloud.com", "你是谁")
	r.text("stranger@icloud.com", "好")
	r.step()
	if len(r.relays) != 0 || len(r.sender.sent) != 0 {
		t.Fatalf("a stranger reached the partner: %v %v", r.relays, r.sender.sent)
	}
	if r.b.Status().Stranger.IsZero() {
		t.Error("Settings doesn't know someone tried")
	}
	r.store.add(Row{Text: "group", Handle: person, Chat: "chat1", Group: true, Date: r.now})
	r.step()
	if len(r.relays) != 0 {
		t.Errorf("a group chat was read: %v", r.relays)
	}
}

// ---------- the person's words in, the replies out ----------

func TestWordsGoHomeAndRepliesComeBack(t *testing.T) {
	r := newRig(t)
	r.link(t, ModePartner)
	row := r.text(person, "看下 CI 为什么挂了")
	r.store.add(Row{Text: "", Handle: person, Date: r.now, Files: []Attachment{{Path: "~/Library/Messages/Attachments/a/IMG.jpg", MIME: "image/jpeg"}, {Path: "x.pdf", MIME: "application/pdf"}}})
	r.step()
	if len(r.relays) != 2 || r.relays[0].text != "看下 CI 为什么挂了" || r.relays[0].clientID != "imessage:"+row.GUID {
		t.Fatalf("relayed %+v", r.relays)
	}
	if m := r.relays[1].media; len(m) != 1 || m[0] != "m-IMG.jpg" {
		t.Errorf("picture: %+v", r.relays[1])
	}
	turn := r.event(protocol.KindUserMsg, protocol.UserMsg{Text: "看下 CI 为什么挂了", ClientID: "imessage:" + row.GUID, Via: "imessage"}, 0)
	r.event(protocol.KindAck, protocol.Ack{JobID: "j1", Text: "我去看看", ReplyTo: turn}, 0)
	r.event(protocol.KindAIMsg, protocol.AIMsg{Text: "**CI 挂了**：`bun test` 有 2 个失败。", ReplyTo: turn}, 0)
	if got := r.sender.texts(); len(got) != 2 || got[0] != "我去看看" || got[1] != "CI 挂了：bun test 有 2 个失败。" {
		t.Fatalf("replies: %q", got)
	}
	// A turn started in the app is not mirrored, even while iMessage was last.
	app := r.event(protocol.KindUserMsg, protocol.UserMsg{Text: "在 app 里问的"}, 0)
	r.event(protocol.KindAIMsg, protocol.AIMsg{Text: "app 里的回答", ReplyTo: app}, 0)
	// The late result of the iMessage turn still goes back there.
	r.event(protocol.KindAIMsg, protocol.AIMsg{Text: "修好了", ReplyTo: turn}, 0)
	if got := r.sender.texts(); len(got) != 3 || got[2] != "修好了" {
		t.Fatalf("routing: %q", got)
	}
	// The same event again (a reconnect's replay) is not sent twice.
	r.b.Observe(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{{Seq: r.seq, TS: r.now.Format(time.RFC3339Nano), Stream: "channel", Kind: protocol.KindAIMsg, Body: json.RawMessage(`{"text":"修好了","replyTo":1}`)}}})
	r.b.Flush(context.Background())
	if len(r.sender.sent) != 3 {
		t.Errorf("sent twice: %q", r.sender.texts())
	}
	if len(r.relays) != 2 {
		t.Errorf("our own sends came back as the person's words: %+v", r.relays)
	}
}

func TestDucterStartedWordsGoWhereThePersonLastSpoke(t *testing.T) {
	r := newRig(t)
	r.link(t, ModePartner)
	r.event(protocol.KindUserMsg, protocol.UserMsg{Text: "hi", Via: "imessage"}, 0)
	r.event(protocol.KindAIMsg, protocol.AIMsg{Text: "我注意到你明天的会改时间了"}, 0)
	r.fore = true
	r.event(protocol.KindAIMsg, protocol.AIMsg{Text: "在 app 前面时不发"}, 0)
	r.fore = false
	r.event(protocol.KindAIMsg, protocol.AIMsg{Text: "很久以前的"}, time.Hour) // history replayed at launch
	r.event(protocol.KindUserMsg, protocol.UserMsg{Text: "在 app 里说的"}, 0)
	r.event(protocol.KindAIMsg, protocol.AIMsg{Text: "app 里最后说话：不发"}, 0)
	if got := r.sender.texts(); len(got) != 1 || got[0] != "我注意到你明天的会改时间了" {
		t.Fatalf("sent %q", got)
	}
}

// ---------- decisions ----------

func TestAReplyOfOKAnswersTheNewestCard(t *testing.T) {
	r := newRig(t)
	r.link(t, ModePartner)
	r.event(protocol.KindUserMsg, protocol.UserMsg{Text: "rebase 一下", Via: "imessage"}, 0)
	r.event(protocol.KindDecision, protocol.Decision{DecisionID: "d1", Question: "要把 fix-ci rebase 到 main 吗？", GoLabel: "rebase", DefaultOption: "go", Reversible: true}, 0)
	got := r.sender.texts()
	if len(got) != 1 || !strings.Contains(got[0], "要把 fix-ci rebase 到 main 吗？") || !strings.Contains(got[0], "回「好」就rebase") {
		t.Fatalf("card: %q", got)
	}
	r.text(person, "好！")
	r.step()
	if len(r.decides) != 1 || r.decides[0] != [2]string{"d1", "go"} {
		t.Fatalf("decided %v", r.decides)
	}
	if len(r.relays) != 0 {
		t.Errorf("好 went to the conversation too: %v", r.relays)
	}
	if got := r.sender.texts(); got[len(got)-1] != "好，这就rebase。" {
		t.Errorf("no word back: %q", got)
	}
	// The card is answered: another 好 is just words.
	r.text(person, "好")
	r.step()
	if len(r.decides) != 1 || len(r.relays) != 1 || r.relays[0].text != "好" {
		t.Errorf("a second 好: %v %v", r.decides, r.relays)
	}
}

func TestWaitHoldsAndATapbackAnswers(t *testing.T) {
	r := newRig(t)
	r.link(t, ModePartner)
	r.event(protocol.KindUserMsg, protocol.UserMsg{Text: "x", Via: "imessage"}, 0)
	r.event(protocol.KindDecision, protocol.Decision{DecisionID: "d1", Question: "现在开始吗？", GoLabel: "开始", Reversible: true}, 0)
	r.text(person, "先等等")
	r.step()
	if len(r.decides) != 1 || r.decides[0] != [2]string{"d1", "hold"} {
		t.Fatalf("hold: %v", r.decides)
	}
	r.event(protocol.KindDecision, protocol.Decision{DecisionID: "d2", Question: "那换到另一台电脑做？", GoLabel: "换过去", Reversible: true, Where: &protocol.WhereAsk{}}, 0)
	r.b.Step(context.Background()) // the card's own message shows up in chat.db: its guid is learned
	var cardGUID string
	for _, row := range r.store.rows {
		if row.FromMe && strings.Contains(row.Text, "那换到另一台电脑做？") {
			cardGUID = row.GUID
		}
	}
	r.store.add(Row{Handle: person, AssocType: TapLike, AssocGUID: "p:0/some-old-message", Date: r.now}) // a stale tap: swallowed
	r.store.add(Row{Handle: person, AssocType: TapLike, AssocGUID: "p:0/" + cardGUID, Date: r.now})
	r.step()
	if len(r.decides) != 2 || r.decides[1] != [2]string{"d2", "go"} {
		t.Fatalf("tapback: %v", r.decides)
	}
	if len(r.relays) != 0 {
		t.Errorf("a tapback became words: %v", r.relays)
	}
}

func TestCardsThatNeedTheAppAndOnesNeverSaid(t *testing.T) {
	r := newRig(t)
	r.link(t, ModePartner)
	r.event(protocol.KindUserMsg, protocol.UserMsg{Text: "x", Via: "imessage"}, 0)
	r.event(protocol.KindDecision, protocol.Decision{DecisionID: "pay", Question: "用尾号 4242 的卡付 ¥328 给京东？", GoLabel: "付款", Reversible: false, Pay: &protocol.PayAsk{}}, 0)
	r.event(protocol.KindDecision, protocol.Decision{DecisionID: "ph", Question: "在 Ducter 的手机上点「发送」？", GoLabel: "点击", Reversible: true, Phone: &protocol.PhoneAsk{}}, 0)
	got := r.sender.texts()
	if len(got) != 2 {
		t.Fatalf("sent %q", got)
	}
	if got[0] != say("zh", "ask.safe") || strings.Contains(got[0], "4242") {
		t.Errorf("money was said in iMessage: %q", got[0])
	}
	if !strings.Contains(got[1], "在 Ducter 的手机上点「发送」？") || !strings.HasSuffix(got[1], say("zh", "ask.app")) {
		t.Errorf("phone card: %q", got[1])
	}
	r.text(person, "好")
	r.step()
	if len(r.decides) != 0 {
		t.Errorf("好 answered a card it may not: %v", r.decides)
	}
	if Answerable(protocol.Decision{Reversible: false}) || !Answerable(protocol.Decision{Reversible: true}) {
		t.Error("Answerable")
	}
}

func TestQuietHoursHoldCardsForTheMorning(t *testing.T) {
	r := newRig(t)
	r.link(t, ModePartner)
	r.quiet = &protocol.QuietHours{Start: "23:00", End: "08:00", TZ: "Asia/Shanghai"}
	r.event(protocol.KindUserMsg, protocol.UserMsg{Text: "x", Via: "imessage"}, 0)
	r.now = time.Date(2026, 11, 16, 16, 0, 0, 0, time.UTC) // 00:00 in Shanghai
	r.event(protocol.KindDecision, protocol.Decision{DecisionID: "d1", Question: "第一件？", Reversible: true}, 0)
	r.event(protocol.KindDecision, protocol.Decision{DecisionID: "d2", Question: "第二件？", Reversible: true}, 0)
	r.event(protocol.KindAIMsg, protocol.AIMsg{Text: "夜里的发现"}, 0)
	r.step()
	if len(r.sender.sent) != 0 {
		t.Fatalf("broke the quiet hours: %q", r.sender.texts())
	}
	r.now = time.Date(2026, 11, 17, 0, 30, 0, 0, time.UTC) // 08:30
	r.step()
	got := r.sender.texts()
	if len(got) != 1 || !strings.HasPrefix(got[0], "夜里有 2 个等你定") || !strings.Contains(got[0], "第二件？") {
		t.Fatalf("morning: %q", got)
	}
	r.step()
	if len(r.sender.sent) != 1 {
		t.Error("the morning card went twice")
	}
	if !InQuiet(time.Date(2026, 11, 16, 15, 30, 0, 0, time.UTC), r.quiet) || InQuiet(time.Date(2026, 11, 16, 4, 0, 0, 0, time.UTC), r.quiet) {
		t.Error("InQuiet")
	}
}

// ---------- identity ----------

func TestThePersonsOwnAppleIDStopsThePartnerSpeaking(t *testing.T) {
	r := newRig(t)
	r.link(t, ModePartner)
	r.store.add(Row{Text: "这是我从自己手机发出去的", FromMe: true, Handle: person, Date: r.now}) // not ours: the person typed it
	r.step()
	if st := r.b.Status(); st.State != StateOwnID || st.Wire() != "error" {
		t.Fatalf("own Apple ID not seen: %+v", st)
	}
	r.event(protocol.KindUserMsg, protocol.UserMsg{Text: "x", Via: "imessage"}, 0)
	r.event(protocol.KindAIMsg, protocol.AIMsg{Text: "不该发"}, 0)
	if len(r.sender.sent) != 0 {
		t.Fatalf("spoke from the person's Apple ID: %q", r.sender.texts())
	}
	r.b.SetMode(ModeSelf)
	r.event(protocol.KindAIMsg, protocol.AIMsg{Text: "现在可以了"}, 0)
	if got := r.sender.texts(); len(got) != 1 || got[0] != "小鸭：现在可以了" {
		t.Fatalf("self mode: %q", got)
	}
}

func TestMessageYourselfReadsTheSelfThreadOnce(t *testing.T) {
	r := newRig(t)
	r.link(t, ModeSelf)
	r.store.add(Row{Text: "帮我记一下", FromMe: true, Handle: person, Date: r.now})
	r.store.add(Row{Text: "帮我记一下", FromMe: false, Handle: person, Date: r.now}) // the same words, received
	r.store.add(Row{Text: "小鸭：好的", FromMe: false, Handle: person, Date: r.now}) // the partner's own words echoed
	r.step()
	if len(r.relays) != 1 || r.relays[0].text != "帮我记一下" {
		t.Fatalf("self thread: %+v", r.relays)
	}
}

// ---------- reliability ----------

func TestPermissionsAndBackoff(t *testing.T) {
	r := newRig(t)
	r.link(t, ModePartner)
	r.store.err = ErrNoDiskAccess
	r.step()
	st := r.b.Status()
	if st.State != StateNeedsDisk || st.Disk || st.Wire() != "needs_permission" {
		t.Fatalf("no disk: %+v", st)
	}
	r.store.err = nil
	r.text(person, "还在吗")
	r.step() // still backing off
	if len(r.relays) != 0 {
		t.Fatal("no backoff")
	}
	r.now = r.now.Add(5 * time.Second)
	r.step()
	if r.b.Status().State != StateOn || len(r.relays) != 1 {
		t.Fatalf("not back: %+v %v", r.b.Status(), r.relays)
	}
	r.sender.err = ErrNoAutomation
	r.event(protocol.KindUserMsg, protocol.UserMsg{Text: "x", Via: "imessage"}, 0)
	r.event(protocol.KindAIMsg, protocol.AIMsg{Text: "回答"}, 0)
	if st := r.b.Status(); st.State != StateNeedsAuto || st.Automation {
		t.Fatalf("automation: %+v", st)
	}
	r.sender.probe = ErrNotSignedIn
	if err := r.b.Probe(context.Background()); !errors.Is(err, ErrNotSignedIn) || r.b.Status().State != StateNotSigned {
		t.Errorf("probe: %v %+v", err, r.b.Status())
	}
}

func TestARestartKeepsTheLinkAndSkipsTheBacklog(t *testing.T) {
	r := newRig(t)
	r.link(t, ModePartner)
	r.event(protocol.KindUserMsg, protocol.UserMsg{Text: "x", Via: "imessage"}, 0)
	r.step()
	// The app quits; Messages flushes old messages and one new one arrives.
	r.store.add(Row{Text: "很早以前的", Handle: person, Date: r.now.Add(-3 * time.Hour)})
	r.text(person, "刚发的")
	r.open()
	if st := r.b.Status(); st.State != StateOn || st.Handle != person {
		t.Fatalf("link lost: %+v", st)
	}
	r.step()
	if len(r.relays) != 1 || r.relays[0].text != "刚发的" {
		t.Fatalf("after restart: %+v", r.relays)
	}
	// Events from before the restart are not acted on again.
	r.b.Observe(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{{Seq: 1, TS: r.now.Format(time.RFC3339Nano), Stream: "channel", Kind: protocol.KindAIMsg, Body: json.RawMessage(`{"text":"old"}`)}}})
	r.b.Flush(context.Background())
	if len(r.sender.sent) != 0 {
		t.Errorf("replayed: %q", r.sender.texts())
	}
	r.b.Disable()
	r.text(person, "关了以后")
	r.step()
	if len(r.relays) != 1 || r.b.Status().State != StateOff {
		t.Errorf("read while off: %+v", r.relays)
	}
}

func TestWords(t *testing.T) {
	for in, want := range map[string]string{"好": "go", "好的。": "go", "OK": "go", "\U0001F44D": "go", "先等等": "hold", "wait!": "hold", "好的，顺便看下日志": ""} {
		if got := answerOf(in); got != want {
			t.Errorf("%q: %q, want %q", in, got, want)
		}
	}
	got := plain("zh", "# 结果\n- 用了 key sk-abcdefghijklmnop1234567890\n- [PR](https://github.com/x/y/pull/1)")
	if strings.Contains(got, "sk-") || !strings.Contains(say("zh", "hidden"), "Ducter") || !strings.Contains(got, "· 用了 key") || !strings.Contains(got, "PR https://github.com/x/y/pull/1") || strings.Contains(got, "#") {
		t.Errorf("plain: %q", got)
	}
	if long := plain("en", strings.Repeat("ab ", MaxText)); !strings.HasSuffix(long, say("en", "more")) {
		t.Errorf("long: %d", len(long))
	}
	if !sameHandle("+86 138-0000-0000", "+8613800000000") || !sameHandle("A@iCloud.com", "a@icloud.com") || sameHandle("", "") {
		t.Error("sameHandle")
	}
}

func TestWordsWaitWhileTheHomeIsAway(t *testing.T) {
	r := newRig(t)
	r.link(t, ModePartner)
	r.offline = true
	r.text(person, "第一句")
	r.text(person, "第二句")
	r.step()
	if len(r.relays) != 0 {
		t.Fatalf("relayed while away: %+v", r.relays)
	}
	r.offline = false
	r.step()
	if len(r.relays) != 2 || r.relays[0].text != "第一句" || r.relays[1].text != "第二句" {
		t.Fatalf("after: %+v", r.relays)
	}
}
