package views

import (
	"go/ast"
	"go/parser"
	"go/token"
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
	"buttonFor": true, "iconButton": true, "navButton": true, "quietButton": true, "quietLink": true,
	// switches, choices and rows (shared.go, partner.go, settings.go)
	"switchControl": true, "choices": true, "selectRow": true, "disclosureRow": true, "linkRow": true,
	"dangerText": true, "moreButton": true, "candRow": true, "railTab": true,
	// the D161 pieces: the renamable name, coins, chips, the list's rows
	"cardName": true, "coinTile": true, "socketTile": true, "abilityChip": true, "listRow": true, "trayToken": true,
}

// controlFiles are the cards and settings pages the rule covers.
var controlFiles = []string{
	"devicecard.go", "devupdate.go", "computers.go", "sites.go", "abilities.go", "agentversion.go",
	"settings.go", "settings_panels.go", "settings_update.go", "partner.go", "loadout.go", "whereswitch.go", "shared.go",
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
	sort.Strings(bad)
	if len(bad) > 0 {
		t.Fatalf("a control drawn outside the shared set (design/ui.md \"Shared controls\"):\n%s", strings.Join(bad, "\n"))
	}
}
