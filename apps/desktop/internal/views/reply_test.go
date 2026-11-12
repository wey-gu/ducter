package views

import (
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D236: 回复 / Reply to one message, as the web client has it: the foo TTL
// fix the author ran, a reply to the partner's result, a reply to its ask,
// and the answers.
type replyWords struct {
	fix, look, fixed, values, valuesAck, more, ask, doIt, moreAck, doAck string
}

var replyRun = map[i18n.Lang]replyWords{
	i18n.ZH: {
		fix:       "修一下 ~/dev/foo 里 TTL 那个时好时坏的测试",
		look:      "我去看看 foo 里那个时好时坏的 TTL 测试，弄清楚了告诉你。",
		fixed:     "TTL 测试修好了：它用真实计时去等 1 秒过期，机器一忙就抢跑，现在改成假时钟。",
		values:    "再给 Cache 加一个 values()，只要没过期的",
		valuesAck: "我去给 foo 的 Cache 加 values()。",
		more:      "这个再补一条测试，覆盖正好到期那一刻",
		ask:       "ducter.dev 11 月 20 日到期，Cloudflare 上自动续费的那张卡过期了。要我去换上新卡续费吗？",
		doIt:      "帮我把这个弄好",
		moreAck:   "我接着给 TTL 补一条正好到期的测试。",
		doAck:     "好，我去 Cloudflare 把 ducter.dev 的续费卡换上。",
	},
	i18n.EN: {
		fix:       "Fix the flaky TTL test in ~/dev/foo",
		look:      "I'll look at the flaky TTL test in foo and tell you what I find.",
		fixed:     "The TTL test is fixed: it waited a real second to expire and ran early when the machine was busy. It uses a fake clock now.",
		values:    "Also give Cache a values() that only returns what hasn't expired",
		valuesAck: "Adding values() to foo's Cache.",
		more:      "Add one more test for the exact moment it expires",
		ask:       "ducter.dev expires on November 20, and the card Cloudflare renews it with has expired. Shall I put a new card on and renew it?",
		doIt:      "Sort this out for me",
		moreAck:   "Adding a TTL test for the exact moment it expires.",
		doAck:     "On it: putting the new card on ducter.dev in Cloudflare.",
	},
}

// replyApp is the conversation after two replies: seq 6 replies to the
// partner's result (seq 3), seq 8 to its ask (seq 7); seq 9 answers seq 6
// after seq 8 came between, seq 10 answers seq 8 right after it.
func replyApp(t *testing.T, lang i18n.Lang) (*App, *ui.Tester, *[]any) {
	t.Helper()
	w := replyRun[lang]
	app, sent := iaApp(t, lang)
	app.Status = client.Connected
	app.LocaleFixed = true
	now := time.Now()
	n := int64(0)
	at := func(ago time.Duration, origin protocol.Origin, kind string, body any) protocol.LogEvent {
		n++
		return protocol.NewEvent(n, now.Add(-ago).UTC().Format(time.RFC3339Nano), "default", "channel", origin, kind, body)
	}
	ts := func(ago time.Duration) string { return now.Add(-ago).UTC().Format(time.RFC3339Nano) }
	evs := []protocol.LogEvent{
		at(30*time.Minute, protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: w.fix}),
		at(30*time.Minute, protocol.OriginPartner, protocol.KindAck, protocol.Ack{JobID: "j1", Text: w.look, ReplyTo: 1}),
		at(20*time.Minute, protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: w.fixed, ReplyTo: 1}),
		at(19*time.Minute, protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: w.values}),
		at(19*time.Minute, protocol.OriginPartner, protocol.KindAck, protocol.Ack{JobID: "j2", Text: w.valuesAck, ReplyTo: 4}),
		at(10*time.Minute, protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: w.more, ClientID: "c-more",
			Reply: &protocol.ReplyRef{Seq: 3, From: "partner", Kind: "message", Quote: w.fixed, TS: ts(20 * time.Minute)}}),
		at(9*time.Minute, protocol.OriginPartner, protocol.KindDecision, protocol.Decision{DecisionID: "d_card", Question: w.ask, GoLabel: "go", DefaultOption: "hold"}),
		at(8*time.Minute, protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: w.doIt,
			Reply: &protocol.ReplyRef{Seq: 7, From: "partner", Kind: "question", Quote: w.ask, TS: ts(9 * time.Minute), DecisionID: "d_card", Answers: true}}),
		at(8*time.Minute, protocol.OriginUser, protocol.KindDecisionResolved, protocol.DecisionResolved{DecisionID: "d_card", Option: "reply", Text: w.doIt, By: "user", MsgSeq: 8}),
		at(7*time.Minute, protocol.OriginPartner, protocol.KindAck, protocol.Ack{JobID: "j3", Text: w.moreAck, ReplyTo: 6}),
		at(7*time.Minute, protocol.OriginPartner, protocol.KindAck, protocol.Ack{JobID: "j4", Text: w.doAck, ReplyTo: 8}),
	}
	app.Receive(protocol.ServerFrame{T: "events", Events: evs})
	tt := ui.NewTesterWith(app.View, 1100, 1180, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	tt.Frame()
	tt.Frame()
	return app, tt, sent
}

