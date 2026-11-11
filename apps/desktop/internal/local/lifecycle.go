package local

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// The end of Ducter's life on a Mac, and help when it goes wrong. The CLI
// owns both lists (packages/cli/src/uninstall.ts and report.ts), so the app,
// a terminal and a Linux server remove and collect exactly the same things;
// the app adds only what is its own: moving Ducter.app to the Trash last,
// and saving the report as a .zip on the Desktop.

// DefaultBundleID is Ducter.app's (D55).
const DefaultBundleID = "co.nowledge.ducter"

// SupportDir is the app's folder in ~/Library/Application Support: "Ducter"
// for Ducter.app, the bundle id for another build (a scratch copy with its
// own id never shares the real app's dev.env or updates).
func SupportDir(bundleID string) string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	name := "Ducter"
	if bundleID != "" && bundleID != DefaultBundleID {
		name = bundleID
	}
	return filepath.Join(home, "Library", "Application Support", name)
}

// UninstallItem is one thing `ducter uninstall` removes.
type UninstallItem struct {
	Path  string `json:"path"`
	What  string `json:"what"`            // in the person's language
	Kind  string `json:"kind"`            // agent | service | data | worktree | folder | link | appdata | rc | caddy
	Bytes int64  `json:"bytes,omitempty"` // its size, when known
}

// UninstallKeep is one thing it leaves alone, and why.
type UninstallKeep struct {
	What   string `json:"what"`
	Detail string `json:"detail"`
}

// UninstallWarning is something to read before saying yes.
type UninstallWarning struct {
	ID     string `json:"id"` // unsaved-worktree | running-elsewhere | unsafe-data-dir
	Detail string `json:"detail"`
	Path   string `json:"path,omitempty"`
}

// UninstallPlan is exactly what a removal does, for the page to list.
type UninstallPlan struct {
	// All: everything (data, the Log, worktrees, browser profiles, the
	// link), then the app to the Trash. Otherwise only the background item.
	All      bool               `json:"-"`
	Remove   []UninstallItem    `json:"remove"`
	Keep     []UninstallKeep    `json:"keep"`
	Warnings []UninstallWarning `json:"warnings"`
	// App is the .app that goes to the Trash last (All only; "" when the
	// app runs from a disk image or a translocated copy, which can't).
	App string `json:"-"`
}

// UninstallResult is what was removed.
type UninstallResult struct {
	Removed  []string           `json:"removed"`
	Failed   []UninstallFailure `json:"failed"`
	Warnings []UninstallWarning `json:"warnings"`
	// Trashed is the app, when it went to the Trash.
	Trashed string `json:"-"`
}

// UninstallFailure is a path that couldn't be removed.
type UninstallFailure struct {
	Path  string `json:"path"`
	Error string `json:"error"`
}

// Stopped reports whether nothing was removed because a Ducter still runs
// elsewhere (a `ducter up` in a terminal).
func (r UninstallResult) Stopped() bool {
	for _, w := range r.Warnings {
		if w.ID == "running-elsewhere" {
			return true
		}
	}
	return false
}

// ErrStillRunning: a Ducter the app didn't start still answers; it must be
// stopped first (Ctrl-C in its terminal).
var ErrStillRunning = errors.New("a Ducter started elsewhere is still running")

func (h *Host) lifecycleEnv() []string {
	env := h.Supervisor.env()
	if h.Agent != nil {
		env = append(env, "DUCTER_AGENT_LABEL="+h.Agent.Label)
	}
	return append(env, "DUCTER_FROM_APP=1")
}

func (h *Host) cli(timeout time.Duration, args ...string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, h.CLI, args...)
	cmd.Env = h.lifecycleEnv()
	var out, errb bytes.Buffer
	cmd.Stdout, cmd.Stderr = &out, &errb
	err := cmd.Run()
	if err != nil && out.Len() == 0 {
		return nil, fmt.Errorf("ducter %s: %v %s", args[0], err, strings.TrimSpace(errb.String()))
	}
	return out.Bytes(), nil
}

// UninstallPlan asks the CLI what a removal would do (nothing changes).
func (h *Host) UninstallPlan(all bool) (UninstallPlan, error) {
	args := []string{"uninstall", "--dry-run", "--json"}
	if all {
		args = append(args, "--all")
	}
	out, err := h.cli(time.Minute, args...)
	if err != nil {
		return UninstallPlan{}, err
	}
	var p UninstallPlan
	if err := json.Unmarshal(out, &p); err != nil {
		return UninstallPlan{}, fmt.Errorf("ducter uninstall: %v", err)
	}
	p.All = all
	if all && h.AppPath != "" && Settled(h.AppPath) {
		p.App = h.AppPath
	}
	return p, nil
}

