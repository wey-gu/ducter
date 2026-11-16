package views

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// D298: the partner's first words, a real message the home says once, and
// a pasted API key (design/onboarding.md "First words", "A key instead").
//
// Over the first words, while nothing else has been said, the clay partner
// waves once (still under reduced motion); under them, what they offer, two
// to a row, a tap filling the composer (never sending); under those, where
// the person's own things were read and 别再看了 / Stop looking. When nothing
// on the home can think yet, a card asks for a key: one masked field, 检查 /
// Check, and the partner's own words for what came of it.

// keyPaste is the pasted-key card's state (one per window).
type keyPaste struct {
	key     string
	open    bool   // the first run's "or paste a key" row is open
	pending string // the clientId waiting for its answer (the home's key_add)
	busy    bool   // the first run's `ducter key add` is running
	result  *protocol.KeyResult
	at      time.Time // when the result came
	// from (D307): where the key was pasted; one from Settings is answered
	// there, not again over the composer. "" is the conversation's.
	from string
	// setOpen: the Settings rows whose card is open, by where they are.
	setOpen map[string]bool
}

// KeyShownFor is how long a key's good result stays on its card.
const KeyShownFor = 10 * time.Second

// firstWordsOpening reports whether the conversation is still at its very
// start: the partner's first words and nothing said back yet.
func (a *App) firstWordsOpening() bool {
	f := a.S.First
	return f != nil && f.Visit == "first"
}

// firstWordsHead is the clay partner over its first words.
func (a *App) firstWordsHead(c *ui.Context) {
	t := a.T
	ui.Row(c.Key("first-head")).Justify(ui.Center).Padding(t.S2, 0, t.S4, 0).Children(func() {
		a.helloAvatar(c, 132)
	})
}

// firstWordsAfter is what the first words offer, where they were read,
// and, with nothing to think with yet, the key card.
func (a *App) firstWordsAfter(c *ui.Context, e *store.Entry) {
	t := a.T
	fw := e.AI.First
	looks := a.S.First.Looking()
	var starts []protocol.FirstStart
	for _, s := range fw.Starts {
		if s.From != "everyday" && !looks {
			continue // 别再看了: what came from their records goes away
		}
		starts = append(starts, s)
	}
	if len(starts) > 0 {
		ui.Row(c.Key("first-starts")).Wrap().Gap(t.S2).Margin(t.S2, 0, 0, 0).AlignItems(ui.Stretch).Children(func() {
			for n, s := range starts {
				text := autospace(s.Words)
				chip := ui.Row(c.Key(n+1)).Basis(260).Grow(1).MinHeight(56).Padding(t.S3, t.S4).Radius(t.RadiusMD).AlignItems(ui.Center).
					Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(text).Focusable()
				a.buttonLook(c, chip, btnSecondary, t.ControlLG, t.Bg)
				chip.Children(func() {
					ui.Text(c, text).FontSize(t.MD).LineHeight(leadingFor(text, 1.45)).Grow(1).MinWidth(0)
				})
				if chip.Clicked() {
					a.draft = unautospace(s.Draft)
					a.focusComposer = true
				}
			}
		})
	}
	if len(fw.Looked) > 0 {
		ui.Row(c.Key("first-from")).Gap(t.S2).AlignItems(ui.Center).Wrap().Margin(t.S1, 0, 0, 2).Children(func() {
			if looks {
				names := make([]string, 0, len(fw.Looked))
				for _, l := range fw.Looked {
					names = append(names, agentName(l))
				}
				line := a.L.T("first.from", strings.Join(names, a.L.T("first.from.and")))
				ui.Text(c, line).FontSize(t.XS).TextColor(t.InkMuted).LineHeight(1.45).Grow(1).Basis(240).MinWidth(0)
				if a.button(c, a.L.T("first.stop"), btnText, t.ControlSM, t.Bg) {
					a.send(protocol.LocalAgents{T: "local_agents", On: false})
					if a.S.First != nil {
						a.S.First.SetLooking(false)
					}
				}
				return
			}
			ui.Text(c, a.L.T("first.stopped")).FontSize(t.XS).TextColor(t.InkMuted).Grow(1).Basis(240).MinWidth(0)
			if a.button(c, a.L.T("first.again"), btnText, t.ControlSM, t.Bg) {
				a.send(protocol.LocalAgents{T: "local_agents", On: true})
				if a.S.First != nil {
					a.S.First.SetLooking(true)
				}
			}
		})
	}
	if a.S.First != nil && a.S.First.NoBrain || a.keyJustAdded() {
		ui.Column(c).Margin(t.S3, 0, 0, 0).Children(func() { a.keyCard(c, a.sendKey) })
	}
}

