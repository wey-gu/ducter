package views

import (
	"strconv"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// 设置 › 聊天软件 / Settings › Chat apps (D276, design/channels.md §6): the
// partner in the person's own Telegram bot and Slack app, more windows on
// the one conversation. Paste the token(s) once, link the account with a
// one-time code, see who is linked, unlink. A token goes to the home once,
// in channel_connect, and never comes back.
//
// D283: the page is D273's grid. Each chat app is one raised group whose
// first row is the app itself (its letter pebble, its name, how it stands),
// never a title repeated above it; a setup is a short guided path, a step
// mark in the tile column and one sentence beside it; Connect is the
// group's one primary at the right edge of its last line, where its privacy
// note sits on the left. iMessage (D277) is the third group (imessage.go).

// TabChats is 聊天软件 / Chat apps.
const TabChats = "chats"

// Where a setup's links go.
const (
	botFatherURL = "https://t.me/BotFather"
	slackAppsURL = "https://api.slack.com/apps?new_app=1"
)

type chatsState struct {
	token, app map[string]string // what is typed into each card's fields
	busy       map[string]bool
	bad        map[string]string // the last connect's refusal: token | network
	code       map[string]protocol.ServerFrame
	copied     bool
	reCopied   bool   // D527: the reinstall row's Copy
	manifest   bool   // the manifest's View is open
	forgetting string // D289: the app whose Disconnect asks in place
	// was is each app's state as last drawn, so becoming linked is answered once (D404).
	was map[string]string
	// open: the apps whose setup the person opened with 设置 / Set up (D365): an
	// app never connected rests as its one row until then.
	open map[string]bool
	// D500: the order the apps stand in, set when the pane opens: those in use
	// first, then the ones resting until chosen; held while the pane is open so
	// an app being set up never jumps under the person.
	order []string
}

var chatNames = map[string]string{"telegram": "Telegram", "slack": "Slack"}

func (a *App) chatsInit() {
	s := &a.chats
	if s.token == nil {
		s.token, s.app, s.busy, s.bad, s.code = map[string]string{}, map[string]string{}, map[string]bool{}, map[string]string{}, map[string]protocol.ServerFrame{}
	}
	if s.open == nil {
		s.open = map[string]bool{}
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
	// D399: what reaches a chat app is true of all of them: under the lede, not under the last card.
	a.ledeNote(c, "chats-goes", a.L.T("chats.goes"))
	a.ledeHow(c, "chats-goes", a.L.T("chats.goes"), a.L.T("chats.goes.how"))
	f := a.S.Channels
	if f == nil {
		uiText(c, a.L.T("chats.state.starting")).FontSize(t.MD).TextColor(t.InkMuted)
	} else {
		if a.chats.was == nil {
			a.chats.was = map[string]string{}
		}
		for _, v := range a.chatOrder(f.Channels) {
			// D404: the moment an app becomes linked is answered once, never on opening the pane.
			if prev, seen := a.chats.was[v.Kind]; seen && prev != "linked" && v.State == "linked" {
				who := chatNames[v.Kind]
				if v.Kind == "wechat" {
					who = a.L.T("chats.wechat")
				}
				a.say("chat:"+v.Kind, a.L.T("said.chats.linked", who))
			}
			a.chats.was[v.Kind] = v.State
			if v.Kind == "wechat" {
				a.wechatCard(c, v) // D301 (wechat.go)
			} else {
				a.chatCard(c, v, f.SlackManifest)
			}
			a.saidLine(c, "chat:"+v.Kind)
		}
	}
	a.imessageGroup(c)
}

// chatOrder is the apps in use first, then those never set up (D500), in
// the order fixed when the pane opened (a.chats.order, cleared by openTab).
func (a *App) chatOrder(vs []protocol.ChannelView) []protocol.ChannelView {
	s := &a.chats
	if len(s.order) != len(vs) {
		s.order = s.order[:0]
		for _, rest := range []bool{false, true} {
			for _, v := range vs {
				if (v.State == "off") == rest {
					s.order = append(s.order, v.Kind)
				}
			}
		}
	}
	out := make([]protocol.ChannelView, 0, len(vs))
	for _, k := range s.order {
		for _, v := range vs {
			if v.Kind == k {
				out = append(out, v)
			}
		}
	}
	if len(out) != len(vs) { // an app came or went: order afresh next frame
		s.order = nil
		return vs
	}
	return out
}

func (a *App) chatState(v protocol.ChannelView) (string, sideTone) {
	name := chatNames[v.Kind]
	switch v.State {
	case "linked":
		return a.L.T("chats.state.linked", botLine(v)), sideDone
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

// botLine is the partner's own bot there: @handle on Telegram, the
// workspace on Slack, else its name.
func botLine(v protocol.ChannelView) string {
	if v.Bot == nil {
		return chatNames[v.Kind]
	}
	switch {
	case v.Bot.Handle != "":
		return "@" + v.Bot.Handle
	case v.Bot.Team != "":
		return v.Bot.Team
	}
	return v.Bot.Name
}

// chatGroup is one chat app's raised group: no title on the paper, the app
// is its first row.
func (a *App) chatGroup(c *ui.Context, key, name string, body func()) {
	a.group(c, key, "", "", func() {
		ui.Column(c).Role(ui.RoleGroup).Label(name).Children(body)
	})
}

// chatHead is a chat app's first row: the app's own mark in the tile
// column (D314), its name, and one line of how it stands.
func (a *App) chatHead(c *ui.Context, kind, name, line string, tone sideTone) {
	a.chatHeadWith(c, kind, name, line, tone, nil)
}

// chatResting: an app never connected whose setup the person hasn't opened
// rests as its first row with 设置 / Set up at the right edge (D365, as
// D337's own number). A refused key or a connect on its way keeps the steps.
func (a *App) chatResting(kind string, v protocol.ChannelView) bool {
	s := &a.chats
	return v.State == "off" && v.Reason == "" && !s.open[kind] && s.bad[kind] == "" && !s.busy[kind]
}

// chatSetUp is the resting row's one button: it opens the app's steps.
func (a *App) chatSetUp(c *ui.Context, kind, name string) func() {
	return func() {
		if a.buttonFor(c, a.L.T("own.setup"), name, btnSecondary, a.T.ControlSM, a.T.Surface) {
			a.chats.open[kind] = true
		}
	}
}

// chatHeadWith is chatHead with a control at the row's right edge.
func (a *App) chatHeadWith(c *ui.Context, kind, name, line string, tone sideTone, control func()) {
	t := a.T
	a.sep(c)
	ui.Row(c.Key("chat-head:"+kind)).Gap(t.S3).Padding(t.S4, t.S5).MinHeight(72).AlignItems(ui.Center).Children(func() {
		a.chatTile(c, kind)
		ui.Column(c).Grow(1).Basis(0).MinWidth(0).Gap(2).Children(func() {
			uiText(c, name).Font(t.Display).FontSize(t.LG).FontWeight(800).LineHeight(1.3)
			w := 600
			if tone == sideMuted {
				w = 500
			}
			uiText(c, line).FontSize(t.SM).FontWeight(w).LineHeight(a.leading(1.5)).TextColor(a.sideInk(tone))
		})
		if control != nil {
			ui.Row(c).Shrink(0).Gap(t.S2).AlignItems(ui.Center).Children(control)
		}
	})
}

// chatTile is a chat app's own mark on the small white clay tile (D314;
// it replaced D283's letter pebbles): Telegram's plane, Slack's four
// colours, Messages' bubble, WeChat's two bubbles.
func (a *App) chatTile(c *ui.Context, kind string) {
	ui.Box(c.Key("chat-tile:" + kind)).Shrink(0).Children(a.brandTile(c, kind, false))
}

// chatBody is a block of a group's rows set on the text column (past the
// tile column), the hairline above.
func (a *App) chatBody(c *ui.Context, key string, body func()) {
	t := a.T
	a.sep(c)
	ui.Column(c.Key("chat-body:"+key)).Gap(t.S4).Padding(t.S4, t.S5).Children(body)
}

// chatStep is one step of a setup: its mark centred in the tile column,
// one sentence beside it, and what the step needs (a command, a link, a
// field) under the sentence.
func (a *App) chatStep(c *ui.Context, n int, text string, aside func()) {
	t := a.T
	ui.Row(c.Key("chat-step:" + strconv.Itoa(n) + text)).Gap(t.S3).AlignItems(ui.Start).Children(func() {
		ui.Row(c).Width(40).Shrink(0).Justify(ui.Center).Padding(1, 0, 0, 0).Children(func() {
			ui.Row(c).Size(26, 26).Radius(13).Background(t.Sunken).Shadow(0, 2, 0, 0, t.Line2).
				Justify(ui.Center).AlignItems(ui.Center).AccessHidden(true).Children(func() {
				uiText(c, strconv.Itoa(n)).FontSize(t.SM).FontWeight(800).TextColor(t.InkSoft).LineHeight(1)
			})
		})
		ui.Column(c).Grow(1).Basis(0).MinWidth(0).Gap(t.S2).Children(func() {
			uiText(c, text).FontSize(t.MD).LineHeight(a.leading(1.5)).TextColor(t.Ink)
			if aside != nil {
				aside()
			}
		})
	})
}

// chatRow is a row on the text column: a title, one muted line, its
// control at the right edge.
func (a *App) chatRow(c *ui.Context, key, title, line string, control func()) {
	a.chatRowHow(c, key, title, line, "", control)
}

// chatRowHow is a chatRow whose line has 怎么做到的 under it (D424) when detail is set.
func (a *App) chatRowHow(c *ui.Context, key, title, line, detail string, control func()) {
	t := a.T
	a.sep(c)
	ui.Row(c.Key("chat-row:"+key)).Gap(t.S3).Padding(t.S4, t.S5).MinHeight(64).AlignItems(ui.Center).Children(func() {
		ui.Box(c).Width(40).Shrink(0)
		ui.Column(c).Grow(1).Basis(0).MinWidth(0).Gap(2).Children(func() {
			uiText(c, title).FontSize(t.MD).FontWeight(700).LineHeight(a.leading(1.4))
			if line != "" {
				uiText(c, line).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.InkMuted)
			}
			if detail != "" {
				a.how(c, key, title, detail)
			}
		})
		if control != nil {
			ui.Row(c).Shrink(0).Gap(t.S2).AlignItems(ui.Center).Children(control)
		}
	})
}

// chatFoot is a group's last line: its one quiet note on the text column,
// its button(s) at the right edge.
func (a *App) chatFoot(c *ui.Context, key, note string, buttons func()) {
	t := a.T
	a.sep(c)
	ui.Row(c.Key("chat-foot:"+key)).Gap(t.S3).Padding(t.S3, t.S5, t.S4, t.S5).MinHeight(60).AlignItems(ui.Center).Children(func() {
		ui.Box(c).Width(40).Shrink(0)
		uiText(c, note).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.InkMuted).Grow(1).Basis(0).MinWidth(0)
		if buttons != nil {
			ui.Row(c).Shrink(0).Gap(t.S2).AlignItems(ui.Center).Children(buttons)
		}
	})
}

// chatChip is a command or a code set apart from the sentence: mono, on a
// sunken chip, selectable.
func (a *App) chatChip(c *ui.Context, text string, size float32) {
	t := a.T
	ui.Row(c).Children(func() {
		uiText(c, text).Font(t.Mono).FontSize(size).FontWeight(600).TextColor(t.Ink).
			Padding(t.S1, t.S2).Radius(t.RadiusXS).Background(t.SurfaceSunken).Selectable()
	})
}

// chatField is a real field: its label over it, a white input with a
// hairline that turns ink while typing in it.
func (a *App) chatField(c *ui.Context, key, label string, v *string, placeholder string) {
	t := a.T
	ui.Column(c.Key("chat-field:" + key)).Gap(t.S1).MaxWidth(460).Children(func() {
		uiText(c, label).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft)
		in := ui.TextInput(c.Key("chat-input:"+key), v).Placeholder(placeholder).Label(label).Password().
			FontSize(t.MD).Height(t.ControlMD).Padding(0, t.S4).Radius(t.RadiusSM).Background(t.Surface)
		edge := t.Line2
		if in.Focused() {
			edge = t.InkSoft
		}
		in.Border(1, edge)
	})
}

func (a *App) chatCard(c *ui.Context, v protocol.ChannelView, manifest string) {
	t := a.T
	name := chatNames[v.Kind]
	who := "chats.tg.who"
	if v.Kind == "slack" {
		who = "chats.sl.who"
	}
	a.chatGroup(c, "chat-"+v.Kind, name, func() {
		line, tone := a.chatState(v)
		if a.chatResting(v.Kind, v) {
			a.chatHeadWith(c, v.Kind, name, line, tone, a.chatSetUp(c, v.Kind, name))
			a.chatFoot(c, "rest:"+v.Kind, a.L.T(who), nil)
			return
		}
		a.chatHead(c, v.Kind, name, line, tone)
		if v.StrangerAt != "" {
			if at, err := time.Parse(time.RFC3339, v.StrangerAt); err == nil && a.Now().Sub(at) < 24*time.Hour {
				a.chatRow(c, "stranger:"+v.Kind, a.L.T("chats.stranger", name, a.personaName()), "", nil)
			}
		}
		switch {
		case v.State == "off" || (v.State == "cant_connect" && v.Reason == "token"):
			a.chatConnect(c, v.Kind, manifest)
			a.chatFoot(c, "connect:"+v.Kind, a.L.T(who), func() { a.chatConnectButton(c, v.Kind) })
			return
		}
		if v.Reinstall {
			a.chatReinstall(c, manifest)
		}
		switch {
		case v.State == "unlinked":
			a.chatLink(c, v)
		case v.State == "linked":
			person := ""
			if v.Linked != nil {
				person = v.Linked.Name
			}
			goes := a.L.T("chats.linked.goes", name)
			if v.Kind == "slack" {
				goes = a.L.T("chats.sl.linked.goes") // D527: @-mentions in a channel too
			}
			a.chatRow(c, "linked:"+v.Kind, a.L.T("chats.linked.who", person), goes, func() {
				if a.buttonFor(c, a.L.T("chats.unlink"), name, btnText, t.ControlSM, t.Surface) {
					a.send(protocol.ChannelOpReq{T: "channel_unlink", Kind: v.Kind})
				}
			})
		}
		// D289: a destructive action is quiet until hovered, and asks in place.
		if a.chats.forgetting == v.Kind {
			keep, forget := a.confirmRow(c, "chat-forget:"+v.Kind, a.L.T("chats.forget.ask", name), a.L.T("card.stop.keep"), a.L.T("chats.forget", name), name)
			if keep {
				a.chats.forgetting = ""
			}
			if forget {
				a.chats.forgetting = ""
				a.send(protocol.ChannelOpReq{T: "channel_forget", Kind: v.Kind})
				a.say("chat:"+v.Kind, a.L.T("said.chats.off", name)) // D404
			}
			return
		}
		a.chatFoot(c, "end:"+v.Kind, a.L.T(who), func() {
			if a.quietDanger(c, "chat-forget:"+v.Kind, a.L.T("chats.forget", name), name) {
				a.chats.forgetting = v.Kind
			}
		})
	})
}

func (a *App) chatConnect(c *ui.Context, kind, manifest string) {
	t := a.T
	s := &a.chats
	tok, app := s.token[kind], s.app[kind]
	a.chatBody(c, "connect:"+kind, func() {
		if kind == "telegram" {
			a.chatStep(c, 1, a.L.T("chats.tg.step1"), func() {
				ui.Row(c).Gap(t.S4).AlignItems(ui.Center).Children(func() {
					a.chatChip(c, "/newbot", t.MonoSM)
					if a.quietLink(c, "botfather", a.L.T("chats.tg.botfather"), a.L.T("chats.tg.botfather")) {
						a.openLink(botFatherURL)
					}
				})
				a.note(c, a.L.T("chats.tg.step1.have")) // D404: a bot made before keeps its key in BotFather
			})
			a.chatStep(c, 2, a.L.T("chats.tg.step2", a.personaName()), nil)
			a.chatStep(c, 3, a.L.T("chats.tg.step3"), func() {
				a.chatField(c, "chat-tg", a.L.T("chats.tg.key"), &tok, "123456789:AA…")
			})
		} else {
			a.chatStep(c, 1, a.L.T("chats.sl.step1"), func() {
				ui.Row(c).Gap(t.S3).AlignItems(ui.Center).Children(func() {
					label := a.L.T("chats.sl.copy")
					if s.copied {
						label = a.L.T("chats.sl.copied")
					}
					if a.buttonFor(c, label, "Slack", btnSecondary, t.ControlSM, t.Surface) {
						c.WriteClipboard(manifest)
						s.copied = true
					}
					view, chev := a.L.T("chats.sl.view"), 1
					if s.manifest {
						view, chev = a.L.T("chats.sl.hide"), 2
					}
					if a.quietButton(c, "chat-manifest", view, a.L.T("chats.sl.copy"), false, chev) {
						s.manifest = !s.manifest
					}
				})
				if s.manifest {
					ui.Scroll(c.Key("chat-manifest")).MaxHeight(180).Radius(t.RadiusSM).Background(t.SurfaceSunken).Children(func() {
						uiText(c, manifest).Font(t.Mono).FontSize(t.XS).LineHeight(1.5).TextColor(t.InkSoft).Padding(t.S3, t.S4).Selectable()
					})
				}
			})
			a.chatStep(c, 2, a.L.T("chats.sl.step2"), func() {
				ui.Row(c).Gap(t.S4).AlignItems(ui.Center).Children(func() {
					if a.quietLink(c, "slack-apps", a.L.T("chats.sl.open"), a.L.T("chats.sl.open")) {
						a.openLink(slackAppsURL)
					}
					// D527: the partner's face, to upload as the app's icon (optional).
					if a.quietLink(c, "slack-face", a.L.T("chats.sl.face"), a.L.T("chats.sl.face")) {
						a.openLink(a.slackFaceURL())
					}
				})
				a.note(c, a.L.T("chats.sl.step2.face"))
			})
			// D527: Slack's order today: install (OAuth & Permissions) gives the bot token, then the app-level token.
			a.chatStep(c, 3, a.L.T("chats.sl.step3"), func() {
				a.chatField(c, "chat-sl-bot", a.L.T("chats.sl.bot"), &tok, "xoxb-…")
				a.note(c, a.L.T("chats.sl.step3.skip"))
			})
			a.chatStep(c, 4, a.L.T("chats.sl.step4"), func() {
				a.chatField(c, "chat-sl-app", a.L.T("chats.sl.app"), &app, "xapp-…")
			})
		}
		s.token[kind], s.app[kind] = tok, app
		if r := s.bad[kind]; r != "" {
			key := "chats.bad.network"
			if r == "token" {
				key = "chats.bad.key"
			}
			ui.Row(c).Gap(t.S3).Children(func() {
				ui.Box(c).Width(40).Shrink(0)
				uiText(c, a.L.T(key)).FontSize(t.SM).FontWeight(600).TextColor(t.Failed.Ink)
			})
		}
	})
}

// chatConnectButton is the group's one primary: Connect, at the right
// edge of its last line.
func (a *App) chatConnectButton(c *ui.Context, kind string) {
	t := a.T
	s := &a.chats
	tok, app := s.token[kind], s.app[kind]
	ready := tok != "" && (kind == "telegram" || app != "")
	label := a.L.T("chats.connect")
	if s.busy[kind] {
		label = a.L.T("chats.connecting")
	}
	if a.buttonFor(c, label, chatNames[kind], btnPrimary, t.ControlMD, t.Surface) && ready && !s.busy[kind] {
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
}

func (a *App) chatLink(c *ui.Context, v protocol.ChannelView) {
	t := a.T
	s := &a.chats
	name := chatNames[v.Kind]
	code, ok := s.code[v.Kind]
	live := false
	if ok {
		if at, err := time.Parse(time.RFC3339, code.ExpiresAt); err == nil && a.Now().Before(at) {
			live = true
		}
	}
	if !live {
		a.chatRow(c, "link:"+v.Kind, a.L.T("chats.link.title"), a.L.T("chats.link.note", a.personaName()), func() {
			if a.buttonFor(c, a.L.T("chats.code.get"), name, btnPrimary, t.ControlMD, t.Surface) {
				a.send(protocol.ChannelOpReq{T: "channel_code", Kind: v.Kind})
			}
		})
		return
	}
	a.chatBody(c, "code:"+v.Kind, func() {
		ui.Row(c).Gap(t.S3).AlignItems(ui.Center).Children(func() {
			ui.Box(c).Width(40).Shrink(0)
			ui.Column(c).Grow(1).Basis(0).MinWidth(0).Gap(t.S2).Children(func() {
				if v.Kind == "telegram" {
					key := "chats.tg.code" // "Or…" only beside the open button (D404)
					if code.Link == "" {
						key = "chats.tg.code.only"
					}
					uiText(c, a.L.T(key)).FontSize(t.MD).LineHeight(a.leading(1.5))
					a.chatChip(c, "/start "+code.Code, t.MonoSM)
				} else {
					bot := a.personaName()
					if v.Bot != nil && v.Bot.Name != "" {
						bot = v.Bot.Name
					}
					uiText(c, a.L.T("chats.sl.code", bot)).FontSize(t.MD).LineHeight(a.leading(1.5))
					uiText(c, code.Code).Font(t.Mono).FontSize(t.XL).FontWeight(700).LetterSpacing(1).Selectable()
					a.note(c, a.L.T("chats.sl.find", bot)) // D527: where the app's messages are
				}
				uiText(c, a.L.T("chats.code.ttl")).FontSize(t.SM).TextColor(t.InkMuted)
			})
			if code.Link != "" {
				open := a.L.T("chats.tg.open")
				if v.Kind == "slack" {
					open = a.L.T("chats.sl.open.dm") // D527: Slack's app_redirect to the app's messages
				}
				if a.buttonFor(c, open, name, btnPrimary, t.ControlMD, t.Surface) {
					a.openLink(code.Link)
				}
			}
		})
	})
}

// slackFaceURL is the default partner's face as a PNG (D527), the same one
// Slack shows on each of its messages, to upload as the app's icon.
func (a *App) slackFaceURL() string {
	look := "sand"
	for _, p := range a.S.Partners {
		if p.ID == protocol.DefaultPartner && p.Look != "" {
			look = p.Look
		}
	}
	return "https://ducter.ai/faces/" + look + ".png"
}

// chatReinstall is D527's one plain line for a Slack app made before the
// current manifest: what to do, and the new manifest one press away.
func (a *App) chatReinstall(c *ui.Context, manifest string) {
	t := a.T
	a.chatRow(c, "reinstall:slack", a.L.T("chats.sl.re.title"), a.L.T("chats.sl.re.how"), func() {
		label := a.L.T("chats.sl.copy")
		if a.chats.reCopied {
			label = a.L.T("chats.sl.copied")
		}
		if a.buttonFor(c, label, "Slack", btnSecondary, t.ControlSM, t.Surface) {
			c.WriteClipboard(manifest)
			a.chats.reCopied = true
		}
	})
}
