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

// D653 (research/244 rules 1 and 8): before and after, on the Mac. Before:
// every report of one fix is its own partner bubble (the measured 13–17 lines).
// After: the start, the one needs-you, the final result, and one living card
// under the message that started the work. Run:
//
//	DUCTER_SHOTS_DIR=$PWD/.shots/living-card go test ./internal/views -run TestSubjectCardShots
func TestSubjectCardShots(t *testing.T) {
	dir := os.Getenv("DUCTER_SHOTS_DIR")
	if dir == "" {
		t.Skip("DUCTER_SHOTS_DIR not set")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, before := range []bool{true, false} {
			app := subjectShotApp(t, lang, before)
			for _, w := range []int{1000, 1400} {
				for _, dark := range []bool{false, true} {
					tt := ui.NewTesterWith(app.View, w, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
					tt.SetScale(2)
					tt.SetDark(dark)
					tt.Frame()
					tt.Frame()
					paper := "light"
					if dark {
						paper = "dark"
					}
					side := "after"
					if before {
						side = "before"
					}
					name := fmt.Sprintf("%s-%s-%s-%d.png", side, langName(lang), paper, w)
					writeSubjectShot(t, filepath.Join(dir, name), tt.Image())
					// A 2x crop of the card itself, for the edges and the rhythm.
					title := "官网下载页的下载按钮"
					if lang == i18n.EN {
						title = "The download button on our site"
					}
					if !before {
						if b, ok := tt.Find(title + ": " + app.L.T("subject.done")); ok {
							cropSubjectCard(t, filepath.Join(dir, fmt.Sprintf("%s-%s-%s-%d-card@2x.png", side, langName(lang), paper, w)), tt.Image(), b, 2)
						}
					}
				}
			}
		}
	}
}

func langName(l i18n.Lang) string {
	if l == i18n.ZH {
		return "zh"
	}
	return "en"
}

func subjectShotApp(t *testing.T, lang i18n.Lang, before bool) *App {
	t.Helper()
	app, _ := iaApp(t, lang)
	app.LocaleFixed = true
	now := time.Now().UTC()
	at := func(min int) string { return now.Add(time.Duration(min-30) * time.Minute).Format(time.RFC3339) }
	zh := lang == i18n.ZH
	said := func(z, e string) string {
		if zh {
			return z
		}
		return e
	}
	evs := []protocol.LogEvent{
		protocol.NewEvent(1, at(0), "default", "channel", protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: said("官网下载页的下载按钮点不了，帮我修一下。", "The download button on our site doesn't work. Fix it please.")}),
		protocol.NewEvent(2, at(0), "default", "channel", protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: said("我去看看下载按钮，修好了告诉你。", "I'll look at the download button and tell you when it's fixed."), ReplyTo: 1}),
	}
	if before {
		// The old shape: each report is a new immutable partner message.
		lines := []struct{ z, e string }{
			{"找到了，是下载链接写到了一个已删除的文件。", "Found it: the link points at a deleted file."},
			{"改好了，开了 PR #578。", "Fixed it; opened PR #578."},
			{"本地跑了一遍，下载正常。", "Ran it here; the download works."},
			{"复查看过了，改动没问题。", "Reviewer looked; the change is fine."},
			{"CI 第一项过了。", "The first CI check passed."},
			{"CI 挂了，是缓存的旧依赖。", "CI failed on a stale cached dependency."},
			{"清了缓存，在重跑。", "Cleared the cache; running it again."},
			{"CI 绿了，还差一位评审。", "CI is green; one more review needed."},
			{"第二位评审看过了。", "A second reviewer looked."},
			{"在等合并。", "Waiting for the merge."},
			{"合并了。", "Merged."},
			{"线上下载按钮好了。", "The download button works now."},
			{"又看了一遍，线上正常。", "Checked again; the live site is fine."},
			{"把记录收个尾。", "Tidying up the notes."},
		}
		for i, l := range lines {
			evs = append(evs, protocol.NewEvent(int64(3+i), at(1+i), "default", "channel", protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: said(l.z, l.e), ReplyTo: 1}))
		}
	} else {
		evs = append(evs,
			protocol.NewEvent(3, at(2), "default", "channel", protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: said("CI 的缓存要不要清掉重跑？", "Should I clear CI's cache and run it again?"), ReplyTo: 1}),
			protocol.NewEvent(4, at(6), "default", "channel", protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: said("合并了，线上下载按钮好了。", "Merged. The download button works now."), ReplyTo: 1}),
			protocol.NewEvent(5, at(6), "default", "channel", protocol.OriginSystem, protocol.KindSubjectCard, protocol.SubjectCardBody{Card: protocol.SubjectCard{
				Key: "pr:acme/site#578", MsgSeq: 1, Title: said("官网下载页的下载按钮", "The download button on our site"), State: protocol.SubjectDone,
				Line: said("合并了，线上下载按钮好了。", "Merged. The download button works now."), TaskID: "fix", At: at(6),
			}}),
		)
	}
	app.Receive(protocol.ServerFrame{T: "events", Events: evs})
	return app
}

func writeSubjectShot(t *testing.T, file string, img *image.RGBA) {
	t.Helper()
	f, err := os.Create(file)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if err := png.Encode(f, img); err != nil {
		t.Fatal(err)
	}
}

// cropCard writes a 2x crop around a drawn text (the card's own rectangle plus
// a small margin), so corners and the title/state line can be looked at close.
func cropSubjectCard(t *testing.T, file string, img *image.RGBA, b ui.Rect, scale int) {
	t.Helper()
	m := 24 * scale
	x, y := int(b.X)*scale-m, int(b.Y)*scale-m
	w, h := int(b.W)*scale+2*m, int(b.H)*scale+2*m
	if x < 0 {
		x = 0
	}
	if y < 0 {
		y = 0
	}
	if x+w > img.Bounds().Dx() {
		w = img.Bounds().Dx() - x
	}
	if y+h > img.Bounds().Dy() {
		h = img.Bounds().Dy() - y
	}
	if w <= 0 || h <= 0 {
		return
	}
	sub := img.SubImage(image.Rect(x, y, x+w, y+h)).(*image.RGBA)
	writeSubjectShot(t, file, sub)
}
