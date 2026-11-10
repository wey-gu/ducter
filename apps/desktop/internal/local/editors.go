package local

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// Editor is a code editor installed on this Mac (D198): its name as the
// menu says it, and the .app that opens a folder.
type Editor struct {
	Name, App string
	lastUsed  time.Time
}

// knownEditors are the editors 打开 / Open offers, in the order used when
// none says when it was last used.
var knownEditors = []struct{ name, bundle, app string }{
	{"Cursor", "com.todesktop.230313mzl4w4u92", "Cursor.app"},
	{"Visual Studio Code", "com.microsoft.VSCode", "Visual Studio Code.app"},
	{"Zed", "dev.zed.Zed", "Zed.app"},
}

// InstalledEditors finds Cursor, Visual Studio Code and Zed: in
// /Applications or ~/Applications first, else by bundle id through
// Spotlight. The one used most recently comes first (Spotlight's
// kMDItemLastUsedDate), else the order above. Slow-ish (mdfind, mdls):
// call it off the main thread.
func InstalledEditors() []Editor {
	home, _ := os.UserHomeDir()
	var out []Editor
	for _, k := range knownEditors {
		path := ""
		for _, dir := range []string{"/Applications", filepath.Join(home, "Applications")} {
			if p := filepath.Join(dir, k.app); isDir(p) {
				path = p
				break
			}
		}
		if path == "" {
			path = spotlight("mdfind", "kMDItemCFBundleIdentifier == '"+k.bundle+"'")
		}
		if path == "" || !isDir(path) {
			continue
		}
		e := Editor{Name: k.name, App: path}
		if s := spotlight("mdls", "-name", "kMDItemLastUsedDate", "-raw", path); s != "" && s != "(null)" {
			if t, err := time.Parse("2006-01-02 15:04:05 -0700", s); err == nil {
				e.lastUsed = t
			}
		}
		out = append(out, e)
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
	return strings.TrimSpace(line)
}

func isDir(p string) bool {
	st, err := os.Stat(p)
	return err == nil && st.IsDir()
}

// OpenFolder opens a task's working folder on this Mac (D198): "finder"
// shows it selected in Finder, "terminal" opens a Terminal window there,
// anything else is the .app of an editor to open it with.
func OpenFolder(with, path string) error {
	switch with {
	case "finder":
		return exec.Command("/usr/bin/open", "-R", path).Run()
	case "terminal":
		return exec.Command("/usr/bin/open", "-a", "Terminal", path).Run()
	default:
		return exec.Command("/usr/bin/open", "-a", with, path).Run()
	}
}
