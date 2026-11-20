package views

import (
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D301 (design/channels.md §9, research/105): WeChat in Settings › 聊天软件,
// through WeChat's own ClawBot. Connect puts up a QR; the person scans it
// with their own WeChat and confirms on the phone, and that scan is the
// link (no code to type). The group says plainly what WeChat allows: it
// answers inside a day of their words, a few messages, no buttons. The same
// shape and words as the web (apps/web/src/channels.tsx WechatCard).

// wechatLine is how WeChat stands, for the group's first row.
func (a *App) wechatLine(v protocol.ChannelView) (string, sideTone) {
	switch v.State {
	case "scan":
		step := "wait"
		if v.Scan != nil {
			step = v.Scan.Step
		}
		switch step {
		case "scanned":
			return a.L.T("chats.wx.state.scanned"), sideInk
		case "verify":
			return a.L.T("chats.wx.state.verify"), sideInk
		}
		return a.L.T("chats.wx.state.scan"), sideInk
	case "linked":
		return a.L.T("chats.wx.state.linked"), sideDone
	case "starting":
		return a.L.T("chats.state.starting"), sideMuted
	case "cant_connect":
		if v.Reason == "token" {
			return a.L.T("chats.wx.cant.key"), sideFailed
		}
		return a.L.T("chats.cant.network", a.L.T("chats.wechat")), sideFailed
	}
	if v.Reason == "expired" || v.Reason == "unavailable" {
		return a.L.T("chats.wx." + v.Reason), sideFailed
	}
	return a.L.T("chats.wx.off"), sideMuted
}

func (a *App) wechatCard(c *ui.Context, v protocol.ChannelView) {
	t := a.T
	s := &a.chats
	name := a.L.T("chats.wechat")
	who := a.L.T("chats.wx.who")
	a.chatGroup(c, "chat-wechat", name, func() {
		line, tone := a.wechatLine(v)
		if a.chatResting("wechat", v) {
			a.chatHeadWith(c, "wechat", name, line, tone, a.chatSetUp(c, "wechat", name))
			a.chatFoot(c, "rest:wechat", who, nil)
			return
		}
		a.chatHead(c, "wechat", name, line, tone)
		switch {
		case v.State == "off" || (v.State == "cant_connect" && v.Reason == "token"):
			a.chatBody(c, "connect:wechat", func() {
				a.chatStep(c, 1, a.L.T("chats.wx.step1"), nil)
				a.chatStep(c, 2, a.L.T("chats.wx.step2"), nil)
				if s.bad["wechat"] == "network" {
					ui.Row(c).Gap(t.S3).Children(func() {
						ui.Box(c).Width(40).Shrink(0)
						uiText(c, a.L.T("chats.bad.network")).FontSize(t.SM).FontWeight(600).TextColor(t.Failed.Ink)
					})
				}
			})
			a.chatFoot(c, "connect:wechat", who, func() {
				label := a.L.T("chats.connect")
				if s.busy["wechat"] {
					label = a.L.T("chats.connecting")
				}
				if a.buttonFor(c, label, name, btnPrimary, t.ControlMD, t.Surface) && !s.busy["wechat"] {
					a.send(protocol.ChannelConnectReq{T: "channel_connect", Kind: "wechat"})
					s.busy["wechat"] = true
					delete(s.bad, "wechat")
				}
			})
			return
		case v.State == "scan" && v.Scan != nil:
			a.wechatScan(c, v.Scan)
			a.chatFoot(c, "scan:wechat", who, func() {
				if a.quietButton(c, "chat-wx-cancel", a.L.T("chats.wx.cancel"), name, false, 0) {
					a.send(protocol.ChannelOpReq{T: "channel_forget", Kind: "wechat"})
				}
			})
			return
		case v.State == "linked":
			a.chatRow(c, "linked:wechat", a.L.T("chats.wx.linked"), a.L.T("chats.linked.goes", name), nil)
			open := false
			if at, err := time.Parse(time.RFC3339, v.OpenUntil); err == nil && a.Now().Before(at) {
				open = true
			}
			key := "chats.wx.closed"
			if open {
				key = "chats.wx.open"
			}
			a.chatRowHow(c, "window:wechat", a.L.T(key), a.L.T("chats.wx.rule"), a.L.T("chats.wx.rule.how"), nil)
		}
		// D289: a destructive action is quiet until hovered, and asks in place.
		if s.forgetting == "wechat" {
			keep, forget := a.confirmRow(c, "chat-forget:wechat", a.L.T("chats.forget.ask", name), a.L.T("card.stop.keep"), a.L.T("chats.wx.forget"), name)
			if keep {
				s.forgetting = ""
			}
			if forget {
				s.forgetting = ""
				a.send(protocol.ChannelOpReq{T: "channel_forget", Kind: "wechat"})
				a.say("chat:wechat", a.L.T("said.chats.off", name)) // D404
			}
			return
		}
		a.chatFoot(c, "end:wechat", who, func() {
			if a.quietDanger(c, "chat-forget:wechat", a.L.T("chats.wx.forget"), name) {
				s.forgetting = "wechat"
			}
		})
	})
}

// wechatScan is the QR to scan with WeChat, how to do it, and WeChat's
// number when it asks for one. Scanned, the QR fades: the phone is next.
func (a *App) wechatScan(c *ui.Context, sc *protocol.ChannelScan) {
	t := a.T
	s := &a.chats
	a.chatBody(c, "scan:wechat", func() {
		ui.Row(c).Gap(t.S3).AlignItems(ui.Start).Children(func() {
			ui.Box(c).Width(40).Shrink(0)
			ui.Column(c).Grow(1).Basis(0).MinWidth(0).Gap(t.S2).Children(func() {
				uiText(c, a.L.T("chats.wx.scan")).FontSize(t.MD).LineHeight(a.leading(1.5)).TextColor(t.Ink)
				uiText(c, a.L.T("chats.wx.scan.phone")).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.InkMuted)
				if sc.Step == "verify" {
					code := s.token["wechat"]
					ui.Row(c).Gap(t.S3).AlignItems(ui.End).Children(func() {
						ui.Column(c.Key("chat-field:wx-verify")).Gap(t.S1).Width(200).Children(func() {
							uiText(c, a.L.T("chats.wx.verify")).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft)
							in := ui.TextInput(c.Key("chat-input:wx-verify"), &code).Label(a.L.T("chats.wx.verify")).
								FontSize(t.MD).Height(t.ControlMD).Padding(0, t.S4).Radius(t.RadiusSM).Background(t.Surface)
							edge := t.Line2
							if in.Focused() {
								edge = t.InkSoft
							}
							in.Border(1, edge)
						})
						if a.buttonFor(c, a.L.T("chats.wx.verify.go"), a.L.T("chats.wechat"), btnPrimary, t.ControlMD, t.Surface) && strings.TrimSpace(code) != "" {
							a.send(protocol.ChannelConnectReq{T: "channel_connect", Kind: "wechat", VerifyCode: strings.TrimSpace(code)})
							code = ""
						}
					})
					s.token["wechat"] = code
				}
			})
			ink := t.Ink
			if sc.Step == "scanned" {
				ink = t.InkMuted
			}
			qrBox(c, sc.QR, 168, ink, t.Surface)
		})
	})
}
