package views

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D451: 第一次 / The first time. The look's line carries one line in the
// partner's words the first time, on the first thing only, sent as met at
// once; a home that already met it, or one too old to keep Met, shows none.
func TestFirstMeetOnceUnderTheFirstLook(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		// A home too old to keep Met: nothing.
		app, tt := lookApp(t, lang)
		first := app.L.T("first.look")
		app.S.Settings = &protocol.Settings{}
		tt.Frame()
		if strings.Contains(texts(tt), first) {
			t.Errorf("%s: a first-time line on a home that can't keep it", lang)
		}

		// Not met yet: once, under the first look, and met at once.
		app, tt = lookApp(t, lang)
		var sent []string
		app.Send = func(f any) error {
			b, _ := json.Marshal(f)
			sent = append(sent, string(b))
			return nil
		}
		app.S.Settings = &protocol.Settings{Met: []string{}}
		tt.Frame()
		tt.Frame()
		if n := strings.Count(texts(tt), first); n != 1 {
			t.Errorf("%s: the first-time line shows %d times, want 1: %q", lang, n, texts(tt))
		}
		met := 0
		for _, s := range sent {
			if strings.Contains(s, `"met":["look"]`) {
				met++
			}
		}
		if met != 1 {
			t.Errorf("%s: met sent %d times: %v", lang, met, sent)
		}
		// The home's frame comes back met: the line stays where it is for this run.
		app.S.Settings = &protocol.Settings{Met: []string{"look"}}
		tt.Frame()
		if strings.Count(texts(tt), first) != 1 {
			t.Errorf("%s: the line vanished under the reader once met", lang)
		}

		// Met on another device: never.
		app, tt = lookApp(t, lang)
		app.S.Settings = &protocol.Settings{Met: []string{"look"}}
		tt.Frame()
		if strings.Contains(texts(tt), first) {
			t.Errorf("%s: a line met elsewhere shows again", lang)
		}
	}
}

// DUCTER_D451_SHOTS=<dir> go test ./internal/views -run TestD451FirstMeetShots
func TestD451FirstMeetShots(t *testing.T) {
	dir := os.Getenv("DUCTER_D451_SHOTS")
	if dir == "" {
		t.Skip("DUCTER_D451_SHOTS not set")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("DUCTER_SHOTS_DIR", dir)
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, tt := lookApp(t, lang)
		app.S.Settings = &protocol.Settings{Met: []string{}}
		settle := func() {
			for i := 0; i < 4; i++ {
				tt.Frame()
				tt.Advance(300 * time.Millisecond)
			}
		}
		app.Route = RouteConversation
		d302Both(t, app, tt, settle, "d451-look", lang)
	}
}
