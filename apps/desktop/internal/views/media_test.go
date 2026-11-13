package views

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"image"
	"image/color"
	"image/draw"
	"image/jpeg"
	"image/png"
	"io"
	"math"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"
	xdraw "golang.org/x/image/draw"
	"golang.org/x/image/font"
	"golang.org/x/image/font/basicfont"
	"golang.org/x/image/math/fixed"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/media"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// ---------- a fake home for pictures ----------

type fakeHome struct {
	mu     sync.Mutex
	srv    *httptest.Server
	files  map[string][]byte
	fail   bool
	copied [][]byte
	saved  []string
	opened []string
	paste  []byte
}

func newFakeHome(t *testing.T) *fakeHome {
	h := &fakeHome{files: map[string][]byte{}}
	h.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h.mu.Lock()
		defer h.mu.Unlock()
		if r.Method == http.MethodPost && r.URL.Path == "/api/media" {
			if h.fail {
				w.WriteHeader(http.StatusBadGateway)
				return
			}
			r.ParseMultipartForm(64 << 20)
			f, _, err := r.FormFile("file")
			if err != nil {
				w.WriteHeader(400)
				return
			}
			b, _ := io.ReadAll(f)
			json.NewEncoder(w).Encode(map[string]any{"media": h.put(b, r.FormValue("preview"), r.FormValue("name"))})
			return
		}
		id := strings.TrimPrefix(r.URL.Path, "/media/")
		if b, ok := h.files[id]; ok {
			w.Write(b)
			return
		}
		w.WriteHeader(404)
	}))
	t.Cleanup(h.srv.Close)
	return h
}

// put keeps bytes as the home does and returns their ref.
func (h *fakeHome) put(b []byte, preview, name string) protocol.MediaRef {
	sum := sha256.Sum256(b)
	id := hex.EncodeToString(sum[:])
	h.files[id] = b
	cfg, format, _ := image.DecodeConfig(bytes.NewReader(b))
	typ := "image/" + format
	if format == "" {
		typ = "application/pdf"
	}
	return protocol.MediaRef{ID: id, Type: typ, Bytes: int64(len(b)), W: cfg.Width, H: cfg.Height, K: "k" + id[:6], Preview: preview, Name: name}
}

