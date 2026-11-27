package views

import (
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

const calCardTitle = "和 Lina 对一下 HawDB 发布和这周所有市场材料"
const calCardTitleEn = "Walk Lina through the HawDB release and every market material due this week"

// readerZone makes the Mac's own zone fixed for a test, so a +09 start and a +08 Singapore are
// deterministic wherever the suite runs.
func readerZone(t *testing.T, offset int) {
	t.Helper()
	old := time.Local
	time.Local = time.FixedZone("Test/Reader", offset)
	t.Cleanup(func() { time.Local = old })
}

func calCardDecision(lang i18n.Lang, id string, ch *protocol.CalChange) protocol.Decision {
	title := calCardTitle
	if lang == i18n.EN {
		title = calCardTitleEn
	}
	q := map[i18n.Lang]string{
		i18n.ZH: "添加「" + title + "」？",
		i18n.EN: "Add “" + title + "”?",
	}[lang]
	return protocol.Decision{DecisionID: id, Question: q, GoLabel: "Go", DefaultOption: "hold", Cal: ch}
}

func calCardChange(lang i18n.Lang, kind string) *protocol.CalChange {
	return &protocol.CalChange{
		Kind:      kind,
		Title:     map[i18n.Lang]string{i18n.ZH: calCardTitle, i18n.EN: calCardTitleEn}[lang],
		Calendar:  map[i18n.Lang]string{i18n.ZH: "主日历", i18n.EN: "Main calendar"}[lang],
		Account:   "weyl.gu",
		Color:     "#3f8f5f",
		Start:     "2026-12-12T15:00:00+09:00",
		End:       "2026-12-12T15:30:00+09:00",
		Where:     map[i18n.Lang]string{i18n.ZH: "Kong Office，12 楼东侧会议室", i18n.EN: "Kong Office, 12th floor east room"}[lang],
		Notify:    []string{"Lina Chen"},
		TheirZone: "Asia/Singapore",
		TheirName: "Lina",
	}
}

// drawCalCard feeds one decision and draws the conversation.
func drawCalCard(t *testing.T, lang i18n.Lang, d protocol.Decision) (*App, *ui.Tester) {
	t.Helper()
	app, _ := iaApp(t, lang)
	app.Route, app.LocaleFixed = RouteConversation, true
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{chEv(1, protocol.OriginPartner, protocol.KindDecision, d)}})
	tt := ui.NewTesterWith(app.View, 1150, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	return app, tt
}

func TestCalCardStructure(t *testing.T) {
	readerZone(t, 9*3600)
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		t.Run(string(lang), func(t *testing.T) {
			_, tt := drawCalCard(t, lang, calCardDecision(lang, "d1", calCardChange(lang, "create")))
			texts := tt.Texts()
			title := map[i18n.Lang]string{i18n.ZH: calCardTitle, i18n.EN: calCardTitleEn}[lang]
			n := 0
			for _, s := range texts {
				if strings.Contains(s, title) {
					n++
				}
			}
			// The card's title, once; the question above is a few words and never repeats it.
			if n != 1 {
				t.Fatalf("the title appears %d times, want once: %q", n, texts)
			}
			if !hasText(tt, map[i18n.Lang]string{i18n.ZH: "加到日历？", i18n.EN: "Add to your calendar?"}[lang]) {
				t.Errorf("the short ask is missing: %q", texts)
			}
			if !hasCalText(tt, map[i18n.Lang]string{i18n.ZH: "新加坡时间 周六 14:00", i18n.EN: "14:00 Sat, Singapore time"}[lang]) {
				t.Errorf("the other side's place is missing: %q", texts)
			}
			if !hasText(tt, map[i18n.Lang]string{i18n.ZH: "Kong Office，12 楼东侧会议室", i18n.EN: "Kong Office, 12th floor east room"}[lang]) {
				t.Errorf("where is missing: %q", texts)
			}
			if !hasText(tt, "weyl.gu") || !hasText(tt, map[i18n.Lang]string{i18n.ZH: "主日历", i18n.EN: "Main calendar"}[lang]) {
				t.Errorf("the calendar or its account is missing: %q", texts)
			}
			if hasText(tt, "那边") || hasText(tt, "for them") {
				t.Errorf("the card says 对方 / for them with no other party: %q", texts)
			}
			if !hasText(tt, "12 月") && !hasText(tt, "DEC") {
				t.Errorf("the date leaf's month is missing: %q", texts)
			}
			if !hasText(tt, "12") || !hasText(tt, map[i18n.Lang]string{i18n.ZH: "周六", i18n.EN: "Sat"}[lang]) {
				t.Errorf("the date leaf's day or weekday is missing: %q", texts)
			}
		})
	}
}

