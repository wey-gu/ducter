package views

import (
	"image/png"
	"os"
	"path/filepath"
	"testing"

	"github.com/egoist/mygo/ui"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
)

// D434's pictures for review (D75: outside git): On hand, the conversation's
// header with the set card, the hand-over sheet, and the composer replying to
// the person's own line, zh, light, 1400 wide.
//
//	DUCTER_NOJIAN_SHOTS=<repo>/.shots/no-jian DUCTER_NOJIAN_PREFIX=after-mac go test ./internal/views -run NoJianShots
func TestNoJianShots(t *testing.T) {
	dir := os.Getenv("DUCTER_NOJIAN_SHOTS")
	if dir == "" {
		t.Skip("DUCTER_NOJIAN_SHOTS not set")
	}
	prefix := os.Getenv("DUCTER_NOJIAN_PREFIX")
	if prefix == "" {
		prefix = "after-mac"
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	save := func(tt *ui.Tester, name string) {
		todoFrames(tt, 6)
		f, err := os.Create(filepath.Join(dir, prefix+"-"+name+"-zh-light.png"))
		if err != nil {
			t.Fatal(err)
		}
		if err := png.Encode(f, withLights(tt.Image())); err != nil {
			t.Fatal(err)
		}
		f.Close()
	}
	{
		app, _, tt := todoApp(t, i18n.ZH, 1400, 900)
		app.S.PersonaName = "小鸭"
		app.Receive(pileFrameSubjects(i18n.ZH))
		app.Route = RouteOnHand
		tt.SetScale(2)
		save(tt, "onhand")
	}
	{
		_, _, tt := handApp(t, i18n.ZH, 1400, 900, "")
		tt.SetScale(2)
		save(tt, "sheet")
	}
	{
		app, _, tt := convApp(t, i18n.ZH, 1400, 900, "")
		tt.SetScale(2)
		save(tt, "conversation")
		// The composer replying to the person's own line.
		for _, e := range app.S.Channel {
			if r := app.replyOf(e); r != nil && r.from == "you" {
				app.StartReply(r)
				break
			}
		}
		save(tt, "reply-own")
	}
}
