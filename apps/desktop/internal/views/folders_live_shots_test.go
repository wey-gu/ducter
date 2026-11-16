package views

import (
	"os"
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
)

// D272 against a real core whose home is a server and whose GitHub sign-in
// is faked (apps/web/demo-clone.ts):
//
//	DUCTER_PORT=7813 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh DEMO_HOME_NAME="Hetzner Server" \
//	  DEMO_GH_APPROVE_MS=600000 bun apps/web/demo-clone.ts
//	DUCTER_D272_URL=ws://127.0.0.1:7813/ws DUCTER_SHOTS=1 DUCTER_SHOTS_DIR=<dir> \
//	  go test ./internal/views -run FoldersLiveShots
func TestFoldersLiveShots(t *testing.T) {
	url := os.Getenv("DUCTER_D272_URL")
	if url == "" {
		t.Skip("DUCTER_D272_URL not set")
	}
	lang := i18n.ZH
	if os.Getenv("DUCTER_SHELL_LANG") == "en" {
		lang = i18n.EN
	}
	h := newLive(t, url, lang)
	h.app.LocaleFixed = true
	L := h.app.L
	for _, w := range []int{900, 1280} {
		sz := "-" + string(lang) + map[int]string{900: "-900", 1280: "-1280"}[w]
		h.tt.SetSize(w, 820)
		h.app.nt = newTaskState{}
		h.app.OpenNewTask(nil)
		h.until("options", func() bool { return h.app.S.NewTaskOptions != nil })
		h.app.nt.words = map[i18n.Lang]string{i18n.ZH: "把 mem 的 README 写得更清楚", i18n.EN: "Make mem's README clearer"}[lang]
		h.app.nt.shut("place")
		h.until("list", func() bool { return h.tt.HasText(L.T("newtask.add")) })
		h.shot("live-list" + sz)
		h.click(L.T("newtask.add") + " · Hetzner Server")
		h.until("panel", func() bool { return h.tt.HasText(L.T("newtask.new", "Hetzner Server")) })
		h.shot("live-add" + sz)
		h.click(L.T("newtask.clone"))
		h.until("gh status", func() bool { return h.app.ghState(h.app.nt.clone.device) != nil })
		h.tt.Type("nowledge-co/mem")
		h.until("typed", func() bool { return h.tt.HasText(L.T("newtask.gh.signin", "Hetzner Server")) })
		h.shot("live-clone" + sz)
		h.click(L.T("newtask.gh.signin", "Hetzner Server"))
		h.until("code", func() bool { return h.app.nt.login != nil && h.app.nt.login.phase == "code" })
		h.shot("live-code" + sz)
		h.app.cancelGitLogin()
		h.until("back", func() bool { return h.app.nt.login == nil })
		h.app.nt.open = false
		h.tt.Frame()
	}
}