// hasCalText compares against a drawn line with the zh date's no-break space read as a space.
func hasCalText(tt *ui.Tester, want string) bool {
	for _, s := range tt.Texts() {
		if strings.ReplaceAll(s, "\u00a0", " ") == want {
			return true
		}
	}
	return false
}

func TestCalCardZoneOnlyWhenItDiffers(t *testing.T) {
	readerZone(t, 9*3600)
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		same := calCardChange(lang, "create")
		same.TheirZone = "Asia/Tokyo" // the reader's own +09: the wall clock is the same
		_, tt := drawCalCard(t, lang, calCardDecision(lang, "same", same))
		if hasCalText(tt, map[i18n.Lang]string{i18n.ZH: "东京时间 周六 15:00", i18n.EN: "15:00 Sat, Tokyo time"}[lang]) || hasCalText(tt, "时间") {
			t.Errorf("%s: the other side shows when its wall clock is the same: %q", lang, tt.Texts())
		}
	}
}

func TestCalCardNotificationOnlyWhenSomeoneHears(t *testing.T) {
	readerZone(t, 9*3600)
	quiet := calCardChange(i18n.EN, "create")
	quiet.Notify = nil
	_, tt := drawCalCard(t, i18n.EN, calCardDecision(i18n.EN, "quiet", quiet))
	if hasText(tt, "Nobody is notified") || hasText(tt, "gets an invitation") {
		t.Errorf("a quiet event of one's own says who hears: %q", tt.Texts())
	}
	answer := calCardChange(i18n.EN, "respond")
	answer.Response, answer.Organizer, answer.Notify = "declined", "", nil
	_, tt = drawCalCard(t, i18n.EN, calCardDecision(i18n.EN, "answer", answer))
	if !hasText(tt, "Nobody is notified") {
		t.Errorf("an answer with no organizer should say nobody hears: %q", tt.Texts())
	}
}

func TestCalLeafState(t *testing.T) {
	app, _ := iaApp(t, i18n.ZH)
	app.S.DecisionCalls["done"] = &protocol.ConnectionCall{DecisionID: "done", State: "done", Link: "https://calendar.google.com/x"}
	app.S.DecisionCalls["failed"] = &protocol.ConnectionCall{DecisionID: "failed", State: "failed", Error: "no"}
	for _, tc := range []struct {
		d    *storeDecision
		want string
	}{
		{&storeDecision{id: "create", kind: "create"}, "open"},
		{&storeDecision{id: "create", kind: "create", pending: "go"}, "open"},
		{&storeDecision{id: "done", kind: "create", pending: "go"}, "done"},
		{&storeDecision{id: "done", kind: "cancel", pending: "go"}, "cancel"},
		{&storeDecision{id: "cancel", kind: "cancel"}, "cancel"},
		{&storeDecision{id: "failed", kind: "create", pending: "go"}, "failed"},
	} {
		d := &store.DecisionState{}
		d.DecisionID, d.Pending = tc.d.id, tc.d.pending
		d.Cal = &protocol.CalChange{Kind: tc.d.kind}
		if got := app.calLeafState(d); got != tc.want {
			t.Errorf("%+v: leaf %q, want %q", tc.d, got, tc.want)
		}
	}
}

type storeDecision struct {
	id, kind, pending string
}

