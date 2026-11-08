package hints

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestOpenReadsHintsAndRemembersTheFirstResult(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, HintsFile), []byte(`{"version":1,"repoCount":14,"repos":[{"name":"hawdb","path":"~/dev/hawdb","touchedAt":"2026-11-08T00:00:00Z"}]}`), 0o644)
	l := Open(dir)
	if l.RepoCount() != 14 || len(l.Repos()) != 1 || l.Repos()[0].Path != "~/dev/hawdb" {
		t.Fatalf("hints %+v", l.Hints)
	}
	if l.FirstResultSeen() {
		t.Fatal("seen before anything happened")
	}
	l.MarkFirstResultSeen(time.Now())
	if !Open(dir).FirstResultSeen() {
		t.Fatal("not remembered across launches")
	}
}

func TestMissingOrBadFilesMeanNoHints(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, HintsFile), []byte(`{"version":2}`), 0o644)
	if l := Open(dir); l.Hints != nil || l.Repos() != nil {
		t.Fatalf("unknown version accepted: %+v", l.Hints)
	}
	var none *Local
	if none.Repos() != nil || none.FirstResultSeen() {
		t.Fatal("nil Local")
	}
	mem := Open("")
	mem.MarkFirstResultSeen(time.Now())
	if !mem.FirstResultSeen() {
		t.Fatal("in-memory flag")
	}
}
