package views

import (
	"go/ast"
	"go/parser"
	"go/token"
	"testing"
)

// D167: Settings › 更新与关于 / Updates and about is built from shared pieces
// only. The author found a lone "在查…" left-aligned between the computers'
// rows and the night-time switch, part of no row: a label made on the spot.
// These functions may lay nothing out themselves (no ui.Text, ui.Row,
// ui.Column, ui.Box, …): every line is a component from settings.go,
// partner.go, quiet.go or devupdate.go, so a state can only show inside the
// row it belongs to. (Device cards have their own guard.)
func TestUpdatesAndAboutUseOnlySharedPieces(t *testing.T) {
	scope := map[string]map[string]bool{
		"settings_update.go": {"appUpdateSection": true},
		"devupdate.go":       {"updateSection": true, "versionRow": true},
	}
	for file, funcs := range scope {
		f, err := parser.ParseFile(token.NewFileSet(), file, nil, 0)
		if err != nil {
			t.Fatal(err)
		}
		found := 0
		for _, d := range f.Decls {
			fn, ok := d.(*ast.FuncDecl)
			if !ok || !funcs[fn.Name.Name] {
				continue
			}
			found++
			ast.Inspect(fn.Body, func(n ast.Node) bool {
				call, ok := n.(*ast.CallExpr)
				if !ok {
					return true
				}
				if sel, ok := call.Fun.(*ast.SelectorExpr); ok {
					if id, ok := sel.X.(*ast.Ident); ok && id.Name == "ui" {
						t.Errorf("%s: %s lays out ui.%s itself; use a shared piece (valueRow, sideStatus, sideLink, row, note, …)", file, fn.Name.Name, sel.Sel.Name)
					}
				}
				return true
			})
		}
		if found != len(funcs) {
			t.Fatalf("%s: found %d of %v; the guard follows them when they move", file, found, funcs)
		}
	}
}
