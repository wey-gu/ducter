package views

import (
	"os"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D536: Settings › 伙伴 with four partners, two thinking with their own (小玛
// on Claude Code Opus at high effort, 小新 on Codex GPT-6.2-Sol), the default
// card titled as the default, and 小玛's 改一下 with its pickers, at 1150 and
// 1400, light and dark, against the demo core:
//
//	DUCTER_PORT=7852 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh bun apps/web/demo-d536.ts
//	DUCTER_D536_URL=ws://127.0.0.1:7852/ws DUCTER_SHELL_LANG=zh DUCTER_SHOTS_DIR=<repo>/.shots/partner-model \
//	  go test ./internal/views -run D536
func TestD536PartnerThinksShots(t *testing.T) {
	url := os.Getenv("DUCTER_D536_URL")
	if url == "" {
		t.Skip("DUCTER_D536_URL not set")
	}
	lang := i18n.ZH
	if os.Getenv("DUCTER_SHELL_LANG") == "en" {
		lang = i18n.EN
	}
	h := newLive(t, url, lang)
	h.app.LocaleFixed, h.app.L = true, i18n.New(lang)
	h.tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	settle := func() {
		for i := 0; i < 8; i++ {
			h.until("frames", func() bool { return true })
			h.tt.Advance(200 * time.Millisecond)
		}
	}
	h.until("partners", func() bool { return len(h.app.S.Partners) == 4 })
	h.app.openTab(TabPartner)
	h.until("settings", func() bool { return h.app.S.Settings != nil && len(h.app.S.BrainOptions) > 1 })
	var ma protocol.PartnerInfo
	for _, p := range h.app.S.Partners {
		if p.Brain != nil && p.Brain.Harness == "claude-code" {
			ma = p
		}
	}
	if ma.ID == "" {
		t.Fatal("no partner on Claude Code of its own")
	}
	for _, w := range []int{1150, 1400} {
		h.tt.SetSize(w, 2300)
		h.app.partners.editing = ""
		d302Both(t, h.app, h.tt, settle, "partner-model-"+itoa(int64(w)), lang)
		h.app.partners.editing, h.app.partners.editName, h.app.partners.editAbout = ma.ID, ma.Name, ma.About
		d302Both(t, h.app, h.tt, settle, "partner-model-change-"+itoa(int64(w)), lang)
	}
	// The agent pop-up open: the same as the default's, and each agent the home has.
	h.tt.SetSize(1150, 2300)
	h.app.partners.editing, h.app.partners.thinksOpen = ma.ID, "agent"
	d302Both(t, h.app, h.tt, settle, "partner-model-pick-1150", lang)
	h.app.partners.editing, h.app.partners.thinksOpen = "", ""
}