// ref makes a ref the way a report or the partner's relay carries one.
func (h *fakeHome) ref(t *testing.T, img image.Image, from string) protocol.MediaRef {
	t.Helper()
	p, err := media.Prepare(pngBytes(img))
	if err != nil {
		t.Fatal(err)
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	r := h.put(p.Full, p.Preview, "")
	if p.Thumb != nil {
		th := h.put(p.Thumb, "", "")
		r.Thumb = &protocol.MediaKey{ID: th.ID, K: th.K}
	}
	if from != "" {
		r.From = &protocol.MediaFrom{TaskID: from}
	}
	return r
}

func (h *fakeHome) Home() media.Home                    { return media.Home{Base: h.srv.URL + "/"} }
func (h *fakeHome) PickImages(string) ([]string, error) { return nil, nil }
func (h *fakeHome) PastedImage() ([]byte, string, bool) { return h.paste, "Pasted.png", h.paste != nil }
func (h *fakeHome) CopyImage(b []byte) error            { h.copied = append(h.copied, b); return nil }
func (h *fakeHome) Save(n string, _ []byte) (string, error) {
	h.saved = append(h.saved, n)
	return n, nil
}
func (h *fakeHome) OpenLocal(n string, _ []byte) error {
	h.opened = append(h.opened, n)
	return nil
}

// ---------- realistic pictures ----------

func pngBytes(img image.Image) []byte {
	var b bytes.Buffer
	png.Encode(&b, img)
	return b.Bytes()
}

// say writes lines of text at 3× (an iPhone's scale) onto img.
func drawWords(img *image.RGBA, x, y int, col color.Color, lines ...string) {
	for i, l := range lines {
		small := image.NewRGBA(image.Rect(0, 0, len(l)*7+4, 16))
		d := font.Drawer{Dst: small, Src: image.NewUniform(col), Face: basicfont.Face7x13, Dot: fixed.P(2, 12)}
		d.DrawString(l)
		r := image.Rect(x, y+i*54, x+small.Bounds().Dx()*3, y+i*54+48)
		xdraw.NearestNeighbor.Scale(img, r, small, small.Bounds(), draw.Over, nil)
	}
}

func fill(img *image.RGBA, r image.Rectangle, c color.Color) {
	draw.Draw(img, r, image.NewUniform(c), image.Point{}, draw.Src)
}

// phoneShot is an iPhone screenshot of a web app's error, what someone
// sends with "这个报错是什么意思？".
func phoneShot() image.Image {
	img := image.NewRGBA(image.Rect(0, 0, 1179, 2556))
	fill(img, img.Bounds(), color.RGBA{248, 248, 250, 255})
	fill(img, image.Rect(0, 0, 1179, 160), color.RGBA{255, 255, 255, 255})
	drawWords(img, 60, 70, color.Black, "9:41")
	fill(img, image.Rect(0, 160, 1179, 330), color.RGBA{255, 255, 255, 255})
	drawWords(img, 60, 210, color.RGBA{30, 30, 40, 255}, "tinycart.app/checkout")
	fill(img, image.Rect(60, 420, 1119, 860), color.RGBA{253, 236, 236, 255})
	drawWords(img, 110, 470, color.RGBA{180, 30, 40, 255}, "Unhandled Runtime Error", "TypeError: Cannot read", "properties of undefined", "(reading 'map')")
	drawWords(img, 110, 960, color.RGBA{90, 90, 100, 255}, "src/cart/Summary.tsx (42:18)", "", "  40 | const items = cart.lines", "> 42 |   .map(l => l.price)", "  43 |   .reduce(sum, 0)")
	for i := 0; i < 6; i++ {
		fill(img, image.Rect(60, 1500+i*130, 1119-i*90, 1560+i*130), color.RGBA{228, 228, 234, 255})
	}
	fill(img, image.Rect(60, 2300, 1119, 2440), color.RGBA{10, 132, 255, 255})
	drawWords(img, 420, 2345, color.White, "Try again")
	return img
}

// generated is a picture a task drew: a ginger cat asleep on a sunny sill.
func generated() image.Image {
	const W, H = 1024, 1024
	img := image.NewRGBA(image.Rect(0, 0, W, H))
	for y := 0; y < H; y++ {
		for x := 0; x < W; x++ {
			t := float64(y) / H
			c := color.RGBA{uint8(255 - 40*t), uint8(214 - 70*t), uint8(170 - 60*t), 255}
			// the window's light
			if x > 180 && x < 840 && y > 120 && y < 620 {
				c = color.RGBA{uint8(196 + 40*t), uint8(226 - 20*t), 246, 255}
				if (x-510)*(x-510) < 16 || (y-370)*(y-370) < 16 {
					c = color.RGBA{238, 220, 196, 255}
				}
			}
			// the sill
			if y > 620 && y < 680 && x > 120 && x < 900 {
				c = color.RGBA{214, 170, 128, 255}
			}
			// the cat: a curled ginger body and head
			dx, dy := float64(x-470)/230, float64(y-590)/110
			hx, hy := float64(x-660)/95, float64(y-555)/85
			if dx*dx+dy*dy < 1 || hx*hx+hy*hy < 1 {
				c = color.RGBA{232, 132, 58, 255}
				if math.Sin(float64(x)/18) > 0.7 {
					c = color.RGBA{206, 108, 40, 255}
				}
			}
			// ears
			if y > 455 && y < 500 && ((x > 610 && x < 640 && y > 455+(640-x)) || (x > 680 && x < 712 && y > 455+(x-680))) {
				c = color.RGBA{232, 132, 58, 255}
			}
			img.Set(x, y, c)
		}
	}
	return img
}

// photo is a landscape photo stand-in: a sky over hills, in the tones of a day.
func photo(w, h int, hue float64) image.Image {
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			t := float64(y) / float64(h)
			hill := 0.62 + 0.08*math.Sin(float64(x)/float64(w)*6+hue)
			var c color.RGBA
			if t < hill {
				c = color.RGBA{uint8(120 + 100*t + 30*hue), uint8(170 + 60*t), uint8(230 - 40*hue), 255}
			} else {
				c = color.RGBA{uint8(70 + 50*hue), uint8(120 + 40*(1-t)), uint8(60 + 20*hue), 255}
			}
			img.Set(x, y, c)
		}
	}
	return img
}

