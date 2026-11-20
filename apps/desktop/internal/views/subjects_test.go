package views

import (
	"strings"
	"testing"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// D415: the person's own subjects (分类) on the Mac: their chip first, + 新的分类
// opens the sheet in a make mode whose primary puts the ticked ones in it;
// a chip's sheet renames (or merges), removes and takes a row out; any
// sheet with ticks can put them in a subject; the comment-first card shows
// the line whole; a hand-over that asks first says so.

func ownPile(lang i18n.Lang) protocol.ServerFrame {
	f := pileFrameSubjects(lang)
	w := todoWords(lang)
	f.Sources.View.Pile.Subjects = append([]protocol.PileSubject{{Name: w("记忆提炼", "Distillation"), N: 13}}, protocol.PileSubject{Name: w("通用设置", "General settings"), N: 2, Own: true})
	f.Sources.View.Pile.Subjects = append(f.Sources.View.Pile.Subjects, pileFrameSubjects(lang).Sources.View.Pile.Subjects[1:]...)
	return f
}

func subjectResult(app *App, op string, ok bool, name string, n int) {
	app.Receive(protocol.ServerFrame{T: "pile_result", Sources: &protocol.SourcesFrame{ClientID: app.ho.subjCid, PileOp: "subject", OK: ok, Name: name, Done: n}})
}

func TestOwnSubjectChipFirstAndNewSubject(t *testing.T) {
	app, sent, tt := todoApp(t, i18n.ZH, 1400, 2000)
	app.S.PersonaName = "小鸭"
	app.Receive(ownPile(i18n.ZH))
	app.Route = RouteOnHand
	todoFrames(tt, 3)
	all := strings.Join(tt.Texts(), " | ")
	own, other := strings.Index(all, "通用设置"), strings.Index(all, "记忆提炼")
	if own < 0 || other < 0 || own > other || !strings.Contains(all, "分类") || !strings.Contains(all, "新的分类") {
		t.Fatalf("chips: %s", all)
	}
	// + 新的分类: a make mode; the primary puts what's ticked in the named subject.
	if err := tt.Click("新的分类"); err != nil {
		t.Fatal(err)
	}
	todoFrames(tt, 2)
	if !app.ho.open || !app.ho.making {
		t.Fatalf("make mode: %+v", app.ho)
	}
	all = strings.Join(tt.Texts(), " | ")
	if !strings.Contains(all, "叫什么") || !strings.Contains(all, "先起个名字") {
		t.Fatalf("make sheet: %s", all)
	}
	items, ticked := memFound(i18n.ZH)
	app.ho.items, app.ho.got = items, true
	for _, r := range ticked[:2] {
		app.ho.ticked[r] = true
	}
	app.ho.makeName = "蒸馏兜底"
	todoFrames(tt, 2)
	if err := tt.Click("放进「蒸馏兜底」"); err != nil {
		t.Fatal(err)
	}
	r, ok := lastSent[protocol.PileSubjectReq](*sent)
	if !ok || r.Op != "put" || r.Name != "蒸馏兜底" || len(r.Refs) != 2 {
		t.Fatalf("put: %+v", *sent)
	}
	subjectResult(app, "put", true, "蒸馏兜底", 2)
	todoFrames(tt, 1)
	// The sheet is that subject's set now, ready to hand over.
	if f, ok := lastSent[protocol.PileFindReq](*sent); !ok || f.Subject != "蒸馏兜底" || app.ho.making || !app.ho.fromChip {
		t.Fatalf("after put: %+v %+v", *sent, app.ho)
	}
}

func TestSubjectBarRenameRemoveTake(t *testing.T) {
	app, sent, tt := handApp(t, i18n.ZH, 1400, 1100, "")
	all := strings.Join(tt.Texts(), " | ")
	for _, want := range []string{"改名", "去掉这个分类", "移出", "归到分类…"} {
		if !strings.Contains(all, want) {
			t.Fatalf("missing %q in %s", want, all)
		}
	}
	// 移出 on a row.
	first := app.ho.items[0]
	if err := tt.Click(spoken(app.L, "移出", app.L.T("hand.subject.take.label", first.Item.Title))); err != nil {
		t.Fatal(err)
	}
	if r, ok := lastSent[protocol.PileSubjectReq](*sent); !ok || r.Op != "take" || r.Name != "记忆提炼" || len(r.Refs) != 1 || r.Refs[0] != first.Item.Ref {
		t.Fatalf("take: %+v", *sent)
	}
	subjectResult(app, "take", true, "", 0)
	todoFrames(tt, 1)
	for _, it := range app.ho.items {
		if it.Item.Ref == first.Item.Ref {
			t.Fatal("the row stayed after 移出")
		}
	}
	// 改名: into another one there is merges.
	if err := tt.Click(spoken(app.L, "改名", "记忆提炼")); err != nil {
		t.Fatal(err)
	}
	todoFrames(tt, 1)
	if err := tt.Click("并到「登录」"); err != nil {
		t.Fatal(err)
	}
	if r, ok := lastSent[protocol.PileSubjectReq](*sent); !ok || r.Op != "rename" || r.Name != "记忆提炼" || r.To != "登录" {
		t.Fatalf("merge: %+v", *sent)
	}
	subjectResult(app, "rename", true, "登录", 25)
	todoFrames(tt, 1)
	f, ok := lastSent[protocol.PileFindReq](*sent)
	if app.ho.subject != "登录" || !ok || f.Subject != "登录" {
		t.Fatalf("after merge: %q %+v", app.ho.subject, f)
	}
	items, ticked := memFound(i18n.ZH)
	app.Receive(protocol.ServerFrame{T: "pile_find_result", Sources: &protocol.SourcesFrame{ClientID: f.ClientID, PileOp: "find", Found: &protocol.FindSummary{N: len(items), Subject: "登录"}, FoundItems: items, Ticked: ticked, Subject: "登录"}})
	todoFrames(tt, 2)
	// 去掉这个分类: the to-dos stay; the sheet closes.
	if err := tt.Click(spoken(app.L, "去掉这个分类", "登录")); err != nil {
		t.Fatal(err)
	}
	if r, ok := lastSent[protocol.PileSubjectReq](*sent); !ok || r.Op != "remove" || r.Name != "登录" {
		t.Fatalf("remove: %+v", *sent)
	}
	subjectResult(app, "remove", true, "", 0)
	todoFrames(tt, 1)
	if app.ho.open {
		t.Fatal("the sheet stayed open after remove")
	}
}

func TestPutTickedInASubject(t *testing.T) {
	app, sent, tt := handApp(t, i18n.EN, 1400, 1100, "")
	if err := tt.Click("Put in a subject…"); err != nil {
		t.Fatal(err)
	}
	todoFrames(tt, 1)
	app.ho.fileName = "Fallbacks"
	todoFrames(tt, 1)
	if err := tt.Click("Put in"); err != nil {
		t.Fatal(err)
	}
	r, ok := lastSent[protocol.PileSubjectReq](*sent)
	if !ok || r.Op != "put" || r.Name != "Fallbacks" || len(r.Refs) != len(app.ho.handTicked()) {
		t.Fatalf("put: %+v", *sent)
	}
}

func TestHandCommentCardAndAskedToast(t *testing.T) {
	app, _, _ := todoApp(t, i18n.ZH, 1000, 800)
	item := ghRef(10612, "Default 空间合并遗留同名别名无法清除")
	d := &store.DecisionState{Decision: protocol.Decision{DecisionID: "d_c", Question: "先在这 2 个下面留一句，再开始？", GoLabel: "留言并开始", HoldLabel: "只开始，不留言",
		Src: &protocol.SourceAsk{Kind: "hand_comment", Item: item, Text: "我的 ducter agent 要开始做了", Items: []protocol.SourceAskItem{{Item: item}, {Item: ghRef(10559, "Improve general setting page")}}}}}
	tt := ui.NewTesterWith(func(c *ui.Context) { a := app; ui.Column(c).Children(func() { a.todoAskBody(c, d) }) }, 900, 400, ui.TesterOptions{})
	tt.Frame()
	all := strings.Join(tt.Texts(), " | ")
	for _, want := range []string{"会留这一句", "我的 ducter agent 要开始做了", "#10612", "#10559"} {
		if !strings.Contains(all, want) {
			t.Fatalf("missing %q in %s", want, all)
		}
	}
	// A hand-over that asked first: the sheet closes and says so.
	app.openHandDo()
	app.ho.goCid = "g1"
	app.Receive(protocol.ServerFrame{T: "pile_result", Sources: &protocol.SourcesFrame{ClientID: "g1", PileOp: "hand", OK: true, Asked: "d_c"}})
	app.takeHand()
	if app.ho.open || app.fileToast != "先问你留不留言，回答了再开始" {
		t.Fatalf("asked: open=%v toast=%q", app.ho.open, app.fileToast)
	}
}

func TestSubjectFramesDecode(t *testing.T) {
	f, err := protocol.DecodeServerFrame([]byte(`{"t":"pile_result","clientId":"s1","op":"subject","ok":true,"done":3,"name":"通用设置"}`))
	if err != nil || f.Sources.Name != "通用设置" || f.Sources.Done != 3 || f.Sources.PileOp != "subject" {
		t.Fatalf("subject: %v %+v", err, f.Sources)
	}
	f, err = protocol.DecodeServerFrame([]byte(`{"t":"pile_result","clientId":"g","op":"hand","ok":true,"done":0,"asked":"d_1"}`))
	if err != nil || f.Sources.Asked != "d_1" {
		t.Fatalf("asked: %v %+v", err, f.Sources)
	}
	f, err = protocol.DecodeServerFrame([]byte(`{"t":"sources","sources":[],"found":{"vaults":[]},"pile":{"open":3,"clearedToday":0,"read":3,"unread":0,"groups":{"do":3},"queue":{"running":0,"waiting":0,"cap":3},"subjects":[{"name":"通用设置","n":2,"own":true}]}}`))
	if err != nil || !f.Sources.View.Pile.Subjects[0].Own {
		t.Fatalf("own: %v %+v", err, f.Sources.View.Pile)
	}
}
