package views

import (
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D541: a partner switch against a live home over a slow link, timed on the
// wall clock: from the click to the first frame that draws the other
// partner's conversation, and to settled (its welcome in and the link quiet
// for 400 ms). Each switch also says the slowest frame it drew. With
// DUCTER_SHOTS_DIR, a frame strip of one switch to a partner seen before and
// one to a partner never shown (6 frames, 16 ms apart, 1150, light, motion on).
//
//	DUCTER_PORT=8641 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh bun apps/web/demo-d541.ts
//	LISTEN=8642 TARGET=8641 LAG=120 bun lag.ts
//	DUCTER_D541_URL=ws://127.0.0.1:8642/ws DUCTER_D541_LABEL=after DUCTER_SHOTS_DIR=<repo>/.shots/partner-switch \
//	  go test ./internal/views -run D541Live -v
func TestD541Live(t *testing.T) {
	url := os.Getenv("DUCTER_D541_URL")
	if url == "" {
		t.Skip("DUCTER_D541_URL not set")
	}
	label := os.Getenv("DUCTER_D541_LABEL")
	h := dial(t, url, i18n.ZH)
	h.wait = 30 * time.Second
	h.until("welcome", func() bool { return h.app.S.Welcomed && len(h.app.S.Partners) >= 4 && len(h.app.S.Channel) > 0 })
	h.app.LocaleFixed, h.app.L = true, i18n.New(i18n.ZH)
	h.app.Local.SetAppearance("light")
	h.tt = ui.NewTesterWith(h.app.View, 1150, 900, ui.TesterOptions{})
	h.tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	quiet(h, 600*time.Millisecond)
	t.Logf("held aside after connect: %d, peeks asked %d, status %v, frames %v", len(h.app.sw.kept), len(h.app.sw.peeked), h.app.Status, h.got)
	ids := []string{}
	for _, p := range h.app.S.Partners {
		ids = append(ids, p.ID)
	}
	var lines []string
	dir := os.Getenv("DUCTER_SHOTS_DIR")
	// Every partner once (the first visits), then round again (seen before).
	order := append(append([]string{}, ids[1:]...), ids...)
	for n, id := range order {
		visited := n >= len(ids)-1
		strip := ""
		if dir != "" && (n == 0 || n == len(order)-1) {
			strip = fmt.Sprintf("mac-%s-switch-%s-1150-zh-light", label, map[bool]string{true: "seen", false: "first"}[visited])
		}
		m := timeSwitch(t, h, id, strip)
		name := id
		if p := h.app.partnerByID(id); p != nil {
			name = p.Name
		}
		line := fmt.Sprintf("%-6s %-4s visited=%-5v first=%4dms settled=%4dms slowest-frame=%3dms frames-blank=%d events=%d", label, name, visited, m.first.Milliseconds(), m.settled.Milliseconds(), m.slowest.Milliseconds(), m.blank, m.events)
		t.Log(line)
		lines = append(lines, line)
	}
	if dir != "" {
		_ = os.WriteFile(filepath.Join(dir, "mac-"+label+"-timings.txt"), []byte(strings.Join(lines, "\n")+"\n"), 0o644)
	}
}

type switchTimes struct {
	first, settled, slowest time.Duration
	blank, events           int
}

// quiet applies frames until none came for d.
func quiet(h *liveHarness, d time.Duration) time.Time {
	last := time.Now()
	for time.Since(last) < d {
		if h.pump != nil {
			h.pump()
		}
		select {
		case f := <-h.frames:
			h.receive(f)
			last = time.Now()
		case <-time.After(16 * time.Millisecond):
			h.tt.Advance(16 * time.Millisecond)
		}
	}
	return last
}

// timeSwitch clicks a partner and draws a frame every 16 ms as a display
// would, applying what the link brought in between.
func timeSwitch(t *testing.T, h *liveHarness, id, strip string) switchTimes {
	t.Helper()
	var m switchTimes
	var frames []image.Image
	start := time.Now()
	h.app.SwitchPartner(id)
	welcomed := false
	lastFrame := start
	for i := 0; ; i++ {
		// What arrived since the last frame.
		if h.pump != nil {
			h.pump()
		}
		got := false
		for drained := false; !drained; {
			select {
			case f := <-h.frames:
				h.receive(f)
				got = true
				lastFrame = time.Now()
				if os.Getenv("DUCTER_D541_TRACE") != "" {
					t.Logf("  +%4dms %s (%d events)", time.Since(start).Milliseconds(), f.T, len(f.Events))
				}
				if f.T == "welcome" && f.Persona == id {
					welcomed = true
				}
				if f.T == "events" && welcomed {
					m.events += len(f.Events)
				}
			default:
				drained = true
			}
		}
		at := time.Now()
		h.tt.Advance(16 * time.Millisecond)
		if got || i == 0 || (strip != "" && len(frames) < 6) {
			h.tt.Frame() // the app draws again after what it applied, as main.go's Update does
		}
		took := time.Since(at)
		if took > m.slowest {
			m.slowest = took
		}
		shows := h.app.S.Persona == id && len(h.app.rows()) > 0
		if m.first == 0 {
			if shows {
				m.first = time.Since(start)
			} else {
				m.blank++
			}
		}
		if strip != "" && len(frames) < 6 {
			frames = append(frames, h.tt.Image())
		}
		if m.first > 0 && welcomed && time.Since(lastFrame) > 400*time.Millisecond && len(frames) >= 6 || time.Since(start) > 20*time.Second {
			break
		}
		if wait := 16*time.Millisecond - time.Since(at); wait > 0 {
			time.Sleep(wait)
		}
	}
	m.settled = lastFrame.Sub(start)
	if strip != "" {
		writeStrip(t, strip, frames)
	}
	return m
}

// writeStrip puts frames side by side at half size, each with its time.
func writeStrip(t *testing.T, name string, frames []image.Image) {
	t.Helper()
	if len(frames) == 0 {
		return
	}
	b := frames[0].Bounds()
	w, hgt := b.Dx()/2, b.Dy()/2
	gap := 8
	out := image.NewRGBA(image.Rect(0, 0, len(frames)*(w+gap)-gap, hgt))
	draw.Draw(out, out.Bounds(), &image.Uniform{color.RGBA{40, 36, 32, 255}}, image.Point{}, draw.Src)
	for i, f := range frames {
		x0 := i * (w + gap)
		for y := 0; y < hgt; y++ {
			for x := 0; x < w; x++ {
				var r, g, bl, a uint32
				for _, d := range [4][2]int{{0, 0}, {1, 0}, {0, 1}, {1, 1}} {
					cr, cg, cb, ca := f.At(b.Min.X+2*x+d[0], b.Min.Y+2*y+d[1]).RGBA()
					r, g, bl, a = r+cr, g+cg, bl+cb, a+ca
				}
				out.Set(x0+x, y, color.RGBA64{uint16(r / 4), uint16(g / 4), uint16(bl / 4), uint16(a / 4)})
			}
		}
		d302WriteImage(t, frames[i], fmt.Sprintf("%s-f%d-%02dms", name, i, i*16))
	}
	d302WriteImage(t, out, name+"-strip")
}

func d302WriteImage(t *testing.T, img image.Image, name string) {
	t.Helper()
	f, err := os.Create(filepath.Join(shotsDir(t), name+".png"))
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if err := png.Encode(f, img); err != nil {
		t.Fatal(err)
	}
}

var _ = protocol.DefaultPartner
