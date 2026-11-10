package local

import (
	"context"
	"encoding/json"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// Editor is an app on this Mac that 打开 / Open offers for a task's
// working copy (D198: code editors; D201: terminals too): its name as the
// menu says it, the .app that opens the folder, and its bundle id.
type Editor struct {
	Name, App, Bundle string
	lastUsed          time.Time
}

// how is the way an app opens a folder in a new window (D201).
type how int

const (
	// openA: `open -a <app> <dir>`; the app claims folders.
	openA how = iota
	// warpURL: Warp's documented URI, warp://action/new_window?path=<dir>.
	warpURL
	// ifFolders: `open -a`, offered only while the installed copy's
	// Info.plist claims folders: today's builds don't, and an item that
	// opens the app somewhere else would say what it doesn't do.
	ifFolders
)

// known is an app 打开 looks for: its menu name ("" says the .app's own
// name, for an app shipped in channels), bundle id, the .app names it is
// installed as, and how it opens a folder.
type known struct {
	name, bundle string
	apps         []string
	how          how
}

// knownEditors are the editors 打开 / Open offers, in the order used when
// none says when it was last used.
var knownEditors = []known{
	{"Cursor", "com.todesktop.230313mzl4w4u92", []string{"Cursor.app"}, openA},
	{"Visual Studio Code", "com.microsoft.VSCode", []string{"Visual Studio Code.app"}, openA},
	{"Zed", "dev.zed.Zed", []string{"Zed.app"}, openA},
}

// knownTerminals are the terminals (D201). Terminal, iTerm2 and Ghostty
// claim folders and were opened at one on a Mac; Warp is by its URI;
// Rex and con only once they claim folders.
var knownTerminals = []known{
	{"Terminal", "com.apple.Terminal", []string{"Terminal.app"}, openA},
	{"iTerm2", "com.googlecode.iterm2", []string{"iTerm.app"}, openA},
	{"Ghostty", "com.mitchellh.ghostty", []string{"Ghostty.app"}, openA},
	{"Warp", "dev.warp.Warp-Stable", []string{"Warp.app"}, warpURL},
	{"", "com.superlogical.rex", []string{"Rex.app", "Rex Beta.app"}, ifFolders},
	{"", "co.nowledge.con", []string{"con.app"}, ifFolders},
	{"", "co.nowledge.con.beta", []string{"con Beta.app"}, ifFolders},
	{"", "co.nowledge.con.dev", []string{"con Dev.app"}, ifFolders},
}

// finder is how detection looks at this Mac; tests swap it.
type finder struct {
	dirs          []string                   // where .app bundles are looked for first
	isDir         func(string) bool          // the .app is there
	byBundle      func(bundle string) string // Spotlight: the .app with this bundle id, or ""
	lastUsed      func(app string) time.Time // Spotlight's kMDItemLastUsedDate, or zero
	claimsFolders func(app string) bool      // its Info.plist says it opens folders
}

func thisMac() finder {
	home, _ := os.UserHomeDir()
	return finder{
		dirs:  []string{"/Applications", filepath.Join(home, "Applications"), "/Applications/Utilities", "/System/Applications/Utilities"},
		isDir: isDir,
		byBundle: func(b string) string {
			return spotlight("mdfind", "kMDItemCFBundleIdentifier == '"+b+"'")
		},
		lastUsed: func(app string) time.Time {
			s := spotlight("mdls", "-name", "kMDItemLastUsedDate", "-raw", app)
			t, err := time.Parse("2006-01-02 15:04:05 -0700", s)
			if err != nil {
				return time.Time{}
			}
			return t
		},
		claimsFolders: claimsFolders,
	}
}

// InstalledEditors finds Cursor, Visual Studio Code and Zed (D198).
// Slow-ish (mdfind, mdls): call it off the main thread.
func InstalledEditors() []Editor { return find(knownEditors, thisMac()) }

// InstalledTerminals finds Terminal, iTerm2, Ghostty, Warp, Rex and con
// (D201). Slow-ish too.
func InstalledTerminals() []Editor { return find(knownTerminals, thisMac()) }

// find: each app in the usual folders first, else by bundle id through
// Spotlight; the one used most recently first, else the list's order.
func find(list []known, f finder) []Editor {
	var out []Editor
	seen := map[string]bool{}
	for _, k := range list {
		path := ""
	look:
		for _, dir := range f.dirs {
			for _, a := range k.apps {
				if p := filepath.Join(dir, a); f.isDir(p) {
					path = p
					break look
				}
			}
		}
		if path == "" {
			path = f.byBundle(k.bundle)
		}
		if path == "" || seen[path] || !f.isDir(path) {
			continue
		}
		if k.how == ifFolders && !f.claimsFolders(path) {
			continue
		}
		seen[path] = true
		name := k.name
		if name == "" {
			name = strings.TrimSuffix(filepath.Base(path), ".app")
		}
		out = append(out, Editor{Name: name, App: path, Bundle: k.bundle, lastUsed: f.lastUsed(path)})
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].lastUsed.After(out[j].lastUsed) })
	return out
}

