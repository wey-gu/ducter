package views

import (
	"testing"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
)

// D404: an expiry typed without a slash, as on a number pad, reads the same.
func TestParseExpD404(t *testing.T) {
	cases := []struct {
		in     string
		mm, yy int
		ok     bool
	}{
		{"08/29", 8, 29, true},
		{"0829", 8, 29, true},
		{"829", 8, 29, true},
		{"08 29", 8, 29, true},
		{"8/2029", 8, 2029, true},
		{"13/29", 13, 29, false},
		{"0/29", 0, 29, false},
		{"0", 0, 0, false},
	}
	for _, c := range cases {
		mm, yy, ok := parseExp(c.in)
		if ok != c.ok || (ok && (mm != c.mm || yy != c.yy)) {
			t.Errorf("parseExp(%q) = %d, %d, %v; want %d, %d, %v", c.in, mm, yy, ok, c.mm, c.yy, c.ok)
		}
	}
}

// D408: the Mac's expiry takes its slash as it is typed, as the web's does
// (D404), and the caret stays at the end of what was typed.
func TestShapeExpD408(t *testing.T) {
	for in, want := range map[string]string{"0829": "08/29", "829": "08/29", "1229": "12/29", "129": "129", "08": "08", "8": "8", "082": "082", "08/29": "08/29", "08/2": "08/2", "12345": "12345"} {
		if got := shapeExp(in); got != want {
			t.Errorf("shapeExp(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestExpiryShapesAsTyped(t *testing.T) {
	for _, typed := range []string{"0829", "829"} {
		app, _, tt := autofillApp(t, i18n.EN, 1500)
		if err := tt.Click("Add a card"); err != nil {
			t.Fatal(err)
		}
		tt.Frame()
		f, ok := tt.AccessByRole(ui.RoleTextField, "Expiry (MM/YY)")
		if !ok {
			t.Fatal("no expiry field")
		}
		tt.ClickAt(f.Bounds.X+f.Bounds.W/2, f.Bounds.Y+f.Bounds.H/2)
		tt.Frame()
		for _, r := range typed {
			tt.TypeKey(0, ui.KeyUnknown, string(r))
			tt.Frame()
		}
		tt.Frame()
		if app.af.exp != "08/29" {
			t.Fatalf("typed %s: the field reads %q, want 08/29", typed, app.af.exp)
		}
		if f, _ := tt.AccessByRole(ui.RoleTextField, "Expiry (MM/YY)"); f.Value != "08/29" {
			t.Errorf("typed %s: the field shows %q", typed, f.Value)
		}
		// The caret is at the end: a backspace takes the last digit.
		tt.Key(0, ui.KeyBackspace)
		tt.Frame()
		tt.Frame()
		if app.af.exp != "08/2" {
			t.Errorf("typed %s then backspace: %q, want 08/2 (the caret wasn't at the end)", typed, app.af.exp)
		}
	}
}

// D408: a key typed into a Mac field types once. A keyboard sends the key
// down, its text (insertText:, as Cocoa's input methods answer it), then
// the key up; a field that took both the key and the text would type twice
// (the Mac walk of 0.0.99 saw cua-driver's typing doubled). It doesn't:
// the doubling was the driver's AX insert plus its CGEvent fallback.
func TestKeysTypeOnceInFields(t *testing.T) {
	type field struct {
		name string
		got  func(app *App) string
	}
	typeInto := func(t *testing.T, app *App, tt *ui.Tester, f field, s string) {
		t.Helper()
		a, ok := tt.AccessByRole(ui.RoleTextField, f.name)
		if !ok {
			t.Fatalf("no field %q", f.name)
		}
		tt.ClickAt(a.Bounds.X+a.Bounds.W/2, a.Bounds.Y+a.Bounds.H/2)
		tt.Frame()
		for _, r := range s {
			tt.TypeKey(0, ui.KeyUnknown, string(r))
			tt.Frame()
		}
		if got := f.got(app); got != s {
			t.Errorf("%q: typed %q, the field holds %q", f.name, s, got)
		}
	}
	app, _, tt := autofillApp(t, i18n.EN, 1500)
	if err := tt.Click("Add a sign-in"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	typeInto(t, app, tt, field{"Site", func(a *App) string { return a.af.site }}, "github.com")
	typeInto(t, app, tt, field{"User name or email", func(a *App) string { return a.af.user }}, "wey@example.com")

	// The composer, in Chinese through an input method: composed, then committed once.
	app, _ = iaApp(t, i18n.ZH)
	app.Route = RouteConversation
	tt = ui.NewTesterWith(app.View, 1280, 860, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	tt.Compose("dui", 3)
	tt.Frame()
	tt.Type("对话")
	tt.Frame()
	tt.TypeKey(0, ui.KeyUnknown, "a")
	tt.Frame()
	if app.draft != "对话a" {
		t.Errorf("the composer holds %q, want 对话a", app.draft)
	}
}

// D404: a failed connect in the home's own English words is said in the person's language.
func TestFailedDetailsSaidD404(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		L := i18n.New(lang)
		for detail, key := range failedDetails {
			if got := L.T(key); got == key || got == "" {
				t.Errorf("%s: %q has no words for %q", lang, key, detail)
			}
		}
	}
}
