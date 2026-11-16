package views

import (
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// 设置 › 聊天软件 / Settings › Chat apps (D276, design/channels.md §6): the
// partner in the person's own Telegram bot and Slack app, more windows on
// the one conversation. Paste the token(s) once, link the account with a
// one-time code, see who is linked, unlink. A token goes to the home once,
// in channel_connect, and never comes back.

// TabChats is 聊天软件 / Chat apps.
const TabChats = "chats"

type chatsState struct {
	token, app map[string]string // what is typed into each card's fields
	busy       map[string]bool
	bad        map[string]string // the last connect's refusal: token | network
	code       map[string]protocol.ServerFrame
	copied     bool
}

var chatNames = map[string]string{"telegram": "Telegram", "slack": "Slack"}

func (a *App) chatsInit() {
	s := &a.chats
	if s.token == nil {
		s.token, s.app, s.busy, s.bad, s.code = map[string]string{}, map[string]string{}, map[string]bool{}, map[string]string{}, map[string]protocol.ServerFrame{}
	}
	// The answers to connect and code, read once.
	for _, f := range a.S.ChannelResults {
		switch f.Op {
		case "connect":
			s.busy[f.ChannelKind] = false
			if f.OK {
				delete(s.bad, f.ChannelKind)
			} else {
				s.bad[f.ChannelKind] = f.Reason
			}
		case "code":
			if f.OK {
				s.code[f.ChannelKind] = f
			}
		}
	}
	a.S.ChannelResults = nil
}

func (a *App) chatsPanel(c *ui.Context) {
	t := a.T
	a.chatsInit()
	a.panelHead(c, TabChats, a.L.T("chats.lede", a.personaName()))
	f := a.S.Channels
	if f == nil {
		ui.Text(c, a.L.T("chats.state.starting")).FontSize(t.MD).TextColor(t.InkMuted)
		return
	}
	for _, v := range f.Channels {
		a.chatCard(c, v, f.SlackManifest)
	}
	ui.Text(c, a.L.T("chats.goes")).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.InkMuted).Padding(0, t.S1)
}

func (a *App) chatState(v protocol.ChannelView) (string, sideTone) {
	name := chatNames[v.Kind]
	switch v.State {
	case "linked":
		name := ""
		if v.Linked != nil {
			name = v.Linked.Name
		}
		return a.L.T("chats.state.linked", name), sideDone
	case "unlinked":
		return a.L.T("chats.state.unlinked"), sideInk
	case "starting":
		return a.L.T("chats.state.starting"), sideMuted
	case "cant_connect":
		switch v.Reason {
		case "token":
			return a.L.T("chats.cant.key", name), sideFailed
		case "blocked", "conflict":
			return a.L.T("chats.cant." + v.Reason), sideFailed
		}
		return a.L.T("chats.cant.network", name), sideFailed
	}
	return a.L.T("chats.state.off"), sideMuted
}

func (a *App) chatCard(c *ui.Context, v protocol.ChannelView, manifest string) {
	t := a.T
	name := chatNames[v.Kind]
	who := "chats.tg.who"
	if v.Kind == "slack" {
		who = "chats.sl.who"
	}
	a.group(c, "chat-"+v.Kind, name, a.L.T(who), func() {
		title := name
		if v.Bot != nil {
			title = v.Bot.Name
			if v.Bot.Handle != "" {
				title += " · @" + v.Bot.Handle
			} else if v.Bot.Team != "" {
				title += " · " + v.Bot.Team
			}
		}
		line, tone := a.chatState(v)
		a.rowBlock(c, "state:"+v.Kind, func() {
			ui.Text(c, title).FontSize(t.MD).FontWeight(800)
			ui.Text(c, line).FontSize(t.SM).FontWeight(600).TextColor(a.sideInk(tone))
			if v.StrangerAt != "" {
				if at, err := time.Parse(time.RFC3339, v.StrangerAt); err == nil && a.Now().Sub(at) < 24*time.Hour {
					ui.Text(c, a.L.T("chats.stranger", name, a.personaName())).FontSize(t.SM).TextColor(t.InkMuted)
				}
			}
		})
		if v.State == "off" || (v.State == "cant_connect" && v.Reason == "token") {
			a.chatConnect(c, v.Kind, manifest)
		}
		if v.State == "unlinked" {
			a.chatLink(c, v)
		}
		if v.State != "off" {
			a.actions(c, "chat-end:"+v.Kind, func() {
				if a.buttonFor(c, a.L.T("chats.forget", name), name, btnText, t.ControlSM, t.Surface) {
					a.send(protocol.ChannelOpReq{T: "channel_forget", Kind: v.Kind})
				}
			}, func() {
				if v.State == "linked" && a.buttonFor(c, a.L.T("chats.unlink"), name, btnSecondary, t.ControlSM, t.Surface) {
					a.send(protocol.ChannelOpReq{T: "channel_unlink", Kind: v.Kind})
				}
			})
		}
	})
}

func (a *App) chatStep(c *ui.Context, n, text string) {
	t := a.T
	ui.Row(c).Gap(t.S2).AlignItems(ui.Start).Children(func() {
		ui.Text(c, n).FontSize(t.SM).FontWeight(800).TextColor(t.InkSoft).Shrink(0)
		ui.Text(c, text).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.InkSoft).Grow(1).MinWidth(0)
	})
}

