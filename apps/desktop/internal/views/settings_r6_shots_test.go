package views

import (
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
)

// D618: the evidence for D604's Mac leftover: a Space's name stays whole,
// and a long path is one line cut in the middle. It renders two rule rows at 2x,
// light and dark. The before is the same view from the baseline commit with
// R6_RAW=1 (plain spaces, the old wrapPath), so the two shots differ only in
// the row's own text.
//
//	DUCTER_SHOTS_R6=1 DUCTER_SHOTS_DIR=<.shots/settings-r6/after/mac> go test ./internal/views -run R6Shots
func TestR6Shots(t *testing.T) {
	if os.Getenv("DUCTER_SHOTS_R6") == "" {
		t.Skip("DUCTER_SHOTS_R6 not set")
	}
	raw := os.Getenv("R6_RAW") != ""
	label := os.Getenv("R6_LABEL")
	if label == "" {
		label = "after"
	}
	app, _ := iaApp(t, i18n.ZH)
	space := func(s string) string {
		if raw {
			return s
		}
		return strings.ReplaceAll(s, " ", "\u00a0")
	}
	name := "Nowledge Mem PR Babysitter Team Space"
	path := "/Users/weyl/dev/ducter/.claude/worktrees/a-very-long-worktree-name/apps/desktop/internal/views"
	for _, dark := range []bool{false, true} {
		paper := map[bool]string{false: "light", true: "dark"}[dark]
		tt := ui.NewTesterWith(func(c *ui.Context) {
			ui.Column(c).Width(560).Padding(24, 24).Gap(12).Children(func() {
				app.editRow(c, editRowOpts{
					key: "address", label: "别的 agent 怎么找到它",
					values: []string{"收信的名字：" + space(name), "在这些 Space 收信：" + space("dev team") + "、" + space("Nowledge Co/mem") + "、" + space("Before the team") + "、" + space("Nowledge Mem") + "、" + space("Everyone")},
					muted:  "在 Nowledge Mem 里能找到", can: true, last: false, about: name,
				})
				app.editRow(c, editRowOpts{key: "folder", label: "Ducter 文件夹", values: []string{path}, can: true, last: true, mono: true, about: path})
			})
		}, 620, 340, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.SetScale(2)
		tt.SetDark(dark)
		tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
		for i := 0; i < 3; i++ {
			tt.Frame()
		}
		f, err := os.Create(filepath.Join(shotsDir(t), fmt.Sprintf("mac-r6-editrow-zh-%s-%s.png", paper, label)))
		if err != nil {
			t.Fatal(err)
		}
		_ = png.Encode(f, tt.Image())
		f.Close()
	}
}
