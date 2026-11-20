package views

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
)

// D421: one menu. Every menu in the views is the clay one (menu.go); a raw
// MyGo menu (the system's grey NSMenu, or a drawn one in MyGo's own look)
// anywhere else fails here. The menu bar and the menu bar extra (main.go,
// outside the views) stay the system's.
func TestMenusGoThroughTheClayMenu(t *testing.T) {
	raw := regexp.MustCompile(`\.(Menu|ContextMenu|PopoverMenu|PopoverMenuButton)\(func\(|\.(PopoverMenu|PopoverMenuButton)\(|ui\.(MenuBase|ContextMenuBase|MenuButton|PopoverMenuButton|SplitButton)\(`)
	files, _ := filepath.Glob("*.go")
	for _, f := range files {
		if strings.HasSuffix(f, "_test.go") || f == "menu.go" {
			continue
		}
		b, err := os.ReadFile(f)
		if err != nil {
			t.Fatal(err)
		}
		for i, line := range strings.Split(string(b), "\n") {
			if strings.HasPrefix(strings.TrimSpace(line), "//") {
				continue
			}
			if raw.MatchString(line) {
				t.Errorf("%s:%d builds a menu of its own: use a.menuButton or a.contextMenu (menu.go, D421)\n\t%s", f, i+1, strings.TrimSpace(line))
			}
		}
	}
}

// The clay menu draws in the window, has its keys, says Danger, and
// sizes to its labels.
func TestClayMenuKeysAndLook(t *testing.T) {
	app, _ := shelfApp(t, i18n.ZH, shelfFixture(i18n.ZH), nil)
	app.OpenApps()
	tt := shelfTester(app, 1280)
	if err := tt.Click(app.L.T("apps.more", "北京出差 11/20–21")); err != nil {
		t.Fatal(err)
	}
	if got := tt.Menu(); len(got) == 0 || got[0] != "改名" {
		t.Fatalf("menu %q", got)
	}
	// Drawn in the window: its rows are elements, read as menu items.
	n := 0
	for _, x := range tt.AccessAll() {
		if x.Role == ui.RoleMenuItem {
			n++
			if x.Name == "让 Ducter 改…" && strings.Contains(x.Name, "⁠") {
				t.Errorf("a joiner in %q", x.Name)
			}
		}
	}
	if n < 4 {
		t.Fatalf("%d menu items drawn; the menu isn't the clay one", n)
	}
	// Down highlights the first item, Enter chooses it: rename.
	tt.Key(0, ui.KeyDown)
	tt.Key(0, ui.KeyEnter)
	tt.Frame()
	if app.shelf.renaming != "a1b2c3" {
		t.Errorf("Down, Enter didn't rename: %q", app.shelf.renaming)
	}
	// Escape closes it.
	_ = tt.Click(app.L.T("apps.more", "读书打卡"))
	tt.Key(0, ui.KeyEscape)
	tt.Frame()
	if tt.Menu() != nil {
		t.Errorf("Escape left the menu open: %q", tt.Menu())
	}
}
