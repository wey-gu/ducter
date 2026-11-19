package views

import (
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D385: handing several over in the Mac app against the demo core (the wire,
// not fixtures): the set card and the plan card in the conversation, the
// group on On hand, and the sheet opened on a subject with the home's own
// find and how:
//
//	DUCTER_PORT=7951 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh DEMO_STAGE=plan DEMO_PLAN_MS=800 bun apps/web/demo-handover.ts
//	DUCTER_SHELL_URL=ws://127.0.0.1:7951/ws DUCTER_SHELL_LANG=zh \
//	  DUCTER_SHOTS_DIR=/Users/weyl/dev/ducter/.shots/handover-build go test ./internal/views -run D385LiveShots
func TestD385LiveShots(t *testing.T) {
	url := os.Getenv("DUCTER_SHELL_URL")
	if url == "" {
		t.Skip("DUCTER_SHELL_URL not set")
	}
	lang := i18n.ZH
	if os.Getenv("DUCTER_SHELL_LANG") == "en" {
		lang = i18n.EN
	}
	dir := shotsDir(t)
	h := newLive(t, url, lang)
	h.app.LocaleFixed, h.app.L = true, i18n.New(lang)
	h.tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	settle := func() {
		for i := 0; i < 12; i++ {
			h.until("frames", func() bool { return true })
			h.tt.Advance(200 * time.Millisecond)
		}
	}
	shot := func(name string) {
		settle()
		f, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-live-%s-%s.png", name, lang)))
		if err != nil {
			t.Fatal(err)
		}
		if err := png.Encode(f, h.tt.Image()); err != nil {
			t.Fatal(err)
		}
		f.Close()
	}
	// The set card and, handed over, the plan card.
	h.until("set card", func() bool {
		for _, e := range h.app.S.Channel {
			if e.Set != nil {
				return true
			}
		}
		return false
	})
	h.until("plan card", func() bool {
		for _, d := range h.app.S.Decisions {
			if d.Src != nil && d.Src.Kind == "plan" && d.Src.Plan != nil {
				return true
			}
		}
		return false
	})
	h.tt.SetSize(1180, 1700)
	h.app.Route = RouteConversation
	shot("conversation")
	all := strings.Join(h.tt.Texts(), " | ")
	for _, want := range []string{"#351", "#398 + #412 + #405"} {
		if !strings.Contains(all, want) {
			t.Fatalf("missing %q in %s", want, all)
		}
	}
	h.app.Route = RouteOnHand
	h.tt.SetSize(1280, 1700)
	shot("onhand")
	// The sheet on the subject: the home's find and how.
	pv := h.app.S.Sources.Pile
	if pv == nil || len(pv.Subjects) == 0 {
		t.Fatalf("no subjects on the pile: %+v", pv)
	}
	h.app.openHandSubject(pv.Subjects[0].Name)
	h.until("found", func() bool { return h.app.ho.got && len(h.app.ho.items) > 0 })
	h.app.ho.note = todoWords(lang)("先别动数据库迁移，验证都去 haswell 上跑。", "Leave the database migrations alone; run every check on haswell.")
	h.tt.SetSize(1400, 1000)
	h.until("how", func() bool {
		h.tt.Advance(400 * time.Millisecond)
		return h.app.ho.how != nil && h.app.ho.how.Where.Why == "note"
	})
	shot("sheet")
	if h.app.ho.how.Where.Name != "haswell" {
		t.Fatalf("where: %+v", h.app.ho.how.Where)
	}
	_ = protocol.HandCap
}
