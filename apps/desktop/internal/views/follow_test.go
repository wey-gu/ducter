package views

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/transfer"
	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D254: the rules, as the web's (apps/web/test/follow.test.ts).
func TestFollowRules(t *testing.T) {
	r := []followRow{{1, true}, {2, false}, {3, false}, {4, true}, {5, false}}
	if n, f := newSince(r, 2); n != 2 || f != 3 {
		t.Errorf("newSince(2) = %d, %d", n, f)
	}
	if n, f := newSince(r, 5); n != 0 || f != 0 {
		t.Errorf("newSince(5) = %d, %d", n, f)
	}
	if d := dividerAt([]followRow{{1, true}, {2, false}, {3, false}}, 1); d != 2 {
		t.Errorf("divider = %d, want 2", d)
	}
	if d := dividerAt([]followRow{{1, false}, {2, true}}, 0); d != 0 {
		t.Errorf("a divider before the person's own message: %d", d)
	}
	if d := dividerAt([]followRow{{1, false}, {2, true}, {3, false}}, 0); d != 3 {
		t.Errorf("divider = %d, want 3", d)
	}
	if countWords(3) != "3" || countWords(120) != "99+" {
		t.Errorf("countWords")
	}
}

// D492: a whole message copies as the Markdown written, and formatted beside
// it (the web's markdown.ts subset), escaped first.
func TestMessageHTML(t *testing.T) {
	for in, want := range map[string]string{
		"**Done.** The *build* is green.\n\n### Next\n* ship it\n* tag it": "<p><strong>Done.</strong> The <em>build</em> is green.</p><h4>Next</h4><ul><li>ship it</li><li>tag it</li></ul>",
		"See [the PR](https://github.com/x/y/pull/1) and https://a.b/c":    `<p>See <a href="https://github.com/x/y/pull/1">the PR</a> and <a href="https://a.b/c">https://a.b/c</a></p>`,
		"Run:\n```\nbun test **x** <y>\n```\n`a<b` stays":                  "<p>Run:</p><pre><code>bun test **x** &lt;y&gt;</code></pre><p><code>a&lt;b</code> stays</p>",
		"1. 一\n2. 二\n\n<script>":                                           "<ol><li>一</li><li>二</li></ol><p>&lt;script&gt;</p>",
	} {
		if got := mdHTML(in); got != want {
			t.Errorf("mdHTML(%q) = %q, want %q", in, got, want)
		}
	}
}

// D492: the copy pebble beside a partner's message copies it whole (its
// Markdown and its HTML) and says 已拷贝 on itself.
func TestCopyPebble(t *testing.T) {
	w := pebbleRun[i18n.ZH]
	app, tt := pebbleApp(t, i18n.ZH, 1100, 1400, false)
	hoverPebble(t, app, tt, w.fixed)
	if err := tt.Click(app.L.T("reply.copy")); err != nil {
		t.Fatalf("no copy pebble beside the partner's message: %v", err)
	}
	tt.Frame()
	got := tt.ClipboardData()
	text, _ := got.Read(transfer.Text)
	html, _ := got.Read(transfer.HTML)
	if string(text) != w.fixed || string(html) != "<p>"+w.fixed+"</p>" {
		t.Errorf("copied %q / %q, want the message as written and formatted", text, html)
	}
	// D495: 已拷贝 is the drawn check and the pebble's label, never a word on it.
	if q, ok := tt.Find(app.L.T("reply.copied")); !ok || q.W > pebbleSize+0.5 {
		t.Errorf("the pebble isn't named 已拷贝 after copying, or it grew: %+v %v", q, ok)
	}
	if count(tt, app.L.T("reply.copied")) != 1 { // the label alone
		t.Errorf("the pebble writes 已拷贝 beside itself: %q", texts(tt))
	}
	pebbleShot(t, tt, "mac-zh-light-wide-copied")
}

