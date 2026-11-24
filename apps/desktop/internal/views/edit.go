package views

import (
	"fmt"
	"strings"

	"github.com/egoist/mygo/ui"
)

// D533: a rule changed in place. Three pieces of the shared set (design/ui.md
// "Shared controls"): editRow, a rule's row that opens its editor in place;
// lineField, one line of words; numberField, digits with their unit after
// them. The web client's are EditRow, LineField and NumberField
// (apps/web/src/controls.tsx).

// editRowOpts is one rule row: its label, what it says now, and, when the
// person may change it, the editor that opens under the label.
type editRowOpts struct {
	key    string
	label  string
	values []string
	muted  string
	// can: a 改 / Change at the right of the label line; open: the editor
	// stands under the label with 保存 and 取消.
	can, open bool
	saving    bool
	// err is said under the editor in the failed ink (a range, a refusal).
	err                      string
	about                    string
	last                     bool
	editor                   func()
	onOpen, onSave, onCancel func()
}

// editRow is a rule's row: XS 700 muted label at the text edge, a quiet
// 改 / Change at its right when it can change, its value lines in SM ink and
// a muted line under them. Open, the control takes the values' place, then
// 保存 (primary) and 取消 (text); while it is being saved 正在改… says so.
func (a *App) editRow(c *ui.Context, o editRowOpts) {
	t := a.T
	row := ui.Column(c.Key("er:"+o.key)).Gap(2).Padding(12, 0)
	if !o.last {
		row.BorderWidth(0, 0, 1, 0).BorderColor(t.LineSoft)
	}
	row.Children(func() {
		ui.Row(c.Key("hd")).AlignItems(ui.Center).Gap(t.S2).MinHeight(28).Children(func() {
			uiText(c.Key("k"), o.label).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted).Grow(1).Shrink(1).MinWidth(0)
			if o.can && !o.open && a.quietButton(c, "edit:"+o.key, a.L.T("keep.edit"), a.L.T("keep.edit.about", o.about), false, 0) && o.onOpen != nil {
				o.onOpen()
			}
		})
		if !o.open {
			for j, v := range o.values {
				uiText(c.Key(fmt.Sprint("v", j)), keepWords(autospace(v))).FontSize(t.SM).TextColor(t.Ink).LineHeight(a.leading(1.5))
			}
			if o.muted != "" {
				uiText(c.Key("m"), o.muted).FontSize(t.SM).TextColor(t.InkMuted)
			}
			return
		}
		ui.Column(c.Key("ed")).Gap(t.S2).Margin(4, 0, 0, 0).Children(func() {
			if o.editor != nil {
				o.editor()
			}
			if o.err != "" {
				uiText(c.Key("err"), o.err).FontSize(t.SM).TextColor(t.Failed.Ink).LineHeight(a.leading(1.45)).Role(ui.RoleStatus)
			}
			ui.Row(c.Key("acts")).Gap(t.S1).AlignItems(ui.Center).Margin(2, 0, 0, 0).Children(func() {
				if o.saving {
					uiText(c.Key("saving"), a.L.T("keep.edit.saving")).FontSize(t.SM).TextColor(t.InkMuted).Role(ui.RoleStatus)
					return
				}
				if a.buttonFor(c, a.L.T("keep.edit.save"), o.about, btnPrimary, t.ControlSM, t.Surface) && o.onSave != nil {
					o.onSave()
				}
				ui.Box(c).Width(t.S1).Shrink(0)
				if a.buttonFor(c, a.L.T("keep.edit.cancel"), o.about, btnText, t.ControlSM, t.Surface) && o.onCancel != nil {
					o.onCancel()
				}
			})
		})
	})
}

// fieldKeys is Enter and Esc on a field: Enter keeps it, Esc puts it back.
func fieldKeys(onEnter, onEsc func()) func(k ui.TextKey) bool {
	return func(k ui.TextKey) bool {
		switch {
		case k.Key == ui.KeyEnter && k.Mods == 0:
			if onEnter != nil {
				onEnter()
			}
			return true
		case k.Key == ui.KeyEscape:
			if onEsc != nil {
				onEsc()
			}
			return true
		}
		return false
	}
}

// numberField is digits in D536's one-line field, 88 wide, with their unit after them
// (45 分钟一轮). It keeps only the digits typed; the caller checks the range
// and says it under the row.
func (a *App) numberField(c *ui.Context, key, label string, value *string, unit string, onEnter, onEsc func()) {
	t := a.T
	if d := digitsOnly(*value); d != *value {
		*value = d
	}
	ui.Row(c.Key("nf:" + key)).Gap(t.S2).AlignItems(ui.Center).Children(func() {
		// D536's one-line field, 88 wide for a number.
		a.lineField(c, "nf-in:"+key, spoken(a.L, label, unit), value, "", false, nil).Width(88).Shrink(0).AutoFocus().
			OnTextKey(fieldKeys(onEnter, onEsc))
		uiText(c.Key("unit"), unit).FontSize(t.SM).TextColor(t.InkSoft).Shrink(1).MinWidth(0)
	})
}

func digitsOnly(s string) string {
	var b strings.Builder
	for _, r := range s {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	return b.String()
}
