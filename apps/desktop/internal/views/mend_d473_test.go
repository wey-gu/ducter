package views

import (
	"encoding/json"
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
)

// D473: Ducter's own repair is one quiet line in the steps, never an error, in both languages.
func TestMendLine(t *testing.T) {
	cases := []struct {
		raw    string
		zh, en string
	}{
		{`{"mend":{"how":"clone_here","name":"Hetzner Server"}}`, "Hetzner Server 上还没有这份代码，我先拉一份再开始", "Hetzner Server didn't have the code yet, so I'm cloning it there first"},
		{`{"mend":{"how":"start_at","name":"MacBook"}}`, "改到 MacBook 上开始，那里有这份代码", "Starting on MacBook instead, which has the code"},
		{`{"mend":{"how":"reopen"}}`, "第一次没开起来，我又开了一次", "It didn't start the first time, so I started it again"},
		{`{"mend":{"how":"rethink"}}`, "这样开不起来，我换个办法", "That way didn't work, so I'm finding another"},
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, _, _ := newTaskApp(t, lang)
		for _, c := range cases {
			b, ok := noteOf("", json.RawMessage(c.raw))
			if !ok || b.Bad {
				t.Fatalf("%s: not a quiet note: %+v", c.raw, b)
			}
			want := c.zh
			if lang == i18n.EN {
				want = c.en
			}
			if got := app.noteLine(&b); got != want {
				t.Fatalf("%s %s: got %q want %q", lang, c.raw, got, want)
			}
		}
	}
	if _, ok := noteOf("", json.RawMessage(`{"mend":{"how":"nonsense"}}`)); ok {
		t.Fatal("an unknown repair is no line")
	}
}