// spotlight runs a Spotlight tool for at most two seconds; its first line.
func spotlight(name string, args ...string) string {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, "/usr/bin/"+name, args...).Output()
	if err != nil {
		return ""
	}
	line, _, _ := strings.Cut(strings.TrimSpace(string(out)), "\n")
	if line = strings.TrimSpace(line); line == "(null)" {
		return ""
	}
	return line
}

func isDir(p string) bool {
	st, err := os.Stat(p)
	return err == nil && st.IsDir()
}

// infoPlist reads an app's Info.plist (binary or XML) through plutil.
func infoPlist(app string) map[string]any {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, "/usr/bin/plutil", "-convert", "json", "-o", "-", filepath.Join(app, "Contents", "Info.plist")).Output()
	if err != nil {
		return nil
	}
	var m map[string]any
	_ = json.Unmarshal(out, &m)
	return m
}

func claimsFolders(app string) bool { return plistClaimsFolders(infoPlist(app)) }

// plistClaimsFolders: a document type of public.folder or public.directory
// (or the classic 'fold' OS type), as Terminal, iTerm2 and Ghostty declare.
func plistClaimsFolders(m map[string]any) bool {
	types, _ := m["CFBundleDocumentTypes"].([]any)
	for _, t := range types {
		d, _ := t.(map[string]any)
		for _, key := range []string{"LSItemContentTypes", "CFBundleTypeOSTypes"} {
			vs, _ := d[key].([]any)
			for _, v := range vs {
				if s, _ := v.(string); s == "public.folder" || s == "public.directory" || s == "fold" {
					return true
				}
			}
		}
	}
	return false
}

func bundleOf(app string) string {
	s, _ := infoPlist(app)["CFBundleIdentifier"].(string)
	return s
}

// OpenFolder opens a task's working folder on this Mac (D198, D201):
// "finder" shows it selected in Finder, "terminal" opens a Terminal window
// there, anything else is the .app of an editor or terminal to open it in.
func OpenFolder(with, path string) error {
	args := openArgs(with, path, bundleOf)
	return exec.Command(args[0], args[1:]...).Run()
}

// openArgs is the command OpenFolder runs: always /usr/bin/open with the
// path as its own argument, never through a shell.
func openArgs(with, path string, bundle func(string) string) []string {
	switch with {
	case "finder":
		return []string{"/usr/bin/open", "-R", path}
	case "terminal":
		return []string{"/usr/bin/open", "-a", "Terminal", path}
	}
	if strings.HasPrefix(bundle(with), "dev.warp.Warp") {
		return []string{"/usr/bin/open", "-a", with, WarpURL(path)}
	}
	return []string{"/usr/bin/open", "-a", with, path}
}

// WarpURL is Warp's documented way to open a new window at a folder
// (docs.warp.dev, URI scheme). The path is percent-encoded, its slashes
// kept (a query may hold them), so spaces and any script survive.
func WarpURL(path string) string {
	q := strings.ReplaceAll(strings.ReplaceAll(url.QueryEscape(path), "+", "%20"), "%2F", "/")
	return "warp://action/new_window?path=" + q
}
