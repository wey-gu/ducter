package views

import (
	"encoding/base64"
	"fmt"
	"image"
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// D670: Settings › 导入 / Import with plugin repositories. before (nothing installed, the
// Available list), after (Lody installed, its imported tasks), the online consent card, the
// person's unreviewed online reader's second tick, and the repositories sheet. Mac 1000 and 1400,
// zh and en, light and dark, with 2x crops.
//
//	DUCTER_SHOTS=1 DUCTER_SHOTS_DIR=$PWD/../../../../.shots/plugrepo/mac \
//	  go test ./internal/views -run ImportRepoShots
func TestImportRepoShots(t *testing.T) {
	if os.Getenv("DUCTER_SHOTS") == "" {
		t.Skip("DUCTER_SHOTS not set")
	}
	icon := func(name string) string {
		raw, err := os.ReadFile(filepath.Join("..", "..", "..", "..", ".plugins-repo", "repo", "plugins", name, "icon.png"))
		if err != nil {
			return ""
		}
		return "data:image/png;base64," + base64.StdEncoding.EncodeToString(raw)
	}
	repos := []protocol.ImportRepository{
		{ID: "official", URL: "https://github.com/wey-gu/ducter-plugins", Official: true, State: "ready", Plugins: func() *int { n := 2; return &n }()},
		{ID: "src-abc", URL: "https://github.com/lin/ducter-plugins", State: "ready", Plugins: func() *int { n := 1; return &n }()},
	}
	available := []protocol.ImportAvailable{
		{ID: "lody", App: "Lody", Name: "Lody", Version: "0.1.0", Commit: "a1b2c3d", Hash: "a1b2c3d", Source: "official", SourceURL: "https://github.com/wey-gu/ducter-plugins", SourceName: "wey-gu/ducter-plugins", Official: true, Reads: []string{"~/.lody/**", "~/.lody-oss/**"}, Uses: []protocol.ImportUse{{Command: "lody", Online: true, Why: protocol.ImportWhy{En: "It reads your conversations with the lody command already signed in on this computer, and goes online.", Zh: "它会用你电脑上已经登录的 lody 命令读你的对话，会联网。"}}}, Online: true, Detected: true, Reviewed: true, Icon: icon("lody")},
		{ID: "fixture-notes", App: "Fixture Notes", Name: "Fixture Notes", Version: "0.1.0", Commit: "a1b2c3d", Hash: "a1b2c3d", Source: "official", SourceURL: "https://github.com/wey-gu/ducter-plugins", SourceName: "wey-gu/ducter-plugins", Official: true, Reads: []string{"./threads.json"}, Detected: true, Reviewed: true},
		{ID: "acme-notes", App: "Acme Notes", Name: "Acme Notes", Version: "0.1.0", Commit: "a1b2c3d", Hash: "a1b2c3d", Source: "src-abc", SourceURL: "https://github.com/lin/ducter-plugins", SourceName: "lin/ducter-plugins", Official: false, Reads: []string{"~/Library/Application Support/AcmeNotes/**/*.sqlite*"}, Detected: true, Reviewed: false},
	}
	lody := protocol.ImportSourceRow{
		ID: "lody", App: "Lody", Kind: "plugin", State: "ready", Consented: true, Imported: 2, ImportedDay: "2026-11-28", Added: false, Reviewed: true,
		Repo: "https://github.com/wey-gu/ducter-plugins", Author: "the Ducter authors", Reads: []string{"~/.lody/**", "~/.lody-oss/**"},
		Online: true, Uses: []protocol.ImportUse{{Command: "lody", Online: true, Why: protocol.ImportWhy{En: "It reads your conversations with the lody command already signed in on this computer, and goes online.", Zh: "它会用你电脑上已经登录的 lody 命令读你的对话，会联网。"}}},
		Icon: icon("lody"), Last: &protocol.ImportLast{At: "2026-11-28T10:00:00Z", Threads: 2, Oldest: "2026-10-02", Skipped: 0},
	}
	person := protocol.ImportSourceRow{
		ID: "acme-notes", App: "Acme Notes", Kind: "plugin", State: "ready", Added: true, Unreviewed: true,
		Repo: "https://github.com/lin/ducter-plugins", Author: "Lin", Reads: []string{"~/Library/Application Support/AcmeNotes/**/*.sqlite*"},
		Online: true, NeedsOnlineConsent: true, Uses: []protocol.ImportUse{{Command: "lody", Online: true, Why: protocol.ImportWhy{En: "It reads your notes with the lody command already signed in on this computer, and goes online.", Zh: "它会用你电脑上已经登录的 lody 命令读你的笔记，会联网。"}}},
	}
	frame := func(sources []protocol.ImportSourceRow, avail []protocol.ImportAvailable) protocol.ServerFrame {
		return protocol.ServerFrame{T: "imports", Imports: &protocol.ImportsFrame{Sources: sources, Repositories: repos, Available: avail}}
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, dark := range []bool{false, true} {
			mode := "light"
			if dark {
				mode = "dark"
			}
			for _, width := range []int{1000, 1400} {
				app, _ := iaApp(t, lang)
				app.Status = client.Connected
				app.LocaleFixed = true
				app.Now = func() time.Time { return pastNow }
				if dark {
					app.T = theme.PebbleDark()
				}
				app.Receive(settingsFrame())
				app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{{ID: "local", Name: "Lin's MacBook Pro", Kind: "laptop", Home: true, State: protocol.DeviceAwake}}})
				app.openTab(TabImport)
				tt := ui.NewTesterWith(app.View, width, 1500, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
				tt.SetScale(2)
				tt.SetDark(dark)
				tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
				settle := func() {
					for i := 0; i < 4; i++ {
						tt.Frame()
						tt.Advance(120 * time.Millisecond)
					}
				}
				save := func(name string, height int) {
					tt.Move(float32(width)/2, 300)
					settle()
					shotTester(t, tt, fmt.Sprintf("mac-%s-%s-%s-%d", name, lang, mode, width))
					if width == 1000 {
						img := tt.Image()
						b := img.Bounds()
						y1 := height * 2
						if y1 > b.Dy() {
							y1 = b.Dy()
						}
						sub := img.SubImage(image.Rect(0, 0, b.Dx(), y1))
						f, err := os.Create(filepath.Join(shotsDir(t), fmt.Sprintf("crop-2x-mac-%s-%s-%s-%d.png", name, lang, mode, width)))
						if err != nil {
							t.Fatal(err)
						}
						defer f.Close()
						_ = png.Encode(f, sub)
					}
				}

				app.Receive(frame(nil, available))
				save("before", 1000)

				app.Receive(frame([]protocol.ImportSourceRow{lody}, available[1:]))
				save("after", 900)

				app.imports.consent = "lody"
				save("consent", 1200)
				app.imports.consent = ""

				app.Receive(frame([]protocol.ImportSourceRow{person}, available[:2]))
				app.imports.consent = "acme-notes"
				save("person-online", 1200)
				app.imports.consent = ""

				app.imports.addRepo = true
				app.imports.repoURL = "https://github.com/lin/ducter-plugins"
				save("repos", 1000)
				app.imports.addRepo = false
				app.imports.repoURL = ""
			}
		}
	}
}
