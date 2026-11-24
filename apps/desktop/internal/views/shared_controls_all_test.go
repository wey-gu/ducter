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
)

// D519: deny by default. TestSharedControlsOnly covered a list of views, so
// a new one (a Keep's page) drew its own 「说」 button and passed. Every
// view file is covered now: a control is drawn only by a function of the
// shared set, or in a file that defines the set. A new view is covered the
// moment it exists.
var defineFiles = map[string]string{
	"components.go": "defines the button family and the notices",
	"quiet.go":      "defines the quiet text button and link, and the drawn chevron",
	"shared.go":     "defines the D161 rows, switches, pills and chips",
	"menu.go":       "defines the one clay menu (D421)",
	"composer.go":   "defines the one composer and its send, the section head, the tag, the time column and a menu's opener (D519)",
}

// olderViews drew controls by hand before the rule. Each count is a ceiling
// that may only fall as the view moves onto the set; the trigger to empty
// the list is design/todo.md "D519: the raw controls left in older views".
var olderViews = map[string]int{
	"addfolder.go": 1, "apps.go": 2, "apps_shelf.go": 4, "appwin.go": 1, "autofill.go": 1, "away.go": 2, "benchlaunch.go": 1, "calendar.go": 1,
	"chrome.go": 2, "composertune.go": 4, "contextmeter.go": 1, "conversation.go": 2, "copy_d492.go": 1, "did.go": 2, "filecard.go": 1,
	"fileview.go": 4, "firstrun.go": 1, "firstwords.go": 1, "float.go": 2, "follow.go": 1, "handover.go": 10, "handover_cards.go": 1,
	"held.go": 2, "isles.go": 4, "keymap.go": 1, "lend.go": 2, "made.go": 2, "media.go": 5, "memory_pane.go": 1, "newtaskfind.go": 2,
	"ongoing.go": 4, "onhandboard.go": 3, "onhandrail.go": 1, "palette.go": 1, "partners.go": 3, "partners_list.go": 1, "past.go": 9,
	"past_where.go": 2, "pastoutside.go": 1, "peers_d470.go": 1, "pile.go": 1, "pins.go": 2, "reply.go": 2, "rich.go": 1,
	"settings_home.go": 2, "showall.go": 1, "subjects.go": 1, "task.go": 2, "taskinfo.go": 2, "taskpage.go": 3, "taskturns.go": 2,
	"todos.go": 1, "todos_onhand.go": 1, "voice.go": 2, "workbench.go": 4,
}

// The ceilings only fall: a view off the list, or under its count, is lowered here.
func TestOlderViewsOnlyShrink(t *testing.T) {
	got := rawControls(t)
	for name, max := range olderViews {
		if n := len(got[name]); n < max {
			t.Errorf("%s draws %d raw controls now, under its ceiling %d: lower it in olderViews", name, n, max)
		}
	}
}

// rawControls counts, per view file, the controls drawn outside the set.
func rawControls(t *testing.T) map[string][]string {
	files, err := filepath.Glob("*.go")
	if err != nil {
		t.Fatal(err)
	}
	fs := token.NewFileSet()
	out := map[string][]string{}
	for _, name := range files {
		if strings.HasSuffix(name, "_test.go") || defineFiles[name] != "" {
			continue
		}
		f, err := parser.ParseFile(fs, name, nil, 0)
		if err != nil {
			t.Fatal(err)
		}
		for _, decl := range f.Decls {
			fn, ok := decl.(*ast.FuncDecl)
			if !ok || fn.Body == nil || sharedControls[fn.Name.Name] {
				continue
			}
			ast.Inspect(fn.Body, func(n ast.Node) bool {
				if call, ok := n.(*ast.CallExpr); ok {
					if what := adHoc(call); what != "" {
						out[name] = append(out[name], fs.Position(call.Pos()).String()+": "+what+" in "+fn.Name.Name)
					}
				}
				return true
			})
		}
	}
	return out
}

func TestSharedControlsEverywhere(t *testing.T) {
	var bad []string
	for name, hits := range rawControls(t) {
		if len(hits) > olderViews[name] {
			bad = append(bad, hits...)
		}
	}
	if os.Getenv("DUCTER_COUNT_RAW") != "" {
		for name, hits := range rawControls(t) {
			t.Logf("%q: %d,", name, len(hits))
		}
	}
	sort.Strings(bad)
	if len(bad) > 0 {
		t.Fatalf("a control drawn outside the shared set (design/ui.md \"Shared controls\", D519 deny by default):\n%s", strings.Join(bad, "\n"))
	}
}

// The composer is drawn once: its send (the drawn arrow) only through
// sendButton, its card only through composerBox.
func TestOneComposer(t *testing.T) {
	files, _ := filepath.Glob("*.go")
	var bad []string
	for _, name := range files {
		if strings.HasSuffix(name, "_test.go") || name == "composer.go" {
			continue
		}
		b, err := os.ReadFile(name)
		if err != nil {
			t.Fatal(err)
		}
		for _, w := range []string{"drawSend", "keep.talk.send", "ui.TextInput(c.Key(\"talk"} {
			if strings.Contains(string(b), w) {
				bad = append(bad, name+": "+w)
			}
		}
	}
	if len(bad) > 0 {
		t.Fatalf("a composer or send drawn outside composer.go:\n%s", strings.Join(bad, "\n"))
	}
}
