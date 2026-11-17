package theme

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// D314: the Mac's brand marks are the web's, byte for byte, and every one parses.
func TestBrandMarksMatchTheWeb(t *testing.T) {
	web, err := filepath.Glob("../../../web/src/brand/*.svg")
	if err != nil || len(web) == 0 {
		t.Fatalf("no web brand marks: %v", err)
	}
	if n := len(BrandSVGs()); n != len(web) {
		t.Fatalf("the Mac has %d marks, the web %d", n, len(web))
	}
	for _, f := range web {
		n := filepath.Base(f)
		want, _ := os.ReadFile(f)
		if !bytes.Equal(BrandSVG(n), want) {
			t.Errorf("%s differs from the web's: cp apps/web/src/brand/%s apps/desktop/internal/theme/art/brand/", n, n)
		}
		if Brand(strings.TrimSuffix(n, ".svg")) == nil {
			t.Errorf("%s does not parse", n)
		}
	}
	if Brand("nowledge_mem") == nil {
		t.Error("no Nowledge Mem icon")
	}
}
