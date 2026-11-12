package views

import (
	"regexp"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// 密钥 / Keys (D233, design/autofill.md §8): the group in Settings ›
// Autofill (让任务向我要密钥, the kept keys, Add a key) and the card a task's
// ask_for_key raises: {task} 需要一个密钥, what and why, a masked field,
// 记住 or 只这一次, then 保存，继续 or 不给. The key goes once, in the
// card's Go (or saved_put), and is never shown again.

var keyEnvRe = regexp.MustCompile(`^[A-Z_][A-Z0-9_]{0,63}$`)

// keyTask is the task's name on a key card, or a plain word.
func (a *App) keyTask(d *store.DecisionState) string {
	if t := a.S.Task(d.TaskID); t != nil && t.Title() != "" {
		return t.Title()
	}
	return a.L.T("key.task")
}

// keysGroup is 密钥 / Keys in Settings › Autofill.
func (a *App) keysGroup(c *ui.Context, f *protocol.ServerFrame) {
	s := &a.af
	a.group(c, "af-keys", a.L.T("af.keys"), "", func() {
		on := f.AskKeys == nil || *f.AskKeys
		if v, ch := a.toggleRow(c, "af-ask-keys", a.L.T("af.keys.ask"), a.L.T("af.keys.ask.help"), on); ch {
			f.AskKeys = &v
			a.send(protocol.SavedAskKeys{T: "saved_ask_keys", On: v})
		}
		for _, x := range f.SavedKeys {
			x := x
			if s.editing == "key:"+x.ID {
				a.keyForm(c, &x)
				continue
			}
			mark := x.Hint
			if mark == "" {
				mark = a.L.T("af.key.kept")
			}
			a.afRow(c, "key:"+x.ID, x.Name, x.Env+" · "+a.afUsed(x.UsedAt), mark, func() { a.keyEdit(&x) })
		}
		if s.editing == "key:new" {
			a.keyForm(c, nil)
		} else {
			help := ""
			if len(f.SavedKeys) == 0 {
				help = a.L.T("af.key.why")
			}
			a.afRow(c, "key:add", "+  "+a.L.T("af.key.add"), help, "", func() { a.keyEdit(nil) })
		}
	})
}

func (a *App) keyEdit(x *protocol.KeyView) {
	s := &a.af
	a.clearForm()
	s.sure, s.sentAt = false, time.Time{}
	if x == nil {
		s.editing = "key:new"
		return
	}
	s.editing = "key:" + x.ID
	s.name, s.keyEnv = x.Name, x.Env
}

// keyForm adds or changes one key: what it is, the variable, the key.
func (a *App) keyForm(c *ui.Context, x *protocol.KeyView) {
	t := a.T
	s := &a.af
	a.sep(c)
	ui.Column(c.Key("af-key-form")).Gap(t.S3).Padding(t.S4, t.S5).Children(func() {
		a.afInput(c, "key-name", a.L.T("af.key.name"), &s.name, a.L.T("af.key.name.eg"), false)
		a.afInput(c, "key-env", a.L.T("af.key.env"), &s.keyEnv, "DO_TOKEN", false)
		s.keyEnv = strings.ToUpper(strings.TrimSpace(s.keyEnv))
		ph := ""
		if x != nil {
			ph = x.Hint
			if ph == "" {
				ph = a.L.T("af.key.kept")
			}
			ph += " · " + a.L.T("af.keep")
		}
		a.afInput(c, "key-value", a.L.T("af.key.value"), &s.password, ph, true)
		ok := keyEnvRe.MatchString(s.keyEnv) && (x != nil || strings.TrimSpace(s.password) != "")
		if f := a.savedFrame(); f != nil && !s.sentAt.IsZero() && f.Reason != "" {
			ui.Text(c, a.L.T("af.err."+f.Reason)+" ("+f.Message+")").FontSize(t.SM).TextColor(t.Failed.Ink)
		}
		ui.Row(c).Gap(t.S3).AlignItems(ui.Center).Children(func() {
			if x != nil {
				if s.sure {
					if a.buttonFor(c, a.L.T("af.remove.go"), x.Name, btnSecondary, t.ControlSM, t.Surface) {
						a.send(protocol.SavedRemove{T: "saved_remove", ID: x.ID})
						s.sentAt = a.Now()
					}
				} else if a.buttonFor(c, a.L.T("af.remove"), x.Name, btnText, t.ControlSM, t.Surface) {
					s.sure = true
				}
			}
			ui.Box(c).Grow(1)
			if a.button(c, a.L.T("af.cancel"), btnSecondary, t.ControlSM, t.Surface) {
				s.editing = ""
				a.clearForm()
			}
			if a.button(c, a.L.T("af.save"), btnPrimary, t.ControlSM, t.Surface) && ok {
				in := protocol.KeyInput{Kind: "key", Name: s.name, Env: s.keyEnv, Value: s.password}
				if x != nil {
					in.ID = x.ID
				}
				a.send(protocol.KeyPut{T: "saved_put", Item: in})
				s.sentAt = a.Now()
			}
		})
	})
}

// keyButtons is the key card's body: what and why, then the field, the
// choice and the two buttons; after, 已交给 {task} or 你没给.
func (a *App) keyButtons(c *ui.Context, d *store.DecisionState, st decisionStyle) {
	t := a.T
	k := d.Key
	ui.Column(c.Key("key:" + d.DecisionID)).Gap(t.S2).Padding(t.S3).Radius(t.RadiusSM).Background(t.SurfaceSunken).Children(func() {
		fact := func(label, v string, mono bool) {
			ui.Row(c).Gap(t.S3).Children(func() {
				ui.Text(c, a.L.T(label)).FontSize(t.SM).TextColor(t.InkMuted).Width(72)
				tx := ui.Text(c, v).FontSize(t.SM).FontWeight(700).Grow(1).MinWidth(0)
				if mono {
					tx.Font(t.Mono)
				}
			})
		}
		fact("key.what", k.Name, false)
		fact("key.env", k.Env, true)
		if k.Why != "" {
			fact("key.why", k.Why, false)
		}
	})
	if d.Resolved != nil || d.Pending != "" {
		msg := a.L.T("key.resolved.hold")
		if (d.Resolved != nil && d.Resolved.Option == "go") || d.Pending == "go" {
			msg = a.L.T("key.resolved", a.keyTask(d))
		}
		ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(func() {
			a.glyph(c, 16, drawCheck(t.InkMuted))
			ui.Text(c, msg).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft)
		})
		return
	}
	if a.af.keyVal == nil {
		a.af.keyVal, a.af.keyOnce = map[string]string{}, map[string]bool{}
	}
	v := a.af.keyVal[d.DecisionID]
	a.afInput(c, "key:"+d.DecisionID, a.L.T("key.field"), &v, "", true)
	a.af.keyVal[d.DecisionID] = v
	if k.Saved {
		ui.Text(c, a.L.T("key.replaces")).FontSize(t.XS).TextColor(t.InkMuted)
	}
	once := a.af.keyOnce[d.DecisionID]
	sel := 0
	if once {
		sel = 1
	}
	if hit := a.choices(c, "key-once:"+d.DecisionID, a.L.T("key.title", a.keyTask(d)), []string{a.L.T("key.remember"), a.L.T("key.once")}, sel); hit >= 0 {
		a.af.keyOnce[d.DecisionID] = hit == 1
		once = hit == 1
	}
	ui.Text(c, a.L.T("key.note")).FontSize(t.XS).TextColor(t.InkMuted).LineHeight(a.leading(1.5))
	goLabel := a.L.T("key.go")
	if once {
		goLabel = a.L.T("key.go.once")
	}
	ui.Row(c.Key("key-go:" + d.DecisionID)).Gap(t.S3).Wrap().AlignItems(ui.Center).Children(func() {
		if a.buttonFor(c, a.L.T("key.hold"), k.Name, btnSecondary, st.height, st.quietBg) {
			a.Decide(d.DecisionID, "hold", "")
			delete(a.af.keyVal, d.DecisionID)
		}
		if a.buttonFor(c, goLabel, k.Name, btnPrimary, st.height, st.quietBg) && strings.TrimSpace(v) != "" {
			if dd := a.S.Decisions[d.DecisionID]; dd != nil {
				dd.Pending, dd.AnsweredAt = "go", a.Now()
			}
			a.markRead()
			a.send(protocol.DecideKey{T: "decide", DecisionID: d.DecisionID, Option: "go", Key: v, Once: once})
			delete(a.af.keyVal, d.DecisionID)
			delete(a.af.keyOnce, d.DecisionID)
		}
	})
}
