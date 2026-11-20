package views

// D415: 分类 / Subjects of the person's own. The pile's chips show theirs
// first (on any pile), with + 新的分类 / + New subject at the end: the hand
// sheet in a make mode (its name over the words; the foot's primary is
// 放进「X」). A sheet opened from a chip carries a quiet bar: 改名 / Rename
// (or merge into another), 去掉这个分类 / Remove this subject, and 移出 /
// Take out on each row. Any sheet with ticks can 归到分类… / Put in a
// subject…. Core keeps them over every sort (packages/core/src/task-sources/pile.ts).

import (
	"fmt"
	"strings"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// openHandMake is + 新的分类: the sheet with a name field over the words.
func (a *App) openHandMake() {
	h := a.newHand()
	h.making, h.got, h.fromDo = true, true, true
	h.focusName, h.focusFind = true, false
	if pv := a.pileView(); pv != nil {
		h.doCount = pv.Groups["do"]
	}
	a.send(protocol.PileFindReq{T: "pile_find", ClientID: h.cid})
}

// handSubject sends one change to the person's subjects; its answer comes
// back by subjCid (takeSubject).
func (a *App) handSubject(op, name, to string, refs []string) {
	h := &a.ho
	name = strings.TrimSpace(name)
	if name == "" || h.subjSending {
		return
	}
	a.nextClient++
	h.subjCid = fmt.Sprintf("subj%d", a.nextClient)
	h.subjOp, h.subjSending, h.said = op, true, ""
	if op == "take" && len(refs) == 1 {
		h.subjTaken = refs[0]
	}
	a.send(protocol.PileSubjectReq{T: "pile_subject", Op: op, Name: name, To: strings.TrimSpace(to), Refs: refs, ClientID: h.subjCid})
}

// openSubjectSet turns the open sheet into that subject's set (after a put
// or a rename), so it can be handed over at once.
func (a *App) openSubjectSet(name string) {
	h := &a.ho
	a.nextClient++
	h.cid = fmt.Sprintf("hand%d", a.nextClient)
	h.making, h.filing, h.renaming = false, false, false
	h.subject, h.bySubject, h.fromChip, h.finding, h.got = name, true, true, true, false
	h.query, h.sentQuery, h.setID = name, name, ""
	h.items, h.found, h.heard = nil, nil, nil
	a.send(protocol.PileFindReq{T: "pile_find", Subject: name, ClientID: h.cid})
}

// takeSubject reads the answer to the last subject change.
func (a *App) takeSubject() {
	h := &a.ho
	if h.subjCid == "" {
		return
	}
	r := a.S.SourceItems[h.subjCid]
	if r == nil {
		return
	}
	delete(a.S.SourceItems, h.subjCid)
	h.subjCid, h.subjSending = "", false
	if !r.OK {
		h.said = firstNonEmpty(r.Error, a.L.T("newtask.err.failed"))
		return
	}
	name := firstNonEmpty(r.Name, h.subject, h.makeName)
	switch h.subjOp {
	case "put":
		a.toast(a.L.T("hand.subject.put", name, r.Done))
		a.openSubjectSet(name)
	case "rename":
		a.toast(a.L.T("hand.subject.renamed", name))
		a.openSubjectSet(name)
	case "remove":
		a.toast(a.L.T("hand.subject.removed", h.subject))
		h.open = false
	case "take":
		title := h.subjTaken
		var keep []protocol.FoundItem
		for _, it := range h.items {
			if it.Item.Ref == h.subjTaken {
				title = it.Item.Title
				continue
			}
			keep = append(keep, it)
		}
		h.items = keep
		delete(h.ticked, h.subjTaken)
		h.subjTaken = ""
		a.toast(a.L.T("hand.subject.taken", title))
	}
}

// subjectNames are the pile's subjects (theirs first), less one.
func (a *App) subjectNames(except string) []string {
	pv := a.pileView()
	if pv == nil {
		return nil
	}
	var out []string
	for _, s := range pv.Subjects {
		if s.Name != except {
			out = append(out, s.Name)
		}
	}
	return out
}

// handMakeName is the make mode's name field, over the words.
func (a *App) handMakeName(c *ui.Context) {
	t := a.T
	h := &a.ho
	ui.Column(c.Key("make")).Gap(t.S1).Padding(t.S1, t.S1, t.S2, t.S1).Children(func() {
		uiText(c.Key("l"), a.L.T("hand.subject.name")).FontSize(t.SM).FontWeight(700).TextColor(t.InkMuted)
		f := ui.Row(c.Key("f")).AlignItems(ui.Center).MinHeight(48).Padding(0, t.S4).Radius(t.RadiusLG).Background(t.Surface).Border(2, t.Line2)
		f.Children(func() {
			in := ui.TextInput(c.Key("in"), &h.makeName).Placeholder(a.L.T("hand.subject.name.ph")).Label(a.L.T("hand.subject.name")).FontSize(t.LG).FontWeight(700).Grow(1).MinWidth(0).
				Background(ui.Transparent).Border(0, ui.Transparent)
			if in.Focused() {
				f.Border(2, t.Accent)
			}
			if h.focusName {
				in.Focus()
				h.focusName = false
			}
		})
	})
}

// handSubjectBar is the quiet bar of a sheet opened from a chip: rename (or
// merge), remove.
func (a *App) handSubjectBar(c *ui.Context) {
	t := a.T
	h := &a.ho
	if h.renaming {
		ui.Column(c.Key("subj-rename")).Gap(t.S2).Padding(t.S2, t.S1, 0, t.S1).Children(func() {
			ui.Row(c.Key("r")).Gap(t.S2).AlignItems(ui.Center).Children(func() {
				in := ui.TextInput(c.Key("in"), &h.renameTo).Placeholder(a.L.T("hand.subject.rename.ph")).Label(a.L.T("hand.subject.rename")).Grow(1).MinWidth(0).
					Background(t.Surface).Border(2, t.Line2).Radius(12).Padding(t.S2, t.S3)
				if h.focusRename {
					in.Focus()
					h.focusRename = false
				}
				if a.button(c, a.L.T("hand.subject.rename.go"), btnPrimary, t.ControlMD, t.Bg) {
					a.handSubject("rename", h.subject, h.renameTo, nil)
				}
				if a.quietButton(c, "rn-x", a.L.T("hand.subject.cancel"), "", false, 0) {
					h.renaming = false
				}
			})
			if others := a.subjectNames(h.subject); len(others) > 0 {
				ui.Row(c.Key("m")).Wrap().Gap(t.S2).AlignItems(ui.Center).Children(func() {
					uiText(c.Key("l"), a.L.T("hand.subject.merge.l")).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted)
					for _, n := range others {
						n := n
						if a.subjectChip(c, "mg:"+n, a.L.T("hand.subject.merge", n), false) {
							a.handSubject("rename", h.subject, n, nil)
						}
					}
				})
			}
		})
		return
	}
	ui.Row(c.Key("subj-bar")).Gap(t.S4).AlignItems(ui.Center).Padding(t.S1, t.S1, 0, t.S1).Children(func() {
		if a.quietButton(c, "subj-rename", a.L.T("hand.subject.rename"), h.subject, false, 0) {
			h.renaming, h.renameTo, h.focusRename = true, h.subject, true
		}
		if a.quietButton(c, "subj-remove", a.L.T("hand.subject.remove"), h.subject, false, 0) {
			a.handSubject("remove", h.subject, "", nil)
		}
	})
}

