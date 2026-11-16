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

// D262: the next launch starts in the language followed from the person's
// words and with the partner's name, so its first frame is the settled one.
func TestStartLangRemembersTheSpokenLanguage(t *testing.T) {
	dir := t.TempDir()
	l := Open(dir)
	if got, chosen := l.StartLang("en", false); got != "en" || chosen {
		t.Fatalf("fresh: %s %v", got, chosen)
	}
	l.SetSpokeLang("zh")
	l.SetPersonaName("小鸭")
	again := Open(dir)
	if got, chosen := again.StartLang("en", false); got != "zh" || chosen {
		t.Errorf("followed language not used at launch: %s %v", got, chosen)
	}
	if again.PersonaName() != "小鸭" {
		t.Errorf("name not kept: %q", again.PersonaName())
	}
	again.SetLang("en")
	if got, chosen := again.StartLang("zh", false); got != "en" || !chosen {
		t.Errorf("Settings' choice must win: %s %v", got, chosen)
	}
	if got, _ := again.StartLang("zh", true); got != "zh" {
		t.Errorf("DUCTER_LOCALE must win: %s", got)
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
