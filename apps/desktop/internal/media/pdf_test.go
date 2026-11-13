//go:build darwin

package media

import (
	"fmt"
	"strings"
	"testing"
)

// tinyPDF is a two-page PDF: a black bar across the top of page one (A4),
// and page two turned a quarter (Letter).
func tinyPDF() []byte {
	objs := []string{
		"<< /Type /Catalog /Pages 2 0 R >>",
		"<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>",
		"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R >>",
		"",
		"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Rotate 90 /Contents 4 0 R >>",
	}
	stream := "0 0 0 rg 0 742 595 100 re f"
	objs[3] = fmt.Sprintf("<< /Length %d >>\nstream\n%s\nendstream", len(stream), stream)
	var b strings.Builder
	b.WriteString("%PDF-1.4\n")
	offs := make([]int, len(objs))
	for i, o := range objs {
		offs[i] = b.Len()
		fmt.Fprintf(&b, "%d 0 obj\n%s\nendobj\n", i+1, o)
	}
	x := b.Len()
	fmt.Fprintf(&b, "xref\n0 %d\n0000000000 65535 f \n", len(objs)+1)
	for _, o := range offs {
		fmt.Fprintf(&b, "%010d 00000 n \n", o)
	}
	fmt.Fprintf(&b, "trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n", len(objs)+1, x)
	return []byte(b.String())
}

// D242: the Mac draws a PDF's pages itself (Core Graphics through purego).
func TestPDFPages(t *testing.T) {
	p, err := OpenPDF(tinyPDF())
	if err != nil {
		t.Fatal(err)
	}
	defer p.Close()
	if p.Pages() != 2 {
		t.Fatalf("pages = %d", p.Pages())
	}
	if w, h := p.Size(1); w != 595 || h != 842 {
		t.Errorf("page 1 = %v×%v", w, h)
	}
	if w, h := p.Size(2); w != 792 || h != 612 {
		t.Errorf("page 2, turned = %v×%v", w, h)
	}
	img, err := p.Render(1, 300)
	if err != nil {
		t.Fatal(err)
	}
	if b := img.Bounds(); b.Dx() != 300 || b.Dy() != 425 {
		t.Fatalf("bitmap %v", b)
	}
	// The bar is at the top (rows run top down), the rest is white paper.
	if c := img.RGBAAt(150, 10); c.R > 40 || c.A != 255 {
		t.Errorf("top = %v, want black", c)
	}
	if c := img.RGBAAt(150, 300); c.R < 250 || c.G < 250 || c.B < 250 {
		t.Errorf("middle = %v, want white", c)
	}
	if _, err := OpenPDF([]byte("not a pdf")); err == nil {
		t.Error("a non-PDF opened")
	}
}
