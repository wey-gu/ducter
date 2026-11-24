package views

import (
	"fmt"
	"image/png"
	"math"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// longChannel is two days of a developer's conversation with the partner
// (D506): 360 messages, a read receipt after each answer (as the Log has
// them: about one event in three is a message), crossing midnight twice.
func longChannel() []protocol.LogEvent {
	asks := []string{
		"CI 又红了，看一下是哪个测试", "PR #45 的评论都回了吗", "把 nightly 的 e2e 时间降一下",
		"hel 上的 Ducter 升到最新了吗", "帮我看下 Mem 的 Bridge 为什么连不上", "发版说明写一下",
		"iOS 模拟器里看一下手机的设置页", "Android 那个折叠屏布局再检查一次", "把昨天那个任务接着做完",
		"看下 Codex 这周的用量还剩多少", "给 Weizhen 的反馈整理成几条", "把 on-hand 那条横条的高度对齐",
	}
	answers := []string{
		"看了：是一个测试用了真时钟，偶尔超时。我改成了假时钟，连跑 20 次都过了。",
		"都回了，还剩一条要你定：要不要把重试次数调到 3。我建议不调，先找原因。",
		"录屏在 CI 上退回了软件编码。改成只在失败时录，18 分钟降到 9 分钟。",
		"升到了 0.1.30，重启后会话都在，正在跑的两个任务也接上了。",
		"Mem 那边返回 503，是它的服务端忙。我过半小时再试一次，好了告诉你。",
		"草稿写好了，放在 PR 里，最上面两条是这次最显眼的改动。",
		"看了，设置页在大字号下第二行会挤，我把它改成换行了，截图在任务里。",
		"折叠屏展开时左右两栏都对，合上时底部栏遮住了一行，已经修了。",
		"接着做完了：剩下的两个测试补上了，CI 是绿的，等你合并。",
		"这周还剩不到一半，按现在的用法够用到周日。",
		"整理成了七条，按影响从大到小排好了，要我直接发给他吗？",
		"对齐了：横条和卡片的边现在在同一条线上，1000 和 1400 宽都看过。",
	}
	start := time.Date(2026, 11, 22, 9, 0, 0, 0, time.FixedZone("CST", 8*3600))
	var evs []protocol.LogEvent
	seq := int64(0)
	at := start
	add := func(origin protocol.Origin, kind string, body any) {
		seq++
		evs = append(evs, protocol.NewEvent(seq, at.UTC().Format(time.RFC3339Nano), "default", "channel", origin, kind, body))
	}
	for i := 0; i < 180; i++ {
		k := i % len(asks)
		round := i / len(asks)
		ask, answer := asks[k], answers[k]
		if round > 0 {
			ask = fmt.Sprintf("%s（第 %d 次）", ask, round+1)
		}
		add(protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: ask})
		at = at.Add(40 * time.Second)
		add(protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: answer})
		add(protocol.OriginUser, protocol.KindReadReceipt, protocol.ReadReceipt{UpToSeq: seq})
		at = at.Add(11 * time.Minute)
	}
	return evs
}

// olderAnswer is what core's channelPage sends for the page before before.
func olderAnswer(evs []protocol.LogEvent, before int64, limit int) protocol.ServerFrame {
	var page []protocol.LogEvent
	for _, e := range evs {
		if e.Seq < before {
			page = append(page, e)
		}
	}
	more := len(page) > limit
	if more {
		page = page[len(page)-limit:]
	}
	return protocol.ServerFrame{T: "channel_history", Events: page, BeforeSeq: before, More: more}
}

func olderAsked(sent *[]any) (int64, bool) {
	for _, f := range *sent {
		if r, ok := f.(protocol.ChannelHistoryReq); ok {
			*sent = nil
			return r.BeforeSeq, true
		}
	}
	return 0, false
}