func jpegBytes(img image.Image) []byte {
	var b bytes.Buffer
	jpeg.Encode(&b, img, &jpeg.Options{Quality: 90})
	return b.Bytes()
}

// ---------- the app ----------

func mediaApp(t *testing.T, lang i18n.Lang) (*App, *[]any, *fakeHome) {
	t.Helper()
	app, sent := iaApp(t, lang)
	app.Status = client.Connected
	app.LocaleFixed = true
	h := newFakeHome(t)
	app.Media = h
	return app, sent, h
}

func mediaTester(app *App, w, h int) *ui.Tester {
	tt := ui.NewTesterWith(app.View, w, h, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	if os.Getenv("DUCTER_MEDIA_SHOTS") != "" {
		tt.SetScale(2)
	}
	tt.Frame()
	tt.Frame()
	return tt
}

// A task's line shows the pictures sent into it and what its report showed;
// the viewer steps through the task's own.
func TestTaskMedia(t *testing.T) {
	app, sent, h := mediaApp(t, i18n.ZH)
	shot, cat := h.ref(t, phoneShot(), ""), h.ref(t, generated(), "t_cat")
	ts := protocol.TaskStream("t_cat")
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
		mev(1, 9*time.Minute, ts, protocol.OriginPartner, protocol.KindTaskOpen, protocol.TaskOpen{TaskID: "t_cat", Title: "画橘猫", Harness: "codex", Place: protocol.Place{Kind: "none"}, Brief: "画一张在窗边晒太阳睡觉的橘猫", Media: []protocol.MediaRef{shot}}),
		mev(2, 8*time.Minute, ts, protocol.OriginTask, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: "t_cat", Role: "user", From: "user", Text: "照这个配色", Media: []protocol.MediaRef{shot}}),
		mev(3, time.Minute, ts, protocol.OriginTask, protocol.KindReport, protocol.Report{TaskID: "t_cat", State: "done", Summary: "画好了：窗边打盹的橘猫。", Media: []protocol.MediaRef{cat}}),
		mev(4, time.Minute, ts, protocol.OriginSystem, protocol.KindTaskState, protocol.TaskState{TaskID: "t_cat", Attention: protocol.Done}),
	}})
	app.OpenTask("t_cat")
	tt := mediaTester(app, 1100, 1000)
	if !strings.Contains(texts(tt), "照这个配色") {
		t.Errorf("the words sent with a picture don't show: %q", texts(tt))
	}
	if items := app.mediaOf("task:t_cat"); len(items) != 2 {
		t.Errorf("task pictures: %d", len(items))
	}
	// A picture into the task goes with its words.
	app.AddPicture("task:t_cat", pngBytes(photo(800, 600, 0.2)), "")
	if !app.SendToTask("t_cat", "") {
		t.Fatal("a picture alone wasn't sent to the task")
	}
	if f, ok := lastFrame[protocol.TaskSend](sent); !ok || len(f.Media) != 1 {
		t.Errorf("task_send: %+v", f)
	}
}

func mev(n int64, ago time.Duration, stream string, origin protocol.Origin, kind string, body any) protocol.LogEvent {
	return protocol.NewEvent(n, time.Now().Add(-ago).UTC().Format(time.RFC3339Nano), "default", stream, origin, kind, body)
}

