package views

// D438: 小窗 / Mini window. The partner in a small window that floats beside
// whatever the person works in (their editor, a browser, a task's
// workbench), on every Space, without taking the keyboard or bringing Ducter
// to the front: the clay partner, its one live line, what needs them (a
// count to tap), and a field to say something, with hold to talk. It is the
// same conversation as the main window's (the draft is one), never a second
// one. main.go makes it a panel (mygo's WindowOptions.Panel) and shows it
// with ShowInactive; this is what it shows and says.

import (
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

const (
	// FloatW is the mini window's width; its height follows what it shows.
	FloatW = 380
	// FloatMinH and FloatMaxH bound its height.
	FloatMinH = 128
	FloatMaxH = 520
	// FloatKey is the shortcut that shows and hides it, anywhere (mygo's
	// GlobalShortcut: Carbon's hot keys, no Accessibility permission).
	// ⌥Space is taken by launchers and other assistants, ⌃Space and ⌃⌥Space
	// switch input sources (the Chinese user's every minute), ⇧⌘Space is an
	// editor's parameter hints, ⌥⌘Space Finder's search: all three
	// modifiers and Space are free of them.
	FloatKey = "Ctrl+Alt+Cmd+Space"
	// floatRoom is the empty box round the mini window's partner (its
	// waiting sway leans up to 6° about its feet).
	floatRoom = 5
	// floatFresh is how long the partner's newest words stay the line.
	floatFresh = 30 * time.Minute
	// floatReplyChars is how much of them the line shows (two lines).
	floatReplyChars = 72
)

// floatState is the mini window's own state on the App.
type floatState struct {
	// first: shown by itself, the once (the first task opened in an editor
	// or a terminal); its line says the key until the person uses it.
	first bool
	// keys: it has the keyboard (the hold-to-talk key works there too).
	keys bool
	// h is the height last asked of the window.
	h int
}

// The mini window's hands, set by main.go (nil in tests: recorded only).
type FloatHands struct {
	// Shown reports whether the window is on screen.
	Shown func() bool
	// Show puts it on screen without taking the keyboard; Hide takes it away.
	Show, Hide func()
	// Resize gives it a new height, its top edge kept.
	Resize func(h int)
	// Redraw draws the main window again (the draft, a message sent here).
	Redraw func()
}

// FloatMenu is what the mini window's menu items (the app's View menu, the
// menu bar's) show beside their name: the shortcut, or, when another app
// holds it (D446), no shortcut and a line saying so, so a press that does
// nothing is explained where the person looks next, and the item itself is
// the way in.
func (a *App) FloatMenu() (accel, sub string) {
	if a.FloatKeyTaken {
		return "", a.L.T("float.key.taken")
	}
	return FloatKey, ""
}

// FloatShown reports whether the mini window is on screen.
func (a *App) FloatShown() bool { return a.Float.Shown != nil && a.Float.Shown() }

// ToggleFloat shows the mini window, or puts it away (the shortcut, the
// menus). Remembered on this Mac: it comes back at the next launch.
func (a *App) ToggleFloat() {
	if a.FloatShown() {
		a.HideFloat()
		return
	}
	a.ShowFloat()
}

// ShowFloat puts the mini window on screen, never in front of the keyboard.
func (a *App) ShowFloat() {
	a.Local.SetFloatOpen(true)
	// What it said when it was put away is not held over: it opens on now.
	delete(a.aliveShown, "float-line")
	if a.Float.Show != nil {
		a.Float.Show()
	}
}

// HideFloat puts it away.
func (a *App) HideFloat() {
	a.float.first = false
	a.Local.SetFloatOpen(false)
	if a.Float.Hide != nil {
		a.Float.Hide()
	}
}

// offerFloat is the moment the mini window fits (D438): a task's folder
// opened in an editor or a terminal, so the person is leaving Ducter to
// work beside it. The first time on this Mac it comes by itself, quietly,
// and its line says the key; never again after.
func (a *App) offerFloat() {
	if a.Local.FloatOffered() || a.FloatShown() {
		return
	}
	a.Local.MarkFloatOffered()
	a.float.first = true
	a.ShowFloat()
}

// floatLine is the one live line: what it says, and whether it is the
// waiting line (the figure acts out the step) or the partner's newest words.
type floatLine struct {
	kind      string // "wait", "held", "first", "reply", "ask", "say"
	words     string
	sub, step string
	el        time.Duration
	// look (D450) is what another AI, or the page check, still found in
	// the result or the Go the line is about: one line in the needs-you
	// ink, as the conversation says it under the same words.
	look string
	// note (D450) is who thinks for the partner while its own agent is
	// held (D435): the conversation's header line, here under the line.
	note string
}

// floatSay is the line now, in order: waiting on a reply (D425's words and
// cadence), when it answers again while nobody can (D435), the first time's
// key, the partner's newest words while they are fresh, else On hand's one
// sentence over the whole. While another agent thinks for it, the line
// carries that as its note.
func (a *App) floatSay(c *ui.Context) floatLine {
	line := a.floatLineNow(c)
	if h := a.brainHeld(); h != nil && !h.Waits && line.kind != "held" {
		line.note = a.L.T("float.held", harnessName(a.brain().Harness))
	}
	return line
}

func (a *App) floatLineNow(c *ui.Context) floatLine {
	// D435: nobody can answer until its own agent is back: when, where the
	// line sits, so a message sent from here is never met by silence.
	if h := a.brainHeld(); h != nil && h.Waits {
		if at := a.heldAt(h); at != "" {
			return floatLine{kind: "held", words: a.L.T("header.held", at)}
		}
		return floatLine{kind: "held", words: a.L.T("header.held.soon")}
	}
	if a.thinking() {
		step, el, line, sub := a.presenceNow(c)
		return floatLine{kind: "wait", words: line, sub: sub, step: step, el: el}
	}
	if a.float.first {
		if a.FloatKeyTaken { // D446: no key to promise; the menu is the way
			return floatLine{kind: "first", words: a.L.T("float.first.menu")}
		}
		return floatLine{kind: "first", words: a.L.T("float.first", a.L.T("float.key"))}
	}
	if words, at, e := a.newestWords(); words != "" {
		if left := at.Add(floatFresh).Sub(a.Now()); left > 0 {
			c.After(left)
			return floatLine{kind: "reply", words: clipQuote(words, floatReplyChars), look: a.floatReplyLook(e)}
		}
	}
	if a.Status == client.Disconnected {
		return floatLine{kind: "say", words: a.L.T("conn.offline")}
	}
	if !a.S.Welcomed {
		return floatLine{kind: "say"}
	}
	// Something needs the person: the count says how many, the line which
	// (the oldest question, in its own words).
	if ds := a.TrayDecisions(1); len(ds) > 0 {
		line := floatLine{kind: "ask", words: ds[0].Question}
		if d := a.S.Decisions[ds[0].ID]; d != nil && d.Look != nil && len(d.Look.Left) > 0 {
			line.look = a.L.T("float.look", d.Look.Left[0])
		}
		return line
	}
	b := a.S.Board()
	return floatLine{kind: "say", words: autospace(a.headSay(b, "", a.stateCounts(b, "")))}
}

// newestWords are the partner's words when they are the conversation's
// newest (after the person's last message), when they were said, and their
// entry.
func (a *App) newestWords() (string, time.Time, *store.Entry) {
	for i := len(a.S.Channel) - 1; i >= 0; i-- {
		e := a.S.Channel[i]
		switch {
		case e.User != nil:
			return "", time.Time{}, nil
		case e.AI != nil && e.AI.DecisionID == "":
			if w := plainWords(e.AI.Text); w != "" {
				return w, store.ParseTime(e.Event.TS), e
			}
		}
	}
	return "", time.Time{}, nil
}

// floatReplyLook (D450) is what is still so in a result the partner's
// newest words tell about: another AI's first point, else the page check's,
// as the conversation shows them under those words; "" when clean.
func (a *App) floatReplyLook(e *store.Entry) string {
	if e == nil || e.AI == nil || e.AI.ReplyTo == 0 {
		return ""
	}
	for _, id := range a.tasksOfReply(e.AI.ReplyTo) {
		task := a.S.Task(id)
		if task == nil || !finished(task) {
			continue
		}
		if l := reportLookLeft(task); len(l) > 0 {
			return a.L.T("float.look", l[0])
		}
		if l := reportDocLeft(task); len(l) > 0 {
			return a.L.T("float.doc", l[0])
		}
	}
	return ""
}

// FloatView is the mini window's view.
func (a *App) FloatView(c *ui.Context) {
	// Light or dark as the main window (D302): the same tokens, followed here
	// too, since the main window may be hidden.
	if a.followAppearance(c) {
		a.uiTheme = nil
	}
	if a.uiTheme != nil {
		c.SetTheme(a.uiTheme)
	} else {
		c.SetTheme(a.T.UITheme(c.Theme()))
	}
	t := a.T
	a.float.keys = c.WindowActive()
	draft := a.draft
	ui.Column(c.Key("float")).Fill().Background(t.Bg).TextColor(t.Ink).Font(t.Body).Children(func() {
		body := ui.Column(c.Key("float-body")).Padding(t.S3, t.S3, t.S3, t.S3).Gap(t.S2)
		body.Children(func() {
			a.floatHead(c)
			if a.held != nil && a.held.taskID == "" {
				a.heldLine(c)
			}
			ui.Column(c.Key("float-voice")).Children(func() { a.floatVoice(c) })
			a.floatField(c)
		})
		// The window takes the height of what it shows, its top edge kept.
		if h := int(body.LayoutBounds().H + 0.5); h > 0 {
			h = min(max(h, FloatMinH), FloatMaxH)
			if h != a.float.h {
				a.float.h = h
				if a.Float.Resize != nil {
					a.Float.Resize(h)
				}
				c.After(time.Second / 60)
			}
		} else {
			c.After(time.Second / 60)
		}
	})
	if a.draft != draft && a.Float.Redraw != nil {
		a.Float.Redraw()
	}
}

// floatHead is the partner and its line, what needs the person, and Hide.
// The whole of it moves the window; a click on the partner or its line
// opens the conversation in Ducter's own window.
func (a *App) floatHead(c *ui.Context) {
	t := a.T
	line := a.floatSay(c)
	// D446: the partner gets floatRoom of empty box round it, so its sway
	// and breath are never cut at its box's side; the head's padding and gap
	// give that room back, so the words stand where they did.
	head := ui.Row(c.Key("float-head")).Gap(t.S3-floatRoom).AlignItems(ui.Start).Padding(t.S1, 0, 0, max(t.S1-floatRoom, 0)).DragWindow()
	open := func(e ui.Element) {
		if e.Clicked() {
			a.floatOpen(func() { a.Route = RouteConversation })
		}
	}
	head.Children(func() {
		fig := ui.Box(c.Key("float-fig")).Padding(max(t.S1-floatRoom, 0), 0, 0, 0).Shrink(0).Cursor(ui.CursorPointer).Role(ui.RoleButton).
			Label(spoken(a.L, a.S.PersonaName, a.L.T("float.open"))).Tooltip(a.L.T("float.open"))
		fig.Children(func() {
			if line.kind == "wait" {
				m := aliveMotionFor(line.step, line.el, c.Preferences().ReduceMotion || a.aliveResting(c))
				if m != aliveStill && m != aliveSettle && line.el < aliveSettleAfter {
					c.After(aliveSettleAfter - line.el)
				}
				a.aliveFigureIn(c, "float", aliveFaceFor(line.step), m, 44, floatRoom)
			} else {
				a.partnerFaceIn(c, "float", a.presence(c), 44, floatRoom)
			}
		})
		open(fig)
		ui.Column(c.Key("float-words")).Gap(2).Grow(1).MinWidth(0).Children(func() {
			// The name, what needs the person, and Hide on one line; the line
			// under them takes the window's whole width.
			ui.Row(c.Key("float-top")).Gap(t.S2).AlignItems(ui.Center).Children(func() {
				uiText(c.Key("float-name"), a.S.PersonaName).FontSize(t.SM).FontWeight(700).TextColor(t.InkMuted).SingleLine().Grow(1).MinWidth(0)
				if n := a.WaitingCount(); n > 0 {
					a.floatNeeds(c, n)
				}
				if a.iconButton(c, a.L.T("float.close"), t.ControlSM, btnText, drawCross) {
					a.HideFloat()
				}
			})
			say := ui.Column(c.Key("float-line")).Cursor(ui.CursorPointer).Role(ui.RoleButton).Focusable().
				Label(spoken(a.L, a.S.PersonaName, firstNonEmpty(line.words, a.L.T("float.open")))).Tooltip(a.L.T("float.open"))
			say.Children(func() { a.floatWords(c, line) })
			open(say)
		})
	})
}

// floatWords is the line itself: held for the dwell and cross-faded as the
// waiting line is (D425); the partner's words in its own ink, the rest muted.
func (a *App) floatWords(c *ui.Context, line floatLine) {
	t := a.T
	if line.words == "" {
		ui.Box(c.Key("float-line-empty")).Height(t.MD * 1.45)
		return
	}
	words, k := a.aliveHeld(c, "float-line", line.words)
	ink := t.InkSoft
	if line.kind == "reply" || line.kind == "ask" {
		ink = t.Ink
	}
	w := ui.Box(c.Key("float-say:" + words)).Opacity(k)
	if !c.Preferences().ReduceMotion {
		w.Translate(0, 3*(1-k))
	}
	w.Role(ui.RoleStatus).Label(words)
	w.Children(func() {
		uiText(c, keepWords(words)).FontSize(t.MD).LineHeight(1.45).TextColor(ink).MaxLines(2)
	})
	// D450: what is still so, one line in the needs-you ink (a tap on the
	// line opens the conversation, where it is said in full).
	if line.look != "" {
		uiText(c.Key("float-look"), line.look).FontSize(t.SM).FontWeight(600).TextColor(t.NeedsYou.Ink).SingleLine().MinWidth(0).Tooltip(line.look)
	}
	if line.note != "" {
		uiText(c.Key("float-note"), line.note).FontSize(t.XS).TextColor(t.InkMuted).SingleLine().MinWidth(0)
	}
	if line.sub != "" {
		uiText(c.Key("float-sub"), a.L.T(line.sub)).FontSize(t.XS).TextColor(t.InkMuted).SingleLine()
	}
}

// floatNeeds is what needs the person, as a count: the only accent in the
// window (the menu bar's dot, said). A tap opens On hand on it.
func (a *App) floatNeeds(c *ui.Context, n int) {
	t := a.T
	words := a.L.T("header.needs", n)
	b := ui.Row(c.Key("float-needs")).Gap(t.S1+2).AlignItems(ui.Center).Height(t.ChipSM+4).Padding(0, t.S2+2).
		Radius(t.Pill).Background(t.NeedsYou.Surface).Cursor(ui.CursorPointer).Role(ui.RoleLink).
		Label(words).Tooltip(a.L.T("float.needs.open")).Focusable().Shrink(0)
	if b.Hovered() || b.Pressed() {
		b.Background(t.NeedsYou.Surface.Mix(t.NeedsYou.Dot, 0.18))
	}
	b.Children(func() {
		ui.Box(c).Size(7, 7).Radius(4).Background(t.NeedsYou.Dot).Shrink(0).AccessHidden(true)
		uiText(c, words).FontSize(t.XS).FontWeight(700).TextColor(t.NeedsYou.Ink).SingleLine().AccessHidden(true)
	})
	if b.Clicked() {
		a.floatOpen(func() {
			a.Route = RouteOnHand
			a.oh.filter, a.oh.focus = 1, ""
		})
	}
}

// floatOpen goes somewhere in Ducter's own window, in front.
func (a *App) floatOpen(then func()) {
	a.float.first = false
	then()
	if a.ShowMain != nil {
		a.ShowMain()
	}
}

// floatVoice is hold to talk's strip or card over the field (D305), at the
// mini window's width.
func (a *App) floatVoice(c *ui.Context) {
	vs := &a.vox
	// D442: 放手说 from the mini window's microphone: the same talk, at its width.
	if a.hf.on {
		a.talkFeed(c)
		a.talkPanel(c)
		return
	}
	if (a.hf.ask || a.hf.off != "" || a.hf.cant) && vs.phase != "listen" && vs.phase != "finishing" && a.talkAbove(c) {
		return
	}
	switch vs.phase {
	case "listen", "finishing":
		a.listeningStrip(c)
	case "ask":
		a.voiceAskCard(c)
	case "denied":
		a.voiceDenied(c)
	case "off":
		a.voiceOff(c)
	}
}

// floatField is the field to say something: the conversation's own draft,
// hold to talk and Send. Esc with nothing written puts the window away.
func (a *App) floatField(c *ui.Context) {
	t := a.T
	box := ui.Row(c.Key("float-field")).Gap(t.S2).AlignItems(ui.Center).ObserveInput(a.voiceObserve).
		Padding(t.S1, t.S1, t.S1, t.S3).Radius(t.RadiusLG).Background(t.Surface).
		Shadow(0, t.Raised.Y, t.Raised.Blur, 0, t.Raised.Color)
	box.Children(func() {
		ph, label := a.L.T("composer.placeholder", a.S.PersonaName), a.L.T("composer.label", a.S.PersonaName)
		if r := a.rp.replying; r != nil {
			label = a.replyLabel(r.from)
			ph = label + "…"
		}
		ui.TextArea(c.Key("float-composer"), &a.draft).Lines(1, 4).MinHeight(0).Placeholder(ph).Label(label).
			Background(ui.Transparent).Border(0, ui.Transparent).Padding(t.S2, 0).Grow(1).FontSize(t.MD).
			OnTextKey(func(k ui.TextKey) bool {
				if k.Key == ui.KeyEscape && k.Mods == 0 {
					switch {
					case a.vox.phase == "listen":
						a.voiceDrop()
					case a.CancelReply():
					case k.Text() == "":
						a.HideFloat()
					default:
						return false
					}
					return true
				}
				a.speakStop()
				if k.Key == ui.KeyEnter && k.Mods == 0 {
					if text := k.Text(); a.floatSend(text) {
						k.SetText("")
					}
					return true
				}
				return false
			})
		a.micButton(c)
		if a.iconButton(c, a.L.T("composer.send"), t.ControlMD, btnAccent, drawSend) {
			if a.floatSend(a.draft) {
				a.draft = ""
			}
		}
	})
}

// floatSend sends from the mini window: the conversation's own message.
func (a *App) floatSend(text string) bool {
	if !a.SendMessage(text) {
		return false
	}
	a.float.first = false
	a.voiceSent(text)
	if a.Float.Redraw != nil {
		a.Float.Redraw()
	}
	return true
}
