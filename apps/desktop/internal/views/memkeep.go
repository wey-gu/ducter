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
//   saved      In Nowledge Mem, and Open in Nowledge Mem where the Nowledge
//              Mem app is on this Mac (Mem's own nowledgemem:// link), else
//              Open Nowledge Mem where Mem is the person's Cloud
//   failed     Not saved: {Mem's reason}, and the one thing that fixes it
// Shown only for a file Mem reads while Mem is connected and signed in; a
// file already kept says so whatever Mem's state is now.

// memKeepNow is what one file's save is doing on this Mac.
type memKeepNow struct {
	saving   bool
	why, msg string
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
func (a *App) keepInMem(ref protocol.MediaRef) {
	if a.memKeep == nil {
		a.memKeep = map[string]*memKeepNow{}
	}
	if n := a.memKeep[ref.ID]; n != nil && n.saving {
		return
	}
	n := &memKeepNow{saving: true}
	a.memKeep[ref.ID] = n
	memKeepSeq++
	a.send(protocol.MemFileSaveReq{T: "mem_file_save", ID: "mk" + strconv.Itoa(memKeepSeq), Media: ref.ID})
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
	a.memKeep[m.Media] = &memKeepNow{why: why, msg: m.Message}
}

// keepWhy is Mem's reason in the person's words (D563: from Mem's facts).
func (a *App) keepWhy(why, msg string) string {
	if why == "refused" {
		if msg != "" {
			return a.L.T("memfile.why.refused", msg)
		}
		return a.L.T("memfile.why.refused.none")
	}
	return a.L.T("memfile.why." + why)
}

// memKeepLine is the quiet line under a file card (and the viewer's word once
// kept or failed): on the card's own left edge, its width at most.
func (a *App) memKeepLine(c *ui.Context, ref protocol.MediaRef, look string) {
	t := a.T
	name := firstNonEmpty(ref.Name, a.L.T("media.file"))
	ui.Row(c.Key("mk:" + ref.ID)).MaxWidth(cardWidth).Shrink(1).Gap(t.S2).Wrap().AlignItems(ui.Center).MinHeight(28).Children(func() {
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
			if memAppHere() && saved.URI != "" {
				if a.quietLink(c, "mk-open:"+ref.ID, a.L.T("memfile.open"), a.L.T("memfile.open")) {
					a.openLink(saved.URI)
				}
			} else if saved.Web != "" {
				if a.quietLink(c, "mk-open:"+ref.ID, a.L.T("memfile.openWeb"), a.L.T("memfile.openWeb")) {
					a.openLink(saved.Web)
				}
			}
		case "failed":
			n := a.memKeep[ref.ID]
			uiText(c, a.L.T("memfile.failed", a.keepWhy(n.why, n.msg))).FontSize(t.SM).TextColor(t.Failed.Ink).MinWidth(0).Shrink(1).LineHeight(a.leading(1.4))
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
			case "unreachable", "refused":
				if a.quietButton(c, "mk-retry:"+ref.ID, a.L.T("memfile.retry"), name, true, 0) {
					a.keepInMem(ref)
				}
			}
		}
	})
}

// memKeepCard is the line under a card Ducter made (nothing for the person's own files).
func (a *App) memKeepCard(c *ui.Context, ref protocol.MediaRef) {
	if look := a.memKeepLook(ref); look != "" {
		a.memKeepLine(c, ref, look)
	}
}

// memKeepBar is the viewer's action, in its existing row: a text button while
// it can save, the line's own words once saving, kept or failed. Only what a
// task made (the person's own files open there too).
func (a *App) memKeepBar(c *ui.Context, ref protocol.MediaRef) {
	if ref.From == nil {
		return
	}
	switch look := a.memKeepLook(ref); look {
	case "":
	case "save":
		if a.buttonFor(c, a.L.T("memfile.save"), firstNonEmpty(ref.Name, a.L.T("media.file")), btnText, a.T.ControlSM, a.T.Surface) {
			a.keepInMem(ref)
		}
	default:
		a.memKeepLine(c, ref, look)
	}
}