func olderShot(t *testing.T, tt *ui.Tester, name string) {
	t.Helper()
	if os.Getenv("DUCTER_SHOTS") == "" {
		return
	}
	dir := os.Getenv("DUCTER_SHOTS_DIR")
	if dir == "" {
		dir = filepath.Join("..", "..", "..", "..", ".shots", "older")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	f, err := os.Create(filepath.Join(dir, name+".png"))
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if err := png.Encode(f, tt.Image()); err != nil {
		t.Fatal(err)
	}
}

// D506: scrolling up through a conversation longer than the window a fresh
// open gets: near the top the page before is asked (once at a time), it
// lands above the reader, who stays on the same line, and paging goes on to
// the very first message.
func TestConversationPagesBack(t *testing.T) {
	all := longChannel()
	window := all[len(all)-200:] // what core's hello replays (REPLAY_FRESH)
	app, sent := iaApp(t, i18n.ZH)
	app.Status = client.Connected
	app.LocaleFixed = true
	app.Receive(protocol.ServerFrame{T: "events", Events: window})
	tt := ui.NewTesterWith(app.View, 1100, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	tt.Frame()
	tt.Frame()
	if _, asked := olderAsked(sent); asked {
		t.Fatal("asked for older messages at the end of a long conversation")
	}
	olderShot(t, tt, "mac-zh-01-end")

	// Up, until it asks.
	var before int64
	for i := 0; i < 80; i++ {
		tt.Wheel(500, 400, 0, -300)
		tt.Frame()
		if b, ok := olderAsked(sent); ok {
			before = b
			break
		}
	}
	if before != window[0].Seq {
		t.Fatalf("asked before %d, want the oldest held %d", before, window[0].Seq)
	}
	tt.Frame()
	if !tt.HasText(app.L.T("conv.older")) {
		t.Errorf("no quiet line while the page is on its way: %q", texts(tt))
	}
	for range 3 {
		tt.Wheel(500, 400, 0, -300)
		tt.Frame()
	}
	if _, again := olderAsked(sent); again {
		t.Fatal("a second page asked while one is on its way")
	}
	olderShot(t, tt, "mac-zh-02-loading")

	// The line the reader is on, before the page lands.
	first, _ := app.list.Visible()
	rows := app.rows()
	var anchor string
	for i := first + 1; i < len(rows) && anchor == ""; i++ {
		if e := rows[i].entry; e != nil && e.AI != nil {
			anchor = e.AI.Text
		}
	}
	at, ok := tt.Find(anchor)
	if !ok {
		t.Fatalf("anchor %q not on screen", anchor)
	}
	app.Receive(olderAnswer(all, before, 300))
	tt.Frame()
	tt.Frame()
	now, ok := tt.Find(anchor)
	if !ok || math.Abs(float64(now.Y-at.Y)) > 1 {
		t.Fatalf("the page moved the reader: %q at y %v, now %v (%v)", anchor, at.Y, now.Y, ok)
	}
	olderShot(t, tt, "mac-zh-03-landed")
	// Still near the top: the next page is asked at once, and the line says so only while one is on its way.
	if tt.HasText(app.L.T("conv.older")) != app.S.LoadingOlder() {
		t.Errorf("the quiet line (%v) doesn't follow the page on its way (%v)", tt.HasText(app.L.T("conv.older")), app.S.LoadingOlder())
	}
	if len(app.S.Channel) <= 200*2/3 {
		t.Errorf("the page didn't join: %d rows", len(app.S.Channel))
	}

	// On up, page after page, to the first message.
	pages := 1
	for i := 0; i < 600 && !app.S.Older.Done; i++ {
		tt.Wheel(500, 400, 0, -600)
		tt.Frame()
		if b, ok := olderAsked(sent); ok {
			app.Receive(olderAnswer(all, b, 300))
			tt.Frame()
			pages++
		}
	}
	if pages != 2 { // 540 events: the window's 200, then pages of 300 and 40
		t.Errorf("pages %d, want 2", pages)
	}
	if !app.S.Older.Done {
		t.Fatalf("never reached the first message (%d pages)", pages)
	}
	for range 30 {
		tt.Wheel(500, 400, 0, -900)
		tt.Frame()
	}
	if !tt.HasText("CI 又红了，看一下是哪个测试") {
		t.Errorf("the first message isn't reachable at the top: %q", texts(tt))
	}
	if n := len(app.S.Channel); n != 360 {
		t.Errorf("rows %d, want every message (360)", n)
	}
	olderShot(t, tt, "mac-zh-04-first")
}

// The same conversation as a home that can't page (before D506): the top of
// the window is as far as it goes. Kept as the "before" picture.
func TestConversationPagesBackBeforeShot(t *testing.T) {
	if os.Getenv("DUCTER_SHOTS") == "" {
		t.Skip("shots only")
	}
	all := longChannel()
	app, _ := iaApp(t, i18n.ZH)
	app.Status = client.Connected
	app.LocaleFixed = true
	app.Receive(protocol.ServerFrame{T: "events", Events: all[len(all)-200:]})
	app.S.Older.Done = true
	tt := ui.NewTesterWith(app.View, 1100, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	tt.Frame()
	for range 60 {
		tt.Wheel(500, 400, 0, -900)
		tt.Frame()
	}
	olderShot(t, tt, "mac-zh-00-before-stuck-at-top")
}