// agentName is an agent's own name for the provenance line.
func agentName(id string) string {
	switch id {
	case "claude-code":
		return "Claude Code"
	case "codex":
		return "Codex"
	case "pi":
		return "pi"
	}
	return id
}

// keyNoticeAboveComposer: nothing can think and the first words aren't on
// screen (someone returning to a home that lost its sign-in): the key card
// above the composer instead.
func (a *App) keyNoticeAboveComposer(c *ui.Context) bool {
	if a.firstWordsOpening() || (a.S.First == nil || !a.S.First.NoBrain) && !a.keyJustAdded() {
		return false
	}
	a.aboveComposer(c, func() { a.keyCard(c, a.sendKey) })
	return true
}

// keyJustAdded: a good result is still being shown on the card.
func (a *App) keyJustAdded() bool {
	a.keyResultNow() // the answer may come with the frame that ends NoBrain
	k := &a.kp
	return k.from == "" && k.result != nil && k.result.OK && a.Now().Sub(k.at) < KeyShownFor
}

// sendKey hands the key to the home (key_add); the answer comes as
// key_add_result with the same clientId.
func (a *App) sendKey(key string) {
	k := &a.kp
	k.pending = fmt.Sprintf("key-%d", a.Now().UnixNano())
	k.result, k.from = nil, ""
	a.send(protocol.KeyAdd{T: "key_add", Key: key, ClientID: k.pending})
}

// keyResultNow picks up the home's answer for the pending key.
func (a *App) keyResultNow() {
	k := &a.kp
	if k.pending == "" || a.S.KeyResults == nil {
		return
	}
	if r, ok := a.S.KeyResults[k.pending]; ok {
		delete(a.S.KeyResults, k.pending)
		k.pending, k.result, k.at = "", r, a.Now()
		if r.OK {
			k.key = ""
		}
	}
}

// keyCard is the card itself: what to paste and why it's safe, the masked
// field, 检查 / Check, then the partner's words for the result. submit
// sends the key (to the home, or to `ducter key add` before Ducter runs).
func (a *App) keyCard(c *ui.Context, submit func(key string)) {
	a.keyCardIn(c, submit, "")
}

