package views

import (
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"sort"
	"strings"
	"testing"
)

// The author's rule (D161): cards and settings use only the shared
// controls. A control (a button, a switch, a choice, a ⋯) is drawn by one
// of the functions below and nowhere else; design/ui.md "Shared controls"
// lists them. A new control is added there and here, never inline.
var sharedControls = map[string]bool{
	// the button family (components.go, quiet.go)
	"buttonFor": true, "busyButton": true, "iconButton": true, "iconButtonTip": true, "navButton": true, "quietButton": true, "quietLink": true,
	// switches, choices and rows (shared.go, partner.go, settings.go)
	"switchControl": true, "choices": true, "selectRow": true, "disclosureRow": true, "linkRow": true,
	"dangerText": true, "moreButton": true, "candRow": true, "railTab": true, "sideLink": true,
	"factPill": true, // D544: a task in rounds' line under the bar (shared.go)
	// the D161 pieces: the renamable name, coins, chips, the list's rows
	"cardName": true, "coinTile": true, "socketTile": true, "abilityChip": true, "listRow": true, "trayToken": true,
	// D166: an app a source can read, on the accounts card
	"appTile": true,
	// D545: the other partners' faces with what waits in them, the way back to a hidden list
	"othersStack": true,
	// D565: a partner's figure: the 3 × 2 picker and the six met when one is made (figures.go)
	"figurePick": true, "meetStage": true,
	// D185: a card's property that opens a list, and the list's rows (New task)
	"pill": true, "menuRow": true, "menuRowEl": true, "choice": true, "foldHead": true,
	// D289: a group's add row, and a destructive action before it is confirmed
	"addRow": true, "quietDanger": true, "openRow": true,
	// D296: a row that goes elsewhere with its tile
	"tileLinkRow": true,
	// D398: a card's foot that folds what can wait, and an optional step as a row
	"sheetFold": true, "extraStep": true,
	// D518: a step's number in a short numbered sequence
	"stepNumber": true,
	// D530: the opened task's steps: the work's head, a step's row, its object chip and its file chip
	"workHead": true, "stepLine": true, "stepChip": true, "fileChip": true,
	// D519: the one composer and its send, the section head, the tag, the time column, a menu's opener
	"composerBox": true, "sendButton": true, "secHead": true, "tag": true, "timeCol": true, "menuOpener": true,
	// D533: a rule row edited in place, a line of words, a number with its unit
	"editRow": true, "numberField": true,
	// D521: a quiet tray's dense row (the opened task's background work)
	"trayRow": true,
}

// controlFiles are the cards and settings pages the rule covers.
var controlFiles = []string{
	"devicecard.go", "devupdate.go", "computers.go", "sites.go", "abilities.go", "agentversion.go",
	"settings.go", "settings_panels.go", "settings_update.go", "partner.go", "loadout.go", "whereswitch.go", "shared.go", "memplugin.go",
	"accounts.go", "finds.go", "newtask.go", "newtaskwhere.go", "byproject.go", "phone.go", "chats.go", "imessage.go",
	"settings_rows.go", "ownphone.go", "devguard.go", "handset.go", "reach.go", "agentsetup.go", "components.go", "bgtray.go",
}

// adHoc reports a call that makes a control by hand.
func adHoc(call *ast.CallExpr) string {
	sel, ok := call.Fun.(*ast.SelectorExpr)
	if !ok {
		return ""
	}
	if x, ok := sel.X.(*ast.Ident); ok && x.Name == "ui" {
		switch sel.Sel.Name {
		case "ButtonBase", "Button", "Switch", "Checkbox", "Slider":
			return "ui." + sel.Sel.Name
		}
	}
	switch sel.Sel.Name {
	case "PopoverMenuButton":
		return "PopoverMenuButton"
	case "Role":
		if len(call.Args) == 1 {
			if r, ok := call.Args[0].(*ast.SelectorExpr); ok {
				switch r.Sel.Name {
				case "RoleButton", "RoleRadio", "RoleSwitch", "RoleCheckbox", "RoleTab", "RoleMenuItem":
					return "Role(" + r.Sel.Name + ")"
				}
			}
		}
	}
	return ""
}

func TestSharedControlsOnly(t *testing.T) {
	fs := token.NewFileSet()
	var bad []string
	for _, name := range controlFiles {
		f, err := parser.ParseFile(fs, name, nil, 0)
		if err != nil {
			t.Fatal(err)
		}
		for _, decl := range f.Decls {
			fn, ok := decl.(*ast.FuncDecl)
			if !ok || fn.Body == nil {
				continue
			}
			ast.Inspect(fn.Body, func(n ast.Node) bool {
				call, ok := n.(*ast.CallExpr)
				if !ok {
					return true
				}
				if what := adHoc(call); what != "" && !sharedControls[fn.Name.Name] {
					bad = append(bad, fs.Position(call.Pos()).String()+": "+what+" in "+fn.Name.Name)
				}
				return true
			})
		}
	}
	// design/ui.md lists the same set.
	ui, err := os.ReadFile("../../../../design/ui.md")
	if err != nil {
		t.Fatal(err)
	}
	for name := range sharedControls {
		if !strings.Contains(string(ui), "`"+name+"`") {
			bad = append(bad, "design/ui.md: "+name+" is not in Shared controls")
		}
	}
	sort.Strings(bad)
	if len(bad) > 0 {
		t.Fatalf("a control drawn outside the shared set (design/ui.md \"Shared controls\"):\n%s", strings.Join(bad, "\n"))
	}
}
