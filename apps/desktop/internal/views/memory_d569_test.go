package views

import (
	"fmt"
	"image"
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// d569Devices is the author's three computers on 0.1.67 (D569): the home hel,
// haswell lent for tasks with its Claude Code signed out there (Codex signed
// in) and its plugin a version behind, and the MacBook with two copies of
// Codex's plugin. phase: "before", "updating", "done" or "away" for haswell.
func d569Devices(phase string) []protocol.DeviceView {
	cc := &protocol.MemPluginView{State: "update", Version: "0.7.37", Available: "0.7.38"}
	state := protocol.DeviceAwake
	switch phase {
	case "updating":
		cc.TaskID = "t_memupdate"
	case "done":
		cc = &protocol.MemPluginView{State: "installed", Version: "0.7.38", Updated: true}
	case "away":
		state = "asleep"
	}
	return []protocol.DeviceView{
		{ID: "local", Name: "hel", Kind: "server", Home: true, AlwaysOn: true, State: protocol.DeviceAwake, Harnesses: []protocol.DeviceHarness{
			{Harness: "claude-code", Installed: true, LoggedIn: true, CanBePartner: true, Mem: &protocol.MemPluginView{State: "installed", Version: "0.7.38"}},
			{Harness: "codex", Installed: true, LoggedIn: true, CanBePartner: true, Mem: &protocol.MemPluginView{State: "installed", Version: "0.1.53"}},
		}},
		{ID: "w-haswell", Name: "haswell", Kind: "server", State: state, Harnesses: []protocol.DeviceHarness{
			{Harness: "claude-code", Installed: true, LoggedIn: false, Mem: cc},
			{Harness: "codex", Installed: true, LoggedIn: true, Mem: &protocol.MemPluginView{State: "installed", Version: "0.1.53"}},
		}},
		{ID: "w-mbp", Name: "Macbook Pro M3", Kind: "laptop", State: protocol.DeviceAwake, Harnesses: []protocol.DeviceHarness{
			{Harness: "codex", Installed: true, LoggedIn: true, Mem: &protocol.MemPluginView{State: "review", Why: "multiple", Versions: []string{"0.1.10", "0.1.53"}}},
		}},
	}
}

// d569Check is what Nowledge Mem couldn't settle on the author's Mem
// (2026-11-25, read only), with the partner's suggestions as haiku judged
// them over Mem's own facts (research/232).
func d569Check(lang i18n.Lang) *protocol.MemCheck {
	why := map[i18n.Lang][4]string{
		i18n.ZH: {"后记的那条是更正：编号改成了 D527。", "先记的 D529 是统一分配的最终编号。", "发布说明收录了 D148，两条并不冲突。", "这是一条长期的部署规矩，值得每个 AI 都照着做。"},
		i18n.EN: {"The later one is a correction: the number moved to D527.", "The earlier note gives D529, the number assigned in the end.", "The release notes list D148 as shipped; both hold.", "A lasting deploy rule every AI tool should follow."},
	}[lang]
	return &protocol.MemCheck{
		Asks: []protocol.MemCheckItem{
			{ID: "3c9f7ab8", Kind: "contradiction", Pair: []protocol.MemPairItem{{Title: "D524 one row hover", At: "2026-11-24"}, {Title: "D527 one row hover (renumbered)", At: "2026-11-24"}}, Suggest: "newer", Why: why[0], Answers: []string{"newer", "older", "both"}},
			{ID: "d1fb295d", Kind: "contradiction", Pair: []protocol.MemPairItem{{Title: "D529 one row hover (final number)", At: "2026-11-24"}, {Title: "D527 one row hover (renumbered)", At: "2026-11-24"}}, Suggest: "older", Why: why[1], Answers: []string{"newer", "older", "both"}},
			{ID: "8628c162", Kind: "contradiction", Pair: []protocol.MemPairItem{{Title: "D148 opened task transcript and key redaction", At: "2026-11-09"}, {Title: "Ducter v0.0.4 release", At: "2026-11-09"}}, Suggest: "both", Why: why[2], Answers: []string{"newer", "older", "both"}},
			{ID: "rule:feishu-github-actions", Kind: "rule", Title: "Feishu 生产部署必须经 GitHub Actions 故障安全门禁", Body: "Production Feishu Worker 必须通过 GitHub Actions 的 fail-closed 门禁部署，且部署源需与当前 origin/main 的精确 SHA 完全一致。", Suggest: "use", Why: why[3], Answers: []string{"use", "not"}},
		},
		More: true,
	}
}

func d569App(t *testing.T, lang i18n.Lang, phase string) *App {
	t.Helper()
	app, _ := memApp(t, lang, "on")
	app.S.Mem.Check = d569Check(lang)
	app.Receive(protocol.ServerFrame{T: "devices", Devices: d569Devices(phase)})
	return app
}

// D569 (1): haswell's Claude Code is signed out there, its Codex isn't: the
// update runs there all the same (any AI there does it, as the home does), so
// its row carries 更新, the Overview's need is the update itself, and
// Memory's head carries it too. Away: no need, and the row says why.
func TestD569UpdateFromAnyComputer(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app := d569App(t, lang, "before")
		L := app.L
		var keys []string
		for _, n := range app.setNeeds() {
			keys = append(keys, n.key+">"+n.goLabel)
		}
		if fmt.Sprint(keys) != fmt.Sprintf("[memp:w-haswell:claude-code>%s]", L.T("memp.btn.update")) {
			t.Fatalf("%s: needs %v (Mem's asks must never be one)", lang, keys)
		}
		app.openTab(TabMemory)
		tt := ui.NewTesterWith(app.View, 1150, 3200, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		for i := 0; i < 4; i++ {
			tt.Advance(150 * time.Millisecond)
			tt.Frame()
		}
		need := L.T("need.memplug.on", "Claude Code", "haswell")
		head, ok := tt.Find(spoken(L, L.T("memp.btn.update"), need))
		if !ok {
			t.Fatalf("%s: no 更新 in Memory's head: %q", lang, tt.Texts())
		}
		row, ok := tt.Find(spoken(L, L.T("memp.btn.update"), spoken(L, "Claude Code", "haswell", "Nowledge Mem")))
		if !ok {
			t.Fatalf("%s: haswell's row has no 更新: %q", lang, tt.Texts())
		}
		if head.Y > 400 || row.Y < head.Y {
			t.Fatalf("%s: the head's fix at %v, the row's at %v", lang, head.Y, row.Y)
		}
		if lang == i18n.ZH && hasText(tt, L.T("need.go.update")) { // en's "Update" is 更新's word too
			t.Fatalf("%s: something still says 去更新", lang)
		}
		// Away: nothing claims an update; the row says why in one line.
		app.Receive(protocol.ServerFrame{T: "devices", Devices: d569Devices("away")})
		tt.Frame()
		if n := app.setNeeds(); len(n) != 0 {
			t.Fatalf("%s: needs while haswell is away: %v", lang, n)
		}
		if !hasText(tt, L.T("memp.cant.away", "haswell")) {
			t.Fatalf("%s: no why-not line: %q", lang, tt.Texts())
		}
		if _, ok := tt.Find(spoken(L, L.T("memp.btn.update"), spoken(L, "Claude Code", "haswell", "Nowledge Mem"))); ok {
			t.Fatalf("%s: 更新 offered while away", lang)
		}
	}
}

// D569 shots: Mac 1150, zh and en, light and dark: the Overview, Memory's top,
// haswell's row before / updating / done / away, Mem's asks folded and open,
// with 2x crops of the head and the asks.
//
//	DUCTER_D569_SHOTS=$PWD/../../.shots/memory-pane-2 go test ./internal/views -run D569Shots
func TestD569Shots(t *testing.T) {
	dir := os.Getenv("DUCTER_D569_SHOTS")
	if dir == "" {
		t.Skip("DUCTER_D569_SHOTS not set")
	}
	_ = os.MkdirAll(dir, 0o755)
	save := func(img image.Image, name string) {
		f, err := os.Create(filepath.Join(dir, name+".png"))
		if err != nil {
			t.Fatal(err)
		}
		defer f.Close()
		if err := png.Encode(f, img); err != nil {
			t.Fatal(err)
		}
	}
	settle := func(tt *ui.Tester) {
		for i := 0; i < 6; i++ {
			tt.Advance(150 * time.Millisecond)
			tt.Frame()
		}
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, dark := range []bool{false, true} {
			paper := map[bool]string{false: "light", true: "dark"}[dark]
			mk := func(phase string, h int) (*App, *ui.Tester) {
				app := d569App(t, lang, phase)
				tt := ui.NewTesterWith(app.View, 1150, h, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
				tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
				tt.SetDark(dark)
				return app, tt
			}
			// The Overview: one need, its fix right there.
			app, tt := mk("before", 900)
			app.openTab("")
			settle(tt)
			save(tt.Image(), fmt.Sprintf("mac-1-overview-%s-1150-%s", lang, paper))
			// Memory's top: the need with its 更新, Mem's asks as one quiet row further down.
			app, tt = mk("before", 900)
			app.openTab(TabMemory)
			settle(tt)
			save(tt.Image(), fmt.Sprintf("mac-2-memory-top-%s-1150-%s", lang, paper))
			tt.SetScale(2)
			settle(tt)
			save(tt.Image().SubImage(image.Rect(520, 100, 2300, 560)), fmt.Sprintf("mac-2x-head-%s-%s", lang, paper))
			// The whole pane, then haswell's row in each phase.
			for _, ph := range []string{"before", "updating", "done", "away"} {
				app, tt = mk(ph, 3000)
				app.openTab(TabMemory)
				settle(tt)
				img := tt.Image()
				save(img, fmt.Sprintf("mac-3-rows-%s-%s-1150-%s", ph, lang, paper))
				if r, ok := tt.Find(L(lang).T("memp.row", "Claude Code", "haswell")); ok {
					y := int(r.Y)
					save(img.SubImage(image.Rect(260, max(0, y-60), 1150, y+170)), fmt.Sprintf("mac-3-row-%s-%s-%s", ph, lang, paper))
				}
			}
			// Mem's asks: folded, then open.
			app, tt = mk("done", 3600)
			app.openTab(TabMemory)
			settle(tt)
			if r, ok := tt.Find(L(lang).T("mem.check.unsure", 4)); ok {
				y := int(r.Y)
				save(tt.Image().SubImage(image.Rect(260, max(0, y-80), 1150, y+140)), fmt.Sprintf("mac-4-asks-folded-%s-%s", lang, paper))
			}
			app.memPage.checkOpen = true
			settle(tt)
			if r, ok := tt.Find(L(lang).T("mem.check.unsure", 4)); ok {
				y := int(r.Y)
				img := tt.Image()
				save(img.SubImage(image.Rect(260, max(0, y-80), 1150, y+1250)), fmt.Sprintf("mac-4-asks-open-%s-1150-%s", lang, paper))
				tt.SetScale(2)
				settle(tt)
				save(tt.Image().SubImage(image.Rect(520, max(0, 2*y-160), 2300, 2*y+700)), fmt.Sprintf("mac-2x-asks-open-%s-%s", lang, paper))
			}
		}
	}
}

// L is a language's words, for the shots' lookups.
func L(lang i18n.Lang) *i18n.Strings { return i18n.New(lang) }