// A picture added to the composer goes up at once; Send sends its id with
// the words, and with no words at all.
func TestSendPicture(t *testing.T) {
	app, sent, _ := mediaApp(t, i18n.ZH)
	app.AddPicture("conv", pngBytes(phoneShot()), "IMG_2041.PNG")
	x := app.med().trays["conv"][0]
	if !x.ready() || x.prep.H != 2048 {
		t.Fatalf("not up: %+v", x)
	}
	if !app.SendMessage("这个报错是什么意思？") {
		t.Fatal("not sent")
	}
	f, ok := lastFrame[protocol.Send](sent)
	if !ok || f.Text != "这个报错是什么意思？" || len(f.Media) != 1 || f.Media[0] != x.ref.ID {
		t.Errorf("send: %+v", f)
	}
	if len(app.med().trays["conv"]) != 0 {
		t.Errorf("the tray kept the picture")
	}
	app.AddPicture("conv", pngBytes(photo(800, 600, 0.3)), "")
	if !app.SendMessage("") {
		t.Errorf("a picture alone isn't sent")
	}
	if f, _ := lastFrame[protocol.Send](sent); len(f.Media) != 1 || f.Text != "" {
		t.Errorf("picture alone: %+v", f)
	}
	if app.SendMessage("  ") {
		t.Errorf("nothing at all was sent")
	}
	// ⌘V with a picture on the pasteboard goes to the tray.
	app.Media.(*fakeHome).paste = pngBytes(photo(400, 300, 0.1))
	if !app.pasteInto("conv") || len(app.med().trays["conv"]) != 1 {
		t.Errorf("paste didn't add a picture")
	}
}

// A picture that didn't go up keeps the message, words and all, with
// Retry; Retry sends it.
func TestFailedPictureKeepsTheWords(t *testing.T) {
	app, sent, h := mediaApp(t, i18n.ZH)
	h.fail = true
	app.AddPicture("conv", pngBytes(phoneShot()), "")
	app.SendMessage("看下这个")
	if _, ok := lastFrame[protocol.Send](sent); ok {
		t.Fatalf("sent before its picture was up")
	}
	tt := mediaTester(app, 1100, 900)
	all := texts(tt)
	if !strings.Contains(all, "看下这个") || !strings.Contains(all, "没能发送") {
		t.Fatalf("the failed message doesn't show its words and the line: %q", all)
	}
	h.fail = false
	click(t, tt, "重试")
	f, ok := lastFrame[protocol.Send](sent)
	if !ok || f.Text != "看下这个" || len(f.Media) != 1 {
		t.Errorf("retry: %+v %v", f, ok)
	}
}

// Every picture of the conversation, in the viewer: ← and → step through
// them, ⌘C copies, Space and Esc close.
func TestViewerKeys(t *testing.T) {
	app, _, h := mediaApp(t, i18n.EN)
	a, b, c := h.ref(t, photo(1600, 1200, 0.2), ""), h.ref(t, photo(1200, 1600, 0.6), ""), h.ref(t, generated(), "t_cat")
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
		mev(1, 5*time.Minute, "channel", protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: "From the trip", Media: []protocol.MediaRef{a, b}}),
		mev(2, 4*time.Minute, protocol.TaskStream("t_cat"), protocol.OriginPartner, protocol.KindTaskOpen, protocol.TaskOpen{TaskID: "t_cat", Title: "Draw a cat", Harness: "codex", Place: protocol.Place{Kind: "none"}}),
		mev(3, time.Minute, "channel", protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: "Here it is: a ginger cat asleep in the sun.", Media: []protocol.MediaRef{c}}),
	}})
	tt := mediaTester(app, 1100, 900)
	app.OpenViewer("conv", b.ID)
	tt.Frame()
	v := app.med().viewer
	if v == nil || len(v.items) != 3 || v.i != 1 {
		t.Fatalf("viewer: %+v", v)
	}
	tt.Key(0, ui.KeyRight)
	tt.Frame()
	if v.i != 2 || !strings.Contains(texts(tt), "From Draw a cat") {
		t.Errorf("→: %d %q", v.i, texts(tt))
	}
	tt.Key(0, ui.KeyRight) // the last stays
	tt.Frame()
	tt.Key(0, ui.KeyLeft)
	tt.Frame()
	if v.i != 1 {
		t.Errorf("←: %d", v.i)
	}
	tt.Key(ui.Cmd, ui.KeyC)
	tt.Frame()
	if len(h.copied) != 1 {
		t.Errorf("⌘C copied %d", len(h.copied))
	} else if _, err := png.Decode(bytes.NewReader(h.copied[0])); err != nil {
		t.Errorf("⌘C copied no PNG: %v", err)
	}
	tt.Key(0, ui.KeySpace)
	tt.Frame()
	tt.Frame()
	if app.med().viewer != nil {
		t.Errorf("Space didn't close")
	}
	app.OpenViewer("conv", a.ID)
	tt.Frame()
	tt.Key(0, ui.KeyEscape)
	tt.Frame()
	tt.Frame()
	if app.med().viewer != nil {
		t.Errorf("Esc didn't close")
	}
	if app.Route != RouteConversation {
		t.Errorf("Esc also went up a level")
	}
}