// handFiling is 归到分类…'s inline field over the foot, with the subjects
// there are as chips.
func (a *App) handFiling(c *ui.Context) {
	t := a.T
	h := &a.ho
	refs := h.handTicked()
	ui.Column(c.Key("filing")).Gap(t.S2).Padding(t.S3, t.S6, 0, t.S6).Children(func() {
		ui.Row(c.Key("r")).Gap(t.S2).AlignItems(ui.Center).Children(func() {
			in := ui.TextInput(c.Key("in"), &h.fileName).Placeholder(a.L.T("hand.subject.file.ph")).Label(a.L.T("hand.subject.file")).Grow(1).MinWidth(0).
				Background(t.Surface).Border(2, t.Line2).Radius(12).Padding(t.S2, t.S3)
			if h.focusFile {
				in.Focus()
				h.focusFile = false
			}
			if a.button(c, a.L.T("hand.subject.file.go"), btnPrimary, t.ControlMD, t.Bg) {
				a.handSubject("put", h.fileName, "", refs)
			}
			if a.quietButton(c, "file-x", a.L.T("hand.subject.cancel"), "", false, 0) {
				h.filing = false
			}
		})
		if names := a.subjectNames(""); len(names) > 0 {
			ui.Row(c.Key("chips")).Wrap().Gap(t.S2).Children(func() {
				for _, n := range names {
					n := n
					if a.subjectChip(c, "fl:"+n, n, false) {
						h.fileName = n
						a.handSubject("put", n, "", refs)
					}
				}
			})
		}
	})
}

// subjectChip is one small chip that says a subject (own: the person's).
func (a *App) subjectChip(c *ui.Context, key, label string, own bool) bool {
	t := a.T
	chip := ui.Row(c.Key(key)).Height(30).Padding(0, t.S3).Gap(t.S2).Radius(15).AlignItems(ui.Center).Background(t.SurfaceSunken).
		Cursor(ui.CursorPointer).Role(ui.RoleButton).Focusable().Label(label)
	if own {
		chip.Background(t.Surface).Border(1.5, t.Accent)
	}
	if chip.Hovered() {
		chip.Background(t.Surface).Shadow(0, 2, 0, 0, t.Line2)
	}
	chip.Children(func() {
		uiText(c, label).FontSize(t.SM).FontWeight(700).TextColor(t.Ink).AccessHidden(true)
	})
	return chip.Clicked()
}
