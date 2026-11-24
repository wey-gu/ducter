package views

// The locator's marks (D526): its fixture, a PR review task the partner
// handed over, as the author's own (#11105), with three landmarks or twelve,
// and its shots: the rail at rest and pointed at, the card with 3 and 12,
// light and dark, zh and en, at 1150 and 1400, 2x crops.

import (
	"fmt"
	"image"
	"image/draw"
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// reviewTask is the author's PR review, handed over by the partner: the
// brief (whose first line is the partner's note to the agent, never shown in
// the locator), a done report, the person's reply; with many, the rest of
// the afternoon: an ask that waits, notes, the partner's words, more reports.
func reviewTask(id string, lang i18n.Lang, many bool, waiting bool) []protocol.LogEvent {
	zh := lang == i18n.ZH
	w := func(z, e string) string {
		if zh {
			return z
		}
		return e
	}
	stream := "task:" + id
	seq := int64(500)
	day := time.Now().In(time.Local)
	at := time.Date(day.Year(), day.Month(), day.Day(), 15, 9, 0, 0, time.Local)
	var evs []protocol.LogEvent
	add := func(o protocol.Origin, kind string, body any) {
		evs = append(evs, protocol.NewEvent(seq, at.UTC().Format("2006-01-02T15:04:05.000Z"), "default", stream, o, kind, body))
		seq++
		at = at.Add(20 * time.Second)
	}
	to := func(h, m int) { at = time.Date(day.Year(), day.Month(), day.Day(), h, m, 0, 0, time.Local) }
	te := func(m map[string]any) map[string]any { m["taskId"] = id; return m }
	work := func(n int) {
		for i := 0; i < n; i++ {
			add(protocol.OriginTask, protocol.KindTaskEvent, te(map[string]any{"role": "tool", "tool": map[string]any{"name": "Bash", "input": map[string]any{"command": fmt.Sprintf("gh pr diff 11105 --patch | head -%d", 200+i), "description": "Read the diff"}, "output": "ok", "ok": true}}))
		}
	}
	report := func(state, sum string) {
		add(protocol.OriginTask, "report", map[string]any{"taskId": id, "state": state, "summary": sum, "questions": []any{}, "evidence": []any{}})
	}
	say := func(from, text string) {
		o := protocol.OriginUser
		if from == "partner" {
			o = protocol.OriginPartner
		}
		add(o, protocol.KindTaskEvent, te(map[string]any{"role": "user", "from": from, "text": text}))
	}
	to(15, 9)
	add(protocol.OriginPartner, protocol.KindTaskOpen, map[string]any{"taskId": id, "title": w("走查 #11105 并修掉发现的问题", "Review #11105 and fix what it finds"),
		"project": "tidb", "place": map[string]any{"kind": "repo", "repoPath": "/Users/weyl/dev/tidb"}, "harness": "claude-code", "model": "claude-opus-5-5",
		"brief": w("用户原话：「接，这个用 /lgtm 的方式过一下 #11105，有问题就直接修。」\n走查 #11105：读完 diff，跑相关测试，发现的问题直接修在分支上，最后告诉他结论。",
			"The user said: \"Take this, run #11105 through the /lgtm way, fix anything you find.\"\nReview #11105: read the diff, run its tests, fix what you find on the branch, then tell him the verdict."),
		"origin": "partner"})
	add(protocol.OriginSystem, protocol.KindTaskState, map[string]any{"taskId": id, "attention": "working", "residency": "hot"})
	work(6)
	to(15, 45)
	say("partner", "等到了：「CI 跑完了」。接着做。") // Ducter's own words to the agent, in every language
	work(3)
	report("done", w("已完成 #11105 走查并修复两项问题，CI 全绿，等你说合不合。", "Reviewed #11105 and fixed two problems; CI is green, merge when you say."))
	to(15, 49)
	say("user", w("可以，我们自己评论 /lgtm 吧，然后可以合了", "OK, let's comment /lgtm ourselves, then it can merge"))
	work(2)
	if many {
		to(15, 52)
		report("progress", w("评论了 /lgtm，在等 Prow 的合并队列", "Commented /lgtm; waiting in Prow's merge queue"))
		to(16, 5)
		say("partner", "等到了：「合并队列有动静」。接着做。")
		work(2)
		to(16, 12)
		say("partner", "等到了：「合并队列有动静」。接着做。")
		work(2)
		to(16, 20)
		report(map[bool]string{true: "needs_input", false: "needs_input"}[waiting], w("Prow 还要一个 /approve，找谁来批？", "Prow wants one more /approve: who should approve it?"))
		to(16, 24)
		say("user", w("找 Weizhen 看一下", "Ask Weizhen to look"))
		work(2)
		to(16, 58)
		say("partner", w("Weizhen 批了，接着把它合进去", "Weizhen approved it; go on and merge it"))
		work(2)
		to(17, 3)
		report("done", w("#11105 已合进 master，分支删掉了", "#11105 is merged into master and its branch deleted"))
		to(17, 6)
		say("user", w("顺便看一下 #11112 的测试为什么老是挂", "While you're there, see why #11112's tests keep failing"))
		work(3)
		to(17, 20)
		report("progress", w("#11112 的失败是一个假时钟没推进，正在修", "#11112 fails because a fake clock never advances; fixing it"))
		to(17, 34)
		report(map[bool]string{true: "needs_input", false: "failed"}[waiting], w("#11112 的修法要改公共接口，要我直接改吗？", "Fixing #11112 changes a public interface: shall I just change it?"))
		if waiting {
			add(protocol.OriginSystem, protocol.KindTaskState, map[string]any{"taskId": id, "attention": "needs_you", "residency": "hot"})
		}
	}
	return evs
}

// openReview opens reviewTask in a window w wide at scale 2.
func openReview(t *testing.T, w int, lang i18n.Lang, dark, many bool) (*App, *ui.Tester) {
	t.Helper()
	evs := reviewTask("rv1", lang, many, true)
	app, _ := iaApp(t, lang)
	app.Status = client.Connected
	app.LocaleFixed = true
	tt := ui.NewTesterWith(app.View, w, 820, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.SetScale(2)
	tt.SetDark(dark)
	tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	app.OpenTask("rv1")
	app.Receive(protocol.ServerFrame{T: "task_index", TaskID: "rv1", Index: indexOf(evs)})
	app.Receive(protocol.ServerFrame{T: "task_history", TaskID: "rv1", Events: evs})
	for i := 0; i < 6; i++ {
		tt.Advance(100 * time.Millisecond)
		tt.Frame()
	}
	return app, tt
}

// TestLocatorMarkShots: with DUCTER_SHOTS_DIR set, the rail at rest and
// pointed at, the card with 3 and 12, and 2x crops of the rail and the card.
func TestLocatorMarkShots(t *testing.T) {
	dir := os.Getenv("DUCTER_SHOTS_DIR")
	if dir == "" {
		t.Skip("DUCTER_SHOTS_DIR not set")
	}
	_ = os.MkdirAll(dir, 0o755)
	save := func(img image.Image, name string) {
		t.Helper()
		f, err := os.Create(filepath.Join(dir, name+".png"))
		if err != nil {
			t.Fatal(err)
		}
		defer f.Close()
		if err := png.Encode(f, img); err != nil {
			t.Fatal(err)
		}
	}
	crop := func(img *image.RGBA, r ui.Rect, pad float32) image.Image {
		x0, y0 := int((r.X-pad)*2), int((r.Y-pad)*2)
		x1, y1 := int((r.X+r.W+pad)*2), int((r.Y+r.H+pad)*2)
		rc := image.Rect(max(0, x0), max(0, y0), min(img.Bounds().Dx(), x1), min(img.Bounds().Dy(), y1))
		out := image.NewRGBA(image.Rect(0, 0, rc.Dx(), rc.Dy()))
		draw.Draw(out, out.Bounds(), img, rc.Min, draw.Src)
		return out
	}
	for _, w := range []int{1150, 1400} {
		for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
			for _, dark := range []bool{false, true} {
				for _, many := range []bool{false, true} {
					look := map[bool]string{false: "light", true: "dark"}[dark]
					n := map[bool]string{false: "3", true: "12"}[many]
					name := fmt.Sprintf("mac-%d-%s-%s-%s", w, n, lang, look)
					app, tt := openReview(t, w, lang, dark, many)
					step := func() {
						for i := 0; i < 5; i++ {
							tt.Advance(100 * time.Millisecond)
							tt.Frame()
						}
					}
					if many {
						scrollTaskTo(app, "rv1", 0.45)
					}
					tt.Move(300, 400)
					step()
					info, ok := tt.AccessByRole(ui.RoleNavigation, app.L.T("locator.name"))
					if !ok {
						t.Fatalf("%s: no locator", name)
					}
					b := info.Bounds
					rest := tt.Image()
					save(rest, name+"-rest")
					save(crop(rest, b, 24), name+"-rest-rail2x")
					// Pointed at: the middle of the rail (12) or the second item (3).
					y := b.Y + b.H/2
					tt.Move(b.X+b.W/2, y)
					step()
					hover := tt.Image()
					save(hover, name+"-hover")
					pop := ui.Rect{X: b.X - 340, Y: b.Y - 40, W: 360 + b.W, H: b.H + 60}
					if x, ok := tt.AccessByRole(ui.RoleList, app.L.T("locator.name")); ok {
						pop = x.Bounds
						bot := max(pop.Y+pop.H, b.Y+b.H)
						pop.W = b.X + b.W - pop.X
						pop.Y = min(pop.Y, b.Y)
						pop.H = bot - pop.Y
					}
					save(crop(hover, pop, 20), name+"-hover-card2x")
					// Keys: a click pins it, ↓ moves the choice.
					tt.ClickAt(b.X+b.W/2, y)
					tt.Frame()
					tt.Move(300, 400)
					tt.Key(0, ui.KeyDown)
					step()
					save(crop(tt.Image(), pop, 20), name+"-keys-card2x")
				}
			}
		}
	}
	// A loop of 3,000 events (hundreds of landmarks): the rail at rest and pointed at.
	for _, dark := range []bool{false, true} {
		look := map[bool]string{false: "light", true: "dark"}[dark]
		app, tt := openLongIndexed(t, 3000, i18n.ZH, dark, true)
		tt.SetScale(2)
		scrollTaskTo(app, "long1", 0.4)
		for i := 0; i < 5; i++ {
			tt.Advance(100 * time.Millisecond)
			tt.Frame()
		}
		info, ok := tt.AccessByRole(ui.RoleNavigation, app.L.T("locator.name"))
		if !ok {
			t.Fatal("no locator on the long loop")
		}
		b := info.Bounds
		save(crop(tt.Image(), b, 24), "mac-long-zh-"+look+"-rest-rail2x")
		tt.Move(b.X+b.W/2, b.Y+b.H*0.4)
		for i := 0; i < 5; i++ {
			tt.Advance(100 * time.Millisecond)
			tt.Frame()
		}
		img := tt.Image()
		save(img, "mac-long-zh-"+look+"-hover")
		save(crop(img, ui.Rect{X: b.X - 380, Y: b.Y - 40, W: 400 + b.W, H: b.H + 80}, 0), "mac-long-zh-"+look+"-hover2x")
	}
}