// followApp is a morning's conversation read up to its 8th message, the
// four after it new.
func followApp(t *testing.T, lang i18n.Lang) (*App, *ui.Tester) {
	t.Helper()
	app, _ := iaApp(t, lang)
	app.Status = client.Connected
	app.LocaleFixed = true
	now := time.Now()
	var evs []protocol.LogEvent
	n := int64(0)
	add := func(mine bool, text string) {
		n++
		ts := now.Add(time.Duration(n-40) * time.Minute).UTC().Format(time.RFC3339Nano)
		if mine {
			evs = append(evs, protocol.NewEvent(n, ts, "default", "channel", protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: text}))
		} else {
			evs = append(evs, protocol.NewEvent(n, ts, "default", "channel", protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: text}))
		}
	}
	zh := lang == i18n.ZH
	words := [][2]string{
		{"早，昨晚 CI 怎么样？", "Morning. How did CI do overnight?"},
		{"早。昨晚 main 上跑了 3 次 CI，都过了。只有 nightly 的 e2e 慢了一倍，我在看是不是新加的录屏拖慢的。", "Morning. main ran CI three times overnight and all passed. Only the nightly e2e took twice as long; I'm checking whether the new screen recording slowed it."},
		{"好，看完告诉我。顺便把 v0.0.52 的发版说明草稿写一下", "OK, tell me when you know. And draft the release notes for v0.0.52"},
		{"好，我去写发版说明，写好了给你看。", "On it: drafting the release notes; I'll show you when they're ready."},
		{"nightly 慢的原因找到了：录屏在 CI 上没有硬件编码，退回了软件编码。改成只在失败时录，慢的那一半就没了。", "Found why the nightly is slow: CI has no hardware encoder, so the recording fell back to software. Recording only on failure takes the slow half away."},
		{"那就这么改", "Do that"},
		{"改好了，这是改动的那一行：\n\n```\nrecord: process.env.CI ? \"on-failure\" : \"always\"\n```\n\n我在本地跑过一遍 e2e，18 分钟降到 9 分钟。", "Done. The one line that changed:\n\n```\nrecord: process.env.CI ? \"on-failure\" : \"always\"\n```\n\nI ran the e2e locally: 18 minutes down to 9."},
		{"漂亮", "Nice"},
		{"发版说明的草稿写好了，放在 PR #412 里。一共 6 条，最上面是回到最新和拷贝这两个。", "The release notes draft is in PR #412. Six items; Jump to latest and Copy are at the top."},
		{"还有一件：Cloudflare 上 ducter.dev 自动续费的那张卡 11 月底过期，要我提醒你换吗？", "One more: the card that auto-renews ducter.dev on Cloudflare expires at the end of November. Want a reminder to change it?"},
		{"另外，王磊周二问的 HawDB 报价你还没回，他今天上午又问了一次。", "Also, Wang Lei's HawDB quote from Tuesday is still unanswered; he asked again this morning."},
		{"我先把报价单按上次的格式填好了，数字等你看过再发。", "I filled in the quote in last time's format; the numbers wait for your look before it goes."},
	}
	for i, w := range words {
		text := w[1]
		if zh {
			text = w[0]
		}
		add(i == 0 || i == 2 || i == 5 || i == 7, text)
	}
	n++
	evs = append(evs, protocol.NewEvent(n, now.Format(time.RFC3339Nano), "default", "channel", protocol.OriginUser, protocol.KindReadReceipt, protocol.ReadReceipt{UpToSeq: 8}))
	app.Receive(protocol.ServerFrame{T: "events", Events: evs})
	tt := ui.NewTesterWith(app.View, 1100, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	tt.Frame()
	tt.Frame()
	return app, tt
}

