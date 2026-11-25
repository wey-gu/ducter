package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/egoist/mygo"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
	"github.com/wey-gu/ducter/apps/desktop/internal/views"
)

// D573's guard: the menu bar is the standard Mac one (design/ui.md
// "Platform conventions"), and every key a Mac user's hands know is on it,
// once. A menu or a key taken away fails here.
func TestStandardMenuBar(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		l := i18n.New(lang)
		app := views.New(store.New(), theme.Pebble(), l)
		menu := appMenu(app, l, nil, &lifecycle{l: l})
		top := menu.Items()
		// The menus, in the order every Mac app has them.
		var roles []string
		for _, it := range top {
			switch {
			case it.Role == mygo.RoleAppMenu:
				roles = append(roles, "app")
			case it.Role == mygo.RoleWindowMenu:
				roles = append(roles, "window")
			case it.Role == mygo.RoleHelp:
				roles = append(roles, "help")
			default:
				roles = append(roles, it.ID)
			}
		}
		if got, want := strings.Join(roles, " "), "app file edit view window help"; got != want {
			t.Errorf("%s: the menus are %q, want %q", lang, got, want)
		}
		// Every standard key, on one item each.
		keys := map[string]int{}
		var walk func([]*mygo.MenuItem)
		walk = func(items []*mygo.MenuItem) {
			for _, it := range items {
				if it.Accelerator != "" && !it.Hidden {
					keys[strings.Replace(it.Accelerator, "Cmd+", "CmdOrCtrl+", 1)]++
				}
				walk(it.Submenu)
			}
		}
		walk(top)
		for _, k := range []string{
			"CmdOrCtrl+,", "CmdOrCtrl+H", "Alt+CmdOrCtrl+H", "CmdOrCtrl+Q", // the app menu
			"CmdOrCtrl+N", "CmdOrCtrl+O", "CmdOrCtrl+K", "CmdOrCtrl+W", // File
			"CmdOrCtrl+Z", "Shift+CmdOrCtrl+Z", "CmdOrCtrl+X", "CmdOrCtrl+C", "CmdOrCtrl+V", "CmdOrCtrl+A", // Edit
			"CmdOrCtrl+F", "CmdOrCtrl+G", "CmdOrCtrl+Shift+G", // Edit › Find
			"CmdOrCtrl+[", "CmdOrCtrl+]", "CmdOrCtrl+0", "CmdOrCtrl+=", "CmdOrCtrl+-", "Ctrl+CmdOrCtrl+F", // View
			"CmdOrCtrl+1", "CmdOrCtrl+2", "CmdOrCtrl+3", "CmdOrCtrl+4", "CmdOrCtrl+5",
			"CmdOrCtrl+M", // Window
			"CmdOrCtrl+/", // Help › Keyboard Shortcuts
		} {
			if keys[k] != 1 {
				t.Errorf("%s: %s is on %d menu items, want 1", lang, k, keys[k])
			}
		}
		for k, n := range keys {
			if n > 1 {
				t.Errorf("%s: %s is on %d menu items", lang, k, n)
			}
		}
		// Every item has words in this language (no key shown as its label).
		walk = func(items []*mygo.MenuItem) {
			for _, it := range items {
				if it.Type != mygo.MenuItemSeparator && (it.Label == "" || strings.HasPrefix(it.Label, "menu.")) {
					t.Errorf("%s: an item has no words: %q (%s)", lang, it.Label, it.ID)
				}
				walk(it.Submenu)
			}
		}
		walk(top)
		for _, id := range []string{"close", "find.find", "back", "forward", "zoom.in", "help.keys"} {
			if menu.ItemByID(id) == nil {
				t.Errorf("%s: no %q item", lang, id)
			}
		}
	}
}

// D573: every window comes back where and as large as it was (StateKey).
func TestEveryWindowRemembersItsPlace(t *testing.T) {
	files, _ := filepath.Glob("*.go")
	for _, f := range files {
		if strings.HasSuffix(f, "_test.go") {
			continue
		}
		b, err := os.ReadFile(f)
		if err != nil {
			t.Fatal(err)
		}
		src := string(b)
		for i := strings.Index(src, "mygo.NewWindow(mygo.WindowOptions{"); i >= 0; {
			end := strings.Index(src[i:], "\n\t\t})")
			if end < 0 {
				end = strings.Index(src[i:], "\n\t})")
			}
			if end < 0 || !strings.Contains(src[i:i+end], "StateKey:") {
				t.Errorf("%s: a window without a StateKey forgets its place at relaunch", f)
			}
			next := strings.Index(src[i+1:], "mygo.NewWindow(mygo.WindowOptions{")
			if next < 0 {
				break
			}
			i += 1 + next
		}
	}
}
