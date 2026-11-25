package views

import (
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/egoist/mygo/ui"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D566: 存到 Nowledge Mem / Save to Nowledge Mem, under a file card and in
// the viewer's action row (the web's mem-keep.tsx). One quiet line under the
// card, never inside it (the whole card opens the file):
//   can save   Save to Nowledge Mem (a quiet button)
//   saving     the shared spinner and Saving to Nowledge Mem…
//   saved      已存进 Nowledge Mem / In Nowledge Mem, then 去看 / Open: Mem's
//              own nowledgemem:// link where the Nowledge Mem app is on this
//              Mac, else Mem on the web; two elements, never joined (D291)
//   failed     Not saved: {Mem's reason}, and the one thing that fixes it
// Shown only for a file Mem reads while Mem is connected and signed in; a
// file already kept says so whatever Mem's state is now.

// memKeepNow is what one file's save is doing on this Mac; shared (D575):
// Mem's only write target is a Space others read, so the person is asked.
type memKeepNow struct {
	saving   bool
	why, msg string
	shared   *protocol.MemFileShared
}

var memKeepSeq int

// memKeepWait: a home that never answers (gone away mid-upload) is said, never a spinner forever.
const memKeepWait = 3 * time.Minute

// memAppHere: the Nowledge Mem app is on this Mac, so Mem's own links open in it.
var memAppHere = func() bool {
	home, _ := os.UserHomeDir()
	for _, p := range []string{"/Applications/Nowledge Mem.app", filepath.Join(home, "Applications", "Nowledge Mem.app")} {
		if st, err := os.Stat(p); err == nil && st.IsDir() {
			return true
		}
	}
	return false
}

// memKeepReady: memory on, Nowledge Mem connected, and its doctor finding
// nothing the person must fix first.
func (a *App) memKeepReady() bool {
	st, m := a.S.Settings, a.S.Mem
	if st == nil || !st.Memory || m == nil || m.State != "connected" {
		return false
	}
	if m.Health != nil {
		switch m.Health.Issue {
		case "signed_out", "unreachable", "old":
			return false
		}
	}
	return true
}

// memKeepLook is what the card or the viewer shows for a file ("" for nothing).
func (a *App) memKeepLook(ref protocol.MediaRef) string {
	if m := a.S.Mem; m != nil {
		if _, ok := m.Files[ref.ID]; ok {
			return "saved"
		}
	}
	if n := a.memKeep[ref.ID]; n != nil {
		if n.saving {
			return "saving"
		}
		return "failed"
	}
	if protocol.MemKeeps(ref) && a.memKeepReady() {
		return "save"
	}
	return ""
}

// keepInMem asks the home to keep the file in the person's Mem.
func (a *App) keepInMem(ref protocol.MediaRef) { a.keepInMemAt(ref, "") }

// keepInMemAt carries the person's answer to shared_space (D575): "personal"
// (their own Space, the default) or "shared" (the one Mem named); "" for none.
func (a *App) keepInMemAt(ref protocol.MediaRef, space string) {
	if a.memKeep == nil {
		a.memKeep = map[string]*memKeepNow{}
	}
	if n := a.memKeep[ref.ID]; n != nil && n.saving {
		return
	}
	n := &memKeepNow{saving: true}
	a.memKeep[ref.ID] = n
	memKeepSeq++
	a.send(protocol.MemFileSaveReq{T: "mem_file_save", ID: "mk" + strconv.Itoa(memKeepSeq), Media: ref.ID, Space: space})
	if a.Win == nil {
		return // tests answer by hand
	}
	a.later(func() { time.Sleep(memKeepWait) }, func() {
		if a.memKeep[ref.ID] == n && n.saving {
			n.saving, n.why = false, "unreachable"
		}
	})
}

// memFileFrame is the home's answer: kept (the settings frame's mem.files
// carries it from now on), or why not.
func (a *App) memFileFrame(f protocol.ServerFrame) {
	m := f.MemFile
	if m == nil {
		return
	}
	if a.memKeep == nil {
		a.memKeep = map[string]*memKeepNow{}
	}
	if m.OK {
		delete(a.memKeep, m.Media)
		if m.Saved != nil && a.S.Mem != nil { // shown at once, before the settings frame
			if a.S.Mem.Files == nil {
				a.S.Mem.Files = map[string]protocol.MemFileSaved{}
			}
			a.S.Mem.Files[m.Media] = *m.Saved
		}
		return
	}
	why := m.Why
	if why == "" {
		why = "refused"
	}
	a.memKeep[m.Media] = &memKeepNow{why: why, msg: m.Message, shared: m.Shared}
}

// keepWhy is why it wasn't kept in the person's words (D563: from Mem's
// facts; D572: never Mem's raw sentence, which waits behind 原话).
func (a *App) keepWhy(why string) string {
	return a.L.T("memfile.why." + why)
}

// memKeepLine is the quiet line under a file card (and the viewer's word once
// kept): on the card's own left edge, its width at most.
func (a *App) memKeepLine(c *ui.Context, ref protocol.MediaRef, look string) {
	t := a.T
	name := firstNonEmpty(ref.Name, a.L.T("media.file"))
	if look == "failed" {
		ui.Column(c.Key("mk:" + ref.ID)).MaxWidth(cardWidth).Shrink(1).Children(func() { a.memKeepTrouble(c, ref) })
		return
	}
	ui.Row(c.Key("mk:" + ref.ID)).MaxWidth(cardWidth).Shrink(1).Gap(t.S2).Wrap().AlignItems(ui.Center).MinHeight(28).Children(func() {
		a.memKeepWords(c, ref, look, name)
	})
}

// memKeepWords is what the line says for can save, saving and kept.
func (a *App) memKeepWords(c *ui.Context, ref protocol.MediaRef, look, name string) {
	t := a.T
	switch look {
	case "save":
		if a.quietButton(c, "mk:"+ref.ID, a.L.T("memfile.save"), name, false, 0) {
			a.keepInMem(ref)
		}
	case "saving":
		ui.Box(c).Size(12, 12).Shrink(0).Center().AccessHidden(true).Children(func() { ui.Spinner(c).Size(11, 11) })
		uiText(c, a.L.T("memfile.saving")).FontSize(t.SM).TextColor(t.InkMuted).SingleLine()
	case "saved":
		uiText(c, a.L.T("memfile.saved")).FontSize(t.SM).FontWeight(700).TextColor(t.Done.Ink).SingleLine()
		saved := a.S.Mem.Files[ref.ID]
		to := saved.Web
		if memAppHere() && saved.URI != "" {
			to = saved.URI
		}
		if to != "" && a.quietLink(c, "mk-open:"+ref.ID, a.L.T("memfile.open"), spoken(a.L, a.L.T("memfile.open"), a.L.T("memfile.saved"))) {
			a.openLink(to)
		}
	}
}

// memKeepTrouble (D572) is why a file wasn't kept, as one line: the human
// words in the needs-you ink (never the failed red), the one fix as a quiet
// button, and Mem's own sentence only behind 原话 / Its words.
func (a *App) memKeepTrouble(c *ui.Context, ref protocol.MediaRef) {
	t := a.T
	n := a.memKeep[ref.ID]
	if n == nil || n.saving {
		return
	}
	name := firstNonEmpty(ref.Name, a.L.T("media.file"))
	if n.why == "shared_space" && n.shared != nil {
		a.memKeepAsk(c, ref, name, n.shared)
		return
	}
	rawKey := "mkraw:" + ref.ID
	ui.Row(c.Key("mk-line:" + ref.ID)).Gap(t.S1).Wrap().AlignItems(ui.Center).MinHeight(28).Children(func() {
		uiText(c, a.L.T("memfile.failed", a.keepWhy(n.why))).FontSize(t.SM).FontWeight(600).TextColor(t.NeedsYou.Ink).
			MinWidth(0).Shrink(1).LineHeight(a.leading(1.4)).Role(ui.RoleStatus).Margin(0, t.S1, 0, 0)
		switch n.why {
		case "signed_out", "missing", "off":
			label := a.L.T("memfile.settings")
			if n.why == "signed_out" {
				label = a.L.T("memfile.signin")
			}
			if a.quietButton(c, "mk-fix:"+ref.ID, label, "Nowledge Mem", true, 1) {
				a.fileView = nil
				a.openTab(TabMemory)
			}
		case "unreachable", "refused", "no_space":
			if a.quietButton(c, "mk-retry:"+ref.ID, a.L.T("memfile.retry"), name, true, 0) {
				a.keepInMem(ref)
			}
		}
		if n.msg != "" {
			chev := 1
			if a.open[rawKey] {
				chev = 2
			}
			if a.quietButton(c, "mk-raw:"+ref.ID, a.L.T("memfile.raw"), "Nowledge Mem", false, chev) {
				if a.open == nil {
					a.open = map[string]bool{}
				}
				a.open[rawKey] = !a.open[rawKey]
			}
		}
	})
	if n.msg != "" && a.open[rawKey] {
		uiText(c.Key("mk-rawtext:"+ref.ID), n.msg).FontSize(t.XS).TextColor(t.InkMuted).Selectable().LineHeight(a.leading(1.5)).MinWidth(0).Margin(0, 0, t.S1, 0)
	}
}

// sharedWords (D575) is where Mem would put the file and who reads it.
func (a *App) sharedWords(s *protocol.MemFileShared) string {
	key := "memfile.shared"
	if !s.Personal {
		key += ".only"
	}
	if s.Readers <= 0 {
		return a.L.T(key+".some", s.Label)
	}
	return a.L.T(key, s.Label, strconv.Itoa(s.Readers))
}

// memKeepAsk (D575) is the question asked once when Mem's only write target
// is a Space others read: nothing is written until the person chooses. One
// line in the needs-you ink, then 只给我看 / Only me (the default, first, when
// they have a personal Space) and 放进「{Space}」/ Put it in “{Space}”.
func (a *App) memKeepAsk(c *ui.Context, ref protocol.MediaRef, name string, s *protocol.MemFileShared) {
	t := a.T
	ui.Row(c.Key("mk-line:" + ref.ID)).Gap(t.S1).Wrap().AlignItems(ui.Center).MinHeight(28).Children(func() {
		uiText(c, a.sharedWords(s)).FontSize(t.SM).FontWeight(600).TextColor(t.NeedsYou.Ink).
			MinWidth(0).Shrink(1).LineHeight(a.leading(1.4)).Role(ui.RoleStatus).Margin(0, t.S1, 0, 0)
		if s.Personal && a.quietButton(c, "mk-mine:"+ref.ID, a.L.T("memfile.pick.personal"), name, true, 0) {
			a.keepInMemAt(ref, "personal")
		}
		if a.quietButton(c, "mk-shared:"+ref.ID, a.L.T("memfile.pick.shared", s.Label), name, false, 0) {
			a.keepInMemAt(ref, "shared")
		}
	})
}

// memKeepCard is the line under a card Ducter made (nothing for the person's own files).
func (a *App) memKeepCard(c *ui.Context, ref protocol.MediaRef) {
	if look := a.memKeepLook(ref); look != "" {
		a.memKeepLine(c, ref, look)
	}
}

// memKeepBar is the viewer's slot, last in its foot bar (D572): a text button
// while it can save and after a failure (so the row never re-lays out), busy
// while saving, the quiet word once kept. A failure is its own line above the
// bar (memKeepFailing). Only what a task made (the person's own files open
// there too).
func (a *App) memKeepBar(c *ui.Context, ref protocol.MediaRef) {
	if ref.From == nil {
		return
	}
	switch look := a.memKeepLook(ref); look {
	case "":
	case "save", "failed":
		if a.buttonFor(c, a.L.T("memfile.save"), firstNonEmpty(ref.Name, a.L.T("media.file")), btnText, a.T.ControlSM, a.T.Surface) {
			a.keepInMem(ref)
		}
	default: // saving: the shared spinner and its words; kept: the quiet word and Open, on the bar's line
		ui.Row(c.Key("mk-bar:" + ref.ID)).Height(a.controlHeight(a.T.ControlSM)).Gap(a.T.S2).AlignItems(ui.Center).Shrink(0).Children(func() {
			a.memKeepWords(c, ref, look, firstNonEmpty(ref.Name, a.L.T("media.file")))
		})
	}
}

// memKeepFailing says whether the viewer shows a failure line above its bar.
func (a *App) memKeepFailing(ref protocol.MediaRef) bool {
	return ref.From != nil && a.memKeepLook(ref) == "failed"
}
