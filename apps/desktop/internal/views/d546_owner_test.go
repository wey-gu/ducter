package views

import (
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// d546Partners is the author's home: four partners, 小玛 shown.
func d546Partners(a *App, shown string) {
	a.Receive(protocol.ServerFrame{T: "partners", Shown: shown, Partners: []protocol.PartnerInfo{
		{ID: "default", Name: "Ducter", Look: "sand"},
		{ID: "p2", Name: "小家", Look: "sage"},
		{ID: "p3", Name: "多比", Look: "sky"},
		{ID: "p4", Name: "小玛", Look: "plum"},
	}})
	a.S.Persona = shown
	for _, p := range a.S.Partners {
		if p.ID == shown {
			a.S.PersonaName = p.Name
		}
	}
}

// d546Card gives the fixture's task its On hand card, opened by persona.
func d546Card(f *ascFixture, persona string) *store.Task {
	f.app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Tasks: []protocol.TaskCard{{
		TaskID: "t_asc", Persona: persona, Title: "App Store Connect", Harness: "codex", Attention: protocol.Working,
		OpenedAt: "2026-11-24T01:00:00Z", UpdatedAt: "2026-11-24T01:30:00Z", Place: protocol.Place{Kind: "none"},
	}}}})
	return f.app.S.Task("t_asc")
}

func accessNames(f *ascFixture) []string {
	var out []string
	for _, x := range f.tt.AccessAll() {
		out = append(out, x.Name)
	}
	return out
}

func hasName(names []string, want string) bool {
	for _, n := range names {
		if n == want {
			return true
		}
	}
	return false
}

// D546: a task Ducter opened is Ducter's while 小玛 is shown: its head's
// mark is in Ducter's clay and says Ducter, its brief is 「Ducter 交给它的事」;
// a task 多比 opened says 多比 and is in 多比's clay. Never the shown one's.
func TestD546TaskShowsItsOwnerWhileAnotherIsShown(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		f := appStoreTask(t, lang, true)
		d546Partners(f.app, "p4")
		task := d546Card(f, "default")
		if f.app.shownLook() != "plum" || f.app.taskLook(task) != "sand" || f.app.taskName(task) != "Ducter" {
			t.Fatalf("%s: shown %q, the task's clay %q name %q", lang, f.app.shownLook(), f.app.taskLook(task), f.app.taskName(task))
		}
		f.app.OpenTask("t_asc")
		openStretches(f.app, "t_asc")
		f.tt.Frame()
		f.tt.Frame()
		all := texts(f.tt)
		mine, shown := f.app.L.T("task.asked", "Ducter"), f.app.L.T("task.asked", "小玛")
		if !strings.Contains(all, mine) || strings.Contains(all, shown) {
			t.Errorf("%s: the brief's label is not the owner's (%q, never %q): %q", lang, mine, shown, all)
		}
		face := f.app.L.T(presenceLabel[taskPresence(task)], "Ducter")
		names := accessNames(f)
		if !hasName(names, face) {
			t.Errorf("%s: the head's mark is not named for its owner %q: %q", lang, face, names)
		}
		if hasName(names, f.app.L.T(presenceLabel[taskPresence(task)], "小玛")) {
			t.Errorf("%s: the head's mark is named for the shown partner", lang)
		}
		// Another partner's task: its name and clay.
		task = d546Card(f, "p3")
		f.tt.Frame()
		f.tt.Frame()
		all = texts(f.tt)
		if !strings.Contains(all, f.app.L.T("task.asked", "多比")) {
			t.Errorf("%s: 多比's task doesn't say 多比: %q", lang, all)
		}
		if f.app.taskLook(task) != "sky" {
			t.Errorf("%s: 多比's task is in %q", lang, f.app.taskLook(task))
		}
		// On hand: its row carries 多比's mark.
		f.app.Route = RouteOnHand
		f.tt.Frame()
		f.tt.Frame()
		if _, ok := f.tt.Find("多比"); !ok && !hasName(accessNames(f), "多比") {
			t.Errorf("%s: On hand's row has no 多比 mark", lang)
		}
		// A report the task sent says whose partner it told.
		if got := f.app.reportLabel(task, &protocol.Report{State: "done"}); !strings.Contains(got, "多比") {
			t.Errorf("%s: the report's label %q", lang, got)
		}
		if got := f.app.promptLine(task, &Block{K: "told", Say: "other"}); !strings.Contains(got, "多比") {
			t.Errorf("%s: told.other %q", lang, got)
		}
	}
}

// D546: a Keep, a routine, a group and a wait carry their owners too.
func TestD546OwnedObjectsCarryTheirOwner(t *testing.T) {
	f := appStoreTask(t, i18n.ZH, true)
	d546Partners(f.app, "p4")
	if got := f.app.ownerName("p2"); got != "小家" {
		t.Errorf("p2's name %q", got)
	}
	if got := f.app.ownerName(""); got != "Ducter" {
		t.Errorf("no persona is the default's: %q", got)
	}
	if got := f.app.ownerName("gone"); got != "Ducter" {
		t.Errorf("a partner gone is the default's: %q", got)
	}
	if got := f.app.ownerLook("gone"); got != "sand" {
		t.Errorf("a partner gone is in the default's clay: %q", got)
	}
	if got := f.app.pausedWhy(&protocol.Routine{Persona: "p2", PausedBy: "partner"}); !strings.Contains(got, "小家") {
		t.Errorf("the routine's pause %q", got)
	}
	if got := f.app.waitPartner(&protocol.Waiter{WaiterID: "w1", Persona: "p2"}); got != "p2" {
		t.Errorf("a wait 小家 set: %q", got)
	}
	if got := f.app.waitPartner(&protocol.Waiter{WaiterID: "w2", TaskID: "t_asc"}); got != f.app.taskPartner(f.app.S.Task("t_asc")) {
		t.Errorf("a task's wait is its task's: %q", got)
	}
}

