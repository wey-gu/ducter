package views

import (
	"encoding/json"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D405: 小应用 / Apps (design/apps.md). The card under the partner's words,
// the small line over a message an app asked, and the bridge the app's own
// window talks through: main.go serves each app on the ducter-app scheme
// (its document as the home composed it, /bridge for what the app posts,
// /events long-polled for what changed), and this file carries those to the
// home and back.

// appCard is the app's clay tile, its name, what happened, 打开 / Open.
func (a *App) appCard(c *ui.Context, key string, card *protocol.AppCard) {
	t := a.T
	var now *protocol.AppMeta
	for i := range a.S.Apps {
		if a.S.Apps[i].ID == card.ID {
			now = &a.S.Apps[i]
		}
	}
	gone := len(a.S.Apps) > 0 && now == nil
	name := card.Name
	if now != nil {
		name = now.Name
	}
	what := a.L.T("app.changed")
	switch {
	case card.Change == "removed" && now == nil:
		what = a.L.T("app.removed")
	case gone:
		what = a.L.T("app.gone")
	case card.Change == "removed": // brought back: on the shelf again
		what = a.L.T("app.made", firstNonEmpty(a.S.PersonaName, "Ducter"))
	case card.Change == "made":
		what = a.L.T("app.made", firstNonEmpty(a.S.PersonaName, "Ducter"))
	case card.Change == "data":
		what = a.L.T("app.filled")
	}
	ui.Row(c.Key("appcard:"+key)).MaxWidth(420).MaxWidthPercent(84).Padding(t.S3).Gap(t.S3).AlignItems(ui.Center).Radius(t.RadiusMD).
		Background(t.Surface).Shadow(0, t.Raised.Y, 0, 0, t.Raised.Color).Role(ui.RoleGroup).Label(name).Children(func() {
		a.appClay(c, "face", 48, now, gone || (card.Change == "removed" && now == nil))
		ui.Column(c.Key("body")).Grow(1).Shrink(1).MinWidth(0).Gap(2).Children(func() {
			ink := t.Ink
			if gone {
				ink = t.InkMuted
			}
			uiText(c, keepWords(autospace(name))).FontSize(t.MD).FontWeight(800).TextColor(ink).SingleLine().Shrink(1).MinWidth(0).Tooltip(name)
			uiText(c, keepWords(autospace(what))).FontSize(t.SM).TextColor(t.InkMuted).MinWidth(0)
		})
		switch {
		case card.Change == "removed" && now == nil:
			// D410: deleted on the person's word; 撤销 brings it back while it can.
			if !a.restoring[card.ID] && a.buttonFor(c, a.L.T("apps.undo"), name, btnSecondary, t.ControlSM, t.Surface) {
				if a.restoring == nil {
					a.restoring = map[string]bool{}
				}
				a.restoring[card.ID] = true
				a.send(protocol.AppIDReq{T: "app_restore", ID: card.ID})
			}
		case !gone && a.buttonFor(c, a.L.T("app.open"), name, btnSecondary, t.ControlSM, t.Surface):
			a.openApp(card.ID)
		}
	})
}

// appFace is the app's tile: a small window drawn in the needs-you clay
// (the accent family), faded once the app is gone.
func (a *App) appFace(c *ui.Context, size float32, gone bool) {
	t := a.T
	k := size / 48
	bg, ink, ledge := t.NeedsYou.Surface, t.NeedsYou.Ink, t.NeedsYou.Ledge
	if gone {
		bg, ink, ledge = t.SurfaceSunken, t.InkMuted, t.SurfaceSunken
	}
	ui.Box(c.Key("face")).Size(size, size).Shrink(0).AccessHidden(true).Radius(14*k).Background(bg).
		Shadow(0, 3*k, 0, 0, ledge).Draw(func(p *ui.Painter, r ui.Rect) {
		g := size * 0.56
		drawMadeKind("app", ink)(p, ui.Rect{X: r.X + (r.W-g)/2, Y: r.Y + (r.H-g)/2, W: g, H: g})
	})
}

// userAppLine is the small line over a message an app asked (or that was
// typed about an app): its mark and name; a click opens the app.
func (a *App) userAppLine(c *ui.Context, key string, ref *protocol.AppRef) {
	t := a.T
	words := a.L.T("app.about", ref.Name)
	if ref.Ask != "" {
		words = a.L.T("app.asks", ref.Name)
	}
	ui.Row(c.Key("appfrom:" + key)).Children(func() {
		ui.Spacer(c)
		b := ui.Row(c.Key("b")).Gap(6).AlignItems(ui.Center).Padding(2, t.S2).Radius(999).Background(t.Sunken).
			Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(words).Focusable()
		b.Children(func() {
			ui.Box(c.Key("g")).Size(14, 14).AccessHidden(true).Draw(drawMadeKind("app", t.InkSoft))
			uiText(c, keepWords(autospace(words))).FontSize(t.XS).FontWeight(700).TextColor(t.InkSoft).SingleLine()
		})
		if b.Clicked() {
			a.openApp(ref.ID)
		}
	})
}

// appAskBubble is an app's own ask (ducter.ask): on the left, in a neutral
// sunken bubble, under the app's name, so it never reads as the person's words.
func (a *App) appAskBubble(c *ui.Context, key string, ref *protocol.AppRef, text string) {
	t := a.T
	ui.Column(c.Key("appask:" + key)).Gap(4).AlignItems(ui.Start).MaxWidthPercent(80).Children(func() {
		words := a.L.T("app.asks", ref.Name)
		b := ui.Row(c.Key("b")).Gap(6).AlignItems(ui.Center).Padding(2, t.S2).Radius(999).Background(t.Sunken).
			Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(words).Focusable()
		b.Children(func() {
			ui.Box(c.Key("g")).Size(14, 14).AccessHidden(true).Draw(drawMadeKind("app", t.InkSoft))
			uiText(c, keepWords(autospace(words))).FontSize(t.XS).FontWeight(700).TextColor(t.InkSoft).SingleLine()
		})
		if b.Clicked() {
			a.openApp(ref.ID)
		}
		ui.Column(c.Key("w")).Padding(10, 14).Radius(t.RadiusMD).Background(t.Sunken).InsetShadow(0, 0, 0, 1, t.Line).MinWidth(0).Children(func() {
			uiText(c, autospace(text)).Selectable().FontSize(t.Bubble).LineHeight(leadingFor(text, 1.5)).TextColor(t.InkSoft)
		})
	})
}

// openApp opens an app in its own window (main.go's OpenAppWindow); the
// renderer and tests only record it.
func (a *App) openApp(id string) {
	a.openedApp = id
	name := ""
	for _, m := range a.S.Apps {
		if m.ID == id {
			name = m.Name
		}
	}
	if a.OpenAppWindow != nil {
		a.OpenAppWindow(id, name)
	}
}

// AppBridge carries an app window's bridge to the home and back. Its
// methods are safe from any goroutine (the scheme handler's).
type AppBridge struct {
	a     *App
	mu    sync.Mutex
	opens map[string][]chan *protocol.AppsFrame
	q     map[string]*appQueue
}

type appQueue struct {
	evs  []json.RawMessage
	base int // the number of the first event in evs
	wake chan struct{}
}

// Bridge is the app windows' bridge (made on first use).
func (a *App) Bridge() *AppBridge {
	if a.bridge == nil {
		a.bridge = &AppBridge{a: a, opens: map[string][]chan *protocol.AppsFrame{}, q: map[string]*appQueue{}}
	}
	return a.bridge
}

func (b *AppBridge) do(fn func()) {
	if b.a.Win != nil {
		b.a.Win.Update(fn)
	} else {
		fn()
	}
}

// Open asks the home for the app's document (transport "fetch"), waiting
// at most 10 s.
func (b *AppBridge) Open(id string, dark bool) (*protocol.AppOpen, bool) {
	ch := make(chan *protocol.AppsFrame, 1)
	b.mu.Lock()
	b.opens[id] = append(b.opens[id], ch)
	b.mu.Unlock()
	b.do(func() {
		b.a.send(protocol.AppOpenReq{T: "app_open", ID: id, Transport: "fetch", Dark: dark, Lang: string(b.a.L.Lang)})
	})
	select {
	case f := <-ch:
		return f.App, f.App != nil && !f.Gone
	case <-time.After(10 * time.Second):
		return nil, false
	}
}

// Post is what the app posted to /bridge: a key written, or an ask.
func (b *AppBridge) Post(id string, body []byte) {
	var m struct {
		T     string          `json:"t"`
		Key   string          `json:"key"`
		Value json.RawMessage `json:"value"`
		Text  string          `json:"text"`
		Ref   string          `json:"ref"`
		Draft string          `json:"draft"`
	}
	if json.Unmarshal(body, &m) != nil {
		return
	}
	switch m.T {
	case "put":
		if len(m.Value) == 0 {
			m.Value = json.RawMessage("null")
		}
		b.do(func() { b.a.send(protocol.AppPutReq{T: "app_put", ID: id, Key: m.Key, Value: m.Value}) })
	case "ask":
		b.do(func() { b.a.send(protocol.AppAskReq{T: "app_ask", ID: id, Text: m.Text, Ref: m.Ref}) })
	case "summary":
		// D410: ducter.summary, the one line its shelf tile shows.
		b.do(func() { b.a.send(protocol.AppSummaryReq{T: "app_summary", ID: id, Text: m.Text}) })
	case "error":
		// D422: its page threw: the home keeps it on this version; the tile
		// and the window say so with a fix.
		b.do(func() {
			if am := b.a.appByID(id); am != nil {
				text := m.Text
				if len(text) > 300 {
					text = text[:300]
				}
				b.a.send(protocol.AppErrorReq{T: "app_error", ID: id, Version: am.Version, Text: text})
			}
		})
	case "show":
		// D407: ducter.open({ draft }): that PR's draft sheet, in the main
		// window (brought forward); nothing is sent.
		if !draftRefRe.MatchString(m.Draft) {
			return
		}
		b.do(func() {
			b.a.openPreRead(m.Draft)
			if b.a.ShowMain != nil {
				b.a.ShowMain()
			}
		})
	}
}

// draftRefRe is what ducter.open may show: one pull request (owner/repo#n).
var draftRefRe = regexp.MustCompile(`^[\w.-]+/[\w.-]+#\d+$`)

// boardOfferBody is the board offer's few words under its question (D407):
// the app's tile, what goes in it, and for reviews what each row holds.
func (a *App) boardOfferBody(c *ui.Context, b *protocol.BoardAsk) {
	t := a.T
	ui.Row(c.Key("board-offer")).Gap(t.S3).AlignItems(ui.Start).MinWidth(0).Children(func() {
		a.appFace(c, 34, false)
		ui.Column(c.Key("w")).Gap(2).Grow(1).Shrink(1).MinWidth(0).Children(func() {
			uiText(c, keepWords(autospace(a.L.T("board.offer.what", b.Title)))).FontSize(t.MD).TextColor(t.Ink).MinWidth(0)
			if b.Kind == "reviews" {
				uiText(c, keepWords(autospace(a.L.T("board.offer.reviews")))).FontSize(t.SM).TextColor(t.InkMuted).MinWidth(0)
			}
		})
	})
}

// Events returns what happened to the app after event number after (data
// written elsewhere, an answer, a refusal), waiting up to wait for one.
func (b *AppBridge) Events(id string, after int, wait time.Duration) ([]json.RawMessage, int) {
	deadline := time.After(wait)
	for {
		b.mu.Lock()
		q := b.queue(id)
		if after < q.base {
			after = q.base
		}
		if end := q.base + len(q.evs); after < end {
			out := append([]json.RawMessage(nil), q.evs[after-q.base:]...)
			b.mu.Unlock()
			return out, end
		}
		wake := q.wake
		b.mu.Unlock()
		select {
		case <-wake:
		case <-deadline:
			return nil, after
		}
	}
}

func (b *AppBridge) queue(id string) *appQueue {
	q := b.q[id]
	if q == nil {
		q = &appQueue{wake: make(chan struct{})}
		b.q[id] = q
	}
	return q
}

func (b *AppBridge) push(id string, ev any) {
	raw, err := json.Marshal(ev)
	if err != nil {
		return
	}
	b.mu.Lock()
	q := b.queue(id)
	q.evs = append(q.evs, raw)
	if len(q.evs) > 200 {
		q.base += len(q.evs) - 200
		q.evs = q.evs[len(q.evs)-200:]
	}
	close(q.wake)
	q.wake = make(chan struct{})
	b.mu.Unlock()
}

// receive routes the home's apps frames and app answers (App.Receive).
func (b *AppBridge) receive(f protocol.ServerFrame) {
	if af := f.AppsF; af != nil {
		switch af.T {
		case "app_open":
			b.mu.Lock()
			waits := b.opens[af.ID]
			delete(b.opens, af.ID)
			b.mu.Unlock()
			for _, ch := range waits {
				ch <- af
			}
		case "app_data":
			b.push(af.ID, map[string]any{"ducterApp": af.ID, "t": "data", "key": af.Key, "value": af.Value, "by": af.By})
		case "app_ask_refused":
			b.push(af.ID, map[string]any{"ducterApp": af.ID, "t": "refused", "ref": af.Ref, "why": af.Why})
		}
		return
	}
	if f.T != "events" {
		return
	}
	for _, ev := range f.Events {
		// An outward ask put on a Go card: the app is told it waits for the person's Go.
		if ev.Kind == protocol.KindDecision {
			var d struct {
				ForApp *protocol.AppAnswer `json:"forApp"`
			}
			if json.Unmarshal(ev.Body, &d) == nil && d.ForApp != nil {
				b.push(d.ForApp.ID, map[string]any{"ducterApp": d.ForApp.ID, "t": "answer", "ref": d.ForApp.Ask, "text": b.a.L.T("app.ask.go", firstNonEmpty(b.a.S.PersonaName, "Ducter"))})
			}
			continue
		}
		if ev.Kind != protocol.KindAIMsg {
			continue
		}
		var m protocol.AIMsg
		if json.Unmarshal(ev.Body, &m) != nil || m.AppAnswer == nil {
			continue
		}
		b.push(m.AppAnswer.ID, map[string]any{"ducterApp": m.AppAnswer.ID, "t": "answer", "ref": m.AppAnswer.Ask, "text": strings.TrimSpace(m.Text)})
	}
}
