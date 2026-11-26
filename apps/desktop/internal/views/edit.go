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
	// can: the whole row opens its editor (D592); open: the editor stands
	// under the label with 保存 and 取消.
	can, open bool
	saving    bool
	// err is said under the editor in the failed ink (a range, a refusal).
	err                      string
	about                    string
	last                     bool
	editor                   func()
	onOpen, onSave, onCancel func()
}

// editRow is a rule's row: XS 700 muted label at the text edge, its value
// lines in SM ink and a muted line under them. D592: when it can change, the
// whole row is the button (as iOS Settings, never a lone 改): the one row
// hover (D529) and the drawn chevron (D213) at the label line's right, Faint
// at rest and muted under the pointer; a screen reader hears 修改「…」 and
// the value. Open, the control takes the values' place, then 保存 (primary)
// and 取消 (text); while it is being saved 正在保存… says so.
func (a *App) editRow(c *ui.Context, o editRowOpts) {
	t := a.T
	row := ui.Column(c.Key("er:"+o.key)).Gap(2).Padding(12, 0)
	if !o.last {
		row.BorderWidth(0, 0, 1, 0).BorderColor(t.LineSoft)
	}
	head := func(chev bool, ink ui.Color) {
		ui.Row(c.Key("hd")).AlignItems(ui.Center).Gap(t.S2).MinHeight(20).Children(func() {
			uiText(c.Key("k"), o.label).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted).Grow(1).Shrink(1).MinWidth(0)
			if chev {
				a.glyph(c, 12, drawChevron(ink, false))
			}
		})
	}
	values := func() {
		for j, v := range o.values {
			uiText(c.Key(fmt.Sprint("v", j)), keepWords(autospace(v))).FontSize(t.SM).TextColor(t.Ink).LineHeight(a.leading(1.5))
		}
		if o.muted != "" {
			uiText(c.Key("m"), o.muted).FontSize(t.SM).TextColor(t.InkMuted)
		}
	}
	row.Children(func() {
		if !o.open && !o.can {
			head(false, t.Faint)
			values()
			return
		}
		if !o.open {
			// D592: the whole row is the button; its fill pads into its own negative margin (D529).
			b := ui.Column(c.Key("erb:"+o.key)).Gap(2).Padding(12, 10).Margin(-12, -10).Radius(t.RadiusSM).Cursor(ui.CursorPointer).
				Role(ui.RoleButton).Label(spoken(a.L, a.L.T("keep.edit.about", o.about), strings.Join(o.values, " "), o.muted)).Focusable()
			ink := t.Faint
			if a.rowHover(c, b, groundNeutral(), false) {
				ink = t.InkMuted
			}
			b.Children(func() {
				ui.Column(c.Key("bd")).Gap(2).AccessHidden(true).Children(func() {
					head(true, ink)
					values()
				})
			})
			if b.Clicked() && o.onOpen != nil {
				o.onOpen()
			}
			return
		}
		head(false, t.Faint)
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

// openWell makes a sunken well the button that opens its editor (D592: a
// Keep's 你的原话, as editRow makes a rule's row): the pointer, its name for
// a reader, the keys, the one row hover deepening within the well. It
// returns the chevron's ink (Faint at rest, muted when revealed) and a click.
func (a *App) openWell(c *ui.Context, well ui.Element, label string) (ui.Color, bool) {
	well.Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(label).Focusable()
	ink := a.T.Faint
	if a.rowHover(c, well, groundWell(), false) {
		ink = a.T.InkMuted
	}
	return ink, well.Clicked()
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
