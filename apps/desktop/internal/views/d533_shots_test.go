package views

import (
	"fmt"
	"image"
	"image/draw"
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

// D533: a Keep changed in place, on the author's review loop, his PR
// babysitter and the fare watch (apps/web/demo-keep-v2.ts): the rules at
// rest, each kind of rule's editor open (a rhythm, a clock, words, choices,
// the computer and agent pickers, a cap, a name), a real change saved (its
// line under the rules with 撤销, and its line among the rounds), undone, and
// the person's words edited and read into a diff for one Go. A live run only:
//
//	DUCTER_PORT=7533 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh bun apps/web/demo-keep-v2.ts
//	DUCTER_SHELL_URL=ws://127.0.0.1:7533/ws DUCTER_SHELL_LANG=zh DUCTER_SHOTS_DIR=<.shots/keep-edit/mac> \
//	  [DUCTER_SHOTS_DARK=1] go test ./internal/views -run D533Shots -count=1
func TestD533Shots(t *testing.T) {
	url := os.Getenv("DUCTER_SHELL_URL")
	if url == "" {
		t.Skip("DUCTER_SHELL_URL not set")
	}
	lang := i18n.ZH
	if os.Getenv("DUCTER_SHELL_LANG") == "en" {
		lang = i18n.EN
	}
	zh := lang == i18n.ZH
	w2 := func(z, e string) string {
		if zh {
			return z
		}
		return e
	}
	dir := shotsDir(t)
	h := dial(t, url, lang)
	h.until("welcome", func() bool { return h.app.S.Welcomed && h.app.S.OnHand != nil && len(h.app.S.OnHand.Keeps) > 0 })
	h.app.LocaleFixed, h.app.L = true, i18n.New(lang)
	h.tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	h.tt.SetPreferences(ui.Preferences{ReduceMotion: true})
	paper := "light"
	if os.Getenv("DUCTER_SHOTS_DARK") != "" {
		h.tt.SetDark(true)
		paper = "dark"
	}
	settle := func() {
		for i := 0; i < 10; i++ {
			start := time.Now()
			h.until("frames", func() bool { return time.Since(start) > 60*time.Millisecond })
			h.tt.Advance(200 * time.Millisecond)
		}
	}
	save := func(file string, img image.Image) {
		f, err := os.Create(filepath.Join(dir, file))
		if err != nil {
			t.Fatal(err)
		}
		_ = png.Encode(f, img)
		f.Close()
	}
	width := 0
	shoot := func(name string) { save(fmt.Sprintf("mac-%s-%d-%s-%s.png", name, width, lang, paper), h.tt.Image()) }
	crop := func(name string, r image.Rectangle) {
		src := h.tt.Image()
		r = r.Intersect(src.Bounds())
		out := image.NewRGBA(image.Rect(0, 0, r.Dx()*2, r.Dy()*2))
		for y := 0; y < r.Dy(); y++ {
			for x := 0; x < r.Dx(); x++ {
				c := src.At(r.Min.X+x, r.Min.Y+y)
				draw.Draw(out, image.Rect(x*2, y*2, x*2+2, y*2+2), &image.Uniform{c}, image.Point{}, draw.Src)
			}
		}
		save(fmt.Sprintf("mac-%s-2x-%d-%s-%s.png", name, width, lang, paper), out)
	}
	var review, sitter, fare string
	for _, k := range h.app.S.OnHand.Keeps {
		switch k.Run {
		case "same":
			if strings.Contains(k.Title, "100gle") {
				review = k.ID // the 45-minute review loop
			}
		case "perItem":
			sitter = k.ID
		case "fresh":
			fare = k.ID
		}
	}
	// Two computers and two agents, so 在哪儿做，谁来做 has a choice (D510).
	devices := []protocol.DeviceView{
		{ID: "local", Name: "Ada's MacBook Air", Kind: "laptop", Home: true, State: "online", Harnesses: []protocol.DeviceHarness{{Harness: "codex", Installed: true, LoggedIn: true}, {Harness: "claude-code", Installed: true, LoggedIn: true}}},
		{ID: "w-hel", Name: "hel", Kind: "server", State: "online", Harnesses: []protocol.DeviceHarness{{Harness: "codex", Installed: true, LoggedIn: true}}},
	}
	open := func(id string) *protocol.KeepPage {
		h.app.openKeep(id)
		h.until("page", func() bool { return h.app.S.KeepPages[id] != nil })
		settle()
		return h.app.S.KeepPages[id]
	}
	e := &h.app.oh.keep.edit
	rules := func() image.Rectangle { return image.Rect(width-372, 40, width-4, 900) }
	edited := false
	for _, w := range []int{1400, 1150, 1000} {
		width = w
		h.tt.SetSize(w, 1500)
		h.tt.Move(2, 2)
		h.app.Route = RouteOnHand
		h.app.closeKeep()

		// The review loop: at rest, its rhythm, its end, when it speaks, where and who.
		k := open(review)
		h.app.S.Devices = devices
		settle()
		shoot("review-rest")
		e.open, e.draft = "wakes", "60"
		settle()
		shoot("edit-every")
		crop("edit-every", rules())
		e.draft = "2"
		e.err, e.errAt = h.app.L.T("keep.edit.every.range"), "wakes"
		settle()
		shoot("edit-every-range")
		e.err, e.errAt = "", ""
		e.open, e.draft = "until", w2("所有 PR 都合并了", "Every PR has merged")
		settle()
		shoot("edit-until")
		e.open, e.sel = "speaks", 0
		settle()
		shoot("edit-speaks")
		e.open, e.sel, e.sel2 = "where", 1, 0
		settle()
		shoot("edit-where")
		crop("edit-where", rules())
		e.open = ""

		// A real change: the rhythm from 45 minutes to an hour, its line and 撤销, then undone.
		if !edited {
			prev := h.app.S.KeepChanged[review]
			h.app.keepSend(k, "wakes", protocol.KeepChange{EveryMinutes: 60}, false)
			h.until("changed", func() bool { return h.app.S.KeepChanged[review] != prev && h.app.S.KeepChanged[review] != nil })
			settle()
		}
		h.app.keepEditSync(review)
		if e.status == nil {
			e.status = h.app.S.KeepChanged[review]
		}
		settle()
		shoot("changed")
		crop("changed", rules())
		if !edited {
			if e.status != nil && e.status.Undo != nil {
				prev := h.app.S.KeepChanged[review]
				h.app.keepSend(h.app.S.KeepPages[review], "undo", *e.status.Undo, true)
				h.until("undone", func() bool { return h.app.S.KeepChanged[review] != prev })
			}
			edited = true
		} else {
			e.status = &protocol.KeepEditFrame{T: "keep_changed", ID: review, OK: true, Undone: true}
		}
		settle()
		h.app.keepEditSync(review)
		shoot("undone")

		// The person's words: being read, then the diff for one Go.
		e.words, e.said, e.reading = true, w2("持续评审 nowledge-co，每小时看一次，有新进展就跟我说一声；100gle 分给你的待办也一起处理。", "Keep reviewing nowledge-co, once an hour, and tell me when there's news; take the to-dos 100gle hands you too."), true
		settle()
		shoot("words-reading")
		e.reading, e.words = false, false
		e.proposal = &protocol.KeepEditFrame{T: "keep_proposal", ID: review, OK: true, Proposal: &protocol.KeepProposal{
			OK: true, Said: e.said,
			Change: protocol.KeepChange{Said: e.said, EveryMinutes: 60},
			Edits:  []protocol.KeepEdit{{Field: "said"}, {Field: "every", From: "45", To: "60"}, {Field: "speaks", To: h.app.L.T("keep.speaks.news")}},
		}}
		settle()
		shoot("words-diff")
		crop("words-diff", image.Rect(300, 120, width-372, 620))
		e.proposal.Proposal = &protocol.KeepProposal{OK: false, Said: e.said, Error: "failed"}
		settle()
		shoot("words-unread")
		e.proposal = nil

		// The rounds, with the change's lines among them.
		settle()
		shoot("rounds")

		// The babysitter: its cap a day and its name in Bridge.
		h.app.closeKeep()
		open(sitter)
		h.app.S.Devices = devices
		settle()
		shoot("sitter-rest")
		e.open, e.draft = "cap", "10"
		settle()
		shoot("edit-cap")
		crop("edit-cap", rules())
		e.open, e.draft = "address", "Nowledge Mem PR Babysitter"
		settle()
		shoot("edit-address")
		e.open = ""

		// The fare watch: its clock.
		h.app.closeKeep()
		fk := open(fare)
		h.app.S.Devices = devices
		if fk.At != nil {
			e.open, e.sel, e.draft2 = "wakes", 0, fk.At.Time
		}
		settle()
		shoot("edit-at")
		crop("edit-at", rules())
		e.open = ""
		h.app.closeKeep()
	}
}
