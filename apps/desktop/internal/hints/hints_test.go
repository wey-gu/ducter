package hints

import (
	"testing"
	"time"
)

func TestOpenRemembersTheFirstResult(t *testing.T) {
	dir := t.TempDir()
	l := Open(dir)
	if l.FirstResultSeen() {
		t.Fatal("seen before anything happened")
	}
	l.MarkFirstResultSeen(time.Now())
	if !Open(dir).FirstResultSeen() {
		t.Fatal("not remembered across launches")
	}
}

func TestMissingFilesMeanDefaults(t *testing.T) {
	var none *Local
	if none.FirstResultSeen() {
		t.Fatal("nil Local")
	}
	mem := Open("")
	mem.MarkFirstResultSeen(time.Now())
	if !mem.FirstResultSeen() {
		t.Fatal("in-memory flag")
	}
}
