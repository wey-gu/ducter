package local

import (
	"reflect"
	"testing"
	"time"
)

// D201: terminals are found like editors: in the usual folders, else by
// bundle id; the one used last first; Rex and con only once they claim
// folders.
func TestInstalledTerminals(t *testing.T) {
	day := func(d int) time.Time { return time.Date(2026, 11, d, 9, 0, 0, 0, time.UTC) }
	installed := map[string]bool{
		"/System/Applications/Utilities/Terminal.app": true,
		"/Applications/iTerm.app":                     true,
		"/Users/me/Applications/Ghostty.app":          true,
		"/opt/Warp.app":                               true, // only Spotlight knows it
		"/Applications/Rex Beta.app":                  true,
		"/Applications/con Beta.app":                  true,
		"/Applications/con Dev.app":                   true,
	}
	used := map[string]time.Time{
		"/Applications/iTerm.app":            day(3),
		"/Users/me/Applications/Ghostty.app": day(9),
		"/opt/Warp.app":                      day(5),
		"/Applications/con Dev.app":          day(10),
		"/Applications/Rex Beta.app":         day(1),
	}
	folders := map[string]bool{"/Applications/con Dev.app": true, "/Applications/Rex Beta.app": true}
	f := finder{
		dirs:  []string{"/Applications", "/Users/me/Applications", "/System/Applications/Utilities"},
		isDir: func(p string) bool { return installed[p] },
		byBundle: func(b string) string {
			return map[string]string{"dev.warp.Warp-Stable": "/opt/Warp.app", "dev.zed.Zed": "/gone/Zed.app"}[b]
		},
		lastUsed:      func(p string) time.Time { return used[p] },
		claimsFolders: func(p string) bool { return folders[p] },
	}
	var got []string
	for _, e := range find(knownTerminals, f) {
		got = append(got, e.Name+"|"+e.App+"|"+e.Bundle)
	}
	want := []string{
		"con Dev|/Applications/con Dev.app|co.nowledge.con.dev",
		"Ghostty|/Users/me/Applications/Ghostty.app|com.mitchellh.ghostty",
		"Warp|/opt/Warp.app|dev.warp.Warp-Stable",
		"iTerm2|/Applications/iTerm.app|com.googlecode.iterm2",
		"Rex Beta|/Applications/Rex Beta.app|com.superlogical.rex",
		// never used: the list's order
		"Terminal|/System/Applications/Utilities/Terminal.app|com.apple.Terminal",
	} // con Beta claims no folders: not offered
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("terminals\n got %q\nwant %q", got, want)
	}
	// Spotlight naming an .app that isn't there any more: not offered.
	if eds := find(knownEditors, f); len(eds) != 0 {
		t.Errorf("editors: %+v", eds)
	}
}

func TestPlistClaimsFolders(t *testing.T) {
	ghostty := map[string]any{"CFBundleDocumentTypes": []any{
		map[string]any{"CFBundleTypeName": "Folders", "LSItemContentTypes": []any{"public.directory"}},
	}}
	iterm := map[string]any{"CFBundleDocumentTypes": []any{
		map[string]any{"LSItemContentTypes": []any{"com.googlecode.iterm2.itermcolors"}},
		map[string]any{"LSItemContentTypes": []any{"public.folder"}},
	}}
	classic := map[string]any{"CFBundleDocumentTypes": []any{map[string]any{"CFBundleTypeOSTypes": []any{"fold"}}}}
	con := map[string]any{"CFBundleIdentifier": "co.nowledge.con.beta"} // no document types today
	for name, c := range map[string]struct {
		m    map[string]any
		want bool
	}{"ghostty": {ghostty, true}, "iterm": {iterm, true}, "classic": {classic, true}, "con": {con, false}, "nil": {nil, false}} {
		if got := plistClaimsFolders(c.m); got != c.want {
			t.Errorf("%s: %v, want %v", name, got, c.want)
		}
	}
}

// The folder is always its own argument to /usr/bin/open (never a shell
// string); Warp gets its URI with the path percent-encoded.
func TestOpenArgs(t *testing.T) {
	dir := "/Users/me/.ducter/worktrees/我的 仓库/修复登录"
	bundles := map[string]string{"/Applications/Warp.app": "dev.warp.Warp-Stable", "/Applications/Ghostty.app": "com.mitchellh.ghostty"}
	b := func(app string) string { return bundles[app] }
	for _, c := range []struct {
		with string
		want []string
	}{
		{"finder", []string{"/usr/bin/open", "-R", dir}},
		{"terminal", []string{"/usr/bin/open", "-a", "Terminal", dir}},
		{"/Applications/Ghostty.app", []string{"/usr/bin/open", "-a", "/Applications/Ghostty.app", dir}},
		{"/Applications/Warp.app", []string{"/usr/bin/open", "-a", "/Applications/Warp.app",
			"warp://action/new_window?path=/Users/me/.ducter/worktrees/%E6%88%91%E7%9A%84%20%E4%BB%93%E5%BA%93/%E4%BF%AE%E5%A4%8D%E7%99%BB%E5%BD%95"}},
	} {
		if got := openArgs(c.with, dir, b); !reflect.DeepEqual(got, c.want) {
			t.Errorf("%s: %q, want %q", c.with, got, c.want)
		}
	}
	if got := WarpURL("/tmp/a&b=c?d#e"); got != "warp://action/new_window?path=/tmp/a%26b%3Dc%3Fd%23e" {
		t.Errorf("WarpURL: %s", got)
	}
}
