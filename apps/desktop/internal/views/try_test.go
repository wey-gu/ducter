package views

import (
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D154: 试一下 / Try it on the 上网 block opens the live view on a harmless
// page with no card behind it; its top line says which browser on which
// machine; Done closes it. DUCTER_SIGNIN_SHOTS=1 writes the block and the
// view (zh, en); DUCTER_LIVE_FRAME=<a JPEG> paints a real page into it.
func TestTryItOnTheBrowserBlock(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		zh := lang == i18n.ZH
		pick := func(z, e string) string {
			if zh {
				return z
			}
			return e
		}
		app, sent, tt := devicesApp(t, lang, protocol.DeviceAbility{ID: "web", State: "on", Where: "ducter", Detail: "157.0.8103.38"})
		app.Receive(protocol.ServerFrame{T: "browser_sites", Ready: true})
		tt.Frame()
		// D161: Try it is in 上网's ⓘ.
		if err := tt.Click(pick("这是做什么的 · 上网", "What this does · Browse")); err != nil {
			t.Fatal(err)
		}
		tt.Frame()
		tt.Frame()
		for _, want := range []string{pick("试一下", "Try it"), pick("打开一个测试网页，亲眼看看它能上网。", "Opens a test page so you can see it browse.")} {
			if !tt.HasText(want) {
				t.Fatalf("%s: no %q in %q", lang, want, tt.Texts())
			}
		}
		shoot(t, tt, "desktop-try-block-"+string(lang)+".png")
		if err := tt.Click(pick("试一下", "Try it")); err != nil {
			t.Fatal(err)
		}
		tt.Frame()
		open, ok := lastSent[protocol.LiveOpenReq](*sent)
		if !ok || !open.Try || open.DecisionID != protocol.TryLive || open.Width < 360 {
			t.Fatalf("%s: Try it sent %#v", lang, open)
		}
		data, w, h := testFrame(t)
		about := &protocol.BrowserAbout{Device: "hetzner-1", Name: "Chrome for Testing", Version: "157.0.8103.38", Profile: "ducter"}
		app.Receive(protocol.ServerFrame{T: "live", ID: "lv1", DecisionID: protocol.TryLive, State: "open", Site: "example.com", URL: "https://example.com/", Width: w, Height: h, Browser: about})
		app.Receive(protocol.ServerFrame{T: "live_frame", ID: "lv1", Seq: 1, Data: data, Width: w, Height: h})
		tt.Frame()
		tt.Frame()
		for _, want := range []string{
			"example.com",
			pick("Ducter 自己的浏览器 · 在 hetzner-1 上 · Chrome for Testing 157", "Ducter's own browser · on hetzner-1 · Chrome for Testing 157"),
			pick("这是 hetzner-1 上的浏览器看到的网页，不是你的 Chrome。点点看、滚一滚都行。", "This is the page as the browser on hetzner-1 sees it, not your Chrome. Click and scroll as you like."),
			pick("好了", "Done"),
		} {
			if !tt.HasText(want) {
				t.Errorf("%s: no %q in %q", lang, want, tt.Texts())
			}
		}
		if tt.HasText(pick("先不登了", "Not now")) {
			t.Errorf("%s: Try it has nothing to put off", lang)
		}
		if ack, ok := lastSent[protocol.LiveAckReq](*sent); !ok || ack.Seq != 1 {
			t.Errorf("%s: frame not acked: %#v", lang, ack)
		}
		shoot(t, tt, "desktop-try-view-"+string(lang)+".png")
		if err := tt.Click(pick("好了", "Done")); err != nil {
			t.Fatal(err)
		}
		if c, ok := lastSent[protocol.LiveCloseReq](*sent); !ok || c.ID != "lv1" || !c.Done {
			t.Errorf("%s: Done sent %#v", lang, c)
		}
		if app.S.Live != nil {
			t.Errorf("%s: the view stays open", lang)
		}
	}
}

// D154: what the app says by itself of a task's result is in the reader's
// language: the task's English sentence is not pasted for a Chinese reader,
// and an English evidence label becomes a neutral one.
func TestTaskWordsInTheReadersLanguage(t *testing.T) {
	app, _ := iaApp(t, i18n.ZH)
	it := protocol.LivingItem{TaskID: "t1", Kind: "done", Title: "连上 Nowledge Mem", Text: "Installed standalone CLI 0.10.116 and native Codex plugin 0.1.49 with hooks enabled; all doctor checks pass."}
	if got := app.livingWords(it); got != "连上 Nowledge Mem 做完了。" {
		t.Errorf("zh fallback: %q", got)
	}
	it.Text = "装好了，检查都过了。"
	if got := app.livingWords(it); got != "连上 Nowledge Mem 做完了：装好了，检查都过了。" {
		t.Errorf("zh words kept: %q", got)
	}
	if got := app.proofLabel(protocol.EvidenceRef{Kind: "log", Label: "Connection verification", Ref: "nmem status"}); got != "运行记录" {
		t.Errorf("zh proof: %q", got)
	}
	if got := app.proofLabel(protocol.EvidenceRef{Kind: "url", Label: "Live MCP Context Bundle", Ref: "https://mem.nowledge.co/mcp"}); got != "mem.nowledge.co" {
		t.Errorf("zh proof url: %q", got)
	}
	en, _ := iaApp(t, i18n.EN)
	if got := en.livingWords(protocol.LivingItem{Kind: "failed", Title: "Connect Mem", Text: "nmem 没连上"}); got != "Connect Mem didn't work. Details has its own words." {
		t.Errorf("en fallback: %q", got)
	}
}
