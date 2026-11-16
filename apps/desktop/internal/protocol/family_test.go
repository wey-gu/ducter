package protocol

import "testing"

// A file card's family, badge and length follow media.ts (D286).
func TestFamily(t *testing.T) {
	for _, c := range []struct {
		m    MediaRef
		want string
	}{
		{MediaRef{Type: "application/pdf", Name: "报告.pdf"}, FamPDF},
		{MediaRef{Type: "text/plain", Name: "media.ts"}, FamCode},
		{MediaRef{Type: "text/markdown", Name: "investigation.md"}, FamText},
		{MediaRef{Type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", Name: "季度计划.docx"}, FamDoc},
		{MediaRef{Type: "text/csv", Name: "eval.csv"}, FamSheet},
		{MediaRef{Type: "application/zip", Name: "logs.zip"}, FamArchive},
		{MediaRef{Type: "audio/mp4", Name: "语音备忘.m4a"}, FamAudio},
		{MediaRef{Type: "video/mp4", Name: "箱根.mp4"}, FamVideo},
		{MediaRef{Type: "application/octet-stream", Name: "blob"}, FamOther},
	} {
		if got := c.m.Family(); got != c.want {
			t.Errorf("%s: %s, want %s", c.m.Name, got, c.want)
		}
	}
	if b := (MediaRef{Type: "text/plain", Name: "media.ts"}).Badge(); b != "TS" {
		t.Errorf("badge %q", b)
	}
	if b := (MediaRef{Type: "application/pdf"}).Badge(); b != "PDF" {
		t.Errorf("badge %q", b)
	}
	if (MediaRef{Type: "audio/mp4", Name: "a.m4a"}).FileView() != FileAudio {
		t.Error("audio view")
	}
	for sec, want := range map[float64]string{7: "0:07", 205: "3:25", 3729: "1:02:09"} {
		if got := DurationWords(sec); got != want {
			t.Errorf("%v: %s, want %s", sec, got, want)
		}
	}
}
