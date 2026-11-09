package local

import (
	"archive/zip"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// fakeCLI writes a ducter that logs its arguments and environment, and
// answers uninstall/report with canned JSON.
func fakeLifecycleCLI(t *testing.T, dir, uninstallJSON string) (cli, log string) {
	t.Helper()
	log = filepath.Join(dir, "calls.log")
	cli = filepath.Join(dir, "ducter")
	script := `#!/bin/sh
echo "$* | label=$DUCTER_AGENT_LABEL fromApp=$DUCTER_FROM_APP app=$DUCTER_APP_VERSION" >>` + log + `
case "$1" in
uninstall)
  case "$*" in
  *--dry-run*) echo '{"remove":[{"path":"/x/.ducter","what":"Ducter data","kind":"data","bytes":42}],"keep":[{"what":"Your repos","detail":"and their ducter/* branches"}],"warnings":[{"id":"unsaved-worktree","detail":"t1 has changes","path":"/x/.ducter/worktrees/t1"}]}' ;;
  *) echo '` + uninstallJSON + `' ;;
  esac ;;
report)
  out=""; prev=""
  for a in "$@"; do [ "$prev" = "--out" ] && out="$a"; prev="$a"; done
  echo '{"versions":1}' >"$out/versions.txt"
  printf '{"dir":"%s","files":[{"name":"versions.txt","bytes":14}],"issueUrl":"https://github.com/wey-gu/ducter/issues/new?title=x"}' "$out" ;;
esac
`
	if err := os.WriteFile(cli, []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	return cli, log
}

func testHost(t *testing.T, cli string) (*Host, string) {
	root := t.TempDir()
	app := filepath.Join(root, "Applications", "Ducter.app")
	os.MkdirAll(app, 0o755)
	sup := &Supervisor{CLI: cli, DataDir: filepath.Join(root, "data"), Port: 7799}
	sup.Agent = &Agent{Label: "co.nowledge.ducter.scratch.agent", Dir: filepath.Join(root, "LaunchAgents")}
	return &Host{Supervisor: sup, AppPath: app}, app
}

func TestUninstallPlanAndRemoveEverything(t *testing.T) {
	cli, log := fakeLifecycleCLI(t, t.TempDir(), `{"removed":["/x/.ducter"],"failed":[],"warnings":[]}`)
	h, app := testHost(t, cli)
	var trashed []string
	h.Trash = func(p string) error { trashed = append(trashed, p); return nil }
	// A staged update next to the app goes with it.
	stage := filepath.Join(filepath.Dir(app), ".Ducter.app.update-0.2.0")
	os.MkdirAll(stage, 0o755)

	p, err := h.UninstallPlan(true)
	if err != nil {
		t.Fatal(err)
	}
	if !p.All || p.App != app || len(p.Remove) != 1 || p.Remove[0].Bytes != 42 || len(p.Keep) != 1 || p.Warnings[0].ID != "unsaved-worktree" {
		t.Fatalf("plan %+v", p)
	}
	r, err := h.Uninstall(p)
	if err != nil || r.Trashed != app || len(trashed) != 1 {
		t.Fatalf("result %+v %v %v", r, err, trashed)
	}
	if fileExists(stage) {
		t.Fatal("the staged update is removed")
	}
	calls, _ := os.ReadFile(log)
	got := string(calls)
	if !strings.Contains(got, "uninstall --dry-run --json --all | label=co.nowledge.ducter.scratch.agent fromApp=1") ||
		!strings.Contains(got, "uninstall --json --yes --all | label=co.nowledge.ducter.scratch.agent") {
		t.Fatalf("calls:\n%s", got)
	}
}

func TestUninstallBackgroundOnlyKeepsTheApp(t *testing.T) {
	cli, _ := fakeLifecycleCLI(t, t.TempDir(), `{"removed":["/x/LaunchAgents/a.plist"],"failed":[],"warnings":[]}`)
	h, _ := testHost(t, cli)
	h.Trash = func(string) error { t.Fatal("the app stays"); return nil }
	p, err := h.UninstallPlan(false)
	if err != nil || p.All || p.App != "" {
		t.Fatalf("plan %+v %v", p, err)
	}
	if _, err := h.Uninstall(p); err != nil {
		t.Fatal(err)
	}
}

func TestUninstallStopsWhenDucterRunsElsewhere(t *testing.T) {
	cli, _ := fakeLifecycleCLI(t, t.TempDir(), `{"removed":["/x/a.plist"],"failed":[],"warnings":[{"id":"running-elsewhere","detail":"stop it first"}]}`)
	h, _ := testHost(t, cli)
	h.Trash = func(string) error { t.Fatal("nothing goes to the Trash"); return nil }
	p, _ := h.UninstallPlan(true)
	if _, err := h.Uninstall(p); !errors.Is(err, ErrStillRunning) {
		t.Fatalf("err %v", err)
	}
}

func TestUninstallFailureKeepsTheApp(t *testing.T) {
	cli, _ := fakeLifecycleCLI(t, t.TempDir(), `{"removed":[],"failed":[{"path":"/x/.ducter","error":"EPERM"}],"warnings":[]}`)
	h, _ := testHost(t, cli)
	h.Trash = func(string) error { t.Fatal("the app stays while something is left"); return nil }
	p, _ := h.UninstallPlan(true)
	if r, err := h.Uninstall(p); err != nil || len(r.Failed) != 1 || r.Trashed != "" {
		t.Fatalf("%+v %v", r, err)
	}
}

func TestDiagnosticsAndZip(t *testing.T) {
	cli, log := fakeLifecycleCLI(t, t.TempDir(), "{}")
	h, _ := testHost(t, cli)
	d, err := h.Diagnostics(true, "0.1.0")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(d.Dir)
	if !strings.HasPrefix(d.IssueURL, "https://github.com/wey-gu/ducter/issues/new") || d.Read("versions.txt") == "" || d.Read("../etc/passwd") != "" {
		t.Fatalf("%+v", d)
	}
	calls, _ := os.ReadFile(log)
	if !strings.Contains(string(calls), "--include-conversation | ") || !strings.Contains(string(calls), "app=0.1.0") {
		t.Fatalf("calls %s", calls)
	}
	desk := t.TempDir()
	now := time.Date(2026, 11, 9, 14, 5, 0, 0, time.UTC)
	z, err := SaveZip(d, desk, now)
	if err != nil || filepath.Base(z) != "Ducter-report-2026-11-09-1405.zip" {
		t.Fatalf("%s %v", z, err)
	}
	z2, _ := SaveZip(d, desk, now)
	if filepath.Base(z2) != "Ducter-report-2026-11-09-1405-2.zip" {
		t.Fatalf("second zip %s", z2)
	}
	zr, err := zip.OpenReader(z)
	if err != nil {
		t.Fatal(err)
	}
	defer zr.Close()
	if len(zr.File) != 1 || zr.File[0].Name != "Ducter-report-2026-11-09-1405/versions.txt" {
		t.Fatalf("zip holds %v", zr.File)
	}
}

func TestSupportDirPerBundle(t *testing.T) {
	if !strings.HasSuffix(SupportDir(DefaultBundleID), "/Application Support/Ducter") || !strings.HasSuffix(SupportDir(""), "/Ducter") {
		t.Fatal(SupportDir(DefaultBundleID))
	}
	if !strings.HasSuffix(DevEnvPathFor("co.nowledge.ducter.scratch"), "/Application Support/co.nowledge.ducter.scratch/dev.env") {
		t.Fatal(DevEnvPathFor("co.nowledge.ducter.scratch"))
	}
	if DevEnvPath() != DevEnvPathFor(DefaultBundleID) {
		t.Fatal("the real app's dev.env stays where it was")
	}
}