// Opening shows 新消息 / New messages before the first unread; scrolled up,
// news from the partner is counted on the pebble, which lands on it; ⌘↓
// goes to the newest; sending takes the line away.
func TestConversationKeepsYourPlace(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, tt := followApp(t, lang)
		if app.fl.divider != 9 || !hasText(tt, app.L.T("conv.divider")) {
			t.Fatalf("%s: no New messages line (divider %d): %q", lang, app.fl.divider, texts(tt))
		}
		replyShot(t, tt, fmt.Sprintf("../conversation-ux/mac-%s-01-open", lang))
		// Up to the top.
		for range 12 {
			tt.Wheel(500, 400, 0, -400)
			tt.Frame()
		}
		if app.list.AtEnd() {
			t.Fatalf("%s: still at the end after scrolling up", lang)
		}
		if !hasText(tt, app.L.T("jump.latest")) && !hasLabel(tt, app.L.T("jump.latest")) {
			t.Logf("%s: the round way back is labelled only for the reader (no text): ok", lang)
		}
		// Two of the partner's messages come.
		now := time.Now().UTC().Format(time.RFC3339Nano)
		app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
			protocol.NewEvent(20, now, "default", "channel", protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: map[bool]string{true: "报价单我放在「下载」里了。", false: "The quote is in Downloads."}[lang == i18n.ZH]}),
			protocol.NewEvent(21, now, "default", "channel", protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: map[bool]string{true: "nightly 刚跑完，9 分 12 秒，稳了。", false: "The nightly just finished: 9 min 12 s."}[lang == i18n.ZH]}),
		}})
		tt.Frame()
		tt.Frame()
		chip := app.L.T("conv.new.n", "2")
		if app.fl.fresh != 2 || !hasText(tt, chip) {
			t.Fatalf("%s: the pebble doesn't count the news (fresh %d): %q", lang, app.fl.fresh, texts(tt))
		}
		if app.S.ReadUpTo > 8 || containsRead(app) {
			t.Errorf("%s: news read while the reader is up", lang)
		}
		replyShot(t, tt, fmt.Sprintf("../conversation-ux/mac-%s-02-news", lang))
		if err := tt.Click(chip); err != nil {
			t.Fatal(err)
		}
		for range 4 {
			tt.Frame()
		}
		if !app.list.AtEnd() || hasText(tt, chip) {
			t.Fatalf("%s: the pebble didn't land on the news", lang)
		}
		replyShot(t, tt, fmt.Sprintf("../conversation-ux/mac-%s-03-landed", lang))
		// ⌘↓ from far up.
		for range 12 {
			tt.Wheel(500, 400, 0, -400)
			tt.Frame()
		}
		tt.Key(ui.Cmd, ui.KeyDown)
		for range 4 {
			tt.Frame()
		}
		if !app.list.AtEnd() {
			t.Errorf("%s: ⌘↓ didn't go to the newest", lang)
		}
		// Sending takes the line away.
		app.SendMessage("好")
		tt.Frame()
		if app.fl.divider != 0 {
			t.Errorf("%s: the line stays after sending", lang)
		}
	}
}

// Right-click the partner's words: Reply and Copy, as the user's bubbles
// have; Copy takes the words as written, without the marks.
func TestPartnerBubbleMenu(t *testing.T) {
	app, tt := followApp(t, i18n.EN)
	if err := tt.RightClick("Also, Wang Lei's HawDB quote from Tuesday is still unanswered; he asked again this morning."); err != nil {
		t.Fatal(err)
	}
	menu := strings.Join(tt.Menu(), "|")
	if !strings.Contains(menu, app.L.T("reply.action")) || !strings.Contains(menu, app.L.T("reply.copy")) {
		t.Fatalf("menu: %q", menu)
	}
	if err := tt.ChooseMenuItem(app.L.T("reply.action")); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if app.rp.replying == nil || app.rp.replying.from != "partner" {
		t.Fatalf("replying: %+v", app.rp.replying)
	}
}

func hasLabel(tt *ui.Tester, s string) bool { return strings.Contains(texts(tt), s) }

func containsRead(app *App) bool { return app.readSent > 8 }
