package views

import (
	"fmt"
	"strings"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// D248: the screens a task drives, the way people expect them. A phone
// that isn't running shows asleep (Ducter's phone dozing under its knitted
// blanket, the asleep devices' look, D77/D81) with 叫醒 / Wake: looking
// never wakes it. A view that opens again starts from the last frame it
// showed, quiet, and the new stream fades in over it. My turn asked while
// the task is mid-step is the person's when that step ends. Under the
// screen, what it did (taps, typing, apps it opened), never what it read.
// The same as the web client's phone-use.tsx.

// The dozing phone, drawn as the web client draws it (phone-use.tsx
// PhoneDozing), in two layers so the blanket can breathe.
const dozingViewBox = `viewBox="0 0 132 148" width="132" height="148"`

var phoneDozingBody = ui.MustParseSVG([]byte(`<svg xmlns="http://www.w3.org/2000/svg" ` + dozingViewBox + `>
<defs>
<radialGradient id="b" cx="0.32" cy="0.22" r="0.95"><stop offset="0" stop-color="#a8e6c6"/><stop offset="0.55" stop-color="#6fcf9f"/><stop offset="1" stop-color="#3f9f74"/></radialGradient>
<radialGradient id="g" cx="0.35" cy="0.2" r="1"><stop offset="0" stop-color="#4a3d30"/><stop offset="1" stop-color="#2b2118"/></radialGradient>
</defs>
<ellipse cx="66" cy="138" rx="46" ry="6.5" fill="#2b2118" fill-opacity="0.14"/>
<g transform="rotate(-8 66 80)">
<rect x="30" y="10" width="72" height="122" rx="20" fill="url(#b)"/>
<rect x="37" y="17" width="58" height="108" rx="14" fill="url(#g)"/>
<circle cx="66" cy="24" r="2.4" fill="#4a3d30"/>
<path d="M50 52q5 5 10 0M72 52q5 5 10 0" fill="none" stroke="#f6ebdd" stroke-width="3" stroke-linecap="round"/>
<path d="M62 62q4 3 8 0" fill="none" stroke="#f6ebdd" stroke-width="2.4" stroke-linecap="round"/>
<ellipse cx="45" cy="30" rx="6" ry="9" fill="#ffffff" fill-opacity="0.12"/>
</g>
</svg>`))

var phoneDozingBlanket = ui.MustParseSVG([]byte(`<svg xmlns="http://www.w3.org/2000/svg" ` + dozingViewBox + `>
<defs>
<linearGradient id="k" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbf1de"/><stop offset="1" stop-color="#efdcb8"/></linearGradient>
<clipPath id="c"><path d="` + blanketPath + `"/></clipPath>
</defs>
<path d="` + blanketPath + `" fill="url(#k)"/>
<g clip-path="url(#c)" fill="none" stroke="#c9ad7f" stroke-opacity="0.55" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">` + knitRows() + `</g>
<path d="M15 84c17-8 37-11 53-10s35 5 49 12" fill="none" stroke="#fbf1de" stroke-width="5" stroke-linecap="round"/>
<path d="M96 92c6 10 7 26 3 44" fill="none" stroke="#c9ad7f" stroke-opacity="0.45" stroke-width="2" stroke-linecap="round"/>
</svg>`))

const blanketPath = "M14 82c18-9 38-12 54-11s36 5 50 13c4 2 5 6 5 10v30c0 9-6 14-15 14H25c-9 0-15-5-15-14V92c0-4 1-8 4-10z"

// knitRows is the blanket's knit: rows of small chevrons (the web draws
// them with an SVG pattern, which MyGo leaves out).
func knitRows() string {
	var b strings.Builder
	for y := 77.0; y < 140; y += 7 {
		b.WriteString(`<path d="`)
		for x := 9.0; x < 126; x += 9 {
			fmt.Fprintf(&b, "M%.1f %.1f %.1f %.1f %.1f %.1f", x+0.5, y+1.2, x+4.5, y+5.4, x+8.5, y+1.2)
		}
		b.WriteString(`"/>`)
	}
	return b.String()
}

// phoneDozing draws the dozing phone, size points wide; the blanket rises
// and falls (4.8 s, from its bottom edge); reduced motion holds it still.
func (a *App) phoneDozing(c *ui.Context, key string, size float32) {
	h := size * 148 / 132
	phase := phaseOf(key)
	ui.Box(c.Key("dozing:"+key)).Size(size, h).Shrink(0).AccessHidden(true).Draw(func(p *ui.Painter, r ui.Rect) {
		p.Image(phoneDozingBody, r, ui.Contain)
		blanket := func() { p.Image(phoneDozingBlanket, r, ui.Contain) }
		if p.Preferences().ReduceMotion {
			blanket()
			return
		}
		tr, _, _ := idlePose(idleBlanket, p.Now(), phase)
		p.Transform(tr, r.X+r.W/2, r.Y+r.H*138/148, blanket)
		idleFrame(p)
	})
}

// phoneAsleep is the asleep screen: the phone dozing, why looking doesn't
// wake it, and 叫醒 / Wake.
func (a *App) phoneAsleep(c *ui.Context, pv *store.PhoneView) {
	t := a.T
	ui.Column(c.Key("phone-asleep")).Margin(0, ui.Auto).AlignItems(ui.Center).Gap(t.S2).MaxWidth(320).Role(ui.RoleStatus).Children(func() {
		a.phoneDozing(c, "phone-asleep", 168)
		ui.Text(c, a.L.T("phoneuse.asleep.title")).FontSize(t.MD).FontWeight(800).TextColor(t.Ink)
		why := a.L.T("phoneuse.asleep.why", a.phoneComputer(pv))
		if pv.TaskID != "" {
			why = a.L.T("phoneuse.asleep.task")
		}
		ui.Text(c, why).FontSize(t.SM).TextColor(t.InkMuted).LineHeight(1.5).TextAlign(ui.Center)
		label := a.L.T("phoneuse.wake")
		if pv.Waking {
			label = a.L.T("phoneuse.waking")
		}
		if a.buttonFor(c, label, a.L.T("phoneuse.title"), btnSecondary, t.ControlSM, t.SurfaceSunken) && !pv.Waking && pv.ID != "" {
			pv.Waking = true
			a.send(protocol.PhoneWakeReq{T: "phone_wake", ID: pv.ID})
		}
	})
}

// phoneComputer is the name of the computer the phone lives on.
func (a *App) phoneComputer(pv *store.PhoneView) string {
	if pv.Device != "" {
		return pv.Device
	}
	if h := a.homeDevice(); h != nil {
		return a.deviceName(h)
	}
	return "Mac"
}

// didWords says one thing the task did, in the past tense.
func (a *App) didWords(d protocol.PhoneDid) string {
	switch d.Kind {
	case "tap":
		if d.Label != "" {
			return a.L.T("phoneuse.did.tap", d.Label)
		}
		return a.L.T("phoneuse.did.tap.0")
	case "type":
		if d.Label != "" {
			return a.L.T("phoneuse.did.type", d.Label)
		}
		return a.L.T("phoneuse.did.type.0")
	case "open":
		return a.L.T("phoneuse.did.open", d.App)
	case "key":
		k := d.Label
		if k == "" {
			k = "back"
		}
		return a.L.T("phoneuse.did.key", a.L.T("phoneuse.key."+k))
	}
	return a.L.T("phoneuse.did.swipe")
}

// drawDidMark is a small drawn mark per kind of step: a tap's ring,
// typing's lines, an app's tile, a key's chevron, a swipe's arc.
func drawDidMark(kind string, col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		cx, cy := r.X+r.W/2, r.Y+r.H/2
		var m ui.Path
		switch kind {
		case "tap":
			ellipse(&m, cx, cy, 5, 5)
			p.StrokePath(&m, 1.6, col)
			var dot ui.Path
			ellipse(&dot, cx, cy, 1.8, 1.8)
			p.FillPath(&dot, col)
			return
		case "type":
			for i, w := range []float32{10, 7, 9} {
				y := cy - 3 + float32(i)*3
				m.MoveTo(cx-5, y)
				m.LineTo(cx-5+w, y)
			}
		case "open":
			roundRect(&m, cx-4.5, cy-4.5, 9, 9, 2.6)
		case "key":
			// a keycap with its legend line
			roundRect(&m, cx-6, cy-3, 12, 6.5, 1.6)
			m.MoveTo(cx-2, cy+0.25)
			m.LineTo(cx+2, cy+0.25)
		default:
			m.MoveTo(cx-4, cy+3)
			m.QuadTo(cx, cy-3, cx+4, cy+3)
		}
		p.StrokePath(&m, 1.6, col)
	}
}

// phoneDid lists the last few things the task did, newest first.
func (a *App) phoneDid(c *ui.Context, did []protocol.PhoneDid) {
	if len(did) == 0 {
		return
	}
	t := a.T
	ui.Column(c.Key("phone-did")).Gap(3).Padding(0, t.S4, t.S3, t.S4).Children(func() {
		ui.Text(c, a.L.T("phoneuse.did.title")).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted)
		from := max(0, len(did)-5)
		for i := len(did) - 1; i >= from; i-- {
			d := did[i]
			col := t.InkMuted
			if i == len(did)-1 {
				col = t.InkSoft
			}
			ui.Row(c.Key(fmt.Sprintf("did:%d:%d", d.At, i))).Gap(t.S2).AlignItems(ui.Center).MinWidth(0).Children(func() {
				a.glyph(c, 14, drawDidMark(d.Kind, t.State("working").Dot))
				ui.Text(c, a.didWords(d)).FontSize(t.SM).TextColor(col).SingleLine()
			})
		}
	})
}