// replyShot writes .shots/reply/<name>.png (or under $DUCTER_SHOTS_DIR).
func replyShot(t *testing.T, tt *ui.Tester, name string) {
	t.Helper()
	dir := os.Getenv("DUCTER_SHOTS_DIR")
	if dir == "" {
		dir = filepath.Join("..", "..", "..", "..", ".shots", "reply")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	f, err := os.Create(filepath.Join(dir, name+".png"))
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if err := png.Encode(f, tt.Image()); err != nil {
		t.Fatal(err)
	}
}

// The sent replies show what they reply to pressed into their top: who
// said it and the quote; the answer that came after other messages shows
// the reply it answers, and the one right after its reply doesn't.
func TestReplyImprints(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		w := replyRun[lang]
		app, tt, _ := replyApp(t, lang)
		all := texts(tt)
		// The quote shows twice: in its own bubble and (clipped to two
		// lines' worth) in the imprint.
		if count(tt, autospace(w.fixed)) < 1 || count(tt, autospace(clipQuote(w.fixed, shownQuote))) < 1 || strings.Count(all, autospace(clipQuote(strings.TrimSuffix(w.fixed, "…"), shownQuote))) < 1 {
			t.Errorf("%s: the imprint of the result doesn't show: %q", lang, all)
		}
		if count(tt, "Ducter") < 2 {
			t.Errorf("%s: the imprints' who-line doesn't say Ducter: %q", lang, all)
		}
		toPartner := app.L.T("reply.jump", "Ducter")
		if got := count(tt, toPartner); got != 2 {
			t.Errorf("%s: %d imprints to the partner, want 2", lang, got)
		}
		// One answer tab (seq 9 answers seq 6, with seq 8 between); seq 10
		// answers seq 8 right after it: none.
		toYou := app.L.T("reply.jump", app.L.T("reply.you"))
		if got := count(tt, toYou); got != 1 {
			t.Errorf("%s: %d answer tabs, want 1", lang, got)
		}
		if strings.Count(all, autospace(w.more)) < 2 {
			t.Errorf("%s: the answer tab doesn't quote the reply: %q", lang, all)
		}
		// The ask answered by a reply (msgSeq): its words show as that
		// bubble, not again as a small line under the question.
		if said := autospace(app.answeredWords(app.S.Decisions["d_card"])); count(tt, said) != 0 {
			t.Errorf("%s: the answered line %q repeats the reply", lang, said)
		}
		replyShot(t, tt, "mac-"+string(lang)+"-light-sent")
	}
}

// Hover a bubble: the round Reply beside it; click it, and the composer
// replies: its imprint, the placeholder, and the send frame carries the seq.
func TestReplyFromHoverAndSend(t *testing.T) {
	app, tt, sent := replyApp(t, i18n.ZH)
	w := replyRun[i18n.ZH]
	r, ok := tt.Find(autospace(w.fixed))
	if !ok {
		t.Fatalf("the result bubble isn't there: %q", texts(tt))
	}
	if count(tt, app.L.T("reply.action")) != 0 {
		t.Errorf("Reply shows before any hover")
	}
	tt.Move(r.X+r.W/2, r.Y+r.H/2)
	tt.Frame()
	tt.Frame()
	if count(tt, app.L.T("reply.action")) != 1 {
		t.Fatalf("hovering the result shows no Reply: %q", texts(tt))
	}
	replyShot(t, tt, "mac-zh-hover")
	if err := tt.Click(app.L.T("reply.action")); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	tt.Frame()
	if app.rp.replying == nil || app.rp.replying.seq != 3 || app.rp.replying.from != "partner" {
		t.Fatalf("replying: %+v", app.rp.replying)
	}
	if count(tt, app.L.T("reply.to", "Ducter")) < 2 {
		t.Errorf("the placeholder doesn't say who it replies to: %q", texts(tt))
	}
	if count(tt, app.L.T("reply.cancel")) != 1 {
		t.Errorf("no way to put the reply away: %q", texts(tt))
	}
	tt.Move(4, 4)
	tt.Frame()
	replyShot(t, tt, "mac-zh-composer-replying")

	*sent = nil
	tt.Type("边界那一刻也测一下")
	tt.Key(0, ui.KeyEnter)
	tt.Frame()
	var got *protocol.Send
	for _, f := range *sent {
		if s, ok := f.(protocol.Send); ok {
			got = &s
		}
	}
	if got == nil || got.Reply == nil || got.Reply.Seq != 3 || got.Reply.FindID != "" {
		t.Fatalf("send frame: %+v", got)
	}
	if app.rp.replying != nil {
		t.Errorf("the composer still replies after sending")
	}
	if len(app.pending) != 1 || app.pending[0].reply == nil {
		t.Fatalf("the pending message lost its reply: %+v", app.pending)
	}
	// The pending bubble shows the imprint (still: not a way back yet).
	if strings.Count(texts(tt), autospace(clipQuote(w.fixed, shownQuote))) < 3 {
		t.Errorf("the pending bubble shows no imprint: %q", texts(tt))
	}
}