func TestCalCardSettles(t *testing.T) {
	readerZone(t, 9*3600)
	for _, tc := range []struct {
		name string
		call *protocol.ConnectionCall
		opt  string
		want string
		link bool
		why  string
	}{
		{"added", &protocol.ConnectionCall{State: "done", Link: "https://calendar.google.com/x"}, "go", "已添加到日历", true, ""},
		{"failed", &protocol.ConnectionCall{State: "failed", Error: "Google 日历没有回答"}, "go", "没能添加", false, "Google 日历没有回答"},
		{"held", nil, "hold", "没有改动", false, ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			app, _ := iaApp(t, i18n.ZH)
			app.Route, app.LocaleFixed = RouteConversation, true
			d := calCardDecision(i18n.ZH, "d1", calCardChange(i18n.ZH, "create"))
			app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{chEv(1, protocol.OriginPartner, protocol.KindDecision, d)}})
			if tc.opt == "go" {
				app.S.Decisions["d1"].Resolved = &protocol.DecisionResolved{DecisionID: "d1", Option: "go", By: "user"}
				if tc.call != nil {
					tc.call.DecisionID = "d1"
					app.S.DecisionCalls["d1"] = tc.call
				}
			} else {
				app.S.Decisions["d1"].Resolved = &protocol.DecisionResolved{DecisionID: "d1", Option: "hold", By: "user"}
			}
			tt := ui.NewTesterWith(app.View, 1150, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
			tt.Frame()
			if !hasText(tt, tc.want) {
				t.Errorf("missing %q: %q", tc.want, tt.Texts())
			}
			if tc.link && !hasText(tt, "在日历中打开") {
				t.Errorf("the card does not offer the calendar: %q", tt.Texts())
			}
			if tc.why != "" && !hasText(tt, tc.why) {
				t.Errorf("the reason is missing: %q", tt.Texts())
			}
		})
	}
}

func TestAskKindMarkLeavesTheWordsRoom(t *testing.T) {
	app, _ := iaApp(t, i18n.EN)
	app.Route, app.LocaleFixed = RouteConversation, true
	q := "Send the draft reply to Lina about the HawDB release and every market material due this week?"
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{chEv(1, protocol.OriginPartner, protocol.KindDecision, protocol.Decision{
		DecisionID: "d_mail", Question: q, GoLabel: "Send", DefaultOption: "hold", Draft: &protocol.DecisionDraft{First: "Hi Lina,"},
	})}})
	tt := ui.NewTesterWith(app.View, 1000, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	r, ok := tt.Find(q)
	if !ok {
		t.Fatalf("the marked question is missing: %q", tt.Texts())
	}
	if r.W < 180 || r.X+r.W > 1000 {
		t.Errorf("the mark crowded the words: %+v", r)
	}
}

func TestCalCardGeometry(t *testing.T) {
	readerZone(t, 9*3600)
	theme.LoadFonts()
	for _, width := range []int{1000, 1150, 1400} {
		app, _ := iaApp(t, i18n.ZH)
		app.Route, app.LocaleFixed = RouteConversation, true
		app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{chEv(1, protocol.OriginPartner, protocol.KindDecision, calCardDecision(i18n.ZH, "d1", calCardChange(i18n.ZH, "create")))}})
		tt := ui.NewTesterWith(app.View, width, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.Frame()
		tt.SetSize(width, 900)
		for i := 0; i < 4; i++ {
			tt.Advance(20 * time.Millisecond)
		}
		title, ok := tt.Find(calCardTitle)
		if !ok {
			t.Fatalf("%d: no title: %q", width, tt.Texts())
		}
		if title.X < 0 || title.X+title.W > float32(width) {
			t.Errorf("%d: title outside the window: %+v", width, title)
		}
		where, ok := tt.Find("Kong Office，12 楼东侧会议室")
		if !ok || where.X+where.W > float32(width) {
			t.Errorf("%d: where outside the window: %+v", width, where)
		}
		month, ok := tt.Find("12 月")
		if !ok {
			t.Fatalf("%d: no leaf month: %q", width, tt.Texts())
		}
		if title.X <= month.X+month.W {
			t.Errorf("%d: the title is not right of the leaf: title %+v month %+v", width, title, month)
		}
		if diff := title.Y - month.Y; diff < -4 || diff > 8 {
			t.Errorf("%d: the leaf and title are not on one top line: title y %.1f, month y %.1f", width, title.Y, month.Y)
		}
	}
}
