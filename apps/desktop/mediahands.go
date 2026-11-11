package main

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/egoist/mygo"
	"github.com/egoist/mygo/transfer"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/media"
)

// mediaHands is the app's hands for pictures on macOS (D206): the open
// panel, the pasteboard, Downloads, and the home pictures go to and come
// from (the client's target, so a home elsewhere works as this Mac's).
type mediaHands struct {
	win *mygo.Window
	c   *client.Client
}

func (h mediaHands) Home() media.Home {
	url, token := h.c.Target()
	return media.Home{Base: media.HTTPBase(url), Token: token}
}

// pictureExts are what the panel offers and a pasted file may be. HEIC is
// left out: Go can't read it (a photo from the iPhone is sent from there).
var pictureExts = []string{"png", "jpg", "jpeg", "gif", "webp"}

func (h mediaHands) PickImages(title string) ([]string, error) {
	return mygo.Dialog.Open(mygo.OpenDialogOptions{Parent: h.win, Title: title, Message: title, Multiple: true,
		Filters: []mygo.FileFilter{{Name: title, Extensions: pictureExts}}})
}

func (h mediaHands) PastedImage() ([]byte, string, bool) {
	if b, err := mygo.Clipboard.ReadFormat(transfer.PNG); err == nil && len(b) > 0 {
		return b, "Pasted.png", true
	}
	if files, err := mygo.Clipboard.ReadFiles(); err == nil {
		for _, f := range files {
			ext := strings.TrimPrefix(strings.ToLower(filepath.Ext(f)), ".")
			for _, e := range pictureExts {
				if e == ext {
					if b, err := os.ReadFile(f); err == nil {
						return b, filepath.Base(f), true
					}
				}
			}
		}
	}
	return nil, "", false
}

func (h mediaHands) CopyImage(png []byte) error {
	return mygo.Clipboard.Write(transfer.New(transfer.NewItem(transfer.Bytes(transfer.PNG, png))))
}

func (h mediaHands) Save(name string, data []byte) (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(home, "Downloads")
	ext := filepath.Ext(name)
	base := strings.TrimSuffix(name, ext)
	p := filepath.Join(dir, name)
	for i := 2; ; i++ {
		if _, err := os.Stat(p); os.IsNotExist(err) {
			break
		}
		p = filepath.Join(dir, base+" "+strconv.Itoa(i)+ext)
	}
	return p, os.WriteFile(p, data, 0o644)
}

func (h mediaHands) OpenURL(u string) { _ = mygo.Shell.OpenExternal(u) }
