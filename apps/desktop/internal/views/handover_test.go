package views

import (
	"encoding/json"
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D385: handing several over on the Mac: the frames decode as the home
// sends them; the sheet (find, the note, how, where and who) sends what was
// ticked, said and chosen; 讲的是 chips open it on a subject; the set card,
// the plan card and review together. Fake fixtures, no live core.

func TestHandoverFramesDecode(t *testing.T) {
	f, err := protocol.DecodeServerFrame([]byte(`{"t":"pile_find_result","clientId":"h1","query":"memory distill","subject":"记忆提炼","found":{"n":9,"subject":"记忆提炼","inTitle":6,"byLabel":0,"byMeaning":3},"items":[{"item":{"source":"s","kind":"github","ref":"acme/mem#366","label":"#366","title":"长对话的自动提炼总是失败","state":"open"},"group":"later","why":"改动大","size":"large","subject":"记忆提炼","by":"meaning"}],"ticked":["acme/mem#412"]}`))
	if err != nil || f.Sources.PileOp != "find" || f.Sources.Found.N != 9 || f.Sources.FoundItems[0].By != "meaning" || f.Sources.FoundItems[0].Item.Ref != "acme/mem#366" || f.Sources.FoundItems[0].Subject != "记忆提炼" || f.Sources.Ticked[0] != "acme/mem#412" || f.Sources.Subject != "记忆提炼" {
		t.Fatalf("find: %v %+v", err, f.Sources)
	}
	f, err = protocol.DecodeServerFrame([]byte(`{"t":"pile_how_result","clientId":"w1","how":{"shape":"plan","shapes":["plan","one","one_by_one","side_by_side"],"repo":"acme/mem","addTo":{"groupId":"g1","name":"记忆提炼","n":4,"planning":true},"where":{"device":"w-haswell","name":"haswell","why":"note","said":"haswell","hasRepo":true},"wheres":[{"device":"local","name":"MacBook Pro","why":"repo","hasRepo":true}],"who":{"why":"usual"},"whos":["codex","claude-code"],"cap":3,"lasting":true}}`))
	if err != nil || f.Sources.How == nil || f.Sources.How.Shape != "plan" || f.Sources.How.Where.Why != "note" || f.Sources.How.AddTo.GroupID != "g1" || !f.Sources.How.Lasting || len(f.Sources.How.Whos) != 2 {
		t.Fatalf("how: %v %+v", err, f.Sources)
	}
	f, err = protocol.DecodeServerFrame([]byte(`{"t":"group_review_result","clientId":"r1","review":{"groupId":"g1","name":"记忆提炼","rows":[{"taskId":"t2","items":[{"source":"s","kind":"github","ref":"acme/mem#398","label":"#398","title":"x"}],"pr":{"url":"https://github.com/acme/mem/pull/420","label":"PR #420"},"checks":{"state":"failed","failed":1},"size":{"added":212,"removed":40},"result":"ok","comment":"Fixed in #420.","close":false}],"prs":1,"fixed":0}}`))
	if err != nil || f.Sources.Review == nil || f.Sources.Review.Rows[0].Checks.Failed != 1 || f.Sources.Review.Rows[0].Size.Added != 212 || f.Sources.Review.Rows[0].PR.Label != "PR #420" {
		t.Fatalf("review: %v %+v", err, f.Sources)
	}
	f, err = protocol.DecodeServerFrame([]byte(`{"t":"pile_result","clientId":"g","op":"hand","ok":true,"done":7,"groupId":"g9"}`))
	if err != nil || f.Sources.GroupID != "g9" || f.Sources.Done != 7 {
		t.Fatalf("result: %v %+v", err, f.Sources)
	}
	f, err = protocol.DecodeServerFrame([]byte(`{"t":"sources","sources":[],"found":{"vaults":[]},"pile":{"open":557,"clearedToday":0,"read":557,"unread":0,"groups":{"do":41},"queue":{"running":0,"waiting":0,"cap":3},"subjects":[{"name":"记忆提炼","n":13}],"subjectsMore":4}}`))
	if err != nil || f.Sources.View.Pile.Subjects[0].N != 13 || f.Sources.View.Pile.SubjectsMore != 4 {
		t.Fatalf("subjects: %v %+v", err, f.Sources.View.Pile)
	}
	// The Log's set card, the plan card's src and a hand-over group.
	set := protocol.LogEvent{Kind: protocol.KindTodoSet, Body: []byte(`{"setId":"set_1","subject":"记忆提炼","found":{"n":9,"inTitle":6,"byLabel":0,"byMeaning":3},"refs":["a#1"],"ticked":["a#1"],"rows":[],"groupId":"g1"}`)}
	if v, err := set.Typed(); err != nil || v.(*protocol.TodoSet).GroupID != "g1" {
		t.Fatalf("todo_set: %v %#v", err, v)
	}
	var d protocol.Decision
	if err := (protocol.LogEvent{Kind: "decision", Body: []byte(`{"decisionId":"d1","question":"记忆提炼：方案","goLabel":"照这个做","defaultOption":"hold","reversible":false,"src":{"kind":"plan","item":{"source":"s","kind":"github","ref":"a#1","label":"#1","title":"x"},"groupId":"g1","group":"记忆提炼","plan":{"fixed":[{"ref":"a#1","where":"PR #360"}],"one":[],"line":[{"id":"p1","refs":["a#2"],"title":"t","why":"w","step":1}],"side":[],"later":[],"limits":["不动迁移"],"read":{"n":2,"repo":"acme/mem"}}}}`)}).Decode(&d); err != nil || d.Src.Plan.Line[0].Step != 1 || d.Src.GroupID != "g1" || d.Src.Plan.Read.Repo != "acme/mem" {
		t.Fatalf("plan: %v %+v", err, d.Src)
	}
	var oh protocol.OnHand
	if err := json.Unmarshal([]byte(`{"tasks":[],"counts":{},"waiters":[],"groups":[{"id":"g1","name":"记忆提炼","order":"one_by_one","by":"you","persona":"default","members":[{"taskId":"t1"}],"createdAt":"x","hand":{"shape":"plan","items":[],"note":"n","where":{"device":"w","name":"haswell"},"plan":{"taskId":"t1","state":"ready","decisionId":"d1"},"review":"ready","cap":3,"parts":{"t2":["a#2"]}}}]}`), &oh); err != nil || oh.Groups[0].Hand.Plan.State != "ready" || oh.Groups[0].Hand.Where.Name != "haswell" || oh.Groups[0].Hand.Parts["t2"][0] != "a#2" {
		t.Fatalf("group: %v %+v", err, oh.Groups)
	}
}

// ---------- fixtures: the memory-distillation subject on a heavy pile ----------

type memRow struct {
	n             int
	title, group  string
	why, ask      string
	size, by      string
	labels        []string
	pick          string
	defaultTicked bool
}

func memRows(lang i18n.Lang) []memRow {
	w := todoWords(lang)
	return []memRow{
		{412, "Distillation: fall back to a smaller result instead of failing", "do", w("说得清楚，改一处", "Clear; one place to change"), "", "medium", "title", []string{"component/distillation"}, "", true},
		{398, "Automatic distillation: the error says nothing useful", "do", w("说得清楚，改动小", "Clear, and a small change"), "", "small", "title", nil, "", true},
		{377, "Distillation gets slow on very long threads", "do", w("说得清楚，要测性能", "Clear; needs a speed test"), "", "medium", "title", nil, "", true},
		{351, "Newer facts should replace older ones by when they were said", "do", w("说得清楚，改动小", "Clear, and a small change"), "", "small", "label", []string{"component/distillation"}, "", true},
		{340, "Distillation's first try often fails on long threads", "do", w("说得清楚，要跑一批对话验证", "Clear; check on a batch of threads"), "", "medium", "title", nil, "", true},
		{322, "Show when automatic distillation has paused", "do", w("说得清楚，改动小", "Clear, and a small change"), "", "small", "title", nil, "", true},
		{405, "Retry a failed automatic distillation once?", "decide", w("要不要重试是产品上的选择", "A product choice"), w("要不要给失败的自动提炼一次有限的重试？", "Give a failed automatic distillation one bounded retry?"), "", "title", nil, "hand", false},
		{366, "长对话的自动提炼总是失败", "later", w("改动大，得先查清原因", "Big; find the cause first"), "", "large", "meaning", nil, "", false},
		{290, "Distillation as a tool loop", "later", w("改动大，得先拆开", "Big; needs breaking down first"), "", "large", "title", nil, "", false},
	}
}

func memFound(lang i18n.Lang) ([]protocol.FoundItem, []string) {
	subj := todoWords(lang)("记忆提炼", "Distillation")
	var items []protocol.FoundItem
	var ticked []string
	for _, r := range memRows(lang) {
		ref := fmt.Sprintf("acme/mem#%d", r.n)
		items = append(items, protocol.FoundItem{PileItem: protocol.PileItem{Item: protocol.SourceItem{SourceItemRef: protocol.SourceItemRef{Source: "src_gh", Kind: "github", Ref: ref, Label: fmt.Sprintf("#%d", r.n), Where: "acme/mem", Title: r.title, URL: "https://github.com/" + strings.Replace(ref, "#", "/issues/", 1)}, State: "open", Labels: r.labels},
			Group: r.group, Why: r.why, Ask: r.ask, Size: r.size, Pick: r.pick, Subject: subj}, By: r.by})
		if r.defaultTicked {
			ticked = append(ticked, ref)
		}
	}
	return items, ticked
}

func memHow(lang i18n.Lang) *protocol.HandHow {
	return &protocol.HandHow{Shape: "plan", Shapes: []string{"plan", "one", "one_by_one", "side_by_side"}, Repo: "acme/mem",
		Where:  protocol.HandWhere{Device: "w-haswell", Name: "haswell", Why: "note", Said: "haswell", HasRepo: true},
		Wheres: []protocol.HandWhere{{Device: "local", Name: "MacBook Pro", Why: "repo", Said: "acme/mem", HasRepo: true}, {Device: "w-haswell", Name: "haswell", Why: "repo", Said: "acme/mem", HasRepo: true}},
		Who:    protocol.HandWho{Harness: "codex", Why: "rule", Said: todoWords(lang)("写代码的事用 Codex", "Code work: Codex")}, Whos: []string{"codex", "claude-code"}, Cap: 3, Lasting: true}
}

// handApp is the app with the sheet open on the subject, found and with its how.
func handApp(t *testing.T, lang i18n.Lang, w, h int, note string) (*App, *[]any, *ui.Tester) {
	app, sent, tt := todoApp(t, lang, w, h)
	app.S.PersonaName = todoWords(lang)("小鸭", "Duckie")
	app.Receive(pileFrameSubjects(lang))
	app.Route = RouteOnHand
	todoFrames(tt, 2)
	subj := todoWords(lang)("记忆提炼", "Distillation")
	app.openHandSubject(subj)
	r, ok := lastSent[protocol.PileFindReq](*sent)
	if !ok || r.Subject != subj {
		t.Fatalf("no pile_find for the subject: %+v", *sent)
	}
	items, ticked := memFound(lang)
	app.Receive(protocol.ServerFrame{T: "pile_find_result", Sources: &protocol.SourcesFrame{ClientID: r.ClientID, PileOp: "find", Found: &protocol.FindSummary{N: len(items), Subject: subj, InTitle: 7, ByLabel: 1, ByMeaning: 1}, FoundItems: items, Ticked: ticked, Subject: subj}})
	todoFrames(tt, 1)
	app.ho.ticked["acme/mem#405"] = true
	app.ho.note = note
	todoFrames(tt, 2)
	tt.Advance(time.Second)
	todoFrames(tt, 2)
	hr, ok := lastSent[protocol.PileHowReq](*sent)
	if !ok {
		t.Fatalf("no pile_how: %+v", *sent)
	}
	app.Receive(protocol.ServerFrame{T: "pile_how_result", Sources: &protocol.SourcesFrame{ClientID: hr.ClientID, PileOp: "how", How: memHow(lang)}})
	todoFrames(tt, 4)
	return app, sent, tt
}

func pileFrameSubjects(lang i18n.Lang) protocol.ServerFrame {
	f := pileFrame(lang, 557, 0, 0, 0)
	w := todoWords(lang)
	f.Sources.View.Pile.Subjects = []protocol.PileSubject{{Name: w("记忆提炼", "Distillation"), N: 13}, {Name: w("登录", "Sign-in"), N: 12}, {Name: w("网页界面", "Web UI"), N: 31}, {Name: w("离线模式", "Offline mode"), N: 8}, {Name: w("文档", "Docs"), N: 14}, {Name: w("基础设施", "Infrastructure"), N: 6}}
	f.Sources.View.Pile.SubjectsMore = 5
	return f
}

func memNote(lang i18n.Lang) string {
	return todoWords(lang)("先别动数据库迁移。验证都去 haswell 上跑，那台装了 Rust。", "Leave the database migrations alone. Run every check on haswell; it has Rust.")
}

// The sheet: the subject's to-dos by group, the note, plan first suggested,
// where from the note; Go hands over what's ticked with the note and shape.
func TestHandSheetHandsOverWithNoteAndShape(t *testing.T) {
	app, sent, tt := handApp(t, i18n.ZH, 1400, 1000, memNote(i18n.ZH))
	all := strings.Join(tt.Texts(), " | ")
	for _, want := range []string{"交给小鸭", "找到 9 个讲「记忆提炼」的", "可以交给小鸭做的", "要你拿主意的", "给小鸭的话", "怎么做", "先出个方案", "你点头再做", "建议", "合成一个任务做", "一个任务，一个 PR 修好这几个", "在 acme/mem 里排着，每个从上一个的分支接着做", "一次 3 个，各自一个 PR", "在哪儿做", "haswell", "你写了 haswell", "谁来做", "Codex", "交给小鸭这 7 个"} {
		if !strings.Contains(all, want) {
			t.Fatalf("missing %q in %s", want, all)
		}
	}
	if strings.Contains(all, " · ") {
		t.Fatalf("dot-joined text (D291): %s", all)
	}
	// A note for one to-do, then Go (Cmd+Enter).
	app.ho.notes["acme/mem#405"] = "按你的建议：失败后给一次有限的重试。"
	tt.Key(ui.Cmd, ui.KeyEnter)
	tt.Frame()
	r, ok := lastSent[protocol.PileHandReq](*sent)
	if !ok {
		t.Fatalf("no pile_hand: %+v", *sent)
	}
	if len(r.Refs) != 7 || r.Shape != "plan" || r.Note != memNote(i18n.ZH) || r.Notes["acme/mem#405"] == "" || !r.BySubject || r.Subject != "记忆提炼" || r.Device != "" {
		t.Fatalf("pile_hand: %+v", r)
	}
	// The home took it: the sheet goes.
	app.Receive(protocol.ServerFrame{T: "pile_result", Sources: &protocol.SourcesFrame{ClientID: r.ClientID, PileOp: "hand", OK: true, Done: 7, GroupID: "g1"}})
	tt.Frame()
	if app.ho.open {
		t.Fatal("the sheet stayed open after the hand-over")
	}
}

// One after another picked, and the other computer: both go with the Go.
func TestHandSheetPicksShapeAndWhere(t *testing.T) {
	app, sent, tt := handApp(t, i18n.EN, 1400, 1000, "")
	if err := tt.Click("One after another"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if err := tt.Click(spoken(app.L, "Where", "haswell", "Your note says haswell")); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if err := tt.Click("MacBook Pro"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	app.handGo()
	r, _ := lastSent[protocol.PileHandReq](*sent)
	if r.Shape != "one_by_one" || r.Device != "local" {
		t.Fatalf("pile_hand: %+v", r)
	}
	all := strings.Join(tt.Texts(), " | ")
	if !strings.Contains(all, "Hand these 7 to Duckie") || !strings.Contains(all, "You picked it") {
		t.Fatalf("the foot or where: %s", all)
	}
}

// D443: a row says its size once. 说得清楚，改动小 carries no 小改动 pill; a
// line that doesn't say it (说得清楚，改一处) keeps its 中等.
func TestHandSheetSizeSaidOnce(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, _, tt := handApp(t, lang, 1400, 1000, "")
		small, medium := app.L.T("pile.size.small"), app.L.T("pile.size.medium")
		var nSmall, nMedium int
		for _, s := range tt.Texts() {
			switch s {
			case small:
				nSmall++
			case medium:
				nMedium++
			}
		}
		if nSmall != 0 || nMedium == 0 {
			t.Fatalf("%v: %d %q pills (want 0), %d %q (want some): %s", lang, nSmall, small, nMedium, medium, strings.Join(tt.Texts(), " | "))
		}
	}
}

// A narrow window: what, then 下一步：怎么做, then the note and how with Go.
func TestHandSheetNarrowTwoSteps(t *testing.T) {
	app, _, tt := handApp(t, i18n.ZH, 760, 1000, "")
	all := strings.Join(tt.Texts(), " | ")
	if !strings.Contains(all, "下一步：怎么做") || strings.Contains(all, "给小鸭的话") {
		t.Fatalf("step one: %s", all)
	}
	if err := tt.Click("下一步：怎么做"); err != nil {
		t.Fatal(err)
	}
	todoFrames(tt, 3)
	all = strings.Join(tt.Texts(), " | ")
	if app.ho.step != 1 || !strings.Contains(all, "给小鸭的话") || !strings.Contains(all, "交给小鸭这 7 个") {
		t.Fatalf("step two: %s", all)
	}
}

// 讲的是 chips on the pile, and the do row opening the same sheet.
func TestPileSubjectsAndDoRowOpenTheSheet(t *testing.T) {
	app, sent, tt := todoApp(t, i18n.ZH, 1280, 1300)
	app.Receive(pileFrameSubjects(i18n.ZH))
	app.Route = RouteOnHand
	app.oh.srcAll = true // D467: the whole sort stands behind 看看全部
	todoFrames(tt, 3)
	all := strings.Join(tt.Texts(), " | ")
	for _, want := range []string{"分类", "记忆提炼", "13", "还有 5 类"} {
		if !strings.Contains(all, want) {
			t.Fatalf("missing %q in %s", want, all)
		}
	}
	if err := tt.Click("记忆提炼 13"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if r, ok := lastSent[protocol.PileFindReq](*sent); !ok || r.Subject != "记忆提炼" || !app.ho.bySubject {
		t.Fatalf("the chip: %+v", *sent)
	}
	app.ho.open = false
	// D396: the do row opens on the words (its suggestions asked, nothing ticked); one by one is a link away.
	app.openHandDo()
	if f, ok := lastSent[protocol.PileFindReq](*sent); !ok || f.Words != "" || f.Subject != "" || f.SetID != "" || len(app.ho.handTicked()) != 0 {
		t.Fatalf("the do row: %+v", *sent)
	}
	todoFrames(tt, 2)
	all = strings.Join(tt.Texts(), " | ")
	for _, want := range []string{"想交给小鸭哪些？", "说一类就行：讲这个的我都找出来，你再删减。", "一个个挑", "在哪儿做"} {
		if !strings.Contains(all, want) {
			t.Fatalf("missing %q in %s", want, all)
		}
	}
	if err := tt.Click("一个个挑"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	r, ok := lastSent[protocol.PileItemsReq](*sent)
	if !ok || r.Group != "do" {
		t.Fatalf("the do row: %+v", *sent)
	}
	app.Receive(pileItemsFrame(i18n.ZH, r.ClientID, "do"))
	todoFrames(tt, 2)
	if len(app.ho.handTicked()) != protocol.PileHandDefault {
		t.Fatalf("ticked %d", len(app.ho.handTicked()))
	}
}

// ---------- the cards ----------

func setEvent(lang i18n.Lang, groupID string) protocol.LogEvent {
	items, ticked := memFound(lang)
	subj := todoWords(lang)("记忆提炼", "Distillation")
	var refs []string
	for _, it := range items {
		refs = append(refs, it.Item.Ref)
	}
	return ev("channel", protocol.KindTodoSet, protocol.TodoSet{SetID: "set_1", Query: "memory distill", Subject: subj, Found: protocol.FindSummary{N: 9, Subject: subj, InTitle: 7, ByLabel: 1, ByMeaning: 1}, Refs: refs, Ticked: ticked, Rows: items[:4], GroupID: groupID})
}

func memPlan(lang i18n.Lang) *protocol.HandPlan {
	w := todoWords(lang)
	return &protocol.HandPlan{
		Fixed:  []protocol.PlanFixed{{Ref: "acme/mem#351", Where: "PR #360"}},
		One:    []protocol.PlanPart{{ID: "p1", Refs: []string{"acme/mem#398", "acme/mem#412", "acme/mem#405"}, Title: w("失败时退一步，并重试一次", "Step back on failure, and retry once"), Why: w("都是自动提炼失败时怎么退一步，改的是同一处；加上一次有限的重试（你定的）", "All about how distillation steps back when it fails, in the same place; plus one bounded retry (your call)")}},
		Line:   []protocol.PlanPart{{ID: "p2", Refs: []string{"acme/mem#377"}, Why: w("先做：后面两个都用到它改的组包", "First: the other two use the packet code it changes"), Step: 1}, {ID: "p3", Refs: []string{"acme/mem#340"}, Why: w("从 #377 的分支接着做", "From #377's branch"), Step: 2}, {ID: "p4", Refs: []string{"acme/mem#322"}, Why: w("最后：把暂停的样子放进任务记录", "Last: the pause shown in Task History"), Step: 3}},
		Limits: []string{w("都在 haswell 上验证", "Every check on haswell"), w("不动数据库迁移", "No database migrations")},
		Read:   protocol.PlanRead{N: 7, Repo: "acme/mem"},
	}
}

// planOnHand is On hand with the hand-over group (plan ready, or review ready).
func planOnHand(lang i18n.Lang, stage string) *protocol.OnHand {
	now := time.Now().UTC().Format(time.RFC3339)
	w := todoWords(lang)
	subj := w("记忆提炼", "Distillation")
	card := func(id, title string, att protocol.Attention) protocol.TaskCard {
		return protocol.TaskCard{TaskID: id, Title: title, Project: "mem", Harness: "codex", Attention: att, OpenedAt: now, UpdatedAt: now,
			Place: protocol.Place{Kind: "repo", Device: "w-haswell", RepoPath: "/home/lin/mem", Branch: "ducter/" + id, BaseBranch: "main"}}
	}
	items, _ := memFound(lang)
	var refs []protocol.SourceItemRef
	for _, it := range items[:7] {
		refs = append(refs, it.Item.SourceItemRef)
	}
	hand := &protocol.GroupHandView{Shape: "plan", Items: refs, Note: memNote(lang), Subject: subj, Where: &protocol.HandDevice{Device: "w-haswell", Name: "haswell"}, Harness: "codex", Cap: 3,
		Plan: &protocol.GroupPlanView{TaskID: "tp", State: "ready", DecisionID: "dplan", Plan: memPlan(lang)}}
	g := protocol.TaskGroup{ID: "g1", Name: subj, Order: "one_by_one", By: "you", Persona: "default", Members: []protocol.GroupMember{{TaskID: "tp"}}, CreatedAt: now, Hand: hand}
	tasks := []protocol.TaskCard{card("tp", w("记忆提炼：方案", "Distillation: the plan"), protocol.Done)}
	if stage == "review" {
		hand.Plan.State, hand.Review = "going", "ready"
		hand.Fixed = memPlan(lang).Fixed
		g.Members = append(g.Members, protocol.GroupMember{TaskID: "t2"}, protocol.GroupMember{TaskID: "t3"}, protocol.GroupMember{TaskID: "t4"}, protocol.GroupMember{TaskID: "t5"})
		tasks = append(tasks, card("t2", w("失败时退一步，并重试一次", "Step back on failure, and retry once"), protocol.DoneClaimed), card("t3", w("长对话的组包变快", "Faster packets on long threads"), protocol.DoneClaimed), card("t4", w("第一次就能提炼成功", "Succeed on the first try"), protocol.DoneClaimed), card("t5", w("暂停时在任务记录里说一声", "Say when it paused"), protocol.DoneClaimed))
	}
	if stage == "going" {
		hand.Plan.State = "going"
		g.Members = append(g.Members, protocol.GroupMember{TaskID: "t2"}, protocol.GroupMember{TaskID: "t3"}, protocol.GroupMember{Key: "h1", Title: w("第一次就能提炼成功", "Succeed on the first try")}, protocol.GroupMember{Key: "h2", Title: w("暂停时在任务记录里说一声", "Say when it paused")})
		tasks = append(tasks, card("t2", w("失败时退一步，并重试一次", "Step back on failure, and retry once"), protocol.Working), card("t3", w("长对话的组包变快", "Faster packets on long threads"), protocol.Working))
	}
	return &protocol.OnHand{Tasks: tasks, Groups: []protocol.TaskGroup{g}}
}

func planDecisionEvent(lang i18n.Lang) protocol.LogEvent {
	w := todoWords(lang)
	subj := w("记忆提炼", "Distillation")
	return ev("channel", protocol.KindDecision, protocol.Decision{DecisionID: "dplan", Question: w("记忆提炼：方案", "Distillation: the plan"), GoLabel: w("照这个做", "Go with this"), DefaultOption: "hold",
		Src: &protocol.SourceAsk{Kind: "plan", Item: protocol.SourceItemRef{Source: "src_gh", Kind: "github", Ref: "acme/mem#412", Label: "#412", Title: "x"}, GroupID: "g1", Group: subj, Plan: memPlan(lang)}})
}

// convApp is the conversation through the set card (and, with plan, the plan card).
func convApp(t *testing.T, lang i18n.Lang, w, h int, stage string) (*App, *[]any, *ui.Tester) {
	app, sent, tt := todoApp(t, lang, w, h)
	app.S.PersonaName = todoWords(lang)("小鸭", "Duckie")
	words := todoWords(lang)
	evs := []protocol.LogEvent{
		ev("channel", protocol.KindUserMsg, protocol.UserMsg{Text: words("把 memory distill 相关的拉出来我们看看", "Pull out everything about memory distill so we can look")}),
		ev("channel", protocol.KindAIMsg, protocol.AIMsg{Text: words("找到 9 个讲记忆提炼的。能直接交给我的 6 个先勾上了；#405 要你定一下；两个改动大，先放着。", "9 are about memory distillation. I ticked the 6 I can take now; #405 needs your call; two are big, so they wait.")}),
	}
	gid := ""
	if stage == "plan" {
		gid = "g1"
	}
	evs = append(evs, setEvent(lang, ""))
	if stage == "plan" {
		evs = append(evs,
			ev("channel", protocol.KindUserMsg, protocol.UserMsg{Text: words("就这几个，#405 也加上，按你的建议。先别动数据库迁移，验证都去 haswell 上跑。", "Just these, plus #405 your way. Leave the database migrations alone and run every check on haswell.")}),
			setEvent(lang, gid),
			ev("channel", protocol.KindAIMsg, protocol.AIMsg{Text: words("好，我先看一遍，出个方案给你，你点头再做。", "OK. I'll read them first and show you a plan; nothing starts until you say so.")}),
			planDecisionEvent(lang))
		app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: planOnHand(lang, "plan")})
	}
	app.Receive(protocol.ServerFrame{T: "events", Events: evs})
	app.Route = RouteConversation
	todoFrames(tt, 4)
	return app, sent, tt
}

// The set card: its subject, rows to tick, n more, and the way to the sheet.
func TestSetCardOpensTheSheet(t *testing.T) {
	app, sent, tt := convApp(t, i18n.ZH, 1180, 1000, "")
	all := strings.Join(tt.Texts(), " | ")
	for _, want := range []string{"记忆提炼", "9 个", "#412", "还有 5 个", "交给小鸭这 6 个…", "也可以直接说怎么做"} {
		if !strings.Contains(all, want) {
			t.Fatalf("missing %q in %s", want, all)
		}
	}
	if err := tt.Click("Distillation: fall back to a smaller result instead of failing"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if err := tt.Click("交给小鸭这 5 个…"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	r, ok := lastSent[protocol.PileFindReq](*sent)
	if !ok || r.SetID != "set_1" || !app.ho.open || app.ho.ticked["acme/mem#412"] {
		t.Fatalf("the set's sheet: %+v %+v", r, app.ho.ticked)
	}
}

// The plan card: what it read, the parts in the shapes' words, the limits
// apart, a note on a part; 照这个做 sends plan_answer with the note.
func TestPlanCardGoesWithNotes(t *testing.T) {
	app, sent, tt := convApp(t, i18n.ZH, 1180, 1800, "plan")
	all := strings.Join(tt.Texts(), " | ")
	for _, want := range []string{"记忆提炼：方案", "看了这 7 个和 acme/mem 的代码", "已经修好了，只差关掉", "在 PR #360 里已经修好了", "合成一个任务做", "#398 + #412 + #405", "一个做完接下一个", "#377", "都在 haswell 上验证", "不动数据库迁移", "照这个做", "先等等", "回复…", "交给小鸭了"} {
		if !strings.Contains(all, want) {
			t.Fatalf("missing %q in %s", want, all)
		}
	}
	app.planNotesOf("dplan")["p2"] = "组包别改公开接口"
	if err := tt.Click("照这个做"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	r, ok := lastSent[protocol.PlanAnswerReq](*sent)
	if !ok || r.GroupID != "g1" || r.Option != "go" || r.Notes["p2"] != "组包别改公开接口" {
		t.Fatalf("plan_answer: %+v", r)
	}
	// Reply goes to the plan's task with its words.
	app.S.Decisions["dplan"].Pending = ""
	tt.Frame()
	if err := tt.Click("回复…"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	*app.planReply["dplan"] = "#412 单独做"
	if err := tt.Click("发给它"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if r, _ := lastSent[protocol.PlanAnswerReq](*sent); r.Option != "reply" || r.Text != "#412 单独做" {
		t.Fatalf("reply: %+v", r)
	}
}

// The group card: where it stands, the plan inside; a done group offers 一起过目,
// whose sheet sends every kept comment behind one Go.
func TestGroupCardPlanAndReviewTogether(t *testing.T) {
	app, sent, tt := todoApp(t, i18n.ZH, 1280, 1800)
	app.S.PersonaName = "小鸭"
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{planDecisionEvent(i18n.ZH)}})
	app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: planOnHand(i18n.ZH, "plan")})
	app.Route = RouteOnHand
	todoFrames(tt, 4)
	all := strings.Join(tt.Texts(), " | ")
	for _, want := range []string{"记忆提炼", "方案好了，等你点头", "haswell", "Codex", "照这个做", "看方案"} {
		if !strings.Contains(all, want) {
			t.Fatalf("missing %q in %s", want, all)
		}
	}
	// The plan itself lives only in the conversation; the plan task is never a part.
	for _, not := range []string{"已经修好了，只差关掉", "#398 + #412 + #405", "件里做完"} {
		if strings.Contains(all, not) {
			t.Fatalf("On hand shows %q: %s", not, all)
		}
	}
	// Go from On hand.
	if err := tt.Click("照这个做"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if r, ok := lastSent[protocol.PlanAnswerReq](*sent); !ok || r.Option != "go" || r.GroupID != "g1" {
		t.Fatalf("plan_answer from On hand: %+v", r)
	}
	app.S.Decisions["dplan"].Pending = ""
	tt.Frame()
	// 看方案: to the conversation, the plan card found there.
	if err := tt.Click("看方案"); err != nil {
		t.Fatal(err)
	}
	todoFrames(tt, 2)
	if app.Route != RouteConversation || app.rp.found.seq != app.S.Decisions["dplan"].Seq {
		t.Fatalf("看方案 didn't find the plan: route %v found %d", app.Route, app.rp.found.seq)
	}
	app.Route = RouteOnHand
	app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: planOnHand(i18n.ZH, "going")})
	todoFrames(tt, 3)
	// D430: nothing done yet, no count (the beads say it); four parts, the plan none of them.
	if bgs := app.boardGroups(app.S.Board()); len(bgs) != 1 || len(bgs[0].rows) != 4 || bgs[0].done != 0 {
		t.Fatalf("going: the plan counted as a part: %+v", bgs)
	}
	app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: planOnHand(i18n.ZH, "review")})
	todoFrames(tt, 3)
	if bgs := app.boardGroups(app.S.Board()); len(bgs) != 1 || len(bgs[0].rows) != 4 || bgs[0].done != 4 {
		t.Fatalf("review: %+v", bgs)
	}
	if err := tt.Click("一起过目"); err != nil {
		t.Fatalf("%v: %s", err, strings.Join(tt.Texts(), " | "))
	}
	tt.Frame()
	r, ok := lastSent[protocol.GroupReviewReq](*sent)
	if !ok || r.GroupID != "g1" {
		t.Fatalf("group_review: %+v", *sent)
	}
	app.Receive(protocol.ServerFrame{T: "group_review_result", Sources: &protocol.SourcesFrame{ClientID: r.ClientID, PileOp: "group_review_read", Review: memReview(i18n.ZH)}})
	todoFrames(tt, 3)
	all = strings.Join(tt.Texts(), " | ")
	for _, want := range []string{"一起过目", "3 个 PR 等你合并", "1 个本来就修好了", "PR #420", "检查都过了", "1 项没过", "+212", "会留一句", "不留这条", "在这 6 个下面留言", "#351 留言后关掉"} {
		if !strings.Contains(all, want) {
			t.Fatalf("missing %q in %s", want, all)
		}
	}
	app.rv.dropped["acme/mem#340"] = true
	tt.Frame()
	if err := tt.Click("在这 5 个下面留言"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	s, ok := lastSent[protocol.GroupReviewSendReq](*sent)
	if !ok || len(s.Keep) != 5 {
		t.Fatalf("group_review_send: %+v", s)
	}
	for _, k := range s.Keep {
		if k == "acme/mem#340" {
			t.Fatalf("a dropped one went: %+v", s)
		}
	}
}

func memReview(lang i18n.Lang) *protocol.GroupReview {
	w := todoWords(lang)
	ref := func(n int) protocol.SourceItemRef {
		return protocol.SourceItemRef{Source: "src_gh", Kind: "github", Ref: fmt.Sprintf("acme/mem#%d", n), Label: fmt.Sprintf("#%d", n), Where: "acme/mem", Title: "x"}
	}
	pr := func(n int) *protocol.ReviewPR {
		return &protocol.ReviewPR{URL: fmt.Sprintf("https://github.com/acme/mem/pull/%d", n), Label: fmt.Sprintf("PR #%d", n)}
	}
	return &protocol.GroupReview{GroupID: "g1", Name: w("记忆提炼", "Distillation"), PRs: 3, Fixed: 1, Rows: []protocol.ReviewRow{
		{TaskID: "t2", Items: []protocol.SourceItemRef{ref(398), ref(412), ref(405)}, PR: pr(420), Checks: &protocol.ReviewChecks{State: "passed"}, Size: &protocol.ReviewSize{Added: 212, Removed: 40}, Result: w("失败时退回只用结构化结果，并重试一次；在 haswell 上跑过测试。", "On failure it falls back to the structured result and retries once; tests run on haswell."), Comment: "Fixed in #420: distillation now degrades to the structured result and retries once."},
		{TaskID: "t3", Items: []protocol.SourceItemRef{ref(377)}, PR: pr(421), Checks: &protocol.ReviewChecks{State: "passed"}, Size: &protocol.ReviewSize{Added: 96, Removed: 71}, Result: w("组包改成按消息数线性增长；加了一个长对话的性能测试。", "Packet assembly now grows linearly with messages; a long-thread speed test added."), Comment: "Fixed in #421: packet assembly is linear in the number of messages now."},
		{TaskID: "t4", Items: []protocol.SourceItemRef{ref(340)}, PR: pr(422), Checks: &protocol.ReviewChecks{State: "failed", Failed: 1}, Size: &protocol.ReviewSize{Added: 58, Removed: 12}, Result: w("第一次提交前先检查每一条；Windows 的检查没过，看起来跟这次改动无关。", "Each proposal is checked before the first try; the Windows check failed and looks unrelated."), Comment: "Fixed in #422: per-proposal fields are checked before the first attempt."},
		{Items: []protocol.SourceItemRef{ref(351)}, FixedIn: "#360", Comment: "This was fixed in #360 (merged). Closing.", Close: true},
	}}
}

// ---------- shots ----------

// Pictures for review (D75: outside git):
//
//	DUCTER_SHOTS_DIR=/Users/weyl/dev/ducter/.shots/handover-build go test ./internal/views -run HandoverShots
func TestHandoverShots(t *testing.T) {
	if os.Getenv("DUCTER_SHOTS_DIR") == "" {
		t.Skip("DUCTER_SHOTS_DIR not set")
	}
	dir := shotsDir(t)
	save := func(tt *ui.Tester, name string, lang i18n.Lang, dark bool) {
		paper := "light"
		if dark {
			paper = "dark"
		}
		todoFrames(tt, 6)
		f, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-%s-%s-%s.png", name, strings.ToLower(string(lang)), paper)))
		if err != nil {
			t.Fatal(err)
		}
		if err := png.Encode(f, tt.Image()); err != nil {
			t.Fatal(err)
		}
		f.Close()
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, dark := range []bool{false, true} {
			// The pile with 讲的是.
			{
				app, _, tt := todoApp(t, lang, 1280, 2100)
				tt.SetDark(dark)
				app.S.PersonaName = todoWords(lang)("小鸭", "Duckie")
				app.Receive(pileFrameSubjects(lang))
				app.Route = RouteOnHand
				save(tt, "10-pile-subjects", lang, dark)
			}
			// The sheet: find, the note, how; and the narrow second step.
			{
				app, _, tt := handApp(t, lang, 1400, 1000, memNote(lang))
				tt.SetDark(dark)
				app.ho.notes["acme/mem#405"] = todoWords(lang)("按你的建议：失败后给一次有限的重试。", "As you suggest: one bounded retry after a failure.")
				save(tt, "20-sheet", lang, dark)
				app.ho.query = "memory distill"
				app.ho.sentQuery = "memory distill"
				save(tt, "21-sheet-find", lang, dark)
			}
			{
				app, _, tt := handApp(t, lang, 760, 1000, memNote(lang))
				tt.SetDark(dark)
				save(tt, "22-sheet-narrow-what", lang, dark)
				app.ho.step = 1
				save(tt, "23-sheet-narrow-how", lang, dark)
			}
			// The conversation: the set card, then the plan card.
			{
				_, _, tt := convApp(t, lang, 1180, 1000, "")
				tt.SetDark(dark)
				save(tt, "30-set-card", lang, dark)
			}
			{
				_, _, tt := convApp(t, lang, 1180, 1500, "plan")
				tt.SetDark(dark)
				save(tt, "40-plan-card", lang, dark)
			}
			// On hand: the group with its plan, then review together.
			{
				app, _, tt := todoApp(t, lang, 1280, 1500)
				tt.SetDark(dark)
				app.S.PersonaName = todoWords(lang)("小鸭", "Duckie")
				app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{planDecisionEvent(lang)}})
				app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: planOnHand(lang, "plan")})
				app.Route = RouteOnHand
				save(tt, "41-group-plan", lang, dark)
				app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: planOnHand(lang, "going")})
				save(tt, "42-group-going", lang, dark)
				app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: planOnHand(lang, "review")})
				save(tt, "50-group-review", lang, dark)
				app.openReview("g1")
				app.rv.got, app.rv.review = true, memReview(lang)
				app.rv.dropped[rowKey(memReview(lang).Rows[2])] = true
				save(tt, "51-review-sheet", lang, dark)
			}
		}
	}
}
