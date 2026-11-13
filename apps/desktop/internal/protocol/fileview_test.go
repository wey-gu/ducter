package protocol

import (
	"reflect"
	"strconv"
	"strings"
	"testing"
	"time"
)

// D241: find, as the web finds (apps/web/test/fileview-find.test.ts).
func TestFindAll(t *testing.T) {
	cases := []struct {
		text, q string
		want    [][2]int
	}{
		{"Ref ref REF", "ref", [][2]int{{0, 3}, {4, 7}, {8, 11}}},
		{"钥匙只能取这一个文件；钥匙不会过期", "钥匙", [][2]int{{0, 6}, {33, 39}}},
		{"aaaa", "aa", [][2]int{{0, 2}, {2, 4}}},
		{"anything", "", nil},
	}
	for _, c := range cases {
		if got := FindAll(c.text, c.q, FindMax); !reflect.DeepEqual(got, c.want) {
			t.Errorf("FindAll(%q, %q) = %v, want %v", c.text, c.q, got, c.want)
		}
	}
	if n := len(FindAll(strings.Repeat("x", 2*FindMax), "x", FindMax)); n != FindMax {
		t.Errorf("bounded: %d", n)
	}
}

// D241: a key says when it ends; a fresh key outranks the ref's.
func TestMediaKeys(t *testing.T) {
	end := time.Date(2026, 11, 14, 12, 0, 0, 0, time.UTC)
	k := strconv.FormatInt(end.Unix(), 36) + ".abcdefghijklmnopqrstuv"
	if got, ok := KeyExpires(k); !ok || !got.Equal(end) {
		t.Errorf("KeyExpires = %v %v", got, ok)
	}
	if KeyStale(k, end.Add(-2*time.Minute)) || !KeyStale(k, end.Add(-30*time.Second)) {
		t.Error("stale at the wrong time")
	}
	if _, ok := KeyExpires("abcdefghijklmnopqrstuv"); ok {
		t.Error("a pre-D241 key named a time")
	}
	id := strings.Repeat("d0", 32)
	defer freshKeys.Delete(id)
	if p := (MediaRef{ID: id, K: "old"}).Path(); p != "media/"+id+"?k=old" {
		t.Errorf("path %q", p)
	}
	SetFreshKeys(map[string]string{id: k})
	if p := (MediaRef{ID: id, K: "old"}).Path(); p != "media/"+id+"?k="+k || MediaID(p) != id {
		t.Errorf("fresh path %q", p)
	}
}

// D239: the same viewer per kind as the web (packages/protocol/test/fileview.test.ts).
func TestFileView(t *testing.T) {
	for _, c := range []struct{ typ, name, want string }{
		{"text/markdown", "investigation.md", FileMarkdown},
		{"text/csv", "sales.csv", FileTable},
		{"text/plain", "runs.tsv", FileTable},
		{"text/plain", "fix.ts", FileText},
		{"application/json", "plan.json", FileText},
		{"text/html", "report.html", FileText},
		{"image/svg+xml", "logo.svg", FilePicture},
		{"video/mp4", "demo.mp4", FileVideo},
		{"application/pdf", "album.pdf", FilePDF},
	} {
		if got := (MediaRef{Type: c.typ, Name: c.name}).FileView(); got != c.want {
			t.Errorf("%s: %s, want %s", c.name, got, c.want)
		}
	}
	all := []byte("第一行\n第二行\n第三行很长")
	if s, cut := ViewText(all[:13], int64(len(all))); s != "第一行" || !cut {
		t.Errorf("cut: %q %v", s, cut)
	}
	if s, cut := ViewText([]byte("\xef\xbb\xbfa\r\nb"), 7); s != "a\nb" || cut {
		t.Errorf("whole: %q %v", s, cut)
	}
	rows, more := ParseTable("name,note\n\"Wang, Lei\",\"said \"\"yes\"\"\nthen left\"\n", ',', 10)
	if !reflect.DeepEqual(rows, [][]string{{"name", "note"}, {"Wang, Lei", "said \"yes\"\nthen left"}}) || more {
		t.Errorf("csv: %q %v", rows, more)
	}
	if rows, more := ParseTable("a\nb\nc\nd", ',', 2); len(rows) != 2 || !more {
		t.Errorf("cap: %q %v", rows, more)
	}
}