// An agent that can't see pictures says so in Who, only when the card
// holds pictures.
func TestNoImagesLine(t *testing.T) {
	app, _, _ := mediaApp(t, i18n.ZH)
	opts := newTaskOptions(i18n.ZH)
	opts.Candidates = append(opts.Candidates, protocol.Candidate{Harness: "deepseek-harness", Reason: protocol.CandidateReason{Kind: "fast"}, NoImages: true})
	app.Receive(opts)
	app.OpenNewTask(nil)
	app.nt.whoOpen = true
	tt := mediaTester(app, 1280, 900)
	if strings.Contains(texts(tt), "无法显示图片") {
		t.Errorf("the line shows with no pictures on the card")
	}
	app.AddPicture("nt", pngBytes(phoneShot()), "")
	app.nt.whoOpen = true
	tt.Frame()
	tt.Frame()
	if !strings.Contains(texts(tt), "无法显示图片") {
		t.Errorf("no 无法显示图片 for DeepSeek Harness: %q", texts(tt))
	}
}

// The grid's tiles are laid out by the shared rules, in points.
func TestGridSize(t *testing.T) {
	w, h := gridSize(protocol.Grid([]protocol.Size{{W: 1179, H: 2556}}), 720)
	if h != mediaMaxH || math.Abs(float64(w)-mediaMaxH/(2556.0/1179)) > 0.5 {
		t.Errorf("a tall screenshot: %v×%v", w, h)
	}
	w, h = gridSize(protocol.Grid([]protocol.Size{{W: 1600, H: 900}}), 720)
	if w != 440 || math.Abs(float64(h)-440*900.0/1600) > 0.5 {
		t.Errorf("a wide photo: %v×%v", w, h)
	}
	w, h = gridSize(protocol.Grid(make([]protocol.Size, 3)), 500)
	if w != 350 || math.Abs(float64(h)-350*2.0/3) > 0.5 {
		t.Errorf("three: %v×%v", w, h)
	}
}