// Uninstall carries out a plan the person read and confirmed (the page asks
// for the typed confirmation of All). A Ducter that is the app's child is
// stopped first; the CLI removes the background item, then, with All, the
// data; last the app goes to the Trash (Trash, else left where it is). The
// app should quit afterwards: there is nothing left for it to run.
func (h *Host) Uninstall(p UninstallPlan) (UninstallResult, error) {
	h.Jobs.StopAll()
	h.Supervisor.Stop(8 * time.Second)
	args := []string{"uninstall", "--json", "--yes"}
	if p.All {
		args = append(args, "--all")
	}
	out, err := h.cli(3*time.Minute, args...)
	if err != nil {
		return UninstallResult{}, err
	}
	var r UninstallResult
	if err := json.Unmarshal(out, &r); err != nil {
		return UninstallResult{}, fmt.Errorf("ducter uninstall: %v", err)
	}
	if r.Stopped() {
		return r, ErrStillRunning
	}
	if p.All && p.App != "" && len(r.Failed) == 0 {
		// An update staged next to the app goes with it.
		if olds, _ := filepath.Glob(filepath.Join(filepath.Dir(p.App), "."+filepath.Base(p.App)+".update-*")); len(olds) > 0 {
			for _, o := range olds {
				_ = os.RemoveAll(o)
			}
		}
		_ = os.RemoveAll(filepath.Join(filepath.Dir(p.App), "."+filepath.Base(p.App)+".previous"))
		if h.Trash != nil {
			if err := h.Trash(p.App); err != nil {
				r.Failed = append(r.Failed, UninstallFailure{Path: p.App, Error: err.Error()})
			} else {
				r.Trashed = p.App
			}
		}
	}
	return r, nil
}

// ReportFile is one file of a diagnostics bundle.
type ReportFile struct {
	Name  string `json:"name"`
	Bytes int64  `json:"bytes"`
}

// Diagnostics is a bundle for "Report a problem…": collected, redacted, on
// this Mac only, until the person saves it and attaches it themselves.
type Diagnostics struct {
	Dir      string       `json:"dir"`
	Files    []ReportFile `json:"files"`
	IssueURL string       `json:"issueUrl"`
}

// Read is one file's text, for the review step.
func (d Diagnostics) Read(name string) string {
	for _, f := range d.Files {
		if f.Name == name {
			b, _ := os.ReadFile(filepath.Join(d.Dir, name))
			return string(b)
		}
	}
	return ""
}

// Diagnostics collects the bundle with `ducter report`: doctor, versions,
// the last 500 lines of Ducter's logs with secrets removed, and the last
// conversation only when the person ticked it. Nothing is uploaded.
func (h *Host) Diagnostics(withConversation bool, appVersion string) (Diagnostics, error) {
	dir, err := os.MkdirTemp("", "ducter-report-")
	if err != nil {
		return Diagnostics{}, err
	}
	args := []string{"report", "--json", "--out", dir}
	if withConversation {
		args = append(args, "--include-conversation")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, h.CLI, args...)
	cmd.Env = append(h.lifecycleEnv(), "DUCTER_APP_VERSION="+appVersion)
	out, err := cmd.Output()
	if err != nil && len(out) == 0 {
		os.RemoveAll(dir)
		return Diagnostics{}, fmt.Errorf("ducter report: %v", err)
	}
	var d Diagnostics
	if err := json.Unmarshal(out, &d); err != nil {
		os.RemoveAll(dir)
		return Diagnostics{}, fmt.Errorf("ducter report: %v", err)
	}
	return d, nil
}

// SaveZip writes the bundle as Ducter-report-<time>.zip into dir (the
// Desktop) and returns its path. Only the bundle's own files go in.
func SaveZip(d Diagnostics, dir string, now time.Time) (string, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	name := "Ducter-report-" + now.Format("2006-01-02-1504")
	path := filepath.Join(dir, name+".zip")
	for i := 2; fileExists(path); i++ {
		path = filepath.Join(dir, fmt.Sprintf("%s-%d.zip", name, i))
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return "", err
	}
	zw := zip.NewWriter(f)
	for _, rf := range d.Files {
		if rf.Name != filepath.Base(rf.Name) || strings.HasPrefix(rf.Name, ".") {
			continue // never anything outside the bundle
		}
		src, err := os.Open(filepath.Join(d.Dir, rf.Name))
		if err != nil {
			continue
		}
		w, err := zw.CreateHeader(&zip.FileHeader{Name: name + "/" + rf.Name, Method: zip.Deflate, Modified: now})
		if err == nil {
			_, err = io.Copy(w, src)
		}
		src.Close()
		if err != nil {
			zw.Close()
			f.Close()
			os.Remove(path)
			return "", err
		}
	}
	if err := zw.Close(); err != nil {
		f.Close()
		os.Remove(path)
		return "", err
	}
	return path, f.Close()
}

// DesktopDir is ~/Desktop.
func DesktopDir() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, "Desktop")
}

func fileExists(p string) bool {
	_, err := os.Lstat(p)
	return err == nil
}