// keyCardIn is the card for a place: "" the conversation's and the first
// run's (its own sunken card, its title); in Settings (D307) the row over
// it already says what it is: no title, no card in the card, and only the
// answer to a key pasted there.
func (a *App) keyCardIn(c *ui.Context, submit func(key string), from string) {
	t := a.T
	k := &a.kp
	a.keyResultNow()
	mine := k.from == from
	waiting := mine && (k.pending != "" || k.busy)
	r := k.result
	if !mine {
		r = nil
	}
	bg := t.SurfaceSunken
	card := ui.Column(c.Key("key-card")).Gap(t.S3)
	if from == "" {
		card.Padding(t.S4, t.S4).Radius(t.RadiusLG).Background(bg)
	} else {
		bg = t.Surface
	}
	field := t.Surface // on the sunken card; in Settings, sunken as Settings' other fields
	if from != "" {
		field = t.SurfaceSunken
	}
	card.Children(func() {
		if r != nil && r.OK && r.Needs == "" && a.Now().Sub(k.at) < KeyShownFor {
			c.After(KeyShownFor - a.Now().Sub(k.at))
			ui.Text(c, a.keySay(r)).FontSize(t.MD).LineHeight(1.5).TextColor(t.Done.Ink).FontWeight(700)
			return
		}
		if from == "" {
			ui.Text(c, a.L.T("key.paste.title")).FontSize(t.LG).FontWeight(800)
		}
		ui.Text(c, a.L.T("key.paste.body")).FontSize(t.SM).LineHeight(1.5).TextColor(t.InkSoft)
		submitNow := func() {
			if v := strings.TrimSpace(k.key); v != "" && !waiting {
				submit(v)
			}
		}
		ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(func() {
			in := ui.TextInput(c.Key("input:apikey"), &k.key).Placeholder(a.L.T("key.paste.eg")).Label(a.L.T("key.paste.field")).
				Font(t.Mono).FontSize(t.SM).Padding(t.S2, t.S3).Radius(t.RadiusSM).Background(field).Border(1, t.LineSoft).
				Height(t.ControlMD).Grow(1).MinWidth(0).OnSubmit(submitNow)
			in.Password()
			label := a.L.T("key.paste.check")
			if waiting {
				label = a.L.T("key.paste.checking")
				c.After(250 * time.Millisecond)
			}
			if a.button(c, label, btnPrimary, t.ControlMD, bg) {
				submitNow()
			}
		})
		if r == nil || waiting {
			return
		}
		ink := t.Failed.Ink
		if r.OK {
			ink = t.Done.Ink
		}
		ui.Text(c, a.keySay(r)).FontSize(t.SM).LineHeight(1.5).TextColor(ink)
		if r.OK && r.Needs == "pi" && r.Install != "" {
			a.commandBoxSized(c, r.Install, 13)
			if a.Backend != nil && a.button(c, a.L.T("key.paste.install"), btnSecondary, t.ControlMD, bg) {
				_ = a.Backend.RunInTerminal("pi", r.Install)
			}
		}
	})
}

// keySay is the partner's words for a key's result (the home's own), in
// this window's language.
func (a *App) keySay(r *protocol.KeyResult) string {
	if r.Say != nil {
		return autospace(a.words(*r.Say))
	}
	if r.OK {
		return a.L.T("key.paste.title")
	}
	return a.L.T("key.paste.failed", r.Detail+r.Reason)
}

// KeyAdder is the first run's way to add a key before Ducter runs: the
// app's own `ducter key add --json` (local.Supervisor.AddKey).
type KeyAdder interface {
	AddKey(key string) ([]byte, error)
}

// setupKeyRow is the first run's "or paste an API key" under the agents
// to install and sign in: closed, one quiet row; open, the key card. A key
// that works makes the check run again, and the first run goes on by
// itself.
func (a *App) setupKeyRow(c *ui.Context) {
	adder, ok := a.Backend.(KeyAdder)
	if !ok {
		return
	}
	t := a.T
	k := &a.kp
	if !k.open {
		ui.Row(c.Key("key-instead")).Gap(t.S3).AlignItems(ui.Center).Children(func() {
			ui.Column(c).Grow(1).MinWidth(0).Gap(2).Children(func() {
				ui.Text(c, a.L.T("key.paste.instead")).FontSize(t.MD).FontWeight(700)
				ui.Text(c, a.L.T("key.paste.instead.note")).FontSize(t.SM).TextColor(t.InkSoft)
			})
			if a.button(c, a.L.T("key.paste.check.open"), btnSecondary, t.ControlMD, t.Surface) {
				k.open = true
			}
		})
		return
	}
	a.keyCard(c, func(key string) {
		k.busy, k.result = true, nil
		var out []byte
		var err error
		a.async(func() { out, err = adder.AddKey(key) }, func() {
			k.busy, k.at = false, a.Now()
			var r protocol.KeyResult
			if err != nil && len(out) == 0 || json.Unmarshal(out, &r) != nil {
				r = protocol.KeyResult{OK: false, Reason: "failed"}
				if err != nil {
					r.Detail = err.Error()
				}
			}
			k.result = &r
			if r.OK {
				k.key = ""
				if r.Needs == "" {
					a.check() // pi or DeepSeek Harness is ready now: on by itself
				}
			}
		})
	})
	if a.button(c, a.L.T("key.paste.back"), btnText, t.ControlSM, t.Surface) {
		k.open = false
	}
}
