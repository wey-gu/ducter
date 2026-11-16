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

// PickFiles (D259): the panel offers every file, pictures among them; a
// picture is made ready on the Mac, anything else goes as it is.
func (h mediaHands) PickFiles(title string) ([]string, error) {
	return mygo.Dialog.Open(mygo.OpenDialogOptions{Parent: h.win, Title: title, Message: title, Multiple: true})
}

func (h mediaHands) PastedImage() ([]byte, string, bool) {
	if b, err := mygo.Clipboard.ReadFormat(transfer.PNG); err == nil && len(b) > 0 {
		return b, "Pasted.png", true
	}
	return nil, "", false
}

// PastedFiles are files copied in Finder, any kind (D259); folders stay out.
func (h mediaHands) PastedFiles() []string {
	files, err := mygo.Clipboard.ReadFiles()
	if err != nil {
		return nil
	}
	var out []string
	for _, f := range files {
		if st, err := os.Stat(f); err == nil && !st.IsDir() {
			out = append(out, f)
		}
	}
	return out
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

// OpenLocal (D239): a kind Ducter can't show (a PDF, a deck) opens in its
// Mac app from a copy in this user's own temporary folder (0700, the file
// 0600), never from the home's address in a browser. The copy is named as
// the task named it, so Preview's title says it.
func (h mediaHands) OpenLocal(name string, data []byte) error {
	dir, err := os.MkdirTemp("", "ducter-file-")
	if err != nil {
		return err
	}
	p := filepath.Join(dir, filepath.Base(name))
	if err := os.WriteFile(p, data, 0o600); err != nil {
		return err
	}
	return mygo.Shell.OpenPath(p)
}
