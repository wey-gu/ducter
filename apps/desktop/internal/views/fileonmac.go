package views

// D578: a file card and the file viewer behave as a file does on a Mac.
// When the file is on this Mac (a copy the person saved with Save a copy,
// or the very file they sent from here), the card's right-click menu and
// the viewer's bar offer 在访达中显示 / Show in Finder. And a card, or
// the viewer's file mark (as a window's proxy icon), drags the file out to
// Finder or another app: MyGo's native drag takes file paths only (no file
// promise), so the bytes are fetched into this user's own temporary folder
// as the pointer comes over the card, and the drag offers that copy.

import (
	"context"
	"os"
	"path/filepath"
	"time"

	"github.com/egoist/mygo/transfer"
	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// fileCopy is a file's copy in this Mac's temporary folder, for a drag.
type fileCopy struct {
	path    string
	loading bool
}

// onMacSeen is a file's place on this Mac as last checked (a card asks
// every frame; the disk is asked at most once a second).
type onMacSeen struct {
	path string
	at   time.Time
}

// noteOnMac remembers where a file is on this Mac (kept across launches).
func (a *App) noteOnMac(id, path string) {
	if id == "" || path == "" || !filepath.IsAbs(path) {
		return
	}
	m := a.med()
	if a.Local != nil {
		a.Local.SetFileOnMac(id, path)
	} else {
		if m.onMac == nil {
			m.onMac = map[string]string{}
		}
		m.onMac[id] = path
	}
	delete(m.onMacSeen, id)
}

// fileOnMac is where the file is on this Mac, when Ducter knows a place for
// it and a file of its size is still there; else "".
func (a *App) fileOnMac(ref protocol.MediaRef) string {
	m := a.med()
	if s, ok := m.onMacSeen[ref.ID]; ok && time.Since(s.at) < time.Second {
		return s.path
	}
	p := m.onMac[ref.ID]
	if a.Local != nil {
		p = a.Local.FileOnMac(ref.ID)
	}
	if p != "" {
		if st, err := os.Stat(p); err != nil || st.IsDir() || (ref.Bytes > 0 && st.Size() != ref.Bytes) {
			p = ""
		}
	}
	if m.onMacSeen == nil {
		m.onMacSeen = map[string]onMacSeen{}
	}
	m.onMacSeen[ref.ID] = onMacSeen{p, time.Now()}
	return p
}

// revealFile is Show in Finder.
func (a *App) revealFile(ref protocol.MediaRef) {
	if p := a.fileOnMac(ref); p != "" && a.Media != nil {
		a.Media.Reveal(p)
	}
}

// dragPath is the file a drag of this card offers: the file itself when it
// is on this Mac, else its copy once fetched; "" while there is none.
func (a *App) dragPath(ref protocol.MediaRef) string {
	if p := a.fileOnMac(ref); p != "" {
		return p
	}
	if cp := a.med().copies[ref.ID]; cp != nil && !cp.loading && cp.path != "" {
		if _, err := os.Stat(cp.path); err == nil {
			return cp.path
		}
		delete(a.med().copies, ref.ID)
	}
	return ""
}

// prepareDrag fetches the file's copy for a drag, once (the pointer over
// the card); a file over the home's cap is never fetched for it.
func (a *App) prepareDrag(ref protocol.MediaRef) {
	m := a.med()
	if a.Media == nil || ref.ID == "" || ref.Bytes > protocol.MediaFileMax || m.copies[ref.ID] != nil || a.fileOnMac(ref) != "" {
		return
	}
	if m.copies == nil {
		m.copies = map[string]*fileCopy{}
	}
	cp := &fileCopy{loading: true}
	m.copies[ref.ID] = cp
	home := a.Media.Home()
	name := filepath.Base(fileSaveName(ref))
	var path string
	a.later(func() {
		data, err := home.Fetch(context.Background(), ref.Path())
		if err != nil {
			return
		}
		dir, err := os.MkdirTemp("", "ducter-file-")
		if err != nil {
			return
		}
		p := filepath.Join(dir, name)
		if os.WriteFile(p, data, 0o600) == nil {
			path = p
		}
	}, func() {
		cp.loading, cp.path = false, path
		if path == "" {
			delete(m.copies, ref.ID) // the next hover tries again
		}
	})
}

// fileDrag makes e drag the file out (D578): the copy is fetched once the
// pointer is over e, and the drag offers it as a file, so Finder (or Mail,
// or a folder in another app) gets the file itself under the task's name.
func (a *App) fileDrag(e ui.Element, ref protocol.MediaRef) {
	if e.Hovered() {
		a.prepareDrag(ref)
	}
	p := a.dragPath(ref)
	if p == "" {
		return
	}
	e.DragDataFrom(func() transfer.Data {
		d, _ := transfer.FileData(p)
		return d
	})
}

// fileMenu is a file card's right-click menu: Open, Save a copy and, when
// the file is on this Mac, Show in Finder.
func (a *App) fileMenu(c *ui.Context, card ui.Element, ref protocol.MediaRef) {
	a.contextMenu(c, card, func(m *ui.Menu) {
		if m.Item(a.L.T("media.open")).Chosen() {
			a.OpenFile(ref, card.Bounds())
		}
		if m.Item(a.L.T("file.save")).Chosen() {
			a.saveFileCopy(ref)
		}
		if a.fileOnMac(ref) != "" && m.Item(a.L.T("file.reveal")).Chosen() {
			a.revealFile(ref)
		}
	})
}
