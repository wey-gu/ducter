package protocol

import (
	"encoding/json"
	"math"
	"strings"
	"testing"
)

// The same cases as gridLayout in packages/protocol/src/media.ts.
func TestGridLayout(t *testing.T) {
	near := func(a, b float64) bool { return math.Abs(a-b) < 1e-9 }
	if g := Grid(nil); len(g.Tiles) != 0 {
		t.Errorf("none: %+v", g)
	}
	// One keeps its own shape, clamped to 21:9…1:3; unknown is 4:3.
	for _, c := range []struct {
		s    Size
		want float64
	}{{Size{1290, 2796}, 2796.0 / 1290}, {Size{1600, 900}, 900.0 / 1600}, {Size{400, 2000}, 3}, {Size{3000, 500}, 9.0 / 21}, {Size{}, 0.75}} {
		g := Grid([]Size{c.s})
		if !g.Single || len(g.Tiles) != 1 || !near(g.Aspect, c.want) || !near(g.Tiles[0].H, c.want) {
			t.Errorf("one %v: %+v, want aspect %v", c.s, g, c.want)
		}
	}
	two := Grid(make([]Size, 2))
	if two.Single || !near(two.Aspect, 0.5) || two.Tiles[1].X != 0.5 || two.Tiles[1].W != 0.5 {
		t.Errorf("two: %+v", two)
	}
	three := Grid(make([]Size, 3))
	if !near(three.Aspect, 2.0/3) || !near(three.Tiles[0].W, 2.0/3) || !near(three.Tiles[2].Y, 1.0/3) || !near(three.Tiles[1].H, 1.0/3) {
		t.Errorf("three: %+v", three)
	}
	four := Grid(make([]Size, 4))
	if four.Aspect != 1 || len(four.Tiles) != 4 || four.Tiles[3].More != 0 || four.Tiles[3].X != 0.5 || four.Tiles[3].Y != 0.5 {
		t.Errorf("four: %+v", four)
	}
	six := Grid(make([]Size, 6))
	if len(six.Tiles) != 4 || six.Tiles[3].More != 2 {
		t.Errorf("six: %+v", six)
	}
}

// Frames with media round-trip with the TS names.
func TestMediaFrames(t *testing.T) {
	b, _ := json.Marshal(Send{T: "send", Text: "", ClientID: "c1", Media: []string{"abc"}})
	if string(b) != `{"t":"send","text":"","clientId":"c1","media":["abc"]}` {
		t.Errorf("send: %s", b)
	}
	b, _ = json.Marshal(TaskSend{T: "task_send", TaskID: "t1", Text: "看这个", Media: []string{"abc"}})
	if !strings.Contains(string(b), `"media":["abc"]`) {
		t.Errorf("task_send: %s", b)
	}
	b, _ = json.Marshal(TaskNew{T: "task_new", Words: "w", Media: []string{"abc"}})
	if !strings.Contains(string(b), `"media":["abc"]`) {
		t.Errorf("task_new: %s", b)
	}
	in := `{"text":"","clientId":"c1","media":[{"id":"` + strings.Repeat("a", 64) + `","type":"image/jpeg","bytes":1200,"w":1290,"h":2796,"k":"kk","thumb":{"id":"bb","k":"tk"},"preview":"data:image/jpeg;base64,AA==","from":{"taskId":"t1"}}]}`
	var u UserMsg
	if err := json.Unmarshal([]byte(in), &u); err != nil {
		t.Fatal(err)
	}
	m := u.Media[0]
	if m.W != 1290 || m.Thumb.K != "tk" || m.From.TaskID != "t1" || !m.IsImage() || m.ThumbPath() != "media/bb?k=tk" || m.Path() != "media/"+m.ID+"?k=kk" {
		t.Errorf("ref: %+v", m)
	}
	out, _ := json.Marshal(u)
	if string(out) != in {
		t.Errorf("round trip:\n%s\n%s", out, in)
	}
	var r Report
	json.Unmarshal([]byte(`{"taskId":"t1","state":"done","summary":"s","questions":[],"evidence":[],"media":[{"id":"x","type":"application/pdf","bytes":2048,"name":"report.pdf","k":"k"}]}`), &r)
	if len(r.Media) != 1 || r.Media[0].IsImage() || r.Media[0].Name != "report.pdf" {
		t.Errorf("report: %+v", r)
	}
	var c Candidate
	json.Unmarshal([]byte(`{"harness":"deepseek-harness","reason":{"kind":"fit"},"noImages":true}`), &c)
	if !c.NoImages {
		t.Errorf("noImages: %+v", c)
	}
}

func TestSizeWords(t *testing.T) {
	for n, want := range map[int64]string{512: "512 B", 2048: "2 KB", 840_000: "820 KB", 3_565_158: "3.4 MB", 15 * 1024 * 1024: "15 MB"} {
		if got := SizeWords(n); got != want {
			t.Errorf("%d: %s, want %s", n, got, want)
		}
	}
}