// Esc puts a reply away, and the placeholder comes back.
func TestReplyEscCancels(t *testing.T) {
	app, tt, _ := replyApp(t, i18n.EN)
	app.StartReply(app.replyOf(app.S.Channel[0]))
	tt.Frame()
	tt.Frame()
	if count(tt, app.L.T("reply.to", app.L.T("reply.you"))) < 2 {
		t.Fatalf("not replying: %q", texts(tt))
	}
	replyShot(t, tt, "mac-en-composer-replying")
	tt.Key(0, ui.KeyEscape)
	tt.Frame()
	if app.rp.replying != nil {
		t.Fatalf("Esc didn't put the reply away")
	}
	if !tt.HasText(app.L.T("composer.label", "Ducter")) || tt.HasText(app.L.T("reply.to", app.L.T("reply.you"))) {
		t.Errorf("the placeholder didn't come back: %q", texts(tt))
	}
	// The drawn × does the same.
	app.StartReply(app.replyOf(app.S.Channel[0]))
	tt.Frame()
	if err := tt.Click(app.L.T("reply.cancel")); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if app.rp.replying != nil {
		t.Errorf("the × didn't put the reply away")
	}
}

// Right-click a bubble: Reply and Copy.
func TestReplyContextMenu(t *testing.T) {
	app, tt, _ := replyApp(t, i18n.ZH)
	w := replyRun[i18n.ZH]
	if err := tt.RightClick(autospace(w.values)); err != nil {
		t.Fatal(err)
	}
	menu := strings.Join(tt.Menu(), "|")
	if !strings.Contains(menu, app.L.T("reply.action")) || !strings.Contains(menu, app.L.T("reply.copy")) {
		t.Fatalf("menu: %q", menu)
	}
	if err := tt.ChooseMenuItem(app.L.T("reply.action")); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if app.rp.replying == nil || app.rp.replying.seq != 4 || app.rp.replying.from != "you" {
		t.Fatalf("replying: %+v", app.rp.replying)
	}
}

// Click an imprint: the message it quotes is found; one no longer here
// says so.
func TestReplyJump(t *testing.T) {
	app, tt, _ := replyApp(t, i18n.ZH)
	if err := tt.Click(app.L.T("reply.jump", "Ducter")); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if app.rp.found.seq != 3 {
		t.Fatalf("found: %+v", app.rp.found)
	}
	// Mid-find, the result's tint is deepened.
	app.Now = func() time.Time { return app.rp.found.at.Add(500 * time.Millisecond) }
	if k, _ := app.foundLevel(3, ""); k != 1 {
		t.Errorf("found at 500 ms: %v, want 1", k)
	}
	app.Now = func() time.Time { return app.rp.found.at.Add(2 * time.Second) }
	if k, _ := app.foundLevel(3, ""); k != 0 {
		t.Errorf("found after it settled: %v", k)
	}
	app.Now = time.Now
	app.rp.found.seq = 0
	gone := protocol.NewEvent(20, time.Now().UTC().Format(time.RFC3339Nano), "default", "channel", protocol.OriginUser, protocol.KindUserMsg,
		protocol.UserMsg{Text: "那个也看下", Reply: &protocol.ReplyRef{Seq: 999, From: "you", Kind: "message", Quote: "很早以前说的", TS: "2026-10-01T09:00:00Z"}})
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{gone}})
	tt.Frame()
	tt.Frame()
	if err := tt.Click(app.L.T("reply.jump", app.L.T("reply.you"))); err != nil {
		// Two "back to You" imprints now: the answer tab and this one.
		t.Logf("click: %v", err)
	}
	tt.Frame()
	if app.rp.found.seq == 999 {
		t.Errorf("found a message that isn't here")
	}
}

func TestClipQuote(t *testing.T) {
	if got := clipQuote("short", 120); got != "short" {
		t.Errorf("short: %q", got)
	}
	long := strings.Repeat("word ", 40)
	if got := clipQuote(long, 120); !strings.HasSuffix(got, "…") || len([]rune(got)) > 120 || strings.HasSuffix(got, " …") {
		t.Errorf("long: %q", got)
	}
	if got := plainWords("**TTL** fixed: see [the PR](https://x)\n- one\n- `two`"); got != "TTL fixed: see the PR one two" {
		t.Errorf("plain: %q", got)
	}
}