// D546: with one partner nothing changes: the art as drawn, and the name the
// default partner's own (the one it was given, which may not be Ducter).
func TestD546OnePartnerUnchanged(t *testing.T) {
	f := appStoreTask(t, i18n.ZH, true)
	task := f.app.S.Task("t_asc")
	if f.app.taskLook(task) != "" || f.app.ownerLook("default") != "" {
		t.Errorf("one partner: a clay %q", f.app.taskLook(task))
	}
	f.app.OpenTask("t_asc")
	openStretches(f.app, "t_asc")
	f.tt.Frame()
	f.tt.Frame()
	if !strings.Contains(texts(f.tt), "Ducter 交给它的事") {
		t.Errorf("one partner: the brief's label changed: %q", texts(f.tt))
	}
	f.app.Receive(protocol.ServerFrame{T: "partners", Shown: "default", Partners: []protocol.PartnerInfo{{ID: "default", Name: "阿福", Look: "sage"}}})
	if got := f.app.taskName(task); got != "阿福" {
		t.Errorf("one partner named 阿福: %q", got)
	}
	if got := f.app.taskLook(task); got != "" {
		t.Errorf("one partner: the art as drawn, got %q", got)
	}
}

// D546 guard: the renderers of what a partner owns (On hand's rows and
// cards, Keeps, groups, the opened task, its transcript and waits, Past,
// Made, Did, Find) never reach for the shown partner: not its name
// (a.S.PersonaName), its clay (a.shownLook, a.shownPartner) nor the art that
// draws in it (theme.Face, theme.Art, a.partnerFace, a.avatar, faceBlink,
// stillFace). They take the owner's: ownerFace, ownerLook, ownerName,
// taskLook, taskName, theme.FaceAs. A use that is truly the page's own
// figure, or the shown conversation's own question, is listed below with why.
func TestD546NoShownPartnerInOwnedRenderers(t *testing.T) {
	files := []string{
		"onhand.go", "onhandlist.go", "onhandrail.go", "onhandhead.go", "onhandbrief.go",
		"keeps.go", "keeps_card.go", "groups.go",
		"task.go", "taskpage.go", "taskturns.go", "taskrows.go", "work.go",
		"needsyou.go", "handover.go", "past.go", "made.go", "did.go", "session.go", "palette.go", "finds.go",
	}
	allowed := map[string]string{
		"onhand.go:onHand":              "the empty board's own figure, and its line names the shown conversation to say it in",
		"onhand.go:partnerDecisionCard": "the shown conversation's own question (another partner's are otherAskRow, with its own stone)",
		"onhandhead.go:boardHead":       "On hand's own figure (the page's), its mood across the board",
		"onhandbrief.go:brief":          "On hand's own figure (the page's), its mood across the board",
		"did.go:didEmptyDay":            "Did for you's empty day: the page's own figure",
	}
	bad := map[string]bool{"Face": true, "Art": true, "FaceClosed": true, "ArtClosed": true}
	appBad := map[string]bool{"shownLook": true, "shownPartner": true, "partnerFace": true, "partnerFaceIn": true, "avatar": true}
	var found []string
	fs := token.NewFileSet()
	for _, name := range files {
		if _, err := os.Stat(name); err != nil {
			continue
		}
		file, err := parser.ParseFile(fs, filepath.Clean(name), nil, 0)
		if err != nil {
			t.Fatal(err)
		}
		for _, d := range file.Decls {
			fn, ok := d.(*ast.FuncDecl)
			if !ok || fn.Body == nil {
				continue
			}
			where := name + ":" + fn.Name.Name
			ast.Inspect(fn.Body, func(n ast.Node) bool {
				switch x := n.(type) {
				case *ast.SelectorExpr:
					if id, ok := x.X.(*ast.Ident); ok && id.Name == "theme" && bad[x.Sel.Name] {
						found = append(found, where+" theme."+x.Sel.Name)
					}
					if id, ok := x.X.(*ast.Ident); ok && id.Name == "a" && appBad[x.Sel.Name] {
						found = append(found, where+" a."+x.Sel.Name)
					}
					if x.Sel.Name == "PersonaName" {
						if s, ok := x.X.(*ast.SelectorExpr); ok && s.Sel.Name == "S" {
							found = append(found, where+" a.S.PersonaName")
						}
					}
				case *ast.CallExpr:
					if id, ok := x.Fun.(*ast.Ident); ok && (id.Name == "faceBlink" || id.Name == "stillFace" || id.Name == "squareBlink") {
						found = append(found, where+" "+id.Name)
					}
				}
				return true
			})
		}
	}
	var offenders []string
	used := map[string]bool{}
	for _, f := range found {
		at := strings.SplitN(f, " ", 2)[0]
		if _, ok := allowed[at]; !ok {
			offenders = append(offenders, f)
		}
		used[at] = true
	}
	for at := range allowed {
		if !used[at] {
			t.Errorf("%s is allowed but no longer reaches for the shown partner: take it off the list", at)
		}
	}
	sort.Strings(offenders)
	if len(offenders) > 0 {
		t.Errorf("an owned object's renderer reaches for the shown partner (use its owner's: ownerFace, ownerLook, ownerName, taskLook, theme.FaceAs):\n  %s", strings.Join(offenders, "\n  "))
	}
}