// ---------- shots (D75: outside git) ----------
//
//	DUCTER_MEDIA_SHOTS=../../../../.shots/media/mac go test ./internal/views -run MediaShots
func TestMediaShots(t *testing.T) {
	dir := os.Getenv("DUCTER_MEDIA_SHOTS")
	if dir == "" {
		t.Skip("DUCTER_MEDIA_SHOTS not set")
	}
	os.MkdirAll(dir, 0o755)
	shot := func(tt *ui.Tester, name string) {
		tt.Advance(time.Second)
		tt.Frame()
		f, err := os.Create(filepath.Join(dir, name+".png"))
		if err != nil {
			t.Fatal(err)
		}
		defer f.Close()
		png.Encode(f, tt.Image())
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		l := string(lang)
		zh := lang == i18n.ZH
		pick := func(z, e string) string {
			if zh {
				return z
			}
			return e
		}
		// One picture sent, and the partner's answer.
		app, _, h := mediaApp(t, lang)
		shotRef := h.ref(t, phoneShot(), "")
		app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
			mev(1, 3*time.Minute, "channel", protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: pick("这个报错是什么意思？", "What does this error mean?"), Media: []protocol.MediaRef{shotRef}}),
			mev(2, 2*time.Minute, "channel", protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: pick("结账页的购物车还没加载好就去取 lines 了，所以是 undefined。等购物车到了再算总价就好，要我去改吗？", "The checkout reads the cart's lines before the cart has loaded, so it's undefined. Waiting for the cart before adding up the total fixes it; want me to change it?")}),
		}})
		shot(mediaTester(app, 1000, 1000), "mac-"+l+"-1-one")

		// A grid of 3, and +n (6).
		app, _, h = mediaApp(t, lang)
		var three, six []protocol.MediaRef
		for i := 0; i < 6; i++ {
			r := h.ref(t, photo(1600-i*120, 1100+i*80, float64(i)/5), "")
			if i < 3 {
				three = append(three, r)
			}
			six = append(six, r)
		}
		app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
			mev(1, 9*time.Minute, "channel", protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: pick("周末在箱根拍的", "From the weekend in Hakone"), Media: three}),
			mev(2, 8*time.Minute, "channel", protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: pick("天气真好。要我挑几张做成一个相册吗？", "What a day for it. Want me to pick a few for an album?")}),
			mev(3, time.Minute, "channel", protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: pick("这些都放进去", "Put all of these in"), Media: six}),
		}})
		shot(mediaTester(app, 1000, 1100), "mac-"+l+"-2-grid3-and-plus-n")

		// Upload in progress, and a failed one with Retry.
		app, _, h = mediaApp(t, lang)
		app.AddPicture("conv", jpegBytes(photo(1800, 1200, 0.4)), "")
		app.AddPicture("conv", pngBytes(phoneShot()), "")
		app.med().trays["conv"][1].ref, app.med().trays["conv"][1].progress = nil, 0.42
		app.draft = pick("还有这两张", "These two as well")
		shot(mediaTester(app, 1000, 760), "mac-"+l+"-3-uploading")
		h.fail = true
		app, _, h = mediaApp(t, lang)
		h.fail = true
		app.AddPicture("conv", pngBytes(phoneShot()), "")
		app.SendMessage(pick("帮我看下这个页面为什么是白的", "Why is this page blank?"))
		shot(mediaTester(app, 1000, 760), "mac-"+l+"-4-failed-retry")

		// A task's generated picture in the conversation, a file card, and the viewer.
		app, _, h = mediaApp(t, lang)
		cat := h.ref(t, generated(), "t_cat")
		pdf := h.put([]byte("%PDF-1.7 report"), "", pick("箱根相册.pdf", "Hakone album.pdf"))
		pdf.Bytes, pdf.From = 3_565_158, &protocol.MediaFrom{TaskID: "t_cat"}
		app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
			mev(1, 6*time.Minute, "channel", protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: pick("画一张在窗边晒太阳睡觉的橘猫", "Draw a ginger cat asleep in the sun by a window")}),
			mev(2, 6*time.Minute, "channel", protocol.OriginPartner, protocol.KindAck, protocol.Ack{JobID: "j1", Text: pick("好，我去画，画好了给你看。", "On it: drawing it now; I'll show you when it's done."), ReplyTo: 1}),
			mev(3, 6*time.Minute, protocol.TaskStream("t_cat"), protocol.OriginPartner, protocol.KindTaskOpen, protocol.TaskOpen{TaskID: "t_cat", Title: pick("画橘猫", "Draw a ginger cat"), Harness: "codex", Place: protocol.Place{Kind: "none"}}),
			mev(4, time.Minute, "channel", protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: pick("画好了：窗边打盹的橘猫，还顺手排了一份相册。", "Done: a ginger cat dozing on a sunny sill, and the album laid out too."), ReplyTo: 1, Media: []protocol.MediaRef{cat, pdf}}),
		}})
		tt := mediaTester(app, 1000, 1000)
		shot(tt, "mac-"+l+"-5-generated-and-file")
		app.OpenViewer("conv", cat.ID)
		tt.Frame()
		tt.Frame()
		shot(tt, "mac-"+l+"-6-viewer")
	}
}