func (a *App) chatConnect(c *ui.Context, kind, manifest string) {
	t := a.T
	s := &a.chats
	tok, app := s.token[kind], s.app[kind]
	a.rowBlock(c, "connect:"+kind, func() {
		if kind == "telegram" {
			a.chatStep(c, "1", a.L.T("chats.tg.step1", a.personaName()))
			a.chatStep(c, "2", a.L.T("chats.tg.step2"))
			a.afInput(c, "chat-tg", a.L.T("chats.tg.key"), &tok, "", true)
		} else {
			a.chatStep(c, "1", a.L.T("chats.sl.step1"))
			a.chatStep(c, "2", a.L.T("chats.sl.step2"))
			ui.Scroll(c.Key("chat-manifest")).MaxHeight(150).Radius(t.RadiusSM).Background(t.SurfaceSunken).Children(func() {
				ui.Text(c, manifest).Font(t.Mono).FontSize(t.MonoSM).TextColor(t.InkSoft).Padding(t.S2, t.S3).Selectable()
			})
			ui.Row(c).Children(func() {
				label := a.L.T("chats.sl.copy")
				if s.copied {
					label = a.L.T("chats.sl.copied")
				}
				if a.button(c, label, btnSecondary, t.ControlSM, t.Surface) {
					c.WriteClipboard(manifest)
					s.copied = true
				}
			})
			a.chatStep(c, "3", a.L.T("chats.sl.step3"))
			a.afInput(c, "chat-sl-bot", a.L.T("chats.sl.bot"), &tok, "xoxb-…", true)
			a.afInput(c, "chat-sl-app", a.L.T("chats.sl.app"), &app, "xapp-…", true)
		}
		s.token[kind], s.app[kind] = tok, app
		if r := s.bad[kind]; r != "" {
			key := "chats.bad.network"
			if r == "token" {
				key = "chats.bad.key"
			}
			ui.Text(c, a.L.T(key)).FontSize(t.SM).TextColor(t.Failed.Ink)
		}
		ready := tok != "" && (kind == "telegram" || app != "")
		ui.Row(c).Children(func() {
			ui.Box(c).Grow(1)
			label := a.L.T("chats.connect")
			if s.busy[kind] {
				label = a.L.T("chats.connecting")
			}
			if a.button(c, label, btnPrimary, t.ControlSM, t.Surface) && ready && !s.busy[kind] {
				req := protocol.ChannelConnectReq{T: "channel_connect", Kind: kind}
				if kind == "telegram" {
					req.Token = tok
				} else {
					req.BotToken, req.AppToken = tok, app
				}
				a.send(req)
				s.busy[kind] = true
				delete(s.bad, kind)
				s.token[kind], s.app[kind] = "", ""
			}
		})
	})
}

func (a *App) chatLink(c *ui.Context, v protocol.ChannelView) {
	t := a.T
	s := &a.chats
	code, ok := s.code[v.Kind]
	live := false
	if ok {
		if at, err := time.Parse(time.RFC3339, code.ExpiresAt); err == nil && a.Now().Before(at) {
			live = true
		}
	}
	a.rowBlock(c, "link:"+v.Kind, func() {
		if !live {
			ui.Row(c).Children(func() {
				if a.button(c, a.L.T("chats.code.get"), btnPrimary, t.ControlSM, t.Surface) {
					a.send(protocol.ChannelOpReq{T: "channel_code", Kind: v.Kind})
				}
			})
			return
		}
		if v.Kind == "telegram" && code.Link != "" {
			ui.Row(c).Children(func() {
				if a.button(c, a.L.T("chats.tg.open"), btnPrimary, t.ControlSM, t.Surface) {
					a.openLink(code.Link)
				}
			})
			ui.Text(c, a.L.T("chats.tg.code", "/start "+code.Code)).FontSize(t.SM).TextColor(t.InkSoft)
		} else {
			bot := ""
			if v.Bot != nil {
				bot = v.Bot.Name
			}
			ui.Text(c, a.L.T("chats.sl.code", bot, code.Code)).FontSize(t.SM).TextColor(t.InkSoft)
		}
		ui.Text(c, code.Code).Font(t.Mono).FontSize(t.XL).FontWeight(700).Selectable()
		ui.Text(c, a.L.T("chats.code.ttl", a.personaName())).FontSize(t.SM).TextColor(t.InkMuted)
	})
}

// drawChats is Chat apps' icon: two clay speech bubbles, drawn (no service
// marks), the partner's on the paper, the person's in the accent.
func (a *App) drawChats() func(p *ui.Painter, r ui.Rect) {
	t := a.T
	return func(p *ui.Painter, r ui.Rect) {
		s := r.W / 40
		x := func(v float32) float32 { return r.X + v*s }
		y := func(v float32) float32 { return r.Y + v*s }
		p.Fill(ui.Rect{X: x(5), Y: y(7), W: 23 * s, H: 16 * s}, t.Line2, 6*s)
		p.Fill(ui.Rect{X: x(5), Y: y(5), W: 23 * s, H: 16 * s}, t.Surface, 6*s)
		var tail ui.Path
		tail.MoveTo(x(9), y(20))
		tail.LineTo(x(8), y(26))
		tail.LineTo(x(15), y(20.5))
		p.FillPath(&tail, t.Surface)
		p.Fill(ui.Rect{X: x(15), Y: y(18), W: 20 * s, H: 14 * s}, t.PressAccent.Color, 6*s)
		p.Fill(ui.Rect{X: x(15), Y: y(16), W: 20 * s, H: 14 * s}, t.Accent, 6*s)
		var tail2 ui.Path
		tail2.MoveTo(x(29), y(29))
		tail2.LineTo(x(32), y(35))
		tail2.LineTo(x(25), y(29.5))
		p.FillPath(&tail2, t.Accent)
		for i := 0; i < 3; i++ {
			var d ui.Path
			d.Circle(x(20.5+float32(i)*4.5), y(23), 1.4*s)
			p.FillPath(&d, t.Surface)
		}
	}
}
