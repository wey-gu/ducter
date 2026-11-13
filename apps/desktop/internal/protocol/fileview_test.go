package protocol

import (
	"reflect"
	"testing"
)

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
		{"application/pdf", "album.pdf", FileNone},
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
